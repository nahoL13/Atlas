import { describe, expect, it, vi } from 'vitest';
import type { FsWritePort } from '../src/index.js';
import { createWriteFileTool } from '../src/index.js';

function fakeFs(): { port: FsWritePort; writes: Array<{ path: string; content: string }> } {
  const writes: Array<{ path: string; content: string }> = [];
  return {
    writes,
    port: {
      writeFile: async (path, content) => {
        writes.push({ path, content });
      },
      deleteFile: async () => {},
      mkdir: async () => {},
      appendFile: async () => {},
    },
  };
}

describe('createWriteFileTool', () => {
  it('tem nome write_file e declara requirements de escrita de arquivo', () => {
    const tool = createWriteFileTool({ fs: fakeFs().port });
    expect(tool.name).toBe('write_file');
    expect(tool.requirements?.({ path: './out.txt', content: 'x' })).toEqual({
      resource: { type: 'file', path: './out.txt' },
      access: 'write',
    });
  });

  it('escreve o conteúdo pela porta em caso de sucesso', async () => {
    const fs = fakeFs();
    const tool = createWriteFileTool({ fs: fs.port });
    const result = await tool.run({ path: '/out/a.txt', content: 'olá' });
    expect(result.ok).toBe(true);
    expect(fs.writes).toEqual([{ path: '/out/a.txt', content: 'olá' }]);
  });

  it('erro quando path não é string não vazia — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createWriteFileTool({ fs: port });
    expect((await tool.run({ content: 'x' })).ok).toBe(false);
    expect((await tool.run({ path: '   ', content: 'x' })).ok).toBe(false);
    expect(port.writeFile).not.toHaveBeenCalled();
  });

  it('erro quando content não é string — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createWriteFileTool({ fs: port });
    expect((await tool.run({ path: '/out/a.txt' })).ok).toBe(false);
    expect((await tool.run({ path: '/out/a.txt', content: 42 })).ok).toBe(false);
    expect(port.writeFile).not.toHaveBeenCalled();
  });

  it('retorna erro estruturado quando a porta lança — não lança', async () => {
    const tool = createWriteFileTool({
      fs: {
        writeFile: async () => {
          throw new Error('EACCES: denied');
        },
        deleteFile: async () => {},
        mkdir: async () => {},
        appendFile: async () => {},
      },
    });
    const result = await tool.run({ path: '/out/a.txt', content: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/out/a.txt');
  });
});
