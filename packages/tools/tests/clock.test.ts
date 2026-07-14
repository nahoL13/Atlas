import { describe, expect, it } from 'vitest';
import { createClockTool } from '../src/index.js';

describe('createClockTool', () => {
  it('retorna a data/hora atual em ISO, determinística sob now injetado', async () => {
    const fixed = new Date('2026-07-14T12:00:00.000Z');
    const clock = createClockTool({ now: () => fixed });
    expect(clock.name).toBe('clock');
    const result = await clock.run({});
    expect(result).toEqual({ ok: true, output: '2026-07-14T12:00:00.000Z' });
  });

  it('sem now injetado usa o relógio real (formato ISO)', async () => {
    const clock = createClockTool();
    const result = await clock.run({});
    expect(result.ok).toBe(true);
    expect(result.output).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
