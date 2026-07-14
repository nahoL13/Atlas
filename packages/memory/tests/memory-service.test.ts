import { describe, expect, it } from 'vitest';
import type { Fact } from '@atlas/contracts';
import type { MemoryStorage } from '../src/index.js';
import { createMemoryService } from '../src/index.js';

function fakeStorage(initial: Fact[] = []): MemoryStorage & { saved: Fact[][] } {
  let facts: Fact[] = [...initial];
  const saved: Fact[][] = [];
  return {
    saved,
    async load() {
      return [...facts];
    },
    async save(next) {
      facts = [...next];
      saved.push([...next]);
    },
  };
}

describe('createMemoryService', () => {
  it('carrega os fatos do storage na criação', async () => {
    const svc = await createMemoryService({
      storage: fakeStorage([
        { id: 'a1', text: 'meu nome é Lohan', createdAt: '2026-01-01T00:00:00.000Z' },
      ]),
    });
    expect(svc.list()).toHaveLength(1);
    expect(svc.list()[0]!.text).toBe('meu nome é Lohan');
  });

  it('remember gera um Fact e persiste via storage.save', async () => {
    const storage = fakeStorage();
    const svc = await createMemoryService({ storage });
    const fact = await svc.remember('prefiro respostas curtas');
    expect(fact.id).toMatch(/\S/);
    expect(fact.text).toBe('prefiro respostas curtas');
    expect(fact.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(svc.list()).toHaveLength(1);
    expect(storage.saved.at(-1)).toEqual([fact]);
  });

  it('forget remove o fato e retorna true; id inexistente retorna false', async () => {
    const storage = fakeStorage();
    const svc = await createMemoryService({ storage });
    const fact = await svc.remember('fato x');
    expect(await svc.forget('nao-existe')).toBe(false);
    expect(await svc.forget(fact.id)).toBe(true);
    expect(svc.list()).toHaveLength(0);
    expect(storage.saved.at(-1)).toEqual([]);
  });

  it('prompt retorna undefined quando vazio e enquadra os fatos quando há', async () => {
    const svc = await createMemoryService({ storage: fakeStorage() });
    expect(svc.prompt()).toBeUndefined();
    await svc.remember('meu nome é Lohan');
    await svc.remember('prefiro TypeScript');
    const prompt = svc.prompt();
    expect(prompt).toContain('meu nome é Lohan');
    expect(prompt).toContain('prefiro TypeScript');
  });

  it('list devolve uma cópia defensiva', async () => {
    const svc = await createMemoryService({ storage: fakeStorage() });
    const fact = await svc.remember('x');
    (svc.list() as Fact[]).pop();
    expect(svc.list()).toHaveLength(1);
    expect(svc.list()[0]!.id).toBe(fact.id);
  });
});
