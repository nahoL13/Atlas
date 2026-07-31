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

  it('openChatSession repassa confirm e configOverride ao Core (paridade com resolveAskSnapshot)', async () => {
    const confirm = { request: async () => true };
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    let receivedConfirm: unknown;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (config, deps) => {
      receivedConfirm = deps?.confirm;
      return original(config, deps);
    });

    const { openChatSession, closeChatSession } = await import('../src/core-bridge.js');
    const session = await openChatSession({
      confirm,
      configOverride: baseOverride({ logLevel: 'debug' }),
    });

    expect(receivedConfirm).toBe(confirm);

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
});
