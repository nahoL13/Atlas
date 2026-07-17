import { describe, expect, it } from 'vitest';
import type {
  ExecutionResult,
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  Runtime,
} from '@atlas/contracts';
import { createCognitiveCore, TASK_FRAMING } from '../src/index.js';

function stubGateway(impl: (request: GenerateRequest) => Promise<GenerateResult>): {
  gateway: ModelGateway;
  calls: GenerateRequest[];
} {
  const calls: GenerateRequest[] = [];
  return {
    gateway: {
      async generate(request) {
        calls.push(request);
        return impl(request);
      },
    },
    calls,
  };
}

// A conversa (respond/startConversation) sem Tools não usa o runtime; um runtime vazio basta.
const emptyRuntime: Runtime = {
  tools: () => [],
  execute: async () => ({ steps: [] }),
};

function runtimeWith(
  tools: { name: string; description: string }[],
  execution: ExecutionResult,
): Runtime {
  return {
    tools: () => tools,
    execute: async () => execution,
  };
}

describe('createCognitiveCore conversa', () => {
  it('startConversation semeia o system prompt de tarefa (sem persona)', () => {
    const { gateway } = stubGateway(async () => ({ text: '' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });
    const conv = core.startConversation();
    expect(conv.messages).toEqual([{ role: 'system', content: TASK_FRAMING }]);
  });

  it('startConversation semeia identidade + tarefa quando há personaPrompt', () => {
    const { gateway } = stubGateway(async () => ({ text: '' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      personaPrompt: 'Você é Jarvis.',
    });
    const conv = core.startConversation();
    expect(conv.messages).toEqual([
      { role: 'system', content: `Você é Jarvis.\n\n${TASK_FRAMING}` },
    ]);
  });

  it('respond monta [historico, user], chama generate uma vez e anexa a resposta', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'oi de volta' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const { reply, conversation } = await core.respond(core.startConversation(), 'oi');

    expect(reply).toBe('oi de volta');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'oi' },
    ]);
    expect(conversation.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'oi de volta' },
    ]);
  });

  it('respond é pura: não muta a conversa de entrada', async () => {
    const { gateway } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });
    const conv0 = core.startConversation();
    await core.respond(conv0, 'oi');
    expect(conv0.messages).toEqual([{ role: 'system', content: TASK_FRAMING }]);
  });

  it('multi-turno acumula o histórico', async () => {
    const { gateway, calls } = stubGateway(async (req) => ({
      text: `resp:${req.messages.at(-1)!.content}`,
    }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });
    const turn1 = await core.respond(core.startConversation(), 'primeira');
    const turn2 = await core.respond(turn1.conversation, 'segunda');
    expect(turn2.conversation.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'primeira' },
      { role: 'assistant', content: 'resp:primeira' },
      { role: 'user', content: 'segunda' },
      { role: 'assistant', content: 'resp:segunda' },
    ]);
    expect(calls[1]!.messages).toHaveLength(4);
  });

  it('propaga erro do gateway em respond', async () => {
    const { gateway } = stubGateway(async () => {
      throw new Error('modelo indisponível');
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });
    await expect(core.respond(core.startConversation(), 'oi')).rejects.toThrow(
      'modelo indisponível',
    );
  });
});

describe('createCognitiveCore.respond orquestra Planejamento + Execução (SPEC-0014)', () => {
  it('quando o modelo emite um plano, executa via runtime e compõe a resposta com os resultados', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      return call === 1
        ? { text: '{"steps":[{"tool":"clock","args":{}}]}' }
        : { text: 'Hoje é 2026-07-17.' };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: true, output: '2026-07-17' } }],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const { reply, steps } = await core.respond(core.startConversation(), 'que dia é hoje?');

    expect(calls).toHaveLength(2);
    expect(reply).toBe('Hoje é 2026-07-17.');
    expect(steps).toEqual([
      { tool: 'clock', args: {}, result: { ok: true, output: '2026-07-17' } },
    ]);
    // a 1ª chamada leva a instrução de planejamento e termina no turno do usuário
    expect(calls[0]!.messages.some((m) => m.content.includes('clock'))).toBe(true);
    expect(calls[0]!.messages.at(-1)).toEqual({ role: 'user', content: 'que dia é hoje?' });
    // a 2ª chamada (composição) leva os resultados
    expect(calls[1]!.messages.at(-1)!.content).toContain('2026-07-17');
  });

  it('a conversa retornada tem a mensagem assistant e um resumo system compacto dos passos', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      return call === 1
        ? { text: '{"steps":[{"tool":"delete_file","args":{"path":"x.txt"}}]}' }
        : { text: 'Não consegui apagar o arquivo.' };
    });
    const runtime = runtimeWith([{ name: 'delete_file', description: 'apaga um arquivo' }], {
      steps: [
        {
          tool: 'delete_file',
          args: { path: 'x.txt' },
          result: { ok: false, error: 'ação cancelada pelo usuário' },
        },
      ],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const { conversation, steps } = await core.respond(core.startConversation(), 'apague x.txt');

    expect(steps![0]!.result.ok).toBe(false);
    const last3 = conversation.messages.slice(-3);
    expect(last3[0]).toEqual({ role: 'user', content: 'apague x.txt' });
    expect(last3[1]).toEqual({ role: 'assistant', content: 'Não consegui apagar o arquivo.' });
    expect(last3[2]!.role).toBe('system');
    expect(last3[2]!.content).toContain('Tools executadas');
    expect(last3[2]!.content).toContain('delete_file');
    expect(last3[2]!.content).toContain('negada');
  });

  it('sem Tools executadas, nenhuma mensagem system extra é acrescentada', async () => {
    const { gateway } = stubGateway(async () => ({ text: 'resposta comum, sem plano' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const { conversation, steps } = await core.respond(core.startConversation(), 'oi');

    expect(steps).toBeUndefined();
    expect(conversation.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'resposta comum, sem plano',
    });
  });

  it('respond é pura: duas chamadas com a mesma entrada não vazam estado', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      return call % 2 === 1
        ? { text: '{"steps":[{"tool":"clock","args":{}}]}' }
        : { text: 'composto' };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: true, output: 'x' } }],
    });
    const core = createCognitiveCore({ gateway, runtime });
    const conv0 = core.startConversation();

    const turnA = await core.respond(conv0, 'oi');
    const turnB = await core.respond(conv0, 'oi');

    expect(conv0.messages).toEqual([{ role: 'system', content: TASK_FRAMING }]);
    expect(turnA.conversation.messages).toEqual(turnB.conversation.messages);
  });
});
