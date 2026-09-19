import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

// SPEC-0062 (CA 31/32): asserção estática de fonte, molde de
// `vad-wiring.test.ts` (SPEC-0052/D16) — nunca `vi.mock('electron')`. Prova
// que os dois canais IPC de dependências externas estão registrados em
// `src/main.ts` e expostos em `src/preload.cjs`, sem alterar nenhum canal
// existente.

describe('main.ts — registro dos dois canais atlas:dependencies:*', () => {
  const mainSource = readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8');

  it('registra exatamente atlas:dependencies:read e atlas:dependencies:search-container', () => {
    for (const channel of ['atlas:dependencies:read', 'atlas:dependencies:search-container']) {
      expect(mainSource).toContain(`'${channel}'`);
    }
    const matches = mainSource.match(/'atlas:dependencies:[a-z-]+'/g) ?? [];
    expect(new Set(matches)).toEqual(
      new Set(["'atlas:dependencies:read'", "'atlas:dependencies:search-container'"]),
    );
  });

  it('delega a readDependencyStatus/ensureSearchContainer', () => {
    expect(mainSource).toContain('readDependencyStatus()');
    expect(mainSource).toMatch(/ensureSearchContainer\(container\)/);
  });

  it('nenhum canal existente (metrics/tokens) muda de nome ou de forma', () => {
    expect(mainSource).toContain(
      "ipcMain.handle('atlas:metrics:read', () => systemMetrics.read())",
    );
    expect(mainSource).toContain("ipcMain.handle('atlas:tokens:read', () => readTokenUsage())");
  });
});

describe('preload.cjs — exposição de window.atlas.dependencies.*', () => {
  const preloadSource = readFileSync(join(__dirname, '..', 'src', 'preload.cjs'), 'utf8');

  it('expõe dependencies.read e dependencies.startSearchContainer, e nada mais no namespace', () => {
    expect(preloadSource).toMatch(/dependencies:\s*\{/);
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:dependencies:read')");
    expect(preloadSource).toContain(
      "ipcRenderer.invoke('atlas:dependencies:search-container', container)",
    );
  });

  it('os namespaces existentes (metrics/tokens) seguem inalterados', () => {
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:metrics:read')");
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:tokens:read')");
  });
});
