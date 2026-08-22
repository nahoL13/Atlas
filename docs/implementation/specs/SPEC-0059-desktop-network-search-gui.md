# SPEC-0059 — Desktop: configuração de rede (`netRoots`) e de busca (`tools.searchUrl`) pela janela

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0059

---

**Título**

Desktop: painel de rede e busca — autorizar hosts (`netRoots`) e configurar/desativar o provedor de busca (`tools.searchUrl`) em runtime pela interface gráfica, com consentimento explícito por host, no molde de consentimento de política já estabelecido pela SPEC-0038

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
- [ ] High
- [x] Medium
- [ ] Low

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 1 — 1.4 Capacidades de Plataforma` (`docs/04-engineering/Roadmap.md`, l. 105), item **Acesso à internet (Network Access Gate)**: esta SPEC consome o residual **nomeado** que as SPECs 0055 e 0057 deixaram explicitamente aberto naquele item — "painel de rede/busca na GUI" —, sem abrir item novo e sem fechar o item 1.4 (seguem abertos execução de comandos sob o Permission Service, redirect por hop, wildcard de subdomínio, IP resolvido e exfiltração via URL/consulta).

Estende também, sem reabrir, o item `Fase 2 — 2.4 Persistência e Gerência Local` (l. 162-166, **já fechado por inteiro** pela SPEC-0038): é a mesma classe de gesto ("configuração por interface gráfica, não só flags"), agora sobre o eixo de rede que não existia quando o 2.4 foi fechado. **Não** reabre o item nem altera seu critério de conclusão.

---

# Objetivo

Dar à janela do `apps/desktop` (`@atlas/desktop`) a capacidade de **ver e configurar, em runtime, o acesso à rede das Tools**: quais hosts o Atlas pode alcançar (`permissions.netRoots`, [ADR-0026](../../06-adr/ADR-0026-network-access-gate.md)) e qual é o endpoint do provedor de busca (`tools.searchUrl`, [SPEC-0057](SPEC-0057-web-search-tool.md)).

Ao final: a partir da janela real, o usuário vê os hosts autorizados e o endpoint de busca configurados em vigor, acrescenta ou remove hosts, define ou limpa o endpoint de busca e aplica a mudança — sem fechar a app, sem variável de ambiente e sem `--allow-net`/`--search-url` na CLI. Autorizar um host **novo** exige consentimento explícito num diálogo nativo que descreve o que está sendo concedido (uma **política** de rede sobre aquele hostname exato, válida enquanto a app estiver aberta), não uma requisição pontual. Depois de aplicar, um Core aberto pela janela passa a julgar `http_get`/`web_search` sob a política nova, e `web_search` passa a **existir** no Tool Registry quando (e só quando) `tools.searchUrl` está configurada — o registro condicional que `@atlas/core` já faz desde a SPEC-0057/D11.

A configuração vale para a **sessão da app** (não sobrevive ao fechamento, que volta aos valores de `flags > env > defaults`) e **nenhum estado persistente novo é criado**.

---

# Motivação

O PRD exige, em Assistência (l. 71), que "o sistema deve **realizar pesquisas**"; em Execução (l. 107-109), que "o sistema deve executar tarefas **autorizadas pelo usuário**" e "integrar ferramentas externas quando necessário"; nas Restrições (l. 205), que nenhuma ação sem autorização adequada; e nos Requisitos Não Funcionais (l. 185), segurança. O Artigo 8 da Constituição exige autorização explícita **ou política previamente configurada**.

A capacidade existe inteira no Core desde as SPECs 0055/0057 — `http_get` e `web_search` são Tools reais, julgadas pelo mesmo portão (`evaluate` sobre `netRoots`), configuradas por `--allow-net`/`ATLAS_ALLOW_NET` e `--search-url`/`ATLAS_SEARCH_URL`. O que falta é **exclusivamente a borda de entrada da GUI**: `apps/desktop` nunca passa `permissions.netRoots` nem `tools.searchUrl` em `configOverride`, então um Core aberto pela janela roda sempre com `netRoots: []` (toda Tool de rede bloqueada) e sem endpoint de busca (a Tool `web_search` sequer é registrada). Hoje, portanto:

- o usuário **não consegue autorizar** nenhum host pela janela — a assimetria "a CLI pode, a janela não" é a mesma que a SPEC-0037 fechou para Persona e a SPEC-0038 para `readRoots`/`writeRoots`;
- o usuário **não consegue configurar nem desativar** a busca pela janela;
- o painel de permissões da janela **nem exibe** o eixo de rede, embora `atlas status` o exiba na CLI desde a SPEC-0055.

Essa ausência é **decisão consciente de escopo**, não limitação técnica: registrada em SPEC-0055/D17 ("expor rede na GUI exigiria repetir todo o desenho de consentimento da SPEC-0038 para um eixo novo — é uma fatia inteira") e reafirmada em SPEC-0057/D15, ambas nomeando o painel como fatia seguinte. Esta SPEC é essa fatia: reabre a **decisão de escopo**, não a arquitetura. Nenhuma cláusula (a)–(e) do ADR-0026 é reaberta, nenhuma linha de `@atlas/permissions`/`@atlas/contracts`/`@atlas/core` muda, nenhuma Tool nova é criada. O app apenas **oferece ao usuário** o mesmo dado de configuração que a CLI já oferece, sob as garantias que ADR-0013/ADR-0026 já estabelecem, com o consentimento explícito que a SPEC-0038 já desenhou para o eixo de escrita.

---

# Referências

- `docs/02-product/ProductRequirementsDocument.md` — Assistência (l. 71, "realizar pesquisas"), Execução (l. 107-109, "tarefas autorizadas pelo usuário"/"integrar ferramentas externas"), Restrições (l. 205), Requisitos Não Funcionais (l. 185, segurança), Critérios de Qualidade (l. 215-220, simplicidade/transparência)
- `docs/00-project/ArchitectureConstitution.md` — Artigo 8 (autorização explícita **ou** política previamente configurada), Artigo 11 (memória é a autoridade do estado persistente), Artigo 1, Artigo 3, Artigo 7, Artigo 13, Artigo 15 / Emenda v1.1 (escalação obrigatória)
- [ADR-0026](../../06-adr/ADR-0026-network-access-gate.md) (`Accepted`) — `ResourceType: 'network'`, política `netRoots` (igualdade exata de hostname, case-insensitive, sem wildcard), default fail-closed `[]`, `evaluate` puro/síncrono; **consumido sem alteração**
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) — portão de execução; políticas configuradas; Tools descrevem, o serviço julga, o Runtime aplica
- [ADR-0006](../../06-adr/ADR-0006-config-source-precedence.md) — `flags > env > arquivo > defaults`; **a validação de config vive exclusivamente no core** (`loadConfig`); slot `arquivo` segue não implementado (fato central de D5/D14)
- [ADR-0003](../../06-adr/ADR-0003-core-composition-root.md) — `apps/*` importam implementação só de `@atlas/core` (+ tipos de `@atlas/contracts`)
- [ADR-0019](../../06-adr/ADR-0019-desktop-electron-stack.md) — Electron; Core só no main process; renderer isolado; sem bundler/`dist`
- [ADR-0009](../../06-adr/ADR-0009-context-service-value-store.md) — sessão de conversa viva, mediada pela aplicação
- `docs/03-architecture/ModuleCatalog.md` — Permission Service (l. 793-832): julga por "políticas configuradas"; **não é responsável por** "modificar políticas silenciosamente" nem "presumir consentimento"; Input/Output Gateway (l. 886-954) — a camada desta SPEC
- [SPEC-0038](SPEC-0038-desktop-permission-roots-gui.md) (Done) — **molde direto**: `selectPermissionRoots`/`selectedPermissionRoots`, `GrantConfirmPort` de política em arquivo próprio, tudo-ou-nada, recusa com operação em voo + **rechecagem imediatamente antes de aplicar** (correção A7), encerramento das sessões vivas, seleção não durável
- [SPEC-0055](SPEC-0055-http-get-network-access.md) (Done) — `http_get`, `netRoots` na CLI (`--allow-net`, `ATLAS_ALLOW_NET` por vírgula), **D17** (a decisão de escopo que esta SPEC reabre), residuais de rede herdados
- [SPEC-0057](SPEC-0057-web-search-tool.md) (Done) — `web_search`, `tools.searchUrl` (`--search-url`/`ATLAS_SEARCH_URL`), **D11** (registro condicional da Tool), **D9** (mesmo portão, sem tratamento especial: "configurar um endpoint não é conceder acesso à rede"), **D10** (os endereços dos resultados não são requisitados), **D15** (a segunda decisão de escopo que esta SPEC reabre)
- [SPEC-0058](SPEC-0058-untrusted-tool-output-framing.md) (Done) — mitigação genérica de injeção indireta de prompt, já ativa para as Tools de rede que esta fatia passa a habilitar na GUI
- [SPEC-0051](SPEC-0051-desktop-cancel-in-flight-operation.md) (Done) — registro único de operações em voo e os quatro predicados nomeados (`hasInFlightOperation()` é o consumido aqui)
- [SPEC-0053](SPEC-0053-desktop-visual-layout.md) (Done) — layout v3.0, drawer de sete painéis, manifesto de IDs estáticos, *progressive disclosure* (contratos que esta fatia precisa respeitar)
- [SPEC-0054](SPEC-0054-desktop-environment-observability.md) (Done) — sétimo e último item do drawer (fato central de D1)
- `apps/desktop/CLAUDE.md` · `packages/core/CLAUDE.md` — estado atual do `core-bridge`, das três portas fail-closed e do wiring de `netRoots`/`tools.searchUrl` em `createAtlas`

---

# Escopo

- **`apps/desktop/src/network-grant-dialog.ts` (NOVO)** — quarta porta fail-closed do app, no molde exato de `permission-grant-dialog.ts` e **sem importar `electron`**:
  - `NetworkGrantRequest { host: string; scope: 'host'; duration: 'session' }`, `NetworkGrantConfirmPort { request(grant: NetworkGrantRequest): Promise<boolean> }`, `createNetworkGrantConfirmDialog({ showMessageBox }): NetworkGrantConfirmPort`;
  - o texto declara explicitamente: (a) que é uma **autorização de acesso de rede** a um host, não uma requisição agora; (b) o **hostname exato**, e que subdomínios **não** são incluídos (ADR-0026(b)); (c) que vale **enquanto esta janela estiver aberta** e é esquecida ao fechar a app; (d) o aviso honesto de que dados a que o Atlas tem acesso podem sair da máquina nessas requisições (residual de exfiltração via URL/consulta, SPEC-0055/SPEC-0057); (e) que a autorização vale para **qualquer Tool de rede** que alcance aquele host — hoje `http_get` **e** `web_search` (inclusive a consulta em texto livre composta pelo modelo, que sai inteira ao provedor) —, porque a política é **por host, nunca por Tool** (ADR-0026(b)), e passará a valer para toda Tool de rede futura sem novo gesto (D18);
  - reusa `DialogOptions`/`ShowMessageBox`/`ShowMessageBoxResult` de `confirm-port.ts` por **import de tipo** (aquele arquivo fica inalterado) e o mesmo fail-closed: só o botão de confirmação resolve `true`; qualquer outro retorno, `cancelId`, valor inesperado ou rejeição resolve `false`, nunca lança;
- **`apps/desktop/src/core-bridge.ts`** — superfície de rede/busca, ao lado da de permissões de FS (cuja semântica sai preservada, com **exatamente uma** guarda nova — o mutex de política de D16):
  - tipos locais `NetworkAccess { netRoots: readonly string[]; searchUrl: string }` e `NetworkAccessSelection extends NetworkAccess { closedSessions: readonly SessionId[] }`;
  - **`composeOverride(configOverride, selections)` (helper interno, origem única da regra de composição — D5/D9)**: recebe o `AtlasConfigOverride` do chamador e um trio `{ persona?, permissions?, network? }` e devolve o override composto, aplicando a precedência da SPEC-0038/D3 (campo explícito do chamador vence; `permissions`/`tools` são **bloco completo**, nunca mesclados). `withSelections(configOverride)` passa a ser **exclusivamente** `composeOverride(configOverride, { persona: <seleção corrente>, permissions: <seleção de FS corrente>, network: <seleção de rede corrente> })` — nenhuma outra função do arquivo monta esse objeto à mão;
  - `selectNetworkAccess(request: NetworkAccess, deps?: { confirmGrant?: NetworkGrantConfirmPort; personaService?: PersonaService; configOverride?: AtlasConfigOverride }): Promise<NetworkAccessSelection>` — as duas deps novas existem pela mesma razão que nas funções irmãs que chamam `loadConfig` (`activePersonaId`, as seis funções de Persona): sem elas, o dry-run leria o `personas.json` real do usuário e validaria um objeto diferente do que o `createAtlas` do chamador receberia. Defaults idênticos aos das irmãs (`configOverride = {}`, `personaService = defaultPersonaService(configOverride)`). Ordem de execução, **fail-closed** (qualquer recusa deixa tudo exatamente como estava; nunca aplicação parcial):
    0. **mutex de aplicação de política** (D16): se já houver uma aplicação de política em curso (deste gesto ou de `selectPermissionRoots`), recusa de imediato; caso contrário marca a flag de módulo e a libera num `finally` que cobre todos os caminhos de saída;
    1. **normalização** (D6): hosts — `trim`, descarte de vazios, dedup **case-insensitive** preservando a primeira grafia recebida; `searchUrl` — `trim` (string vazia = busca desativada);
    2. **validação por dry-run no core** (D5): `loadConfig(composeOverride(configOverride, { persona: <seleção corrente>, permissions: <seleção de FS corrente>, network: { netRoots, searchUrl } }), { personaIds: personaService.list() })` dentro de `try`/`catch` — o candidato é composto pela **mesma** função que `withSelections` usa, com a seleção de rede substituída pela candidata; `InvalidConfigError` ⇒ rejeita com `Error` que carrega a mensagem do core, sem nenhum efeito colateral. Nenhuma regra de formato de hostname ou de URL é reescrita no app;
    3. **operação em voo** ⇒ recusa, via `hasInFlightOperation()` (mesmo predicado que `selectPermissionRoots` consome);
    4. **consentimento por host novo** (D3): host **novo** é o que não está na seleção de rede corrente **comparando em minúsculas** (`toLowerCase()` dos dois lados, D6 — `evaluate` é case-insensitive por ADR-0026(b), então `Exemplo.com` já autorizado e `exemplo.com` são a mesma concessão e **não** reconfirmam); sem seleção corrente, **todos** contam como novos. Para cada host novo, `confirmGrant.request({ host, scope: 'host', duration: 'session' })` — o `host` enviado é a grafia normalizada que será registrada, não a versão em minúsculas usada só na comparação. Qualquer recusa — ou ausência de `confirmGrant` injetado, default fail-closed — aborta a operação inteira. Remover hosts e alterar `searchUrl` **não** abrem diálogo (D4);
    5. **rechecagem de operação em voo** imediatamente antes de aplicar (correção A7 da SPEC-0038: o diálogo pode esperar o usuário indefinidamente);
    6. registra a seleção no estado de módulo e **encerra todas as sessões de chat vivas** (nenhum Core sobrevive à aplicação sob política/registro de Tools superados), devolvendo-as em `closedSessions`;
  - `selectedNetworkAccess(): NetworkAccess | undefined` — leitura do estado de módulo;
  - `selectPermissionRoots` (D16) ganha **a guarda do mutex e nada mais**: mesma flag, marcada no início e liberada em `finally`, com mensagem de recusa própria. Ordem, mensagens, validações, consentimento, rechecagem A7 e encerramento de sessões saem **byte a byte** como estão; a guarda só dispara quando há uma segunda aplicação de política concorrente, situação que nenhum teste existente cria;
  - `StatusSnapshot` (tipo **local** do app) ganha `netRoots: readonly string[]` e `searchUrl: string`, ecoando `config.permissions.netRoots`/`config.tools.searchUrl` (D8);
  - `__resetBridgeStateForTests()` passa a limpar também a seleção de rede **e** o mutex de política;
- **`apps/desktop/src/main.ts`** (casca fina): constrói `confirmNetworkGrant = createNetworkGrantConfirmDialog({ showMessageBox: (o) => dialog.showMessageBox(o) })` ao lado dos adapters já existentes e registra `ipcMain.handle('atlas:network:select', (_e, access) => selectNetworkAccess(access, { confirmGrant: confirmNetworkGrant }))`, removendo de `openChatSessionIds` as sessões devolvidas em `closedSessions` — mesmo tratamento dos handlers de `'atlas:persona:select'`/`'atlas:permissions:select'`. Nenhuma lógica de domínio;
- **`apps/desktop/src/preload.cjs`**: expõe `window.atlas.network.select(access)`;
- **`apps/desktop/src/renderer/index.html` + `renderer.js` + `styles.css`** — duas seções novas **dentro** do painel `#panel-permissions` já existente (D1), seguindo os contratos de *progressive disclosure* da SPEC-0053 (`aria-expanded`/`aria-controls`/`hidden` sincronizados, containers fechados por default, sem emoji em rótulo/controle):
  - **Rede**: `#net-roots-toggle` → `#net-roots-detail` (`#net-roots-list`, `#net-root-input`, `#net-root-add`), lista pintada a partir do `getStatus()` (hosts **configurados** em vigor), com "Remover" por host;
  - **Busca**: `#search-toggle` → `#search-detail` (`#search-url-input`, `#search-url-clear`), campo pintado a partir do status; limpar o campo é o gesto de **desativar** a busca; `#search-host-warning` mostra o aviso fixo de que a busca só funciona se o host do provedor estiver autorizado na lista de rede, e de que o Atlas **não autoriza nada automaticamente** (D10) — exibido sempre que o rascunho de `searchUrl` não está vazio;
  - `#network-inforce` (D17) — linha de texto que mostra, sempre a partir do **status recarregado**, o que está **em vigor** (`hosts em vigor: … · busca em vigor: …`, com `(nenhum)`/`(não configurada)` quando vazios). É o que permite o rascunho sobreviver a uma rejeição sem o usuário perder de vista a configuração real;
  - `#network-apply` ("Aplicar rede e busca") envia o rascunho completo por `window.atlas.network.select({ netRoots, searchUrl })`; `#network-error` mostra erro/recusa;
  - os controles novos entram na **serialização de gestos** existente (`refreshPermissionsPanelState()`): `#net-root-input`, `#net-root-add`, `#search-url-input`, `#search-url-clear`, `#network-apply` **e os botões "Remover" por item de `#net-roots-list`** (`querySelectorAll('#net-roots-list button')`, mesmo precedente de FS, que já desabilita `#read-roots-list button, #write-roots-list button`) ficam desabilitados enquanto `chatTurnInFlight || askInFlight`. Os dois botões de aplicar política (`#permissions-apply` e `#network-apply`) ficam **adicionalmente** desabilitados enquanto uma aplicação de política estiver pendente (camada de renderer do mutex de D16), calculado na mesma origem única;
  - ao aplicar com sucesso: limpa o transcript, escreve o aviso explícito ("Rede e busca alteradas — nova conversa iniciada"), reabre a sessão (`window.atlas.chat.open()`), recarrega o painel de status e **sincroniza o rascunho com o status** (rascunho e configuração em vigor coincidem);
  - ao rejeitar (validação, operação em voo, consentimento recusado — qualquer causa): aviso de erro em `#network-error` dizendo explicitamente que **nada foi aplicado**, transcript e conversa **intactos**, `#network-inforce` recarregado do status e o **rascunho preservado** exatamente como o usuário o digitou (D17), para que um erro de digitação num host não apague a lista inteira;
  - `renderStatus` ganha as linhas `netRoots` e `searchUrl` (`(nenhum)`/`(não configurada)` quando vazios);
- **testes** (ver Estratégia de Testes): `apps/desktop/tests/network-grant-dialog.test.ts` (NOVO), `apps/desktop/tests/core-bridge.network.test.ts` (NOVO), `apps/desktop/tests/renderer.network-panel.test.ts` (NOVO); edições em `renderer.layout.test.ts` (manifesto de IDs), `renderer.gesture-serialization.test.ts` (controles novos) e `core-bridge.status-ask.test.ts` (campos novos do `StatusSnapshot`);
- **documentação**: atualizar `apps/desktop/CLAUDE.md` (superfície de rede/busca, quarta porta fail-closed, canal IPC novo, escopo de vida da seleção, fronteira do que fica de fora) e acrescentar ao [ADR-0026](../../06-adr/ADR-0026-network-access-gate.md) uma seção `# Atualização (SPEC-0059)` registrando que o residual "painel de rede/busca na GUI" foi fechado **sem reabrir nenhuma cláusula (a)–(e)** (D13).

---

# Fora do Escopo

- **auto-start/gerência de processos externos (Ollama, Docker)** e qualquer consumo do [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md) — assunto independente, SPECs próprias; esta SPEC não toca nada relacionado a ele;
- **alterar `@atlas/permissions`, `@atlas/contracts`, `@atlas/core`, `@atlas/tools`, `@atlas/runtime` ou qualquer package** — o diff é confinado a `apps/desktop` (+ a nota de atualização no ADR-0026). Necessidade de mais que isso é motivo para **parar e registrar** (Artigo 1);
- **reabrir qualquer cláusula do ADR-0026** — nada de wildcard de subdomínio, validação de IP resolvido, redirect por hop, política por porta/caminho, `AccessMode` novo ou segunda fonte de política;
- **criar Tool, Skill, Persona ou módulo novo**; nenhuma capacidade de rede nova — só a configuração das duas Tools que já existem;
- **provisionar, descobrir ou testar o provedor de busca** (nenhum "Testar conexão", nenhuma requisição disparada pelo painel, nenhum catálogo de provedores sugeridos) — o app nunca faz IO de rede por conta própria; toda requisição continua saindo de uma Tool, sob o portão, dentro de um turno;
- **autorizar automaticamente o host de `tools.searchUrl`**, pré-preencher o campo de host a partir da URL, ou qualquer forma de derivar política a partir de configuração — explicitamente rejeitado pela SPEC-0057/**D9** ("configurar um endpoint não é conceder acesso à rede"). O app não faz **nenhum** parsing de URL (D10);
- **persistir a configuração de rede/busca entre reinícios** — exigiria estado persistente novo (Artigo 11) ou o slot `arquivo` do ADR-0006, que não existe; qualquer dos dois é decisão estrutural própria, com ADR novo (escalação obrigatória). Mesma fronteira que a SPEC-0038/D2 já registrou para `readRoots`/`writeRoots`;
- **replicar regras de validação de hostname/URL no app** — a autoridade é `loadConfig` (ADR-0006); o app valida por dry-run (D5);
- **alterar `selectPermissionRoots` além da guarda única do mutex de política (D16)** — sua ordem de passos, validações, mensagens de erro existentes, consentimento, rechecagem A7 e encerramento de sessões saem byte a byte como estão, e nenhum caso de `core-bridge.permissions.test.ts` muda de expectativa; **o texto/IDs dos controles de FS já existentes** e **qualquer uma das três portas fail-closed atuais** (`confirm-port.ts`, `permission-grant-dialog.ts`, `persona-delete-dialog.ts`) saem com diff vazio;
- **acrescentar um oitavo item ao drawer** ou mexer no layout v3.0 aprovado em smoke humano (SPEC-0053) além das duas seções novas dentro de `#panel-permissions` (D1);
- **expor a política de rede na CLI além do que já existe** (`--allow-net`/`ATLAS_ALLOW_NET`/`--search-url`/`ATLAS_SEARCH_URL` cobrem o caso) e qualquer superfície de rede em runtime no `atlas chat`;
- **submeter o egress do `@atlas/model-gateway` ao portão** — assimetria conhecida e documentada desde a SPEC-0055 (residual 12); esta fatia não a toca nem a agrava;
- **observabilidade de rede** (contador de requisições, log de hosts alcançados, indicador no painel `Sistema`) — o rastro segue sendo o `ExecutedStep` do turno;
- promover `NetworkAccess`/`NetworkAccessSelection`/`NetworkGrantRequest`/`NetworkGrantConfirmPort` ou o canal IPC a `@atlas/contracts` — só com um 2º consumidor real, via ADR (mesma regra desde a SPEC-0031);
- estilização/UX elaborada, autocomplete de host, histórico de hosts; bundler/framework; empacotamento (Fase 3); E2E/harness headless de Electron em CI.

---

# Pré-requisitos

Status conferido no arquivo de cada SPEC:

- [SPEC-0038](SPEC-0038-desktop-permission-roots-gui.md) (**Done**) — molde de consentimento de política, tudo-ou-nada, rechecagem A7, encerramento de sessões, `withSelections`.
- [SPEC-0055](SPEC-0055-http-get-network-access.md) (**Done**) — `netRoots` no Permission Service/`loadConfig` e a Tool `http_get`.
- [SPEC-0057](SPEC-0057-web-search-tool.md) (**Done**) — `tools.searchUrl`, registro condicional de `web_search`, `searxngSearchPort`.
- [SPEC-0051](SPEC-0051-desktop-cancel-in-flight-operation.md) (**Done**) — registro único de operações em voo e `hasInFlightOperation()`.
- [SPEC-0053](SPEC-0053-desktop-visual-layout.md) (**Done**) — layout v3.0, manifesto de IDs, contratos de disclosure.
- [SPEC-0054](SPEC-0054-desktop-environment-observability.md) (**Done**) — estado atual do drawer (sete painéis) e do manifesto de 86 IDs.

---

# Critérios de Aceitação

Verificação, salvo indicação em contrário, por `pnpm test` na raiz.

**Gates de repositório**

- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm format:check` passam na raiz, cobrindo os arquivos novos/alterados de `apps/desktop` (inclusive `renderer.js`/`preload.cjs`).

**Adapter de consentimento (`network-grant-dialog.test.ts`)**

- com um `showMessageBox` fake, `createNetworkGrantConfirmDialog(...).request({ host: 'exemplo.com', scope: 'host', duration: 'session' })` monta `DialogOptions` cujo texto (`title` + `message` + `detail`, concatenados) contém, por asserção: (a) "autorizar"/"autorização" e "acesso de rede"; (b) o host `exemplo.com` e a menção explícita de que **subdomínios não são incluídos**; (c) que a autorização vale **enquanto a janela estiver aberta** e é esquecida ao fechar; (d) o aviso de que dados podem **sair da máquina** nessas requisições; (e) que a autorização vale para **qualquer ferramenta de rede** que alcance aquele host, nomeando as duas existentes hoje (`http_get` **e** `web_search`) e dizendo que a **consulta de busca** também é enviada ao host — asserção de substring sobre os dois nomes de Tool e sobre a frase de "qualquer ferramenta de rede" (D18); e **não** contém as frases dos outros dois diálogos ("Confirmar ação irreversível", "permissão de escrita");
- fail-closed: botão de cancelar, `cancelId`, índice inesperado e `showMessageBox` que rejeita ⇒ todos resolvem `false`, sem lançar;
- o arquivo **não** importa `electron` (a suíte roda sob Vitest sem Electron).

**Bridge (`core-bridge.network.test.ts`)**

- **feliz, rede**: com `confirmGrant` que aprova, `selectNetworkAccess({ netRoots: ['exemplo.com'], searchUrl: '' })` resolve; `confirmGrant` foi chamado **exatamente uma vez**, com `{ host: 'exemplo.com', scope: 'host', duration: 'session' }`; um `resolveStatusSnapshot()` subsequente (sem `configOverride`) reporta `netRoots: ['exemplo.com']` e `searchUrl: ''`;
- **feliz, busca**: `selectNetworkAccess({ netRoots: [], searchUrl: 'https://busca.exemplo.com/search' })` resolve **sem** chamar `confirmGrant` (D4), e o `resolveStatusSnapshot()` seguinte reporta esse `searchUrl`;
- **desativar busca**: aplicar `searchUrl: ''` sobre uma seleção com busca configurada resolve sem diálogo e o status volta a `searchUrl: ''`;
- **estado inicial**: antes de qualquer chamada, `selectedNetworkAccess()` é `undefined` e `resolveStatusSnapshot()` reporta `netRoots: []`/`searchUrl: ''` (defaults de `loadConfig`);
- **recusa fail-closed**: com `confirmGrant` que recusa, a chamada **rejeita**; `selectedNetworkAccess()` fica inalterado (inclusive o `searchUrl` pedido na mesma chamada — nada é aplicado parcialmente), nenhuma sessão viva é encerrada, e o status seguinte reporta o estado anterior;
- **sem `confirmGrant` injetado**: pedir host novo sem `confirmGrant` rejeita pelo mesmo caminho (default fail-closed);
- **host já autorizado não reconfirma**: autorizado `exemplo.com`, uma segunda chamada que o mantém (ex.: mudando só `searchUrl`) **não** chama `confirmGrant`; **remover** um host também não chama;
- **novidade é case-insensitive contra a seleção corrente (D6)**: autorizado `exemplo.com`, uma segunda chamada com `netRoots: ['EXEMPLO.COM']` (ou `'Exemplo.Com'`) resolve **sem nenhum** `confirmGrant.request` (spy: zero chamadas), e a seleção resultante continua com **uma** entrada; simetricamente, autorizado `EXEMPLO.com` numa primeira aplicação, uma segunda com `exemplo.com` também **não** reconfirma. Um host de fato novo na mesma chamada (`outro.com`) continua abrindo **exatamente um** diálogo;
- **normalização (D6)**: `[' exemplo.com ', 'exemplo.com', 'EXEMPLO.com', '']` ⇒ `['exemplo.com']` (dedup case-insensitive, primeira grafia preservada, vazio descartado), com **um único** `confirmGrant.request`, cujo `host` é a grafia preservada (`'exemplo.com'`), não a versão em minúsculas de comparação;
- **validação por dry-run (D5)**: `netRoots: ['https://exemplo.com']`, `netRoots: ['exemplo.com/x']`, `netRoots: ['a b']`, `searchUrl: 'ftp://x'` e `searchUrl: 'https://x/s?q=1'` **rejeitam**, com mensagem que carrega o texto de `issues` do core, **sem** chamar `confirmGrant` e sem nenhum efeito colateral;
- **o dry-run compõe o candidato pela mesma função da aplicação real (D5/D9)**: com uma seleção de FS ativa (`selectPermissionRoots`) e uma Persona custom selecionada, um `selectNetworkAccess` **válido** resolve — prova de que o candidato validado carrega as demais seleções em vez de um objeto montado à parte (um candidato sem elas falharia a validação de Persona por `personaIds`); e uma asserção estrutural (`grep`) prova que `loadConfig` é chamado em `core-bridge.ts` **apenas** com o retorno de `composeOverride`/`withSelections` — nenhum literal de override montado à mão;
- **`deps.personaService`/`deps.configOverride` no dry-run**: `selectNetworkAccess({...}, { personaService: <fake com catálogo próprio>, configOverride: { persona: <id do fake> } })` resolve sem tocar o `personas.json` real (o fake registra as chamadas de `list()`); e o mesmo `personaService` fake **é** o consultado (spy), como nas funções irmãs de Persona;
- **verificação estrutural de regras de config no app** (`grep`): `apps/desktop/src/core-bridge.ts`, `network-grant-dialog.ts`, `main.ts`, `preload.cjs` e `renderer/renderer.js` — isto é, exatamente os arquivos tocados por esta SPEC — não contêm regex/lista de caracteres proibidos de hostname nem chamada a `new URL`. O grep **exclui** `apps/desktop/src/renderer/vendor/**` (runtime VAD vendorizado da SPEC-0052, que já contém `new URL` e não é código do projeto);
- **turno de chat em voo**: com um `sendChatTurn` pendente (gateway `fake` de resolução controlada pelo teste), `selectNetworkAccess(...)` **rejeita**, a seleção fica inalterada, nenhum `confirmGrant` é solicitado, e o turno conclui íntegro; depois de concluído, a mesma chamada passa a ser aceita;
- **`ask` em voo**: idem, com `resolveAskSnapshot` pendente;
- **rechecagem A7**: com um `confirmGrant` que só resolve quando o teste liberar, iniciar um `ask` **durante** o diálogo faz a aplicação **rejeitar** mesmo com o consentimento concedido — nada aplicado, nenhuma sessão encerrada;
- **sessões vivas**: com uma sessão de chat aberta e ociosa, uma aplicação bem-sucedida devolve essa `SessionId` em `closedSessions`, e um `sendChatTurn` posterior nela rejeita com o erro estruturado de sessão encerrada; sem sessões abertas, `closedSessions` é `[]`;
- **precedência (bloco completo, D9)**: com seleção de rede ativa, `resolveStatusSnapshot({ permissions: { readRoots: [dirA], writeRoots: [], netRoots: ['outro.com'] } })` reporta `outro.com`; e um `permissions` **parcial** do chamador (`{ readRoots: [dirA] }`) **não** recebe merge da seleção de rede — `netRoots` resultante é o default `[]`. O mesmo vale para `tools`;
- **coexistência com a SPEC-0038**: aplicadas as duas seleções (FS por `selectPermissionRoots`, rede por `selectNetworkAccess`), um `resolveStatusSnapshot()` reporta **as três** listas simultaneamente (`readRoots`/`writeRoots`/`netRoots`) mais o `searchUrl`; e os testes existentes de `core-bridge.permissions.test.ts` passam **sem edição** (a guarda nova de `selectPermissionRoots` só dispara com uma segunda aplicação de política concorrente, situação que nenhum caso existente cria);
- **mutex de política — rede bloqueia FS (D16)**: com um `confirmGrant` de rede que só resolve quando o teste liberar (diálogo nativo "aberto"), um `selectPermissionRoots(...)` disparado nesse intervalo **rejeita** com a mensagem de aplicação de política em curso, **sem** chamar o `GrantConfirmPort` de escrita (spy: zero chamadas — nenhum segundo diálogo empilhado) e sem alterar a seleção de FS; liberado o diálogo de rede, a aplicação de rede conclui e um `selectPermissionRoots` posterior passa a ser aceito;
- **mutex de política — FS bloqueia rede (D16)**: simétrico, com o `GrantConfirmPort` de escrita pendente e `selectNetworkAccess(...)` no intervalo ⇒ rejeita, `confirmGrant` de rede **não** é chamado, nada aplicado;
- **mutex de política — reentrância do próprio gesto (D16)**: dois `selectNetworkAccess(...)` concorrentes com o primeiro diálogo pendente ⇒ o segundo rejeita de imediato; idem para dois `selectPermissionRoots` concorrentes;
- **mutex liberado em todos os caminhos de saída (D16)**: depois de uma rejeição por validação, por operação em voo, por consentimento recusado e depois de um sucesso, uma aplicação de política seguinte **é aceita** (asserção nos quatro casos — a flag nunca fica presa); `__resetBridgeStateForTests()` também a limpa (uma aplicação imediatamente após o reset é aceita);
- **efeito de ponta a ponta no portão** (sem rede externa): com o gateway `fake` instruído a produzir um plano que chama uma Tool de rede contra `http://127.0.0.1:<porta fechada>`, o `ExecutedStep` resultante de um `resolveAskSnapshot` é **negado por política** (`denialKind: 'blocked'`) sem seleção de rede, e deixa de ser negado por política quando `127.0.0.1` é autorizado por `selectNetworkAccess` (passando a falhar por transporte/conexão recusada). A fatia altera de fato o veredicto do Permission Service, não só o texto do painel;
- `selectNetworkAccess` e o adapter novo não importam nem dependem de Electron.

**Renderer (`renderer.network-panel.test.ts`, sobre o harness da SPEC-0045)**

- no arranque, a lista `#net-roots-list`, o campo `#search-url-input` e a linha `#network-inforce` são pintados a partir do `getStatus()`, e `renderStatus` inclui as linhas `netRoots`/`searchUrl`;
- adicionar/remover host altera só o rascunho local; `#network-apply` chama `window.atlas.network.select` **uma vez**, com o rascunho **completo** (substituição, nunca merge);
- sucesso ⇒ transcript limpo, aviso "Rede e busca alteradas — nova conversa iniciada", `chat.open()` chamado, status recarregado, e rascunho **sincronizado** com o status (lista e campo iguais aos valores em vigor);
- recusa (promessa rejeitada) ⇒ `#network-error` preenchido com texto que diz que **nada foi aplicado**, transcript **intacto**, `chat.open()` **não** chamado, `#network-inforce` recarregado do status;
- **rascunho preservado em rejeição (D17)**: com três hosts digitados no rascunho e a promessa de `network.select` rejeitando (tanto por mensagem de validação quanto por operação em voo), `#net-roots-list` continua com **os mesmos três** itens na mesma ordem e `#search-url-input` continua com o texto digitado — nenhum recarregamento do rascunho a partir do status; corrigir o item inválido e clicar em `#network-apply` de novo envia a lista completa corrigida;
- `#search-host-warning` fica visível sse o rascunho de `searchUrl` não está vazio, e seu texto contém a frase de que o host precisa estar autorizado e de que o Atlas não autoriza nada automaticamente;
- `#net-root-add`, `#net-root-input`, `#search-url-input`, `#search-url-clear`, `#network-apply` **e todos os botões de `#net-roots-list button`** (os "Remover" por item, mesmo tratamento que `#read-roots-list button, #write-roots-list button` já recebem) ficam desabilitados enquanto `chatTurnInFlight || askInFlight` e voltam a ficar habilitados ao fim — inclusive os botões pintados **depois** de a serialização começar (adicionar host durante um turno não produz botão habilitado); extensão da tabela de `renderer.gesture-serialization.test.ts`;
- **camada de renderer do mutex (D16)**: com um `network.select` pendente, `#permissions-apply` **e** `#network-apply` ficam desabilitados; assentada a promessa (resolvida ou rejeitada), os dois voltam a ficar habilitados; simetricamente, com um `permissions.select` pendente, os dois ficam desabilitados;
- disclosure: `#net-roots-detail` e `#search-detail` começam `hidden`, com `aria-expanded="false"` sincronizado nos respectivos toggles;
- `renderer.layout.test.ts` passa com o manifesto atualizado: **86 → 99 IDs** (13 novos — `#net-roots-toggle`, `#net-roots-detail`, `#net-roots-list`, `#net-root-input`, `#net-root-add`, `#search-toggle`, `#search-detail`, `#search-url-input`, `#search-url-clear`, `#search-host-warning`, `#network-inforce`, `#network-apply`, `#network-error` —, todos dentro de `#panel-permissions`), sem IDs estruturais extras e sem remover nenhum existente.

**Fronteira**

- nenhum arquivo de `apps/desktop/src` importa de `@atlas/permissions`/`@atlas/tools`/qualquer package que não seja `@atlas/core`/`@atlas/contracts` (`grep`);
- `apps/desktop/package.json` **não** ganha dependência nova;
- **diff vazio** em `packages/*` (inclusive `@atlas/contracts`/`@atlas/core`/`@atlas/permissions`/`@atlas/tools`) e em `apps/cli`;
- **diff vazio** em `apps/desktop/src/confirm-port.ts`, `permission-grant-dialog.ts`, `persona-delete-dialog.ts`, `speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`, `hands-free.ts`, `system-metrics.ts`, `token-usage.ts`;
- o gate de paridade renderer↔módulo (`renderer.speech-parity.test.ts`) segue vigiando **seis** módulos-fonte e passa **sem edição** — nenhuma réplica nova é criada no renderer (D15).

**Smoke manual** (registrado nas Observações ao fechar)

- em sessão gráfica real (`pnpm --filter @atlas/desktop start`): (a) o painel mostra hosts e endpoint configurados (`#network-inforce`); (b) adicionar um host abre o diálogo nativo, e o texto lido na tela deixa claro que se trata de **autorizar acesso de rede àquele host exato, sem subdomínios, enquanto a janela estiver aberta, para qualquer ferramenta de rede (`http_get` e `web_search`)** — cancelar não muda nada, confirmar aplica; (c) com host autorizado, pedir no chat algo que use `http_get` deixa de ser bloqueado; (d) com `searchUrl` configurada **e** o host do provedor autorizado, uma pergunta que exija busca executa `web_search`; sem o host autorizado, é bloqueada; (e) limpar `searchUrl` e aplicar faz a busca deixar de existir na conversa seguinte; (f) durante um turno de chat/`ask` o painel aparece desabilitado e a aplicação é recusada; (g) com o diálogo de autorização de rede aberto, o botão "Aplicar" do bloco de FS aparece desabilitado e não abre um segundo diálogo (D16); (h) um host com erro de digitação é recusado com a mensagem do core **sem apagar a lista digitada** (D17); (i) fechar e reabrir a app volta aos valores da config.

**Documentação**

- `apps/desktop/CLAUDE.md` atualizado; `ADR-0026` com a seção `# Atualização (SPEC-0059)`; estrutura corresponde a "Arquivos Esperados".

---

# Arquivos Esperados

```text
apps/
└── desktop/
    ├── src/
    │   ├── network-grant-dialog.ts       # NOVO: NetworkGrantRequest/NetworkGrantConfirmPort +
    │   │                                 #   createNetworkGrantConfirmDialog (texto de AUTORIZAÇÃO
    │   │                                 #   DE REDE, fail-closed, sem import de electron)
    │   ├── core-bridge.ts                # + NetworkAccess/NetworkAccessSelection,
    │   │                                 #   selectNetworkAccess/selectedNetworkAccess,
    │   │                                 #   composeOverride (origem única) + withSelections
    │   │                                 #   compondo permissions+tools (D5/D9),
    │   │                                 #   mutex de aplicação de política (D16) —
    │   │                                 #   única linha nova em selectPermissionRoots,
    │   │                                 #   StatusSnapshot + netRoots/searchUrl,
    │   │                                 #   __resetBridgeStateForTests estendido
    │   ├── main.ts                       # + confirmNetworkGrant + ipcMain.handle('atlas:network:select');
    │   │                                 #   sincroniza openChatSessionIds
    │   ├── preload.cjs                   # + window.atlas.network.select(access)
    │   ├── confirm-port.ts               # INALTERADO (só import de tipo)
    │   ├── permission-grant-dialog.ts    # INALTERADO
    │   └── renderer/
    │       ├── index.html                # + seções Rede e Busca dentro de #panel-permissions (13 IDs)
    │       ├── styles.css                # + estilo mínimo das seções novas (paleta v3.0, sem emoji)
    │       └── renderer.js               # + rascunho de hosts/endpoint (preservado em rejeição, D17),
    │                                     #   linha "em vigor", aplicar, aviso, reabrir chat,
    │                                     #   recarregar status; serialização de gestos estendida
    │                                     #   (inclui #net-roots-list button e o mutex de D16)
    ├── tests/
    │   ├── network-grant-dialog.test.ts  # NOVO
    │   ├── core-bridge.network.test.ts   # NOVO
    │   ├── renderer.network-panel.test.ts# NOVO
    │   ├── renderer.layout.test.ts       # editado: manifesto 86 → 99
    │   ├── renderer.gesture-serialization.test.ts # editado: controles novos
    │   └── core-bridge.status-ask.test.ts# editado: campos novos do StatusSnapshot
    └── CLAUDE.md                         # + superfície de rede/busca, 4ª porta fail-closed, IPC novo

docs/
└── 06-adr/
    └── ADR-0026-network-access-gate.md   # + seção "Atualização (SPEC-0059)"
```

Nenhum arquivo novo em `packages/*` ou `apps/cli`. Lista é expectativa e pode sofrer pequenos ajustes.

---

# Componentes Impactados

Camada **Interaction** do Module Catalog, no app `apps/desktop`:

- **Input Gateway** (semente desktop) — ganha os gestos "autorizar/remover host de rede", "definir/limpar endpoint de busca" e o gesto de consentimento de autorização de rede;
- **Output Gateway** (semente desktop) — ganha a exibição dos hosts autorizados e do endpoint configurados, o diálogo de autorização, o aviso sobre o host da busca e o aviso de aplicação.

Consome, **sem alterar**: Core (`createAtlas`/`loadConfig` com `permissions.netRoots` e `tools.searchUrl`), Configuration Service (validação — única autoridade), Permission Service (`evaluate` sobre `netRoots`), Tool Registry (registro condicional de `web_search`), Runtime, Context Service (via `closeChatSession`), Lifecycle Manager.

Nenhum componente de `packages/*` é modificado.

---

# Interfaces Necessárias

Locais em `apps/desktop` (não em `@atlas/contracts` — não há segundo consumidor):

```text
// network-grant-dialog.ts — AUTORIZAÇÃO DE POLÍTICA DE REDE (não requisição agora)
NetworkGrantRequest {
  host:     string
  scope:    'host'       // literal: hostname exato, sem subdomínios (ADR-0026(b))
  duration: 'session'    // literal: vale enquanto a app estiver aberta
}
NetworkGrantConfirmPort { request(grant: NetworkGrantRequest): Promise<boolean> }
createNetworkGrantConfirmDialog(deps: { showMessageBox: ShowMessageBox }): NetworkGrantConfirmPort

// core-bridge.ts
NetworkAccess {
  netRoots:  readonly string[]
  searchUrl: string            // '' = busca desativada (Tool não registrada)
}
NetworkAccessSelection extends NetworkAccess {
  closedSessions: readonly SessionId[]
}

selectNetworkAccess(
  request: NetworkAccess,
  deps?: {
    confirmGrant?:   NetworkGrantConfirmPort,  // default: recusa tudo (fail-closed)
    personaService?: PersonaService,           // default: defaultPersonaService(configOverride)
    configOverride?: AtlasConfigOverride,      // default: {} — mesmas deps das funções
  },                                           //   irmãs que chamam loadConfig
): Promise<NetworkAccessSelection>
  // rejeita, sem nenhum efeito colateral, se:
  //   já há uma aplicação de política em curso (mutex compartilhado com
  //     selectPermissionRoots — D16)
  //   | loadConfig recusa o candidato (hostname/URL inválidos — autoridade do core;
  //     candidato composto por composeOverride, a MESMA função de withSelections)
  //   | há operação em voo (na checagem inicial OU na rechecagem pós-diálogo)
  //   | algum host NOVO (comparação em minúsculas contra a seleção corrente) não
  //     foi autorizado

selectedNetworkAccess(): NetworkAccess | undefined

// helper interno (não exportado): origem ÚNICA da regra de composição — D5/D9
composeOverride(
  configOverride: AtlasConfigOverride,
  selections: {
    persona?:     string,
    permissions?: PermissionRoots,
    network?:     NetworkAccess,
  },
): AtlasConfigOverride
  // withSelections(o) === composeOverride(o, { persona, permissions, network } correntes)
  // dry-run       === composeOverride(o, { …correntes, network: <candidato> })

StatusSnapshot {  // estendido, tipo local
  … campos atuais …
  netRoots:  readonly string[]
  searchUrl: string
}
```

`ShowMessageBox`/`DialogOptions`/`ShowMessageBoxResult` já existem em `confirm-port.ts` (import de tipo). Nenhuma interface nova em `@atlas/contracts`; nenhum tipo novo em `packages/*`.

Canal IPC novo (nome estável, ao lado dos existentes):

```text
main:     ipcMain.handle('atlas:network:select', (_e, access) =>
            selectNetworkAccess(access, { confirmGrant: confirmNetworkGrant }))
preload:  window.atlas.network.select(access)
            → ipcRenderer.invoke('atlas:network:select', access)
renderer: const selection = await window.atlas.network.select({ netRoots, searchUrl })
```

---

# Fluxo Esperado

```text
[abertura da janela]
renderer → window.atlas.getStatus() → [main] resolveStatusSnapshot()
  → pinta hosts autorizados (config.permissions.netRoots) e endpoint (config.tools.searchUrl)
    CONFIGURADOS — nunca a política resolvida internamente

[usuário edita a lista/endpoint e clica em "Aplicar rede e busca"]
renderer → window.atlas.network.select({ netRoots, searchUrl })
  → [main] ipcMain.handle('atlas:network:select')
      → selectNetworkAccess(access, { confirmGrant })
          0. mutex de política já tomado?  ⇒ rejeita (nada muda)   [D16]
             senão toma o mutex; libera em finally, em TODOS os caminhos
          1. normaliza (trim; descarta vazios; dedup case-insensitive; searchUrl só trim)
          2. dry-run: loadConfig(composeOverride(configOverride, { …seleções correntes,
                                                  network: candidato }),
                                 { personaIds: personaService.list() })
             → InvalidConfigError                        ⇒ rejeita (nada muda)
          3. operação em voo?                            ⇒ rejeita (nada muda)
          4. para cada host NOVO (toLowerCase vs. seleção corrente em toLowerCase):
               confirmGrant.request({ host, scope:'host', duration:'session' })
               recusou (ou sem confirmGrant)             ⇒ rejeita (nada aplicado)
          5. recheca operação em voo (A7)                ⇒ rejeita (nada aplicado)
          6. registra a seleção; encerra as sessões de chat vivas
             → { netRoots, searchUrl, closedSessions }
      → main.ts remove closedSessions de openChatSessionIds
  → renderer: limpa transcript, avisa, reabre a sessão, recarrega o status
             e sincroniza o rascunho com o status
  → se rejeitou: aviso "nada foi aplicado" em #network-error, conversa intacta,
                 RASCUNHO PRESERVADO (D17); só #network-inforce recarrega do status

[interações seguintes]
resolveStatusSnapshot / resolveAskSnapshot / openChatSession / resolveMemorySnapshot / forgetFact
  → createAtlas({ config: { ...override,
                            permissions: <FS ⊕ rede, se o chamador não passou o bloco>,
                            tools:       <{ searchUrl }, se o chamador não passou o bloco> } })
  → loadConfig valida  →  createPermissionService({ readRoots, writeRoots, netRoots })
  → web_search registrada sse config.tools.searchUrl !== ''   (SPEC-0057/D11)
  → o portão do Runtime julga host por igualdade exata contra netRoots (ADR-0026)
```

Regras (para remover ambiguidade):

- o Core vive **exclusivamente no main process**; o renderer troca apenas strings planas e recebe `NetworkAccessSelection` plano;
- a política chega ao Permission Service **só** pelo caminho já existente (`createAtlas` → `loadConfig` → `createPermissionService`). O app **nunca** chama `evaluate`, **nunca** compara host, **nunca** faz requisição — não reimplementa nenhuma parcela da autoridade do ADR-0013/ADR-0026;
- **substituição, nunca merge**: cada aplicação carrega a lista completa de hosts e o endpoint, e substitui a seleção anterior por inteiro (mesma semântica de `--allow-net` na CLI). Um `configOverride.permissions`/`tools` explícito do chamador é **bloco completo**;
- **tudo ou nada**: qualquer recusa em qualquer etapa deixa a seleção anterior intacta (nunca "aplicou o host, falhou no endpoint");
- **ampliar alcance de rede nunca é silencioso**: host novo exige aprovação num diálogo que descreve **autorização de rede sobre aquele hostname exato, válida enquanto a app estiver aberta, para qualquer Tool de rede** (D18); sem `NetworkGrantConfirmPort`, o default é recusar (Artigo 8);
- **novidade de host é decidida em minúsculas** dos dois lados (D6), espelhando a comparação case-insensitive do `evaluate` (ADR-0026(b)) — a mesma política nunca é reconfirmada por diferença de caixa, e nenhuma comparação de host acontece fora desse único ponto (o julgamento continua sendo do Permission Service);
- **reduzir alcance não exige confirmação** e é sempre aceito (sujeito às demais validações) — remover host e limpar `searchUrl` são o lado seguro;
- **configurar endpoint ≠ conceder rede** (SPEC-0057/**D9**): `searchUrl` sozinha não autoriza host nenhum, e o painel diz isso explicitamente em vez de "resolver" por conta própria;
- **operação em voo bloqueia a aplicação, em duas camadas** (renderer desabilita; bridge recusa) e a checagem é **refeita** depois do diálogo;
- **uma aplicação de política por vez** (D16), também em duas camadas: o renderer desabilita os dois botões de aplicar enquanto um `select` está pendente, e o bridge recusa por mutex — nunca há dois diálogos de consentimento empilhados (de rede, de escrita ou o mesmo duas vezes), que é a condição em que um "OK" pode ser dado para a concessão errada (Artigo 8);
- **rascunho ≠ configuração em vigor** (D17): o painel mostra os dois — a lista/campo editáveis são rascunho; `#network-inforce` mostra o que o Core recebeu. Rejeição preserva o rascunho e recarrega só o "em vigor";
- **nenhum Core sobrevive à aplicação sob política/registro superados**: a aplicação só ocorre sem operação em voo e encerra as sessões vivas — importante aqui não só pela política, mas porque o Tool Registry de um Core vivo foi montado com a `searchUrl` antiga;
- a seleção é **estado de sessão da app**, em memória do main process: não é conhecimento persistente (Artigo 11), não cria arquivo, e fechar a app devolve tudo a `flags > env > defaults` — o alcance de rede concedido **não sobrevive** ao reinício (fail-closed por construção).

---

# Estratégia de Implementação

1. criar `network-grant-dialog.ts` (texto de autorização + fail-closed) e testá-lo primeiro em `tests/network-grant-dialog.test.ts`;
2. **primeiro** extrair `composeOverride` de `withSelections` (refatoração pura, sem mudança de comportamento — a suíte existente precisa passar sem edição **antes** de qualquer código de rede entrar), e só então introduzir o mutex de política (D16), com `finally` cobrindo todos os caminhos de saída das duas funções;
3. estender `core-bridge.ts`: tipos, estado de módulo, `selectNetworkAccess` na ordem exata do Escopo (mutex → normalizar → dry-run por `composeOverride` → em voo → consentimento por host novo, comparação em minúsculas → rechecagem → aplicar + encerrar sessões), `selectedNetworkAccess`, `withSelections` delegando a `composeOverride` (FS ⊕ rede ⊕ `tools`), `StatusSnapshot` estendido, reset ampliado. Atenção ao `exactOptionalPropertyTypes` (padrão recorrente): só definir `permissions`/`tools` quando houver seleção;
4. testes de `core-bridge.network.test.ts` (TDD), na ordem dos Critérios de Aceitação, incluindo rechecagem A7, as quatro baterias de mutex, a novidade case-insensitive e o efeito de ponta a ponta no portão com `127.0.0.1`;
5. `main.ts` (construir o adapter, registrar o handler, sincronizar `openChatSessionIds`) e `preload.cjs`;
6. `renderer/index.html` + `styles.css` + `renderer.js`: seções Rede e Busca dentro de `#panel-permissions`, disclosure, rascunho local **preservado em rejeição**, linha `#network-inforce`, aplicar, avisos, reabertura do chat, recarga do status, serialização de gestos (controles fixos + `#net-roots-list button` + mutex dos dois applies); atualizar o manifesto em `renderer.layout.test.ts`;
7. `renderer.network-panel.test.ts` e a extensão de `renderer.gesture-serialization.test.ts`/`core-bridge.status-ask.test.ts`;
8. rodar os quatro comandos na raiz e as verificações de fronteira por `grep` (sem import de `@atlas/permissions`/`@atlas/tools`; sem `new URL` nos arquivos tocados por esta SPEC, excluído `src/renderer/vendor/**`; `loadConfig` sempre alimentado por `composeOverride`/`withSelections`; diff vazio nos arquivos listados);
9. smoke manual em sessão gráfica real e registro do resultado;
10. atualizar `apps/desktop/CLAUDE.md` e acrescentar a seção `# Atualização (SPEC-0059)` ao ADR-0026; validar todos os critérios.

---

# Estratégia de Testes

- testes unitários em `apps/desktop/tests/` sob o Vitest já configurado, **sem Electron**, como em todas as SPECs 0031-0054;
- **adapter de autorização**: texto montado (autorização de rede, host exato, sem subdomínios, duração de sessão, aviso de saída de dados, alcance por host valendo para qualquer Tool de rede — `http_get` e `web_search` nomeadas; ausência das frases dos outros dois diálogos) e fail-closed exaustivo;
- **bridge**: caminhos feliz/recusa/validação/em voo/rechecagem/normalização/precedência/mutex, com `confirmGrant` fake instrumentado (contagem e argumentos exatos) e gateway `fake` de resolução controlada pelo teste para as operações em voo; os casos de mutex usam **diálogo pendente controlado pelo teste** (a única forma de observar duas aplicações de política simultâneas), com spy nas duas portas de concessão provando que a segunda **não** chega a abrir diálogo; nenhuma chamada de rede real em nenhum caso — o único endpoint usado é `127.0.0.1` em porta fechada, e o que se afere é a **mudança de veredicto** (bloqueio de política × falha de transporte);
- **renderer**: sobre o harness `jsdom` da SPEC-0045, comportamento observável (IPC registrado + DOM), com o caminho de recusa em pé de igualdade com o de sucesso (inclusive a preservação do rascunho, D17), no molde de `renderer.permissions-panel.test.ts`;
- **layout**: manifesto de IDs atualizado e contratos de disclosure (`hidden`/`aria-expanded`) verificados, para não regredir o layout v3.0 aprovado em smoke humano;
- **fronteira**: `grep` provando ausência de imports proibidos, de `new URL` e de regras de hostname **nos arquivos tocados por esta SPEC** (`core-bridge.ts`, `network-grant-dialog.ts`, `main.ts`, `preload.cjs`, `renderer/renderer.js`), excluído `apps/desktop/src/renderer/vendor/**` — o runtime VAD vendorizado da SPEC-0052 já contém `new URL` e não é código do projeto, então um grep sobre `apps/desktop/src` inteiro falharia por construção; mais o grep de origem única de `loadConfig`; diff vazio nos módulos listados; gate de paridade passando sem edição.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` passarem na raiz;
- o smoke manual em janela real for executado e seu resultado registrado nas Observações (inclusive itens reprovados, se houver);
- `apps/desktop/CLAUDE.md` e a nota de atualização do ADR-0026 estiverem escritos;
- arquitetura preservada (nenhuma cláusula do ADR-0026 reaberta; diff vazio em `packages/*`/`apps/cli`);
- revisão concluída e lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é o passo de fecho `doc-sync`, não escopo do `spec-implementer`. O implementador toca apenas a documentação específica desta SPEC — o arquivo da SPEC, `apps/desktop/CLAUDE.md` e a nota de atualização no ADR-0026, ambos previstos aqui.

---

# Restrições

- não criar módulos, Tools, Skills ou Personas;
- não alterar `packages/*` nem `apps/cli`;
- não reabrir nenhuma cláusula do ADR-0026 nem do ADR-0013;
- não replicar validação de config no app — `loadConfig` é a única autoridade (ADR-0006) — nem montar override de config fora de `composeOverride` (origem única, D5/D9);
- não alterar `selectPermissionRoots` além da guarda única do mutex de política (D16);
- não introduzir dependência de runtime nova;
- não fazer nenhuma requisição de rede a partir de `apps/desktop/src`;
- não persistir a configuração de rede/busca;
- não acrescentar item ao drawer nem alterar IDs/labels existentes do layout v3.0;
- o renderer nunca importa `packages/*`; o Core vive só no main process.

---

# Observações

- **Divergência configurado × resolvido**: o painel mostra `config.permissions.netRoots`/`config.tools.searchUrl` (o que o `loadConfig` validou). Diferente do eixo de FS, aqui não há resolução posterior (`realpath`) — a comparação de host é feita direto sobre a lista, case-insensitive. A divergência que existia no painel de FS não tem análogo de rede.
- **Residuais herdados, não fechados por esta fatia** (todos já documentados em SPEC-0055/SPEC-0057/ADR-0026, e agora alcançáveis pela GUI): DNS rebinding/IP resolvido não validado; redirect não seguido; ausência de wildcard de subdomínio (cada subdomínio exige uma entrada); concessão por host, nunca por porta/caminho; loopback alcançável se listado; exfiltração pela URL/consulta que o portão não julga; injeção indireta de prompt (mitigada, não fechada, pela SPEC-0058); ausência de observabilidade dedicada de rede; assimetria com o `@atlas/model-gateway`, que faz egress sem portão. Esta SPEC **expõe** a capacidade sob consentimento explícito; não muda nenhum desses fatos, e o texto do diálogo diz isso ao usuário em vez de escondê-lo.
- **Assimetria consciente de painel**: `netRoots` é política de permissão; `tools.searchUrl` é configuração de provedor. As duas convivem no mesmo painel por decisão registrada (D1) e são separadas visualmente por títulos próprios; só a primeira abre diálogo de consentimento (D4).
- **Dois botões "Aplicar" no mesmo painel** (FS e rede/busca) é consequência direta de D2 — o preço de manter `selectPermissionRoots` como está. É também o que **cria** a concorrência entre dois gestos de política, fechada pelo mutex de D16: dois applies independentes exigem uma exclusão explícita, que um apply único não precisaria. Unificar os dois gestos segue candidato futuro, com custo de reabrir uma função já testada e madura.
- **Assimetria de tratamento do rascunho entre FS e rede** (D17): o bloco de FS recarrega as listas do status em qualquer rejeição (SPEC-0038), o de rede preserva o rascunho e exibe o "em vigor" numa linha própria. Convivem no mesmo painel, o que é uma inconsistência visível. Alinhar o bloco de FS ao novo tratamento é candidato futuro **fora desta fatia** — mudaria o comportamento de um caminho maduro sem necessidade, e o custo do descarte é maior no eixo de rede (lista digitada à mão × caminhos colados um a um).
- **Candidatos futuros nomeados por esta fatia**: persistência da política de rede entre reinícios (exige ADR); apply único unificando FS + rede/busca (tornaria o mutex de D16 desnecessário); alinhar o bloco de FS à preservação de rascunho de D17; "Testar conexão" com o provedor de busca (exigiria IO de rede a partir do app — hoje explicitamente proibido); indicador de rede no painel `Sistema`; pré-preenchimento assistido do host da busca (só faria sentido junto de uma decisão sobre parsing de URL no app).
- **Residual ampliado — "diálogo fantasma" sem `BrowserWindow` pai (achado A2 do gate):** os quatro diálogos nativos de consentimento do app (agora quatro, com `network-grant-dialog.ts`) seguem sem `BrowserWindow` pai. Com o mutex de política compartilhado (D16), um diálogo perdido atrás da janela passa a travar as **duas** aplicações de política (FS e rede), não mais só uma — a troca é a certa (Artigo 8: travar > empilhar consentimento), mas o custo do residual pré-existente cresce. Candidato futuro já nomeado: diálogos nativos modais com `BrowserWindow` pai.
- **Residual nomeado — texto do diálogo de rede desatualizável em silêncio (achado A3 do gate):** o texto de `network-grant-dialog.ts` (D18) enumera nominalmente `http_get`/`web_search` em vez de uma descrição genérica — decisão correta hoje (torna o alcance concreto ao usuário), mas quando uma terceira Tool de rede for criada esse texto fica desatualizado, e nenhum gate mecânico força sua atualização (diferente do gate de paridade renderer↔módulo, que vigia réplicas de código, não texto de diálogo).

---

# Decisões de design

Formato de veto (decisão · porquê · alternativa descartada). Alvo do ataque do `architecture-reviewer` no gate `Draft → Ready`.

**D1 — As duas superfícies novas vivem dentro do `#panel-permissions` existente; o drawer continua com sete itens.**
*Porquê*: rede é, no ADR-0026(b), "uma política irmã de `readRoots`/`writeRoots`" — o painel que já hospeda política de acesso é o lugar natural; e a SPEC-0054 declarou o painel `Sistema` como "sétimo e último item do drawer", num layout aprovado em smoke humano (SPEC-0053) depois de ~20 fatias visuais reprovadas. Acrescentar seções sob disclosure custa menos e arrisca menos que um oitavo item.
*Alternativa descartada*: painel novo "Rede" no drawer — perde por mexer numa navegação recém-aprovada em smoke humano e por separar duas políticas que o usuário decide no mesmo momento.

**D2 — Gesto de aplicação próprio (`selectNetworkAccess` + `#network-apply`); `selectPermissionRoots` preserva sua semântica, ganhando apenas a guarda do mutex de D16.**
*Porquê*: a função de FS carrega a correção A7 do gate da SPEC-0038 e uma bateria de testes madura; ampliá-la para carregar rede + endpoint de busca misturaria eixos ("Roots" deixaria de descrever o argumento) e arriscaria regressão no caminho de escrita, o mais sensível do app. Dois gestos independentes são mais simples de descrever, testar e recusar isoladamente (Artigo 13). A única linha nova nela é a guarda de D16 — que existe **por causa** desta decisão (dois gestos concorrentes de política) e não altera nenhum desfecho já coberto por teste.
*Alternativa descartada*: estender `selectPermissionRoots` com `netRoots`/`searchUrl` num apply único — perde por acoplar eixos independentes e por exigir reescrever testes existentes sem ganho de garantia; registrada como candidato futuro nas Observações.

**D3 — Todo host novo exige consentimento explícito, em diálogo dedicado (`network-grant-dialog.ts`, quarta porta fail-closed).**
*Porquê*: autorizar rede é aumento de privilégio com classe de risco própria (saída de dados, SSRF, injeção indireta) — exatamente o caso do Artigo 8 e da regra do Module Catalog de que o Permission Service "não presume consentimento". O texto precisa descrever **o que** se concede; `apps/desktop/CLAUDE.md` já pina a regra "não reuse uma porta pela outra".
*Alternativa descartada*: reusar o `GrantConfirmPort` de escrita (texto falaria em "subárvore" e "escrita" — mentiria) ou aplicar rede sem diálogo por ser "só leitura" (perde: `access: 'read'` descreve o efeito no host remoto, não o risco para o usuário, que é a saída de dados).

**D4 — Definir/alterar/limpar `tools.searchUrl` não abre diálogo.**
*Porquê*: configurar endpoint **não** concede rede (SPEC-0057/**D9**) — nenhuma requisição sai enquanto o host do provedor não estiver em `netRoots`, e esse gesto **tem** diálogo. Pedir consentimento por algo inerte treinaria o usuário a clicar "OK" sem ler, enfraquecendo o consentimento que importa.
*Alternativa descartada*: exigir diálogo também para `searchUrl` — perde por diluir o gesto de consentimento e por sugerir, falsamente, que configurar endpoint já libera tráfego.

**D5 — Validação por dry-run em `loadConfig`, com o candidato composto pela MESMA função que a aplicação real usa (`composeOverride`), e com `personaService`/`configOverride` injetáveis.**
*Porquê*: o ADR-0006 põe a validação exclusivamente no core, e as regras exatas de hostname (`netRoots`) e de URL (`searchUrl`) já existem lá, com mensagens prontas. Aplicar uma configuração inválida sem checagem prévia deixaria a janela inutilizável (todo `createAtlas` seguinte lançaria `InvalidConfigError`), então a checagem é obrigatória — mas duplicá-la no app criaria a terceira instância de deriva por réplica registrada neste repositório. **Pelo mesmo motivo, a composição do candidato não pode ser montada à mão**: um literal `{ ...seleções, permissions: {...}, tools: {...} }` ao lado de `withSelections` seria uma segunda fonte da mesma regra de precedência (D9), a mesma classe de deriva que esta decisão usa para rejeitar validar no app — o dry-run passaria a validar um objeto que o `createAtlas` seguinte não receberia. E, sem `deps.personaService`/`deps.configOverride` (as mesmas deps das funções irmãs que chamam `loadConfig`), o dry-run leria o `personas.json` real do usuário e validaria contra um catálogo de Personas diferente do que o chamador injeta — testes passariam contra o disco da máquina, não contra o objeto sob teste.
*Alternativa descartada*: reimplementar as regras no app, como a SPEC-0038 fez para `path.isAbsolute` — perde porque lá a regra era uma função da stdlib de uma linha, e aqui são duas listas de caracteres proibidos mais parsing de URL, que mudariam sem aviso quando o core mudar. Também descartada: não validar e deixar estourar depois — perde por transformar um erro de digitação em app quebrada até reiniciar. E descartada: compor o candidato num literal local "porque é só para validar" — perde porque "só para validar" é exatamente o caso em que a divergência silenciosa é indetectável.

**D6 — Normalização de hosts: `trim`, descarte de vazios, dedup case-insensitive preservando a primeira grafia; `searchUrl` só `trim`, com `''` significando "busca desativada". A comparação "host novo" contra a seleção corrente é case-insensitive pela mesma regra.**
*Porquê*: `evaluate` compara host case-insensitive (ADR-0026(b)), então `Exemplo.com` e `exemplo.com` são a mesma política — mantê-los como duas entradas produziria dois diálogos de consentimento para a mesma concessão. **A mesma razão vale entre chamadas**, não só dentro de uma lista: com `exemplo.com` já autorizado, pedir `EXEMPLO.COM` não amplia alcance nenhum, e abrir diálogo por diferença de caixa pediria consentimento por uma concessão que já existe — ruído que treina o usuário a confirmar sem ler (o mesmo argumento de D4). Preservar a grafia digitada mantém a lista legível para auditoria visual, então a comparação em minúsculas é usada **só** para decidir novidade, nunca para reescrever o que se registra ou se envia ao diálogo. `''` já é o valor que o core interpreta como "não configurado" (SPEC-0057/D16), então limpar o campo é a forma honesta de desativar.
*Alternativa descartada*: comparação case-sensitive contra a seleção corrente (dedup case-insensitive só dentro da lista de entrada) — perde por pedir consentimento para uma política já concedida, divergindo do `evaluate` que de fato julga; e normalizar tudo para minúsculas ao registrar — perde por reescrever a entrada do usuário sem necessidade.

**D7 — Mesma mecânica de sessão da SPEC-0038: recusa com operação em voo, rechecagem imediatamente antes de aplicar, tudo-ou-nada, encerramento das sessões vivas, seleção não durável.**
*Porquê*: é o desenho que o gate da SPEC-0038 já endureceu (a correção A7 nasceu ali) e que as SPECs 0055/0057 pressupunham ao adiar esta fatia. Aqui há um motivo **adicional** para encerrar sessões: o Tool Registry de um Core vivo foi montado com a `searchUrl` antiga (registro condicional, SPEC-0057/D11), então uma sessão sobrevivente mentiria sobre a existência da busca.
*Alternativa descartada*: aplicar só a partir do próximo Core, sem encerrar sessões — perde por deixar uma conversa viva operando sob política e catálogo de Tools superados, exatamente o que a SPEC-0038 fechou.

**D8 — `StatusSnapshot` (tipo local do app) ganha `netRoots` e `searchUrl`.**
*Porquê*: o painel precisa refletir o **configurado em vigor**, não o rascunho — o mesmo mecanismo que a SPEC-0038 usa para FS; e `atlas status` já exibe `netRoots` na CLI desde a SPEC-0055, então a janela estava atrás do terminal. O tipo é local (regra de tipos locais do app), logo `@atlas/contracts` fica intocado.
*Alternativa descartada*: canal IPC novo só para ler a configuração de rede — perde por duplicar um round-trip que já existe e já traz a config inteira.

**D9 — A composição vive num único helper (`composeOverride`), consumido por `withSelections` e pelo dry-run: `permissions` a partir de duas seleções independentes (FS ⊕ rede), `tools` injetado separadamente; o override explícito do chamador continua vencendo como bloco completo.**
*Porquê*: as duas seleções vivem em estados de módulo distintos por D2, mas o `AtlasConfigOverride` tem um único `permissions`; compor num único helper mantém **uma** origem para a regra de precedência (nenhum outro ponto do arquivo monta esse objeto) e preserva literalmente a semântica de "bloco completo" da SPEC-0038/D3, já coberta por teste. É o que torna verdadeira, e não apenas afirmada, a promessa de D5 de que o objeto validado no dry-run é o mesmo que o `createAtlas` seguinte recebe.
*Alternativa descartada*: manter um único objeto de seleção compartilhado entre os dois gestos — perde por reintroduzir o acoplamento que D2 evita (um apply de rede passaria a poder sobrescrever raízes de FS).

**D10 — O painel avisa em texto fixo que o host do provedor de busca precisa estar autorizado, e o app não faz nenhum parsing de URL.**
*Porquê*: autorizar automaticamente o host derivado de `searchUrl` está explicitamente rejeitado pela SPEC-0057/**D9** ("configurar um endpoint não é conceder acesso à rede"); e derivar o host só para comparar exigiria `new URL` no app — uma segunda leitura da mesma URL que o core já valida, com risco de divergir dele. Um aviso determinístico, sem parsing, é verificável por asserção de string e nunca fica errado.
*Alternativa descartada*: comparar o host da `searchUrl` com `netRoots` e avisar só quando faltar — mais útil, mas perde por introduzir parsing de URL e política derivada no Gateway; registrada como candidato futuro.

**D11 — Perfil `completo`.**
*Porquê*: a fatia vive em `apps/desktop` (não em `packages/X/src` + CLI), cria arquivo/porta/canal IPC novos e toca o renderer — falha o primeiro critério de `micro`, e na dúvida o caminho seguro é `completo`.
*Alternativa descartada*: `micro`, alegando que é aditiva e deriva de ADRs existentes — perde no critério de contenção a um package, que é eliminatório.

**D12 — Prioridade `Medium`.**
*Porquê*: mesma classe e mesmo tamanho da SPEC-0038 (`Medium`), que fez o gesto equivalente para o eixo de FS; nenhum gate de Roadmap depende desta fatia (o item 1.4 não fecha aqui) e não há regressão nem risco de segurança em aberto — a ausência atual é fail-closed. É valor de capacidade para o usuário, não correção urgente.
*Alternativa descartada*: `High`, por ser pedido direto do usuário e residual nomeado em dois ADRs/SPECs — perde por inflacionar a escala: se toda fatia pedida na sessão corrente for `High`, o campo deixa de discriminar.

**D13 — A SPEC prevê uma nota `# Atualização (SPEC-0059)` no ADR-0026; nenhum ADR novo.**
*Porquê*: o ADR-0026 lista "painel de rede/busca na GUI" entre os residuais em aberto (Atualizações das SPECs 0055 e 0057); fechá-lo sem registrar deixaria o ADR mentindo (Artigo 1). Não há decisão arquitetural nova a tomar — política, contrato e portão saem intocados, e o consentimento reusa um molde já existente no app —, então nada aqui aciona a escalação do caso 3 da Emenda v1.1.
*Alternativa descartada*: abrir um ADR de "consentimento de rede na GUI" — perde por não haver decisão estrutural nova; o desenho de consentimento já é jurisprudência do app desde a SPEC-0038.

**D14 — A seleção não é durável (morre ao fechar a app).**
*Porquê*: persistir exigiria estado persistente novo (Artigo 11) ou o slot `arquivo` do ADR-0006, ambos escalação obrigatória; e para um privilégio de rede o default de "esquecer ao fechar" é o lado seguro. Paridade exata com a SPEC-0038/D2, o que mantém o modelo mental do usuário uniforme entre os dois eixos do mesmo painel.
*Alternativa descartada*: persistir os hosts autorizados em arquivo — perde por exigir ADR e por tornar durável, sem revisão, exatamente o privilégio de maior alcance que o app pode conceder.

**D15 — Nenhuma réplica nova no renderer; o gate de paridade segue vigiando seis módulos-fonte, sem edição.**
*Porquê*: `network-grant-dialog.ts` é main-process-only, como as outras três portas de diálogo, e a lógica do painel novo é exclusiva do renderer (formatação de lista e rascunho), sem gêmeo em TS — o mesmo enquadramento que a SPEC-0054 aplicou a `system-metrics.ts`/`token-usage.ts`. Não replicar é o que mantém o gate honesto.
*Alternativa descartada*: extrair a montagem do rascunho para um módulo TS e replicá-la — perde por criar a 11ª réplica (e o 2º limite conhecido do gate) sem necessidade.

**D16 — Uma aplicação de política por vez: mutex compartilhado entre `selectNetworkAccess` e `selectPermissionRoots`, no bridge (autoridade) e no renderer (caminho normal).**
*Porquê*: D2 cria dois gestos de política independentes, e `hasInFlightOperation()` **não** os enxerga (o registro único da SPEC-0051 conta só `'ask'`/`'chat-turn'`/`'open-session'`). Sem exclusão, um diálogo nativo de concessão de escrita aberto não impede o usuário de disparar a aplicação de rede — dois diálogos empilhados, cada um descrevendo uma concessão diferente, é exatamente a condição em que um "OK" pode ser dado para a concessão errada (Artigo 8: autorização explícita **para aquilo** que se concede). O mesmo vale para a reentrância do próprio gesto (dois cliques em `#network-apply`). Uma flag de módulo tomada no início e liberada num `finally` é a menor construção que fecha as três combinações, e ela **não** altera nenhum desfecho já coberto: só dispara quando existe uma segunda aplicação concorrente, situação que nenhum teste atual cria. As duas camadas repetem o padrão já estabelecido para operação em voo (renderer desabilita, bridge recusa) — o renderer é conveniência, o bridge é a garantia, porque o canal IPC é alcançável sem passar pelos botões.
*Alternativa descartada*: aceitar como residual documentado ("o usuário que empilhar dois diálogos que assuma") — perde porque o residual seria de **consentimento cruzado**, a única garantia que o Artigo 8 exige do app, e o custo de fechá-lo é uma flag. Também descartada: guardar só dentro de `selectNetworkAccess`, para não tocar em `selectPermissionRoots` — perde por fechar apenas metade das combinações (rede×rede), deixando aberta justamente a cruzada (escrita×rede), que é a de risco real. E descartada: resolver só no renderer desabilitando os botões — perde por deixar a garantia na camada não confiável.

**D17 — Rejeição preserva o rascunho de rede; a configuração em vigor aparece em linha própria (`#network-inforce`).**
*Porquê*: com validação só no apply (D5), um único host mal digitado rejeita a aplicação inteira — e recarregar a lista do status, como o bloco de FS faz, apagaria toda a lista digitada à mão por causa de um caractere. O molde da SPEC-0038 fazia sentido lá porque cada raiz é um caminho colado individualmente e a lista costuma ter uma ou duas entradas; aqui a entrada típica é uma lista de hosts digitados um a um na mesma sessão. O motivo original de recarregar (não deixar o usuário olhando para um rascunho divergente do real) é preservado sem descartar nada: a divergência deixa de ser invisível porque o "em vigor" passa a ser mostrado explicitamente, ao lado, sempre lido do status. Vale para **qualquer** rejeição, não só a de validação — porque distinguir a causa exigiria classificar erro através do IPC (o Electron reembrulha a `Error` e descarta propriedades customizadas), o que só se sustentaria por *sniffing* de mensagem.
*Alternativa descartada*: paridade estrita com a SPEC-0038 (recarregar lista e campo em qualquer rejeição) — perde por punir um erro de digitação com a perda do trabalho inteiro, num eixo onde o custo de redigitar é maior. Descartada também: preservar o rascunho **só** em rejeição de validação — perde por exigir classificar a causa da rejeição no renderer, hoje só possível por comparação de substring de mensagem, regra frágil e sem contrato. E descartada: mudar o bloco de FS junto, para ficarem simétricos — perde por alterar um caminho maduro fora do escopo desta fatia (registrado nas Observações como candidato futuro, com a assimetria assumida).

**D18 — O texto do diálogo declara que a concessão vale para qualquer Tool de rede daquele host — hoje `http_get` e `web_search`, inclusive a consulta de busca.**
*Porquê*: a política do ADR-0026(b) é **por host, nunca por Tool**; um texto que falasse só da Tool que motivou o gesto (tipicamente a busca, já que o painel configura endpoint ao lado) descreveria uma concessão mais estreita do que a que de fato se concede — consentimento obtido sobre premissa falsa, que é o que o Artigo 8 e a regra do Module Catalog ("não presumir consentimento") proíbem. Nomear as duas Tools existentes torna o alcance concreto para o usuário; dizer "qualquer ferramenta de rede" mantém o texto verdadeiro quando a terceira Tool de rede aparecer, sem exigir edição. Mencionar que a **consulta** também sai é o que torna o item (d) (dados podem sair da máquina) verificável na prática, e não uma frase genérica.
*Alternativa descartada*: enumerar exaustivamente as Tools e exigir edição do texto a cada Tool de rede nova — perde por criar um texto que envelhece em silêncio (a Tool nova ficaria coberta pela política e ausente do diálogo). Descartada também: consentimento por Tool, não por host — perde por reabrir o ADR-0026(b), o que esta SPEC está proibida de fazer, e por multiplicar gestos sem aumentar garantia (a política julgada continua sendo a do host).

---

# Checklist para IA

Antes de implementar:

- ler ADR-0026, ADR-0013, ADR-0006, SPEC-0038, SPEC-0055 (D17), SPEC-0057 (**D9**/D10/D11/D15) e `apps/desktop/CLAUDE.md`;
- confirmar que a **única** mudança admitida em `selectPermissionRoots` é a guarda do mutex (D16);
- confirmar que nenhuma regra de hostname/URL será escrita em `apps/desktop/src`.

Durante a implementação:

- manter responsabilidade única (Gateways do app; política e validação seguem no core);
- fail-closed em todo caminho de recusa; nunca aplicação parcial;
- todo `AtlasConfigOverride` (inclusive o do dry-run) sai de `composeOverride` — nenhum literal montado à mão (D5/D9);
- o mutex de política é liberado em `finally`, em todos os caminhos de saída das duas funções (D16);
- respeitar `exactOptionalPropertyTypes` ao montar o `AtlasConfigOverride`;
- não tocar em nenhum arquivo listado como "diff vazio".

Após a implementação:

- rodar os quatro comandos na raiz;
- validar as verificações de fronteira por `grep`;
- executar e registrar o smoke manual;
- registrar lições aprendidas.

---

# Resultado Esperado

Depois desta SPEC, a janela do Atlas deixa de ser uma interface offline para Tools: pelo painel de Permissões, o usuário vê quais hosts o Atlas pode alcançar e qual provedor de busca está configurado, autoriza um host novo confirmando um diálogo nativo que descreve exatamente o que está sendo concedido (hostname exato, sem subdomínios, enquanto a janela estiver aberta, valendo para qualquer Tool de rede que alcance aquele host — hoje `http_get` e `web_search` —, com o aviso honesto de que dados, inclusive a consulta de busca, podem sair da máquina), define ou limpa o endpoint de busca, e aplica tudo de uma vez — sem `--allow-net`, sem `--search-url`, sem reiniciar a app.

`http_get` e `web_search` passam a funcionar na conversa da janela exatamente sob as garantias que já valem na CLI: fail-closed por default, igualdade exata de hostname, `web_search` existindo apenas quando há endpoint configurado. Nenhum contrato público muda, nenhuma cláusula do ADR-0026 é reaberta, nenhum package é tocado — e o residual "painel de rede/busca na GUI", aberto conscientemente pelas SPECs 0055 e 0057, fica fechado e registrado no ADR.
