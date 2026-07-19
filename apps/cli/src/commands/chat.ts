import { AtlasError, type AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';
import type { LineReader } from '../gateway/line-reader.js';
import { renderLearned, renderSteps } from '../gateway/steps-trace.js';

const EXIT_COMMANDS = new Set(['/sair', '/exit']);

export async function runChat(
  atlas: AtlasPlatform,
  output: OutputGateway,
  lineReader: LineReader,
): Promise<void> {
  output.write(`${atlas.persona.name}: olá! Como posso ajudar?\n`);
  const session = atlas.context.openSession(atlas.cognitive.startConversation());
  try {
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
        const turn = await atlas.cognitive.respond(atlas.context.getConversation(session), input);
        renderSteps(turn.steps, output);
        output.write(`${turn.reply}\n`);
        atlas.context.updateConversation(session, turn.conversation);
        // Etapa 6 (Aprendizado, SPEC-0020/ADR-0016): grava e anuncia, por turno.
        for (const fact of turn.learned ?? []) {
          await atlas.memory.remember(fact, 'learned');
          renderLearned(fact, output);
        }
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
  } finally {
    atlas.context.closeSession(session);
  }
}
