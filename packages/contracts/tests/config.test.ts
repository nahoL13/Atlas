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

describe('AtlasConfig.tools.searchUrl (SPEC-0057/D22)', () => {
  it('tools.searchUrl é obrigatório em AtlasConfig', () => {
    const tools: AtlasConfig['tools'] = { searchUrl: '' };
    expect(tools.searchUrl).toBe('');
  });

  it('AtlasConfig.tools sem searchUrl NÃO compila (teste de tipo negativo, D16)', () => {
    // @ts-expect-error searchUrl é obrigatório na config resolvida (D16/D22).
    const invalid: AtlasConfig['tools'] = {};
    expect(invalid).toBeDefined();
  });

  it('AtlasConfigOverride.tools e AtlasConfigOverride.tools.searchUrl são opcionais', () => {
    const empty: AtlasConfigOverride = {};
    expect(empty.tools).toBeUndefined();

    const emptyTools: AtlasConfigOverride = { tools: {} };
    expect(emptyTools.tools?.searchUrl).toBeUndefined();

    const withSearchUrl: AtlasConfigOverride = { tools: { searchUrl: 'https://h/search' } };
    expect(withSearchUrl.tools?.searchUrl).toBe('https://h/search');
  });
});
