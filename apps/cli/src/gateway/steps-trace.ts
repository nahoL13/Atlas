import type { ExecutedStep } from '@atlas/contracts';
import type { OutputGateway } from './output-gateway.js';

/**
 * Traço compacto das Tools executadas num turno (ask/chat), incluindo passos
 * negados/bloqueados com o motivo. Reusado por `ask` e `chat` — mesmo formato.
 */
export function renderSteps(
  steps: readonly ExecutedStep[] | undefined,
  output: OutputGateway,
): void {
  if (steps === undefined || steps.length === 0) {
    return;
  }
  for (const step of steps) {
    const outcome = step.result.ok
      ? (step.result.output ?? '')
      : `erro: ${step.result.error ?? ''}`;
    output.write(`🔧 ${step.tool} → ${outcome}\n`);
  }
  output.write('\n');
}
