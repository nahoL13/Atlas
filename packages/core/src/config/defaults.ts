import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AtlasConfig } from '@atlas/contracts';

export function defaultConfig(): AtlasConfig {
  return {
    logLevel: 'info',
    dataDir: join(homedir(), '.atlas'),
    persona: 'jarvis',
    memory: { path: join(homedir(), '.atlas', 'memory.json') },
    permissions: { readRoots: [process.cwd()], writeRoots: [], netRoots: [] },
    model: {
      provider: 'local',
      model: 'llama3.2',
    },
    tools: { searchUrl: '' },
    // Auto-gerência de processos externos (SPEC-0060/D24): fail-closed —
    // sem opt-in explícito, nenhum health-check e nenhum processo é
    // disparado.
    dependencies: { autoStartOllama: false },
  };
}
