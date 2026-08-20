/** Resultado de uma requisição `http_get`. Interno a `@atlas/tools` (D5). */
export interface HttpResponse {
  /** URL efetivamente requisitada (href normalizado). Nunca um destino de redirect. */
  readonly url: string;
  readonly status: number;
  /** Valor cru do header `content-type`, quando declarado. */
  readonly contentType?: string;
  /** Valor cru do header `location`; presente só em respostas 3xx. */
  readonly location?: string;
  /** Corpo decodificado como texto, já truncado. '' quando omitido/vazio. */
  readonly body: string;
  /** true quando o corpo foi cortado no teto de 64 KiB. */
  readonly truncated: boolean;
  /** true quando o content-type não é textual (ou ausente) e o corpo foi omitido. */
  readonly bodyOmitted: boolean;
}

export interface HttpPort {
  get(url: string): Promise<HttpResponse>;
}

/** `fetch` global do Node por default; fake nos testes (sem rede real). */
export type FetchLike = typeof fetch;

export interface NodeHttpPortDeps {
  fetch?: FetchLike;
  /** Orçamento total da requisição (conexão + leitura de corpo). Default HTTP_TIMEOUT_MS. */
  timeoutMs?: number;
}

export const HTTP_TIMEOUT_MS = 10_000;
export const HTTP_BODY_LIMIT_BYTES = 65_536; // 64 KiB
export const HTTP_TRUNCATION_MARKER = '\n[... corpo truncado em 64 KiB ...]';

/**
 * `content-type` textual reconhecido (D9): `text/*`, os subtipos
 * `application/json`/`xml`/`xhtml+xml`/`javascript`, e qualquer subtipo
 * `+json`/`+xml`. Ausência de content-type NÃO é textual (fail-closed).
 */
function isTextualContentType(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mime = (contentType.split(';')[0] ?? '').trim().toLowerCase();
  if (mime === '') return false;
  if (mime.startsWith('text/')) return true;
  if (mime.endsWith('+json') || mime.endsWith('+xml')) return true;
  return (
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/xhtml+xml' ||
    mime === 'application/javascript'
  );
}

function concatChunks(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array {
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

/**
 * Leitura incremental do corpo, com teto de `limitBytes` (D8): ao atingir o
 * teto, o stream é cancelado (`reader.cancel()`), o texto é truncado e o
 * marcador visível é anexado. Corpo dentro do teto sai íntegro.
 */
async function readBodyLimited(
  body: ReadableStream<Uint8Array> | null,
  limitBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (body === null) {
    return { text: '', truncated: false };
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    if (total + value.byteLength > limitBytes) {
      const remaining = limitBytes - total;
      if (remaining > 0) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
      }
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const text = new TextDecoder().decode(concatChunks(chunks, total));
  return { text: truncated ? text + HTTP_TRUNCATION_MARKER : text, truncated };
}

function toTransportError(url: string, cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new Error(`falha ao requisitar ${url}: ${message}`, { cause });
}

function buildResponse(
  url: string,
  status: number,
  contentType: string | undefined,
  location: string | undefined,
  body: string,
  truncated: boolean,
  bodyOmitted: boolean,
): HttpResponse {
  return {
    url,
    status,
    ...(contentType !== undefined ? { contentType } : {}),
    ...(location !== undefined ? { location } : {}),
    body,
    truncated,
    bodyOmitted,
  };
}

/**
 * Adaptador default sobre `globalThis.fetch` (D6/D7/D8/D9/D10/D18). Init de
 * requisição exatamente `{ method: 'GET', redirect: 'manual', signal }` —
 * nenhuma outra chave, nenhum header. Orçamento de tempo total (conexão +
 * leitura de corpo) por `AbortController`, timer sempre limpo em `finally`.
 * Guarda fail-closed de redirect opaco (D18): `status === 0` ou
 * `type === 'opaqueredirect'` — o desfecho que a spec WHATWG Fetch prescreve
 * para `redirect: 'manual'` e que o undici deste projeto não produz — lança
 * `Error` própria, nunca devolve uma `HttpResponse` de aparência normal.
 */
export function nodeHttpPort(deps: NodeHttpPortDeps = {}): HttpPort {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? HTTP_TIMEOUT_MS;
  return {
    async get(url: string): Promise<HttpResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
          });
        } catch (cause) {
          throw toTransportError(url, cause);
        }

        if (response.status === 0 || response.type === 'opaqueredirect') {
          throw new Error(
            `destino do redirect não pôde ser revelado (redirect opaco) ao requisitar ${url}`,
          );
        }

        const contentType = response.headers.get('content-type') ?? undefined;
        const isRedirectStatus = response.status >= 300 && response.status < 400;
        const location = isRedirectStatus
          ? (response.headers.get('location') ?? undefined)
          : undefined;

        if (!isTextualContentType(contentType)) {
          try {
            await response.body?.cancel();
          } catch {
            // cancelamento é best-effort: o corpo já está sendo omitido de qualquer forma.
          }
          return buildResponse(url, response.status, contentType, location, '', false, true);
        }

        let text: string;
        let truncated: boolean;
        try {
          ({ text, truncated } = await readBodyLimited(response.body, HTTP_BODY_LIMIT_BYTES));
        } catch (cause) {
          throw toTransportError(url, cause);
        }

        return buildResponse(url, response.status, contentType, location, text, truncated, false);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
