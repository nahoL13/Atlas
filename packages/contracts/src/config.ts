import type { ModelGatewayConfig } from './model.js';

export type LogLevel = 'silent' | 'error' | 'info' | 'debug';

export const LOG_LEVELS: readonly LogLevel[] = ['silent', 'error', 'info', 'debug'];

export interface AtlasConfig {
  readonly logLevel: LogLevel;
  readonly dataDir: string;
  readonly model: ModelGatewayConfig;
}

export interface AtlasConfigOverride {
  logLevel?: LogLevel;
  dataDir?: string;
  model?: Partial<ModelGatewayConfig>;
}
