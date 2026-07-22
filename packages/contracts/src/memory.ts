export type MemoryCategory = 'fact' | 'episode' | 'project';

export interface Fact {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly source?: 'user' | 'learned';
  readonly category?: MemoryCategory;
  readonly subject?: string;
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
  remember(
    text: string,
    source?: 'user' | 'learned',
    options?: { readonly category?: MemoryCategory; readonly subject?: string },
  ): Promise<{ fact: Fact; created: boolean }>;
  forget(id: string): Promise<boolean>;
  list(options?: { readonly category?: MemoryCategory }): readonly Fact[];
  prompt(options?: { readonly query?: string; readonly limit?: number }): string | undefined;
  dedupe(options?: { readonly apply?: boolean }): Promise<DedupeReport>;
  search(query: string, options?: { readonly limit?: number }): readonly Fact[];
}
