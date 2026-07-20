import { describe, expect, it } from 'vitest';
import type { AtlasPlatform } from '@atlas/contracts';
import { runAsk } from '../src/commands/ask.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';

function capture(): { output: OutputGateway; text: () => string } {
  const lines: string[] = [];
  return {
    output: { write: (t) => lines.push(t), error: () => {} },
    text: () => lines.join(''),
  };
}

describe('runAsk', () => {
  it('sem steps imprime só a resposta', async () => {
    const cap = capture();
    const atlas = {
      cognitive: { ask: async () => ({ text: 'olá!' }) },
    } as unknown as AtlasPlatform;

    await runAsk(atlas, 'oi', cap.output);

    expect(cap.text()).toBe('olá!\n');
  });

  it('com steps imprime o traço antes da resposta', async () => {
    const cap = capture();
    const atlas = {
      cognitive: {
        ask: async () => ({
          text: 'Hoje é 2026-07-14.',
          steps: [
            { tool: 'clock', args: {}, result: { ok: true, output: '2026-07-14' } },
            { tool: 'calc', args: { expression: '2+2' }, result: { ok: false, error: 'x' } },
          ],
        }),
      },
    } as unknown as AtlasPlatform;

    await runAsk(atlas, 'oi', cap.output);

    expect(cap.text()).toBe('🔧 clock → 2026-07-14\n🔧 calc → erro: x\n\nHoje é 2026-07-14.\n');
  });

  it('com learned, grava via memory.remember(.., "learned") e imprime o traço (SPEC-0020)', async () => {
    const cap = capture();
    const remembered: [string, 'user' | 'learned' | undefined][] = [];
    const atlas = {
      cognitive: {
        ask: async () => ({
          text: 'Ok, anotado.',
          learned: ['mora em São Paulo', 'prefere café sem açúcar'],
        }),
      },
      memory: {
        remember: async (text: string, source?: 'user' | 'learned') => {
          remembered.push([text, source]);
          return {
            fact: { id: 'x', text, createdAt: '2026-07-19T00:00:00.000Z', source },
            created: true,
          };
        },
      },
    } as unknown as AtlasPlatform;

    await runAsk(atlas, 'moro em São Paulo e prefiro café sem açúcar', cap.output);

    expect(remembered).toEqual([
      ['mora em São Paulo', 'learned'],
      ['prefere café sem açúcar', 'learned'],
    ]);
    expect(cap.text()).toBe(
      'Ok, anotado.\n💡 lembrado: mora em São Paulo\n💡 lembrado: prefere café sem açúcar\n',
    );
  });

  it('sem learned, nada é gravado nem impresso além do fluxo atual', async () => {
    const cap = capture();
    let rememberCalls = 0;
    const atlas = {
      cognitive: { ask: async () => ({ text: 'olá!' }) },
      memory: {
        remember: async () => {
          rememberCalls += 1;
          return { fact: { id: 'x', text: '', createdAt: '' }, created: true };
        },
      },
    } as unknown as AtlasPlatform;

    await runAsk(atlas, 'oi', cap.output);

    expect(rememberCalls).toBe(0);
    expect(cap.text()).toBe('olá!\n');
  });

  it('learned que já é conhecido (created: false) não imprime o traço (SPEC-0022)', async () => {
    const cap = capture();
    const atlas = {
      cognitive: {
        ask: async () => ({
          text: 'Ok.',
          learned: ['mora em São Paulo'],
        }),
      },
      memory: {
        remember: async (text: string, source?: 'user' | 'learned') => ({
          fact: { id: 'x', text, createdAt: '2026-07-19T00:00:00.000Z', source },
          created: false,
        }),
      },
    } as unknown as AtlasPlatform;

    await runAsk(atlas, 'moro em São Paulo', cap.output);

    expect(cap.text()).toBe('Ok.\n');
  });
});
