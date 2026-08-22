import { parseArgs } from 'node:util';
import path from 'node:path';
import type {
  AtlasConfigOverride,
  LogLevel,
  ModelGatewayConfig,
  ProviderName,
} from '@atlas/contracts';

/**
 * Espelho local (não sobe a `@atlas/contracts`) dos 8 campos de `Persona`
 * que o usuário pode informar por flag — parcial e literal: uma chave só
 * existe se a flag correspondente apareceu na invocação (sem defaults, sem
 * preenchimento; SPEC-0044, §2/§3-D3). `''`/lista vazia têm significado
 * próprio (limpar `voiceURI`/`communicationRules`), distinto de ausência.
 */
export interface PersonaFieldPatch {
  readonly name?: string;
  readonly tone?: string;
  readonly formality?: string;
  readonly language?: string;
  readonly style?: string;
  readonly voice?: string;
  readonly emotion?: string;
  readonly voiceURI?: string;
  readonly communicationRules?: readonly string[];
}

export interface ParsedInput {
  command:
    | 'status'
    | 'help'
    | 'version'
    | 'ask'
    | 'chat'
    | 'remember'
    | 'forget'
    | 'memory'
    | 'skills'
    | 'persona';
  configOverride: AtlasConfigOverride;
  objective?: string;
  factText?: string;
  factCategory?: 'fact' | 'episode' | 'project';
  factSubject?: string;
  factId?: string;
  memorySubcommand?: 'list' | 'dedupe' | 'search';
  apply?: boolean;
  searchQuery?: string;
  listCategory?: 'fact' | 'episode' | 'project';
  skillsSubcommand?: 'list' | 'build';
  capability?: string;
  personaSubcommand?: 'list' | 'show' | 'create' | 'edit' | 'delete';
  personaId?: string;
  personaName?: string;
  personaFields?: PersonaFieldPatch;
  personaAssumeYes?: boolean;
}

export interface InputGateway {
  normalize(argv: string[], env: NodeJS.ProcessEnv): ParsedInput;
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

interface CliValues {
  'log-level'?: string | undefined;
  'data-dir'?: string | undefined;
  persona?: string | undefined;
  'memory-path'?: string | undefined;
  'allow-read'?: string[] | undefined;
  'allow-write'?: string[] | undefined;
  'allow-net'?: string[] | undefined;
  'search-url'?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  'base-url'?: string | undefined;
  'api-key'?: string | undefined;
  apply?: boolean | undefined;
  category?: string | undefined;
  subject?: string | undefined;
  name?: string | undefined;
  tone?: string | undefined;
  formality?: string | undefined;
  language?: string | undefined;
  style?: string | undefined;
  voice?: string | undefined;
  emotion?: string | undefined;
  'voice-uri'?: string | undefined;
  rule?: string[] | undefined;
  yes?: boolean | undefined;
}

const MEMORY_CATEGORIES = ['fact', 'episode', 'project'] as const;
type MemoryCategoryFlag = (typeof MEMORY_CATEGORIES)[number];

function isMemoryCategory(value: string): value is MemoryCategoryFlag {
  return (MEMORY_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Valida `--category`/`--subject` na borda (antecipação amigável da
 * invariante do módulo, SPEC-0029/D11): categoria desconhecida, `project`
 * sem `subject` (ou em branco), e `subject` fora de `project`. A garantia
 * real vive em `@atlas/memory` — aqui é só `CliUsageError` antecipada.
 */
function resolveFactCategoryAndSubject(values: CliValues): {
  factCategory?: MemoryCategoryFlag;
  factSubject?: string;
} {
  const rawCategory = values.category;
  const rawSubject = values.subject;

  if (rawCategory !== undefined && !isMemoryCategory(rawCategory)) {
    throw new CliUsageError(`--category desconhecida: ${rawCategory} (use: fact|episode|project)`);
  }

  const subjectIsBlank = rawSubject !== undefined && rawSubject.trim() === '';

  if (rawCategory === 'project') {
    if (rawSubject === undefined || subjectIsBlank) {
      throw new CliUsageError('--category project exige --subject <projeto>');
    }
  } else if (rawSubject !== undefined) {
    throw new CliUsageError('--subject só é válido com --category project');
  }

  return {
    ...(rawCategory !== undefined ? { factCategory: rawCategory } : {}),
    ...(rawSubject !== undefined && !subjectIsBlank ? { factSubject: rawSubject } : {}),
  };
}

function filterNonEmpty(segments: readonly string[]): string[] {
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

/**
 * Resolve a lista final de raízes (read/write/net) a partir da env (string
 * separada por `separator`) e da flag repetível (`string[]`), aplicando a
 * precedência `flag > env` por **substituição** (nunca merge) e tratando o
 * colapso de qualquer fonte para uma lista vazia como "não fornecida".
 * Generalizada por um parâmetro de separador (SPEC-0055, D14): `path.delimiter`
 * para read/write (caminhos de arquivo), `','` para net (hostnames não são
 * caminhos — `ATLAS_ALLOW_NET` nunca é dividido por `path.delimiter`).
 */
function resolveRootList(
  envValue: string | undefined,
  flagValue: string[] | undefined,
  separator: string = path.delimiter,
): string[] | undefined {
  const fromFlag = flagValue !== undefined ? filterNonEmpty(flagValue) : undefined;
  if (fromFlag !== undefined && fromFlag.length > 0) {
    return fromFlag;
  }

  const fromEnv = envValue !== undefined ? filterNonEmpty(envValue.split(separator)) : undefined;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }

  return undefined;
}

function resolveConfigOverride(values: CliValues, env: NodeJS.ProcessEnv): AtlasConfigOverride {
  const override: AtlasConfigOverride = {};

  // Camada env (menor precedência). Valores crus; o core valida.
  if (env.ATLAS_LOG_LEVEL !== undefined) {
    override.logLevel = env.ATLAS_LOG_LEVEL as LogLevel;
  }
  if (env.ATLAS_DATA_DIR !== undefined) {
    override.dataDir = env.ATLAS_DATA_DIR;
  }
  if (env.ATLAS_PERSONA !== undefined) {
    override.persona = env.ATLAS_PERSONA;
  }

  // Camada flags (maior precedência).
  if (values['log-level'] !== undefined) {
    override.logLevel = values['log-level'] as LogLevel;
  }
  if (values['data-dir'] !== undefined) {
    override.dataDir = values['data-dir'];
  }
  if (values.persona !== undefined) {
    override.persona = values.persona;
  }

  let memoryPath: string | undefined;
  if (env.ATLAS_MEMORY_PATH !== undefined) {
    memoryPath = env.ATLAS_MEMORY_PATH;
  }
  if (values['memory-path'] !== undefined) {
    memoryPath = values['memory-path'];
  }
  if (memoryPath !== undefined) {
    override.memory = { path: memoryPath };
  }

  const readRoots = resolveRootList(env.ATLAS_ALLOW_READ, values['allow-read']);
  const writeRoots = resolveRootList(env.ATLAS_ALLOW_WRITE, values['allow-write']);
  // ATLAS_ALLOW_NET é lista por vírgula, não por path.delimiter — hostname
  // não é caminho de arquivo (ADR-0026(c)/D14).
  const netRoots = resolveRootList(env.ATLAS_ALLOW_NET, values['allow-net'], ',');
  if (readRoots !== undefined || writeRoots !== undefined || netRoots !== undefined) {
    const permissions: {
      readRoots?: readonly string[];
      writeRoots?: readonly string[];
      netRoots?: readonly string[];
    } = {};
    if (readRoots !== undefined) {
      permissions.readRoots = readRoots;
    }
    if (writeRoots !== undefined) {
      permissions.writeRoots = writeRoots;
    }
    if (netRoots !== undefined) {
      permissions.netRoots = netRoots;
    }
    override.permissions = permissions;
  }

  const model: Partial<ModelGatewayConfig> = {};
  // env
  if (env.ATLAS_MODEL_PROVIDER !== undefined) {
    model.provider = env.ATLAS_MODEL_PROVIDER as ProviderName;
  }
  if (env.ATLAS_MODEL !== undefined) {
    model.model = env.ATLAS_MODEL;
  }
  if (env.ATLAS_MODEL_BASE_URL !== undefined) {
    model.baseUrl = env.ATLAS_MODEL_BASE_URL;
  }
  if (env.ATLAS_MODEL_API_KEY !== undefined) {
    model.apiKey = env.ATLAS_MODEL_API_KEY;
  }
  // flags
  if (values.provider !== undefined) {
    model.provider = values.provider as ProviderName;
  }
  if (values.model !== undefined) {
    model.model = values.model;
  }
  if (values['base-url'] !== undefined) {
    model.baseUrl = values['base-url'];
  }
  if (values['api-key'] !== undefined) {
    model.apiKey = values['api-key'];
  }

  if (Object.keys(model).length > 0) {
    override.model = model;
  }

  // Precedência flag > env (ATLAS_SEARCH_URL); repassado cru — validação no
  // core (ADR-0006, D22). Não repetível: é um endpoint, não uma lista.
  let searchUrl: string | undefined;
  if (env.ATLAS_SEARCH_URL !== undefined) {
    searchUrl = env.ATLAS_SEARCH_URL;
  }
  if (values['search-url'] !== undefined) {
    searchUrl = values['search-url'];
  }
  if (searchUrl !== undefined) {
    override.tools = { searchUrl };
  }

  return override;
}

const PERSONA_SUBCOMMANDS = ['list', 'show', 'create', 'edit', 'delete'] as const;
type PersonaSubcommand = (typeof PERSONA_SUBCOMMANDS)[number];

function isPersonaSubcommand(value: string): value is PersonaSubcommand {
  return (PERSONA_SUBCOMMANDS as readonly string[]).includes(value);
}

/**
 * Flags de campo da família `persona` (SPEC-0044/§2): `true` se qualquer
 * uma apareceu na invocação, usado para detectar uso incoerente
 * (`list`/`show`/`delete` combinadas com flags de campo).
 */
function hasAnyPersonaFieldFlag(values: CliValues): boolean {
  return (
    values.name !== undefined ||
    values.tone !== undefined ||
    values.formality !== undefined ||
    values.language !== undefined ||
    values.style !== undefined ||
    values.voice !== undefined ||
    values.emotion !== undefined ||
    values['voice-uri'] !== undefined ||
    values.rule !== undefined
  );
}

/**
 * Monta o patch **parcial e literal** do que o usuário informou (SPEC-0044,
 * Decisão D3): cada chave só existe se a flag correspondente apareceu —
 * sem defaults, sem preenchimento. `--rule` repetível vira
 * `communicationRules` (substituição, nunca merge), com segmentos
 * vazios/só-espaço filtrados; `--rule ""` isolado colapsa para `[]`
 * (chave presente = "limpar", distinto de "não informado").
 */
function resolvePersonaFieldPatch(values: CliValues): PersonaFieldPatch {
  return {
    ...(values.name !== undefined ? { name: values.name } : {}),
    ...(values.tone !== undefined ? { tone: values.tone } : {}),
    ...(values.formality !== undefined ? { formality: values.formality } : {}),
    ...(values.language !== undefined ? { language: values.language } : {}),
    ...(values.style !== undefined ? { style: values.style } : {}),
    ...(values.voice !== undefined ? { voice: values.voice } : {}),
    ...(values.emotion !== undefined ? { emotion: values.emotion } : {}),
    ...(values['voice-uri'] !== undefined ? { voiceURI: values['voice-uri'] } : {}),
    ...(values.rule !== undefined ? { communicationRules: filterNonEmpty(values.rule) } : {}),
  };
}

function parseArgvOrThrow(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        'log-level': { type: 'string' },
        'data-dir': { type: 'string' },
        persona: { type: 'string' },
        'memory-path': { type: 'string' },
        'allow-read': { type: 'string', multiple: true },
        'allow-write': { type: 'string', multiple: true },
        'allow-net': { type: 'string', multiple: true },
        'search-url': { type: 'string' },
        provider: { type: 'string' },
        model: { type: 'string' },
        'base-url': { type: 'string' },
        'api-key': { type: 'string' },
        apply: { type: 'boolean' },
        category: { type: 'string' },
        subject: { type: 'string' },
        name: { type: 'string' },
        tone: { type: 'string' },
        formality: { type: 'string' },
        language: { type: 'string' },
        style: { type: 'string' },
        voice: { type: 'string' },
        emotion: { type: 'string' },
        'voice-uri': { type: 'string' },
        rule: { type: 'string', multiple: true },
        yes: { type: 'boolean' },
      },
    });
  } catch (cause) {
    throw new CliUsageError(cause instanceof Error ? cause.message : String(cause));
  }
}

export function createCliInputGateway(): InputGateway {
  return {
    normalize(argv, env) {
      const { values, positionals } = parseArgvOrThrow(argv);

      // --help / --version têm prioridade sobre qualquer positional.
      if (values.help === true) {
        return { command: 'help', configOverride: {} };
      }
      if (values.version === true) {
        return { command: 'version', configOverride: {} };
      }

      // Sem argumentos ⇒ ajuda.
      if (positionals.length === 0) {
        return { command: 'help', configOverride: {} };
      }

      const command = positionals[0];

      if (command === 'status') {
        return { command: 'status', configOverride: resolveConfigOverride(values, env) };
      }

      if (command === 'ask') {
        const objective = positionals[1];
        if (objective === undefined || objective.trim() === '') {
          throw new CliUsageError('o comando "ask" exige um objetivo: atlas ask "<objetivo>"');
        }
        return { command: 'ask', configOverride: resolveConfigOverride(values, env), objective };
      }

      if (command === 'remember') {
        const text = positionals[1];
        if (text === undefined || text.trim() === '') {
          throw new CliUsageError('o comando "remember" exige um fato: atlas remember "<fato>"');
        }
        const { factCategory, factSubject } = resolveFactCategoryAndSubject(values);
        return {
          command: 'remember',
          configOverride: resolveConfigOverride(values, env),
          factText: text,
          ...(factCategory !== undefined ? { factCategory } : {}),
          ...(factSubject !== undefined ? { factSubject } : {}),
        };
      }

      if (command === 'forget') {
        const id = positionals[1];
        if (id === undefined || id.trim() === '') {
          throw new CliUsageError('o comando "forget" exige um id: atlas forget <id>');
        }
        return {
          command: 'forget',
          configOverride: resolveConfigOverride(values, env),
          factId: id,
        };
      }

      if (command === 'memory') {
        const sub = positionals[1];
        if (sub !== undefined && sub !== 'list' && sub !== 'dedupe' && sub !== 'search') {
          throw new CliUsageError(
            `subcomando de memory desconhecido: ${sub} (use: atlas memory list|dedupe|search)`,
          );
        }
        if (sub === 'search') {
          const query = positionals[2];
          if (query === undefined || query.trim() === '') {
            throw new CliUsageError(
              'o comando "memory search" exige uma consulta: atlas memory search "<consulta>"',
            );
          }
          return {
            command: 'memory',
            configOverride: resolveConfigOverride(values, env),
            memorySubcommand: 'search',
            searchQuery: query,
          };
        }
        const rawCategory = values.category;
        if (rawCategory !== undefined && !isMemoryCategory(rawCategory)) {
          throw new CliUsageError(
            `--category desconhecida: ${rawCategory} (use: fact|episode|project)`,
          );
        }
        return {
          command: 'memory',
          configOverride: resolveConfigOverride(values, env),
          memorySubcommand: sub === 'dedupe' ? 'dedupe' : 'list',
          apply: values.apply === true,
          ...(rawCategory !== undefined ? { listCategory: rawCategory } : {}),
        };
      }

      if (command === 'chat') {
        return { command: 'chat', configOverride: resolveConfigOverride(values, env) };
      }

      if (command === 'skills') {
        const sub = positionals[1];
        if (sub !== undefined && sub !== 'list' && sub !== 'build') {
          throw new CliUsageError(
            `subcomando de skills desconhecido: ${sub} (use: atlas skills list|build)`,
          );
        }
        if (sub === 'build') {
          const capability = positionals[2];
          if (capability === undefined || capability.trim() === '') {
            throw new CliUsageError(
              'o comando "skills build" exige uma capacidade: atlas skills build "<capacidade>"',
            );
          }
          return {
            command: 'skills',
            configOverride: resolveConfigOverride(values, env),
            skillsSubcommand: 'build',
            capability,
          };
        }
        return {
          command: 'skills',
          configOverride: resolveConfigOverride(values, env),
          skillsSubcommand: 'list',
        };
      }

      if (command === 'persona') {
        const sub = positionals[1];
        if (sub !== undefined && !isPersonaSubcommand(sub)) {
          throw new CliUsageError(
            `subcomando de persona desconhecido: ${sub} (use: atlas persona list|show|create|edit|delete)`,
          );
        }
        const personaSubcommand: PersonaSubcommand = sub !== undefined ? sub : 'list';
        const yesUsed = values.yes === true;

        if (personaSubcommand === 'create') {
          const name = positionals[2];
          if (name === undefined || name.trim() === '') {
            throw new CliUsageError(
              'o comando "persona create" exige um nome: atlas persona create "<nome>"',
            );
          }
          if (values.name !== undefined) {
            throw new CliUsageError(
              'o nome de "persona create" é o positional, não --name: atlas persona create "<nome>"',
            );
          }
          if (yesUsed) {
            throw new CliUsageError('--yes só é válido com "persona delete"');
          }
          return {
            command: 'persona',
            configOverride: resolveConfigOverride(values, env),
            personaSubcommand: 'create',
            personaName: name,
            personaFields: resolvePersonaFieldPatch(values),
          };
        }

        if (personaSubcommand === 'edit') {
          const id = positionals[2];
          if (id === undefined || id.trim() === '') {
            throw new CliUsageError(
              'o comando "persona edit" exige um id: atlas persona edit <id>',
            );
          }
          if (yesUsed) {
            throw new CliUsageError('--yes só é válido com "persona delete"');
          }
          const personaFields = resolvePersonaFieldPatch(values);
          if (Object.keys(personaFields).length === 0) {
            throw new CliUsageError(
              'nada a alterar: informe ao menos um campo (--name/--tone/--formality/--language/' +
                '--style/--voice/--emotion/--voice-uri/--rule)',
            );
          }
          return {
            command: 'persona',
            configOverride: resolveConfigOverride(values, env),
            personaSubcommand: 'edit',
            personaId: id,
            personaFields,
          };
        }

        if (personaSubcommand === 'delete') {
          const id = positionals[2];
          if (id === undefined || id.trim() === '') {
            throw new CliUsageError(
              'o comando "persona delete" exige um id: atlas persona delete <id>',
            );
          }
          if (hasAnyPersonaFieldFlag(values)) {
            throw new CliUsageError('flags de campo não são válidas com "persona delete"');
          }
          return {
            command: 'persona',
            configOverride: resolveConfigOverride(values, env),
            personaSubcommand: 'delete',
            personaId: id,
            personaAssumeYes: yesUsed,
          };
        }

        // list | show
        if (hasAnyPersonaFieldFlag(values)) {
          throw new CliUsageError(
            `flags de campo não são válidas com "persona ${personaSubcommand}"`,
          );
        }
        if (yesUsed) {
          throw new CliUsageError('--yes só é válido com "persona delete"');
        }

        if (personaSubcommand === 'show') {
          const id = positionals[2];
          if (id === undefined || id.trim() === '') {
            throw new CliUsageError(
              'o comando "persona show" exige um id: atlas persona show <id>',
            );
          }
          return {
            command: 'persona',
            configOverride: resolveConfigOverride(values, env),
            personaSubcommand: 'show',
            personaId: id,
          };
        }

        return {
          command: 'persona',
          configOverride: resolveConfigOverride(values, env),
          personaSubcommand: 'list',
        };
      }

      throw new CliUsageError(`comando desconhecido: ${String(command)}`);
    },
  };
}
