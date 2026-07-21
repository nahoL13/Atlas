import { describe, expect, it } from 'vitest';
import { createPlanner } from '../src/planner.js';

const planner = createPlanner();

describe('planner.instruction', () => {
  it('retorna string vazia quando não há Tools', () => {
    expect(planner.instruction([])).toBe('');
  });

  it('lista nomes/descrições das Tools e menciona o schema de plano', () => {
    const text = planner.instruction([{ name: 'clock', description: 'hora atual' }]);
    expect(text).toContain('clock');
    expect(text).toContain('hora atual');
    expect(text).toContain('steps');
  });
});

describe('planner.instruction com Skills (SPEC-0026/ADR-0018)', () => {
  const tools = [{ name: 'read_file', description: 'lê um arquivo' }];
  const skill = {
    id: 'skill-summarize-text',
    name: 'Resumir texto',
    description: 'resume um texto longo em pontos-chave',
    scope: 'permanent' as const,
    version: '1.0.0',
    active: true,
  };

  it('sem skills, a string é idêntica ao comportamento anterior (sem seção de Skills)', () => {
    expect(planner.instruction(tools)).toBe(planner.instruction(tools, []));
    expect(planner.instruction(tools)).not.toContain('Skills');
  });

  it('lista Skills ativas por id/name/description e pede no máximo uma', () => {
    const text = planner.instruction(tools, [skill]);
    expect(text).toContain('skill-summarize-text');
    expect(text).toContain('Resumir texto');
    expect(text).toContain('resume um texto longo em pontos-chave');
    expect(text).toContain('skillId');
    expect(text).toMatch(/no máximo uma/i);
  });

  it('Skills inativas não aparecem na instrução', () => {
    const text = planner.instruction(tools, [{ ...skill, active: false }]);
    expect(text).not.toContain('skill-summarize-text');
    expect(text).not.toContain('skillId');
  });

  it('sem Tools, retorna string vazia mesmo com Skills (caminho de 1 chamada preservado)', () => {
    expect(planner.instruction([], [skill])).toBe('');
  });
});

describe('planner.parse', () => {
  it('parseia um plano JSON válido', () => {
    const plan = planner.parse('{"steps":[{"tool":"clock","args":{}}]}');
    expect(plan).toEqual({ steps: [{ tool: 'clock', args: {} }] });
  });

  it('tolera prosa ao redor do JSON', () => {
    const plan = planner.parse(
      'Claro! {"steps":[{"tool":"calc","args":{"expression":"2+2"}}]} pronto',
    );
    expect(plan).toEqual({ steps: [{ tool: 'calc', args: { expression: '2+2' } }] });
  });

  it('texto natural sem JSON retorna null', () => {
    expect(planner.parse('Olá, tudo bem?')).toBeNull();
  });

  it('JSON malformado retorna null', () => {
    expect(planner.parse('lixo {não é json} aqui')).toBeNull();
  });

  it('steps vazio retorna null', () => {
    expect(planner.parse('{"steps":[]}')).toBeNull();
  });

  it('plano com Tool desconhecida ainda parseia (o Runtime é quem falha)', () => {
    expect(planner.parse('{"steps":[{"tool":"xyz","args":{}}]}')).toEqual({
      steps: [{ tool: 'xyz', args: {} }],
    });
  });

  it('passo sem args recebe objeto vazio', () => {
    expect(planner.parse('{"steps":[{"tool":"clock"}]}')).toEqual({
      steps: [{ tool: 'clock', args: {} }],
    });
  });

  it('passo sem tool string retorna null', () => {
    expect(planner.parse('{"steps":[{"args":{}}]}')).toBeNull();
  });

  it('lê skillId opcional junto de steps', () => {
    const plan = planner.parse(
      '{"steps":[{"tool":"read_file","args":{}}],"skillId":"skill-summarize-text"}',
    );
    expect(plan).toEqual({
      steps: [{ tool: 'read_file', args: {} }],
      skillId: 'skill-summarize-text',
    });
  });

  it('sem skillId na saída, o Plan não traz o campo', () => {
    const plan = planner.parse('{"steps":[{"tool":"clock","args":{}}]}');
    expect(plan).toEqual({ steps: [{ tool: 'clock', args: {} }] });
    expect(plan).not.toHaveProperty('skillId');
  });

  it('steps vazio continua retornando null mesmo com skillId presente', () => {
    expect(planner.parse('{"steps":[],"skillId":"skill-summarize-text"}')).toBeNull();
  });
});
