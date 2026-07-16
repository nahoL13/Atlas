# [SPEC-0006](../specs/SPEC-0006-atlas-chat.md) `atlas chat` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um comando `atlas chat` que sustenta uma conversa interativa multi-turno no terminal, lembrando o histórico durante a sessão, dando ao `CognitiveCore` operações de conversa (`startConversation`/`respond`) sem torná-lo stateful.

**Architecture:** A conversa é um **dado** (valor imutável `Conversation`) que flui pelo sistema ([ADR-0008](../../06-adr/ADR-0008-conversation-as-data.md)). O `CognitiveCore` ganha `startConversation()` e `respond(conversation, input)` — `respond` é função pura: monta `[...histórico, {user}]`, chama `gateway.generate` uma vez, devolve a resposta + o histórico atualizado. A CLI ganha `atlas chat`: um loop `readline` (via um `LineReader` injetável) que carrega o `Conversation` entre as voltas e sai em `/sair`/`/exit`/EOF; erro de modelo é tratado dentro do loop (mostra mensagem amigável e continua). Tudo testável sem rede (provider `fake` ou `fetch`/`gateway`/`LineReader` stub).

**Tech Stack:** TypeScript 5.x (strict, NodeNext, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest, `tsx` (dev), `node:readline`.

## Global Constraints

- Node ≥ 24, pnpm ≥ 11 via corepack. Diretório de trabalho: `/Users/lohanberg/Documents/Repos/Atlas` (todos os caminhos relativos a ele).
- **Nenhum módulo/package novo** — a mudança vive em `@atlas/contracts`, `@atlas/cognitive` e `apps/cli`. Não implementar Context Service nem Memory Service.
- O Cognitive Core permanece **sem estado** (ADR-0008): `respond` é função pura sobre `Conversation`; o detentor do valor entre turnos é a CLI. A CLI **não** monta mensagens/system prompt — isso é do Cognitive Core.
- `@atlas/cognitive` depende **apenas** de `@atlas/contracts`, nunca do package `@atlas/model-gateway` (Regra 9).
- **Zero dependências de runtime externas.** `node:readline` é builtin; `tsx` é dev tooling. Sem streaming, sem gerência de processo do Ollama, sem persistência.
- Imports entre packages só via nome `@atlas/*`; imports internos com sufixo `.js` (NodeNext). Sem path aliases. Sem `dist/`.
- `verbatimModuleSyntax`: `import type`/`export type` para tipos; `import`/`export` para valores.
- `exactOptionalPropertyTypes`: nunca atribuir `undefined` a propriedade opcional; construir objetos condicionalmente.
- `noUncheckedIndexedAccess`: acesso indexado/`at()` retorna `T | undefined` — tratar (`!` só quando garantido pelo teste).
- Sem mocks de framework: dependências (`gateway`, `fetch`, `LineReader`) injetadas por parâmetro; stubs escritos à mão ([ADR-0004](../../06-adr/ADR-0004-manual-composition.md)).
- System prompt do Cognitive Core segue **neutro**; nunca uma persona.
- `typescript` permanece pinado em `^5` (probe do TS 7 na última task).
- Commits: conventional commits em português; cada commit termina com o trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (usar dois `-m`).

---

### Task 1: Cognitive Core consciente de conversa (`@atlas/contracts` + `@atlas/cognitive`)

Adiciona os tipos `Conversation`/`ConversationTurn` e estende `CognitiveCore` em `@atlas/contracts`, e implementa `startConversation`/`respond` no package, com testes contra um gateway stub. `ask` fica inalterado. Gate: suíte inteira verde (a extensão da interface e a implementação vão juntas, então o typecheck fecha).

**Files:**
- Modify: `packages/contracts/src/cognitive.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/cognitive/src/cognitive-core.ts`
- Test: `packages/cognitive/tests/conversation.test.ts`

**Interfaces:**
- Consumes: `Message`, `ModelGateway` de `@atlas/contracts`.
- Produces em `@atlas/contracts`: `Conversation { readonly messages: readonly Message[] }`; `ConversationTurn { readonly reply: string; readonly conversation: Conversation }`; `CognitiveCore` ganha `startConversation(): Conversation` e `respond(conversation: Conversation, input: string): Promise<ConversationTurn>`. `createCognitiveCore` passa a devolver essas operações; `SYSTEM_PROMPT` e `ask` inalterados.

- [ ] **Step 1: Estender `packages/contracts/src/cognitive.ts`**

Substituir o conteúdo inteiro por:

```ts
import type { Message } from './model.js';

export interface Conversation {
  readonly messages: readonly Message[];
}

export interface ConversationTurn {
  readonly reply: string;
  readonly conversation: Conversation;
}

export interface CognitiveCore {
  ask(objective: string): Promise<string>;
  startConversation(): Conversation;
  respond(conversation: Conversation, input: string): Promise<ConversationTurn>;
}
```

- [ ] **Step 2: Exportar os novos tipos em `packages/contracts/src/index.ts`**

Substituir a linha:

```ts
export type { CognitiveCore } from './cognitive.js';
```

por:

```ts
export type { CognitiveCore, Conversation, ConversationTurn } from './cognitive.js';
```

- [ ] **Step 3: Escrever o teste `packages/cognitive/tests/conversation.test.ts`**

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

describe('createCognitiveCore conversa', () => {
  it('startConversation semeia só o system prompt', () => {
    const { gateway } = stubGateway(async () => ({ text: '' }));
    const core = createCognitiveCore({ gateway });
    const conv = core.startConversation();
    expect(conv.messages).toEqual([{ role: 'system', content: SYSTEM_PROMPT }]);
  });

  it('respond monta [historico, user], chama generate uma vez e anexa a resposta', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'oi de volta' }));
    const core = createCognitiveCore({ gateway });

    const { reply, conversation } = await core.respond(core.startConversation(), 'oi');

    expect(reply).toBe('oi de volta');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'oi' },
    ]);
    expect(conversation.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'oi de volta' },
    ]);
  });

  it('respond é pura: não muta a conversa de entrada', async () => {
    const { gateway } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({ gateway });
    const conv0 = core.startConversation();
    await core.respond(conv0, 'oi');
    expect(conv0.messages).toEqual([{ role: 'system', content: SYSTEM_PROMPT }]);
  });

  it('multi-turno acumula o histórico', async () => {
    const { gateway, calls } = stubGateway(async (req) => ({
      text: `resp:${req.messages.at(-1)!.content}`,
    }));
    const core = createCognitiveCore({ gateway });
    const turn1 = await core.respond(core.startConversation(), 'primeira');
    const turn2 = await core.respond(turn1.conversation, 'segunda');
    expect(turn2.conversation.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
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

- [ ] **Step 4: Rodar para ver falhar**

Run: `pnpm test -- conversation`
Expected: FAIL — `startConversation`/`respond` não existem em `createCognitiveCore`.

- [ ] **Step 5: Implementar `startConversation`/`respond` em `packages/cognitive/src/cognitive-core.ts`**

Substituir o conteúdo inteiro por:

```ts
import type {
  CognitiveCore,
  Conversation,
  ConversationTurn,
  Message,
  ModelGateway,
} from '@atlas/contracts';

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

    startConversation(): Conversation {
      return { messages: [{ role: 'system', content: SYSTEM_PROMPT }] };
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

- [ ] **Step 6: Rodar para ver passar + typecheck**

Run: `pnpm test -- conversation && pnpm typecheck`
Expected: PASS (5 testes); typecheck limpo (o objeto devolvido satisfaz o `CognitiveCore` estendido).

- [ ] **Step 7: Rodar a suíte inteira (garantir zero regressão)**

Run: `pnpm test`
Expected: PASS — os testes existentes (`ask`, core, cli) seguem verdes.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/cognitive.ts packages/contracts/src/index.ts packages/cognitive/src/cognitive-core.ts packages/cognitive/tests/conversation.test.ts
git commit -m "feat(cognitive): conversa multi-turno como dado (startConversation/respond)" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Input Gateway reconhece `chat`

Adiciona o comando `chat` ao Input Gateway (sem positional obrigatório; reaproveita a resolução de overrides de modelo). Gate: suíte inteira verde.

**Files:**
- Modify: `apps/cli/src/gateway/input-gateway.ts`
- Test: `apps/cli/tests/input-gateway.test.ts` (novos casos)

**Interfaces:**
- Consumes: nada novo.
- Produces: `ParsedInput.command` passa a incluir `'chat'`; `normalize(['chat', ...])` devolve `{ command: 'chat', configOverride }`.

- [ ] **Step 1: Escrever os novos casos em `apps/cli/tests/input-gateway.test.ts`**

Acrescentar, dentro do `describe('CliInputGateway.normalize', ...)` (mantendo os existentes), antes do `});` que fecha o describe:

```ts
  it('chat é reconhecido e devolve o comando chat', () => {
    const parsed = gw.normalize(['chat'], {});
    expect(parsed.command).toBe('chat');
    expect(parsed.configOverride).toEqual({});
  });

  it('chat resolve overrides de model na precedência flags > env', () => {
    const parsed = gw.normalize(['chat', '--provider', 'fake'], {
      ATLAS_MODEL_PROVIDER: 'remote',
    });
    expect(parsed.configOverride).toEqual({ model: { provider: 'fake' } });
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm test -- input-gateway`
Expected: FAIL — `chat` cai em "comando desconhecido".

- [ ] **Step 3: Adicionar o comando `chat` em `apps/cli/src/gateway/input-gateway.ts`**

No tipo `ParsedInput`, trocar a linha do `command` por:

```ts
  command: 'status' | 'help' | 'version' | 'ask' | 'chat';
```

Em `normalize`, logo após o bloco `if (command === 'ask') { ... }` e **antes** do `throw new CliUsageError(...)` final, inserir:

```ts
      if (command === 'chat') {
        return { command: 'chat', configOverride: resolveConfigOverride(values, env) };
      }
```

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm test -- input-gateway`
Expected: PASS — `chat` reconhecido; casos existentes verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/gateway/input-gateway.ts apps/cli/tests/input-gateway.test.ts
git commit -m "feat(cli): Input Gateway reconhece o comando chat" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `runChat` + `LineReader` + despacho em `run.ts`

Cria o `LineReader` injetável (interface + implementação sobre `node:readline`), o executor `runChat` (loop com tratamento de erro de modelo que mantém o loop vivo), e liga o despacho de `chat` em `run.ts` (com `HELP_TEXT` atualizado e a fábrica de `LineReader` injetável via `deps`). Gate: suíte inteira verde, sem rede; verificação manual com `fake`.

**Files:**
- Create: `apps/cli/src/gateway/line-reader.ts`
- Create: `apps/cli/src/commands/chat.ts`
- Modify: `apps/cli/src/run.ts`
- Test: `apps/cli/tests/run.test.ts` (novos casos)

**Interfaces:**
- Consumes: `AtlasPlatform`, `AtlasError` de `@atlas/contracts`; `OutputGateway`; `atlas.cognitive.startConversation()`/`respond()`.
- Produces: `LineReader { next(prompt: string): Promise<string | null>; close(): void }` e `createReadlineLineReader()`; `runChat(atlas, output, lineReader): Promise<void>`; `run(argv, env, gateways, version, deps?: { fetch?; createLineReader?: () => LineReader })`.

- [ ] **Step 1: Criar `apps/cli/src/gateway/line-reader.ts`**

```ts
import { createInterface, type Interface } from 'node:readline';

export interface LineReader {
  next(prompt: string): Promise<string | null>;
  close(): void;
}

export function createReadlineLineReader(): LineReader {
  const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });
  let closed = false;
  rl.on('close', () => {
    closed = true;
  });
  // Ctrl-C encerra de forma limpa (dispara 'close').
  rl.on('SIGINT', () => {
    rl.close();
  });

  return {
    next(prompt: string): Promise<string | null> {
      if (closed) {
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        let settled = false;
        const onClose = (): void => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        };
        rl.once('close', onClose);
        rl.question(prompt, (answer) => {
          settled = true;
          rl.removeListener('close', onClose);
          resolve(answer);
        });
      });
    },
    close(): void {
      rl.close();
    },
  };
}
```

Nota: esta implementação real depende de TTY e é coberta por **verificação manual** (Step 8), não por teste unitário. `runChat` é testado com um `LineReader` stub roteirizado.

- [ ] **Step 2: Criar `apps/cli/src/commands/chat.ts`**

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
  let conversation = atlas.cognitive.startConversation();

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
      const turn = await atlas.cognitive.respond(conversation, input);
      output.write(`${turn.reply}\n`);
      conversation = turn.conversation;
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
}
```

- [ ] **Step 3: Escrever os novos casos em `apps/cli/tests/run.test.ts`**

No topo do arquivo, acrescentar o import de tipo do `LineReader` (junto aos imports existentes):

```ts
import type { LineReader } from '../src/gateway/line-reader.js';
```

E acrescentar, logo após a função `harness()` (fora do `describe`), um helper de leitor roteirizado:

```ts
function scriptedReader(lines: string[]): LineReader {
  let i = 0;
  return {
    next: async () => (i < lines.length ? lines[i++]! : null),
    close: () => {},
  };
}
```

Acrescentar, dentro do `describe('run (integração apps → core)', ...)` (mantendo os existentes), antes do `});` que fecha o describe:

```ts
  it('chat com fake responde cada linha na ordem e retorna 0', async () => {
    const h = harness();
    const code = await run(['chat', '--provider', 'fake'], {}, h.gateways, '0.1.0', {
      createLineReader: () => scriptedReader(['oi', 'tudo bem?', '/sair']),
    });
    expect(code).toBe(0);
    expect(h.out()).toBe('[fake] oi\n[fake] tudo bem?\n');
  });

  it('chat encerra em EOF (linha null) com exit 0', async () => {
    const h = harness();
    const code = await run(['chat', '--provider', 'fake'], {}, h.gateways, '0.1.0', {
      createLineReader: () => scriptedReader(['olá']),
    });
    expect(code).toBe(0);
    expect(h.out()).toBe('[fake] olá\n');
  });

  it('erro de modelo no chat imprime mensagem amigável, mantém o loop e retorna 0', async () => {
    const h = harness();
    const failingFetch = (async () => {
      throw new Error('sem rede');
    }) as unknown as typeof fetch;
    const code = await run(
      ['chat', '--provider', 'local', '--model', 'llama3.2'],
      {},
      h.gateways,
      '0.1.0',
      { fetch: failingFetch, createLineReader: () => scriptedReader(['primeira', '/sair']) },
    );
    expect(code).toBe(0);
    expect(h.err()).toContain('modelo');
    expect(h.out()).toBe('');
  });
```

- [ ] **Step 4: Rodar para ver falhar**

Run: `pnpm test -- run`
Expected: FAIL — `run` ainda não despacha `chat` nem aceita `deps.createLineReader`.

- [ ] **Step 5: Reescrever `apps/cli/src/run.ts`**

Substituir o conteúdo inteiro por:

```ts
import { AtlasError, InvalidConfigError } from '@atlas/contracts';
import { createAtlas } from '@atlas/core';
import { runStatus } from './commands/status.js';
import { runAsk } from './commands/ask.js';
import { runChat } from './commands/chat.js';
import { CliUsageError } from './gateway/input-gateway.js';
import { createReadlineLineReader } from './gateway/line-reader.js';
import type { InputGateway, ParsedInput } from './gateway/input-gateway.js';
import type { LineReader } from './gateway/line-reader.js';
import type { OutputGateway } from './gateway/output-gateway.js';

export interface CliGateways {
  input: InputGateway;
  output: OutputGateway;
}

export interface CliDeps {
  fetch?: typeof fetch;
  createLineReader?: () => LineReader;
}

const HELP_TEXT = `Usage: atlas <command> [options]

Commands:
  status               Mostra o estado da plataforma e a config resolvida
  ask "<objetivo>"     Envia um objetivo ao núcleo cognitivo e imprime a resposta
  chat                 Abre uma conversa interativa com o núcleo cognitivo

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

Nota: `main.ts` não muda — `run` usa `createReadlineLineReader` por padrão (mesmo padrão do `fetch` global); o leitor real só é construído quando o comando é `chat` (evita segurar o `stdin` em `status`/`ask`).

- [ ] **Step 6: Rodar para ver passar + typecheck**

Run: `pnpm typecheck && pnpm test -- run`
Expected: PASS — `chat` despachado; contexto entre linhas mantido pelo loop; erro de modelo tratado no loop; casos existentes verdes.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `pnpm test`
Expected: PASS — todos os arquivos verdes, sem rede.

- [ ] **Step 8: Verificação manual sem rede (provider fake)**

Run: `printf 'oi\ntudo bem?\n/sair\n' | pnpm --filter @atlas/cli exec tsx src/main.ts chat --provider fake`
Expected: imprime `[fake] oi` e `[fake] tudo bem?` (cada um em sua linha, após o prompt `> `) e encerra com código `0`.

- [ ] **Step 9: Commit**

```bash
git add apps/cli/src/gateway/line-reader.ts apps/cli/src/commands/chat.ts apps/cli/src/run.ts apps/cli/tests/run.test.ts
git commit -m "feat(cli): comando atlas chat (conversa interativa multi-turno)" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Documentação, verificação final e conclusão

**Files:**
- Modify: `packages/cognitive/README.md`
- Modify: `packages/cognitive/CLAUDE.md`
- Modify: `CLAUDE.md` (raiz)
- Modify: `docs/05-context/NEXT_CONTEXT.md`
- Modify: `docs/05-context/CURRENT_SPRINT.md`
- Modify: `implementation/LESSONS_LEARNED.md`
- Modify: `implementation/specs/SPEC-0006-atlas-chat.md` (Status → Review)

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: documentação atualizada, SPEC em Review, lições registradas.

- [ ] **Step 1: Atualizar `packages/cognitive/README.md`**

Acrescentar, após o parágrafo do `ask`, um parágrafo sobre a conversa:

```markdown
Para conversa multi-turno, o `CognitiveCore` oferece `startConversation(): Conversation` (semeia o system prompt neutro) e `respond(conversation, input): Promise<{ reply, conversation }>` — uma **função pura** que anexa a fala do usuário, chama `gateway.generate` uma vez e devolve a resposta + o histórico atualizado. O Core não guarda estado: a conversa é um valor que o chamador carrega entre os turnos (ADR-0008).
```

- [ ] **Step 2: Atualizar `packages/cognitive/CLAUDE.md`**

Acrescentar um bullet após o primeiro (`createCognitiveCore ... ask ...`):

```markdown
- Conversa multi-turno como **dado** (ADR-0008): `startConversation()` + `respond(conversation, input)` (função pura); o Core segue **sem estado** — o histórico é um valor carregado pelo chamador (hoje a CLI, futuramente o Context Service).
```

- [ ] **Step 3: Atualizar `CLAUDE.md` (raiz)**

No parágrafo de estado (seção "O que é este repositório"), na frase que descreve a CLI, acrescentar o comando `chat` ao lado do `ask` — por exemplo, após "imprime a resposta (default provider `local`/Ollama; `remote`/`fake` por config)", inserir: "; `atlas chat` abre uma conversa interativa multi-turno (mesmos provedores; histórico lembrado durante a sessão, ADR-0008)". Ajustar a frase de estado ("julho/2026: ...") para incluir a SPEC-0006. Mencionar que o `CognitiveCore` ganhou `startConversation`/`respond` (conversa como dado; Core segue stateless).

- [ ] **Step 4: Atualizar `docs/05-context/NEXT_CONTEXT.md`**

- Estado imediato: SPEC-0006 em `Review` (pendente de aprovação → `Done`); registrar o comando `atlas chat` e as operações de conversa do Cognitive Core.
- Ajustar a seção "Próximo Trabalho" (a SPEC-0006 deixa de ser "aguardando plano"); listar como próximas candidatas: Context Service (dono natural do estado de conversa), auto-gerência do Ollama, `ModelGateway.health()`, Persona Service, etc.
- Padrões reutilizáveis novos: conversa-como-dado (ADR-0008; função pura sobre valor, detentor na borda); `LineReader` injetável para testar loops de terminal sem TTY; `deps.createLineReader` lazy (leitor real só quando o comando precisa, evitando segurar `stdin`).
- Atualizar o "Mapa Rápido" com o comando `chat`, `commands/chat.ts`, `gateway/line-reader.ts` e o ADR-0008.

- [ ] **Step 5: Atualizar `docs/05-context/CURRENT_SPRINT.md`**

Acrescentar a linha da SPEC-0006 (`atlas chat`) à tabela, com o status corrente (`Review` → `Done` após aprovação).

- [ ] **Step 6: Registrar lições em `implementation/LESSONS_LEARNED.md`**

Acrescentar, no topo do Registro (após o cabeçalho `# Registro`), uma seção da SPEC-0006 no formato padrão (Descobrimos que / A arquitetura ajudou / A arquitetura atrapalhou / Precisamos mudar), cobrindo ao menos:
- conversa-como-dado (ADR-0008) manteve o Cognitive Core sem estado e testável como função pura; o multi-turno saiu de um `respond` puro + o loop da CLI segurando o valor, sem criar Context Service;
- com o provider `fake` (que ecoa a última mensagem) a acumulação de contexto não é observável pela saída — a asserção de multi-turno vive no teste unitário do cognitive (gateway stub captura as mensagens); no run-level testa-se ordem/exit;
- `LineReader` injetável permitiu testar o loop de chat sem TTY; `deps.createLineReader` lazy evita que `status`/`ask` segurem o `stdin`;
- tratar `ModelGatewayError` **dentro** do loop (via `AtlasError.code`) mantém o chat vivo após falha, reutilizando a mesma mensagem amigável do `ask`;
- (probe do TS7 — registrar o resultado do Step 7).

- [ ] **Step 7: Probe do TypeScript 7 (encaminhamento herdado)**

Run: `pnpm add -Dw typescript@^7 && pnpm lint`
Expected: se passar, manter e registrar em LESSONS_LEARNED; se falhar, reverter com `pnpm add -Dw typescript@^5` (comportamento conhecido do typescript-eslint; falhou em 07-10, 07-11, 07-12 e 07-13). Após reverter, confirmar que `package.json`/`pnpm-lock.yaml` não ficaram com resíduo (`git diff --stat package.json pnpm-lock.yaml` vazio).

- [ ] **Step 8: Mudar o Status da SPEC para `Review`**

Em `implementation/specs/SPEC-0006-atlas-chat.md`, alterar `Status` de `Draft` para `Review`.

- [ ] **Step 9: Verificação completa da suíte**

Run: `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde; os testes novos rodam junto dos demais, sem acesso à rede.

- [ ] **Step 10: Commit**

```bash
git add packages/cognitive/README.md packages/cognitive/CLAUDE.md CLAUDE.md docs/05-context/NEXT_CONTEXT.md docs/05-context/CURRENT_SPRINT.md implementation/LESSONS_LEARNED.md implementation/specs/SPEC-0006-atlas-chat.md
git commit -m "docs(cli): documentacao, licoes e SPEC-0006 em Review" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de verificação (para quem executa)

- **Sem rede nos testes**: todo teste usa provider `fake` ou `gateway`/`fetch`/`LineReader` stub. Se algum teste tentar rede, é bug de plano — parar e revisar.
- **Greenness por task**: Task 1 junta a extensão da interface `CognitiveCore` com a implementação (senão o typecheck do package quebra). Task 2 só adiciona o reconhecimento de `chat` (parse). Task 3 liga `runChat`/`LineReader`/despacho. Task 4 é docs + conclusão.
- **Core stateless (ADR-0008)**: `respond` não guarda nada; o valor `Conversation` é carregado pelo loop da CLI. Não introduzir estado no Cognitive Core nem lógica de conversa na CLI.
- **`exactOptionalPropertyTypes`**: nada de `campo: undefined`; `Conversation.messages` é `readonly`, construído por spread em arrays novos.
- **Desacoplamento CLI ↔ gateway**: `run.ts` e `chat.ts` detectam erro de modelo por `AtlasError.code`, sem importar `@atlas/model-gateway`.
- **DoD** (SPEC): critérios atendidos, testes verdes, docs atualizadas, arquitetura preservada, revisão concluída, lições registradas. A transição `Review → Done` depende da aprovação do usuário.
```
