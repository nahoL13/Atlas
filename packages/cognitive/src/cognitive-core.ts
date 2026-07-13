import type {
  CognitiveCore,
  Conversation,
  ConversationTurn,
  Message,
  ModelGateway,
} from '@atlas/contracts';

export const TASK_FRAMING =
  'Responda ao objetivo do usuário de forma clara, correta e objetiva, ' +
  'no mesmo idioma em que ele escreveu. ' +
  'Se faltar informação essencial, diga o que precisa saber em vez de supor.';

export interface CognitiveCoreDeps {
  gateway: ModelGateway;
  personaPrompt?: string;
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway, personaPrompt } = deps;
  const systemPrompt = personaPrompt ? `${personaPrompt}\n\n${TASK_FRAMING}` : TASK_FRAMING;

  return {
    async ask(objective: string): Promise<string> {
      const result = await gateway.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: objective },
        ],
      });
      return result.text;
    },

    startConversation(): Conversation {
      return { messages: [{ role: 'system', content: systemPrompt }] };
    },

    async respond(conversation: Conversation, input: string): Promise<ConversationTurn> {
      const withUser: Message[] = [...conversation.messages, { role: 'user', content: input }];
      const result = await gateway.generate({ messages: withUser });
      const messages: Message[] = [...withUser, { role: 'assistant', content: result.text }];
      return { reply: result.text, conversation: { messages } };
    },
  };
}
