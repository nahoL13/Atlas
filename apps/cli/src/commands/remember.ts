import type { AtlasPlatform, MemoryCategory } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export async function runRemember(
  atlas: AtlasPlatform,
  text: string,
  output: OutputGateway,
  options?: { readonly category?: MemoryCategory; readonly subject?: string },
): Promise<void> {
  const { fact, created } = await atlas.memory.remember(text, 'user', options);
  if (created) {
    output.write(`Lembrado [${fact.id}]: ${fact.text}\n`);
  } else {
    output.write(`Já conhecido [${fact.id}]: ${fact.text}\n`);
  }
}
