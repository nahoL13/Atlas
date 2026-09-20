import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
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
      try {
        const response = await doFetch(`${baseUrl}/api/pull`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: model, stream: true }),
          signal,
        });
        if (response.ok !== true) {
          return { status: 'failed', model, reason: 'rejected' };
        }
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
        if (signal.aborted) {
          return { status: 'cancelled', model };
        }
        return { status: 'failed', model, reason: 'unreachable' };
      }
    },

    async startOllama(): Promise<OllamaStartOutcome> {
      try {
        const proc = doSpawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
        return await new Promise<OllamaStartOutcome>((resolve) => {
          proc.once('error', (error: NodeJS.ErrnoException) => {
            resolve({
              started: false,
              reason: error.code === 'ENOENT' ? 'binary-missing' : 'spawn-failed',
            });
          });
          proc.once('spawn', () => {
            proc.unref();
            child = proc;
            resolve({ started: true });
          });
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
        return await new Promise<SearchContainerState>((resolve) => {
          let stdout = '';
          proc.stdout?.on('data', (chunk: Buffer | string) => {
            stdout += chunk.toString();
          });
          proc.once('error', () => {
            resolve('unavailable');
          });
          proc.once('close', (code: number | null) => {
            if (code !== 0) {
              resolve('unknown');
              return;
            }
            const trimmed = stdout.trim();
            if (trimmed === 'true') {
              resolve('running');
            } else if (trimmed === 'false') {
              resolve('stopped');
            } else {
              resolve('unknown');
            }
          });
        });
      } catch {
        return 'unavailable';
      }
    },

    async startSearchContainer(containerName: string): Promise<SearchContainerStartOutcome> {
      try {
        const proc = doSpawn('docker', ['start', containerName], { stdio: 'ignore' });
        return await new Promise<SearchContainerStartOutcome>((resolve) => {
          proc.once('error', () => {
            resolve({ started: false, reason: 'docker-unavailable' });
          });
          proc.once('close', (code: number | null) => {
            if (code === 0) {
              resolve({ started: true });
            } else {
              resolve({ started: false, reason: 'start-failed' });
            }
          });
        });
      } catch {
        return { started: false, reason: 'docker-unavailable' };
      }
    },

    async stopSearchContainer(containerName: string): Promise<void> {
      try {
        const proc = doSpawn('docker', ['stop', containerName], { stdio: 'ignore' });
        await new Promise<void>((resolve) => {
          proc.once('error', () => resolve());
          proc.once('close', () => resolve());
        });
      } catch {
        // Nunca lança (item 3.2).
      }
    },
  };
}
