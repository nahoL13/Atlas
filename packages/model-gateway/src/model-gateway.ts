import { ModelGatewayError } from './errors.js';
import { createFakeProvider } from './providers/fake.js';
import { createOllamaProvider } from './providers/ollama.js';
import { createRemoteProvider } from './providers/remote.js';

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export interface GenerateRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
}

export interface ModelGateway {
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export type ProviderName = 'fake' | 'local' | 'remote';

export interface ModelGatewayConfig {
  provider: ProviderName;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface HttpDeps {
  fetch: typeof fetch;
}

export function createModelGateway(
  config: ModelGatewayConfig,
  deps: HttpDeps = { fetch: globalThis.fetch },
): ModelGateway {
  switch (config.provider) {
    case 'fake':
      return createFakeProvider(config);
    case 'local':
      return createOllamaProvider(config, deps);
    case 'remote':
      return createRemoteProvider(config, deps);
    default:
      throw new ModelGatewayError(
        `Provedor de modelo desconhecido: ${String(config.provider)}`,
      );
  }
}
