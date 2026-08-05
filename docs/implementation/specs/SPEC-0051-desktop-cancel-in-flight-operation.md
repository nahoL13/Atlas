# SPEC-0051 — Gesto de escape: cancelar um `ask`/turno de chat em voo no desktop

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0051

---

**Título**

Cancelamento (desistência) de uma operação em voo no `apps/desktop`: um botão "Cancelar" por painel (`ask` e chat) faz a promessa do gesto assentar imediatamente com mensagem pinada, libera a interface e o main process para um gesto novo, e **contém** os efeitos do trabalho abandonado (nenhum `learned` persistido, nenhuma conversa atualizada, `ConfirmPort` fail-closed **pegajoso por sessão**, conversa afetada em quarentena), sem introduzir cancelamento real dentro do Core.

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

- [ ] Critical
- [x] High
- [ ] Medium
- [ ] Low

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 2 — 2.2 Experiência Conversacional`.

O item entrega o chat visual multi-turno (SPEC-0033) e o painel `ask` (SPEC-0032), e o **Critério de Conclusão da Fase 2** exige que o app cubra os casos de uso do CLI "sem regressão de capacidade". No terminal, `Ctrl-C` sempre foi o gesto de escape de um `ask`/`chat` que não assenta; na janela, esse gesto **não existe**. Nenhum item de Roadmap novo é necessário.

---

> **Revisão v1.1 (1º veto do `architecture-reviewer`, incorporado — Perfil `completo` confirmado no gate):**
>
> - **A1 (bloqueante)** — a v1.0 propunha contenção do `ConfirmPort` **por operação**, mas no chat a porta é injetada **uma vez por sessão** (`openChatSession`, `core-bridge.ts:654-663`), viva pela sessão inteira; `sendChatTurn` não injeta porta nenhuma. Com o CA 12(b) da v1.0 (aceitar turno novo na mesma sessão logo após cancelar), um `confirm` disparado pelo trabalho **abandonado** seria atribuído ao turno novo e poderia aprovar ação destrutiva em nome de um turno que o usuário já largou. Corrigido: contenção **pegajosa por sessão** (**D8** reescrita) + **CA 12** novo, provando o cenário exato.
> - **A2 (bloqueante)** — o CA 12(b) da v1.0 também autorizava dois `respond` concorrentes no mesmo Core e na mesma `SessionId`, reentrância que **nenhum documento sustenta** (ADR-0009, Module Catalog, `PLATFORM_STATE.md`) — assumir comportamento não documentado (invariante 8, Artigo 1). Adotada a opção (a) do gate: `sendChatTurn` **recusa** turno novo **na sessão que tem turno abandonado não assentado**, com mensagem própria (**D15**). Resolve A1 de carona e preserva a nota do gate sobre D7 (o `cancel` global nunca alcança uma operação nova).
> - **A3** — a linha pinada de transparência falava só de recusa de configuração, enquanto as Observações admitem que uma Tool não destrutiva já autorizada pode concluir depois do cancelamento (arquivos podem ser escritos depois do "Cancelar"). Texto pinado reescrito (Frente 5, CA 21) e **D11** ajustada.
> - **A4** — enquadramento corrigido: cancelamento **tem** dono arquitetural previsto (o Module Catalog atribui ao **Runtime** "mecanismos de cancelamento e recuperação" e lista `cancelled` entre os estados mínimos do **Task Manager**; `NEXT_CONTEXT.md` já registra "Task Manager completo (fila/retry/timeout/cancelamento)" como candidato aberto). A conclusão não muda — atravessa `@atlas/contracts` e ≥ 3 módulos ⇒ ADR + decisão humana —, mas o candidato do DoD-(c)(i) passa a nascer com dono. Ajustados Motivação, **D2** e Fora do Escopo.
> - **A5** — registrado o **diálogo nativo fantasma**: com a resposta descartada, um `dialog.showMessageBox` já aberto continua na tela, sem pai modal, e o clique do usuário não produz efeito visível. Registrado em Observações, em **D16** e no DoD-(d.6); corrigir de fato (diálogos modais com `BrowserWindow` pai) segue **fora de escopo**, em fatia própria, conforme o gate.
>
> Preservadas sem alteração de mérito: D1, D2 (com A4), D3, D4 (alcance revisto por D15), D5, D6, D7, D9, D12.

---

# Objetivo

Quando esta SPEC estiver concluída deverá existir:

1. **Um gesto de escape visível** para as duas operações longas do desktop: um botão "Cancelar" no painel `ask` (`#ask-cancel`) e outro no painel de chat (`#chat-cancel`), cada um visível/habilitado **apenas** enquanto a operação daquele painel estiver em voo, ambos acionando o mesmo caminho global.
2. **`cancelInFlightOperation()` no `core-bridge`**: função síncrona, exportada, que marca como **abandonada** toda operação cancelável ativa (`ask` e turno de chat) e devolve `{ cancelled: boolean }` — `true` sse ao menos uma foi abandonada; sem nada cancelável em voo, `false`, sem erro e sem efeito.
3. **A promessa do gesto assentando na hora**: `resolveAskSnapshot` e `sendChatTurn` rejeitam **imediatamente** ao serem abandonadas, com mensagens pinadas (`Pergunta cancelada pelo usuário.` / `Turno cancelado pelo usuário.`), sem esperar o trabalho subjacente.
4. **Contenção dos efeitos do trabalho abandonado**, já que ele não pode ser abortado dentro do Core: nenhum fato `learned` é persistido, nenhuma conversa do Context é atualizada, o Core do `ask` ainda é desligado (`shutdown`) quando o trabalho assenta, e a rejeição do trabalho abandonado nunca vira *unhandled rejection*.
5. **Contenção de consentimento pegajosa por sessão**: enquanto houver turno abandonado **não assentado** numa sessão de chat, o `ConfirmPort` daquela sessão **nega tudo** (sem abrir diálogo), e nenhum turno novo é aceito **naquela sessão**. Para o `ask`, cujo Core é exclusivo da operação, a contenção é por operação. Nenhuma ação destrutiva é jamais aprovada em nome de um turno abandonado.
6. **Predicados nomeados** sobre um **registro único** de operações no `core-bridge`, substituindo o par `busySessions`/`inFlightOperations`:
   - `hasInFlightOperation()` — **predicado de segurança**, inclui operações abandonadas ainda não assentadas; consumidores e semântica **inalterados** (`updatePersona`, `selectPermissionRoots` ×2). Cancelar **não** destrava a aplicação de política de permissões nem a edição da Persona ativa enquanto um Core abandonado ainda estiver vivo;
   - `hasActiveOperation()` — **predicado conversacional**, ignora as abandonadas; passa a ser a guarda de entrada de `resolveAskSnapshot`/`sendChatTurn` (no lugar de `hasInFlightOperation()`, SPEC-0050). É o que devolve ao usuário o direito de perguntar de novo logo após cancelar;
   - `hasAbandonedTurnForSession(session)` — **predicado por sessão**, verdadeiro enquanto um turno abandonado daquela sessão não assentou; governa a recusa de turno novo **naquela** sessão e a negação pegajosa do `ConfirmPort` dela;
   - `hasChatTurnOperation()` — expressão do predicado **parcial** que `selectPersona` já usava inline (`busySessions.size > 0`), com comportamento observável preservado (inclui as abandonadas).
7. **Canal IPC novo** `'atlas:cancel'` (`ipcMain.handle` em `main.ts`, casca fina) exposto como `window.atlas.cancel()` no `preload.cjs`.
8. **Aviso de transparência no renderer**: um cancelamento bem-sucedido acrescenta, ao lado da mensagem de cancelamento, uma linha pinada dizendo o que o trabalho abandonado **ainda pode fazer** (concluir ações de arquivo já autorizadas) e o que ele **bloqueia** até assentar (turnos novos naquela conversa e painéis de configuração) — o usuário nunca fica sem explicação para uma recusa ou um efeito posterior.
9. **Cobertura**: um arquivo de teste novo para o cancelamento no bridge, extensões nos arquivos de `core-bridge` por assunto já existentes, e cobertura de renderer (botões, fiação, aviso) sobre o harness `jsdom` das SPECs 0045/0047.

Sem ADR novo, sem contrato novo em `@atlas/contracts`, sem cancelamento dentro do Core, sem dependência nova, sem tocar `packages/*` nem `apps/cli`.

---

# Motivação

**Candidato nomeado pelo gate arquitetural, escolhido pelo usuário.** O achado A3 do gate da SPEC-0049 registrou que um turno que não assenta deixa a app **sem gesto de escape até ser reaberta**. A SPEC-0050 elevou explicitamente a importância do item (Observações, "Interação com cancelamento"; DoD-d.2) porque estendeu a mesma exposição ao main process: com as guardas estruturais de `resolveAskSnapshot`/`sendChatTurn`, uma operação travada agora bloqueia também o `core-bridge`, não só a UI. O item está listado em `docs/05-context/NEXT_CONTEXT.md` ("Próximo Trabalho" → "Sobre a SPEC-0050") e em `apps/desktop/CLAUDE.md` ("Candidatos futuros já nomeados").

**O que hoje trava, concretamente.** Um `ask` ou um turno de chat sobe/usa um Core que chama o Model Gateway (provedor `local`, Ollama por HTTP) e pode executar Tools. Não há timeout no caminho `ask`/`respond`, nem cancelamento implementado. Se o modelo demora, o servidor não responde ou o plano não assenta: o `#ask-submit`/`#chat-send` fica cinza (SPECs 0048/0049), o painel de permissões e o de Persona ficam desabilitados (SPECs 0037/0038), e desde a SPEC-0050 o próprio bridge recusa qualquer novo `ask`/turno. **A única saída é fechar a janela** — o que, além de perder o transcript, é exatamente o oposto do que o PRD pede em "informar o andamento das tarefas em execução" e nos Critérios de Qualidade ("simplicidade para o usuário", "transparência"). O CLI sempre teve `Ctrl-C`; a GUI nunca teve equivalente.

**O que é honestamente entregável sem sair de `apps/desktop`.** Cancelamento **tem** dono arquitetural previsto — o Module Catalog atribui ao **Runtime** os "mecanismos de cancelamento e recuperação" e lista `cancelled` entre os estados mínimos do **Task Manager**, e `NEXT_CONTEXT.md` já registra "Task Manager completo (fila/retry/timeout/cancelamento)" entre os candidatos abertos. O que **não** existe é a implementação: `atlas.cognitive.ask`/`respond` não recebem sinal, e `AtlasPlatform` não expõe aborto. Construí-la agora atravessaria `@atlas/contracts` e ao menos três módulos do catálogo (Cognitive, Runtime/Task Manager, Model Gateway) — **ADR obrigatório e decisão humana** (Emenda v1.1). Esta SPEC portanto **não** implementa cancelamento real: implementa **desistência** (abandono), que é decisão de aplicação e cabe inteira no `core-bridge`:

- o usuário para de esperar (a promessa assenta na hora, a UI volta a responder);
- o resultado do trabalho abandonado é **descartado** (nada é commitado: nem conversa, nem memória);
- o trabalho abandonado não obtém consentimento novo: o `ConfirmPort` da sessão/operação afetada nega tudo enquanto ele não assentar;
- a conversa afetada fica **em quarentena** até o trabalho abandonado assentar (nenhum turno novo nela), porque nada na documentação sustenta dois `respond` concorrentes no mesmo Core e na mesma sessão;
- o que o trabalho abandonado ainda pode fazer (uma Tool não destrutiva já autorizada pela política vigente, dentro de `writeRoots`) fica **registrado e dito ao usuário**, não escondido — é o preço explícito de não haver cancelamento no Runtime.

**Por que os predicados separados, e não simplesmente "cancelou, liberou tudo".** Liberar o predicado inteiro faria `selectPermissionRoots` aplicar uma política nova enquanto um Core abandonado ainda executa Tools sob a política antiga — exatamente o buraco que a correção A6/A7 da SPEC-0038 fechou, e um enfraquecimento direto do ADR-0013. O predicado de segurança portanto **continua contando as operações abandonadas**; só o conversacional as ignora; e a sessão que tem trabalho abandonado fica em quarentena própria. Cancelar devolve o direito de conversar — num `ask` ou numa conversa nova —, nunca o direito de reconfigurar privilégio nem de disputar o mesmo Core.

Rastreabilidade documental:

- **PRD**, *Requisitos Funcionais → Execução* (l. 105-113: "executar tarefas autorizadas pelo usuário", "informar o andamento das tarefas em execução"), *→ Planejamento* (l. 101, "permitir acompanhamento do progresso"), *→ Transparência* (l. 149-151) e *Critérios de Qualidade* (l. 203-205). O escopo do MVP prevê "interação por texto" e "execução de tarefas locais" numa interface — uma operação sem escape não é uma execução acompanhável.
- **Roadmap**, Fase 2 / 2.2 e o Critério de Conclusão da Fase 2 ("sem regressão de capacidade" frente ao CLI, que tem `Ctrl-C`).
- **Module Catalog** — Runtime ("mecanismos de cancelamento e recuperação") e Task Manager (estado `cancelled`) são os donos previstos do cancelamento real, hoje não implementado; `apps/desktop` é aplicação (Input/Output Gateway), não módulo do catálogo, e nenhuma responsabilidade se move aqui.
- **Constituição**, Artigo 1 (a garantia publicada em `apps/desktop/CLAUDE.md` é reescrita junto), Artigo 4 (a decisão vive na aplicação), Artigo 7 (o usuário vê "cancelado" e o que isso significa, não Planner/Runtime), invariante 8 (nada de comportamento não documentado — daí a quarentena de sessão), Artigo 11 (nenhum estado persistente novo) e o teste padrão.
- **SPEC-0050** (Observações + DoD-d.2) e **SPEC-0049** (achado A3 do gate) — origem direta do item.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Execução, Planejamento, Transparência, Critérios de Qualidade
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 1, 4, 7, 11 e invariante 8; Emendas v1.1 e v1.2
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Runtime (cancelamento e recuperação) e Task Manager (estado `cancelled`): donos previstos do cancelamento real, **não implementados** e fora desta SPEC; nenhum módulo é tocado
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.2 e Critério de Conclusão da Fase 2
- [Development Guide](../../04-engineering/DevelopmentGuide.md)
- [ClaudeCodeAutomation](../../04-engineering/ClaudeCodeAutomation.md) — "Ramo micro", "Verificação escopada"
- [ADR-0019 — stack Electron](../../06-adr/ADR-0019-desktop-electron-stack.md) — sem bundler no renderer, Core só no main; **intacto**
- [ADR-0013 — Permission Service como portão de execução](../../06-adr/ADR-0013-permission-service-execution-gate.md) — **intacto**; o predicado de segurança não é enfraquecido e o `confirm` reservado segue fail-closed
- [ADR-0009 — Context Service](../../06-adr/ADR-0009-context-service-value-store.md) — a mediação de `sendChatTurn` continua sendo da aplicação; um turno abandonado simplesmente **não** grava a conversa de volta, e a sessão fica em quarentena até ele assentar
- [ADR-0011 — Memory Service](../../06-adr/ADR-0011-memory-service-persistence.md) — um turno/`ask` abandonado não persiste `learned`
- [SPEC-0050](./SPEC-0050-core-bridge-structural-gesture-serialization.md) (`Done`) — guardas estruturais de `resolveAskSnapshot`/`sendChatTurn`; esta SPEC refina **qual** predicado elas consultam
- [SPEC-0049](./SPEC-0049-desktop-ask-form-serialization-and-error-surfacing.md) (`Done`) — `#ask-submit`, `refreshAskControls()` e o `.catch` do `#ask-form`
- [SPEC-0048](./SPEC-0048-desktop-chat-send-ask-serialization.md) (`Done`) — `refreshChatControlsForMic()` como origem única
- [SPEC-0046](./SPEC-0046-desktop-voice-input-stt.md) (`Done`) — precedente de botão "Cancelar" (`#mic-cancel-button`) e de canal `'atlas:stt:cancel'`; **não é alterado**
- [SPEC-0038](./SPEC-0038-desktop-permission-roots-gui.md) (`Done`) — `inFlightOperations`, correções A6/A7, recusas de `selectPermissionRoots`
- [SPEC-0039](./SPEC-0039-desktop-persona-authoring.md) (`Done`) — guarda de `updatePersona`
- [SPEC-0037](./SPEC-0037-desktop-runtime-persona-switch.md) (`Done`) — `busySessions` e o predicado parcial de `selectPersona`
- [SPEC-0033](./SPEC-0033-desktop-visual-chat.md) / [SPEC-0032](./SPEC-0032-desktop-confirm-steps-adapters.md) (`Done`) — chat vivo (uma porta de confirmação **por sessão**) e `ask` com `ConfirmPort` próprio
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) / [SPEC-0047](./SPEC-0047-renderer-parity-gate-and-panel-coverage.md) (`Done`) — harness `jsdom` e cobertura comportamental dos painéis
- [SPEC-0042](./SPEC-0042-test-split-scoped-verification.md) (`Done`) — suíte de `core-bridge` dividida por assunto
- `apps/desktop/CLAUDE.md` — "Rastreio de operação em voo", "Serialização de gestos", "Portas fail-closed"

---

# Escopo

## Frente 1 — registro único de operações e os predicados (`core-bridge.ts`)

Substituir o par `busySessions: Set<SessionId>` / `inFlightOperations: number` por **um** registro de operações em voo:

- um tipo interno `OperationRecord` com, no mínimo: `kind: 'ask' | 'chat-turn' | 'open-session'`, `session?: SessionId` (só em `'chat-turn'`), `abandoned: boolean` e o meio de rejeitar a promessa do gesto (ex.: o `reject` de um *deferred* criado na entrada da função);
- um `Set<OperationRecord>` de módulo, alimentado por `resolveAskSnapshot` (`'ask'`), `sendChatTurn` (`'chat-turn'`) e `openChatSession` (`'open-session'`), sempre **antes do primeiro `await`** e sempre removido no `finally` do trabalho real (não no da promessa devolvida ao chamador — ver Frente 2);
- predicados nomeados, únicos pontos de decisão (nenhuma condição reescrita inline em nenhum consumidor):

| Predicado | Definição | Consumidores |
|---|---|---|
| `hasInFlightOperation()` | registro **não vazio** (inclui abandonadas) | `updatePersona` (1), `selectPermissionRoots` (2 — passos 3 e 5) |
| `hasActiveOperation()` | existe registro com `abandoned === false` | `resolveAskSnapshot` (1), `sendChatTurn` (1) |
| `hasAbandonedTurnForSession(session)` | existe registro `kind === 'chat-turn'` daquela `session` com `abandoned === true` | `sendChatTurn` (1, quarentena — D15), envelope do `ConfirmPort` da sessão (D8) |
| `hasChatTurnOperation()` | existe registro `kind === 'chat-turn'` (inclui abandonadas) | `selectPersona` (1) |

`__resetBridgeStateForTests()` passa a limpar o registro único (mantendo o comportamento documentado de **não** fechar sessões vivas — SPEC-0042/D15 segue aberto).

As mensagens de recusa existentes (`selectPersona`, `updatePersona`, `selectPermissionRoots`, guardas da SPEC-0050) **não mudam**.

## Frente 2 — abandono em `resolveAskSnapshot` e `sendChatTurn`

Cada uma das duas funções passa a devolver ao chamador uma promessa que assenta pelo **primeiro** de dois desfechos: o trabalho real, ou o abandono.

- **Abandono ⇒ rejeição imediata**, com mensagem pinada:
  - `resolveAskSnapshot` → `Pergunta cancelada pelo usuário.`
  - `sendChatTurn` → `Turno cancelado pelo usuário.`
- **O trabalho real segue destacado** e, ao assentar (com sucesso ou erro):
  - se a operação foi abandonada, o resultado é **descartado**: nenhum `atlas.memory.remember(...)` é chamado, nenhum `atlas.context.updateConversation(...)` é chamado, nada é devolvido a ninguém;
  - o `atlas.shutdown()` do `ask` continua acontecendo no mesmo `finally` de hoje;
  - o registro da operação é removido nesse mesmo `finally` — é isto que faz `hasInFlightOperation()` e `hasAbandonedTurnForSession(...)` voltarem a `false` só quando o trabalho abandonado de fato encerra;
  - uma rejeição do trabalho abandonado é **absorvida** (nunca *unhandled rejection*, nunca dupla rejeição da promessa já assentada).
- **Guardas de entrada de `sendChatTurn`**, nesta ordem exata:
  1. `mustGetChatSession(session)` — erro de estrutura antes de erro de estado (D4 da SPEC-0050, preservada);
  2. `hasAbandonedTurnForSession(session)` ⇒ recusa com a mensagem pinada `Não é possível enviar o turno: o turno cancelado desta conversa ainda está encerrando.` (**quarentena de sessão**, D15);
  3. `hasActiveOperation()` ⇒ recusa com a mensagem pinada da SPEC-0050 (`Não é possível enviar o turno: há uma operação em andamento.`), inalterada.
- A guarda de entrada de `resolveAskSnapshot` passa a consultar `hasActiveOperation()`, mantendo a posição estabelecida pela SPEC-0050 (antes de qualquer `await` e antes do registro).
- A sessão de chat **não** é fechada por um cancelamento: `chatSessions` fica intacto, a conversa segue exatamente como estava antes do turno, e a sessão volta a aceitar turnos assim que o trabalho abandonado assentar.

## Frente 3 — contenção de consentimento: `ConfirmPort` fail-closed **pegajoso por sessão**

O `ConfirmPort` injetado em `createAtlas` passa a ser **envolvido** por um adaptador interno do `core-bridge`, com alcance igual ao alcance real da porta:

- **Chat** — a porta é injetada **uma vez, em `openChatSession`**, e vive pela sessão inteira; o envelope é portanto **por sessão** e **pegajoso**: enquanto `hasAbandonedTurnForSession(session)` for verdadeiro, `request()` resolve `false` **sem** chamar a porta injetada (nenhum diálogo novo é aberto), independentemente de qual turno originou o pedido. Como a sessão está em quarentena (D15), nenhum turno legítimo é penalizado por isso.
- **`ask`** — o Core é exclusivo da operação; o envelope é vinculado ao `OperationRecord` daquele `ask` e nega a partir do abandono dele.
- Em ambos: se a porta injetada já estava **pendente** quando o abandono ocorreu, a resposta que chegar depois é **descartada** e o resultado é `false`.
- O envelope nunca lança, nunca altera o `ActionRequest` e é transparente enquanto não há abandono (delega e devolve o valor tal e qual).

O `fallbackConfirm` fail-closed e as três portas de diálogo (`confirm-port.ts`, `permission-grant-dialog.ts`, `persona-delete-dialog.ts`) **não são tocadas**.

## Frente 4 — `cancelInFlightOperation()` + IPC

- `core-bridge.ts` exporta `cancelInFlightOperation(): CancelOutcome`, **síncrona**, onde `CancelOutcome = { readonly cancelled: boolean }`. Marca `abandoned = true` e dispara a rejeição pinada de **toda** operação cancelável (`'ask'` e `'chat-turn'`) ainda não abandonada; devolve `{ cancelled: true }` se ao menos uma foi marcada, `{ cancelled: false }` caso contrário. Operações `'open-session'` **não** são canceláveis e são ignoradas. Chamar duas vezes é idempotente (a 2ª devolve `{ cancelled: false }`).
- `main.ts` (casca fina): `ipcMain.handle('atlas:cancel', () => cancelInFlightOperation())`.
- `preload.cjs`: `cancel: () => ipcRenderer.invoke('atlas:cancel')` no mesmo objeto exposto por `contextBridge` (`window.atlas.cancel()`).

## Frente 5 — renderer (`index.html` + `renderer.js`)

- `index.html`: dois botões novos, no molde de `#mic-cancel-button` (atributo `hidden`, `type="button"`): `#ask-cancel` (dentro de `#ask-form`, ao lado de `#ask-submit`) e `#chat-cancel` (dentro de `#chat-form`, ao lado de `#chat-send`). Nenhum outro elemento novo.
- `renderer.js`:
  - `refreshAskControls()` (origem única, SPEC-0049) passa a controlar também `#ask-cancel`: `hidden = !askInFlight`, `disabled = !askInFlight`;
  - `refreshChatControlsForMic()` (origem única, SPEC-0048) passa a controlar também `#chat-cancel`: `hidden = !chatTurnInFlight`, `disabled = !chatTurnInFlight`;
  - o `click` de cada botão chama `window.atlas.cancel()` e, quando a resposta for `{ cancelled: true }`, marca uma flag local `cancelNoticePending = true`. O handler **não** escreve texto nem mexe em `askInFlight`/`chatTurnInFlight` (que caem sozinhos pelo `.finally` do gesto, quando a promessa rejeitar);
  - o `.catch` do `#ask-form` (SPEC-0049) e o `.catch` do `#chat-form` seguem pintando `⚠️ <mensagem>`; quando `cancelNoticePending` estiver marcada, acrescentam **depois** a linha pinada de transparência e limpam a flag:

    ```
    ⏳ Cancelado: o trabalho já iniciado continua encerrando em segundo plano — ações de arquivo já autorizadas ainda podem concluir; até ele assentar, esta conversa não aceita turnos novos e os painéis de configuração podem recusar.
    ```

  - nenhum outro comportamento do renderer muda: `#objective`/`#chat-input` seguem fora da serialização (D3 das SPECs 0048/0049), `micBusy()` segue fora de `#ask-submit` (D5 da SPEC-0049), o botão de microfone e seu "Cancelar" próprio seguem intactos.

## Frente 6 — cobertura

1. **Novo** `apps/desktop/tests/core-bridge.cancellation.test.ts` (assunto próprio, molde SPEC-0042): abandono de `ask` e de turno de chat, descarte de efeitos, contenção pegajosa do `ConfirmPort`, quarentena de sessão, idempotência, `{ cancelled: false }` sem operação em voo, ausência de *unhandled rejection*, e a **assimetria dos predicados** (depois de cancelar: `ask` novo e sessão nova aceitos; a sessão afetada, `selectPermissionRoots` e `updatePersona` recusando até o trabalho abandonado assentar).
2. `apps/desktop/tests/core-bridge.status-ask.test.ts` e `core-bridge.chat-session.test.ts` (existentes, estendidos): não-regressão das guardas da SPEC-0050 sob os predicados novos, incluindo a ordem das três guardas de `sendChatTurn`.
3. `apps/desktop/tests/core-bridge.permissions.test.ts` (existente, estendido): caso novo provando que uma operação **abandonada** ainda bloqueia `selectPermissionRoots`, e que os casos existentes (inclusive a rechecagem A7) seguem verdes sem enfraquecimento.
4. `apps/desktop/tests/renderer.gesture-serialization.test.ts` (existente, estendido) e `apps/desktop/tests/helpers/renderer-harness.ts` (dublê de `window.atlas.cancel`): visibilidade dos dois botões, chamada registrada, aviso pinado escrito uma única vez, e nenhum efeito ao clicar quando não há operação em voo.

`core-bridge.persona-authoring.test.ts` e os demais `renderer.*.test.ts` **não são editados** — rodam como não-regressão.

---

# Fora do Escopo

- **Cancelamento real dentro do Core** — `AbortSignal`/`CancellationToken` em `@atlas/contracts`, `cognitive.ask`/`respond`, **Runtime** ("mecanismos de cancelamento e recuperação", Module Catalog) ou **Task Manager** (estado `cancelled`; item "Task Manager completo (fila/retry/timeout/cancelamento)" já aberto em `NEXT_CONTEXT.md`). O dono arquitetural existe, a implementação não; construí-la atravessa `@atlas/contracts` e ≥ 3 módulos ⇒ **ADR + decisão humana** (Emenda v1.1). Esta SPEC entrega desistência, não aborto, e registra a diferença em doc viva e nas lições.
- **Timeout automático** de `ask`/turno — política de produto não pedida; o gesto aqui é sempre humano.
- **Cancelar `openChatSession`** — segue marcando e não sendo cancelável nem guardada (D5 da SPEC-0050, intacta).
- **Cancelar `resolveStatusSnapshot`/`resolveMemorySnapshot`/`forgetFact`** — não rastreadas por desenho (SPEC-0038/D10) e curtas.
- **Permitir turno novo na sessão com turno abandonado** (reentrância de `respond` no mesmo Core/`SessionId`) — nada na documentação a sustenta (D15). Se um dia for desejável, exige evidência do Core e SPEC própria.
- **Fechar/recriar a sessão automaticamente ao cancelar** para contornar a quarentena — perderia o transcript e o histórico do Context por causa de um cancelamento; candidato nomeado, não feito aqui.
- **Tornar os `dialog.showMessageBox` modais com `BrowserWindow` pai** — mitigaria o diálogo fantasma (D16) e a corrida tratada em `selectPermissionRoots`, mas é **fatia própria**, explicitamente apontada pelo gate como a não incorporar aqui.
- **Alterar o cancelamento de STT/TTS** (`'atlas:stt:cancel'`, `'atlas:tts:cancel'`, `#mic-cancel-button`) ou unificá-lo com o novo: propósitos distintos (motor local × round-trip cognitivo).
- **Fila/enfileiramento ou retry** do gesto cancelado.
- **Canal de push (`webContents.send`) avisando o renderer quando o trabalho abandonado assenta** — hoje todos os canais do app são `invoke`/`handle`. Consequência aceita e registrada: os painéis de configuração voltam a parecer habilitados após o cancelamento e podem **recusar** com a mensagem existente até o trabalho assentar — daí a linha de aviso pinada da Frente 5. Vira candidato nomeado.
- **Mudar as mensagens de recusa existentes** (`selectPersona`/`updatePersona`/`selectPermissionRoots`/guardas da SPEC-0050) — candidato nomeado.
- **Uniformizar `selectPersona` sobre o predicado de segurança** (D12 da SPEC-0050) — segue aberto; aqui o predicado parcial é apenas **nomeado**.
- **Pinar `micBusy()` fora de `#ask-submit` por teste** (D5 da SPEC-0049) — candidato independente.
- **Fechar sessões vivas em `__resetBridgeStateForTests()`** (SPEC-0042/D15) e **quebrar `core-bridge.ts`/`renderer.js` em arquivos menores** (SPEC-0042/D8).
- **Classe de erro dedicada exportada** (`CancelledOperationError`) — D3 da SPEC-0050 preservada.
- **Persistir qualquer coisa** sobre cancelamentos (log, histórico, contador) — Artigo 11.
- **Confirmação de smoke visual/sonoro** em ambiente gráfico — pendência conhecida e ortogonal.
- Qualquer alteração em `packages/*`, `apps/cli`, `@atlas/contracts`, `piper-tts.ts`, `stt-engine.ts`, `speech-output.ts`, `media-permission.ts`, portas de diálogo, CSP/CSS, CI, `pnpm-lock.yaml` ou `vitest.config.ts`.

---

# Pré-requisitos

- [SPEC-0050](./SPEC-0050-core-bridge-structural-gesture-serialization.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece as guardas de entrada refinadas aqui e nomeia este item.
- [SPEC-0049](./SPEC-0049-desktop-ask-form-serialization-and-error-surfacing.md) — `Done` (verificado). Fornece `#ask-submit`, `refreshAskControls()` e o `.catch` do `#ask-form`.
- [SPEC-0048](./SPEC-0048-desktop-chat-send-ask-serialization.md) — `Done` (verificado). Fornece `refreshChatControlsForMic()` como origem única.
- [SPEC-0046](./SPEC-0046-desktop-voice-input-stt.md) — `Done` (verificado). Fornece o molde de botão "Cancelar", de canal de cancelamento e o harness com relógio injetável.
- [SPEC-0047](./SPEC-0047-renderer-parity-gate-and-panel-coverage.md) — `Done` (verificado). Fornece `renderer.gesture-serialization.test.ts`.
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) — `Done` (verificado). Fornece `helpers/renderer-harness.ts`.
- [SPEC-0042](./SPEC-0042-test-split-scoped-verification.md) — `Done` (verificado). Fornece a divisão por assunto e `helpers/core-bridge-harness.ts`.
- [SPEC-0039](./SPEC-0039-desktop-persona-authoring.md) / [SPEC-0038](./SPEC-0038-desktop-permission-roots-gui.md) / [SPEC-0037](./SPEC-0037-desktop-runtime-persona-switch.md) — `Done` (verificados). Fornecem os consumidores do predicado de segurança que não podem regredir.
- [SPEC-0033](./SPEC-0033-desktop-visual-chat.md) / [SPEC-0032](./SPEC-0032-desktop-confirm-steps-adapters.md) — `Done` (verificados). Fornecem as duas operações canceláveis e o alcance real de cada `ConfirmPort`.

Nenhum package precisa de comportamento novo.

---

# Critérios de Aceitação

> **Convenção de medição (CA 1, 2 e 24):** todo critério de diff e de contagem é medido contra o **commit-base registrado no passo 1 da Estratégia de Implementação** (`git rev-parse HEAD` antes de qualquer edição) e diz respeito **apenas ao diff atribuível a esta SPEC**. Alteração alheia já presente na árvore deve ser reportada, não incorporada nem revertida.

1. O diff atribuível a esta SPEC contém **exatamente** os doze arquivos listados em "Arquivos Esperados" — verificável por `git diff --name-only <commit-base>..HEAD`.
2. Nenhum arquivo sob `packages/`, `apps/cli/`, `.github/`, nem `apps/desktop/src/piper-tts.ts`/`stt-engine.ts`/`speech-output.ts`/`media-permission.ts`/`confirm-port.ts`/`permission-grant-dialog.ts`/`persona-delete-dialog.ts`/`steps-view.ts` aparece nesse diff. `apps/desktop/tests/core-bridge.persona-authoring.test.ts` e os demais `renderer.*.test.ts` também não.
3. `core-bridge.ts` tem **um único** registro de operações em voo (nenhum contador ou `Set` paralelo) e **quatro** predicados nomeados — `hasInFlightOperation()`, `hasActiveOperation()`, `hasAbandonedTurnForSession(session)`, `hasChatTurnOperation()` —, com estes consumidores: `updatePersona` (1× segurança), `selectPermissionRoots` (2× segurança), `resolveAskSnapshot` (1× ativo), `sendChatTurn` (1× por sessão **e** 1× ativo), `selectPersona` (1× parcial), envelope do `ConfirmPort` de sessão (1× por sessão). Nenhuma condição equivalente é reescrita inline; **nenhuma guarda existente é removida ou movida** — reduzir consumidores nunca é caminho para fechar este critério.
4. `cancelInFlightOperation()` é exportada, **síncrona**, devolve `{ cancelled: boolean }`, nunca lança, e não abre, sobe nem desliga nenhum Core.
5. Teste: sem nenhuma operação em voo, `cancelInFlightOperation()` devolve `{ cancelled: false }` e não produz efeito observável algum (um `ask` disparado logo depois resolve normalmente).
6. Teste: com um `ask` em voo, `cancelInFlightOperation()` devolve `{ cancelled: true }` e a promessa de `resolveAskSnapshot` **rejeita com a mensagem exata** `Pergunta cancelada pelo usuário.` **antes** de o trabalho subjacente assentar (o dublê que segura o trabalho só é liberado depois da asserção de rejeição).
7. Teste: com um turno de chat em voo, `cancelInFlightOperation()` devolve `{ cancelled: true }` e `sendChatTurn` rejeita com a mensagem exata `Turno cancelado pelo usuário.`; a sessão **permanece viva** (`closeChatSession` posterior funciona) e a conversa fica **inalterada** — verificável porque o turno seguinte (aceito só **depois** de o trabalho abandonado assentar, CA 13) parte da mesma conversa de antes do turno cancelado.
8. Teste: um `ask` abandonado **não persiste** `learned` — nenhum `atlas.memory.remember` é chamado depois do abandono, e um `resolveMemorySnapshot` posterior não mostra o fato que o trabalho abandonado teria gravado.
9. Teste: um turno abandonado **não chama** `atlas.context.updateConversation` nem persiste `learned`, mesmo quando o trabalho subjacente assenta com sucesso depois do cancelamento.
10. Teste: o Core de um `ask` abandonado ainda é desligado — `atlas.shutdown()` é chamado exatamente uma vez quando o trabalho assenta.
11. Teste (contenção do `ConfirmPort`, caminho `ask`): uma requisição de confirmação disparada **depois** do abandono resolve `false` sem chamar a porta injetada; uma requisição **pendente** no momento do abandono resolve `false` mesmo que a porta injetada responda `true` depois. Sem abandono, o envelope é transparente (`true` continua `true`, `false` continua `false`).
12. Teste (contenção **pegajosa por sessão**, caminho chat — cenário exato do achado A1): abrir a sessão S, disparar o turno T1, cancelar T1 e, **com o trabalho de T1 ainda vivo**, disparar pela porta da sessão uma requisição de confirmação: ela resolve `false` **sem** abrir diálogo (a porta injetada não é chamada), mesmo que o teste force a porta a responder `true`. Depois de T1 assentar e a quarentena cair, uma requisição nova volta a ser delegada normalmente à porta injetada.
13. Teste (**quarentena de sessão**, D15): com T1 abandonado e não assentado, `sendChatTurn` na **mesma** sessão rejeita com a mensagem exata `Não é possível enviar o turno: o turno cancelado desta conversa ainda está encerrando.`, sem chamar `atlas.cognitive.respond`; depois de T1 assentar, o mesmo `sendChatTurn` é aceito e resolve normalmente.
14. Teste (assimetria dos predicados — o coração da SPEC): com um turno abandonado e ainda não assentado, (a) um `resolveAskSnapshot` novo é **aceito**; (b) um `sendChatTurn` numa **sessão diferente** é **aceito**; (c) `sendChatTurn` na sessão afetada **recusa** (CA 13); (d) `selectPermissionRoots` **recusa** com a mensagem existente; (e) `updatePersona` sobre a Persona ativa **recusa** com a mensagem existente. Depois de o trabalho abandonado assentar, (c), (d) e (e) voltam a ser aceitos.
15. Teste: `cancelInFlightOperation()` é idempotente — a 2ª chamada seguida devolve `{ cancelled: false }` e não provoca segunda rejeição nem erro.
16. Teste: nenhum caso desta SPEC produz *unhandled rejection* — o trabalho abandonado que rejeita depois do cancelamento é absorvido (verificável por um listener de `unhandledrejection`/`unhandledRejection` instalado no caso e removido em `finally`, ou dublê equivalente sem `setTimeout` real).
17. **Não-regressão das guardas da SPEC-0050**: com um `ask` **ativo** (não cancelado), um 2º `ask` e um `sendChatTurn` seguem rejeitando com as mensagens pinadas daquela SPEC; a ordem `mustGetChatSession` → quarentena → operação ativa vale nesta sequência (handle desconhecido durante operação em voo ⇒ erro de sessão desconhecida; sessão em quarentena durante um `ask` ativo ⇒ mensagem de quarentena).
18. **Não-regressão de `selectPermissionRoots`**: todos os casos de `core-bridge.permissions.test.ts` seguem verdes sem enfraquecimento (única edição autorizada: **adicionar** casos/asserções), inclusive a rechecagem A7.
19. **Não-regressão de `selectPersona`/`updatePersona`**: `core-bridge.persona-authoring.test.ts` segue verde **sem edição**, e o comportamento observável de `selectPersona` (turno de chat em voo bloqueia a troca; um `ask` em voo **não** bloqueia) é **idêntico** ao de antes desta SPEC.
20. Renderer: `#ask-cancel` e `#chat-cancel` existem em `index.html`, começam `hidden`, e ficam visíveis/habilitados **sse** `askInFlight` / `chatTurnInFlight`, respectivamente — cada um calculado **apenas** em `refreshAskControls()` / `refreshChatControlsForMic()` (origem única; nenhum `.finally` atribui `hidden`/`disabled` desses botões diretamente).
21. Renderer (teste sobre o harness `jsdom`): clicar em `#chat-cancel` durante um turno em voo chama `window.atlas.cancel()` exatamente uma vez; ao a promessa do turno rejeitar, o transcript recebe a linha `⚠️ Turno cancelado pelo usuário.` **e**, logo depois, a linha exata

    ```
    ⏳ Cancelado: o trabalho já iniciado continua encerrando em segundo plano — ações de arquivo já autorizadas ainda podem concluir; até ele assentar, esta conversa não aceita turnos novos e os painéis de configuração podem recusar.
    ```

    A mesma prova vale para `#ask-cancel`/`#ask-result`. O aviso aparece **uma única vez** (uma rejeição não-cancelada seguinte não o repete).
22. Renderer: com `window.atlas.cancel()` devolvendo `{ cancelled: false }`, nenhum aviso é escrito e nenhum estado de botão muda.
23. O gate de paridade renderer↔módulo segue verde **sem edição**: `renderer.speech-parity.test.ts` não aparece no diff (o `core-bridge.ts` não é módulo vigiado; nenhuma lógica de módulo TS é replicada no renderer por esta SPEC — a fiação nova é DOM puro).
24. **Delta de suíte** sobre a base observada no passo 1 (esperada: **983 testes / 74 arquivos**): `pnpm test` na raiz passa, o delta de arquivos é **+1** (`core-bridge.cancellation.test.ts`) e o total de testes sobe em **+18 ou mais**. Se a base observada divergir, prevalece a observada e a divergência é reportada.
25. `pnpm --filter @atlas/desktop test` e `pnpm --filter @atlas/desktop typecheck` passam; cada arquivo de teste tocado passa **sozinho**; a suíte de `apps/desktop` passa sob `--sequence.shuffle` em **duas** sementes distintas (o risco desta fatia é estado de módulo).
26. `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm format:check` passam na raiz.
27. Nenhum teste desta SPEC executa processo externo, abre socket, faz chamada de rede real, usa `setTimeout` real como sincronização, ou depende de Piper/whisper/Electron instalados.

---

# Arquivos Esperados

```text
apps/desktop/src/core-bridge.ts                             (modificado — Frentes 1, 2, 3, 4)
apps/desktop/src/main.ts                                    (modificado — handler 'atlas:cancel')
apps/desktop/src/preload.cjs                                (modificado — window.atlas.cancel)
apps/desktop/src/renderer/index.html                        (modificado — #ask-cancel, #chat-cancel)
apps/desktop/src/renderer/renderer.js                       (modificado — Frente 5)
apps/desktop/tests/core-bridge.cancellation.test.ts         (novo — Frente 6.1)
apps/desktop/tests/core-bridge.status-ask.test.ts           (modificado — Frente 6.2)
apps/desktop/tests/core-bridge.chat-session.test.ts         (modificado — Frente 6.2)
apps/desktop/tests/core-bridge.permissions.test.ts          (modificado — Frente 6.3)
apps/desktop/tests/renderer.gesture-serialization.test.ts   (modificado — Frente 6.4)
apps/desktop/tests/helpers/renderer-harness.ts              (modificado — dublê de window.atlas.cancel)
docs/implementation/specs/SPEC-0051-desktop-cancel-in-flight-operation.md
```

**Nenhum outro arquivo no diff atribuível a esta SPEC.** Arquivo alheio já modificado na árvore no início do trabalho não pertence a esta SPEC: reportar, não incorporar nem reverter.

---

# Componentes Impactados

- `@atlas/desktop` — `src/core-bridge.ts`, `src/main.ts` (casca fina), `src/preload.cjs`, `src/renderer/index.html`, `src/renderer/renderer.js` e testes.

Nenhum módulo do Module Catalog é tocado — em particular, o Runtime (dono previsto do cancelamento real) sai intacto. Nenhum módulo novo. Nenhum contrato público alterado. Nenhuma mudança no Permission Service, no Context Service, no Memory Service ou em qualquer decisão dos ADRs 0009/0011/0013/0019/0020/0021/0022. A fronteira de segurança do Electron sai intacta; o `Conversation` continua sem cruzar o IPC.

---

# Interfaces Necessárias

Locais a `apps/desktop` (regra de tipos locais do `apps/desktop/CLAUDE.md` — nada sobe a `@atlas/contracts` sem 2º consumidor real + ADR):

- `CancelOutcome` — `{ readonly cancelled: boolean }`, retorno de `cancelInFlightOperation()` e payload do canal `'atlas:cancel'`.
- `OperationRecord` / `OperationKind` — **internos** ao `core-bridge.ts`, não exportados, não cruzam o IPC.

Nenhuma assinatura pública existente muda: `resolveAskSnapshot` e `sendChatTurn` mantêm parâmetros e tipos de retorno (`AskSnapshot`/`TurnSnapshot`); o cancelamento se expressa como **rejeição** da promessa. Nenhuma classe de erro nova é exportada.

---

# Fluxo Esperado

```text
registro único de operações  (Set<OperationRecord>)
  ├─ 'ask'          ← resolveAskSnapshot     (cancelável, Core EXCLUSIVO da operação)
  ├─ 'chat-turn'    ← sendChatTurn           (cancelável, Core COMPARTILHADO da sessão)
  └─ 'open-session' ← openChatSession        (NÃO cancelável, NÃO guardada — D5/SPEC-0050)

hasInFlightOperation()            = registro não vazio (INCLUI abandonadas)
     └─► updatePersona · selectPermissionRoots (×2)      [segurança — inalterado]
hasActiveOperation()              = existe registro com abandoned === false
     └─► resolveAskSnapshot · sendChatTurn               [conversação — refinado]
hasAbandonedTurnForSession(S)     = existe 'chat-turn' de S abandonado e não assentado
     └─► sendChatTurn (quarentena de S) · ConfirmPort da sessão S (nega tudo)
hasChatTurnOperation()            = existe 'chat-turn' (INCLUI abandonadas)
     └─► selectPersona                                   [parcial — preservado]

usuário clica "Cancelar"
  → window.atlas.cancel() → 'atlas:cancel' → cancelInFlightOperation()
      ├─ marca abandoned = true nas canceláveis ativas
      └─ rejeita AGORA a promessa do gesto ("Pergunta/Turno cancelado pelo usuário.")
                │
                ├─ renderer: .catch pinta ⚠️ + linha ⏳ (aviso pinado)
                │            .finally zera askInFlight/chatTurnInFlight → UI livre
                │
                └─ trabalho real segue destacado
                     ├─ ConfirmPort do ask / da SESSÃO ⇒ sempre false, sem diálogo
                     ├─ sessão em QUARENTENA: nenhum turno novo nela (D15)
                     ├─ ask novo e sessão nova: LIBERADOS
                     ├─ ao assentar: resultado DESCARTADO (sem remember/updateConversation)
                     ├─ ask: atlas.shutdown() como hoje
                     ├─ registro removido ⇒ segurança e quarentena caem juntas
                     └─ rejeição absorvida (nunca unhandled)

ordem das guardas de sendChatTurn:
  mustGetChatSession  →  hasAbandonedTurnForSession(S)  →  hasActiveOperation()
```

---

# Estratégia de Implementação

1. **Registrar o commit-base** (`git rev-parse HEAD`) e a **linha de base real** da suíte (`pnpm test` na raiz — esperado 983 testes / 74 arquivos). Conferir se a árvore está limpa; se não, reportar o que já estava modificado.
2. Reler no fonte, antes de editar: `busySessions`/`inFlightOperations`/`hasInFlightOperation`, `selectPersona`, `updatePersona`, `selectPermissionRoots` (seis etapas + rechecagem A7), `resolveAskSnapshot`, `openChatSession` (**onde o `ConfirmPort` da sessão é injetado** — premissa do achado A1), `sendChatTurn`, `__resetBridgeStateForTests`. Confirmar que `sendChatTurn` **não** injeta porta alguma; se divergir, é achado: **pare e reporte**.
3. **Frente 1 primeiro, como refatoração de comportamento zero**: trocar o par de estruturas pelo registro único e pelos predicados, mantendo os pontos de decisão existentes com comportamento idêntico (sem nada abandonável, `hasActiveOperation()` é equivalente a `hasInFlightOperation()` e a quarentena nunca dispara). Rodar a suíte de `apps/desktop` inteira e exigir **verde sem editar teste algum**. Se algum teste exigir edição aqui, **pare e reporte**.
4. **Depois o teste (RED)**: escrever os casos da Frente 6.1 (CA 5-16) usando o padrão de operação segurada já presente em `core-bridge.permissions.test.ts` (dublê de `fetch` com provedor `local` e portão de liberação, restaurado em `finally`). Escrever **primeiro** os CA 12 e 13 — são os que provam a contenção que motivou a revisão v1.1. Ver falhar pelos motivos esperados e registrar a observação RED no relatório final.
5. Implementar as Frentes 2, 3 e 4 (abandono, envelope pegajoso do `ConfirmPort`, quarentena de sessão, `cancelInFlightOperation` + IPC) até verde.
6. Rodar `core-bridge.permissions.test.ts` e `core-bridge.persona-authoring.test.ts` **inteiros** (CA 18/19): qualquer caso pré-existente que passe a falhar é **achado** — pare e reporte, não "ajuste" o teste e **nunca** enfraqueça uma guarda para fechar um critério. Só então acrescentar os casos novos da Frente 6.3.
7. Frente 5 (renderer + `index.html`) e Frente 6.4 (harness + `renderer.gesture-serialization.test.ts`), nessa ordem; conferir que nenhum outro `renderer.*.test.ts` precisou de edição (CA 2/23 — se precisar, é achado).
8. Fechar com `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` na raiz, as duas sementes embaralhadas de `apps/desktop` (CA 25) e a conferência do diff contra o commit-base (CA 1, 2, 24).

---

# Estratégia de Testes

- **Refatoração provada por não-edição** (passo 3): a Frente 1 é validada por a suíte inteira passar sem tocar nenhum teste.
- **RED antes de GREEN** nos casos de cancelamento (passo 4), começando pelos dois cenários que o gate apontou (confirmação pegajosa e quarentena de sessão).
- **Comportamento observável, nunca introspecção**: nada de exportar o registro ou espiar variáveis de módulo. As asserções são sobre rejeição × resolução, mensagem exata, chamadas registradas em dublês (`createAtlas`, `fetch`, `respond`, `remember`, `updateConversation`, `shutdown`, porta de confirmação injetada) e efeito posterior observável.
- **Recusa e aceitação em pé de igualdade**: todo caso de predicado prova as duas metades (CA 12, 13 e 14 têm todas as direções e o "depois de assentar").
- **Determinismo, sem relógio real**: o trabalho em voo é segurado por um portão explícito (promessa resolvida pelo teste), nunca por `setTimeout`; todo dublê global restaurado em `finally`.
- **Disciplina de sessão** (SPEC-0042): toda sessão aberta é fechada em `finally`; `__resetBridgeStateForTests()` entre casos; suíte sob duas sementes embaralhadas.
- **Renderer por comportamento observável** (SPECs 0045/0047): DOM real do `index.html` do disco + chamadas IPC registradas no harness.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- testes estiverem passando (delta do CA 24 sobre a base observada: +1 arquivo, ≥ +18 testes);
- a observação RED do passo 4 e o resultado do passo 3 (suíte verde sem editar teste) estiverem registrados no relatório final do `spec-implementer`;
- documentação atualizada;
- arquitetura preservada (ADRs 0009/0011/0013/0019/0020/0021/0022 intactos; nenhum diff em `packages/*`, `apps/cli` ou contratos);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` da raiz, `apps/desktop/CLAUDE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `PLATFORM_STATE.md`, `Roadmap.md`) é do passo de fecho, **não** do `spec-implementer` — que toca apenas os onze arquivos de código/teste e o arquivo desta SPEC. O fecho deve obrigatoriamente:

- **(a)** reescrever, em `apps/desktop/CLAUDE.md` ("Rastreio de operação em voo"), a garantia publicada: registro **único** de operações, os **quatro** predicados nomeados com seus consumidores enumerados nominalmente, a regra de que o predicado de **segurança inclui operações abandonadas** (cancelar não destrava política de permissões nem edição da Persona ativa), a **quarentena de sessão** e a lista do que segue sem marcar/sem recusar. A formulação anterior ("quatro consumidores / cinco chamadas") deixa de valer — publicar contagem desatualizada repetiria o defeito que a SPEC-0050 existiu para corrigir (Artigo 1, padrão recorrente das lições);
- **(b)** acrescentar, em `apps/desktop/CLAUDE.md` ("Serialização de gestos" e "Portas fail-closed"), a seção do **gesto de escape**: os dois botões, o canal `'atlas:cancel'`, a semântica de **desistência × cancelamento real** (o trabalho abandonado continua até assentar; só seus efeitos são contidos) e — explicitamente — que o `ConfirmPort` do chat tem alcance de **sessão**, não de turno, sendo por isso negado de forma **pegajosa** enquanto houver turno abandonado não assentado;
- **(c)** retirar de `apps/desktop/CLAUDE.md` ("Candidatos futuros já nomeados") e de `NEXT_CONTEXT.md` o item consumido ("cancelamento de um `ask`/turno de chat em voo"), **preservando** os candidatos abertos (`micBusy()` fora de `#ask-submit`; uniformizar `selectPersona`; wake word; diálogos modais com `BrowserWindow` pai) e **acrescentando** os candidatos novos, **com dono nomeado**: (i) **cancelamento real no Runtime/Task Manager** (`AbortSignal`/fila/retry/timeout/`cancelled` — responsabilidade já atribuída pelo Module Catalog, hoje não implementada; exige ADR e decisão humana, e converge com o item "Task Manager completo" já aberto em `NEXT_CONTEXT.md`); (ii) **canal de push avisando o renderer quando o trabalho abandonado assenta**; (iii) **mensagem de recusa distinguindo operação abandonada de ativa**; (iv) **retomar a conversa sem perder o transcript** enquanto a sessão está em quarentena;
- **(d)** registrar nas lições: **(d.1)** que o desktop ganhou gesto de escape sem que o Runtime ganhasse cancelamento, e qual é exatamente a diferença; **(d.2)** o resíduo honesto — uma Tool **não destrutiva** já autorizada pode concluir depois do cancelamento, porque só o consentimento é revogável dentro de `apps/desktop` (e é por isso que o aviso ao usuário diz isso com todas as letras); **(d.3)** que um contador não expressa abandono, e que a troca por um registro de operações foi o que permitiu separar segurança × conversação sem enfraquecer o ADR-0013/SPEC-0038; **(d.4)** **a lição central do gate**: o alcance de uma porta injetada (`ConfirmPort` **por sessão** no chat, **por operação** no `ask`) não é dedutível do ponto onde ela é *usada*, só do ponto onde é *injetada* — a v1.0 propôs contenção por operação e teria permitido aprovar ação destrutiva em nome de um turno abandonado; **(d.5)** que "aceitar um turno novo na mesma sessão" era assumir reentrância de `respond` que **nenhum documento sustenta** (invariante 8), e que a quarentena de sessão foi a correção mais simples que também fechou o buraco de consentimento; **(d.6)** o **diálogo nativo fantasma**: com a resposta descartada, um `dialog.showMessageBox` já aberto continua na tela, sem pai modal, e o clique do usuário não produz efeito visível — resíduo de UX conhecido, cuja correção (diálogos modais) é fatia própria; **(d.7)** o custo de UX aceito por não haver push: painéis de configuração voltam a parecer habilitados após o cancelamento e podem recusar até o trabalho assentar.

---

# Restrições

- **Somente os doze arquivos dos "Arquivos Esperados"**. Se fechar qualquer critério exigir tocar outro módulo de `src/`, um package ou `apps/cli`, **pare e reporte** — é fronteira de outra SPEC (e, no caso do Core, de um ADR).
- **Não introduzir cancelamento dentro do Core** — nada de `AbortSignal`/`signal`/timeout atravessando `createAtlas`, `cognitive.ask`/`respond`, Runtime, Task Manager, Tools ou Model Gateway. Se parecer necessário, **pare e reporte**: é escalação humana com ADR, e o dono é o Runtime/Task Manager.
- **Não enfraquecer o predicado de segurança**: `hasInFlightOperation()` continua incluindo operações abandonadas, e `updatePersona`/`selectPermissionRoots` continuam a consultá-lo.
- **Não permitir turno novo na sessão em quarentena** para "melhorar a UX": é a garantia que impede consentimento cruzado (A1) e reentrância não documentada (A2). Se um critério parecer exigir isso, o critério está errado — pare e reporte.
- **Não vincular o envelope do `ConfirmPort` do chat a um turno**: no chat, o alcance é a **sessão**, porque a porta é injetada em `openChatSession`.
- **Não alterar comportamento observável de `selectPersona`** (D12 da SPEC-0050 segue aberta).
- **Não alterar mensagens de recusa existentes** nem a ordem das etapas de `selectPermissionRoots`, nem a rechecagem A7, nem `confirmGrant`.
- **Não tornar `openChatSession` cancelável nem guardada** (D5 da SPEC-0050 intacta).
- **Não tornar os diálogos modais** (`BrowserWindow` pai) — fatia própria, apontada pelo gate.
- **Não exportar estado interno** do bridge para viabilizar teste.
- **Não alterar nem enfraquecer caso de teste existente**: em `core-bridge.permissions.test.ts` só é autorizado **adicionar**; `core-bridge.persona-authoring.test.ts` e os demais `renderer.*.test.ts` não são editados.
- **Nenhuma dependência nova**; `pnpm-lock.yaml`, `vitest.config.ts` e a CI fora do diff.
- Não criar módulos, Tools, Skills ou Personas; não tocar `@atlas/contracts`; não persistir nada novo (Artigo 11).
- Não expandir para timeout, fila, retry, push de estado ou unificação com o cancelamento de STT/TTS.

---

# Observações

- **Por que isto não exige ADR.** Nenhuma decisão arquitetural inédita atravessa fronteira de módulo: o registro de operações, os predicados, o envelope do `ConfirmPort` e o canal IPC são **locais a `apps/desktop`**, que é aplicação, não módulo do Module Catalog. Nenhum contrato público muda; nenhuma responsabilidade se move; nenhum estado persistente nasce. O que **exigiria** ADR — cancelamento cooperativo no Runtime/Task Manager, cuja responsabilidade o Module Catalog já atribui — está explicitamente fora de escopo e vira candidato nomeado com escalação humana. Precedentes: SPECs 0037/0038/0039 introduziram estado de módulo, guardas e canais no mesmo arquivo sem ADR; a SPEC-0046 só precisou de ADR por trazer um **motor externo** novo.
- **Desistência ≠ cancelamento.** O trabalho abandonado **continua rodando** até assentar sozinho. O que esta SPEC garante é (i) o usuário para de esperar, (ii) nada do trabalho abandonado é commitado, (iii) ele não obtém consentimento novo para ação destrutiva, (iv) ele não disputa o Core com um turno novo, e (v) o sistema volta a aceitar conversa — via `ask` ou sessão nova. Se o trabalho **nunca** assentar, o usuário volta a perguntar, mas a conversa afetada e os painéis de configuração ficam bloqueados até fechar a app: melhoria grande, não cura completa.
- **Resíduo honesto de segurança.** Só o consentimento é revogável de dentro de `apps/desktop`. Uma Tool **não destrutiva** já autorizada pela política vigente (ex.: `write_file` dentro de `writeRoots`) pode concluir depois do cancelamento — inclusive escrevendo arquivo **depois** de o usuário clicar "Cancelar". É por isso que o aviso pinado diz isso explicitamente (A3): prometer menos do que se cumpre é aceitável; prometer mais, não (Artigos 7 e 13). Fechar essa fresta exige cancelamento real no Runtime — candidato escalado. Mitigação estrutural já existente: a política **não pode mudar** enquanto o Core abandonado vive (predicado de segurança), então ele nunca escreve sob privilégio recém-concedido ou recém-revogado.
- **Diálogo nativo fantasma (A5/D16).** Com a resposta descartada, um `dialog.showMessageBox` já aberto no momento do abandono **permanece na tela** — os diálogos não têm `BrowserWindow` pai e não são modais, e nada os fecha programaticamente. O usuário pode clicar "Apagar" e não ver efeito algum (a ação foi negada). Consequência direta da contenção fail-closed e do desenho atual dos diálogos; fica **registrado**, não escondido (Artigo 7). Corrigir de fato — diálogos modais com pai, que também eliminariam a origem da corrida tratada em `selectPermissionRoots` — é **fatia própria**, conforme o gate.
- **Por que a rejeição, e não uma resolução com `cancelled: true`.** Rejeitar reusa os dois `.catch` que já existem no renderer (SPECs 0049 e 0033/0048) e os `.finally` que já zeram as flags — o gesto cancelado percorre o caminho de erro já coberto por teste. Resolver com snapshot vazio exigiria mudar `AskSnapshot`/`TurnSnapshot` e criar um segundo caminho de "sucesso que não é sucesso".
- **Por que um `cancel` global e não por operação.** Desde a SPEC-0050 há no máximo **uma** operação cancelável ativa por vez, garantida estruturalmente no main process — e com a quarentena de D15 isso continua verdadeiro depois de um cancelamento (o trabalho abandonado nunca convive com um turno novo da mesma sessão; um `ask` novo passa a ser a única operação ativa possível, e um `cancel` seguinte o alcança sem ambiguidade, já que o abandonado já está marcado). Um handle por operação exigiria mudar retornos e IPC sem caso de uso que o distinga.
- **Interação com STT.** `micBusy()` e o `#mic-cancel-button` seguem intactos: aquele "Cancelar" cancela **transcrição local**, este cancela **round-trip cognitivo**. Mantidos separados de propósito — mesma razão pela qual as três portas de diálogo não se reusam entre si.
- **Ortogonal e não resolvida**: a pendência de smoke visual/sonoro nunca confirmado (SPEC-0031 a 0050). Esta SPEC acrescenta dois controles visuais novos à lista de itens que só uma sessão gráfica real confirma.
- **Custo colateral**: `core-bridge.ts` e `renderer.js` já são candidatos a quebra em arquivos menores (SPEC-0042/D8). Esta fatia acrescenta a ambos sem mudar a estrutura de nenhum; o novo `core-bridge.cancellation.test.ts` segue a divisão por assunto da SPEC-0042.

---

# Decisões de design

Formato de veto: **Decisão** · **Porquê** · **Alternativa descartada**. Na v1.1, **D8** foi reescrita, **D11** ajustada, e **D15**/**D16** são novas; as demais seguem como na v1.0.

**D1 — Perfil `completo`.**
Porquê: a SPEC toca `apps/desktop` (não um package), cinco arquivos de `src/` incluindo renderer e `preload.cjs`, e cria um canal IPC — falha em várias condições do perfil `micro`. Confirmado pelo gate.
Alternativa descartada: `micro`, pelo diff ser confinado a um app; perde porque a fronteira do `micro` é literal e, na dúvida, a Constituição manda `completo`.

**D2 — Desistência (abandono) no `core-bridge`, não cancelamento real no Core (v1.1: com dono nomeado).**
Porquê: o cancelamento real **tem** dono arquitetural previsto — Runtime ("mecanismos de cancelamento e recuperação") e Task Manager (estado `cancelled`) —, mas não tem implementação; construí-la atravessa `@atlas/contracts` e ≥ 3 módulos ⇒ ADR novo e escalação humana (Emenda v1.1). O abandono entrega o gesto de escape pedido inteiramente dentro da aplicação.
Alternativa descartada: `AbortSignal` ponta a ponta agora; perde por exigir ADR e reescrever o contrato central para resolver um problema de interface — vira candidato nomeado com dono, não item órfão.

**D3 — Dois predicados globais (`hasInFlightOperation` de segurança inclui abandonadas; `hasActiveOperation` de conversação não).**
Porquê: cancelar deve devolver o direito de conversar, nunca o de reconfigurar privilégio enquanto um Core abandonado ainda executa Tools sob a política antiga — o buraco fechado pelas correções A6/A7 da SPEC-0038 (ADR-0013).
Alternativa descartada: um predicado só, liberado pelo cancelamento; perde por reabrir uma janela de segurança já fechada.

**D4 — Registro de operações (`Set<OperationRecord>`) substituindo `busySessions` + `inFlightOperations`.**
Porquê: um contador não expressa "esta operação foi abandonada", e é o registro com identidade que torna possíveis a quarentena por sessão (D15) e a contenção pegajosa (D8).
Alternativa descartada: contadores/Sets paralelos preservando os nomes atuais; perde por ser aritmética frágil sobre estado sem identidade (o `finally` do turno abandonado apagaria a marca de um turno novo na mesma `SessionId`).

**D5 — `selectPersona` ganha o predicado nomeado `hasChatTurnOperation()`, com comportamento observável idêntico.**
Porquê: o registro único torna impossível manter a expressão inline `busySessions.size > 0`; nomear preserva o comportamento e a decisão D12 da SPEC-0050.
Alternativa descartada: uniformizar `selectPersona` de carona; perde por mudar comportamento de um caminho de configuração que ninguém pediu.

**D6 — Cancelamento se expressa como rejeição com mensagem pinada, sem classe de erro nova.**
Porquê: reusa os `.catch`/`.finally` já existentes e cobertos por teste nos dois painéis, mantendo D3 da SPEC-0050.
Alternativa descartada: resolver com snapshot marcado como cancelado; perde por mudar tipos locais consumidos pelo renderer e criar um segundo caminho de "sucesso".

**D7 — `cancelInFlightOperation()` global e síncrona, devolvendo `{ cancelled: boolean }`.**
Porquê: com D15, continua havendo no máximo uma operação cancelável ativa por vez, então um handle por operação seria superfície sem caso de uso; síncrona porque só muta estado de módulo e dispara rejeições.
Alternativa descartada: `cancel(kind)`/`cancel(token)` transportado pelo IPC; perde por exigir mudança de retorno das duas funções e do `preload` para distinguir o que nunca coexiste.

**D8 (reescrita na v1.1 — achado A1) — Contenção do `ConfirmPort` com o alcance real da porta: por sessão no chat (pegajosa) e por operação no `ask`.**
Porquê: no chat a porta é injetada **uma vez em `openChatSession`** e vive pela sessão; um envelope por turno não conseguiria distinguir um `confirm` vindo do trabalho abandonado de um vindo de um turno novo, e poderia aprovar `delete_file` em nome de um turno que o usuário largou (invariante 8, ADR-0013). Negar tudo enquanto houver turno abandonado não assentado é fail-closed e não penaliza ninguém, porque a sessão está em quarentena (D15).
Alternativa descartada: envelope por operação também no chat (forma da v1.0); perde por ser inexequível — o alcance da porta não é o turno — e por abrir exatamente o dano que a decisão declara impedir.

**D9 — Resultado do trabalho abandonado é descartado por inteiro (sem `remember`, sem `updateConversation`), mas o `shutdown` do `ask` continua.**
Porquê: um turno abandonado não aconteceu do ponto de vista do usuário; persistir memória ou conversa dele violaria a expectativa e a autoridade do Memory Service (ADR-0011). O `shutdown` é higiene de recurso, não efeito de domínio.
Alternativa descartada: preservar `learned` do trabalho abandonado; perde por gravar conhecimento derivado de um turno interrompido, sem superfície de revisão no momento.

**D10 — Dois botões (um por painel), calculados nas funções de origem única já existentes.**
Porquê: mantém a disciplina das SPECs 0048/0049 (nenhum `.finally` atribuindo `disabled`/`hidden` direto) e deixa o escape onde o gesto foi disparado.
Alternativa descartada: um botão global único; perde por ambiguidade visual e por exigir estado próprio fora das duas funções de origem única.

**D11 (ajustada na v1.1 — achado A3) — Aviso pinado escrito pelo `.catch` (via flag), declarando os três efeitos reais: ações de arquivo já autorizadas podem concluir, a conversa fica sem turnos novos, e configurações podem recusar.**
Porquê: a formulação da v1.0 falava só de recusa de configuração e era **mais otimista que a garantia** — o usuário podia ver um arquivo mudar depois de clicar "Cancelar", sem nenhuma explicação prévia (Artigos 7 e 13). Escrever no `.catch`, e não no clique, mantém a ordem determinística (o `.catch` sobrescreve `#ask-result`) e testável no `jsdom`.
Alternativa descartada: manter o texto curto e registrar o resíduo só na documentação; perde porque o resíduo é visível ao usuário, e documentação interna não é aviso.

**D12 — Sem canal de push avisando o renderer quando o trabalho abandonado assenta.**
Porquê: todos os canais do app são `invoke`/`handle`; um push seria padrão novo sem 2º consumidor, e o custo que evitaria é mitigado pela linha de aviso.
Alternativa descartada: `webContents.send('atlas:operation:settled')`; perde por criar padrão novo de IPC nesta fatia; vira candidato nomeado.

**D13 — Prioridade `High`.**
Porquê: é o único caminho em que a app fica inutilizável sem ser reaberta (perdendo o transcript), a exposição cresceu com a SPEC-0050, e o Critério de Conclusão da Fase 2 pede paridade com o CLI, que sempre teve `Ctrl-C`.
Alternativa descartada: `Medium`, como as SPECs 0048/0049/0050; perde porque aquelas endureciam uma garantia existente, enquanto esta remove um bloqueio total de uso.

**D14 — Arquivo de teste novo por assunto (`core-bridge.cancellation.test.ts`).**
Porquê: segue a divisão da SPEC-0042 e mantém num lugar só os casos que atravessam `ask`, chat, permissões e Persona.
Alternativa descartada: distribuir pelos arquivos existentes; perde por espalhar a prova da assimetria dos predicados por quatro arquivos.

**D15 (nova na v1.1 — achado A2, opção (a) do gate) — Quarentena de sessão: `sendChatTurn` recusa turno novo na sessão que tem turno abandonado não assentado, com mensagem própria.**
Porquê: aceitar o turno novo pressuporia **reentrância de `respond` no mesmo Core e na mesma `SessionId`**, que nenhum documento sustenta (ADR-0009, Module Catalog, `PLATFORM_STATE.md`) — assumir comportamento não documentado é violação direta do invariante 8/Artigo 1. A quarentena também fecha o consentimento cruzado do A1 e mantém a premissa de "uma operação cancelável por vez" que D7 usa. O usuário não fica sem saída: `ask` e uma conversa nova seguem liberados, e a mensagem diz exatamente o que está acontecendo.
Alternativa descartada: sustentar a reentrância com evidência do Core e cobri-la por teste (opção (b) do gate); perde pelo teste da Constituição — exigiria provar uma propriedade do Cognitive/Runtime que ninguém documentou, para habilitar um caso de uso marginal (insistir na mesma conversa em vez de perguntar de novo), e ainda deixaria dois `respond` disputando o mesmo Core.

**D16 (nova na v1.1 — achado A5) — O diálogo nativo fantasma é registrado, não corrigido nesta SPEC.**
Porquê: um `dialog.showMessageBox` já aberto no momento do abandono continua na tela e sem efeito ao ser clicado (a resposta é descartada). Corrigir exige tornar os diálogos modais com `BrowserWindow` pai, o que muda o comportamento das **três** portas — inclusive a de concessão de política, cuja corrida (A7 da SPEC-0038) depende do desenho atual —, e o gate apontou explicitamente que isso merece fatia própria.
Alternativa descartada: passar `BrowserWindow` como pai já aqui; perde por arrastar para dentro de uma SPEC de cancelamento uma mudança que afeta segurança de permissões e exigiria reavaliar a rechecagem A7.

---

# Checklist para IA

Antes de implementar:

- ler esta SPEC inteira (**inclusive a nota de revisão v1.1**), a SPEC-0050 (Observações + D5/D12) e as seções "Rastreio de operação em voo", "Serialização de gestos" e "Portas fail-closed" de `apps/desktop/CLAUDE.md`;
- **buscar no fonte** todos os usos de `hasInFlightOperation()`, `inFlightOperations` e `busySessions`, **e confirmar onde cada `ConfirmPort` é injetado** (`openChatSession` = sessão; `resolveAskSnapshot` = operação) — a premissa do achado A1 do gate;
- ler `selectPermissionRoots` inteiro, a guarda de `updatePersona`, o predicado parcial de `selectPersona` e os casos de operação em voo de `core-bridge.permissions.test.ts`/`core-bridge.persona-authoring.test.ts`;
- registrar commit-base e linha de base da suíte (passo 1 — esperado 983 testes / 74 arquivos);
- confirmar no fonte as regiões a editar (as referências desta SPEC podem ter deslocado).

Durante implementação:

- manter responsabilidade única (o `core-bridge` decide; `main.ts`/`preload.cjs` só fiam; o renderer só pinta);
- nenhuma condição de operação em voo reescrita inline — sempre um dos quatro predicados nomeados;
- nada de introspecção de estado interno exportada para teste;
- na dúvida entre liberar e recusar, **recusar** (fail-closed) e registrar.

Após implementação:

- executar os quatro comandos completos na raiz + as duas sementes embaralhadas;
- validar critério a critério, inclusive os de não-regressão;
- registrar lições (d.1–d.7) e a observação RED.

---

# Resultado Esperado

Ao final, o desktop do Atlas tem um **gesto de escape**: durante um `ask` ou um turno de chat, um botão "Cancelar" aparece no painel correspondente; ao clicá-lo, a espera termina imediatamente e o painel explica, em português, que a operação foi cancelada, que o trabalho já iniciado ainda encerra em segundo plano (podendo concluir ações de arquivo já autorizadas), que aquela conversa não aceita turnos novos até ele assentar e que os painéis de configuração podem recusar nesse meio-tempo. O usuário pode perguntar de novo na hora, por `ask` ou numa conversa nova.

Nada do trabalho abandonado é commitado — nenhuma memória gravada, nenhuma conversa alterada — e **nenhuma ação destrutiva é aprovada em nome de um turno abandonado**: enquanto ele não assenta, a porta de confirmação daquela sessão nega tudo, sem abrir diálogo.

Por baixo, o `core-bridge` passa a manter **um** registro de operações em voo com identidade e marca de abandono, e a decidir por **quatro predicados nomeados**: o de segurança (que continua contando o trabalho abandonado e mantém permissões e Persona ativa protegidas até ele assentar), o de conversação (que devolve o direito de falar assim que o usuário cancela), o de sessão (quarentena e negação pegajosa de consentimento) e o parcial de `selectPersona` (preservado tal e qual). O Core não ganhou cancelamento — e a documentação diz isso com todas as letras, junto com os dois resíduos que sobram: uma Tool não destrutiva já autorizada pode concluir depois do cancelamento, e um diálogo nativo já aberto vira fantasma. Fechar essas frestas tem dono nomeado (Runtime/Task Manager, com ADR e decisão humana; diálogos modais em fatia própria).
