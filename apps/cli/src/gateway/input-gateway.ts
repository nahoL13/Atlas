import { parseArgs } from 'node:util';
import type { AtlasConfig } from '@atlas/contracts';

export interface ParsedInput {
  command: 'status' | 'help' | 'version';
  configOverride: Partial<AtlasConfig>;
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

function resolveConfigOverride(
  values: { 'log-level'?: string | undefined; 'data-dir'?: string | undefined },
  env: NodeJS.ProcessEnv,
): Partial<AtlasConfig> {
  const override: { logLevel?: AtlasConfig['logLevel']; dataDir?: string } = {};

  // Camada env (menor precedência). Valores crus; o core valida.
  if (env.ATLAS_LOG_LEVEL !== undefined) {
    override.logLevel = env.ATLAS_LOG_LEVEL as AtlasConfig['logLevel'];
  }
  if (env.ATLAS_DATA_DIR !== undefined) {
    override.dataDir = env.ATLAS_DATA_DIR;
  }

  // Camada flags (maior precedência).
  if (values['log-level'] !== undefined) {
    override.logLevel = values['log-level'] as AtlasConfig['logLevel'];
  }
  if (values['data-dir'] !== undefined) {
    override.dataDir = values['data-dir'];
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
      if (command !== 'status') {
        throw new CliUsageError(`comando desconhecido: ${String(command)}`);
      }

      return { command: 'status', configOverride: resolveConfigOverride(values, env) };
    },
  };
}
