import { describe, expect, it } from 'vitest';
import { createModelGateway } from '../src/model-gateway.js';
import { ModelGatewayError } from '../src/errors.js';
import type { ProviderName } from '../src/model-gateway.js';

describe('createModelGateway', () => {
  it('seleciona o provedor fake e gera texto', async () => {
    const gateway = createModelGateway({ provider: 'fake' });
    const result = await gateway.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(result.text).toBe('[fake] x');
  });

  it('provedor desconhecido lança ModelGatewayError', () => {
    expect(() =>
      createModelGateway({ provider: 'nope' as unknown as ProviderName }),
    ).toThrow(ModelGatewayError);
  });

  it('remote sem apiKey lança na criação (delegado ao provedor)', () => {
    expect(() =>
      createModelGateway({ provider: 'remote', baseUrl: 'https://api.x', model: 'm' }),
    ).toThrow(ModelGatewayError);
  });
});
