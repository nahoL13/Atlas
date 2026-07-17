# @atlas/cli

Primeira interface executável do Atlas (SPEC-0003). Casca de processo (`main.ts`) + `run()` testável + sementes de Input/Output Gateway.

- Aplicação: consome `@atlas/core` (`createAtlas`), não reimplementa lógica do Core.
- Sementes de Input Gateway (normaliza `argv`+`env`) e Output Gateway (entrega stdout/stderr) — interfaces locais; promover a `@atlas/contracts` só com um 2º consumidor (via ADR).
- Precedência de config: `flags > env > arquivo > defaults` (ADR-0006); `flags` e `env` implementados; `arquivo` reservado. Validação fica no core.
- Execução sem `dist/`: roda o fonte `.ts` via `tsx` (ADR-0005); `bin` → `./src/main.ts` com shebang `#!/usr/bin/env -S npx tsx`. Dev: `tsx src/main.ts` ou `pnpm run atlas`.
- Sem dependências de _runtime_ além de `@atlas/contracts` e `@atlas/core`; `tsx` é _dev tooling_. Parsing via `node:util`.
- `atlas chat` (SPEC-0014): cada turno passa por `cognitive.respond`, que agora pode planejar e executar Tools. O traço de `steps` é impresso a cada turno reusando `renderSteps` (`src/gateway/steps-trace.ts`), compartilhado com `atlas ask`. O `ConfirmPort` de ações destrutivas (`delete_file`) é construído sobre o **mesmo** `LineReader` da sessão (`src/gateway/confirm-port.ts`, `createLineReaderConfirmPort`) e injetado em `createAtlas(..., { confirm })` — nunca um segundo `readline` sobre `stdin`. Em `run.ts`, o `LineReader` do `chat` nasce **antes** de `createAtlas` justamente para viabilizar essa composição.
