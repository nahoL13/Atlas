import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { ActionRequest } from '@atlas/contracts';

/** Interno ao package: sem 2º consumidor real, não sobe a @atlas/contracts. */
export interface ConfirmPort {
  request(action: ActionRequest): Promise<boolean>;
}

/**
 * Port real sobre node:readline. input/output são injetáveis só para teste
 * (mesmo padrão de nodeFsReadPort); em produção usa stdin/stdout reais.
 * Nunca trava: input não-TTY ou que fecha (EOF) antes de responder resolve false.
 */
export function nodeReadlineConfirmPort(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): ConfirmPort {
  return {
    request(action: ActionRequest): Promise<boolean> {
      if (!(input as NodeJS.ReadStream).isTTY) {
        return Promise.resolve(false);
      }
      const rl = createInterface({ input, output });
      return new Promise<boolean>((resolvePrompt) => {
        let settled = false;
        const finish = (approved: boolean): void => {
          if (settled) return;
          settled = true;
          rl.close();
          resolvePrompt(approved);
        };
        const resourceLabel =
          action.resource.type === 'network' ? action.resource.host : action.resource.path;
        rl.question(
          `Confirmar ação irreversível (${action.access} em ${resourceLabel})? [s/N] `,
          (answer) => finish(/^s(im)?$/i.test(answer.trim())),
        );
        rl.on('close', () => finish(false));
      });
    },
  };
}
