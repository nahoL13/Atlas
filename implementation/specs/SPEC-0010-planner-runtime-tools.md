# SPEC-0010 — Planner + Runtime + Tools (execução ponta a ponta)

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0010

---

**Título**

Espinha de execução: Planner produz plano, Runtime executa Tools reais (`clock`/`calc`)

---

**Status**

- [x] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [ ] Done

---

**Prioridade**

High

---

# Objetivo

Ao concluir esta SPEC, o ciclo cognitivo deixa de ser totalmente **colapsado**: as etapas de **Planejamento** e **Execução** passam a existir como componentes reais, entregando a **primeira execução de Tool ponta a ponta** da plataforma. Um objetivo submetido a `atlas ask` pode, quando precisar, ser transformado num **Plan** estruturado (Planner-driven), executado por um **Runtime** sobre **Tools** concretas, e ter os resultados sintetizados numa resposta final na voz da Persona ativa — tudo **sem alterar o Model Gateway** (o modelo produz um plano em texto estruturado; o Runtime executa deterministicamente).

Concretamente, quando esta SPEC estiver concluída:

- Existe o package `packages/tools` (`@atlas/tools`): um **Tool Registry** (`register`/`get`/`has`/`list`) e **duas Tools puras** — `clock` (data/hora atual) e `calc` (aritmética) — sem rede, sem disco, sem permissões.
- Existe o package `packages/runtime` (`@atlas/runtime`): `createRuntime({ registry })` → `execute(plan)` roda os passos em ordem, resolvendo cada Tool no registry e coletando um `ExecutionResult` com falhas **estruturadas** (nunca lança por falha de Tool); e `tools()` expõe os descritores (nome + descrição) das Tools disponíveis.
- O **Planner** vive consolidado em `packages/cognitive` (consolidação sancionada pelo Project Structure): produz a **instrução de planejamento** (lista as Tools e o schema JSON) e **parseia** a saída do modelo num `Plan` (ou `null` = resposta direta).
- O **Cognitive Core** passa a **orquestrar** em `ask`: 1ª chamada `generate()` (prompt composto de sempre + instrução de planejamento) → parseia → se houver plano, `runtime.execute(plan)` → 2ª chamada `generate()` compõe a resposta final com os resultados. `ask` retorna `AskResult { text; steps? }`.
- Os contratos `Tool`/`ToolResult`/`ToolDescriptor`/`ToolRegistry`/`Plan`/`PlanStep`/`ExecutedStep`/`ExecutionResult`/`Runtime` e `AskResult` vivem em `@atlas/contracts`.
- `@atlas/core` compõe o registry (com `clock`+`calc`), o Runtime e injeta o Runtime no Cognitive.
- `atlas ask` mostra um **traço compacto** de execução (Tools usadas + resultados) antes da resposta final, honrando a transparência do ciclo cognitivo.
- ADR-0012 registra a decisão (espinha de execução Planner-driven; Gateway intacto; passos independentes).

---

# Motivação

O **Cognitive Lifecycle** define sete etapas (Compreensão → Raciocínio → **Planejamento** → **Execução** → Observação → Aprendizado → Resposta). Até aqui (SPEC-0005), o Atlas honra o ciclo de forma **colapsada**: Compreensão + Raciocínio + Resposta acontecem numa única chamada `generate()`, e Planejamento/Execução/Observação/Aprendizado ainda não existem. O Atlas só sabe *falar* — não sabe *fazer*.

Esta SPEC introduz a **espinha de execução**: o menor recorte que faz Planejamento e Execução existirem de verdade, com uma Tool real produzindo um resultado que o modelo sozinho não teria (a hora atual) e outra que ele erra com frequência (aritmética). O **Module Catalog** cataloga o **Planner** (`packages/planner`, consolidável em `packages/cognitive`), o **Runtime** (`packages/runtime`) e as **Tools** (`packages/tools`) como componentes distintos, com autoridade separada: Cognitive Core decide a estratégia, Planner transforma estratégia em plano, Runtime coordena a execução, Tools são adaptadores sem decisão. O **ProjectStructure** prevê `packages/runtime` e `packages/tools` e nomeia `Plan`, `Task`, `ExecutionResult` como contratos de `@atlas/contracts`.

O amplo desenho do ciclo é deliberadamente **decomposto em fatias**: esta SPEC entrega Planejamento + Execução com passos independentes e duas Tools puras; Observação/replanejamento, Aprendizado automático, Skills, Permission Service, dependência de dados entre passos e Task Manager completo (fila/retry/timeout/cancelamento) ficam para SPECs futuras.

Documentos originadores: **CognitiveLifecycle** (etapas Planejamento/Execução) + **Module Catalog / Project Structure** (Planner, Runtime, Tools).

---

# Referências

- Cognitive Lifecycle (`docs/03-architecture/CognitiveLifecycle.md`) — etapas Planejamento, Execução, Observação; transparência
- Module Catalog (`docs/03-architecture/ModuleCatalog.md`) — Planner, Runtime, Task Manager, Tool Registry; Matriz de Autoridade; Regras de Dependência 5–8
- Project Structure (`docs/03-architecture/ProjectStructure.md`) — `packages/runtime`, `packages/tools`; Planner consolidável em `packages/cognitive`; `Plan`/`Task`/`ExecutionResult` em contracts
- ArchitectureConstitution — Tools são adaptadores sem lógica de negócio; Core é o único orquestrador de composição
- ADR-0003 (composition root), ADR-0004 (composição manual por factory), ADR-0007 (promoção de contrato ao 2º consumidor)
- ADR-0010 (Persona injetada na geração), ADR-0011 (Memory injetada; efeito colateral atrás de porta injetável) — padrões reaproveitados
- ADR-0012 — espinha de execução Planner-driven (a ser criado por esta SPEC)
- SPEC-0004 (Model Gateway), SPEC-0005 (Cognitive Core)

---

# Escopo

- Criar o package `packages/tools` (`@atlas/tools`):
  - `createToolRegistry(): ToolRegistry` (`register`/`get`/`has`/`list`).
  - `createClockTool({ now? }): Tool` — `name: 'clock'`; `run()` retorna a data/hora atual (ISO). `now` (`() => Date`) injetável para testes determinísticos.
  - `createCalcTool(): Tool` — `name: 'calc'`; `run({ expression })` avalia aritmética (`+ - * /`, parênteses, números decimais) de forma **segura** (parser próprio, **sem `eval`/`Function`**); expressão inválida → `ToolResult` de erro.
- Criar o package `packages/runtime` (`@atlas/runtime`):
  - `createRuntime({ registry }): Runtime` com `execute(plan)` (executa passos em ordem; resolve Tool no registry; falha estruturada quando a Tool não existe ou lança; **nunca lança** por falha de Tool) e `tools()` (descritores das Tools do registry).
  - `RuntimeError` (`code: 'ATLAS_RUNTIME'`) para falhas internas excepcionais (não para falhas de Tool, que são estruturadas).
- Consolidar o **Planner** em `packages/cognitive`:
  - `createPlanner(): Planner` **puro** (sem gateway): `instruction(tools)` (framing que lista as Tools e o schema JSON de plano) e `parse(modelOutput): Plan | null` (extrai/valida o plano; `null` = resposta direta).
- Alterar o **Cognitive Core** (`packages/cognitive`):
  - `createCognitiveCore({ gateway, runtime, personaPrompt?, memoryPrompt? })` passa a receber o `runtime`.
  - `ask(objective): Promise<AskResult>` orquestra: 1ª `generate()` (system composto + `planner.instruction(runtime.tools())`) → `planner.parse` → se `Plan`, `runtime.execute` + 2ª `generate()` de composição (system composto + objetivo + bloco de resultados) → `AskResult { text, steps }`; se `null`, `AskResult { text }` (1 chamada, comportamento de hoje preservado).
  - `startConversation`/`respond` **inalterados** (não ganham planejamento nesta fatia).
- Promover contratos a `@atlas/contracts`: `Tool`, `ToolResult`, `ToolDescriptor`, `ToolRegistry`, `Plan`, `PlanStep`, `ExecutedStep`, `ExecutionResult`, `Runtime`; alterar `CognitiveCore.ask` para `Promise<AskResult>` e adicionar `AskResult`.
- Compor em `@atlas/core`: criar o registry (`register(createClockTool())`, `register(createCalcTool())`), criar `createRuntime({ registry })`, injetar `runtime` em `createCognitiveCore`.
- CLI: o comando `atlas ask` passa a consumir `AskResult` — imprime o **traço** dos passos (Tool + resultado/erro) e depois a resposta final.
- Testes (unit + integração) e documentação.
- Criar ADR-0012.

---

# Fora do Escopo

Esta seção é obrigatória.

- **Não** alterar o **Model Gateway** — sem tool/function-calling nativo; o mecanismo é Planner-driven (JSON estruturado via `generate()` atual).
- **Não** implementar **dependência de dados entre passos** — os passos de um plano são **independentes**; nenhum passo consome a saída de outro. O Runtime executa todos e a composição recebe todos os resultados juntos. (Grafo de dependências / threading de dados = fatia futura.)
- **Não** implementar um **Task Manager completo** — sem fila, retry, timeout, cancelamento nem os estados `pending/ready/blocked/awaiting-approval/cancelled`. A execução é sequencial e inline; cada passo resulta em sucesso ou falha estruturada.
- **Não** implementar **Skills** nem **Skill Registry** (`packages/skills`) — apenas Tools.
- **Não** implementar o **Permission Service** (`packages/permissions`) — por isso as Tools desta fatia são **puras** (sem rede, disco, filesystem ou efeitos colaterais); Tools que exijam avaliação de risco ficam para depois do Permission Service.
- **Não** implementar **Observação/replanejamento** (o ciclo não volta ao planejamento) nem **Aprendizado automático** (o Cognitive não grava fatos sozinho).
- **Não** adicionar planejamento ao `atlas chat`/`respond` — só `ask` nesta fatia; `respond` permanece função pura e inalterado.
- **Não** implementar o **Activity Service** — o traço de execução é impresso pelo CLI a partir do `AskResult`, não por um serviço de observabilidade.
- **Não** adicionar Tools além de `clock` e `calc`; **não** adicionar `read_file`/terminal/git/browser.
- **Não** expor `atlas.runtime`/`atlas.tools` em `AtlasPlatform` (nada externo os consome; a orquestração é interna ao Cognitive) nem criar comando `atlas tools list`.
- **Não** adicionar config nova (as Tools são fixas; sem flags para habilitar/desabilitar Tools).
- **Não** promover o contrato do **Planner** a `@atlas/contracts` (permanece interno a `@atlas/cognitive`, sem 2º consumidor — como `MemoryStorage` em `@atlas/memory`).

---

# Pré-requisitos

- SPEC-0004 (Model Gateway) — Done
- SPEC-0005 (Cognitive Core) — Done

---

# Critérios de Aceitação

Cada item é verificável.

- Package `@atlas/tools` criado. `createToolRegistry()` retorna um `ToolRegistry`; `register`/`get`/`has`/`list` funcionam; `get` de nome inexistente → `undefined`.
- `createClockTool({ now })`: `run()` retorna `ToolResult { ok: true, output }` com a data/hora derivada de `now()`; determinístico sob `now` injetado.
- `createCalcTool()`: `run({ expression: '12*8' })` → `{ ok: true, output: '96' }`; expressão inválida (`'2 +'`, `'a+1'`) → `{ ok: false, error }`; `args` sem `expression` string → `{ ok: false, error }`. Implementação **não usa `eval`/`Function`**.
- Package `@atlas/runtime` criado. `createRuntime({ registry })`:
  - `execute(plan)` executa os passos em ordem e retorna `ExecutionResult` com um `ExecutedStep` por passo (`tool`, `args`, `result`).
  - Passo com Tool inexistente → `ExecutedStep` com `result.ok === false` (erro estruturado); execução **continua** nos demais passos.
  - Tool que lança exceção → capturada como `result.ok === false`; `execute` **não** propaga.
  - `tools()` retorna os `ToolDescriptor` (`name`, `description`) das Tools do registry.
- Planner (em `@atlas/cognitive`): `createPlanner()` é **puro** (sem gateway); `instruction(tools)` inclui os nomes/descrições das Tools e o schema JSON; `parse(text)` retorna um `Plan` válido para saída com plano e `null` para texto sem plano/JSON malformado.
- Cognitive Core: `createCognitiveCore({ gateway, runtime, personaPrompt?, memoryPrompt? })`:
  - `ask` sem plano (parse → `null`) faz **1** chamada `generate()` com o system prompt composto e retorna `AskResult { text }` sem `steps` (comportamento de hoje preservado; resposta já na voz da Persona/memória).
  - `ask` com plano faz a 1ª chamada, executa via `runtime`, faz a 2ª chamada de composição (system composto + objetivo + resultados) e retorna `AskResult { text, steps }` com um `ExecutedStep` por passo.
  - Falha de Tool não derruba `ask`: os erros estruturados chegam à composição e a resposta reflete a falha.
  - `respond` permanece função pura e **inalterado** (diff não introduz estado nem planejamento em `respond`).
- Contratos `Tool`/`ToolResult`/`ToolDescriptor`/`ToolRegistry`/`Plan`/`PlanStep`/`ExecutedStep`/`ExecutionResult`/`Runtime`/`AskResult` vivem em `@atlas/contracts`; `CognitiveCore.ask` retorna `Promise<AskResult>`.
- `@atlas/core` compõe registry (`clock`+`calc`) + `createRuntime` + injeta `runtime` no Cognitive; `atlas.cognitive.ask` funciona ponta a ponta com fakes.
- CLI: `atlas ask "<objetivo>"` imprime o traço dos passos (Tool + resultado/erro) quando há execução e sempre a resposta final; sem execução, imprime só a resposta (como hoje).
- Erro interno de runtime → `AtlasError` com `code: 'ATLAS_RUNTIME'`.
- ADR-0012 criado e aceito.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.
- Documentação atualizada; lições registradas em `implementation/LESSONS_LEARNED.md`.

---

# Arquivos Esperados

```text
packages/tools/
  package.json
  tsconfig.json
  CLAUDE.md
  src/
    index.ts            # createToolRegistry, createClockTool, createCalcTool
    registry.ts         # createToolRegistry (Map register/get/has/list)
    clock.ts            # createClockTool({ now? })
    calc.ts             # createCalcTool (parser aritmético seguro, sem eval)
  tests/
    registry.test.ts
    clock.test.ts
    calc.test.ts

packages/runtime/
  package.json
  tsconfig.json
  CLAUDE.md
  src/
    index.ts            # createRuntime
    runtime.ts          # execute(plan) + tools()
    errors.ts           # RuntimeError (ATLAS_RUNTIME)
  tests/
    runtime.test.ts     # registry fake: multi-passo, tool inexistente, tool que lança

packages/cognitive/src/
  planner.ts            # createPlanner (instruction + parse) — puro
  cognitive-core.ts     # ask orquestra planner + runtime + composição; AskResult
  index.ts              # re-export createPlanner (se necessário aos testes)
packages/cognitive/tests/
  planner.test.ts       # instruction lista tools; parse plano/answer/malformado
  cognitive-core.test.ts# 1 chamada (answer) vs 2 (plan); resultados na composição

packages/contracts/src/
  execution.ts          # Tool, ToolResult, ToolDescriptor, ToolRegistry,
                        # Plan, PlanStep, ExecutedStep, ExecutionResult, Runtime
  cognitive.ts          # AskResult; CognitiveCore.ask -> Promise<AskResult>
  index.ts              # re-exports

packages/core/src/index.ts   # cria registry+tools+runtime; injeta runtime no cognitive
packages/core/tests/

apps/cli/src/commands/ask.ts # consome AskResult; imprime traço + resposta
apps/cli/tests/

docs/06-adr/ADR-0012-planner-runtime-execution.md
```

Lista é expectativa; pode sofrer pequenos ajustes (ex.: `execution.ts` pode ser dividido em `tools.ts`/`plan.ts` se ficar mais legível; `planner.ts` pode não precisar de re-export no `index.ts`).

---

# Componentes Impactados

- Tools (novo) — `packages/tools` (Tool Registry + `clock` + `calc`)
- Runtime (novo) — `packages/runtime` (Runtime + execução sequencial mínima)
- Planner (novo, consolidado) — `packages/cognitive`
- Cognitive Core — passa a orquestrar planejamento + execução + composição; `ask` retorna `AskResult`
- Contracts — `@atlas/contracts` (contratos de execução + `AskResult` + `ATLAS_RUNTIME`)
- Core — composição do registry/runtime e injeção no Cognitive
- CLI (Output) — `ask` imprime o traço de execução

---

# Interfaces Necessárias

Em `@atlas/contracts` (`execution.ts`):

```ts
export interface ToolResult {
  readonly ok: boolean;
  readonly output?: string;   // resultado textual quando ok
  readonly error?: string;    // mensagem quando !ok
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  run(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  has(name: string): boolean;
  list(): readonly Tool[];
}

export interface PlanStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
}

export interface Plan {
  readonly steps: readonly PlanStep[];
}

export interface ExecutedStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly result: ToolResult;
}

export interface ExecutionResult {
  readonly steps: readonly ExecutedStep[];
}

export interface Runtime {
  tools(): readonly ToolDescriptor[];
  execute(plan: Plan): Promise<ExecutionResult>;
}
```

Em `@atlas/contracts` (`cognitive.ts`):

```ts
export interface AskResult {
  readonly text: string;
  readonly steps?: readonly ExecutedStep[];   // presente quando Tools foram usadas
}

export interface CognitiveCore {
  ask(objective: string): Promise<AskResult>;   // era Promise<string>
  startConversation(): Conversation;
  respond(conversation: Conversation, input: string): Promise<ConversationTurn>;
}
```

Interno a `@atlas/cognitive` (não sobe a contracts — sem 2º consumidor):

```ts
export interface Planner {
  instruction(tools: readonly ToolDescriptor[]): string;   // framing p/ a 1ª chamada
  parse(modelOutput: string): Plan | null;                 // null = resposta direta
}
```

`CognitiveCoreDeps` ganha `runtime: Runtime`.

---

# Fluxo Esperado

```text
atlas ask "faltam quantos dias pro fim do ano?"
  ↓  atlas.cognitive.ask(objetivo)
  ↓  1ª generate(): system = [persona, memória, TASK_FRAMING].join + planner.instruction(runtime.tools())
  ↓  planner.parse(saída)
        ├─ null  → AskResult { text }                    (resposta direta, 1 chamada)
        └─ Plan  → runtime.execute(plan)
                     ↓ para cada passo: registry.get(tool).run(args)
                     ↓   (tool inexistente / exceção → ExecutedStep com erro estruturado)
                     ↓ ExecutionResult { steps }
                   2ª generate(): system composto + objetivo + bloco de resultados
                     ↓ AskResult { text, steps }
  ↓  CLI: imprime traço (clock → 2026-07-14; calc → 170) + resposta final
```

Autoridade (Module Catalog): Cognitive Core **orquestra e responde**; Planner **transforma** a saída do modelo num Plan (schema + parse); Runtime **coordena a execução**; Tools **executam** sem decidir quando são usadas.

---

# Estratégia de Implementação

1. Contratos: `execution.ts` em `@atlas/contracts` + `AskResult` e novo tipo de `ask` em `cognitive.ts` + re-exports. (`RuntimeError` fica em `packages/runtime/src/errors.ts`, subclasse de `AtlasError`, como `MemoryError`.)
2. `@atlas/tools`: `createToolRegistry`, `createClockTool`, `createCalcTool` (parser seguro); testes.
3. `@atlas/runtime`: `createRuntime` (`execute` + `tools`), `RuntimeError`; testes com registry fake (multi-passo, Tool inexistente, Tool que lança).
4. Planner em `@atlas/cognitive`: `createPlanner` (`instruction` + `parse`), puro; testes.
5. Cognitive Core: `ask` orquestra (planner + runtime + composição), `AskResult`, `runtime` injetado; atualizar testes (1 vs 2 chamadas; resultados na composição; `respond` intacto).
6. Core: compor registry (`clock`+`calc`) + runtime + injeção no Cognitive; testes de integração.
7. CLI: `ask` consome `AskResult`, imprime traço + resposta; testes.
8. ADR-0012; documentação; lições; suíte completa.

---

# Estratégia de Testes

- **Tools** — Registry: `register`/`get`/`has`/`list`; `get` de inexistente → `undefined`. `clock`: `run()` determinístico sob `now` injetado. `calc`: expressões válidas (`12*8`, `2+3*4`, `(2+3)*4`, decimais) → resultado correto; inválidas (`2+`, `a+1`, vazio) e `args` sem `expression` → erro estruturado. Confirmar ausência de `eval`/`Function` (revisão + teste de expressão maliciosa retornando erro, não execução).
- **Runtime** (registry fake): plano de 2 passos executa em ordem e agrega resultados; passo com Tool inexistente → falha estruturada e continua; Tool que lança → falha estruturada e não propaga; `tools()` reflete o registry.
- **Planner** (puro): `instruction(tools)` contém nomes/descrições das Tools e o schema; `parse` retorna `Plan` para JSON de plano válido, `null` para texto natural, `null` para JSON malformado; plano com Tool desconhecida ainda parseia (o Runtime é quem falha o passo).
- **Cognitive Core** (gateway fake roteirizado, runtime fake): caminho `answer` faz **1** chamada e não retorna `steps`; caminho `plan` faz **2** chamadas, chama `runtime.execute` e injeta os resultados na 2ª chamada (capturar as mensagens); falha de Tool aparece na composição; `respond` inalterado (teste de regressão).
- **Core** (fakes): `atlas.cognitive.ask` usa o registry composto; objetivo que aciona `clock`/`calc` produz `steps` correspondentes.
- **CLI**: `ask` imprime o traço quando há `steps` e a resposta final; sem `steps`, imprime só a resposta; provider `fake` mantém a suíte verde.

---

# Definition of Done

- todos os critérios atendidos;
- testes passando (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`);
- documentação atualizada (CLAUDE.md raiz — invariantes/estado; `packages/tools/CLAUDE.md`; `packages/runtime/CLAUDE.md`; `packages/cognitive/CLAUDE.md` — passa a orquestrar planejamento/execução; `packages/core/CLAUDE.md` se necessário; NEXT_CONTEXT; CURRENT_SPRINT);
- ADR-0012 aceito;
- arquitetura preservada (Tools não dependem do Cognitive nem decidem uso; Planner não coordena execução; Runtime não redefine objetivo; Cognitive mantém a autoridade estratégica; `respond` puro; Gateway intacto);
- revisão concluída;
- lições registradas em `implementation/LESSONS_LEARNED.md`.

---

# Restrições

- Não criar módulos além de Planner, Runtime e Tools catalogados.
- **Regras de Dependência** (Module Catalog / Project Structure): Tools (`@atlas/tools`) e Runtime (`@atlas/runtime`) dependem **só** de `@atlas/contracts`; **não** dependem do Cognitive Core (Regra 5). Planner não coordena execução (Regra 7). Runtime não redefine o objetivo estratégico (Regra 8). Só `@atlas/core` importa implementações (Regra 11).
- O **Model Gateway** permanece intacto (sem tool-calling nativo).
- As Tools desta fatia são **puras** (sem rede, disco, filesystem, efeitos colaterais), pois o Permission Service ainda não existe.
- O Runtime **nunca lança** por falha de Tool — falhas são `ToolResult`/`ExecutedStep` estruturados; `ATLAS_RUNTIME` é só para falhas internas excepcionais.
- `calc` **não** pode usar `eval`/`Function` — parser aritmético próprio e restrito.
- Passos de um plano são **independentes**; nenhum consome a saída de outro nesta fatia.
- `respond`/`chat` não recebem planejamento; `respond` segue função pura.

---

# Observações

- **Espinha de execução Planner-driven (ADR-0012):** o modelo produz um plano em **texto estruturado** (JSON) via o `generate()` atual; o Runtime o executa deterministicamente. Isso mantém o Model Gateway intacto e a fronteira de autoridade limpa (Cognitive decide → Planner transforma → Runtime executa), em vez de tool-calling nativo (que borraria as fronteiras e dependeria de suporte do provedor local).
- **Colapso honesto:** a classificação estratégica "responder direto × precisar de Tool" está **colapsada** na 1ª chamada `generate()` (como Compreensão+Raciocínio+Resposta já estão colapsados em `ask` hoje). O Planner não chama o modelo — ele fornece a instrução e parseia a saída; a chamada é do Cognitive Core, que detém a autoridade estratégica. Descolapsar a classificação em etapa própria fica para fatia futura.
- **Resposta direta preservada:** quando o objetivo não precisa de Tool, `parse` retorna `null` e o Atlas responde em **1** chamada, com o mesmo system prompt composto (persona + memória + tarefa) de hoje — sem regressão de comportamento nem de custo no caminho comum.
- **Planner puro, sem gateway:** ao separar "chamar o modelo" (Cognitive) de "definir schema + parsear" (Planner), o Planner fica **testável sem gateway**, espelhando a preferência do repo por unidades puras (como `respond` e o `MemoryStorage` fake).
- **Runtime.tools() como fonte única do catálogo:** o Runtime, dono do registry, expõe os descritores (nome+descrição) para o Planner montar a instrução — assim o Cognitive depende só do contrato `Runtime` e nunca de `@atlas/tools`, e não pode chamar `tool.run` direto (respeita "o Cognitive não executa Tools").
- **Task Manager mínimo:** a execução é sequencial e inline; cada passo termina em sucesso ou falha estruturada. Fila, retry, timeout, cancelamento e os demais estados (`pending/ready/blocked/awaiting-approval/cancelled`) ficam para a SPEC que trouxer Skills/execução assíncrona.
- **Transparência (opção B do brainstorming):** `ask` retorna `AskResult { text; steps? }` para o CLI mostrar um traço compacto da execução — tornando a feature tangível e verificável no terminal sem precisar do Activity Service.
- **`calc` seguro:** parser aritmético restrito (números, `+ - * /`, parênteses), sem `eval`/`Function`, evitando execução arbitrária a partir de saída do modelo.

---

# Checklist para IA

Antes de implementar: ler CognitiveLifecycle (Planejamento/Execução/Observação), Module Catalog (Planner/Runtime/Task Manager/Tool Registry + Matriz de Autoridade + Regras 5–8), Project Structure (`runtime`/`tools`; consolidação do Planner; contratos de execução), ADR-0003/0004/0007/0010/0011, SPEC-0004/0005.

Durante: Tools puras e sem dependência do Cognitive; Planner puro (schema + parse) sem gateway; Runtime nunca lança por falha de Tool; passos independentes; Gateway intacto; `respond` puro; Cognitive mantém a autoridade estratégica e só toca Tools via `runtime`; `calc` sem `eval`; manter simplicidade e a fatia mínima.

Após: rodar a suíte; revisar documentação; validar critérios; registrar lições; concluir.

---

# Resultado Esperado

O Atlas passa a **fazer**, não só falar: as etapas de **Planejamento** e **Execução** do ciclo cognitivo deixam de ser colapsadas. Quando um objetivo precisa, o Cognitive Core pede ao Planner um **Plan** estruturado, o Runtime o executa sobre **Tools** reais (`clock` e `calc`), e a resposta final — na voz da Persona ativa — sintetiza os resultados; `atlas ask "que dia é hoje?"` passa a acertar a data, e `atlas ask "quanto é 1234×987?"` passa a calcular de fato, mostrando um traço compacto do que foi executado. O desenho — plano Planner-driven, Tools puras atrás de um registry, Runtime que coleta falhas estruturadas sem derrubar a execução, Cognitive orquestrando com o Gateway intacto — deixa a espinha pronta para as próximas fatias (mais Tools, Skills, Permission Service, dependência de dados entre passos, Task Manager completo, Observação/replanejamento e Aprendizado automático), e a decisão fica rastreável no ADR-0012. O caminho de resposta direta (sem Tools) segue idêntico ao de hoje — uma única chamada, mesma voz — sem regressão.
