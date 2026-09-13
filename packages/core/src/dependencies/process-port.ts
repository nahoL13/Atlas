/**
 * Porta injetável de auto-gerência de processos externos (SPEC-0060/
 * SPEC-0061, ADR-0027(c)) — **operações nomeadas e fixas** sobre as
 * dependências `ollama`/`search-container`, nunca execução de comando
 * arbitrário (ADR-0027(b)). Molde exato de `HttpPort`/`GitReadPort`
 * (`@atlas/tools`).
 */

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
  // Ollama (SPEC-0060), inalteradas:
  /** `GET <baseUrl>/api/tags`; `true` sse `response.ok`. Nunca lança. */
  isOllamaRunning(baseUrl: string): Promise<boolean>;
  /** Sobe `ollama serve` desacoplado do processo chamador. Nunca lança. */
  startOllama(): Promise<OllamaStartOutcome>;
  /** Derruba o processo que **esta instância do adaptador** iniciou. Nunca lança. */
  stopOllama(): Promise<void>;
  // Container de busca Docker (SPEC-0061), aditivas — nunca lançam;
  // `'timeout'` não é desfecho da porta, é decisão temporal do manager.
  /** `docker inspect --type container --format '{{.State.Running}}' <nome>`. Nunca lança. */
  inspectSearchContainer(containerName: string): Promise<SearchContainerState>;
  /** `docker start <nome>` — nunca `run`/`create`/`pull` (ADR-0027(h)). Nunca lança. */
  startSearchContainer(containerName: string): Promise<SearchContainerStartOutcome>;
  /** `docker stop <nome>` — ignora qualquer desfecho. Nunca lança. */
  stopSearchContainer(containerName: string): Promise<void>;
}
