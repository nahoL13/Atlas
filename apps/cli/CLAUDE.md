# @atlas/cli

Primeira interface executável do Atlas (SPEC-0003). Casca de processo (`main.ts`) + `run()` testável + sementes de Input/Output Gateway.

- Aplicação: consome `@atlas/core` (`createAtlas`), não reimplementa lógica do Core.
- Sementes de Input Gateway (normaliza `argv`+`env`) e Output Gateway (entrega stdout/stderr) — interfaces locais; promover a `@atlas/contracts` só com um 2º consumidor (via ADR).
- Precedência de config: `flags > env > arquivo > defaults` (ADR-0006); `flags` e `env` implementados; `arquivo` reservado. Validação fica no core.
- Execução sem `dist/`: roda o fonte `.ts` via `tsx` (ADR-0005); `bin` → `./src/main.ts` com shebang `#!/usr/bin/env -S npx tsx`. Dev: `tsx src/main.ts` ou `pnpm run atlas`.
- Sem dependências de _runtime_ além de `@atlas/contracts` e `@atlas/core`; `tsx` é _dev tooling_. Parsing via `node:util`.
