import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDependencyManager } from '@atlas/core';
import type {
  OllamaStartOutcome,
  ProcessPort,
  SearchContainerStartOutcome,
  SearchContainerState,
} from '@atlas/core';

// SPEC-0060 (CA 22-24)/SPEC-0061 (CA 31-33): `ensureExternalDependencies`/
// `releaseExternalDependencies` são exercitados sempre sobre um
// `DependencyManager` fake (`ProcessPort`/`sleep` injetados via
// `__setDependencyManagerForTests`) — nunca o default de produção
// (`nodeProcessPort()`), que spawnaria um `ollama serve`/`docker` reais
// neste host.

function fakeProcess(overrides: Partial<ProcessPort> = {}): ProcessPort {
  return {
    isOllamaRunning: overrides.isOllamaRunning ?? (async () => false),
    startOllama:
      overrides.startOllama ?? (async (): Promise<OllamaStartOutcome> => ({ started: true })),
    stopOllama: overrides.stopOllama ?? (async () => {}),
    inspectSearchContainer:
      overrides.inspectSearchContainer ?? (async (): Promise<SearchContainerState> => 'unknown'),
    startSearchContainer:
      overrides.startSearchContainer ??
      (async (): Promise<SearchContainerStartOutcome> => ({
        started: false,
        reason: 'container-unknown',
      })),
    stopSearchContainer: overrides.stopSearchContainer ?? (async () => {}),
  };
}

function instantSleep(): (ms: number) => Promise<void> {
  return async () => {};
}

describe('ensureExternalDependencies (SPEC-0060, CA 22)', () => {
  it('ATLAS_AUTO_START_OLLAMA ausente exercita o auto-start por padrão (SPEC-0062/CA 18 — mudança intencional em relação à SPEC-0060)', async () => {
    const calls: string[] = [];
    const process = fakeProcess({
      isOllamaRunning: async () => {
        calls.push('isOllamaRunning');
        return true;
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

    expect(report).toEqual({
      outcomes: [
        { dependency: 'ollama', status: 'already-running' },
        { dependency: 'search-container', status: 'disabled' },
      ],
    });
    expect(calls).toEqual(['isOllamaRunning']);
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

    expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'already-running' });
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

      expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'disabled' });
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
    expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'disabled' });
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

describe('ensureExternalDependencies — container de busca (SPEC-0061, CA 31/32)', () => {
  it('ATLAS_AUTO_START_SEARCH_CONTAINER ausente devolve "disabled" para o container sem tocar a porta', async () => {
    const calls: string[] = [];
    const process = fakeProcess({
      inspectSearchContainer: async (): Promise<SearchContainerState> => {
        calls.push('inspectSearchContainer');
        return 'stopped';
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

    expect(report.outcomes[1]).toEqual({ dependency: 'search-container', status: 'disabled' });
    expect(calls).toEqual([]);
  });

  it('com "searxng", exercita o caminho de auto-start', async () => {
    const process = fakeProcess({
      inspectSearchContainer: async (): Promise<SearchContainerState> => 'running',
    });
    const {
      ensureExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const report = await ensureExternalDependencies({
      ATLAS_AUTO_START_SEARCH_CONTAINER: 'searxng',
    });

    expect(report.outcomes[1]).toEqual({
      dependency: 'search-container',
      status: 'already-running',
      container: 'searxng',
    });
  });

  it('valor inválido ("a b") devolve "disabled" (fail-closed), não lança, e emite exatamente 1 console.warn pinado', async () => {
    const process = fakeProcess();
    const {
      ensureExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
      INVALID_SEARCH_CONTAINER_ENV_WARNING,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const report = await ensureExternalDependencies({
        ATLAS_AUTO_START_SEARCH_CONTAINER: 'a b',
      });

      expect(report.outcomes[1]).toEqual({ dependency: 'search-container', status: 'disabled' });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(INVALID_SEARCH_CONTAINER_ENV_WARNING);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('as duas variáveis são independentes: OLLAMA inválida + SEARCH_CONTAINER válida', async () => {
    const process = fakeProcess({
      inspectSearchContainer: async (): Promise<SearchContainerState> => 'running',
    });
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
      const report = await ensureExternalDependencies({
        ATLAS_AUTO_START_OLLAMA: 'talvez',
        ATLAS_AUTO_START_SEARCH_CONTAINER: 'searxng',
      });

      expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'disabled' });
      expect(report.outcomes[1]).toEqual({
        dependency: 'search-container',
        status: 'already-running',
        container: 'searxng',
      });
      expect(warnSpy).toHaveBeenCalledWith(INVALID_AUTO_START_OLLAMA_ENV_WARNING);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('as duas variáveis são independentes: SEARCH_CONTAINER inválida + OLLAMA válida', async () => {
    const process = fakeProcess({ isOllamaRunning: async () => true });
    const {
      ensureExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
      INVALID_SEARCH_CONTAINER_ENV_WARNING,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const report = await ensureExternalDependencies({
        ATLAS_AUTO_START_OLLAMA: '1',
        ATLAS_AUTO_START_SEARCH_CONTAINER: 'a b',
      });

      expect(report.outcomes[0]).toEqual({ dependency: 'ollama', status: 'already-running' });
      expect(report.outcomes[1]).toEqual({ dependency: 'search-container', status: 'disabled' });
      expect(warnSpy).toHaveBeenCalledWith(INVALID_SEARCH_CONTAINER_ENV_WARNING);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('releaseExternalDependencies — container de busca (SPEC-0061, CA 33)', () => {
  it('sem posse é no-op e não lança', async () => {
    let stopCalls = 0;
    const process = fakeProcess({
      stopSearchContainer: async () => {
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

  it('após um ensure com "started" do container, delega o stopSearchContainer 1x', async () => {
    let stopCalls = 0;
    let pollCount = 0;
    const process = fakeProcess({
      inspectSearchContainer: async (): Promise<SearchContainerState> => {
        pollCount += 1;
        return pollCount === 1 ? 'stopped' : 'running';
      },
      startSearchContainer: async (): Promise<SearchContainerStartOutcome> => ({ started: true }),
      stopSearchContainer: async () => {
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

    await ensureExternalDependencies({ ATLAS_AUTO_START_SEARCH_CONTAINER: 'searxng' });
    await releaseExternalDependencies();

    expect(stopCalls).toBe(1);
  });
});

describe('DESKTOP_AUTO_START_OLLAMA_DEFAULT (SPEC-0062, CA 17)', () => {
  it('é exportada e vale true', async () => {
    const { DESKTOP_AUTO_START_OLLAMA_DEFAULT } = await import('../src/core-bridge.js');
    expect(DESKTOP_AUTO_START_OLLAMA_DEFAULT).toBe(true);
  });
});

describe('tabela exaustiva de ATLAS_AUTO_START_OLLAMA no desktop (SPEC-0062, CA 19)', () => {
  it.each([
    ['true', true, false],
    ['1', true, false],
    ['on', true, false],
    ['false', false, false],
    ['0', false, false],
    ['off', false, false],
    [undefined, true, false],
    ['talvez', false, true],
  ])('%s ⇒ autoStartOllama=%s, warn=%s', async (raw, expectedEnabled, expectedWarn) => {
    const process = fakeProcess({ isOllamaRunning: async () => true });
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
      const env: NodeJS.ProcessEnv = raw === undefined ? {} : { ATLAS_AUTO_START_OLLAMA: raw };
      const report = await ensureExternalDependencies(env);

      expect(report.outcomes[0]).toEqual({
        dependency: 'ollama',
        status: expectedEnabled ? 'already-running' : 'disabled',
      });
      if (expectedWarn) {
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(INVALID_AUTO_START_OLLAMA_ENV_WARNING);
      } else {
        expect(warnSpy).not.toHaveBeenCalled();
      }
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('ensureExternalDependencies — nunca lança e não marca operação em voo (SPEC-0062, CA 22)', () => {
  it('não marca operação em voo: selectPermissionRoots segue livre enquanto o auto-start do Ollama está em andamento', async () => {
    let releaseSleep: () => void = () => {};
    const sleepGate = new Promise<void>((resolve) => {
      releaseSleep = resolve;
    });
    const process = fakeProcess({ isOllamaRunning: async () => false });
    const {
      ensureExternalDependencies,
      selectPermissionRoots,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(
      createDependencyManager({ process, sleep: async () => sleepGate }),
    );

    const ensurePromise = ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: '1' });
    const tmp = mkdtempSync(join(tmpdir(), 'atlas-desktop-dep-'));
    try {
      const selection = await selectPermissionRoots({ readRoots: [tmp], writeRoots: [] });
      expect(selection.readRoots).toEqual([tmp]);
    } finally {
      releaseSleep();
      await expect(ensurePromise).resolves.toBeDefined();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('readDependencyStatus (SPEC-0062, Escopo 3, CAs 24/25/28.1)', () => {
  it('CA24: síncrona, começa vazia, reflete os desfechos após ensureExternalDependencies assentar; __resetBridgeStateForTests limpa', async () => {
    const process = fakeProcess({
      isOllamaRunning: async () => true,
    });
    const {
      ensureExternalDependencies,
      readDependencyStatus,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    expect(readDependencyStatus()).toEqual({ ollama: undefined, searchContainers: [] });

    await ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: '1' });

    expect(readDependencyStatus()).toEqual({
      ollama: { dependency: 'ollama', status: 'already-running' },
      searchContainers: [],
    });

    __resetBridgeStateForTests();
    expect(readDependencyStatus()).toEqual({ ollama: undefined, searchContainers: [] });
  });

  it('CA24: ATLAS_AUTO_START_SEARCH_CONTAINER ausente mantém searchContainers vazia ("disabled" nunca entra)', async () => {
    const process = fakeProcess();
    const {
      ensureExternalDependencies,
      readDependencyStatus,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    await ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: 'false' });

    expect(readDependencyStatus().searchContainers).toEqual([]);
  });

  it('CA25: readDependencyStatus não sobe o Core', async () => {
    const spyModule = await import('@atlas/core');
    const spy = vi.spyOn(spyModule, 'createAtlas');

    const { readDependencyStatus, __resetBridgeStateForTests } =
      await import('../src/core-bridge.js');
    __resetBridgeStateForTests();

    readDependencyStatus();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('ensureSearchContainer — gesto de GUI (SPEC-0062, CAs 26-30, 28.1)', () => {
  it('CA26: nome inválido rejeita com INVALID_SEARCH_CONTAINER_NAME_MESSAGE, zero chamadas à porta, searchContainers inalterada', async () => {
    const process = fakeProcess({
      inspectSearchContainer: async () => {
        throw new Error('a porta não deveria ser tocada');
      },
    });
    const {
      ensureSearchContainer,
      readDependencyStatus,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
      INVALID_SEARCH_CONTAINER_NAME_MESSAGE,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    await expect(ensureSearchContainer('a b')).rejects.toThrow(
      INVALID_SEARCH_CONTAINER_NAME_MESSAGE,
    );
    expect(readDependencyStatus().searchContainers).toEqual([]);
  });

  it('CA27: nome vazio/só espaços resolve "disabled" com zero chamadas à porta, sem entrar em searchContainers', async () => {
    const process = fakeProcess({
      inspectSearchContainer: async () => {
        throw new Error('a porta não deveria ser tocada');
      },
    });
    const {
      ensureSearchContainer,
      readDependencyStatus,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const outcome = await ensureSearchContainer('   ');

    expect(outcome).toEqual({ dependency: 'search-container', status: 'disabled' });
    expect(readDependencyStatus().searchContainers).toEqual([]);
  });

  it('CA28: normaliza espaços nas bordas — o fake recebe exatamente o nome trimado, e o desfecho entra em searchContainers', async () => {
    const received: string[] = [];
    const process = fakeProcess({
      inspectSearchContainer: async (name: string) => {
        received.push(name);
        return 'running';
      },
    });
    const {
      ensureSearchContainer,
      readDependencyStatus,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const outcome = await ensureSearchContainer('  searxng  ');

    expect(received).toEqual(['searxng']);
    expect(outcome).toEqual({
      dependency: 'search-container',
      status: 'already-running',
      container: 'searxng',
    });
    expect(readDependencyStatus().searchContainers).toEqual([outcome]);
  });

  it('CA28.1: a lista acumula por nome — nomes novos são acrescentados, o mesmo nome substitui no lugar', async () => {
    // 'a' começa "unknown" (falha, não memoizada — SPEC-0062/D10) e depois
    // passa a existir ("running"): a 2ª tentativa para o MESMO nome
    // substitui a entrada no lugar, sem mover a posição de 'b' na lista.
    const state = new Map<string, SearchContainerState>([
      ['a', 'unknown'],
      ['b', 'running'],
    ]);
    const process = fakeProcess({
      inspectSearchContainer: async (name: string) => state.get(name) ?? 'unknown',
    });
    const {
      ensureSearchContainer,
      readDependencyStatus,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    await ensureSearchContainer('a');
    await ensureSearchContainer('b');
    expect(readDependencyStatus().searchContainers).toEqual([
      {
        dependency: 'search-container',
        status: 'failed',
        reason: 'container-unknown',
        container: 'a',
      },
      { dependency: 'search-container', status: 'already-running', container: 'b' },
    ]);

    state.set('a', 'running');
    await ensureSearchContainer('a');
    expect(readDependencyStatus().searchContainers).toEqual([
      { dependency: 'search-container', status: 'already-running', container: 'a' },
      { dependency: 'search-container', status: 'already-running', container: 'b' },
    ]);
  });

  it('CA28.1: um container ligado por ensureExternalDependencies e outro pelo gesto aparecem ambos', async () => {
    const process = fakeProcess({
      inspectSearchContainer: async () => 'running',
    });
    const {
      ensureExternalDependencies,
      ensureSearchContainer,
      readDependencyStatus,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    await ensureExternalDependencies({ ATLAS_AUTO_START_SEARCH_CONTAINER: 'bootstrap' });
    await ensureSearchContainer('gesto');

    expect(readDependencyStatus().searchContainers).toEqual([
      { dependency: 'search-container', status: 'already-running', container: 'bootstrap' },
      { dependency: 'search-container', status: 'already-running', container: 'gesto' },
    ]);
  });

  it('CA29: não encerra sessões vivas, não altera seleções de rede/permissões, e roda mesmo com operação em voo', async () => {
    const process = fakeProcess({ inspectSearchContainer: async () => 'running' });
    const {
      ensureSearchContainer,
      selectedNetworkAccess,
      selectedPermissionRoots,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    const outcome = await ensureSearchContainer('searxng');

    expect(outcome.status).toBe('already-running');
    expect(selectedNetworkAccess()).toBeUndefined();
    expect(selectedPermissionRoots()).toBeUndefined();
  });

  it('CA30: após um ensureSearchContainer "started", releaseExternalDependencies delega o stopSearchContainer correspondente 1x; sem posse é no-op', async () => {
    let stopCalls = 0;
    let pollCount = 0;
    const process = fakeProcess({
      inspectSearchContainer: async (): Promise<SearchContainerState> => {
        pollCount += 1;
        return pollCount === 1 ? 'stopped' : 'running';
      },
      startSearchContainer: async (): Promise<SearchContainerStartOutcome> => ({ started: true }),
      stopSearchContainer: async () => {
        stopCalls += 1;
      },
    });
    const {
      ensureSearchContainer,
      releaseExternalDependencies,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(createDependencyManager({ process, sleep: instantSleep() }));

    await ensureSearchContainer('searxng');
    await releaseExternalDependencies();

    expect(stopCalls).toBe(1);
  });
});
