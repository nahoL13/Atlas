import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeChatSessionIfOpen, useTmpDir } from './helpers/core-bridge-harness.js';

const { path: tmpDir, baseOverride } = useTmpDir();

function approvingConfirmGrant() {
  return { request: vi.fn(async () => true) };
}

function refusingConfirmGrant() {
  return { request: vi.fn(async () => false) };
}

/** Abre e fecha um servidor TCP efêmero para obter uma porta fechada real. */
async function closedPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

describe('configuração de rede/busca (selectNetworkAccess/selectedNetworkAccess)', () => {
  afterEach(async () => {
    const { __resetBridgeStateForTests } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
  });

  it('estado inicial: selectedNetworkAccess() é undefined; resolveStatusSnapshot reporta os defaults', async () => {
    const { resolveStatusSnapshot, selectedNetworkAccess } = await import('../src/core-bridge.js');
    expect(selectedNetworkAccess()).toBeUndefined();
    const status = await resolveStatusSnapshot(baseOverride());
    expect(status.netRoots).toEqual([]);
    expect(status.searchUrl).toBe('');
  });

  it('feliz, rede: confirmGrant é chamado exatamente uma vez com o NetworkGrantRequest exato; resolveStatusSnapshot subsequente reporta netRoots/searchUrl', async () => {
    const { resolveStatusSnapshot, selectNetworkAccess } = await import('../src/core-bridge.js');
    const confirmGrant = approvingConfirmGrant();

    const selection = await selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: '' },
      { confirmGrant },
    );
    expect(selection).toEqual({ netRoots: ['exemplo.com'], searchUrl: '', closedSessions: [] });
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);
    expect(confirmGrant.request).toHaveBeenCalledWith({
      host: 'exemplo.com',
      scope: 'host',
      duration: 'session',
    });

    const status = await resolveStatusSnapshot(baseOverride());
    expect(status.netRoots).toEqual(['exemplo.com']);
    expect(status.searchUrl).toBe('');
  });

  it('feliz, busca: resolve sem chamar confirmGrant (D4); resolveStatusSnapshot subsequente reporta o searchUrl', async () => {
    const { resolveStatusSnapshot, selectNetworkAccess } = await import('../src/core-bridge.js');
    const confirmGrant = approvingConfirmGrant();

    const selection = await selectNetworkAccess(
      { netRoots: [], searchUrl: 'https://busca.exemplo.com/search' },
      { confirmGrant },
    );
    expect(selection.searchUrl).toBe('https://busca.exemplo.com/search');
    expect(confirmGrant.request).not.toHaveBeenCalled();

    const status = await resolveStatusSnapshot(baseOverride());
    expect(status.searchUrl).toBe('https://busca.exemplo.com/search');
  });

  it('desativar busca: aplicar searchUrl vazio sobre uma seleção com busca configurada resolve sem diálogo; status volta a searchUrl vazio', async () => {
    const { resolveStatusSnapshot, selectNetworkAccess } = await import('../src/core-bridge.js');
    const confirmGrant = approvingConfirmGrant();

    await selectNetworkAccess(
      { netRoots: [], searchUrl: 'https://busca.exemplo.com/search' },
      { confirmGrant },
    );
    await selectNetworkAccess({ netRoots: [], searchUrl: '' }, { confirmGrant });
    expect(confirmGrant.request).not.toHaveBeenCalled();

    const status = await resolveStatusSnapshot(baseOverride());
    expect(status.searchUrl).toBe('');
  });

  it('recusa fail-closed: rejeita, nada é aplicado (inclusive o searchUrl pedido na mesma chamada), nenhuma sessão viva é encerrada, status reporta o estado anterior', async () => {
    const {
      openChatSession,
      sendChatTurn,
      resolveStatusSnapshot,
      selectNetworkAccess,
      selectedNetworkAccess,
    } = await import('../src/core-bridge.js');

    await selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: '' },
      { confirmGrant: approvingConfirmGrant() },
    );
    const session = await openChatSession({ configOverride: baseOverride() });
    try {
      const confirmGrant = refusingConfirmGrant();
      await expect(
        selectNetworkAccess(
          { netRoots: ['exemplo.com', 'outro.com'], searchUrl: 'https://busca.exemplo.com/search' },
          { confirmGrant },
        ),
      ).rejects.toThrow(/recusad/);

      expect(selectedNetworkAccess()).toEqual({ netRoots: ['exemplo.com'], searchUrl: '' });
      const status = await resolveStatusSnapshot(baseOverride());
      expect(status.netRoots).toEqual(['exemplo.com']);
      expect(status.searchUrl).toBe('');

      const turn = await sendChatTurn(session, 'oi');
      expect(turn.reply).toBe('[fake] oi');
    } finally {
      await closeChatSessionIfOpen(session);
    }
  });

  it('sem confirmGrant injetado: pedir um host novo rejeita pelo mesmo caminho (default fail-closed)', async () => {
    const { selectNetworkAccess } = await import('../src/core-bridge.js');
    await expect(selectNetworkAccess({ netRoots: ['exemplo.com'], searchUrl: '' })).rejects.toThrow(
      /recusad/,
    );
  });

  it('host já autorizado não reconfirma; remover um host também não confirma', async () => {
    const { selectNetworkAccess } = await import('../src/core-bridge.js');
    const confirmGrant = approvingConfirmGrant();

    await selectNetworkAccess({ netRoots: ['exemplo.com'], searchUrl: '' }, { confirmGrant });
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);

    await selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: 'https://busca.exemplo.com/search' },
      { confirmGrant },
    );
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);

    await selectNetworkAccess({ netRoots: [], searchUrl: '' }, { confirmGrant });
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);
  });

  it('novidade é case-insensitive contra a seleção corrente (D6)', async () => {
    const { selectNetworkAccess, selectedNetworkAccess, __resetBridgeStateForTests } =
      await import('../src/core-bridge.js');
    const confirmGrant = approvingConfirmGrant();

    await selectNetworkAccess({ netRoots: ['exemplo.com'], searchUrl: '' }, { confirmGrant });
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);

    await selectNetworkAccess({ netRoots: ['EXEMPLO.COM'], searchUrl: '' }, { confirmGrant });
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);
    expect(selectedNetworkAccess()?.netRoots).toHaveLength(1);

    await selectNetworkAccess({ netRoots: ['Exemplo.Com'], searchUrl: '' }, { confirmGrant });
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);
    expect(selectedNetworkAccess()?.netRoots).toHaveLength(1);

    // simetricamente: autorizado EXEMPLO.com primeiro, exemplo.com depois não reconfirma
    __resetBridgeStateForTests();
    const confirmGrant2 = approvingConfirmGrant();
    await selectNetworkAccess(
      { netRoots: ['EXEMPLO.com'], searchUrl: '' },
      { confirmGrant: confirmGrant2 },
    );
    expect(confirmGrant2.request).toHaveBeenCalledTimes(1);
    await selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: '' },
      { confirmGrant: confirmGrant2 },
    );
    expect(confirmGrant2.request).toHaveBeenCalledTimes(1);

    // um host de fato novo na mesma chamada continua abrindo exatamente um diálogo
    await selectNetworkAccess(
      { netRoots: ['exemplo.com', 'outro.com'], searchUrl: '' },
      { confirmGrant: confirmGrant2 },
    );
    expect(confirmGrant2.request).toHaveBeenCalledTimes(2);
  });

  it('normalização (D6): trim/descarte de vazio/dedup case-insensitive preservando a primeira grafia; confirmGrant recebe a grafia preservada', async () => {
    const { selectNetworkAccess } = await import('../src/core-bridge.js');
    let receivedHost: string | undefined;
    const confirmGrant = {
      request: vi.fn(async (grant: { host: string }) => {
        receivedHost = grant.host;
        return true;
      }),
    };

    const selection = await selectNetworkAccess(
      { netRoots: [' exemplo.com ', 'exemplo.com', 'EXEMPLO.com', ''], searchUrl: '' },
      { confirmGrant },
    );
    expect(selection.netRoots).toEqual(['exemplo.com']);
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);
    expect(receivedHost).toBe('exemplo.com');
  });

  it('validação por dry-run (D5): hostname/URL inválidos rejeitam com a mensagem do core, sem chamar confirmGrant nem efeito colateral', async () => {
    const { selectNetworkAccess, selectedNetworkAccess } = await import('../src/core-bridge.js');
    const invalidCandidates = [
      { netRoots: ['https://exemplo.com'], searchUrl: '' },
      { netRoots: ['exemplo.com/x'], searchUrl: '' },
      { netRoots: ['a b'], searchUrl: '' },
      { netRoots: [], searchUrl: 'ftp://x' },
      { netRoots: [], searchUrl: 'https://x/s?q=1' },
    ];

    for (const candidate of invalidCandidates) {
      const confirmGrant = approvingConfirmGrant();
      await expect(selectNetworkAccess(candidate, { confirmGrant })).rejects.toThrow();
      expect(confirmGrant.request).not.toHaveBeenCalled();
      expect(selectedNetworkAccess()).toBeUndefined();
    }
  });

  it('o dry-run compõe o candidato pela mesma função da aplicação real (D5/D9): carrega a Persona selecionada — um candidato sem ela falharia por personaIds', async () => {
    const { selectPersona, selectNetworkAccess } = await import('../src/core-bridge.js');
    // Catálogo restrito, SEM 'jarvis'/'neutral': se `composeOverride` não
    // carregasse a Persona selecionada no candidato do dry-run, o campo
    // `persona` cairia no default 'jarvis' — que este catálogo NÃO contém,
    // e o dry-run rejeitaria. Resolver com sucesso prova a composição real.
    const restrictedPersonaService = {
      get: (id: string) => ({ id, name: `Fake ${id}` }) as never,
      has: (id: string) => id === 'somente-esta',
      list: () => ['somente-esta'],
      systemPrompt: () => '',
      create: () => {
        throw new Error('não usado neste teste');
      },
      update: () => {
        throw new Error('não usado neste teste');
      },
      delete: () => {
        throw new Error('não usado neste teste');
      },
    };

    await selectPersona('somente-esta', { personaService: restrictedPersonaService });
    const confirmGrant = approvingConfirmGrant();
    const selection = await selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: '' },
      { confirmGrant, personaService: restrictedPersonaService },
    );
    expect(selection.netRoots).toEqual(['exemplo.com']);
  });

  it('deps.personaService/deps.configOverride no dry-run: usa o personaService injetado, sem tocar o personas.json real', async () => {
    const { selectNetworkAccess } = await import('../src/core-bridge.js');
    const listSpy = vi.fn(() => ['fake-persona']);
    const fakePersonaService = {
      get: (id: string) => ({ id, name: `Fake ${id}` }) as never,
      has: (id: string) => id === 'fake-persona',
      list: listSpy,
      systemPrompt: () => '',
      create: () => {
        throw new Error('não usado neste teste');
      },
      update: () => {
        throw new Error('não usado neste teste');
      },
      delete: () => {
        throw new Error('não usado neste teste');
      },
    };

    const confirmGrant = approvingConfirmGrant();
    const selection = await selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: '' },
      {
        confirmGrant,
        personaService: fakePersonaService,
        configOverride: {
          persona: 'fake-persona',
          model: { provider: 'fake' },
          dataDir: tmpDir(),
          memory: { path: join(tmpDir(), 'memory.json') },
        },
      },
    );
    expect(selection.netRoots).toEqual(['exemplo.com']);
    expect(listSpy).toHaveBeenCalled();
  });

  it('verificação estrutural: loadConfig só é chamado em core-bridge.ts com o retorno de composeOverride/withSelections', async () => {
    const source = await readFile(new URL('../src/core-bridge.ts', import.meta.url), 'utf8');
    const calls = [...source.matchAll(/loadConfig\(\s*(\w+)\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const [, callee] of calls) {
      expect(['withSelections', 'composeOverride']).toContain(callee);
    }
  });

  it('verificação estrutural: nenhum arquivo tocado por esta SPEC contém regra de formato de hostname/URL nem `new URL` (exclui renderer/vendor)', async () => {
    const files = [
      '../src/core-bridge.ts',
      '../src/network-grant-dialog.ts',
      '../src/main.ts',
      '../src/renderer/renderer.js',
    ];
    for (const relative of files) {
      const source = await readFile(new URL(relative, import.meta.url), 'utf8');
      expect(source).not.toContain('new URL(');
      expect(source).not.toContain('INVALID_HOST_CHARS');
    }
    const preloadSource = await readFile(new URL('../src/preload.cjs', import.meta.url), 'utf8');
    expect(preloadSource).not.toContain('new URL(');
  });

  it('turno de chat em voo bloqueia a aplicação (rejeição, seleção inalterada, nenhum confirmGrant solicitado) e o turno conclui íntegro; a aplicação passa a ser aceita depois', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    function ollamaResponse(content: string): Response {
      return new Response(JSON.stringify({ message: { content } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return ollamaResponse('oi, tudo bem?');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    try {
      const { openChatSession, sendChatTurn, selectNetworkAccess, selectedNetworkAccess } =
        await import('../src/core-bridge.js');

      const session = await openChatSession({
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });

      const turnPromise = sendChatTurn(session, 'oi');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const confirmGrant = approvingConfirmGrant();
      await expect(
        selectNetworkAccess({ netRoots: ['exemplo.com'], searchUrl: '' }, { confirmGrant }),
      ).rejects.toThrow(/andamento/);
      expect(selectedNetworkAccess()).toBeUndefined();
      expect(confirmGrant.request).not.toHaveBeenCalled();

      releaseFirstCall();
      const turn = await turnPromise;
      expect(turn.reply).toBe('oi, tudo bem?');

      const selection = await selectNetworkAccess(
        { netRoots: ['exemplo.com'], searchUrl: '' },
        { confirmGrant: approvingConfirmGrant() },
      );
      expect(selection.netRoots).toEqual(['exemplo.com']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('ask em voo bloqueia a aplicação (rejeição, seleção inalterada, nenhum confirmGrant solicitado) e o ask conclui íntegro; a aplicação passa a ser aceita depois', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseFirstCall: () => void = () => {};
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });

    function ollamaResponse(content: string): Response {
      return new Response(JSON.stringify({ message: { content } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstCallGate;
        return ollamaResponse('oi, tudo bem?');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    try {
      const { resolveAskSnapshot, selectNetworkAccess, selectedNetworkAccess } =
        await import('../src/core-bridge.js');

      const askPromise = resolveAskSnapshot('oi', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const confirmGrant = approvingConfirmGrant();
      await expect(
        selectNetworkAccess({ netRoots: ['exemplo.com'], searchUrl: '' }, { confirmGrant }),
      ).rejects.toThrow(/andamento/);
      expect(selectedNetworkAccess()).toBeUndefined();
      expect(confirmGrant.request).not.toHaveBeenCalled();

      releaseFirstCall();
      const snapshot = await askPromise;
      expect(snapshot.text).toBe('oi, tudo bem?');

      const selection = await selectNetworkAccess(
        { netRoots: ['exemplo.com'], searchUrl: '' },
        { confirmGrant: approvingConfirmGrant() },
      );
      expect(selection.netRoots).toEqual(['exemplo.com']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('A7: uma operação iniciada durante o confirmGrant (já aprovado) também bloqueia a aplicação — nada aplicado, nenhuma sessão encerrada', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    let releaseAskCall: () => void = () => {};
    const askGate = new Promise<void>((resolve) => {
      releaseAskCall = resolve;
    });

    function ollamaResponse(content: string): Response {
      return new Response(JSON.stringify({ message: { content } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    globalThis.fetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await askGate;
        return ollamaResponse('oi, tudo bem?');
      }
      return ollamaResponse('[]');
    }) as typeof fetch;

    try {
      const { openChatSession, resolveAskSnapshot, selectNetworkAccess, selectedNetworkAccess } =
        await import('../src/core-bridge.js');

      const session = await openChatSession({ configOverride: baseOverride() });

      let askPromise: Promise<unknown> | undefined;
      const confirmGrant = {
        request: vi.fn(async () => {
          askPromise = resolveAskSnapshot('oi durante o diálogo', {
            configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
          });
          await new Promise((resolve) => setTimeout(resolve, 0));
          return true;
        }),
      };

      await expect(
        selectNetworkAccess({ netRoots: ['exemplo.com'], searchUrl: '' }, { confirmGrant }),
      ).rejects.toThrow(/andamento/);
      expect(selectedNetworkAccess()).toBeUndefined();

      releaseAskCall();
      await expect(askPromise).resolves.toMatchObject({ text: 'oi, tudo bem?' });

      const { sendChatTurn } = await import('../src/core-bridge.js');
      const turn = await sendChatTurn(session, 'ainda viva?');
      expect(turn.reply).toBe('[fake] ainda viva?');

      await closeChatSessionIfOpen(session);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sessões vivas: aplicação bem-sucedida devolve a SessionId ociosa em closedSessions, tornando-a inutilizável; sem sessões, closedSessions é []', async () => {
    const { openChatSession, sendChatTurn, selectNetworkAccess } =
      await import('../src/core-bridge.js');

    const noSessions = await selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: '' },
      { confirmGrant: approvingConfirmGrant() },
    );
    expect(noSessions.closedSessions).toEqual([]);

    const session = await openChatSession({ configOverride: baseOverride() });
    const selection = await selectNetworkAccess(
      { netRoots: ['exemplo.com', 'outro.com'], searchUrl: '' },
      { confirmGrant: approvingConfirmGrant() },
    );

    expect(selection.closedSessions).toEqual([session]);
    await expect(sendChatTurn(session, 'oi de novo')).rejects.toThrow();
  });

  it('precedência (bloco completo, D9): configOverride.permissions explícito do chamador vence; parcial não recebe merge da rede (netRoots cai no default)', async () => {
    const { resolveStatusSnapshot, selectNetworkAccess } = await import('../src/core-bridge.js');

    await selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: '' },
      { confirmGrant: approvingConfirmGrant() },
    );

    const overridden = await resolveStatusSnapshot(
      baseOverride({
        permissions: { readRoots: [tmpDir()], writeRoots: [], netRoots: ['outro.com'] },
      }),
    );
    expect(overridden.netRoots).toEqual(['outro.com']);

    const partial = await resolveStatusSnapshot(
      baseOverride({ permissions: { readRoots: [tmpDir()] } }),
    );
    expect(partial.netRoots).toEqual([]);

    // o mesmo vale para `tools`
    await selectNetworkAccess({ netRoots: [], searchUrl: 'https://busca.exemplo.com/search' });
    const toolsOverridden = await resolveStatusSnapshot(baseOverride({ tools: { searchUrl: '' } }));
    expect(toolsOverridden.searchUrl).toBe('');
  });

  it('coexistência com a SPEC-0038: FS + rede aplicadas simultaneamente aparecem juntas no status', async () => {
    const { resolveStatusSnapshot, selectPermissionRoots, selectNetworkAccess } =
      await import('../src/core-bridge.js');

    await selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [] });
    await selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: 'https://busca.exemplo.com/search' },
      { confirmGrant: approvingConfirmGrant() },
    );

    const status = await resolveStatusSnapshot(baseOverride());
    expect(status.readRoots).toEqual([tmpDir()]);
    expect(status.writeRoots).toEqual([]);
    expect(status.netRoots).toEqual(['exemplo.com']);
    expect(status.searchUrl).toBe('https://busca.exemplo.com/search');
  });

  it('mutex de política — rede bloqueia FS (D16): confirmGrant de escrita nunca é chamado; nada aplicado; liberado o diálogo de rede, ambos voltam a ser aceitos', async () => {
    const { selectPermissionRoots, selectNetworkAccess, selectedPermissionRoots } =
      await import('../src/core-bridge.js');

    let releaseNetGrant: (granted: boolean) => void = () => {};
    const netGate = new Promise<boolean>((resolve) => {
      releaseNetGrant = resolve;
    });
    const confirmGrantNetwork = { request: vi.fn(() => netGate) };

    const networkPromise = selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: '' },
      { confirmGrant: confirmGrantNetwork },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const confirmGrantFs = approvingConfirmGrant();
    await expect(
      selectPermissionRoots(
        { readRoots: [tmpDir()], writeRoots: [tmpDir()] },
        { confirmGrant: confirmGrantFs },
      ),
    ).rejects.toThrow(/andamento/);
    expect(confirmGrantFs.request).not.toHaveBeenCalled();
    expect(selectedPermissionRoots()).toBeUndefined();

    releaseNetGrant(true);
    const selection = await networkPromise;
    expect(selection.netRoots).toEqual(['exemplo.com']);

    const fsSelection = await selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [] });
    expect(fsSelection.readRoots).toEqual([tmpDir()]);
  });

  it('mutex de política — FS bloqueia rede (D16): confirmGrant de rede nunca é chamado; nada aplicado', async () => {
    const { selectPermissionRoots, selectNetworkAccess, selectedNetworkAccess } =
      await import('../src/core-bridge.js');

    let releaseFsGrant: (granted: boolean) => void = () => {};
    const fsGate = new Promise<boolean>((resolve) => {
      releaseFsGrant = resolve;
    });
    const confirmGrantFs = { request: vi.fn(() => fsGate) };

    const fsPromise = selectPermissionRoots(
      { readRoots: [tmpDir()], writeRoots: [tmpDir()] },
      { confirmGrant: confirmGrantFs },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const confirmGrantNetwork = approvingConfirmGrant();
    await expect(
      selectNetworkAccess(
        { netRoots: ['exemplo.com'], searchUrl: '' },
        { confirmGrant: confirmGrantNetwork },
      ),
    ).rejects.toThrow(/andamento/);
    expect(confirmGrantNetwork.request).not.toHaveBeenCalled();
    expect(selectedNetworkAccess()).toBeUndefined();

    releaseFsGrant(true);
    const fsSelection = await fsPromise;
    expect(fsSelection.readRoots).toEqual([tmpDir()]);
  });

  it('mutex de política — reentrância do próprio gesto (D16): duas chamadas concorrentes, a 2ª rejeita de imediato, sem 2º diálogo', async () => {
    const { selectNetworkAccess, selectPermissionRoots } = await import('../src/core-bridge.js');

    let releaseFirst: (granted: boolean) => void = () => {};
    const firstGate = new Promise<boolean>((resolve) => {
      releaseFirst = resolve;
    });
    const firstConfirmGrant = { request: vi.fn(() => firstGate) };

    const firstPromise = selectNetworkAccess(
      { netRoots: ['exemplo.com'], searchUrl: '' },
      { confirmGrant: firstConfirmGrant },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const secondConfirmGrant = approvingConfirmGrant();
    await expect(
      selectNetworkAccess(
        { netRoots: ['outro.com'], searchUrl: '' },
        { confirmGrant: secondConfirmGrant },
      ),
    ).rejects.toThrow(/andamento/);
    expect(secondConfirmGrant.request).not.toHaveBeenCalled();

    releaseFirst(true);
    await firstPromise;

    // idem para duas selectPermissionRoots concorrentes
    let releaseFirstFs: (granted: boolean) => void = () => {};
    const firstFsGate = new Promise<boolean>((resolve) => {
      releaseFirstFs = resolve;
    });
    const firstFsGrant = { request: vi.fn(() => firstFsGate) };

    const firstFsPromise = selectPermissionRoots(
      { readRoots: [tmpDir()], writeRoots: [tmpDir()] },
      { confirmGrant: firstFsGrant },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const secondFsGrant = approvingConfirmGrant();
    await expect(
      selectPermissionRoots(
        { readRoots: [tmpDir()], writeRoots: [tmpDir()] },
        { confirmGrant: secondFsGrant },
      ),
    ).rejects.toThrow(/andamento/);
    expect(secondFsGrant.request).not.toHaveBeenCalled();

    releaseFirstFs(true);
    await firstFsPromise;
  });

  it('mutex liberado em todos os caminhos de saída (D16): rejeição por validação, por operação em voo, por consentimento recusado e por sucesso — a aplicação seguinte é sempre aceita; __resetBridgeStateForTests também libera', async () => {
    const { selectNetworkAccess, __resetBridgeStateForTests } =
      await import('../src/core-bridge.js');

    // 1. rejeição por validação
    await expect(
      selectNetworkAccess(
        { netRoots: ['a b'], searchUrl: '' },
        { confirmGrant: approvingConfirmGrant() },
      ),
    ).rejects.toThrow();
    await expect(
      selectNetworkAccess(
        { netRoots: ['exemplo.com'], searchUrl: '' },
        { confirmGrant: approvingConfirmGrant() },
      ),
    ).resolves.toBeDefined();
    __resetBridgeStateForTests();

    // 2. rejeição por consentimento recusado
    await expect(
      selectNetworkAccess(
        { netRoots: ['exemplo.com'], searchUrl: '' },
        { confirmGrant: refusingConfirmGrant() },
      ),
    ).rejects.toThrow(/recusad/);
    await expect(
      selectNetworkAccess(
        { netRoots: ['exemplo.com'], searchUrl: '' },
        { confirmGrant: approvingConfirmGrant() },
      ),
    ).resolves.toBeDefined();
    __resetBridgeStateForTests();

    // 3. sucesso — aplicação seguinte segue aceita
    await expect(
      selectNetworkAccess(
        { netRoots: ['exemplo.com'], searchUrl: '' },
        { confirmGrant: approvingConfirmGrant() },
      ),
    ).resolves.toBeDefined();
    await expect(
      selectNetworkAccess(
        { netRoots: ['exemplo.com', 'outro.com'], searchUrl: '' },
        { confirmGrant: approvingConfirmGrant() },
      ),
    ).resolves.toBeDefined();

    // 4. __resetBridgeStateForTests libera o mutex explicitamente
    __resetBridgeStateForTests();
    await expect(
      selectNetworkAccess(
        { netRoots: ['exemplo.com'], searchUrl: '' },
        { confirmGrant: approvingConfirmGrant() },
      ),
    ).resolves.toBeDefined();
  });

  it('efeito de ponta a ponta no portão: sem netRoots, o passo é negado por política (denialKind: blocked); autorizado 127.0.0.1, passa a falhar por transporte/conexão recusada', async () => {
    const originalFetch = globalThis.fetch;
    const port = await closedPort();

    function ollamaResponse(content: string): Response {
      return new Response(JSON.stringify({ message: { content } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    function planContent(): string {
      return JSON.stringify({
        steps: [{ tool: 'http_get', args: { url: `http://127.0.0.1:${port}/` } }],
      });
    }

    async function runAskWithHttpAttempt(): ReturnType<
      typeof import('../src/core-bridge.js').resolveAskSnapshot
    > {
      let ollamaCallCount = 0;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/api/chat')) {
          ollamaCallCount += 1;
          if (ollamaCallCount === 1) return ollamaResponse(planContent());
          if (ollamaCallCount === 2) return ollamaResponse('resposta final');
          return ollamaResponse('[]');
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      const { resolveAskSnapshot } = await import('../src/core-bridge.js');
      return resolveAskSnapshot('acesse a rede', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
    }

    try {
      const withoutGrant = await runAskWithHttpAttempt();
      expect(withoutGrant.steps).toHaveLength(1);
      expect(withoutGrant.steps[0]?.ok).toBe(false);
      expect(withoutGrant.steps[0]?.denialKind).toBe('blocked');

      const { selectNetworkAccess } = await import('../src/core-bridge.js');
      await selectNetworkAccess(
        { netRoots: ['127.0.0.1'], searchUrl: '' },
        { confirmGrant: approvingConfirmGrant() },
      );

      const withGrant = await runAskWithHttpAttempt();
      expect(withGrant.steps).toHaveLength(1);
      expect(withGrant.steps[0]?.ok).toBe(false);
      expect(withGrant.steps[0]?.denialKind).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('selectNetworkAccess e o adapter novo não importam nem dependem de Electron', async () => {
    const bridgeSource = await readFile(new URL('../src/core-bridge.ts', import.meta.url), 'utf8');
    expect(bridgeSource).not.toContain("from 'electron'");
    const dialogSource = await readFile(
      new URL('../src/network-grant-dialog.ts', import.meta.url),
      'utf8',
    );
    expect(dialogSource).not.toContain("from 'electron'");
  });
});
