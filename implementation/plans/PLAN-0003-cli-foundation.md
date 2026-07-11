# SPEC-0003 CLI Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `apps/cli` (`@atlas/cli`) com o comando `atlas status` (+ `--help`/`--version`), consumindo `createAtlas()`, com Input/Output Gateway locais, precedência `flags > env` e execução via *type stripping* nativo do Node — tudo por TDD.

**Architecture:** `main.ts` é uma casca de processo fina; toda a lógica vive em `run(argv, env, gateways, version)`, que recebe os gateways por parâmetro (ADR-0004). O Input Gateway normaliza `argv`+`env` em `ParsedInput`; o Output Gateway é o limite de escrita (stdout/stderr) com streams injetáveis; o comando `status` formata o conteúdo. A validação de config permanece no core. Sem `dist/`: `bin` aponta para `./src/main.ts`.

**Tech Stack:** TypeScript 5.9 strict (NodeNext/ESM, `verbatimModuleSyntax`), Node ≥ 24 (`node:util` `parseArgs`, *type stripping* nativo), Vitest 4, pnpm workspace.

## Global Constraints

- NENHUMA dependência de runtime externa nova; as dependências de `@atlas/cli` são apenas packages do workspace: `@atlas/contracts: workspace:*` (tipos públicos) e `@atlas/core: workspace:*`. O core não re-exporta os tipos de contracts, então a CLI importa os contratos direto de `@atlas/contracts`. Parsing via `node:util` (`parseArgs`).
- NÃO alterar `@atlas/contracts` nem `@atlas/core`. Se algo sugerir que uma mudança neles é necessária, **parar e registrar** antes de prosseguir (Constituição).
- A validação de configuração permanece no core (`loadConfig`): o Input Gateway repassa valores crus; o core é a única fonte de verdade da validação.
- Interfaces de Gateway ficam locais em `apps/cli`; sem tocar em `@atlas/contracts`.
- Sem `dist/`: execução direta do fonte `.ts` via `tsx` (`devDependency`); `bin` → `./src/main.ts` (shebang `#!/usr/bin/env -S npx tsx`). Nota: a rota original (Node nativo/type stripping) falhou pela convenção de imports `.js`; ver Task 4 Step 6.
- `verbatimModuleSyntax` está ligado: imports somente-de-tipo usam `import type`. Imports relativos com sufixo `.js` (ESM NodeNext). Imports de packages via `@atlas/*`.
- `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` estão ligados: tratar acessos indexados como possivelmente `undefined` e só atribuir propriedades opcionais quando definidas.
- devDependencies permanecem centralizadas na raiz; o script do package usa os binários da raiz.
- Mensagens de commit: conventional commits em português; todo commit com segundo `-m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`.
- Diretório de trabalho: `/Users/lohanberg/Documents/Repos/Atlas`.

---

### Task 1: Esqueleto do `apps/cli` + Output Gateway

Cria o package executável, ajusta o glob do Vitest e entrega a primeira unidade testável: o Output Gateway.

**Files:**
- Create: `apps/cli/package.json`, `apps/cli/tsconfig.json`, `apps/cli/CLAUDE.md`, `apps/cli/README.md`, `apps/cli/src/gateway/output-gateway.ts`
- Modify: `vitest.config.ts` (glob de apps)
- Test: `apps/cli/tests/output-gateway.test.ts`

**Interfaces:**
- Consumes: fundação das SPECs 0001/0002 (`@atlas/core`).
- Produces: `OutputGateway { write(text: string): void; error(text: string): void }`, `Writable { write(text: string): unknown }`, `OutputStreams { stdout: Writable; stderr: Writable }`, e `createConsoleOutputGateway(streams?: OutputStreams): OutputGateway` — nomes exatos consumidos pelas Tasks 3 e 4.

- [ ] **Step 1: Ajustar o glob do Vitest para enxergar apps**

`vitest.config.ts` (conteúdo completo):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.ts',
      'packages/*/tests/**/*.test.ts',
      'apps/*/tests/**/*.test.ts',
    ],
  },
});
```

- [ ] **Step 2: Criar o esqueleto do package**

`apps/cli/package.json`:

```json
{
  "name": "@atlas/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "atlas": "./src/main.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@atlas/contracts": "workspace:*",
    "@atlas/core": "workspace:*"
  }
}
```

`apps/cli/tsconfig.json`:

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

`apps/cli/CLAUDE.md`:

```markdown
# @atlas/cli

Primeira interface executável do Atlas (SPEC-0003). Casca de processo (`main.ts`) + `run()` testável + sementes de Input/Output Gateway.

- Aplicação: consome `@atlas/core` (`createAtlas`), não reimplementa lógica do Core.
- Sementes de Input Gateway (normaliza `argv`+`env`) e Output Gateway (entrega stdout/stderr) — interfaces locais; promover a `@atlas/contracts` só com um 2º consumidor (via ADR).
- Precedência de config: `flags > env > arquivo > defaults` (ADR-0006); `flags` e `env` implementados; `arquivo` reservado. Validação fica no core.
- Execução sem `dist/`: `bin` → `./src/main.ts` via *type stripping* nativo do Node (ADR-0005).
- Sem dependências de runtime além de `@atlas/core`; parsing via `node:util`.
```

`apps/cli/README.md`:

```markdown
# @atlas/cli

Interface de linha de comando do Atlas.

## Uso

```bash
atlas status        # sobe a plataforma, mostra estado e config, desliga
atlas --version     # versão
atlas --help        # ajuda
```

Overrides de configuração (precedência: flag > env > default):

- `--log-level <silent|error|info|debug>` · `ATLAS_LOG_LEVEL`
- `--data-dir <caminho>` · `ATLAS_DATA_DIR`

Durante o desenvolvimento, sem `dist/`:

```bash
node apps/cli/src/main.ts status
```
```

- [ ] **Step 3: Instalar o workspace (linka `@atlas/cli` e sua dep)**

Run: `pnpm install`
Expected: conclui sem erros; `@atlas/cli` reconhecido no workspace com `@atlas/core` linkado.

- [ ] **Step 4: Escrever o teste do Output Gateway (antes da implementação)**

`apps/cli/tests/output-gateway.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createConsoleOutputGateway } from '../src/gateway/output-gateway.js';

function fakeStream() {
  const chunks: string[] = [];
  return {
    chunks,
    text: () => chunks.join(''),
    write: (text: string) => {
      chunks.push(text);
      return true;
    },
  };
}

describe('ConsoleOutputGateway', () => {
  it('write envia o texto exato ao stdout e nada ao stderr', () => {
    const out = fakeStream();
    const err = fakeStream();
    const gw = createConsoleOutputGateway({ stdout: out, stderr: err });
    gw.write('olá\n');
    expect(out.text()).toBe('olá\n');
    expect(err.text()).toBe('');
  });

  it('error envia o texto exato ao stderr e nada ao stdout', () => {
    const out = fakeStream();
    const err = fakeStream();
    const gw = createConsoleOutputGateway({ stdout: out, stderr: err });
    gw.error('falha\n');
    expect(err.text()).toBe('falha\n');
    expect(out.text()).toBe('');
  });
});
```

- [ ] **Step 5: Rodar o teste e verificar que falha**

Run: `pnpm test -- apps/cli/tests/output-gateway.test.ts`
Expected: FAIL — não resolve `../src/gateway/output-gateway.js` (módulo inexistente).

- [ ] **Step 6: Implementar o Output Gateway**

`apps/cli/src/gateway/output-gateway.ts`:

```ts
export interface OutputGateway {
  write(text: string): void;
  error(text: string): void;
}

export interface Writable {
  write(text: string): unknown;
}

export interface OutputStreams {
  stdout: Writable;
  stderr: Writable;
}

export function createConsoleOutputGateway(
  streams: OutputStreams = { stdout: process.stdout, stderr: process.stderr },
): OutputGateway {
  return {
    write(text) {
      streams.stdout.write(text);
    },
    error(text) {
      streams.stderr.write(text);
    },
  };
}
```

- [ ] **Step 7: Rodar o teste e verificar que passa**

Run: `pnpm test -- apps/cli/tests/output-gateway.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 8: Commit**

```bash
git add apps/cli vitest.config.ts
git commit -m "feat: cria apps/cli com output gateway" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Input Gateway (normalização de `argv` + `env`)

TDD do `CliInputGateway.normalize` e do erro de uso local.

**Files:**
- Create: `apps/cli/src/gateway/input-gateway.ts`
- Test: `apps/cli/tests/input-gateway.test.ts`

**Interfaces:**
- Consumes: `AtlasConfig` de `@atlas/contracts` (tipo).
- Produces: `ParsedInput { command: 'status' | 'help' | 'version'; configOverride: Partial<AtlasConfig> }`, `InputGateway { normalize(argv: string[], env: NodeJS.ProcessEnv): ParsedInput }`, `createCliInputGateway(): InputGateway`, e `class CliUsageError extends Error` — consumidos pela Task 4 (`run`).

- [ ] **Step 1: Escrever os testes do Input Gateway (antes da implementação)**

`apps/cli/tests/input-gateway.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCliInputGateway, CliUsageError } from '../src/gateway/input-gateway.js';

const gw = createCliInputGateway();

describe('CliInputGateway.normalize', () => {
  it('sem argumentos retorna o comando help', () => {
    expect(gw.normalize([], {})).toEqual({ command: 'help', configOverride: {} });
  });

  it('status sem overrides', () => {
    expect(gw.normalize(['status'], {})).toEqual({ command: 'status', configOverride: {} });
  });

  it('--help e -h têm prioridade sobre o positional', () => {
    expect(gw.normalize(['status', '--help'], {}).command).toBe('help');
    expect(gw.normalize(['-h'], {}).command).toBe('help');
  });

  it('--version e -v retornam o comando version', () => {
    expect(gw.normalize(['--version'], {}).command).toBe('version');
    expect(gw.normalize(['-v'], {}).command).toBe('version');
  });

  it('a flag --log-level sobrepõe o env ATLAS_LOG_LEVEL', () => {
    const parsed = gw.normalize(['status', '--log-level', 'debug'], { ATLAS_LOG_LEVEL: 'error' });
    expect(parsed.configOverride).toEqual({ logLevel: 'debug' });
  });

  it('o env preenche a config quando não há flag correspondente', () => {
    const parsed = gw.normalize(['status'], {
      ATLAS_LOG_LEVEL: 'error',
      ATLAS_DATA_DIR: '/tmp/atlas',
    });
    expect(parsed.configOverride).toEqual({ logLevel: 'error', dataDir: '/tmp/atlas' });
  });

  it('a flag --data-dir sobrepõe o env ATLAS_DATA_DIR', () => {
    const parsed = gw.normalize(['status', '--data-dir', '/flag'], { ATLAS_DATA_DIR: '/env' });
    expect(parsed.configOverride).toEqual({ dataDir: '/flag' });
  });

  it('comando desconhecido lança CliUsageError', () => {
    expect(() => gw.normalize(['bogus'], {})).toThrow(CliUsageError);
  });

  it('flag desconhecida lança CliUsageError', () => {
    expect(() => gw.normalize(['status', '--nope'], {})).toThrow(CliUsageError);
  });
});
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

Run: `pnpm test -- apps/cli/tests/input-gateway.test.ts`
Expected: FAIL — não resolve `../src/gateway/input-gateway.js`.

- [ ] **Step 3: Implementar o Input Gateway**

`apps/cli/src/gateway/input-gateway.ts`:

```ts
import { parseArgs } from 'node:util';
import type { AtlasConfig } from '@atlas/contracts';

export interface ParsedInput {
  command: 'status' | 'help' | 'version';
  configOverride: Partial<AtlasConfig>;
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

function resolveConfigOverride(
  values: { 'log-level'?: string | undefined; 'data-dir'?: string | undefined },
  env: NodeJS.ProcessEnv,
): Partial<AtlasConfig> {
  const override: Partial<AtlasConfig> = {};

  // Camada env (menor precedência). Valores crus; o core valida.
  if (env.ATLAS_LOG_LEVEL !== undefined) {
    override.logLevel = env.ATLAS_LOG_LEVEL as AtlasConfig['logLevel'];
  }
  if (env.ATLAS_DATA_DIR !== undefined) {
    override.dataDir = env.ATLAS_DATA_DIR;
  }

  // Camada flags (maior precedência).
  if (values['log-level'] !== undefined) {
    override.logLevel = values['log-level'] as AtlasConfig['logLevel'];
  }
  if (values['data-dir'] !== undefined) {
    override.dataDir = values['data-dir'];
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
      if (command !== 'status') {
        throw new CliUsageError(`comando desconhecido: ${String(command)}`);
      }

      return { command: 'status', configOverride: resolveConfigOverride(values, env) };
    },
  };
}
```

- [ ] **Step 4: Rodar os testes e verificar que passam**

Run: `pnpm test -- apps/cli/tests/input-gateway.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/gateway/input-gateway.ts apps/cli/tests/input-gateway.test.ts
git commit -m "feat: adiciona input gateway com precedência flags sobre env" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Comando `status`

TDD do `runStatus`, que formata estado + config e entrega pelo Output Gateway.

**Files:**
- Create: `apps/cli/src/commands/status.ts`
- Test: `apps/cli/tests/status.test.ts`

**Interfaces:**
- Consumes: `AtlasPlatform` de `@atlas/contracts`; `OutputGateway` da Task 1.
- Produces: `runStatus(atlas: AtlasPlatform, output: OutputGateway): void` — consumido pela Task 4 (`run`).

- [ ] **Step 1: Escrever o teste do comando status (antes da implementação)**

`apps/cli/tests/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AtlasPlatform } from '@atlas/contracts';
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

describe('runStatus', () => {
  it('renderiza estado e config resolvida', () => {
    const atlas: AtlasPlatform = {
      state: 'ready',
      config: { logLevel: 'info', dataDir: '/home/x/.atlas' },
      shutdown: async () => {},
    };
    const cap = capture();
    runStatus(atlas, cap.gateway);
    const text = cap.text();
    expect(text).toContain('Atlas: ready');
    expect(text).toContain('logLevel: info');
    expect(text).toContain('dataDir: /home/x/.atlas');
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `pnpm test -- apps/cli/tests/status.test.ts`
Expected: FAIL — não resolve `../src/commands/status.js`.

- [ ] **Step 3: Implementar o comando status**

`apps/cli/src/commands/status.ts`:

```ts
import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export function runStatus(atlas: AtlasPlatform, output: OutputGateway): void {
  const { state, config } = atlas;
  output.write(
    [`Atlas: ${state}`, `logLevel: ${config.logLevel}`, `dataDir: ${config.dataDir}`, ''].join(
      '\n',
    ),
  );
}
```

- [ ] **Step 4: Rodar o teste e verificar que passa**

Run: `pnpm test -- apps/cli/tests/status.test.ts`
Expected: PASS (1 teste).

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/status.ts apps/cli/tests/status.test.ts
git commit -m "feat: adiciona comando status" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `run()` (integração) + `main.ts` (casca) + execução real

TDD do `run()` costurando Input Gateway + core real + Output Gateway; depois `main.ts` fino e verificação da execução via `node`.

**Files:**
- Create: `apps/cli/src/run.ts`, `apps/cli/src/main.ts`
- Test: `apps/cli/tests/run.test.ts`

**Interfaces:**
- Consumes: `createCliInputGateway`, `CliUsageError` (Task 2); `OutputGateway`, `createConsoleOutputGateway` (Task 1); `runStatus` (Task 3); `createAtlas` de `@atlas/core`; `InvalidConfigError` de `@atlas/contracts`.
- Produces: `CliGateways { input: InputGateway; output: OutputGateway }`, `run(argv: string[], env: NodeJS.ProcessEnv, gateways: CliGateways, version: string): Promise<number>`.

- [ ] **Step 1: Escrever os testes de integração do `run` (antes da implementação)**

`apps/cli/tests/run.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCliInputGateway } from '../src/gateway/input-gateway.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';
import { run } from '../src/run.js';

function harness() {
  const out: string[] = [];
  const err: string[] = [];
  const output: OutputGateway = {
    write: (text) => {
      out.push(text);
    },
    error: (text) => {
      err.push(text);
    },
  };
  return {
    gateways: { input: createCliInputGateway(), output },
    out: () => out.join(''),
    err: () => err.join(''),
  };
}

describe('run (integração apps → core)', () => {
  it('status sobe o core, imprime ready e retorna 0', async () => {
    const h = harness();
    const code = await run(['status'], {}, h.gateways, '0.1.0');
    expect(code).toBe(0);
    expect(h.out()).toContain('Atlas: ready');
    expect(h.out()).toContain('logLevel: info');
  });

  it('a flag sobrepõe o env na config resolvida', async () => {
    const h = harness();
    const code = await run(
      ['status', '--log-level', 'debug'],
      { ATLAS_LOG_LEVEL: 'error' },
      h.gateways,
      '0.1.0',
    );
    expect(code).toBe(0);
    expect(h.out()).toContain('logLevel: debug');
  });

  it('log-level inválido retorna 1 e escreve em stderr', async () => {
    const h = harness();
    const code = await run(['status', '--log-level', 'bogus'], {}, h.gateways, '0.1.0');
    expect(code).toBe(1);
    expect(h.err()).toContain('inválid');
    expect(h.out()).toBe('');
  });

  it('comando desconhecido retorna 2 e escreve o uso em stderr', async () => {
    const h = harness();
    const code = await run(['bogus'], {}, h.gateways, '0.1.0');
    expect(code).toBe(2);
    expect(h.err()).toContain('Usage:');
  });

  it('--version retorna 0 e imprime a versão injetada', async () => {
    const h = harness();
    const code = await run(['--version'], {}, h.gateways, '9.9.9');
    expect(code).toBe(0);
    expect(h.out()).toContain('9.9.9');
  });

  it('--help retorna 0 e imprime o uso', async () => {
    const h = harness();
    const code = await run(['--help'], {}, h.gateways, '0.1.0');
    expect(code).toBe(0);
    expect(h.out()).toContain('Usage:');
  });
});
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

Run: `pnpm test -- apps/cli/tests/run.test.ts`
Expected: FAIL — não resolve `../src/run.js`.

- [ ] **Step 3: Implementar `run()`**

`apps/cli/src/run.ts`:

```ts
import { InvalidConfigError } from '@atlas/contracts';
import { createAtlas } from '@atlas/core';
import { runStatus } from './commands/status.js';
import { CliUsageError } from './gateway/input-gateway.js';
import type { InputGateway, ParsedInput } from './gateway/input-gateway.js';
import type { OutputGateway } from './gateway/output-gateway.js';

export interface CliGateways {
  input: InputGateway;
  output: OutputGateway;
}

const HELP_TEXT = `Usage: atlas <command> [options]

Commands:
  status               Mostra o estado da plataforma e a config resolvida

Options:
  -h, --help           Mostra esta ajuda
  -v, --version        Mostra a versão
      --log-level <l>  Sobrepõe o nível de log (silent|error|info|debug)
      --data-dir <p>   Sobrepõe o diretório de dados
`;

export async function run(
  argv: string[],
  env: NodeJS.ProcessEnv,
  gateways: CliGateways,
  version: string,
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
    const atlas = await createAtlas({ config: parsed.configOverride });
    runStatus(atlas, output);
    await atlas.shutdown();
    return 0;
  } catch (cause) {
    if (cause instanceof InvalidConfigError) {
      output.error(
        `Configuração inválida:\n${cause.issues.map((issue) => `  - ${issue}`).join('\n')}\n`,
      );
      return 1;
    }
    throw cause;
  }
}
```

- [ ] **Step 4: Rodar os testes e verificar que passam**

Run: `pnpm test -- apps/cli/tests/run.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Implementar `main.ts` (casca de processo)**

`apps/cli/src/main.ts`:

```ts
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createCliInputGateway } from './gateway/input-gateway.js';
import { createConsoleOutputGateway } from './gateway/output-gateway.js';
import { run } from './run.js';

function readVersion(): string {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { version: string };
  return pkg.version;
}

const gateways = {
  input: createCliInputGateway(),
  output: createConsoleOutputGateway(),
};

const code = await run(process.argv.slice(2), process.env, gateways, readVersion());
process.exit(code);
```

- [ ] **Step 6: Verificar a execução real via `tsx`**

> **Nota de execução (2026-07-11):** a rota original (Node nativo via *type stripping*) falhou — o Node não remapeia imports `.js` (NodeNext) para `.ts`, e o repositório inteiro usa essa convenção (até `@atlas/core` falha). Decisão consultada com o usuário: usar `tsx` (`devDependency`). Shebang do `bin`: `#!/usr/bin/env -S npx tsx`. O `esbuild` (motor do `tsx`) precisa ser aprovado em `pnpm-workspace.yaml` (`allowBuilds: { esbuild: true }`).

Run: `tsx apps/cli/src/main.ts status`
Expected: imprime `Atlas: ready`, `logLevel: info`, `dataDir: <home>/.atlas`; encerra com código `0` (`echo $?` ⇒ `0`).

Run: `tsx apps/cli/src/main.ts --version`
Expected: imprime `0.1.0`; código `0`.

Run: `tsx apps/cli/src/main.ts bogus`
Expected: imprime o uso em stderr; código `2` (`echo $?` ⇒ `2`).

- [ ] **Step 7: Commit**

```bash
git add apps/cli/src/run.ts apps/cli/src/main.ts apps/cli/tests/run.test.ts
git commit -m "feat: adiciona run() e main.ts da CLI" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: ADRs, documentação e validação final

Registra as decisões arquiteturais, atualiza o `CLAUDE.md` e valida a suíte completa. Fecha a Definition of Done (exceto a aprovação humana e as lições, tratadas na conclusão da SPEC).

**Files:**
- Create: `docs/06-adr/ADR-0005-app-typescript-execution.md`, `docs/06-adr/ADR-0006-config-source-precedence.md`
- Modify: `CLAUDE.md` (raiz)

**Interfaces:**
- Consumes: tudo das Tasks 1–4.
- Produces: nenhuma interface de código.

- [ ] **Step 1: Registrar o ADR-0005**

`docs/06-adr/ADR-0005-app-typescript-execution.md`:

```markdown
# ADR-0005 — Execução de TypeScript em aplicações via type stripping nativo do Node

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-11

---

# Contexto

As aplicações em `apps/` (a começar por `apps/cli`) precisam executar TypeScript. O monorepo não produz `dist/`: os packages exportam `./src/index.ts` e Vitest/`tsc` resolvem direto do fonte — padrão registrado como acerto na SPEC-0002 (dev loop instantâneo). O Node ≥ 24 remove tipos de arquivos `.ts` nativamente (type stripping), inclusive nos `.ts` importados de outros packages do workspace.

---

# Decisão

Aplicações executáveis rodam o fonte `.ts` diretamente via type stripping nativo do Node.

- O `bin` aponta para `./src/main.ts`, com shebang `#!/usr/bin/env node`.
- Nenhum passo de build e nenhum executor de TypeScript adicional (sem `tsx`).
- Restringe-se à sintaxe TypeScript "apagável" (sem `enum`/`namespace` com runtime); imports somente-de-tipo usam `import type` — já garantido por `verbatimModuleSyntax`.

---

# Consequências

Positivas:

- zero dependências de runtime ou de tooling de execução;
- coerência com o padrão sem-`dist`; dev loop instantâneo estendido às aplicações;
- Princípio 13 preservado: a plataforma não passa a depender de um bundler/executor.

Custos e riscos:

- limita a sintaxe TS à porção apagável (mitigado: o projeto já usa apenas tipos e `import type`);
- empacotamento e distribuição da CLII (binário publicável) permanecem decisão futura, tratada quando uma SPEC de distribuição chegar.

---

# Alternativas Consideradas

**tsx como devDependency.** Robusto para qualquer feature TS, porém introduz a primeira dependência de tooling de execução do projeto sem necessidade atual.

**Build para `dist/` com `tsc`.** Reverte o padrão sem-`dist` que funcionou bem; adiciona cerimônia e um loop mais lento.
```

- [ ] **Step 2: Registrar o ADR-0006**

`docs/06-adr/ADR-0006-config-source-precedence.md`:

```markdown
# ADR-0006 — Precedência de fontes de configuração

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-11

---

# Contexto

A configuração do Atlas pode vir de múltiplas fontes: valores padrão, arquivo de configuração, variáveis de ambiente e flags de linha de comando. A SPEC-0002 estabeleceu os `defaults` no core e a validação em `loadConfig`, mas adiou deliberadamente a decisão de precedência entre fontes para a SPEC-0003, quando a primeira interface (CLI) passaria a lê-las.

---

# Decisão

A ordem de precedência (da maior para a menor) é:

```text
flags  >  env  >  arquivo  >  defaults
```

- `defaults` residem no core (`loadConfig`).
- `flags` e `env` são resolvidos no Input Gateway da aplicação (`apps/*`) e passados como um único `override` (`Partial<AtlasConfig>`) a `createAtlas({ config })`.
- `arquivo` fica reservado: será implementado em SPEC futura, encaixando-se entre `env` e `defaults` sem alterar a ordem.
- A validação permanece exclusivamente no core: as aplicações repassam valores crus; `loadConfig` é a única fonte de verdade da validação.

Nesta SPEC, `flags` e `env` são implementados; `arquivo` não.

---

# Consequências

Positivas:

- precedência previsível e testável (flag sobrepõe env sobrepõe default);
- a resolução de entrada vive nas aplicações (Input Gateway), sem acoplar o core a `argv`/`env` — Princípio 13 e testabilidade;
- o slot de `arquivo` é conhecido de antemão, evitando retrabalho de ordem.

Custos e riscos:

- os nomes das variáveis de ambiente (`ATLAS_LOG_LEVEL`, `ATLAS_DATA_DIR`) tornam-se uma interface pública informal da CLI, a ser documentada.

---

# Alternativas Consideradas

**Somente `flags > defaults`.** Subentrega o item explicitamente atribuído à SPEC-0003 e não exercita a estratificação real de precedência.

**Resolver todas as fontes no core.** Acoplaria o core a `process`/`argv`/`env`, violando o limite de que o core não lê entrada — responsabilidade do Input Gateway.
```

- [ ] **Step 3: Atualizar o `CLAUDE.md` da raiz (estado do projeto + item criado)**

No `CLAUDE.md` da raiz, atualizar o parágrafo de estado para refletir que `apps/cli` existe (o `atlas status` sobe o core pelo terminal) e remover `apps/cli` da seção "Referenciado na documentação, mas ainda não criado" (mantendo os demais itens da lista). Ajustar o texto de estado para apontar a SPEC seguinte como próximo trabalho.

Trecho de estado (substituir o parágrafo `**Estado em julho/2026...**`):

```markdown
**Estado em julho/2026: primeira interface executável (SPEC-0003).** Além de `@atlas/contracts` e `@atlas/core`, existe `apps/cli` (`@atlas/cli`): `atlas status` sobe a plataforma pelo terminal, mostra estado e config resolvida (precedência `flags > env > defaults`) e desliga com segurança. `atlas --help`/`--version` também existem.
```

Na seção "Referenciado na documentação, mas ainda não criado", remover a linha do `apps/cli` (a CLI passou a existir), preservando o restante:

```markdown
- Roadmap
- demais packages do catálogo conforme SPECs futuras
```

- [ ] **Step 4: Repetir o probe do TypeScript 7 (encaminhamento herdado)**

Run: `pnpm add -Dw typescript@^7 && pnpm lint`
Expected: se o typescript-eslint aceitar o TS 7 sem erro, manter e remover a nota de pin do `CLAUDE.md`; **se falhar**, reverter com `pnpm add -Dw typescript@^5` e registrar o resultado nas lições.

- [ ] **Step 5: Rodar a suíte completa**

Run: `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: tudo verde — lint sem erros, formatação ok, typecheck cobrindo raiz + `packages/*` + `apps/cli`, e todos os testes (packages + apps/cli) passando.

- [ ] **Step 6: Commit**

```bash
git add docs/06-adr/ADR-0005-app-typescript-execution.md docs/06-adr/ADR-0006-config-source-precedence.md CLAUDE.md
git commit -m "docs: registra ADR-0005/0006 e atualiza estado do projeto" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Conclusão da SPEC (após as 5 tasks)

Fora do escopo das tasks de código, para fechar a Definition of Done (feito na sessão, não por subagente):

- registrar as lições em `implementation/LESSONS_LEARNED.md` (obrigatório — inclui o resultado do probe do TS 7 e se o type stripping do `bin` funcionou);
- mover a SPEC-0003 para `Status: Review`;
- atualizar `docs/05-context/CURRENT_SPRINT.md` e `docs/05-context/NEXT_CONTEXT.md`;
- apresentar ao usuário para aprovação → `Done`.
