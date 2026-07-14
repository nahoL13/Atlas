import type { Fact } from '@atlas/contracts';

export interface MemoryStorage {
  load(): Promise<readonly Fact[]>;
  save(facts: readonly Fact[]): Promise<void>;
}
