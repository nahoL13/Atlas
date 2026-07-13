import type { AtlasConfig } from './config.js';
import type { CognitiveCore } from './cognitive.js';

export type LifecycleState = 'created' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface AtlasPlatform {
  readonly state: LifecycleState;
  readonly config: AtlasConfig;
  readonly cognitive: CognitiveCore;
  shutdown(): Promise<void>;
}
