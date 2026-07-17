import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeFsWritePort, type FsWritePort } from './fs-port.js';

export interface AppendFileDeps {
  fs?: FsWritePort;
}

export function createAppendFileTool(deps: AppendFileDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsWritePort();
  return {
    name: 'append_file',
    description:
      'Acrescenta conteúdo de texto ao final de um arquivo, criando-o se não existir. Recebe { path, content }.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const path = typeof args.path === 'string' ? args.path : '';
      return { resource: { type: 'file', path }, access: 'write' };
    },
    async run(args: Record<string, unknown>) {
      const path = args.path;
      const content = args.content;
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, error: 'append_file exige um argumento "path" (string não vazia)' };
      }
      if (typeof content !== 'string') {
        return { ok: false, error: 'append_file exige um argumento "content" (string)' };
      }
      try {
        await fs.appendFile(path, content);
        return { ok: true, output: `conteúdo acrescentado: ${path}` };
      } catch (cause) {
        return {
          ok: false,
          error: `não foi possível acrescentar em ${path}: ${(cause as Error).message}`,
        };
      }
    },
  };
}
