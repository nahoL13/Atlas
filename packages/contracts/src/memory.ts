export interface Fact {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly source?: 'user' | 'learned';
}

export interface DedupeGroup {
  readonly survivor: Fact;
  readonly duplicates: readonly Fact[];
}

export interface DedupeReport {
  readonly applied: boolean;
  readonly groups: readonly DedupeGroup[];
}

export interface MemoryService {
  remember(text: string, source?: 'user' | 'learned'): Promise<{ fact: Fact; created: boolean }>;
  forget(id: string): Promise<boolean>;
  list(): readonly Fact[];
  prompt(): string | undefined;
  dedupe(options?: { readonly apply?: boolean }): Promise<DedupeReport>;
  search(query: string, options?: { readonly limit?: number }): readonly Fact[];
}
