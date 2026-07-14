import type { Tool } from '@atlas/contracts';

export interface ClockDeps {
  now?: () => Date;
}

export function createClockTool(deps: ClockDeps = {}): Tool {
  const now = deps.now ?? ((): Date => new Date());
  return {
    name: 'clock',
    description:
      'Retorna a data e hora atuais em ISO 8601. Use quando o objetivo depender da data/hora de agora. Não recebe argumentos.',
    async run() {
      return { ok: true, output: now().toISOString() };
    },
  };
}
