import { basename, dirname, join, resolve, sep } from 'node:path';
import type {
  AccessMode,
  ActionRequest,
  PermissionDecision,
  PermissionService,
} from '@atlas/contracts';
import { nodePathResolverPort, type PathResolverPort } from './path-resolver-port.js';

export interface PermissionServiceDeps {
  readonly readRoots: readonly string[];
  readonly writeRoots: readonly string[];
  /** Ausente ⇒ [] (nenhum host alcançável) — fail-closed por omissão. */
  readonly netRoots?: readonly string[];
  readonly pathResolver?: PathResolverPort;
}

/** trim() + toLowerCase() — a normalização mínima que torna a igualdade
 * exata do ADR-0026(b)/D13 utilizável. Nenhuma outra normalização (ponto
 * final de FQDN, IDN/punycode, wildcard) é aplicada aqui. */
function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

/** Contenção lexical: path resolvido igual à raiz ou sob ela (com fronteira de separador). */
function within(target: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    if (target === root) return true;
    const prefix = root.endsWith(sep) ? root : root + sep;
    return target.startsWith(prefix);
  });
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

/**
 * Resolve o caminho real de `path` pelo algoritmo do ancestral existente mais
 * profundo: tenta `realpathSync` no path absoluto; se o segmento não existe
 * (ENOENT), sobe ao pai e tenta de novo, recompondo por cima o segmento que
 * ainda não existia. Erros != ENOENT propagam — fail-closed é responsabilidade
 * de quem chama (evaluate / resolução das raízes na criação).
 */
function resolveExisting(path: string, pathResolver: PathResolverPort): string {
  const absolute = resolve(path);
  try {
    return pathResolver.realpathSync(absolute);
  } catch (error) {
    if (!isEnoent(error)) throw error;
    const parent = dirname(absolute);
    if (parent === absolute) {
      // Raiz do sistema de arquivos alcançada sem nunca existir: não há como
      // subir mais. Devolve o path absoluto tal como está (borda documentada).
      return absolute;
    }
    const resolvedParent = resolveExisting(parent, pathResolver);
    return join(resolvedParent, basename(absolute));
  }
}

/**
 * Resolve cada raiz via o algoritmo do ancestral existente mais profundo.
 * Fail-closed por raiz: se a resolução de uma raiz lança erro != ENOENT,
 * aquela raiz é descartada (nada é considerado contido nela) e as demais
 * seguem — createPermissionService nunca lança por causa disto.
 */
function resolveRoots(roots: readonly string[], pathResolver: PathResolverPort): string[] {
  const resolved: string[] = [];
  for (const root of roots) {
    try {
      resolved.push(resolveExisting(root, pathResolver));
    } catch {
      // fail-closed: raiz descartada, demais raízes seguem funcionando.
    }
  }
  return resolved;
}

/**
 * Avaliador puro/síncrono. Roteia primeiro por resource.type: 'network'
 * (ADR-0026) julga resource.host por igualdade exata (case-insensitive,
 * normalizado nos dois lados) contra netRoots — sem IO, sem PathResolverPort,
 * access !== 'read' sempre blocked; 'file'/'directory' seguem a rota
 * existente: 'read' contra readRoots, 'write'/'delete' contra writeRoots
 * ('delete' produz confirm, não allowed). Não faz IO diretamente — a
 * resolução de caminho real (realpath) acontece via PathResolverPort
 * injetável, síncrona, e nunca lança (fail-closed).
 */
export function createPermissionService(deps: PermissionServiceDeps): PermissionService {
  const pathResolver = deps.pathResolver ?? nodePathResolverPort();
  const readRoots = resolveRoots(deps.readRoots, pathResolver);
  const writeRoots = resolveRoots(deps.writeRoots, pathResolver);
  const netRoots = (deps.netRoots ?? []).map(normalizeHost).filter((host) => host.length > 0);
  return {
    evaluate(action: ActionRequest): PermissionDecision {
      if (action.resource.type === 'network') {
        if (action.access !== 'read') {
          return {
            verdict: 'blocked',
            reason: `acesso "${action.access}" não suportado para recurso de rede`,
          };
        }
        const host = normalizeHost(action.resource.host);
        if (host === '') {
          return { verdict: 'blocked', reason: 'host ausente ou não reconhecido' };
        }
        return netRoots.includes(host)
          ? { verdict: 'allowed' }
          : { verdict: 'blocked', reason: `host fora da lista permitida: ${host}` };
      }

      let target: string;
      try {
        target = resolveExisting(action.resource.path, pathResolver);
      } catch {
        return {
          verdict: 'blocked',
          reason: `falha ao resolver caminho: ${action.resource.path}`,
        };
      }
      if (action.access === 'read') {
        return within(target, readRoots)
          ? { verdict: 'allowed' }
          : {
              verdict: 'blocked',
              reason: `fora do diretório permitido para leitura: ${action.resource.path}`,
            };
      }
      if (action.access === 'write') {
        return within(target, writeRoots)
          ? { verdict: 'allowed' }
          : {
              verdict: 'blocked',
              reason: `fora do diretório permitido para escrita: ${action.resource.path}`,
            };
      }
      if (action.access === 'delete') {
        return within(target, writeRoots)
          ? { verdict: 'confirm' }
          : {
              verdict: 'blocked',
              reason: `fora do diretório permitido para escrita: ${action.resource.path}`,
            };
      }
      return {
        verdict: 'blocked',
        reason: `acesso "${action.access}" não suportado`,
      };
    },

    isContained(canonicalPath: string, access: AccessMode): boolean {
      if (access === 'read') return within(canonicalPath, readRoots);
      if (access === 'write' || access === 'delete') return within(canonicalPath, writeRoots);
      return false;
    },
  };
}
