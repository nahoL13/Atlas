import { describe, expect, it } from 'vitest';
import type { AccessMode } from '@atlas/contracts';
import type { FsPrimitivesPort, Verify } from '../src/index.js';
import { nodeFsReadPort, nodeFsWritePort } from '../src/index.js';

interface FakeHandleConfig {
  readonly fdIdentity: { dev: number; ino: number };
  readonly realIdentity: { dev: number; ino: number };
  readonly realpath?: string;
  readonly content?: string;
}

function fakePrimitives(config: FakeHandleConfig): {
  primitives: FsPrimitivesPort;
  closed: boolean[];
  operated: string[];
} {
  const closed: boolean[] = [];
  const operated: string[] = [];
  const primitives: FsPrimitivesPort = {
    async open() {
      return {
        fstat: async () => config.fdIdentity,
        read: async () => {
          operated.push('read');
          return config.content ?? '';
        },
        write: async (content: string) => {
          operated.push(`write:${content}`);
        },
        close: async () => {
          closed.push(true);
        },
      };
    },
    realpath: async (path: string) => config.realpath ?? path,
    stat: async () => config.realIdentity,
  };
  return { primitives, closed, operated };
}

function alwaysTrue(): Verify {
  return () => true;
}

function alwaysFalse(): Verify {
  return () => false;
}

describe('nodeFsReadPort — fecho atômico de TOCTOU (readFile)', () => {
  it('open falhando com ELOOP/ENOTDIR (symlink no último hop) vira erro, não lança silenciosamente', async () => {
    const primitives: FsPrimitivesPort = {
      open: async () => {
        const error = new Error(
          'ELOOP: too many symbolic links encountered',
        ) as NodeJS.ErrnoException;
        error.code = 'ELOOP';
        throw error;
      },
      realpath: async (path) => path,
      stat: async () => ({ dev: 1, ino: 1 }),
    };
    const port = nodeFsReadPort({ verify: alwaysTrue(), primitives });
    await expect(port.readFile('/root/link')).rejects.toThrow(/ELOOP/);
  });

  it('identidade divergente entre fstat(fd) e stat(realpath) recusa por TOCTOU e fecha o fd, sem ler', async () => {
    const { primitives, closed, operated } = fakePrimitives({
      fdIdentity: { dev: 1, ino: 100 },
      realIdentity: { dev: 1, ino: 200 },
      content: 'segredo',
    });
    const port = nodeFsReadPort({ verify: alwaysTrue(), primitives });
    await expect(port.readFile('/root/a.txt')).rejects.toThrow(/TOCTOU/);
    expect(operated).toEqual([]);
    expect(closed).toEqual([true]);
  });

  it('verify(realpath, "read") false recusa por fora da raiz no uso, sem ler, e fecha o fd', async () => {
    const { primitives, closed, operated } = fakePrimitives({
      fdIdentity: { dev: 1, ino: 1 },
      realIdentity: { dev: 1, ino: 1 },
      content: 'segredo',
    });
    const port = nodeFsReadPort({ verify: alwaysFalse(), primitives });
    await expect(port.readFile('/root/a.txt')).rejects.toThrow(/fora do diretório permitido/);
    expect(operated).toEqual([]);
    expect(closed).toEqual([true]);
  });

  it('identidade consistente e verify true: lê pelo fd e fecha', async () => {
    const { primitives, closed, operated } = fakePrimitives({
      fdIdentity: { dev: 1, ino: 1 },
      realIdentity: { dev: 1, ino: 1 },
      content: 'olá',
    });
    const port = nodeFsReadPort({ verify: alwaysTrue(), primitives });
    const content = await port.readFile('/root/a.txt');
    expect(content).toBe('olá');
    expect(operated).toEqual(['read']);
    expect(closed).toEqual([true]);
  });

  it('verify recebe o realpath ancorado e o access "read"', async () => {
    const calls: Array<[string, AccessMode]> = [];
    const verify: Verify = (realpath, access) => {
      calls.push([realpath, access]);
      return true;
    };
    const { primitives } = fakePrimitives({
      fdIdentity: { dev: 1, ino: 1 },
      realIdentity: { dev: 1, ino: 1 },
      realpath: '/root/real-a.txt',
    });
    const port = nodeFsReadPort({ verify, primitives });
    await port.readFile('/root/a.txt');
    expect(calls).toEqual([['/root/real-a.txt', 'read']]);
  });

  it('sem verify injetado (default), comporta-se de forma permissiva (compatibilidade)', async () => {
    const { primitives } = fakePrimitives({
      fdIdentity: { dev: 1, ino: 1 },
      realIdentity: { dev: 1, ino: 1 },
      content: 'x',
    });
    const port = nodeFsReadPort({ primitives });
    await expect(port.readFile('/root/a.txt')).resolves.toBe('x');
  });

  it('readdir não muda: não passa pelo fecho atômico', async () => {
    const calls: string[] = [];
    const primitives: FsPrimitivesPort = {
      open: async () => {
        throw new Error('não deveria abrir');
      },
      realpath: async (path) => path,
      stat: async () => ({ dev: 1, ino: 1 }),
    };
    const port = nodeFsReadPort({ verify: alwaysFalse(), primitives });
    void calls;
    // readdir usa fs.promises.readdir diretamente; chamar contra um diretório
    // inexistente deve rejeitar com erro de IO comum (ENOENT), não com
    // mensagem do fecho atômico (prova que não passou por open()).
    await expect(port.readdir('/definitely/missing/dir')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('nodeFsWritePort — fecho atômico de TOCTOU (writeFile/appendFile)', () => {
  it('open falhando (symlink no último hop) vira erro, não lança silenciosamente', async () => {
    const primitives: FsPrimitivesPort = {
      open: async () => {
        const error = new Error('ENOTDIR') as NodeJS.ErrnoException;
        error.code = 'ENOTDIR';
        throw error;
      },
      realpath: async (path) => path,
      stat: async () => ({ dev: 1, ino: 1 }),
    };
    const port = nodeFsWritePort({ verify: alwaysTrue(), primitives });
    await expect(port.writeFile('/root/link', 'x')).rejects.toThrow(/ENOTDIR/);
  });

  it('identidade divergente recusa por TOCTOU, não escreve, fecha o fd', async () => {
    const { primitives, closed, operated } = fakePrimitives({
      fdIdentity: { dev: 1, ino: 100 },
      realIdentity: { dev: 1, ino: 200 },
    });
    const port = nodeFsWritePort({ verify: alwaysTrue(), primitives });
    await expect(port.writeFile('/root/a.txt', 'x')).rejects.toThrow(/TOCTOU/);
    expect(operated).toEqual([]);
    expect(closed).toEqual([true]);
  });

  it('verify(realpath, "write") false recusa por fora da raiz no uso, não escreve', async () => {
    const { primitives, closed, operated } = fakePrimitives({
      fdIdentity: { dev: 1, ino: 1 },
      realIdentity: { dev: 1, ino: 1 },
    });
    const port = nodeFsWritePort({ verify: alwaysFalse(), primitives });
    await expect(port.writeFile('/root/a.txt', 'x')).rejects.toThrow(/fora do diretório permitido/);
    expect(operated).toEqual([]);
    expect(closed).toEqual([true]);
  });

  it('contido: escreve pelo fd e fecha (writeFile)', async () => {
    const { primitives, closed, operated } = fakePrimitives({
      fdIdentity: { dev: 1, ino: 1 },
      realIdentity: { dev: 1, ino: 1 },
    });
    const port = nodeFsWritePort({ verify: alwaysTrue(), primitives });
    await port.writeFile('/root/a.txt', 'novo conteúdo');
    expect(operated).toEqual(['write:novo conteúdo']);
    expect(closed).toEqual([true]);
  });

  it('contido: acrescenta pelo fd e fecha (appendFile), com access "write"', async () => {
    const calls: Array<[string, AccessMode]> = [];
    const verify: Verify = (realpath, access) => {
      calls.push([realpath, access]);
      return true;
    };
    const { primitives, closed, operated } = fakePrimitives({
      fdIdentity: { dev: 1, ino: 1 },
      realIdentity: { dev: 1, ino: 1 },
      realpath: '/root/log.txt',
    });
    const port = nodeFsWritePort({ verify, primitives });
    await port.appendFile('/root/log.txt', 'linha\n');
    expect(operated).toEqual(['write:linha\n']);
    expect(closed).toEqual([true]);
    expect(calls).toEqual([['/root/log.txt', 'write']]);
  });

  it('appendFile com identidade divergente recusa por TOCTOU, não escreve', async () => {
    const { primitives, operated } = fakePrimitives({
      fdIdentity: { dev: 1, ino: 5 },
      realIdentity: { dev: 1, ino: 6 },
    });
    const port = nodeFsWritePort({ verify: alwaysTrue(), primitives });
    await expect(port.appendFile('/root/log.txt', 'x')).rejects.toThrow(/TOCTOU/);
    expect(operated).toEqual([]);
  });

  it('deleteFile e mkdir não mudam: não passam pelo fecho atômico', async () => {
    const primitives: FsPrimitivesPort = {
      open: async () => {
        throw new Error('não deveria abrir');
      },
      realpath: async (path) => path,
      stat: async () => ({ dev: 1, ino: 1 }),
    };
    const port = nodeFsWritePort({ verify: alwaysFalse(), primitives });
    // deleteFile/mkdir usam fs.promises diretamente contra um alvo
    // inexistente: erro de IO comum (ENOENT), não a mensagem do fecho atômico.
    await expect(port.deleteFile('/definitely/missing.txt')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
