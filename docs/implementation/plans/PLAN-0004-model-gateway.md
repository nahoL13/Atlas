# [SPEC-0004](../specs/SPEC-0004-model-gateway.md) Model Gateway — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `packages/model-gateway` (`@atlas/model-gateway`): uma interface única `generate()` com provedor de modelo selecionável por config — `fake` (testes), `local`/Ollama (grátis) e `remote` (pago, OpenAI-compatible) — verificável por testes sem rede e por um smoke script.

**Architecture:** Um package adaptador sem estado (Module Catalog: Model Gateway, camada Extension). `createModelGateway(config)` seleciona um dos três provedores, todos implementando a mesma interface `ModelGateway`. Provedores de rede recebem `fetch` por parâmetro ([ADR-0004](../../06-adr/ADR-0004-manual-composition.md)) para serem testados sem tocar a rede. Zero dependências de runtime além de `@atlas/contracts` (para `AtlasError`).

**Tech Stack:** TypeScript 5.x (strict, NodeNext, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest, `tsx` (dev), `fetch` global do Node 24.

## Global Constraints

- Node ≥ 24, pnpm ≥ 11 via corepack. Diretório de trabalho: `/Users/lohanberg/Documents/Repos/Atlas` (todos os caminhos são relativos a ele).
- **Só criar `packages/model-gateway`** — não criar outros módulos/packages/apps; o módulo já está previsto no Module Catalog.
- **Não alterar `@atlas/contracts`, `@atlas/core` nem `apps/cli`.** Se algo sugerir necessidade de mudança neles, **parar e registrar** (Constituição).
- **Zero dependências de runtime externas**: integração HTTP via `fetch` global; parsing do smoke via `node:util`. Única dependência de runtime: `@atlas/contracts` (`workspace:*`). `tsx` é `devDependency`.
- Imports entre packages só via nome `@atlas/*`; imports internos com sufixo `.js` (NodeNext). Sem path aliases. Sem `dist/`.
- `verbatimModuleSyntax`: usar `import type` / `export type` para tipos; `import`/`export` para valores.
- `exactOptionalPropertyTypes`: nunca atribuir `undefined` explicitamente a propriedade opcional; construir objetos condicionalmente.
- `noUncheckedIndexedAccess`: acesso indexado/`at()` retorna `T | undefined` — tratar sempre.
- Sem mocks de framework: dependências (`fetch`) injetadas por parâmetro; testes usam stubs escritos à mão (ADR-0004).
- `typescript` permanece pinado em `^5` (probe do TS 7 na última task).
- Commits: conventional commits em português; cada commit termina com o trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (usar dois `-m`).

---

### Task 1: Scaffolding do package + tipos públicos + `ModelGatewayError`

**Files:**
- Create: `packages/model-gateway/package.json`
- Create: `packages/model-gateway/tsconfig.json`
- Create: `packages/model-gateway/src/model-gateway.ts` (tipos + fábrica; provedores ligados na Task 5)
- Create: `packages/model-gateway/src/errors.ts`
- Test: `packages/model-gateway/tests/errors.test.ts`

**Interfaces:**
- Consumes: `AtlasError` de `@atlas/contracts`.
- Produces: tipos `Role`, `Message`, `GenerateRequest`, `GenerateResult`, `ModelGateway`, `ProviderName`, `ModelGatewayConfig`, `HttpDeps`; classe `ModelGatewayError` (code `ATLAS_MODEL_GATEWAY`). A fábrica `createModelGateway` fica esboçada mas só é finalizada na Task 5 (quando os provedores existirem).

- [ ] **Step 1: Criar `packages/model-gateway/package.json`**

```json
{
  "name": "@atlas/model-gateway",
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
    "typecheck": "tsc -p tsconfig.json",
    "smoke": "tsx scripts/smoke.ts"
  },
  "dependencies": {
    "@atlas/contracts": "workspace:*"
  }
}
```

- [ ] **Step 2: Criar `packages/model-gateway/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"]
}
```

- [ ] **Step 3: Instalar dependências e o `tsx` do package**

Run: `pnpm --filter @atlas/model-gateway add -D tsx && pnpm install`
Expected: instala sem erros; `@atlas/contracts` resolvido como `workspace:*`; sem `ERR_PNPM_IGNORED_BUILDS` (o `esbuild` já está aprovado em `pnpm-workspace.yaml`).

- [ ] **Step 4: Criar `src/errors.ts`**

```ts
import { AtlasError } from '@atlas/contracts';

export class ModelGatewayError extends AtlasError {
  constructor(message: string, options?: ErrorOptions) {
    super('ATLAS_MODEL_GATEWAY', message, options);
  }
}
```

- [ ] **Step 5: Criar `src/model-gateway.ts` (tipos + fábrica provisória)**

```ts
import { ModelGatewayError } from './errors.js';

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

export interface HttpDeps {
  fetch: typeof fetch;
}

// Finalizada na Task 5, quando os provedores existirem.
export function createModelGateway(
  config: ModelGatewayConfig,
  _deps: HttpDeps = { fetch: globalThis.fetch },
): ModelGateway {
  throw new ModelGatewayError(
    `Provedor de modelo ainda não implementado: ${String(config.provider)}`,
  );
}
```

- [ ] **Step 6: Escrever o teste `tests/errors.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { AtlasError } from '@atlas/contracts';
import { ModelGatewayError } from '../src/errors.js';

describe('ModelGatewayError', () => {
  it('é um AtlasError com code próprio e name correto', () => {
    const error = new ModelGatewayError('falhou');
    expect(error).toBeInstanceOf(AtlasError);
    expect(error.code).toBe('ATLAS_MODEL_GATEWAY');
    expect(error.name).toBe('ModelGatewayError');
    expect(error.message).toBe('falhou');
  });
});
```

- [ ] **Step 7: Rodar typecheck e testes**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — o novo package tipa e o teste do erro passa.

- [ ] **Step 8: Commit**

```bash
git add packages/model-gateway pnpm-lock.yaml
git commit -m "feat(model-gateway): scaffold do package, tipos publicos e ModelGatewayError" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Provedor `fake`

**Files:**
- Create: `packages/model-gateway/src/providers/fake.ts`
- Test: `packages/model-gateway/tests/fake.test.ts`

**Interfaces:**
- Consumes: tipos de `../model-gateway.js`.
- Produces: `createFakeProvider(config: ModelGatewayConfig): ModelGateway` — determinístico, sem rede; ecoa a última mensagem no formato `[fake] <conteúdo>`.

- [ ] **Step 1: Escrever o teste `tests/fake.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createFakeProvider } from '../src/providers/fake.js';

describe('fake provider', () => {
  it('ecoa a última mensagem de forma determinística', async () => {
    const gateway = createFakeProvider({ provider: 'fake' });
    const result = await gateway.generate({
      messages: [
        { role: 'system', content: 'contexto' },
        { role: 'user', content: 'olá' },
      ],
    });
    expect(result.text).toBe('[fake] olá');
  });

  it('sem mensagens devolve prefixo vazio', async () => {
    const gateway = createFakeProvider({ provider: 'fake' });
    const result = await gateway.generate({ messages: [] });
    expect(result.text).toBe('[fake] ');
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm test -- fake`
Expected: FAIL — `createFakeProvider` não existe.

- [ ] **Step 3: Criar `src/providers/fake.ts`**

```ts
import type {
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  ModelGatewayConfig,
} from '../model-gateway.js';

export function createFakeProvider(_config: ModelGatewayConfig): ModelGateway {
  return {
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const last = request.messages.at(-1);
      return { text: `[fake] ${last ? last.content : ''}` };
    },
  };
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm test -- fake`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/model-gateway/src/providers/fake.ts packages/model-gateway/tests/fake.test.ts
git commit -m "feat(model-gateway): provedor fake deterministico" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Provedor `local` (Ollama)

**Files:**
- Create: `packages/model-gateway/src/providers/ollama.ts`
- Test: `packages/model-gateway/tests/ollama.test.ts`

**Interfaces:**
- Consumes: tipos + `HttpDeps` de `../model-gateway.js`; `ModelGatewayError` de `../errors.js`.
- Produces: `createOllamaProvider(config: ModelGatewayConfig, deps?: HttpDeps): ModelGateway`. Faz `POST {baseUrl}/api/chat` (default baseUrl `http://localhost:11434`), corpo `{ model, messages, stream:false, options:{temperature,num_predict} }`, mapeia `message.content` → `GenerateResult.text`. Model resolvido de `request.model ?? config.model`; ausência ⇒ `ModelGatewayError`. Status ≥ 400 ou `fetch` que rejeita ⇒ `ModelGatewayError`.

- [ ] **Step 1: Escrever o teste `tests/ollama.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createOllamaProvider } from '../src/providers/ollama.js';
import { ModelGatewayError } from '../src/errors.js';
import type { HttpDeps } from '../src/model-gateway.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(response: Response | (() => Promise<Response>)): {
  deps: HttpDeps;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return typeof response === 'function' ? response() : response;
  }) as unknown as typeof fetch;
  return { deps: { fetch: fetchStub }, calls };
}

describe('ollama provider', () => {
  it('monta a requisição e mapeia a resposta', async () => {
    const { deps, calls } = stubFetch(jsonResponse({ message: { content: 'oi local' } }));
    const gateway = createOllamaProvider(
      { provider: 'local', model: 'llama3.2', baseUrl: 'http://host:1234' },
      deps,
    );

    const result = await gateway.generate({ messages: [{ role: 'user', content: 'oi' }] });

    expect(result.text).toBe('oi local');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://host:1234/api/chat');
    const parsed = JSON.parse(calls[0]!.init!.body as string) as {
      model: string;
      stream: boolean;
      messages: unknown;
    };
    expect(parsed.model).toBe('llama3.2');
    expect(parsed.stream).toBe(false);
    expect(parsed.messages).toEqual([{ role: 'user', content: 'oi' }]);
  });

  it('usa localhost:11434 como baseUrl default', async () => {
    const { deps, calls } = stubFetch(jsonResponse({ message: { content: 'x' } }));
    const gateway = createOllamaProvider({ provider: 'local', model: 'llama3.2' }, deps);
    await gateway.generate({ messages: [{ role: 'user', content: 'oi' }] });
    expect(calls[0]!.url).toBe('http://localhost:11434/api/chat');
  });

  it('sem model lança ModelGatewayError', async () => {
    const { deps } = stubFetch(jsonResponse({}));
    const gateway = createOllamaProvider({ provider: 'local' }, deps);
    await expect(gateway.generate({ messages: [] })).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it('status >= 400 lança ModelGatewayError', async () => {
    const { deps } = stubFetch(jsonResponse({}, 500));
    const gateway = createOllamaProvider({ provider: 'local', model: 'llama3.2' }, deps);
    await expect(
      gateway.generate({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it('fetch que rejeita vira ModelGatewayError', async () => {
    const { deps } = stubFetch(() => Promise.reject(new Error('rede caiu')));
    const gateway = createOllamaProvider({ provider: 'local', model: 'llama3.2' }, deps);
    await expect(
      gateway.generate({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm test -- ollama`
Expected: FAIL — `createOllamaProvider` não existe.

- [ ] **Step 3: Criar `src/providers/ollama.ts`**

```ts
import type {
  GenerateRequest,
  GenerateResult,
  HttpDeps,
  ModelGateway,
  ModelGatewayConfig,
} from '../model-gateway.js';
import { ModelGatewayError } from '../errors.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';

interface OllamaChatResponse {
  message?: { content?: string };
}

export function createOllamaProvider(
  config: ModelGatewayConfig,
  deps: HttpDeps = { fetch: globalThis.fetch },
): ModelGateway {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  return {
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const model = request.model ?? config.model;
      if (model === undefined) {
        throw new ModelGatewayError('Provedor local (Ollama) exige um "model".');
      }

      const body = {
        model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      };

      let response: Response;
      try {
        response = await deps.fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new ModelGatewayError('Falha ao conectar ao Ollama.', { cause });
      }

      if (!response.ok) {
        throw new ModelGatewayError(`Ollama respondeu com status ${response.status}.`);
      }

      const data = (await response.json()) as OllamaChatResponse;
      const text = data.message?.content;
      if (typeof text !== 'string') {
        throw new ModelGatewayError('Resposta do Ollama sem conteúdo de texto.');
      }
      return { text };
    },
  };
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm test -- ollama`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/model-gateway/src/providers/ollama.ts packages/model-gateway/tests/ollama.test.ts
git commit -m "feat(model-gateway): provedor local via Ollama com fetch injetado" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Provedor `remote` (OpenAI-compatible)

**Files:**
- Create: `packages/model-gateway/src/providers/remote.ts`
- Test: `packages/model-gateway/tests/remote.test.ts`

**Interfaces:**
- Consumes: tipos + `HttpDeps`; `ModelGatewayError`.
- Produces: `createRemoteProvider(config: ModelGatewayConfig, deps?: HttpDeps): ModelGateway`. **Na criação**, exige `config.baseUrl` e `config.apiKey` (ausência ⇒ `ModelGatewayError`). Faz `POST {baseUrl}/chat/completions` com header `authorization: Bearer <apiKey>`, corpo `{ model, messages, temperature, max_tokens }`, mapeia `choices[0].message.content` → `text`. Model de `request.model ?? config.model`; ausência ⇒ erro. Status ≥ 400 / rejeição ⇒ erro.

- [ ] **Step 1: Escrever o teste `tests/remote.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRemoteProvider } from '../src/providers/remote.js';
import { ModelGatewayError } from '../src/errors.js';
import type { HttpDeps } from '../src/model-gateway.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(response: Response | (() => Promise<Response>)): {
  deps: HttpDeps;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return typeof response === 'function' ? response() : response;
  }) as unknown as typeof fetch;
  return { deps: { fetch: fetchStub }, calls };
}

const base = { provider: 'remote', baseUrl: 'https://api.x/v1', apiKey: 'secret', model: 'gpt-x' } as const;

describe('remote provider', () => {
  it('envia auth + corpo e mapeia a resposta', async () => {
    const { deps, calls } = stubFetch(
      jsonResponse({ choices: [{ message: { content: 'oi remoto' } }] }),
    );
    const gateway = createRemoteProvider({ ...base }, deps);

    const result = await gateway.generate({
      messages: [{ role: 'user', content: 'oi' }],
      temperature: 0.5,
      maxTokens: 100,
    });

    expect(result.text).toBe('oi remoto');
    expect(calls[0]!.url).toBe('https://api.x/v1/chat/completions');
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret');
    const parsed = JSON.parse(calls[0]!.init!.body as string) as {
      model: string;
      messages: unknown;
      max_tokens: number;
    };
    expect(parsed.model).toBe('gpt-x');
    expect(parsed.messages).toEqual([{ role: 'user', content: 'oi' }]);
    expect(parsed.max_tokens).toBe(100);
  });

  it('sem baseUrl lança na criação', () => {
    const { deps } = stubFetch(jsonResponse({}));
    expect(() =>
      createRemoteProvider({ provider: 'remote', apiKey: 'k', model: 'm' }, deps),
    ).toThrow(ModelGatewayError);
  });

  it('sem apiKey lança na criação', () => {
    const { deps } = stubFetch(jsonResponse({}));
    expect(() =>
      createRemoteProvider({ provider: 'remote', baseUrl: 'https://api.x', model: 'm' }, deps),
    ).toThrow(ModelGatewayError);
  });

  it('sem model lança no generate', async () => {
    const { deps } = stubFetch(jsonResponse({}));
    const gateway = createRemoteProvider(
      { provider: 'remote', baseUrl: 'https://api.x', apiKey: 'k' },
      deps,
    );
    await expect(gateway.generate({ messages: [] })).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it('status >= 400 lança ModelGatewayError', async () => {
    const { deps } = stubFetch(jsonResponse({}, 401));
    const gateway = createRemoteProvider({ ...base }, deps);
    await expect(
      gateway.generate({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm test -- remote`
Expected: FAIL — `createRemoteProvider` não existe.

- [ ] **Step 3: Criar `src/providers/remote.ts`**

```ts
import type {
  GenerateRequest,
  GenerateResult,
  HttpDeps,
  ModelGateway,
  ModelGatewayConfig,
} from '../model-gateway.js';
import { ModelGatewayError } from '../errors.js';

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export function createRemoteProvider(
  config: ModelGatewayConfig,
  deps: HttpDeps = { fetch: globalThis.fetch },
): ModelGateway {
  if (config.baseUrl === undefined) {
    throw new ModelGatewayError('Provedor remoto exige "baseUrl".');
  }
  if (config.apiKey === undefined) {
    throw new ModelGatewayError('Provedor remoto exige "apiKey".');
  }
  const baseUrl = config.baseUrl;
  const apiKey = config.apiKey;

  return {
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const model = request.model ?? config.model;
      if (model === undefined) {
        throw new ModelGatewayError('Provedor remoto exige um "model".');
      }

      const body = {
        model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      };

      let response: Response;
      try {
        response = await deps.fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new ModelGatewayError('Falha ao conectar ao provedor remoto.', { cause });
      }

      if (!response.ok) {
        throw new ModelGatewayError(`Provedor remoto respondeu com status ${response.status}.`);
      }

      const data = (await response.json()) as OpenAiChatResponse;
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        throw new ModelGatewayError('Resposta do provedor remoto sem conteúdo de texto.');
      }
      return { text };
    },
  };
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm test -- remote`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/model-gateway/src/providers/remote.ts packages/model-gateway/tests/remote.test.ts
git commit -m "feat(model-gateway): provedor remote OpenAI-compatible com fetch injetado" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Seletor `createModelGateway` + superfície pública `index.ts`

**Files:**
- Modify: `packages/model-gateway/src/model-gateway.ts` (finalizar a fábrica)
- Create: `packages/model-gateway/src/index.ts`
- Test: `packages/model-gateway/tests/model-gateway.test.ts`

**Interfaces:**
- Consumes: `createFakeProvider`, `createOllamaProvider`, `createRemoteProvider`.
- Produces: `createModelGateway(config, deps?)` selecionando por `config.provider`; provedor desconhecido ⇒ `ModelGatewayError`. `src/index.ts` reexporta a superfície pública.

- [ ] **Step 1: Escrever o teste `tests/model-gateway.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createModelGateway } from '../src/model-gateway.js';
import { ModelGatewayError } from '../src/errors.js';
import type { ProviderName } from '../src/model-gateway.js';

describe('createModelGateway', () => {
  it('seleciona o provedor fake e gera texto', async () => {
    const gateway = createModelGateway({ provider: 'fake' });
    const result = await gateway.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(result.text).toBe('[fake] x');
  });

  it('provedor desconhecido lança ModelGatewayError', () => {
    expect(() =>
      createModelGateway({ provider: 'nope' as unknown as ProviderName }),
    ).toThrow(ModelGatewayError);
  });

  it('remote sem apiKey lança na criação (delegado ao provedor)', () => {
    expect(() =>
      createModelGateway({ provider: 'remote', baseUrl: 'https://api.x', model: 'm' }),
    ).toThrow(ModelGatewayError);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm test -- tests/model-gateway`
Expected: FAIL — a fábrica provisória lança "ainda não implementado" para `fake`.

- [ ] **Step 3: Finalizar a fábrica em `src/model-gateway.ts`**

Substituir o corpo provisório de `createModelGateway` (mantendo todas as declarações de tipo acima dele) por:

```ts
import { ModelGatewayError } from './errors.js';
import { createFakeProvider } from './providers/fake.js';
import { createOllamaProvider } from './providers/ollama.js';
import { createRemoteProvider } from './providers/remote.js';

// ... (tipos inalterados: Role, Message, GenerateRequest, GenerateResult,
//      ModelGateway, ProviderName, ModelGatewayConfig, HttpDeps) ...

export function createModelGateway(
  config: ModelGatewayConfig,
  deps: HttpDeps = { fetch: globalThis.fetch },
): ModelGateway {
  switch (config.provider) {
    case 'fake':
      return createFakeProvider(config);
    case 'local':
      return createOllamaProvider(config, deps);
    case 'remote':
      return createRemoteProvider(config, deps);
    default:
      throw new ModelGatewayError(
        `Provedor de modelo desconhecido: ${String(config.provider)}`,
      );
  }
}
```

Nota: os `import` dos provedores vão no topo do arquivo, junto ao `import { ModelGatewayError }` já existente.

- [ ] **Step 4: Criar `src/index.ts`**

```ts
export type {
  Role,
  Message,
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  ModelGatewayConfig,
  ProviderName,
  HttpDeps,
} from './model-gateway.js';
export { createModelGateway } from './model-gateway.js';
export { ModelGatewayError } from './errors.js';
```

- [ ] **Step 5: Rodar typecheck e testes**

Run: `pnpm typecheck && pnpm test -- tests/model-gateway`
Expected: PASS (3 testes do seletor); typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add packages/model-gateway/src/model-gateway.ts packages/model-gateway/src/index.ts packages/model-gateway/tests/model-gateway.test.ts
git commit -m "feat(model-gateway): seletor de provedor por config e superficie publica" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Smoke script de verificação

**Files:**
- Create: `packages/model-gateway/scripts/smoke.ts`

**Interfaces:**
- Consumes: `createModelGateway`, tipos de `../src/index.js`.
- Produces: script executável via `tsx` que instancia o gateway com `--provider fake|local|remote` (+ `--model`, `--prompt`) e imprime a resposta. Config remota/local lida de `ATLAS_MODEL_NAME`, `ATLAS_MODEL_BASE_URL`, `ATLAS_MODEL_API_KEY`.

- [ ] **Step 1: Criar `scripts/smoke.ts`**

```ts
import { parseArgs } from 'node:util';
import { createModelGateway } from '../src/index.js';
import type { ModelGatewayConfig, ProviderName } from '../src/index.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      provider: { type: 'string', default: 'fake' },
      model: { type: 'string' },
      prompt: { type: 'string', default: 'Responda com uma saudação curta.' },
    },
  });

  const model = values.model ?? process.env.ATLAS_MODEL_NAME;
  const baseUrl = process.env.ATLAS_MODEL_BASE_URL;
  const apiKey = process.env.ATLAS_MODEL_API_KEY;

  const config: ModelGatewayConfig = { provider: values.provider as ProviderName };
  if (model !== undefined) config.model = model;
  if (baseUrl !== undefined) config.baseUrl = baseUrl;
  if (apiKey !== undefined) config.apiKey = apiKey;

  const gateway = createModelGateway(config);
  const result = await gateway.generate({
    messages: [{ role: 'user', content: values.prompt as string }],
  });

  process.stdout.write(`${result.text}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar o smoke com o provedor fake (sem rede/credenciais)**

Run: `pnpm --filter @atlas/model-gateway smoke -- --provider fake --prompt "oi"`
Expected: imprime `[fake] oi` e encerra com código `0`.

- [ ] **Step 3: Typecheck cobrindo o script**

Run: `pnpm typecheck`
Expected: PASS (o `tsconfig` inclui `scripts/`).

- [ ] **Step 4: Commit**

```bash
git add packages/model-gateway/scripts/smoke.ts
git commit -m "feat(model-gateway): smoke script para verificar provedores e a troca ao vivo" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Documentação, verificação final e conclusão

**Files:**
- Create: `packages/model-gateway/README.md`
- Create: `packages/model-gateway/CLAUDE.md`
- Modify: `CLAUDE.md` (raiz)
- Modify: `docs/05-context/NEXT_CONTEXT.md`
- Modify: `docs/05-context/CURRENT_SPRINT.md`
- Modify: `implementation/LESSONS_LEARNED.md`
- Modify: `implementation/specs/SPEC-0004-model-gateway.md` (Status → Review)

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: package documentado, documentação do projeto atualizada, SPEC em Review, lições registradas.

- [ ] **Step 1: Criar `packages/model-gateway/README.md`**

```markdown
# @atlas/model-gateway

Acesso padronizado a modelos de IA (Module Catalog: Model Gateway).

`createModelGateway(config)` devolve um `ModelGateway` com uma operação — `generate(request)` (geração única, sem streaming). O provedor é escolhido por `config.provider`:

- `fake` — respostas determinísticas, sem rede (testes).
- `local` — Ollama (`POST {baseUrl}/api/chat`, default `http://localhost:11434`), grátis.
- `remote` — endpoint OpenAI-compatible (`POST {baseUrl}/chat/completions`, `Bearer apiKey`), pago genérico.

Trocar de provedor é só mudar a config; consumidores não conhecem o fornecedor.

## Smoke (verificação manual)

```bash
pnpm --filter @atlas/model-gateway smoke -- --provider fake --prompt "oi"
# local (Ollama rodando):
ATLAS_MODEL_NAME=llama3.2 pnpm --filter @atlas/model-gateway smoke -- --provider local
# remote (endpoint OpenAI-compatible):
ATLAS_MODEL_BASE_URL=https://api.exemplo/v1 ATLAS_MODEL_API_KEY=sk-... ATLAS_MODEL_NAME=gpt-x \
  pnpm --filter @atlas/model-gateway smoke -- --provider remote
```
```

- [ ] **Step 2: Criar `packages/model-gateway/CLAUDE.md`**

```markdown
# @atlas/model-gateway

Adaptador de acesso a modelos de IA (Extension). Sem estado, sem lógica de negócio (Princípio 5/13).

- Interface única `ModelGateway.generate` (geração única; sem streaming/tools).
- Provedor por config: `fake` | `local` (Ollama) | `remote` (OpenAI-compatible).
- Provedores de rede recebem `fetch` por parâmetro (ADR-0004) → testes sem rede; rede real só no smoke.
- Zero deps de runtime além de `@atlas/contracts` (`AtlasError`). `fetch` global; `tsx` é dev tooling.
- Tipos ficam locais; promover a `@atlas/contracts` só com um 2º consumidor, via ADR.
- Não decide objetivo/estratégia, não guarda memória, não executa Tools, não decide permissões.
```

- [ ] **Step 3: Atualizar `CLAUDE.md` (raiz)**

No parágrafo de estado (seção "O que é este repositório"), acrescentar menção ao novo package — que `@atlas/model-gateway` existe com provedores `fake`/`local`/`remote` selecionáveis por config. A entrada genérica "demais packages do catálogo conforme SPECs futuras" na seção "Referenciado na documentação, mas ainda não criado" permanece (outros packages seguem pendentes).

- [ ] **Step 4: Atualizar contexto e lições**

- `docs/05-context/NEXT_CONTEXT.md`: mover SPEC-0004 para concluída (Review→Done conforme aprovação); registrar o package entregue e os padrões reutilizáveis (provedor por config; `fetch` injetado; protocolo OpenAI-compatible para o slot remoto).
- `docs/05-context/CURRENT_SPRINT.md`: refletir o estado da SPEC-0004.
- `implementation/LESSONS_LEARNED.md`: registrar lições (ex.: `exactOptionalPropertyTypes` exige construir config condicionalmente; stub de `fetch` à mão em vez de mock; validação de `baseUrl`/`apiKey` na criação vs. `model` no generate).

- [ ] **Step 5: Mudar o Status da SPEC para `Review`**

Em `implementation/specs/SPEC-0004-model-gateway.md`, alterar `Status` de `Ready` para `Review`.

- [ ] **Step 6: Probe do TypeScript 7 (encaminhamento herdado)**

Run: `pnpm add -Dw typescript@^7 && pnpm lint`
Expected: se passar, manter e registrar em LESSONS_LEARNED; se falhar, reverter com `pnpm add -Dw typescript@^5` (comportamento conhecido do typescript-eslint).

- [ ] **Step 7: Verificação completa da suíte**

Run: `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde; os testes do novo package rodam junto dos demais, sem acesso à rede.

- [ ] **Step 8: Commit**

```bash
git add packages/model-gateway/README.md packages/model-gateway/CLAUDE.md CLAUDE.md docs/05-context/NEXT_CONTEXT.md docs/05-context/CURRENT_SPRINT.md implementation/LESSONS_LEARNED.md implementation/specs/SPEC-0004-model-gateway.md
git commit -m "docs(model-gateway): documentacao do package, licoes e SPEC-0004 em Review" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de verificação (para quem executa)

- **Sem rede nos testes**: todo teste usa `fake` ou `fetch` injetado. Se algum teste tentar rede, é bug de plano — parar e revisar.
- **`exactOptionalPropertyTypes`**: em `smoke.ts` a config é montada condicionalmente (nunca `campo: undefined`). Repetir esse padrão se surgir necessidade parecida.
- **Ordem de resolução do model**: `request.model ?? config.model`; erro só quando ambos ausentes (local/remote). O `fake` ignora `model`.
- **`remote` valida na criação** (`baseUrl`/`apiKey`); `model` valida no `generate`. Os testes cobrem os dois momentos.
- **DoD** (SPEC): critérios de aceitação atendidos, testes verdes, docs atualizadas, arquitetura preservada, revisão concluída, lições registradas. A transição `Review → Done` depende da aprovação do usuário.
