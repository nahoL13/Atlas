import { describe, expect, it } from 'vitest';
import type { Skill } from '@atlas/contracts';
import { createSkillRegistry } from '../src/index.js';
import { SkillError } from '../src/errors.js';

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-a',
    name: 'Skill A',
    description: 'desc',
    instructions: 'instructions',
    toolIds: [],
    scope: 'temporary',
    version: '1.0.0',
    ...overrides,
  };
}

describe('createSkillRegistry', () => {
  it('carrega as Skills embutidas passadas na criação; list() as retorna como SkillDescriptor[]', () => {
    const seed = skill({ id: 'seed-1', scope: 'permanent' });
    const registry = createSkillRegistry({ skills: [seed] });
    expect(registry.list()).toEqual([
      {
        id: 'seed-1',
        name: seed.name,
        description: seed.description,
        scope: 'permanent',
        version: seed.version,
        active: true,
      },
    ]);
  });

  it('register insere uma Skill nova por id; get retorna a Skill completa', () => {
    const registry = createSkillRegistry();
    const s = skill();
    registry.register(s);
    expect(registry.get('skill-a')).toEqual(s);
  });

  it('get de id inexistente retorna undefined', () => {
    const registry = createSkillRegistry();
    expect(registry.get('nope')).toBeUndefined();
  });

  it('register atualiza uma Skill existente de mesmo scope (temporary)', () => {
    const registry = createSkillRegistry();
    registry.register(skill({ version: '1.0.0' }));
    registry.register(skill({ version: '2.0.0' }));
    expect(registry.get('skill-a')?.version).toBe('2.0.0');
  });

  it('register rejeita substituir uma Skill permanent já registrada por outra de id igual', () => {
    const registry = createSkillRegistry({ skills: [skill({ scope: 'permanent' })] });
    expect(() => registry.register(skill({ scope: 'temporary' }))).toThrow(SkillError);
    // Catálogo não muta.
    expect(registry.get('skill-a')?.scope).toBe('permanent');
  });

  it('register rejeita registrar uma permanent sobre um id temporary já existente', () => {
    const registry = createSkillRegistry({ skills: [skill({ scope: 'temporary' })] });
    expect(() => registry.register(skill({ scope: 'permanent' }))).toThrow(SkillError);
    expect(registry.get('skill-a')?.scope).toBe('temporary');
  });

  it('deactivate marca inativa e retorna true/false conforme a Skill existir', () => {
    const registry = createSkillRegistry({ skills: [skill()] });
    expect(registry.deactivate('skill-a')).toBe(true);
    expect(registry.list()[0]?.active).toBe(false);
    expect(registry.deactivate('nope')).toBe(false);
  });

  it('remove remove e retorna true/false conforme a Skill existir', () => {
    const registry = createSkillRegistry({ skills: [skill()] });
    expect(registry.remove('skill-a')).toBe(true);
    expect(registry.get('skill-a')).toBeUndefined();
    expect(registry.remove('skill-a')).toBe(false);
  });

  it('list distingue scope e estado ativo/inativo por Skill', () => {
    const registry = createSkillRegistry({
      skills: [skill({ id: 'p', scope: 'permanent' }), skill({ id: 't', scope: 'temporary' })],
    });
    registry.deactivate('t');
    const list = registry.list();
    expect(list.find((d) => d.id === 'p')).toMatchObject({ scope: 'permanent', active: true });
    expect(list.find((d) => d.id === 't')).toMatchObject({ scope: 'temporary', active: false });
  });
});
