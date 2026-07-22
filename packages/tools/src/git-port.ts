import { execFile } from 'node:child_process';
import { realpath as fsRealpath } from 'node:fs/promises';
import type { Verify } from './fs-port.js';

/** Saída de um subcomando de git somente-leitura. */
export interface GitOutput {
  /** Toplevel real (realpath) do repositório efetivamente inspecionado. */
  readonly repository: string;
  readonly text: string;
  readonly truncated: boolean;
}

/**
 * Porta de leitura de git (interna a `@atlas/tools`, sem 2º consumidor real,
 * no molde de `FsReadPort`): três métodos narrow, um por subcomando.
 */
export interface GitReadPort {
  status(cwd: string): Promise<GitOutput>;
  diff(cwd: string, opts?: { readonly staged?: boolean }): Promise<GitOutput>;
  log(cwd: string, opts?: { readonly maxCount?: number }): Promise<GitOutput>;
}

/** Execução de processo, injetável nos testes (sem git real). */
export type ExecGit = (
  args: readonly string[],
  options: { readonly cwd: string; readonly maxBuffer: number },
) => Promise<string>;

export interface NodeGitPortDeps {
  /** Veredicto de contenção sobre o toplevel real. Default fail-closed (SPEC-0024). */
  verify?: Verify;
  exec?: ExecGit;
  /**
   * `realpath` do toplevel descoberto, injetável nos testes (molde de
   * `FsPrimitivesPort.realpath` em fs-port.ts) — sem ela os testes com `exec`
   * fake apontariam para caminhos inexistentes no disco. Default real sobre
   * `node:fs/promises`.
   */
  realpath?: (path: string) => Promise<string>;
}

const MAX_BUFFER = 10 * 1024 * 1024; // 10 MiB
const TRUNCATE_AT = 64 * 1024; // 64 KiB
const TRUNCATION_MARKER = '\n[... saída truncada em 64 KiB ...]';

function defaultExec(): ExecGit {
  return (args, options) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        'git',
        [...args],
        { cwd: options.cwd, maxBuffer: options.maxBuffer },
        (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stdout);
        },
      );
    });
}

function truncateOutput(text: string): { text: string; truncated: boolean } {
  if (text.length <= TRUNCATE_AT) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, TRUNCATE_AT) + TRUNCATION_MARKER, truncated: true };
}

/** Executa um subcomando de git, sempre prefixado por `--no-optional-locks` (D9). */
function runGit(exec: ExecGit, args: readonly string[], cwd: string): Promise<string> {
  return exec(['--no-optional-locks', ...args], { cwd, maxBuffer: MAX_BUFFER });
}

/**
 * Descobre o toplevel real do repositório a partir do alvo declarado, resolve
 * seu `realpath` e aplica o veredicto de contenção — nesta ordem, sempre
 * antes de qualquer subcomando (D2/ADR-0014). Falha em qualquer etapa
 * (git ausente, não é repositório, falha ao resolver o realpath, `verify`
 * recusando) é fail-closed: recusa estruturada, o subcomando não roda.
 */
async function resolveRepository(
  target: string,
  exec: ExecGit,
  realpath: (path: string) => Promise<string>,
  verify: Verify,
): Promise<string> {
  let toplevelRaw: string;
  try {
    toplevelRaw = (await runGit(exec, ['rev-parse', '--show-toplevel'], target)).trim();
  } catch (cause) {
    throw new Error(
      `não foi possível localizar um repositório git em ${target}: ${(cause as Error).message}`,
      { cause },
    );
  }

  let toplevel: string;
  try {
    toplevel = await realpath(toplevelRaw);
  } catch (cause) {
    throw new Error(
      `não foi possível resolver o repositório git em ${toplevelRaw}: ${(cause as Error).message}`,
      { cause },
    );
  }

  if (!verify(toplevel, 'read')) {
    throw new Error(`fora do diretório permitido: ${toplevel}`);
  }

  return toplevel;
}

async function runSubcommand(
  repository: string,
  args: readonly string[],
  exec: ExecGit,
): Promise<GitOutput> {
  let raw: string;
  try {
    raw = await runGit(exec, args, repository);
  } catch (cause) {
    throw new Error(`falha ao executar git ${args.join(' ')}: ${(cause as Error).message}`, {
      cause,
    });
  }
  const { text, truncated } = truncateOutput(raw);
  return { repository, text, truncated };
}

function normalizeMaxCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 20;
}

export function nodeGitReadPort(deps: NodeGitPortDeps = {}): GitReadPort {
  const verify = deps.verify ?? (() => false);
  const exec = deps.exec ?? defaultExec();
  const realpath = deps.realpath ?? ((path: string) => fsRealpath(path));

  async function withRepository(target: string, args: readonly string[]): Promise<GitOutput> {
    const repository = await resolveRepository(target, exec, realpath, verify);
    return runSubcommand(repository, args, exec);
  }

  return {
    status: (cwd) => withRepository(cwd, ['status']),
    diff: (cwd, opts) => withRepository(cwd, opts?.staged ? ['diff', '--cached'] : ['diff']),
    log: (cwd, opts) =>
      withRepository(cwd, ['log', `--max-count=${normalizeMaxCount(opts?.maxCount)}`]),
  };
}
