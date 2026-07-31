import type { AtlasConfigOverride, PersonaService } from '@atlas/contracts';
import {
  createFilePersonaStorage,
  createPersonaService,
  personaStoragePath,
  resolveDataDir,
} from '@atlas/core';
import type { PersonaStorage } from '@atlas/core';

/**
 * Deriva o storage de Personas da CLI pelo caminho canônico
 * (`personaStoragePath(resolveDataDir(...))`, SPEC-0039/§3) — nunca um
 * `join` reinventado. Nunca chama `loadConfig`: achar o arquivo é
 * independente de a Persona ativa (`configOverride.persona`) ser válida
 * (SPEC-0039, Decisão D17 — correção do deadlock B1), então um
 * `ATLAS_PERSONA` apontando para um id inexistente não impede compor este
 * storage.
 */
export function createCliPersonaStorage(configOverride: AtlasConfigOverride): PersonaStorage {
  return createFilePersonaStorage(personaStoragePath(resolveDataDir(configOverride)));
}

/**
 * Compõe o `PersonaService` usado pelos subcomandos `atlas persona …`
 * (SPEC-0044, Decisão D5): exceção delimitada já autorizada por
 * `packages/core/CLAUDE.md` (SPEC-0039/D12) — o único serviço da
 * plataforma composto diretamente em `apps/cli`. Os subcomandos de
 * `persona` usam **só** este serviço; não sobem `createAtlas`.
 */
export function createCliPersonaService(configOverride: AtlasConfigOverride): PersonaService {
  return createPersonaService({ storage: createCliPersonaStorage(configOverride) });
}
