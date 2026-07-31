import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach } from 'vitest';
import type { AtlasConfigOverride } from '@atlas/contracts';

// Preâmbulo compartilhado da suíte de core-bridge (SPEC-0042, D3): extraído
// de core-bridge.test.ts para evitar duplicação entre os sete arquivos por
// assunto. Módulo auxiliar puro — não contém `describe`/`it`.

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/**
 * Registra `beforeEach`/`afterEach` para criar e remover um diretório
 * temporário por caso de teste, e devolve acessores para lê-lo e para montar
 * um `AtlasConfigOverride` de base sobre ele. `tmpDir` nunca é compartilhado
 * entre casos — cada `beforeEach` cria um novo.
 */
export function useTmpDir(): {
  path(): string;
  baseOverride(overrides?: AtlasConfigOverride): AtlasConfigOverride;
} {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'atlas-desktop-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  return {
    path: () => tmpDir,
    baseOverride: (overrides: AtlasConfigOverride = {}) => ({
      model: { provider: 'fake' },
      dataDir: tmpDir,
      memory: { path: join(tmpDir, 'memory.json') },
      ...overrides,
    }),
  };
}

/**
 * Encerra uma sessão de chat viva se ela ainda estiver aberta; engole o erro
 * se ela já tiver sido encerrada por outra operação (ex.: aplicação de
 * permissões/Persona que encerra sessões vivas). Usada em `finally` de casos
 * que abrem sessão e podem ou não tê-la deixado viva ao final.
 */
export async function closeChatSessionIfOpen(session: string): Promise<void> {
  const { closeChatSession } = await import('../../src/core-bridge.js');
  try {
    await closeChatSession(session);
  } catch {
    // já encerrada por outra operação — nada a fazer.
  }
}
