# SPEC-0009 Memory Service (fatos/preferências explícitos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `@atlas/memory` (autoridade de conhecimento persistente — fatia mínima: fatos/preferências explícitos, persistidos em arquivo JSON atrás de uma porta injetável) e injetar esses fatos na geração do Cognitive Core, dando ao Atlas memória entre sessões, gerenciável por comandos de CLI.

**Architecture:** Fatos são **dados**. `createMemoryService({ storage })` carrega os fatos **uma vez** na criação (leitura síncrona via `list()`/`prompt()`) e persiste por **write-through** (`remember`/`forget` chamam `storage.save`). A persistência fica atrás de uma **porta injetável** `MemoryStorage` (interna a `@atlas/memory`), com `createFileMemoryStorage(path)` (JSON) como default e um fake em memória nos testes — mesmo padrão de `fetch` (Model Gateway) e `LineReader` (CLI). `@atlas/core` cria o serviço, injeta `memory.prompt()` no Cognitive como `memoryPrompt` (o Cognitive **não conhece o conceito de Memory**, estende ADR-0010) e expõe `atlas.memory`. A CLI ganha `remember`/`forget`/`memory list` e seleciona o arquivo por `--memory-path`/`ATLAS_MEMORY_PATH`. Memória (persistente) e Contexto (temporário) seguem conceitos distintos; `respond` permanece função pura.

**Tech Stack:** TypeScript 5.x (strict, NodeNext, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest, `tsx` (dev), `node:fs/promises`.

## Global Constraints

- Node ≥ 24, pnpm ≥ 11 via corepack. Diretório de trabalho: `/Users/lohanberg/Documents/Repos/Atlas` (todos os caminhos relativos a ele).
- **Um único package novo:** `@atlas/memory`. Não criar outros módulos.
- **Memória é a autoridade de persistência**, mas **não decide estratégia**, não controla o fluxo cognitivo, não chama o Model Gateway, não considera toda conversa como memória permanente (Module Catalog).
- **Memória (persistente) × Contexto (temporário)** permanecem conceitos distintos (Glossary/Constituição); esta SPEC não mistura os módulos.
- **Cognitive desacoplado do conceito de Memory:** recebe `memoryPrompt?: string` por parâmetro; nunca importa `@atlas/memory`. `respond` permanece **função pura**; o Cognitive segue sem estado.
- **IO de disco atrás da porta injetável** `MemoryStorage`; testes de unidade não tocam disco real (exceto o teste dedicado do file adapter e os testes de comando da CLI, ambos em `tmpdir` isolado — nunca no `~` real).
- `@atlas/memory` depende **apenas** de `@atlas/contracts`. Só `@atlas/core` importa implementações de packages (Regra de Dependência 11) — inclusive `@atlas/memory`. A **CLI não importa `@atlas/memory`** (isola disco por `--memory-path`, não por injeção de objeto).
- A porta `MemoryStorage` **não sobe** a `@atlas/contracts` (fica no package dono, como `HttpDeps` no Model Gateway). Só `Fact`/`MemoryService` sobem a contracts.
- Precedência de config `flags > env > arquivo > defaults` (ADR-0006; `arquivo` reservado). Caminho default via `os.homedir()` → `~/.atlas/memory.json`.
- Erro de memória: `AtlasError` com `code: 'ATLAS_MEMORY'`, via subclasse `MemoryError` (espelha `ModelGatewayError`/`ContextError`/`PersonaError`).
- Imports internos com sufixo `.js` (NodeNext). Sem path aliases. Sem `dist/`.
- `verbatimModuleSyntax`: `import type`/`export type` para tipos; `import`/`export` para valores.
- `exactOptionalPropertyTypes`: nunca atribuir `undefined` a propriedade opcional; construir objetos condicionalmente (spread condicional).
- `noUncheckedIndexedAccess`: acesso indexado retorna `T | undefined` — tratar explicitamente.
- Sem mocks de framework: dependências injetadas por parâmetro; stubs à mão (ADR-0004).
- `typescript` permanece pinado em `^5` (probe do TS 7 na última task).
- Commits: conventional commits em português; cada commit termina com o trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (usar dois `-m`).

---

### Task 1: Package `@atlas/memory` + contrato `Fact`/`MemoryService` + porta e adapter de storage

Define o contrato `Fact`/`MemoryService` em `@atlas/contracts` (inerte até a Task 3), cria o package `@atlas/memory` com a porta `MemoryStorage`, o adapter de arquivo JSON, `createMemoryService` (load-once + write-through + `prompt()`) e `MemoryError`, com testes usando um fake em memória (serviço) e `tmpdir` real (file adapter). Fecha verde de forma independente.

**Files:**
- Create: `packages/contracts/src/memory.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/memory/package.json`
- Create: `packages/memory/tsconfig.json`
- Create: `packages/memory/src/errors.ts`
- Create: `packages/memory/src/storage/memory-storage.ts`
- Create: `packages/memory/src/storage/file-storage.ts`
- Create: `packages/memory/src/memory-service.ts`
- Create: `packages/memory/src/index.ts`
- Test: `packages/memory/tests/memory-service.test.ts`
- Test: `packages/memory/tests/file-storage.test.ts`

**Interfaces:**
- Consumes: `AtlasError` de `@atlas/contracts`.
- Produces em `@atlas/contracts`: `Fact`, `MemoryService` (ver código).
- Produces em `@atlas/memory`: `createMemoryService(deps: MemoryServiceDeps): Promise<MemoryService>` (`MemoryServiceDeps = { storage: MemoryStorage }`); `createFileMemoryStorage(path: string): MemoryStorage`; `interface MemoryStorage { load(): Promise<readonly Fact[]>; save(facts: readonly Fact[]): Promise<void> }`; `class MemoryError extends AtlasError` (code `ATLAS_MEMORY`).

- [ ] **Step 1: Criar `packages/contracts/src/memory.ts`**

```ts
export interface Fact {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
}

export interface MemoryService {
  remember(text: string): Promise<Fact>;
  forget(id: string): Promise<boolean>;
  list(): readonly Fact[];
  prompt(): string | undefined;
}
```

- [ ] **Step 2: Exportar os tipos em `packages/contracts/src/index.ts`**

Adicionar, após a linha `export type { Persona, PersonaService } from './persona.js';`:

```ts
export type { Fact, MemoryService } from './memory.js';
```

- [ ] **Step 3: Criar `packages/memory/package.json`**

```json
{
  "name": "@atlas/memory",
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

- [ ] **Step 4: Criar `packages/memory/tsconfig.json`**

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

- [ ] **Step 5: Linkar o novo package no workspace**

Run: `pnpm install`
Expected: instala sem erro; `@atlas/memory` reconhecido (glob `packages/*`).

- [ ] **Step 6: Escrever o teste `packages/memory/tests/memory-service.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Fact } from '@atlas/contracts';
import type { MemoryStorage } from '../src/index.js';
import { createMemoryService } from '../src/index.js';

function fakeStorage(initial: Fact[] = []): MemoryStorage & { saved: Fact[][] } {
  let facts: Fact[] = [...initial];
  const saved: Fact[][] = [];
  return {
    saved,
    async load() {
      return [...facts];
    },
    async save(next) {
      facts = [...next];
      saved.push([...next]);
    },
  };
}

describe('createMemoryService', () => {
  it('carrega os fatos do storage na criação', async () => {
    const svc = await createMemoryService({
      storage: fakeStorage([{ id: 'a1', text: 'meu nome é Lohan', createdAt: '2026-01-01T00:00:00.000Z' }]),
    });
    expect(svc.list()).toHaveLength(1);
    expect(svc.list()[0]!.text).toBe('meu nome é Lohan');
  });

  it('remember gera um Fact e persiste via storage.save', async () => {
    const storage = fakeStorage();
    const svc = await createMemoryService({ storage });
    const fact = await svc.remember('prefiro respostas curtas');
    expect(fact.id).toMatch(/\S/);
    expect(fact.text).toBe('prefiro respostas curtas');
    expect(fact.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(svc.list()).toHaveLength(1);
    expect(storage.saved.at(-1)).toEqual([fact]);
  });

  it('forget remove o fato e retorna true; id inexistente retorna false', async () => {
    const storage = fakeStorage();
    const svc = await createMemoryService({ storage });
    const fact = await svc.remember('fato x');
    expect(await svc.forget('nao-existe')).toBe(false);
    expect(await svc.forget(fact.id)).toBe(true);
    expect(svc.list()).toHaveLength(0);
    expect(storage.saved.at(-1)).toEqual([]);
  });

  it('prompt retorna undefined quando vazio e enquadra os fatos quando há', async () => {
    const svc = await createMemoryService({ storage: fakeStorage() });
    expect(svc.prompt()).toBeUndefined();
    await svc.remember('meu nome é Lohan');
    await svc.remember('prefiro TypeScript');
    const prompt = svc.prompt();
    expect(prompt).toContain('meu nome é Lohan');
    expect(prompt).toContain('prefiro TypeScript');
  });

  it('list devolve uma cópia defensiva', async () => {
    const svc = await createMemoryService({ storage: fakeStorage() });
    const fact = await svc.remember('x');
    (svc.list() as Fact[]).pop();
    expect(svc.list()).toHaveLength(1);
    expect(svc.list()[0]!.id).toBe(fact.id);
  });
});
```

- [ ] **Step 7: Escrever o teste `packages/memory/tests/file-storage.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AtlasError } from '@atlas/contracts';
import { createFileMemoryStorage } from '../src/index.js';

async function tmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'atlas-mem-'));
}

describe('createFileMemoryStorage', () => {
  it('arquivo ausente → lista vazia', async () => {
    const dir = await tmpDir();
    const storage = createFileMemoryStorage(join(dir, 'memory.json'));
    expect(await storage.load()).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });

  it('save cria o diretório e persiste; load recarrega', async () => {
    const dir = await tmpDir();
    const path = join(dir, 'nested', 'memory.json');
    const storage = createFileMemoryStorage(path);
    const facts = [{ id: 'a1', text: 'x', createdAt: '2026-01-01T00:00:00.000Z' }];
    await storage.save(facts);
    expect(await storage.load()).toEqual(facts);
    await rm(dir, { recursive: true, force: true });
  });

  it('JSON inválido → AtlasError (ATLAS_MEMORY)', async () => {
    const dir = await tmpDir();
    const path = join(dir, 'memory.json');
    await writeFile(path, 'não é json', 'utf8');
    const storage = createFileMemoryStorage(path);
    await expect(storage.load()).rejects.toBeInstanceOf(AtlasError);
    await rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 8: Rodar os testes e confirmar que falham**

Run: `pnpm test -- packages/memory`
Expected: FAIL — `createMemoryService`/`createFileMemoryStorage` não existem / módulo não resolve.

- [ ] **Step 9: Criar `packages/memory/src/errors.ts`**

```ts
import { AtlasError } from '@atlas/contracts';

export class MemoryError extends AtlasError {
  constructor(message: string, options?: ErrorOptions) {
    super('ATLAS_MEMORY', message, options);
  }
}
```

- [ ] **Step 10: Criar `packages/memory/src/storage/memory-storage.ts`**

```ts
import type { Fact } from '@atlas/contracts';

export interface MemoryStorage {
  load(): Promise<readonly Fact[]>;
  save(facts: readonly Fact[]): Promise<void>;
}
```

- [ ] **Step 11: Criar `packages/memory/src/storage/file-storage.ts`**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Fact } from '@atlas/contracts';
import { MemoryError } from '../errors.js';
import type { MemoryStorage } from './memory-storage.js';

export function createFileMemoryStorage(path: string): MemoryStorage {
  return {
    async load(): Promise<readonly Fact[]> {
      let raw: string;
      try {
        raw = await readFile(path, 'utf8');
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw new MemoryError(`Falha ao ler a memória em ${path}`, { cause });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (cause) {
        throw new MemoryError(`Memória corrompida em ${path}: JSON inválido`, { cause });
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray((parsed as { facts?: unknown }).facts)
      ) {
        throw new MemoryError(`Memória corrompida em ${path}: formato inesperado`);
      }

      return (parsed as { facts: Fact[] }).facts;
    },

    async save(facts: readonly Fact[]): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify({ facts }, null, 2)}\n`, 'utf8');
    },
  };
}
```

- [ ] **Step 12: Criar `packages/memory/src/memory-service.ts`**

```ts
import type { Fact, MemoryService } from '@atlas/contracts';
import type { MemoryStorage } from './storage/memory-storage.js';

export interface MemoryServiceDeps {
  storage: MemoryStorage;
}

export async function createMemoryService(deps: MemoryServiceDeps): Promise<MemoryService> {
  const facts: Fact[] = [...(await deps.storage.load())];

  return {
    async remember(text: string): Promise<Fact> {
      const fact: Fact = {
        id: crypto.randomUUID().slice(0, 8),
        text,
        createdAt: new Date().toISOString(),
      };
      facts.push(fact);
      await deps.storage.save(facts);
      return fact;
    },

    async forget(id: string): Promise<boolean> {
      const index = facts.findIndex((fact) => fact.id === id);
      if (index === -1) {
        return false;
      }
      facts.splice(index, 1);
      await deps.storage.save(facts);
      return true;
    },

    list(): readonly Fact[] {
      return [...facts];
    },

    prompt(): string | undefined {
      if (facts.length === 0) {
        return undefined;
      }
      const lines = facts.map((fact) => `- ${fact.text}`);
      return `O usuário pediu para você lembrar os seguintes fatos e preferências:\n${lines.join('\n')}`;
    },
  };
}
```

- [ ] **Step 13: Criar `packages/memory/src/index.ts`**

```ts
export { createMemoryService } from './memory-service.js';
export type { MemoryServiceDeps } from './memory-service.js';
export { createFileMemoryStorage } from './storage/file-storage.js';
export type { MemoryStorage } from './storage/memory-storage.js';
export { MemoryError } from './errors.js';
```

- [ ] **Step 14: Rodar os testes e confirmar que passam**

Run: `pnpm test -- packages/memory`
Expected: PASS (8 testes verdes).

- [ ] **Step 15: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde. Se `format:check` reclamar dos novos arquivos, rode `pnpm format` e repita.

- [ ] **Step 16: Commit**

```bash
git add packages/contracts/src/memory.ts packages/contracts/src/index.ts packages/memory pnpm-lock.yaml
git commit -m "feat(memory): @atlas/memory store de fatos com porta de storage injetavel" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Cognitive Core compõe identidade + memória + tarefa (`memoryPrompt` injetado)

Faz o Cognitive Core compor um `memoryPrompt` (injetado, opcional) entre a identidade (Persona) e o enquadramento de tarefa. `respond` permanece puro. Atualiza os testes do package. Nenhum consumidor passa `memoryPrompt` ainda, então a suíte fecha.

**Files:**
- Modify: `packages/cognitive/src/cognitive-core.ts`
- Test: `packages/cognitive/tests/cognitive-core.test.ts`

**Interfaces:**
- Consumes: `Message`, `ModelGateway`, `CognitiveCore`, `Conversation`, `ConversationTurn` de `@atlas/contracts`.
- Produces: `CognitiveCoreDeps` ganha `memoryPrompt?: string`. Regra de composição: `system = [personaPrompt, memoryPrompt, TASK_FRAMING].filter(part => part !== undefined && part !== '').join('\n\n')` (ordem identidade → memória → tarefa).

- [ ] **Step 1: Adicionar os testes de memória em `packages/cognitive/tests/cognitive-core.test.ts`**

Adicionar, dentro do `describe('createCognitiveCore.ask', ...)`, após o teste `'com personaPrompt compõe identidade + tarefa no system message'`:

```ts
  it('com memoryPrompt inclui o bloco de memória entre identidade e tarefa', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({
      gateway,
      personaPrompt: 'Você é Jarvis.',
      memoryPrompt: 'Fatos: o nome do usuário é Lohan.',
    });

    await core.ask('oi');

    expect(calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: `Você é Jarvis.\n\nFatos: o nome do usuário é Lohan.\n\n${TASK_FRAMING}`,
    });
  });

  it('com memoryPrompt e sem personaPrompt compõe memória + tarefa', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({ gateway, memoryPrompt: 'Fatos: X.' });

    await core.ask('oi');

    expect(calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: `Fatos: X.\n\n${TASK_FRAMING}`,
    });
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `pnpm test -- packages/cognitive`
Expected: FAIL — `memoryPrompt` não é aceito nem composto (o system message não inclui o bloco de memória).

- [ ] **Step 3: Alterar `packages/cognitive/src/cognitive-core.ts`**

Substituir o bloco da interface `CognitiveCoreDeps` e da composição do `systemPrompt`. Trocar:

```ts
export interface CognitiveCoreDeps {
  gateway: ModelGateway;
  personaPrompt?: string;
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway, personaPrompt } = deps;
  const systemPrompt = personaPrompt ? `${personaPrompt}\n\n${TASK_FRAMING}` : TASK_FRAMING;
```

por:

```ts
export interface CognitiveCoreDeps {
  gateway: ModelGateway;
  personaPrompt?: string;
  memoryPrompt?: string;
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway, personaPrompt, memoryPrompt } = deps;
  const systemPrompt = [personaPrompt, memoryPrompt, TASK_FRAMING]
    .filter((part): part is string => part !== undefined && part !== '')
    .join('\n\n');
```

(O resto do arquivo permanece inalterado.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `pnpm test -- packages/cognitive`
Expected: PASS (os testes existentes de persona/tarefa continuam válidos — sem `memoryPrompt`, o resultado é idêntico).

- [ ] **Step 5: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde (o core ainda chama `createCognitiveCore` sem `memoryPrompt`, válido).

- [ ] **Step 6: Commit**

```bash
git add packages/cognitive/src/cognitive-core.ts packages/cognitive/tests/cognitive-core.test.ts
git commit -m "feat(cognitive): compoe memoryPrompt injetado entre identidade e tarefa" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Config `memory.path` + composição no `@atlas/core` (cria, injeta e expõe)

Adiciona `memory` a `AtlasConfig`/`AtlasConfigOverride` e a `AtlasPlatform`, valida/mescla em `loadConfig`, e faz `createAtlas` criar o Memory Service (adapter de arquivo por default, storage injetável para testes), injetar `memory.prompt()` no Cognitive e expor `atlas.memory`. As adições de campos obrigatórios e seus fornecimentos landam juntos (typecheck atômico).

**Files:**
- Modify: `packages/contracts/src/config.ts`
- Modify: `packages/contracts/src/platform.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/config/defaults.ts`
- Modify: `packages/core/src/config/load-config.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/load-config.test.ts`
- Test: `packages/core/tests/create-atlas.test.ts`
- Modify (mock): `apps/cli/tests/status.test.ts`

**Interfaces:**
- Consumes: `createMemoryService`, `createFileMemoryStorage`, `MemoryStorage` de `@atlas/memory`; `MemoryService` de `@atlas/contracts`.
- Produces: `AtlasConfig.memory: { readonly path: string }`; `AtlasConfigOverride.memory?: { path?: string }`; `AtlasPlatform.memory: MemoryService`; `CreateAtlasDeps.memoryStorage?: MemoryStorage`; `createAtlas` injeta `memoryPrompt` e expõe `atlas.memory`. `defaultConfig().memory.path` termina em `.atlas/memory.json`.

- [ ] **Step 1: Escrever os testes de config em `packages/core/tests/load-config.test.ts`**

Adicionar, dentro do `describe('loadConfig', ...)`, após o teste `'rejeita persona desconhecida'`:

```ts
  it('memory.path default termina em .atlas/memory.json', () => {
    expect(loadConfig().memory.path).toMatch(/[/\\]\.atlas[/\\]memory\.json$/);
  });

  it('aceita override de memory.path', () => {
    expect(loadConfig({ memory: { path: '/tmp/custom/mem.json' } }).memory.path).toBe(
      '/tmp/custom/mem.json',
    );
  });

  it('rejeita memory.path vazio', () => {
    expect(() => loadConfig({ memory: { path: '  ' } })).toThrow(InvalidConfigError);
  });
```

(Se `InvalidConfigError` ainda não estiver importado no arquivo, adicioná-lo ao import de `@atlas/contracts` no topo do teste.)

- [ ] **Step 2: Reescrever o teste de plataforma `packages/core/tests/create-atlas.test.ts`**

Substituir o arquivo inteiro por (injeta um `memoryStorage` fake em todas as chamadas que sobem a plataforma, mantendo os testes herméticos — sem tocar `~/.atlas`):

```ts
import { describe, expect, it } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import type { Fact } from '@atlas/contracts';
import type { MemoryStorage } from '@atlas/memory';
import { createAtlas } from '../src/index.js';

function fakeStorage(initial: Fact[] = []): MemoryStorage {
  let facts: Fact[] = [...initial];
  return {
    async load() {
      return [...facts];
    },
    async save(next) {
      facts = [...next];
    },
  };
}

describe('createAtlas', () => {
  it('sobe a plataforma até ready com config mesclada e congelada', async () => {
    const atlas = await createAtlas({ config: { logLevel: 'debug' } }, { memoryStorage: fakeStorage() });
    expect(atlas.state).toBe('ready');
    expect(atlas.config.logLevel).toBe('debug');
    expect(Object.isFrozen(atlas.config)).toBe(true);
    await atlas.shutdown();
  });

  it('desliga com segurança até stopped, com shutdown idempotente', async () => {
    const atlas = await createAtlas({}, { memoryStorage: fakeStorage() });
    await atlas.shutdown();
    expect(atlas.state).toBe('stopped');
    await expect(atlas.shutdown()).resolves.toBeUndefined();
  });

  it('propaga config inválida antes de subir', async () => {
    await expect(createAtlas({ config: { dataDir: '' } })).rejects.toBeInstanceOf(
      InvalidConfigError,
    );
  });

  it('expõe um cognitive que responde via provider fake', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    const answer = await atlas.cognitive.ask('olá');
    expect(answer).toBe('[fake] olá');
    await atlas.shutdown();
  });

  it('expõe um context que guarda e devolve a conversa da sessão', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    const initial = atlas.cognitive.startConversation();
    const id = atlas.context.openSession(initial);
    expect(atlas.context.getConversation(id)).toBe(initial);

    const turn = await atlas.cognitive.respond(atlas.context.getConversation(id), 'oi');
    atlas.context.updateConversation(id, turn.conversation);
    expect(atlas.context.getConversation(id)).toBe(turn.conversation);

    await atlas.shutdown();
  });

  it('expõe a Persona ativa (default jarvis) e injeta sua identidade no cognitive', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    expect(atlas.persona.id).toBe('jarvis');
    const conv = atlas.cognitive.startConversation();
    expect(conv.messages[0]!.content).toContain('Jarvis');
    await atlas.shutdown();
  });

  it('seleciona a persona neutral por config', async () => {
    const atlas = await createAtlas(
      { config: { persona: 'neutral', model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    expect(atlas.persona.id).toBe('neutral');
    expect(atlas.cognitive.startConversation().messages[0]!.content).toContain('Assistente');
    await atlas.shutdown();
  });

  it('expõe atlas.memory e injeta os fatos na geração do cognitive', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      {
        memoryStorage: fakeStorage([
          { id: 'a1', text: 'o nome do usuário é Lohan', createdAt: '2026-01-01T00:00:00.000Z' },
        ]),
      },
    );
    expect(atlas.memory.list()).toHaveLength(1);
    const conv = atlas.cognitive.startConversation();
    expect(conv.messages[0]!.content).toContain('o nome do usuário é Lohan');
    await atlas.shutdown();
  });

  it('sem fatos, não injeta bloco de memória no system prompt', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    const content = atlas.cognitive.startConversation().messages[0]!.content;
    expect(content).not.toContain('lembrar os seguintes fatos');
    await atlas.shutdown();
  });

  it('remember persiste via storage e passa a aparecer em list', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    await atlas.memory.remember('prefiro respostas curtas');
    expect(atlas.memory.list().map((fact) => fact.text)).toContain('prefiro respostas curtas');
    await atlas.shutdown();
  });
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `pnpm test -- packages/core`
Expected: FAIL — `memory` não existe em `AtlasConfig`/`AtlasPlatform`; `CreateAtlasDeps` não aceita `memoryStorage`; `loadConfig` não valida `memory.path`; `createAtlas` não expõe `memory`.

- [ ] **Step 4: Adicionar `memory` ao contrato de config em `packages/contracts/src/config.ts`**

Substituir o conteúdo inteiro por:

```ts
import type { ModelGatewayConfig } from './model.js';

export type LogLevel = 'silent' | 'error' | 'info' | 'debug';

export const LOG_LEVELS: readonly LogLevel[] = ['silent', 'error', 'info', 'debug'];

export interface AtlasConfig {
  readonly logLevel: LogLevel;
  readonly dataDir: string;
  readonly persona: string;
  readonly memory: { readonly path: string };
  readonly model: ModelGatewayConfig;
}

export interface AtlasConfigOverride {
  logLevel?: LogLevel;
  dataDir?: string;
  persona?: string;
  memory?: { path?: string };
  model?: Partial<ModelGatewayConfig>;
}
```

- [ ] **Step 5: Adicionar `memory` a `AtlasPlatform` em `packages/contracts/src/platform.ts`**

Substituir o conteúdo inteiro por:

```ts
import type { AtlasConfig } from './config.js';
import type { CognitiveCore } from './cognitive.js';
import type { ContextService } from './context.js';
import type { MemoryService } from './memory.js';
import type { Persona } from './persona.js';

export type LifecycleState = 'created' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface AtlasPlatform {
  readonly state: LifecycleState;
  readonly config: AtlasConfig;
  readonly persona: Persona;
  readonly cognitive: CognitiveCore;
  readonly context: ContextService;
  readonly memory: MemoryService;
  shutdown(): Promise<void>;
}
```

- [ ] **Step 6: Adicionar a dependência em `packages/core/package.json`**

No bloco `"dependencies"`, adicionar `"@atlas/memory": "workspace:*"` mantendo a ordem alfabética. Bloco resultante esperado:

```json
  "dependencies": {
    "@atlas/cognitive": "workspace:*",
    "@atlas/context": "workspace:*",
    "@atlas/contracts": "workspace:*",
    "@atlas/memory": "workspace:*",
    "@atlas/model-gateway": "workspace:*",
    "@atlas/persona": "workspace:*"
  }
```

- [ ] **Step 7: Relinkar o workspace**

Run: `pnpm install`
Expected: instala sem erro; `@atlas/core` passa a enxergar `@atlas/memory`.

- [ ] **Step 8: Adicionar o default em `packages/core/src/config/defaults.ts`**

Substituir o conteúdo inteiro por:

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AtlasConfig } from '@atlas/contracts';

export function defaultConfig(): AtlasConfig {
  return {
    logLevel: 'info',
    dataDir: join(homedir(), '.atlas'),
    persona: 'jarvis',
    memory: { path: join(homedir(), '.atlas', 'memory.json') },
    model: {
      provider: 'local',
      model: 'llama3.2',
    },
  };
}
```

- [ ] **Step 9: Mesclar/validar `memory` em `packages/core/src/config/load-config.ts`**

Adicionar a montagem de `memory` logo após a linha `const model: ModelGatewayConfig = { ...defaults.model, ...override.model };`:

```ts
  const memory = { path: override.memory?.path ?? defaults.memory.path };
```

No objeto `merged`, adicionar o campo `memory` após `persona`:

```ts
  const merged: AtlasConfig = {
    logLevel: override.logLevel ?? defaults.logLevel,
    dataDir: override.dataDir ?? defaults.dataDir,
    persona: override.persona ?? defaults.persona,
    memory,
    model,
  };
```

E adicionar a validação, após o bloco que valida `persona`:

```ts
  if (typeof memory.path !== 'string' || memory.path.trim() === '') {
    issues.push('memory.path deve ser uma string não vazia');
  }
```

- [ ] **Step 10: Compor o Memory Service em `packages/core/src/index.ts`**

Substituir o conteúdo inteiro por:

```ts
import type { AtlasConfigOverride, AtlasPlatform } from '@atlas/contracts';
import { createModelGateway } from '@atlas/model-gateway';
import { createCognitiveCore } from '@atlas/cognitive';
import { createContextService } from '@atlas/context';
import { createPersonaService } from '@atlas/persona';
import { createFileMemoryStorage, createMemoryService, type MemoryStorage } from '@atlas/memory';
import { loadConfig } from './config/load-config.js';
import { createLifecycle } from './lifecycle/lifecycle.js';

export interface CreateAtlasOptions {
  config?: AtlasConfigOverride;
}

export interface CreateAtlasDeps {
  fetch?: typeof fetch;
  memoryStorage?: MemoryStorage;
}

export async function createAtlas(
  options: CreateAtlasOptions = {},
  deps: CreateAtlasDeps = {},
): Promise<AtlasPlatform> {
  const config = loadConfig(options.config);
  const personaService = createPersonaService();
  const persona = personaService.get(config.persona);
  const storage = deps.memoryStorage ?? createFileMemoryStorage(config.memory.path);
  const memory = await createMemoryService({ storage });
  const memoryPrompt = memory.prompt();
  const gateway = createModelGateway(config.model, { fetch: deps.fetch ?? globalThis.fetch });
  const cognitive = createCognitiveCore({
    gateway,
    personaPrompt: personaService.systemPrompt(persona),
    ...(memoryPrompt !== undefined ? { memoryPrompt } : {}),
  });
  const context = createContextService();
  const lifecycle = createLifecycle();
  await lifecycle.start();

  return {
    get state() {
      return lifecycle.state;
    },
    config,
    persona,
    cognitive,
    context,
    memory,
    shutdown: () => lifecycle.shutdown(),
  };
}

export { defaultConfig } from './config/defaults.js';
export { loadConfig } from './config/load-config.js';
export { createLifecycle } from './lifecycle/lifecycle.js';
export type { Lifecycle, LifecycleHooks } from './lifecycle/lifecycle.js';
```

- [ ] **Step 11: Atualizar o mock de `AtlasPlatform` em `apps/cli/tests/status.test.ts`**

No literal `const atlas: AtlasPlatform = { ... }`, adicionar o campo `memory` logo após o bloco `context: { ... },`:

```ts
      memory: {
        remember: async () => ({ id: 'x', text: '', createdAt: '' }),
        forget: async () => false,
        list: () => [],
        prompt: () => undefined,
      },
```

- [ ] **Step 12: Rodar os testes e confirmar que passam**

Run: `pnpm test -- packages/core apps/cli/tests/status.test.ts`
Expected: PASS.

- [ ] **Step 13: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde.

- [ ] **Step 14: Commit**

```bash
git add packages/contracts/src/config.ts packages/contracts/src/platform.ts packages/core apps/cli/tests/status.test.ts pnpm-lock.yaml
git commit -m "feat(core): cria memory service, injeta fatos na geracao e expoe atlas.memory" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: CLI — comandos `remember`/`forget`/`memory list` + seleção do arquivo

Adiciona os comandos de gerenciamento de memória à CLI, a flag `--memory-path`/env `ATLAS_MEMORY_PATH` ao Input Gateway, o roteamento em `run.ts` e a ajuda. Os testes de integração exercitam o file adapter real via `tmpdir` isolado (a CLI não importa `@atlas/memory`).

**Files:**
- Modify: `apps/cli/src/gateway/input-gateway.ts`
- Modify: `apps/cli/src/run.ts`
- Create: `apps/cli/src/commands/remember.ts`
- Create: `apps/cli/src/commands/forget.ts`
- Create: `apps/cli/src/commands/memory.ts`
- Test: `apps/cli/tests/run.test.ts`

**Interfaces:**
- Consumes: `atlas.memory` (`AtlasPlatform`); `AtlasConfigOverride.memory`.
- Produces: comandos `remember` (`factText`), `forget` (`factId`), `memory` (list); `--memory-path <p>` e `ATLAS_MEMORY_PATH` → `configOverride.memory.path` (flag > env). `runRemember(atlas, text, output)`, `runForget(atlas, id, output)`, `runMemoryList(atlas, output)`.

- [ ] **Step 1: Escrever/atualizar os testes em `apps/cli/tests/run.test.ts`**

(a) Adicionar os imports no topo do arquivo, após a linha `import { run } from '../src/run.js';`:

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
```

(b) Adicionar o helper logo após a função `scriptedReader`:

```ts
async function tmpMemoryPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-cli-mem-'));
  return join(dir, 'memory.json');
}
```

(c) Adicionar os testes ao final do `describe`:

```ts
  it('remember grava um fato e memory list o mostra (persistido em disco)', async () => {
    const path = await tmpMemoryPath();
    const h1 = harness();
    const code1 = await run(
      ['remember', 'meu nome é Lohan', '--provider', 'fake', '--memory-path', path],
      {},
      h1.gateways,
      '0.1.0',
    );
    expect(code1).toBe(0);
    expect(h1.out()).toMatch(/^Lembrado \[[^\]]+\]: meu nome é Lohan\n$/);

    const h2 = harness();
    const code2 = await run(
      ['memory', 'list', '--provider', 'fake', '--memory-path', path],
      {},
      h2.gateways,
      '0.1.0',
    );
    expect(code2).toBe(0);
    expect(h2.out()).toContain('meu nome é Lohan');
  });

  it('forget remove um fato previamente lembrado', async () => {
    const path = await tmpMemoryPath();
    const h1 = harness();
    await run(
      ['remember', 'fato temporário', '--provider', 'fake', '--memory-path', path],
      {},
      h1.gateways,
      '0.1.0',
    );
    const id = h1.out().match(/^Lembrado \[([^\]]+)\]:/)![1]!;

    const h2 = harness();
    const code = await run(
      ['forget', id, '--provider', 'fake', '--memory-path', path],
      {},
      h2.gateways,
      '0.1.0',
    );
    expect(code).toBe(0);
    expect(h2.out()).toContain(`Esquecido [${id}]`);

    const h3 = harness();
    await run(
      ['memory', 'list', '--provider', 'fake', '--memory-path', path],
      {},
      h3.gateways,
      '0.1.0',
    );
    expect(h3.out()).toContain('Nenhum fato memorizado');
  });

  it('memory list vazio informa que não há fatos', async () => {
    const path = await tmpMemoryPath();
    const h = harness();
    const code = await run(
      ['memory', 'list', '--provider', 'fake', '--memory-path', path],
      {},
      h.gateways,
      '0.1.0',
    );
    expect(code).toBe(0);
    expect(h.out()).toContain('Nenhum fato memorizado');
  });

  it('remember sem fato retorna 2 e escreve o uso em stderr', async () => {
    const h = harness();
    const code = await run(['remember'], {}, h.gateways, '0.1.0');
    expect(code).toBe(2);
    expect(h.err()).toContain('fato');
  });

  it('forget de id inexistente informa e retorna 0', async () => {
    const path = await tmpMemoryPath();
    const h = harness();
    const code = await run(
      ['forget', 'zzzzzzzz', '--provider', 'fake', '--memory-path', path],
      {},
      h.gateways,
      '0.1.0',
    );
    expect(code).toBe(0);
    expect(h.out()).toContain('Nenhum fato com id zzzzzzzz');
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `pnpm test -- apps/cli`
Expected: FAIL — comandos `remember`/`forget`/`memory` desconhecidos; `--memory-path` não reconhecido.

- [ ] **Step 3: Adicionar comando/flag em `apps/cli/src/gateway/input-gateway.ts`**

(a) Na interface `ParsedInput`, trocar a linha do `command` e adicionar os campos, resultando em:

```ts
export interface ParsedInput {
  command: 'status' | 'help' | 'version' | 'ask' | 'chat' | 'remember' | 'forget' | 'memory';
  configOverride: AtlasConfigOverride;
  objective?: string;
  factText?: string;
  factId?: string;
}
```

(b) Na interface `CliValues`, adicionar após `persona?: string | undefined;`:

```ts
  'memory-path'?: string | undefined;
```

(c) Em `resolveConfigOverride`, montar o override de memory. Adicionar, imediatamente antes da linha `const model: Partial<ModelGatewayConfig> = {};`:

```ts
  let memoryPath: string | undefined;
  if (env.ATLAS_MEMORY_PATH !== undefined) {
    memoryPath = env.ATLAS_MEMORY_PATH;
  }
  if (values['memory-path'] !== undefined) {
    memoryPath = values['memory-path'];
  }
  if (memoryPath !== undefined) {
    override.memory = { path: memoryPath };
  }
```

(d) Em `parseArgvOrThrow`, no objeto `options`, adicionar após `persona: { type: 'string' },`:

```ts
        'memory-path': { type: 'string' },
```

(e) Em `createCliInputGateway().normalize`, adicionar o roteamento dos novos comandos imediatamente antes da linha `if (command === 'chat') {`:

```ts
      if (command === 'remember') {
        const text = positionals[1];
        if (text === undefined || text.trim() === '') {
          throw new CliUsageError('o comando "remember" exige um fato: atlas remember "<fato>"');
        }
        return { command: 'remember', configOverride: resolveConfigOverride(values, env), factText: text };
      }

      if (command === 'forget') {
        const id = positionals[1];
        if (id === undefined || id.trim() === '') {
          throw new CliUsageError('o comando "forget" exige um id: atlas forget <id>');
        }
        return { command: 'forget', configOverride: resolveConfigOverride(values, env), factId: id };
      }

      if (command === 'memory') {
        const sub = positionals[1];
        if (sub !== undefined && sub !== 'list') {
          throw new CliUsageError(`subcomando de memory desconhecido: ${sub} (use: atlas memory list)`);
        }
        return { command: 'memory', configOverride: resolveConfigOverride(values, env) };
      }
```

- [ ] **Step 4: Criar `apps/cli/src/commands/remember.ts`**

```ts
import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export async function runRemember(
  atlas: AtlasPlatform,
  text: string,
  output: OutputGateway,
): Promise<void> {
  const fact = await atlas.memory.remember(text);
  output.write(`Lembrado [${fact.id}]: ${fact.text}\n`);
}
```

- [ ] **Step 5: Criar `apps/cli/src/commands/forget.ts`**

```ts
import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export async function runForget(
  atlas: AtlasPlatform,
  id: string,
  output: OutputGateway,
): Promise<void> {
  const removed = await atlas.memory.forget(id);
  output.write(removed ? `Esquecido [${id}]\n` : `Nenhum fato com id ${id}\n`);
}
```

- [ ] **Step 6: Criar `apps/cli/src/commands/memory.ts`**

```ts
import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export function runMemoryList(atlas: AtlasPlatform, output: OutputGateway): void {
  const facts = atlas.memory.list();
  if (facts.length === 0) {
    output.write('Nenhum fato memorizado.\n');
    return;
  }
  const lines = facts.map((fact) => `[${fact.id}] ${fact.text} (${fact.createdAt})`);
  output.write(`${lines.join('\n')}\n`);
}
```

- [ ] **Step 7: Rotear os comandos e atualizar a ajuda em `apps/cli/src/run.ts`**

(a) Adicionar os imports, após a linha `import { runChat } from './commands/chat.js';`:

```ts
import { runRemember } from './commands/remember.js';
import { runForget } from './commands/forget.js';
import { runMemoryList } from './commands/memory.js';
```

(b) No `HELP_TEXT`, adicionar as linhas de comando após a linha do `chat`:

```
  remember "<fato>"    Grava um fato/preferência persistente
  forget <id>          Remove um fato memorizado
  memory list          Lista os fatos memorizados
```

E adicionar a linha da opção, após a linha `--persona <id>`:

```
      --memory-path <p> Caminho do arquivo de memória
```

(c) No bloco de dispatch dos comandos (dentro do `try` que sobe o `atlas`), substituir:

```ts
      if (parsed.command === 'ask') {
        await runAsk(atlas, parsed.objective ?? '', output);
      } else if (parsed.command === 'chat') {
        const lineReader = (deps.createLineReader ?? createReadlineLineReader)();
        try {
          await runChat(atlas, output, lineReader);
        } finally {
          lineReader.close();
        }
      } else {
        runStatus(atlas, output);
      }
```

por:

```ts
      if (parsed.command === 'ask') {
        await runAsk(atlas, parsed.objective ?? '', output);
      } else if (parsed.command === 'chat') {
        const lineReader = (deps.createLineReader ?? createReadlineLineReader)();
        try {
          await runChat(atlas, output, lineReader);
        } finally {
          lineReader.close();
        }
      } else if (parsed.command === 'remember') {
        await runRemember(atlas, parsed.factText ?? '', output);
      } else if (parsed.command === 'forget') {
        await runForget(atlas, parsed.factId ?? '', output);
      } else if (parsed.command === 'memory') {
        runMemoryList(atlas, output);
      } else {
        runStatus(atlas, output);
      }
```

- [ ] **Step 8: Rodar os testes e confirmar que passam**

Run: `pnpm test -- apps/cli`
Expected: PASS.

- [ ] **Step 9: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde.

- [ ] **Step 10: Commit**

```bash
git add apps/cli/src/gateway/input-gateway.ts apps/cli/src/run.ts apps/cli/src/commands/remember.ts apps/cli/src/commands/forget.ts apps/cli/src/commands/memory.ts apps/cli/tests/run.test.ts
git commit -m "feat(cli): comandos remember/forget/memory list e selecao do arquivo (--memory-path)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: ADR-0011, documentação, lições e probe do TS 7

Registra a decisão de persistência (ADR-0011), atualiza a documentação viva, registra lições, roda o probe do TS 7 e fecha a Definition of Done deixando a SPEC em `Review`.

**Files:**
- Create: `docs/06-adr/ADR-0011-memory-service-persistence.md`
- Create: `packages/memory/CLAUDE.md`
- Modify: `packages/cognitive/CLAUDE.md`
- Modify: `CLAUDE.md` (raiz — parágrafo de estado + Mapa + seção "ainda não criado")
- Modify: `docs/05-context/NEXT_CONTEXT.md`
- Modify: `docs/05-context/CURRENT_SPRINT.md`
- Modify: `implementation/LESSONS_LEARNED.md`
- Modify: `implementation/specs/SPEC-0009-memory-service.md` (Status → Review)

- [ ] **Step 1: Criar `docs/06-adr/ADR-0011-memory-service-persistence.md`**

```markdown
# ADR-0011 — Memory Service: persistência por porta injetável e memória injetada na geração

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-13

---

# Contexto

Até a SPEC-0008 a plataforma era **efêmera**: o Context Service (ADR-0009) guarda a conversa apenas durante a sessão, em memória. A Constituição (invariante 6) dá à Memória autoridade exclusiva sobre estado persistente, e o Module Catalog cataloga o Memory Service (`packages/memory`) como a única autoridade de conhecimento permanente. A SPEC-0009 introduz a menor fatia disso — fatos/preferências explícitos — e levanta duas perguntas: (a) **como persistir** sem acoplar o módulo ao disco e sem tocar disco nos testes de unidade; (b) **como a memória chega à resposta** sem tornar o Cognitive Core stateful nem acoplá-lo ao conceito de Memory.

---

# Decisão

**Persistência atrás de uma porta injetável.** O `MemoryService` recebe uma porta `MemoryStorage` (`load()`/`save()`) por parâmetro. O default é `createFileMemoryStorage(path)` (arquivo JSON: `{ facts: [...] }`, criado sob demanda; ausência de arquivo → lista vazia; JSON inválido → `MemoryError`, falhando alto para não descartar memória do usuário). Os testes injetam um fake em memória — nenhum IO real. É o mesmo padrão de `fetch` (Model Gateway) e `LineReader` (CLI): o efeito colateral fica atrás de uma porta, e a composição (`@atlas/core`) escolhe o adapter. A porta **não sobe** a `@atlas/contracts` (fica no package dono); só `Fact`/`MemoryService` são contrato público.

**Load-once + write-through.** `createMemoryService` carrega os fatos uma vez na criação (leitura síncrona via `list()`/`prompt()`); `remember`/`forget` mutam o estado em memória e persistem imediatamente (`storage.save`).

**Memória injetada na geração (estende ADR-0010).** O `MemoryService.prompt()` produz uma string enquadrando os fatos (ou `undefined` se vazio). O `@atlas/core` injeta esse texto no Cognitive como `memoryPrompt`; o system prompt passa a compor **identidade (Persona) → memória → tarefa (Cognitive)**. O Cognitive **não conhece o conceito de Memory** — recebe apenas uma string, como já ocorre com a Persona. `respond` permanece função pura.

**Leitura no startup.** Os fatos são lidos e injetados na criação da plataforma; a gravação é por comandos one-shot da CLI (`remember`/`forget`) — uma sessão `chat` já aberta não reflete gravações feitas durante ela. Aceito para esta fatia.

---

# Consequências

Positivas:

- Primeiro conhecimento persistente do Atlas, com valor visível ponta a ponta (o Atlas lembra entre sessões).
- Módulo testável sem disco; disco real só no teste do file adapter e nos testes de comando da CLI (ambos em `tmpdir`).
- Cognitive segue desacoplado (recebe string), sem estado; Memória × Contexto seguem distintos.

Custos e riscos:

- Leitura no startup: gravações não afetam sessões de chat já abertas (documentado; troca ao vivo é SPEC futura).
- Fatos entram no system prompt de toda geração — cresce o prompt conforme a memória cresce. Mitigado pelo escopo mínimo (fatos curtos); retenção/seleção/busca são SPECs futuras.

---

# Alternativas Consideradas

**Arquivo JSON direto no serviço (sem porta).** Simples, mas acopla o módulo ao disco e exige IO real (ou mocks de `fs`) nos testes — destoa do padrão do repo. Rejeitada.

**SQLite.** Índice/busca desde já, mas dependência nativa e complexidade cedo demais para uma lista de fatos (YAGNI). Rejeitada.

**Aprendizado automático (o Cognitive grava fatos sozinho).** Acoplaria Memory ao ciclo cognitivo (ainda colapsado) e exigiria decidir o que/quando lembrar. Rejeitada nesta fatia; gravação é explícita.

**Injetar a porta de storage pela CLI.** Faria a CLI depender de `@atlas/memory`. Rejeitada — a CLI isola disco nos testes por `--memory-path` (`tmpdir`), permanecendo acoplada só a `@atlas/contracts` e `@atlas/core`.
```

- [ ] **Step 2: Criar `packages/memory/CLAUDE.md`**

```markdown
# @atlas/memory

Memory Service (Support) — autoridade única de conhecimento persistente (ADR-0011).

- `createMemoryService({ storage }): Promise<MemoryService>` → `remember/forget/list/prompt`. Carrega os fatos **uma vez** na criação (leitura síncrona) e persiste por **write-through**.
- Fatia mínima (SPEC-0009): só **fatos/preferências explícitos** (`Fact = { id, text, createdAt }`). Sem episódica/projetos/busca/classificação/retenção/relações — SPECs futuras.
- Persistência atrás de uma **porta injetável** `MemoryStorage` (`load`/`save`), interna ao package: `createFileMemoryStorage(path)` (JSON) é o default; testes injetam um fake em memória (sem IO real). A porta **não sobe** a `@atlas/contracts`.
- `prompt()` enquadra os fatos para **injeção na geração** do Cognitive (ADR-0011, estende ADR-0010): o core passa `memory.prompt()` como `memoryPrompt`. O Cognitive não conhece o conceito de Memory.
- **Não** decide estratégia, **não** controla o fluxo cognitivo, **não** chama o Model Gateway, **não** considera toda conversa como memória permanente (Module Catalog).
- Memória (persistente) × Contexto (temporário) são distintos (Glossary). Depende só de `@atlas/contracts`. Erro: `MemoryError` (`AtlasError` code `ATLAS_MEMORY`).
```

- [ ] **Step 3: Atualizar `packages/cognitive/CLAUDE.md`**

READ o arquivo primeiro. Ajustar o bullet do system prompt composto: além de `personaPrompt` (identidade) + `TASK_FRAMING` (tarefa), o Cognitive agora compõe também um `memoryPrompt` (opcional, injetado por parâmetro) — ordem identidade → memória → tarefa; `system = [personaPrompt, memoryPrompt, TASK_FRAMING].filter(Boolean).join('\n\n')`. O Cognitive não conhece o conceito de Memory nem de Persona (recebe strings). Manter os demais bullets.

- [ ] **Step 4: Atualizar `CLAUDE.md` (raiz)**

- No parágrafo de estado, acrescentar `@atlas/memory` à lista de packages, com uma frase: "existe `@atlas/memory` (`createMemoryService({ storage })` → fatos/preferências persistentes atrás de uma porta de storage injetável, adapter JSON default; `memory.prompt()` é injetado na geração do Cognitive, ADR-0011; `atlas remember`/`atlas forget`/`atlas memory list` gerenciam; caminho por `--memory-path`/`ATLAS_MEMORY_PATH`, default `~/.atlas/memory.json`)". Registrar que o system prompt do Cognitive passou a compor identidade → memória → tarefa.
- Atualizar o "estado em julho/2026" citando a SPEC-0009 (Memory Service).
- Adicionar a linha do Memory Service e do ADR-0011 no Mapa da documentação.
- Na seção "Referenciado na documentação, mas ainda não criado", remover o Memory Service da lista implícita de packages do catálogo pendentes (o Memory agora existe).

- [ ] **Step 5: Atualizar `docs/05-context/NEXT_CONTEXT.md`**

- Mover a SPEC-0009 para o "Estado Imediato" como `Review`, descrevendo a entrega (`@atlas/memory`, porta injetável + adapter JSON, `memory.prompt()` injetado, `atlas.memory`, comandos CLI `remember`/`forget`/`memory list`, `--memory-path`/`ATLAS_MEMORY_PATH`, ADR-0011; Cognitive compõe identidade → memória → tarefa; Memória × Contexto distintos).
- Atualizar a contagem de testes após a suíte (Step 7) e o resultado do probe do TS 7 (Step 6) nas Pendências.
- Atualizar o "Mapa Rápido" com o Memory Service e o ADR-0011.
- Trocar a seção "Próximo Trabalho" para SPEC-0010 (a definir), removendo a fatia entregue do Memory Service das candidatas e mantendo as demais (Planner/Runtime, demais fatias do Memory — episódica/projetos/busca/retenção, aprendizado automático, troca ao vivo de memória no chat, contexto de ambiente, provedor Anthropic, config por arquivo, distribuição da CLI).

- [ ] **Step 6: Atualizar `docs/05-context/CURRENT_SPRINT.md`**

Adicionar a linha `| SPEC-0009 | Memory Service (fatos explícitos) | Review |` na tabela, no mesmo formato das demais.

- [ ] **Step 7: Probe do TypeScript 7**

Run: `pnpm add -Dw typescript@^7 && pnpm lint`
- Se **passar**: manter e anotar em `NEXT_CONTEXT.md`/`LESSONS_LEARNED.md` a adoção do TS 7.
- Se **falhar** (esperado, como nos 5 probes anteriores): reverter com `pnpm add -Dw typescript@^5` e registrar o probe falho na data de hoje (2026-07-13). Ao final, `typescript` deve estar em `^5` com a suíte verde.

- [ ] **Step 8: Registrar lições e rodar a Definition of Done**

Adicionar em `implementation/LESSONS_LEARNED.md` uma seção da SPEC-0009 cobrindo: (a) primeiro efeito de disco com porta injetável (`MemoryStorage`) + adapter de arquivo — testes de unidade sem disco, disco real só no file adapter e nos comandos da CLI (`tmpdir`) — ADR-0011; (b) memória injetada na geração estendendo o ADR-0010 (composição identidade → memória → tarefa; Cognitive segue desacoplado, recebe string); (c) `createMemoryService` assíncrono (load-once) integrado ao `createAtlas` já assíncrono; (d) CLI isolando disco por `--memory-path` (`tmpdir`) em vez de importar `@atlas/memory` (mantém a app acoplada só a contracts+core); (e) config aninhada `memory.path` com merge campo-a-campo e `exactOptionalPropertyTypes`; (f) resultado do probe do TS 7 (sexto probe).

Run (verificação final): `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde. Anotar a contagem final de testes no NEXT_CONTEXT.

- [ ] **Step 9: Marcar a SPEC como Review**

Em `implementation/specs/SPEC-0009-memory-service.md`, mudar o Status para `Review` (marcar `[x] Review`, desmarcar `[x] Draft`).

- [ ] **Step 10: Commit**

```bash
git add docs/ packages/memory/CLAUDE.md packages/cognitive/CLAUDE.md CLAUDE.md implementation/LESSONS_LEARNED.md implementation/specs/SPEC-0009-memory-service.md package.json pnpm-lock.yaml
git commit -m "docs(memory): ADR-0011, documentacao e licoes da SPEC-0009 (Review)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Ordem de gates:** cada task termina verde na suíte inteira (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`), permitindo review entre tasks.
- **`pnpm test -- <path>`** roda um subconjunto (vitest); a verificação de fechamento de cada task usa a suíte inteira.
- **Testes de disco** (file adapter e comandos da CLI) usam sempre `mkdtemp` em `os.tmpdir()` — nunca o `~/.atlas` real. Os demais testes injetam storage fake.
- **Se o executor de comandos do harness ficar indisponível**, o usuário pode rodar as verificações com o prefixo `!`.
- **RTK mascara saída/erros**; para ver o completo use `rtk proxy <cmd>` (log em `~/Library/Application Support/rtk/tee/`).
- **`Done` só após aprovação humana** do review (processo do projeto): esta implementação para em `Review`.
```