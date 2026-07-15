import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AtlasConfig } from '@atlas/contracts';

export function defaultConfig(): AtlasConfig {
  return {
    logLevel: 'info',
    dataDir: join(homedir(), '.atlas'),
    persona: 'jarvis',
    memory: { path: join(homedir(), '.atlas', 'memory.json') },
    permissions: { readRoots: [process.cwd()] },
    model: {
      provider: 'local',
      model: 'llama3.2',
    },
  };
}
