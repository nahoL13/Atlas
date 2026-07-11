# SPEC-0001 Workspace Bootstrap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a fundação executável do monorepo Atlas: Git, workspace pnpm, TypeScript strict, ESLint+Prettier e Vitest com teste smoke, verificáveis por comandos na raiz.

**Architecture:** Monorepo pnpm (ADR-0001) sem nenhum package ainda — apenas a mecânica do workspace na raiz. TypeScript strict compartilhado via `tsconfig.base.json` (ADR-0002). Nenhum componente do Module Catalog é implementado.

**Tech Stack:** Node.js ≥24 (LTS), pnpm 10.x, TypeScript 5.x, Vitest, ESLint 9 (flat config, typescript-eslint), Prettier 3.

## Global Constraints

- NÃO criar `apps/`, `packages/`, `tooling/`, `.github/` nem `.claude/skills/` (SPEC-0001, Fora do Escopo).
- NÃO adicionar dependências além de: `typescript`, `@types/node`, `vitest`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`, `prettier`.
- Dependências instaladas na raiz com `pnpm add -Dw <pkg>` (a flag `-w` é obrigatória na raiz do workspace), sem versão fixa no comando (= última estável); o `pnpm-lock.yaml` registra as versões exatas — isso cumpre a Restrição da SPEC ("versões exatas definidas no plano, priorizando estáveis"). Exceção: `typescript` pinado em `^5` — o 7.x é incompatível com o typescript-eslint em 2026-07 (ver LESSONS_LEARNED).
- Raiz é ESM: `"type": "module"` no `package.json`.
- Mensagens de commit: conventional commits com descrição em português.
- Todo commit termina com o trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (usar dois `-m`).
- Diretório de trabalho: `/Users/lohanberg/Documents/Repos/Atlas` (todos os caminhos abaixo são relativos a ele).

---

### Task 1: Repositório Git e arquivos base

**Files:**
- Create: `.gitignore`, `.editorconfig`, `.nvmrc`, `README.md`
- Modify: `implementation/specs/SPEC-0001-workspace-bootstrap.md` (Status)

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: repositório Git na branch `main` com commit inicial; arquivos base que as tasks seguintes assumem existentes.

- [ ] **Step 1: Inicializar o Git na branch main**

Run: `git init -b main`
Expected: `Initialized empty Git repository in .../Atlas/.git/`

- [ ] **Step 2: Criar `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
*.log
.DS_Store
.env
.env.*
!.env.example
```

- [ ] **Step 3: Criar `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Criar `.nvmrc`**

```text
24
```

- [ ] **Step 5: Criar `README.md`**

```markdown
# Project Atlas

Plataforma de inteligência artificial pessoal, organizada como monorepo modular.

- Porta de entrada da documentação: [PROJECT.md](PROJECT.md)
- Guia operacional para IA: [CLAUDE.md](CLAUDE.md)
- Estrutura do repositório: [docs/03-architecture/ProjectStructure.md](docs/03-architecture/ProjectStructure.md)

## Desenvolvimento

Requisitos: Node.js ≥ 24 e pnpm 10.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```
```

- [ ] **Step 6: Marcar a SPEC como In Progress**

Em `implementation/specs/SPEC-0001-workspace-bootstrap.md`, substituir:

```markdown
**Status**

Ready
```

por:

```markdown
**Status**

In Progress
```

- [ ] **Step 7: Commit inicial (documentação + arquivos base)**

```bash
git add -A
git commit -m "chore: inicializa repositório com documentação e arquivos base" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Run: `git log --oneline`
Expected: exatamente 1 commit listado.

---

### Task 2: Workspace pnpm

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`
- Create (gerado): `pnpm-lock.yaml`

**Interfaces:**
- Consumes: repositório Git da Task 1.
- Produces: scripts raiz `build`, `lint`, `format`, `format:check`, `typecheck`, `test` (nomes exatos usados pelas Tasks 3–6); workspace com globs `apps/*`, `packages/*`, `tooling/*`.

- [ ] **Step 1: Verificar o pnpm**

Run: `pnpm --version`
Expected: `11.x`. Se ausente: `corepack enable && corepack prepare pnpm@latest --activate` e repetir.

- [ ] **Step 2: Criar `package.json`**

```json
{
  "name": "atlas-workspace",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "build": "pnpm -r build",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Criar `pnpm-workspace.yaml`**

```yaml
packages:
  - apps/*
  - packages/*
  - tooling/*
```

(Globs sem correspondência são ignorados pelo pnpm — declarados agora para as SPECs seguintes.)

- [ ] **Step 4: Instalar o workspace vazio**

Run: `pnpm install`
Expected: conclui sem erros e cria `pnpm-lock.yaml`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: configura workspace pnpm" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: TypeScript compartilhado

**Files:**
- Create: `tsconfig.base.json`, `tsconfig.json`
- Modify: `package.json`, `pnpm-lock.yaml` (via pnpm add)

**Interfaces:**
- Consumes: scripts da Task 2.
- Produces: `tsconfig.base.json` (opções compartilhadas que packages futuros estendem) e `tsconfig.json` raiz cobrindo `tests/**/*.ts` e `vitest.config.ts` — o script `typecheck` só passa a ter inputs na Task 4.

- [ ] **Step 1: Instalar TypeScript e tipos do Node**

Run: `pnpm add -Dw typescript@^5 @types/node`
Expected: devDependencies atualizadas sem erros. (TS pinado em `^5`: o 7.x quebra o typescript-eslint — ver LESSONS_LEARNED.)

- [ ] **Step 2: Criar `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Criar `tsconfig.json` (projeto raiz, sem emissão)**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["tests/**/*.ts", "vitest.config.ts"]
}
```

(Arquivo extra em relação aos "Arquivos Esperados" da SPEC — coberto por "pode sofrer pequenos ajustes": é ele que dá inputs ao `typecheck` da raiz.)

- [ ] **Step 4: Verificar a instalação**

Run: `pnpm exec tsc --version`
Expected: `Version 5.9.x`. (`pnpm typecheck` ainda falharia com TS18003 — sem inputs até a Task 4; não executar aqui.)

- [ ] **Step 5: Commit**

```bash
git add tsconfig.base.json tsconfig.json package.json pnpm-lock.yaml
git commit -m "chore: adiciona configuração typescript compartilhada" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Vitest e teste smoke (TDD)

**Files:**
- Create: `tests/smoke.test.ts`, `vitest.config.ts`
- Modify: `package.json`, `pnpm-lock.yaml` (via pnpm add)
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: script `test` (Task 2), tsconfigs (Task 3).
- Produces: pipeline de testes funcionando; `pnpm typecheck` passa a ter inputs e deve ficar verde.

- [ ] **Step 1: Escrever o teste (antes do runner existir)**

`tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

const workspaceName = 'atlas-workspace';

describe('workspace bootstrap', () => {
  it('executa TypeScript no pipeline de testes', () => {
    const parts: readonly string[] = workspaceName.split('-');
    expect(parts).toEqual(['atlas', 'workspace']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test`
Expected: FALHA — `vitest` não instalado (`Command "vitest" not found`).

- [ ] **Step 3: Instalar o Vitest**

Run: `pnpm add -Dw vitest`
Expected: devDependencies atualizadas sem erros.

- [ ] **Step 4: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test`
Expected: `1 passed` (suite `workspace bootstrap`).

- [ ] **Step 6: Verificar o typecheck (agora com inputs)**

Run: `pnpm typecheck`
Expected: sai com código 0, sem erros.

- [ ] **Step 7: Commit**

```bash
git add tests/smoke.test.ts vitest.config.ts package.json pnpm-lock.yaml
git commit -m "test: adiciona pipeline vitest com teste smoke" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: ESLint e Prettier

**Files:**
- Create: `eslint.config.js`, `.prettierrc`, `.prettierignore`
- Modify: `package.json`, `pnpm-lock.yaml` (via pnpm add)

**Interfaces:**
- Consumes: scripts `lint`, `format`, `format:check` (Task 2); arquivos TS das Tasks 3–4.
- Produces: `pnpm lint` e `pnpm format:check` verdes — o pipeline de qualidade completo da DoD.

- [ ] **Step 1: Instalar as dependências**

Run: `pnpm add -Dw eslint @eslint/js typescript-eslint eslint-config-prettier prettier`
Expected: devDependencies atualizadas sem erros.

- [ ] **Step 2: Criar `eslint.config.js`**

```js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/', '**/dist/', '**/coverage/'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
);
```

- [ ] **Step 3: Criar `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 4: Criar `.prettierignore`**

```text
pnpm-lock.yaml
node_modules/
dist/
coverage/
**/*.md
```

(`**/*.md` protege a documentação manuscrita — `docs/`, `PROJECT.md`, `implementation/` — de churn de formatação; código e configs continuam cobertos.)

- [ ] **Step 5: Rodar o lint**

Run: `pnpm lint`
Expected: sai com código 0, sem findings.

- [ ] **Step 6: Formatar e conferir**

Run: `pnpm format`
Expected: lista os arquivos processados (alterações são esperadas na primeira execução).

Run: `pnpm format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 7: Reconfirmar a suíte após a formatação**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: os três comandos verdes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: configura eslint e prettier" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Documentação, lições aprendidas e verificação final

**Files:**
- Modify: `CLAUDE.md`, `implementation/LESSONS_LEARNED.md`, `implementation/specs/SPEC-0001-workspace-bootstrap.md`

**Interfaces:**
- Consumes: todos os comandos verdes das Tasks 2–5.
- Produces: documentação consistente com a realidade; SPEC em Review; DoD verificável.

- [ ] **Step 1: Atualizar o estado e os comandos no `CLAUDE.md`**

Substituir:

```markdown
**Estado em julho/2026: fase "Architecture & Engineering Foundation" — ainda não existe código.** O repositório contém apenas documentação arquitetural. Não há comandos de build/teste/lint; serão definidos quando o primeiro projeto nascer via SPEC.
```

por:

```markdown
**Estado em julho/2026: fundação do monorepo criada (SPEC-0001).** Workspace pnpm + TypeScript strict operacionais; nenhum componente do Module Catalog implementado ainda — `packages/contracts` e `packages/core` nascem na SPEC-0002, `apps/cli` na SPEC-0003.

## Comandos

- `pnpm install` — instala o workspace
- `pnpm lint` — ESLint (flat config, typescript-eslint)
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm typecheck` — TypeScript sem emissão
- `pnpm test` — Vitest
- `pnpm build` — build recursivo (no-op até existirem packages)
```

- [ ] **Step 2: Atualizar a lista de pendências no `CLAUDE.md`**

Substituir:

```markdown
- A estrutura de código-alvo (`apps/`, `packages/`, `tooling/`...) descrita em `docs/03-architecture/ProjectStructure.md` — a fundação é criada pela `implementation/specs/SPEC-0001-workspace-bootstrap.md` (Draft)
```

por:

```markdown
- `packages/` e `apps/`: `packages/contracts` e `packages/core` nascem na SPEC-0002 (core-bootstrap); `apps/cli` na SPEC-0003 (cli-foundation)
```

- [ ] **Step 3: Registrar a entrada inaugural no `implementation/LESSONS_LEARNED.md`**

Substituir, na seção `# Registro`:

```markdown
Nenhuma entrada ainda.

A primeira SPEC concluída inaugura este registro.
```

por uma entrada real no formato oficial, refletindo o que de fato aconteceu na execução (o conteúdo abaixo é a estrutura obrigatória; preencher com os fatos observados):

```markdown
## SPEC-0001 — Workspace Bootstrap (AAAA-MM-DD)

Descobrimos que...

A arquitetura ajudou porque...

A arquitetura atrapalhou porque...

Precisamos mudar... (encaminhamento: ADR, documentação ou nova SPEC)
```

- [ ] **Step 4: Marcar a SPEC como Review**

Em `implementation/specs/SPEC-0001-workspace-bootstrap.md`, substituir `In Progress` por `Review` no campo Status.

- [ ] **Step 5: Verificação final da DoD**

Run: `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: os cinco comandos verdes, em sequência, sem erros.

Run: `ls -A`
Expected: presentes `.git`, `.gitignore`, `.editorconfig`, `.nvmrc`, `README.md`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `vitest.config.ts`, `tests/`, `docs/`, `implementation/`, `CLAUDE.md`, `PROJECT.md` — e ausentes `apps/`, `packages/`, `tooling/`, `.github/`.

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "docs: conclui fundação do workspace (SPEC-0001)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Pós-plano (fora do escopo destas tasks)

A revisão da SPEC (Review → Done) segue o processo do `docs/04-engineering/DevelopmentGuide.md`: conferir critérios de aceitação, consistência arquitetural e documentação. Somente após a revisão o Status vira `Done`.
