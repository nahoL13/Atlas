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

describe('createCognitiveCore.ask', () => {
  it('sem personaPrompt e sem Tools usa só o enquadramento de tarefa (1 chamada)', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'resposta do modelo' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime });

    const answer = await core.ask('resuma este texto');

    expect(answer.text).toBe('resposta do modelo');
    expect(answer.steps).toBeUndefined();
    expect(calls).toHaveLength(1);
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
      memoryPrompt: 'Fatos: o nome do usuário é Lohan.',
    });

    await core.ask('oi');

    expect(calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: `Você é Jarvis.\n\nFatos: o nome do usuário é Lohan.\n\n${TASK_FRAMING}`,
    });
  });

  it('com memoryPrompt e sem personaPrompt compõe memória + tarefa', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({ gateway, runtime: emptyRuntime, memoryPrompt: 'Fatos: X.' });

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

    expect(calls).toHaveLength(2);
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
