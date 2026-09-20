# SPEC-0063 — Instalação assistida de modelo Ollama no desktop

> **Project Atlas — Implementation Specification**

Template: 1.2

---

# Informações Gerais

**ID**

SPEC-0063

---

**Título**

Detecção de "nenhum modelo de IA instalado" na abertura do `apps/desktop` e instalação assistida, a partir de um catálogo curado e fixo, com tamanho visível antes do download, progresso por polling e cancelamento.

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

- [ ] Critical
- [x] High
- [ ] Medium
- [ ] Low

Justificativa em **D2**.

---

**Perfil**

- [ ] micro
- [x] completo

Justificativa em **D1**.

---

**Item do Roadmap**

Duas rastreabilidades, ambas registradas explicitamente (mesmo molde da [SPEC-0062](SPEC-0062-desktop-dependency-autostart-default.md)):

1. **Fase 2 — 2.4 Persistência e Gerência Local** — *estende, sem reabrir* (item fechado por inteiro desde a SPEC-0038; estendido pela SPEC-0039, pela SPEC-0059 e pela SPEC-0062): mesma classe de gesto — "gerência local por interface gráfica" —, agora sobre o eixo de **provisionamento** do ambiente, que não existia quando o item fechou. A superfície nova mora dentro do painel `Sistema` entregue pela SPEC-0054.
2. **Exceção consciente registrada**, como nas SPECs 0060/0061/0062: nenhum item de `docs/04-engineering/Roadmap.md` cobre "provisionamento de ambiente local". A capacidade nasceu do pedido do usuário de 2026-09-13 ("caso não tenha um modelo instalado, dá a opção de instalar e dá opções") e foi decidida pelo [ADR-0029](../../06-adr/ADR-0029-desktop-model-provisioning-assistant.md) (`Accepted`, 2026-09-19), precedido da revisão do PRD que o próprio ADR exigiu como pré-condição (subseção **Provisionamento de Ambiente Local**, já aplicada).

Esta SPEC **não fecha** nenhum item do Roadmap. Não reabre o item 1.4, nem o [ADR-0026](../../06-adr/ADR-0026-network-access-gate.md), nem a cláusula (h) do [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md).

---

# Objetivo

Quando esta SPEC estiver concluída:

1. Abrir o `apps/desktop` numa máquina onde o Ollama está de pé mas **sem nenhum modelo instalado** deve mostrar, sem que o usuário precise tentar conversar e tomar um erro, uma tela com **opções de modelo** — nome, tamanho aproximado e descrição em português — e um botão de instalar por opção.
2. Clicar em "Instalar" deve baixar o modelo escolhido pelo próprio Ollama já em execução, com **progresso visível** enquanto a tela estiver aberta e um botão de **cancelar** que interrompe a transferência.
3. Falhar (Ollama fora do ar, modelo inexistente, rede caindo no meio) deve deixar o app exatamente como estava antes da tentativa, com a razão dita em português na própria tela e a opção de tentar de novo.
4. Nada deve começar a baixar sozinho: sem clique humano, o Atlas apenas informa.
5. `apps/cli` deve sair **sem uma linha de comportamento alterada**; `@atlas/contracts` deve sair com **diff vazio**.

---

# Motivação

O [ADR-0028](../../06-adr/ADR-0028-desktop-dependency-autostart-default.md)/[SPEC-0062](SPEC-0062-desktop-dependency-autostart-default.md) resolveram a primeira metade do atrito de primeiro contato: abrir a janela passou a subir o Ollama sozinho, e o `ECONNREFUSED` deixou de ser a primeira coisa que o usuário vê. Resta a segunda metade, escalada pelo `spec-drafter` naquela sessão e decidida à parte: **um Ollama de pé sem nenhum modelo baixado continua incapaz de responder**, e o público-alvo declarado pelo ADR-0028 ("um app para todos") não vai abrir um terminal para rodar `ollama pull`.

O [ADR-0029](../../06-adr/ADR-0029-desktop-model-provisioning-assistant.md) (`Accepted`) decidiu a arquitetura desta fatia: dono (`@atlas/core`, Lifecycle Manager — cláusula (a)), operação nomeada e fixa na `ProcessPort` (b), por que isto **não** é a mesma categoria da proibição de `pull` de container do ADR-0027(h) (c), detecção sem round-trip novo (d), catálogo curado e fixo como **dado** local a `apps/desktop` (e), consentimento pelo próprio gesto (f), progresso por polling e não por canal de push (g), cancelamento local por `AbortController` (h), falha que degrada sem bloquear (i) e nada disparado sem gesto humano (j). O contrato técnico exato — canais IPC, formato do catálogo, textos pinados e CAs — foi explicitamente delegado a esta SPEC ("Observações" do ADR).

Rastreabilidade ao PRD (`docs/02-product/ProductRequirementsDocument.md`):

- **Provisionamento de Ambiente Local** (subseção nova, pré-condição do ADR-0029) — *"O sistema deve auxiliar o usuário a preparar os componentes locais necessários para funcionar, incluindo a instalação assistida de modelos de IA locais"*; e *"Essa assistência deve ser opcional e nunca automática sem uma ação explícita do usuário"* — origem direta das cláusulas (f)/(j) e das Restrições 7/8 abaixo.
- **Observabilidade do Ambiente** — a superfície nova mora no painel criado para esse requisito (SPEC-0054) e é leitura do mesmo ambiente; nenhum painel novo é criado.
- **Critérios de Qualidade** — *"simplicidade para o usuário"* e *"transparência"*.

---

# Referências

- [ADR-0029 — Instalação assistida de modelo local no desktop](../../06-adr/ADR-0029-desktop-model-provisioning-assistant.md) (`Accepted`) — **fonte primária**; cláusulas (a)–(j).
- [ADR-0027 — Auto-gerência de processos externos](../../06-adr/ADR-0027-external-process-lifecycle-management.md) (`Accepted`) — (a) bootstrap fora do Permission Service, (b) superfície não-genérica, (c) health-check por `GET /api/tags`, (d) unidade independente de `createAtlas`, (e) desligamento simétrico, (f) falha nunca bloqueia, **(h) intacta** (nenhum `pull` de container Docker é introduzido).
- [ADR-0028](../../06-adr/ADR-0028-desktop-dependency-autostart-default.md) (`Accepted`) — supersessão parcial de (g) no desktop; **não reaberto** aqui.
- [SPEC-0062](SPEC-0062-desktop-dependency-autostart-default.md) (`Done`) — `DependencyManager.ensureSearchContainer`, posse como conjunto, memoização por nome, drenagem do `release()`, `readDependencyStatus`/`DependencyStatusSnapshot`, `#system-dependencies`, tabela exaustiva de textos pinados (D17), gesto fora do mutex de política (D8).
- [SPEC-0061](SPEC-0061-search-container-auto-start.md) (`Done`) — operações nomeadas e fixas, normalização única de entrada de borda, posse registrada no sucesso do `start`.
- [SPEC-0060](SPEC-0060-ollama-auto-start.md) (`Done`) — `createDependencyManager`/`ProcessPort`/`DependencyOutcome`, `resolveDependencyConfig`, `ollamaBaseUrl`, polling de prontidão.
- [SPEC-0054](SPEC-0054-desktop-environment-observability.md) (`Done`) — painel `Sistema`, timer único de 1000 ms com leitura a cada dois ticks, formatação pinada de bytes, regra "erro de painel fica no painel".
- [SPEC-0053](SPEC-0053-desktop-visual-layout.md) (`Done`) — layout v3.0, drawer overlay, manifesto de IDs estáticos, *progressive disclosure*.
- [SPEC-0058](SPEC-0058-untrusted-tool-output-framing.md) (`Done`) — postura sobre texto de terceiro não confiável entrando na janela/prompt (fundamento de **D10**).
- [SPEC-0051](SPEC-0051-desktop-cancel-in-flight-operation.md) (`Done`) — `cancelInFlightOperation()` síncrona como molde do gesto de cancelar.
- [ADR-0026 — Network Access Gate](../../06-adr/ADR-0026-network-access-gate.md) — **não reaberto**: o download não é Tool e não passa por `evaluate`/`netRoots` (ADR-0027(a)).
- [ADR-0013 — Permission Service como portão de execução](../../06-adr/ADR-0013-permission-service-execution-gate.md) — **não reaberto**.
- [ADR-0019 — Stack do desktop](../../06-adr/ADR-0019-desktop-electron-stack.md); [ADR-0006 — Precedência de fontes de configuração](../../06-adr/ADR-0006-config-source-precedence.md).
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — **Lifecycle Manager** (`packages/core`): "verificação de dependências", "ativação de componentes", "desligamento seguro".
- [PRD](../../02-product/ProductRequirementsDocument.md) — Provisionamento de Ambiente Local, Observabilidade do Ambiente, Critérios de Qualidade.
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigo 5 (Tools/adaptadores), Artigo 7 (transparência), Artigo 8 (consentimento), Artigo 11 (estado persistente).

---

# Escopo

## 1. `@atlas/core` — `ProcessPort` passa a ler o corpo do health-check

1.1. `packages/core/src/dependencies/process-port.ts` (mod) — `isOllamaRunning(baseUrl): Promise<boolean>` é **substituída** (D3) por uma única operação mais informativa, sobre a **mesma** requisição `GET <baseUrl>/api/tags` (ADR-0029(d)):

```ts
export type OllamaInspection =
  | { readonly running: false }
  | {
      readonly running: true;
      /** Nomes de `models[].name`; `undefined` = corpo ilegível/inesperado (D4). */
      readonly models: readonly string[] | undefined;
    };

/** `GET <baseUrl>/api/tags`; `running` sse `response.ok`. Nunca lança. */
inspectOllama(baseUrl: string): Promise<OllamaInspection>;
```

1.2. `packages/core/src/dependencies/node-process-port.ts` (mod) — implementação única, sem segunda requisição e sem mudar o contrato de invocação já pinado (timeout de 2000 ms, `response.ok` como único critério de "de pé"):
   - `response.ok === false` ou rejeição/timeout ⇒ `{ running: false }`;
   - `response.ok === true` e corpo JSON com `models` array ⇒ `{ running: true, models }`, onde `models` contém **apenas** os `name` que são `string` não vazia, na ordem do corpo, sem deduplicação e **sem nenhum outro campo** (digest, tamanho, data são ignorados);
   - `response.ok === true` com corpo não-JSON, `models` ausente ou não-array ⇒ `{ running: true, models: undefined }` — "de pé, presença de modelo desconhecida" (D4);
   - nunca lança.

1.3. Todos os pontos que hoje chamam `isOllamaRunning` passam a chamar `inspectOllama` e derivar `running` dele — health-check e polling de prontidão do `ensure` (`packages/core/src/dependencies/dependency-manager.ts`), **sem nenhuma outra mudança de comportamento**: mesma ordem, mesmos orçamentos (40 × 250 ms), mesmos desfechos de `DependencyOutcome`, mesma regra de posse.

## 2. `@atlas/core` — a lista de modelos viaja no próprio desfecho do Ollama

2.1. `dependency-manager.ts` (mod) — **`DependencyReport` sai byte a byte como está** (nenhum campo novo no topo); quem ganha o campo opcional são **exatamente as duas variantes** de `DependencyOutcome` em que a inspeção de fato ocorreu (D5, reescrita na 2ª rodada — N1 adotado). `outcomes` continua com dois elementos e ordem pinada:

```ts
export type DependencyOutcome =
  | { readonly dependency: 'ollama'; readonly status: 'disabled' }
  | {
      readonly dependency: 'ollama';
      readonly status: 'already-running';
      /**
       * Modelos observados no MESMO `GET /api/tags` do health-check
       * (ADR-0029(d)) — nenhuma requisição nova. Ausente = corpo ilegível
       * ("de pé, presença de modelo desconhecida", D4).
       */
      readonly models?: readonly string[];
    }
  | {
      readonly dependency: 'ollama';
      readonly status: 'started';
      /** Modelos da inspeção que ENCERROU o polling com sucesso. */
      readonly models?: readonly string[];
    }
  | {
      readonly dependency: 'ollama';
      readonly status: 'failed';
      readonly reason: OllamaFailureReason;
    }
  // as quatro variantes de 'search-container' saem intactas.
  | …;
```

   `DependencyReport` permanece `{ readonly outcomes: readonly DependencyOutcome[] }`.

2.2. Regra de preenchimento — **estrutural onde dá para ser estrutural** (N1):
   - `'disabled'` e `'failed'` (qualquer razão) ⇒ a variante **não tem o campo**: a ausência é garantida pelo tipo, não por disciplina de escrita, e um teste `@ts-expect-error` prova que ler `outcome.models` nessas variantes não compila;
   - `'already-running'` ⇒ presente sse a inspeção do health-check trouxe `models !== undefined`;
   - `'started'` ⇒ presente sse a inspeção **que encerrou o polling com sucesso** trouxe `models !== undefined`;
   - o campo nunca é inferido de uma inspeção anterior nem de um cache: é sempre o resultado da inspeção da própria chamada.

2.3. Consequência delimitada em `apps/desktop`: `readDependencyStatus()` passa a devolver, dentro do desfecho do Ollama, esse campo a mais. `#system-dependencies` e `formatOllamaDependencyLine` (SPEC-0062/D17) saem **sem uma linha alterada** — os textos são decididos só por `status`/`reason`, nunca por `models` (CA 51).

## 3. `@atlas/core` — `pullOllamaModel` na porta e o gesto no manager

3.1. `process-port.ts` (mod) — **uma** operação nomeada e fixa a mais (ADR-0027(b)/ADR-0029(b)); nenhuma porta de execução genérica, nenhum `run(command, args)`:

```ts
export interface ModelPullProgress {
  readonly model: string;
  /** Só números finitos e ≥ 0; ausentes enquanto o provedor não os informa. */
  readonly completedBytes?: number;
  readonly totalBytes?: number;
}

export interface ModelPullRequest {
  readonly baseUrl: string;
  readonly model: string;
  readonly signal: AbortSignal;
  readonly onProgress: (progress: ModelPullProgress) => void;
}

/** `POST <baseUrl>/api/pull`, corpo `{ name, stream: true }`. Nunca lança. */
pullOllamaModel(request: ModelPullRequest): Promise<ModelPullOutcome>;
```

3.2. `dependency-manager.ts` (mod) — tipos de desfecho, ao lado dos já existentes:

```ts
export type ModelPullFailureReason =
  | 'unreachable'    // a requisição não completou (Ollama fora do ar, recusa de conexão)
  | 'rejected'       // resposta HTTP não-ok (modelo inexistente no provedor, erro do daemon)
  | 'stream-failed'  // stream interrompido, linha de erro, ou fim sem linha de sucesso
  | 'invalid-model'  // formato de nome recusado pelo manager — a porta NÃO é tocada
  | 'busy';          // já existe um download em voo neste manager — nenhum 2º disparo

export type ModelPullOutcome =
  | { readonly status: 'installed'; readonly model: string }
  | { readonly status: 'cancelled'; readonly model: string }
  | {
      readonly status: 'failed';
      readonly model: string;
      readonly reason: ModelPullFailureReason;
    };
```

   A porta (item 3.1) devolve **apenas** `'installed'`/`'cancelled'`/`'failed'` com `'unreachable'`/`'rejected'`/`'stream-failed'`; `'invalid-model'` e `'busy'` são decisões do manager, tomadas **antes** de tocar a porta.

3.3. `node-process-port.ts` (mod) — contrato de invocação pinado **como dado desta SPEC** (mesma disciplina do contrato do Piper na SPEC-0040):
   - `POST <baseUrl>/api/pull`, cabeçalho `content-type: application/json`, corpo `JSON.stringify({ name: model, stream: true })`, `signal` repassado do `request`;
   - **sem timeout total** (um download de vários GB não tem orçamento fixo); o único fim antecipado é o `signal`;
   - resposta com `response.ok === false` ⇒ `{ status: 'failed', reason: 'rejected' }`, **sem ler o corpo**;
   - corpo lido como stream de linhas separadas por `\n` (NDJSON), cada linha não vazia parseada como JSON; linha ilegível é **ignorada** (nunca derruba o download);
   - de cada linha legível, **só** são extraídos `completed`/`total` — quando finitos e ≥ 0, emitidos por `onProgress` como `completedBytes`/`totalBytes`;
   - uma linha com `status === 'success'` (igualdade exata, comparação pinada) marca sucesso; uma linha com campo `error` presente encerra com `'stream-failed'`;
   - fim do stream **sem** linha de sucesso ⇒ `'stream-failed'`; rejeição do `fetch`/da leitura ⇒ `'unreachable'` (ou `'cancelled'`, quando o `signal` já estava abortado — ver 3.4);
   - **nenhum texto vindo do provedor cruza a porta** (D10): nem `status`, nem `error`, nem `digest` — só números e o desfecho classificado;
   - nunca lança.

3.4. Cancelamento (ADR-0029(h)) — o `AbortController` é criado e guardado pelo **manager** (D8); a porta apenas honra o `signal`:
   - abortar durante a requisição ou durante a leitura do stream ⇒ `{ status: 'cancelled', model }`, nunca `'failed'`;
   - o Atlas **não** remove, apaga nem inspeciona bytes parciais — o que o Ollama faz com eles é dele (ADR-0029(h)).

3.5. `DependencyManager` ganha **dois** membros, ao lado de `ensure`/`release`/`ensureSearchContainer` (assinaturas dos três **intactas**):

```ts
export interface DependencyManager {
  ensure(config: DependencyConfig): Promise<DependencyReport>;
  release(): Promise<void>;
  ensureSearchContainer(container: string): Promise<DependencyOutcome>;
  /** SPEC-0063: baixa UM modelo já nomeado pelo gesto humano. Nunca lança. */
  pullOllamaModel(request: {
    readonly baseUrl: string;
    readonly model: string;
    readonly onProgress?: (progress: ModelPullProgress) => void;
  }): Promise<ModelPullOutcome>;
  /** SPEC-0063: aborta o download em voo, se houver. Síncrona, idempotente. */
  cancelOllamaModelPull(): boolean;
}
```

3.6. Comportamento normativo de `pullOllamaModel`:
   - valida o **formato** do nome (D11) contra a regra pinada `^[a-z0-9][a-z0-9._/-]*(:[a-zA-Z0-9._-]+)?$`, com no máximo 128 caracteres; reprovado ⇒ `{ status: 'failed', model, reason: 'invalid-model' }` **sem tocar a porta**. O guarda é de **sintaxe**, não de caminho: ele admite sequências como `a/../../x` (consequência nomeada em **D29**, resposta a N3) — o nome aprovado só pode chegar a **um** lugar, o campo `name` do corpo JSON do `POST`, e nunca à URL, a argv, a caminho de arquivo ou a linha de comando (CA 54);
   - já existe um download em voo ⇒ `{ status: 'failed', model, reason: 'busy' }` **sem tocar a porta** e **sem** cancelar o download corrente (D9). O desfecho `'busy'` é a resposta **àquela chamada** e nunca vira o estado observável do download corrente — ver item 5.5 (B2/D9);
   - caso contrário cria um `AbortController` novo, guarda-o como o download corrente, delega à porta e, no `finally`, limpa o registro do download corrente — inclusive em `'cancelled'`/`'failed'`;
   - **nunca lança** e **nunca toca** os caminhos do Ollama-serve nem do container (nenhum `isOllamaRunning`/`inspectOllama`/`startOllama`/`stopOllama`/`inspectSearchContainer`/`startSearchContainer`/`stopSearchContainer` é chamado por este caminho);
   - **nunca é memoizado**: dois downloads sequenciais do mesmo modelo disparam duas requisições (o `Map` de containers não é reusado aqui).

3.7. `cancelOllamaModelPull()` — síncrona (molde de `cancelInFlightOperation`, SPEC-0051): chama `abort()` no controller corrente e devolve `true`; sem download em voo devolve `false` e é no-op. Uma segunda chamada seguida devolve `false`.

3.8. `release()` (mod, delimitado) — **aborta o download em voo antes de drenar** (D19): a drenagem da SPEC-0062/D21 (`Promise.allSettled` sobre `pending` + tentativas de container) sai intacta e passa a incluir a promessa do download, **precedida** por `cancelOllamaModelPull()`. Sem o abort, o `release()` esperaria um download de vários GB dentro do `before-quit`. `release()` continua nunca lançando, continua idempotente e continua sem derrubar nada de que a sessão não tem posse — um modelo baixado **não** é posse a desfazer.

3.9. `packages/core/src/index.ts` (mod) — exporta os tipos novos consumidos pelo `apps/desktop` (`ModelPullOutcome`, `ModelPullFailureReason`, `ModelPullProgress`, `OllamaInspection`), ao lado dos já exportados. **`createAtlas` e `createLifecycle` saem sem uma linha alterada** (ADR-0027(d)).

## 4. `apps/desktop` — catálogo curado e fixo (dado)

4.1. `src/model-catalog.ts` (**novo**) — dado local ao app (ADR-0029(e)), sem IO, sem rede, sem `electron`:

```ts
export interface CatalogModel {
  readonly name: string;        // referência técnica do Ollama
  readonly sizeLabel: string;   // string pinada, nunca calculada
  readonly description: string; // português, uma frase
  readonly recommended: boolean;
}
export const MODEL_CATALOG: readonly CatalogModel[];
export function findCatalogModel(name: string): CatalogModel | undefined;
export function isInstalledModel(name: string, installed: readonly string[]): boolean;
```

4.2. Conteúdo pinado do catálogo, nesta ordem (D12) — `llama3.2` primeiro e único `recommended: true`, por ser o modelo de `defaultConfig().model.model` (`packages/core/src/config/defaults.ts`):

| `name` | `sizeLabel` | `description` |
|---|---|---|
| `llama3.2` | `≈ 2 GB` | `Modelo geral leve — é o modelo que o Atlas usa por padrão.` |
| `llama3.1:8b` | `≈ 4,9 GB` | `Modelo geral mais capaz; peça 16 GB de memória ou mais.` |
| `qwen2.5:7b` | `≈ 4,7 GB` | `Bom equilíbrio entre português e raciocínio.` |
| `qwen2.5-coder:7b` | `≈ 4,7 GB` | `Especializado em programação e leitura de código.` |
| `gemma2:2b` | `≈ 1,6 GB` | `A menor opção — para máquinas com pouca memória.` |

   Os tamanhos são **aproximados e declarados**, nunca medidos em runtime; atualizar a tabela é mudança de dado revisável por PR (ADR-0029(e)).

4.3. `isInstalledModel` normaliza a **tag implícita** dos dois lados (D13): um nome sem `:` é comparado como `<nome>:latest`; a comparação é por igualdade exata após essa normalização (sem `toLowerCase`, sem correspondência parcial). `findCatalogModel` usa a mesma normalização para aceitar `llama3.2` e `llama3.2:latest` como a mesma entrada.

## 5. `apps/desktop` — estado, gesto e leitura no `core-bridge`

5.1. `src/core-bridge.ts` (mod) — tipos **locais ao app** (regra de tipos locais do `apps/desktop/CLAUDE.md`, sem promoção a `@atlas/contracts`):

```ts
export type ModelInstallState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running';
      readonly model: string;
      readonly completedBytes?: number;
      readonly totalBytes?: number;
    }
  | { readonly status: 'installed'; readonly model: string }
  | { readonly status: 'cancelled'; readonly model: string }
  | {
      readonly status: 'failed';
      readonly model: string;
      readonly reason: ModelPullFailureReason;
    };

export interface ModelCatalogEntryView {
  readonly name: string;
  readonly sizeLabel: string;
  readonly description: string;
  readonly recommended: boolean;
  /** Calculado no main (D24): o renderer não replica nenhuma regra de nome. */
  readonly installed: boolean;
}

/**
 * Três estados, não dois (D26, correção B1/B4 da 2ª rodada): "ainda não
 * sei porque o bootstrap não assentou" é um fato diferente de "não deu
 * para saber".
 */
export type InstalledModelsProbe =
  | { readonly status: 'pending' }
  | { readonly status: 'unknown' }
  | { readonly status: 'known'; readonly models: readonly string[] };

export interface ModelCatalogSnapshot {
  readonly catalog: readonly ModelCatalogEntryView[];
  readonly probe: InstalledModelsProbe;
  readonly install: ModelInstallState;
}
```

5.2. Estado de módulo do `core-bridge` (**nunca persistido**, Artigo 11; zerado por `__resetBridgeStateForTests()`):
   - `installedProbe: InstalledModelsProbe`, inicial `{ status: 'unknown' }` — *nenhum* bootstrap disparado ainda; passa a `{ status: 'pending' }` na **primeira linha** de `ensureExternalDependencies`, **antes do primeiro `await`**, e assenta em `'known'`/`'unknown'` quando aquele `ensure` devolve (item 5.6);
   - `bootstrapProbeSettled: Promise<void> | undefined` — *deferred* criado junto com a transição para `'pending'` e resolvido no `finally` daquele mesmo `ensureExternalDependencies` (inclusive se ele falhar). É o **promise de bootstrap que hoje `main.ts` descarta**, agora nomeado dentro do bridge; nenhum timer, nenhum canal de push, nenhuma requisição nova;
   - `modelInstallState: ModelInstallState`, inicial `{ status: 'idle' }`, atualizado pelo gesto e pelo `onProgress`;
   - `currentInstallModel: string | undefined` — o nome cujo download esta sessão está de fato conduzindo; posse do gesto, distinta do estado de apresentação (B2);
   - `resolvedDependencyConfig: DependencyConfig | undefined` — a config que o bootstrap de fato usou, gravada por `ensureExternalDependencies` (item 5.7, N2);
   - após um desfecho `'installed'`, o nome instalado é **acrescentado** à lista de `installedProbe` quando ela é `'known'`, sem duplicar uma entrada já presente pela regra de normalização do item 4.3; com `'pending'`/`'unknown'`, o desfecho **promove** o probe a `{ status: 'known', models: [<modelo>] }` — esta sessão viu, com prova própria, ao menos um modelo instalado (D6).

5.3. `readModelCatalog(): ModelCatalogSnapshot` — função **síncrona**, exportada, que compõe `MODEL_CATALOG` com `installedProbe` e `modelInstallState`. **Nunca** sobe o Core, nunca toca a porta, nunca marca operação em voo, **nunca espera** (mesma classe de `readTokenUsage`/`readDependencyStatus`). Uma entrada do catálogo só vem `installed: true` com `probe.status === 'known'`.

5.4. `whenModelProbeSettled(): Promise<ModelCatalogSnapshot>` (**novo**, correção B1) — o único caminho assíncrono de leitura, consumido **uma vez por sessão** pelo gatilho proativo do item 7.5:
   - `installedProbe.status !== 'pending'` ⇒ resolve **imediatamente** com `readModelCatalog()`;
   - `'pending'` ⇒ aguarda `bootstrapProbeSettled` e então resolve com `readModelCatalog()`;
   - **nunca rejeita** e **nunca lança**: um bootstrap que falha resolve o *deferred* do mesmo jeito, com o probe em `'unknown'` (fail-closed, nada acontece na janela);
   - não dispara requisição nova, não sobe o Core, não cria timer e não marca operação em voo. É espera sobre trabalho **já em curso** — não um round-trip novo (ADR-0029(d)/(g) preservados).

5.5. `installOllamaModel(model: string): Promise<ModelPullOutcome>` — gesto da GUI, ordem normativa e fail-closed (sequência corrigida em B2):
   1. `findCatalogModel(model)` ⇒ ausente: **rejeita** com `Error` de mensagem pinada (`MODEL_NOT_IN_CATALOG_MESSAGE`, constante exportada), sem tocar a porta e sem alterar estado (ADR-0029(b)/(e), D11);
   2. **guarda de posse, antes de qualquer escrita de estado**: `currentInstallModel !== undefined` ⇒ devolve `{ status: 'failed', model, reason: 'busy' }` **sem tocar a porta**, **sem** cancelar o download corrente (D9) e **sem alterar `modelInstallState`** — o estado segue descrevendo o download real, com seus bytes e sua via de cancelamento intactos;
   3. assume a posse (`currentInstallModel = model`) e grava `{ status: 'running', model }`, ambos **antes do primeiro `await`**;
   4. resolve o `baseUrl` pela origem única do item 5.7 (nunca um literal novo, nunca um segundo conceito de "onde o Ollama está");
   5. delega a `dependencyManager.pullOllamaModel({ baseUrl, model, onProgress })`; cada `onProgress` **substitui** o estado corrente por `{ status: 'running', model, completedBytes?, totalBytes? }` **somente enquanto `currentInstallModel === model`**;
   6. no desfecho: se a posse ainda é desta chamada, grava o estado final (`installed`/`cancelled`/`failed`) e a libera (`currentInstallModel = undefined`); `'installed'` também atualiza o probe (item 5.2). **Exceção única e explícita**: um desfecho `'busy'` vindo do manager (caminho defensivo — a guarda do passo 2 já o torna inalcançável pela GUI) é **devolvido ao chamador sem ser gravado** em `modelInstallState` e sem liberar posse alguma;
   7. **nunca lança** além do caso 1; a função **não** entra no mutex de política, **não** consulta `hasInFlightOperation()`, **não** encerra sessões de chat vivas e **não** altera `selectedPersonaId`/`selectedPermissionRoots`/`selectedNetworkAccess` (D18).

   Invariante resultante (verificada por CA 52): **nenhum desfecho `'busy'`, de nenhuma das duas camadas, jamais aparece em `modelInstallState`** — logo nunca apaga bytes de progresso nem some com o botão de cancelar de um download de GBs em curso.

5.6. `ensureExternalDependencies(env)` (mod, delimitado — correção B1) — mudanças **só** nas bordas da função; parsing de env, avisos pinados, ordem das duas dependências e valor de retorno saem byte a byte como estão:
   - **antes do primeiro `await`**: grava `installedProbe = { status: 'pending' }` e cria `bootstrapProbeSettled`;
   - grava `resolvedDependencyConfig` com a config montada (item 5.7);
   - ao devolver (em `try`/`finally`, cobrindo também o caminho de exceção, que hoje não existe): o desfecho do Ollama já encontrado por `report.outcomes.find(...)` decide o probe — `'already-running'`/`'started'` **com** `models` ⇒ `{ status: 'known', models }`; qualquer outro desfecho (inclusive `'disabled'`, `'failed'` e os dois acima **sem** `models`) ⇒ `{ status: 'unknown' }` — e o *deferred* é resolvido **sempre**, por último;
   - uma **segunda** chamada a `ensureExternalDependencies` (não existe em produção: `main.ts` chama uma vez por sessão) repete a mesma mecânica com um *deferred* novo.

5.7. Origem única da montagem de `DependencyConfig` no app (resposta a **N2**, adotada): um helper interno **não exportado**, `appDependencyConfig(overrides)`, é o **único** lugar de `core-bridge.ts` que chama `resolveDependencyConfig` — `ensureExternalDependencies` o usa com os valores resolvidos da env, e ninguém mais monta o literal à mão. O `baseUrl` do gesto de instalar vem de um segundo helper interno, `currentOllamaBaseUrl()`, que devolve `resolvedDependencyConfig?.ollamaBaseUrl` — **exatamente o valor que o bootstrap usou** — e só cai em `appDependencyConfig().ollamaBaseUrl` quando nenhum bootstrap rodou nesta sessão (inalcançável em produção, ver item 6.1). `currentOllamaBaseUrl()` **não** lê `process.env` e **não** emite nenhum `console.warn` — avisos de env continuam exclusivos do caminho de bootstrap.

5.8. `cancelModelInstall(): { readonly cancelled: boolean }` — síncrona, delega a `dependencyManager.cancelOllamaModelPull()` (molde de `cancelInFlightOperation`, SPEC-0051). Não altera `modelInstallState` por conta própria — quem grava `'cancelled'` é o desfecho do item 5.5.

5.9. `releaseExternalDependencies()` sai **sem mudança de assinatura**; a nova ordem (abort antes de drenar) vive dentro do `release()` do manager (item 3.8).

## 6. `apps/desktop` — IPC e preload

6.1. `src/main.ts` (casca fina, mod) — **quatro** canais novos, um por gesto (molde da SPEC-0054/D4 e da SPEC-0062):
   - `'atlas:models:read'` → `readModelCatalog()` (síncrono, consumido pelo tick do painel);
   - `'atlas:models:probe'` → `whenModelProbeSettled()` (consumido **uma vez**, no arranque do renderer — correção B1);
   - `'atlas:models:install'` → `(_event, model: string) => installOllamaModel(model)`;
   - `'atlas:models:cancel'` → `cancelModelInstall()`.

   Nenhum canal existente muda de nome ou de forma. **Uma única linha de `app.whenReady()` muda** (correção B1): a chamada já existente `void ensureExternalDependencies().then(…)` passa a vir **antes** de `createWindow()`, continuando sem `await` e com o mesmo corpo de log (`console.info`/`console.warn` por desfecho, narrowing por `outcome.dependency`, SPEC-0061). Motivo: `installedProbe` precisa estar em `'pending'` **antes** de existir uma janela capaz de emitir IPC — sem isso o gatilho proativo leria `'unknown'` e, corretamente fail-closed, não faria nada (o defeito exato apontado em B1). A inversão **não** atrasa a abertura da janela: a chamada segue disparada e descartada no mesmo tique síncrono, e a transição para `'pending'` ocorre antes do primeiro `await` de `ensureExternalDependencies` (item 5.6). `before-quit` sai inalterado.

6.2. `src/preload.cjs` (mod) — namespace novo, ao lado de `metrics`/`tokens`/`dependencies`:

```js
models: {
  read: () => ipcRenderer.invoke('atlas:models:read'),
  probe: () => ipcRenderer.invoke('atlas:models:probe'),
  install: (model) => ipcRenderer.invoke('atlas:models:install', model),
  cancel: () => ipcRenderer.invoke('atlas:models:cancel'),
},
```

## 7. `apps/desktop` — superfície visual (dentro do painel `Sistema`)

7.1. `src/renderer/index.html` (mod) — **seis** IDs novos, todos dentro de `#panel-system`, **abaixo** de `#system-dependencies` e **acima** de `#system-status` (nenhuma outra linha do painel muda de ordem):
   - `#model-catalog` (`<section>` contêiner, com título estático "Modelos de IA");
   - `#model-installed-state` (`<p>`);
   - `#model-catalog-list` (`<div>`, preenchido pelo renderer);
   - `#model-install-progress` (`<p>`, vazio no arranque);
   - `#model-install-cancel` (`<button type="button">`, rótulo `Cancelar download`, `hidden` no arranque);
   - `#model-install-status` (`<p>`, vazio no arranque).

   Um parágrafo estático de texto pinado explica que o Atlas baixa **apenas** modelos desta lista, pelo Ollama já em execução, e que o download pode ser interrompido a qualquer momento.

7.2. Manifesto de IDs estáticos: de **103** para **109** (103 + 6).

7.3. `src/renderer/renderer.js` (mod) — nenhum item de navegação novo no drawer (continua com sete), nenhum modal novo:
   - a lista é renderizada a partir de `ModelCatalogSnapshot.catalog`: por entrada, `<nome> — <sizeLabel> — <description>`, o sufixo pinado `(recomendado — é o modelo que o Atlas usa por padrão)` quando `recommended`, e **ou** o rótulo pinado `Instalado` (quando `installed`) **ou** um `<button type="button" data-model="<nome>">Instalar</button>`. Os botões por item **não** têm `id` (não entram no manifesto);
   - **fonte única do estado dos controles (correção B3, D27)**: uma flag de módulo do renderer, `modelInstallInFlight`, marcada **antes** do `invoke` e limpa no `.finally` dele, é a **única** origem de `disabled` dos botões de instalar e de `hidden`/`disabled` de `#model-install-cancel`, calculada **só** dentro de `refreshModelControls()` (molde literal de `refreshAskControls()`/`refreshChatControlsForMic()`) — nenhum `.then`/`.finally`/tick atribui `disabled`/`hidden` desses elementos diretamente;
   - o `install.status` lido pelo tick periódico é **derivado, nunca autoritativo** sobre controles: alimenta exclusivamente o **texto** de `#model-install-progress` (item 7.4/D20). A janela entre o desfecho e o próximo tick, que fazia as duas fontes divergirem, deixa de existir porque só uma delas decide;
   - clicar em `Instalar` chama `window.atlas.models.install(nome)`;
   - `#model-install-status` é pintado **somente** pelo desfecho do gesto (e pela rejeição do `invoke`, prefixada por `⚠️ `); `#model-install-progress` é pintado **somente** pela leitura periódica (D20) — nenhuma outra função do renderer toca esses dois elementos;
   - o gesto **não** entra na serialização de `chatTurnInFlight`/`askInFlight`/`micBusy()`/`policyApplicationInFlight` e **não** desabilita nenhum outro controle (D18).

7.4. `src/renderer/renderer.js` (mod) — leitura periódica: o mesmo tick de 2000 ms que já dispara `metrics.read()`/`tokens.read()`/`dependencies.read()` passa a disparar também `models.read()` (4º `invoke`, D14) — **nenhum timer novo**, mesma regra de não-reentrância e de descarte de resposta que chega após o painel fechar. O tick pinta **só texto**: `#model-installed-state` (tabela do item 7.6, quatro desfechos de `probe`), `#model-install-progress` e o rótulo `Instalado` das linhas do catálogo — **nunca** `disabled`/`hidden` de controle algum (B3/D27). Rejeição do `invoke` pinta o texto pinado de falha em `#model-installed-state` e em `#system-status`, **nunca** alimenta `#global-alert` nem `#presence-core[data-state="error"]` (regra da SPEC-0054 preservada).

7.5. **Gatilho proativo** (ADR-0029(j), D15/D16; sequência corrigida em B1) — no arranque do renderer, **uma** chamada a `window.atlas.models.probe()`, fora do tick do painel:
   - a promessa só assenta quando o bootstrap de dependências assenta (item 5.4) — isto é, quando `'pending'` virou `'known'` ou `'unknown'`. No cenário-alvo (Ollama ainda não de pé, auto-start ligado por repouso desde a SPEC-0062), ela espera o `inspectOllama` + `spawn` + polling terminarem, em vez de ler o estado antes de ele existir;
   - `probe.status === 'known'` com lista **vazia** ⇒ abre o drawer e ativa o painel `Sistema` disparando o **mesmo** `click()` do controle `[data-drawer-nav][aria-controls="panel-system"]` já existente (nenhum caminho paralelo de abertura, nenhum `startSystemPanelTimer()` chamado à mão), e move o foco para `#model-catalog`;
   - `'unknown'` ou lista não vazia ⇒ **nada acontece** (fail-closed);
   - acontece **no máximo uma vez por sessão da app**, controlado por uma flag de módulo do renderer; fechar o drawer não o reabre; nenhuma releitura periódica arma o gatilho de novo;
   - rejeição dessa chamada é silenciosa (nenhum `#global-alert`), pelo mesmo critério de 7.4;
   - **nenhum timer, nenhuma espera com teto e nenhum canal de push** entram por este caminho (Restrição 10, ADR-0029(g)): a única coisa nova é aguardar um trabalho que o main process já estava fazendo. O caso em que o bootstrap nunca assenta está nomeado no residual 12.

7.6. Tabela exaustiva de textos pinados (D21), comparados por igualdade em teste; **nenhuma `reason` crua aparece na interface**:

| Situação | Texto |
|---|---|
| `probe.status === 'pending'` | `Ainda verificando os modelos instalados…` (mesmo registro do `Ollama: ainda verificando…` de `#system-dependencies`, SPEC-0062/D17) |
| `probe.status === 'unknown'` | `Não foi possível verificar os modelos instalados nesta sessão.` |
| `'known'`, `models.length === 0` | `Nenhum modelo de IA instalado — escolha um da lista abaixo para instalar.` |
| `'known'`, `models.length === 1` | `1 modelo de IA instalado.` |
| `'known'`, `models.length > 1` | `<N> modelos de IA instalados.` |
| falha do `models.read()` | `Não foi possível ler o catálogo de modelos.` |
| `install.status === 'idle'` | *(vazio)* |
| `'running'` sem bytes | `Preparando o download de <modelo>…` |
| `'running'` com bytes | `Baixando <modelo>: <completos> de <total> (<P>%)` — bytes formatados pelo **mesmo** formatador do painel `Sistema` (base 1000, decimal `,`), `P` inteiro truncado; sem `totalBytes` válido, cai na linha anterior |
| `'installed'` | `Modelo <modelo> instalado.` |
| `'cancelled'` | `Download de <modelo> cancelado.` |
| `'failed'` / `unreachable` | `Não foi possível falar com o Ollama para baixar <modelo>. Verifique se ele está em execução e tente de novo.` |
| `'failed'` / `rejected` | `O Ollama recusou o download de <modelo> — o modelo pode não estar mais disponível no provedor.` |
| `'failed'` / `stream-failed` | `O download de <modelo> foi interrompido antes de terminar. Tente de novo.` |
| `'failed'` / `invalid-model` | `Nome de modelo inválido — a instalação foi recusada antes de qualquer download.` |
| `'failed'` / `busy` | `Já existe um download em andamento. Aguarde ele terminar ou cancele antes de iniciar outro.` — **só em `#model-install-status`** (resposta ao clique); `busy` nunca é estado de download e por isso nunca aparece em `#model-install-progress` (B2) |
| rejeição do `install` | `⚠️ ` + mensagem do erro (`MODEL_NOT_IN_CATALOG_MESSAGE` no caso do item 5.5.1) |

## 8. Testes

Conforme "Estratégia de Testes".

## 9. Documentação da própria SPEC

9.1. Nota de atualização no [ADR-0029](../../06-adr/ADR-0029-desktop-model-provisioning-assistant.md) registrando o contrato técnico que ele delegou: a **substituição** de `isOllamaRunning` por `inspectOllama` como forma de cumprir (d) sem round-trip novo; o campo opcional `models` nas duas variantes de desfecho do Ollama (e por que ele **não** mora no topo do `DependencyReport`); a assinatura real de `pullOllamaModel` (objeto com `signal`/`onProgress`, divergente do esboço posicional da cláusula (b) — divergência de **forma**, não de decisão); a regra de que nenhum texto do provedor cruza a porta; a superfície escolhida (seção dentro do painel `Sistema`, sem 8º item de drawer e sem modal novo); os **quatro** canais IPC; e o fato de o gatilho proativo de (j) **aguardar o bootstrap de dependências assentar** — espera sobre trabalho já em curso, sem timer, sem push e sem round-trip novo. **Sem alterar nenhuma cláusula (a)–(j).**

9.2. Nota **curta** de atualização no [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md) registrando que a `ProcessPort` foi estendida de forma aditiva por esta SPEC com uma operação **nomeada e fixa** (cláusula (b) satisfeita), que a cláusula **(h)** continua intacta (nenhum `pull`/`create`/`run` de container Docker é introduzido — a categoria de recurso é outra, ADR-0029(c)), e que `release()` passou a abortar o download em voo antes de drenar (extensão de (e)). O estado "inteiramente consumido" do ADR-0027 **não muda**: nenhuma cláusula nova é aberta, nenhuma SPEC candidata nova é nomeada.

9.3. `docs/03-architecture/ModuleCatalog.md` (mod, **uma linha** — correção B5): a lista "Inclui:" da seção **Lifecycle Manager** ganha, ao lado de "verificação de dependências" e "ativação de componentes", o item `provisionamento assistido de dependências locais, sob gesto humano explícito (ADR-0029(a))`. Nenhuma outra linha do arquivo muda — nenhuma responsabilidade é movida, nenhum módulo é criado, a Matriz de Autoridade sai intacta: o ADR-0029(a) (`Accepted`) já decidiu que provisionar é extensão do mesmo dono, e esta linha apenas sincroniza a documentação oficial com a decisão (Artigo 1). Ver **D30**. O arquivo entra também na lista de alvos do `doc-sync` da Definition of Done.

---

# Fora do Escopo

- **Não** oferecer a instalação pela CLI (`atlas model install`) — rejeitado nominalmente pelo ADR-0029 ("Alternativas Consideradas"). Diff esperado **vazio** em `apps/cli/src`.
- **Não** consultar API/registry de terceiro para **montar** o catálogo: nenhuma chamada de rede além do download em si (ADR-0029(e)). Nenhum `GET /api/tags` novo é introduzido só para checar presença de modelo (d).
- **Não** baixar nada automaticamente, nem "um modelo padrão" ao detectar ausência: detectar só abre a tela (ADR-0029(j), PRD "nunca automática sem uma ação explícita do usuário").
- **Não** abrir diálogo de consentimento (`ConfirmPort`, `permission-grant-dialog.ts`, `network-grant-dialog.ts`, `persona-delete-dialog.ts`) para instalar — o clique com o tamanho visível **é** o consentimento (ADR-0029(f)). Nenhum `showMessageBox` novo.
- **Não** introduzir canal de push (`webContents.send`) nem timer novo no renderer — progresso é polling no tick já existente (ADR-0029(g), D14). O candidato de Roadmap "canal de push avisando o renderer quando o trabalho abandonado assenta" **não** é consumido nem decidido.
- **Não** implementar cancelamento cooperativo do Runtime/Task Manager — o `AbortController` desta fatia é local a este gesto (ADR-0029(h)); o candidato maior segue aberto.
- **Não** remover, apagar, verificar integridade ou gerenciar de qualquer outra forma os modelos já instalados (nenhum `DELETE /api/delete`, nenhum `ollama rm`); nenhuma operação sobre containers Docker (ADR-0027(h) intacta).
- **Não** alterar `AtlasConfig.model.model` nem qualquer outro campo de configuração a partir do gesto de instalar; nenhuma superfície de escolha de modelo em runtime (residual 3).
- **Não** persistir nada: catálogo é constante de código; lista de modelos e estado do download são estado de sessão (Artigo 11). Nenhum arquivo novo escrito em disco pelo `apps/desktop`.
- **Não** promover nenhum tipo a `@atlas/contracts` (`ModelInstallState`/`ModelCatalogSnapshot`/`ModelCatalogEntryView` são locais ao app). Diff esperado **vazio** em `@atlas/contracts`.
- **Não** tocar `@atlas/permissions`, `evaluate`, `isContained`, `netRoots`, `ResourceType`/`ResourceRef`, `@atlas/runtime` nem o Tool Registry: baixar um modelo **não** é Tool e **não** concede acesso de rede (ADR-0027(a), ADR-0026 intacto).
- **Não** alterar `createAtlas`/`createLifecycle` nem seus hooks (ADR-0027(d)); **não** alterar `defaultConfig()`, `loadConfig`, `resolveDependencyConfig`, `parseBooleanSetting`, `parseContainerNameSetting`.
- **Não** alterar o comportamento já entregue de `ensure`/`ensureSearchContainer`/`readDependencyStatus`/`#system-dependencies` — a única mudança admitida no caminho do `ensure` é a troca interna de `isOllamaRunning` por `inspectOllama` (mesma requisição, mesmos desfechos) e o campo **opcional** novo no relatório.
- **Não** criar módulo, Tool, Skill, Persona, painel de drawer (8º item) ou diálogo modal novo; **não** alterar o layout v3.0 fora da seção nova dentro de `#panel-system`.
- **Não** exibir texto vindo do provedor (`status`, `error`, `digest`, nome de arquivo remoto) em nenhum ponto da janela (D10).
- **Não** supervisionar o ambiente depois da instalação: sem re-inspeção periódica, sem verificação de integridade do modelo baixado, sem gesto de "verificar modelos de novo" (residual 2).
- **Não** mostrar progresso fora do painel `Sistema` (sem indicador global, sem badge no drawer) — residual 4.
- **Não** emendar a Constituição, criar módulo novo, mover responsabilidade entre módulos nem abrir ADR novo — o ADR-0029 já decidiu a arquitetura desta fatia.

---

# Pré-requisitos

- [SPEC-0060](SPEC-0060-ollama-auto-start.md) — **Done** (`createDependencyManager`/`ProcessPort`/`DependencyOutcome`/`resolveDependencyConfig`, `ensureExternalDependencies`/`releaseExternalDependencies`).
- [SPEC-0061](SPEC-0061-search-container-auto-start.md) — **Done** (operações nomeadas e fixas, posse registrada no sucesso do start).
- [SPEC-0062](SPEC-0062-desktop-dependency-autostart-default.md) — **Done** (default invertido no desktop, `readDependencyStatus`, `#system-dependencies`, drenagem do `release()`, precedente D-A1 do fake tipado da CLI).
- [SPEC-0054](SPEC-0054-desktop-environment-observability.md) — **Done** (painel `Sistema`, timer único, formatador de bytes reusado aqui).
- [SPEC-0053](SPEC-0053-desktop-visual-layout.md) — **Done** (drawer, manifesto de IDs).
- [SPEC-0051](SPEC-0051-desktop-cancel-in-flight-operation.md) — **Done** (molde do gesto de cancelar síncrono).
- [SPEC-0031](SPEC-0031-desktop-foundation.md) — **Done** (`core-bridge.ts` testável sem Electron, `main.ts` casca fina).
- [ADR-0029](../../06-adr/ADR-0029-desktop-model-provisioning-assistant.md) — **Accepted** (não é SPEC, mas é a fonte da fatia); a revisão do PRD que ele exige como pré-condição **já está aplicada**.

---

# Critérios de Aceitação

Cada item é verificável mecanicamente (teste automatizado, `typecheck`, `lint` ou `grep` no diff).

**`@atlas/core` — inspeção do Ollama**

1. `ProcessPort.inspectOllama` existe e `isOllamaRunning` **não existe mais** em `packages/core/src` (`grep` por `isOllamaRunning` em `packages/core/src` não casa); `pnpm --filter @atlas/core typecheck` verde.
2. `nodeProcessPort().inspectOllama` faz **exatamente uma** requisição `GET <baseUrl>/api/tags` com timeout de 2000 ms (fetch fake) e devolve: `{ running: false }` para `response.ok === false`, para rejeição e para timeout; `{ running: true, models: ['a:latest'] }` para corpo `{"models":[{"name":"a:latest"}]}`; `{ running: true, models: [] }` para `{"models":[]}`; `{ running: true, models: undefined }` para corpo não-JSON, `models` ausente ou `models` não-array. Nunca lança.
3. Entradas malformadas dentro de `models` (item sem `name`, `name` vazio, `name` não-string) são **descartadas**, e os `name` válidos restantes são preservados na ordem do corpo.
4. Todos os CAs das SPECs 0060/0061/0062 sobre `ensure`/`release`/`DependencyReport.outcomes`/posse/memoização continuam verdes com a **mesma expectativa de comportamento**; só o nome/retorno da operação de inspeção muda nos fakes (ajuste mecânico, sem mudança de asserção sobre desfecho).

**`@atlas/core` — `models` no desfecho do Ollama**

5. `DependencyReport` sai **sem campo novo** (`Object.keys(report)` é exatamente `['outcomes']`); `ensure` com `autoStartOllama: false` devolve `'disabled'` com **zero** chamadas à porta, e um teste `@ts-expect-error` prova que `models` **não é acessível** nas variantes `'disabled'`/`'failed'` (a ausência é estrutural, não normativa — N1).
6. `ensure` com Ollama já de pé e corpo com dois modelos devolve `outcomes[0].status === 'already-running'` **e** `outcomes[0].models` com os dois nomes.
7. `ensure` que sobe o Ollama e confirma por polling devolve `'started'` **e** `models` vindo da inspeção que **encerrou** o polling (teste com corpos diferentes entre as tentativas prova que é a última, não a primeira).
8. `ensure` com desfecho `'failed'` (qualquer razão, inclusive `timeout`) devolve um desfecho sem `models`; corpo ilegível com Ollama de pé devolve `'already-running'` **sem** a chave (`'models' in outcome === false`).

**`@atlas/core` — `pullOllamaModel`**

9. `pullOllamaModel` existe em `DependencyManager` e `ProcessPort`; `ensure`/`release`/`ensureSearchContainer` mantêm assinatura idêntica.
10. Nome fora do formato pinado (`'a b'`, `'A/b'` com maiúscula inicial, string vazia, 129 caracteres, `'x:'`) ⇒ `'failed'`/`'invalid-model'` com **zero** chamadas à porta.
11. Um download em voo + segunda chamada ⇒ a segunda devolve `'failed'`/`'busy'` com **zero** chamadas novas à porta, e o download corrente **não** é abortado (o fake registra zero `abort`).
12. `nodeProcessPort().pullOllamaModel` faz **um** `POST <baseUrl>/api/pull` com `{ name, stream: true }` e o `signal` recebido; `response.ok === false` ⇒ `'failed'`/`'rejected'` **sem** ler o corpo.
13. Stream NDJSON com linhas `{"status":"pulling"}`, `{"status":"downloading","completed":10,"total":100}`, `{"status":"success"}` ⇒ `'installed'`, com **exatamente um** `onProgress` emitido, igual a `{ model, completedBytes: 10, totalBytes: 100 }`; linhas sem `completed`/`total` **não** emitem progresso; `completed`/`total` não finitos ou negativos são ignorados.
14. Linha ilegível no meio do stream é ignorada e o download conclui normalmente; linha com campo `error` ⇒ `'failed'`/`'stream-failed'`; fim do stream sem linha de sucesso ⇒ `'failed'`/`'stream-failed'`; rejeição do `fetch` ⇒ `'failed'`/`'unreachable'`.
15. **Nenhum texto do provedor escapa da porta** (D10): um teste com `status`/`error`/`digest` contendo textos arbitrários verifica que o `ModelPullOutcome` e todo `ModelPullProgress` emitidos contêm **apenas** `model` (o nome pedido pelo Atlas), `status`, `reason` do conjunto fechado e números.
16. `cancelOllamaModelPull()` durante um download devolve `true`, o `signal` passado à porta fica abortado, e a promessa do download resolve `{ status: 'cancelled', model }` — nunca `'failed'`. Sem download em voo devolve `false` e é no-op; segunda chamada seguida devolve `false`.
17. Após um desfecho qualquer, o registro de download corrente é limpo: uma nova chamada com o mesmo nome **tenta de novo** (o fake registra uma segunda requisição) — nenhuma memoização.
18. `pullOllamaModel` **nunca lança** (porta que rejeita em qualquer ponto ⇒ desfecho classificado) e **nunca** toca os caminhos de Ollama-serve/container: o fake registra zero `inspectOllama`/`startOllama`/`stopOllama`/`inspectSearchContainer`/`startSearchContainer`/`stopSearchContainer` em todos os cenários dos CAs 10–17.
19. `release()` com um download em voo: o `signal` é abortado **antes** da drenagem, `release()` resolve sem esperar o download inteiro (prova com uma porta cujo stream só assenta após o abort), não lança, e continua derrubando Ollama/containers possuídos exatamente como antes. `release()` **não** apaga nem toca bytes parciais (zero chamadas novas à porta além do abort).
20. `grep -R "shell: true" packages/core/src` não casa; `grep -RE "docker['\"]?\s*,\s*\[\s*['\"](run|create|pull|build|exec|rm|kill|compose)" packages/core/src` não casa; nenhum `DELETE`/`/api/delete` aparece em `packages/core/src`.
21. Nenhum teste desta SPEC invoca binário real, abre socket, spawna processo ou faz requisição de rede real.

**`apps/desktop` — catálogo**

22. `MODEL_CATALOG` tem exatamente as **cinco** entradas da tabela do item 4.2, nessa ordem, com os `name`/`sizeLabel`/`description` comparados por igualdade; exatamente **uma** entrada tem `recommended: true` e é `llama3.2`; um teste afirma que esse nome é igual a `defaultConfig().model.model` (o catálogo e o default da plataforma não podem divergir em silêncio).
23. `findCatalogModel` aceita `'llama3.2'` e `'llama3.2:latest'` como a mesma entrada, e devolve `undefined` para `'llama3.2:1b'`, `'mistral'` e `''`.
24. `isInstalledModel('llama3.2', ['llama3.2:latest'])` é `true`; `isInstalledModel('llama3.1:8b', ['llama3.1:70b'])` é `false`; lista vazia ⇒ sempre `false`.
25. `src/model-catalog.ts` não importa `electron`, não faz IO e não faz rede (`grep` por `import` no arquivo: nenhum módulo de Node/Electron).

**`apps/desktop` — estado e gesto**

26. `readModelCatalog()` é síncrona, devolve `probe: { status: 'unknown' }`, `install: { status: 'idle' }` e `catalog` com as cinco entradas (todas `installed: false`) antes de qualquer tentativa; **não** sobe o Core (teste com `createAtlas` espionado registra zero chamadas); `__resetBridgeStateForTests()` a devolve ao estado inicial.
27. Após `ensureExternalDependencies` cujo desfecho do Ollama traz `models: ['llama3.2:latest']`, `readModelCatalog().probe` é `{ status: 'known', models: ['llama3.2:latest'] }` e a entrada `llama3.2` do `catalog` vem `installed: true`; com desfecho `'already-running'` **sem** `models`, com `'failed'` ou com `'disabled'`, o probe assenta em `'unknown'` e nenhuma entrada fica marcada.
28. `installOllamaModel('mistral')` (fora do catálogo) **rejeita** com `MODEL_NOT_IN_CATALOG_MESSAGE`, o fake do manager registra **zero** `pullOllamaModel` e `readModelCatalog()` não muda.
29. `installOllamaModel('llama3.2')` grava `{ status: 'running', model: 'llama3.2' }` antes do primeiro `await` (verificável lendo `readModelCatalog()` com a promessa ainda pendente), repassa a `onProgress` para o estado (`completedBytes`/`totalBytes` visíveis no snapshot), grava o desfecho final e o devolve.
30. Desfecho `'installed'` acrescenta o modelo à lista de um probe `'known'` sem duplicar uma entrada já presente pela regra do item 4.3, e **promove** um probe `'pending'`/`'unknown'` a `{ status: 'known', models: [<modelo>] }`; `'cancelled'`/`'failed'` **não** alteram o probe.
31. `installOllamaModel` usa exatamente o `ollamaBaseUrl` da config que o bootstrap resolveu (o fake do manager recebe esse valor); `grep` mostra **uma única** ocorrência de `resolveDependencyConfig` em `core-bridge.ts` (o helper do item 5.7) e nenhum literal de URL novo (N2).
32. `cancelModelInstall()` é síncrona, delega ao manager e devolve `{ cancelled: true }` com download em voo / `{ cancelled: false }` sem download.
33. `installOllamaModel`/`cancelModelInstall` **não** encerram sessões de chat vivas, **não** alteram `selectedPersonaId()`/`selectedPermissionRoots()`/`selectedNetworkAccess()`, **não** marcam operação em voo (`hasInFlightOperation()` falso durante a chamada) e **não** são bloqueados por operação em voo nem por aplicação de política em curso.

**`apps/desktop` — IPC, preload e renderer**

34. `main.ts` registra **exatamente** os quatro canais novos, delegando a `readModelCatalog`/`whenModelProbeSettled`/`installOllamaModel`/`cancelModelInstall`; nenhum canal existente muda (teste de fiação, molde de `dependencies-wiring.test.ts`).
35. `preload.cjs` expõe `window.atlas.models.read`/`.probe`/`.install`/`.cancel` e nada mais; namespaces existentes inalterados.
36. `index.html` contém exatamente os seis IDs novos e o manifesto de IDs estáticos passa de **103** para **109**; `#model-catalog` fica entre `#system-dependencies` e `#system-status`, e o drawer continua com **sete** itens de navegação.
37. A lista renderiza uma linha por entrada do catálogo com nome, tamanho e descrição; a entrada recomendada mostra o sufixo pinado; entrada `installed: true` mostra o rótulo `Instalado` e **não** oferece botão de instalar.
38. Clicar num botão `Instalar` chama `window.atlas.models.install` com o `data-model` daquele item; enquanto a promessa está em voo, **todos** os botões de instalar ficam desabilitados e `#model-install-cancel` fica visível e habilitado; ao assentar (sucesso **ou** rejeição), os botões voltam e `#model-install-cancel` some. **Fonte única (B3/D27)**: o teste dispara um tick de leitura periódica **no meio** do download (e outro logo após o desfecho, antes do tick seguinte) e verifica que `disabled`/`hidden` desses controles **não mudam** por causa do tick — só `refreshModelControls()` os escreve, e só a flag `modelInstallInFlight` os decide (`grep`: nenhuma outra atribuição a `.disabled`/`.hidden` desses elementos em `renderer.js`).
39. `#model-install-cancel` chama `window.atlas.models.cancel()` e não é desabilitado por `chatTurnInFlight`/`askInFlight`/`micBusy()`/`policyApplicationInFlight` (teste de serialização, D18).
40. A tabela de textos do item 7.6 é pinada por teste, caso a caso — incluindo as **cinco** razões de falha, os dois estados de `'running'` (com e sem bytes), os **cinco** desfechos da linha de estado (`pending`/`unknown`/vazia/1/N) e a rejeição prefixada por `⚠️ `. Nenhuma `reason` crua (`unreachable`, `rejected`, `stream-failed`, `invalid-model`, `busy`) aparece no DOM. Um teste pina que `'pending'` e `'unknown'` produzem textos **diferentes** e que o de `'pending'` não afirma falha (B4).
41. `#model-install-status` é escrito **só** pelo gesto e `#model-install-progress` **só** pela leitura periódica (D20): um teste dispara um tick de leitura e verifica que `#model-install-status` permanece como estava, e vice-versa.
42. Com o painel `Sistema` aberto, o tick de 2000 ms dispara também `models.read()` (quatro `invoke` por tick de leitura), sem timer novo: o teste conta os timers criados e confirma que continua **um**; fechar o painel cancela tudo e uma resposta que chega depois é descartada.
43. **Gatilho proativo**: com `probe: { status: 'known', models: [] }` na resposta de `models.probe()`, o drawer abre no painel `Sistema` **uma única vez** (uma segunda resposta igual não reabre depois de o usuário fechar) e o foco vai para `#model-catalog`; com `'pending'`, `'unknown'` ou lista não vazia, o drawer **não** abre (nenhum `hidden = false` em `#panel-drawer`); a abertura passa pelo mesmo controle de navegação existente (o teste verifica que `startSystemPanelTimer` foi ativado pelo caminho normal, com um único timer).
44. Rejeição de `models.read()` pinta o texto pinado de falha em `#model-installed-state` e em `#system-status`, sem tocar `#global-alert` nem `#presence-core[data-state]`; rejeição de `models.probe()` (item 7.5) é silenciosa e não abre o drawer.
45. `apps/desktop/tests/renderer.speech-parity.test.ts` continua verde com `model-catalog.ts` **somado** à lista vigiada (seis → **sete** módulos-fonte), com seus exports classificados como `NOT_MIRRORED` e justificativa registrada — **zero réplica nova** no `renderer.js` (D24); diff **vazio** em `speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`, `hands-free.ts`, `system-metrics.ts`, `token-usage.ts`.
46. Diff **vazio** em `selectNetworkAccess`, `selectPermissionRoots`, `composeOverride`, `withSelections`, `ensureSearchContainer`, `readDependencyStatus` e nas quatro portas de diálogo; `grep` por `showMessageBox` no diff: **sem ocorrências**.

**Higiene global**

47. `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` verdes **na raiz** (os quatro comandos completos, obrigatórios antes de fechar).
48. Diff **vazio** em `packages/contracts`, `packages/permissions`, `packages/runtime`, `packages/tools`, `packages/cognitive`, `packages/skills`, `packages/memory`, `packages/context`, `packages/persona`, `packages/model-gateway` e `apps/cli/src` — exceção nomeada (precedente D-A1 da SPEC-0062, ver **D22**): `apps/cli/tests/auto-start-ollama.test.ts` recebe os membros novos no fake tipado de `DependencyManager`, de forma aditiva.
49. Nenhum arquivo novo é escrito em disco por nenhum caminho desta SPEC; nenhum estado novo é persistido; `packages/core/src/config/*` e `defaultConfig()` saem inalterados.
50. As notas de atualização dos itens 9.1/9.2 existem nos dois ADRs e **nenhuma cláusula** de ADR-0027 ou ADR-0029 tem seu texto alterado (verificável por diff: só as seções de "Atualização" mudam).

**Correções do 1º gate do `architecture-reviewer` (B1–B5, N1–N3)**

51. **(N1)** `readDependencyStatus()` continua devolvendo o desfecho do Ollama tal como o `ensure` o produziu, e `#system-dependencies` sai com os **mesmos textos** de antes com e sem `models` presente no desfecho (teste comparando as linhas pinadas de `formatOllamaDependencyLine` nos dois casos) — o campo novo é invisível para a SPEC-0062.
52. **(B2)** Com um download de `'llama3.2'` em voo e progresso já gravado (`completedBytes`/`totalBytes` visíveis), uma segunda chamada `installOllamaModel('gemma2:2b')`: (i) devolve `'failed'`/`'busy'`; (ii) registra **zero** `pullOllamaModel` novos e **zero** `abort`; (iii) deixa `readModelCatalog().install` **idêntico** ao de antes da segunda chamada — mesmo `model`, mesmos bytes, ainda `'running'`; e (iv) o desfecho do download original continua sendo gravado normalmente quando ele assenta. Um teste adicional injeta um manager fake que devolve `'busy'` mesmo sem posse registrada e prova que **nada** é gravado em `modelInstallState` nesse caminho.
53. **(B2, renderer)** No mesmo cenário, `#model-install-cancel` permanece visível e habilitado durante a recusa `'busy'` e `#model-install-progress` continua mostrando o progresso do download **original** (nunca o nome do 2º modelo); o texto de `'busy'` aparece **apenas** em `#model-install-status`.
54. **(N3)** O nome do modelo chega a exatamente **um** destino: o campo `name` do corpo JSON do `POST`. Um teste com `'a/../../x'` (aprovado pelo regex de formato) verifica que a URL requisitada é **byte a byte** `<baseUrl>/api/pull`, sem nenhum segmento derivado do nome, e `grep` prova que `packages/core/src/dependencies` não interpola `model` em nenhum caminho de arquivo, argv ou URL.
55. **(B1, main)** Teste de fiação de `app.whenReady()`: `ensureExternalDependencies` é invocada **antes** de `createWindow()`, no mesmo tique síncrono, sem `await` entre as duas, e o corpo de log por desfecho sai inalterado; `before-quit` sai inalterado.
56. **(B1, bridge)** Com um `ensure` fake que só assenta quando o teste mandar: `readModelCatalog().probe` é `{ status: 'pending' }` **imediatamente após** chamar `ensureExternalDependencies` (antes de qualquer `await`); `whenModelProbeSettled()` **não resolve** enquanto o `ensure` está pendente; resolve com `'known'`/`'unknown'` assim que ele assenta; e, chamada depois de assentado, resolve **imediatamente**. Um `ensure` que **rejeita** também resolve a promessa (probe `'unknown'`), e `whenModelProbeSettled()` **nunca rejeita**. Nenhum timer é criado por este caminho (o teste conta os timers do main process).
57. **(B1, ponta a ponta)** Cenário-alvo simulado: Ollama fora do ar no arranque, auto-start ligado, `ensure` demorando (fake com `sleep` controlado) e devolvendo `'started'` com `models: []` — a chamada de arranque do renderer espera e o drawer abre no painel `Sistema` **depois** de o bootstrap assentar. O mesmo cenário com `models: ['x:latest']` **não** abre o drawer.
58. **(B5)** `docs/03-architecture/ModuleCatalog.md` contém a linha nova na seção **Lifecycle Manager** e **nenhuma outra alteração** (diff de uma linha); a Definition of Done desta SPEC lista esse arquivo entre os alvos do `doc-sync`.

---

# Arquivos Esperados

```text
docs/implementation/specs/SPEC-0063-desktop-model-provisioning.md   (este arquivo)
docs/06-adr/ADR-0029-desktop-model-provisioning-assistant.md        (nota de atualização)
docs/06-adr/ADR-0027-external-process-lifecycle-management.md       (nota curta)
docs/03-architecture/ModuleCatalog.md                               (mod — 1 linha, Lifecycle Manager)

packages/core/src/dependencies/process-port.ts        (mod)
packages/core/src/dependencies/node-process-port.ts   (mod)
packages/core/src/dependencies/dependency-manager.ts  (mod)
packages/core/src/index.ts                            (mod — tipos novos exportados)
packages/core/tests/node-process-port.test.ts         (mod)
packages/core/tests/dependency-manager.test.ts        (mod)
packages/core/tests/model-pull.test.ts                (novo — CAs 9–19, se preferível ao arquivo acima)
packages/core/CLAUDE.md                               (mod — no doc-sync de fecho)

apps/desktop/src/model-catalog.ts                     (novo)
apps/desktop/src/core-bridge.ts                       (mod)
apps/desktop/src/main.ts                              (mod — quatro handlers novos)
apps/desktop/src/preload.cjs                          (mod — namespace `models`)
apps/desktop/src/renderer/index.html                  (mod — 6 IDs novos)
apps/desktop/src/renderer/renderer.js                 (mod)
apps/desktop/src/renderer/styles.css                  (mod, se necessário — layout v3.0 intacto)

apps/desktop/tests/model-catalog.test.ts              (novo)
apps/desktop/tests/core-bridge.models.test.ts         (novo)
apps/desktop/tests/core-bridge.dependencies.test.ts   (mod — fakes de `inspectOllama`)
apps/desktop/tests/dependencies-wiring.test.ts        (mod — quatro canais novos)
apps/desktop/tests/renderer.system-panel.test.ts      (mod)
apps/desktop/tests/renderer.boot.test.ts              (mod — gatilho proativo)
apps/desktop/tests/renderer.layout.test.ts            (mod — manifesto 103 → 109)
apps/desktop/tests/renderer.gesture-serialization.test.ts (mod)
apps/desktop/tests/renderer.speech-parity.test.ts     (mod — 7º módulo vigiado)
apps/desktop/tests/helpers/renderer-harness.ts        (mod — dublê de `window.atlas.models`)
apps/desktop/CLAUDE.md                                (mod — no doc-sync de fecho)

apps/cli/tests/auto-start-ollama.test.ts              (mod — fake tipado, D22/D-A1)
```

Dois arquivos **novos** de código são esperados: `apps/desktop/src/model-catalog.ts` (dado) — nenhum outro. Consolidar os arquivos de teste novos em arquivos existentes é ajuste aceitável.

---

# Componentes Impactados

- **Lifecycle Manager** (`packages/core`) — dono da capacidade (Module Catalog: "verificação de dependências", "ativação de componentes"; ADR-0029(a)). Ganha uma operação de porta, um gesto no manager, um campo opcional no relatório e o abort no `release()`.
- **`apps/desktop`** — `model-catalog.ts` (novo, dado), `core-bridge.ts` (estado, leitura síncrona, gesto, cancelamento), `main.ts` (quatro handlers), `preload.cjs` (namespace), renderer (seção nova no painel `Sistema` + gatilho proativo).

Explicitamente **não impactados**: Permission Service, Runtime, Task Manager, Tool Registry, Cognitive Core, Planner, Skill Registry, Memory Service, Context Service, Persona Service, Model Gateway, Configuration Service (`defaults`/`load-config`/`dependency-config`), `@atlas/contracts`, `apps/cli/src`.

---

# Interfaces Necessárias

1. `ProcessPort.inspectOllama(baseUrl): Promise<OllamaInspection>` (`@atlas/core`) — **substitui** `isOllamaRunning`; mesma requisição, corpo deixa de ser descartado.
2. `ProcessPort.pullOllamaModel(request: ModelPullRequest): Promise<ModelPullOutcome>` — operação nomeada e fixa (ADR-0027(b)), com `signal` e `onProgress`; nunca lança.
3. `models?: readonly string[]` nas variantes `'ollama'`/`'already-running'` e `'ollama'`/`'started'` de `DependencyOutcome` — campo opcional aditivo; `DependencyReport` e as variantes `'disabled'`/`'failed'`/de container saem intactas (N1).
4. `DependencyManager.pullOllamaModel({ baseUrl, model, onProgress? })` e `DependencyManager.cancelOllamaModelPull(): boolean` — membros aditivos; `ensure`/`release`/`ensureSearchContainer` inalterados.
5. `ModelPullOutcome` / `ModelPullFailureReason` / `ModelPullProgress` / `OllamaInspection` — tipos exportados de `@atlas/core`.
6. `MODEL_CATALOG` / `CatalogModel` / `findCatalogModel` / `isInstalledModel` (`apps/desktop/src/model-catalog.ts`) — dado local ao app.
7. `ModelCatalogSnapshot` / `ModelCatalogEntryView` / `ModelInstallState` / `InstalledModelsProbe` (`core-bridge.ts`) — tipos **locais ao app**, sem promoção a `@atlas/contracts`.
8. `readModelCatalog()` / `whenModelProbeSettled()` / `installOllamaModel(model)` / `cancelModelInstall()` (`core-bridge.ts`) e `MODEL_NOT_IN_CATALOG_MESSAGE` (constante pinada, exportada).
9. Canais IPC `'atlas:models:read'`, `'atlas:models:probe'`, `'atlas:models:install'`, `'atlas:models:cancel'`; `window.atlas.models.read`/`.probe`/`.install`/`.cancel`.

Nenhuma interface de `@atlas/contracts` é criada, alterada ou promovida.

---

# Fluxo Esperado

```text
Abertura da app, Ollama AINDA NÃO de pé, nenhum modelo baixado (cenário-alvo)

app.whenReady()
  ↓  ensureExternalDependencies(process.env)     [ANTES de createWindow(), sem await]
  ↓  probe := 'pending'                          (antes do 1º await)
  ↓  createWindow()                              (janela abre na hora, nada espera)
ensure(config) → inspectOllama → startOllama → polling (até 40×250 ms)
  ↓  outcome { dependency:'ollama', status:'started', models: [] }
  ↓  probe := { status:'known', models: [] }  +  deferred resolvido
renderer (arranque) → window.atlas.models.probe()   [espera o bootstrap assentar]
  ↓  probe.status === 'known' && models.length === 0
abre o drawer no painel `Sistema` (uma vez por sessão) → foco em #model-catalog

(bootstrap desligado / Ollama fora do ar / corpo ilegível ⇒ probe 'unknown' ⇒ nada acontece)
```

```text
Instalar um modelo

clique em "Instalar" (tamanho já visível na linha)
  ↓  window.atlas.models.install('llama3.2')
core-bridge.installOllamaModel → findCatalogModel (fora do catálogo ⇒ rejeita)
  ↓  posse livre? (não ⇒ 'busy', SEM tocar o estado do download corrente)
  ↓  currentOllamaBaseUrl()  [config que o bootstrap usou — origem única]
dependencyManager.pullOllamaModel({ baseUrl, model, onProgress })
  ↓  AbortController do manager  →  ProcessPort.pullOllamaModel(signal)
POST /api/pull (stream NDJSON) → onProgress(completedBytes/totalBytes)
  ↓                                     ↓
ModelPullOutcome → #model-install-status | tick de 2000 ms → models.read()
                                          ↓
                                    #model-install-progress

"Cancelar download" → models.cancel() → abort() → outcome 'cancelled'
before-quit → releaseExternalDependencies() → abort do download → drenagem → stops
```

---

# Estratégia de Implementação

1. `@atlas/core`: **primeiro** a substituição `isOllamaRunning` → `inspectOllama` (porta, adaptador, manager, fakes), com a suíte inteira verde e **nenhuma** expectativa de desfecho alterada — é refatoração pura antes de qualquer capacidade nova.
2. `@atlas/core`: `models` nas duas variantes de desfecho do Ollama, com a regra do item 2.2 (inclusive o teste `@ts-expect-error` que prova a ausência estrutural nas outras duas).
3. `@atlas/core`: `ModelPullOutcome`/`ModelPullProgress`, `ProcessPort.pullOllamaModel` (fake primeiro, adaptador real depois), guarda de formato, guarda de concorrência, `cancelOllamaModelPull`, e por último o abort dentro do `release()`.
4. `apps/desktop`: `model-catalog.ts` (dado + duas funções puras) com teste próprio.
5. `core-bridge.ts`: helper de config de origem única (item 5.7) → probe de três estados + *deferred* de bootstrap (itens 5.2/5.6) → `readModelCatalog`/`whenModelProbeSettled` → posse do gesto e `installOllamaModel`/`cancelModelInstall`.
6. `main.ts` + `preload.cjs`: quatro canais novos; inversão da ordem `ensureExternalDependencies` → `createWindow()` dentro de `app.whenReady()`; nenhum canal existente tocado.
7. `index.html`: seis IDs novos dentro de `#panel-system`; atualizar o manifesto no teste de layout.
8. `renderer.js`: renderização da lista, `refreshModelControls()` como origem única do estado dos controles, gesto de instalar/cancelar, 4º `invoke` no tick, gatilho proativo de arranque sobre `models.probe()`, tabela exaustiva de textos.
9. Registrar `model-catalog.ts` no gate de paridade como `NOT_MIRRORED`.
10. Notas de atualização nos ADRs 0029/0027 e a linha do Module Catalog (item 9.3).
11. Os quatro comandos completos na raiz.

---

# Estratégia de Testes

Nenhum teste desta SPEC pode spawnar processo real, tocar Ollama/Docker, abrir socket ou fazer requisição de rede real — toda borda é `fetch`/`spawn` fake, `ProcessPort` fake ou `DependencyManager` fake (`__setDependencyManagerForTests`).

- **`packages/core/tests/node-process-port.test.ts`** — CAs 2, 3, 12–15: inspeção (cinco formas de corpo), `POST /api/pull` (corpo, `signal`, resposta não-ok), stream NDJSON (progresso, linha ilegível, linha de erro, fim sem sucesso, rejeição), e a prova de que nenhum texto do provedor sai da porta.
- **`packages/core/tests/dependency-manager.test.ts`** (+ `model-pull.test.ts`, se dividido) — CAs 1, 4–11, 16–19, 54: `models` nos quatro desfechos (inclusive a prova de que vem da **última** inspeção do polling e o `@ts-expect-error` das variantes sem o campo), formato inválido, `busy`, cancelamento, ausência de memoização, isolamento em relação aos caminhos de Ollama-serve/container, `release()` abortando antes de drenar, destino único do nome do modelo, e a bateria das SPECs 0060/0061/0062 **sem mudança de expectativa**.
- **`apps/desktop/tests/model-catalog.test.ts`** (novo) — CAs 22–25, incluindo a igualdade entre a entrada recomendada e `defaultConfig().model.model`.
- **`apps/desktop/tests/core-bridge.models.test.ts`** (novo) — CAs 26–33, 52, 56: leitura síncrona antes/depois, recusa fora do catálogo, estado `'running'` antes do primeiro `await`, progresso refletido, desfechos finais, promoção do probe, `baseUrl` de origem única, `'busy'` que não sobrescreve o download corrente, probe `'pending'`/*deferred* de bootstrap, ausência de efeito sobre política/sessões/rastreio.
- **`apps/desktop/tests/core-bridge.dependencies.test.ts`** — ajuste dos fakes para `inspectOllama` + CAs 27 e 51 (semeadura do probe a partir do desfecho; `#system-dependencies` indiferente ao campo novo), sem mudança de expectativa nos casos herdados.
- **`apps/desktop/tests/dependencies-wiring.test.ts`** — CAs 34–35, 55 (ordem de `app.whenReady()`).
- **`apps/desktop/tests/renderer.system-panel.test.ts`** — CAs 37–42, 44, 53: lista, gesto, cancelamento, textos exaustivos, separação de painéis de pintura, fonte única dos controles sob tick concorrente, 4º `invoke` no mesmo tick, falha do `invoke`.
- **`apps/desktop/tests/renderer.boot.test.ts`** — CAs 43, 57: gatilho proativo nos quatro casos (`pending` que assenta vazia / assenta não vazia / `unknown` / rejeição), uma vez por sessão, abertura pelo controle existente, espera do bootstrap antes de abrir.
- **`apps/desktop/tests/renderer.layout.test.ts`** — CA 36.
- **`apps/desktop/tests/renderer.gesture-serialization.test.ts`** — CA 39.
- **`apps/desktop/tests/renderer.speech-parity.test.ts`** — CA 45.
- **Greps do diff** — CAs 1, 20, 21, 31, 38, 46, 48, 49, 50, 54, 58.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` estiverem verdes **na raiz**;
- as notas de atualização dos ADRs 0029/0027 estiverem escritas, sem alterar cláusulas;
- a linha nova do **Lifecycle Manager** estiver em `docs/03-architecture/ModuleCatalog.md` (item 9.3, CA 58);
- a documentação viva estiver sincronizada no passo de fecho `doc-sync` (`CLAUDE.md` raiz, `packages/core/CLAUDE.md`, `apps/desktop/CLAUDE.md`, **`docs/03-architecture/ModuleCatalog.md`**, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) — **não é escopo do `spec-implementer`**;
- as lições aprendidas estiverem registradas em `docs/implementation/LESSONS_LEARNED.md`;
- os residuais nomeados nas **Observações** estiverem registrados em `NEXT_CONTEXT.md`, não silenciados.

Smoke humano recomendado (não bloqueia fechamento documental, mas não conte como verificado sem ele): **(i) cenário-alvo de B1** — abrir a janela numa máquina com o Ollama **desligado** e nenhum modelo, e confirmar que a tela de catálogo aparece sozinha **depois** de o auto-start subir o daemon (não antes, não nunca); (ii) o mesmo com o Ollama já de pé; (iii) instalar o modelo recomendado e acompanhar o progresso; (iv) clicar em outro `Instalar` no meio do download e confirmar que a mensagem de "já existe um download" aparece **sem** apagar o progresso nem sumir com o botão de cancelar (B2/B3); (v) cancelar o download no meio; (vi) desligar o Ollama e tentar instalar (mensagem de `unreachable`, app segue funcionando).

---

# Restrições

1. Não criar módulo, Tool, Skill ou Persona novo; não mover responsabilidade entre módulos.
2. Não emendar a Constituição; não abrir ADR novo — o ADR-0029 já decidiu a arquitetura desta fatia.
3. Não alterar nenhuma cláusula do ADR-0027 ou do ADR-0029; só acrescentar seções de "Atualização".
4. Não tocar `createAtlas`/`createLifecycle`, `@atlas/contracts`, `apps/cli/src` nem os packages do CA 48 — exceção nomeada em **D22** para `apps/cli/tests/auto-start-ollama.test.ts`.
5. Não mudar, no `ensure`/`ensureSearchContainer`/`release`, nenhum desfecho, orçamento de polling, ordem de relatório ou regra de posse já pinados pelas SPECs 0060/0061/0062 — a única mudança admitida no caminho do `ensure` é a troca interna da operação de inspeção (mesma requisição) e o campo **opcional** novo nas duas variantes de desfecho do Ollama; no `release`, apenas o abort do download **antes** da drenagem já existente; em `ensureExternalDependencies`, apenas as bordas do item 5.6 (probe + *deferred*), sem tocar parsing de env, avisos ou ordem das dependências.
6. Não introduzir `shell: true`, execução de comando arbitrário, interpolação de string em argv ou qualquer operação Docker nova (ADR-0027(b)/(h)).
7. Não disparar download em nenhum caminho que não seja um clique humano explícito; nenhuma heurística de "instalar o recomendado sozinho" (ADR-0029(j), PRD).
8. Não abrir diálogo nativo novo nem reusar as portas de consentimento existentes para este gesto (ADR-0029(f)).
9. Não persistir nada em disco; nenhum estado novo sobrevive ao fechamento da app.
10. Não adicionar timer novo (renderer **ou** main process), dependência de runtime nova, ou alterar a CSP. A espera do gatilho proativo é sobre o *deferred* do bootstrap, **nunca** sobre um `setTimeout` de teto arbitrário.
11. Não exibir identificador cru de `reason` nem qualquer texto vindo do provedor na interface — só os textos pinados do item 7.6.
12. Não introduzir timeout total no download; o único fim antecipado é o `AbortSignal`.
13. Não deixar duas fontes decidirem o mesmo estado de interface: os controles de instalar/cancelar têm **uma** origem (`refreshModelControls()` sobre `modelInstallInFlight`) e a leitura periódica não escreve `disabled`/`hidden` em lugar nenhum (B3).
14. Não gravar um desfecho `'busy'` em `modelInstallState` por nenhum caminho (B2).
15. Não alterar `app.whenReady()` além da **inversão de ordem** descrita no item 6.1 — nenhum `await` novo, nenhum atraso na abertura da janela, nenhuma lógica de domínio no `main.ts`.

---

# Observações

**Residuais nomeados, registrados e não fechados por esta SPEC:**

1. **A lista de modelos é um retrato da sessão, não estado vivo** (D6): ela vem do `ensure` de bootstrap e cresce com o que esta sessão instalou. Um modelo instalado por fora (terminal, outro app) depois da abertura não aparece até reabrir a janela. Fechar isso exigiria um gesto de re-inspeção ou polling do `/api/tags`, deliberadamente fora desta fatia.
2. **Sem gesto de "verificar modelos de novo"** — corolário do residual 1; com o probe em `'unknown'` (Ollama fora do ar no arranque, auto-start desligado, corpo ilegível) a tela informa que não sabe, e só reabrir a app refaz a verificação.
3. **Instalar um modelo não altera `config.model.model`** (D25): se o usuário instalar algo diferente do modelo configurado, a conversa continua falhando por modelo ausente. Mitigado apenas pela ordenação e pelo rótulo do catálogo (o default da plataforma vem primeiro, marcado como recomendado, com CA que impede divergência silenciosa). Uma superfície de escolha de modelo em runtime é fatia própria.
4. **Progresso só é visível com o painel `Sistema` aberto** (D14/D20): fechar o drawer não interrompe o download, mas some com o indicador até reabrir. Um indicador global exigiria push ou um segundo timer, ambos fora de escopo (ADR-0029(g)).
5. **Bytes parciais de um download cancelado ficam por conta do Ollama** (ADR-0029(h)): o Atlas não limpa, não mede e não relata espaço ocupado por downloads interrompidos.
6. **Sem verificação de espaço em disco antes de começar** — um download de vários GB pode falhar por disco cheio no meio, e o desfecho será `'stream-failed'` (mensagem genérica de interrupção). Distinguir "disco cheio" exigiria parsear texto do provedor, o que **D10** proíbe.
7. **O catálogo fixo pode ficar desatualizado** — custo assumido pelo ADR-0029(e); manutenção editorial por PR, sem descoberta em runtime.
8. **`release()` aborta o download no `before-quit`** (D19): fechar a janela durante um download **interrompe** a transferência. É a leitura coerente do ADR-0027(e) (a sessão desfaz o que iniciou) e a única alternativa a segurar o encerramento da app por horas; ainda assim é uma perda de trabalho que o usuário pode não esperar, e fica registrada.
9. **`main.ts` continua chamando `releaseExternalDependencies()` com `void`, sem `await`** (residual 9 da SPEC-0062, não fechado aqui): o abort é emitido de forma síncrona dentro do `release()`, o que torna a interrupção **imediata**, mas o restante do desligamento segue "correto, não garantido".
10. **O download é egress que nenhum portão de política julga** — coerente com ADR-0027(a) (bootstrap de infraestrutura não é Tool e não passa por `evaluate`/`netRoots`), e é a mesma assimetria já registrada para o `@atlas/model-gateway` desde a SPEC-0004 e reiterada pela SPEC-0055. Nenhuma cláusula do ADR-0026 é reaberta; o alcance é estreito por construção (só o `baseUrl` do Ollama local, só nomes do catálogo fixo).
11. **A capacidade é só desktop** (ADR-0029, "Alternativas Consideradas"): quem usa a CLI continua rodando `ollama pull` por conta própria. Não fechado para sempre.
12. **Um bootstrap que nunca assenta deixa o gatilho proativo em espera indefinida** (registrado na 2ª rodada, junto com a correção B1): `whenModelProbeSettled()` espera o `ensure` do bootstrap, que é limitado no eixo do Ollama (2 s de inspeção + 40 × 250 ms de polling) mas **não** no eixo do container de busca — `docker start`/`spawn` seguem sem teto de tempo, o achado não-bloqueante ainda aberto da SPEC-0062. Consequência exata: com um `docker start` pendurado, a tela de catálogo não abre sozinha (o resto da janela funciona normalmente, e o painel `Sistema` continua alcançável pelo drawer). Fechar isso é dar teto de tempo às operações de processo do ADR-0027 — fatia própria, deliberadamente não feita aqui para não alterar desfechos pinados pelas SPECs 0060/0061 (Restrição 5).
13. **Um stream que para de emitir bytes sem fechar deixa `'running'` para sempre** (resposta a **N4**): a Restrição 12 proíbe, corretamente, timeout total no download — um `pull` de vários GB não tem orçamento fixo —, e nenhuma detecção de estagnação (silêncio prolongado entre linhas do NDJSON) é introduzida. O resgate é o cancelamento, e ele **continua disponível** exatamente porque a fonte única escolhida em B3 é a flag do gesto: enquanto a promessa do `invoke` não assentar, `#model-install-cancel` permanece visível e habilitado e o usuário pode abortar. Mesmo eixo do residual 12 e do achado aberto da SPEC-0062 (operações de processo sem teto de tempo); se um teto vier, que venha para os dois de uma vez.
14. **A fonte única dos controles vale por janela e por gesto** (D27/B3): se um dia existir um segundo ponto de entrada capaz de iniciar um download (outra janela, o canal IPC exercitado direto, um gesto futuro), a flag `modelInstallInFlight` daquela janela ficaria `false` e o botão de cancelar não apareceria, embora o download estivesse correndo — o `#model-install-progress` (pintado pelo tick, derivado do estado real) continuaria mostrando o progresso. Hoje não há segundo ponto de entrada; quando houver, a fonte única precisa migrar para o estado do bridge, o que exige o canal de push já nomeado como candidato de Roadmap.
15. **O guarda de formato do Core é sintático, não estrutural** (resposta a **N3**, D29): `^[a-z0-9][a-z0-9._/-]*(:[a-zA-Z0-9._-]+)?$` admite sequências como `a/../../x`. Não é vulnerabilidade nesta fatia — o nome só é usado como valor do campo `name` de um corpo JSON, nunca como caminho, argv ou segmento de URL (CA 54), e o pertencimento ao catálogo é checado no app antes (D11) —, mas `DependencyManager.pullOllamaModel` é membro **público** de `@atlas/core`: um chamador futuro que leve esse nome a um caminho de arquivo ou a uma linha de comando precisa validar por conta própria. Registrado para quem vier depois, não fechado aqui (fechar exigiria uma regra de pertencimento dentro do Core, o que ADR-0029(e) proíbe).

Antes de implementar:

- ler o ADR-0029 **inteiro** e as cláusulas (a)–(h) do ADR-0027;
- ler as SPECs 0054, 0060, 0061 e 0062 nas seções citadas;
- confirmar que nenhuma decisão desta SPEC exige ADR novo;
- identificar o módulo responsável (Lifecycle Manager, `packages/core`) e a borda (`apps/desktop`).

Durante a implementação:

- manter responsabilidade única: o manager decide, a porta faz IO, o `core-bridge` acumula estado, o renderer só formata;
- fazer a substituição `isOllamaRunning` → `inspectOllama` como passo isolado e verde antes de qualquer capacidade nova;
- não deixar nenhum texto do provedor atravessar a porta;
- pinar todo texto visível por constante comparada por igualdade em teste.

Após a implementação:

- rodar os quatro comandos completos na raiz;
- validar os CAs um a um;
- escrever as notas de atualização dos dois ADRs;
- registrar lições aprendidas e os **quinze** residuais acima.

---

# Resultado Esperado

Um usuário que nunca abriu um terminal instala o Atlas, abre a janela e — em vez de conversar com um assistente que não sabe responder — vê uma lista curta de modelos, cada um com tamanho e uma frase explicando para que serve, com o modelo padrão do Atlas em primeiro lugar. Um clique começa o download, o progresso aparece ali mesmo, e um botão interrompe se ele mudar de ideia. Se algo falhar, ele lê em português o que houve e pode tentar de novo; o resto do app continua funcionando como antes da tentativa.

Nada começa sozinho: sem o clique, o Atlas apenas informa que não há modelo instalado.

Arquitetonicamente, a fatia não inventa nada: o dono continua sendo o Lifecycle Manager, a `ProcessPort` ganha **uma** operação nomeada e fixa (nunca um verbo genérico de instalar), o catálogo é dado curado local ao app, o progresso reusa o mesmo idioma de leitura síncrona por polling das SPECs 0054/0062, e o cancelamento é um `AbortController` escopado a este gesto. `@atlas/contracts`, `apps/cli`, o Permission Service, o Runtime e as Tools saem com diff vazio; nenhuma cláusula de ADR é reaberta e a proibição de `pull` de container Docker (ADR-0027(h)) continua exatamente onde estava.

---

# Decisões de design

Formato de veto — cada decisão traz o porquê (rastreado à fonte) e a alternativa descartada. Quem as ataca é o `architecture-reviewer` no gate `Draft → Ready`.

**D1 — Perfil `completo`.**
*Porquê*: a fatia toca `packages/core` **e** `apps/desktop` (main, preload, renderer), cria um arquivo de código novo, quatro canais IPC e altera a superfície de duas interfaces públicas do Core (`ProcessPort`, `DependencyManager`) — falha em pelo menos três condições de `micro` do template.
*Alternativa descartada*: `micro`, alegando derivação integral do ADR-0029 — verdade para a *derivação*, falsa para o *alcance*; na dúvida o template manda `completo`.

**D2 — Prioridade `High`.**
*Porquê*: é a segunda metade do mesmo atrito de primeiro contato que o ADR-0028/SPEC-0062 tratou como `High` — com o Ollama de pé mas sem modelo, o app segue incapaz de responder ao público-alvo declarado ("um app para todos"), e o PRD ganhou uma subseção dedicada por causa disso.
*Alternativa descartada*: `Critical` — reservado a segurança/corrupção de dados; existe contorno conhecido (`ollama pull` no terminal).

**D3 — `isOllamaRunning` é *substituída* por `inspectOllama`, em vez de somar um membro novo à porta.**
*Porquê*: o ADR-0029(d) exige ler os modelos "do mesmo corpo já obtido", sem requisição nova. Manter as duas operações deixaria duas rotas para a **mesma** requisição `GET /api/tags` — a armadilha que a SPEC-0057/D21 já registrou (duas dependências independentes que divergem) — e uma delas ficaria morta assim que o manager migrasse. Uma operação, uma implementação, um round-trip.
*Alternativa descartada*: manter `isOllamaRunning` e acrescentar `inspectOllama`, com o adaptador derivando a primeira da segunda — menos churn em fakes de teste, mas deixa um membro de contrato público sem chamador real e duplica a superfície de uma porta que o ADR-0027(b) exige mínima.
*Consequência se estiver errada*: reverter é mecânico (reintroduzir o membro booleano derivado); nenhum comportamento de produção depende do nome.

**D4 — Corpo ilegível ⇒ `{ running: true, models: undefined }`, e `undefined` nunca dispara o catálogo.**
*Porquê*: "de pé" e "tem modelo" são fatos distintos, e confundi-los faria um corpo inesperado (versão futura do Ollama, proxy que reescreve resposta) parecer "zero modelos" e abrir a tela de instalação sozinho — automação a partir de um fato não observado, contra o ADR-0029(j). Fail-closed: desconhecido não age.
*Alternativa descartada*: tratar corpo ilegível como `models: []` — mais simples de tipar, mas transforma ruído em gatilho proativo.

**D5 (reescrita na 2ª rodada, N1 adotado) — A lista de modelos viaja como campo opcional **dentro das duas variantes de `DependencyOutcome` em que a inspeção ocorreu**, não no topo do `DependencyReport` nem por acessor síncrono novo no manager.**
*Porquê*: `'disabled'` e `'failed'` são exatamente os desfechos em que **nenhuma** inspeção bem-sucedida existiu — pendurar o campo nessas variantes seria mentira representável. Colocando `models?` só em `'already-running'`/`'started'`, a regra "`'failed'` ⇒ ausente" deixa de ser norma mantida à mão (e de ser verificada por CA de comportamento) e passa a ser **estrutural**, provada pelo `typecheck` (CA 5). Bônus de coesão: o desfecho do Ollama passa a carregar tudo o que aquela dependência observou, e o `core-bridge` já fazia `outcomes.find(o => o.dependency === 'ollama')` para alimentar `readDependencyStatus` — o probe é semeado do mesmo objeto, sem um segundo caminho de leitura. Continua aditivo: nenhum consumidor existente (CLI, fakes, testes das SPECs 0060/0061/0062, `#system-dependencies`) quebra, e `DependencyReport` sai byte a byte como está.
*Alternativa descartada*: `DependencyReport.ollamaModels` no topo (a decisão da 1ª rodada) — mais fácil de ler num relatório de duas dependências, mas obriga a manter à mão a correspondência entre um campo do topo e o desfecho lá dentro, com quatro linhas normativas que o compilador não verifica; e `readOllamaModels()` síncrono com cache no manager — mais membros, semântica temporal ambígua e um estado a resetar que ninguém pediu.
*Consequência aceita*: `readDependencyStatus()` passa a carregar o campo a mais dentro do desfecho do Ollama. `#system-dependencies` é indiferente a ele (CA 51), mas o dado trafega por um canal IPC que não precisa dele — custo pequeno e visível, preferível a uma invariante mantida por disciplina.

**D6 — Sem gesto de re-inspeção nesta fatia: a lista exibida é "o que o bootstrap viu" ∪ "o que esta sessão instalou".**
*Porquê*: a única razão de existir uma re-inspeção seria mostrar o modelo recém-instalado — e isso o próprio desfecho `'installed'` já prova, sem requisição nova (ADR-0029(d), que pede explicitamente para não abrir round-trips novos de descoberta). Mantém a fatia com **uma** operação de leitura na porta.
*Alternativa descartada*: um botão "Verificar modelos" chamando `inspectOllama` sob demanda — barato, mas acrescenta gesto, canal e estado para corrigir um caso (modelo instalado por fora durante a sessão) que o residual 1 cobre honestamente.

**D7 — `pullOllamaModel` recebe um objeto (`{ baseUrl, model, signal, onProgress }`), não a assinatura posicional esboçada no ADR-0029(b).**
*Porquê*: o `signal` é obrigatório para cumprir (h) e não aparece no esboço; parâmetros posicionais opcionais em sequência (`onProgress?`, `signal?`) produzem chamadas ilegíveis e ordem fácil de trocar. O ADR delegou explicitamente "o contrato técnico exato" à SPEC — a divergência é de **forma**, não de decisão (o nome e a fixidez da operação são preservados), e fica registrada na nota do item 9.1.
*Alternativa descartada*: manter `pullOllamaModel(baseUrl, model, onProgress?)` literal e guardar o `AbortController` num membro separado da porta — espalharia o cancelamento por dois membros e faria a porta guardar estado, contra o desenho "a porta executa, o manager decide" (SPEC-0060/D23).

**D8 — O `AbortController` é criado e guardado pelo *manager*; a porta só honra o `signal`.**
*Porquê*: posse de ciclo de vida é exatamente o que o `dependency-manager.ts` já centraliza (posse de processo, posse de container); o adaptador guarda no máximo *handles* de execução. Isso também permite `release()` abortar sem conhecer detalhes de HTTP.
*Alternativa descartada*: o `core-bridge` criar o controller e passar o `signal` por dois níveis — colocaria a decisão de cancelamento fora do dono nomeado pelo ADR-0029(a) e deixaria o `release()` do manager sem como interromper o download.

**D9 (princípio intacto, sequência corrigida na 2ª rodada — B2) — Um download por vez: a segunda tentativa concorrente devolve `'busy'`, **não** cancela a primeira e **não** toca o estado dela.**
*Porquê*: dois `pull` simultâneos de vários GB competindo por banda e disco é pior para o usuário do que uma recusa explicada, e um gesto de instalar nunca deve destruir o trabalho de outro gesto de instalar (o usuário não pediu isso). A 1ª rodada implementava isso na ordem errada — gravava `'running'` do 2º modelo antes de descobrir a recusa —, e o efeito era pior do que o problema evitado: o progresso do download real sumia, o `onProgress` dele passava a ser descartado e o botão de cancelar (visível só em `'running'` daquele modelo) desaparecia, tirando do usuário a única via de interromper uma transferência de GBs. A correção separa **posse** (`currentInstallModel`, tomada antes de qualquer escrita) de **apresentação** (`modelInstallState`): a recusa responde ao clique sem existir como estado.
*Alternativa descartada*: enfileirar os downloads — estado novo (fila, ordem, cancelamento parcial) para um caso de uso que a tela nem incentiva; "cancelar o anterior e começar o novo" — destrutiva sem consentimento; e **declarar `'busy'` inalcançável e removê-lo** (a outra saída que o gate ofereceu) — a guarda do bridge de fato o torna inalcançável pela GUI, mas `DependencyManager.pullOllamaModel` é membro público de `@atlas/core` e a guarda de concorrência precisa existir **lá**, com desfecho nomeado, em vez de depender do único chamador de hoje se comportar.

**D10 — Nenhum texto vindo do provedor (`status`, `error`, `digest`) atravessa a porta; só números e desfechos classificados.**
*Porquê*: é texto de terceiro não confiável entrando na janela — a mesma classe de risco que a SPEC-0058 endureceu no prompt e que a SPEC-0062/D17 já proibiu na interface ("nenhuma razão crua aparece"). Classificar na borda mantém a tradução exaustiva e testável, e impede que uma mensagem remota escolha o que o usuário lê.
*Alternativa descartada*: repassar `status`/`error` para exibir "o motivo real" — daria diagnóstico mais rico em inglês e incontrolável, e faria a interface mudar sozinha quando o provedor mudar de texto, sem gate.

**D11 — Duas camadas de validação, com responsabilidades distintas: formato no `@atlas/core`, pertencimento ao catálogo em `apps/desktop`.**
*Porquê*: o ADR-0029(b) exige que o nome seja validado contra o catálogo **antes** de tocar a porta, e o ADR-0029(e) coloca o catálogo no app — então o Core não pode conhecê-lo. Ainda assim, o Core não pode aceitar qualquer string num corpo de requisição: o guarda de formato é o análogo exato de `isValidContainerName` (SPEC-0061). Não há duplicação: são regras diferentes (sintaxe × pertencimento).
*Alternativa descartada*: injetar a lista de nomes permitidos no manager — moveria dado de produto para dentro do Core e criaria um segundo lugar onde o catálogo existe, contra ADR-0029(e).

**D12 — Catálogo com cinco entradas pinadas, `llama3.2` em primeiro e único `recommended`, amarrado por CA ao `defaultConfig().model.model`.**
*Porquê*: o ADR pede uma lista curada e fixa com "opções" (plural) — cinco cobre leve/equilibrado/código/mínimo sem virar uma vitrine; e a única forma de a instalação **resolver** o problema do usuário é o modelo instalado ser o que o Atlas usa por padrão, então a coincidência precisa de gate mecânico, não de boa vontade.
*Alternativa descartada*: uma lista maior com filtros por hardware — mais escolha, mas exigiria detecção de RAM/GPU (capacidade nova) e aumentaria a superfície editorial a manter desatualizada.

**D13 — Casamento de nome instalado normaliza a tag implícita `:latest` dos dois lados, com igualdade exata depois disso.**
*Porquê*: `/api/tags` devolve `llama3.2:latest` para um `ollama pull llama3.2` — sem normalizar, o catálogo marcaria como "não instalado" um modelo que está instalado, e o gatilho proativo ficaria certo por acidente. Igualdade exata (sem `toLowerCase`, sem prefixo) evita casar `llama3.2` com `llama3.2-vision`.
*Alternativa descartada*: comparação por prefixo antes de `:` — casaria variantes diferentes do mesmo tronco e mentiria sobre o que está instalado.

**D14 — Progresso acumulado no `core-bridge` (não no manager) e lido no **mesmo** tick de 2000 ms do painel `Sistema`, como 4º `invoke`.**
*Porquê*: o ADR-0029(g) manda usar "o mesmo formato leitura-síncrona de `readDependencyStatus`/`readTokenUsage`" — e esses dois acumulam no app, não no Core; o manager fica sem estado de apresentação, e o renderer reusa a máquina de timer já pinada pela SPEC-0054 (não-reentrância, descarte de resposta tardia, cancelamento ao fechar).
*Alternativa descartada*: `readModelPullProgress()` no `DependencyManager` — poria estado de UI dentro do Lifecycle Manager; e um timer próprio, mais rápido, para o download — proibido pela Restrição 10 e desnecessário para um download de minutos.

**D15 — A superfície é uma seção dentro do painel `Sistema`, com o gatilho proativo reusando o `click()` do controle de navegação existente — nem 8º item de drawer, nem modal novo.**
*Porquê*: o drawer da SPEC-0053 **já é** a máquina de overlay (backdrop, foco contido, `Escape`), e o painel `Sistema` já é a casa do estado do ambiente (`#system-dependencies` das dependências externas). Um modal novo duplicaria foco/backdrop/fechamento; um 8º item de navegação mexeria no layout v3.0 aprovado em smoke humano. Reusar o `click()` do controle evita um segundo caminho de abertura de painel (e o timer do painel sobe pelo caminho normal, sem chamada manual).
*Alternativa descartada*: modal dedicado no arranque (`#model-install-dialog`) — mais "assistente de instalação", mas cria a segunda superfície de overlay do app e um caminho de foco que ninguém testou; e um item de drawer próprio ("Modelos") — mais descobrível, porém altera a navegação fixada pela SPEC-0053 sem necessidade.

**D16 — O gatilho proativo dispara no máximo uma vez por sessão, e só com lista conhecida e vazia.**
*Porquê*: ADR-0029(j) ("detectar só abre a tela") combinado com a regra de não ser intrusivo: reabrir o drawer a cada leitura periódica sequestraria o foco enquanto o usuário faz outra coisa. "Conhecida e vazia" é a única condição que prova a ausência (D4).
*Alternativa descartada*: reabrir sempre que a lista estiver vazia — insistente; e nunca abrir, deixando só a linha de estado — negaria o gatilho proativo que o ADR decidiu.
*Emenda da 2ª rodada (B1)*: "uma vez por sessão" continua valendo, mas a **única** leitura passa a ser a que **espera o bootstrap assentar** (D26) — antes, ela corria contra ele e perdia.

**D17 — Instalar não abre diálogo de consentimento; o tamanho fica visível na própria linha antes do clique.**
*Porquê*: literal do ADR-0029(f) — clicar numa lista onde o tamanho já está visível **é** o consentimento (Artigo 8); reusar o `ConfirmPort` misturaria "ação destrutiva que o modelo pediu" com "escolha de infraestrutura feita só pelo humano", exatamente a distinção que a SPEC-0062/D7 preservou.
*Alternativa descartada*: um quinto diálogo fail-closed ("isto vai baixar N GB") — cobraria duas confirmações pelo mesmo ato deliberado e contrariaria a leitura explícita do ADR.

**D18 — O gesto fica fora do mutex de política, fora de `hasInFlightOperation()` e fora da serialização do renderer.**
*Porquê*: não sobe Core, não executa Tool, não altera `AtlasConfig` nem política alguma — as três razões pelas quais aqueles mecanismos existem (SPECs 0038/0050/0051/0059), e o mesmo critério já aplicado ao gesto do container (SPEC-0062/D8). Bloquear um download durante um turno de chat seria recusa espúria.
*Alternativa descartada*: entrar no mutex "por precaução" — travaria as duas aplicações de política durante um download de minutos, o pior caso já registrado no gate da SPEC-0059.

**D19 — `release()` aborta o download em voo **antes** de drenar.**
*Porquê*: a drenagem da SPEC-0062/D21 existe para não perder posse de container; aplicá-la a um download de vários GB faria o `before-quit` esperar por horas (ou, na prática, ser morto no meio). Abortar primeiro mantém a drenagem correta e faz a promessa assentar imediatamente. Não há posse a desfazer num modelo baixado — ele é do usuário, não da sessão.
*Alternativa descartada*: deixar o download seguir em segundo plano depois do `before-quit` — o processo do Electron morre e o `fetch` morre junto de qualquer jeito, então "seguir" é ilusório; e esperar a conclusão — inaceitável para fechar uma janela.

**D20 — Dois elementos, dois pintores: `#model-install-status` só pelo gesto, `#model-install-progress` só pela leitura periódica.**
*Porquê*: a mistura "resultado do meu clique × estado da sessão" no mesmo elemento é a classe de bug que a SPEC-0059/D17 registrou e a SPEC-0062/D15 eliminou — separar dá uma regra trivial de verificar mecanicamente (CA 41).
*Alternativa descartada*: um elemento único mostrando "o que estiver mais recente" — duas fontes pintando o mesmo nó, com corrida garantida entre o tick e o desfecho.

**D21 — Tabela exaustiva de textos em português, pinados por constante, para os **cinco** estados de lista, os dois de `'running'` e as cinco razões de falha.**
*Porquê*: o público desta tela é quem "não sabe subir infraestrutura" (ADR-0028); `stream-failed` não informa essa pessoa. Pinar por constante torna cada texto verificável por igualdade (disciplina das SPECs 0054/0060/0061/0062) e impede que uma razão nova apareça na janela sem passar por gate.
*Alternativa descartada*: interpolar a `reason` entre parênteses para diagnóstico — aceitável em log de desenvolvedor, não na janela (e proibido para texto de terceiro por D10).

**D22 — `apps/cli` sai com diff vazio em `src`; só o fake tipado de teste é atualizado.**
*Porquê*: o ADR-0029 rejeita nominalmente a via de CLI nesta fatia, e o que ele protege é o **comportamento** da CLI. Como `apps/cli/tsconfig.json` inclui `tests/**/*.ts` no typecheck e `DependencyManager` ganha membros obrigatórios, o literal tipado daquele arquivo deixaria de compilar — mesma situação e mesma solução do ruling D-A1 da SPEC-0062.
*Alternativa descartada*: declarar os membros novos como opcionais na interface — enfraqueceria o contrato público de `@atlas/core` para todo consumidor real só para acomodar um dublê de teste.

**D23 — Nada novo é persistido: catálogo é constante de código; lista de modelos e estado do download são estado de sessão.**
*Porquê*: Artigo 11 e a fronteira já estabelecida para Persona/permissões/rede/dependências no desktop. O que é durável do download é o próprio modelo em disco — e quem o guarda é o Ollama, não o Atlas.
*Alternativa descartada*: cachear a lista de modelos entre sessões para pular a verificação — faria a tela mentir sobre o ambiente presente, exatamente o defeito do residual 1 elevado a permanente.

**D24 — `model-catalog.ts` entra na lista vigiada do gate de paridade com entradas `NOT_MIRRORED`, e o renderer recebe `installed` já calculado pelo main.**
*Porquê*: precedente literal da SPEC-0054 (`system-metrics.ts`/`token-usage.ts` entraram vigiados com zero réplica). Calcular a normalização de tag no main evita a 11ª réplica em `renderer.js` — e réplica é justamente a classe de deriva que o gate existe para pegar (duas vezes ocorrida, SPECs 0043/0047).
*Alternativa descartada*: mandar `MODEL_CATALOG` cru e deixar o renderer decidir o que está instalado — replicaria `isInstalledModel` em JS, criando dívida que o próprio gate mandaria registrar.

**D25 — Esta SPEC não corrige a divergência "modelo instalado ≠ modelo configurado"; mitiga só pela ordem e pelo rótulo do catálogo.**
*Porquê*: alterar `AtlasConfig.model.model` a partir de um clique é mudança de configuração em runtime — eixo que hoje só existe para Persona/permissões/rede, cada um com sua SPEC e (quando houve aumento de privilégio) seu consentimento. O ADR-0029 não decidiu isso, e decidir aqui seria expandir escopo por conta própria. O CA 22 impede que catálogo e default divirjam em silêncio, que é a parte barata e verificável do problema.
*Alternativa descartada*: instalar e, em seguida, selecionar o modelo instalado como o corrente — resolveria o caso de ponta a ponta, mas cria uma superfície de configuração nova, sem ADR, com pergunta aberta de persistência (a seleção sobreviveria ao fechamento?) — exatamente o tipo de decisão que a Emenda v1.1 manda escalar, não resolver de carona.

---

**Decisões acrescentadas na 2ª rodada (respostas a B1–B5, N2–N4).**

**D26 — O probe de modelos tem três estados (`pending`/`unknown`/`known`), e o gatilho proativo espera o `pending` assentar por meio do *deferred* do bootstrap — nunca por timer, push ou requisição nova.**
*Porquê*: o defeito apontado em B1 é de **corrida, não de regra**: `createWindow()` roda antes do `void ensureExternalDependencies()` e a leitura de arranque chegava enquanto o `ensure` ainda gastava inspeção (2 s) + `spawn` + polling (até 10 s). No cenário-alvo — o único que a SPEC existe para resolver, Ollama ainda não de pé com auto-start ligado por repouso desde a SPEC-0062 — a leitura caía sempre no ramo "desconhecido ⇒ nada acontece" e o usuário **nunca** via a tela, com o Objetivo 1 e o "Resultado Esperado" letra morta. Separar "ainda não sei" de "não deu para saber" é o que permite **esperar** em vez de fechar, mantendo o fail-closed intacto (só `'known'` e vazio age, D4/D16). A espera é sobre trabalho **já em curso** no main process: nenhum round-trip HTTP novo (ADR-0029(d)), nenhum canal de push (ADR-0029(g)), nenhum timer (Restrição 10). A inversão de uma linha em `app.whenReady()` (item 6.1) fecha a janela de corrida restante — a transição para `'pending'` passa a ser anterior à existência de uma janela capaz de emitir IPC.
*Alternativa descartada*: **(i)** deixar o tick periódico armar o gatilho quando a lista virasse conhecida — o tick só existe com o painel `Sistema` aberto, e o painel só abre pelo gatilho: dependência circular, exatamente o que B1 descreveu; **(ii)** `setTimeout` de alguns segundos antes de ler — teto arbitrário, timer novo (Restrição 10), e erraria nas duas pontas (máquina lenta perde, máquina rápida atrasa); **(iii)** `webContents.send` avisando o renderer quando o bootstrap assenta — resolveria bem, mas implementa de carona o canal de push que o ADR-0029(g) rejeitou e que o Roadmap mantém como candidato próprio; **(iv)** `await ensureExternalDependencies()` antes de `createWindow()` — atrasaria a abertura da janela em até ~12 s, ferindo ADR-0027(f).
*Consequência aceita*: se o bootstrap nunca assentar (`docker start` pendurado, achado aberto da SPEC-0062), a tela não abre sozinha — residual 12, nomeado e não silenciado.

**D27 — Fonte única do estado dos controles: a flag do gesto (`modelInstallInFlight`) decide `disabled`/`hidden`; a leitura periódica é derivada e só pinta texto.**
*Porquê*: a 1ª rodada tinha duas autoridades sobre os mesmos nós (flag do renderer × `install.status` lido a cada 2000 ms), que divergem por até um tick inteiro entre o desfecho e a próxima leitura — a mesma classe de bug que `refreshAskControls()`/`refreshChatControlsForMic()` já eliminaram no app ao proibir `.finally` de atribuir `disabled`/`hidden` direto. Escolher a flag como autoridade casa a visibilidade do "Cancelar" com a **duração real do gesto** (a promessa do `invoke`), que é exatamente o intervalo em que cancelar faz sentido — inclusive num stream estagnado, em que o estado derivado continuaria `'running'` para sempre (residual 13).
*Alternativa descartada*: eleger `install.status` (o estado do bridge) como autoridade — mais "verdadeiro", porém atrasado em até 2 s, e sujeito ao painel estar aberto (sem painel não há tick, e o botão ficaria sem atualização); manter as duas e "sincronizar" — é a definição do problema, não a solução.
*Consequência aceita*: um segundo ponto de entrada futuro para iniciar downloads não ganharia o botão de cancelar nesta janela — residual 14.

**D28 — `resolveDependencyConfig` é chamado num **único** ponto de `core-bridge.ts`, e o `baseUrl` do gesto é o que o bootstrap de fato usou.**
*Porquê*: resposta a N2, adotada. Duas montagens independentes da mesma config convergem hoje só porque `resolveOllamaBaseUrl` ignora `dependencies` — é precisamente a armadilha de "duas dependências independentes que divergem em silêncio" que a SPEC-0057/D21 já pagou uma vez. Com um helper de montagem (`appDependencyConfig`) e um de leitura (`currentOllamaBaseUrl`, que devolve o valor gravado pelo bootstrap), instalar passa a falar com **o mesmo** Ollama que o auto-start cuidou, por construção e não por coincidência.
*Alternativa descartada*: manter os dois literais e cobrir a convergência por teste — o teste provaria o hoje, não a regra; e fazer o gesto reparsear a env — traria `console.warn` de bootstrap para dentro de um clique, poluindo um caminho que não tem nada a ver com configuração.

**D29 — O guarda de formato do Core permanece sintático, e a sua folga fica registrada como consequência nomeada para chamadores futuros.**
*Porquê*: resposta a N3. Apertar o regex para proibir `..` seria tratar o nome como caminho — ele não é: nesta fatia ele tem **um** destino, o campo `name` de um corpo JSON (CA 54 fixa isso mecanicamente), e o pertencimento é decidido no app, onde o catálogo mora (ADR-0029(e)/D11). Mas `DependencyManager.pullOllamaModel` é membro público de `@atlas/core`, então a folga não pode ficar implícita: vai para o residual 15, endereçada a quem um dia levar esse nome a um caminho ou a uma linha de comando.
*Alternativa descartada*: endurecer o regex agora (proibir `..`, `//`, `/` inicial) — daria falsa sensação de segurança de caminho num valor que não é caminho, e pode recusar nomes legítimos de namespace do provedor (`biblioteca/modelo`); e mover o pertencimento ao catálogo para dentro do Core — proibido por ADR-0029(e).

**D30 — A linha nova no Module Catalog é sincronização documental da decisão já tomada pelo ADR-0029(a), não decisão nova — e o arquivo entra no `doc-sync` da DoD.**
*Porquê*: resposta a B5. O Artigo 1 exige que nenhuma decisão arquitetural exista só no código, e o ADR-0029(a) (`Accepted`) já decidiu que provisionar é extensão de "verificar/ativar" do mesmo dono. Deixar o Module Catalog dizendo menos do que o ADR decidiu é exatamente a inconsistência entre documentos que o Artigo 8 dos invariantes manda não deixar passar. Uma linha, na seção do dono, sem mover nada.
*Alternativa descartada*: não tocar o Module Catalog, alegando que o ADR basta — cria divergência permanente entre a fonte de consulta obrigatória antes de mexer em qualquer módulo e a decisão vigente; e reescrever a responsabilidade do Lifecycle Manager — seria decisão nova (escalação), não sincronização.
