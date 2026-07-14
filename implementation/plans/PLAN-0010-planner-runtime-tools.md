# SPEC-0010 Planner + Runtime + Tools (execução ponta a ponta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descolapsar as etapas de **Planejamento** e **Execução** do ciclo cognitivo: criar `@atlas/tools` (registry + Tools puras `clock`/`calc`) e `@atlas/runtime` (executa planos), consolidar um **Planner** puro em `@atlas/cognitive`, e fazer o Cognitive Core orquestrar em `ask` (plano estruturado Planner-driven → execução → composição), retornando `AskResult { text; steps? }` para o CLI mostrar um traço. Model Gateway **intacto**.

**Architecture:** O modelo produz um **plano em JSON** (via `generate()` atual); o Runtime o executa deterministicamente sobre um **Tool Registry**. Autoridade separada (Module Catalog): Cognitive Core **orquestra e responde**; o **Planner** (puro, sem gateway) fornece a instrução de planejamento e **parseia** a saída num `Plan` (ou `null` = resposta direta); o **Runtime** coordena a execução e expõe o catálogo de Tools (`tools()`); as **Tools** executam sem decidir quando são usadas. `ask` faz 1 chamada quando não há plano (comportamento de hoje preservado, na voz da Persona) e 2 chamadas quando há (planejar → executar → compor). Passos de um plano são **independentes** (sem dependência de dados entre Tools). Só `@atlas/core` importa implementações e injeta o `runtime` no Cognitive; a CLI consome `atlas.cognitive.ask`.

**Tech Stack:** TypeScript 5.x (strict, NodeNext, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest, `tsx` (dev).

## Global Constraints

- Node ≥ 24, pnpm ≥ 11 via corepack. Diretório de trabalho: `/Users/lohanberg/Documents/Repos/Atlas` (todos os caminhos relativos a ele).
- **Dois packages novos:** `@atlas/tools` e `@atlas/runtime`. O **Planner** é consolidado em `@atlas/cognitive` (consolidação sancionada pelo Project Structure) — **não** criar `packages/planner`.
- **Regras de Dependência (Module Catalog / Project Structure):** `@atlas/tools` e `@atlas/runtime` dependem **apenas** de `@atlas/contracts`; **não** dependem do Cognitive Core (Regra 5). Planner **não** coordena execução (Regra 7). Runtime **não** redefine o objetivo estratégico (Regra 8). Só `@atlas/core` importa implementações de packages (Regra 11); o Cognitive recebe o `runtime` por **injeção** e importa só o **tipo** `Runtime` de `@atlas/contracts`.
- **Model Gateway intacto:** sem tool/function-calling nativo; o mecanismo é Planner-driven (JSON via `generate()`).
- **Tools puras:** sem rede, disco, filesystem ou efeitos colaterais (o Permission Service não existe). `calc` **não** usa `eval`/`Function` — parser aritmético próprio e restrito.
- **Runtime nunca lança por falha de Tool:** Tool inexistente ou que lança vira `ToolResult`/`ExecutedStep` estruturado; a execução continua nos demais passos. O Plan já vem validado pelo Planner — esta fatia **não** introduz erro/`code` próprio de runtime.
- **Passos independentes:** nenhum passo consome a saída de outro; o Runtime executa todos e a composição recebe todos os resultados juntos.
- `respond`/`chat` **não** recebem planejamento; `respond` permanece função pura e inalterada; o Cognitive segue sem estado.
- Contrato só sobe a `@atlas/contracts` quando há 2º consumidor: `Tool`/`ToolResult`/`ToolDescriptor`/`ToolRegistry`/`Plan`/`PlanStep`/`ExecutedStep`/`ExecutionResult`/`Runtime` sobem (Tools+Runtime+Cognitive os consomem); o contrato do **Planner** **não sobe** (interno a `@atlas/cognitive`, sem 2º consumidor).
- Imports internos com sufixo `.js` (NodeNext). Sem path aliases entre packages (só o nome `@atlas/*`). Sem `dist/`.
- `verbatimModuleSyntax`: `import type`/`export type` para tipos; `import`/`export` para valores.
- `exactOptionalPropertyTypes`: nunca atribuir `undefined` a propriedade opcional; construir objetos condicionalmente. `AskResult.steps` só é definido no caminho com plano.
- `noUncheckedIndexedAccess`: acesso indexado retorna `T | undefined` — tratar explicitamente (asserções `!` onde comprovadamente seguro).
- Sem mocks de framework: dependências injetadas por parâmetro; stubs à mão (ADR-0004).
- `typescript` permanece pinado em `^5` (probe do TS 7 na última task — sétimo probe).
- Commits: conventional commits em português; cada commit termina com o trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (usar dois `-m`).

---

### Task 1: `@atlas/tools` — Tool Registry + Tools puras `clock` e `calc`

Cria o package `@atlas/tools` e os contratos de Tool em `@atlas/contracts` (`Tool`, `ToolResult`, `ToolDescriptor`, `ToolRegistry` — aditivos, inertes para o código existente). Implementa o registry (Map), `clock` (data/hora, `now` injetável) e `calc` (parser aritmético seguro, sem `eval`). Fecha verde de forma independente.

**Files:**
- Create: `packages/contracts/src/execution.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/tools/package.json`
- Create: `packages/tools/tsconfig.json`
- Create: `packages/tools/src/registry.ts`
- Create: `packages/tools/src/clock.ts`
- Create: `packages/tools/src/calc.ts`
- Create: `packages/tools/src/index.ts`
- Test: `packages/tools/tests/registry.test.ts`
- Test: `packages/tools/tests/clock.test.ts`
- Test: `packages/tools/tests/calc.test.ts`

**Interfaces:**
- Consumes: nada de outros packages (só os próprios contratos).
- Produces em `@atlas/contracts`: `Tool`, `ToolResult`, `ToolDescriptor`, `ToolRegistry` (ver código).
- Produces em `@atlas/tools`: `createToolRegistry(): ToolRegistry`; `createClockTool(deps?: ClockDeps): Tool` (`ClockDeps = { now?: () => Date }`); `createCalcTool(): Tool`.

- [ ] **Step 1: Criar `packages/contracts/src/execution.ts`**

```ts
export interface ToolResult {
  readonly ok: boolean;
  readonly output?: string;
  readonly error?: string;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  run(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  has(name: string): boolean;
  list(): readonly Tool[];
}
```

- [ ] **Step 2: Exportar os tipos em `packages/contracts/src/index.ts`**

Adicionar, após a linha `export type { Fact, MemoryService } from './memory.js';`:

```ts
export type { Tool, ToolResult, ToolDescriptor, ToolRegistry } from './execution.js';
```

- [ ] **Step 3: Criar `packages/tools/package.json`**

```json
{
  "name": "@atlas/tools",
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

- [ ] **Step 4: Criar `packages/tools/tsconfig.json`**

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
Expected: instala sem erro; `@atlas/tools` reconhecido (glob `packages/*`).

- [ ] **Step 6: Escrever `packages/tools/tests/registry.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Tool } from '@atlas/contracts';
import { createToolRegistry } from '../src/index.js';

function noopTool(name: string): Tool {
  return { name, description: `desc ${name}`, run: async () => ({ ok: true, output: name }) };
}

describe('createToolRegistry', () => {
  it('register/get/has recuperam a Tool por nome', () => {
    const registry = createToolRegistry();
    const a = noopTool('a');
    registry.register(a);
    expect(registry.has('a')).toBe(true);
    expect(registry.get('a')).toBe(a);
  });

  it('get de nome inexistente retorna undefined; has retorna false', () => {
    const registry = createToolRegistry();
    expect(registry.get('x')).toBeUndefined();
    expect(registry.has('x')).toBe(false);
  });

  it('list retorna as Tools registradas', () => {
    const registry = createToolRegistry();
    registry.register(noopTool('a'));
    registry.register(noopTool('b'));
    expect(registry.list().map((t) => t.name)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 7: Escrever `packages/tools/tests/clock.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createClockTool } from '../src/index.js';

describe('createClockTool', () => {
  it('retorna a data/hora atual em ISO, determinística sob now injetado', async () => {
    const fixed = new Date('2026-07-14T12:00:00.000Z');
    const clock = createClockTool({ now: () => fixed });
    expect(clock.name).toBe('clock');
    const result = await clock.run({});
    expect(result).toEqual({ ok: true, output: '2026-07-14T12:00:00.000Z' });
  });

  it('sem now injetado usa o relógio real (formato ISO)', async () => {
    const clock = createClockTool();
    const result = await clock.run({});
    expect(result.ok).toBe(true);
    expect(result.output).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
```

- [ ] **Step 8: Escrever `packages/tools/tests/calc.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createCalcTool } from '../src/index.js';

describe('createCalcTool', () => {
  const calc = createCalcTool();

  it('avalia expressões válidas respeitando precedência e parênteses', async () => {
    expect((await calc.run({ expression: '12*8' })).output).toBe('96');
    expect((await calc.run({ expression: '2+3*4' })).output).toBe('14');
    expect((await calc.run({ expression: '(2+3)*4' })).output).toBe('20');
    expect((await calc.run({ expression: '10/4' })).output).toBe('2.5');
    expect((await calc.run({ expression: '-3 + 5' })).output).toBe('2');
  });

  it('expressão inválida retorna erro estruturado (sem lançar)', async () => {
    expect((await calc.run({ expression: '2 +' })).ok).toBe(false);
    expect((await calc.run({ expression: 'a+1' })).ok).toBe(false);
    expect((await calc.run({ expression: '2/0' })).ok).toBe(false);
  });

  it('args sem expression string retorna erro estruturado', async () => {
    expect((await calc.run({})).ok).toBe(false);
    expect((await calc.run({ expression: '   ' })).ok).toBe(false);
    expect((await calc.run({ expression: 42 })).ok).toBe(false);
  });

  it('não executa código arbitrário (sem eval)', async () => {
    const result = await calc.run({ expression: 'process.exit(1)' });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 9: Rodar os testes e confirmar que falham**

Run: `pnpm test -- packages/tools`
Expected: FAIL — `createToolRegistry`/`createClockTool`/`createCalcTool` não existem / módulo não resolve.

- [ ] **Step 10: Criar `packages/tools/src/registry.ts`**

```ts
import type { Tool, ToolRegistry } from '@atlas/contracts';

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, Tool>();
  return {
    register(tool: Tool): void {
      tools.set(tool.name, tool);
    },
    get(name: string): Tool | undefined {
      return tools.get(name);
    },
    has(name: string): boolean {
      return tools.has(name);
    },
    list(): readonly Tool[] {
      return [...tools.values()];
    },
  };
}
```

- [ ] **Step 11: Criar `packages/tools/src/clock.ts`**

```ts
import type { Tool } from '@atlas/contracts';

export interface ClockDeps {
  now?: () => Date;
}

export function createClockTool(deps: ClockDeps = {}): Tool {
  const now = deps.now ?? ((): Date => new Date());
  return {
    name: 'clock',
    description:
      'Retorna a data e hora atuais em ISO 8601. Use quando o objetivo depender da data/hora de agora. Não recebe argumentos.',
    async run() {
      return { ok: true, output: now().toISOString() };
    },
  };
}
```

- [ ] **Step 12: Criar `packages/tools/src/calc.ts`**

```ts
import type { Tool, ToolResult } from '@atlas/contracts';

type Token =
  | { readonly type: 'num'; readonly value: number }
  | { readonly type: 'op'; readonly value: '+' | '-' | '*' | '/' }
  | { readonly type: 'lparen' }
  | { readonly type: 'rparen' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      while (i < input.length && ((input[i]! >= '0' && input[i]! <= '9') || input[i]! === '.')) {
        num += input[i]!;
        i += 1;
      }
      const value = Number(num);
      if (Number.isNaN(value)) {
        throw new Error(`número inválido: ${num}`);
      }
      tokens.push({ type: 'num', value });
      continue;
    }
    throw new Error(`caractere inesperado: ${ch}`);
  }
  return tokens;
}

// Descida recursiva: expr := term (('+' | '-') term)*; term := factor (('*' | '/') factor)*;
// factor := ('+' | '-') factor | num | '(' expr ')'.
function evaluate(input: string): number {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  function parseFactor(): number {
    const t = peek();
    if (t === undefined) {
      throw new Error('expressão incompleta');
    }
    if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
      pos += 1;
      const operand = parseFactor();
      return t.value === '-' ? -operand : operand;
    }
    if (t.type === 'num') {
      pos += 1;
      return t.value;
    }
    if (t.type === 'lparen') {
      pos += 1;
      const value = parseExpr();
      const close = peek();
      if (close === undefined || close.type !== 'rparen') {
        throw new Error('parêntese não fechado');
      }
      pos += 1;
      return value;
    }
    throw new Error('token inesperado');
  }

  function parseTerm(): number {
    let value = parseFactor();
    for (;;) {
      const t = peek();
      if (t !== undefined && t.type === 'op' && (t.value === '*' || t.value === '/')) {
        pos += 1;
        const rhs = parseFactor();
        if (t.value === '/') {
          if (rhs === 0) {
            throw new Error('divisão por zero');
          }
          value = value / rhs;
        } else {
          value = value * rhs;
        }
      } else {
        break;
      }
    }
    return value;
  }

  function parseExpr(): number {
    let value = parseTerm();
    for (;;) {
      const t = peek();
      if (t !== undefined && t.type === 'op' && (t.value === '+' || t.value === '-')) {
        pos += 1;
        const rhs = parseTerm();
        value = t.value === '+' ? value + rhs : value - rhs;
      } else {
        break;
      }
    }
    return value;
  }

  const result = parseExpr();
  if (pos !== tokens.length) {
    throw new Error('expressão malformada');
  }
  if (!Number.isFinite(result)) {
    throw new Error('resultado não finito');
  }
  return result;
}

export function createCalcTool(): Tool {
  return {
    name: 'calc',
    description:
      'Avalia uma expressão aritmética (+, -, *, /, parênteses, números decimais). Argumento: { "expression": "<expr>" }.',
    async run(args: Record<string, unknown>): Promise<ToolResult> {
      const expression = args['expression'];
      if (typeof expression !== 'string' || expression.trim() === '') {
        return { ok: false, error: 'calc requer um argumento "expression" (string não vazia)' };
      }
      try {
        return { ok: true, output: String(evaluate(expression)) };
      } catch (cause) {
        return { ok: false, error: `expressão inválida: ${(cause as Error).message}` };
      }
    },
  };
}
```

- [ ] **Step 13: Criar `packages/tools/src/index.ts`**

```ts
export { createToolRegistry } from './registry.js';
export { createClockTool } from './clock.js';
export type { ClockDeps } from './clock.js';
export { createCalcTool } from './calc.js';
```

- [ ] **Step 14: Rodar os testes e confirmar que passam**

Run: `pnpm test -- packages/tools`
Expected: PASS.

- [ ] **Step 15: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde. Se `format:check` reclamar dos novos arquivos, rode `pnpm format` e repita.

- [ ] **Step 16: Commit**

```bash
git add packages/contracts/src/execution.ts packages/contracts/src/index.ts packages/tools pnpm-lock.yaml
git commit -m "feat(tools): @atlas/tools com registry e ferramentas puras clock e calc" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `@atlas/runtime` — executa planos sobre o Tool Registry

Cria o package `@atlas/runtime` e os contratos de plano/execução em `@atlas/contracts` (`Plan`, `PlanStep`, `ExecutedStep`, `ExecutionResult`, `Runtime` — aditivos). `createRuntime({ registry })` executa passos em ordem, resolve cada Tool no registry, coleta falhas estruturadas (Tool inexistente ou que lança) sem nunca lançar, e expõe `tools()`. Testado com um registry fake (sem depender de `@atlas/tools`).

**Files:**
- Modify: `packages/contracts/src/execution.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/runtime/package.json`
- Create: `packages/runtime/tsconfig.json`
- Create: `packages/runtime/src/runtime.ts`
- Create: `packages/runtime/src/index.ts`
- Test: `packages/runtime/tests/runtime.test.ts`

**Interfaces:**
- Consumes: `Tool`, `ToolRegistry`, `ToolDescriptor` de `@atlas/contracts` (Task 1).
- Produces em `@atlas/contracts`: `PlanStep`, `Plan`, `ExecutedStep`, `ExecutionResult`, `Runtime` (ver código).
- Produces em `@atlas/runtime`: `createRuntime(deps: RuntimeDeps): Runtime` (`RuntimeDeps = { registry: ToolRegistry }`).

- [ ] **Step 1: Adicionar os contratos de plano/execução em `packages/contracts/src/execution.ts`**

Adicionar ao final do arquivo (após a interface `ToolRegistry`):

```ts
export interface PlanStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
}

export interface Plan {
  readonly steps: readonly PlanStep[];
}

export interface ExecutedStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly result: ToolResult;
}

export interface ExecutionResult {
  readonly steps: readonly ExecutedStep[];
}

export interface Runtime {
  tools(): readonly ToolDescriptor[];
  execute(plan: Plan): Promise<ExecutionResult>;
}
```

- [ ] **Step 2: Exportar os novos tipos em `packages/contracts/src/index.ts`**

Substituir a linha adicionada na Task 1 por:

```ts
export type {
  Tool,
  ToolResult,
  ToolDescriptor,
  ToolRegistry,
  PlanStep,
  Plan,
  ExecutedStep,
  ExecutionResult,
  Runtime,
} from './execution.js';
```

- [ ] **Step 3: Criar `packages/runtime/package.json`**

```json
{
  "name": "@atlas/runtime",
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

- [ ] **Step 4: Criar `packages/runtime/tsconfig.json`**

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

- [ ] **Step 5: Relinkar o workspace**

Run: `pnpm install`
Expected: instala sem erro; `@atlas/runtime` reconhecido.

- [ ] **Step 6: Escrever `packages/runtime/tests/runtime.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Tool, ToolRegistry } from '@atlas/contracts';
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
    const runtime = createRuntime({ registry: fakeRegistry([a, b]) });

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
    const runtime = createRuntime({ registry: fakeRegistry([b]) });

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
    const runtime = createRuntime({ registry: fakeRegistry([boom]) });

    const result = await runtime.execute({ steps: [{ tool: 'boom', args: {} }] });

    expect(result.steps[0]!.result.ok).toBe(false);
    expect(result.steps[0]!.result.error).toContain('kaboom');
  });

  it('tools() expõe os descritores (nome + descrição) do registry', () => {
    const a: Tool = { name: 'a', description: 'A', run: async () => ({ ok: true }) };
    const b: Tool = { name: 'b', description: 'B', run: async () => ({ ok: true }) };
    const runtime = createRuntime({ registry: fakeRegistry([a, b]) });

    expect(runtime.tools()).toEqual([
      { name: 'a', description: 'A' },
      { name: 'b', description: 'B' },
    ]);
  });
});
```

- [ ] **Step 7: Rodar os testes e confirmar que falham**

Run: `pnpm test -- packages/runtime`
Expected: FAIL — `createRuntime` não existe / módulo não resolve.

- [ ] **Step 8: Criar `packages/runtime/src/runtime.ts`**

```ts
import type {
  ExecutedStep,
  ExecutionResult,
  Plan,
  Runtime,
  ToolDescriptor,
  ToolRegistry,
} from '@atlas/contracts';

export interface RuntimeDeps {
  registry: ToolRegistry;
}

export function createRuntime(deps: RuntimeDeps): Runtime {
  const { registry } = deps;
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
        try {
          const result = await tool.run(step.args);
          steps.push({ tool: step.tool, args: step.args, result });
        } catch (cause) {
          steps.push({
            tool: step.tool,
            args: step.args,
            result: { ok: false, error: `falha ao executar ${step.tool}: ${(cause as Error).message}` },
          });
        }
      }
      return { steps };
    },
  };
}
```

- [ ] **Step 9: Criar `packages/runtime/src/index.ts`**

```ts
export { createRuntime } from './runtime.js';
export type { RuntimeDeps } from './runtime.js';
```

- [ ] **Step 10: Rodar os testes e confirmar que passam**

Run: `pnpm test -- packages/runtime`
Expected: PASS.

- [ ] **Step 11: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde.

- [ ] **Step 12: Commit**

```bash
git add packages/contracts/src/execution.ts packages/contracts/src/index.ts packages/runtime pnpm-lock.yaml
git commit -m "feat(runtime): @atlas/runtime executa planos sobre o tool registry" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Planner puro (`instruction` + `parse`) em `@atlas/cognitive`

Consolida o Planner em `@atlas/cognitive` como um módulo **puro** (sem gateway): `instruction(tools)` monta o framing que lista as Tools e o schema JSON (string vazia quando não há Tools, para preservar o comportamento atual); `parse(modelOutput)` extrai/valida um `Plan` ou retorna `null` (resposta direta). Nenhum outro código muda ainda — fecha verde de forma independente.

**Files:**
- Create: `packages/cognitive/src/planner.ts`
- Test: `packages/cognitive/tests/planner.test.ts`

**Interfaces:**
- Consumes: `Plan`, `PlanStep`, `ToolDescriptor` de `@atlas/contracts`.
- Produces em `@atlas/cognitive`: `createPlanner(): Planner` (`Planner = { instruction(tools: readonly ToolDescriptor[]): string; parse(modelOutput: string): Plan | null }`).

- [ ] **Step 1: Escrever `packages/cognitive/tests/planner.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createPlanner } from '../src/planner.js';

const planner = createPlanner();

describe('planner.instruction', () => {
  it('retorna string vazia quando não há Tools', () => {
    expect(planner.instruction([])).toBe('');
  });

  it('lista nomes/descrições das Tools e menciona o schema de plano', () => {
    const text = planner.instruction([{ name: 'clock', description: 'hora atual' }]);
    expect(text).toContain('clock');
    expect(text).toContain('hora atual');
    expect(text).toContain('steps');
  });
});

describe('planner.parse', () => {
  it('parseia um plano JSON válido', () => {
    const plan = planner.parse('{"steps":[{"tool":"clock","args":{}}]}');
    expect(plan).toEqual({ steps: [{ tool: 'clock', args: {} }] });
  });

  it('tolera prosa ao redor do JSON', () => {
    const plan = planner.parse('Claro! {"steps":[{"tool":"calc","args":{"expression":"2+2"}}]} pronto');
    expect(plan).toEqual({ steps: [{ tool: 'calc', args: { expression: '2+2' } }] });
  });

  it('texto natural sem JSON retorna null', () => {
    expect(planner.parse('Olá, tudo bem?')).toBeNull();
  });

  it('JSON malformado retorna null', () => {
    expect(planner.parse('lixo {não é json} aqui')).toBeNull();
  });

  it('steps vazio retorna null', () => {
    expect(planner.parse('{"steps":[]}')).toBeNull();
  });

  it('plano com Tool desconhecida ainda parseia (o Runtime é quem falha)', () => {
    expect(planner.parse('{"steps":[{"tool":"xyz","args":{}}]}')).toEqual({
      steps: [{ tool: 'xyz', args: {} }],
    });
  });

  it('passo sem args recebe objeto vazio', () => {
    expect(planner.parse('{"steps":[{"tool":"clock"}]}')).toEqual({
      steps: [{ tool: 'clock', args: {} }],
    });
  });

  it('passo sem tool string retorna null', () => {
    expect(planner.parse('{"steps":[{"args":{}}]}')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `pnpm test -- packages/cognitive/tests/planner.test.ts`
Expected: FAIL — `createPlanner` não existe.

- [ ] **Step 3: Criar `packages/cognitive/src/planner.ts`**

```ts
import type { Plan, PlanStep, ToolDescriptor } from '@atlas/contracts';

export interface Planner {
  instruction(tools: readonly ToolDescriptor[]): string;
  parse(modelOutput: string): Plan | null;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return text.slice(start, end + 1);
}

export function createPlanner(): Planner {
  return {
    instruction(tools: readonly ToolDescriptor[]): string {
      if (tools.length === 0) {
        return '';
      }
      const list = tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
      return [
        'Você tem acesso às seguintes ferramentas:',
        list,
        '',
        'Se — e somente se — atender ao objetivo exigir uma dessas ferramentas, responda ' +
          'APENAS com um objeto JSON, sem nenhum texto ao redor, no formato:',
        '{"steps":[{"tool":"<nome>","args":{ ... }}]}',
        'Você pode incluir vários passos independentes. Se nenhuma ferramenta for necessária, ' +
          'responda normalmente ao usuário, em texto, sem JSON.',
      ].join('\n');
    },

    parse(modelOutput: string): Plan | null {
      const json = extractJsonObject(modelOutput);
      if (json === null) {
        return null;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return null;
      }
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }
      const rawSteps = (parsed as { steps?: unknown }).steps;
      if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
        return null;
      }
      const steps: PlanStep[] = [];
      for (const raw of rawSteps) {
        if (typeof raw !== 'object' || raw === null) {
          return null;
        }
        const tool = (raw as { tool?: unknown }).tool;
        if (typeof tool !== 'string' || tool === '') {
          return null;
        }
        const rawArgs = (raw as { args?: unknown }).args;
        const args =
          typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
            ? (rawArgs as Record<string, unknown>)
            : {};
        steps.push({ tool, args });
      }
      return { steps };
    },
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `pnpm test -- packages/cognitive/tests/planner.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde (o Cognitive Core ainda não usa o Planner; nada mais mudou).

- [ ] **Step 6: Commit**

```bash
git add packages/cognitive/src/planner.ts packages/cognitive/tests/planner.test.ts
git commit -m "feat(cognitive): planner puro (instruction + parse) para planos estruturados" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Cognitive Core orquestra `ask` + `AskResult` + composição no core + traço no CLI

Integra a espinha: `AskResult` no contrato e `CognitiveCore.ask` passa a `Promise<AskResult>`; o Cognitive Core recebe `runtime` e orquestra (planejar → executar → compor); `@atlas/core` compõe o registry (`clock`+`calc`) + Runtime e injeta no Cognitive; a CLI imprime o traço. Como a mudança de tipo de `ask` acopla contracts + cognitive + core + cli, tudo landa junto (typecheck atômico). Os testes existentes são atualizados; novos cobrem os caminhos answer/plan.

**Files:**
- Modify: `packages/contracts/src/cognitive.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/cognitive/src/cognitive-core.ts`
- Modify: `packages/cognitive/tests/cognitive-core.test.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/tests/create-atlas.test.ts`
- Modify: `apps/cli/src/commands/ask.ts`
- Create: `apps/cli/tests/ask.test.ts`
- Modify: `apps/cli/tests/status.test.ts`

**Interfaces:**
- Consumes: `Runtime`, `ExecutedStep` de `@atlas/contracts`; `createPlanner` de `@atlas/cognitive` (Task 3); `createRuntime` de `@atlas/runtime`; `createToolRegistry`/`createClockTool`/`createCalcTool` de `@atlas/tools`.
- Produces em `@atlas/contracts`: `AskResult { readonly text: string; readonly steps?: readonly ExecutedStep[] }`; `CognitiveCore.ask(objective): Promise<AskResult>`.
- Produces: `CognitiveCoreDeps` ganha `runtime: Runtime`. `createAtlas` injeta `runtime` no Cognitive. `runAsk` imprime traço (`🔧 <tool> → <saída|erro: ...>`) + resposta.

- [ ] **Step 1: Adicionar `AskResult` e alterar `ask` em `packages/contracts/src/cognitive.ts`**

Substituir o conteúdo inteiro por:

```ts
import type { Message } from './model.js';
import type { ExecutedStep } from './execution.js';

export interface Conversation {
  readonly messages: readonly Message[];
}

export interface ConversationTurn {
  readonly reply: string;
  readonly conversation: Conversation;
}

export interface AskResult {
  readonly text: string;
  readonly steps?: readonly ExecutedStep[];
}

export interface CognitiveCore {
  ask(objective: string): Promise<AskResult>;
  startConversation(): Conversation;
  respond(conversation: Conversation, input: string): Promise<ConversationTurn>;
}
```

- [ ] **Step 2: Exportar `AskResult` em `packages/contracts/src/index.ts`**

Substituir a linha `export type { CognitiveCore, Conversation, ConversationTurn } from './cognitive.js';` por:

```ts
export type { AskResult, CognitiveCore, Conversation, ConversationTurn } from './cognitive.js';
```

- [ ] **Step 3: Reescrever `packages/cognitive/tests/cognitive-core.test.ts`**

Substituir o arquivo inteiro por (adiciona `runtime` a cada `createCognitiveCore`, ajusta o retorno para `AskResult`, e cobre os caminhos answer/plan):

```ts
import { describe, expect, it } from 'vitest';
import type {
  ExecutionResult,
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  Runtime,
} from '@atlas/contracts';
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

const emptyRuntime: Runtime = {
  tools: () => [],
  execute: async () => ({ steps: [] }),
};

function runtimeWith(
  tools: { name: string; description: string }[],
  execution: ExecutionResult,
): Runtime {
  return {
    tools: () => tools,
    execute: async () => execution,
  };
}

describe('createCognitiveCore.ask', () => {
  it('sem personaPrompt e sem Tools usa só o enquadramento de tarefa (1 chamada)', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'resposta do modelo' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('resuma este texto');

    expect(answer.text).toBe('resposta do modelo');
    expect(answer.steps).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'resuma este texto' },
    ]);
  });

  it('com personaPrompt compõe identidade + tarefa no system message', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      personaPrompt: 'Você é Jarvis.',
    });

    await core.ask('oi');

    expect(calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: `Você é Jarvis.\n\n${TASK_FRAMING}`,
    });
  });

  it('com memoryPrompt inclui o bloco de memória entre identidade e tarefa', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
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
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime, memoryPrompt: 'Fatos: X.' });

    await core.ask('oi');

    expect(calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: `Fatos: X.\n\n${TASK_FRAMING}`,
    });
  });

  it('quando o modelo emite um plano, executa e compõe a resposta com os resultados', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      return call === 1
        ? { text: '{"steps":[{"tool":"clock","args":{}}]}' }
        : { text: 'Hoje é 2026-07-14.' };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: true, output: '2026-07-14' } }],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const answer = await core.ask('que dia é hoje?');

    expect(calls).toHaveLength(2);
    expect(answer.text).toBe('Hoje é 2026-07-14.');
    expect(answer.steps).toEqual([
      { tool: 'clock', args: {}, result: { ok: true, output: '2026-07-14' } },
    ]);
    // o resultado da Tool é injetado na 2ª chamada (composição)
    expect(calls[1]!.messages.at(-1)!.content).toContain('2026-07-14');
    // a 1ª chamada leva a instrução de planejamento no system
    expect(calls[0]!.messages[0]!.content).toContain('clock');
  });

  it('falha de Tool aparece na composição sem derrubar o ask', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      return call === 1
        ? { text: '{"steps":[{"tool":"clock","args":{}}]}' }
        : { text: 'Não consegui obter a hora.' };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: false, error: 'falhou' } }],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const answer = await core.ask('que horas são?');

    expect(answer.text).toBe('Não consegui obter a hora.');
    expect(answer.steps![0]!.result.ok).toBe(false);
    expect(calls[1]!.messages.at(-1)!.content).toContain('ERRO');
  });

  it('propaga erro do gateway sem mascarar', async () => {
    const { gateway } = stubGateway(async () => {
      throw new Error('modelo indisponível');
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    await expect(core.ask('oi')).rejects.toThrow('modelo indisponível');
  });
});
```

- [ ] **Step 4: Rodar os testes e confirmar que falham**

Run: `pnpm test -- packages/cognitive/tests/cognitive-core.test.ts`
Expected: FAIL — `createCognitiveCore` não aceita `runtime`; `ask` retorna string (não `AskResult`); caminho de plano não executa/compõe.

- [ ] **Step 5: Reescrever `packages/cognitive/src/cognitive-core.ts`**

Substituir o conteúdo inteiro por:

```ts
import type {
  AskResult,
  CognitiveCore,
  Conversation,
  ConversationTurn,
  Message,
  ModelGateway,
  Runtime,
} from '@atlas/contracts';
import { createPlanner } from './planner.js';

export const TASK_FRAMING =
  'Responda ao objetivo do usuário de forma clara, correta e objetiva, ' +
  'no mesmo idioma em que ele escreveu. ' +
  'Se faltar informação essencial, diga o que precisa saber em vez de supor.';

export interface CognitiveCoreDeps {
  gateway: ModelGateway;
  runtime: Runtime;
  personaPrompt?: string;
  memoryPrompt?: string;
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway, runtime, personaPrompt, memoryPrompt } = deps;
  const systemPrompt = [personaPrompt, memoryPrompt, TASK_FRAMING]
    .filter((part): part is string => part !== undefined && part !== '')
    .join('\n\n');
  const planner = createPlanner();

  return {
    async ask(objective: string): Promise<AskResult> {
      const instruction = planner.instruction(runtime.tools());
      const planningSystem = [systemPrompt, instruction].filter((part) => part !== '').join('\n\n');
      const first = await gateway.generate({
        messages: [
          { role: 'system', content: planningSystem },
          { role: 'user', content: objective },
        ],
      });

      const plan = planner.parse(first.text);
      if (plan === null) {
        return { text: first.text };
      }

      const execution = await runtime.execute(plan);
      const results = execution.steps
        .map((step) => {
          const outcome = step.result.ok
            ? (step.result.output ?? '')
            : `ERRO: ${step.result.error ?? ''}`;
          return `- ${step.tool}(${JSON.stringify(step.args)}) → ${outcome}`;
        })
        .join('\n');
      const composed = await gateway.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content:
              `${objective}\n\n` +
              `Resultados das ferramentas executadas:\n${results}\n\n` +
              'Responda ao objetivo usando esses resultados.',
          },
        ],
      });
      return { text: composed.text, steps: execution.steps };
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

- [ ] **Step 6: Rodar os testes do cognitive e confirmar que passam**

Run: `pnpm test -- packages/cognitive`
Expected: PASS (planner + cognitive-core).

- [ ] **Step 7: Adicionar as dependências em `packages/core/package.json`**

No bloco `"dependencies"`, adicionar `"@atlas/runtime"` e `"@atlas/tools"` mantendo a ordem alfabética. Bloco resultante esperado:

```json
  "dependencies": {
    "@atlas/cognitive": "workspace:*",
    "@atlas/context": "workspace:*",
    "@atlas/contracts": "workspace:*",
    "@atlas/memory": "workspace:*",
    "@atlas/model-gateway": "workspace:*",
    "@atlas/persona": "workspace:*",
    "@atlas/runtime": "workspace:*",
    "@atlas/tools": "workspace:*"
  }
```

- [ ] **Step 8: Relinkar o workspace**

Run: `pnpm install`
Expected: instala sem erro; `@atlas/core` passa a enxergar `@atlas/runtime` e `@atlas/tools`.

- [ ] **Step 9: Compor registry + runtime e injetar no Cognitive em `packages/core/src/index.ts`**

(a) Adicionar os imports, após a linha `import { createFileMemoryStorage, createMemoryService, type MemoryStorage } from '@atlas/memory';`:

```ts
import { createRuntime } from '@atlas/runtime';
import { createToolRegistry, createClockTool, createCalcTool } from '@atlas/tools';
```

(b) Substituir o bloco que cria o gateway e o cognitive:

```ts
  const gateway = createModelGateway(config.model, { fetch: deps.fetch ?? globalThis.fetch });
  const cognitive = createCognitiveCore({
    gateway,
    personaPrompt: personaService.systemPrompt(persona),
    ...(memoryPrompt !== undefined ? { memoryPrompt } : {}),
  });
```

por:

```ts
  const gateway = createModelGateway(config.model, { fetch: deps.fetch ?? globalThis.fetch });
  const registry = createToolRegistry();
  registry.register(createClockTool());
  registry.register(createCalcTool());
  const runtime = createRuntime({ registry });
  const cognitive = createCognitiveCore({
    gateway,
    runtime,
    personaPrompt: personaService.systemPrompt(persona),
    ...(memoryPrompt !== undefined ? { memoryPrompt } : {}),
  });
```

- [ ] **Step 10: Ajustar a asserção de `ask` em `packages/core/tests/create-atlas.test.ts`**

No teste `'expõe um cognitive que responde via provider fake'`, trocar:

```ts
    const answer = await atlas.cognitive.ask('olá');
    expect(answer).toBe('[fake] olá');
```

por:

```ts
    const answer = await atlas.cognitive.ask('olá');
    expect(answer.text).toBe('[fake] olá');
```

- [ ] **Step 11: Atualizar o mock de `ask` em `apps/cli/tests/status.test.ts`**

No literal do mock, trocar a linha `ask: async () => '',` por:

```ts
        ask: async () => ({ text: '' }),
```

- [ ] **Step 12: Escrever `apps/cli/tests/ask.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { AtlasPlatform } from '@atlas/contracts';
import { runAsk } from '../src/commands/ask.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';

function capture(): { output: OutputGateway; text: () => string } {
  const lines: string[] = [];
  return {
    output: { write: (t) => lines.push(t), error: () => {} },
    text: () => lines.join(''),
  };
}

describe('runAsk', () => {
  it('sem steps imprime só a resposta', async () => {
    const cap = capture();
    const atlas = {
      cognitive: { ask: async () => ({ text: 'olá!' }) },
    } as unknown as AtlasPlatform;

    await runAsk(atlas, 'oi', cap.output);

    expect(cap.text()).toBe('olá!\n');
  });

  it('com steps imprime o traço antes da resposta', async () => {
    const cap = capture();
    const atlas = {
      cognitive: {
        ask: async () => ({
          text: 'Hoje é 2026-07-14.',
          steps: [
            { tool: 'clock', args: {}, result: { ok: true, output: '2026-07-14' } },
            { tool: 'calc', args: { expression: '2+2' }, result: { ok: false, error: 'x' } },
          ],
        }),
      },
    } as unknown as AtlasPlatform;

    await runAsk(atlas, 'oi', cap.output);

    expect(cap.text()).toBe(
      '🔧 clock → 2026-07-14\n🔧 calc → erro: x\n\nHoje é 2026-07-14.\n',
    );
  });
});
```

- [ ] **Step 13: Rodar os testes e confirmar que falham**

Run: `pnpm test -- apps/cli/tests/ask.test.ts`
Expected: FAIL — `runAsk` ainda imprime `${answer}` (objeto) e não trata `steps`.

- [ ] **Step 14: Reescrever `apps/cli/src/commands/ask.ts`**

Substituir o conteúdo inteiro por:

```ts
import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export async function runAsk(
  atlas: AtlasPlatform,
  objective: string,
  output: OutputGateway,
): Promise<void> {
  const result = await atlas.cognitive.ask(objective);
  if (result.steps !== undefined && result.steps.length > 0) {
    for (const step of result.steps) {
      const outcome = step.result.ok
        ? (step.result.output ?? '')
        : `erro: ${step.result.error ?? ''}`;
      output.write(`🔧 ${step.tool} → ${outcome}\n`);
    }
    output.write('\n');
  }
  output.write(`${result.text}\n`);
}
```

- [ ] **Step 15: Rodar os testes e confirmar que passam**

Run: `pnpm test -- apps/cli`
Expected: PASS (`ask.test.ts` novo + `run.test.ts` com provider fake continua verde: sem steps, imprime `[fake] olá`).

- [ ] **Step 16: Verificação completa da task**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde.

- [ ] **Step 17: Commit**

```bash
git add packages/contracts/src/cognitive.ts packages/contracts/src/index.ts packages/cognitive/src/cognitive-core.ts packages/cognitive/tests/cognitive-core.test.ts packages/core apps/cli/src/commands/ask.ts apps/cli/tests/ask.test.ts apps/cli/tests/status.test.ts pnpm-lock.yaml
git commit -m "feat(cognitive): ask orquestra planner + runtime e retorna AskResult com traco" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: ADR-0012, documentação, lições e probe do TS 7

Registra a decisão da espinha de execução (ADR-0012), atualiza a documentação viva, registra lições, roda o probe do TS 7 e fecha a Definition of Done deixando a SPEC em `Review`.

**Files:**
- Create: `docs/06-adr/ADR-0012-planner-runtime-execution.md`
- Create: `packages/tools/CLAUDE.md`
- Create: `packages/runtime/CLAUDE.md`
- Modify: `packages/cognitive/CLAUDE.md`
- Modify: `CLAUDE.md` (raiz — parágrafo de estado + Mapa)
- Modify: `docs/05-context/NEXT_CONTEXT.md`
- Modify: `docs/05-context/CURRENT_SPRINT.md`
- Modify: `implementation/LESSONS_LEARNED.md`
- Modify: `implementation/specs/SPEC-0010-planner-runtime-tools.md` (Status → Review)

- [ ] **Step 1: Criar `docs/06-adr/ADR-0012-planner-runtime-execution.md`**

```markdown
# ADR-0012 — Espinha de execução: plano estruturado Planner-driven, Runtime e Tools

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-14

---

# Contexto

Até a SPEC-0009 o Atlas honrava o ciclo cognitivo de forma **colapsada**: Compreensão + Raciocínio + Resposta numa única chamada `generate()`, sem Planejamento nem Execução. O Atlas só sabia falar. O Module Catalog cataloga Planner (`packages/planner`, consolidável em `packages/cognitive`), Runtime (`packages/runtime`) e Tools (`packages/tools`) como componentes distintos, com autoridade separada. A SPEC-0010 introduz a menor fatia que faz Planejamento e Execução existirem, com Tools reais — e levanta a pergunta central: **como a decisão de usar uma Tool flui, e o modelo executa a Tool como?**

---

# Decisão

**Plano estruturado Planner-driven; Model Gateway intacto.** O modelo produz um **plano em texto estruturado** (JSON) por meio do `generate()` atual; o Runtime o executa deterministicamente. Não se adota tool/function-calling nativo — que mudaria o Model Gateway, borraria a fronteira Planner/Runtime e dependeria de suporte do provedor local. O fluxo respeita a Matriz de Autoridade: Cognitive Core **decide e orquestra** → Planner **transforma** a saída num Plan → Runtime **executa** → Cognitive **compõe** a resposta.

**Papéis.** O **Planner** (consolidado em `@atlas/cognitive`) é **puro**, sem gateway: fornece a instrução de planejamento (lista as Tools + schema JSON) e **parseia** a saída do modelo num `Plan` (ou `null` = resposta direta). O **Cognitive Core** faz as chamadas ao modelo e orquestra: 1ª chamada (prompt composto + instrução) → parse → se houver plano, `runtime.execute` + 2ª chamada de composição com os resultados. O **Runtime** (`@atlas/runtime`) coordena a execução sequencial sobre um **Tool Registry** e expõe `tools()`; nunca lança por falha de Tool (falhas são `ToolResult`/`ExecutedStep` estruturados). As **Tools** (`@atlas/tools`) são adaptadores puros (`clock`, `calc`), sem decidir quando são usadas.

**Colapso honesto da classificação.** A decisão "responder direto × precisar de Tool" está **colapsada** na 1ª chamada `generate()` (como Compreensão+Raciocínio+Resposta já estavam colapsados). Quando o objetivo não precisa de Tool, o parse retorna `null` e o Atlas responde em **1** chamada, com o mesmo prompt composto (persona + memória + tarefa) de antes — sem regressão de comportamento nem custo.

**Transparência via `AskResult`.** `CognitiveCore.ask` passa a retornar `AskResult { text; steps? }`; o CLI mostra um traço compacto da execução — tangível e verificável sem depender do Activity Service (inexistente).

**Passos independentes.** Nesta fatia os passos de um plano não têm dependência de dados entre si: o Runtime executa todos e a composição recebe os resultados juntos. Grafo de dependências / threading de dados é fatia futura.

---

# Consequências

Positivas:

- Planejamento e Execução deixam de ser colapsados; o Atlas passa a **fazer** (hora e aritmética reais).
- Model Gateway estável; fronteiras de autoridade limpas; Planner puro e testável sem gateway.
- Tools/Runtime dependem só de contratos; segunda Tool é só `registry.register(x)` — a máquina já é multi-tool.

Custos e riscos:

- Confiabilidade do plano depende do modelo emitir JSON parseável (mitigado: parse falha → resposta direta; risco documentado; modelos locais variam).
- Roteamento answer-vs-plan colapsado numa chamada mistura "responder em texto" e "emitir JSON" — aceitável nesta fatia; descolapsar é trabalho futuro.
- Tools puras por ora (sem Permission Service): Tools com efeito colateral aguardam o serviço de permissão.

---

# Alternativas Consideradas

**Tool/function-calling nativo no Model Gateway.** Padrão de mercado e mais poderoso, mas muda o Gateway, borra Planner/Runtime e depende de suporte do provedor local. Rejeitada nesta fatia.

**Planner que chama o modelo.** Faria o Planner consumir o gateway e produzir o plano sozinho. Rejeitada: manter o Planner **puro** (schema + parse) e deixar a chamada no Cognitive Core preserva a autoridade estratégica e a testabilidade sem gateway.

**Manter `ask(): Promise<string>` e esconder a execução.** Mais fino, mas a execução ficaria invisível/inverificável no terminal. Rejeitada em favor de `AskResult` (transparência é valor do ciclo cognitivo).

**Task Manager completo (fila/retry/timeout/cancelamento).** Cedo demais para execução sequencial de Tools puras (YAGNI). Adiada para quando surgir execução assíncrona/Skills.
```

- [ ] **Step 2: Criar `packages/tools/CLAUDE.md`**

```markdown
# @atlas/tools

Tools (Execution/Extension) — adaptadores e catálogo de ferramentas do Atlas (ADR-0012).

- `createToolRegistry()` → `register/get/has/list` sobre um `Map` (fonte do catálogo consumido pelo Runtime).
- `createClockTool({ now? })` → Tool `clock` (data/hora ISO; `now` injetável nos testes). `createCalcTool()` → Tool `calc` (aritmética via parser próprio restrito).
- Tools são **puras**: sem rede, disco, filesystem ou efeitos colaterais (o Permission Service ainda não existe). `calc` **não** usa `eval`/`Function`.
- Uma Tool **não decide quando é usada** (Module Catalog) — só executa `run(args)` e devolve `ToolResult` estruturado (`ok`/`output`/`error`), nunca lança para o chamador em erro esperado.
- Depende só de `@atlas/contracts` (Regra 5: Tools não dependem do Cognitive Core). Contratos `Tool`/`ToolResult`/`ToolDescriptor`/`ToolRegistry` vivem em `@atlas/contracts`.
```

- [ ] **Step 3: Criar `packages/runtime/CLAUDE.md`**

```markdown
# @atlas/runtime

Runtime (Execution) — coordena a execução de um Plan sobre o Tool Registry (ADR-0012).

- `createRuntime({ registry })` → `execute(plan)` (executa os passos em ordem; resolve cada Tool no registry; **nunca lança** por falha de Tool — Tool inexistente ou que lança vira `ExecutedStep` com `ToolResult` de erro; continua nos demais passos) e `tools()` (descritores nome+descrição das Tools, consumido pelo Planner via Cognitive).
- Passos são **independentes** nesta fatia (sem dependência de dados entre Tools). Task Manager completo (fila/retry/timeout/cancelamento) é fatia futura.
- **Não** redefine o objetivo estratégico (Regra 8) nem decide estratégia. Depende só de `@atlas/contracts`. Contratos `Plan`/`PlanStep`/`ExecutedStep`/`ExecutionResult`/`Runtime` vivem em `@atlas/contracts`.
```

- [ ] **Step 4: Atualizar `packages/cognitive/CLAUDE.md`**

READ o arquivo primeiro. Ajustar:
- O bullet do ciclo colapsado: o `ask` **deixou de ser tiro único** — passa a **orquestrar** Planejamento + Execução (ADR-0012): 1ª `generate()` (prompt composto + instrução do Planner) → `planner.parse` → se houver `Plan`, `runtime.execute` + 2ª `generate()` de composição; sem plano, 1 chamada (como antes). `ask` retorna `AskResult { text; steps? }`.
- Acrescentar o **Planner** consolidado no package: `createPlanner()` **puro** (sem gateway) — `instruction(tools)` (framing + schema JSON; string vazia sem Tools) e `parse(saída)` (→ `Plan | null`). O Cognitive recebe o `runtime` por injeção e importa só o **tipo** `Runtime` de `@atlas/contracts` (nunca `@atlas/runtime`/`@atlas/tools`).
- Manter que `respond`/`startConversation` seguem inalterados e puros; o Core segue sem estado. Manter os bullets de system prompt composto e desacoplamento de Persona/Memory.

- [ ] **Step 5: Atualizar `CLAUDE.md` (raiz)**

- No parágrafo de estado (SPEC concluídas), acrescentar a SPEC-0010 e uma frase: "existe `@atlas/tools` (`createToolRegistry` + Tools puras `clock`/`calc`) e `@atlas/runtime` (`createRuntime({ registry })` → `execute(plan)`/`tools()`); o Cognitive Core ganhou um **Planner** puro consolidado e o `ask` passou a **orquestrar** Planejamento + Execução (Planner-driven, Model Gateway intacto): objetivo simples → resposta direta (1 chamada, como antes); objetivo que precisa de Tool → plano estruturado → Runtime executa `clock`/`calc` → resposta composta na voz da Persona; `atlas ask` mostra um traço da execução; `ask` retorna `AskResult { text; steps? }` (ADR-0012). Passos independentes; `respond`/`chat` seguem sem planejamento."
- No Mapa da documentação, adicionar as linhas do Planner/Runtime/Tools e do ADR-0012 (execução Planner-driven; Runtime; Tools; onde vivem).
- Atualizar o "estado em julho/2026" citando a SPEC-0010.

- [ ] **Step 6: Atualizar `docs/05-context/NEXT_CONTEXT.md`**

- Mover a SPEC-0010 para o "Estado Imediato" como `Review`, descrevendo a entrega (`@atlas/tools` registry + `clock`/`calc`; `@atlas/runtime` `execute`/`tools`; Planner puro consolidado em `@atlas/cognitive`; `ask` orquestra e retorna `AskResult`; composição no core; traço no `atlas ask`; contratos de execução em `@atlas/contracts`; ADR-0012; Model Gateway intacto; passos independentes; `respond` puro).
- Atualizar a contagem de testes após a suíte (Step 8) e o resultado do probe do TS 7 (Step 7) nas Pendências (sétimo probe).
- Atualizar o "Mapa Rápido" com Planner/Runtime/Tools e o ADR-0012.
- Trocar a seção "Próximo Trabalho" para SPEC-0011 (a definir), removendo desta fatia entregue as candidatas já cobertas e mantendo as próximas fatias do ciclo (fatia 2: mais Tools/Skills/Permission Service e execução real com efeito colateral; dependência de dados entre passos; Task Manager completo; Observação/replanejamento; Aprendizado automático) e as demais candidatas (memória episódica/projetos/busca, provedor Anthropic, config por arquivo, distribuição da CLI, troca de persona em runtime).

- [ ] **Step 7: Atualizar `docs/05-context/CURRENT_SPRINT.md`**

Adicionar a linha `| SPEC-0010 | Planner + Runtime + Tools (execução ponta a ponta) | Review |` na tabela, no mesmo formato das demais. (Se o sprint "Fundação do MVP" já estiver encerrado conceitualmente, manter a tabela como registro histórico e apenas acrescentar a linha.)

- [ ] **Step 8: Probe do TypeScript 7**

Run: `pnpm add -Dw typescript@^7 && pnpm lint`
- Se **passar**: manter e anotar em `NEXT_CONTEXT.md`/`LESSONS_LEARNED.md` a adoção do TS 7.
- Se **falhar** (esperado, como nos 6 probes anteriores): reverter com `pnpm add -Dw typescript@^5` e registrar o probe falho na data de hoje (2026-07-14). Ao final, `typescript` deve estar em `^5` com a suíte verde.

- [ ] **Step 9: Registrar lições e rodar a Definition of Done**

Adicionar em `implementation/LESSONS_LEARNED.md` uma seção da SPEC-0010 cobrindo: (a) espinha de execução Planner-driven com Model Gateway intacto (o modelo emite JSON, o Runtime executa) — ADR-0012; (b) Planner **puro** sem gateway (schema + parse) separado da chamada ao modelo (feita pelo Cognitive) → testável sem gateway; instrução vazia sem Tools preserva o caminho de 1 chamada e os testes existentes; (c) mudança de tipo de contrato (`ask: Promise<string>` → `Promise<AskResult>`) acopla contracts + cognitive + core + cli numa única task para manter o typecheck atômico — contraste com adições inertes de contrato; (d) máquina multi-tool "de graça" (registry `Map` + plano-lista + runtime-loop), com 2 Tools puras (`clock`/`calc`) exercitando a seleção sem Permission Service; (e) Runtime nunca lança por falha de Tool (falhas estruturadas) e passos independentes evitam Task Manager completo (YAGNI); (f) `calc` com parser de descida recursiva próprio (sem `eval`) sob `noUncheckedIndexedAccess`; (g) resultado do probe do TS 7 (sétimo probe).

Run (verificação final): `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde. Anotar a contagem final de testes no NEXT_CONTEXT.

- [ ] **Step 10: Marcar a SPEC como Review**

Em `implementation/specs/SPEC-0010-planner-runtime-tools.md`, mudar o Status para `Review` (marcar `[x] Review`, desmarcar `[x] Draft`).

- [ ] **Step 11: Commit**

```bash
git add docs/ packages/tools/CLAUDE.md packages/runtime/CLAUDE.md packages/cognitive/CLAUDE.md CLAUDE.md implementation/LESSONS_LEARNED.md implementation/specs/SPEC-0010-planner-runtime-tools.md package.json pnpm-lock.yaml
git commit -m "docs(execution): ADR-0012, documentacao e licoes da SPEC-0010 (Review)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Ordem de gates:** cada task termina verde na suíte inteira (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`), permitindo review entre tasks.
- **`pnpm test -- <path>`** roda um subconjunto (vitest); a verificação de fechamento de cada task usa a suíte inteira.
- **Nenhum teste toca rede ou disco:** Tools puras; Runtime/Planner testados com fakes; o Cognitive usa gateway/runtime stub. Não há efeito colateral novo nesta SPEC.
- **Fake provider** (`[fake] <última mensagem>`) nunca emite JSON de plano, então `atlas ask --provider fake` segue no caminho de resposta direta — os caminhos de plano são cobertos por testes com gateway roteirizado. Verificação real de plano/execução: `pnpm --filter @atlas/cli exec tsx src/main.ts ask "que dia é hoje?" --provider local` (exige Ollama).
- **Se o executor de comandos do harness ficar indisponível**, o usuário pode rodar as verificações com o prefixo `!`.
- **RTK mascara saída/erros**; para ver o completo use `rtk proxy <cmd>` (log em `~/Library/Application Support/rtk/tee/`).
- **`Done` só após aprovação humana** do review (processo do projeto): esta implementação para em `Review`.
```