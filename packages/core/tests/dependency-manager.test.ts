import { describe, expect, it } from 'vitest';
import { createDependencyManager } from '../src/dependencies/dependency-manager.js';
import type { DependencyConfig } from '../src/config/dependency-config.js';
import type {
  OllamaStartOutcome,
  ProcessPort,
  SearchContainerStartOutcome,
  SearchContainerState,
} from '../src/dependencies/process-port.js';

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
    isOllamaRunning: number;
    startOllama: number;
    stopOllama: number;
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
    isOllamaRunning: 0,
    startOllama: 0,
    stopOllama: 0,
    inspectSearchContainer: 0,
    startSearchContainer: 0,
    stopSearchContainer: 0,
  };
  return {
    counts,
    isOllamaRunning: async (baseUrl: string) => {
      recorder.calls.push('isOllamaRunning');
      counts.isOllamaRunning += 1;
      return overrides.isOllamaRunning !== undefined ? overrides.isOllamaRunning(baseUrl) : false;
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
    expect(process.counts.isOllamaRunning).toBe(0);
    expect(process.counts.startOllama).toBe(0);
  });

  it('dependência já de pé devolve "already-running" sem spawn', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, { isOllamaRunning: async () => true });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());

    expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'already-running' });
    expect(process.counts.startOllama).toBe(0);
  });

  it('sucesso na 1ª tentativa de polling produz status "started" sem sleep sobrando', async () => {
    const recorder = createRecorder();
    let pollCount = 0;
    const process = createFakeProcess(recorder, {
      isOllamaRunning: async () => {
        pollCount += 1;
        return pollCount > 1;
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());

    expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'started' });
    expect(recorder.calls.filter((c) => c === 'sleep')).toEqual(['sleep']);
    expect(process.counts.isOllamaRunning).toBe(2);
  });

  it('40 tentativas sem sucesso produzem "failed"/"timeout" com 40 sleeps e 40 polls', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, { isOllamaRunning: async () => false });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    const report = await manager.ensure(enabledOllamaConfig());

    expect(report.outcomes[0]).toEqual({
      dependency: 'ollama',
      status: 'failed',
      reason: 'timeout',
    });
    expect(recorder.calls.filter((c) => c === 'sleep')).toHaveLength(40);
    expect(process.counts.isOllamaRunning).toBe(41);
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

  it('porta que rejeita em isOllamaRunning não faz ensure lançar', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, {
      isOllamaRunning: async () => {
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
    const process = createFakeProcess(recorder, { isOllamaRunning: async () => true });
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
      isOllamaRunning: async () => {
        pollCount += 1;
        return pollCount > 1;
      },
    });
    const manager = createDependencyManager({ process, sleep: recorder.sleep });

    await manager.ensure(enabledOllamaConfig());
    await manager.release();

    expect(process.counts.stopOllama).toBe(1);
  });

  it('release() chama stopOllama 1x quando o desfecho foi "failed"/"timeout"', async () => {
    const recorder = createRecorder();
    const process = createFakeProcess(recorder, { isOllamaRunning: async () => false });
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
      isOllamaRunning: async () => {
        pollCount += 1;
        return pollCount > 1;
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
      const process = createFakeProcess(recorder, { isOllamaRunning: async () => true });
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
        isOllamaRunning: async () => true,
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
        isOllamaRunning: async () => true,
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
        isOllamaRunning: async () => true,
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
        { isOllamaRunning: async () => false },
        { dependency: 'ollama' as const, status: 'failed' as const, reason: 'timeout' as const },
      ],
      [
        'porta rejeita',
        {
          isOllamaRunning: async () => {
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
      isOllamaRunning: async () => {
        ollamaPoll += 1;
        return ollamaPoll > 1;
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
      isOllamaRunning: async () => {
        ollamaPoll += 1;
        return ollamaPoll > 1;
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
      isOllamaRunning: async () => true,
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
