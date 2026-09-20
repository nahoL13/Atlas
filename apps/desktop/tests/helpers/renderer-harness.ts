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
  /** SPEC-0059 — eco de `config.permissions.netRoots`/`config.tools.searchUrl` (o CONFIGURADO em vigor). */
  readonly netRoots: readonly string[];
  readonly searchUrl: string;
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
  /** SPEC-0059 — rede/busca, espelho de `window.atlas.network` em `src/preload.cjs`. */
  network: {
    select(access: {
      netRoots: readonly string[];
      searchUrl: string;
    }): Promise<{ netRoots: readonly string[]; searchUrl: string }>;
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
  /** SPEC-0052 — detector de voz (VAD), espelho de `window.atlas.vad` em `src/preload.cjs`. */
  vad: {
    available(): Promise<RendererVadAvailability>;
    resources(): Promise<RendererVadLoad>;
  };
  /** SPEC-0054 — métricas de recurso do host, espelho de `window.atlas.metrics` em `src/preload.cjs`. */
  metrics: {
    read(): Promise<RendererSystemMetricsSnapshot>;
  };
  /** SPEC-0054 — consumo de tokens da sessão, espelho de `window.atlas.tokens` em `src/preload.cjs`. */
  tokens: {
    read(): Promise<RendererTokenUsageSnapshot>;
  };
  /** SPEC-0062 — auto-start de dependências externas, espelho de `window.atlas.dependencies` em `src/preload.cjs`. */
  dependencies: {
    read(): Promise<RendererDependencyStatusSnapshot>;
    startSearchContainer(container: string): Promise<RendererDependencyOutcome>;
  };
  /** SPEC-0063 — instalação assistida de modelo, espelho de `window.atlas.models` em `src/preload.cjs`. */
  models: {
    read(): Promise<RendererModelCatalogSnapshot>;
    probe(): Promise<RendererModelCatalogSnapshot>;
    install(model: string): Promise<RendererModelPullOutcome>;
    cancel(): Promise<RendererModelCancelOutcome>;
  };
}

/** Espelho de `{ available, reason? }` (canal `'atlas:vad:available'`, SPEC-0052). */
export interface RendererVadAvailability {
  readonly available: boolean;
  readonly reason?: string;
}

/** Espelho de `VadLoad` (`src/vad-resources.ts`, SPEC-0052). */
export type RendererVadLoad =
  | { readonly ok: true; readonly wasm: ArrayBuffer; readonly model: ArrayBuffer }
  | { readonly ok: false; readonly reason: string };

/** Espelho de `MetricUnavailableReason`/`MetricSample`/`SystemMetricsSnapshot` (`src/system-metrics.ts`, SPEC-0054). */
export type RendererMetricUnavailableReason = 'unsupported' | 'read-failed' | 'timeout';

export type RendererMetricSample<T> =
  | { readonly available: true; readonly value: T }
  | { readonly available: false; readonly reason: RendererMetricUnavailableReason };

export interface RendererCpuMetric {
  readonly loadPercent: number;
}

export interface RendererMemoryMetric {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly usedPercent: number;
}

export interface RendererGpuMetric {
  readonly loadPercent: number;
}

export interface RendererNetworkMetric {
  readonly rxBytesPerSecond: number;
  readonly txBytesPerSecond: number;
}

export interface RendererSystemMetricsSnapshot {
  readonly cpu: RendererMetricSample<RendererCpuMetric>;
  readonly memory: RendererMetricSample<RendererMemoryMetric>;
  readonly gpu: RendererMetricSample<RendererGpuMetric>;
  readonly network: RendererMetricSample<RendererNetworkMetric>;
}

/** Espelho de `TokenUsageSnapshot` (`src/token-usage.ts`, SPEC-0054). */
export interface RendererTokenUsageSnapshot {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly reportedTurns: number;
  readonly unreportedTurns: number;
}

/** Espelho de `DependencyOutcome` (`@atlas/core`, SPEC-0060/0061/0062). */
export type RendererDependencyOutcome =
  | { readonly dependency: 'ollama'; readonly status: 'disabled' }
  | { readonly dependency: 'ollama'; readonly status: 'already-running' }
  | { readonly dependency: 'ollama'; readonly status: 'started' }
  | {
      readonly dependency: 'ollama';
      readonly status: 'failed';
      readonly reason: 'binary-missing' | 'spawn-failed' | 'timeout';
    }
  | { readonly dependency: 'search-container'; readonly status: 'disabled' }
  | {
      readonly dependency: 'search-container';
      readonly status: 'already-running';
      readonly container: string;
    }
  | {
      readonly dependency: 'search-container';
      readonly status: 'started';
      readonly container: string;
    }
  | {
      readonly dependency: 'search-container';
      readonly status: 'failed';
      readonly reason: 'docker-unavailable' | 'container-unknown' | 'start-failed' | 'timeout';
      readonly container: string;
    };

/** Espelho de `DependencyStatusSnapshot` (`src/core-bridge.ts`, SPEC-0062). */
export interface RendererDependencyStatusSnapshot {
  readonly ollama: RendererDependencyOutcome | undefined;
  readonly searchContainers: readonly RendererDependencyOutcome[];
}

/** Espelho de `ModelCatalogEntryView` (`src/core-bridge.ts`, SPEC-0063). */
export interface RendererModelCatalogEntry {
  readonly name: string;
  readonly sizeLabel: string;
  readonly description: string;
  readonly recommended: boolean;
  readonly installed: boolean;
}

/** Espelho de `InstalledModelsProbe` (SPEC-0063). */
export type RendererInstalledModelsProbe =
  | { readonly status: 'pending' }
  | { readonly status: 'unknown' }
  | { readonly status: 'known'; readonly models: readonly string[] };

/** Espelho de `ModelInstallState` (SPEC-0063). */
export type RendererModelInstallState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running';
      readonly model: string;
      readonly completedBytes?: number;
      readonly totalBytes?: number;
    }
  | { readonly status: 'installed'; readonly model: string }
  | { readonly status: 'cancelled'; readonly model: string }
  | {
      readonly status: 'failed';
      readonly model: string;
      readonly reason: 'unreachable' | 'rejected' | 'stream-failed' | 'invalid-model' | 'busy';
    };

/** Espelho de `ModelCatalogSnapshot` (SPEC-0063). */
export interface RendererModelCatalogSnapshot {
  readonly catalog: readonly RendererModelCatalogEntry[];
  readonly probe: RendererInstalledModelsProbe;
  readonly install: RendererModelInstallState;
}

/** Espelho do desfecho de `window.atlas.models.install` (`ModelPullOutcome`, SPEC-0063). */
export type RendererModelPullOutcome =
  | { readonly status: 'installed'; readonly model: string }
  | { readonly status: 'cancelled'; readonly model: string }
  | {
      readonly status: 'failed';
      readonly model: string;
      readonly reason: 'unreachable' | 'rejected' | 'stream-failed' | 'invalid-model' | 'busy';
    };

/** Espelho de `{ cancelled }` (`window.atlas.models.cancel`, SPEC-0063). */
export interface RendererModelCancelOutcome {
  readonly cancelled: boolean;
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
  /** SPEC-0059 — chamadas de `window.atlas.network.select`. */
  readonly networkSelect: Array<{
    netRoots: readonly string[];
    searchUrl: string;
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
  /** SPEC-0052 — modo hands-free: chamadas de IPC do VAD. */
  vadAvailableCalls: number;
  vadResourcesCalls: number;
  /** SPEC-0054 — painel `Sistema`: nº de invocações de cada canal IPC. */
  metricsReadCalls: number;
  tokensReadCalls: number;
  /** SPEC-0062 — auto-start de dependências: nº de leituras e os nomes pedidos ao gesto de container. */
  dependenciesReadCalls: number;
  readonly searchContainerStartCalls: string[];
  /** SPEC-0063 — instalação assistida de modelo: nº/args de cada canal IPC. */
  modelsReadCalls: number;
  modelsProbeCalls: number;
  readonly modelInstallCalls: string[];
  modelCancelCalls: number;
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
    vadAvailableCalls: 0,
    vadResourcesCalls: 0,
    metricsReadCalls: 0,
    tokensReadCalls: 0,
    dependenciesReadCalls: 0,
    searchContainerStartCalls: [],
    modelsReadCalls: 0,
    modelsProbeCalls: 0,
    modelInstallCalls: [],
    modelCancelCalls: 0,
    permissionsSelect: [],
    networkSelect: [],
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
  /** SPEC-0052 — disponibilidade padrão de `window.atlas.vad`. */
  readonly vad?: {
    readonly available?: boolean;
    readonly reason?: string;
  };
  /** SPEC-0054 — snapshot default devolvido por `window.atlas.metrics.read()`. */
  readonly metricsSnapshot?: RendererSystemMetricsSnapshot;
  /** SPEC-0054 — snapshot default devolvido por `window.atlas.tokens.read()`. */
  readonly tokensSnapshot?: RendererTokenUsageSnapshot;
  /** SPEC-0062 — snapshot default devolvido por `window.atlas.dependencies.read()`. */
  readonly dependenciesStatus?: RendererDependencyStatusSnapshot;
  /** SPEC-0062 — desfecho default devolvido por `window.atlas.dependencies.startSearchContainer(container)`. */
  readonly startSearchContainer?: (
    container: string,
  ) => RendererDependencyOutcome | Promise<RendererDependencyOutcome>;
  /** SPEC-0063 — snapshot default devolvido por `window.atlas.models.read()`/`.probe()`. */
  readonly modelCatalogSnapshot?: RendererModelCatalogSnapshot;
  /** SPEC-0063 — snapshot default devolvido por `window.atlas.models.probe()` (cai em `modelCatalogSnapshot` se ausente). */
  readonly modelProbeSnapshot?: RendererModelCatalogSnapshot;
  /** SPEC-0063 — desfecho default devolvido por `window.atlas.models.install(model)`. */
  readonly modelInstallOutcome?: (
    model: string,
  ) => RendererModelPullOutcome | Promise<RendererModelPullOutcome>;
  /** SPEC-0063 — desfecho default devolvido por `window.atlas.models.cancel()`. */
  readonly modelCancelOutcome?: RendererModelCancelOutcome;
  /** SPEC-0053 — `prefers-reduced-motion: reduce` inicial (default `false`). */
  readonly reducedMotion?: boolean;
  /** SPEC-0053 — `window.devicePixelRatio` dublado (default `1`). */
  readonly devicePixelRatio?: number;
  /**
   * SPEC-0053 (CA23) — força `#presence-canvas.getContext('2d')` a lançar
   * ANTES do carregamento do renderer, simulando ausência real de suporte a
   * Canvas 2D (default `false`).
   */
  readonly canvasContextUnavailable?: boolean;
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
    netRoots: [],
    searchUrl: '',
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
  const vadAvailable = options.vad?.available ?? false;
  const vadReason = options.vad?.reason ?? 'resources-missing';

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
    network: {
      select: (access) => {
        calls.networkSelect.push(access);
        return Promise.resolve(access);
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
    vad: {
      available: () => {
        calls.vadAvailableCalls += 1;
        return Promise.resolve(
          vadAvailable ? { available: true } : { available: false, reason: vadReason },
        );
      },
      resources: () => {
        calls.vadResourcesCalls += 1;
        return Promise.resolve(
          vadAvailable
            ? { ok: true, wasm: new ArrayBuffer(4), model: new ArrayBuffer(8) }
            : { ok: false, reason: vadReason },
        );
      },
    },
    metrics: {
      read: () => {
        calls.metricsReadCalls += 1;
        return Promise.resolve(
          options.metricsSnapshot ?? {
            cpu: { available: false, reason: 'unsupported' },
            memory: { available: false, reason: 'unsupported' },
            gpu: { available: false, reason: 'unsupported' },
            network: { available: false, reason: 'unsupported' },
          },
        );
      },
    },
    tokens: {
      read: () => {
        calls.tokensReadCalls += 1;
        return Promise.resolve(
          options.tokensSnapshot ?? {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            reportedTurns: 0,
            unreportedTurns: 0,
          },
        );
      },
    },
    dependencies: {
      read: () => {
        calls.dependenciesReadCalls += 1;
        return Promise.resolve(
          options.dependenciesStatus ?? { ollama: undefined, searchContainers: [] },
        );
      },
      startSearchContainer: (container: string) => {
        calls.searchContainerStartCalls.push(container);
        const resolver =
          options.startSearchContainer ??
          ((name: string): RendererDependencyOutcome => ({
            dependency: 'search-container',
            status: 'already-running',
            container: name,
          }));
        return Promise.resolve(resolver(container));
      },
    },
    models: {
      read: () => {
        calls.modelsReadCalls += 1;
        return Promise.resolve(
          options.modelCatalogSnapshot ?? {
            catalog: [],
            probe: { status: 'unknown' },
            install: { status: 'idle' },
          },
        );
      },
      probe: () => {
        calls.modelsProbeCalls += 1;
        return Promise.resolve(
          options.modelProbeSnapshot ??
            options.modelCatalogSnapshot ?? {
              catalog: [],
              probe: { status: 'unknown' },
              install: { status: 'idle' },
            },
        );
      },
      install: (model: string) => {
        calls.modelInstallCalls.push(model);
        const resolver =
          options.modelInstallOutcome ??
          ((m: string): RendererModelPullOutcome => ({ status: 'installed', model: m }));
        return Promise.resolve(resolver(model));
      },
      cancel: () => {
        calls.modelCancelCalls += 1;
        return Promise.resolve(options.modelCancelOutcome ?? { cancelled: false });
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
    network: { ...base.network, ...overrides.network },
    tts: { ...base.tts, ...overrides.tts },
    stt: { ...base.stt, ...overrides.stt },
    vad: { ...base.vad, ...overrides.vad },
    metrics: { ...base.metrics, ...overrides.metrics },
    tokens: { ...base.tokens, ...overrides.tokens },
    dependencies: { ...base.dependencies, ...overrides.dependencies },
    models: { ...base.models, ...overrides.models },
  };
}

export interface SpeechSynthesisDouble {
  setVoices(voices: readonly RendererOsVoice[]): void;
  fireVoicesChanged(): void;
  /**
   * SPEC-0052 (CA41)/SPEC-0053 (Escopo 7, CA21): dispara `start`/`end`/`error`
   * do N-ésimo utterance criado (0-based). `start` é o único evento nativo
   * que ativa `playbackActive` no núcleo.
   */
  fireUtteranceEvent(index: number, type: 'start' | 'end' | 'error'): void;
  utteranceCount(): number;
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
    listeners: Record<string, Array<() => void>>;
    addEventListener(type: string, listener: () => void): void;
  }

  const utterances: FakeUtterance[] = [];

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
    this.listeners = {};
    this.addEventListener = (type: string, listener: () => void): void => {
      const bucket = this.listeners[type] ?? [];
      bucket.push(listener);
      this.listeners[type] = bucket;
    };
    utterances.push(this);
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
    fireUtteranceEvent(index: number, type: 'start' | 'end' | 'error'): void {
      const utterance = utterances[index];
      if (utterance === undefined) {
        return;
      }
      for (const listener of utterance.listeners[type] ?? []) {
        listener();
      }
    },
    utteranceCount(): number {
      return utterances.length;
    },
  };
}

export interface AudioDouble {
  /**
   * SPEC-0052 (CA41)/SPEC-0053 (Escopo 7, CA21): dispara `playing`/`ended`/
   * `error` do N-ésimo `Audio` (Piper) criado (0-based). `playing` é o único
   * evento nativo que ativa `playbackActive` no núcleo.
   */
  fireEvent(index: number, type: 'playing' | 'ended' | 'error'): void;
}

function installAudioDouble(window: DOMWindow, calls: RendererCalls): AudioDouble {
  interface FakeAudio {
    src: string;
    listeners: Record<string, Array<() => void>>;
    addEventListener(type: string, listener: () => void): void;
    play(): Promise<void>;
  }

  const audios: FakeAudio[] = [];

  function FakeAudio(this: FakeAudio, src: string): void {
    this.src = src;
    this.listeners = {};
    this.addEventListener = (type: string, listener: () => void): void => {
      const bucket = this.listeners[type] ?? [];
      bucket.push(listener);
      this.listeners[type] = bucket;
    };
    this.play = () => {
      calls.audioPlayed.push(src);
      return Promise.resolve();
    };
    audios.push(this);
  }

  Object.assign(window, { Audio: FakeAudio });

  const url = window.URL as unknown as {
    createObjectURL?: (blob: unknown) => string;
    revokeObjectURL?: (url: string) => void;
  };
  url.createObjectURL ??= () => 'blob:renderer-harness-test';
  url.revokeObjectURL ??= () => {};

  return {
    fireEvent(index: number, type: 'playing' | 'ended' | 'error'): void {
      const audio = audios[index];
      if (audio === undefined) {
        return;
      }
      for (const listener of audio.listeners[type] ?? []) {
        listener();
      }
    },
  };
}

export interface ReducedMotionDouble {
  /** SPEC-0053 (Escopo 8): alterna `matches` e dispara os ouvintes de `change`. */
  set(matches: boolean): void;
}

/**
 * SPEC-0053 (Escopo 8): `window.matchMedia` não existe no jsdom — dublê
 * mínimo, restrito à única media query que `renderer.js` observa
 * (`prefers-reduced-motion: reduce`), com suporte a `addEventListener` E ao
 * `addListener` legado.
 */
function installMatchMedia(window: DOMWindow, initialReducedMotion: boolean): ReducedMotionDouble {
  let matches = initialReducedMotion;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (type: string, listener: (event: { matches: boolean }) => void): void => {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener: (type: string, listener: (event: { matches: boolean }) => void): void => {
      if (type === 'change') listeners.delete(listener);
    },
    addListener: (listener: (event: { matches: boolean }) => void): void => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: { matches: boolean }) => void): void => {
      listeners.delete(listener);
    },
  };
  Object.assign(window, {
    matchMedia: () => mediaQueryList,
  });
  return {
    set(next: boolean): void {
      matches = next;
      for (const listener of listeners) {
        listener({ matches });
      }
    },
  };
}

/** SPEC-0053 (Escopo 6): `window.devicePixelRatio` dublado — fixo pela vida da fixture. */
function installDevicePixelRatio(window: DOMWindow, ratio: number): void {
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: ratio,
  });
}

export interface CanvasCall {
  readonly type: string;
  readonly args: readonly unknown[];
}

export interface CanvasDouble {
  /** SPEC-0053 (Escopo 6): chamadas registradas no contexto 2D do `id` dado, na ordem. */
  calls(id: string): readonly CanvasCall[];
}

/**
 * SPEC-0053 (Escopo 6/11): dublê de `CanvasRenderingContext2D` — grava toda
 * chamada (tipo + argumentos) num array por elemento `<canvas>`, sem
 * instalar biblioteca de Canvas. `getContext('2d')` devolve sempre o MESMO
 * objeto para o mesmo elemento (idempotente, como o real).
 *
 * `throwOnGetContext` (CA23): força `getContext('2d')` a LANÇAR — instalado
 * ANTES do `window.eval(rendererSource)`, para que a captura de
 * `presenceCtx` (feita uma única vez, no carregamento do módulo) veja a
 * falha de verdade. Sobrescrever `canvas.getContext` DEPOIS do load não
 * exerceria o caminho de falha real (o `renderer.js` só chama
 * `getContext('2d')` uma vez, no boot).
 */
function installCanvasDouble(
  window: DOMWindow,
  options?: { readonly throwOnGetContext?: boolean },
): CanvasDouble {
  const contextsByCanvas = new Map<
    unknown,
    { calls: CanvasCall[]; ctx: Record<string, unknown> }
  >();

  function createContext(canvas: { width: number; height: number }): Record<string, unknown> {
    const calls: CanvasCall[] = [];
    const record = (type: string, ...args: unknown[]): void => {
      calls.push({ type, args });
    };
    const gradient = { addColorStop: (...args: unknown[]) => record('addColorStop', ...args) };
    const ctx: Record<string, unknown> = {
      canvas,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      globalAlpha: 1,
      setTransform: (...args: unknown[]) => record('setTransform', ...args),
      clearRect: (...args: unknown[]) => record('clearRect', ...args),
      beginPath: (...args: unknown[]) => record('beginPath', ...args),
      closePath: (...args: unknown[]) => record('closePath', ...args),
      arc: (...args: unknown[]) => record('arc', ...args),
      fill: (...args: unknown[]) => record('fill', ...args, ctx.fillStyle, ctx.globalAlpha),
      lineTo: (...args: unknown[]) => record('lineTo', ...args),
      moveTo: (...args: unknown[]) => record('moveTo', ...args),
      stroke: (...args: unknown[]) => record('stroke', ...args),
      save: (...args: unknown[]) => record('save', ...args),
      restore: (...args: unknown[]) => record('restore', ...args),
      translate: (...args: unknown[]) => record('translate', ...args),
      rotate: (...args: unknown[]) => record('rotate', ...args),
      scale: (...args: unknown[]) => record('scale', ...args),
      createRadialGradient: (...args: unknown[]) => {
        record('createRadialGradient', ...args);
        return gradient;
      },
      createLinearGradient: (...args: unknown[]) => {
        record('createLinearGradient', ...args);
        return gradient;
      },
    };
    contextsByCanvas.set(canvas, { calls, ctx });
    return ctx;
  }

  const canvasPrototype = window.HTMLCanvasElement.prototype as unknown as {
    getContext: (type: string) => unknown;
  };
  canvasPrototype.getContext = function fakeGetContext(this: {
    width: number;
    height: number;
  }): unknown {
    if (options?.throwOnGetContext === true) {
      throw new Error('sem suporte a Canvas (dublê)');
    }
    const existing = contextsByCanvas.get(this);
    if (existing !== undefined) {
      return existing.ctx;
    }
    return createContext(this);
  };

  return {
    calls(id: string): readonly CanvasCall[] {
      const canvas = window.document.getElementById(id);
      const entry = canvas === null ? undefined : contextsByCanvas.get(canvas);
      return entry === undefined ? [] : entry.calls;
    },
  };
}

/**
 * SPEC-0046 (D5/D17/R1): dublês de `navigator.mediaDevices.getUserMedia`
 * (com controle de resolução/rejeição, e atraso opcional para exercitar o
 * rearme R1 via `fixture.clock.advance`) e do grafo de captura de áudio
 * (`AudioContext`/`MediaStreamAudioSourceNode`/`ScriptProcessorNode`/
 * `GainNode`/`MediaStreamTrack`) — o suficiente para provar fiação e
 * liberação de recursos, sem áudio real algum.
 */
export interface MediaGraphDouble {
  /** SPEC-0052 — alimenta o `onaudioprocess` do `ScriptProcessorNode` MAIS RECENTE com um `Float32Array` (tamanho múltiplo de 4096). */
  feedAudioProcess(channelData: Float32Array): void;
  /** SPEC-0052 — quantos `ScriptProcessorNode` foram criados até agora. */
  processorCount(): number;
}

function installMediaDouble(
  window: DOMWindow,
  calls: RendererCalls,
  options: RendererFixtureOptions['media'],
): MediaGraphDouble {
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

  const processors: FakeScriptProcessorNode[] = [];

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
      const processor = new FakeScriptProcessorNode();
      processors.push(processor);
      return processor;
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

  return {
    feedAudioProcess(channelData: Float32Array): void {
      const processor = processors[processors.length - 1];
      if (processor?.onaudioprocess === null || processor?.onaudioprocess === undefined) {
        return;
      }
      processor.onaudioprocess({ inputBuffer: { getChannelData: () => channelData } });
    },
    processorCount(): number {
      return processors.length;
    },
  };
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

  // SPEC-0053 (Escopo 8): `requestAnimationFrame`/`cancelAnimationFrame`
  // dublados sobre O MESMO relógio injetável (16ms por frame) — sem isso,
  // `renderer.js` (que lê `Date.now()`, jamais `performance.now()`, por
  // simetria com este dublê) ficaria preso ao rAF nativo do jsdom, alheio a
  // `fixture.clock.advance()`.
  const fakeRequestAnimationFrame = ((callback: (time: number) => void) =>
    schedule(() => callback(now), 16)) as unknown as DOMWindow['requestAnimationFrame'];
  const fakeCancelAnimationFrame = clear as unknown as DOMWindow['cancelAnimationFrame'];
  Object.assign(window, {
    requestAnimationFrame: fakeRequestAnimationFrame,
    cancelAnimationFrame: fakeCancelAnimationFrame,
  });

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
  /** SPEC-0052 (CA41) — dispara `ended`/`error` do `Audio` (Piper) N-ésimo criado. */
  readonly audio: AudioDouble;
  /** SPEC-0052 — alimenta frames de áudio sintéticos no grafo de captura ativo. */
  readonly media: MediaGraphDouble;
  /** SPEC-0046/D19 — relógio injetável instalado na janela jsdom ANTES do `window.eval`. */
  readonly clock: InjectedClock;
  /** SPEC-0053 — chamadas registradas no `CanvasRenderingContext2D` dublado de `#presence-canvas`. */
  readonly canvas: CanvasDouble;
  /** SPEC-0053 — alterna `prefers-reduced-motion: reduce` em runtime. */
  readonly reducedMotion: ReducedMotionDouble;
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
  nextHandsFreeState: typeof nextHandsFreeState !== 'undefined' ? nextHandsFreeState : undefined,
  handsFreeMicrophoneOpen: typeof handsFreeMicrophoneOpen !== 'undefined' ? handsFreeMicrophoneOpen : undefined,
  speakingWatchdogMs: typeof speakingWatchdogMs !== 'undefined' ? speakingWatchdogMs : undefined,
  createTurnSegmenter: typeof createTurnSegmenter !== 'undefined' ? createTurnSegmenter : undefined,
  setHandsFreeDetectorFactory: typeof setHandsFreeDetectorFactory !== 'undefined' ? setHandsFreeDetectorFactory : undefined,
  speakText: typeof speakText !== 'undefined' ? speakText : undefined,
  HF_FRAME_SAMPLES: typeof HF_FRAME_SAMPLES !== 'undefined' ? HF_FRAME_SAMPLES : undefined,
  HF_FRAME_MS: typeof HF_FRAME_MS !== 'undefined' ? HF_FRAME_MS : undefined,
  HF_SPEECH_ENTER: typeof HF_SPEECH_ENTER !== 'undefined' ? HF_SPEECH_ENTER : undefined,
  HF_SPEECH_EXIT: typeof HF_SPEECH_EXIT !== 'undefined' ? HF_SPEECH_EXIT : undefined,
  HF_MIN_SPEECH_MS: typeof HF_MIN_SPEECH_MS !== 'undefined' ? HF_MIN_SPEECH_MS : undefined,
  HF_PRE_ROLL_FRAMES: typeof HF_PRE_ROLL_FRAMES !== 'undefined' ? HF_PRE_ROLL_FRAMES : undefined,
  HF_SILENCE_CLOSE_MS: typeof HF_SILENCE_CLOSE_MS !== 'undefined' ? HF_SILENCE_CLOSE_MS : undefined,
  HF_MAX_UTTERANCE_MS: typeof HF_MAX_UTTERANCE_MS !== 'undefined' ? HF_MAX_UTTERANCE_MS : undefined,
  HF_CAPTURE_REARM_MS: typeof HF_CAPTURE_REARM_MS !== 'undefined' ? HF_CAPTURE_REARM_MS : undefined,
  HF_VAD_QUEUE_LIMIT: typeof HF_VAD_QUEUE_LIMIT !== 'undefined' ? HF_VAD_QUEUE_LIMIT : undefined,
  HF_THINKING_WATCHDOG_MS: typeof HF_THINKING_WATCHDOG_MS !== 'undefined' ? HF_THINKING_WATCHDOG_MS : undefined,
  HF_SPEAKING_WATCHDOG_BASE_MS: typeof HF_SPEAKING_WATCHDOG_BASE_MS !== 'undefined' ? HF_SPEAKING_WATCHDOG_BASE_MS : undefined,
  HF_SPEAKING_WATCHDOG_PER_CHAR_MS: typeof HF_SPEAKING_WATCHDOG_PER_CHAR_MS !== 'undefined' ? HF_SPEAKING_WATCHDOG_PER_CHAR_MS : undefined,
  HF_SPEAKING_WATCHDOG_MAX_MS: typeof HF_SPEAKING_WATCHDOG_MAX_MS !== 'undefined' ? HF_SPEAKING_WATCHDOG_MAX_MS : undefined,
  generatePresencePointCloud: typeof generatePresencePointCloud !== 'undefined' ? generatePresencePointCloud : undefined,
  mulberry32: typeof mulberry32 !== 'undefined' ? mulberry32 : undefined,
  PRESENCE_PROFILES: typeof PRESENCE_PROFILES !== 'undefined' ? PRESENCE_PROFILES : undefined,
  derivePresenceState: typeof derivePresenceState !== 'undefined' ? derivePresenceState : undefined,
  presenceStateLabel: typeof presenceStateLabel !== 'undefined' ? presenceStateLabel : undefined,
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
  const audio = installAudioDouble(window, calls);
  const media = installMediaDouble(window, calls, options.media);
  // SPEC-0046/D19: instalado ANTES do `window.eval` — `renderer.js` usa os
  // timers DA JANELA jsdom, não `globalThis`.
  const clock = installClock(window);
  // SPEC-0053 (Escopo 6/11): dublês do núcleo Canvas — instalados ANTES do
  // `window.eval`, mesma disciplina do relógio.
  const reducedMotion = installMatchMedia(window, options.reducedMotion ?? false);
  installDevicePixelRatio(window, options.devicePixelRatio ?? 1);
  const canvas = installCanvasDouble(window, {
    throwOnGetContext: options.canvasContextUnavailable === true,
  });

  window.eval(rendererSource + '\n' + EPILOGUE);

  const fixture: RendererFixture = {
    window,
    document: window.document,
    internals:
      (window as unknown as { __RENDERER_TEST_INTERNALS__?: Record<string, unknown> })
        .__RENDERER_TEST_INTERNALS__ ?? {},
    calls,
    speechSynthesis,
    audio,
    media,
    clock,
    canvas,
    reducedMotion,
    flush: flushMicroAndMacrotasks,
    close: () => {
      window.close();
    },
  };

  await fixture.flush();
  return fixture;
}
