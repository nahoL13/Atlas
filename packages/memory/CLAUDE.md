# @atlas/memory

Memory Service (Support) — autoridade única de conhecimento persistente (ADR-0011).

- `createMemoryService({ storage }): Promise<MemoryService>` → `remember/forget/list/prompt`. Carrega os fatos **uma vez** na criação (leitura síncrona) e persiste por **write-through**.
- Fatia mínima (SPEC-0009): só **fatos/preferências explícitos** (`Fact = { id, text, createdAt, source? }`). Sem episódica/projetos/busca/classificação/retenção/relações — SPECs futuras.
- **Proveniência (SPEC-0020/ADR-0016)**: `remember(text, source?)` aceita `source?: 'user' | 'learned'` (default `'user'` — chamadores de 1 argumento intactos) e persiste no `Fact`. `'learned'` é usado pela **borda** ao gravar fatos propostos pelo Cognitive ao fim de um turno (Aprendizado, Etapa 6); a autoridade de gravação segue exclusiva deste serviço. Fatos legados sem `source` seguem legíveis (tratados como `'user'` na exibição).
- Persistência atrás de uma **porta injetável** `MemoryStorage` (`load`/`save`), interna ao package: `createFileMemoryStorage(path)` (JSON) é o default; testes injetam um fake em memória (sem IO real). A porta **não sobe** a `@atlas/contracts`.
- `prompt()` enquadra os fatos para **injeção na geração** do Cognitive (ADR-0011, estende ADR-0010): o core passa `memory.prompt()` como `memoryPrompt`. O Cognitive não conhece o conceito de Memory.
- **Não** decide estratégia, **não** controla o fluxo cognitivo, **não** chama o Model Gateway, **não** considera toda conversa como memória permanente (Module Catalog).
- Memória (persistente) × Contexto (temporário) são distintos (Glossary). Depende só de `@atlas/contracts`. Erro: `MemoryError` (`AtlasError` code `ATLAS_MEMORY`).
