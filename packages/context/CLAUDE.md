# @atlas/context

Context Service (Support) — detentor do estado temporário de conversa por sessão (ADR-0008, ADR-0009).

- `createContextService(): ContextService` → `openSession/getConversation/updateConversation/closeSession`; guarda uma `Conversation` por sessão num `Map` em memória. Sessão some ao `closeSession`/fim do processo.
- **Store de valor, não orquestrador** (ADR-0009): não decide estratégia, não chama o Cognitive Core, não conhece system prompt. A app medeia; `cognitive.respond` segue função pura.
- Escopo mínimo (SPEC-0007): só conversa por sessão. Campos de ambiente (cwd/repo/branch/arquivos) e persistência (Memory Service) ficam para SPECs futuras.
- Depende só de `@atlas/contracts`. Erro de sessão inexistente: `ContextError` (`AtlasError` code `ATLAS_CONTEXT`).
- Não persiste conhecimento permanente (isso é do Memory Service, inexistente) — Module Catalog.
