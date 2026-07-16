# [SPEC-0005](../specs/SPEC-0005-cognitive-core.md) Cognitive Core (mínimo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `packages/cognitive` (`@atlas/cognitive`) — o primeiro orquestrador e primeiro consumidor do Model Gateway — com `ask(objetivo)` numa única chamada `generate()`, compô-lo no `@atlas/core` e expô-lo via novo comando `atlas ask "<objetivo>"` na CLI (default provider `local`/Ollama).

**Architecture:** Promove-se o contrato do Model Gateway (e adiciona-se `CognitiveCore`) a `@atlas/contracts` ([ADR-0007](../../06-adr/ADR-0007-model-gateway-contract-promotion.md)). `@atlas/cognitive` implementa `CognitiveCore` dependendo só do contrato. O `@atlas/core` (composition root) instancia `createModelGateway(config.model)` + `createCognitiveCore({ gateway })` e expõe `atlas.cognitive`. A CLI ganha o comando `ask`; erros de modelo (código `ATLAS_MODEL_GATEWAY`) viram mensagem amigável. Tudo testável sem rede (provider `fake` ou `fetch` injetado).

**Tech Stack:** TypeScript 5.x (strict, NodeNext, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest, `tsx` (dev), `fetch` global do Node 24.

## Global Constraints

- Node ≥ 24, pnpm ≥ 11 via corepack. Diretório de trabalho: `/Users/lohanberg/Documents/Repos/Atlas` (todos os caminhos relativos a ele).
- **Só criar `packages/cognitive`** — nenhum outro módulo/app novo; o módulo já está previsto no [Module Catalog](../../03-architecture/ModuleCatalog.md).
- `@atlas/cognitive` depende **apenas** de `@atlas/contracts` (contrato `ModelGateway`/`CognitiveCore`), nunca do package `@atlas/model-gateway` (Regra de Dependência 9). Só o `@atlas/core` importa implementações para composição (Regra 11).
- **Zero dependências de runtime externas.** Integração HTTP segue via `fetch` global no gateway. `tsx` é dev tooling.
- Imports entre packages só via nome `@atlas/*`; imports internos com sufixo `.js` (NodeNext). Sem path aliases. Sem `dist/`.
- `verbatimModuleSyntax`: usar `import type` / `export type` para tipos; `import`/`export` para valores.
- `exactOptionalPropertyTypes`: nunca atribuir `undefined` a propriedade opcional; construir objetos condicionalmente.
- `noUncheckedIndexedAccess`: acesso indexado/`at()` retorna `T | undefined` — tratar sempre (`!` só quando garantido pelo teste).
- Sem mocks de framework: dependências (`fetch`, `gateway`) injetadas por parâmetro; testes usam stubs escritos à mão ([ADR-0004](../../06-adr/ADR-0004-manual-composition.md)).
- System prompt do Cognitive Core é **neutro** (orientado à tarefa), nunca uma persona.
- `typescript` permanece pinado em `^5` (probe do TS 7 na última task).
- Commits: conventional commits em português; cada commit termina com o trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (usar dois `-m`).

---

### Task 1: Promover o contrato do Model Gateway para `@atlas/contracts`

Refatoração pura de tipos (sem mudança de comportamento). Move os tipos do gateway para `@atlas/contracts`; `@atlas/model-gateway` passa a importá-los e re-exportá-los para continuidade interna. Gate: suíte inteira continua verde.

**Files:**
- Create: `packages/contracts/src/model.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/model-gateway/src/model-gateway.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces em `@atlas/contracts`: `Role`, `Message`, `GenerateRequest`, `GenerateResult`, `ModelGateway`, `ModelGatewayConfig`, `ProviderName`. `@atlas/model-gateway` re-exporta esses tipos de `@atlas/contracts` (via `model-gateway.ts`) e mantém `HttpDeps` local e `createModelGateway`.

- [ ] **Step 1: Criar `packages/contracts/src/model.ts`**

```ts
export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export interface GenerateRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
}

export interface ModelGateway {
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export type ProviderName = 'fake' | 'local' | 'remote';

export interface ModelGatewayConfig {
  provider: ProviderName;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}
```

- [ ] **Step 2: Exportar os novos tipos em `packages/contracts/src/index.ts`**

Adicionar ao arquivo (mantendo as linhas existentes):

```ts
export type {
  Role,
  Message,
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  ModelGatewayConfig,
  ProviderName,
} from './model.js';
```

- [ ] **Step 3: Refatorar `packages/model-gateway/src/model-gateway.ts` para importar de `@atlas/contracts`**

Substituir o conteúdo inteiro do arquivo por (remove as definições locais dos tipos; passa a importá-los/re-exportá-los; mantém `HttpDeps` e a fábrica):

```ts
import type { ModelGateway, ModelGatewayConfig } from '@atlas/contracts';
import { ModelGatewayError } from './errors.js';
import { createFakeProvider } from './providers/fake.js';
import { createOllamaProvider } from './providers/ollama.js';
import { createRemoteProvider } from './providers/remote.js';

export type {
  Role,
  Message,
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  ModelGatewayConfig,
  ProviderName,
} from '@atlas/contracts';

export interface HttpDeps {
  fetch: typeof fetch;
}

export function createModelGateway(
  config: ModelGatewayConfig,
  deps: HttpDeps = { fetch: globalThis.fetch },
): ModelGateway {
  switch (config.provider) {
    case 'fake':
      return createFakeProvider();
    case 'local':
      return createOllamaProvider(config, deps);
    case 'remote':
      return createRemoteProvider(config, deps);
    default:
      throw new ModelGatewayError(`Provedor de modelo desconhecido: ${String(config.provider)}`);
  }
}
```

Nota: os provedores (`providers/*.ts`) e os testes continuam importando de `../model-gateway.js` — resolvem pelos re-exports (`HttpDeps` continua local). Nenhum outro arquivo do package muda.

- [ ] **Step 4: Rodar typecheck e a suíte inteira**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — tipos movidos, gateway re-exporta, comportamento idêntico; todos os testes existentes verdes.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/model.ts packages/contracts/src/index.ts packages/model-gateway/src/model-gateway.ts
git commit -m "refactor(contracts): promove o contrato do Model Gateway (ADR-0007)" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Package `@atlas/cognitive` + contrato `CognitiveCore`

Cria o contrato `CognitiveCore` em `@atlas/contracts` (ainda não referenciado por `AtlasPlatform`) e o package que o implementa, com `ask` testado contra um gateway stub.

**Files:**
- Create: `packages/contracts/src/cognitive.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/cognitive/package.json`
- Create: `packages/cognitive/tsconfig.json`
- Create: `packages/cognitive/src/cognitive-core.ts`
- Create: `packages/cognitive/src/index.ts`
- Create: `packages/cognitive/CLAUDE.md`
- Create: `packages/cognitive/README.md`
- Test: `packages/cognitive/tests/cognitive-core.test.ts`

**Interfaces:**
- Consumes: `ModelGateway`, `GenerateRequest` de `@atlas/contracts`.
- Produces: contrato `CognitiveCore { ask(objective: string): Promise<string> }` em `@atlas/contracts`; `createCognitiveCore(deps: { gateway: ModelGateway }): CognitiveCore`, `CognitiveCoreDeps` e `SYSTEM_PROMPT` em `@atlas/cognitive`.

- [ ] **Step 1: Criar `packages/contracts/src/cognitive.ts`**

```ts
export interface CognitiveCore {
  ask(objective: string): Promise<string>;
}
```

- [ ] **Step 2: Exportar `CognitiveCore` em `packages/contracts/src/index.ts`**

Adicionar (mantendo as demais linhas):

```ts
export type { CognitiveCore } from './cognitive.js';
```

- [ ] **Step 3: Criar `packages/cognitive/package.json`**

```json
{
  "name": "@atlas/cognitive",
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

- [ ] **Step 4: Criar `packages/cognitive/tsconfig.json`**

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

- [ ] **Step 5: Instalar para linkar o novo package**

Run: `pnpm install`
Expected: instala sem erros; `@atlas/cognitive` linkado no workspace; sem `ERR_PNPM_IGNORED_BUILDS`.

- [ ] **Step 6: Escrever o teste `packages/cognitive/tests/cognitive-core.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { GenerateRequest, GenerateResult, ModelGateway } from '@atlas/contracts';
import { createCognitiveCore, SYSTEM_PROMPT } from '../src/index.js';

function stubGateway(impl: (request: GenerateRequest) => Promise<GenerateResult>): {
  gateway: ModelGateway;
  calls: GenerateRequest[];
} {
  const calls: GenerateRequest[] = [];
  return {
    gateway: {
      async generate(request) {
        calls.push(request);
        return impl(request);
      },
    },
    calls,
  };
}

describe('createCognitiveCore.ask', () => {
  it('monta system + user e devolve o texto do gateway', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'resposta do modelo' }));
    const core = createCognitiveCore({ gateway });

    const answer = await core.ask('resuma este texto');

    expect(answer).toBe('resposta do modelo');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'resuma este texto' },
    ]);
  });

  it('propaga erro do gateway sem mascarar', async () => {
    const { gateway } = stubGateway(async () => {
      throw new Error('modelo indisponível');
    });
    const core = createCognitiveCore({ gateway });

    await expect(core.ask('oi')).rejects.toThrow('modelo indisponível');
  });
});
```

- [ ] **Step 7: Rodar para ver falhar**

Run: `pnpm test -- cognitive-core`
Expected: FAIL — `createCognitiveCore` / `SYSTEM_PROMPT` não existem.

- [ ] **Step 8: Criar `packages/cognitive/src/cognitive-core.ts`**

```ts
import type { CognitiveCore, ModelGateway } from '@atlas/contracts';

export const SYSTEM_PROMPT =
  'Você é o núcleo cognitivo do Atlas, um assistente de IA pessoal. ' +
  'Responda ao objetivo do usuário de forma clara, correta e objetiva, ' +
  'no mesmo idioma em que ele escreveu. ' +
  'Se faltar informação essencial, diga o que precisa saber em vez de supor.';

export interface CognitiveCoreDeps {
  gateway: ModelGateway;
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway } = deps;
  return {
    async ask(objective: string): Promise<string> {
      const result = await gateway.generate({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: objective },
        ],
      });
      return result.text;
    },
  };
}
```

- [ ] **Step 9: Criar `packages/cognitive/src/index.ts`**

```ts
export { createCognitiveCore, SYSTEM_PROMPT } from './cognitive-core.js';
export type { CognitiveCoreDeps } from './cognitive-core.js';
```

- [ ] **Step 10: Rodar para ver passar + typecheck**

Run: `pnpm test -- cognitive-core && pnpm typecheck`
Expected: PASS (2 testes); typecheck limpo.

- [ ] **Step 11: Criar `packages/cognitive/CLAUDE.md`**

```markdown
# @atlas/cognitive

Cognitive Core (Intelligence) — primeiro orquestrador e primeiro consumidor do Model Gateway.

- `createCognitiveCore({ gateway })` → `ask(objetivo)`: uma única chamada `generate()` moldada por um system prompt neutro. Sem estado.
- Ciclo cognitivo honrado de forma **colapsada** (Compreensão + Raciocínio + Resposta); Planejamento/Execução/Observação/Aprendizado ficam para SPECs futuras.
- Depende só do contrato `ModelGateway`/`CognitiveCore` em `@atlas/contracts` (Regra 9), nunca do package `@atlas/model-gateway`.
- System prompt é neutro (orientado à tarefa), **não** uma persona — tom/identidade são do Persona Service (inexistente).
- Não executa comandos/Tools, não persiste memória, não gerencia Tasks, não formata personalidade (Module Catalog).
```

- [ ] **Step 12: Criar `packages/cognitive/README.md`**

```markdown
# @atlas/cognitive

Núcleo cognitivo do Atlas (Module Catalog: Cognitive Core).

`createCognitiveCore({ gateway })` devolve um `CognitiveCore` com uma operação — `ask(objetivo): Promise<string>` — que monta uma conversa mínima (system prompt neutro + objetivo do usuário), chama `gateway.generate` uma vez e devolve o texto.

Recebe o `ModelGateway` por parâmetro (composição, ADR-0004); é testado com um gateway stub, sem rede. É consumido pelo `@atlas/core`, que escolhe o provedor de modelo por configuração.
```

- [ ] **Step 13: Commit**

```bash
git add packages/contracts/src/cognitive.ts packages/contracts/src/index.ts packages/cognitive pnpm-lock.yaml
git commit -m "feat(cognitive): package @atlas/cognitive com ask minimo e contrato CognitiveCore" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Compor gateway + cognitive no `@atlas/core` e adicionar `config.model`

Estende os contratos `AtlasConfig` (com `model`) e `AtlasPlatform` (com `cognitive`), resolve/valida `config.model` no core e compõe o gateway + o cognitive em `createAtlas`. Ajusta o único teste que constrói `AtlasPlatform`/`AtlasConfig` à mão (`status.test.ts`). Gate: suíte inteira verde.

**Files:**
- Modify: `packages/contracts/src/config.ts`
- Modify: `packages/contracts/src/platform.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/config/defaults.ts`
- Modify: `packages/core/src/config/load-config.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/cli/tests/status.test.ts`
- Test: `packages/core/tests/load-config.test.ts` (novos casos)
- Test: `packages/core/tests/create-atlas.test.ts` (novo caso)

**Interfaces:**
- Consumes: `createModelGateway` de `@atlas/model-gateway`; `createCognitiveCore` de `@atlas/cognitive`; `ModelGatewayConfig`, `ProviderName`, `CognitiveCore` de `@atlas/contracts`.
- Produces: `AtlasConfig` ganha `readonly model: ModelGatewayConfig`; novo `AtlasConfigOverride`; `AtlasPlatform` ganha `readonly cognitive: CognitiveCore`; `createAtlas(options?, deps?: { fetch?: typeof fetch })` expõe `atlas.cognitive`; `loadConfig(override: AtlasConfigOverride)` valida `model`.

- [ ] **Step 1: Estender `packages/contracts/src/config.ts`**

Substituir o conteúdo por:

```ts
import type { ModelGatewayConfig } from './model.js';

export type LogLevel = 'silent' | 'error' | 'info' | 'debug';

export const LOG_LEVELS: readonly LogLevel[] = ['silent', 'error', 'info', 'debug'];

export interface AtlasConfig {
  readonly logLevel: LogLevel;
  readonly dataDir: string;
  readonly model: ModelGatewayConfig;
}

export interface AtlasConfigOverride {
  logLevel?: LogLevel;
  dataDir?: string;
  model?: Partial<ModelGatewayConfig>;
}
```

- [ ] **Step 2: Estender `packages/contracts/src/platform.ts`**

Substituir o conteúdo por:

```ts
import type { AtlasConfig } from './config.js';
import type { CognitiveCore } from './cognitive.js';

export type LifecycleState = 'created' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface AtlasPlatform {
  readonly state: LifecycleState;
  readonly config: AtlasConfig;
  readonly cognitive: CognitiveCore;
  shutdown(): Promise<void>;
}
```

- [ ] **Step 3: Exportar `AtlasConfigOverride` em `packages/contracts/src/index.ts`**

Ajustar a primeira linha de export de config para incluir `AtlasConfigOverride`:

```ts
export type { AtlasConfig, AtlasConfigOverride, LogLevel } from './config.js';
```

- [ ] **Step 4: Adicionar as dependências ao `packages/core/package.json`**

Substituir o bloco `"dependencies"` por:

```json
  "dependencies": {
    "@atlas/contracts": "workspace:*",
    "@atlas/model-gateway": "workspace:*",
    "@atlas/cognitive": "workspace:*"
  }
```

- [ ] **Step 5: Instalar as novas dependências de workspace**

Run: `pnpm install`
Expected: instala sem erros; `@atlas/model-gateway` e `@atlas/cognitive` linkados no `@atlas/core`.

- [ ] **Step 6: Atualizar `packages/core/src/config/defaults.ts`**

Substituir o conteúdo por:

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AtlasConfig } from '@atlas/contracts';

export function defaultConfig(): AtlasConfig {
  return {
    logLevel: 'info',
    dataDir: join(homedir(), '.atlas'),
    model: {
      provider: 'local',
      model: 'llama3.2',
    },
  };
}
```

- [ ] **Step 7: Escrever os novos casos de validação em `packages/core/tests/load-config.test.ts`**

Acrescentar, dentro do `describe('loadConfig', ...)`, estes casos (mantendo os existentes):

```ts
  it('aplica os defaults de model', () => {
    const config = loadConfig();
    expect(config.model).toEqual({ provider: 'local', model: 'llama3.2' });
  });

  it('mescla model parcialmente preservando os defaults', () => {
    const config = loadConfig({ model: { provider: 'fake' } });
    expect(config.model).toEqual({ provider: 'fake', model: 'llama3.2' });
  });

  it('rejeita provider de model desconhecido', () => {
    expect(() =>
      loadConfig({ model: { provider: 'nope' as AtlasConfig['model']['provider'] } }),
    ).toThrow(InvalidConfigError);
  });

  it('rejeita provider remote sem apiKey', () => {
    expect(() => loadConfig({ model: { provider: 'remote', model: 'gpt-x' } })).toThrow(
      InvalidConfigError,
    );
  });

  it('rejeita provider local sem model', () => {
    expect(() =>
      loadConfig({ model: { provider: 'local', model: '' } }),
    ).toThrow(InvalidConfigError);
  });
```

- [ ] **Step 8: Rodar para ver falhar**

Run: `pnpm test -- load-config`
Expected: FAIL — `loadConfig` ainda não valida `model` (e o override tipado ainda não aceita `model`).

- [ ] **Step 9: Atualizar `packages/core/src/config/load-config.ts`**

Substituir o conteúdo por:

```ts
import {
  InvalidConfigError,
  LOG_LEVELS,
  type AtlasConfig,
  type AtlasConfigOverride,
  type ModelGatewayConfig,
  type ProviderName,
} from '@atlas/contracts';
import { defaultConfig } from './defaults.js';

const PROVIDERS: readonly ProviderName[] = ['fake', 'local', 'remote'];

export function loadConfig(override: AtlasConfigOverride = {}): AtlasConfig {
  const defaults = defaultConfig();
  const model: ModelGatewayConfig = { ...defaults.model, ...override.model };
  const merged: AtlasConfig = {
    logLevel: override.logLevel ?? defaults.logLevel,
    dataDir: override.dataDir ?? defaults.dataDir,
    model,
  };

  const issues: string[] = [];

  if (!LOG_LEVELS.includes(merged.logLevel)) {
    issues.push(
      `logLevel deve ser um de: ${LOG_LEVELS.join(', ')} (recebido: ${String(merged.logLevel)})`,
    );
  }

  if (typeof merged.dataDir !== 'string' || merged.dataDir.trim() === '') {
    issues.push('dataDir deve ser uma string não vazia');
  }

  if (!PROVIDERS.includes(model.provider)) {
    issues.push(
      `model.provider deve ser um de: ${PROVIDERS.join(', ')} (recebido: ${String(model.provider)})`,
    );
  }

  if (model.provider === 'remote' && (model.apiKey === undefined || model.apiKey.trim() === '')) {
    issues.push('model.apiKey é obrigatório para o provider remote');
  }

  if (model.provider !== 'fake' && (model.model === undefined || model.model.trim() === '')) {
    issues.push('model.model é obrigatório para os providers local e remote');
  }

  if (issues.length > 0) {
    throw new InvalidConfigError(issues);
  }

  return Object.freeze(merged);
}
```

- [ ] **Step 10: Rodar para ver passar**

Run: `pnpm test -- load-config`
Expected: PASS — validações de `model` cobertas; casos existentes seguem verdes.

- [ ] **Step 11: Escrever o novo caso de composição em `packages/core/tests/create-atlas.test.ts`**

Acrescentar, dentro do `describe('createAtlas', ...)` (mantendo os existentes):

```ts
  it('expõe um cognitive que responde via provider fake', async () => {
    const atlas = await createAtlas({ config: { model: { provider: 'fake' } } });
    const answer = await atlas.cognitive.ask('olá');
    expect(answer).toBe('[fake] olá');
    await atlas.shutdown();
  });
```

- [ ] **Step 12: Rodar para ver falhar**

Run: `pnpm test -- create-atlas`
Expected: FAIL — `createAtlas` ainda não compõe/expõe `cognitive` (e o tipo `AtlasPlatform` exige `cognitive`, então o typecheck do core também acusa).

- [ ] **Step 13: Atualizar `packages/core/src/index.ts` para compor gateway + cognitive**

Substituir o conteúdo por:

```ts
import type { AtlasConfigOverride, AtlasPlatform } from '@atlas/contracts';
import { createModelGateway } from '@atlas/model-gateway';
import { createCognitiveCore } from '@atlas/cognitive';
import { loadConfig } from './config/load-config.js';
import { createLifecycle } from './lifecycle/lifecycle.js';

export interface CreateAtlasOptions {
  config?: AtlasConfigOverride;
}

export interface CreateAtlasDeps {
  fetch?: typeof fetch;
}

export async function createAtlas(
  options: CreateAtlasOptions = {},
  deps: CreateAtlasDeps = {},
): Promise<AtlasPlatform> {
  const config = loadConfig(options.config);
  const gateway = createModelGateway(config.model, { fetch: deps.fetch ?? globalThis.fetch });
  const cognitive = createCognitiveCore({ gateway });
  const lifecycle = createLifecycle();
  await lifecycle.start();

  return {
    get state() {
      return lifecycle.state;
    },
    config,
    cognitive,
    shutdown: () => lifecycle.shutdown(),
  };
}

export { defaultConfig } from './config/defaults.js';
export { loadConfig } from './config/load-config.js';
export { createLifecycle } from './lifecycle/lifecycle.js';
export type { Lifecycle, LifecycleHooks } from './lifecycle/lifecycle.js';
```

- [ ] **Step 14: Ajustar o `AtlasPlatform` construído à mão em `apps/cli/tests/status.test.ts`**

Substituir o objeto `atlas` do teste por (adiciona `config.model` e `cognitive`):

```ts
    const atlas: AtlasPlatform = {
      state: 'ready',
      config: {
        logLevel: 'info',
        dataDir: '/home/x/.atlas',
        model: { provider: 'local', model: 'llama3.2' },
      },
      cognitive: { ask: async () => '' },
      shutdown: async () => {},
    };
```

- [ ] **Step 15: Rodar a suíte inteira + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — core compõe e expõe `cognitive`; `status.test` compila com o contrato novo; tudo verde, sem rede.

- [ ] **Step 16: Commit**

```bash
git add packages/contracts/src/config.ts packages/contracts/src/platform.ts packages/contracts/src/index.ts packages/core pnpm-lock.yaml apps/cli/tests/status.test.ts
git commit -m "feat(core): compoe Model Gateway + Cognitive Core e adiciona config.model" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Comando `atlas ask` na CLI

Adiciona o comando `ask` ao Input Gateway (com objetivo + flags/env de modelo na precedência `flags > env > defaults`), o executor `runAsk`, o despacho e o mapeamento de erro de modelo em `run.ts`, e o help atualizado. Gate: suíte inteira verde, sem rede.

**Files:**
- Modify: `apps/cli/src/gateway/input-gateway.ts`
- Create: `apps/cli/src/commands/ask.ts`
- Modify: `apps/cli/src/run.ts`
- Test: `apps/cli/tests/input-gateway.test.ts` (novos casos)
- Test: `apps/cli/tests/run.test.ts` (novos casos)

**Interfaces:**
- Consumes: `AtlasConfigOverride`, `LogLevel`, `ModelGatewayConfig`, `ProviderName`, `AtlasError` de `@atlas/contracts`; `createAtlas` de `@atlas/core`.
- Produces: `ParsedInput` com `command: 'status' | 'help' | 'version' | 'ask'`, `configOverride: AtlasConfigOverride`, `objective?: string`; `runAsk(atlas, objective, output)`; `run(argv, env, gateways, version, deps?: { fetch?: typeof fetch })`.

- [ ] **Step 1: Escrever os novos casos em `apps/cli/tests/input-gateway.test.ts`**

Acrescentar, dentro do `describe('CliInputGateway.normalize', ...)` (mantendo os existentes):

```ts
  it('ask com objetivo devolve o comando ask e o objetivo', () => {
    const parsed = gw.normalize(['ask', 'resuma isto'], {});
    expect(parsed.command).toBe('ask');
    expect(parsed.objective).toBe('resuma isto');
    expect(parsed.configOverride).toEqual({});
  });

  it('ask sem objetivo lança CliUsageError', () => {
    expect(() => gw.normalize(['ask'], {})).toThrow(CliUsageError);
  });

  it('a flag --provider sobrepõe o env ATLAS_MODEL_PROVIDER', () => {
    const parsed = gw.normalize(['ask', 'oi', '--provider', 'fake'], {
      ATLAS_MODEL_PROVIDER: 'remote',
    });
    expect(parsed.configOverride).toEqual({ model: { provider: 'fake' } });
  });

  it('o env preenche model quando não há flag', () => {
    const parsed = gw.normalize(['ask', 'oi'], {
      ATLAS_MODEL: 'llama3.2',
      ATLAS_MODEL_BASE_URL: 'http://host:11434',
    });
    expect(parsed.configOverride).toEqual({
      model: { model: 'llama3.2', baseUrl: 'http://host:11434' },
    });
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm test -- input-gateway`
Expected: FAIL — `ask` ainda é "comando desconhecido"; flags de model inexistentes.

- [ ] **Step 3: Reescrever `apps/cli/src/gateway/input-gateway.ts`**

Substituir o conteúdo por:

```ts
import { parseArgs } from 'node:util';
import type {
  AtlasConfigOverride,
  LogLevel,
  ModelGatewayConfig,
  ProviderName,
} from '@atlas/contracts';

export interface ParsedInput {
  command: 'status' | 'help' | 'version' | 'ask';
  configOverride: AtlasConfigOverride;
  objective?: string;
}

export interface InputGateway {
  normalize(argv: string[], env: NodeJS.ProcessEnv): ParsedInput;
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

interface CliValues {
  'log-level'?: string | undefined;
  'data-dir'?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  'base-url'?: string | undefined;
  'api-key'?: string | undefined;
}

function resolveConfigOverride(values: CliValues, env: NodeJS.ProcessEnv): AtlasConfigOverride {
  const override: AtlasConfigOverride = {};

  // Camada env (menor precedência). Valores crus; o core valida.
  if (env.ATLAS_LOG_LEVEL !== undefined) {
    override.logLevel = env.ATLAS_LOG_LEVEL as LogLevel;
  }
  if (env.ATLAS_DATA_DIR !== undefined) {
    override.dataDir = env.ATLAS_DATA_DIR;
  }

  // Camada flags (maior precedência).
  if (values['log-level'] !== undefined) {
    override.logLevel = values['log-level'] as LogLevel;
  }
  if (values['data-dir'] !== undefined) {
    override.dataDir = values['data-dir'];
  }

  const model: Partial<ModelGatewayConfig> = {};
  // env
  if (env.ATLAS_MODEL_PROVIDER !== undefined) {
    model.provider = env.ATLAS_MODEL_PROVIDER as ProviderName;
  }
  if (env.ATLAS_MODEL !== undefined) {
    model.model = env.ATLAS_MODEL;
  }
  if (env.ATLAS_MODEL_BASE_URL !== undefined) {
    model.baseUrl = env.ATLAS_MODEL_BASE_URL;
  }
  if (env.ATLAS_MODEL_API_KEY !== undefined) {
    model.apiKey = env.ATLAS_MODEL_API_KEY;
  }
  // flags
  if (values.provider !== undefined) {
    model.provider = values.provider as ProviderName;
  }
  if (values.model !== undefined) {
    model.model = values.model;
  }
  if (values['base-url'] !== undefined) {
    model.baseUrl = values['base-url'];
  }
  if (values['api-key'] !== undefined) {
    model.apiKey = values['api-key'];
  }

  if (Object.keys(model).length > 0) {
    override.model = model;
  }

  return override;
}

function parseArgvOrThrow(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        'log-level': { type: 'string' },
        'data-dir': { type: 'string' },
        provider: { type: 'string' },
        model: { type: 'string' },
        'base-url': { type: 'string' },
        'api-key': { type: 'string' },
      },
    });
  } catch (cause) {
    throw new CliUsageError(cause instanceof Error ? cause.message : String(cause));
  }
}

export function createCliInputGateway(): InputGateway {
  return {
    normalize(argv, env) {
      const { values, positionals } = parseArgvOrThrow(argv);

      // --help / --version têm prioridade sobre qualquer positional.
      if (values.help === true) {
        return { command: 'help', configOverride: {} };
      }
      if (values.version === true) {
        return { command: 'version', configOverride: {} };
      }

      // Sem argumentos ⇒ ajuda.
      if (positionals.length === 0) {
        return { command: 'help', configOverride: {} };
      }

      const command = positionals[0];

      if (command === 'status') {
        return { command: 'status', configOverride: resolveConfigOverride(values, env) };
      }

      if (command === 'ask') {
        const objective = positionals[1];
        if (objective === undefined || objective.trim() === '') {
          throw new CliUsageError('o comando "ask" exige um objetivo: atlas ask "<objetivo>"');
        }
        return { command: 'ask', configOverride: resolveConfigOverride(values, env), objective };
      }

      throw new CliUsageError(`comando desconhecido: ${String(command)}`);
    },
  };
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm test -- input-gateway`
Expected: PASS — comando `ask` e resolução de model cobertos; casos existentes verdes.

- [ ] **Step 5: Criar `apps/cli/src/commands/ask.ts`**

```ts
import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export async function runAsk(
  atlas: AtlasPlatform,
  objective: string,
  output: OutputGateway,
): Promise<void> {
  const answer = await atlas.cognitive.ask(objective);
  output.write(`${answer}\n`);
}
```

- [ ] **Step 6: Escrever os novos casos em `apps/cli/tests/run.test.ts`**

Acrescentar, dentro do `describe('run (integração apps → core)', ...)` (mantendo os existentes):

```ts
  it('ask com provider fake imprime a resposta e retorna 0', async () => {
    const h = harness();
    const code = await run(['ask', 'olá', '--provider', 'fake'], {}, h.gateways, '0.1.0');
    expect(code).toBe(0);
    expect(h.out()).toContain('[fake] olá');
  });

  it('ask sem objetivo retorna 2 e escreve o uso em stderr', async () => {
    const h = harness();
    const code = await run(['ask'], {}, h.gateways, '0.1.0');
    expect(code).toBe(2);
    expect(h.err()).toContain('objetivo');
  });

  it('erro do modelo (provider local sem rede) retorna 1 com mensagem amigável', async () => {
    const h = harness();
    const failingFetch = (async () => {
      throw new Error('sem rede');
    }) as unknown as typeof fetch;
    const code = await run(
      ['ask', 'olá', '--provider', 'local', '--model', 'llama3.2'],
      {},
      h.gateways,
      '0.1.0',
      { fetch: failingFetch },
    );
    expect(code).toBe(1);
    expect(h.err()).toContain('modelo');
    expect(h.out()).toBe('');
  });
```

- [ ] **Step 7: Rodar para ver falhar**

Run: `pnpm test -- run`
Expected: FAIL — `run` ainda não despacha `ask`, não aceita `deps`, nem mapeia o erro de modelo.

- [ ] **Step 8: Reescrever `apps/cli/src/run.ts`**

Substituir o conteúdo por:

```ts
import { AtlasError, InvalidConfigError } from '@atlas/contracts';
import { createAtlas } from '@atlas/core';
import { runStatus } from './commands/status.js';
import { runAsk } from './commands/ask.js';
import { CliUsageError } from './gateway/input-gateway.js';
import type { InputGateway, ParsedInput } from './gateway/input-gateway.js';
import type { OutputGateway } from './gateway/output-gateway.js';

export interface CliGateways {
  input: InputGateway;
  output: OutputGateway;
}

export interface CliDeps {
  fetch?: typeof fetch;
}

const HELP_TEXT = `Usage: atlas <command> [options]

Commands:
  status               Mostra o estado da plataforma e a config resolvida
  ask "<objetivo>"     Envia um objetivo ao núcleo cognitivo e imprime a resposta

Options:
  -h, --help           Mostra esta ajuda
  -v, --version        Mostra a versão
      --log-level <l>  Sobrepõe o nível de log (silent|error|info|debug)
      --data-dir <p>   Sobrepõe o diretório de dados
      --provider <p>   Provedor de modelo (local|remote|fake)
      --model <m>      Nome do modelo
      --base-url <u>   Base URL do provedor de modelo
      --api-key <k>    API key do provedor remoto
`;

export async function run(
  argv: string[],
  env: NodeJS.ProcessEnv,
  gateways: CliGateways,
  version: string,
  deps: CliDeps = {},
): Promise<number> {
  const { input, output } = gateways;

  let parsed: ParsedInput;
  try {
    parsed = input.normalize(argv, env);
  } catch (cause) {
    if (cause instanceof CliUsageError) {
      output.error(`${cause.message}\n\n${HELP_TEXT}`);
      return 2;
    }
    throw cause;
  }

  if (parsed.command === 'help') {
    output.write(HELP_TEXT);
    return 0;
  }
  if (parsed.command === 'version') {
    output.write(`${version}\n`);
    return 0;
  }

  try {
    const atlas = await createAtlas(
      { config: parsed.configOverride },
      deps.fetch !== undefined ? { fetch: deps.fetch } : {},
    );
    try {
      if (parsed.command === 'ask') {
        await runAsk(atlas, parsed.objective ?? '', output);
      } else {
        runStatus(atlas, output);
      }
    } finally {
      await atlas.shutdown();
    }
    return 0;
  } catch (cause) {
    if (cause instanceof InvalidConfigError) {
      output.error(
        `Configuração inválida:\n${cause.issues.map((issue) => `  - ${issue}`).join('\n')}\n`,
      );
      return 1;
    }
    if (cause instanceof AtlasError && cause.code === 'ATLAS_MODEL_GATEWAY') {
      output.error(
        `Não foi possível obter resposta do modelo: ${cause.message}\n` +
          `Se estiver usando o provedor local, verifique se o Ollama está rodando ` +
          `(ollama serve) e se o modelo foi baixado (ollama pull <model>).\n`,
      );
      return 1;
    }
    throw cause;
  }
}
```

- [ ] **Step 9: Rodar para ver passar + typecheck**

Run: `pnpm typecheck && pnpm test -- run`
Expected: PASS — `ask` despachado; erro de modelo mapeado; casos existentes (`status`, `--version`, etc.) verdes.

- [ ] **Step 10: Verificação manual sem rede (provider fake)**

Run: `tsx apps/cli/src/main.ts ask "diga olá" --provider fake`
Expected: imprime `[fake] diga olá` e encerra com código `0`.

- [ ] **Step 11: Commit**

```bash
git add apps/cli/src/gateway/input-gateway.ts apps/cli/src/commands/ask.ts apps/cli/src/run.ts apps/cli/tests/input-gateway.test.ts apps/cli/tests/run.test.ts
git commit -m "feat(cli): comando atlas ask consumindo o Cognitive Core" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Documentação, verificação final e conclusão

**Files:**
- Modify: `CLAUDE.md` (raiz)
- Modify: `docs/05-context/NEXT_CONTEXT.md`
- Modify: `docs/05-context/CURRENT_SPRINT.md`
- Modify: `implementation/LESSONS_LEARNED.md`
- Modify: `implementation/specs/SPEC-0005-cognitive-core.md` (Status → Review)

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: documentação atualizada, SPEC em Review, lições registradas.

- [ ] **Step 1: Atualizar `CLAUDE.md` (raiz)**

No parágrafo de estado (seção "O que é este repositório"), acrescentar que existe `@atlas/cognitive`: `createCognitiveCore({ gateway })` → `ask(objetivo)` (primeiro consumidor do Model Gateway; ciclo cognitivo colapsado numa chamada `generate`), e que a CLI ganhou `atlas ask "<objetivo>"` (default provider `local`/Ollama; `remote`/`fake` por config). Ajustar a frase de estado ("julho/2026: ...") para incluir a SPEC-0005. A entrada genérica "demais packages do catálogo conforme SPECs futuras" na seção "Referenciado na documentação, mas ainda não criado" permanece.

- [ ] **Step 2: Atualizar `docs/05-context/NEXT_CONTEXT.md`**

- Estado imediato: SPEC-0005 em `Review` (pendente de aprovação → `Done`); registrar `@atlas/cognitive` entregue e o comando `atlas ask`.
- Registrar padrões reutilizáveis novos: contrato do gateway promovido a `@atlas/contracts` (ADR-0007); `config.model` com precedência `flags > env > defaults`; erro de modelo mapeado por `code` (`ATLAS_MODEL_GATEWAY`) sem acoplar a CLI ao package do gateway; `createAtlas(options, { fetch })` injeta `fetch` para testes sem rede.
- Atualizar o "Mapa Rápido" com o package `packages/cognitive` e o ADR-0007.
- Candidatas à próxima SPEC: próximas etapas do ciclo (Planner/Runtime/Memory/Context), provedor Anthropic nativo, Persona Service (tom/Jarvis), config por arquivo (slot do [ADR-0006](../../06-adr/ADR-0006-config-source-precedence.md)), distribuição da CLI.

- [ ] **Step 3: Atualizar `docs/05-context/CURRENT_SPRINT.md`**

Acrescentar a linha da SPEC-0005 (Cognitive Core) à tabela, com o status corrente (`Review` → `Done` após aprovação).

- [ ] **Step 4: Registrar lições em `implementation/LESSONS_LEARNED.md`**

Acrescentar uma seção da SPEC-0005 seguindo o estilo das anteriores, cobrindo ao menos:
- promoção de contrato para `@atlas/contracts` disparada pelo 2º consumidor (ADR-0007); re-export no package de origem minimiza churn e mantém a regra "consumidor depende de contrato";
- campo de config aninhado (`config.model`) exige merge campo-a-campo e um tipo de override próprio (`AtlasConfigOverride` com `Partial<ModelGatewayConfig>`) por causa do `exactOptionalPropertyTypes`;
- a CLL mapeia o erro de modelo por `AtlasError.code === 'ATLAS_MODEL_GATEWAY'` (sem depender de `@atlas/model-gateway`), preservando o desacoplamento;
- ciclo cognitivo honrado de forma colapsada (uma chamada `generate`), sem saídas estruturadas especulativas (YAGNI);
- teste do orquestrador com gateway stub e do caminho de erro com `fetch` injetado → suíte sem rede.

- [ ] **Step 5: Mudar o Status da SPEC para `Review`**

Em `implementation/specs/SPEC-0005-cognitive-core.md`, alterar `Status` de `Draft` para `Review`.

- [ ] **Step 6: Probe do TypeScript 7 (encaminhamento herdado)**

Run: `pnpm add -Dw typescript@^7 && pnpm lint`
Expected: se passar, manter e registrar em LESSONS_LEARNED; se falhar, reverter com `pnpm add -Dw typescript@^5` (comportamento conhecido do typescript-eslint; falhou em 07-10, 07-11 e 07-12).

- [ ] **Step 7: Verificação completa da suíte**

Run: `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde; os testes dos packages novos rodam junto dos demais, sem acesso à rede.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md docs/05-context/NEXT_CONTEXT.md docs/05-context/CURRENT_SPRINT.md implementation/LESSONS_LEARNED.md implementation/specs/SPEC-0005-cognitive-core.md
git commit -m "docs(cognitive): documentacao, licoes e SPEC-0005 em Review" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de verificação (para quem executa)

- **Sem rede nos testes**: todo teste usa provider `fake` ou `fetch`/`gateway` injetado. Se algum teste tentar rede, é bug de plano — parar e revisar.
- **Greenness por task**: a ordem foi desenhada para a suíte ficar verde ao fim de cada task. Task 1 é refatoração pura (tipos). Task 2 adiciona contrato + package sem consumidores. Task 3 torna `config.model`/`cognitive` obrigatórios e ajusta o único teste que os constrói à mão (`status.test.ts`). Task 4 liga a CLI.
- **`exactOptionalPropertyTypes`**: `AtlasConfigOverride.model` é `Partial<ModelGatewayConfig>`; o override é montado condicionalmente (nunca `campo: undefined`); `override.model` só é anexado quando há ao menos um campo.
- **Precedência de config** (`model`): env primeiro, flags por cima; validação e merge com defaults ficam no core (`loadConfig`).
- **Desacoplamento CLI ↔ gateway**: `run.ts` detecta erro de modelo por `AtlasError.code`, sem importar `@atlas/model-gateway`.
- **DoD** (SPEC): critérios atendidos, testes verdes, docs atualizadas, arquitetura preservada, revisão concluída, lições registradas. A transição `Review → Done` depende da aprovação do usuário.
```
