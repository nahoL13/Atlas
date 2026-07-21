import type { ActionRequest } from './permission.js';

export interface ToolResult {
  readonly ok: boolean;
  readonly output?: string;
  readonly error?: string;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  /** Descreve, como dado, o recurso que esta invocação tocaria. null/ausente = não toca nada (livre). */
  requirements?(args: Record<string, unknown>): ActionRequest | null;
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
  /**
   * Id da Skill selecionada pelo Planner/modelo para este plano (ADR-0018,
   * SPEC-0026), opcional/aditivo no molde do `denialKind?` (ADR-0015). No
   * máximo uma Skill por plano; ausência = comportamento de hoje. O
   * Cognitive Core resolve este id contra o catálogo de Skills antes de
   * injetar as `instructions` na composição — id inexistente/inativo é
   * ignorado sem quebrar o turno.
   */
  readonly skillId?: string;
}

export interface ExecutedStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly result: ToolResult;
  /**
   * Discrimina a natureza de uma negação: `blocked` (veredicto de permissão
   * ≠ allowed/confirm) ou `declined` (recusa do usuário no confirm). Ausente
   * quando o passo teve sucesso ou quando `ok: false` veio de falha de Tool
   * (Tool lançou, erro de IO, ferramenta desconhecida, contenção-no-uso).
   */
  readonly denialKind?: 'blocked' | 'declined';
}

export interface ExecutionResult {
  readonly steps: readonly ExecutedStep[];
}

export interface Runtime {
  tools(): readonly ToolDescriptor[];
  execute(plan: Plan): Promise<ExecutionResult>;
}
