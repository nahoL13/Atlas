import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export function runStatus(atlas: AtlasPlatform, output: OutputGateway): void {
  const { state, config, persona } = atlas;
  output.write(
    [
      `Atlas: ${state}`,
      `logLevel: ${config.logLevel}`,
      `dataDir: ${config.dataDir}`,
      `persona: ${persona.name} (${persona.id})`,
      '',
    ].join('\n'),
  );
}
