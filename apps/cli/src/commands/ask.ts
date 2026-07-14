import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export async function runAsk(
  atlas: AtlasPlatform,
  objective: string,
  output: OutputGateway,
): Promise<void> {
  const result = await atlas.cognitive.ask(objective);
  if (result.steps !== undefined && result.steps.length > 0) {
    for (const step of result.steps) {
      const outcome = step.result.ok
        ? (step.result.output ?? '')
        : `erro: ${step.result.error ?? ''}`;
      output.write(`🔧 ${step.tool} → ${outcome}\n`);
    }
    output.write('\n');
  }
  output.write(`${result.text}\n`);
}
