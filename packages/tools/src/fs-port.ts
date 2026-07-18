import {
  open as fsOpen,
  readdir as fsReaddir,
  realpath as fsRealpath,
  stat as fsStat,
  unlink as fsUnlink,
  mkdir as fsMkdir,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import type { AccessMode } from '@atlas/contracts';

/** Porta mínima de leitura de sistema de arquivos (injetável nos testes). */
export interface FsReadPort {
  readFile(path: string): Promise<string>;
  readdir(path: string): Promise<readonly string[]>;
}

/** Porta de escrita de sistema de arquivos (injetável nos testes). */
export interface FsWritePort {
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  appendFile(path: string, content: string): Promise<void>;
}

/**
 * Verificador estreito de contenção (SPEC-0017/ADR-0014): julga um caminho
 * já canônico (o `realpath` ancorado num fd) + o access que a porta está
 * exercendo, devolvendo `true`/`false`. Interno a `@atlas/tools` — sem 2º
 * consumidor real, não sobe a `@atlas/contracts` (mesmo critério de
 * `FsReadPort`/`FsWritePort`). Injetado pelo `@atlas/core` a partir do
 * método novo do Permission Service; a porta não conhece raízes nem o
 * serviço concreto, só este predicado.
 */
export type Verify = (realpath: string, access: AccessMode) => boolean;

type FsOpenMode = 'read' | 'write' | 'append';

/** Identidade mínima usada para ancorar o fd (dev+ino). */
interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

/** Handle aberto, já ancorado num fd — interno ao fecho atômico. */
interface FsHandle {
  fstat(): Promise<FileIdentity>;
  read(): Promise<string>;
  write(content: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Primitivas de baixo nível usadas pelo fecho atômico (open com O_NOFOLLOW +
 * ancoragem de identidade). Interna a `@atlas/tools`, injetável nos testes
 * (fakes, sem disco real) — implementação default sobre `node:fs/promises`.
 */
export interface FsPrimitivesPort {
  open(path: string, mode: FsOpenMode): Promise<FsHandle>;
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<FileIdentity>;
}

function flagsFor(mode: FsOpenMode): number {
  switch (mode) {
    case 'read':
      return constants.O_RDONLY | constants.O_NOFOLLOW;
    case 'write':
      return constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW;
    case 'append':
      return constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW;
  }
}

export function nodeFsPrimitivesPort(): FsPrimitivesPort {
  return {
    async open(path, mode) {
      const handle = await fsOpen(path, flagsFor(mode));
      return {
        fstat: async () => handle.stat(),
        read: async () => handle.readFile('utf8'),
        write: async (content: string) => {
          await handle.writeFile(content, 'utf8');
        },
        close: async () => {
          await handle.close();
        },
      };
    },
    realpath: (path) => fsRealpath(path),
    stat: (path) => fsStat(path),
  };
}

function sameIdentity(a: FileIdentity, b: FileIdentity): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

/**
 * Fecho atômico de TOCTOU (SPEC-0017/ADR-0014): abre com O_NOFOLLOW (o
 * componente final não pode ser um symlink no instante do uso), ancora a
 * identidade do fd (fstat) contra a identidade do realpath (stat) — uma
 * divergência denuncia troca de alvo entre abrir e verificar — e só então
 * aplica o predicado `verify` (o veredicto de contenção do Permission
 * Service) sobre o realpath. Opera sobre o fd já verificado e fecha sempre.
 * Nunca lança silenciosamente: cada causa de recusa tem mensagem distinta.
 */
async function withVerifiedHandle<T>(
  path: string,
  mode: FsOpenMode,
  access: AccessMode,
  primitives: FsPrimitivesPort,
  verify: Verify,
  operate: (handle: FsHandle) => Promise<T>,
): Promise<T> {
  const handle = await primitives.open(path, mode);
  try {
    const real = await primitives.realpath(path);
    const [fdIdentity, realIdentity] = await Promise.all([handle.fstat(), primitives.stat(real)]);
    if (!sameIdentity(fdIdentity, realIdentity)) {
      throw new Error(
        `TOCTOU detectado: identidade do arquivo mudou entre abrir e verificar (${path})`,
      );
    }
    if (!verify(real, access)) {
      throw new Error(`fora do diretório permitido no instante do uso: ${path}`);
    }
    return await operate(handle);
  } finally {
    await handle.close();
  }
}

export interface NodeFsPortDeps {
  /**
   * Veredicto de contenção aplicado sobre o realpath ancorado no fd. Default
   * permissivo (`() => true`) preserva o comportamento anterior à SPEC-0017
   * quando nenhum verificador é injetado — a autoridade real vem sempre do
   * `@atlas/core`, que fia o método novo do Permission Service aqui.
   */
  verify?: Verify;
  /** Primitivas de baixo nível; default real sobre `node:fs/promises`. */
  primitives?: FsPrimitivesPort;
}

export function nodeFsReadPort(deps: NodeFsPortDeps = {}): FsReadPort {
  const verify = deps.verify ?? (() => true);
  const primitives = deps.primitives ?? nodeFsPrimitivesPort();
  return {
    readFile: (path) =>
      withVerifiedHandle(path, 'read', 'read', primitives, verify, (handle) => handle.read()),
    readdir: (path) => fsReaddir(path),
  };
}

export function nodeFsWritePort(deps: NodeFsPortDeps = {}): FsWritePort {
  const verify = deps.verify ?? (() => true);
  const primitives = deps.primitives ?? nodeFsPrimitivesPort();
  return {
    writeFile: (path, content) =>
      withVerifiedHandle(path, 'write', 'write', primitives, verify, (handle) =>
        handle.write(content),
      ),
    deleteFile: (path) => fsUnlink(path),
    mkdir: (path) => fsMkdir(path, { recursive: true }).then(() => undefined),
    appendFile: (path, content) =>
      withVerifiedHandle(path, 'append', 'write', primitives, verify, (handle) =>
        handle.write(content),
      ),
  };
}
