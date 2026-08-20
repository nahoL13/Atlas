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
import { DATA_DIR_ISSUE, isValidDataDir, mergeDataDir } from './data-dir.js';

const PROVIDERS: readonly ProviderName[] = ['fake', 'local', 'remote'];

/**
 * Formato de hostname válido para `netRoots` (ADR-0026/Escopo 4): string não
 * vazia, sem espaço em branco, sem `://`/`/`/`@`/`:`/`?`/`#`. Validação de
 * *formato*, não de existência/DNS — a CLI repassa cru (ADR-0006), a
 * validação vive só aqui.
 */
const INVALID_HOST_CHARS = /[:/@?#\s]/;

function isValidNetRootEntry(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && !INVALID_HOST_CHARS.test(value);
}

/**
 * `options.personaIds` (aditivo, SPEC-0039/ADR-0020, Decisão D5): conjunto
 * de ids válidos para o campo `persona`, vindo do catálogo já carregado do
 * Persona Service (embutidas + custom). Ausente ⇒ valida contra
 * `PERSONA_IDS` (só embutidas), exatamente como antes desta SPEC.
 */
export function loadConfig(
  override: AtlasConfigOverride = {},
  options: { readonly personaIds?: readonly string[] } = {},
): AtlasConfig {
  const defaults = defaultConfig();
  const model: ModelGatewayConfig = { ...defaults.model, ...override.model };
  const memory = { path: override.memory?.path ?? defaults.memory.path };
  const permissions = {
    readRoots: override.permissions?.readRoots ?? defaults.permissions.readRoots,
    writeRoots: override.permissions?.writeRoots ?? defaults.permissions.writeRoots,
    netRoots: override.permissions?.netRoots ?? defaults.permissions.netRoots,
  };
  const personaIds = options.personaIds ?? PERSONA_IDS;
  const merged: AtlasConfig = {
    logLevel: override.logLevel ?? defaults.logLevel,
    dataDir: mergeDataDir(override),
    persona: override.persona ?? defaults.persona,
    memory,
    permissions,
    model,
  };

  const issues: string[] = [];

  if (!LOG_LEVELS.includes(merged.logLevel)) {
    issues.push(
      `logLevel deve ser um de: ${LOG_LEVELS.join(', ')} (recebido: ${String(merged.logLevel)})`,
    );
  }

  if (!isValidDataDir(merged.dataDir)) {
    issues.push(DATA_DIR_ISSUE);
  }

  if (!personaIds.includes(merged.persona)) {
    issues.push(
      `persona deve ser um de: ${personaIds.join(', ')} (recebido: ${String(merged.persona)})`,
    );
  }

  if (typeof memory.path !== 'string' || memory.path.trim() === '') {
    issues.push('memory.path deve ser uma string não vazia');
  }

  if (
    !Array.isArray(permissions.readRoots) ||
    permissions.readRoots.length === 0 ||
    permissions.readRoots.some((root) => typeof root !== 'string' || root.trim() === '')
  ) {
    issues.push('permissions.readRoots deve ser uma lista não vazia de caminhos não vazios');
  }

  if (
    !Array.isArray(permissions.writeRoots) ||
    permissions.writeRoots.some((root) => typeof root !== 'string' || root.trim() === '')
  ) {
    issues.push(
      'permissions.writeRoots deve ser uma lista de caminhos não vazios (pode ser vazia)',
    );
  }

  if (
    !Array.isArray(permissions.netRoots) ||
    permissions.netRoots.some((host) => !isValidNetRootEntry(host))
  ) {
    issues.push(
      'permissions.netRoots deve ser uma lista de hostnames válidos (sem esquema/porta/caminho; pode ser vazia)',
    );
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
