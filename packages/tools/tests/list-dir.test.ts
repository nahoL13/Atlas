import { describe, expect, it } from 'vitest';
import type { FsReadPort } from '../src/index.js';
import { createListDirTool } from '../src/index.js';

function fakeFs(dirs: Record<string, readonly string[]>): FsReadPort {
  return {
    readFile: async () => '',
    readdir: async (path) => {
      const entries = dirs[path];
      if (entries === undefined) throw new Error(`ENOENT: ${path}`);
      return entries;
    },
  };
}

describe('createListDirTool', () => {
  it('tem nome list_dir e declara requirements de leitura de diretório', () => {
    const tool = createListDirTool({ fs: fakeFs({}) });
    expect(tool.name).toBe('list_dir');
    expect(tool.requirements?.({ path: '.' })).toEqual({
      resource: { type: 'directory', path: '.' },
      access: 'read',
    });
  });

  it('lista as entradas do diretório em caso de sucesso', async () => {
    const tool = createListDirTool({ fs: fakeFs({ '/repo': ['a.txt', 'b.txt'] }) });
    expect(await tool.run({ path: '/repo' })).toEqual({ ok: true, output: 'a.txt\nb.txt' });
  });

  it('retorna erro estruturado quando a porta lança', async () => {
    const tool = createListDirTool({ fs: fakeFs({}) });
    const result = await tool.run({ path: '/nope' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/nope');
  });

  it('retorna erro estruturado quando path não é string', async () => {
    const tool = createListDirTool({ fs: fakeFs({}) });
    expect((await tool.run({})).ok).toBe(false);
  });
});
