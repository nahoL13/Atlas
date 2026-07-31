import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import type { PersonaInput } from '@atlas/contracts';
import { closeChatSessionIfOpen, useTmpDir } from './helpers/core-bridge-harness.js';

const { baseOverride } = useTmpDir();

describe('autoria de Persona pela GUI (describePersona/createPersona/updatePersona/deletePersona)', () => {
  afterEach(async () => {
    const { __resetBridgeStateForTests } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
  });

  function personaInput(overrides: Partial<PersonaInput> = {}): PersonaInput {
    return {
      name: 'Minha Persona',
      tone: 'tom',
      formality: 'formal',
      language: 'pt-BR',
      style: 'estilo',
      communicationRules: ['regra'],
      voice: 'voz',
      emotion: 'emoção',
      ...overrides,
    };
  }

  function approvingConfirmDelete() {
    return { request: vi.fn(async () => true) };
  }

  function refusingConfirmDelete() {
    return { request: vi.fn(async () => false) };
  }

  it('describePersona devolve os 8 campos + id + voiceURI? + builtin', async () => {
    const { describePersona } = await import('../src/core-bridge.js');
    const detail = describePersona('jarvis', { configOverride: baseOverride() });

    expect(detail.id).toBe('jarvis');
    expect(detail.name).toBe('Jarvis');
    expect(detail.builtin).toBe(true);
    expect(detail.voiceURI).toBeUndefined();
    expect(typeof detail.tone).toBe('string');
    expect(typeof detail.formality).toBe('string');
    expect(typeof detail.language).toBe('string');
    expect(typeof detail.style).toBe('string');
    expect(Array.isArray(detail.communicationRules)).toBe(true);
    expect(typeof detail.voice).toBe('string');
    expect(typeof detail.emotion).toBe('string');
  });

  it('createPersona devolve o PersonaDetail criado, não altera selectedPersonaId() e não encerra sessão de chat viva', async () => {
    const { createPersona, openChatSession, selectedPersonaId, sendChatTurn } =
      await import('../src/core-bridge.js');
    const session = await openChatSession({ configOverride: baseOverride() });
    try {
      const detail = await createPersona(personaInput({ name: 'Sem Efeito' }), {
        configOverride: baseOverride(),
      });
      expect(detail.id).toBe('sem-efeito');
      expect(detail.builtin).toBe(false);
      expect(selectedPersonaId()).toBeUndefined();

      const turn = await sendChatTurn(session, 'oi');
      expect(turn.reply).toBe('[fake] oi');
    } finally {
      await closeChatSessionIfOpen(session);
    }
  });

  it('correção A1: createPersona grava em <tmp1>/personas.json; describePersona/listPersonas com o mesmo configOverride enxergam, com outro dataDir não', async () => {
    const tmp1 = mkdtempSync(join(tmpdir(), 'atlas-persona-a1-'));
    const tmp2 = mkdtempSync(join(tmpdir(), 'atlas-persona-a1b-'));
    try {
      const { createPersona, describePersona, listPersonas } =
        await import('../src/core-bridge.js');
      const config1 = baseOverride({ dataDir: tmp1 });
      const config2 = baseOverride({ dataDir: tmp2 });

      const detail = await createPersona(personaInput({ name: 'Isolada' }), {
        configOverride: config1,
      });

      expect(existsSync(join(tmp1, 'personas.json'))).toBe(true);
      expect(existsSync(join(tmp2, 'personas.json'))).toBe(false);

      const found = describePersona(detail.id, { configOverride: config1 });
      expect(found.id).toBe(detail.id);

      expect(() => describePersona(detail.id, { configOverride: config2 })).toThrow();
      expect(listPersonas({ configOverride: config2 }).some((o) => o.id === detail.id)).toBe(false);
    } finally {
      rmSync(tmp1, { recursive: true, force: true });
      rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it('correções A1 + B1: resolveStatusSnapshot resolve a Persona custom criada em <tmp1>; o mesmo snapshot com <tmp2> rejeita citando o id', async () => {
    const tmp1 = mkdtempSync(join(tmpdir(), 'atlas-persona-b1-'));
    const tmp2 = mkdtempSync(join(tmpdir(), 'atlas-persona-b1b-'));
    try {
      const { createPersona, resolveStatusSnapshot } = await import('../src/core-bridge.js');
      const config1 = baseOverride({ dataDir: tmp1 });
      const detail = await createPersona(personaInput({ name: 'Resolvida' }), {
        configOverride: config1,
      });

      const snapshot = await resolveStatusSnapshot(
        baseOverride({ dataDir: tmp1, persona: detail.id }),
      );
      expect(snapshot.persona.id).toBe(detail.id);

      await expect(
        resolveStatusSnapshot(baseOverride({ dataDir: tmp2, persona: detail.id })),
      ).rejects.toThrow(InvalidConfigError);
      await expect(
        resolveStatusSnapshot(baseOverride({ dataDir: tmp2, persona: detail.id })),
      ).rejects.toThrow(new RegExp(detail.id));
    } finally {
      rmSync(tmp1, { recursive: true, force: true });
      rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it('updatePersona sobre a Persona ATIVA encerra as sessões vivas; sobre Persona NÃO ativa não perturba sessões vivas', async () => {
    const tmp1 = mkdtempSync(join(tmpdir(), 'atlas-persona-upd-'));
    try {
      const { createPersona, openChatSession, selectPersona, sendChatTurn, updatePersona } =
        await import('../src/core-bridge.js');
      const config = baseOverride({ dataDir: tmp1 });

      const active = await createPersona(personaInput({ name: 'Ativa' }), {
        configOverride: config,
      });
      const other = await createPersona(personaInput({ name: 'Outra' }), {
        configOverride: config,
      });

      await selectPersona(active.id, { configOverride: config });
      const session = await openChatSession({ configOverride: config });

      const mutationOther = await updatePersona(other.id, personaInput({ name: 'Outra Editada' }), {
        configOverride: config,
      });
      expect(mutationOther.closedSessions).toEqual([]);
      const turnStillAlive = await sendChatTurn(session, 'ainda vivo?');
      expect(turnStillAlive.reply).toBe('[fake] ainda vivo?');

      const mutationActive = await updatePersona(
        active.id,
        personaInput({ name: 'Ativa Editada' }),
        { configOverride: config },
      );
      expect(mutationActive.closedSessions).toEqual([session]);
      await expect(sendChatTurn(session, 'oi')).rejects.toThrow();
    } finally {
      rmSync(tmp1, { recursive: true, force: true });
    }
  });

  it('updatePersona sobre a Persona ativa recusa com operação em voo, sem alterar nada e sem encerrar sessão', async () => {
    const tmp1 = mkdtempSync(join(tmpdir(), 'atlas-persona-inflight-'));
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
      const {
        closeChatSession,
        createPersona,
        describePersona,
        openChatSession,
        selectPersona,
        sendChatTurn,
        updatePersona,
      } = await import('../src/core-bridge.js');
      const config = baseOverride({
        dataDir: tmp1,
        model: { provider: 'local', model: 'test-model' },
      });

      const active = await createPersona(personaInput({ name: 'Ativa Em Voo' }), {
        configOverride: config,
      });
      await selectPersona(active.id, { configOverride: config });
      const session = await openChatSession({ configOverride: config });

      try {
        const turnPromise = sendChatTurn(session, 'oi');
        await new Promise((resolve) => setTimeout(resolve, 0));

        await expect(
          updatePersona(active.id, personaInput({ name: 'Não Deveria Aplicar' }), {
            configOverride: config,
          }),
        ).rejects.toThrow(/andamento/);

        const stillOriginal = describePersona(active.id, { configOverride: config });
        expect(stillOriginal.name).toBe('Ativa Em Voo');

        releaseFirstCall();
        await turnPromise;
      } finally {
        await closeChatSession(session).catch(() => {});
      }
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tmp1, { recursive: true, force: true });
    }
  });

  it('updatePersona/deletePersona sobre "jarvis"/"neutral" rejeitam com Error estruturado', async () => {
    const { updatePersona, deletePersona } = await import('../src/core-bridge.js');
    const config = baseOverride();
    await expect(
      updatePersona('jarvis', personaInput(), { configOverride: config }),
    ).rejects.toThrow(Error);
    await expect(
      deletePersona('neutral', { configOverride: config, confirmDelete: approvingConfirmDelete() }),
    ).rejects.toThrow(Error);
  });

  it('deletePersona(selectedPersonaId()) rejeita citando a necessidade de trocar de Persona; depois de selectPersona para outra, é aceito', async () => {
    const tmp1 = mkdtempSync(join(tmpdir(), 'atlas-persona-active-del-'));
    try {
      const { createPersona, deletePersona, selectPersona } = await import('../src/core-bridge.js');
      const config = baseOverride({ dataDir: tmp1 });
      const target = await createPersona(personaInput({ name: 'Para Apagar' }), {
        configOverride: config,
      });
      const other = await createPersona(personaInput({ name: 'Outra Persona' }), {
        configOverride: config,
      });

      await selectPersona(target.id, { configOverride: config });

      const confirmDelete = approvingConfirmDelete();
      await expect(
        deletePersona(target.id, { configOverride: config, confirmDelete }),
      ).rejects.toThrow(/troque de Persona/i);
      expect(confirmDelete.request).not.toHaveBeenCalled();

      await selectPersona(other.id, { configOverride: config });
      await expect(
        deletePersona(target.id, { configOverride: config, confirmDelete }),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(tmp1, { recursive: true, force: true });
    }
  });

  it('correções A5+B1: deletePersona(A) com config.persona=A (sem seleção em memória) rejeita pela guarda de Persona ativa — não é InvalidConfigError, nada é apagado, confirmDelete não é consultado; deletePersona(B) no mesmo estado é aceito (controle positivo)', async () => {
    const tmp1 = mkdtempSync(join(tmpdir(), 'atlas-persona-a5b1-'));
    try {
      const {
        createPersona,
        deletePersona,
        describePersona,
        selectedPersonaId,
        __resetBridgeStateForTests,
      } = await import('../src/core-bridge.js');
      __resetBridgeStateForTests();
      const config = baseOverride({ dataDir: tmp1 });

      const a = await createPersona(personaInput({ name: 'Custom A' }), { configOverride: config });
      const b = await createPersona(personaInput({ name: 'Custom B' }), { configOverride: config });

      expect(selectedPersonaId()).toBeUndefined();

      const configWithActiveA = baseOverride({ dataDir: tmp1, persona: a.id });
      const confirmDelete = approvingConfirmDelete();

      let thrown: unknown;
      try {
        await deletePersona(a.id, { configOverride: configWithActiveA, confirmDelete });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(InvalidConfigError);
      expect(confirmDelete.request).not.toHaveBeenCalled();
      expect(describePersona(a.id, { configOverride: config }).name).toBe('Custom A');

      // Controle positivo no MESMO estado (config.persona = A, sem seleção
      // em memória): apagar B (não ativa) é aceito — prova que a resolução
      // de config/storage funciona com Persona custom no config e que a
      // rejeição acima veio da guarda, não de um erro incidental.
      await expect(
        deletePersona(b.id, { configOverride: configWithActiveA, confirmDelete }),
      ).resolves.toBeUndefined();
      expect(confirmDelete.request).toHaveBeenCalledTimes(1);
      expect(() => describePersona(b.id, { configOverride: config })).toThrow();
    } finally {
      rmSync(tmp1, { recursive: true, force: true });
    }
  });

  it('correções A5+B1 (par para updatePersona): updatePersona(A) com config.persona=A e sem seleção em memória edita a Persona efetiva e encerra as sessões vivas', async () => {
    const tmp1 = mkdtempSync(join(tmpdir(), 'atlas-persona-a5b1-upd-'));
    try {
      const { createPersona, openChatSession, sendChatTurn, updatePersona, selectedPersonaId } =
        await import('../src/core-bridge.js');
      const config = baseOverride({ dataDir: tmp1 });
      const a = await createPersona(personaInput({ name: 'Custom A' }), { configOverride: config });

      expect(selectedPersonaId()).toBeUndefined();
      const configWithActiveA = baseOverride({ dataDir: tmp1, persona: a.id });
      const session = await openChatSession({ configOverride: configWithActiveA });

      const mutation = await updatePersona(a.id, personaInput({ name: 'Custom A Editada' }), {
        configOverride: configWithActiveA,
      });
      expect(mutation.closedSessions).toEqual([session]);
      await expect(sendChatTurn(session, 'oi')).rejects.toThrow();
    } finally {
      rmSync(tmp1, { recursive: true, force: true });
    }
  });

  it('correção A3: deletePersona sem confirmDelete recusa (default fail-closed) sem apagar; com fake resolvendo false idem; com fake resolvendo true apaga; a porta é consultada só depois das validações', async () => {
    const tmp1 = mkdtempSync(join(tmpdir(), 'atlas-persona-a3-'));
    try {
      const { createPersona, deletePersona, listPersonas } = await import('../src/core-bridge.js');
      const config = baseOverride({ dataDir: tmp1 });
      const target = await createPersona(personaInput({ name: 'A3' }), { configOverride: config });

      await expect(deletePersona(target.id, { configOverride: config })).rejects.toThrow();
      expect(listPersonas({ configOverride: config }).some((o) => o.id === target.id)).toBe(true);

      const refusing = refusingConfirmDelete();
      await expect(
        deletePersona(target.id, { configOverride: config, confirmDelete: refusing }),
      ).rejects.toThrow();
      expect(refusing.request).toHaveBeenCalledTimes(1);
      expect(listPersonas({ configOverride: config }).some((o) => o.id === target.id)).toBe(true);

      const approving = approvingConfirmDelete();
      await deletePersona(target.id, { configOverride: config, confirmDelete: approving });
      expect(listPersonas({ configOverride: config }).some((o) => o.id === target.id)).toBe(false);

      const spyBuiltin = approvingConfirmDelete();
      await expect(
        deletePersona('jarvis', { configOverride: config, confirmDelete: spyBuiltin }),
      ).rejects.toThrow();
      expect(spyBuiltin.request).not.toHaveBeenCalled();

      const spyMissing = approvingConfirmDelete();
      await expect(
        deletePersona('nao-existe-mesmo', { configOverride: config, confirmDelete: spyMissing }),
      ).rejects.toThrow();
      expect(spyMissing.request).not.toHaveBeenCalled();
    } finally {
      rmSync(tmp1, { recursive: true, force: true });
    }
  });

  it('correções A1+B1 (round-trip completo): GUI → disco → Core, e com a seleção custom viva em memória as onze funções seguem operando sem InvalidConfigError', async () => {
    const tmp1 = mkdtempSync(join(tmpdir(), 'atlas-persona-roundtrip-'));
    try {
      const {
        createPersona,
        selectPersona,
        resolveStatusSnapshot,
        listPersonas,
        describePersona,
        updatePersona,
        deletePersona,
        resolveAskSnapshot,
        openChatSession,
        closeChatSession,
        resolveMemorySnapshot,
        forgetFact,
      } = await import('../src/core-bridge.js');

      const config = baseOverride({ dataDir: tmp1 });
      const created = await createPersona(
        personaInput({ name: 'Round Trip', voiceURI: 'voice-round-trip' }),
        { configOverride: config },
      );

      await selectPersona(created.id, { configOverride: config });
      const snapshot = await resolveStatusSnapshot(config);
      expect(snapshot.persona.id).toBe(created.id);
      expect(snapshot.persona.voiceURI).toBe('voice-round-trip');

      expect(() => listPersonas({ configOverride: config })).not.toThrow();
      expect(() => describePersona(created.id, { configOverride: config })).not.toThrow();

      const another = await createPersona(personaInput({ name: 'Outra Round Trip' }), {
        configOverride: config,
      });
      await expect(
        updatePersona(another.id, personaInput({ name: 'Outra Editada' }), {
          configOverride: config,
        }),
      ).resolves.toBeDefined();
      await expect(
        deletePersona(another.id, {
          configOverride: config,
          confirmDelete: approvingConfirmDelete(),
        }),
      ).resolves.toBeUndefined();

      const askResult = await resolveAskSnapshot('olá', { configOverride: config });
      expect(askResult.text).toBeDefined();

      const session = await openChatSession({ configOverride: config });
      await closeChatSession(session);

      await expect(resolveMemorySnapshot({ configOverride: config })).resolves.toBeDefined();
      await expect(forgetFact('id-inexistente', { configOverride: config })).resolves.toBe(false);
    } finally {
      rmSync(tmp1, { recursive: true, force: true });
    }
  });
});
