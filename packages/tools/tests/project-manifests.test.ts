import { describe, expect, it } from 'vitest';
import {
  PROJECT_MANIFESTS,
  PROJECT_SCRIPT_LIMIT,
  selectManifests,
  listEcosystems,
  extractPackageScripts,
} from '../src/project-manifests.js';

describe('PROJECT_MANIFESTS', () => {
  it('contém exatamente as 16 linhas da tabela, nessa ordem', () => {
    expect(PROJECT_MANIFESTS.map((manifest) => manifest.file)).toEqual([
      'package.json',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      'deno.json',
      'deno.jsonc',
      'pyproject.toml',
      'requirements.txt',
      'setup.py',
      'Cargo.toml',
      'go.mod',
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      'Gemfile',
      'composer.json',
      'CMakeLists.txt',
    ]);
  });

  it('ecossistema de cada manifest bate com a tabela do Escopo', () => {
    const byFile = Object.fromEntries(
      PROJECT_MANIFESTS.map((manifest) => [manifest.file, manifest.ecosystem]),
    );
    expect(byFile['package.json']).toBe('Node.js');
    expect(byFile['pnpm-workspace.yaml']).toBe('Node.js');
    expect(byFile['tsconfig.json']).toBe('TypeScript');
    expect(byFile['deno.json']).toBe('Deno');
    expect(byFile['deno.jsonc']).toBe('Deno');
    expect(byFile['pyproject.toml']).toBe('Python');
    expect(byFile['requirements.txt']).toBe('Python');
    expect(byFile['setup.py']).toBe('Python');
    expect(byFile['Cargo.toml']).toBe('Rust');
    expect(byFile['go.mod']).toBe('Go');
    expect(byFile['pom.xml']).toBe('Java/JVM');
    expect(byFile['build.gradle']).toBe('Java/JVM');
    expect(byFile['build.gradle.kts']).toBe('Java/JVM');
    expect(byFile['Gemfile']).toBe('Ruby');
    expect(byFile['composer.json']).toBe('PHP');
    expect(byFile['CMakeLists.txt']).toBe('C/C++');
  });
});

describe('selectManifests', () => {
  it('devolve a interseção na ordem da tabela, não na ordem do argumento; ignora entradas não reconhecidas', () => {
    const result = selectManifests(['tsconfig.json', 'README.md', 'package.json']);
    expect(result).toEqual([
      { file: 'package.json', ecosystem: 'Node.js' },
      { file: 'tsconfig.json', ecosystem: 'TypeScript' },
    ]);
  });

  it('casamento sensível a maiúsculas/minúsculas: Package.json não casa com package.json', () => {
    expect(selectManifests(['Package.json'])).toEqual([]);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(selectManifests([])).toEqual([]);
  });
});

describe('listEcosystems', () => {
  it('deduplica preservando a ordem da tabela', () => {
    const manifests = selectManifests(['package.json', 'pnpm-workspace.yaml', 'tsconfig.json']);
    expect(listEcosystems(manifests)).toEqual(['Node.js', 'TypeScript']);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(listEcosystems([])).toEqual([]);
  });
});

describe('extractPackageScripts', () => {
  it('caminho feliz: devolve os nomes das chaves de scripts, truncated:false, total correto', () => {
    expect(extractPackageScripts('{"scripts":{"build":"x","test":"y"}}')).toEqual({
      ok: true,
      scripts: ['build', 'test'],
      truncated: false,
      total: 2,
    });
  });

  it('JSON inválido → ok:false, sem lançar', () => {
    const result = extractPackageScripts('{not json');
    expect(result.ok).toBe(false);
  });

  it('sem a chave scripts → ok:false, sem lançar', () => {
    const result = extractPackageScripts('{"name":"x"}');
    expect(result.ok).toBe(false);
  });

  it('scripts como array → ok:false', () => {
    expect(extractPackageScripts('{"scripts":[]}').ok).toBe(false);
  });

  it('scripts como null → ok:false', () => {
    expect(extractPackageScripts('{"scripts":null}').ok).toBe(false);
  });

  it('scripts como string → ok:false', () => {
    expect(extractPackageScripts('{"scripts":"x"}').ok).toBe(false);
  });

  it('60 scripts → 50 nomes reais, truncated:true, total:60; nenhum item é marcador', () => {
    const entries = Array.from({ length: 60 }, (_, i) => [`script${i}`, 'x'] as const);
    const text = JSON.stringify({ scripts: Object.fromEntries(entries) });
    const result = extractPackageScripts(text);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.scripts).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(result.total).toBe(60);
    for (const name of result.scripts) {
      expect(name.startsWith('script')).toBe(true);
    }
  });

  it('exatamente 50 scripts → truncated:false, 50 nomes', () => {
    const entries = Array.from({ length: 50 }, (_, i) => [`s${i}`, 'x'] as const);
    const text = JSON.stringify({ scripts: Object.fromEntries(entries) });
    const result = extractPackageScripts(text);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.scripts).toHaveLength(50);
    expect(result.truncated).toBe(false);
    expect(result.total).toBe(50);
  });

  it('49 scripts → truncated:false', () => {
    const entries = Array.from({ length: 49 }, (_, i) => [`s${i}`, 'x'] as const);
    const text = JSON.stringify({ scripts: Object.fromEntries(entries) });
    const result = extractPackageScripts(text);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.truncated).toBe(false);
  });

  it(`PROJECT_SCRIPT_LIMIT é ${PROJECT_SCRIPT_LIMIT}`, () => {
    expect(PROJECT_SCRIPT_LIMIT).toBe(50);
  });
});
