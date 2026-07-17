import { describe, expect, it, vi } from 'vitest';
import type { FsWritePort } from '../src/index.js';
import { createAppendFileTool } from '../src/index.js';

function fakeFs(): { port: FsWritePort; appends: Array<{ path: string; content: string }> } {
  const appends: Array<{ path: string; content: string }> = [];
  return {
    appends,
    port: {
      writeFile: async () => {},
      deleteFile: async () => {},
      mkdir: async () => {},
      appendFile: async (path, content) => {
        appends.push({ path, content });
      },
    },
  };
}

describe('createAppendFileTool', () => {
  it('tem nome append_file e declara requirements com access "write"', () => {
    const tool = createAppendFileTool({ fs: fakeFs().port });
    expect(tool.name).toBe('append_file');
    expect(tool.requirements?.({ path: '/out/log.txt', content: 'x' })).toEqual({
      resource: { type: 'file', path: '/out/log.txt' },
      access: 'write',
    });
  });

  it('acrescenta o conteúdo pela porta em caso de sucesso', async () => {
    const fs = fakeFs();
    const tool = createAppendFileTool({ fs: fs.port });
    const result = await tool.run({ path: '/out/log.txt', content: 'linha 1\n' });
    expect(result).toEqual({ ok: true, output: 'conteúdo acrescentado: /out/log.txt' });
    expect(fs.appends).toEqual([{ path: '/out/log.txt', content: 'linha 1\n' }]);
  });

  it('erro quando path não é string não vazia — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createAppendFileTool({ fs: port });
    expect((await tool.run({ content: 'x' })).ok).toBe(false);
    expect((await tool.run({ path: '   ', content: 'x' })).ok).toBe(false);
    expect(port.appendFile).not.toHaveBeenCalled();
  });

  it('erro quando content não é string — não chama a porta', async () => {
    const port: FsWritePort = {
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      mkdir: vi.fn(),
      appendFile: vi.fn(),
    };
    const tool = createAppendFileTool({ fs: port });
    expect((await tool.run({ path: '/out/log.txt' })).ok).toBe(false);
    expect((await tool.run({ path: '/out/log.txt', content: 42 })).ok).toBe(false);
    expect(port.appendFile).not.toHaveBeenCalled();
  });

  it('retorna erro estruturado quando a porta lança — não lança', async () => {
    const tool = createAppendFileTool({
      fs: {
        writeFile: async () => {},
        deleteFile: async () => {},
        mkdir: async () => {},
        appendFile: async () => {
          throw new Error('EACCES: denied');
        },
      },
    });
    const result = await tool.run({ path: '/out/log.txt', content: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/out/log.txt');
  });
});
