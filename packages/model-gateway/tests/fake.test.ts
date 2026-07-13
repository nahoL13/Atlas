import { describe, expect, it } from 'vitest';
import { createFakeProvider } from '../src/providers/fake.js';

describe('fake provider', () => {
  it('ecoa a última mensagem de forma determinística', async () => {
    const gateway = createFakeProvider();
    const result = await gateway.generate({
      messages: [
        { role: 'system', content: 'contexto' },
        { role: 'user', content: 'olá' },
      ],
    });
    expect(result.text).toBe('[fake] olá');
  });

  it('sem mensagens devolve prefixo vazio', async () => {
    const gateway = createFakeProvider();
    const result = await gateway.generate({ messages: [] });
    expect(result.text).toBe('[fake] ');
  });
});
