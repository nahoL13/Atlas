import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCliPersonaService,
  createCliPersonaStorage,
} from '../src/gateway/persona-composition.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'atlas-cli-persona-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('createCliPersonaStorage', () => {
  it('deriva o caminho canônico <dataDir>/personas.json', () => {
    const storage = createCliPersonaStorage({ dataDir: tmpDir });
    storage.save([
      {
        id: 'x',
        name: 'X',
        tone: '',
        formality: '',
        language: '',
        style: '',
        communicationRules: [],
        voice: '',
        emotion: '',
      },
    ]);
    expect(readFileSync(join(tmpDir, 'personas.json'), 'utf8')).toContain('"id": "x"');
  });

  it('não aciona loadConfig: um configOverride.persona inexistente não faz a composição lançar', () => {
    expect(() => createCliPersonaStorage({ dataDir: tmpDir, persona: 'nao-existe' })).not.toThrow();
  });
});

describe('createCliPersonaService', () => {
  it('compõe um PersonaService sobre o storage derivado, com as embutidas visíveis', () => {
    const service = createCliPersonaService({ dataDir: tmpDir });
    expect(service.list()).toContain('jarvis');
    expect(service.list()).toContain('neutral');
  });

  it('não aciona loadConfig: persona inexistente em configOverride não impede compor o serviço', () => {
    expect(() => createCliPersonaService({ dataDir: tmpDir, persona: 'nao-existe' })).not.toThrow();
  });
});
