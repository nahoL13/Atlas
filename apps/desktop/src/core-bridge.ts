import { isAbsolute } from 'node:path';
import {
  createAtlas,
  createFilePersonaStorage,
  createPersonaService,
  loadConfig,
  personaStoragePath,
  PERSONA_IDS,
  resolveDataDir,
} from '@atlas/core';
import type { PersonaStorage } from '@atlas/core';
import type {
  ActionRequest,
  AtlasConfigOverride,
  AtlasPlatform,
  Persona,
  PersonaInput,
  PersonaService,
  SessionId,
} from '@atlas/contracts';
import { formatSteps } from './steps-view.js';
import type { StepLine } from './steps-view.js';
import type { GrantConfirmPort } from './permission-grant-dialog.js';
import type { PersonaDeleteConfirmPort } from './persona-delete-dialog.js';
import { createTokenUsageAccumulator } from './token-usage.js';
import type { TokenUsageSnapshot } from './token-usage.js';

export interface PersonaOption {
  readonly id: string;
  readonly name: string;
  /** `true` só para as Personas embutidas (`jarvis`/`neutral`), imutáveis e somente-leitura na GUI. */
  readonly builtin: boolean;
}

/**
 * Espelho GUI dos 8 campos de `Persona` (+ `id`/`voiceURI?`/`builtin`) —
 * para preencher o formulário de edição (`describePersona`). Local a este
 * app (mesma regra de `PersonaOption`/`StatusSnapshot`): promoção a
 * `@atlas/contracts` só com um 2º consumidor real.
 */
export interface PersonaDetail {
  readonly id: string;
  readonly name: string;
  readonly tone: string;
  readonly formality: string;
  readonly language: string;
  readonly style: string;
  readonly communicationRules: readonly string[];
  readonly voice: string;
  readonly emotion: string;
  readonly voiceURI?: string;
  readonly builtin: boolean;
}

export interface PersonaMutation {
  readonly persona: PersonaDetail;
  readonly closedSessions: readonly SessionId[];
}

/** Ponto de injeção comum às seis funções de Persona (SPEC-0039). */
interface PersonaDeps {
  readonly personaService?: PersonaService;
  readonly configOverride?: AtlasConfigOverride;
}

function toPersonaDetail(persona: Persona): PersonaDetail {
  return {
    id: persona.id,
    name: persona.name,
    tone: persona.tone,
    formality: persona.formality,
    language: persona.language,
    style: persona.style,
    communicationRules: [...persona.communicationRules],
    voice: persona.voice,
    emotion: persona.emotion,
    ...(persona.voiceURI !== undefined ? { voiceURI: persona.voiceURI } : {}),
    builtin: PERSONA_IDS.includes(persona.id),
  };
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
 * Registro único de operações em voo (SPEC-0051, Decisão D4): substitui o
 * par `busySessions`/`inFlightOperations` (SPEC-0038/0050) por um `Set` com
 * identidade — é o que torna possível distinguir uma operação ABANDONADA de
 * uma ativa, o que um contador não sustentava (o `finally` de um turno
 * abandonado apagaria a marca de um turno novo na mesma `SessionId`).
 *
 * Alimentado por `resolveAskSnapshot` (`'ask'`), `sendChatTurn`
 * (`'chat-turn'`, com `session`) e `openChatSession` (`'open-session'`, não
 * cancelável — D5 da SPEC-0050 — nem guardada por `hasActiveOperation()`,
 * mas conta para `hasInFlightOperation()`, correção A6 da SPEC-0038). Cada
 * função adiciona o registro antes do primeiro `await` e o remove no
 * `finally` do trabalho REAL — nunca no da promessa devolvida ao chamador,
 * que pode assentar antes por abandono (Frente 2).
 *
 * `record.reject` é o `reject` do *deferred* de abandono daquela operação:
 * `cancelInFlightOperation()` (D7) o invoca, marcando `abandoned = true` e
 * fazendo a promessa do gesto rejeitar imediatamente com a mensagem pinada
 * do `kind`.
 */
type OperationKind = 'ask' | 'chat-turn' | 'open-session';

interface OperationRecord {
  readonly kind: OperationKind;
  readonly session?: SessionId;
  abandoned: boolean;
  reject: (error: Error) => void;
}

const operations = new Set<OperationRecord>();

/**
 * Acumulador único de consumo de tokens da sessão corrente (SPEC-0054,
 * Decisão D8): um contador só de módulo, no mesmo molde da seleção de
 * Persona/permissões — não um por `SessionId` (o `ask` é stateless e não tem
 * sessão à qual pertencer). Somado em `resolveAskSnapshot`/`sendChatTurn`,
 * resetado em `openChatSession` bem-sucedida e por `__resetBridgeStateForTests`.
 */
const tokenUsage = createTokenUsageAccumulator();

/** Leitura síncrona do consumo acumulado — nunca sobe o Core (SPEC-0054). */
export function readTokenUsage(): TokenUsageSnapshot {
  return tokenUsage.snapshot();
}

/**
 * Seleção de permissões em runtime (SPEC-0038, Decisão D2): estado de módulo
 * do `core-bridge`, mesmo molde da seleção de Persona — aplicada como
 * `config.permissions` em cada `createAtlas` subsequente. Não é persistida —
 * some ao fechar a app, voltando às raízes resolvidas por
 * `flags > env > defaults` (ADR-0006).
 */
let selectedPermissions: PermissionRoots | undefined;

/**
 * Predicado de SEGURANÇA (SPEC-0038/0050, preservado pela SPEC-0051, D3):
 * registro não vazio — **inclui** operações abandonadas ainda não
 * assentadas. Consumidores inalterados: `updatePersona` (1×),
 * `selectPermissionRoots` (2× — checagem original e rechecagem A7
 * imediatamente antes de aplicar). Cancelar não destrava política de
 * permissões nem edição da Persona ativa enquanto um Core abandonado ainda
 * estiver vivo — o buraco que as correções A6/A7 da SPEC-0038 fecharam
 * (ADR-0013) não é reaberto por esta SPEC.
 */
function hasInFlightOperation(): boolean {
  return operations.size > 0;
}

/**
 * Predicado de CONVERSAÇÃO (SPEC-0051, D3, novo): existe registro com
 * `abandoned === false` — ignora as abandonadas. Guarda de entrada de
 * `resolveAskSnapshot`/`sendChatTurn` (no lugar de `hasInFlightOperation()`,
 * SPEC-0050): é o que devolve ao usuário o direito de perguntar de novo logo
 * após cancelar. Um registro `'open-session'` nunca é marcado abandonado —
 * conta como ativo enquanto durar, preservando o comportamento da
 * SPEC-0050 durante a janela de abertura de `openChatSession` (D5 intacta).
 */
function hasActiveOperation(): boolean {
  for (const record of operations) {
    if (!record.abandoned) {
      return true;
    }
  }
  return false;
}

/**
 * Predicado de SESSÃO (SPEC-0051, D15, novo): existe um registro
 * `'chat-turn'` daquela `session`, abandonado e ainda não assentado. Governa
 * a QUARENTENA de `sendChatTurn` (recusa turno novo na mesma sessão —
 * nenhum documento sustenta reentrância de `respond` no mesmo Core/
 * `SessionId`, invariante 8) e a negação PEGAJOSA do `ConfirmPort` daquela
 * sessão (D8) — os dois caem juntos quando o registro é removido no
 * `finally` do trabalho abandonado.
 */
function hasAbandonedTurnForSession(session: SessionId): boolean {
  for (const record of operations) {
    if (record.kind === 'chat-turn' && record.session === session && record.abandoned) {
      return true;
    }
  }
  return false;
}

/**
 * Predicado PARCIAL de `selectPersona` (SPEC-0050/D12, nomeado pela
 * SPEC-0051/D5 sem mudar comportamento): existe um registro `'chat-turn'` —
 * **inclui** as abandonadas, mesma assimetria pré-existente (um `ask` em voo
 * não bloqueia a troca de Persona, embora bloqueie a edição da Persona ativa
 * via `hasInFlightOperation()`). Candidato de uniformização segue aberto
 * (D12 da SPEC-0050), não fechado por esta SPEC.
 */
function hasChatTurnOperation(): boolean {
  for (const record of operations) {
    if (record.kind === 'chat-turn') {
      return true;
    }
  }
  return false;
}

/**
 * Deriva o `PersonaStorage` de arquivo do config **efetivo** da chamada
 * (SPEC-0039, Decisão D17/D13, correções A1 + B1): via `resolveDataDir`,
 * **nunca** via `loadConfig` — achar o arquivo de Personas depende só do
 * `dataDir`, nunca de a Persona ativa ser conhecida/válida. Único lugar de
 * `apps/desktop` que compõe essa cadeia; a derivação do nome do arquivo em
 * si vive só em `personaStoragePath` (`@atlas/core`) — nunca reinventada
 * aqui.
 */
function personaStorageFor(configOverride: AtlasConfigOverride = {}): PersonaStorage {
  return createFilePersonaStorage(
    personaStoragePath(resolveDataDir(withSelections(configOverride))),
  );
}

/**
 * Default de `deps.personaService` de todas as seis funções de Persona
 * (Decisão D6/D12): um `PersonaService` construído sobre o file storage do
 * config efetivo — sem subir o Core, sem lifecycle.
 */
function defaultPersonaService(configOverride: AtlasConfigOverride = {}): PersonaService {
  return createPersonaService({ storage: personaStorageFor(configOverride) });
}

/**
 * Persona **efetiva** (SPEC-0039, correção A5/D15): a selecionada em
 * memória (`selectedPersonaId()`) ou, na ausência dela, a resolvida do
 * config — passando o catálogo do `personaService` recebido (correção B1)
 * para que uma Persona custom em `config.persona` seja **resolvida**, não
 * rejeitada. Usada pelas guardas de `updatePersona`/`deletePersona` — nunca
 * a seleção em memória isolada, que ficaria acidentalmente correta só
 * enquanto nenhuma outra fatia honrar `ATLAS_PERSONA`/persistir a seleção.
 */
function activePersonaId(
  configOverride: AtlasConfigOverride,
  personaService: PersonaService,
): string {
  return (
    selectedPersona ??
    loadConfig(withSelections(configOverride), { personaIds: personaService.list() }).persona
  );
}

/**
 * Catálogo de Personas para exibição/seleção (equivalente GUI do que a CLI
 * resolveria por `--persona`): síncrono, **sem** subir o Core — consulta
 * `PersonaService.list()`/`get(id)` e devolve trios `{ id, name, builtin }`
 * planos, serializáveis por IPC. `personaService` é injetável para teste; o
 * default vem de `defaultPersonaService` (sobre o storage de arquivo do
 * config efetivo).
 */
export function listPersonas(deps: PersonaDeps = {}): readonly PersonaOption[] {
  const personaService = deps.personaService ?? defaultPersonaService(deps.configOverride);
  return personaService.list().map((id) => {
    const persona = personaService.get(id);
    return { id: persona.id, name: persona.name, builtin: PERSONA_IDS.includes(id) };
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
export async function selectPersona(id: string, deps: PersonaDeps = {}): Promise<PersonaSelection> {
  const personaService = deps.personaService ?? defaultPersonaService(deps.configOverride);
  if (!personaService.has(id)) {
    throw new Error(`Persona desconhecida: ${id}`);
  }
  if (hasChatTurnOperation()) {
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

/** Default fail-closed: sem `confirmDelete` injetado, nenhuma Persona é apagada. */
const fallbackPersonaDeleteConfirm: PersonaDeleteConfirmPort = {
  request: () => Promise.resolve(false),
};

/**
 * Preenche o formulário de edição: síncrono, sem subir o Core.
 */
export function describePersona(id: string, deps: PersonaDeps = {}): PersonaDetail {
  const personaService = deps.personaService ?? defaultPersonaService(deps.configOverride);
  return toPersonaDetail(personaService.get(id));
}

/**
 * Cria uma Persona custom (Decisão D6): não seleciona a Persona criada, não
 * encerra sessão alguma — só grava e devolve o `PersonaDetail`.
 */
export async function createPersona(
  input: PersonaInput,
  deps: PersonaDeps = {},
): Promise<PersonaDetail> {
  const personaService = deps.personaService ?? defaultPersonaService(deps.configOverride);
  return toPersonaDetail(personaService.create(input));
}

/**
 * Edita uma Persona custom (Decisão D9/D15): recusa `id` embutido; se `id`
 * for a Persona **efetivamente ativa**, recusa havendo operação em voo e,
 * ao aplicar, encerra todas as sessões de chat vivas (devolvidas em
 * `closedSessions`); caso contrário aplica sem encerrar nada.
 */
export async function updatePersona(
  id: string,
  input: PersonaInput,
  deps: PersonaDeps = {},
): Promise<PersonaMutation> {
  const configOverride = deps.configOverride ?? {};
  const personaService = deps.personaService ?? defaultPersonaService(configOverride);

  if (PERSONA_IDS.includes(id)) {
    throw new Error(`Não é possível editar uma Persona embutida: ${id}`);
  }

  const active = activePersonaId(configOverride, personaService);
  if (id === active) {
    if (hasInFlightOperation()) {
      throw new Error('Não é possível editar a Persona ativa: há uma operação em andamento.');
    }
    const persona = personaService.update(id, input);
    const closedSessions: SessionId[] = [];
    for (const session of [...chatSessions.keys()]) {
      closedSessions.push(session);
      await closeChatSession(session);
    }
    return { persona: toPersonaDetail(persona), closedSessions };
  }

  const persona = personaService.update(id, input);
  return { persona: toPersonaDetail(persona), closedSessions: [] };
}

/**
 * Apaga uma Persona custom (Decisão D14, Artigo 8): recusa `id` embutido,
 * recusa a Persona **efetivamente ativa**, e exige consentimento explícito
 * via `PersonaDeleteConfirmPort` (default fail-closed) — consultado
 * **depois** das validações, para o usuário nunca ser perguntado sobre algo
 * que seria recusado de qualquer forma.
 */
export async function deletePersona(
  id: string,
  deps: PersonaDeps & { confirmDelete?: PersonaDeleteConfirmPort } = {},
): Promise<void> {
  const configOverride = deps.configOverride ?? {};
  const personaService = deps.personaService ?? defaultPersonaService(configOverride);

  if (PERSONA_IDS.includes(id)) {
    throw new Error(`Não é possível apagar uma Persona embutida: ${id}`);
  }
  if (!personaService.has(id)) {
    throw new Error(`Persona desconhecida: ${id}`);
  }

  const active = activePersonaId(configOverride, personaService);
  if (id === active) {
    throw new Error('Não é possível apagar a Persona ativa: troque de Persona antes.');
  }

  const confirmDelete = deps.confirmDelete ?? fallbackPersonaDeleteConfirm;
  const persona = personaService.get(id);
  const granted = await confirmDelete.request({ id: persona.id, name: persona.name });
  if (!granted) {
    throw new Error('Remoção da Persona recusada.');
  }

  personaService.delete(id);
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
 * o registro único de operações em voo (SPEC-0051). Segue **não** fechando
 * sessões vivas (SPEC-0042/D15, aberto).
 */
export function __resetBridgeStateForTests(): void {
  selectedPersona = undefined;
  selectedPermissions = undefined;
  operations.clear();
  tokenUsage.reset();
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
  readonly persona: { readonly id: string; readonly name: string; readonly voiceURI?: string };
  readonly readRoots: readonly string[];
  readonly writeRoots: readonly string[];
}

/**
 * Round-trip mínimo com o Core (análogo ao `runStatus` da CLI): sobe a
 * plataforma via `createAtlas`, lê `state`/`config`/`persona`, desliga e
 * devolve um objeto plano serializável por IPC. Não mantém a plataforma
 * viva entre chamadas nesta fatia.
 *
 * Injeta `personaStorage: personaStorageFor(configOverride)` (SPEC-0039,
 * Decisão D3/D13) — derivado do **mesmo** `configOverride` que alimenta
 * `withSelections`, para que o Core e o CRUD de Persona nunca apontem para
 * arquivos diferentes.
 */
export async function resolveStatusSnapshot(
  configOverride: AtlasConfigOverride = {},
): Promise<StatusSnapshot> {
  const atlas = await createAtlas(
    { config: withSelections(configOverride) },
    { personaStorage: personaStorageFor(configOverride) },
  );
  try {
    const { state, config, persona } = atlas;
    return {
      state,
      logLevel: config.logLevel,
      dataDir: config.dataDir,
      persona: {
        id: persona.id,
        name: persona.name,
        ...(persona.voiceURI !== undefined ? { voiceURI: persona.voiceURI } : {}),
      },
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
 * Envelope do `ConfirmPort` de um `ask` (SPEC-0051, D8/Frente 3): o Core de
 * um `ask` é exclusivo daquela operação, então o alcance da contenção é o
 * próprio `OperationRecord`. Nega **sem** chamar a porta injetada se já
 * abandonado; se a porta já estava pendente quando o abandono ocorreu, a
 * resposta que chegar depois é descartada e o resultado é `false`. Sem
 * abandono, transparente — delega e devolve o valor tal e qual.
 */
function wrapConfirmForAsk(confirm: ConfirmPort, record: OperationRecord): ConfirmPort {
  return {
    request: async (action) => {
      if (record.abandoned) {
        return false;
      }
      const granted = await confirm.request(action);
      return record.abandoned ? false : granted;
    },
  };
}

/**
 * Envelope do `ConfirmPort` de uma sessão de chat (SPEC-0051, D8, achado A1
 * do gate): a porta é injetada **uma vez**, em `openChatSession`, e vive
 * pela sessão inteira — o alcance da contenção é portanto a SESSÃO, **não**
 * o turno. Enquanto `hasAbandonedTurnForSession(session)` for verdadeiro,
 * nega tudo sem chamar a porta injetada, independentemente de qual turno
 * originou o pedido (nenhuma ação destrutiva é aprovada em nome de um turno
 * abandonado). `getSession` é uma leitura tardia (R1): no momento em que
 * este envelope é construído, dentro de `openChatSession`, a `SessionId`
 * ainda não existe (`createAtlas` precede `atlas.context.openSession`) — a
 * caixa mutável é preenchida logo depois; antes disso o envelope é
 * transparente por construção (não pode haver turno abandonado de uma
 * sessão que ainda não existe).
 */
function wrapConfirmForChatSession(
  confirm: ConfirmPort,
  getSession: () => SessionId | undefined,
): ConfirmPort {
  return {
    request: async (action) => {
      const before = getSession();
      if (before !== undefined && hasAbandonedTurnForSession(before)) {
        return false;
      }
      const granted = await confirm.request(action);
      const after = getSession();
      if (after !== undefined && hasAbandonedTurnForSession(after)) {
        return false;
      }
      return granted;
    },
  };
}

/**
 * Round-trip stateless com o Core (espelho de `resolveStatusSnapshot` e do
 * `runAsk` da CLI): sobe a plataforma via `createAtlas` injetando o
 * `ConfirmPort` recebido (envolvido por `wrapConfirmForAsk`, SPEC-0051),
 * chama `atlas.cognitive.ask`, grava os fatos aprendidos
 * (`atlas.memory.remember(fact, 'learned')`, paridade com `runAsk` — nunca
 * gravação silenciosa), desliga (`finally`) e devolve um `AskSnapshot` plano
 * serializável por IPC. Não mantém a plataforma nem uma `Conversation` viva
 * entre chamadas (isso é 2.2).
 *
 * Entra no registro único de operações em voo (SPEC-0051, D4; SPEC-0038,
 * D10 original): adiciona um `OperationRecord` **antes do primeiro `await`**
 * e o remove no `finally` do trabalho real — é o que permite
 * `selectPermissionRoots`/`updatePersona` recusar enquanto este `ask` ainda
 * estiver rodando (`hasInFlightOperation()`, inclui abandonadas).
 *
 * Desde a SPEC-0050, também **lê** `hasActiveOperation()` (SPEC-0051, D3 —
 * ignora abandonadas) em guarda de entrada, antes de registrar e de
 * qualquer `await`: um `ask` disparado durante outro `ask` ATIVO, durante um
 * turno de chat ATIVO, ou durante a janela de abertura de `openChatSession`,
 * é recusado com `Error` estruturado — sem subir Core, sem registrar nada e
 * sem efeito colateral. Um `ask`/turno **abandonado** não bloqueia mais um
 * `ask` novo (é exatamente o direito que cancelar devolve).
 *
 * Desde a SPEC-0051 (Frente 2, D6/D7): a promessa devolvida ao chamador
 * assenta pelo **primeiro** de dois desfechos — o trabalho real, ou o
 * abandono via `cancelInFlightOperation()` (rejeição imediata com a
 * mensagem pinada `Pergunta cancelada pelo usuário.`). O trabalho real segue
 * destacado e, se abandonado, descarta o resultado (nenhum
 * `atlas.memory.remember` é chamado) — mas o `atlas.shutdown()` do `finally`
 * continua acontecendo (D9).
 */
export async function resolveAskSnapshot(
  objective: string,
  deps: { confirm?: ConfirmPort; configOverride?: AtlasConfigOverride } = {},
): Promise<AskSnapshot> {
  const { confirm = fallbackConfirm, configOverride = {} } = deps;
  // Guarda de entrada (SPEC-0050, refinada pela SPEC-0051/D3): recusa ANTES
  // de registrar e de qualquer `await` — uma recusa não deixa resíduo de
  // estado. Só operações ATIVAS bloqueiam (D3): uma abandonada não conta.
  if (hasActiveOperation()) {
    throw new Error('Não é possível iniciar uma pergunta: há uma operação em andamento.');
  }

  const record: OperationRecord = { kind: 'ask', abandoned: false, reject: () => {} };
  const abandonPromise = new Promise<never>((_resolve, reject) => {
    record.reject = reject;
  });
  operations.add(record);

  const work = (async (): Promise<AskSnapshot> => {
    try {
      const atlas = await createAtlas(
        { config: withSelections(configOverride) },
        {
          confirm: wrapConfirmForAsk(confirm, record),
          personaStorage: personaStorageFor(configOverride),
        },
      );
      try {
        const result = await atlas.cognitive.ask(objective);
        // SPEC-0054 (Escopo 6): o consumo de tokens É contabilizado mesmo
        // para trabalho abandonado — o gasto já ocorreu de fato (D9); só os
        // efeitos de domínio (abaixo) continuam descartados.
        tokenUsage.add(result.usage);
        // Contenção (D9): resultado do trabalho ABANDONADO é descartado por
        // inteiro — nenhum `remember` é chamado. A promessa devolvida ao
        // chamador já assentou por abandono; este valor nunca é observado.
        if (record.abandoned) {
          return { text: '', steps: [], learned: [] };
        }
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
        // O `shutdown` de um `ask` abandonado continua acontecendo (D9) —
        // higiene de recurso, não efeito de domínio.
        await atlas.shutdown();
      }
    } finally {
      operations.delete(record);
    }
  })();

  return Promise.race([work, abandonPromise]);
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
 * Entra no registro único de operações em voo (SPEC-0051, D4; SPEC-0038,
 * correção A6 do gate original): entre o `createAtlas` e o registro em
 * `chatSessions` a sessão nova ainda não está rastreável por
 * `hasAbandonedTurnForSession` nem no `Map` de sessões vivas — sem marcar
 * aqui, `selectPermissionRoots` poderia aplicar uma política nova bem no
 * meio da abertura, sob um Core que nasceria com a política antiga e
 * sobreviveria (uma sessão de chat inteira) sem ser rastreado nem
 * encerrado. Adiciona um `OperationRecord` `'open-session'` (não cancelável,
 * D5 da SPEC-0050) antes do primeiro `await` e o remove em `finally`.
 *
 * O `ConfirmPort` recebido é envolvido por `wrapConfirmForChatSession`
 * (SPEC-0051, D8): é este o **único** ponto de injeção da porta para toda a
 * vida da sessão — `sendChatTurn` nunca injeta porta alguma —, por isso a
 * contenção pegajosa de consentimento é por SESSÃO, não por turno (achado
 * A1 do gate). `getSession` lê uma caixa mutável (`session`, R1) preenchida
 * logo após `atlas.context.openSession`, porque a `SessionId` ainda não
 * existe no momento em que `createAtlas` é chamado.
 */
export async function openChatSession(
  deps: { confirm?: ConfirmPort; configOverride?: AtlasConfigOverride } = {},
): Promise<SessionId> {
  const { confirm = fallbackConfirm, configOverride = {} } = deps;
  const record: OperationRecord = { kind: 'open-session', abandoned: false, reject: () => {} };
  operations.add(record);
  try {
    // Caixa mutável (R1): a `SessionId` ainda não existe quando `createAtlas`
    // é chamado — `wrapConfirmForChatSession` lê `sessionBox.current` tardiamente.
    const sessionBox: { current?: SessionId } = {};
    const wrappedConfirm = wrapConfirmForChatSession(confirm, () => sessionBox.current);
    const atlas = await createAtlas(
      { config: withSelections(configOverride) },
      { confirm: wrappedConfirm, personaStorage: personaStorageFor(configOverride) },
    );
    const session = atlas.context.openSession(atlas.cognitive.startConversation());
    sessionBox.current = session;
    chatSessions.set(session, { atlas });
    // SPEC-0054 (Escopo 6): sessão nova de chat reseta o consumo de tokens
    // acumulado — mesmo evento que já zera outros estados transitórios
    // desta sessão (ADR-0025(c)).
    tokenUsage.reset();
    return session;
  } finally {
    operations.delete(record);
  }
}

/**
 * Envia um turno à sessão viva (mediação que o ADR-0009 atribui à
 * aplicação): lê a conversa do Context, chama `respond` puro, grava o
 * histórico de volta e devolve um `TurnSnapshot` plano serializável por
 * IPC. **Não** desliga o Core nem fecha a sessão — mantém tudo vivo para o
 * próximo turno. Se o turno falhar (ex.: `ATLAS_MODEL_GATEWAY`), a sessão
 * permanece aberta (paridade com a resiliência do `runChat`).
 *
 * Ordem exata das três guardas de entrada (SPEC-0051, Escopo/D15):
 * 1. `mustGetChatSession` — erro de estrutura antes de erro de estado (D4 da
 *    SPEC-0050, preservada);
 * 2. `hasAbandonedTurnForSession(session)` — QUARENTENA (D15, achado A2 do
 *    gate): recusa turno novo enquanto um turno abandonado daquela sessão
 *    não assentou. Nenhum documento sustenta reentrância de `respond` no
 *    mesmo Core/`SessionId` (invariante 8) — aceitar o turno novo
 *    pressuporia exatamente isso, além de reabrir o consentimento cruzado
 *    do achado A1;
 * 3. `hasActiveOperation()` (SPEC-0051, D3) — a mensagem pinada da
 *    SPEC-0050, inalterada; ignora operações abandonadas.
 *
 * Nenhuma das três marca o registro nem toca o Core; a sessão segue viva e
 * utilizável no turno seguinte em qualquer recusa.
 *
 * Desde a SPEC-0051 (Frente 2, D6/D7): a promessa devolvida ao chamador
 * assenta pelo **primeiro** de dois desfechos — o trabalho real, ou o
 * abandono via `cancelInFlightOperation()` (rejeição imediata com a
 * mensagem pinada `Turno cancelado pelo usuário.`). O trabalho real segue
 * destacado e, se abandonado, descarta o resultado por inteiro: nem
 * `atlas.context.updateConversation` nem `atlas.memory.remember` são
 * chamados — a conversa da sessão fica exatamente como estava antes do
 * turno. O `ConfirmPort` da sessão nunca é injetado aqui (D8) — é o mesmo
 * de `openChatSession`, envolvido por `wrapConfirmForChatSession`.
 */
export async function sendChatTurn(session: SessionId, input: string): Promise<TurnSnapshot> {
  const { atlas } = mustGetChatSession(session);
  if (hasAbandonedTurnForSession(session)) {
    throw new Error(
      'Não é possível enviar o turno: o turno cancelado desta conversa ainda está encerrando.',
    );
  }
  if (hasActiveOperation()) {
    throw new Error('Não é possível enviar o turno: há uma operação em andamento.');
  }

  const record: OperationRecord = {
    kind: 'chat-turn',
    session,
    abandoned: false,
    reject: () => {},
  };
  const abandonPromise = new Promise<never>((_resolve, reject) => {
    record.reject = reject;
  });
  operations.add(record);

  const work = (async (): Promise<TurnSnapshot> => {
    try {
      const turn = await atlas.cognitive.respond(atlas.context.getConversation(session), input);
      // SPEC-0054 (Escopo 6): o consumo de tokens É contabilizado mesmo para
      // trabalho abandonado — o gasto já ocorreu de fato (D9); só os efeitos
      // de domínio (abaixo) continuam descartados.
      tokenUsage.add(turn.usage);
      // Contenção (D9): resultado do trabalho ABANDONADO é descartado por
      // inteiro — nem `updateConversation` nem `remember` são chamados. A
      // conversa da sessão fica exatamente como estava antes deste turno.
      if (record.abandoned) {
        return { reply: '', steps: [], learned: [] };
      }
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
      // Remoção do registro (D9): é o que faz `hasInFlightOperation()` e
      // `hasAbandonedTurnForSession(session)` voltarem a `false` só quando o
      // trabalho abandonado de fato encerra — segurança e quarentena caem
      // juntas.
      operations.delete(record);
    }
  })();

  return Promise.race([work, abandonPromise]);
}

export interface CancelOutcome {
  readonly cancelled: boolean;
}

/** Mensagens pinadas por CA — texto exato exigido pelos Critérios de Aceitação 6/7. */
const CANCEL_MESSAGES: Record<'ask' | 'chat-turn', string> = {
  ask: 'Pergunta cancelada pelo usuário.',
  'chat-turn': 'Turno cancelado pelo usuário.',
};

/**
 * Gesto de escape (SPEC-0051, D7): síncrona, global — marca como
 * **abandonada** toda operação cancelável (`'ask'` e `'chat-turn'`) ainda
 * não abandonada, disparando a rejeição pinada de cada uma. Operações
 * `'open-session'` **não** são canceláveis (D5 da SPEC-0050) e são
 * ignoradas. Nunca lança, nunca sobe/desliga um Core — só muta estado de
 * módulo e dispara rejeições já pendentes.
 *
 * Devolve `{ cancelled: true }` sse ao menos uma operação foi marcada;
 * `{ cancelled: false }` sem nada cancelável em voo, ou numa 2ª chamada
 * imediatamente seguinte (idempotente — nada resta para abandonar).
 *
 * Global, não por operação (D7): com a quarentena de sessão (D15), há no
 * máximo **uma** operação cancelável ativa por vez — um handle por operação
 * seria superfície sem caso de uso.
 */
export function cancelInFlightOperation(): CancelOutcome {
  let cancelled = false;
  for (const record of operations) {
    if (record.kind === 'open-session' || record.abandoned) {
      continue;
    }
    record.abandoned = true;
    record.reject(new Error(CANCEL_MESSAGES[record.kind]));
    cancelled = true;
  }
  return { cancelled };
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
  const atlas = await createAtlas(
    { config: withSelections(configOverride) },
    { personaStorage: personaStorageFor(configOverride) },
  );
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
  const atlas = await createAtlas(
    { config: withSelections(configOverride) },
    { personaStorage: personaStorageFor(configOverride) },
  );
  try {
    return await atlas.memory.forget(id);
  } finally {
    await atlas.shutdown();
  }
}
