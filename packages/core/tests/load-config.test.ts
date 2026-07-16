import { describe, expect, it } from 'vitest';
import { InvalidConfigError, type AtlasConfig } from '@atlas/contracts';
import { defaultConfig, loadConfig } from '../src/index.js';

describe('loadConfig', () => {
  it('sem override retorna os defaults', () => {
    const config = loadConfig();
    expect(config).toEqual(defaultConfig());
    expect(config.logLevel).toBe('info');
    expect(config.dataDir.endsWith('.atlas')).toBe(true);
  });

  it('mescla override parcial preservando os demais defaults', () => {
    const config = loadConfig({ logLevel: 'debug' });
    expect(config.logLevel).toBe('debug');
    expect(config.dataDir).toBe(defaultConfig().dataDir);
  });

  it('congela a configuração resultante', () => {
    expect(Object.isFrozen(loadConfig())).toBe(true);
  });

  it('rejeita logLevel desconhecido', () => {
    expect(() => loadConfig({ logLevel: 'verbose' as AtlasConfig['logLevel'] })).toThrow(
      InvalidConfigError,
    );
  });

  it('rejeita dataDir vazio', () => {
    expect(() => loadConfig({ dataDir: '  ' })).toThrow(InvalidConfigError);
  });

  it('acumula todas as issues em um único erro', () => {
    try {
      loadConfig({ logLevel: 'nope' as AtlasConfig['logLevel'], dataDir: '' });
      expect.unreachable('deveria ter lançado InvalidConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConfigError);
      expect((error as InvalidConfigError).issues).toHaveLength(2);
    }
  });

  it('aplica os defaults de model', () => {
    const config = loadConfig();
    expect(config.model).toEqual({ provider: 'local', model: 'llama3.2' });
  });

  it('persona default é jarvis', () => {
    expect(loadConfig().persona).toBe('jarvis');
  });

  it('aceita persona conhecida (neutral)', () => {
    expect(loadConfig({ persona: 'neutral' }).persona).toBe('neutral');
  });

  it('rejeita persona desconhecida', () => {
    expect(() => loadConfig({ persona: 'batman' })).toThrow(InvalidConfigError);
  });

  it('memory.path default termina em .atlas/memory.json', () => {
    expect(loadConfig().memory.path).toMatch(/[/\\]\.atlas[/\\]memory\.json$/);
  });

  it('aceita override de memory.path', () => {
    expect(loadConfig({ memory: { path: '/tmp/custom/mem.json' } }).memory.path).toBe(
      '/tmp/custom/mem.json',
    );
  });

  it('rejeita memory.path vazio', () => {
    expect(() => loadConfig({ memory: { path: '  ' } })).toThrow(InvalidConfigError);
  });

  it('mescla model parcialmente preservando os defaults', () => {
    const config = loadConfig({ model: { provider: 'fake' } });
    expect(config.model).toEqual({ provider: 'fake', model: 'llama3.2' });
  });

  it('rejeita provider de model desconhecido', () => {
    expect(() =>
      loadConfig({ model: { provider: 'nope' as AtlasConfig['model']['provider'] } }),
    ).toThrow(InvalidConfigError);
  });

  it('rejeita provider remote sem apiKey', () => {
    expect(() => loadConfig({ model: { provider: 'remote', model: 'gpt-x' } })).toThrow(
      InvalidConfigError,
    );
  });

  it('rejeita provider local sem model', () => {
    expect(() => loadConfig({ model: { provider: 'local', model: '' } })).toThrow(
      InvalidConfigError,
    );
  });

  it('usa [cwd] como readRoots padrão', () => {
    const config = loadConfig();
    expect(config.permissions.readRoots).toEqual([process.cwd()]);
  });

  it('override.permissions.readRoots substitui o default', () => {
    const config = loadConfig({ permissions: { readRoots: ['/allowed'] } });
    expect(config.permissions.readRoots).toEqual(['/allowed']);
  });

  it('rejeita readRoots vazio', () => {
    expect(() => loadConfig({ permissions: { readRoots: [] } })).toThrow(InvalidConfigError);
  });

  it('rejeita readRoots com caminho vazio', () => {
    expect(() => loadConfig({ permissions: { readRoots: ['  '] } })).toThrow(InvalidConfigError);
  });

  it('usa [] como writeRoots padrão', () => {
    const config = loadConfig();
    expect(config.permissions.writeRoots).toEqual([]);
  });

  it('override.permissions.writeRoots substitui o default', () => {
    const config = loadConfig({ permissions: { writeRoots: ['/out'] } });
    expect(config.permissions.writeRoots).toEqual(['/out']);
  });

  it('aceita writeRoots vazio explícito', () => {
    expect(() => loadConfig({ permissions: { writeRoots: [] } })).not.toThrow();
  });

  it('rejeita writeRoots com caminho vazio', () => {
    expect(() => loadConfig({ permissions: { writeRoots: ['  '] } })).toThrow(InvalidConfigError);
  });

  it('preserva readRoots e writeRoots juntos no override', () => {
    const config = loadConfig({ permissions: { readRoots: ['/r'], writeRoots: ['/w'] } });
    expect(config.permissions.readRoots).toEqual(['/r']);
    expect(config.permissions.writeRoots).toEqual(['/w']);
  });
});
