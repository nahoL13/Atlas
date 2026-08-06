import { describe, expect, it } from 'vitest';
import {
  CAPTURE_REARM_MS,
  FRAME_MS,
  FRAME_SAMPLES,
  MAX_UTTERANCE_MS,
  MIN_SPEECH_MS,
  PRE_ROLL_FRAMES,
  SILENCE_CLOSE_MS,
  SPEAKING_WATCHDOG_BASE_MS,
  SPEAKING_WATCHDOG_MAX_MS,
  SPEAKING_WATCHDOG_PER_CHAR_MS,
  SPEECH_ENTER,
  SPEECH_EXIT,
  THINKING_WATCHDOG_MS,
  VAD_QUEUE_LIMIT,
  createTurnSegmenter,
  handsFreeMicrophoneOpen,
  nextHandsFreeState,
  speakingWatchdogMs,
} from '../src/hands-free.js';
import type { HandsFreeEvent, HandsFreeState, SegmenterEvent } from '../src/hands-free.js';

// SPEC-0052: máquina de estados e segmentador de turno — módulo puro, sem
// microfone/áudio/modelo reais. R1 (resíduo do 2º passe do
// `architecture-reviewer`, também registrado na SPEC): a linha da tabela
// "capturing + speechEnd com fala descartada → listening" NÃO é uma
// transição de `nextHandsFreeState` (o evento sintético de descarte não
// existe na união de 18 eventos) — ela é comportamento do GLUE, coberto em
// `renderer.hands-free.test.ts`. Aqui, CA6 cobre toda linha REPRESENTÁVEL
// pela assinatura `nextHandsFreeState(state, event)`.

const STATES: readonly HandsFreeState[] = [
  'off',
  'unavailable',
  'arming',
  'listening',
  'capturing',
  'transcribing',
  'sending',
  'thinking',
  'speaking',
];

const EVENTS: readonly HandsFreeEvent[] = [
  'enable',
  'disable',
  'unavailable',
  'armed',
  'armFailed',
  'speechStart',
  'speechEnd',
  'utteranceCap',
  'transcriptReady',
  'transcriptEmpty',
  'transcriptFailed',
  'turnStarted',
  'turnRefused',
  'turnDone',
  'turnFailed',
  'thinkingTimeout',
  'speechDone',
  'vadOverrun',
];

describe('constantes pinadas (CA2)', () => {
  it('têm exatamente os valores da tabela do Contrato', () => {
    expect(FRAME_SAMPLES).toBe(512);
    expect(FRAME_MS).toBe(32);
    expect(SPEECH_ENTER).toBe(0.5);
    expect(SPEECH_EXIT).toBe(0.35);
    expect(MIN_SPEECH_MS).toBe(320);
    expect(PRE_ROLL_FRAMES).toBe(10);
    expect(SILENCE_CLOSE_MS).toBe(3000);
    expect(MAX_UTTERANCE_MS).toBe(30000);
    expect(CAPTURE_REARM_MS).toBe(15000);
    expect(VAD_QUEUE_LIMIT).toBe(32);
    expect(THINKING_WATCHDOG_MS).toBe(180000);
    expect(SPEAKING_WATCHDOG_BASE_MS).toBe(8000);
    expect(SPEAKING_WATCHDOG_PER_CHAR_MS).toBe(80);
    expect(SPEAKING_WATCHDOG_MAX_MS).toBe(120000);
  });
});

describe('nextHandsFreeState — exaustão (CA3)', () => {
  it('produto cartesiano 9 × 18 nunca lança; fora da tabela devolve o estado inalterado', () => {
    const knownPairs = new Set<string>();
    for (const state of STATES) {
      for (const event of EVENTS) {
        expect(() => nextHandsFreeState(state, event)).not.toThrow();
        knownPairs.add(`${state}:${event}`);
      }
    }
    expect(knownPairs.size).toBe(STATES.length * EVENTS.length);
  });
});

describe('nextHandsFreeState — toda linha da tabela (CA6)', () => {
  it('off + enable → arming', () => {
    expect(nextHandsFreeState('off', 'enable')).toBe('arming');
  });
  it('arming + armed → listening', () => {
    expect(nextHandsFreeState('arming', 'armed')).toBe('listening');
  });
  it('arming + armFailed → off', () => {
    expect(nextHandsFreeState('arming', 'armFailed')).toBe('off');
  });
  it('listening + speechStart → capturing', () => {
    expect(nextHandsFreeState('listening', 'speechStart')).toBe('capturing');
  });
  it('capturing + speechEnd → transcribing (fecha o microfone e segue)', () => {
    expect(nextHandsFreeState('capturing', 'speechEnd')).toBe('transcribing');
  });
  it('capturing + utteranceCap → transcribing', () => {
    expect(nextHandsFreeState('capturing', 'utteranceCap')).toBe('transcribing');
  });
  it('transcribing + transcriptReady → sending', () => {
    expect(nextHandsFreeState('transcribing', 'transcriptReady')).toBe('sending');
  });
  it('transcribing + transcriptEmpty → listening', () => {
    expect(nextHandsFreeState('transcribing', 'transcriptEmpty')).toBe('listening');
  });
  it('transcribing + transcriptFailed → off', () => {
    expect(nextHandsFreeState('transcribing', 'transcriptFailed')).toBe('off');
  });
  it('sending + turnStarted → thinking', () => {
    expect(nextHandsFreeState('sending', 'turnStarted')).toBe('thinking');
  });
  it('sending + turnRefused → off', () => {
    expect(nextHandsFreeState('sending', 'turnRefused')).toBe('off');
  });
  it('thinking + turnDone → speaking', () => {
    expect(nextHandsFreeState('thinking', 'turnDone')).toBe('speaking');
  });
  it('thinking + turnFailed → off', () => {
    expect(nextHandsFreeState('thinking', 'turnFailed')).toBe('off');
  });
  it('thinking + thinkingTimeout → off', () => {
    expect(nextHandsFreeState('thinking', 'thinkingTimeout')).toBe('off');
  });
  it('speaking + speechDone → arming', () => {
    expect(nextHandsFreeState('speaking', 'speechDone')).toBe('arming');
  });
  it('qualquer estado + disable → off', () => {
    for (const state of STATES) {
      expect(nextHandsFreeState(state, 'disable')).toBe('off');
    }
  });
  it('qualquer estado + vadOverrun → off', () => {
    for (const state of STATES) {
      expect(nextHandsFreeState(state, 'vadOverrun')).toBe('off');
    }
  });
  it('qualquer estado + unavailable → unavailable', () => {
    for (const state of STATES) {
      expect(nextHandsFreeState(state, 'unavailable')).toBe('unavailable');
    }
  });
  it('evento não previsto para o estado: estado inalterado (regra de fecho)', () => {
    expect(nextHandsFreeState('off', 'speechStart')).toBe('off');
    expect(nextHandsFreeState('listening', 'turnDone')).toBe('listening');
    expect(nextHandsFreeState('unavailable', 'enable')).toBe('unavailable');
  });
});

describe('disable a partir de cada estado devolve off (CA4)', () => {
  it.each(STATES.map((s) => [s] as const))('%s + disable → off', (state) => {
    expect(nextHandsFreeState(state, 'disable')).toBe('off');
  });
});

describe('handsFreeMicrophoneOpen (CA5)', () => {
  it.each(STATES.map((s) => [s] as const))('%s', (state) => {
    const expected = state === 'listening' || state === 'capturing';
    expect(handsFreeMicrophoneOpen(state)).toBe(expected);
  });
});

describe('speakingWatchdogMs (CA7)', () => {
  it('regime da base: texto curto fica no piso de 8_000ms', () => {
    expect(speakingWatchdogMs('')).toBe(8000);
    expect(speakingWatchdogMs('oi')).toBe(8000 + 80 * 2);
  });
  it('regime linear: cresce 80ms por caractere', () => {
    expect(speakingWatchdogMs('a'.repeat(100))).toBe(8000 + 80 * 100);
  });
  it('regime do teto: satura em 120_000ms', () => {
    expect(speakingWatchdogMs('a'.repeat(10_000))).toBe(120000);
  });
});

describe('createTurnSegmenter — API mínima (CA12)', () => {
  it('API é exatamente { push, reset }, sem queueLimit na config', () => {
    const segmenter = createTurnSegmenter({
      speechEnter: SPEECH_ENTER,
      speechExit: SPEECH_EXIT,
      minSpeechMs: MIN_SPEECH_MS,
      silenceCloseMs: SILENCE_CLOSE_MS,
      maxUtteranceMs: MAX_UTTERANCE_MS,
      frameMs: FRAME_MS,
    });
    expect(Object.keys(segmenter).sort()).toEqual(['push', 'reset']);
    const first = segmenter.push(0.9);
    expect(first).not.toHaveProperty('queueLimit');
  });
});

function makeSegmenter() {
  return createTurnSegmenter({
    speechEnter: SPEECH_ENTER,
    speechExit: SPEECH_EXIT,
    minSpeechMs: MIN_SPEECH_MS,
    silenceCloseMs: SILENCE_CLOSE_MS,
    maxUtteranceMs: MAX_UTTERANCE_MS,
    frameMs: FRAME_MS,
  });
}

function pushMs(
  segmenter: ReturnType<typeof makeSegmenter>,
  ms: number,
  probability: number,
): SegmenterEvent {
  const frames = Math.round(ms / FRAME_MS);
  let last: SegmenterEvent = { kind: 'none' };
  for (let i = 0; i < frames; i += 1) {
    last = segmenter.push(probability);
  }
  return last;
}

describe('createTurnSegmenter — histerese (CA8)', () => {
  it('entrar em fala (≥0.5) e cair para 0.4 não encerra a fala', () => {
    const segmenter = makeSegmenter();
    expect(segmenter.push(0.6)).toEqual({ kind: 'speechStart' });
    // 0.4 está entre SPEECH_EXIT (0.35) e SPEECH_ENTER (0.5): ainda é "voz"
    // pela histerese — nenhum evento de fim de fala.
    expect(segmenter.push(0.4)).toEqual({ kind: 'none' });
  });

  it('cair abaixo de 0.35 acumula silêncio (não emite speechEnd antes de SILENCE_CLOSE_MS)', () => {
    const segmenter = makeSegmenter();
    segmenter.push(0.6);
    const result = pushMs(segmenter, 1000, 0.1);
    expect(result).toEqual({ kind: 'none' });
  });
});

describe('createTurnSegmenter — silêncio e zeragem (CA9)', () => {
  it('silêncio ≥ SILENCE_CLOSE_MS após fala ≥ MIN_SPEECH_MS emite speechEnd', () => {
    const segmenter = makeSegmenter();
    segmenter.push(0.9); // speechStart, 32ms de fala já contam
    pushMs(segmenter, MIN_SPEECH_MS, 0.9); // fala suficiente
    const result = pushMs(segmenter, SILENCE_CLOSE_MS, 0.0);
    expect(result).toMatchObject({ kind: 'speechEnd', discarded: false });
  });

  it('um frame de voz no meio zera o acumulador (2900ms + voz + 2900ms ⇒ nenhum speechEnd)', () => {
    const segmenter = makeSegmenter();
    segmenter.push(0.9);
    pushMs(segmenter, MIN_SPEECH_MS, 0.9);
    let sawEvent = false;
    let lastEvent: SegmenterEvent = pushMs(segmenter, 2900, 0.0);
    if (lastEvent.kind !== 'none') sawEvent = true;
    lastEvent = segmenter.push(0.9); // reseta o acumulador de silêncio
    if (lastEvent.kind !== 'none') sawEvent = true;
    lastEvent = pushMs(segmenter, 2900, 0.0);
    if (lastEvent.kind !== 'none') sawEvent = true;
    expect(sawEvent).toBe(false);
  });
});

describe('createTurnSegmenter — fala curta é descartada (CA10)', () => {
  it('fala < MIN_SPEECH_MS seguida de silêncio longo emite speechEnd marcado como descarte', () => {
    const segmenter = makeSegmenter();
    segmenter.push(0.9); // 32ms de fala — abaixo de MIN_SPEECH_MS (320ms)
    const result = pushMs(segmenter, SILENCE_CLOSE_MS, 0.0);
    expect(result).toMatchObject({ kind: 'speechEnd', discarded: true });
  });
});

describe('createTurnSegmenter — teto de fala (CA11)', () => {
  it('MAX_UTTERANCE_MS de fala contínua emite utteranceCap', () => {
    const segmenter = makeSegmenter();
    const frames = Math.ceil(MAX_UTTERANCE_MS / FRAME_MS) + 1;
    let event: SegmenterEvent = { kind: 'none' };
    for (let i = 0; i < frames && event.kind !== 'utteranceCap'; i += 1) {
      event = segmenter.push(0.9);
    }
    expect(event).toEqual({ kind: 'utteranceCap' });
  });
});

describe('gate mecânico de ausência de rede (CA45, extensão do CA15 da SPEC-0046)', () => {
  it('src/hands-free.ts não referencia fetch/XMLHttpRequest/WebSocket/EventSource/http/https/net', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'hands-free.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
    expect(source).not.toMatch(/\bWebSocket\b/);
    expect(source).not.toMatch(/\bEventSource\b/);
    expect(source).not.toMatch(/from ['"]node:http['"]/);
    expect(source).not.toMatch(/from ['"]node:https['"]/);
    expect(source).not.toMatch(/from ['"]node:net['"]/);
  });
});
