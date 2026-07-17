import {
  readFile as fsReadFile,
  readdir as fsReaddir,
  writeFile as fsWriteFile,
  unlink as fsUnlink,
  mkdir as fsMkdir,
  appendFile as fsAppendFile,
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

/** Porta de escrita de sistema de arquivos (injetável nos testes). */
export interface FsWritePort {
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  appendFile(path: string, content: string): Promise<void>;
}

export function nodeFsWritePort(): FsWritePort {
  return {
    writeFile: (path, content) => fsWriteFile(path, content, 'utf8'),
    deleteFile: (path) => fsUnlink(path),
    mkdir: (path) => fsMkdir(path, { recursive: true }).then(() => undefined),
    appendFile: (path, content) => fsAppendFile(path, content, 'utf8'),
  };
}
