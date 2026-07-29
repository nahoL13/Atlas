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
  /**
   * Voz real do sistema operacional vinculada a esta Persona (ADR-0020(b)),
   * identificada pelo `voiceURI` reportado pela Web Speech API do Chromium.
   * Aditivo/opcional: Personas embutidas (`jarvis`/`neutral`) não a setam.
   * O TTS (`apps/desktop/src/speech-output.ts`) usa esta voz quando ela
   * ainda existir entre as vozes locais correntes; ausente ou não
   * encontrada, cai na seleção determinística já existente (fail-closed,
   * nunca uma voz de rede).
   */
  readonly voiceURI?: string;
}

/**
 * Dado de entrada para `PersonaService.create`/`update` (ADR-0020(a)):
 * todos os campos de `Persona`, exceto `id` (derivado pelo módulo por
 * slug, nunca informado pelo chamador — ver `@atlas/persona`).
 */
export interface PersonaInput {
  readonly name: string;
  readonly tone: string;
  readonly formality: string;
  readonly language: string;
  readonly style: string;
  readonly communicationRules: readonly string[];
  readonly voice: string;
  readonly emotion: string;
  readonly voiceURI?: string;
}

export interface PersonaService {
  get(id: string): Persona;
  has(id: string): boolean;
  list(): readonly string[];
  systemPrompt(persona: Persona): string;
  /** Cria uma Persona custom, derivando o `id` por slug de `input.name`. */
  create(input: PersonaInput): Persona;
  /** Edita uma Persona custom existente, preservando o `id`. Rejeita `id` embutido/inexistente. */
  update(id: string, input: PersonaInput): Persona;
  /** Remove uma Persona custom existente. Rejeita `id` embutido/inexistente. */
  delete(id: string): void;
}
