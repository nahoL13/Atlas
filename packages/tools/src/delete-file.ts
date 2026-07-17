import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsWritePort, type FsWritePort } from './fs-port.js';

export interface DeleteFileDeps {
  fs?: FsWritePort;
}

export function createDeleteFileTool(deps: DeleteFileDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsWritePort();
  return {
    name: 'delete_file',
    description:
      'Remove um arquivo existente. Recebe { path }. Ação irreversível — exige confirmação do usuário antes de executar.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'file', path }, access: 'delete' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'delete_file exige um argumento "path" (string não vazia)' };
      }
      try {
        await fs.deleteFile(path);
        return { ok: true, output: `removido: ${path}` };
      } catch (cause) {
        return { ok: false, error: `não foi possível remover ${path}: ${(cause as Error).message}` };
      }
    },
  };
}
