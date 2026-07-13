import { AtlasError } from '@atlas/contracts';

export class PersonaError extends AtlasError {
  constructor(message: string, options?: ErrorOptions) {
    super('ATLAS_PERSONA', message, options);
  }
}
