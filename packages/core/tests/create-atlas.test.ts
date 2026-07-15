import { describe, expect, it } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import type { Fact } from '@atlas/contracts';
import type { MemoryStorage } from '@atlas/memory';
import { createPermissionService } from '@atlas/permissions';
import { createRuntime } from '@atlas/runtime';
import { createReadFileTool, createToolRegistry } from '@atlas/tools';
import type { FsReadPort } from '@atlas/tools';
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

  it('read_file lê dentro da raiz permitida e é bloqueada fora dela, sem tocar o fs', async () => {
    const calls: string[] = [];
    const fsRead: FsReadPort = {
      readFile: async (path: string) => {
        calls.push(path);
        return path === '/repo/README.md' ? '# Projeto' : Promise.reject(new Error('ENOENT'));
      },
      readdir: async () => [],
    };
    const permissions = createPermissionService({ readRoots: ['/repo'] });
    const registry = createToolRegistry();
    registry.register(createReadFileTool({ fs: fsRead }));
    const runtime = createRuntime({ registry, permissions });

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
});
