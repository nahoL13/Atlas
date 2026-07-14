import type { Plan, PlanStep, ToolDescriptor } from '@atlas/contracts';

export interface Planner {
  instruction(tools: readonly ToolDescriptor[]): string;
  parse(modelOutput: string): Plan | null;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return text.slice(start, end + 1);
}

export function createPlanner(): Planner {
  return {
    instruction(tools: readonly ToolDescriptor[]): string {
      if (tools.length === 0) {
        return '';
      }
      const list = tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
      return [
        'Você tem acesso às seguintes ferramentas:',
        list,
        '',
        'Se — e somente se — atender ao objetivo exigir uma dessas ferramentas, responda ' +
          'APENAS com um objeto JSON, sem nenhum texto ao redor, no formato:',
        '{"steps":[{"tool":"<nome>","args":{ ... }}]}',
        'Você pode incluir vários passos independentes. Se nenhuma ferramenta for necessária, ' +
          'responda normalmente ao usuário, em texto, sem JSON.',
      ].join('\n');
    },

    parse(modelOutput: string): Plan | null {
      const json = extractJsonObject(modelOutput);
      if (json === null) {
        return null;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return null;
      }
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }
      const rawSteps = (parsed as { steps?: unknown }).steps;
      if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
        return null;
      }
      const steps: PlanStep[] = [];
      for (const raw of rawSteps) {
        if (typeof raw !== 'object' || raw === null) {
          return null;
        }
        const tool = (raw as { tool?: unknown }).tool;
        if (typeof tool !== 'string' || tool === '') {
          return null;
        }
        const rawArgs = (raw as { args?: unknown }).args;
        const args =
          typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
            ? (rawArgs as Record<string, unknown>)
            : {};
        steps.push({ tool, args });
      }
      return { steps };
    },
  };
}
