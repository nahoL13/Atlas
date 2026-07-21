import type { Skill, SkillDescriptor, SkillRegistry } from '@atlas/contracts';
import { SkillError } from './errors.js';

interface Entry {
  readonly skill: Skill;
  active: boolean;
}

export interface CreateSkillRegistryOptions {
  readonly skills?: readonly Skill[];
}

function toDescriptor(entry: Entry): SkillDescriptor {
  return {
    id: entry.skill.id,
    name: entry.skill.name,
    description: entry.skill.description,
    scope: entry.skill.scope,
    version: entry.skill.version,
    active: entry.active,
  };
}

/**
 * Catálogo em memória de Skills (ADR-0017), no molde de `createToolRegistry`
 * (SPEC-0010). Sem IO, sem persistência. `register` faz upsert por `id`, mas
 * **rejeita** substituir uma Skill `permanent` já registrada — uma
 * `temporary` nunca sobrescreve uma `permanent`, e uma tentativa de
 * registrar uma `permanent` sobre um `id` `temporary` existente também é
 * rejeitada (mesma trava: substituir por `permanent` exige remoção
 * explícita antes, nunca upsert implícito).
 */
export function createSkillRegistry(options: CreateSkillRegistryOptions = {}): SkillRegistry {
  const entries = new Map<string, Entry>();
  for (const skill of options.skills ?? []) {
    entries.set(skill.id, { skill, active: true });
  }

  return {
    register(skill: Skill): void {
      const existing = entries.get(skill.id);
      if (
        existing !== undefined &&
        (existing.skill.scope === 'permanent' || skill.scope === 'permanent')
      ) {
        throw new SkillError(
          `não é permitido substituir a Skill permanente "${skill.id}" via register`,
        );
      }
      entries.set(skill.id, { skill, active: true });
    },

    get(id: string): Skill | undefined {
      return entries.get(id)?.skill;
    },

    deactivate(id: string): boolean {
      const entry = entries.get(id);
      if (entry === undefined) {
        return false;
      }
      entry.active = false;
      return true;
    },

    remove(id: string): boolean {
      return entries.delete(id);
    },

    list(): readonly SkillDescriptor[] {
      return [...entries.values()].map(toDescriptor);
    },
  };
}
