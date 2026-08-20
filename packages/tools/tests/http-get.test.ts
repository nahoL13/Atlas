import { describe, expect, it } from 'vitest';
import type { HttpPort, HttpResponse } from '../src/http-port.js';
import { createHttpGetTool, resolveHttpTarget } from '../src/http-get.js';

const DESCRIPTION =
  'Busca o conteúdo de uma URL por uma única requisição HTTP GET. Recebe { url } com esquema\n' +
  'http ou https. Somente-leitura: nenhum outro método, nenhum cabeçalho customizado.\n' +
  'Redirecionamentos não são seguidos — uma resposta 3xx volta com o destino visível, sem ser\n' +
  'buscado. O corpo é truncado em 64 KiB e omitido quando não for texto. O host precisa estar\n' +
  'na lista de hosts permitidos pelo usuário, senão o passo é negado.';

function fakeHttp(overrides: Partial<HttpPort> = {}): { port: HttpPort; calls: string[] } {
  const calls: string[] = [];
  const port: HttpPort = {
    get: async (url: string) => {
      calls.push(url);
      const impl = overrides.get;
      if (impl) return impl(url);
      return baseResponse(url);
    },
  };
  return { port, calls };
}

function baseResponse(url: string, overrides: Partial<HttpResponse> = {}): HttpResponse {
  return {
    url,
    status: 200,
    contentType: 'text/plain',
    body: 'olá',
    truncated: false,
    bodyOmitted: false,
    ...overrides,
  };
}

describe('resolveHttpTarget', () => {
  it('deriva host em minúsculas e url = href normalizado', () => {
    const target = resolveHttpTarget({ url: 'https://Example.COM/a/b?q=1' });
    expect(target.host).toBe('example.com');
    expect(target.url).toBe('https://example.com/a/b?q=1');
    expect(target.error).toBeUndefined();
  });

  it('url é o .href do objeto URL parseado, não a string crua (D4)', () => {
    const raw = 'HTTPS://Example.COM:443/a/../b?q=1#frag';
    const target = resolveHttpTarget({ url: raw });
    expect(target.url).toBe(new URL(raw).href);
    expect(target.url).not.toBe(raw);
  });

  it('entrada já normalizada produz href estável, sem alteração', () => {
    const raw = 'https://example.com/a?b=1';
    const target = resolveHttpTarget({ url: raw });
    expect(target.url).toBe(raw);
  });

  it('args vazio/sem url → host="" e error presente', () => {
    const target = resolveHttpTarget({});
    expect(target.host).toBe('');
    expect(target.url).toBe('');
    expect(target.error).toBeDefined();
  });

  it('url não-string → host="" e error presente', () => {
    const target = resolveHttpTarget({ url: 42 });
    expect(target.host).toBe('');
    expect(target.error).toBeDefined();
  });

  it('url inválida → host="" e error presente', () => {
    const target = resolveHttpTarget({ url: 'não é uma url' });
    expect(target.host).toBe('');
    expect(target.error).toBeDefined();
  });

  it('esquema file:/ftp: → host="" e error presente', () => {
    expect(resolveHttpTarget({ url: 'file:///etc/passwd' }).host).toBe('');
    expect(resolveHttpTarget({ url: 'file:///etc/passwd' }).error).toBeDefined();
    expect(resolveHttpTarget({ url: 'ftp://example.com/x' }).host).toBe('');
    expect(resolveHttpTarget({ url: 'ftp://example.com/x' }).error).toBeDefined();
  });

  it('URL com credenciais embutidas → host="" e error presente (D11)', () => {
    const target = resolveHttpTarget({ url: 'https://user:pass@example.com/x' });
    expect(target.host).toBe('');
    expect(target.url).toBe('');
    expect(target.error).toBeDefined();
  });
});

describe('createHttpGetTool', () => {
  it('requirements nunca devolve null e declara host derivado do mesmo helper', () => {
    const { port } = fakeHttp();
    const tool = createHttpGetTool({ http: port });
    expect(tool.requirements?.({ url: 'https://Example.COM/a/b?q=1' })).toEqual({
      resource: { type: 'network', host: 'example.com' },
      access: 'read',
    });
  });

  it.each([
    {},
    { url: 42 },
    { url: 'não é uma url' },
    { url: 'file:///etc/passwd' },
    { url: 'https://user:pass@example.com/x' },
  ])('requirements(%j) nunca devolve null/undefined — host vazio bloqueável', (args) => {
    const { port } = fakeHttp();
    const tool = createHttpGetTool({ http: port });
    const req = tool.requirements?.(args);
    expect(req).toBeDefined();
    expect(req).toEqual({ resource: { type: 'network', host: '' }, access: 'read' });
  });

  it('requirements e run derivam o host/URL do mesmo helper (spy na porta)', async () => {
    const { port, calls } = fakeHttp();
    const tool = createHttpGetTool({ http: port });
    const args = { url: 'HTTPS://Example.COM:443/a/../b?q=1#frag' };
    const req = tool.requirements?.(args);
    await tool.run(args);
    expect(calls).toEqual([new URL(args.url).href]);
    expect(req?.resource.type).toBe('network');
    expect((req?.resource as { host: string }).host).toBe(new URL(args.url).hostname.toLowerCase());
  });

  it('Tool.description é exatamente a string pinada (D19)', () => {
    const { port } = fakeHttp();
    const tool = createHttpGetTool({ http: port });
    expect(tool.description).toBe(DESCRIPTION);
    expect(tool.description).toContain('GET');
    expect(tool.description).toContain('Redirecionamentos não são seguidos');
    expect(tool.description).toContain('64 KiB');
    expect(tool.description).toContain('lista de hosts permitidos');
  });

  it('run com URL inválida/esquema não-http(s)/credenciais → ok:false sem tocar a porta', async () => {
    const { port, calls } = fakeHttp();
    const tool = createHttpGetTool({ http: port });
    const invalid = await tool.run({ url: 'file:///etc/passwd' });
    expect(invalid.ok).toBe(false);
    const creds = await tool.run({ url: 'https://u:p@example.com/x' });
    expect(creds.ok).toBe(false);
    const missing = await tool.run({});
    expect(missing.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('run bem-sucedido: output contém url, status e content-type antes do corpo', async () => {
    const { port } = fakeHttp({
      get: async (url) =>
        baseResponse(url, { status: 200, contentType: 'text/plain', body: 'olá mundo' }),
    });
    const tool = createHttpGetTool({ http: port });
    const result = await tool.run({ url: 'https://example.com/a' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('url: https://example.com/a');
    expect(result.output).toContain('status: 200');
    expect(result.output).toContain('content-type: text/plain');
    expect(result.output).toContain('olá mundo');
    const urlIndex = result.output!.indexOf('url:');
    const statusIndex = result.output!.indexOf('status:');
    const contentTypeIndex = result.output!.indexOf('content-type:');
    const bodyIndex = result.output!.indexOf('olá mundo');
    expect(urlIndex).toBeLessThan(statusIndex);
    expect(statusIndex).toBeLessThan(contentTypeIndex);
    expect(contentTypeIndex).toBeLessThan(bodyIndex);
  });

  it('run sobre 301/302/307/308: ok:true, output com location e a nota de redirect não seguido', async () => {
    for (const status of [301, 302, 307, 308]) {
      const { port } = fakeHttp({
        get: async (url) =>
          baseResponse(url, {
            status,
            location: 'https://outro.example.com/destino',
            body: '',
            bodyOmitted: true,
          }),
      });
      const tool = createHttpGetTool({ http: port });
      const result = await tool.run({ url: 'https://example.com/a' });
      expect(result.ok).toBe(true);
      expect(result.output).toContain('location: https://outro.example.com/destino');
      expect(result.output).toContain('redirecionamento não seguido automaticamente');
    }
  });

  it('run sobre 404/500: ok:true com o status no output (não é falha de Tool)', async () => {
    const { port } = fakeHttp({
      get: async (url) => baseResponse(url, { status: 404, body: 'não encontrado' }),
    });
    const tool = createHttpGetTool({ http: port });
    const result = await tool.run({ url: 'https://example.com/a' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('status: 404');
  });

  it('porta que lança (timeout/DNS) → ok:false, nunca lança', async () => {
    const { port } = fakeHttp({
      get: async () => {
        throw new Error('falha ao requisitar: timeout');
      },
    });
    const tool = createHttpGetTool({ http: port });
    await expect(tool.run({ url: 'https://example.com/a' })).resolves.toMatchObject({ ok: false });
  });
});
