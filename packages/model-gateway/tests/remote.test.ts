import { describe, expect, it } from 'vitest';
import { createRemoteProvider } from '../src/providers/remote.js';
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

const base = { provider: 'remote', baseUrl: 'https://api.x/v1', apiKey: 'secret', model: 'gpt-x' } as const;

describe('remote provider', () => {
  it('envia auth + corpo e mapeia a resposta', async () => {
    const { deps, calls } = stubFetch(
      jsonResponse({ choices: [{ message: { content: 'oi remoto' } }] }),
    );
    const gateway = createRemoteProvider({ ...base }, deps);

    const result = await gateway.generate({
      messages: [{ role: 'user', content: 'oi' }],
      temperature: 0.5,
      maxTokens: 100,
    });

    expect(result.text).toBe('oi remoto');
    expect(calls[0]!.url).toBe('https://api.x/v1/chat/completions');
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret');
    const parsed = JSON.parse(calls[0]!.init!.body as string) as {
      model: string;
      messages: unknown;
      max_tokens: number;
    };
    expect(parsed.model).toBe('gpt-x');
    expect(parsed.messages).toEqual([{ role: 'user', content: 'oi' }]);
    expect(parsed.max_tokens).toBe(100);
  });

  it('sem baseUrl lança na criação', () => {
    const { deps } = stubFetch(jsonResponse({}));
    expect(() =>
      createRemoteProvider({ provider: 'remote', apiKey: 'k', model: 'm' }, deps),
    ).toThrow(ModelGatewayError);
  });

  it('sem apiKey lança na criação', () => {
    const { deps } = stubFetch(jsonResponse({}));
    expect(() =>
      createRemoteProvider({ provider: 'remote', baseUrl: 'https://api.x', model: 'm' }, deps),
    ).toThrow(ModelGatewayError);
  });

  it('sem model lança no generate', async () => {
    const { deps } = stubFetch(jsonResponse({}));
    const gateway = createRemoteProvider(
      { provider: 'remote', baseUrl: 'https://api.x', apiKey: 'k' },
      deps,
    );
    await expect(gateway.generate({ messages: [] })).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it('status >= 400 lança ModelGatewayError', async () => {
    const { deps } = stubFetch(jsonResponse({}, 401));
    const gateway = createRemoteProvider({ ...base }, deps);
    await expect(
      gateway.generate({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
  });
});
