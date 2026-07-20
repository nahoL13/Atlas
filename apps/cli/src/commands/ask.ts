import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';
import { renderLearned, renderSteps } from '../gateway/steps-trace.js';

export async function runAsk(
  atlas: AtlasPlatform,
  objective: string,
  output: OutputGateway,
): Promise<void> {
  const result = await atlas.cognitive.ask(objective);
  renderSteps(result.steps, output);
  output.write(`${result.text}\n`);
  // Etapa 6 (Aprendizado, SPEC-0020/ADR-0016): o Cognitive propõe os
  // candidatos como dado; a borda grava (autoridade exclusiva da Memory) e
  // anuncia — nunca gravação silenciosa.
  for (const fact of result.learned ?? []) {
    const { created } = await atlas.memory.remember(fact, 'learned');
    if (created) {
      renderLearned(fact, output);
    }
  }
}
