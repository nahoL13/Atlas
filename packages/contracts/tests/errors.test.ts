import { describe, expect, it } from 'vitest';
import { AtlasError, InvalidConfigError, LifecycleError } from '../src/index.js';

describe('erros estruturados', () => {
  it('AtlasError carrega code, name e message', () => {
    const error = new AtlasError('ATLAS_TEST', 'mensagem de teste');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('ATLAS_TEST');
    expect(error.name).toBe('AtlasError');
    expect(error.message).toBe('mensagem de teste');
  });

  it('InvalidConfigError acumula issues e herda de AtlasError', () => {
    const error = new InvalidConfigError(['logLevel inválido', 'dataDir vazio']);
    expect(error).toBeInstanceOf(AtlasError);
    expect(error.code).toBe('ATLAS_INVALID_CONFIG');
    expect(error.issues).toEqual(['logLevel inválido', 'dataDir vazio']);
    expect(error.message).toContain('logLevel inválido');
  });

  it('LifecycleError registra a transição rejeitada', () => {
    const error = new LifecycleError('stopped', 'ready');
    expect(error).toBeInstanceOf(AtlasError);
    expect(error.code).toBe('ATLAS_INVALID_TRANSITION');
    expect(error.from).toBe('stopped');
    expect(error.to).toBe('ready');
  });
});
