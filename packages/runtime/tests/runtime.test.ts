import { describe, expect, it } from 'vitest';
import type { Tool, ToolRegistry } from '@atlas/contracts';
import type { PermissionDecision, PermissionService } from '@atlas/contracts';
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

function fakePermissions(verdict: PermissionDecision = { verdict: 'allowed' }): PermissionService {
  return { evaluate: () => verdict };
}

function recordingPermissions(): { service: PermissionService; calls: number } {
  const state = { calls: 0 };
  return {
    service: {
      evaluate: () => {
        state.calls += 1;
        return { verdict: 'allowed' };
      },
    },
    get calls() {
      return state.calls;
    },
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
    const runtime = createRuntime({
      registry: fakeRegistry([a, b]),
      permissions: fakePermissions(),
    });

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
    const runtime = createRuntime({ registry: fakeRegistry([b]), permissions: fakePermissions() });

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
    const runtime = createRuntime({
      registry: fakeRegistry([boom]),
      permissions: fakePermissions(),
    });

    const result = await runtime.execute({ steps: [{ tool: 'boom', args: {} }] });

    expect(result.steps[0]!.result.ok).toBe(false);
    expect(result.steps[0]!.result.error).toContain('kaboom');
  });

  it('tools() expõe os descritores (nome + descrição) do registry', () => {
    const a: Tool = { name: 'a', description: 'A', run: async () => ({ ok: true }) };
    const b: Tool = { name: 'b', description: 'B', run: async () => ({ ok: true }) };
    const runtime = createRuntime({
      registry: fakeRegistry([a, b]),
      permissions: fakePermissions(),
    });

    expect(runtime.tools()).toEqual([
      { name: 'a', description: 'A' },
      { name: 'b', description: 'B' },
    ]);
  });

  it('não consulta permissions para Tool sem requirements (livre)', async () => {
    const free: Tool = {
      name: 'free',
      description: 'x',
      run: async () => ({ ok: true, output: 'ok' }),
    };
    const perms = recordingPermissions();
    const runtime = createRuntime({ registry: fakeRegistry([free]), permissions: perms.service });

    const result = await runtime.execute({ steps: [{ tool: 'free', args: {} }] });

    expect(result.steps[0]!.result.ok).toBe(true);
    expect(perms.calls).toBe(0);
  });

  it('consulta permissions e executa quando allowed', async () => {
    let ran = false;
    const gated: Tool = {
      name: 'gated',
      description: 'x',
      requirements: () => ({ resource: { type: 'file', path: '/repo/a' }, access: 'read' }),
      run: async () => {
        ran = true;
        return { ok: true, output: 'conteúdo' };
      },
    };
    const runtime = createRuntime({
      registry: fakeRegistry([gated]),
      permissions: fakePermissions({ verdict: 'allowed' }),
    });

    const result = await runtime.execute({ steps: [{ tool: 'gated', args: { path: '/repo/a' } }] });

    expect(ran).toBe(true);
    expect(result.steps[0]!.result).toEqual({ ok: true, output: 'conteúdo' });
  });

  it('bloqueado vira ExecutedStep negado, NÃO executa a Tool e continua', async () => {
    let ran = false;
    const gated: Tool = {
      name: 'gated',
      description: 'x',
      requirements: () => ({ resource: { type: 'file', path: '/etc/passwd' }, access: 'read' }),
      run: async () => {
        ran = true;
        return { ok: true, output: 'nunca' };
      },
    };
    const after: Tool = {
      name: 'after',
      description: 'x',
      run: async () => ({ ok: true, output: 'after' }),
    };
    const runtime = createRuntime({
      registry: fakeRegistry([gated, after]),
      permissions: fakePermissions({ verdict: 'blocked', reason: 'fora da raiz' }),
    });

    const result = await runtime.execute({
      steps: [
        { tool: 'gated', args: { path: '/etc/passwd' } },
        { tool: 'after', args: {} },
      ],
    });

    expect(ran).toBe(false);
    expect(result.steps[0]!.result.ok).toBe(false);
    expect(result.steps[0]!.result.error).toContain('fora da raiz');
    expect(result.steps[1]!.result.ok).toBe(true);
  });
});
