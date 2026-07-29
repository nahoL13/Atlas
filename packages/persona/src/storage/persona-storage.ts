import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify({ personas }, null, 2)}\n`, 'utf8');
    },
  };
}
