import { AtlasError, InvalidConfigError } from '@atlas/contracts';
import { createAtlas } from '@atlas/core';
import { runStatus } from './commands/status.js';
import { runAsk } from './commands/ask.js';
import { runChat } from './commands/chat.js';
import { runRemember } from './commands/remember.js';
import { runForget } from './commands/forget.js';
import { runMemoryList, runMemoryDedupe, runMemorySearch } from './commands/memory.js';
import { runSkillsList, runSkillsBuild } from './commands/skills.js';
import {
  runPersonaCreate,
  runPersonaDelete,
  runPersonaEdit,
  runPersonaList,
  runPersonaShow,
} from './commands/persona.js';
import { CliUsageError } from './gateway/input-gateway.js';
import { createReadlineLineReader } from './gateway/line-reader.js';
import { createLineReaderConfirmPort } from './gateway/confirm-port.js';
import { createCliPersonaService, createCliPersonaStorage } from './gateway/persona-composition.js';
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
                       (ou episódio/memória de projeto — ver --category/--subject)
  forget <id>          Remove um fato memorizado
  memory list [--category <c>]  Lista os fatos memorizados, com filtro opcional
  memory dedupe [--apply]  Consolida duplicatas do acervo (dry-run por default)
  memory search "<consulta>"  Busca fatos relevantes à consulta
  skills list          Lista o catálogo de Skills (id, nome, scope, ativo/inativo, versão)
  skills build "<capacidade>"  Constrói uma Skill temporária para a capacidade descrita
  persona list          Lista as Personas (embutidas e custom)
  persona show <id>     Mostra os campos de uma Persona
  persona create "<nome>" [flags]  Cria uma Persona custom
  persona edit <id> [flags]        Edita campos de uma Persona custom (patch)
  persona delete <id> [--yes]      Apaga uma Persona custom (pede confirmação)

Options:
  -h, --help           Mostra esta ajuda
  -v, --version        Mostra a versão
      --log-level <l>  Sobrepõe o nível de log (silent|error|info|debug)
      --data-dir <p>   Sobrepõe o diretório de dados
      --persona <id>   Persona ativa (jarvis|neutral|<id custom>)
      --memory-path <p> Caminho do arquivo de memória
      --allow-read <p> Diretório permitido para leitura (repetível; default: cwd).
                       ATLAS_ALLOW_READ aceita lista separada por
                       path.delimiter do SO (":" no POSIX, ";" no Windows)
      --allow-write <p> Diretório permitido para escrita (repetível; default: nenhum).
                       ATLAS_ALLOW_WRITE aceita lista separada por
                       path.delimiter do SO (":" no POSIX, ";" no Windows)
      --allow-net <h>  Host permitido para a Tool http_get (repetível; default: nenhum).
                       ATLAS_ALLOW_NET aceita lista separada por vírgula
                       (não path.delimiter — hostname não é caminho)
      --category <c>   Categoria de memória (fact|episode|project) para
                       "remember" e filtro para "memory list"
      --subject <p>    Projeto ao qual a memória pertence (exige
                       --category project)
      --provider <p>   Provedor de modelo (local|remote|fake)
      --model <m>      Nome do modelo
      --base-url <u>   Base URL do provedor de modelo
      --api-key <k>    API key do provedor remoto
      --name <n>       Nome (persona edit — renomeia; persona create usa o
                       positional "<nome>", não esta flag)
      --tone <t>       Tom da Persona (persona create/edit)
      --formality <f>  Formalidade da Persona (persona create/edit)
      --language <l>   Idioma da Persona (persona create/edit)
      --style <s>      Estilo da Persona (persona create/edit)
      --voice <v>      Descrição de voz (slot inerte; persona create/edit)
      --emotion <e>    Emoção (slot inerte; persona create/edit)
      --voice-uri <u>  Voz vinculada à Persona: "piper:<id>" (motor Piper) ou
                       o voiceURI de uma voz do SO. A CLI aceita e guarda o
                       valor sem validar — nenhum comando da CLI reproduz
                       áudio. Na janela do desktop, com Piper disponível
                       (política Piper-only), uma voz do SO vinculada não é
                       honrada ali; sem Piper disponível, a janela volta a
                       usar vozes do SO normalmente. "" limpa o voiceURI de
                       uma Persona (persona edit).
      --rule <r>       Regra de comunicação (repetível; substitui a lista
                       inteira; persona create/edit; "" isolado limpa)
      --yes            Pula a confirmação de "persona delete"
`;

/**
 * Mensagem amigável para `AtlasError` code `ATLAS_PERSONA` (SPEC-0044/D10):
 * a mensagem do módulo já cita o caminho do arquivo (`persona-storage.ts`);
 * aqui só se acrescenta a saída de emergência, para os três caminhos que a
 * exercitam (`persona list`/`status`/`ask`, todos leem o arquivo de
 * Personas no arranque desde que `personaStorage` passou a ser injetado em
 * todo `createAtlas`).
 */
function formatPersonaError(cause: AtlasError): string {
  return (
    `${cause.message}\n` +
    'Corrija ou remova o arquivo indicado acima, ou aponte outro diretório de dados ' +
    '(--data-dir <caminho> ou ATLAS_DATA_DIR).\n'
  );
}

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

  // Os subcomandos de `persona` desviam ANTES de `createAtlas` (SPEC-0044,
  // Decisão D5): compõem só o `PersonaService` (via
  // `createCliPersonaService`, mesma via de composição que a D10 usa dentro
  // de `createAtlas` — nunca dois storages vivos numa mesma invocação).
  // Subir o Core exigiria `loadConfig`, reabrindo o deadlock B1 corrigido
  // pela SPEC-0039/D17: um `ATLAS_PERSONA` órfão não pode impedir listar ou
  // recriar Personas pela própria CLI.
  if (parsed.command === 'persona') {
    const personaLineReader =
      parsed.personaSubcommand === 'delete' && parsed.personaAssumeYes !== true
        ? (deps.createLineReader ?? createReadlineLineReader)()
        : undefined;
    try {
      try {
        const personaService = createCliPersonaService(parsed.configOverride);
        if (parsed.personaSubcommand === 'show') {
          runPersonaShow(personaService, parsed.personaId ?? '', output);
        } else if (parsed.personaSubcommand === 'create') {
          runPersonaCreate(
            personaService,
            parsed.personaName ?? '',
            parsed.personaFields ?? {},
            output,
          );
        } else if (parsed.personaSubcommand === 'edit') {
          runPersonaEdit(
            personaService,
            parsed.personaId ?? '',
            parsed.personaFields ?? {},
            output,
          );
        } else if (parsed.personaSubcommand === 'delete') {
          const deleted = await runPersonaDelete(personaService, parsed.personaId ?? '', output, {
            assumeYes: parsed.personaAssumeYes ?? false,
            ...(personaLineReader !== undefined ? { lineReader: personaLineReader } : {}),
            ...(parsed.configOverride.persona !== undefined
              ? { activePersonaId: parsed.configOverride.persona }
              : {}),
          });
          return deleted ? 0 : 1;
        } else {
          runPersonaList(personaService, output);
        }
        return 0;
      } catch (cause) {
        if (cause instanceof AtlasError && cause.code === 'ATLAS_PERSONA') {
          output.error(formatPersonaError(cause));
          return 1;
        }
        throw cause;
      }
    } finally {
      personaLineReader?.close();
    }
  }

  // Para `chat`, o LineReader nasce antes do core: o ConfirmPort injetado no
  // Runtime (via CreateAtlasDeps.confirm) precisa reusá-lo, para que a
  // confirmação de ações destrutivas apareça inline na conversa sem abrir um
  // segundo `readline` sobre o mesmo stdin.
  const chatLineReader =
    parsed.command === 'chat' ? (deps.createLineReader ?? createReadlineLineReader)() : undefined;

  try {
    try {
      const atlas = await createAtlas(
        { config: parsed.configOverride },
        {
          ...(deps.fetch !== undefined ? { fetch: deps.fetch } : {}),
          // SPEC-0044/D10: injetado em TODO comando (não só nos de
          // `persona`), para que `--persona <id-custom>`/`ATLAS_PERSONA`
          // resolvam em `status`/`ask`/`chat`/etc. Custo assumido: o
          // arranque de qualquer comando passa a ler o arquivo de Personas.
          personaStorage: createCliPersonaStorage(parsed.configOverride),
          ...(chatLineReader !== undefined
            ? { confirm: createLineReaderConfirmPort(chatLineReader) }
            : {}),
        },
      );
      try {
        if (parsed.command === 'ask') {
          await runAsk(atlas, parsed.objective ?? '', output);
        } else if (parsed.command === 'chat') {
          await runChat(atlas, output, chatLineReader!);
        } else if (parsed.command === 'remember') {
          await runRemember(atlas, parsed.factText ?? '', output, {
            ...(parsed.factCategory !== undefined ? { category: parsed.factCategory } : {}),
            ...(parsed.factSubject !== undefined ? { subject: parsed.factSubject } : {}),
          });
        } else if (parsed.command === 'forget') {
          await runForget(atlas, parsed.factId ?? '', output);
        } else if (parsed.command === 'memory') {
          if (parsed.memorySubcommand === 'dedupe') {
            await runMemoryDedupe(atlas, parsed.apply ?? false, output);
          } else if (parsed.memorySubcommand === 'search') {
            runMemorySearch(atlas, parsed.searchQuery ?? '', output);
          } else {
            runMemoryList(
              atlas,
              output,
              parsed.listCategory !== undefined ? { category: parsed.listCategory } : undefined,
            );
          }
        } else if (parsed.command === 'skills') {
          if (parsed.skillsSubcommand === 'build') {
            await runSkillsBuild(atlas, parsed.capability ?? '', output);
          } else {
            runSkillsList(atlas, output);
          }
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
      // Raio de alcance da D10: um arquivo de Personas corrompido é lido
      // no arranque de `createAtlas` (Persona Service é composto antes do
      // `loadConfig`, `packages/core/src/index.ts`) e derruba qualquer
      // comando, não só `atlas persona`.
      if (cause instanceof AtlasError && cause.code === 'ATLAS_PERSONA') {
        output.error(formatPersonaError(cause));
        return 1;
      }
      throw cause;
    }
  } finally {
    chatLineReader?.close();
  }
}
