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

// SPEC-0063 (CA 34/35): quatro canais novos de instalação assistida de
// modelo — molde exato dos testes acima.

describe('main.ts — registro dos quatro canais atlas:models:* (CA34)', () => {
  const mainSource = readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8');

  it('registra exatamente os quatro canais atlas:models:*', () => {
    for (const channel of [
      'atlas:models:read',
      'atlas:models:probe',
      'atlas:models:install',
      'atlas:models:cancel',
    ]) {
      expect(mainSource).toContain(`'${channel}'`);
    }
    const matches = mainSource.match(/'atlas:models:[a-z-]+'/g) ?? [];
    expect(new Set(matches)).toEqual(
      new Set([
        "'atlas:models:read'",
        "'atlas:models:probe'",
        "'atlas:models:install'",
        "'atlas:models:cancel'",
      ]),
    );
  });

  it('delega a readModelCatalog/whenModelProbeSettled/installOllamaModel/cancelModelInstall', () => {
    expect(mainSource).toContain('readModelCatalog()');
    expect(mainSource).toContain('whenModelProbeSettled()');
    expect(mainSource).toMatch(/installOllamaModel\(model\)/);
    expect(mainSource).toContain('cancelModelInstall()');
  });

  it('nenhum canal existente (dependencies/metrics/tokens) muda de nome ou de forma', () => {
    expect(mainSource).toContain(
      "ipcMain.handle('atlas:dependencies:read', () => readDependencyStatus())",
    );
    expect(mainSource).toContain(
      "ipcMain.handle('atlas:metrics:read', () => systemMetrics.read())",
    );
    expect(mainSource).toContain("ipcMain.handle('atlas:tokens:read', () => readTokenUsage())");
  });
});

describe('preload.cjs — exposição de window.atlas.models.* (CA35)', () => {
  const preloadSource = readFileSync(join(__dirname, '..', 'src', 'preload.cjs'), 'utf8');

  it('expõe read/probe/install/cancel e nada mais no namespace models', () => {
    expect(preloadSource).toMatch(/models:\s*\{/);
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:models:read')");
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:models:probe')");
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:models:install', model)");
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:models:cancel')");
  });

  it('os namespaces existentes seguem inalterados', () => {
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:dependencies:read')");
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:metrics:read')");
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:tokens:read')");
  });
});

describe('app.whenReady() — ordem de bootstrap (SPEC-0063, CA55/B1)', () => {
  const mainSource = readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8');

  it('ensureExternalDependencies() é invocada antes de createWindow(), no mesmo callback, sem await entre as duas', () => {
    const whenReadyStart = mainSource.indexOf('app.whenReady()');
    expect(whenReadyStart).toBeGreaterThan(-1);
    const body = mainSource.slice(whenReadyStart);

    const ensureIndex = body.indexOf('void ensureExternalDependencies()');
    const createWindowIndex = body.indexOf('createWindow();');
    expect(ensureIndex).toBeGreaterThan(-1);
    expect(createWindowIndex).toBeGreaterThan(-1);
    expect(ensureIndex).toBeLessThan(createWindowIndex);

    const between = body.slice(ensureIndex, createWindowIndex);
    expect(between).not.toMatch(/\bawait\b/);
  });

  it('before-quit sai inalterado (releaseExternalDependencies sem await)', () => {
    expect(mainSource).toContain('void releaseExternalDependencies();');
  });
});
