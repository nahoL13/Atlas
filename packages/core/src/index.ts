import type { AtlasConfigOverride, AtlasPlatform } from '@atlas/contracts';
import { createModelGateway } from '@atlas/model-gateway';
import { createCognitiveCore } from '@atlas/cognitive';
import { createContextService } from '@atlas/context';
import { createPersonaService } from '@atlas/persona';
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
  nodeFsReadPort,
  nodeFsWritePort,
  nodeGitReadPort,
  type FsReadPort,
  type FsWritePort,
  type GitReadPort,
} from '@atlas/tools';
import { loadConfig } from './config/load-config.js';
import { createLifecycle } from './lifecycle/lifecycle.js';

export interface CreateAtlasOptions {
  config?: AtlasConfigOverride;
}

export interface CreateAtlasDeps {
  fetch?: typeof fetch;
  memoryStorage?: MemoryStorage;
  fsRead?: FsReadPort;
  fsWrite?: FsWritePort;
  git?: GitReadPort;
  confirm?: ConfirmPort;
}

export async function createAtlas(
  options: CreateAtlasOptions = {},
  deps: CreateAtlasDeps = {},
): Promise<AtlasPlatform> {
  const config = loadConfig(options.config);
  const personaService = createPersonaService();
  const persona = personaService.get(config.persona);
  const storage = deps.memoryStorage ?? createFileMemoryStorage(config.memory.path);
  const memory = await createMemoryService({ storage });
  const gateway = createModelGateway(config.model, { fetch: deps.fetch ?? globalThis.fetch });
  const confirm = deps.confirm ?? nodeReadlineConfirmPort();
  const permissions = createPermissionService({
    readRoots: config.permissions.readRoots,
    writeRoots: config.permissions.writeRoots,
  });
  const verify = permissions.isContained.bind(permissions);
  const fsRead = deps.fsRead ?? nodeFsReadPort({ verify });
  const fsWrite = deps.fsWrite ?? nodeFsWritePort({ verify });
  const git = deps.git ?? nodeGitReadPort({ verify });
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
export { createLifecycle } from './lifecycle/lifecycle.js';
export type { Lifecycle, LifecycleHooks } from './lifecycle/lifecycle.js';

// Re-export de catálogo (SPEC-0037, Decisão D4): superfície de leitura de
// catálogo/config inerte, no molde de `loadConfig`/`defaultConfig` acima —
// é a porta pela qual `apps/*` leem o catálogo de Personas continuando a
// importar implementação só de `@atlas/core` (ADR-0003 / Regra de
// Dependência 11). Aditivo: nenhum wiring novo, nenhuma mudança em
// `createAtlas`.
export { createPersonaService, PERSONA_IDS } from '@atlas/persona';
