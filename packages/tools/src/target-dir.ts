/**
 * Resolução do diretório-alvo compartilhada por Tools que operam sobre um
 * diretório (`args.path` quando presente e não-vazio; `cwd()` injetável na
 * ausência). Nascida em `git-target.ts` (SPEC-0028/D4) para as três Tools de
 * git; renomeada aqui (SPEC-0056/D8) porque `project_info` é um segundo
 * consumidor que não é de git — o nome antigo passaria a mentir sobre a
 * fronteira do helper. Interno a `@atlas/tools`, sem 2º consumidor fora
 * deste package.
 */
export interface TargetOk {
  readonly ok: true;
  readonly target: string;
}

export interface TargetError {
  readonly ok: false;
  readonly error: string;
}

export function resolveTargetDirectory(
  args: Record<string, unknown>,
  cwd: () => string,
): TargetOk | TargetError {
  const path = args.path;
  if (path === undefined) {
    return { ok: true, target: cwd() };
  }
  if (typeof path !== 'string' || path.trim() === '') {
    return { ok: false, error: '"path" deve ser uma string não vazia quando presente' };
  }
  return { ok: true, target: path };
}
