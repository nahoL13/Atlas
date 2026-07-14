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
});
