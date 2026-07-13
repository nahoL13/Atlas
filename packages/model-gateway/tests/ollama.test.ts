import { describe, expect, it } from 'vitest';
import { createOllamaProvider } from '../src/providers/ollama.js';
import { ModelGatewayError } from '../src/errors.js';
import type { HttpDeps } from '../src/model-gateway.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(response: Response | (() => Promise<Response>)): {
  deps: HttpDeps;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return typeof response === 'function' ? response() : response;
  }) as unknown as typeof fetch;
  return { deps: { fetch: fetchStub }, calls };
}

describe('ollama provider', () => {
  it('monta a requisição e mapeia a resposta', async () => {
    const { deps, calls } = stubFetch(jsonResponse({ message: { content: 'oi local' } }));
    const gateway = createOllamaProvider(
      { provider: 'local', model: 'llama3.2', baseUrl: 'http://host:1234' },
      deps,
    );

    const result = await gateway.generate({ messages: [{ role: 'user', content: 'oi' }] });

    expect(result.text).toBe('oi local');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://host:1234/api/chat');
    const parsed = JSON.parse(calls[0]!.init!.body as string) as {
      model: string;
      stream: boolean;
      messages: unknown;
    };
    expect(parsed.model).toBe('llama3.2');
    expect(parsed.stream).toBe(false);
    expect(parsed.messages).toEqual([{ role: 'user', content: 'oi' }]);
  });

  it('usa localhost:11434 como baseUrl default', async () => {
    const { deps, calls } = stubFetch(jsonResponse({ message: { content: 'x' } }));
    const gateway = createOllamaProvider({ provider: 'local', model: 'llama3.2' }, deps);
    await gateway.generate({ messages: [{ role: 'user', content: 'oi' }] });
    expect(calls[0]!.url).toBe('http://localhost:11434/api/chat');
  });

  it('sem model lança ModelGatewayError', async () => {
    const { deps } = stubFetch(jsonResponse({}));
    const gateway = createOllamaProvider({ provider: 'local' }, deps);
    await expect(gateway.generate({ messages: [] })).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it('status >= 400 lança ModelGatewayError', async () => {
    const { deps } = stubFetch(jsonResponse({}, 500));
    const gateway = createOllamaProvider({ provider: 'local', model: 'llama3.2' }, deps);
    await expect(
      gateway.generate({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it('fetch que rejeita vira ModelGatewayError', async () => {
    const { deps } = stubFetch(() => Promise.reject(new Error('rede caiu')));
    const gateway = createOllamaProvider({ provider: 'local', model: 'llama3.2' }, deps);
    await expect(
      gateway.generate({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
  });
});
