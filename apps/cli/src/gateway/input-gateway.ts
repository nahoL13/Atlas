import { parseArgs } from 'node:util';
import type {
  AtlasConfigOverride,
  LogLevel,
  ModelGatewayConfig,
  ProviderName,
} from '@atlas/contracts';

export interface ParsedInput {
  command: 'status' | 'help' | 'version' | 'ask' | 'chat';
  configOverride: AtlasConfigOverride;
  objective?: string;
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
  provider?: string | undefined;
  model?: string | undefined;
  'base-url'?: string | undefined;
  'api-key'?: string | undefined;
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

  // Camada flags (maior precedência).
  if (values['log-level'] !== undefined) {
    override.logLevel = values['log-level'] as LogLevel;
  }
  if (values['data-dir'] !== undefined) {
    override.dataDir = values['data-dir'];
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
        provider: { type: 'string' },
        model: { type: 'string' },
        'base-url': { type: 'string' },
        'api-key': { type: 'string' },
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

      if (command === 'chat') {
        return { command: 'chat', configOverride: resolveConfigOverride(values, env) };
      }

      throw new CliUsageError(`comando desconhecido: ${String(command)}`);
    },
  };
}
