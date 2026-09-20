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
  describe('inspectOllama (SPEC-0063, CA 2/3) — substitui isOllamaRunning', () => {
    it('response.ok false ⇒ { running: false }', async () => {
      const fetchStub = (async () => jsonResponse(500)) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      await expect(port.inspectOllama('http://x:1')).resolves.toEqual({ running: false });
    });

    it('fetch rejeita ⇒ { running: false }, nunca lança', async () => {
      const fetchStub = (() => Promise.reject(new Error('boom'))) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      await expect(port.inspectOllama('http://x:1')).resolves.toEqual({ running: false });
    });

    it('fetch síncrono lançando ⇒ { running: false }, nunca lança', async () => {
      const fetchStub = (() => {
        throw new Error('boom síncrono');
      }) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      await expect(port.inspectOllama('http://x:1')).resolves.toEqual({ running: false });
    });

    it('corpo {"models":[{"name":"a:latest"}]} ⇒ { running: true, models: ["a:latest"] }', async () => {
      const fetchStub = (async () =>
        new Response(JSON.stringify({ models: [{ name: 'a:latest' }] }), {
          status: 200,
        })) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      await expect(port.inspectOllama('http://x:1')).resolves.toEqual({
        running: true,
        models: ['a:latest'],
      });
    });

    it('corpo {"models":[]} ⇒ { running: true, models: [] }', async () => {
      const fetchStub = (async () =>
        new Response(JSON.stringify({ models: [] }), { status: 200 })) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      await expect(port.inspectOllama('http://x:1')).resolves.toEqual({
        running: true,
        models: [],
      });
    });

    it('corpo não-JSON ⇒ { running: true, models: undefined }', async () => {
      const fetchStub = (async () =>
        new Response('não é json', { status: 200 })) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      await expect(port.inspectOllama('http://x:1')).resolves.toEqual({
        running: true,
        models: undefined,
      });
    });

    it('"models" ausente ⇒ { running: true, models: undefined }', async () => {
      const fetchStub = (async () =>
        new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      await expect(port.inspectOllama('http://x:1')).resolves.toEqual({
        running: true,
        models: undefined,
      });
    });

    it('"models" não-array ⇒ { running: true, models: undefined }', async () => {
      const fetchStub = (async () =>
        new Response(JSON.stringify({ models: 'x' }), { status: 200 })) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      await expect(port.inspectOllama('http://x:1')).resolves.toEqual({
        running: true,
        models: undefined,
      });
    });

    it('entradas malformadas são descartadas e os nomes válidos preservados na ordem (CA3)', async () => {
      const fetchStub = (async () =>
        new Response(
          JSON.stringify({
            models: [
              { name: 'a:latest' },
              { no_name: true },
              { name: '' },
              { name: 42 },
              { name: 'b:latest' },
            ],
          }),
          { status: 200 },
        )) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      await expect(port.inspectOllama('http://x:1')).resolves.toEqual({
        running: true,
        models: ['a:latest', 'b:latest'],
      });
    });

    it('faz exatamente uma requisição, com timeout de 2000ms', async () => {
      const fetchStub = vi.fn(async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return jsonResponse(200);
      }) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      await port.inspectOllama('http://x:1');

      expect(fetchStub).toHaveBeenCalledTimes(1);
      expect(fetchStub).toHaveBeenCalledWith('http://x:1/api/tags', expect.anything());
    });
  });

  describe('pullOllamaModel (SPEC-0063, CA 12–15)', () => {
    function streamResponse(lines: readonly string[], status = 200): Response {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const line of lines) {
            controller.enqueue(encoder.encode(`${line}\n`));
          }
          controller.close();
        },
      });
      return new Response(stream, { status });
    }

    function noopProgress(): void {}

    it('faz um POST /api/pull com { name, stream: true } e repassa o signal (CA12)', async () => {
      const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toEqual({ 'content-type': 'application/json' });
        expect(init?.body).toBe(JSON.stringify({ name: 'llama3.2', stream: true }));
        return streamResponse(['{"status":"success"}']);
      });
      const port = nodeProcessPort({ fetch: mockFetch as unknown as typeof fetch });
      const controller = new AbortController();

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: controller.signal,
        onProgress: noopProgress,
      });

      expect(outcome).toEqual({ status: 'installed', model: 'llama3.2' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('http://x:1/api/pull');
      expect((init as RequestInit).signal).toBe(controller.signal);
    });

    it('response.ok false ⇒ failed/rejected, sem ler o corpo (CA12)', async () => {
      let bodyTouched = false;
      const response = {
        ok: false,
        get body(): never {
          bodyTouched = true;
          throw new Error('body não deveria ser lido com response.ok === false');
        },
      } as unknown as Response;
      const fetchStub = (async () => response) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: noopProgress,
      });

      expect(outcome).toEqual({ status: 'failed', model: 'llama3.2', reason: 'rejected' });
      expect(bodyTouched).toBe(false);
    });

    it('NDJSON com pulling/downloading/success ⇒ installed com exatamente um onProgress (CA13)', async () => {
      const fetchStub = (async () =>
        streamResponse([
          '{"status":"pulling"}',
          '{"status":"downloading","completed":10,"total":100}',
          '{"status":"success"}',
        ])) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });
      const progress: unknown[] = [];

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: (p) => progress.push(p),
      });

      expect(outcome).toEqual({ status: 'installed', model: 'llama3.2' });
      expect(progress).toEqual([{ model: 'llama3.2', completedBytes: 10, totalBytes: 100 }]);
    });

    it('completed/total não finitos ou negativos são ignorados (CA13)', async () => {
      const fetchStub = (async () =>
        streamResponse([
          '{"status":"downloading","completed":"dez","total":-5}',
          '{"status":"downloading","completed":NaN}',
          '{"status":"success"}',
        ])) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });
      const progress: unknown[] = [];

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: (p) => progress.push(p),
      });

      expect(outcome).toEqual({ status: 'installed', model: 'llama3.2' });
      expect(progress).toEqual([]);
    });

    it('linha ilegível é ignorada, o download conclui normalmente (CA14)', async () => {
      const fetchStub = (async () =>
        streamResponse(['isto não é json', '{"status":"success"}'])) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: noopProgress,
      });

      expect(outcome).toEqual({ status: 'installed', model: 'llama3.2' });
    });

    it('linha com campo error ⇒ failed/stream-failed (CA14)', async () => {
      const fetchStub = (async () =>
        streamResponse([
          '{"status":"pulling"}',
          '{"error":"modelo não encontrado no registro"}',
        ])) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: noopProgress,
      });

      expect(outcome).toEqual({ status: 'failed', model: 'llama3.2', reason: 'stream-failed' });
    });

    it('fim do stream sem linha de sucesso ⇒ failed/stream-failed (CA14)', async () => {
      const fetchStub = (async () =>
        streamResponse(['{"status":"pulling"}'])) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: noopProgress,
      });

      expect(outcome).toEqual({ status: 'failed', model: 'llama3.2', reason: 'stream-failed' });
    });

    it('rejeição do fetch (signal não abortado) ⇒ failed/unreachable (CA14)', async () => {
      const fetchStub = (() => Promise.reject(new Error('boom'))) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: noopProgress,
      });

      expect(outcome).toEqual({ status: 'failed', model: 'llama3.2', reason: 'unreachable' });
    });

    it('signal já abortado quando o fetch rejeita ⇒ cancelled, nunca failed', async () => {
      const controller = new AbortController();
      const fetchStub = (() => {
        controller.abort();
        return Promise.reject(new Error('aborted'));
      }) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: controller.signal,
        onProgress: noopProgress,
      });

      expect(outcome).toEqual({ status: 'cancelled', model: 'llama3.2' });
    });

    it('nenhum texto do provedor escapa da porta (CA15): status/error/digest arbitrários nunca aparecem no desfecho/progresso', async () => {
      const secretText = 'TEXTO-SECRETO-DO-PROVEDOR-NAO-PODE-VAZAR';
      const fetchStub = (async () =>
        streamResponse([
          `{"status":"${secretText}","digest":"${secretText}","completed":1,"total":2}`,
          `{"error":"${secretText}"}`,
        ])) as unknown as typeof fetch;
      const port = nodeProcessPort({ fetch: fetchStub });
      const progress: unknown[] = [];

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: (p) => progress.push(p),
      });

      expect(JSON.stringify(outcome)).not.toContain(secretText);
      expect(JSON.stringify(progress)).not.toContain(secretText);
      expect(outcome).toEqual({ status: 'failed', model: 'llama3.2', reason: 'stream-failed' });
      expect(progress).toEqual([{ model: 'llama3.2', completedBytes: 1, totalBytes: 2 }]);
    });
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
