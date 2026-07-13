import { describe, expect, it } from 'vitest';
import type { GenerateRequest, GenerateResult, ModelGateway } from '@atlas/contracts';
import { createCognitiveCore, SYSTEM_PROMPT } from '../src/index.js';

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
  it('monta system + user e devolve o texto do gateway', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'resposta do modelo' }));
    const core = createCognitiveCore({ gateway });

    const answer = await core.ask('resuma este texto');

    expect(answer).toBe('resposta do modelo');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'resuma este texto' },
    ]);
  });

  it('propaga erro do gateway sem mascarar', async () => {
    const { gateway } = stubGateway(async () => {
      throw new Error('modelo indisponível');
    });
    const core = createCognitiveCore({ gateway });

    await expect(core.ask('oi')).rejects.toThrow('modelo indisponível');
  });
});
