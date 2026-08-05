import { describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers/core-bridge-harness.js';

const { baseOverride } = useTmpDir();

describe('chat vivo (openChatSession/sendChatTurn/closeChatSession)', () => {
  it('openChatSession devolve uma SessionId não vazia chamando createAtlas uma vez', async () => {
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      return original(...args);
    });

    const { openChatSession, closeChatSession } = await import('../src/core-bridge.js');
    const session = await openChatSession({ configOverride: baseOverride() });

    expect(typeof session).toBe('string');
    expect(session.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledTimes(1);

    await closeChatSession(session);
    spy.mockRestore();
  });

  it('openChatSession repassa confirm e configOverride ao Core (paridade com resolveAskSnapshot; SPEC-0051: envolvido por wrapConfirmForChatSession, D8 — delegação comportamental, não mais identidade de objeto)', async () => {
    const confirm = { request: vi.fn(async () => true) };
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    let receivedConfirm: { request: (action: unknown) => Promise<boolean> } | undefined;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (config, deps) => {
      receivedConfirm = deps?.confirm as typeof receivedConfirm;
      return original(config, deps);
    });

    const { openChatSession, closeChatSession } = await import('../src/core-bridge.js');
    const session = await openChatSession({
      confirm,
      configOverride: baseOverride({ logLevel: 'debug' }),
    });

    // Desde a SPEC-0051, o Core recebe o envelope de contenção pegajosa por
    // sessão (D8), não a porta injetada diretamente — a prova de propagação
    // passa a ser comportamental: chamar a porta recebida delega ao
    // `confirm` original enquanto não houver turno abandonado na sessão.
    expect(receivedConfirm).not.toBe(confirm);
    await expect(receivedConfirm?.request({} as never)).resolves.toBe(true);
    expect(confirm.request).toHaveBeenCalledTimes(1);

    await closeChatSession(session);
    spy.mockRestore();
  });

  it('dois sendChatTurn sucessivos na mesma sessão resolvem TurnSnapshot serializável, com createAtlas chamado uma só vez e shutdown não chamado entre turnos', async () => {
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    let shutdownSpy: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      shutdownSpy = vi.fn<() => Promise<void>>(atlas.shutdown.bind(atlas));
      atlas.shutdown = shutdownSpy;
      return atlas;
    });

    const { openChatSession, sendChatTurn, closeChatSession } =
      await import('../src/core-bridge.js');
    const session = await openChatSession({ configOverride: baseOverride() });

    const firstTurn = await sendChatTurn(session, 'oi');
    expect(firstTurn).toEqual({ reply: '[fake] oi', steps: [], learned: [] });
    expect(JSON.parse(JSON.stringify(firstTurn))).toEqual(firstTurn);

    const secondTurn = await sendChatTurn(session, 'tudo bem?');
    expect(secondTurn).toEqual({ reply: '[fake] tudo bem?', steps: [], learned: [] });
    expect(JSON.parse(JSON.stringify(secondTurn))).toEqual(secondTurn);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(shutdownSpy).not.toHaveBeenCalled();

    await closeChatSession(session);
    expect(shutdownSpy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('closeChatSession chama atlas.shutdown() exatamente uma vez e invalida o handle', async () => {
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    let shutdownSpy: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      shutdownSpy = vi.fn<() => Promise<void>>(atlas.shutdown.bind(atlas));
      atlas.shutdown = shutdownSpy;
      return atlas;
    });

    const { openChatSession, sendChatTurn, closeChatSession } =
      await import('../src/core-bridge.js');
    const session = await openChatSession({ configOverride: baseOverride() });
    await sendChatTurn(session, 'oi');
    await closeChatSession(session);

    expect(shutdownSpy).toHaveBeenCalledTimes(1);

    await expect(sendChatTurn(session, 'oi de novo')).rejects.toThrow();
    await expect(sendChatTurn(session, 'oi de novo')).rejects.not.toBeInstanceOf(TypeError);

    spy.mockRestore();
  });

  it('sendChatTurn/closeChatSession com uma SessionId nunca aberta rejeitam com erro estruturado, sem TypeError', async () => {
    const { sendChatTurn, closeChatSession } = await import('../src/core-bridge.js');

    await expect(sendChatTurn('sessao-inexistente', 'oi')).rejects.toThrow();
    await expect(sendChatTurn('sessao-inexistente', 'oi')).rejects.not.toBeInstanceOf(TypeError);

    await expect(closeChatSession('sessao-inexistente')).rejects.toThrow();
    await expect(closeChatSession('sessao-inexistente')).rejects.not.toBeInstanceOf(TypeError);
  });

  it('SPEC-0050: com um ask em voo, sendChatTurn rejeita com a mensagem pinada, atlas.cognitive.respond não é chamado e a conversa fica inalterada; ao assentar o ask, o mesmo turno é aceito e a sessão nunca foi derrubada', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseAskCall: () => void = () => {};
    const askGate = new Promise<void>((resolve) => {
      releaseAskCall = resolve;
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
        await askGate;
        return ollamaResponse('oi, tudo bem?');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    try {
      const { openChatSession, sendChatTurn, closeChatSession, resolveAskSnapshot } =
        await import('../src/core-bridge.js');
      const session = await openChatSession({ configOverride: baseOverride() });

      const askPromise = resolveAskSnapshot('ask concorrente', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      await expect(sendChatTurn(session, 'oi')).rejects.toThrow(
        'Não é possível enviar o turno: há uma operação em andamento.',
      );

      releaseAskCall();
      await askPromise;

      // A sessão nunca foi derrubada — o mesmo turno agora é aceito.
      const turn = await sendChatTurn(session, 'oi');
      expect(turn).toEqual({ reply: '[fake] oi', steps: [], learned: [] });

      await closeChatSession(session);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('SPEC-0050: com um turno em voo na mesma sessão, um segundo sendChatTurn rejeita com a mensagem pinada e o 1º conclui íntegro', async () => {
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
      const { openChatSession, sendChatTurn, closeChatSession } =
        await import('../src/core-bridge.js');
      const session = await openChatSession({
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });

      const firstTurn = sendChatTurn(session, 'oi');
      await new Promise((resolve) => setTimeout(resolve, 0));

      await expect(sendChatTurn(session, 'de novo')).rejects.toThrow(
        'Não é possível enviar o turno: há uma operação em andamento.',
      );

      releaseFirstCall();
      const turn = await firstTurn;
      expect(turn.reply).toBe('oi, tudo bem?');

      await closeChatSession(session);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('SPEC-0050 (D4, ordem das guardas): sendChatTurn sobre um handle desconhecido durante um ask em voo rejeita com o erro de sessão desconhecida, não com o de operação em voo', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseAskCall: () => void = () => {};
    const askGate = new Promise<void>((resolve) => {
      releaseAskCall = resolve;
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
        await askGate;
        return ollamaResponse('oi, tudo bem?');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    try {
      const { resolveAskSnapshot, sendChatTurn } = await import('../src/core-bridge.js');

      const askPromise = resolveAskSnapshot('ask concorrente', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      await expect(sendChatTurn('sessao-nunca-aberta', 'oi')).rejects.toThrow(
        /Sessão de chat desconhecida ou já encerrada/,
      );

      releaseAskCall();
      await askPromise;
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('SPEC-0051 (Frente 6.2, ordem das guardas D15): sendChatTurn sobre um handle desconhecido durante a quarentena de OUTRA sessão rejeita com o erro de sessão desconhecida, não com o de quarentena', async () => {
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
      const { cancelInFlightOperation, openChatSession, sendChatTurn, closeChatSession } =
        await import('../src/core-bridge.js');

      const session = await openChatSession({
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      const t1 = sendChatTurn(session, 'oi');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(cancelInFlightOperation()).toEqual({ cancelled: true });
      await expect(t1).rejects.toThrow('Turno cancelado pelo usuário.');

      // `mustGetChatSession` roda ANTES de `hasAbandonedTurnForSession` — um
      // handle nunca aberto rejeita com o erro de estrutura, mesmo havendo
      // uma sessão (outra) em quarentena no momento.
      await expect(sendChatTurn('sessao-nunca-aberta', 'oi')).rejects.toThrow(
        /Sessão de chat desconhecida ou já encerrada/,
      );

      releaseFirstCall();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      await closeChatSession(session);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
