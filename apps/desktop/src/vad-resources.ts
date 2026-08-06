/**
 * Recursos do detector de voz (VAD) — Silero v5 sobre `onnxruntime-web`
 * v1.20.1, wasm-only (SPEC-0052, ADR-0023(c)/(d)). Módulo do main process,
 * sem `import 'electron'` — todo IO é injetado, testável sem disco real.
 *
 * Contrato pinado como dado desta SPEC (modelo, versão do runtime): divergir
 * na prática é mudança de decisão arquitetural — pare e devolva ao
 * `spec-drafter`, nunca ajuste ad hoc.
 *
 * Layout do dist (NÃO é decisão arquitetural — SPEC-0052, seção "Layout do
 * dist"): três artefatos, irmãos do documento do renderer, em
 * `apps/desktop/src/renderer/vendor/vad/`, não versionados no git:
 *   - `ort.min.js`       — runtime `onnxruntime-web`, referenciado por UM
 *                          `<script>` estático em `index.html` (nunca lido
 *                          por este módulo — o script é servido por URL
 *                          relativa ao documento, ADR-0019).
 *   - `ort-wasm.wasm`    — binário WASM do runtime, entregue ao renderer via
 *                          `ArrayBuffer` por IPC (`load()`).
 *   - `silero_vad.onnx`  — modelo Silero VAD v5, entregue ao renderer via
 *                          `ArrayBuffer` por IPC (`load()`).
 * Nomes e quantidade de arquivos são derivados do pacote pinado pelo
 * `spec-implementer` (SPEC-0052, l. 154) — mudam entre builds do mesmo
 * release sem que nada arquitetural mude.
 */

const RUNTIME_SCRIPT_FILE = 'ort.min.js';
const RUNTIME_WASM_FILE = 'ort-wasm.wasm';
const MODEL_FILE = 'silero_vad.onnx';

/** Artefatos consultados por `isAvailable()` — o `<script>` também precisa existir em disco. */
const REQUIRED_FILES: readonly { readonly file: string; readonly reason: string }[] = [
  { file: RUNTIME_SCRIPT_FILE, reason: 'runtime-script-missing' },
  { file: RUNTIME_WASM_FILE, reason: 'runtime-wasm-missing' },
  { file: MODEL_FILE, reason: 'model-missing' },
];

export interface VadResourcesInfo {
  readonly modelId: 'silero-vad-v5';
  readonly runtime: 'onnxruntime-web@1.20.1';
}

export type VadLoad =
  | { readonly ok: true; readonly wasm: ArrayBuffer; readonly model: ArrayBuffer }
  | { readonly ok: false; readonly reason: string };

export interface VadResourcesDeps {
  readonly resolveDir: () => string;
  readonly readFile: (path: string) => Promise<ArrayBuffer>;
  /** Verificação síncrona de presença de arquivo — fail-safe, nunca lança. */
  readonly stat: (path: string) => boolean;
}

export interface VadResources {
  isAvailable(): boolean;
  describe(): VadResourcesInfo;
  load(): Promise<VadLoad>;
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

function describeError(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function createVadResources(deps: VadResourcesDeps): VadResources {
  const { resolveDir, readFile, stat } = deps;

  function missingArtifactReason(): string | undefined {
    try {
      const dir = resolveDir();
      for (const artifact of REQUIRED_FILES) {
        if (stat(joinPath(dir, artifact.file)) !== true) {
          return artifact.reason;
        }
      }
      return undefined;
    } catch {
      return 'resources-dir-unavailable';
    }
  }

  function isAvailable(): boolean {
    return missingArtifactReason() === undefined;
  }

  function describe(): VadResourcesInfo {
    return { modelId: 'silero-vad-v5', runtime: 'onnxruntime-web@1.20.1' };
  }

  async function load(): Promise<VadLoad> {
    const reason = missingArtifactReason();
    if (reason !== undefined) {
      return { ok: false, reason };
    }
    try {
      const dir = resolveDir();
      const [wasm, model] = await Promise.all([
        readFile(joinPath(dir, RUNTIME_WASM_FILE)),
        readFile(joinPath(dir, MODEL_FILE)),
      ]);
      return { ok: true, wasm, model };
    } catch (error) {
      const detail = describeError(error);
      return { ok: false, reason: detail ?? 'io-failed' };
    }
  }

  return { isAvailable, describe, load };
}
