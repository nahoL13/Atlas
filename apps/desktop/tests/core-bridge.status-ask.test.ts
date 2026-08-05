import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import { useTmpDir } from './helpers/core-bridge-harness.js';

const { path: tmpDir, baseOverride } = useTmpDir();

describe('resolveStatusSnapshot', () => {
  it('devolve um StatusSnapshot serializável com state ready e a config resolvida', async () => {
    const { resolveStatusSnapshot } = await import('../src/core-bridge.js');
    const snapshot = await resolveStatusSnapshot(baseOverride());

    expect(snapshot.state).toBe('ready');
    expect(snapshot.logLevel).toBe('info');
    expect(snapshot.dataDir).toBe(tmpDir());
    expect(snapshot.persona).toEqual({ id: 'jarvis', name: 'Jarvis' });
    expect(snapshot.readRoots.length).toBeGreaterThan(0);
    expect(snapshot.writeRoots).toEqual([]);

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('propaga o override de config ao Core (logLevel: debug)', async () => {
    const { resolveStatusSnapshot } = await import('../src/core-bridge.js');
    const snapshot = await resolveStatusSnapshot(baseOverride({ logLevel: 'debug' }));

    expect(snapshot.logLevel).toBe('debug');
  });

  it('propaga InvalidConfigError sem capturar', async () => {
    const { resolveStatusSnapshot } = await import('../src/core-bridge.js');

    await expect(resolveStatusSnapshot(baseOverride({ dataDir: '' }))).rejects.toBeInstanceOf(
      InvalidConfigError,
    );
  });

  it('chama atlas.shutdown() no caminho de sucesso', async () => {
    let shutdownSpy: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      shutdownSpy = vi.fn<() => Promise<void>>(atlas.shutdown.bind(atlas));
      atlas.shutdown = shutdownSpy;
      return atlas;
    });

    const { resolveStatusSnapshot } = await import('../src/core-bridge.js');
    await resolveStatusSnapshot(baseOverride());

    expect(shutdownSpy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('resolveAskSnapshot', () => {
  it('devolve um AskSnapshot serializável com text/steps/learned', async () => {
    const { resolveAskSnapshot } = await import('../src/core-bridge.js');
    const snapshot = await resolveAskSnapshot('oi', { configOverride: baseOverride() });

    expect(snapshot.text).toBe('[fake] oi');
    expect(snapshot.steps).toEqual([]);
    expect(snapshot.learned).toEqual([]);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('repassa o confirm injetado ao Core via CreateAtlasDeps.confirm (SPEC-0051: envolvido por wrapConfirmForAsk, D8 — delegação comportamental, não mais identidade de objeto)', async () => {
    const confirm = { request: vi.fn(async () => true) };
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    let receivedConfirm: { request: (action: unknown) => Promise<boolean> } | undefined;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (config, deps) => {
      receivedConfirm = deps?.confirm as typeof receivedConfirm;
      return original(config, deps);
    });

    const { resolveAskSnapshot } = await import('../src/core-bridge.js');
    await resolveAskSnapshot('oi', { confirm, configOverride: baseOverride() });

    // Desde a SPEC-0051, o Core recebe o envelope de contenção (D8), não a
    // porta injetada diretamente — a prova de propagação passa a ser
    // comportamental: chamar a porta recebida delega ao `confirm` original.
    expect(receivedConfirm).not.toBe(confirm);
    await expect(receivedConfirm?.request({} as never)).resolves.toBe(true);
    expect(confirm.request).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('chama atlas.shutdown() no caminho de sucesso', async () => {
    let shutdownSpy: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      shutdownSpy = vi.fn<() => Promise<void>>(atlas.shutdown.bind(atlas));
      atlas.shutdown = shutdownSpy;
      return atlas;
    });

    const { resolveAskSnapshot } = await import('../src/core-bridge.js');
    await resolveAskSnapshot('oi', { configOverride: baseOverride() });

    expect(shutdownSpy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('propaga o override de config ao Core (dataDir)', async () => {
    const { resolveAskSnapshot } = await import('../src/core-bridge.js');
    const other = mkdtempSync(join(tmpdir(), 'atlas-desktop-ask-'));
    try {
      const snapshot = await resolveAskSnapshot('oi', {
        configOverride: baseOverride({
          dataDir: other,
          memory: { path: join(other, 'memory.json') },
        }),
      });
      expect(snapshot.text).toBe('[fake] oi');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('propaga InvalidConfigError sem capturar', async () => {
    const { resolveAskSnapshot } = await import('../src/core-bridge.js');

    await expect(
      resolveAskSnapshot('oi', { configOverride: baseOverride({ dataDir: '' }) }),
    ).rejects.toBeInstanceOf(InvalidConfigError);
  });

  it('SPEC-0050: com um ask em voo, um segundo resolveAskSnapshot rejeita com a mensagem pinada; o 1º conclui íntegro; depois de assentar, um novo resolveAskSnapshot é aceito', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    function ollamaResponse(content: string): Response {
      return new Response(JSON.stringify({ message: { content } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return ollamaResponse('oi, tudo bem?');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    try {
      const { resolveAskSnapshot } = await import('../src/core-bridge.js');

      const firstAsk = resolveAskSnapshot('oi', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      await expect(resolveAskSnapshot('outro', { configOverride: baseOverride() })).rejects.toThrow(
        'Não é possível iniciar uma pergunta: há uma operação em andamento.',
      );

      releaseFirstCall();
      const first = await firstAsk;
      expect(first.text).toBe('oi, tudo bem?');

      const after = await resolveAskSnapshot('depois', { configOverride: baseOverride() });
      expect(after.text).toBe('[fake] depois');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('SPEC-0050: com um turno de chat em voo, resolveAskSnapshot rejeita com a mensagem pinada e nenhum Core é criado; após o turno assentar, é aceito', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseTurnCall: () => void = () => {};
    const turnGate = new Promise<void>((resolve) => {
      releaseTurnCall = resolve;
    });

    function ollamaResponse(content: string): Response {
      return new Response(JSON.stringify({ message: { content } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await turnGate;
        return ollamaResponse('oi, tudo bem?');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      return original(...args);
    });

    try {
      const { openChatSession, sendChatTurn, closeChatSession, resolveAskSnapshot } =
        await import('../src/core-bridge.js');

      const session = await openChatSession({
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      spy.mockClear();

      const turnPromise = sendChatTurn(session, 'oi');
      await new Promise((resolve) => setTimeout(resolve, 0));

      await expect(resolveAskSnapshot('outro', { configOverride: baseOverride() })).rejects.toThrow(
        'Não é possível iniciar uma pergunta: há uma operação em andamento.',
      );
      expect(spy).not.toHaveBeenCalled();

      releaseTurnCall();
      const turn = await turnPromise;
      expect(turn.reply).toBe('oi, tudo bem?');

      const after = await resolveAskSnapshot('depois', { configOverride: baseOverride() });
      expect(after.text).toBe('[fake] depois');

      await closeChatSession(session);
    } finally {
      globalThis.fetch = originalFetch;
      spy.mockRestore();
    }
  });

  it('SPEC-0051 (Frente 6.2, D3): guarda de entrada lê hasActiveOperation() — um ask ABANDONADO e ainda não assentado não bloqueia um ask novo', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    function ollamaResponse(content: string): Response {
      return new Response(JSON.stringify({ message: { content } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return ollamaResponse('oi, tudo bem?');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    try {
      const { cancelInFlightOperation, resolveAskSnapshot } = await import('../src/core-bridge.js');

      const firstAsk = resolveAskSnapshot('oi', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(cancelInFlightOperation()).toEqual({ cancelled: true });
      await expect(firstAsk).rejects.toThrow('Pergunta cancelada pelo usuário.');

      // Devolve o direito de perguntar de novo IMEDIATAMENTE, mesmo com o
      // primeiro ask ainda vivo em segundo plano (D3: `hasActiveOperation()`
      // ignora as abandonadas).
      const second = await resolveAskSnapshot('outro', { configOverride: baseOverride() });
      expect(second.text).toBe('[fake] outro');

      releaseFirstCall();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
