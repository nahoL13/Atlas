# @atlas/permissions

Permission Service (Support) — avalia se uma ação pode ser executada (ADR-0013).

- `createPermissionService({ readRoots })` → `evaluate(action)`: **puro e síncrono, sem IO**. Julga uma `ActionRequest` contra a política de **raiz permitida** por **contenção lexical** (path resolvido + prefixo com fronteira de separador; sem `realpath`/symlink). Dentro de uma raiz → `allowed`; fora → `blocked` (com motivo). `access` ≠ `read` → `blocked` (reservado; nada destrutivo nesta versão).
- **Não** executa ações, **não** faz IO, **não** decide estratégia, **não** presume consentimento para ações destrutivas (Module Catalog).
- Vocabulário dos 4 veredictos vive em `@atlas/contracts` (`PermissionVerdict`): `free` = ausência de requirement (o Runtime nem consulta); `confirm` reservado ao fluxo interativo futuro.
- Depende só de `@atlas/contracts` (Regra 5). Contenção lexical não segue symlinks — limitação conhecida.
