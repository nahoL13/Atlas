import type { ActionRequest, Tool } from '@atlas/contracts';
import { nodeGitReadPort, type GitReadPort } from './git-port.js';
import { resolveGitTarget } from './git-target.js';

export interface GitLogDeps {
  git?: GitReadPort;
  cwd?: () => string;
}

const DEFAULT_MAX_COUNT = 20;

function normalizeMaxCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_COUNT;
}

export function createGitLogTool(deps: GitLogDeps = {}): Tool {
  const git = deps.git ?? nodeGitReadPort();
  const cwd = deps.cwd ?? (() => process.cwd());
  return {
    name: 'git_log',
    description:
      'Mostra o histórico recente de commits do repositório git. Recebe { path?, maxCount? } — default 20 commits. Somente-leitura.',
    requirements(args: Record<string, unknown>): ActionRequest | null {
      const resolution = resolveGitTarget(args, cwd);
      const path = resolution.ok ? resolution.target : '';
      return { resource: { type: 'directory', path }, access: 'read' };
    },
    async run(args: Record<string, unknown>) {
      const resolution = resolveGitTarget(args, cwd);
      if (!resolution.ok) {
        return { ok: false, error: `git_log: ${resolution.error}` };
      }
      const maxCount = normalizeMaxCount(args.maxCount);
      try {
        const output = await git.log(resolution.target, { maxCount });
        return { ok: true, output: `repositório: ${output.repository}\n${output.text}` };
      } catch (cause) {
        return { ok: false, error: `git_log falhou: ${(cause as Error).message}` };
      }
    },
  };
}
