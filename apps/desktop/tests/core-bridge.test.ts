import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import type { AtlasConfigOverride } from '@atlas/contracts';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'atlas-desktop-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function baseOverride(overrides: AtlasConfigOverride = {}): AtlasConfigOverride {
  return {
    model: { provider: 'fake' },
    dataDir: tmpDir,
    memory: { path: join(tmpDir, 'memory.json') },
    ...overrides,
  };
}

describe('resolveStatusSnapshot', () => {
  it('devolve um StatusSnapshot serializável com state ready e a config resolvida', async () => {
    const { resolveStatusSnapshot } = await import('../src/core-bridge.js');
    const snapshot = await resolveStatusSnapshot(baseOverride());

    expect(snapshot.state).toBe('ready');
    expect(snapshot.logLevel).toBe('info');
    expect(snapshot.dataDir).toBe(tmpDir);
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

  it('repassa o confirm injetado ao Core via CreateAtlasDeps.confirm', async () => {
    const confirm = { request: async () => true };
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    let receivedConfirm: unknown;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (config, deps) => {
      receivedConfirm = deps?.confirm;
      return original(config, deps);
    });

    const { resolveAskSnapshot } = await import('../src/core-bridge.js');
    await resolveAskSnapshot('oi', { confirm, configOverride: baseOverride() });

    expect(receivedConfirm).toBe(confirm);
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
});

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

describe('resolveMemorySnapshot/forgetFact', () => {
  it('acervo vazio ⇒ []', async () => {
    const { resolveMemorySnapshot } = await import('../src/core-bridge.js');
    const facts = await resolveMemorySnapshot({ configOverride: baseOverride() });

    expect(facts).toEqual([]);
  });

  it('devolve FactSnapshot[] plano e serializável, com source/category resolvidos aos defaults', async () => {
    const { createAtlas } = await import('@atlas/core');
    const override = baseOverride();
    const seeder = await createAtlas({ config: override });
    await seeder.memory.remember('fato do usuário', undefined, undefined);
    await seeder.memory.remember('fato aprendido', 'learned');
    await seeder.memory.remember('fato de projeto', 'user', {
      category: 'project',
      subject: 'atlas',
    });
    await seeder.shutdown();

    const { resolveMemorySnapshot } = await import('../src/core-bridge.js');
    const facts = await resolveMemorySnapshot({ configOverride: override });

    expect(facts).toHaveLength(3);
    expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);

    const userFact = facts.find((fact) => fact.text === 'fato do usuário');
    expect(userFact).toMatchObject({ source: 'user', category: 'fact' });
    expect(userFact?.subject).toBeUndefined();

    const learnedFact = facts.find((fact) => fact.text === 'fato aprendido');
    expect(learnedFact).toMatchObject({ source: 'learned', category: 'fact' });

    const projectFact = facts.find((fact) => fact.text === 'fato de projeto');
    expect(projectFact).toMatchObject({ source: 'user', category: 'project', subject: 'atlas' });
  });

  it('chama createAtlas e atlas.shutdown() exatamente uma vez por chamada', async () => {
    let shutdownSpy: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      shutdownSpy = vi.fn<() => Promise<void>>(atlas.shutdown.bind(atlas));
      atlas.shutdown = shutdownSpy;
      return atlas;
    });

    const { resolveMemorySnapshot } = await import('../src/core-bridge.js');
    await resolveMemorySnapshot({ configOverride: baseOverride() });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(shutdownSpy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('forgetFact de um id existente devolve true e o fato some de uma resolveMemorySnapshot subsequente', async () => {
    const { createAtlas } = await import('@atlas/core');
    const override = baseOverride();
    const seeder = await createAtlas({ config: override });
    const { fact } = await seeder.memory.remember('fato a esquecer');
    await seeder.shutdown();

    const { forgetFact, resolveMemorySnapshot } = await import('../src/core-bridge.js');
    const removed = await forgetFact(fact.id, { configOverride: override });
    expect(removed).toBe(true);

    const facts = await resolveMemorySnapshot({ configOverride: override });
    expect(facts.find((snapshot) => snapshot.id === fact.id)).toBeUndefined();
  });

  it('forgetFact de um id inexistente devolve false sem lançar', async () => {
    const { forgetFact } = await import('../src/core-bridge.js');
    const removed = await forgetFact('id-inexistente', { configOverride: baseOverride() });

    expect(removed).toBe(false);
  });

  it('forgetFact chama createAtlas e atlas.shutdown() exatamente uma vez por chamada', async () => {
    let shutdownSpy: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      shutdownSpy = vi.fn<() => Promise<void>>(atlas.shutdown.bind(atlas));
      atlas.shutdown = shutdownSpy;
      return atlas;
    });

    const { forgetFact } = await import('../src/core-bridge.js');
    await forgetFact('id-qualquer', { configOverride: baseOverride() });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(shutdownSpy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
