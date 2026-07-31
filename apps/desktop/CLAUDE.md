# @atlas/desktop

Interface gráfica do Atlas sobre Electron ([ADR-0019](../../docs/06-adr/ADR-0019-desktop-electron-stack.md)) — equivalente desktop de `@atlas/cli`. Abre a Fase 2 do Roadmap.

Este arquivo descreve o **estado atual** e as **regras em vigor**. O histórico fatia a fatia vive nas SPECs (`docs/implementation/specs/`, SPEC-0031 a 0041) e em `CLAUDE-ARCHIVE.md` (versão anterior deste arquivo, congelada — não leia no arranque).

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

## Renderer: duplicação deliberada (padrão obrigatório)

`renderer/renderer.js` é `<script>` clássico carregado por `loadFile`, **sem bundler** (ADR-0019) — não pode `import` os módulos TS do app em runtime (diferente de `confirm-port.ts`/`steps-view.ts`/`piper-tts.ts`, consumidos só pelo main process via `tsx`).

Toda lógica de `speech-output.ts` que o renderer precisa é por isso **replicada em JS puro**, com comentário explícito apontando a duplicação e o teste de referência. **Já são 7 ocorrências** (SPECs 0035/0036/0039/0040/0041/0043) — a SPEC-0043 é a 2ª vez que uma dessas duplicações **derivou por acidente** (o glue ficou sem `preferredVoiceURI` desde a SPEC-0035 sem que nenhuma fatia seguinte notasse).

> Para qualquer glue futuro do renderer que precise da lógica de um módulo puro: **replique com comentário explícito, nunca tente importar TS direto.** Risco de deriva conhecido, não coberto por teste automatizado.

### Quirk do `voiceschanged`

No Chromium, `getVoices()` costuma devolver `[]` até o evento assíncrono `voiceschanged` disparar. O catálogo Piper, por sua vez, chega por IPC assíncrono independente. Por isso `refreshSpeakButton` e `populatePersonaVoiceSelect` são reexecutados em **dois gatilhos**: a resposta de `'atlas:tts:voices'` **e** o `voiceschanged`. Nunca resolva disponibilidade de voz point-in-time no load — dá falso-negativo.

Quando não há voz, o botão fica **desabilitado com aviso**, nunca ativo-porém-mudo.

### Serialização de gestos

Um turno por vez. A entrada, o seletor de Persona e os painéis de permissões/Personas ficam desabilitados enquanto houver turno de chat ou `ask` em voo (`chatTurnInFlight`/`askInFlight`). A serialização é do renderer; a garantia testável está no `core-bridge` (`busySessions`/`inFlightOperations`).

Ao aplicar uma mudança que encerra sessões (Persona, permissões, update da Persona ativa): limpa o transcript, escreve aviso explícito, reabre a sessão e recarrega o status. **Em recusa: aviso de erro, transcript e conversa intactos, listas recarregadas do estado real** — o usuário nunca vê um seletor divergente do Core.

### Painéis

`renderer/index.html` tem: status, seletor + CRUD de Personas, chat (transcript multi-turno com `🔧 <tool> → <outcome>`, `💡 lembrado`, botão "🔊 Ouvir" por resposta), memória (lista + Esquecer por fato), permissões (listas de leitura/escrita + Adicionar/Remover/Aplicar).

CSP inclui `media-src 'self' blob:` (playback do Piper por `Blob`/`<audio>`, buffer completo).

O painel de permissões mostra `config.permissions` (o que o `loadConfig` validou), **não** a política resolvida por `realpath` no `PermissionService`, que pode ser mais restritiva. A divergência erra sempre para o lado restritivo.

---

## Pendência estrutural: smoke visual nunca confirmado

**12 fatias seguidas (SPEC-0031 a 0043) foram fechadas sem confirmação visual real.** O shell de automação não tem WindowServer (`app.whenReady()` nunca resolve; `screencapture` falha por não haver display); desde a SPEC-0040, soma-se a ausência do binário Piper.

A cadeia de carregamento é validada programaticamente (zero erro de módulo, handlers registrados, `whenReady` sem exceção), mas **nada visual/sonoro foi verificado de fato**. Não bloqueia o fechamento documental — mas não conte como verificado. Lista item a item no Critério de Aceitação 25 da SPEC-0040, ampliada pelas SPECs 0041/0043.

## Candidatos futuros já nomeados

Equivalente de CLI para Persona (`atlas persona create/edit/delete/list/use`) · persistir Persona ativa e política de permissões entre reinícios (exige ADR) · entrada por voz (STT) e wake word (exige ADR + brainstorming humano) · instalador/empacotamento com `extraResources` (Fase 3) · streaming incremental de playback · controle de prosódia · exportar/importar Personas · lock/escrita atômica no arquivo de Personas · seletor nativo de diretório · expor a política resolvida · `BrowserWindow` como pai em `dialog.showMessageBox` (tornaria os diálogos modais e eliminaria a origem da corrida tratada em `selectPermissionRoots`) · `__resetBridgeStateForTests()` fechar sessões vivas no próprio reset, em vez de exigir fecho manual em cada teste (SPEC-0042/D15 — toca `src/`, fora de higiene de teste) · **cobrir `renderer.js` por teste automatizado** (SPEC-0043 — risco estrutural: 7ª réplica renderer↔módulo, 2ª deriva detectada por acidente; exige mudar a stack do renderer, portanto ADR novo + escalação humana).
