import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsWritePort, type FsWritePort } from './fs-port.js';

export interface MkdirDeps {
  fs?: FsWritePort;
}

export function createMkdirTool(deps: MkdirDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsWritePort();
  return {
    name: 'mkdir',
    description:
      'Cria um diretório, incluindo diretórios intermediários ausentes. Recebe { path }. Idempotente: não erra se já existir.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'directory', path }, access: 'write' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'mkdir exige um argumento "path" (string não vazia)' };
      }
      try {
        await fs.mkdir(path);
        return { ok: true, output: `diretório criado: ${path}` };
      } catch (cause) {
        return { ok: false, error: `não foi possível criar ${path}: ${(cause as Error).message}` };
      }
    },
  };
}
