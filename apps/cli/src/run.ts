import { AtlasError, InvalidConfigError } from '@atlas/contracts';
import { createAtlas } from '@atlas/core';
import { runStatus } from './commands/status.js';
import { runAsk } from './commands/ask.js';
import { runChat } from './commands/chat.js';
import { runRemember } from './commands/remember.js';
import { runForget } from './commands/forget.js';
import { runMemoryList } from './commands/memory.js';
import { CliUsageError } from './gateway/input-gateway.js';
import { createReadlineLineReader } from './gateway/line-reader.js';
import type { InputGateway, ParsedInput } from './gateway/input-gateway.js';
import type { LineReader } from './gateway/line-reader.js';
import type { OutputGateway } from './gateway/output-gateway.js';

export interface CliGateways {
  input: InputGateway;
  output: OutputGateway;
}

export interface CliDeps {
  fetch?: typeof fetch;
  createLineReader?: () => LineReader;
}

const HELP_TEXT = `Usage: atlas <command> [options]

Commands:
  status               Mostra o estado da plataforma e a config resolvida
  ask "<objetivo>"     Envia um objetivo ao núcleo cognitivo e imprime a resposta
  chat                 Abre uma conversa interativa com o núcleo cognitivo
  remember "<fato>"    Grava um fato/preferência persistente
  forget <id>          Remove um fato memorizado
  memory list          Lista os fatos memorizados

Options:
  -h, --help           Mostra esta ajuda
  -v, --version        Mostra a versão
      --log-level <l>  Sobrepõe o nível de log (silent|error|info|debug)
      --data-dir <p>   Sobrepõe o diretório de dados
      --persona <id>   Persona ativa (jarvis|neutral)
      --memory-path <p> Caminho do arquivo de memória
      --provider <p>   Provedor de modelo (local|remote|fake)
      --model <m>      Nome do modelo
      --base-url <u>   Base URL do provedor de modelo
      --api-key <k>    API key do provedor remoto
`;

export async function run(
  argv: string[],
  env: NodeJS.ProcessEnv,
  gateways: CliGateways,
  version: string,
  deps: CliDeps = {},
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
    const atlas = await createAtlas(
      { config: parsed.configOverride },
      deps.fetch !== undefined ? { fetch: deps.fetch } : {},
    );
    try {
      if (parsed.command === 'ask') {
        await runAsk(atlas, parsed.objective ?? '', output);
      } else if (parsed.command === 'chat') {
        const lineReader = (deps.createLineReader ?? createReadlineLineReader)();
        try {
          await runChat(atlas, output, lineReader);
        } finally {
          lineReader.close();
        }
      } else if (parsed.command === 'remember') {
        await runRemember(atlas, parsed.factText ?? '', output);
      } else if (parsed.command === 'forget') {
        await runForget(atlas, parsed.factId ?? '', output);
      } else if (parsed.command === 'memory') {
        runMemoryList(atlas, output);
      } else {
        runStatus(atlas, output);
      }
    } finally {
      await atlas.shutdown();
    }
    return 0;
  } catch (cause) {
    if (cause instanceof InvalidConfigError) {
      output.error(
        `Configuração inválida:\n${cause.issues.map((issue) => `  - ${issue}`).join('\n')}\n`,
      );
      return 1;
    }
    if (cause instanceof AtlasError && cause.code === 'ATLAS_MODEL_GATEWAY') {
      output.error(
        `Não foi possível obter resposta do modelo: ${cause.message}\n` +
          `Se estiver usando o provedor local, verifique se o Ollama está rodando ` +
          `(ollama serve) e se o modelo foi baixado (ollama pull <model>).\n`,
      );
      return 1;
    }
    throw cause;
  }
}
