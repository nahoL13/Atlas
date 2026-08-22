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
    /** Allowlist de hostnames (ADR-0026(b)/(c)). Default: [] (fail-closed). */
    readonly netRoots: readonly string[];
  };
  readonly model: ModelGatewayConfig;
  /**
   * Configuração dos adaptadores de `@atlas/tools` que precisam de endpoint
   * — namespace de módulo, no mesmo molde de `model`/`permissions`/`memory`
   * (SPEC-0057/D22).
   * `searchUrl`: endpoint do provedor de busca (compatível com a API JSON do
   * SearXNG). '' = não configurado — a Tool `web_search` não é registrada.
   */
  readonly tools: { readonly searchUrl: string };
}

export interface AtlasConfigOverride {
  logLevel?: LogLevel;
  dataDir?: string;
  persona?: string;
  memory?: { path?: string };
  permissions?: {
    readRoots?: readonly string[];
    writeRoots?: readonly string[];
    netRoots?: readonly string[];
  };
  model?: Partial<ModelGatewayConfig>;
  tools?: { searchUrl?: string };
}
