# SPEC-0019 — Observação: laço plano→executa→observa→replaneja no Cognitive Core

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0019

---

**Título**

Observação como função pura determinística em `@atlas/cognitive` (`observe(executionResult) → Observation`) e o `runPlanCycle` como laço limitado (teto fixo de 1 replanejamento). A distinção terminal × falha de Tool é carregada por um discriminador estruturado no contrato: `ExecutedStep` ganha `denialKind?: 'blocked' | 'declined'` (única mudança em `@atlas/contracts`), rotulado pelo Runtime nos dois branches de negação que ele já produz. Falha de Tool (todo `ok:false` sem `denialKind`) dispara replan com resumo compacto das falhas; bloqueio de permissão e recusa no `confirm` são terminais; `steps` acumulam os passos de todos os passes; vale para `ask` e `respond`; Planner, Permission Service, Tools e Model Gateway intactos

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
- [ ] High
- [x] Medium
- [ ] Low

**Medium** (confirmada pelo humano em 2026-07-19): fecha a Etapa 5 (Observação) do Cognitive Lifecycle — item de roadmap de valor de produto (o ciclo cognitivo deixa de ser passe único), mas não é um endurecimento de segurança urgente como a série 1.1 (SPEC-0015/0017), e o raio de mudança é contido a `@atlas/cognitive` mais duas adições cirúrgicas (`@atlas/contracts`/Runtime).

---

**Item do Roadmap**

`Fase 1 — 1.2 (Fechar o Ciclo Cognitivo) — Observação` (`docs/04-engineering/Roadmap.md`), marcado como `gate · ADR primeiro`. O gate foi cumprido: a decisão estrutural (introduzir o laço reavaliação → replanejamento, que revisita a fronteira "execução única / passe único" do ADR-0012) está registrada e **aprovada** no [ADR-0015](../../06-adr/ADR-0015-observation-replan-loop.md) (Status `Accepted`). Esta SPEC **consome** esse ADR como fonte de verdade do escopo — não reabre a decisão. A outra metade do item 1.2 (Etapa 6 — Aprendizado automático) é fatia separada, fora desta SPEC.

---

# Objetivo

Ao concluir esta SPEC, a **Etapa 5 (Observação)** do [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md) passa a existir na implementação: o ciclo Planejamento + Execução do Cognitive Core deixa de ser um **passe único** e vira um **laço limitado** que reavalia o resultado da execução e, quando uma Tool falhou, retorna ao Planejamento **uma vez** com o contexto do que falhou.

Concretamente, quando esta SPEC estiver concluída:

- Existe uma **função pura** nova em `@atlas/cognitive` — `observe(executionResult) → Observation` — que inspeciona os `ExecutedStep` do último passe e produz um veredicto `{ verdict: 'complete' | 'replan' }`, **sem chamar o modelo** (espelhando o Planner puro, testável sem gateway).
- O observador é **determinístico** e classifica por um **discriminador estruturado**, não por parse de string: **`replan` se houver algum passo `ok: false` sem `denialKind`; caso contrário `complete`**. Ou seja, toda falha de Tool (Tool lançou, Tool devolveu `ok: false` por erro de IO ou por contenção-no-uso/TOCTOU da SPEC-0017, e **ferramenta desconhecida**) dispara `replan`; os dois casos rotulados — `blocked` (bloqueio por permissão) e `declined` (recusa do usuário no `confirm`) — são **terminais** (`complete`).
- O contrato `ExecutedStep` (em `@atlas/contracts`) ganha um **campo opcional discriminador** `denialKind?: 'blocked' | 'declined'` — **aditivo e retrocompatível** (código que constrói `ExecutedStep` sem ele segue válido). É a **única** mudança em `@atlas/contracts`.
- O **Runtime** marca `denialKind` **exclusivamente** nos dois branches de negação que ele já produz em `packages/runtime/src/runtime.ts`: `'blocked'` no branch de veredicto de permissão ≠ `allowed`/`confirm`, e `'declined'` no branch de recusa do usuário no `confirm`. **Nenhuma** mudança de fluxo, ordem ou semântica de execução — só rotula o passo negado que já produzia.
- O helper interno `runPlanCycle` (compartilhado por `ask` e `respond` desde a SPEC-0014) vira um **laço com teto fixo embutido = 1 replanejamento** (até 2 passes de plano/execução):
  1. `generate` (prompt composto + instrução do Planner) → `parse` → plano ou `null`.
  2. Sem plano → resposta direta em 1 chamada (comportamento atual, **zero regressão**).
  3. Com plano → `runtime.execute` → `observe`.
  4. `observe = replan` **e** ainda há orçamento → nova chamada `generate` de replanejamento, recebendo um **resumo compacto das falhas** do passe anterior (mesmo padrão da mensagem `system` compacta da SPEC-0014) → novo `parse` → `runtime.execute` → `observe`.
  5. `observe = complete`, **ou** orçamento esgotado, **ou** replanejamento sem plano (`parse → null`) → chamada `generate` de **composição** final com todos os resultados acumulados.
- O laço **nunca lança** e **nunca itera sem limite** (teto fixo garante terminação).
- Os `steps` de `AskResult`/`ConversationTurn` **acumulam os passos de todos os passes** (concatenados na ordem de execução); o CLI mostra o retry **reusando `renderSteps`**, sem código novo de renderização e sem mudança de assinatura pública.
- O laço vale para **`ask` e `respond`** (é o `runPlanCycle` compartilhado).

O tipo `Observation` é **interno** ao `@atlas/cognitive` — **não** sobe a `@atlas/contracts`. Planner, Permission Service, Tools e Model Gateway permanecem intactos.

---

# Motivação

O [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md) define sete etapas; a **Etapa 5 — Observação** ("avaliar o resultado da execução: sucesso, falhas, inconsistências, impactos, necessidade de novas ações; caso necessário, o ciclo poderá retornar ao planejamento") **ainda não tem contraparte na implementação**. O [ADR-0012](../../06-adr/ADR-0012-planner-runtime-execution.md) registrou explicitamente que iteração/replanejamento ficou **fora de escopo** (execução única, passe único). Fechar essa lacuna é o item **1.2 (Fechar o Ciclo Cognitivo) — Observação** do [Roadmap](../../04-engineering/Roadmap.md).

O [PRD](../../02-product/ProductRequirementsDocument.md) sustenta a necessidade: "O sistema deve analisar tarefas complexas antes da execução" e "apresentar um plano de ação quando apropriado" (Planejamento, l. 97–99); "O sistema deve executar tarefas autorizadas pelo usuário" e "informar o andamento das tarefas em execução" (Execução, l. 107–113); "O sistema deve informar ações relevantes durante sua execução" (Transparência, l. 151). Reavaliar o resultado da execução e reagir a uma falha de Tool é o passo que faltava para "planejar tarefas complexas antes da execução" (Critério de Aceitação do Produto, l. 248) fechar o ciclo de forma honesta.

O [Module Catalog](../../03-architecture/ModuleCatalog.md) **não reserva um módulo separado** para Observação e já enquadra o replanejamento como colaboração entre componentes existentes: o Runtime "produz solicitações de replanejamento" (as falhas estruturadas que já emite como `ExecutedStep` de erro), o Cognitive Core é "utilizado por mecanismos de replanejamento" e o Planner participa de "processos de replanejamento". O Artigo 4 da Constituição põe a decisão de reiniciar no Cognitive Core (único orquestrador estratégico) — e reforça que módulos se comunicam por **contratos**, não por detalhes internos: por isso a distinção terminal × falha de Tool é carregada por um campo de contrato (`denialKind`), não reconstruída parseando a redação das mensagens de erro do Runtime.

O [ADR-0015](../../06-adr/ADR-0015-observation-replan-loop.md) decidiu, com o humano, **como** fazer a etapa existir sem tornar o observador um adivinhador semântico caro, sem borrar a fronteira Observação/Planejamento e sem risco de laço infinito: observador **determinístico e puro** no Cognitive (função nova, espelhando o Planner), replanejamento **feito pelo modelo**, laço com **teto fixo de 1 replan**, e classificação por um **discriminador estruturado** no contrato (`ExecutedStep.denialKind`), rotulado pelo Runtime. Esta SPEC implementa exatamente esse desenho — nada além dele.

Documentos originadores: **ADR-0015** (decisão, escopo, discriminador, casos-limite, residuais — fonte de verdade) + **ADR-0012** (a fronteira "passe único" que o ADR-0015 revisita; as três autoridades Cognitive orquestra / Planner transforma / Runtime executa) + **PRD** (Planejamento/Execução/Transparência) + **Module Catalog** (replanejamento como colaboração, sem módulo novo) + **Cognitive Lifecycle** (Etapa 5) + **Constituição** (Artigo 4 — comunicação por contrato).

---

# Referências

- [ADR-0015](../../06-adr/ADR-0015-observation-replan-loop.md) (`docs/06-adr/ADR-0015-observation-replan-loop.md`) — **fonte de verdade do escopo**: Observação como função pura determinística no Cognitive; classificação por `ExecutedStep.denialKind` (única mudança de contrato); Runtime rotula os dois branches de negação; regra "replan sse algum `ok:false` sem `denialKind`, senão complete"; casos-limite (ferramenta desconhecida → replan; TOCTOU/contenção-no-uso → replan); `runPlanCycle` como laço com teto fixo de 1 replan; `Observation` interno; `steps` acumulam; Planner/Permissões/Tools/Gateway intactos
- [ADR-0012](../../06-adr/ADR-0012-planner-runtime-execution.md) (`docs/06-adr/ADR-0012-planner-runtime-execution.md`) — a espinha Planner/Runtime, o passe único que esta SPEC transforma em laço, o `runPlanCycle`, as três autoridades
- [SPEC-0014](SPEC-0014-tools-confirm-in-chat.md) (`docs/implementation/specs/SPEC-0014-tools-confirm-in-chat.md`) — `runPlanCycle` compartilhado por `ask`/`respond`; padrão da mensagem `system` compacta de resumo (reusado no resumo de falhas do replan); `steps` em `AskResult`/`ConversationTurn`; `renderSteps` no CLI
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) (`docs/06-adr/ADR-0013-permission-service-execution-gate.md`) — como o Runtime distingue veredicto de permissão (`blocked`), `confirm` e execução; base dos dois branches que passam a marcar `denialKind`
- [SPEC-0017](SPEC-0017-toctou-atomic-enforcement.md) (`docs/implementation/specs/SPEC-0017-toctou-atomic-enforcement.md`) — contenção-no-uso/TOCTOU que emerge como `ok: false` da Tool (sem `denialKind`) e, portanto, classifica como falha de Tool → replan
- [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md) (`docs/03-architecture/CognitiveLifecycle.md`) — as sete etapas; Etapa 5 (Observação)
- [Module Catalog](../../03-architecture/ModuleCatalog.md) (`docs/03-architecture/ModuleCatalog.md`) — replanejamento como colaboração Runtime/Cognitive/Planner; sem módulo separado para Observação
- [PRD](../../02-product/ProductRequirementsDocument.md) (`docs/02-product/ProductRequirementsDocument.md`) — Planejamento (l. 95–101), Execução (l. 105–113), Transparência (l. 149–155)
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) (`docs/00-project/ArchitectureConstitution.md`) — Artigo 4 (Cognitive Core único orquestrador estratégico; comunicação por contrato, não por detalhe interno); Artigo 3 (não criar módulos sem documentação)

---

# Escopo

Muda código de produção em `packages/cognitive` (o grosso), mais **duas adições cirúrgicas** em `packages/contracts` e `packages/runtime`. Estritamente o desenho aprovado no ADR-0015 — nem mais, nem menos.

- **`@atlas/contracts` — o discriminador estruturado (única mudança de contrato)**:
  - Acrescentar ao `ExecutedStep` (`packages/contracts/src/execution.ts`) o campo **opcional** `denialKind?: 'blocked' | 'declined'` — aditivo e retrocompatível. Nenhum outro diff em `execution.ts` (`ToolResult`, `ExecutionResult`, `Plan`, etc. inalterados) nem em qualquer outro arquivo de contrato. `Observation` **não** entra aqui.
- **`@atlas/runtime` — rotulagem mínima e localizada**:
  - No `execute(plan)` de `packages/runtime/src/runtime.ts`, marcar `denialKind` **exclusivamente** nos dois branches de negação que já existem: `'blocked'` no branch de veredicto de permissão ≠ `allowed`/`confirm`, e `'declined'` no branch de recusa do usuário no `confirm`. **Nenhuma** mudança de fluxo, ordem, ou semântica; o branch de ferramenta desconhecida e o `catch` de exceção da Tool **não** recebem `denialKind` (permanecem falha de Tool).
- **`@atlas/cognitive` — função pura `observe`**:
  - Criar uma função pura `observe(executionResult: ExecutionResult) → Observation` que inspeciona os `ExecutedStep` do último passe e retorna `{ verdict: 'complete' | 'replan' }`.
  - Regra determinística: `replan` **se e somente se** houver algum passo com `result.ok === false` e **sem** `denialKind`; caso contrário `complete`. Nenhuma chamada ao modelo. Nenhum parse de string de erro.
  - O tipo `Observation` é **interno** ao package (sem 2º consumidor → **não** sobe a `@atlas/contracts`, mesmo critério de `Planner`/`FsReadPort`/`ConfirmPort`).
  - Espelhar o `createPlanner()`: função/factory pura, testável sem gateway.
- **`@atlas/cognitive` — `runPlanCycle` vira laço limitado**:
  - Introduzir uma **constante embutida** de teto = **1 replanejamento** (até 2 passes de plano/execução).
  - Fluxo: `generate`+`parse` → sem plano, resposta direta em 1 chamada (inalterado); com plano, `runtime.execute` → `observe`; se `replan` **e** há orçamento, nova chamada `generate` de replanejamento com um **resumo compacto das falhas** do passe anterior → `parse` → `runtime.execute` → `observe`; senão (`complete` / orçamento esgotado / replan sem plano) → chamada `generate` de composição final.
  - **Resumo compacto das falhas** do passe anterior injetado na chamada de replanejamento, reusando/espelhando o padrão da mensagem `system` compacta (`summarizeSteps`, SPEC-0014). O implementador decide se reusa `summarizeSteps` ou uma variante focada nas falhas — sem novo contrato público.
  - `steps` retornados em `AskResult`/`ConversationTurn` **acumulam os passos de todos os passes** (concatenados na ordem de execução). Assinatura pública **inalterada** (`AskResult { text; steps? }`, `ConversationTurn { reply; conversation; steps? }`).
  - Para `respond`: a mensagem `system` compacta de resumo persistida na `Conversation` (SPEC-0014) passa a refletir **os passos acumulados** dos passes executados no turno.
  - Manter `runPlanCycle` **nunca lançando** e **sempre terminando** (teto fixo).
- **Testes** (`@atlas/cognitive` e `@atlas/runtime`, com fakes — gateway `fake`/injetado, runtime fake, fs fake; **sem rede/disco reais**): cobrir os casos da seção "Estratégia de Testes" para `ask` **e** `respond`, incluindo os testes unitários de `observe` (classificação por `denialKind`) e o teste do Runtime rotulando `denialKind`.
- **Documentação**: atualizar `packages/cognitive/CLAUDE.md`, `packages/contracts/CLAUDE.md`, `packages/runtime/CLAUDE.md`, `CLAUDE.md` raiz (invariantes/estado), `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`; marcar o item 1.2 (Observação) no `Roadmap.md` como concluído/entregue por esta SPEC (a metade Aprendizado segue aberta); registrar lições em `docs/implementation/LESSONS_LEARNED.md`. (O ADR-0015 já está `Accepted` — esta SPEC **não** cria nem altera ADR.)

---

# Fora do Escopo

Esta seção é obrigatória e reflete os residuais que o ADR-0015 documentou explicitamente como **não** fechados nesta fatia.

- **Observador guiado por modelo** (3ª chamada `generate` para avaliar semanticamente se o resultado resolve o objetivo, detectar inconsistências/impactos). O observador desta fatia é **determinístico** sobre falha estrutural; a avaliação semântica é fatia futura documentada. **Não** adicionar chamada de modelo para observar.
- **Teto configurável por flag/env** (`flags > env > default`). O teto é uma **constante embutida** de 1 replan. **Não** criar flag/env, validação ou testes de precedência.
- **Replanejar em bloqueio de permissão (`blocked`) ou em recusa do `confirm` (`declined`)**. Esses casos são **terminais** — não disparam replan. Replanejar não concede permissão negada nem reverte o "não" do usuário.
- **Qualquer mudança em `@atlas/contracts` além do campo opcional `ExecutedStep.denialKind`** (e do que ele implica). **Não** promover `Observation` a contrato; **não** tocar `ToolResult`/`ExecutionResult`/`Plan`/`cognitive.ts`/`permission.ts`.
- **Qualquer mudança no Runtime além de rotular `denialKind` nos dois branches de negação existentes.** **Não** alterar fluxo, ordem, semântica de execução, nem os demais branches (ferramenta desconhecida, `catch` de exceção seguem sem `denialKind`).
- **Dependência de dados entre passos** (threading do output de um passo para o próximo; grafo de dependências). Passos seguem independentes (ADR-0012). **Não** implementar.
- **Task Manager** (fila, retry por passo, timeout, cancelamento). Fatia futura. **Não** implementar.
- **Aprendizado automático** (Etapa 6 do Lifecycle — a outra metade do item 1.2). Fatia separada. **Não** implementar.
- **Teto > 1 replan** / laço sem teto. **Não** ampliar o teto.
- **Qualquer mudança em** `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/memory`, `@atlas/context`, `@atlas/core`, `apps/cli` — exceto **reuso** de `renderSteps` já existente no CLI (sem código novo) e a documentação listada no Escopo. Em particular: **não** tocar o Planner (`instruction`/`parse`) nem o Permission Service; **não** adicionar código novo de renderização no CLI.

---

# Pré-requisitos

- [SPEC-0010](SPEC-0010-planner-runtime-tools.md) (espinha Planner/Runtime/Tools; `runPlanCycle` passe único) — **Done** (confirmado)
- [SPEC-0013](SPEC-0013-confirm-flow-destructive-tools.md) (`confirm` real; recusa vira `ExecutedStep` negado — o branch que passa a rotular `denialKind='declined'`) — **Done** (confirmado)
- [SPEC-0014](SPEC-0014-tools-confirm-in-chat.md) (`runPlanCycle` compartilhado por `ask`/`respond`; `steps` em `AskResult`/`ConversationTurn`; mensagem `system` compacta de resumo; `renderSteps` no CLI) — **Done** (confirmado)
- [SPEC-0017](SPEC-0017-toctou-atomic-enforcement.md) (contenção-no-uso/TOCTOU que emerge como `ok:false` da Tool, sem `denialKind` → classifica como falha de Tool) — **Done** (confirmado)

---

# Critérios de Aceitação

Cada item é verificável mecanicamente pelo `spec-validator`.

- **`ExecutedStep.denialKind` no contrato**: `packages/contracts/src/execution.ts` passa a declarar `denialKind?: 'blocked' | 'declined'` em `ExecutedStep`, **opcional**; nenhum outro diff em `execution.ts` nem em outro arquivo de `@atlas/contracts`. `ToolResult`/`ExecutionResult`/`Plan` inalterados; `Observation` **não** aparece em `@atlas/contracts`.
- **Runtime rotula os dois branches**: `execute(plan)` marca `denialKind: 'blocked'` no passo negado por veredicto de permissão ≠ `allowed`/`confirm`, e `denialKind: 'declined'` no passo de recusa do usuário no `confirm`. O branch de ferramenta desconhecida e o `catch` de exceção **não** recebem `denialKind`. Nenhuma mudança de fluxo/ordem/semântica (regressão da suíte do Runtime verde).
- **`observe` puro e determinístico**: existe `observe(executionResult) → Observation` (`{ verdict: 'complete' | 'replan' }`) em `@atlas/cognitive`, sem chamar o gateway/modelo e sem parse de string. Verificável com `ExecutionResult` fixos, sem gateway.
- **Regra de classificação**: `observe` retorna `replan` sse houver ao menos um passo `ok: false` **sem** `denialKind`; caso contrário `complete`.
  - passo `ok: false` sem `denialKind` (Tool lançou / IO / contenção-no-uso/TOCTOU) → `replan`;
  - passo com `denialKind: 'blocked'` → não contribui para replan (terminal);
  - passo com `denialKind: 'declined'` → não contribui para replan (terminal);
  - **ferramenta desconhecida** (`ok: false`, sem `denialKind`) → `replan`;
  - só passos `ok: true` (ou execução vazia) → `complete`.
- **`Observation` interno**: o tipo `Observation` vive em `@atlas/cognitive` e **não** aparece em `@atlas/contracts` (verificável no diff de `packages/contracts`).
- **Sem plano → 1 chamada, sem laço (regressão)**: quando o Planner não produz plano, `ask`/`respond` fazem **exatamente 1** chamada `generate` e retornam o texto direto, sem `observe` e sem replan (fake de gateway conta as chamadas). Testes anteriores de `ask`/`respond` passam inalterados.
- **Plano bem-sucedido → `complete`, sem replan**: com execução só de sucessos, o laço faz `generate`(plano) + `execute` + `generate`(composição) = **2** chamadas, `observe = complete`, **sem** chamada de replanejamento.
- **Falha de Tool → 1 replan, 2 passes, `steps` acumulados**: com o 1º passe contendo passo `ok:false` sem `denialKind` e o 2º passe bem-sucedido, o laço faz `generate`(plano) + `execute` + `generate`(replan) + `execute` + `generate`(composição) = **3** chamadas; `steps` retornados **acumulam** os passos dos dois passes na ordem de execução.
- **Falha persistente → para no teto, compõe, nunca laça**: com falha de Tool em ambos os passes, o laço faz **no máximo 1 replan** (3 chamadas), termina na composição com as falhas acumuladas em `steps`, **não** itera indefinidamente e **não** lança.
- **Replan sem plano → composição**: se a chamada de replanejamento produzir `parse → null`, o laço cai direto na composição final (sem 3º passe), sem lançar.
- **Bloqueio de permissão → terminal**: uma execução cujo único passo negado tem `denialKind: 'blocked'` produz `observe = complete` e **não** replana (2 chamadas `generate`).
- **Recusa no `confirm` → terminal**: uma execução cujo único passo negado tem `denialKind: 'declined'` produz `observe = complete` e **não** replana (2 chamadas `generate`).
- **Resumo de falhas injetado no replan**: a chamada `generate` de replanejamento inclui um resumo compacto das falhas do passe anterior (verificável inspecionando as `messages` passadas ao fake de gateway).
- **Vale para `ask` e `respond`**: todos os casos acima verificados para **ambos** os caminhos. Em `respond`, a `Conversation` retornada com replan contém a mensagem `system` compacta refletindo os passos acumulados.
- **CLI reusa `renderSteps`**: nenhum código novo de renderização; `apps/cli/src/gateway/steps-trace.ts` inalterado; o traço acumulado é mostrado pelo `renderSteps` existente.
- **Componentes intactos**: nenhum diff em `packages/permissions`, `packages/tools`, `packages/model-gateway`; `createPlanner()` (`instruction`/`parse`) inalterado; nenhum diff de código em `apps/cli`/`packages/core`.
- **Compatibilidade do contrato**: adicionar `denialKind` **não** quebra o typecheck do repo — todos os construtores/fakes de `ExecutedStep` existentes seguem válidos (campo opcional). `pnpm typecheck` verde.
- **Documentação**: `CLAUDE.md` raiz + `packages/cognitive/CLAUDE.md` + `packages/contracts/CLAUDE.md` + `packages/runtime/CLAUDE.md` atualizados; `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` atualizados; item 1.2 (Observação) do `Roadmap.md` marcado como entregue; lições em `LESSONS_LEARNED.md`.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.

---

# Arquivos Esperados

```text
packages/contracts/src/
  execution.ts           (editado: ExecutedStep ganha denialKind?: 'blocked' | 'declined')

packages/runtime/src/
  runtime.ts             (editado: marca denialKind='blocked' no bloqueio de permissão e
                          'declined' na recusa do confirm — só rotula, sem mudar fluxo)

packages/cognitive/src/
  observer.ts            (novo: observe(executionResult) → Observation; tipo Observation interno)
  cognitive-core.ts      (editado: runPlanCycle vira laço com teto fixo de 1 replan;
                          chamada de replanejamento com resumo de falhas; steps acumulados)
  index.ts               (editado se necessário: export interno; Observation NÃO reexportado a contracts)

packages/cognitive/tests/  (conforme layout atual — tests/ neste package)
  observer.test.ts       (novo: observe — ok:false sem denialKind → replan; blocked → complete;
                          declined → complete; ferramenta desconhecida → replan; só ok → complete)
  cognitive-core.test.ts (editado: sem plano/1 chamada; sucesso/complete; 1 replan/2 passes;
                          falha persistente/para no teto; replan sem plano; blocked/declined
                          terminais; resumo de falhas no replan; ask e respond)

packages/runtime/tests/
  runtime.test.ts        (editado: bloqueio de permissão marca denialKind='blocked';
                          recusa no confirm marca denialKind='declined')

CLAUDE.md (raiz)                                          (editado: invariantes/estado)
packages/cognitive/CLAUDE.md, packages/contracts/CLAUDE.md, packages/runtime/CLAUDE.md  (editados)
docs/04-engineering/Roadmap.md                           (editado: item 1.2 Observação entregue)
docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md  (editados)
docs/implementation/LESSONS_LEARNED.md                   (editado)
```

Lista é expectativa; o nome exato do arquivo/função (`observer.ts`/`observe`/`Observation`) e a decisão de reusar `summarizeSteps` ou uma variante para o resumo de falhas podem sofrer pequenos ajustes conforme o padrão atual do package.

---

# Componentes Impactados

- Cognitive Core (`@atlas/cognitive`) — nova função pura `observe`; `runPlanCycle` vira laço limitado; `steps` acumulados; resumo de falhas no replan. **Grosso** da mudança.
- Contracts (`@atlas/contracts`) — **única** adição: campo opcional `ExecutedStep.denialKind?: 'blocked' | 'declined'` (aditivo/retrocompatível).
- Runtime (`@atlas/runtime`) — rotulagem mínima: marca `denialKind` nos dois branches de negação já existentes; **sem** mudança de fluxo/ordem/semântica.
- CLI (`apps/cli`) — **sem código novo**: apenas reusa `renderSteps` já existente para mostrar os `steps` acumulados.
- Planner (`createPlanner` em `@atlas/cognitive`) — **inalterado** (`instruction`/`parse`).
- Permission Service (`@atlas/permissions`), Tools (`@atlas/tools`), Model Gateway (`@atlas/model-gateway`), Memory / Persona / Context / Core — **inalterados**.

---

# Interfaces Necessárias

- **`ExecutedStep.denialKind?: 'blocked' | 'declined'`** (`@atlas/contracts`): campo **opcional** aditivo; única mudança de contrato. Marca a natureza da negação (bloqueio de política × recusa de consentimento). Ausência = falha de Tool.
- **`observe(executionResult: ExecutionResult) → Observation`** (`@atlas/cognitive`, interno): função pura/síncrona; sem gateway; sem IO; sem parse de string.
- **Tipo `Observation`** (`@atlas/cognitive`, interno): `{ readonly verdict: 'complete' | 'replan' }` (nome/forma exatos a confirmar na implementação; o essencial é o veredicto binário). **Não** sobe a `@atlas/contracts` (sem 2º consumidor).
- **`CognitiveCore`** (`@atlas/contracts`): `ask(objective) → Promise<AskResult>` e `startConversation()`/`respond(conversation, input) → Promise<ConversationTurn>` — **assinaturas públicas preservadas**. O laço é interno a `runPlanCycle`.
- **Nenhuma** outra interface nova ou alterada em `@atlas/contracts`.

---

# Fluxo Esperado

```text
Rotulagem no Runtime (execute, só marca — sem mudar fluxo):
  veredicto de permissão ≠ allowed/confirm  →  ExecutedStep { ok:false, denialKind:'blocked' }
  recusa do usuário no confirm              →  ExecutedStep { ok:false, denialKind:'declined' }
  ferramenta desconhecida / Tool lançou / Tool ok:false (IO, TOCTOU)  →  ExecutedStep { ok:false }  (sem denialKind)

observe(executionResult):
  existe algum passo ok:false SEM denialKind?  →  replan
  senão (só ok:true, ou só negações blocked/declined, ou vazio)  →  complete

runPlanCycle (ask e respond; teto = 1 replan):

  generate(plano)  →  parse
     │
     ├─ plano == null  →  resposta direta (1 chamada)         [FIM: complete]
     │
     └─ plano != null
            │
            runtime.execute(plano)  →  observe
                                          │
                ┌─ complete ─────────────┘
                │      →  generate(composição, resultados acumulados)   [FIM]
                │
                └─ replan
                       │
                       ├─ orçamento esgotado?  →  generate(composição, acumulado)  [FIM]
                       │
                       └─ há orçamento (1º replan):
                             generate(replan, resumo compacto das falhas)  →  parse
                                 │
                                 ├─ null   →  generate(composição, acumulado)      [FIM]
                                 │
                                 └─ plano  →  runtime.execute  →  observe
                                                 (steps acumulados; sem mais replan)
                                                      →  generate(composição, acumulado)  [FIM]

Nunca lança. Nunca itera sem limite (teto fixo garante terminação).
```

---

# Estratégia de Implementação

Sugestão de ordem (TDD, com fakes — gateway `fake`/injetado, runtime fake, fs fake; sem rede/disco):

1. **Contrato**: acrescentar `denialKind?: 'blocked' | 'declined'` ao `ExecutedStep` em `packages/contracts/src/execution.ts`. **Antes de assumir que é inócuo**, rodar `git grep 'ExecutedStep'` em todo o repo (lição recorrente: adicionar membro a uma interface de contrato pode quebrar fakes/construções em testes no typecheck — embora opcional aqui, confirmar). Construtores conhecidos hoje: `packages/runtime/src/runtime.ts`, `packages/runtime/tests/runtime.test.ts`, `packages/cognitive/src/cognitive-core.ts`, `packages/cognitive/tests/*.test.ts`.
2. **Runtime rotula**: marcar `denialKind='blocked'`/`'declined'` nos dois branches de negação de `execute`; teste no `runtime.test.ts` confirmando a rotulagem e a regressão (fluxo/ordem inalterados).
3. **`observe` + `Observation`**: criar a função pura e o tipo interno; testar isolado (ok:false sem denialKind → replan; blocked → complete; declined → complete; ferramenta desconhecida → replan; só ok / vazio → complete).
4. **Resumo de falhas**: decidir reuso de `summarizeSteps` ou variante focada em falhas para a chamada de replanejamento.
5. **Laço em `runPlanCycle`**: introduzir a constante de teto (1) e transformar o passe único em laço (`execute → observe → replan? → execute → observe → compose`), acumulando `steps`. Preservar o caminho "sem plano → 1 chamada".
6. **`ask` e `respond`**: garantir que ambos usam o laço; em `respond`, a mensagem `system` compacta reflete os passos acumulados.
7. **Testes de comportamento**: contagem de chamadas ao gateway por caso; acumulação de `steps`; terminação no teto; replan sem plano; terminais blocked/declined; ambos os caminhos.
8. **Verificação**: `lint`/`format:check`/`typecheck`/`test`.
9. **Documentação**: `CLAUDE.md` (raiz + cognitive + contracts + runtime); `Roadmap.md` (item 1.2 Observação); `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

Todos com fakes (gateway `fake`/injetado que conta chamadas e devolve saídas roteirizadas por passe; runtime fake que devolve `ExecutionResult` roteirizados; fs fake onde couber). **Sem rede/disco reais.** Cobrir `ask` **e** `respond`.

- **(unit) `observe` por `denialKind`**: passo `ok:false` sem `denialKind` → `replan`; passo `blocked` → `complete`; passo `declined` → `complete`; **ferramenta desconhecida** (`ok:false` sem `denialKind`) → `replan`; só `ok:true` → `complete`; execução vazia → `complete`; mistura (um `ok:false` sem `denialKind` + um `blocked`) → `replan`.
- **(runtime) rotulagem de `denialKind`**: teste que o `execute` marca `denialKind='blocked'` quando o Permission Service nega (veredicto ≠ allowed/confirm) e `denialKind='declined'` quando o usuário recusa o `confirm`; e que ferramenta desconhecida / Tool que lança **não** recebem `denialKind`.
- **(a) sem plano → 1 chamada, sem laço**: Planner não parseia plano → 1 `generate`, resposta direta, `observe` nunca chamado (regressão preservada).
- **(b) plano bem-sucedido → `complete`, sem replan**: execução só de sucessos → 2 `generate` (plano + composição), sem chamada de replan.
- **(c) plano com falha de Tool → 1 replan, 2 passes, `steps` acumulados**: 1º passe com `ok:false` sem `denialKind`, 2º passe sucesso → 3 `generate`; `steps` = passos do passe 1 ++ passe 2 na ordem.
- **(d) falha persistente no 2º passe → para no teto**: falha de Tool em ambos os passes → no máximo 1 replan (3 `generate`), compõe com as falhas acumuladas, não laça, não lança.
- **(e) passo bloqueado por permissão → terminal**: execução com passo `denialKind='blocked'` → `observe = complete`, **não** replana (2 `generate`).
- **(f) recusa no `confirm` → terminal**: execução com passo `denialKind='declined'` → `observe = complete`, **não** replana (2 `generate`).
- **(g) replan que produz `parse → null` → composição**: 1º passe falha, replan gera saída sem plano → cai na composição (sem 3º passe), não lança.
- **(h) resumo de falhas no replan**: as `messages` da chamada de replanejamento contêm o resumo compacto das falhas do passe anterior.
- **(i) `respond` específico**: `Conversation` retornada com replan contém a mensagem `system` compacta refletindo os passos acumulados; `respond` continua função pura (mesmo input → mesmo output com o gateway/runtime fakes determinísticos).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada: `CLAUDE.md` (raiz) + `packages/cognitive/CLAUDE.md` + `packages/contracts/CLAUDE.md` + `packages/runtime/CLAUDE.md`; `docs/04-engineering/Roadmap.md` (item 1.2 Observação entregue; Aprendizado segue aberto); `docs/05-context/NEXT_CONTEXT.md`; `docs/05-context/CURRENT_SPRINT.md`;
- arquitetura preservada: Cognitive Core segue o **único orquestrador estratégico** (Artigo 4); o observador é puro e testável sem gateway (espelha o Planner) e classifica por **contrato** (`denialKind`), não por parse de string (Artigo 4 — comunicação por contrato); a fronteira do ADR-0012 sobrevive (Cognitive orquestra, Planner transforma, Runtime executa — só ganhou um laço); `Observation` interno; `@atlas/contracts` tocado **só** no campo `denialKind`; Runtime tocado **só** na rotulagem dos dois branches; Planner/Permissões/Tools/Gateway intactos;
- residuais documentados como tais (observador semântico, teto configurável, replan em bloqueio, dependência entre passos, Task Manager, Aprendizado) — nada apresentado como fechado além da Observação determinística sobre falha de Tool;
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- **Não** criar package/módulo novo (Artigo 3; o Module Catalog não reserva módulo para Observação). A Observação é função pura em `@atlas/cognitive`.
- **Não** chamar o modelo para observar — o observador é determinístico sobre falha estrutural.
- **Não** classificar por parse de string de erro — a distinção terminal × falha de Tool vem do campo de contrato `denialKind` (Artigo 4).
- **Não** promover `Observation` a `@atlas/contracts` (sem 2º consumidor).
- **Não** alterar `@atlas/contracts` além do campo opcional `ExecutedStep.denialKind`.
- **Não** alterar o Runtime além de rotular `denialKind` nos dois branches de negação existentes — sem mudar fluxo/ordem/semântica; ferramenta desconhecida e `catch` de exceção seguem sem `denialKind`.
- **Não** alterar `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, nem `createPlanner()`.
- **Não** replanejar em bloqueio de permissão (`blocked`) nem em recusa do `confirm` (`declined`) — terminais.
- **Teto fixo embutido = 1 replan**; **não** configurável por flag/env; **não** ampliar o teto; **nunca** laço infinito; **nunca** lançar.
- **Não** implementar dependência de dados entre passos, Task Manager, nem Aprendizado.
- **Não** adicionar código novo de renderização no CLI — reusar `renderSteps`.
- Testes **sem** rede/disco reais (fakes injetados; gateway `fake`).

---

# Observações

- **Por que sem módulo novo**: o ADR-0015 rejeitou `packages/observation` — o Module Catalog enquadra o replanejamento como colaboração entre Runtime (produz falhas), Cognitive (decide) e Planner (replaneja); criar package seria fronteira nova sem respaldo do catálogo (Artigo 3). O observador puro em `@atlas/cognitive` segue o precedente do Planner (ADR-0012).
- **Por que discriminador estruturado, não parse de string**: o Runtime já **conhece** a causa de cada passo negado (são branches distintos), mas hoje a joga numa string livre de `error`. Reconstruir a distinção parseando a redação acoplaria `@atlas/cognitive` a um detalhe interno de `@atlas/runtime` — uma edição inócua de mensagem reclassificaria silenciosamente um bloqueio como replan (fere o Artigo 4). O campo `denialKind` custa duas adições cirúrgicas e torna a distinção um dado de primeira classe (ADR-0015, "Alternativas Consideradas").
- **Casos-limite (ADR-0015)**: *ferramenta desconhecida* → **replan** (defeito de plano que o modelo pode corrigir; teto=1 limita); *contenção-no-uso/TOCTOU da SPEC-0017* → **replan** (a operação já foi negada no instante do uso; o replan é apenas mais uma tentativa igualmente gated, sem brecha, limitada pelo teto). Ambos são "a tentativa da Tool falhou", não "a política/consentimento barrou antes de tentar".
- **Por que determinístico e não semântico**: o observador guiado por modelo custa uma chamada extra por ciclo (mesmo quando tudo deu certo) e borra a fronteira Observação/Planejamento; a avaliação determinística sobre falha estrutural é a menor fatia que faz a etapa **existir** honestamente. O observador semântico é evolução futura (ADR-0015).
- **Por que bloqueio/recusa são terminais**: replanejar não concede permissão que a política negou nem reverte um "não" explícito do usuário (ADR-0015). Só falha de Tool dispara replan.
- **Transparência do retry**: com replan, os `steps` acumulam os passos dos dois passes e o CLI mostra a execução repetida via `renderSteps` — transparência desejada, ao custo de um traço mais longo (ADR-0015, "Consequências").
- **ADR já existe**: esta SPEC consome um ADR já `Accepted` (ADR-0015) — **não** cria nem edita ADR.

---

# Checklist para IA

Antes de implementar:

- ler o **ADR-0015** (fonte de verdade do escopo) por inteiro, o ADR-0012 (passe único, três autoridades), a SPEC-0014 (`runPlanCycle` compartilhado, mensagem `system` compacta, `steps`), o ADR-0013 (os dois branches de negação do Runtime que passam a marcar `denialKind`), a SPEC-0017 (contenção-no-uso/TOCTOU como `ok:false` sem `denialKind`) e o Module Catalog (replanejamento como colaboração);
- compreender o objetivo (Etapa 5 como função pura determinística + laço com teto fixo de 1 replan, classificando por `denialKind`, mantendo Planner/Permissões/Tools/Gateway intactos e o contrato tocado só no campo `denialKind`);
- confirmar que os pré-requisitos (SPEC-0010/0013/0014/0017) estão `Done`;
- **`git grep 'ExecutedStep'` em todo o repo** antes de editar o contrato: adicionar um membro a uma interface de contrato pode quebrar fakes/construções em testes no typecheck (lição recorrente). Embora `denialKind` seja opcional (baixo risco), mapear os construtores (`runtime.ts`, `runtime.test.ts`, `cognitive-core.ts`, `cognitive` tests) evita surpresas.

Durante a implementação:

- TDD com fakes (gateway `fake` que conta chamadas e roteiriza saídas por passe; runtime fake que roteiriza `ExecutionResult`), sem rede/disco;
- observador puro, sem gateway, sem parse de string; laço com teto fixo, nunca infinito, nunca lançando;
- Runtime só rotula os dois branches — não mudar fluxo/ordem/semântica;
- não vazar escopo (nada de observador semântico, teto configurável, replan em bloqueio, dependência entre passos, Task Manager, Aprendizado; nenhuma mudança de contrato além de `denialKind`; nada em Planner/Permissões/Tools/Gateway/CLI);
- `steps` acumulados na ordem de execução; `respond` continua função pura.

Após a implementação:

- rodar `lint`/`format:check`/`typecheck`/`test`;
- atualizar documentação (`CLAUDE.md` raiz + cognitive + contracts + runtime; `Roadmap.md` item 1.2; contexto);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, o ciclo cognitivo do Atlas deixa de ser um passe único: quando uma Tool falha, o Cognitive Core observa a execução (determinísticamente, sem chamar o modelo, classificando por `ExecutedStep.denialKind`) e retorna **uma vez** ao Planejamento com um resumo compacto do que falhou, reexecuta e compõe a resposta com o resultado acumulado — ou, se a falha persistir, para no teto fixo (1 replan) e compõe honestamente com as falhas. Bloqueio de permissão (`blocked`) e recusa do usuário no `confirm` (`declined`) continuam terminais: não reiniciam o ciclo. O traço de `steps` mostra o retry (passos acumulados) via `renderSteps`, sem mudança de assinatura pública. O grosso da mudança vive em `@atlas/cognitive`; `@atlas/contracts` ganha só o campo opcional `ExecutedStep.denialKind` (aditivo/retrocompatível) e o Runtime só o rotula nos dois branches de negação que já produzia; o Planner, o Permission Service, as Tools e o Model Gateway permanecem intactos. A Etapa 5 (Observação) do Cognitive Lifecycle passa a existir; a Etapa 6 (Aprendizado) segue como fatia futura do item 1.2.

---

# Pontos em Aberto (a confirmar na aprovação `Draft → Ready`)

1. **Prioridade** — proposta **Medium** (valor de produto, raio contido a `@atlas/cognitive` + duas adições cirúrgicas em `@atlas/contracts`/Runtime, sem urgência de segurança). O humano confirma ou ajusta na aprovação.

_O ponto em aberto anterior (mecanismo de discriminação do observador) foi **resolvido** pelo humano e incorporado ao ADR-0015: discriminador estruturado `ExecutedStep.denialKind?: 'blocked' | 'declined'` (Caminho 1), rotulado pelo Runtime; regra do observador "replan se algum `ok:false` sem `denialKind`, senão complete"; casos-limite (ferramenta desconhecida → replan; TOCTOU/contenção-no-uso → replan) fechados. Esta SPEC já reflete essa resolução — não há mais ambiguidade de mecanismo em aberto._
