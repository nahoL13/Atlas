import { describe, expect, it } from 'vitest';
import type { Tool } from '@atlas/contracts';
import { createToolRegistry } from '../src/index.js';

function noopTool(name: string): Tool {
  return { name, description: `desc ${name}`, run: async () => ({ ok: true, output: name }) };
}

describe('createToolRegistry', () => {
  it('register/get/has recuperam a Tool por nome', () => {
    const registry = createToolRegistry();
    const a = noopTool('a');
    registry.register(a);
    expect(registry.has('a')).toBe(true);
    expect(registry.get('a')).toBe(a);
  });

  it('get de nome inexistente retorna undefined; has retorna false', () => {
    const registry = createToolRegistry();
    expect(registry.get('x')).toBeUndefined();
    expect(registry.has('x')).toBe(false);
  });

  it('list retorna as Tools registradas', () => {
    const registry = createToolRegistry();
    registry.register(noopTool('a'));
    registry.register(noopTool('b'));
    expect(registry.list().map((t) => t.name)).toEqual(['a', 'b']);
  });
});
