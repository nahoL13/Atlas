import { isAbsolute } from 'node:path';
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
import type { GrantConfirmPort } from './permission-grant-dialog.js';

export interface PersonaOption {
  readonly id: string;
  readonly name: string;
}

export interface PersonaSelection {
  readonly personaId: string;
  readonly closedSessions: readonly SessionId[];
}

/**
 * Raízes de permissão de sistema de arquivos (SPEC-0038): tipos planos,
 * serializáveis por IPC, locais a este app — nunca promovidos a
 * `@atlas/contracts` sem um 2º consumidor real.
 */
export interface PermissionRoots {
  readonly readRoots: readonly string[];
  readonly writeRoots: readonly string[];
}

export interface PermissionRootsSelection extends PermissionRoots {
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
 * Seleção de permissões em runtime (SPEC-0038, Decisão D2): estado de módulo
 * do `core-bridge`, mesmo molde da seleção de Persona — aplicada como
 * `config.permissions` em cada `createAtlas` subsequente. Não é persistida —
 * some ao fechar a app, voltando às raízes resolvidas por
 * `flags > env > defaults` (ADR-0006).
 */
let selectedPermissions: PermissionRoots | undefined;

/**
 * Rastreio generalizado de operação em voo (SPEC-0038, Decisão D10):
 * contador de operações que sobem um Core **fora** do `Map` de sessões de
 * chat vivas — hoje `resolveAskSnapshot` e o intervalo de abertura de
 * `openChatSession` (correção A6 do gate: entre o `createAtlas` e o
 * registro em `chatSessions`, a sessão nova ainda não está no `busySessions`
 * nem em `chatSessions`, então precisa do próprio rastreio). Cada operação
 * incrementa antes do primeiro `await` e decrementa em `finally`.
 * `selectPermissionRoots` recusa a aplicação enquanto este contador ou
 * `busySessions` forem não-vazios/positivos.
 */
let inFlightOperations = 0;

function hasInFlightOperation(): boolean {
  return busySessions.size > 0 || inFlightOperations > 0;
}

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
 * Aplica as seleções correntes (Persona + permissões) ao `AtlasConfigOverride`
 * de toda função que sobe o Core — precedência: o valor explícito do
 * chamador **vence** a seleção corrente, campo a campo, e `permissions` é
 * tratado como **bloco completo** (a seleção nunca é mesclada dentro de um
 * `configOverride.permissions` parcial do chamador — SPEC-0038, Decisão D3;
 * mesmo precedente da D7 da SPEC-0037 para Persona).
 */
function withSelections(configOverride: AtlasConfigOverride): AtlasConfigOverride {
  let result = configOverride;
  if (result.persona === undefined && selectedPersona !== undefined) {
    result = { ...result, persona: selectedPersona };
  }
  if (result.permissions === undefined && selectedPermissions !== undefined) {
    result = { ...result, permissions: selectedPermissions };
  }
  return result;
}

/**
 * Reset explícito do estado de módulo do bridge — uso exclusivo dos testes
 * (isolamento entre casos): Persona selecionada, permissões selecionadas e
 * os dois rastreios de operação em voo (`busySessions`/`inFlightOperations`).
 */
export function __resetBridgeStateForTests(): void {
  selectedPersona = undefined;
  selectedPermissions = undefined;
  busySessions.clear();
  inFlightOperations = 0;
}

/**
 * Normaliza uma lista de raízes (SPEC-0038, Escopo/D5): `trim` de cada
 * entrada, descarte de vazias, deduplicação preservando a ordem de chegada
 * — mesmo tratamento que `filterNonEmpty` dá às flags na CLI.
 */
function normalizeRoots(roots: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of roots) {
    const trimmed = raw.trim();
    if (trimmed === '' || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** Default fail-closed: sem `confirmGrant` injetado, nenhuma raiz de escrita nova é concedida. */
const fallbackGrantConfirm: GrantConfirmPort = {
  request: () => Promise.resolve(false),
};

/**
 * Configura as raízes de permissão de sistema de arquivos em runtime
 * (SPEC-0038) — nesta ordem, fail-closed (qualquer recusa deixa tudo
 * exatamente como estava):
 *
 * 1. normaliza (trim/descarte de vazias/dedup preservando ordem);
 * 2. valida estruturalmente: `readRoots` não pode ficar vazia; todo caminho
 *    (leitura ou escrita) precisa ser absoluto (D5) — nunca resolvido contra
 *    o `cwd` do processo;
 * 3. recusa se houver qualquer operação em voo (turno de chat ou operação
 *    que sobe Core fora do `Map` de sessões — D10);
 * 4. para cada raiz de escrita **nova** (D6), pede consentimento via
 *    `confirmGrant` — porta dedicada à concessão de política (D11), distinta
 *    do `ConfirmPort` de ação pontual do Runtime; qualquer recusa (ou
 *    ausência de `confirmGrant`, default fail-closed) aborta tudo;
 * 5. **rechecagem da operação em voo** (correção A7 do gate): como o passo 4
 *    pode esperar o usuário indefinidamente, a checagem do passo 3 é
 *    refeita imediatamente antes de aplicar — uma operação iniciada durante
 *    o diálogo de consentimento também aborta a aplicação, sem efeito
 *    parcial;
 * 6. registra a seleção no estado de módulo e encerra todas as sessões de
 *    chat vivas (nenhum Core sobrevive à aplicação sob política superada —
 *    D7/D10), devolvendo-as em `closedSessions`.
 */
export async function selectPermissionRoots(
  request: PermissionRoots,
  deps: { confirmGrant?: GrantConfirmPort } = {},
): Promise<PermissionRootsSelection> {
  const readRoots = normalizeRoots(request.readRoots);
  const writeRoots = normalizeRoots(request.writeRoots);

  if (readRoots.length === 0) {
    throw new Error('É necessário ao menos uma raiz de leitura.');
  }
  for (const candidate of [...readRoots, ...writeRoots]) {
    if (!isAbsolute(candidate)) {
      throw new Error(`Caminho de permissão precisa ser absoluto: ${candidate}`);
    }
  }

  if (hasInFlightOperation()) {
    throw new Error(
      'Não é possível alterar permissões: há uma operação em andamento (turno de chat ou ask).',
    );
  }

  const confirmGrant = deps.confirmGrant ?? fallbackGrantConfirm;
  const currentWriteRoots = new Set(selectedPermissions?.writeRoots ?? []);
  for (const candidate of writeRoots) {
    if (currentWriteRoots.has(candidate)) {
      continue;
    }
    const granted = await confirmGrant.request({
      path: candidate,
      scope: 'subtree',
      duration: 'session',
    });
    if (!granted) {
      throw new Error(`Concessão de permissão de escrita recusada para: ${candidate}`);
    }
  }

  // Correção A7 (gate): o passo acima pode aguardar o usuário
  // indefinidamente — refaz a checagem de operação em voo imediatamente
  // antes de aplicar, para que um `ask`/turno iniciado durante o diálogo de
  // consentimento também bloqueie a aplicação (tudo-ou-nada, D8).
  if (hasInFlightOperation()) {
    throw new Error(
      'Não é possível alterar permissões: há uma operação em andamento (turno de chat ou ask).',
    );
  }

  selectedPermissions = { readRoots, writeRoots };
  const closedSessions: SessionId[] = [];
  for (const session of [...chatSessions.keys()]) {
    closedSessions.push(session);
    await closeChatSession(session);
  }
  return { readRoots, writeRoots, closedSessions };
}

/** Leitura do estado de módulo: `undefined` enquanto o usuário não configurou nada. */
export function selectedPermissionRoots(): PermissionRoots | undefined {
  return selectedPermissions;
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
  const atlas = await createAtlas({ config: withSelections(configOverride) });
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
 *
 * Entra no rastreio generalizado de operação em voo (SPEC-0038, D10): marca
 * `inFlightOperations` **antes do primeiro `await`** e desmarca em
 * `finally`, ao lado do `busySessions` que `sendChatTurn` já alimenta — é o
 * que permite `selectPermissionRoots` recusar a aplicação de uma política
 * nova enquanto este `ask` ainda estiver rodando, sem alterar o resultado
 * nem o fluxo do `ask` em si.
 */
export async function resolveAskSnapshot(
  objective: string,
  deps: { confirm?: ConfirmPort; configOverride?: AtlasConfigOverride } = {},
): Promise<AskSnapshot> {
  const { confirm = fallbackConfirm, configOverride = {} } = deps;
  inFlightOperations += 1;
  try {
    const atlas = await createAtlas({ config: withSelections(configOverride) }, { confirm });
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
  } finally {
    inFlightOperations -= 1;
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
 *
 * Entra no rastreio generalizado de operação em voo (SPEC-0038, correção A6
 * do gate): entre o `createAtlas` e o registro em `chatSessions` a sessão
 * nova ainda não está no `busySessions` nem no `Map` de sessões vivas — sem
 * marcar aqui, `selectPermissionRoots` poderia aplicar uma política nova
 * bem no meio da abertura, sob um Core que nasceria com a política antiga e
 * sobreviveria (uma sessão de chat inteira) sem ser rastreado nem
 * encerrado. Marca antes do primeiro `await` e desmarca em `finally`.
 */
export async function openChatSession(
  deps: { confirm?: ConfirmPort; configOverride?: AtlasConfigOverride } = {},
): Promise<SessionId> {
  const { confirm = fallbackConfirm, configOverride = {} } = deps;
  inFlightOperations += 1;
  try {
    const atlas = await createAtlas({ config: withSelections(configOverride) }, { confirm });
    const session = atlas.context.openSession(atlas.cognitive.startConversation());
    chatSessions.set(session, { atlas });
    return session;
  } finally {
    inFlightOperations -= 1;
  }
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
  const atlas = await createAtlas({ config: withSelections(configOverride) });
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
  const atlas = await createAtlas({ config: withSelections(configOverride) });
  try {
    return await atlas.memory.forget(id);
  } finally {
    await atlas.shutdown();
  }
}
