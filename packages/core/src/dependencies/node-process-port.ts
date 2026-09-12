import { spawn, type ChildProcess } from 'node:child_process';
import type { OllamaStartOutcome, ProcessPort } from './process-port.js';

export interface NodeProcessPortDeps {
  fetch?: typeof fetch;
}

/** Contrato de invocação pinado como dado da SPEC-0060, item 2.5. */
const HEALTH_CHECK_TIMEOUT_MS = 2000;
const STOP_GRACE_PERIOD_MS = 2000;

/**
 * Adaptador real de `ProcessPort` (SPEC-0060, ADR-0027(c)) — argv sempre em
 * array, nunca com o modo shell ativado. Guarda só o *handle* do filho que **esta
 * instância** iniciou, para poder sinalizá-lo; nunca decide se deve parar —
 * quem decide é o `dependency-manager.ts` (D23), este adaptador só executa.
 */
export function nodeProcessPort(deps: NodeProcessPortDeps = {}): ProcessPort {
  const doFetch = deps.fetch ?? globalThis.fetch;
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
        const proc = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
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
  };
}
