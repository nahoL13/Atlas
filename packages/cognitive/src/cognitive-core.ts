import type {
  AskResult,
  CognitiveCore,
  Conversation,
  ConversationTurn,
  Message,
  ModelGateway,
  Runtime,
} from '@atlas/contracts';
import { createPlanner } from './planner.js';

export const TASK_FRAMING =
  'Responda ao objetivo do usuário de forma clara, correta e objetiva, ' +
  'no mesmo idioma em que ele escreveu. ' +
  'Se faltar informação essencial, diga o que precisa saber em vez de supor.';

export interface CognitiveCoreDeps {
  gateway: ModelGateway;
  runtime: Runtime;
  personaPrompt?: string;
  memoryPrompt?: string;
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway, runtime, personaPrompt, memoryPrompt } = deps;
  const systemPrompt = [personaPrompt, memoryPrompt, TASK_FRAMING]
    .filter((part): part is string => part !== undefined && part !== '')
    .join('\n\n');
  const planner = createPlanner();

  return {
    async ask(objective: string): Promise<AskResult> {
      const instruction = planner.instruction(runtime.tools());
      const planningSystem = [systemPrompt, instruction].filter((part) => part !== '').join('\n\n');
      const first = await gateway.generate({
        messages: [
          { role: 'system', content: planningSystem },
          { role: 'user', content: objective },
        ],
      });

      const plan = planner.parse(first.text);
      if (plan === null) {
        return { text: first.text };
      }

      const execution = await runtime.execute(plan);
      const results = execution.steps
        .map((step) => {
          const outcome = step.result.ok
            ? (step.result.output ?? '')
            : `ERRO: ${step.result.error ?? ''}`;
          return `- ${step.tool}(${JSON.stringify(step.args)}) → ${outcome}`;
        })
        .join('\n');
      const composed = await gateway.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content:
              `${objective}\n\n` +
              `Resultados das ferramentas executadas:\n${results}\n\n` +
              'Responda ao objetivo usando esses resultados.',
          },
        ],
      });
      return { text: composed.text, steps: execution.steps };
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
