import {
  readFile as fsReadFile,
  readdir as fsReaddir,
  writeFile as fsWriteFile,
} from 'node:fs/promises';

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

/** Porta mínima de escrita de sistema de arquivos (injetável nos testes). */
export interface FsWritePort {
  writeFile(path: string, content: string): Promise<void>;
}

export function nodeFsWritePort(): FsWritePort {
  return {
    writeFile: (path, content) => fsWriteFile(path, content, 'utf8'),
  };
}
