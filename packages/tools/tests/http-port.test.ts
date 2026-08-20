import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HTTP_BODY_LIMIT_BYTES,
  HTTP_TIMEOUT_MS,
  HTTP_TRUNCATION_MARKER,
  nodeHttpPort,
  type FetchLike,
} from '../src/http-port.js';

function textStream(
  text: string,
  opts: { onCancel?: (reason?: unknown) => void; chunkSize?: number } = {},
): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  const chunkSize = opts.chunkSize ?? 4096;
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const next = bytes.subarray(offset, offset + chunkSize);
      offset += next.byteLength;
      controller.enqueue(next);
    },
    cancel(reason) {
      opts.onCancel?.(reason);
    },
  });
}

function fakeResponse(opts: {
  status?: number;
  type?: ResponseType;
  headers?: Record<string, string>;
  body?: ReadableStream<Uint8Array> | null;
}): Response {
  const headers = new Headers(opts.headers ?? {});
  return {
    status: opts.status ?? 200,
    type: opts.type ?? 'basic',
    headers,
    body: opts.body ?? null,
  } as unknown as Response;
}

function fetchCapturing(response: Response): { fetch: FetchLike; calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  const fetch = (async (_url: string | URL, init?: RequestInit) => {
    calls.push(init ?? {});
    return response;
  }) as unknown as FetchLike;
  return { fetch, calls };
}

describe('nodeHttpPort — init de fetch (D6)', () => {
  it('init tem exatamente as chaves method, redirect, signal', async () => {
    const { fetch, calls } = fetchCapturing(fakeResponse({ status: 200 }));
    const port = nodeHttpPort({ fetch });
    await port.get('https://example.com/');
    expect(Object.keys(calls[0]!).sort()).toEqual(['method', 'redirect', 'signal']);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.redirect).toBe('manual');
  });

  it('init não tem headers/body/credentials/referrer/cache', async () => {
    const { fetch, calls } = fetchCapturing(fakeResponse({ status: 200 }));
    const port = nodeHttpPort({ fetch });
    await port.get('https://example.com/');
    const init = calls[0]! as RequestInit & Record<string, unknown>;
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBeUndefined();
    expect(init.referrer).toBeUndefined();
    expect(init.cache).toBeUndefined();
  });

  it('nenhum valor de process.env aparece na URL ou no init', async () => {
    process.env.ATLAS_TEST_SECRET = 'super-secreto';
    try {
      const { fetch, calls } = fetchCapturing(fakeResponse({ status: 200 }));
      const port = nodeHttpPort({ fetch });
      const url = 'https://example.com/path';
      await port.get(url);
      const serializedInit = JSON.stringify(
        Object.fromEntries(
          Object.entries(calls[0]!).filter(([, value]) => typeof value !== 'object'),
        ),
      );
      expect(serializedInit).not.toContain('super-secreto');
      expect(url).not.toContain('super-secreto');
    } finally {
      delete process.env.ATLAS_TEST_SECRET;
    }
  });
});

describe('nodeHttpPort — redirect manual (D10)', () => {
  it('302 com location: fetch chamado uma única vez, status e location capturados', async () => {
    const response = fakeResponse({
      status: 302,
      headers: { location: 'https://destino.example.com/novo' },
    });
    const { fetch, calls } = fetchCapturing(response);
    const port = nodeHttpPort({ fetch });
    const result = await port.get('https://example.com/a');
    expect(calls).toHaveLength(1);
    expect(result.status).toBe(302);
    expect(result.location).toBe('https://destino.example.com/novo');
  });
});

describe('nodeHttpPort — guarda fail-closed de redirect opaco (D18)', () => {
  it('status 0 rejeita com Error própria, nunca devolve HttpResponse', async () => {
    const response = fakeResponse({ status: 0, type: 'basic' });
    const { fetch } = fetchCapturing(response);
    const port = nodeHttpPort({ fetch });
    await expect(port.get('https://example.com/')).rejects.toThrow(/redirect opaco/);
  });

  it('type "opaqueredirect" rejeita com Error própria, mesmo com status não-zero', async () => {
    const response = fakeResponse({ status: 200, type: 'opaqueredirect' });
    const { fetch } = fetchCapturing(response);
    const port = nodeHttpPort({ fetch });
    await expect(port.get('https://example.com/')).rejects.toThrow(/redirect opaco/);
  });
});

describe('nodeHttpPort — truncagem de corpo (D8)', () => {
  it('corpo maior que 64 KiB é truncado, marcador presente, stream cancelado', async () => {
    const bigText = 'a'.repeat(HTTP_BODY_LIMIT_BYTES + 10_000);
    let cancelReason: unknown;
    const body = textStream(bigText, {
      onCancel: (reason) => {
        cancelReason = reason ?? 'cancelled';
      },
    });
    const response = fakeResponse({ status: 200, headers: { 'content-type': 'text/plain' }, body });
    const { fetch } = fetchCapturing(response);
    const port = nodeHttpPort({ fetch });
    const result = await port.get('https://example.com/big');
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBeLessThanOrEqual(
      HTTP_BODY_LIMIT_BYTES + HTTP_TRUNCATION_MARKER.length,
    );
    expect(result.body).toContain(HTTP_TRUNCATION_MARKER);
    expect(cancelReason).toBeDefined();
  });

  it('corpo menor que o teto sai íntegro, truncated false', async () => {
    const text = 'olá mundo, corpo pequeno';
    const body = textStream(text);
    const response = fakeResponse({ status: 200, headers: { 'content-type': 'text/plain' }, body });
    const { fetch } = fetchCapturing(response);
    const port = nodeHttpPort({ fetch });
    const result = await port.get('https://example.com/small');
    expect(result.truncated).toBe(false);
    expect(result.body).toBe(text);
  });
});

describe('nodeHttpPort — corpo textual × não textual (D9)', () => {
  it('content-type image/png: corpo omitido, cancelado sem reader.read()', async () => {
    let cancelled = false;
    let readCalled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('bytes'));
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    // Envolve getReader para provar que o caminho de omissão nunca lê o
    // stream (só chama body.cancel() diretamente) — só chamar getReader()
    // já seria o primeiro passo de leitura.
    const originalGetReader = body.getReader.bind(body);
    (body as { getReader: unknown }).getReader = () => {
      readCalled = true;
      return originalGetReader();
    };
    const response = fakeResponse({
      status: 200,
      headers: { 'content-type': 'image/png' },
      body,
    });
    const { fetch } = fetchCapturing(response);
    const port = nodeHttpPort({ fetch });
    const result = await port.get('https://example.com/img.png');
    expect(result.bodyOmitted).toBe(true);
    expect(result.body).toBe('');
    expect(cancelled).toBe(true);
    expect(readCalled).toBe(false);
  });

  it('content-type ausente: corpo omitido', async () => {
    const body = textStream('conteúdo qualquer');
    const response = fakeResponse({ status: 200, body });
    const { fetch } = fetchCapturing(response);
    const port = nodeHttpPort({ fetch });
    const result = await port.get('https://example.com/nada');
    expect(result.bodyOmitted).toBe(true);
    expect(result.body).toBe('');
  });

  it.each(['application/json', 'text/plain', 'text/html; charset=utf-8', 'application/xhtml+xml'])(
    'content-type %s: corpo lido normalmente',
    async (contentType) => {
      const text = '{"ok":true}';
      const body = textStream(text);
      const response = fakeResponse({
        status: 200,
        headers: { 'content-type': contentType },
        body,
      });
      const { fetch } = fetchCapturing(response);
      const port = nodeHttpPort({ fetch });
      const result = await port.get('https://example.com/x');
      expect(result.bodyOmitted).toBe(false);
      expect(result.body).toBe(text);
    },
  );
});

describe('nodeHttpPort — timeout e falha de transporte (D7)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetch que nunca resolve rejeita após HTTP_TIMEOUT_MS, aborta o signal e limpa o timer', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    let capturedSignal: AbortSignal | undefined;
    const fetch = ((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('esta operação foi abortada');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }) as unknown as FetchLike;

    const port = nodeHttpPort({ fetch, timeoutMs: HTTP_TIMEOUT_MS });
    const promise = port.get('https://example.com/lento');
    const expectation = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(HTTP_TIMEOUT_MS);
    await expectation;

    expect(capturedSignal?.aborted).toBe(true);
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('fetch que rejeita produz Error com mensagem legível, nunca rejeição opaca', async () => {
    const fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as FetchLike;
    const port = nodeHttpPort({ fetch });
    await expect(port.get('https://example.com/')).rejects.toThrow(/falha ao requisitar/);
  });
});
