import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export async function runRemember(
  atlas: AtlasPlatform,
  text: string,
  output: OutputGateway,
): Promise<void> {
  const fact = await atlas.memory.remember(text);
  output.write(`Lembrado [${fact.id}]: ${fact.text}\n`);
}
