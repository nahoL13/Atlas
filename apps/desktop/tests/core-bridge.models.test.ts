import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers/core-bridge-harness.js';
import type {
  DependencyConfig,
  DependencyManager,
  DependencyReport,
  ModelPullOutcome,
  ModelPullProgress,
} from '@atlas/core';

// SPEC-0063 — estado, gesto e leitura no `core-bridge`: CAs 26-33, 52, 56.
// Sempre sobre um `DependencyManager` FAKE (nunca `createDependencyManager()`
// real) — nenhum teste aqui toca rede/processo real.

const { baseOverride } = useTmpDir();

interface FakeManagerOptions {
  readonly ensureImpl?: (config: DependencyConfig) => Promise<DependencyReport>;
  readonly pullImpl?: (request: {
    readonly baseUrl: string;
    readonly model: string;
    readonly onProgress?: (progress: ModelPullProgress) => void;
  }) => Promise<ModelPullOutcome>;
  readonly cancelImpl?: () => boolean;
}

function disabledReport(): DependencyReport {
  return {
    outcomes: [
      { dependency: 'ollama', status: 'disabled' },
      { dependency: 'search-container', status: 'disabled' },
    ],
  };
}

function fakeManager(options: FakeManagerOptions = {}): DependencyManager {
  return {
    ensure: options.ensureImpl ?? (async () => disabledReport()),
    release: async () => {},
    ensureSearchContainer: async () => ({ dependency: 'search-container', status: 'disabled' }),
    pullOllamaModel:
      options.pullImpl ??
      (async ({ model }) => ({ status: 'installed', model }) as ModelPullOutcome),
    cancelOllamaModelPull: options.cancelImpl ?? (() => false),
  };
}

describe('readModelCatalog (CA26)', () => {
  it('é síncrona; probe unknown, install idle, catálogo com 5 entradas todas installed:false; não sobe o Core', async () => {
    const spyModule = await import('@atlas/core');
    const spy = vi.spyOn(spyModule, 'createAtlas');

    const { readModelCatalog, __resetBridgeStateForTests } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();

    const snapshot = readModelCatalog();

    expect(snapshot.probe).toEqual({ status: 'unknown' });
    expect(snapshot.install).toEqual({ status: 'idle' });
    expect(snapshot.catalog).toHaveLength(5);
    expect(snapshot.catalog.every((entry) => entry.installed === false)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('__resetBridgeStateForTests() devolve o estado inicial', async () => {
    const {
      readModelCatalog,
      installOllamaModel,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(fakeManager());

    await installOllamaModel('llama3.2');
    expect(readModelCatalog().install).not.toEqual({ status: 'idle' });

    __resetBridgeStateForTests();
    expect(readModelCatalog()).toEqual({
      catalog: readModelCatalog().catalog.map((entry) => ({ ...entry, installed: false })),
      probe: { status: 'unknown' },
      install: { status: 'idle' },
    });
  });
});

describe('readModelCatalog após ensureExternalDependencies (CA27)', () => {
  it('desfecho com models ⇒ probe known e a entrada correspondente installed:true', async () => {
    const manager = fakeManager({
      ensureImpl: async () => ({
        outcomes: [
          { dependency: 'ollama', status: 'already-running', models: ['llama3.2:latest'] },
          { dependency: 'search-container', status: 'disabled' },
        ],
      }),
    });
    const {
      ensureExternalDependencies,
      readModelCatalog,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    await ensureExternalDependencies({});
    const snapshot = readModelCatalog();

    expect(snapshot.probe).toEqual({ status: 'known', models: ['llama3.2:latest'] });
    expect(snapshot.catalog.find((entry) => entry.name === 'llama3.2')?.installed).toBe(true);
  });

  it.each<[string, DependencyReport]>([
    [
      'already-running sem models',
      {
        outcomes: [
          { dependency: 'ollama', status: 'already-running' },
          { dependency: 'search-container', status: 'disabled' },
        ],
      },
    ],
    [
      'failed',
      {
        outcomes: [
          { dependency: 'ollama', status: 'failed', reason: 'timeout' },
          { dependency: 'search-container', status: 'disabled' },
        ],
      },
    ],
    ['disabled', disabledReport()],
  ])('%s ⇒ probe assenta em unknown, nenhuma entrada marcada', async (_label, report) => {
    const manager = fakeManager({ ensureImpl: async () => report });
    const {
      ensureExternalDependencies,
      readModelCatalog,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    await ensureExternalDependencies({});
    const snapshot = readModelCatalog();

    expect(snapshot.probe).toEqual({ status: 'unknown' });
    expect(snapshot.catalog.every((entry) => entry.installed === false)).toBe(true);
  });
});

describe('installOllamaModel — fora do catálogo (CA28)', () => {
  it('rejeita com MODEL_NOT_IN_CATALOG_MESSAGE, zero pullOllamaModel, readModelCatalog() inalterado', async () => {
    let pullCalls = 0;
    const manager = fakeManager({
      pullImpl: async ({ model }) => {
        pullCalls += 1;
        return { status: 'installed', model };
      },
    });
    const {
      installOllamaModel,
      readModelCatalog,
      MODEL_NOT_IN_CATALOG_MESSAGE,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    const before = readModelCatalog();
    await expect(installOllamaModel('mistral')).rejects.toThrow(MODEL_NOT_IN_CATALOG_MESSAGE);

    expect(pullCalls).toBe(0);
    expect(readModelCatalog()).toEqual(before);
  });
});

describe('installOllamaModel — posse antes do 1º await, progresso, desfecho final (CA29)', () => {
  it('grava running antes do 1º await; repassa onProgress; grava o desfecho final', async () => {
    let resolveOutcome: ((outcome: ModelPullOutcome) => void) | undefined;
    const manager = fakeManager({
      pullImpl: ({ onProgress }) =>
        new Promise<ModelPullOutcome>((resolve) => {
          resolveOutcome = resolve;
          onProgress?.({ model: 'llama3.2', completedBytes: 5, totalBytes: 10 });
        }),
    });
    const {
      installOllamaModel,
      readModelCatalog,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    const promise = installOllamaModel('llama3.2');

    expect(readModelCatalog().install).toEqual({
      status: 'running',
      model: 'llama3.2',
      completedBytes: 5,
      totalBytes: 10,
    });

    resolveOutcome?.({ status: 'installed', model: 'llama3.2' });
    const outcome = await promise;

    expect(outcome).toEqual({ status: 'installed', model: 'llama3.2' });
    expect(readModelCatalog().install).toEqual({ status: 'installed', model: 'llama3.2' });
  });
});

describe('installOllamaModel — promoção/acréscimo do probe (CA30)', () => {
  it('instalado acrescenta ao probe known sem duplicar (regra de tag implícita)', async () => {
    const manager = fakeManager({
      ensureImpl: async () => ({
        outcomes: [
          { dependency: 'ollama', status: 'started', models: ['gemma2:2b'] },
          { dependency: 'search-container', status: 'disabled' },
        ],
      }),
    });
    const {
      ensureExternalDependencies,
      installOllamaModel,
      readModelCatalog,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    await ensureExternalDependencies({});
    await installOllamaModel('llama3.2');

    expect(readModelCatalog().probe).toEqual({
      status: 'known',
      models: ['gemma2:2b', 'llama3.2'],
    });
  });

  it('instalar um nome já presente (mesma tag implícita) não duplica a lista', async () => {
    const manager = fakeManager({
      ensureImpl: async () => ({
        outcomes: [
          { dependency: 'ollama', status: 'started', models: ['llama3.2:latest'] },
          { dependency: 'search-container', status: 'disabled' },
        ],
      }),
    });
    const {
      ensureExternalDependencies,
      installOllamaModel,
      readModelCatalog,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    await ensureExternalDependencies({});
    await installOllamaModel('llama3.2');

    expect(readModelCatalog().probe).toEqual({ status: 'known', models: ['llama3.2:latest'] });
  });

  it('promove um probe pending/unknown a known com [modelo]', async () => {
    const manager = fakeManager();
    const {
      installOllamaModel,
      readModelCatalog,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    expect(readModelCatalog().probe).toEqual({ status: 'unknown' });
    await installOllamaModel('llama3.2');

    expect(readModelCatalog().probe).toEqual({ status: 'known', models: ['llama3.2'] });
  });

  it('cancelled/failed não alteram o probe', async () => {
    for (const outcome of [
      { status: 'cancelled', model: 'llama3.2' } as const,
      { status: 'failed', model: 'llama3.2', reason: 'unreachable' } as const,
    ]) {
      const manager = fakeManager({ pullImpl: async () => outcome });
      const {
        installOllamaModel,
        readModelCatalog,
        __resetBridgeStateForTests,
        __setDependencyManagerForTests,
      } = await import('../src/core-bridge.js');
      __resetBridgeStateForTests();
      __setDependencyManagerForTests(manager);

      await installOllamaModel('llama3.2');
      expect(readModelCatalog().probe).toEqual({ status: 'unknown' });
    }
  });
});

describe('origem única do baseUrl (CA31)', () => {
  it('installOllamaModel usa exatamente o ollamaBaseUrl que o bootstrap resolveu', async () => {
    const seen: string[] = [];
    const manager = fakeManager({
      ensureImpl: async (config) => {
        seen.push(`ensure:${config.ollamaBaseUrl}`);
        return disabledReport();
      },
      pullImpl: async ({ baseUrl, model }) => {
        seen.push(`pull:${baseUrl}`);
        return { status: 'installed', model };
      },
    });
    const {
      ensureExternalDependencies,
      installOllamaModel,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    await ensureExternalDependencies({ ATLAS_AUTO_START_OLLAMA: 'false' });
    await installOllamaModel('llama3.2');

    const ensureUrl = seen.find((s) => s.startsWith('ensure:'))?.slice('ensure:'.length);
    const pullUrl = seen.find((s) => s.startsWith('pull:'))?.slice('pull:'.length);
    expect(pullUrl).toBe(ensureUrl);
    expect(pullUrl).toBeDefined();
  });

  it('grep: uma única ocorrência de resolveDependencyConfig em core-bridge.ts', async () => {
    const source = await readFile(new URL('../src/core-bridge.ts', import.meta.url), 'utf8');
    const matches = source.match(/resolveDependencyConfig\(/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe('cancelModelInstall (CA32)', () => {
  it('é síncrona e delega ao manager', async () => {
    const { cancelModelInstall, __resetBridgeStateForTests, __setDependencyManagerForTests } =
      await import('../src/core-bridge.js');
    __resetBridgeStateForTests();

    __setDependencyManagerForTests(fakeManager({ cancelImpl: () => true }));
    expect(cancelModelInstall()).toEqual({ cancelled: true });

    __setDependencyManagerForTests(fakeManager({ cancelImpl: () => false }));
    expect(cancelModelInstall()).toEqual({ cancelled: false });
  });
});

describe('isolamento de installOllamaModel/cancelModelInstall (CA33)', () => {
  it('não encerram sessões, não alteram seleções, não marcam nem são bloqueados por operação em voo', async () => {
    let resolvePull: ((outcome: ModelPullOutcome) => void) | undefined;
    const manager = fakeManager({
      pullImpl: () =>
        new Promise<ModelPullOutcome>((resolve) => {
          resolvePull = resolve;
        }),
    });
    const {
      installOllamaModel,
      cancelModelInstall,
      resolveAskSnapshot,
      selectedPersonaId,
      selectedPermissionRoots,
      selectedNetworkAccess,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    const before = {
      persona: selectedPersonaId(),
      perms: selectedPermissionRoots(),
      net: selectedNetworkAccess(),
    };

    const installPromise = installOllamaModel('llama3.2');

    // Um `ask` concorrente não é recusado por causa do download em voo —
    // prova que `installOllamaModel` não marca operação em voo (D18).
    const askResult = await resolveAskSnapshot('oi', { configOverride: baseOverride() });
    expect(typeof askResult.text).toBe('string');

    expect(cancelModelInstall()).toEqual({ cancelled: false });
    resolvePull?.({ status: 'cancelled', model: 'llama3.2' });
    await installPromise;

    expect(selectedPersonaId()).toBe(before.persona);
    expect(selectedPermissionRoots()).toEqual(before.perms);
    expect(selectedNetworkAccess()).toEqual(before.net);
  });
});

describe('CA52 — busy não sobrescreve o download real', () => {
  it('download em voo + 2ª chamada devolve busy sem tocar o manager, sem alterar o estado do download original', async () => {
    let pullCalls = 0;
    let cancelCalls = 0;
    let resolveFirst: ((outcome: ModelPullOutcome) => void) | undefined;
    const manager = fakeManager({
      pullImpl: ({ onProgress, model }) => {
        pullCalls += 1;
        return new Promise<ModelPullOutcome>((resolve) => {
          resolveFirst = resolve;
          onProgress?.({ model, completedBytes: 3, totalBytes: 9 });
        });
      },
      cancelImpl: () => {
        cancelCalls += 1;
        return true;
      },
    });
    const {
      installOllamaModel,
      readModelCatalog,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    const firstPromise = installOllamaModel('llama3.2');
    const before = readModelCatalog().install;
    expect(before).toEqual({
      status: 'running',
      model: 'llama3.2',
      completedBytes: 3,
      totalBytes: 9,
    });

    const secondOutcome = await installOllamaModel('gemma2:2b');

    expect(secondOutcome).toEqual({ status: 'failed', model: 'gemma2:2b', reason: 'busy' });
    expect(pullCalls).toBe(1);
    expect(cancelCalls).toBe(0);
    expect(readModelCatalog().install).toEqual(before);

    resolveFirst?.({ status: 'installed', model: 'llama3.2' });
    await expect(firstPromise).resolves.toEqual({ status: 'installed', model: 'llama3.2' });
    expect(readModelCatalog().install).toEqual({ status: 'installed', model: 'llama3.2' });
  });

  it('um manager que devolve "busy" mesmo sem posse registrada não grava nada em modelInstallState', async () => {
    const manager = fakeManager({
      pullImpl: async ({ model }) => ({ status: 'failed', model, reason: 'busy' }),
    });
    const {
      installOllamaModel,
      readModelCatalog,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    const outcome = await installOllamaModel('llama3.2');

    expect(outcome).toEqual({ status: 'failed', model: 'llama3.2', reason: 'busy' });
    // A escrita de 'running' feita ANTES de chamar o manager não é revertida
    // nem sobrescrita por 'busy' — o desfecho 'busy' nunca é gravado.
    expect(readModelCatalog().install).toEqual({ status: 'running', model: 'llama3.2' });
  });
});

describe('CA56 — probe de três estados / whenModelProbeSettled (B1, bridge)', () => {
  it('probe assume pending antes do 1º await; whenModelProbeSettled só resolve quando o ensure assentar', async () => {
    let resolveEnsure: ((report: DependencyReport) => void) | undefined;
    const manager = fakeManager({
      ensureImpl: () =>
        new Promise<DependencyReport>((resolve) => {
          resolveEnsure = resolve;
        }),
    });
    const {
      ensureExternalDependencies,
      readModelCatalog,
      whenModelProbeSettled,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    const ensurePromise = ensureExternalDependencies({});
    expect(readModelCatalog().probe).toEqual({ status: 'pending' });

    let settled = false;
    const settledPromise = whenModelProbeSettled().then((snapshot) => {
      settled = true;
      return snapshot;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveEnsure?.({
      outcomes: [
        { dependency: 'ollama', status: 'started', models: ['x:latest'] },
        { dependency: 'search-container', status: 'disabled' },
      ],
    });
    await ensurePromise;
    const snapshot = await settledPromise;

    expect(settled).toBe(true);
    expect(snapshot.probe).toEqual({ status: 'known', models: ['x:latest'] });

    const again = await whenModelProbeSettled();
    expect(again.probe).toEqual({ status: 'known', models: ['x:latest'] });
  });

  it('ensure que rejeita também resolve a promessa (probe unknown); whenModelProbeSettled nunca rejeita', async () => {
    const manager = fakeManager({
      ensureImpl: async () => {
        throw new Error('boom');
      },
    });
    const {
      ensureExternalDependencies,
      whenModelProbeSettled,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    const settledPromise = whenModelProbeSettled();
    await expect(ensureExternalDependencies({})).rejects.toThrow('boom');

    const snapshot = await settledPromise;
    expect(snapshot.probe).toEqual({ status: 'unknown' });
  });
});

describe('correção não-bloqueante (2ª rodada) — o finally do ensure não rebaixa um probe já known', () => {
  it('installOllamaModel promove o probe a known ANTES do ensure assentar; um ensure mais lento não o rebaixa', async () => {
    let resolveEnsure: ((report: DependencyReport) => void) | undefined;
    const manager = fakeManager({
      ensureImpl: () =>
        new Promise<DependencyReport>((resolve) => {
          resolveEnsure = resolve;
        }),
      pullImpl: async ({ model }) => ({ status: 'installed', model }),
    });
    const {
      ensureExternalDependencies,
      installOllamaModel,
      readModelCatalog,
      __resetBridgeStateForTests,
      __setDependencyManagerForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    __setDependencyManagerForTests(manager);

    const ensurePromise = ensureExternalDependencies({});
    expect(readModelCatalog().probe).toEqual({ status: 'pending' });

    // installOllamaModel assenta ANTES do bootstrap — promove o probe a
    // 'known' por prova própria (item 5.2), enquanto o `ensure` ainda está
    // em voo.
    await installOllamaModel('llama3.2');
    expect(readModelCatalog().probe).toEqual({ status: 'known', models: ['llama3.2'] });

    // O `ensure` finalmente assenta com um desfecho SEM `models` — se o
    // `finally` gravasse incondicionalmente, isto rebaixaria o probe já
    // promovido a 'unknown'.
    resolveEnsure?.({
      outcomes: [
        { dependency: 'ollama', status: 'already-running' },
        { dependency: 'search-container', status: 'disabled' },
      ],
    });
    await ensurePromise;

    expect(readModelCatalog().probe).toEqual({ status: 'known', models: ['llama3.2'] });
  });
});
