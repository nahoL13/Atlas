import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsReadPort, type FsReadPort } from './fs-port.js';

export interface ListDirDeps {
  fs?: FsReadPort;
}

export function createListDirTool(deps: ListDirDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsReadPort();
  return {
    name: 'list_dir',
    description:
      'Lista as entradas de um diretório. Recebe { path }. Use para descobrir quais arquivos existem antes de ler.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'directory', path }, access: 'read' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'list_dir exige um argumento "path" (string não vazia)' };
      }
      try {
        const entries = await fs.readdir(path);
        return { ok: true, output: entries.join('\n') };
      } catch (cause) {
        return { ok: false, error: `não foi possível listar ${path}: ${(cause as Error).message}` };
      }
    },
  };
}
