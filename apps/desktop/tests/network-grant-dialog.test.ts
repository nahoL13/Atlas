import { describe, expect, it } from 'vitest';
import type { DialogOptions, ShowMessageBoxResult } from '../src/confirm-port.js';
import { createNetworkGrantConfirmDialog } from '../src/network-grant-dialog.js';

const grant = { host: 'exemplo.com', scope: 'host' as const, duration: 'session' as const };

function fakeShowMessageBox(
  response: number,
): (options: DialogOptions) => Promise<ShowMessageBoxResult> {
  return () => Promise.resolve({ response });
}

describe('createNetworkGrantConfirmDialog', () => {
  it('resolve true quando o botão de autorizar (índice 1) é escolhido', async () => {
    const port = createNetworkGrantConfirmDialog({ showMessageBox: fakeShowMessageBox(1) });
    await expect(port.request(grant)).resolves.toBe(true);
  });

  it('resolve false quando o botão Cancelar (índice 0) é escolhido', async () => {
    const port = createNetworkGrantConfirmDialog({ showMessageBox: fakeShowMessageBox(0) });
    await expect(port.request(grant)).resolves.toBe(false);
  });

  it('resolve false para o cancelId e para um índice inesperado (fail-closed)', async () => {
    const cancelIdPort = createNetworkGrantConfirmDialog({ showMessageBox: fakeShowMessageBox(0) });
    await expect(cancelIdPort.request(grant)).resolves.toBe(false);

    const unexpectedPort = createNetworkGrantConfirmDialog({
      showMessageBox: fakeShowMessageBox(99),
    });
    await expect(unexpectedPort.request(grant)).resolves.toBe(false);
  });

  it('nunca lança, mesmo se showMessageBox rejeitar', async () => {
    const port = createNetworkGrantConfirmDialog({
      showMessageBox: () => Promise.reject(new Error('boom')),
    });
    await expect(port.request(grant)).resolves.toBe(false);
  });

  it('o texto montado descreve autorização de acesso de rede, host exato sem subdomínios, duração de sessão, aviso de saída de dados e alcance por qualquer Tool de rede — sem as frases dos outros dois diálogos', async () => {
    let received: DialogOptions | undefined;
    const port = createNetworkGrantConfirmDialog({
      showMessageBox: (options) => {
        received = options;
        return Promise.resolve({ response: 1 });
      },
    });
    await port.request(grant);

    expect(received).toBeDefined();
    const fullText = `${received!.title} ${received!.message} ${received!.detail}`;

    // (a) autorizar/autorização + acesso de rede
    expect(fullText).toMatch(/autorizar|autoriza(ç|c)[aã]o/i);
    expect(fullText).toContain('acesso de rede');
    // (b) host exato + subdomínios não incluídos
    expect(fullText).toContain('exemplo.com');
    expect(fullText).toMatch(/subdom[ií]nios não são incluídos/i);
    // (c) vale enquanto a janela estiver aberta, esquecida ao fechar
    expect(fullText).toMatch(/enquanto (esta janela|a janela|a app)\s*(estiver)? aberta/i);
    expect(fullText).toMatch(/esquecida ao fechar/i);
    // (d) dados podem sair da máquina
    expect(fullText).toMatch(/sair (desta|da) máquina/i);
    // (e) qualquer ferramenta de rede, nomeando as duas Tools, consulta de busca também sai
    expect(fullText).toMatch(/qualquer ferramenta de rede/i);
    expect(fullText).toContain('http_get');
    expect(fullText).toContain('web_search');
    expect(fullText).toMatch(/consulta de busca.*enviada/i);

    // ausência das frases dos outros dois diálogos
    expect(fullText).not.toContain('Confirmar ação irreversível');
    expect(fullText).not.toContain('permissão de escrita');
  });

  it('createNetworkGrantConfirmDialog não importa electron (a suíte roda sob Vitest sem Electron)', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.promises.readFile(new URL('../src/network-grant-dialog.ts', import.meta.url), 'utf8'),
    );
    expect(source).not.toContain("from 'electron'");
  });
});
