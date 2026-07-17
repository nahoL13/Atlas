import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';
import { renderSteps } from '../gateway/steps-trace.js';

export async function runAsk(
  atlas: AtlasPlatform,
  objective: string,
  output: OutputGateway,
): Promise<void> {
  const result = await atlas.cognitive.ask(objective);
  renderSteps(result.steps, output);
  output.write(`${result.text}\n`);
}
