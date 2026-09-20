# ADR-0029 — Instalação assistida de modelo local no desktop

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-09-19

---

# Contexto

Na mesma sessão que originou o [ADR-0028](ADR-0028-desktop-dependency-autostart-default.md),
o usuário pediu, além do auto-start sempre-ativo do Ollama: *"caso não
tenha um modelo instalado, [o Atlas] dá a opção de instalar e dá opções"*.

O `spec-drafter`, ao tentar desenhar a SPEC diretamente, escalou este pedaço
do pedido separadamente do auto-start (ver relatório da sessão): é
capacidade **inédita**, maior em superfície do que uma inversão de default —
exigiria operações novas de download na `ProcessPort` (`pull`, categoria que
o [ADR-0027](ADR-0027-external-process-lifecycle-management.md)(h) já havia
proibido explicitamente no eixo Docker, por analogia levantando a mesma
pergunta para o Ollama); um catálogo de modelos vindo de algum lugar (mais
uma instância do residual de egress do
[ADR-0026](ADR-0026-network-access-gate.md)); e, sobretudo, **não tem
requisito correspondente no PRD** — o mais próximo é "simplicidade para o
usuário" (critério de qualidade, não requisito funcional) e "a plataforma
deverá ser projetada para permitir expansão para outros perfis de usuários"
(Público-Alvo). Pedido sem base no PRD é escalação obrigatória pela Emenda
v1.1, mesmo antes de chegar à pergunta de ADR.

O usuário aprovou tratar isso como uma segunda decisão, sequencial ao
ADR-0028/SPEC-0062 (já `Done`), e respondeu, em brainstorming nesta sessão:

- a confirmação de instalar já é o próprio gesto de escolher um modelo na
  lista e confirmar — sem um segundo diálogo modal —, mas o tamanho estimado
  do download deve aparecer **antes** de a transferência começar;
- o catálogo oferecido é uma **lista curada e fixa** (não uma consulta
  dinâmica a um registry de terceiro) — nome, tamanho e descrição por
  modelo, decididos pelo Atlas, não pelo usuário nem por uma API externa;
- a capacidade é **só desktop** nesta fatia — quem usa a CLI já sabe rodar
  `ollama pull <modelo>` sozinho;
- o gatilho é **proativo**: o desktop detecta a ausência de qualquer modelo
  instalado na abertura do app, antes que o usuário precise tentar
  conversar e tomar o erro que motivou o pedido original.

---

# Revisão do PRD (pré-condição desta decisão)

A Emenda v1.1 trata "pedido sem base no PRD" como escalação, não como
motivo para recusar a decisão em si — o processo correto é **revisar o PRD
primeiro**, de forma consciente e documentada, não implementar por cima de
uma lacuna. `docs/02-product/ProductRequirementsDocument.md` ganha uma nova
subseção em **Requisitos Funcionais**, no mesmo nível de "Observabilidade do
Ambiente" (que a SPEC-0054 já usou como precedente para uma necessidade de
produto sem seção prévia dedicada):

> ## Provisionamento de Ambiente Local
>
> O sistema deve auxiliar o usuário a preparar os componentes locais
> necessários para funcionar, incluindo a instalação assistida de modelos de
> IA locais, quando esses componentes não estiverem disponíveis.
>
> Essa assistência deve ser opcional e nunca automática sem uma ação
> explícita do usuário — instalar um componente local é diferente de
> apenas iniciá-lo.

Este texto é deliberadamente abstrato (o que o produto oferece), sem
mencionar Ollama, Docker ou qualquer detalhe de implementação — mesmo
registro do resto do PRD. A frase final distingue explicitamente esta
capacidade (instalar) do que o ADR-0027/0028 já cobrem (iniciar um processo
já instalado) — são categorias de risco diferentes, tratadas por ADRs
diferentes.

---

# Decisão

**(a) O dono continua sendo o Lifecycle Manager (`@atlas/core`) — nenhum
módulo novo.** O Module Catalog já atribui "verificação de dependências" e
"ativação de componentes" a este módulo; provisionar (instalar) é uma
extensão natural de verificar/ativar, não uma responsabilidade nova. Mesma
aplicação da Etapa 3 do `ArchitectureDecisionProcess.md` que o ADR-0027 já
fez.

**(b) Nova operação nomeada e fixa na `ProcessPort`:
`pullOllamaModel(baseUrl, modelName, onProgress?)` — nunca um verbo
genérico de "instalar pacote".** Preserva a cláusula (b) do ADR-0027
("superfície não-genérica: operações nomeadas e fixas, nunca execução de
comando arbitrário"): o nome do modelo é validado contra o catálogo fixo
(Decisão (e)) antes de qualquer chamada à porta — a Tool nunca recebe um
nome de modelo livre vindo de `args`/Planner, porque isto não é uma Tool
(mesma Decisão (a) do ADR-0027: bootstrap de infraestrutura decidido só por
gesto humano explícito na GUI).

**(c) `pullOllamaModel` não é a mesma categoria que a proibição de Docker
`pull` no ADR-0027(h).** O ADR-0027(h) proíbe `pull`/`create`/`run` de
**container Docker** porque o Atlas não deve provisionar infraestrutura de
terceiro que o usuário não escolheu — o container do SearXNG é responsabilidade
do usuário. Aqui é o oposto: o usuário está pedindo explicitamente para o
Atlas provisionar **o próprio modelo que o Atlas usa para funcionar**, de um
catálogo que o próprio Atlas cura. A cláusula (h) do ADR-0027 não é reaberta
nem contrariada — ela continua proibindo `pull` de container; esta é uma
categoria de recurso diferente (peso de modelo, não container), com dono e
gatilho diferentes.

**(d) Detecção de "nenhum modelo instalado" reaproveita a chamada HTTP que
já existe, sem round-trip novo.** `GET <baseUrl>/api/tags` (o mesmo
health-check que `isOllamaRunning` já faz, [ADR-0027](ADR-0027-external-process-lifecycle-management.md)(c))
devolve `{ models: [...] }` — hoje o corpo é descartado, só `response.ok` é
lido. A extensão lê `models.length === 0` do mesmo corpo já obtido. Nenhuma
nova chamada de rede é introduzida só para checar presença de modelo.

**(e) Catálogo curado e fixo, sem chamada de rede para montá-lo — dado, não
código de decisão, mora em `apps/desktop` (não em `@atlas/core`).** Mesma
regra de tipos/dados locais ao app que a SPEC-0059/SPEC-0062 já seguem
(promoção a pacote compartilhado só com 2º consumidor real — hoje só o
desktop tem GUI para isto). O catálogo é uma constante: nome técnico
(`modelo:tag` do Ollama), tamanho aproximado, descrição curta em português.
Atualizar o catálogo é uma mudança de dado revisável por PR, não uma
capacidade de descoberta em runtime.

**(f) Confirmação é o próprio gesto — sem diálogo nativo novo, mas com
tamanho exibido antes do download começar.** Mesmo raciocínio da SPEC-0062/D7
para o container de busca: clicar "Instalar" numa lista onde o tamanho já
está visível **é** o consentimento explícito (Artigo 8) — reusar
`ConfirmPort`/`showMessageBox` consentiria pelo mesmo mecanismo que já serve
Tools destrutivas, misturando duas categorias de risco diferentes.

**(g) Progresso via leitura síncrona por polling, não canal de push
(`webContents.send`) novo.** A API de pull do Ollama devolve um stream de
linhas JSON (`{status, completed, total}`); o main process acumula o último
progresso conhecido em memória (mesmo formato leitura-síncrona de
`readDependencyStatus`/`readTokenUsage`, SPEC-0054/0062), e o renderer faz
polling enquanto o download está em voo — **não** consome o canal de push
genérico que o `NEXT_CONTEXT.md` lista como candidato separado do Roadmap
("Canal de push avisando o renderer quando o trabalho abandonado assenta").
Escopo deliberadamente menor: aquele candidato resolve um problema
diferente (notificar trabalho **abandonado**, não progresso de um download
**em curso e visível na mesma janela**).

**(h) Cancelamento é local a este gesto, via `AbortController` na própria
porta — não depende do Task Manager/cancelamento cooperativo geral, ainda
em aberto no Roadmap.** Um download de vários GB precisa ser cancelável; a
cláusula não colide com o item pendente "Cancelamento cooperativo real no
Runtime/Task Manager" porque aquele item é sobre planos de Tool executados
pelo Runtime — esta é infraestrutura de bootstrap fora do Runtime, mesma
categoria de exclusão que a Decisão (a) do ADR-0027 já estabeleceu.
Cancelar interrompe a conexão HTTP; o Ollama decide por conta própria o que
fazer com bytes parciais já recebidos (fora do controle/responsabilidade do
Atlas).

**(i) Falha degrada, nunca bloqueia — mesma cláusula (f) do ADR-0027.** Uma
instalação que falha (rede caiu, disco cheio, Ollama parou no meio) deixa o
app funcionando exatamente como funcionava antes da tentativa; o erro é
mostrado na própria tela do catálogo, com opção de tentar de novo — nunca
um estado que impeça o resto do app de abrir/funcionar.

**(j) Nada é feito automaticamente sem gesto humano — mesmo padrão
fail-closed do ADR-0027(g)/ADR-0028.** Detectar "nenhum modelo instalado"
(Decisão (d)) só abre a tela de catálogo; nunca dispara um `pull` sozinho.
A escolha de instalar continua inteiramente do usuário, em qualquer
momento — o app funciona (ainda que sem conseguir responder) mesmo que o
usuário feche a tela sem instalar nada.

---

# Consequências

Positivas:

- Resolve a segunda metade do pedido original sem inventar módulo, Tool ou
  categoria de política nova — reaproveita o Lifecycle Manager e o padrão
  de leitura síncrona por polling já estabelecido pela SPEC-0054/0062.
- A detecção de "sem modelo" é essencially gratuita (mesmo round-trip que
  já existia), então não pesa no tempo de abertura do app.
- O catálogo fixo evita abrir um canal de egress novo só para listar
  opções — o único tráfego de rede novo é o download em si, que o usuário
  pediu explicitamente.
- Cancelamento e progresso ficam escopados a este gesto específico, sem
  depender de dois itens maiores do Roadmap ainda não decididos (canal de
  push genérico; cancelamento cooperativo do Task Manager) — desacopla
  esta entrega deles.

Custos e riscos:

- **Primeira vez que o Atlas inicia uma transferência de dados de vários
  gigabytes por iniciativa (ainda que só sob clique explícito) do
  usuário.** Falhas de disco cheio, rede instável ou interrupção no meio
  precisam de mensagens claras — herdado como responsabilidade desta
  decisão, detalhamento técnico exato fica para a SPEC.
- **O catálogo fixo pode ficar desatualizado** (novos modelos do Ollama não
  aparecem automaticamente) — troca deliberada por não ter egress novo de
  descoberta; manutenção do catálogo vira tarefa editorial, não técnica.
- **Progresso por polling gasta ciclos de IPC redundantes** comparado a um
  canal de push — aceito pela simplicidade e por não introduzir a
  infraestrutura de push antes dela ser decidida como capacidade geral.

---

# Alternativas Consideradas

**Consultar a API/registry do Ollama em tempo real para listar modelos
disponíveis.** Rejeitada pelo usuário explicitamente: catálogo curado fixo,
sem depender de uma fonte de terceiro cuja qualidade/tamanho o Atlas não
controla, e sem abrir um canal de egress novo só para montar uma lista.

**Também oferecer a instalação pela CLI (`atlas model install`).**
Rejeitada nesta fatia: o público que usa terminal já sabe rodar
`ollama pull` sozinho; o caso de uso "app pra todos" que motivou o pedido é
especificamente do desktop. Não fechado para sempre — pode ser candidato
futuro se o padrão de uso mostrar necessidade.

**Baixar automaticamente um modelo padrão assim que detectar ausência, sem
tela de escolha.** Rejeitada: o usuário pediu explicitamente "dá a opção...
e dá opções" — plural, com escolha — e um download de GBs sem consentimento
explícito violaria o mesmo princípio fail-closed que o ADR-0027(g) e o
ADR-0028 já estabeleceram para automações de infraestrutura.

**Canal de push (`webContents.send`) dedicado para progresso, em vez de
polling.** Cogitada porque tecnicamente mais eficiente — rejeitada por
escopo: implementaria de carona um candidato de Roadmap maior e ainda não
decidido (o canal de push genérico listado no `NEXT_CONTEXT.md`), quando o
polling já resolve este caso específico com o mesmo idioma que a
SPEC-0054/0062 já usam e já são testados.

**Reusar `ConfirmPort`/diálogo nativo para confirmar a instalação.**
Rejeitada pelo mesmo raciocínio da SPEC-0062/D7: `ConfirmPort` consente
ações destrutivas de Tools; misturar as duas categorias no mesmo mecanismo
tornaria mais difícil distinguir depois "isto foi uma Tool que o modelo
pediu" de "isto foi uma escolha de infraestrutura feita só pelo humano".

---

# Observações

- Este ADR resolve a arquitetura da capacidade — dono, categoria de risco,
  fonte do catálogo, mecanismo de progresso/cancelamento e por que isto não
  reabre o ADR-0027(h) nem depende dos dois itens maiores de Roadmap ainda
  em aberto. O contrato técnico exato (nomes de canal IPC, formato exato do
  catálogo, textos pinados, CAs) fica delegado à SPEC que implementa — mesmo
  padrão de delegação que os ADRs anteriores já usaram.
- Diff esperado quando a SPEC for implementada: `@atlas/core`
  (`ProcessPort` ganha `pullOllamaModel`, `DependencyManager` ganha o
  gesto), `apps/desktop` (catálogo, tela/modal, canais IPC, leitura de
  progresso por polling), `docs/02-product/ProductRequirementsDocument.md`
  (a subseção acima). Diff vazio esperado em `apps/cli`,
  `@atlas/permissions`, `@atlas/runtime`, `@atlas/tools`,
  `@atlas/model-gateway`, `@atlas/contracts` (catálogo e progresso são
  tipos locais ao app, sem promoção).
- Não fecha o item 1.4 do Roadmap. Não decide o canal de push genérico nem
  o cancelamento cooperativo do Task Manager — ambos seguem candidatos
  abertos, tratados aqui apenas para justificar por que esta fatia não
  depende deles.
- SPEC candidata (nome de trabalho): instalação assistida de modelo Ollama
  no desktop.

---

# Atualização ([SPEC-0063](../implementation/specs/SPEC-0063-desktop-model-provisioning.md))

A SPEC-0063 entregou o contrato técnico exato que este ADR delegou, sem
alterar nenhuma cláusula (a)–(j).

- **Substituição, não soma, para cumprir (d) sem round-trip novo:**
  `ProcessPort.isOllamaRunning` foi **substituída** por `inspectOllama`,
  sobre a MESMA requisição `GET /api/tags` do health-check já existente —
  o corpo, antes descartado, passa a ser lido para extrair a lista de
  modelos instalados. Manter as duas operações deixaria uma rota morta
  assim que o manager migrasse (a mesma armadilha de duas dependências
  independentes já registrada pela SPEC-0057/D21).
- **Onde a lista de modelos mora:** o campo `models?: readonly string[]`
  é opcional e vive dentro das DUAS variantes de `DependencyOutcome` em
  que uma inspeção bem-sucedida de fato ocorreu (`'already-running'`/
  `'started'` do Ollama) — nunca no topo do `DependencyReport`. `'disabled'`
  e `'failed'` não têm o campo, estruturalmente (provado por
  `@ts-expect-error`, não por disciplina de escrita).
- **Assinatura real de `pullOllamaModel`, divergente do esboço posicional
  da cláusula (b):** um objeto (`{ baseUrl, model, signal, onProgress }`),
  não parâmetros posicionais — o `signal` é obrigatório para cumprir (h) e
  não aparecia no esboço original; a divergência é de **forma**, o nome e
  a fixidez da operação (uma só, nomeada, nunca genérica) são preservados.
- **Nenhum texto do provedor cruza a porta** (D10): `status`, `error` e
  `digest` do NDJSON do Ollama nunca saem de `node-process-port.ts` — só
  números (`completedBytes`/`totalBytes`) e um desfecho classificado em
  um conjunto fechado (`'installed'`/`'cancelled'`/`'failed'` com `reason`
  de um enum fixo) atravessam a fronteira.
- **Superfície escolhida:** uma seção nova ("Modelos de IA") dentro do
  painel `Sistema` já existente (SPEC-0054) — nem um 8º item de drawer,
  nem modal novo. O gatilho proativo (cláusula (j)) reusa o `openDrawer()`
  e o `click()` do controle de navegação já existentes, nunca um caminho
  paralelo de abertura.
- **Quatro** canais IPC: `'atlas:models:read'` (síncrono, tick do painel),
  `'atlas:models:probe'` (único caminho assíncrono, arranque do renderer),
  `'atlas:models:install'`, `'atlas:models:cancel'`.
- **O gatilho proativo de (j) espera o bootstrap de dependências assentar**
  — via um *deferred* interno (`bootstrapProbeSettled`) resolvido no
  `finally` de `ensureExternalDependencies`, nunca por `setTimeout` de
  teto arbitrário, canal de push ou requisição HTTP nova. É espera sobre
  trabalho **já em curso** no main process, não um round-trip novo — (d)
  e (g) seguem intactas.
- Zero linha em `@atlas/permissions`/`@atlas/runtime`/`@atlas/tools`/
  `@atlas/model-gateway`/`apps/cli/src`; `@atlas/contracts` intocado
  (catálogo e progresso são tipos locais a `apps/desktop`, sem promoção).
- Não fecha o item 1.4 do Roadmap. Nenhuma cláusula (a)–(j) foi reaberta.
