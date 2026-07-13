import { AtlasError } from '@atlas/contracts';

export class ModelGatewayError extends AtlasError {
  constructor(message: string, options?: ErrorOptions) {
    super('ATLAS_MODEL_GATEWAY', message, options);
  }
}
