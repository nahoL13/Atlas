import { InvalidConfigError } from '@atlas/contracts';
import { createAtlas } from '@atlas/core';
import { runStatus } from './commands/status.js';
import { CliUsageError } from './gateway/input-gateway.js';
import type { InputGateway, ParsedInput } from './gateway/input-gateway.js';
import type { OutputGateway } from './gateway/output-gateway.js';

export interface CliGateways {
  input: InputGateway;
  output: OutputGateway;
}

const HELP_TEXT = `Usage: atlas <command> [options]

Commands:
  status               Mostra o estado da plataforma e a config resolvida

Options:
  -h, --help           Mostra esta ajuda
  -v, --version        Mostra a versão
      --log-level <l>  Sobrepõe o nível de log (silent|error|info|debug)
      --data-dir <p>   Sobrepõe o diretório de dados
`;

export async function run(
  argv: string[],
  env: NodeJS.ProcessEnv,
  gateways: CliGateways,
  version: string,
): Promise<number> {
  const { input, output } = gateways;

  let parsed: ParsedInput;
  try {
    parsed = input.normalize(argv, env);
  } catch (cause) {
    if (cause instanceof CliUsageError) {
      output.error(`${cause.message}\n\n${HELP_TEXT}`);
      return 2;
    }
    throw cause;
  }

  if (parsed.command === 'help') {
    output.write(HELP_TEXT);
    return 0;
  }
  if (parsed.command === 'version') {
    output.write(`${version}\n`);
    return 0;
  }

  try {
    const atlas = await createAtlas({ config: parsed.configOverride });
    runStatus(atlas, output);
    await atlas.shutdown();
    return 0;
  } catch (cause) {
    if (cause instanceof InvalidConfigError) {
      output.error(
        `Configuração inválida:\n${cause.issues.map((issue) => `  - ${issue}`).join('\n')}\n`,
      );
      return 1;
    }
    throw cause;
  }
}
