import { parseArgs } from 'node:util';
import path from 'node:path';
import type {
  AtlasConfigOverride,
  LogLevel,
  ModelGatewayConfig,
  ProviderName,
} from '@atlas/contracts';

export interface ParsedInput {
  command:
    'status' | 'help' | 'version' | 'ask' | 'chat' | 'remember' | 'forget' | 'memory' | 'skills';
  configOverride: AtlasConfigOverride;
  objective?: string;
  factText?: string;
  factId?: string;
  memorySubcommand?: 'list' | 'dedupe' | 'search';
  apply?: boolean;
  searchQuery?: string;
  skillsSubcommand?: 'list' | 'build';
  capability?: string;
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
  provider?: string | undefined;
  model?: string | undefined;
  'base-url'?: string | undefined;
  'api-key'?: string | undefined;
  apply?: boolean | undefined;
}

function filterNonEmpty(segments: readonly string[]): string[] {
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

/**
 * Resolve a lista final de raízes (read ou write) a partir da env (string
 * separada por `path.delimiter`) e da flag repetível (`string[]`), aplicando
 * a precedência `flag > env` por **substituição** (nunca merge) e tratando o
 * colapso de qualquer fonte para uma lista vazia como "não fornecida".
 */
function resolveRootList(
  envValue: string | undefined,
  flagValue: string[] | undefined,
): string[] | undefined {
  const fromFlag = flagValue !== undefined ? filterNonEmpty(flagValue) : undefined;
  if (fromFlag !== undefined && fromFlag.length > 0) {
    return fromFlag;
  }

  const fromEnv =
    envValue !== undefined ? filterNonEmpty(envValue.split(path.delimiter)) : undefined;
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
  if (readRoots !== undefined || writeRoots !== undefined) {
    const permissions: { readRoots?: readonly string[]; writeRoots?: readonly string[] } = {};
    if (readRoots !== undefined) {
      permissions.readRoots = readRoots;
    }
    if (writeRoots !== undefined) {
      permissions.writeRoots = writeRoots;
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

  return override;
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
        provider: { type: 'string' },
        model: { type: 'string' },
        'base-url': { type: 'string' },
        'api-key': { type: 'string' },
        apply: { type: 'boolean' },
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
        return {
          command: 'remember',
          configOverride: resolveConfigOverride(values, env),
          factText: text,
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
        return {
          command: 'memory',
          configOverride: resolveConfigOverride(values, env),
          memorySubcommand: sub === 'dedupe' ? 'dedupe' : 'list',
          apply: values.apply === true,
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

      throw new CliUsageError(`comando desconhecido: ${String(command)}`);
    },
  };
}
