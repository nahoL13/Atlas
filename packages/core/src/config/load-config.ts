import {
  InvalidConfigError,
  LOG_LEVELS,
  type AtlasConfig,
  type AtlasConfigOverride,
  type ModelGatewayConfig,
  type ProviderName,
} from '@atlas/contracts';
import { PERSONA_IDS } from '@atlas/persona';
import { defaultConfig } from './defaults.js';

const PROVIDERS: readonly ProviderName[] = ['fake', 'local', 'remote'];

export function loadConfig(override: AtlasConfigOverride = {}): AtlasConfig {
  const defaults = defaultConfig();
  const model: ModelGatewayConfig = { ...defaults.model, ...override.model };
  const memory = { path: override.memory?.path ?? defaults.memory.path };
  const merged: AtlasConfig = {
    logLevel: override.logLevel ?? defaults.logLevel,
    dataDir: override.dataDir ?? defaults.dataDir,
    persona: override.persona ?? defaults.persona,
    memory,
    model,
  };

  const issues: string[] = [];

  if (!LOG_LEVELS.includes(merged.logLevel)) {
    issues.push(
      `logLevel deve ser um de: ${LOG_LEVELS.join(', ')} (recebido: ${String(merged.logLevel)})`,
    );
  }

  if (typeof merged.dataDir !== 'string' || merged.dataDir.trim() === '') {
    issues.push('dataDir deve ser uma string não vazia');
  }

  if (!PERSONA_IDS.includes(merged.persona)) {
    issues.push(
      `persona deve ser um de: ${PERSONA_IDS.join(', ')} (recebido: ${String(merged.persona)})`,
    );
  }

  if (typeof memory.path !== 'string' || memory.path.trim() === '') {
    issues.push('memory.path deve ser uma string não vazia');
  }

  if (!PROVIDERS.includes(model.provider)) {
    issues.push(
      `model.provider deve ser um de: ${PROVIDERS.join(', ')} (recebido: ${String(model.provider)})`,
    );
  }

  if (model.provider === 'remote' && (model.apiKey === undefined || model.apiKey.trim() === '')) {
    issues.push('model.apiKey é obrigatório para o provider remote');
  }

  if (model.provider !== 'fake' && (model.model === undefined || model.model.trim() === '')) {
    issues.push('model.model é obrigatório para os providers local e remote');
  }

  if (issues.length > 0) {
    throw new InvalidConfigError(issues);
  }

  return Object.freeze(merged);
}
