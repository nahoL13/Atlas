import { describe, expect, it } from 'vitest';
import { createSystemMetrics } from '../src/system-metrics.js';
import type { SystemInformationPort } from '../src/system-metrics.js';

// SPEC-0054: leitura de métricas de host — IO totalmente injetado via
// `SystemInformationPort`, sem hardware real, sem `systeminformation`.

interface SiOverrides {
  readonly currentLoad?: () => Promise<unknown>;
  readonly mem?: () => Promise<unknown>;
  readonly graphics?: () => Promise<unknown>;
  readonly networkStats?: () => Promise<unknown>;
}

function buildSi(overrides: SiOverrides = {}): SystemInformationPort {
  return {
    currentLoad: overrides.currentLoad ?? (() => Promise.resolve({ currentLoad: 42.34 })),
    mem:
      overrides.mem ?? (() => Promise.resolve({ total: 16_000_000_000, available: 6_800_000_000 })),
    graphics:
      overrides.graphics ?? (() => Promise.resolve({ controllers: [{ utilizationGpu: 12 }] })),
    networkStats:
      overrides.networkStats ?? (() => Promise.resolve([{ rx_sec: 1_234_000, tx_sec: 340_000 }])),
  };
}

/**
 * Relógio injetável mínimo: permite disparar SÓ o N-ésimo timer agendado (na
 * ordem de chamada de `setTimeout`), sem tocar os demais — evita a corrida
 * espúria de disparar `resolve` de um timeout ANTES de o valor real (já
 * resolvido) terminar de propagar pela cadeia de microtarefas do `Promise.race`.
 */
function fakeTimer(): {
  readonly setTimeout: typeof globalThis.setTimeout;
  readonly clearTimeout: typeof globalThis.clearTimeout;
  fireNth(index: number): void;
} {
  const scheduled: Array<{ id: number; cb: () => void } | undefined> = [];
  let nextId = 1;
  return {
    setTimeout: ((cb: () => void) => {
      const id = nextId;
      nextId += 1;
      scheduled.push({ id, cb });
      return id as unknown as ReturnType<typeof globalThis.setTimeout>;
    }) as typeof globalThis.setTimeout,
    clearTimeout: ((handle: unknown) => {
      const index = scheduled.findIndex((entry) => entry?.id === handle);
      if (index !== -1) scheduled[index] = undefined;
    }) as typeof globalThis.clearTimeout,
    fireNth(index: number): void {
      const entry = scheduled[index];
      if (entry === undefined) return;
      scheduled[index] = undefined;
      entry.cb();
    },
  };
}

describe('createSystemMetrics — read() nunca lança, sempre devolve as quatro chaves', () => {
  it('caminho feliz: todas as quatro métricas disponíveis, normalizadas', async () => {
    const metrics = createSystemMetrics({ si: buildSi() });
    const snapshot = await metrics.read();
    expect(snapshot.cpu).toEqual({ available: true, value: { loadPercent: 42.3 } });
    expect(snapshot.memory).toEqual({
      available: true,
      value: { usedBytes: 9_200_000_000, totalBytes: 16_000_000_000, usedPercent: 57.5 },
    });
    expect(snapshot.gpu).toEqual({ available: true, value: { loadPercent: 12 } });
    expect(snapshot.network).toEqual({
      available: true,
      value: { rxBytesPerSecond: 1_234_000, txBytesPerSecond: 340_000 },
    });
  });

  it('as quatro chaves sempre presentes mesmo com todas as leituras rejeitando', async () => {
    const rejecting = () => Promise.reject(new Error('boom'));
    const metrics = createSystemMetrics({
      si: {
        currentLoad: rejecting,
        mem: rejecting,
        graphics: rejecting,
        networkStats: rejecting,
      },
    });
    const resolved = await metrics.read();
    expect(resolved.cpu).toEqual({ available: false, reason: 'read-failed' });
    expect(resolved.memory).toEqual({ available: false, reason: 'read-failed' });
    expect(resolved.gpu).toEqual({ available: false, reason: 'read-failed' });
    expect(resolved.network).toEqual({ available: false, reason: 'read-failed' });
  });
});

describe('CPU — seis desfechos', () => {
  it('valor válido ⇒ available', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ currentLoad: () => Promise.resolve({ currentLoad: 10 }) }),
    });
    expect((await metrics.read()).cpu).toEqual({ available: true, value: { loadPercent: 10 } });
  });

  it('campo ausente ⇒ unsupported', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ currentLoad: () => Promise.resolve({}) }),
    });
    expect((await metrics.read()).cpu).toEqual({ available: false, reason: 'unsupported' });
  });

  it('valor não finito (NaN) ⇒ unsupported', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ currentLoad: () => Promise.resolve({ currentLoad: Number.NaN }) }),
    });
    expect((await metrics.read()).cpu).toEqual({ available: false, reason: 'unsupported' });
  });

  it('acima de 100 é limitado a 100', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ currentLoad: () => Promise.resolve({ currentLoad: 150 }) }),
    });
    expect((await metrics.read()).cpu).toEqual({ available: true, value: { loadPercent: 100 } });
  });

  it('valor negativo ⇒ unsupported (regra geral do Escopo 4, não vira 0 %)', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ currentLoad: () => Promise.resolve({ currentLoad: -5 }) }),
    });
    expect((await metrics.read()).cpu).toEqual({ available: false, reason: 'unsupported' });
  });

  it('promessa rejeitada ⇒ read-failed', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ currentLoad: () => Promise.reject(new Error('falhou')) }),
    });
    expect((await metrics.read()).cpu).toEqual({ available: false, reason: 'read-failed' });
  });

  it('timeout ⇒ reason timeout, sem contaminar as outras três', async () => {
    const timer = fakeTimer();
    const metrics = createSystemMetrics({
      si: buildSi({ currentLoad: () => new Promise(() => {}) }),
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });
    const promise = metrics.read();
    // Só o timer da CPU (1º agendado, já que `currentLoad` é a 1ª leitura da
    // lista) dispara — as outras três leituras resolvem pelo caminho real.
    timer.fireNth(0);
    const snapshot = await promise;
    expect(snapshot.cpu).toEqual({ available: false, reason: 'timeout' });
    expect(snapshot.memory.available).toBe(true);
    expect(snapshot.gpu.available).toBe(true);
    expect(snapshot.network.available).toBe(true);
  });
});

describe('Memória', () => {
  it('valor válido: usedBytes = total - available, usedPercent arredondado a 1 casa', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({
        mem: () => Promise.resolve({ total: 16_000_000_000, available: 6_760_000_000 }),
      }),
    });
    expect((await metrics.read()).memory).toEqual({
      available: true,
      value: { usedBytes: 9_240_000_000, totalBytes: 16_000_000_000, usedPercent: 57.8 },
    });
  });

  it('total <= 0 ⇒ unsupported', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ mem: () => Promise.resolve({ total: 0, available: 0 }) }),
    });
    expect((await metrics.read()).memory).toEqual({ available: false, reason: 'unsupported' });
  });

  it('available não finito ⇒ unsupported', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ mem: () => Promise.resolve({ total: 1000, available: 'x' }) }),
    });
    expect((await metrics.read()).memory).toEqual({ available: false, reason: 'unsupported' });
  });

  it('available negativo ⇒ unsupported (usedBytes > total seria absurdo)', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ mem: () => Promise.resolve({ total: 1000, available: -1 }) }),
    });
    expect((await metrics.read()).memory).toEqual({ available: false, reason: 'unsupported' });
  });

  it('promessa rejeitada ⇒ read-failed', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ mem: () => Promise.reject(new Error('falhou')) }),
    });
    expect((await metrics.read()).memory).toEqual({ available: false, reason: 'read-failed' });
  });
});

describe('GPU', () => {
  it('escolhe o primeiro controller com utilizationGpu finito', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({
        graphics: () =>
          Promise.resolve({
            controllers: [{ utilizationGpu: undefined }, { utilizationGpu: 33.27 }],
          }),
      }),
    });
    expect((await metrics.read()).gpu).toEqual({ available: true, value: { loadPercent: 33.3 } });
  });

  it('nenhum controller com valor finito ⇒ unsupported', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ graphics: () => Promise.resolve({ controllers: [{ utilizationGpu: null }] }) }),
    });
    expect((await metrics.read()).gpu).toEqual({ available: false, reason: 'unsupported' });
  });

  it('controllers ausente/malformado ⇒ unsupported', async () => {
    const metrics = createSystemMetrics({ si: buildSi({ graphics: () => Promise.resolve({}) }) });
    expect((await metrics.read()).gpu).toEqual({ available: false, reason: 'unsupported' });
  });

  it('utilizationGpu negativo ⇒ segue procurando, e sem controller válido dá unsupported', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({
        graphics: () => Promise.resolve({ controllers: [{ utilizationGpu: -10 }] }),
      }),
    });
    expect((await metrics.read()).gpu).toEqual({ available: false, reason: 'unsupported' });
  });

  it('promessa rejeitada ⇒ read-failed', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ graphics: () => Promise.reject(new Error('falhou')) }),
    });
    expect((await metrics.read()).gpu).toEqual({ available: false, reason: 'read-failed' });
  });
});

describe('Rede', () => {
  it('escolhe a primeira entrada com rx_sec/tx_sec finitos e >= 0', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({
        networkStats: () =>
          Promise.resolve([
            { rx_sec: -1, tx_sec: 5 },
            { rx_sec: 100, tx_sec: 200 },
          ]),
      }),
    });
    expect((await metrics.read()).network).toEqual({
      available: true,
      value: { rxBytesPerSecond: 100, txBytesPerSecond: 200 },
    });
  });

  it('todas as entradas com valor negativo ⇒ unsupported', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ networkStats: () => Promise.resolve([{ rx_sec: -1, tx_sec: -1 }]) }),
    });
    expect((await metrics.read()).network).toEqual({ available: false, reason: 'unsupported' });
  });

  it('lista vazia (primeira leitura sem amostra anterior) ⇒ unsupported', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ networkStats: () => Promise.resolve([]) }),
    });
    expect((await metrics.read()).network).toEqual({ available: false, reason: 'unsupported' });
  });

  it('promessa rejeitada ⇒ read-failed', async () => {
    const metrics = createSystemMetrics({
      si: buildSi({ networkStats: () => Promise.reject(new Error('falhou')) }),
    });
    expect((await metrics.read()).network).toEqual({ available: false, reason: 'read-failed' });
  });
});

describe('paralelismo e ausência de estado (CA14)', () => {
  it('as quatro leituras são disparadas antes de qualquer uma resolver', () => {
    const calls: string[] = [];
    const metrics = createSystemMetrics({
      si: {
        currentLoad: () => {
          calls.push('cpu');
          return Promise.resolve({ currentLoad: 1 });
        },
        mem: () => {
          calls.push('mem');
          return Promise.resolve({ total: 100, available: 50 });
        },
        graphics: () => {
          calls.push('gpu');
          return Promise.resolve({ controllers: [{ utilizationGpu: 1 }] });
        },
        networkStats: () => {
          calls.push('net');
          return Promise.resolve([{ rx_sec: 1, tx_sec: 1 }]);
        },
      },
    });
    void metrics.read();
    expect(calls).toEqual(['cpu', 'mem', 'gpu', 'net']);
  });

  it('duas leituras seguidas não compartilham estado (sem cache)', async () => {
    let call = 0;
    const metrics = createSystemMetrics({
      si: buildSi({
        currentLoad: () => {
          call += 1;
          return Promise.resolve({ currentLoad: call * 10 });
        },
      }),
    });
    const first = await metrics.read();
    const second = await metrics.read();
    expect(first.cpu).toEqual({ available: true, value: { loadPercent: 10 } });
    expect(second.cpu).toEqual({ available: true, value: { loadPercent: 20 } });
  });
});

describe('gate mecânico de imports (CA15)', () => {
  it('src/system-metrics.ts não importa electron nem systeminformation', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'system-metrics.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"]electron['"]/);
    expect(source).not.toMatch(/from ['"]systeminformation['"]/);
  });

  it('systeminformation só é IMPORTADA em apps/desktop/src/main.ts, e listada em apps/desktop/package.json', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
    const files = readdirSync(srcDir).filter(
      (name) => name.endsWith('.ts') || name.endsWith('.cjs'),
    );
    const importPattern = /from ['"]systeminformation['"]/;
    for (const file of files) {
      const source = readFileSync(join(srcDir, file), 'utf8');
      const imports = importPattern.test(source);
      if (file === 'main.ts') {
        expect(imports, 'main.ts deveria importar systeminformation').toBe(true);
      } else {
        expect(imports, `${file} não deveria importar systeminformation`).toBe(false);
      }
    }
    const packageJson = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'),
      'utf8',
    );
    expect(packageJson).toContain('"systeminformation"');
  });
});

// SPEC-0054 (CA22): mesmo molde de `vad-wiring.test.ts` (SPEC-0052) — prova
// estática de que os dois canais IPC novos estão registrados em `main.ts` e
// expostos em `preload.cjs`, sem `vi.mock('electron')`.
describe('main.ts — registro dos dois canais atlas:metrics:read/atlas:tokens:read (CA22)', () => {
  it('registra exatamente os dois canais novos', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const mainSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.ts'),
      'utf8',
    );
    for (const channel of ['atlas:metrics:read', 'atlas:tokens:read']) {
      expect(mainSource).toContain(`'${channel}'`);
    }
  });
});

describe('preload.cjs — exposição de window.atlas.metrics/tokens (CA22)', () => {
  it('expõe metrics.read e tokens.read ligados aos canais certos', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const preloadSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'preload.cjs'),
      'utf8',
    );
    expect(preloadSource).toMatch(/metrics:\s*\{/);
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:metrics:read')");
    expect(preloadSource).toMatch(/tokens:\s*\{/);
    expect(preloadSource).toContain("ipcRenderer.invoke('atlas:tokens:read')");
  });
});
