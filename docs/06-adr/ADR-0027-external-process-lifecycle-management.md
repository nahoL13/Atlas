# ADR-0027 — Auto-gerência de processos externos (Ollama, containers Docker)

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-08-22

---

# Contexto

O usuário pediu, em 2026-08-22, para não precisar mais subir manualmente o
Ollama (`ollama serve`) e um container Docker do SearXNG antes de cada sessão
com o Atlas — o modelo local (`@atlas/model-gateway`, provider `local`) e a
Tool `web_search` ([SPEC-0057](../implementation/specs/SPEC-0057-web-search-tool.md))
dependem desses dois processos externos estarem de pé, e hoje isso é
inteiramente manual.

O `spec-drafter`, ao tentar desenhar a SPEC diretamente, escalou sem redigi-la
(ver relatório na sessão): o portão de permissão (`evaluate`/`netRoots`/
`ResourceType`) não tem representação para "processo/container do host"; o
Module Catalog já atribui ao **Lifecycle Manager** (`packages/core`)
"verificação de dependências" e "ativação de componentes", mas os hooks
`onStart`/`onShutdown` de `createLifecycle()` existem e não são usados por
`createAtlas`; a simetria de encerramento, o modo de falha no boot e o escopo
exato (Ollama, Docker, ou os dois) não eram deriváveis da documentação.

O usuário aprovou explicitamente abrir este ADR antes de qualquer SPEC, e
decidiu, em brainstorming nesta sessão: as duas dependências entram no
escopo (Ollama e o container Docker do SearXNG); o desligamento deve derrubar
só o que o próprio Atlas subiu; falha ao tentar subir uma dependência degrada
a experiência (o Atlas continua abrindo) em vez de bloquear o boot; a
capacidade vale tanto para `apps/cli` quanto para `apps/desktop`, com
prioridade declarada para o desktop; o opt-in é por flag/env dedicada e
explícita, não implícito a partir de config já existente (`model.provider`/
`tools.searchUrl`).

Uma descoberta feita durante o brainstorming mudou o desenho inicial: o
`Lifecycle` de `@atlas/core` **não é 1:1 com "o app abriu"** —
`apps/desktop/src/core-bridge.ts` sobe e desliga um `Atlas` inteiro
(`createAtlas`/`atlas.shutdown()`) a cada round-trip stateless (`ask`,
listar/esquecer memória), não uma vez por sessão de app. Pendurar o
auto-start/parada nos hooks `onStart`/`onShutdown` do `Lifecycle` existente
faria o Atlas subir e derrubar o Ollama/Docker a cada interação do desktop —
o oposto do pedido.

---

# Decisão

**(a) Nenhum `ResourceType` novo; o Permission Service não é tocado.** Esta
capacidade nunca vira uma Tool, nunca é escolhida pelo Planner/modelo — é
bootstrap de infraestrutura, decidido só por config fornecida pelo humano
(flag/env), nunca por argumento de `args`. É a mesma categoria que o próprio
`@atlas/model-gateway` já ocupa hoje ao chamar a API do provedor remoto sem
passar por `evaluate`/`netRoots` — assimetria já documentada na atualização
da SPEC-0055 no [ADR-0026](ADR-0026-network-access-gate.md). O portão existe
para julgar recursos que o modelo pede através de uma Tool; aqui não há
pedido do modelo a julgar.

**(b) Superfície não-genérica: duas operações nomeadas e fixas, nunca
execução de comando arbitrário.** `ensureOllamaRunning()` e
`ensureSearchContainerRunning(containerName: string)` — não um `ProcessPort`
capaz de rodar qualquer comando. Isso mantém esta capacidade estruturalmente
distinta do item ainda pendente do Roadmap 1.4 "execução de comandos sob o
Permission Service" (que seria uma Tool de comando arbitrário exposta ao
Planner, sob `confirm`) — este ADR não consome, não fecha e não reabre
aquele item.

**(c) Nova porta injetável, interna a `@atlas/core` (molde de `HttpPort`/
`GitReadPort`): `ProcessPort`.** Contrato mínimo — verificar se uma
dependência já está acessível (health-check HTTP para o Ollama, reusando
`model.baseUrl` já configurado, sem endereço duplicado; `docker inspect`/
equivalente para o container) e, se não, iniciá-la. Fake obrigatório nos
testes — nenhum teste desta plataforma spawna processo real ou toca Docker,
mesma disciplina que `HttpPort`/`SearchPort` já seguem para rede.

**(d) O dono não é o `Lifecycle` existente de `createAtlas`.** É uma unidade
nova e independente — `createDependencyManager` (nome de trabalho, a SPEC
decide o final), exportada por `@atlas/core` ao lado de `createLifecycle`,
com `ensure(config)`/`release()` — chamada **uma única vez** por cada app no
seu próprio ponto real de entrada/saída, nunca a cada `createAtlas()`:

- `apps/cli`: uma vez no bootstrap do processo (`apps/cli/src/run.ts`),
  antes de despachar para qualquer comando — `ensure()` é idempotente
  (não faz nada se já está de pé) e **nunca** chama `release()`: um comando
  de tiro único (`atlas ask`) não deve subir e imediatamente derrubar o
  Ollama, ou o próximo comando pagaria o custo de subir de novo.
- `apps/desktop`: uma vez em `app.whenReady()` (`ensure()`) e uma vez em
  `before-quit`/`will-quit` (`release()`) do `apps/desktop/src/main.ts` —
  fora do ciclo de `createAtlas`/`core-bridge.ts`, que continua subindo e
  descendo `Atlas` por round-trip exatamente como hoje, sem nenhuma mudança.

**(e) Simetria de desligamento só faz sentido onde existe um evento real de
"fechar".** Só o `apps/desktop` derruba o que subiu (rastreio em memória, no
processo do Electron, de quais das duas dependências foram iniciadas por
esta sessão do app — nunca persistido). A CLI nunca derruba: cada invocação
é uma execução isolada sem um "fim de sessão" natural para ancorar o
desligamento. Essa assimetria é deliberada e fica documentada, não é um
descuido.

**(f) Falha ao tentar subir uma dependência degrada, nunca bloqueia o
boot.** `ensure()` não lança de um jeito que impeça o app/CLI de abrir; a
falha é avisada (linha de `atlas status`/log, análogo ao que `apps/tools`
já faz para descarte/truncagem) e a capacidade dependente se comporta
exatamente como se esta automação não existisse — a Tool `web_search`
continua ausente sem `tools.searchUrl` válido e utilizável
(SPEC-0057/D11), o Model Gateway `local` continua falhando do jeito que já
falha hoje sem Ollama. Este ADR é estritamente aditivo sobre o
comportamento fail-closed que as SPECs 0055/0057 e o Model Gateway já têm —
não abranda nenhuma validação existente.

**(g) Opt-in explícito e dedicado, fail-closed por padrão — mesmo padrão de
`writeRoots`/`netRoots`/`tools.searchUrl`.** Nada acontece sem o usuário
ligar cada automação individualmente, mesmo que `model.provider: 'local'`
ou `tools.searchUrl` já estejam configurados. O contrato exato de flag/env/
config (`AtlasConfig`) fica para a(s) SPEC(s) que implementam — mesmo
padrão de delegação que o ADR-0026 usou para o contrato técnico de
`http_get`.

**(h) Docker fica restrito a `start` de um container já existente,
provisionado pelo usuário — nunca `run`/`create`/`pull`.** Preserva D6/D8 da
SPEC-0057 intactos: o usuário continua provisionando a instância do
SearXNG; o Atlas só garante que o container que ele já criou está ligado.
Isso também limita o raio de ação do acesso ao socket do Docker (que já é,
por si, equivalente a um privilégio elevado no host) à operação mais
restrita possível.

---

# Consequências

Positivas:

- Remove o passo manual que motivou o pedido, sem inventar uma categoria de
  política nova no Permission Service — reaproveita o padrão fail-closed/
  opt-in que `writeRoots`/`netRoots`/`tools.searchUrl` já estabeleceram.
- `@atlas/permissions`, `evaluate`, `ResourceType`/`ResourceRef` e
  `isContained` saem deste ADR sem uma linha alterada — nenhuma cláusula do
  ADR-0013/ADR-0026 é reaberta.
- A responsabilidade cai dentro do que o Module Catalog já reserva ao
  Lifecycle Manager ("verificação de dependências", "ativação de
  componentes", "desligamento seguro") — nenhum módulo novo, satisfazendo a
  Etapa 3 do `ArchitectureDecisionProcess.md` ("reutilizar antes de criar").
- Testável por completo com fakes (`ProcessPort`) — nenhum teste da
  plataforma passa a depender de Docker/Ollama instalados.
- Abre caminho, sem comprometer escopo aqui, para as três SPECs nomeadas em
  "Observações".

Custos e riscos:

- **Primeira vez que o Atlas invoca processos do sistema operacional fora
  do sandbox de Tools.** Mesmo restrita a duas operações fixas (não
  execução arbitrária), é uma superfície nova de auditoria — o Artigo 7
  exige que isso fique visível (`atlas status`, log de falha), não apenas
  correto.
- **Acesso ao socket do Docker é equivalente a um privilégio elevado no
  host.** Mitigado por escopo (só `start`, nunca `run`/`exec`/`pull`/
  acesso à imagem), mas não eliminado — quem tiver esse acesso liberado ao
  processo do Atlas poderia, em tese, iniciar qualquer container já
  existente na máquina, não só o nomeado pela config. Ficará registrado
  como residual conhecido nas SPECs que implementam.
- **Dependência operacional nova mesmo em modo degradado**: o host precisa
  ter Ollama/Docker instalados para a automação ter efeito; sem eles, o
  Atlas simplesmente não consegue ajudar — mesma postura de custo assumido
  que a SPEC-0057/D6/D8 já pratica para o provedor de busca.
- **Assimetria CLI (nunca desliga) × desktop (desliga o que subiu)** precisa
  ficar bem documentada — um usuário que alterna entre as duas interfaces
  pode se surpreender com o Ollama continuando de pé depois de fechar um
  `atlas ask`, mas não depois de fechar o app desktop.
- **No desktop, o auto-start do container SearXNG não tem efeito prático
  nesta fatia**: o desktop ainda não expõe `netRoots`/`tools.searchUrl`
  (decisão consciente das SPECs 0055/D17 e 0057/D15) — o container pode
  estar de pé sem que nenhuma Tool do desktop o use, até a SPEC de painel
  de rede/busca (nomeada abaixo) ser entregue.

---

# Alternativas Consideradas

**Pendurar `ensure`/`release` nos hooks `onStart`/`onShutdown` do
`Lifecycle` já existente em `createAtlas`.** Foi a primeira hipótese do
brainstorming — rejeitada ao se descobrir que `apps/desktop` cria e destrói
um `Atlas` inteiro por round-trip stateless (`resolveAskSnapshot`, memória),
não uma vez por sessão de app; usar essa unidade spawnaria e derrubaria os
processos a cada interação do desktop.

**Módulo novo dedicado ("Dependency Manager"/"Process Manager"), fora de
`packages/core`.** Rejeitada pela Etapa 3 do `ArchitectureDecisionProcess.md`
("reutilizar antes de criar"): o Module Catalog já atribui "verificação de
dependências"/"ativação de componentes" ao Lifecycle Manager, hoje dentro de
`packages/core` — criar um módulo novo duplicaria uma responsabilidade já
alocada, sem nenhum dos quatro critérios do ADP para módulo novo satisfeito.

**Descentralizar: Ollama gerenciado dentro de `@atlas/model-gateway`, Docker
dentro de `@atlas/tools`.** Rejeitada — daria a dois módulos de execução
(hoje sem qualquer IO de processo do SO) autoridade para invocar o sistema
operacional, duplicaria a lógica de rastreio de ownership (item (e)) em dois
lugares em vez de um, e misturaria "consumir uma dependência" com "gerenciar
o ciclo de vida dela" no mesmo módulo — pior encapsulamento que centralizar
no Lifecycle Manager, cuja responsabilidade já é exatamente essa.

**Gatear via Permission Service, com `ResourceType: 'process'` novo.**
Rejeitada — o portão existe para julgar, de forma pura e síncrona, um
`ActionRequest` que uma Tool declara a partir de `args` potencialmente
influenciados pelo modelo (ADR-0013). Aqui não há Tool, não há `args`, não
há decisão do Planner: seria um gate sem consumidor real do lado que o
ADR-0013 desenhou para julgar. Adicionar `ResourceType` sem um caminho de
Tool que o exercite contradiria o motivo original de `evaluate` existir.

**Auto-start implícito a partir de config já existente (`model.provider ===
'local'` / `tools.searchUrl` setado), sem flag dedicada.** Rejeitada pelo
usuário explicitamente durante o brainstorming: quer opt-in separado e
visível para esta ação específica, mesmo padrão fail-closed que
`writeRoots`/`netRoots`/`tools.searchUrl` já praticam — configurar uma
capacidade não deveria implicitamente conceder outra (mesmo raciocínio que
a SPEC-0057/D9 já usou para recusar o host do provedor de busca ser
implicitamente permitido por `tools.searchUrl` estar configurado).

**Sempre derrubar processos ao fechar qualquer coisa, inclusive comandos
CLI individuais.** Rejeitada — mataria a utilidade prática da automação:
resubir o Ollama a cada `atlas ask` reintroduziria a latência de carregar o
modelo que o pedido original queria eliminar.

---

# Observações

- Este ADR resolve só a **arquitetura de gerência de processo** — dono,
  granularidade, simetria, modo de falha, e por que isto fica fora do
  Permission Service. O contrato técnico exato (nomes de flag/env, schema
  em `AtlasConfig`, forma exata do `ProcessPort` e seu fake, mensagens de
  erro, formato da linha em `atlas status`) fica delegado à(s) SPEC(s) que
  implementam — mesmo padrão de delegação que o ADR-0026 usou para o
  contrato técnico de `http_get`.
- Três SPECs candidatas foram nomeadas durante o brainstorming desta
  sessão, com uma ordem sugerida (não vinculante — a priorização fina é do
  `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`):
  1. **Desktop ganha painel de rede/busca** (`netRoots`/`tools.searchUrl`
     pela GUI, molde exato do [SPEC-0038](../implementation/specs/SPEC-0038-desktop-permission-roots-gui.md))
     — consome só o [ADR-0026](ADR-0026-network-access-gate.md), já
     `Accepted`; **não depende deste ADR**. Reabre conscientemente D17
     (SPEC-0055) e D15 (SPEC-0057).
  2. **Auto-start do Ollama**, CLI e desktop — consome este ADR.
  3. **Auto-start do container SearXNG**, CLI e desktop — consome este ADR;
     no desktop, só tem efeito prático depois de (1) entregue.
- Não reabre nenhuma cláusula do [ADR-0013](ADR-0013-permission-service-execution-gate.md)
  (portão puro, `evaluate` síncrono) nem do [ADR-0026](ADR-0026-network-access-gate.md)
  (rede). Diff esperado, quando as SPECs acima forem implementadas: `@atlas/core`
  (unidade nova + `ProcessPort`), `apps/cli`, `apps/desktop/src/main.ts`. Diff
  vazio esperado em `@atlas/permissions`, `@atlas/runtime`, `@atlas/tools`,
  `@atlas/model-gateway` (a não ser pela leitura de `model.baseUrl` já
  pública, sem mudança de contrato).

---

# Atualização ([SPEC-0060](../implementation/specs/SPEC-0060-ollama-auto-start.md))

A SPEC-0060 entregou a **2ª SPEC candidata** nomeada acima (auto-start do
Ollama, CLI e desktop), consumindo este ADR **sem alterar nenhuma cláusula
(a)–(h)** — o contrato técnico que o ADR delegou:

- `createDependencyManager({ process?, sleep? }) → { ensure(config), release() }`
  (`@atlas/core`, nova e independente do `Lifecycle` de `createAtlas` — (d)
  confirmada: `createAtlas` sai sem uma linha alterada) + `ProcessPort`
  (`isOllamaRunning`/`startOllama`/`stopOllama`, três operações nomeadas e
  fixas — (b) confirmada) + adaptador real `nodeProcessPort()`.
- `AtlasConfig.dependencies: { autoStartOllama: boolean }` (default `false`,
  fail-closed), `--auto-start-ollama`/`ATLAS_AUTO_START_OLLAMA` na CLI (env
  inválida ⇒ `CliUsageError`) e a mesma env no desktop (env inválida ⇒
  desligado + `console.warn`, nunca lança — divergência deliberada entre as
  duas bordas, justificada por (f): a CLI pode falhar alto, a janela não
  pode arriscar não abrir).
- **(a) confirmada**: o health-check HTTP (`GET <baseUrl>/api/tags`) não
  passa por `evaluate`/`netRoots` — mesma categoria de egress do
  `@atlas/model-gateway`, já assimétrica desde a SPEC-0004/ADR-0026.
- **(c) confirmada, com um refinamento não previsto no ADR**: `ollamaBaseUrl`
  só herda `model.baseUrl` quando o provider efetivo é `'local'` — reusar
  `model.baseUrl` incondicionalmente (como o texto original de (c) sugeria)
  sondaria o host de um provider `remote` de terceiro; a SPEC corrigiu isso
  na 2ª rodada de revisão, sem reabrir a cláusula.
- **(e) confirmada**: só o desktop desliga o que subiu (`before-quit`),
  rastreado por um único campo privado do manager — posse é registrada no
  sucesso do `spawn`, não na prontidão, para que um daemon lento nunca fique
  órfão (achado da revisão, não previsto no texto original do ADR).
- **(g) confirmada**: nenhuma automação liga sem o opt-in explícito e
  dedicado; `model.provider === 'local'` não implica auto-start.
- Zero linha em `@atlas/permissions`/`@atlas/runtime`/`@atlas/tools`; diff em
  `@atlas/model-gateway` limitado à exportação de `OLLAMA_DEFAULT_BASE_URL`
  (já pública em valor, sem mudança de comportamento).
- Não fecha o item 1.4 do Roadmap. Desbloqueia a **3ª SPEC candidata**
  (auto-start do container SearXNG) — ainda não implementada.

---

# Atualização ([SPEC-0061](../implementation/specs/SPEC-0061-search-container-auto-start.md))

A SPEC-0061 entregou a **3ª e última SPEC candidata** nomeada acima
(auto-start do container Docker do provedor de busca, CLI e desktop),
consumindo este ADR **sem alterar nenhuma cláusula (a)–(h)** — com ela, o
ADR fica inteiramente consumido; nenhuma cláusula restante fica sem
implementação.

- `ProcessPort` (`@atlas/core`) estendida de forma aditiva com três
  operações nomeadas e fixas sobre `search-container`
  (`inspectSearchContainer`/`startSearchContainer`/`stopSearchContainer` —
  (b) confirmada: nenhuma operação genérica de execução de comando) e
  adaptador real em `nodeProcessPort()`; `createDependencyManager` passa a
  cuidar das duas dependências no mesmo `ensure(config)`/`release()`
  ((d) confirmada: `createAtlas`/`Lifecycle` seguem sem uma linha alterada).
  `DependencyReport.outcomes` passa a carregar **sempre exatamente dois**
  elementos, em ordem pinada (`'ollama'` primeiro), tratados
  sequencialmente e de forma independente.
- `AtlasConfig.dependencies.autoStartSearchContainer: string` (default
  `''`, fail-closed) — opt-in **nominal**, não booleano: diferente do
  Ollama, o container não tem identidade default, então "se" e "qual" se
  fundem no mesmo campo. `--auto-start-search-container <nome>`/
  `ATLAS_AUTO_START_SEARCH_CONTAINER` na CLI (valor inválido ⇒
  `CliUsageError`) e a mesma env no desktop (valor inválido ⇒ desligado +
  `console.warn`, nunca lança — mesma divergência deliberada de (f) já
  confirmada pela SPEC-0060).
- **(h) rastreada operação a operação, por escrito** (a leitura literal de
  (h) só nomeia `start`): `docker inspect --type container --format
  '{{.State.Running}}' <nome>` deriva de **(c)** (health-check pela porta
  injetável) mais **(h)** (escopo restrito ao container nomeado, `--type
  container` fecha a ambiguidade do `inspect` sem tipo); `docker start
  <nome>` deriva de **(h)**; `docker stop <nome>` deriva de **(e)**
  (desligamento simétrico do que o Atlas subiu), **não** de (h). Nenhuma
  operação destrutiva (`run`/`create`/`pull`/`build`/`exec`/`rm`/`kill`/
  `compose`) é autorizada por (e) nem por (h) — o Atlas nunca cria, baixa
  ou remove um container; um nome desconhecido (`docker inspect` saindo
  `!= 0`) é sempre falha reportada, nunca convite a provisionar.
- **(e) confirmada, mesmo molde do Ollama**: posse do container é
  registrada no sucesso do `start`, não na prontidão — preservada mesmo em
  `'failed'/'timeout'`, para que um container lento a assentar nunca fique
  órfão ao fechar a janela; só o desktop desliga o que a própria sessão
  ligou, cada dependência com captura própria (a falha de uma nunca impede
  a outra).
- **(g) confirmada**: o opt-in não deriva de `tools.searchUrl` estar
  configurado (SPEC-0057) nem o contrário — as duas capacidades são
  independentes por decisão explícita.
- **(a) confirmada, com um residual nomeado e não fechado**: ligar o
  container **não** concede `netRoots` — o host do endpoint de busca
  continua exigindo autorização explícita (`--allow-net`/painel da
  SPEC-0059); configurar uma capacidade não concede outra.
- Zero linha em `@atlas/permissions`/`@atlas/runtime`/`@atlas/tools`/
  `@atlas/model-gateway`; diff em `apps/desktop` confinado a
  `core-bridge.ts`/`main.ts` (D15 — sem painel/canal IPC novo, mesmo
  precedente residual da SPEC-0060, fechado no eixo de rede pela SPEC-0059).
- Não fecha o item 1.4 do Roadmap (resta a execução de comandos sob o
  Permission Service, `ADR primeiro`). **Este ADR está agora inteiramente
  consumido** — as três SPECs candidatas nomeadas em "Observações" foram
  todas implementadas (SPEC-0059, SPEC-0060, SPEC-0061).

---

# Atualização ([SPEC-0062](../implementation/specs/SPEC-0062-desktop-dependency-autostart-default.md))

A SPEC-0062 estendeu de forma **aditiva** o contrato técnico deste ADR, sem
abrir nenhuma cláusula nova nem nomear nenhuma SPEC candidata nova — o ADR
segue **inteiramente consumido**, tal como a SPEC-0061 o deixou.

- `DependencyManager` ganha `ensureSearchContainer(container: string):
  Promise<DependencyOutcome>` — **operação nomeada e fixa** sobre o mesmo
  `ProcessPort` (**(b) confirmada**: continua sem existir `run(command,
  args)` genérico); delega ao mesmo caminho privado que o `ensure` de
  bootstrap já usava para o container (nenhuma lógica duplicada), e nunca
  toca o caminho do Ollama.
- Posse do container passa de um campo único para um `Set<string>` — a
  sessão pode ligar mais de um nome (bootstrap **e** o gesto de GUI que o
  [ADR-0028](ADR-0028-desktop-dependency-autostart-default.md) autorizou);
  `release()` continua desligando **só** o que a própria instância possui,
  cada nome com captura própria (**(e) confirmada**, agora estendida a um
  conjunto em vez de um valor único), e passa a **drenar o trabalho em
  voo** (`Promise.allSettled` sobre o `pending` do `ensure` e as tentativas
  de container ainda não assentadas) antes de ler a posse — sem isso, um
  `ensureSearchContainer` disparado pela GUI e ainda em polling no instante
  do `before-quit` registraria posse num conjunto já limpo, deixando um
  container do Atlas de pé.
- **(d) confirmada**: `createAtlas`/`Lifecycle` seguem sem uma linha
  alterada — o gesto novo vive inteiramente dentro do `DependencyManager`
  já existente, nenhum segundo dono.
- **(h) confirmada**: nenhuma operação Docker além de
  `inspect`/`start`/`stop` do container nomeado; o Atlas continua nunca
  criando, baixando ou removendo um container, também pelo gesto de GUI.
- **(g) recebe supersessão parcial, mas só pela mão do ADR-0028 — não por
  este ADR nem por esta SPEC.** Para o Ollama, o desktop passa a resolver
  `autoStartOllama` com repouso `true` (opt-in por env vira via de
  *desligamento*, não de ligação) — supersessão já decidida e delimitada
  pelo ADR-0028(i), restrita a `apps/desktop`. Para o container de busca,
  (g) segue **intacta**: `autoStartSearchContainer` continua fail-closed,
  `''` = desligado, nenhum nome é adivinhado — o que a SPEC-0062 entrega é
  só uma **segunda porta de entrada** (o campo no painel da SPEC-0059) para
  o mesmo opt-in explícito, nunca um novo default.
- Zero linha em `@atlas/permissions`/`@atlas/runtime`/`@atlas/tools`/
  `@atlas/model-gateway`/`apps/cli/src`; `@atlas/contracts` intocado.

---

# Atualização ([SPEC-0063](../implementation/specs/SPEC-0063-desktop-model-provisioning.md))

A SPEC-0063 estendeu a `ProcessPort` de forma **aditiva**, com uma operação
**nomeada e fixa** a mais (`pullOllamaModel`), sem abrir nenhuma cláusula
nova nem nomear nenhuma SPEC candidata — o estado "inteiramente consumido"
do ADR (alcançado pela SPEC-0061) não muda.

- **(b) confirmada**: `pullOllamaModel(request: ModelPullRequest):
  Promise<ModelPullOutcome>` é mais uma operação nomeada e fixa sobre o
  `ProcessPort` — nenhum `run(command, args)` genérico é introduzido; a
  divergência de **forma** em relação ao esboço posicional do ADR-0029(b)
  (um objeto com `signal`/`onProgress`, não parâmetros posicionais) é
  decisão explícita da SPEC, registrada na sua própria nota de atualização.
- **(h) permanece intacta**: nenhuma operação Docker nova é introduzida por
  esta fatia — o download de modelo é uma categoria de recurso distinta
  (arquivo do modelo servido pelo próprio Ollama, não um container), e a
  proibição de `pull`/`create`/`run` de container Docker segue exatamente
  onde estava.
- **(e) estendida**: `release()` passa a abortar (`AbortController`) um
  download de modelo em voo **antes** de drenar o trabalho pendente das
  duas dependências já existentes — sem isso, o `before-quit` esperaria um
  download de vários GB. Não há posse a desfazer sobre um modelo baixado
  (ele é do usuário, não da sessão), então a extensão é só a ordem do
  abort, não uma terceira categoria de posse.
- Zero linha em `@atlas/permissions`/`@atlas/runtime`/`@atlas/tools`/
  `@atlas/model-gateway`/`apps/cli/src`; `@atlas/contracts` intocado.
