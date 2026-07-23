import { createAtlas } from '@atlas/core';
import type {
  ActionRequest,
  AtlasConfigOverride,
  AtlasPlatform,
  SessionId,
} from '@atlas/contracts';
import { formatSteps } from './steps-view.js';
import type { StepLine } from './steps-view.js';

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
  const atlas = await createAtlas({ config: configOverride });
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
  const atlas = await createAtlas({ config: configOverride }, { confirm });
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
  const atlas = await createAtlas({ config: configOverride }, { confirm });
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
