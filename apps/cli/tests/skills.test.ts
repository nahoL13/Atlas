import { describe, expect, it } from 'vitest';
import type { AtlasPlatform, Skill, SkillBuildResult, SkillDescriptor } from '@atlas/contracts';
import { runSkillsList, runSkillsBuild } from '../src/commands/skills.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';

function capture(): { output: OutputGateway; text: () => string } {
  const lines: string[] = [];
  return {
    output: { write: (t) => lines.push(t), error: () => {} },
    text: () => lines.join(''),
  };
}

function atlasWithSkills(descriptors: readonly SkillDescriptor[]): AtlasPlatform {
  return { skills: { list: () => descriptors } } as unknown as AtlasPlatform;
}

function atlasWithBuildResult(result: SkillBuildResult): {
  atlas: AtlasPlatform;
  calls: Array<{ capability: string }>;
} {
  const calls: Array<{ capability: string }> = [];
  const atlas = {
    skillBuilder: {
      build: async (request: { capability: string }) => {
        calls.push(request);
        return result;
      },
    },
  } as unknown as AtlasPlatform;
  return { atlas, calls };
}

const seedDescriptor: SkillDescriptor = {
  id: 'skill-summarize-text',
  name: 'Resumir texto',
  description: 'Produz um resumo conciso',
  scope: 'permanent',
  version: '1.0.0',
  active: true,
};

describe('runSkillsList', () => {
  it('sem Skills, informa que não há nada catalogado', () => {
    const cap = capture();
    runSkillsList(atlasWithSkills([]), cap.output);
    expect(cap.text()).toBe('Nenhuma Skill catalogada.\n');
  });

  it('mostra o catálogo com id, nome, scope, ativo/inativo e versão', () => {
    const cap = capture();
    runSkillsList(atlasWithSkills([seedDescriptor]), cap.output);
    const text = cap.text();
    expect(text).toContain('skill-summarize-text');
    expect(text).toContain('Resumir texto');
    expect(text).toContain('permanent');
    expect(text).toContain('1.0.0');
    expect(text).toContain('ativa');
  });
});

describe('runSkillsBuild', () => {
  it('imprime a Skill produzida em sucesso', async () => {
    const cap = capture();
    const skill: Skill = {
      id: 'tmp-abc',
      name: 'Resumir textos',
      description: 'Resume um texto',
      instructions: 'Seja conciso.',
      toolIds: ['read_file'],
      scope: 'temporary',
      version: '1.0.0',
    };
    const { atlas, calls } = atlasWithBuildResult({ ok: true, skill });
    await runSkillsBuild(atlas, 'resumir arquivos de texto', cap.output);
    expect(calls).toEqual([{ capability: 'resumir arquivos de texto' }]);
    const text = cap.text();
    expect(text).toContain('tmp-abc');
    expect(text).toContain('Resumir textos');
    expect(text).toContain('read_file');
  });

  it('imprime as pendências quando a validação falha', async () => {
    const cap = capture();
    const { atlas } = atlasWithBuildResult({ ok: false, issues: ['Tool desconhecida: "x"'] });
    await runSkillsBuild(atlas, 'algo', cap.output);
    const text = cap.text();
    expect(text).toContain('Não foi possível construir a Skill');
    expect(text).toContain('Tool desconhecida: "x"');
  });
});
