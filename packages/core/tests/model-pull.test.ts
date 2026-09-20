import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createDependencyManager } from '../src/dependencies/dependency-manager.js';
import type { ModelPullOutcome } from '../src/dependencies/dependency-manager.js';
import type { ModelPullRequest, ProcessPort } from '../src/dependencies/process-port.js';

/**
 * CAs 9–19, 54 (SPEC-0063) — `DependencyManager.pullOllamaModel`/
 * `cancelOllamaModelPull`, isoladas num arquivo próprio (Arquivos Esperados
 * da SPEC admitem esta divisão). Nenhum teste toca rede/processo real: um
 * `ProcessPort` fake é injetado em todos os casos.
 */

interface PullCounts {
  inspectOllama: number;
  startOllama: number;
  stopOllama: number;
  pullOllamaModel: number;
  inspectSearchContainer: number;
  startSearchContainer: number;
  stopSearchContainer: number;
}

function neverCalled(name: string): () => Promise<never> {
  return () => {
    throw new Error(`${name} não deveria ser chamado por este caminho`);
  };
}

/** Fake mínimo de `ProcessPort` — só `pullOllamaModel` é exercitado por padrão; os demais métodos falham se tocados (CA18). */
function fakePullProcess(pullImpl: (request: ModelPullRequest) => Promise<ModelPullOutcome>): {
  process: ProcessPort;
  counts: PullCounts;
} {
  const counts: PullCounts = {
    inspectOllama: 0,
    startOllama: 0,
    stopOllama: 0,
    pullOllamaModel: 0,
    inspectSearchContainer: 0,
    startSearchContainer: 0,
    stopSearchContainer: 0,
  };
  const process: ProcessPort = {
    inspectOllama: async () => {
      counts.inspectOllama += 1;
      return neverCalled('inspectOllama')();
    },
    startOllama: async () => {
      counts.startOllama += 1;
      return neverCalled('startOllama')();
    },
    stopOllama: async () => {
      counts.stopOllama += 1;
      return neverCalled('stopOllama')();
    },
    pullOllamaModel: async (request) => {
      counts.pullOllamaModel += 1;
      return pullImpl(request);
    },
    inspectSearchContainer: async () => {
      counts.inspectSearchContainer += 1;
      return neverCalled('inspectSearchContainer')();
    },
    startSearchContainer: async () => {
      counts.startSearchContainer += 1;
      return neverCalled('startSearchContainer')();
    },
    stopSearchContainer: async () => {
      counts.stopSearchContainer += 1;
      return neverCalled('stopSearchContainer')();
    },
  };
  return { process, counts };
}

describe('DependencyManager.pullOllamaModel — existência e assinaturas intactas (CA9)', () => {
  it('existe, e ensure/release/ensureSearchContainer mantêm assinatura idêntica', () => {
    const manager = createDependencyManager();
    expect(typeof manager.pullOllamaModel).toBe('function');
    expect(typeof manager.cancelOllamaModelPull).toBe('function');
    expect(typeof manager.ensure).toBe('function');
    expect(typeof manager.release).toBe('function');
    expect(typeof manager.ensureSearchContainer).toBe('function');
  });
});

describe('DependencyManager.pullOllamaModel — guarda de formato (CA10)', () => {
  it.each(['a b', 'A/b', '', 'x:'.padEnd(0, ''), 'x'.repeat(129)])(
    '%s ⇒ failed/invalid-model, zero chamadas à porta',
    async (invalidName) => {
      const { process, counts } = fakePullProcess(neverCalled('pullOllamaModel'));
      const manager = createDependencyManager({ process });

      const outcome = await manager.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: invalidName,
      });

      expect(outcome).toEqual({ status: 'failed', model: invalidName, reason: 'invalid-model' });
      expect(counts.pullOllamaModel).toBe(0);
    },
  );

  it("'x:' (nome vazio antes dos dois pontos) ⇒ failed/invalid-model", async () => {
    const { process, counts } = fakePullProcess(neverCalled('pullOllamaModel'));
    const manager = createDependencyManager({ process });

    const outcome = await manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'x:' });

    expect(outcome).toEqual({ status: 'failed', model: 'x:', reason: 'invalid-model' });
    expect(counts.pullOllamaModel).toBe(0);
  });

  it('nome válido não é recusado por formato', async () => {
    const { process } = fakePullProcess(async ({ model }) => ({ status: 'installed', model }));
    const manager = createDependencyManager({ process });

    const outcome = await manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });

    expect(outcome).toEqual({ status: 'installed', model: 'llama3.2' });
  });
});

describe('DependencyManager.pullOllamaModel — guarda de concorrência (CA11)', () => {
  it('download em voo + segunda chamada ⇒ busy, zero chamadas novas, sem abortar o corrente', async () => {
    let resolveFirst: ((outcome: ModelPullOutcome) => void) | undefined;
    const abortedSignals: AbortSignal[] = [];
    const { process, counts } = fakePullProcess((request) => {
      abortedSignals.push(request.signal);
      return new Promise<ModelPullOutcome>((resolve) => {
        resolveFirst = resolve;
      });
    });
    const manager = createDependencyManager({ process });

    const firstPromise = manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });
    await Promise.resolve();

    const secondOutcome = await manager.pullOllamaModel({
      baseUrl: 'http://x:1',
      model: 'gemma2:2b',
    });

    expect(secondOutcome).toEqual({ status: 'failed', model: 'gemma2:2b', reason: 'busy' });
    expect(counts.pullOllamaModel).toBe(1);
    expect(abortedSignals[0]?.aborted).toBe(false);

    resolveFirst?.({ status: 'installed', model: 'llama3.2' });
    await expect(firstPromise).resolves.toEqual({ status: 'installed', model: 'llama3.2' });
  });
});

describe('DependencyManager.pullOllamaModel — cancelamento (CA16)', () => {
  it('cancelOllamaModelPull() durante um download devolve true, aborta o signal, e a promessa resolve cancelled', async () => {
    let capturedSignal: AbortSignal | undefined;
    const { process } = fakePullProcess(
      (request) =>
        new Promise<ModelPullOutcome>((resolve) => {
          capturedSignal = request.signal;
          request.signal.addEventListener('abort', () => {
            resolve({ status: 'cancelled', model: request.model });
          });
        }),
    );
    const manager = createDependencyManager({ process });

    const pullPromise = manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });
    await Promise.resolve();

    expect(manager.cancelOllamaModelPull()).toBe(true);
    expect(capturedSignal?.aborted).toBe(true);
    await expect(pullPromise).resolves.toEqual({ status: 'cancelled', model: 'llama3.2' });
  });

  it('sem download em voo devolve false e é no-op', () => {
    const manager = createDependencyManager();
    expect(manager.cancelOllamaModelPull()).toBe(false);
  });

  it('uma segunda chamada seguida devolve false (idempotente)', async () => {
    const { process } = fakePullProcess(
      (request) =>
        new Promise<ModelPullOutcome>((resolve) => {
          request.signal.addEventListener('abort', () => {
            resolve({ status: 'cancelled', model: request.model });
          });
        }),
    );
    const manager = createDependencyManager({ process });
    const pullPromise = manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });
    await Promise.resolve();

    expect(manager.cancelOllamaModelPull()).toBe(true);
    expect(manager.cancelOllamaModelPull()).toBe(false);
    await pullPromise;
  });
});

describe('DependencyManager.pullOllamaModel — ausência de memoização (CA17)', () => {
  it('duas chamadas sequenciais com o mesmo nome disparam duas requisições', async () => {
    const { process, counts } = fakePullProcess(async ({ model }) => ({
      status: 'installed',
      model,
    }));
    const manager = createDependencyManager({ process });

    await manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });
    await manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });

    expect(counts.pullOllamaModel).toBe(2);
  });

  it('após um desfecho "failed"/"cancelled", o registro é limpo e uma nova tentativa é possível', async () => {
    let call = 0;
    const { process } = fakePullProcess(async ({ model }) => {
      call += 1;
      return call === 1
        ? { status: 'failed', model, reason: 'unreachable' }
        : { status: 'installed', model };
    });
    const manager = createDependencyManager({ process });

    const first = await manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });
    expect(first).toEqual({ status: 'failed', model: 'llama3.2', reason: 'unreachable' });

    const second = await manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });
    expect(second).toEqual({ status: 'installed', model: 'llama3.2' });
  });
});

describe('DependencyManager.pullOllamaModel — nunca lança, isolamento dos caminhos Ollama-serve/container (CA18)', () => {
  it('porta que rejeita ⇒ desfecho classificado, sem lançar; zero chamadas a inspectOllama/startOllama/stopOllama/container*', async () => {
    const { process, counts } = fakePullProcess(() => Promise.reject(new Error('boom')));
    const manager = createDependencyManager({ process });

    await expect(
      manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' }),
    ).rejects.toThrow('boom');

    expect(counts.inspectOllama).toBe(0);
    expect(counts.startOllama).toBe(0);
    expect(counts.stopOllama).toBe(0);
    expect(counts.inspectSearchContainer).toBe(0);
    expect(counts.startSearchContainer).toBe(0);
    expect(counts.stopSearchContainer).toBe(0);
  });

  it('desfecho classificado normal também não toca os caminhos de Ollama-serve/container', async () => {
    const { process, counts } = fakePullProcess(async ({ model }) => ({
      status: 'installed',
      model,
    }));
    const manager = createDependencyManager({ process });

    await manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });

    expect(counts.inspectOllama).toBe(0);
    expect(counts.startOllama).toBe(0);
    expect(counts.stopOllama).toBe(0);
    expect(counts.inspectSearchContainer).toBe(0);
    expect(counts.startSearchContainer).toBe(0);
    expect(counts.stopSearchContainer).toBe(0);
  });
});

describe('DependencyManager.release() — aborta o download antes de drenar (CA19)', () => {
  it('signal abortado ANTES da drenagem; release() resolve sem esperar o download inteiro; nunca lança', async () => {
    let abortedAt: number | undefined;
    let order = 0;
    const { process } = fakePullProcess(
      (request) =>
        new Promise<ModelPullOutcome>((resolve) => {
          request.signal.addEventListener('abort', () => {
            order += 1;
            abortedAt = order;
            // Só assenta DEPOIS do abort — prova que release() não trava
            // esperando um "download" que nunca terminaria sozinho.
            resolve({ status: 'cancelled', model: request.model });
          });
        }),
    );
    const manager = createDependencyManager({ process });

    void manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });
    await Promise.resolve();

    await expect(manager.release()).resolves.toBeUndefined();
    order += 1;
    const releasedAt = order;

    expect(abortedAt).toBeDefined();
    expect(abortedAt).toBeLessThan(releasedAt);
  });

  it('release() continua derrubando Ollama/containers possuídos exatamente como antes, mesmo com download em voo', async () => {
    const stopCalls: string[] = [];
    let resolvePull: ((outcome: ModelPullOutcome) => void) | undefined;
    const process: ProcessPort = {
      inspectOllama: async () => ({ running: false }),
      startOllama: async () => ({ started: true }),
      stopOllama: async () => {
        stopCalls.push('stopOllama');
      },
      pullOllamaModel: (request) =>
        new Promise<ModelPullOutcome>((resolve) => {
          resolvePull = resolve;
          request.signal.addEventListener('abort', () => {
            resolve({ status: 'cancelled', model: request.model });
          });
        }),
      inspectSearchContainer: async () => 'unknown',
      startSearchContainer: async () => ({ started: false, reason: 'container-unknown' }),
      stopSearchContainer: async () => {
        stopCalls.push('stopSearchContainer');
      },
    };
    const manager = createDependencyManager({
      process,
      sleep: async () => {},
    });

    await manager.ensure({
      autoStartOllama: true,
      ollamaBaseUrl: 'http://x:1',
      autoStartSearchContainer: '',
    });
    void manager.pullOllamaModel({ baseUrl: 'http://x:1', model: 'llama3.2' });
    await Promise.resolve();

    await manager.release();

    expect(stopCalls).toEqual(['stopOllama']);
    expect(resolvePull).toBeDefined();
  });
});

describe('Higiene global — greps do diff (CA20, CA21)', () => {
  it('grep: nenhum "shell: true" nem operação Docker mutante em packages/core/src', async () => {
    const files = [
      'src/dependencies/dependency-manager.ts',
      'src/dependencies/node-process-port.ts',
      'src/dependencies/process-port.ts',
    ];
    for (const relative of files) {
      const content = await readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
      expect(content).not.toMatch(/shell:\s*true/);
      expect(content).not.toMatch(
        /docker['"]?\s*,\s*\[\s*['"](run|create|pull|build|exec|rm|kill|compose)/,
      );
      expect(content).not.toMatch(/\/api\/delete/);
      expect(content).not.toMatch(/DELETE/);
    }
  });
});

describe('CA54 (N3) — o nome do modelo chega a exatamente um destino', () => {
  it('nome com "a/../../x" (aprovado pelo regex) resulta em URL byte a byte "<baseUrl>/api/pull"', async () => {
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      return new Response('{"status":"success"}\n', { status: 200 });
    });
    const { nodeProcessPort } = await import('../src/dependencies/node-process-port.js');
    const port = nodeProcessPort({ fetch: mockFetch as unknown as typeof fetch });

    const outcome = await port.pullOllamaModel({
      baseUrl: 'http://x:1',
      model: 'a/../../x',
      signal: new AbortController().signal,
      onProgress: () => {},
    });

    expect(outcome).toEqual({ status: 'installed', model: 'a/../../x' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe('http://x:1/api/pull');
  });

  it('grep: packages/core/src/dependencies não interpola "model" em caminho de arquivo, argv ou URL', async () => {
    const files = [
      'src/dependencies/dependency-manager.ts',
      'src/dependencies/node-process-port.ts',
    ];
    for (const relative of files) {
      const content = await readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
      // O único template literal com `model`/`request.model` deve ser o
      // corpo JSON do POST (`{ name: model, stream: true }`), nunca um
      // template string interpolando `${model}`/`${request.model}` em
      // caminho, argv ou URL.
      expect(content).not.toMatch(/\$\{.*model.*\}/i);
    }
  });
});
