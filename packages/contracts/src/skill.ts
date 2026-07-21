export type SkillScope = 'permanent' | 'temporary';

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly instructions: string; // conhecimento + regras especializados
  readonly toolIds: readonly string[]; // Tools de que depende, por id, como dado
  readonly scope: SkillScope;
  readonly version: string; // simples (ex.: "1.0.0")
}

/**
 * Campos que a geração (gateway.generate) produz. id/version/scope NÃO vêm
 * do modelo — são atribuídos deterministicamente pelo Builder ao completar
 * a Skill.
 */
export interface SkillDraft {
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  readonly toolIds: readonly string[];
}

/** Visão leve para listagem (espelha ToolDescriptor). */
export interface SkillDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly scope: SkillScope;
  readonly version: string;
  readonly active: boolean;
}

export interface SkillRegistry {
  /**
   * Insere/atualiza por id. REJEITA (SkillError) substituir uma Skill
   * `permanent` já registrada — uma `temporary` nunca sobrescreve uma
   * `permanent`.
   */
  register(skill: Skill): void;
  get(id: string): Skill | undefined;
  deactivate(id: string): boolean;
  remove(id: string): boolean;
  list(): readonly SkillDescriptor[];
}

export interface SkillBuildRequest {
  readonly capability: string; // descrição em linguagem natural da capacidade
}

export interface SkillBuildResult {
  readonly ok: boolean;
  readonly skill?: Skill; // presente quando ok
  readonly issues?: readonly string[]; // pendências de validação quando !ok
}

export interface SkillBuilder {
  build(request: SkillBuildRequest): Promise<SkillBuildResult>;
}
