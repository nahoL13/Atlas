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
import { observe } from './observer.js';
import { createLearner } from './learner.js';

/**
 * Teto fixo do laço de replanejamento (ADR-0015): no máximo 1 replanejamento
 * (até 2 passes de plano/execução). Constante embutida — não configurável
 * por flag/env nesta fatia.
 */
const REPLAN_BUDGET = 1;

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

/**
 * Resumo compacto das falhas de um passe, injetado na chamada `generate` de
 * replanejamento (ADR-0015, mesmo padrão de `summarizeSteps` da SPEC-0014).
 */
function summarizeFailures(steps: readonly ExecutedStep[]): string {
  const failures = steps.filter((step) => !step.result.ok);
  return failures
    .map((step) => `${step.tool}(${JSON.stringify(step.args)}) → ERRO: ${step.result.error ?? ''}`)
    .join('\n');
}

interface PlanCycleResult {
  firstText: string;
  plan: Plan | null;
  execution?: ExecutionResult;
  composedText?: string;
  learned: readonly string[];
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway, runtime, personaPrompt, memoryPrompt } = deps;
  const systemPrompt = [personaPrompt, memoryPrompt, TASK_FRAMING]
    .filter((part): part is string => part !== undefined && part !== '')
    .join('\n\n');
  const planner = createPlanner();
  const learner = createLearner();

  /**
   * Etapa 6 (Aprendizado, ADR-0016): +1 chamada `generate` dedicada, feita
   * depois da resposta final do turno estar pronta, com a `instruction()`
   * do learner mais o conteúdo do turno (`buildLearnMessages`). Nunca
   * quebra o turno: qualquer erro do gateway ou saída inválida resolve em
   * lista vazia.
   */
  async function extractLearned(messages: Message[]): Promise<readonly string[]> {
    try {
      const result = await gateway.generate({ messages });
      return learner.parse(result.text);
    } catch {
      return [];
    }
  }

  /**
   * Orquestração comum a `ask` e `respond` (ADR-0012, revisado pelos
   * ADR-0015/ADR-0016): 1ª chamada `generate`, parse do plano; sem plano,
   * responde com o texto direto (1 chamada). Com plano, `runtime.execute` →
   * `observe` (Etapa 5, determinístico e puro). Se `observe` indicar
   * `replan` e ainda houver orçamento (teto fixo `REPLAN_BUDGET`), uma nova
   * chamada `generate` de replanejamento recebe um resumo compacto das
   * falhas do passe anterior; senão (`complete`, orçamento esgotado, ou
   * replan sem plano) cai direto na composição final. `steps` acumulam os
   * passos de todos os passes. Em **ambos** os caminhos (sem plano e com
   * composição), a resposta final passa por +1 chamada de extração (Etapa
   * 6) antes do helper retornar. Nunca lança, nunca laça sem limite.
   */
  async function runPlanCycle(
    firstMessages: Message[],
    buildComposeMessages: (resultsSummary: string) => Message[],
    buildLearnMessages: (finalText: string) => Message[],
  ): Promise<PlanCycleResult> {
    let messages = [...firstMessages];
    const first = await gateway.generate({ messages });
    const plan = planner.parse(first.text);
    if (plan === null) {
      const learned = await extractLearned(buildLearnMessages(first.text));
      return { firstText: first.text, plan: null, learned };
    }

    const allSteps: ExecutedStep[] = [];
    let execution = await runtime.execute(plan);
    allSteps.push(...execution.steps);
    let observation = observe(execution);
    let planText = first.text;
    let budget = REPLAN_BUDGET;

    while (observation.verdict === 'replan' && budget > 0) {
      budget -= 1;
      const failuresSummary = summarizeFailures(execution.steps);
      messages = [
        ...messages,
        { role: 'assistant', content: planText },
        {
          role: 'user',
          content:
            `A execução do plano anterior teve falhas:\n${failuresSummary}\n\n` +
            'Ajuste o plano e tente novamente, seguindo o mesmo formato.',
        },
      ];
      const replanResult = await gateway.generate({ messages });
      planText = replanResult.text;
      const replanPlan = planner.parse(replanResult.text);
      if (replanPlan === null) {
        break;
      }
      execution = await runtime.execute(replanPlan);
      allSteps.push(...execution.steps);
      observation = observe(execution);
    }

    const resultsSummary = formatResults(allSteps);
    const composed = await gateway.generate({ messages: buildComposeMessages(resultsSummary) });
    const learned = await extractLearned(buildLearnMessages(composed.text));
    return {
      firstText: first.text,
      plan,
      execution: { steps: allSteps },
      composedText: composed.text,
      learned,
    };
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
        (finalText) => [
          { role: 'system', content: learner.instruction() },
          {
            role: 'user',
            content: `Usuário disse:\n${objective}\n\nResposta dada:\n${finalText}`,
          },
        ],
      );

      const learned = cycle.learned.length > 0 ? { learned: cycle.learned } : {};
      if (cycle.plan === null) {
        return { text: cycle.firstText, ...learned };
      }
      return { text: cycle.composedText!, steps: cycle.execution!.steps, ...learned };
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

      const cycle = await runPlanCycle(
        firstMessages,
        (results): Message[] => [
          ...withUser,
          {
            role: 'user',
            content: `Resultados das ferramentas executadas:\n${results}\n\nResponda usando esses resultados.`,
          },
        ],
        (finalText): Message[] => [
          ...withUser,
          { role: 'system', content: learner.instruction() },
          { role: 'user', content: `Resposta dada:\n${finalText}` },
        ],
      );

      const learned = cycle.learned.length > 0 ? { learned: cycle.learned } : {};
      if (cycle.plan === null) {
        const messages: Message[] = [...withUser, { role: 'assistant', content: cycle.firstText }];
        return { reply: cycle.firstText, conversation: { messages }, ...learned };
      }

      const steps = cycle.execution!.steps;
      const messages: Message[] = [
        ...withUser,
        { role: 'assistant', content: cycle.composedText! },
        { role: 'system', content: summarizeSteps(steps) },
      ];
      return { reply: cycle.composedText!, conversation: { messages }, steps, ...learned };
    },
  };
}
