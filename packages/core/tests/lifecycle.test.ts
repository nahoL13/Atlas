import { describe, expect, it } from 'vitest';
import { LifecycleError } from '@atlas/contracts';
import { createLifecycle } from '../src/index.js';

describe('createLifecycle', () => {
  it('percorre o caminho feliz: created → ready → stopped', async () => {
    const lifecycle = createLifecycle();
    expect(lifecycle.state).toBe('created');
    await lifecycle.start();
    expect(lifecycle.state).toBe('ready');
    await lifecycle.shutdown();
    expect(lifecycle.state).toBe('stopped');
  });

  it('executa hooks de start e shutdown na ordem', async () => {
    const calls: string[] = [];
    const lifecycle = createLifecycle({
      onStart: () => {
        calls.push('start');
      },
      onShutdown: () => {
        calls.push('shutdown');
      },
    });
    await lifecycle.start();
    await lifecycle.shutdown();
    expect(calls).toEqual(['start', 'shutdown']);
  });

  it('rejeita start duplicado', async () => {
    const lifecycle = createLifecycle();
    await lifecycle.start();
    await expect(lifecycle.start()).rejects.toBeInstanceOf(LifecycleError);
  });

  it('rejeita shutdown antes do start', async () => {
    const lifecycle = createLifecycle();
    await expect(lifecycle.shutdown()).rejects.toBeInstanceOf(LifecycleError);
  });

  it('shutdown é idempotente após stopped', async () => {
    const lifecycle = createLifecycle();
    await lifecycle.start();
    await lifecycle.shutdown();
    await expect(lifecycle.shutdown()).resolves.toBeUndefined();
    expect(lifecycle.state).toBe('stopped');
  });

  it('start que falha leva a failed e permite shutdown de limpeza', async () => {
    const lifecycle = createLifecycle({
      onStart: () => {
        throw new Error('boom');
      },
    });
    await expect(lifecycle.start()).rejects.toThrow('boom');
    expect(lifecycle.state).toBe('failed');
    await lifecycle.shutdown();
    expect(lifecycle.state).toBe('stopped');
  });
});
