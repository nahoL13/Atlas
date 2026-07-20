import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export async function runRemember(
  atlas: AtlasPlatform,
  text: string,
  output: OutputGateway,
): Promise<void> {
  const { fact, created } = await atlas.memory.remember(text);
  if (created) {
    output.write(`Lembrado [${fact.id}]: ${fact.text}\n`);
  } else {
    output.write(`Já conhecido [${fact.id}]: ${fact.text}\n`);
  }
}
