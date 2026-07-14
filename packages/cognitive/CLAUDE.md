# @atlas/cognitive

Cognitive Core (Intelligence) — orquestrador do ciclo cognitivo e consumidor do Model Gateway.

- `createCognitiveCore({ gateway, runtime, personaPrompt?, memoryPrompt? })` → `ask(objetivo)`. O `ask` **deixou de ser tiro único** (ADR-0012): passa a **orquestrar** Planejamento + Execução — 1ª `generate()` (prompt composto + instrução do Planner com o catálogo de `runtime.tools()`) → `planner.parse` → se houver `Plan`, `runtime.execute` + 2ª `generate()` de composição com os resultados; **sem plano, 1 chamada** (como antes, na voz da Persona/memória). `ask` retorna `AskResult { text; steps? }`.
- **Planner** consolidado no package (Project Structure): `createPlanner()` é **puro**, sem gateway — `instruction(tools)` (framing + schema JSON; string vazia sem Tools, preservando o caminho de 1 chamada) e `parse(saída) → Plan | null`. A chamada ao modelo é do Cognitive Core, não do Planner (autoridade estratégica + testabilidade).
- Conversa multi-turno como **dado** (ADR-0008): `startConversation()` + `respond(conversation, input)` (função pura) seguem **inalterados** — sem planejamento nesta fatia; o Core segue sem estado.
- Depende só de contratos em `@atlas/contracts` (`ModelGateway`/`CognitiveCore`/`Runtime`) — recebe o `runtime` por **injeção** e nunca importa `@atlas/runtime`/`@atlas/tools` (Regra 9). O Cognitive **não executa Tools direto**: só via `runtime.execute`.
- System prompt é **composto** (ADR-0010 + ADR-0011): `personaPrompt` (identidade) + `memoryPrompt` (fatos) + `TASK_FRAMING` (tarefa), na ordem identidade → memória → tarefa — `system = [personaPrompt, memoryPrompt, TASK_FRAMING].filter(Boolean).join('\n\n')`. Ambos opcionais, injetados por parâmetro; o Cognitive **não conhece os conceitos de Persona nem de Memory**, só recebe strings.
- Não persiste memória, não gerencia Tasks, não formata personalidade, não decide quando uma Tool é usada além de aprovar o plano (Module Catalog).
