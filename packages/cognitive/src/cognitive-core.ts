import type {
  AskResult,
  CognitiveCore,
  Conversation,
  ConversationTurn,
  ExecutedStep,
  ExecutionResult,
  Message,
  ModelGateway,
  Plan,
  Runtime,
} from '@atlas/contracts';
import { createPlanner } from './planner.js';

export const TASK_FRAMING =
  'Responda ao objetivo do usuário de forma clara, correta e objetiva, ' +
  'no mesmo idioma em que ele escreveu. ' +
  'Se faltar informação essencial, diga o que precisa saber em vez de supor.';

export interface CognitiveCoreDeps {
  gateway: ModelGateway;
  runtime: Runtime;
  personaPrompt?: string;
  memoryPrompt?: string;
}

/** Formata os resultados de execução para a chamada de composição (ask/respond). */
function formatResults(steps: readonly ExecutedStep[]): string {
  return steps
    .map((step) => {
      const outcome = step.result.ok
        ? (step.result.output ?? '')
        : `ERRO: ${step.result.error ?? ''}`;
      return `- ${step.tool}(${JSON.stringify(step.args)}) → ${outcome}`;
    })
    .join('\n');
}

/**
 * Resumo compacto dos passos executados, persistido como mensagem `system`
 * no histórico da conversa (nunca exibido ao usuário) para que o modelo
 * "lembre", nos turnos seguintes, do que executou.
 */
function summarizeSteps(steps: readonly ExecutedStep[]): string {
  const parts = steps.map((step) => {
    const outcome = step.result.ok ? 'ok' : `negada: ${step.result.error ?? ''}`;
    return `${step.tool}(${JSON.stringify(step.args)}) → ${outcome}`;
  });
  return `[Tools executadas: ${parts.join('; ')}]`;
}

interface PlanCycleResult {
  firstText: string;
  plan: Plan | null;
  execution?: ExecutionResult;
  composedText?: string;
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway, runtime, personaPrompt, memoryPrompt } = deps;
  const systemPrompt = [personaPrompt, memoryPrompt, TASK_FRAMING]
    .filter((part): part is string => part !== undefined && part !== '')
    .join('\n\n');
  const planner = createPlanner();

  /**
   * Orquestração comum a `ask` e `respond` (ADR-0012): 1ª chamada `generate`,
   * parse do plano; sem plano, retorna só o texto; com plano, executa e faz
   * uma 2ª chamada `generate` de composição com os resultados.
   */
  async function runPlanCycle(
    firstMessages: Message[],
    buildComposeMessages: (resultsSummary: string) => Message[],
  ): Promise<PlanCycleResult> {
    const first = await gateway.generate({ messages: firstMessages });
    const plan = planner.parse(first.text);
    if (plan === null) {
      return { firstText: first.text, plan: null };
    }

    const execution = await runtime.execute(plan);
    const resultsSummary = formatResults(execution.steps);
    const composed = await gateway.generate({ messages: buildComposeMessages(resultsSummary) });
    return { firstText: first.text, plan, execution, composedText: composed.text };
  }

  return {
    async ask(objective: string): Promise<AskResult> {
      const instruction = planner.instruction(runtime.tools());
      const planningSystem = [systemPrompt, instruction].filter((part) => part !== '').join('\n\n');

      const cycle = await runPlanCycle(
        [
          { role: 'system', content: planningSystem },
          { role: 'user', content: objective },
        ],
        (results) => [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content:
              `${objective}\n\n` +
              `Resultados das ferramentas executadas:\n${results}\n\n` +
              'Responda ao objetivo usando esses resultados.',
          },
        ],
      );

      if (cycle.plan === null) {
        return { text: cycle.firstText };
      }
      return { text: cycle.composedText!, steps: cycle.execution!.steps };
    },

    startConversation(): Conversation {
      return { messages: [{ role: 'system', content: systemPrompt }] };
    },

    async respond(conversation: Conversation, input: string): Promise<ConversationTurn> {
      const instruction = planner.instruction(runtime.tools());
      const withUser: Message[] = [...conversation.messages, { role: 'user', content: input }];
      // Instrução do Planner entra como system message logo antes do turno do
      // usuário (não depois): a última mensagem segue sendo o input do
      // usuário, preservando a ordem que `ask` já usa.
      const firstMessages: Message[] =
        instruction === ''
          ? withUser
          : [
              ...conversation.messages,
              { role: 'system', content: instruction },
              { role: 'user', content: input },
            ];

      const cycle = await runPlanCycle(firstMessages, (results): Message[] => [
        ...withUser,
        {
          role: 'user',
          content: `Resultados das ferramentas executadas:\n${results}\n\nResponda usando esses resultados.`,
        },
      ]);

      if (cycle.plan === null) {
        const messages: Message[] = [...withUser, { role: 'assistant', content: cycle.firstText }];
        return { reply: cycle.firstText, conversation: { messages } };
      }

      const steps = cycle.execution!.steps;
      const messages: Message[] = [
        ...withUser,
        { role: 'assistant', content: cycle.composedText! },
        { role: 'system', content: summarizeSteps(steps) },
      ];
      return { reply: cycle.composedText!, conversation: { messages }, steps };
    },
  };
}
