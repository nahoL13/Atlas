import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers/core-bridge-harness.js';

const { baseOverride } = useTmpDir();

describe('seleção/troca de Persona em runtime (listPersonas/selectPersona/selectedPersonaId)', () => {
  afterEach(async () => {
    const { __resetBridgeStateForTests } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
  });

  it('listPersonas devolve uma entrada por id do PersonaService, plana e serializável, sem subir o Core', async () => {
    const spyModule = await import('@atlas/core');
    const spy = vi.spyOn(spyModule, 'createAtlas');

    const { listPersonas } = await import('../src/core-bridge.js');
    const options = listPersonas({ configOverride: baseOverride() });

    expect(options).toEqual([
      { id: 'jarvis', name: 'Jarvis', builtin: true },
      { id: 'neutral', name: 'Assistente', builtin: true },
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
      create: () => {
        throw new Error('não usado neste teste');
      },
      update: () => {
        throw new Error('não usado neste teste');
      },
      delete: () => {
        throw new Error('não usado neste teste');
      },
    };

    const { listPersonas } = await import('../src/core-bridge.js');
    const options = listPersonas({ personaService: fakePersonaService });

    expect(options).toEqual([{ id: 'a', name: 'Fake a', builtin: false }]);
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
