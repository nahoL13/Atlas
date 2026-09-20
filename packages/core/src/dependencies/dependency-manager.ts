import type { DependencyConfig } from '../config/dependency-config.js';
import { nodeProcessPort } from './node-process-port.js';
import type {
  ModelPullProgress,
  OllamaInspection,
  OllamaStartOutcome,
  ProcessPort,
  SearchContainerStartOutcome,
} from './process-port.js';

export type OllamaFailureReason = 'binary-missing' | 'spawn-failed' | 'timeout';

export type SearchContainerFailureReason =
  'docker-unavailable' | 'container-unknown' | 'start-failed' | 'timeout';

export type DependencyOutcome =
  | { readonly dependency: 'ollama'; readonly status: 'disabled' }
  | {
      readonly dependency: 'ollama';
      readonly status: 'already-running';
      /**
       * Modelos observados no MESMO `GET /api/tags` do health-check
       * (SPEC-0063, ADR-0029(d)) — nenhuma requisição nova. Ausente = corpo
       * ilegível ("de pé, presença de modelo desconhecida", D4).
       */
      readonly models?: readonly string[];
    }
  | {
      readonly dependency: 'ollama';
      readonly status: 'started';
      /** Modelos da inspeção que ENCERROU o polling com sucesso. */
      readonly models?: readonly string[];
    }
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

/**
 * Desfechos de download de modelo (SPEC-0063, item 3.2) — `'invalid-model'`/
 * `'busy'` são decisões do MANAGER, tomadas antes de tocar a porta; a porta
 * (item 3.1) só devolve `'unreachable'`/`'rejected'`/`'stream-failed'`.
 */
export type ModelPullFailureReason =
  | 'unreachable' // a requisição não completou (Ollama fora do ar, recusa de conexão)
  | 'rejected' // resposta HTTP não-ok (modelo inexistente no provedor, erro do daemon)
  | 'stream-failed' // stream interrompido, linha de erro, ou fim sem linha de sucesso
  | 'invalid-model' // formato de nome recusado pelo manager — a porta NÃO é tocada
  | 'busy'; // já existe um download em voo neste manager — nenhum 2º disparo

export type ModelPullOutcome =
  | { readonly status: 'installed'; readonly model: string }
  | { readonly status: 'cancelled'; readonly model: string }
  | {
      readonly status: 'failed';
      readonly model: string;
      readonly reason: ModelPullFailureReason;
    };

export interface DependencyManager {
  ensure(config: DependencyConfig): Promise<DependencyReport>;
  release(): Promise<void>;
  /** SPEC-0062: liga sob demanda UM container de busca já nomeado, fora do `ensure` de bootstrap. */
  ensureSearchContainer(container: string): Promise<DependencyOutcome>;
  /** SPEC-0063: baixa UM modelo já nomeado pelo gesto humano. Nunca lança. */
  pullOllamaModel(request: {
    readonly baseUrl: string;
    readonly model: string;
    readonly onProgress?: (progress: ModelPullProgress) => void;
  }): Promise<ModelPullOutcome>;
  /** SPEC-0063: aborta o download em voo, se houver. Síncrona, idempotente. */
  cancelOllamaModelPull(): boolean;
}

const OLLAMA_POLL_ATTEMPTS = 40;
const OLLAMA_POLL_INTERVAL_MS = 250;
const CONTAINER_POLL_ATTEMPTS = 20;
const CONTAINER_POLL_INTERVAL_MS = 250;

/**
 * Regra pinada de formato de nome de modelo (SPEC-0063, D11/D29) — sintaxe,
 * não pertencimento ao catálogo (isso é responsabilidade de `apps/desktop`,
 * ADR-0029(e)): admite sequências como `a/../../x` (D29), pois o nome
 * aprovado só chega ao campo `name` de um corpo JSON (CA 54), nunca a um
 * caminho, argv ou segmento de URL.
 */
const MODEL_NAME_PATTERN = /^[a-z0-9][a-z0-9._/-]*(:[a-zA-Z0-9._-]+)?$/;
const MODEL_NAME_MAX_LENGTH = 128;

function isValidModelName(name: string): boolean {
  return name.length <= MODEL_NAME_MAX_LENGTH && MODEL_NAME_PATTERN.test(name);
}

function ollamaFailed(reason: OllamaFailureReason): DependencyOutcome {
  return { dependency: 'ollama', status: 'failed', reason };
}

function searchContainerFailed(
  reason: SearchContainerFailureReason,
  container: string,
): DependencyOutcome {
  return { dependency: 'search-container', status: 'failed', reason, container };
}

/** SPEC-0063, item 2.2 — presente sse a inspeção trouxe `models !== undefined`. */
function ollamaAlreadyRunning(models: readonly string[] | undefined): DependencyOutcome {
  return models !== undefined
    ? { dependency: 'ollama', status: 'already-running', models }
    : { dependency: 'ollama', status: 'already-running' };
}

/** SPEC-0063, item 2.2 — `models` vem da inspeção que ENCERROU o polling. */
function ollamaStarted(models: readonly string[] | undefined): DependencyOutcome {
  return models !== undefined
    ? { dependency: 'ollama', status: 'started', models }
    : { dependency: 'ollama', status: 'started' };
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

  // SPEC-0063, D8/D9: posse do `AbortController` do download corrente vive
  // AQUI (o manager decide, a porta só honra o `signal`) — nunca memoizado
  // (D9, item 3.6): um novo download do mesmo nome sempre dispara uma nova
  // requisição.
  let currentPull:
    | { readonly controller: AbortController; readonly promise: Promise<void>; cancelled: boolean }
    | undefined;

  async function pollOllamaUntilReady(config: DependencyConfig): Promise<DependencyOutcome> {
    for (let attempt = 0; attempt < OLLAMA_POLL_ATTEMPTS; attempt += 1) {
      await sleep(OLLAMA_POLL_INTERVAL_MS);
      const inspection = await process.inspectOllama(config.ollamaBaseUrl);
      if (inspection.running) {
        return ollamaStarted(inspection.models);
      }
    }
    return ollamaFailed('timeout');
  }

  async function ensureOllama(config: DependencyConfig): Promise<DependencyOutcome> {
    if (!config.autoStartOllama) {
      return { dependency: 'ollama', status: 'disabled' };
    }

    let inspection: OllamaInspection;
    try {
      inspection = await process.inspectOllama(config.ollamaBaseUrl);
    } catch {
      return ollamaFailed('spawn-failed');
    }
    if (inspection.running) {
      return ollamaAlreadyRunning(inspection.models);
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
     * SPEC-0063, item 3.6 — guarda de FORMATO (sintaxe, D11/D29) e guarda de
     * CONCORRÊNCIA (um download por vez, D9), ambas ANTES de tocar a porta;
     * nunca memoizado (item 3.6, último parágrafo); nunca lança; nunca toca
     * os caminhos de Ollama-serve/container.
     */
    async pullOllamaModel(request: {
      readonly baseUrl: string;
      readonly model: string;
      readonly onProgress?: (progress: ModelPullProgress) => void;
    }): Promise<ModelPullOutcome> {
      const { baseUrl, model, onProgress } = request;

      if (!isValidModelName(model)) {
        return { status: 'failed', model, reason: 'invalid-model' };
      }
      if (currentPull !== undefined) {
        return { status: 'failed', model, reason: 'busy' };
      }

      const controller = new AbortController();
      const outcomePromise = process.pullOllamaModel({
        baseUrl,
        model,
        signal: controller.signal,
        onProgress: onProgress ?? (() => {}),
      });
      // Registrada ANTES do `await` (posse imediata, molde de D23) — nunca
      // memoizado: o registro é limpo no `finally`, então uma 2ª chamada com
      // o MESMO nome, depois de assentado, dispara uma nova requisição.
      currentPull = {
        controller,
        cancelled: false,
        promise: outcomePromise.then(
          () => undefined,
          () => undefined,
        ),
      };

      try {
        return await outcomePromise;
      } finally {
        currentPull = undefined;
      }
    },

    /**
     * SPEC-0063, item 3.7 — síncrona (molde de `cancelInFlightOperation`,
     * SPEC-0051): `true` sse havia download em voo (idempotente — uma 2ª
     * chamada seguida devolve `false`).
     */
    cancelOllamaModelPull(): boolean {
      // Idempotência própria (`cancelled`, não apenas `currentPull`): o
      // registro só é limpo no `finally` de `pullOllamaModel`, que roda como
      // microtask DEPOIS do `abort()` síncrono — sem esta flag, uma 2ª
      // chamada síncrona logo em seguida ainda veria `currentPull` definido.
      if (currentPull === undefined || currentPull.cancelled) {
        return false;
      }
      currentPull.cancelled = true;
      currentPull.controller.abort();
      return true;
    },

    /**
     * SPEC-0062/D21 — drena o trabalho em voo (`pending` do `ensure` +
     * tentativas de container ainda não assentadas) com `Promise.allSettled`
     * (nunca `Promise.all`, para preservar "`release()` nunca lança") ANTES
     * de ler a posse e emitir os `stop*`. Sem isso, um `ensureSearchContainer`
     * disparado pela GUI e ainda em polling no instante do `release()`
     * registraria posse num conjunto já limpo, deixando o container órfão.
     *
     * SPEC-0063, D19 — aborta o download de modelo em voo ANTES de drenar: um
     * download de vários GB não pode segurar o `before-quit`; a drenagem em
     * si (`Promise.allSettled`) passa a incluir também essa promessa.
     */
    async release(): Promise<void> {
      const activePull = currentPull;
      activePull?.controller.abort();

      const inFlight: Array<Promise<unknown>> = [];
      if (pending !== undefined) {
        inFlight.push(pending);
      }
      inFlight.push(...containerAttempts.values());
      if (activePull !== undefined) {
        inFlight.push(activePull.promise);
      }
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
