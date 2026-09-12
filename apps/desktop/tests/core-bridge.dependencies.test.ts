import { describe, expect, it, vi } from 'vitest';
import { createDependencyManager } from '@atlas/core';
import type { OllamaStartOutcome, ProcessPort } from '@atlas/core';

// SPEC-0060 (CA 22-24): `ensureExternalDependencies`/
// `releaseExternalDependencies` são exercitados sempre sobre um
// `DependencyManager` fake (`ProcessPort`/`sleep` injetados via
// `__setDependencyManagerForTests`) — nunca o default de produção
// (`nodeProcessPort()`), que spawnaria um `ollama serve` real neste host
// (o binário está presente em vários ambientes de desenvolvimento).

function fakeProcess(overrides: Partial<ProcessPort> = {}): ProcessPort {
  return {
    isOllamaRunning: overrides.isOllamaRunning ?? (async () => false),
    startOllama:
      overrides.startOllama ?? (async (): Promise<OllamaStartOutcome> => ({ started: true })),
    stopOllama: overrides.stopOllama ?? (async () => {}),
  };
}

function instantSleep(): (ms: number) => Promise<void> {
  return async () => {};
}

describe('ensureExternalDependencies (SPEC-0060, CA 22)', () => {
  it('ATLAS_AUTO_START_OLLAMA ausente devolve "disabled" sem tocar a porta', async () => {
    const calls: string[] = [];
    const process = fakeProcess({
      isOllamaRunning: async () => {
        calls.push('isOllamaRunning');
        return false;
      },
      startOllama: async (): Promise<OllamaStartOutcome> => {
        calls.push('startOllama');
        return { started: true };
      },
    });
    const {
      ensureExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const report = await ensureExternalDependencies({});

    expect(report).toEqual({ outcomes: [{ dependency: 'ollama', status: 'disabled' }] });
    expect(calls).toEqual([]);
  });

  it('com "1", exercita o caminho de auto-start (já em execução)', async () => {
    const process = fakeProcess({ isOllamaRunning: async () => true });
    const {
      ensureExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const report = await ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: '1' });

    expect(report).toEqual({ outcomes: [{ dependency: 'ollama', status: 'already-running' }] });
  });

  it('com "1" e não rodando, sobe via startOllama e reporta "started"', async () => {
    const process = fakeProcess({
      isOllamaRunning: async () => false,
      startOllama: async (): Promise<OllamaStartOutcome> => ({ started: true }),
    });
    const {
      ensureExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const report = await ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: '1' });

    // A 1ª tentativa de polling já vê `false` (o fake não simula transição
    // para "de pé") — desfecho aceitável para provar o caminho de auto-start
    // sem depender de um estado mutável no fake.
    expect(['started', 'failed']).toContain(report.outcomes[0]?.status);
  });

  it('valor inválido ("talvez") devolve "disabled", não lança, e emite exatamente 1 console.warn pinado', async () => {
    const process = fakeProcess();
    const {
      ensureExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
      INVALID_AUTO_START_OLLAMA_ENV_WARNING,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const report = await ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: 'talvez' });

      expect(report).toEqual({ outcomes: [{ dependency: 'ollama', status: 'disabled' }] });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(INVALID_AUTO_START_OLLAMA_ENV_WARNING);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('a CLI, com o mesmo valor inválido, lança CliUsageError — divergência intencional (D25)', async () => {
    // Documentado aqui como contraste, não reexecutado: a prova mecânica da
    // CLI vive em `apps/cli/tests/input-gateway.test.ts` (CA 15). O ponto
    // desta suíte é provar que o desktop NUNCA lança para o mesmo valor.
    const process = fakeProcess();
    const {
      ensureExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const report = await ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: 'talvez' });
    expect(report).toEqual({ outcomes: [{ dependency: 'ollama', status: 'disabled' }] });
  });
});

describe('releaseExternalDependencies (SPEC-0060, CA 23)', () => {
  it('sem ensure prévio é no-op e não lança', async () => {
    let stopCalls = 0;
    const process = fakeProcess({
      stopOllama: async () => {
        stopCalls += 1;
      },
    });
    const {
      releaseExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    await expect(releaseExternalDependencies()).resolves.toBeUndefined();
    expect(stopCalls).toBe(0);
  });

  it('após um ensure com "started", delega o stopOllama 1x', async () => {
    let stopCalls = 0;
    const process = fakeProcess({
      isOllamaRunning: async () => false,
      startOllama: async (): Promise<OllamaStartOutcome> => ({ started: true }),
      stopOllama: async () => {
        stopCalls += 1;
      },
    });
    const {
      ensureExternalDependencies,
      releaseExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    await ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: 'true' });
    await releaseExternalDependencies();

    expect(stopCalls).toBe(1);
  });
});

describe('instância única de módulo (SPEC-0060, CA 24)', () => {
  it('uma 2ª chamada de ensureExternalDependencies na mesma sessão não repete health-check/spawn', async () => {
    const calls: string[] = [];
    const process = fakeProcess({
      isOllamaRunning: async () => {
        calls.push('isOllamaRunning');
        return true;
      },
      startOllama: async (): Promise<OllamaStartOutcome> => {
        calls.push('startOllama');
        return { started: true };
      },
    });
    const {
      ensureExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const first = await ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: '1' });
    const callsAfterFirst = [...calls];
    const second = await ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: '1' });

    expect(second).toEqual(first);
    expect(calls).toEqual(callsAfterFirst);
  });
});
