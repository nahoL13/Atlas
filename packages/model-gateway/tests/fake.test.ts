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

  // SPEC-0054 (Escopo 2/CA4): `usage` determinístico por `countWords`.
  describe('usage', () => {
    it('soma countWords de todas as mensagens para promptTokens', async () => {
      const gateway = createFakeProvider();
      const result = await gateway.generate({
        messages: [
          { role: 'system', content: 'duas palavras' },
          { role: 'user', content: 'olá' },
        ],
      });
      // 'duas palavras' = 2, 'olá' = 1 ⇒ promptTokens = 3
      // completion: '[fake] olá' = 2 palavras
      expect(result.usage).toEqual({ promptTokens: 3, completionTokens: 2, totalTokens: 5 });
    });

    it('string vazia conta zero palavras', async () => {
      const gateway = createFakeProvider();
      const result = await gateway.generate({ messages: [{ role: 'user', content: '' }] });
      expect(result.usage?.promptTokens).toBe(0);
    });

    it('só espaços conta zero palavras', async () => {
      const gateway = createFakeProvider();
      const result = await gateway.generate({ messages: [{ role: 'user', content: '   ' }] });
      expect(result.usage?.promptTokens).toBe(0);
    });

    it('múltiplos espaços/quebras entre palavras contam corretamente', async () => {
      const gateway = createFakeProvider();
      const result = await gateway.generate({
        messages: [{ role: 'user', content: 'uma  duas\ntrês   quatro' }],
      });
      expect(result.usage?.promptTokens).toBe(4);
    });

    it('duas chamadas idênticas produzem o mesmo usage (determinismo)', async () => {
      const gateway = createFakeProvider();
      const request = { messages: [{ role: 'user' as const, content: 'mesma entrada' }] };
      const first = await gateway.generate(request);
      const second = await gateway.generate(request);
      expect(first.usage).toEqual(second.usage);
    });
  });
});
