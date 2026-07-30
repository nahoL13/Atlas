/**
 * Piper — motor de TTS neural 100% local (ADR-0021, SPEC-0040), item 2.3 do
 * Roadmap. Módulo puro/injetável, sem import de `electron` nem de globais de
 * navegador — testável sem Electron e sem o binário Piper real, no molde de
 * `packages/tools/src/git-port.ts` (subprocesso injetável, argv sempre
 * array, nunca shell).
 *
 * Mantém no máximo **um** processo Piper vivo por vez, iniciado sob demanda
 * para o modelo pedido e reusado nas utterances seguintes do mesmo modelo
 * (Decisão D3) — nenhum recarregamento de modelo por frase. O contrato de
 * invocação (argv, linha de stdin, sinal de conclusão, timeout) é dado
 * **pinado** pela SPEC-0040 (Decisão D4), não descoberto por este código:
 * qualquer divergência do binário real frente a esse contrato é motivo de
 * parar e devolver ao `spec-drafter`, nunca de ajuste ad hoc.
 */

/** Prefixo que desambigua um identificador de modelo Piper de um `voiceURI` de SO (ADR-0021(d)). */
export const PIPER_VOICE_PREFIX = 'piper:';

/** Timeout por utterance (D4): margem ampla frente ao RTF do Piper com o modelo já carregado. */
const UTTERANCE_TIMEOUT_MS = 15_000;

/** Uma voz Piper descoberta em disco — um par completo `<id>.onnx` + `<id>.onnx.json`. */
export interface PiperVoice {
  readonly id: string;
  readonly voiceURI: string;
  readonly name: string;
  readonly language: string;
  readonly sampleRate: number;
}

/** Áudio sintetizado por uma utterance: bytes WAV crus (o header já carrega o sample rate real). */
export interface PiperAudio {
  readonly wav: Uint8Array;
  readonly sampleRate: number;
}

/** Caminhos resolvidos (D10) — binário e diretório de modelos, injetados prontos. */
export interface PiperPaths {
  readonly binary: string;
  readonly modelsDir: string;
}

/**
 * Porta de IO mínima que este módulo precisa — injetável, sem disco real nos
 * testes. `listDir` deve devolver só os nomes das entradas (não caminhos
 * completos); os demais métodos recebem caminho completo.
 */
export interface PiperFsPort {
  listDir(dir: string): Promise<readonly string[]>;
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/** Processo Piper vivo, injetável nos testes (sem subprocesso real). */
export interface PiperProcess {
  writeLine(line: string): void;
  onStdoutLine(cb: (line: string) => void): void;
  onExit(cb: (code: number | null) => void): void;
  kill(): void;
}

/** Sobe um novo processo Piper — sempre argv array, nunca string de shell (D12). */
export type SpawnPiper = (command: string, args: readonly string[]) => PiperProcess;

export type TmpDirProvider = () => string;

/** Gerador de identificador opaco do arquivo temporário (D12) — nunca derivado de entrada do renderer. */
export type RandomId = () => string;

export interface PiperTts {
  listVoices(): Promise<readonly PiperVoice[]>;
  isAvailable(): Promise<boolean>;
  synthesize(text: string, voiceURI: string): Promise<PiperAudio | undefined>;
  cancel(): void;
  shutdown(): Promise<void>;
}

export interface PiperTtsDeps {
  readonly fs: PiperFsPort;
  readonly spawn: SpawnPiper;
  readonly tmpDir: TmpDirProvider;
  readonly randomId: RandomId;
  readonly paths: PiperPaths;
}

const ONNX_SUFFIX = '.onnx';
const CONFIG_SUFFIX = '.onnx.json';

function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** `audio.quality` ⇒ sample rate default quando `audio.sample_rate` está ausente/não-numérico (D13). */
function deriveSampleRateFromQuality(quality: string | undefined): number {
  return quality === 'x_low' || quality === 'low' ? 16000 : 22050;
}

function deriveName(
  id: string,
  dataset: string | undefined,
  language: string,
  quality: string | undefined,
): string {
  if (dataset === undefined) {
    return id;
  }
  const parts = [language, quality].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? `${dataset} (${parts.join(', ')})` : dataset;
}

/**
 * Constrói um `PiperVoice` a partir do esquema real do `.onnx.json` (D13) —
 * os caminhos de chave são dados desta SPEC, nunca um campo `name`/
 * `sampleRate` de nível raiz (que não existe no esquema publicado).
 */
function buildVoice(id: string, config: Record<string, unknown>): PiperVoice {
  const audio = asRecord(config['audio']);
  const language = asRecord(config['language']);
  const espeak = asRecord(config['espeak']);

  const rawSampleRate = audio?.['sample_rate'];
  const quality = asString(audio?.['quality']);
  const sampleRate =
    typeof rawSampleRate === 'number' && Number.isFinite(rawSampleRate)
      ? rawSampleRate
      : deriveSampleRateFromQuality(quality);

  const idPrefix = id.includes('-') ? id.slice(0, id.indexOf('-')) : id;
  const languageValue = asString(language?.['code']) ?? asString(espeak?.['voice']) ?? idPrefix;

  const dataset = asString(config['dataset']);
  const name = deriveName(id, dataset, languageValue, quality);

  return {
    id,
    voiceURI: PIPER_VOICE_PREFIX + id,
    name,
    language: languageValue,
    sampleRate,
  };
}

/**
 * Descobre os pares completos `<id>.onnx` + `<id>.onnx.json` em `modelsDir`
 * e devolve um `PiperVoice` por par — omite o modelo apenas por par
 * incompleto ou JSON inválido/não-objeto (D13), nunca por campo opcional
 * ausente, e nunca lança.
 */
async function discoverVoices(fs: PiperFsPort, modelsDir: string): Promise<readonly PiperVoice[]> {
  let entries: readonly string[];
  try {
    entries = await fs.listDir(modelsDir);
  } catch {
    return [];
  }

  const onnxIds = new Set<string>();
  const configIds = new Set<string>();
  for (const entry of entries) {
    if (entry.endsWith(CONFIG_SUFFIX)) {
      configIds.add(entry.slice(0, -CONFIG_SUFFIX.length));
    } else if (entry.endsWith(ONNX_SUFFIX)) {
      onnxIds.add(entry.slice(0, -ONNX_SUFFIX.length));
    }
  }

  const voices: PiperVoice[] = [];
  for (const id of onnxIds) {
    if (!configIds.has(id)) {
      continue;
    }
    let text: string;
    try {
      text = await fs.readText(joinPath(modelsDir, `${id}${CONFIG_SUFFIX}`));
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const config = asRecord(parsed);
    if (config === undefined) {
      continue;
    }
    voices.push(buildVoice(id, config));
  }
  return voices;
}

/**
 * Default de modelo Piper (Decisão D9): `pt_BR-faber-medium` se instalado,
 * senão o primeiro por ordem de `id` — determinístico mesmo sem `faber`.
 */
export function resolveDefaultPiperVoiceURI(voices: readonly PiperVoice[]): string | undefined {
  if (voices.length === 0) {
    return undefined;
  }
  const preferred = voices.find((voice) => voice.id === 'pt_BR-faber-medium');
  if (preferred !== undefined) {
    return preferred.voiceURI;
  }
  const sorted = [...voices].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted[0]?.voiceURI;
}

interface PendingUtterance {
  readonly outputFile: string;
  readonly sampleRate: number;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly settle: (audio: PiperAudio | undefined) => void;
}

interface LiveProcess {
  readonly process: PiperProcess;
  readonly modelId: string;
}

/**
 * Mantém um processo Piper de longa duração (D3) e aplica o contrato de
 * invocação pinado em D4. Fail-safe/fail-closed em toda a superfície:
 * `synthesize` nunca lança, sempre remove o arquivo temporário, e nunca
 * deixa a promessa pendurada.
 */
export function createPiperTts(deps: PiperTtsDeps): PiperTts {
  const { fs, spawn, tmpDir, randomId, paths } = deps;

  let liveProcess: LiveProcess | undefined;
  let pending: PendingUtterance | undefined;

  /** Encerra o processo vivo, se houver — nunca lança (D4/achado A1). */
  function recycleProcess(): void {
    if (liveProcess === undefined) {
      return;
    }
    const process = liveProcess.process;
    liveProcess = undefined;
    try {
      process.kill();
    } catch {
      // fail-safe: nunca propaga
    }
  }

  /**
   * Resolve a promessa pendente (se houver) com `undefined`, sem tocar no
   * processo — usada internamente por quem já decidiu separadamente se o
   * processo deve ser reciclado.
   */
  function settlePendingUndefined(): void {
    if (pending === undefined) {
      return;
    }
    const current = pending;
    pending = undefined;
    clearTimeout(current.timer);
    current.settle(undefined);
    void fs.remove(current.outputFile).catch(() => {
      // arquivo pode já não existir — ignorado
    });
  }

  /**
   * Cancela a utterance em voo, se houver: resolve `undefined` e recicla o
   * processo (achado A1, extensão de D4/D13 ao cancelamento) — o eco de
   * stdout de uma utterance cancelada nunca deve ser lido como resposta da
   * próxima, então o processo corrente é sempre encerrado junto.
   */
  function cancelPending(): void {
    if (pending === undefined) {
      return;
    }
    settlePendingUndefined();
    recycleProcess();
  }

  function attachProcessHandlers(process: PiperProcess): void {
    process.onStdoutLine(() => {
      void handleStdoutLine(process);
    });
    process.onExit(() => {
      if (liveProcess?.process === process) {
        liveProcess = undefined;
      }
      // Processo morreu com uma utterance em voo: recuperação garantida —
      // resolve undefined agora, sem reciclar de novo (já morto).
      if (pending !== undefined) {
        settlePendingUndefined();
      }
    });
  }

  async function handleStdoutLine(process: PiperProcess): Promise<void> {
    if (pending === undefined || liveProcess?.process !== process) {
      // Linha estranha (sem utterance em voo neste processo) — ignorada.
      return;
    }
    const current = pending;
    pending = undefined;
    clearTimeout(current.timer);

    let bytes: Uint8Array | undefined;
    try {
      const exists = await fs.exists(current.outputFile);
      if (exists) {
        const data = await fs.readBytes(current.outputFile);
        bytes = data.length > 0 ? data : undefined;
      }
    } catch {
      bytes = undefined;
    }
    try {
      await fs.remove(current.outputFile);
    } catch {
      // já ausente/erro de IO — ignorado
    }

    current.settle(
      bytes === undefined ? undefined : { wav: bytes, sampleRate: current.sampleRate },
    );
  }

  async function listVoices(): Promise<readonly PiperVoice[]> {
    return discoverVoices(fs, paths.modelsDir);
  }

  async function isAvailable(): Promise<boolean> {
    try {
      const binaryExists = await fs.exists(paths.binary);
      if (!binaryExists) {
        return false;
      }
      const voices = await discoverVoices(fs, paths.modelsDir);
      return voices.length > 0;
    } catch {
      return false;
    }
  }

  async function synthesize(text: string, voiceURI: string): Promise<PiperAudio | undefined> {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (normalized === '') {
      return undefined;
    }

    let voices: readonly PiperVoice[];
    try {
      voices = await discoverVoices(fs, paths.modelsDir);
    } catch {
      voices = [];
    }
    const voice = voices.find((candidate) => candidate.voiceURI === voiceURI);
    if (voice === undefined) {
      return undefined;
    }

    // Uma nova submissão cancela qualquer utterance pendente e recicla o
    // processo corrente (achado A1) — nunca duas utterances em voo no mesmo
    // processo, e o eco da cancelada nunca vaza para a próxima.
    cancelPending();

    if (liveProcess === undefined || liveProcess.modelId !== voice.id) {
      recycleProcess();
      let process: PiperProcess;
      try {
        process = spawn(paths.binary, [
          '--model',
          joinPath(paths.modelsDir, `${voice.id}${ONNX_SUFFIX}`),
          '--config',
          joinPath(paths.modelsDir, `${voice.id}${CONFIG_SUFFIX}`),
          '--json-input',
        ]);
      } catch {
        return undefined;
      }
      liveProcess = { process, modelId: voice.id };
      attachProcessHandlers(process);
    }

    const outputFile = joinPath(tmpDir(), `atlas-tts-${randomId()}.wav`);
    const line = JSON.stringify({ text: normalized, output_file: outputFile });

    return new Promise<PiperAudio | undefined>((resolve) => {
      const timer = setTimeout(() => {
        // D4: perda de sincronismo de framing ⇒ nunca reusar o processo.
        settlePendingUndefined();
        recycleProcess();
      }, UTTERANCE_TIMEOUT_MS);

      pending = { outputFile, sampleRate: voice.sampleRate, timer, settle: resolve };

      try {
        liveProcess?.process.writeLine(line);
      } catch {
        settlePendingUndefined();
        recycleProcess();
      }
    });
  }

  function cancel(): void {
    cancelPending();
  }

  async function shutdown(): Promise<void> {
    cancelPending();
    recycleProcess();
  }

  return { listVoices, isAvailable, synthesize, cancel, shutdown };
}
