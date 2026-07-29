import type { DialogOptions, ShowMessageBox, ShowMessageBoxResult } from './confirm-port.js';

/**
 * Pedido de consentimento para apagar uma Persona custom (SPEC-0039,
 * Decisão D14, Artigo 8) — distinto de `ActionRequest` (ação pontual do
 * Runtime, `confirm-port.ts`) e de `GrantRequest` (concessão de política de
 * escrita, `permission-grant-dialog.ts`). A ação é destrutiva e
 * irreversível: 8 campos escritos à mão, sem export/import, sem undo.
 */
export interface PersonaDeleteRequest {
  readonly id: string;
  readonly name: string;
}

export interface PersonaDeleteConfirmPort {
  request(req: PersonaDeleteRequest): Promise<boolean>;
}

const CANCEL_BUTTON_INDEX = 0;
const CONFIRM_BUTTON_INDEX = 1;

/**
 * Adaptador local, no molde exato de `createGrantConfirmDialog` (SPEC-0038)
 * — diálogo nativo (`dialog.showMessageBox`) com vocabulário próprio de
 * remoção de Persona: declara explicitamente que a Persona e seus 8
 * atributos serão apagados do disco e que a ação **não pode ser
 * desfeita**. Mesmo fail-closed dos demais diálogos: só o botão de
 * confirmação resolve `true`; qualquer outro retorno ou exceção resolve
 * `false`, nunca lança. Não importa `electron` — testável no Vitest sem
 * Electron.
 */
export function createPersonaDeleteDialog(deps: {
  showMessageBox: ShowMessageBox;
}): PersonaDeleteConfirmPort {
  return {
    async request(req: PersonaDeleteRequest): Promise<boolean> {
      try {
        const options: DialogOptions = {
          type: 'warning',
          buttons: ['Cancelar', 'Apagar'],
          defaultId: CANCEL_BUTTON_INDEX,
          cancelId: CANCEL_BUTTON_INDEX,
          title: 'Apagar Persona',
          message: `Apagar a Persona "${req.name}"?`,
          detail:
            `Esta ação apaga a Persona "${req.name}" e seus 8 atributos do disco. ` +
            `Esta ação não pode ser desfeita.`,
        };
        const result: ShowMessageBoxResult = await deps.showMessageBox(options);
        return result.response === CONFIRM_BUTTON_INDEX;
      } catch {
        return false;
      }
    },
  };
}
