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

describe('createCognitiveCore conversa', () => {
  it('startConversation semeia só o system prompt', () => {
    const { gateway } = stubGateway(async () => ({ text: '' }));
    const core = createCognitiveCore({ gateway });
    const conv = core.startConversation();
    expect(conv.messages).toEqual([{ role: 'system', content: SYSTEM_PROMPT }]);
  });

  it('respond monta [historico, user], chama generate uma vez e anexa a resposta', async () => {
    const { gateway, calls } = stubGateway(async () => ({ text: 'oi de volta' }));
    const core = createCognitiveCore({ gateway });

    const { reply, conversation } = await core.respond(core.startConversation(), 'oi');

    expect(reply).toBe('oi de volta');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'oi' },
    ]);
    expect(conversation.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'oi de volta' },
    ]);
  });

  it('respond é pura: não muta a conversa de entrada', async () => {
    const { gateway } = stubGateway(async () => ({ text: 'x' }));
    const core = createCognitiveCore({ gateway });
    const conv0 = core.startConversation();
    await core.respond(conv0, 'oi');
    expect(conv0.messages).toEqual([{ role: 'system', content: SYSTEM_PROMPT }]);
  });

  it('multi-turno acumula o histórico', async () => {
    const { gateway, calls } = stubGateway(async (req) => ({
      text: `resp:${req.messages.at(-1)!.content}`,
    }));
    const core = createCognitiveCore({ gateway });
    const turn1 = await core.respond(core.startConversation(), 'primeira');
    const turn2 = await core.respond(turn1.conversation, 'segunda');
    expect(turn2.conversation.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
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
    const core = createCognitiveCore({ gateway });
    await expect(core.respond(core.startConversation(), 'oi')).rejects.toThrow(
      'modelo indisponível',
    );
  });
});
