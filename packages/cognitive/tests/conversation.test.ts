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

/** Runtime que roteiriza um ExecutionResult diferente por chamada de execute(). */
function sequencedRuntime(
  tools: { name: string; description: string }[],
  executions: ExecutionResult[],
): Runtime {
  let call = 0;
  return {
    tools: () => tools,
    execute: async () => {
      const result = executions[Math.min(call, executions.length - 1)]!;
      call += 1;
      return result;
    },
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

  it('respond monta [historico, user], chama generate (+ extração) e anexa a resposta', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'oi de volta' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const { reply, conversation } = await core.respond(core.startConversation(), 'oi');

    expect(reply).toBe('oi de volta');
    // SPEC-0020: sem plano, +1 chamada dedicada de extração (Etapa 6) = 2 chamadas.
    expect(calls).toHaveLength(2);
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
    // calls[0]=turno1 (1ª chamada), calls[1]=turno1 (extração), calls[2]=turno2 (1ª chamada)
    expect(calls[2]!.messages).toHaveLength(4);
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

    // plano + composição + extração (SPEC-0020) = 3 chamadas.
    expect(calls).toHaveLength(3);
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
      // Cada respond faz 3 chamadas (plano, composição, extração — SPEC-0020).
      const cycle = ((call - 1) % 3) + 1;
      return cycle === 1
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

describe('createCognitiveCore.respond laço de replanejamento (SPEC-0019/ADR-0015)', () => {
  it('falha de Tool no 1º passe, sucesso no 2º: 1 replan, 2 passes, steps acumulados (3 chamadas)', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
      if (call === 2) return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
      return { text: 'Hoje é 2026-07-19.' };
    });
    const runtime = sequencedRuntime(
      [{ name: 'clock', description: 'hora' }],
      [
        { steps: [{ tool: 'clock', args: {}, result: { ok: false, error: 'indisponível' } }] },
        { steps: [{ tool: 'clock', args: {}, result: { ok: true, output: '2026-07-19' } }] },
      ],
    );
    const core = createCognitiveCore({ gateway, runtime });

    const { reply, steps, conversation } = await core.respond(
      core.startConversation(),
      'que dia é hoje?',
    );

    // plano + replan + composição + extração (SPEC-0020) = 4 chamadas.
    expect(calls).toHaveLength(4);
    expect(reply).toBe('Hoje é 2026-07-19.');
    expect(steps).toEqual([
      { tool: 'clock', args: {}, result: { ok: false, error: 'indisponível' } },
      { tool: 'clock', args: {}, result: { ok: true, output: '2026-07-19' } },
    ]);
    // a mensagem system compacta reflete os passos acumulados dos dois passes
    const summary = conversation.messages.at(-1)!;
    expect(summary.role).toBe('system');
    expect(summary.content).toContain('Tools executadas');
    expect(summary.content).toContain('negada');
    expect(summary.content).toContain('ok');
  });

  it('falha persistente em ambos os passes: para no teto (3 chamadas), compõe, nunca lança', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 3) return { text: 'Não consegui completar a tarefa.' };
      return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: false, error: 'indisponível' } }],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const { reply, steps } = await core.respond(core.startConversation(), 'que dia é hoje?');

    expect(calls).toHaveLength(4);
    expect(reply).toBe('Não consegui completar a tarefa.');
    expect(steps).toHaveLength(2);
    expect(steps!.every((step) => step.result.ok === false)).toBe(true);
  });

  it('replan sem plano (parse → null) cai direto na composição, sem 3º passe de execução', async () => {
    let call = 0;
    let executeCalls = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
      if (call === 2) return { text: 'não sei corrigir o plano' };
      return { text: 'Não consegui obter a hora.' };
    });
    const runtime: Runtime = {
      tools: () => [{ name: 'clock', description: 'hora' }],
      execute: async () => {
        executeCalls += 1;
        return {
          steps: [{ tool: 'clock', args: {}, result: { ok: false, error: 'indisponível' } }],
        };
      },
    };
    const core = createCognitiveCore({ gateway, runtime });

    const { reply, steps } = await core.respond(core.startConversation(), 'que dia é hoje?');

    expect(calls).toHaveLength(4);
    expect(executeCalls).toBe(1);
    expect(reply).toBe('Não consegui obter a hora.');
    expect(steps).toHaveLength(1);
  });

  it('bloqueio de permissão (denialKind blocked) é terminal: 3 chamadas, sem replan', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      return call === 1
        ? { text: '{"steps":[{"tool":"write_file","args":{}}]}' }
        : { text: 'Não posso escrever fora da raiz permitida.' };
    });
    const runtime = runtimeWith([{ name: 'write_file', description: 'escreve' }], {
      steps: [
        {
          tool: 'write_file',
          args: {},
          result: { ok: false, error: 'fora da raiz' },
          denialKind: 'blocked',
        },
      ],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const { steps } = await core.respond(core.startConversation(), 'escreva um arquivo');

    expect(calls).toHaveLength(3);
    expect(steps).toHaveLength(1);
    expect(steps![0]!.denialKind).toBe('blocked');
  });

  it('recusa no confirm (denialKind declined) é terminal: 3 chamadas, sem replan', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      return call === 1
        ? { text: '{"steps":[{"tool":"delete_file","args":{}}]}' }
        : { text: 'Ok, não apaguei o arquivo.' };
    });
    const runtime = runtimeWith([{ name: 'delete_file', description: 'apaga' }], {
      steps: [
        {
          tool: 'delete_file',
          args: {},
          result: { ok: false, error: 'ação cancelada pelo usuário' },
          denialKind: 'declined',
        },
      ],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const { steps } = await core.respond(core.startConversation(), 'apague o arquivo');

    expect(calls).toHaveLength(3);
    expect(steps).toHaveLength(1);
    expect(steps![0]!.denialKind).toBe('declined');
  });

  it('a chamada de replanejamento inclui o resumo compacto das falhas do passe anterior', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
      if (call === 2) return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
      return { text: 'composto' };
    });
    const runtime = sequencedRuntime(
      [{ name: 'clock', description: 'hora' }],
      [
        { steps: [{ tool: 'clock', args: {}, result: { ok: false, error: 'sem rede' } }] },
        { steps: [{ tool: 'clock', args: {}, result: { ok: true, output: 'ok' } }] },
      ],
    );
    const core = createCognitiveCore({ gateway, runtime });

    await core.respond(core.startConversation(), 'que dia é hoje?');

    const replanCall = calls[1]!;
    expect(replanCall.messages.some((m) => m.content.includes('sem rede'))).toBe(true);
    expect(replanCall.messages.some((m) => m.content.includes('clock'))).toBe(true);
  });

  it('respond continua função pura mesmo com replan: mesma entrada, mesma saída (sem vazar estado)', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      // Cada respond faz 4 chamadas (plano, replan, composição, extração — SPEC-0020).
      const cycle = ((call - 1) % 4) + 1;
      if (cycle === 1 || cycle === 2) return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
      return { text: 'composto' };
    });
    const runtime: Runtime = {
      tools: () => [{ name: 'clock', description: 'hora' }],
      execute: async () => ({
        steps: [{ tool: 'clock', args: {}, result: { ok: false, error: 'indisponível' } }],
      }),
    };
    const core = createCognitiveCore({ gateway, runtime });
    const conv0 = core.startConversation();

    const turnA = await core.respond(conv0, 'oi');
    const turnB = await core.respond(conv0, 'oi');

    expect(conv0.messages).toEqual([{ role: 'system', content: TASK_FRAMING }]);
    expect(turnA.conversation.messages).toEqual(turnB.conversation.messages);
  });
});

describe('createCognitiveCore.respond Aprendizado — extração pós-turno (SPEC-0020/ADR-0016)', () => {
  it('sem plano: extração é a 2ª chamada, com o contexto da conversa', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      return call === 1 ? { text: 'Ok, anotado.' } : { text: '["mora em São Paulo"]' };
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const turn = await core.respond(core.startConversation(), 'moro em São Paulo');

    expect(calls).toHaveLength(2);
    expect(turn.reply).toBe('Ok, anotado.');
    expect(turn.learned).toEqual(['mora em São Paulo']);
    const extractionCall = calls[1]!;
    expect(extractionCall.messages.some((m) => m.content.includes('moro em São Paulo'))).toBe(true);
    expect(extractionCall.messages.some((m) => m.content.includes('Ok, anotado.'))).toBe(true);
  });

  it('com plano: extração é a 3ª chamada, após a composição', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
      if (call === 2) return { text: 'Hoje é 2026-07-19.' };
      return { text: '["hoje é 2026-07-19"]' };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: true, output: '2026-07-19' } }],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const turn = await core.respond(core.startConversation(), 'que dia é hoje?');

    expect(calls).toHaveLength(3);
    expect(turn.learned).toEqual(['hoje é 2026-07-19']);
  });

  it('a Conversation retornada não ganha os fatos aprendidos como mensagem', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      return call === 1 ? { text: 'Ok.' } : { text: '["fato aprendido"]' };
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const turn = await core.respond(core.startConversation(), 'oi');

    expect(turn.learned).toEqual(['fato aprendido']);
    expect(turn.conversation.messages.some((m) => m.content.includes('fato aprendido'))).toBe(
      false,
    );
  });

  it('robustez: extração que lança não derruba o turno; learned ausente', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: 'resposta normal' };
      throw new Error('modelo indisponível na extração');
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const turn = await core.respond(core.startConversation(), 'oi');

    expect(turn.reply).toBe('resposta normal');
    expect(turn.learned).toBeUndefined();
  });

  it('robustez: extração com saída inválida (não-JSON) → learned ausente, turno intacto', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      return call === 1 ? { text: 'resposta normal' } : { text: 'não há JSON aqui' };
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const turn = await core.respond(core.startConversation(), 'oi');

    expect(turn.reply).toBe('resposta normal');
    expect(turn.learned).toBeUndefined();
  });
});
