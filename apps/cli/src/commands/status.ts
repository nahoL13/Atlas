import type { AtlasPlatform } from '@atlas/contracts';
import type { DependencyReport } from '@atlas/core';
import type { OutputGateway } from '../gateway/output-gateway.js';

/**
 * Linha `ollama auto-start: …` (SPEC-0060, Decisão D14 — emendada na 2ª
 * rodada; SPEC-0061 corrige a seleção para buscar por `dependency` em vez de
 * assumir `outcomes[0]`, agora que o relatório carrega sempre dois
 * desfechos): **quatro** textos exaustivos, função total do
 * `DependencyReport`. Sem outcome de `ollama` no relatório (inalcançável em
 * produção — `run.ts` sempre roda `ensure` antes de `createAtlas`, D7),
 * degrada para o texto de "desligado" em vez de inventar um 5º texto.
 */
function formatAutoStartLine(report: DependencyReport): string {
  const outcome = report.outcomes.find((candidate) => candidate.dependency === 'ollama');
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

/**
 * Linha `search container auto-start: …` (SPEC-0061, Decisão D13): **quatro**
 * textos exaustivos, função total do `DependencyReport`, seleção por
 * `dependency` (nunca por índice). O nome do container aparece porque a
 * identidade do alvo é escolhida pelo usuário (D3).
 */
function formatSearchContainerAutoStartLine(report: DependencyReport): string {
  const outcome = report.outcomes.find((candidate) => candidate.dependency === 'search-container');
  if (outcome === undefined || outcome.status === 'disabled') {
    return 'search container auto-start: desligado';
  }
  if (outcome.status === 'already-running') {
    return `search container auto-start: "${outcome.container}" (já em execução)`;
  }
  if (outcome.status === 'started') {
    return `search container auto-start: "${outcome.container}" (iniciado pelo Atlas)`;
  }
  return `search container auto-start: "${outcome.container}" (falhou: ${outcome.reason})`;
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
      formatSearchContainerAutoStartLine(report),
      '',
    ].join('\n'),
  );
}
