# ADR-0015 — Observação: laço de replanejamento determinístico no Cognitive Core

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-19

---

# Contexto

O [ADR-0012](ADR-0012-planner-runtime-execution.md) introduziu a espinha de execução: o Cognitive Core orquestra Planejamento + Execução num **passe único** — 1ª chamada `generate` (prompt composto + instrução do Planner) → `planner.parse` → `runtime.execute` → 2ª chamada `generate` de composição. Essa orquestração foi fatorada no helper interno `runPlanCycle` e, desde a [SPEC-0014](../implementation/specs/SPEC-0014-tools-confirm-in-chat.md), é compartilhada por `ask` **e** `respond`. O ADR-0012 registrou explicitamente que iteração/replanejamento ficou **fora de escopo** ("passos independentes; grafo de dependências / threading de dados é fatia futura"), e o Runtime executa o plano **uma única vez, sem reavaliação**.

O [Cognitive Lifecycle](../03-architecture/CognitiveLifecycle.md) define sete etapas. Seis já existem em alguma forma; a **Etapa 5 — Observação** ("avaliar o resultado da execução: sucesso, falhas, inconsistências, impactos, necessidade de novas ações; caso necessário, o ciclo poderá retornar ao planejamento") **ainda não tem contraparte na implementação**. Este é o item **1.2 (Fechar o Ciclo Cognitivo) — Observação** do [Roadmap](../04-engineering/Roadmap.md), marcado como `gate · ADR primeiro`: introduzir o laço reavaliação → replanejamento **revisita a fronteira estrutural do ADR-0012** ("execução única, passe único"), por isso é registrado como ADR próprio, não como nota de atualização.

O [Module Catalog](../03-architecture/ModuleCatalog.md) **não reserva um módulo separado** para Observação. Ele já enquadra o replanejamento como colaboração entre componentes existentes: o **Runtime** "produz solicitações de replanejamento" (as falhas estruturadas que já emite hoje como `ExecutedStep` com erro), o **Cognitive Core** é "utilizado por mecanismos de replanejamento", e o **Planner** participa de "processos de replanejamento". O Artigo 4 da Constituição reforça: o Cognitive Core é o **único orquestrador estratégico** — é ele quem decide voltar ao Planejamento.

A pergunta central: **como fazer a Observação existir como etapa própria — reavaliar a execução e reiniciar o ciclo quando necessário — sem tornar o observador um adivinhador semântico caro, sem borrar a fronteira Observação/Planejamento, e sem risco de laço infinito?**

---

# Decisão

**A Observação é uma decisão determinística e pura no Cognitive Core; o replanejamento é feito pelo modelo.** Nenhum package novo, nenhum módulo novo. A etapa Observação passa a existir como uma **função pura** em `@atlas/cognitive` (espelhando o Planner, que já é puro, consolidado ali e testável sem gateway), e o `runPlanCycle` deixa de ser um passe único e vira um **laço limitado**.

**O observador é determinístico e julga apenas fatos estruturais que o Runtime já produz.** A função `observe(executionResult) → Observation` inspeciona os `ExecutedStep` do último passe e produz um veredicto `{ verdict: 'complete' | 'replan' }`:

1. Se **algum passo falhou por erro de Tool** (exceção ou erro de IO convertido pelo Runtime num `ExecutedStep` de erro) → `replan`.
2. Bloqueio por permissão (`blocked`) e recusa do usuário no `confirm` são **terminais** → não disparam replanejamento (`complete`). Replanejar não concede permissão que a política negou, nem reverte um "não" explícito do usuário — reiniciar o ciclo nesses casos só desperdiçaria orçamento e desrespeitaria a decisão já tomada.

O observador **não** chama o modelo: a avaliação semântica de inconsistências/impactos ("o resultado faz sentido?") é território do modelo e fica como fatia futura documentada. Esta fatia fecha o laço sobre o sinal **objetivo e verificável** que já existe (falha de Tool), mantendo o Model Gateway **intacto** e o custo de chamadas mínimo.

**A distinção "terminal × falha de Tool" é carregada por um discriminador estruturado no contrato, não parseada de strings.** O Runtime já **conhece** a causa de cada passo negado — são branches distintos do código — mas hoje a joga numa string livre de `error` (`ExecutedStep.result.error`). Reconstruir essa distinção parseando a redação da mensagem acoplaria `@atlas/cognitive` a um detalhe interno de `@atlas/runtime`, ferindo o Artigo 4 (módulos se comunicam por contratos, não por detalhes internos). Por isso o `ExecutedStep` (em `@atlas/contracts`) ganha **um campo opcional discriminador** — `denialKind?: 'blocked' | 'declined'` — que o Runtime marca **exclusivamente** nos dois branches de política/consentimento: `blocked` quando o Permission Service nega (veredicto ≠ `allowed`/`confirm`), `declined` quando o usuário recusa o `confirm`. Todo o resto de `ok: false` — Tool que lançou, Tool que devolveu `ok: false` (erro de IO, contenção-no-uso/TOCTOU da SPEC-0017), e **ferramenta desconhecida** — fica **sem** `denialKind`, e o observador o trata como **falha de Tool → replan**. Regra do observador: `replan` se houver algum passo `ok: false` **sem** `denialKind`; caso contrário, `complete`.

**Os dois casos-limite ficam resolvidos por essa regra.** *Ferramenta desconhecida* (o modelo referenciou um nome inexistente) **replana** — é um defeito de plano que o modelo pode corrigir com o feedback da falha, e o teto=1 limita o laço. *Contenção-no-uso/TOCTOU* (negação de segurança que emerge como `ok: false` da Tool) **replana** — a operação já foi corretamente negada no instante do uso; o replan apenas concede mais uma tentativa, igualmente gated, sem abrir brecha, e limitada pelo teto. Ambos são "a tentativa da Tool falhou", não "a política/consentimento barrou antes de tentar".

**O laço é limitado por uma constante embutida — no máximo 1 replanejamento (até 2 passes de plano/execução).** O `runPlanCycle` passa a operar assim:

1. `generate` (prompt composto + instrução do Planner) → `parse` → plano ou `null`.
2. Sem plano → resposta direta em 1 chamada (comportamento atual, **zero regressão**; testes anteriores passam inalterados).
3. Com plano → `runtime.execute` → `observe`.
4. `observe` = `replan` **e** ainda há orçamento → nova chamada `generate` de replanejamento, que recebe um **resumo compacto das falhas** do passe anterior (mesmo padrão da mensagem `system` compacta introduzida na SPEC-0014) → novo `parse` → `runtime.execute` → `observe`.
5. `observe` = `complete`, **ou** orçamento esgotado, **ou** o replanejamento não produziu plano (`parse → null`) → chamada `generate` de **composição** com todos os resultados acumulados.

O laço **nunca lança e nunca itera sem limite**: o teto fixo garante terminação; qualquer resultado de `observe` diferente de `replan`-com-orçamento cai na composição final.

**O tipo `Observation` é interno ao `@atlas/cognitive`.** Sem segundo consumidor, ele **não sobe a `@atlas/contracts`** (mesmo critério aplicado a `FsReadPort`/`FsWritePort`/`ConfirmPort`/`PathResolverPort`). A transparência já existente cobre o resto: os `steps` de `AskResult`/`ConversationTurn` passam a **acumular os passos de todos os passes** (concatenados na ordem de execução), de modo que o traço mostra o retry sem mudança de assinatura pública nem código novo de renderização no CLI (`renderSteps` reusado).

**A única mudança em `@atlas/contracts` é o campo opcional `ExecutedStep.denialKind?: 'blocked' | 'declined'`** descrito acima — aditivo e retrocompatível (opcional; código existente que constrói `ExecutedStep` sem ele segue válido). É o mínimo necessário para que a classificação do observador seja estrutural, não textual.

**O Planner, o Permission Service, as Tools e o Model Gateway permanecem intactos; o Runtime muda de forma mínima e localizada.** A alteração no Runtime é **só** marcar `denialKind` nos dois branches que já produzem o passo negado (bloqueio de permissão → `'blocked'`; recusa no `confirm` → `'declined'`) — nenhuma mudança de fluxo, ordem ou semântica de execução. O Runtime já emitia essas falhas estruturadas ("solicitações de replanejamento", na linguagem do Module Catalog); agora as rotula. O Planner já produz plano a partir da instrução + saída do modelo; a novidade de orquestração (o laço) é inteiramente do Cognitive Core — o único componente autorizado a decidir voltar ao Planejamento. O laço vale para `ask` **e** `respond`, por ser o `runPlanCycle` compartilhado (consistente com a SPEC-0014).

---

# Consequências

Positivas:

- **A Etapa 5 (Observação) do Cognitive Lifecycle passa a existir na implementação** — o ciclo deixa de ser um passe único; falha de Tool pode reiniciar o Planejamento com o contexto do que falhou.
- **Padrão do projeto preservado.** O observador é puro e testável sem gateway, exatamente como o Planner; a fronteira de autoridade do ADR-0012 sobrevive (Cognitive orquestra, Planner transforma, Runtime executa) — só ganhou um laço.
- **Raio de mudança pequeno e localizado.** O grosso é `@atlas/cognitive` (o observador puro + o laço em `runPlanCycle`; reuso de `renderSteps` no CLI, sem código novo). Fora dele, só **duas** adições cirúrgicas: o campo opcional `ExecutedStep.denialKind` em `@atlas/contracts` (aditivo/retrocompatível) e a rotulagem desse campo nos dois branches de negação do Runtime. Planner, Permission Service, Tools e Model Gateway ficam inalterados.
- **A classificação do observador é estrutural, não textual.** `@atlas/cognitive` decide replan lendo `denialKind`, sem depender da redação das mensagens de erro do Runtime — o Artigo 4 é preservado (comunicação por contrato, não por detalhe interno).
- **Terminação garantida e barata.** Teto fixo de 1 replan; o observador é determinístico (sem chamada de modelo para observar). O único custo adicional de modelo é a chamada de replanejamento, e só quando uma Tool de fato falhou.
- **Honesto sobre "não".** Bloqueio de permissão e recusa do usuário não reiniciam o ciclo — a política e o consentimento do usuário são respeitados, não contornados por retry.

Custos e riscos:

- **Observação determinística é parcial.** Inconsistências semânticas ("a Tool retornou sucesso, mas o resultado não resolve o objetivo") **não** são detectadas nesta fatia — só falhas estruturais. O observador guiado por modelo fica como fatia futura documentada; é uma limitação consciente, não um gate novo.
- **Teto fixo, não configurável.** 1 replan pode ser pouco para tarefas encadeadas complexas. Tornar o teto configurável (`flags > env > default`) é fatia futura (YAGNI aqui); a constante é documentada.
- **Replanejamento depende do modelo mudar o plano dado o contexto da falha.** Se o modelo reemitir o mesmo plano, o segundo passe falha igual e o laço termina na composição com as falhas — comportamento seguro, mas sem ganho. Mitigado pelo resumo compacto das falhas injetado na chamada de replanejamento.
- **`steps` cresce.** Com replan, o traço acumula os passos dos dois passes; o CLI mostra a execução repetida. É transparência desejada (o usuário vê que houve retry), ao custo de um traço mais longo.

---

# Alternativas Consideradas

**Observador guiado por modelo (3ª chamada `generate` para avaliar e decidir).** Mais fiel ao "avaliar inconsistências/impactos" do Lifecycle — o modelo julgaria semanticamente se o resultado resolve o objetivo. Rejeitada nesta fatia: custa uma chamada de modelo extra **por ciclo** (mesmo quando tudo deu certo), borra a fronteira Observação/Planejamento (o julgamento semântico se confunde com estratégia) e depende de o modelo emitir um veredicto parseável. A avaliação determinística sobre falha estrutural é a menor fatia que faz a etapa **existir** honestamente; o observador semântico é uma evolução futura, não o primeiro passo.

**Módulo novo `packages/observation`.** Daria à etapa um package próprio, simétrico a `packages/permissions`. Rejeitada: o Module Catalog **não** reserva esse módulo e enquadra o replanejamento como colaboração entre Runtime (produz falhas), Cognitive (decide) e Planner (replaneja); o Artigo 4 põe a decisão de reiniciar no Cognitive Core. Criar package seria fronteira nova sem respaldo do catálogo — contraria "não crie módulos sem documentação correspondente" (Artigo 3). O observador puro consolidado em `@atlas/cognitive` segue o precedente do Planner (ADR-0012).

**Laço no Runtime (o Runtime reexecuta/replaneja sozinho).** O Runtime tem o `ExecutionResult` na mão. Rejeitada: replanejar é **decisão estratégica** (Artigo 4 — exclusiva do Cognitive Core); o Runtime "não redefine o objetivo, não toma decisões estratégicas" (Module Catalog e ADR-0013). O Runtime **produz** a solicitação de replanejamento (falha estruturada); quem a **consome e decide** é o Cognitive.

**Replanejar também em bloqueio de permissão.** O modelo poderia tentar outro caminho dentro das raízes permitidas. Rejeitada nesta fatia: amplia a superfície de laços improdutivos (o modelo insistindo em caminhos fora do sandbox) e mistura "a Tool falhou" com "a política negou" — sinais de natureza distinta. Só falha de Tool dispara replan; bloqueio é terminal. Reconsiderável em fatia futura, se surgir necessidade concreta.

**Teto configurável por flag/env já nesta fatia.** Alinharia ao padrão de config do projeto (ADR-0006). Rejeitada por YAGNI: amplia a fatia (validação, CLI, testes de precedência) sem necessidade comprovada; a constante embutida de 1 replan faz o laço existir e é trivial de promover a config quando houver demanda.

**Sem teto (laço até `complete`).** Máxima fidelidade ao "retornar ao planejamento sempre que necessário". Rejeitada: risco de laço infinito / custo de modelo ilimitado se o modelo nunca corrige o plano. O teto fixo é uma barreira de segurança inegociável nesta primeira fatia.

**Classificar por casamento das strings de erro do Runtime (sem mexer no contrato).** Preservaria a intenção original deste ADR de deixar `@atlas/contracts` e o Runtime intactos: o observador reconheceria os marcadores textuais dos casos terminais (`'ação cancelada pelo usuário'`, `'ação não permitida'`, etc.), eventualmente extraídos em constantes compartilhadas. Rejeitada: acopla `@atlas/cognitive` à **redação** das mensagens de `@atlas/runtime` — um detalhe interno, não um contrato (fere o Artigo 4). Uma edição inócua de mensagem no Runtime passaria a reclassificar silenciosamente um bloqueio como replan. O campo `denialKind` custa duas adições cirúrgicas e torna a distinção — que o Runtime **já conhece** — um dado de primeira classe, em vez de reconstruí-la por heurística frágil. O ganho de manter o contrato "intacto" não compensa a dívida de acoplamento.
