import type { ExecutedStep } from '@atlas/contracts';

/**
 * Equivalente *de dado* ao `renderSteps` da CLI (que escreve em stream): uma
 * função pura que devolve um traço serializável por IPC, para o renderer só
 * pintar — sem conhecer `ExecutedStep`/tipos de contrato (Artigo 4 +
 * isolamento Electron).
 */
export interface StepLine {
  readonly tool: string;
  readonly outcome: string;
  readonly ok: boolean;
  readonly denialKind?: 'blocked' | 'declined';
}

export function formatSteps(steps: readonly ExecutedStep[] | undefined): readonly StepLine[] {
  if (steps === undefined || steps.length === 0) {
    return [];
  }
  return steps.map((step) => {
    const outcome = step.result.ok ? (step.result.output ?? '') : (step.result.error ?? '');
    const line: StepLine = { tool: step.tool, outcome, ok: step.result.ok };
    return step.denialKind === undefined ? line : { ...line, denialKind: step.denialKind };
  });
}
