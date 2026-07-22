import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import type { AtlasConfigOverride } from '@atlas/contracts';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'atlas-desktop-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function baseOverride(overrides: AtlasConfigOverride = {}): AtlasConfigOverride {
  return {
    model: { provider: 'fake' },
    dataDir: tmpDir,
    memory: { path: join(tmpDir, 'memory.json') },
    ...overrides,
  };
}

describe('resolveStatusSnapshot', () => {
  it('devolve um StatusSnapshot serializável com state ready e a config resolvida', async () => {
    const { resolveStatusSnapshot } = await import('../src/core-bridge.js');
    const snapshot = await resolveStatusSnapshot(baseOverride());

    expect(snapshot.state).toBe('ready');
    expect(snapshot.logLevel).toBe('info');
    expect(snapshot.dataDir).toBe(tmpDir);
    expect(snapshot.persona).toEqual({ id: 'jarvis', name: 'Jarvis' });
    expect(snapshot.readRoots.length).toBeGreaterThan(0);
    expect(snapshot.writeRoots).toEqual([]);

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('propaga o override de config ao Core (logLevel: debug)', async () => {
    const { resolveStatusSnapshot } = await import('../src/core-bridge.js');
    const snapshot = await resolveStatusSnapshot(baseOverride({ logLevel: 'debug' }));

    expect(snapshot.logLevel).toBe('debug');
  });

  it('propaga InvalidConfigError sem capturar', async () => {
    const { resolveStatusSnapshot } = await import('../src/core-bridge.js');

    await expect(resolveStatusSnapshot(baseOverride({ dataDir: '' }))).rejects.toBeInstanceOf(
      InvalidConfigError,
    );
  });

  it('chama atlas.shutdown() no caminho de sucesso', async () => {
    let shutdownSpy: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
    const spyModule = await import('@atlas/core');
    const original = spyModule.createAtlas;
    const spy = vi.spyOn(spyModule, 'createAtlas').mockImplementation(async (...args) => {
      const atlas = await original(...args);
      shutdownSpy = vi.fn<() => Promise<void>>(atlas.shutdown.bind(atlas));
      atlas.shutdown = shutdownSpy;
      return atlas;
    });

    const { resolveStatusSnapshot } = await import('../src/core-bridge.js');
    await resolveStatusSnapshot(baseOverride());

    expect(shutdownSpy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
