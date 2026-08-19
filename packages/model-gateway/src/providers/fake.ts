import type { GenerateRequest, GenerateResult, ModelGateway } from '../model-gateway.js';

/**
 * Sintetiza `usage` de forma determinística (SPEC-0054, ADR-0025(b)): sem
 * chamada de rede, sem aleatoriedade — só contagem de palavras.
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export function createFakeProvider(): ModelGateway {
  return {
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const last = request.messages.at(-1);
      const text = `[fake] ${last ? last.content : ''}`;
      const promptTokens = request.messages.reduce(
        (sum, message) => sum + countWords(message.content),
        0,
      );
      const completionTokens = countWords(text);
      return {
        text,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    },
  };
}
