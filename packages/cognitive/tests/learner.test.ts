import { describe, expect, it } from 'vitest';
import { createLearner } from '../src/learner.js';

const learner = createLearner();

describe('learner.instruction', () => {
  it('assevera a restrição do Artigo 13: apenas o que o usuário afirmou, nunca inventar/inferir', () => {
    const text = learner.instruction();
    expect(text).toContain('afirmou');
    expect(text).toMatch(/infira|inferir/i);
    expect(text).toMatch(/invente|inventar/i);
    expect(text).toContain('JSON');
  });

  it('sem fatos conhecidos: não menciona fatos já preservados nem instrução de não re-propor', () => {
    const text = learner.instruction();
    expect(text).not.toContain('Fatos já conhecidos');
    expect(text).not.toMatch(/NÃO reproponha/i);
  });

  it('com fatos conhecidos (SPEC-0021): lista os fatos e instrui a não re-propor', () => {
    const text = learner.instruction('Fatos: o nome do usuário é Lohan.');
    expect(text).toContain('Fatos: o nome do usuário é Lohan.');
    expect(text).toMatch(/NÃO reproponha/i);
  });

  it('com fatos conhecidos: preserva o Artigo 13 (nunca infere/inventa)', () => {
    const text = learner.instruction('Fatos: X.');
    expect(text).toContain('afirmou');
    expect(text).toMatch(/infira|inferir/i);
    expect(text).toMatch(/invente|inventar/i);
  });

  it('fatos conhecidos vazio (string "") equivale a nenhum fato conhecido', () => {
    const text = learner.instruction('');
    expect(text).not.toContain('Fatos já conhecidos');
    expect(text).not.toMatch(/NÃO reproponha/i);
  });
});

describe('learner.parse', () => {
  it('JSON válido com N fatos (N ≤ 3) → lista com os N textos', () => {
    expect(learner.parse('["mora em São Paulo", "prefere café"]')).toEqual([
      'mora em São Paulo',
      'prefere café',
    ]);
  });

  it('tolera prosa ao redor do array JSON', () => {
    expect(learner.parse('Claro! ["gosta de TypeScript"] pronto')).toEqual(['gosta de TypeScript']);
  });

  it('JSON válido com mais de 3 fatos → truncado em 3 (teto embutido)', () => {
    expect(learner.parse('["a", "b", "c", "d", "e"]')).toEqual(['a', 'b', 'c']);
  });

  it('JSON válido vazio / sem fatos → []', () => {
    expect(learner.parse('[]')).toEqual([]);
  });

  it('saída não-JSON → []', () => {
    expect(learner.parse('não há nada relevante para lembrar')).toEqual([]);
  });

  it('JSON malformado → []', () => {
    expect(learner.parse('["fato incompleto"')).toEqual([]);
  });

  it('formato inesperado (sem array algum na saída) → []', () => {
    expect(learner.parse('{"facts": "nenhum array aqui"}')).toEqual([]);
  });

  it('formato inesperado (array de objetos, não de strings) → []', () => {
    expect(learner.parse('[{"text":"mora em SP"}]')).toEqual([]);
  });

  it('filtra entradas não-string e strings vazias/em branco', () => {
    expect(learner.parse('["fato válido", "", "   ", 42, null]')).toEqual(['fato válido']);
  });
});
