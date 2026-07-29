import { describe, expect, it } from 'vitest';
import { AtlasError } from '@atlas/contracts';
import type { Persona, PersonaInput } from '@atlas/contracts';
import { createPersonaService } from '../src/index.js';
import type { PersonaStorage } from '../src/storage/persona-storage.js';

describe('createPersonaService', () => {
  it('list inclui jarvis e neutral', () => {
    const svc = createPersonaService();
    expect(svc.list()).toEqual(expect.arrayContaining(['jarvis', 'neutral']));
  });

  it('has reconhece personas embutidas e rejeita desconhecidas', () => {
    const svc = createPersonaService();
    expect(svc.has('jarvis')).toBe(true);
    expect(svc.has('neutral')).toBe(true);
    expect(svc.has('nao-existe')).toBe(false);
  });

  it('get(jarvis) retorna a Persona Jarvis', () => {
    const svc = createPersonaService();
    const jarvis = svc.get('jarvis');
    expect(jarvis.id).toBe('jarvis');
    expect(jarvis.name).toBe('Jarvis');
  });

  it('get de persona desconhecida lança AtlasError com code ATLAS_PERSONA', () => {
    const svc = createPersonaService();
    try {
      svc.get('nao-existe');
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(AtlasError);
      expect((e as AtlasError).code).toBe('ATLAS_PERSONA');
    }
  });

  it('get rejeita chaves herdadas de Object.prototype (não confunde com registro)', () => {
    const svc = createPersonaService();
    try {
      svc.get('constructor');
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(AtlasError);
      expect((e as AtlasError).code).toBe('ATLAS_PERSONA');
    }
  });

  it('systemPrompt inclui nome, tom e estilo, e NÃO inclui voz/emoção', () => {
    const svc = createPersonaService();
    const jarvis = svc.get('jarvis');
    const prompt = svc.systemPrompt(jarvis);
    expect(prompt).toContain('Jarvis');
    expect(prompt).toContain(jarvis.tone);
    expect(prompt).toContain(jarvis.style);
    expect(prompt).not.toContain(jarvis.voice);
    expect(prompt).not.toContain(jarvis.emotion);
  });

  describe('não-regressão (ADR-0020: "sem storage, idêntico a hoje")', () => {
    it('sem storage, list() é exatamente [jarvis, neutral]', () => {
      const svc = createPersonaService();
      expect(svc.list()).toEqual(['jarvis', 'neutral']);
    });

    it('sem storage, create/update/delete lançam PersonaError', () => {
      const svc = createPersonaService();
      const input = fullInput();
      expect(() => svc.create(input)).toThrow(AtlasError);
      expect(() => svc.update('jarvis', input)).toThrow(AtlasError);
      expect(() => svc.delete('jarvis')).toThrow(AtlasError);
    });
  });

  describe('storage e CRUD (fake em memória)', () => {
    it('create deriva id por slug, persiste na mesma chamada e aparece em list/get/has', () => {
      const storage = fakeStorage();
      const svc = createPersonaService({ storage });
      const persona = svc.create(fullInput({ name: 'Meu Assistente' }));

      expect(persona.id).toBe('meu-assistente');
      expect(storage.saveCalls).toBe(1);
      expect(svc.list()).toContain('meu-assistente');
      expect(svc.get('meu-assistente')).toEqual(persona);
      expect(svc.has('meu-assistente')).toBe(true);
    });

    it('colisão de slug com custom e com embutida gera -2, -3, …', () => {
      const storage = fakeStorage();
      const svc = createPersonaService({ storage });
      const first = svc.create(fullInput({ name: 'Jarvis' }));
      const second = svc.create(fullInput({ name: 'Jarvis' }));

      expect(first.id).toBe('jarvis-2');
      expect(second.id).toBe('jarvis-3');
    });

    it('create com name vazio/só espaços lança PersonaError e não chama storage.save', () => {
      const storage = fakeStorage();
      const svc = createPersonaService({ storage });
      expect(() => svc.create(fullInput({ name: '   ' }))).toThrow(AtlasError);
      expect(storage.saveCalls).toBe(0);
    });

    it('create com slug colapsando para vazio lança PersonaError e não chama storage.save', () => {
      const storage = fakeStorage();
      const svc = createPersonaService({ storage });
      expect(() => svc.create(fullInput({ name: '###' }))).toThrow(AtlasError);
      expect(storage.saveCalls).toBe(0);
    });

    it('update preserva o id, persiste e reflete em get', () => {
      const storage = fakeStorage();
      const svc = createPersonaService({ storage });
      svc.create(fullInput({ name: 'Minha Persona' }));
      const updated = svc.update('minha-persona', fullInput({ name: 'Renomeada' }));

      expect(updated.id).toBe('minha-persona');
      expect(svc.get('minha-persona').name).toBe('Renomeada');
    });

    it('update/delete sobre jarvis/neutral lançam PersonaError sem chamar storage.save', () => {
      const storage = fakeStorage();
      const svc = createPersonaService({ storage });
      const before = storage.saveCalls;
      expect(() => svc.update('jarvis', fullInput())).toThrow(AtlasError);
      expect(() => svc.delete('neutral')).toThrow(AtlasError);
      expect(storage.saveCalls).toBe(before);
    });

    it('update/delete sobre id inexistente lançam PersonaError sem chamar storage.save', () => {
      const storage = fakeStorage();
      const svc = createPersonaService({ storage });
      const before = storage.saveCalls;
      expect(() => svc.update('nao-existe', fullInput())).toThrow(AtlasError);
      expect(() => svc.delete('nao-existe')).toThrow(AtlasError);
      expect(storage.saveCalls).toBe(before);
    });

    it('delete remove da lista e persiste; um serviço novo sobre o mesmo storage não vê mais a Persona', () => {
      const storage = fakeStorage();
      const svc = createPersonaService({ storage });
      svc.create(fullInput({ name: 'Descartavel' }));
      svc.delete('descartavel');

      expect(svc.has('descartavel')).toBe(false);

      const svc2 = createPersonaService({ storage });
      expect(svc2.has('descartavel')).toBe(false);
    });

    it('voiceURI sobrevive ao round-trip create → save → load → get; sem voiceURI, propriedade não é definida', () => {
      const storage = fakeStorage();
      const svc = createPersonaService({ storage });
      svc.create(fullInput({ name: 'Com Voz', voiceURI: 'voice-1' }));
      svc.create(fullInput({ name: 'Sem Voz' }));

      const svc2 = createPersonaService({ storage });
      expect(svc2.get('com-voz').voiceURI).toBe('voice-1');
      expect(Object.hasOwn(svc2.get('sem-voz'), 'voiceURI')).toBe(false);
    });

    it('systemPrompt de uma Persona custom não menciona voice/voiceURI/emotion', () => {
      const storage = fakeStorage();
      const svc = createPersonaService({ storage });
      const persona = svc.create(
        fullInput({ name: 'Custom', voice: 'voz-descritiva', emotion: 'animado' }),
      );
      const prompt = svc.systemPrompt(persona);
      expect(prompt).not.toContain('voz-descritiva');
      expect(prompt).not.toContain('animado');
      expect(prompt).toContain('Custom');
    });
  });
});

function fullInput(overrides: Partial<PersonaInput> = {}): PersonaInput {
  return {
    name: 'Persona de Teste',
    tone: 'tom',
    formality: 'formalidade',
    language: 'pt-BR',
    style: 'estilo',
    communicationRules: ['regra'],
    voice: 'voz',
    emotion: 'emoção',
    ...overrides,
  };
}

function fakeStorage(): PersonaStorage & { saveCalls: number } {
  let personas: readonly Persona[] = [];
  return {
    saveCalls: 0,
    load(): readonly Persona[] {
      return personas;
    },
    save(next: readonly Persona[]): void {
      personas = next;
      this.saveCalls += 1;
    },
  };
}
