# SPEC-0032 — Desktop: adapters de confirmação e traço de execução

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0032

---

**Título**

Desktop: `ConfirmPort` via diálogo nativo + superfície visual dos `steps`, exercitados por um `ask` de tiro único

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

`Fase 2 — 2.1 Fundação da Interface` (`docs/04-engineering/Roadmap.md`, l. 139-143), fatia **2.1-restante**: os adapters de GUI equivalentes aos da CLI, nomeados textualmente na l. 143 ("um `ConfirmPort` que abre um diálogo em vez de pausar o terminal; uma superfície de renderização para os `steps` de execução em vez de texto puro (`renderSteps`); `atlas.cognitive.ask`/`respond` ainda não consumidos pela janela"). Esta SPEC entrega os dois adapters e o consumo **single-shot** de `atlas.cognitive.ask`; o consumo de `respond`/multi-turno com sessão do Context Service fica para o item **2.2** (chat visual).

---

# Objetivo

Dar à janela do `apps/desktop` (`@atlas/desktop`) os dois adapters de GUI que ainda faltam para paridade com a CLI, e um caminho mínimo que os exercita de verdade:

1. um **`ConfirmPort` de diálogo nativo** (`dialog.showMessageBox`) — quando um plano executado pelo Runtime encontra uma Tool destrutiva (`delete_file`, `access: 'delete'`), a pausa de confirmação vira um diálogo modal na janela em vez de uma pergunta no terminal;
2. uma **superfície visual do traço de `steps`** — o equivalente GUI do `renderSteps` da CLI, exibindo na janela os passos executados (inclusive bloqueados/negados) com o motivo;
3. um **round-trip `ask` de tiro único** (stateless, espelho do round-trip `status` da SPEC-0031): a janela recebe um objetivo, o main process chama `atlas.cognitive.ask(objective)`, e devolve ao renderer o texto da resposta + o traço de `steps` — dando aos dois adapters um consumidor real, sem abrir o chat visual multi-turno (2.2).

Ao final: a partir de uma sessão gráfica real, o usuário digita um objetivo na janela, vê a resposta e o traço de passos, e — se o plano tocar `delete_file` dentro de uma `writeRoot` — vê um diálogo nativo de confirmação (Confirmar/Cancelar) em vez de qualquer prompt de terminal.

---

# Motivação

A SPEC-0031 fundou o `apps/desktop` com um único round-trip `status`, sem etapa cognitiva, e listou explicitamente estes dois adapters (`ConfirmPort` via diálogo, `renderSteps` visual) como **fatia futura 2.1-restante** (`NEXT_CONTEXT.md`, l. 13; Fora do Escopo da SPEC-0031, l. 106). O Roadmap 2.1-restante (l. 143) nomeia exatamente estas três peças como candidatas.

O PRD fundamenta as duas capacidades: **"O Atlas não deverá executar ações destrutivas sem autorização adequada"** (l. 193) fundamenta o diálogo de confirmação; **"O sistema deve informar ações relevantes durante sua execução"** e "fornecer transparência sobre suas ações" (Transparência, l. 149-151/252) fundamentam a superfície de `steps`. Hoje essas garantias existem só no terminal (SPEC-0013/0014); a janela ainda não as oferece porque nenhum plano executável é disparado por ela. Esta fatia fecha essa lacuna de paridade sem entregar a experiência conversal completa (2.2).

---

# Referências

- `docs/04-engineering/Roadmap.md` — Fase 2, item 2.1 (l. 139-143, adapters de GUI e consumo de `ask`) e 2.2 (l. 145-149, fronteira: chat multi-turno com sessão do Context Service)
- `docs/02-product/ProductRequirementsDocument.md` — Transparência (l. 149-155), ações destrutivas (l. 193), transparência sobre ações (l. 252)
- `docs/00-project/ArchitectureConstitution.md` — Artigo 4 (Core é o único orquestrador; renderer nunca toca `packages/*`), Artigo 7 (uma única Persona percebida)
- `docs/06-adr/ADR-0013-permission-service-execution-gate.md` — veredicto `confirm`, `ConfirmPort` interno ao `@atlas/runtime`, injeção via `createRuntime`/`CreateAtlasDeps.confirm`
- `docs/06-adr/ADR-0019-desktop-electron-stack.md` — stack Electron; Core só no main process; renderer isolado; sem `dist/`
- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação do `apps/desktop`: `core-bridge` testável sem Electron, `main.ts` casca fina, IPC via `contextBridge`, `preload.cjs`
- [SPEC-0013](SPEC-0013-confirm-flow-destructive-tools.md) (Done) — `ConfirmPort` interno, `nodeReadlineConfirmPort`, `confirm.request(action)`
- [SPEC-0014](SPEC-0014-chat-tools-confirm.md) (Done) — `createLineReaderConfirmPort`, injeção de `confirm` via `CreateAtlasDeps`, `renderSteps` compartilhado
- `apps/cli/src/gateway/confirm-port.ts`, `apps/cli/src/gateway/steps-trace.ts`, `apps/cli/src/commands/ask.ts` — adapters de referência da CLI a espelhar

---

# Escopo

- criar `apps/desktop/src/confirm-port.ts`: adapter **testável, sem import de Electron** — `createDialogConfirmPort({ showMessageBox })` devolve `{ request(action: ActionRequest): Promise<boolean> }`, satisfazendo estruturalmente o `ConfirmPort` interno do `@atlas/runtime` (mesmo critério do `createLineReaderConfirmPort` da CLI). A função `showMessageBox` é **injetada** (em produção, `dialog.showMessageBox` do Electron; nos testes, um fake) — o módulo em si não importa `electron`, permanecendo testável no Vitest;
- criar `apps/desktop/src/steps-view.ts`: função pura `formatSteps(steps: readonly ExecutedStep[] | undefined): readonly StepLine[]` — o equivalente **de dado** ao `renderSteps` da CLI (que escreve em stream). Mapeia cada `ExecutedStep` numa linha plana e serializável (`{ tool, outcome, ok, denialKind? }`), preservando a distinção `blocked`/`declined` (`ExecutedStep.denialKind`) para o traço visual; `undefined`/vazio ⇒ `[]`;
- estender `apps/desktop/src/core-bridge.ts` (testável, sem Electron) com `resolveAskSnapshot(objective, deps?)`: sobe a plataforma via `createAtlas({ config }, { confirm })` injetando o `ConfirmPort` recebido, chama `atlas.cognitive.ask(objective)`, grava os fatos aprendidos (`atlas.memory.remember(fact, 'learned')`, paridade com `runAsk`), monta um `AskSnapshot` plano (`{ text, steps: StepLine[], learned: string[] }`) via `formatSteps`, chama `atlas.shutdown()` (sempre, `finally`) e devolve o snapshot serializável por IPC. O `confirm` é **parâmetro injetado** (default: um `ConfirmPort` fail-closed que recusa) para manter o bridge livre de Electron;
- estender `apps/desktop/src/main.ts` (casca Electron): importar `dialog` do Electron, construir o `ConfirmPort` de diálogo (`createDialogConfirmPort({ showMessageBox: dialog.showMessageBox })`) e registrar `ipcMain.handle('atlas:ask', (_e, objective) => resolveAskSnapshot(objective, { confirm }))`. Nenhuma lógica de domínio no `main.ts`;
- estender `apps/desktop/src/preload.cjs`: expor `window.atlas.ask(objective)` → `ipcRenderer.invoke('atlas:ask', objective)`, ao lado do `getStatus` existente;
- estender `apps/desktop/src/renderer/index.html` + `renderer.js`: um campo de texto + botão que chama `window.atlas.ask(objective)`, e pinta na janela o `text` da resposta, o traço de `steps` (cada linha `🔧 <tool> → <outcome>`, distinguindo negações) e os `learned`. JavaScript plano, sem bundler;
- testes: `apps/desktop/tests/confirm-port.test.ts` (adapter com `showMessageBox` fake), `apps/desktop/tests/steps-view.test.ts` (transform puro), e extensão de `apps/desktop/tests/core-bridge.test.ts` (`resolveAskSnapshot` sobre o Core real, snapshot serializável, `confirm` injetado repassado, `shutdown` chamado, override propagado);
- atualizar `apps/desktop/CLAUDE.md` (registrar os novos adapters, o canal `'atlas:ask'` e a fronteira com 2.2).

---

# Fora do Escopo

Cada item abaixo pertence às fatias 2.2-2.4, cada uma sua própria SPEC:

- **chat visual multi-turno** — `atlas.cognitive.respond`, `startConversation`, `Conversation` mantida viva entre turnos, histórico de sessão pelo Context Service, streaming/estado persistente na janela (item **2.2**). Esta fatia é **stateless**: cada `ask` sobe e desliga o Core, como o `status` da SPEC-0031;
- promover `ConfirmPort`, `AskSnapshot`, `StepLine` ou os canais IPC a `@atlas/contracts` — só com um 2º consumidor real, via ADR (mesma regra que manteve `StatusSnapshot`/`'atlas:status'` locais na SPEC-0031);
- qualquer alteração em `@atlas/contracts`, `@atlas/core`, `@atlas/runtime`, `@atlas/permissions` ou `@atlas/cognitive` — a superfície pronta (`createAtlas` com `CreateAtlasDeps.confirm`, `atlas.cognitive.ask`, `ExecutedStep`/`AskResult` já em contratos) basta; necessidade de mudança nesses packages é motivo para **parar e registrar** (Constituição);
- gerência visual de memória/Persona/permissões pela UI (item **2.4**); voz (item **2.3**);
- estilização/UX elaborada da janela (CSS, layout de conversa, ícones) — a janela desta fatia é diagnóstica/mínima, como a da SPEC-0031;
- bundler para o renderer (Vite/esbuild) ou framework de UI (React etc.) — decisão maior, adiada para 2.2 quando houver necessidade real;
- empacotamento/distribuição (Fase 3); E2E/harness headless de Electron em CI — a janela segue validada por smoke manual;
- tornar `respond` disponível na janela; múltiplos objetivos concorrentes; cancelamento de um `ask` em andamento.

---

# Pré-requisitos

- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação do `apps/desktop`: `core-bridge`, `main.ts`, `preload.cjs`, renderer, IPC.
- [SPEC-0013](SPEC-0013-confirm-flow-destructive-tools.md) (Done) — veredicto `confirm` + `ConfirmPort` interno.
- [SPEC-0014](SPEC-0014-chat-tools-confirm.md) (Done) — injeção de `confirm` via `CreateAtlasDeps` e `renderSteps` da CLI (adapters de referência).

---

# Critérios de Aceitação

- `pnpm lint` passa sem erros, cobrindo os novos arquivos de `apps/desktop` (inclusive `renderer.js`/`preload.cjs` no contexto browser/CommonJS);
- `pnpm typecheck` passa, cobrindo `apps/desktop`;
- `pnpm test` executa e passa, incluindo os testes novos/estendidos de `apps/desktop/tests/`;
- teste comprova: `createDialogConfirmPort({ showMessageBox })` devolve `request` que resolve `true` **só** quando o `showMessageBox` fake retorna o índice do botão "Confirmar"; qualquer outro retorno (Cancelar, fechar, valor inesperado) resolve `false` (fail-closed) e **nunca lança**;
- teste comprova: `formatSteps` mapeia `ExecutedStep[]` cobrindo sucesso (`ok: true`, `outcome` = `output`), falha de Tool (`ok: false`, `outcome` = mensagem de erro), `denialKind: 'blocked'` e `denialKind: 'declined'`; `undefined`/`[]` ⇒ `[]`; cada `StepLine` é objeto plano serializável (`JSON.stringify` round-trips sem perda);
- teste comprova: `resolveAskSnapshot(objective, { confirm })` sobre o Core real (in-memory, gateway `fake` determinístico) devolve um `AskSnapshot` com `text: string`, `steps: StepLine[]` e `learned: string[]`, plano e serializável por IPC;
- teste comprova: `resolveAskSnapshot` repassa o `confirm` injetado ao Core (via `CreateAtlasDeps.confirm`) e chama `atlas.shutdown()` mesmo no caminho de sucesso; override de config é propagado (paridade com `resolveStatusSnapshot`);
- smoke manual (registrado nas Observações): em sessão gráfica real (`pnpm --filter @atlas/desktop start`), digitar um objetivo na janela exibe a resposta + o traço de `steps`; e um objetivo cujo plano toque `delete_file` dentro de uma `writeRoot` concedida abre um **diálogo nativo** de confirmação (Confirmar/Cancelar), cuja escolha "Cancelar" resulta num passo negado exibido no traço, sem nenhum prompt de terminal;
- estrutura corresponde à seção "Arquivos Esperados";
- nenhuma alteração em `@atlas/contracts`, `@atlas/core`, `@atlas/runtime`, `@atlas/permissions` nem `@atlas/cognitive`.

---

# Arquivos Esperados

```text
apps/
└── desktop/
    ├── src/
    │   ├── confirm-port.ts       # NOVO: createDialogConfirmPort({ showMessageBox }) — sem import de electron
    │   ├── steps-view.ts         # NOVO: formatSteps(steps) → StepLine[] (puro)
    │   ├── core-bridge.ts        # + resolveAskSnapshot(objective, { confirm, configOverride }) + AskSnapshot/StepLine
    │   ├── main.ts               # + dialog confirm + ipcMain.handle('atlas:ask', …)
    │   ├── preload.cjs           # + window.atlas.ask(objective)
    │   └── renderer/
    │       ├── index.html        # + campo de objetivo + botão + área de steps
    │       └── renderer.js       # + chama ask() e pinta text/steps/learned
    ├── tests/
    │   ├── confirm-port.test.ts  # NOVO
    │   ├── steps-view.test.ts    # NOVO
    │   └── core-bridge.test.ts   # + casos de resolveAskSnapshot
    └── CLAUDE.md                 # + adapters, canal 'atlas:ask', fronteira com 2.2
```

Nenhum arquivo novo em `packages/*`, `docs/06-adr/` ou `@atlas/contracts`. Essa lista é expectativa e pode sofrer pequenos ajustes.

---

# Componentes Impactados

Camada Interaction do Module Catalog, no app `apps/desktop`:

- Input Gateway / Output Gateway (semente desktop, SPEC-0031) — entrada ganha um objetivo digitado; saída ganha o texto da resposta + o traço visual de `steps` + o diálogo de confirmação.

Consome, **sem alterar**: Core (`createAtlas` + `CreateAtlasDeps.confirm`), Cognitive Core (`atlas.cognitive.ask`), Runtime (veredicto `confirm` interno), Permission Service, Memory Service (`remember`), Lifecycle Manager (`shutdown`).

---

# Interfaces Necessárias

Locais em `apps/desktop` (não em `@atlas/contracts` — não há segundo consumidor):

```text
StepLine {
  tool: string
  outcome: string
  ok: boolean
  denialKind?: 'blocked' | 'declined'
}

AskSnapshot {
  text: string
  steps: StepLine[]
  learned: string[]
}

createDialogConfirmPort(deps: {
  showMessageBox: (options) => Promise<{ response: number }>
}): { request(action: ActionRequest): Promise<boolean> }
  // ConfirmPort estrutural do @atlas/runtime; sem import de electron

formatSteps(steps: readonly ExecutedStep[] | undefined): readonly StepLine[]

resolveAskSnapshot(
  objective: string,
  deps?: { confirm?: ConfirmPort; configOverride?: Partial<AtlasConfig> },
): Promise<AskSnapshot>
```

`ActionRequest`/`ExecutedStep`/`AtlasConfig` vêm de `@atlas/contracts` (já existentes). `ConfirmPort` é satisfeito **estruturalmente** (interno ao `@atlas/runtime`, não importado — mesmo padrão da CLI). Nenhuma interface nova em `@atlas/contracts`.

Canal IPC novo (nome estável, ao lado de `'atlas:status'`):

```text
main:     ipcMain.handle('atlas:ask', (_e, objective) => resolveAskSnapshot(objective, { confirm }))
preload:  window.atlas.ask(objective) → ipcRenderer.invoke('atlas:ask', objective)
renderer: const snapshot = await window.atlas.ask(objective)
```

---

# Fluxo Esperado

```text
renderer (na janela): usuário digita objetivo, clica enviar
  → window.atlas.ask(objective)            (contextBridge → ipcRenderer.invoke)
    → [main] ipcMain.handle('atlas:ask')
        → resolveAskSnapshot(objective, { confirm: dialogConfirm })
            → createAtlas({ config }, { confirm: dialogConfirm })
            → atlas.cognitive.ask(objective)
                 ↳ Runtime executa o plano; Tool destrutiva → confirm.request(action)
                     → dialog.showMessageBox(...) modal na janela → true/false
            → grava learned (atlas.memory.remember(fact,'learned'))
            → AskSnapshot { text, steps: formatSteps(result.steps), learned }
            → atlas.shutdown()
        → devolve AskSnapshot
  → pinta text + steps (🔧 tool → outcome, negações marcadas) + learned no DOM
```

Regras (para remover ambiguidade):

- o Core vive **exclusivamente no main process**; o renderer nunca importa `packages/*` nem tipos de contrato — recebe só o `AskSnapshot` plano (Artigo 4 / segurança Electron);
- `resolveAskSnapshot` é **stateless**: `createAtlas` **e** `shutdown` no mesmo round-trip, como `resolveStatusSnapshot` — não mantém a plataforma nem uma `Conversation` viva entre chamadas (isso é 2.2);
- o `ConfirmPort` de diálogo vive no `main.ts` (onde o `dialog` do Electron está disponível) e é injetado no bridge; o `core-bridge.ts` e o `confirm-port.ts` permanecem **livres de import de Electron** (testáveis no Vitest);
- o traço de `steps` exibe nome da Tool + resultado + natureza da negação — transparência de **ações** (PRD), não exposição de Planner/Runtime/Permission Service (Artigo 7 preservado).

---

# Estratégia de Implementação

1. `steps-view.ts` por TDD: `formatSteps` sobre `ExecutedStep[]` sintéticos cobrindo sucesso/erro/`blocked`/`declined`/vazio — puro, sem Electron;
2. `confirm-port.ts` por TDD: `createDialogConfirmPort` com `showMessageBox` fake — `true` só no botão Confirmar, fail-closed no resto, nunca lança;
3. estender `core-bridge.ts`: `resolveAskSnapshot` sobre o Core real (gateway `fake`), com `confirm` injetável e default fail-closed; testes de snapshot serializável, repasse do `confirm`, `shutdown`, override;
4. `main.ts`: construir o dialog confirm (`dialog.showMessageBox`) e registrar `ipcMain.handle('atlas:ask', …)`; casca fina;
5. `preload.cjs`: expor `window.atlas.ask`; `renderer/index.html` + `renderer.js`: campo + botão + pintura de `text`/`steps`/`learned`;
6. ajustar ESLint se o lint acusar (globals já cobertos pela SPEC-0031); validar `pnpm lint`/`typecheck`/`test`;
7. smoke manual em sessão gráfica real (resposta + traço; diálogo de confirmação em plano com `delete_file`) e registrar o resultado;
8. atualizar `apps/desktop/CLAUDE.md`; validar todos os critérios de aceitação.

---

# Estratégia de Testes

- testes unitários em `apps/desktop/tests/` sob o Vitest já configurado (`apps/*/tests/**`), **sem Electron** — a fronteira testável são `steps-view`, `confirm-port` e `core-bridge`, exatamente como a SPEC-0031 testou `core-bridge` sem tocar o runtime gráfico;
- **steps-view**: `formatSteps` cobre sucesso/erro/`blocked`/`declined`/`undefined`/`[]`; `StepLine` serializável;
- **confirm-port**: `request` resolve `true` só no índice do botão Confirmar; Cancelar/valor inesperado ⇒ `false`; nunca lança; `showMessageBox` recebe as opções esperadas (título/mensagem/detalhe com `access` e `resource.path`);
- **core-bridge**: `resolveAskSnapshot` sobre `createAtlas` real (gateway `fake`, determinístico) — snapshot `{ text, steps, learned }` serializável; `confirm` injetado é o repassado ao Core; `shutdown` chamado no caminho feliz (spy); override de config propagado; `InvalidConfigError` propagada (paridade com `resolveStatusSnapshot`);
- sem mocks do Core — `createAtlas` real (ADR-0004);
- `main.ts`/`preload.cjs`/`renderer.js` (camada Electron/DOM) **não** são unit-testados nesta fatia — validação por smoke manual, incluindo o diálogo de confirmação real (harness headless de Electron é Fora do Escopo).

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
- Consumir o Core **só** pelos contratos públicos (`createAtlas`, `CreateAtlasDeps.confirm`, `atlas.cognitive.ask`, `AskResult`/`ExecutedStep`/`ActionRequest`) — nunca internals de package (Artigo 4).
- O Core vive só no main process; o renderer não importa `packages/*` nem tipos de contrato. `contextIsolation: true`, `nodeIntegration: false`.
- `confirm-port.ts` e `core-bridge.ts` **não** importam `electron` (a dependência de Electron — `dialog`/`ipcMain` — fica confinada a `main.ts`); é o que os mantém testáveis no Vitest.
- Não alterar `@atlas/contracts`/`@atlas/core`/`@atlas/runtime`/`@atlas/permissions`/`@atlas/cognitive`. Se a implementação sugerir que uma mudança neles é necessária, **parar e registrar** (Constituição).
- Nada de Planner/Runtime/Permission Service vazando para a UI além de nome de Tool + resultado (transparência de ação) — uma única Persona percebida (Artigo 7).
- Sem `dist/`, sem bundler, sem framework de UI: main process em `.ts` via `tsx` (ADR-0005/0019); renderer/preload em JS plano.
- `StatusSnapshot`/`AskSnapshot`/`StepLine`/`ConfirmPort` e os canais IPC ficam **locais** a `apps/desktop`; promoção a `@atlas/contracts` só com 2º consumidor real, via ADR.

---

# Observações

**Fronteira 2.1-restante × 2.2.** O Roadmap 2.1-restante (l. 143) agrupa os dois adapters **e** o consumo de `ask`/`respond`; o 2.2 (l. 145-149) é o **chat visual multi-turno com histórico persistido pela sessão do Context Service**. Esta SPEC corta na linha do **estado**: entrega o consumo **stateless** de `ask` (cada round-trip sobe e desliga o Core, espelho exato do `status` da SPEC-0031), o que basta para exercitar os dois adapters de verdade; o `respond`/`Conversation` viva/histórico — a substância nova do 2.2 — fica de fora. Ver "Decisões de design".

**Smoke manual do diálogo.** Como na SPEC-0031, o shell de automação sem WindowServer não executa `app.whenReady()`; a confirmação visual (janela, resposta, traço, diálogo modal de `delete_file`) deve ser feita por quem tiver sessão gráfica real, antes de fechar a SPEC. A cadeia testável (`steps-view`/`confirm-port`/`core-bridge`) roda em CI sob Vitest sem Electron.

**`dialog.showMessageBox` retorna `Promise<{ response: number }>`** — o índice do botão escolhido. `createDialogConfirmPort` compara com o índice do botão "Confirmar"; qualquer outra coisa (Cancelar, tecla Esc/fechar → `cancelId`) é `false`, espelhando o `EOF ⇒ false` do `nodeReadlineConfirmPort`/`createLineReaderConfirmPort` (fail-closed: nunca presumir consentimento).

---

# Checklist para IA

Antes de implementar:

- ler documentação referenciada (Roadmap 2.1/2.2, ADR-0013/0019, SPEC-0031/0013/0014, adapters da CLI);
- compreender objetivo (dois adapters + `ask` stateless que os exercita);
- confirmar que nenhum contrato/package do Core precisa mudar.

Durante implementação:

- manter o app fino; Core só no main process; renderer isolado;
- `confirm-port.ts`/`core-bridge.ts` livres de import de Electron;
- fail-closed no `ConfirmPort`; transparência de ações no traço (Artigo 7);
- manter simplicidade (sem bundler, sem framework).

Após implementação:

- executar testes;
- smoke manual do app real (resposta + traço + diálogo de `delete_file`);
- validar critérios de aceitação;
- registrar lições aprendidas;
- registrar conclusão.

---

# Decisões de design

> Decisões tomadas pelo `spec-drafter` (Emenda v1.1), em formato de veto. Quem as ataca é o `architecture-reviewer` no gate `Draft → Ready`.

**1. Perfil `completo`.**

- **Decisão**: classificar a SPEC como `completo`.
- **Porquê**: a fatia mexe em `apps/desktop/src` — que **não** é a superfície coberta pela condição de containment do perfil `micro` (`packages/X/src` + opcionalmente `apps/cli/src`) — e **adiciona um round-trip cognitivo com superfície de entrada** a um segundo app, além de um adapter que integra com o runtime gráfico (validado só por smoke manual); é mais que uma mudança aditiva trivial contida a um package. Na dúvida, `completo` (default seguro); paridade com a SPEC-0031 (irmã, também `completo`).
- **Alternativa descartada**: `micro` — embora a SPEC seja aditiva, não toque `@atlas/contracts`, não crie módulo/Tool/Skill/Persona e não exija ADR, ela falha a condição de containment (não é `packages/X/src`+CLI) e envolve integração gráfica não coberta por teste automatizado; classificar `micro` só a faria cair no pipeline completo no gate, sem ganho.

**2. Fronteira: `ask` de tiro único (stateless), não `respond`/multi-turno.**

- **Decisão**: entregar os dois adapters e um consumo **single-shot** de `atlas.cognitive.ask` (sobe e desliga o Core por round-trip); deixar `respond`, `Conversation` viva, histórico e sessão do Context Service para o item 2.2.
- **Porquê**: um adapter sem consumidor real seria código especulativo e não-exercitável (contra "sustentável/transparente"); o `ask` stateless dá aos dois adapters um consumidor real **mantendo o modelo de vida do Core idêntico ao da SPEC-0031** (round-trip que desliga), enquanto a substância nova do 2.2 é justamente o **estado persistente** (Conversation viva + histórico via Context Service). Cortar na linha do estado é a fronteira mais simples e defensável, e o Roadmap 2.1-restante (l. 143) explicitamente inclui o consumo de `ask` nesta fatia.
- **Alternativa descartada**: (a) só os adapters, sem nenhum consumo de `ask` — deixaria o `ConfirmPort` de diálogo e a superfície de `steps` sem consumidor vivo, impossíveis de exercitar/demonstrar no smoke manual, e a injeção de `confirm` num `createAtlas` que só faz `status` seria fiação morta; (b) entregar já o `respond`/chat multi-turno — arrastaria sessão do Context Service, `Conversation` mantida viva e histórico, que são exatamente o item 2.2.

**3. `ConfirmPort` de diálogo com `showMessageBox` injetado; módulo livre de Electron.**

- **Decisão**: `createDialogConfirmPort({ showMessageBox })` num módulo próprio que **não** importa `electron`; o `main.ts` injeta `dialog.showMessageBox`. O bridge recebe o `ConfirmPort` por parâmetro.
- **Porquê**: preserva a arquitetura da SPEC-0031 (lógica testável fora do runtime gráfico; Electron confinado ao `main.ts`) — o adapter e o `core-bridge` ficam unit-testáveis no Vitest com um `showMessageBox` fake, sem harness de Electron. Mais testável e sustentável.
- **Alternativa descartada**: importar `dialog` direto dentro do `confirm-port.ts`/`core-bridge.ts` — tornaria a única lógica de valor não-testável sem harness gráfico, quebrando o padrão validado da SPEC-0031.

**4. Superfície de `steps` = função pura que devolve dado plano; renderer só pinta.**

- **Decisão**: `formatSteps(steps) → StepLine[]` (objetos planos serializáveis) no main process; o renderer recebe o `AskSnapshot` e pinta, sem conhecer `ExecutedStep`.
- **Porquê**: mantém `packages/*`/tipos de contrato fora do renderer (Artigo 4 + isolamento Electron), concentra a lógica testável no Node e espelha o `renderSteps` da CLI como **dado** em vez de escrita em stream — mais modular e testável.
- **Alternativa descartada**: pintar direto no `renderer.js` a partir de `ExecutedStep` cru enviado por IPC — vazaria a forma do contrato para o renderer e deixaria a formatação sem teste automatizado (o renderer não roda no Vitest desta fatia).

**5. `ConfirmPort`/`AskSnapshot`/`StepLine` e o canal `'atlas:ask'` permanecem locais a `apps/desktop`.**

- **Decisão**: não promover nada a `@atlas/contracts`; declarar o `ConfirmPort` estruturalmente (como a CLI faz).
- **Porquê**: não há 2º consumidor real desses tipos/canais — a regra do repo (2º consumidor via ADR) manteve `StatusSnapshot`/`'atlas:status'` locais na SPEC-0031; o mesmo se aplica aqui, evitando acoplamento prematuro. Mais simples.
- **Alternativa descartada**: subir `ConfirmPort` (hoje interno ao `@atlas/runtime`) ou `StepLine` a `@atlas/contracts` — exigiria ADR e um 2º consumidor que não existe; promoção especulativa contraria a regra de contratos do repo.

**6. Gravar os fatos aprendidos (`learned`), em paridade com `runAsk`.**

- **Decisão**: `resolveAskSnapshot` grava `result.learned` via `atlas.memory.remember(fact, 'learned')` e devolve `learned` no snapshot para exibição (nunca gravação silenciosa).
- **Porquê**: espelha o `runAsk` da CLI e a Etapa 6 (Aprendizado, ADR-0016) — não gravar divergiria o `ask` do desktop do da CLI (regressão de capacidade); o custo é trivial (padrão já estabelecido) e a transparência é preservada ao anunciar cada fato.
- **Alternativa descartada**: ignorar `learned` no desktop — criaria divergência de comportamento entre as duas interfaces para o mesmo `ask`, sem simplificação real (o snapshot já trafega o resto do resultado).

**7. Traço exibe nome de Tool + resultado + natureza da negação, sem ferir o Artigo 7.**

- **Decisão**: cada `StepLine` carrega `tool`, `outcome`, `ok` e `denialKind?`; o renderer pinta `🔧 <tool> → <outcome>` marcando bloqueios/recusas.
- **Porquê**: é transparência de **ações** exigida pelo PRD (l. 151/252) e paridade com o `renderSteps` da CLI; expor qual Tool rodou e o resultado não expõe o Planner/Runtime/Permission Service nem quebra a Persona única (Artigo 7 protege a coordenação interna, não o fato de uma ação ter ocorrido) — o Roadmap 2.2 (l. 148) confirma "traço de execução … sem expor a arquitetura interna".
- **Alternativa descartada**: omitir nomes de Tool e mostrar só a resposta final — reduziria a transparência que o PRD exige e divergiria da CLI, sem ganho de privacidade da Persona.

**8. Prioridade `Medium`.**

- **Decisão**: prioridade `Medium`.
- **Porquê**: avança a Fase 2 e é substrato para o 2.2, mas as capacidades entregues (confirmação de destrutivas + traço de ações) já existem sem regressão via CLI (SPEC-0013/0014), e a fundação de interface já foi aberta pela SPEC-0031 — não há pressão de bloqueio de fase inteira nem de correção/segurança.
- **Alternativa descartada**: `High` — reservada à fatia que abriu a fase (SPEC-0031, que desbloqueava tudo); aqui o desbloqueio é incremental. `Critical` — reservada a correção/segurança bloqueante, que não é o caso.

---

# Resultado Esperado

A janela do `@atlas/desktop` deixa de fazer só `status` e passa a aceitar um objetivo: o main process chama `atlas.cognitive.ask` num round-trip stateless (sobe e desliga o Core, como o `status` da SPEC-0031), e devolve ao renderer a resposta, o traço de `steps` (com bloqueios/recusas marcados) e os fatos aprendidos. Quando o plano toca uma Tool destrutiva, a confirmação aparece como **diálogo nativo** na janela — não como prompt de terminal — via um `ConfirmPort` de diálogo testável (`showMessageBox` injetado), fail-closed. A lógica de valor (`formatSteps`, `createDialogConfirmPort`, `resolveAskSnapshot`) vive fora do runtime gráfico, testada no Vitest sem Electron; o Core permanece exclusivamente no main process; `@atlas/contracts` e todos os packages do Core ficam intocados. É a paridade de adapters CLI↔GUI que a fatia 2.1-restante pedia, deixando o chat visual multi-turno com sessão do Context Service para o item 2.2.
