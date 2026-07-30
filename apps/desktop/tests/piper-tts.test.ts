import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PiperFsPort, PiperProcess, PiperVoice } from '../src/piper-tts.js';
import {
  PIPER_VOICE_PREFIX,
  createPiperTts,
  resolveDefaultPiperVoiceURI,
} from '../src/piper-tts.js';

const MODELS_DIR = '/models';
const BINARY = '/piper/piper';

interface FakeFs {
  readonly port: PiperFsPort;
  readonly dirs: Map<string, string[]>;
  readonly textFiles: Map<string, string>;
  readonly byteFiles: Map<string, Uint8Array>;
  readonly removedPaths: string[];
  readonly binaryPaths: Set<string>;
}

function createFakeFsPort(): FakeFs {
  const dirs = new Map<string, string[]>();
  const textFiles = new Map<string, string>();
  const byteFiles = new Map<string, Uint8Array>();
  const removedPaths: string[] = [];
  const binaryPaths = new Set<string>();

  const port: PiperFsPort = {
    listDir: async (dir) => {
      const entries = dirs.get(dir);
      if (entries === undefined) {
        throw new Error(`ENOENT: ${dir}`);
      }
      return entries;
    },
    readText: async (path) => {
      const text = textFiles.get(path);
      if (text === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return text;
    },
    readBytes: async (path) => {
      const bytes = byteFiles.get(path);
      if (bytes === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return bytes;
    },
    remove: async (path) => {
      removedPaths.push(path);
      byteFiles.delete(path);
    },
    exists: async (path) => byteFiles.has(path) || binaryPaths.has(path),
  };

  return { port, dirs, textFiles, byteFiles, removedPaths, binaryPaths };
}

interface FakeProcessHandle {
  readonly process: PiperProcess;
  readonly writes: string[];
  readonly killCalls: number;
  emitStdoutLine(line: string): void;
  emitExit(code: number | null): void;
  wasKilled(): boolean;
}

function createFakeProcess(): FakeProcessHandle {
  const stdoutListeners: Array<(line: string) => void> = [];
  const exitListeners: Array<(code: number | null) => void> = [];
  const writes: string[] = [];
  let killed = 0;

  const process: PiperProcess = {
    writeLine: (line) => {
      writes.push(line);
    },
    onStdoutLine: (cb) => {
      stdoutListeners.push(cb);
    },
    onExit: (cb) => {
      exitListeners.push(cb);
    },
    kill: () => {
      killed += 1;
    },
  };

  return {
    process,
    writes,
    get killCalls() {
      return killed;
    },
    emitStdoutLine: (line) => {
      for (const cb of stdoutListeners) cb(line);
    },
    emitExit: (code) => {
      for (const cb of exitListeners) cb(code);
    },
    wasKilled: () => killed > 0,
  };
}

interface FakeSpawn {
  readonly spawn: (command: string, args: readonly string[]) => PiperProcess;
  readonly calls: Array<{ command: string; args: readonly string[] }>;
  readonly handles: FakeProcessHandle[];
}

function createFakeSpawn(): FakeSpawn {
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  const handles: FakeProcessHandle[] = [];
  const spawn = (command: string, args: readonly string[]): PiperProcess => {
    calls.push({ command, args });
    const handle = createFakeProcess();
    handles.push(handle);
    return handle.process;
  };
  return { spawn, calls, handles };
}

/** `noUncheckedIndexedAccess` faz acesso por índice devolver `T | undefined`; testes conhecem os índices por construção. */
function must<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('valor inesperado ausente no teste');
  }
  return value;
}

function lastWriteOutputFile(handle: FakeProcessHandle): string {
  const last = must(handle.writes[handle.writes.length - 1]);
  return (JSON.parse(last) as { output_file: string }).output_file;
}

/**
 * A porta `fs` fake é assíncrona (Promises reais) — `discoverVoices` faz uma
 * cadeia de `await`s antes de `synthesize` chegar ao `spawn`/`writeLine`
 * síncronos. Drena a fila de microtasks para que os testes possam observar
 * esse ponto sem depender da contagem exata de `await`s internos.
 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

function setup() {
  const fakeFs = createFakeFsPort();
  const fakeSpawn = createFakeSpawn();
  let idCounter = 0;
  const tts = createPiperTts({
    fs: fakeFs.port,
    spawn: fakeSpawn.spawn,
    tmpDir: () => '/tmp',
    randomId: () => `id${(idCounter += 1)}`,
    paths: { binary: BINARY, modelsDir: MODELS_DIR },
  });
  return { fakeFs, fakeSpawn, tts };
}

const FABER_CONFIG = {
  audio: { sample_rate: 22050, quality: 'medium' },
  espeak: { voice: 'pt-br' },
  language: { code: 'pt_BR', family: 'pt', region: 'BR' },
  dataset: 'faber',
  piper_version: '1.0.0',
};

function registerVoice(fakeFs: FakeFs, id: string, config: unknown): void {
  const existing = fakeFs.dirs.get(MODELS_DIR) ?? [];
  fakeFs.dirs.set(MODELS_DIR, [...existing, `${id}.onnx`, `${id}.onnx.json`]);
  fakeFs.byteFiles.set(`${MODELS_DIR}/${id}.onnx`, new Uint8Array([1]));
  fakeFs.textFiles.set(`${MODELS_DIR}/${id}.onnx.json`, JSON.stringify(config));
}

describe('piper-tts: descoberta de vozes', () => {
  it('critério 1: um PiperVoice por par completo, campos lidos dos caminhos reais de D13', async () => {
    const { fakeFs, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);

    const voices = await tts.listVoices();
    expect(voices).toHaveLength(1);
    expect(voices[0]).toEqual<PiperVoice>({
      id: 'pt_BR-faber-medium',
      voiceURI: 'piper:pt_BR-faber-medium',
      name: 'faber (pt_BR, medium)',
      language: 'pt_BR',
      sampleRate: 22050,
    });
  });

  it('critério 2: audio.sample_rate ausente deriva de audio.quality (low/x_low ⇒ 16000, resto ⇒ 22050), modelo continua na lista', async () => {
    const { fakeFs, tts } = setup();
    registerVoice(fakeFs, 'v-low', { audio: { quality: 'low' } });
    registerVoice(fakeFs, 'v-xlow', { audio: { quality: 'x_low' } });
    registerVoice(fakeFs, 'v-medium', { audio: { quality: 'medium' } });
    registerVoice(fakeFs, 'v-noaudio', {});

    const voices = await tts.listVoices();
    const byId = new Map(voices.map((v) => [v.id, v]));
    expect(byId.get('v-low')?.sampleRate).toBe(16000);
    expect(byId.get('v-xlow')?.sampleRate).toBe(16000);
    expect(byId.get('v-medium')?.sampleRate).toBe(22050);
    expect(byId.get('v-noaudio')?.sampleRate).toBe(22050);
    expect(voices).toHaveLength(4);
  });

  it('critério 2: language ausente cai em espeak.voice, e na falta dele no prefixo do id; sem dataset, name === id', async () => {
    const { fakeFs, tts } = setup();
    registerVoice(fakeFs, 'v-espeak', { espeak: { voice: 'pt-br' } });
    registerVoice(fakeFs, 'prefix-only-id', {});

    const voices = await tts.listVoices();
    const byId = new Map(voices.map((v) => [v.id, v]));
    expect(byId.get('v-espeak')?.language).toBe('pt-br');
    expect(byId.get('v-espeak')?.name).toBe('v-espeak');
    expect(byId.get('prefix-only-id')?.language).toBe('prefix');
    expect(byId.get('prefix-only-id')?.name).toBe('prefix-only-id');
  });

  it('critério 3: omite o modelo só por par incompleto ou JSON inválido/não-objeto, nunca por outro motivo, sem lançar', async () => {
    const { fakeFs, tts } = setup();
    // .onnx sem .onnx.json irmão
    fakeFs.dirs.set(MODELS_DIR, [
      'only-onnx.onnx',
      'only-json.onnx.json',
      'bad-json.onnx',
      'bad-json.onnx.json',
      'not-object.onnx',
      'not-object.onnx.json',
      'ok.onnx',
      'ok.onnx.json',
    ]);
    fakeFs.textFiles.set(`${MODELS_DIR}/bad-json.onnx.json`, '{not valid json');
    fakeFs.textFiles.set(`${MODELS_DIR}/not-object.onnx.json`, '"just a string"');
    fakeFs.textFiles.set(`${MODELS_DIR}/ok.onnx.json`, JSON.stringify(FABER_CONFIG));

    const voices = await tts.listVoices();
    expect(voices.map((v) => v.id)).toEqual(['ok']);
  });

  it('critério 4: modelsDir inexistente/ilegível ⇒ listVoices [] e isAvailable false, sem lançar', async () => {
    const { tts } = setup();
    await expect(tts.listVoices()).resolves.toEqual([]);
    await expect(tts.isAvailable()).resolves.toBe(false);
  });

  it('critério 5: binário ausente ⇒ isAvailable false mesmo havendo modelos', async () => {
    const { fakeFs, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    await expect(tts.isAvailable()).resolves.toBe(false);
  });

  it('isAvailable true com binário presente e ≥1 modelo', async () => {
    const { fakeFs, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    fakeFs.binaryPaths.add(BINARY);
    await expect(tts.isAvailable()).resolves.toBe(true);
  });
});

describe('piper-tts: resolveDefaultPiperVoiceURI (D9)', () => {
  it('prefere pt_BR-faber-medium quando presente', () => {
    const voices: PiperVoice[] = [
      {
        id: 'pt_BR-outro',
        voiceURI: 'piper:pt_BR-outro',
        name: 'x',
        language: 'pt_BR',
        sampleRate: 22050,
      },
      {
        id: 'pt_BR-faber-medium',
        voiceURI: 'piper:pt_BR-faber-medium',
        name: 'faber',
        language: 'pt_BR',
        sampleRate: 22050,
      },
    ];
    expect(resolveDefaultPiperVoiceURI(voices)).toBe('piper:pt_BR-faber-medium');
  });

  it('sem faber, cai no primeiro por ordem de id', () => {
    const voices: PiperVoice[] = [
      { id: 'zzz', voiceURI: 'piper:zzz', name: 'z', language: 'pt_BR', sampleRate: 22050 },
      { id: 'aaa', voiceURI: 'piper:aaa', name: 'a', language: 'pt_BR', sampleRate: 22050 },
    ];
    expect(resolveDefaultPiperVoiceURI(voices)).toBe('piper:aaa');
  });

  it('lista vazia ⇒ undefined', () => {
    expect(resolveDefaultPiperVoiceURI([])).toBeUndefined();
  });
});

describe('piper-tts: processo de longa duração e contrato de invocação (D4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function synthesizeAndComplete(
    fakeFs: FakeFs,
    fakeSpawn: FakeSpawn,
    tts: ReturnType<typeof createPiperTts>,
    text: string,
    voiceURI: string,
    wav: Uint8Array = new Uint8Array([1, 2, 3]),
  ) {
    const promise = tts.synthesize(text, voiceURI);
    await flushMicrotasks();
    const handle = must(fakeSpawn.handles[fakeSpawn.handles.length - 1]);
    const outputFile = lastWriteOutputFile(handle);
    fakeFs.byteFiles.set(outputFile, wav);
    handle.emitStdoutLine('/output/echo/path.wav');
    return promise;
  }

  it('critério 6: duas chamadas consecutivas do mesmo voiceURI produzem exatamente uma invocação de SpawnPiper', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    await synthesizeAndComplete(fakeFs, fakeSpawn, tts, 'olá', voiceURI);
    await synthesizeAndComplete(fakeFs, fakeSpawn, tts, 'mundo', voiceURI);

    expect(fakeSpawn.calls).toHaveLength(1);
  });

  it('critério 7: voiceURI de modelo diferente encerra o processo anterior e sobe um novo', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    registerVoice(fakeFs, 'pt_BR-outro-medium', FABER_CONFIG);

    await synthesizeAndComplete(
      fakeFs,
      fakeSpawn,
      tts,
      'olá',
      PIPER_VOICE_PREFIX + 'pt_BR-faber-medium',
    );
    const firstHandle = must(fakeSpawn.handles[0]);
    await synthesizeAndComplete(
      fakeFs,
      fakeSpawn,
      tts,
      'olá',
      PIPER_VOICE_PREFIX + 'pt_BR-outro-medium',
    );

    expect(fakeSpawn.calls).toHaveLength(2);
    expect(firstHandle.wasKilled()).toBe(true);
  });

  it('critério 8: argv é exatamente o de D4, array, sem shell, sem o texto do usuário', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);

    await synthesizeAndComplete(
      fakeFs,
      fakeSpawn,
      tts,
      'segredo do usuário',
      PIPER_VOICE_PREFIX + 'pt_BR-faber-medium',
    );

    expect(fakeSpawn.calls).toHaveLength(1);
    const call = must(fakeSpawn.calls[0]);
    expect(call.command).toBe(BINARY);
    expect(Array.isArray(call.args)).toBe(true);
    expect(call.args).toEqual([
      '--model',
      `${MODELS_DIR}/pt_BR-faber-medium.onnx`,
      '--config',
      `${MODELS_DIR}/pt_BR-faber-medium.onnx.json`,
      '--json-input',
    ]);
    expect(call.args.some((arg) => arg.includes('segredo'))).toBe(false);
  });

  it('critério 9: uma única linha JSON no stdin com só text/output_file, whitespace colapsado, escapado', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    await synthesizeAndComplete(
      fakeFs,
      fakeSpawn,
      tts,
      'linha1\nlinha2   "aspas" \\barra',
      voiceURI,
    );

    const handle = must(fakeSpawn.handles[0]);
    expect(handle.writes).toHaveLength(1);
    const parsed = JSON.parse(must(handle.writes[0])) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['output_file', 'text']);
    expect(parsed['text']).toBe('linha1 linha2 "aspas" \\barra');
    expect(must(handle.writes[0])).not.toContain('\n');
  });

  it('critério 10: output_file gerado no main process, imune a text/voiceURI hostis, distinto entre utterances', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    await synthesizeAndComplete(fakeFs, fakeSpawn, tts, '../../etc/passwd %00', voiceURI);
    const firstFile = lastWriteOutputFile(must(fakeSpawn.handles[0]));
    await synthesizeAndComplete(fakeFs, fakeSpawn, tts, 'texto normal', voiceURI);
    const secondFile = lastWriteOutputFile(must(fakeSpawn.handles[0]));

    expect(firstFile).toMatch(/^\/tmp\/atlas-tts-id\d+\.wav$/);
    expect(secondFile).toMatch(/^\/tmp\/atlas-tts-id\d+\.wav$/);
    expect(firstFile).not.toBe(secondFile);
  });

  it('critério 10 (voiceURI hostil): resolvido contra o catálogo — voiceURI com caminho hostil e desconhecido resolve undefined, sem spawn', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);

    const result = await tts.synthesize('olá', 'piper:../../etc/passwd');
    expect(result).toBeUndefined();
    expect(fakeSpawn.calls).toHaveLength(0);
  });

  it('critério 11: em sucesso resolve { wav, sampleRate } com os bytes do arquivo, e remove o arquivo ao final', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const wav = new Uint8Array([9, 9, 9]);

    const result = await synthesizeAndComplete(
      fakeFs,
      fakeSpawn,
      tts,
      'olá',
      PIPER_VOICE_PREFIX + 'pt_BR-faber-medium',
      wav,
    );

    expect(result).toEqual({ wav, sampleRate: 22050 });
    const outputFile = lastWriteOutputFile(must(fakeSpawn.handles[0]));
    expect(fakeFs.removedPaths).toContain(outputFile);
    expect(fakeFs.byteFiles.has(outputFile)).toBe(false);
  });

  it('critério 12: conclusão pela 1ª linha de stdout, sem parsear; arquivo ausente/vazio na conclusão ⇒ undefined; stderr/linhas extra não interferem', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    const promise = tts.synthesize('olá', voiceURI);
    await flushMicrotasks();
    const handle = must(fakeSpawn.handles[0]);
    // Arquivo nunca escrito nesse caminho: conclusão sem bytes disponíveis.
    handle.emitStdoutLine('qualquer coisa, não é parseada');
    await expect(promise).resolves.toBeUndefined();
  });

  it('critério 12b: arquivo vazio na conclusão ⇒ undefined', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    const promise = tts.synthesize('olá', voiceURI);
    await flushMicrotasks();
    const handle = must(fakeSpawn.handles[0]);
    const outputFile = lastWriteOutputFile(handle);
    fakeFs.byteFiles.set(outputFile, new Uint8Array([]));
    handle.emitStdoutLine('eco');
    await expect(promise).resolves.toBeUndefined();
  });

  it('critério 13: sem linha de conclusão dentro do timeout ⇒ undefined, arquivo removido, processo reciclado (novo spawn na chamada seguinte)', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    const promise = tts.synthesize('olá', voiceURI);
    await flushMicrotasks();
    const firstHandle = must(fakeSpawn.handles[0]);
    const outputFile = lastWriteOutputFile(firstHandle);
    fakeFs.byteFiles.set(outputFile, new Uint8Array([1]));

    await vi.advanceTimersByTimeAsync(15_000);
    await expect(promise).resolves.toBeUndefined();
    expect(fakeFs.removedPaths).toContain(outputFile);
    expect(firstHandle.wasKilled()).toBe(true);

    // chamada seguinte sobe um processo novo
    await synthesizeAndComplete(fakeFs, fakeSpawn, tts, 'oi de novo', voiceURI);
    expect(fakeSpawn.calls).toHaveLength(2);
  });

  it('critério 14: voiceURI desconhecido ⇒ undefined sem lançar, sem spawn; chamada posterior volta a funcionar', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);

    await expect(tts.synthesize('olá', 'piper:desconhecido')).resolves.toBeUndefined();
    expect(fakeSpawn.calls).toHaveLength(0);

    await synthesizeAndComplete(
      fakeFs,
      fakeSpawn,
      tts,
      'olá',
      PIPER_VOICE_PREFIX + 'pt_BR-faber-medium',
    );
    expect(fakeSpawn.calls).toHaveLength(1);
  });

  it('critério 14: texto vazio/só espaços ⇒ undefined sem spawn', async () => {
    const { tts, fakeSpawn } = setup();
    await expect(tts.synthesize('', PIPER_VOICE_PREFIX + 'x')).resolves.toBeUndefined();
    await expect(tts.synthesize('   ', PIPER_VOICE_PREFIX + 'x')).resolves.toBeUndefined();
    expect(fakeSpawn.calls).toHaveLength(0);
  });

  it('critério 14: processo morrendo no meio da utterance ⇒ undefined sem lançar; chamada posterior volta a funcionar', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    const promise = tts.synthesize('olá', voiceURI);
    await flushMicrotasks();
    const handle = must(fakeSpawn.handles[0]);
    handle.emitExit(1);
    await expect(promise).resolves.toBeUndefined();

    await synthesizeAndComplete(fakeFs, fakeSpawn, tts, 'de novo', voiceURI);
    expect(fakeSpawn.calls).toHaveLength(2);
  });

  it('critério 14: erro de spawn ⇒ undefined sem lançar; chamada posterior volta a funcionar', async () => {
    const { fakeFs } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    const throwingTts = createPiperTts({
      fs: fakeFs.port,
      spawn: () => {
        throw new Error('spawn falhou');
      },
      tmpDir: () => '/tmp',
      randomId: () => 'id',
      paths: { binary: BINARY, modelsDir: MODELS_DIR },
    });

    await expect(throwingTts.synthesize('olá', voiceURI)).resolves.toBeUndefined();
  });

  it('critério 15/achado A1: uma segunda synthesize submetida com a primeira em voo cancela a primeira (kill observável) e um NOVO spawn atende a segunda', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    const first = tts.synthesize('primeira', voiceURI);
    await flushMicrotasks();
    const firstHandle = must(fakeSpawn.handles[0]);
    expect(fakeSpawn.calls).toHaveLength(1);

    const second = tts.synthesize('segunda', voiceURI);
    await flushMicrotasks();
    // Cancelamento da primeira já deve ter reciclado o processo corrente —
    // discriminante do achado A1: um fake que só emitisse uma linha
    // qualquer (sem observar kill+novo spawn) não bastaria aqui.
    expect(firstHandle.wasKilled()).toBe(true);
    expect(fakeSpawn.calls).toHaveLength(2);
    await expect(first).resolves.toBeUndefined();

    const secondHandle = must(fakeSpawn.handles[1]);
    const outputFile = lastWriteOutputFile(secondHandle);
    fakeFs.byteFiles.set(outputFile, new Uint8Array([1, 2]));
    secondHandle.emitStdoutLine('eco');
    await expect(second).resolves.toEqual({ wav: new Uint8Array([1, 2]), sampleRate: 22050 });
  });

  it('critério 16: cancel() durante uma utterance em voo resolve undefined sem lançar', async () => {
    const { fakeFs, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    const promise = tts.synthesize('olá', voiceURI);
    await flushMicrotasks();
    expect(() => tts.cancel()).not.toThrow();
    await expect(promise).resolves.toBeUndefined();
  });

  it('critério 16/achado A1: cancel() encerra (kill) o processo corrente, e a chamada seguinte sobe um processo novo', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);
    const voiceURI = PIPER_VOICE_PREFIX + 'pt_BR-faber-medium';

    const promise = tts.synthesize('olá', voiceURI);
    await flushMicrotasks();
    const handle = must(fakeSpawn.handles[0]);
    tts.cancel();
    await promise;

    expect(handle.wasKilled()).toBe(true);

    await synthesizeAndComplete(fakeFs, fakeSpawn, tts, 'de novo', voiceURI);
    expect(fakeSpawn.calls).toHaveLength(2);
  });

  it('critério 16: shutdown() encerra o processo vivo, é idempotente e não lança quando não há processo', async () => {
    const { fakeFs, fakeSpawn, tts } = setup();
    registerVoice(fakeFs, 'pt_BR-faber-medium', FABER_CONFIG);

    await expect(tts.shutdown()).resolves.toBeUndefined();

    await synthesizeAndComplete(
      fakeFs,
      fakeSpawn,
      tts,
      'olá',
      PIPER_VOICE_PREFIX + 'pt_BR-faber-medium',
    );
    const handle = must(fakeSpawn.handles[0]);

    await expect(tts.shutdown()).resolves.toBeUndefined();
    expect(handle.wasKilled()).toBe(true);
    await expect(tts.shutdown()).resolves.toBeUndefined();
  });
});
