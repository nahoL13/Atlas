import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nodeProcessPort } from '../src/dependencies/node-process-port.js';

function jsonResponse(status: number): Response {
  return new Response('{}', { status });
}

type FakeStdout = EventEmitter & { destroy: () => void; destroyed: boolean };
type FakeChildProcess = ChildProcess & {
  stdout: FakeStdout;
  killCalls: number;
  unrefCalls: number;
};

/**
 * Fake mínimo de `ChildProcess` (SPEC-0061, CA 20/21) — `EventEmitter` com um
 * `stdout` também `EventEmitter`, o suficiente para exercitar
 * `once('error'|'close'|'exit'|'spawn')` e `stdout.on('data', …)` sem
 * spawnar processo real. Desde a SPEC-0064 (item 5.7/CA 27-30), registra
 * `kill()`/`unref()` (contadores) e o `stdout` ganha `destroy()` — o
 * suficiente para provar a higiene de *handle* do watchdog sem depender de
 * mocks externos. `unrefThrows` simula um `unref()` que lança (CA 30).
 */
function fakeChildProcess(opts: { unrefThrows?: boolean } = {}): FakeChildProcess {
  const child = new EventEmitter() as unknown as FakeChildProcess;
  const stdout = new EventEmitter() as unknown as FakeStdout;
  stdout.destroyed = false;
  stdout.destroy = () => {
    stdout.destroyed = true;
  };
  (child as unknown as { stdout: FakeStdout }).stdout = stdout;
  child.killCalls = 0;
  child.unrefCalls = 0;
  (child as unknown as { kill: () => boolean }).kill = () => {
    child.killCalls += 1;
    return true;
  };
  (child as unknown as { unref: () => ChildProcess }).unref = () => {
    child.unrefCalls += 1;
    if (opts.unrefThrows === true) {
      throw new Error('unref falhou (fake, CA 30)');
    }
    return child;
  };
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

    it('faz um POST /api/pull com { name, stream: true } e encaminha um AbortSignal interno (CA12, SPEC-0064/D9)', async () => {
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
      // SPEC-0064/D9: o adaptador encaminha manualmente, nunca repassa o
      // signal externo direto ao fetch — é um AbortSignal distinto, não
      // abortado, que reflete o externo por encaminhamento de evento.
      const forwardedSignal = (init as RequestInit).signal;
      expect(forwardedSignal).toBeInstanceOf(AbortSignal);
      expect(forwardedSignal).not.toBe(controller.signal);
      expect(forwardedSignal?.aborted).toBe(false);
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

/** Valores pinados como dado normativo da SPEC-0064, item 1 (D4: não configuráveis). */
const SPAWN_HANDSHAKE_TIMEOUT_MS = 5_000;
const DOCKER_PROBE_TIMEOUT_MS = 5_000;
const DOCKER_COMMAND_TIMEOUT_MS = 30_000;
const MODEL_PULL_STALL_TIMEOUT_MS = 120_000;

/**
 * Verifica se `promise` ainda não assentou, sem travar o teste: uma promessa
 * já resolvida (`Promise.resolve(token)`) sempre vence a corrida contra uma
 * que segue pendente, porque só ela já está na fila de microtarefas.
 */
async function isPending(promise: Promise<unknown>): Promise<boolean> {
  const token = Symbol('pending');
  const winner = await Promise.race([promise, Promise.resolve(token)]);
  return winner === token;
}

function neverSettlingFetch(): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('esta operação foi abortada'), { name: 'AbortError' }));
      });
    });
  }) as unknown as typeof fetch;
}

/** Corpo cuja leitura nunca produz bytes/`done`, até o `signal` abortar (SPEC-0064, CA17/19). */
function hangingStreamResponse(signal: AbortSignal, status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener(
        'abort',
        () => {
          controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        },
        { once: true },
      );
    },
  });
  return new Response(stream, { status });
}

/**
 * Corpo que entrega `chunks` espaçados por `delayMs` (SPEC-0064, CA18) — prova
 * de que o orçamento é de inatividade: cada `pull()` demora, mas nunca mais
 * que o orçamento entre dois deles.
 */
function timedStreamResponse(
  chunks: readonly { delayMs: number; text: string }[],
  signal: AbortSignal,
  status = 200,
): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener(
        'abort',
        () => {
          controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        },
        { once: true },
      );
    },
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      const { delayMs, text } = chunks[index++]!;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      controller.enqueue(encoder.encode(`${text}\n`));
    },
  });
  return new Response(stream, { status });
}

function noop(): void {}

describe('Orçamentos de tempo — SPEC-0064 (watchdog do adaptador)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startOllama — SPAWN_HANDSHAKE_TIMEOUT_MS (CA 7-10, 27, 29, 30)', () => {
    it('nunca emite spawn/error ⇒ spawn-failed no orçamento exato, kill+unref uma vez (CA7/CA8/CA27)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.startOllama();
      await vi.advanceTimersByTimeAsync(SPAWN_HANDSHAKE_TIMEOUT_MS - 1);
      expect(await isPending(promise)).toBe(true);

      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toEqual({ started: false, reason: 'spawn-failed' });
      expect(child.killCalls).toBe(1);
      expect(child.unrefCalls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('spawn tardio após o estouro não altera o desfecho, não atribui posse, e não lança (CA9)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.startOllama();
      await vi.advanceTimersByTimeAsync(SPAWN_HANDSHAKE_TIMEOUT_MS);
      const outcome = await promise;
      expect(() => child.emit('spawn')).not.toThrow();
      expect(outcome).toEqual({ started: false, reason: 'spawn-failed' });

      // posse não atribuída (item 2.2): stopOllama() não encontra filho.
      await port.stopOllama();
      expect(child.killCalls).toBe(1); // só o kill do watchdog — nenhum de stopOllama
    });

    it('caminho feliz: spawn antes do orçamento ⇒ started:true, kill nunca chamado, timers zerados (CA10/CA29)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.startOllama();
      child.emit('spawn');

      await expect(promise).resolves.toEqual({ started: true });
      expect(child.killCalls).toBe(0);
      expect(child.unrefCalls).toBe(1); // só o unref do handler de 'spawn' já existente
      expect(vi.getTimerCount()).toBe(0);
    });

    it('unref() que lança no estouro não impede o assentamento nem propaga (CA30)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess({ unrefThrows: true });
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.startOllama();
      await vi.advanceTimersByTimeAsync(SPAWN_HANDSHAKE_TIMEOUT_MS);

      await expect(promise).resolves.toEqual({ started: false, reason: 'spawn-failed' });
      expect(child.killCalls).toBe(1);
    });
  });

  describe('inspectSearchContainer — DOCKER_PROBE_TIMEOUT_MS (CA 11, 14, 15, 27-29)', () => {
    it('sem close/error ⇒ unavailable no orçamento exato, kill+unref uma vez, stdout destruído (CA11/CA27/CA28)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const removeAllSpy = vi.spyOn(child.stdout, 'removeAllListeners');
      const destroySpy = vi.spyOn(child.stdout, 'destroy');
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.inspectSearchContainer('searxng');
      await vi.advanceTimersByTimeAsync(DOCKER_PROBE_TIMEOUT_MS - 1);
      expect(await isPending(promise)).toBe(true);

      await vi.advanceTimersByTimeAsync(1);
      // Nunca 'unknown' (D8) — um estouro não é resposta do daemon.
      await expect(promise).resolves.toBe('unavailable');
      expect(child.killCalls).toBe(1);
      expect(child.unrefCalls).toBe(1);
      expect(removeAllSpy).toHaveBeenCalledWith('data');
      expect(destroySpy).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('data tardio após o estouro não altera o desfecho nem lança (CA14/CA28)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.inspectSearchContainer('searxng');
      await vi.advanceTimersByTimeAsync(DOCKER_PROBE_TIMEOUT_MS);
      const outcome = await promise;
      expect(() => child.stdout.emit('data', Buffer.from('true\n'))).not.toThrow();
      expect(outcome).toBe('unavailable');
    });

    it('close tardio após o estouro não altera o desfecho nem lança (CA14)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.inspectSearchContainer('searxng');
      await vi.advanceTimersByTimeAsync(DOCKER_PROBE_TIMEOUT_MS);
      const outcome = await promise;
      expect(() => child.emit('close', 0)).not.toThrow();
      expect(outcome).toBe('unavailable');
    });

    it('caminho feliz: close antes do orçamento ⇒ desfecho de hoje, kill/unref nunca chamados, stdout não destruído (CA15/CA29)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const destroySpy = vi.spyOn(child.stdout, 'destroy');
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.inspectSearchContainer('searxng');
      child.stdout.emit('data', Buffer.from('true\n'));
      child.emit('close', 0);

      await expect(promise).resolves.toBe('running');
      expect(child.killCalls).toBe(0);
      expect(child.unrefCalls).toBe(0);
      expect(destroySpy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('startSearchContainer — DOCKER_COMMAND_TIMEOUT_MS (CA 12, 14, 15, 27, 29)', () => {
    it('sem close/error ⇒ docker-unavailable no orçamento exato, kill+unref uma vez (CA12/CA27)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.startSearchContainer('searxng');
      await vi.advanceTimersByTimeAsync(DOCKER_COMMAND_TIMEOUT_MS - 1);
      expect(await isPending(promise)).toBe(true);

      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toEqual({ started: false, reason: 'docker-unavailable' });
      expect(child.killCalls).toBe(1);
      expect(child.unrefCalls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('close tardio após o estouro não altera o desfecho nem lança (CA14)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.startSearchContainer('searxng');
      await vi.advanceTimersByTimeAsync(DOCKER_COMMAND_TIMEOUT_MS);
      const outcome = await promise;
      expect(() => child.emit('close', 0)).not.toThrow();
      expect(outcome).toEqual({ started: false, reason: 'docker-unavailable' });
    });

    it('caminho feliz: close 0 antes do orçamento ⇒ started:true, kill/unref nunca chamados (CA15/CA29)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.startSearchContainer('searxng');
      child.emit('close', 0);

      await expect(promise).resolves.toEqual({ started: true });
      expect(child.killCalls).toBe(0);
      expect(child.unrefCalls).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('stopSearchContainer — DOCKER_COMMAND_TIMEOUT_MS (CA 13, 14, 15, 27, 29)', () => {
    it('sem close/error ⇒ resolve void no orçamento exato, sem lançar, kill+unref uma vez (CA13/CA27)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.stopSearchContainer('searxng');
      await vi.advanceTimersByTimeAsync(DOCKER_COMMAND_TIMEOUT_MS - 1);
      expect(await isPending(promise)).toBe(true);

      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toBeUndefined();
      expect(child.killCalls).toBe(1);
      expect(child.unrefCalls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('close tardio após o estouro não lança (CA14)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.stopSearchContainer('searxng');
      await vi.advanceTimersByTimeAsync(DOCKER_COMMAND_TIMEOUT_MS);
      await promise;
      expect(() => child.emit('close', 0)).not.toThrow();
    });

    it('caminho feliz: close antes do orçamento ⇒ resolve void, kill/unref nunca chamados (CA15/CA29)', async () => {
      vi.useFakeTimers();
      const child = fakeChildProcess();
      const spawnStub = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
      const port = nodeProcessPort({ spawn: spawnStub });

      const promise = port.stopSearchContainer('searxng');
      child.emit('close', 0);

      await expect(promise).resolves.toBeUndefined();
      expect(child.killCalls).toBe(0);
      expect(child.unrefCalls).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('pullOllamaModel — MODEL_PULL_STALL_TIMEOUT_MS, watchdog de estagnação (CA 16-19, 21, 31)', () => {
    it('nenhuma resposta dentro do orçamento ⇒ failed/unreachable (CA16)', async () => {
      vi.useFakeTimers();
      const fetchStub = neverSettlingFetch();
      const port = nodeProcessPort({ fetch: fetchStub });

      const promise = port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: noop,
      });
      await vi.advanceTimersByTimeAsync(MODEL_PULL_STALL_TIMEOUT_MS);

      await expect(promise).resolves.toEqual({
        status: 'failed',
        model: 'llama3.2',
        reason: 'unreachable',
      });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('resposta recebida e stream sem bytes novos por MODEL_PULL_STALL_TIMEOUT_MS ⇒ failed/stream-failed (CA17)', async () => {
      vi.useFakeTimers();
      const fetchStub = vi.fn(async (_url: string, init?: RequestInit) =>
        hangingStreamResponse(init!.signal as AbortSignal),
      );
      const port = nodeProcessPort({ fetch: fetchStub as unknown as typeof fetch });

      const promise = port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: noop,
      });
      await vi.advanceTimersByTimeAsync(MODEL_PULL_STALL_TIMEOUT_MS);

      await expect(promise).resolves.toEqual({
        status: 'failed',
        model: 'llama3.2',
        reason: 'stream-failed',
      });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('chunks a cada quase-orçamento, somando bem mais que o orçamento total, terminam em installed (CA18 — prova de que não há timeout total)', async () => {
      vi.useFakeTimers();
      const chunkDelay = MODEL_PULL_STALL_TIMEOUT_MS - 1;
      const chunks = [
        { delayMs: chunkDelay, text: '{"status":"pulling"}' },
        { delayMs: chunkDelay, text: '{"status":"downloading","completed":1,"total":4}' },
        { delayMs: chunkDelay, text: '{"status":"downloading","completed":2,"total":4}' },
        { delayMs: chunkDelay, text: '{"status":"success"}' },
      ];
      const fetchStub = vi.fn(async (_url: string, init?: RequestInit) =>
        timedStreamResponse(chunks, init!.signal as AbortSignal),
      );
      const port = nodeProcessPort({ fetch: fetchStub as unknown as typeof fetch });

      const promise = port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: new AbortController().signal,
        onProgress: noop,
      });

      // soma dos delays > 3 × o orçamento; nenhum intervalo isolado o atinge.
      await vi.advanceTimersByTimeAsync(chunkDelay * chunks.length);

      await expect(promise).resolves.toEqual({ status: 'installed', model: 'llama3.2' });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('cancelamento humano durante a janela de estagnação ⇒ cancelled, nunca stream-failed/unreachable (CA19)', async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const fetchStub = vi.fn(async (_url: string, init?: RequestInit) =>
        hangingStreamResponse(init!.signal as AbortSignal),
      );
      const port = nodeProcessPort({ fetch: fetchStub as unknown as typeof fetch });

      const promise = port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: controller.signal,
        onProgress: noop,
      });

      await vi.advanceTimersByTimeAsync(MODEL_PULL_STALL_TIMEOUT_MS / 2);
      controller.abort();

      await expect(promise).resolves.toEqual({ status: 'cancelled', model: 'llama3.2' });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('signal já abortado no instante da chamada ⇒ cancelled imediato, sem esperar o fetch (CA31/D19)', async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      controller.abort();
      const fetchStub = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.signal?.aborted === true) {
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        }
        // Não deveria ser alcançado: o signal interno já deveria estar
        // abortado (D19) — sem a checagem síncrona, ficaria pendurado aqui,
        // provando que a requisição "saiu pela rede" apesar do cancelamento.
        return new Promise<Response>(() => {});
      });
      const port = nodeProcessPort({ fetch: fetchStub as unknown as typeof fetch });

      const outcome = await port.pullOllamaModel({
        baseUrl: 'http://x:1',
        model: 'llama3.2',
        signal: controller.signal,
        onProgress: noop,
      });

      expect(outcome).toEqual({ status: 'cancelled', model: 'llama3.2' });
      expect(fetchStub).toHaveBeenCalledTimes(1);
      const [, init] = fetchStub.mock.calls[0]!;
      expect((init as RequestInit).signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
