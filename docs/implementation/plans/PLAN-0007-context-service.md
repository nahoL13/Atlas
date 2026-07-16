# [SPEC-0007](../specs/SPEC-0007-context-service.md) Context Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `packages/context` (`@atlas/context`) — um store de sessão em memória que passa a ser o detentor do estado temporário de conversa — e migrar `atlas chat` para usá-lo, pagando a dívida do [ADR-0008](../../06-adr/ADR-0008-conversation-as-data.md) sem alterar o contrato do Cognitive Core.

**Architecture:** O Context Service é um **store de valor**: guarda uma `Conversation` (valor imutável, ADR-0008) por sessão num `Map<SessionId, Conversation>` em memória. Expõe `openSession/getConversation/updateConversation/closeSession`. O contrato vive em `@atlas/contracts`; `@atlas/core` compõe o serviço e o expõe em `atlas.context`. A CLI `runChat` lê a conversa do Context, chama `cognitive.respond` (**função pura, inalterada**) e grava o resultado de volta — a app é a mediadora; o Context não orquestra nem conhece system prompt. Nada em rede, nada persistido.

**Tech Stack:** TypeScript 5.x (strict, NodeNext, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest, `tsx` (dev), `crypto.randomUUID` (global Web Crypto do Node ≥ 24).

## Global Constraints

- Node ≥ 24, pnpm ≥ 11 via corepack. Diretório de trabalho: `/Users/lohanberg/Documents/Repos/Atlas` (todos os caminhos relativos a ele).
- **Um único package novo:** `@atlas/context`. Não criar `packages/memory` nem stubar o Memory Service. Não modelar campos de ambiente (cwd/repo/branch/arquivos).
- **`CognitiveCore` intocado:** o diff não pode tocar `packages/cognitive/src/cognitive-core.ts` nem `packages/contracts/src/cognitive.ts`. `respond` permanece função pura; `startConversation` continua semeando a conversa inicial (autoridade do system prompt é do Cognitive).
- O Context é **store de valor**, não orquestrador: não decide estratégia, não chama o Cognitive Core, não conhece system prompt.
- `@atlas/context` depende **apenas** de `@atlas/contracts`. Só `@atlas/core` pode importar implementações de packages (Regra de Dependência 11).
- Imports entre packages só via nome `@atlas/*`; imports internos com sufixo `.js` (NodeNext). Sem path aliases. Sem `dist/`.
- `verbatimModuleSyntax`: `import type`/`export type` para tipos; `import`/`export` para valores.
- `exactOptionalPropertyTypes`: nunca atribuir `undefined` a propriedade opcional.
- `noUncheckedIndexedAccess`: `Map.get()` retorna `T | undefined` — tratar explicitamente (nunca `!` sem garantia).
- Sem mocks de framework: dependências injetadas por parâmetro; stubs à mão ([ADR-0004](../../06-adr/ADR-0004-manual-composition.md)).
- Erro de sessão inexistente: `AtlasError` com `code: 'ATLAS_CONTEXT'`, via subclasse `ContextError` (espelha `ModelGatewayError`).
- `typescript` permanece pinado em `^5` (probe do TS 7 na última task).
- Commits: conventional commits em português; cada commit termina com o trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (usar dois `-m`).

---

### Task 1: Contrato + package `@atlas/context` (store de sessão)

Define o contrato `ContextService`/`SessionId` em `@atlas/contracts` e cria o package `@atlas/context` com `createContextService()` e seus testes. Novos tipos exportados em contracts são inertes (nenhum consumidor ainda), então a suíte fecha ao final desta task de forma independente.

**Files:**
- Create: `packages/contracts/src/context.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/context/package.json`
- Create: `packages/context/tsconfig.json`
- Create: `packages/context/src/errors.ts`
- Create: `packages/context/src/context-service.ts`
- Create: `packages/context/src/index.ts`
- Test: `packages/context/tests/context-service.test.ts`

**Interfaces:**
- Consumes: `Conversation`, `Message`, `AtlasError` de `@atlas/contracts`.
- Produces em `@atlas/contracts`: `type SessionId = string`; `interface ContextService { openSession(conversation: Conversation): SessionId; getConversation(id: SessionId): Conversation; updateConversation(id: SessionId, conversation: Conversation): void; closeSession(id: SessionId): void }`.
- Produces em `@atlas/context`: `createContextService(): ContextService`; `class ContextError extends AtlasError` (code `ATLAS_CONTEXT`).

- [ ] **Step 1: Criar `packages/contracts/src/context.ts`**

```ts
import type { Conversation } from './cognitive.js';

export type SessionId = string;

export interface ContextService {
  openSession(conversation: Conversation): SessionId;
  getConversation(id: SessionId): Conversation;
  updateConversation(id: SessionId, conversation: Conversation): void;
  closeSession(id: SessionId): void;
}
```

- [ ] **Step 2: Exportar os tipos em `packages/contracts/src/index.ts`**

Adicionar, após a linha `export type { CognitiveCore, Conversation, ConversationTurn } from './cognitive.js';`:

```ts
export type { ContextService, SessionId } from './context.js';
```

- [ ] **Step 3: Criar `packages/context/package.json`**

```json
{
  "name": "@atlas/context",
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

- [ ] **Step 4: Criar `packages/context/tsconfig.json`**

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
Expected: instala sem erro; `@atlas/context` reconhecido (o glob `packages/*` do `pnpm-workspace.yaml` já o cobre). Se sair com `ERR_PNPM_IGNORED_BUILDS`, verifique `allowBuilds` em `pnpm-workspace.yaml` (já contém `esbuild: true`).

- [ ] **Step 6: Escrever o teste `packages/context/tests/context-service.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Conversation } from '@atlas/contracts';
import { AtlasError } from '@atlas/contracts';
import { createContextService } from '../src/index.js';

function conv(content: string): Conversation {
  return { messages: [{ role: 'system', content }] };
}

describe('createContextService', () => {
  it('open→get devolve exatamente a conversa guardada', () => {
    const ctx = createContextService();
    const c = conv('inicial');
    const id = ctx.openSession(c);
    expect(ctx.getConversation(id)).toBe(c);
  });

  it('update substitui a conversa da sessão', () => {
    const ctx = createContextService();
    const id = ctx.openSession(conv('v1'));
    const v2 = conv('v2');
    ctx.updateConversation(id, v2);
    expect(ctx.getConversation(id)).toBe(v2);
  });

  it('sessões são isoladas entre si', () => {
    const ctx = createContextService();
    const a = ctx.openSession(conv('a'));
    const b = ctx.openSession(conv('b'));
    expect(a).not.toBe(b);
    expect(ctx.getConversation(a)).not.toBe(ctx.getConversation(b));
  });

  it('close remove a sessão', () => {
    const ctx = createContextService();
    const id = ctx.openSession(conv('x'));
    ctx.closeSession(id);
    expect(() => ctx.getConversation(id)).toThrow(AtlasError);
  });

  it('get/update/close em sessão inexistente lançam AtlasError com code ATLAS_CONTEXT', () => {
    const ctx = createContextService();
    const missing = 'nao-existe';
    const actions: Array<() => void> = [
      () => ctx.getConversation(missing),
      () => ctx.updateConversation(missing, conv('y')),
      () => ctx.closeSession(missing),
    ];
    for (const act of actions) {
      try {
        act();
        throw new Error('deveria ter lançado');
      } catch (e) {
        expect(e).toBeInstanceOf(AtlasError);
        expect((e as AtlasError).code).toBe('ATLAS_CONTEXT');
      }
    }
  });
});
```

- [ ] **Step 7: Rodar o teste e confirmar que falha**

Run: `pnpm test -- packages/context`
Expected: FAIL — `createContextService` não existe / módulo `../src/index.js` não resolve.

- [ ] **Step 8: Criar `packages/context/src/errors.ts`**

```ts
import { AtlasError } from '@atlas/contracts';

export class ContextError extends AtlasError {
  constructor(message: string, options?: ErrorOptions) {
    super('ATLAS_CONTEXT', message, options);
  }
}
```

- [ ] **Step 9: Criar `packages/context/src/context-service.ts`**

```ts
import type { Conversation, ContextService, SessionId } from '@atlas/contracts';
import { ContextError } from './errors.js';

export function createContextService(): ContextService {
  const sessions = new Map<SessionId, Conversation>();

  function mustGet(id: SessionId): Conversation {
    const conversation = sessions.get(id);
    if (conversation === undefined) {
      throw new ContextError(`Sessão desconhecida: ${id}`);
    }
    return conversation;
  }

  return {
    openSession(conversation: Conversation): SessionId {
      const id = crypto.randomUUID();
      sessions.set(id, conversation);
      return id;
    },
    getConversation(id: SessionId): Conversation {
      return mustGet(id);
    },
    updateConversation(id: SessionId, conversation: Conversation): void {
      mustGet(id);
      sessions.set(id, conversation);
    },
    closeSession(id: SessionId): void {
      if (!sessions.delete(id)) {
        throw new ContextError(`Sessão desconhecida: ${id}`);
      }
    },
  };
}
```

- [ ] **Step 10: Criar `packages/context/src/index.ts`**

```ts
export { createContextService } from './context-service.js';
export { ContextError } from './errors.js';
```

- [ ] **Step 11: Rodar o teste e confirmar que passa**

Run: `pnpm test -- packages/context`
Expected: PASS (5 testes verdes).

- [ ] **Step 12: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde. Se o `format:check` reclamar dos arquivos novos, rode `pnpm format` e repita.

- [ ] **Step 13: Commit**

```bash
git add packages/contracts/src/context.ts packages/contracts/src/index.ts packages/context pnpm-lock.yaml
git commit -m "feat(context): @atlas/context store de sessao em memoria" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Compor o Context em `@atlas/core` e expor `atlas.context`

Adiciona `context` a `AtlasPlatform` e faz `createAtlas` compor `createContextService()`. A adição do campo obrigatório e o fornecimento dele acontecem juntos, então o typecheck fecha atomicamente.

**Files:**
- Modify: `packages/contracts/src/platform.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts:15-33`
- Test: `packages/core/tests/create-atlas.test.ts`

**Interfaces:**
- Consumes: `ContextService` de `@atlas/contracts`; `createContextService` de `@atlas/context`.
- Produces: `AtlasPlatform` ganha `readonly context: ContextService`; `createAtlas` passa a expor `atlas.context`.

- [ ] **Step 1: Escrever o teste em `packages/core/tests/create-atlas.test.ts`**

Adicionar dentro do `describe('createAtlas', ...)`, após o último `it`:

```ts
  it('expõe um context que guarda e devolve a conversa da sessão', async () => {
    const atlas = await createAtlas({ config: { model: { provider: 'fake' } } });
    const initial = atlas.cognitive.startConversation();
    const id = atlas.context.openSession(initial);
    expect(atlas.context.getConversation(id)).toBe(initial);

    const turn = await atlas.cognitive.respond(atlas.context.getConversation(id), 'oi');
    atlas.context.updateConversation(id, turn.conversation);
    expect(atlas.context.getConversation(id)).toBe(turn.conversation);

    await atlas.shutdown();
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test -- packages/core/tests/create-atlas.test.ts`
Expected: FAIL — `Property 'context' does not exist on type 'AtlasPlatform'` (erro de tipo em runtime via tsx/vitest) ou o objeto retornado não tem `context`.

- [ ] **Step 3: Adicionar `context` a `AtlasPlatform` em `packages/contracts/src/platform.ts`**

Substituir o conteúdo inteiro por:

```ts
import type { AtlasConfig } from './config.js';
import type { CognitiveCore } from './cognitive.js';
import type { ContextService } from './context.js';

export type LifecycleState = 'created' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface AtlasPlatform {
  readonly state: LifecycleState;
  readonly config: AtlasConfig;
  readonly cognitive: CognitiveCore;
  readonly context: ContextService;
  shutdown(): Promise<void>;
}
```

- [ ] **Step 4: Adicionar a dependência em `packages/core/package.json`**

No bloco `"dependencies"`, adicionar `"@atlas/context": "workspace:*"` (mantendo ordem alfabética junto aos demais `@atlas/*`). Exemplo do bloco resultante:

```json
  "dependencies": {
    "@atlas/cognitive": "workspace:*",
    "@atlas/context": "workspace:*",
    "@atlas/contracts": "workspace:*",
    "@atlas/model-gateway": "workspace:*"
  }
```

(Se algum nome divergir, apenas insira a linha `@atlas/context` preservando os demais.)

- [ ] **Step 5: Relinkar o workspace**

Run: `pnpm install`
Expected: instala sem erro; `@atlas/core` passa a enxergar `@atlas/context`.

- [ ] **Step 6: Compor em `packages/core/src/index.ts`**

Adicionar, junto aos outros imports de implementação (após a linha `import { createCognitiveCore } from '@atlas/cognitive';`):

```ts
import { createContextService } from '@atlas/context';
```

Dentro de `createAtlas`, após `const cognitive = createCognitiveCore({ gateway });`, adicionar:

```ts
  const context = createContextService();
```

No objeto retornado, adicionar `context,` logo após `cognitive,`:

```ts
  return {
    get state() {
      return lifecycle.state;
    },
    config,
    cognitive,
    context,
    shutdown: () => lifecycle.shutdown(),
  };
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `pnpm test -- packages/core/tests/create-atlas.test.ts`
Expected: PASS.

- [ ] **Step 8: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/platform.ts packages/core/package.json packages/core/src/index.ts packages/core/tests/create-atlas.test.ts pnpm-lock.yaml
git commit -m "feat(core): compoe Context Service e expoe atlas.context" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Migrar `atlas chat` para usar `atlas.context` como detentor

Refatoração comportamento-preservador: `runChat` deixa de manter a `Conversation` numa variável de loop e passa a lê-la/gravá-la no Context, fechando a sessão no encerramento. Os testes de `chat` existentes em `run.test.ts` são a rede de segurança (não muda comportamento observável).

**Files:**
- Modify: `apps/cli/src/commands/chat.ts`
- Guard (não modificar): `apps/cli/tests/run.test.ts` (deve seguir verde)

**Interfaces:**
- Consumes: `atlas.context` (`openSession/getConversation/updateConversation/closeSession`), `atlas.cognitive.startConversation/respond`.
- Produces: assinatura de `runChat(atlas, output, lineReader)` inalterada.

- [ ] **Step 1: Rodar os testes de chat como baseline verde**

Run: `pnpm test -- apps/cli/tests/run.test.ts`
Expected: PASS (inclui os 3 casos de `chat`). Este é o baseline que a refatoração deve preservar.

- [ ] **Step 2: Substituir `apps/cli/src/commands/chat.ts` inteiro**

```ts
import { AtlasError, type AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';
import type { LineReader } from '../gateway/line-reader.js';

const EXIT_COMMANDS = new Set(['/sair', '/exit']);

export async function runChat(
  atlas: AtlasPlatform,
  output: OutputGateway,
  lineReader: LineReader,
): Promise<void> {
  const session = atlas.context.openSession(atlas.cognitive.startConversation());
  try {
    for (;;) {
      const line = await lineReader.next('> ');
      if (line === null) {
        break;
      }
      const input = line.trim();
      if (input === '') {
        continue;
      }
      if (EXIT_COMMANDS.has(input)) {
        break;
      }

      try {
        const turn = await atlas.cognitive.respond(atlas.context.getConversation(session), input);
        output.write(`${turn.reply}\n`);
        atlas.context.updateConversation(session, turn.conversation);
      } catch (cause) {
        if (cause instanceof AtlasError && cause.code === 'ATLAS_MODEL_GATEWAY') {
          output.error(
            `Não foi possível obter resposta do modelo: ${cause.message}\n` +
              `Se estiver usando o provedor local, verifique se o Ollama está rodando ` +
              `(ollama serve) e se o modelo foi baixado (ollama pull <model>).\n`,
          );
          continue;
        }
        throw cause;
      }
    }
  } finally {
    atlas.context.closeSession(session);
  }
}
```

- [ ] **Step 3: Rodar os testes de chat e confirmar que seguem verdes**

Run: `pnpm test -- apps/cli/tests/run.test.ts`
Expected: PASS — mesma saída (`[fake] oi\n[fake] tudo bem?\n`, EOF encerra, erro de modelo mantém o loop). Comportamento preservado, agora via Context.

- [ ] **Step 4: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/chat.ts
git commit -m "refactor(cli): atlas chat usa Context Service como detentor da conversa" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: [ADR-0009](../../06-adr/ADR-0009-context-service-value-store.md), documentação, lições e probe do TS 7

Registra a resolução arquitetural (ADR-0009), atualiza a documentação viva, registra lições e fecha a Definition of Done com a suíte completa e o probe do TypeScript 7.

**Files:**
- Create: `docs/06-adr/ADR-0009-context-service-value-store.md`
- Create: `packages/context/CLAUDE.md`
- Modify: `CLAUDE.md` (raiz — parágrafo de estado + Mapa)
- Modify: `docs/05-context/NEXT_CONTEXT.md`
- Modify: `docs/05-context/CURRENT_SPRINT.md`
- Modify: `docs/06-adr/ADR-0008-conversation-as-data.md` (referência ao detentor)
- Modify: `implementation/LESSONS_LEARNED.md`
- Modify: `implementation/specs/SPEC-0007-context-service.md` (Status → Review)

- [ ] **Step 1: Criar `docs/06-adr/ADR-0009-context-service-value-store.md`**

```markdown
# ADR-0009 — Context Service como store de valor; a app medeia

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-13

---

# Contexto

O ADR-0008 tratou a conversa como **dado** e deixou o valor `Conversation` interinamente na CLI, prevendo que "quando o Context Service existir, ele passa a ser o detentor". A SPEC-0007 cria esse Context Service. Surge uma tensão documental: o Module Catalog diz que o Context Service "é utilizado por" o Cognitive Core (sugerindo que o Cognitive lê o Context), enquanto o ADR-0008 mantém `respond` como **função pura**. Se o Cognitive puxasse o histórico do Context por dentro, `respond` deixaria de ser puro — contradição.

---

# Decisão

Nesta fase, o Context Service é um **store de valor**, não um orquestrador:

- Expõe `openSession(conversation) → SessionId`, `getConversation`, `updateConversation`, `closeSession`; guarda uma `Conversation` por sessão em memória.
- **Não** decide estratégia, **não** chama o Cognitive Core, **não** conhece o system prompt (a conversa inicial é semeada por `cognitive.startConversation()`).
- A **aplicação** (hoje `atlas chat`) é a mediadora: lê a conversa do Context, chama o `respond` puro e grava o resultado de volta. A titularidade migra da variável de loop da CLI para o Context; o contrato `respond` fica inalterado (troca de detentor, como o ADR-0008 previu).
- A frase do Module Catalog "Context é utilizado pelo Cognitive Core" refere-se ao **contexto de ambiente** futuro (diretório ativo, repositório, arquivos), que o Cognitive/Planner poderão ler — coisa distinta do buffer de conversa. Essa leitura fica fora do escopo da SPEC-0007.

---

# Consequências

Positivas:

- `respond` continua função pura; o Cognitive Core segue sem estado e sem dependência do Context.
- Limites do Module Catalog preservados: o Context não orquestra; a autoridade de estratégia continua no Cognitive.
- O detentor previsto no ADR-0008 passa a existir sem mudança de contrato.

Custos e riscos:

- A mediação vive na app até que exista uma camada de orquestração dedicada (Planner/Runtime). Aceito como interino e coerente com o MVP.
- Quando o contexto de ambiente for modelado, será preciso decidir como o Cognitive o consome sem reintroduzir estado em `respond` — decisão adiada para a SPEC que o exigir.

---

# Alternativas Consideradas

**Context media o `respond` (`context.respond(sessionId, input)`).** Poria orquestração no Context e inverteria a dependência Cognitive→Context, violando o Module Catalog ("Context não decide estratégias"). Rejeitada.

**Cognitive lê o histórico do Context por dentro.** Tornaria `respond` stateful, contradizendo o ADR-0008. Rejeitada.
```

- [ ] **Step 2: Criar `packages/context/CLAUDE.md`**

```markdown
# @atlas/context

Context Service (Support) — detentor do estado temporário de conversa por sessão (ADR-0008, ADR-0009).

- `createContextService(): ContextService` → `openSession/getConversation/updateConversation/closeSession`; guarda uma `Conversation` por sessão num `Map` em memória. Sessão some ao `closeSession`/fim do processo.
- **Store de valor, não orquestrador** (ADR-0009): não decide estratégia, não chama o Cognitive Core, não conhece system prompt. A app medeia; `cognitive.respond` segue função pura.
- Escopo mínimo (SPEC-0007): só conversa por sessão. Campos de ambiente (cwd/repo/branch/arquivos) e persistência (Memory Service) ficam para SPECs futuras.
- Depende só de `@atlas/contracts`. Erro de sessão inexistente: `ContextError` (`AtlasError` code `ATLAS_CONTEXT`).
- Não persiste conhecimento permanente (isso é do Memory Service, inexistente) — Module Catalog.
```

- [ ] **Step 3: Atualizar `CLAUDE.md` (raiz)**

No parágrafo de estado ("Estado em julho/2026..."), acrescentar `@atlas/context` à lista de packages existentes, descrevendo-o em uma frase: "existe `@atlas/context` (`createContextService()` → store de sessão em memória que guarda a `Conversation` por sessão; o `atlas chat` usa-o como detentor, ADR-0008/0009; `respond` segue puro)". Na tabela/Mapa, acrescentar a linha do Context Service (`packages/context`) e citar o ADR-0009. Remover `packages/context` de qualquer menção a "ainda não criado" se existir.

- [ ] **Step 4: Atualizar `docs/05-context/NEXT_CONTEXT.md`**

- Mover SPEC-0007 para o bloco "Estado Imediato" como `Review` (aprovação humana pendente), descrevendo a entrega (package `@atlas/context`, `atlas.context`, `atlas chat` migrado, ADR-0009).
- Atualizar a contagem de testes após rodar a suíte (Step 8).
- Registrar o resultado do probe do TS 7 (Step 7) nas Pendências Conhecidas.
- Atualizar o "Mapa Rápido" com o Context Service e o ADR-0009.
- Trocar a seção "Próximo Trabalho" para [SPEC-0008](../specs/SPEC-0008-persona-service.md) (a definir), removendo o Context Service das candidatas.

- [ ] **Step 5: Atualizar `docs/05-context/CURRENT_SPRINT.md`**

Refletir a conclusão da implementação da SPEC-0007 (status Review) no estado do sprint, no mesmo formato usado para a [SPEC-0006](../specs/SPEC-0006-atlas-chat.md).

- [ ] **Step 6: Atualizar `docs/06-adr/ADR-0008-conversation-as-data.md`**

No trecho que diz que o detentor é interinamente a CLI, acrescentar uma nota curta: "Realizado na SPEC-0007 / ADR-0009: o detentor passou a ser o `@atlas/context` (`atlas.context`); `respond` permaneceu puro." Não reescrever a decisão — apenas anotar a realização.

- [ ] **Step 7: Probe do TypeScript 7**

Run: `pnpm add -Dw typescript@^7 && pnpm lint`
- Se **passar**: manter e anotar em `NEXT_CONTEXT.md`/`LESSONS_LEARNED.md` que o TS 7 foi adotado.
- Se **falhar** (esperado, como em 2026-07-10/11/12): reverter com `pnpm add -Dw typescript@^5` e registrar o probe falho na data de hoje.

- [ ] **Step 8: Registrar lições e rodar a Definition of Done**

Adicionar em `implementation/LESSONS_LEARNED.md` uma seção da SPEC-0007 cobrindo: (a) Context Service como store de valor / app medeia (ADR-0009); (b) package novo exige `pnpm install` para linkar antes do primeiro teste; (c) adicionar campo obrigatório em `AtlasPlatform` deve ser atômico com o fornecimento em `createAtlas` (senão o typecheck quebra entre tasks); (d) resultado do probe do TS 7.

Run (verificação final): `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde. Anotar a contagem final de testes no NEXT_CONTEXT.

- [ ] **Step 9: Marcar a SPEC como Review**

Em `implementation/specs/SPEC-0007-context-service.md`, mudar o Status para `Review` (marcar `[x] Review`, desmarcar `[x] Draft`).

- [ ] **Step 10: Commit**

```bash
git add docs/ packages/context/CLAUDE.md CLAUDE.md implementation/LESSONS_LEARNED.md implementation/specs/SPEC-0007-context-service.md package.json pnpm-lock.yaml
git commit -m "docs(context): ADR-0009, documentacao e licoes da SPEC-0007 (Review)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Ordem de gates:** cada task termina verde na suíte inteira (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`), permitindo review entre tasks.
- **`pnpm test -- <path>`** roda um subconjunto (vitest); a verificação de fechamento de cada task usa a suíte inteira.
- **Se o executor de comandos do harness ficar indisponível**, o usuário pode rodar as verificações com o prefixo `!` (ex.: `! pnpm test`).
- **RTK mascara saída/erros**; para ver o completo use `rtk proxy <cmd>` (log em `~/Library/Application Support/rtk/tee/`).
- **`Done` só após aprovação humana** do review (processo do projeto): esta implementação para em `Review`.
```
