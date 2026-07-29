import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AtlasError } from '@atlas/contracts';
import type { Persona } from '@atlas/contracts';
import { createFilePersonaStorage } from '../src/index.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'atlas-persona-storage-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function persona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'custom-1',
    name: 'Custom',
    tone: 'tom',
    formality: 'formalidade',
    language: 'pt-BR',
    style: 'estilo',
    communicationRules: [],
    voice: 'voz',
    emotion: 'emoção',
    ...overrides,
  };
}

describe('createFilePersonaStorage', () => {
  it('arquivo ausente ⇒ load() devolve []', () => {
    const storage = createFilePersonaStorage(join(tmpDir, 'personas.json'));
    expect(storage.load()).toEqual([]);
  });

  it('após save, o arquivo existe e um load novo devolve o mesmo conteúdo (round-trip com voiceURI)', () => {
    const path = join(tmpDir, 'personas.json');
    const storage = createFilePersonaStorage(path);
    const personas = [persona({ voiceURI: 'voice-1' }), persona({ id: 'custom-2' })];
    storage.save(personas);

    const reloaded = createFilePersonaStorage(path).load();
    expect(reloaded).toEqual(personas);
  });

  it('JSON inválido ⇒ PersonaError no load, mensagem contém o caminho do arquivo, e não sobrescreve o arquivo', () => {
    const path = join(tmpDir, 'personas.json');
    const original = 'não é json {{{';
    writeFileSync(path, original, 'utf8');

    const storage = createFilePersonaStorage(path);
    let thrown: unknown;
    try {
      storage.load();
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(AtlasError);
    expect((thrown as AtlasError).message).toContain(path);
    // não é lista vazia (o erro é lançado, não engolido) e o arquivo
    // continua com o conteúdo original — nenhuma escrita "corretiva".
    expect(readFileSync(path, 'utf8')).toBe(original);
  });

  it('cria o diretório sob demanda', () => {
    const path = join(tmpDir, 'nested', 'dir', 'personas.json');
    const storage = createFilePersonaStorage(path);
    storage.save([persona()]);
    expect(createFilePersonaStorage(path).load()).toEqual([persona()]);
  });
});
