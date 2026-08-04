import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeChatSessionIfOpen, useTmpDir } from './helpers/core-bridge-harness.js';

const { path: tmpDir, baseOverride } = useTmpDir();

describe('configuração de permissões (selectPermissionRoots/selectedPermissionRoots)', () => {
  let otherDir: string;

  beforeEach(() => {
    otherDir = mkdtempSync(join(tmpdir(), 'atlas-desktop-perm-'));
  });

  afterEach(async () => {
    const { __resetBridgeStateForTests } = await import('../src/core-bridge.js');
    __resetBridgeStateForTests();
    rmSync(otherDir, { recursive: true, force: true });
  });

  function approvingConfirmGrant() {
    return { request: vi.fn(async () => true) };
  }

  function refusingConfirmGrant() {
    return { request: vi.fn(async () => false) };
  }

  it('concessão de leitura: resolveStatusSnapshot subsequente reporta a raiz nova; antes disso, os defaults', async () => {
    const { resolveStatusSnapshot, selectPermissionRoots, selectedPermissionRoots } =
      await import('../src/core-bridge.js');

    expect(selectedPermissionRoots()).toBeUndefined();
    const before = await resolveStatusSnapshot(baseOverride());
    expect(before.readRoots).not.toContain(tmpDir());

    const selection = await selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [] });
    expect(selection).toEqual({ readRoots: [tmpDir()], writeRoots: [], closedSessions: [] });
    expect(selectedPermissionRoots()).toEqual({ readRoots: [tmpDir()], writeRoots: [] });

    const after = await resolveStatusSnapshot(baseOverride());
    expect(after.readRoots).toEqual([tmpDir()]);
    expect(after.writeRoots).toEqual([]);
  });

  it('concessão de escrita com consentimento: confirmGrant é chamado exatamente uma vez com o GrantRequest exato; resolveStatusSnapshot subsequente reporta writeRoots', async () => {
    const { resolveStatusSnapshot, selectPermissionRoots } = await import('../src/core-bridge.js');
    const confirmGrant = approvingConfirmGrant();

    await selectPermissionRoots(
      { readRoots: [tmpDir()], writeRoots: [tmpDir()] },
      { confirmGrant },
    );

    expect(confirmGrant.request).toHaveBeenCalledTimes(1);
    expect(confirmGrant.request).toHaveBeenCalledWith({
      path: tmpDir(),
      scope: 'subtree',
      duration: 'session',
    });

    const status = await resolveStatusSnapshot(baseOverride());
    expect(status.writeRoots).toEqual([tmpDir()]);
  });

  it('escrita recusada (fail-closed): rejeita, seleção fica inalterada (inclusive a parte de leitura pedida na mesma chamada), nenhuma sessão viva é encerrada, e resolveStatusSnapshot seguinte reporta a política anterior', async () => {
    const { openChatSession, sendChatTurn, resolveStatusSnapshot, selectPermissionRoots } =
      await import('../src/core-bridge.js');

    // A aplicação bem-sucedida (mesmo só de leitura) encerra sessões vivas
    // (D7) — por isso a baseline é estabelecida ANTES de abrir a sessão que
    // este teste usa para comprovar que a recusa não encerra nada.
    await selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [] });
    const session = await openChatSession({ configOverride: baseOverride() });
    try {
      const confirmGrant = refusingConfirmGrant();
      await expect(
        selectPermissionRoots({ readRoots: [otherDir], writeRoots: [otherDir] }, { confirmGrant }),
      ).rejects.toThrow(/recusad/);

      const status = await resolveStatusSnapshot(baseOverride());
      expect(status.readRoots).toEqual([tmpDir()]);
      expect(status.writeRoots).toEqual([]);

      // Sessão viva permanece utilizável — nada foi encerrado.
      const turn = await sendChatTurn(session, 'oi');
      expect(turn.reply).toBe('[fake] oi');
    } finally {
      await closeChatSessionIfOpen(session);
    }
  });

  it('sem confirmGrant injetado: pedir uma raiz de escrita nova rejeita (default fail-closed), mesmo caminho da recusa', async () => {
    const { selectPermissionRoots } = await import('../src/core-bridge.js');

    await expect(
      selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [tmpDir()] }),
    ).rejects.toThrow(/recusad/);
  });

  it('escrita já concedida não reconfirma; remover uma raiz de escrita também não confirma', async () => {
    const { selectPermissionRoots } = await import('../src/core-bridge.js');
    const confirmGrant = approvingConfirmGrant();

    await selectPermissionRoots(
      { readRoots: [tmpDir()], writeRoots: [tmpDir()] },
      { confirmGrant },
    );
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);

    // Acrescenta só uma raiz de leitura, mantendo a mesma raiz de escrita.
    await selectPermissionRoots(
      { readRoots: [tmpDir(), otherDir], writeRoots: [tmpDir()] },
      { confirmGrant },
    );
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);

    // Remove a raiz de escrita.
    await selectPermissionRoots(
      { readRoots: [tmpDir(), otherDir], writeRoots: [] },
      { confirmGrant },
    );
    expect(confirmGrant.request).toHaveBeenCalledTimes(1);
  });

  it('validação estrutural: caminho relativo rejeita citando o caminho; readRoots vazia rejeita; entradas duplicadas/espaçadas são normalizadas', async () => {
    const { selectPermissionRoots, selectedPermissionRoots } =
      await import('../src/core-bridge.js');

    await expect(selectPermissionRoots({ readRoots: ['./algo'], writeRoots: [] })).rejects.toThrow(
      /\.\/algo/,
    );
    expect(selectedPermissionRoots()).toBeUndefined();

    await expect(selectPermissionRoots({ readRoots: [], writeRoots: [] })).rejects.toThrow();
    expect(selectedPermissionRoots()).toBeUndefined();

    await expect(selectPermissionRoots({ readRoots: ['  '], writeRoots: [] })).rejects.toThrow();
    expect(selectedPermissionRoots()).toBeUndefined();

    const selection = await selectPermissionRoots({
      readRoots: [` ${tmpDir()} `, tmpDir()],
      writeRoots: [],
    });
    expect(selection.readRoots).toEqual([tmpDir()]);
  });

  it('precedência/bloco completo: configOverride.permissions explícito do chamador vence a seleção corrente; permissions parcial não recebe merge (campo omitido cai no default do loadConfig)', async () => {
    const { resolveStatusSnapshot, selectPermissionRoots } = await import('../src/core-bridge.js');

    await selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [] });

    const overridden = await resolveStatusSnapshot(
      baseOverride({ permissions: { readRoots: [otherDir], writeRoots: [] } }),
    );
    expect(overridden.readRoots).toEqual([otherDir]);

    const partial = await resolveStatusSnapshot(
      baseOverride({ permissions: { writeRoots: [otherDir] } }),
    );
    // bloco completo: readRoots NÃO é preenchido pela seleção corrente —
    // cai no default do loadConfig (process.cwd()), não em [tmpDir()].
    expect(partial.readRoots).not.toEqual([tmpDir()]);
    expect(partial.writeRoots).toEqual([otherDir]);
  });

  it('chat vivo ocioso: sessão aberta é devolvida em closedSessions e fica inutilizável; sem sessões abertas, closedSessions é []; sessão aberta depois roda sob a política nova', async () => {
    const { openChatSession, sendChatTurn, selectPermissionRoots } =
      await import('../src/core-bridge.js');

    const noSessions = await selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [] });
    expect(noSessions.closedSessions).toEqual([]);

    const session = await openChatSession({ configOverride: baseOverride() });
    const selection = await selectPermissionRoots({ readRoots: [otherDir], writeRoots: [] });

    expect(selection.closedSessions).toEqual([session]);
    await expect(sendChatTurn(session, 'oi de novo')).rejects.toThrow();
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
      const { openChatSession, sendChatTurn, selectPermissionRoots, selectedPermissionRoots } =
        await import('../src/core-bridge.js');

      const session = await openChatSession({
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });

      const turnPromise = sendChatTurn(session, 'oi');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const confirmGrant = approvingConfirmGrant();
      await expect(
        selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [tmpDir()] }, { confirmGrant }),
      ).rejects.toThrow(/andamento/);
      expect(selectedPermissionRoots()).toBeUndefined();
      expect(confirmGrant.request).not.toHaveBeenCalled();

      releaseFirstCall();
      const turn = await turnPromise;
      expect(turn.reply).toBe('oi, tudo bem?');

      const selection = await selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [] });
      expect(selection.readRoots).toEqual([tmpDir()]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('ask em voo (D10) bloqueia a aplicação (rejeição, seleção inalterada, nenhum confirmGrant solicitado) e o ask conclui íntegro; a aplicação passa a ser aceita depois', async () => {
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
      return ollamaResponse('["fato aprendido durante o ask em voo"]');
    }) as typeof fetch;

    try {
      const { resolveAskSnapshot, selectPermissionRoots, selectedPermissionRoots } =
        await import('../src/core-bridge.js');

      const askPromise = resolveAskSnapshot('oi', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const confirmGrant = approvingConfirmGrant();
      await expect(
        selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [tmpDir()] }, { confirmGrant }),
      ).rejects.toThrow(/andamento/);
      expect(selectedPermissionRoots()).toBeUndefined();
      expect(confirmGrant.request).not.toHaveBeenCalled();

      releaseFirstCall();
      const snapshot = await askPromise;
      expect(snapshot.text).toBe('oi, tudo bem?');
      expect(snapshot.learned).toEqual(['fato aprendido durante o ask em voo']);

      const selection = await selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [] });
      expect(selection.readRoots).toEqual([tmpDir()]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('A7: uma operação iniciada durante o confirmGrant (concessão já aprovada) também bloqueia a aplicação — nada é aplicado, nenhuma sessão é encerrada', async () => {
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
      const {
        openChatSession,
        resolveAskSnapshot,
        selectPermissionRoots,
        selectedPermissionRoots,
      } = await import('../src/core-bridge.js');

      const session = await openChatSession({ configOverride: baseOverride() });

      let askPromise: Promise<unknown> | undefined;
      const confirmGrant = {
        request: vi.fn(async () => {
          // Dispara uma operação em voo (`ask`) DURANTE o consentimento —
          // o usuário está olhando para o diálogo nativo enquanto isso.
          askPromise = resolveAskSnapshot('oi durante o diálogo', {
            configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
          });
          await new Promise((resolve) => setTimeout(resolve, 0));
          return true;
        }),
      };

      await expect(
        selectPermissionRoots({ readRoots: [tmpDir()], writeRoots: [tmpDir()] }, { confirmGrant }),
      ).rejects.toThrow(/andamento/);

      expect(selectedPermissionRoots()).toBeUndefined();

      releaseAskCall();
      // SPEC-0050 (CA 11): o ask disparado dentro do confirmGrant sobe com o
      // Map de sessões ocioso e inFlightOperations em zero — não é recusado
      // pela guarda nova de resolveAskSnapshot; resolve normalmente.
      await expect(askPromise).resolves.toMatchObject({ text: 'oi, tudo bem?' });

      // Nenhuma sessão foi encerrada pela aplicação recusada.
      const { sendChatTurn } = await import('../src/core-bridge.js');
      const turn = await sendChatTurn(session, 'ainda viva?');
      expect(turn.reply).toBe('[fake] ainda viva?');

      await closeChatSessionIfOpen(session);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('efeito de ponta a ponta no portão: writeRoots concedida permite a um resolveAskSnapshot escrever no diretório; sem a concessão, o mesmo cenário é negado (denialKind: blocked)', async () => {
    const originalFetch = globalThis.fetch;
    const targetFile = join(tmpDir(), 'saida.txt');

    function ollamaResponse(content: string): Response {
      return new Response(JSON.stringify({ message: { content } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    function planContent(): string {
      return JSON.stringify({
        steps: [{ tool: 'write_file', args: { path: targetFile, content: 'x' } }],
      });
    }

    async function runAskWithWriteAttempt(): Promise<
      Awaited<ReturnType<typeof import('../src/core-bridge.js').resolveAskSnapshot>>
    > {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          return ollamaResponse(planContent());
        }
        if (callCount === 2) {
          return ollamaResponse('resposta final');
        }
        return ollamaResponse('[]');
      }) as typeof fetch;

      const { resolveAskSnapshot } = await import('../src/core-bridge.js');
      return resolveAskSnapshot('escreva um arquivo', {
        configOverride: baseOverride({ model: { provider: 'local', model: 'test-model' } }),
      });
    }

    try {
      const withoutGrant = await runAskWithWriteAttempt();
      expect(withoutGrant.steps).toHaveLength(1);
      expect(withoutGrant.steps[0]?.ok).toBe(false);
      expect(withoutGrant.steps[0]?.denialKind).toBe('blocked');

      const { selectPermissionRoots } = await import('../src/core-bridge.js');
      const confirmGrant = approvingConfirmGrant();
      await selectPermissionRoots(
        { readRoots: [tmpDir()], writeRoots: [tmpDir()] },
        { confirmGrant },
      );

      const withGrant = await runAskWithWriteAttempt();
      expect(withGrant.steps).toHaveLength(1);
      expect(withGrant.steps[0]?.ok).toBe(true);
      expect(withGrant.steps[0]?.denialKind).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('selectPermissionRoots não importa nem depende de Electron', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.promises.readFile(new URL('../src/core-bridge.ts', import.meta.url), 'utf8'),
    );
    expect(source).not.toContain("from 'electron'");
  });
});
