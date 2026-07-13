import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export async function runAsk(
  atlas: AtlasPlatform,
  objective: string,
  output: OutputGateway,
): Promise<void> {
  const answer = await atlas.cognitive.ask(objective);
  output.write(`${answer}\n`);
}
