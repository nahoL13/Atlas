import { readFile as fsReadFile, readdir as fsReaddir } from 'node:fs/promises';

/** Porta mínima de leitura de sistema de arquivos (injetável nos testes). */
export interface FsReadPort {
  readFile(path: string): Promise<string>;
  readdir(path: string): Promise<readonly string[]>;
}

export function nodeFsReadPort(): FsReadPort {
  return {
    readFile: (path) => fsReadFile(path, 'utf8'),
    readdir: (path) => fsReaddir(path),
  };
}
