import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SttEngineDeps, SttProcess, SttResult } from '../src/stt-engine.js';
import { createSttEngine } from '../src/stt-engine.js';

const STT_DIR = '/stt';
const BINARY_PATH = '/stt/whisper-cli';
const MODEL_PATH = '/stt/models/ggml-small-q5_1.bin';

interface FakeProcessHandle {
  readonly process: SttProcess;
  readonly killSignals: Array<'SIGTERM' | 'SIGKILL'>;
  emitStdout(chunk: string): void;
  emitStderr(chunk: string): void;
  emitExit(code: number | null): void;
}

function createFakeProcess(): FakeProcessHandle {
  const stdoutListeners: Array<(chunk: string) => void> = [];
  const stderrListeners: Array<(chunk: string) => void> = [];
  const exitListeners: Array<(code: number | null) => void> = [];
  const killSignals: Array<'SIGTERM' | 'SIGKILL'> = [];

  const process: SttProcess = {
    onStdout: (cb) => stdoutListeners.push(cb),
    onStderr: (cb) => stderrListeners.push(cb),
    onExit: (cb) => exitListeners.push(cb),
    kill: (signal) => {
      killSignals.push(signal);
    },
  };

  return {
    process,
    killSignals,
    emitStdout: (chunk) => {
      for (const cb of stdoutListeners) cb(chunk);
    },
    emitStderr: (chunk) => {
      for (const cb of stderrListeners) cb(chunk);
    },
    emitExit: (code) => {
      for (const cb of exitListeners) cb(code);
    },
  };
}

interface FakeSpawn {
  readonly spawn: (command: string, args: readonly string[]) => SttProcess;
  readonly calls: Array<{ command: string; args: readonly string[] }>;
  readonly handles: FakeProcessHandle[];
  shouldThrow: boolean;
}

function createFakeSpawn(): FakeSpawn {
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  const handles: FakeProcessHandle[] = [];
  const fake: FakeSpawn = {
    calls,
    handles,
    shouldThrow: false,
    spawn: (command, args) => {
      calls.push({ command, args });
      if (fake.shouldThrow) {
        throw new Error('ENOENT');
      }
      const handle = createFakeProcess();
      handles.push(handle);
      return handle.process;
    },
  };
  return fake;
}

interface FakeFs {
  readonly writeFile: SttEngineDeps['writeFile'];
  readonly unlink: SttEngineDeps['unlink'];
  readonly stat: SttEngineDeps['stat'];
  readonly writtenFiles: Map<string, Uint8Array>;
  /** Log imutável de todo caminho já escrito com sucesso — sobrevive ao `unlink` (que apaga de `writtenFiles`). */
  readonly writtenPaths: string[];
  readonly removedPaths: string[];
  writeShouldFail: Error | undefined;
  unlinkShouldFail: Error | undefined;
  readonly existingPaths: Set<string>;
}

function createFakeFs(): FakeFs {
  const writtenFiles = new Map<string, Uint8Array>();
  const writtenPaths: string[] = [];
  const removedPaths: string[] = [];
  const existingPaths = new Set<string>();
  const fake: FakeFs = {
    writtenFiles,
    writtenPaths,
    removedPaths,
    existingPaths,
    writeShouldFail: undefined,
    unlinkShouldFail: undefined,
    writeFile: async (path, data) => {
      if (fake.writeShouldFail !== undefined) {
        throw fake.writeShouldFail;
      }
      writtenFiles.set(path, data);
      writtenPaths.push(path);
    },
    unlink: async (path) => {
      removedPaths.push(path);
      writtenFiles.delete(path);
      if (fake.unlinkShouldFail !== undefined) {
        throw fake.unlinkShouldFail;
      }
    },
    stat: (path) => existingPaths.has(path),
  };
  return fake;
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

function setup() {
  const fakeFs = createFakeFs();
  const fakeSpawn = createFakeSpawn();
  let idCounter = 0;
  const engine = createSttEngine({
    spawn: fakeSpawn.spawn,
    resolveDir: () => STT_DIR,
    tmpDirProvider: () => '/tmp',
    randomId: () => `id${(idCounter += 1)}`,
    now: () => 0,
    writeFile: fakeFs.writeFile,
    stat: fakeFs.stat,
    unlink: fakeFs.unlink,
  });
  return { fakeFs, fakeSpawn, engine };
}

function pcmBuffer(sampleCount: number): ArrayBuffer {
  const buffer = new ArrayBuffer(sampleCount * 2);
  const view = new Int16Array(buffer);
  for (let i = 0; i < sampleCount; i += 1) {
    view[i] = i % 100;
  }
  return buffer;
}

const PINNED_ARGV = [
  '--model',
  MODEL_PATH,
  '--file',
  '/tmp/atlas-stt-id1.wav',
  '--language',
  'pt',
  '--no-timestamps',
  '--no-prints',
  '--threads',
  '4',
];

async function transcribeAndComplete(
  fakeSpawn: FakeSpawn,
  promise: Promise<SttResult>,
  options: { code?: number; stdout?: string } = {},
): Promise<SttResult> {
  await flushMicrotasks();
  const handle = fakeSpawn.handles[fakeSpawn.handles.length - 1];
  if (handle === undefined) {
    throw new Error('nenhum processo spawnado');
  }
  if (options.stdout !== undefined) {
    handle.emitStdout(options.stdout);
  }
  handle.emitExit(options.code ?? 0);
  return promise;
}

describe('stt-engine: contrato reproduzido no topo do módulo (CA16)', () => {
  it('menciona a SPEC-0046 e a cláusula de parada', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'stt-engine.ts'), 'utf8');
    expect(source).toContain('SPEC-0046');
    expect(source).toMatch(/PARAR/);
    expect(source).not.toContain("from 'electron'");
    expect(source).not.toContain("require('electron')");
  });
});

describe('stt-engine: validação da fronteira (CA5)', () => {
  it('sampleRate diferente de 16000 ⇒ invalid-audio, nada escrito, spawn não chamado', async () => {
    const { fakeFs, fakeSpawn, engine } = setup();
    const result = await engine.transcribe({ pcm: pcmBuffer(10), sampleRate: 8000 });
    expect(result).toEqual({ ok: false, reason: 'invalid-audio' });
    expect(fakeFs.writtenFiles.size).toBe(0);
    expect(fakeSpawn.calls).toHaveLength(0);
  });

  it('byteLength zero ⇒ invalid-audio, nada escrito, spawn não chamado', async () => {
    const { fakeFs, fakeSpawn, engine } = setup();
    const result = await engine.transcribe({ pcm: new ArrayBuffer(0), sampleRate: 16000 });
    expect(result).toEqual({ ok: false, reason: 'invalid-audio' });
    expect(fakeFs.writtenFiles.size).toBe(0);
    expect(fakeSpawn.calls).toHaveLength(0);
  });

  it('byteLength ímpar ⇒ invalid-audio, nada escrito, spawn não chamado', async () => {
    const { fakeFs, fakeSpawn, engine } = setup();
    const result = await engine.transcribe({ pcm: new ArrayBuffer(3), sampleRate: 16000 });
    expect(result).toEqual({ ok: false, reason: 'invalid-audio' });
    expect(fakeFs.writtenFiles.size).toBe(0);
    expect(fakeSpawn.calls).toHaveLength(0);
  });

  it('byteLength acima de 1_000_000 ⇒ audio-too-long, nada escrito, spawn não chamado', async () => {
    const { fakeFs, fakeSpawn, engine } = setup();
    const result = await engine.transcribe({ pcm: new ArrayBuffer(1_000_002), sampleRate: 16000 });
    expect(result).toEqual({ ok: false, reason: 'audio-too-long' });
    expect(fakeFs.writtenFiles.size).toBe(0);
    expect(fakeSpawn.calls).toHaveLength(0);
  });

  it('payload aceito tem exatamente dois campos — um terceiro campo (duração) é ignorado', async () => {
    const { fakeFs, fakeSpawn, engine } = setup();
    fakeFs.existingPaths.add(BINARY_PATH);
    fakeFs.existingPaths.add(MODEL_PATH);
    const promise = engine.transcribe({
      pcm: pcmBuffer(16000),
      sampleRate: 16000,
      // @ts-expect-error -- tentativa deliberada de injetar um terceiro campo
      durationMs: 999_999,
    });
    const result = await transcribeAndComplete(fakeSpawn, promise, { stdout: 'olá mundo' });
    expect(result).toEqual({ ok: true, text: 'olá mundo', durationMs: 1000 });
  });
});

describe('stt-engine: duração derivada (CA6)', () => {
  it('durationMs = (byteLength / 2 / 16000) × 1000, e é esse valor que alimenta o timeout', async () => {
    vi.useFakeTimers();
    try {
      const { engine, fakeSpawn } = setup();
      const promise = engine.transcribe({ pcm: pcmBuffer(16000), sampleRate: 16000 });
      await flushMicrotasks();
      const result = await transcribeAndComplete(fakeSpawn, promise, { stdout: 'texto' });
      expect(result).toEqual({ ok: true, text: 'texto', durationMs: 1000 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('stt-engine: isAvailable/describe (CA13/CA14)', () => {
  it('isAvailable() false quando o diretório de recursos não existe (nenhum arquivo presente)', () => {
    const { engine } = setup();
    expect(engine.isAvailable()).toBe(false);
  });

  it('isAvailable() false quando o binário está ausente (só o modelo presente)', () => {
    const { engine, fakeFs } = setup();
    fakeFs.existingPaths.add(MODEL_PATH);
    expect(engine.isAvailable()).toBe(false);
  });

  it('isAvailable() false quando o modelo está ausente (só o binário presente)', () => {
    const { engine, fakeFs } = setup();
    fakeFs.existingPaths.add(BINARY_PATH);
    expect(engine.isAvailable()).toBe(false);
  });

  it('isAvailable() true quando binário e modelo estão presentes', () => {
    const { engine, fakeFs } = setup();
    fakeFs.existingPaths.add(BINARY_PATH);
    fakeFs.existingPaths.add(MODEL_PATH);
    expect(engine.isAvailable()).toBe(true);
  });

  it('describe() devolve motor, versão pinada, modelo e idioma fixado', () => {
    const { engine } = setup();
    expect(engine.describe()).toEqual({
      engineId: 'whisper.cpp',
      version: 'v1.7.6',
      modelId: 'ggml-small-q5_1.bin',
      language: 'pt',
    });
  });
});

describe('stt-engine: cabeçalho WAV (CA9)', () => {
  it('RIFF/PCM, 1 canal, 16 kHz, 16 bits — campos byte a byte', async () => {
    const { engine, fakeFs, fakeSpawn } = setup();
    const promise = engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    // Verifica o conteúdo escrito ANTES da limpeza pós-desfecho (que remove
    // a entrada do fake fs) — basta drenar as microtasks até o spawn.
    await flushMicrotasks();

    const written = fakeFs.writtenFiles.get('/tmp/atlas-stt-id1.wav');
    expect(written).toBeDefined();
    const view = new DataView(written!.buffer, written!.byteOffset, written!.byteLength);

    const readAscii = (offset: number, len: number): string =>
      Array.from({ length: len }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join(
        '',
      );

    expect(readAscii(0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 8); // 4 amostras * 2 bytes = 8
    expect(readAscii(8, 4)).toBe('WAVE');
    expect(readAscii(12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // 1 canal
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(16000 * 1 * 2); // byteRate
    expect(view.getUint16(32, true)).toBe(2); // blockAlign
    expect(view.getUint16(34, true)).toBe(16); // bitsPerSample
    expect(readAscii(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(8);
    expect(written!.byteLength).toBe(44 + 8);

    fakeSpawn.handles[0]!.emitExit(0);
    await promise;
  });
});

describe('stt-engine: argv idêntico ao pinado (CA3/CA4)', () => {
  it('argv item a item, e --language nunca deriva de flags extras no payload', async () => {
    const { engine, fakeSpawn } = setup();
    const promise = engine.transcribe({
      pcm: pcmBuffer(4),
      sampleRate: 16000,
      // @ts-expect-error -- tentativa deliberada de injetar idioma/flags extras
      language: 'en',
      extraArgs: ['--rm-rf'],
    });
    await transcribeAndComplete(fakeSpawn, promise, { stdout: 'x' });

    expect(fakeSpawn.calls).toHaveLength(1);
    expect(fakeSpawn.calls[0]?.command).toBe(BINARY_PATH);
    expect(fakeSpawn.calls[0]?.args).toEqual(PINNED_ARGV);
  });

  it('nenhuma ocorrência de exec( com string concatenada no arquivo', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'stt-engine.ts'), 'utf8');
    expect(source).not.toMatch(/\bexec\(/);
  });
});

describe('stt-engine: os dez desfechos exaustivos (CA10)', () => {
  it('exit 0 e transcrição não vazia ⇒ { ok: true, text, durationMs }', async () => {
    const { engine, fakeSpawn } = setup();
    const promise = engine.transcribe({ pcm: pcmBuffer(16000), sampleRate: 16000 });
    const result = await transcribeAndComplete(fakeSpawn, promise, {
      code: 0,
      stdout: '  linha um  \n\n  linha dois\n',
    });
    expect(result).toEqual({ ok: true, text: 'linha um linha dois', durationMs: 1000 });
  });

  it('exit 0 e stdout vazio após normalização ⇒ empty-transcript', async () => {
    const { engine, fakeSpawn } = setup();
    const promise = engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    const result = await transcribeAndComplete(fakeSpawn, promise, { code: 0, stdout: '\n \n' });
    expect(result).toEqual({ ok: false, reason: 'empty-transcript' });
  });

  it('exit code ≠ 0 ⇒ engine-failed com cauda de stderr truncada em 500 caracteres', async () => {
    const { engine, fakeSpawn } = setup();
    const promise = engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    await flushMicrotasks();
    const handle = fakeSpawn.handles[fakeSpawn.handles.length - 1]!;
    const longStderr = 'e'.repeat(600);
    handle.emitStderr(longStderr);
    handle.emitExit(1);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('engine-failed');
      expect(result.detail).toBe(longStderr.slice(-500));
      expect(result.detail?.length).toBe(500);
    }
  });

  it('falha ao iniciar o processo (spawn lança) ⇒ engine-unavailable', async () => {
    const { engine, fakeSpawn } = setup();
    fakeSpawn.shouldThrow = true;
    const result = await engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    expect(result).toEqual({ ok: false, reason: 'engine-unavailable' });
  });

  it('sampleRate ≠ 16000 ⇒ invalid-audio', async () => {
    const { engine } = setup();
    const result = await engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 44100 });
    expect(result).toEqual({ ok: false, reason: 'invalid-audio' });
  });

  it('byteLength > 1_000_000 ⇒ audio-too-long', async () => {
    const { engine } = setup();
    const result = await engine.transcribe({ pcm: new ArrayBuffer(1_000_100), sampleRate: 16000 });
    expect(result).toEqual({ ok: false, reason: 'audio-too-long' });
  });

  it('falha ao escrever o .wav temporário ⇒ io-failed, nenhum processo iniciado', async () => {
    const { engine, fakeFs, fakeSpawn } = setup();
    fakeFs.writeShouldFail = new Error('disco cheio');
    const result = await engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    expect(result).toEqual({ ok: false, reason: 'io-failed', detail: 'disco cheio' });
    expect(fakeSpawn.calls).toHaveLength(0);
  });

  it('timeout conforme o orçamento ⇒ timeout, com SIGTERM → SIGKILL', async () => {
    vi.useFakeTimers();
    try {
      const { engine, fakeSpawn } = setup();
      const promise = engine.transcribe({ pcm: pcmBuffer(16000), sampleRate: 16000 }); // 1s de áudio ⇒ timeout 25s
      await flushMicrotasks();
      const handle = fakeSpawn.handles[0]!;

      await vi.advanceTimersByTimeAsync(25_000);
      expect(handle.killSignals).toContain('SIGTERM');
      await vi.advanceTimersByTimeAsync(2_000);
      expect(handle.killSignals).toContain('SIGKILL');

      const result = await promise;
      expect(result).toEqual({ ok: false, reason: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel() durante a transcrição ⇒ cancelled, com SIGTERM emitido', async () => {
    vi.useFakeTimers();
    try {
      const { engine, fakeSpawn } = setup();
      const promise = engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
      await flushMicrotasks();
      const handle = fakeSpawn.handles[0]!;

      engine.cancel();
      const result = await promise;
      expect(result).toEqual({ ok: false, reason: 'cancelled' });
      expect(handle.killSignals).toContain('SIGTERM');
    } finally {
      vi.useRealTimers();
    }
  });

  it('submissão com outra transcrição em voo ⇒ busy, recusada, nunca enfileirada', async () => {
    const { engine, fakeSpawn } = setup();
    const first = engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    await flushMicrotasks();
    const second = await engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    expect(second).toEqual({ ok: false, reason: 'busy' });
    expect(fakeSpawn.calls).toHaveLength(1);

    await transcribeAndComplete(fakeSpawn, first, { stdout: 'ok' });
  });

  it('cancel() sem transcrição em voo é idempotente e não lança', () => {
    const { engine } = setup();
    expect(() => engine.cancel()).not.toThrow();
  });
});

describe('stt-engine: limpeza do temporário (CA7/CA8)', () => {
  it('.wav removido em todos os desfechos que chegaram a escrevê-lo', async () => {
    const { engine, fakeFs, fakeSpawn } = setup();
    const promise = engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    await transcribeAndComplete(fakeSpawn, promise, { stdout: 'x' });
    expect(fakeFs.removedPaths).toContain('/tmp/atlas-stt-id1.wav');
  });

  it('nome derivado só de tmpDirProvider() + randomId()', async () => {
    const { engine, fakeFs, fakeSpawn } = setup();
    const promise = engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    await transcribeAndComplete(fakeSpawn, promise, { stdout: 'x' });
    expect(fakeFs.writtenPaths).toEqual(['/tmp/atlas-stt-id1.wav']);
  });

  it('unlink falhando após um { ok: true } não propaga, não lança, e não altera o resultado', async () => {
    const { engine, fakeFs, fakeSpawn } = setup();
    fakeFs.unlinkShouldFail = new Error('ENOENT ao remover');
    const promise = engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    const result = await transcribeAndComplete(fakeSpawn, promise, { stdout: 'ok' });
    expect(result).toEqual({ ok: true, text: 'ok', durationMs: 0.25 });
  });

  it('io-failed não tenta remover nada (nada foi escrito)', async () => {
    const { engine, fakeFs } = setup();
    fakeFs.writeShouldFail = new Error('sem permissão');
    await engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    expect(fakeFs.removedPaths).toEqual([]);
  });

  it('invalid-audio/audio-too-long não escrevem nem removem nada', async () => {
    const { engine, fakeFs } = setup();
    await engine.transcribe({ pcm: new ArrayBuffer(0), sampleRate: 16000 });
    await engine.transcribe({ pcm: new ArrayBuffer(1_000_002), sampleRate: 16000 });
    expect(fakeFs.writtenFiles.size).toBe(0);
    expect(fakeFs.removedPaths).toEqual([]);
  });
});

describe('stt-engine: orçamento de timeout nos três regimes (CA11)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('piso: áudio desprezível ⇒ timeout no piso de 20_000ms (clamp)', async () => {
    const { engine, fakeSpawn } = setup();
    // 2 amostras ⇒ durationMs ≈ 0.125, timeoutMs ≈ 20_000.625 — o piso domina.
    const promise = engine.transcribe({ pcm: pcmBuffer(2), sampleRate: 16000 });
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(19_999);
    expect(fakeSpawn.handles[0]!.killSignals).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(fakeSpawn.handles[0]!.killSignals).toContain('SIGTERM');
    await promise;
  });

  it('faixa proporcional: 4s de áudio ⇒ timeout de 40_000ms (20_000 + 5×4000)', async () => {
    const { engine, fakeSpawn } = setup();
    const promise = engine.transcribe({ pcm: pcmBuffer(16000 * 4), sampleRate: 16000 });
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(39_999);
    expect(fakeSpawn.handles[0]!.killSignals).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(fakeSpawn.handles[0]!.killSignals).toContain('SIGTERM');
    await promise;
  });

  it('teto: 30s de áudio (o máximo de gravação) ⇒ timeout de 170_000ms, nunca acima de 180_000', async () => {
    const { engine, fakeSpawn } = setup();
    const promise = engine.transcribe({ pcm: pcmBuffer(16000 * 30), sampleRate: 16000 });
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(169_999);
    expect(fakeSpawn.handles[0]!.killSignals).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(fakeSpawn.handles[0]!.killSignals).toContain('SIGTERM');
    await promise;
  });
});

describe('stt-engine: normalização de stdout (CA12)', () => {
  it('descarta linhas vazias, junta por espaço simples, aplica trim', async () => {
    const { engine, fakeSpawn } = setup();
    const promise = engine.transcribe({ pcm: pcmBuffer(4), sampleRate: 16000 });
    const result = await transcribeAndComplete(fakeSpawn, promise, {
      stdout: '\n  primeira parte  \n\n   \n segunda parte\n',
    });
    expect(result).toEqual({ ok: true, text: 'primeira parte segunda parte', durationMs: 0.25 });
  });
});

describe('stt-engine: gate mecânico de ausência de rede (CA15)', () => {
  it('nenhuma referência a fetch/XMLHttpRequest/WebSocket/EventSource/http/https/net', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'stt-engine.ts'), 'utf8');
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
    expect(source).not.toMatch(/\bWebSocket\b/);
    expect(source).not.toMatch(/\bEventSource\b/);
    expect(source).not.toMatch(/require\(\s*['"]https?['"]\s*\)/);
    expect(source).not.toMatch(/from\s+['"]https?['"]/);
    expect(source).not.toMatch(/require\(\s*['"]net['"]\s*\)/);
    expect(source).not.toMatch(/from\s+['"]net['"]/);
  });
});
