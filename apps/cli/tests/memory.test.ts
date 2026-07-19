import { describe, expect, it } from 'vitest';
import type { AtlasPlatform, Fact } from '@atlas/contracts';
import { runMemoryList } from '../src/commands/memory.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';

function capture(): { output: OutputGateway; text: () => string } {
  const lines: string[] = [];
  return {
    output: { write: (t) => lines.push(t), error: () => {} },
    text: () => lines.join(''),
  };
}

function atlasWithFacts(facts: readonly Fact[]): AtlasPlatform {
  return { memory: { list: () => facts } } as unknown as AtlasPlatform;
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
