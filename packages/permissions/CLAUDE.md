# @atlas/permissions

Permission Service (Support) — avalia se uma ação pode ser executada (ADR-0013).

- `createPermissionService({ readRoots, writeRoots })` → `evaluate(action)`: **puro e síncrono, sem IO**. Roteia por `access`: `read` julgado contra `readRoots`, `write` contra `writeRoots` — ambos por **contenção lexical** (path resolvido + prefixo com fronteira de separador; sem `realpath`/symlink), via função interna `within(target, roots)` fatorada. Dentro da raiz correspondente → `allowed`; fora (ou lista vazia) → `blocked` (com motivo). Grants de leitura e escrita são **independentes**. `access` fora de `read`/`write` → `blocked`.
- **Não** executa ações, **não** faz IO, **não** decide estratégia, **não** presume consentimento para ações destrutivas (Module Catalog).
- Vocabulário dos 4 veredictos vive em `@atlas/contracts` (`PermissionVerdict`): `free` = ausência de requirement (o Runtime nem consulta); `confirm` reservado ao fluxo interativo futuro.
- Depende só de `@atlas/contracts` (Regra 5). Contenção lexical não segue symlinks — limitação conhecida.
