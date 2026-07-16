# SPEC-0011 — Permission Service + leitura de FS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao Atlas a primeira execução de Tools com efeito colateral (ler arquivo / listar diretório) atrás de um Permission Service que autoriza cada ação por política de raiz permitida.

**Architecture:** Três autoridades separadas. As Tools de leitura declaram, como **dado**, o recurso que tocariam (`requirements(args) → ActionRequest`) e leem o disco por uma **porta injetável**; o **Permission Service** (`@atlas/permissions`) é um avaliador **puro/síncrono** (sem IO) que julga uma `ActionRequest` contra `readRoots` por contenção lexical e devolve uma `PermissionDecision`; o **Runtime** consulta o serviço antes de rodar cada passo com requisito e transforma bloqueio em `ExecutedStep` negado (falha estruturada, nunca lança). O Cognitive/Planner/Gateway ficam intactos quanto a permissão; a config nova `permissions.readRoots` (default `cwd`) segue a precedência `flags > env > defaults`.

**Tech Stack:** TypeScript (NodeNext, série 5), pnpm workspace, Vitest, `tsx`; execução do fonte sem `dist/`.

## Global Constraints

- **Node ≥ 24, pnpm ≥ 11** (corepack); TypeScript pinado em `^5`.
- **Regra de Dependência 5/11:** `@atlas/permissions` e `@atlas/tools` dependem **só** de `@atlas/contracts`; não dependem do Cognitive nem entre si. Só `@atlas/core` importa implementações para compor.
- **Permission Service é puro e síncrono, sem IO** — proibido importar `fs`/`fs/promises` em `@atlas/permissions`. Quem toca disco são as Tools, por porta injetável.
- **Permission Service não presume consentimento para ações destrutivas** — esta fatia é **só leitura**; `access` diferente de `read` → `blocked` (reservado).
- **Runtime nunca lança** por bloqueio/falha de Tool; Tool bloqueada **não** é executada (a porta de fs não é chamada).
- Contenção é **lexical** (sem `realpath`/symlink) — limitação documentada.
- Model Gateway intacto; Planner/Cognitive sem consciência de permissão; `respond`/`chat` inalterados e `respond` puro.
- **Convenção de imports:** paths relativos com sufixo `.js` (NodeNext); testes colocados em `tests/` (ex.: `packages/x/tests/y.test.ts`) importando `../src/index.js`.
- **Commits** terminam com o trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Verificação da suíte completa: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`. Comandos `tsx` via `pnpm exec` (não `rtk proxy`).

---

## File Structure

**Novos:**
- `packages/permissions/package.json`, `tsconfig.json`, `CLAUDE.md`
- `packages/permissions/src/index.ts` — re-export de `createPermissionService`
- `packages/permissions/src/permission-service.ts` — `createPermissionService({ readRoots })` + `evaluate`
- `packages/permissions/tests/permission-service.test.ts`
- `packages/contracts/src/permission.ts` — contratos de permissão
- `packages/tools/src/fs-port.ts` — `FsReadPort` + `nodeFsReadPort()`
- `packages/tools/src/read-file.ts` — `createReadFileTool`
- `packages/tools/src/list-dir.ts` — `createListDirTool`
- `packages/tools/tests/read-file.test.ts`, `packages/tools/tests/list-dir.test.ts`
- `docs/06-adr/ADR-0013-permission-service-execution-gate.md`

**Modificados:**
- `packages/contracts/src/execution.ts` — `Tool.requirements?`
- `packages/contracts/src/config.ts` — `AtlasConfig.permissions` + override
- `packages/contracts/src/index.ts` — re-exports de permissão
- `packages/tools/src/index.ts` — re-export das Tools de leitura + porta
- `packages/runtime/src/runtime.ts` — `RuntimeDeps.permissions` + portão
- `packages/runtime/tests/runtime.test.ts` — fake de permissões + testes do portão
- `packages/core/src/config/defaults.ts` — default `permissions.readRoots`
- `packages/core/src/config/load-config.ts` — merge + validação de `readRoots`
- `packages/core/src/index.ts` — compõe Permission Service + registra Tools + injeta no Runtime + `CreateAtlasDeps.fsRead`
- `packages/core/package.json` — dep `@atlas/permissions`
- `packages/core/tests/*` — precedência de config + leitura ponta a ponta (fake fs)
- `apps/cli/src/gateway/input-gateway.ts` — flag `--allow-read` + env `ATLAS_ALLOW_READ`
- `apps/cli/src/run.ts` — linha de ajuda `--allow-read`
- `apps/cli/src/commands/status.ts` — exibe `readRoots`
- `apps/cli/tests/*` — testes de flag/env/status
- CLAUDE.md (raiz, tools, runtime, core), `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`, `implementation/LESSONS_LEARNED.md`

---

## Task 1: Contratos de permissão + `Tool.requirements?`

**Files:**
- Create: `packages/contracts/src/permission.ts`
- Modify: `packages/contracts/src/execution.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces: `ResourceType`, `ResourceRef`, `AccessMode`, `ActionRequest`, `PermissionVerdict`, `PermissionDecision`, `PermissionService` (de `@atlas/contracts`); `Tool.requirements?(args): ActionRequest | null`.

> Contratos são **type-only**: não têm ciclo de teste em runtime; a verificação é `pnpm typecheck`.

- [ ] **Step 1: Criar `packages/contracts/src/permission.ts`**

```ts
export type ResourceType = 'file' | 'directory';

export interface ResourceRef {
  readonly type: ResourceType;
  readonly path: string;
}

/** 'write' é reservado para uma fatia futura; nesta versão só 'read' é produzido. */
export type AccessMode = 'read' | 'write';

export interface ActionRequest {
  readonly resource: ResourceRef;
  readonly access: AccessMode;
}

/**
 * Vocabulário dos 4 do Module Catalog. Nesta fatia o serviço só produz
 * 'allowed'/'blocked'; 'free' = ausência de requirement (o Runtime nem
 * consulta o serviço); 'confirm' é reservado ao fluxo interativo futuro.
 */
export type PermissionVerdict = 'free' | 'allowed' | 'confirm' | 'blocked';

export interface PermissionDecision {
  readonly verdict: PermissionVerdict;
  readonly reason?: string;
}

export interface PermissionService {
  /** Puro e síncrono, sem IO. */
  evaluate(action: ActionRequest): PermissionDecision;
}
```

- [ ] **Step 2: Adicionar `requirements?` ao `Tool` em `packages/contracts/src/execution.ts`**

No topo do arquivo, adicionar o import de tipo:

```ts
import type { ActionRequest } from './permission.js';
```

Substituir a interface `Tool` por:

```ts
export interface Tool {
  readonly name: string;
  readonly description: string;
  /** Descreve, como dado, o recurso que esta invocação tocaria. null/ausente = não toca nada (livre). */
  requirements?(args: Record<string, unknown>): ActionRequest | null;
  run(args: Record<string, unknown>): Promise<ToolResult>;
}
```

- [ ] **Step 3: Re-exportar os contratos de permissão em `packages/contracts/src/index.ts`**

Adicionar ao final:

```ts
export type {
  ResourceType,
  ResourceRef,
  AccessMode,
  ActionRequest,
  PermissionVerdict,
  PermissionDecision,
  PermissionService,
} from './permission.js';
```

- [ ] **Step 4: Verificar typecheck**

Run: `pnpm --filter @atlas/contracts typecheck`
Expected: PASS (sem erros).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/permission.ts packages/contracts/src/execution.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): contratos de permissão + Tool.requirements

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Package `@atlas/permissions` + `createPermissionService`

**Files:**
- Create: `packages/permissions/package.json`
- Create: `packages/permissions/tsconfig.json`
- Create: `packages/permissions/CLAUDE.md`
- Create: `packages/permissions/src/index.ts`
- Create: `packages/permissions/src/permission-service.ts`
- Test: `packages/permissions/tests/permission-service.test.ts`

**Interfaces:**
- Consumes: `ActionRequest`, `PermissionDecision`, `PermissionService` (Task 1).
- Produces: `createPermissionService(deps: { readRoots: readonly string[] }): PermissionService`; re-exportado por `packages/permissions/src/index.ts`.

- [ ] **Step 1: Criar `packages/permissions/package.json`**

```json
{
  "name": "@atlas/permissions",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@atlas/contracts": "workspace:*"
  }
}
```

- [ ] **Step 2: Criar `packages/permissions/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Criar `packages/permissions/CLAUDE.md`**

```markdown
# @atlas/permissions

Permission Service (Support) — avalia se uma ação pode ser executada (ADR-0013).

- `createPermissionService({ readRoots })` → `evaluate(action)`: **puro e síncrono, sem IO**. Julga uma `ActionRequest` contra a política de **raiz permitida** por **contenção lexical** (path resolvido + prefixo com fronteira de separador; sem `realpath`/symlink). Dentro de uma raiz → `allowed`; fora → `blocked` (com motivo). `access` ≠ `read` → `blocked` (reservado; nada destrutivo nesta versão).
- **Não** executa ações, **não** faz IO, **não** decide estratégia, **não** presume consentimento para ações destrutivas (Module Catalog).
- Vocabulário dos 4 veredictos vive em `@atlas/contracts` (`PermissionVerdict`): `free` = ausência de requirement (o Runtime nem consulta); `confirm` reservado ao fluxo interativo futuro.
- Depende só de `@atlas/contracts` (Regra 5). Contenção lexical não segue symlinks — limitação conhecida.
```

- [ ] **Step 4: `pnpm install` para linkar o novo package no workspace**

Run: `pnpm install`
Expected: conclui com código 0 (workspace atualizado, `@atlas/permissions` reconhecido).

- [ ] **Step 5: Escrever o teste que falha `packages/permissions/tests/permission-service.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { ActionRequest } from '@atlas/contracts';
import { createPermissionService } from '../src/index.js';

const read = (path: string, type: 'file' | 'directory' = 'file'): ActionRequest => ({
  resource: { type, path },
  access: 'read',
});

describe('createPermissionService.evaluate', () => {
  it('permite leitura dentro de uma raiz permitida', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    expect(service.evaluate(read('/work/repo/src/index.ts'))).toEqual({ verdict: 'allowed' });
  });

  it('permite quando o path é a própria raiz (diretório)', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    expect(service.evaluate(read('/work/repo', 'directory')).verdict).toBe('allowed');
  });

  it('bloqueia leitura fora de toda raiz permitida', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    const decision = service.evaluate(read('/etc/passwd'));
    expect(decision.verdict).toBe('blocked');
    expect(decision.reason).toBeTypeOf('string');
  });

  it('bloqueia escape por .. que sai da raiz', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    expect(service.evaluate(read('/work/repo/../secret.txt')).verdict).toBe('blocked');
  });

  it('não confunde prefixo de nome (/work/repo-secret) com raiz /work/repo', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    expect(service.evaluate(read('/work/repo-secret/x')).verdict).toBe('blocked');
  });

  it('permite quando o path está em QUALQUER uma das raízes', () => {
    const service = createPermissionService({ readRoots: ['/a', '/b'] });
    expect(service.evaluate(read('/b/file')).verdict).toBe('allowed');
  });

  it('bloqueia access reservado (write)', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    const decision = service.evaluate({
      resource: { type: 'file', path: '/work/repo/x' },
      access: 'write',
    });
    expect(decision.verdict).toBe('blocked');
  });
});
```

- [ ] **Step 6: Rodar o teste e confirmar a falha**

Run: `pnpm --filter @atlas/permissions exec vitest run`
Expected: FAIL (`createPermissionService` não existe / import inválido).

- [ ] **Step 7: Implementar `packages/permissions/src/permission-service.ts`**

```ts
import { resolve, sep } from 'node:path';
import type { ActionRequest, PermissionDecision, PermissionService } from '@atlas/contracts';

export interface PermissionServiceDeps {
  readonly readRoots: readonly string[];
}

/**
 * Avaliador puro/síncrono. Contenção lexical: resolve o path da ação e o
 * compara com cada raiz (igual à raiz ou sob ela, com fronteira de separador).
 * Não faz IO e não segue symlinks.
 */
export function createPermissionService(deps: PermissionServiceDeps): PermissionService {
  const roots = deps.readRoots.map((root) => resolve(root));
  return {
    evaluate(action: ActionRequest): PermissionDecision {
      if (action.access !== 'read') {
        return {
          verdict: 'blocked',
          reason: `acesso "${action.access}" não autorizado nesta versão (apenas leitura)`,
        };
      }
      const target = resolve(action.resource.path);
      const allowed = roots.some((root) => target === root || target.startsWith(root + sep));
      if (allowed) {
        return { verdict: 'allowed' };
      }
      return {
        verdict: 'blocked',
        reason: `fora do diretório permitido para leitura: ${action.resource.path}`,
      };
    },
  };
}
```

- [ ] **Step 8: Criar `packages/permissions/src/index.ts`**

```ts
export { createPermissionService } from './permission-service.js';
export type { PermissionServiceDeps } from './permission-service.js';
```

- [ ] **Step 9: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @atlas/permissions exec vitest run`
Expected: PASS (7 testes verdes).

- [ ] **Step 10: Garantir que o serviço não importa `fs`**

Run: `git grep -nE "node:fs|from 'fs'" packages/permissions/src || echo "sem import de fs — ok"`
Expected: imprime `sem import de fs — ok`.

- [ ] **Step 11: Commit**

```bash
git add packages/permissions
git commit -m "feat(permissions): Permission Service com política de raiz permitida (contenção lexical)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Porta de fs injetável + Tool `read_file`

**Files:**
- Create: `packages/tools/src/fs-port.ts`
- Create: `packages/tools/src/read-file.ts`
- Modify: `packages/tools/src/index.ts`
- Test: `packages/tools/tests/read-file.test.ts`

**Interfaces:**
- Consumes: `ActionRequest`, `Tool`, `ToolResult` (contracts).
- Produces: `FsReadPort { readFile(path): Promise<string>; readdir(path): Promise<readonly string[]> }`, `nodeFsReadPort(): FsReadPort`, `createReadFileTool(deps?: { fs?: FsReadPort }): Tool` (name `'read_file'`).

- [ ] **Step 1: Criar `packages/tools/src/fs-port.ts`**

```ts
import { readFile as fsReadFile, readdir as fsReaddir } from 'node:fs/promises';

/** Porta mínima de leitura de sistema de arquivos (injetável nos testes). */
export interface FsReadPort {
  readFile(path: string): Promise<string>;
  readdir(path: string): Promise<readonly string[]>;
}

export function nodeFsReadPort(): FsReadPort {
  return {
    readFile: (path) => fsReadFile(path, 'utf8'),
    readdir: (path) => fsReaddir(path),
  };
}
```

- [ ] **Step 2: Escrever o teste que falha `packages/tools/tests/read-file.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { FsReadPort } from '../src/index.js';
import { createReadFileTool } from '../src/index.js';

function fakeFs(files: Record<string, string>): FsReadPort {
  return {
    readFile: async (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    readdir: async () => [],
  };
}

describe('createReadFileTool', () => {
  it('tem nome read_file e declara requirements de leitura de arquivo', () => {
    const tool = createReadFileTool({ fs: fakeFs({}) });
    expect(tool.name).toBe('read_file');
    expect(tool.requirements?.({ path: './a.txt' })).toEqual({
      resource: { type: 'file', path: './a.txt' },
      access: 'read',
    });
  });

  it('lê o conteúdo do arquivo em caso de sucesso', async () => {
    const tool = createReadFileTool({ fs: fakeFs({ '/repo/a.txt': 'olá' }) });
    expect(await tool.run({ path: '/repo/a.txt' })).toEqual({ ok: true, output: 'olá' });
  });

  it('retorna erro estruturado quando a porta lança (arquivo inexistente)', async () => {
    const tool = createReadFileTool({ fs: fakeFs({}) });
    const result = await tool.run({ path: '/repo/missing.txt' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('missing.txt');
  });

  it('retorna erro estruturado quando path não é string', async () => {
    const tool = createReadFileTool({ fs: fakeFs({}) });
    expect((await tool.run({})).ok).toBe(false);
    expect((await tool.run({ path: 42 })).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e confirmar a falha**

Run: `pnpm --filter @atlas/tools exec vitest run read-file`
Expected: FAIL (`createReadFileTool`/`FsReadPort` não exportados).

- [ ] **Step 4: Implementar `packages/tools/src/read-file.ts`**

```ts
import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsReadPort, type FsReadPort } from './fs-port.js';

export interface ReadFileDeps {
  fs?: FsReadPort;
}

export function createReadFileTool(deps: ReadFileDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsReadPort();
  return {
    name: 'read_file',
    description:
      'Lê o conteúdo de um arquivo de texto. Recebe { path }. Use quando o objetivo exigir o conteúdo de um arquivo.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'file', path }, access: 'read' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'read_file exige um argumento "path" (string não vazia)' };
      }
      try {
        const content = await fs.readFile(path);
        return { ok: true, output: content };
      } catch (cause) {
        return { ok: false, error: `não foi possível ler ${path}: ${(cause as Error).message}` };
      }
    },
  };
}
```

- [ ] **Step 5: Re-exportar no `packages/tools/src/index.ts`**

Adicionar ao final do arquivo:

```ts
export { createReadFileTool } from './read-file.js';
export type { ReadFileDeps } from './read-file.js';
export { nodeFsReadPort } from './fs-port.js';
export type { FsReadPort } from './fs-port.js';
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pnpm --filter @atlas/tools exec vitest run read-file`
Expected: PASS (4 testes verdes).

- [ ] **Step 7: Commit**

```bash
git add packages/tools/src/fs-port.ts packages/tools/src/read-file.ts packages/tools/src/index.ts packages/tools/tests/read-file.test.ts
git commit -m "feat(tools): Tool read_file (1º IO) + porta de fs injetável

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Tool `list_dir`

**Files:**
- Create: `packages/tools/src/list-dir.ts`
- Modify: `packages/tools/src/index.ts`
- Test: `packages/tools/tests/list-dir.test.ts`

**Interfaces:**
- Consumes: `FsReadPort` (Task 3), `ActionRequest`, `Tool`.
- Produces: `createListDirTool(deps?: { fs?: FsReadPort }): Tool` (name `'list_dir'`); `requirements` com `resource.type === 'directory'`; `run` devolve as entradas juntadas por `\n`.

- [ ] **Step 1: Escrever o teste que falha `packages/tools/tests/list-dir.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { FsReadPort } from '../src/index.js';
import { createListDirTool } from '../src/index.js';

function fakeFs(dirs: Record<string, readonly string[]>): FsReadPort {
  return {
    readFile: async () => '',
    readdir: async (path) => {
      const entries = dirs[path];
      if (entries === undefined) throw new Error(`ENOENT: ${path}`);
      return entries;
    },
  };
}

describe('createListDirTool', () => {
  it('tem nome list_dir e declara requirements de leitura de diretório', () => {
    const tool = createListDirTool({ fs: fakeFs({}) });
    expect(tool.name).toBe('list_dir');
    expect(tool.requirements?.({ path: '.' })).toEqual({
      resource: { type: 'directory', path: '.' },
      access: 'read',
    });
  });

  it('lista as entradas do diretório em caso de sucesso', async () => {
    const tool = createListDirTool({ fs: fakeFs({ '/repo': ['a.txt', 'b.txt'] }) });
    expect(await tool.run({ path: '/repo' })).toEqual({ ok: true, output: 'a.txt\nb.txt' });
  });

  it('retorna erro estruturado quando a porta lança', async () => {
    const tool = createListDirTool({ fs: fakeFs({}) });
    const result = await tool.run({ path: '/nope' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/nope');
  });

  it('retorna erro estruturado quando path não é string', async () => {
    const tool = createListDirTool({ fs: fakeFs({}) });
    expect((await tool.run({})).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `pnpm --filter @atlas/tools exec vitest run list-dir`
Expected: FAIL (`createListDirTool` não exportado).

- [ ] **Step 3: Implementar `packages/tools/src/list-dir.ts`**

```ts
import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsReadPort, type FsReadPort } from './fs-port.js';

export interface ListDirDeps {
  fs?: FsReadPort;
}

export function createListDirTool(deps: ListDirDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsReadPort();
  return {
    name: 'list_dir',
    description:
      'Lista as entradas de um diretório. Recebe { path }. Use para descobrir quais arquivos existem antes de ler.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'directory', path }, access: 'read' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'list_dir exige um argumento "path" (string não vazia)' };
      }
      try {
        const entries = await fs.readdir(path);
        return { ok: true, output: entries.join('\n') };
      } catch (cause) {
        return { ok: false, error: `não foi possível listar ${path}: ${(cause as Error).message}` };
      }
    },
  };
}
```

- [ ] **Step 4: Re-exportar no `packages/tools/src/index.ts`**

Adicionar ao final:

```ts
export { createListDirTool } from './list-dir.js';
export type { ListDirDeps } from './list-dir.js';
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pnpm --filter @atlas/tools exec vitest run list-dir`
Expected: PASS (4 testes verdes).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/list-dir.ts packages/tools/src/index.ts packages/tools/tests/list-dir.test.ts
git commit -m "feat(tools): Tool list_dir (leitura de diretório)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Config `permissions.readRoots` (contracts + defaults + load-config)

**Files:**
- Modify: `packages/contracts/src/config.ts`
- Modify: `packages/core/src/config/defaults.ts`
- Modify: `packages/core/src/config/load-config.ts`
- Test: `packages/core/tests/load-config.test.ts`

**Interfaces:**
- Produces: `AtlasConfig.permissions: { readonly readRoots: readonly string[] }`; `AtlasConfigOverride.permissions?: { readRoots?: readonly string[] }`; default `readRoots = [process.cwd()]`.

> Nesta task o `createRuntime({ registry })` **ainda não muda** — a config nova só é adicionada e validada. O core continua compilando. O consumo de `readRoots` acontece na Task 6.

- [ ] **Step 1: Adicionar `permissions` ao contrato em `packages/contracts/src/config.ts`**

Na interface `AtlasConfig`, adicionar (após `memory`):

```ts
  readonly permissions: { readonly readRoots: readonly string[] };
```

Na interface `AtlasConfigOverride`, adicionar (após `memory`):

```ts
  permissions?: { readRoots?: readonly string[] };
```

- [ ] **Step 2: Escrever os testes que falham em `packages/core/tests/load-config.test.ts`**

Adicionar dentro do `describe` existente do `loadConfig` (novos casos):

```ts
  it('usa [cwd] como readRoots padrão', () => {
    const config = loadConfig();
    expect(config.permissions.readRoots).toEqual([process.cwd()]);
  });

  it('override.permissions.readRoots substitui o default', () => {
    const config = loadConfig({ permissions: { readRoots: ['/allowed'] } });
    expect(config.permissions.readRoots).toEqual(['/allowed']);
  });

  it('rejeita readRoots vazio', () => {
    expect(() => loadConfig({ permissions: { readRoots: [] } })).toThrow();
  });

  it('rejeita readRoots com caminho vazio', () => {
    expect(() => loadConfig({ permissions: { readRoots: ['  '] } })).toThrow();
  });
```

> Se o arquivo de teste não importar `loadConfig`/`InvalidConfigError` da forma esperada, siga o padrão de import já presente no topo do arquivo (não duplicar imports).

- [ ] **Step 3: Rodar e confirmar a falha**

Run: `pnpm --filter @atlas/core exec vitest run load-config`
Expected: FAIL (`config.permissions` é `undefined` / typecheck de teste quebra).

- [ ] **Step 4: Adicionar o default em `packages/core/src/config/defaults.ts`**

No objeto retornado por `defaultConfig()`, adicionar (após `memory`):

```ts
    permissions: { readRoots: [process.cwd()] },
```

- [ ] **Step 5: Merge + validação em `packages/core/src/config/load-config.ts`**

Depois da linha `const memory = { ... };`, adicionar o merge:

```ts
  const overrideRoots = override.permissions?.readRoots;
  const permissions = {
    readRoots:
      overrideRoots !== undefined && overrideRoots.length > 0
        ? overrideRoots
        : defaults.permissions.readRoots,
  };
```

No objeto `merged`, adicionar `permissions` (após `memory`):

```ts
    permissions,
```

Na seção de validação (junto das demais `issues.push`), adicionar:

```ts
  if (
    !Array.isArray(permissions.readRoots) ||
    permissions.readRoots.length === 0 ||
    permissions.readRoots.some((root) => typeof root !== 'string' || root.trim() === '')
  ) {
    issues.push('permissions.readRoots deve ser uma lista não vazia de caminhos não vazios');
  }
```

- [ ] **Step 6: Rodar os testes de config e confirmar que passam**

Run: `pnpm --filter @atlas/core exec vitest run load-config`
Expected: PASS (incluindo os 4 casos novos).

- [ ] **Step 7: Typecheck do core (garante que o `AtlasConfig` novo não quebrou nada)**

Run: `pnpm --filter @atlas/core typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/config.ts packages/core/src/config/defaults.ts packages/core/src/config/load-config.ts packages/core/tests/load-config.test.ts
git commit -m "feat(core): config permissions.readRoots (default cwd) com validação

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Portão de permissão no Runtime + wiring no Core

**Files:**
- Modify: `packages/runtime/src/runtime.ts`
- Modify: `packages/runtime/tests/runtime.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: `packages/core/tests/create-atlas.test.ts`

**Interfaces:**
- Consumes: `PermissionService` (Task 1), `createPermissionService` (Task 2), `createReadFileTool`/`createListDirTool`/`nodeFsReadPort`/`FsReadPort` (Tasks 3–4), `config.permissions.readRoots` (Task 5).
- Produces: `RuntimeDeps { registry; permissions: PermissionService }`; `CreateAtlasDeps.fsRead?: FsReadPort`.

> A assinatura de `createRuntime` muda (passa a exigir `permissions`). Seu **único** chamador de produção é `@atlas/core`, atualizado na mesma task — por isso o typecheck permanece verde ao fim.

- [ ] **Step 1: Escrever/atualizar os testes do Runtime `packages/runtime/tests/runtime.test.ts`**

Adicionar um helper de permissões no topo (após `fakeRegistry`):

```ts
import type { PermissionDecision, PermissionService } from '@atlas/contracts';

function fakePermissions(verdict: PermissionDecision = { verdict: 'allowed' }): PermissionService {
  return { evaluate: () => verdict };
}

function recordingPermissions(): { service: PermissionService; calls: number } {
  const state = { calls: 0 };
  return {
    service: {
      evaluate: () => {
        state.calls += 1;
        return { verdict: 'allowed' };
      },
    },
    get calls() {
      return state.calls;
    },
  };
}
```

Atualizar **todas** as chamadas `createRuntime({ registry: ... })` existentes para incluir `permissions`:

```ts
const runtime = createRuntime({ registry: fakeRegistry([a, b]), permissions: fakePermissions() });
```

(o mesmo para os demais `createRuntime` do arquivo).

Adicionar os testes novos do portão dentro do `describe('createRuntime.execute', ...)`:

```ts
  it('não consulta permissions para Tool sem requirements (livre)', async () => {
    const free: Tool = { name: 'free', description: 'x', run: async () => ({ ok: true, output: 'ok' }) };
    const perms = recordingPermissions();
    const runtime = createRuntime({ registry: fakeRegistry([free]), permissions: perms.service });

    const result = await runtime.execute({ steps: [{ tool: 'free', args: {} }] });

    expect(result.steps[0]!.result.ok).toBe(true);
    expect(perms.calls).toBe(0);
  });

  it('consulta permissions e executa quando allowed', async () => {
    let ran = false;
    const gated: Tool = {
      name: 'gated',
      description: 'x',
      requirements: () => ({ resource: { type: 'file', path: '/repo/a' }, access: 'read' }),
      run: async () => {
        ran = true;
        return { ok: true, output: 'conteúdo' };
      },
    };
    const runtime = createRuntime({
      registry: fakeRegistry([gated]),
      permissions: fakePermissions({ verdict: 'allowed' }),
    });

    const result = await runtime.execute({ steps: [{ tool: 'gated', args: { path: '/repo/a' } }] });

    expect(ran).toBe(true);
    expect(result.steps[0]!.result).toEqual({ ok: true, output: 'conteúdo' });
  });

  it('bloqueado vira ExecutedStep negado, NÃO executa a Tool e continua', async () => {
    let ran = false;
    const gated: Tool = {
      name: 'gated',
      description: 'x',
      requirements: () => ({ resource: { type: 'file', path: '/etc/passwd' }, access: 'read' }),
      run: async () => {
        ran = true;
        return { ok: true, output: 'nunca' };
      },
    };
    const after: Tool = { name: 'after', description: 'x', run: async () => ({ ok: true, output: 'after' }) };
    const runtime = createRuntime({
      registry: fakeRegistry([gated, after]),
      permissions: fakePermissions({ verdict: 'blocked', reason: 'fora da raiz' }),
    });

    const result = await runtime.execute({
      steps: [
        { tool: 'gated', args: { path: '/etc/passwd' } },
        { tool: 'after', args: {} },
      ],
    });

    expect(ran).toBe(false);
    expect(result.steps[0]!.result.ok).toBe(false);
    expect(result.steps[0]!.result.error).toContain('fora da raiz');
    expect(result.steps[1]!.result.ok).toBe(true);
  });
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `pnpm --filter @atlas/runtime exec vitest run`
Expected: FAIL (os testes novos falham; e/ou typecheck do teste acusa `permissions` faltando — comportamento esperado antes da implementação).

- [ ] **Step 3: Implementar o portão em `packages/runtime/src/runtime.ts`**

Atualizar os imports de tipo (adicionar `PermissionService`):

```ts
import type {
  ExecutedStep,
  ExecutionResult,
  PermissionService,
  Plan,
  Runtime,
  ToolDescriptor,
  ToolRegistry,
} from '@atlas/contracts';
```

Substituir `RuntimeDeps` e a desestruturação:

```ts
export interface RuntimeDeps {
  registry: ToolRegistry;
  permissions: PermissionService;
}

export function createRuntime(deps: RuntimeDeps): Runtime {
  const { registry, permissions } = deps;
```

Dentro do `for (const step of plan.steps)`, **depois** do bloco `if (tool === undefined) { ... continue; }` e **antes** do `try`, inserir o portão:

```ts
        const requirement = tool.requirements?.(step.args) ?? null;
        if (requirement !== null) {
          const decision = permissions.evaluate(requirement);
          if (decision.verdict !== 'allowed') {
            steps.push({
              tool: step.tool,
              args: step.args,
              result: {
                ok: false,
                error: decision.reason ?? `ação não permitida (${decision.verdict})`,
              },
            });
            continue;
          }
        }
```

- [ ] **Step 4: Rodar os testes do Runtime e confirmar que passam**

Run: `pnpm --filter @atlas/runtime exec vitest run`
Expected: PASS (testes antigos + 3 novos do portão).

- [ ] **Step 5: Adicionar a dep `@atlas/permissions` em `packages/core/package.json`**

Na lista `dependencies`, adicionar (mantendo a ordem alfabética):

```json
    "@atlas/permissions": "workspace:*",
```

Run: `pnpm install`
Expected: conclui com código 0.

- [ ] **Step 6: Atualizar o wiring em `packages/core/src/index.ts`**

Atualizar os imports:

```ts
import { createPermissionService } from '@atlas/permissions';
import {
  createToolRegistry,
  createClockTool,
  createCalcTool,
  createReadFileTool,
  createListDirTool,
  nodeFsReadPort,
  type FsReadPort,
} from '@atlas/tools';
```

Adicionar `fsRead` a `CreateAtlasDeps`:

```ts
export interface CreateAtlasDeps {
  fetch?: typeof fetch;
  memoryStorage?: MemoryStorage;
  fsRead?: FsReadPort;
}
```

Substituir o trecho de composição do registry/runtime por:

```ts
  const fsRead = deps.fsRead ?? nodeFsReadPort();
  const permissions = createPermissionService({ readRoots: config.permissions.readRoots });
  const registry = createToolRegistry();
  registry.register(createClockTool());
  registry.register(createCalcTool());
  registry.register(createReadFileTool({ fs: fsRead }));
  registry.register(createListDirTool({ fs: fsRead }));
  const runtime = createRuntime({ registry, permissions });
```

- [ ] **Step 7: Escrever o teste de integração de leitura em `packages/core/tests/create-atlas.test.ts`**

Adicionar (seguindo o padrão de fakes já usado no arquivo — gateway fake por `fetch` e `memoryStorage` fake; ver os testes existentes para os helpers de fake do gateway):

```ts
  it('lê um arquivo dentro da raiz permitida ponta a ponta', async () => {
    const fsRead = {
      readFile: async (path: string) => (path === '/repo/README.md' ? '# Projeto' : Promise.reject(new Error('ENOENT'))),
      readdir: async () => [],
    };
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' }, permissions: { readRoots: ['/repo'] } } },
      { memoryStorage: fakeMemoryStorage(), fsRead },
    );
    try {
      const registry = createToolRegistry();
      // valida via runtime interno indiretamente: executa a Tool read_file dentro da raiz
      const result = await atlas.cognitive.ask('leia /repo/README.md');
      expect(typeof result.text).toBe('string');
    } finally {
      await atlas.shutdown();
    }
  });
```

> Observação para o implementador: o comportamento exato de `ask` depende do roteiro do gateway `fake`. O objetivo deste teste é garantir que a **composição** aceita `fsRead`/`readRoots` e sobe sem erro. Se o gateway `fake` do repo não gerar um `Plan` com `read_file` por conta própria, prefira validar o caminho de leitura/bloqueio **diretamente pelo Runtime** num teste dedicado do core: construa `createPermissionService({ readRoots: ['/repo'] })`, um registry com `createReadFileTool({ fs: fsRead })`, `createRuntime({ registry, permissions })` e assегure:
>
> ```ts
> // dentro da raiz → ok
> const ok = await runtime.execute({ steps: [{ tool: 'read_file', args: { path: '/repo/README.md' } }] });
> expect(ok.steps[0]!.result).toEqual({ ok: true, output: '# Projeto' });
> // fora da raiz → bloqueado, sem tocar o fs
> const blocked = await runtime.execute({ steps: [{ tool: 'read_file', args: { path: '/etc/passwd' } }] });
> expect(blocked.steps[0]!.result.ok).toBe(false);
> ```
>
> Use a variante que ficar mais robusta ao roteiro do gateway; o essencial é cobrir **allowed** e **blocked** ponta a ponta com `fsRead` fake, sem IO real.

- [ ] **Step 8: Rodar os testes do core e confirmar que passam**

Run: `pnpm --filter @atlas/core exec vitest run`
Expected: PASS.

- [ ] **Step 9: Typecheck de runtime + core**

Run: `pnpm --filter @atlas/runtime typecheck && pnpm --filter @atlas/core typecheck`
Expected: PASS (a mudança de assinatura de `createRuntime` está coberta pelo único chamador, o core).

- [ ] **Step 10: Commit**

```bash
git add packages/runtime/src/runtime.ts packages/runtime/tests/runtime.test.ts packages/core/src/index.ts packages/core/package.json packages/core/tests/create-atlas.test.ts pnpm-lock.yaml
git commit -m "feat(runtime,core): portão de permissão na execução + read_file/list_dir compostas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: CLI — flag `--allow-read`, env `ATLAS_ALLOW_READ`, `status`

**Files:**
- Modify: `apps/cli/src/gateway/input-gateway.ts`
- Modify: `apps/cli/src/run.ts`
- Modify: `apps/cli/src/commands/status.ts`
- Test: `apps/cli/tests/input-gateway.test.ts` (ou o arquivo de teste do gateway existente), `apps/cli/tests/status.test.ts`

**Interfaces:**
- Consumes: `AtlasConfigOverride.permissions` (Task 5), `config.permissions.readRoots` (Task 6).
- Produces: mapeamento `--allow-read`/`ATLAS_ALLOW_READ` → `override.permissions = { readRoots: [path] }`; `status` imprime `readRoots`.

- [ ] **Step 1: Escrever os testes que falham (precedência de config) em `apps/cli/tests/input-gateway.test.ts`**

```ts
  it('mapeia ATLAS_ALLOW_READ para permissions.readRoots', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], { ATLAS_ALLOW_READ: '/env/dir' } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ readRoots: ['/env/dir'] });
  });

  it('--allow-read tem precedência sobre ATLAS_ALLOW_READ', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(
      ['status', '--allow-read', '/flag/dir'],
      { ATLAS_ALLOW_READ: '/env/dir' } as NodeJS.ProcessEnv,
    );
    expect(parsed.configOverride.permissions).toEqual({ readRoots: ['/flag/dir'] });
  });

  it('sem flag/env, não define permissions no override', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {} as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toBeUndefined();
  });
```

> Ajuste o nome do factory/import (`createCliInputGateway`) e o arquivo de teste conforme o que já existe no repo (o teste do gateway pode se chamar `input-gateway.test.ts` ou `run.test.ts`; siga o existente).

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `pnpm --filter @atlas/cli exec vitest run input-gateway`
Expected: FAIL (`permissions` sempre `undefined`).

- [ ] **Step 3: Adicionar a opção no parser (`apps/cli/src/gateway/input-gateway.ts`)**

Em `interface CliValues`, adicionar:

```ts
  'allow-read'?: string | undefined;
```

Em `parseArgvOrThrow` → `options`, adicionar:

```ts
        'allow-read': { type: 'string' },
```

Em `resolveConfigOverride`, adicionar (junto do bloco de `memory-path`, mesmo padrão env→flag):

```ts
  let readRoot: string | undefined;
  if (env.ATLAS_ALLOW_READ !== undefined) {
    readRoot = env.ATLAS_ALLOW_READ;
  }
  if (values['allow-read'] !== undefined) {
    readRoot = values['allow-read'];
  }
  if (readRoot !== undefined) {
    override.permissions = { readRoots: [readRoot] };
  }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @atlas/cli exec vitest run input-gateway`
Expected: PASS (3 casos novos verdes).

- [ ] **Step 5: Escrever o teste de `status` mostrando `readRoots` em `apps/cli/tests/status.test.ts`**

Adicionar uma asserção ao teste existente do `runStatus` (ou um caso novo) verificando que a saída contém a linha de raízes. Seguindo o formato dos demais campos:

```ts
    expect(output).toContain('readRoots: ');
```

> Use o mesmo helper de `atlas` fake / captura de `OutputGateway` já presente no arquivo.

- [ ] **Step 6: Rodar e confirmar a falha**

Run: `pnpm --filter @atlas/cli exec vitest run status`
Expected: FAIL (`readRoots` ainda não é impresso).

- [ ] **Step 7: Exibir `readRoots` em `apps/cli/src/commands/status.ts`**

Substituir o corpo por:

```ts
import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export function runStatus(atlas: AtlasPlatform, output: OutputGateway): void {
  const { state, config, persona } = atlas;
  output.write(
    [
      `Atlas: ${state}`,
      `logLevel: ${config.logLevel}`,
      `dataDir: ${config.dataDir}`,
      `persona: ${persona.name} (${persona.id})`,
      `readRoots: ${config.permissions.readRoots.join(', ')}`,
      '',
    ].join('\n'),
  );
}
```

- [ ] **Step 8: Adicionar a linha de ajuda em `apps/cli/src/run.ts`**

No `HELP_TEXT`, adicionar (após a linha `--memory-path`):

```
      --allow-read <p> Diretório permitido para leitura (default: cwd)
```

- [ ] **Step 9: Rodar os testes do CLI e confirmar que passam**

Run: `pnpm --filter @atlas/cli exec vitest run`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/cli/src/gateway/input-gateway.ts apps/cli/src/run.ts apps/cli/src/commands/status.ts apps/cli/tests/
git commit -m "feat(cli): --allow-read/ATLAS_ALLOW_READ + status exibe readRoots

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: ADR-0013, documentação, lições e suíte completa

**Files:**
- Create: `docs/06-adr/ADR-0013-permission-service-execution-gate.md`
- Modify: `CLAUDE.md` (raiz), `packages/tools/CLAUDE.md`, `packages/runtime/CLAUDE.md`, `packages/core/CLAUDE.md` (se necessário)
- Modify: `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`
- Modify: `implementation/LESSONS_LEARNED.md`
- Modify: `implementation/specs/SPEC-0011-permission-service-fs-read.md` (Status → Review)

- [ ] **Step 1: Criar `docs/06-adr/ADR-0013-permission-service-execution-gate.md`**

Seguir o formato dos ADRs existentes (Contexto / Decisão / Consequências / Alternativas consideradas). Conteúdo mínimo:
- **Contexto:** SPEC-0010 entregou a execução só com Tools puras porque o Permission Service não existia; é hora do 1º efeito colateral (leitura).
- **Decisão:** Permission Service **puro/síncrono** (sem IO) que julga `ActionRequest` contra `readRoots` por **contenção lexical**; as Tools **declaram** o que tocam (`requirements`) e leem por porta injetável; o **Runtime aplica** o veredicto (bloqueio → `ExecutedStep` negado, nunca lança, Tool não roda); `free` = ausência de requirement; `confirm` reservado ao fluxo interativo de escrita.
- **Consequências:** 1º IO das Tools; separação de autoridades (Tool descreve, Permission julga, Runtime aplica); Planner/Cognitive/Gateway intactos; symlink não seguido (limitação) e escrita/confirmação adiadas.
- **Alternativas consideradas:** tabela de política por-Tool no serviço (acopla); capacidade estática sem path (grossa demais, perde a raiz); confirmação interativa já nesta fatia (fatia grande, sem Tool destrutiva).

- [ ] **Step 2: Atualizar o CLAUDE.md raiz**

No parágrafo "Estado em julho/2026" e na seção de packages, registrar: novo `@atlas/permissions` (Permission Service puro, raiz permitida), Tools `read_file`/`list_dir` (1º IO, fs injetável), Runtime consulta permissões por passo, config `permissions.readRoots` (default cwd, `--allow-read`/`ATLAS_ALLOW_READ`), ADR-0013. Atualizar a tabela do mapa da documentação com a linha do ADR-0013. Remover, se aplicável, a menção a "Permission Service (ainda não existe)".

- [ ] **Step 3: Atualizar os CLAUDE.md de package**

- `packages/tools/CLAUDE.md`: as Tools deixam de ser todas puras — `read_file`/`list_dir` fazem IO por porta injetável (`FsReadPort`/`nodeFsReadPort`) e declaram `requirements`; `clock`/`calc` seguem puras/sem `requirements`.
- `packages/runtime/CLAUDE.md`: `createRuntime({ registry, permissions })`; consulta `permissions.evaluate` para passos com `requirements`; bloqueio → `ExecutedStep` negado (Tool não roda), nunca lança.
- `packages/core/CLAUDE.md`: se necessário, citar `CreateAtlasDeps.fsRead` e a composição do Permission Service.

- [ ] **Step 4: Atualizar `docs/05-context/NEXT_CONTEXT.md` e `CURRENT_SPRINT.md`**

- Mover SPEC-0011 para `Review` no NEXT_CONTEXT (Estado Imediato), descrevendo a entrega (Permission Service + `read_file`/`list_dir` + portão no Runtime + config `readRoots`), listar `@atlas/permissions`, atualizar o "Mapa Rápido" (ADR-0013), a contagem de testes/arquivos após a suíte verde, e ajustar "Próximo Trabalho" (a fatia de escrita + `confirm` + endurecimento de symlink como candidatas naturais).
- `CURRENT_SPRINT.md`: refletir o status da SPEC-0011.

- [ ] **Step 5: Registrar lições em `implementation/LESSONS_LEARNED.md`**

Adicionar a seção da SPEC-0011 com aprendizados reais (ex.: contenção lexical sem IO mantém o Support puro; `requirements` como dado evita acoplar Permission às Tools; mudança de assinatura do Runtime move-se junto do único chamador para não quebrar typecheck; `AccessMode` inclui `write` reservado para tornar o bloqueio testável; símbolo `free` = ausência de requirement).

- [ ] **Step 6: Marcar a SPEC como `Review`**

Em `implementation/specs/SPEC-0011-permission-service-fs-read.md`, mudar o checkbox de Status de `Draft` para `Review`:

```
- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [x] Review
- [ ] Done
```

- [ ] **Step 7: Rodar a suíte completa**

Run: `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde. Anotar a contagem final de testes/arquivos (para o NEXT_CONTEXT).

- [ ] **Step 8: Verificação manual ponta a ponta (opcional mas recomendada)**

```bash
# leitura dentro da raiz (cwd = repo): deve ler
pnpm --filter @atlas/cli exec tsx src/main.ts ask "liste o diretório atual com list_dir" --provider fake
# status mostra a raiz
pnpm --filter @atlas/cli exec tsx src/main.ts status
```

Expected: `status` mostra a linha `readRoots: <cwd>`. (O comportamento de `ask` com provider `fake` depende do roteiro; o essencial é subir sem erro.)

- [ ] **Step 9: Commit**

```bash
git add docs/06-adr/ADR-0013-permission-service-execution-gate.md CLAUDE.md packages/tools/CLAUDE.md packages/runtime/CLAUDE.md packages/core/CLAUDE.md docs/05-context/NEXT_CONTEXT.md docs/05-context/CURRENT_SPRINT.md implementation/LESSONS_LEARNED.md implementation/specs/SPEC-0011-permission-service-fs-read.md
git commit -m "docs(permissions): ADR-0013, documentação e lições da SPEC-0011 (Review)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (preenchido pelo autor do plano)

**Spec coverage:**
- `@atlas/permissions` + `evaluate` puro/raiz permitida → Task 2 ✓
- `read_file`/`list_dir` + fs injetável + `requirements` → Tasks 3–4 ✓
- Runtime consulta permissões por passo; bloqueio estruturado, nunca lança, Tool não roda → Task 6 ✓
- Contratos de permissão + `Tool.requirements?` em `@atlas/contracts` → Task 1 ✓
- Core compõe serviço (raiz cwd), registra Tools, injeta no Runtime; `CreateAtlasDeps.fsRead` → Task 6 ✓
- Config `permissions.readRoots` + precedência `flags > env > defaults` + validação → Tasks 5 (config) e 7 (CLI) ✓
- CLI `--allow-read`/`ATLAS_ALLOW_READ` + `status` exibe raízes + ajuda → Task 7 ✓
- ADR-0013 + docs + lições + suíte verde → Task 8 ✓
- Fora de escopo (escrita, `confirm` interativo, symlink, Planner/Cognitive cientes de permissão) → não há task que os implemente ✓

**Placeholder scan:** sem "TBD/TODO"; todos os steps de código trazem o código real. As duas notas ao implementador (Task 6 Step 7, Task 7 Step 1) são orientações de robustez a padrões existentes do repo, não lacunas de conteúdo — trazem código concreto de fallback.

**Type consistency:** `FsReadPort` (readFile/readdir) consistente entre `fs-port.ts`, tools e core; `createPermissionService({ readRoots })` idêntico em Tasks 2/6; `RuntimeDeps { registry, permissions }` idêntico em runtime e core; `ActionRequest`/`PermissionDecision`/`PermissionVerdict` idênticos aos contratos da Task 1; `AccessMode = 'read' | 'write'` (write reservado e bloqueado) — **refina** o esboço `'read'`-only da SPEC para tornar o veredicto reservado testável.
