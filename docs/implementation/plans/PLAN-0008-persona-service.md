# SPEC-0008 Persona Service (Jarvis) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `@atlas/persona` (registro de Personas como dados, com Jarvis default + neutral) e injetar o enquadramento de identidade da Persona ativa na geração do Cognitive Core, dando ao Atlas identidade sem uma segunda chamada de modelo.

**Architecture:** A Persona é **configuração de dados**. `createPersonaService()` expõe um registro (`get/has/list`) e deriva um `systemPrompt(persona)` (enquadramento de identidade) dos atributos textuais. O Cognitive Core compõe `personaPrompt` (injetado por parâmetro) com seu enquadramento de tarefa (`TASK_FRAMING`) — o Cognitive **não conhece o conceito de Persona**, recebe só uma string. `@atlas/core` resolve `config.persona` (default `jarvis`), injeta `persona.systemPrompt` no Cognitive e expõe `atlas.persona`. A CLI seleciona por `--persona`/`ATLAS_PERSONA`, exibe no `status` e saúda no `chat`. `respond` permanece função pura. Voz/emoção são slots declarativos inertes.

**Tech Stack:** TypeScript 5.x (strict, NodeNext, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest, `tsx` (dev).

## Global Constraints

- Node ≥ 24, pnpm ≥ 11 via corepack. Diretório de trabalho: `/Users/lohanberg/Documents/Repos/Atlas` (todos os caminhos relativos a ele).
- **Um único package novo:** `@atlas/persona`. Não criar outros módulos. Personas são embutidas no package (não por arquivo externo).
- **A Persona é configuração de dados**, não decide estratégia técnica, não cria Plans, não executa Tasks (Module Catalog). Jarvis é uma configuração, não um novo Core (Glossary).
- **Cognitive desacoplado do conceito de Persona:** recebe `personaPrompt?: string` por parâmetro; nunca importa `@atlas/persona` nem o tipo `Persona`. `respond` permanece **função pura**; o Cognitive segue sem estado.
- **Voz e emoção** são slots declarativos no tipo `Persona`, **sem efeito de runtime** (não entram no `systemPrompt`).
- `@atlas/persona` depende **apenas** de `@atlas/contracts`. Só `@atlas/core` importa implementações de packages (Regra de Dependência 11) — inclusive `@atlas/persona` e `PERSONA_IDS`.
- Precedência de config `flags > env > arquivo > defaults` (ADR-0006; `arquivo` reservado). Persona default: `jarvis`.
- Erro de Persona desconhecida: `AtlasError` com `code: 'ATLAS_PERSONA'`, via subclasse `PersonaError` (espelha `ModelGatewayError`/`ContextError`).
- Imports internos com sufixo `.js` (NodeNext). Sem path aliases. Sem `dist/`.
- `verbatimModuleSyntax`: `import type`/`export type` para tipos; `import`/`export` para valores.
- `exactOptionalPropertyTypes`: nunca atribuir `undefined` a propriedade opcional; construir objetos condicionalmente.
- `noUncheckedIndexedAccess`: acesso indexado retorna `T | undefined` — tratar explicitamente.
- Sem mocks de framework: dependências injetadas por parâmetro; stubs à mão (ADR-0004).
- `typescript` permanece pinado em `^5` (probe do TS 7 na última task).
- Commits: conventional commits em português; cada commit termina com o trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (usar dois `-m`).

---

### Task 1: Package `@atlas/persona` + contrato `Persona`/`PersonaService`

Define o contrato `Persona`/`PersonaService` em `@atlas/contracts` (inerte até a Task 3) e cria o package `@atlas/persona` com o registro embutido (`jarvis`, `neutral`), `createPersonaService()` e `systemPrompt()`, com testes. Fecha verde de forma independente.

**Files:**
- Create: `packages/contracts/src/persona.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/persona/package.json`
- Create: `packages/persona/tsconfig.json`
- Create: `packages/persona/src/personas.ts`
- Create: `packages/persona/src/errors.ts`
- Create: `packages/persona/src/persona-service.ts`
- Create: `packages/persona/src/index.ts`
- Test: `packages/persona/tests/persona-service.test.ts`

**Interfaces:**
- Consumes: `AtlasError` de `@atlas/contracts`.
- Produces em `@atlas/contracts`: `Persona`, `PersonaService` (ver código abaixo).
- Produces em `@atlas/persona`: `createPersonaService(): PersonaService`; `PERSONA_IDS: readonly string[]`; `class PersonaError extends AtlasError` (code `ATLAS_PERSONA`).

- [ ] **Step 1: Criar `packages/contracts/src/persona.ts`**

```ts
export interface Persona {
  readonly id: string;
  readonly name: string;
  readonly tone: string;
  readonly formality: string;
  readonly language: string;
  readonly style: string;
  readonly communicationRules: readonly string[];
  readonly voice: string;
  readonly emotion: string;
}

export interface PersonaService {
  get(id: string): Persona;
  has(id: string): boolean;
  list(): readonly string[];
  systemPrompt(persona: Persona): string;
}
```

- [ ] **Step 2: Exportar os tipos em `packages/contracts/src/index.ts`**

Adicionar, após a linha `export type { ContextService, SessionId } from './context.js';`:

```ts
export type { Persona, PersonaService } from './persona.js';
```

- [ ] **Step 3: Criar `packages/persona/package.json`**

```json
{
  "name": "@atlas/persona",
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

- [ ] **Step 4: Criar `packages/persona/tsconfig.json`**

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
Expected: instala sem erro; `@atlas/persona` reconhecido (glob `packages/*`).

- [ ] **Step 6: Escrever o teste `packages/persona/tests/persona-service.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { AtlasError } from '@atlas/contracts';
import { createPersonaService } from '../src/index.js';

describe('createPersonaService', () => {
  it('list inclui jarvis e neutral', () => {
    const svc = createPersonaService();
    expect(svc.list()).toEqual(expect.arrayContaining(['jarvis', 'neutral']));
  });

  it('has reconhece personas embutidas e rejeita desconhecidas', () => {
    const svc = createPersonaService();
    expect(svc.has('jarvis')).toBe(true);
    expect(svc.has('neutral')).toBe(true);
    expect(svc.has('nao-existe')).toBe(false);
  });

  it('get(jarvis) retorna a Persona Jarvis', () => {
    const svc = createPersonaService();
    const jarvis = svc.get('jarvis');
    expect(jarvis.id).toBe('jarvis');
    expect(jarvis.name).toBe('Jarvis');
  });

  it('get de persona desconhecida lança AtlasError com code ATLAS_PERSONA', () => {
    const svc = createPersonaService();
    try {
      svc.get('nao-existe');
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(AtlasError);
      expect((e as AtlasError).code).toBe('ATLAS_PERSONA');
    }
  });

  it('systemPrompt inclui nome, tom e estilo, e NÃO inclui voz/emoção', () => {
    const svc = createPersonaService();
    const jarvis = svc.get('jarvis');
    const prompt = svc.systemPrompt(jarvis);
    expect(prompt).toContain('Jarvis');
    expect(prompt).toContain(jarvis.tone);
    expect(prompt).toContain(jarvis.style);
    expect(prompt).not.toContain(jarvis.voice);
    expect(prompt).not.toContain(jarvis.emotion);
  });
});
```

- [ ] **Step 7: Rodar o teste e confirmar que falha**

Run: `pnpm test -- packages/persona`
Expected: FAIL — `createPersonaService` não existe / módulo não resolve.

- [ ] **Step 8: Criar `packages/persona/src/errors.ts`**

```ts
import { AtlasError } from '@atlas/contracts';

export class PersonaError extends AtlasError {
  constructor(message: string, options?: ErrorOptions) {
    super('ATLAS_PERSONA', message, options);
  }
}
```

- [ ] **Step 9: Criar `packages/persona/src/personas.ts`**

```ts
import type { Persona } from '@atlas/contracts';

const jarvis: Persona = {
  id: 'jarvis',
  name: 'Jarvis',
  tone: 'profissional, direto e colaborativo',
  formality: 'informal-respeitoso, tratando o usuário como parceiro técnico',
  language: 'espelhe o idioma em que o usuário escreveu',
  style: 'objetivo e técnico, sem rodeios, com exemplos concretos quando ajudam',
  communicationRules: [
    'Priorize produtividade, desenvolvimento de software e colaboração técnica.',
    'Seja conciso; evite preâmbulos desnecessários.',
    'Quando não souber, diga; nunca invente.',
  ],
  voice: 'neutra e serena (placeholder; sem renderização de áudio nesta versão)',
  emotion: 'calmo e confiante',
};

const neutral: Persona = {
  id: 'neutral',
  name: 'Assistente',
  tone: 'neutro e objetivo',
  formality: 'neutra',
  language: 'espelhe o idioma em que o usuário escreveu',
  style: 'claro e direto',
  communicationRules: [],
  voice: '',
  emotion: '',
};

export const PERSONAS: Readonly<Record<string, Persona>> = { jarvis, neutral };

export const PERSONA_IDS: readonly string[] = Object.keys(PERSONAS);
```

- [ ] **Step 10: Criar `packages/persona/src/persona-service.ts`**

```ts
import type { Persona, PersonaService } from '@atlas/contracts';
import { PERSONAS } from './personas.js';
import { PersonaError } from './errors.js';

export function createPersonaService(): PersonaService {
  return {
    get(id: string): Persona {
      const persona = PERSONAS[id];
      if (persona === undefined) {
        throw new PersonaError(`Persona desconhecida: ${id}`);
      }
      return persona;
    },
    has(id: string): boolean {
      return Object.hasOwn(PERSONAS, id);
    },
    list(): readonly string[] {
      return Object.keys(PERSONAS);
    },
    systemPrompt(persona: Persona): string {
      const parts = [
        `Você é ${persona.name}.`,
        `Tom: ${persona.tone}.`,
        `Formalidade: ${persona.formality}.`,
        `Idioma: ${persona.language}.`,
        `Estilo: ${persona.style}.`,
      ];
      if (persona.communicationRules.length > 0) {
        parts.push(`Regras de comunicação: ${persona.communicationRules.join(' ')}`);
      }
      return parts.join(' ');
    },
  };
}
```

- [ ] **Step 11: Criar `packages/persona/src/index.ts`**

```ts
export { createPersonaService } from './persona-service.js';
export { PERSONA_IDS } from './personas.js';
export { PersonaError } from './errors.js';
```

- [ ] **Step 12: Rodar o teste e confirmar que passa**

Run: `pnpm test -- packages/persona`
Expected: PASS (5 testes verdes).

- [ ] **Step 13: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde. Se `format:check` reclamar dos novos arquivos, rode `pnpm format` e repita.

- [ ] **Step 14: Commit**

```bash
git add packages/contracts/src/persona.ts packages/contracts/src/index.ts packages/persona pnpm-lock.yaml
git commit -m "feat(persona): @atlas/persona registro de Personas (jarvis, neutral)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Cognitive Core compõe identidade + tarefa (`personaPrompt` injetado)

Renomeia `SYSTEM_PROMPT` → `TASK_FRAMING` (enquadramento de tarefa, sem identidade) e faz o Cognitive Core compor `personaPrompt` (injetado, opcional) com ele. `respond` permanece puro. Atualiza os testes do package. Nenhum consumidor passa `personaPrompt` ainda, então a suíte fecha.

**Files:**
- Modify: `packages/cognitive/src/cognitive-core.ts`
- Modify: `packages/cognitive/src/index.ts`
- Test: `packages/cognitive/tests/cognitive-core.test.ts`
- Test: `packages/cognitive/tests/conversation.test.ts`

**Interfaces:**
- Consumes: `Message`, `ModelGateway`, `CognitiveCore`, `Conversation`, `ConversationTurn` de `@atlas/contracts`.
- Produces: `TASK_FRAMING` (substitui `SYSTEM_PROMPT`); `CognitiveCoreDeps` ganha `personaPrompt?: string`. Regra de composição: `system = personaPrompt ? \`${personaPrompt}\n\n${TASK_FRAMING}\` : TASK_FRAMING`.

- [ ] **Step 1: Atualizar os testes `packages/cognitive/tests/cognitive-core.test.ts`**

Substituir o arquivo inteiro por:

```ts
import { describe, expect, it } from 'vitest';
import type { GenerateRequest, GenerateResult, ModelGateway } from '@atlas/contracts';
import { createCognitiveCore, TASK_FRAMING } from '../src/index.js';

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
  it('sem personaPrompt usa só o enquadramento de tarefa', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'resposta do modelo' }));
    const core = createCognitiveCore({ gateway });

    const answer = await core.ask('resuma este texto');

    expect(answer).toBe('resposta do modelo');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'resuma este texto' },
    ]);
  });

  it('com personaPrompt compõe identidade + tarefa no system message', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({ gateway, personaPrompt: 'Você é Jarvis.' });

    await core.ask('oi');

    expect(calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: `Você é Jarvis.\n\n${TASK_FRAMING}`,
    });
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

- [ ] **Step 2: Atualizar os testes `packages/cognitive/tests/conversation.test.ts`**

Substituir o arquivo inteiro por:

```ts
import { describe, expect, it } from 'vitest';
import type { GenerateRequest, GenerateResult, ModelGateway } from '@atlas/contracts';
import { createCognitiveCore, TASK_FRAMING } from '../src/index.js';

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

describe('createCognitiveCore conversa', () => {
  it('startConversation semeia o system prompt de tarefa (sem persona)', () => {
    const { gateway } = stubGateway(async () => ({ text: '' }));
    const core = createCognitiveCore({ gateway });
    const conv = core.startConversation();
    expect(conv.messages).toEqual([{ role: 'system', content: TASK_FRAMING }]);
  });

  it('startConversation semeia identidade + tarefa quando há personaPrompt', () => {
    const { gateway } = stubGateway(async () => ({ text: '' }));
    const core = createCognitiveCore({ gateway, personaPrompt: 'Você é Jarvis.' });
    const conv = core.startConversation();
    expect(conv.messages).toEqual([
      { role: 'system', content: `Você é Jarvis.\n\n${TASK_FRAMING}` },
    ]);
  });

  it('respond monta [historico, user], chama generate uma vez e anexa a resposta', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'oi de volta' }));
    const core = createCognitiveCore({ gateway });

    const { reply, conversation } = await core.respond(core.startConversation(), 'oi');

    expect(reply).toBe('oi de volta');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'oi' },
    ]);
    expect(conversation.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'oi de volta' },
    ]);
  });

  it('respond é pura: não muta a conversa de entrada', async () => {
    const { gateway } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({ gateway });
    const conv0 = core.startConversation();
    await core.respond(conv0, 'oi');
    expect(conv0.messages).toEqual([{ role: 'system', content: TASK_FRAMING }]);
  });

  it('multi-turno acumula o histórico', async () => {
    const { gateway, calls } = stubGateway(async (req) => ({
      text: `resp:${req.messages.at(-1)!.content}`,
    }));
    const core = createCognitiveCore({ gateway });
    const turn1 = await core.respond(core.startConversation(), 'primeira');
    const turn2 = await core.respond(turn1.conversation, 'segunda');
    expect(turn2.conversation.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'primeira' },
      { role: 'assistant', content: 'resp:primeira' },
      { role: 'user', content: 'segunda' },
      { role: 'assistant', content: 'resp:segunda' },
    ]);
    expect(calls[1]!.messages).toHaveLength(4);
  });

  it('propaga erro do gateway em respond', async () => {
    const { gateway } = stubGateway(async () => {
      throw new Error('modelo indisponível');
    });
    const core = createCognitiveCore({ gateway });
    await expect(core.respond(core.startConversation(), 'oi')).rejects.toThrow(
      'modelo indisponível',
    );
  });
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `pnpm test -- packages/cognitive`
Expected: FAIL — `TASK_FRAMING` não é exportado (ainda é `SYSTEM_PROMPT`) e `personaPrompt` não é composto.

- [ ] **Step 4: Alterar `packages/cognitive/src/cognitive-core.ts`**

Substituir o arquivo inteiro por:

```ts
import type {
  CognitiveCore,
  Conversation,
  ConversationTurn,
  Message,
  ModelGateway,
} from '@atlas/contracts';

export const TASK_FRAMING =
  'Responda ao objetivo do usuário de forma clara, correta e objetiva, ' +
  'no mesmo idioma em que ele escreveu. ' +
  'Se faltar informação essencial, diga o que precisa saber em vez de supor.';

export interface CognitiveCoreDeps {
  gateway: ModelGateway;
  personaPrompt?: string;
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway, personaPrompt } = deps;
  const systemPrompt = personaPrompt ? `${personaPrompt}\n\n${TASK_FRAMING}` : TASK_FRAMING;

  return {
    async ask(objective: string): Promise<string> {
      const result = await gateway.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: objective },
        ],
      });
      return result.text;
    },

    startConversation(): Conversation {
      return { messages: [{ role: 'system', content: systemPrompt }] };
    },

    async respond(conversation: Conversation, input: string): Promise<ConversationTurn> {
      const withUser: Message[] = [...conversation.messages, { role: 'user', content: input }];
      const result = await gateway.generate({ messages: withUser });
      const messages: Message[] = [...withUser, { role: 'assistant', content: result.text }];
      return { reply: result.text, conversation: { messages } };
    },
  };
}
```

- [ ] **Step 5: Atualizar `packages/cognitive/src/index.ts`**

Substituir o conteúdo inteiro por:

```ts
export { createCognitiveCore, TASK_FRAMING } from './cognitive-core.js';
export type { CognitiveCoreDeps } from './cognitive-core.js';
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `pnpm test -- packages/cognitive`
Expected: PASS.

- [ ] **Step 7: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde (o core ainda chama `createCognitiveCore({ gateway })`, válido; `personaPrompt` é opcional).

- [ ] **Step 8: Commit**

```bash
git add packages/cognitive/src/cognitive-core.ts packages/cognitive/src/index.ts packages/cognitive/tests/cognitive-core.test.ts packages/cognitive/tests/conversation.test.ts
git commit -m "feat(cognitive): compoe personaPrompt injetado com o enquadramento de tarefa" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Config `persona` + composição no `@atlas/core` (injeta e expõe)

Adiciona `persona` a `AtlasConfig`/`AtlasConfigOverride` e a `AtlasPlatform`, valida em `loadConfig`, e faz `createAtlas` resolver a Persona ativa, injetar seu `systemPrompt` no Cognitive e expor `atlas.persona`. As adições de campos obrigatórios e seus fornecimentos landam juntos (typecheck atômico).

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
- Consumes: `createPersonaService`, `PERSONA_IDS` de `@atlas/persona`; `Persona` de `@atlas/contracts`.
- Produces: `AtlasConfig.persona: string`; `AtlasConfigOverride.persona?: string`; `AtlasPlatform.persona: Persona`; `createAtlas` injeta `personaPrompt` e expõe `atlas.persona`. `defaultConfig().persona === 'jarvis'`.

- [ ] **Step 1: Escrever os testes de config em `packages/core/tests/load-config.test.ts`**

Adicionar, dentro do `describe('loadConfig', ...)`, após o teste `'aplica os defaults de model'`:

```ts
  it('persona default é jarvis', () => {
    expect(loadConfig().persona).toBe('jarvis');
  });

  it('aceita persona conhecida (neutral)', () => {
    expect(loadConfig({ persona: 'neutral' }).persona).toBe('neutral');
  });

  it('rejeita persona desconhecida', () => {
    expect(() => loadConfig({ persona: 'batman' })).toThrow(InvalidConfigError);
  });
```

- [ ] **Step 2: Escrever o teste de plataforma em `packages/core/tests/create-atlas.test.ts`**

Adicionar, dentro do `describe('createAtlas', ...)`, após o último `it`:

```ts
  it('expõe a Persona ativa (default jarvis) e injeta sua identidade no cognitive', async () => {
    const atlas = await createAtlas({ config: { model: { provider: 'fake' } } });
    expect(atlas.persona.id).toBe('jarvis');
    const conv = atlas.cognitive.startConversation();
    expect(conv.messages[0]!.content).toContain('Jarvis');
    await atlas.shutdown();
  });

  it('seleciona a persona neutral por config', async () => {
    const atlas = await createAtlas({
      config: { persona: 'neutral', model: { provider: 'fake' } },
    });
    expect(atlas.persona.id).toBe('neutral');
    await atlas.shutdown();
  });
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `pnpm test -- packages/core`
Expected: FAIL — `persona` não existe em `AtlasConfig`/`AtlasPlatform`; `loadConfig` não valida; `createAtlas` não expõe `persona`.

- [ ] **Step 4: Adicionar `persona` ao contrato de config em `packages/contracts/src/config.ts`**

Substituir o conteúdo inteiro por:

```ts
import type { ModelGatewayConfig } from './model.js';

export type LogLevel = 'silent' | 'error' | 'info' | 'debug';

export const LOG_LEVELS: readonly LogLevel[] = ['silent', 'error', 'info', 'debug'];

export interface AtlasConfig {
  readonly logLevel: LogLevel;
  readonly dataDir: string;
  readonly persona: string;
  readonly model: ModelGatewayConfig;
}

export interface AtlasConfigOverride {
  logLevel?: LogLevel;
  dataDir?: string;
  persona?: string;
  model?: Partial<ModelGatewayConfig>;
}
```

- [ ] **Step 5: Adicionar `persona` a `AtlasPlatform` em `packages/contracts/src/platform.ts`**

Substituir o conteúdo inteiro por:

```ts
import type { AtlasConfig } from './config.js';
import type { CognitiveCore } from './cognitive.js';
import type { ContextService } from './context.js';
import type { Persona } from './persona.js';

export type LifecycleState = 'created' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface AtlasPlatform {
  readonly state: LifecycleState;
  readonly config: AtlasConfig;
  readonly persona: Persona;
  readonly cognitive: CognitiveCore;
  readonly context: ContextService;
  shutdown(): Promise<void>;
}
```

- [ ] **Step 6: Adicionar a dependência em `packages/core/package.json`**

No bloco `"dependencies"`, adicionar `"@atlas/persona": "workspace:*"` mantendo a ordem alfabética junto aos demais `@atlas/*`. Bloco resultante esperado:

```json
  "dependencies": {
    "@atlas/cognitive": "workspace:*",
    "@atlas/context": "workspace:*",
    "@atlas/contracts": "workspace:*",
    "@atlas/model-gateway": "workspace:*",
    "@atlas/persona": "workspace:*"
  }
```

(Se algum nome divergir, apenas insira a linha `@atlas/persona` preservando os demais.)

- [ ] **Step 7: Relinkar o workspace**

Run: `pnpm install`
Expected: instala sem erro; `@atlas/core` passa a enxergar `@atlas/persona`.

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
    model: {
      provider: 'local',
      model: 'llama3.2',
    },
  };
}
```

- [ ] **Step 9: Validar `persona` em `packages/core/src/config/load-config.ts`**

Adicionar o import no topo (junto aos demais), logo após a linha `import { defaultConfig } from './defaults.js';`:

```ts
import { PERSONA_IDS } from '@atlas/persona';
```

No objeto `merged`, adicionar o campo `persona` após `dataDir`:

```ts
  const merged: AtlasConfig = {
    logLevel: override.logLevel ?? defaults.logLevel,
    dataDir: override.dataDir ?? defaults.dataDir,
    persona: override.persona ?? defaults.persona,
    model,
  };
```

E adicionar a validação, após o bloco que valida `dataDir`:

```ts
  if (!PERSONA_IDS.includes(merged.persona)) {
    issues.push(
      `persona deve ser um de: ${PERSONA_IDS.join(', ')} (recebido: ${String(merged.persona)})`,
    );
  }
```

- [ ] **Step 10: Compor a Persona em `packages/core/src/index.ts`**

Adicionar o import junto aos outros imports de implementação (após `import { createContextService } from '@atlas/context';`):

```ts
import { createPersonaService } from '@atlas/persona';
```

Dentro de `createAtlas`, após `const config = loadConfig(options.config);`, resolver a Persona e usá-la na composição do cognitive. Substituir o trecho:

```ts
  const config = loadConfig(options.config);
  const gateway = createModelGateway(config.model, { fetch: deps.fetch ?? globalThis.fetch });
  const cognitive = createCognitiveCore({ gateway });
  const lifecycle = createLifecycle();
```

por:

```ts
  const config = loadConfig(options.config);
  const personaService = createPersonaService();
  const persona = personaService.get(config.persona);
  const gateway = createModelGateway(config.model, { fetch: deps.fetch ?? globalThis.fetch });
  const cognitive = createCognitiveCore({
    gateway,
    personaPrompt: personaService.systemPrompt(persona),
  });
  const lifecycle = createLifecycle();
```

No objeto retornado, adicionar `persona,` após `config,`:

```ts
  return {
    get state() {
      return lifecycle.state;
    },
    config,
    persona,
    cognitive,
    context,
    shutdown: () => lifecycle.shutdown(),
  };
```

- [ ] **Step 11: Atualizar o mock de `AtlasPlatform` em `apps/cli/tests/status.test.ts`**

No literal `const atlas: AtlasPlatform = { ... }`, adicionar `persona: 'jarvis'` ao objeto `config` (após `dataDir`) e adicionar o campo `persona` ao `atlas` (após `config`), assim:

No `config`:

```ts
      config: {
        logLevel: 'info',
        dataDir: '/home/x/.atlas',
        persona: 'jarvis',
        model: { provider: 'local', model: 'llama3.2' },
      },
```

E, logo após o bloco `config: { ... },`, adicionar:

```ts
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
git commit -m "feat(core): resolve persona ativa, injeta identidade e expoe atlas.persona" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: CLI — seleção (`--persona`/env), exibição no status e saudação no chat

Adiciona a flag `--persona` e a env `ATLAS_PERSONA` ao Input Gateway, exibe a Persona ativa no `status`, e faz o `chat` saudar com o nome da Persona ao abrir. Atualiza `HELP_TEXT` e os testes de integração.

**Files:**
- Modify: `apps/cli/src/gateway/input-gateway.ts`
- Modify: `apps/cli/src/run.ts`
- Modify: `apps/cli/src/commands/status.ts`
- Modify: `apps/cli/src/commands/chat.ts`
- Test: `apps/cli/tests/status.test.ts`
- Test: `apps/cli/tests/run.test.ts`

**Interfaces:**
- Consumes: `atlas.persona` (`AtlasPlatform`); `AtlasConfigOverride.persona`.
- Produces: `--persona <id>` e `ATLAS_PERSONA` → `configOverride.persona` (flag > env); `status` escreve `persona: <name> (<id>)`; `chat` escreve `<name>: <saudação>\n` antes do loop.

- [ ] **Step 1: Escrever/atualizar os testes**

Em `apps/cli/tests/status.test.ts`, dentro do `it('renderiza estado e config resolvida', ...)`, após a linha `expect(text).toContain('dataDir: /home/x/.atlas');`, adicionar:

```ts
    expect(text).toContain('persona: Jarvis (jarvis)');
```

Em `apps/cli/tests/run.test.ts` a saudação da Persona passa a preceder toda saída do `chat`. Fazer três mudanças:

(a) No teste existente `'erro de modelo no chat imprime mensagem amigável, mantém o loop e retorna 0'`, trocar a asserção `expect(h.out()).toBe('');` por:

```ts
    expect(h.out()).toBe('Jarvis: olá! Como posso ajudar?\n');
```

(b) Substituir o teste `'chat com fake responde cada linha na ordem e retorna 0'` e o teste `'chat encerra em EOF (linha null) com exit 0'` pelos dois primeiros testes abaixo.

(c) Adicionar os três últimos testes abaixo ao final do `describe`:

```ts
  it('chat com fake saúda como Jarvis e responde cada linha na ordem', async () => {
    const h = harness();
    const code = await run(['chat', '--provider', 'fake'], {}, h.gateways, '0.1.0', {
      createLineReader: () => scriptedReader(['oi', 'tudo bem?', '/sair']),
    });
    expect(code).toBe(0);
    expect(h.out()).toBe('Jarvis: olá! Como posso ajudar?\n[fake] oi\n[fake] tudo bem?\n');
  });

  it('chat encerra em EOF (linha null) com exit 0', async () => {
    const h = harness();
    const code = await run(['chat', '--provider', 'fake'], {}, h.gateways, '0.1.0', {
      createLineReader: () => scriptedReader(['olá']),
    });
    expect(code).toBe(0);
    expect(h.out()).toBe('Jarvis: olá! Como posso ajudar?\n[fake] olá\n');
  });

  it('status mostra a persona ativa (default jarvis)', async () => {
    const h = harness();
    const code = await run(['status'], {}, h.gateways, '0.1.0');
    expect(code).toBe(0);
    expect(h.out()).toContain('persona: Jarvis (jarvis)');
  });

  it('--persona seleciona a persona (neutral) e sobrepõe o env', async () => {
    const h = harness();
    const code = await run(
      ['status', '--persona', 'neutral'],
      { ATLAS_PERSONA: 'jarvis' },
      h.gateways,
      '0.1.0',
    );
    expect(code).toBe(0);
    expect(h.out()).toContain('persona: Assistente (neutral)');
  });

  it('persona inválida retorna 1 com erro de config', async () => {
    const h = harness();
    const code = await run(['status', '--persona', 'batman'], {}, h.gateways, '0.1.0');
    expect(code).toBe(1);
    expect(h.err()).toContain('persona');
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `pnpm test -- apps/cli`
Expected: FAIL — `--persona`/`ATLAS_PERSONA` não reconhecidos; `status` não mostra persona; `chat` não saúda.

- [ ] **Step 3: Adicionar `--persona`/`ATLAS_PERSONA` em `apps/cli/src/gateway/input-gateway.ts`**

Na interface `CliValues`, adicionar após `'data-dir'?: string | undefined;`:

```ts
  persona?: string | undefined;
```

Em `resolveConfigOverride`, na camada env (após o bloco `if (env.ATLAS_DATA_DIR !== undefined) { ... }`):

```ts
  if (env.ATLAS_PERSONA !== undefined) {
    override.persona = env.ATLAS_PERSONA;
  }
```

E na camada flags (após o bloco `if (values['data-dir'] !== undefined) { ... }`):

```ts
  if (values.persona !== undefined) {
    override.persona = values.persona;
  }
```

Em `parseArgvOrThrow`, no objeto `options`, adicionar após `'data-dir': { type: 'string' },`:

```ts
        persona: { type: 'string' },
```

- [ ] **Step 4: Atualizar `HELP_TEXT` em `apps/cli/src/run.ts`**

No `HELP_TEXT`, adicionar a linha da opção `--persona` logo após a linha de `--data-dir`:

```
      --persona <id>   Persona ativa (jarvis|neutral)
```

- [ ] **Step 5: Exibir a Persona no `apps/cli/src/commands/status.ts`**

Substituir o conteúdo inteiro por:

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
      '',
    ].join('\n'),
  );
}
```

- [ ] **Step 6: Saudação da Persona em `apps/cli/src/commands/chat.ts`**

Adicionar a saudação logo antes de abrir a sessão. Substituir a linha:

```ts
  const session = atlas.context.openSession(atlas.cognitive.startConversation());
```

por:

```ts
  output.write(`${atlas.persona.name}: olá! Como posso ajudar?\n`);
  const session = atlas.context.openSession(atlas.cognitive.startConversation());
```

- [ ] **Step 7: Rodar os testes e confirmar que passam**

Run: `pnpm test -- apps/cli`
Expected: PASS.

- [ ] **Step 8: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde.

- [ ] **Step 9: Commit**

```bash
git add apps/cli/src/gateway/input-gateway.ts apps/cli/src/run.ts apps/cli/src/commands/status.ts apps/cli/src/commands/chat.ts apps/cli/tests/status.test.ts apps/cli/tests/run.test.ts
git commit -m "feat(cli): seleciona persona (--persona/env), exibe no status e sauda no chat" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: ADR-0010, documentação, lições e probe do TS 7

Registra a superação do "neutro por design" (ADR-0010), atualiza a documentação viva (incluindo o CLAUDE.md do `@atlas/cognitive`, que deixa de ser "neutro por design"), registra lições, roda o probe do TS 7 e fecha a Definition of Done.

**Files:**
- Create: `docs/06-adr/ADR-0010-persona-injected-generation.md`
- Create: `packages/persona/CLAUDE.md`
- Modify: `packages/cognitive/CLAUDE.md`
- Modify: `CLAUDE.md` (raiz — parágrafo de estado + Mapa)
- Modify: `docs/05-context/NEXT_CONTEXT.md`
- Modify: `docs/05-context/CURRENT_SPRINT.md`
- Modify: `implementation/LESSONS_LEARNED.md`
- Modify: `implementation/specs/SPEC-0008-persona-service.md` (Status → Review)

- [ ] **Step 1: Criar `docs/06-adr/ADR-0010-persona-injected-generation.md`**

```markdown
# ADR-0010 — Persona injetada na geração; neutro-por-design superado

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-13

---

# Contexto

As SPECs 0005–0007 mantiveram o system prompt do Cognitive Core **neutro por design** — uma postura declaradamente provisória, justificada por o Persona Service ainda não existir. A SPEC-0008 cria o Persona Service (`@atlas/persona`), com Jarvis como primeira Persona oficial. Surge a pergunta: como a identidade da Persona chega à resposta sem (a) uma segunda chamada de modelo, (b) tornar o Cognitive Core stateful, nem (c) acoplar o Cognitive ao conceito de Persona?

---

# Decisão

A Persona molda a **geração**, injetando um enquadramento de identidade no system prompt da única chamada `generate`:

- O Persona Service deriva, dos atributos textuais da Persona (nome, tom, formalidade, idioma, estilo, regras), um `systemPrompt(persona): string` — o enquadramento de **identidade**.
- O Cognitive Core recebe esse texto como `personaPrompt?: string` por parâmetro e o compõe com seu enquadramento de **tarefa** (`TASK_FRAMING`): `system = personaPrompt ? \`${personaPrompt}\n\n${TASK_FRAMING}\` : TASK_FRAMING`. O Cognitive **não conhece o conceito de Persona** — só recebe uma string.
- A composição (`@atlas/core`) resolve a Persona ativa (`config.persona`, default `jarvis`) e injeta seu `systemPrompt`. Isso realiza "Persona é usada pelo Cognitive Core" (Module Catalog) **via composição**, sem inverter dependência.
- O "neutro por design" das SPECs 0005–0007 fica **superado**: o Cognitive mantém o enquadramento de tarefa (correção/clareza); a identidade passa a ser responsabilidade da Persona.
- `respond` permanece **função pura**; o Cognitive segue sem estado.

---

# Consequências

Positivas:

- Uma única chamada de modelo; resposta coerente na voz da Persona.
- Cognitive desacoplado do conceito de Persona (recebe string) — testável isoladamente; a Persona é trocável por config.
- Separação limpa: Cognitive = correção; Persona = identidade. Jarvis é configuração, não Core (Glossary).

Custos e riscos:

- O enquadramento de identidade e o de tarefa convivem no mesmo system message; personas mal-escritas podem conflitar com o enquadramento de tarefa. Mitigado por manter o `TASK_FRAMING` enxuto e neutro de identidade.
- Voz e emoção simulada ficam como slots declarativos inertes (sem canal que os consuma); documentado para não virarem superfície fantasma.

---

# Alternativas Consideradas

**Re-estilização na saída (2ª chamada de modelo).** Custaria o dobro e poderia divergir do conteúdo original. Rejeitada.

**Cognitive importa o Persona Service e resolve a identidade por dentro.** Acoplaria o Cognitive ao conceito de Persona e arriscaria estado. Rejeitada — a injeção por parâmetro (string) mantém o baixo acoplamento.

**Manter o neutro e aplicar persona só no Output Gateway.** Perderia a coerência da geração (o modelo não "assume" a identidade ao raciocinar) e exigiria pós-processamento. Rejeitada.
```

- [ ] **Step 2: Criar `packages/persona/CLAUDE.md`**

```markdown
# @atlas/persona

Persona Service (Interaction) — aplica a identidade selecionada à interação (ADR-0010).

- `createPersonaService(): PersonaService` → `get/has/list` sobre um registro embutido de Personas; `systemPrompt(persona)` deriva o enquadramento de identidade dos atributos textuais.
- Personas embutidas: `jarvis` (default) e `neutral`. `PERSONA_IDS` lista os ids conhecidos (fonte da validação de config no core).
- Persona é **configuração de dados** (Glossary: "Jarvis será uma configuração de Persona, não um novo Core"). Não decide estratégia, não cria Plans, não executa Tasks (Module Catalog).
- A identidade é **injetada na geração** do Cognitive Core (ADR-0010): o core passa `persona.systemPrompt(...)` como `personaPrompt`. O Cognitive não conhece o conceito de Persona.
- Voz e emoção são slots **declarativos e inertes** (sem canal de áudio/afeto; não entram no `systemPrompt`).
- Depende só de `@atlas/contracts`. Erro de persona desconhecida: `PersonaError` (`AtlasError` code `ATLAS_PERSONA`).
```

- [ ] **Step 3: Atualizar `packages/cognitive/CLAUDE.md`**

Remover/ajustar a afirmação de que o system prompt é "neutro por design". READ o arquivo primeiro; então trocar o bullet sobre o system prompt neutro por um que descreva o novo comportamento: o Cognitive compõe um `personaPrompt` (injetado por parâmetro, opcional) com seu enquadramento de tarefa (`TASK_FRAMING`); a identidade é do Persona Service (ADR-0010); o Cognitive não conhece o conceito de Persona (recebe string). Manter os demais bullets (sem estado, `respond` puro, depende só de `@atlas/contracts`).

- [ ] **Step 4: Atualizar `CLAUDE.md` (raiz)**

No parágrafo de estado, acrescentar `@atlas/persona` à lista de packages, descrevendo em uma frase: "existe `@atlas/persona` (`createPersonaService()` → registro de Personas `jarvis`/`neutral`; a identidade da Persona ativa é injetada na geração do Cognitive, ADR-0010; `atlas ask`/`atlas chat` respondem na voz da Persona; `atlas status` a exibe, `atlas chat` a saúda; seleção por `--persona`/`ATLAS_PERSONA`, default `jarvis`)". Atualizar o Mapa com a linha do Persona Service (`packages/persona`) e citar o ADR-0010. Mencionar que o system prompt deixou de ser "neutro por design".

- [ ] **Step 5: Atualizar `docs/05-context/NEXT_CONTEXT.md`**

- Mover a SPEC-0008 para o "Estado Imediato" como `Review`, descrevendo a entrega (`@atlas/persona`, injeção na geração, `atlas.persona`, CLI seleção/exibição/saudação, ADR-0010).
- Registrar que o Cognitive deixou de ser "neutro por design" (agora compõe persona + tarefa).
- Atualizar a contagem de testes após a suíte (Step 8) e o resultado do probe do TS 7 (Step 7) nas Pendências.
- Atualizar o "Mapa Rápido" com o Persona Service e o ADR-0010.
- Trocar a seção "Próximo Trabalho" para SPEC-0009 (a definir), removendo o Persona Service das candidatas e mantendo as demais (Planner/Runtime/Memory, contexto de ambiente, provedor Anthropic, config por arquivo, distribuição da CLI, troca de persona em runtime como extensão desta).

- [ ] **Step 6: Atualizar `docs/05-context/CURRENT_SPRINT.md`**

Adicionar a linha `| SPEC-0008 | Persona Service (Jarvis) | Review |` na tabela, no mesmo formato das demais.

- [ ] **Step 7: Probe do TypeScript 7**

Run: `pnpm add -Dw typescript@^7 && pnpm lint`
- Se **passar**: manter e anotar em `NEXT_CONTEXT.md`/`LESSONS_LEARNED.md` a adoção do TS 7.
- Se **falhar** (esperado, como nas 4 tentativas anteriores): reverter com `pnpm add -Dw typescript@^5` e registrar o probe falho na data de hoje (2026-07-13). Ao final, `typescript` deve estar em `^5` com a suíte verde.

- [ ] **Step 8: Registrar lições e rodar a Definition of Done**

Adicionar em `implementation/LESSONS_LEARNED.md` uma seção da SPEC-0008 cobrindo: (a) Persona injetada na geração com o Cognitive desacoplado do conceito (recebe string) — ADR-0010; (b) validação de `config.persona` importando `PERSONA_IDS` de `@atlas/persona` para manter fonte única (core é composition root, pode importar impl); (c) adicionar campo obrigatório a `AtlasConfig`/`AtlasPlatform` exige atualizar os literais/mocks (`apps/cli/tests/status.test.ts`) atomicamente; (d) voz/emoção como slots declarativos inertes; (e) resultado do probe do TS 7.

Run (verificação final): `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde. Anotar a contagem final de testes no NEXT_CONTEXT.

- [ ] **Step 9: Marcar a SPEC como Review**

Em `implementation/specs/SPEC-0008-persona-service.md`, mudar o Status para `Review` (marcar `[x] Review`, desmarcar `[x] Draft`).

- [ ] **Step 10: Commit**

```bash
git add docs/ packages/persona/CLAUDE.md packages/cognitive/CLAUDE.md CLAUDE.md implementation/LESSONS_LEARNED.md implementation/specs/SPEC-0008-persona-service.md package.json pnpm-lock.yaml
git commit -m "docs(persona): ADR-0010, documentacao e licoes da SPEC-0008 (Review)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Ordem de gates:** cada task termina verde na suíte inteira (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`), permitindo review entre tasks.
- **`pnpm test -- <path>`** roda um subconjunto (vitest); a verificação de fechamento de cada task usa a suíte inteira.
- **Se o executor de comandos do harness ficar indisponível**, o usuário pode rodar as verificações com o prefixo `!`.
- **RTK mascara saída/erros**; para ver o completo use `rtk proxy <cmd>` (log em `~/Library/Application Support/rtk/tee/`).
- **`Done` só após aprovação humana** do review (processo do projeto): esta implementação para em `Review`.
```
