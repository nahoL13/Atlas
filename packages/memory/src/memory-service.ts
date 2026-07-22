import type {
  DedupeGroup,
  DedupeReport,
  Fact,
  MemoryCategory,
  MemoryService,
} from '@atlas/contracts';
import { MemoryError } from './errors.js';
import type { MemoryStorage } from './storage/memory-storage.js';

export interface MemoryServiceDeps {
  storage: MemoryStorage;
}

// Critério de duplicata determinístico (SPEC-0022): trim → toLowerCase →
// colapso de espaços internos. Puro, síncrono, sem IO; não sobe a
// @atlas/contracts (sem 2º consumidor).
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Categoria efetiva de um Fact: ausência ≡ 'fact' (SPEC-0029, D5) — acervo
// legado sem `category` é tratado como fato em toda a lógica (duplicata,
// filtro, prompt).
function effectiveCategory(category: MemoryCategory | undefined): MemoryCategory {
  return category ?? 'fact';
}

// Separador de campos da chave de duplicata: caractere de controle que nao
// aparece em texto digitado por um usuario, evitando colisao de fronteira
// entre categoria/subject/texto (ex.: subject "a" + texto "b c" nao pode
// colidir com subject "a b" + texto "c").
const DEDUPE_KEY_SEPARATOR = '\u0001';

// Chave de duplicata determinística (SPEC-0029, D7): estende a chave da
// SPEC-0022 para a tupla categoria + subject + texto, todos normalizados.
function dedupeKey(fact: {
  text: string;
  category?: MemoryCategory | undefined;
  subject?: string | undefined;
}): string {
  return [
    normalize(effectiveCategory(fact.category)),
    normalize(fact.subject ?? ''),
    normalize(fact.text),
  ].join(DEDUPE_KEY_SEPARATOR);
}

// Invariante do modelo persistido (SPEC-0029, D11/D15): "memória de projeto
// exige projeto" é garantia do módulo, não da borda — lança antes de
// qualquer mutação ou storage.save. `subject` que colapsa para vazio após
// `normalize` é tratado como ausente e inválido (D15).
function validateCategorySubject(
  category: MemoryCategory | undefined,
  subject: string | undefined,
): void {
  const hasSubject = subject !== undefined && normalize(subject) !== '';
  if (category === 'project' && !hasSubject) {
    throw new MemoryError('memória de projeto (category: "project") exige um subject não vazio');
  }
  if (hasSubject && category !== 'project') {
    throw new MemoryError(
      `subject só é válido com category: "project" (recebido: ${category ?? 'fact'})`,
    );
  }
}

// Composição de prompt() agrupada por categoria (SPEC-0029, D8): ordem fixa
// fact → project → episode, seções unidas por linha em branco, molduras e
// formato literais. A seção `fact` é byte a byte igual à anterior a esta
// SPEC (não-regressão).
function composePrompt(facts: readonly Fact[]): string | undefined {
  const factLines = facts
    .filter((fact) => effectiveCategory(fact.category) === 'fact')
    .map((fact) => `- ${fact.text}`);

  // Agrupa por subject normalizado (mesmo critério de igualdade do resto do
  // módulo), mas exibe o subject original do primeiro registro daquele
  // grupo (subcabeçalho `[projeto <subject>]`, D8).
  const projectFacts = facts.filter((fact) => effectiveCategory(fact.category) === 'project');
  const subjectKeysInOrder: string[] = [];
  const displaySubjectByKey = new Map<string, string>();
  const bySubjectKey = new Map<string, Fact[]>();
  for (const fact of projectFacts) {
    const rawSubject = fact.subject ?? '';
    const key = normalize(rawSubject);
    const group = bySubjectKey.get(key);
    if (group !== undefined) {
      group.push(fact);
    } else {
      bySubjectKey.set(key, [fact]);
      displaySubjectByKey.set(key, rawSubject);
      subjectKeysInOrder.push(key);
    }
  }

  const episodeLines = facts
    .filter((fact) => effectiveCategory(fact.category) === 'episode')
    .map((fact) => `- ${fact.text}`);

  const sections: string[] = [];

  if (factLines.length > 0) {
    sections.push(
      `O usuário pediu para você lembrar os seguintes fatos e preferências:\n${factLines.join('\n')}`,
    );
  }

  if (subjectKeysInOrder.length > 0) {
    const projectBlocks = subjectKeysInOrder.map((key) => {
      const lines = bySubjectKey.get(key)!.map((fact) => `- ${fact.text}`);
      return `[projeto ${displaySubjectByKey.get(key)!}]\n${lines.join('\n')}`;
    });
    sections.push(`Sobre os projetos do usuário:\n${projectBlocks.join('\n')}`);
  }

  if (episodeLines.length > 0) {
    sections.push(`Episódios que o usuário pediu para você lembrar:\n${episodeLines.join('\n')}`);
  }

  if (sections.length === 0) {
    return undefined;
  }
  return sections.join('\n\n');
}

// Seleção com orçamento (SPEC-0030): reusa `search`/`normalize` — nenhuma
// segunda definição de relevância. Sem `limit`, ou com o acervo inteiro
// cabendo no orçamento, a seleção é o acervo completo (dump de hoje,
// comportamento inobservável enquanto o problema não existe, D6). Caso
// contrário: os relevantes por `search(query, { limit })` entram primeiro;
// o restante do orçamento é completado pelos fatos remanescentes em ordem
// de carga (D5, piso — nunca menos que `min(total, limit)`); a seleção
// final é sempre reordenada pela ordem de carga original antes da
// composição (D8 — a relevância decide quem entra, nunca a ordem).
function selectFacts(
  facts: readonly Fact[],
  searchFn: (query: string, options?: { readonly limit?: number }) => readonly Fact[],
  options: { readonly query?: string; readonly limit?: number } | undefined,
): readonly Fact[] {
  const limit = options?.limit;
  if (limit === undefined || facts.length <= limit) {
    return facts;
  }

  const relevant = searchFn(options?.query ?? '', { limit });
  const selectedIds = new Set(relevant.map((fact) => fact.id));

  for (const fact of facts) {
    if (selectedIds.size >= limit) {
      break;
    }
    if (!selectedIds.has(fact.id)) {
      selectedIds.add(fact.id);
    }
  }

  return facts.filter((fact) => selectedIds.has(fact.id));
}

export async function createMemoryService(deps: MemoryServiceDeps): Promise<MemoryService> {
  const facts: Fact[] = [...(await deps.storage.load())];

  const service: MemoryService = {
    async remember(
      text: string,
      source: 'user' | 'learned' = 'user',
      options?: { readonly category?: MemoryCategory; readonly subject?: string },
    ): Promise<{ fact: Fact; created: boolean }> {
      const category = options?.category;
      const subject = options?.subject;
      validateCategorySubject(category, subject);

      const key = dedupeKey({ text, category, subject });
      const existing = facts.find(
        (fact) =>
          dedupeKey({ text: fact.text, category: fact.category, subject: fact.subject }) === key,
      );
      if (existing !== undefined) {
        return { fact: existing, created: false };
      }
      const fact: Fact = {
        id: crypto.randomUUID().slice(0, 8),
        text,
        createdAt: new Date().toISOString(),
        source,
        category: category ?? 'fact',
        ...(subject !== undefined ? { subject } : {}),
      };
      facts.push(fact);
      await deps.storage.save(facts);
      return { fact, created: true };
    },

    async forget(id: string): Promise<boolean> {
      const index = facts.findIndex((fact) => fact.id === id);
      if (index === -1) {
        return false;
      }
      facts.splice(index, 1);
      await deps.storage.save(facts);
      return true;
    },

    list(options?: { readonly category?: MemoryCategory }): readonly Fact[] {
      if (options?.category === undefined) {
        return [...facts];
      }
      const category = options.category;
      return facts.filter((fact) => effectiveCategory(fact.category) === category);
    },

    prompt(options?: { readonly query?: string; readonly limit?: number }): string | undefined {
      const selected = selectFacts(facts, service.search, options);
      return composePrompt(selected);
    },

    async dedupe(options?: { readonly apply?: boolean }): Promise<DedupeReport> {
      const apply = options?.apply ?? false;

      // Agrupa por chave de normalização (categoria + subject + texto,
      // SPEC-0029/D7), preservando a ordem de carga (índice em `facts`), para
      // o desempate D3 (menor índice) ser trivial.
      const groupsByKey = new Map<string, Fact[]>();
      for (const fact of facts) {
        const key = dedupeKey({ text: fact.text, category: fact.category, subject: fact.subject });
        const group = groupsByKey.get(key);
        if (group !== undefined) {
          group.push(fact);
        } else {
          groupsByKey.set(key, [fact]);
        }
      }

      const dedupeGroups: DedupeGroup[] = [];
      const duplicateIds = new Set<string>();
      for (const group of groupsByKey.values()) {
        if (group.length < 2) {
          continue;
        }
        // `createdAt` é sempre gerado via `new Date().toISOString()` (formato
        // ISO 8601 UTC de largura fixa), então a comparação lexicográfica de
        // string equivale à ordem cronológica. Empate → menor índice em
        // `facts` (ordem de carga), já garantido pela ordem de `push` acima.
        let survivor = group[0]!;
        for (const fact of group.slice(1)) {
          if (fact.createdAt < survivor.createdAt) {
            survivor = fact;
          }
        }
        const duplicates = group.filter((fact) => fact.id !== survivor.id);
        dedupeGroups.push({ survivor, duplicates });
        for (const duplicate of duplicates) {
          duplicateIds.add(duplicate.id);
        }
      }

      if (dedupeGroups.length === 0) {
        return { applied: false, groups: [] };
      }

      if (!apply) {
        return { applied: false, groups: dedupeGroups };
      }

      const survivorsAndUntouched = facts.filter((fact) => !duplicateIds.has(fact.id));
      facts.length = 0;
      facts.push(...survivorsAndUntouched);
      await deps.storage.save(facts);
      return { applied: true, groups: dedupeGroups };
    },

    search(query: string, options?: { readonly limit?: number }): readonly Fact[] {
      const queryTokens = new Set(
        normalize(query)
          .split(' ')
          .filter((token) => token.length > 0),
      );
      if (queryTokens.size === 0) {
        return [];
      }

      const scored: { fact: Fact; score: number; index: number }[] = [];
      facts.forEach((fact, index) => {
        const factTokens = new Set(
          normalize(fact.text)
            .split(' ')
            .filter((token) => token.length > 0),
        );
        let score = 0;
        for (const token of queryTokens) {
          if (factTokens.has(token)) {
            score += 1;
          }
        }
        if (score > 0) {
          scored.push({ fact, score, index });
        }
      });

      scored.sort((a, b) => b.score - a.score || a.index - b.index);

      const results = scored.map((entry) => entry.fact);
      return options?.limit !== undefined ? results.slice(0, options.limit) : results;
    },
  };

  return service;
}
