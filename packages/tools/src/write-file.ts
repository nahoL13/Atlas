import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsWritePort, type FsWritePort } from './fs-port.js';

export interface WriteFileDeps {
  fs?: FsWritePort;
}

export function createWriteFileTool(deps: WriteFileDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsWritePort();
  return {
    name: 'write_file',
    description:
      'Escreve conteúdo de texto em um arquivo, criando ou sobrescrevendo. Recebe { path, content }. Use quando o objetivo exigir gravar um arquivo.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'file', path }, access: 'write' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      const content = args.content;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'write_file exige um argumento "path" (string não vazia)' };
      }
      if (typeof content !== 'string') {
        return { ok: false, error: 'write_file exige um argumento "content" (string)' };
      }
      try {
        await fs.writeFile(path, content);
        return { ok: true, output: `escrito: ${path}` };
      } catch (cause) {
        return {
          ok: false,
          error: `não foi possível escrever ${path}: ${(cause as Error).message}`,
        };
      }
    },
  };
}
