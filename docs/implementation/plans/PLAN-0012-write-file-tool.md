# [SPEC-0012](../specs/SPEC-0012-write-file-tool.md) — Tool de escrita (`write_file`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao Atlas a primeira Tool de **escrita** (`write_file`, criar/sobrescrever arquivo de texto) atrás do portão de permissão existente, sob uma política de **raízes de escrita** (`writeRoots`) separada da de leitura, com **default vazio** (opt-in explícito via `--allow-write`), sem fluxo interativo.

**Architecture:** A Tool `write_file` declara, como **dado**, o recurso que tocaria (`requirements(args) → ActionRequest` com `access: 'write'`) e escreve o disco por uma **porta injetável separada** (`FsWritePort`). O **Permission Service** (`@atlas/permissions`) passa a rotear por `access`: `read` → `readRoots`, `write` → `writeRoots`, ambos pela **mesma** contenção lexical fatorada. O **Runtime não muda** — o portão da [SPEC-0011](../specs/SPEC-0011-permission-service-fs-read.md) já é agnóstico ao `access` e transforma qualquer veredicto ≠ `allowed` em `ExecutedStep` negado. A config nova `permissions.writeRoots` (default `[]`) segue a precedência `flags > env > defaults`.

**Tech Stack:** TypeScript (NodeNext, série 5), pnpm workspace, Vitest, `tsx`; execução do fonte sem `dist/`.

## Global Constraints

- **Node ≥ 24, pnpm ≥ 11** (corepack); TypeScript pinado em `^5`.
- **Regra de Dependência 5/11:** `@atlas/permissions` e `@atlas/tools` dependem **só** de `@atlas/contracts`; não dependem do Cognitive nem entre si. Só `@atlas/core` importa implementações para compor.
- **Permission Service é puro e síncrono, sem IO** — proibido importar `fs`/`fs/promises` em `@atlas/permissions`. Quem toca disco é a Tool, por porta injetável.
- **Permission Service não presume consentimento para ações destrutivas** — `writeRoots` default `[]`; escrita exige opt-in explícito.
- **Runtime nunca lança** e **não muda de código** nesta SPEC; Tool bloqueada **não** é executada (a porta de fs não é chamada).
- **Tools não decidem permissão nem quando são usadas** (Regra 5): `requirements` só descreve o recurso.
- Contenção é **lexical** (sem `realpath`/symlink) — limitação documentada, vale igual para escrita.
- **Não** produzir o veredicto `confirm`; **não** criar `mkdir -p`, deleção, append, múltiplas raízes.
- `FsWritePort` fica **interno** a `@atlas/tools` (sem 2º consumidor → não sobe a `@atlas/contracts`).
- **Convenção de imports:** paths relativos com sufixo `.js` (NodeNext); testes em `tests/` importando `../src/index.js` (ou `@atlas/...` para packages irmãos).
- **Commits** terminam com o trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Verificação da suíte completa: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`. Comandos `tsx` via `pnpm exec` (não `rtk proxy`).

---

## File Structure

**Novos:**
- `packages/tools/src/write-file.ts` — `createWriteFileTool({ fs? })`
- `packages/tools/tests/write-file.test.ts`

**Modificados:**
- `packages/tools/src/fs-port.ts` — `+ FsWritePort`, `+ nodeFsWritePort()`
- `packages/tools/src/index.ts` — re-export de `createWriteFileTool`, `FsWritePort`, `nodeFsWritePort`, `WriteFileDeps`
- `packages/contracts/src/permission.ts` — comentário de `AccessMode`
- `packages/contracts/src/config.ts` — `writeRoots` em `AtlasConfig.permissions` e `AtlasConfigOverride.permissions`
- `packages/permissions/src/permission-service.ts` — `writeRoots` em deps + contenção fatorada + rota por `access`
- `packages/permissions/tests/permission-service.test.ts` — `writeRoots` nas construções + casos de escrita
- `packages/core/src/config/defaults.ts` — `writeRoots: []`
- `packages/core/src/config/load-config.ts` — merge + validação de `writeRoots`
- `packages/core/src/index.ts` — Permission Service com `writeRoots`; registra `write_file`; `CreateAtlasDeps.fsWrite?`
- `packages/core/tests/load-config.test.ts` — casos de `writeRoots`
- `packages/core/tests/create-atlas.test.ts` — `writeRoots` nas construções + escrita ponta a ponta (fake fs)
- `apps/cli/src/gateway/input-gateway.ts` — flag `--allow-write` + env `ATLAS_ALLOW_WRITE` (coexistindo com read)
- `apps/cli/src/run.ts` — linha de ajuda `--allow-write`
- `apps/cli/src/commands/status.ts` — exibe `writeRoots`
- `apps/cli/tests/input-gateway.test.ts`, `apps/cli/tests/status.test.ts` — testes de flag/env/status
- `docs/06-adr/ADR-0013-permission-service-execution-gate.md` — nota de atualização
- `CLAUDE.md` (raiz, tools, permissions, core, cli), `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`, `implementation/LESSONS_LEARNED.md`

---

## Task 1: Contratos — `AccessMode` e `writeRoots` na config

**Files:**
- Modify: `packages/contracts/src/permission.ts:8`
- Modify: `packages/contracts/src/config.ts:12,21`

**Interfaces:**
- Produces: `AtlasConfig.permissions.writeRoots: readonly string[]`; `AtlasConfigOverride.permissions.writeRoots?: readonly string[]`. `AccessMode` inalterado em forma (só o comentário muda).

> Contratos são **type-only**: sem ciclo de teste em runtime; a verificação é `pnpm typecheck`.

- [ ] **Step 1: Atualizar o comentário de `AccessMode` em `packages/contracts/src/permission.ts`**

Substituir a linha 8 (o comentário) por:

```ts
/** 'read' e 'write' são ambos produzidos: 'read' contra readRoots, 'write' contra writeRoots. */
export type AccessMode = 'read' | 'write';
```

- [ ] **Step 2: Adicionar `writeRoots` ao `AtlasConfig` em `packages/contracts/src/config.ts`**

Substituir a linha do campo `permissions` na interface `AtlasConfig` por:

```ts
  readonly permissions: {
    readonly readRoots: readonly string[];
    readonly writeRoots: readonly string[];
  };
```

- [ ] **Step 3: Adicionar `writeRoots` ao `AtlasConfigOverride` em `packages/contracts/src/config.ts`**

Substituir a linha do campo `permissions` na interface `AtlasConfigOverride` por:

```ts
  permissions?: { readRoots?: readonly string[]; writeRoots?: readonly string[] };
```

- [ ] **Step 4: Verificar a compilação dos contratos**

Run: `pnpm --filter @atlas/contracts typecheck`
Expected: FAIL — os consumidores ainda não passam `writeRoots`; o próprio package de contratos compila, mas o typecheck do workspace só fecha ao final das próximas tasks. (Se rodar só o filtro de contracts: PASS, pois contratos são type-only e autoconsistentes.)

> Não commitar ainda: os contratos sozinhos quebram consumidores. O commit desta task vai junto da Task 2 (permissions) para manter o repo verde por commit. **Alternativa:** se preferir commits atômicos verdes, adie a validação `pnpm typecheck` global para o fim da Task 4.

- [ ] **Step 5: Commit (após Task 2 fechar o Permission Service)**

Ver Task 2, Step final — os contratos entram no mesmo commit do serviço.

---

## Task 2: Permission Service — julgar `write` contra `writeRoots`

**Files:**
- Modify: `packages/permissions/src/permission-service.ts`
- Modify: `packages/permissions/tests/permission-service.test.ts`

**Interfaces:**
- Consumes: `ActionRequest`, `AccessMode`, `PermissionDecision`, `PermissionService` (de `@atlas/contracts`).
- Produces: `createPermissionService({ readRoots, writeRoots })` — `writeRoots` agora **obrigatório** em `PermissionServiceDeps`. `evaluate` roteia: `read` → `readRoots`, `write` → `writeRoots`, ambos por contenção lexical; outro `access` → `blocked`.

- [ ] **Step 1: Reescrever os testes em `packages/permissions/tests/permission-service.test.ts`**

Substituir **todo** o conteúdo do arquivo por (adiciona `writeRoots` a cada construção e repurposa o teste de `write`):

```ts
import { describe, expect, it } from 'vitest';
import type { ActionRequest } from '@atlas/contracts';
import { createPermissionService } from '../src/index.js';

const read = (path: string, type: 'file' | 'directory' = 'file'): ActionRequest => ({
  resource: { type, path },
  access: 'read',
});

const write = (path: string): ActionRequest => ({
  resource: { type: 'file', path },
  access: 'write',
});

describe('createPermissionService.evaluate — leitura', () => {
  it('permite leitura dentro de uma raiz permitida', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(read('/work/repo/src/index.ts'))).toEqual({ verdict: 'allowed' });
  });

  it('permite quando o path é a própria raiz (diretório)', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(read('/work/repo', 'directory')).verdict).toBe('allowed');
  });

  it('bloqueia leitura fora de toda raiz permitida', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    const decision = service.evaluate(read('/etc/passwd'));
    expect(decision.verdict).toBe('blocked');
    expect(decision.reason).toBeTypeOf('string');
  });

  it('bloqueia escape por .. que sai da raiz', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(read('/work/repo/../secret.txt')).verdict).toBe('blocked');
  });

  it('não confunde prefixo de nome (/work/repo-secret) com raiz /work/repo', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(read('/work/repo-secret/x')).verdict).toBe('blocked');
  });

  it('permite quando o path está em QUALQUER uma das raízes', () => {
    const service = createPermissionService({ readRoots: ['/a', '/b'], writeRoots: [] });
    expect(service.evaluate(read('/b/file')).verdict).toBe('allowed');
  });

  it('trata a raiz do sistema (/) sem duplicar o separador', () => {
    const service = createPermissionService({ readRoots: ['/'], writeRoots: [] });
    expect(service.evaluate(read('/etc/hosts')).verdict).toBe('allowed');
  });
});

describe('createPermissionService.evaluate — escrita', () => {
  it('permite escrita dentro de uma raiz de escrita permitida', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    expect(service.evaluate(write('/work/out/a.txt'))).toEqual({ verdict: 'allowed' });
  });

  it('bloqueia escrita fora de toda raiz de escrita', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    const decision = service.evaluate(write('/etc/passwd'));
    expect(decision.verdict).toBe('blocked');
    expect(decision.reason).toContain('escrita');
  });

  it('bloqueia escrita quando writeRoots está vazio (default seguro)', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(write('/work/repo/a.txt')).verdict).toBe('blocked');
  });

  it('não confunde prefixo de nome na escrita (/work/out-evil)', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    expect(service.evaluate(write('/work/out-evil/x')).verdict).toBe('blocked');
  });

  it('grants são independentes: raiz de leitura não concede escrita', () => {
    const service = createPermissionService({ readRoots: ['/shared'], writeRoots: [] });
    expect(service.evaluate(read('/shared/a.txt')).verdict).toBe('allowed');
    expect(service.evaluate(write('/shared/a.txt')).verdict).toBe('blocked');
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `pnpm --filter @atlas/permissions test`
Expected: FAIL — `createPermissionService` ainda não aceita `writeRoots` (erro de tipo) e não julga `write`.

- [ ] **Step 3: Reescrever `packages/permissions/src/permission-service.ts`**

Substituir **todo** o conteúdo por:

```ts
import { resolve, sep } from 'node:path';
import type { ActionRequest, PermissionDecision, PermissionService } from '@atlas/contracts';

export interface PermissionServiceDeps {
  readonly readRoots: readonly string[];
  readonly writeRoots: readonly string[];
}

/** Contenção lexical: path resolvido igual à raiz ou sob ela (com fronteira de separador). */
function within(target: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    if (target === root) return true;
    const prefix = root.endsWith(sep) ? root : root + sep;
    return target.startsWith(prefix);
  });
}

/**
 * Avaliador puro/síncrono. Roteia por access: 'read' contra readRoots,
 * 'write' contra writeRoots. Não faz IO e não segue symlinks.
 */
export function createPermissionService(deps: PermissionServiceDeps): PermissionService {
  const readRoots = deps.readRoots.map((root) => resolve(root));
  const writeRoots = deps.writeRoots.map((root) => resolve(root));
  return {
    evaluate(action: ActionRequest): PermissionDecision {
      const target = resolve(action.resource.path);
      if (action.access === 'read') {
        return within(target, readRoots)
          ? { verdict: 'allowed' }
          : { verdict: 'blocked', reason: `fora do diretório permitido para leitura: ${action.resource.path}` };
      }
      if (action.access === 'write') {
        return within(target, writeRoots)
          ? { verdict: 'allowed' }
          : { verdict: 'blocked', reason: `fora do diretório permitido para escrita: ${action.resource.path}` };
      }
      return {
        verdict: 'blocked',
        reason: `acesso "${action.access}" não suportado`,
      };
    },
  };
}
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `pnpm --filter @atlas/permissions test`
Expected: PASS (todos os casos de leitura e escrita).

- [ ] **Step 5: Verificar typecheck de contratos + permissions**

Run: `pnpm --filter @atlas/contracts --filter @atlas/permissions typecheck`
Expected: PASS.

- [ ] **Step 6: Commit (contratos da Task 1 + permissions da Task 2)**

```bash
git add packages/contracts/src/permission.ts packages/contracts/src/config.ts \
        packages/permissions/src/permission-service.ts packages/permissions/tests/permission-service.test.ts
git commit -m "feat(permissions): julgar access 'write' contra writeRoots (contenção fatorada)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `FsWritePort` + Tool `write_file`

**Files:**
- Modify: `packages/tools/src/fs-port.ts`
- Create: `packages/tools/src/write-file.ts`
- Modify: `packages/tools/src/index.ts`
- Test: `packages/tools/tests/write-file.test.ts`

**Interfaces:**
- Consumes: `ActionRequest`, `Tool`, `ToolResult` (de `@atlas/contracts`).
- Produces: `FsWritePort { writeFile(path: string, content: string): Promise<void> }`, `nodeFsWritePort(): FsWritePort`, `createWriteFileTool(deps?: WriteFileDeps): Tool`, `WriteFileDeps { fs?: FsWritePort }`. A Tool `write_file` tem `requirements(args)` → `{ resource: { type: 'file', path }, access: 'write' }` e `run({ path, content })`.

- [ ] **Step 1: Escrever o teste em `packages/tools/tests/write-file.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { FsWritePort } from '../src/index.js';
import { createWriteFileTool } from '../src/index.js';

function fakeFs(): { port: FsWritePort; writes: Array<{ path: string; content: string }> } {
  const writes: Array<{ path: string; content: string }> = [];
  return {
    writes,
    port: {
      writeFile: async (path, content) => {
        writes.push({ path, content });
      },
    },
  };
}

describe('createWriteFileTool', () => {
  it('tem nome write_file e declara requirements de escrita de arquivo', () => {
    const tool = createWriteFileTool({ fs: fakeFs().port });
    expect(tool.name).toBe('write_file');
    expect(tool.requirements?.({ path: './out.txt', content: 'x' })).toEqual({
      resource: { type: 'file', path: './out.txt' },
      access: 'write',
    });
  });

  it('escreve o conteúdo pela porta em caso de sucesso', async () => {
    const fs = fakeFs();
    const tool = createWriteFileTool({ fs: fs.port });
    const result = await tool.run({ path: '/out/a.txt', content: 'olá' });
    expect(result.ok).toBe(true);
    expect(fs.writes).toEqual([{ path: '/out/a.txt', content: 'olá' }]);
  });

  it('erro quando path não é string não vazia — não chama a porta', async () => {
    const port = { writeFile: vi.fn() };
    const tool = createWriteFileTool({ fs: port });
    expect((await tool.run({ content: 'x' })).ok).toBe(false);
    expect((await tool.run({ path: '   ', content: 'x' })).ok).toBe(false);
    expect(port.writeFile).not.toHaveBeenCalled();
  });

  it('erro quando content não é string — não chama a porta', async () => {
    const port = { writeFile: vi.fn() };
    const tool = createWriteFileTool({ fs: port });
    expect((await tool.run({ path: '/out/a.txt' })).ok).toBe(false);
    expect((await tool.run({ path: '/out/a.txt', content: 42 })).ok).toBe(false);
    expect(port.writeFile).not.toHaveBeenCalled();
  });

  it('retorna erro estruturado quando a porta lança — não lança', async () => {
    const tool = createWriteFileTool({
      fs: {
        writeFile: async () => {
          throw new Error('EACCES: denied');
        },
      },
    });
    const result = await tool.run({ path: '/out/a.txt', content: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/out/a.txt');
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `pnpm --filter @atlas/tools test write-file`
Expected: FAIL — `createWriteFileTool` e `FsWritePort` não existem.

- [ ] **Step 3: Adicionar `FsWritePort` + `nodeFsWritePort()` em `packages/tools/src/fs-port.ts`**

Substituir a linha 1 (o import) por:

```ts
import {
  readFile as fsReadFile,
  readdir as fsReaddir,
  writeFile as fsWriteFile,
} from 'node:fs/promises';
```

Ao final do arquivo, acrescentar:

```ts
/** Porta mínima de escrita de sistema de arquivos (injetável nos testes). */
export interface FsWritePort {
  writeFile(path: string, content: string): Promise<void>;
}

export function nodeFsWritePort(): FsWritePort {
  return {
    writeFile: (path, content) => fsWriteFile(path, content, 'utf8'),
  };
}
```

- [ ] **Step 4: Criar `packages/tools/src/write-file.ts`**

```ts
import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsWritePort, type FsWritePort } from './fs-port.js';

export interface WriteFileDeps {
  fs?: FsWritePort;
}

export function createWriteFileTool(deps: WriteFileDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsWritePort();
  return {
    name: 'write_file',
    description:
      'Escreve conteúdo de texto em um arquivo, criando ou sobrescrevendo. Recebe { path, content }. Use quando o objetivo exigir gravar um arquivo.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'file', path }, access: 'write' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      const content = args.content;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'write_file exige um argumento "path" (string não vazia)' };
      }
      if (typeof content !== 'string') {
        return { ok: false, error: 'write_file exige um argumento "content" (string)' };
      }
      try {
        await fs.writeFile(path, content);
        return { ok: true, output: `escrito: ${path}` };
      } catch (cause) {
        return { ok: false, error: `não foi possível escrever ${path}: ${(cause as Error).message}` };
      }
    },
  };
}
```

- [ ] **Step 5: Re-exportar em `packages/tools/src/index.ts`**

Ao final do arquivo, acrescentar:

```ts
export { createWriteFileTool } from './write-file.js';
export type { WriteFileDeps } from './write-file.js';
export { nodeFsWritePort } from './fs-port.js';
export type { FsWritePort } from './fs-port.js';
```

- [ ] **Step 6: Rodar o teste para confirmar que passa**

Run: `pnpm --filter @atlas/tools test`
Expected: PASS (write-file + clock/calc/read-file/list-dir existentes).

- [ ] **Step 7: Commit**

```bash
git add packages/tools/src/fs-port.ts packages/tools/src/write-file.ts \
        packages/tools/src/index.ts packages/tools/tests/write-file.test.ts
git commit -m "feat(tools): Tool write_file + FsWritePort (primeira escrita de FS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Core — defaults, validação, composição e injeção de `fsWrite`

**Files:**
- Modify: `packages/core/src/config/defaults.ts:11`
- Modify: `packages/core/src/config/load-config.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/tests/load-config.test.ts`
- Modify: `packages/core/tests/create-atlas.test.ts`

**Interfaces:**
- Consumes: `createPermissionService({ readRoots, writeRoots })` (Task 2); `createWriteFileTool`, `nodeFsWritePort`, `FsWritePort` (Task 3); `AtlasConfig`/`AtlasConfigOverride` com `writeRoots` (Task 1).
- Produces: `CreateAtlasDeps.fsWrite?: FsWritePort`; config resolvida com `permissions.writeRoots` (default `[]`).

- [ ] **Step 1: Escrever os testes de config em `packages/core/tests/load-config.test.ts`**

Após o teste `'rejeita readRoots com caminho vazio'` (linha ~113), acrescentar dentro do mesmo `describe`:

```ts
  it('usa [] como writeRoots padrão', () => {
    const config = loadConfig();
    expect(config.permissions.writeRoots).toEqual([]);
  });

  it('override.permissions.writeRoots substitui o default', () => {
    const config = loadConfig({ permissions: { writeRoots: ['/out'] } });
    expect(config.permissions.writeRoots).toEqual(['/out']);
  });

  it('aceita writeRoots vazio explícito', () => {
    expect(() => loadConfig({ permissions: { writeRoots: [] } })).not.toThrow();
  });

  it('rejeita writeRoots com caminho vazio', () => {
    expect(() => loadConfig({ permissions: { writeRoots: ['  '] } })).toThrow(InvalidConfigError);
  });

  it('preserva readRoots e writeRoots juntos no override', () => {
    const config = loadConfig({ permissions: { readRoots: ['/r'], writeRoots: ['/w'] } });
    expect(config.permissions.readRoots).toEqual(['/r']);
    expect(config.permissions.writeRoots).toEqual(['/w']);
  });
```

- [ ] **Step 2: Rodar para confirmar que falham**

Run: `pnpm --filter @atlas/core test load-config`
Expected: FAIL — `writeRoots` ainda não existe na config resolvida.

- [ ] **Step 3: Adicionar o default em `packages/core/src/config/defaults.ts`**

Substituir a linha 11 por:

```ts
    permissions: { readRoots: [process.cwd()], writeRoots: [] },
```

- [ ] **Step 4: Merge + validação em `packages/core/src/config/load-config.ts`**

Substituir o bloco `const overrideRoots = ...` / `const permissions = { ... }` (linhas ~18-21) por:

```ts
  const permissions = {
    readRoots: override.permissions?.readRoots ?? defaults.permissions.readRoots,
    writeRoots: override.permissions?.writeRoots ?? defaults.permissions.writeRoots,
  };
```

Após o bloco de validação de `readRoots` (o `if (!Array.isArray(permissions.readRoots) ...)`), acrescentar:

```ts
  if (
    !Array.isArray(permissions.writeRoots) ||
    permissions.writeRoots.some((root) => typeof root !== 'string' || root.trim() === '')
  ) {
    issues.push('permissions.writeRoots deve ser uma lista de caminhos não vazios (pode ser vazia)');
  }
```

- [ ] **Step 5: Rodar para confirmar que os testes de config passam**

Run: `pnpm --filter @atlas/core test load-config`
Expected: PASS.

- [ ] **Step 6: Atualizar `packages/core/tests/create-atlas.test.ts`**

No import de `@atlas/tools` (linha 7), acrescentar `createWriteFileTool`:

```ts
import { createReadFileTool, createToolRegistry, createWriteFileTool } from '@atlas/tools';
```

Na linha ~153, corrigir a construção direta do Permission Service (agora `writeRoots` é obrigatório) — mantenha `[]` porque esse teste é de leitura:

```ts
    const permissions = createPermissionService({ readRoots: ['/repo'], writeRoots: [] });
```

Acrescentar, após o teste `'compõe com fsRead e permissions.readRoots injetados sem erro'`, um teste de **composição** que garante o wiring de `fsWrite`/`writeRoots` (usa `fakeStorage()` para não tocar disco):

```ts
  it('compõe com fsWrite injetado e resolve writeRoots sem erro', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' }, permissions: { writeRoots: ['/out'] } } },
      { memoryStorage: fakeStorage(), fsWrite: { writeFile: async () => {} } },
    );
    expect(atlas.config.permissions.writeRoots).toEqual(['/out']);
    await atlas.shutdown();
  });
```

Acrescentar, após o teste `'read_file lê dentro da raiz permitida e é bloqueada fora dela, sem tocar o fs'`, o **espelho para escrita** — roda o Runtime direto (sem o modelo), como o teste de leitura faz:

```ts
  it('write_file escreve dentro da raiz permitida e é bloqueada fora dela, sem tocar o fs', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const fsWrite = {
      writeFile: async (path: string, content: string) => {
        writes.push({ path, content });
      },
    };
    const permissions = createPermissionService({ readRoots: [], writeRoots: ['/out'] });
    const registry = createToolRegistry();
    registry.register(createWriteFileTool({ fs: fsWrite }));
    const runtime = createRuntime({ registry, permissions });

    const ok = await runtime.execute({
      steps: [{ tool: 'write_file', args: { path: '/out/a.txt', content: 'olá' } }],
    });
    expect(ok.steps[0]!.result).toEqual({ ok: true, output: 'escrito: /out/a.txt' });
    expect(writes).toEqual([{ path: '/out/a.txt', content: 'olá' }]);

    const blocked = await runtime.execute({
      steps: [{ tool: 'write_file', args: { path: '/etc/evil', content: 'x' } }],
    });
    expect(blocked.steps[0]!.result.ok).toBe(false);
    expect(writes).toHaveLength(1); // fs não foi tocado no passo bloqueado
  });
```

- [ ] **Step 7: Wiring em `packages/core/src/index.ts`**

No import de `@atlas/tools` (linhas 9-17), acrescentar `createWriteFileTool`, `nodeFsWritePort` e `type FsWritePort`:

```ts
import {
  createToolRegistry,
  createClockTool,
  createCalcTool,
  createReadFileTool,
  createListDirTool,
  createWriteFileTool,
  nodeFsReadPort,
  nodeFsWritePort,
  type FsReadPort,
  type FsWritePort,
} from '@atlas/tools';
```

Em `CreateAtlasDeps` (linha ~25-29), acrescentar `fsWrite?`:

```ts
export interface CreateAtlasDeps {
  fetch?: typeof fetch;
  memoryStorage?: MemoryStorage;
  fsRead?: FsReadPort;
  fsWrite?: FsWritePort;
}
```

Após `const fsRead = deps.fsRead ?? nodeFsReadPort();` (linha 42), acrescentar:

```ts
  const fsWrite = deps.fsWrite ?? nodeFsWritePort();
```

Substituir a criação do Permission Service (linha 43) por:

```ts
  const permissions = createPermissionService({
    readRoots: config.permissions.readRoots,
    writeRoots: config.permissions.writeRoots,
  });
```

Após `registry.register(createListDirTool({ fs: fsRead }));` (linha 48), acrescentar:

```ts
  registry.register(createWriteFileTool({ fs: fsWrite }));
```

- [ ] **Step 8: Rodar toda a suíte de core**

Run: `pnpm --filter @atlas/core test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/config/defaults.ts packages/core/src/config/load-config.ts \
        packages/core/src/index.ts packages/core/tests/load-config.test.ts \
        packages/core/tests/create-atlas.test.ts
git commit -m "feat(core): compõe writeRoots + registra write_file + injeta fsWrite

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CLI — `--allow-write`/`ATLAS_ALLOW_WRITE` e `status`

**Files:**
- Modify: `apps/cli/src/gateway/input-gateway.ts`
- Modify: `apps/cli/src/run.ts:42`
- Modify: `apps/cli/src/commands/status.ts:12`
- Modify: `apps/cli/tests/input-gateway.test.ts`
- Modify: `apps/cli/tests/status.test.ts`

**Interfaces:**
- Consumes: `AtlasConfigOverride.permissions.writeRoots` (Task 1); `config.permissions.writeRoots` na plataforma (Task 4).
- Produces: parsing de `--allow-write`/`ATLAS_ALLOW_WRITE` para `override.permissions.writeRoots` (precedência `flag > env`), coexistindo com read; `status` imprime `writeRoots`.

- [ ] **Step 1: Escrever os testes de input em `apps/cli/tests/input-gateway.test.ts`**

Após o teste `'--allow-read tem precedência sobre ATLAS_ALLOW_READ'` (linha ~105), acrescentar:

```ts
  it('mapeia ATLAS_ALLOW_WRITE para permissions.writeRoots', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_WRITE: '/env/out',
    });
    expect(parsed.configOverride.permissions).toEqual({ writeRoots: ['/env/out'] });
  });

  it('--allow-write tem precedência sobre ATLAS_ALLOW_WRITE', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status', '--allow-write', '/flag/out'], {
      ATLAS_ALLOW_WRITE: '/env/out',
    });
    expect(parsed.configOverride.permissions).toEqual({ writeRoots: ['/flag/out'] });
  });

  it('read e write coexistem no mesmo override.permissions', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(
      ['status', '--allow-read', '/in', '--allow-write', '/out'],
      {},
    );
    expect(parsed.configOverride.permissions).toEqual({
      readRoots: ['/in'],
      writeRoots: ['/out'],
    });
  });
```

- [ ] **Step 2: Rodar para confirmar que falham**

Run: `pnpm --filter @atlas/cli test input-gateway`
Expected: FAIL — `--allow-write`/`ATLAS_ALLOW_WRITE` não são reconhecidos.

- [ ] **Step 3: Registrar a flag no parser em `apps/cli/src/gateway/input-gateway.ts`**

Na interface `CliValues` (após `'allow-read'?`), acrescentar:

```ts
  'allow-write'?: string | undefined;
```

Em `parseArgvOrThrow`, no objeto `options`, após `'allow-read': { type: 'string' },`, acrescentar:

```ts
        'allow-write': { type: 'string' },
```

- [ ] **Step 4: Parsear read+write juntos em `resolveConfigOverride`**

Substituir o bloco atual (linhas ~76-85):

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

por:

```ts
  let readRoot: string | undefined;
  if (env.ATLAS_ALLOW_READ !== undefined) {
    readRoot = env.ATLAS_ALLOW_READ;
  }
  if (values['allow-read'] !== undefined) {
    readRoot = values['allow-read'];
  }
  let writeRoot: string | undefined;
  if (env.ATLAS_ALLOW_WRITE !== undefined) {
    writeRoot = env.ATLAS_ALLOW_WRITE;
  }
  if (values['allow-write'] !== undefined) {
    writeRoot = values['allow-write'];
  }
  if (readRoot !== undefined || writeRoot !== undefined) {
    const permissions: { readRoots?: readonly string[]; writeRoots?: readonly string[] } = {};
    if (readRoot !== undefined) {
      permissions.readRoots = [readRoot];
    }
    if (writeRoot !== undefined) {
      permissions.writeRoots = [writeRoot];
    }
    override.permissions = permissions;
  }
```

- [ ] **Step 5: Rodar para confirmar que os testes de input passam**

Run: `pnpm --filter @atlas/cli test input-gateway`
Expected: PASS (incluindo os testes de read existentes — só read continua produzindo `{ readRoots: [...] }`).

- [ ] **Step 6: Linha de ajuda em `apps/cli/src/run.ts`**

Após a linha 42 (`--allow-read <p> ...`), acrescentar:

```ts
      --allow-write <p> Diretório permitido para escrita (default: nenhum)
```

- [ ] **Step 7: Reescrever `apps/cli/tests/status.test.ts`**

O fake `AtlasPlatform` tem a config inline (que agora exige `writeRoots`). Extrair uma factory `fakeAtlas(permissions)` para cobrir os dois casos sem duplicação. Substituir **todo** o conteúdo do arquivo por:

```ts
import { describe, expect, it } from 'vitest';
import type { AtlasConfig, AtlasPlatform } from '@atlas/contracts';
import { runStatus } from '../src/commands/status.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';

function capture() {
  const out: string[] = [];
  const gateway: OutputGateway = {
    write: (text) => {
      out.push(text);
    },
    error: () => {},
  };
  return { gateway, text: () => out.join('') };
}

function fakeAtlas(permissions: AtlasConfig['permissions']): AtlasPlatform {
  return {
    state: 'ready',
    config: {
      logLevel: 'info',
      dataDir: '/home/x/.atlas',
      persona: 'jarvis',
      memory: { path: '/home/x/.atlas/memory.json' },
      permissions,
      model: { provider: 'local', model: 'llama3.2' },
    },
    persona: {
      id: 'jarvis',
      name: 'Jarvis',
      tone: 'profissional',
      formality: 'informal-respeitoso',
      language: 'espelhe o idioma',
      style: 'objetivo',
      communicationRules: [],
      voice: '',
      emotion: '',
    },
    cognitive: {
      ask: async () => ({ text: '' }),
      startConversation: () => ({ messages: [] }),
      respond: async () => ({ reply: '', conversation: { messages: [] } }),
    },
    context: {
      openSession: () => 'session-1',
      getConversation: () => ({ messages: [] }),
      updateConversation: () => {},
      closeSession: () => {},
    },
    memory: {
      remember: async () => ({ id: 'x', text: '', createdAt: '' }),
      forget: async () => false,
      list: () => [],
      prompt: () => undefined,
    },
    shutdown: async () => {},
  };
}

describe('runStatus', () => {
  it('renderiza estado e config resolvida (readRoots + writeRoots)', () => {
    const cap = capture();
    runStatus(
      fakeAtlas({ readRoots: ['/home/x/project'], writeRoots: ['/home/x/out'] }),
      cap.gateway,
    );
    const text = cap.text();
    expect(text).toContain('Atlas: ready');
    expect(text).toContain('logLevel: info');
    expect(text).toContain('dataDir: /home/x/.atlas');
    expect(text).toContain('persona: Jarvis (jarvis)');
    expect(text).toContain('readRoots: /home/x/project');
    expect(text).toContain('writeRoots: /home/x/out');
  });

  it('exibe writeRoots como (nenhuma) quando vazio', () => {
    const cap = capture();
    runStatus(fakeAtlas({ readRoots: ['/home/x/project'], writeRoots: [] }), cap.gateway);
    expect(cap.text()).toContain('writeRoots: (nenhuma)');
  });
});
```

- [ ] **Step 8: Exibir `writeRoots` em `apps/cli/src/commands/status.ts`**

Após a linha 12 (`readRoots: ...`), acrescentar dentro do array:

```ts
      `writeRoots: ${
        config.permissions.writeRoots.length > 0
          ? config.permissions.writeRoots.join(', ')
          : '(nenhuma)'
      }`,
```

- [ ] **Step 9: Rodar toda a suíte de CLI**

Run: `pnpm --filter @atlas/cli test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/cli/src/gateway/input-gateway.ts apps/cli/src/run.ts \
        apps/cli/src/commands/status.ts apps/cli/tests/input-gateway.test.ts \
        apps/cli/tests/status.test.ts
git commit -m "feat(cli): --allow-write/ATLAS_ALLOW_WRITE + status exibe writeRoots

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Verificação end-to-end + documentação

**Files:**
- Modify: `docs/06-adr/ADR-0013-permission-service-execution-gate.md`
- Modify: `CLAUDE.md` (raiz), `packages/permissions/CLAUDE.md`, `packages/tools/CLAUDE.md`, `packages/core/CLAUDE.md`, `apps/cli/CLAUDE.md`
- Modify: `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`
- Modify: `implementation/LESSONS_LEARNED.md`
- Modify: `implementation/specs/SPEC-0012-write-file-tool.md` (Status → `Review`)

- [ ] **Step 1: Suíte completa verde**

Run: `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: PASS em tudo. Anote o total de testes/arquivos (para o NEXT_CONTEXT).

- [ ] **Step 2: Verificação manual (fumaça) do bloqueio e da permissão de escrita**

Escrita **bloqueada** (sem `--allow-write`), objetivo que induz gravação, provider `fake`:

Run: `pnpm --filter @atlas/cli exec tsx src/main.ts status --allow-write /tmp/atlas-out`
Expected: a saída inclui `writeRoots: /tmp/atlas-out`.

Run: `pnpm --filter @atlas/cli exec tsx src/main.ts status`
Expected: a saída inclui `writeRoots: (nenhuma)`.

> A execução de um `ask` que realmente planeje `write_file` depende do provider; a garantia comportamental está coberta pelos testes unitários do Runtime/Tool/Permissions. O smoke do `status` confirma a config resolvida ponta a ponta.

- [ ] **Step 3: Nota de atualização no [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md)**

Acrescentar ao final do `docs/06-adr/ADR-0013-permission-service-execution-gate.md` uma seção `## Atualização (SPEC-0012)` registrando: `access: 'write'` passou de **reservado** a **produzido**; política `writeRoots` **separada** de `readRoots`, **default `[]`** (opt-in explícito, materializa "não presumir consentimento para destrutivas"); a contenção lexical foi **fatorada** e reusada por leitura e escrita; o Runtime **não mudou** (o portão já era agnóstico ao `access`); `confirm` **segue reservado** (fluxo interativo é a próxima fatia); symlink/`realpath` seguem fora (limitação conhecida vale igual para escrita).

- [ ] **Step 4: Atualizar os `CLAUDE.md`**

- Raiz (`CLAUDE.md`): no parágrafo de estado, acrescentar a `write_file` e a política `writeRoots` (default `[]`, `--allow-write`/`ATLAS_ALLOW_WRITE`) à descrição de `@atlas/tools`, `@atlas/permissions`, `@atlas/core` e `apps/cli`.
- `packages/permissions/CLAUDE.md`: `evaluate` roteia `read`→`readRoots`/`write`→`writeRoots` por contenção lexical fatorada; `writeRoots` em deps.
- `packages/tools/CLAUDE.md`: `createWriteFileTool` (`write_file`) + `FsWritePort`/`nodeFsWritePort` (escrita), simétrica ao `read_file`.
- `packages/core/CLAUDE.md`: registra `write_file`, compõe `writeRoots`, `CreateAtlasDeps.fsWrite?`.
- `apps/cli/CLAUDE.md`: `--allow-write`/`ATLAS_ALLOW_WRITE`; `status` exibe `writeRoots`.

- [ ] **Step 5: Atualizar contexto de sprint**

- `docs/05-context/CURRENT_SPRINT.md`: refletir SPEC-0012 em `Review`.
- `docs/05-context/NEXT_CONTEXT.md`: novo bloco de Estado Imediato para SPEC-0012 (o que foi entregue), total de testes atualizado, e mover o `confirm`/deleção/`mkdir`/symlink para "próximo trabalho".

- [ ] **Step 6: Registrar lições em `implementation/LESSONS_LEARNED.md`**

Acrescentar a seção da SPEC-0012 (obrigatório na DoD): o portão genérico da SPEC-0011 absorveu a escrita sem mudança de Runtime; `writeRoots` separado + default `[]` como materialização de "não presumir consentimento"; contenção fatorada reusada; decisão de nota no ADR-0013 em vez de ADR novo.

- [ ] **Step 7: Marcar a SPEC como `Review`**

Em `implementation/specs/SPEC-0012-write-file-tool.md`, trocar o checkbox de Status: `[x] Draft` → `[ ] Draft` e `[ ] Review` → `[x] Review`.

- [ ] **Step 8: Commit final da documentação**

```bash
git add docs/06-adr/ADR-0013-permission-service-execution-gate.md CLAUDE.md \
        packages/permissions/CLAUDE.md packages/tools/CLAUDE.md packages/core/CLAUDE.md \
        apps/cli/CLAUDE.md docs/05-context/NEXT_CONTEXT.md docs/05-context/CURRENT_SPRINT.md \
        implementation/LESSONS_LEARNED.md implementation/specs/SPEC-0012-write-file-tool.md
git commit -m "docs(permissions): ADR-0013 nota SPEC-0012, docs e lições (Review)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Ordem de commits**: Task 1 entra junto da Task 2 (contratos + serviço no mesmo commit) para manter o repo verde por commit — contratos sozinhos quebram consumidores.
- **Runtime**: nenhuma mudança de código. Se sentir vontade de "adaptar" o Runtime, **pare** — o portão já cobre escrita (ver Task 2 do [PLAN-0011](PLAN-0011-permission-service-fs-read.md)). Um teste do Runtime já cobre "veredicto ≠ allowed → passo negado, Tool não roda"; não precisa duplicar para escrita, mas pode acrescentar um caso `write` blocked se quiser reforço (opcional, sem novo código de produção).
- **`exactOptionalPropertyTypes`**: o objeto `permissions` montado na CLI usa campos opcionais atribuídos condicionalmente — não atribua `undefined` explicitamente.
- **Escopo**: se aparecer a tentação de `mkdir -p`, deleção, `confirm` ou múltiplas raízes, é fora de escopo (SPEC-0013+).
```
