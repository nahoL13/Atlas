import type { AtlasPlatform } from '@atlas/contracts';
import type { DependencyReport } from '@atlas/core';
import type { OutputGateway } from '../gateway/output-gateway.js';

/**
 * Linha `ollama auto-start: …` (SPEC-0060, Decisão D14 — emendada na 2ª
 * rodada): **quatro** textos exaustivos, função total do `DependencyReport`.
 * Sem outcome de `ollama` no relatório (inalcançável em produção — `run.ts`
 * sempre roda `ensure` antes de `createAtlas`, D7), degrada para o texto de
 * "desligado" em vez de inventar um 5º texto.
 */
function formatAutoStartLine(report: DependencyReport): string {
  const outcome = report.outcomes[0];
  if (outcome === undefined || outcome.status === 'disabled') {
    return 'ollama auto-start: desligado';
  }
  if (outcome.status === 'already-running') {
    return 'ollama auto-start: ligado (já em execução)';
  }
  if (outcome.status === 'started') {
    return 'ollama auto-start: ligado (iniciado pelo Atlas)';
  }
  return `ollama auto-start: ligado (falhou: ${outcome.reason})`;
}

export function runStatus(
  atlas: AtlasPlatform,
  output: OutputGateway,
  report: DependencyReport,
): void {
  const { state, config, persona } = atlas;
  output.write(
    [
      `Atlas: ${state}`,
      `logLevel: ${config.logLevel}`,
      `dataDir: ${config.dataDir}`,
      `persona: ${persona.name} (${persona.id})`,
      `readRoots: ${config.permissions.readRoots.join(', ')}`,
      `writeRoots: ${
        config.permissions.writeRoots.length > 0
          ? config.permissions.writeRoots.join(', ')
          : '(nenhuma)'
      }`,
      `netRoots: ${
        config.permissions.netRoots.length > 0 ? config.permissions.netRoots.join(', ') : '(nenhum)'
      }`,
      `search: ${config.tools.searchUrl !== '' ? config.tools.searchUrl : '(não configurado)'}`,
      formatAutoStartLine(report),
      '',
    ].join('\n'),
  );
}
