import type {
  ModelGateway,
  Skill,
  SkillBuildRequest,
  SkillBuildResult,
  SkillBuilder,
  SkillRegistry,
  ToolRegistry,
} from '@atlas/contracts';

export interface CreateSkillBuilderOptions {
  readonly gateway: ModelGateway;
  readonly registry: SkillRegistry;
  readonly tools: ToolRegistry;
}

const SKILL_VERSION = '1.0.0';

interface RawDraft {
  readonly name?: unknown;
  readonly description?: unknown;
  readonly instructions?: unknown;
  readonly toolIds?: unknown;
}

interface ParsedDraft {
  readonly draft?: {
    readonly name: string;
    readonly description: string;
    readonly instructions: string;
    readonly toolIds: readonly string[];
  };
  readonly issues: readonly string[];
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return text.slice(start, end + 1);
}

/**
 * Parseia e valida estaticamente a saída do modelo como um `SkillDraft`
 * (passos 5-6 do Module Catalog). Nunca lança: JSON malformado/incompleto
 * ou campos fora do contrato viram `issues`, no molde do learner
 * (ADR-0016). `id`/`version`/`scope` do JSON, se presentes, são ignorados
 * — nunca vêm do modelo (ADR-0017).
 */
function parseDraft(modelOutput: string): ParsedDraft {
  const json = extractJsonObject(modelOutput);
  if (json === null) {
    return { issues: ['resposta do modelo não contém um objeto JSON'] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { issues: ['resposta do modelo não é um JSON válido'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { issues: ['resposta do modelo não é um objeto JSON'] };
  }

  const raw = parsed as RawDraft;
  const issues: string[] = [];

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name === '') {
    issues.push('"name" ausente ou vazio');
  }

  const description = typeof raw.description === 'string' ? raw.description : '';
  if (typeof raw.description !== 'string') {
    issues.push('"description" ausente ou não é string');
  }

  const instructions = typeof raw.instructions === 'string' ? raw.instructions.trim() : '';
  if (instructions === '') {
    issues.push('"instructions" ausente ou vazio');
  }

  let toolIds: readonly string[] = [];
  if (!Array.isArray(raw.toolIds)) {
    issues.push('"toolIds" ausente ou não é array');
  } else if (!raw.toolIds.every((item): item is string => typeof item === 'string')) {
    issues.push('"toolIds" deve ser um array de strings');
  } else {
    toolIds = raw.toolIds;
  }

  if (issues.length > 0) {
    return { issues };
  }

  return {
    draft: { name, description, instructions, toolIds },
    issues: [],
  };
}

function buildInstruction(capability: string): string {
  return [
    'Você está ajudando a construir uma nova Skill para um assistente de IA — uma ' +
      'capacidade especializada que reúne conhecimento, regras e as Tools necessárias ' +
      'para um tipo de trabalho.',
    `Capacidade desejada: ${capability}`,
    'Produza um rascunho estruturado com: um nome curto ("name"), uma descrição de uma ' +
      'linha ("description"), instruções especializadas de como executar essa capacidade ' +
      'bem ("instructions"), e a lista mínima de identificadores de Tools necessárias ' +
      '("toolIds", array de strings).',
    'Selecione em "toolIds" apenas as Tools estritamente necessárias para a capacidade. ' +
      'Deixe "toolIds" vazio SOMENTE se a capacidade for puramente de conhecimento/regras ' +
      'e genuinamente não exigir nenhuma Tool.',
    'Responda APENAS com um objeto JSON, sem nenhum texto ao redor, no formato:',
    '{"name": "...", "description": "...", "instructions": "...", "toolIds": ["..."]}',
  ].join('\n');
}

/**
 * Skill Builder (ADR-0017): percorre o processo mínimo de 8 passos do
 * Module Catalog. A única `gateway.generate` (passo 5) produz um
 * `SkillDraft` estruturado; `id`/`version`/`scope:'temporary'` são
 * atribuídos deterministicamente pelo Builder (nunca vêm do modelo). Em
 * sucesso, registra a Skill como `temporary`; em falha, devolve as
 * pendências sem registrar. Nunca promove `temporary`→`permanent`, nunca
 * lança.
 */
export function createSkillBuilder(options: CreateSkillBuilderOptions): SkillBuilder {
  const { gateway, registry, tools } = options;

  return {
    async build(request: SkillBuildRequest): Promise<SkillBuildResult> {
      // Passos 1-4: framing da capacidade, escopo, Tools mínimas e
      // permissões (declaradas como dado, não concedidas) ficam
      // codificados na instrução de geração abaixo.
      const instruction = buildInstruction(request.capability);

      // Passo 5: única chamada ao Model Gateway.
      const result = await gateway.generate({
        messages: [{ role: 'user', content: instruction }],
      });

      // Passo 6: validação estática do contrato.
      const parsed = parseDraft(result.text);
      if (parsed.draft === undefined) {
        return { ok: false, issues: parsed.issues };
      }

      // Passo 7: "teste controlado" estático — todo toolId declarado
      // resolve no Tool Registry injetado.
      const unresolved = parsed.draft.toolIds.filter((toolId) => !tools.has(toolId));
      if (unresolved.length > 0) {
        return {
          ok: false,
          issues: unresolved.map((toolId) => `Tool desconhecida: "${toolId}"`),
        };
      }

      // Passo 8: completa determinísticamente e registra.
      const skill: Skill = {
        id: `tmp-${crypto.randomUUID()}`,
        name: parsed.draft.name,
        description: parsed.draft.description,
        instructions: parsed.draft.instructions,
        toolIds: parsed.draft.toolIds,
        scope: 'temporary',
        version: SKILL_VERSION,
      };

      registry.register(skill);
      return { ok: true, skill };
    },
  };
}
