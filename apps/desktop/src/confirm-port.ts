import type { ActionRequest } from '@atlas/contracts';

/**
 * Resultado do diálogo nativo do Electron (`dialog.showMessageBox`): o
 * índice do botão escolhido pelo usuário.
 */
export interface ShowMessageBoxResult {
  readonly response: number;
}

export interface DialogOptions {
  readonly type: 'none' | 'info' | 'error' | 'question' | 'warning';
  readonly buttons: string[];
  readonly defaultId: number;
  readonly cancelId: number;
  readonly title: string;
  readonly message: string;
  readonly detail: string;
}

export type ShowMessageBox = (options: DialogOptions) => Promise<ShowMessageBoxResult>;

const CANCEL_BUTTON_INDEX = 0;
const CONFIRM_BUTTON_INDEX = 1;

/**
 * Adaptador local (não sobe a @atlas/contracts, sem 2º consumidor real):
 * satisfaz estruturalmente o `ConfirmPort` interno de @atlas/runtime
 * (`request(action): Promise<boolean>`), sobre um diálogo nativo em vez de
 * uma pausa de terminal. `showMessageBox` é injetado — em produção,
 * `dialog.showMessageBox` do Electron (fiado só em `main.ts`); nos testes,
 * um fake — este módulo não importa `electron`, permanecendo testável no
 * Vitest. Fail-closed: só o botão "Confirmar" resolve `true`; qualquer outro
 * retorno (Cancelar, fechar/`cancelId`, valor inesperado) resolve `false`,
 * espelhando o `EOF ⇒ false` do `nodeReadlineConfirmPort`; nunca lança.
 */
export function createDialogConfirmPort(deps: { showMessageBox: ShowMessageBox }): {
  request(action: ActionRequest): Promise<boolean>;
} {
  return {
    async request(action: ActionRequest): Promise<boolean> {
      try {
        const result = await deps.showMessageBox({
          type: 'warning',
          buttons: ['Cancelar', 'Confirmar'],
          defaultId: CANCEL_BUTTON_INDEX,
          cancelId: CANCEL_BUTTON_INDEX,
          title: 'Confirmar ação irreversível',
          message: `Confirmar ação irreversível (${action.access} em ${action.resource.path})?`,
          detail: `recurso: ${action.resource.path}\nação: ${action.access}`,
        });
        return result.response === CONFIRM_BUTTON_INDEX;
      } catch {
        return false;
      }
    },
  };
}
