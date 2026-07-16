import type { ModelGatewayConfig } from './model.js';

export type LogLevel = 'silent' | 'error' | 'info' | 'debug';

export const LOG_LEVELS: readonly LogLevel[] = ['silent', 'error', 'info', 'debug'];

export interface AtlasConfig {
  readonly logLevel: LogLevel;
  readonly dataDir: string;
  readonly persona: string;
  readonly memory: { readonly path: string };
  readonly permissions: {
    readonly readRoots: readonly string[];
    readonly writeRoots: readonly string[];
  };
  readonly model: ModelGatewayConfig;
}

export interface AtlasConfigOverride {
  logLevel?: LogLevel;
  dataDir?: string;
  persona?: string;
  memory?: { path?: string };
  permissions?: { readRoots?: readonly string[]; writeRoots?: readonly string[] };
  model?: Partial<ModelGatewayConfig>;
}
