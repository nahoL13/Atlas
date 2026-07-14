import type { Tool, ToolRegistry } from '@atlas/contracts';

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, Tool>();
  return {
    register(tool: Tool): void {
      tools.set(tool.name, tool);
    },
    get(name: string): Tool | undefined {
      return tools.get(name);
    },
    has(name: string): boolean {
      return tools.has(name);
    },
    list(): readonly Tool[] {
      return [...tools.values()];
    },
  };
}
