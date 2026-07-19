import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export function runMemoryList(atlas: AtlasPlatform, output: OutputGateway): void {
  const facts = atlas.memory.list();
  if (facts.length === 0) {
    output.write('Nenhum fato memorizado.\n');
    return;
  }
  const lines = facts.map(
    (fact) => `[${fact.id}] ${fact.text} (${fact.createdAt}) — origem: ${fact.source ?? 'user'}`,
  );
  output.write(`${lines.join('\n')}\n`);
}
