# @atlas/desktop

Interface gráfica do Atlas sobre Electron ([ADR-0019](../../docs/06-adr/ADR-0019-desktop-electron-stack.md)) — equivalente desktop de `@atlas/cli`. Abre a Fase 2 do Roadmap.

Este arquivo descreve o **estado atual** e as **regras em vigor**. O histórico fatia a fatia vive nas SPECs (`docs/implementation/specs/`, SPEC-0031 a 0054) e em `CLAUDE-ARCHIVE.md` (versão anterior deste arquivo, congelada — não leia no arranque).

---

## Fronteira dura (Artigo 4 + segurança Electron)

O Core (`@atlas/core`/`@atlas/contracts`) vive **só** no main process (`src/main.ts`, `src/core-bridge.ts`). O renderer (`src/renderer/*.js`) **nunca** importa `packages/*` — fala com o main exclusivamente por IPC:

```
window.atlas.X() → contextBridge → ipcRenderer.invoke('atlas:X') → ipcMain.handle
```

`BrowserWindow` roda com `contextIsolation: true` e `nodeIntegration: false`. O valor `Conversation` **nunca** cruza o IPC — fica na sessão do Context Service dentro do main process.

**Regra de tipos locais:** todo tipo de snapshot (`StatusSnapshot`, `AskSnapshot`, `TurnSnapshot`, `FactSnapshot`, `PersonaOption`, `PersonaDetail`, `PermissionRoots`, `NetworkAccess`/`NetworkAccessSelection` (SPEC-0059), `StepLine`…) e todo canal `'atlas:*'` são **locais a este app**, não `@atlas/contracts`. Promoção só com um 2º consumidor real, via ADR (precedente: ADR-0007).

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
**Rede/busca (desde a SPEC-0059):** `selectNetworkAccess` · `selectedNetworkAccess` — gesto de aplicação **próprio**, distinto de `selectPermissionRoots` (Decisão D2 da SPEC: eixos independentes, `selectPermissionRoots` sai byte a byte como estava salvo pela guarda do mutex abaixo).

### Estado de módulo, nunca persistido

Seleção de Persona, seleção de permissões e os rastreios de operação em voo são estado de módulo do `core-bridge`, vivos pela sessão da app. Fechar a app volta a `flags > env > defaults` (ADR-0006). **Nenhum estado persistente novo** (Artigo 11) — exceto o arquivo de Personas custom, que é do Persona Service (ADR-0020).

`__resetBridgeStateForTests()` reseta seleção de Persona e de permissões, mas **não fecha sessões vivas** — todo teste que abrir uma sessão via `openChatSession` precisa fechá-la explicitamente (`closeChatSession`, em `finally`/`try`-`finally`), senão o `SessionId` vaza no `Map` de sessões entre casos. É um flake real, só observável sob `--sequence.shuffle` (achado da SPEC-0042, corrigido no teste que o causava; a lacuna do próprio `reset` segue aberta — D15).

### `withSelections`/`composeOverride` e precedência

Desde a SPEC-0059, a regra de composição vive numa origem **única**: `composeOverride(configOverride, { persona?, permissions?, network? })` — helper interno, não exportado — recebe o `AtlasConfigOverride` do chamador e as seleções correntes (ou candidatas, no dry-run abaixo) e devolve o override composto. `withSelections(configOverride)` é só `composeOverride(configOverride, { persona: <corrente>, permissions: <corrente>, network: <corrente> })`; nenhuma outra função do arquivo monta esse objeto à mão. **O campo explícito do chamador sempre vence.** `permissions`/`tools` são tratados como **bloco completo** — um override parcial do chamador não recebe merge da seleção corrente; `permissions` é composto a partir de **duas** seleções independentes (FS ⊕ rede, D2/D9 da SPEC-0059) — só as chaves da(s) seleção(ões) presente(s) entram no objeto, a chave ausente cai no default do `loadConfig`, nunca em `[]` explícito.

### Mutex de aplicação de política (D16 da SPEC-0059)

`selectNetworkAccess` e `selectPermissionRoots` compartilham uma flag de módulo (`policyApplicationInProgress`), marcada antes de qualquer `await` e liberada num `finally` que cobre todos os caminhos de saída das duas funções. `hasInFlightOperation()` **não** enxerga essas duas aplicações (o registro único da SPEC-0051 só conta `'ask'`/`'chat-turn'`/`'open-session'`) — sem o mutex, um diálogo nativo de concessão de um gesto não impediria o usuário de disparar o outro, empilhando dois diálogos de consentimento que descrevem concessões diferentes (Artigo 8). `selectPermissionRoots` ganhou **só** essa guarda — ordem, mensagens, validações, consentimento, rechecagem A7 e encerramento de sessões saem byte a byte como estavam. O renderer replica a mesma exclusão numa camada de conveniência (`policyApplicationInFlight`, `refreshPermissionsPanelState()`): `#permissions-apply`/`#network-apply` ficam adicionalmente desabilitados enquanto qualquer um dos dois `select` está pendente — a garantia real é sempre a do bridge (o canal IPC é alcançável sem passar pelos botões).

### Rastreio de operação em voo

Desde a SPEC-0051, **um único registro** de módulo (`Set<OperationRecord>`) substitui o par `busySessions`/`inFlightOperations`. Cada registro tem `kind: 'ask' | 'chat-turn' | 'open-session'`, `session?` (só em `'chat-turn'`) e `abandoned: boolean`. Alimentado por `resolveAskSnapshot` (`'ask'`), `sendChatTurn` (`'chat-turn'`) e `openChatSession` (`'open-session'`), sempre antes do primeiro `await`, sempre removido no `finally` do trabalho real (não no da promessa devolvida ao chamador quando ela foi abandonada — ver "Gesto de escape" abaixo).

Quatro predicados nomeados são os únicos pontos de decisão — nenhum consumidor reescreve a condição inline:

- **`hasInFlightOperation()`** — registro **não vazio** (**inclui** operações abandonadas). Consumidores: `updatePersona` (SPEC-0039, recusa editar a Persona ativa), `selectPermissionRoots` (SPEC-0038, 2 chamadas — checagem original e rechecagem A7 imediatamente antes de aplicar). Cancelar **não** destrava a aplicação de política de permissões nem a edição da Persona ativa enquanto um Core abandonado ainda estiver vivo — a mesma garantia de segurança de antes, agora expressa sobre o registro único.
- **`hasActiveOperation()`** — existe registro com `abandoned === false` (**ignora** as abandonadas). Consumidores: `resolveAskSnapshot`, `sendChatTurn` (guardas de entrada, SPEC-0050, refinadas pela SPEC-0051 para devolver o direito de conversar assim que o usuário cancela).
- **`hasAbandonedTurnForSession(session)`** — existe registro `'chat-turn'` daquela sessão com `abandoned === true`, ainda não assentado. Consumidores: `sendChatTurn` (quarentena — recusa turno novo **naquela** sessão) e o envelope do `ConfirmPort` daquela sessão (nega tudo, sem abrir diálogo).
- **`hasChatTurnOperation()`** — existe registro `'chat-turn'` (inclui abandonadas). Consumidor: `selectPersona`, condição **parcial** preservada tal e qual (D12 da SPEC-0050 — um `ask` em voo **não** bloqueia a troca de Persona, embora bloqueie a edição da Persona ativa; assimetria registrada, não corrigida, candidato nomeado abaixo).

`openChatSession` **marca** `'open-session'` no registro (correção A6 da SPEC-0038), mas não é cancelável nem guardada por nenhum predicado (D5 da SPEC-0050, intacta): segue abrindo sessão mesmo com operação em voo — o renderer a chama no arranque e após toda troca de Persona/permissões, e transformá-la em ponto de recusa quebraria caminhos automáticos que o usuário não disparou.

**Deliberadamente não rastreadas:** `resolveStatusSnapshot`, `resolveMemorySnapshot`, `forgetFact` — não executam Tools nem são julgadas pelo portão de raízes, e rastreá-las produziria recusa espúria.

`__resetBridgeStateForTests()` limpa o registro único, mantendo o comportamento documentado de **não** fechar sessões vivas (segue aberto — ver abaixo).

A garantia é essa formulação exata — não "toda função que sobe o Core", que o código não sustentaria.

### Gesto de escape: cancelar um `ask`/turno de chat em voo (SPEC-0051)

Um botão "Cancelar" por painel (`#ask-cancel`, `#chat-cancel`), visível/habilitado **apenas** enquanto a operação daquele painel estiver em voo, chama `window.atlas.cancel()` → canal IPC `'atlas:cancel'` → `cancelInFlightOperation()`: função **síncrona**, exportada, que marca `abandoned = true` em toda operação cancelável ainda ativa (`'ask'` e `'chat-turn'`; `'open-session'` nunca é cancelável) e devolve `{ cancelled: boolean }` — `true` sse ao menos uma foi marcada. Idempotente: uma 2ª chamada seguida devolve `{ cancelled: false }`.

**Desistência, não cancelamento real.** O trabalho abandonado **continua rodando** até assentar sozinho — não há `AbortSignal`/cancelamento dentro do Core. O que a garantia cobre: (i) a promessa do gesto **rejeita na hora**, com mensagem pinada (`Pergunta cancelada pelo usuário.` / `Turno cancelado pelo usuário.`); (ii) ao assentar, o resultado é **descartado** (nenhum `remember`, nenhum `updateConversation`; o `shutdown()` do `ask` continua acontecendo); (iii) nenhuma ação destrutiva é aprovada em nome de um turno abandonado; (iv) a sessão afetada não aceita turno novo até ele assentar; (v) o usuário pode perguntar de novo na hora, por `ask` ou por uma conversa nova.

**Contenção do `ConfirmPort`, com o alcance real de cada porta** — a lição central do gate desta SPEC: o alcance de uma porta injetada não é dedutível de onde ela é *usada*, só de onde é *injetada*. No **chat**, a porta é injetada **uma vez em `openChatSession`** e vive pela sessão inteira — o envelope é portanto **por sessão** e **pegajoso**: enquanto `hasAbandonedTurnForSession(session)` for verdadeiro, `request()` resolve `false` **sem** chamar a porta injetada, não importa qual turno originou o pedido. No **`ask`**, o Core é exclusivo da operação, então o envelope é por operação. Em ambos, uma resposta que chegar depois do abandono é descartada e o resultado é `false`.

**Quarentena de sessão.** `sendChatTurn` recusa turno novo na sessão que tem turno abandonado não assentado (mensagem própria), porque nada na documentação sustenta dois `respond` concorrentes no mesmo Core/`SessionId` (invariante 8). A sessão não é fechada — o transcript e a conversa seguem intactos, e ela volta a aceitar turnos assim que o trabalho abandonado assenta.

**Ordem das guardas de `sendChatTurn`:** `mustGetChatSession` → `hasAbandonedTurnForSession(session)` → `hasActiveOperation()`.

**Resíduos honestos, registrados no aviso ao usuário e não escondidos:** uma Tool **não destrutiva** já autorizada pela política vigente (ex.: `write_file` dentro de `writeRoots`) pode concluir depois do cancelamento — só o consentimento é revogável de dentro de `apps/desktop`; e um `dialog.showMessageBox` já aberto no momento do abandono permanece na tela sem efeito ao ser clicado ("diálogo fantasma" — os três diálogos não têm `BrowserWindow` pai). O `.catch` de cada painel escreve, depois da linha de erro, o aviso pinado:

```
⏳ Cancelado: o trabalho já iniciado continua encerrando em segundo plano — ações de arquivo já autorizadas ainda podem concluir; até ele assentar, esta conversa não aceita turnos novos e os painéis de configuração podem recusar.
```

Zero cancelamento real dentro do Core — o dono previsto é o Runtime/Task Manager (Module Catalog: "mecanismos de cancelamento e recuperação", estado `cancelled`), hoje não implementado; candidato nomeado abaixo, exige ADR + decisão humana.

### Persona: `resolveDataDir`, nunca `loadConfig`, para achar o storage

`loadConfig` valida `persona` contra o catálogo; `withSelections` injeta a seleção corrente. Usar `loadConfig` para achar o `dataDir` cria **deadlock circular**: selecionar uma Persona custom faria toda função de Persona lançar `InvalidConfigError`. Use `resolveDataDir`, que resolve só o `dataDir`.

Onde `loadConfig` é inevitável (`activePersonaId`, `createAtlas`), chame sempre com `{ personaIds: personaService.list() }`.

`updatePersona`/`deletePersona` comparam o alvo com a Persona **efetiva** (`selectedPersonaId() ?? loadConfig(...).persona`), não com `selectedPersonaId()` isolado — senão apagar a Persona ativa sem troca prévia pela GUI deixaria a app inutilizável. `deletePersona` sobre a Persona ativa é sempre recusado.

---

## Portas fail-closed (quatro, distintas de propósito)

Todas satisfazem estruturalmente sua interface sem importar `electron`; `showMessageBox` é injetado (`dialog.showMessageBox` em produção, fake nos testes). Em todas: **só o botão de confirmação resolve `true`**; qualquer outro retorno, `cancelId`, valor inesperado ou rejeição resolve `false`, e nunca lançam.

| Arquivo | Porta | Propósito |
|---|---|---|
| `src/confirm-port.ts` | `ConfirmPort` | Ação **pontual** destrutiva do Runtime (`delete_file`) |
| `src/permission-grant-dialog.ts` | `GrantConfirmPort` | Concessão de **política** de escrita (subárvore, duração de sessão) |
| `src/persona-delete-dialog.ts` | `PersonaDeleteConfirmPort` | Apagar uma Persona custom do disco |
| `src/network-grant-dialog.ts` | `NetworkGrantConfirmPort` | Concessão de **política** de rede (host exato, sem subdomínios, duração de sessão — SPEC-0059) |

**Não reuse uma pela outra** — o texto do diálogo precisa descrever o que está sendo consentido. Concessão de política ≠ escrita agora. O texto de `network-grant-dialog.ts` declara explicitamente que a concessão vale para **qualquer** Tool de rede que alcance aquele host (hoje `http_get`/`web_search`, nomeadas), porque a política do ADR-0026(b) é por host, nunca por Tool (Decisão D18 da SPEC-0059) — um texto desatualizado quando uma 3ª Tool de rede surgir é um residual conhecido, sem gate mecânico que force a atualização.

Desde a SPEC-0055, `ResourceRef` (`@atlas/contracts`) é uma união discriminada por `type` (`'file'|'directory'` com `path`; `'network'` com `host`, ADR-0026) — `src/confirm-port.ts` resolve o rótulo do recurso com um narrowing local de uma expressão (`resource.type === 'network' ? resource.host : resource.path`), sem helper compartilhado (mesmo padrão em `@atlas/runtime`/`apps/cli`). **Desde a SPEC-0059**, o painel dentro de `#panel-permissions` permite configurar `netRoots`/`tools.searchUrl` em runtime (`selectNetworkAccess`, canal IPC `'atlas:network:select'`) — a seleção é **estado de sessão da app**, não persistente (Artigo 11, mesma fronteira de `readRoots`/`writeRoots`): fechar a app volta a `netRoots: []`/`searchUrl: ''` (`flags > env > defaults`). Sem hosts autorizados, `http_get` (e qualquer Tool de rede) continua bloqueado; sem `searchUrl`, `web_search` continua sequer registrada (SPEC-0057/D11).

Desde a SPEC-0051, o `ConfirmPort` injetado em `createAtlas` é **envolvido** por um adaptador do `core-bridge` com alcance igual ao alcance real da porta — **por sessão** no chat (`openChatSession` injeta uma vez, pegajoso enquanto houver turno abandonado não assentado), **por operação** no `ask`. Ver "Gesto de escape" acima. As quatro portas listadas acima **não são tocadas**; o envelope nunca lança, nunca altera o `ActionRequest`, e é transparente enquanto não há abandono.

`selectPermissionRoots` é tudo-ou-nada, nesta ordem (desde a SPEC-0059, precedida pelo mutex de política — ver "Mutex de aplicação de política" acima): mutex → normaliza → recusa `readRoots` vazia ou caminho não absoluto → recusa com operação em voo → pede consentimento por raiz de escrita **nova** → **recheca operação em voo imediatamente antes de aplicar** (o diálogo pode esperar indefinidamente) → aplica e encerra as sessões de chat vivas. Remover raízes e alterar `readRoots` nunca pedem consentimento; só ampliar `writeRoots` é aumento de privilégio.

`selectNetworkAccess` segue a mesma mecânica, num gesto próprio (D2 da SPEC-0059): mutex → normaliza hosts (`trim`/dedup **case-insensitive** preservando a primeira grafia, D6) → **valida por dry-run** em `loadConfig` (candidato composto por `composeOverride`, nunca um literal à mão — D5/D9) → recusa com operação em voo → consentimento por host **novo** (comparado em minúsculas contra a seleção corrente — um host já autorizado em outra caixa não reconfirma) → rechecagem A7 → aplica e encerra as sessões de chat vivas. Remover hosts e alterar `searchUrl` nunca pedem consentimento (D4 — configurar endpoint ≠ conceder rede, SPEC-0057/D9); só host novo é aumento de privilégio.

Em `deletePersona`, as validações (embutida/inexistente/ativa) correm **antes** do diálogo — o usuário nunca é perguntado sobre algo que seria recusado de qualquer forma.

---

## Rede e busca — painel dentro de Permissões (desde a SPEC-0059)

Consome o [ADR-0026](../../docs/06-adr/ADR-0026-network-access-gate.md) sem reabrir nenhuma cláusula (a)–(e); fecha o residual nomeado "painel de rede/busca na GUI" das SPECs 0055/0057. Duas seções novas (Rede/Busca) dentro de `#panel-permissions` (mesmo painel do drawer da SPEC-0053, sem oitavo item), sob *progressive disclosure*: `#net-roots-toggle`→`#net-roots-detail` e `#search-toggle`→`#search-detail`, mais `#network-inforce` (a config **em vigor**, sempre lida do status) e `#network-apply`/`#network-error`.

**Canal IPC novo**: `'atlas:network:select'` (main) ↔ `window.atlas.network.select(access)` (preload/renderer), ao lado de `'atlas:permissions:select'`.

**Escopo de vida**: igual ao de `readRoots`/`writeRoots` — estado de sessão da app, nunca persistido (Artigo 11); fechar a app volta a `netRoots: []`/`searchUrl: ''` (`flags > env > defaults`).

**Rascunho ≠ em vigor (D17, assimetria deliberada com o bloco de FS)**: o bloco de FS recarrega as listas do status em **qualquer** rejeição (SPEC-0038); o de rede **preserva o rascunho** digitado pelo usuário em qualquer rejeição (validação, operação em voo, consentimento recusado) — só `#network-inforce` recarrega do status. `renderer.js` separa por isso duas funções: `loadStatus()` repinta **só** `#network-inforce`, nunca o rascunho; `seedNetworkDraftFromStatus()` semeia o rascunho **apenas** no arranque e depois de um `network.select` bem-sucedido — nenhuma outra chamada de `loadStatus()` (troca de Persona, `refreshPersonaSurfaces`, apply de FS) reseta o rascunho de rede.

**Fronteira do que fica de fora** (D nomeadas na SPEC): nenhum "Testar conexão"/requisição disparada pelo painel; nenhum parsing de `URL` no app (`new URL` proibido nos arquivos tocados, verificado por grep) — `#search-host-warning` é um aviso fixo, nunca deriva do endpoint; configurar `searchUrl` **não** autoriza rede automaticamente (SPEC-0057/D9) e por isso não abre diálogo (D4); toda validação de hostname/URL segue exclusivamente em `loadConfig` — o app só consulta por dry-run antes de aplicar, nunca reimplementa a regra.

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

## Voz — modo hands-free (conversa contínua, desde a SPEC-0052)

Consome o [ADR-0023](../../docs/06-adr/ADR-0023-hands-free-voice-conversation.md) (`Accepted`, novo), que **supersede parcialmente** o [ADR-0022](../../docs/06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) — apenas a cláusula de auto-envio de *Alternativas Consideradas*, apenas dentro do modo hands-free; o resto do ADR-0022 segue intacto. Une STT (SPEC-0046), chat multi-turno (SPEC-0033) e TTS (SPEC-0040) num laço: um toggle único abre o microfone e o mantém aberto entre turnos; o fim de fala é detectado por VAD, não por push-to-talk; a transcrição vai **direto ao Core, sem revisão**; a resposta é falada; o microfone fecha durante o processamento e durante a fala.

### `src/hands-free.ts` — módulo puro, sem `electron` nem globais de navegador

- `nextHandsFreeState(state, event)` — transição pura e exaustiva, **9 estados × 18 eventos**, com "evento não previsto ⇒ estado inalterado" pinado como linha da tabela. Estados: `off`/`arming`/`listening`/`capturing`/`transcribing`/`sending`/`thinking`/`speaking`/`unavailable`.
- `createTurnSegmenter({ speechEnter, speechExit, minSpeechMs, silenceCloseMs, maxUtteranceMs, frameMs })` → `{ push(probability), reset() }` — só vê probabilidades do VAD, nunca frames de áudio nem fila (D19 da SPEC-0052: pre-roll e fila são propriedades do **glue**, resíduo consciente que cai no limite (i) do gate de paridade — sem contraparte TS contra a qual comparar, coberto por CA de efeito observável em vez de paridade).
- `handsFreeMicrophoneOpen(state)` — predicado único da invariante do ADR-0023(e): **falso** em `transcribing`/`sending`/`thinking`/`speaking`.
- `speakingWatchdogMs(text)` — `clamp(8s + 80ms×caracteres, 8s, 120s)`.
- A interface `VoiceActivityDetector` (porta injetável do detector) — ponto de criação único no glue (D21), verificado estaticamente: `ort.`/`InferenceSession.create` só podem aparecer dentro da fábrica.

### `src/vad-resources.ts` — módulo do main process, sem `electron`

`createVadResources({ resolveDir, readFile, stat })` → `{ isAvailable, describe, load }`, mesma semântica/limitação conhecida de `PiperTts.isAvailable()`/`SttEngine.isAvailable()` (prova presença de arquivo, não execução). `load()` devolve `ArrayBuffer`; falha de IO vira desfecho, nunca exceção. Dois canais IPC novos: `'atlas:vad:available'` → `{ available, reason? }`; `'atlas:vad:resources'` → `{ ok: true, ... } | { ok: false, reason }`.

### Detector: Silero VAD v5 sobre `onnxruntime-web` v1.20.1, wasm-only, 1 thread, sem proxy

Pinado como dado da SPEC (D4/D17) — frames de 512 amostras (32 ms), cadência que casa com o `ScriptProcessorNode` de 4096 já em uso (8 frames por callback). **Primeira inferência do projeto rodando no renderer** — exceção explícita e delimitada ao ADR-0022(a)/ADR-0023(d), que deve ser lida sempre junto do ADR, nunca isolada, sob risco de virar precedente para a transcrição migrar. O áudio nunca sai do renderer. Runtime e modelo entram sem `fetch` (bloqueado sob `file://`): **um** `<script>` estático local (`src/renderer/vendor/vad/`, não versionado) para o JS; os binários chegam por `ArrayBuffer` via IPC (`'atlas:vad:resources'`), nunca por download. CSP ganha **exatamente** `'wasm-unsafe-eval'` em `script-src` (comparada por teste como string inteira) — e nada mais é afrouxado; sem Silero, o VAD não é a decisão default nem apenas ponto de checagem, é decisão pinada: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; media-src 'self' blob:'`.

Sem Silero disponível, o toggle fica desabilitado com motivo visível — **fallback de limiar de energia não é implementado nesta fatia** (D8): o ADR-0023 só o autoriza como "fallback natural" se o VAD se mostrar indisponível em uso real, condição hipotética hoje. A porta `VoiceActivityDetector` fica pronta para isso ser local quando/se decidido.

### Habilitação do toggle — reavaliada nos gatilhos assíncronos, nunca point-in-time (D9)

Habilita quando `stt.available() && vad.available() && currentVoiceBackend().backend !== 'none'` (**qualquer** voz de saída, não especificamente o Piper — amputaria o modo degradado das SPECs 0041/0043). Recalculada por `refreshHandsFreeToggle()` em **três** gatilhos: `voiceschanged`, chegada do catálogo Piper, resposta de `'atlas:vad:available'` — mesmo quirk do `voiceschanged` já documentado abaixo. Desabilitado também enquanto `chatTurnInFlight || askInFlight`.

### Auto-envio: mesmo `submit` de `#chat-form`, nunca chamada direta (D11)

O glue escreve em `#chat-input` e dispara `dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))` — reusa as cinco camadas já construídas pelas SPECs 0048–0051 (guardas, `.catch` com aviso pinado, `.finally` de origem única, guarda estrutural do bridge, aviso de cancelamento) em vez de duplicá-las. A transcrição é **anexada** a `#chat-input`, mesma regra da SPEC-0046 — um rascunho digitado antes de ligar o modo é preservado e vai junto no primeiro envio.

Entre `transcribing` e `thinking` existe o estado **`sending`**, que verifica as três pré-condições espelhadas das guardas do `#chat-form` (`chatSession === null`, `chatTurnInFlight || askInFlight`, texto vazio) e exige a confirmação síncrona de `notifyHandsFreeTurnStarted()` no mesmo tick do `dispatchEvent` — ausência ⇒ `turnRefused` (D23; achado A1 do gate: sem isso, uma recusa silenciosa do `#chat-form` — que tem três `return` antes de qualquer promessa — travaria o modo em `thinking` para sempre, com o microfone fechado e o indicador mentindo). `thinking` ganha watchdog próprio (`THINKING_WATCHDOG_MS` ⇒ `thinkingTimeout`) para o turno que começou de verdade e nunca responde.

**Qualquer rejeição desliga o modo com aviso — nunca tenta de novo em laço** (D15): `turnRefused`/`turnFailed`/`thinkingTimeout`/`transcriptFailed` ⇒ `off`; só `transcriptEmpty` reabre o microfone (único caso benigno, não custa turno real). Motivo: a quarentena de sessão da SPEC-0051 é pegajosa até o trabalho abandonado assentar — reabrir o microfone produziria um laço de erro caro e ruidoso.

### Freio: desligar o toggle em qualquer um dos 9 estados (D14)

`disable` é aceito em todos os 9 estados, inclusive `sending`; fecha o microfone **antes de qualquer outro efeito**; em `thinking`, aciona `cancelInFlightOperation()` (SPEC-0051) e o aviso pinado sai pelo `.catch` já existente. É a camada 2 da salvaguarda de três camadas do ADR-0023(b) — o freio nunca depende de haver ou não trabalho em voo. Desligar o modo **não** interrompe a fala em curso (respeita as decisões de produto do ADR).

**Quarentena pegajosa mata o modo a cada tentativa** enquanto não existir o canal de push que avisa o renderer quando o trabalho abandonado assenta (candidato nomeado abaixo) — custo consciente da fatia, não bug a contornar.

### `speakText(text, onDone)` — sete caminhos de conclusão

`ended`/`error` do `<audio>` Piper, `end`/`error` do utterance do SO, backend `'none'`, watchdog (`speakingWatchdogMs`), e um sétimo caminho (R3 do gate): quando `synth.speak` retorna sem consumir o observador de utterance (voz local sumiu entre seleção e fala, ou `createSpeechOutputGlue.speak` fez no-op antes de chegar lá), `speakText` detecta e resolve `finish()` ali mesmo. O observador (`handsFreeUtteranceObserver`) vive **dentro de `synth`** — a implementação da porta `SpeechSynthesisPort`, adaptador de navegador **nunca registrado no gate de paridade**, distinto das funções puras replicadas logo depois dele (`createSpeechOutputGlue`/`selectVoiceURI`/`selectLocalVoiceURI`, essas sim vigiadas). `speech-output.ts` e as três réplicas registradas saem com **diff vazio** (D20) — o ponto de anexação é o `synth`, que existe justamente como adaptador e nunca foi replicado de nada.

### Rearme e indicador (`arming`)

Rearme periódico a cada `CAPTURE_REARM_MS` (`'atlas:stt:capture:begin'`) enquanto `listening`/`capturing`; cessa no instante em que o microfone fecha; **nunca** toca `media-permission.ts` — reusa a idempotência de `begin` já pinada pela SPEC-0046. `handsFreeIndicatorText('arming')` mostra explicitamente `"⏳ Aguardando permissão do sistema…"`, nunca um texto genérico que pareceria travado durante o diálogo nativo do macOS.

### Máquina de estados replicada no renderer, sob o gate de paridade (D10)

`hands-free.ts` entra na lista vigiada de `renderer.speech-parity.test.ts`, que passa a vigiar **quatro** módulos-fonte (`speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`, `hands-free.ts`). A linha duplicada da tabela `(capturing, speechEnd)` (descarte de fala espúria) é resolvida **fora** do reducer: o glue nunca despacha `'speechEnd'` quando o segmentador devolve `{ discarded: true }` — chama `segmenter.reset()` e mantém `listening` local, sem passar por `nextHandsFreeState` (R1; `capturing` e `listening` são ambos estados de microfone aberto, então a escolha não viola a invariante do ADR-0023(e)).

Novos arquivos de teste: `apps/desktop/tests/hands-free.test.ts`, `vad-resources.test.ts`, `renderer.hands-free.test.ts`, `vad-wiring.test.ts`. `helpers/renderer-harness.ts` ganhou substituição do ponto de criação do detector, eventos de conclusão em `Audio`/`SpeechSynthesisUtterance` e entradas novas do `EPILOGUE`.

**Zero diff em `packages/*`/`apps/cli`/`core-bridge.ts`.** Nenhum módulo novo, nenhuma Tool nova, nenhum campo novo em `Persona` — a fatia inteira vive nos Gateways de `apps/desktop`. Sem barge-in (decisão de produto do ADR-0023, não resíduo desta SPEC).

---

## Renderer: duplicação deliberada (padrão obrigatório)

`renderer/renderer.js` é `<script>` clássico carregado por `loadFile`, **sem bundler** (ADR-0019) — não pode `import` os módulos TS do app em runtime (diferente de `confirm-port.ts`/`steps-view.ts`/`piper-tts.ts`, consumidos só pelo main process via `tsx`).

Toda lógica de `speech-output.ts`/`piper-tts.ts` que o renderer precisa é por isso **replicada em JS puro**, com comentário explícito apontando a duplicação e o teste de referência. **São 9 réplicas** (funções) **mais a constante `PIPER_VOICE_PREFIX`** (SPECs 0035/0036/0039/0040/0041/0043/0047) — a 9ª é `computeDefaultPiperVoiceURI`, réplica de `resolveDefaultPiperVoiceURI` (`piper-tts.ts`), amarrada ao gate desde a SPEC-0047; desde a SPEC-0048, o comentário acima da função volta a descrever o estado real (aponta `resolveDefaultPiperVoiceURI` e `renderer.speech-parity.test.ts`, sem mais a frase "resíduo sem cobertura automatizada" — resíduo documental da SPEC-0047/D5 fechado; o corpo da função saiu byte-idêntico). A SPEC-0043 é a 2ª vez que uma dessas duplicações **derivou por acidente** (o glue ficou sem `preferredVoiceURI` desde a SPEC-0035 sem que nenhuma fatia seguinte notasse).

> Para qualquer glue futuro do renderer que precise da lógica de um módulo puro: **replique com comentário explícito, nunca tente importar TS direto.**

**Desde a SPEC-0045, a deriva entre as duas cópias é coberta por gate mecânico**, não só por convenção, e **desde a SPEC-0047 o gate deixou de ser específico de `speech-output.ts`**: `apps/desktop/tests/renderer.speech-parity.test.ts` roda, sobre `apps/desktop/tests/helpers/renderer-harness.ts` (jsdom instanciado programaticamente, carregando `index.html`/`renderer.js` do disco, `runScripts: 'outside-only'`, epílogo de teste concatenado — nenhum `export` entra em `src/`), uma tabela de casos única aplicada às duas implementações de cada par, e falha se **qualquer um dos seis módulos-fonte vigiados** (`speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`, `hands-free.ts` desde a SPEC-0052, `system-metrics.ts`/`token-usage.ts` desde a SPEC-0054) ganhar um export de valor novo não classificado no registro (nem em `NOT_MIRRORED`, com `moduleSource` e justificativa) — enumerados em runtime via `import * as`, não por lista escrita à mão. O registro direto tem **28 entradas** (10 pré-SPEC-0052 + 4 funções + 14 constantes de `hands-free.ts`), incluindo `resolveDefaultPiperVoiceURI` (`piper-tts.ts`) ↔ `computeDefaultPiperVoiceURI` (`renderer.js`, SPEC-0047), com tabela de seis casos; `PIPER_VOICE_PREFIX` tem origem real em `piper-tts.ts` (não `speech-output.ts`, que só a reimporta) — o registro carrega um campo `moduleSource` para isso e `kind: 'direct' | 'transitive'` para as entradas cobertas via `createSpeechOutput`/`isAvailable()` (`selectVoiceURI`, `selectLocalVoiceURI`), sem exportar os helpers privados. `NOT_MIRRORED` tem **5 entradas** — `system-metrics.ts`/`token-usage.ts` entram com **zero réplica nova** (a formatação do painel `Sistema` é lógica exclusiva do renderer, sem gêmeo em TS, SPEC-0054/D12), então `createSystemMetrics`/`createTokenUsageAccumulator` só existem como entradas `NOT_MIRRORED`, nunca como par mirrored. **Limites remanescentes do gate, agora dois**: (i) lógica nova escrita direto no renderer **sem contraparte em TS** segue fora — não há fonte contra a qual comparar; (ii) réplica de um módulo **fora da lista vigiada** (os seis nomeados acima) segue protegida só por convenção documentada. `apps/desktop/tests/renderer.boot.test.ts` cobre arranque, `id`s referenciados e a fiação do envio de chat; `apps/desktop/tests/renderer.voice-triggers.test.ts` cobre os dois gatilhos de reavaliação de voz e a política Piper-only no `<select>`. Desde a SPEC-0047, `renderer.persona-crud.test.ts`/`renderer.permissions-panel.test.ts`/`renderer.memory-ask.test.ts`/`renderer.gesture-serialization.test.ts` cobrem os cinco painéis por comportamento observável (IPC registrado + DOM), com o caminho de recusa em pé de igualdade com o de sucesso — ver "Serialização de gestos" abaixo. O achado da SPEC-0047 (`#chat-send` sem `askInFlight` no cálculo de `disabled`) foi corrigido pela SPEC-0048 — ver "Serialização de gestos" abaixo para o estado atual.

### Quirk do `voiceschanged`

No Chromium, `getVoices()` costuma devolver `[]` até o evento assíncrono `voiceschanged` disparar. O catálogo Piper, por sua vez, chega por IPC assíncrono independente. Por isso `refreshSpeakButton` e `populatePersonaVoiceSelect` são reexecutados em **dois gatilhos**: a resposta de `'atlas:tts:voices'` **e** o `voiceschanged`. Nunca resolva disponibilidade de voz point-in-time no load — dá falso-negativo.

Quando não há voz, o botão fica **desabilitado com aviso**, nunca ativo-porém-mudo.

### Serialização de gestos

Um turno por vez. O seletor de Persona e os painéis de permissões/Personas ficam desabilitados enquanto houver turno de chat ou `ask` em voo (`chatTurnInFlight`/`askInFlight`). Desde a SPEC-0048, `#chat-send` entra na mesma condição (`refreshChatControlsForMic()`: `chatTurnInFlight || askInFlight || micBusy()`, origem única do estado do botão — o `.finally` do turno de chat não atribui mais `sendButton.disabled` diretamente), e o manipulador de `submit` de `#chat-form` recusa o gesto (sem chamar `atlas.chat.send`) com `chatTurnInFlight || askInFlight`, independente do atributo `disabled` — cobre submissão implícita/programática do `<form>`. `#chat-input` fica **deliberadamente fora** dessa serialização durante um `ask` (D3 da SPEC-0048): digitar não dispara round-trip contra o Core, e desabilitar o campo roubaria foco/texto em curso.

Desde a SPEC-0049, `#ask-form` entra na mesma serialização, fechando as duas direções residuais que a SPEC-0048 deixou abertas (DoD-d.1/d.2): o botão de submissão ganhou `id="ask-submit"` (era o único controle do painel sem `id`) e uma função `refreshAskControls()` (`disabled = chatTurnInFlight || askInFlight`, chamada por `refreshPermissionsPanelState()`, origem única — nenhum `.finally` atribui `disabled` diretamente); o manipulador de `submit` de `#ask-form` ganhou a mesma guarda de entrada (`if (chatTurnInFlight || askInFlight) return;`, **recusa silenciosa** — D4: não escreve aviso, preserva o `#ask-result` de um round-trip em curso). **Nota de precisão (D4/correção do gate):** a guarda não é redundante ao `disabled` do botão — como `#objective` fica habilitado (D3) e um `<form>` com `<input type="text">` submete por Enter, o caminho implícito **é** o caminho normal aqui (diferente de `#chat-input`, que é desabilitado durante o turno). `#objective` fica **deliberadamente fora** da serialização, mesmo padrão de D3 da SPEC-0048. O manipulador também ganhou `.catch` (entre `.then` e `.finally`), escrevendo `⚠️ <mensagem>` no `#ask-result` — uma falha de `atlas.ask` deixa de virar unhandled rejection silenciosa. A serialização é agora **dupla**, não só do renderer: desde a SPEC-0050, o `core-bridge` também **lê** `hasInFlightOperation()` como guarda de entrada de `resolveAskSnapshot` e `sendChatTurn` (ver "Rastreio de operação em voo" acima) — o mecanismo que antes só era mantido em favor de `updatePersona`/`selectPermissionRoots` passa a recusar as duas próprias funções que o marcam, contra si mesmas e uma contra a outra, antes de subir qualquer Core. As guardas do renderer continuam sendo o caminho normal (o usuário encontra um botão desabilitado, não uma mensagem de erro); a guarda do main process é a rede de segurança para todo caminho que não passa pelo `<form>` (submissão programática, canal IPC exercitado direto, teste de integração). `micBusy()` **não** entra na condição de `#ask-submit` (D5 da SPEC-0049 — a captura de voz alimenta `#chat-input`, não `#objective`) e o `.catch` de "Esquecer" (memória)/`chat.open()` seguem fora (D6 da SPEC-0049), ambos registrados em `NEXT_CONTEXT.md`.

Ao aplicar uma mudança que encerra sessões (Persona, permissões, update da Persona ativa): limpa o transcript, escreve aviso explícito, reabre a sessão e recarrega o status. **Em recusa: aviso de erro, transcript e conversa intactos, listas recarregadas do estado real** — o usuário nunca vê um seletor divergente do Core.

Desde a SPEC-0051, `#ask-cancel`/`#chat-cancel` (molde de `#mic-cancel-button`) ficam visíveis/habilitados **sse** `askInFlight`/`chatTurnInFlight`, calculados só em `refreshAskControls()`/`refreshChatControlsForMic()` (origem única, nenhum `.finally` atribui `hidden`/`disabled` direto). Ver "Gesto de escape" acima para a semântica completa (desistência × cancelamento real, contenção do `ConfirmPort`, quarentena de sessão).

### Layout visual v3.0 — núcleo holográfico e drawer (desde a SPEC-0053)

`renderer/index.html`/`styles.css`/`renderer.js` substituíram integralmente o layout de duas colunas das versões v1.x/v2.0 (reprovado no smoke humano — ver "Pendência estrutural" abaixo). A área principal é uma única pilha central: `#presence-core` (com `#presence-canvas`, `#presence-persona`, `#presence-state`) → resposta corrente (`#current-reply`/`#show-complete-reply`) → voz → `#chat-form`. Nenhuma sidebar/trilho/timeline permanente. `#menu-toggle` (44×44 CSS px, canto superior esquerdo) abre `#panel-drawer`, um overlay `role="dialog"` com backdrop, foco contido e zero-ou-um painel visível entre os seis de `#drawer-navigation` (`data-drawer-nav`): Persona, Personas, Memória, Permissões, Objetivo, Sessão. **Sessão** é a única casa de `#timeline-region`/`#chat-transcript`/`#timeline-detail` — não existe mais timeline fora do drawer.

Todo painel usa *progressive disclosure* determinístico (containers começam fechados salvo ação em curso, `aria-expanded`/`aria-controls`/`hidden` sincronizados, nunca `position: absolute`/truncamento sem controle de revelar): título de Memória por regra 72/69+reticências, `#persona-status-toggle` recolhendo `#status`, `#persona-form` recolhido em Personas, `#ask-result-toggle` recolhendo `#ask-result` em Objetivo, `#read-roots-toggle`/`#write-roots-toggle` recolhendo as listas de Permissões.

O núcleo é uma nuvem determinística de 400 pontos (320 Fibonacci na superfície + 80 internos por `mulberry32(0x0a71a5)`, SHA-256 pinado, sem `Math.random`) renderizada em **Canvas 2D nativo** (`#presence-canvas`, sem WebGL/lib nova), com projeção 3D, depth-sort e reação a `pointermove` (±12°). Sete perfis fecham `#presence-core[data-state]` — `ready`/`booting`/`listening`/`transcribing`/`thinking`/`speaking`/`error` — sobre a mesma origem de sinais já emitida pelas SPECs 0040/0046/0052 (nada de IPC/canal novo); `speaking` só ativa em `<audio>.playing`/`SpeechSynthesisUtterance.onstart` reais (`playbackPending`/`playbackActive`), nunca por clique/`canplay`/estado isolado do hands-free. Um único `requestAnimationFrame`; `prefers-reduced-motion: reduce` cancela o loop e desenha um frame estático por estado, preservando texto/interação. Paleta roxo-realeza (custom properties, variantes clara/escura por `prefers-color-scheme`) e nenhum emoji em rótulo/controle.

CSP inclui `media-src 'self' blob:` (playback do Piper por `Blob`/`<audio>`). Zero canal IPC, contrato, dependência ou módulo novo — a fatia inteira vive no renderer; diff confinado a `apps/desktop/src/renderer/*` + `apps/desktop/tests/renderer.layout.test.ts`. Detalhe normativo completo (manifesto dos 77 IDs estáticos, tabela dos sete perfis, algoritmo exato da nuvem, contratos de disclosure por painel): [SPEC-0053](../../docs/implementation/specs/SPEC-0053-desktop-visual-layout.md).

O painel de permissões mostra `config.permissions` (o que o `loadConfig` validou), **não** a política resolvida por `realpath` no `PermissionService`, que pode ser mais restritiva. A divergência erra sempre para o lado restritivo.

---

## Observabilidade do ambiente — painel `Sistema` (desde a SPEC-0054)

Consome o [ADR-0024](../../docs/06-adr/ADR-0024-desktop-host-resource-metrics.md) e o [ADR-0025](../../docs/06-adr/ADR-0025-desktop-token-usage-accounting.md) (ambos novos, `Accepted`, que delegaram o contrato técnico exato à SPEC). Sétimo e último item de `#drawer-navigation` (`#panel-system`), atende o requisito de PRD *Observabilidade do Ambiente* (acrescentado em 2026-08-18): consumo de recursos do host, consumo de tokens da sessão corrente e relógio.

### `src/system-metrics.ts` — espelho estrutural de `piper-tts.ts`/`stt-engine.ts`

Não importa `electron` nem `systeminformation` — recebe a lib por porta injetável `SystemInformationPort` (`currentLoad`/`mem`/`graphics`/`networkStats`); o único ponto do repositório que importa `systeminformation` é `src/main.ts`. `createSystemMetrics({ si, timeoutMs? })` → `{ read() }`: dispara as quatro leituras **em paralelo**, nunca lança, cada métrica falha **isoladamente** com uma razão nomeada (`unsupported` — a plataforma não expôs o valor; `read-failed` — rejeição/formato inesperado; `timeout` — estourou o orçamento, default 2500 ms). Sem cache, sem timer residente, sem estado entre leituras. CPU/GPU são porcentagem `[0, 100]` a uma casa decimal; memória deriva `usedBytes = total - available`; GPU escolhe o **primeiro** controller com `utilizationGpu` finito; rede escolhe a **primeira** entrada com `rx_sec`/`tx_sec` finitos e ≥ 0. Modelo/nome de GPU nunca é lido.

### `src/token-usage.ts` — acumulador puro em memória

`createTokenUsageAccumulator()` → `{ add, snapshot, reset }`. Só conta campos **finitos e ≥ 0** de `TokenUsage` (`Math.round`); `totalTokens` é derivado como `prompt + completion` **somente** quando `usage.totalTokens` está ausente/inválido — essa derivação existe só aqui, nunca no Cognitive. Turno sem nenhum campo válido (inclusive `add(undefined)`) incrementa `unreportedTurns`, nunca os totais. Sem IO, sem `Date`, sem `electron`, sem persistência.

### Integração no `core-bridge.ts` e IPC

Uma **única** instância de módulo (mesmo molde da seleção de Persona/permissões): somada em `resolveAskSnapshot`/`sendChatTurn` logo após o `await` do Core, **antes** da checagem de abandono — consumo de uma operação **cancelada/abandonada** (SPEC-0051) **é contabilizado** (o gasto já ocorreu; só os efeitos de domínio, `remember`/`updateConversation`, continuam descartados); resetada em `openChatSession` bem-sucedida e por `__resetBridgeStateForTests()`. `readTokenUsage()` é síncrona, nunca sobe o Core. Dois canais IPC novos, um por módulo (D4 da SPEC): `'atlas:metrics:read'` → `systemMetrics.read()`; `'atlas:tokens:read'` → `readTokenUsage()`; expostos em `window.atlas.metrics.read`/`window.atlas.tokens.read`. Nenhum canal existente muda.

### Painel e ciclo de atualização no renderer

`#panel-system` mostra, nesta ordem: relógio (`#system-clock-date`/`#system-clock-time`, formato `<dia da semana>, DD/MM/AAAA` e `HH:MM:SS`, sem `Intl`) → tokens (`#system-tokens`, quatro desfechos exaustivos sobre `TokenUsageSnapshot`) → CPU/Memória/GPU/Rede (`#system-cpu`/`#system-memory`/`#system-gpu`/`#system-network`) → `#system-status`. Formatação pinada: separador decimal `,`, milhar `.`, base 1000 em bytes (`B`/`kB`/`MB`/`GB`/`TB`), três textos de indisponibilidade nomeados por `reason`. **Um único `setInterval` de 1000 ms**, criado só quando o painel fica visível e cancelado ao fechar/trocar de painel/`Escape`/backdrop/teardown — fora disso, nenhum timer desta fatia existe. Cada tick atualiza o relógio (`Date` local, sem IPC); a cada **dois** ticks (2000 ms) dispara `metrics.read()`/`tokens.read()`, sem reentrância (tick pulado se uma leitura ainda está em voo) e descartando resposta que chega após o painel fechar. Rejeição de qualquer `invoke` mostra os textos pinados de falha nas células e em `#system-status`, mantendo o painel utilizável — **nunca** alimenta `#global-alert` nem `#presence-core[data-state="error"]` (erro de painel fica no painel). A leitura **não** entra na serialização de gestos: não marca operação em voo, não é bloqueada por turno de chat/`ask` em voo, não é bloqueada por `micBusy()`.

Manifesto de IDs estáticos passou de 77 para **86** (nove novos, todos dentro de `#panel-system`). Zero módulo/Tool/Skill/Persona novo; zero mudança em `apps/cli`/`@atlas/runtime`/`@atlas/tools`/`@atlas/permissions`/`@atlas/context`/`@atlas/memory`/`@atlas/persona`/`@atlas/skills`; layout v3.0 (SPEC-0053) intacto.

---

## Pendência estrutural: smoke de voz/áudio real ainda não confirmado

**A pendência de layout/renderização foi fechada pela SPEC-0053**: pela primeira vez em ~20 fatias visuais consecutivas (SPEC-0031 a 0052), o smoke humano rodou de fato numa janela real, reprovou a v2.0 (sidebar/trilho/timeline permanentes, painel de Memória sobrepondo conteúdo, esfera CSS-only sem volume) apesar de gates técnicos verdes, e confirmou `OK` nos 15 itens da v3.0 (núcleo holográfico, drawer, disclosure, paleta, estados/movimento, reduced motion — tabela completa na SPEC-0053, "Registro do smoke visual humano").

**O que segue sem confirmação em hardware real** é o eixo de áudio: o shell de automação não tem WindowServer nem microfone, e desde a SPEC-0040/0046/0052 soma-se a ausência dos binários Piper/`whisper-cli` e do runtime WASM/modelo Silero. Continuam pendentes: transcrição real em PT-BR, latência do modelo `small`, o diálogo nativo de permissão do macOS (inclusive o rearme do watchdog em `media-permission.ts`), eco com alto-falante aberto, a qualidade real do Silero em ambiente ruidoso, o acerto dos 3 s da janela de silêncio em uso, e **o item mais difícil de dublar**: o laço de conversa em tempo real do modo hands-free ponta a ponta (microfone real, VAD real, latência acumulada fala→resposta falada). A cobertura automatizada (SPEC-0045/0047) prova lógica e fiação, não som — as APIs de voz seguem dubladas em teste. Não bloqueia fechamento documental, mas não conte como verificado.

## Candidatos futuros já nomeados

Equivalente de CLI para Persona (**entregue pela SPEC-0044** — `atlas persona create/edit/delete/list`; `use`/seleção durável segue fora) · persistir Persona ativa e política de permissões entre reinícios (exige ADR) · **wake word / escuta contínua** (STT já entregue pela SPEC-0046; wake word segue exigindo ADR próprio, ADR-0022 a marca como candidato não comprometido) · ditado ao vivo (transcrição incremental) e processo de longa duração para STT, para eliminar a recarga do modelo (locais à porta injetada de `stt-engine.ts`, sem mudança estrutural) · catálogo multi-modelo de STT (`base`/`small`/`medium`), se qualidade/latência do default se mostrarem insuficientes · instalador/empacotamento com `extraResources` para os dois binários + modelos (Fase 3) · streaming incremental de playback · controle de prosódia · exportar/importar Personas · lock/escrita atômica no arquivo de Personas · seletor nativo de diretório · expor a política resolvida · `BrowserWindow` como pai em `dialog.showMessageBox` (tornaria os diálogos modais e eliminaria a origem da corrida tratada em `selectPermissionRoots`) · `__resetBridgeStateForTests()` fechar sessões vivas no próprio reset, em vez de exigir fecho manual em cada teste (SPEC-0042/D15 — toca `src/`, fora de higiene de teste) · quebrar `renderer.js` e `core-bridge.ts` em arquivos menores (SPEC-0042/D8 — a SPEC-0047 elevou de 4 para 8 os arquivos de teste dependentes do harness que lê **um** `renderer.js` do disco, encarecendo esta fatia) · vigiar módulo replicado fora da lista atual do gate de paridade (`confirm-port.ts`/`steps-view.ts`/diálogos/`media-permission.ts`/`core-bridge.ts`, consumidos só pelo main process hoje — eixo residual nomeado pela SPEC-0047/D2) · **pinar `micBusy()` fora de `#ask-submit` por teste explícito** (SPEC-0049/D5, hoje só decisão documentada, sem prova mecânica) · **uniformizar `selectPersona` para `hasInFlightOperation()`** em vez de `busySessions.size > 0` inline (D12 da SPEC-0050 — hoje um `ask` em voo não bloqueia a troca de Persona, embora bloqueie a edição da Persona ativa; mudaria comportamento de um caminho de configuração não pedido, merece aferição de UX própria) · **cancelamento cooperativo real no Runtime/Task Manager** (`AbortSignal`/fila/retry/timeout/estado `cancelled` — responsabilidade já atribuída pelo Module Catalog, hoje não implementada; exige ADR novo + decisão humana; a SPEC-0051 entregou só a desistência dentro de `apps/desktop`) · **diálogos nativos modais com `BrowserWindow` pai** (fecharia o "diálogo fantasma" da SPEC-0051/D16 — um `dialog.showMessageBox` já aberto no momento do abandono permanece na tela sem efeito ao ser clicado — e, de carona, a origem da corrida A7 da SPEC-0038; agora com custo ampliado pela SPEC-0059, cujo mutex de política compartilhado faz um diálogo perdido travar as DUAS aplicações de política, FS e rede, não mais só uma; fatia própria, apontada pelo gate) · **texto do diálogo de consentimento de rede (`network-grant-dialog.ts`) nomeando `http_get`/`web_search`** (SPEC-0059/D18 — correto hoje, mas sem gate mecânico que force a atualização quando uma 3ª Tool de rede surgir; diferente do gate de paridade renderer↔módulo, que vigia réplica de código, não texto de diálogo) · **canal de push (`webContents.send`) avisando o renderer quando o trabalho abandonado assenta** (hoje todos os canais são `invoke`/`handle`; sem push, os painéis de configuração voltam a parecer habilitados após o cancelamento e podem recusar até o trabalho assentar — SPEC-0051/D12) · **mensagem de recusa distinguindo operação abandonada de ativa** (hoje `selectPermissionRoots`/`updatePersona` recusam com a mesma mensagem em ambos os casos — SPEC-0051) · **retomar a conversa sem perder o transcript** enquanto a sessão está em quarentena de um turno abandonado que nunca assenta (candidato (iv) do DoD da SPEC-0051 — hoje essa conversa só volta a aceitar turnos se a app reabrir) · **barge-in** (interromper a fala do assistente falando por cima — exige microfone aberto durante o TTS e cancelamento de eco; candidato futuro nomeado pelo ADR-0023, não descartado, custo próprio) · **fallback de limiar de energia para o VAD**, atrás da porta injetável `VoiceActivityDetector` (D8 da SPEC-0052 — só cogitado se o Silero se mostrar indisponível em uso real; hoje sem Silero o modo simplesmente fica indisponível com motivo) · **ajuste da janela de silêncio (3 s) pelo usuário**, se o valor fixo se mostrar errado em uso real (extensão da decisão de produto (2) do ADR-0023, sem mudança estrutural).
