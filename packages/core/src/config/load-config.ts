import { InvalidConfigError, LOG_LEVELS, type AtlasConfig } from '@atlas/contracts';
import { defaultConfig } from './defaults.js';

export function loadConfig(override: Partial<AtlasConfig> = {}): AtlasConfig {
  const merged: AtlasConfig = { ...defaultConfig(), ...override };
  const issues: string[] = [];

  if (!LOG_LEVELS.includes(merged.logLevel)) {
    issues.push(
      `logLevel deve ser um de: ${LOG_LEVELS.join(', ')} (recebido: ${String(merged.logLevel)})`,
    );
  }

  if (typeof merged.dataDir !== 'string' || merged.dataDir.trim() === '') {
    issues.push('dataDir deve ser uma string não vazia');
  }

  if (issues.length > 0) {
    throw new InvalidConfigError(issues);
  }

  return Object.freeze(merged);
}
