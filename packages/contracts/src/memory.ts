export interface Fact {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
}

export interface MemoryService {
  remember(text: string): Promise<Fact>;
  forget(id: string): Promise<boolean>;
  list(): readonly Fact[];
  prompt(): string | undefined;
}
