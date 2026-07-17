import { realpathSync } from 'node:fs';

/**
 * Porta síncrona de resolução de caminho real (interna a @atlas/permissions:
 * sem 2º consumidor real, não sobe a @atlas/contracts — mesmo critério de
 * placement de FsReadPort/FsWritePort/ConfirmPort).
 *
 * Expõe só `realpathSync` cru; o algoritmo de "subir até um ancestral
 * existente" vive em permission-service.ts, não aqui.
 */
export interface PathResolverPort {
  realpathSync(path: string): string;
}

/** Implementação real sobre node:fs (síncrona — não fs/promises). */
export function nodePathResolverPort(): PathResolverPort {
  return {
    realpathSync(path: string): string {
      return realpathSync(path);
    },
  };
}
