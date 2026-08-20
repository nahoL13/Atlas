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

  describe('--allow-net / ATLAS_ALLOW_NET (SPEC-0055, ADR-0026)', () => {
    it('mapeia ATLAS_ALLOW_NET (lista por vírgula) para permissions.netRoots', () => {
      const gateway = createCliInputGateway();
      const parsed = gateway.normalize(['status'], {
        ATLAS_ALLOW_NET: 'a.com,b.com',
      } as NodeJS.ProcessEnv);
      expect(parsed.configOverride.permissions).toEqual({ netRoots: ['a.com', 'b.com'] });
    });

    it('ATLAS_ALLOW_NET aplica trim e filtra segmentos vazios (", " e vírgula final)', () => {
      const gateway = createCliInputGateway();
      const parsed = gateway.normalize(['status'], {
        ATLAS_ALLOW_NET: 'a.com, b.com,',
      } as NodeJS.ProcessEnv);
      expect(parsed.configOverride.permissions).toEqual({ netRoots: ['a.com', 'b.com'] });
    });

    it('ATLAS_ALLOW_NET vazia ou só vírgula não define netRoots (cai no default)', () => {
      const gateway = createCliInputGateway();
      const empty = gateway.normalize(['status'], { ATLAS_ALLOW_NET: '' } as NodeJS.ProcessEnv);
      expect(empty.configOverride.permissions).toBeUndefined();
      const onlyComma = gateway.normalize(['status'], {
        ATLAS_ALLOW_NET: ',',
      } as NodeJS.ProcessEnv);
      expect(onlyComma.configOverride.permissions).toBeUndefined();
    });

    it('ATLAS_ALLOW_NET NÃO é dividido por path.delimiter: "a.com:b.com" produz uma única entrada', () => {
      const gateway = createCliInputGateway();
      const parsed = gateway.normalize(['status'], {
        ATLAS_ALLOW_NET: 'a.com:b.com',
      } as NodeJS.ProcessEnv);
      expect(parsed.configOverride.permissions).toEqual({ netRoots: ['a.com:b.com'] });
      expect(() => loadConfig(parsed.configOverride)).toThrow();
    });

    it('--allow-net repetido produz múltiplas netRoots, em ordem', () => {
      const gateway = createCliInputGateway();
      const parsed = gateway.normalize(
        ['status', '--allow-net', 'a.com', '--allow-net', 'b.com'],
        {} as NodeJS.ProcessEnv,
      );
      expect(parsed.configOverride.permissions).toEqual({ netRoots: ['a.com', 'b.com'] });
    });

    it('flag --allow-net presente substitui por inteiro a env (sem merge)', () => {
      const gateway = createCliInputGateway();
      const parsed = gateway.normalize(['status', '--allow-net', 'x.com'], {
        ATLAS_ALLOW_NET: 'y.com,z.com',
      } as NodeJS.ProcessEnv);
      expect(parsed.configOverride.permissions).toEqual({ netRoots: ['x.com'] });
    });

    it('sem flag/env, não define permissions no override', () => {
      const gateway = createCliInputGateway();
      const parsed = gateway.normalize(['status'], {} as NodeJS.ProcessEnv);
      expect(parsed.configOverride.permissions).toBeUndefined();
    });

    it('read/write/net coexistem no mesmo override.permissions', () => {
      const gateway = createCliInputGateway();
      const parsed = gateway.normalize(
        ['status', '--allow-read', '/in', '--allow-write', '/out', '--allow-net', 'a.com'],
        {} as NodeJS.ProcessEnv,
      );
      expect(parsed.configOverride.permissions).toEqual({
        readRoots: ['/in'],
        writeRoots: ['/out'],
        netRoots: ['a.com'],
      });
    });

    it('override com --allow-net passa intacto pelo loadConfig do core', () => {
      const gateway = createCliInputGateway();
      const parsed = gateway.normalize(
        ['status', '--allow-net', 'a.com', '--allow-net', 'b.com'],
        {} as NodeJS.ProcessEnv,
      );
      const config = loadConfig(parsed.configOverride);
      expect(config.permissions.netRoots).toEqual(['a.com', 'b.com']);
    });
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

  describe('categorias de memória (SPEC-0029)', () => {
    it('remember --category episode devolve factCategory', () => {
      const parsed = gw.normalize(['remember', 'texto', '--category', 'episode'], {});
      expect(parsed.factCategory).toBe('episode');
      expect(parsed.factSubject).toBeUndefined();
    });

    it('remember --category project --subject atlas devolve factCategory e factSubject', () => {
      const parsed = gw.normalize(
        ['remember', 'texto', '--category', 'project', '--subject', 'atlas'],
        {},
      );
      expect(parsed.factCategory).toBe('project');
      expect(parsed.factSubject).toBe('atlas');
    });

    it('remember --category project sem --subject lança CliUsageError mencionando --subject', () => {
      expect(() => gw.normalize(['remember', 'texto', '--category', 'project'], {})).toThrow(
        CliUsageError,
      );
      try {
        gw.normalize(['remember', 'texto', '--category', 'project'], {});
      } catch (cause) {
        expect((cause as Error).message).toContain('--subject');
      }
    });

    it.each(['', '   ', '\t\n'])(
      'remember --category project --subject %j (colapsa para vazio) lança CliUsageError',
      (subject) => {
        expect(() =>
          gw.normalize(['remember', 'texto', '--category', 'project', '--subject', subject], {}),
        ).toThrow(CliUsageError);
      },
    );

    it('remember --subject sem --category project lança CliUsageError', () => {
      expect(() => gw.normalize(['remember', 'texto', '--subject', 'atlas'], {})).toThrow(
        CliUsageError,
      );
    });

    it('remember --subject com --category fact/episode lança CliUsageError', () => {
      expect(() =>
        gw.normalize(['remember', 'texto', '--category', 'fact', '--subject', 'atlas'], {}),
      ).toThrow(CliUsageError);
      expect(() =>
        gw.normalize(['remember', 'texto', '--category', 'episode', '--subject', 'atlas'], {}),
      ).toThrow(CliUsageError);
    });

    it('remember --category desconhecida lança CliUsageError listando os valores aceitos', () => {
      expect(() => gw.normalize(['remember', 'texto', '--category', 'bogus'], {})).toThrow(
        CliUsageError,
      );
      try {
        gw.normalize(['remember', 'texto', '--category', 'bogus'], {});
      } catch (cause) {
        expect((cause as Error).message).toContain('fact|episode|project');
      }
    });

    it('memory list --category project devolve listCategory', () => {
      const parsed = gw.normalize(['memory', 'list', '--category', 'project'], {});
      expect(parsed.listCategory).toBe('project');
    });

    it('memory list --category desconhecida lança CliUsageError', () => {
      expect(() => gw.normalize(['memory', 'list', '--category', 'bogus'], {})).toThrow(
        CliUsageError,
      );
    });

    it('remember sem --category/--subject não define factCategory/factSubject', () => {
      const parsed = gw.normalize(['remember', 'texto'], {});
      expect(parsed.factCategory).toBeUndefined();
      expect(parsed.factSubject).toBeUndefined();
    });
  });

  describe('persona (SPEC-0044)', () => {
    it('atlas persona e atlas persona list produzem personaSubcommand: list', () => {
      expect(gw.normalize(['persona'], {})).toMatchObject({
        command: 'persona',
        personaSubcommand: 'list',
      });
      expect(gw.normalize(['persona', 'list'], {})).toMatchObject({
        command: 'persona',
        personaSubcommand: 'list',
      });
    });

    it('subcomando desconhecido lança CliUsageError citando list|show|create|edit|delete', () => {
      expect(() => gw.normalize(['persona', 'wat'], {})).toThrow(CliUsageError);
      try {
        gw.normalize(['persona', 'wat'], {});
      } catch (cause) {
        expect((cause as Error).message).toContain('list|show|create|edit|delete');
      }
    });

    it('show/edit/delete sem id lançam CliUsageError', () => {
      expect(() => gw.normalize(['persona', 'show'], {})).toThrow(CliUsageError);
      expect(() => gw.normalize(['persona', 'edit'], {})).toThrow(CliUsageError);
      expect(() => gw.normalize(['persona', 'delete'], {})).toThrow(CliUsageError);
    });

    it('create sem nome (ausente ou em branco) lança CliUsageError', () => {
      expect(() => gw.normalize(['persona', 'create'], {})).toThrow(CliUsageError);
      expect(() => gw.normalize(['persona', 'create', '   '], {})).toThrow(CliUsageError);
    });

    it('persona create "X" --name Y lança CliUsageError', () => {
      expect(() => gw.normalize(['persona', 'create', 'X', '--name', 'Y'], {})).toThrow(
        CliUsageError,
      );
    });

    it('persona edit x sem nenhuma flag de campo lança CliUsageError', () => {
      expect(() => gw.normalize(['persona', 'edit', 'x'], {})).toThrow(CliUsageError);
    });

    it('flags de campo com list/show lançam CliUsageError', () => {
      expect(() => gw.normalize(['persona', 'list', '--tone', 'x'], {})).toThrow(CliUsageError);
      expect(() => gw.normalize(['persona', 'show', 'x', '--yes'], {})).toThrow(CliUsageError);
    });

    it('create com todos os campos produz personaFields com exatamente as chaves informadas', () => {
      const parsed = gw.normalize(
        [
          'persona',
          'create',
          'Meu Bot',
          '--tone',
          't',
          '--rule',
          'a',
          '--rule',
          'b',
          '--voice-uri',
          'u',
        ],
        {},
      );
      expect(parsed.personaName).toBe('Meu Bot');
      expect(parsed.personaFields).toEqual({
        tone: 't',
        communicationRules: ['a', 'b'],
        voiceURI: 'u',
      });
    });

    it('--rule "" (só vazio/espaços) produz communicationRules: []; ausência de --rule não cria a chave', () => {
      const withEmptyRule = gw.normalize(['persona', 'create', 'X', '--rule', '   '], {});
      expect(withEmptyRule.personaFields).toEqual({ communicationRules: [] });

      const withoutRule = gw.normalize(['persona', 'create', 'X'], {});
      expect(Object.hasOwn(withoutRule.personaFields ?? {}, 'communicationRules')).toBe(false);
    });

    it('persona delete x --yes produz personaAssumeYes: true; sem a flag, false', () => {
      const withYes = gw.normalize(['persona', 'delete', 'x', '--yes'], {});
      expect(withYes.personaAssumeYes).toBe(true);

      const withoutYes = gw.normalize(['persona', 'delete', 'x'], {});
      expect(withoutYes.personaAssumeYes).toBe(false);
    });

    it('persona show <id> produz personaId', () => {
      const parsed = gw.normalize(['persona', 'show', 'terminal-bot'], {});
      expect(parsed.personaId).toBe('terminal-bot');
    });

    it('persona edit <id> --style novo produz personaFields com só o campo informado', () => {
      const parsed = gw.normalize(['persona', 'edit', 'terminal-bot', '--style', 'novo'], {});
      expect(parsed.personaId).toBe('terminal-bot');
      expect(parsed.personaFields).toEqual({ style: 'novo' });
    });
  });
});
