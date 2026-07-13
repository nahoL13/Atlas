import type { CognitiveCore, ModelGateway } from '@atlas/contracts';

export const SYSTEM_PROMPT =
  'Você é o núcleo cognitivo do Atlas, um assistente de IA pessoal. ' +
  'Responda ao objetivo do usuário de forma clara, correta e objetiva, ' +
  'no mesmo idioma em que ele escreveu. ' +
  'Se faltar informação essencial, diga o que precisa saber em vez de supor.';

export interface CognitiveCoreDeps {
  gateway: ModelGateway;
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway } = deps;
  return {
    async ask(objective: string): Promise<string> {
      const result = await gateway.generate({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: objective },
        ],
      });
      return result.text;
    },
  };
}
