import { nodeHttpPort, type HttpPort } from './http-port.js';

/** Um resultado de busca já normalizado. Interno a `@atlas/tools` (D4). */
export interface SearchResultItem {
  readonly title: string;
  /** Endereço do resultado, já normalizado (`new URL(...).href`). Nunca requisitado por esta Tool. */
  readonly url: string;
  /** Trecho devolvido pelo provedor, normalizado e truncado. '' quando ausente. */
  readonly snippet: string;
}

export interface SearchResponse {
  /** Consulta efetivamente enviada ao provedor. */
  readonly query: string;
  readonly results: readonly SearchResultItem[];
  /** true quando o provedor devolveu mais resultados válidos do que o teto pedido. */
  readonly truncated: boolean;
  /**
   * Quantos itens do payload foram descartados por formato inválido ou por
   * URL repetida. Nunca inclui itens cortados pelo teto (isso é `truncated`,
   * D25).
   */
  readonly discarded: number;
}

export interface SearchPort {
  /**
   * Endereço do provedor que ESTA porta requisita, normalizado
   * (`new URL(...).href`). Fonte ÚNICA do host declarado em `requirements`
   * (D21). '' quando inutilizável.
   */
  readonly endpointUrl: string;
  search(query: string, maxResults: number): Promise<SearchResponse>;
}

export interface SearxngSearchPortDeps {
  /** Endpoint absoluto http(s), sem query string e sem credenciais. */
  readonly baseUrl: string;
  /**
   * Default: `nodeHttpPort({ bodyLimitBytes: SEARCH_BODY_LIMIT_BYTES })`.
   * Único lugar onde o teto de corpo da busca é decidido (D24).
   */
  readonly http?: HttpPort;
}

export const SEARCH_DEFAULT_MAX_RESULTS = 5;
export const SEARCH_MAX_RESULTS = 10;
export const SEARCH_SNIPPET_LIMIT = 500;
export const SEARCH_SNIPPET_MARKER = ' […]';
export const SEARCH_QUERY_LIMIT = 512;
export const SEARCH_BODY_LIMIT_BYTES = 262_144; // 256 KiB

/** Caracteres de controle C0 (0x00-0x1F) e DEL (0x7F) — removidos por código, não por regex. */
function stripControlChars(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    out += code <= 0x1f || code === 0x7f ? ' ' : char;
  }
  return out;
}

/**
 * Remove caracteres de controle, colapsa espaços em branco em um único
 * espaço, aplica `trim` e trunca em `SEARCH_SNIPPET_LIMIT` com
 * `SEARCH_SNIPPET_MARKER` — aplicada a `title` e `snippet` (Escopo item 1).
 */
function normalizeAndTruncate(raw: string): string {
  const withoutControl = stripControlChars(raw);
  const collapsed = withoutControl.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= SEARCH_SNIPPET_LIMIT) {
    return collapsed;
  }
  return collapsed.slice(0, SEARCH_SNIPPET_LIMIT) + SEARCH_SNIPPET_MARKER;
}

/**
 * Função pura, testável sem rede e sem porta (Escopo item 1). Valida a forma
 * do payload, normaliza/deduplica/trunca os itens e conta o que foi
 * descartado — nunca lança para item malformado individual, só para o
 * payload como um todo.
 */
export function parseSearchPayload(
  body: string,
  maxResults: number,
): { results: readonly SearchResultItem[]; truncated: boolean; discarded: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(
      'não foi possível interpretar a resposta do provedor como JSON — confirme que o ' +
        'endpoint expõe format=json (API JSON do SearXNG)',
    );
  }

  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { results?: unknown }).results)
  ) {
    throw new Error(
      'resposta do provedor tem forma inesperada: esperava um objeto com "results" (array)',
    );
  }

  const rawResults = (parsed as { results: unknown[] }).results;

  let discarded = 0;
  const seenUrls = new Set<string>();
  const validated: SearchResultItem[] = [];

  for (const raw of rawResults) {
    if (raw === null || typeof raw !== 'object') {
      discarded += 1;
      continue;
    }
    const item = raw as Record<string, unknown>;
    const rawTitle = item.title;
    const rawUrl = item.url;

    if (typeof rawTitle !== 'string' || rawTitle.trim() === '') {
      discarded += 1;
      continue;
    }
    if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
      discarded += 1;
      continue;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      discarded += 1;
      continue;
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      discarded += 1;
      continue;
    }

    const normalizedUrl = parsedUrl.href;
    if (seenUrls.has(normalizedUrl)) {
      discarded += 1;
      continue;
    }
    seenUrls.add(normalizedUrl);

    const rawSnippet = item.content;
    const snippet = typeof rawSnippet === 'string' ? normalizeAndTruncate(rawSnippet) : '';

    validated.push({
      title: normalizeAndTruncate(rawTitle),
      url: normalizedUrl,
      snippet,
    });
  }

  const truncated = validated.length > maxResults;
  const results = truncated ? validated.slice(0, maxResults) : validated;

  return { results, truncated, discarded };
}

/**
 * Adaptador default sobre o `HttpPort` já endurecido da SPEC-0055 (D5).
 * `endpointUrl` é normalizado uma única vez na construção; a URL requisitada
 * é sempre derivada DELE, nunca de `baseUrl` cru (D21).
 */
export function searxngSearchPort(deps: SearxngSearchPortDeps): SearchPort {
  const http = deps.http ?? nodeHttpPort({ bodyLimitBytes: SEARCH_BODY_LIMIT_BYTES });

  let endpointUrl: string;
  try {
    endpointUrl = new URL(deps.baseUrl).href;
  } catch {
    endpointUrl = '';
  }

  return {
    endpointUrl,
    async search(query: string, maxResults: number): Promise<SearchResponse> {
      if (endpointUrl === '') {
        throw new Error(
          'SearchPort: endpointUrl inválido ou não configurado — nenhuma requisição foi feita',
        );
      }

      const requestUrl = new URL(endpointUrl);
      requestUrl.search = '';
      requestUrl.searchParams.set('q', query);
      requestUrl.searchParams.set('format', 'json');

      const response = await http.get(requestUrl.href);

      if (response.bodyOmitted) {
        throw new Error('provedor respondeu com content-type não textual');
      }
      if (response.truncated) {
        throw new Error('resposta do provedor excedeu 256 KiB e não pôde ser interpretada');
      }
      if (response.status < 200 || response.status >= 300) {
        const redirectNote =
          response.status >= 300 && response.status < 400
            ? ' (redirecionamento não foi seguido)'
            : '';
        throw new Error(`provedor de busca respondeu com status ${response.status}${redirectNote}`);
      }

      const { results, truncated, discarded } = parseSearchPayload(response.body, maxResults);
      return { query, results, truncated, discarded };
    },
  };
}
