import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';
import type {
  ModelPullProgress,
  ModelPullRequest,
  OllamaInspection,
  OllamaStartOutcome,
  ProcessPort,
  SearchContainerStartOutcome,
  SearchContainerState,
} from './process-port.js';
import type { ModelPullOutcome } from './dependency-manager.js';

export interface NodeProcessPortDeps {
  fetch?: typeof fetch;
  /**
   * Costura de teste sancionada pela SPEC-0060/CA 14, aditiva (SPEC-0061,
   * item 3.2) — os caminhos do Ollama passam a usar a mesma injeção, sem
   * mudança de comportamento.
   */
  spawn?: typeof nodeSpawn;
}

/** Contrato de invocação pinado como dado da SPEC-0060, item 2.5. */
const HEALTH_CHECK_TIMEOUT_MS = 2000;
const STOP_GRACE_PERIOD_MS = 2000;

/**
 * Orçamentos de tempo (watchdog) pinados como dado da SPEC-0064, item 1 —
 * nunca configuráveis (D4). Cada um cobre exatamente a operação nomeada em
 * sua constante; `MODEL_PULL_STALL_TIMEOUT_MS` é orçamento de **inatividade**
 * do stream de download, nunca de duração total (D12).
 */
const SPAWN_HANDSHAKE_TIMEOUT_MS = 5_000;
const DOCKER_PROBE_TIMEOUT_MS = 5_000;
const DOCKER_COMMAND_TIMEOUT_MS = 30_000;
const MODEL_PULL_STALL_TIMEOUT_MS = 120_000;

/**
 * Helper privado de watchdog (SPEC-0064, item 2.1), reusado pelas quatro
 * operações baseadas em `ChildProcess`. Arma um `setTimeout` de `budgetMs`;
 * ao expirar, mata e desacopla o filho — e, quando há um stream de `stdout`
 * (só `inspectSearchContainer`), encerra-o — cada passo em seu próprio
 * `try/catch` best-effort (D7/D18/Restrição 9), e assenta com o valor de
 * `onTimeout()`. `attach` liga os eventos da operação (`'error'`/`'close'`/
 * `'spawn'`) a `settle(compute)`, que só executa `compute()` — e portanto só
 * produz efeito colateral (ex.: registrar posse) — se a operação ainda não
 * tiver assentado (assentamento único, CA 9). Cancela o timer em todo
 * caminho de saída, inclusive o feliz; no caminho feliz nenhum `kill()`/
 * `unref()`/`destroy()` novo roda (CA 29).
 */
function runProcessOperation<T>(params: {
  readonly proc: ChildProcess;
  readonly budgetMs: number;
  readonly attach: (settle: (compute: () => T) => void) => void;
  readonly onTimeout: () => T;
  readonly stdout?: Readable;
}): Promise<T> {
  const { proc, budgetMs, attach, onTimeout, stdout } = params;
  return new Promise<T>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        proc.kill();
      } catch {
        // best-effort (D7/D18) — nunca propaga.
      }
      try {
        proc.unref();
      } catch {
        // best-effort (D18) — nunca propaga.
      }
      if (stdout !== undefined) {
        try {
          stdout.removeAllListeners('data');
          stdout.destroy();
        } catch {
          // best-effort (D18) — nunca propaga.
        }
      }
      resolve(onTimeout());
    }, budgetMs);

    function settle(compute: () => T): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(compute());
    }

    attach(settle);
  });
}

/** `value` extraído só se finito e ≥ 0 (SPEC-0063, item 3.3) — nunca `NaN`/negativo/texto. */
function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Extrai `completed`/`total` de uma linha NDJSON já parseada e emite
 * `onProgress` só quando ao menos um dos dois é válido (SPEC-0063, item 3.3)
 * — nenhum outro campo da linha (D10) cruza esta função.
 */
function emitModelPullProgress(
  model: string,
  line: Record<string, unknown>,
  onProgress: (progress: ModelPullProgress) => void,
): void {
  const completedBytes = finiteNonNegative(line['completed']);
  const totalBytes = finiteNonNegative(line['total']);
  if (completedBytes === undefined && totalBytes === undefined) {
    return;
  }
  onProgress({
    model,
    ...(completedBytes !== undefined ? { completedBytes } : {}),
    ...(totalBytes !== undefined ? { totalBytes } : {}),
  });
}

/**
 * Adaptador real de `ProcessPort` (SPEC-0060/SPEC-0061, ADR-0027(c)) — argv
 * sempre em array, nunca com o modo shell ativado. Guarda só o *handle* do
 * filho que **esta instância** iniciou, para poder sinalizá-lo; nunca decide
 * se deve parar — quem decide é o `dependency-manager.ts` (D23), este
 * adaptador só executa.
 */
export function nodeProcessPort(deps: NodeProcessPortDeps = {}): ProcessPort {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const doSpawn = deps.spawn ?? nodeSpawn;
  let child: ChildProcess | undefined;

  return {
    async inspectOllama(baseUrl: string): Promise<OllamaInspection> {
      try {
        const response = await doFetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
        });
        if (response.ok !== true) {
          return { running: false };
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return { running: true, models: undefined };
        }
        const rawModels =
          typeof body === 'object' && body !== null
            ? (body as { models?: unknown }).models
            : undefined;
        if (!Array.isArray(rawModels)) {
          return { running: true, models: undefined };
        }
        const models = rawModels
          .map((item) =>
            typeof item === 'object' && item !== null
              ? (item as { name?: unknown }).name
              : undefined,
          )
          .filter((name): name is string => typeof name === 'string' && name.length > 0);
        return { running: true, models };
      } catch {
        return { running: false };
      }
    },

    async pullOllamaModel(request: ModelPullRequest): Promise<ModelPullOutcome> {
      const { baseUrl, model, signal, onProgress } = request;

      // Watchdog de ESTAGNAÇÃO (SPEC-0064, item 2.7/D12) — nunca de duração
      // total: um `AbortController` interno ao adaptador, cujo `signal` é o
      // que de fato vai ao `fetch`; o `signal` externo (`request.signal`) é
      // só encaminhado. Precedência absoluta do cancelamento humano (D19):
      // (i) checagem SÍNCRONA de `request.signal.aborted`, antes de
      // qualquer outra coisa — sem ela, um `signal` já abortado nunca
      // dispararia o evento `'abort'` (já ocorrido) e a requisição sairia
      // de fato.
      const internalController = new AbortController();
      if (signal.aborted) {
        internalController.abort();
      }
      // (ii) encaminha aborts FUTUROS do signal externo.
      const onExternalAbort = (): void => {
        internalController.abort();
      };
      signal.addEventListener('abort', onExternalAbort, { once: true });

      // (iii) arma o teto de estagnação — rearmado só em dois pontos (D10):
      // resposta `ok` e cada `reader.read()` com bytes.
      let timedOut = false;
      let responseReceived = false;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;
      const armStallTimer = (): void => {
        if (stallTimer !== undefined) {
          clearTimeout(stallTimer);
        }
        stallTimer = setTimeout(() => {
          timedOut = true;
          internalController.abort();
        }, MODEL_PULL_STALL_TIMEOUT_MS);
      };
      armStallTimer();

      try {
        // (iv) só agora a requisição, com o signal INTERNO.
        const response = await doFetch(`${baseUrl}/api/pull`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: model, stream: true }),
          signal: internalController.signal,
        });
        if (response.ok !== true) {
          return { status: 'failed', model, reason: 'rejected' };
        }
        responseReceived = true;
        armStallTimer();

        const body = response.body;
        if (body === null || body === undefined) {
          return { status: 'failed', model, reason: 'stream-failed' };
        }

        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let success = false;
        let sawError = false;

        readLoop: for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          armStallTimer();
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex >= 0) {
            const rawLine = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf('\n');

            const trimmed = rawLine.trim();
            if (trimmed === '') {
              continue;
            }
            let parsed: unknown;
            try {
              parsed = JSON.parse(trimmed);
            } catch {
              continue;
            }
            if (typeof parsed !== 'object' || parsed === null) {
              continue;
            }
            const line = parsed as Record<string, unknown>;
            if (line['error'] !== undefined) {
              sawError = true;
              break readLoop;
            }
            emitModelPullProgress(model, line, onProgress);
            if (line['status'] === 'success') {
              success = true;
            }
          }
        }

        if (sawError) {
          return { status: 'failed', model, reason: 'stream-failed' };
        }
        return success
          ? { status: 'installed', model }
          : { status: 'failed', model, reason: 'stream-failed' };
      } catch {
        // Classificação exaustiva e ordenada (item 2.7): o cancelamento
        // humano tem precedência absoluta sobre a estagnação.
        if (signal.aborted) {
          return { status: 'cancelled', model };
        }
        if (timedOut) {
          return {
            status: 'failed',
            model,
            reason: responseReceived ? 'stream-failed' : 'unreachable',
          };
        }
        return { status: 'failed', model, reason: 'unreachable' };
      } finally {
        if (stallTimer !== undefined) {
          clearTimeout(stallTimer);
        }
        signal.removeEventListener('abort', onExternalAbort);
      }
    },

    async startOllama(): Promise<OllamaStartOutcome> {
      try {
        const proc = doSpawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
        return await runProcessOperation<OllamaStartOutcome>({
          proc,
          budgetMs: SPAWN_HANDSHAKE_TIMEOUT_MS,
          onTimeout: () => ({ started: false, reason: 'spawn-failed' }),
          attach: (settle) => {
            proc.once('error', (error: NodeJS.ErrnoException) => {
              settle(() => ({
                started: false,
                reason: error.code === 'ENOENT' ? 'binary-missing' : 'spawn-failed',
              }));
            });
            proc.once('spawn', () => {
              // Só roda se ainda não estourou (assentamento único, CA 9) —
              // sem isso, um 'spawn' tardio atribuiria posse (`child`) a um
              // filho já tratado como falho pelo watchdog.
              settle(() => {
                proc.unref();
                child = proc;
                return { started: true };
              });
            });
          },
        });
      } catch {
        return { started: false, reason: 'spawn-failed' };
      }
    },

    async stopOllama(): Promise<void> {
      if (child === undefined) {
        return;
      }
      const target = child;
      child = undefined;
      try {
        let exited = false;
        target.once('exit', () => {
          exited = true;
        });
        target.kill('SIGTERM');
        await new Promise<void>((resolve) => setTimeout(resolve, STOP_GRACE_PERIOD_MS));
        if (!exited) {
          target.kill('SIGKILL');
        }
      } catch {
        // Nunca lança (item 2.5).
      }
    },

    async inspectSearchContainer(containerName: string): Promise<SearchContainerState> {
      try {
        const proc = doSpawn(
          'docker',
          ['inspect', '--type', 'container', '--format', '{{.State.Running}}', containerName],
          { stdio: ['ignore', 'pipe', 'ignore'] },
        );
        return await runProcessOperation<SearchContainerState>({
          proc,
          budgetMs: DOCKER_PROBE_TIMEOUT_MS,
          // Um estouro nunca é resposta do daemon — nunca 'unknown' (D8).
          onTimeout: () => 'unavailable',
          stdout: proc.stdout ?? undefined,
          attach: (settle) => {
            let stdout = '';
            proc.stdout?.on('data', (chunk: Buffer | string) => {
              stdout += chunk.toString();
            });
            proc.once('error', () => {
              settle(() => 'unavailable');
            });
            proc.once('close', (code: number | null) => {
              settle(() => {
                if (code !== 0) {
                  return 'unknown';
                }
                const trimmed = stdout.trim();
                if (trimmed === 'true') {
                  return 'running';
                } else if (trimmed === 'false') {
                  return 'stopped';
                } else {
                  return 'unknown';
                }
              });
            });
          },
        });
      } catch {
        return 'unavailable';
      }
    },

    async startSearchContainer(containerName: string): Promise<SearchContainerStartOutcome> {
      try {
        const proc = doSpawn('docker', ['start', containerName], { stdio: 'ignore' });
        return await runProcessOperation<SearchContainerStartOutcome>({
          proc,
          budgetMs: DOCKER_COMMAND_TIMEOUT_MS,
          // Mata só o CLIENTE `docker start`, nunca o container (D7/ADR-0027(h)).
          onTimeout: () => ({ started: false, reason: 'docker-unavailable' }),
          attach: (settle) => {
            proc.once('error', () => {
              settle(() => ({ started: false, reason: 'docker-unavailable' }));
            });
            proc.once('close', (code: number | null) => {
              settle(() =>
                code === 0 ? { started: true } : { started: false, reason: 'start-failed' },
              );
            });
          },
        });
      } catch {
        return { started: false, reason: 'docker-unavailable' };
      }
    },

    async stopSearchContainer(containerName: string): Promise<void> {
      try {
        const proc = doSpawn('docker', ['stop', containerName], { stdio: 'ignore' });
        await runProcessOperation<void>({
          proc,
          budgetMs: DOCKER_COMMAND_TIMEOUT_MS,
          // A operação já devolve void e ignora qualquer desfecho (item 2.5).
          onTimeout: () => undefined,
          attach: (settle) => {
            proc.once('error', () => settle(() => undefined));
            proc.once('close', () => settle(() => undefined));
          },
        });
      } catch {
        // Nunca lança (item 3.2).
      }
    },
  };
}
