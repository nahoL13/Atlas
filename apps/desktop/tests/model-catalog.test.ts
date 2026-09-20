import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@atlas/core';
import { MODEL_CATALOG, findCatalogModel, isInstalledModel } from '../src/model-catalog.js';

/** CAs 22–25 (SPEC-0063). */

const EXPECTED_ORDER = [
  { name: 'llama3.2', sizeLabel: '≈ 2 GB', recommended: true },
  { name: 'llama3.1:8b', sizeLabel: '≈ 4,9 GB', recommended: false },
  { name: 'qwen2.5:7b', sizeLabel: '≈ 4,7 GB', recommended: false },
  { name: 'qwen2.5-coder:7b', sizeLabel: '≈ 4,7 GB', recommended: false },
  { name: 'gemma2:2b', sizeLabel: '≈ 1,6 GB', recommended: false },
];

describe('MODEL_CATALOG (CA22)', () => {
  it('tem exatamente as cinco entradas pinadas, nessa ordem', () => {
    expect(MODEL_CATALOG).toHaveLength(5);
    MODEL_CATALOG.forEach((entry, index) => {
      const expected = EXPECTED_ORDER[index]!;
      expect(entry.name).toBe(expected.name);
      expect(entry.sizeLabel).toBe(expected.sizeLabel);
      expect(entry.recommended).toBe(expected.recommended);
      expect(entry.description.length).toBeGreaterThan(0);
    });
  });

  it('exatamente uma entrada tem recommended: true e é llama3.2', () => {
    const recommended = MODEL_CATALOG.filter((entry) => entry.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0]?.name).toBe('llama3.2');
  });

  it('o nome recomendado é igual a defaultConfig().model.model (catálogo e default não divergem)', () => {
    const recommended = MODEL_CATALOG.find((entry) => entry.recommended);
    expect(recommended?.name).toBe(defaultConfig().model.model);
  });
});

describe('findCatalogModel (CA23)', () => {
  it('aceita "llama3.2" e "llama3.2:latest" como a mesma entrada', () => {
    const byBareName = findCatalogModel('llama3.2');
    const byLatestTag = findCatalogModel('llama3.2:latest');
    expect(byBareName).toBeDefined();
    expect(byBareName).toEqual(byLatestTag);
  });

  it('devolve undefined para "llama3.2:1b", "mistral" e ""', () => {
    expect(findCatalogModel('llama3.2:1b')).toBeUndefined();
    expect(findCatalogModel('mistral')).toBeUndefined();
    expect(findCatalogModel('')).toBeUndefined();
  });
});

describe('isInstalledModel (CA24)', () => {
  it('isInstalledModel("llama3.2", ["llama3.2:latest"]) é true', () => {
    expect(isInstalledModel('llama3.2', ['llama3.2:latest'])).toBe(true);
  });

  it('isInstalledModel("llama3.1:8b", ["llama3.1:70b"]) é false', () => {
    expect(isInstalledModel('llama3.1:8b', ['llama3.1:70b'])).toBe(false);
  });

  it('lista vazia ⇒ sempre false', () => {
    expect(isInstalledModel('llama3.2', [])).toBe(false);
  });
});

describe('model-catalog.ts é dado puro (CA25)', () => {
  it('não importa electron, node:fs nem faz IO/rede', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../src/model-catalog.ts', import.meta.url), 'utf8');
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'));
    for (const line of importLines) {
      expect(line).not.toMatch(/electron/);
      expect(line).not.toMatch(/node:/);
      expect(line).not.toMatch(/fetch/);
    }
  });
});
