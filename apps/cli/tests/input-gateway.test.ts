import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '@atlas/core';
import { createCliInputGateway, CliUsageError } from '../src/gateway/input-gateway.js';

const gw = createCliInputGateway();

describe('CliInputGateway.normalize', () => {
  it('sem argumentos retorna o comando help', () => {
    expect(gw.normalize([], {})).toEqual({ command: 'help', configOverride: {} });
  });

  it('status sem overrides', () => {
    expect(gw.normalize(['status'], {})).toEqual({ command: 'status', configOverride: {} });
  });

  it('--help e -h têm prioridade sobre o positional', () => {
    expect(gw.normalize(['status', '--help'], {}).command).toBe('help');
    expect(gw.normalize(['-h'], {}).command).toBe('help');
  });

  it('--version e -v retornam o comando version', () => {
    expect(gw.normalize(['--version'], {}).command).toBe('version');
    expect(gw.normalize(['-v'], {}).command).toBe('version');
  });

  it('a flag --log-level sobrepõe o env ATLAS_LOG_LEVEL', () => {
    const parsed = gw.normalize(['status', '--log-level', 'debug'], { ATLAS_LOG_LEVEL: 'error' });
    expect(parsed.configOverride).toEqual({ logLevel: 'debug' });
  });

  it('o env preenche a config quando não há flag correspondente', () => {
    const parsed = gw.normalize(['status'], {
      ATLAS_LOG_LEVEL: 'error',
      ATLAS_DATA_DIR: '/tmp/atlas',
    });
    expect(parsed.configOverride).toEqual({ logLevel: 'error', dataDir: '/tmp/atlas' });
  });

  it('a flag --data-dir sobrepõe o env ATLAS_DATA_DIR', () => {
    const parsed = gw.normalize(['status', '--data-dir', '/flag'], { ATLAS_DATA_DIR: '/env' });
    expect(parsed.configOverride).toEqual({ dataDir: '/flag' });
  });

  it('comando desconhecido lança CliUsageError', () => {
    expect(() => gw.normalize(['bogus'], {})).toThrow(CliUsageError);
  });

  it('flag desconhecida lança CliUsageError', () => {
    expect(() => gw.normalize(['status', '--nope'], {})).toThrow(CliUsageError);
  });

  it('ask com objetivo devolve o comando ask e o objetivo', () => {
    const parsed = gw.normalize(['ask', 'resuma isto'], {});
    expect(parsed.command).toBe('ask');
    expect(parsed.objective).toBe('resuma isto');
    expect(parsed.configOverride).toEqual({});
  });

  it('ask sem objetivo lança CliUsageError', () => {
    expect(() => gw.normalize(['ask'], {})).toThrow(CliUsageError);
  });

  it('a flag --provider sobrepõe o env ATLAS_MODEL_PROVIDER', () => {
    const parsed = gw.normalize(['ask', 'oi', '--provider', 'fake'], {
      ATLAS_MODEL_PROVIDER: 'remote',
    });
    expect(parsed.configOverride).toEqual({ model: { provider: 'fake' } });
  });

  it('o env preenche model quando não há flag', () => {
    const parsed = gw.normalize(['ask', 'oi'], {
      ATLAS_MODEL: 'llama3.2',
      ATLAS_MODEL_BASE_URL: 'http://host:11434',
    });
    expect(parsed.configOverride).toEqual({
      model: { model: 'llama3.2', baseUrl: 'http://host:11434' },
    });
  });

  it('chat é reconhecido e devolve o comando chat', () => {
    const parsed = gw.normalize(['chat'], {});
    expect(parsed.command).toBe('chat');
    expect(parsed.configOverride).toEqual({});
  });

  it('chat resolve overrides de model na precedência flags > env', () => {
    const parsed = gw.normalize(['chat', '--provider', 'fake'], {
      ATLAS_MODEL_PROVIDER: 'remote',
    });
    expect(parsed.configOverride).toEqual({ model: { provider: 'fake' } });
  });

  it('mapeia ATLAS_ALLOW_READ para permissions.readRoots', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_READ: '/env/dir',
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ readRoots: ['/env/dir'] });
  });

  it('--allow-read tem precedência sobre ATLAS_ALLOW_READ', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status', '--allow-read', '/flag/dir'], {
      ATLAS_ALLOW_READ: '/env/dir',
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ readRoots: ['/flag/dir'] });
  });

  it('mapeia ATLAS_ALLOW_WRITE para permissions.writeRoots', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_WRITE: '/env/out',
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ writeRoots: ['/env/out'] });
  });

  it('--allow-write tem precedência sobre ATLAS_ALLOW_WRITE', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status', '--allow-write', '/flag/out'], {
      ATLAS_ALLOW_WRITE: '/env/out',
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ writeRoots: ['/flag/out'] });
  });

  it('read e write coexistem no mesmo override.permissions', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(
      ['status', '--allow-read', '/in', '--allow-write', '/out'],
      {} as NodeJS.ProcessEnv,
    );
    expect(parsed.configOverride.permissions).toEqual({
      readRoots: ['/in'],
      writeRoots: ['/out'],
    });
  });

  it('sem flag/env, não define permissions no override', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {} as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toBeUndefined();
  });

  it('--allow-read repetido produz múltiplas readRoots, em ordem', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(
      ['status', '--allow-read', 'a', '--allow-read', 'b'],
      {} as NodeJS.ProcessEnv,
    );
    expect(parsed.configOverride.permissions).toEqual({ readRoots: ['a', 'b'] });
  });

  it('--allow-write repetido produz múltiplas writeRoots, em ordem', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(
      ['status', '--allow-write', 'a', '--allow-write', 'b'],
      {} as NodeJS.ProcessEnv,
    );
    expect(parsed.configOverride.permissions).toEqual({ writeRoots: ['a', 'b'] });
  });

  it('ATLAS_ALLOW_READ com path.delimiter produz múltiplas readRoots', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_READ: `a${path.delimiter}b`,
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ readRoots: ['a', 'b'] });
  });

  it('ATLAS_ALLOW_WRITE com path.delimiter produz múltiplas writeRoots', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_WRITE: `a${path.delimiter}b`,
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ writeRoots: ['a', 'b'] });
  });

  it('flag --allow-read presente substitui por inteiro a env (sem merge)', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status', '--allow-read', 'x'], {
      ATLAS_ALLOW_READ: `y${path.delimiter}z`,
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ readRoots: ['x'] });
  });

  it('flag --allow-write presente substitui por inteiro a env (sem merge)', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status', '--allow-write', 'x'], {
      ATLAS_ALLOW_WRITE: `y${path.delimiter}z`,
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ writeRoots: ['x'] });
  });

  it('ATLAS_ALLOW_READ filtra segmento vazio à direita do delimitador', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_READ: `a${path.delimiter}`,
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ readRoots: ['a'] });
  });

  it('ATLAS_ALLOW_READ aplica trim em cada segmento', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_READ: ` a ${path.delimiter} b `,
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toEqual({ readRoots: ['a', 'b'] });
  });

  it('ATLAS_ALLOW_READ vazia não define readRoots (cai no default)', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_READ: '',
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toBeUndefined();
  });

  it('ATLAS_ALLOW_READ só com o delimitador não define readRoots (cai no default)', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_READ: path.delimiter,
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toBeUndefined();
  });

  it('ATLAS_ALLOW_WRITE vazia não define writeRoots (cai no default)', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_WRITE: '',
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toBeUndefined();
  });

  it('ATLAS_ALLOW_WRITE só com o delimitador não define writeRoots (cai no default)', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(['status'], {
      ATLAS_ALLOW_WRITE: path.delimiter,
    } as NodeJS.ProcessEnv);
    expect(parsed.configOverride.permissions).toBeUndefined();
  });

  it('override com múltiplas raízes de read e write passa intacto pelo loadConfig do core', () => {
    const gateway = createCliInputGateway();
    const parsed = gateway.normalize(
      [
        'status',
        '--allow-read',
        '/a',
        '--allow-read',
        '/b',
        '--allow-write',
        '/c',
        '--allow-write',
        '/d',
      ],
      {} as NodeJS.ProcessEnv,
    );
    const config = loadConfig(parsed.configOverride);
    expect(config.permissions.readRoots).toEqual(['/a', '/b']);
    expect(config.permissions.writeRoots).toEqual(['/c', '/d']);
  });

  it('skills sem subcomando retorna list por default', () => {
    const parsed = gw.normalize(['skills'], {});
    expect(parsed.command).toBe('skills');
    expect(parsed.skillsSubcommand).toBe('list');
  });

  it('skills list retorna o subcomando list', () => {
    const parsed = gw.normalize(['skills', 'list'], {});
    expect(parsed).toEqual({ command: 'skills', configOverride: {}, skillsSubcommand: 'list' });
  });

  it('skills build "<capacidade>" devolve o subcomando build e a capacidade', () => {
    const parsed = gw.normalize(['skills', 'build', 'resumir arquivos de texto'], {});
    expect(parsed.command).toBe('skills');
    expect(parsed.skillsSubcommand).toBe('build');
    expect(parsed.capability).toBe('resumir arquivos de texto');
  });

  it('skills build sem capacidade lança CliUsageError', () => {
    expect(() => gw.normalize(['skills', 'build'], {})).toThrow(CliUsageError);
  });

  it('skills com subcomando desconhecido lança CliUsageError', () => {
    expect(() => gw.normalize(['skills', 'bogus'], {})).toThrow(CliUsageError);
  });

  it('memory search "<consulta>" devolve o subcomando search e a consulta', () => {
    const parsed = gw.normalize(['memory', 'search', 'aniversário'], {});
    expect(parsed.command).toBe('memory');
    expect(parsed.memorySubcommand).toBe('search');
    expect(parsed.searchQuery).toBe('aniversário');
  });

  it('memory search sem consulta lança CliUsageError', () => {
    expect(() => gw.normalize(['memory', 'search'], {})).toThrow(CliUsageError);
  });

  it('memory com subcomando desconhecido lança CliUsageError listando list|dedupe|search', () => {
    expect(() => gw.normalize(['memory', 'bogus'], {})).toThrow(CliUsageError);
    try {
      gw.normalize(['memory', 'bogus'], {});
    } catch (cause) {
      expect((cause as Error).message).toContain('list|dedupe|search');
    }
  });
});
