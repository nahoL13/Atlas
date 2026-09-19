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
  /** SPEC-0062: liga sob demanda UM container de busca já nomeado, fora do `ensure` de bootstrap. */
  ensureSearchContainer(container: string): Promise<DependencyOutcome>;
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
  //
  // SPEC-0062/D11: a posse do container vira um `Set` — a sessão pode ligar
  // mais de um nome (bootstrap + gesto de GUI), e trocar de nome nunca
  // derruba o anterior.
  let ownsOllama = false;
  const ownedContainers = new Set<string>();
  let pending: Promise<DependencyReport> | undefined;

  // SPEC-0062/D10/D22: memoização por NOME de container, compartilhada entre
  // o caminho do `ensure` de bootstrap e o gesto de GUI (`ensureSearchContainer`
  // público) — duas chamadas concorrentes para o mesmo nome dividem a mesma
  // tentativa (nenhum `docker start` duplicado). Um desfecho `'started'`/
  // `'already-running'` permanece memoizado; um desfecho `'failed'` é
  // esquecido, para que uma tentativa seguinte com o mesmo nome tente de novo.
  const containerAttempts = new Map<string, Promise<DependencyOutcome>>();

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

  /**
   * SPEC-0062, item 1.2 — renomeação pura do helper privado que já existia
   * (era `ensureSearchContainer(config: DependencyConfig)`): recebe agora o
   * NOME já resolvido (não a `DependencyConfig`), sem `''`/`disabled` — quem
   * chama já filtrou esse caso. Nenhuma linha de comportamento muda: a
   * sequência `inspectSearchContainer` → `startSearchContainer` → polling
   * segue idêntica, e ocorre uma **única** vez no arquivo (CA 6).
   */
  async function startSearchContainerByName(container: string): Promise<DependencyOutcome> {
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
    // posse é qualidade da autoria do start, não da prontidão. SPEC-0062/D11:
    // a posse é um conjunto — trocar de nome nunca derruba o anterior.
    ownedContainers.add(container);

    try {
      return await pollContainerUntilReady(container);
    } catch {
      // Rejeição depois de um startSearchContainer bem-sucedido: a posse é
      // preservada.
      return searchContainerFailed('start-failed', container);
    }
  }

  /**
   * SPEC-0062/D10/D22 — ponto único de memoização por nome, consumido tanto
   * pelo caminho do `ensure` de bootstrap quanto pelo gesto público
   * `ensureSearchContainer`. Dedup em voo sempre (2ª chamada concorrente
   * devolve a MESMA promessa); sucesso (`'started'`/`'already-running'`)
   * fica retido; falha é esquecida (uma chamada seguinte tenta de novo).
   */
  function ensureContainerByName(container: string): Promise<DependencyOutcome> {
    const existing = containerAttempts.get(container);
    if (existing !== undefined) {
      return existing;
    }
    const attempt = startSearchContainerByName(container);
    containerAttempts.set(container, attempt);
    void attempt.then((outcome) => {
      if (outcome.status === 'failed') {
        containerAttempts.delete(container);
      }
    });
    return attempt;
  }

  function resolveSearchContainerForConfig(config: DependencyConfig): Promise<DependencyOutcome> {
    const container = config.autoStartSearchContainer;
    if (container === '') {
      return Promise.resolve({ dependency: 'search-container', status: 'disabled' });
    }
    return ensureContainerByName(container);
  }

  async function runEnsure(config: DependencyConfig): Promise<DependencyReport> {
    // Sequencial e independente (D4): o desfecho do Ollama nunca influencia
    // o caminho do container, e vice-versa; ordem pinada no relatório.
    const ollamaOutcome = await ensureOllama(config);
    const searchContainerOutcome = await resolveSearchContainerForConfig(config);
    return { outcomes: [ollamaOutcome, searchContainerOutcome] };
  }

  return {
    ensure(config: DependencyConfig): Promise<DependencyReport> {
      pending ??= runEnsure(config);
      return pending;
    },

    /**
     * SPEC-0062, item 1.3 — gesto sob demanda para a GUI: `''` ⇒ `'disabled'`
     * sem tocar a porta (mesma regra do `ensure`); caso contrário delega ao
     * mesmo caminho memoizado do bootstrap (D9 — nunca reexecuta `ensure`,
     * nunca toca o caminho do Ollama). O valor é assumido já normalizado
     * (D12): sem `trim`, sem validação de formato aqui.
     */
    ensureSearchContainer(container: string): Promise<DependencyOutcome> {
      if (container === '') {
        return Promise.resolve({ dependency: 'search-container', status: 'disabled' });
      }
      return ensureContainerByName(container);
    },

    /**
     * SPEC-0062/D21 — drena o trabalho em voo (`pending` do `ensure` +
     * tentativas de container ainda não assentadas) com `Promise.allSettled`
     * (nunca `Promise.all`, para preservar "`release()` nunca lança") ANTES
     * de ler a posse e emitir os `stop*`. Sem isso, um `ensureSearchContainer`
     * disparado pela GUI e ainda em polling no instante do `release()`
     * registraria posse num conjunto já limpo, deixando o container órfão.
     */
    async release(): Promise<void> {
      const inFlight: Array<Promise<unknown>> = [];
      if (pending !== undefined) {
        inFlight.push(pending);
      }
      inFlight.push(...containerAttempts.values());
      await Promise.allSettled(inFlight);

      pending = undefined;
      containerAttempts.clear();

      if (ownsOllama) {
        ownsOllama = false;
        try {
          await process.stopOllama();
        } catch {
          // `release()` nunca lança.
        }
      }

      // SPEC-0062/D11: um `stopSearchContainer` por nome possuído, na ordem
      // de inserção do `Set`, cada um com captura própria.
      for (const container of ownedContainers) {
        try {
          await process.stopSearchContainer(container);
        } catch {
          // `release()` nunca lança.
        }
      }
      ownedContainers.clear();
    },
  };
}
