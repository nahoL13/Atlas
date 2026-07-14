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
});
