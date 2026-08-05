import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonaInput } from '@atlas/contracts';
import { closeChatSessionIfOpen, useTmpDir } from './helpers/core-bridge-harness.js';

// SPEC-0051: gesto de escape — cancelar um `ask`/turno de chat em voo. Molde
// de operação segurada de `core-bridge.permissions.test.ts` (dublê de
// `fetch` com provedor `local` e portão de liberação, restaurado em
// `finally`). Nenhum `setTimeout` real é usado como sincronização — só como
// forma de drenar a fila de microtarefas/macrotarefas já pendentes
// (`tick`/`flush`), nunca como relógio.

const { path: tmpDir, baseOverride } = useTmpDir();

function ollamaResponse(content: string): Response {
  return new Response(JSON.stringify({ message: { content } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function deletePlanContent(targetFile: string): string {
  return JSON.stringify({ steps: [{ tool: 'delete_file', args: { path: targetFile } }] });
}

/** Drena a fila de microtarefas/macrotarefas pendentes — nenhum relógio real avança. */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await tick();
  }
}

afterEach(async () => {
  const { __resetBridgeStateForTests } = await import('../src/core-bridge.js');
  __resetBridgeStateForTests();
});

describe('cancelInFlightOperation — sem operação em voo (CA5)', () => {
  it('devolve {cancelled:false} sem efeito observável; um ask disparado logo depois resolve normalmente', async () => {
    const { cancelInFlightOperation, resolveAskSnapshot } = await import('../src/core-bridge.js');

    expect(cancelInFlightOperation()).toEqual({ cancelled: false });

    const snapshot = await resolveAskSnapshot('oi', { configOverride: baseOverride() });
    expect(snapshot.text).toBe('[fake] oi');
  });
});

describe('cancelamento de um ask em voo (CA6/CA8/CA10)', () => {
  it('rejeita com a mensagem exata ANTES do trabalho assentar; ao assentar, o resultado é descartado (nenhum remember) e o Core é desligado exatamente uma vez', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return ollamaResponse('oi, tudo bem?');
      }
      return ollamaResponse('["fato que o ask abandonado teria aprendido"]');
    }) as typeof fetch;

    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    let shutdownCalls = 0;
    let rememberCalls = 0;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      const originalShutdown = atlas.shutdown.bind(atlas);
      atlas.shutdown = async () => {
        shutdownCalls += 1;
        await originalShutdown();
      };
      const originalRemember = atlas.memory.remember.bind(atlas.memory);
      atlas.memory.remember = (async (
        ...rememberArgs: Parameters<typeof originalRemember>
      ): ReturnType<typeof originalRemember> => {
        rememberCalls += 1;
        return originalRemember(...rememberArgs);
      }) as typeof originalRemember;
      return atlas;
    });

    try {
      const { cancelInFlightOperation, resolveAskSnapshot, resolveMemorySnapshot } =
        await import('../src/core-bridge.js');

      const askPromise = resolveAskSnapshot('oi', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      await tick();

      const outcome = cancelInFlightOperation();
      expect(outcome).toEqual({ cancelled: true });
      expect(shutdownCalls).toBe(0);

      // CA6: a rejeição chega ANTES de o trabalho subjacente assentar — o
      // dublê que segura o trabalho só é liberado DEPOIS desta asserção.
      await expect(askPromise).rejects.toThrow('Pergunta cancelada pelo usuário.');

      releaseFirstCall();
      await flush();

      // CA10: o shutdown do ask abandonado ainda acontece, uma única vez.
      expect(shutdownCalls).toBe(1);
      // CA8: nenhum remember é chamado depois do abandono.
      expect(rememberCalls).toBe(0);

      const facts = await resolveMemorySnapshot({ configOverride: baseOverride() });
      expect(facts.some((fact) => fact.text.includes('teria aprendido'))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      spy.mockRestore();
    }
  });
});

describe('cancelamento de um turno de chat em voo (CA7/CA9)', () => {
  it('rejeita com a mensagem exata; a sessão permanece viva; a conversa fica inalterada (nem updateConversation nem remember são chamados)', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return ollamaResponse('oi, tudo bem?');
      }
      return ollamaResponse('["fato que o turno abandonado teria aprendido"]');
    }) as typeof fetch;

    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    let updateConversationCalls = 0;
    let rememberCalls = 0;
    let capturedAtlas: Awaited<ReturnType<typeof original>> | undefined;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      const originalUpdateConversation = atlas.context.updateConversation.bind(atlas.context);
      atlas.context.updateConversation = (
        ...updateArgs: Parameters<typeof originalUpdateConversation>
      ) => {
        updateConversationCalls += 1;
        originalUpdateConversation(...updateArgs);
      };
      const originalRemember = atlas.memory.remember.bind(atlas.memory);
      atlas.memory.remember = (async (
        ...rememberArgs: Parameters<typeof originalRemember>
      ): ReturnType<typeof originalRemember> => {
        rememberCalls += 1;
        return originalRemember(...rememberArgs);
      }) as typeof originalRemember;
      capturedAtlas = atlas;
      return atlas;
    });

    try {
      const { cancelInFlightOperation, openChatSession, sendChatTurn, closeChatSession } =
        await import('../src/core-bridge.js');

      const session = await openChatSession({
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      const before = capturedAtlas?.context.getConversation(session).messages.length;

      const turnPromise = sendChatTurn(session, 'oi');
      await tick();

      const outcome = cancelInFlightOperation();
      expect(outcome).toEqual({ cancelled: true });

      await expect(turnPromise).rejects.toThrow('Turno cancelado pelo usuário.');

      releaseFirstCall();
      await flush();

      expect(updateConversationCalls).toBe(0);
      expect(rememberCalls).toBe(0);
      expect(capturedAtlas?.context.getConversation(session).messages.length).toBe(before);

      // A sessão permanece viva e utilizável — encerrá-la aqui não lança.
      await closeChatSession(session);
    } finally {
      globalThis.fetch = originalFetch;
      spy.mockRestore();
    }
  });
});

describe('quarentena de sessão (CA13, D15)', () => {
  it('sendChatTurn na mesma sessão rejeita com a mensagem exata sem chamar atlas.cognitive.respond; depois de assentar, é aceito', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    // O gateway `local` captura `globalThis.fetch` no MOMENTO em que o Core é
    // criado (`HttpDeps = { fetch: globalThis.fetch }`, default do parâmetro)
    // — trocar `globalThis.fetch` depois de `openChatSession` não afeta a
    // MESMA sessão. Por isso um único mock estático cobre TODAS as chamadas
    // desta sessão pelo índice: 1 = texto de T1 (segurado), 2 = extração de
    // aprendizado de T1, 3 = texto do turno seguinte (após a quarentena
    // cair), 4+ = extração de aprendizado.
    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return ollamaResponse('oi, tudo bem?');
      }
      if (callCount === 3) {
        return ollamaResponse('resposta do turno seguinte');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    let respondCalls = 0;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      const originalRespond = atlas.cognitive.respond.bind(atlas.cognitive);
      atlas.cognitive.respond = (async (
        ...respondArgs: Parameters<typeof originalRespond>
      ): ReturnType<typeof originalRespond> => {
        respondCalls += 1;
        return originalRespond(...respondArgs);
      }) as typeof originalRespond;
      return atlas;
    });

    try {
      const { cancelInFlightOperation, openChatSession, sendChatTurn, closeChatSession } =
        await import('../src/core-bridge.js');

      const session = await openChatSession({
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });

      const firstTurn = sendChatTurn(session, 'oi');
      await tick();

      const outcome = cancelInFlightOperation();
      expect(outcome).toEqual({ cancelled: true });
      await expect(firstTurn).rejects.toThrow('Turno cancelado pelo usuário.');

      const respondCallsBeforeQuarantineCheck = respondCalls;
      await expect(sendChatTurn(session, 'de novo')).rejects.toThrow(
        'Não é possível enviar o turno: o turno cancelado desta conversa ainda está encerrando.',
      );
      expect(respondCalls).toBe(respondCallsBeforeQuarantineCheck);

      releaseFirstCall();
      await flush();

      const settledTurn = await sendChatTurn(session, 'de novo');
      expect(settledTurn.reply).toBe('resposta do turno seguinte');

      await closeChatSession(session);
    } finally {
      globalThis.fetch = originalFetch;
      spy.mockRestore();
    }
  });
});

describe('assimetria dos predicados (CA14)', () => {
  it('ask novo e sessão diferente aceitos; sessão afetada, selectPermissionRoots e updatePersona recusam até assentar; todos aceitos depois', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    // O gateway `local` captura `globalThis.fetch` no momento em que a sessão
    // é criada — um mock estático único cobre as chamadas de `sessionA` pelo
    // índice (1 = texto de T1, segurado; 3 = texto do turno após a
    // quarentena cair; demais = extração de aprendizado). `resolveAskSnapshot`
    // e `sessionB` usam o provedor `fake` (default) e não tocam este mock.
    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return ollamaResponse('oi, tudo bem?');
      }
      if (callCount === 3) {
        return ollamaResponse('resposta depois da quarentena');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    let sessionA: string | undefined;
    let sessionB: string | undefined;

    try {
      const {
        cancelInFlightOperation,
        openChatSession,
        sendChatTurn,
        resolveAskSnapshot,
        selectPermissionRoots,
        createPersona,
        updatePersona,
      } = await import('../src/core-bridge.js');

      sessionA = await openChatSession({
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      const t1 = sendChatTurn(sessionA, 'oi');
      await tick();

      const outcome = cancelInFlightOperation();
      expect(outcome).toEqual({ cancelled: true });
      await expect(t1).rejects.toThrow('Turno cancelado pelo usuário.');

      // (a) um ask novo é aceito.
      const askResult = await resolveAskSnapshot('pergunta nova', {
        configOverride: baseOverride(),
      });
      expect(askResult.text).toBe('[fake] pergunta nova');

      // (b) sendChatTurn numa sessão DIFERENTE é aceito.
      sessionB = await openChatSession({ configOverride: baseOverride() });
      const turnB = await sendChatTurn(sessionB, 'oi de outra sessão');
      expect(turnB.reply).toBe('[fake] oi de outra sessão');

      // (c) sendChatTurn na sessão AFETADA recusa (quarentena, CA13).
      await expect(sendChatTurn(sessionA, 'oi de novo')).rejects.toThrow(
        /turno cancelado desta conversa/,
      );

      // (d) selectPermissionRoots recusa (predicado de segurança inclui abandonadas).
      await expect(
        selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [] }),
      ).rejects.toThrow(/andamento/);

      // (e) updatePersona sobre a Persona ATIVA recusa. Persona custom criada
      // e tornada "ativa" via configOverride.persona (sem chamar
      // selectPersona, que encerraria sessões vivas e mudaria o cenário).
      const personaInput: PersonaInput = {
        name: 'Custom',
        tone: 'neutro',
        formality: 'informal',
        language: 'pt-BR',
        style: 'direto',
        communicationRules: [],
        voice: 'neutra',
        emotion: 'calma',
      };
      const created = await createPersona(personaInput, { configOverride: baseOverride() });
      const activeOverride = baseOverride({ persona: created.id });

      await expect(
        updatePersona(created.id, personaInput, { configOverride: activeOverride }),
      ).rejects.toThrow(/andamento/);

      releaseFirstCall();
      await flush();

      // Depois de T1 assentar: (c), (d) e (e) voltam a ser aceitos.
      const turnAfter = await sendChatTurn(sessionA, 'oi de novo');
      expect(turnAfter.reply).toBe('resposta depois da quarentena');

      const permissionSelection = await selectPermissionRoots({
        readRoots: [tmpDir()],
        writeRoots: [],
      });
      expect(permissionSelection.readRoots).toEqual([tmpDir()]);

      const mutation = await updatePersona(created.id, personaInput, {
        configOverride: activeOverride,
      });
      expect(mutation.persona.id).toBe(created.id);
    } finally {
      globalThis.fetch = originalFetch;
      if (sessionA !== undefined) {
        await closeChatSessionIfOpen(sessionA);
      }
      if (sessionB !== undefined) {
        await closeChatSessionIfOpen(sessionB);
      }
    }
  });
});

describe('idempotência de cancelInFlightOperation (CA15)', () => {
  it('a 2ª chamada seguida devolve {cancelled:false} e não produz erro nem dupla rejeição', async () => {
    const originalFetch = globalThis.fetch;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    globalThis.fetch = vi.fn(async () => {
      await firstCallGate;
      return ollamaResponse('oi, tudo bem?');
    }) as typeof fetch;

    try {
      const { cancelInFlightOperation, resolveAskSnapshot } = await import('../src/core-bridge.js');

      const askPromise = resolveAskSnapshot('oi', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      await tick();

      expect(cancelInFlightOperation()).toEqual({ cancelled: true });
      expect(cancelInFlightOperation()).toEqual({ cancelled: false });

      await expect(askPromise).rejects.toThrow('Pergunta cancelada pelo usuário.');

      releaseFirstCall();
      await flush();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('ausência de unhandled rejection (CA16)', () => {
  it('o trabalho abandonado que rejeita de verdade em segundo plano é absorvido, sem unhandled rejection', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        throw new Error('falha de rede simulada depois do abandono');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    const unhandled: unknown[] = [];
    const handler = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', handler);

    try {
      const { cancelInFlightOperation, resolveAskSnapshot } = await import('../src/core-bridge.js');

      const askPromise = resolveAskSnapshot('oi', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      await tick();

      expect(cancelInFlightOperation()).toEqual({ cancelled: true });
      await expect(askPromise).rejects.toThrow('Pergunta cancelada pelo usuário.');

      releaseFirstCall();
      await flush();

      expect(unhandled).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      process.off('unhandledRejection', handler);
    }
  });
});

describe('contenção do ConfirmPort — caminho ask (CA11)', () => {
  let otherDir: string;

  afterEach(() => {
    rmSync(otherDir, { recursive: true, force: true });
  });

  it('sem abandono, o envelope é transparente (true continua true)', async () => {
    otherDir = mkdtempSync(join(tmpdir(), 'atlas-desktop-cancel-'));
    const targetFile = join(otherDir, 'alvo.txt');
    writeFileSync(targetFile, 'conteúdo');
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) return ollamaResponse(deletePlanContent(targetFile));
      if (callCount === 2) return ollamaResponse('removido com sucesso');
      return ollamaResponse('[]');
    }) as typeof fetch;

    const confirm = { request: vi.fn(async () => true) };

    try {
      const { resolveAskSnapshot } = await import('../src/core-bridge.js');
      const snapshot = await resolveAskSnapshot('apague o arquivo', {
        confirm,
        configOverride: baseOverride({
          model: { provider: 'local', model: 'test-model' },
          permissions: { readRoots: [otherDir], writeRoots: [otherDir] },
        }),
      });

      expect(confirm.request).toHaveBeenCalledTimes(1);
      expect(snapshot.steps[0]?.ok).toBe(true);
      expect(existsSync(targetFile)).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('requisição pendente no momento do abandono resolve false mesmo que a porta injetada responda true depois; requisição posterior ao abandono nem chama a porta', async () => {
    otherDir = mkdtempSync(join(tmpdir(), 'atlas-desktop-cancel-'));
    const targetFile = join(otherDir, 'alvo.txt');
    writeFileSync(targetFile, 'conteúdo');
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) return ollamaResponse(deletePlanContent(targetFile));
      if (callCount === 2) return ollamaResponse('resposta final');
      return ollamaResponse('[]');
    }) as typeof fetch;

    let releaseConfirm: (value: boolean) => void = () => {};
    const confirmGate = new Promise<boolean>((resolve) => {
      releaseConfirm = resolve;
    });
    const confirm = { request: vi.fn(() => confirmGate) };

    try {
      const { cancelInFlightOperation, resolveAskSnapshot } = await import('../src/core-bridge.js');

      const askPromise = resolveAskSnapshot('apague o arquivo', {
        confirm,
        configOverride: baseOverride({
          model: { provider: 'local', model: 'test-model' },
          permissions: { readRoots: [otherDir], writeRoots: [otherDir] },
        }),
      });

      // Drena até a porta injetada ser chamada (plano resolvido, Runtime
      // pausado no `confirm.request` pendente do delete_file).
      await flush();
      expect(confirm.request).toHaveBeenCalledTimes(1);

      const outcome = cancelInFlightOperation();
      expect(outcome).toEqual({ cancelled: true });
      await expect(askPromise).rejects.toThrow('Pergunta cancelada pelo usuário.');

      // A porta injetada responde TRUE só depois do abandono — descartado.
      releaseConfirm(true);
      await flush();

      expect(confirm.request).toHaveBeenCalledTimes(1);
      expect(existsSync(targetFile)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('contenção pegajosa por sessão do ConfirmPort — caminho chat (CA12, cenário A1)', () => {
  it('nega sem abrir diálogo enquanto o turno abandonado da sessão não assentou; volta a delegar normalmente depois', async () => {
    const otherDir = mkdtempSync(join(tmpdir(), 'atlas-desktop-cancel-session-'));
    const targetFile = join(otherDir, 'alvo.txt');
    writeFileSync(targetFile, 'conteúdo');
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    // O gateway `local` captura `globalThis.fetch` na criação da sessão — um
    // único mock estático cobre TODAS as chamadas pelo índice: 1 = plano de
    // T1 (segurado), 2 = composição de T1, 3 = extração de T1, 4 = plano do
    // 2º turno (depois da quarentena cair), 5 = composição, 6+ = extração.
    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return ollamaResponse(deletePlanContent(targetFile));
      }
      if (callCount === 2) return ollamaResponse('resposta final');
      if (callCount === 4) return ollamaResponse(deletePlanContent(targetFile));
      if (callCount === 5) return ollamaResponse('resposta final 2');
      return ollamaResponse('[]');
    }) as typeof fetch;

    const confirm = { request: vi.fn(async () => true) };
    let session: string | undefined;

    try {
      const { cancelInFlightOperation, openChatSession, sendChatTurn } =
        await import('../src/core-bridge.js');

      session = await openChatSession({
        confirm,
        configOverride: baseOverride({
          model: { provider: 'local', model: 'test-model' },
          permissions: { readRoots: [otherDir], writeRoots: [otherDir] },
        }),
      });

      const t1 = sendChatTurn(session, 'apague o arquivo');
      await tick();

      const outcome = cancelInFlightOperation();
      expect(outcome).toEqual({ cancelled: true });
      await expect(t1).rejects.toThrow('Turno cancelado pelo usuário.');

      // T1 segue vivo em segundo plano — quando finalmente pedir consentimento
      // ao chegar no delete_file, a porta da SESSÃO nega sem chamar a
      // injetada, mesmo com `confirm` forçado a responder `true`.
      releaseFirstCall();
      await flush();

      expect(confirm.request).not.toHaveBeenCalled();
      expect(existsSync(targetFile)).toBe(true);

      // Quarentena caiu (T1 assentou) — uma requisição nova volta a ser
      // delegada normalmente à porta injetada.
      const t2 = await sendChatTurn(session, 'apague de novo');
      expect(t2.steps[0]?.ok).toBe(true);
      expect(confirm.request).toHaveBeenCalledTimes(1);
      expect(existsSync(targetFile)).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      if (session !== undefined) {
        await closeChatSessionIfOpen(session);
      }
      rmSync(otherDir, { recursive: true, force: true });
    }
  });
});
