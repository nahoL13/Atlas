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
      '',
    ].join('\n'),
  );
}
