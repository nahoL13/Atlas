/**
 * Leitura de métricas de recurso do host (CPU/RAM/GPU/rede) — SPEC-0054,
 * consumindo o ADR-0024. Espelho estrutural de `stt-engine.ts`/
 * `vad-resources.ts`/`piper-tts.ts`: módulo do main process, mas **não
 * importa `electron` nem `systeminformation`** — recebe a biblioteca por
 * porta injetável (`SystemInformationPort`). O único ponto do repositório
 * que importa `systeminformation` é `apps/desktop/src/main.ts`.
 *
 * Sem estado entre leituras, sem cache, sem timer, sem processo residente,
 * sem histórico, sem persistência, sem chamada de rede — `read()` dispara as
 * quatro leituras em paralelo e nunca lança: cada métrica é resolvida
 * isoladamente, com um orçamento de tempo próprio (`timeoutMs`, default
 * 2500ms).
 */

export interface SystemInformationPort {
  currentLoad(): Promise<unknown>;
  mem(): Promise<unknown>;
  graphics(): Promise<unknown>;
  networkStats(): Promise<unknown>;
}

export type MetricUnavailableReason = 'unsupported' | 'read-failed' | 'timeout';

export type MetricSample<T> =
  | { readonly available: true; readonly value: T }
  | { readonly available: false; readonly reason: MetricUnavailableReason };

export interface CpuMetric {
  readonly loadPercent: number;
}

export interface MemoryMetric {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly usedPercent: number;
}

export interface GpuMetric {
  readonly loadPercent: number;
}

export interface NetworkMetric {
  readonly rxBytesPerSecond: number;
  readonly txBytesPerSecond: number;
}

export interface SystemMetricsSnapshot {
  readonly cpu: MetricSample<CpuMetric>;
  readonly memory: MetricSample<MemoryMetric>;
  readonly gpu: MetricSample<GpuMetric>;
  readonly network: MetricSample<NetworkMetric>;
}

export interface SystemMetrics {
  read(): Promise<SystemMetricsSnapshot>;
}

const DEFAULT_TIMEOUT_MS = 2500;

/** Limita `value` ao intervalo `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Arredonda `value` para `decimals` casas decimais. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Corre `read` com um orçamento de tempo — estouro vira `'timeout'`. */
async function withTimeout<T>(
  read: () => Promise<T>,
  timeoutMs: number,
  setTimer: typeof globalThis.setTimeout,
  clearTimer: typeof globalThis.clearTimeout,
): Promise<{ ok: true; value: T } | { ok: false; reason: 'timeout' }> {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeout = new Promise<{ ok: false; reason: 'timeout' }>((resolve) => {
    timer = setTimer(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs);
  });
  try {
    const outcome = await Promise.race([
      read().then((value) => ({ ok: true as const, value })),
      timeout,
    ]);
    return outcome;
  } finally {
    if (timer !== undefined) {
      clearTimer(timer);
    }
  }
}

/** Executa uma leitura isolada, nunca lança: sucesso normalizado, timeout, ou `'read-failed'`. */
async function readMetric<T>(
  read: () => Promise<unknown>,
  timeoutMs: number,
  setTimer: typeof globalThis.setTimeout,
  clearTimer: typeof globalThis.clearTimeout,
  normalize: (raw: unknown) => MetricSample<T>,
): Promise<MetricSample<T>> {
  let outcome: { ok: true; value: unknown } | { ok: false; reason: 'timeout' };
  try {
    outcome = await withTimeout(read, timeoutMs, setTimer, clearTimer);
  } catch {
    return { available: false, reason: 'read-failed' };
  }
  if (!outcome.ok) {
    return { available: false, reason: 'timeout' };
  }
  try {
    return normalize(outcome.value);
  } catch {
    return { available: false, reason: 'read-failed' };
  }
}

function normalizeCpu(raw: unknown): MetricSample<CpuMetric> {
  const record = raw as { currentLoad?: unknown } | null | undefined;
  const currentLoad = record?.currentLoad;
  // Regra geral do Escopo 4: "não finito, ou negativo ⇒ unsupported" — um
  // valor negativo é defeito de sensor, não um percentual válido fora de
  // faixa. O `clamp` abaixo só cobre o teto (>100 por artefato de leitura).
  if (!isFiniteNumber(currentLoad) || currentLoad < 0) {
    return { available: false, reason: 'unsupported' };
  }
  return { available: true, value: { loadPercent: roundTo(clamp(currentLoad, 0, 100), 1) } };
}

function normalizeMemory(raw: unknown): MetricSample<MemoryMetric> {
  const record = raw as { total?: unknown; available?: unknown } | null | undefined;
  const total = record?.total;
  const available = record?.available;
  // Regra geral do Escopo 4, mesma aplicada a CPU/GPU: `available` negativo é
  // defeito de sensor, não um valor válido fora de faixa — sem a checagem, o
  // clamp abaixo mascararia o negativo como "quase toda a memória em uso".
  if (!isFiniteNumber(total) || total <= 0 || !isFiniteNumber(available) || available < 0) {
    return { available: false, reason: 'unsupported' };
  }
  const usedBytes = Math.round(clamp(total - available, 0, total));
  const usedPercent = roundTo(clamp((usedBytes / total) * 100, 0, 100), 1);
  return { available: true, value: { usedBytes, totalBytes: Math.round(total), usedPercent } };
}

function normalizeGpu(raw: unknown): MetricSample<GpuMetric> {
  const record = raw as { controllers?: unknown } | null | undefined;
  const controllers = record?.controllers;
  if (!Array.isArray(controllers)) {
    return { available: false, reason: 'unsupported' };
  }
  for (const controller of controllers) {
    const utilization = (controller as { utilizationGpu?: unknown } | null | undefined)
      ?.utilizationGpu;
    // Mesma regra geral do Escopo 4 aplicada em `normalizeCpu`: negativo
    // ⇒ segue procurando um controller válido, nunca vira `0 %` silencioso.
    if (isFiniteNumber(utilization) && utilization >= 0) {
      return { available: true, value: { loadPercent: roundTo(clamp(utilization, 0, 100), 1) } };
    }
  }
  return { available: false, reason: 'unsupported' };
}

function normalizeNetwork(raw: unknown): MetricSample<NetworkMetric> {
  const entries = Array.isArray(raw) ? raw : [];
  for (const entry of entries) {
    const record = entry as { rx_sec?: unknown; tx_sec?: unknown } | null | undefined;
    const rx = record?.rx_sec;
    const tx = record?.tx_sec;
    if (isFiniteNumber(rx) && rx >= 0 && isFiniteNumber(tx) && tx >= 0) {
      return {
        available: true,
        value: { rxBytesPerSecond: Math.round(rx), txBytesPerSecond: Math.round(tx) },
      };
    }
  }
  return { available: false, reason: 'unsupported' };
}

export function createSystemMetrics(deps: {
  readonly si: SystemInformationPort;
  readonly timeoutMs?: number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}): SystemMetrics {
  const { si } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const setTimer = deps.setTimeout ?? globalThis.setTimeout;
  const clearTimer = deps.clearTimeout ?? globalThis.clearTimeout;

  return {
    async read(): Promise<SystemMetricsSnapshot> {
      const [cpu, memory, gpu, network] = await Promise.all([
        readMetric(() => si.currentLoad(), timeoutMs, setTimer, clearTimer, normalizeCpu),
        readMetric(() => si.mem(), timeoutMs, setTimer, clearTimer, normalizeMemory),
        readMetric(() => si.graphics(), timeoutMs, setTimer, clearTimer, normalizeGpu),
        readMetric(() => si.networkStats(), timeoutMs, setTimer, clearTimer, normalizeNetwork),
      ]);
      return { cpu, memory, gpu, network };
    },
  };
}
