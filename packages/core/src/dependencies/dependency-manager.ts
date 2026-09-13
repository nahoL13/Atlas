import type { DependencyConfig } from '../config/dependency-config.js';
import { nodeProcessPort } from './node-process-port.js';
import type {
  OllamaStartOutcome,
  ProcessPort,
  SearchContainerStartOutcome,
} from './process-port.js';

export type OllamaFailureReason = 'binary-missing' | 'spawn-failed' | 'timeout';

export type SearchContainerFailureReason =
  'docker-unavailable' | 'container-unknown' | 'start-failed' | 'timeout';

export type DependencyOutcome =
  | { readonly dependency: 'ollama'; readonly status: 'disabled' }
  | { readonly dependency: 'ollama'; readonly status: 'already-running' }
  | { readonly dependency: 'ollama'; readonly status: 'started' }
  | {
      readonly dependency: 'ollama';
      readonly status: 'failed';
      readonly reason: OllamaFailureReason;
    }
  | { readonly dependency: 'search-container'; readonly status: 'disabled' }
  | {
      readonly dependency: 'search-container';
      readonly status: 'already-running';
      readonly container: string;
    }
  | {
      readonly dependency: 'search-container';
      readonly status: 'started';
      readonly container: string;
    }
  | {
      readonly dependency: 'search-container';
      readonly status: 'failed';
      readonly reason: SearchContainerFailureReason;
      readonly container: string;
    };

export interface DependencyReport {
  readonly outcomes: readonly DependencyOutcome[];
}

export interface DependencyManager {
  ensure(config: DependencyConfig): Promise<DependencyReport>;
  release(): Promise<void>;
}

const OLLAMA_POLL_ATTEMPTS = 40;
const OLLAMA_POLL_INTERVAL_MS = 250;
const CONTAINER_POLL_ATTEMPTS = 20;
const CONTAINER_POLL_INTERVAL_MS = 250;

function ollamaFailed(reason: OllamaFailureReason): DependencyOutcome {
  return { dependency: 'ollama', status: 'failed', reason };
}

function searchContainerFailed(
  reason: SearchContainerFailureReason,
  container: string,
): DependencyOutcome {
  return { dependency: 'search-container', status: 'failed', reason, container };
}

/**
 * Unidade nova e independente do `Lifecycle` de `createAtlas` (ADR-0027(d)):
 * `ensure(config)`/`release()`, sobre a porta `ProcessPort` — o adaptador faz
 * IO, este manager decide (Restrição da SPEC-0060, Artigo 5). Estendida pela
 * SPEC-0061 para cuidar, no mesmo `ensure`/`release`, também do container
 * Docker do provedor de busca — as duas dependências são tratadas
 * sequencialmente e de forma independente (D4): nenhum desfecho de uma
 * altera o caminho da outra.
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

  // Fonte única da verdade sobre posse (D23/D61): dois campos privados
  // deste manager, um por dependência. `startOllama()`/`startSearchContainer()`
  // devolvendo sucesso registra posse IMEDIATAMENTE — antes de qualquer
  // espera —, independente do desfecho do polling seguinte.
  let ownsOllama = false;
  let ownedContainer: string | undefined;
  let pending: Promise<DependencyReport> | undefined;

  async function pollOllamaUntilReady(config: DependencyConfig): Promise<DependencyOutcome> {
    for (let attempt = 0; attempt < OLLAMA_POLL_ATTEMPTS; attempt += 1) {
      await sleep(OLLAMA_POLL_INTERVAL_MS);
      const ready = await process.isOllamaRunning(config.ollamaBaseUrl);
      if (ready) {
        return { dependency: 'ollama', status: 'started' };
      }
    }
    return ollamaFailed('timeout');
  }

  async function ensureOllama(config: DependencyConfig): Promise<DependencyOutcome> {
    if (!config.autoStartOllama) {
      return { dependency: 'ollama', status: 'disabled' };
    }

    let running: boolean;
    try {
      running = await process.isOllamaRunning(config.ollamaBaseUrl);
    } catch {
      return ollamaFailed('spawn-failed');
    }
    if (running) {
      return { dependency: 'ollama', status: 'already-running' };
    }

    let outcome: OllamaStartOutcome;
    try {
      outcome = await process.startOllama();
    } catch {
      return ollamaFailed('spawn-failed');
    }
    if (!outcome.started) {
      return ollamaFailed(outcome.reason);
    }

    // Registro de posse imediato, no mesmo await, antes de qualquer espera
    // (D23) — o desfecho do polling não influencia a posse.
    ownsOllama = true;

    try {
      return await pollOllamaUntilReady(config);
    } catch {
      // Rejeição vinda da porta DEPOIS de um startOllama() bem-sucedido: a
      // posse é preservada (D23) — o processo pode estar vivo.
      return ollamaFailed('spawn-failed');
    }
  }

  async function pollContainerUntilReady(container: string): Promise<DependencyOutcome> {
    for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt += 1) {
      await sleep(CONTAINER_POLL_INTERVAL_MS);
      const state = await process.inspectSearchContainer(container);
      if (state === 'running') {
        return { dependency: 'search-container', status: 'started', container };
      }
    }
    return searchContainerFailed('timeout', container);
  }

  async function ensureSearchContainer(config: DependencyConfig): Promise<DependencyOutcome> {
    const container = config.autoStartSearchContainer;
    if (container === '') {
      return { dependency: 'search-container', status: 'disabled' };
    }

    let state;
    try {
      state = await process.inspectSearchContainer(container);
    } catch {
      return searchContainerFailed('start-failed', container);
    }

    if (state === 'running') {
      return { dependency: 'search-container', status: 'already-running', container };
    }
    if (state === 'unavailable') {
      // O Atlas nunca cria containers (ADR-0027(h)) — 'unknown'/'unavailable'
      // nunca chamam startSearchContainer.
      return searchContainerFailed('docker-unavailable', container);
    }
    if (state === 'unknown') {
      return searchContainerFailed('container-unknown', container);
    }

    // state === 'stopped'
    let outcome: SearchContainerStartOutcome;
    try {
      outcome = await process.startSearchContainer(container);
    } catch {
      return searchContainerFailed('start-failed', container);
    }
    if (!outcome.started) {
      return searchContainerFailed(outcome.reason, container);
    }

    // Registro de posse imediato (molde exato de D23/ownsOllama acima):
    // posse é qualidade da autoria do start, não da prontidão.
    ownedContainer = container;

    try {
      return await pollContainerUntilReady(container);
    } catch {
      // Rejeição depois de um startSearchContainer bem-sucedido: a posse é
      // preservada.
      return searchContainerFailed('start-failed', container);
    }
  }

  async function runEnsure(config: DependencyConfig): Promise<DependencyReport> {
    // Sequencial e independente (D4): o desfecho do Ollama nunca influencia
    // o caminho do container, e vice-versa; ordem pinada no relatório.
    const ollamaOutcome = await ensureOllama(config);
    const searchContainerOutcome = await ensureSearchContainer(config);
    return { outcomes: [ollamaOutcome, searchContainerOutcome] };
  }

  return {
    ensure(config: DependencyConfig): Promise<DependencyReport> {
      pending ??= runEnsure(config);
      return pending;
    },

    async release(): Promise<void> {
      pending = undefined;

      if (ownsOllama) {
        ownsOllama = false;
        try {
          await process.stopOllama();
        } catch {
          // `release()` nunca lança.
        }
      }

      if (ownedContainer !== undefined) {
        const container = ownedContainer;
        ownedContainer = undefined;
        try {
          await process.stopSearchContainer(container);
        } catch {
          // `release()` nunca lança.
        }
      }
    },
  };
}
