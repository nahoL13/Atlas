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
    const { fact, created } = await svc.remember('prefiro respostas curtas');
    expect(created).toBe(true);
    expect(fact.id).toMatch(/\S/);
    expect(fact.text).toBe('prefiro respostas curtas');
    expect(fact.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(svc.list()).toHaveLength(1);
    expect(storage.saved.at(-1)).toEqual([fact]);
  });

  it('remember(text) sem source grava source "user" (default) — chamador de 1 argumento intacto', async () => {
    const svc = await createMemoryService({ storage: fakeStorage() });
    const { fact } = await svc.remember('fato sem origem explícita');
    expect(fact.source).toBe('user');
  });

  it('remember(text, "learned") grava source "learned"', async () => {
    const svc = await createMemoryService({ storage: fakeStorage() });
    const { fact } = await svc.remember('fato aprendido pelo modelo', 'learned');
    expect(fact.source).toBe('learned');
  });

  it('remember(text, "user") grava source "user" explicitamente', async () => {
    const svc = await createMemoryService({ storage: fakeStorage() });
    const { fact } = await svc.remember('fato explícito', 'user');
    expect(fact.source).toBe('user');
  });

  it('o source é persistido pelo storage (chega ao save)', async () => {
    const storage = fakeStorage();
    const svc = await createMemoryService({ storage });
    const { fact } = await svc.remember('fato aprendido', 'learned');
    expect(storage.saved.at(-1)).toEqual([fact]);
    expect(storage.saved.at(-1)![0]!.source).toBe('learned');
  });

  it('fato carregado de storage sem source (JSON antigo) permanece válido/legível', async () => {
    const svc = await createMemoryService({
      storage: fakeStorage([
        { id: 'legacy1', text: 'fato antigo sem source', createdAt: '2026-01-01T00:00:00.000Z' },
      ]),
    });
    expect(svc.list()).toHaveLength(1);
    expect(svc.list()[0]!.text).toBe('fato antigo sem source');
    expect(svc.list()[0]!.source).toBeUndefined();
  });

  it('forget remove o fato e retorna true; id inexistente retorna false', async () => {
    const storage = fakeStorage();
    const svc = await createMemoryService({ storage });
    const { fact } = await svc.remember('fato x');
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
    const { fact } = await svc.remember('x');
    (svc.list() as Fact[]).pop();
    expect(svc.list()).toHaveLength(1);
    expect(svc.list()[0]!.id).toBe(fact.id);
  });

  describe('deduplicação determinística (SPEC-0022)', () => {
    it('dois textos equivalentes após normalização (caixa/espaço) resultam em um único fato', async () => {
      const svc = await createMemoryService({ storage: fakeStorage() });
      const first = await svc.remember('Meu Nome é Lohan');
      const second = await svc.remember('  meu   nome é lohan  ');

      expect(second.created).toBe(false);
      expect(second.fact.id).toBe(first.fact.id);
      expect(svc.list()).toHaveLength(1);
    });

    it('no-op não chama storage.save na duplicata', async () => {
      const storage = fakeStorage();
      const svc = await createMemoryService({ storage });
      await svc.remember('meu nome é Lohan');
      const savedCallsAfterFirst = storage.saved.length;
      await svc.remember('MEU NOME É LOHAN');
      expect(storage.saved.length).toBe(savedCallsAfterFirst);
    });

    it('no-op não promove source (learned -> user permanece learned)', async () => {
      const svc = await createMemoryService({ storage: fakeStorage() });
      await svc.remember('x', 'learned');
      const { fact, created } = await svc.remember('x', 'user');
      expect(created).toBe(false);
      expect(fact.source).toBe('learned');
    });

    it('no-op não rejeita — a chamada duplicata resolve normalmente', async () => {
      const svc = await createMemoryService({ storage: fakeStorage() });
      await svc.remember('x');
      await expect(svc.remember('x')).resolves.toEqual({
        fact: expect.objectContaining({ text: 'x' }),
        created: false,
      });
    });

    it('fatos textualmente distintos ainda gravam, ambos com created: true', async () => {
      const svc = await createMemoryService({ storage: fakeStorage() });
      const a = await svc.remember('meu nome é Lohan');
      const b = await svc.remember('prefiro TypeScript');
      expect(a.created).toBe(true);
      expect(b.created).toBe(true);
      expect(svc.list()).toHaveLength(2);
    });

    it('acervo legado com duplicatas já presentes é preservado intacto após o load (sem consolidação)', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'meu nome é Lohan', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', text: 'Meu Nome É Lohan', createdAt: '2026-01-02T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      expect(svc.list()).toHaveLength(2);
      expect(storage.saved).toHaveLength(0);
    });
  });
});
