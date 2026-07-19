import type {
  ExecutedStep,
  ExecutionResult,
  PermissionService,
  Plan,
  Runtime,
  ToolDescriptor,
  ToolRegistry,
} from '@atlas/contracts';
import type { ConfirmPort } from './confirm-port.js';

export interface RuntimeDeps {
  registry: ToolRegistry;
  permissions: PermissionService;
  confirm: ConfirmPort;
}

export function createRuntime(deps: RuntimeDeps): Runtime {
  const { registry, permissions, confirm } = deps;
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
        const requirement = tool.requirements?.(step.args) ?? null;
        if (requirement !== null) {
          const decision = permissions.evaluate(requirement);
          if (decision.verdict === 'confirm') {
            const approved = await confirm.request(requirement);
            if (!approved) {
              steps.push({
                tool: step.tool,
                args: step.args,
                result: { ok: false, error: 'ação cancelada pelo usuário' },
                denialKind: 'declined',
              });
              continue;
            }
          } else if (decision.verdict !== 'allowed') {
            steps.push({
              tool: step.tool,
              args: step.args,
              result: {
                ok: false,
                error: decision.reason ?? `ação não permitida (${decision.verdict})`,
              },
              denialKind: 'blocked',
            });
            continue;
          }
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
