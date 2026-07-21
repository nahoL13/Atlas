import { describe, expect, it } from 'vitest';
import type {
  GenerateRequest,
  GenerateResult,
  ModelGateway,
  Tool,
  ToolRegistry,
} from '@atlas/contracts';
import { createSkillBuilder } from '../src/skill-builder.js';
import { createSkillRegistry } from '../src/skill-registry.js';

function fakeGateway(text: string): ModelGateway & { calls: GenerateRequest[] } {
  const calls: GenerateRequest[] = [];
  return {
    calls,
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      calls.push(request);
      return { text };
    },
  };
}

function fakeToolRegistry(names: readonly string[]): ToolRegistry {
  const tools = new Map<string, Tool>(
    names.map((name) => [name, { name, description: name, run: async () => ({ ok: true }) }]),
  );
  return {
    register: (tool) => tools.set(tool.name, tool),
    get: (name) => tools.get(name),
    has: (name) => tools.has(name),
    list: () => [...tools.values()],
  };
}

describe('createSkillBuilder', () => {
  it('em sucesso, chama gateway.generate uma vez, completa id/version/scope e registra', async () => {
    const gateway = fakeGateway(
      JSON.stringify({
        name: 'Resumir textos',
        description: 'Resume um texto',
        instructions: 'Seja conciso.',
        toolIds: ['read_file'],
      }),
    );
    const registry = createSkillRegistry();
    const tools = fakeToolRegistry(['read_file']);
    const builder = createSkillBuilder({ gateway, registry, tools });

    const result = await builder.build({ capability: 'resumir arquivos de texto' });

    expect(gateway.calls).toHaveLength(1);
    expect(result.ok).toBe(true);
    expect(result.skill?.scope).toBe('temporary');
    expect(result.skill?.id.startsWith('tmp-')).toBe(true);
    expect(result.skill?.version).toBe('1.0.0');
    expect(result.skill?.name).toBe('Resumir textos');
    expect(result.skill?.toolIds).toEqual(['read_file']);
    expect(registry.get(result.skill!.id)).toEqual(result.skill);
    expect(registry.list().some((d) => d.id === result.skill!.id)).toBe(true);
  });

  it('falha por toolId inexistente: {ok:false, issues}, sem registrar', async () => {
    const gateway = fakeGateway(
      JSON.stringify({
        name: 'X',
        description: 'Y',
        instructions: 'Z',
        toolIds: ['ferramenta_inexistente'],
      }),
    );
    const registry = createSkillRegistry();
    const tools = fakeToolRegistry(['read_file']);
    const builder = createSkillBuilder({ gateway, registry, tools });

    const result = await builder.build({ capability: 'algo' });

    expect(result.ok).toBe(false);
    expect(result.issues?.length).toBeGreaterThan(0);
    expect(registry.list()).toHaveLength(0);
  });

  it('falha por JSON não parseável: {ok:false, issues}, sem lançar', async () => {
    const gateway = fakeGateway('isto não é json nenhum');
    const registry = createSkillRegistry();
    const tools = fakeToolRegistry([]);
    const builder = createSkillBuilder({ gateway, registry, tools });

    const result = await builder.build({ capability: 'algo' });

    expect(result.ok).toBe(false);
    expect(result.issues?.length).toBeGreaterThan(0);
    expect(registry.list()).toHaveLength(0);
  });

  it('falha por SkillDraft malformado (name vazio)', async () => {
    const gateway = fakeGateway(
      JSON.stringify({ name: '', description: 'd', instructions: 'i', toolIds: [] }),
    );
    const registry = createSkillRegistry();
    const builder = createSkillBuilder({ gateway, registry, tools: fakeToolRegistry([]) });

    const result = await builder.build({ capability: 'algo' });

    expect(result.ok).toBe(false);
    expect(registry.list()).toHaveLength(0);
  });

  it('falha por SkillDraft malformado (toolIds não-array)', async () => {
    const gateway = fakeGateway(
      JSON.stringify({ name: 'n', description: 'd', instructions: 'i', toolIds: 'nope' }),
    );
    const registry = createSkillRegistry();
    const builder = createSkillBuilder({ gateway, registry, tools: fakeToolRegistry([]) });

    const result = await builder.build({ capability: 'algo' });

    expect(result.ok).toBe(false);
    expect(registry.list()).toHaveLength(0);
  });

  it('nunca produz/registra permanent mesmo se o modelo tentar injetar scope/id', async () => {
    const gateway = fakeGateway(
      JSON.stringify({
        name: 'n',
        description: 'd',
        instructions: 'i',
        toolIds: [],
        scope: 'permanent',
        id: 'skill-forjada',
      }),
    );
    const registry = createSkillRegistry();
    const builder = createSkillBuilder({ gateway, registry, tools: fakeToolRegistry([]) });

    const result = await builder.build({ capability: 'algo sem tools' });

    expect(result.ok).toBe(true);
    expect(result.skill?.scope).toBe('temporary');
    expect(result.skill?.id).not.toBe('skill-forjada');
    expect(result.skill?.id.startsWith('tmp-')).toBe(true);
  });

  it('toolIds vazio é aceito quando a capacidade não exige Tools', async () => {
    const gateway = fakeGateway(
      JSON.stringify({ name: 'n', description: 'd', instructions: 'i', toolIds: [] }),
    );
    const registry = createSkillRegistry();
    const builder = createSkillBuilder({ gateway, registry, tools: fakeToolRegistry([]) });

    const result = await builder.build({ capability: 'puramente de conhecimento' });

    expect(result.ok).toBe(true);
    expect(result.skill?.toolIds).toEqual([]);
  });
});
