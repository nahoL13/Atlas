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

/** Superfície IPC completa exposta em `window.atlas` (espelho de `src/preload.cjs`). */
export interface AtlasDouble {
  getStatus(): Promise<RendererStatusSnapshot>;
  ask(objective: string): Promise<RendererAskSnapshot>;
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
}

type AtlasOverrides = {
  readonly [K in keyof AtlasDouble]?: AtlasDouble[K] extends (...args: never[]) => unknown
    ? AtlasDouble[K]
    : Partial<AtlasDouble[K]>;
};

export interface RendererCalls {
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
}

function createCalls(): RendererCalls {
  return {
    chatSend: [],
    personaSelect: [],
    personaCreate: [],
    personaUpdate: [],
    personaDelete: [],
    memoryForget: [],
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
  readonly chatSend?: (
    session: string,
    input: string,
  ) => RendererTurnSnapshot | Promise<RendererTurnSnapshot>;
  /** Override total ou parcial (por canal) da superfície `window.atlas` — resolver/rejeitar cada canal individualmente. */
  readonly atlas?: AtlasOverrides;
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

  const base: AtlasDouble = {
    getStatus: () => Promise.resolve(status),
    ask: () => Promise.resolve({ text: '', steps: [], learned: [] }),
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
  };

  const overrides = options.atlas;
  if (overrides === undefined) {
    return base;
  }
  return {
    getStatus: overrides.getStatus ?? base.getStatus,
    ask: overrides.ask ?? base.ask,
    chat: { ...base.chat, ...overrides.chat },
    memory: { ...base.memory, ...overrides.memory },
    persona: { ...base.persona, ...overrides.persona },
    permissions: { ...base.permissions, ...overrides.permissions },
    tts: { ...base.tts, ...overrides.tts },
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

export interface RendererFixture {
  readonly window: DOMWindow;
  readonly document: Document;
  /** Símbolos internos publicados pelo epílogo de teste (nunca por `src/`). */
  readonly internals: Record<string, unknown>;
  /** Chamadas registradas pelos dublês de IPC e de voz. */
  readonly calls: RendererCalls;
  readonly speechSynthesis: SpeechSynthesisDouble;
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

  window.eval(rendererSource + '\n' + EPILOGUE);

  const fixture: RendererFixture = {
    window,
    document: window.document,
    internals:
      (window as unknown as { __RENDERER_TEST_INTERNALS__?: Record<string, unknown> })
        .__RENDERER_TEST_INTERNALS__ ?? {},
    calls,
    speechSynthesis,
    flush: flushMicroAndMacrotasks,
    close: () => {
      window.close();
    },
  };

  await fixture.flush();
  return fixture;
}
