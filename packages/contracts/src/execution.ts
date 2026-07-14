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

export interface PlanStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
}

export interface Plan {
  readonly steps: readonly PlanStep[];
}

export interface ExecutedStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly result: ToolResult;
}

export interface ExecutionResult {
  readonly steps: readonly ExecutedStep[];
}

export interface Runtime {
  tools(): readonly ToolDescriptor[];
  execute(plan: Plan): Promise<ExecutionResult>;
}
