import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeHttpPort, type HttpPort } from './http-port.js';

/**
 * Resultado do helper único de derivação de alvo (D4). `url` é SEMPRE
 * `new URL(args.url).href` — a URL normalizada, nunca a string crua de
 * `args`. `host` é `hostname` em minúsculas. Com `error` presente: url='' e
 * host=''.
 */
export interface HttpTarget {
  readonly url: string;
  readonly host: string;
  readonly error?: string;
}

/**
 * Deriva `{ url, host, error }` de `args`, consumido tanto por
 * `requirements` quanto por `run` (D4) — o recurso julgado e o recurso
 * requisitado saem da mesma string imutável de `args.url`. Recusa esquema
 * fora de http(s) e URL com credenciais embutidas (D11).
 */
export function resolveHttpTarget(args: Record<string, unknown>): HttpTarget {
  const raw = args.url;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { url: '', host: '', error: '"url" deve ser uma string não vazia' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { url: '', host: '', error: `"url" inválida: ${raw}` };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: '', host: '', error: `esquema não suportado: ${parsed.protocol}` };
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return { url: '', host: '', error: 'URL com credenciais embutidas não é aceita' };
  }

  return { url: parsed.href, host: parsed.hostname.toLowerCase() };
}

export interface HttpGetDeps {
  http?: HttpPort;
}

const DESCRIPTION =
  'Busca o conteúdo de uma URL por uma única requisição HTTP GET. Recebe { url } com esquema\n' +
  'http ou https. Somente-leitura: nenhum outro método, nenhum cabeçalho customizado.\n' +
  'Redirecionamentos não são seguidos — uma resposta 3xx volta com o destino visível, sem ser\n' +
  'buscado. O corpo é truncado em 64 KiB e omitido quando não for texto. O host precisa estar\n' +
  'na lista de hosts permitidos pelo usuário, senão o passo é negado.';

export function createHttpGetTool(deps: HttpGetDeps = {}): Tool {
  const http = deps.http ?? nodeHttpPort();
  return {
    name: 'http_get',
    description: DESCRIPTION,
    requirements(args: Record<string, unknown>): ActionRequest {
      const { host } = resolveHttpTarget(args);
      return { resource: { type: 'network', host }, access: 'read' };
    },
    async run(args: Record<string, unknown>) {
      const target = resolveHttpTarget(args);
      if (target.error !== undefined) {
        return { ok: false, error: `http_get: ${target.error}` };
      }
      try {
        const response = await http.get(target.url);
        const lines = [
          `url: ${response.url}`,
          `status: ${response.status}`,
          `content-type: ${response.contentType ?? '(ausente)'}`,
        ];
        if (response.location !== undefined) {
          lines.push(`location: ${response.location}`);
          lines.push(
            '(redirecionamento não seguido automaticamente: o host de destino precisa ser ' +
              'permitido e requisitado explicitamente)',
          );
        }
        if (response.bodyOmitted) {
          lines.push('(corpo omitido: content-type não é texto)');
        } else {
          if (response.truncated) {
            lines.push('(corpo truncado em 64 KiB)');
          }
          lines.push('', response.body);
        }
        return { ok: true, output: lines.join('\n') };
      } catch (cause) {
        return { ok: false, error: `http_get falhou: ${(cause as Error).message}` };
      }
    },
  };
}
