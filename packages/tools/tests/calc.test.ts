import { describe, expect, it } from 'vitest';
import { createCalcTool } from '../src/index.js';

describe('createCalcTool', () => {
  const calc = createCalcTool();

  it('avalia expressões válidas respeitando precedência e parênteses', async () => {
    expect((await calc.run({ expression: '12*8' })).output).toBe('96');
    expect((await calc.run({ expression: '2+3*4' })).output).toBe('14');
    expect((await calc.run({ expression: '(2+3)*4' })).output).toBe('20');
    expect((await calc.run({ expression: '10/4' })).output).toBe('2.5');
    expect((await calc.run({ expression: '-3 + 5' })).output).toBe('2');
  });

  it('expressão inválida retorna erro estruturado (sem lançar)', async () => {
    expect((await calc.run({ expression: '2 +' })).ok).toBe(false);
    expect((await calc.run({ expression: 'a+1' })).ok).toBe(false);
    expect((await calc.run({ expression: '2/0' })).ok).toBe(false);
  });

  it('args sem expression string retorna erro estruturado', async () => {
    expect((await calc.run({})).ok).toBe(false);
    expect((await calc.run({ expression: '   ' })).ok).toBe(false);
    expect((await calc.run({ expression: 42 })).ok).toBe(false);
  });

  it('não executa código arbitrário (sem eval)', async () => {
    const result = await calc.run({ expression: 'process.exit(1)' });
    expect(result.ok).toBe(false);
  });
});
