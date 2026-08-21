import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeGitReadPort, type GitReadPort } from './git-port.js';
import { resolveTargetDirectory } from './target-dir.js';

export interface GitDiffDeps {
  git?: GitReadPort;
  cwd?: () => string;
}

export function createGitDiffTool(deps: GitDiffDeps = {}): Tool {
  const git = deps.git ?? nodeGitReadPort();
  const cwd = deps.cwd ?? (() => process.cwd());
  return {
    name: 'git_diff',
    description:
      'Mostra as diferenças da árvore de trabalho do repositório git. Recebe { path?, staged? } — staged=true mostra as mudanças já em stage. Somente-leitura.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const resolution = resolveTargetDirectory(args, cwd);
      const path = resolution.ok ? resolution.target : '';
      return { resource: { type: 'directory', path }, access: 'read' };
    },
    async run(args: Record<string, unknown>) {
      const resolution = resolveTargetDirectory(args, cwd);
      if (!resolution.ok) {
        return { ok: false, error: `git_diff: ${resolution.error}` };
      }
      const staged = args.staged === true;
      try {
        const output = await git.diff(resolution.target, { staged });
        return { ok: true, output: `repositório: ${output.repository}\n${output.text}` };
      } catch (cause) {
        return { ok: false, error: `git_diff falhou: ${(cause as Error).message}` };
      }
    },
  };
}
