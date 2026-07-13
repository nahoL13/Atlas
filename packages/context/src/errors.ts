import { AtlasError } from '@atlas/contracts';

export class ContextError extends AtlasError {
  constructor(message: string, options?: ErrorOptions) {
    super('ATLAS_CONTEXT', message, options);
  }
}
