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

  describe('dedupe — consolidação determinística do acervo legado (SPEC-0023)', () => {
    it('agrupa fatos equivalentes por normalização; fato distinto fora do grupo', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'Meu Nome é Lohan', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', text: 'prefiro TS', createdAt: '2026-01-02T00:00:00.000Z' },
        { id: 'a3', text: '  meu   nome é lohan ', createdAt: '2026-01-03T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      const report = await svc.dedupe();
      expect(report.groups).toHaveLength(1);
      const [group] = report.groups;
      const ids = [group!.survivor.id, ...group!.duplicates.map((d) => d.id)].sort();
      expect(ids).toEqual(['a1', 'a3']);
    });

    it('sobrevivente é o mais antigo por createdAt; id preservado', async () => {
      const storage = fakeStorage([
        { id: 'old', text: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'new', text: 'X', createdAt: '2026-05-01T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      const report = await svc.dedupe();
      expect(report.groups[0]!.survivor.id).toBe('old');
      expect(report.groups[0]!.duplicates.map((d) => d.id)).toEqual(['new']);
    });

    it('empate de createdAt desempata pela ordem de carga (menor índice)', async () => {
      const storage = fakeStorage([
        { id: 'first', text: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'second', text: 'X', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      const report = await svc.dedupe();
      expect(report.groups[0]!.survivor.id).toBe('first');
    });

    it('dry-run (sem apply) não chama save nem muta list()', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', text: 'X', createdAt: '2026-01-02T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      const report = await svc.dedupe();
      expect(report.applied).toBe(false);
      expect(report.groups).toHaveLength(1);
      expect(storage.saved).toHaveLength(0);
      expect(svc.list()).toHaveLength(2);
    });

    it('dedupe({apply:false}) explícito também não persiste', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', text: 'X', createdAt: '2026-01-02T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      const report = await svc.dedupe({ apply: false });
      expect(report.applied).toBe(false);
      expect(storage.saved).toHaveLength(0);
    });

    it('--apply persiste 1x e remove as duplicatas, preservando ordem de carga', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b1', text: 'distinto', createdAt: '2026-01-02T00:00:00.000Z' },
        { id: 'a2', text: 'X', createdAt: '2026-01-03T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      const report = await svc.dedupe({ apply: true });
      expect(report.applied).toBe(true);
      expect(storage.saved).toHaveLength(1);
      expect(svc.list().map((f) => f.id)).toEqual(['a1', 'b1']);
    });

    it('no-op sem duplicatas: groups vazio, save não chamado mesmo com apply:true', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', text: 'y', createdAt: '2026-01-02T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      const report = await svc.dedupe({ apply: true });
      expect(report.groups).toHaveLength(0);
      expect(report.applied).toBe(false);
      expect(storage.saved).toHaveLength(0);
      expect(svc.list()).toHaveLength(2);
    });

    it('source e text do sobrevivente preservados; colisão user/learned não promove', async () => {
      const storage = fakeStorage([
        { id: 'u1', text: 'x', createdAt: '2026-01-01T00:00:00.000Z', source: 'user' },
        { id: 'l1', text: 'X', createdAt: '2026-01-02T00:00:00.000Z', source: 'learned' },
      ]);
      const svc = await createMemoryService({ storage });
      const report = await svc.dedupe({ apply: true });
      const survivor = svc.list()[0]!;
      expect(survivor.id).toBe('u1');
      expect(survivor.source).toBe('user');
      expect(survivor.text).toBe('x');
      expect(report.groups[0]!.survivor.source).toBe('user');
    });

    it('idempotência: rodar apply duas vezes, a segunda é no-op', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', text: 'X', createdAt: '2026-01-02T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      await svc.dedupe({ apply: true });
      expect(storage.saved).toHaveLength(1);
      const second = await svc.dedupe({ apply: true });
      expect(second.groups).toHaveLength(0);
      expect(second.applied).toBe(false);
      expect(storage.saved).toHaveLength(1);
    });
  });

  describe('search — recuperação determinística por relevância (SPEC-0027)', () => {
    it('devolve apenas fatos com ao menos um token em comum, ordenados por overlap decrescente', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'só março', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', text: 'prefiro TypeScript', createdAt: '2026-01-02T00:00:00.000Z' },
        {
          id: 'a3',
          text: 'aniversário em março de verdade',
          createdAt: '2026-01-03T00:00:00.000Z',
        },
      ]);
      const svc = await createMemoryService({ storage });
      const results = svc.search('aniversário em março de verdade');
      expect(results.map((f) => f.id)).toEqual(['a3', 'a1']);
    });

    it('fatos sem token em comum são excluídos', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'prefiro TypeScript', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      expect(svc.search('aniversário')).toEqual([]);
    });

    it('empate de score é desempatado pela ordem de carga (índice ascendente)', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'gosta de café', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', text: 'gosta de chá', createdAt: '2026-01-02T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      expect(svc.search('gosta').map((f) => f.id)).toEqual(['a1', 'a2']);
    });

    it('options.limit limita o resultado aos N primeiros já ordenados', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'gosta de café', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', text: 'gosta de chá', createdAt: '2026-01-02T00:00:00.000Z' },
        { id: 'a3', text: 'gosta de suco', createdAt: '2026-01-03T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      expect(svc.search('gosta', { limit: 2 }).map((f) => f.id)).toEqual(['a1', 'a2']);
    });

    it('sem limit, devolve todos os fatos com overlap > 0', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'gosta de café', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', text: 'gosta de chá', createdAt: '2026-01-02T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      expect(svc.search('gosta')).toHaveLength(2);
    });

    it('consulta vazia ou só espaços devolve []', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'gosta de café', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      expect(svc.search('')).toEqual([]);
      expect(svc.search('   ')).toEqual([]);
    });

    it('não realiza IO: storage fake com save/load que lançam após a criação', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'gosta de café', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      const guardedStorage = {
        load: () => {
          throw new Error('load não deveria ser chamado por search');
        },
        save: () => {
          throw new Error('save não deveria ser chamado por search');
        },
      };
      Object.assign(storage, guardedStorage);
      expect(() => svc.search('café')).not.toThrow();
    });

    it('não muta facts: list() inalterado antes/depois; chamadas repetidas de search são iguais', async () => {
      const storage = fakeStorage([
        { id: 'a1', text: 'gosta de café', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
      const svc = await createMemoryService({ storage });
      const listBefore = svc.list();
      const first = svc.search('café');
      const second = svc.search('café');
      expect(svc.list()).toEqual(listBefore);
      expect(first).toEqual(second);
    });
  });
});
