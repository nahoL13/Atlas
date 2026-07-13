import { ModelGatewayError } from './errors.js';

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

// Finalizada na Task 5, quando os provedores existirem.
export function createModelGateway(
  config: ModelGatewayConfig,
  _deps: HttpDeps = { fetch: globalThis.fetch },
): ModelGateway {
  throw new ModelGatewayError(
    `Provedor de modelo ainda não implementado: ${String(config.provider)}`,
  );
}
