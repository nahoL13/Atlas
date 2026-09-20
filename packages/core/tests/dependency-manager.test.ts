import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createDependencyManager } from '../src/dependencies/dependency-manager.js';
import type { DependencyConfig } from '../src/config/dependency-config.js';
import type {
  ModelPullRequest,
  OllamaInspection,
  OllamaStartOutcome,
  ProcessPort,
  SearchContainerStartOutcome,
  SearchContainerState,
} from '../src/dependencies/process-port.js';
import type { ModelPullOutcome } from '../src/dependencies/dependency-manager.js';

const CONTAINER_NAME = 'searxng';

function disabledConfig(): DependencyConfig {
  return { autoStartOllama: false, ollamaBaseUrl: 'http://x:1', autoStartSearchContainer: '' };
}

function enabledOllamaConfig(): DependencyConfig {
  return { autoStartOllama: true, ollamaBaseUrl: 'http://x:1', autoStartSearchContainer: '' };
}

function enabledContainerConfig(): DependencyConfig {
  return {
    autoStartOllama: false,
    ollamaBaseUrl: 'http://x:1',
    autoStartSearchContainer: CONTAINER_NAME,
  };
}

function bothEnabledConfig(): DependencyConfig {
  return {
    autoStartOllama: true,
    ollamaBaseUrl: 'http://x:1',
    autoStartSearchContainer: CONTAINER_NAME,
  };
}

interface Recorder {
  readonly calls: string[];
  readonly sleep: (ms: number) => Promise<void>;
}

function createRecorder(): Recorder {
  const calls: string[] = [];
  return {
    calls,
    sleep: async () => {
      calls.push('sleep');
    },
  };
}

interface RecordingProcess extends ProcessPort {
  readonly counts: {
    inspectOllama: number;
    startOllama: number;
    stopOllama: number;
    pullOllamaModel: number;
    inspectSearchContainer: number;
    startSearchContainer: number;
    stopSearchContainer: number;
  };
}

function createFakeProcess(
  recorder: Recorder,
  overrides: Partial<ProcessPort> = {},
): RecordingProcess {
  const counts = {
    inspectOllama: 0,
    startOllama: 0,
    stopOllama: 0,
    pullOllamaModel: 0,
    inspectSearchContainer: 0,
    startSearchContainer: 0,
    stopSearchContainer: 0,
  };
  return {
    counts,
    inspectOllama: async (baseUrl: string) => {
      recorder.calls.push('inspectOllama');
      counts.inspectOllama += 1;
      return overrides.inspectOllama !== undefined
        ? overrides.inspectOllama(baseUrl)
        : { running: false };
    },
    pullOllamaModel: async (request: ModelPullRequest) => {
      recorder.calls.push('pullOllamaModel');
      counts.pullOllamaModel += 1;
      return overrides.pullOllamaModel !== undefined
        ? overrides.pullOllamaModel(request)
        : ({ status: 'installed', model: request.model } as ModelPullOutcome);
    },
    startOllama: async () => {
      recorder.calls.push('startOllama');
      counts.startOllama += 1;
      return overrides.startOllama !== undefined
        ? overrides.startOllama()
        : ({ started: true } as OllamaStartOutcome);
    },
    stopOllama: async () => {
      recorder.calls.push('stopOllama');
      counts.stopOllama += 1;
      if (overrides.stopOllama !== undefined) {
        return overrides.stopOllama();
      }
    },
    inspectSearchContainer: async (containerName: string) => {
      recorder.calls.push('inspectSearchContainer');
      counts.inspectSearchContainer += 1;
      return overrides.inspectSearchContainer !== undefined
        ? overrides.inspectSearchContainer(containerName)
        : ('stopped' as SearchContainerState);
    },
    startSearchContainer: async (containerName: string) => {
      recorder.calls.push('startSearchContainer');
      counts.startSearchContainer += 1;
      return overrides.startSearchContainer !== undefined
        ? overrides.startSearchContainer(containerName)
        : ({ started: true } as SearchContainerStartOutcome);
    },
    stopSearchContainer: async (containerName: string) => {
      recorder.calls.push('stopSearchContainer');
      counts.stopSearchContainer += 1;
      if (overrides.stopSearchContainer !== undefined) {
        return overrides.stopSearchContainer(containerName);
      }
    },
  };
}

describe('createDependencyManager — Ollama (SPEC-0060, não-regressão da Restrição 11)', () => {
  it('CA6/CA7: autoStartOllama false devolve "disabled" para ollama e "disabled" para o container (opt-in duplo desligado)', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder);
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(disabledConfig());

    expect(report.outcomes).toEqual([
      { dependency: 'ollama', status: 'disabled' },
      { dependency: 'search-container', status: 'disabled' },
    ]);
    expect(process.counts.inspectOllama).toBe(0);
    expect(process.counts.startOllama).toBe(0);
  });

  it('dependência já de pé devolve "already-running" sem spawn', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => ({ running: true, models: undefined }),
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());

    expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'already-running' });
    expect(process.counts.startOllama).toBe(0);
  });

  it('sucesso na 1ª tentativa de polling produz status "started" sem sleep sobrando', async () => {
    const recorder = createRecorder();
    let pollCount = 0;
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => {
        pollCount += 1;
        return pollCount > 1 ? { running: true, models: undefined } : { running: false };
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());

    expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'started' });
    expect(recorder.calls.filter((c) => c === 'sleep')).toEqual(['sleep']);
    expect(process.counts.inspectOllama).toBe(2);
  });

  it('40 tentativas sem sucesso produzem "failed"/"timeout" com 40 sleeps e 40 polls', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => ({ running: false }),
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());

    expect(report.outcomes[0]).toEqual({
      dependency: 'ollama',
      status: 'failed',
      reason: 'timeout',
    });
    expect(recorder.calls.filter((c) => c === 'sleep')).toHaveLength(40);
    expect(process.counts.inspectOllama).toBe(41);
  });

  it('startOllama "binary-missing" produz "failed" com a mesma reason, sem polling', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      startOllama: async (): Promise<OllamaStartOutcome> => ({
        started: false,
        reason: 'binary-missing',
      }),
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());

    expect(report.outcomes[0]).toEqual({
      dependency: 'ollama',
      status: 'failed',
      reason: 'binary-missing',
    });
    expect(recorder.calls.filter((c) => c === 'sleep')).toEqual([]);
  });

  it('porta que rejeita em inspectOllama não faz ensure lançar', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => {
        throw new Error('boom');
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());

    expect(report.outcomes[0]).toEqual({
      dependency: 'ollama',
      status: 'failed',
      reason: 'spawn-failed',
    });
  });

  it('ensure() chamado duas vezes não repete health-check nem spawn', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => ({ running: true, models: undefined }),
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const first = await manager.ensure(enabledOllamaConfig());
    const countsAfterFirst = { ...process.counts };
    const second = await manager.ensure(enabledOllamaConfig());

    expect(second).toEqual(first);
    expect(process.counts).toEqual(countsAfterFirst);
  });

  it('release() chama stopOllama 1x quando o desfecho foi "started"', async () => {
    const recorder = createRecorder();
    let pollCount = 0;
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => {
        pollCount += 1;
        return pollCount > 1 ? { running: true, models: undefined } : { running: false };
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensure(enabledOllamaConfig());
    await manager.release();

    expect(process.counts.stopOllama).toBe(1);
  });

  it('release() chama stopOllama 1x quando o desfecho foi "failed"/"timeout"', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => ({ running: false }),
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());
    expect(report.outcomes[0]).toEqual({
      dependency: 'ollama',
      status: 'failed',
      reason: 'timeout',
    });

    await manager.release();

    expect(process.counts.stopOllama).toBe(1);
  });

  it('release() não chama stopOllama em "disabled"', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder);
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensure(disabledConfig());
    await manager.release();

    expect(process.counts.stopOllama).toBe(0);
  });

  it('release() sem ensure prévio é no-op e não lança', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder);
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await expect(manager.release()).resolves.toBeUndefined();
    expect(process.counts.stopOllama).toBe(0);
  });

  it('release() duas vezes seguidas chama stopOllama no máximo 1 vez', async () => {
    const recorder = createRecorder();
    let pollCount = 0;
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => {
        pollCount += 1;
        return pollCount > 1 ? { running: true, models: undefined } : { running: false };
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensure(enabledOllamaConfig());
    await manager.release();
    await manager.release();

    expect(process.counts.stopOllama).toBe(1);
  });

  it('porta que rejeita em stopOllama não faz release() lançar', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      stopOllama: async () => {
        throw new Error('boom');
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensure(enabledOllamaConfig());

    await expect(manager.release()).resolves.toBeUndefined();
  });
});

describe('createDependencyManager — models no desfecho do Ollama (SPEC-0063, CAs 5-8)', () => {
  it('CA5: DependencyReport sai sem campo novo (só "outcomes"); "disabled" com zero chamadas à porta', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder);
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(disabledConfig());

    expect(Object.keys(report)).toEqual(['outcomes']);
    expect(process.counts.inspectOllama).toBe(0);

    const disabledOutcome = report.outcomes[0];
    expect(disabledOutcome).toEqual({ dependency: 'ollama', status: 'disabled' });
    if (disabledOutcome?.status === 'disabled') {
      // @ts-expect-error — 'models' não existe estruturalmente na variante 'disabled' (CA5).
      void disabledOutcome.models;
    }

    const failedConfig = enabledOllamaConfig();
    const failedProcess = createFakeProcess(recorder, {
      inspectOllama: async () => ({ running: false }),
    });
    const failedManager = createDependencyManager({
      process: failedProcess,
      sleep: recorder.sleep,
    });
    const failedReport = await failedManager.ensure(failedConfig);
    const failedOutcome = failedReport.outcomes[0];
    expect(failedOutcome?.status).toBe('failed');
    if (failedOutcome?.status === 'failed') {
      // @ts-expect-error — 'models' não existe estruturalmente na variante 'failed' (CA5).
      void failedOutcome.models;
    }
  });

  it('CA6: Ollama já de pé com dois modelos devolve already-running + models', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => ({ running: true, models: ['a:latest', 'b:latest'] }),
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());

    expect(report.outcomes[0]).toEqual({
      dependency: 'ollama',
      status: 'already-running',
      models: ['a:latest', 'b:latest'],
    });
  });

  it('CA7: ensure que sobe o Ollama e confirma por polling devolve "started" com models da inspeção que ENCERROU o polling', async () => {
    const recorder = createRecorder();
    let pollCount = 0;
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => {
        pollCount += 1;
        return pollCount > 2 ? { running: true, models: ['final:latest'] } : { running: false };
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());

    expect(report.outcomes[0]).toEqual({
      dependency: 'ollama',
      status: 'started',
      models: ['final:latest'],
    });
  });

  it('CA8: "failed" (qualquer razão, inclusive timeout) sai sem models; corpo ilegível com Ollama de pé sai "already-running" sem a chave', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => ({ running: false }),
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());
    expect(report.outcomes[0]).toEqual({
      dependency: 'ollama',
      status: 'failed',
      reason: 'timeout',
    });
    expect('models' in (report.outcomes[0] as object)).toBe(false);

    const recorder2 = createRecorder();
    const illegibleProcess = createFakeProcess(recorder2, {
      inspectOllama: async () => ({ running: true, models: undefined }),
    });
    const manager2 = createDependencyManager({ process: illegibleProcess, sleep: recorder2.sleep });
    const report2 = await manager2.ensure(enabledOllamaConfig());
    expect(report2.outcomes[0]).toEqual({ dependency: 'ollama', status: 'already-running' });
    expect('models' in (report2.outcomes[0] as object)).toBe(false);
  });
});

describe('createDependencyManager — container de busca (SPEC-0061)', () => {
  it('CA7: outcomes sempre com dois elementos, ordem pinada, em todas as combinações de opt-in', async () => {
    const combos: ReadonlyArray<readonly [boolean, string]> = [
      [false, ''],
      [false, CONTAINER_NAME],
      [true, ''],
      [true, CONTAINER_NAME],
    ];

    for (const [autoStartOllama, autoStartSearchContainer] of combos) {
      const recorder = createRecorder();
      const process = createFakeProcess(recorder, {
        inspectOllama: async () => ({ running: true, models: undefined }),
      });
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      const report = await manager.ensure({
        autoStartOllama,
        ollamaBaseUrl: 'http://x:1',
        autoStartSearchContainer,
      });

      expect(report.outcomes).toHaveLength(2);
      expect(report.outcomes[0]?.dependency).toBe('ollama');
      expect(report.outcomes[1]?.dependency).toBe('search-container');
    }
  });

  it('CA8: autoStartSearchContainer vazio produz "disabled" sem tocar a porta', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder);
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(disabledConfig());

    expect(report.outcomes[1]).toEqual({ dependency: 'search-container', status: 'disabled' });
    expect(process.counts.inspectSearchContainer).toBe(0);
    expect(process.counts.startSearchContainer).toBe(0);
    expect(process.counts.stopSearchContainer).toBe(0);
  });

  it('CA9: inspect "running" produz "already-running" com o nome configurado, sem start', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => 'running',
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledContainerConfig());

    expect(report.outcomes[1]).toEqual({
      dependency: 'search-container',
      status: 'already-running',
      container: CONTAINER_NAME,
    });
    expect(process.counts.startSearchContainer).toBe(0);
  });

  it('CA10: inspect "unavailable" produz failed/docker-unavailable, sem start', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => 'unavailable',
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledContainerConfig());

    expect(report.outcomes[1]).toEqual({
      dependency: 'search-container',
      status: 'failed',
      reason: 'docker-unavailable',
      container: CONTAINER_NAME,
    });
    expect(process.counts.startSearchContainer).toBe(0);
  });

  it('CA10: inspect "unknown" produz failed/container-unknown, sem start — nunca cria container', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => 'unknown',
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledContainerConfig());

    expect(report.outcomes[1]).toEqual({
      dependency: 'search-container',
      status: 'failed',
      reason: 'container-unknown',
      container: CONTAINER_NAME,
    });
    expect(process.counts.startSearchContainer).toBe(0);
  });

  it('CA11: stopped + start ok + inspect "running" na 1ª tentativa de polling produz "started", sequência pinada', async () => {
    const recorder = createRecorder();
    let pollCount = 0;
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => {
        pollCount += 1;
        return pollCount === 1 ? 'stopped' : 'running';
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledContainerConfig());

    expect(report.outcomes[1]).toEqual({
      dependency: 'search-container',
      status: 'started',
      container: CONTAINER_NAME,
    });
    const startIndex = recorder.calls.indexOf('startSearchContainer');
    const after = recorder.calls.slice(startIndex + 1);
    expect(after).toEqual(['sleep', 'inspectSearchContainer']);
  });

  it('CA12: stopped + start ok + polling nunca "running" produz failed/timeout após 20 sleeps e 20 inspects', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => 'stopped',
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledContainerConfig());

    expect(report.outcomes[1]).toEqual({
      dependency: 'search-container',
      status: 'failed',
      reason: 'timeout',
      container: CONTAINER_NAME,
    });
    expect(recorder.calls.filter((c) => c === 'sleep')).toHaveLength(20);
    // 1 inspect inicial + 20 polls.
    expect(process.counts.inspectSearchContainer).toBe(21);
    const startIndex = recorder.calls.indexOf('startSearchContainer');
    const after = recorder.calls.slice(startIndex + 1);
    expect(after).toHaveLength(40);
  });

  it('CA13: startSearchContainer com started:false produz failed com a mesma reason, sem polling', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => 'stopped',
      startSearchContainer: async () => ({ started: false, reason: 'start-failed' }),
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledContainerConfig());

    expect(report.outcomes[1]).toEqual({
      dependency: 'search-container',
      status: 'failed',
      reason: 'start-failed',
      container: CONTAINER_NAME,
    });
    expect(recorder.calls.filter((c) => c === 'sleep')).toEqual([]);
  });

  describe('CA14: porta que rejeita em qualquer operação Docker não faz ensure lançar (independência do Ollama)', () => {
    it('rejeição no inspect inicial produz failed/start-failed sem afetar o Ollama', async () => {
      const recorder = createRecorder();
      const process = createFakeProcess(recorder, {
        inspectOllama: async () => ({ running: true, models: undefined }),
        inspectSearchContainer: async () => {
          throw new Error('boom');
        },
      });
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      const report = await manager.ensure(bothEnabledConfig());

      expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'already-running' });
      expect(report.outcomes[1]).toEqual({
        dependency: 'search-container',
        status: 'failed',
        reason: 'start-failed',
        container: CONTAINER_NAME,
      });
    });

    it('rejeição no start produz failed/start-failed sem afetar o Ollama', async () => {
      const recorder = createRecorder();
      const process = createFakeProcess(recorder, {
        inspectOllama: async () => ({ running: true, models: undefined }),
        inspectSearchContainer: async () => 'stopped',
        startSearchContainer: async () => {
          throw new Error('boom');
        },
      });
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      const report = await manager.ensure(bothEnabledConfig());

      expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'already-running' });
      expect(report.outcomes[1]).toEqual({
        dependency: 'search-container',
        status: 'failed',
        reason: 'start-failed',
        container: CONTAINER_NAME,
      });
    });

    it('rejeição no inspect durante o polling preserva a posse e não afeta o Ollama', async () => {
      const recorder = createRecorder();
      let calls = 0;
      const process = createFakeProcess(recorder, {
        inspectOllama: async () => ({ running: true, models: undefined }),
        inspectSearchContainer: async () => {
          calls += 1;
          if (calls === 1) {
            return 'stopped';
          }
          throw new Error('boom');
        },
      });
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      const report = await manager.ensure(bothEnabledConfig());

      expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'already-running' });
      expect(report.outcomes[1]).toEqual({
        dependency: 'search-container',
        status: 'failed',
        reason: 'start-failed',
        container: CONTAINER_NAME,
      });

      await manager.release();
      expect(process.counts.stopSearchContainer).toBe(1);
    });
  });

  describe('CA14a: independência simétrica — falha do Ollama não impede o caminho do container', () => {
    it.each([
      [
        'binary-missing',
        {
          startOllama: async (): Promise<OllamaStartOutcome> => ({
            started: false,
            reason: 'binary-missing',
          }),
        },
        {
          dependency: 'ollama' as const,
          status: 'failed' as const,
          reason: 'binary-missing' as const,
        },
      ],
      [
        'spawn-failed',
        {
          startOllama: async (): Promise<OllamaStartOutcome> => ({
            started: false,
            reason: 'spawn-failed',
          }),
        },
        {
          dependency: 'ollama' as const,
          status: 'failed' as const,
          reason: 'spawn-failed' as const,
        },
      ],
      [
        'timeout',
        { inspectOllama: async (): Promise<OllamaInspection> => ({ running: false }) },
        { dependency: 'ollama' as const, status: 'failed' as const, reason: 'timeout' as const },
      ],
      [
        'porta rejeita',
        {
          inspectOllama: async () => {
            throw new Error('boom');
          },
        },
        {
          dependency: 'ollama' as const,
          status: 'failed' as const,
          reason: 'spawn-failed' as const,
        },
      ],
    ])(
      '%s: outcomes com dois elementos, container "started"',
      async (_label, overrides, expectedOllama) => {
        const recorder = createRecorder();
        let pollCount = 0;
        const process = createFakeProcess(recorder, {
          inspectSearchContainer: async () => {
            pollCount += 1;
            return pollCount === 1 ? 'stopped' : 'running';
          },
          ...overrides,
        });
        const manager = createDependencyManager({ process, sleep: recorder.sleep });

        const report = await manager.ensure(bothEnabledConfig());

        expect(report.outcomes).toHaveLength(2);
        expect(report.outcomes[0]).toEqual(expectedOllama);
        expect(report.outcomes[1]).toEqual({
          dependency: 'search-container',
          status: 'started',
          container: CONTAINER_NAME,
        });
        expect(process.counts.inspectSearchContainer).toBeGreaterThan(0);
        expect(process.counts.startSearchContainer).toBe(1);
      },
    );
  });

  describe('CA15: release() e posse do container', () => {
    it('release() chama stopSearchContainer 1x quando o desfecho foi "started"', async () => {
      const recorder = createRecorder();
      let pollCount = 0;
      const process = createFakeProcess(recorder, {
        inspectSearchContainer: async () => {
          pollCount += 1;
          return pollCount === 1 ? 'stopped' : 'running';
        },
      });
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      await manager.ensure(enabledContainerConfig());
      await manager.release();

      expect(process.counts.stopSearchContainer).toBe(1);
    });

    it('release() chama stopSearchContainer 1x quando o desfecho foi "failed"/"timeout"', async () => {
      const recorder = createRecorder();
      const process = createFakeProcess(recorder, {
        inspectSearchContainer: async () => 'stopped',
      });
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      const report = await manager.ensure(enabledContainerConfig());
      expect(report.outcomes[1]).toMatchObject({ status: 'failed', reason: 'timeout' });

      await manager.release();

      expect(process.counts.stopSearchContainer).toBe(1);
    });

    it('release() não chama stopSearchContainer em "disabled"', async () => {
      const recorder = createRecorder();
      const process = createFakeProcess(recorder);
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      await manager.ensure(disabledConfig());
      await manager.release();

      expect(process.counts.stopSearchContainer).toBe(0);
    });

    it('release() não chama stopSearchContainer em "already-running"', async () => {
      const recorder = createRecorder();
      const process = createFakeProcess(recorder, {
        inspectSearchContainer: async () => 'running',
      });
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      await manager.ensure(enabledContainerConfig());
      await manager.release();

      expect(process.counts.stopSearchContainer).toBe(0);
    });

    it('release() não chama stopSearchContainer em "failed" sem start (docker-unavailable/container-unknown)', async () => {
      const recorder = createRecorder();
      const process = createFakeProcess(recorder, {
        inspectSearchContainer: async () => 'unavailable',
      });
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      await manager.ensure(enabledContainerConfig());
      await manager.release();

      expect(process.counts.stopSearchContainer).toBe(0);
    });

    it('release() sem ensure prévio é no-op e não lança (também para o container)', async () => {
      const recorder = createRecorder();
      const process = createFakeProcess(recorder);
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      await expect(manager.release()).resolves.toBeUndefined();
      expect(process.counts.stopSearchContainer).toBe(0);
    });

    it('release() duas vezes seguidas chama stopSearchContainer no máximo 1 vez', async () => {
      const recorder = createRecorder();
      let pollCount = 0;
      const process = createFakeProcess(recorder, {
        inspectSearchContainer: async () => {
          pollCount += 1;
          return pollCount === 1 ? 'stopped' : 'running';
        },
      });
      const manager = createDependencyManager({ process, sleep: recorder.sleep });

      await manager.ensure(enabledContainerConfig());
      await manager.release();
      await manager.release();

      expect(process.counts.stopSearchContainer).toBe(1);
    });
  });

  it('CA16: release() com posse das duas dependências chama stopOllama e stopSearchContainer 1x cada; stopOllama rejeitando não impede stopSearchContainer', async () => {
    const recorder = createRecorder();
    let ollamaPoll = 0;
    let containerPoll = 0;
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => {
        ollamaPoll += 1;
        return ollamaPoll > 1 ? { running: true, models: undefined } : { running: false };
      },
      inspectSearchContainer: async () => {
        containerPoll += 1;
        return containerPoll === 1 ? 'stopped' : 'running';
      },
      stopOllama: async () => {
        throw new Error('boom');
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensure(bothEnabledConfig());
    await expect(manager.release()).resolves.toBeUndefined();

    expect(process.counts.stopOllama).toBe(1);
    expect(process.counts.stopSearchContainer).toBe(1);
  });

  it('CA16: stopSearchContainer rejeitando não impede stopOllama; release() não lança', async () => {
    const recorder = createRecorder();
    let ollamaPoll = 0;
    let containerPoll = 0;
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => {
        ollamaPoll += 1;
        return ollamaPoll > 1 ? { running: true, models: undefined } : { running: false };
      },
      inspectSearchContainer: async () => {
        containerPoll += 1;
        return containerPoll === 1 ? 'stopped' : 'running';
      },
      stopSearchContainer: async () => {
        throw new Error('boom');
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensure(bothEnabledConfig());
    await expect(manager.release()).resolves.toBeUndefined();

    expect(process.counts.stopOllama).toBe(1);
    expect(process.counts.stopSearchContainer).toBe(1);
  });

  it('CA17: ensure() chamado duas vezes não repete inspect/start das duas dependências', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectOllama: async () => ({ running: true, models: undefined }),
      inspectSearchContainer: async () => 'running',
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const first = await manager.ensure(bothEnabledConfig());
    const countsAfterFirst = { ...process.counts };
    const second = await manager.ensure(bothEnabledConfig());

    expect(second).toEqual(first);
    expect(process.counts).toEqual(countsAfterFirst);
  });
});

/** Portão de sincronização de teste (SPEC-0062/CA 13.1): permite pausar o
 * manager exatamente num `await sleep(...)` controlado, sem depender de
 * contagem de microtasks. */
function createGate() {
  let resolvers: Array<() => void> = [];
  return {
    wait: (): Promise<void> =>
      new Promise<void>((resolve) => {
        resolvers.push(resolve);
      }),
    open: (): void => {
      const toResolve = resolvers;
      resolvers = [];
      for (const resolve of toResolve) {
        resolve();
      }
    },
    hasWaiters: (): boolean => resolvers.length > 0,
  };
}

async function flushUntil(predicate: () => boolean, maxTicks = 1000): Promise<void> {
  for (let i = 0; i < maxTicks && !predicate(); i += 1) {
    await Promise.resolve();
  }
}

describe('createDependencyManager — ensureSearchContainer sob demanda (SPEC-0062)', () => {
  it('CA1: existe, é chamável com uma string e devolve um DependencyOutcome de search-container; ensure/release mantêm assinatura', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder);
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const outcome = await manager.ensureSearchContainer(CONTAINER_NAME);

    expect(outcome.dependency).toBe('search-container');
    expect(typeof manager.ensure).toBe('function');
    expect(typeof manager.release).toBe('function');
  });

  it('CA2: ensureSearchContainer("") devolve "disabled" sem tocar a porta', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder);
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const outcome = await manager.ensureSearchContainer('');

    expect(outcome).toEqual({ dependency: 'search-container', status: 'disabled' });
    expect(process.counts.inspectSearchContainer).toBe(0);
    expect(process.counts.startSearchContainer).toBe(0);
    expect(process.counts.stopSearchContainer).toBe(0);
  });

  it('CA3: inspect "running" ⇒ "already-running" sem start', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, { inspectSearchContainer: async () => 'running' });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const outcome = await manager.ensureSearchContainer(CONTAINER_NAME);

    expect(outcome).toEqual({
      dependency: 'search-container',
      status: 'already-running',
      container: CONTAINER_NAME,
    });
    expect(process.counts.startSearchContainer).toBe(0);
  });

  it('CA3: "stopped" + start ok + polling "running" ⇒ "started"', async () => {
    const recorder = createRecorder();
    let pollCount = 0;
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => {
        pollCount += 1;
        return pollCount === 1 ? 'stopped' : 'running';
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const outcome = await manager.ensureSearchContainer(CONTAINER_NAME);

    expect(outcome).toEqual({
      dependency: 'search-container',
      status: 'started',
      container: CONTAINER_NAME,
    });
  });

  it('CA3: "unknown" ⇒ failed/container-unknown sem start', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, { inspectSearchContainer: async () => 'unknown' });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const outcome = await manager.ensureSearchContainer(CONTAINER_NAME);

    expect(outcome).toEqual({
      dependency: 'search-container',
      status: 'failed',
      reason: 'container-unknown',
      container: CONTAINER_NAME,
    });
    expect(process.counts.startSearchContainer).toBe(0);
  });

  it('CA3: "unavailable" ⇒ failed/docker-unavailable sem start', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => 'unavailable',
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const outcome = await manager.ensureSearchContainer(CONTAINER_NAME);

    expect(outcome).toEqual({
      dependency: 'search-container',
      status: 'failed',
      reason: 'docker-unavailable',
      container: CONTAINER_NAME,
    });
    expect(process.counts.startSearchContainer).toBe(0);
  });

  it('CA4: porta que rejeita em qualquer operação Docker produz failed/start-failed, nunca lança', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => {
        throw new Error('boom');
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const outcome = await manager.ensureSearchContainer(CONTAINER_NAME);

    expect(outcome).toEqual({
      dependency: 'search-container',
      status: 'failed',
      reason: 'start-failed',
      container: CONTAINER_NAME,
    });
  });

  it('CA5: ensureSearchContainer nunca toca o caminho do Ollama', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => 'running',
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensureSearchContainer(CONTAINER_NAME);

    expect(process.counts.inspectOllama).toBe(0);
    expect(process.counts.startOllama).toBe(0);
    expect(process.counts.stopOllama).toBe(0);
  });

  it('CA6: grep — a sequência inspectSearchContainer → startSearchContainer → polling ocorre uma única vez no arquivo', async () => {
    const source = await readFile(
      new URL('../src/dependencies/dependency-manager.ts', import.meta.url),
      'utf8',
    );
    const matches = source.match(
      /inspectSearchContainer[\s\S]*?startSearchContainer[\s\S]*?pollContainerUntilReady/g,
    );
    expect(matches).toHaveLength(1);
  });

  it('CA7: duas chamadas concorrentes com o mesmo nome compartilham a mesma tentativa', async () => {
    const recorder = createRecorder();
    let pollCount = 0;
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => {
        pollCount += 1;
        return pollCount === 1 ? 'stopped' : 'running';
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const [first, second] = await Promise.all([
      manager.ensureSearchContainer(CONTAINER_NAME),
      manager.ensureSearchContainer(CONTAINER_NAME),
    ]);

    expect(first).toEqual(second);
    expect(process.counts.inspectSearchContainer).toBe(2); // 1 inicial + 1 poll
    expect(process.counts.startSearchContainer).toBe(1);
  });

  it('CA8: após "started"/"already-running", chamada seguinte com o mesmo nome não toca a porta', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, { inspectSearchContainer: async () => 'running' });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const first = await manager.ensureSearchContainer(CONTAINER_NAME);
    const countsAfterFirst = { ...process.counts };
    const second = await manager.ensureSearchContainer(CONTAINER_NAME);

    expect(second).toEqual(first);
    expect(process.counts).toEqual(countsAfterFirst);
  });

  it('CA9: após "failed", chamada seguinte com o mesmo nome tenta de novo', async () => {
    const recorder = createRecorder();
    let attempts = 0;
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => {
        attempts += 1;
        return attempts === 1 ? 'unknown' : 'running';
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const first = await manager.ensureSearchContainer(CONTAINER_NAME);
    expect(first).toMatchObject({ status: 'failed', reason: 'container-unknown' });

    const second = await manager.ensureSearchContainer(CONTAINER_NAME);
    expect(second).toEqual({
      dependency: 'search-container',
      status: 'already-running',
      container: CONTAINER_NAME,
    });
    expect(process.counts.inspectSearchContainer).toBe(2);
  });

  it('CA10: ensure(config) seguido de ensureSearchContainer no mesmo nome não repete inspect/start (desfecho retido)', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, { inspectSearchContainer: async () => 'running' });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledContainerConfig());
    const countsAfterEnsure = { ...process.counts };
    const outcome = await manager.ensureSearchContainer(CONTAINER_NAME);

    expect(outcome).toEqual(report.outcomes[1]);
    expect(process.counts).toEqual(countsAfterEnsure);
  });

  it('CA10: ensureSearchContainer seguido de ensure(config) no mesmo nome não repete inspect/start (ordem inversa, desfecho retido)', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, { inspectSearchContainer: async () => 'running' });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const outcome = await manager.ensureSearchContainer(CONTAINER_NAME);
    const countsAfterGesture = { ...process.counts };
    const report = await manager.ensure(enabledContainerConfig());

    expect(report.outcomes[1]).toEqual(outcome);
    expect(process.counts).toEqual(countsAfterGesture);
  });

  it('CA10: com desfecho "failed", a chamada seguinte por qualquer via inspeciona de novo', async () => {
    const recorder = createRecorder();
    let attempts = 0;
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => {
        attempts += 1;
        return attempts === 1 ? 'unknown' : 'running';
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const first = await manager.ensure(enabledContainerConfig());
    expect(first.outcomes[1]).toMatchObject({ status: 'failed', reason: 'container-unknown' });

    const second = await manager.ensureSearchContainer(CONTAINER_NAME);
    expect(second).toEqual({
      dependency: 'search-container',
      status: 'already-running',
      container: CONTAINER_NAME,
    });
    expect(process.counts.inspectSearchContainer).toBe(2);
  });

  it('CA11: release() derruba TODOS os containers que esta instância ligou, ordem de inserção, captura própria', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => 'stopped',
      stopSearchContainer: async (name: string) => {
        if (name === 'a') {
          throw new Error('boom');
        }
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensure({
      autoStartOllama: false,
      ollamaBaseUrl: 'http://x:1',
      autoStartSearchContainer: 'a',
    });
    await manager.ensureSearchContainer('b');

    await expect(manager.release()).resolves.toBeUndefined();

    const stopOrder = recorder.calls.filter((c) => c === 'stopSearchContainer');
    expect(stopOrder).toHaveLength(2);
    expect(process.counts.stopSearchContainer).toBe(2);
  });

  it('CA12: release() não derruba container sem posse ("disabled"/"already-running"/"failed" sem start) e é no-op sem ensure prévio; 2x não repete stop', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, { inspectSearchContainer: async () => 'running' });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensureSearchContainer(CONTAINER_NAME);
    await manager.release();
    await manager.release();

    expect(process.counts.stopSearchContainer).toBe(0);
  });

  it('CA13: ligar "a" e depois "b" não chama stopSearchContainer("a") antes do release()', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, { inspectSearchContainer: async () => 'stopped' });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensureSearchContainer('a');
    expect(process.counts.stopSearchContainer).toBe(0);
    await manager.ensureSearchContainer('b');
    expect(process.counts.stopSearchContainer).toBe(0);

    await manager.release();
    expect(process.counts.stopSearchContainer).toBe(2);
  });

  it('CA13.1: release() drena um ensureSearchContainer em voo antes de decidir a posse — container nunca fica órfão', async () => {
    const recorder = createRecorder();
    const sleepGate = createGate();
    let inspectCalls = 0;
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => {
        inspectCalls += 1;
        return inspectCalls === 1 ? 'stopped' : 'running';
      },
    });
    const manager = createDependencyManager({ process, sleep: sleepGate.wait });

    const ensurePromise = manager.ensureSearchContainer('a');
    const releasePromise = manager.release();

    await flushUntil(() => sleepGate.hasWaiters());
    sleepGate.open();

    await ensurePromise;
    await releasePromise;

    expect(process.counts.stopSearchContainer).toBe(1);
    expect(recorder.calls.filter((c) => c === 'stopSearchContainer')).toEqual([
      'stopSearchContainer',
    ]);
  });

  it('CA13.1: o mesmo vale para um ensure() de bootstrap em voo', async () => {
    const recorder = createRecorder();
    const sleepGate = createGate();
    let inspectCalls = 0;
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => {
        inspectCalls += 1;
        return inspectCalls === 1 ? 'stopped' : 'running';
      },
    });
    const manager = createDependencyManager({ process, sleep: sleepGate.wait });

    const ensurePromise = manager.ensure(enabledContainerConfig());
    const releasePromise = manager.release();

    await flushUntil(() => sleepGate.hasWaiters());
    sleepGate.open();

    await ensurePromise;
    await releasePromise;

    expect(process.counts.stopSearchContainer).toBe(1);
  });

  it('CA13.2: release() com trabalho em voo que assenta em "failed" continua não lançando e é idempotente', async () => {
    const recorder = createRecorder();
    const sleepGate = createGate();
    let inspectCalls = 0;
    const process = createFakeProcess(recorder, {
      inspectSearchContainer: async () => {
        inspectCalls += 1;
        if (inspectCalls === 1) {
          return 'stopped';
        }
        throw new Error('boom durante o polling');
      },
    });
    const manager = createDependencyManager({ process, sleep: sleepGate.wait });

    const ensurePromise = manager.ensureSearchContainer('a');
    const releasePromise = manager.release();

    await flushUntil(() => sleepGate.hasWaiters());
    sleepGate.open();

    const outcome = await ensurePromise;
    expect(outcome).toEqual({
      dependency: 'search-container',
      status: 'failed',
      reason: 'start-failed',
      container: 'a',
    });
    await expect(releasePromise).resolves.toBeUndefined();

    // Posse é preservada mesmo com falha DURANTE o polling (regra herdada),
    // então a drenagem ainda produz um stop; uma 2ª release() não repete nada.
    expect(process.counts.stopSearchContainer).toBe(1);
    await expect(manager.release()).resolves.toBeUndefined();
    expect(process.counts.stopSearchContainer).toBe(1);
  });
});
