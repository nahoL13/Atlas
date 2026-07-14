# @atlas/tools

Tools (Execution/Extension) — adaptadores e catálogo de ferramentas do Atlas (ADR-0012).

- `createToolRegistry()` → `register/get/has/list` sobre um `Map` (fonte do catálogo consumido pelo Runtime).
- `createClockTool({ now? })` → Tool `clock` (data/hora ISO; `now` injetável nos testes). `createCalcTool()` → Tool `calc` (aritmética via parser próprio restrito).
- Tools são **puras**: sem rede, disco, filesystem ou efeitos colaterais (o Permission Service ainda não existe). `calc` **não** usa `eval`/`Function`.
- Uma Tool **não decide quando é usada** (Module Catalog) — só executa `run(args)` e devolve `ToolResult` estruturado (`ok`/`output`/`error`), nunca lança para o chamador em erro esperado.
- Depende só de `@atlas/contracts` (Regra 5: Tools não dependem do Cognitive Core). Contratos `Tool`/`ToolResult`/`ToolDescriptor`/`ToolRegistry` vivem em `@atlas/contracts`.
