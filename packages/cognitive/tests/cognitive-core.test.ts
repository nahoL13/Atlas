import { describe, expect, it } from 'vitest';
import type {
  Conversation,
  ExecutionResult,
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  Runtime,
} from '@atlas/contracts';
import { createCognitiveCore, TASK_FRAMING } from '../src/index.js';

/** Provider fake de memória (SPEC-0021): conta invocações num contador
 * mutável e devolve o último valor da lista uma vez esgotada (roteirizando
 * mudança entre chamadas). */
function memoryProviderFake(...values: string[]): {
  provider: () => string | undefined;
  counter: { calls: number };
} {
  const counter = { calls: 0 };
  const provider = () => {
    counter.calls += 1;
    return values[Math.min(counter.calls - 1, values.length - 1)];
  };
  return { provider, counter };
}

function memoryProviderArgsFake(value: string): {
  provider: (query: string, limit: number) => string | undefined;
  calls: { query: string; limit: number }[];
} {
  const calls: { query: string; limit: number }[] = [];
  const provider = (query: string, limit: number) => {
    calls.push({ query, limit });
    return value;
  };
  return { provider, calls };
}

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

describe('createCognitiveCore.ask', () => {
  it('sem personaPrompt e sem Tools usa só o enquadramento de tarefa (1ª chamada + extração)', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'resposta do modelo' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('resuma este texto');

    expect(answer.text).toBe('resposta do modelo');
    expect(answer.steps).toBeUndefined();
    // SPEC-0020: sem plano, +1 chamada dedicada de extração (Etapa 6) = 2 chamadas.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'resuma este texto' },
    ]);
  });

  it('com personaPrompt compõe identidade + tarefa no system message', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      personaPrompt: 'Você é Jarvis.',
    });

    await core.ask('oi');

    expect(calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: `Você é Jarvis.\n\n${TASK_FRAMING}`,
    });
  });

  it('com memoryPrompt inclui o bloco de memória entre identidade e tarefa', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      personaPrompt: 'Você é Jarvis.',
      memoryPrompt: () => 'Fatos: o nome do usuário é Lohan.',
    });

    await core.ask('oi');

    expect(calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: `Você é Jarvis.\n\nFatos: o nome do usuário é Lohan.\n\n${TASK_FRAMING}`,
    });
  });

  it('com memoryPrompt e sem personaPrompt compõe memória + tarefa', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      memoryPrompt: () => 'Fatos: X.',
    });

    await core.ask('oi');

    expect(calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: `Fatos: X.\n\n${TASK_FRAMING}`,
    });
  });

  it('quando o modelo emite um plano, executa e compõe a resposta com os resultados', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      return call === 1
        ? { text: '{"steps":[{"tool":"clock","args":{}}]}' }
        : { text: 'Hoje é 2026-07-14.' };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: true, output: '2026-07-14' } }],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const answer = await core.ask('que dia é hoje?');

    // plano + composição + extração (SPEC-0020) = 3 chamadas.
    expect(calls).toHaveLength(3);
    expect(answer.text).toBe('Hoje é 2026-07-14.');
    expect(answer.steps).toEqual([
      { tool: 'clock', args: {}, result: { ok: true, output: '2026-07-14' } },
    ]);
    // o resultado da Tool é injetado na 2ª chamada (composição)
    expect(calls[1]!.messages.at(-1)!.content).toContain('2026-07-14');
    // a 1ª chamada leva a instrução de planejamento no system
    expect(calls[0]!.messages[0]!.content).toContain('clock');
  });

  it('falha de Tool aparece na composição sem derrubar o ask', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      return call === 1
        ? { text: '{"steps":[{"tool":"clock","args":{}}]}' }
        : { text: 'Não consegui obter a hora.' };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: false, error: 'falhou' } }],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const answer = await core.ask('que horas são?');

    expect(answer.text).toBe('Não consegui obter a hora.');
    expect(answer.steps![0]!.result.ok).toBe(false);
    expect(calls[1]!.messages.at(-1)!.content).toContain('ERRO');
  });

  it('propaga erro do gateway sem mascarar', async () => {
    const { gateway } = stubGateway(async () => {
      throw new Error('modelo indisponível');
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    await expect(core.ask('oi')).rejects.toThrow('modelo indisponível');
  });
});

describe('createCognitiveCore.ask laço de replanejamento (SPEC-0019/ADR-0015)', () => {
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

    const answer = await core.ask('que dia é hoje?');

    // plano + replan + composição + extração (SPEC-0020) = 4 chamadas.
    expect(calls).toHaveLength(4);
    expect(answer.text).toBe('Hoje é 2026-07-19.');
    expect(answer.steps).toEqual([
      { tool: 'clock', args: {}, result: { ok: false, error: 'indisponível' } },
      { tool: 'clock', args: {}, result: { ok: true, output: '2026-07-19' } },
    ]);
  });

  it('falha persistente em ambos os passes: para no teto (4 chamadas), compõe, nunca lança', async () => {
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

    const answer = await core.ask('que dia é hoje?');

    expect(calls).toHaveLength(4);
    expect(answer.text).toBe('Não consegui completar a tarefa.');
    expect(answer.steps).toHaveLength(2);
    expect(answer.steps!.every((step) => step.result.ok === false)).toBe(true);
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

    const answer = await core.ask('que dia é hoje?');

    expect(calls).toHaveLength(4);
    expect(executeCalls).toBe(1);
    expect(answer.text).toBe('Não consegui obter a hora.');
    expect(answer.steps).toHaveLength(1);
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

    const answer = await core.ask('escreva um arquivo');

    expect(calls).toHaveLength(3);
    expect(answer.steps).toHaveLength(1);
    expect(answer.steps![0]!.denialKind).toBe('blocked');
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

    const answer = await core.ask('apague o arquivo');

    expect(calls).toHaveLength(3);
    expect(answer.steps).toHaveLength(1);
    expect(answer.steps![0]!.denialKind).toBe('declined');
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

    await core.ask('que dia é hoje?');

    const replanCall = calls[1]!;
    expect(replanCall.messages.some((m) => m.content.includes('sem rede'))).toBe(true);
    expect(replanCall.messages.some((m) => m.content.includes('clock'))).toBe(true);
  });
});

describe('createCognitiveCore.ask Aprendizado — extração pós-turno (SPEC-0020/ADR-0016)', () => {
  it('sem plano: extração é a 2ª chamada, feita após a resposta direta, com instrução + input + resposta', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      return call === 1
        ? { text: 'Prefiro café sem açúcar.' }
        : { text: '["prefere café sem açúcar"]' };
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('anote que prefiro café sem açúcar');

    expect(calls).toHaveLength(2);
    expect(answer.text).toBe('Prefiro café sem açúcar.');
    expect(answer.learned).toEqual(['prefere café sem açúcar']);
    const extractionCall = calls[1]!;
    expect(extractionCall.messages.some((m) => m.content.includes('JSON'))).toBe(true);
    expect(extractionCall.messages.some((m) => m.content.includes('anote que prefiro'))).toBe(true);
    expect(
      extractionCall.messages.some((m) => m.content.includes('Prefiro café sem açúcar.')),
    ).toBe(true);
  });

  it('com plano: extração é a 3ª chamada, feita após a composição', async () => {
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

    const answer = await core.ask('que dia é hoje?');

    expect(calls).toHaveLength(3);
    expect(answer.learned).toEqual(['hoje é 2026-07-19']);
  });

  it('extração vazia (JSON array vazio) → learned ausente', async () => {
    const { gateway } = stubGateway(async () => ({ text: '[]' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('oi');

    expect(answer.learned).toBeUndefined();
  });

  it('robustez: extração que lança não derruba o turno; learned ausente', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: 'resposta normal' };
      throw new Error('modelo indisponível na extração');
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('oi');

    expect(answer.text).toBe('resposta normal');
    expect(answer.learned).toBeUndefined();
  });

  it('robustez: extração com saída inválida (não-JSON) → learned ausente, turno intacto', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      return call === 1 ? { text: 'resposta normal' } : { text: 'não há JSON aqui' };
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('oi');

    expect(answer.text).toBe('resposta normal');
    expect(answer.learned).toBeUndefined();
  });

  it('Cognitive não grava: CognitiveCoreDeps não recebe porta de escrita (sem mock de Memory)', async () => {
    const { gateway } = stubGateway(async () => ({ text: '["algum fato"]' }));
    // Nenhum objeto de Memory é injetado — apenas gateway/runtime/prompts.
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('oi');

    // O candidato é devolvido como dado; quem grava é a borda, nunca o Cognitive.
    expect(answer.learned).toEqual(['algum fato']);
  });
});

describe('createCognitiveCore — recomposição ao vivo do memoryPrompt por turno (SPEC-0021)', () => {
  it('amostragem única por turno em ask: provider chamado 1x mesmo com plano + replan + composição + extração', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
      if (call === 2) return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
      if (call === 3) return { text: 'Hoje é 2026-07-20.' };
      return { text: '[]' };
    });
    const runtime = sequencedRuntime(
      [{ name: 'clock', description: 'hora' }],
      [
        { steps: [{ tool: 'clock', args: {}, result: { ok: false, error: 'indisponível' } }] },
        { steps: [{ tool: 'clock', args: {}, result: { ok: true, output: '2026-07-20' } }] },
      ],
    );
    const { provider, counter } = memoryProviderFake('Fatos: X.');
    const core = createCognitiveCore({ gateway, runtime, memoryPrompt: provider });

    await core.ask('que dia é hoje?');

    expect(counter.calls).toBe(1);
  });

  it('amostragem única por turno em respond: provider chamado 1x mesmo com plano + composição + extração', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: '{"steps":[{"tool":"clock","args":{}}]}' };
      if (call === 2) return { text: 'Hoje é 2026-07-20.' };
      return { text: '[]' };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: true, output: '2026-07-20' } }],
    });
    const { provider, counter } = memoryProviderFake('Fatos: X.');
    const core = createCognitiveCore({ gateway, runtime, memoryPrompt: provider });
    const conversation = core.startConversation();
    counter.calls = 0; // isola a amostragem de startConversation da amostragem de respond

    await core.respond(conversation, 'que dia é hoje?');

    expect(counter.calls).toBe(1);
  });

  it('recomposição por turno em ask: valor novo aparece no planejamento do ask seguinte', async () => {
    const { gateway, calls: genCalls } = stubGateway(async () => ({ text: 'resposta' }));
    let value = 'Fatos: primeiro.';
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime, memoryPrompt: () => value });

    await core.ask('oi');
    expect(genCalls[0]!.messages[0]!.content).toContain('Fatos: primeiro.');

    value = 'Fatos: segundo.';
    await core.ask('oi de novo');

    // sem plano: 2 chamadas por turno (planejamento + extração) — a 3ª
    // chamada geral é o planejamento do 2º turno.
    expect(genCalls[2]!.messages[0]!.content).toContain('Fatos: segundo.');
    expect(genCalls[2]!.messages[0]!.content).not.toContain('Fatos: primeiro.');
  });

  it('recomposição por turno em respond: reflete tanto no enviado ao modelo quanto na Conversation retornada', async () => {
    const { gateway, calls: genCalls } = stubGateway(async () => ({ text: 'resposta' }));
    let value = 'Fatos: primeiro.';
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime, memoryPrompt: () => value });
    const conversation = core.startConversation();
    expect(conversation.messages[0]!.content).toContain('Fatos: primeiro.');

    const turn1 = await core.respond(conversation, 'oi');
    expect(genCalls[0]!.messages[0]!.content).toContain('Fatos: primeiro.');
    expect(turn1.conversation.messages[0]!.content).toContain('Fatos: primeiro.');

    value = 'Fatos: segundo.';
    const turn2 = await core.respond(turn1.conversation, 'oi de novo');

    // sem plano: 2 chamadas por respond (planejamento + extração) — a
    // chamada de planejamento do 2º respond é a 3ª chamada geral (índice 2).
    expect(genCalls[2]!.messages[0]!.content).toContain('Fatos: segundo.');
    expect(genCalls[2]!.messages[0]!.content).not.toContain('Fatos: primeiro.');
    expect(turn2.conversation.messages[0]!.content).toContain('Fatos: segundo.');
    expect(turn2.conversation.messages[0]!.content).not.toContain('Fatos: primeiro.');
  });

  it('fallback sem cabeça system: respond insere uma mensagem system no topo (índice 0)', async () => {
    const { gateway, calls: genCalls } = stubGateway(async () => ({ text: 'resposta' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      memoryPrompt: () => 'Fatos: X.',
    });
    const conversationSemSystem: Conversation = {
      messages: [{ role: 'user', content: 'oi antes' }],
    };

    const turn = await core.respond(conversationSemSystem, 'oi agora');

    expect(genCalls[0]!.messages[0]!.role).toBe('system');
    expect(genCalls[0]!.messages[0]!.content).toContain('Fatos: X.');
    expect(genCalls[0]!.messages[1]).toEqual({ role: 'user', content: 'oi antes' });
    expect(turn.conversation.messages[0]!.role).toBe('system');
    expect(turn.conversation.messages[0]!.content).toContain('Fatos: X.');
    expect(turn.conversation.messages[1]).toEqual({ role: 'user', content: 'oi antes' });
  });

  it('startConversation usa o valor do provider no instante da criação', () => {
    const { gateway } = stubGateway(async () => ({ text: 'x' }));
    const value = 'Fatos: A.';
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime, memoryPrompt: () => value });

    const conversation = core.startConversation();

    expect(conversation.messages[0]!.content).toContain('Fatos: A.');
  });

  it('respond continua puro: mesmas entradas → mesma saída (sem estado mutável no Core)', async () => {
    const { gateway } = stubGateway(async () => ({ text: '[]' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      memoryPrompt: () => 'Fatos: X.',
    });
    const conversation = core.startConversation();

    const turn1 = await core.respond(conversation, 'oi');
    const turn2 = await core.respond(conversation, 'oi');

    expect(turn1).toEqual(turn2);
  });

  it('personaPrompt continua estático: o provider de memória não afeta a fatia de identidade', async () => {
    const { gateway, calls: genCalls } = stubGateway(async () => ({ text: 'x' }));
    let value = 'Fatos: A.';
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      personaPrompt: 'Você é Jarvis.',
      memoryPrompt: () => value,
    });

    await core.ask('oi');
    value = 'Fatos: B.';
    await core.ask('oi de novo');

    expect(genCalls[0]!.messages[0]!.content).toContain('Você é Jarvis.');
    expect(genCalls[2]!.messages[0]!.content).toContain('Você é Jarvis.');
  });

  it('extração (ask) vê os fatos conhecidos e é instruída a não re-propor, sem afrouxar o Artigo 13', async () => {
    let call = 0;
    const { gateway, calls: genCalls } = stubGateway(async () => {
      call += 1;
      return call === 1 ? { text: 'resposta' } : { text: '[]' };
    });
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      memoryPrompt: () => 'Fatos: o nome do usuário é Lohan.',
    });

    await core.ask('oi');

    const extractionCall = genCalls[1]!;
    expect(extractionCall.messages[0]!.content).toContain('Fatos: o nome do usuário é Lohan.');
    expect(extractionCall.messages[0]!.content).toMatch(/NÃO reproponha/i);
    expect(extractionCall.messages[0]!.content).toContain(
      'NUNCA infira, deduza ou invente fatos que o usuário não disse',
    );
  });

  it('extração (respond) vê os fatos conhecidos e é instruída a não re-propor', async () => {
    let call = 0;
    const { gateway, calls: genCalls } = stubGateway(async () => {
      call += 1;
      return call === 1 ? { text: 'resposta' } : { text: '[]' };
    });
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      memoryPrompt: () => 'Fatos: prefere café sem açúcar.',
    });
    const conversation = core.startConversation();

    await core.respond(conversation, 'oi');

    const extractionCall = genCalls[1]!;
    expect(
      extractionCall.messages.some((m) => m.content.includes('Fatos: prefere café sem açúcar.')),
    ).toBe(true);
    expect(extractionCall.messages.some((m) => /NÃO reproponha/i.test(m.content))).toBe(true);
  });

  it('sem memoryPrompt injetado: extração não menciona fatos conhecidos (comportamento pré-SPEC-0021 preservado)', async () => {
    let call = 0;
    const { gateway, calls: genCalls } = stubGateway(async () => {
      call += 1;
      return call === 1 ? { text: 'resposta' } : { text: '[]' };
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    await core.ask('oi');

    const extractionCall = genCalls[1]!;
    expect(extractionCall.messages[0]!.content).not.toContain('Fatos já conhecidos');
    expect(extractionCall.messages[0]!.content).not.toMatch(/NÃO reproponha/i);
  });
});

describe('createCognitiveCore — injeção de memória guiada pela consulta do turno (SPEC-0030)', () => {
  const MEMORY_RECALL_LIMIT = 20;

  it('ask: provider recebe o objective como query e MEMORY_RECALL_LIMIT como limit', async () => {
    const { gateway } = stubGateway(async () => ({ text: '[]' }));
    const { provider, calls } = memoryProviderArgsFake('Fatos: X.');
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime, memoryPrompt: provider });

    await core.ask('qual é a capital do Brasil?');

    expect(calls).toEqual([{ query: 'qual é a capital do Brasil?', limit: MEMORY_RECALL_LIMIT }]);
  });

  it('respond: provider recebe o input do turno corrente como query (não o histórico)', async () => {
    const { gateway } = stubGateway(async () => ({ text: '[]' }));
    const { provider, calls } = memoryProviderArgsFake('Fatos: X.');
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime, memoryPrompt: provider });
    const conversation = core.startConversation();
    calls.length = 0; // isola a amostragem de startConversation da de respond

    await core.respond(conversation, 'e a da Argentina?');

    expect(calls).toEqual([{ query: 'e a da Argentina?', limit: MEMORY_RECALL_LIMIT }]);
  });

  it('startConversation: provider recebe query vazia e MEMORY_RECALL_LIMIT', () => {
    const { gateway } = stubGateway(async () => ({ text: 'x' }));
    const { provider, calls } = memoryProviderArgsFake('Fatos: X.');
    createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      memoryPrompt: provider,
    }).startConversation();

    expect(calls).toEqual([{ query: '', limit: MEMORY_RECALL_LIMIT }]);
  });

  it('contagens de generate inalteradas: sem plano → 2 chamadas por ask', async () => {
    const { gateway, calls: genCalls } = stubGateway(async () => ({ text: 'resposta' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      memoryPrompt: () => 'Fatos: X.',
    });

    await core.ask('oi');

    expect(genCalls).toHaveLength(2);
  });

  it('provider ausente: comportamento idêntico ao de hoje, nenhuma fatia de memória, nada lança', async () => {
    const { gateway, calls: genCalls } = stubGateway(async () => ({ text: 'resposta' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('oi');

    expect(answer.text).toBe('resposta');
    expect(genCalls[0]!.messages[0]!.content).not.toContain('Fatos');
  });

  it('providers de aridade zero (pré-SPEC-0030) seguem válidos sem reescrita — migração opcional', async () => {
    const { gateway } = stubGateway(async () => ({ text: 'resposta' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      memoryPrompt: () => 'Fatos: legado.',
    });

    const answer = await core.ask('oi');

    expect(answer.text).toBe('resposta');
  });
});

describe('createCognitiveCore — consumo de Skills no laço cognitivo (SPEC-0026/ADR-0018)', () => {
  const skillDescriptor = {
    id: 'skill-summarize-text',
    name: 'Resumir texto',
    description: 'resume um texto longo em pontos-chave',
    scope: 'permanent' as const,
    version: '1.0.0',
    active: true,
  };
  const skill = {
    id: 'skill-summarize-text',
    name: 'Resumir texto',
    description: 'resume um texto longo em pontos-chave',
    instructions: 'Sempre resuma em até 3 bullets objetivos.',
    toolIds: ['read_file'],
    scope: 'permanent' as const,
    version: '1.0.0',
  };

  function skillCatalogFake(skills: (typeof skill)[]) {
    return {
      list: () => skills.map((s) => ({ ...skillDescriptor, id: s.id, name: s.name })),
      get: (id: string) => skills.find((s) => s.id === id),
    };
  }

  const runtimeWithReadFile = runtimeWith([{ name: 'read_file', description: 'lê arquivo' }], {
    steps: [{ tool: 'read_file', args: {}, result: { ok: true, output: 'conteúdo do arquivo' } }],
  });

  it('ask: quando o modelo seleciona um skillId que resolve, a composição recebe as instructions da Skill', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return {
          text: '{"steps":[{"tool":"read_file","args":{}}],"skillId":"skill-summarize-text"}',
        };
      }
      return { text: 'resumo composto' };
    });
    const core = createCognitiveCore({
      gateway,
      runtime: runtimeWithReadFile,
      skillCatalog: skillCatalogFake([skill]),
    });

    const answer = await core.ask('resuma o arquivo x.txt');

    expect(answer.text).toBe('resumo composto');
    // 1ª chamada leva a instrução do Planner com o catálogo de Skills
    expect(calls[0]!.messages[0]!.content).toContain('skill-summarize-text');
    // a composição (2ª chamada) contém as instructions da Skill selecionada
    expect(calls[1]!.messages[0]!.content).toContain('Sempre resuma em até 3 bullets objetivos.');
  });

  it('ask: skillId inexistente é ignorado, turno completa sem injeção e sem lançar', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return { text: '{"steps":[{"tool":"read_file","args":{}}],"skillId":"skill-inexistente"}' };
      }
      return { text: 'resumo composto' };
    });
    const core = createCognitiveCore({
      gateway,
      runtime: runtimeWithReadFile,
      skillCatalog: skillCatalogFake([skill]),
    });

    const answer = await core.ask('resuma o arquivo x.txt');

    expect(answer.text).toBe('resumo composto');
    expect(calls[1]!.messages[0]!.content).not.toContain('Sempre resuma em até 3 bullets');
  });

  it('ask: sem skillId no plano, turno completa sem injeção', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: '{"steps":[{"tool":"read_file","args":{}}]}' };
      return { text: 'resumo composto' };
    });
    const core = createCognitiveCore({
      gateway,
      runtime: runtimeWithReadFile,
      skillCatalog: skillCatalogFake([skill]),
    });

    await core.ask('resuma o arquivo x.txt');

    expect(calls[1]!.messages[0]!.content).not.toContain('Sempre resuma em até 3 bullets');
  });

  it('ask: sem porta de Skills, Planner recebe catálogo vazio e comportamento é o de hoje', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: '{"steps":[{"tool":"read_file","args":{}}]}' };
      return { text: 'resumo composto' };
    });
    const core = createCognitiveCore({ gateway, runtime: runtimeWithReadFile });

    await core.ask('resuma o arquivo x.txt');

    expect(calls[0]!.messages[0]!.content).not.toContain('skillId');
  });

  it('respond: skillId resolvido injeta instructions só na chamada de composição, não na Conversation retornada', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return {
          text: '{"steps":[{"tool":"read_file","args":{}}],"skillId":"skill-summarize-text"}',
        };
      }
      return { text: 'resumo composto' };
    });
    const core = createCognitiveCore({
      gateway,
      runtime: runtimeWithReadFile,
      skillCatalog: skillCatalogFake([skill]),
    });
    const conversation = core.startConversation();

    const turn = await core.respond(conversation, 'resuma o arquivo x.txt');

    expect(turn.reply).toBe('resumo composto');
    expect(
      calls[1]!.messages.some((m) => m.content.includes('Sempre resuma em até 3 bullets')),
    ).toBe(true);
    // a Conversation retornada não vaza instructions/skillId ao usuário
    for (const message of turn.conversation.messages) {
      expect(message.content).not.toContain('Sempre resuma em até 3 bullets');
      expect(message.content).not.toContain('skillId');
      expect(message.content).not.toContain('skill-summarize-text');
    }
    expect(turn).not.toHaveProperty('skillId');
  });

  it('respond: skillId ausente/inexistente não injeta e não quebra o turno', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: '{"steps":[{"tool":"read_file","args":{}}]}' };
      return { text: 'resumo composto' };
    });
    const core = createCognitiveCore({
      gateway,
      runtime: runtimeWithReadFile,
      skillCatalog: skillCatalogFake([skill]),
    });
    const conversation = core.startConversation();

    const turn = await core.respond(conversation, 'resuma o arquivo x.txt');

    expect(turn.reply).toBe('resumo composto');
    expect(
      calls[1]!.messages.some((m) => m.content.includes('Sempre resuma em até 3 bullets')),
    ).toBe(false);
  });

  it('AskResult não expõe skillId', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return {
          text: '{"steps":[{"tool":"read_file","args":{}}],"skillId":"skill-summarize-text"}',
        };
      }
      return { text: 'resumo composto' };
    });
    const core = createCognitiveCore({
      gateway,
      runtime: runtimeWithReadFile,
      skillCatalog: skillCatalogFake([skill]),
    });

    const answer = await core.ask('resuma o arquivo x.txt');

    expect(answer).not.toHaveProperty('skillId');
  });

  it('sem plano (resposta direta), Skill não é consumida mesmo com porta ativa', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'resposta direta' }));
    const core = createCognitiveCore({
      gateway,
      runtime: emptyRuntime,
      skillCatalog: skillCatalogFake([skill]),
    });

    const answer = await core.ask('oi');

    expect(answer.text).toBe('resposta direta');
    // sem Tools no runtime, instruction() já retorna string vazia (comportamento existente)
    expect(calls[0]!.messages[0]!.content).toBe(TASK_FRAMING);
  });
});

describe('createCognitiveCore — consumo de tokens (SPEC-0054/ADR-0025)', () => {
  it('ask sem plano: usage soma a resposta direta + a extração (2 chamadas)', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return {
          text: 'resposta',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        };
      }
      return { text: '[]', usage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 } };
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('oi');

    expect(calls).toHaveLength(2);
    expect(answer.usage).toEqual({ promptTokens: 13, completionTokens: 6, totalTokens: 19 });
  });

  it('ask com plano (sem replan): usage soma planejamento + composição + extração (3 chamadas)', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return { text: '{"steps":[{"tool":"clock","args":{}}]}', usage: { promptTokens: 10 } };
      }
      if (call === 2) {
        return { text: 'composto', usage: { completionTokens: 20 } };
      }
      return { text: '[]', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: true, output: 'ok' } }],
    });
    const core = createCognitiveCore({ gateway, runtime });

    const answer = await core.ask('que horas são?');

    expect(calls).toHaveLength(3);
    expect(answer.usage).toEqual({ promptTokens: 11, completionTokens: 21, totalTokens: 2 });
  });

  it('ask com replanejamento: usage soma também a chamada de replanejamento (4 chamadas)', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return { text: '{"steps":[{"tool":"clock","args":{}}]}', usage: { promptTokens: 1 } };
      }
      if (call === 2) {
        return { text: '{"steps":[{"tool":"clock","args":{}}]}', usage: { promptTokens: 2 } };
      }
      if (call === 3) {
        return { text: 'Hoje é 2026-07-19.', usage: { promptTokens: 4 } };
      }
      return { text: '[]', usage: { promptTokens: 8 } };
    });
    const runtime = sequencedRuntime(
      [{ name: 'clock', description: 'hora' }],
      [
        { steps: [{ tool: 'clock', args: {}, result: { ok: false, error: 'indisponível' } }] },
        { steps: [{ tool: 'clock', args: {}, result: { ok: true, output: '2026-07-19' } }] },
      ],
    );
    const core = createCognitiveCore({ gateway, runtime });

    const answer = await core.ask('que dia é hoje?');

    expect(calls).toHaveLength(4);
    expect(answer.usage).toEqual({ promptTokens: 15 });
  });

  it('nenhuma chamada reporta usage: AskResult sai sem a propriedade (nunca usage:{} nem zeros)', async () => {
    const { gateway } = stubGateway(async () => ({ text: 'resposta' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('oi');

    expect(answer.usage).toBeUndefined();
    expect('usage' in answer).toBe(false);
  });

  it('reporte parcial: só os campos reportados aparecem, sem derivar totalTokens nesta camada', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return { text: 'resposta', usage: { promptTokens: 10 } };
      }
      return { text: '[]' };
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('oi');

    expect(answer.usage).toEqual({ promptTokens: 10 });
    expect(answer.usage).not.toHaveProperty('totalTokens');
  });

  it('falha da chamada de extração contribui com zero para a soma, sem quebrar o turno', async () => {
    let call = 0;
    const { gateway } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return {
          text: 'resposta',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        };
      }
      throw new Error('gateway indisponível');
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('oi');

    expect(answer.text).toBe('resposta');
    expect(answer.learned).toBeUndefined();
    expect(answer.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  it('respond sem plano: ConversationTurn.usage soma as duas chamadas do turno', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return { text: 'resposta', usage: { promptTokens: 10 } };
      }
      return { text: '[]', usage: { promptTokens: 2 } };
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });
    const conversation = core.startConversation();

    const turn = await core.respond(conversation, 'oi');

    expect(calls).toHaveLength(2);
    expect(turn.usage).toEqual({ promptTokens: 12 });
  });

  it('respond com plano: ConversationTurn.usage soma planejamento + composição + extração', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) {
        return { text: '{"steps":[{"tool":"clock","args":{}}]}', usage: { promptTokens: 5 } };
      }
      if (call === 2) {
        return { text: 'composto', usage: { completionTokens: 7 } };
      }
      return { text: '[]', usage: { promptTokens: 1 } };
    });
    const runtime = runtimeWith([{ name: 'clock', description: 'hora' }], {
      steps: [{ tool: 'clock', args: {}, result: { ok: true, output: 'ok' } }],
    });
    const core = createCognitiveCore({ gateway, runtime });
    const conversation = core.startConversation();

    const turn = await core.respond(conversation, 'que horas são?');

    expect(calls).toHaveLength(3);
    expect(turn.usage).toEqual({ promptTokens: 6, completionTokens: 7 });
  });

  it('nenhuma chamada reporta usage: ConversationTurn sai sem a propriedade', async () => {
    const { gateway } = stubGateway(async () => ({ text: 'resposta' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });
    const conversation = core.startConversation();

    const turn = await core.respond(conversation, 'oi');

    expect(turn.usage).toBeUndefined();
    expect('usage' in turn).toBe(false);
  });

  it('não muda nada mais do ciclo: prompts, ordem, steps e learned seguem idênticos ao caminho já testado', async () => {
    let call = 0;
    const { gateway, calls } = stubGateway(async () => {
      call += 1;
      if (call === 1) return { text: 'resposta', usage: { promptTokens: 1 } };
      return { text: '["fato novo"]', usage: { promptTokens: 1 } };
    });
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('oi');

    expect(calls).toHaveLength(2);
    expect(answer.text).toBe('resposta');
    expect(answer.learned).toEqual(['fato novo']);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'oi' },
    ]);
  });
});
