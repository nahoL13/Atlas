import type {
  GenerateRequest,
  GenerateResult,
  HttpDeps,
  ModelGateway,
  ModelGatewayConfig,
} from '../model-gateway.js';
import { ModelGatewayError } from '../errors.js';

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export function createRemoteProvider(
  config: ModelGatewayConfig,
  deps: HttpDeps = { fetch: globalThis.fetch },
): ModelGateway {
  if (config.baseUrl === undefined) {
    throw new ModelGatewayError('Provedor remoto exige "baseUrl".');
  }
  if (config.apiKey === undefined) {
    throw new ModelGatewayError('Provedor remoto exige "apiKey".');
  }
  const baseUrl = config.baseUrl;
  const apiKey = config.apiKey;

  return {
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const model = request.model ?? config.model;
      if (model === undefined) {
        throw new ModelGatewayError('Provedor remoto exige um "model".');
      }

      const body = {
        model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      };

      let response: Response;
      try {
        response = await deps.fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new ModelGatewayError('Falha ao conectar ao provedor remoto.', { cause });
      }

      if (!response.ok) {
        throw new ModelGatewayError(`Provedor remoto respondeu com status ${response.status}.`);
      }

      const data = (await response.json()) as OpenAiChatResponse;
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        throw new ModelGatewayError('Resposta do provedor remoto sem conteúdo de texto.');
      }
      return { text };
    },
  };
}
