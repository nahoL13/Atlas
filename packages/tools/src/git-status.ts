import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeGitReadPort, type GitReadPort } from './git-port.js';
import { resolveTargetDirectory } from './target-dir.js';

export interface GitStatusDeps {
  git?: GitReadPort;
  cwd?: () => string;
}

export function createGitStatusTool(deps: GitStatusDeps = {}): Tool {
  const git = deps.git ?? nodeGitReadPort();
  const cwd = deps.cwd ?? (() => process.cwd());
  return {
    name: 'git_status',
    description:
      'Mostra o estado da árvore de trabalho do repositório git (arquivos modificados/staged/não rastreados). Recebe { path? } — sem path, usa o diretório atual. Somente-leitura.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const resolution = resolveTargetDirectory(args, cwd);
      const path = resolution.ok ? resolution.target : '';
      return { resource: { type: 'directory', path }, access: 'read' };
    },
    async run(args: Record<string, unknown>) {
      const resolution = resolveTargetDirectory(args, cwd);
      if (!resolution.ok) {
        return { ok: false, error: `git_status: ${resolution.error}` };
      }
      try {
        const output = await git.status(resolution.target);
        return { ok: true, output: `repositório: ${output.repository}\n${output.text}` };
      } catch (cause) {
        return { ok: false, error: `git_status falhou: ${(cause as Error).message}` };
      }
    },
  };
}
