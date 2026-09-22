import { AtlasError, InvalidConfigError } from '@atlas/contracts';
import {
  createAtlas,
  createDependencyManager,
  resolveDependencyConfig,
  type DependencyManager,
  type DependencyOutcome,
} from '@atlas/core';
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
  /**
   * `DependencyManager` injetável (SPEC-0060, Escopo 4.2) — default
   * `createDependencyManager()`. Nunca reutilizado entre invocações; a CLI
   * cria uma instância nova por chamada de `run()` e nunca chama
   * `release()` (ADR-0027(e)).
   */
  dependencies?: DependencyManager;
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
      --allow-net <h>  Host permitido para as Tools http_get/web_search (repetível;
                       default: nenhum). ATLAS_ALLOW_NET aceita lista separada por
                       vírgula (não path.delimiter — hostname não é caminho)
      --search-url <u> Endpoint do provedor de busca (compatível com a API JSON do
                       SearXNG), habilita a Tool web_search. ATLAS_SEARCH_URL faz o
                       mesmo papel (não repetível). O host do endpoint também precisa
                       estar em --allow-net/ATLAS_ALLOW_NET, senão o passo é negado.
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
      --auto-start-ollama  Liga a auto-gerência do Ollama: se ele não estiver
                       acessível, o Atlas tenta subir "ollama serve" uma vez
                       por processo (nunca instala nem baixa o binário).
                       ATLAS_AUTO_START_OLLAMA faz o mesmo papel (aceita
                       1/true/yes/on ou 0/false/no/off, qualquer caixa).
      --auto-start-search-container <nome>  Liga a auto-gerência do container
                       Docker do provedor de busca: se ele existir e estiver
                       parado, o Atlas liga (docker start) esse container uma
                       vez por processo. O Atlas NUNCA cria, baixa ou remove
                       containers — um nome desconhecido é reportado como
                       falha, não um convite a provisionar.
                       ATLAS_AUTO_START_SEARCH_CONTAINER faz o mesmo papel
                       (não repetível). O host do endpoint de busca continua
                       precisando de --allow-net/ATLAS_ALLOW_NET.
`;

/**
 * Mensagem amigável para `AtlasError` code `ATLAS_PERSONA` (SPEC-0044/D10):
 * a mensagem do módulo já cita o caminho do arquivo (`persona-storage.ts`);
 * aqui só se acrescenta a saída de emergência, para os três caminhos que a
 * exercitam (`persona list`/`status`/`ask`, todos leem o arquivo de
 * Personas no arranque desde que `personaStorage` passou a ser injetado em
 * todo `createAtlas`).
 */
/**
 * Avisos de auto-start do Ollama (SPEC-0060, Decisão D13): textos pinados,
 * stderr, e só nos desfechos `'started'`/`'failed'` — `'disabled'`/
 * `'already-running'` são silenciosos. Nenhuma mensagem interpola stderr do
 * processo externo (Restrição 8).
 */
function formatOllamaWarning(
  outcome: Extract<DependencyOutcome, { dependency: 'ollama' }>,
  ollamaBaseUrl: string,
): string | undefined {
  if (outcome.status === 'started') {
    return 'Ollama iniciado automaticamente pelo Atlas.\n';
  }
  if (outcome.status !== 'failed') {
    return undefined;
  }
  if (outcome.reason === 'binary-missing') {
    return (
      'Não foi possível iniciar o Ollama automaticamente: binário "ollama" não encontrado no ' +
      'PATH. Seguindo sem auto-start.\n'
    );
  }
  if (outcome.reason === 'spawn-failed') {
    return (
      'Não foi possível iniciar o Ollama automaticamente: falha ao iniciar o processo. ' +
      'Seguindo sem auto-start.\n'
    );
  }
  return (
    `Não foi possível iniciar o Ollama automaticamente: sem resposta em ${ollamaBaseUrl} após ` +
    '10s. Seguindo sem auto-start.\n'
  );
}

/**
 * Avisos de auto-start do container de busca (SPEC-0061, Decisão D12):
 * textos pinados, stderr, só nos desfechos `'started'`/`'failed'` —
 * `'disabled'`/`'already-running'` são silenciosos. Nunca interpola
 * stdout/stderr do `docker` (Restrição 9) — só o nome do container, já
 * normalizado e validado.
 */
function formatSearchContainerWarning(
  outcome: Extract<DependencyOutcome, { dependency: 'search-container' }>,
): string | undefined {
  if (outcome.status === 'started') {
    return `Container de busca "${outcome.container}" iniciado automaticamente pelo Atlas.\n`;
  }
  if (outcome.status !== 'failed') {
    return undefined;
  }
  if (outcome.reason === 'docker-unavailable') {
    return (
      `Não foi possível iniciar o container de busca "${outcome.container}": o Docker não ` +
      'respondeu — binário "docker" não encontrado, não executável, ou daemon sem resposta ' +
      'dentro do tempo limite. Seguindo sem auto-start.\n'
    );
  }
  if (outcome.reason === 'container-unknown') {
    return (
      `Não foi possível iniciar o container de busca "${outcome.container}": o Docker não ` +
      'reconheceu esse container (inexistente ou daemon inacessível). O Atlas nunca cria ' +
      'containers. Seguindo sem auto-start.\n'
    );
  }
  if (outcome.reason === 'start-failed') {
    return (
      `Não foi possível iniciar o container de busca "${outcome.container}": o Docker recusou ` +
      'o start. Seguindo sem auto-start.\n'
    );
  }
  return (
    `Não foi possível iniciar o container de busca "${outcome.container}": não ficou em ` +
    'execução após 5s. Seguindo sem auto-start.\n'
  );
}

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

  // Auto-start do Ollama (SPEC-0060, Decisão D7): ÚNICO ponto de disparo por
  // processo — depois dos desvios de help/version/persona, imediatamente
  // antes de `createAtlas`. `ensure()` nunca lança (ADR-0027(f)); a CLI
  // NUNCA chama `release()` (ADR-0027(e), CA 17).
  const dependencyManager = deps.dependencies ?? createDependencyManager();
  const dependencyConfig = resolveDependencyConfig(parsed.configOverride);
  const dependencyReport = await dependencyManager.ensure(dependencyConfig);
  for (const outcome of dependencyReport.outcomes) {
    // Narrowing por `dependency` (SPEC-0061): sem isso, um desfecho
    // 'started' do container imprimiria o texto do Ollama, e vice-versa.
    const warning =
      outcome.dependency === 'ollama'
        ? formatOllamaWarning(outcome, dependencyConfig.ollamaBaseUrl)
        : formatSearchContainerWarning(outcome);
    if (warning !== undefined) {
      output.error(warning);
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
          runStatus(atlas, output, dependencyReport);
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
