import { describe, expect, it } from 'vitest';
import { AtlasError } from '@atlas/contracts';
import { ModelGatewayError } from '../src/errors.js';

describe('ModelGatewayError', () => {
  it('é um AtlasError com code próprio e name correto', () => {
    const error = new ModelGatewayError('falhou');
    expect(error).toBeInstanceOf(AtlasError);
    expect(error.code).toBe('ATLAS_MODEL_GATEWAY');
    expect(error.name).toBe('ModelGatewayError');
    expect(error.message).toBe('falhou');
  });
});
