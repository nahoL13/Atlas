import { describe, expect, it, vi } from 'vitest';
import type { FsWritePort } from '../src/index.js';
import { createMkdirTool } from '../src/index.js';

function fakeFs(): { port: FsWritePort; created: string[] } {
  const created: string[] = [];
  return {
    created,
    port: {
      writeFile: async () => {},
      deleteFile: async () => {},
      mkdir: async (path) => {
        created.push(path);
      },
      appendFile: async () => {},
    },
  };
}

describe('createMkdirTool', () => {
  it('tem nome mkdir e declara requirements com access "write" e recurso directory', () => {
    const tool = createMkdirTool({ fs: fakeFs().port });
    expect(tool.name).toBe('mkdir');
    expect(tool.requirements?.({ path: '/out/nested' })).toEqual({
      resource: { type: 'directory', path: '/out/nested' },
      access: 'write',
    });
  });

  it('cria o diretório pela porta em caso de sucesso', async () => {
    const fs = fakeFs();
    const tool = createMkdirTool({ fs: fs.port });
    const result = await tool.run({ path: '/out/nested' });
    expect(result).toEqual({ ok: true, output: 'diretório criado: /out/nested' });
    expect(fs.created).toEqual(['/out/nested']);
  });

  it('erro quando path não é string não vazia — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createMkdirTool({ fs: port });
    expect((await tool.run({})).ok).toBe(false);
    expect((await tool.run({ path: '' })).ok).toBe(false);
    expect(port.mkdir).not.toHaveBeenCalled();
  });

  it('retorna erro estruturado quando a porta lança — não lança', async () => {
    const tool = createMkdirTool({
      fs: {
        writeFile: async () => {},
        deleteFile: async () => {},
        mkdir: async () => {
          throw new Error('EACCES: denied');
        },
        appendFile: async () => {},
      },
    });
    const result = await tool.run({ path: '/out/nested' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/out/nested');
  });
});
