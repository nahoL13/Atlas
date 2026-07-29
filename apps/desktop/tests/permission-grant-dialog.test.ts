import { describe, expect, it } from 'vitest';
import type { DialogOptions, ShowMessageBoxResult } from '../src/confirm-port.js';
import { createGrantConfirmDialog } from '../src/permission-grant-dialog.js';

const grant = { path: '/a', scope: 'subtree' as const, duration: 'session' as const };

function fakeShowMessageBox(
  response: number,
): (options: DialogOptions) => Promise<ShowMessageBoxResult> {
  return () => Promise.resolve({ response });
}

describe('createGrantConfirmDialog', () => {
  it('resolve true quando o botão de conceder (índice 1) é escolhido', async () => {
    const port = createGrantConfirmDialog({ showMessageBox: fakeShowMessageBox(1) });
    await expect(port.request(grant)).resolves.toBe(true);
  });

  it('resolve false quando o botão Cancelar (índice 0) é escolhido', async () => {
    const port = createGrantConfirmDialog({ showMessageBox: fakeShowMessageBox(0) });
    await expect(port.request(grant)).resolves.toBe(false);
  });

  it('resolve false para o cancelId e para um índice inesperado (fail-closed)', async () => {
    const cancelIdPort = createGrantConfirmDialog({ showMessageBox: fakeShowMessageBox(0) });
    await expect(cancelIdPort.request(grant)).resolves.toBe(false);

    const unexpectedPort = createGrantConfirmDialog({ showMessageBox: fakeShowMessageBox(99) });
    await expect(unexpectedPort.request(grant)).resolves.toBe(false);
  });

  it('nunca lança, mesmo se showMessageBox rejeitar', async () => {
    const port = createGrantConfirmDialog({
      showMessageBox: () => Promise.reject(new Error('boom')),
    });
    await expect(port.request(grant)).resolves.toBe(false);
  });

  it('o texto montado descreve concessão de política de escrita, caminho + subárvore, e duração de sessão — sem a frase de ação pontual', async () => {
    let received: DialogOptions | undefined;
    const port = createGrantConfirmDialog({
      showMessageBox: (options) => {
        received = options;
        return Promise.resolve({ response: 1 });
      },
    });
    await port.request(grant);

    expect(received).toBeDefined();
    const fullText = `${received!.title} ${received!.message} ${received!.detail}`;

    expect(fullText).toMatch(/concess(ão|õe)|conceder/i);
    expect(fullText).toContain('permissão de escrita');
    expect(fullText).toContain('/a');
    expect(fullText).toMatch(/subárvore|e todo o seu conteúdo/i);
    expect(fullText).toMatch(/enquanto (esta janela|a janela|a app)\s*(estiver)? aberta/i);
    expect(fullText).not.toContain('Confirmar ação irreversível');
  });
});
