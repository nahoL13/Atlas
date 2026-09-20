import { describe, expect, it } from 'vitest';
import type {
  ResolveVoiceBackendInput,
  SpeechSynthesisPort,
  UtteranceSpec,
  VoiceInfo,
} from '../src/speech-output.js';
import * as speechOutputModule from '../src/speech-output.js';
import {
  createSpeechOutput,
  isPiperOnlyMode,
  isPiperVoiceURI,
  piperOnlyPreference,
  resolvePersistedVoiceSelection,
  resolveVoiceBackend,
} from '../src/speech-output.js';
import * as piperTtsModule from '../src/piper-tts.js';
import { PIPER_VOICE_PREFIX, resolveDefaultPiperVoiceURI } from '../src/piper-tts.js';
import * as sttEngineModule from '../src/stt-engine.js';
import * as handsFreeModule from '../src/hands-free.js';
import * as systemMetricsModule from '../src/system-metrics.js';
import * as tokenUsageModule from '../src/token-usage.js';
import * as modelCatalogModule from '../src/model-catalog.js';
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
import type { RendererFixture } from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// Frentes 2 e 3 (SPEC-0045), estendidas pela Frente 1 da SPEC-0047: suíte de
// paridade renderer↔módulo e gate mecânico contra a próxima réplica não
// classificada — agora generalizado a uma LISTA de módulos-fonte vigiados
// (D1/D2 da SPEC-0047), não mais específico de `speech-output.ts`.
//
// D4 (SPEC-0045): cada caso é um DADO só, executado nas DUAS implementações,
// comparado por igualdade — nenhum literal esperado é escrito separadamente
// para o renderer (CA 11/CA6). D1 (SPEC-0045): `PIPER_VOICE_PREFIX` não é
// reexportado por `speech-output.ts` (importa de `./piper-tts.js` sem
// reexportar) — o lado módulo desta entrada importa diretamente de
// `piper-tts.js`.

/** Módulos-fonte vigiados pelo gate (SPEC-0047/D1, generalizado a 4 pela SPEC-0052, a 6 pela SPEC-0054, a 7 pela SPEC-0063) — a FONTE da enumeração é o `import * as` em runtime, nunca uma lista escrita à mão dos nomes exportados. */
type WatchedModule =
  | 'speech-output'
  | 'piper-tts'
  | 'stt-engine'
  | 'hands-free'
  | 'system-metrics'
  | 'token-usage'
  | 'model-catalog';

const WATCHED_MODULES: Readonly<Record<WatchedModule, Record<string, unknown>>> = {
  'speech-output': speechOutputModule as unknown as Record<string, unknown>,
  'piper-tts': piperTtsModule as unknown as Record<string, unknown>,
  'stt-engine': sttEngineModule as unknown as Record<string, unknown>,
  'hands-free': handsFreeModule as unknown as Record<string, unknown>,
  'system-metrics': systemMetricsModule as unknown as Record<string, unknown>,
  'token-usage': tokenUsageModule as unknown as Record<string, unknown>,
  'model-catalog': modelCatalogModule as unknown as Record<string, unknown>,
};

const LOCAL_1: VoiceInfo = { voiceURI: 'local-1', name: 'Local Um', localService: true };
const LOCAL_2: VoiceInfo = { voiceURI: 'local-2', name: 'Local Dois', localService: true };
const NETWORK_1: VoiceInfo = { voiceURI: 'network-1', name: 'Rede Um', localService: false };

// --- Registro de pares (D6/Frente 3) -----------------------------------

type ReplicaKind = 'direct' | 'transitive';

interface ReplicaEntry {
  readonly moduleSymbol: string;
  readonly moduleSource: WatchedModule;
  readonly rendererSymbol: string;
  readonly kind: ReplicaKind;
  readonly casesKey: string;
}

const REGISTRY: readonly ReplicaEntry[] = [
  {
    moduleSymbol: 'createSpeechOutput',
    moduleSource: 'speech-output',
    rendererSymbol: 'createSpeechOutputGlue',
    kind: 'direct',
    casesKey: 'createSpeechOutput',
  },
  {
    moduleSymbol: 'selectVoiceURI',
    moduleSource: 'speech-output',
    rendererSymbol: 'selectVoiceURI',
    kind: 'transitive',
    casesKey: 'createSpeechOutput',
  },
  {
    moduleSymbol: 'selectLocalVoiceURI',
    moduleSource: 'speech-output',
    rendererSymbol: 'selectLocalVoiceURI',
    kind: 'transitive',
    casesKey: 'createSpeechOutput',
  },
  {
    moduleSymbol: 'isPiperVoiceURI',
    moduleSource: 'speech-output',
    rendererSymbol: 'isPiperVoiceURI',
    kind: 'direct',
    casesKey: 'isPiperVoiceURI',
  },
  {
    moduleSymbol: 'resolveVoiceBackend',
    moduleSource: 'speech-output',
    rendererSymbol: 'resolveVoiceBackend',
    kind: 'direct',
    casesKey: 'resolveVoiceBackend',
  },
  {
    moduleSymbol: 'isPiperOnlyMode',
    moduleSource: 'speech-output',
    rendererSymbol: 'isPiperOnlyMode',
    kind: 'direct',
    casesKey: 'isPiperOnlyMode',
  },
  {
    moduleSymbol: 'piperOnlyPreference',
    moduleSource: 'speech-output',
    rendererSymbol: 'piperOnlyPreference',
    kind: 'direct',
    casesKey: 'piperOnlyPreference',
  },
  {
    moduleSymbol: 'resolvePersistedVoiceSelection',
    moduleSource: 'speech-output',
    rendererSymbol: 'resolvePersistedVoiceSelection',
    kind: 'direct',
    casesKey: 'resolvePersistedVoiceSelection',
  },
  {
    // D1 (SPEC-0045): fonte real é `piper-tts.ts:18` — `speech-output.ts` só
    // importa, nunca reexporta.
    moduleSymbol: 'PIPER_VOICE_PREFIX',
    moduleSource: 'piper-tts',
    rendererSymbol: 'PIPER_VOICE_PREFIX',
    kind: 'direct',
    casesKey: 'PIPER_VOICE_PREFIX',
  },
  {
    // Frente 1 (SPEC-0047), Objetivo 2: a décima réplica — hoje documentada
    // no próprio `renderer.js` como "resíduo sem cobertura automatizada".
    moduleSymbol: 'resolveDefaultPiperVoiceURI',
    moduleSource: 'piper-tts',
    rendererSymbol: 'computeDefaultPiperVoiceURI',
    kind: 'direct',
    casesKey: 'resolveDefaultPiperVoiceURI',
  },
  // SPEC-0052 — modo hands-free (D10): máquina de estados + segmentador de
  // turno, réplica em `renderer.js`, teste de referência `hands-free.test.ts`.
  {
    moduleSymbol: 'nextHandsFreeState',
    moduleSource: 'hands-free',
    rendererSymbol: 'nextHandsFreeState',
    kind: 'direct',
    casesKey: 'nextHandsFreeState',
  },
  {
    moduleSymbol: 'handsFreeMicrophoneOpen',
    moduleSource: 'hands-free',
    rendererSymbol: 'handsFreeMicrophoneOpen',
    kind: 'direct',
    casesKey: 'handsFreeMicrophoneOpen',
  },
  {
    moduleSymbol: 'speakingWatchdogMs',
    moduleSource: 'hands-free',
    rendererSymbol: 'speakingWatchdogMs',
    kind: 'direct',
    casesKey: 'speakingWatchdogMs',
  },
  {
    moduleSymbol: 'createTurnSegmenter',
    moduleSource: 'hands-free',
    rendererSymbol: 'createTurnSegmenter',
    kind: 'direct',
    casesKey: 'createTurnSegmenter',
  },
  // As 14 constantes pinadas do Contrato (SPEC-0052) — cada uma comparada
  // por igualdade (mesmo molde de `PIPER_VOICE_PREFIX`).
  {
    moduleSymbol: 'FRAME_SAMPLES',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_FRAME_SAMPLES',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'FRAME_MS',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_FRAME_MS',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'SPEECH_ENTER',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_SPEECH_ENTER',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'SPEECH_EXIT',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_SPEECH_EXIT',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'MIN_SPEECH_MS',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_MIN_SPEECH_MS',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'PRE_ROLL_FRAMES',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_PRE_ROLL_FRAMES',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'SILENCE_CLOSE_MS',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_SILENCE_CLOSE_MS',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'MAX_UTTERANCE_MS',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_MAX_UTTERANCE_MS',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'CAPTURE_REARM_MS',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_CAPTURE_REARM_MS',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'VAD_QUEUE_LIMIT',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_VAD_QUEUE_LIMIT',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'THINKING_WATCHDOG_MS',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_THINKING_WATCHDOG_MS',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'SPEAKING_WATCHDOG_BASE_MS',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_SPEAKING_WATCHDOG_BASE_MS',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'SPEAKING_WATCHDOG_PER_CHAR_MS',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_SPEAKING_WATCHDOG_PER_CHAR_MS',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
  {
    moduleSymbol: 'SPEAKING_WATCHDOG_MAX_MS',
    moduleSource: 'hands-free',
    rendererSymbol: 'HF_SPEAKING_WATCHDOG_MAX_MS',
    kind: 'direct',
    casesKey: 'handsFreeConstant',
  },
];

interface NotMirroredEntry {
  readonly moduleSource: WatchedModule;
  readonly symbol: string;
  readonly reason: string;
}

/** Exports de valor dos módulos vigiados deliberadamente não replicados no renderer, com justificativa (CA3/CA4). */
const NOT_MIRRORED: readonly NotMirroredEntry[] = [
  {
    moduleSource: 'speech-output',
    symbol: 'piperModelIdOf',
    reason: 'usado só no main process (src/piper-tts.ts/core-bridge.ts), nunca no renderer',
  },
  {
    moduleSource: 'piper-tts',
    symbol: 'createPiperTts',
    reason:
      'mantém o processo Piper de longa duração — vive só no main process (src/main.ts/core-bridge.ts), nunca no renderer',
  },
  {
    moduleSource: 'stt-engine',
    symbol: 'createSttEngine',
    reason:
      'invoca o subprocesso whisper-cli — roda só no main process (src/main.ts), nunca no renderer',
  },
  {
    moduleSource: 'system-metrics',
    symbol: 'createSystemMetrics',
    reason:
      'lê systeminformation (CPU/RAM/GPU/rede do host) — roda só no main process (src/main.ts), nunca no renderer; o renderer só formata o SystemMetricsSnapshot recebido por IPC',
  },
  {
    moduleSource: 'token-usage',
    symbol: 'createTokenUsageAccumulator',
    reason:
      'acumulador de estado de módulo — vive só no main process (src/core-bridge.ts), nunca no renderer; o renderer só formata o TokenUsageSnapshot recebido por IPC',
  },
  {
    moduleSource: 'model-catalog',
    symbol: 'MODEL_CATALOG',
    reason:
      'dado puro consumido só no main process (src/core-bridge.ts, readModelCatalog); o renderer recebe o catálogo já composto (com `installed` calculado, D24) por IPC, nunca a constante crua',
  },
  {
    moduleSource: 'model-catalog',
    symbol: 'findCatalogModel',
    reason:
      'usado só no main process (src/core-bridge.ts, installOllamaModel) para validar pertencimento ao catálogo antes de tocar a porta — o renderer nunca decide isso',
  },
  {
    moduleSource: 'model-catalog',
    symbol: 'isInstalledModel',
    reason:
      'normalização da tag implícita usada só no main process (src/core-bridge.ts, D24) — o renderer recebe `ModelCatalogEntryView.installed` já calculado, sem replicar a regra',
  },
];

// --- Frente 2: tabelas de casos, uma por par -----------------------------

interface GlueCase {
  readonly name: string;
  readonly voices: readonly VoiceInfo[];
  readonly preferredVoiceURI?: () => string | undefined;
  readonly text: string;
}

const GLUE_CASES: readonly GlueCase[] = [
  { name: 'sem voz alguma', voices: [], text: 'olá' },
  { name: 'só voz de rede', voices: [NETWORK_1], text: 'olá' },
  {
    name: 'voz local única, texto com espaços a normalizar',
    voices: [LOCAL_1],
    text: '  olá   mundo  ',
  },
  {
    name: 'múltiplas vozes locais, preferência ausente ⇒ primeira',
    voices: [LOCAL_1, LOCAL_2],
    text: 'olá',
  },
  {
    name: 'preferência apontando para voz local existente, não a primeira',
    voices: [LOCAL_1, LOCAL_2],
    preferredVoiceURI: () => 'local-2',
    text: 'olá',
  },
  {
    name: 'preferência lançando (fail-safe, cai na primeira)',
    voices: [LOCAL_1],
    preferredVoiceURI: () => {
      throw new Error('boom');
    },
    text: 'olá',
  },
  {
    name: 'preferência apontando para voz inexistente',
    voices: [LOCAL_1],
    preferredVoiceURI: () => 'nao-existe',
    text: 'olá',
  },
  {
    name: 'preferência apontando para voz localService === false (rede)',
    voices: [NETWORK_1, LOCAL_1],
    preferredVoiceURI: () => 'network-1',
    text: 'olá',
  },
  { name: 'texto vazio ⇒ no-op', voices: [LOCAL_1], text: '' },
  { name: 'texto só espaços ⇒ no-op', voices: [LOCAL_1], text: '   ' },
];

const PIPER_URI_CASES: readonly string[] = [
  'piper:pt_BR-faber-medium',
  'os-voice-a',
  '',
  'PIPER:x',
  'piper:',
  'not-piper:test',
];

const RESOLVE_BACKEND_CASES: readonly ResolveVoiceBackendInput[] = [
  {
    preferredVoiceURI: 'piper:a',
    piperVoiceURIs: ['piper:a', 'piper:b'],
    localVoiceURIs: ['os-a'],
    defaultPiperVoiceURI: 'piper:b',
  },
  {
    preferredVoiceURI: 'os-a',
    piperVoiceURIs: ['piper:a'],
    localVoiceURIs: ['os-a', 'os-b'],
    defaultPiperVoiceURI: 'piper:a',
  },
  { piperVoiceURIs: ['piper:a'], localVoiceURIs: ['os-a'], defaultPiperVoiceURI: 'piper:a' },
  { piperVoiceURIs: [], localVoiceURIs: ['os-a', 'os-b'] },
  { piperVoiceURIs: [], localVoiceURIs: [] },
  {
    preferredVoiceURI: 'fantasma',
    piperVoiceURIs: ['piper:a'],
    localVoiceURIs: ['os-a'],
    defaultPiperVoiceURI: 'piper:a',
  },
];

const PIPER_ONLY_MODE_CASES: readonly {
  piperAvailable: boolean;
  piperVoiceURIs: readonly string[];
}[] = [
  { piperAvailable: true, piperVoiceURIs: ['piper:a'] },
  { piperAvailable: true, piperVoiceURIs: [] },
  { piperAvailable: false, piperVoiceURIs: ['piper:a'] },
  { piperAvailable: false, piperVoiceURIs: [] },
];

const PIPER_ONLY_PREFERENCE_CASES: readonly {
  preferredVoiceURI: string | undefined;
  piperAvailable: boolean;
  piperVoiceURIs: readonly string[];
}[] = [
  { preferredVoiceURI: 'piper:a', piperAvailable: true, piperVoiceURIs: ['piper:a'] },
  { preferredVoiceURI: 'os-a', piperAvailable: true, piperVoiceURIs: ['piper:a'] },
  { preferredVoiceURI: undefined, piperAvailable: true, piperVoiceURIs: ['piper:a'] },
  { preferredVoiceURI: 'os-a', piperAvailable: true, piperVoiceURIs: [] },
  { preferredVoiceURI: 'os-a', piperAvailable: false, piperVoiceURIs: ['piper:a'] },
];

interface PersistedCase {
  readonly name: string;
  readonly persistedVoiceURI: string | undefined;
  readonly offeredVoiceURIs: readonly string[];
  readonly piperAvailable: boolean;
  readonly piperVoiceURIs: readonly string[];
}

const RESOLVE_PERSISTED_CASES: readonly PersistedCase[] = [
  {
    name: 'none: sem voiceURI persistida',
    persistedVoiceURI: undefined,
    offeredVoiceURIs: [],
    piperAvailable: false,
    piperVoiceURIs: [],
  },
  {
    name: 'available: entre as oferecidas',
    persistedVoiceURI: 'piper:a',
    offeredVoiceURIs: ['piper:a'],
    piperAvailable: true,
    piperVoiceURIs: ['piper:a'],
  },
  {
    name: 'dropped: voz do SO em modo Piper-only (fronteira dropped×retained, lado dropped)',
    persistedVoiceURI: 'os-a',
    offeredVoiceURIs: ['piper:a'],
    piperAvailable: true,
    piperVoiceURIs: ['piper:a'],
  },
  {
    name: 'retained: voz Piper não mais no catálogo, mas modo Piper-only ainda ativo (fronteira dropped×retained, lado retained)',
    persistedVoiceURI: 'piper:removido',
    offeredVoiceURIs: ['piper:a'],
    piperAvailable: true,
    piperVoiceURIs: ['piper:a'],
  },
  {
    name: 'retained: modo degradado, voz do SO não mais no catálogo local',
    persistedVoiceURI: 'os-removida',
    offeredVoiceURIs: ['os-a'],
    piperAvailable: false,
    piperVoiceURIs: [],
  },
];

// --- Frente 1 (SPEC-0047): tabela de casos do par novo ------------------

interface FakePiperVoice {
  readonly id: string;
  readonly voiceURI: string;
  readonly name: string;
  readonly language: string;
  readonly sampleRate: number;
}

function fakeVoice(id: string): FakePiperVoice {
  return { id, voiceURI: `piper:${id}`, name: id, language: 'pt-BR', sampleRate: 22050 };
}

interface DefaultVoiceCase {
  readonly name: string;
  readonly voices: readonly FakePiperVoice[];
}

const DEFAULT_PIPER_VOICE_CASES: readonly DefaultVoiceCase[] = [
  { name: 'catálogo vazio', voices: [] },
  { name: 'catálogo só com pt_BR-faber-medium', voices: [fakeVoice('pt_BR-faber-medium')] },
  {
    name: 'catálogo com pt_BR-faber-medium não em primeiro lugar por ordem de id',
    voices: [fakeVoice('aaa-primeiro-por-id'), fakeVoice('pt_BR-faber-medium')],
  },
  {
    name: 'catálogo sem faber, fora de ordem de id (prova a ordenação determinística)',
    voices: [fakeVoice('zeta-modelo'), fakeVoice('alpha-modelo'), fakeVoice('mid-modelo')],
  },
  { name: 'catálogo com um item só, sem faber', voices: [fakeVoice('solo-modelo')] },
  {
    name: 'ids que diferem só por sufixo (…-low × …-medium)',
    voices: [fakeVoice('voice-a-medium'), fakeVoice('voice-a-low')],
  },
];

// --- SPEC-0052: tabelas de casos do modo hands-free ----------------------

const HANDS_FREE_STATES = [
  'off',
  'unavailable',
  'arming',
  'listening',
  'capturing',
  'transcribing',
  'sending',
  'thinking',
  'speaking',
] as const;

const HANDS_FREE_EVENTS = [
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
] as const;

interface StateEventCase {
  readonly state: (typeof HANDS_FREE_STATES)[number];
  readonly event: (typeof HANDS_FREE_EVENTS)[number];
}

const NEXT_HANDS_FREE_STATE_CASES: readonly StateEventCase[] = HANDS_FREE_STATES.flatMap((state) =>
  HANDS_FREE_EVENTS.map((event) => ({ state, event })),
);

const MICROPHONE_OPEN_CASES: readonly (typeof HANDS_FREE_STATES)[number][] = [...HANDS_FREE_STATES];

const WATCHDOG_TEXT_CASES: readonly string[] = ['', 'oi', 'a'.repeat(50), 'a'.repeat(5000)];

interface SegmenterCase {
  readonly name: string;
  readonly probabilities: readonly number[];
}

const SEGMENTER_CASES: readonly SegmenterCase[] = [
  { name: 'silêncio contínuo, nunca entra em fala', probabilities: Array(20).fill(0.1) },
  {
    name: 'entra em fala e histerese (0.6, 0.4) não encerra',
    probabilities: [0.6, 0.4, 0.4, 0.9],
  },
  {
    name: 'fala suficiente + silêncio até fechar',
    probabilities: [0.9, ...Array(10).fill(0.9), ...Array(100).fill(0.0)],
  },
  {
    name: 'fala curta (descartada) + silêncio até fechar',
    probabilities: [0.9, ...Array(100).fill(0.0)],
  },
  { name: 'teto de fala contínua', probabilities: Array(1000).fill(0.9) },
];

const CASES_BY_KEY: Record<string, readonly unknown[]> = {
  createSpeechOutput: GLUE_CASES,
  isPiperVoiceURI: PIPER_URI_CASES,
  resolveVoiceBackend: RESOLVE_BACKEND_CASES,
  isPiperOnlyMode: PIPER_ONLY_MODE_CASES,
  piperOnlyPreference: PIPER_ONLY_PREFERENCE_CASES,
  resolvePersistedVoiceSelection: RESOLVE_PERSISTED_CASES,
  PIPER_VOICE_PREFIX: [{}],
  resolveDefaultPiperVoiceURI: DEFAULT_PIPER_VOICE_CASES,
  nextHandsFreeState: NEXT_HANDS_FREE_STATE_CASES,
  handsFreeMicrophoneOpen: MICROPHONE_OPEN_CASES,
  speakingWatchdogMs: WATCHDOG_TEXT_CASES,
  createTurnSegmenter: SEGMENTER_CASES,
  handsFreeConstant: [{}],
};

// --- Frente 2: execução ---------------------------------------------------

function trackedSynth(voices: readonly VoiceInfo[]): {
  synth: SpeechSynthesisPort;
  calls: string[];
} {
  const calls: string[] = [];
  const synth: SpeechSynthesisPort = {
    getVoices: () => voices,
    speak: (spec: UtteranceSpec) => {
      calls.push(`speak:${spec.text}:${spec.voiceURI}`);
    },
    cancel: () => {
      calls.push('cancel');
    },
  };
  return { synth, calls };
}

interface Glue {
  speak(text: string): void;
  cancel(): void;
  isAvailable(): boolean;
}

describe('paridade: createSpeechOutput ↔ createSpeechOutputGlue (+ selectVoiceURI/selectLocalVoiceURI transitivos)', () => {
  it.each(GLUE_CASES.map((c) => [c.name, c] as const))('%s', async (_name, testCase) => {
    const fixture = await loadRenderer();
    try {
      const rendererGlueFactory = fixture.internals.createSpeechOutputGlue as (deps: {
        synth: SpeechSynthesisPort;
        preferredVoiceURI?: () => string | undefined;
      }) => Glue;

      const moduleSide = trackedSynth(testCase.voices);
      const rendererSide = trackedSynth(testCase.voices);

      const moduleGlue = createSpeechOutput(
        testCase.preferredVoiceURI !== undefined
          ? { synth: moduleSide.synth, preferredVoiceURI: testCase.preferredVoiceURI }
          : { synth: moduleSide.synth },
      );
      const rendererGlue = rendererGlueFactory(
        testCase.preferredVoiceURI !== undefined
          ? { synth: rendererSide.synth, preferredVoiceURI: testCase.preferredVoiceURI }
          : { synth: rendererSide.synth },
      );

      moduleGlue.speak(testCase.text);
      rendererGlue.speak(testCase.text);

      expect(rendererSide.calls).toEqual(moduleSide.calls);
      expect(rendererGlue.isAvailable()).toBe(moduleGlue.isAvailable());
    } finally {
      fixture.close();
    }
  });

  it('cancel() explícito produz a mesma chamada nas duas implementações', async () => {
    const fixture = await loadRenderer();
    try {
      const rendererGlueFactory = fixture.internals.createSpeechOutputGlue as (deps: {
        synth: SpeechSynthesisPort;
      }) => Glue;
      const moduleSide = trackedSynth([LOCAL_1]);
      const rendererSide = trackedSynth([LOCAL_1]);

      createSpeechOutput({ synth: moduleSide.synth }).cancel();
      rendererGlueFactory({ synth: rendererSide.synth }).cancel();

      expect(rendererSide.calls).toEqual(moduleSide.calls);
    } finally {
      fixture.close();
    }
  });

  it('preferência amostrada a cada speak (não fixada): duas chamadas com preferências diferentes produzem a mesma sequência nos dois lados', async () => {
    const fixture = await loadRenderer();
    try {
      const rendererGlueFactory = fixture.internals.createSpeechOutputGlue as (deps: {
        synth: SpeechSynthesisPort;
        preferredVoiceURI: () => string | undefined;
      }) => Glue;
      const moduleSide = trackedSynth([LOCAL_1, LOCAL_2]);
      const rendererSide = trackedSynth([LOCAL_1, LOCAL_2]);

      let currentModule = 'local-1';
      let currentRenderer = 'local-1';
      const moduleGlue = createSpeechOutput({
        synth: moduleSide.synth,
        preferredVoiceURI: () => currentModule,
      });
      const rendererGlue = rendererGlueFactory({
        synth: rendererSide.synth,
        preferredVoiceURI: () => currentRenderer,
      });

      moduleGlue.speak('primeiro');
      rendererGlue.speak('primeiro');
      currentModule = 'local-2';
      currentRenderer = 'local-2';
      moduleGlue.speak('segundo');
      rendererGlue.speak('segundo');

      expect(rendererSide.calls).toEqual(moduleSide.calls);
    } finally {
      fixture.close();
    }
  });
});

describe('paridade: isPiperVoiceURI', () => {
  it.each(PIPER_URI_CASES.map((v) => [v] as const))('%s', async (voiceURI) => {
    const fixture = await loadRenderer();
    try {
      const rendererFn = fixture.internals.isPiperVoiceURI as (v: string) => boolean;
      expect(rendererFn(voiceURI)).toBe(isPiperVoiceURI(voiceURI));
    } finally {
      fixture.close();
    }
  });
});

describe('paridade: resolveVoiceBackend', () => {
  it.each(RESOLVE_BACKEND_CASES.map((c, i) => [i, c] as const))('caso %i', async (_i, input) => {
    const fixture = await loadRenderer();
    try {
      const rendererFn = fixture.internals.resolveVoiceBackend as (
        i: ResolveVoiceBackendInput,
      ) => unknown;
      expect(rendererFn(input)).toEqual(resolveVoiceBackend(input));
    } finally {
      fixture.close();
    }
  });
});

describe('paridade: isPiperOnlyMode', () => {
  it.each(PIPER_ONLY_MODE_CASES.map((c, i) => [i, c] as const))('caso %i', async (_i, input) => {
    const fixture = await loadRenderer();
    try {
      const rendererFn = fixture.internals.isPiperOnlyMode as (i: typeof input) => boolean;
      expect(rendererFn(input)).toBe(isPiperOnlyMode(input));
    } finally {
      fixture.close();
    }
  });
});

describe('paridade: piperOnlyPreference', () => {
  it.each(PIPER_ONLY_PREFERENCE_CASES.map((c, i) => [i, c] as const))(
    'caso %i',
    async (_i, input) => {
      const fixture = await loadRenderer();
      try {
        const rendererFn = fixture.internals.piperOnlyPreference as (
          i: typeof input,
        ) => string | undefined;
        expect(rendererFn(input)).toBe(piperOnlyPreference(input));
      } finally {
        fixture.close();
      }
    },
  );
});

describe('paridade: resolvePersistedVoiceSelection (4 desfechos, incluindo fronteira dropped×retained)', () => {
  it.each(RESOLVE_PERSISTED_CASES.map((c) => [c.name, c] as const))('%s', async (_name, input) => {
    const fixture = await loadRenderer();
    try {
      const rendererFn = fixture.internals.resolvePersistedVoiceSelection as (
        i: Omit<PersistedCase, 'name'>,
      ) => unknown;
      const pureInput = {
        persistedVoiceURI: input.persistedVoiceURI,
        offeredVoiceURIs: input.offeredVoiceURIs,
        piperAvailable: input.piperAvailable,
        piperVoiceURIs: input.piperVoiceURIs,
      };
      expect(rendererFn(pureInput)).toEqual(resolvePersistedVoiceSelection(pureInput));
    } finally {
      fixture.close();
    }
  });
});

describe('paridade: PIPER_VOICE_PREFIX', () => {
  it('constante idêntica nos dois lados', async () => {
    const fixture = await loadRenderer();
    try {
      expect(fixture.internals.PIPER_VOICE_PREFIX).toBe(PIPER_VOICE_PREFIX);
    } finally {
      fixture.close();
    }
  });
});

describe('paridade: resolveDefaultPiperVoiceURI ↔ computeDefaultPiperVoiceURI (Frente 1, décima réplica)', () => {
  it.each(DEFAULT_PIPER_VOICE_CASES.map((c) => [c.name, c] as const))(
    '%s',
    async (_name, testCase) => {
      const fixture = await loadRenderer();
      try {
        const rendererFn = fixture.internals.computeDefaultPiperVoiceURI as (
          voices: readonly FakePiperVoice[],
        ) => string | undefined;
        expect(rendererFn(testCase.voices)).toBe(resolveDefaultPiperVoiceURI(testCase.voices));
      } finally {
        fixture.close();
      }
    },
  );
});

// --- SPEC-0052: paridade do 4º módulo vigiado (hands-free.ts) -------------

describe('paridade: nextHandsFreeState', () => {
  it.each(NEXT_HANDS_FREE_STATE_CASES.map((c) => [`${c.state}+${c.event}`, c] as const))(
    '%s',
    async (_name, testCase) => {
      const fixture = await loadRenderer();
      try {
        const rendererFn = fixture.internals.nextHandsFreeState as (
          state: string,
          event: string,
        ) => string;
        expect(rendererFn(testCase.state, testCase.event)).toBe(
          nextHandsFreeState(testCase.state, testCase.event),
        );
      } finally {
        fixture.close();
      }
    },
  );
});

describe('paridade: handsFreeMicrophoneOpen', () => {
  it.each(MICROPHONE_OPEN_CASES.map((s) => [s] as const))('%s', async (state) => {
    const fixture = await loadRenderer();
    try {
      const rendererFn = fixture.internals.handsFreeMicrophoneOpen as (s: string) => boolean;
      expect(rendererFn(state)).toBe(handsFreeMicrophoneOpen(state));
    } finally {
      fixture.close();
    }
  });
});

describe('paridade: speakingWatchdogMs', () => {
  it.each(WATCHDOG_TEXT_CASES.map((t) => [t.length, t] as const))(
    'texto de %i caracteres',
    async (_len, text) => {
      const fixture = await loadRenderer();
      try {
        const rendererFn = fixture.internals.speakingWatchdogMs as (t: string) => number;
        expect(rendererFn(text)).toBe(speakingWatchdogMs(text));
      } finally {
        fixture.close();
      }
    },
  );
});

describe('paridade: createTurnSegmenter', () => {
  it.each(SEGMENTER_CASES.map((c) => [c.name, c] as const))('%s', async (_name, testCase) => {
    const fixture = await loadRenderer();
    try {
      const rendererFactory = fixture.internals.createTurnSegmenter as (config: {
        speechEnter: number;
        speechExit: number;
        minSpeechMs: number;
        silenceCloseMs: number;
        maxUtteranceMs: number;
        frameMs: number;
      }) => { push(p: number): unknown; reset(): void };
      const config = {
        speechEnter: SPEECH_ENTER,
        speechExit: SPEECH_EXIT,
        minSpeechMs: MIN_SPEECH_MS,
        silenceCloseMs: SILENCE_CLOSE_MS,
        maxUtteranceMs: MAX_UTTERANCE_MS,
        frameMs: FRAME_MS,
      };
      const moduleSegmenter = createTurnSegmenter(config);
      const rendererSegmenter = rendererFactory(config);
      const moduleEvents = testCase.probabilities.map((p) => moduleSegmenter.push(p));
      const rendererEvents = testCase.probabilities.map((p) => rendererSegmenter.push(p));
      expect(rendererEvents).toEqual(moduleEvents);
    } finally {
      fixture.close();
    }
  });
});

describe('paridade: constantes pinadas de hands-free.ts', () => {
  const CONSTANT_PAIRS: readonly [string, unknown][] = [
    ['HF_FRAME_SAMPLES', FRAME_SAMPLES],
    ['HF_FRAME_MS', FRAME_MS],
    ['HF_SPEECH_ENTER', SPEECH_ENTER],
    ['HF_SPEECH_EXIT', SPEECH_EXIT],
    ['HF_MIN_SPEECH_MS', MIN_SPEECH_MS],
    ['HF_PRE_ROLL_FRAMES', PRE_ROLL_FRAMES],
    ['HF_SILENCE_CLOSE_MS', SILENCE_CLOSE_MS],
    ['HF_MAX_UTTERANCE_MS', MAX_UTTERANCE_MS],
    ['HF_CAPTURE_REARM_MS', CAPTURE_REARM_MS],
    ['HF_VAD_QUEUE_LIMIT', VAD_QUEUE_LIMIT],
    ['HF_THINKING_WATCHDOG_MS', THINKING_WATCHDOG_MS],
    ['HF_SPEAKING_WATCHDOG_BASE_MS', SPEAKING_WATCHDOG_BASE_MS],
    ['HF_SPEAKING_WATCHDOG_PER_CHAR_MS', SPEAKING_WATCHDOG_PER_CHAR_MS],
    ['HF_SPEAKING_WATCHDOG_MAX_MS', SPEAKING_WATCHDOG_MAX_MS],
  ];

  it.each(CONSTANT_PAIRS.map(([symbol]) => [symbol] as const))(
    '%s idêntica nos dois lados',
    async (symbol) => {
      const fixture = await loadRenderer();
      try {
        const expected = CONSTANT_PAIRS.find(([s]) => s === symbol)![1];
        expect(fixture.internals[symbol]).toBe(expected);
      } finally {
        fixture.close();
      }
    },
  );
});

// --- Frente 3 (SPEC-0045) / Frente 1 (SPEC-0047) / SPEC-0052: gate mecânico
// da próxima réplica, generalizado à lista de módulos-fonte vigiados -------

describe('gate mecânico da próxima réplica, generalizado a speech-output/piper-tts/stt-engine/hands-free/system-metrics/token-usage/model-catalog (SPEC-0052/SPEC-0054/SPEC-0063)', () => {
  it('a lista de módulos vigiados contém exatamente speech-output, piper-tts, stt-engine, hands-free, system-metrics, token-usage e model-catalog', () => {
    expect(Object.keys(WATCHED_MODULES).sort()).toEqual(
      [
        'speech-output',
        'piper-tts',
        'stt-engine',
        'hands-free',
        'system-metrics',
        'token-usage',
        'model-catalog',
      ].sort(),
    );
  });

  it('registro contém exatamente 28 entradas (10 pré-SPEC-0052 + 4 funções + 14 constantes de hands-free.ts)', () => {
    expect(REGISTRY.length).toBe(28);
  });

  it('todo export de valor de cada módulo vigiado está classificado (registro direto ou NOT_MIRRORED), enumerado em runtime via import * as', () => {
    for (const moduleSource of Object.keys(WATCHED_MODULES) as WatchedModule[]) {
      const exportedNames = Object.keys(WATCHED_MODULES[moduleSource]);
      expect(exportedNames.length, `sem exports em ${moduleSource}`).toBeGreaterThan(0);

      const registeredDirectModuleSymbols = new Set(
        REGISTRY.filter(
          (entry) => entry.moduleSource === moduleSource && entry.kind === 'direct',
        ).map((entry) => entry.moduleSymbol),
      );
      const notMirroredSymbols = new Set(
        NOT_MIRRORED.filter((entry) => entry.moduleSource === moduleSource).map(
          (entry) => entry.symbol,
        ),
      );

      for (const name of exportedNames) {
        const classified = registeredDirectModuleSymbols.has(name) || notMirroredSymbols.has(name);
        expect(
          classified,
          `export não classificado no registro nem em NOT_MIRRORED: ${moduleSource}.${name}`,
        ).toBe(true);
      }
    }
  });

  it('NOT_MIRRORED contém piperModelIdOf/createPiperTts/createSttEngine com moduleSource e justificativa, e nenhuma entrada sem justificativa', () => {
    const expected: readonly [WatchedModule, string][] = [
      ['speech-output', 'piperModelIdOf'],
      ['piper-tts', 'createPiperTts'],
      ['stt-engine', 'createSttEngine'],
    ];
    for (const [moduleSource, symbol] of expected) {
      const entry = NOT_MIRRORED.find(
        (n) => n.moduleSource === moduleSource && n.symbol === symbol,
      );
      expect(entry, `entrada ausente: ${moduleSource}.${symbol}`).toBeDefined();
    }
    for (const n of NOT_MIRRORED) {
      expect(n.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('toda entrada do registro aponta para um símbolo do renderer que o harness conseguiu extrair', async () => {
    const fixture: RendererFixture = await loadRenderer();
    try {
      for (const entry of REGISTRY) {
        expect(
          fixture.internals[entry.rendererSymbol],
          `símbolo do renderer ausente/renomeado silenciosamente: ${entry.rendererSymbol}`,
        ).not.toBeUndefined();
      }
    } finally {
      fixture.close();
    }
  });

  it('toda entrada do registro tem ao menos um caso executado na tabela correspondente', () => {
    for (const entry of REGISTRY) {
      const cases = CASES_BY_KEY[entry.casesKey];
      expect(cases, `sem tabela de casos para ${entry.casesKey}`).toBeDefined();
      expect(
        cases?.length ?? 0,
        `sem casos para ${entry.moduleSymbol} (${entry.casesKey})`,
      ).toBeGreaterThan(0);
    }
  });
});
