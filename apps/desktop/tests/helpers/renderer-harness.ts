import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import type { DOMWindow } from 'jsdom';

// Harness de carregamento de `apps/desktop/src/renderer/renderer.js` num DOM
// de teste (SPEC-0045, D1/D2/D3): módulo auxiliar puro — não contém
// `describe`/`it` (convenção `tests/helpers/`, SPEC-0042/D3). `index.html` e
// `renderer.js` são lidos DO DISCO em tempo de execução (CA 3); o arquivo em
// `src/` não ganha `export`, marcador ou comentário — o epílogo concatenado
// abaixo é o único ponto que sabe os nomes dos símbolos internos (D3).

const rendererDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'renderer');
const indexHtmlPath = join(rendererDir, 'index.html');
const rendererJsPath = join(rendererDir, 'renderer.js');

export interface RendererStatusPersona {
  readonly id: string;
  readonly name: string;
  readonly voiceURI?: string;
}

export interface RendererStatusSnapshot {
  readonly state: string;
  readonly logLevel: string;
  readonly dataDir: string;
  readonly persona: RendererStatusPersona;
  readonly readRoots: readonly string[];
  readonly writeRoots: readonly string[];
}

export interface RendererPersonaOption {
  readonly id: string;
  readonly name: string;
  readonly builtin: boolean;
}

export interface RendererPersonaDetail extends RendererPersonaOption {
  readonly tone: string;
  readonly formality: string;
  readonly language: string;
  readonly style: string;
  readonly communicationRules: readonly string[];
  readonly voice: string;
  readonly emotion: string;
  readonly voiceURI?: string;
}

export interface RendererFactSnapshot {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly source: string;
  readonly category: string;
  readonly subject?: string;
}

export interface RendererOsVoice {
  readonly voiceURI: string;
  readonly name: string;
  readonly localService: boolean;
}

export interface RendererPiperVoice {
  readonly id: string;
  readonly voiceURI: string;
  readonly name: string;
  readonly language: string;
  readonly sampleRate: number;
}

export interface RendererStepLine {
  readonly tool: string;
  readonly outcome: string;
  readonly ok: boolean;
  readonly denialKind?: 'blocked' | 'declined';
}

export interface RendererTurnSnapshot {
  readonly reply: string;
  readonly steps: readonly RendererStepLine[];
  readonly learned: readonly string[];
}

export interface RendererAskSnapshot {
  readonly text: string;
  readonly steps: readonly RendererStepLine[];
  readonly learned: readonly string[];
}

export interface RendererPiperAudio {
  readonly wav: Uint8Array;
  readonly sampleRate: number;
}

export interface RendererPersonaMutation {
  readonly persona: RendererPersonaDetail;
  readonly closedSessions: readonly string[];
}

/** Espelho de `SttEngineInfo` (`src/stt-engine.ts`) — só o formato, sem repetir o contrato pinado. */
export interface RendererSttEngineInfo {
  readonly engineId: string;
  readonly version: string;
  readonly modelId: string;
  readonly language: string;
}

export interface RendererSttAvailability {
  readonly available: boolean;
  readonly engine?: RendererSttEngineInfo;
  readonly reason?: string;
}

/** Espelho de `SttResult` (`src/stt-engine.ts`, SPEC-0046) — dez desfechos exaustivos. */
export type RendererSttResult =
  | { readonly ok: true; readonly text: string; readonly durationMs: number }
  | { readonly ok: false; readonly reason: string; readonly detail?: string };

/** Espelho de `CancelOutcome` (`src/core-bridge.ts`, SPEC-0051). */
export interface RendererCancelOutcome {
  readonly cancelled: boolean;
}

/** Superfície IPC completa exposta em `window.atlas` (espelho de `src/preload.cjs`). */
export interface AtlasDouble {
  getStatus(): Promise<RendererStatusSnapshot>;
  ask(objective: string): Promise<RendererAskSnapshot>;
  /** SPEC-0051 — gesto de escape, espelho de `window.atlas.cancel` em `src/preload.cjs`. */
  cancel(): Promise<RendererCancelOutcome>;
  chat: {
    open(): Promise<string>;
    send(session: string, input: string): Promise<RendererTurnSnapshot>;
    close(session: string): Promise<void>;
  };
  memory: {
    list(): Promise<readonly RendererFactSnapshot[]>;
    forget(id: string): Promise<void>;
  };
  persona: {
    list(): Promise<readonly RendererPersonaOption[]>;
    select(id: string): Promise<{ personaId: string; closedSessions: readonly string[] }>;
    describe(id: string): Promise<RendererPersonaDetail>;
    create(input: unknown): Promise<RendererPersonaMutation>;
    update(id: string, input: unknown): Promise<RendererPersonaMutation>;
    delete(id: string): Promise<void>;
  };
  permissions: {
    select(roots: {
      readRoots: readonly string[];
      writeRoots: readonly string[];
    }): Promise<{ readRoots: readonly string[]; writeRoots: readonly string[] }>;
  };
  tts: {
    voices(): Promise<readonly RendererPiperVoice[]>;
    speak(text: string, voiceURI: string): Promise<RendererPiperAudio | undefined>;
    cancel(): Promise<void>;
    available(): Promise<boolean>;
  };
  /** SPEC-0046 — entrada por voz (STT), espelho de `window.atlas.stt` em `src/preload.cjs`. */
  stt: {
    available(): Promise<RendererSttAvailability>;
    transcribe(pcm: ArrayBuffer, sampleRate: number): Promise<RendererSttResult>;
    cancel(): Promise<void>;
    captureBegin(): Promise<void>;
    captureEnd(): Promise<void>;
  };
}

type AtlasOverrides = {
  readonly [K in keyof AtlasDouble]?: AtlasDouble[K] extends (...args: never[]) => unknown
    ? AtlasDouble[K]
    : Partial<AtlasDouble[K]>;
};

export interface RendererCalls {
  /** SPEC-0051 — gesto de escape: nº de vezes que `window.atlas.cancel()` foi chamado. */
  cancelCalls: number;
  readonly chatSend: Array<{ session: string; input: string }>;
  readonly personaSelect: string[];
  readonly personaCreate: unknown[];
  readonly personaUpdate: Array<{ id: string; input: unknown }>;
  readonly personaDelete: string[];
  readonly memoryForget: string[];
  readonly permissionsSelect: Array<{
    readRoots: readonly string[];
    writeRoots: readonly string[];
  }>;
  readonly ttsSpeak: Array<{ text: string; voiceURI: string }>;
  readonly speechSynthesisSpeak: Array<{ text: string; voiceURI?: string }>;
  speechSynthesisCancel: number;
  readonly audioPlayed: string[];
  /** SPEC-0046 — entrada por voz (STT): chamadas de IPC e de mídia registradas pelos dublês. */
  readonly sttTranscribeCalls: Array<{ pcm: ArrayBuffer; sampleRate: number }>;
  sttCancelCalls: number;
  sttCaptureBeginCalls: number;
  sttCaptureEndCalls: number;
  readonly getUserMediaCalls: Array<{ audio?: unknown; video?: unknown }>;
  mediaTrackStops: number;
  audioContextClosed: number;
  readonly audioContextOptions: unknown[];
  readonly scriptProcessorCreated: Array<{ bufferSize: number; numIn: number; numOut: number }>;
}

function createCalls(): RendererCalls {
  return {
    cancelCalls: 0,
    chatSend: [],
    personaSelect: [],
    personaCreate: [],
    personaUpdate: [],
    personaDelete: [],
    memoryForget: [],
    sttTranscribeCalls: [],
    sttCancelCalls: 0,
    sttCaptureBeginCalls: 0,
    sttCaptureEndCalls: 0,
    getUserMediaCalls: [],
    mediaTrackStops: 0,
    audioContextClosed: 0,
    audioContextOptions: [],
    scriptProcessorCreated: [],
    permissionsSelect: [],
    ttsSpeak: [],
    speechSynthesisSpeak: [],
    speechSynthesisCancel: 0,
    audioPlayed: [],
  };
}

export interface RendererFixtureOptions {
  readonly status?: Partial<Omit<RendererStatusSnapshot, 'persona'>> & {
    readonly persona?: Partial<RendererStatusPersona>;
  };
  readonly personas?: readonly RendererPersonaOption[];
  readonly facts?: readonly RendererFactSnapshot[];
  readonly osVoices?: readonly RendererOsVoice[];
  readonly piperVoices?: readonly RendererPiperVoice[];
  readonly piperAvailable?: boolean;
  readonly chatOpenSessionId?: string;
  /** SPEC-0051 — desfecho devolvido por `window.atlas.cancel()` (default `{cancelled:false}`), contado em `calls.cancelCalls`. */
  readonly cancelOutcome?: RendererCancelOutcome | Promise<RendererCancelOutcome>;
  readonly chatSend?: (
    session: string,
    input: string,
  ) => RendererTurnSnapshot | Promise<RendererTurnSnapshot>;
  /** Override total ou parcial (por canal) da superfície `window.atlas` — resolver/rejeitar cada canal individualmente. */
  readonly atlas?: AtlasOverrides;
  /** SPEC-0046 — disponibilidade/resultado padrão de `window.atlas.stt`. */
  readonly stt?: {
    readonly available?: boolean;
    readonly reason?: string;
    readonly transcribe?: (
      pcm: ArrayBuffer,
      sampleRate: number,
    ) => RendererSttResult | Promise<RendererSttResult>;
  };
  /** SPEC-0046 — comportamento do dublê de `navigator.mediaDevices.getUserMedia`. */
  readonly media?: {
    readonly getUserMediaBehavior?: 'resolve' | 'reject';
    readonly getUserMediaDelayMs?: number;
    readonly getUserMediaError?: string;
  };
}

function defaultStatus(options: RendererFixtureOptions): RendererStatusSnapshot {
  const persona: RendererStatusPersona = {
    id: 'jarvis',
    name: 'Jarvis',
    ...options.status?.persona,
  };
  return {
    state: 'ready',
    logLevel: 'info',
    dataDir: '/tmp/atlas-renderer-harness',
    readRoots: [],
    writeRoots: [],
    ...options.status,
    persona,
  };
}

function buildAtlasDouble(options: RendererFixtureOptions, calls: RendererCalls): AtlasDouble {
  const status = defaultStatus(options);
  const personas = options.personas ?? [{ id: 'jarvis', name: 'Jarvis', builtin: true }];
  const facts = options.facts ?? [];
  const piperVoices = options.piperVoices ?? [];
  const piperAvailable = options.piperAvailable ?? false;
  const chatOpenSessionId = options.chatOpenSessionId ?? 'session-1';
  const chatSend =
    options.chatSend ??
    ((_session: string, input: string): RendererTurnSnapshot => ({
      reply: `echo: ${input}`,
      steps: [],
      learned: [],
    }));
  const sttAvailable = options.stt?.available ?? false;
  const sttReason = options.stt?.reason ?? 'engine-unavailable';
  const sttTranscribe =
    options.stt?.transcribe ??
    ((): RendererSttResult => ({ ok: true, text: 'texto transcrito', durationMs: 500 }));

  const base: AtlasDouble = {
    getStatus: () => Promise.resolve(status),
    ask: () => Promise.resolve({ text: '', steps: [], learned: [] }),
    cancel: () => {
      calls.cancelCalls += 1;
      return Promise.resolve(options.cancelOutcome ?? { cancelled: false });
    },
    chat: {
      open: () => Promise.resolve(chatOpenSessionId),
      send: (session, input) => {
        calls.chatSend.push({ session, input });
        return Promise.resolve(chatSend(session, input));
      },
      close: () => Promise.resolve(),
    },
    memory: {
      list: () => Promise.resolve(facts),
      forget: (id) => {
        calls.memoryForget.push(id);
        return Promise.resolve();
      },
    },
    persona: {
      list: () => Promise.resolve(personas),
      select: (id) => {
        calls.personaSelect.push(id);
        return Promise.resolve({ personaId: id, closedSessions: [] });
      },
      describe: (id) => {
        const found = personas.find((p) => p.id === id);
        return Promise.resolve({
          id,
          name: found?.name ?? id,
          builtin: found?.builtin ?? false,
          tone: '',
          formality: '',
          language: '',
          style: '',
          communicationRules: [],
          voice: '',
          emotion: '',
        });
      },
      create: (input) => {
        calls.personaCreate.push(input);
        return Promise.resolve({
          persona: {
            id: 'custom-1',
            name: 'Custom',
            builtin: false,
            tone: '',
            formality: '',
            language: '',
            style: '',
            communicationRules: [],
            voice: '',
            emotion: '',
          },
          closedSessions: [],
        });
      },
      update: (id, input) => {
        calls.personaUpdate.push({ id, input });
        return Promise.resolve({
          persona: {
            id,
            name: 'Custom',
            builtin: false,
            tone: '',
            formality: '',
            language: '',
            style: '',
            communicationRules: [],
            voice: '',
            emotion: '',
          },
          closedSessions: [],
        });
      },
      delete: (id) => {
        calls.personaDelete.push(id);
        return Promise.resolve();
      },
    },
    permissions: {
      select: (roots) => {
        calls.permissionsSelect.push(roots);
        return Promise.resolve(roots);
      },
    },
    tts: {
      voices: () => Promise.resolve(piperVoices),
      speak: (text, voiceURI) => {
        calls.ttsSpeak.push({ text, voiceURI });
        return Promise.resolve(undefined);
      },
      cancel: () => Promise.resolve(),
      available: () => Promise.resolve(piperAvailable),
    },
    stt: {
      available: () =>
        Promise.resolve(
          sttAvailable
            ? {
                available: true,
                engine: {
                  engineId: 'whisper.cpp',
                  version: 'v1.7.6',
                  modelId: 'ggml-small-q5_1.bin',
                  language: 'pt',
                },
              }
            : { available: false, reason: sttReason },
        ),
      transcribe: (pcm, sampleRate) => {
        calls.sttTranscribeCalls.push({ pcm, sampleRate });
        return Promise.resolve(sttTranscribe(pcm, sampleRate));
      },
      cancel: () => {
        calls.sttCancelCalls += 1;
        return Promise.resolve();
      },
      captureBegin: () => {
        calls.sttCaptureBeginCalls += 1;
        return Promise.resolve();
      },
      captureEnd: () => {
        calls.sttCaptureEndCalls += 1;
        return Promise.resolve();
      },
    },
  };

  const overrides = options.atlas;
  if (overrides === undefined) {
    return base;
  }
  return {
    getStatus: overrides.getStatus ?? base.getStatus,
    ask: overrides.ask ?? base.ask,
    cancel: overrides.cancel ?? base.cancel,
    chat: { ...base.chat, ...overrides.chat },
    memory: { ...base.memory, ...overrides.memory },
    persona: { ...base.persona, ...overrides.persona },
    permissions: { ...base.permissions, ...overrides.permissions },
    tts: { ...base.tts, ...overrides.tts },
    stt: { ...base.stt, ...overrides.stt },
  };
}

export interface SpeechSynthesisDouble {
  setVoices(voices: readonly RendererOsVoice[]): void;
  fireVoicesChanged(): void;
}

function installSpeechSynthesisDouble(
  window: DOMWindow,
  initialVoices: readonly RendererOsVoice[],
  calls: RendererCalls,
): SpeechSynthesisDouble {
  let voices = initialVoices;
  const listeners: Array<() => void> = [];

  interface FakeUtterance {
    text: string;
    voice: RendererOsVoice | null;
  }

  const synth = {
    getVoices: () => voices,
    speak: (utterance: FakeUtterance) => {
      calls.speechSynthesisSpeak.push({
        text: utterance.text,
        ...(utterance.voice?.voiceURI !== undefined ? { voiceURI: utterance.voice.voiceURI } : {}),
      });
    },
    cancel: () => {
      calls.speechSynthesisCancel += 1;
    },
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'voiceschanged') {
        listeners.push(listener);
      }
    },
    removeEventListener: () => {},
  };

  function FakeSpeechSynthesisUtterance(this: FakeUtterance, text: string): void {
    this.text = text;
    this.voice = null;
  }

  Object.assign(window, {
    speechSynthesis: synth,
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
  });

  return {
    setVoices(next: readonly RendererOsVoice[]): void {
      voices = next;
    },
    fireVoicesChanged(): void {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function installAudioDouble(window: DOMWindow, calls: RendererCalls): void {
  interface FakeAudio {
    src: string;
    addEventListener(type: string, listener: () => void): void;
    play(): Promise<void>;
  }

  function FakeAudio(this: FakeAudio, src: string): void {
    this.src = src;
    this.addEventListener = () => {};
    this.play = () => {
      calls.audioPlayed.push(src);
      return Promise.resolve();
    };
  }

  Object.assign(window, { Audio: FakeAudio });

  const url = window.URL as unknown as {
    createObjectURL?: (blob: unknown) => string;
    revokeObjectURL?: (url: string) => void;
  };
  url.createObjectURL ??= () => 'blob:renderer-harness-test';
  url.revokeObjectURL ??= () => {};
}

/**
 * SPEC-0046 (D5/D17/R1): dublês de `navigator.mediaDevices.getUserMedia`
 * (com controle de resolução/rejeição, e atraso opcional para exercitar o
 * rearme R1 via `fixture.clock.advance`) e do grafo de captura de áudio
 * (`AudioContext`/`MediaStreamAudioSourceNode`/`ScriptProcessorNode`/
 * `GainNode`/`MediaStreamTrack`) — o suficiente para provar fiação e
 * liberação de recursos, sem áudio real algum.
 */
function installMediaDouble(
  window: DOMWindow,
  calls: RendererCalls,
  options: RendererFixtureOptions['media'],
): void {
  const behavior = options?.getUserMediaBehavior ?? 'resolve';
  const delayMs = options?.getUserMediaDelayMs ?? 0;
  const errorMessage = options?.getUserMediaError ?? 'permissão de microfone negada';

  interface FakeMediaStreamTrack {
    stop(): void;
  }
  interface FakeMediaStream {
    getTracks(): FakeMediaStreamTrack[];
  }

  function createFakeTrack(): FakeMediaStreamTrack {
    return {
      stop: () => {
        calls.mediaTrackStops += 1;
      },
    };
  }

  const getUserMedia = (constraints: unknown): Promise<FakeMediaStream> => {
    calls.getUserMediaCalls.push(constraints as { audio?: unknown; video?: unknown });
    return new Promise((resolve, reject) => {
      const settle = (): void => {
        if (behavior === 'reject') {
          reject(new Error(errorMessage));
        } else {
          resolve({ getTracks: () => [createFakeTrack()] });
        }
      };
      if (delayMs > 0) {
        window.setTimeout(settle, delayMs);
      } else {
        settle();
      }
    });
  };

  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });

  interface FakeAudioProcessEvent {
    readonly inputBuffer: { getChannelData(channel: number): Float32Array };
  }

  class FakeAudioNode {
    connect(): FakeAudioNode {
      return this;
    }
    disconnect(): void {
      // no-op — só precisa não lançar
    }
  }

  class FakeScriptProcessorNode extends FakeAudioNode {
    onaudioprocess: ((event: FakeAudioProcessEvent) => void) | null = null;
  }

  class FakeGainNode extends FakeAudioNode {
    gain = { value: 0 };
  }

  class FakeMediaStreamAudioSourceNode extends FakeAudioNode {}

  class FakeAudioContext {
    readonly destination = new FakeAudioNode();
    constructor(contextOptions?: unknown) {
      calls.audioContextOptions.push(contextOptions);
    }
    createMediaStreamSource(): FakeMediaStreamAudioSourceNode {
      return new FakeMediaStreamAudioSourceNode();
    }
    createScriptProcessor(
      bufferSize: number,
      numIn: number,
      numOut: number,
    ): FakeScriptProcessorNode {
      calls.scriptProcessorCreated.push({ bufferSize, numIn, numOut });
      return new FakeScriptProcessorNode();
    }
    createGain(): FakeGainNode {
      return new FakeGainNode();
    }
    close(): Promise<void> {
      calls.audioContextClosed += 1;
      return Promise.resolve();
    }
  }

  Object.assign(window, { AudioContext: FakeAudioContext });
}

export interface InjectedClock {
  /** Avança o relógio da janela jsdom em `ms`, disparando os timers devidos, na ordem. */
  advance(ms: number): void;
}

/**
 * SPEC-0046/D19: `setTimeout`/`clearTimeout`/`setInterval`/`clearInterval`/
 * `Date.now` do OBJETO `window` do jsdom — não `globalThis` (que
 * `vi.useFakeTimers()` patcheia, mas `renderer.js` roda dentro da janela
 * jsdom e usa os timers DAQUELA janela). Chamado ANTES do `window.eval`.
 */
function installClock(window: DOMWindow): InjectedClock {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { callback: () => void; time: number; interval?: number }>();

  function schedule(callback: () => void, delay: number, interval?: number): number {
    const id = nextId;
    nextId += 1;
    const time = now + Math.max(0, delay || 0);
    timers.set(id, interval === undefined ? { callback, time } : { callback, time, interval });
    return id;
  }

  function clear(handle: unknown): void {
    if (typeof handle === 'number') {
      timers.delete(handle);
    }
  }

  function advance(ms: number): void {
    const target = now + ms;
    for (;;) {
      let nextEntryId: number | undefined;
      let nextEntry: { callback: () => void; time: number; interval?: number } | undefined;
      for (const [id, entry] of timers) {
        if (entry.time <= target && (nextEntry === undefined || entry.time < nextEntry.time)) {
          nextEntry = entry;
          nextEntryId = id;
        }
      }
      if (nextEntry === undefined || nextEntryId === undefined) {
        break;
      }
      timers.delete(nextEntryId);
      now = nextEntry.time;
      if (nextEntry.interval !== undefined) {
        timers.set(nextEntryId, { ...nextEntry, time: now + nextEntry.interval });
      }
      nextEntry.callback();
    }
    now = target;
  }

  const fakeSetTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) =>
    schedule(() => fn(...args), ms ?? 0)) as unknown as DOMWindow['setTimeout'];
  const fakeSetInterval = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) =>
    schedule(() => fn(...args), ms ?? 0, ms ?? 0)) as unknown as DOMWindow['setInterval'];

  Object.assign(window, {
    setTimeout: fakeSetTimeout,
    clearTimeout: clear,
    setInterval: fakeSetInterval,
    clearInterval: clear,
  });
  window.Date.now = () => now;

  return { advance };
}

export interface RendererFixture {
  readonly window: DOMWindow;
  readonly document: Document;
  /** Símbolos internos publicados pelo epílogo de teste (nunca por `src/`). */
  readonly internals: Record<string, unknown>;
  /** Chamadas registradas pelos dublês de IPC e de voz. */
  readonly calls: RendererCalls;
  readonly speechSynthesis: SpeechSynthesisDouble;
  /** SPEC-0046/D19 — relógio injetável instalado na janela jsdom ANTES do `window.eval`. */
  readonly clock: InjectedClock;
  /** Drena microtarefas/macrotarefas até as promessas do carregamento assentarem. */
  flush(): Promise<void>;
  /** Fecha a janela jsdom (chamado em `afterEach`). */
  close(): void;
}

// Símbolos publicados pelo epílogo (D3): lista fixa, escrita aqui — nunca
// descoberta por introspecção do arquivo de produção. `speechOutput` (a
// instância já construída) não é publicada: só as funções/constante puras
// que a suíte de paridade compara.
const EPILOGUE = `
;window.__RENDERER_TEST_INTERNALS__ = {
  createSpeechOutputGlue: typeof createSpeechOutputGlue !== 'undefined' ? createSpeechOutputGlue : undefined,
  selectVoiceURI: typeof selectVoiceURI !== 'undefined' ? selectVoiceURI : undefined,
  selectLocalVoiceURI: typeof selectLocalVoiceURI !== 'undefined' ? selectLocalVoiceURI : undefined,
  isPiperVoiceURI: typeof isPiperVoiceURI !== 'undefined' ? isPiperVoiceURI : undefined,
  resolveVoiceBackend: typeof resolveVoiceBackend !== 'undefined' ? resolveVoiceBackend : undefined,
  isPiperOnlyMode: typeof isPiperOnlyMode !== 'undefined' ? isPiperOnlyMode : undefined,
  piperOnlyPreference: typeof piperOnlyPreference !== 'undefined' ? piperOnlyPreference : undefined,
  resolvePersistedVoiceSelection: typeof resolvePersistedVoiceSelection !== 'undefined' ? resolvePersistedVoiceSelection : undefined,
  PIPER_VOICE_PREFIX: typeof PIPER_VOICE_PREFIX !== 'undefined' ? PIPER_VOICE_PREFIX : undefined,
  computeDefaultPiperVoiceURI: typeof computeDefaultPiperVoiceURI !== 'undefined' ? computeDefaultPiperVoiceURI : undefined,
  floatChunksToInt16: typeof floatChunksToInt16 !== 'undefined' ? floatChunksToInt16 : undefined,
  describeSttFailure: typeof describeSttFailure !== 'undefined' ? describeSttFailure : undefined,
};
`;

async function flushMicroAndMacrotasks(): Promise<void> {
  for (let i = 0; i < 15; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Carrega `index.html` + `renderer.js` do disco (CA 3) num DOM jsdom
 * instanciado programaticamente (`runScripts: 'outside-only'`, D2): os
 * `<script>` do HTML não são executados pelo jsdom — o próprio harness avalia
 * o texto de `renderer.js` concatenado ao epílogo de teste via `window.eval`
 * (direct eval no escopo global daquela janela), preservando byte a byte o
 * arquivo que a app carrega (D3).
 */
export async function loadRenderer(options: RendererFixtureOptions = {}): Promise<RendererFixture> {
  const html = readFileSync(indexHtmlPath, 'utf8');
  const rendererSource = readFileSync(rendererJsPath, 'utf8');

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'file:///renderer-harness/index.html',
  });
  const window = dom.window;

  const calls = createCalls();
  const atlasDouble = buildAtlasDouble(options, calls);
  Object.assign(window, { atlas: atlasDouble });

  const speechSynthesis = installSpeechSynthesisDouble(window, options.osVoices ?? [], calls);
  installAudioDouble(window, calls);
  installMediaDouble(window, calls, options.media);
  // SPEC-0046/D19: instalado ANTES do `window.eval` — `renderer.js` usa os
  // timers DA JANELA jsdom, não `globalThis`.
  const clock = installClock(window);

  window.eval(rendererSource + '\n' + EPILOGUE);

  const fixture: RendererFixture = {
    window,
    document: window.document,
    internals:
      (window as unknown as { __RENDERER_TEST_INTERNALS__?: Record<string, unknown> })
        .__RENDERER_TEST_INTERNALS__ ?? {},
    calls,
    speechSynthesis,
    clock,
    flush: flushMicroAndMacrotasks,
    close: () => {
      window.close();
    },
  };

  await fixture.flush();
  return fixture;
}
