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
      return { text };
    },
  };
}
