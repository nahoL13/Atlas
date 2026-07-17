import { resolve, sep } from 'node:path';
import type { ActionRequest, PermissionDecision, PermissionService } from '@atlas/contracts';

export interface PermissionServiceDeps {
  readonly readRoots: readonly string[];
  readonly writeRoots: readonly string[];
}

/** Contenção lexical: path resolvido igual à raiz ou sob ela (com fronteira de separador). */
function within(target: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    if (target === root) return true;
    const prefix = root.endsWith(sep) ? root : root + sep;
    return target.startsWith(prefix);
  });
}

/**
 * Avaliador puro/síncrono. Roteia por access: 'read' contra readRoots,
 * 'write'/'delete' contra writeRoots ('delete' produz confirm, não allowed).
 * Não faz IO e não segue symlinks.
 */
export function createPermissionService(deps: PermissionServiceDeps): PermissionService {
  const readRoots = deps.readRoots.map((root) => resolve(root));
  const writeRoots = deps.writeRoots.map((root) => resolve(root));
  return {
    evaluate(action: ActionRequest): PermissionDecision {
      const target = resolve(action.resource.path);
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
  };
}
