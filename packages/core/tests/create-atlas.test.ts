import { describe, expect, it } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import type { Fact, Tool } from '@atlas/contracts';
import type { MemoryStorage } from '@atlas/memory';
import { createPermissionService } from '@atlas/permissions';
import { createRuntime } from '@atlas/runtime';
import type { ConfirmPort } from '@atlas/runtime';
import {
  createDeleteFileTool,
  createReadFileTool,
  createToolRegistry,
  createWriteFileTool,
} from '@atlas/tools';
import type { FsReadPort, FsWritePort } from '@atlas/tools';
import { createAtlas } from '../src/index.js';

function fakeStorage(initial: Fact[] = []): MemoryStorage {
  let facts: Fact[] = [...initial];
  return {
    async load() {
      return [...facts];
    },
    async save(next) {
      facts = [...next];
    },
  };
}

function fullFsWrite(overrides: Partial<FsWritePort> = {}): FsWritePort {
  return {
    writeFile: async () => {},
    deleteFile: async () => {},
    mkdir: async () => {},
    appendFile: async () => {},
    ...overrides,
  };
}

function fakeConfirm(approved: boolean): ConfirmPort {
  return { request: async () => approved };
}

describe('createAtlas', () => {
  it('sobe a plataforma até ready com config mesclada e congelada', async () => {
    const atlas = await createAtlas(
      { config: { logLevel: 'debug' } },
      { memoryStorage: fakeStorage() },
    );
    expect(atlas.state).toBe('ready');
    expect(atlas.config.logLevel).toBe('debug');
    expect(Object.isFrozen(atlas.config)).toBe(true);
    await atlas.shutdown();
  });

  it('desliga com segurança até stopped, com shutdown idempotente', async () => {
    const atlas = await createAtlas({}, { memoryStorage: fakeStorage() });
    await atlas.shutdown();
    expect(atlas.state).toBe('stopped');
    await expect(atlas.shutdown()).resolves.toBeUndefined();
  });

  it('propaga config inválida antes de subir', async () => {
    await expect(createAtlas({ config: { dataDir: '' } })).rejects.toBeInstanceOf(
      InvalidConfigError,
    );
  });

  it('expõe um cognitive que responde via provider fake', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    const answer = await atlas.cognitive.ask('olá');
    expect(answer.text).toBe('[fake] olá');
    await atlas.shutdown();
  });

  it('expõe um context que guarda e devolve a conversa da sessão', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    const initial = atlas.cognitive.startConversation();
    const id = atlas.context.openSession(initial);
    expect(atlas.context.getConversation(id)).toBe(initial);

    const turn = await atlas.cognitive.respond(atlas.context.getConversation(id), 'oi');
    atlas.context.updateConversation(id, turn.conversation);
    expect(atlas.context.getConversation(id)).toBe(turn.conversation);

    await atlas.shutdown();
  });

  it('expõe a Persona ativa (default jarvis) e injeta sua identidade no cognitive', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    expect(atlas.persona.id).toBe('jarvis');
    const conv = atlas.cognitive.startConversation();
    expect(conv.messages[0]!.content).toContain('Jarvis');
    await atlas.shutdown();
  });

  it('seleciona a persona neutral por config', async () => {
    const atlas = await createAtlas(
      { config: { persona: 'neutral', model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    expect(atlas.persona.id).toBe('neutral');
    expect(atlas.cognitive.startConversation().messages[0]!.content).toContain('Assistente');
    await atlas.shutdown();
  });

  it('expõe atlas.memory e injeta os fatos na geração do cognitive', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      {
        memoryStorage: fakeStorage([
          { id: 'a1', text: 'o nome do usuário é Lohan', createdAt: '2026-01-01T00:00:00.000Z' },
        ]),
      },
    );
    expect(atlas.memory.list()).toHaveLength(1);
    const conv = atlas.cognitive.startConversation();
    expect(conv.messages[0]!.content).toContain('o nome do usuário é Lohan');
    await atlas.shutdown();
  });

  it('sem fatos, não injeta bloco de memória no system prompt', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    const content = atlas.cognitive.startConversation().messages[0]!.content;
    expect(content).not.toContain('lembrar os seguintes fatos');
    await atlas.shutdown();
  });

  it('remember persiste via storage e passa a aparecer em list', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    await atlas.memory.remember('prefiro respostas curtas');
    expect(atlas.memory.list().map((fact) => fact.text)).toContain('prefiro respostas curtas');
    await atlas.shutdown();
  });

  it('SPEC-0021: fato gravado via memory.remember aparece no system prompt de uma invocação subsequente do cognitive, na mesma instância', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );

    const before = atlas.cognitive.startConversation().messages[0]!.content;
    expect(before).not.toContain('o nome do usuário é Ana');

    await atlas.memory.remember('o nome do usuário é Ana');

    const after = atlas.cognitive.startConversation().messages[0]!.content;
    expect(after).toContain('o nome do usuário é Ana');
    await atlas.shutdown();
  });

  it('compõe com fsRead e permissions.readRoots injetados sem erro', async () => {
    const fsRead: FsReadPort = {
      readFile: async (path: string) =>
        path === '/repo/README.md' ? '# Projeto' : Promise.reject(new Error('ENOENT')),
      readdir: async () => [],
    };
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' }, permissions: { readRoots: ['/repo'] } } },
      { memoryStorage: fakeStorage(), fsRead },
    );
    expect(atlas.state).toBe('ready');
    await atlas.shutdown();
  });

  it('compõe com fsWrite injetado e resolve writeRoots sem erro', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' }, permissions: { writeRoots: ['/out'] } } },
      { memoryStorage: fakeStorage(), fsWrite: fullFsWrite() },
    );
    expect(atlas.config.permissions.writeRoots).toEqual(['/out']);
    await atlas.shutdown();
  });

  it('read_file lê dentro da raiz permitida e é bloqueada fora dela, sem tocar o fs', async () => {
    const calls: string[] = [];
    const fsRead: FsReadPort = {
      readFile: async (path: string) => {
        calls.push(path);
        return path === '/repo/README.md' ? '# Projeto' : Promise.reject(new Error('ENOENT'));
      },
      readdir: async () => [],
    };
    const permissions = createPermissionService({ readRoots: ['/repo'], writeRoots: [] });
    const registry = createToolRegistry();
    registry.register(createReadFileTool({ fs: fsRead }));
    const runtime = createRuntime({ registry, permissions, confirm: fakeConfirm(true) });

    const ok = await runtime.execute({
      steps: [{ tool: 'read_file', args: { path: '/repo/README.md' } }],
    });
    expect(ok.steps[0]!.result).toEqual({ ok: true, output: '# Projeto' });

    const blocked = await runtime.execute({
      steps: [{ tool: 'read_file', args: { path: '/etc/passwd' } }],
    });
    expect(blocked.steps[0]!.result.ok).toBe(false);
    expect(calls).toEqual(['/repo/README.md']);
  });

  it('write_file escreve dentro da raiz permitida e é bloqueada fora dela, sem tocar o fs', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const fsWrite = fullFsWrite({
      writeFile: async (path: string, content: string) => {
        writes.push({ path, content });
      },
    });
    const permissions = createPermissionService({ readRoots: [], writeRoots: ['/out'] });
    const registry = createToolRegistry();
    registry.register(createWriteFileTool({ fs: fsWrite }));
    const runtime = createRuntime({ registry, permissions, confirm: fakeConfirm(true) });

    const ok = await runtime.execute({
      steps: [{ tool: 'write_file', args: { path: '/out/a.txt', content: 'olá' } }],
    });
    expect(ok.steps[0]!.result).toEqual({ ok: true, output: 'escrito: /out/a.txt' });
    expect(writes).toEqual([{ path: '/out/a.txt', content: 'olá' }]);

    const blocked = await runtime.execute({
      steps: [{ tool: 'write_file', args: { path: '/etc/evil', content: 'x' } }],
    });
    expect(blocked.steps[0]!.result.ok).toBe(false);
    expect(writes).toHaveLength(1);
  });

  it('compõe o ConfirmPort default no Runtime e aceita CreateAtlasDeps.confirm para testes', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage(), confirm: fakeConfirm(true) },
    );
    expect(atlas.state).toBe('ready');
    await atlas.shutdown();
  });

  it('delete_file pede confirmação: aprovado remove, recusado mantém e execução segue', async () => {
    const deleted: string[] = [];
    const fsWrite = fullFsWrite({
      deleteFile: async (path: string) => {
        deleted.push(path);
      },
    });
    const permissions = createPermissionService({ readRoots: [], writeRoots: ['/out'] });
    const registry = createToolRegistry();
    registry.register(createDeleteFileTool({ fs: fsWrite }));
    const after: Tool = {
      name: 'after',
      description: 'x',
      run: async () => ({ ok: true, output: 'after' }),
    };
    registry.register(after);

    const approvedRuntime = createRuntime({
      registry,
      permissions,
      confirm: fakeConfirm(true),
    });
    const approvedResult = await approvedRuntime.execute({
      steps: [{ tool: 'delete_file', args: { path: '/out/a.txt' } }],
    });
    expect(approvedResult.steps[0]!.result).toEqual({ ok: true, output: 'removido: /out/a.txt' });
    expect(deleted).toEqual(['/out/a.txt']);

    const declinedRuntime = createRuntime({
      registry,
      permissions,
      confirm: fakeConfirm(false),
    });
    const declinedResult = await declinedRuntime.execute({
      steps: [
        { tool: 'delete_file', args: { path: '/out/b.txt' } },
        { tool: 'after', args: {} },
      ],
    });
    expect(declinedResult.steps[0]!.result.ok).toBe(false);
    expect(declinedResult.steps[0]!.result.error).toContain('cancelada');
    expect(declinedResult.steps[1]!.result.ok).toBe(true);
    expect(deleted).toEqual(['/out/a.txt']);
  });

  it('SPEC-0025: expõe atlas.skills semeado com >= 1 Skill permanente e atlas.skillBuilder', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    const list = atlas.skills.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((s) => s.scope === 'permanent')).toBe(true);
    expect(atlas.skillBuilder).toBeDefined();
    await atlas.shutdown();
  });

  it('SPEC-0025: skillBuilder.build nunca lança e não registra em falha (provider fake não devolve JSON)', async () => {
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage() },
    );
    const before = atlas.skills.list().length;
    const result = await atlas.skillBuilder.build({ capability: 'somar dois números' });
    expect(result.ok).toBe(false);
    expect(atlas.skills.list().length).toBe(before);
    await atlas.shutdown();
  });

  it('SPEC-0026: fia a projeção do SkillRegistry no Cognitive — a Skill semeada aparece no catálogo oferecido ao Planner', async () => {
    const requestBodies: { messages: { role: string; content: string }[] }[] = [];
    const fetchFake = (async (_url: string, init?: RequestInit) => {
      requestBodies.push(JSON.parse((init?.body as string) ?? '{}'));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
      });
    }) as typeof fetch;
    const atlas = await createAtlas(
      {
        config: {
          model: { provider: 'remote', baseUrl: 'http://fake.local', apiKey: 'k', model: 'gpt' },
        },
      },
      { memoryStorage: fakeStorage(), fetch: fetchFake },
    );
    const seededSkillId = atlas.skills.list().find((s) => s.scope === 'permanent' && s.active)!.id;

    await atlas.cognitive.ask('olá');

    const planningSystem = requestBodies[0]!.messages.find((m) => m.role === 'system')!.content;
    expect(planningSystem).toContain(seededSkillId);
    await atlas.shutdown();
  });
});
