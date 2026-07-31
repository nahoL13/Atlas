import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from './helpers/core-bridge-harness.js';

describe('verificação de fronteira (ADR-0003, SPEC-0039)', () => {
  function grepMatches(pattern: string, paths: string[]): string[] {
    try {
      const output = execFileSync('grep', ['-rl', pattern, ...paths, '--include=*.ts'], {
        cwd: repoRoot,
      }).toString();
      return output.split('\n').filter((line) => line.trim() !== '');
    } catch (error) {
      if ((error as { status?: number }).status === 1) {
        return [];
      }
      throw error;
    }
  }

  it('nenhum arquivo de apps/desktop/src nem apps/cli/src importa de @atlas/persona', () => {
    const matches = grepMatches("from '@atlas/persona'", ['apps/desktop/src', 'apps/cli/src']);
    expect(matches).toEqual([]);
  });

  it('apps/desktop/package.json não ganha dependência nova (@atlas/persona)', () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, 'apps', 'desktop', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).not.toHaveProperty('@atlas/persona');
  });

  it('nenhum arquivo reinventa join(..., "personas.json") fora de packages/core/src', () => {
    // Verifica a DERIVAÇÃO do caminho (um `join(...)` com o literal
    // 'personas.json'), não menções em comentários/prosa — `core-bridge.ts`
    // documenta a invariante em texto, mas delega a derivação real a
    // `personaStoragePath` de `@atlas/core`.
    let output = '';
    try {
      output = execFileSync(
        'grep',
        ['-rlE', "join\\(.*'personas\\.json'", 'apps', 'packages', '--include=*.ts'],
        { cwd: repoRoot },
      ).toString();
    } catch (error) {
      if ((error as { status?: number }).status !== 1) {
        throw error;
      }
    }
    const matches = output
      .split('\n')
      .filter((line) => line.trim() !== '')
      // exclui os próprios arquivos de teste (que citam o padrão em
      // strings/comentários ao testar exatamente esta invariante).
      .filter((file) => !file.includes('/tests/'));
    for (const file of matches) {
      expect(file.startsWith('packages/core/src/')).toBe(true);
    }
  });
});
