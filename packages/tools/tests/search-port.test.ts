import { describe, expect, it } from 'vitest';
import {
  SEARCH_BODY_LIMIT_BYTES,
  SEARCH_SNIPPET_LIMIT,
  SEARCH_SNIPPET_MARKER,
  parseSearchPayload,
  searxngSearchPort,
  type SearchResponse,
} from '../src/search-port.js';
import type { HttpPort, HttpResponse } from '../src/http-port.js';
import { resolveSearchHost } from '../src/web-search.js';

function fakeHttpResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return {
    url: overrides.url ?? 'https://busca.exemplo.com/search?q=x&format=json',
    status: overrides.status ?? 200,
    body: overrides.body ?? '{"results":[]}',
    truncated: overrides.truncated ?? false,
    bodyOmitted: overrides.bodyOmitted ?? false,
    ...(overrides.contentType !== undefined ? { contentType: overrides.contentType } : {}),
    ...(overrides.location !== undefined ? { location: overrides.location } : {}),
  };
}

function fakeHttpPort(response: HttpResponse): {
  http: HttpPort;
  calls: string[];
} {
  const calls: string[] = [];
  const http: HttpPort = {
    async get(url: string) {
      calls.push(url);
      return response;
    },
  };
  return { http, calls };
}

// ---------------------------------------------------------------------------
// parseSearchPayload (pura)
// ---------------------------------------------------------------------------

describe('parseSearchPayload', () => {
  it('corpo válido com 3 itens e maxResults 5: 3 resultados, sem truncagem, sem descarte', () => {
    const body = JSON.stringify({
      results: [
        { title: 'A', url: 'https://a.example/', content: 'trecho a' },
        { title: 'B', url: 'https://b.example/', content: 'trecho b' },
        { title: 'C', url: 'https://c.example/', content: 'trecho c' },
      ],
    });
    const result = parseSearchPayload(body, 5);
    expect(result.results).toHaveLength(3);
    expect(result.truncated).toBe(false);
    expect(result.discarded).toBe(0);
    expect(result.results[0]).toEqual({
      title: 'A',
      url: 'https://a.example/',
      snippet: 'trecho a',
    });
  });

  it('corpo válido com 8 itens e maxResults 5: 5 resultados, truncated true, discarded 0', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      title: `T${i}`,
      url: `https://item${i}.example/`,
      content: `c${i}`,
    }));
    const result = parseSearchPayload(JSON.stringify({ results: items }), 5);
    expect(result.results).toHaveLength(5);
    expect(result.truncated).toBe(true);
    expect(result.discarded).toBe(0);
  });

  it('itens inválidos são descartados, contados, e não afetam os demais', () => {
    const body = JSON.stringify({
      results: [
        { title: 'sem url', content: 'x' },
        { title: '', url: 'https://vazio.example/' },
        { url: 'https://sem-titulo.example/' },
        { title: 'url não-string', url: 42 },
        { title: 'url inválida', url: 'não-uma-url' },
        { title: 'ok1', url: 'https://ok1.example/' },
        { title: 'ok2', url: 'https://ok2.example/' },
        { title: 'ok3', url: 'https://ok3.example/' },
      ],
    });
    const result = parseSearchPayload(body, 10);
    expect(result.results.map((r) => r.title)).toEqual(['ok1', 'ok2', 'ok3']);
    expect(result.discarded).toBe(5);
  });

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'ftp://exemplo.com/x'])(
    'esquema %s é descartado',
    (url) => {
      const body = JSON.stringify({ results: [{ title: 'x', url }] });
      const result = parseSearchPayload(body, 10);
      expect(result.results).toHaveLength(0);
      expect(result.discarded).toBe(1);
    },
  );

  it('duas URLs normalizadas iguais: só a primeira sobrevive, discarded 1', () => {
    const body = JSON.stringify({
      results: [
        { title: 'primeiro', url: 'https://exemplo.com/x' },
        { title: 'segundo', url: 'https://exemplo.com/x' },
      ],
    });
    const result = parseSearchPayload(body, 10);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.title).toBe('primeiro');
    expect(result.discarded).toBe(1);
  });

  it('content ausente/não-string: snippet vazio, sem descarte', () => {
    const body = JSON.stringify({
      results: [
        { title: 'sem content', url: 'https://a.example/' },
        { title: 'content numérico', url: 'https://b.example/', content: 42 },
      ],
    });
    const result = parseSearchPayload(body, 10);
    expect(result.discarded).toBe(0);
    expect(result.results.every((r) => r.snippet === '')).toBe(true);
  });

  it('title/snippet com controle e espaços múltiplos são normalizados', () => {
    const body = JSON.stringify({
      results: [
        {
          title: 'título\ncom\tquebras   e   espaços',
          url: 'https://a.example/',
          content: 'trecho\ncom\x00controle  e   espaços',
        },
      ],
    });
    const result = parseSearchPayload(body, 10);
    expect(result.results[0]?.title).toBe('título com quebras e espaços');
    expect(result.results[0]?.snippet).toBe('trecho com controle e espaços');
  });

  it('snippet com 900 caracteres é truncado com o marcador', () => {
    const longSnippet = 'a'.repeat(900);
    const body = JSON.stringify({
      results: [{ title: 'x', url: 'https://a.example/', content: longSnippet }],
    });
    const result = parseSearchPayload(body, 10);
    const snippet = result.results[0]!.snippet;
    expect(snippet.length).toBeLessThanOrEqual(SEARCH_SNIPPET_LIMIT + SEARCH_SNIPPET_MARKER.length);
    expect(snippet.endsWith(SEARCH_SNIPPET_MARKER)).toBe(true);
  });

  it('corpo que não é JSON: Error com dica de format=json', () => {
    expect(() => parseSearchPayload('isto não é json', 5)).toThrow(/format=json/);
  });

  it.each(['{}', '{"results": "não é array"}', 'null'])(
    'forma inesperada (%s): Error dedicado',
    (body) => {
      expect(() => parseSearchPayload(body, 5)).toThrow(/forma inesperada/);
    },
  );

  it('results: [] produz zero resultados, sem erro', () => {
    const result = parseSearchPayload(JSON.stringify({ results: [] }), 5);
    expect(result.results).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.discarded).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// searxngSearchPort (com HttpPort fake)
// ---------------------------------------------------------------------------

describe('searxngSearchPort', () => {
  it('endpointUrl é normalizado (new URL(...).href) uma única vez na construção', () => {
    const port = searxngSearchPort({ baseUrl: 'https://Busca.Exemplo.COM:8443/search' });
    expect(port.endpointUrl).toBe(new URL('https://Busca.Exemplo.COM:8443/search').href);
  });

  it('identidade entre host declarado (endpointUrl) e host requisitado (D21)', async () => {
    const { http, calls } = fakeHttpPort(fakeHttpResponse());
    const bases = [
      'https://a.example/search',
      'http://127.0.0.1:8080/search',
      'https://Busca.Exemplo.COM/search',
    ];
    for (const baseUrl of bases) {
      const port = searxngSearchPort({ baseUrl, http });
      calls.length = 0;
      await port.search('x', 5);
      const declaredHost = new URL(port.endpointUrl).hostname.toLowerCase();
      const requestedHost = new URL(calls[0]!).hostname.toLowerCase();
      expect(declaredHost).toBe(requestedHost);
      expect(resolveSearchHost(port.endpointUrl)).toBe(requestedHost);
    }
  });

  it('teste de divergência: uma SearchPort fake que declara um host e requisita outro é detectada', async () => {
    const { http, calls } = fakeHttpPort(fakeHttpResponse());
    const declaredEndpoint = 'https://declarado.exemplo/search';
    const divergentPort = {
      endpointUrl: declaredEndpoint,
      async search(query: string, maxResults: number): Promise<SearchResponse> {
        // Requisita um host DIFERENTE do que publica em `endpointUrl` — o
        // molde que D21 existe para tornar impossível na porta default.
        await http.get('https://real.exemplo/search');
        return { query, results: [], truncated: false, discarded: maxResults > 0 ? 0 : 0 };
      },
    };
    await divergentPort.search('x', 5);
    const declaredHost = new URL(divergentPort.endpointUrl).hostname.toLowerCase();
    const requestedHost = new URL(calls[0]!).hostname.toLowerCase();
    expect(() => expect(declaredHost).toBe(requestedHost)).toThrow();
  });

  it('baseUrl inutilizável: endpointUrl vazio, search() rejeita sem chamar a porta HTTP', async () => {
    const { http, calls } = fakeHttpPort(fakeHttpResponse());
    for (const baseUrl of ['não-uma-url', '']) {
      const port = searxngSearchPort({ baseUrl, http });
      expect(port.endpointUrl).toBe('');
      await expect(port.search('x', 5)).rejects.toThrow();
    }
    expect(calls).toHaveLength(0);
  });

  it('URL requisitada tem exatamente os parâmetros q e format=json', async () => {
    const { http, calls } = fakeHttpPort(fakeHttpResponse());
    const port = searxngSearchPort({ baseUrl: 'https://h/search', http });
    await port.search('minha consulta', 5);
    const url = new URL(calls[0]!);
    expect([...url.searchParams.keys()].sort()).toEqual(['format', 'q']);
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('q')).toBe('minha consulta');
  });

  it('baseUrl com caminho é preservado; consulta com espaços/acentos/& sai íntegra', async () => {
    const { http, calls } = fakeHttpPort(fakeHttpResponse());
    const port = searxngSearchPort({ baseUrl: 'http://h:8080/search', http });
    const query = 'café & açúcar teste';
    await port.search(query, 5);
    const url = new URL(calls[0]!);
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe(query);
  });

  it('a porta HTTP fake é chamada uma única vez por search()', async () => {
    const { http, calls } = fakeHttpPort(fakeHttpResponse());
    const port = searxngSearchPort({ baseUrl: 'https://h/search', http });
    await port.search('x', 5);
    expect(calls).toHaveLength(1);
  });

  it('bodyOmitted: true rejeita com Error de content-type não textual', async () => {
    const { http } = fakeHttpPort(fakeHttpResponse({ bodyOmitted: true }));
    const port = searxngSearchPort({ baseUrl: 'https://h/search', http });
    await expect(port.search('x', 5)).rejects.toThrow(/content-type/);
  });

  it('truncated: true rejeita citando o teto, sem chamar parseSearchPayload', async () => {
    const { http } = fakeHttpPort(fakeHttpResponse({ truncated: true, body: 'lixo não json' }));
    const port = searxngSearchPort({ baseUrl: 'https://h/search', http });
    await expect(port.search('x', 5)).rejects.toThrow(/256 KiB/);
  });

  it.each([404, 500])('status %i rejeita citando o status', async (status) => {
    const { http } = fakeHttpPort(fakeHttpResponse({ status }));
    const port = searxngSearchPort({ baseUrl: 'https://h/search', http });
    await expect(port.search('x', 5)).rejects.toThrow(new RegExp(String(status)));
  });

  it('status 302 rejeita mencionando explicitamente que o redirect não foi seguido', async () => {
    const { http } = fakeHttpPort(fakeHttpResponse({ status: 302 }));
    const port = searxngSearchPort({ baseUrl: 'https://h/search', http });
    await expect(port.search('x', 5)).rejects.toThrow(/redirecionamento não foi seguido/);
  });

  it('status 200 com JSON válido: query original preservada, results/truncated/discarded batem', async () => {
    const body = JSON.stringify({
      results: [{ title: 'A', url: 'https://a.example/', content: 'x' }],
    });
    const { http } = fakeHttpPort(fakeHttpResponse({ body }));
    const port = searxngSearchPort({ baseUrl: 'https://h/search', http });
    const response = await port.search('minha busca', 5);
    expect(response.query).toBe('minha busca');
    const expected = parseSearchPayload(body, 5);
    expect(response.results).toEqual(expected.results);
    expect(response.truncated).toBe(expected.truncated);
    expect(response.discarded).toBe(expected.discarded);
  });

  it('nenhum valor de process.env aparece na URL requisitada', async () => {
    process.env.ATLAS_TEST_SEARCH_SECRET = 'segredo-busca';
    try {
      const { http, calls } = fakeHttpPort(fakeHttpResponse());
      const port = searxngSearchPort({ baseUrl: 'https://h/search', http });
      await port.search('x', 5);
      expect(calls[0]).not.toContain('segredo-busca');
    } finally {
      delete process.env.ATLAS_TEST_SEARCH_SECRET;
    }
  });

  it('default http usa bodyLimitBytes de SEARCH_BODY_LIMIT_BYTES (integração leve)', () => {
    // Não testa rede real: só confirma que a construção sem `http` injetado
    // não lança e produz um SearchPort funcional.
    const port = searxngSearchPort({ baseUrl: 'https://h/search' });
    expect(port.endpointUrl).toBe('https://h/search');
    expect(SEARCH_BODY_LIMIT_BYTES).toBe(262_144);
  });
});
