export type {
  Role,
  Message,
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  ModelGatewayConfig,
  ProviderName,
  HttpDeps,
} from './model-gateway.js';
export { createModelGateway } from './model-gateway.js';
export { ModelGatewayError } from './errors.js';
export { OLLAMA_DEFAULT_BASE_URL } from './providers/ollama.js';
