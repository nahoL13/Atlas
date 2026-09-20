import { describe, expect, it } from 'vitest';
import { OLLAMA_DEFAULT_BASE_URL } from '@atlas/model-gateway';
import {
  isValidContainerName,
  parseBooleanSetting,
  parseContainerNameSetting,
  resolveDependencyConfig,
} from '../src/config/dependency-config.js';
import { createDependencyManager } from '../src/dependencies/dependency-manager.js';
import type {
  OllamaStartOutcome,
  ProcessPort,
  SearchContainerStartOutcome,
  SearchContainerState,
} from '../src/dependencies/process-port.js';

function fakeProcess(overrides: Partial<ProcessPort> = {}): ProcessPort {
  return {
    inspectOllama: async () => ({ running: true, models: [] }),
    startOllama: async (): Promise<OllamaStartOutcome> => ({ started: true }),
    stopOllama: async () => {},
    pullOllamaModel: async ({ model }) => ({ status: 'installed', model }),
    inspectSearchContainer: async (): Promise<SearchContainerState> => 'unknown',
    startSearchContainer: async (): Promise<SearchContainerStartOutcome> => ({
      started: false,
      reason: 'container-unknown',
    }),
    stopSearchContainer: async () => {},
    ...overrides,
  };
}

describe('resolveDependencyConfig (SPEC-0060, CA 3)', () => {
  it('resolveDependencyConfig({}) devolve autoStartOllama false, ollamaBaseUrl default e autoStartSearchContainer vazio (CA 5)', () => {
    expect(resolveDependencyConfig({})).toEqual({
      autoStartOllama: false,
      ollamaBaseUrl: OLLAMA_DEFAULT_BASE_URL,
      autoStartSearchContainer: '',
    });
  });

  it('não lança com persona inexistente (não valida persona)', () => {
    expect(() => resolveDependencyConfig({ persona: 'inexistente' })).not.toThrow();
  });

  describe('derivação de ollamaBaseUrl condicionada ao provider efetivo (D22, CA 3a)', () => {
    it.each([
      [
        'provider omitido (default local) herda model.baseUrl',
        { model: { baseUrl: 'http://x:1' } },
        'http://x:1',
      ],
      [
        "provider 'local' explícito herda model.baseUrl",
        { model: { provider: 'local' as const, baseUrl: 'http://x:1' } },
        'http://x:1',
      ],
      [
        "provider 'remote' cai na constante do Model Gateway",
        {
          model: {
            provider: 'remote' as const,
            baseUrl: 'https://api.terceiro.com',
            apiKey: 'k',
          },
        },
        OLLAMA_DEFAULT_BASE_URL,
      ],
      [
        "provider 'fake' cai na constante do Model Gateway",
        { model: { provider: 'fake' as const, baseUrl: 'http://x:1' } },
        OLLAMA_DEFAULT_BASE_URL,
      ],
      [
        'provider inválido cai na constante do Model Gateway e não lança',
        { model: { provider: 'inexistente' as never, baseUrl: 'http://x:1' } },
        OLLAMA_DEFAULT_BASE_URL,
      ],
    ])('%s', (_label, override, expected) => {
      expect(() => resolveDependencyConfig(override)).not.toThrow();
      expect(resolveDependencyConfig(override).ollamaBaseUrl).toBe(expected);
    });
  });

  describe('não-regressão do vazamento nomeado pelo veto (CA 3b)', () => {
    it('com provider remote, o ProcessPort fake só vê OLLAMA_DEFAULT_BASE_URL', async () => {
      const calls: string[] = [];
      const process: ProcessPort = fakeProcess({
        inspectOllama: async (baseUrl) => {
          calls.push(baseUrl);
          return { running: true, models: [] };
        },
      });
      const manager = createDependencyManager({ process });
      const config = resolveDependencyConfig({
        dependencies: { autoStartOllama: true },
        model: { provider: 'remote', baseUrl: 'https://api.terceiro.com', apiKey: 'k' },
      });

      await manager.ensure(config);

      expect(calls).toEqual([OLLAMA_DEFAULT_BASE_URL]);
      expect(calls).not.toContain('https://api.terceiro.com');
    });
  });

  describe('autoStartSearchContainer (SPEC-0061, CA 5)', () => {
    it('nome válido resolve para o próprio nome', () => {
      expect(
        resolveDependencyConfig({ dependencies: { autoStartSearchContainer: 'searxng' } })
          .autoStartSearchContainer,
      ).toBe('searxng');
    });

    it('nome inválido normaliza fail-closed para vazio e não lança', () => {
      expect(() =>
        resolveDependencyConfig({ dependencies: { autoStartSearchContainer: 'a b' } }),
      ).not.toThrow();
      expect(
        resolveDependencyConfig({ dependencies: { autoStartSearchContainer: 'a b' } })
          .autoStartSearchContainer,
      ).toBe('');
    });
  });

  describe('regra única de trim (D6, CA 2a)', () => {
    it('"  searxng  " resolve para "searxng" (trimado)', () => {
      expect(
        resolveDependencyConfig({ dependencies: { autoStartSearchContainer: '  searxng  ' } })
          .autoStartSearchContainer,
      ).toBe('searxng');
    });

    it('"   " resolve para "" (desligado)', () => {
      expect(
        resolveDependencyConfig({ dependencies: { autoStartSearchContainer: '   ' } })
          .autoStartSearchContainer,
      ).toBe('');
    });
  });
});

describe('isValidContainerName (SPEC-0061, CA 3)', () => {
  it.each(['searxng', 'searxng_1', 'my.search-01', 'A1'])('aceita %j', (value) => {
    expect(isValidContainerName(value)).toBe(true);
  });

  it.each(['', '   ', '-abc', '.abc', 'a b', 'a/b', 'a;b', 'a\nb', 'a'.repeat(129)])(
    'recusa %j',
    (value) => {
      expect(isValidContainerName(value)).toBe(false);
    },
  );
});

describe('parseContainerNameSetting (SPEC-0061/D6, CA 4)', () => {
  it.each([undefined, '', '   '])('%j é "unset"', (raw) => {
    expect(parseContainerNameSetting(raw)).toEqual({ kind: 'unset' });
  });

  it('"  searxng  " é "value" com o valor trimado', () => {
    expect(parseContainerNameSetting('  searxng  ')).toEqual({
      kind: 'value',
      value: 'searxng',
    });
  });

  it('"a b" é "invalid" com o valor cru (sem trim)', () => {
    expect(parseContainerNameSetting('a b')).toEqual({ kind: 'invalid', received: 'a b' });
  });
});

describe('parseBooleanSetting (SPEC-0060/D6, CA 4)', () => {
  it.each(['1', 'true', 'yes', 'on', 'TRUE', ' On ', 'Yes'])(
    '%j é interpretado como true',
    (raw) => {
      expect(parseBooleanSetting(raw)).toEqual({ kind: 'value', value: true });
    },
  );

  it.each(['0', 'false', 'no', 'off', 'FALSE', ' Off ', 'No'])(
    '%j é interpretado como false',
    (raw) => {
      expect(parseBooleanSetting(raw)).toEqual({ kind: 'value', value: false });
    },
  );

  it.each([undefined, '', '   '])('%j é "unset"', (raw) => {
    expect(parseBooleanSetting(raw)).toEqual({ kind: 'unset' });
  });

  it('qualquer outra string é "invalid" com o valor cru', () => {
    expect(parseBooleanSetting('talvez')).toEqual({ kind: 'invalid', received: 'talvez' });
  });
});
