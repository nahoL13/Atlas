import { LifecycleError, type LifecycleState } from '@atlas/contracts';

export interface Lifecycle {
  readonly state: LifecycleState;
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface LifecycleHooks {
  onStart?: () => Promise<void> | void;
  onShutdown?: () => Promise<void> | void;
}

export function createLifecycle(hooks: LifecycleHooks = {}): Lifecycle {
  let state: LifecycleState = 'created';

  return {
    get state() {
      return state;
    },

    async start() {
      if (state !== 'created') {
        throw new LifecycleError(state, 'starting');
      }
      state = 'starting';
      try {
        await hooks.onStart?.();
        state = 'ready';
      } catch (cause) {
        state = 'failed';
        throw cause;
      }
    },

    async shutdown() {
      if (state === 'stopped') {
        return;
      }
      if (state !== 'ready' && state !== 'failed') {
        throw new LifecycleError(state, 'stopping');
      }
      state = 'stopping';
      await hooks.onShutdown?.();
      state = 'stopped';
    },
  };
}
