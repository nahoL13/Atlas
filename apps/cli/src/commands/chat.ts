import { AtlasError, type AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';
import type { LineReader } from '../gateway/line-reader.js';

const EXIT_COMMANDS = new Set(['/sair', '/exit']);

export async function runChat(
  atlas: AtlasPlatform,
  output: OutputGateway,
  lineReader: LineReader,
): Promise<void> {
  let conversation = atlas.cognitive.startConversation();

  for (;;) {
    const line = await lineReader.next('> ');
    if (line === null) {
      break;
    }
    const input = line.trim();
    if (input === '') {
      continue;
    }
    if (EXIT_COMMANDS.has(input)) {
      break;
    }

    try {
      const turn = await atlas.cognitive.respond(conversation, input);
      output.write(`${turn.reply}\n`);
      conversation = turn.conversation;
    } catch (cause) {
      if (cause instanceof AtlasError && cause.code === 'ATLAS_MODEL_GATEWAY') {
        output.error(
          `Não foi possível obter resposta do modelo: ${cause.message}\n` +
            `Se estiver usando o provedor local, verifique se o Ollama está rodando ` +
            `(ollama serve) e se o modelo foi baixado (ollama pull <model>).\n`,
        );
        continue;
      }
      throw cause;
    }
  }
}
