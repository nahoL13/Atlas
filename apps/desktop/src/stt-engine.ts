/**
 * `whisper.cpp` — motor de STT local 100% offline (ADR-0022, SPEC-0046),
 * espelho estrutural de `src/piper-tts.ts` (SPEC-0040/ADR-0021) para o
 * sentido oposto do fluxo de voz. Módulo puro/injetável, sem import de
 * `electron` — testável sem Electron e sem o binário real.
 *
 * Contrato do binário e da fronteira — PINADO como dado desta SPEC (D12), não
 * descoberto por este código. Qualquer divergência do binário real frente ao
 * que segue é motivo de PARAR e devolver ao `spec-drafter`, nunca de ajuste
 * ad hoc (mesma cláusula em vigor para o Piper).
 *
 * Motor: `whisper-cli`, versão pinada v1.7.6 (`whisper-cli.exe` no Windows).
 * Layout: `<sttDir>/whisper-cli` + `<sttDir>/models/ggml-small-q5_1.bin`.
 * Argv (array, nunca shell):
 *   whisper-cli --model <model> --file <tmp>.wav --language pt
 *     --no-timestamps --no-prints --threads 4
 * `--language pt` é fixo — nunca deriva de entrada do renderer.
 * Nenhuma flag `--output-*`: a transcrição é lida de stdout.
 *
 * Fronteira renderer → main: `{ pcm: ArrayBuffer, sampleRate: number }`, dois
 * campos, sempre validados ANTES de qualquer efeito colateral. `sampleRate`
 * deve ser exatamente 16000 (nunca reamostrado); `pcm.byteLength` deve ser >
 * 0, par e ≤ 1 000 000 bytes. `durationMs` é SEMPRE derivado no main
 * (`byteLength / 2 / 16000 × 1000`), nunca recebido do renderer (D18/R4).
 *
 * Orçamento: timeout = clamp(20_000 + 5 × durationMs, 20_000, 180_000);
 * encerramento por SIGTERM e, se ainda vivo após 2 s, SIGKILL.
 *
 * Os dez desfechos exaustivos (D12/R2) e as regras de limpeza (o `.wav`
 * temporário é removido em todo desfecho que chegou a escrevê-lo; falha de
 * `unlink` nunca propaga nem altera o resultado) estão documentados na SPEC
 * (seção "Contrato do binário e da fronteira") — `transcribe()` nunca lança.
 */

/** Nunca reamostra: único `sampleRate` aceito na fronteira (D18). */
const REQUIRED_SAMPLE_RATE = 16000;

/** Teto de bytes do PCM aceito (~31,25 s a 16 kHz mono 16-bit). */
const MAX_PCM_BYTES = 1_000_000;

const MIN_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 180_000;
const KILL_GRACE_MS = 2_000;
const STDERR_TAIL_CHARS = 500;

const ENGINE_VERSION = 'v1.7.6';
const MODEL_FILE = 'ggml-small-q5_1.bin';

export interface SttEngineInfo {
  readonly engineId: 'whisper.cpp';
  readonly version: string;
  readonly modelId: string;
  readonly language: 'pt';
}

export type SttFailureReason =
  | 'invalid-audio'
  | 'audio-too-long'
  | 'io-failed'
  | 'empty-transcript'
  | 'engine-failed'
  | 'engine-unavailable'
  | 'timeout'
  | 'cancelled'
  | 'busy';

export type SttResult =
  | { readonly ok: true; readonly text: string; readonly durationMs: number }
  | { readonly ok: false; readonly reason: SttFailureReason; readonly detail?: string };

/** Payload da fronteira renderer → main (dois campos, D18) — nunca um terceiro campo de duração. */
export interface SttTranscribeInput {
  readonly pcm: ArrayBuffer;
  readonly sampleRate: number;
}

/** Subprocesso `whisper-cli` injetável — sem subprocesso real nos testes. */
export interface SttProcess {
  onStdout(cb: (chunk: string) => void): void;
  onStderr(cb: (chunk: string) => void): void;
  onExit(cb: (code: number | null) => void): void;
  kill(signal: 'SIGTERM' | 'SIGKILL'): void;
}

/** Sobe um novo processo `whisper-cli` — sempre argv array, nunca string de shell. */
export type SpawnStt = (command: string, args: readonly string[]) => SttProcess;

export type SttTmpDirProvider = () => string;

/** Gerador de identificador opaco do `.wav` temporário — nunca derivado de entrada do renderer. */
export type SttRandomId = () => string;

export interface SttEngineDeps {
  readonly spawn: SpawnStt;
  /** Resolve `<sttDir>` (3 níveis, resolvido por `src/main.ts`). */
  readonly resolveDir: () => string;
  readonly tmpDirProvider: SttTmpDirProvider;
  readonly randomId: SttRandomId;
  /** Relógio injetado (molde da SPEC); não participa do cálculo de duração/timeout (D18/D14). */
  readonly now: () => number;
  readonly writeFile: (path: string, data: Uint8Array) => Promise<void>;
  /** Verificação síncrona de presença de arquivo — fail-safe, nunca lança. */
  readonly stat: (path: string) => boolean;
  readonly unlink: (path: string) => Promise<void>;
}

export interface SttEngine {
  isAvailable(): boolean;
  describe(): SttEngineInfo | undefined;
  transcribe(input: SttTranscribeInput): Promise<SttResult>;
  /** Cancela a transcrição em voo, se houver — idempotente, nunca lança. */
  cancel(): void;
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

function binaryName(): string {
  return process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Descarta linhas vazias, junta o restante com um espaço simples, aplica `trim`. */
function normalizeStdout(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(' ')
    .trim();
}

function describeError(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function writeUint32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function writeUint16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/** Cabeçalho RIFF/PCM de 44 bytes: 1 canal, 16 kHz, 16 bits assinado LE (contrato da fronteira). */
function buildWav(pcmBytes: Uint8Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataLength = pcmBytes.byteLength;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  writeAscii(view, 0, 'RIFF');
  writeUint32LE(view, 4, 36 + dataLength);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  writeUint32LE(view, 16, 16); // tamanho do subchunk fmt
  writeUint16LE(view, 20, 1); // formato PCM
  writeUint16LE(view, 22, numChannels);
  writeUint32LE(view, 24, sampleRate);
  writeUint32LE(view, 28, byteRate);
  writeUint16LE(view, 32, blockAlign);
  writeUint16LE(view, 34, bitsPerSample);
  writeAscii(view, 36, 'data');
  writeUint32LE(view, 40, dataLength);

  const wav = new Uint8Array(44 + dataLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcmBytes, 44);
  return wav;
}

export function createSttEngine(deps: SttEngineDeps): SttEngine {
  const { spawn, resolveDir, tmpDirProvider, randomId, writeFile, stat, unlink } = deps;

  // Transcrição em voo: só uma por vez (nunca enfileirada — nova submissão
  // resolve `busy` de imediato, sem efeito colateral algum).
  let activeCancel: (() => void) | undefined;

  function isAvailable(): boolean {
    try {
      const dir = resolveDir();
      const binaryPath = joinPath(dir, binaryName());
      const modelPath = joinPath(joinPath(dir, 'models'), MODEL_FILE);
      return stat(binaryPath) === true && stat(modelPath) === true;
    } catch {
      return false;
    }
  }

  function describe(): SttEngineInfo | undefined {
    return {
      engineId: 'whisper.cpp',
      version: ENGINE_VERSION,
      modelId: MODEL_FILE,
      language: 'pt',
    };
  }

  function cancel(): void {
    activeCancel?.();
  }

  async function transcribe(input: SttTranscribeInput): Promise<SttResult> {
    if (activeCancel !== undefined) {
      return { ok: false, reason: 'busy' };
    }

    const { pcm, sampleRate } = input;
    const byteLength = pcm.byteLength;

    if (sampleRate !== REQUIRED_SAMPLE_RATE || byteLength === 0 || byteLength % 2 !== 0) {
      return { ok: false, reason: 'invalid-audio' };
    }
    if (byteLength > MAX_PCM_BYTES) {
      return { ok: false, reason: 'audio-too-long' };
    }

    // Derivada — nunca recebida do renderer (D18/R4).
    const durationMs = (byteLength / 2 / REQUIRED_SAMPLE_RATE) * 1000;
    const timeoutMs = clamp(20_000 + 5 * durationMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);

    const tmpPath = joinPath(tmpDirProvider(), `atlas-stt-${randomId()}.wav`);
    const wavBytes = buildWav(new Uint8Array(pcm), sampleRate);

    return new Promise<SttResult>((resolve) => {
      let settled = false;
      let cancelledBeforeSpawn = false;
      let child: SttProcess | undefined;
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      let killTimer: ReturnType<typeof setTimeout> | undefined;

      function clearKillTimer(): void {
        if (killTimer !== undefined) {
          clearTimeout(killTimer);
          killTimer = undefined;
        }
      }

      /**
       * O `killTimer` (SIGTERM → 2s → SIGKILL) escala o encerramento do
       * PROCESSO — independente de o desfecho do `transcribe()` (a promessa)
       * já ter sido decidido. Por isso `finish()` (abaixo) nunca cancela este
       * timer: ele só é desarmado quando o processo de fato sai
       * (`child.onExit`) ou ao final da promessa via `clearKillTimer()`
       * quando um `onExit` nunca chega a acontecer nos fakes de teste.
       */
      function terminateProcess(): void {
        if (child === undefined) {
          return;
        }
        try {
          child.kill('SIGTERM');
        } catch {
          // fail-safe: nunca propaga
        }
        killTimer = setTimeout(() => {
          killTimer = undefined;
          try {
            child?.kill('SIGKILL');
          } catch {
            // fail-safe: nunca propaga
          }
        }, KILL_GRACE_MS);
      }

      /** `cleanup` remove o `.wav` sempre que ele pode ter chegado a existir (todo desfecho, exceto `io-failed`, D18/R2). */
      function finish(result: SttResult, cleanup: boolean): void {
        if (settled) {
          return;
        }
        settled = true;
        activeCancel = undefined;
        if (timeoutTimer !== undefined) {
          clearTimeout(timeoutTimer);
        }
        if (cleanup) {
          void unlink(tmpPath).catch(() => {
            // A falha de limpeza nunca propaga e nunca altera o resultado já decidido (D18/R2).
          });
        }
        resolve(result);
      }

      activeCancel = () => {
        if (settled) {
          return;
        }
        cancelledBeforeSpawn = true;
        terminateProcess();
        finish({ ok: false, reason: 'cancelled' }, true);
      };

      writeFile(tmpPath, wavBytes)
        .then(() => {
          if (settled) {
            return;
          }
          if (cancelledBeforeSpawn) {
            // Cancelado enquanto a escrita ainda estava em voo: nenhum
            // processo é iniciado; melhor esforço para remover o arquivo que
            // pode ter chegado a ser escrito nesta corrida.
            void unlink(tmpPath).catch(() => {});
            return;
          }

          const dir = resolveDir();
          const args = [
            '--model',
            joinPath(joinPath(dir, 'models'), MODEL_FILE),
            '--file',
            tmpPath,
            '--language',
            'pt',
            '--no-timestamps',
            '--no-prints',
            '--threads',
            '4',
          ];

          try {
            child = spawn(joinPath(dir, binaryName()), args);
          } catch {
            finish({ ok: false, reason: 'engine-unavailable' }, true);
            return;
          }

          let stdoutBuf = '';
          let stderrBuf = '';
          child.onStdout((chunk) => {
            stdoutBuf += chunk;
          });
          child.onStderr((chunk) => {
            stderrBuf += chunk;
          });
          child.onExit((code) => {
            // O processo saiu (espontaneamente ou em resposta ao SIGTERM
            // acima) — nenhum SIGKILL de escalação é necessário.
            clearKillTimer();
            if (settled) {
              return;
            }
            if (code === 0) {
              const text = normalizeStdout(stdoutBuf);
              if (text === '') {
                finish({ ok: false, reason: 'empty-transcript' }, true);
              } else {
                finish({ ok: true, text, durationMs }, true);
              }
            } else {
              finish(
                { ok: false, reason: 'engine-failed', detail: stderrBuf.slice(-STDERR_TAIL_CHARS) },
                true,
              );
            }
          });

          timeoutTimer = setTimeout(() => {
            terminateProcess();
            finish({ ok: false, reason: 'timeout' }, true);
          }, timeoutMs);
        })
        .catch((error: unknown) => {
          // Nada foi escrito com sucesso: nenhum processo é iniciado, nada a limpar.
          const detail = describeError(error);
          finish(
            detail === undefined
              ? { ok: false, reason: 'io-failed' }
              : { ok: false, reason: 'io-failed', detail },
            false,
          );
        });
    });
  }

  return { isAvailable, describe, transcribe, cancel };
}
