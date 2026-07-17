# @atlas/permissions

Permission Service (Support) — avalia se uma ação pode ser executada (ADR-0013).

- `createPermissionService({ readRoots, writeRoots })` → `evaluate(action)`: **puro e síncrono, sem IO**. Roteia por `access`: `read` julgado contra `readRoots`, `write`/`delete` contra `writeRoots` — todos por **contenção lexical** (path resolvido + prefixo com fronteira de separador; sem `realpath`/symlink), via função interna `within(target, roots)` fatorada. Dentro da raiz correspondente → `allowed` (`read`/`write`) ou `confirm` (`delete` — SPEC-0013, ação irreversível exige confirmação em tempo de execução); fora (ou lista vazia) → `blocked` (com motivo). Grants de leitura e escrita são **independentes**. `access` fora de `read`/`write`/`delete` → `blocked`.
- **Não** executa ações, **não** faz IO, **não** decide estratégia, **não** presume consentimento para ações destrutivas (Module Catalog) — quem aplica o veredicto `confirm` (pausar e perguntar) é o Runtime, via `ConfirmPort`, nunca este serviço.
- Vocabulário dos 4 veredictos vive em `@atlas/contracts` (`PermissionVerdict`): `free` = ausência de requirement (o Runtime nem consulta); `confirm` é produzido de verdade desde a SPEC-0013 (`access: 'delete'` dentro de `writeRoots`).
- Depende só de `@atlas/contracts` (Regra 5). Contenção lexical não segue symlinks — limitação conhecida.
