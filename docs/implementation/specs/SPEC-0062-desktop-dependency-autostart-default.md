# SPEC-0062 — Auto-start sempre-ativo no desktop + container de busca pela GUI

> **Project Atlas — Implementation Specification**

Template: 1.2

---

# Informações Gerais

**ID**

SPEC-0062

---

**Título**

Auto-start do Ollama ligado **por padrão** no `apps/desktop` (env explícita como via de desligamento) e campo de nome do container Docker do provedor de busca no painel de rede/busca, com a tentativa automática auditável no painel `Sistema`.

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

Duas rastreabilidades, ambas registradas explicitamente:

1. **Fase 2 — 2.4 Persistência e Gerência Local** — *estende, sem reabrir*, exatamente no molde que a [SPEC-0059](SPEC-0059-desktop-network-search-gui.md) já usou para o item (fechado por inteiro desde a SPEC-0038): a mesma classe de gesto ("configuração por interface gráfica", agora sobre o eixo de dependência externa, que não existia quando o item fechou). O campo novo vive no mesmo painel entregue pela SPEC-0059.
2. **Exceção consciente registrada**, como nas SPECs [0060](SPEC-0060-ollama-auto-start.md) e [0061](SPEC-0061-search-container-auto-start.md): nenhum item de `docs/04-engineering/Roadmap.md` cobre "auto-gerência de processo externo". A capacidade nasceu do pedido do usuário de 2026-08-22 e sua **postura de default** foi decidida pelo [ADR-0028](../../06-adr/ADR-0028-desktop-dependency-autostart-default.md) (`Accepted`, 2026-09-13), que esta SPEC implementa.

Esta SPEC **não fecha** nenhum item do Roadmap. Não reabre o item 1.4 (execução de comandos sob o Permission Service, `ADR primeiro`) nem o [ADR-0026](../../06-adr/ADR-0026-network-access-gate.md).

---

# Objetivo

Quando esta SPEC estiver concluída:

1. Abrir o `apps/desktop` **sem configurar nada** deve tentar subir o Ollama automaticamente — sem flag, sem variável de ambiente, sem passo manual. `ATLAS_AUTO_START_OLLAMA=false` continua desligando explicitamente; qualquer falha degrada e a janela abre do mesmo jeito.
2. O painel de rede/busca do desktop (`#panel-permissions`, seção **Busca**, SPEC-0059) deve permitir **digitar o nome do container Docker do provedor de busca e ligá-lo**, sem nenhuma variável de ambiente — preencher o campo e aplicar **é** o opt-in explícito.
3. A tentativa automática deve ser **auditável dentro da janela**, não só num log de terminal que um app empacotado não mostra: o painel `Sistema` (SPEC-0054) ganha uma linha por dependência com o desfecho da tentativa desta sessão.
4. `apps/cli` deve sair **sem uma linha de comportamento alterada** — lá o default continua `false`, opt-in por `--auto-start-ollama`/`ATLAS_AUTO_START_OLLAMA`.

---

# Motivação

O usuário rodou `pnpm --filter @atlas/desktop start` e tomou `ModelGatewayError: Falha ao conectar ao Ollama` (`ECONNREFUSED`), porque o Ollama não estava de pé. O opt-in explícito entregue pela SPEC-0060 (`ATLAS_AUTO_START_OLLAMA`) resolve isso **para quem sabe que ele existe** — e o desktop é pensado como "um app para todos", inclusive para quem não sabe subir infraestrutura. O default `local` do Model Gateway (`packages/core/src/config/defaults.ts`: `model.provider: 'local'`) torna o Ollama a dependência do caminho padrão da janela, não um caso de borda.

A primeira tentativa de SPEC para esse pedido **escalou sem redigir nada**: "sempre automático, sem flag" nega frontalmente a cláusula (g) do [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md) e a alternativa equivalente já havia sido rejeitada pelo próprio usuário no brainstorming daquele ADR. O [ADR-0028](../../06-adr/ADR-0028-desktop-dependency-autostart-default.md) (`Accepted`) resolveu a arquitetura: supersede **parcial** de (g), restrito a `apps/desktop` e restrito ao Ollama (i); cláusula (g) **intacta** para o container de busca, que ganha só uma **segunda porta de entrada** — o painel da SPEC-0059 (ii); cláusula (f) intocada (iii); tentativa automática auditável (iv), com o formato exato delegado a esta SPEC.

Rastreabilidade ao PRD (`docs/02-product/ProductRequirementsDocument.md`):

- **Execução** — *"O sistema deve automatizar atividades repetitivas."* Subir a dependência antes de cada sessão é exatamente a repetição a eliminar.
- **Assistência** — *"O sistema deve realizar pesquisas."* O container é o provedor que sustenta `web_search` no modo local.
- **Critérios de Qualidade** — *"simplicidade para o usuário"* (motivo declarado do ADR-0028) e *"transparência"* (a cláusula (iv), atendida aqui pelo painel `Sistema`).
- **Observabilidade do Ambiente** — *"visualizar o consumo de recursos do ambiente local"*; a linha nova mora no painel criado para esse requisito (SPEC-0054), é leitura do mesmo ambiente e não cria painel novo.

---

# Referências

- [ADR-0028 — Auto-start sempre-ativo de dependências externas no desktop](../../06-adr/ADR-0028-desktop-dependency-autostart-default.md) (`Accepted`) — **fonte primária**; cláusulas (i)–(iv).
- [ADR-0027 — Auto-gerência de processos externos](../../06-adr/ADR-0027-external-process-lifecycle-management.md) (`Accepted`) — cláusulas (a)–(f) e (h) **intactas**; (g) superseded **parcialmente** pelo ADR-0028, só em `apps/desktop`, só para o Ollama.
- [SPEC-0060](SPEC-0060-ollama-auto-start.md) (`Done`) — `createDependencyManager`/`ProcessPort`/`DependencyOutcome`/`resolveDependencyConfig`/`parseBooleanSetting`, disparo único por app, divergência CLI × desktop no valor inválido (D25).
- [SPEC-0061](SPEC-0061-search-container-auto-start.md) (`Done`) — três operações Docker nomeadas, `autoStartSearchContainer` nominal, `isValidContainerName`/`parseContainerNameSetting`, posse registrada no sucesso do `start`, relatório de dois desfechos em ordem pinada.
- [SPEC-0059](SPEC-0059-desktop-network-search-gui.md) (`Done`) — painel de rede/busca (`#panel-permissions`, seções Rede/Busca), `selectNetworkAccess`, mutex de política, `network-grant-dialog.ts`, assimetria rascunho × em vigor (D17).
- [SPEC-0054](SPEC-0054-desktop-environment-observability.md) (`Done`) — painel `Sistema`, canais `'atlas:metrics:read'`/`'atlas:tokens:read'`, timer único de 1000 ms com leitura a cada dois ticks.
- [SPEC-0053](SPEC-0053-desktop-visual-layout.md) (`Done`) — layout v3.0, manifesto de IDs estáticos, *progressive disclosure*.
- [SPEC-0057](SPEC-0057-web-search-tool.md) (`Done`) — `web_search`, `tools.searchUrl`, provedor provisionado **pelo usuário** (D6/D8 preservadas).
- [ADR-0026 — Network Access Gate](../../06-adr/ADR-0026-network-access-gate.md) — **não reaberto**: ligar o container não concede `netRoots`.
- [ADR-0013 — Permission Service como portão de execução](../../06-adr/ADR-0013-permission-service-execution-gate.md) — **não reaberto** (ADR-0027(a)).
- [ADR-0006 — Precedência de fontes de configuração](../../06-adr/ADR-0006-config-source-precedence.md); [ADR-0019 — Stack do desktop](../../06-adr/ADR-0019-desktop-electron-stack.md).
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — **Lifecycle Manager** (`packages/core`): "verificação de dependências", "ativação de componentes", "desligamento seguro".
- [PRD](../../02-product/ProductRequirementsDocument.md) — Execução, Assistência, Critérios de Qualidade, Observabilidade do Ambiente.
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigo 5, Artigo 7 (transparência), Artigo 8 (consentimento), Artigo 11 (nada persistido).

---

# Escopo

## 1. `@atlas/core` — `DependencyManager` ganha um gesto sob demanda (aditivo)

1.1. `packages/core/src/dependencies/dependency-manager.ts` (mod) — a interface ganha **um** método nomeado, ao lado dos dois já existentes; nenhuma assinatura existente muda:

```ts
export interface DependencyManager {
  ensure(config: DependencyConfig): Promise<DependencyReport>;
  release(): Promise<void>;
  /** SPEC-0062: liga sob demanda UM container de busca já nomeado, fora do `ensure` de bootstrap. */
  ensureSearchContainer(container: string): Promise<DependencyOutcome>;
}
```

1.2. **Renomeação obrigatória do helper privado** — hoje já existe, dentro da fábrica, uma função privada `ensureSearchContainer(config: DependencyConfig)`. O método público novo tem o mesmo nome com outro parâmetro; para não haver colisão de identificador, o helper privado é renomeado para `startSearchContainerByName(container: string)` (recebendo o **nome já resolvido**, não a `DependencyConfig`), e o caminho do `ensure` passa a chamá-lo com `config.autoStartSearchContainer`. Renomeação pura: nenhuma linha de comportamento muda, e o CA 6 (`grep` de não-duplicação) continua exequível sobre o nome novo.

1.3. Comportamento normativo de `ensureSearchContainer(container)`:
   - `container === ''` ⇒ `{ dependency: 'search-container', status: 'disabled' }` **sem tocar a porta** (nenhum `docker inspect`, nenhum spawn) — mesma regra do `ensure`;
   - caso contrário, executa **exatamente** o mesmo caminho privado que o `ensure` já usa para o container (item 4.2 da SPEC-0061, inalterado): `inspectSearchContainer` → classificação exaustiva → `startSearchContainer` só em `'stopped'` → registro de posse imediato no sucesso do `start` → confirmação por polling 20 × `sleep(250)`. **Nenhuma lógica duplicada**: o método público delega ao mesmo `startSearchContainerByName`;
   - **nunca lança** e **nunca toca o caminho do Ollama** (D9);
   - o valor recebido é assumido **já normalizado** — o método não faz `trim` nem valida formato (D12);
   - devolve sempre um `DependencyOutcome` com `dependency: 'search-container'`.

1.4. **Memoização por nome de container** (D10) — `packages/core/src/dependencies/dependency-manager.ts`:
   - um `Map<string, Promise<DependencyOutcome>>` privado, consultado tanto pelo caminho do `ensure` quanto pelo `ensureSearchContainer`: duas chamadas **concorrentes** para o mesmo nome compartilham a **mesma** promessa (nenhum `docker start` duplicado);
   - quando a promessa assenta em `'started'` ou `'already-running'`, a entrada **permanece** (uma nova chamada com o mesmo nome devolve o mesmo desfecho, sem tocar a porta);
   - quando assenta em `'failed'`, a entrada é **removida** — uma chamada seguinte com o mesmo nome **tenta de novo** (o usuário que ligou o Docker e clicou de novo precisa ser atendido);
   - `'disabled'` nunca entra no mapa;
   - o mapa é compartilhado entre as duas vias **de propósito** (D10/D22): quem chegar segundo ao mesmo nome recebe o desfecho de quem chegou primeiro, inclusive quando o primeiro foi o `ensure` de bootstrap. Isso é a **única** mudança observável no `ensure` para o container permitida por esta SPEC (ver Restrição 5, delimitada): a classificação do `inspect`, o orçamento de polling, a ordem/forma do `DependencyReport` e o registro de posse saem intactos.

1.5. **Posse passa a ser um conjunto** (D11) — o campo privado `ownedContainer: string | undefined` vira `ownedContainers: Set<string>`:
   - cada `startSearchContainer` bem-sucedido acrescenta o nome ao conjunto, **imediatamente**, antes de qualquer espera (regra da SPEC-0061/D23 preservada literalmente);
   - `release()` chama `stopSearchContainer(nome)` **uma vez para cada** nome do conjunto, na ordem de inserção, **cada um com captura própria** (a falha de um nunca impede o outro nem o `stopOllama`), e limpa o conjunto, o `pending` do `ensure` e o mapa do item 1.4;
   - trocar de nome **nunca** derruba o container anterior (D11);
   - nenhuma outra estrutura de posse existe no repositório.

1.6. **`release()` drena o trabalho em voo antes de decidir a posse** (D21 — correção do defeito de container órfão). Antes de ler `ownsOllama`/`ownedContainers` e antes de limpar qualquer estrutura, `release()`:
   - captura as promessas ainda pendentes — o `pending` do `ensure` e **todos** os valores do mapa do item 1.4 — e as aguarda com `Promise.allSettled` (nunca `Promise.all`: uma rejeição nunca pode abortar o desligamento, e essas promessas por construção não rejeitam);
   - **só depois** lê o conjunto de posse, emite os `stop*` e limpa `pending`/mapa/conjunto;
   - o efeito é que um `startSearchContainer` bem-sucedido que ainda estava no polling quando o `release()` começou tem sua posse **vista** pelo desligamento, em vez de ser registrada num conjunto já descartado. É a mesma garantia que a SPEC-0061/D23 deu ao bootstrap ("posse registrada no sucesso do start, não na prontidão, para nunca ficar órfão"), estendida ao gesto de GUI, que é disparável a qualquer instante;
   - `release()` continua **nunca lançando**, continua sendo no-op sem trabalho prévio e continua idempotente (uma segunda chamada não repete nenhum `stop*` — o conjunto já está vazio e não há promessa pendente a drenar);
   - **limite conhecido, registrado como residual 9**: `main.ts` chama `releaseExternalDependencies()` com `void`, sem `await`, no `before-quit` (mesmo padrão dos dois teardowns vizinhos, inalterado por esta SPEC) — a drenagem torna o desligamento **correto**, não **garantido**: se o processo do Electron morrer antes da drenagem assentar, o container segue de pé. Esta SPEC não altera o `before-quit` (ver Fora do Escopo).

1.7. `packages/core/src/index.ts` — nenhum export novo é necessário (`DependencyManager`/`DependencyOutcome` já são exportados). **`createAtlas` e `createLifecycle` saem sem uma linha alterada** (ADR-0027(d)).

## 2. `apps/desktop` — default do Ollama invertido no bootstrap

2.1. `src/core-bridge.ts` (mod) — constante exportada e nomeada, origem única do novo default:

```ts
/** ADR-0028(i): no desktop, o repouso é LIGADO. `apps/cli` não é tocada. */
export const DESKTOP_AUTO_START_OLLAMA_DEFAULT = true;
```

2.2. `ensureExternalDependencies(env = process.env)` (mod) — a resolução de `autoStartOllama` passa a partir de `DESKTOP_AUTO_START_OLLAMA_DEFAULT` em vez de `false`. Tabela normativa e exaustiva sobre `parseBooleanSetting(env['ATLAS_AUTO_START_OLLAMA'])`:

| `kind` | valor efetivo de `autoStartOllama` | `console.warn` |
|---|---|---|
| `'unset'` (ausente/vazia) | `true` (**mudança**; era `false`) | não |
| `'value'` com `true` | `true` | não |
| `'value'` com `false` | `false` (via explícita de desligamento) | não |
| `'invalid'` | `false` (**inalterado**, D4) | sim, `INVALID_AUTO_START_OLLAMA_ENV_WARNING` **byte a byte** como está |

   `ATLAS_AUTO_START_SEARCH_CONTAINER` e toda a resolução do container **saem inalteradas** (cláusula (g) intacta para ele — ADR-0028(ii)): ausente/vazia/inválida ⇒ `''` (desligado).

2.3. Nenhuma mudança em `packages/core/src/config/defaults.ts`, `load-config.ts`, `dependency-config.ts` ou `@atlas/contracts` por conta deste item — o default de `AtlasConfig.dependencies.autoStartOllama` continua `false` em todo o resto da plataforma (D3).

## 3. `apps/desktop` — estado de dependências legível pela janela

3.1. `src/core-bridge.ts` (mod) — tipo **local ao app** (regra de tipos locais do `apps/desktop/CLAUDE.md`, sem promoção a `@atlas/contracts`), cujos membros reusam o `DependencyOutcome` já público de `@atlas/core` (dado plano, serializável por IPC):

```ts
export interface DependencyStatusSnapshot {
  readonly ollama: DependencyOutcome | undefined;
  /**
   * Um desfecho por container **distinto** tentado nesta sessão, na ordem da
   * primeira tentativa de cada nome. Lista vazia = nenhuma tentativa ainda.
   */
  readonly searchContainers: readonly DependencyOutcome[];
}
```

   `ollama: undefined` significa **"ainda não há desfecho nesta sessão"** (o `ensure` de `app.whenReady()` não assentou). `searchContainers: []` significa o mesmo para o container.

   **A lista é plural de propósito** (D22, correção do bloqueante B4 da 1ª revisão): a posse do manager é um `Set` (item 1.5) e a sessão pode ligar vários containers; um campo singular que substituísse o anterior faria o painel `Sistema` **sub-reportar o que a sessão possui** — um container ligado pelo Atlas, que será derrubado no `before-quit`, sumiria da única superfície de visibilidade que o ADR-0028(iv) exige. Transparência formal ≠ efetiva (Artigo 7), o mesmo critério com que D13 rejeitou "só logs".

3.2. Estado de módulo do `core-bridge` (mesmo molde das seleções de Persona/permissões/rede — **nunca persistido**, Artigo 11): um campo para o Ollama e um `Map<string, DependencyOutcome>` (ordem de inserção) para os containers, atualizados por
   - `ensureExternalDependencies` — grava o desfecho do Ollama e, quando o desfecho do container **não** é `'disabled'`, grava-o sob a chave `outcome.container`;
   - `ensureSearchContainer` (item 4) — grava **só** o desfecho do container, sob a chave do nome normalizado; um segundo desfecho para o **mesmo** nome **substitui** o anterior (a chave é o nome, e o desfecho mais recente é o verdadeiro); um nome **novo** é **acrescentado**, nunca substitui o anterior;
   - desfecho `'disabled'` (nome vazio) **nunca** entra no mapa — não há container a reportar.

3.3. `readDependencyStatus(): DependencyStatusSnapshot` — função **síncrona**, exportada, que devolve uma cópia plana do estado acima (`searchContainers` materializado a partir dos valores do mapa, na ordem de inserção). **Nunca** sobe o Core, nunca toca a porta, nunca marca operação em voo (mesma classe de `readTokenUsage`, SPEC-0054).

3.4. `__resetBridgeStateForTests()` (mod) — zera o campo do Ollama e esvazia o mapa de containers, ao lado do que já zera.

## 4. `apps/desktop` — gesto de ligar o container pela GUI

4.1. `src/core-bridge.ts` (mod):

```ts
export async function ensureSearchContainer(container: string): Promise<DependencyOutcome>;
```

   Ordem normativa, fail-closed:
   1. coerção pela **origem única** já designada para entrada de borda, `parseContainerNameSetting` (`@atlas/core`, SPEC-0061/D5) — D12;
   2. `kind: 'invalid'` ⇒ **rejeita** com `Error` de mensagem pinada (`INVALID_SEARCH_CONTAINER_NAME_MESSAGE`, constante exportada) citando a regra de formato; nenhum efeito colateral, a porta não é tocada;
   3. `kind: 'unset'` (vazio/só espaços) ⇒ resolve `{ dependency: 'search-container', status: 'disabled' }`, **sem tocar a porta** e sem gravar estado novo — não é erro, é "nada a fazer";
   4. `kind: 'value'` ⇒ delega a `dependencyManager.ensureSearchContainer(parsed.value)`, grava o desfecho no mapa do item 3.2 sob a chave `parsed.value` e o devolve.

   A função **não** entra no mutex de aplicação de política, **não** consulta `hasInFlightOperation()`, **não** encerra sessões de chat vivas e **não** altera `selectedNetwork`/`selectedPermissions` (D6/D8).

4.2. `src/main.ts` (casca fina, mod) — **dois** canais IPC novos, um por gesto (mesmo padrão da SPEC-0054/D4):
   - `'atlas:dependencies:read'` → `readDependencyStatus()`;
   - `'atlas:dependencies:search-container'` → `(_event, container: string) => ensureSearchContainer(container)`.

   O laço de log de `app.whenReady()` e o `before-quit` **saem inalterados** (D13 mantém os logs existentes como estão).

4.3. `src/preload.cjs` (mod) — namespace novo, ao lado de `metrics`/`tokens`:

```js
dependencies: {
  read: () => ipcRenderer.invoke('atlas:dependencies:read'),
  startSearchContainer: (container) =>
    ipcRenderer.invoke('atlas:dependencies:search-container', container),
},
```

## 5. `apps/desktop` — superfície visual

5.1. `src/renderer/index.html` (mod) — **três** IDs novos dentro de `#search-detail` (seção **Busca** de `#panel-permissions`, SPEC-0059), **abaixo** de `#search-host-warning`, preservando byte a byte tudo que já existe ali:
   - `#search-container-input` (`<input type="text">`, `placeholder="nome-do-container"`);
   - `#search-container-apply` (`<button type="button">`, rótulo `Ligar container`);
   - `#search-container-status` (`<p>`, vazio no arranque).

   Um rótulo/parágrafo estático explica, com texto pinado, que o Atlas **só liga um container que já existe** — nunca cria, baixa ou remove — e que ligar o container **não** autoriza o host na lista de Rede acima.

5.2. `src/renderer/index.html` (mod) — **um** ID novo em `#panel-system`: `#system-dependencies`, colocado **abaixo** de `#system-network` e **acima** de `#system-status` (o painel `Sistema` da SPEC-0054 segue sem qualquer outra alteração de ordem).

5.3. Manifesto de IDs estáticos: de **99** para **103** (99 + 4).

5.4. `src/renderer/renderer.js` (mod) — gesto do container:
   - clique em `#search-container-apply` lê `#search-container-input`, desabilita o botão enquanto a chamada está em voo e chama `window.atlas.dependencies.startSearchContainer(valor)`;
   - o resultado pinta `#search-container-status` com **exatamente um** dos textos da tabela de **D17**; rejeição pinta a mensagem do erro prefixada por `⚠️ `;
   - `#search-container-status` é pintado **somente** por este gesto (D15) — nenhuma outra função do renderer o toca, e `loadStatus()`/`seedNetworkDraftFromStatus()` saem inalteradas;
   - o campo **não** é semeado com nenhum valor vindo do ambiente ou do status (D16);
   - o gesto **não** entra na serialização de `chatTurnInFlight`/`askInFlight`/`micBusy()` nem no `policyApplicationInFlight` do renderer (D8) — não sobe Core, não executa Tool, não altera política.

5.5. `src/renderer/renderer.js` (mod) — painel `Sistema`:
   - o mesmo tick de 2000 ms que já dispara `metrics.read()`/`tokens.read()` passa a disparar também `dependencies.read()` (3º `invoke`, D14) — **nenhum timer novo**, mesma regra de não-reentrância e de descarte de resposta que chega após o painel fechar;
   - `#system-dependencies` recebe **uma** linha para o Ollama mais **uma linha por entrada** de `searchContainers` (D22), cada uma nomeando o container e usando os textos exaustivos de **D17**; com `searchContainers` vazia, uma única linha pinada de "nenhum container de busca nesta sessão";
   - rejeição do `invoke` pinta o texto pinado de falha na célula e em `#system-status`, mantendo o painel utilizável — **nunca** alimenta `#global-alert` nem `#presence-core[data-state="error"]` (regra da SPEC-0054 preservada).

## 6. Testes

Conforme "Estratégia de Testes".

## 7. Documentação da própria SPEC

7.1. Nota de atualização no [ADR-0028](../../06-adr/ADR-0028-desktop-dependency-autostart-default.md) registrando o contrato técnico que ele delegou: **onde** o novo default é aplicado (`DESKTOP_AUTO_START_OLLAMA_DEFAULT` em `core-bridge.ts`, nunca em `@atlas/core`), o tratamento do valor **inválido** (inalterado, D4), o rótulo/validação/gesto do campo novo (sem reuso do `network-grant-dialog.ts`, D7) e a superfície de visibilidade escolhida para (iv) (painel `Sistema` + logs existentes, D13). **Sem alterar nenhuma cláusula (i)–(iv).**

   A nota registra **explicitamente** uma divergência de **mecanismo** em relação à letra de (ii) — obrigatória, para que quem ler o ADR depois não conclua que o código implementa literalmente o que está escrito ali (D23): a cláusula diz que o campo novo "ao ser preenchido popula o mesmo `autoStartSearchContainer` que hoje só a env aceita"; o que a SPEC entrega é um gesto próprio (`ensureSearchContainer`) que produz o **mesmo efeito** sem passar por `AtlasConfig.dependencies.autoStartSearchContainer`. A nota precisa dizer, nessas palavras: *popular a config no momento do gesto seria **inerte** — `ensure` é memoizado por instância (SPEC-0060/D18) e já assentou no `app.whenReady()`, então nenhum container subiria; a equivalência exigida por (ii) é de **efeito** (uma segunda porta de entrada que liga o container, fail-closed, com o preenchimento como opt-in explícito), não de **mecanismo**.* Nenhuma cláusula é reescrita — a nota é aditiva.

7.2. Nota **curta** de atualização no [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md) registrando que o contrato técnico que ele delegou foi **estendido de forma aditiva** por esta SPEC (`DependencyManager.ensureSearchContainer`, posse como conjunto), que a cláusula **(b)** segue satisfeita (operação nomeada e fixa, nunca execução genérica), que **(d)**/**(e)**/**(h)** seguem intactas, e que **(g)** recebeu supersessão parcial pelo ADR-0028 — só `apps/desktop`, só Ollama. O estado "inteiramente consumido" do ADR-0027 **não muda**: nenhuma cláusula nova é aberta, nenhuma SPEC candidata nova é nomeada.

---

# Fora do Escopo

- **Não** mudar o default em `apps/cli`: `--auto-start-ollama`/`ATLAS_AUTO_START_OLLAMA` seguem opt-in, default `false` (ADR-0028(i), D19). Diff esperado **vazio** em `apps/cli`.
- **Não** mudar o default de `AtlasConfig.dependencies.autoStartOllama` em `@atlas/contracts`/`packages/core/src/config/*` — o default da plataforma continua `false` (D3). Diff esperado **vazio** em `@atlas/contracts`.
- **Não** inverter o default do container de busca, nem adivinhar/convencionar um nome (ex.: `atlas-searxng`): `autoStartSearchContainer` continua fail-closed, `''` = desligado (ADR-0028(ii), ADR-0027(h)).
- **Não** persistir nada: nem o nome do container digitado, nem o desfecho, nem a escolha de ligar/desligar (Artigo 11). Fechar a app volta a `flags > env > defaults`, exatamente como as seleções de Persona/permissões/rede.
- **Não** executar `docker run`, `create`, `pull`, `build`, `exec`, `rm`, `kill` ou `compose` — só `inspect`/`start`/`stop` do container nomeado, exatamente as três operações da SPEC-0061 (ADR-0027(h)).
- **Não** criar porta genérica de execução de comando, `shell: true` ou qualquer caminho de comando arbitrário (ADR-0027(b)); o item 1.4 do Roadmap não é consumido nem reaberto.
- **Não** tocar `@atlas/permissions`, `evaluate`, `isContained`, `netRoots`, `ResourceType`/`ResourceRef` nem o Runtime (ADR-0027(a)). Ligar o container **não** concede acesso de rede (ADR-0026 intacto) — o usuário continua autorizando o host na seção **Rede** do mesmo painel.
- **Não** abrir diálogo de consentimento para ligar o container, nem reusar `network-grant-dialog.ts`/`permission-grant-dialog.ts` (D7).
- **Não** fazer o gesto do container entrar no mutex de política, encerrar sessões de chat vivas, alterar `selectedNetwork`/`selectedPermissions` ou recompor `AtlasConfigOverride` (D6/D8) — `selectNetworkAccess`/`selectPermissionRoots`/`composeOverride`/`withSelections` saem **byte a byte** como estão.
- **Não** condicionar o auto-start do Ollama a `model.provider`/`tools.searchUrl` (ADR-0027(g) para o container; D5 para o Ollama).
- **Não** supervisionar as dependências depois da tentativa: sem health-check periódico, sem restart, sem watchdog, sem captura de logs do container, sem teto de tempo novo nos `spawn` (residual conhecido da SPEC-0061, não fechado aqui).
- **Não** verificar a saúde **HTTP** do serviço dentro do container (nenhum `HttpPort`/`SearchPort` nesta fatia) — a prontidão observada é o estado do container.
- **Não** desligar o container anterior ao aplicar um nome diferente; nem oferecer um gesto de "desligar container" na GUI (D11) — `release()` no `before-quit` segue sendo o único desligamento.
- **Não** criar Tool, Skill, Persona, módulo ou painel novo; o painel `Sistema` ganha **uma** linha, o painel de rede/busca ganha **um** campo. Nenhum oitavo item no drawer.
- **Não** alterar `createAtlas`/`createLifecycle` nem seus hooks (ADR-0027(d)).
- **Não** alterar o `before-quit` de `main.ts`: `releaseExternalDependencies()` continua sendo chamada com `void`, sem `await`, ao lado dos dois teardowns vizinhos. A drenagem do item 1.6 torna o desligamento **correto** dentro do `release()`; transformá-la em **garantida** exigiria segurar o encerramento da app (`event.preventDefault()` + `app.quit()` diferido), mudança de ciclo de vida do Electron fora desta fatia — residual 9.
- **Não** alterar o comportamento já entregue para o container no caminho do `ensure` de bootstrap (classificação do `inspect`, orçamento de polling, textos de log de `main.ts`, avisos e linhas de `atlas status` da CLI).
- **Não** tocar `@atlas/cognitive`, `@atlas/tools`, `@atlas/runtime`, `@atlas/skills`, `@atlas/memory`, `@atlas/context`, `@atlas/persona`, `@atlas/model-gateway`, `piper-tts.ts`, `stt-engine.ts`, `hands-free.ts`, `speech-output.ts`, `system-metrics.ts`, `token-usage.ts` — diff esperado **vazio** nesses alvos.
- **Não** implementar o slot `arquivo` da precedência do ADR-0006.
- **Não** emendar a Constituição, criar módulo novo, mover responsabilidade entre módulos nem abrir ADR novo.

---

# Pré-requisitos

- [SPEC-0060](SPEC-0060-ollama-auto-start.md) — **Done** (`createDependencyManager`/`ProcessPort`/`resolveDependencyConfig`/`parseBooleanSetting`, `ensureExternalDependencies`/`releaseExternalDependencies`).
- [SPEC-0061](SPEC-0061-search-container-auto-start.md) — **Done** (três operações Docker, `autoStartSearchContainer`, `parseContainerNameSetting`/`isValidContainerName`, posse do container).
- [SPEC-0059](SPEC-0059-desktop-network-search-gui.md) — **Done** (painel de rede/busca, seção **Busca**, onde o campo novo mora).
- [SPEC-0054](SPEC-0054-desktop-environment-observability.md) — **Done** (painel `Sistema` e seu timer único, onde a linha nova mora).
- [SPEC-0053](SPEC-0053-desktop-visual-layout.md) — **Done** (layout v3.0 e manifesto de IDs).
- [SPEC-0031](SPEC-0031-desktop-foundation.md) — **Done** (`core-bridge.ts` testável sem Electron, `main.ts` casca fina).
- [ADR-0028](../../06-adr/ADR-0028-desktop-dependency-autostart-default.md) — **Accepted** (não é SPEC, mas é a fonte da fatia).

---

# Critérios de Aceitação

Cada item é verificável mecanicamente (teste automatizado, `typecheck`, `lint` ou `grep` no diff).

**`@atlas/core` — `ensureSearchContainer`**

1. `DependencyManager.ensureSearchContainer` existe, é chamável com uma `string` e devolve um `DependencyOutcome` com `dependency: 'search-container'`; `ensure`/`release` mantêm assinatura idêntica e o package passa em `pnpm --filter @atlas/core typecheck`.
2. `ensureSearchContainer('')` devolve `'disabled'` e o `ProcessPort` fake registra **zero** chamadas às três operações Docker.
3. `ensureSearchContainer('searxng')` com `inspectSearchContainer` ⇒ `'running'` devolve `'already-running'` (`container: 'searxng'`) e **zero** `startSearchContainer`; com `'stopped'` + start bem-sucedido + polling `'running'` devolve `'started'`; com `'unknown'` devolve `'failed'`/`'container-unknown'` **sem** `startSearchContainer`; com `'unavailable'` devolve `'failed'`/`'docker-unavailable'` **sem** `startSearchContainer`.
4. `ensureSearchContainer` **nunca lança**: uma porta que rejeita em qualquer das três operações Docker produz `'failed'`/`'start-failed'`.
5. `ensureSearchContainer` **nunca** toca o caminho do Ollama: o fake registra **zero** `isOllamaRunning`/`startOllama`/`stopOllama` em todos os cenários do CA 3.
6. Nenhuma lógica duplicada: um `grep` no diff mostra que `ensureSearchContainer` delega ao **mesmo** helper interno que `ensure` já usava (uma única ocorrência da sequência `inspectSearchContainer` → `startSearchContainer` → polling no arquivo).

**`@atlas/core` — memoização por nome e posse**

7. Duas chamadas **concorrentes** de `ensureSearchContainer('searxng')` compartilham a mesma tentativa: o fake registra **um** `inspectSearchContainer` e **um** `startSearchContainer`; as duas promessas resolvem no mesmo desfecho.
8. Após um desfecho `'started'`/`'already-running'`, uma chamada seguinte com o **mesmo** nome devolve o mesmo desfecho **sem** tocar a porta (zero chamadas novas).
9. Após um desfecho `'failed'`, uma chamada seguinte com o mesmo nome **tenta de novo** (o fake registra um `inspectSearchContainer` novo) e pode devolver `'started'`.
10. **Compartilhamento do mapa entre as duas vias, condicionado ao desfecho** (D22; corrige a contradição com o CA 9 apontada no 1º gate): com desfecho **`'started'`/`'already-running'`**, `ensure(config)` com `autoStartSearchContainer: 'searxng'` seguido de `ensureSearchContainer('searxng')` **não** repete `inspect`/`start`, e a ordem inversa também não — neste segundo caso o `ensure` de bootstrap devolve, para o container, o desfecho memoizado pelo gesto, **sem** inspecionar (mudança observável admitida, delimitada pela Restrição 5). Com desfecho **`'failed'`**, o oposto: a entrada foi removida do mapa (item 1.4) e a chamada seguinte — por qualquer das duas vias — **inspeciona de novo** (coerente com o CA 9, que é a razão de ser da regra "falha é esquecida").
11. `release()` derruba **todos** os containers que esta instância ligou: com `'a'` ligado pelo `ensure` e `'b'` ligado por `ensureSearchContainer`, o fake registra `stopSearchContainer('a')` e `stopSearchContainer('b')`, uma vez cada, na ordem de inserção; um `stopSearchContainer` que **rejeita** não impede o outro nem o `stopOllama`, e `release()` não lança.
12. `release()` continua **não** derrubando container do qual esta instância não tem posse (`'disabled'`/`'already-running'`/demais `'failed'`) e continua sendo no-op sem `ensure` prévio; `release()` duas vezes não repete nenhum `stop*`.
13. Ligar `'a'` e depois `'b'` **não** chama `stopSearchContainer('a')` em nenhum momento antes do `release()` (prova mecânica de D11).
13.1. **Drenagem antes do desligamento (D21, correção do bloqueante B2 da 1ª revisão)**: com um `ensureSearchContainer('a')` **em voo** (porta fake cujo `startSearchContainer` já resolveu com sucesso, mas cujo polling ainda não assentou — `sleep` controlado pelo teste), chamar `release()` e deixá-lo assentar produz **exatamente um** `stopSearchContainer('a')`; o container ligado nesta sessão nunca fica órfão. O mesmo vale para um `ensure` de bootstrap em voo.
13.2. `release()` com trabalho em voo continua **não lançando** mesmo que a promessa drenada assente em `'failed'`, e continua idempotente: uma segunda chamada imediatamente depois não repete nenhum `stop*` e resolve sem drenar nada.
14. Todos os CAs da SPEC-0061 sobre `ensure`/`release`/`DependencyReport` continuam verdes **sem alteração de expectativa** — em particular: `outcomes` com exatamente dois elementos na ordem `['ollama', 'search-container']`, independência entre as duas dependências, posse registrada no sucesso do `start`, e `ensure` chamado duas vezes não repetindo nada. Nenhum desses testes exercita um gesto de GUI antes do `ensure`, então a exceção nomeada da Restrição 5 não os alcança; se algum precisar de edição de expectativa, isso é sinal de que a Restrição 5 foi violada e a implementação está errada, não o teste.
15. `grep -R "shell: true" packages/core/src` não casa; `grep -RE "docker['\"]?\s*,\s*\[\s*['\"](run|create|pull|build|exec|rm|kill|compose)" packages/core/src` não casa; `grep` por `createDependencyManager` em `packages/core/src/index.ts` casa **apenas** na linha de `export`.
16. Nenhum teste desta SPEC invoca o binário `docker`/`ollama`, abre socket de Docker ou spawna processo real.

**Desktop — default do Ollama**

17. `DESKTOP_AUTO_START_OLLAMA_DEFAULT` é exportada de `core-bridge.ts` e vale `true`; um `grep` mostra que ela é o **único** literal que decide esse default no app.
18. `ensureExternalDependencies({})` (env vazia) exercita o caminho de auto-start do Ollama: o `ProcessPort` fake registra `isOllamaRunning` e o desfecho **não** é `'disabled'`. (Expectativa **alterada** em relação à SPEC-0060 — os testes existentes que afirmavam `'disabled'` com env vazia são atualizados, e essa é a mudança central desta SPEC.)
19. A tabela de **2.2** é pinada por teste, caso a caso: `'true'`/`'1'`/`'on'` ⇒ ligado sem warn; `'false'`/`'0'`/`'off'` ⇒ **desligado** sem warn; ausente ⇒ **ligado** sem warn; `'talvez'` ⇒ **desligado** com **exatamente uma** linha de `console.warn` igual a `INVALID_AUTO_START_OLLAMA_ENV_WARNING` (texto inalterado, comparado por igualdade).
20. A resolução de `ATLAS_AUTO_START_SEARCH_CONTAINER` sai **inalterada**: ausente/vazia/inválida ⇒ container `'disabled'`, inválida ainda emite `INVALID_SEARCH_CONTAINER_ENV_WARNING` uma vez; `'searxng'` ⇒ caminho de auto-start exercitado.
21. As duas variáveis continuam independentes (uma inválida não impede a outra).
22. `ensureExternalDependencies` continua **nunca lançando** em qualquer combinação de env, e continua não marcando operação em voo (`hasInFlightOperation()` falso durante a chamada).
23. Diff **vazio** em `apps/cli/src` e em `@atlas/contracts`; `packages/core/src/config/defaults.ts` mantém `autoStartOllama: false` (teste do core inalterado). Exceção nomeada por D-A1: `apps/cli/tests/auto-start-ollama.test.ts` recebe o membro novo `ensureSearchContainer` no fake tipado de `DependencyManager`, de forma aditiva.

**Desktop — estado e gesto**

24. `readDependencyStatus()` é síncrona, devolve `{ ollama: undefined, searchContainers: [] }` antes de qualquer tentativa, e passa a refletir os desfechos após `ensureExternalDependencies` assentar (com `ATLAS_AUTO_START_SEARCH_CONTAINER` ausente, `searchContainers` permanece **vazia** — `'disabled'` nunca entra); `__resetBridgeStateForTests()` a devolve ao estado inicial.
25. `readDependencyStatus()` **não** sobe o Core: um teste com `createAtlas` espionado registra zero chamadas.
26. `ensureSearchContainer('a b')` (nome inválido) **rejeita** com `INVALID_SEARCH_CONTAINER_NAME_MESSAGE`, o `ProcessPort` fake registra **zero** chamadas e `readDependencyStatus().searchContainers` **não** muda.
27. `ensureSearchContainer('   ')` resolve `'disabled'`, com zero chamadas à porta, e **não** acrescenta entrada a `searchContainers`.
28. `ensureSearchContainer('  searxng  ')` normaliza para `'searxng'` (o fake recebe exatamente `'searxng'`), devolve o desfecho do manager e o grava em `readDependencyStatus().searchContainers`.
28.1. **A lista acumula por nome, nunca substitui (D22, correção do bloqueante B4 da 1ª revisão)**: `ensureSearchContainer('a')` seguido de `ensureSearchContainer('b')` deixa `searchContainers` com **dois** elementos, na ordem `['a', 'b']`; um segundo `ensureSearchContainer('a')` com desfecho diferente **substitui** o elemento de `'a'` no lugar (a lista segue com dois elementos, na mesma ordem). Um container ligado por `ensureExternalDependencies` e outro pelo gesto aparecem **ambos**.
29. `ensureSearchContainer` **não** encerra sessões de chat vivas, **não** altera `selectedNetworkAccess()`/`selectedPermissionRoots()` e **não** é bloqueada por uma aplicação de política em curso nem por operação em voo (teste com `hasInFlightOperation()` verdadeiro ainda assim executa o gesto).
30. Após um `ensureSearchContainer` com `'started'`, `releaseExternalDependencies()` delega o `stopSearchContainer` correspondente uma vez; sem posse, é no-op e não lança.

**Desktop — IPC, preload e renderer**

31. `main.ts` registra **exatamente** os dois canais novos `'atlas:dependencies:read'` e `'atlas:dependencies:search-container'`, delegando a `readDependencyStatus`/`ensureSearchContainer`; nenhum canal existente muda de nome ou de forma (verificável por teste de fiação, no molde de `vad-wiring.test.ts`).
32. `preload.cjs` expõe `window.atlas.dependencies.read`/`.startSearchContainer` e nada mais; os namespaces existentes saem inalterados.
33. `index.html` contém exatamente os quatro IDs novos (`search-container-input`, `search-container-apply`, `search-container-status`, `system-dependencies`) e o manifesto de IDs estáticos passa de **99** para **103**, sem IDs estruturais extras (o teste de manifesto da SPEC-0053 é atualizado com os quatro nomes).
34. Clicar em `#search-container-apply` chama `window.atlas.dependencies.startSearchContainer` com o valor cru de `#search-container-input`, desabilita o botão enquanto a promessa está em voo e o reabilita em sucesso **e** em rejeição.
35. `#search-container-status` recebe exatamente um dos textos pinados de **D17** por desfecho (tabela exaustiva: `started`/`already-running`/`disabled` + as quatro `reason` de falha) e o texto de erro prefixado por `⚠️ ` em rejeição.
36. `#search-container-status` **não** é tocado por `loadStatus()`, `seedNetworkDraftFromStatus()`, `refreshPermissionsPanelState()` nem pelo apply de rede — um teste aplica rede/busca e verifica que o texto permanece como estava (D15).
37. `#search-container-input` **não** é semeado a partir do status nem de nenhum outro caminho: após arranque e após um `network.select` bem-sucedido, o campo permanece vazio (D16).
38. O gesto do container **não** é desabilitado por `chatTurnInFlight`/`askInFlight`/`micBusy()`/`policyApplicationInFlight`, e **não** desabilita nenhum outro controle (D8) — verificado por teste de serialização.
39. Com o painel `Sistema` aberto, o tick de 2000 ms dispara também `dependencies.read()` (três `invoke` por tick de leitura), sem timer novo: um teste conta os timers criados e confirma que continua **um**; fechar o painel cancela tudo e uma resposta que chega depois é descartada.
40. `#system-dependencies` mostra **uma** linha para o Ollama mais **uma por entrada** de `searchContainers`, com os textos exaustivos de **D17**, incluindo: o texto de "ainda verificando" enquanto `ollama` é `undefined`; o texto pinado de "nenhum container de busca nesta sessão" com a lista vazia; **duas** linhas de container quando a sessão ligou dois nomes distintos (prova mecânica de que o painel não sub-reporta o que a sessão possui — D22). Rejeição do `invoke` pinta o texto pinado de falha na célula e em `#system-status`, sem tocar `#global-alert` nem `#presence-core[data-state]`.
41. Nenhuma razão bruta (`'binary-missing'`, `'spawn-failed'`, `'timeout'`, `'docker-unavailable'`, `'container-unknown'`, `'start-failed'`) aparece na interface: a tabela de tradução de **D17** é exaustiva e um teste cobre as **sete** razões (três do Ollama, quatro do container).
42. `apps/desktop/tests/renderer.speech-parity.test.ts` continua verde **sem registro novo** e **sem módulo-fonte novo** na lista vigiada (os seis seguem os mesmos); diff **vazio** em `speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`, `hands-free.ts`, `system-metrics.ts`, `token-usage.ts`.
43. Diff **vazio** em `selectNetworkAccess`, `selectPermissionRoots`, `composeOverride`, `withSelections` e nas quatro portas de diálogo (`confirm-port.ts`, `permission-grant-dialog.ts`, `persona-delete-dialog.ts`, `network-grant-dialog.ts`); nenhum diálogo nativo novo é aberto por esta SPEC (verificável por `grep` por `showMessageBox` no diff: sem ocorrências).

**Higiene global**

44. `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` verdes **na raiz** (os quatro comandos completos, obrigatórios antes de fechar).
45. Diff **vazio** em `packages/permissions`, `packages/runtime`, `packages/tools`, `packages/cognitive`, `packages/skills`, `packages/memory`, `packages/context`, `packages/persona`, `packages/model-gateway`, `packages/contracts` e `apps/cli/src` (exceção nomeada por D-A1 para `apps/cli/tests/auto-start-ollama.test.ts`, ver CA 23).
46. Nenhum arquivo novo é escrito em disco por nenhum caminho desta SPEC (nenhum `writeFile`/`mkdir` introduzido); nenhum estado novo é persistido.
47. As notas de atualização dos itens 7.1 e 7.2 existem nos dois ADRs e **nenhuma cláusula** de ADR-0027 ou ADR-0028 tem seu texto alterado (verificável por diff: só as seções de "Atualização" mudam).

---

# Arquivos Esperados

```text
docs/implementation/specs/SPEC-0062-desktop-dependency-autostart-default.md  (este arquivo)
docs/06-adr/ADR-0028-desktop-dependency-autostart-default.md   (nota de atualização, sem alterar cláusulas)
docs/06-adr/ADR-0027-external-process-lifecycle-management.md   (nota curta, sem alterar cláusulas)

packages/core/src/dependencies/dependency-manager.ts   (mod)
packages/core/tests/dependency-manager.test.ts         (mod)
packages/core/CLAUDE.md                                (mod — no doc-sync de fecho)

apps/desktop/src/core-bridge.ts                        (mod)
apps/desktop/src/main.ts                               (mod — dois handlers novos)
apps/desktop/src/preload.cjs                           (mod — namespace `dependencies`)
apps/desktop/src/renderer/index.html                   (mod — 4 IDs novos)
apps/desktop/src/renderer/renderer.js                  (mod)
apps/desktop/src/renderer/styles.css                   (mod, se necessário — sem mudança de layout v3.0)

apps/desktop/tests/core-bridge.dependencies.test.ts    (mod)
apps/desktop/tests/dependencies-wiring.test.ts         (novo — molde de `vad-wiring.test.ts`)
apps/desktop/tests/renderer.network-panel.test.ts      (mod)
apps/desktop/tests/renderer.system-panel.test.ts       (mod)
apps/desktop/tests/renderer.layout.test.ts             (mod — manifesto 99 → 103)
apps/desktop/tests/renderer.gesture-serialization.test.ts (mod)
apps/desktop/tests/helpers/renderer-harness.ts         (mod — dublê de `window.atlas.dependencies`)
apps/desktop/CLAUDE.md                                 (mod — no doc-sync de fecho)
```

Um único arquivo **novo** de teste é esperado (`dependencies-wiring.test.ts`); reusar um arquivo de fiação existente, em vez de criar este, é ajuste aceitável. **Nenhum arquivo novo de código** — a fatia é aditiva sobre os módulos das SPECs 0054/0059/0060/0061.

---

# Componentes Impactados

- **Lifecycle Manager** (`packages/core`) — dono da capacidade (Module Catalog: "verificação de dependências", "ativação de componentes", "desligamento seguro"). Ganha um gesto sob demanda e posse como conjunto.
- **`apps/desktop`** — `core-bridge.ts` (default novo, estado de dependências, gesto do container), `main.ts` (dois handlers), `preload.cjs` (namespace), renderer (campo na seção Busca + linha no painel `Sistema`).

Explicitamente **não impactados**: Permission Service, Runtime, Task Manager, Tool Registry, Cognitive Core, Planner, Skill Registry, Memory Service, Context Service, Persona Service, Model Gateway, Configuration Service (`defaults`/`load-config`/`dependency-config`), `@atlas/contracts`, `apps/cli`.

---

# Interfaces Necessárias

1. `DependencyManager.ensureSearchContainer(container: string): Promise<DependencyOutcome>` (`@atlas/core`) — método **aditivo**, nomeado e fixo (ADR-0027(b)); nunca lança; nunca toca o caminho do Ollama.
2. `DependencyStatusSnapshot` (`apps/desktop/src/core-bridge.ts`) — tipo **local ao app**: `ollama: DependencyOutcome | undefined` e `searchContainers: readonly DependencyOutcome[]` (um por container distinto da sessão, D22); sem promoção a `@atlas/contracts`.
3. `readDependencyStatus(): DependencyStatusSnapshot` — leitura síncrona do estado de módulo, sem IO e sem Core.
4. `ensureSearchContainer(container: string): Promise<DependencyOutcome>` (`core-bridge.ts`) — gesto da GUI; coerção pela `parseContainerNameSetting`; rejeita só em nome inválido.
5. `DESKTOP_AUTO_START_OLLAMA_DEFAULT: boolean` — constante exportada, origem única do default do desktop.
6. `INVALID_SEARCH_CONTAINER_NAME_MESSAGE: string` — mensagem pinada de nome inválido, exportada para o teste comparar por igualdade.
7. Canais IPC `'atlas:dependencies:read'` e `'atlas:dependencies:search-container'`; `window.atlas.dependencies.read`/`.startSearchContainer`.

Nenhuma interface de `@atlas/contracts` é criada, alterada ou promovida.

---

# Fluxo Esperado

```text
Abertura da app (nenhuma env configurada)

app.whenReady()
  ↓
ensureExternalDependencies(process.env)
  ↓  ATLAS_AUTO_START_OLLAMA ausente ⇒ autoStartOllama = true   (ADR-0028(i))
  ↓  ATLAS_AUTO_START_SEARCH_CONTAINER ausente ⇒ ''  (desligado, ADR-0027(g))
resolveDependencyConfig  →  dependencyManager.ensure(config)
  ↓
DependencyReport (2 desfechos, ordem pinada)  →  estado de módulo + console.info/warn
  ↓
painel `Sistema`  →  'atlas:dependencies:read'  →  #system-dependencies (duas linhas)
```

```text
Ligar o container pela janela (sem nenhuma env)

drawer → Permissões → Busca → digita o nome → "Ligar container"
  ↓
window.atlas.dependencies.startSearchContainer(nome)
  ↓  'atlas:dependencies:search-container'
core-bridge.ensureSearchContainer(nome)
  ↓  parseContainerNameSetting: invalid ⇒ rejeita | unset ⇒ 'disabled' | value ⇒ segue
dependencyManager.ensureSearchContainer(nome)
  ↓  docker inspect → (stopped) docker start → posse → polling 20 × 250 ms
DependencyOutcome  →  #search-container-status (texto pinado)
                   →  estado de módulo  →  painel `Sistema` no próximo tick

before-quit → releaseExternalDependencies() → drena o que está em voo (D21)
                                            → stop de TUDO que esta sessão ligou
```

---

# Estratégia de Implementação

1. `@atlas/core`: **primeiro** a renomeação pura do helper privado (`ensureSearchContainer(config)` → `startSearchContainerByName(container)`, item 1.2), com a suíte verde antes de qualquer mudança de comportamento; depois expor o gesto sob demanda (`ensureSearchContainer`) sobre esse mesmo helper; trocar a posse para conjunto; introduzir o mapa de memoização por nome; por último a drenagem do `release()` (item 1.6/D21). Rodar `pnpm --filter @atlas/core test` e confirmar que **todos** os CAs da SPEC-0061 seguem verdes sem edição de expectativa (Restrição 5).
2. `core-bridge.ts`: inverter o default do Ollama (constante nomeada), manter o tratamento de valor inválido byte a byte, e atualizar os testes que afirmavam `'disabled'` com env vazia.
3. `core-bridge.ts`: estado de dependências + `readDependencyStatus` + gesto `ensureSearchContainer` (com a coerção de borda).
4. `main.ts` + `preload.cjs`: dois canais novos; nenhum canal existente tocado.
5. `index.html`: quatro IDs novos (três na seção Busca, um no painel `Sistema`); atualizar o manifesto no teste de layout.
6. `renderer.js`: gesto do container (pintura exclusiva de `#search-container-status`) e 3º `invoke` no tick do painel `Sistema`, com a tabela exaustiva de textos de **D17**.
7. Testes de renderer sobre o harness existente (dublê de `window.atlas.dependencies`), incluindo os caminhos de recusa em pé de igualdade com os de sucesso.
8. Notas de atualização nos ADRs 0027/0028.
9. Os quatro comandos completos na raiz.

---

# Estratégia de Testes

Nenhum teste desta SPEC pode spawnar processo real, tocar Docker/Ollama, abrir socket ou depender de binário instalado — toda borda é `ProcessPort` fake ou `spawn` fake, e o desktop usa `__setDependencyManagerForTests`.

- **`packages/core/tests/dependency-manager.test.ts`** — CAs 1–16 (inclusive 13.1/13.2): desfechos de `ensureSearchContainer`, isolamento em relação ao Ollama, memoização por nome (concorrente, sucesso retido, falha esquecida), compartilhamento do mapa entre `ensure` e o gesto **nas duas ordens e condicionado ao desfecho** (CA 10), posse como conjunto, `release()` de múltiplos containers com captura própria, **drenagem do trabalho em voo antes do desligamento** (`sleep` controlado pelo teste para segurar o polling), e a bateria da SPEC-0061 **inalterada**.
- **`apps/desktop/tests/core-bridge.dependencies.test.ts`** — CAs 17–30 (inclusive 28.1): tabela exaustiva da env do Ollama (com espião sobre `console.warn` comparando o texto por igualdade), independência das duas variáveis, `readDependencyStatus` antes/depois, gesto com nome inválido/vazio/válido, ausência de efeito sobre política/sessões, `releaseExternalDependencies` após o gesto.
- **`apps/desktop/tests/dependencies-wiring.test.ts`** (novo) — CAs 31–32: registro dos dois canais e do namespace do preload, sem alterar canais existentes.
- **`apps/desktop/tests/renderer.network-panel.test.ts`** — CAs 34–38: gesto do container, textos pinados por desfecho, rejeição, ausência de repintura por outros caminhos, campo nunca semeado, ausência de serialização.
- **`apps/desktop/tests/renderer.system-panel.test.ts`** — CAs 39–41: 3º `invoke` no mesmo tick, timer único, descarte de resposta tardia, duas linhas, estado "verificando", falha do `invoke`, tradução exaustiva das sete razões.
- **`apps/desktop/tests/renderer.layout.test.ts`** — CA 33: manifesto 99 → 103.
- **`apps/desktop/tests/renderer.speech-parity.test.ts`** — CA 42: verde sem registro novo.
- **Greps do diff** — CAs 15, 23, 42, 43, 45, 46, 47.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` estiverem verdes **na raiz**;
- as notas de atualização dos ADRs 0027/0028 estiverem escritas, sem alterar cláusulas;
- a documentação viva estiver sincronizada no passo de fecho `doc-sync` (`CLAUDE.md` raiz, `packages/core/CLAUDE.md`, `apps/desktop/CLAUDE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) — **não é escopo do `spec-implementer`**;
- as lições aprendidas estiverem registradas em `docs/implementation/LESSONS_LEARNED.md`;
- os residuais nomeados nas **Observações** estiverem registrados em `NEXT_CONTEXT.md`, não silenciados.

Smoke humano recomendado (não bloqueia fechamento documental, mas não conte como verificado sem ele): abrir a janela sem nenhuma env e confirmar que o Ollama sobe sozinho; abrir com `ATLAS_AUTO_START_OLLAMA=false` e confirmar que **não** sobe; ligar um container real pelo campo novo; conferir as duas linhas do painel `Sistema`.

---

# Restrições

1. Não criar módulo, Tool, Skill ou Persona novo; não mover responsabilidade entre módulos.
2. Não emendar a Constituição; não abrir ADR novo — o ADR-0028 já decidiu a arquitetura desta fatia.
3. Não alterar nenhuma cláusula do ADR-0027 ou do ADR-0028; só acrescentar seções de "Atualização".
4. Não tocar `createAtlas`/`createLifecycle`, `@atlas/contracts`, `apps/cli/src` nem os packages listados no CA 45 — exceção nomeada por D-A1 (ruling do gate `Draft → Ready`): `apps/cli/tests/auto-start-ollama.test.ts` recebe o membro novo `ensureSearchContainer` no fake tipado, de forma aditiva, porque `apps/cli/tsconfig.json` inclui `tests/**/*.ts` no typecheck.
5. Não mudar, no `ensure` de bootstrap, o **caminho de classificação e de polling** do container: a classificação exaustiva do `docker inspect`, os orçamentos de polling (40 × 250 ms Ollama, 20 × 250 ms container), o registro de posse no sucesso do `start`, a ordem/forma pinada do `DependencyReport` e a independência entre as duas dependências saem **intactos**. **Exceção única e nomeada** (itens 1.4/CA 10, D22): a memoização por nome passa a ser compartilhada com o gesto de GUI, então um `ensure` de bootstrap que chegue **depois** de um gesto bem-sucedido para o mesmo nome devolve o desfecho memoizado sem inspecionar. Nenhuma outra mudança observável no `ensure` é permitida.
6. Não introduzir `shell: true`, interpolação de string em argv, caminho absoluto adivinhado de binário, ou qualquer operação Docker além de `inspect`/`start`/`stop`.
7. Não persistir nada em disco; nenhum estado novo sobrevive ao fechamento da app.
8. Não abrir diálogo nativo novo; não reusar as portas de consentimento existentes para este gesto.
9. Não alterar a CSP, não adicionar dependência de runtime, não adicionar timer novo no renderer.
10. Não exibir identificador cru de `reason` na interface — só os textos pinados de **D17**.
11. O texto pinado `INVALID_AUTO_START_OLLAMA_ENV_WARNING` sai **byte a byte** como está (D4).

---

# Observações

**Residuais nomeados, registrados e não fechados por esta SPEC:**

1. **Provider do modelo não é consultado no bootstrap do desktop** (D5): o auto-start do Ollama é tentado independentemente de `model.provider`, porque o default da plataforma é `'local'` e o desktop não expõe hoje nenhuma superfície para escolher provider. Se uma fatia futura expuser essa escolha, ela precisa passar o override de modelo a `ensureExternalDependencies` — nada no código impede, mas nada obriga.
2. **Nenhum teto de tempo nos `spawn`/`docker start`** — residual herdado da SPEC-0061 (achado não-bloqueante do `architecture-reviewer` daquela fatia), não fechado aqui.
3. **Ligar o container continua não concedendo `netRoots`** — o usuário ainda precisa autorizar o host na seção **Rede** do mesmo painel (ADR-0026 intacto). O campo novo fica deliberadamente **abaixo** do aviso que diz isso.
4. **Sem gesto de desligar container pela GUI** e sem desligamento implícito ao trocar de nome (D11): um container ligado nesta sessão só cai no `before-quit`. Trocar o nome duas vezes numa sessão deixa dois containers de pé até o fechamento.
5. **Acesso ao socket do Docker segue equivalente a privilégio elevado no host** (ADR-0027, "Custos e riscos") — agora alcançável por um gesto de GUI, não só por variável de ambiente. O escopo continua o mais restrito possível (só `start` de um container já existente, nomeado pelo usuário).
6. **"Abrir o app" passa a ter efeito colateral no host por padrão** — consequência assumida e documentada pelo ADR-0028 ("Custos e riscos"), mitigada por (iv)/D13, mas real.
7. **O logger do main process continua inalcançável em app empacotado** — é exatamente por isso que a visibilidade de (iv) foi colocada no painel `Sistema` (D13); o log permanece como redundância para quem lança pelo terminal.
8. **A linha do painel `Sistema` reporta a tentativa desta sessão, não a saúde corrente**: se o Ollama subir e cair depois, a linha continuará dizendo `'started'` — não há supervisão (fora de escopo, ADR-0027).
9. **A drenagem do `release()` (item 1.6/D21) torna o desligamento correto, não garantido**: `main.ts` chama `releaseExternalDependencies()` com `void` no `before-quit` (inalterado por esta SPEC). Se o processo do Electron encerrar antes de a drenagem assentar, um container que a sessão acabara de ligar segue de pé. Fechar isso exige segurar o encerramento da app (`event.preventDefault()` + `quit` diferido) — mudança de ciclo de vida, fatia própria.
10. **Fechar a janela passa a derrubar o Ollama para todo mundo, não só para quem fez opt-in** (efeito colateral novo do default invertido, N5 do 1º gate). O `before-quit` já derruba o que a sessão subiu (ADR-0027(e)) — com a SPEC-0060 isso só alcançava quem tinha ligado a env conscientemente; com o default `true`, alcança qualquer usuário. Consequência concreta: quem abre o desktop, fecha a janela e em seguida roda `atlas ask` (ou abre uma **segunda** janela enquanto a primeira encerra) pode perder o daemon que estava usando. Mitigação disponível hoje sem código novo: `ATLAS_AUTO_START_OLLAMA=false`, ou subir o Ollama fora do Atlas (aí o desfecho é `'already-running'` e a sessão **não** tem posse, então nada é derrubado). Não é fechado aqui — inverter a simetria de (e) por causa do default seria emendar o ADR-0027 num ponto que o ADR-0028 deliberadamente não tocou.
11. **Duas instâncias do desktop abertas ao mesmo tempo não coordenam posse**: cada processo tem seu próprio `DependencyManager` e seu próprio conjunto de posse. A primeira a fechar derruba o que ela subiu, ainda que a segunda esteja usando. Limitação pré-existente do ADR-0027(e), agora mais alcançável pelo default invertido (residual 10) e pelo gesto de GUI.

---

# Checklist para IA

Antes de implementar:

- ler o ADR-0028 **inteiro** e as cláusulas (a)–(h) do ADR-0027;
- ler as SPECs 0054, 0059, 0060 e 0061 nas seções citadas;
- confirmar que nenhuma decisão desta SPEC exige ADR novo;
- identificar o módulo responsável (Lifecycle Manager, `packages/core`) e a borda (`apps/desktop`).

Durante a implementação:

- manter responsabilidade única: o manager decide, a porta faz IO, o renderer só formata;
- não duplicar o caminho do container (o gesto delega ao mesmo helper do `ensure`);
- não tocar `apps/cli/src`, `@atlas/contracts` nem os packages do CA 45 (exceção nomeada por D-A1 em `apps/cli/tests/auto-start-ollama.test.ts`);
- pinar todo texto visível por constante comparada por igualdade em teste.

Após a implementação:

- rodar os quatro comandos completos na raiz;
- validar os CAs um a um;
- escrever as notas de atualização dos dois ADRs;
- registrar lições aprendidas e os **onze** residuais acima.

---

# Resultado Esperado

Abrir o `apps/desktop` numa máquina limpa, **sem configurar nada**, passa a tentar subir o Ollama automaticamente — o erro `ECONNREFUSED` que motivou o pedido deixa de ser o primeiro contato do usuário com o app. Quem quiser desligar continua podendo, com `ATLAS_AUTO_START_OLLAMA=false`. A CLI não muda em nada: lá o auto-start continua sendo opt-in explícito, e nenhum script ou pipeline de CI ganha um processo subindo sem aviso.

O container Docker do provedor de busca continua fail-closed — nenhum nome é adivinhado —, mas deixa de exigir variável de ambiente: o usuário digita o nome no painel de Permissões → Busca, clica em "Ligar container", e vê ali mesmo o desfecho. O que esta sessão ligou é derrubado ao fechar a app; o que já estava de pé, não.

A automação deixa de ser silenciosa: o painel `Sistema` mostra, em português e sem jargão de `reason`, o que o Atlas tentou fazer com cada dependência nesta sessão.

Arquitetonicamente, nada além disso muda: nenhum módulo novo, nenhuma Tool nova, nenhum contrato público alterado, nenhuma cláusula de ADR reaberta, `@atlas/permissions`/`evaluate`/`netRoots` intocados, e `createAtlas` sem uma linha alterada.

---

# Decisões de design

Formato de veto — cada decisão traz o porquê (rastreado à fonte) e a alternativa descartada. Quem as ataca é o `architecture-reviewer` no gate `Draft → Ready`.

**D1 — Perfil `completo`.**
*Porquê*: a fatia toca `packages/core` **e** `apps/desktop` (main, preload, renderer), cria canais IPC novos e altera a superfície de uma interface — falha em pelo menos três das condições de `micro` do template (um package + CLI; nenhuma superfície nova; cabe numa sessão com folga).
*Alternativa descartada*: `micro`, alegando que tudo deriva de ADRs existentes — verdade para a *derivação*, falsa para o *alcance*; na dúvida o template manda `completo`.

**D2 — Prioridade `High`.**
*Porquê*: o pedido nasceu de um erro que impede a primeira interação do usuário com a janela (`ECONNREFUSED` no primeiro `ask`), e o ADR-0028 o trata como atrito de produto do público-alvo declarado ("um app para todos"). É mais alto que as SPECs 0060/0061 (`Medium`), que entregavam conveniência sob opt-in.
*Alternativa descartada*: `Critical` — reservado para segurança/corrupção de dados; existe contorno conhecido (subir o Ollama à mão, ou usar a env da SPEC-0060).

**D3 — O novo default `true` é aplicado em `apps/desktop/src/core-bridge.ts`, numa constante exportada (`DESKTOP_AUTO_START_OLLAMA_DEFAULT`), nunca em `@atlas/core`.**
*Porquê*: o ADR-0028(i) restringe a supersessão a `apps/desktop`; `defaultConfig()`/`resolveDependencyConfig` são compartilhados com `apps/cli`, onde a cláusula (g) do ADR-0027 segue integralmente em vigor. O ADR delegou explicitamente esta escolha à SPEC, nomeando `apps/desktop/src/main.ts` entre as opções.
*Leitura explícita do ADR-0006* (N6 do 1º gate — o ADR está nas Referências e precisa ser confrontado, não só citado): a regra "defaults residem no core" **não** é violada aqui, porque o que `DESKTOP_AUTO_START_OLLAMA_DEFAULT` produz não é um *default de plataforma*, e sim um **valor de borda que o app resolve antes de chamar `resolveDependencyConfig`** — exatamente o mesmo papel que uma flag de CLI ou uma env ocupam na precedência `flags > env > defaults`. `defaultConfig()` continua dizendo `autoStartOllama: false`, e é isso que vale para qualquer outro consumidor. O precedente disto é não-negociável e delimitado: **um app só pode fixar um valor de borda quando um ADR o autorizar nominalmente** (aqui, ADR-0028(i)); nada nesta decisão autoriza espalhar defaults por `apps/*` — sem ADR, o default continua sendo assunto exclusivo do core.
*Alternativa descartada*: um parâmetro novo em `resolveDependencyConfig` (ex.: `{ autoStartOllamaDefault }`) — acrescentaria superfície a uma função pura compartilhada para servir a **um** chamador, e criaria um segundo lugar onde "qual é o default" pode divergir.

**D4 — `ATLAS_AUTO_START_OLLAMA` inválida continua ⇒ desligado + o mesmo `console.warn` pinado; só o caso *ausente* muda de polaridade.**
*Porquê*: o ADR-0028(i) superseded o default do caso **ausente**; um valor inválido não é ausência — é uma tentativa de controle explícito que falhou, e honrá-la pelo lado que não dispara processo mantém a postura da SPEC-0060/D25 e mantém o texto pinado verdadeiro. Minimiza a pegada da supersessão a exatamente uma linha de semântica.
*Alternativa descartada*: inválida ⇒ default do desktop (`true`) + aviso reescrito — defensável como "ignore a variável e use o default", mas faria um `ATLAS_AUTO_START_OLLAMA=flase` (typo de `false`) **ligar** o processo, exatamente contra a intenção legível do usuário.

**D5 — O auto-start do Ollama no desktop não é condicionado a `model.provider`.**
*Porquê*: o default da plataforma é `model.provider: 'local'` (`packages/core/src/config/defaults.ts`) e o desktop não expõe hoje nenhuma superfície para escolher provider — condicionar seria escrever um ramo sem consumidor real. `resolveDependencyConfig` já calcula `ollamaBaseUrl` corretamente se um override de modelo aparecer.
*Alternativa descartada*: derivar a decisão do provider efetivo — além de ramo morto hoje, aproxima-se perigosamente do "auto-start implícito a partir de config existente" que o ADR-0027 e a SPEC-0060/D6 rejeitaram explicitamente. Registrado como residual 1.

**D6 — Ligar o container é um gesto próprio (`#search-container-apply`, canal e função próprios), não parte do `#network-apply`/`selectNetworkAccess`.**
*Porquê*: `selectNetworkAccess` aplica **política** (`permissions.netRoots`/`tools.searchUrl`) que alimenta `createAtlas` por `composeOverride`, é tudo-ou-nada, toma o mutex de política e encerra sessões vivas. Ligar um container é **infraestrutura**, não entra em `AtlasConfig` de nenhum Core e não invalida nenhum Tool Registry — misturar os dois obrigaria a função de política a fazer IO de processo e a arriscar derrubar conversas por um gesto que não muda política.
*Alternativa descartada*: um único botão "Aplicar rede e busca" cuidando dos três campos — melhor em número de cliques, pior em tudo o mais: acoplaria um efeito no host a uma aplicação de política, e uma falha do Docker passaria a poder abortar (ou a ser abortada por) uma concessão de rede.

**D7 — Nenhum diálogo de consentimento para ligar o container; `network-grant-dialog.ts` **não** é reusado.**
*Porquê*: o ADR-0028(ii) diz literalmente que "preencher o campo já é o opt-in explícito" — digitar um nome e clicar em "Ligar container" é um ato deliberado e nomeado, não um aumento silencioso de privilégio. E o texto daquele diálogo descreve conceder **acesso de rede a um host para qualquer Tool**, coisa diferente: reusá-lo consentiria a coisa errada (Artigo 8; regra "não reuse uma porta pela outra" do `apps/desktop/CLAUDE.md`).
*Alternativa descartada*: um quinto diálogo fail-closed dedicado ("ligar um container é efeito no host") — coerente, mas cobraria duas confirmações pelo mesmo ato deliberado e contrariaria a leitura explícita do ADR-0028(ii).

**D8 — O gesto do container fica fora do mutex de política, fora de `hasInFlightOperation()` e fora da serialização do renderer; não encerra sessões vivas.**
*Porquê*: ele não sobe Core, não executa Tool, não altera `AtlasConfig` nem política alguma — as três razões pelas quais aqueles mecanismos existem (SPEC-0038/0050/0051/0059). Bloqueá-lo durante um turno de chat produziria recusa espúria, o mesmo critério que já deixou `resolveStatusSnapshot`/`resolveMemorySnapshot` deliberadamente fora do rastreio.
*Alternativa descartada*: entrar no mutex "por precaução" — travaria as duas aplicações de política enquanto um `docker start` lento roda, e o gate da SPEC-0059 já registrou o custo de um mutex compartilhado preso.

**D9 — `DependencyManager` ganha um método aditivo `ensureSearchContainer(container)` em vez de reexecutar `ensure(config)`.**
*Porquê*: `ensure` é memoizado por instância (SPEC-0060/D18) e trata **as duas** dependências; reexecutá-lo por um gesto de container reavaliaria o Ollama, acoplando duas dependências que a SPEC-0061/D4 manteve deliberadamente independentes. Um método nomeado e fixo satisfaz o ADR-0027(b) e mantém o dono único (ADR-0027(d)).
*Alternativas descartadas*: (a) trocar a memoização de `ensure` para "por config" — mudaria semântica já pinada e reavaliaria o Ollama de carona; (b) instanciar um **segundo** `DependencyManager` para o gesto da GUI — fragmentaria a posse em duas estruturas, e `release()` passaria a precisar saber de ambas (contra a prova mecânica da SPEC-0061/CA 18).

**D10 — Memoização por nome de container: dedup em voo sempre, sucesso retido, falha esquecida.**
*Porquê*: dedup em voo evita dois `docker start` concorrentes para o mesmo nome (clique duplo); reter sucesso evita trabalho inútil; **esquecer falha** é o que torna o gesto usável — o usuário que abriu o Docker e clicou de novo precisa de uma segunda tentativa real. É o mesmo espírito do `pending` do `ensure`, com a granularidade que o gesto exige.
*Alternativa descartada*: memoizar tudo por nome, inclusive falha — deixaria o botão permanentemente inútil para aquele nome até reabrir a app, um modo de falha pior do que o problema que a SPEC resolve.

**D11 — Posse vira `Set<string>`; trocar de nome nunca derruba o container anterior.**
*Porquê*: a regra do ADR-0027(e) é "derrubar só o que esta sessão subiu" — com dois containers subidos nesta sessão, derrubar os dois no `release()` é a leitura fiel; derrubar o anterior na troca seria um efeito destrutivo que o usuário não pediu naquele instante, sobre um container que pode estar em uso por outra coisa.
*Alternativa descartada*: manter o campo único e substituir a posse na troca — perderia a posse do primeiro container, deixando-o órfão de pé para sempre, exatamente o defeito que a SPEC-0060/D23 corrigiu ao registrar posse no `spawn`. Registrado como residual 4.

**D12 — A normalização do nome acontece na borda (`parseContainerNameSetting`), não dentro do manager.**
*Porquê*: `parseContainerNameSetting` já é a **origem única** designada para entrada de borda (SPEC-0061/D5) e compartilha `normalizeContainerName` com `resolveDependencyConfig` — usá-la mantém um único conceito de "nome válido" no repositório, e o manager continua recebendo valores já resolvidos, como `ensure` já recebe.
*Alternativa descartada*: normalizar dentro do manager — criaria um segundo ponto de validação do mesmo formato, exatamente o risco de divergência que a SPEC-0061/D6 (regra única de `trim`) foi escrita para eliminar.

**D13 — A visibilidade exigida pelo ADR-0028(iv) fica no painel `Sistema` (SPEC-0054), somada aos logs já existentes (que não mudam).**
*Porquê*: o ADR nomeia o painel `Sistema` como opção, e o log do main process é **provadamente inalcançável** para o público-alvo desta mudança — um app empacotado aberto pelo Finder/Dock não mostra console (residual já nomeado nas SPECs 0060/0061). Com o default ligado, uma automação invisível para quem não usa terminal deixaria (iv) sem conteúdo real; Artigo 7 pede transparência efetiva, não formal.
*Alternativa descartada*: só manter os logs (custo zero) — falharia em (iv) exatamente para quem a mudança de default foi feita; e `#global-alert`/diálogo no arranque — intrusivo para um evento que quase sempre é sucesso silencioso.

**D14 — A leitura do estado de dependências entra no tick de 2000 ms que o painel `Sistema` já tem, como 3º `invoke`; nenhum timer novo.**
*Porquê*: a SPEC-0054 pinou "um único `setInterval`, criado só quando o painel fica visível"; acrescentar um terceiro `invoke` barato (leitura em memória, sem Core, sem IO) reusa a máquina existente, incluindo não-reentrância e descarte de resposta tardia.
*Alternativa descartada*: leitura única ao abrir o painel — perderia o desfecho de um `ensure` que ainda não assentou quando o usuário abre o painel logo no arranque, exigindo uma segunda mecânica (push/refresh) para cobrir o caso mais provável.

**D15 — `#search-container-status` é pintado **exclusivamente** pelo resultado do gesto; o estado ambiente vive no painel `Sistema`.**
*Porquê*: a SPEC-0059/D17 já registrou como armadilha a mistura "rascunho × em vigor" no mesmo painel — separar as duas superfícies (feedback do meu clique × estado da sessão) elimina a classe inteira de bug de repintura, com regra trivial de verificar mecanicamente (CA 36).
*Alternativa descartada*: `#search-container-status` refletir também o estado corrente lido por `dependencies.read()` — duas fontes pintando o mesmo elemento, exatamente o padrão que produziu o residual de rascunho da SPEC-0059.

**D16 — O campo `#search-container-input` nunca é semeado (nem pela env, nem pelo status).**
*Porquê*: semear criaria um terceiro conjunto de regras de "quando repintar sem apagar o que o usuário digitou", pelo ganho marginal de pré-preencher um nome que o painel `Sistema` já exibe por extenso.
*Alternativa descartada*: semear no arranque a partir do desfecho do container (molde de `seedNetworkDraftFromStatus`) — ganho real de UX, mas reabre a assimetria rascunho × em vigor num painel que acabou de ganhar um campo; candidato futuro, não esta fatia.

**D17 — Tabela exaustiva de textos em português, pinados por constante, para os dois desfechos e as sete `reason`; identificador cru nunca aparece na interface.**
*Porquê*: o público declarado pelo ADR-0028 é quem "não sabe subir infraestrutura" — `docker-unavailable` não informa essa pessoa. Pinar por constante torna cada texto verificável por igualdade no teste (mesma disciplina da SPEC-0054/0060/0061).
*Alternativa descartada*: interpolar a `reason` crua entre parênteses, como os logs do `main.ts` fazem — aceitável num log de desenvolvedor, não na janela; e deixaria a interface mudar sozinha se uma `reason` nova surgir, sem gate.

**D18 — Tipos de snapshot locais ao app; dois canais IPC, um por gesto; nenhuma promoção a `@atlas/contracts`.**
*Porquê*: regra de tipos locais do `apps/desktop/CLAUDE.md` (promoção só com 2º consumidor real, precedente ADR-0007) e padrão de "um canal por módulo/gesto" da SPEC-0054/D4 — leitura e escrita separadas mantêm cada handler com uma responsabilidade.
*Alternativa descartada*: um canal único `'atlas:dependencies'` com um verbo no payload — esconderia dois gestos de naturezas diferentes (leitura inócua × efeito no host) atrás da mesma superfície.

**D19 — `apps/cli` sai com diff vazio.**
*Porquê*: ADR-0028(i) restringe a supersessão a `apps/desktop` e registra a razão (público técnico; scripts/CI não devem ganhar processo subindo sem aviso).
*Alternativa descartada*: uniformizar o default nas duas bordas "por consistência" — explicitamente rejeitada pelo usuário no ADR-0028 ("Alternativas Consideradas").

**D20 — Nada novo é persistido: o nome do container e os desfechos são estado de sessão.**
*Porquê*: Artigo 11 e a fronteira já estabelecida para Persona/permissões/rede no desktop — fechar a app volta a `flags > env > defaults`.
*Alternativa descartada*: persistir o nome do container junto das Personas custom (único arquivo que o desktop já escreve) — seria estado persistente novo sem ADR, e faria um efeito no host renascer em toda abertura sem o usuário reafirmar.

**D21 — `release()` drena o trabalho em voo (`Promise.allSettled` sobre `pending` + valores do mapa) antes de ler a posse e emitir os `stop*`.** *(Correção do bloqueante B2 da 1ª revisão.)*
*Porquê*: sem a drenagem, um `ensureSearchContainer` disparado pela GUI e ainda no polling quando o `before-quit` chega registraria posse num conjunto **já limpo** por `release()`, deixando um container do Atlas de pé — precisamente o defeito que a SPEC-0061/D23 eliminou para o bootstrap ("posse registrada no sucesso do start, não na prontidão, para nunca ficar órfão"). O gesto de GUI, disparável a qualquer instante, reabre essa janela; drenar a fecha sem tocar a regra de registro de posse. `allSettled` (nunca `all`) preserva a garantia "`release()` nunca lança".
*Alternativa descartada*: aceitar o órfão e só registrá-lo como residual — o custo real (um container Docker do usuário ficando de pé indefinidamente, contra a promessa explícita do ADR-0027(e)) é desproporcional ao custo da correção, que são poucas linhas dentro de uma função que já é assíncrona e já tem captura por dependência. O que **fica** como residual é só a parte não corrigível nesta fatia: o `void` sem `await` no `before-quit` (residual 9).

**D22 — `DependencyStatusSnapshot.searchContainers` é uma lista (um desfecho por container distinto da sessão), e o mapa de memoização do manager é compartilhado entre `ensure` e o gesto, com a memoização de falha esquecida.** *(Correção dos bloqueantes B3 e B4 da 1ª revisão.)*
*Porquê*: as duas coisas são a mesma pergunta — "quem é o dono da verdade sobre o que esta sessão ligou". A posse já é um `Set` (D11) e a sessão pode ligar vários containers; reportar um singular faria o painel `Sistema` esconder um container que o Atlas possui e vai derrubar no quit, deixando o ADR-0028(iv) com transparência **formal** e não efetiva (Artigo 7) — o mesmo critério com que D13 rejeitou "só logs". No manager, compartilhar o mapa é o que impede dois `docker start` para o mesmo nome; e a exclusão da falha (D10) é o que mantém o botão usável — por isso o CA 10 é **condicionado ao desfecho**, em vez de afirmar "nunca repete", que contradiria o CA 9.
*Alternativa descartada*: manter `searchContainer` singular substituindo o anterior e registrar o sub-reporte como residual — seria documentar um buraco de transparência na própria SPEC criada para atender (iv), quando a correção é trocar um campo por um mapa de duas entradas de custo.

**D23 — A equivalência exigida pelo ADR-0028(ii) é cumprida em *efeito*, não em *mecanismo*: o gesto de GUI não popula `AtlasConfig.dependencies.autoStartSearchContainer`.** *(Correção do bloqueante B1 da 1ª revisão.)*
*Porquê*: a cláusula (ii) descreve o campo novo como algo que "ao ser preenchido popula o mesmo `autoStartSearchContainer` que hoje só a env aceita" — mas popular a config **no momento do gesto seria inerte**: `ensure` é memoizado por instância (SPEC-0060/D18) e já assentou no `app.whenReady()`, então nenhum container subiria, e o usuário veria um campo que não faz nada. O que (ii) de fato decide é a **postura**: `autoStartSearchContainer` continua fail-closed, nenhum nome é adivinhado, e preencher o campo **é** o opt-in explícito — tudo preservado. A divergência é de caminho de implementação, dentro do "contrato técnico delegado à SPEC" que o próprio ADR-0028 (Observações) reserva. Registrada por escrito no ADR (item 7.1), para que ninguém leia (ii) e conclua que o código a implementa ao pé da letra.
*Alternativa descartada*: popular a config e re-executar `ensure(config)` no gesto — exigiria quebrar a memoização de `ensure` (semântica pinada pela SPEC-0060) e reavaliaria o **Ollama** de carona, acoplando duas dependências que a SPEC-0061/D4 manteve deliberadamente independentes (é a mesma razão de D9). Segunda alternativa descartada: escalar ao humano por "divergência da letra do ADR" — a Emenda v1.1 reserva a escalação para *ADR novo/emenda/módulo novo*, e escolher o caminho técnico que realiza a decisão já tomada é exatamente o que o ADR delegou.

**D-A1 (ruling do `architecture-reviewer` no gate `Draft → Ready`, 2ª rodada) — "diff vazio em `apps/cli`" (CAs 23/45, Restrição 4) vale para `apps/cli/src`; o fake tipado de `DependencyManager` em `apps/cli/tests/auto-start-ollama.test.ts` recebe o membro novo `ensureSearchContainer`, de forma aditiva.**
*Porquê*: `apps/cli/tsconfig.json` inclui `tests/**/*.ts` no typecheck; como o Escopo 1.1 declara `ensureSearchContainer` **obrigatório** na interface pública de `DependencyManager`, o literal tipado hoje existente nesse arquivo de teste deixaria de compilar sem essa atualização — tornando CA 44 (`pnpm typecheck` verde na raiz) e a leitura literal de CA 23/45/Restrição 4 mutuamente insatisfazíveis. O que o ADR-0028(i) protege é o **comportamento** da CLI (scripts/CI não ganham processo subindo sem aviso); um dublê de teste tipado não é comportamento.
*Alternativa descartada*: declarar `ensureSearchContainer?` opcional em `DependencyManager` — enfraqueceria o contrato público de `@atlas/core` para todo consumidor real só para acomodar um arquivo de teste.
*Consequência se estiver errada*: reverter é uma linha (excetuar `apps/cli/tests` dos CAs 23/45) — nenhuma linha de código de produção muda, nenhuma decisão arquitetural é revisitada.
