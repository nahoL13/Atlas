import { describe, expect, it } from 'vitest';
import { createVadResources } from '../src/vad-resources.js';

// SPEC-0052: recursos do VAD no main process — IO totalmente injetado, sem
// disco real e sem `onnxruntime-web`/modelo reais.

const DIR = '/vad-resources-test';
const FILES = {
  script: `${DIR}/ort.min.js`,
  wasm: `${DIR}/ort-wasm.wasm`,
  model: `${DIR}/silero_vad.onnx`,
};

function statFrom(present: Set<string>) {
  return (path: string): boolean => present.has(path);
}

describe('createVadResources — sem import de electron, IO injetado', () => {
  it('não lança quando o diretório não existe (nenhum artefato presente)', () => {
    const resources = createVadResources({
      resolveDir: () => DIR,
      readFile: () => Promise.reject(new Error('não deveria ler')),
      stat: statFrom(new Set()),
    });
    expect(() => resources.isAvailable()).not.toThrow();
    expect(resources.isAvailable()).toBe(false);
  });
});

describe('isAvailable — um artefato ausente por vez (CA14)', () => {
  it('script do runtime ausente ⇒ false, reason distinguível', () => {
    const resources = createVadResources({
      resolveDir: () => DIR,
      readFile: () => Promise.reject(new Error('n/a')),
      stat: statFrom(new Set([FILES.wasm, FILES.model])),
    });
    expect(resources.isAvailable()).toBe(false);
  });

  it('binário wasm ausente ⇒ false', () => {
    const resources = createVadResources({
      resolveDir: () => DIR,
      readFile: () => Promise.reject(new Error('n/a')),
      stat: statFrom(new Set([FILES.script, FILES.model])),
    });
    expect(resources.isAvailable()).toBe(false);
  });

  it('modelo ausente ⇒ false', () => {
    const resources = createVadResources({
      resolveDir: () => DIR,
      readFile: () => Promise.reject(new Error('n/a')),
      stat: statFrom(new Set([FILES.script, FILES.wasm])),
    });
    expect(resources.isAvailable()).toBe(false);
  });

  it('todos os três artefatos presentes ⇒ true', () => {
    const resources = createVadResources({
      resolveDir: () => DIR,
      readFile: () => Promise.reject(new Error('n/a')),
      stat: statFrom(new Set([FILES.script, FILES.wasm, FILES.model])),
    });
    expect(resources.isAvailable()).toBe(true);
  });

  it('resolveDir lançando é tratado como indisponível, nunca propaga', () => {
    const resources = createVadResources({
      resolveDir: () => {
        throw new Error('boom');
      },
      readFile: () => Promise.reject(new Error('n/a')),
      stat: statFrom(new Set()),
    });
    expect(() => resources.isAvailable()).not.toThrow();
    expect(resources.isAvailable()).toBe(false);
  });
});

describe('describe (CA16)', () => {
  it('devolve modelo silero-vad-v5 e runtime onnxruntime-web@1.20.1', () => {
    const resources = createVadResources({
      resolveDir: () => DIR,
      readFile: () => Promise.reject(new Error('n/a')),
      stat: statFrom(new Set()),
    });
    expect(resources.describe()).toEqual({
      modelId: 'silero-vad-v5',
      runtime: 'onnxruntime-web@1.20.1',
    });
  });
});

describe('load (CA15)', () => {
  it('caminho feliz: devolve os dois ArrayBuffer', async () => {
    const wasmBuf = new ArrayBuffer(4);
    const modelBuf = new ArrayBuffer(8);
    const resources = createVadResources({
      resolveDir: () => DIR,
      readFile: (path) => {
        if (path === FILES.wasm) return Promise.resolve(wasmBuf);
        if (path === FILES.model) return Promise.resolve(modelBuf);
        return Promise.reject(new Error(`caminho inesperado: ${path}`));
      },
      stat: statFrom(new Set([FILES.script, FILES.wasm, FILES.model])),
    });
    const result = await resources.load();
    expect(result).toEqual({ ok: true, wasm: wasmBuf, model: modelBuf });
  });

  it('artefato ausente: { ok: false, reason } sem tentar ler', async () => {
    const resources = createVadResources({
      resolveDir: () => DIR,
      readFile: () => Promise.reject(new Error('não deveria chamar')),
      stat: statFrom(new Set()),
    });
    const result = await resources.load();
    expect(result.ok).toBe(false);
  });

  it('falha de leitura: nunca lança, devolve { ok: false, reason }', async () => {
    const resources = createVadResources({
      resolveDir: () => DIR,
      readFile: () => Promise.reject(new Error('disco falhou')),
      stat: statFrom(new Set([FILES.script, FILES.wasm, FILES.model])),
    });
    const result = await resources.load();
    expect(result).toEqual({ ok: false, reason: 'disco falhou' });
  });
});

describe('gate mecânico de ausência de rede (CA45, extensão do CA15 da SPEC-0046)', () => {
  it('src/vad-resources.ts não referencia fetch/XMLHttpRequest/WebSocket/EventSource/http/https/net', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'vad-resources.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
    expect(source).not.toMatch(/\bWebSocket\b/);
    expect(source).not.toMatch(/\bEventSource\b/);
    expect(source).not.toMatch(/from ['"]node:http['"]/);
    expect(source).not.toMatch(/from ['"]node:https['"]/);
    expect(source).not.toMatch(/from ['"]node:net['"]/);
  });
});
