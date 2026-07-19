import { describe, expect, it } from 'vitest';
import type { ExecutionResult } from '@atlas/contracts';
import { observe } from '../src/observer.js';

function execution(steps: ExecutionResult['steps']): ExecutionResult {
  return { steps };
}

describe('observe', () => {
  it('passo ok:false sem denialKind (falha de Tool) → replan', () => {
    const result = execution([{ tool: 'x', args: {}, result: { ok: false, error: 'kaboom' } }]);
    expect(observe(result)).toEqual({ verdict: 'replan' });
  });

  it('passo com denialKind blocked → complete (terminal)', () => {
    const result = execution([
      { tool: 'x', args: {}, result: { ok: false, error: 'bloqueado' }, denialKind: 'blocked' },
    ]);
    expect(observe(result)).toEqual({ verdict: 'complete' });
  });

  it('passo com denialKind declined → complete (terminal)', () => {
    const result = execution([
      { tool: 'x', args: {}, result: { ok: false, error: 'cancelada' }, denialKind: 'declined' },
    ]);
    expect(observe(result)).toEqual({ verdict: 'complete' });
  });

  it('ferramenta desconhecida (ok:false sem denialKind) → replan', () => {
    const result = execution([
      {
        tool: 'missing',
        args: {},
        result: { ok: false, error: 'ferramenta desconhecida: missing' },
      },
    ]);
    expect(observe(result)).toEqual({ verdict: 'replan' });
  });

  it('só passos ok:true → complete', () => {
    const result = execution([{ tool: 'clock', args: {}, result: { ok: true, output: 'x' } }]);
    expect(observe(result)).toEqual({ verdict: 'complete' });
  });

  it('execução vazia → complete', () => {
    expect(observe(execution([]))).toEqual({ verdict: 'complete' });
  });

  it('mistura: um ok:false sem denialKind + um blocked → replan (a falha de Tool domina)', () => {
    const result = execution([
      { tool: 'a', args: {}, result: { ok: false, error: 'bloqueado' }, denialKind: 'blocked' },
      { tool: 'b', args: {}, result: { ok: false, error: 'kaboom' } },
    ]);
    expect(observe(result)).toEqual({ verdict: 'replan' });
  });
});
