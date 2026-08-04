# @atlas/desktop

Interface gráfica do Atlas sobre Electron ([ADR-0019](../../docs/06-adr/ADR-0019-desktop-electron-stack.md)) — equivalente desktop de `@atlas/cli`. Abre a Fase 2 do Roadmap.

Este arquivo descreve o **estado atual** e as **regras em vigor**. O histórico fatia a fatia vive nas SPECs (`docs/implementation/specs/`, SPEC-0031 a 0050) e em `CLAUDE-ARCHIVE.md` (versão anterior deste arquivo, congelada — não leia no arranque).

---

## Fronteira dura (Artigo 4 + segurança Electron)

O Core (`@atlas/core`/`@atlas/contracts`) vive **só** no main process (`src/main.ts`, `src/core-bridge.ts`). O renderer (`src/renderer/*.js`) **nunca** importa `packages/*` — fala com o main exclusivamente por IPC:

```
window.atlas.X() → contextBridge → ipcRenderer.invoke('atlas:X') → ipcMain.handle
```

`BrowserWindow` roda com `contextIsolation: true` e `nodeIntegration: false`. O valor `Conversation` **nunca** cruza o IPC — fica na sessão do Context Service dentro do main process.

**Regra de tipos locais:** todo tipo de snapshot (`StatusSnapshot`, `AskSnapshot`, `TurnSnapshot`, `FactSnapshot`, `PersonaOption`, `PersonaDetail`, `PermissionRoots`, `StepLine`…) e todo canal `'atlas:*'` são **locais a este app**, não `@atlas/contracts`. Promoção só com um 2º consumidor real, via ADR (precedente: ADR-0007).

`src/main.ts` é casca fina: ciclo de vida da app, cria a `BrowserWindow`, registra os `ipcMain.handle`, constrói os adapters de diálogo. **Nenhuma lógica de domínio.**

## `src/preload.cjs` é CommonJS — a extensão `.cjs` é obrigatória

O `package.json` do app é `"type": "module"`; um `preload.js` seria interpretado como ESM, mas o preload do Electron usa `require('electron')`. `.cjs` força o formato certo sem `package.json` aninhado. `renderer/renderer.js` não tem esse problema (roda como `<script>` clássico no Chromium, fora da resolução de módulos do Node).

## Execução: `NODE_OPTIONS=--import=tsx electron ./src/main.ts`

Sem `dist/` (ADR-0005 estendido ao Electron). **Não tente as alternativas** — as duas falham, verificadas na prática:

1. `electron --import tsx ./src/main.ts` (forma com espaço) **falha silenciosamente**: o parser de argv do Electron trata `tsx` como o *app path*. Use `--import=tsx` se for por flag.
2. Mesmo com `--import=tsx` como flag do binário, **o hook de resolução do `tsx` não se propaga** ao carregamento do main process — `ERR_MODULE_NOT_FOUND` nos imports `.js`→`.ts` internos dos packages. É particularidade da inicialização do loader do Electron, não bug do `tsx`.

A correção é registrar o hook por **variável de ambiente**, como no script `start` do `package.json`.

## CI

Só a suíte de `apps/desktop/tests` (Vitest, sem Electron) roda em CI — a janela real não é lançada. `pnpm install --frozen-lockfile` baixa o binário do Electron (`allowBuilds: electron: true` em `pnpm-workspace.yaml`).

---

## `src/core-bridge.ts` — a camada testável sem Electron

Análoga a `commands/*.ts` da CLI. Não importa `electron`. Duas famílias:

**Stateless** (sobem o Core via `createAtlas`, operam, e desligam em `finally` a cada chamada):
`resolveStatusSnapshot` · `resolveAskSnapshot` · `resolveMemorySnapshot` · `forgetFact`

**Sessão viva** (Core mantido vivo entre turnos, num `Map<SessionId, { atlas }>` chaveado pela `SessionId` do Context Service):
`openChatSession` · `sendChatTurn` · `closeChatSession`

`sendChatTurn` é a mediação que o ADR-0009 atribui à aplicação: lê a conversa do Context, chama `atlas.cognitive.respond` (puro), grava o histórico de volta e persiste `learned` via `atlas.memory.remember(fact, 'learned')` (só os `created`). Não desliga o Core. Turno que falha **não** derruba a sessão.

Handle desconhecido ou já encerrado ⇒ `Error` estruturado, nunca `TypeError`.

**Persona:** `listPersonas` (síncrono, sem subir o Core) · `selectPersona` · `selectedPersonaId` · `describePersona` · `createPersona` · `updatePersona` · `deletePersona`.
**Permissões:** `selectPermissionRoots` · `selectedPermissionRoots`.

### Estado de módulo, nunca persistido

Seleção de Persona, seleção de permissões e os rastreios de operação em voo são estado de módulo do `core-bridge`, vivos pela sessão da app. Fechar a app volta a `flags > env > defaults` (ADR-0006). **Nenhum estado persistente novo** (Artigo 11) — exceto o arquivo de Personas custom, que é do Persona Service (ADR-0020).

`__resetBridgeStateForTests()` reseta seleção de Persona e de permissões, mas **não fecha sessões vivas** — todo teste que abrir uma sessão via `openChatSession` precisa fechá-la explicitamente (`closeChatSession`, em `finally`/`try`-`finally`), senão o `SessionId` vaza no `Map` de sessões entre casos. É um flake real, só observável sob `--sequence.shuffle` (achado da SPEC-0042, corrigido no teste que o causava; a lacuna do próprio `reset` segue aberta — D15).

### `withSelections` e precedência

Um helper interno aplica Persona + permissões correntes ao `AtlasConfigOverride` das cinco funções que sobem o Core. **O campo explícito do chamador sempre vence.** `permissions` é tratado como **bloco completo** — um override parcial do chamador não recebe merge da seleção corrente.

### Rastreio de operação em voo

Contador `inFlightOperations` (ao lado de `busySessions`, que é por turno de chat). Cobre **toda função que sobe um Core capaz de executar Tools** fora do `Map` de sessões vivas: `resolveAskSnapshot` (turno inteiro) e a **janela de abertura** de `openChatSession`. Marca antes do primeiro `await`, desmarca em `finally`.

`hasInFlightOperation()` (`busySessions.size > 0 || inFlightOperations > 0`) tem, desde a SPEC-0050, **quatro consumidores nominais / cinco chamadas** — nenhum reescreve a condição inline:

- `updatePersona` (SPEC-0039, `:273`) — recusa editar a Persona ativa com operação em voo;
- `selectPermissionRoots` (SPEC-0038, 2 chamadas — checagem original e rechecagem A7 imediatamente antes de aplicar);
- `resolveAskSnapshot` (SPEC-0050) — guarda de entrada, antes do incremento e de qualquer `await`; recusa um `ask` disparado durante outro `ask`, um turno de chat, ou a janela de abertura de `openChatSession`;
- `sendChatTurn` (SPEC-0050) — guarda de entrada, depois de `mustGetChatSession` (erro de estrutura antes de erro de estado) e antes de marcar `busySessions`; a sessão segue viva mesmo numa recusa.

`selectPersona` (`:215`) usa uma condição **parcial**: só `busySessions.size > 0`, inline, sem `inFlightOperations` — não é o 5º consumidor de `hasInFlightOperation()`. Consequência: um `ask` em voo **não** bloqueia a troca de Persona, embora bloqueie a edição da Persona ativa (assimetria pré-existente, registrada, não corrigida — candidato nomeado abaixo).

`openChatSession` **marca** o contador (correção A6 da SPEC-0038), mas não é guardada por ele: segue abrindo sessão mesmo com operação em voo (D5 da SPEC-0050) — o renderer a chama no arranque e após toda troca de Persona/permissões, e transformá-la em ponto de recusa quebraria caminhos automáticos que o usuário não disparou.

**Deliberadamente não rastreadas:** `resolveStatusSnapshot`, `resolveMemorySnapshot`, `forgetFact` — não executam Tools nem são julgadas pelo portão de raízes, e rastreá-las produziria recusa espúria.

A garantia é essa formulação exata — não "toda função que sobe o Core", que o código não sustentaria.

### Persona: `resolveDataDir`, nunca `loadConfig`, para achar o storage

`loadConfig` valida `persona` contra o catálogo; `withSelections` injeta a seleção corrente. Usar `loadConfig` para achar o `dataDir` cria **deadlock circular**: selecionar uma Persona custom faria toda função de Persona lançar `InvalidConfigError`. Use `resolveDataDir`, que resolve só o `dataDir`.

Onde `loadConfig` é inevitável (`activePersonaId`, `createAtlas`), chame sempre com `{ personaIds: personaService.list() }`.

`updatePersona`/`deletePersona` comparam o alvo com a Persona **efetiva** (`selectedPersonaId() ?? loadConfig(...).persona`), não com `selectedPersonaId()` isolado — senão apagar a Persona ativa sem troca prévia pela GUI deixaria a app inutilizável. `deletePersona` sobre a Persona ativa é sempre recusado.

---

## Portas fail-closed (três, distintas de propósito)

Todas satisfazem estruturalmente sua interface sem importar `electron`; `showMessageBox` é injetado (`dialog.showMessageBox` em produção, fake nos testes). Em todas: **só o botão de confirmação resolve `true`**; qualquer outro retorno, `cancelId`, valor inesperado ou rejeição resolve `false`, e nunca lançam.

| Arquivo | Porta | Propósito |
|---|---|---|
| `src/confirm-port.ts` | `ConfirmPort` | Ação **pontual** destrutiva do Runtime (`delete_file`) |
| `src/permission-grant-dialog.ts` | `GrantConfirmPort` | Concessão de **política** de escrita (subárvore, duração de sessão) |
| `src/persona-delete-dialog.ts` | `PersonaDeleteConfirmPort` | Apagar uma Persona custom do disco |

**Não reuse uma pela outra** — o texto do diálogo precisa descrever o que está sendo consentido. Concessão de política ≠ escrita agora.

`selectPermissionRoots` é tudo-ou-nada, nesta ordem: normaliza → recusa `readRoots` vazia ou caminho não absoluto → recusa com operação em voo → pede consentimento por raiz de escrita **nova** → **recheca operação em voo imediatamente antes de aplicar** (o diálogo pode esperar indefinidamente) → aplica e encerra as sessões de chat vivas. Remover raízes e alterar `readRoots` nunca pedem consentimento; só ampliar `writeRoots` é aumento de privilégio.

Em `deletePersona`, as validações (embutida/inexistente/ativa) correm **antes** do diálogo — o usuário nunca é perguntado sobre algo que seria recusado de qualquer forma.

---

## Voz (TTS)

### `src/speech-output.ts` — puro, injetável, sem tipos de navegador

- `createSpeechOutput({ synth, preferredVoiceURI? })` → `speak`/`cancel`/`isAvailable`. Resolvedor **autoritativo** de qual voz do SO usar. Filtra a `localService === true`, seleciona deterministicamente a primeira, carimba o `voiceURI` no enunciado. Sem voz local ⇒ no-op, **nunca** cai numa voz de rede.
- `preferredVoiceURI` é um **provider amostrado a cada `speak`** (molde do `memoryPrompt` da SPEC-0021), não fixado no construtor — trocar de Persona muda a voz sem recriar o objeto.
- `resolveVoiceBackend(...)` decide só a **origem** (`'piper' | 'os' | 'none'`). Cadeia: voz preferida da Persona → default Piper → 1ª voz local do SO → mudo.
- `isPiperOnlyMode` / `piperOnlyPreference` — camada **antes** de `resolveVoiceBackend`, que fica intocada.
- `resolvePersistedVoiceSelection(...)` (SPEC-0043) — classifica uma `Persona.voiceURI` persistida em 4 desfechos exaustivos, composta **sobre** `piperOnlyPreference`: `none` (ausente), `available` (ofertada), `dropped` (descartada por política Piper-only, D6/D12 da SPEC-0041 — substituição anunciada), `retained` (ainda honrada pela política, só não ofertável agora por ambiente — Piper indisponível, modelo ausente, voz do SO desinstalada). Nunca inventa uma `voiceURI`.

### Modo Piper-only

Com `PiperTts.isAvailable()` verdadeiro **e** catálogo não vazio, o `<select>` de Persona lista **só** vozes Piper, e uma `voiceURI` de SO já persistida deixa de ser honrada (com aviso visível ao editar a Persona, desfecho `dropped`). Sem Piper, volta ao modo degradado com as vozes do SO.

**A Web Speech API nunca é removida** (ADR-0021(c)): deixa de ser escolhível, mas segue como rede de segurança interna e invisível em qualquer falha de síntese.

**Residual conhecido, aceito por decisão explícita do usuário:** `isAvailable()` prova presença do **arquivo** do binário + catálogo não vazio, **não** que o binário execute. Binário presente mas inexecutável ⇒ modo Piper-only com "Testar voz" mudo ("🔊 Ouvir" continua falando pelo fallback interno). Nenhuma sonda ativa foi adicionada.

**Preservação de `voiceURI` retida (SPEC-0043):** desfecho `retained` (não ofertável só por ambiente, ainda honrada pela política) aparece no `<select>` como `<option>` extra, selecionada e rotulada "Voz salva (indisponível agora)", aviso ao lado explicando que salvar preserva o valor. "Testar voz" desabilitado sobre ela (nunca ativo-porém-mudo, achado A2 da SPEC-0035).

### `src/piper-tts.ts` — contrato pinado como dado da SPEC

**Um único processo Piper vivo por vez**, iniciado sob demanda e **reusado** entre utterances do mesmo modelo. Trocar de modelo, estourar o timeout (15 s) ou cancelar **encerra e recicla** (`kill` + novo `spawn`). No máximo uma utterance em voo; nova submissão cancela a pendente.

Contrato Piper **v1.2.0**:
- argv `['--model', '<dir>/<id>.onnx', '--config', '<dir>/<id>.onnx.json', '--json-input']` — **array, nunca shell**
- uma linha JSON de stdin por utterance (`{"text":…,"output_file":…}`)
- conclusão reconhecida pela **1ª linha de stdout**, sem parsear conteúdo
- `output_file` **sempre** gerado no main process (`TmpDirProvider()` + `RandomId()`), **nunca** derivado de entrada do renderer

> **Se o binário real divergir de qualquer ponto acima, é mudança de decisão arquitetural: pare e devolva ao `spec-drafter`, nunca faça ajuste ad hoc.**

Descoberta de modelos pelo esquema **real** do `.onnx.json`: `sampleRate` ← `audio.sample_rate` (derivado de `audio.quality` quando ausente: `x_low`/`low`→16000, resto→22050); `language` ← `language.code` → `espeak.voice` → prefixo do `id`; `name` derivado de `dataset`+`audio.quality`+`language`. **Nunca** leia chaves `name`/`sampleRate` de topo — não existem no esquema real. Um modelo só é omitido por par `.onnx`/`.onnx.json` incompleto ou JSON inválido.

Paths resolvidos em 3 níveis: `ATLAS_PIPER_DIR` → `process.resourcesPath/piper` → `apps/desktop/resources/piper` (dev). Binário e modelos **não são versionados**; nenhum download em runtime, nenhuma chamada de rede em nenhum caminho. O `.wav` temporário é artefato efêmero do Output Gateway, fora da política de `readRoots`/`writeRoots` (ADR-0013), removido sempre — inclusive em erro/timeout/cancelamento.

---

## Voz (STT) — entrada, desde a SPEC-0046

Consome o [ADR-0022](../../docs/06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) (Accepted): motor `whisper.cpp` (`whisper-cli` v1.7.6), modelo empacotado `ggml-small-q5_1.bin`, idioma fixado em PT-BR (`-l pt`, sem autodetecção). Push-to-talk, **sem** processo de longa duração — divergência deliberada de `piper-tts.ts` (a transcrição roda uma vez por fala, já precedida de segundos de gravação; sustentar o modelo na RAM pela sessão inteira custaria mais do que a recarga por chamada).

### `src/stt-engine.ts` — espelho estrutural de `piper-tts.ts`

`createSttEngine({ spawn, resolveDir, tmpDirProvider, randomId, now, writeFile, stat, unlink })` → `{ transcribe, isAvailable, describe, cancel }`. Valida a fronteira `{ pcm: ArrayBuffer, sampleRate }`, deriva `durationMs` do buffer, monta o cabeçalho WAV e escreve o `.wav` temporário no main process (nunca a partir de caminho vindo do renderer), invoca o binário por `spawn` injetável com argv em array (nunca shell), aplica o orçamento de timeout, e **sempre** remove o temporário — inclusive em erro/timeout/cancelamento, sem propagar falha de `unlink`. `isAvailable()` = binário presente **e** modelo exato presente (mesma semântica e mesma limitação conhecida de `PiperTts.isAvailable()`: prova presença de arquivo, não que o binário execute). Resolução de recursos em 3 níveis, mesmo padrão do Piper.

Orçamento: gravação até 30 s (imposto no renderer); timeout de transcrição `clamp(20 s + 5 × duração, 20 s, 180 s)`; cancelamento e timeout enviam `SIGTERM`, aguardam 2 s, e escalam a `SIGKILL`. Dez desfechos exaustivos com `reason` pinado, incluindo `invalid-audio` (fronteira malformada) e `audio-too-long`/`io-failed`.

### `src/media-permission.ts` — permissão de microfone, fail-closed

Não importa `electron`. Decide a política para `session.defaultSession.setPermissionRequestHandler`/`setPermissionCheckHandler` (fiados em `main.ts`, casca fina): **nega tudo** por padrão, concede `'media'` só com pedido de áudio **e** a janela de captura explicitamente aberta. A janela é controlada por `createCaptureWindow` (`begin`/`end`/`isOpen`), com watchdog de 35 s e **rearme quando `getUserMedia` resolve** (o renderer chama `'atlas:stt:capture:begin'` de novo assim que a promessa resolve, para que o watchdog meça a partir do início real da captura, não do clique). Sem carência entre `end` e o próximo `begin`. Três gatilhos de fechamento cobertos (fim normal, erro, destruição da janela/app).

### Captura no renderer

`ScriptProcessorNode` (`bufferSize` 4096, 1 canal de entrada e 1 de saída) — **não** `AudioWorkletNode`, que exigiria um arquivo de script novo carregado em runtime, fora do padrão sem-bundler do ADR-0019. O nó fica conectado a um `GainNode` de ganho 0 até o `destination` (mantém o grafo puxando amostras sem eco audível). `Float32` acumulado é convertido para `Int16`; o buffer cruza o IPC como `{ pcm: ArrayBuffer, sampleRate }` — `durationMs` é **sempre** derivado no main, nunca aceito do renderer. Cinco canais IPC (`'atlas:stt:available'`/`':transcribe'`/`':cancel'`/`':capture:begin'`/`':capture:end'`), expostos em `window.atlas.stt.*` pelo `preload.cjs`.

Estados de UI: `indisponível` (desabilitado + aviso do motivo, nunca ativo-porém-mudo), `ocioso`, `gravando` (tempo decorrido, teto de 30 s com encerramento automático avisado), `transcrevendo` (botão de microfone desabilitado, mas **"Cancelar" segue visível e habilitado** — `'atlas:stt:cancel'` resolve com `cancelled` e entrada intacta), `erro` (aviso textual por `reason`, entrada intacta). Transcrição bem-sucedida **sempre** é só anexada ao campo de entrada — nunca enviada automaticamente (Artigo 7/13). Integrada à serialização de gestos existente: gravar/transcrever bloqueia e é bloqueado por turno de chat/`ask` em voo. Nenhum áudio ou transcrição é persistido em nenhum caminho.

`apps/desktop/tests/helpers/renderer-harness.ts` ganhou, para cobrir isso sem hardware: um relógio injetável que substitui `setTimeout`/`clearTimeout`/`setInterval`/`clearInterval`/`Date.now` na janela `jsdom` (`fixture.clock.advance(ms)`), e dublês de `navigator.mediaDevices.getUserMedia`/`AudioContext`/`ScriptProcessorNode`/`GainNode`/`MediaStreamAudioSourceNode`/`MediaStreamTrack`, registrados em `RendererCalls`.

**Zero diff em `packages/*`, `apps/cli`, `core-bridge.ts`, `speech-output.ts`, `piper-tts.ts`.** Wake word/escuta contínua segue explicitamente fora de escopo (ADR-0022, candidato futuro com ADR próprio).

---

## Renderer: duplicação deliberada (padrão obrigatório)

`renderer/renderer.js` é `<script>` clássico carregado por `loadFile`, **sem bundler** (ADR-0019) — não pode `import` os módulos TS do app em runtime (diferente de `confirm-port.ts`/`steps-view.ts`/`piper-tts.ts`, consumidos só pelo main process via `tsx`).

Toda lógica de `speech-output.ts`/`piper-tts.ts` que o renderer precisa é por isso **replicada em JS puro**, com comentário explícito apontando a duplicação e o teste de referência. **São 9 réplicas** (funções) **mais a constante `PIPER_VOICE_PREFIX`** (SPECs 0035/0036/0039/0040/0041/0043/0047) — a 9ª é `computeDefaultPiperVoiceURI`, réplica de `resolveDefaultPiperVoiceURI` (`piper-tts.ts`), amarrada ao gate desde a SPEC-0047; desde a SPEC-0048, o comentário acima da função volta a descrever o estado real (aponta `resolveDefaultPiperVoiceURI` e `renderer.speech-parity.test.ts`, sem mais a frase "resíduo sem cobertura automatizada" — resíduo documental da SPEC-0047/D5 fechado; o corpo da função saiu byte-idêntico). A SPEC-0043 é a 2ª vez que uma dessas duplicações **derivou por acidente** (o glue ficou sem `preferredVoiceURI` desde a SPEC-0035 sem que nenhuma fatia seguinte notasse).

> Para qualquer glue futuro do renderer que precise da lógica de um módulo puro: **replique com comentário explícito, nunca tente importar TS direto.**

**Desde a SPEC-0045, a deriva entre as duas cópias é coberta por gate mecânico**, não só por convenção, e **desde a SPEC-0047 o gate deixou de ser específico de `speech-output.ts`**: `apps/desktop/tests/renderer.speech-parity.test.ts` roda, sobre `apps/desktop/tests/helpers/renderer-harness.ts` (jsdom instanciado programaticamente, carregando `index.html`/`renderer.js` do disco, `runScripts: 'outside-only'`, epílogo de teste concatenado — nenhum `export` entra em `src/`), uma tabela de casos única aplicada às duas implementações de cada par, e falha se **qualquer um dos três módulos-fonte vigiados** (`speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`) ganhar um export de valor novo não classificado no registro (nem em `NOT_MIRRORED`, com `moduleSource` e justificativa) — enumerados em runtime via `import * as`, não por lista escrita à mão. O registro tem **10 entradas**, incluindo `resolveDefaultPiperVoiceURI` (`piper-tts.ts`) ↔ `computeDefaultPiperVoiceURI` (`renderer.js`, SPEC-0047), com tabela de seis casos; `PIPER_VOICE_PREFIX` tem origem real em `piper-tts.ts` (não `speech-output.ts`, que só a reimporta) — o registro carrega um campo `moduleSource` para isso e `kind: 'direct' | 'transitive'` para as entradas cobertas via `createSpeechOutput`/`isAvailable()` (`selectVoiceURI`, `selectLocalVoiceURI`), sem exportar os helpers privados. **Limites remanescentes do gate, agora dois**: (i) lógica nova escrita direto no renderer **sem contraparte em TS** segue fora — não há fonte contra a qual comparar; (ii) réplica de um módulo **fora da lista vigiada** (os três nomeados acima) segue protegida só por convenção documentada. `apps/desktop/tests/renderer.boot.test.ts` cobre arranque, `id`s referenciados e a fiação do envio de chat; `apps/desktop/tests/renderer.voice-triggers.test.ts` cobre os dois gatilhos de reavaliação de voz e a política Piper-only no `<select>`. Desde a SPEC-0047, `renderer.persona-crud.test.ts`/`renderer.permissions-panel.test.ts`/`renderer.memory-ask.test.ts`/`renderer.gesture-serialization.test.ts` cobrem os cinco painéis por comportamento observável (IPC registrado + DOM), com o caminho de recusa em pé de igualdade com o de sucesso — ver "Serialização de gestos" abaixo. O achado da SPEC-0047 (`#chat-send` sem `askInFlight` no cálculo de `disabled`) foi corrigido pela SPEC-0048 — ver "Serialização de gestos" abaixo para o estado atual.

### Quirk do `voiceschanged`

No Chromium, `getVoices()` costuma devolver `[]` até o evento assíncrono `voiceschanged` disparar. O catálogo Piper, por sua vez, chega por IPC assíncrono independente. Por isso `refreshSpeakButton` e `populatePersonaVoiceSelect` são reexecutados em **dois gatilhos**: a resposta de `'atlas:tts:voices'` **e** o `voiceschanged`. Nunca resolva disponibilidade de voz point-in-time no load — dá falso-negativo.

Quando não há voz, o botão fica **desabilitado com aviso**, nunca ativo-porém-mudo.

### Serialização de gestos

Um turno por vez. O seletor de Persona e os painéis de permissões/Personas ficam desabilitados enquanto houver turno de chat ou `ask` em voo (`chatTurnInFlight`/`askInFlight`). Desde a SPEC-0048, `#chat-send` entra na mesma condição (`refreshChatControlsForMic()`: `chatTurnInFlight || askInFlight || micBusy()`, origem única do estado do botão — o `.finally` do turno de chat não atribui mais `sendButton.disabled` diretamente), e o manipulador de `submit` de `#chat-form` recusa o gesto (sem chamar `atlas.chat.send`) com `chatTurnInFlight || askInFlight`, independente do atributo `disabled` — cobre submissão implícita/programática do `<form>`. `#chat-input` fica **deliberadamente fora** dessa serialização durante um `ask` (D3 da SPEC-0048): digitar não dispara round-trip contra o Core, e desabilitar o campo roubaria foco/texto em curso.

Desde a SPEC-0049, `#ask-form` entra na mesma serialização, fechando as duas direções residuais que a SPEC-0048 deixou abertas (DoD-d.1/d.2): o botão de submissão ganhou `id="ask-submit"` (era o único controle do painel sem `id`) e uma função `refreshAskControls()` (`disabled = chatTurnInFlight || askInFlight`, chamada por `refreshPermissionsPanelState()`, origem única — nenhum `.finally` atribui `disabled` diretamente); o manipulador de `submit` de `#ask-form` ganhou a mesma guarda de entrada (`if (chatTurnInFlight || askInFlight) return;`, **recusa silenciosa** — D4: não escreve aviso, preserva o `#ask-result` de um round-trip em curso). **Nota de precisão (D4/correção do gate):** a guarda não é redundante ao `disabled` do botão — como `#objective` fica habilitado (D3) e um `<form>` com `<input type="text">` submete por Enter, o caminho implícito **é** o caminho normal aqui (diferente de `#chat-input`, que é desabilitado durante o turno). `#objective` fica **deliberadamente fora** da serialização, mesmo padrão de D3 da SPEC-0048. O manipulador também ganhou `.catch` (entre `.then` e `.finally`), escrevendo `⚠️ <mensagem>` no `#ask-result` — uma falha de `atlas.ask` deixa de virar unhandled rejection silenciosa. A serialização é agora **dupla**, não só do renderer: desde a SPEC-0050, o `core-bridge` também **lê** `hasInFlightOperation()` como guarda de entrada de `resolveAskSnapshot` e `sendChatTurn` (ver "Rastreio de operação em voo" acima) — o mecanismo que antes só era mantido em favor de `updatePersona`/`selectPermissionRoots` passa a recusar as duas próprias funções que o marcam, contra si mesmas e uma contra a outra, antes de subir qualquer Core. As guardas do renderer continuam sendo o caminho normal (o usuário encontra um botão desabilitado, não uma mensagem de erro); a guarda do main process é a rede de segurança para todo caminho que não passa pelo `<form>` (submissão programática, canal IPC exercitado direto, teste de integração). `micBusy()` **não** entra na condição de `#ask-submit` (D5 da SPEC-0049 — a captura de voz alimenta `#chat-input`, não `#objective`) e o `.catch` de "Esquecer" (memória)/`chat.open()` seguem fora (D6 da SPEC-0049), ambos registrados em `NEXT_CONTEXT.md`.

Ao aplicar uma mudança que encerra sessões (Persona, permissões, update da Persona ativa): limpa o transcript, escreve aviso explícito, reabre a sessão e recarrega o status. **Em recusa: aviso de erro, transcript e conversa intactos, listas recarregadas do estado real** — o usuário nunca vê um seletor divergente do Core.

### Painéis

`renderer/index.html` tem: status, seletor + CRUD de Personas, chat (transcript multi-turno com `🔧 <tool> → <outcome>`, `💡 lembrado`, botão "🔊 Ouvir" por resposta), memória (lista + Esquecer por fato), permissões (listas de leitura/escrita + Adicionar/Remover/Aplicar).

CSP inclui `media-src 'self' blob:` (playback do Piper por `Blob`/`<audio>`, buffer completo).

O painel de permissões mostra `config.permissions` (o que o `loadConfig` validou), **não** a política resolvida por `realpath` no `PermissionService`, que pode ser mais restritiva. A divergência erra sempre para o lado restritivo.

---

## Pendência estrutural: smoke visual nunca confirmado

**13 fatias seguidas (SPEC-0031 a 0046) foram fechadas sem confirmação visual/sonora real.** O shell de automação não tem WindowServer (`app.whenReady()` nunca resolve; `screencapture` falha por não haver display); desde a SPEC-0040, soma-se a ausência do binário Piper; desde a SPEC-0046, soma-se a ausência de microfone e do binário `whisper-cli`.

A cadeia de carregamento é validada programaticamente (zero erro de módulo, handlers registrados, `whenReady` sem exceção), mas **nada visual/sonoro foi verificado de fato**. Não bloqueia o fechamento documental — mas não conte como verificado. Lista item a item no Critério de Aceitação 25 da SPEC-0040, ampliada pelas SPECs 0041/0043/0046. **A cobertura automatizada da SPEC-0045 não fecha esta pendência**: um DOM de teste prova lógica e fiação, não pixel nem som — as APIs de voz (saída e, desde a SPEC-0046, também entrada) seguem dubladas, nenhum áudio real é exercitado. Pendente de confirmação humana: captura de microfone real, transcrição real em PT-BR, latência do modelo `small`, o diálogo nativo de permissão do macOS (inclusive o tempo de leitura que motivou o rearme do watchdog em `media-permission.ts`), a negativa do usuário nesse diálogo, e eco com alto-falante aberto.

## Candidatos futuros já nomeados

Equivalente de CLI para Persona (**entregue pela SPEC-0044** — `atlas persona create/edit/delete/list`; `use`/seleção durável segue fora) · persistir Persona ativa e política de permissões entre reinícios (exige ADR) · **wake word / escuta contínua** (STT já entregue pela SPEC-0046; wake word segue exigindo ADR próprio, ADR-0022 a marca como candidato não comprometido) · ditado ao vivo (transcrição incremental) e processo de longa duração para STT, para eliminar a recarga do modelo (locais à porta injetada de `stt-engine.ts`, sem mudança estrutural) · catálogo multi-modelo de STT (`base`/`small`/`medium`), se qualidade/latência do default se mostrarem insuficientes · instalador/empacotamento com `extraResources` para os dois binários + modelos (Fase 3) · streaming incremental de playback · controle de prosódia · exportar/importar Personas · lock/escrita atômica no arquivo de Personas · seletor nativo de diretório · expor a política resolvida · `BrowserWindow` como pai em `dialog.showMessageBox` (tornaria os diálogos modais e eliminaria a origem da corrida tratada em `selectPermissionRoots`) · `__resetBridgeStateForTests()` fechar sessões vivas no próprio reset, em vez de exigir fecho manual em cada teste (SPEC-0042/D15 — toca `src/`, fora de higiene de teste) · quebrar `renderer.js` e `core-bridge.ts` em arquivos menores (SPEC-0042/D8 — a SPEC-0047 elevou de 4 para 8 os arquivos de teste dependentes do harness que lê **um** `renderer.js` do disco, encarecendo esta fatia) · vigiar módulo replicado fora da lista atual do gate de paridade (`confirm-port.ts`/`steps-view.ts`/diálogos/`media-permission.ts`/`core-bridge.ts`, consumidos só pelo main process hoje — eixo residual nomeado pela SPEC-0047/D2) · **cancelamento de um `ask`/turno de chat em voo** (sem ele, um turno que não assenta — Core travado — deixa a app sem gesto de escape até ser reaberta; achado A3 do gate da SPEC-0049, mais relevante desde a SPEC-0050: uma operação travada agora bloqueia também as guardas do main process) · **pinar `micBusy()` fora de `#ask-submit` por teste explícito** (SPEC-0049/D5, hoje só decisão documentada, sem prova mecânica) · **uniformizar `selectPersona` para `hasInFlightOperation()`** em vez de `busySessions.size > 0` inline (D12 da SPEC-0050 — hoje um `ask` em voo não bloqueia a troca de Persona, embora bloqueie a edição da Persona ativa; mudaria comportamento de um caminho de configuração não pedido, merece aferição de UX própria).
