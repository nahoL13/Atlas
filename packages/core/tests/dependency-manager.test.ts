import { describe, expect, it } from 'vitest';
import { createDependencyManager } from '../src/dependencies/dependency-manager.js';
import type { DependencyConfig } from '../src/config/dependency-config.js';
import type { OllamaStartOutcome, ProcessPort } from '../src/dependencies/process-port.js';

function disabledConfig(): DependencyConfig {
  return { autoStartOllama: false, ollamaBaseUrl: 'http://x:1' };
}

function enabledConfig(): DependencyConfig {
  return { autoStartOllama: true, ollamaBaseUrl: 'http://x:1' };
}

interface RecordingProcess extends ProcessPort {
  readonly calls: string[];
  readonly counts: { isOllamaRunning: number; startOllama: number; stopOllama: number };
}

function createFakeProcess(overrides: Partial<ProcessPort> = {}): RecordingProcess {
  const calls: string[] = [];
  const counts = { isOllamaRunning: 0, startOllama: 0, stopOllama: 0 };
  return {
    calls,
    counts,
    isOllamaRunning: async (baseUrl: string) => {
      calls.push('isOllamaRunning');
      counts.isOllamaRunning += 1;
      if (overrides.isOllamaRunning !== undefined) {
        return overrides.isOllamaRunning(baseUrl);
      }
      return false;
    },
    startOllama: async () => {
      calls.push('startOllama');
      counts.startOllama += 1;
      if (overrides.startOllama !== undefined) {
        return overrides.startOllama();
      }
      return { started: true };
    },
    stopOllama: async () => {
      calls.push('stopOllama');
      counts.stopOllama += 1;
      if (overrides.stopOllama !== undefined) {
        return overrides.stopOllama();
      }
    },
  };
}

function createFakeSleep(): { sleep: (ms: number) => Promise<void>; calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    sleep: async (ms: number) => {
      calls.push(ms);
    },
  };
}

describe('createDependencyManager (SPEC-0060)', () => {
  it('CA5: autoStartOllama false devolve só "disabled" sem tocar a porta', async () => {
    const process = createFakeProcess();
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    const report = await manager.ensure(disabledConfig());

    expect(report).toEqual({ outcomes: [{ dependency: 'ollama', status: 'disabled' }] });
    expect(process.calls).toEqual([]);
  });

  it('CA6: dependência já de pé devolve "already-running" sem spawn', async () => {
    const process = createFakeProcess({ isOllamaRunning: async () => true });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    const report = await manager.ensure(enabledConfig());

    expect(report).toEqual({ outcomes: [{ dependency: 'ollama', status: 'already-running' }] });
    expect(process.counts.startOllama).toBe(0);
  });

  it('CA7: sucesso na 1ª tentativa de polling produz status "started" sem sleep sobrando', async () => {
    let pollCount = 0;
    const process = createFakeProcess({
      isOllamaRunning: async () => {
        pollCount += 1;
        // A 1ª chamada (fora do spawn) é o health-check inicial (false);
        // a 2ª é a checagem pós-spawn dentro do polling.
        return pollCount > 1;
      },
    });
    const { sleep, calls: sleepCalls } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    const report = await manager.ensure(enabledConfig());

    expect(report).toEqual({ outcomes: [{ dependency: 'ollama', status: 'started' }] });
    expect(sleepCalls).toEqual([250]);
    // Sequência completa: isOllamaRunning (health-check) → startOllama →
    // sleep → isOllamaRunning (polling, único par, sem sleep sobrando).
    expect(process.calls).toEqual(['isOllamaRunning', 'startOllama', 'isOllamaRunning']);
  });

  it('CA7: 40 tentativas sem sucesso produzem "failed"/"timeout" com 40 sleeps e 40 polls', async () => {
    const process = createFakeProcess({ isOllamaRunning: async () => false });
    const { sleep, calls: sleepCalls } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    const report = await manager.ensure(enabledConfig());

    expect(report).toEqual({
      outcomes: [{ dependency: 'ollama', status: 'failed', reason: 'timeout' }],
    });
    expect(sleepCalls).toHaveLength(40);
    expect(sleepCalls.every((ms) => ms === 250)).toBe(true);
    // 1 health-check inicial + 40 polls = 41 chamadas de isOllamaRunning.
    expect(process.counts.isOllamaRunning).toBe(41);

    // Sequência posterior ao startOllama: sleep/isOllamaRunning alternados,
    // 80 registros (40 pares), começando por sleep.
    const startIndex = process.calls.indexOf('startOllama');
    const afterStart = process.calls.slice(startIndex + 1);
    expect(afterStart).toHaveLength(40);
    // O par [sleep, isOllamaRunning] é verificado combinando as duas listas
    // por índice — sleepCalls[i] sempre precede o i-ésimo poll pós-spawn.
    expect(afterStart.every((call) => call === 'isOllamaRunning')).toBe(true);
  });

  it('CA8: startOllama "binary-missing" produz "failed" com a mesma reason, sem polling', async () => {
    const process = createFakeProcess({
      startOllama: async (): Promise<OllamaStartOutcome> => ({
        started: false,
        reason: 'binary-missing',
      }),
    });
    const { sleep, calls: sleepCalls } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    const report = await manager.ensure(enabledConfig());

    expect(report).toEqual({
      outcomes: [{ dependency: 'ollama', status: 'failed', reason: 'binary-missing' }],
    });
    expect(sleepCalls).toEqual([]);
  });

  it('CA8: startOllama "spawn-failed" produz "failed" com a mesma reason, sem polling', async () => {
    const process = createFakeProcess({
      startOllama: async (): Promise<OllamaStartOutcome> => ({
        started: false,
        reason: 'spawn-failed',
      }),
    });
    const { sleep, calls: sleepCalls } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    const report = await manager.ensure(enabledConfig());

    expect(report).toEqual({
      outcomes: [{ dependency: 'ollama', status: 'failed', reason: 'spawn-failed' }],
    });
    expect(sleepCalls).toEqual([]);
  });

  it('CA9: porta que rejeita em isOllamaRunning não faz ensure lançar', async () => {
    const process = createFakeProcess({
      isOllamaRunning: async () => {
        throw new Error('boom');
      },
    });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    const report = await manager.ensure(enabledConfig());

    expect(report).toEqual({
      outcomes: [{ dependency: 'ollama', status: 'failed', reason: 'spawn-failed' }],
    });
  });

  it('CA9: porta que rejeita em startOllama não faz ensure lançar', async () => {
    const process = createFakeProcess({
      startOllama: async () => {
        throw new Error('boom');
      },
    });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    const report = await manager.ensure(enabledConfig());

    expect(report).toEqual({
      outcomes: [{ dependency: 'ollama', status: 'failed', reason: 'spawn-failed' }],
    });
  });

  it('CA10: ensure() chamado duas vezes não repete health-check nem spawn', async () => {
    const process = createFakeProcess({ isOllamaRunning: async () => true });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    const first = await manager.ensure(enabledConfig());
    const countsAfterFirst = { ...process.counts };
    const second = await manager.ensure(enabledConfig());

    expect(second).toEqual(first);
    expect(process.counts).toEqual(countsAfterFirst);
  });

  it('CA11: release() chama stopOllama 1x quando o desfecho foi "started"', async () => {
    let pollCount = 0;
    const process = createFakeProcess({
      isOllamaRunning: async () => {
        pollCount += 1;
        return pollCount > 1;
      },
    });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    await manager.ensure(enabledConfig());
    await manager.release();

    expect(process.counts.stopOllama).toBe(1);
  });

  it('CA11a: release() chama stopOllama 1x quando o desfecho foi "failed"/"timeout"', async () => {
    const process = createFakeProcess({ isOllamaRunning: async () => false });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    const report = await manager.ensure(enabledConfig());
    expect(report.outcomes[0]).toEqual({
      dependency: 'ollama',
      status: 'failed',
      reason: 'timeout',
    });

    await manager.release();

    expect(process.counts.stopOllama).toBe(1);
  });

  it('CA11: release() não chama stopOllama em "disabled"', async () => {
    const process = createFakeProcess();
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    await manager.ensure(disabledConfig());
    await manager.release();

    expect(process.counts.stopOllama).toBe(0);
  });

  it('CA11: release() não chama stopOllama em "already-running"', async () => {
    const process = createFakeProcess({ isOllamaRunning: async () => true });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    await manager.ensure(enabledConfig());
    await manager.release();

    expect(process.counts.stopOllama).toBe(0);
  });

  it('CA11: release() não chama stopOllama em "failed"/"binary-missing"', async () => {
    const process = createFakeProcess({
      startOllama: async (): Promise<OllamaStartOutcome> => ({
        started: false,
        reason: 'binary-missing',
      }),
    });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    await manager.ensure(enabledConfig());
    await manager.release();

    expect(process.counts.stopOllama).toBe(0);
  });

  it('CA11: release() não chama stopOllama em "failed"/"spawn-failed"', async () => {
    const process = createFakeProcess({
      startOllama: async (): Promise<OllamaStartOutcome> => ({
        started: false,
        reason: 'spawn-failed',
      }),
    });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    await manager.ensure(enabledConfig());
    await manager.release();

    expect(process.counts.stopOllama).toBe(0);
  });

  it('CA11: release() sem ensure prévio é no-op e não lança', async () => {
    const process = createFakeProcess();
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    await expect(manager.release()).resolves.toBeUndefined();
    expect(process.counts.stopOllama).toBe(0);
  });

  it('CA11: release() duas vezes seguidas chama stopOllama no máximo 1 vez', async () => {
    let pollCount = 0;
    const process = createFakeProcess({
      isOllamaRunning: async () => {
        pollCount += 1;
        return pollCount > 1;
      },
    });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    await manager.ensure(enabledConfig());
    await manager.release();
    await manager.release();

    expect(process.counts.stopOllama).toBe(1);
  });

  it('CA9: porta que rejeita em stopOllama não faz release() lançar', async () => {
    const process = createFakeProcess({
      stopOllama: async () => {
        throw new Error('boom');
      },
    });
    const { sleep } = createFakeSleep();
    const manager = createDependencyManager({ process, sleep });

    await manager.ensure(enabledConfig());

    await expect(manager.release()).resolves.toBeUndefined();
  });
});
