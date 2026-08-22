import type { DialogOptions, ShowMessageBox, ShowMessageBoxResult } from './confirm-port.js';

/**
 * Pedido de concessão de **política** de rede (SPEC-0059, Decisão D3) —
 * distinto de `ActionRequest` (ação pontual do Runtime, `confirm-port.ts`) e
 * de `GrantRequest` (concessão de escrita, `permission-grant-dialog.ts`).
 * `scope`/`duration` são literais fixos nesta fatia: toda concessão vale
 * para o hostname exato (sem subdomínios, ADR-0026(b)), pela duração da
 * sessão da app.
 */
export interface NetworkGrantRequest {
  readonly host: string;
  readonly scope: 'host';
  readonly duration: 'session';
}

export interface NetworkGrantConfirmPort {
  request(grant: NetworkGrantRequest): Promise<boolean>;
}

const CANCEL_BUTTON_INDEX = 0;
const CONFIRM_BUTTON_INDEX = 1;

/**
 * Adaptador local, quarta porta fail-closed do app, no molde exato de
 * `createGrantConfirmDialog` — mas com vocabulário e texto **próprios de
 * concessão de política de rede**, nunca reutilizando o texto dos outros
 * três diálogos (D3): declara explicitamente (a) que é uma autorização de
 * acesso de rede, não uma requisição agora; (b) o hostname exato, e que
 * subdomínios não são incluídos (ADR-0026(b)); (c) que vale enquanto esta
 * janela estiver aberta e é esquecida ao fechar; (d) que dados a que o
 * Atlas tem acesso podem sair da máquina nessas requisições; (e) que a
 * autorização vale para **qualquer** Tool de rede que alcance aquele host
 * — hoje `http_get` e `web_search`, inclusive a consulta de busca em texto
 * livre — porque a política do ADR-0026(b) é por host, nunca por Tool
 * (Decisão D18). Mesmo fail-closed das demais portas: só o botão de
 * confirmação resolve `true`; qualquer outro retorno ou exceção resolve
 * `false`, nunca lança. Não importa `electron` — testável no Vitest sem
 * Electron.
 */
export function createNetworkGrantConfirmDialog(deps: {
  showMessageBox: ShowMessageBox;
}): NetworkGrantConfirmPort {
  return {
    async request(grant: NetworkGrantRequest): Promise<boolean> {
      try {
        const options: DialogOptions = {
          type: 'warning',
          buttons: ['Cancelar', 'Autorizar'],
          defaultId: CANCEL_BUTTON_INDEX,
          cancelId: CANCEL_BUTTON_INDEX,
          title: 'Autorizar acesso de rede',
          message: `Autorizar acesso de rede ao host "${grant.host}"?`,
          detail:
            `Esta é uma autorização de acesso de rede a este host, não uma requisição agora. ` +
            `Ela vale exatamente para "${grant.host}" — subdomínios não são incluídos. ` +
            `A autorização permanece em vigor enquanto esta janela estiver aberta e é ` +
            `esquecida ao fechar a app. Dados a que o Atlas tem acesso podem sair desta ` +
            `máquina nessas requisições. Esta autorização vale para qualquer ferramenta de ` +
            `rede que alcance este host — hoje "http_get" e "web_search", inclusive a ` +
            `consulta de busca em texto livre, que também é enviada ao host.`,
        };
        const result: ShowMessageBoxResult = await deps.showMessageBox(options);
        return result.response === CONFIRM_BUTTON_INDEX;
      } catch {
        return false;
      }
    },
  };
}
