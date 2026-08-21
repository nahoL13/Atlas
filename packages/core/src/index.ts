import { join } from 'node:path';
import type { AtlasConfigOverride, AtlasPlatform } from '@atlas/contracts';
import { createModelGateway } from '@atlas/model-gateway';
import { createCognitiveCore } from '@atlas/cognitive';
import { createContextService } from '@atlas/context';
import { createPersonaService, type PersonaStorage } from '@atlas/persona';
import { createFileMemoryStorage, createMemoryService, type MemoryStorage } from '@atlas/memory';
import { createPermissionService } from '@atlas/permissions';
import { createRuntime, nodeReadlineConfirmPort, type ConfirmPort } from '@atlas/runtime';
import { createSkillRegistry, createSkillBuilder, BUILTIN_SKILLS } from '@atlas/skills';
import {
  createToolRegistry,
  createClockTool,
  createCalcTool,
  createReadFileTool,
  createListDirTool,
  createWriteFileTool,
  createDeleteFileTool,
  createMkdirTool,
  createAppendFileTool,
  createGitStatusTool,
  createGitDiffTool,
  createGitLogTool,
  createHttpGetTool,
  createProjectInfoTool,
  nodeFsReadPort,
  nodeFsWritePort,
  nodeGitReadPort,
  nodeHttpPort,
  type FsReadPort,
  type FsWritePort,
  type GitReadPort,
  type HttpPort,
} from '@atlas/tools';
import { loadConfig } from './config/load-config.js';
import { createLifecycle } from './lifecycle/lifecycle.js';

export interface CreateAtlasOptions {
  config?: AtlasConfigOverride;
}

export interface CreateAtlasDeps {
  fetch?: typeof fetch;
  memoryStorage?: MemoryStorage;
  /**
   * Porta de storage do Persona Service (ADR-0020(a)), molde exato de
   * `memoryStorage?`. **Sem** ela, `createPersonaService` sobe sem storage
   * — comportamento idêntico ao de hoje, byte a byte, inclusive
   * `apps/cli` (que não a injeta nesta fatia): nenhum arquivo de Personas
   * é lido ou criado.
   */
  personaStorage?: PersonaStorage;
  fsRead?: FsReadPort;
  fsWrite?: FsWritePort;
  git?: GitReadPort;
  http?: HttpPort;
  confirm?: ConfirmPort;
}

export async function createAtlas(
  options: CreateAtlasOptions = {},
  deps: CreateAtlasDeps = {},
): Promise<AtlasPlatform> {
  // O Persona Service é composto ANTES do loadConfig (ADR-0020/D5): o
  // catálogo de ids válidos (embutidas + custom, quando `personaStorage`
  // foi injetado) alimenta a validação do campo `persona`, para que uma
  // Persona custom em `config.persona` seja resolvida, não rejeitada.
  const personaService = createPersonaService(
    deps.personaStorage !== undefined ? { storage: deps.personaStorage } : {},
  );
  const config = loadConfig(options.config, { personaIds: personaService.list() });
  const persona = personaService.get(config.persona);
  const storage = deps.memoryStorage ?? createFileMemoryStorage(config.memory.path);
  const memory = await createMemoryService({ storage });
  const gateway = createModelGateway(config.model, { fetch: deps.fetch ?? globalThis.fetch });
  const confirm = deps.confirm ?? nodeReadlineConfirmPort();
  const permissions = createPermissionService({
    readRoots: config.permissions.readRoots,
    writeRoots: config.permissions.writeRoots,
    netRoots: config.permissions.netRoots,
  });
  const verify = permissions.isContained.bind(permissions);
  const fsRead = deps.fsRead ?? nodeFsReadPort({ verify });
  const fsWrite = deps.fsWrite ?? nodeFsWritePort({ verify });
  const git = deps.git ?? nodeGitReadPort({ verify });
  const http = deps.http ?? nodeHttpPort();
  const registry = createToolRegistry();
  registry.register(createClockTool());
  registry.register(createCalcTool());
  registry.register(createReadFileTool({ fs: fsRead }));
  registry.register(createListDirTool({ fs: fsRead }));
  registry.register(createWriteFileTool({ fs: fsWrite }));
  registry.register(createDeleteFileTool({ fs: fsWrite }));
  registry.register(createMkdirTool({ fs: fsWrite }));
  registry.register(createAppendFileTool({ fs: fsWrite }));
  registry.register(createGitStatusTool({ git }));
  registry.register(createGitDiffTool({ git }));
  registry.register(createGitLogTool({ git }));
  registry.register(createHttpGetTool({ http }));
  registry.register(createProjectInfoTool({ fs: fsRead, git }));
  const runtime = createRuntime({ registry, permissions, confirm });
  const skills = createSkillRegistry({ skills: BUILTIN_SKILLS });
  const skillBuilder = createSkillBuilder({ gateway, registry: skills, tools: registry });
  const cognitive = createCognitiveCore({
    gateway,
    runtime,
    personaPrompt: personaService.systemPrompt(persona),
    // Provider síncrono (SPEC-0021): amostrado 1x por turno pelo Cognitive,
    // sempre delegando à Memory (autoridade exclusiva do estado persistente
    // — Artigo 11). Recompõe o systemPrompt a cada ask/respond, fechando o
    // laço de aprendizado dentro da própria sessão. Desde a SPEC-0030, o
    // provider recebe a consulta do turno e o orçamento de fatos e apenas
    // repassa — a seleção vive inteiramente dentro da Memory.
    memoryPrompt: (query, limit) => memory.prompt({ query, limit }),
    // Projeção somente-leitura do SkillRegistry (SPEC-0026/ADR-0018): o
    // Cognitive só lê o catálogo (list/get), nunca register/deactivate/
    // remove — menor privilégio, no molde do memoryPrompt acima.
    skillCatalog: { list: () => skills.list(), get: (id) => skills.get(id) },
  });
  const context = createContextService();
  const lifecycle = createLifecycle();
  await lifecycle.start();

  return {
    get state() {
      return lifecycle.state;
    },
    config,
    persona,
    cognitive,
    context,
    memory,
    skills,
    skillBuilder,
    shutdown: () => lifecycle.shutdown(),
  };
}

export { defaultConfig } from './config/defaults.js';
export { loadConfig } from './config/load-config.js';
export { resolveDataDir } from './config/data-dir.js';
export { createLifecycle } from './lifecycle/lifecycle.js';
export type { Lifecycle, LifecycleHooks } from './lifecycle/lifecycle.js';

// Re-export de catálogo (SPEC-0037, Decisão D4; alargado pela SPEC-0039,
// Decisão D12): superfície de leitura de catálogo/config inerte + a
// composição do PersonaService sobre a porta de storage do ADR-0020, no
// molde de `loadConfig`/`defaultConfig` acima — é a porta pela qual
// `apps/*` leem o catálogo de Personas e compõem o storage continuando a
// importar implementação só de `@atlas/core` (ADR-0003 / Regra de
// Dependência 11). Aditivo: nenhum wiring novo, nenhuma mudança em
// `createAtlas`.
export { createPersonaService, createFilePersonaStorage, PERSONA_IDS } from '@atlas/persona';
export type { PersonaStorage } from '@atlas/persona';

/**
 * Único derivador do caminho do arquivo de Personas (SPEC-0039, Decisão
 * D13/D4): função pura, sem IO, que devolve `<dataDir>/personas.json`.
 * Recebe o `dataDir` já resolvido pelo chamador (hoje: `apps/desktop`, via
 * `resolveDataDir(...)`; `createAtlas` em si não a consome — nenhum
 * storage default é composto dentro do Core, ADR-0020), para nunca
 * divergir do config efetivo daquela chamada. Nenhum
 * `join(..., 'personas.json')` deve existir fora deste módulo.
 */
export function personaStoragePath(dataDir: string): string {
  return join(dataDir, 'personas.json');
}
