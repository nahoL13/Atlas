import { describe, expect, it } from 'vitest';
import { createTokenUsageAccumulator } from '../src/token-usage.js';

// SPEC-0054: acumulador de consumo de tokens da sessão — módulo puro,
// sem IO/Date/persistência.

describe('createTokenUsageAccumulator', () => {
  it('estado inicial é {0,0,0,0,0}', () => {
    const accumulator = createTokenUsageAccumulator();
    expect(accumulator.snapshot()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reportedTurns: 0,
      unreportedTurns: 0,
    });
  });

  it('add(undefined) incrementa unreportedTurns, não altera os totais', () => {
    const accumulator = createTokenUsageAccumulator();
    accumulator.add(undefined);
    expect(accumulator.snapshot()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reportedTurns: 0,
      unreportedTurns: 1,
    });
  });

  it('add({}) (três campos ausentes) incrementa unreportedTurns', () => {
    const accumulator = createTokenUsageAccumulator();
    accumulator.add({});
    expect(accumulator.snapshot().unreportedTurns).toBe(1);
    expect(accumulator.snapshot().reportedTurns).toBe(0);
  });

  it('add com os três campos inválidos (NaN/negativo) incrementa unreportedTurns', () => {
    const accumulator = createTokenUsageAccumulator();
    accumulator.add({
      promptTokens: Number.NaN,
      completionTokens: -1,
      totalTokens: Number.POSITIVE_INFINITY,
    });
    expect(accumulator.snapshot().unreportedTurns).toBe(1);
    expect(accumulator.snapshot().reportedTurns).toBe(0);
  });

  it('add válido com os três campos: reportedTurns soma, totalTokens usa o reportado (não deriva)', () => {
    const accumulator = createTokenUsageAccumulator();
    accumulator.add({ promptTokens: 10, completionTokens: 5, totalTokens: 999 });
    expect(accumulator.snapshot()).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 999,
      reportedTurns: 1,
      unreportedTurns: 0,
    });
  });

  it('totalTokens ausente é derivado como prompt + completion daquele turno', () => {
    const accumulator = createTokenUsageAccumulator();
    accumulator.add({ promptTokens: 10, completionTokens: 5 });
    expect(accumulator.snapshot().totalTokens).toBe(15);
    expect(accumulator.snapshot().reportedTurns).toBe(1);
  });

  it('reportado parcialmente (só promptTokens) conta como turno reportado', () => {
    const accumulator = createTokenUsageAccumulator();
    accumulator.add({ promptTokens: 7 });
    expect(accumulator.snapshot()).toEqual({
      promptTokens: 7,
      completionTokens: 0,
      totalTokens: 7,
      reportedTurns: 1,
      unreportedTurns: 0,
    });
  });

  it('acumula sobre múltiplas chamadas válidas', () => {
    const accumulator = createTokenUsageAccumulator();
    accumulator.add({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    accumulator.add({ promptTokens: 3, completionTokens: 2 });
    expect(accumulator.snapshot()).toEqual({
      promptTokens: 13,
      completionTokens: 7,
      totalTokens: 20,
      reportedTurns: 2,
      unreportedTurns: 0,
    });
  });

  it('mistura de turnos reportados e não reportados', () => {
    const accumulator = createTokenUsageAccumulator();
    accumulator.add({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    accumulator.add(undefined);
    accumulator.add({});
    expect(accumulator.snapshot()).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      reportedTurns: 1,
      unreportedTurns: 2,
    });
  });

  it('valores fracionários são arredondados com Math.round', () => {
    const accumulator = createTokenUsageAccumulator();
    accumulator.add({ promptTokens: 10.6, completionTokens: 5.4 });
    expect(accumulator.snapshot().promptTokens).toBe(11);
    expect(accumulator.snapshot().completionTokens).toBe(5);
  });

  it('reset() volta ao estado inicial', () => {
    const accumulator = createTokenUsageAccumulator();
    accumulator.add({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    accumulator.add(undefined);
    accumulator.reset();
    expect(accumulator.snapshot()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reportedTurns: 0,
      unreportedTurns: 0,
    });
  });
});
