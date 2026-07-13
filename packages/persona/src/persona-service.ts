import type { Persona, PersonaService } from '@atlas/contracts';
import { PERSONAS, PERSONA_IDS } from './personas.js';
import { PersonaError } from './errors.js';

export function createPersonaService(): PersonaService {
  return {
    get(id: string): Persona {
      const persona = PERSONAS[id];
      if (persona === undefined || !Object.hasOwn(PERSONAS, id)) {
        throw new PersonaError(`Persona desconhecida: ${id}`);
      }
      return persona;
    },
    has(id: string): boolean {
      return Object.hasOwn(PERSONAS, id);
    },
    list(): readonly string[] {
      return PERSONA_IDS;
    },
    systemPrompt(persona: Persona): string {
      const parts = [
        `Você é ${persona.name}.`,
        `Tom: ${persona.tone}.`,
        `Formalidade: ${persona.formality}.`,
        `Idioma: ${persona.language}.`,
        `Estilo: ${persona.style}.`,
      ];
      if (persona.communicationRules.length > 0) {
        parts.push(`Regras de comunicação: ${persona.communicationRules.join(' ')}`);
      }
      return parts.join(' ');
    },
  };
}
