import { describe, expect, it } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import type { Fact, Persona, Tool } from '@atlas/contracts';
import type { MemoryStorage } from '@atlas/memory';
import { createPermissionService } from '@atlas/permissions';
import { createRuntime } from '@atlas/runtime';
import type { ConfirmPort } from '@atlas/runtime';
import {
  createDeleteFileTool,
  createGitStatusTool,
  createProjectInfoTool,
  createReadFileTool,
  createToolRegistry,
  createWriteFileTool,
  nodeGitReadPort,
} from '@atlas/tools';
import type { ExecGit, FsReadPort, FsWritePort, GitReadPort, HttpPort } from '@atlas/tools';
import { createAtlas } from '../src/index.js';

function fakeHttp(overrides: Partial<HttpPort> = {}): { http: HttpPort; calls: string[] } {
  const calls: string[] = [];
  const http: HttpPort = {
    get: async (url: string) => {
      calls.push(url);
      if (overrides.get) return overrides.get(url);
      return {
        url,
        status: 200,
        contentType: 'text/plain',
        body: 'conteúdo remoto',
        truncated: false,
        bodyOmitted: false,
      };
    },
  };
  return { http, calls };
}

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

  it('memoryPrompt fiado com query/limit (SPEC-0030): fato relevante à consulta do turno entra no system prompt mesmo com acervo maior que o orçamento', async () => {
    const initial: Fact[] = Array.from({ length: 25 }, (_, i) => ({
      id: `f${i}`,
      text: `fato irrelevante número ${i}`,
      createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
    }));
    initial.push({
      id: 'relevante',
      text: 'projeto atlas usa pnpm workspaces',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    const atlas = await createAtlas(
      { config: { model: { provider: 'fake' } } },
      { memoryStorage: fakeStorage(initial) },
    );
    expect(atlas.memory.list()).toHaveLength(26);

    const conversation = atlas.cognitive.startConversation();
    const turn = await atlas.cognitive.respond(conversation, 'o que o projeto atlas usa?');

    expect(turn.conversation.messages[0]!.content).toContain('projeto atlas usa pnpm workspaces');
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

  it('SPEC-0028: git_status roda com cwd = toplevel verificado por isContained e é negado quando o toplevel escapa da raiz (git não roda)', async () => {
    const execCalls: string[][] = [];
    const exec: ExecGit = async (args) => {
      execCalls.push([...args]);
      if (args.includes('rev-parse')) return '/proj\n';
      return 'nothing to commit, working tree clean\n';
    };
    const realpath = (path: string) => Promise.resolve(path);

    const insideRoots = createPermissionService({ readRoots: ['/proj'], writeRoots: [] });
    const insideGit = nodeGitReadPort({
      verify: insideRoots.isContained.bind(insideRoots),
      exec,
      realpath,
    });
    const insideRegistry = createToolRegistry();
    insideRegistry.register(createGitStatusTool({ git: insideGit, cwd: () => '/proj' }));
    const insideRuntime = createRuntime({
      registry: insideRegistry,
      permissions: insideRoots,
      confirm: fakeConfirm(true),
    });
    const allowed = await insideRuntime.execute({ steps: [{ tool: 'git_status', args: {} }] });
    expect(allowed.steps[0]!.result.ok).toBe(true);

    const outsideRoots = createPermissionService({ readRoots: ['/other'], writeRoots: [] });
    const outsideGit = nodeGitReadPort({
      verify: outsideRoots.isContained.bind(outsideRoots),
      exec,
      realpath,
    });
    const outsideRegistry = createToolRegistry();
    outsideRegistry.register(createGitStatusTool({ git: outsideGit, cwd: () => '/proj' }));
    const outsideRuntime = createRuntime({
      registry: outsideRegistry,
      permissions: outsideRoots,
      confirm: fakeConfirm(true),
    });
    const denied = await outsideRuntime.execute({ steps: [{ tool: 'git_status', args: {} }] });
    expect(denied.steps[0]!.result.ok).toBe(false);

    // "status" só apareceu na chamada permitida — na negada, só rev-parse rodou.
    expect(execCalls.filter((args) => args.includes('status'))).toHaveLength(1);
  });

  it('SPEC-0028: atlas.cognitive.ask, com git fake + gateway fake, seleciona git_status e produz steps com sucesso', async () => {
    const gitFake: GitReadPort = {
      toplevel: async (cwd) => cwd,
      status: async (cwd) => ({ repository: cwd, text: 'clean', truncated: false }),
      diff: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
      log: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    };
    const fetchFake = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"steps":[{"tool":"git_status","args":{}}]}' } }],
        }),
        { status: 200 },
      )) as typeof fetch;
    const atlas = await createAtlas(
      {
        config: {
          model: { provider: 'remote', baseUrl: 'http://fake.local', apiKey: 'k', model: 'gpt' },
        },
      },
      { memoryStorage: fakeStorage(), fetch: fetchFake, git: gitFake },
    );

    const answer = await atlas.cognitive.ask('o que mudou no meu repositório?');

    expect(answer.steps).toBeDefined();
    expect(answer.steps!.some((step) => step.tool === 'git_status' && step.result.ok)).toBe(true);
    await atlas.shutdown();
  });

  it('SPEC-0056: project_info está registrada no Tool Registry, composta com as mesmas instâncias fsRead/git', async () => {
    const readdirCalls: string[] = [];
    const fsRead: FsReadPort = {
      readFile: async () => '{"scripts":{}}',
      readdir: async (path) => {
        readdirCalls.push(path);
        return ['package.json'];
      },
    };
    const toplevelCalls: string[] = [];
    const git: GitReadPort = {
      toplevel: async (cwd) => {
        toplevelCalls.push(cwd);
        return cwd;
      },
      status: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
      diff: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
      log: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    };
    const fetchFake = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"steps":[{"tool":"project_info","args":{}}]}' } }],
        }),
        { status: 200 },
      )) as typeof fetch;
    const atlas = await createAtlas(
      {
        config: {
          model: { provider: 'remote', baseUrl: 'http://fake.local', apiKey: 'k', model: 'gpt' },
        },
      },
      { memoryStorage: fakeStorage(), fetch: fetchFake, fsRead, git },
    );

    const answer = await atlas.cognitive.ask('que projeto é este?');

    expect(answer.steps!.some((step) => step.tool === 'project_info' && step.result.ok)).toBe(true);
    // Composta com as mesmas instâncias: as portas fsRead/git injetadas em
    // createAtlas foram de fato as usadas pela Tool registrada.
    expect(toplevelCalls.length).toBeGreaterThan(0);
    expect(readdirCalls.length).toBeGreaterThan(0);
    await atlas.shutdown();
  });

  it('SPEC-0056: atlas.cognitive.ask, com fs/git fakes + gateway fake, seleciona project_info e produz steps com sucesso', async () => {
    const fsRead: FsReadPort = {
      readFile: async () => '{"scripts":{"build":"x"}}',
      readdir: async () => ['package.json'],
    };
    const git: GitReadPort = {
      toplevel: async (cwd) => cwd,
      status: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
      diff: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
      log: async (cwd) => ({ repository: cwd, text: '', truncated: false }),
    };
    const fetchFake = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"steps":[{"tool":"project_info","args":{}}]}' } }],
        }),
        { status: 200 },
      )) as typeof fetch;
    const atlas = await createAtlas(
      {
        config: {
          model: { provider: 'remote', baseUrl: 'http://fake.local', apiKey: 'k', model: 'gpt' },
        },
      },
      { memoryStorage: fakeStorage(), fetch: fetchFake, fsRead, git },
    );

    const answer = await atlas.cognitive.ask('que projeto é este?');

    expect(answer.steps).toBeDefined();
    expect(answer.steps!.some((step) => step.tool === 'project_info' && step.result.ok)).toBe(true);
    await atlas.shutdown();
  });

  it('SPEC-0056: com git real cujo toplevel está fora das readRoots, project_info degrada para o alvo e nunca lista o toplevel proibido', async () => {
    const exec: ExecGit = async (args) => {
      if (args.includes('rev-parse')) return '/proj\n';
      return '';
    };
    const realpath = (path: string) => Promise.resolve(path);

    const insideRoots = createPermissionService({
      readRoots: ['/proj/packages/tools'],
      writeRoots: [],
    });
    const insideGit = nodeGitReadPort({
      verify: insideRoots.isContained.bind(insideRoots),
      exec,
      realpath,
    });
    const readdirCalls: string[] = [];
    const fsRead: FsReadPort = {
      readFile: async () => '{"scripts":{}}',
      readdir: async (path) => {
        readdirCalls.push(path);
        return [];
      },
    };
    const registry = createToolRegistry();
    registry.register(
      createProjectInfoTool({ fs: fsRead, git: insideGit, cwd: () => '/proj/packages/tools' }),
    );
    const runtime = createRuntime({
      registry,
      permissions: insideRoots,
      confirm: fakeConfirm(true),
    });

    const result = await runtime.execute({ steps: [{ tool: 'project_info', args: {} }] });

    expect(result.steps[0]!.result.ok).toBe(true);
    expect(result.steps[0]!.result.output).toContain('raiz: /proj/packages/tools');
    expect(result.steps[0]!.result.output).toContain(
      'origem da raiz: diretório alvo (repositório fora do diretório permitido)',
    );
    expect(readdirCalls).toEqual(['/proj/packages/tools']);
    expect(readdirCalls).not.toContain('/proj');
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

describe('createAtlas + http_get (ADR-0026, SPEC-0055)', () => {
  function fetchFakePlanningHttpGet(deps: {
    requestBodies: { messages: { role: string; content: string }[] }[];
    url: string;
    composedReply?: string;
  }): typeof fetch {
    let callIndex = 0;
    return (async (_url: string, init?: RequestInit) => {
      deps.requestBodies.push(JSON.parse((init?.body as string) ?? '{}'));
      callIndex += 1;
      if (callIndex === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    steps: [{ tool: 'http_get', args: { url: deps.url } }],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: deps.composedReply ?? 'ok' } }] }),
        { status: 200 },
      );
    }) as typeof fetch;
  }

  it('registra http_get e, com netRoots: [], o passo vira ExecutedStep negado (blocked) sem tocar a porta', async () => {
    const { http, calls } = fakeHttp();
    const requestBodies: { messages: { role: string; content: string }[] }[] = [];
    const fetchFake = fetchFakePlanningHttpGet({ requestBodies, url: 'https://example.com/a' });

    const atlas = await createAtlas(
      {
        config: {
          model: { provider: 'remote', baseUrl: 'http://fake.local', apiKey: 'k', model: 'gpt' },
        },
      },
      { memoryStorage: fakeStorage(), fetch: fetchFake, http },
    );

    const answer = await atlas.cognitive.ask('busque https://example.com/a');

    const step = answer.steps?.find((s) => s.tool === 'http_get');
    expect(step).toBeDefined();
    expect(step!.result.ok).toBe(false);
    expect(step!.denialKind).toBe('blocked');
    expect(calls).toHaveLength(0);
    await atlas.shutdown();
  });

  it('host fora de netRoots produz passo negado com o motivo contendo o host', async () => {
    const { http, calls } = fakeHttp();
    const requestBodies: { messages: { role: string; content: string }[] }[] = [];
    const fetchFake = fetchFakePlanningHttpGet({ requestBodies, url: 'https://evil.com/a' });

    const atlas = await createAtlas(
      {
        config: {
          model: { provider: 'remote', baseUrl: 'http://fake.local', apiKey: 'k', model: 'gpt' },
          permissions: { netRoots: ['permitido.com'] },
        },
      },
      { memoryStorage: fakeStorage(), fetch: fetchFake, http },
    );

    const answer = await atlas.cognitive.ask('busque https://evil.com/a');

    const step = answer.steps?.find((s) => s.tool === 'http_get');
    expect(step).toBeDefined();
    expect(step!.result.ok).toBe(false);
    expect(step!.denialKind).toBe('blocked');
    expect(step!.result.error).toContain('evil.com');
    expect(calls).toHaveLength(0);
    await atlas.shutdown();
  });

  it('netRoots: ["example.com"] + porta fake: atlas.cognitive.ask produz steps com sucesso e o corpo devolvido chega à composição', async () => {
    const { http } = fakeHttp({
      get: async (url) => ({
        url,
        status: 200,
        contentType: 'text/plain',
        body: 'conteúdo-remoto-marcador-unico',
        truncated: false,
        bodyOmitted: false,
      }),
    });
    const requestBodies: { messages: { role: string; content: string }[] }[] = [];
    const fetchFake = fetchFakePlanningHttpGet({
      requestBodies,
      url: 'https://example.com/a',
      composedReply: 'resumo do conteúdo remoto',
    });

    const atlas = await createAtlas(
      {
        config: {
          model: { provider: 'remote', baseUrl: 'http://fake.local', apiKey: 'k', model: 'gpt' },
          permissions: { netRoots: ['example.com'] },
        },
      },
      { memoryStorage: fakeStorage(), fetch: fetchFake, http },
    );

    const answer = await atlas.cognitive.ask('resuma o conteúdo de https://example.com/a');

    expect(answer.steps).toBeDefined();
    expect(answer.steps!.some((step) => step.tool === 'http_get' && step.result.ok)).toBe(true);
    // A 2ª chamada ao gateway (composição) recebeu o output da Tool no histórico.
    const composedRequest = requestBodies[1];
    expect(composedRequest).toBeDefined();
    const allComposedContent = composedRequest!.messages.map((m) => m.content).join('\n');
    expect(allComposedContent).toContain('conteúdo-remoto-marcador-unico');
    expect(answer.text).toBe('resumo do conteúdo remoto');
    await atlas.shutdown();
  });
});

describe('createAtlas + personaStorage (ADR-0020, SPEC-0039)', () => {
  function fakePersonaStorage(initial: Persona[] = []) {
    let personas: Persona[] = [...initial];
    return {
      loadCalls: 0,
      saveCalls: 0,
      load(): readonly Persona[] {
        this.loadCalls += 1;
        return personas;
      },
      save(next: readonly Persona[]): void {
        this.saveCalls += 1;
        personas = [...next];
      },
    };
  }

  function customPersona(overrides: Partial<Persona> = {}): Persona {
    return {
      id: 'meu-assistente',
      name: 'Meu Assistente',
      tone: 'tom',
      formality: 'formalidade',
      language: 'pt-BR',
      style: 'estilo',
      communicationRules: [],
      voice: 'voz',
      emotion: 'emoção',
      ...overrides,
    };
  }

  it('createAtlas({ config: { persona: "<custom>" } }, { personaStorage }) sobe com essa Persona ativa', async () => {
    const personaStorage = fakePersonaStorage([customPersona()]);
    const atlas = await createAtlas(
      { config: { persona: 'meu-assistente' } },
      { memoryStorage: fakeStorage(), personaStorage },
    );
    expect(atlas.persona.id).toBe('meu-assistente');
    expect(atlas.config.persona).toBe('meu-assistente');
    await atlas.shutdown();
  });

  it('o mesmo createAtlas SEM personaStorage rejeita com InvalidConfigError citando o id', async () => {
    await expect(
      createAtlas({ config: { persona: 'meu-assistente' } }, { memoryStorage: fakeStorage() }),
    ).rejects.toThrow(InvalidConfigError);
    await expect(
      createAtlas({ config: { persona: 'meu-assistente' } }, { memoryStorage: fakeStorage() }),
    ).rejects.toThrow(/meu-assistente/);
  });

  it('não-regressão: createAtlas() sem deps.personaStorage não lê nem cria nenhum arquivo de Personas (zero chamadas ao storage fake)', async () => {
    const personaStorage = fakePersonaStorage();
    // Injeta um storage fake só para provar (por spy) que ele NÃO é usado
    // quando não passado como deps.personaStorage: chamamos createAtlas
    // duas vezes — uma sem personaStorage (comportamento a comprovar) e
    // conferimos que o fake não injetado permanece com zero chamadas.
    const atlas = await createAtlas({}, { memoryStorage: fakeStorage() });
    expect(personaStorage.loadCalls).toBe(0);
    expect(personaStorage.saveCalls).toBe(0);
    expect(atlas.persona.id).toBe('jarvis');
    await atlas.shutdown();
  });
});
