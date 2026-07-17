import { describe, expect, it, vi } from 'vitest';
import type { FsWritePort } from '../src/index.js';
import { createDeleteFileTool } from '../src/index.js';

function fakeFs(): { port: FsWritePort; deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    port: {
      writeFile: async () => {},
      deleteFile: async (path) => {
        deleted.push(path);
      },
      mkdir: async () => {},
      appendFile: async () => {},
    },
  };
}

describe('createDeleteFileTool', () => {
  it('tem nome delete_file e declara requirements com access "delete"', () => {
    const tool = createDeleteFileTool({ fs: fakeFs().port });
    expect(tool.name).toBe('delete_file');
    expect(tool.requirements?.({ path: '/out/a.txt' })).toEqual({
      resource: { type: 'file', path: '/out/a.txt' },
      access: 'delete',
    });
  });

  it('remove o arquivo pela porta em caso de sucesso', async () => {
    const fs = fakeFs();
    const tool = createDeleteFileTool({ fs: fs.port });
    const result = await tool.run({ path: '/out/a.txt' });
    expect(result).toEqual({ ok: true, output: 'removido: /out/a.txt' });
    expect(fs.deleted).toEqual(['/out/a.txt']);
  });

  it('erro quando path não é string não vazia — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createDeleteFileTool({ fs: port });
    expect((await tool.run({})).ok).toBe(false);
    expect((await tool.run({ path: '   ' })).ok).toBe(false);
    expect(port.deleteFile).not.toHaveBeenCalled();
  });

  it('retorna erro estruturado quando a porta lança — não lança', async () => {
    const tool = createDeleteFileTool({
      fs: {
        writeFile: async () => {},
        deleteFile: async () => {
          throw new Error('ENOENT: no such file');
        },
        mkdir: async () => {},
        appendFile: async () => {},
      },
    });
    const result = await tool.run({ path: '/out/missing.txt' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/out/missing.txt');
  });
});
