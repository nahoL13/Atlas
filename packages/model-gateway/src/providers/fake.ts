import type {
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  ModelGatewayConfig,
} from '../model-gateway.js';

export function createFakeProvider(_config: ModelGatewayConfig): ModelGateway {
  return {
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const last = request.messages.at(-1);
      return { text: `[fake] ${last ? last.content : ''}` };
    },
  };
}
