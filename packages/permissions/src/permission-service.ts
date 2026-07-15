import { resolve, sep } from 'node:path';
import type { ActionRequest, PermissionDecision, PermissionService } from '@atlas/contracts';

export interface PermissionServiceDeps {
  readonly readRoots: readonly string[];
}

/**
 * Avaliador puro/síncrono. Contenção lexical: resolve o path da ação e o
 * compara com cada raiz (igual à raiz ou sob ela, com fronteira de separador).
 * Não faz IO e não segue symlinks.
 */
export function createPermissionService(deps: PermissionServiceDeps): PermissionService {
  const roots = deps.readRoots.map((root) => resolve(root));
  return {
    evaluate(action: ActionRequest): PermissionDecision {
      if (action.access !== 'read') {
        return {
          verdict: 'blocked',
          reason: `acesso "${action.access}" não autorizado nesta versão (apenas leitura)`,
        };
      }
      const target = resolve(action.resource.path);
      const allowed = roots.some((root) => {
        if (target === root) return true;
        const prefix = root.endsWith(sep) ? root : root + sep;
        return target.startsWith(prefix);
      });
      if (allowed) {
        return { verdict: 'allowed' };
      }
      return {
        verdict: 'blocked',
        reason: `fora do diretório permitido para leitura: ${action.resource.path}`,
      };
    },
  };
}
