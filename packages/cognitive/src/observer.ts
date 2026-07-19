import type { ExecutionResult } from '@atlas/contracts';

/**
 * Veredicto da Etapa 5 (Observação) do Cognitive Lifecycle. Interno ao
 * package (sem 2º consumidor, mesmo critério de `Planner`/`FsReadPort`/
 * `ConfirmPort` — não sobe a `@atlas/contracts`, ADR-0015).
 */
export interface Observation {
  readonly verdict: 'complete' | 'replan';
}

/**
 * Observador determinístico e puro (ADR-0015): inspeciona os `ExecutedStep`
 * do último passe e decide se o Cognitive Core deve replanejar. Nunca chama
 * o modelo, nunca faz parse de string de erro — classifica só pelo
 * discriminador estrutural `denialKind` que o Runtime já rotula.
 *
 * `replan` sse houver algum passo `ok: false` SEM `denialKind` (falha de
 * Tool: exceção, erro de IO, contenção-no-uso/TOCTOU, ferramenta
 * desconhecida). Passos negados com `denialKind` (`blocked`/`declined`) são
 * terminais — não contribuem para replan.
 */
export function observe(executionResult: ExecutionResult): Observation {
  const hasToolFailure = executionResult.steps.some(
    (step) => !step.result.ok && step.denialKind === undefined,
  );
  return { verdict: hasToolFailure ? 'replan' : 'complete' };
}
