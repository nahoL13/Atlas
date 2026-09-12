import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DependencyManager, DependencyReport } from '@atlas/core';
import { createCliInputGateway } from '../src/gateway/input-gateway.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';
import type { LineReader } from '../src/gateway/line-reader.js';
import { run } from '../src/run.js';

// Isola toda invocação que grava/lê memória do arquivo real do desenvolvedor
// (~/.atlas/memory.json) — mesmo padrão de `tmpMemoryPath()` em
// `run.test.ts`.
async function tmpMemoryPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-cli-auto-start-'));
  return join(dir, 'memory.json');
}

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

function scriptedReader(lines: string[]): LineReader {
  let i = 0;
  return {
    next: async () => (i < lines.length ? lines[i++]! : null),
    close: () => {},
  };
}

function createFakeDependencyManager(report: DependencyReport): {
  manager: DependencyManager;
  ensureCalls: () => number;
  releaseCalls: () => number;
} {
  let ensureCalls = 0;
  let releaseCalls = 0;
  const manager: DependencyManager = {
    ensure: async () => {
      ensureCalls += 1;
      return report;
    },
    release: async () => {
      releaseCalls += 1;
    },
  };
  return { manager, ensureCalls: () => ensureCalls, releaseCalls: () => releaseCalls };
}

const DISABLED_REPORT: DependencyReport = {
  outcomes: [{ dependency: 'ollama', status: 'disabled' }],
};
const STARTED_REPORT: DependencyReport = {
  outcomes: [{ dependency: 'ollama', status: 'started' }],
};
const FAILED_BINARY_MISSING_REPORT: DependencyReport = {
  outcomes: [{ dependency: 'ollama', status: 'failed', reason: 'binary-missing' }],
};
const FAILED_TIMEOUT_REPORT: DependencyReport = {
  outcomes: [{ dependency: 'ollama', status: 'failed', reason: 'timeout' }],
};
const ALREADY_RUNNING_REPORT: DependencyReport = {
  outcomes: [{ dependency: 'ollama', status: 'already-running' }],
};

describe('auto-start do Ollama — integração via run() (SPEC-0060)', () => {
  describe('CA16: ensure() é chamado exatamente 1x por invocação de comando de Core', () => {
    it.each([
      ['status', (): string[] => ['status']],
      ['ask', (): string[] => ['ask', 'oi', '--provider', 'fake']],
      ['skills list', (): string[] => ['skills', 'list']],
    ])('%s', async (_label, buildArgv) => {
      const h = harness();
      const fake = createFakeDependencyManager(DISABLED_REPORT);
      await run(buildArgv(), {}, h.gateways, '0.1.0', { dependencies: fake.manager });
      expect(fake.ensureCalls()).toBe(1);
    });

    it.each([
      ['remember', (path: string): string[] => ['remember', 'um fato', '--memory-path', path]],
      ['forget', (path: string): string[] => ['forget', 'id-inexistente', '--memory-path', path]],
      ['memory list', (path: string): string[] => ['memory', 'list', '--memory-path', path]],
    ])('%s (isolado do arquivo real de memória)', async (_label, buildArgv) => {
      const path = await tmpMemoryPath();
      const h = harness();
      const fake = createFakeDependencyManager(DISABLED_REPORT);
      await run(buildArgv(path), {}, h.gateways, '0.1.0', { dependencies: fake.manager });
      expect(fake.ensureCalls()).toBe(1);
    });

    it('chat', async () => {
      const h = harness();
      const fake = createFakeDependencyManager(DISABLED_REPORT);
      await run(['chat', '--provider', 'fake'], {}, h.gateways, '0.1.0', {
        dependencies: fake.manager,
        createLineReader: () => scriptedReader(['/sair']),
      });
      expect(fake.ensureCalls()).toBe(1);
    });

    it.each([
      ['help', ['--help']],
      ['sem argv (help implícito)', []],
      ['version', ['--version']],
      ['persona list', ['persona', 'list']],
    ])('%s não chama ensure()', async (_label, argv) => {
      const h = harness();
      const fake = createFakeDependencyManager(DISABLED_REPORT);
      await run(argv, {}, h.gateways, '0.1.0', { dependencies: fake.manager });
      expect(fake.ensureCalls()).toBe(0);
    });
  });

  it('CA17: run() nunca chama release(), mesmo com desfecho "started"', async () => {
    const h = harness();
    const fake = createFakeDependencyManager(STARTED_REPORT);
    await run(['status'], {}, h.gateways, '0.1.0', { dependencies: fake.manager });
    expect(fake.releaseCalls()).toBe(0);
  });

  it('CA18: um ensure() "failed" não altera o código de saída nem impede o comando de rodar', async () => {
    const h = harness();
    const fake = createFakeDependencyManager(FAILED_TIMEOUT_REPORT);
    const code = await run(['status'], {}, h.gateways, '0.1.0', { dependencies: fake.manager });
    expect(code).toBe(0);
    expect(h.out()).toContain('Atlas: ready');
  });

  describe('CA19: avisos em stderr com os textos pinados de D13', () => {
    it('"started" escreve o aviso pinado em stderr', async () => {
      const h = harness();
      const fake = createFakeDependencyManager(STARTED_REPORT);
      await run(['status'], {}, h.gateways, '0.1.0', { dependencies: fake.manager });
      expect(h.err()).toContain('Ollama iniciado automaticamente pelo Atlas.');
    });

    it('"failed"/"binary-missing" escreve o aviso pinado em stderr', async () => {
      const h = harness();
      const fake = createFakeDependencyManager(FAILED_BINARY_MISSING_REPORT);
      await run(['status'], {}, h.gateways, '0.1.0', { dependencies: fake.manager });
      expect(h.err()).toContain(
        'Não foi possível iniciar o Ollama automaticamente: binário "ollama" não encontrado no PATH.',
      );
    });

    it('"failed"/"timeout" cita o baseUrl e "10s" em stderr', async () => {
      const h = harness();
      const fake = createFakeDependencyManager(FAILED_TIMEOUT_REPORT);
      await run(['status', '--base-url', 'http://x:9'], {}, h.gateways, '0.1.0', {
        dependencies: fake.manager,
      });
      expect(h.err()).toContain('sem resposta em http://x:9 após 10s');
    });

    it('"disabled" não escreve nada, nem em stdout nem em stderr', async () => {
      const h = harness();
      const fake = createFakeDependencyManager(DISABLED_REPORT);
      await run(['status'], {}, h.gateways, '0.1.0', { dependencies: fake.manager });
      expect(h.err()).toBe('');
    });

    it('"already-running" não escreve nada em stderr', async () => {
      const h = harness();
      const fake = createFakeDependencyManager(ALREADY_RUNNING_REPORT);
      await run(['status'], {}, h.gateways, '0.1.0', { dependencies: fake.manager });
      expect(h.err()).toBe('');
    });
  });

  it('CA21: HELP_TEXT cita --auto-start-ollama e ATLAS_AUTO_START_OLLAMA', async () => {
    const h = harness();
    await run(['--help'], {}, h.gateways, '0.1.0');
    expect(h.out()).toContain('--auto-start-ollama');
    expect(h.out()).toContain('ATLAS_AUTO_START_OLLAMA');
  });
});
