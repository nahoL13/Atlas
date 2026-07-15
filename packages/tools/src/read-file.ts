import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsReadPort, type FsReadPort } from './fs-port.js';

export interface ReadFileDeps {
  fs?: FsReadPort;
}

export function createReadFileTool(deps: ReadFileDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsReadPort();
  return {
    name: 'read_file',
    description:
      'Lê o conteúdo de um arquivo de texto. Recebe { path }. Use quando o objetivo exigir o conteúdo de um arquivo.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'file', path }, access: 'read' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'read_file exige um argumento "path" (string não vazia)' };
      }
      try {
        const content = await fs.readFile(path);
        return { ok: true, output: content };
      } catch (cause) {
        return { ok: false, error: `não foi possível ler ${path}: ${(cause as Error).message}` };
      }
    },
  };
}
