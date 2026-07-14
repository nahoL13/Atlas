import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AtlasError } from '@atlas/contracts';
import { createFileMemoryStorage } from '../src/index.js';

async function tmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'atlas-mem-'));
}

describe('createFileMemoryStorage', () => {
  it('arquivo ausente → lista vazia', async () => {
    const dir = await tmpDir();
    const storage = createFileMemoryStorage(join(dir, 'memory.json'));
    expect(await storage.load()).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });

  it('save cria o diretório e persiste; load recarrega', async () => {
    const dir = await tmpDir();
    const path = join(dir, 'nested', 'memory.json');
    const storage = createFileMemoryStorage(path);
    const facts = [{ id: 'a1', text: 'x', createdAt: '2026-01-01T00:00:00.000Z' }];
    await storage.save(facts);
    expect(await storage.load()).toEqual(facts);
    await rm(dir, { recursive: true, force: true });
  });

  it('JSON inválido → AtlasError (ATLAS_MEMORY)', async () => {
    const dir = await tmpDir();
    const path = join(dir, 'memory.json');
    await writeFile(path, 'não é json', 'utf8');
    const storage = createFileMemoryStorage(path);
    await expect(storage.load()).rejects.toBeInstanceOf(AtlasError);
    await rm(dir, { recursive: true, force: true });
  });
});
