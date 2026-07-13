import type { AtlasConfigOverride, AtlasPlatform } from '@atlas/contracts';
import { createModelGateway } from '@atlas/model-gateway';
import { createCognitiveCore } from '@atlas/cognitive';
import { createContextService } from '@atlas/context';
import { createPersonaService } from '@atlas/persona';
import { loadConfig } from './config/load-config.js';
import { createLifecycle } from './lifecycle/lifecycle.js';

export interface CreateAtlasOptions {
  config?: AtlasConfigOverride;
}

export interface CreateAtlasDeps {
  fetch?: typeof fetch;
}

export async function createAtlas(
  options: CreateAtlasOptions = {},
  deps: CreateAtlasDeps = {},
): Promise<AtlasPlatform> {
  const config = loadConfig(options.config);
  const personaService = createPersonaService();
  const persona = personaService.get(config.persona);
  const gateway = createModelGateway(config.model, { fetch: deps.fetch ?? globalThis.fetch });
  const cognitive = createCognitiveCore({
    gateway,
    personaPrompt: personaService.systemPrompt(persona),
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
    shutdown: () => lifecycle.shutdown(),
  };
}

export { defaultConfig } from './config/defaults.js';
export { loadConfig } from './config/load-config.js';
export { createLifecycle } from './lifecycle/lifecycle.js';
export type { Lifecycle, LifecycleHooks } from './lifecycle/lifecycle.js';
