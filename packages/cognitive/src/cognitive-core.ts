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
  Skill,
  SkillDescriptor,
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

/**
 * Projeção somente-leitura do `SkillRegistry` (SPEC-0026/ADR-0018): menor
 * privilégio — o Cognitive só lê o catálogo (metadados via `list()`, Skill
 * completa via `get(id)`), nunca `register`/`deactivate`/`remove`. Tipo
 * **interno** a este package (não sobe a `@atlas/contracts`), no molde do
 * provider `memoryPrompt` da SPEC-0021.
 */
export interface SkillCatalogPort {
  list(): readonly SkillDescriptor[];
  get(id: string): Skill | undefined;
}

export interface CognitiveCoreDeps {
  gateway: ModelGateway;
  runtime: Runtime;
  personaPrompt?: string;
  /**
   * Provider síncrono de memória (SPEC-0021): substitui a antiga string
   * congelada na criação. Amostrado **exatamente uma vez por turno** (no
   * início de cada `ask`/`respond`/`startConversation`) — todas as
   * `generate` do mesmo turno compartilham o mesmo valor amostrado. O
   * Cognitive continua sem conhecer o conceito de Memory: recebe apenas uma
   * função que devolve `string | undefined`, tipo **interno** a este
   * package (não sobe a `@atlas/contracts`).
   */
  memoryPrompt?: () => string | undefined;
  /**
   * Porta de leitura de Skills (SPEC-0026/ADR-0018), **opcional**. Amostrada
   * (`list()`) exatamente uma vez por turno em `ask`/`respond` e passada a
   * `planner.instruction`; ausência preserva o comportamento anterior
   * (catálogo de Skills vazio, nenhuma injeção).
   */
  skillCatalog?: SkillCatalogPort;
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

/**
 * Substitui o conteúdo da primeira mensagem `system` de `messages` por
 * `systemPrompt`; se não houver nenhuma, insere uma no topo (índice 0).
 * Nunca varre/rescreve outras mensagens `system` (ex.: os resumos compactos
 * de Tools da SPEC-0014 ficam intactos). Usado por `respond` (SPEC-0021)
 * para manter a `Conversation` como fonte única do prompt de memória
 * fresco, tanto nas mensagens enviadas ao modelo quanto na retornada.
 */
function withFreshSystemHead(messages: readonly Message[], systemPrompt: string): Message[] {
  const index = messages.findIndex((message) => message.role === 'system');
  if (index === -1) {
    return [{ role: 'system', content: systemPrompt }, ...messages];
  }
  return messages.map((message, i) =>
    i === index ? { role: 'system', content: systemPrompt } : message,
  );
}

interface PlanCycleResult {
  firstText: string;
  plan: Plan | null;
  execution?: ExecutionResult;
  composedText?: string;
  learned: readonly string[];
}

export function createCognitiveCore(deps: CognitiveCoreDeps): CognitiveCore {
  const { gateway, runtime, personaPrompt, memoryPrompt, skillCatalog } = deps;
  const planner = createPlanner();
  const learner = createLearner();

  /**
   * Compõe o `systemPrompt` a partir de um valor de memória já amostrado
   * (SPEC-0021): `personaPrompt` (estático, composto uma vez na criação —
   * a Persona não muda em runtime) + `memoryValue` (amostrado 1x por turno)
   * + `skillInstructions` (SPEC-0026/ADR-0018: só presente na composição,
   * quando o `Plan` selecionou uma Skill que resolve no catálogo) +
   * `TASK_FRAMING` (estático), na ordem Persona → Memory → Skill → Task.
   */
  function compose(memoryValue: string | undefined, skillInstructions?: string): string {
    return [personaPrompt, memoryValue, skillInstructions, TASK_FRAMING]
      .filter((part): part is string => part !== undefined && part !== '')
      .join('\n\n');
  }

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
    buildComposeMessages: (resultsSummary: string, skillInstructions?: string) => Message[],
    buildLearnMessages: (finalText: string) => Message[],
  ): Promise<PlanCycleResult> {
    let messages = [...firstMessages];
    const first = await gateway.generate({ messages });
    const plan = planner.parse(first.text);
    if (plan === null) {
      const learned = await extractLearned(buildLearnMessages(first.text));
      return { firstText: first.text, plan: null, learned };
    }

    let activeSkillId = plan.skillId;
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
      activeSkillId = replanPlan.skillId;
      execution = await runtime.execute(replanPlan);
      allSteps.push(...execution.steps);
      observation = observe(execution);
    }

    // Skill (SPEC-0026/ADR-0018): resolve o skillId ativo contra o catálogo
    // só na composição — id inexistente/inativo (get devolve undefined) ou
    // ausente = sem injeção, turno segue normal.
    const resolvedSkill =
      activeSkillId !== undefined ? skillCatalog?.get(activeSkillId) : undefined;

    const resultsSummary = formatResults(allSteps);
    const composed = await gateway.generate({
      messages: buildComposeMessages(resultsSummary, resolvedSkill?.instructions),
    });
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
      // Amostragem única por turno (SPEC-0021): o provider é chamado
      // exatamente 1x aqui; planejamento, replanejamento, composição e
      // extração compartilham o mesmo `systemPrompt`/`memoryValue`.
      const memoryValue = memoryPrompt?.();
      const systemPrompt = compose(memoryValue);
      // Amostragem 1x/turno do catálogo de Skills (SPEC-0026): ausência da
      // porta = catálogo vazio, preservando o comportamento anterior.
      const skillDescriptors = skillCatalog?.list() ?? [];
      const instruction = planner.instruction(runtime.tools(), skillDescriptors);
      const planningSystem = [systemPrompt, instruction].filter((part) => part !== '').join('\n\n');

      const cycle = await runPlanCycle(
        [
          { role: 'system', content: planningSystem },
          { role: 'user', content: objective },
        ],
        (results, skillInstructions) => [
          { role: 'system', content: compose(memoryValue, skillInstructions) },
          {
            role: 'user',
            content:
              `${objective}\n\n` +
              `Resultados das ferramentas executadas:\n${results}\n\n` +
              'Responda ao objetivo usando esses resultados.',
          },
        ],
        (finalText) => [
          { role: 'system', content: learner.instruction(memoryValue) },
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
      // O prompt do momento (SPEC-0021): o provider é amostrado na criação
      // da conversa, como já fazia com o valor estático.
      const systemPrompt = compose(memoryPrompt?.());
      return { messages: [{ role: 'system', content: systemPrompt }] };
    },

    async respond(conversation: Conversation, input: string): Promise<ConversationTurn> {
      // Amostragem única por turno (SPEC-0021): a primeira mensagem `system`
      // da conversa é substituída pelo prompt fresco (ou inserida no topo
      // quando não houver nenhuma) — tanto nas mensagens enviadas ao modelo
      // quanto na `Conversation` retornada (fonte única, sem prompt morto).
      const memoryValue = memoryPrompt?.();
      const systemPrompt = compose(memoryValue);
      const freshMessages = withFreshSystemHead(conversation.messages, systemPrompt);

      // Amostragem 1x/turno do catálogo de Skills (SPEC-0026): ausência da
      // porta = catálogo vazio, preservando o comportamento anterior.
      const skillDescriptors = skillCatalog?.list() ?? [];
      const instruction = planner.instruction(runtime.tools(), skillDescriptors);
      const withUser: Message[] = [...freshMessages, { role: 'user', content: input }];
      // Instrução do Planner entra como system message logo antes do turno do
      // usuário (não depois): a última mensagem segue sendo o input do
      // usuário, preservando a ordem que `ask` já usa.
      const firstMessages: Message[] =
        instruction === ''
          ? withUser
          : [
              ...freshMessages,
              { role: 'system', content: instruction },
              { role: 'user', content: input },
            ];

      const cycle = await runPlanCycle(
        firstMessages,
        (results, skillInstructions): Message[] => {
          // Skill (SPEC-0026/ADR-0018): a `Conversation` retornada nunca
          // carrega as `instructions` da Skill — só a mensagem system
          // enviada a esta chamada de composição é ajustada.
          const composeBase =
            skillInstructions !== undefined
              ? withFreshSystemHead(withUser, compose(memoryValue, skillInstructions))
              : withUser;
          return [
            ...composeBase,
            {
              role: 'user',
              content: `Resultados das ferramentas executadas:\n${results}\n\nResponda usando esses resultados.`,
            },
          ];
        },
        (finalText): Message[] => [
          ...withUser,
          { role: 'system', content: learner.instruction(memoryValue) },
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
