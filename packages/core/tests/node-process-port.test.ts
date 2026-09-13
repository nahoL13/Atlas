import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { nodeProcessPort } from '../src/dependencies/node-process-port.js';

function jsonResponse(status: number): Response {
  return new Response('{}', { status });
}

/**
 * Fake mínimo de `ChildProcess` (SPEC-0061, CA 20/21) — `EventEmitter` com um
 * `stdout` também `EventEmitter`, o suficiente para exercitar
 * `once('error'|'close'|'exit'|'spawn')` e `stdout.on('data', …)` sem
 * spawnar processo real.
 */
function fakeChildProcess(): ChildProcess & { stdout: EventEmitter } {
  const child = new EventEmitter() as unknown as ChildProcess & { stdout: EventEmitter };
  (child as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (child as unknown as { unref: () => void }).unref = () => {};
  (child as unknown as { kill: () => boolean }).kill = () => true;
  return child;
}

describe('nodeProcessPort (SPEC-0060, CA 13/14)', () => {
  it('isOllamaRunning devolve true para response.ok true', async () => {
    const fetchStub = (async () => jsonResponse(200)) as unknown as typeof fetch;
    const port = nodeProcessPort({ fetch: fetchStub });

    await expect(port.isOllamaRunning('http://x:1')).resolves.toBe(true);
  });

  it('isOllamaRunning devolve false para response.ok false', async () => {
    const fetchStub = (async () => jsonResponse(500)) as unknown as typeof fetch;
    const port = nodeProcessPort({ fetch: fetchStub });

    await expect(port.isOllamaRunning('http://x:1')).resolves.toBe(false);
  });

  it('isOllamaRunning devolve false quando fetch rejeita, e nunca lança', async () => {
    const fetchStub = (() => Promise.reject(new Error('boom'))) as unknown as typeof fetch;
    const port = nodeProcessPort({ fetch: fetchStub });

    await expect(port.isOllamaRunning('http://x:1')).resolves.toBe(false);
  });

  it('isOllamaRunning nunca lança mesmo com fetch síncrono lançando', async () => {
    const fetchStub = (() => {
      throw new Error('boom síncrono');
    }) as unknown as typeof fetch;
    const port = nodeProcessPort({ fetch: fetchStub });

    await expect(port.isOllamaRunning('http://x:1')).resolves.toBe(false);
  });

  it('stopOllama sem startOllama prévio (sem filho registrado) é no-op e não lança (CA 11b)', async () => {
    const port = nodeProcessPort();

    await expect(port.stopOllama()).resolves.toBeUndefined();
  });

  describe('spawn injetável (SPEC-0061, item 3.2) — não-regressão do Ollama (CA 23)', () => {
    it('startOllama usa o spawn injetado e continua classificando ENOENT como binary-missing', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.startOllama();
      child.emit('error', Object.assign(new Error('nope'), { code: 'ENOENT' }));

      await expect(promise).resolves.toEqual({ started: false, reason: 'binary-missing' });
      expect(spawnStub).toHaveBeenCalledWith('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
      });
    });

    it('startOllama resolve started:true no evento "spawn"', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.startOllama();
      child.emit('spawn');

      await expect(promise).resolves.toEqual({ started: true });
    });
  });

  describe('inspectSearchContainer (SPEC-0061, CA 20/21) — fronteira spawn fake', () => {
    it('ENOENT produz "unavailable" e nunca lança', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.inspectSearchContainer('searxng');
      child.emit('error', Object.assign(new Error('nope'), { code: 'ENOENT' }));

      await expect(promise).resolves.toBe('unavailable');
    });

    it('exit 0 + stdout "true" produz "running"', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.inspectSearchContainer('searxng');
      child.stdout.emit('data', Buffer.from('true\n'));
      child.emit('close', 0);

      await expect(promise).resolves.toBe('running');
    });

    it('exit 0 + stdout "false" produz "stopped"', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.inspectSearchContainer('searxng');
      child.stdout.emit('data', Buffer.from('false\n'));
      child.emit('close', 0);

      await expect(promise).resolves.toBe('stopped');
    });

    it('exit 0 + stdout inesperado produz "unknown"', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.inspectSearchContainer('searxng');
      child.stdout.emit('data', Buffer.from('lixo\n'));
      child.emit('close', 0);

      await expect(promise).resolves.toBe('unknown');
    });

    it('exit != 0 produz "unknown" mesmo sem stdout', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.inspectSearchContainer('searxng');
      child.emit('close', 1);

      await expect(promise).resolves.toBe('unknown');
    });

    it('argv inclui "--type","container" e o nome do container como elemento próprio (CA 21/D9)', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.inspectSearchContainer('searxng');
      child.emit('close', 0);
      await promise;

      expect(spawnStub).toHaveBeenCalledWith(
        'docker',
        ['inspect', '--type', 'container', '--format', '{{.State.Running}}', 'searxng'],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
    });
  });

  describe('startSearchContainer (SPEC-0061, CA 20/21)', () => {
    it('exit 0 produz started:true', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.startSearchContainer('searxng');
      child.emit('close', 0);

      await expect(promise).resolves.toEqual({ started: true });
      expect(spawnStub).toHaveBeenCalledWith('docker', ['start', 'searxng'], { stdio: 'ignore' });
    });

    it('exit != 0 produz started:false com reason start-failed', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.startSearchContainer('searxng');
      child.emit('close', 1);

      await expect(promise).resolves.toEqual({ started: false, reason: 'start-failed' });
    });

    it('ENOENT produz started:false com reason docker-unavailable', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.startSearchContainer('searxng');
      child.emit('error', Object.assign(new Error('nope'), { code: 'ENOENT' }));

      await expect(promise).resolves.toEqual({ started: false, reason: 'docker-unavailable' });
    });
  });

  describe('stopSearchContainer (SPEC-0061, CA 20) — nunca lança', () => {
    it('exit != 0 é ignorado, nunca lança', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.stopSearchContainer('searxng');
      child.emit('close', 1);

      await expect(promise).resolves.toBeUndefined();
      expect(spawnStub).toHaveBeenCalledWith('docker', ['stop', 'searxng'], { stdio: 'ignore' });
    });

    it('ENOENT é ignorado, nunca lança', async () => {
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child);
      const port = nodeProcessPort({
        spawn: spawnStub as unknown as typeof import('node:child_process').spawn,
      });

      const promise = port.stopSearchContainer('searxng');
      child.emit('error', Object.assign(new Error('nope'), { code: 'ENOENT' }));

      await expect(promise).resolves.toBeUndefined();
    });
  });
});
