import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { Persona } from '@atlas/contracts';
import { PersonaError } from '../errors.js';

/**
 * Porta de persistência do Persona Service (ADR-0020(a)), no molde exato do
 * `MemoryStorage` do Memory Service (ADR-0011) — porta interna ao package,
 * **não** promovida a `@atlas/contracts` (só o tipo público `Persona`/
 * `PersonaService` sobe ao contrato). Síncrona: `createPersonaService`
 * carrega uma única vez na criação (load-once) e persiste imediatamente a
 * cada mutação (write-through), sem `await` — o mesmo padrão síncrono que
 * `createAtlas` já assume para `createPersonaService()`.
 */
export interface PersonaStorage {
  load(): readonly Persona[];
  save(personas: readonly Persona[]): void;
}

/**
 * Adapter default de arquivo JSON (`{ "personas": [...] }`), criado sob
 * demanda (diretório incluído). Arquivo ausente ⇒ `load()` devolve `[]`.
 * Fail-high (Restrições): JSON inválido ou de forma inesperada lança
 * `PersonaError` **citando o caminho do arquivo** — nunca descarta nem
 * sobrescreve silenciosamente as Personas do usuário.
 */
export function createFilePersonaStorage(path: string): PersonaStorage {
  return {
    load(): readonly Persona[] {
      if (!existsSync(path)) {
        return [];
      }

      let raw: string;
      try {
        raw = readFileSync(path, 'utf8');
      } catch (cause) {
        throw new PersonaError(`Falha ao ler o arquivo de Personas em ${path}`, { cause });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (cause) {
        throw new PersonaError(`Arquivo de Personas corrompido em ${path}: JSON inválido`, {
          cause,
        });
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray((parsed as { personas?: unknown }).personas)
      ) {
        throw new PersonaError(`Arquivo de Personas corrompido em ${path}: formato inesperado`);
      }

      return (parsed as { personas: Persona[] }).personas;
    },

    save(personas: readonly Persona[]): void {
      const dir = dirname(path);
      mkdirSync(dir, { recursive: true });
      // Escrita atômica (SPEC-0044/D9): grava num arquivo temporário no
      // MESMO diretório do alvo (garante mesmo sistema de arquivos, para o
      // rename ser atômico) e só então substitui o alvo por `renameSync`.
      // Sob falha em qualquer etapa, o alvo nunca fica parcialmente
      // escrito — o temporário é removido best-effort, sem mascarar o
      // erro original.
      const tmpPath = join(dir, `.personas.json.${randomUUID()}.tmp`);
      try {
        writeFileSync(tmpPath, `${JSON.stringify({ personas }, null, 2)}\n`, 'utf8');
        renameSync(tmpPath, path);
      } catch (cause) {
        try {
          if (existsSync(tmpPath)) {
            rmSync(tmpPath);
          }
        } catch {
          // best-effort: nunca mascara o erro original de gravação.
        }
        throw new PersonaError(`Falha ao gravar o arquivo de Personas em ${path}`, { cause });
      }
    },
  };
}
