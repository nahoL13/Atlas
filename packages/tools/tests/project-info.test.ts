import { describe, expect, it } from 'vitest';
import type { FsReadPort } from '../src/fs-port.js';
import type { GitReadPort } from '../src/git-port.js';
import { GitRootError } from '../src/git-port.js';
import { createProjectInfoTool } from '../src/project-info.js';

function fakeFs(overrides: Partial<FsReadPort> = {}): { fs: FsReadPort; readdirCalls: string[] } {
  const readdirCalls: string[] = [];
  const fs: FsReadPort = {
    readdir: async (path) => {
      readdirCalls.push(path);
      return [];
    },
    readFile: async () => {
      throw new Error('not implemented');
    },
    ...overrides,
  };
  return { fs, readdirCalls };
}

function fakeGit(overrides: Partial<GitReadPort> = {}): {
  git: GitReadPort;
  toplevelCalls: string[];
} {
  const toplevelCalls: string[] = [];
  const git: GitReadPort = {
    toplevel: async (cwd) => {
      toplevelCalls.push(cwd);
      return '/proj';
    },
    status: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    diff: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    log: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    ...overrides,
  };
  return { git, toplevelCalls };
}

describe('createProjectInfoTool — requirements', () => {
  it('requirements({ path: "/dir" }) declara diretório/read com o path informado', () => {
    const { fs } = fakeFs();
    const { git } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/cwd' });
    expect(tool.requirements?.({ path: '/dir' })).toEqual({
      resource: { type: 'directory', path: '/dir' },
      access: 'read',
    });
  });

  it('requirements({}) declara o diretório do cwd fake injetado', () => {
    const { fs } = fakeFs();
    const { git } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/cwd' });
    expect(tool.requirements?.({})).toEqual({
      resource: { type: 'directory', path: '/cwd' },
      access: 'read',
    });
  });

  it('requirements({ path: 42 }) → path: "" (nunca null)', () => {
    const { fs } = fakeFs();
    const { git } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/cwd' });
    const result = tool.requirements?.({ path: 42 });
    expect(result).not.toBeNull();
    expect(result).toEqual({ resource: { type: 'directory', path: '' }, access: 'read' });
  });
});

describe('createProjectInfoTool — alvo inválido', () => {
  it('run({ path: 42 }) → ok:false sem tocar fs nem git', async () => {
    const { fs, readdirCalls } = fakeFs();
    const { git, toplevelCalls } = fakeGit();
    const tool = createProjectInfoTool({ fs, git });
    const result = await tool.run({ path: 42 });
    expect(result.ok).toBe(false);
    expect(readdirCalls).toHaveLength(0);
    expect(toplevelCalls).toHaveLength(0);
  });

  it('run({ path: "  " }) → ok:false sem tocar fs nem git', async () => {
    const { fs, readdirCalls } = fakeFs();
    const { git, toplevelCalls } = fakeGit();
    const tool = createProjectInfoTool({ fs, git });
    const result = await tool.run({ path: '  ' });
    expect(result.ok).toBe(false);
    expect(readdirCalls).toHaveLength(0);
    expect(toplevelCalls).toHaveLength(0);
  });
});

describe('createProjectInfoTool — caminho feliz com git (path omitido)', () => {
  it('ascende ao toplevel, lista a raiz descoberta (não o cwd), relata manifests/ecossistemas/scripts', async () => {
    const readdirCalls: string[] = [];
    const { fs } = fakeFs({
      readdir: async (path) => {
        readdirCalls.push(path);
        return ['package.json', 'tsconfig.json', 'src'];
      },
      readFile: async () => JSON.stringify({ scripts: { build: 'x', test: 'y' } }),
    });
    const { git, toplevelCalls } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/proj/packages/tools' });

    const result = await tool.run({});

    expect(result.ok).toBe(true);
    expect(result.output).toContain('raiz: /proj');
    expect(result.output).toContain('origem da raiz: repositório git');
    expect(result.output).toContain('- package.json (Node.js)');
    expect(result.output).toContain('- tsconfig.json (TypeScript)');
    expect(result.output).toContain('ecossistemas: Node.js, TypeScript');
    expect(result.output).toContain('- build');
    expect(result.output).toContain('- test');
    expect(toplevelCalls).toEqual(['/proj/packages/tools']);
    expect(readdirCalls).toEqual(['/proj']);
  });
});

describe('createProjectInfoTool — path explícito (D11): sem ascensão', () => {
  it('com path explícito dentro de um repo git, git.toplevel tem zero chamadas e a raiz é o alvo declarado', async () => {
    const readdirCalls: string[] = [];
    const { fs } = fakeFs({
      readdir: async (path) => {
        readdirCalls.push(path);
        return ['package.json'];
      },
      readFile: async () => JSON.stringify({ scripts: {} }),
    });
    const { git, toplevelCalls } = fakeGit({ toplevel: async () => '/proj' });
    const tool = createProjectInfoTool({ fs, git });

    const result = await tool.run({ path: '/proj/packages/tools' });

    expect(result.ok).toBe(true);
    expect(toplevelCalls).toHaveLength(0);
    expect(readdirCalls).toEqual(['/proj/packages/tools']);
    expect(result.output).toContain('raiz: /proj/packages/tools');
    expect(result.output).toContain('origem da raiz: diretório informado');
    expect(result.output).not.toContain('repositório git');
  });
});

describe('createProjectInfoTool — degradação (só com path omitido)', () => {
  it('reason "denied" → degrada para o alvo, origem "repositório fora do diretório permitido", readdir no alvo (nunca no toplevel)', async () => {
    const readdirCalls: string[] = [];
    const { fs } = fakeFs({
      readdir: async (path) => {
        readdirCalls.push(path);
        return [];
      },
    });
    const { git } = fakeGit({
      toplevel: async () => {
        throw new GitRootError('fora do diretório permitido: /proj', 'denied');
      },
    });
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/proj/packages/tools' });

    const result = await tool.run({});

    expect(result.ok).toBe(true);
    expect(result.output).toContain('raiz: /proj/packages/tools');
    expect(result.output).toContain(
      'origem da raiz: diretório alvo (repositório fora do diretório permitido)',
    );
    expect(readdirCalls).toEqual(['/proj/packages/tools']);
    expect(readdirCalls).not.toContain('/proj');
  });

  it('reason "no-repository" → origem "diretório alvo (sem repositório git)"', async () => {
    const { fs } = fakeFs({ readdir: async () => [] });
    const { git } = fakeGit({
      toplevel: async () => {
        throw new GitRootError('não foi possível localizar um repositório git', 'no-repository');
      },
    });
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/tmp' });
    const result = await tool.run({});
    expect(result.ok).toBe(true);
    expect(result.output).toContain('raiz: /tmp');
    expect(result.output).toContain('origem da raiz: diretório alvo (sem repositório git)');
  });

  it('reason "resolve-failed" → origem "diretório alvo (falha ao resolver o repositório)"', async () => {
    const { fs } = fakeFs({ readdir: async () => [] });
    const { git } = fakeGit({
      toplevel: async () => {
        throw new GitRootError('não foi possível resolver', 'resolve-failed');
      },
    });
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/tmp' });
    const result = await tool.run({});
    expect(result.ok).toBe(true);
    expect(result.output).toContain(
      'origem da raiz: diretório alvo (falha ao resolver o repositório)',
    );
  });

  it('saída determinística (D12): erro comum sem reason degrada para "falha ao resolver o repositório" e não vaza a mensagem original', async () => {
    const { fs } = fakeFs({ readdir: async () => [] });
    const { git } = fakeGit({
      toplevel: async () => {
        throw new Error('boom: /segredo/fora/da/raiz');
      },
    });
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/tmp' });
    const result = await tool.run({});
    expect(result.ok).toBe(true);
    expect(result.output).toContain(
      'origem da raiz: diretório alvo (falha ao resolver o repositório)',
    );
    expect(result.output).not.toContain('boom');
    expect(result.output).not.toContain('/segredo/fora/da/raiz');
  });

  const CLOSED_ORIGINS = [
    'repositório git',
    'diretório informado',
    'diretório alvo (sem repositório git)',
    'diretório alvo (repositório fora do diretório permitido)',
    'diretório alvo (falha ao resolver o repositório)',
  ];

  it('a linha "origem da raiz:" pertence sempre ao conjunto fechado de cinco strings', async () => {
    const cases: { toplevel: GitReadPort['toplevel']; cwd: () => string }[] = [
      { toplevel: async (cwd) => cwd, cwd: () => '/proj' },
      {
        toplevel: async () => {
          throw new GitRootError('x', 'denied');
        },
        cwd: () => '/proj',
      },
      {
        toplevel: async () => {
          throw new GitRootError('x', 'no-repository');
        },
        cwd: () => '/proj',
      },
      {
        toplevel: async () => {
          throw new GitRootError('x', 'resolve-failed');
        },
        cwd: () => '/proj',
      },
      {
        toplevel: async () => {
          throw new Error('unclassified');
        },
        cwd: () => '/proj',
      },
    ];
    for (const { toplevel, cwd } of cases) {
      const { fs } = fakeFs({ readdir: async () => [] });
      const { git } = fakeGit({ toplevel });
      const tool = createProjectInfoTool({ fs, git, cwd });
      const result = await tool.run({});
      const line = result.output!.split('\n').find((l) => l.startsWith('origem da raiz: '))!;
      const origin = line.slice('origem da raiz: '.length);
      expect(CLOSED_ORIGINS).toContain(origin);
    }
  });
});

describe('createProjectInfoTool — manifests/scripts', () => {
  it('raiz sem manifests reconhecidos → mensagem fixa, sem "ecossistemas:", fs.readFile não chamado', async () => {
    let readFileCalled = false;
    const { fs } = fakeFs({
      readdir: async () => ['README.md', 'src'],
      readFile: async () => {
        readFileCalled = true;
        return '{}';
      },
    });
    const { git } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/proj' });
    const result = await tool.run({ path: '/proj' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('manifests: (nenhum manifest reconhecido na raiz)');
    expect(result.output).not.toContain('ecossistemas:');
    expect(readFileCalled).toBe(false);
  });

  it('sem package.json entre os manifests (ex.: só Cargo.toml) → fs.readFile não chamado, sem seção de scripts', async () => {
    let readFileCalled = false;
    const { fs } = fakeFs({
      readdir: async () => ['Cargo.toml'],
      readFile: async () => {
        readFileCalled = true;
        return '{}';
      },
    });
    const { git } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/proj' });
    const result = await tool.run({ path: '/proj' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('- Cargo.toml (Rust)');
    expect(result.output).not.toContain('scripts (package.json)');
    expect(readFileCalled).toBe(false);
  });

  it('fs.readFile do package.json falhando → ok:true, aviso com motivo, passo não falha', async () => {
    const { fs } = fakeFs({
      readdir: async () => ['package.json'],
      readFile: async () => {
        throw new Error('EACCES: permission denied');
      },
    });
    const { git } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/proj' });
    const result = await tool.run({ path: '/proj' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain(
      'scripts (package.json): (não foi possível ler os scripts: EACCES: permission denied)',
    );
  });

  it('package.json com conteúdo inválido (JSON malformado) → ok:true, aviso com motivo', async () => {
    const { fs } = fakeFs({
      readdir: async () => ['package.json'],
      readFile: async () => '{not json',
    });
    const { git } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/proj' });
    const result = await tool.run({ path: '/proj' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('scripts (package.json): (não foi possível ler os scripts:');
  });

  it('60 scripts → exatamente 50 linhas "- " na seção de scripts, seguidas da linha de truncagem', async () => {
    const entries = Array.from({ length: 60 }, (_, i) => [`script${i}`, 'x'] as const);
    const { fs } = fakeFs({
      readdir: async () => ['package.json'],
      readFile: async () => JSON.stringify({ scripts: Object.fromEntries(entries) }),
    });
    const { git } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/proj' });
    const result = await tool.run({ path: '/proj' });
    expect(result.ok).toBe(true);
    const output = result.output!;
    const scriptsSection = output.slice(output.indexOf('scripts (package.json):'));
    const dashLines = scriptsSection.split('\n').filter((line) => line.startsWith('- '));
    expect(dashLines).toHaveLength(50);
    expect(output).toContain('(lista truncada: 50 de 60 scripts)');
  });

  it('50 ou menos scripts → output não contém "lista truncada"', async () => {
    const { fs } = fakeFs({
      readdir: async () => ['package.json'],
      readFile: async () => JSON.stringify({ scripts: { build: 'x' } }),
    });
    const { git } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/proj' });
    const result = await tool.run({ path: '/proj' });
    expect(result.output).not.toContain('lista truncada');
  });
});

describe('createProjectInfoTool — erro de readdir e nunca lançar', () => {
  it('fs.readdir falhando → ok:false com mensagem contendo a raiz', async () => {
    const { fs } = fakeFs({
      readdir: async () => {
        throw new Error('ENOENT');
      },
    });
    const { git } = fakeGit();
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/proj' });
    const result = await tool.run({});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('/proj');
  });

  it('a Tool nunca lança em nenhum dos casos (asserção resolves)', async () => {
    const { fs } = fakeFs({
      readdir: async () => {
        throw new Error('boom');
      },
    });
    const { git } = fakeGit({
      toplevel: async () => {
        throw new Error('boom2');
      },
    });
    const tool = createProjectInfoTool({ fs, git, cwd: () => '/proj' });
    await expect(tool.run({})).resolves.toBeDefined();
    await expect(tool.run({ path: 42 })).resolves.toBeDefined();
  });
});
