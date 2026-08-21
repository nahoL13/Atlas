import { describe, expect, it } from 'vitest';
import type { GitOutput, GitReadPort } from '../src/index.js';
import { createGitLogTool } from '../src/index.js';

function fakeGit(
  spy: (cwd: string, opts: { maxCount?: number }) => void,
  output: GitOutput = { repository: '/proj', text: 'commit abc', truncated: false },
): GitReadPort {
  return {
    toplevel: async (cwd) => cwd,
    status: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    diff: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    log: async (cwd, opts) => {
      spy(cwd, opts ?? {});
      return output;
    },
  };
}

describe('createGitLogTool', () => {
  it('run({ maxCount: 5 }) invoca git.log(alvo, { maxCount: 5 })', async () => {
    const calls: Array<{ cwd: string; opts: { maxCount?: number } }> = [];
    const tool = createGitLogTool({ git: fakeGit((cwd, opts) => calls.push({ cwd, opts })) });
    await tool.run({ path: '/proj', maxCount: 5 });
    expect(calls).toEqual([{ cwd: '/proj', opts: { maxCount: 5 } }]);
  });

  it('run({}) invoca git.log(alvo, { maxCount: 20 }) — default 20', async () => {
    const calls: Array<{ cwd: string; opts: { maxCount?: number } }> = [];
    const tool = createGitLogTool({
      git: fakeGit((cwd, opts) => calls.push({ cwd, opts })),
      cwd: () => '/cwd',
    });
    await tool.run({});
    expect(calls).toEqual([{ cwd: '/cwd', opts: { maxCount: 20 } }]);
  });

  it.each([0, -3, 'abc', 2.5])(
    'maxCount inválido (%j) cai no default 20, fake é chamado com { maxCount: 20 }',
    async (invalid) => {
      const calls: Array<{ cwd: string; opts: { maxCount?: number } }> = [];
      const tool = createGitLogTool({ git: fakeGit((cwd, opts) => calls.push({ cwd, opts })) });
      await tool.run({ path: '/proj', maxCount: invalid });
      expect(calls).toEqual([{ cwd: '/proj', opts: { maxCount: 20 } }]);
    },
  );

  it('sucesso inclui repository e texto no output', async () => {
    const tool = createGitLogTool({ git: fakeGit(() => {}) });
    const result = await tool.run({ path: '/proj' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('/proj');
    expect(result.output).toContain('commit abc');
  });

  it('erro do fake → ToolResult de erro', async () => {
    const tool = createGitLogTool({
      git: {
        toplevel: async (cwd) => cwd,
        status: async () => ({ repository: '', text: '', truncated: false }),
        diff: async () => ({ repository: '', text: '', truncated: false }),
        log: async () => {
          throw new Error('falhou');
        },
      },
    });
    const result = await tool.run({ path: '/proj' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('falhou');
  });

  it('path não-string/vazio → ok:false sem chamar o git fake', async () => {
    let called = false;
    const tool = createGitLogTool({
      git: fakeGit(() => {
        called = true;
      }),
    });
    await tool.run({ path: '' });
    expect(called).toBe(false);
  });
});
