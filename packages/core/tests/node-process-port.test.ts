import { describe, expect, it } from 'vitest';
import { nodeProcessPort } from '../src/dependencies/node-process-port.js';

function jsonResponse(status: number): Response {
  return new Response('{}', { status });
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
});
