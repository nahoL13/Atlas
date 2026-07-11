# SPEC-0002 Core Bootstrap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `@atlas/contracts` (contratos públicos) e `@atlas/core` (Configuration Service, Lifecycle Manager e composition root `createAtlas()`), com TDD por comportamento.

**Architecture:** Contracts = tipos puros + classes de erro estruturado (único runtime permitido). Core = factory functions com dependências explícitas (ADR-0004), composto pelo `createAtlas()` (ADR-0003). Sem `dist/`: exports apontam para `./src/index.ts`.

**Tech Stack:** TypeScript 5.9 strict (NodeNext/ESM), Vitest 4, pnpm workspace.

## Global Constraints

- NENHUMA dependência de runtime nova; `@atlas/contracts` não depende de nada; `@atlas/core` depende apenas de `@atlas/contracts: workspace:*`.
- Imports entre packages exclusivamente via `@atlas/*`; sem path aliases (Regra mecânica v2.1). Dentro de um package, imports relativos com sufixo `.js` (ESM NodeNext).
- Não criar Event Bus, Plugin Manager nem qualquer serviço fora do escopo da SPEC-0002.
- devDependencies permanecem centralizadas na raiz; os scripts dos packages usam os binários da raiz (pnpm adiciona o `.bin` do root ao PATH).
- Mensagens de commit: conventional commits em português; todo commit com segundo `-m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`.
- Diretório de trabalho: `/Users/lohanberg/Documents/Repos/Atlas`.

---

### Task 1: Package @atlas/contracts + infra de testes do workspace

**Files:**
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/{config,platform,errors,index}.ts`, `packages/contracts/CLAUDE.md`, `packages/contracts/README.md`
- Modify: `vitest.config.ts` (glob de packages), `package.json` raiz (typecheck agregado)
- Test: `packages/contracts/tests/errors.test.ts`

**Interfaces:**
- Consumes: fundação da SPEC-0001.
- Produces: `@atlas/contracts` exportando `LifecycleState`, `AtlasPlatform`, `LogLevel`, `LOG_LEVELS`, `AtlasConfig`, `AtlasError`, `InvalidConfigError`, `LifecycleError` — os nomes exatos que as Tasks 2–4 importam.

- [ ] **Step 1: Ajustar a infra raiz (vitest + typecheck) para enxergar packages**

`vitest.config.ts` (conteúdo completo):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts'],
  },
});
```

No `package.json` raiz, substituir a linha do script `typecheck` por:

```json
    "typecheck": "tsc -p tsconfig.json && pnpm -r --if-present typecheck",
```

- [ ] **Step 2: Criar o esqueleto do package**

`packages/contracts/package.json`:

```json
{
  "name": "@atlas/contracts",
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
  }
}
```

`packages/contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": []
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Escrever o teste dos erros (antes da implementação)**

`packages/contracts/tests/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AtlasError, InvalidConfigError, LifecycleError } from '../src/index.js';

describe('erros estruturados', () => {
  it('AtlasError carrega code, name e message', () => {
    const error = new AtlasError('ATLAS_TEST', 'mensagem de teste');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('ATLAS_TEST');
    expect(error.name).toBe('AtlasError');
    expect(error.message).toBe('mensagem de teste');
  });

  it('InvalidConfigError acumula issues e herda de AtlasError', () => {
    const error = new InvalidConfigError(['logLevel inválido', 'dataDir vazio']);
    expect(error).toBeInstanceOf(AtlasError);
    expect(error.code).toBe('ATLAS_INVALID_CONFIG');
    expect(error.issues).toEqual(['logLevel inválido', 'dataDir vazio']);
    expect(error.message).toContain('logLevel inválido');
  });

  it('LifecycleError registra a transição rejeitada', () => {
    const error = new LifecycleError('stopped', 'ready');
    expect(error).toBeInstanceOf(AtlasError);
    expect(error.code).toBe('ATLAS_INVALID_TRANSITION');
    expect(error.from).toBe('stopped');
    expect(error.to).toBe('ready');
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm test`
Expected: FALHA — `errors.test.ts` não resolve `../src/index.js` (arquivos inexistentes).

- [ ] **Step 5: Implementar os contratos**

`packages/contracts/src/config.ts`:

```ts
export type LogLevel = 'silent' | 'error' | 'info' | 'debug';

export const LOG_LEVELS: readonly LogLevel[] = ['silent', 'error', 'info', 'debug'];

export interface AtlasConfig {
  readonly logLevel: LogLevel;
  readonly dataDir: string;
}
```

`packages/contracts/src/platform.ts`:

```ts
import type { AtlasConfig } from './config.js';

export type LifecycleState = 'created' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface AtlasPlatform {
  readonly state: LifecycleState;
  readonly config: AtlasConfig;
  shutdown(): Promise<void>;
}
```

`packages/contracts/src/errors.ts`:

```ts
import type { LifecycleState } from './platform.js';

export class AtlasError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidConfigError extends AtlasError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('ATLAS_INVALID_CONFIG', `Configuração inválida: ${issues.join('; ')}`);
    this.issues = issues;
  }
}

export class LifecycleError extends AtlasError {
  readonly from: LifecycleState;
  readonly to: LifecycleState;

  constructor(from: LifecycleState, to: LifecycleState) {
    super('ATLAS_INVALID_TRANSITION', `Transição de lifecycle inválida: ${from} → ${to}`);
    this.from = from;
    this.to = to;
  }
}
```

`packages/contracts/src/index.ts`:

```ts
export type { AtlasConfig, LogLevel } from './config.js';
export { LOG_LEVELS } from './config.js';
export type { AtlasPlatform, LifecycleState } from './platform.js';
export { AtlasError, InvalidConfigError, LifecycleError } from './errors.js';
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm test`
Expected: 2 arquivos de teste, todos verdes (smoke da raiz + erros do contracts).

Run: `pnpm typecheck`
Expected: exit 0 (raiz + contracts via `-r`).

- [ ] **Step 7: Documentação local do package**

`packages/contracts/CLAUDE.md`:

```markdown
# @atlas/contracts

Contratos públicos compartilhados entre packages: tipos, interfaces e erros estruturados.

- **Nenhuma dependência** — nem de runtime, nem de outros packages.
- Runtime permitido: apenas classes de erro e constantes triviais (ex.: `LOG_LEVELS`).
- Um contrato só entra aqui quando um segundo package precisa dele; até lá vive no package dono (regra do Project Structure).
- Antes de alterar um contrato, verifique todos os consumidores: `git grep '@atlas/contracts'`.
```

`packages/contracts/README.md`:

```markdown
# @atlas/contracts

Contratos públicos da plataforma Atlas: `AtlasPlatform`, `AtlasConfig`, estados de lifecycle e erros estruturados.

Sem implementações — consulte `@atlas/core` para a plataforma executável.
```

- [ ] **Step 8: Lint, formato e commit**

Run: `pnpm lint && pnpm format:check`
Expected: ambos exit 0 (se `format:check` acusar, rodar `pnpm format` e repetir).

```bash
git add -A
git commit -m "feat: adiciona @atlas/contracts com contratos da plataforma" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Configuration Service no @atlas/core

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/config/defaults.ts`, `packages/core/src/config/load-config.ts`, `packages/core/src/index.ts` (parcial), `packages/core/CLAUDE.md`, `packages/core/README.md`
- Test: `packages/core/tests/load-config.test.ts`

**Interfaces:**
- Consumes: `AtlasConfig`, `LOG_LEVELS`, `InvalidConfigError` de `@atlas/contracts`.
- Produces: `defaultConfig(): AtlasConfig` e `loadConfig(override?: Partial<AtlasConfig>): AtlasConfig` — consumidos pela Task 4.

- [ ] **Step 1: Esqueleto do package core**

`packages/core/package.json`:

```json
{
  "name": "@atlas/core",
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

`packages/core/tsconfig.json`:

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

Run: `pnpm install`
Expected: link do workspace criado (`@atlas/contracts` resolvido localmente).

- [ ] **Step 2: Escrever o teste do loadConfig (antes da implementação)**

`packages/core/tests/load-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { InvalidConfigError, type AtlasConfig } from '@atlas/contracts';
import { defaultConfig, loadConfig } from '../src/index.js';

describe('loadConfig', () => {
  it('sem override retorna os defaults', () => {
    const config = loadConfig();
    expect(config).toEqual(defaultConfig());
    expect(config.logLevel).toBe('info');
    expect(config.dataDir.endsWith('.atlas')).toBe(true);
  });

  it('mescla override parcial preservando os demais defaults', () => {
    const config = loadConfig({ logLevel: 'debug' });
    expect(config.logLevel).toBe('debug');
    expect(config.dataDir).toBe(defaultConfig().dataDir);
  });

  it('congela a configuração resultante', () => {
    expect(Object.isFrozen(loadConfig())).toBe(true);
  });

  it('rejeita logLevel desconhecido', () => {
    expect(() => loadConfig({ logLevel: 'verbose' as AtlasConfig['logLevel'] })).toThrow(
      InvalidConfigError,
    );
  });

  it('rejeita dataDir vazio', () => {
    expect(() => loadConfig({ dataDir: '  ' })).toThrow(InvalidConfigError);
  });

  it('acumula todas as issues em um único erro', () => {
    try {
      loadConfig({ logLevel: 'nope' as AtlasConfig['logLevel'], dataDir: '' });
      expect.unreachable('deveria ter lançado InvalidConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConfigError);
      expect((error as InvalidConfigError).issues).toHaveLength(2);
    }
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test`
Expected: FALHA — `../src/index.js` inexistente no core.

- [ ] **Step 4: Implementar o Configuration Service**

`packages/core/src/config/defaults.ts`:

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AtlasConfig } from '@atlas/contracts';

export function defaultConfig(): AtlasConfig {
  return {
    logLevel: 'info',
    dataDir: join(homedir(), '.atlas'),
  };
}
```

`packages/core/src/config/load-config.ts`:

```ts
import { InvalidConfigError, LOG_LEVELS, type AtlasConfig } from '@atlas/contracts';
import { defaultConfig } from './defaults.js';

export function loadConfig(override: Partial<AtlasConfig> = {}): AtlasConfig {
  const merged: AtlasConfig = { ...defaultConfig(), ...override };
  const issues: string[] = [];

  if (!LOG_LEVELS.includes(merged.logLevel)) {
    issues.push(
      `logLevel deve ser um de: ${LOG_LEVELS.join(', ')} (recebido: ${String(merged.logLevel)})`,
    );
  }

  if (typeof merged.dataDir !== 'string' || merged.dataDir.trim() === '') {
    issues.push('dataDir deve ser uma string não vazia');
  }

  if (issues.length > 0) {
    throw new InvalidConfigError(issues);
  }

  return Object.freeze(merged);
}
```

`packages/core/src/index.ts` (versão desta task — cresce nas Tasks 3 e 4):

```ts
export { defaultConfig } from './config/defaults.js';
export { loadConfig } from './config/load-config.js';
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test && pnpm typecheck`
Expected: 3 arquivos de teste verdes; typecheck exit 0.

- [ ] **Step 6: Documentação local do package**

`packages/core/CLAUDE.md`:

```markdown
# @atlas/core

Composition root da plataforma (ADR-0003) + Configuration Service + Lifecycle Manager.

- Único package autorizado a importar implementações de outros packages, exclusivamente para composição (Regra de Dependência 11).
- Não deve conter lógica de domínio — apenas wiring, ciclo de vida e configuração.
- Composição manual por factory functions (ADR-0004): dependências explícitas por parâmetro; sem container de DI.
- Estados de lifecycle e config são contrato público: mudanças exigem atualizar `@atlas/contracts` e verificar consumidores.
```

`packages/core/README.md`:

```markdown
# @atlas/core

Plataforma mínima do Atlas: configuração validada e ciclo de vida.

```ts
import { createAtlas } from '@atlas/core';

const atlas = await createAtlas({ config: { logLevel: 'debug' } });
console.log(atlas.state); // 'ready'
await atlas.shutdown();
```
```

- [ ] **Step 7: Lint, formato e commit**

Run: `pnpm lint && pnpm format:check`
Expected: ambos exit 0.

```bash
git add -A
git commit -m "feat: adiciona configuration service ao @atlas/core" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Lifecycle Manager no @atlas/core

**Files:**
- Create: `packages/core/src/lifecycle/lifecycle.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/lifecycle.test.ts`

**Interfaces:**
- Consumes: `LifecycleState`, `LifecycleError` de `@atlas/contracts`.
- Produces: `createLifecycle(hooks?: LifecycleHooks): Lifecycle`, com `Lifecycle { state; start(); shutdown() }` e `LifecycleHooks { onStart?; onShutdown? }` — consumidos pela Task 4. Os hooks são a costura para futura ativação de componentes ("ativação de componentes" no ModuleCatalog) e tornam o estado `failed` alcançável.

- [ ] **Step 1: Escrever o teste do lifecycle (antes da implementação)**

`packages/core/tests/lifecycle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LifecycleError } from '@atlas/contracts';
import { createLifecycle } from '../src/index.js';

describe('createLifecycle', () => {
  it('percorre o caminho feliz: created → ready → stopped', async () => {
    const lifecycle = createLifecycle();
    expect(lifecycle.state).toBe('created');
    await lifecycle.start();
    expect(lifecycle.state).toBe('ready');
    await lifecycle.shutdown();
    expect(lifecycle.state).toBe('stopped');
  });

  it('executa hooks de start e shutdown na ordem', async () => {
    const calls: string[] = [];
    const lifecycle = createLifecycle({
      onStart: () => {
        calls.push('start');
      },
      onShutdown: () => {
        calls.push('shutdown');
      },
    });
    await lifecycle.start();
    await lifecycle.shutdown();
    expect(calls).toEqual(['start', 'shutdown']);
  });

  it('rejeita start duplicado', async () => {
    const lifecycle = createLifecycle();
    await lifecycle.start();
    await expect(lifecycle.start()).rejects.toBeInstanceOf(LifecycleError);
  });

  it('rejeita shutdown antes do start', async () => {
    const lifecycle = createLifecycle();
    await expect(lifecycle.shutdown()).rejects.toBeInstanceOf(LifecycleError);
  });

  it('shutdown é idempotente após stopped', async () => {
    const lifecycle = createLifecycle();
    await lifecycle.start();
    await lifecycle.shutdown();
    await expect(lifecycle.shutdown()).resolves.toBeUndefined();
    expect(lifecycle.state).toBe('stopped');
  });

  it('start que falha leva a failed e permite shutdown de limpeza', async () => {
    const lifecycle = createLifecycle({
      onStart: () => {
        throw new Error('boom');
      },
    });
    await expect(lifecycle.start()).rejects.toThrow('boom');
    expect(lifecycle.state).toBe('failed');
    await lifecycle.shutdown();
    expect(lifecycle.state).toBe('stopped');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test`
Expected: FALHA — `createLifecycle` não exportado.

- [ ] **Step 3: Implementar o Lifecycle Manager**

`packages/core/src/lifecycle/lifecycle.ts`:

```ts
import { LifecycleError, type LifecycleState } from '@atlas/contracts';

export interface Lifecycle {
  readonly state: LifecycleState;
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface LifecycleHooks {
  onStart?: () => Promise<void> | void;
  onShutdown?: () => Promise<void> | void;
}

export function createLifecycle(hooks: LifecycleHooks = {}): Lifecycle {
  let state: LifecycleState = 'created';

  return {
    get state() {
      return state;
    },

    async start() {
      if (state !== 'created') {
        throw new LifecycleError(state, 'starting');
      }
      state = 'starting';
      try {
        await hooks.onStart?.();
        state = 'ready';
      } catch (cause) {
        state = 'failed';
        throw cause;
      }
    },

    async shutdown() {
      if (state === 'stopped') {
        return;
      }
      if (state !== 'ready' && state !== 'failed') {
        throw new LifecycleError(state, 'stopping');
      }
      state = 'stopping';
      await hooks.onShutdown?.();
      state = 'stopped';
    },
  };
}
```

Em `packages/core/src/index.ts`, adicionar ao final:

```ts
export { createLifecycle } from './lifecycle/lifecycle.js';
export type { Lifecycle, LifecycleHooks } from './lifecycle/lifecycle.js';
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test && pnpm typecheck`
Expected: 4 arquivos de teste verdes; typecheck exit 0.

- [ ] **Step 5: Lint e commit**

Run: `pnpm lint && pnpm format:check`
Expected: ambos exit 0.

```bash
git add -A
git commit -m "feat: adiciona lifecycle manager ao @atlas/core" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Composition root createAtlas()

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/create-atlas.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 2), `createLifecycle` (Task 3), `AtlasPlatform` de `@atlas/contracts`.
- Produces: `createAtlas(options?: CreateAtlasOptions): Promise<AtlasPlatform>` e `CreateAtlasOptions { config?: Partial<AtlasConfig> }` — a superfície que a SPEC-0003 (CLI) consumirá.

- [ ] **Step 1: Escrever o teste do createAtlas (antes da implementação)**

`packages/core/tests/create-atlas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import { createAtlas } from '../src/index.js';

describe('createAtlas', () => {
  it('sobe a plataforma até ready com config mesclada e congelada', async () => {
    const atlas = await createAtlas({ config: { logLevel: 'debug' } });
    expect(atlas.state).toBe('ready');
    expect(atlas.config.logLevel).toBe('debug');
    expect(Object.isFrozen(atlas.config)).toBe(true);
    await atlas.shutdown();
  });

  it('desliga com segurança até stopped, com shutdown idempotente', async () => {
    const atlas = await createAtlas();
    await atlas.shutdown();
    expect(atlas.state).toBe('stopped');
    await expect(atlas.shutdown()).resolves.toBeUndefined();
  });

  it('propaga config inválida antes de subir', async () => {
    await expect(createAtlas({ config: { dataDir: '' } })).rejects.toBeInstanceOf(
      InvalidConfigError,
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test`
Expected: FALHA — `createAtlas` não exportado.

- [ ] **Step 3: Implementar o composition root**

`packages/core/src/index.ts` (conteúdo completo final):

```ts
import type { AtlasConfig, AtlasPlatform } from '@atlas/contracts';
import { loadConfig } from './config/load-config.js';
import { createLifecycle } from './lifecycle/lifecycle.js';

export interface CreateAtlasOptions {
  config?: Partial<AtlasConfig>;
}

export async function createAtlas(options: CreateAtlasOptions = {}): Promise<AtlasPlatform> {
  const config = loadConfig(options.config);
  const lifecycle = createLifecycle();
  await lifecycle.start();

  return {
    get state() {
      return lifecycle.state;
    },
    config,
    shutdown: () => lifecycle.shutdown(),
  };
}

export { defaultConfig } from './config/defaults.js';
export { loadConfig } from './config/load-config.js';
export { createLifecycle } from './lifecycle/lifecycle.js';
export type { Lifecycle, LifecycleHooks } from './lifecycle/lifecycle.js';
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test && pnpm typecheck`
Expected: 5 arquivos de teste verdes (smoke, errors, load-config, lifecycle, create-atlas); typecheck exit 0.

- [ ] **Step 5: Lint e commit**

Run: `pnpm lint && pnpm format:check`
Expected: ambos exit 0.

```bash
git add -A
git commit -m "feat: adiciona composition root createAtlas" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Probe do TS7, documentação, lições e verificação final

**Files:**
- Modify: `CLAUDE.md`, `implementation/LESSONS_LEARNED.md`, `implementation/specs/SPEC-0002-core-bootstrap.md`
- Modify (condicional): `package.json` raiz + `pnpm-lock.yaml` (probe do TS7)

**Interfaces:**
- Consumes: suíte completa verde das Tasks 1–4.
- Produces: documentação consistente; SPEC em Review; encaminhamento das lições da SPEC-0001 cumprido.

- [ ] **Step 1: Probe do TS7 (encaminhamento das lições da SPEC-0001)**

Run: `pnpm add -Dw typescript@^7 && pnpm lint && pnpm typecheck && pnpm test`

Se TODOS passarem: manter o TS7, remover a nota de pin do `CLAUDE.md` e registrar o sucesso nas lições.

Se QUALQUER um falhar: reverter com `pnpm add -Dw typescript@^5`, confirmar `pnpm lint && pnpm typecheck && pnpm test` verdes de novo, e registrar nas lições que o suporte ainda não chegou.

- [ ] **Step 2: Atualizar o estado no `CLAUDE.md`**

Substituir:

```markdown
**Estado em julho/2026: fundação do monorepo criada (SPEC-0001).** Workspace pnpm + TypeScript strict operacionais; nenhum componente do Module Catalog implementado ainda — `packages/contracts` e `packages/core` nascem na SPEC-0002, `apps/cli` na SPEC-0003.
```

por:

```markdown
**Estado em julho/2026: plataforma mínima operável (SPEC-0002).** `@atlas/contracts` e `@atlas/core` existem: `createAtlas()` sobe até `ready`, expõe config validada/congelada e desliga com segurança. Próximo: `apps/cli` na SPEC-0003 (cli-foundation).
```

E na lista de pendências, substituir:

```markdown
- `packages/` e `apps/`: `packages/contracts` e `packages/core` nascem na SPEC-0002 (core-bootstrap); `apps/cli` na SPEC-0003 (cli-foundation)
```

por:

```markdown
- `apps/cli` → nasce na SPEC-0003 (cli-foundation); demais packages do catálogo conforme SPECs futuras
```

- [ ] **Step 3: Registrar a entrada no `implementation/LESSONS_LEARNED.md`**

Adicionar NO TOPO da seção `# Registro` (acima da entrada da SPEC-0001) uma entrada real `## SPEC-0002 — Core Bootstrap (data da execução)` no formato oficial, refletindo os fatos observados — obrigatoriamente incluindo o resultado do probe do TS7 (Step 1) e qualquer atrito real encontrado nas Tasks 1–4.

- [ ] **Step 4: Marcar a SPEC como Review**

Em `implementation/specs/SPEC-0002-core-bootstrap.md`, substituir `Ready` por `Review` no campo Status.

- [ ] **Step 5: Verificação final da DoD**

Run: `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: os cinco comandos verdes em sequência.

Run: `ls packages/contracts/src packages/core/src packages/core/tests`
Expected: estrutura conforme "Arquivos Esperados" da SPEC-0002.

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "docs: conclui core bootstrap (SPEC-0002)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Pós-plano (fora do escopo destas tasks)

Revisão da SPEC (Review → Done) conforme o DevelopmentGuide. Em seguida, SPEC-0003 (cli-foundation) consome `createAtlas()`.
