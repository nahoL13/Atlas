/**
 * Permissão de microfone e janela de captura (SPEC-0046, D9/D17). Módulo
 * puro do main process — não importa `electron` nem qualquer global de
 * navegador, testável sem Electron.
 *
 * `decideMediaPermission` é o único ponto de decisão consumido pelos dois
 * handlers de `session.defaultSession` em `src/main.ts`
 * (`setPermissionRequestHandler`/`setPermissionCheckHandler`): nega tudo por
 * padrão e concede exclusivamente `'media'` de áudio, e só enquanto a janela
 * de captura declarada pelo renderer estiver aberta.
 *
 * `createCaptureWindow` mantém o estado dessa janela — aberta por
 * `'atlas:stt:capture:begin'` (idempotente, e usada também para REARMAR o
 * watchdog quando `getUserMedia` resolve — R1), fechada por
 * `'atlas:stt:capture:end'` (idempotente) ou pelo watchdog de 35 s sem `end`.
 * `src/main.ts` fia os demais gatilhos de fechamento (navegação/recarga,
 * janela fechada, app encerrando) chamando `end()` diretamente — não há
 * período de carência: fora da janela, a permissão de mídia é sempre negada.
 */

/** Requisição de decisão de permissão — entrada malformada resolve `false`, nunca lança. */
export interface MediaPermissionRequest {
  readonly permission: string;
  readonly requestedMedia?: readonly string[];
  readonly captureInFlight: boolean;
}

/**
 * Só concede `permission === 'media'` quando o único tipo de mídia pedido é
 * áudio (nunca vídeo) e a janela de captura está aberta — fail-closed em toda
 * bifurcação, nunca lança mesmo com entrada malformada/`undefined`.
 */
export function decideMediaPermission(request: MediaPermissionRequest | undefined | null): boolean {
  if (request === undefined || request === null || typeof request !== 'object') {
    return false;
  }
  const { permission, requestedMedia, captureInFlight } = request;
  if (permission !== 'media') {
    return false;
  }
  const media = Array.isArray(requestedMedia) ? requestedMedia : [];
  if (media.includes('video')) {
    return false;
  }
  if (!media.includes('audio')) {
    return false;
  }
  return captureInFlight === true;
}

/** Janela de captura declarada pelo renderer — ciclo de vida completo pinado pela SPEC-0046. */
export interface CaptureWindow {
  /** Idempotente: abre (se fechada) e sempre (re)arma o watchdog de 35 s. */
  begin(): void;
  /** Idempotente: fecha e desarma o watchdog; nunca lança se já estava fechada. */
  end(): void;
  isOpen(): boolean;
}

export interface CaptureWindowDeps {
  readonly setTimer: (fn: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
}

/** Sem `end`, a janela fecha sozinha depois desse intervalo (D17) — sem carência. */
const CAPTURE_WATCHDOG_MS = 35_000;

/**
 * `begin()` sempre (re)arma o watchdog a partir de agora — inclusive quando a
 * janela já estava aberta (o rearme de R1 depende exatamente dessa
 * idempotência: `begin` é chamado de novo quando `getUserMedia` resolve, para
 * que os 35 s contem a partir do início real da captura, não da abertura do
 * diálogo nativo de permissão do SO).
 */
export function createCaptureWindow(deps: CaptureWindowDeps): CaptureWindow {
  const { setTimer, clearTimer } = deps;
  let open = false;
  let watchdog: unknown;

  function disarm(): void {
    if (watchdog !== undefined) {
      clearTimer(watchdog);
      watchdog = undefined;
    }
  }

  function arm(): void {
    disarm();
    watchdog = setTimer(() => {
      watchdog = undefined;
      open = false;
    }, CAPTURE_WATCHDOG_MS);
  }

  return {
    begin(): void {
      open = true;
      arm();
    },
    end(): void {
      open = false;
      disarm();
    },
    isOpen(): boolean {
      return open;
    },
  };
}
