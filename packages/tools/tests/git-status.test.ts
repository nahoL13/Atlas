import { describe, expect, it } from 'vitest';
import type { GitOutput, GitReadPort } from '../src/index.js';
import { createGitStatusTool } from '../src/index.js';

function fakeGit(overrides: Partial<GitReadPort> = {}): GitReadPort {
  return {
    status: async (cwd) => ({ repository: cwd, text: 'clean', truncated: false }),
    diff: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    log: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    ...overrides,
  };
}

describe('createGitStatusTool', () => {
  it('requirements({ path }) declara diretório/read com o path informado', () => {
    const tool = createGitStatusTool({ git: fakeGit(), cwd: () => '/cwd' });
    expect(tool.requirements?.({ path: '/repo' })).toEqual({
      resource: { type: 'directory', path: '/repo' },
      access: 'read',
    });
  });

  it('requirements({}) declara o diretório do cwd injetado', () => {
    const tool = createGitStatusTool({ git: fakeGit(), cwd: () => '/cwd' });
    expect(tool.requirements?.({})).toEqual({
      resource: { type: 'directory', path: '/cwd' },
      access: 'read',
    });
  });

  it('run com git fake devolvendo GitOutput → ok:true com repository e texto no output', async () => {
    const output: GitOutput = { repository: '/proj', text: 'M a.txt', truncated: false };
    const tool = createGitStatusTool({ git: fakeGit({ status: async () => output }) });
    const result = await tool.run({ path: '/proj' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('/proj');
    expect(result.output).toContain('M a.txt');
  });

  it('run sem path (ausente) também inclui o repository resolvido no output de sucesso', async () => {
    const tool = createGitStatusTool({
      git: fakeGit({
        status: async (cwd) => ({ repository: cwd, text: 'clean', truncated: false }),
      }),
      cwd: () => '/cwd',
    });
    const result = await tool.run({});
    expect(result.ok).toBe(true);
    expect(result.output).toContain('/cwd');
  });

  it('git fake que lança → ToolResult de erro', async () => {
    const tool = createGitStatusTool({
      git: fakeGit({
        status: async () => {
          throw new Error('fora do diretório permitido: /proj');
        },
      }),
    });
    const result = await tool.run({ path: '/proj/sub' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('fora do diretório permitido');
  });

  it('path não-string/vazio → ok:false sem chamar o git fake', async () => {
    let called = false;
    const tool = createGitStatusTool({
      git: fakeGit({
        status: async () => {
          called = true;
          return { repository: '', text: '', truncated: false };
        },
      }),
    });
    const resultNonString = await tool.run({ path: 42 });
    expect(resultNonString.ok).toBe(false);
    const resultEmpty = await tool.run({ path: '' });
    expect(resultEmpty.ok).toBe(false);
    expect(called).toBe(false);
  });
});
