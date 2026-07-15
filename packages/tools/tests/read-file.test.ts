import { describe, expect, it } from 'vitest';
import type { FsReadPort } from '../src/index.js';
import { createReadFileTool } from '../src/index.js';

function fakeFs(files: Record<string, string>): FsReadPort {
  return {
    readFile: async (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    readdir: async () => [],
  };
}

describe('createReadFileTool', () => {
  it('tem nome read_file e declara requirements de leitura de arquivo', () => {
    const tool = createReadFileTool({ fs: fakeFs({}) });
    expect(tool.name).toBe('read_file');
    expect(tool.requirements?.({ path: './a.txt' })).toEqual({
      resource: { type: 'file', path: './a.txt' },
      access: 'read',
    });
  });

  it('lê o conteúdo do arquivo em caso de sucesso', async () => {
    const tool = createReadFileTool({ fs: fakeFs({ '/repo/a.txt': 'olá' }) });
    expect(await tool.run({ path: '/repo/a.txt' })).toEqual({ ok: true, output: 'olá' });
  });

  it('retorna erro estruturado quando a porta lança (arquivo inexistente)', async () => {
    const tool = createReadFileTool({ fs: fakeFs({}) });
    const result = await tool.run({ path: '/repo/missing.txt' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('missing.txt');
  });

  it('retorna erro estruturado quando path não é string', async () => {
    const tool = createReadFileTool({ fs: fakeFs({}) });
    expect((await tool.run({})).ok).toBe(false);
    expect((await tool.run({ path: 42 })).ok).toBe(false);
  });
});
