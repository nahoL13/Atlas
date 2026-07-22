import { describe, expect, it } from 'vitest';
import type { ExecutedStep } from '@atlas/contracts';
import { formatSteps } from '../src/steps-view.js';

describe('formatSteps', () => {
  it('undefined/vazio devolve []', () => {
    expect(formatSteps(undefined)).toEqual([]);
    expect(formatSteps([])).toEqual([]);
  });

  it('mapeia sucesso: ok true, outcome = output', () => {
    const steps: ExecutedStep[] = [
      { tool: 'clock', args: {}, result: { ok: true, output: '2026-07-22' } },
    ];
    expect(formatSteps(steps)).toEqual([{ tool: 'clock', outcome: '2026-07-22', ok: true }]);
  });

  it('mapeia falha de Tool: ok false, outcome = mensagem de erro, sem denialKind', () => {
    const steps: ExecutedStep[] = [
      {
        tool: 'calc',
        args: { expression: '1/0' },
        result: { ok: false, error: 'divisão inválida' },
      },
    ];
    expect(formatSteps(steps)).toEqual([{ tool: 'calc', outcome: 'divisão inválida', ok: false }]);
  });

  it('preserva denialKind blocked', () => {
    const steps: ExecutedStep[] = [
      {
        tool: 'delete_file',
        args: { path: '/etc/passwd' },
        result: { ok: false, error: 'bloqueado' },
        denialKind: 'blocked',
      },
    ];
    expect(formatSteps(steps)).toEqual([
      { tool: 'delete_file', outcome: 'bloqueado', ok: false, denialKind: 'blocked' },
    ]);
  });

  it('preserva denialKind declined', () => {
    const steps: ExecutedStep[] = [
      {
        tool: 'delete_file',
        args: { path: '/out/a.txt' },
        result: { ok: false, error: 'ação cancelada pelo usuário' },
        denialKind: 'declined',
      },
    ];
    expect(formatSteps(steps)).toEqual([
      {
        tool: 'delete_file',
        outcome: 'ação cancelada pelo usuário',
        ok: false,
        denialKind: 'declined',
      },
    ]);
  });

  it('cada StepLine é serializável sem perda (JSON round-trip)', () => {
    const steps: ExecutedStep[] = [
      { tool: 'clock', args: {}, result: { ok: true, output: 'x' } },
      {
        tool: 'delete_file',
        args: {},
        result: { ok: false, error: 'y' },
        denialKind: 'declined',
      },
    ];
    const lines = formatSteps(steps);
    expect(JSON.parse(JSON.stringify(lines))).toEqual(lines);
  });
});
