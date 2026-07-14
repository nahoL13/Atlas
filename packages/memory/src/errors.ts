import { AtlasError } from '@atlas/contracts';

export class MemoryError extends AtlasError {
  constructor(message: string, options?: ErrorOptions) {
    super('ATLAS_MEMORY', message, options);
  }
}
