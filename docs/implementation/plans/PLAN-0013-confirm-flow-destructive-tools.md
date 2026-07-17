# [SPEC-0013](../specs/SPEC-0013-confirm-flow-destructive-tools.md) — Fluxo `confirm` + Tools destrutivas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o veredicto `confirm` do Permission Service **real** — o Runtime pausa a execução de um plano para pedir confirmação explícita ao usuário antes de rodar uma ação irreversível — e dar ao Atlas três Tools novas: `delete_file` (`access: 'delete'`, exige confirmação), `mkdir` e `append_file` (`access: 'write'`, sem confirmação).

**Architecture:** `AccessMode` ganha `'delete'`. `@atlas/permissions` roteia `delete` contra `writeRoots` (mesma contenção lexical fatorada `within()`) produzindo `confirm` (dentro) ou `blocked` (fora/vazio) — `read`/`write` inalterados. O **Runtime** ganha uma dependência nova, `confirm: ConfirmPort` (`request(action): Promise<boolean>`), consultada só quando o veredicto é `confirm`: aprovado → executa a Tool normalmente; recusado → `ExecutedStep` negado com motivo distinto de `blocked`, Tool não roda, execução continua. `nodeReadlineConfirmPort()` (real, sobre `node:readline`) recusa automaticamente em EOF/não-TTY — nunca trava. `@atlas/core` compõe o port real por default e registra as três Tools novas. `@atlas/cognitive` e `apps/cli` **não mudam** — a pausa é interna a `runtime.execute()`, que `ask()` já aguarda.

**Tech Stack:** TypeScript (NodeNext, série 5), pnpm workspace, Vitest, `tsx`; execução do fonte sem `dist/`.

## Global Constraints

- **Node ≥ 24, pnpm ≥ 11** (corepack); TypeScript pinado em `^5`.
- **Regra de Dependência 5/11:** `@atlas/permissions`, `@atlas/tools` e `@atlas/runtime` dependem **só** de `@atlas/contracts` entre si; não dependem do Cognitive. Só `@atlas/core` importa implementações para compor.
- **Permission Service é puro e síncrono, sem IO** — proibido importar `fs`/`readline` em `@atlas/permissions`. Quem faz IO de terminal é o `ConfirmPort`, consultado pelo **Runtime**, nunca pelo `evaluate`.
- **Runtime nunca lança.** Recusa de confirmação e bloqueio por política são ambos `ExecutedStep` negado — nunca uma exceção.
- **Tools não decidem permissão nem quando são usadas** (Regra 5): `requirements` só descreve o recurso.
- Contenção é **lexical** (sem `realpath`/symlink) — limitação documentada, vale igual para `delete`.
- **Não** alterar `@atlas/cognitive` nem `apps/cli/src/commands/ask.ts` — o comportamento novo é transparente.
- **Não** implementar `rmdir`, symlink hardening, múltiplas raízes, contexto de ambiente, nem confirmação para `mkdir`/`append_file`.
- `ConfirmPort` fica **interno** a `@atlas/runtime` (sem 2º consumidor real → não sobe a `@atlas/contracts`), mesmo critério do `FsReadPort`/`FsWritePort`.
- O port real **nunca trava indefinidamente**: EOF/não-TTY em `stdin` resolve como recusado.
- **Convenção de imports:** paths relativos com sufixo `.js` (NodeNext); testes em `tests/` importando `../src/index.js` (ou `@atlas/...` para packages irmãos).
- **Commits** terminam com o trailer:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- Verificação da suíte completa: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`. Comandos `tsx` via `pnpm exec` (não `rtk proxy`).

---

## File Structure

**Novos:**
- `packages/tools/src/delete-file.ts` — `createDeleteFileTool({ fs? })`
- `packages/tools/tests/delete-file.test.ts`
- `packages/tools/src/mkdir.ts` — `createMkdirTool({ fs? })`
- `packages/tools/tests/mkdir.test.ts`
- `packages/tools/src/append-file.ts` — `createAppendFileTool({ fs? })`
- `packages/tools/tests/append-file.test.ts`
- `packages/runtime/src/confirm-port.ts` — `ConfirmPort`, `nodeReadlineConfirmPort()`
- `packages/runtime/tests/confirm-port.test.ts`

**Modificados:**
- `packages/contracts/src/permission.ts` — `AccessMode` ganha `'delete'`
- `packages/permissions/src/permission-service.ts` — rota `access: 'delete'` → `confirm`/`blocked`
- `packages/permissions/tests/permission-service.test.ts` — casos de `delete`
- `packages/tools/src/fs-port.ts` — `FsWritePort` ganha `deleteFile`/`mkdir`/`appendFile`
- `packages/tools/src/index.ts` — exports das 3 Tools novas
- `packages/tools/tests/write-file.test.ts` — fakes de `FsWritePort` ganham os 3 métodos novos (stub)
- `packages/runtime/src/runtime.ts` — `RuntimeDeps.confirm` + espera em `execute()`
- `packages/runtime/src/index.ts` — exports de `ConfirmPort`/`nodeReadlineConfirmPort`
- `packages/runtime/tests/runtime.test.ts` — `confirm` em toda construção + casos de `confirm` aprovado/recusado
- `packages/core/src/index.ts` — compõe `confirm` default, registra 3 Tools, `CreateAtlasDeps.confirm?`
- `packages/core/tests/create-atlas.test.ts` — `confirm` em toda construção + casos novos
- `docs/06-adr/ADR-0013-permission-service-execution-gate.md` — nota de atualização
- `CLAUDE.md` (raiz, `permissions`, `tools`, `runtime`, `core`), `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`, `docs/implementation/LESSONS_LEARNED.md`, `docs/implementation/specs/SPEC-0013-confirm-flow-destructive-tools.md` (Status → `Review`)

---

## Task 1: Contratos + Permission Service — rota `delete` → `confirm`/`blocked`

**Files:**
- Modify: `packages/contracts/src/permission.ts:8-9`
- Modify: `packages/permissions/src/permission-service.ts`
- Modify: `packages/permissions/tests/permission-service.test.ts`

**Interfaces:**
- Produces: `AccessMode = 'read' | 'write' | 'delete'`. `createPermissionService` inalterado em assinatura (`{ readRoots, writeRoots }`); `evaluate` passa a rotear `delete` contra `writeRoots`: dentro → `{ verdict: 'confirm' }`; fora/vazio → `{ verdict: 'blocked', reason }`.

- [ ] **Step 1: Atualizar `AccessMode` em `packages/contracts/src/permission.ts`**

Substituir as linhas 8-9 por:

```ts
/** 'read' contra readRoots; 'write'/'delete' contra writeRoots ('delete' produz confirm, não allowed). */
export type AccessMode = 'read' | 'write' | 'delete';
```

- [ ] **Step 2: Acrescentar os casos de `delete` em `packages/permissions/tests/permission-service.test.ts`**

No topo do arquivo, após a função `write` (linhas 10-13), acrescentar:

```ts
const del = (path: string): ActionRequest => ({
  resource: { type: 'file', path },
  access: 'delete',
});
```

Ao final do arquivo (após o `describe('createPermissionService.evaluate — escrita', ...)`), acrescentar um novo `describe`:

```ts
describe('createPermissionService.evaluate — delete', () => {
  it('produz confirm para delete dentro de uma raiz de escrita permitida', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    expect(service.evaluate(del('/work/out/a.txt'))).toEqual({ verdict: 'confirm' });
  });

  it('bloqueia delete fora de toda raiz de escrita', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    const decision = service.evaluate(del('/etc/passwd'));
    expect(decision.verdict).toBe('blocked');
    expect(decision.reason).toContain('escrita');
  });

  it('bloqueia delete quando writeRoots está vazio (default seguro)', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(del('/work/repo/a.txt')).verdict).toBe('blocked');
  });

  it('não confunde prefixo de nome no delete (/work/out-evil)', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    expect(service.evaluate(del('/work/out-evil/x')).verdict).toBe('blocked');
  });

  it('a mesma raiz produz veredictos distintos para write (allowed) e delete (confirm)', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    expect(service.evaluate(write('/work/out/a.txt')).verdict).toBe('allowed');
    expect(service.evaluate(del('/work/out/a.txt')).verdict).toBe('confirm');
  });
});
```

- [ ] **Step 3: Rodar os testes para confirmar que falham**

Run: `pnpm --filter @atlas/permissions test`
Expected: FAIL — `evaluate` ainda não conhece `access: 'delete'` (cai no `return { verdict: 'blocked', reason: 'acesso "delete" não suportado' }` genérico, então os testes de `confirm` falham).

- [ ] **Step 4: Implementar a rota `delete` em `packages/permissions/src/permission-service.ts`**

Substituir o bloco (linhas 36-43):

```ts
      if (action.access === 'write') {
        return within(target, writeRoots)
          ? { verdict: 'allowed' }
          : {
              verdict: 'blocked',
              reason: `fora do diretório permitido para escrita: ${action.resource.path}`,
            };
      }
      return {
        verdict: 'blocked',
        reason: `acesso "${action.access}" não suportado`,
      };
```

por:

```ts
      if (action.access === 'write') {
        return within(target, writeRoots)
          ? { verdict: 'allowed' }
          : {
              verdict: 'blocked',
              reason: `fora do diretório permitido para escrita: ${action.resource.path}`,
            };
      }
      if (action.access === 'delete') {
        return within(target, writeRoots)
          ? { verdict: 'confirm' }
          : {
              verdict: 'blocked',
              reason: `fora do diretório permitido para escrita: ${action.resource.path}`,
            };
      }
      return {
        verdict: 'blocked',
        reason: `acesso "${action.access}" não suportado`,
      };
```

Também atualizar o comentário do bloco de documentação da função (linhas 18-21) para:

```ts
/**
 * Avaliador puro/síncrono. Roteia por access: 'read' contra readRoots,
 * 'write'/'delete' contra writeRoots ('delete' produz confirm, não allowed).
 * Não faz IO e não segue symlinks.
 */
```

- [ ] **Step 5: Rodar os testes para confirmar que passam**

Run: `pnpm --filter @atlas/permissions test`
Expected: PASS (todos os casos, incluindo os de `delete`).

- [ ] **Step 6: Verificar typecheck de contratos + permissions**

Run: `pnpm --filter @atlas/contracts --filter @atlas/permissions typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/permission.ts packages/permissions/src/permission-service.ts \
        packages/permissions/tests/permission-service.test.ts
git commit -m "feat(permissions): AccessMode ganha 'delete', evaluate produz confirm contra writeRoots

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Tools — `FsWritePort` estendida + `delete_file`/`mkdir`/`append_file`

**Files:**
- Modify: `packages/tools/src/fs-port.ts`
- Create: `packages/tools/src/delete-file.ts`
- Test: `packages/tools/tests/delete-file.test.ts`
- Create: `packages/tools/src/mkdir.ts`
- Test: `packages/tools/tests/mkdir.test.ts`
- Create: `packages/tools/src/append-file.ts`
- Test: `packages/tools/tests/append-file.test.ts`
- Modify: `packages/tools/src/index.ts`
- Modify: `packages/tools/tests/write-file.test.ts`

**Interfaces:**
- Consumes: `ActionRequest`, `Tool` (de `@atlas/contracts`).
- Produces: `FsWritePort { writeFile, deleteFile(path): Promise<void>, mkdir(path): Promise<void>, appendFile(path, content): Promise<void> }`; `createDeleteFileTool(deps?: DeleteFileDeps): Tool` (`delete_file`, `access: 'delete'`, resource `type: 'file'`); `createMkdirTool(deps?: MkdirDeps): Tool` (`mkdir`, `access: 'write'`, resource `type: 'directory'`); `createAppendFileTool(deps?: AppendFileDeps): Tool` (`append_file`, `access: 'write'`, resource `type: 'file'`).

- [ ] **Step 1: Escrever os testes de `FsWritePort`/Tools novas (falhando)**

Criar `packages/tools/tests/delete-file.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { FsWritePort } from '../src/index.js';
import { createDeleteFileTool } from '../src/index.js';

function fakeFs(): { port: FsWritePort; deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    port: {
      writeFile: async () => {},
      deleteFile: async (path) => {
        deleted.push(path);
      },
      mkdir: async () => {},
      appendFile: async () => {},
    },
  };
}

describe('createDeleteFileTool', () => {
  it('tem nome delete_file e declara requirements com access "delete"', () => {
    const tool = createDeleteFileTool({ fs: fakeFs().port });
    expect(tool.name).toBe('delete_file');
    expect(tool.requirements?.({ path: '/out/a.txt' })).toEqual({
      resource: { type: 'file', path: '/out/a.txt' },
      access: 'delete',
    });
  });

  it('remove o arquivo pela porta em caso de sucesso', async () => {
    const fs = fakeFs();
    const tool = createDeleteFileTool({ fs: fs.port });
    const result = await tool.run({ path: '/out/a.txt' });
    expect(result).toEqual({ ok: true, output: 'removido: /out/a.txt' });
    expect(fs.deleted).toEqual(['/out/a.txt']);
  });

  it('erro quando path não é string não vazia — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createDeleteFileTool({ fs: port });
    expect((await tool.run({})).ok).toBe(false);
    expect((await tool.run({ path: '   ' })).ok).toBe(false);
    expect(port.deleteFile).not.toHaveBeenCalled();
  });

  it('retorna erro estruturado quando a porta lança — não lança', async () => {
    const tool = createDeleteFileTool({
      fs: {
        writeFile: async () => {},
        deleteFile: async () => {
          throw new Error('ENOENT: no such file');
        },
        mkdir: async () => {},
        appendFile: async () => {},
      },
    });
    const result = await tool.run({ path: '/out/missing.txt' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/out/missing.txt');
  });
});
```

Criar `packages/tools/tests/mkdir.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { FsWritePort } from '../src/index.js';
import { createMkdirTool } from '../src/index.js';

function fakeFs(): { port: FsWritePort; created: string[] } {
  const created: string[] = [];
  return {
    created,
    port: {
      writeFile: async () => {},
      deleteFile: async () => {},
      mkdir: async (path) => {
        created.push(path);
      },
      appendFile: async () => {},
    },
  };
}

describe('createMkdirTool', () => {
  it('tem nome mkdir e declara requirements com access "write" e recurso directory', () => {
    const tool = createMkdirTool({ fs: fakeFs().port });
    expect(tool.name).toBe('mkdir');
    expect(tool.requirements?.({ path: '/out/nested' })).toEqual({
      resource: { type: 'directory', path: '/out/nested' },
      access: 'write',
    });
  });

  it('cria o diretório pela porta em caso de sucesso', async () => {
    const fs = fakeFs();
    const tool = createMkdirTool({ fs: fs.port });
    const result = await tool.run({ path: '/out/nested' });
    expect(result).toEqual({ ok: true, output: 'diretório criado: /out/nested' });
    expect(fs.created).toEqual(['/out/nested']);
  });

  it('erro quando path não é string não vazia — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createMkdirTool({ fs: port });
    expect((await tool.run({})).ok).toBe(false);
    expect((await tool.run({ path: '' })).ok).toBe(false);
    expect(port.mkdir).not.toHaveBeenCalled();
  });

  it('retorna erro estruturado quando a porta lança — não lança', async () => {
    const tool = createMkdirTool({
      fs: {
        writeFile: async () => {},
        deleteFile: async () => {},
        mkdir: async () => {
          throw new Error('EACCES: denied');
        },
        appendFile: async () => {},
      },
    });
    const result = await tool.run({ path: '/out/nested' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/out/nested');
  });
});
```

Criar `packages/tools/tests/append-file.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { FsWritePort } from '../src/index.js';
import { createAppendFileTool } from '../src/index.js';

function fakeFs(): { port: FsWritePort; appends: Array<{ path: string; content: string }> } {
  const appends: Array<{ path: string; content: string }> = [];
  return {
    appends,
    port: {
      writeFile: async () => {},
      deleteFile: async () => {},
      mkdir: async () => {},
      appendFile: async (path, content) => {
        appends.push({ path, content });
      },
    },
  };
}

describe('createAppendFileTool', () => {
  it('tem nome append_file e declara requirements com access "write"', () => {
    const tool = createAppendFileTool({ fs: fakeFs().port });
    expect(tool.name).toBe('append_file');
    expect(tool.requirements?.({ path: '/out/log.txt', content: 'x' })).toEqual({
      resource: { type: 'file', path: '/out/log.txt' },
      access: 'write',
    });
  });

  it('acrescenta o conteúdo pela porta em caso de sucesso', async () => {
    const fs = fakeFs();
    const tool = createAppendFileTool({ fs: fs.port });
    const result = await tool.run({ path: '/out/log.txt', content: 'linha 1\n' });
    expect(result).toEqual({ ok: true, output: 'conteúdo acrescentado: /out/log.txt' });
    expect(fs.appends).toEqual([{ path: '/out/log.txt', content: 'linha 1\n' }]);
  });

  it('erro quando path não é string não vazia — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createAppendFileTool({ fs: port });
    expect((await tool.run({ content: 'x' })).ok).toBe(false);
    expect((await tool.run({ path: '   ', content: 'x' })).ok).toBe(false);
    expect(port.appendFile).not.toHaveBeenCalled();
  });

  it('erro quando content não é string — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createAppendFileTool({ fs: port });
    expect((await tool.run({ path: '/out/log.txt' })).ok).toBe(false);
    expect((await tool.run({ path: '/out/log.txt', content: 42 })).ok).toBe(false);
    expect(port.appendFile).not.toHaveBeenCalled();
  });

  it('retorna erro estruturado quando a porta lança — não lança', async () => {
    const tool = createAppendFileTool({
      fs: {
        writeFile: async () => {},
        deleteFile: async () => {},
        mkdir: async () => {},
        appendFile: async () => {
          throw new Error('EACCES: denied');
        },
      },
    });
    const result = await tool.run({ path: '/out/log.txt', content: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/out/log.txt');
  });
});
```

Reescrever `packages/tools/tests/write-file.test.ts` (os fakes de `FsWritePort` precisam dos 3 métodos novos, mesmo sem uso — mesmo padrão de `FsReadPort` em `list-dir.test.ts`/`read-file.test.ts`). Substituir **todo** o conteúdo por:

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
      deleteFile: async () => {},
      mkdir: async () => {},
      appendFile: async () => {},
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
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createWriteFileTool({ fs: port });
    expect((await tool.run({ content: 'x' })).ok).toBe(false);
    expect((await tool.run({ path: '   ', content: 'x' })).ok).toBe(false);
    expect(port.writeFile).not.toHaveBeenCalled();
  });

  it('erro quando content não é string — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
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
        deleteFile: async () => {},
        mkdir: async () => {},
        appendFile: async () => {},
      },
    });
    const result = await tool.run({ path: '/out/a.txt', content: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/out/a.txt');
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `pnpm --filter @atlas/tools test`
Expected: FAIL — `createDeleteFileTool`/`createMkdirTool`/`createAppendFileTool` não existem; `write-file.test.ts` falha por tipo (`FsWritePort` ainda não tem os métodos novos).

- [ ] **Step 3: Estender `FsWritePort` em `packages/tools/src/fs-port.ts`**

Substituir a linha 1-5 (import) por:

```ts
import {
  readFile as fsReadFile,
  readdir as fsReaddir,
  writeFile as fsWriteFile,
  unlink as fsUnlink,
  mkdir as fsMkdir,
  appendFile as fsAppendFile,
} from 'node:fs/promises';
```

Substituir o bloco final (linhas 20-29) por:

```ts
/** Porta de escrita de sistema de arquivos (injetável nos testes). */
export interface FsWritePort {
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  appendFile(path: string, content: string): Promise<void>;
}

export function nodeFsWritePort(): FsWritePort {
  return {
    writeFile: (path, content) => fsWriteFile(path, content, 'utf8'),
    deleteFile: (path) => fsUnlink(path),
    mkdir: (path) => fsMkdir(path, { recursive: true }).then(() => undefined),
    appendFile: (path, content) => fsAppendFile(path, content, 'utf8'),
  };
}
```

- [ ] **Step 4: Criar `packages/tools/src/delete-file.ts`**

```ts
import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsWritePort, type FsWritePort } from './fs-port.js';

export interface DeleteFileDeps {
  fs?: FsWritePort;
}

export function createDeleteFileTool(deps: DeleteFileDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsWritePort();
  return {
    name: 'delete_file',
    description:
      'Remove um arquivo existente. Recebe { path }. Ação irreversível — exige confirmação do usuário antes de executar.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'file', path }, access: 'delete' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'delete_file exige um argumento "path" (string não vazia)' };
      }
      try {
        await fs.deleteFile(path);
        return { ok: true, output: `removido: ${path}` };
      } catch (cause) {
        return { ok: false, error: `não foi possível remover ${path}: ${(cause as Error).message}` };
      }
    },
  };
}
```

- [ ] **Step 5: Criar `packages/tools/src/mkdir.ts`**

```ts
import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsWritePort, type FsWritePort } from './fs-port.js';

export interface MkdirDeps {
  fs?: FsWritePort;
}

export function createMkdirTool(deps: MkdirDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsWritePort();
  return {
    name: 'mkdir',
    description:
      'Cria um diretório, incluindo diretórios intermediários ausentes. Recebe { path }. Idempotente: não erra se já existir.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'directory', path }, access: 'write' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'mkdir exige um argumento "path" (string não vazia)' };
      }
      try {
        await fs.mkdir(path);
        return { ok: true, output: `diretório criado: ${path}` };
      } catch (cause) {
        return { ok: false, error: `não foi possível criar ${path}: ${(cause as Error).message}` };
      }
    },
  };
}
```

- [ ] **Step 6: Criar `packages/tools/src/append-file.ts`**

```ts
import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsWritePort, type FsWritePort } from './fs-port.js';

export interface AppendFileDeps {
  fs?: FsWritePort;
}

export function createAppendFileTool(deps: AppendFileDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsWritePort();
  return {
    name: 'append_file',
    description:
      'Acrescenta conteúdo de texto ao final de um arquivo, criando-o se não existir. Recebe { path, content }.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'file', path }, access: 'write' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      const content = args.content;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'append_file exige um argumento "path" (string não vazia)' };
      }
      if (typeof content !== 'string') {
        return { ok: false, error: 'append_file exige um argumento "content" (string)' };
      }
      try {
        await fs.appendFile(path, content);
        return { ok: true, output: `conteúdo acrescentado: ${path}` };
      } catch (cause) {
        return {
          ok: false,
          error: `não foi possível acrescentar em ${path}: ${(cause as Error).message}`,
        };
      }
    },
  };
}
```

- [ ] **Step 7: Re-exportar em `packages/tools/src/index.ts`**

Ao final do arquivo, acrescentar:

```ts
export { createDeleteFileTool } from './delete-file.js';
export type { DeleteFileDeps } from './delete-file.js';
export { createMkdirTool } from './mkdir.js';
export type { MkdirDeps } from './mkdir.js';
export { createAppendFileTool } from './append-file.js';
export type { AppendFileDeps } from './append-file.js';
```

- [ ] **Step 8: Rodar toda a suíte de tools**

Run: `pnpm --filter @atlas/tools test`
Expected: PASS (clock/calc/read-file/list-dir/write-file/delete-file/mkdir/append-file).

- [ ] **Step 9: Commit**

```bash
git add packages/tools/src/fs-port.ts packages/tools/src/delete-file.ts packages/tools/src/mkdir.ts \
        packages/tools/src/append-file.ts packages/tools/src/index.ts \
        packages/tools/tests/delete-file.test.ts packages/tools/tests/mkdir.test.ts \
        packages/tools/tests/append-file.test.ts packages/tools/tests/write-file.test.ts
git commit -m "feat(tools): Tools delete_file/mkdir/append_file + FsWritePort estendida

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Runtime — `ConfirmPort` + pausa em `execute()`

**Files:**
- Create: `packages/runtime/src/confirm-port.ts`
- Test: `packages/runtime/tests/confirm-port.test.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/tests/runtime.test.ts`

**Interfaces:**
- Consumes: `ActionRequest` (de `@atlas/contracts`).
- Produces: `ConfirmPort { request(action: ActionRequest): Promise<boolean> }`; `nodeReadlineConfirmPort(input?: Readable, output?: Writable): ConfirmPort` (default `process.stdin`/`process.stdout`; parâmetros injetáveis só para teste, mesmo espírito de `nodeFsReadPort`). `RuntimeDeps` ganha `confirm: ConfirmPort` (obrigatório). `execute()`: veredicto `confirm` → `await confirm.request(requirement)`; aprovado → roda a Tool normalmente; recusado → `ExecutedStep` negado com `error: 'ação cancelada pelo usuário'` (nunca chama `tool.run`).

- [ ] **Step 1: Escrever `packages/runtime/tests/confirm-port.test.ts` (falhando)**

```ts
import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { ActionRequest } from '@atlas/contracts';
import { nodeReadlineConfirmPort } from '../src/index.js';

function fakeTtyInput(): Readable {
  const stream = new Readable({ read() {} }) as Readable & { isTTY?: boolean };
  stream.isTTY = true;
  return stream;
}

function sink(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

const action: ActionRequest = { resource: { type: 'file', path: '/out/a.txt' }, access: 'delete' };

describe('nodeReadlineConfirmPort', () => {
  it('recusa automaticamente quando o input não é TTY (não trava)', async () => {
    const input = new Readable({ read() {} });
    const port = nodeReadlineConfirmPort(input, sink());
    await expect(port.request(action)).resolves.toBe(false);
  });

  it('recusa automaticamente quando o input fecha (EOF) antes de responder', async () => {
    const input = fakeTtyInput();
    const port = nodeReadlineConfirmPort(input, sink());
    const pending = port.request(action);
    input.push(null);
    await expect(pending).resolves.toBe(false);
  });

  it('aprova quando a resposta é "s"', async () => {
    const input = fakeTtyInput();
    const port = nodeReadlineConfirmPort(input, sink());
    const pending = port.request(action);
    input.push('s\n');
    await expect(pending).resolves.toBe(true);
  });

  it('recusa quando a resposta não é afirmativa', async () => {
    const input = fakeTtyInput();
    const port = nodeReadlineConfirmPort(input, sink());
    const pending = port.request(action);
    input.push('n\n');
    await expect(pending).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm --filter @atlas/runtime test confirm-port`
Expected: FAIL — `nodeReadlineConfirmPort` não existe.

- [ ] **Step 3: Criar `packages/runtime/src/confirm-port.ts`**

```ts
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { ActionRequest } from '@atlas/contracts';

/** Interno ao package: sem 2º consumidor real, não sobe a @atlas/contracts. */
export interface ConfirmPort {
  request(action: ActionRequest): Promise<boolean>;
}

/**
 * Port real sobre node:readline. input/output são injetáveis só para teste
 * (mesmo padrão de nodeFsReadPort); em produção usa stdin/stdout reais.
 * Nunca trava: input não-TTY ou que fecha (EOF) antes de responder resolve false.
 */
export function nodeReadlineConfirmPort(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): ConfirmPort {
  return {
    request(action: ActionRequest): Promise<boolean> {
      if (!(input as NodeJS.ReadStream).isTTY) {
        return Promise.resolve(false);
      }
      const rl = createInterface({ input, output });
      return new Promise<boolean>((resolvePrompt) => {
        let settled = false;
        const finish = (approved: boolean): void => {
          if (settled) return;
          settled = true;
          rl.close();
          resolvePrompt(approved);
        };
        rl.question(
          `Confirmar ação irreversível (${action.access} em ${action.resource.path})? [s/N] `,
          (answer) => finish(/^s(im)?$/i.test(answer.trim())),
        );
        rl.on('close', () => finish(false));
      });
    },
  };
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `pnpm --filter @atlas/runtime test confirm-port`
Expected: PASS.

- [ ] **Step 5: Escrever os casos de `confirm` em `packages/runtime/tests/runtime.test.ts` (falhando)**

Substituir **todo** o conteúdo do arquivo por:

```ts
import { describe, expect, it } from 'vitest';
import type { Tool, ToolRegistry } from '@atlas/contracts';
import type { PermissionDecision, PermissionService } from '@atlas/contracts';
import type { ConfirmPort } from '../src/index.js';
import { createRuntime } from '../src/index.js';

function fakeRegistry(tools: Tool[]): ToolRegistry {
  const map = new Map(tools.map((tool) => [tool.name, tool]));
  return {
    register: (tool) => {
      map.set(tool.name, tool);
    },
    get: (name) => map.get(name),
    has: (name) => map.has(name),
    list: () => [...map.values()],
  };
}

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

function fakeConfirm(approved: boolean): ConfirmPort {
  return { request: async () => approved };
}

function recordingConfirm(approved: boolean): { port: ConfirmPort; calls: number } {
  const state = { calls: 0 };
  return {
    port: {
      request: async () => {
        state.calls += 1;
        return approved;
      },
    },
    get calls() {
      return state.calls;
    },
  };
}

describe('createRuntime.execute', () => {
  it('executa os passos em ordem e agrega os resultados', async () => {
    const calls: string[] = [];
    const a: Tool = {
      name: 'a',
      description: 'A',
      run: async (args) => {
        calls.push('a');
        return { ok: true, output: `a:${JSON.stringify(args)}` };
      },
    };
    const b: Tool = {
      name: 'b',
      description: 'B',
      run: async () => {
        calls.push('b');
        return { ok: true, output: 'b' };
      },
    };
    const runtime = createRuntime({
      registry: fakeRegistry([a, b]),
      permissions: fakePermissions(),
      confirm: fakeConfirm(true),
    });

    const result = await runtime.execute({
      steps: [
        { tool: 'a', args: { x: 1 } },
        { tool: 'b', args: {} },
      ],
    });

    expect(calls).toEqual(['a', 'b']);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]!.result).toEqual({ ok: true, output: 'a:{"x":1}' });
    expect(result.steps[1]!.tool).toBe('b');
  });

  it('Tool inexistente vira falha estruturada e a execução continua', async () => {
    const b: Tool = { name: 'b', description: 'B', run: async () => ({ ok: true, output: 'b' }) };
    const runtime = createRuntime({
      registry: fakeRegistry([b]),
      permissions: fakePermissions(),
      confirm: fakeConfirm(true),
    });

    const result = await runtime.execute({
      steps: [
        { tool: 'missing', args: {} },
        { tool: 'b', args: {} },
      ],
    });

    expect(result.steps[0]!.result.ok).toBe(false);
    expect(result.steps[0]!.result.error).toContain('desconhecida');
    expect(result.steps[1]!.result.ok).toBe(true);
  });

  it('Tool que lança vira falha estruturada e não propaga', async () => {
    const boom: Tool = {
      name: 'boom',
      description: 'x',
      run: async () => {
        throw new Error('kaboom');
      },
    };
    const runtime = createRuntime({
      registry: fakeRegistry([boom]),
      permissions: fakePermissions(),
      confirm: fakeConfirm(true),
    });

    const result = await runtime.execute({ steps: [{ tool: 'boom', args: {} }] });

    expect(result.steps[0]!.result.ok).toBe(false);
    expect(result.steps[0]!.result.error).toContain('kaboom');
  });

  it('tools() expõe os descritores (nome + descrição) do registry', () => {
    const a: Tool = { name: 'a', description: 'A', run: async () => ({ ok: true }) };
    const b: Tool = { name: 'b', description: 'B', run: async () => ({ ok: true }) };
    const runtime = createRuntime({
      registry: fakeRegistry([a, b]),
      permissions: fakePermissions(),
      confirm: fakeConfirm(true),
    });

    expect(runtime.tools()).toEqual([
      { name: 'a', description: 'A' },
      { name: 'b', description: 'B' },
    ]);
  });

  it('não consulta permissions para Tool sem requirements (livre)', async () => {
    const free: Tool = {
      name: 'free',
      description: 'x',
      run: async () => ({ ok: true, output: 'ok' }),
    };
    const perms = recordingPermissions();
    const runtime = createRuntime({
      registry: fakeRegistry([free]),
      permissions: perms.service,
      confirm: fakeConfirm(true),
    });

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
      confirm: fakeConfirm(true),
    });

    const result = await runtime.execute({
      steps: [{ tool: 'gated', args: { path: '/repo/a' } }],
    });

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
    const after: Tool = {
      name: 'after',
      description: 'x',
      run: async () => ({ ok: true, output: 'after' }),
    };
    const runtime = createRuntime({
      registry: fakeRegistry([gated, after]),
      permissions: fakePermissions({ verdict: 'blocked', reason: 'fora da raiz' }),
      confirm: fakeConfirm(true),
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

  it('bloqueado por política NÃO consulta confirm', async () => {
    const gated: Tool = {
      name: 'gated',
      description: 'x',
      requirements: () => ({ resource: { type: 'file', path: '/etc/passwd' }, access: 'read' }),
      run: async () => ({ ok: true, output: 'nunca' }),
    };
    const confirm = recordingConfirm(true);
    const runtime = createRuntime({
      registry: fakeRegistry([gated]),
      permissions: fakePermissions({ verdict: 'blocked', reason: 'fora da raiz' }),
      confirm: confirm.port,
    });

    await runtime.execute({ steps: [{ tool: 'gated', args: { path: '/etc/passwd' } }] });

    expect(confirm.calls).toBe(0);
  });

  it('veredicto confirm aprovado: aguarda confirm.request e executa a Tool normalmente', async () => {
    let ran = false;
    const destructive: Tool = {
      name: 'delete_file',
      description: 'x',
      requirements: () => ({ resource: { type: 'file', path: '/out/a.txt' }, access: 'delete' }),
      run: async () => {
        ran = true;
        return { ok: true, output: 'removido: /out/a.txt' };
      },
    };
    const confirm = recordingConfirm(true);
    const runtime = createRuntime({
      registry: fakeRegistry([destructive]),
      permissions: fakePermissions({ verdict: 'confirm' }),
      confirm: confirm.port,
    });

    const result = await runtime.execute({
      steps: [{ tool: 'delete_file', args: { path: '/out/a.txt' } }],
    });

    expect(confirm.calls).toBe(1);
    expect(ran).toBe(true);
    expect(result.steps[0]!.result).toEqual({ ok: true, output: 'removido: /out/a.txt' });
  });

  it('veredicto confirm recusado: ExecutedStep negado (motivo distinto de blocked), Tool não roda, execução continua', async () => {
    let ran = false;
    const destructive: Tool = {
      name: 'delete_file',
      description: 'x',
      requirements: () => ({ resource: { type: 'file', path: '/out/a.txt' }, access: 'delete' }),
      run: async () => {
        ran = true;
        return { ok: true, output: 'nunca' };
      },
    };
    const after: Tool = {
      name: 'after',
      description: 'x',
      run: async () => ({ ok: true, output: 'after' }),
    };
    const runtime = createRuntime({
      registry: fakeRegistry([destructive, after]),
      permissions: fakePermissions({ verdict: 'confirm' }),
      confirm: fakeConfirm(false),
    });

    const result = await runtime.execute({
      steps: [
        { tool: 'delete_file', args: { path: '/out/a.txt' } },
        { tool: 'after', args: {} },
      ],
    });

    expect(ran).toBe(false);
    expect(result.steps[0]!.result.ok).toBe(false);
    expect(result.steps[0]!.result.error).not.toContain('fora');
    expect(result.steps[0]!.result.error).toContain('cancelada');
    expect(result.steps[1]!.result.ok).toBe(true);
  });
});
```

- [ ] **Step 6: Rodar para confirmar que falha**

Run: `pnpm --filter @atlas/runtime test runtime`
Expected: FAIL — `createRuntime` ainda não aceita `confirm` (erro de tipo) e não trata veredicto `confirm`.

- [ ] **Step 7: Implementar `confirm` em `packages/runtime/src/runtime.ts`**

Substituir **todo** o conteúdo por:

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
import type { ConfirmPort } from './confirm-port.js';

export interface RuntimeDeps {
  registry: ToolRegistry;
  permissions: PermissionService;
  confirm: ConfirmPort;
}

export function createRuntime(deps: RuntimeDeps): Runtime {
  const { registry, permissions, confirm } = deps;
  return {
    tools(): readonly ToolDescriptor[] {
      return registry.list().map((tool) => ({ name: tool.name, description: tool.description }));
    },

    async execute(plan: Plan): Promise<ExecutionResult> {
      const steps: ExecutedStep[] = [];
      for (const step of plan.steps) {
        const tool = registry.get(step.tool);
        if (tool === undefined) {
          steps.push({
            tool: step.tool,
            args: step.args,
            result: { ok: false, error: `ferramenta desconhecida: ${step.tool}` },
          });
          continue;
        }
        const requirement = tool.requirements?.(step.args) ?? null;
        if (requirement !== null) {
          const decision = permissions.evaluate(requirement);
          if (decision.verdict === 'confirm') {
            const approved = await confirm.request(requirement);
            if (!approved) {
              steps.push({
                tool: step.tool,
                args: step.args,
                result: { ok: false, error: 'ação cancelada pelo usuário' },
              });
              continue;
            }
          } else if (decision.verdict !== 'allowed') {
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
        try {
          const result = await tool.run(step.args);
          steps.push({ tool: step.tool, args: step.args, result });
        } catch (cause) {
          steps.push({
            tool: step.tool,
            args: step.args,
            result: {
              ok: false,
              error: `falha ao executar ${step.tool}: ${(cause as Error).message}`,
            },
          });
        }
      }
      return { steps };
    },
  };
}
```

- [ ] **Step 8: Exportar `ConfirmPort`/`nodeReadlineConfirmPort` em `packages/runtime/src/index.ts`**

Substituir **todo** o conteúdo por:

```ts
export { createRuntime } from './runtime.js';
export type { RuntimeDeps } from './runtime.js';
export { nodeReadlineConfirmPort } from './confirm-port.js';
export type { ConfirmPort } from './confirm-port.js';
```

- [ ] **Step 9: Rodar toda a suíte de runtime**

Run: `pnpm --filter @atlas/runtime test`
Expected: PASS (`confirm-port` + `runtime`, todos os casos).

- [ ] **Step 10: Verificar typecheck de runtime**

Run: `pnpm --filter @atlas/runtime typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/runtime/src/confirm-port.ts packages/runtime/src/runtime.ts \
        packages/runtime/src/index.ts packages/runtime/tests/confirm-port.test.ts \
        packages/runtime/tests/runtime.test.ts
git commit -m "feat(runtime): ConfirmPort + execute() aguarda confirmação no veredicto confirm

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Core — compõe `ConfirmPort` default, registra as 3 Tools novas

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/tests/create-atlas.test.ts`

**Interfaces:**
- Consumes: `createRuntime({ registry, permissions, confirm })`, `nodeReadlineConfirmPort`, `type ConfirmPort` (de `@atlas/runtime`, Task 3); `createDeleteFileTool`, `createMkdirTool`, `createAppendFileTool`, `type FsWritePort` (de `@atlas/tools`, Task 2).
- Produces: `CreateAtlasDeps.confirm?: ConfirmPort`; `runtime.tools()` inclui `delete_file`/`mkdir`/`append_file`.

- [ ] **Step 1: Escrever os testes novos em `packages/core/tests/create-atlas.test.ts`**

No topo do arquivo, atualizar os imports (linhas 1-9) — substituir por:

```ts
import { describe, expect, it } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import type { Fact, Tool } from '@atlas/contracts';
import type { MemoryStorage } from '@atlas/memory';
import { createPermissionService } from '@atlas/permissions';
import { createRuntime } from '@atlas/runtime';
import type { ConfirmPort } from '@atlas/runtime';
import {
  createDeleteFileTool,
  createReadFileTool,
  createToolRegistry,
  createWriteFileTool,
} from '@atlas/tools';
import type { FsReadPort, FsWritePort } from '@atlas/tools';
import { createAtlas } from '../src/index.js';
```

Substituir a linha `{ memoryStorage: fakeStorage(), fsWrite: { writeFile: async () => {} } },` (linha 147, dentro de `'compõe com fsWrite injetado e resolve writeRoots sem erro'`) por um `FsWritePort` completo:

```ts
      { memoryStorage: fakeStorage(), fsWrite: fullFsWrite() },
```

Após a função `fakeStorage` (antes de `describe('createAtlas', ...)`), acrescentar o helper reusado nos testes de `fsWrite`:

```ts
function fullFsWrite(overrides: Partial<FsWritePort> = {}): FsWritePort {
  return {
    writeFile: async () => {},
    deleteFile: async () => {},
    mkdir: async () => {},
    appendFile: async () => {},
    ...overrides,
  };
}

function fakeConfirm(approved: boolean): ConfirmPort {
  return { request: async () => approved };
}
```

Substituir o teste `'write_file escreve dentro da raiz permitida e é bloqueada fora dela, sem tocar o fs'` (linhas 179-202) — o `fsWrite` inline e as duas chamadas a `createRuntime` precisam de `deleteFile`/`mkdir`/`appendFile` (no fake) e de `confirm` — por:

```ts
  it('write_file escreve dentro da raiz permitida e é bloqueada fora dela, sem tocar o fs', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const fsWrite = fullFsWrite({
      writeFile: async (path: string, content: string) => {
        writes.push({ path, content });
      },
    });
    const permissions = createPermissionService({ readRoots: [], writeRoots: ['/out'] });
    const registry = createToolRegistry();
    registry.register(createWriteFileTool({ fs: fsWrite }));
    const runtime = createRuntime({ registry, permissions, confirm: fakeConfirm(true) });

    const ok = await runtime.execute({
      steps: [{ tool: 'write_file', args: { path: '/out/a.txt', content: 'olá' } }],
    });
    expect(ok.steps[0]!.result).toEqual({ ok: true, output: 'escrito: /out/a.txt' });
    expect(writes).toEqual([{ path: '/out/a.txt', content: 'olá' }]);

    const blocked = await runtime.execute({
      steps: [{ tool: 'write_file', args: { path: '/etc/evil', content: 'x' } }],
    });
    expect(blocked.steps[0]!.result.ok).toBe(false);
    expect(writes).toHaveLength(1);
  });

  it('compõe o ConfirmPort default no Runtime e aceita CreateAtlasDeps.confirm para testes', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage(), confirm: fakeConfirm(true) },
    );
    expect(atlas.state).toBe('ready');
    await atlas.shutdown();
  });

  it('delete_file pede confirmação: aprovado remove, recusado mantém e execução segue', async () => {
    const deleted: string[] = [];
    const fsWrite = fullFsWrite({
      deleteFile: async (path: string) => {
        deleted.push(path);
      },
    });
    const permissions = createPermissionService({ readRoots: [], writeRoots: ['/out'] });
    const registry = createToolRegistry();
    registry.register(createDeleteFileTool({ fs: fsWrite }));
    const after: Tool = {
      name: 'after',
      description: 'x',
      run: async () => ({ ok: true, output: 'after' }),
    };
    registry.register(after);

    const approvedRuntime = createRuntime({
      registry,
      permissions,
      confirm: fakeConfirm(true),
    });
    const approvedResult = await approvedRuntime.execute({
      steps: [{ tool: 'delete_file', args: { path: '/out/a.txt' } }],
    });
    expect(approvedResult.steps[0]!.result).toEqual({ ok: true, output: 'removido: /out/a.txt' });
    expect(deleted).toEqual(['/out/a.txt']);

    const declinedRuntime = createRuntime({
      registry,
      permissions,
      confirm: fakeConfirm(false),
    });
    const declinedResult = await declinedRuntime.execute({
      steps: [
        { tool: 'delete_file', args: { path: '/out/b.txt' } },
        { tool: 'after', args: {} },
      ],
    });
    expect(declinedResult.steps[0]!.result.ok).toBe(false);
    expect(declinedResult.steps[0]!.result.error).toContain('cancelada');
    expect(declinedResult.steps[1]!.result.ok).toBe(true);
    expect(deleted).toEqual(['/out/a.txt']);
  });
```

- [ ] **Step 2: Rodar para confirmar que falham**

Run: `pnpm --filter @atlas/core test create-atlas`
Expected: FAIL — `CreateAtlasDeps` ainda não tem `confirm?` (erro de tipo nos testes que passam `confirm: fakeConfirm(...)` em `deps`) e `createRuntime`/`registry.register` ainda não recebem/registram as Tools novas.

- [ ] **Step 3: Compor `confirm` + registrar as 3 Tools em `packages/core/src/index.ts`**

Substituir a linha 8 (`import { createRuntime } from '@atlas/runtime';`) por:

```ts
import { createRuntime, nodeReadlineConfirmPort, type ConfirmPort } from '@atlas/runtime';
```

Substituir o bloco de import de `@atlas/tools` (linhas 9-20) por:

```ts
import {
  createToolRegistry,
  createClockTool,
  createCalcTool,
  createReadFileTool,
  createListDirTool,
  createWriteFileTool,
  createDeleteFileTool,
  createMkdirTool,
  createAppendFileTool,
  nodeFsReadPort,
  nodeFsWritePort,
  type FsReadPort,
  type FsWritePort,
} from '@atlas/tools';
```

Em `CreateAtlasDeps` (bloco atual `fetch?`/`memoryStorage?`/`fsRead?`/`fsWrite?`), acrescentar `confirm?`:

```ts
export interface CreateAtlasDeps {
  fetch?: typeof fetch;
  memoryStorage?: MemoryStorage;
  fsRead?: FsReadPort;
  fsWrite?: FsWritePort;
  confirm?: ConfirmPort;
}
```

Após `const fsWrite = deps.fsWrite ?? nodeFsWritePort();`, acrescentar:

```ts
  const confirm = deps.confirm ?? nodeReadlineConfirmPort();
```

Após `registry.register(createWriteFileTool({ fs: fsWrite }));`, acrescentar:

```ts
  registry.register(createDeleteFileTool({ fs: fsWrite }));
  registry.register(createMkdirTool({ fs: fsWrite }));
  registry.register(createAppendFileTool({ fs: fsWrite }));
```

Substituir `const runtime = createRuntime({ registry, permissions });` por:

```ts
  const runtime = createRuntime({ registry, permissions, confirm });
```

- [ ] **Step 4: Rodar toda a suíte de core**

Run: `pnpm --filter @atlas/core test`
Expected: PASS. O registro de `delete_file`/`mkdir`/`append_file` no catálogo é coberto indiretamente: `Runtime` é interno a `createAtlas` (não exposto em `AtlasPlatform`, por design — ver `packages/core/CLAUDE.md`), então a prova de que a composição funciona é o próprio teste `'delete_file pede confirmação...'` (Step 1) rodando sem erro de tipo/runtime, mais os testes unitários de cada Tool em `@atlas/tools` (Task 2).

- [ ] **Step 5: Typecheck do workspace inteiro**

Run: `pnpm typecheck`
Expected: PASS (confirma que nenhum outro consumidor de `createRuntime`/`FsWritePort` ficou para trás).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/tests/create-atlas.test.ts
git commit -m "feat(core): compõe ConfirmPort default + registra delete_file/mkdir/append_file

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Verificação end-to-end + documentação

**Files:**
- Modify: `docs/06-adr/ADR-0013-permission-service-execution-gate.md`
- Modify: `CLAUDE.md` (raiz), `packages/permissions/CLAUDE.md`, `packages/tools/CLAUDE.md`, `packages/runtime/CLAUDE.md`, `packages/core/CLAUDE.md`
- Modify: `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`
- Modify: `docs/implementation/LESSONS_LEARNED.md`
- Modify: `docs/implementation/specs/SPEC-0013-confirm-flow-destructive-tools.md` (Status → `Review`)

- [ ] **Step 1: Suíte completa verde**

Run: `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: PASS em tudo. Anote o total de testes/arquivos (para o [NEXT_CONTEXT](../../05-context/NEXT_CONTEXT.md)).

- [ ] **Step 2: Verificação manual (fumaça) do fluxo `confirm` real**

Provider `fake` não produz plano estruturado real (ecoa o objetivo) — a garantia comportamental está nos testes unitários de `runtime`/`core`. O smoke aqui confirma só que a CLI sobe sem quebrar com o novo wiring:

Run: `pnpm --filter @atlas/cli exec tsx src/main.ts status`
Expected: saída normal (`readRoots`/`writeRoots`), sem erro — confirma que a composição de `confirm` no core não quebrou o boot.

- [ ] **Step 3: Nota de atualização no [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md)**

Acrescentar ao final do arquivo:

```markdown
---

# Atualização ([SPEC-0013](../implementation/specs/SPEC-0013-confirm-flow-destructive-tools.md))

A SPEC-0013 concretizou o veredicto `confirm`, reservado desde esta decisão e ainda não produzido pela SPEC-0012:

- **`confirm` passou de reservado a produzido.** `access: 'delete'` dentro de `writeRoots` agora produz `{ verdict: 'confirm' }` (não `allowed` direto) — a mesma contenção lexical fatorada (`within()`) usada por `read`/`write`. Fora de `writeRoots` (ou vazio) segue `blocked`, como as demais rotas.
- **O Runtime ganhou a única dependência nova desta fatia: `ConfirmPort`.** `createRuntime({ registry, permissions, confirm })` — ao encontrar veredicto `confirm`, aguarda `confirm.request(requirement)` antes de decidir: aprovado executa a Tool normalmente; recusado vira `ExecutedStep` negado com um motivo distinto de "bloqueado" (`'ação cancelada pelo usuário'`), sem rodar a Tool, e a execução **nunca lança** — o mesmo padrão de falha estruturada já usado para `blocked`.
- **`ConfirmPort` é interno ao Runtime**, no mesmo critério de placement do `FsReadPort`/`FsWritePort` (sem 2º consumidor real, não sobe a `@atlas/contracts`). A implementação real, `nodeReadlineConfirmPort()` sobre `node:readline`, **nunca trava**: `stdin` não-TTY ou que fecha (EOF) antes de uma resposta resolve como recusado.
- **Três Tools novas exercitam o vocabulário completo.** `delete_file` (`access: 'delete'`, a única desta fatia que apaga dado existente — por isso é a única que pede confirmação) e `mkdir`/`append_file` (`access: 'write'`, não destroem nada, seguem `allowed`/`blocked` como `write_file`).
- **Nada mudou no Permission Service além da rota nova**: continua puro e síncrono, sem IO — quem faz IO de terminal é o `ConfirmPort`, consultado pelo Runtime, nunca pelo `evaluate`.
- **`@atlas/cognitive` e a CLI não mudaram.** A pausa é interna a `runtime.execute()`, que `cognitive.ask()` já aguarda — transparente ao resto da orquestração (ADR-0012).
- Symlink/`realpath` seguem não seguidos (limitação conhecida, vale igual para `delete`); múltiplas raízes e contexto de ambiente seguem fora de escopo.
```

- [ ] **Step 4: Atualizar os `CLAUDE.md`**

- Raiz (`CLAUDE.md`): no parágrafo de estado, descrever o fluxo `confirm` real (`delete_file` pede confirmação via `ConfirmPort`; `mkdir`/`append_file` seguem `allowed`/`blocked` direto) em `@atlas/permissions`, `@atlas/tools`, `@atlas/runtime`, `@atlas/core`.
- `packages/permissions/CLAUDE.md`: `evaluate` roteia `delete` contra `writeRoots` produzindo `confirm` (não `allowed`); `read`/`write` inalterados.
- `packages/tools/CLAUDE.md`: acrescentar `createDeleteFileTool` (`delete_file`, `access: 'delete'`), `createMkdirTool` (`mkdir`, recursivo/idempotente), `createAppendFileTool` (`append_file`, cria se ausente) — todas via `FsWritePort` estendida.
- `packages/runtime/CLAUDE.md`: `RuntimeDeps` ganha `confirm: ConfirmPort`; veredicto `confirm` pausa e aguarda `confirm.request`; `nodeReadlineConfirmPort()` real, nunca trava.
- `packages/core/CLAUDE.md`: compõe `ConfirmPort` default (`nodeReadlineConfirmPort`), `CreateAtlasDeps.confirm?`, registra as 3 Tools novas.

- [ ] **Step 5: Atualizar contexto de sprint**

- `docs/05-context/CURRENT_SPRINT.md`: acrescentar a linha do SPEC-0013 (`Review`) na tabela.
- `docs/05-context/NEXT_CONTEXT.md`: novo bloco de Estado Imediato para SPEC-0013 (o que foi entregue: `confirm` real, `delete_file`/`mkdir`/`append_file`, `ConfirmPort`), total de testes atualizado, mover symlink/múltiplas raízes/contexto de ambiente/Skills para "próximo trabalho" (já estavam lá — só ajustar a redação para refletir que `confirm` deixou de ser candidata).

- [ ] **Step 6: Registrar lições em `docs/implementation/LESSONS_LEARNED.md`**

Acrescentar a seção da SPEC-0013 (obrigatório na DoD), cobrindo pelo menos: o vocabulário de 4 veredictos do Permission Service (desenhado desde o ADR-0013) levou 3 SPECs (0011→0012→0013) para ficar inteiramente em uso; `ConfirmPort` seguiu o mesmo critério de placement de `FsReadPort`/`FsWritePort` (port interno, real por default, injetável nos testes via parâmetros de stream em vez de um fake port inteiro — variação do padrão, já que o "real" é o que se testa aqui); o Runtime absorveu `confirm` sem que `@atlas/cognitive`/CLI precisassem mudar, repetindo a elegância observada na SPEC-0012.

- [ ] **Step 7: Marcar a SPEC como `Review`**

Em `docs/implementation/specs/SPEC-0013-confirm-flow-destructive-tools.md`, trocar `[x] Ready` → `[ ] Ready` e `[ ] Review` → `[x] Review`.

- [ ] **Step 8: Commit final da documentação**

```bash
git add docs/06-adr/ADR-0013-permission-service-execution-gate.md CLAUDE.md \
        packages/permissions/CLAUDE.md packages/tools/CLAUDE.md packages/runtime/CLAUDE.md \
        packages/core/CLAUDE.md docs/05-context/NEXT_CONTEXT.md docs/05-context/CURRENT_SPRINT.md \
        docs/implementation/LESSONS_LEARNED.md docs/implementation/specs/SPEC-0013-confirm-flow-destructive-tools.md
git commit -m "docs(runtime): ADR-0013 nota SPEC-0013, docs e lições (Review)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Ordem de commits**: Task 1 junta contratos (`AccessMode`) + Permission Service no mesmo commit (mesmo precedente do PLAN-0012) — contratos sozinhos não quebram nada aqui (só acrescentam um membro de union type), mas manter o padrão de commit por fatia coesa.
- **`FsWritePort` vira breaking change interno**: qualquer fake de `FsWritePort` nos testes existentes (`write-file.test.ts`, `create-atlas.test.ts`) precisa dos 4 métodos agora — o plano já cobre os dois arquivos afetados; se o typecheck apontar mais algum, é sinal de um fake esquecido.
- **`ConfirmPort` não é `FsReadPort`/`FsWritePort` clássico**: em vez de um "fake port" substituindo tudo, o teste do port real (`nodeReadlineConfirmPort`) injeta `input`/`output` (streams) para simular TTY/EOF sem tocar o `process.stdin` de verdade — variação deliberada do padrão, documentada no ADR e nas lições.
- **Runtime não é exposto em `AtlasPlatform`**: não crie um getter novo só para testar o registro das 3 Tools via `createAtlas` — os testes de `@atlas/tools` (Task 2) e o teste de composição com registry própria (Task 4) já bastam. Se sentir a tentação de expor `atlas.runtime`, **pare** — é mudança arquitetural fora de escopo.
- **Escopo**: se aparecer a tentação de `rmdir`, confirmação para `mkdir`/`append_file`, symlink hardening, múltiplas raízes, contexto de ambiente ou Tools/`confirm` em `atlas chat`, é fora de escopo (SPEC-0014+).
