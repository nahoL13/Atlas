# @atlas/runtime

Runtime (Execution) — coordena a execução de um Plan sobre o Tool Registry (ADR-0012).

- `createRuntime({ registry })` → `execute(plan)` (executa os passos em ordem; resolve cada Tool no registry; **nunca lança** por falha de Tool — Tool inexistente ou que lança vira `ExecutedStep` com `ToolResult` de erro; continua nos demais passos) e `tools()` (descritores nome+descrição das Tools, consumido pelo Planner via Cognitive).
- Passos são **independentes** nesta fatia (sem dependência de dados entre Tools). Task Manager completo (fila/retry/timeout/cancelamento) é fatia futura.
- **Não** redefine o objetivo estratégico (Regra 8) nem decide estratégia. Depende só de `@atlas/contracts`. Contratos `Plan`/`PlanStep`/`ExecutedStep`/`ExecutionResult`/`Runtime` vivem em `@atlas/contracts`.
