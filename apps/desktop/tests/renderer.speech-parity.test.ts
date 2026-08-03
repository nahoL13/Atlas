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

/** Módulos-fonte vigiados pelo gate (SPEC-0047/D1) — a FONTE da enumeração é o `import * as` em runtime, nunca uma lista escrita à mão dos nomes exportados. */
type WatchedModule = 'speech-output' | 'piper-tts' | 'stt-engine';

const WATCHED_MODULES: Readonly<Record<WatchedModule, Record<string, unknown>>> = {
  'speech-output': speechOutputModule as unknown as Record<string, unknown>,
  'piper-tts': piperTtsModule as unknown as Record<string, unknown>,
  'stt-engine': sttEngineModule as unknown as Record<string, unknown>,
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

const CASES_BY_KEY: Record<string, readonly unknown[]> = {
  createSpeechOutput: GLUE_CASES,
  isPiperVoiceURI: PIPER_URI_CASES,
  resolveVoiceBackend: RESOLVE_BACKEND_CASES,
  isPiperOnlyMode: PIPER_ONLY_MODE_CASES,
  piperOnlyPreference: PIPER_ONLY_PREFERENCE_CASES,
  resolvePersistedVoiceSelection: RESOLVE_PERSISTED_CASES,
  PIPER_VOICE_PREFIX: [{}],
  resolveDefaultPiperVoiceURI: DEFAULT_PIPER_VOICE_CASES,
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

// --- Frente 3 (SPEC-0045) / Frente 1 (SPEC-0047): gate mecânico da próxima
// réplica, generalizado à lista de módulos-fonte vigiados (D1/D2) ----------

describe('gate mecânico da próxima réplica, generalizado a speech-output/piper-tts/stt-engine (SPEC-0047, Frente 1)', () => {
  it('a lista de módulos vigiados contém exatamente speech-output, piper-tts e stt-engine', () => {
    expect(Object.keys(WATCHED_MODULES).sort()).toEqual(
      ['speech-output', 'piper-tts', 'stt-engine'].sort(),
    );
  });

  it('registro contém exatamente as 10 entradas (9 da SPEC-0045 + resolveDefaultPiperVoiceURI)', () => {
    expect(REGISTRY.length).toBe(10);
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
