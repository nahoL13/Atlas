import type { AtlasConfig } from './config.js';
import type { CognitiveCore } from './cognitive.js';
import type { ContextService } from './context.js';

export type LifecycleState = 'created' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface AtlasPlatform {
  readonly state: LifecycleState;
  readonly config: AtlasConfig;
  readonly cognitive: CognitiveCore;
  readonly context: ContextService;
  shutdown(): Promise<void>;
}
