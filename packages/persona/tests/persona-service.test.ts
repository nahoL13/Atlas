import { describe, expect, it } from 'vitest';
import { AtlasError } from '@atlas/contracts';
import { createPersonaService } from '../src/index.js';

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
});
