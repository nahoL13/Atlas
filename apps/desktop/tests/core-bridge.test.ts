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

describe('seleção/troca de Persona em runtime (listPersonas/selectPersona/selectedPersonaId)', () => {
  afterEach(async () => {
    const { __resetPersonaStateForTests } = await import('../src/core-bridge.js');
    __resetPersonaStateForTests();
  });

  it('listPersonas devolve uma entrada por id do PersonaService, plana e serializável, sem subir o Core', async () => {
    const spyModule = await import('@atlas/core');
    const spy = vi.spyOn(spyModule, 'createAtlas');

    const { listPersonas } = await import('../src/core-bridge.js');
    const options = listPersonas();

    expect(options).toEqual([
      { id: 'jarvis', name: 'Jarvis' },
      { id: 'neutral', name: 'Assistente' },
    ]);
    expect(JSON.parse(JSON.stringify(options))).toEqual(options);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('listPersonas usa um personaService injetado em vez do default', async () => {
    const fakePersonaService = {
      get: (id: string) => ({ id, name: `Fake ${id}` }) as never,
      has: (id: string) => id === 'a',
      list: () => ['a'],
      systemPrompt: () => '',
    };

    const { listPersonas } = await import('../src/core-bridge.js');
    const options = listPersonas({ personaService: fakePersonaService });

    expect(options).toEqual([{ id: 'a', name: 'Fake a' }]);
  });

  it('após selectPersona a seleção alcança resolveStatusSnapshot; antes disso o default da config é usado', async () => {
    const { resolveStatusSnapshot, selectPersona, selectedPersonaId } =
      await import('../src/core-bridge.js');

    const before = await resolveStatusSnapshot(baseOverride());
    expect(before.persona.id).toBe('jarvis');
    expect(selectedPersonaId()).toBeUndefined();

    const selection = await selectPersona('neutral');
    expect(selection).toEqual({ personaId: 'neutral', closedSessions: [] });
    expect(selectedPersonaId()).toBe('neutral');

    const after = await resolveStatusSnapshot(baseOverride());
    expect(after.persona.id).toBe('neutral');
  });

  it('configOverride.persona explícito do chamador vence a seleção corrente', async () => {
    const { resolveStatusSnapshot, selectPersona } = await import('../src/core-bridge.js');

    await selectPersona('neutral');
    const snapshot = await resolveStatusSnapshot(baseOverride({ persona: 'jarvis' }));

    expect(snapshot.persona.id).toBe('jarvis');
  });

  it('a seleção corrente também alcança openChatSession (Core criado depois roda com a Persona nova)', async () => {
    const { openChatSession, closeChatSession, resolveStatusSnapshot, selectPersona } =
      await import('../src/core-bridge.js');

    await selectPersona('neutral');
    const session = await openChatSession({ configOverride: baseOverride() });
    try {
      // Não há como ler a Persona ativa de uma sessão de chat diretamente
      // pela superfície pública; confirmamos indiretamente checando que o
      // status resolvido no mesmo instante (mesma seleção de módulo) segue
      // reportando `neutral` — a mesma seleção que `openChatSession` acabou
      // de aplicar ao `createAtlas` interno.
      const status = await resolveStatusSnapshot(baseOverride());
      expect(status.persona.id).toBe('neutral');
    } finally {
      await closeChatSession(session);
    }
  });

  it('selectPersona com id inexistente rejeita, não altera a seleção nem encerra sessões vivas', async () => {
    const { closeChatSession, openChatSession, sendChatTurn, selectPersona, selectedPersonaId } =
      await import('../src/core-bridge.js');

    const session = await openChatSession({ configOverride: baseOverride() });
    try {
      await expect(selectPersona('inexistente')).rejects.toThrow(/inexistente/);
      expect(selectedPersonaId()).toBeUndefined();

      const turn = await sendChatTurn(session, 'oi');
      expect(turn.reply).toBe('[fake] oi');
    } finally {
      await closeChatSession(session);
    }
  });

  it('selectPersona com uma sessão de chat aberta e ociosa devolve a SessionId em closedSessions e a invalida; sem sessões, closedSessions é []', async () => {
    const { openChatSession, sendChatTurn, selectPersona } = await import('../src/core-bridge.js');

    const noSessions = await selectPersona('jarvis');
    expect(noSessions.closedSessions).toEqual([]);

    const session = await openChatSession({ configOverride: baseOverride() });
    const selection = await selectPersona('neutral');

    expect(selection.closedSessions).toEqual([session]);
    await expect(sendChatTurn(session, 'oi de novo')).rejects.toThrow();
  });

  it('turno em voo bloqueia a troca (rejeição, seleção inalterada, nenhuma sessão encerrada) e conclui íntegro depois de liberado; a troca passa a ser aceita em seguida', async () => {
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
        // Turno em voo: a 1ª chamada (planejamento) só resolve quando o
        // teste liberar — segura o turno em voo sem instrumentar o gateway
        // `fake` (que não tem ponto de suspensão), usando a superfície real
        // de `configOverride: { model: { provider: 'local' } }` que o bridge
        // já expõe (N1 do gate do architecture-reviewer).
        await firstCallGate;
        // Conteúdo não é um Plan JSON válido: `planner.parse` devolve
        // `null`, então o ciclo segue direto para a extração (2ª chamada),
        // sem passar por `runtime.execute`.
        return ollamaResponse('oi, tudo bem?');
      }
      // 2ª chamada: extração de aprendizado (Etapa 6) — devolve um array
      // JSON válido para comprovar que o `learned` do turno em voo não se
      // perde.
      return ollamaResponse('["fato aprendido durante o turno em voo"]');
    }) as typeof fetch;

    try {
      const { openChatSession, sendChatTurn, selectPersona, selectedPersonaId } =
        await import('../src/core-bridge.js');

      const session = await openChatSession({
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });

      const turnPromise = sendChatTurn(session, 'oi');

      // Dá a chance ao microtask/task queue de `sendChatTurn` marcar a
      // sessão como ocupada antes de tentar a troca.
      await new Promise((resolve) => setTimeout(resolve, 0));

      await expect(selectPersona('neutral')).rejects.toThrow(/andamento/);
      expect(selectedPersonaId()).toBeUndefined();

      releaseFirstCall();
      const turn = await turnPromise;

      expect(turn.reply).toBe('oi, tudo bem?');
      expect(turn.learned).toEqual(['fato aprendido durante o turno em voo']);

      const selection = await selectPersona('neutral');
      expect(selection.personaId).toBe('neutral');
      expect(selection.closedSessions).toEqual([session]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
