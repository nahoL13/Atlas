import type { AtlasConfigOverride, AtlasPlatform } from '@atlas/contracts';
import { createModelGateway } from '@atlas/model-gateway';
import { createCognitiveCore } from '@atlas/cognitive';
import { createContextService } from '@atlas/context';
import { createPersonaService } from '@atlas/persona';
import { createFileMemoryStorage, createMemoryService, type MemoryStorage } from '@atlas/memory';
import { createPermissionService } from '@atlas/permissions';
import { createRuntime } from '@atlas/runtime';
import {
  createToolRegistry,
  createClockTool,
  createCalcTool,
  createReadFileTool,
  createListDirTool,
  createWriteFileTool,
  nodeFsReadPort,
  nodeFsWritePort,
  type FsReadPort,
  type FsWritePort,
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
  const memoryPrompt = memory.prompt();
  const gateway = createModelGateway(config.model, { fetch: deps.fetch ?? globalThis.fetch });
  const fsRead = deps.fsRead ?? nodeFsReadPort();
  const fsWrite = deps.fsWrite ?? nodeFsWritePort();
  const permissions = createPermissionService({
    readRoots: config.permissions.readRoots,
    writeRoots: config.permissions.writeRoots,
  });
  const registry = createToolRegistry();
  registry.register(createClockTool());
  registry.register(createCalcTool());
  registry.register(createReadFileTool({ fs: fsRead }));
  registry.register(createListDirTool({ fs: fsRead }));
  registry.register(createWriteFileTool({ fs: fsWrite }));
  const runtime = createRuntime({ registry, permissions });
  const cognitive = createCognitiveCore({
    gateway,
    runtime,
    personaPrompt: personaService.systemPrompt(persona),
    ...(memoryPrompt !== undefined ? { memoryPrompt } : {}),
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
    shutdown: () => lifecycle.shutdown(),
  };
}

export { defaultConfig } from './config/defaults.js';
export { loadConfig } from './config/load-config.js';
export { createLifecycle } from './lifecycle/lifecycle.js';
export type { Lifecycle, LifecycleHooks } from './lifecycle/lifecycle.js';
