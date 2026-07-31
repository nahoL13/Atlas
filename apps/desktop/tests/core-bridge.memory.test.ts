import { describe, expect, it, vi } from 'vitest';
import { useTmpDir } from './helpers/core-bridge-harness.js';

const { baseOverride } = useTmpDir();

describe('resolveMemorySnapshot/forgetFact', () => {
  it('acervo vazio ⇒ []', async () => {
    const { resolveMemorySnapshot } = await import('../src/core-bridge.js');
    const facts = await resolveMemorySnapshot({ configOverride: baseOverride() });

    expect(facts).toEqual([]);
  });

  it('devolve FactSnapshot[] plano e serializável, com source/category resolvidos aos defaults', async () => {
    const { createAtlas } = await import('@atlas/core');
    const override = baseOverride();
    const seeder = await createAtlas({ config: override });
    await seeder.memory.remember('fato do usuário', undefined, undefined);
    await seeder.memory.remember('fato aprendido', 'learned');
    await seeder.memory.remember('fato de projeto', 'user', {
      category: 'project',
      subject: 'atlas',
    });
    await seeder.shutdown();

    const { resolveMemorySnapshot } = await import('../src/core-bridge.js');
    const facts = await resolveMemorySnapshot({ configOverride: override });

    expect(facts).toHaveLength(3);
    expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);

    const userFact = facts.find((fact) => fact.text === 'fato do usuário');
    expect(userFact).toMatchObject({ source: 'user', category: 'fact' });
    expect(userFact?.subject).toBeUndefined();

    const learnedFact = facts.find((fact) => fact.text === 'fato aprendido');
    expect(learnedFact).toMatchObject({ source: 'learned', category: 'fact' });

    const projectFact = facts.find((fact) => fact.text === 'fato de projeto');
    expect(projectFact).toMatchObject({ source: 'user', category: 'project', subject: 'atlas' });
  });

  it('chama createAtlas e atlas.shutdown() exatamente uma vez por chamada', async () => {
    let shutdownSpy: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      shutdownSpy = vi.fn<() => Promise<void>>(atlas.shutdown.bind(atlas));
      atlas.shutdown = shutdownSpy;
      return atlas;
    });

    const { resolveMemorySnapshot } = await import('../src/core-bridge.js');
    await resolveMemorySnapshot({ configOverride: baseOverride() });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(shutdownSpy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('forgetFact de um id existente devolve true e o fato some de uma resolveMemorySnapshot subsequente', async () => {
    const { createAtlas } = await import('@atlas/core');
    const override = baseOverride();
    const seeder = await createAtlas({ config: override });
    const { fact } = await seeder.memory.remember('fato a esquecer');
    await seeder.shutdown();

    const { forgetFact, resolveMemorySnapshot } = await import('../src/core-bridge.js');
    const removed = await forgetFact(fact.id, { configOverride: override });
    expect(removed).toBe(true);

    const facts = await resolveMemorySnapshot({ configOverride: override });
    expect(facts.find((snapshot) => snapshot.id === fact.id)).toBeUndefined();
  });

  it('forgetFact de um id inexistente devolve false sem lançar', async () => {
    const { forgetFact } = await import('../src/core-bridge.js');
    const removed = await forgetFact('id-inexistente', { configOverride: baseOverride() });

    expect(removed).toBe(false);
  });

  it('forgetFact chama createAtlas e atlas.shutdown() exatamente uma vez por chamada', async () => {
    let shutdownSpy: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      shutdownSpy = vi.fn<() => Promise<void>>(atlas.shutdown.bind(atlas));
      atlas.shutdown = shutdownSpy;
      return atlas;
    });

    const { forgetFact } = await import('../src/core-bridge.js');
    await forgetFact('id-qualquer', { configOverride: baseOverride() });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(shutdownSpy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
