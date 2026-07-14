import type {
  ExecutedStep,
  ExecutionResult,
  Plan,
  Runtime,
  ToolDescriptor,
  ToolRegistry,
} from '@atlas/contracts';

export interface RuntimeDeps {
  registry: ToolRegistry;
}

export function createRuntime(deps: RuntimeDeps): Runtime {
  const { registry } = deps;
  return {
    tools(): readonly ToolDescriptor[] {
      return registry.list().map((tool) => ({ name: tool.name, description: tool.description }));
    },

    async execute(plan: Plan): Promise<ExecutionResult> {
      const steps: ExecutedStep[] = [];
      for (const step of plan.steps) {
        const tool = registry.get(step.tool);
        if (tool === undefined) {
          steps.push({
            tool: step.tool,
            args: step.args,
            result: { ok: false, error: `ferramenta desconhecida: ${step.tool}` },
          });
          continue;
        }
        try {
          const result = await tool.run(step.args);
          steps.push({ tool: step.tool, args: step.args, result });
        } catch (cause) {
          steps.push({
            tool: step.tool,
            args: step.args,
            result: {
              ok: false,
              error: `falha ao executar ${step.tool}: ${(cause as Error).message}`,
            },
          });
        }
      }
      return { steps };
    },
  };
}
