import type {
  GenerateRequest,
  GenerateResult,
  HttpDeps,
  ModelGateway,
  ModelGatewayConfig,
} from '../model-gateway.js';
import { ModelGatewayError } from '../errors.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: unknown;
  eval_count?: unknown;
}

/**
 * Normaliza um campo de contagem de tokens (SPEC-0054, Escopo 2): só entram
 * números finitos e maiores ou iguais a zero, arredondados com `Math.round`.
 */
function toValidTokenCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.round(value);
}

export function createOllamaProvider(
  config: ModelGatewayConfig,
  deps: HttpDeps = { fetch: globalThis.fetch },
): ModelGateway {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  return {
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const model = request.model ?? config.model;
      if (model === undefined) {
        throw new ModelGatewayError('Provedor local (Ollama) exige um "model".');
      }

      const body = {
        model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      };

      let response: Response;
      try {
        response = await deps.fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new ModelGatewayError('Falha ao conectar ao Ollama.', { cause });
      }

      if (!response.ok) {
        throw new ModelGatewayError(`Ollama respondeu com status ${response.status}.`);
      }

      const data = (await response.json()) as OllamaChatResponse;
      const text = data.message?.content;
      if (typeof text !== 'string') {
        throw new ModelGatewayError('Resposta do Ollama sem conteúdo de texto.');
      }

      // SPEC-0054/ADR-0025(b): `totalTokens` é a soma dos dois campos válidos
      // (tratando o ausente como zero) — único provider que deriva o total.
      const promptTokens = toValidTokenCount(data.prompt_eval_count);
      const completionTokens = toValidTokenCount(data.eval_count);
      if (promptTokens === undefined && completionTokens === undefined) {
        return { text };
      }
      return {
        text,
        usage: {
          ...(promptTokens !== undefined ? { promptTokens } : {}),
          ...(completionTokens !== undefined ? { completionTokens } : {}),
          totalTokens: (promptTokens ?? 0) + (completionTokens ?? 0),
        },
      };
    },
  };
}
