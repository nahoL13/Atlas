import type { DedupeGroup, DedupeReport, Fact, MemoryService } from '@atlas/contracts';
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

export async function createMemoryService(deps: MemoryServiceDeps): Promise<MemoryService> {
  const facts: Fact[] = [...(await deps.storage.load())];

  return {
    async remember(
      text: string,
      source: 'user' | 'learned' = 'user',
    ): Promise<{ fact: Fact; created: boolean }> {
      const key = normalize(text);
      const existing = facts.find((fact) => normalize(fact.text) === key);
      if (existing !== undefined) {
        return { fact: existing, created: false };
      }
      const fact: Fact = {
        id: crypto.randomUUID().slice(0, 8),
        text,
        createdAt: new Date().toISOString(),
        source,
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

    list(): readonly Fact[] {
      return [...facts];
    },

    prompt(): string | undefined {
      if (facts.length === 0) {
        return undefined;
      }
      const lines = facts.map((fact) => `- ${fact.text}`);
      return `O usuário pediu para você lembrar os seguintes fatos e preferências:\n${lines.join('\n')}`;
    },

    async dedupe(options?: { readonly apply?: boolean }): Promise<DedupeReport> {
      const apply = options?.apply ?? false;

      // Agrupa por chave de normalização preservando a ordem de carga (índice
      // em `facts`), para o desempate D3 (menor índice) ser trivial.
      const groupsByKey = new Map<string, Fact[]>();
      for (const fact of facts) {
        const key = normalize(fact.text);
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
  };
}
