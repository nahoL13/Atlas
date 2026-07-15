# @atlas/tools

Tools (Execution/Extension) — adaptadores e catálogo de ferramentas do Atlas (ADR-0012/0013).

- `createToolRegistry()` → `register/get/has/list` sobre um `Map` (fonte do catálogo consumido pelo Runtime).
- `createClockTool({ now? })` → Tool `clock` (data/hora ISO; `now` injetável nos testes). `createCalcTool()` → Tool `calc` (aritmética via parser próprio restrito). Ambas seguem **puras**: sem `requirements`, sem rede/disco/efeito colateral, `calc` **não** usa `eval`/`Function`.
- `createReadFileTool({ fs? })` → Tool `read_file` (lê o conteúdo de um arquivo) e `createListDirTool({ fs? })` → Tool `list_dir` (lista as entradas de um diretório) — **primeiras Tools com IO** da plataforma. Cada uma declara `requirements(args) → ActionRequest` (o recurso e o `access: 'read'` que tocaria, como **dado**) e lê o disco pela porta injetável `FsReadPort` (`readFile`/`readdir`; default `nodeFsReadPort()` sobre `node:fs/promises`; fake nos testes — sem disco real). Erro de IO (arquivo/diretório ausente, `args` inválido) vira `ToolResult` de erro, nunca lança.
- Uma Tool **não decide permissão nem quando é usada** (Module Catalog) — `requirements` só descreve o recurso; quem julga é o Permission Service (`@atlas/permissions`) e quem aplica o veredicto é o Runtime. A Tool só executa `run(args)` e devolve `ToolResult` estruturado (`ok`/`output`/`error`).
- Depende só de `@atlas/contracts` (Regra 5: Tools não dependem do Cognitive Core nem de `@atlas/permissions`). Contratos `Tool`/`ToolResult`/`ToolDescriptor`/`ToolRegistry`/`ActionRequest` vivem em `@atlas/contracts`; `FsReadPort` é interno ao package (sem 2º consumidor).
