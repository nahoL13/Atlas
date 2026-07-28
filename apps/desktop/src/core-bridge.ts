import { createAtlas, createPersonaService } from '@atlas/core';
import type {
  ActionRequest,
  AtlasConfigOverride,
  AtlasPlatform,
  PersonaService,
  SessionId,
} from '@atlas/contracts';
import { formatSteps } from './steps-view.js';
import type { StepLine } from './steps-view.js';

export interface PersonaOption {
  readonly id: string;
  readonly name: string;
}

export interface PersonaSelection {
  readonly personaId: string;
  readonly closedSessions: readonly SessionId[];
}

/**
 * Seleção de Persona em runtime (SPEC-0037, Decisão D3): estado de módulo do
 * `core-bridge` (mesmo molde do `Map` de sessões de chat da SPEC-0033),
 * aplicado como `config.persona` em cada `createAtlas` subsequente. Não é
 * persistida — some ao fechar a app, voltando à Persona resolvida por
 * `flags > env > defaults` (ADR-0006).
 */
let selectedPersona: string | undefined;

/**
 * Rastreio de turno em voo (Decisão D9): `sendChatTurn` marca a sessão como
 * ocupada ao entrar e desmarca em `finally`. É o que permite `selectPersona`
 * recusar a troca sem destruir um turno em andamento nem perder os `learned`
 * daquele turno.
 */
const busySessions = new Set<SessionId>();

/**
 * Catálogo de Personas para exibição/seleção (equivalente GUI do que a CLI
 * resolveria por `--persona`): síncrono, **sem** subir o Core — consulta
 * `PersonaService.list()`/`get(id)` e devolve pares `{ id, name }` planos,
 * serializáveis por IPC. `personaService` é injetável para teste; o default
 * vem do re-export de catálogo de `@atlas/core` (Decisão D4), nunca de
 * `@atlas/persona` diretamente.
 */
export function listPersonas(
  deps: { personaService?: PersonaService } = {},
): readonly PersonaOption[] {
  const personaService = deps.personaService ?? createPersonaService();
  return personaService.list().map((id) => {
    const persona = personaService.get(id);
    return { id: persona.id, name: persona.name };
  });
}

/**
 * Troca a Persona ativa em runtime (Decisões D6/D9): valida o `id` antes de
 * qualquer efeito colateral (fail-closed), recusa enquanto houver turno de
 * chat em voo, e só então registra a seleção e encerra todas as sessões de
 * chat vivas (o `personaPrompt` de um Core já criado é estático — SPEC-0021
 * só recompõe a fatia de memória —, então mantê-las vivas produziria uma
 * janela falando com identidade superada, Artigo 2). Qualquer recusa não
 * altera a seleção nem encerra nada.
 */
export async function selectPersona(
  id: string,
  deps: { personaService?: PersonaService } = {},
): Promise<PersonaSelection> {
  const personaService = deps.personaService ?? createPersonaService();
  if (!personaService.has(id)) {
    throw new Error(`Persona desconhecida: ${id}`);
  }
  if (busySessions.size > 0) {
    throw new Error('Não é possível trocar de Persona: há um turno de chat em andamento.');
  }

  selectedPersona = id;
  const closedSessions: SessionId[] = [];
  for (const session of [...chatSessions.keys()]) {
    closedSessions.push(session);
    await closeChatSession(session);
  }
  return { personaId: id, closedSessions };
}

/** Leitura do estado de módulo: `undefined` enquanto o usuário não trocou. */
export function selectedPersonaId(): string | undefined {
  return selectedPersona;
}

/**
 * Aplica a seleção corrente ao `AtlasConfigOverride` de toda função que sobe
 * o Core — precedência: `configOverride.persona` explícito do chamador
 * **vence** a seleção corrente (Decisão D7).
 */
function withPersonaSelection(configOverride: AtlasConfigOverride): AtlasConfigOverride {
  if (configOverride.persona !== undefined || selectedPersona === undefined) {
    return configOverride;
  }
  return { ...configOverride, persona: selectedPersona };
}

/** Reset explícito do estado de módulo — uso exclusivo dos testes (isolamento entre casos). */
export function __resetPersonaStateForTests(): void {
  selectedPersona = undefined;
  busySessions.clear();
}

export interface StatusSnapshot {
  readonly state: string;
  readonly logLevel: string;
  readonly dataDir: string;
  readonly persona: { readonly id: string; readonly name: string };
  readonly readRoots: readonly string[];
  readonly writeRoots: readonly string[];
}

/**
 * Round-trip mínimo com o Core (análogo ao `runStatus` da CLI): sobe a
 * plataforma via `createAtlas`, lê `state`/`config`/`persona`, desliga e
 * devolve um objeto plano serializável por IPC. Não mantém a plataforma
 * viva entre chamadas nesta fatia.
 */
export async function resolveStatusSnapshot(
  configOverride: AtlasConfigOverride = {},
): Promise<StatusSnapshot> {
  const atlas = await createAtlas({ config: withPersonaSelection(configOverride) });
  try {
    const { state, config, persona } = atlas;
    return {
      state,
      logLevel: config.logLevel,
      dataDir: config.dataDir,
      persona: { id: persona.id, name: persona.name },
      readRoots: [...config.permissions.readRoots],
      writeRoots: [...config.permissions.writeRoots],
    };
  } finally {
    await atlas.shutdown();
  }
}

/**
 * `ConfirmPort` interno ao `@atlas/runtime`, satisfeito estruturalmente
 * (mesmo padrão da CLI): declarado localmente, sem importar `@atlas/runtime`.
 */
export interface ConfirmPort {
  request(action: ActionRequest): Promise<boolean>;
}

export interface AskSnapshot {
  readonly text: string;
  readonly steps: readonly StepLine[];
  readonly learned: readonly string[];
}

/** Default fail-closed: sem `confirm` injetado, nenhuma ação destrutiva é aprovada silenciosamente. */
const fallbackConfirm: ConfirmPort = {
  request: () => Promise.resolve(false),
};

/**
 * Round-trip stateless com o Core (espelho de `resolveStatusSnapshot` e do
 * `runAsk` da CLI): sobe a plataforma via `createAtlas` injetando o
 * `ConfirmPort` recebido, chama `atlas.cognitive.ask`, grava os fatos
 * aprendidos (`atlas.memory.remember(fact, 'learned')`, paridade com
 * `runAsk` — nunca gravação silenciosa), desliga (`finally`) e devolve um
 * `AskSnapshot` plano serializável por IPC. Não mantém a plataforma nem uma
 * `Conversation` viva entre chamadas (isso é 2.2).
 */
export async function resolveAskSnapshot(
  objective: string,
  deps: { confirm?: ConfirmPort; configOverride?: AtlasConfigOverride } = {},
): Promise<AskSnapshot> {
  const { confirm = fallbackConfirm, configOverride = {} } = deps;
  const atlas = await createAtlas({ config: withPersonaSelection(configOverride) }, { confirm });
  try {
    const result = await atlas.cognitive.ask(objective);
    const learned: string[] = [];
    for (const fact of result.learned ?? []) {
      const { created } = await atlas.memory.remember(fact, 'learned');
      if (created) {
        learned.push(fact);
      }
    }
    return {
      text: result.text,
      steps: formatSteps(result.steps),
      learned,
    };
  } finally {
    await atlas.shutdown();
  }
}

export interface TurnSnapshot {
  readonly reply: string;
  readonly steps: readonly StepLine[];
  readonly learned: readonly string[];
}

interface ChatSessionEntry {
  readonly atlas: AtlasPlatform;
}

/**
 * Sessões de chat vivas: chaveadas pela `SessionId` devolvida pelo Context
 * Service (não um identificador próprio) — o Core (`atlas`) permanece vivo
 * entre turnos, até `closeChatSession`/o desligamento da app.
 */
const chatSessions = new Map<SessionId, ChatSessionEntry>();

function mustGetChatSession(session: SessionId): ChatSessionEntry {
  const entry = chatSessions.get(session);
  if (entry === undefined) {
    throw new Error(`Sessão de chat desconhecida ou já encerrada: ${session}`);
  }
  return entry;
}

/**
 * Abre uma sessão de chat viva (equivalente GUI do `atlas chat`): sobe a
 * plataforma **uma vez** via `createAtlas`, injetando o `ConfirmPort`
 * recebido (default fail-closed), abre uma sessão do Context Service com
 * uma conversa fresca e registra a dupla `{ atlas }` chaveada pela
 * `SessionId` devolvida pelo Context. A plataforma permanece viva até
 * `closeChatSession` — diferente de `resolveAskSnapshot`, que sobe e
 * desliga por chamada.
 */
export async function openChatSession(
  deps: { confirm?: ConfirmPort; configOverride?: AtlasConfigOverride } = {},
): Promise<SessionId> {
  const { confirm = fallbackConfirm, configOverride = {} } = deps;
  const atlas = await createAtlas({ config: withPersonaSelection(configOverride) }, { confirm });
  const session = atlas.context.openSession(atlas.cognitive.startConversation());
  chatSessions.set(session, { atlas });
  return session;
}

/**
 * Envia um turno à sessão viva (mediação que o ADR-0009 atribui à
 * aplicação): lê a conversa do Context, chama `respond` puro, grava o
 * histórico de volta e devolve um `TurnSnapshot` plano serializável por
 * IPC. **Não** desliga o Core nem fecha a sessão — mantém tudo vivo para o
 * próximo turno. Se o turno falhar (ex.: `ATLAS_MODEL_GATEWAY`), a sessão
 * permanece aberta (paridade com a resiliência do `runChat`).
 */
export async function sendChatTurn(session: SessionId, input: string): Promise<TurnSnapshot> {
  const { atlas } = mustGetChatSession(session);
  // Marca a sessão como ocupada ANTES do primeiro `await` (Decisão D9): é o
  // que faz `selectPersona` ver o turno em voo mesmo se disparado logo em
  // seguida, sem janela de corrida.
  busySessions.add(session);
  try {
    const turn = await atlas.cognitive.respond(atlas.context.getConversation(session), input);
    atlas.context.updateConversation(session, turn.conversation);
    const learned: string[] = [];
    for (const fact of turn.learned ?? []) {
      const { created } = await atlas.memory.remember(fact, 'learned');
      if (created) {
        learned.push(fact);
      }
    }
    return {
      reply: turn.reply,
      steps: formatSteps(turn.steps),
      learned,
    };
  } finally {
    busySessions.delete(session);
  }
}

/**
 * Encerra a sessão viva: fecha a sessão do Context e desliga o Core
 * (`atlas.shutdown()`, uma vez), removendo o registro. Handle
 * desconhecido/já encerrado ⇒ erro estruturado (nunca vazamento de
 * `undefined`).
 */
export async function closeChatSession(session: SessionId): Promise<void> {
  const { atlas } = mustGetChatSession(session);
  chatSessions.delete(session);
  atlas.context.closeSession(session);
  await atlas.shutdown();
}

export interface FactSnapshot {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly source: string;
  readonly category: string;
  readonly subject?: string;
}

/**
 * Round-trip stateless com o Core (espelho de `resolveStatusSnapshot`, e
 * equivalente GUI de `atlas memory list`/`runMemoryList`): sobe a plataforma
 * via `createAtlas`, lê `atlas.memory.list()`, mapeia cada `Fact` num
 * `FactSnapshot` plano serializável por IPC — resolvendo os mesmos defaults
 * que a CLI resolve na renderização (`source ?? 'user'`, `category ?? 'fact'`)
 * — desliga (`finally`) e devolve a lista. Nunca lê o arquivo de memória
 * diretamente (Artigo 11) — a leitura passa sempre pelo `MemoryService`.
 */
export async function resolveMemorySnapshot(
  deps: { configOverride?: AtlasConfigOverride } = {},
): Promise<readonly FactSnapshot[]> {
  const { configOverride = {} } = deps;
  const atlas = await createAtlas({ config: withPersonaSelection(configOverride) });
  try {
    return atlas.memory.list().map((fact) => ({
      id: fact.id,
      text: fact.text,
      createdAt: fact.createdAt,
      source: fact.source ?? 'user',
      category: fact.category ?? 'fact',
      ...(fact.subject !== undefined ? { subject: fact.subject } : {}),
    }));
  } finally {
    await atlas.shutdown();
  }
}

/**
 * Round-trip stateless com o Core (espelho de `resolveMemorySnapshot`, e
 * equivalente GUI de `atlas forget <id>`/`runForget`): sobe a plataforma via
 * `createAtlas`, chama `atlas.memory.forget(id)`, desliga (`finally`) e
 * devolve se algo foi removido — paridade com `runForget` (nunca lança para
 * um id inexistente, apenas devolve `false`).
 */
export async function forgetFact(
  id: string,
  deps: { configOverride?: AtlasConfigOverride } = {},
): Promise<boolean> {
  const { configOverride = {} } = deps;
  const atlas = await createAtlas({ config: withPersonaSelection(configOverride) });
  try {
    return await atlas.memory.forget(id);
  } finally {
    await atlas.shutdown();
  }
}
