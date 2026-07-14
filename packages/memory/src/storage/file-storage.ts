import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Fact } from '@atlas/contracts';
import { MemoryError } from '../errors.js';
import type { MemoryStorage } from './memory-storage.js';

export function createFileMemoryStorage(path: string): MemoryStorage {
  return {
    async load(): Promise<readonly Fact[]> {
      let raw: string;
      try {
        raw = await readFile(path, 'utf8');
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw new MemoryError(`Falha ao ler a memória em ${path}`, { cause });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (cause) {
        throw new MemoryError(`Memória corrompida em ${path}: JSON inválido`, { cause });
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray((parsed as { facts?: unknown }).facts)
      ) {
        throw new MemoryError(`Memória corrompida em ${path}: formato inesperado`);
      }

      return (parsed as { facts: Fact[] }).facts;
    },

    async save(facts: readonly Fact[]): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify({ facts }, null, 2)}\n`, 'utf8');
    },
  };
}
