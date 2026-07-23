# SPEC-0033 — Desktop: chat visual multi-turno com sessão viva do Core

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0033

---

**Título**

Desktop: chat visual multi-turno na janela — `respond`/`Conversation` viva entre turnos sobre a sessão do Context Service, com o Core mantido vivo no main process

---

**Status**

- [x] Draft
- [x] Ready
- [x] In Progress
- [x] Review
- [x] Done

---

**Prioridade**

- [ ] Critical
- [ ] High
- [x] Medium
- [ ] Low

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 2 — 2.2 Experiência Conversacional` (`docs/04-engineering/Roadmap.md`, l. 145-149): "Chat visual multi-turno, equivalente ao `atlas chat`, com histórico persistido pela mesma sessão do Context Service"; "Exibição visual do traço de execução … sem expor a arquitetura interna ao usuário (Artigo 7)"; "Confirmação de ações destrutivas via diálogo nativo". Esta SPEC entrega o chat multi-turno com sessão viva; voz (2.3) e gerência visual de memória/Persona/permissões (2.4) ficam de fora.

---

# Objetivo

Dar à janela do `apps/desktop` (`@atlas/desktop`) uma **conversa multi-turno viva**, equivalente ao `atlas chat` da CLI: o usuário abre um chat, envia mensagens sucessivas e cada resposta leva em conta as anteriores — porque o Core (`createAtlas`) passa a ser **mantido vivo no main process** entre os turnos, com o histórico segurado pela **mesma sessão do Context Service** (`atlas.context`), em vez de subir e desligar por round-trip como os `status`/`ask` de tiro único das SPECs 0031/0032.

Ao final: a partir de uma sessão gráfica real, o usuário digita uma mensagem, vê a resposta e o traço de `steps`; digita outra mensagem e a resposta reflete o contexto acumulado da conversa; e — se um turno tocar `delete_file` dentro de uma `writeRoot` — vê o diálogo nativo de confirmação (Confirmar/Cancelar) já entregue pela SPEC-0032, agora sobre um Core que permanece vivo. Ao fechar o chat/a janela, a sessão é encerrada e o Core desligado.

---

# Motivação

A SPEC-0032 exercitou os dois adapters de GUI (`ConfirmPort` de diálogo, traço de `steps`) com um `ask` **stateless** — cada round-trip sobe e desliga o Core — e nomeou explicitamente o **chat visual multi-turno** (`respond`, `Conversation` viva entre turnos, histórico via Context Service) como fatia futura do item **2.2** (`NEXT_CONTEXT.md`, l. 13; Fora do Escopo da SPEC-0032, l. 104). Este é "o grande salto" apontado no NEXT_CONTEXT: o Core deixa de ser stateless por chamada e passa a segurar uma sessão viva entre turnos no main process — o equivalente GUI do `atlas chat` da CLI (`atlas.context` + `respond`, ADR-0008/0009).

O PRD fundamenta a capacidade: **"O sistema deve manter conversas contínuas"** e "manter conversas contextualizadas" (Comunicação, l. 59; Objetivos, l. 42), **"O sistema deve manter contexto durante as conversas"** (Memória, l. 119). Hoje essa continuidade existe só no terminal (SPEC-0006/0014); a janela ainda faz apenas tiros únicos. Esta fatia fecha a lacuna, dentro da fronteira que o Roadmap 2.2 desenha (chat com sessão do Context Service), sem entrar em voz (2.3) nem em gerência visual de estado (2.4).

---

# Referências

- `docs/04-engineering/Roadmap.md` — Fase 2, item 2.2 (l. 145-149: chat multi-turno, traço de execução, confirmação por diálogo); fronteira com 2.3 (voz) e 2.4 (gerência visual)
- `docs/02-product/ProductRequirementsDocument.md` — Comunicação/conversas contínuas (l. 59), contexto durante conversas (l. 119), Transparência (l. 149-155), ações destrutivas (l. 193)
- `docs/00-project/ArchitectureConstitution.md` — Artigo 4 (Core é o único orquestrador; renderer nunca toca `packages/*`), Artigo 6 (Contexto × Memória), Artigo 7 (uma única Persona percebida)
- `docs/06-adr/ADR-0008-conversation-as-data.md` — `Conversation` como dado; `respond` função pura; o **detentor** do valor é a borda (aqui, o main process)
- `docs/06-adr/ADR-0009-context-service-value-store.md` — Context Service como store de valor; a **aplicação** medeia (lê a conversa, chama `respond` puro, grava de volta); sessão em memória, esquecida ao fechar
- `docs/06-adr/ADR-0013-permission-service-execution-gate.md` — veredicto `confirm`, `ConfirmPort` interno, injeção via `CreateAtlasDeps.confirm`
- `docs/06-adr/ADR-0019-desktop-electron-stack.md` — stack Electron; Core só no main process; renderer isolado; sem `dist/`
- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação: `core-bridge` testável sem Electron, `main.ts` casca fina, IPC via `contextBridge`, `preload.cjs`
- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) (Done) — adapters de GUI a reusar: `createDialogConfirmPort` (`src/confirm-port.ts`), `formatSteps`/`StepLine` (`src/steps-view.ts`), `resolveAskSnapshot` (`ask` stateless)
- [SPEC-0006](SPEC-0006-atlas-chat.md) (Done) / [SPEC-0014](SPEC-0014-tools-confirm-in-chat.md) (Done) — `atlas chat`: modelo funcional a espelhar (`startConversation` → loop de `respond`, `renderSteps`, `confirm` na mesma sessão)
- `apps/cli/src/commands/chat.ts` — `runChat`: sessão do Context + loop de `respond` + `renderSteps` + gravação de `learned`, adapter de referência

---

# Escopo

- estender `apps/desktop/src/core-bridge.ts` (testável, **sem** Electron) com um ciclo de vida de **chat vivo**, mantendo o Core vivo entre turnos:
  - `openChatSession(deps?): Promise<SessionId>` — sobe a plataforma **uma vez** via `createAtlas({ config }, { confirm })` injetando o `ConfirmPort` recebido, abre uma sessão do Context Service com uma conversa fresca (`atlas.context.openSession(atlas.cognitive.startConversation())`), registra a dupla `{ atlas }` num mapa interno **chaveado pela `SessionId`** devolvida pelo Context, e devolve essa `SessionId` como handle opaco. `deps` = `{ confirm?: ConfirmPort; configOverride?: AtlasConfigOverride }` (default de `confirm`: fail-closed, como `resolveAskSnapshot`);
  - `sendChatTurn(session: SessionId, input: string): Promise<TurnSnapshot>` — resolve a sessão viva; chama `atlas.cognitive.respond(atlas.context.getConversation(session), input)`; grava de volta o histórico (`atlas.context.updateConversation(session, turn.conversation)`); grava os fatos aprendidos (`atlas.memory.remember(fact, 'learned')`, só os `created`, paridade com `runChat`); devolve um `TurnSnapshot` plano `{ reply, steps: StepLine[], learned: string[] }` via `formatSteps`. **Não** desliga o Core nem fecha a sessão — mantém tudo vivo para o próximo turno;
  - `closeChatSession(session: SessionId): Promise<void>` — fecha a sessão do Context (`atlas.context.closeSession`), chama `atlas.shutdown()` (uma vez), remove do mapa; idempotente/tolerante a handle já encerrado;
  - handle desconhecido/encerrado em `sendChatTurn`/`closeChatSession` ⇒ erro estruturado claro (nunca vazamento de `undefined`);
- estender `apps/desktop/src/main.ts` (casca Electron): construir o `ConfirmPort` de diálogo **uma vez** (reuso do `createDialogConfirmPort` da SPEC-0032) e registrar os canais IPC de chat; encerrar a(s) sessão(ões) viva(s) no desligamento da app (`window-all-closed`/`before-quit`), garantindo `shutdown` do Core. Nenhuma lógica de domínio no `main.ts`;
- estender `apps/desktop/src/preload.cjs`: expor `window.atlas.chat` com `open()`/`send(session, input)`/`close(session)` → `ipcRenderer.invoke` dos três canais, ao lado de `getStatus`/`ask` existentes;
- estender `apps/desktop/src/renderer/index.html` + `renderer.js`: uma superfície de chat mínima — abre a sessão ao carregar (ou por botão), campo de entrada + botão enviar, e um transcript que cresce a cada turno (mensagem do usuário + `reply` + traço de `steps` `🔧 <tool> → <outcome>` com negações marcadas + `💡 lembrado: <fato>`). JavaScript plano, sem bundler nem framework;
- reusar, **sem alterar**, `src/confirm-port.ts` e `src/steps-view.ts` (SPEC-0032);
- testes: estender `apps/desktop/tests/core-bridge.test.ts` com o ciclo `openChatSession`/`sendChatTurn`/`closeChatSession` sobre o Core real (gateway `fake` determinístico);
- atualizar `apps/desktop/CLAUDE.md` (registrar o ciclo de chat vivo, os canais IPC novos, a fronteira com 2.3/2.4).

---

# Fora do Escopo

Cada item abaixo pertence às fatias 2.3-2.4 ou a decisões maiores próprias:

- **remover ou substituir** o round-trip `ask` de tiro único (SPEC-0032) ou o `status` (SPEC-0031) — permanecem intactos; o chat é **aditivo** ao lado deles;
- **persistência durável** da conversa entre reinícios do app — a sessão do Context Service é em memória e é esquecida ao fechar (ADR-0008/0009); "histórico persistido pela sessão do Context Service" significa **vivo durante a sessão**, não durável em disco. Persistir conversas entre execuções é fatia futura própria (revisitaria o ADR-0009 e o Memory Service);
- promover `TurnSnapshot`, `SessionId` como handle de chat, ou os canais IPC a `@atlas/contracts` — só com um 2º consumidor real, via ADR (mesma regra que manteve `StatusSnapshot`/`AskSnapshot`/`'atlas:status'`/`'atlas:ask'` locais nas SPECs 0031/0032);
- qualquer alteração em `@atlas/contracts`, `@atlas/core`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/cognitive` ou `@atlas/context` — a superfície pronta (`createAtlas` com `CreateAtlasDeps.confirm`, `atlas.cognitive.respond`/`startConversation`, `atlas.context.openSession`/`getConversation`/`updateConversation`/`closeSession`, `ConversationTurn`/`ExecutedStep`) basta; necessidade de mudança nesses packages é motivo para **parar e registrar** (Constituição);
- **streaming** de resposta token a token; **cancelamento** de um turno em andamento; **múltiplos turnos concorrentes** na mesma sessão (o renderer serializa: desabilita a entrada enquanto aguarda);
- gerência visual de memória/Persona/permissões pela UI (item **2.4**); voz — STT/TTS/wake word (item **2.3**);
- estilização/UX elaborada (CSS, bolhas de conversa, avatares, ícones) — o transcript desta fatia é diagnóstico/mínimo, como as janelas das SPECs 0031/0032;
- bundler para o renderer (Vite/esbuild) ou framework de UI (React etc.) — decisão maior, adiada;
- empacotamento/distribuição (Fase 3); E2E/harness headless de Electron em CI — a janela segue validada por smoke manual;
- comandos de conversa `/lembrar`/`/esquecer` ao vivo (candidato de 1.3, próprio); múltiplas janelas/sessões simultâneas como caso de uso comprometido (o registro por `SessionId` já suporta N sessões, mas a UI é de sessão única).

---

# Pré-requisitos

- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação do `apps/desktop`: `core-bridge`, `main.ts`, `preload.cjs`, renderer, IPC.
- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) (Done) — `createDialogConfirmPort`, `formatSteps`/`StepLine`, injeção de `confirm` via `CreateAtlasDeps` no desktop.
- [SPEC-0007](SPEC-0007-context-service.md) (Done) — Context Service (`atlas.context`) como store de valor por sessão.
- [SPEC-0014](SPEC-0014-tools-confirm-in-chat.md) (Done) — `respond` com Planejamento/Execução + `renderSteps` + `confirm` na mesma sessão (modelo funcional do `runChat`).

---

# Critérios de Aceitação

- `pnpm lint` passa sem erros, cobrindo os arquivos novos/alterados de `apps/desktop` (inclusive `renderer.js`/`preload.cjs` no contexto browser/CommonJS);
- `pnpm typecheck` passa, cobrindo `apps/desktop`;
- `pnpm test` executa e passa, incluindo os testes novos/estendidos de `apps/desktop/tests/`;
- teste comprova: `openChatSession({ confirm, configOverride })` sobre o Core real (in-memory, gateway `fake` determinístico) devolve uma `SessionId` (string não vazia) e chama `createAtlas` **exatamente uma vez**;
- teste comprova (o coração da fatia): dois `sendChatTurn` sucessivos na **mesma** `SessionId` resolvem, cada um, um `TurnSnapshot` plano `{ reply: string; steps: StepLine[]; learned: string[] }` serializável por IPC (`JSON.stringify` round-trips sem perda), e `createAtlas` foi chamado **uma só vez** para os dois turnos (o Core é mantido vivo — distinção central em relação ao `ask` stateless da SPEC-0032, que sobe/desliga por chamada); `atlas.shutdown()` **não** é chamado entre turnos;
- teste comprova: `openChatSession` repassa o `confirm` injetado ao Core (via `CreateAtlasDeps.confirm`) e o override de config é propagado (paridade com `resolveAskSnapshot`);
- teste comprova: `closeChatSession(session)` chama `atlas.shutdown()` **exatamente uma vez** e fecha a sessão do Context; após fechar, `sendChatTurn` na mesma `SessionId` rejeita com erro estruturado (handle desconhecido) e **nunca** vaza `undefined`;
- teste comprova: `sendChatTurn`/`closeChatSession` com uma `SessionId` nunca aberta rejeitam com erro estruturado claro, sem lançar `TypeError` de acesso a `undefined`;
- smoke manual (registrado nas Observações): em sessão gráfica real (`pnpm --filter @atlas/desktop start`), abrir o chat, enviar duas mensagens sucessivas cujo sentido dependa uma da outra e observar que a 2ª resposta reflete o contexto da 1ª; ver o traço de `steps` por turno; e um turno cujo plano toque `delete_file` dentro de uma `writeRoot` concedida abre um **diálogo nativo** de confirmação (Confirmar/Cancelar), cuja escolha "Cancelar" resulta num passo negado exibido no traço — sem nenhum prompt de terminal; fechar a janela encerra a sessão e desliga o Core;
- estrutura corresponde à seção "Arquivos Esperados";
- nenhuma alteração em `@atlas/contracts`, `@atlas/core`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/cognitive` nem `@atlas/context`.

---

# Arquivos Esperados

```text
apps/
└── desktop/
    ├── src/
    │   ├── core-bridge.ts        # + openChatSession/sendChatTurn/closeChatSession + TurnSnapshot + registro de sessões vivas
    │   ├── main.ts               # + ipcMain.handle dos 3 canais de chat + teardown das sessões no shutdown da app
    │   ├── preload.cjs           # + window.atlas.chat.open()/send(session,input)/close(session)
    │   ├── confirm-port.ts        # inalterado (reuso — SPEC-0032)
    │   ├── steps-view.ts          # inalterado (reuso — SPEC-0032)
    │   └── renderer/
    │       ├── index.html        # + superfície de chat (entrada + transcript)
    │       └── renderer.js       # + abre sessão, envia turnos, pinta transcript (reply/steps/learned)
    ├── tests/
    │   └── core-bridge.test.ts   # + casos do ciclo openChatSession/sendChatTurn/closeChatSession
    └── CLAUDE.md                 # + ciclo de chat vivo, canais IPC novos, fronteira com 2.3/2.4
```

Nenhum arquivo novo em `packages/*`, `docs/06-adr/` ou `@atlas/contracts`. Essa lista é expectativa e pode sofrer pequenos ajustes.

---

# Componentes Impactados

Camada Interaction do Module Catalog, no app `apps/desktop`:

- Input Gateway / Output Gateway (semente desktop, SPEC-0031/0032) — entrada ganha mensagens sucessivas de chat; saída ganha um transcript multi-turno com traço de `steps` e diálogo de confirmação.

Consome, **sem alterar**: Core (`createAtlas` + `CreateAtlasDeps.confirm`), Cognitive Core (`atlas.cognitive.respond`/`startConversation`), Context Service (`atlas.context.openSession`/`getConversation`/`updateConversation`/`closeSession`), Runtime (veredicto `confirm` interno), Permission Service, Memory Service (`remember`), Lifecycle Manager (`shutdown`).

---

# Interfaces Necessárias

Locais em `apps/desktop` (não em `@atlas/contracts` — não há segundo consumidor):

```text
TurnSnapshot {
  reply: string
  steps: StepLine[]        // reuso de StepLine da SPEC-0032
  learned: string[]
}

openChatSession(deps?: {
  confirm?: ConfirmPort
  configOverride?: AtlasConfigOverride
}): Promise<SessionId>

sendChatTurn(session: SessionId, input: string): Promise<TurnSnapshot>

closeChatSession(session: SessionId): Promise<void>
```

`SessionId`/`ConversationTurn`/`ExecutedStep`/`AtlasConfigOverride`/`ActionRequest` vêm de `@atlas/contracts` (já existentes). `StepLine`/`ConfirmPort`/`AskSnapshot` já são locais ao app (SPEC-0031/0032). `ConfirmPort` é satisfeito **estruturalmente** (interno ao `@atlas/runtime`, não importado). Nenhuma interface nova em `@atlas/contracts`.

Canais IPC novos (nomes estáveis, ao lado de `'atlas:status'`/`'atlas:ask'`):

```text
main:     ipcMain.handle('atlas:chat:open',  ()               => openChatSession({ confirm }))
          ipcMain.handle('atlas:chat:send',  (_e, session, input) => sendChatTurn(session, input))
          ipcMain.handle('atlas:chat:close', (_e, session)    => closeChatSession(session))
preload:  window.atlas.chat.open()               → ipcRenderer.invoke('atlas:chat:open')
          window.atlas.chat.send(session, input)  → ipcRenderer.invoke('atlas:chat:send', session, input)
          window.atlas.chat.close(session)         → ipcRenderer.invoke('atlas:chat:close', session)
renderer: const session = await window.atlas.chat.open()
          const turn    = await window.atlas.chat.send(session, input)
```

---

# Fluxo Esperado

```text
renderer (na janela): ao carregar → window.atlas.chat.open()
  → [main] ipcMain.handle('atlas:chat:open')
      → openChatSession({ confirm: dialogConfirm })
          → createAtlas({ config }, { confirm })          (UMA vez; Core fica vivo)
          → context.openSession(cognitive.startConversation())
          → registra { atlas } no mapa por SessionId → devolve SessionId
  → guarda a SessionId no renderer

usuário digita mensagem, clica enviar → window.atlas.chat.send(session, input)
  → [main] ipcMain.handle('atlas:chat:send')
      → sendChatTurn(session, input)
          → turn = cognitive.respond(context.getConversation(session), input)
               ↳ Runtime executa o plano; Tool destrutiva → confirm.request(action)
                   → dialog.showMessageBox(...) modal na janela → true/false
          → context.updateConversation(session, turn.conversation)   (histórico vivo)
          → grava learned (memory.remember(fact,'learned'))
          → TurnSnapshot { reply, steps: formatSteps(turn.steps), learned }
  → acrescenta ao transcript (input do usuário + reply + steps + learned)
  → (próximo turno reusa a MESMA SessionId → contexto acumulado)

fechar janela → [main] window-all-closed/before-quit
  → closeChatSession(session) para cada sessão viva → context.closeSession + atlas.shutdown()
```

Regras (para remover ambiguidade):

- o Core vive **exclusivamente no main process** e agora **entre turnos**; o renderer nunca importa `packages/*` nem tipos de contrato — recebe só `SessionId` (string opaca) e `TurnSnapshot` plano (Artigo 4 / segurança Electron);
- o valor `Conversation` **nunca cruza o IPC**: ele é segurado pela sessão do Context Service dentro do main process (ADR-0008/0009 — o main process é a "borda" detentora); o renderer vê só `reply`/`steps`/`learned`;
- `sendChatTurn` é a **mediação** que o ADR-0009 atribui à aplicação: lê a conversa do Context, chama `respond` puro, grava de volta — o Cognitive segue sem estado, o Context segue store de valor;
- o `ConfirmPort` de diálogo vive no `main.ts` (onde `dialog` do Electron existe), construído **uma vez** e injetado no Core no `openChatSession`; `core-bridge.ts`/`confirm-port.ts` permanecem **livres de import de Electron** (testáveis no Vitest);
- o traço de `steps` exibe nome da Tool + resultado + natureza da negação — transparência de **ações** (PRD), não exposição de Planner/Runtime/Permission Service (Artigo 7 preservado);
- a sessão é em memória e esquecida ao fechar (ADR-0008/0009) — Contexto, não Memória (Artigo 6); só os fatos `learned` atravessam para a persistência, via `memory.remember`.

---

# Estratégia de Implementação

1. estender `core-bridge.ts`: introduzir o mapa interno de sessões vivas (`Map<SessionId, { atlas }>`) e `openChatSession`/`sendChatTurn`/`closeChatSession`, reusando `formatSteps` e o `fallbackConfirm` já existentes; TDD sobre o Core real (gateway `fake`);
2. testes de `core-bridge.test.ts`: `createAtlas` uma vez por sessão (spy), dois turnos sem `shutdown` intermediário, `TurnSnapshot` serializável, `confirm`/override propagados, `close` chama `shutdown` uma vez e invalida o handle, handle desconhecido rejeita limpo;
3. `main.ts`: registrar os três `ipcMain.handle` de chat reusando o `confirm` de diálogo já construído (SPEC-0032); adicionar o teardown das sessões vivas em `window-all-closed`/`before-quit`; casca fina;
4. `preload.cjs`: expor `window.atlas.chat.{open,send,close}`; `renderer/index.html` + `renderer.js`: abrir a sessão, campo + botão, transcript que cresce por turno (input/reply/steps/learned), desabilitando a entrada enquanto aguarda a resposta (serialização de turnos);
5. ajustar ESLint se acusar (globals já cobertos pelas SPECs 0031/0032); validar `pnpm lint`/`typecheck`/`test`;
6. smoke manual em sessão gráfica real (dois turnos encadeados com contexto; traço; diálogo de confirmação em plano com `delete_file`; fechar encerra a sessão) e registrar o resultado;
7. atualizar `apps/desktop/CLAUDE.md`; validar todos os critérios de aceitação.

---

# Estratégia de Testes

- testes unitários em `apps/desktop/tests/core-bridge.test.ts` sob o Vitest já configurado, **sem Electron** — a fronteira testável é o ciclo de chat do `core-bridge`, exatamente como as SPECs 0031/0032 testaram `resolveStatusSnapshot`/`resolveAskSnapshot` sem tocar o runtime gráfico;
- **openChatSession**: devolve `SessionId` não vazia; `createAtlas` chamado uma vez; `confirm`/override propagados; `InvalidConfigError` propagada (paridade com `resolveAskSnapshot`);
- **sendChatTurn**: dois turnos na mesma sessão resolvem `TurnSnapshot { reply, steps, learned }` serializável; `createAtlas` chamado **uma só vez** para ambos e `shutdown` **não** chamado entre eles (spy — a asserção que distingue a sessão viva do `ask` stateless); `learned` gravado só quando `created`;
- **closeChatSession**: `shutdown` chamado exatamente uma vez; sessão do Context fechada; handle invalidado (envio posterior rejeita); idempotência/tolerância a handle já encerrado;
- **handles inválidos**: `sendChatTurn`/`closeChatSession` com `SessionId` nunca aberta rejeitam com erro estruturado, sem `TypeError`;
- sem mocks do Core — `createAtlas` real (ADR-0004);
- `main.ts`/`preload.cjs`/`renderer.js` (camada Electron/DOM) **não** são unit-testados nesta fatia — validação por smoke manual, incluindo o encadeamento de contexto entre turnos e o diálogo de confirmação real (harness headless de Electron é Fora do Escopo).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é passo de fecho (`doc-sync`), não do implementador; o implementador toca a doc específica da própria SPEC (o arquivo da SPEC, o `CLAUDE.md` de `apps/desktop`).

---

# Restrições

- Não criar novos packages, módulos, Tools, Skills nem Personas; o único código novo vive em `apps/desktop`. O app segue fino: nenhuma lógica cognitiva, de memória ou de coordenação de Skills (ProjectStructure).
- Consumir o Core **só** pelos contratos públicos (`createAtlas`, `CreateAtlasDeps.confirm`, `atlas.cognitive.respond`/`startConversation`, `atlas.context.*`, `ConversationTurn`/`ExecutedStep`/`ActionRequest`) — nunca internals de package (Artigo 4).
- O Core vive só no main process; o renderer não importa `packages/*` nem tipos de contrato; o valor `Conversation` **nunca** cruza o IPC. `contextIsolation: true`, `nodeIntegration: false`.
- `core-bridge.ts`/`confirm-port.ts`/`steps-view.ts` **não** importam `electron` (a dependência de Electron — `dialog`/`ipcMain`/`app` — fica confinada a `main.ts`); é o que os mantém testáveis no Vitest.
- Não alterar `@atlas/contracts`/`@atlas/core`/`@atlas/runtime`/`@atlas/permissions`/`@atlas/cognitive`/`@atlas/context`. Se a implementação sugerir que uma mudança neles é necessária, **parar e registrar** (Constituição).
- `respond` continua função pura e o Cognitive continua sem estado — o estado vivo é a **sessão do Context Service** segurada pelo main process, não estado escondido no Cognitive (ADR-0008/0009).
- Nada de Planner/Runtime/Permission Service vazando para a UI além de nome de Tool + resultado (transparência de ação) — uma única Persona percebida (Artigo 7).
- Sem `dist/`, sem bundler, sem framework de UI: main process em `.ts` via `tsx` (ADR-0005/0019); renderer/preload em JS plano.
- `TurnSnapshot`, o handle de chat e os canais IPC ficam **locais** a `apps/desktop`; promoção a `@atlas/contracts` só com 2º consumidor real, via ADR.

---

# Observações

**Fronteira 2.2 × 2.3/2.4.** O item 2.2 (l. 145-149) tem três linhas: chat multi-turno com sessão do Context Service, traço visual de execução, e confirmação por diálogo nativo. As duas últimas já foram entregues como adapters pela SPEC-0032 (traço via `formatSteps`; diálogo via `createDialogConfirmPort`); esta SPEC entrega a **primeira** — o chat vivo — reusando os adapters. Voz (2.3) e gerência visual de memória/Persona/permissões (2.4) ficam de fora, cada um sua própria SPEC. Ver "Decisões de design".

**"Histórico persistido pela sessão do Context Service".** O Roadmap 2.2 (l. 147) usa "persistido", mas o Context Service é, por ADR-0009, um store de valor **em memória**, esquecido ao fechar a sessão (Contexto × Memória, Artigo 6). Esta SPEC lê "persistido" como **mantido vivo durante a sessão** — não como durável em disco entre reinícios. Persistência durável de conversas é fatia futura própria (revisitaria o ADR-0009). Paridade honesta com o `atlas chat` da CLI, que também esquece ao sair.

**Smoke manual do encadeamento e do diálogo.** Como nas SPECs 0031/0032, o shell de automação sem WindowServer não executa `app.whenReady()`; a confirmação visual (janela, dois turnos encadeados com contexto, traço, diálogo modal de `delete_file`, encerramento limpo) deve ser feita por quem tiver sessão gráfica real, antes de fechar a SPEC. A cadeia testável (`core-bridge`) roda em CI sob Vitest sem Electron. Este atrito é agora recorrente em toda fatia visual da Fase 2.

**Sessão única na UI, N sessões no bridge.** O registro por `SessionId` suporta múltiplas sessões vivas (robusto a múltiplas janelas), mas o renderer desta fatia opera uma sessão só. Múltiplas janelas/sessões simultâneas como caso de uso comprometido ficam fora de escopo.

---

# Checklist para IA

Antes de implementar:

- ler documentação referenciada (Roadmap 2.2, ADR-0008/0009/0013/0019, SPEC-0031/0032/0006/0014, `runChat` da CLI);
- compreender objetivo (chat vivo multi-turno: Core mantido vivo entre turnos + sessão do Context Service);
- confirmar que nenhum contrato/package do Core precisa mudar.

Durante implementação:

- manter o app fino; Core só no main process; renderer isolado; `Conversation` nunca cruza o IPC;
- `core-bridge.ts` livre de import de Electron; reusar `formatSteps`/`createDialogConfirmPort` sem alterá-los;
- fail-closed no `ConfirmPort`; transparência de ações no traço (Artigo 7); `respond` puro / Cognitive sem estado;
- garantir teardown do Core no fechamento da app (nenhum Core órfão);
- manter simplicidade (sem bundler, sem framework).

Após implementação:

- executar testes;
- smoke manual do app real (dois turnos encadeados + traço + diálogo de `delete_file` + encerramento);
- validar critérios de aceitação;
- registrar lições aprendidas;
- registrar conclusão.

---

# Decisões de design

> Decisões tomadas pelo `spec-drafter` (Emenda v1.1), em formato de veto. Quem as ataca é o `architecture-reviewer` no gate `Draft → Ready`.

**1. Perfil `completo`.**

- **Decisão**: classificar a SPEC como `completo`.
- **Porquê**: a fatia mexe em `apps/desktop/src` — fora da superfície de containment do perfil `micro` (`packages/X/src` + opcionalmente `apps/cli/src`) — e introduz um **padrão de ciclo de vida novo**: o Core deixa de ser stateless por chamada e passa a ser **mantido vivo entre turnos** no main process, com sessões registradas e teardown no shutdown da app, além de integração gráfica validada só por smoke manual. É mais que uma mudança aditiva trivial contida a um package. Na dúvida, `completo` (default seguro); paridade com as SPECs 0031/0032 (irmãs, também `completo`).
- **Alternativa descartada**: `micro` — embora a SPEC seja aditiva, não toque `@atlas/contracts`, não crie módulo/Tool/Skill/Persona e não exija ADR, ela falha a condição de containment e envolve gerência de estado vivo + integração gráfica não coberta por teste automatizado; classificar `micro` só a faria cair no pipeline completo no gate, sem ganho.

**2. Core mantido vivo entre turnos no main process (sessão viva), não `createAtlas` por turno.**

- **Decisão**: `openChatSession` chama `createAtlas` **uma vez** e mantém a plataforma viva num registro interno; `sendChatTurn` reusa a mesma instância; `closeChatSession`/o shutdown da app desligam. O `Conversation` é segurado pela sessão do Context Service dentro do main process.
- **Porquê**: é a substância nova do item 2.2 e o "grande salto" apontado no NEXT_CONTEXT — continuidade multi-turno exige que o histórico e o Core sobrevivam entre chamadas. O main process é a "borda" detentora do valor `Conversation` que os ADR-0008/0009 preveem; manter o Core vivo evita o custo de reinicializar a plataforma a cada turno e é a única forma de a sessão do Context Service ter sentido. Mais sustentável e fiel à arquitetura.
- **Alternativa descartada**: manter o padrão stateless da SPEC-0032 e reconstruir a conversa a cada turno enviando o `Conversation` inteiro pelo IPC de ida e volta — vazaria o valor `Conversation` (que carrega mensagens `system` internas, resumos de Tools da SPEC-0014 e o prompt de memória vivo reescrito pela SPEC-0021) para o renderer, ferindo o Artigo 4/7 e o isolamento do Electron, e reinicializaria o Core a cada turno (desperdício + perda da sessão do Context). Rejeitada.

**3. Registro de sessões chaveado pela `SessionId` do Context; a app medeia (ADR-0009).**

- **Decisão**: o `core-bridge` mantém um `Map<SessionId, { atlas }>` chaveado pela `SessionId` devolvida por `context.openSession`, e `sendChatTurn` faz a mediação (lê do Context, chama `respond` puro, grava de volta). O handle exposto ao renderer é essa `SessionId` opaca.
- **Porquê**: é exatamente o papel de mediação que o ADR-0009 atribui à aplicação (aqui, o main process), preservando `respond` puro e o Context como store de valor. Reusar a `SessionId` do Context como handle evita inventar um segundo identificador e mantém a superfície mínima. Mais simples e modular.
- **Alternativa descartada**: um token opaco próprio, separado da `SessionId` do Context — duplicaria identificadores sem ganho; ou pôr a mediação/loop dentro do Context/Cognitive — inverteria dependências e tornaria `respond` stateful (rejeitado pelos ADR-0008/0009).

**4. `TurnSnapshot` plano espelhando `AskSnapshot`; `Conversation` nunca cruza o IPC.**

- **Decisão**: `sendChatTurn` devolve `{ reply, steps: StepLine[], learned: string[] }` (dado plano serializável) via `formatSteps`; o renderer pinta, sem conhecer `ConversationTurn`/`Conversation`/`ExecutedStep`.
- **Porquê**: mantém `packages/*`/tipos de contrato e o valor `Conversation` fora do renderer (Artigo 4 + isolamento Electron), reusa o `StepLine`/`formatSteps` da SPEC-0032 sem duplicação e espelha o `AskSnapshot` já validado. Mais modular, testável e consistente com a fatia anterior.
- **Alternativa descartada**: enviar `ConversationTurn` cru (com `conversation`) por IPC ao renderer — vazaria a forma do contrato e o histórico interno para o processo de renderização, quebrando o isolamento e a Persona única.

**5. Reusar `createDialogConfirmPort`/`formatSteps` da SPEC-0032, sem novos adapters; `confirm` construído uma vez.**

- **Decisão**: nenhum adapter novo; o `main.ts` constrói o `ConfirmPort` de diálogo uma vez (reuso da SPEC-0032) e o injeta no Core no `openChatSession`; o traço reusa `formatSteps`.
- **Porquê**: os dois adapters da SPEC-0032 já satisfazem o que o 2.2 pede (diálogo nativo + traço); reconstruí-los seria duplicação. Um `confirm` único por sessão viva basta porque o Core é único por sessão. Mais simples e sustentável.
- **Alternativa descartada**: criar adapters de chat dedicados — duplicaria código já entregue e testado, contra o teste de simplicidade da Constituição.

**6. Manter `status` e `ask` de tiro único; o chat é aditivo.**

- **Decisão**: não remover nem substituir `resolveStatusSnapshot`/`resolveAskSnapshot` (SPEC-0031/0032); adicionar o chat ao lado deles.
- **Porquê**: removê-los seria regressão de capacidade e escopo além do pedido; o item 2.2 é "chat visual multi-turno", não "substituir o `ask`". Mantê-los preserva a superfície diagnóstica já validada. Mais transparente e de menor risco.
- **Alternativa descartada**: substituir o `ask` pelo chat — reduziria capacidade sem pedido do Roadmap/PRD e apagaria um caminho de teste já útil.

**7. Sessão em memória, esquecida ao fechar — "persistido" = vivo durante a sessão, não durável.**

- **Decisão**: a conversa vive na sessão do Context Service em memória e é encerrada (`closeSession` + `shutdown`) ao fechar o chat/a janela; sem persistência durável em disco.
- **Porquê**: o Context Service é store de valor em memória por ADR-0009 e Artigo 6 (Contexto × Memória); só fatos `learned` atravessam para a persistência via `memory.remember`. Ler "persistido pela sessão do Context Service" (Roadmap l. 147) como durável contradiria o ADR-0009 e arrastaria uma decisão maior. Paridade honesta com o `atlas chat` da CLI. Mais simples e fiel à arquitetura.
- **Alternativa descartada**: persistir a conversa em disco entre reinícios — revisitaria o ADR-0009 e o papel do Memory Service (decisão arquitetural nova, escalação); fora do escopo desta fatia.

**8. Turnos serializados pelo renderer; sem locking no bridge, sem streaming/cancelamento.**

- **Decisão**: o renderer desabilita a entrada enquanto aguarda a resposta de um turno (um turno por vez); o `core-bridge` não adiciona locking; streaming e cancelamento ficam fora.
- **Porquê**: um turno por vez é o modelo do `atlas chat` (loop sequencial) e evita concorrência sobre a mesma `Conversation` sem introduzir complexidade de fila/lock — mais simples. Streaming/cancelamento são incrementos de UX que não bloqueiam a capacidade multi-turno pedida.
- **Alternativa descartada**: suportar turnos concorrentes na mesma sessão — exigiria serialização/lock no bridge e definiria semântica de corrida sobre o `updateConversation`, complexidade sem demanda; adiada.

**9. Erro de turno não derruba a sessão viva.**

- **Decisão**: se `sendChatTurn` falhar (ex.: `ATLAS_MODEL_GATEWAY`), a promessa do IPC rejeita e o renderer exibe o erro, mas a sessão viva **permanece aberta** (o Core não é desligado) para o usuário tentar de novo.
- **Porquê**: espelha a resiliência do loop do `runChat` (que trata `ATLAS_MODEL_GATEWAY` e continua), preservando o histórico já acumulado; desligar o Core a cada falha destruiria a conversa e contrariaria a expectativa de continuidade. Mais sustentável.
- **Alternativa descartada**: encerrar a sessão a cada erro de turno — perderia todo o contexto acumulado por uma falha transitória (ex.: Ollama fora do ar), regressão de experiência frente à CLI.

**10. `TurnSnapshot`/handle/canais IPC permanecem locais a `apps/desktop`.**

- **Decisão**: não promover nada a `@atlas/contracts`; declarar tipos localmente.
- **Porquê**: não há 2º consumidor real desses tipos/canais — a regra do repo (2º consumidor via ADR) manteve `StatusSnapshot`/`AskSnapshot`/`'atlas:status'`/`'atlas:ask'` locais nas SPECs 0031/0032; o mesmo se aplica, evitando acoplamento prematuro. Mais simples.
- **Alternativa descartada**: subir `TurnSnapshot` ou o handle a `@atlas/contracts` — exigiria ADR e um 2º consumidor inexistente; promoção especulativa contra a regra de contratos do repo.

**11. Prioridade `Medium`.**

- **Decisão**: prioridade `Medium`.
- **Porquê**: avança a Fase 2 e entrega a experiência conversacional visual, mas a capacidade multi-turno já existe sem regressão via CLI (`atlas chat`, SPEC-0006/0014), e a fundação de interface + adapters já foram abertos pelas SPECs 0031/0032 — não há bloqueio de fase inteira nem correção/segurança em jogo.
- **Alternativa descartada**: `High` — reservada à fatia que abriu a fase (SPEC-0031); aqui o avanço é incremental. `Critical` — reservada a correção/segurança bloqueante, que não é o caso.

---

# Resultado Esperado

A janela do `@atlas/desktop` passa a sustentar uma **conversa viva**: ao carregar, abre uma sessão de chat; o usuário envia mensagens sucessivas e cada resposta reflete o contexto acumulado, porque o Core (`createAtlas`) é mantido vivo no main process entre os turnos, com o histórico segurado pela mesma sessão do Context Service — em vez dos round-trips stateless das SPECs 0031/0032. Cada turno mostra a resposta, o traço de `steps` (com bloqueios/recusas marcados) e os fatos aprendidos, reusando os adapters `formatSteps`/`createDialogConfirmPort` da SPEC-0032; ações destrutivas confirmam por diálogo nativo. Ao fechar o chat/a janela, a sessão é encerrada e o Core desligado (nenhum Core órfão). A lógica de valor (`openChatSession`/`sendChatTurn`/`closeChatSession`) vive fora do runtime gráfico, testada no Vitest sem Electron, comprovando que o Core sobe uma só vez por sessão e não desliga entre turnos; o valor `Conversation` nunca cruza o IPC; `@atlas/contracts` e todos os packages do Core ficam intocados. É a experiência conversacional visual que o item 2.2 pedia, deixando voz (2.3) e gerência visual de estado (2.4) para as fatias seguintes.
