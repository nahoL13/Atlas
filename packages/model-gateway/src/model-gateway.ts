import type { ModelGateway, ModelGatewayConfig } from '@atlas/contracts';
import { ModelGatewayError } from './errors.js';
import { createFakeProvider } from './providers/fake.js';
import { createOllamaProvider } from './providers/ollama.js';
import { createRemoteProvider } from './providers/remote.js';

export type {
  Role,
  Message,
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  ModelGatewayConfig,
  ProviderName,
} from '@atlas/contracts';

export interface HttpDeps {
  fetch: typeof fetch;
}

export function createModelGateway(
  config: ModelGatewayConfig,
  deps: HttpDeps = { fetch: globalThis.fetch },
): ModelGateway {
  switch (config.provider) {
    case 'fake':
      return createFakeProvider();
    case 'local':
      return createOllamaProvider(config, deps);
    case 'remote':
      return createRemoteProvider(config, deps);
    default:
      throw new ModelGatewayError(`Provedor de modelo desconhecido: ${String(config.provider)}`);
  }
}
