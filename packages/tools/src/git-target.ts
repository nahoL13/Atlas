/**
 * Resolução do diretório-alvo compartilhada pelas três Tools de git
 * (`args.path` quando presente e não-vazio; `cwd()` injetável na ausência —
 * D4). Interno a `@atlas/tools`, sem 2º consumidor fora deste package.
 */
export interface GitTargetOk {
  readonly ok: true;
  readonly target: string;
}

export interface GitTargetError {
  readonly ok: false;
  readonly error: string;
}

export function resolveGitTarget(
  args: Record<string, unknown>,
  cwd: () => string,
): GitTargetOk | GitTargetError {
  const path = args.path;
  if (path === undefined) {
    return { ok: true, target: cwd() };
  }
  if (typeof path !== 'string' || path.trim() === '') {
    return { ok: false, error: '"path" deve ser uma string não vazia quando presente' };
  }
  return { ok: true, target: path };
}
