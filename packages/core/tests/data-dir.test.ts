import { describe, expect, it } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import {
  createFilePersonaStorage,
  defaultConfig,
  loadConfig,
  personaStoragePath,
  resolveDataDir,
} from '../src/index.js';
import type { PersonaStorage } from '../src/index.js';

describe('resolveDataDir', () => {
  it('resolveDataDir({ dataDir }) devolve o dataDir informado', () => {
    expect(resolveDataDir({ dataDir: '/tmp/custom' })).toBe('/tmp/custom');
  });

  it('resolveDataDir() sem override devolve o dataDir de defaultConfig()', () => {
    expect(resolveDataDir()).toBe(defaultConfig().dataDir);
  });

  it('resolveDataDir({ dataDir: "" }) e { dataDir: "   " } lançam InvalidConfigError com a mesma mensagem que loadConfig produz', () => {
    let emptyMessage: string | undefined;
    try {
      loadConfig({ dataDir: '' });
    } catch (e) {
      emptyMessage = (e as InvalidConfigError).message;
    }

    expect(() => resolveDataDir({ dataDir: '' })).toThrow(InvalidConfigError);
    try {
      resolveDataDir({ dataDir: '' });
    } catch (e) {
      expect((e as InvalidConfigError).message).toBe(emptyMessage);
    }

    expect(() => resolveDataDir({ dataDir: '   ' })).toThrow(InvalidConfigError);
  });

  it('é pura: não lê nem escreve disco (caminho inexistente resolve sem erro de IO)', () => {
    expect(resolveDataDir({ dataDir: '/caminho/que/nao/existe/nem/precisa/existir' })).toBe(
      '/caminho/que/nao/existe/nem/precisa/existir',
    );
  });

  it('correção B1: resolveDataDir NÃO valida persona — devolve o dataDir mesmo com persona custom desconhecida, sem lançar', () => {
    expect(resolveDataDir({ dataDir: '/tmp/custom', persona: 'id-custom-desconhecido' })).toBe(
      '/tmp/custom',
    );
    // enquanto isso, loadConfig sobre o MESMO override continua rejeitando
    expect(() => loadConfig({ dataDir: '/tmp/custom', persona: 'id-custom-desconhecido' })).toThrow(
      InvalidConfigError,
    );
  });

  it('precedência única: resolveDataDir(override) === loadConfig(override).dataDir para ≥2 overrides', () => {
    const overrides = [{}, { dataDir: '/tmp/outro-dir' }];
    for (const override of overrides) {
      expect(resolveDataDir(override)).toBe(loadConfig(override).dataDir);
    }
  });

  // N3 (achado do gate): `loadConfig` valida `dataDir` com `trim()`, mas
  // devolve `merged.dataDir` SEM trim adicional — `resolveDataDir` precisa
  // seguir exatamente a mesma regra de retorno, para nunca apontar para um
  // `dataDir` "diferente" do `config.dataDir` efetivo por causa de espaços.
  it('N3: com espaços em volta de um dataDir válido, resolveDataDir(override) === loadConfig(override).dataDir (sem trim adicional)', () => {
    const override = { dataDir: '  /tmp/com-espacos  ' };
    expect(resolveDataDir(override)).toBe(loadConfig(override).dataDir);
    expect(resolveDataDir(override)).toBe('  /tmp/com-espacos  ');
  });
});

describe('não-regressão do acúmulo de issues em loadConfig após a extração de resolveDataDir', () => {
  it('loadConfig com dataDir/persona/logLevel inválidos rejeita com um InvalidConfigError contendo os três problemas', () => {
    try {
      loadConfig({ dataDir: '', persona: 'inexistente', logLevel: 'nope' as never });
      expect.unreachable('deveria ter lançado InvalidConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConfigError);
      expect((error as InvalidConfigError).issues).toHaveLength(3);
    }
  });
});

describe('personaStoragePath', () => {
  it('é pura (nenhum arquivo criado/lido) e devolve join(dataDir, "personas.json")', () => {
    expect(personaStoragePath('/tmp/dataDir1')).toMatch(/dataDir1[/\\]personas\.json$/);
    expect(personaStoragePath('/tmp/dataDir2')).toMatch(/dataDir2[/\\]personas\.json$/);
  });
});

describe('importabilidade a partir de @atlas/core', () => {
  it('createFilePersonaStorage, resolveDataDir, personaStoragePath e o tipo PersonaStorage são importáveis', () => {
    expect(typeof createFilePersonaStorage).toBe('function');
    expect(typeof resolveDataDir).toBe('function');
    expect(typeof personaStoragePath).toBe('function');
    const storage: PersonaStorage = createFilePersonaStorage('/tmp/nao-usado/personas.json');
    expect(typeof storage.load).toBe('function');
    expect(typeof storage.save).toBe('function');
  });
});
