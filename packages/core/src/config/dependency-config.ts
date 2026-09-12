import type { AtlasConfigOverride, ProviderName } from '@atlas/contracts';
import { OLLAMA_DEFAULT_BASE_URL } from '@atlas/model-gateway';
import { defaultConfig } from './defaults.js';

/**
 * Config de dependências externas resolvida (SPEC-0060, Escopo 2.3) — molde
 * exato de `resolveDataDir` (SPEC-0039/D17).
 */
export interface DependencyConfig {
  readonly autoStartOllama: boolean;
  readonly ollamaBaseUrl: string;
}

/**
 * Precedência de `dependencies.autoStartOllama` (`override > defaults` —
 * ADR-0006, slot `arquivo` não implementado), extraída para ser a **única**
 * fonte da regra, consumida tanto por `resolveDependencyConfig` quanto por
 * `loadConfig` — molde exato de `mergeDataDir` (`data-dir.ts`, SPEC-0039).
 */
export function mergeAutoStartOllama(override: AtlasConfigOverride = {}): boolean {
  return override.dependencies?.autoStartOllama ?? defaultConfig().dependencies.autoStartOllama;
}

/**
 * Deriva o `baseUrl` efetivo do Ollama (SPEC-0060, Decisões D9/D22): só
 * herda `model.baseUrl` quando o provider **efetivo** é `'local'`
 * (igualdade exata) — `model.baseUrl` é um campo **compartilhado** pelos
 * providers `local`/`remote` (`packages/model-gateway/src/providers/
 * {ollama,remote}.ts`), não é "o endereço do Ollama". Qualquer outro valor
 * — `'remote'`, `'fake'`, ou uma string inválida que só `loadConfig`
 * rejeitaria — cai sempre na constante exportada pelo Model Gateway.
 */
function resolveOllamaBaseUrl(override: AtlasConfigOverride = {}): string {
  const providerEfetivo: ProviderName = override.model?.provider ?? defaultConfig().model.provider;
  if (providerEfetivo === 'local') {
    return override.model?.baseUrl ?? OLLAMA_DEFAULT_BASE_URL;
  }
  return OLLAMA_DEFAULT_BASE_URL;
}

/**
 * Resolve **somente** a config de dependências de um `AtlasConfigOverride`,
 * pela mesma precedência de `loadConfig` — **pura, sem IO**, e **sem nunca
 * validar** os campos `persona`/`model.provider` (não aciona `PERSONA_IDS`,
 * não rejeita um provider desconhecido): um provider inválido simplesmente
 * não é `'local'`, não lança (molde exato de `resolveDataDir`, SPEC-0039).
 */
export function resolveDependencyConfig(override: AtlasConfigOverride = {}): DependencyConfig {
  return {
    autoStartOllama: mergeAutoStartOllama(override),
    ollamaBaseUrl: resolveOllamaBaseUrl(override),
  };
}

export type ParsedBooleanSetting =
  | { readonly kind: 'unset' }
  | { readonly kind: 'value'; readonly value: boolean }
  | { readonly kind: 'invalid'; readonly received: string };

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

/**
 * Coerção **pura** de uma string de ambiente para booleano (SPEC-0060,
 * Decisão D6) — **origem única**, consumida pelas duas bordas
 * (`apps/cli`/`apps/desktop`), que só divergem em como tratam
 * `kind: 'invalid'` (D25).
 */
export function parseBooleanSetting(raw: string | undefined): ParsedBooleanSetting {
  if (raw === undefined || raw.trim() === '') {
    return { kind: 'unset' };
  }
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return { kind: 'value', value: true };
  }
  if (FALSE_VALUES.has(normalized)) {
    return { kind: 'value', value: false };
  }
  return { kind: 'invalid', received: raw };
}
