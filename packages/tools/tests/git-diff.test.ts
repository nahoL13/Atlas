import { describe, expect, it } from 'vitest';
import type { GitOutput, GitReadPort } from '../src/index.js';
import { createGitDiffTool } from '../src/index.js';

function fakeGit(
  spy: (cwd: string, opts: { staged?: boolean }) => void,
  output: GitOutput = { repository: '/proj', text: 'diff --git', truncated: false },
): GitReadPort {
  return {
    toplevel: async (cwd) => cwd,
    status: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    diff: async (cwd, opts) => {
      spy(cwd, opts ?? {});
      return output;
    },
    log: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
  };
}

describe('createGitDiffTool', () => {
  it('requirements declara access:read no alvo', () => {
    const tool = createGitDiffTool({ git: fakeGit(() => {}), cwd: () => '/cwd' });
    expect(tool.requirements?.({ path: '/repo' })).toEqual({
      resource: { type: 'directory', path: '/repo' },
      access: 'read',
    });
  });

  it('run({ staged: true }) invoca git.diff(alvo, { staged: true })', async () => {
    const calls: Array<{ cwd: string; opts: { staged?: boolean } }> = [];
    const tool = createGitDiffTool({
      git: fakeGit((cwd, opts) => calls.push({ cwd, opts })),
    });
    await tool.run({ path: '/proj', staged: true });
    expect(calls).toEqual([{ cwd: '/proj', opts: { staged: true } }]);
  });

  it('run({}) invoca git.diff(alvo, { staged: false })', async () => {
    const calls: Array<{ cwd: string; opts: { staged?: boolean } }> = [];
    const tool = createGitDiffTool({
      git: fakeGit((cwd, opts) => calls.push({ cwd, opts })),
      cwd: () => '/cwd',
    });
    await tool.run({});
    expect(calls).toEqual([{ cwd: '/cwd', opts: { staged: false } }]);
  });

  it('sucesso inclui repository e texto no output', async () => {
    const tool = createGitDiffTool({ git: fakeGit(() => {}) });
    const result = await tool.run({ path: '/proj' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('/proj');
    expect(result.output).toContain('diff --git');
  });

  it('erro do fake → ToolResult de erro', async () => {
    const tool = createGitDiffTool({
      git: {
        toplevel: async (cwd) => cwd,
        status: async () => ({ repository: '', text: '', truncated: false }),
        diff: async () => {
          throw new Error('falhou');
        },
        log: async () => ({ repository: '', text: '', truncated: false }),
      },
    });
    const result = await tool.run({ path: '/proj' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('falhou');
  });

  it('path não-string/vazio → ok:false sem chamar o git fake', async () => {
    let called = false;
    const tool = createGitDiffTool({
      git: fakeGit(() => {
        called = true;
      }),
    });
    await tool.run({ path: '' });
    expect(called).toBe(false);
  });
});
