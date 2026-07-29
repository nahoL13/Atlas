import { InvalidConfigError, type AtlasConfigOverride } from '@atlas/contracts';
import { defaultConfig } from './defaults.js';

/**
 * Mensagem de validação de `dataDir` — fonte única, consumida por
 * `resolveDataDir` (abaixo) e por `loadConfig`, para que as duas nunca
 * divirjam (SPEC-0039, Decisão D17).
 */
export const DATA_DIR_ISSUE = 'dataDir deve ser uma string não vazia';

/**
 * Precedência de `dataDir` (`flags > env > defaults` — ADR-0006, slot
 * `arquivo` não implementado), extraída para ser a **única** fonte da
 * regra, consumida tanto por `resolveDataDir` quanto por `loadConfig`.
 */
export function mergeDataDir(override: AtlasConfigOverride = {}): string {
  return override.dataDir ?? defaultConfig().dataDir;
}

export function isValidDataDir(dataDir: unknown): dataDir is string {
  return typeof dataDir === 'string' && dataDir.trim() !== '';
}

/**
 * Resolve **somente** o `dataDir` de um `AtlasConfigOverride`, pela mesma
 * precedência de `loadConfig` — pura, sem IO, e **sem tocar no campo
 * `persona`** (nunca aciona `PERSONA_IDS`, SPEC-0039 correção B1): achar o
 * arquivo de Personas (ou qualquer outro dado guardado sob `dataDir`) é uma
 * preocupação independente de saber se a Persona ativa é válida.
 */
export function resolveDataDir(override: AtlasConfigOverride = {}): string {
  const dataDir = mergeDataDir(override);
  if (!isValidDataDir(dataDir)) {
    throw new InvalidConfigError([DATA_DIR_ISSUE]);
  }
  return dataDir;
}
