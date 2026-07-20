export interface Fact {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly source?: 'user' | 'learned';
}

export interface MemoryService {
  remember(text: string, source?: 'user' | 'learned'): Promise<{ fact: Fact; created: boolean }>;
  forget(id: string): Promise<boolean>;
  list(): readonly Fact[];
  prompt(): string | undefined;
}
