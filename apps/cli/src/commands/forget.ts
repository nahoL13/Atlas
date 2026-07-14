import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export async function runForget(
  atlas: AtlasPlatform,
  id: string,
  output: OutputGateway,
): Promise<void> {
  const removed = await atlas.memory.forget(id);
  output.write(removed ? `Esquecido [${id}]\n` : `Nenhum fato com id ${id}\n`);
}
