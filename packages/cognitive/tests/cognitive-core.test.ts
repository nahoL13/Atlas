import { describe, expect, it } from 'vitest';
import type { GenerateRequest, GenerateResult, ModelGateway } from '@atlas/contracts';
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

describe('createCognitiveCore.ask', () => {
  it('sem personaPrompt usa só o enquadramento de tarefa', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'resposta do modelo' }));
    const core = createCognitiveCore({ gateway });

    const answer = await core.ask('resuma este texto');

    expect(answer).toBe('resposta do modelo');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: TASK_FRAMING },
      { role: 'user', content: 'resuma este texto' },
    ]);
  });

  it('com personaPrompt compõe identidade + tarefa no system message', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({ gateway, personaPrompt: 'Você é Jarvis.' });

    await core.ask('oi');

    expect(calls[0]!.messages[0]).toEqual({
      role: 'system',
      content: `Você é Jarvis.\n\n${TASK_FRAMING}`,
    });
  });

  it('propaga erro do gateway sem mascarar', async () => {
    const { gateway } = stubGateway(async () => {
      throw new Error('modelo indisponível');
    });
    const core = createCognitiveCore({ gateway });

    await expect(core.ask('oi')).rejects.toThrow('modelo indisponível');
  });
});
