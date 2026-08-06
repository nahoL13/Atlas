import { afterEach, describe, expect, it } from 'vitest';
import {
  FRAME_SAMPLES,
  MAX_UTTERANCE_MS,
  MIN_SPEECH_MS,
  PRE_ROLL_FRAMES,
  SILENCE_CLOSE_MS,
  SPEECH_ENTER,
  THINKING_WATCHDOG_MS,
  VAD_QUEUE_LIMIT,
} from '../src/hands-free.js';
import type { RendererFixture, RendererFixtureOptions } from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// SPEC-0052: modo hands-free — laço inteiro exercitado no harness jsdom, sem
// microfone/áudio/modelo reais. O detector é injetado pela porta (D21/CA24),
// nunca por `window.ort` — prova mecânica de que a porta é real.

const FRAME_MS = 32;
const LOCAL_VOICE = { voiceURI: 'local-1', name: 'Local Um', localService: true };

interface HtmlButtonLike {
  disabled: boolean;
  title: string;
  textContent: string;
  click(): void;
}

let fixture: RendererFixture | undefined;

afterEach(() => {
  fixture?.close();
  fixture = undefined;
});

function toggleEl(f: RendererFixture): HtmlButtonLike {
  return f.document.getElementById('hands-free-toggle') as unknown as HtmlButtonLike;
}

function statusText(f: RendererFixture): string {
  return f.document.getElementById('hands-free-status')?.textContent ?? '';
}

function indicatorText(f: RendererFixture): string {
  return f.document.getElementById('hands-free-indicator')?.textContent ?? '';
}

interface ScriptedDetector {
  probe(frame: Float32Array): Promise<number>;
  reset(): void;
}

function scriptedDetector(sequence: readonly number[]): {
  detector: ScriptedDetector;
  resetCount: () => number;
  probeCount: () => number;
} {
  let index = 0;
  let resets = 0;
  return {
    detector: {
      probe: () => {
        const value = sequence[Math.min(index, sequence.length - 1)] ?? 0;
        index += 1;
        return Promise.resolve(value);
      },
      reset: () => {
        resets += 1;
      },
    },
    resetCount: () => resets,
    probeCount: () => index,
  };
}

/** Detector que nunca resolve — usado para exercitar o overrun da fila (CA34). */
function neverResolvingDetector(): ScriptedDetector {
  return {
    probe: () => new Promise(() => {}),
    reset: () => {},
  };
}

async function open(options: RendererFixtureOptions = {}): Promise<RendererFixture> {
  fixture = await loadRenderer({
    stt: { available: true },
    vad: { available: true },
    osVoices: [LOCAL_VOICE],
    ...options,
  });
  return fixture;
}

/** Liga o modo com um detector já roteirizado, injetado pela PORTA (D21) — nunca via `window.ort`. */
async function enableHandsFree(
  f: RendererFixture,
  detector: ScriptedDetector = scriptedDetector([0]).detector,
): Promise<void> {
  const setFactory = f.internals['setHandsFreeDetectorFactory'] as (
    factory: () => Promise<ScriptedDetector>,
  ) => void;
  setFactory(() => Promise.resolve(detector));
  toggleEl(f).click();
  await f.flush();
}

/** Empurra `count` frames em lotes de 8 (cadência real do ScriptProcessorNode), drenando a fila entre lotes. */
async function pushFrames(f: RendererFixture, count: number): Promise<void> {
  let remaining = count;
  while (remaining > 0) {
    const batch = Math.min(remaining, 8);
    for (let i = 0; i < batch; i += 1) {
      f.media.feedAudioProcess(new Float32Array(FRAME_SAMPLES));
    }
    remaining -= batch;
    await f.flush();
  }
}

function framesFor(ms: number): number {
  return Math.ceil(ms / FRAME_MS);
}

describe('toggle: três causas de indisponibilidade (CA26)', () => {
  it('STT indisponível ⇒ desabilitado com motivo visível', async () => {
    const f = await open({ stt: { available: false } });
    await f.flush();
    expect(toggleEl(f).disabled).toBe(true);
    expect(statusText(f)).not.toBe('');
  });

  it('VAD indisponível ⇒ desabilitado com motivo visível', async () => {
    const f = await open({ vad: { available: false } });
    await f.flush();
    expect(toggleEl(f).disabled).toBe(true);
    expect(statusText(f)).not.toBe('');
  });

  it('nenhuma voz de saída disponível ⇒ desabilitado com motivo visível', async () => {
    const f = await open({ osVoices: [] });
    await f.flush();
    expect(toggleEl(f).disabled).toBe(true);
    expect(statusText(f)).not.toBe('');
  });

  it('todas disponíveis ⇒ habilitado', async () => {
    const f = await open();
    await f.flush();
    expect(toggleEl(f).disabled).toBe(false);
  });
});

describe('toggle: reavaliação nos gatilhos assíncronos (CA27)', () => {
  it('voiceschanged com voz local nova habilita sem recarregar', async () => {
    const f = await open({ osVoices: [] });
    await f.flush();
    expect(toggleEl(f).disabled).toBe(true);

    f.speechSynthesis.setVoices([LOCAL_VOICE]);
    f.speechSynthesis.fireVoicesChanged();
    await f.flush();

    expect(toggleEl(f).disabled).toBe(false);
  });

  it('resposta assíncrona de atlas:vad:available habilita sem recarregar', async () => {
    let resolveAvailable: (value: { available: boolean }) => void = () => {};
    const pending = new Promise<{ available: boolean }>((resolve) => {
      resolveAvailable = resolve;
    });
    const f = await open({
      atlas: {
        vad: {
          available: () => pending,
          resources: () => Promise.resolve({ ok: false, reason: 'x' }),
        },
      },
    });
    await f.flush();
    expect(toggleEl(f).disabled).toBe(true);

    resolveAvailable({ available: true });
    await f.flush();

    expect(toggleEl(f).disabled).toBe(false);
  });

  it('chegada do catálogo/disponibilidade Piper (loadPiperVoices) reavalia o toggle', async () => {
    let resolveAvailable: (value: boolean) => void = () => {};
    const pending = new Promise<boolean>((resolve) => {
      resolveAvailable = resolve;
    });
    const f = await open({
      osVoices: [],
      atlas: {
        tts: {
          voices: () => Promise.resolve([]),
          speak: () => Promise.resolve(undefined),
          cancel: () => Promise.resolve(),
          available: () => pending,
        },
      },
    });
    await f.flush();
    expect(toggleEl(f).disabled).toBe(true);

    resolveAvailable(false); // permanece indisponível, mas o gatilho rodou sem lançar
    await f.flush();
    expect(toggleEl(f).disabled).toBe(true);
  });
});

describe('arranque (CA28)', () => {
  it('modo nasce desligado: nenhum getUserMedia/captureBegin sem clique', async () => {
    const f = await open();
    await f.flush();
    expect(f.calls.getUserMediaCalls).toEqual([]);
    expect(f.calls.sttCaptureBeginCalls).toBe(0);
  });
});

describe('ligar o modo (CA29)', () => {
  it('captureBegin ANTES de getUserMedia, begin de novo ao resolver (rearme), detector pela porta', async () => {
    const f = await open();
    await f.flush();
    const { detector } = scriptedDetector([0]);
    await enableHandsFree(f, detector);

    expect(f.calls.sttCaptureBeginCalls).toBeGreaterThanOrEqual(2);
    expect(f.calls.getUserMediaCalls).toEqual([{ audio: true }]);
    expect(indicatorText(f)).toContain('Ouvindo');
  });
});

/** Extrai o corpo de `function <name>(...) { ... }` por contagem de chaves (evita regex frágil sobre indentação). */
function extractFunctionSpan(source: string, signature: string): { start: number; end: number } {
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`assinatura não encontrada: ${signature}`);
  }
  const openBrace = source.indexOf('{', start);
  let depth = 0;
  let index = openBrace;
  for (; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return { start, end: index + 1 };
}

describe('ponto único de criação do detector (CA23)', () => {
  it('ort./InferenceSession.create só aparecem dentro de createHandsFreeDetector', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const rendererPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'renderer',
      'renderer.js',
    );
    const source = readFileSync(rendererPath, 'utf8');
    const span = extractFunctionSpan(source, 'async function createHandsFreeDetector()');
    const body = source.slice(span.start, span.end);
    expect(body).toMatch(/InferenceSession\.create/);
    const outside = source.slice(0, span.start) + source.slice(span.end);
    expect(outside).not.toMatch(/InferenceSession\.create/);
    expect(outside).not.toMatch(/window\.ort\./);
  });

  it('dublê de teste entra pela PORTA, sem window.ort presente (CA24)', async () => {
    const f = await open();
    await f.flush();
    expect((f.window as unknown as { ort?: unknown }).ort).toBeUndefined();
    const { detector } = scriptedDetector([0]);
    await enableHandsFree(f, detector);
    expect(indicatorText(f)).toContain('Ouvindo');
  });
});

describe('detector resetado a cada entrada em listening (CA25)', () => {
  it('reset() chamado ao ligar e de novo ao reabrir após um turno completo', async () => {
    const f = await open({
      chatSend: () => ({ reply: 'oi', steps: [], learned: [] }),
    });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector, resetCount } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    expect(resetCount()).toBe(1);

    await pushFrames(f, sequence.length);
    await f.flush();
    // segue até 'thinking' -> 'speaking' -> onDone imediato (backend os, sem
    // voz corresponde à selecionada por padrão) -> reabre o mic -> arming/listening
    f.speechSynthesis.fireUtteranceEvent(0, 'end');
    await f.flush();

    expect(resetCount()).toBeGreaterThanOrEqual(2);
  });
});

describe('ciclo completo (CA30/CA31)', () => {
  it('fala → 3s de silêncio → transcribe uma vez → auto-envio → resposta falada → mic reaberto', async () => {
    const f = await open({
      chatSend: (_session, input) => ({ reply: `resposta: ${input}`, steps: [], learned: [] }),
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: true, text: 'olá atlas', durationMs: 500 }),
      },
    });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);

    await pushFrames(f, sequence.length);
    await f.flush();

    expect(f.calls.sttTranscribeCalls).toHaveLength(1);
    expect(f.calls.chatSend).toEqual([{ session: 'session-1', input: 'olá atlas' }]);

    // Invariante do microfone: durante transcribing/sending/thinking/speaking
    // o mic já foi fechado — nenhum getUserMedia novo antes do fim da fala.
    expect(f.calls.getUserMediaCalls).toEqual([{ audio: true }]);
    expect(f.calls.mediaTrackStops).toBeGreaterThanOrEqual(1);
    expect(f.calls.audioContextClosed).toBeGreaterThanOrEqual(1);

    f.speechSynthesis.fireUtteranceEvent(0, 'end');
    await f.flush();

    // Mic reaberto para o turno seguinte.
    expect(f.calls.getUserMediaCalls).toEqual([{ audio: true }, { audio: true }]);
  });
});

describe('overrun da fila (CA34)', () => {
  it('fila > VAD_QUEUE_LIMIT desliga o modo com aviso, microfone fechado', async () => {
    const f = await open();
    await f.flush();
    const detector = neverResolvingDetector();
    await enableHandsFree(f, detector);

    for (let i = 0; i < VAD_QUEUE_LIMIT + 2; i += 1) {
      f.media.feedAudioProcess(new Float32Array(FRAME_SAMPLES));
    }
    await f.flush();

    expect(toggleEl(f).textContent).toContain('Ligar');
    expect(statusText(f)).not.toBe('');
    expect(f.calls.sttCaptureEndCalls).toBeGreaterThanOrEqual(1);
  });
});

describe('pré-condições de envio (CA36)', () => {
  it('sessão de chat ausente ⇒ turnRefused, sem despachar submit, modo desligado', async () => {
    const f = await open({
      atlas: { chat: { open: () => new Promise(() => {}) } },
    });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    expect(f.calls.chatSend).toEqual([]);
    expect(toggleEl(f).textContent).toContain('Ligar');
  });

  it('askInFlight verdadeiro ⇒ turnRefused, modo desligado', async () => {
    const pendingAsk = new Promise<{ text: string; steps: []; learned: [] }>(() => {});
    const f = await open({ atlas: { ask: () => pendingAsk } });
    await f.flush();
    (f.document.getElementById('objective') as unknown as { value: string }).value = 'algo';
    f.document
      .getElementById('ask-form')
      ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
    await f.flush();

    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    // Toggle deve estar desabilitado por causa do `ask` em voo — checa isso
    // primeiro, e só então (se habilitado por engano) tenta ligar.
    expect(toggleEl(f).disabled).toBe(true);
    void detector;
  });
});

describe('gancho de início confirmado (CA37, achado A1)', () => {
  it('recusa silenciosa simulada do #chat-form ⇒ turnRefused NO MESMO TICK, nunca fica em sending/thinking', async () => {
    const f = await open({
      chatSend: (_session, input) => ({ reply: `resposta: ${input}`, steps: [], learned: [] }),
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: true, text: 'olá atlas', durationMs: 500 }),
      },
    });
    await f.flush();

    // Simula a guarda da SPEC-0048/D2 (`chatTurnInFlight || askInFlight`)
    // "disparando" DEPOIS de as pré-condições do glue já terem passado: um
    // listener no `document`, fase de CAPTURA (roda ANTES do listener do
    // próprio `#chat-form`, mesmo registrado depois — captura precede o
    // alvo), que impede o manipulador real de rodar — logo
    // `notifyHandsFreeTurnStarted()` NUNCA é chamado, exatamente como uma
    // recusa silenciosa real produziria.
    f.window.document.addEventListener(
      'submit',
      (event: Event) => {
        if ((event.target as { id?: string } | null)?.id === 'chat-form') {
          event.stopImmediatePropagation();
        }
      },
      { capture: true },
    );

    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    // `chat.send` NUNCA foi chamado (o manipulador real nunca rodou) e o
    // modo desligou sozinho — nunca preso em `sending`/`thinking` com o
    // microfone fechado e o indicador mentindo.
    expect(f.calls.chatSend).toEqual([]);
    expect(toggleEl(f).textContent).toContain('Ligar');
    expect(statusText(f)).not.toBe('');
    expect(indicatorText(f)).not.toContain('Pensando');
    expect(indicatorText(f)).not.toContain('Enviando');
  });

  it('caminho feliz: o gancho confirma o início e chat.send é chamado exatamente uma vez', async () => {
    const f = await open({
      chatSend: (_session, input) => ({ reply: `resposta: ${input}`, steps: [], learned: [] }),
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: true, text: 'olá atlas', durationMs: 500 }),
      },
    });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    // Confirmação bem-sucedida do gancho ⇒ turnStarted ⇒ thinking ⇒ chat.send
    // chamado exatamente uma vez, nunca turnRefused (modo continua ligado).
    expect(f.calls.chatSend).toEqual([{ session: 'session-1', input: 'olá atlas' }]);
    expect(toggleEl(f).textContent).toContain('Desligar');
  });
});

describe('watchdog de thinking (CA38)', () => {
  it('turno pendente indefinidamente: clock.advance leva o modo a off com aviso', async () => {
    const pendingTurn = new Promise<{ reply: string; steps: []; learned: [] }>(() => {});
    const f = await open({ atlas: { chat: { send: () => pendingTurn } } });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    expect(indicatorText(f)).toContain('Pensando');
    f.clock.advance(THINKING_WATCHDOG_MS);
    await f.flush();

    expect(toggleEl(f).textContent).toContain('Ligar');
    expect(statusText(f)).not.toBe('');
  });
});

describe('freio: desligar fecha o microfone em qualquer estado (CA39)', () => {
  // CA 39 (emendado — R6, decisão humana de 2026-08-06, escalada pela 2ª
  // reprovação do `spec-validator`): a exigência é "um teste por estado"
  // sobre os SEIS estados alcançáveis por um gesto real de desligar
  // (`arming`/`listening`/`capturing`/`transcribing`/`thinking`/`speaking`),
  // não os 9. A justificativa formal de por que `off`/`unavailable`/`sending`
  // ficam de fora — e por que isso não é lacuna de comportamento — vive na
  // SPEC (nota R6, seção "Resíduos resolvidos pelo `spec-implementer`");
  // este comentário só aponta para lá, para os dois nunca divergirem
  // (mesmo cuidado do R4). Resumo: `off`→clicar LIGA, não desliga;
  // `unavailable`→toggle desabilitado, clique é no-op por design (CA26/28);
  // `sending`→termina no mesmo tick do `submit` (sem gap assíncrono para o
  // harness observar), provado só no nível puro pela CA4
  // (`hands-free.test.ts`, "disable a partir de cada estado devolve off").
  it('desligar em arming (aguardando getUserMedia) fecha o que já foi aberto', async () => {
    const f = await open({ media: { getUserMediaDelayMs: 999_999 } });
    await f.flush();
    const setFactory = f.internals['setHandsFreeDetectorFactory'] as (
      factory: () => Promise<ScriptedDetector>,
    ) => void;
    setFactory(() => Promise.resolve(scriptedDetector([0]).detector));
    toggleEl(f).click();
    await f.flush();
    expect(indicatorText(f)).toContain('Aguardando permissão');

    toggleEl(f).click();
    await f.flush();

    expect(f.calls.sttCaptureEndCalls).toBeGreaterThanOrEqual(1);
    expect(toggleEl(f).textContent).toContain('Ligar');
  });

  it('desligar em listening fecha o microfone imediatamente', async () => {
    const f = await open();
    await f.flush();
    const { detector } = scriptedDetector([0]);
    await enableHandsFree(f, detector);
    expect(indicatorText(f)).toContain('Ouvindo');

    toggleEl(f).click();
    await f.flush();

    expect(f.calls.mediaTrackStops).toBeGreaterThanOrEqual(1);
    expect(f.calls.audioContextClosed).toBeGreaterThanOrEqual(1);
    expect(toggleEl(f).textContent).toContain('Ligar');
  });

  it('desligar em capturing (fala em andamento) fecha o microfone imediatamente', async () => {
    const f = await open();
    await f.flush();
    const { detector } = scriptedDetector([0.9]);
    await enableHandsFree(f, detector);
    await pushFrames(f, 1); // 1 frame de fala ⇒ listening → capturing
    expect(indicatorText(f)).toContain('Capturando');

    toggleEl(f).click();
    await f.flush();

    expect(f.calls.mediaTrackStops).toBeGreaterThanOrEqual(1);
    expect(f.calls.audioContextClosed).toBeGreaterThanOrEqual(1);
    expect(toggleEl(f).textContent).toContain('Ligar');
  });

  it('desligar em transcribing (transcrição pendente) desliga o modo, mic já fechado', async () => {
    const pendingTranscribe = new Promise<{ ok: true; text: string; durationMs: number }>(() => {});
    const f = await open({ stt: { available: true, transcribe: () => pendingTranscribe } });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();
    expect(indicatorText(f)).toContain('Transcrevendo');
    // O microfone já foi fechado ANTES de entrar em transcribing.
    expect(f.calls.mediaTrackStops).toBeGreaterThanOrEqual(1);

    toggleEl(f).click();
    await f.flush();

    expect(toggleEl(f).textContent).toContain('Ligar');
  });

  it('desligar durante thinking chama window.atlas.cancel() uma vez', async () => {
    const pendingTurn = new Promise<{ reply: string; steps: []; learned: [] }>(() => {});
    const f = await open({ atlas: { chat: { send: () => pendingTurn } } });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();
    expect(indicatorText(f)).toContain('Pensando');

    toggleEl(f).click();
    await f.flush();

    expect(f.calls.cancelCalls).toBe(1);
  });

  it('desligar em speaking (fala do assistente pendente) desliga sem esperar o fim da fala', async () => {
    const f = await open({
      chatSend: () => ({ reply: 'resposta longa', steps: [], learned: [] }),
      atlas: {
        tts: {
          voices: () => Promise.resolve([]),
          speak: () => new Promise(() => {}), // Piper nunca resolve
          cancel: () => Promise.resolve(),
          available: () => Promise.resolve(false), // backend cai para 'os'
        },
      },
    });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();
    // backend 'os': utterance criado, nenhum evento disparado ⇒ preso em
    // speaking até o watchdog OU até o freio.
    expect(indicatorText(f)).toContain('Falando');

    toggleEl(f).click();
    await f.flush();

    // Desligar NÃO interrompe a fala em curso (decisões de produto 3/4 do
    // ADR-0023) — só a ESCUTA para; o toggle volta a "Ligar" sem esperar
    // `end`/`error` do utterance.
    expect(toggleEl(f).textContent).toContain('Ligar');
  });
});

describe('desfechos de exceção (CA40)', () => {
  it('transcriptEmpty: reabre o microfone, não dispara submit', async () => {
    const f = await open({
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: true, text: '   ', durationMs: 10 }),
      },
    });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    expect(f.calls.chatSend).toEqual([]);
    expect(toggleEl(f).textContent).toContain('Desligar');
  });

  it('transcriptFailed: desliga o modo com aviso, microfone fechado', async () => {
    const f = await open({
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: false, reason: 'engine-failed' }),
      },
    });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    expect(toggleEl(f).textContent).toContain('Ligar');
    expect(statusText(f)).not.toBe('');
  });

  it('turnFailed (erro genérico do turno): desliga o modo com aviso, microfone fechado', async () => {
    const f = await open({
      chatSend: () => Promise.reject(new Error('falha no turno')),
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: true, text: 'olá atlas', durationMs: 500 }),
      },
    });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    expect(toggleEl(f).textContent).toContain('Ligar');
    expect(statusText(f)).toContain('falha no turno');
    expect(f.calls.mediaTrackStops).toBeGreaterThanOrEqual(1);
  });

  it('turnFailed por recusa de quarentena de sessão (SPEC-0051): desliga o modo, nunca tenta de novo em laço', async () => {
    const f = await open({
      chatSend: () =>
        Promise.reject(
          new Error(
            'Esta conversa está em quarentena até o trabalho abandonado assentar — turnos novos são recusados.',
          ),
        ),
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: true, text: 'olá atlas', durationMs: 500 }),
      },
    });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    expect(f.calls.chatSend).toHaveLength(1);
    expect(toggleEl(f).textContent).toContain('Ligar');
    expect(statusText(f)).toContain('quarentena');
    // Nunca tenta de novo sozinho — o modo fica desligado, não volta a
    // `listening` reabrindo o microfone em laço.
    expect(f.calls.getUserMediaCalls).toHaveLength(1);
  });
});

describe('speakText(text, onDone) — caminhos de conclusão (CA41/R3)', () => {
  function speakTextFn(f: RendererFixture): (text: string, onDone?: () => void) => void {
    return f.internals['speakText'] as (text: string, onDone?: () => void) => void;
  }

  it('backend none: onDone chamado imediatamente', async () => {
    const f = await open({ osVoices: [] });
    await f.flush();
    let called = 0;
    speakTextFn(f)('oi', () => {
      called += 1;
    });
    expect(called).toBe(1);
  });

  it('SO: end do utterance chama onDone exatamente uma vez', async () => {
    const f = await open();
    await f.flush();
    let called = 0;
    speakTextFn(f)('oi', () => {
      called += 1;
    });
    f.speechSynthesis.fireUtteranceEvent(0, 'end');
    f.speechSynthesis.fireUtteranceEvent(0, 'end');
    expect(called).toBe(1);
  });

  it('SO: error do utterance chama onDone exatamente uma vez', async () => {
    const f = await open();
    await f.flush();
    let called = 0;
    speakTextFn(f)('oi', () => {
      called += 1;
    });
    f.speechSynthesis.fireUtteranceEvent(0, 'error');
    expect(called).toBe(1);
  });

  it('R3: voz local sumiu entre seleção e fala ⇒ onDone imediato, sem utterance', async () => {
    const f = await open();
    await f.flush();
    // Remove a voz DEPOIS de disponível na seleção mas ANTES do speak
    // (synth.speak reconsulta getVoices() no momento da fala).
    f.speechSynthesis.setVoices([]);
    let called = 0;
    speakTextFn(f)('oi', () => {
      called += 1;
    });
    expect(called).toBe(1);
    expect(f.speechSynthesis.utteranceCount()).toBe(0);
  });

  it('Piper: ended do <audio> chama onDone exatamente uma vez', async () => {
    const f = await open({
      piperAvailable: true,
      piperVoices: [
        {
          id: 'pt_BR-faber-medium',
          voiceURI: 'piper:faber',
          name: 'Faber',
          language: 'pt-BR',
          sampleRate: 22050,
        },
      ],
      atlas: {
        tts: {
          voices: () =>
            Promise.resolve([
              {
                id: 'pt_BR-faber-medium',
                voiceURI: 'piper:faber',
                name: 'Faber',
                language: 'pt-BR',
                sampleRate: 22050,
              },
            ]),
          speak: () => Promise.resolve({ wav: new Uint8Array([1, 2, 3]), sampleRate: 22050 }),
          cancel: () => Promise.resolve(),
          available: () => Promise.resolve(true),
        },
      },
    });
    await f.flush();
    let called = 0;
    speakTextFn(f)('oi', () => {
      called += 1;
    });
    await f.flush();
    f.audio.fireEvent(0, 'ended');
    f.audio.fireEvent(0, 'ended');
    expect(called).toBe(1);
  });

  it('Piper: error do <audio> chama onDone exatamente uma vez', async () => {
    const f = await open({
      piperAvailable: true,
      piperVoices: [
        {
          id: 'pt_BR-faber-medium',
          voiceURI: 'piper:faber',
          name: 'Faber',
          language: 'pt-BR',
          sampleRate: 22050,
        },
      ],
      atlas: {
        tts: {
          voices: () =>
            Promise.resolve([
              {
                id: 'pt_BR-faber-medium',
                voiceURI: 'piper:faber',
                name: 'Faber',
                language: 'pt-BR',
                sampleRate: 22050,
              },
            ]),
          speak: () => Promise.resolve({ wav: new Uint8Array([1, 2, 3]), sampleRate: 22050 }),
          cancel: () => Promise.resolve(),
          available: () => Promise.resolve(true),
        },
      },
    });
    await f.flush();
    let called = 0;
    speakTextFn(f)('oi', () => {
      called += 1;
    });
    await f.flush();
    f.audio.fireEvent(0, 'error');
    expect(called).toBe(1);
  });

  it('watchdog: onDone chamado via clock.advance quando nenhum evento chega', async () => {
    const f = await open({
      atlas: {
        tts: {
          voices: () => Promise.resolve([]),
          speak: () => new Promise(() => {}),
          cancel: () => Promise.resolve(),
          available: () => Promise.resolve(false),
        },
      },
    });
    await f.flush();
    // backend 'os' (sem Piper) — SpeechSynthesisUtterance criado mas nunca
    // emite end/error nesta simulação (removido dos listeners manualmente).
    const originalFire = f.speechSynthesis.fireUtteranceEvent;
    void originalFire;

    let called = 0;
    speakTextFn(f)('a'.repeat(50), () => {
      called += 1;
    });
    // Sem disparar end/error: só o watchdog de speakingWatchdogMs resolve.
    f.clock.advance(8000 + 80 * 50);
    await f.flush();
    expect(called).toBe(1);
  });
});

describe('observador de utterance sem tocar réplica (CA42)', () => {
  it('renderer.js contém exatamente uma ocorrência de "new SpeechSynthesisUtterance("', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const rendererPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'renderer',
      'renderer.js',
    );
    const source = readFileSync(rendererPath, 'utf8');
    const matches = source.match(/new SpeechSynthesisUtterance\(/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe('nada persistido (CA43)', () => {
  it('renderer.js não referencia localStorage/sessionStorage/indexedDB', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const rendererPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'renderer',
      'renderer.js',
    );
    const source = readFileSync(rendererPath, 'utf8');
    expect(source).not.toMatch(/\blocalStorage\b/);
    expect(source).not.toMatch(/\bsessionStorage\b/);
    expect(source).not.toMatch(/\bindexedDB\b/);
  });

  it('payload IPC do STT é exatamente { pcm, sampleRate } (forma já pinada pela SPEC-0046)', async () => {
    const f = await open({
      stt: {
        available: true,
        transcribe: () => Promise.resolve({ ok: true, text: 'olá', durationMs: 100 }),
      },
    });
    await f.flush();
    const speechFrames = framesFor(MIN_SPEECH_MS) + 1;
    const silenceFrames = framesFor(SILENCE_CLOSE_MS) + 1;
    const sequence = [...Array(speechFrames).fill(0.9), ...Array(silenceFrames).fill(0.0)];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    expect(f.calls.sttTranscribeCalls).toHaveLength(1);
    const call = f.calls.sttTranscribeCalls[0]!;
    expect(Object.keys(call).sort()).toEqual(['pcm', 'sampleRate']);
    expect(call.sampleRate).toBe(16000);
  });
});

describe('pre-roll: tamanho EXATO do payload (CA32)', () => {
  it('100 frames de silêncio + 20 frames de fala + silêncio de fecho ⇒ pcm.byteLength EXATO', async () => {
    const silenceCloseFrames = Math.ceil(SILENCE_CLOSE_MS / FRAME_MS); // 94
    const speechFrameCount = 20;
    let observedByteLength: number | undefined;
    const f = await open({
      stt: {
        available: true,
        transcribe: (pcm) => {
          observedByteLength = pcm.byteLength;
          return Promise.resolve({ ok: true, text: 'olá', durationMs: 100 });
        },
      },
    });
    await f.flush();

    const sequence = [
      ...Array(100).fill(0.0), // preenche e transborda o anel de pre-roll (10)
      ...Array(speechFrameCount).fill(0.9),
      ...Array(silenceCloseFrames).fill(0.0), // fecha o turno exatamente aqui
    ];
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    expect(f.calls.sttTranscribeCalls).toHaveLength(1);
    // Fórmula exata da SPEC-0052 (CA32): (PRE_ROLL_FRAMES + 20 + ceil(3000/32)) × 512 × 2 bytes.
    const expectedFrames = PRE_ROLL_FRAMES + speechFrameCount + silenceCloseFrames;
    expect(observedByteLength).toBe(expectedFrames * FRAME_SAMPLES * 2);
    expect(observedByteLength).toBe((10 + 20 + 94) * 512 * 2);
  });
});

describe('teto de fala permanece abaixo de MAX_PCM_BYTES (CA33)', () => {
  it('fala no teto (MAX_UTTERANCE_MS) produz payload < 1_000_000 bytes', async () => {
    const f = await open({
      stt: {
        available: true,
        transcribe: (pcm) => {
          expect(pcm.byteLength).toBeLessThan(1_000_000);
          return Promise.resolve({ ok: true, text: 'olá', durationMs: 100 });
        },
      },
    });
    await f.flush();
    const capFrames = framesFor(MAX_UTTERANCE_MS) + 1;
    const sequence = Array(capFrames).fill(0.9);
    const { detector } = scriptedDetector(sequence);
    await enableHandsFree(f, detector);
    await pushFrames(f, sequence.length);
    await f.flush();

    expect(f.calls.sttTranscribeCalls).toHaveLength(1);
  });
});

describe('rearme periódico e sua cessação (CA35)', () => {
  it('em listening, clock.advance(45_000) produz ao menos três begins adicionais', async () => {
    const f = await open();
    await f.flush();
    const { detector } = scriptedDetector([0]);
    await enableHandsFree(f, detector);
    const before = f.calls.sttCaptureBeginCalls;

    f.clock.advance(45_000);
    await f.flush();

    expect(f.calls.sttCaptureBeginCalls - before).toBeGreaterThanOrEqual(3);
  });
});

// Constantes usadas só para documentar a intenção dos cálculos de frame acima.
void SPEECH_ENTER;

describe('superfície e CSP (CA20/CA21/CA22)', () => {
  it('index.html contém os três elementos do modo e EXATAMENTE um <script src="vendor/vad/…">', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const indexPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'renderer',
      'index.html',
    );
    const html = readFileSync(indexPath, 'utf8');
    expect(html).toContain('id="hands-free-toggle"');
    expect(html).toContain('id="hands-free-indicator"');
    expect(html).toContain('id="hands-free-status"');
    const vadScriptMatches =
      html.match(/<script[^>]*src="[^"]*vendor\/vad\/[^"]*"[^>]*><\/script>/g) ?? [];
    expect(vadScriptMatches.length).toBe(1);
  });

  it("CSP é EXATAMENTE default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; media-src 'self' blob:", async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const indexPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'renderer',
      'index.html',
    );
    const html = readFileSync(indexPath, 'utf8');
    const match = html.match(/content="([^"]*)"/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; media-src 'self' blob:",
    );
  });

  it('renderer.js não contém carregamento dinâmico de script (import(/new Worker/addModule/<script> por JS)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const rendererPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'renderer',
      'renderer.js',
    );
    const source = readFileSync(rendererPath, 'utf8');
    expect(source).not.toMatch(/\bimport\(/);
    expect(source).not.toMatch(/new Worker\(/);
    expect(source).not.toMatch(/\baddModule\(/);
    expect(source).not.toMatch(/createElement\(\s*['"]script['"]\s*\)/);
  });
});
