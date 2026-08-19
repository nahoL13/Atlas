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

/**
 * Consumo de tokens de uma chamada `generate` (SPEC-0054, ADR-0025(a)): forma
 * estruturalmente idêntica à fixada pelo ADR. Todos os campos são opcionais
 * porque nem todo provedor reporta os três.
 */
export interface TokenUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}

export interface GenerateResult {
  text: string;
  readonly usage?: TokenUsage;
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
