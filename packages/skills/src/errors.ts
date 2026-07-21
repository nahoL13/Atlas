import { AtlasError } from '@atlas/contracts';

export class SkillError extends AtlasError {
  constructor(message: string, options?: ErrorOptions) {
    super('ATLAS_SKILL', message, options);
  }
}
