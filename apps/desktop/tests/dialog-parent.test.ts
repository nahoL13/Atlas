import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createParentedShowMessageBox,
  selectDialogParent,
  type ParentWindowLike,
} from '../src/dialog-parent.js';
import type { DialogOptions, ShowMessageBox, ShowMessageBoxResult } from '../src/confirm-port.js';

const OPTIONS: DialogOptions = {
  type: 'warning',
  buttons: ['Cancelar', 'Confirmar'],
  defaultId: 0,
  cancelId: 0,
  title: 'Teste',
  message: 'Mensagem',
  detail: 'Detalhe',
};

const RESULT: ShowMessageBoxResult = { response: 0 };
const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainPath = join(desktopRoot, 'src', 'main.ts');
const preloadPath = join(desktopRoot, 'src', 'preload.cjs');

function windowLike(overrides: Partial<ParentWindowLike> = {}): ParentWindowLike {
  return {
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    isFocused: () => true,
    ...overrides,
  };
}

describe('selectDialogParent', () => {
  it('devolve undefined para lista ausente ou vazia', () => {
    expect(selectDialogParent([])).toBeUndefined();
    expect(selectDialogParent(null)).toBeUndefined();
    expect(selectDialogParent(undefined)).toBeUndefined();
  });

  it('seleciona a primeira janela não destruída, visível, não minimizada e focada', () => {
    const eligible = windowLike();
    expect(
      selectDialogParent([
        windowLike({ isDestroyed: () => true }),
        windowLike({ isVisible: () => false }),
        windowLike({ isMinimized: () => true }),
        windowLike({ isFocused: () => false }),
        eligible,
      ]),
    ).toBe(eligible);
  });

  it('ignora candidatos nulos ou com predicado que lança e continua buscando', () => {
    const eligible = windowLike();
    expect(
      selectDialogParent([
        null,
        undefined,
        windowLike({
          isVisible: () => {
            throw new Error('janela encerrada');
          },
        }),
        eligible,
      ]),
    ).toBe(eligible);
  });
});

describe('createParentedShowMessageBox', () => {
  it('quando a política proíbe parentamento, usa fallback sem consultar janelas', async () => {
    const listWindows = vi.fn(() => [windowLike()]);
    const showWithParent = vi.fn(async () => RESULT);
    const showWithoutParent = vi.fn(async () => RESULT);
    const show = createParentedShowMessageBox({
      isParentingAllowed: () => false,
      listWindows,
      showWithParent,
      showWithoutParent,
    });

    await expect(show(OPTIONS)).resolves.toBe(RESULT);
    expect(listWindows).not.toHaveBeenCalled();
    expect(showWithParent).not.toHaveBeenCalled();
    expect(showWithoutParent).toHaveBeenCalledWith(OPTIONS);
  });

  it('cai sem pai quando não consegue decidir política ou listar janelas', async () => {
    const fallback = vi.fn(async () => RESULT);
    const policyFailure = createParentedShowMessageBox({
      isParentingAllowed: () => {
        throw new Error('estado indisponível');
      },
      listWindows: () => [windowLike()],
      showWithParent: async () => RESULT,
      showWithoutParent: fallback,
    });
    await expect(policyFailure(OPTIONS)).resolves.toBe(RESULT);
    expect(fallback).toHaveBeenCalledWith(OPTIONS);

    const listFailure = createParentedShowMessageBox({
      isParentingAllowed: () => true,
      listWindows: () => {
        throw new Error('janela indisponível');
      },
      showWithParent: async () => RESULT,
      showWithoutParent: fallback,
    });
    await expect(listFailure(OPTIONS)).resolves.toBe(RESULT);
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it('resolve política e janelas em cada chamada', async () => {
    let allowed = false;
    let windows: readonly (ParentWindowLike | null | undefined)[] = [];
    const parent = windowLike();
    const showWithParent = vi.fn(async () => RESULT);
    const showWithoutParent = vi.fn(async () => RESULT);
    const show = createParentedShowMessageBox({
      isParentingAllowed: () => allowed,
      listWindows: () => windows,
      showWithParent,
      showWithoutParent,
    });

    await show(OPTIONS);
    allowed = true;
    await show(OPTIONS);
    windows = [parent];
    await show(OPTIONS);

    expect(showWithoutParent).toHaveBeenCalledTimes(2);
    expect(showWithParent).toHaveBeenCalledTimes(1);
    expect(showWithParent).toHaveBeenCalledWith(parent, OPTIONS);
  });

  it('preserva as rejeições dos dois adaptadores de apresentação', async () => {
    const parentFailure = new Error('parentado falhou');
    const withParent = createParentedShowMessageBox({
      isParentingAllowed: () => true,
      listWindows: () => [windowLike()],
      showWithParent: async () => Promise.reject(parentFailure),
      showWithoutParent: async () => RESULT,
    });
    await expect(withParent(OPTIONS)).rejects.toBe(parentFailure);

    const fallbackFailure = new Error('independente falhou');
    const withoutParent = createParentedShowMessageBox({
      isParentingAllowed: () => false,
      listWindows: () => [],
      showWithParent: async () => RESULT,
      showWithoutParent: async () => Promise.reject(fallbackFailure),
    });
    await expect(withoutParent(OPTIONS)).rejects.toBe(fallbackFailure);
  });

  it('é atribuível à porta ShowMessageBox sem coerções', () => {
    const show: ShowMessageBox = createParentedShowMessageBox({
      isParentingAllowed: () => false,
      listWindows: () => [],
      showWithParent: async () => RESULT,
      showWithoutParent: async () => RESULT,
    });
    expect(show).toBeTypeOf('function');
  });
});

describe('fiação de diálogo parentado', () => {
  it('constrói um adaptador único e o injeta nas quatro portas', () => {
    const main = readFileSync(mainPath, 'utf8');
    const match = main.match(
      /const showMessageBox = createParentedShowMessageBox\(\{([\s\S]*?)\n\}\);/,
    );
    expect(match).not.toBeNull();
    const block = match?.[0] ?? '';
    expect(block).toContain('isParentingAllowed: () => !handsFreeModeActive');
    expect(block).toContain('listWindows: () => BrowserWindow.getAllWindows()');
    expect(block.match(/dialog\.showMessageBox\(/g)).toHaveLength(2);
    expect(main.match(/createParentedShowMessageBox\(/g)).toHaveLength(1);
    expect(main.match(/\{\s*showMessageBox,\s*\}/g)).toHaveLength(4);
    expect(main.replace(block, '')).not.toContain('dialog.showMessageBox(');
  });

  it('registra um handler de estado estritamente booleano e limpa-o no ciclo da janela', () => {
    const main = readFileSync(mainPath, 'utf8');
    expect(main).toContain('let handsFreeModeActive = false;');
    const handlers = main.match(/ipcMain\.handle\('atlas:hands-free:set-active'/g) ?? [];
    expect(handlers).toHaveLength(1);
    const handler =
      main.match(/ipcMain\.handle\('atlas:hands-free:set-active',[\s\S]*?\n\}\);/)?.[0] ?? '';
    expect(handler).toContain("typeof active === 'boolean'");
    expect(handler).toContain('handsFreeModeActive = active');
    expect(handler).toContain('return handsFreeModeActive');

    const navigation = main.match(/did-start-navigation[\s\S]*?\n\s*\}\);/)?.[0] ?? '';
    const closed = main.match(/window\.on\('closed',[\s\S]*?\n\s*\}\);/)?.[0] ?? '';
    expect(navigation).toContain('handsFreeModeActive = false');
    expect(closed).toContain('handsFreeModeActive = false');
  });

  it('expõe somente o novo método handsFree sobre seu novo canal', () => {
    const preload = readFileSync(preloadPath, 'utf8');
    expect(preload).toContain(
      "handsFree: {\n    setActive: (active) => ipcRenderer.invoke('atlas:hands-free:set-active', active),\n  },",
    );
    expect(preload.match(/atlas:hands-free:set-active/g)).toHaveLength(1);
  });

  it('não força foco, visibilidade ou restauração de janela', () => {
    const main = readFileSync(mainPath, 'utf8');
    expect(main).not.toContain('BrowserWindow.getFocusedWindow');
    expect(main).not.toContain('.restore()');
    expect(main).not.toContain('.show()');
    expect(main).not.toContain('app.focus(');
  });
});
