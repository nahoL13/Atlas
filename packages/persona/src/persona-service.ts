import type { Persona, PersonaInput, PersonaService } from '@atlas/contracts';
import { PERSONAS, PERSONA_IDS } from './personas.js';
import { PersonaError } from './errors.js';
import type { PersonaStorage } from './storage/persona-storage.js';

const NO_STORAGE_MESSAGE = 'serviço de Persona sem storage: criação/edição indisponível';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveUniqueSlug(name: string, existingIds: Iterable<string>): string {
  const base = slugify(name);
  if (base === '') {
    throw new PersonaError(`Não foi possível derivar um id a partir do nome: "${name}"`);
  }
  const existing = new Set(existingIds);
  if (!existing.has(base)) {
    return base;
  }
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function validateInput(input: PersonaInput): void {
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    throw new PersonaError('name é obrigatório e não pode ser vazio');
  }
  for (const field of ['tone', 'formality', 'language', 'style', 'voice', 'emotion'] as const) {
    if (typeof input[field] !== 'string') {
      throw new PersonaError(`${field} é obrigatório`);
    }
  }
  if (!Array.isArray(input.communicationRules)) {
    throw new PersonaError('communicationRules é obrigatório');
  }
  if (
    input.voiceURI !== undefined &&
    (typeof input.voiceURI !== 'string' || input.voiceURI.trim() === '')
  ) {
    throw new PersonaError('voiceURI, quando presente, não pode ser vazio');
  }
}

function buildPersona(id: string, input: PersonaInput): Persona {
  return {
    id,
    name: input.name,
    tone: input.tone,
    formality: input.formality,
    language: input.language,
    style: input.style,
    communicationRules: [...input.communicationRules],
    voice: input.voice,
    emotion: input.emotion,
    ...(input.voiceURI !== undefined ? { voiceURI: input.voiceURI } : {}),
  };
}

/**
 * Persona Service (ADR-0020(a), molde do Memory Service — ADR-0011):
 * `storage` é **opt-in**. Sem ele, o comportamento é idêntico ao de hoje,
 * byte a byte — só as Personas embutidas, `create`/`update`/`delete`
 * lançam `PersonaError`. Com ele, carrega as Personas custom **uma única
 * vez** na criação (load-once) e persiste imediatamente a cada mutação
 * (write-through). Personas embutidas (`jarvis`/`neutral`) são sempre
 * resolvidas do registro em código — nunca do storage — e são imutáveis:
 * `create`/`update`/`delete` rejeitam operar sobre um `id` embutido.
 */
export function createPersonaService(deps: { storage?: PersonaStorage } = {}): PersonaService {
  const { storage } = deps;
  const custom = new Map<string, Persona>();
  if (storage !== undefined) {
    for (const persona of storage.load()) {
      custom.set(persona.id, persona);
    }
  }

  function persist(): void {
    storage?.save([...custom.values()]);
  }

  function resolve(id: string): Persona | undefined {
    if (Object.hasOwn(PERSONAS, id)) {
      return PERSONAS[id];
    }
    return custom.get(id);
  }

  function requireStorage(): void {
    if (storage === undefined) {
      throw new PersonaError(NO_STORAGE_MESSAGE);
    }
  }

  return {
    get(id: string): Persona {
      const persona = resolve(id);
      if (persona === undefined) {
        throw new PersonaError(`Persona desconhecida: ${id}`);
      }
      return persona;
    },

    has(id: string): boolean {
      return resolve(id) !== undefined;
    },

    list(): readonly string[] {
      return [...PERSONA_IDS, ...custom.keys()];
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

    create(input: PersonaInput): Persona {
      requireStorage();
      validateInput(input);
      const id = deriveUniqueSlug(input.name, [...PERSONA_IDS, ...custom.keys()]);
      const persona = buildPersona(id, input);
      custom.set(id, persona);
      persist();
      return persona;
    },

    update(id: string, input: PersonaInput): Persona {
      requireStorage();
      if (Object.hasOwn(PERSONAS, id)) {
        throw new PersonaError(`Não é possível editar uma Persona embutida: ${id}`);
      }
      if (!custom.has(id)) {
        throw new PersonaError(`Persona desconhecida: ${id}`);
      }
      validateInput(input);
      const persona = buildPersona(id, input);
      custom.set(id, persona);
      persist();
      return persona;
    },

    delete(id: string): void {
      requireStorage();
      if (Object.hasOwn(PERSONAS, id)) {
        throw new PersonaError(`Não é possível apagar uma Persona embutida: ${id}`);
      }
      if (!custom.has(id)) {
        throw new PersonaError(`Persona desconhecida: ${id}`);
      }
      custom.delete(id);
      persist();
    },
  };
}
