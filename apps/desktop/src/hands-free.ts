/**
 * Modo hands-free (conversa por voz contínua) — SPEC-0052, ADR-0023. Módulo
 * puro do app: sem `import 'electron'`, sem `window`/`document`, testável
 * sem Electron. Duas peças: a máquina de estados do modo
 * (`nextHandsFreeState`, exaustiva, 9 estados × 18 eventos) e o segmentador
 * de turno (`createTurnSegmenter`, consome só probabilidades — D19: pre-roll
 * e fila de inferência são propriedades do glue, não deste módulo).
 *
 * Contrato pinado (SPEC-0052, seção "Contrato do detector, dos recursos e do
 * laço") — qualquer divergência do binário/runtime reais frente ao que
 * segue é mudança de decisão arquitetural: pare e devolva ao
 * `spec-drafter`, nunca ajuste ad hoc.
 *
 * R1 (achado do 2º passe do `architecture-reviewer`, resolução registrada
 * também na própria SPEC): a tabela de estados tem DUAS linhas para
 * `capturing + speechEnd` — uma para fala suficiente (→ `transcribing`) e
 * uma para fala descartada por ser mais curta que `MIN_SPEECH_MS`
 * (→ `listening`). `HandsFreeEvent`/`nextHandsFreeState` (18 eventos, sem
 * evento de descarte) só representam a PRIMEIRA: `speechEnd` sempre fecha o
 * microfone e segue para `transcribing`. O desfecho de descarte já vem do
 * segmentador (`SegmenterEvent.discarded`) e é tratado inteiramente pelo
 * GLUE — que, ao ver `discarded === true`, NUNCA despacha o evento
 * `'speechEnd'` para `nextHandsFreeState`: só chama `segmenter.reset()` e
 * mantém o estado local em `listening` diretamente. Isso não viola a
 * invariante do microfone (ADR-0023(e)): tanto `capturing` quanto
 * `listening` são estados de microfone ABERTO
 * (`handsFreeMicrophoneOpen` é `true` nos dois), então nenhuma leitura
 * dessa escolha abre ou fecha o microfone fora do que a tabela já previa.
 */

// --- Constantes pinadas (Contrato da SPEC-0052) ---------------------------

/** Janela de análise exigida pelo Silero v5 — 512 amostras a 16 kHz (32 ms). */
export const FRAME_SAMPLES = 512;
/** Duração de uma janela de análise, em ms — derivada de FRAME_SAMPLES a 16 kHz. */
export const FRAME_MS = 32;
/** Probabilidade a partir da qual a janela é classificada como voz. */
export const SPEECH_ENTER = 0.5;
/** Histerese: só abaixo disso a janela volta a ser classificada como não-voz. */
export const SPEECH_EXIT = 0.35;
/** Fala mínima (ms) para que exista turno a fechar — 10 frames de 32 ms. */
export const MIN_SPEECH_MS = 320;
/** Frames retidos antes do início da fala, para não cortar a primeira sílaba. */
export const PRE_ROLL_FRAMES = 10;
/** Ausência contínua de voz (ms) que fecha o turno — decisão de produto 2 do ADR-0023. */
export const SILENCE_CLOSE_MS = 3000;
/** Teto de uma fala (ms); ao atingi-lo o turno fecha e segue para a transcrição. */
export const MAX_UTTERANCE_MS = 30000;
/** Rearme periódico da janela de captura enquanto o modo escuta (ms). */
export const CAPTURE_REARM_MS = 15000;
/** Teto da fila de inferência do glue (≈1 s) — estourar é `vadOverrun`. */
export const VAD_QUEUE_LIMIT = 32;
/** Teto de espera do turno em `thinking` (ms). */
export const THINKING_WATCHDOG_MS = 180000;
/** Base do watchdog de fala (ms). */
export const SPEAKING_WATCHDOG_BASE_MS = 8000;
/** Incremento por caractere do watchdog de fala (ms). */
export const SPEAKING_WATCHDOG_PER_CHAR_MS = 80;
/** Teto do watchdog de fala (ms). */
export const SPEAKING_WATCHDOG_MAX_MS = 120000;

// --- Máquina de estados -----------------------------------------------------

export type HandsFreeState =
  | 'off'
  | 'unavailable'
  | 'arming'
  | 'listening'
  | 'capturing'
  | 'transcribing'
  | 'sending'
  | 'thinking'
  | 'speaking';

export type HandsFreeEvent =
  | 'enable'
  | 'disable'
  | 'unavailable'
  | 'armed'
  | 'armFailed'
  | 'speechStart'
  | 'speechEnd'
  | 'utteranceCap'
  | 'transcriptReady'
  | 'transcriptEmpty'
  | 'transcriptFailed'
  | 'turnStarted'
  | 'turnRefused'
  | 'turnDone'
  | 'turnFailed'
  | 'thinkingTimeout'
  | 'speechDone'
  | 'vadOverrun';

/** Transições específicas de um estado — tudo que não está aqui cai na regra de fecho. */
const TRANSITIONS: Partial<
  Record<HandsFreeState, Partial<Record<HandsFreeEvent, HandsFreeState>>>
> = {
  off: { enable: 'arming' },
  arming: { armed: 'listening', armFailed: 'off' },
  listening: { speechStart: 'capturing' },
  capturing: { speechEnd: 'transcribing', utteranceCap: 'transcribing' },
  transcribing: {
    transcriptReady: 'sending',
    transcriptEmpty: 'listening',
    transcriptFailed: 'off',
  },
  sending: { turnStarted: 'thinking', turnRefused: 'off' },
  thinking: { turnDone: 'speaking', turnFailed: 'off', thinkingTimeout: 'off' },
  speaking: { speechDone: 'arming' },
  unavailable: {},
};

/** Transições válidas a partir de QUALQUER estado ("qualquer" na tabela da SPEC). */
const GLOBAL_TRANSITIONS: Partial<Record<HandsFreeEvent, HandsFreeState>> = {
  disable: 'off',
  vadOverrun: 'off',
  unavailable: 'unavailable',
};

/**
 * Transição pura e exaustiva (9 estados × 18 eventos). Nunca lança; toda
 * combinação fora da tabela devolve o estado inalterado (regra de fecho).
 */
export function nextHandsFreeState(state: HandsFreeState, event: HandsFreeEvent): HandsFreeState {
  const globalNext = GLOBAL_TRANSITIONS[event];
  if (globalNext !== undefined) {
    return globalNext;
  }
  const specific = TRANSITIONS[state]?.[event];
  return specific ?? state;
}

/** Predicado único da invariante do microfone (ADR-0023(e)): aberto sse `listening`/`capturing`. */
export function handsFreeMicrophoneOpen(state: HandsFreeState): boolean {
  return state === 'listening' || state === 'capturing';
}

/** Watchdog de fala: `clamp(8_000 + 80 × caracteres, 8_000, 120_000)`. */
export function speakingWatchdogMs(text: string): number {
  const raw = SPEAKING_WATCHDOG_BASE_MS + SPEAKING_WATCHDOG_PER_CHAR_MS * text.length;
  return Math.min(Math.max(raw, SPEAKING_WATCHDOG_BASE_MS), SPEAKING_WATCHDOG_MAX_MS);
}

// --- Segmentador de turno ---------------------------------------------------

export type SegmenterEvent =
  | { kind: 'none' }
  | { kind: 'speechStart' }
  | { kind: 'speechEnd'; speechMs: number; discarded: boolean }
  | { kind: 'utteranceCap' };

export interface TurnSegmenterConfig {
  readonly speechEnter: number;
  readonly speechExit: number;
  readonly minSpeechMs: number;
  readonly silenceCloseMs: number;
  readonly maxUtteranceMs: number;
  readonly frameMs: number;
}

export interface TurnSegmenter {
  push(probability: number): SegmenterEvent;
  reset(): void;
}

/**
 * Consome só probabilidades: não conhece frames, buffer de áudio nem fila
 * (D19) — pre-roll e fila de inferência são propriedades do glue.
 */
export function createTurnSegmenter(config: TurnSegmenterConfig): TurnSegmenter {
  const { speechEnter, speechExit, minSpeechMs, silenceCloseMs, maxUtteranceMs, frameMs } = config;

  let inSpeech = false;
  let voiceMs = 0;
  let silenceMs = 0;
  let utteranceMs = 0;

  function reset(): void {
    inSpeech = false;
    voiceMs = 0;
    silenceMs = 0;
    utteranceMs = 0;
  }

  function push(probability: number): SegmenterEvent {
    if (!inSpeech) {
      if (probability >= speechEnter) {
        inSpeech = true;
        voiceMs = frameMs;
        silenceMs = 0;
        utteranceMs = frameMs;
        return { kind: 'speechStart' };
      }
      return { kind: 'none' };
    }

    utteranceMs += frameMs;
    if (probability >= speechExit) {
      voiceMs += frameMs;
      silenceMs = 0;
    } else {
      silenceMs += frameMs;
    }

    if (utteranceMs >= maxUtteranceMs) {
      reset();
      return { kind: 'utteranceCap' };
    }

    if (silenceMs >= silenceCloseMs) {
      const discarded = voiceMs < minSpeechMs;
      const event: SegmenterEvent = { kind: 'speechEnd', speechMs: voiceMs, discarded };
      reset();
      return event;
    }

    return { kind: 'none' };
  }

  return { push, reset };
}

// --- Porta injetável do detector (ADR-0023(c)) ------------------------------

/**
 * Porta injetável do detector (ADR-0023(c)) — satisfeita estruturalmente
 * pelo ponto de criação único do glue (CA 23/24). Nenhum tipo do runtime de
 * inferência aparece nesta interface: é isso que torna a troca local.
 */
export interface VoiceActivityDetector {
  /** Probabilidade de voz para UM frame de `FRAME_SAMPLES` amostras a 16 kHz. */
  probe(frame: Float32Array): Promise<number>;
  /** Zera o estado recorrente ao (re)iniciar a escuta. */
  reset(): void;
}
