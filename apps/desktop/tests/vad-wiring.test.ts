import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

// SPEC-0052 (CA17/CA18): asserção estática de fonte, molde da SPEC-0046/D16
// — nunca `vi.mock('electron')`. Prova que os dois canais IPC do VAD estão
// registrados em `src/main.ts` e expostos em `src/preload.cjs`.

describe('main.ts — registro dos dois canais atlas:vad:*', () => {
  const mainSource = readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8');

  it('registra atlas:vad:available e atlas:vad:resources', () => {
    for (const channel of ['atlas:vad:available', 'atlas:vad:resources']) {
      expect(mainSource).toContain(`'${channel}'`);
    }
  });
});

describe('preload.cjs — exposição de window.atlas.vad.*', () => {
  const preloadSource = readFileSync(join(__dirname, '..', 'src', 'preload.cjs'), 'utf8');

  it('expõe vad.available e vad.resources', () => {
    expect(preloadSource).toMatch(/vad:\s*\{/);
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:vad:available')");
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:vad:resources')");
  });
});
