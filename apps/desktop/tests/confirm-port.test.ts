import { describe, expect, it } from 'vitest';
import type { DialogOptions, ShowMessageBoxResult } from '../src/confirm-port.js';
import { createDialogConfirmPort } from '../src/confirm-port.js';

const action = {
  resource: { type: 'file' as const, path: '/out/a.txt' },
  access: 'delete' as const,
};

function fakeShowMessageBox(
  response: number,
): (options: DialogOptions) => Promise<ShowMessageBoxResult> {
  return () => Promise.resolve({ response });
}

describe('createDialogConfirmPort', () => {
  it('resolve true quando o botão Confirmar (índice 1) é escolhido', async () => {
    const port = createDialogConfirmPort({ showMessageBox: fakeShowMessageBox(1) });
    await expect(port.request(action)).resolves.toBe(true);
  });

  it('resolve false quando o botão Cancelar (índice 0) é escolhido', async () => {
    const port = createDialogConfirmPort({ showMessageBox: fakeShowMessageBox(0) });
    await expect(port.request(action)).resolves.toBe(false);
  });

  it('resolve false para qualquer valor inesperado (fail-closed)', async () => {
    const port = createDialogConfirmPort({ showMessageBox: fakeShowMessageBox(99) });
    await expect(port.request(action)).resolves.toBe(false);
  });

  it('nunca lança, mesmo se showMessageBox rejeitar', async () => {
    const port = createDialogConfirmPort({
      showMessageBox: () => Promise.reject(new Error('boom')),
    });
    await expect(port.request(action)).resolves.toBe(false);
  });

  it('showMessageBox recebe título/mensagem/detalhe com access e resource.path', async () => {
    let received: DialogOptions | undefined;
    const port = createDialogConfirmPort({
      showMessageBox: (options) => {
        received = options;
        return Promise.resolve({ response: 1 });
      },
    });
    await port.request(action);

    expect(received).toBeDefined();
    expect(received!.message).toContain('delete');
    expect(received!.message).toContain('/out/a.txt');
    expect(received!.detail).toContain('/out/a.txt');
    expect(received!.buttons).toContain('Confirmar');
    expect(received!.buttons).toContain('Cancelar');
  });

  it('narrowing de ResourceRef (D16, SPEC-0055): recurso de rede usa host, não path', async () => {
    let received: DialogOptions | undefined;
    const port = createDialogConfirmPort({
      showMessageBox: (options) => {
        received = options;
        return Promise.resolve({ response: 1 });
      },
    });
    await port.request({ resource: { type: 'network', host: 'example.com' }, access: 'read' });

    expect(received).toBeDefined();
    expect(received!.message).toContain('example.com');
    expect(received!.detail).toContain('example.com');
  });
});
