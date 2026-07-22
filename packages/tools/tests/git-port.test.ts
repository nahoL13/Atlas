import { describe, expect, it } from 'vitest';
import type { AccessMode } from '@atlas/contracts';
import type { ExecGit, Verify } from '../src/index.js';
import { nodeGitReadPort } from '../src/index.js';

interface ExecCall {
  readonly args: readonly string[];
  readonly options: { readonly cwd: string; readonly maxBuffer: number };
}

function fakeExec(config: {
  readonly toplevel?: string;
  readonly rejectRevParse?: boolean;
  readonly output?: string;
  readonly maxBufferOverflow?: boolean;
}): { exec: ExecGit; calls: ExecCall[] } {
  const calls: ExecCall[] = [];
  const exec: ExecGit = async (args, options) => {
    calls.push({ args, options });
    if (args.includes('rev-parse')) {
      if (config.rejectRevParse) {
        throw new Error('fatal: not a git repository');
      }
      return `${config.toplevel ?? '/proj'}\n`;
    }
    if (config.maxBufferOverflow) {
      const error = new Error('stdout maxBuffer exceeded') as NodeJS.ErrnoException;
      error.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
      throw error;
    }
    return config.output ?? 'nothing to commit, working tree clean';
  };
  return { exec, calls };
}

function identityRealpath(): (path: string) => Promise<string> {
  return (path) => Promise.resolve(path);
}

function alwaysTrue(): Verify {
  return () => true;
}

function alwaysFalse(): Verify {
  return () => false;
}

describe('nodeGitReadPort — contenção do repositório realmente lido (achado A)', () => {
  it('para cada método, a 1ª invocação é rev-parse --show-toplevel e o subcomando só roda após verify aprovar', async () => {
    for (const method of ['status', 'diff', 'log'] as const) {
      const { exec, calls } = fakeExec({ toplevel: '/proj' });
      const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
      await port[method]('/proj');
      expect(calls[0]!.args).toContain('rev-parse');
      expect(calls[0]!.args).toContain('--show-toplevel');
      expect(calls).toHaveLength(2);
      expect(calls[1]!.args).toContain(method);
    }
  });

  it('verify(toplevel) === false erra com mensagem contendo o toplevel; subcomando não roda (exatamente 1 chamada)', async () => {
    const { exec, calls } = fakeExec({ toplevel: '/proj' });
    const port = nodeGitReadPort({ verify: alwaysFalse(), exec, realpath: identityRealpath() });
    await expect(port.status('/proj')).rejects.toThrow(/\/proj/);
    expect(calls).toHaveLength(1);
  });

  it('caso do escape: alvo /proj/packages/tools, toplevel descoberto /proj, verify só aprova o subdiretório → recusa', async () => {
    const { exec, calls } = fakeExec({ toplevel: '/proj' });
    const verify: Verify = (realpath: string, access: AccessMode) =>
      realpath === '/proj/packages/tools' && access === 'read';
    const port = nodeGitReadPort({ verify, exec, realpath: identityRealpath() });
    await expect(port.status('/proj/packages/tools')).rejects.toThrow(
      /fora do diretório permitido/,
    );
    expect(calls).toHaveLength(1);
  });

  it('verify ausente (porta crua) é fail-closed: recusa mesmo com toplevel válido', async () => {
    const { exec } = fakeExec({ toplevel: '/proj' });
    const port = nodeGitReadPort({ exec, realpath: identityRealpath() });
    await expect(port.status('/proj')).rejects.toThrow(/fora do diretório permitido/);
  });

  it('o subcomando roda com cwd = toplevel verificado', async () => {
    const { exec, calls } = fakeExec({ toplevel: '/proj' });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    await port.status('/other-cwd');
    expect(calls[1]!.options.cwd).toBe('/proj');
  });

  it('alvo que não é repositório (rev-parse falha) → erro; subcomando não roda', async () => {
    const { exec, calls } = fakeExec({ rejectRevParse: true });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    await expect(port.status('/tmp')).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('falha ao resolver o realpath do toplevel é fail-closed: recusa, subcomando não roda (R2)', async () => {
    const { exec, calls } = fakeExec({ toplevel: '/proj' });
    const realpath = () => Promise.reject(new Error('ENOENT'));
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath });
    await expect(port.status('/proj')).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});

describe('nodeGitReadPort — não-escrita sob veredicto read (achado C)', () => {
  it('todo argv (inclusive rev-parse) contém --no-optional-locks antes do subcomando, nos três métodos', async () => {
    for (const method of ['status', 'diff', 'log'] as const) {
      const { exec, calls } = fakeExec({ toplevel: '/proj' });
      const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
      await port[method]('/proj');
      for (const call of calls) {
        expect(call.args[0]).toBe('--no-optional-locks');
      }
    }
  });

  it('nenhum argv usa subcomando fora da allowlist rev-parse|status|diff|log', async () => {
    const { exec, calls } = fakeExec({ toplevel: '/proj' });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    await port.diff('/proj', { staged: true });
    const allowlist = new Set(['rev-parse', 'status', 'diff', 'log']);
    for (const call of calls) {
      const subcommand = call.args[1];
      expect(allowlist.has(subcommand!)).toBe(true);
    }
  });

  it('nenhuma invocação usa shell: true — opções capturadas trazem só cwd/maxBuffer', async () => {
    const { exec, calls } = fakeExec({ toplevel: '/proj' });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    await port.status('/proj');
    for (const call of calls) {
      expect(call.options).not.toHaveProperty('shell');
    }
  });
});

describe('nodeGitReadPort — teto de saída (achado E)', () => {
  it('saída acima de 64 KiB é truncada com marcador; ToolResult segue ok (truncated: true)', async () => {
    const huge = 'x'.repeat(70 * 1024);
    const { exec } = fakeExec({ toplevel: '/proj', output: huge });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    const output = await port.status('/proj');
    expect(output.truncated).toBe(true);
    expect(output.text.length).toBeLessThanOrEqual(64 * 1024 + 64);
    expect(output.text).toContain('truncad');
  });

  it('saída abaixo do teto não é truncada', async () => {
    const { exec } = fakeExec({ toplevel: '/proj', output: 'pequeno' });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    const output = await port.status('/proj');
    expect(output.truncated).toBe(false);
    expect(output.text).toBe('pequeno');
  });

  it('opções de execFile incluem maxBuffer explícito de 10 MiB', async () => {
    const { exec, calls } = fakeExec({ toplevel: '/proj' });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    await port.status('/proj');
    for (const call of calls) {
      expect(call.options.maxBuffer).toBe(10 * 1024 * 1024);
    }
  });

  it('estouro de maxBuffer vira erro estruturado, não falha opaca', async () => {
    const { exec } = fakeExec({ toplevel: '/proj', maxBufferOverflow: true });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    await expect(port.status('/proj')).rejects.toThrow(/falha ao executar git/);
  });
});

describe('nodeGitReadPort — transparência do alvo (achado F) e opções bounded', () => {
  it('diff repassa staged como --cached', async () => {
    const { exec, calls } = fakeExec({ toplevel: '/proj' });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    await port.diff('/proj', { staged: true });
    expect(calls[1]!.args).toContain('--cached');
  });

  it('log aplica --max-count com o valor informado', async () => {
    const { exec, calls } = fakeExec({ toplevel: '/proj' });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    await port.log('/proj', { maxCount: 5 });
    expect(calls[1]!.args).toContain('--max-count=5');
  });

  it('o repository devolvido é o toplevel real resolvido', async () => {
    const { exec } = fakeExec({ toplevel: '/proj' });
    const port = nodeGitReadPort({ verify: alwaysTrue(), exec, realpath: identityRealpath() });
    const output = await port.status('/proj');
    expect(output.repository).toBe('/proj');
  });
});
