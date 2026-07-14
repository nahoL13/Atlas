export interface ToolResult {
  readonly ok: boolean;
  readonly output?: string;
  readonly error?: string;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  run(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  has(name: string): boolean;
  list(): readonly Tool[];
}
