import type { Fact, MemoryService } from '@atlas/contracts';
import type { MemoryStorage } from './storage/memory-storage.js';

export interface MemoryServiceDeps {
  storage: MemoryStorage;
}

export async function createMemoryService(deps: MemoryServiceDeps): Promise<MemoryService> {
  const facts: Fact[] = [...(await deps.storage.load())];

  return {
    async remember(text: string, source: 'user' | 'learned' = 'user'): Promise<Fact> {
      const fact: Fact = {
        id: crypto.randomUUID().slice(0, 8),
        text,
        createdAt: new Date().toISOString(),
        source,
      };
      facts.push(fact);
      await deps.storage.save(facts);
      return fact;
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
  };
}
