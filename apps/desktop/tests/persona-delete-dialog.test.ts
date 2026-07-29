import { describe, expect, it } from 'vitest';
import type { DialogOptions, ShowMessageBoxResult } from '../src/confirm-port.js';
import { createPersonaDeleteDialog } from '../src/persona-delete-dialog.js';

const req = { id: 'minha-persona', name: 'Minha Persona' };

function fakeShowMessageBox(
  response: number,
): (options: DialogOptions) => Promise<ShowMessageBoxResult> {
  return () => Promise.resolve({ response });
}

describe('createPersonaDeleteDialog', () => {
  it('resolve true quando o botão de apagar (índice 1) é escolhido', async () => {
    const port = createPersonaDeleteDialog({ showMessageBox: fakeShowMessageBox(1) });
    await expect(port.request(req)).resolves.toBe(true);
  });

  it('resolve false quando o botão Cancelar (índice 0) é escolhido', async () => {
    const port = createPersonaDeleteDialog({ showMessageBox: fakeShowMessageBox(0) });
    await expect(port.request(req)).resolves.toBe(false);
  });

  it('resolve false para o cancelId e para um índice inesperado (fail-closed)', async () => {
    const cancelIdPort = createPersonaDeleteDialog({ showMessageBox: fakeShowMessageBox(0) });
    await expect(cancelIdPort.request(req)).resolves.toBe(false);

    const unexpectedPort = createPersonaDeleteDialog({ showMessageBox: fakeShowMessageBox(99) });
    await expect(unexpectedPort.request(req)).resolves.toBe(false);
  });

  it('nunca lança, mesmo se showMessageBox rejeitar', async () => {
    const port = createPersonaDeleteDialog({
      showMessageBox: () => Promise.reject(new Error('boom')),
    });
    await expect(port.request(req)).resolves.toBe(false);
  });

  it('o texto declara apagar os 8 atributos do disco e que a ação não pode ser desfeita', async () => {
    let received: DialogOptions | undefined;
    const port = createPersonaDeleteDialog({
      showMessageBox: (options) => {
        received = options;
        return Promise.resolve({ response: 1 });
      },
    });
    await port.request(req);

    expect(received).toBeDefined();
    const fullText = `${received!.title} ${received!.message} ${received!.detail}`;
    expect(fullText).toContain('Minha Persona');
    expect(fullText).toMatch(/8 atributos/);
    expect(fullText).toMatch(/não pode ser desfeita/i);
  });
});
