import type { AtlasConfig } from './config.js';
import type { CognitiveCore } from './cognitive.js';
import type { ContextService } from './context.js';
import type { MemoryService } from './memory.js';
import type { Persona } from './persona.js';
import type { SkillBuilder, SkillRegistry } from './skill.js';

export type LifecycleState = 'created' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface AtlasPlatform {
  readonly state: LifecycleState;
  readonly config: AtlasConfig;
  readonly persona: Persona;
  readonly cognitive: CognitiveCore;
  readonly context: ContextService;
  readonly memory: MemoryService;
  readonly skills: SkillRegistry;
  readonly skillBuilder: SkillBuilder;
  shutdown(): Promise<void>;
}
