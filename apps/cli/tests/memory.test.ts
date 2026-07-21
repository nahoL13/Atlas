import { describe, expect, it } from 'vitest';
import type { AtlasPlatform, DedupeReport, Fact } from '@atlas/contracts';
import { runMemoryList, runMemoryDedupe, runMemorySearch } from '../src/commands/memory.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';

function capture(): { output: OutputGateway; text: () => string } {
  const lines: string[] = [];
  return {
    output: { write: (t) => lines.push(t), error: () => {} },
    text: () => lines.join(''),
  };
}

function atlasWithFacts(facts: readonly Fact[]): AtlasPlatform {
  return {
    memory: { list: () => facts, dedupe: async () => ({ applied: false, groups: [] }) },
  } as unknown as AtlasPlatform;
}

function atlasWithSearchResults(facts: readonly Fact[]): { atlas: AtlasPlatform; calls: string[] } {
  const calls: string[] = [];
  const atlas = {
    memory: {
      search: (query: string) => {
        calls.push(query);
        return facts;
      },
    },
  } as unknown as AtlasPlatform;
  return { atlas, calls };
}

function atlasWithDedupeReport(report: DedupeReport): {
  atlas: AtlasPlatform;
  calls: Array<{ apply?: boolean }>;
} {
  const calls: Array<{ apply?: boolean }> = [];
  const atlas = {
    memory: {
      dedupe: async (options?: { apply?: boolean }) => {
        calls.push(options ?? {});
        return report;
      },
    },
  } as unknown as AtlasPlatform;
  return { atlas, calls };
}

describe('runMemoryList — origem (SPEC-0020)', () => {
  it('sem fatos, informa que não há nada memorizado', () => {
    const cap = capture();
    runMemoryList(atlasWithFacts([]), cap.output);
    expect(cap.text()).toBe('Nenhum fato memorizado.\n');
  });

  it('exibe a origem "learned" de um fato aprendido', () => {
    const cap = capture();
    runMemoryList(
      atlasWithFacts([
        {
          id: 'a1',
          text: 'mora em São Paulo',
          createdAt: '2026-07-19T00:00:00.000Z',
          source: 'learned',
        },
      ]),
      cap.output,
    );
    expect(cap.text()).toContain('origem: learned');
  });

  it('exibe a origem "user" de um fato explícito', () => {
    const cap = capture();
    runMemoryList(
      atlasWithFacts([
        {
          id: 'a1',
          text: 'meu nome é Lohan',
          createdAt: '2026-07-19T00:00:00.000Z',
          source: 'user',
        },
      ]),
      cap.output,
    );
    expect(cap.text()).toContain('origem: user');
  });

  it('fato sem source (legado) é tratado como "user"', () => {
    const cap = capture();
    runMemoryList(
      atlasWithFacts([{ id: 'a1', text: 'fato antigo', createdAt: '2026-07-19T00:00:00.000Z' }]),
      cap.output,
    );
    expect(cap.text()).toContain('origem: user');
  });
});

describe('runMemorySearch (SPEC-0027)', () => {
  it('sem fatos relevantes, informa que nada foi encontrado', () => {
    const cap = capture();
    const { atlas, calls } = atlasWithSearchResults([]);
    runMemorySearch(atlas, 'aniversário', cap.output);
    expect(calls).toEqual(['aniversário']);
    expect(cap.text()).toBe('Nenhum fato relevante encontrado.\n');
  });

  it('renderiza os fatos recuperados (id + texto)', () => {
    const cap = capture();
    const { atlas } = atlasWithSearchResults([
      { id: 'a1', text: 'aniversário em março', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    runMemorySearch(atlas, 'aniversário', cap.output);
    expect(cap.text()).toContain('[a1]');
    expect(cap.text()).toContain('aniversário em março');
  });
});

describe('runMemoryDedupe (SPEC-0023)', () => {
  const factA: Fact = { id: 'a1', text: 'meu nome é Lohan', createdAt: '2026-01-01T00:00:00.000Z' };
  const factB: Fact = { id: 'a2', text: 'Meu Nome é Lohan', createdAt: '2026-01-02T00:00:00.000Z' };

  it('no-op: sem grupos, imprime "nenhuma duplicata encontrada"', async () => {
    const cap = capture();
    const { atlas } = atlasWithDedupeReport({ applied: false, groups: [] });
    await runMemoryDedupe(atlas, false, cap.output);
    expect(cap.text()).toContain('Nenhuma duplicata encontrada.');
  });

  it('dry-run: lista sobrevivente + duplicata que seria removida, sem confirmar remoção', async () => {
    const cap = capture();
    const { atlas, calls } = atlasWithDedupeReport({
      applied: false,
      groups: [{ survivor: factA, duplicates: [factB] }],
    });
    await runMemoryDedupe(atlas, false, cap.output);
    expect(calls).toEqual([{ apply: false }]);
    expect(cap.text()).toContain(factA.id);
    expect(cap.text()).toContain(factB.id);
    expect(cap.text()).toContain('seria removido');
    expect(cap.text()).toContain('--apply');
  });

  it('apply: confirma o que foi removido', async () => {
    const cap = capture();
    const { atlas, calls } = atlasWithDedupeReport({
      applied: true,
      groups: [{ survivor: factA, duplicates: [factB] }],
    });
    await runMemoryDedupe(atlas, true, cap.output);
    expect(calls).toEqual([{ apply: true }]);
    expect(cap.text()).toContain('removido');
    expect(cap.text()).not.toContain('seria removido');
    expect(cap.text()).toContain('consolidado');
  });
});
