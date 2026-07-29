# SPEC-0038 — Desktop: configuração de permissões (`readRoots`/`writeRoots`) pela janela

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0038

---

**Título**

Desktop: configuração de permissões de sistema de arquivos (`readRoots`/`writeRoots`) pela interface gráfica — ver as raízes configuradas e alterá-las em runtime, sem flag/env, com concessão de escrita sob consentimento explícito de política

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

`Fase 2 — 2.4 Persistência e Gerência Local` (`docs/04-engineering/Roadmap.md`, l. 159-163): "Configuração de permissões (`readRoots`/`writeRoots`) por interface gráfica, não só flags." Esta SPEC entrega a **terceira e última** linha do item 2.4 — a primeira (gerência visual de memória) foi a [SPEC-0034](SPEC-0034-desktop-visual-memory-management.md) e a segunda (seleção/troca de Persona em runtime) a [SPEC-0037](SPEC-0037-desktop-runtime-persona-switch.md) —, **fechando o item 2.4 por inteiro**.

---

# Objetivo

Dar à janela do `apps/desktop` (`@atlas/desktop`) a capacidade de **ver e configurar, em runtime, as raízes de permissão de sistema de arquivos**: quais diretórios o Atlas pode **ler** (`readRoots`) e quais pode **escrever/apagar** (`writeRoots`).

Ao final: a partir da janela real, o usuário vê as raízes configuradas em vigor, acrescenta ou remove raízes de leitura e de escrita e aplica a mudança — sem fechar a app, sem variável de ambiente e sem flag de linha de comando. Conceder uma raiz de **escrita** nova exige consentimento explícito num diálogo nativo que descreve o que está sendo concedido (uma **política** sobre a subárvore, válida enquanto a app estiver aberta), não uma ação pontual. Toda operação seguinte com o Core (`ask`, chat, memória, `status`) passa a operar sob a política nova; aplicar enquanto houver uma operação em voo (turno de chat ou `ask`) é **recusado**, e as sessões de chat vivas são encerradas na aplicação, de modo que nenhum Core sobrevive à aplicação sob política superada. A configuração vale para a **sessão da app** (não sobrevive ao fechamento, que volta às raízes resolvidas por `flags > env > defaults`) e **nenhum estado persistente novo é criado**.

---

# Motivação

O PRD exige, em Execução (l. 107), que "o sistema deve executar tarefas **autorizadas pelo usuário**"; nas Restrições (l. 193), que "o Atlas **não deverá executar ações destrutivas sem autorização adequada**"; e nos Requisitos Não Funcionais (l. 173), que "o sistema deverá **priorizar segurança**", com transparência como critério de qualidade (l. 205). O Artigo 8 da Constituição é ainda mais direto: nenhuma ação potencialmente destrutiva sem autorização explícita **ou política previamente configurada**. Hoje, no `apps/desktop`, **essa política não é configurável de forma alguma**: o app nunca passa `permissions` em `configOverride` e, ao contrário da CLI, não tem Input Gateway de flags/env — a janela roda sempre com os defaults de `loadConfig` (`readRoots: [process.cwd()]`, `writeRoots: []`). Na prática:

- o usuário **não consegue conceder** ao Atlas gráfico nenhuma raiz de escrita (todas as Tools `write_file`/`append_file`/`mkdir`/`delete_file` são bloqueadas pelo portão, sempre);
- o usuário **não consegue mudar** a raiz de leitura (fica presa ao diretório de trabalho de onde a app foi lançada — um valor que, numa app gráfica, ele nem controla nem enxerga);
- o painel de status já **exibe** `readRoots`/`writeRoots` (`StatusSnapshot`, SPEC-0031) sem permitir alterá-los — exatamente a mesma assimetria "vê mas não muda" que a SPEC-0037 fechou para a Persona.

O Roadmap 2.4 (l. 163) nomeia essa lacuna e a marca como a terceira linha do item. A capacidade já existe inteira na superfície pública: `AtlasConfigOverride.permissions.{readRoots,writeRoots}` é aceito por `createAtlas`, validado por `loadConfig` (única fonte de verdade da validação, ADR-0006), e o Permission Service resolve as raízes por `realpath` uma única vez na criação, com fail-closed por raiz irresolvível (ADR-0013 + atualização da SPEC-0015). O que **falta** é o gesto de interface e o lugar onde a escolha do usuário vive entre chamadas — exatamente o que a SPEC-0037 já resolveu para a Persona, com o mesmo molde de estado de módulo do `core-bridge` no main process.

Não há decisão arquitetural nova: nenhuma mudança de contrato, nenhuma mudança em `packages/*` (nem o re-export que a SPEC-0037 precisou — aqui a leitura do estado em vigor já vem do `StatusSnapshot` existente), nenhuma política nova de segurança inventada pelo app. O app apenas **oferece ao usuário** o mesmo dado de configuração que a CLI já oferece por `--allow-read`/`--allow-write`, sob as garantias que o ADR-0013 já estabelece.

---

# Referências

- `docs/04-engineering/Roadmap.md` — Fase 2, item 2.4 (l. 159-163), terceira linha; esta SPEC fecha o item (ver Definition of Done: o fecho documental precisa riscar **as duas** linhas ainda abertas, l. 162 e l. 163)
- `docs/02-product/ProductRequirementsDocument.md` — Execução (l. 107, "tarefas autorizadas pelo usuário"), Restrições (l. 193, "nenhuma ação destrutiva sem autorização adequada"), Requisitos Não Funcionais (l. 173, segurança), Critérios de Qualidade (l. 205, transparência)
- `docs/00-project/ArchitectureConstitution.md` — **Artigo 8** (segurança tem prioridade sobre autonomia: autorização explícita **ou** política previamente configurada; na dúvida, confirmar), **Artigo 11** (a memória tem autoridade exclusiva sobre estado persistente), Artigo 1 (documentação é a fonte da verdade), Artigo 3 (Core é o único orquestrador), Artigo 7 (transparência), Artigo 13 (simplicidade/honestidade estrutural), Artigo 15 / Emenda v1.1 (escalação obrigatória: ADR novo, módulo novo, emenda)
- `docs/06-adr/ADR-0013-permission-service-execution-gate.md` — portão puro/síncrono aplicado pelo Runtime; Tools descrevem, o serviço julga, o Runtime aplica; `writeRoots` separada com default `[]` (**escrita é opt-in explícito**, SPEC-0012); `confirm` para `delete` (SPEC-0013); contenção lexical sobre **`realpath`**, raízes resolvidas **uma vez na criação do serviço**, fail-closed por raiz irresolvível (SPEC-0015)
- `docs/06-adr/ADR-0014-toctou-atomic-enforcement.md` — fecho atômico no instante do uso (`verify`/`isContained`), fiado por `createAtlas`
- `docs/06-adr/ADR-0006-config-source-precedence.md` — precedência `flags > env > arquivo > defaults`; **a validação permanece exclusivamente no core** (`loadConfig`); o slot `arquivo` segue **não implementado** (fato central da Decisão D2)
- `docs/06-adr/ADR-0003-core-composition-root.md` — `packages/core` é o composition root; `apps/*` importam implementação só de `@atlas/core` (+ tipos de `@atlas/contracts`) — ver Decisão D4 e o precedente da D4 da SPEC-0037
- `docs/06-adr/ADR-0019-desktop-electron-stack.md` — Electron; Core só no main process; renderer isolado; sem bundler/`dist`
- `docs/06-adr/ADR-0009-context-service-value-store.md` — sessão de conversa viva, mediada pela aplicação
- `docs/03-architecture/ModuleCatalog.md` — Permission Service (`packages/permissions`, l. 793-832): "avaliar se uma ação pode ser executada de acordo com permissões, **políticas configuradas** e nível de risco"; **não é responsável por** "modificar políticas silenciosamente" nem "presumir consentimento para ações destrutivas"
- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação; `StatusSnapshot` já expõe `readRoots`/`writeRoots`
- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) (Done) — `createDialogConfirmPort` (diálogo nativo de **ação pontual**, fail-closed) — **molde** do adapter de concessão desta SPEC, não reusado como canal de concessão (ver D11); e `resolveAskSnapshot`, cujo rastreio de operação em voo esta SPEC introduz (D10)
- [SPEC-0033](SPEC-0033-desktop-visual-chat.md) (Done) — chat vivo; `Map<SessionId, { atlas }>`; serialização de turno no renderer
- [SPEC-0034](SPEC-0034-desktop-visual-memory-management.md) (Done) — primeira linha do item 2.4; molde do painel
- [SPEC-0037](SPEC-0037-desktop-runtime-persona-switch.md) (Done) — segunda linha do item 2.4; **molde direto** desta fatia: estado de módulo do `core-bridge`, `busySessions`/recusa com turno em voo, encerramento das sessões vivas, precedência do override explícito do chamador
- [SPEC-0018](SPEC-0018-multiple-permission-roots-cli.md) (Done) — múltiplas raízes e a semântica de substituição (nunca merge) de `--allow-read`/`--allow-write` na CLI, espelhada aqui
- [SPEC-0015](SPEC-0015-permission-symlink-hardening.md) (Done) — resolução `realpath` das raízes na criação do serviço, fail-closed por raiz irresolvível (fato central de D4/A3)

---

# Escopo

- estender `apps/desktop/src/core-bridge.ts` (testável, **sem** Electron) com a superfície de permissões:
  - `PermissionRoots { readRoots: readonly string[]; writeRoots: readonly string[] }` e `PermissionRootsSelection { readRoots; writeRoots; closedSessions: readonly SessionId[] }` — tipos planos, serializáveis por IPC, **locais** ao app;
  - `selectPermissionRoots(request: PermissionRoots, deps?: { confirmGrant?: GrantConfirmPort }): Promise<PermissionRootsSelection>` — nesta ordem, **fail-closed** (qualquer recusa deixa tudo exatamente como estava: nenhuma seleção registrada, nenhuma sessão encerrada, nenhuma aplicação parcial):
    1. **normalização**: `trim` de cada entrada, descarte de entradas vazias, deduplicação preservando a ordem de chegada (mesmo tratamento que `filterNonEmpty` dá às flags na CLI);
    2. **validação estrutural**: `readRoots` normalizada não pode ficar vazia (o `loadConfig` exige lista não vazia) e **todo** caminho, de leitura ou de escrita, precisa ser **absoluto** (`path.isAbsolute`) — caminho relativo é recusado, nunca resolvido contra o `cwd` do processo (D5). Recusa ⇒ `Error` estruturado citando o caminho ofensor;
    3. **operação em voo** ⇒ recusa: qualquer turno de chat **ou** qualquer `resolveAskSnapshot` pendente (rastreio generalizado — **D10**). Recusa ⇒ `Error` estruturado citando a operação em andamento;
    4. **consentimento de concessão de escrita** (D6/D11): para cada raiz de escrita **nova** (não presente na seleção corrente; sem seleção corrente, **todas** as raízes de escrita pedidas contam como novas), chamar `confirmGrant.request({ path, scope: 'subtree', duration: 'session' })` — porta **dedicada à concessão de política**, distinta do `ConfirmPort` de ação pontual do Runtime. Qualquer recusa (ou ausência de `confirmGrant` injetado — default fail-closed) aborta a operação inteira sem aplicar nada. Remover raízes e alterar `readRoots` **não** abrem diálogo;
    5. registra a seleção no estado de módulo do bridge e **encerra todas as sessões de chat vivas** (nenhum Core sobrevive à aplicação sob política superada — D7/D10), devolvendo-as em `closedSessions`;
  - `selectedPermissionRoots(): PermissionRoots | undefined` — leitura do estado de módulo (`undefined` enquanto o usuário não configurou nada), exportada para teste e para o `main.ts`;
  - **rastreio generalizado de operação em voo (D10)**: `resolveAskSnapshot` passa a registrar/remover um token de operação em voo em `try`/`finally`, marcando **antes do primeiro `await`**, ao lado do `busySessions` que `sendChatTurn` já alimenta (SPEC-0037). Nenhuma mudança no resultado nem no fluxo do `ask` em si;
  - generalizar o helper `withPersonaSelection` para aplicar **também** a seleção de permissões ao `AtlasConfigOverride` das cinco funções que sobem o Core (`resolveStatusSnapshot`, `resolveAskSnapshot`, `openChatSession`, `resolveMemorySnapshot`, `forgetFact`), com a mesma precedência da SPEC-0037/D7: `configOverride.permissions` explícito do chamador **vence** a seleção corrente e é tratado como **bloco completo** — a seleção nunca é mesclada campo a campo dentro dele (D3);
  - estender `__resetPersonaStateForTests` (ou renomeá-lo para um reset abrangente do estado de módulo do bridge) para também limpar a seleção de permissões e o rastreio de operações em voo — isolamento entre casos de teste;
- criar `apps/desktop/src/permission-grant-dialog.ts` (**D11**), no molde de `src/confirm-port.ts` e **sem importar `electron`**: `GrantRequest { path: string; scope: 'subtree'; duration: 'session' }`, `GrantConfirmPort { request(grant: GrantRequest): Promise<boolean> }` e `createGrantConfirmDialog({ showMessageBox }): GrantConfirmPort`, cujo texto declara explicitamente (a) que é uma **concessão de permissão de escrita**, não uma escrita agora; (b) que vale para o **diretório e toda a sua subárvore**; (c) que vale **enquanto esta janela estiver aberta** e é esquecida ao fechar a app. Reusa os tipos `DialogOptions`/`ShowMessageBox`/`ShowMessageBoxResult` já exportados por `confirm-port.ts` (import de tipo; aquele arquivo fica **inalterado**) e o mesmo fail-closed: só o botão de confirmação resolve `true`; qualquer outro retorno ou exceção resolve `false`, nunca lança;
- estender `apps/desktop/src/main.ts` (casca Electron): construir `confirmGrant = createGrantConfirmDialog({ showMessageBox: (o) => dialog.showMessageBox(o) })` ao lado do `confirm` já existente, e registrar `ipcMain.handle('atlas:permissions:select', (_e, roots) => selectPermissionRoots(roots, { confirmGrant }))`, removendo de `openChatSessionIds` as sessões devolvidas em `closedSessions` (mesmo tratamento que o handler de `atlas:persona:select` já faz). Nenhuma lógica de domínio no `main.ts`; o `ConfirmPort` de ação pontual (`createDialogConfirmPort`) segue servindo **só** a `ask`/chat;
- estender `apps/desktop/src/preload.cjs`: expor `window.atlas.permissions.select(roots)` ao lado de `getStatus`/`ask`/`chat`/`memory`/`persona`;
- estender `apps/desktop/src/renderer/index.html` + `renderer.js` com um painel de permissões mínimo:
  - duas listas (leitura e escrita) preenchidas a partir do `getStatus()` já consumido no load (`StatusSnapshot.readRoots`/`writeRoots` — as raízes **configuradas** em vigor, não as digitadas; ver a delimitação em D4/Observações);
  - campo de texto + botão "Adicionar" por lista, botão "Remover" por raiz listada, e um botão "Aplicar" que envia as **duas listas completas** por `window.atlas.permissions.select({ readRoots, writeRoots })`;
  - o painel entra na **mesma serialização** já usada para a entrada de chat e o seletor de Persona (SPEC-0033/0037), estendida: campos e botões ficam desabilitados enquanto houver turno de chat **ou** um `ask` em voo (o renderer já sabe quando disparou cada um);
  - ao aplicar com sucesso: limpa o transcript, escreve o aviso explícito ("Permissões alteradas — nova conversa iniciada"), reabre a sessão de chat (`window.atlas.chat.open()`) e recarrega o painel de status (as listas voltam a refletir as raízes **configuradas** que o Core está aplicando, não as digitadas);
  - ao rejeitar (caminho inválido, operação em voo, concessão não confirmada): mostra o aviso de erro, **não** limpa o transcript, **não** fecha a conversa corrente e recarrega as listas a partir do status (o usuário nunca fica olhando para uma lista divergente da configuração real);
  - JavaScript plano, sem bundler nem framework;
- testes: estender `apps/desktop/tests/core-bridge.test.ts` com os casos de `selectPermissionRoots`, e criar `apps/desktop/tests/permission-grant-dialog.test.ts` para o adapter novo (texto e fail-closed) — ver Estratégia de Testes;
- atualizar `apps/desktop/CLAUDE.md` (superfície de permissões, canal IPC novo, escopo de vida da seleção, a **distinção entre o `ConfirmPort` de ação pontual e o `GrantConfirmPort` de política**, o rastreio generalizado de operação em voo, e a fronteira do que fica de fora).

---

# Fora do Escopo

- **persistir a configuração de permissões entre reinícios da app** — exigiria estado persistente novo (Memory Service, Artigo 11) ou o slot `arquivo` da precedência de config do ADR-0006, **que não existe** (candidato do Roadmap 1.4). Qualquer dos dois é decisão estrutural própria, com ADR novo, isto é, **escalação obrigatória** (Emenda v1.1). Fatia futura explícita — ver Decisão D2 e "Observações → O que a persistência de política vai exigir";
- **implementar o slot `arquivo` do ADR-0006** (arquivo de configuração do Atlas) — item próprio, de escopo bem maior que permissões, e que muda a precedência de config de toda a plataforma (CLI inclusive);
- **política de permissão por-Tool, por-risco, por-identidade de usuário ou por-Task** — o ADR-0013 registra explicitamente que a política hoje é única e global; ampliar o modelo é decisão do Permission Service, não da interface;
- **alterar `@atlas/permissions`, `@atlas/contracts`, `@atlas/core` ou qualquer outro package** — o diff é confinado a `apps/desktop` (esta fatia nem precisa do re-export de catálogo que a SPEC-0037 introduziu: o estado configurado já chega pelo `StatusSnapshot`). Necessidade de mais que isso é motivo para **parar e registrar** (Constituição, Artigo 1);
- **alterar `src/confirm-port.ts`** (o `ConfirmPort` de ação pontual do Runtime): o adapter de concessão é um arquivo novo e separado (D11); parametrizar o adapter existente para servir aos dois propósitos está **fora de escopo** e foi descartado em D11;
- **exibir as raízes efetivamente resolvidas por `realpath`** (o que o `PermissionService` de fato aplica depois da resolução e do fail-closed por raiz irresolvível) — o `StatusSnapshot` expõe `config.permissions`, isto é, as raízes **configuradas**. A diferença (raiz inexistente, `EACCES`, symlink) erra sempre para o lado restritivo e está registrada nas Observações; expor a política resolvida exigiria superfície nova em `packages/*` (contrato ou snapshot novo) e fica como candidato futuro;
- **validar existência/tipo do caminho no app** (`realpath`, `stat`, "é um diretório?") — a resolução canônica e o fail-closed por raiz são autoridade do Permission Service (ADR-0013/SPEC-0015) e a validação de config é do `loadConfig` (ADR-0006). O app faz apenas validação **estrutural** (não vazia, absoluta, deduplicada) — ver Decisão D5;
- **seletor nativo de diretório** (`dialog.showOpenDialog`) para escolher a raiz — melhoria de UX desejável (resolveria a digitação de caminho e parte da fricção do consentimento), mas acrescenta uma segunda superfície de diálogo e não muda nenhuma garantia; candidato futuro, o painel desta fatia é diagnóstico/mínimo (mesmo critério das SPECs 0031-0037);
- **configurar qualquer outro campo de `AtlasConfig` pela GUI** (`dataDir`, `memory.path`, `model.provider`/`model`/`baseUrl`/`apiKey`, `logLevel`) — nenhum deles é nomeado pelo item 2.4; cada um tem consequências próprias (o de modelo, em particular, envolve credencial);
- **conceder permissão "só para este passo"/elevação temporária durante um turno**, ou qualquer negociação de permissão no meio da execução — o fluxo de consentimento em execução já existe e é o `confirm` do Runtime (ADR-0013/SPEC-0013), inalterado por esta SPEC;
- **cancelar uma operação em voo** — esta SPEC apenas **recusa** a aplicação enquanto houver turno de chat ou `ask` pendente (D7/D10); cancelamento é capacidade inexistente (Task Manager, Roadmap 1.1);
- **rastrear Cores criados fora do `core-bridge`** — o rastreio de operação em voo cobre as funções do bridge, que são hoje o **único** caminho pelo qual esta app sobe o Core (`main.ts` só as chama). Se uma fatia futura criar plataforma por outro caminho, precisará entrar no mesmo rastreio — registrado aqui para não virar garantia silenciosamente falsa;
- **preservar o histórico da conversa** ao aplicar permissões novas (migrar a `Conversation` viva para o Core novo) — mesma fronteira e mesmo candidato futuro registrado na D5 da SPEC-0037;
- **configuração de permissões pela CLI além do que já existe** (`--allow-read`/`--allow-write` cobrem o caso na inicialização) e qualquer superfície de permissões em runtime no `atlas chat`;
- promover `PermissionRoots`/`PermissionRootsSelection`/`GrantRequest`/`GrantConfirmPort` ou o canal IPC a `@atlas/contracts` — só com um 2º consumidor real, via ADR (mesma regra que manteve `StatusSnapshot`/`AskSnapshot`/`TurnSnapshot`/`FactSnapshot`/`PersonaOption` locais nas SPECs 0031-0037);
- estilização/UX elaborada (CSS, autocomplete de caminho, árvore de diretórios); bundler/framework de UI; empacotamento/distribuição (Fase 3); E2E/harness headless de Electron em CI.

---

# Pré-requisitos

- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação do `apps/desktop`: `core-bridge`, `main.ts`, `preload.cjs`, renderer, IPC; `StatusSnapshot.readRoots`/`writeRoots`.
- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) (Done) — `createDialogConfirmPort` (molde do adapter de diálogo fail-closed) e `resolveAskSnapshot` (que ganha rastreio de operação em voo aqui).
- [SPEC-0033](SPEC-0033-desktop-visual-chat.md) (Done) — ciclo de vida do chat vivo e a serialização de turno no renderer, ambos estendidos aqui.
- [SPEC-0037](SPEC-0037-desktop-runtime-persona-switch.md) (Done) — estado de módulo do bridge, `busySessions`/turno em voo, encerramento de sessões vivas, helper de aplicação de seleção ao `configOverride`, `__resetPersonaStateForTests`.
- [SPEC-0018](SPEC-0018-multiple-permission-roots-cli.md) (Done) — múltiplas raízes e semântica de substituição, espelhadas aqui.
- [SPEC-0015](SPEC-0015-permission-symlink-hardening.md) (Done) — resolução `realpath` das raízes na criação do Permission Service.

---

# Critérios de Aceitação

- `pnpm lint` passa sem erros, cobrindo os arquivos novos/alterados de `apps/desktop` (inclusive `renderer.js`/`preload.cjs` no contexto browser/CommonJS);
- `pnpm typecheck` passa, cobrindo `apps/desktop`;
- `pnpm test` executa e passa, incluindo os testes novos/estendidos de `apps/desktop/tests/`;
- teste comprova (**feliz, leitura**): após `selectPermissionRoots({ readRoots: [dirA], writeRoots: [] })` com `dirA` absoluto, um `resolveStatusSnapshot()` subsequente (sem `configOverride`) devolve `readRoots` contendo exatamente `dirA` e `writeRoots: []`; antes de qualquer chamada, devolve os defaults da config;
- teste comprova (**feliz, escrita com consentimento**): com um `confirmGrant` fake que aprova, `selectPermissionRoots({ readRoots: [dirA], writeRoots: [dirA] })` resolve, o `confirmGrant` foi chamado **exatamente uma vez** com `{ path: dirA, scope: 'subtree', duration: 'session' }`, e um `resolveStatusSnapshot()` subsequente reporta `writeRoots` contendo `dirA`;
- teste comprova (**texto do diálogo de concessão** — `permission-grant-dialog.test.ts`): com um `showMessageBox` fake, `createGrantConfirmDialog(...).request({ path: '/a', scope: 'subtree', duration: 'session' })` monta `DialogOptions` cujo texto (`title` + `message` + `detail`, concatenados) contém, **verificável por asserção**: (a) a palavra "conceder"/"concessão" e "permissão de escrita" (não "ação irreversível"); (b) o caminho `/a` e a menção explícita à **subárvore** ("e todo o seu conteúdo"/"subárvore"); (c) a menção explícita de que a concessão vale **enquanto a janela/app estiver aberta** e é esquecida ao fechar; e **não** contém a mensagem de ação pontual de `confirm-port.ts` ("Confirmar ação irreversível");
- teste comprova (**fail-closed do adapter de concessão**): botão de cancelar, `cancelId`, índice inesperado e `showMessageBox` que rejeita ⇒ todos resolvem `false`, sem lançar (paridade com `createDialogConfirmPort`);
- teste comprova (**escrita recusada — fail-closed**): com um `confirmGrant` fake que recusa, a chamada **rejeita** com `Error` estruturado, `selectedPermissionRoots()` fica **inalterado** (inclusive a parte de leitura pedida na mesma chamada — nada é aplicado parcialmente), nenhuma sessão de chat viva é encerrada, e um `resolveStatusSnapshot()` seguinte reporta a política anterior;
- teste comprova (**sem `confirmGrant` injetado**): pedir uma raiz de escrita nova sem `confirmGrant` rejeita (default fail-closed), pelo mesmo caminho da recusa;
- teste comprova (**escrita já concedida não reconfirma**): concedida `dirA` para escrita, uma segunda chamada que mantém `dirA` em `writeRoots` (ex.: acrescentando só uma raiz de leitura) **não** chama `confirmGrant`; e **remover** uma raiz de escrita também não chama `confirmGrant`;
- teste comprova (**validação estrutural**): caminho relativo (`'./algo'`) em `readRoots` ou em `writeRoots` rejeita citando o caminho, sem efeito colateral; `readRoots` que normaliza para vazia (`[]`, `['  ']`) rejeita, sem efeito colateral; entradas duplicadas e com espaços em volta são normalizadas (`[' /a ', '/a']` ⇒ `['/a']`);
- teste comprova (**precedência, bloco completo**): `configOverride.permissions` explícito passado pelo chamador vence a seleção corrente (ex.: com `dirA` selecionado, `resolveStatusSnapshot({ permissions: { readRoots: [dirB], writeRoots: [] } })` devolve `dirB`); e, com um `permissions` **parcial** do chamador (`{ writeRoots: [dirB] }` sem `readRoots`), a seleção corrente **não** é mesclada dentro dele — o `readRoots` resultante é o default de `loadConfig`, comportamento documentado de "bloco completo" (A4/D3);
- teste comprova (**chat vivo ocioso**): com uma sessão de chat aberta e ociosa, uma aplicação bem-sucedida devolve essa `SessionId` em `closedSessions` e um `sendChatTurn` posterior na mesma sessão rejeita com o erro estruturado de sessão desconhecida/encerrada; sem sessões abertas, `closedSessions` é `[]`; e uma sessão aberta **depois** da aplicação roda sob a política nova;
- teste comprova (**turno de chat em voo**): com um `sendChatTurn` pendente (gateway `fake` instrumentado para só resolver quando o teste liberar), `selectPermissionRoots(...)` **rejeita** com erro estruturado citando a operação em andamento, a seleção fica inalterada, nenhuma sessão é encerrada, nenhum `confirmGrant` é solicitado, e o turno em voo **conclui normalmente** (devolve seu `TurnSnapshot`, grava seus `learned`); depois de concluído, a mesma chamada passa a ser aceita;
- teste comprova (**`ask` em voo — D10**): com um `resolveAskSnapshot` pendente (mesmo instrumento de gateway `fake` com resolução controlada pelo teste), `selectPermissionRoots(...)` **rejeita** com erro estruturado, a seleção fica inalterada, **nenhum** `confirmGrant` é solicitado, e o `ask` em voo conclui **íntegro** (devolve seu `AskSnapshot`, grava seus `learned`); depois de concluído, a mesma chamada passa a ser aceita. Este é o caso que fecha a janela de revogação anunciada-mas-não-aplicada;
- teste comprova (**efeito de ponta a ponta no portão**): com `writeRoots` concedida por `selectPermissionRoots` para um diretório temporário, um `resolveAskSnapshot` que leve o Runtime a executar uma Tool de escrita nesse diretório **não** é negado por política, enquanto o mesmo cenário sem a concessão produz `ExecutedStep` negado (`denialKind: 'blocked'`) — a fatia altera de fato o veredicto do Permission Service, não só o texto do painel de status;
- teste comprova: `selectPermissionRoots` e `permission-grant-dialog.ts` não importam nem dependem de Electron (a suíte roda sob Vitest sem Electron, como nas SPECs 0031-0037);
- verificação de fronteira: nenhum arquivo de `apps/desktop/src` importa de `@atlas/permissions` ou de qualquer package que não seja `@atlas/core`/`@atlas/contracts` (conferível por `grep` em `apps/desktop/src`); `apps/desktop/package.json` **não** ganha dependência nova; `src/confirm-port.ts` fica com **diff vazio**;
- **diff vazio** em `packages/*` (inclusive `@atlas/contracts`, `@atlas/core`, `@atlas/permissions`) e em `apps/cli`;
- smoke manual (registrado nas Observações): em sessão gráfica real (`pnpm --filter @atlas/desktop start`), (a) o painel mostra as raízes configuradas em vigor; (b) adicionar uma raiz de leitura e aplicar atualiza o painel de status e permite ao chat ler um arquivo daquele diretório; (c) adicionar uma raiz de **escrita** abre o diálogo nativo, e o texto lido na tela deixa claro que se trata de **conceder permissão de escrita sobre aquele diretório e seu conteúdo, enquanto a janela estiver aberta** — cancelar não muda nada, confirmar aplica; (d) enquanto um turno de chat **ou** um `ask` está em voo, o painel aparece desabilitado e a aplicação é recusada; (e) fechar e reabrir a app volta às raízes da config (a configuração não é durável, por decisão desta SPEC);
- estrutura corresponde à seção "Arquivos Esperados".

---

# Arquivos Esperados

```text
apps/
└── desktop/
    ├── src/
    │   ├── core-bridge.ts                # + PermissionRoots/PermissionRootsSelection,
    │   │                                 #   selectPermissionRoots/selectedPermissionRoots,
    │   │                                 #   rastreio de operação em voo estendido ao ask (D10),
    │   │                                 #   generalização do helper de seleção → configOverride,
    │   │                                 #   reset de estado de módulo estendido
    │   ├── permission-grant-dialog.ts    # NOVO: GrantRequest/GrantConfirmPort +
    │   │                                 #   createGrantConfirmDialog (texto de CONCESSÃO,
    │   │                                 #   fail-closed, sem import de electron)
    │   ├── main.ts                       # + confirmGrant + ipcMain.handle('atlas:permissions:select', …);
    │   │                                 #   sincroniza openChatSessionIds
    │   ├── preload.cjs                   # + window.atlas.permissions.select(roots)
    │   ├── confirm-port.ts               # INALTERADO (só import de tipo a partir do novo adapter)
    │   ├── steps-view.ts                 # inalterado
    │   ├── speech-output.ts              # inalterado
    │   └── renderer/
    │       ├── index.html                # + painel de permissões (listas de leitura/escrita)
    │       └── renderer.js               # + pinta listas a partir do status, adiciona/remove,
    │                                     #   aplica, avisa, reabre o chat, recarrega o status;
    │                                     #   desabilita durante turno de chat OU ask em voo
    ├── tests/
    │   ├── core-bridge.test.ts           # + casos de selectPermissionRoots (inclui ask em voo)
    │   └── permission-grant-dialog.test.ts  # NOVO: texto da concessão + fail-closed
    └── CLAUDE.md                         # + superfície de permissões, canal IPC, escopo de vida,
                                          #   ConfirmPort (ação) × GrantConfirmPort (política)
```

Nenhum arquivo novo em `docs/06-adr/`, `packages/*` ou `apps/cli`. Essa lista é expectativa e pode sofrer pequenos ajustes.

---

# Componentes Impactados

Camada Interaction do Module Catalog, no app `apps/desktop`:

- Input Gateway (semente desktop, SPECs 0031-0037) — entrada ganha o gesto de "configurar raízes de permissão", o equivalente GUI de `--allow-read`/`--allow-write`, e o gesto de consentimento de concessão;
- Output Gateway (semente desktop) — saída ganha o painel de raízes configuradas, o diálogo de concessão e o aviso de aplicação.

Consome, **sem alterar**: Core (`createAtlas` com `config.permissions`), Configuration Service (`loadConfig`, validação), Permission Service (`evaluate`/`isContained`, resolução `realpath` das raízes na criação), Runtime (portão e `ConfirmPort` de ação pontual), Context Service (via `closeChatSession`), Lifecycle Manager (`shutdown`).

Nenhum componente de `packages/*` é modificado.

---

# Interfaces Necessárias

Locais em `apps/desktop` (não em `@atlas/contracts` — não há segundo consumidor):

```text
PermissionRoots {
  readRoots:  readonly string[]
  writeRoots: readonly string[]
}

PermissionRootsSelection extends PermissionRoots {
  closedSessions: readonly SessionId[]   // sessões de chat encerradas pela aplicação
}

// permission-grant-dialog.ts — concessão de POLÍTICA (não ação pontual)
GrantRequest {
  path:     string
  scope:    'subtree'    // literal: a concessão vale para o diretório e tudo abaixo
  duration: 'session'    // literal: vale enquanto a app estiver aberta
}
GrantConfirmPort { request(grant: GrantRequest): Promise<boolean> }
createGrantConfirmDialog(deps: { showMessageBox: ShowMessageBox }): GrantConfirmPort

selectPermissionRoots(
  request: PermissionRoots,
  deps?: { confirmGrant?: GrantConfirmPort },   // default: recusa tudo (fail-closed)
): Promise<PermissionRootsSelection>
  // rejeita, sem nenhum efeito colateral, se:
  //   readRoots normaliza para vazia | algum caminho não é absoluto
  //   | há turno de chat OU ask em voo
  //   | alguma raiz de escrita NOVA não foi confirmada

selectedPermissionRoots(): PermissionRoots | undefined
```

`ShowMessageBox`/`DialogOptions`/`ShowMessageBoxResult` já existem em `confirm-port.ts` (importados como tipo, sem alterá-lo); `ConfirmPort` (ação pontual), `SessionId` e `AtlasConfigOverride` seguem como estão. Nenhuma interface nova em `@atlas/contracts`; nenhum tipo novo em `packages/*`.

Canal IPC novo (nome estável, ao lado de `'atlas:status'`/`'atlas:ask'`/`'atlas:chat:*'`/`'atlas:memory:*'`/`'atlas:persona:*'`):

```text
main:     ipcMain.handle('atlas:permissions:select', (_e, roots) =>
            selectPermissionRoots(roots, { confirmGrant }))   // adapter de CONCESSÃO
preload:  window.atlas.permissions.select(roots)
            → ipcRenderer.invoke('atlas:permissions:select', roots)
renderer: const selection = await window.atlas.permissions.select({ readRoots, writeRoots })
```

---

# Fluxo Esperado

```text
[abertura da janela]
renderer → window.atlas.getStatus() → [main] resolveStatusSnapshot()
  → pinta o painel com readRoots/writeRoots CONFIGURADOS (config.permissions ecoado por
    loadConfig; não as raízes já resolvidas por realpath — ver Observações)

[usuário edita as listas e clica em Aplicar]
renderer → window.atlas.permissions.select({ readRoots, writeRoots })
  → [main] ipcMain.handle('atlas:permissions:select')
      → selectPermissionRoots(roots, { confirmGrant })
          1. normaliza (trim, descarta vazias, dedup preservando ordem)
          2. readRoots vazia?  ou algum caminho relativo?      → rejeita (nada muda)
          3. turno de chat em voo? ask em voo?                 → rejeita (nada muda)
          4. para cada writeRoot NOVA:
               confirmGrant.request({ path, scope:'subtree', duration:'session' })
               recusou (ou sem confirmGrant) → rejeita (nada muda, nada aplicado)
          5. registra a seleção no estado de módulo do bridge
             encerra TODAS as sessões de chat vivas → { readRoots, writeRoots, closedSessions }
      → main.ts remove closedSessions de openChatSessionIds
  → renderer: limpa o transcript, escreve "Permissões alteradas — nova conversa iniciada",
    reabre a sessão (window.atlas.chat.open()) e recarrega o painel de status
  → se rejeitou: aviso de erro, transcript e conversa intactos, listas recarregadas do status

[interações seguintes]
resolveStatusSnapshot / resolveAskSnapshot / openChatSession / resolveMemorySnapshot / forgetFact
  → createAtlas({ config: { ...override,
                            permissions: override.permissions ?? seleção corrente } })
  → loadConfig valida  →  createPermissionService resolve as raízes por realpath (uma vez)
  → o portão do Runtime passa a julgar sob a política nova (ADR-0013)
```

Regras (para remover ambiguidade):

- o Core vive **exclusivamente no main process**; o renderer nunca importa `packages/*` — troca apenas listas de strings planas e recebe `PermissionRootsSelection` plano (Artigo 3 / segurança Electron);
- a política chega ao Permission Service **só** pelo caminho já existente: `createAtlas({ config: { permissions } })` → `loadConfig` (validação, ADR-0006) → `createPermissionService({ readRoots, writeRoots })`. O app **nunca** avalia contenção, **nunca** chama `evaluate`/`isContained`, **nunca** resolve `realpath` — não reimplementa nenhuma parcela da autoridade do ADR-0013;
- **substituição, nunca merge**: cada aplicação carrega as duas listas completas e substitui a seleção anterior por inteiro — mesma semântica que a CLI dá a `--allow-read`/`--allow-write` (SPEC-0018). Adicionar/remover são gestos do renderer, que recompõe a lista completa antes de enviar. Pela mesma regra, um `configOverride.permissions` vindo do chamador é **bloco completo**: a seleção não é mesclada dentro dele (o campo omitido cai no default do `loadConfig`, não na seleção do usuário);
- **tudo ou nada**: qualquer recusa em qualquer etapa deixa a seleção anterior intacta — não existe aplicação parcial (ex.: aplicar `readRoots` e falhar em `writeRoots`);
- **aumento de privilégio de escrita nunca é silencioso nem descrito de forma enganosa**: raiz de escrita nova exige aprovação num diálogo que descreve **concessão de política sobre a subárvore, válida enquanto a app estiver aberta**; sem `GrantConfirmPort`, o default é recusar (Artigo 8; Module Catalog: o Permission Service não presume consentimento para ações destrutivas, e políticas não se modificam silenciosamente);
- **redução de privilégio não exige confirmação** e é sempre aceita (sujeita às demais validações) — restringir é o lado seguro;
- **operação em voo bloqueia a aplicação, em duas camadas**: o renderer desabilita o painel durante um turno de chat ou um `ask` (UX, molde SPEC-0033/0037) e o bridge recusa (garantia testável). Sem a camada do bridge, um `ask` longo poderia continuar rodando sob política antiga **depois** de a janela anunciar "Permissões alteradas" — inclusive escrevendo num diretório recém-revogado (D10);
- **nenhum Core sobrevive à aplicação sob política superada**: a aplicação só ocorre quando não há operação em voo, e encerra as sessões de chat vivas. Como todas as funções que sobem o Core neste app estão no `core-bridge` e todas são rastreadas ou encerradas, não resta plataforma viva com a política antiga depois de uma aplicação bem-sucedida;
- **o painel reflete as raízes configuradas** que o Core recebeu (lidas do `StatusSnapshot` após cada aplicação e após cada recusa) — o usuário nunca vê uma lista divergente do que foi configurado. A política **resolvida** (pós-`realpath`, com fail-closed por raiz irresolvível) pode ser mais restritiva que a exibida; a diferença está registrada nas Observações e erra sempre para o lado seguro;
- a seleção é **estado de sessão da app**, em memória do main process (mesmo lugar/molde da seleção de Persona da SPEC-0037): não é conhecimento persistente, logo não passa pela Memory (Artigo 11) nem cria arquivo novo; fechar a app devolve a política aos valores de `flags > env > defaults` — o privilégio concedido **não sobrevive** ao reinício (fail-closed por construção).

---

# Estratégia de Implementação

1. criar `permission-grant-dialog.ts`: `GrantRequest`/`GrantConfirmPort`/`createGrantConfirmDialog`, com o texto de concessão (concessão + subárvore + duração de sessão) e o fail-closed do molde de `confirm-port.ts`; testar primeiro (texto e recusa) em `tests/permission-grant-dialog.test.ts`;
2. estender `core-bridge.ts`: tipos `PermissionRoots`/`PermissionRootsSelection`, estado de módulo da seleção, rastreio de operação em voo generalizado (`resolveAskSnapshot` marca antes do primeiro `await` e desmarca em `finally`, ao lado do `busySessions` do chat), `selectPermissionRoots` na ordem exata do Escopo (normalizar → validar → operação em voo → consentimento de concessão → registrar + encerrar sessões), `selectedPermissionRoots`, generalização do helper que injeta seleções no `AtlasConfigOverride` (Persona + permissões; override explícito do chamador vence como bloco completo), reset de estado de módulo estendido. Atenção ao `exactOptionalPropertyTypes` (padrão recorrente no repo): só definir `permissions` no override quando houver seleção;
3. testes de `core-bridge.test.ts` (TDD): normalização/validação estrutural; concessão de leitura; concessão de escrita com `confirmGrant` aprovando (asserção sobre o `GrantRequest` exato e a contagem de chamadas); recusa fail-closed sem efeito parcial; ausência de `confirmGrant`; não-reconfirmação de raiz já concedida e de remoção; precedência do override explícito e comportamento de bloco completo com `permissions` parcial; encerramento das sessões ociosas; recusa com turno de chat em voo; **recusa com `ask` em voo** + integridade do `ask`; efeito de ponta a ponta no veredicto do portão (Tool de escrita em diretório temporário, com e sem concessão);
4. `main.ts`: construir `confirmGrant`, registrar o `ipcMain.handle` e sincronizar `openChatSessionIds` com `closedSessions`; casca fina, `confirm-port.ts` intocado;
5. `preload.cjs`: expor `window.atlas.permissions.select`; `renderer/index.html` + `renderer.js`: painel com as duas listas pintadas a partir do status, adicionar/remover/aplicar, inclusão na serialização estendida (turno de chat **ou** `ask` em voo), aviso de sucesso/erro, reabertura do chat e recarga do status;
6. validar `pnpm lint`/`typecheck`/`test` e a verificação de fronteira por `grep` (nenhum import de `@atlas/permissions` em `apps/desktop/src`; diff vazio em `packages/*` e em `src/confirm-port.ts`);
7. smoke manual em sessão gráfica real (conceder leitura e usar no chat; conceder escrita e **ler o texto do diálogo**, cancelar e confirmar; painel desabilitado durante um turno e durante um `ask`; reabrir a app e confirmar o retorno à política da config) e registrar o resultado;
8. atualizar `apps/desktop/CLAUDE.md`; validar todos os critérios de aceitação.

---

# Estratégia de Testes

- testes unitários em `apps/desktop/tests/` sob o Vitest já configurado, **sem Electron** — a fronteira testável é a superfície de permissões do `core-bridge` mais o adapter de concessão, como nas SPECs 0031-0037;
- **adapter de concessão** (`permission-grant-dialog.test.ts`): asserções sobre o texto montado (concessão de permissão de escrita; caminho + subárvore; validade só enquanto a app estiver aberta; ausência da frase de ação pontual do `confirm-port.ts`) e fail-closed em cancelar/`cancelId`/índice inesperado/`showMessageBox` que rejeita;
- **normalização/validação**: `trim`, descarte de vazias, deduplicação preservando ordem; `readRoots` vazia rejeita; caminho relativo rejeita citando o caminho; nenhuma dessas recusas altera a seleção nem chama `confirmGrant`;
- **concessão de leitura**: `resolveStatusSnapshot()` subsequente reporta as raízes novas; `openChatSession` posterior nasce sob a política nova;
- **concessão de escrita**: `confirmGrant` fake aprovando — asserção sobre o `GrantRequest` (`{ path, scope: 'subtree', duration: 'session' }`) e sobre a contagem de chamadas (uma por raiz **nova**, nenhuma para raiz já concedida ou removida);
- **fail-closed**: `confirmGrant` recusando, e ausência de `confirmGrant` — rejeição, seleção inalterada, nenhuma aplicação parcial da parte de leitura pedida na mesma chamada, sessões vivas intactas;
- **precedência/bloco completo**: `configOverride.permissions` explícito vence a seleção corrente; `permissions` parcial não recebe merge da seleção (o campo omitido cai no default do `loadConfig`);
- **chat vivo ocioso**: sessão aberta devolvida em `closedSessions` e inutilizável depois; sem sessões, `closedSessions: []`;
- **turno de chat em voo** e **`ask` em voo**: gateway `fake` instrumentado para segurar a resposta até o teste liberar; em ambos, asseverar rejeição estruturada, seleção inalterada, nenhum `confirmGrant` solicitado (e, no caso do chat, nenhuma sessão encerrada); liberar e asseverar que a operação conclui íntegra (`TurnSnapshot`/`AskSnapshot` e `learned` gravados); então a aplicação passa a ser aceita;
- **efeito real no portão**: um `resolveAskSnapshot` cujo plano execute uma Tool de escrita num diretório temporário — negado (`denialKind: 'blocked'`) sem concessão, executado com a concessão aplicada. É o teste que separa "mudou o painel" de "mudou a política";
- **isolamento entre testes**: a seleção de permissões e o rastreio de operações em voo são estado de módulo — cada caso que os altera precisa restaurá-los (reset explícito exportado para teste, estendendo o já existente da SPEC-0037), sem vazamento entre casos;
- sem mocks do Core — `createAtlas` real com gateway `fake` e `dataDir`/diretórios temporários isolados (ADR-0004), padrão das suítes desktop;
- `main.ts`/`preload.cjs`/`renderer.js` (camada Electron/DOM) **não** são unit-testados nesta fatia — validação por smoke manual, incluindo os itens (c) e (d) do critério de smoke.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é passo de fecho (`doc-sync`), não do implementador; o implementador toca a doc específica da própria SPEC (o arquivo da SPEC e o `CLAUDE.md` de `apps/desktop`).

**Instrução explícita ao `doc-sync` (A5):** o item 2.4 do `Roadmap.md` só fecha coerente se **as duas** linhas ainda não riscadas forem atualizadas — a **l. 162** (Persona em runtime, entregue pela SPEC-0037 e ainda não riscada por lapso do fecho anterior) **e** a **l. 163** (permissões por GUI, esta SPEC) —, marcando então o item 2.4 como entregue por inteiro. Riscar só a l. 163 deixaria o item fechado com uma linha aberta que já está `Done` (Artigo 1).

---

# Restrições

- Não criar novos packages, módulos, Tools, Skills nem Personas; todo o código novo vive em `apps/desktop`.
- **Diff vazio em `packages/*`** — nada em `@atlas/permissions`, `@atlas/contracts`, `@atlas/core`. Se a implementação sugerir mexer no Permission Service ou nos contratos, **parar e registrar** (Artigo 1 / escalação).
- **`src/confirm-port.ts` fica inalterado** (só pode ser importado como tipo pelo adapter novo). O consentimento de **política** nunca reusa o diálogo de **ação pontual** (D11).
- O app **não** avalia permissão: nunca chama `evaluate`/`isContained`, nunca resolve `realpath`, nunca decide contenção. Ele só entrega listas de caminhos ao Core, que valida (`loadConfig`) e compõe o Permission Service (ADR-0013/ADR-0006).
- Nenhum estado persistente novo: a seleção vive em memória do main process e morre com a app. Se a implementação sugerir gravar a política em disco, **parar e registrar** (Artigo 11 / escalação — ver D2).
- Ampliar `writeRoots` exige consentimento explícito por `GrantConfirmPort`; o default (sem porta injetada) é **recusar**. Nenhum caminho de código pode conceder escrita sem passar por essa porta.
- Nenhuma afirmação de garantia sem lastro no código: o rastreio de operação em voo cobre as funções do `core-bridge` que sobem o Core; se uma fatia futura criar plataforma fora delas, precisa entrar no mesmo rastreio (registrado em "Fora do Escopo").
- O Core vive só no main process; o renderer não importa `packages/*` nem tipos de contrato. `contextIsolation: true`, `nodeIntegration: false`.
- `core-bridge.ts` e `permission-grant-dialog.ts` **não** importam `electron` (a dependência fica confinada a `main.ts`) — é o que os mantém testáveis no Vitest.
- Sem `dist/`, sem bundler, sem framework de UI: main process em `.ts` via `tsx` (ADR-0005/0019); renderer/preload em JS plano.
- `PermissionRoots`/`PermissionRootsSelection`/`GrantRequest`/`GrantConfirmPort` e o canal IPC ficam **locais** a `apps/desktop`; promoção a `@atlas/contracts` só com 2º consumidor real, via ADR.
- Ao editar código, nunca inserir caracteres de controle literais (lição da SPEC-0029) — sempre a forma escapada da linguagem-alvo.

---

# Observações

**Por que a política não é durável.** A configuração vale para a sessão da app. Torná-la durável exigiria ou (a) gravá-la como conhecimento persistente — território exclusivo do Memory Service (Artigo 11), e "quais diretórios o Atlas pode escrever" é **política de segurança**, não conhecimento aprendido (guardá-la lá seria pior: a memória é editável pelo próprio laço de aprendizado, o que abriria um caminho de escalada de privilégio por texto gerado); ou (b) o slot `arquivo` da precedência de config (ADR-0006), **que não existe** (candidato do Roadmap 1.4). Qualquer dos dois é decisão estrutural própria, com ADR — escalação obrigatória da Emenda v1.1, fora do que esta fatia decide. O Roadmap 2.4 pede configuração "por interface gráfica, não só flags", e é isso que esta SPEC entrega. Efeito colateral positivo: o privilégio concedido não sobrevive ao reinício, o que é o lado seguro do trade-off — e é exatamente o que o texto do diálogo de concessão promete ao usuário.

**O que a persistência de política vai exigir** (levantamento para a fatia futura, deliberadamente não decidido aqui):

1. **Onde vive**: o slot `arquivo` do ADR-0006 é o candidato natural (é literalmente "configuração"), mas implementá-lo muda a precedência de config de toda a plataforma, CLI inclusive — ADR próprio e SPEC própria.
2. **Integridade**: um arquivo de política que concede escrita precisa de garantias que hoje não existem (quem pode gravá-lo, o que acontece se estiver corrompido, fail-closed em erro de leitura).
3. **Interação com o Artigo 8**: uma política durável é exatamente a "política previamente configurada" que o Artigo 8 admite como alternativa à autorização explícita — o que aumenta, não diminui, a exigência de rigor sobre como ela é criada e revista.

**Configurado × resolvido: o que o painel mostra, com honestidade (A3).** O `StatusSnapshot` devolve `config.permissions` — as raízes **configuradas**, ecoadas por `loadConfig`. Não são necessariamente as raízes que o `PermissionService` aplica: ele resolve cada raiz por `realpath` **uma vez, na criação**, e uma raiz inexistente, com `EACCES` ou apontando por symlink para outro lugar fica **inerte** (fail-closed por raiz, sem lançar — SPEC-0015) ou passa a valer para o destino real. Consequência: o painel pode exibir como concedida uma raiz que, na prática, não concede nada. A divergência erra sempre para o **lado restritivo** (o usuário vê mais permissão do que tem, nunca menos), e por isso não bloqueia esta fatia; expor a política resolvida exigiria superfície nova em `packages/*` (contrato ou snapshot novo) e está em "Fora do Escopo" como candidato futuro. Toda frase desta SPEC sobre o que o painel exibe usa deliberadamente "configuradas", não "efetivas".

**Por que o app não faz `realpath`/`stat` no caminho digitado.** Seria uma segunda implementação, no lugar errado, de uma autoridade que já existe: o Permission Service resolve cada raiz por `realpath` uma vez, na criação, e é fail-closed por raiz irresolvível (SPEC-0015); o `loadConfig` é a única fonte de verdade da validação de config (ADR-0006); e o fecho atômico da SPEC-0017/ADR-0014 aplica a contenção no instante do uso. Uma checagem antecipada no app não acrescentaria garantia nenhuma (o caminho pode mudar entre a checagem e o uso — o TOCTOU que o ADR-0014 já trata no lugar certo) e acrescentaria IO a um módulo hoje puro de IO. O que o app faz é o mínimo que evita erro grosseiro e mensagem confusa: recusar caminho relativo e lista de leitura vazia, antes de o Core recusar do seu jeito. Ver Decisão D5.

**Por que caminho relativo é recusado em vez de resolvido.** Numa app gráfica, o `cwd` do processo é o diretório de onde o Electron foi lançado — invisível e não escolhido pelo usuário. Resolver `./docs` contra ele concederia acesso a um lugar que o usuário não pretendia nomear. Recusar é a leitura fail-closed do Artigo 8 ("sempre que houver dúvida, solicitar confirmação" — aqui, pedir que o usuário seja explícito).

**A primeira aplicação pode pedir confirmação de raízes que o usuário já tinha.** O painel é pré-preenchido a partir do `StatusSnapshot`; se a app foi lançada com `ATLAS_ALLOW_WRITE` no ambiente, a primeira aplicação (mesmo que o usuário só queira mexer em `readRoots`) trata essas raízes de escrita como **novas** — porque o bridge, sem subir o Core, não conhece a política de origem — e pede o consentimento uma vez para cada. É consciente e aceito: erra para o lado de **pedir confirmação a mais** (nunca a menos), e o texto do diálogo (concessão sobre a subárvore, válida enquanto a app estiver aberta) descreve corretamente o que o usuário estará reafirmando. A alternativa — comparar contra a política de origem — exigiria subir o Core dentro de `selectPermissionRoots` só para descobrir o baseline, ou fazer o renderer enviar o baseline junto (o renderer virando fonte de verdade de política, rejeitado em D3).

**Coexistência com operações em voo e com o chat vivo.** As raízes são resolvidas na criação do `PermissionService`, dentro de `createAtlas` — um Core já vivo carrega a política antiga e **não** a recompõe. Isso vale para dois estados diferentes: (1) sessões de chat vivas, que a aplicação **encerra**; e (2) operações de tiro único em voo (`resolveAskSnapshot`), que sobem um Core próprio fora do `Map` de sessões e podem levar segundos ou minutos — se a aplicação fosse aceita durante uma delas, a janela anunciaria "Permissões alteradas" enquanto um Core com a política antiga seguisse rodando, podendo escrever ou apagar num diretório **recém-revogado**. Por isso o rastreio de operação em voo cobre as duas (D10), e não apenas o chat, como fazia a SPEC-0037 para a Persona (onde o pior caso era estética de identidade, não privilégio de escrita).

**Smoke manual.** Como nas SPECs 0031-0037, o shell de automação sem WindowServer não executa `app.whenReady()`; a confirmação visual — em especial **ler o texto do diálogo de concessão** e verificar que ele descreve concessão de política, subárvore e duração de sessão — deve ser feita por quem tiver sessão gráfica real, antes de fechar a SPEC. A cadeia testável (`core-bridge`, `permission-grant-dialog`) roda em CI sob Vitest sem Electron. Atrito recorrente (8ª fatia visual seguida) de toda fatia visual da Fase 2.

**Estado de módulo e testes.** A seleção de permissões e o rastreio de operações em voo juntam-se à seleção de Persona e ao `busySessions` como estado de módulo do `core-bridge` — os testes que os alteram precisam restaurá-los. Vale reaproveitar/estender o reset já existente (`__resetPersonaStateForTests`) em vez de criar um segundo; um nome mais abrangente é aceitável (renomeação interna ao app, sem consumidor externo).

**Fechamento do item 2.4.** Com esta SPEC, as três linhas do item 2.4 do Roadmap ficam entregues (memória — SPEC-0034; Persona — SPEC-0037; permissões — esta). Ver a instrução ao `doc-sync` na Definition of Done: as linhas 162 **e** 163 precisam ser riscadas. O item 2.2 (fatias restantes) e o item 2.3 (entrada por voz/wake word, ainda dependentes de brainstorming humano e ADR) seguem abertos na Fase 2.

---

# Checklist para IA

Antes de implementar:

- ler documentação referenciada (Roadmap 2.4, PRD Execução/Restrições, Artigo 8 e Artigo 11, ADR-0013/0014/0015/0006/0019, SPECs 0018/0031-0037, `apps/desktop/src`);
- compreender o objetivo (configurar `readRoots`/`writeRoots` em runtime pela janela, fail-closed, sem estado persistente novo, sem tocar `packages/*`);
- confirmar que nenhum contrato precisa mudar e que o diff é confinado a `apps/desktop`.

Durante implementação:

- manter o app fino; Core só no main process; renderer isolado;
- `core-bridge.ts`/`permission-grant-dialog.ts` livres de import de Electron e de `@atlas/permissions`; nenhuma avaliação de permissão no app;
- nenhuma concessão de escrita sem `GrantConfirmPort` aprovando; nenhuma aplicação parcial; nenhuma aplicação com operação em voo;
- nenhuma gravação da política em disco;
- manter simplicidade (sem bundler, sem framework); painel diagnóstico/mínimo.

Após implementação:

- executar testes e a verificação de fronteira por `grep`;
- smoke manual do app real (conceder leitura; conceder escrita lendo o texto do diálogo; cancelar o diálogo; painel desabilitado durante turno de chat e durante `ask`; reabrir a app);
- validar critérios de aceitação;
- registrar lições aprendidas;
- registrar conclusão.

---

# Decisões de design

> Decisões tomadas pelo `spec-drafter` (Emenda v1.1), em formato de veto. Quem as ataca é o `architecture-reviewer` no gate `Draft → Ready`. D10 e D11 nasceram do 1º veto (achados bloqueantes A1 e A2); D3, D4 e a Definition of Done absorveram os achados não-bloqueantes A3, A4 e A5.

**D1. Perfil `completo`.**

- **Decisão**: classificar a SPEC como `completo`.
- **Porquê**: a fatia vive em `apps/desktop/src` — fora da superfície de containment do perfil `micro` (`packages/X/src` + opcionalmente `apps/cli/src`) — e envolve integração gráfica e diálogo nativo, validados só por smoke manual. Paridade com as sete SPECs irmãs do desktop (0031-0037), todas `completo` pela mesma razão. Na dúvida, `completo` (default seguro).
- **Alternativa descartada**: `micro` — falha a condição de containment e envolve superfície de segurança, onde a revisão completa é justamente o que se quer.

**D2. A configuração vive em memória do main process, pela sessão da app — não é persistida (e por isso esta fatia não escala).**

- **Decisão**: a política escolhida é estado de módulo do `core-bridge`, aplicada como `config.permissions` em cada `createAtlas` subsequente; fechar a app volta às raízes de `flags > env > defaults`. Persistência fica nomeada como fatia futura, dependente de ADR.
- **Porquê**: é a fatia contida que a documentação já determina sozinha — nenhum estado persistente novo, logo nenhuma tensão com o Artigo 11 e nenhum ADR necessário. Persistir esbarraria no slot `arquivo` do ADR-0006, que **não existe** (ADR novo ⇒ escalação obrigatória da Emenda v1.1), ou na Memory, que é autoridade sobre **conhecimento**, não sobre política de segurança — e cuja escrita é alimentada pelo próprio laço de aprendizado (ADR-0016), o que criaria um caminho de escalada de privilégio por texto gerado. Precedente direto: D3 da SPEC-0037. Mais simples, mais seguro (privilégio não sobrevive ao reinício) e mais sustentável.
- **Alternativa descartada (1)**: persistir num arquivo de config (implementar o slot `arquivo` do ADR-0006) — ADR novo + mudança de precedência de config para toda a plataforma; escalação, e escopo muito maior que o item 2.4.
- **Alternativa descartada (2)**: persistir na Memory como "preferência" — colide com o Artigo 11 na leitura correta (política de segurança não é conhecimento) e abriria a superfície de escalada descrita acima. Rejeitada.

**D3. A seleção se aplica a todas as chamadas que sobem o Core; o override explícito do chamador vence e é tratado como bloco completo.**

- **Decisão**: generalizar o helper `withPersonaSelection` (SPEC-0037) para injetar também `permissions` no `AtlasConfigOverride` das cinco funções que sobem o Core; `configOverride.permissions` passado pelo chamador vence a seleção corrente e é tratado como **bloco completo** — a seleção **nunca** é mesclada campo a campo dentro dele. Um chamador que passe `permissions` parcial (só `writeRoots`, por exemplo) obtém o default do `loadConfig` no campo omitido, comportamento **documentado e coberto por teste**.
- **Porquê**: preserva o comportamento de todos os consumidores/testes existentes que já passam `permissions` explicitamente (nenhuma regressão), espelha a precedência de config do ADR-0006 (fonte mais específica vence) e mantém a regra "toda chamada ao Core usa a política ativa" verificável num único lugar. Substituição de bloco (e não merge) espelha a semântica que a CLI já dá a `--allow-read`/`--allow-write` (SPEC-0018) e a que o próprio `loadConfig` aplica ao override; uma semântica de merge criaria uma terceira regra de composição de política, mais difícil de auditar. O achado A4 do gate está correto ao notar que `loadConfig` resolve `readRoots`/`writeRoots` **independentemente** contra os defaults: um `permissions` parcial pode devolver `readRoots` ao default `[process.cwd()]`, potencialmente mais amplo que a restrição do usuário. Nenhum chamador de produção faz isso hoje (só testes), e a resposta correta é **documentar e testar** o comportamento de bloco completo, não inventar uma regra de merge no app.
- **Alternativa descartada (1)**: mesclar a seleção corrente dentro de um `permissions` parcial do chamador — esconderia do chamador explícito qual política ele está de fato pedindo, e criaria a terceira semântica de composição citada acima. Rejeitada por auditabilidade.
- **Alternativa descartada (2)**: a seleção viajar do renderer como argumento em cada canal IPC — engrossaria `main.ts` e todos os canais existentes e faria do renderer a fonte de verdade da política de segurança do Core, que vive só no main process (Artigo 3 / isolamento do ADR-0019). Mesma rejeição da D3 da SPEC-0037.

**D4. O estado configurado é lido pelo `StatusSnapshot` já existente — nenhuma superfície nova em `@atlas/core`; a divergência configurado × resolvido fica registrada.**

- **Decisão**: o painel pinta `readRoots`/`writeRoots` a partir do `resolveStatusSnapshot()` que o app já consome, o diff em `packages/*` é **vazio**, e toda a SPEC descreve esse dado como as raízes **configuradas** (não "efetivas"/"resolvidas"), com a divergência documentada nas Observações e listada em "Fora do Escopo".
- **Porquê**: `StatusSnapshot` (SPEC-0031) já expõe exatamente esses dois campos, preenchidos de `config.permissions` — a configuração que o Core recebeu e validou. É a leitura mais simples e evita reabrir a discussão do ADR-0003 que a D4 da SPEC-0037 teve de resolver com um re-export: aqui não é preciso ler catálogo nenhum de `packages/*`, então o composition root permanece intocado por construção. A precisão da linguagem importa (achado A3, Artigos 1 e 13): as raízes **resolvidas** pelo `PermissionService` (pós-`realpath`, fail-closed por raiz irresolvível — SPEC-0015) podem ser mais restritivas que as exibidas; afirmar "política efetiva" seria uma garantia que o código não sustenta. A divergência erra para o lado restritivo, o que a torna aceitável nesta fatia — mas registrada, não escondida.
- **Alternativa descartada (1)**: expor a política **resolvida** — exigiria superfície nova em `packages/*` (o `PermissionService` não publica suas raízes resolvidas), quebrando o diff vazio e provavelmente tocando contrato. Candidato futuro, fora desta fatia.
- **Alternativa descartada (2)**: re-exportar `defaultConfig`/`loadConfig` para o app recomputar a política corrente — duplicaria a resolução que o Core faz e poderia divergir dela. Rejeitada: o status é a fonte já pronta.
- **Alternativa descartada (3)**: um canal IPC novo `atlas:permissions:list` — outro round-trip que sobe e desliga o Core para devolver dado que o `status` já devolve. Rejeitada por custo sem ganho.

**D5. A validação no app é apenas estrutural (não vazia, absoluta, deduplicada); `realpath`/contenção continuam do Permission Service.**

- **Decisão**: `selectPermissionRoots` normaliza (trim/descarte de vazias/dedup preservando ordem) e recusa `readRoots` vazia e qualquer caminho **não absoluto**; não faz `realpath`, `stat` nem qualquer IO, e não julga contenção.
- **Porquê**: a resolução canônica das raízes é do Permission Service desde a SPEC-0015; a validação de config é exclusivamente do `loadConfig` (ADR-0006, decisão literal); e a contenção no instante do uso é do fecho atômico do ADR-0014. Duplicar qualquer dessas checagens no app não acrescentaria garantia (o caminho pode mudar entre a checagem e o uso) e acrescentaria IO a um módulo hoje puro. As duas checagens que ficam são as da borda, no padrão "a borda antecipa a recusa, o módulo garante a invariante" (SPEC-0029): `readRoots` vazia seria recusada pelo `loadConfig` de qualquer forma, e caminho relativo seria silenciosamente resolvido contra um `cwd` que o usuário de uma app gráfica não escolheu — recusar é a leitura fail-closed do Artigo 8. Confirmado no gate: tudo que passa nesta validação passa em `loadConfig` (que não exige caminho absoluto), então a regra adicional do app não pode "brickar" a aplicação.
- **Alternativa descartada (1)**: validar existência/tipo do diretório no app (`realpath` + `stat`) — exigiria porta de IO nova no bridge, replicaria autoridade do Permission Service (Artigo 3) e daria falsa sensação de garantia (TOCTOU). Rejeitada.
- **Alternativa descartada (2)**: resolver caminhos relativos contra `process.cwd()` — numa app gráfica o `cwd` é o de lançamento do Electron, invisível ao usuário; concederia acesso a um lugar não pretendido. Rejeitada por segurança.

**D6. Ampliar `writeRoots` exige consentimento explícito, uma confirmação por raiz nova; `readRoots` e remoções não exigem.**

- **Decisão**: para cada raiz de escrita **nova** (ausente da seleção corrente; sem seleção corrente, todas contam como novas), `selectPermissionRoots` pede consentimento pela porta de concessão (D11). Recusa em qualquer uma, ou ausência da porta, aborta a operação inteira sem aplicar nada. Alterar `readRoots` e remover raízes não abrem diálogo.
- **Porquê**: `writeRoots` é a política que autoriza toda escrita e todo `delete` (ADR-0013 + SPEC-0012/0013), e seu default é `[]` justamente porque escrita é **opt-in explícito**; ampliá-la é aumento de privilégio. O Artigo 8 exige autorização explícita para ação potencialmente destrutiva, e o Module Catalog proíbe "modificar políticas silenciosamente" e "presumir consentimento para ações destrutivas". A assimetria com `readRoots` espelha a que a própria plataforma já adota (leitura tem default útil, escrita tem default vazio; `delete` pede `confirm` no Runtime, `read` não). Remoções são redução de privilégio — confirmar para ficar mais seguro seria ruído sem ganho. A comparação de "raiz nova" por string exata erra sempre para o lado de pedir confirmação **a mais**, nunca a menos (custo aceito e registrado nas Observações).
- **Alternativa descartada (1)**: nenhuma confirmação, tratando o clique em "Aplicar" como consentimento suficiente — apaga a distinção entre ler e escrever num único botão e deixa a concessão mais perigosa da app sem barreira. Contraria a leitura direta do Artigo 8. Rejeitada.
- **Alternativa descartada (2)**: um único diálogo agregando todas as raízes novas — menos ruidoso, mas dilui a decisão por caminho e complica a asserção de texto; se o ruído incomodar na prática, é ajuste de UX de fatia futura, não mudança de garantia. Rejeitada nesta fatia.
- **Alternativa descartada (3)**: confirmar também `readRoots` — leitura não é ação destrutiva; o Artigo 8 não a exige e o ruído reduziria a força do sinal quando o diálogo de escrita realmente aparecer. Rejeitada.

**D7. Aplicar encerra as sessões de chat vivas.**

- **Decisão**: quando aceita, a aplicação encerra **todas** as sessões de chat vivas, devolvendo-as em `closedSessions`; o renderer limpa o transcript, anuncia e abre sessão nova.
- **Porquê**: as raízes são resolvidas na criação do `PermissionService`, dentro de `createAtlas` — um Core vivo carrega a política antiga e não a recompõe. Manter a sessão viva depois de uma **restrição** deixaria a conversa aberta operando com privilégio já revogado (falha de segurança direta, Artigo 8); depois de uma **ampliação**, deixaria a conversa ignorando a concessão (confusão). Mesmo desenho da D5 da SPEC-0037, com um motivo a mais (segurança).
- **Alternativas descartadas**: (a) aplicar só a sessões futuras, deixando o chat aberto sob a política antiga — inaceitável no caso de restrição e enganoso no de ampliação; (b) migrar a `Conversation` viva para o Core novo — decisão maior que esta fatia, nomeada como candidato futuro.

**D8. Aplicação é tudo-ou-nada, por substituição das duas listas completas.**

- **Decisão**: a superfície recebe `{ readRoots, writeRoots }` completos e substitui a seleção anterior por inteiro; qualquer recusa em qualquer etapa deixa a seleção anterior intacta. Adicionar/remover são gestos do renderer, que recompõe as listas antes de enviar.
- **Porquê**: política de segurança precisa ser auditável num único valor, não reconstruída a partir de deltas; é a semântica de substituição que a CLI já dá às flags (SPEC-0018). Tudo-ou-nada evita o estado pior: a parte de leitura aplicada e a de escrita recusada, deixando a política num ponto que o usuário não pediu. Mais transparente e mais seguro.
- **Alternativa descartada**: operações incrementais no bridge (`addReadRoot`/`removeWriteRoot`) — quatro superfícies, cada uma com sua regra de confirmação, sem um ponto único onde a política final seja visível antes de aplicar. Rejeitada por complexidade e auditabilidade.

**D9. Prioridade `Medium`.**

- **Decisão**: prioridade `Medium`.
- **Porquê**: fecha o item 2.4 e cumpre requisitos explícitos do PRD (l. 107/173/193), mas não corrige defeito nem fecha vulnerabilidade — hoje a janela é **mais restritiva** que o desejado (não escreve em lugar nenhum), o que é o lado seguro; e a capacidade equivalente já existe na CLI por flags. Mesmo peso das duas irmãs do item 2.4 (SPECs 0034 e 0037).
- **Alternativa descartada**: `High`/`Critical` — reservadas à fatia que abriu a fase e a correção/segurança bloqueante; o estado atual erra para o lado restritivo.

**D10. O rastreio de "operação em voo" é generalizado para toda função do bridge que sobe o Core — `resolveAskSnapshot` inclusive (correção do bloqueante A1).**

- **Decisão**: além do `busySessions` alimentado por `sendChatTurn` (SPEC-0037), `resolveAskSnapshot` passa a registrar/remover um token de operação em voo em `try`/`finally`, marcando **antes do primeiro `await`**; `selectPermissionRoots` recusa enquanto houver **qualquer** operação em voo. O renderer estende a mesma serialização ao `ask`. Fica registrado em "Fora do Escopo" que o rastreio cobre as funções do `core-bridge` — hoje o único caminho pelo qual esta app sobe o Core — e que qualquer caminho futuro precisa entrar nele.
- **Porquê**: a garantia "nenhum Core sobrevive à aplicação sob política superada" só é verdadeira se todo Core vivo for rastreado. `resolveAskSnapshot` sobe um Core próprio, **fora** do `Map` de sessões, e pode rodar por muito tempo (modelo + Tools); o canal `'atlas:ask'` está vivo e exposto no renderer. Sem o rastreio, a sequência "usuário dispara `ask` → remove uma `writeRoot` → Aplicar" seria **aceita**: a janela anunciaria a revogação enquanto o Core em voo seguisse podendo escrever ou apagar no diretório recém-revogado — exatamente o caso que a D7 classifica como falha de segurança direta (Artigo 8), agravado por afirmar em documento uma garantia que o código não sustenta (Artigos 1 e 13). O mecanismo já existe, é fail-closed, custa pouco e é testável no Vitest sem Electron; estendê-lo é estritamente mais simples que manter duas categorias de Core (rastreado e não rastreado).
- **Alternativa descartada (1)**: manter o escopo e apenas **remover** as afirmações absolutas, registrando a janela residual — foi a opção (ii) oferecida no gate. Rejeitada: a janela residual é justamente na direção perigosa (revogação anunciada e não aplicada), o custo de fechá-la é uma dezena de linhas no mesmo mecanismo já desenhado, e uma SPEC de segurança que documenta o próprio buraco em vez de fechá-lo falha o teste da Constituição (mais seguro? mais transparente?).
- **Alternativa descartada (2)**: encerrar/abortar o `ask` em voo ao aplicar — cancelamento de execução não existe na plataforma (Task Manager, Roadmap 1.1) e destruiria trabalho do usuário sem aviso. Rejeitada.
- **Alternativa descartada (3)**: enfileirar a aplicação para depois da operação — esconderia do usuário que a política ainda não mudou, exatamente quando ele pode estar tentando **revogar** acesso com urgência. Rejeitada.

**D11. A concessão de política usa uma porta e um diálogo próprios (`GrantConfirmPort`/`createGrantConfirmDialog`), não o `ConfirmPort` de ação pontual (correção do bloqueante A2).**

- **Decisão**: criar `apps/desktop/src/permission-grant-dialog.ts` com `GrantRequest { path, scope: 'subtree', duration: 'session' }`, `GrantConfirmPort` e `createGrantConfirmDialog({ showMessageBox })`, cujo texto declara explicitamente que se trata de **conceder permissão de escrita** sobre **o diretório e todo o seu conteúdo**, válida **enquanto a janela estiver aberta**. `src/confirm-port.ts` fica inalterado e continua servindo só a ações pontuais do Runtime. O texto é asseverado por teste e verificado no smoke manual.
- **Porquê**: consentimento só é consentimento se a descrição corresponder ao que está sendo autorizado (Artigo 8: autorização **explícita**; Artigo 7: transparência; Module Catalog: não presumir consentimento para ações destrutivas nem modificar políticas silenciosamente). O diálogo existente tem texto **fixo** — "Confirmar ação irreversível", "recurso: /a / ação: write" —, que descreve uma escrita pontual acontecendo agora; o que o usuário estaria autorizando é uma **política** sobre uma subárvore inteira, que habilita `write_file`/`append_file`/`mkdir` e é a política que `delete` consulta. Reusar o adapter economizaria um arquivo e cobraria o preço no único lugar onde não se pode economizar. Um adapter separado mantém cada porta com uma responsabilidade só (o `ConfirmPort` continua satisfazendo estruturalmente o contrato interno do Runtime, sem ganhar um segundo modo), reusa os tipos de diálogo já prontos e mantém o fail-closed idêntico — mais modular e mais transparente, ao custo de um arquivo pequeno e seu teste.
- **Alternativa descartada (1)**: parametrizar `createDialogConfirmPort` com um texto alternativo — tornaria um adapter que hoje tem contrato estrutural com o Runtime (`request(action: ActionRequest)`) em algo com dois modos e dois vocabulários (`ActionRequest` × concessão), e `ActionRequest` continuaria sendo o tipo errado para descrever escopo de subárvore e duração de sessão. Rejeitada: acopla dois consentimentos de natureza diferente ao mesmo tipo.
- **Alternativa descartada (2)**: manter o reuso e apenas melhorar o texto genérico de `confirm-port.ts` — degradaria a mensagem das ações pontuais reais (que **são** irreversíveis e imediatas) para acomodar um caso que não é nenhuma das duas coisas. Rejeitada.
- **Alternativa descartada (3)**: `dialog.showOpenDialog` (seletor nativo de diretório) como gesto de concessão — o consentimento viria implícito na escolha do diretório, resolvendo também a digitação de caminho; mas expande escopo (segunda superfície de diálogo, mudança do fluxo de entrada do painel) e o gate pediu explicitamente para não expandir. Permanece em "Fora do Escopo" como candidato futuro.

---

# Resultado Esperado

A janela do `@atlas/desktop` passa a oferecer **configuração de permissões de sistema de arquivos em runtime**: um painel mostra as raízes de leitura e de escrita **configuradas** em vigor (lidas do `StatusSnapshot`, isto é, do que o Core recebeu e validou), permite acrescentar e remover raízes e aplicar a mudança sem reiniciar a app nem passar flag/env — capacidade que, até aqui, a interface gráfica simplesmente não tinha (rodava sempre nos defaults, sem nenhuma raiz de escrita). Ampliar a escrita passa por um diálogo nativo **dedicado à concessão de política**, que diz o que está sendo concedido (o diretório e toda a sua subárvore, enquanto a janela estiver aberta) em vez de descrever uma ação irreversível pontual; qualquer recusa deixa tudo exatamente como estava (fail-closed, tudo-ou-nada). A aplicação é **recusada enquanto houver qualquer operação em voo** — turno de chat ou `ask` — e encerra as sessões de chat vivas quando aceita, de modo que nenhum Core do app segue rodando sob política superada depois de a janela anunciar a mudança; nenhum turno é destruído no meio e nenhum fato aprendido se perde. A política chega ao Permission Service pelo único caminho já existente — `createAtlas({ config: { permissions } })` → `loadConfig` → `createPermissionService` —, com o app validando apenas o estrutural (lista de leitura não vazia, caminhos absolutos, deduplicados) e sem reimplementar nenhuma parcela do portão do ADR-0013; a diferença entre raízes **configuradas** e raízes **resolvidas por `realpath`** fica documentada, e erra sempre para o lado restritivo. A configuração vive em memória do main process pela sessão da app — nenhum estado persistente novo, nenhuma tensão com o Artigo 11, e o privilégio concedido não sobrevive ao reinício, exatamente como o diálogo de concessão promete. O diff é **confinado a `apps/desktop`** (com `src/confirm-port.ts` inalterado): `@atlas/contracts`, `@atlas/core`, `@atlas/permissions` e `apps/cli` ficam com diff vazio. A lógica de valor vive fora do runtime gráfico, testada no Vitest sem Electron, inclusive no que importa de verdade: um teste comprova que a concessão muda o **veredicto do portão**, e outro que um `ask` em voo impede a aplicação. Com esta SPEC, as três linhas do item 2.4 do Roadmap ficam entregues — o item fecha por inteiro, riscando as linhas 162 e 163 —, deixando explicitamente para fatia futura, precedida de ADR, a persistência da política entre reinícios.
