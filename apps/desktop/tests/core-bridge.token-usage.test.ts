import { describe, expect, it, vi } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import { useTmpDir } from './helpers/core-bridge-harness.js';

// SPEC-0054 (CA16-21): pontos de soma/reset do consumo de tokens no
// `core-bridge`, exercitados de ponta a ponta pelo provider `fake`
// (determinístico) e, para o caso de cancelamento, pelo provider `local`
// (Ollama) com `fetch` mocado.

const { baseOverride } = useTmpDir();

async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timeout aguardando condição em waitUntil');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function ollamaResponse(content: string, usage: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ message: { content }, ...usage }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('readTokenUsage / resolveAskSnapshot — soma e acumulação (CA18)', () => {
  it('resolveAskSnapshot soma o usage do turno; readTokenUsage reflete sem subir Core; um 2º turno acumula sobre o 1º', async () => {
    const { resolveAskSnapshot, readTokenUsage, __resetBridgeStateForTests } =
      await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    expect(readTokenUsage()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reportedTurns: 0,
      unreportedTurns: 0,
    });

    await resolveAskSnapshot('oi', { configOverride: baseOverride() });
    const after1 = readTokenUsage();
    expect(after1.reportedTurns).toBe(1);
    expect(after1.unreportedTurns).toBe(0);
    expect(after1.totalTokens).toBeGreaterThan(0);

    await resolveAskSnapshot('oi', { configOverride: baseOverride() });
    const after2 = readTokenUsage();
    // Mesma entrada ⇒ o provider `fake` é determinístico ⇒ dobra exatamente.
    expect(after2.reportedTurns).toBe(2);
    expect(after2.promptTokens).toBe(after1.promptTokens * 2);
    expect(after2.completionTokens).toBe(after1.completionTokens * 2);
    expect(after2.totalTokens).toBe(after1.totalTokens * 2);
  });
});

describe('sendChatTurn — soma e acumulação entre turnos (CA18)', () => {
  it('cada turno soma sobre o acumulado; readTokenUsage reflete sem subir Core', async () => {
    const {
      openChatSession,
      sendChatTurn,
      closeChatSession,
      readTokenUsage,
      __resetBridgeStateForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    const session = await openChatSession({ configOverride: baseOverride() });
    try {
      await sendChatTurn(session, 'oi');
      const after1 = readTokenUsage();
      expect(after1.reportedTurns).toBe(1);
      expect(after1.totalTokens).toBeGreaterThan(0);

      await sendChatTurn(session, 'oi de novo');
      const after2 = readTokenUsage();
      expect(after2.reportedTurns).toBe(2);
      expect(after2.totalTokens).toBeGreaterThan(after1.totalTokens);
    } finally {
      await closeChatSession(session);
    }
  });
});

describe('operação que lança não contabiliza nada (CA19)', () => {
  it('resolveAskSnapshot: falha do gateway na chamada de ask não soma usage', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error('rede caiu');
    }) as typeof fetch;
    try {
      const { resolveAskSnapshot, readTokenUsage, __resetBridgeStateForTests } =
        await import('../src/core-bridge.js');
      __resetBridgeStateForTests();
      await expect(
        resolveAskSnapshot('oi', {
          configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
        }),
      ).rejects.toThrow();
      expect(readTokenUsage()).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        reportedTurns: 0,
        unreportedTurns: 0,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('resolveAskSnapshot: config inválida (nenhum resultado) não soma usage', async () => {
    const { resolveAskSnapshot, readTokenUsage, __resetBridgeStateForTests } =
      await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    await expect(
      resolveAskSnapshot('oi', { configOverride: baseOverride({ dataDir: '' }) }),
    ).rejects.toBeInstanceOf(InvalidConfigError);
    expect(readTokenUsage().reportedTurns).toBe(0);
    expect(readTokenUsage().unreportedTurns).toBe(0);
  });
});

describe('operação cancelada/abandonada contabiliza o consumo, sem efeitos de domínio (CA19)', () => {
  it('resolveAskSnapshot: ask abandonado que assenta com resultado soma usage, sem chamar remember (learned não observável aqui, mas o desfecho é o AskSnapshot vazio já coberto por SPEC-0051)', async () => {
    const originalFetch = globalThis.fetch;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return ollamaResponse('oi, tudo bem?', { prompt_eval_count: 10, eval_count: 5 });
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    try {
      const {
        cancelInFlightOperation,
        resolveAskSnapshot,
        readTokenUsage,
        __resetBridgeStateForTests,
      } = await import('../src/core-bridge.js');
      __resetBridgeStateForTests();

      const firstAsk = resolveAskSnapshot('oi', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(cancelInFlightOperation()).toEqual({ cancelled: true });
      await expect(firstAsk).rejects.toThrow('Pergunta cancelada pelo usuário.');
      // Ainda não assentou: nada contabilizado até aqui.
      expect(readTokenUsage().reportedTurns).toBe(0);

      releaseFirstCall();
      await waitUntil(() => readTokenUsage().reportedTurns > 0);

      const snapshot = readTokenUsage();
      expect(snapshot.reportedTurns).toBe(1);
      expect(snapshot.promptTokens).toBe(10);
      expect(snapshot.completionTokens).toBe(5);
      expect(snapshot.totalTokens).toBe(15);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('reset em openChatSession / __resetBridgeStateForTests (CA20)', () => {
  it('openChatSession bem-sucedida zera; abertura que falha não zera; __resetBridgeStateForTests zera', async () => {
    const {
      resolveAskSnapshot,
      openChatSession,
      closeChatSession,
      readTokenUsage,
      __resetBridgeStateForTests,
    } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();

    await resolveAskSnapshot('oi', { configOverride: baseOverride() });
    expect(readTokenUsage().reportedTurns).toBe(1);

    await expect(
      openChatSession({ configOverride: baseOverride({ dataDir: '' }) }),
    ).rejects.toBeInstanceOf(InvalidConfigError);
    expect(readTokenUsage().reportedTurns).toBe(1);

    const session = await openChatSession({ configOverride: baseOverride() });
    try {
      expect(readTokenUsage()).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        reportedTurns: 0,
        unreportedTurns: 0,
      });
    } finally {
      await closeChatSession(session);
    }

    await resolveAskSnapshot('oi', { configOverride: baseOverride() });
    expect(readTokenUsage().reportedTurns).toBe(1);

    __resetBridgeStateForTests();
    expect(readTokenUsage()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reportedTurns: 0,
      unreportedTurns: 0,
    });
  });
});

describe('AskSnapshot/TurnSnapshot não ganham usage (CA21)', () => {
  it('AskSnapshot mantém exatamente text/steps/learned', async () => {
    const { resolveAskSnapshot, __resetBridgeStateForTests } =
      await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    const snapshot = await resolveAskSnapshot('oi', { configOverride: baseOverride() });
    expect(Object.keys(snapshot).sort()).toEqual(['learned', 'steps', 'text']);
  });

  it('TurnSnapshot mantém exatamente reply/steps/learned', async () => {
    const { openChatSession, sendChatTurn, closeChatSession, __resetBridgeStateForTests } =
      await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    const session = await openChatSession({ configOverride: baseOverride() });
    try {
      const turn = await sendChatTurn(session, 'oi');
      expect(Object.keys(turn).sort()).toEqual(['learned', 'reply', 'steps']);
    } finally {
      await closeChatSession(session);
    }
  });
});
