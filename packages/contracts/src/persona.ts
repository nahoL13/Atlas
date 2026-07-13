export interface Persona {
  readonly id: string;
  readonly name: string;
  readonly tone: string;
  readonly formality: string;
  readonly language: string;
  readonly style: string;
  readonly communicationRules: readonly string[];
  readonly voice: string;
  readonly emotion: string;
}

export interface PersonaService {
  get(id: string): Persona;
  has(id: string): boolean;
  list(): readonly string[];
  systemPrompt(persona: Persona): string;
}
