import type { ActionRequest } from '@atlas/contracts';
import type { LineReader } from './line-reader.js';

/**
 * Adaptador local (não sobe a @atlas/contracts, sem 2º consumidor real):
 * satisfaz estruturalmente o `ConfirmPort` interno de @atlas/runtime
 * (`request(action): Promise<boolean>`), apoiado no mesmo `LineReader` já
 * usado pelo loop do `chat` — evita um segundo `readline` disputando stdin.
 * EOF/fila encerrada (linha `null`) resolve `false`, nunca trava.
 */
export function createLineReaderConfirmPort(lineReader: LineReader): {
  request(action: ActionRequest): Promise<boolean>;
} {
  return {
    async request(action: ActionRequest): Promise<boolean> {
      const resourceLabel =
        action.resource.type === 'network' ? action.resource.host : action.resource.path;
      const answer = await lineReader.next(
        `Confirmar ação irreversível (${action.access} em ${resourceLabel})? [s/N] `,
      );
      if (answer === null) {
        return false;
      }
      return /^s(im)?$/i.test(answer.trim());
    },
  };
}
