import type { DialogOptions, ShowMessageBox, ShowMessageBoxResult } from './confirm-port.js';

/**
 * Pedido de concessão de **política** de escrita (SPEC-0038, Decisão D11) —
 * distinto de `ActionRequest` (ação pontual do Runtime, `confirm-port.ts`).
 * `scope`/`duration` são literais fixos nesta fatia: toda concessão vale
 * para o diretório e sua subárvore inteira, pela duração da sessão da app.
 */
export interface GrantRequest {
  readonly path: string;
  readonly scope: 'subtree';
  readonly duration: 'session';
}

export interface GrantConfirmPort {
  request(grant: GrantRequest): Promise<boolean>;
}

const CANCEL_BUTTON_INDEX = 0;
const CONFIRM_BUTTON_INDEX = 1;

/**
 * Adaptador local, no molde de `createDialogConfirmPort` — mas com um
 * vocabulário e um texto **próprios de concessão de política**, nunca
 * reutilizando o texto de ação pontual de `confirm-port.ts` (Decisão D11):
 * o diálogo declara explicitamente que se trata de conceder permissão de
 * **escrita**, sobre o diretório e **toda a sua subárvore**, válida
 * **enquanto a janela estiver aberta** (esquecida ao fechar a app). Mesmo
 * fail-closed do `ConfirmPort` de ação pontual: só o botão de confirmação
 * resolve `true`; qualquer outro retorno ou exceção resolve `false`, nunca
 * lança. Não importa `electron` — testável no Vitest sem Electron.
 */
export function createGrantConfirmDialog(deps: {
  showMessageBox: ShowMessageBox;
}): GrantConfirmPort {
  return {
    async request(grant: GrantRequest): Promise<boolean> {
      try {
        const options: DialogOptions = {
          type: 'warning',
          buttons: ['Cancelar', 'Conceder'],
          defaultId: CANCEL_BUTTON_INDEX,
          cancelId: CANCEL_BUTTON_INDEX,
          title: 'Conceder permissão de escrita',
          message: `Conceder permissão de escrita em "${grant.path}"?`,
          detail:
            `Esta é uma concessão de permissão de escrita, não uma escrita agora. ` +
            `Ela vale para "${grant.path}" e todo o seu conteúdo (subárvore). ` +
            `A concessão permanece em vigor enquanto esta janela estiver aberta ` +
            `e é esquecida ao fechar a app.`,
        };
        const result: ShowMessageBoxResult = await deps.showMessageBox(options);
        return result.response === CONFIRM_BUTTON_INDEX;
      } catch {
        return false;
      }
    },
  };
}
