/**
 * Porta injetável de auto-gerência de processos externos (SPEC-0060/
 * SPEC-0061, ADR-0027(c)) — **operações nomeadas e fixas** sobre as
 * dependências `ollama`/`search-container`, nunca execução de comando
 * arbitrário (ADR-0027(b)). Molde exato de `HttpPort`/`GitReadPort`
 * (`@atlas/tools`).
 */

import type { ModelPullOutcome } from './dependency-manager.js';

/**
 * Resultado de `GET <baseUrl>/api/tags` (SPEC-0063, ADR-0029(d)) — substitui
 * `isOllamaRunning` (D3): a MESMA requisição do health-check, sem descartar
 * o corpo. `models: undefined` sob `running: true` significa "de pé,
 * presença de modelo desconhecida" (corpo ilegível/inesperado — D4), nunca
 * "zero modelos".
 */
export type OllamaInspection =
  | { readonly running: false }
  | {
      readonly running: true;
      /** Nomes de `models[].name`; `undefined` = corpo ilegível/inesperado (D4). */
      readonly models: readonly string[] | undefined;
    };

/** Progresso de um download em andamento (SPEC-0063, item 3.1) — nenhum texto do provedor (D10). */
export interface ModelPullProgress {
  readonly model: string;
  /** Só números finitos e ≥ 0; ausentes enquanto o provedor não os informa. */
  readonly completedBytes?: number;
  readonly totalBytes?: number;
}

/** Requisição de download (SPEC-0063, D7) — objeto, não posicional; `signal`/`onProgress` obrigatórios. */
export interface ModelPullRequest {
  readonly baseUrl: string;
  readonly model: string;
  readonly signal: AbortSignal;
  readonly onProgress: (progress: ModelPullProgress) => void;
}

export type OllamaStartOutcome =
  | { readonly started: true }
  | { readonly started: false; readonly reason: 'binary-missing' | 'spawn-failed' };

/**
 * Estado do container de busca (SPEC-0061, Decisão D9), derivado só de
 * código de saída e stdout do `docker inspect --type container` — nunca de
 * parse de stderr.
 */
export type SearchContainerState =
  | 'running' // `docker inspect` saiu 0 e o container está em execução
  | 'stopped' // `docker inspect` saiu 0 e o container existe, parado
  | 'unavailable' // o binário `docker` não pôde ser executado (ENOENT/falha de spawn)
  | 'unknown'; // `docker` executou e saiu != 0 — container inexistente OU daemon inacessível

export type SearchContainerStartOutcome =
  | { readonly started: true }
  | {
      readonly started: false;
      readonly reason: 'docker-unavailable' | 'container-unknown' | 'start-failed';
    };

export interface ProcessPort {
  // Ollama (SPEC-0060, substituída pela SPEC-0063/D3):
  /** `GET <baseUrl>/api/tags`; `running` sse `response.ok`. Nunca lança. */
  inspectOllama(baseUrl: string): Promise<OllamaInspection>;
  /** Sobe `ollama serve` desacoplado do processo chamador. Nunca lança. */
  startOllama(): Promise<OllamaStartOutcome>;
  /** Derruba o processo que **esta instância do adaptador** iniciou. Nunca lança. */
  stopOllama(): Promise<void>;
  /**
   * `POST <baseUrl>/api/pull`, corpo `{ name, stream: true }` (SPEC-0063,
   * ADR-0029(b)) — nenhuma outra porta de execução genérica. Nunca lança.
   */
  pullOllamaModel(request: ModelPullRequest): Promise<ModelPullOutcome>;
  // Container de busca Docker (SPEC-0061), aditivas — nunca lançam;
  // `'timeout'` não é desfecho da porta, é decisão temporal do manager.
  /** `docker inspect --type container --format '{{.State.Running}}' <nome>`. Nunca lança. */
  inspectSearchContainer(containerName: string): Promise<SearchContainerState>;
  /** `docker start <nome>` — nunca `run`/`create`/`pull` (ADR-0027(h)). Nunca lança. */
  startSearchContainer(containerName: string): Promise<SearchContainerStartOutcome>;
  /** `docker stop <nome>` — ignora qualquer desfecho. Nunca lança. */
  stopSearchContainer(containerName: string): Promise<void>;
}
