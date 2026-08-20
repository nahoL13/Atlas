import { describe, expect, it } from 'vitest';
import type { AtlasConfig, AtlasConfigOverride } from '../src/config.js';

describe('AtlasConfig.permissions.netRoots (ADR-0026)', () => {
  it('netRoots é obrigatório em AtlasConfig.permissions', () => {
    const permissions: AtlasConfig['permissions'] = {
      readRoots: ['/a'],
      writeRoots: [],
      netRoots: [],
    };
    expect(permissions.netRoots).toEqual([]);
  });

  it('AtlasConfig.permissions sem netRoots NÃO compila (teste de tipo negativo)', () => {
    // @ts-expect-error netRoots é obrigatório na config resolvida (D12).
    const invalid: AtlasConfig['permissions'] = { readRoots: ['/a'], writeRoots: [] };
    expect(invalid).toBeDefined();
  });

  it('AtlasConfigOverride.permissions.netRoots é opcional', () => {
    const override: AtlasConfigOverride = { permissions: {} };
    expect(override.permissions?.netRoots).toBeUndefined();

    const withNetRoots: AtlasConfigOverride = { permissions: { netRoots: ['example.com'] } };
    expect(withNetRoots.permissions?.netRoots).toEqual(['example.com']);
  });
});
