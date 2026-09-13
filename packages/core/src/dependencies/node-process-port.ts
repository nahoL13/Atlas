import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import type {
  OllamaStartOutcome,
  ProcessPort,
  SearchContainerStartOutcome,
  SearchContainerState,
} from './process-port.js';

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
    async isOllamaRunning(baseUrl: string): Promise<boolean> {
      try {
        const response = await doFetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
        });
        return response.ok === true;
      } catch {
        return false;
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
