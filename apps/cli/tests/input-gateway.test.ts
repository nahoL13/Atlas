import { describe, expect, it } from 'vitest';
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
});
