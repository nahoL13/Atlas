import { describe, expect, it } from 'vitest';
import type { Tool, ToolRegistry } from '@atlas/contracts';
import { createRuntime } from '../src/index.js';

function fakeRegistry(tools: Tool[]): ToolRegistry {
  const map = new Map(tools.map((tool) => [tool.name, tool]));
  return {
    register: (tool) => {
      map.set(tool.name, tool);
    },
    get: (name) => map.get(name),
    has: (name) => map.has(name),
    list: () => [...map.values()],
  };
}

describe('createRuntime.execute', () => {
  it('executa os passos em ordem e agrega os resultados', async () => {
    const calls: string[] = [];
    const a: Tool = {
      name: 'a',
      description: 'A',
      run: async (args) => {
        calls.push('a');
        return { ok: true, output: `a:${JSON.stringify(args)}` };
      },
    };
    const b: Tool = {
      name: 'b',
      description: 'B',
      run: async () => {
        calls.push('b');
        return { ok: true, output: 'b' };
      },
    };
    const runtime = createRuntime({ registry: fakeRegistry([a, b]) });

    const result = await runtime.execute({
      steps: [
        { tool: 'a', args: { x: 1 } },
        { tool: 'b', args: {} },
      ],
    });

    expect(calls).toEqual(['a', 'b']);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]!.result).toEqual({ ok: true, output: 'a:{"x":1}' });
    expect(result.steps[1]!.tool).toBe('b');
  });

  it('Tool inexistente vira falha estruturada e a execução continua', async () => {
    const b: Tool = { name: 'b', description: 'B', run: async () => ({ ok: true, output: 'b' }) };
    const runtime = createRuntime({ registry: fakeRegistry([b]) });

    const result = await runtime.execute({
      steps: [
        { tool: 'missing', args: {} },
        { tool: 'b', args: {} },
      ],
    });

    expect(result.steps[0]!.result.ok).toBe(false);
    expect(result.steps[0]!.result.error).toContain('desconhecida');
    expect(result.steps[1]!.result.ok).toBe(true);
  });

  it('Tool que lança vira falha estruturada e não propaga', async () => {
    const boom: Tool = {
      name: 'boom',
      description: 'x',
      run: async () => {
        throw new Error('kaboom');
      },
    };
    const runtime = createRuntime({ registry: fakeRegistry([boom]) });

    const result = await runtime.execute({ steps: [{ tool: 'boom', args: {} }] });

    expect(result.steps[0]!.result.ok).toBe(false);
    expect(result.steps[0]!.result.error).toContain('kaboom');
  });

  it('tools() expõe os descritores (nome + descrição) do registry', () => {
    const a: Tool = { name: 'a', description: 'A', run: async () => ({ ok: true }) };
    const b: Tool = { name: 'b', description: 'B', run: async () => ({ ok: true }) };
    const runtime = createRuntime({ registry: fakeRegistry([a, b]) });

    expect(runtime.tools()).toEqual([
      { name: 'a', description: 'A' },
      { name: 'b', description: 'B' },
    ]);
  });
});
