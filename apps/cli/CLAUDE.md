# @atlas/cli

Primeira interface executável do Atlas (SPEC-0003). Casca de processo (`main.ts`) + `run()` testável + sementes de Input/Output Gateway.

- Aplicação: consome `@atlas/core` (`createAtlas`), não reimplementa lógica do Core.
- Sementes de Input Gateway (normaliza `argv`+`env`) e Output Gateway (entrega stdout/stderr) — interfaces locais; promover a `@atlas/contracts` só com um 2º consumidor (via ADR).
- Precedência de config: `flags > env > arquivo > defaults` (ADR-0006); `flags` e `env` implementados; `arquivo` reservado. Validação fica no core.
- Execução sem `dist/`: `bin` → `./src/main.ts` via _type stripping_ nativo do Node (ADR-0005).
- Sem dependências de runtime além de `@atlas/core`; parsing via `node:util`.
