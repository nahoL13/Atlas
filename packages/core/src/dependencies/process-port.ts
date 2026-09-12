/**
 * Porta injetável de auto-gerência de processos externos (SPEC-0060,
 * ADR-0027(c)) — **três operações nomeadas e fixas** sobre a dependência
 * `ollama`, nunca execução de comando arbitrário (ADR-0027(b)). Molde exato
 * de `HttpPort`/`GitReadPort` (`@atlas/tools`).
 */

export type OllamaStartOutcome =
  | { readonly started: true }
  | { readonly started: false; readonly reason: 'binary-missing' | 'spawn-failed' };

export interface ProcessPort {
  /** `GET <baseUrl>/api/tags`; `true` sse `response.ok`. Nunca lança. */
  isOllamaRunning(baseUrl: string): Promise<boolean>;
  /** Sobe `ollama serve` desacoplado do processo chamador. Nunca lança. */
  startOllama(): Promise<OllamaStartOutcome>;
  /** Derruba o processo que **esta instância do adaptador** iniciou. Nunca lança. */
  stopOllama(): Promise<void>;
}
