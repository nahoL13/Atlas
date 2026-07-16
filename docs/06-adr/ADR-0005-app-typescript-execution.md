# ADR-0005 — Execução de TypeScript em aplicações via `tsx`

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-11

---

# Contexto

As aplicações em `apps/` (a começar por `apps/cli`) precisam executar TypeScript. O monorepo não produz `dist/`: os packages exportam `./src/index.ts` e Vitest/`tsc` resolvem direto do fonte — padrão registrado como acerto na [SPEC-0002](../implementation/specs/SPEC-0002-core-bootstrap.md) (dev loop instantâneo). Os imports usam a convenção NodeNext com sufixo `.js` (ex.: `import { loadConfig } from './config/load-config.js'`), que `tsc` e Vitest mapeiam para os arquivos `.ts`.

A hipótese inicial da [SPEC-0003](../implementation/specs/SPEC-0003-cli-foundation.md) era executar o fonte diretamente via _type stripping_ nativo do Node ≥ 24. Na implementação, essa rota **falhou**: o Node nativo não remapeia imports com sufixo `.js` para os arquivos `.ts` correspondentes (`ERR_MODULE_NOT_FOUND`). Como a convenção `.js` é usada em todo o repositório, nem `@atlas/core` carrega sob o Node nativo. Torná-la viável exigiria reescrever os imports de todo o repositório (incluindo core e contracts) para extensões `.ts` — mudança ampla e invasiva, rejeitada.

---

# Decisão

Aplicações executáveis rodam o fonte `.ts` via `tsx`, declarado como `devDependency` na raiz do workspace.

- `tsx` resolve `.js` → `.ts` e carrega o fonte (inclusive os `.ts` dos packages importados) sem alterar código.
- O `bin` aponta para `./src/main.ts`, com shebang `#!/usr/bin/env -S npx tsx`.
- Nenhum passo de build e nenhum `dist/`.
- `tsx` é **tooling de desenvolvimento**, não dependência de _runtime_ do produto — mesma categoria de `vitest`, `eslint`, `typescript`.
- O `esbuild` (motor do `tsx`) é aprovado a rodar seu build script via `allowBuilds` no `pnpm-workspace.yaml` (o pnpm 11 não lê mais o campo `pnpm` do `package.json`).

---

# Consequências

Positivas:

- roda o fonte diretamente; o dev loop sem-`dist` é preservado e estendido às aplicações;
- o _runtime_ do produto permanece sem dependências (Princípio 13 preservado no nível da arquitetura/runtime);
- zero mudanças de código; a convenção `.js` do repositório é mantida intacta.

Custos e riscos:

- introduz a primeira dependência de _tooling de execução_ (`tsx`) e seu build de `esbuild`;
- a execução nativa por Node fica adiada; poderá ser revisitada se o repositório adotar imports `.ts` ou um passo de build no futuro;
- empacotamento e distribuição da CLI (binário publicável) permanecem decisão futura.

---

# Alternativas Consideradas

**Node nativo via _type stripping_.** Preferida no design inicial, porém inviável: o Node não remapeia `.js` → `.ts` e o repositório inteiro usa a convenção `.js`; exigiria reescrever core e contracts.

**Build para `dist/` com `tsc`.** Reverte o padrão sem-`dist` que funcionou bem; adiciona cerimônia e afeta a forma como core e contracts são consumidos (hoje como fonte).

**Hook de resolução local (`module.registerHooks`).** Manteria zero dependências, mas introduz infraestrutura própria de resolução de módulos para manter e raciocinar — troca uma ferramenta testada por código bespoke, contra "mais simples e sustentável".
