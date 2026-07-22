import type { AtlasPlatform, MemoryCategory } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export function runMemoryList(
  atlas: AtlasPlatform,
  output: OutputGateway,
  options?: { readonly category?: MemoryCategory },
): void {
  const facts = atlas.memory.list(options);
  if (facts.length === 0) {
    output.write('Nenhum fato memorizado.\n');
    return;
  }
  const lines = facts.map((fact) => {
    const category = fact.category ?? 'fact';
    const subjectSuffix = fact.subject !== undefined ? ` — projeto: ${fact.subject}` : '';
    return `[${fact.id}] ${fact.text} (${fact.createdAt}) — origem: ${fact.source ?? 'user'} — categoria: ${category}${subjectSuffix}`;
  });
  output.write(`${lines.join('\n')}\n`);
}

export function runMemorySearch(atlas: AtlasPlatform, query: string, output: OutputGateway): void {
  const facts = atlas.memory.search(query);
  if (facts.length === 0) {
    output.write('Nenhum fato relevante encontrado.\n');
    return;
  }
  const lines = facts.map((fact) => `[${fact.id}] ${fact.text}`);
  output.write(`${lines.join('\n')}\n`);
}

export async function runMemoryDedupe(
  atlas: AtlasPlatform,
  apply: boolean,
  output: OutputGateway,
): Promise<void> {
  const report = await atlas.memory.dedupe({ apply });

  if (report.groups.length === 0) {
    output.write('Nenhuma duplicata encontrada.\n');
    return;
  }

  const lines: string[] = [];
  for (const group of report.groups) {
    lines.push(`Sobrevive [${group.survivor.id}] ${group.survivor.text}`);
    for (const duplicate of group.duplicates) {
      const verb = report.applied ? 'removido' : 'seria removido';
      lines.push(`  ${verb}: [${duplicate.id}] ${duplicate.text}`);
    }
  }

  if (report.applied) {
    lines.push(`\n${report.groups.length} grupo(s) consolidado(s).`);
  } else {
    lines.push('\nRode com --apply para consolidar.');
  }

  output.write(`${lines.join('\n')}\n`);
}
