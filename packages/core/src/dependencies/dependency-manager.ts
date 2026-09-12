import type { DependencyConfig } from '../config/dependency-config.js';
import { nodeProcessPort } from './node-process-port.js';
import type { OllamaStartOutcome, ProcessPort } from './process-port.js';

export type OllamaFailureReason = 'binary-missing' | 'spawn-failed' | 'timeout';

export type DependencyOutcome =
  | { readonly dependency: 'ollama'; readonly status: 'disabled' }
  | { readonly dependency: 'ollama'; readonly status: 'already-running' }
  | { readonly dependency: 'ollama'; readonly status: 'started' }
  | {
      readonly dependency: 'ollama';
      readonly status: 'failed';
      readonly reason: OllamaFailureReason;
    };

export interface DependencyReport {
  readonly outcomes: readonly DependencyOutcome[];
}

export interface DependencyManager {
  ensure(config: DependencyConfig): Promise<DependencyReport>;
  release(): Promise<void>;
}

const POLL_ATTEMPTS = 40;
const POLL_INTERVAL_MS = 250;

function failed(reason: OllamaFailureReason): DependencyReport {
  return { outcomes: [{ dependency: 'ollama', status: 'failed', reason }] };
}

/**
 * Unidade nova e independente do `Lifecycle` de `createAtlas` (ADR-0027(d)):
 * `ensure(config)`/`release()`, sobre a porta `ProcessPort` — o adaptador faz
 * IO, este manager decide (Restrição da SPEC-0060, Artigo 5).
 */
export function createDependencyManager(
  deps: {
    process?: ProcessPort;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): DependencyManager {
  const process = deps.process ?? nodeProcessPort();
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  // Fonte única da verdade sobre posse (D23): um único campo privado deste
  // manager. `startOllama()` devolvendo `started: true` registra posse
  // IMEDIATAMENTE — antes de qualquer espera —, independente do desfecho do
  // polling seguinte.
  let owns = false;
  let pending: Promise<DependencyReport> | undefined;

  async function pollUntilReady(config: DependencyConfig): Promise<DependencyReport> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      await sleep(POLL_INTERVAL_MS);
      const ready = await process.isOllamaRunning(config.ollamaBaseUrl);
      if (ready) {
        return { outcomes: [{ dependency: 'ollama', status: 'started' }] };
      }
    }
    return failed('timeout');
  }

  async function runEnsure(config: DependencyConfig): Promise<DependencyReport> {
    if (!config.autoStartOllama) {
      return { outcomes: [{ dependency: 'ollama', status: 'disabled' }] };
    }

    let running: boolean;
    try {
      running = await process.isOllamaRunning(config.ollamaBaseUrl);
    } catch {
      return failed('spawn-failed');
    }
    if (running) {
      return { outcomes: [{ dependency: 'ollama', status: 'already-running' }] };
    }

    let outcome: OllamaStartOutcome;
    try {
      outcome = await process.startOllama();
    } catch {
      return failed('spawn-failed');
    }
    if (!outcome.started) {
      return failed(outcome.reason);
    }

    // Registro de posse imediato, no mesmo await, antes de qualquer espera
    // (D23) — o desfecho do polling não influencia a posse.
    owns = true;

    try {
      return await pollUntilReady(config);
    } catch {
      // Rejeição vinda da porta DEPOIS de um startOllama() bem-sucedido: a
      // posse é preservada (D23) — o processo pode estar vivo.
      return failed('spawn-failed');
    }
  }

  return {
    ensure(config: DependencyConfig): Promise<DependencyReport> {
      pending ??= runEnsure(config);
      return pending;
    },

    async release(): Promise<void> {
      pending = undefined;
      if (!owns) {
        return;
      }
      owns = false;
      try {
        await process.stopOllama();
      } catch {
        // `release()` nunca lança (item 2.6).
      }
    },
  };
}
