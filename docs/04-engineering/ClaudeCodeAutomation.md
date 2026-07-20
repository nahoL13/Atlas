# Claude Code Automation

> **Project Atlas — Automação de Workflow no Claude Code**

Version: 1.3

Status: Documento vivo (não segue o processo de SPEC/ADR — é tooling de
workflow do Claude Code, não arquitetura da plataforma Atlas)

---

# Objetivo

Este documento descreve a automação construída dentro do Claude Code para
apoiar o processo oficial de desenvolvimento do Atlas (definido em
[Development Guide](DevelopmentGuide.md)): cinco subagents (um por fase do
ciclo de uma SPEC, mais um revisor adversarial de arquitetura e um agente de
fechamento), três skills, quatro hooks e um script de análise de custo de
token.

Nada aqui altera o processo em si — o fluxo Ideia → PRD → SPEC →
Implementação → Testes → Documentação → Review → Merge continua sendo o
mesmo. O que muda é **quem executa cada etapa dentro do Claude Code** e
**quanto cada etapa custa em tokens**, de forma rastreável.

---

# Motivação

Duas dores concretas motivaram esta automação:

1. **Sessões que terminam no meio de uma SPEC.** O limite de uso do Claude
   Code é por janela de sessão, não por SPEC. Sem visibilidade de custo, não
   dava para saber se uma SPEC cabia na sessão atual antes de começar.

2. **Consumo de tokens concentrado no modelo mais caro sem necessidade.**
   Uma primeira análise (`scripts/claude-usage-report.py`, ver abaixo) sobre
   os transcripts reais deste projeto mostrou que **72% do consumo total
   (441M de 614M tokens em 24 sessões) veio do Opus**, mesmo em trabalho
   mecânico (rodar testes, conferir checklist) que não exige o modelo mais
   caro. A maior parte do custo total, além disso, é `cache_read` — ou
   seja, contexto acumulado numa sessão longa sendo reprocessado a cada
   turno, não geração nova.

A resposta para os dois problemas é a mesma: **isolar cada fase do ciclo de
uma SPEC em um subagent com contexto próprio e modelo escolhido pelo custo
real da tarefa**, em vez de fazer tudo no fio principal com o modelo padrão.
Um subagent começa com contexto zerado (não herda o histórico acumulado da
conversa) e devolve só o resultado final — isso ataca a causa raiz do
`cache_read` alto, não só o custo por token do modelo.

Descartamos deliberadamente a ideia original (agentes para "organizar o
processo" de SPEC) — o processo já funciona bem sem agentes. O valor real
identificado foi economia de contexto/token, não orquestração.

---

# Visão geral do fluxo

Desde a **Emenda v1.1 da Constituição** (2026-07-19), o pipeline é
autônomo de ponta a ponta: um único pedido ("faz a SPEC de X") dispara a
cadeia inteira, e o fio principal atua só como **despachante magro** —
repassa relatórios entre agentes, aplica as transições de `Status` e nunca
re-narra o trabalho.

```text
"faz a SPEC de X"
        ↓
  spec-drafter (Opus)  →  Status: Draft, SEM perguntas abertas
        │                   (decide sozinho; decisões em formato de veto na SPEC)
        ↓
  architecture-reviewer (Opus)  →  GATE: aprovação autoriza Draft → Ready
        │                   veto → volta ao drafter 1×; 2º veto → ESCALA AO USUÁRIO
        ↓  (fio principal muda Status: Draft → Ready)
  spec-implementer (Sonnet)  →  código + testes
        ↓
  spec-validator (Sonnet)  →  veredicto
        │                   não pronta → volta ao implementer 1×; 2ª reprovação → ESCALA
        ↓  (fio principal muda Status: Review → Done)
  spec-closer (Sonnet)  →  lições aprendidas + docs vivas + commit + push
                           (cold-start único; lê git diff uma vez e reaproveita)
```

**Escalações obrigatórias** (o pipeline para e chama o usuário — Emenda
v1.1): emendar a Constituição; módulo novo/responsabilidade movida; ADR
novo; segundo veto do reviewer; segunda reprovação do validator; pedido sem
base no PRD. O usuário mantém override a qualquer momento.

## Ramo micro (fast-path para SPECs pequenas — Emenda v1.2, 2026-07-20)

O pipeline acima é o do **Perfil `completo`**. Uma SPEC classificada como
**`micro`** segue um ramo mais enxuto — **sem** relaxar salvaguarda de
qualidade. É micro a SPEC contida a **um** package (+ opcionalmente a CLI que o
expõe), aditiva, derivada de ADRs/PRD já existentes (nenhuma decisão nova), que
não toca `@atlas/contracts`, não cria módulo/Tool/Skill/Persona, não move
responsabilidade, não pede ADR novo nem emenda, e cabe numa sessão — exatamente
a fronteira das escalações da Emenda v1.1. Os arquétipos são as SPECs 22 e 23.

```text
 spec-drafter          →  classifica Perfil: micro (porquê em formato de veto)
        ↓
 architecture-reviewer →  GATE em modo LEVE: confirma elegibilidade + invariantes
        │                 (rebaixa para `completo` se qualquer condição falhar)
        ↓  (fio principal: Draft → Ready)
 spec-implementer      →  código + testes (INALTERADO — separado)
        ↓  (fio principal: In Progress → Review)
 spec-closer (micro)   →  VALIDA (testes/lint/typecheck + Critérios de Aceitação)
                          e, se passar, fecha (lições + doc-sync + Status: Done +
                          commit) — tudo num cold-start só. Reprovou → volta ao
                          implementer 1×; 2ª reprovação → escala.
```

**Por que isto economiza** (medido no `TOKEN_USAGE_LOG.md`): o custo de uma
micro-SPEC é ~85% cerimônia (overhead ÷ implementação ~5,9× na 22/23), e o maior
balde é o hand-off pelo fio principal. O ramo micro corta um cold-start inteiro
(validação + fechamento fundidos no `spec-closer`) e a busca adversarial
exaustiva do gate, mirando ~25–30% por micro-SPEC.

**O que NÃO se abre mão** (as duas salvaguardas): (1) o **gate do
`architecture-reviewer`** continua autorizando `Draft → Ready` — o modo leve
troca só o ataque adversarial exaustivo pela verificação de elegibilidade, nunca
pula o gate; (2) a **independência entre autor e verificador** — quem valida
(`spec-closer`) nunca é quem escreveu o código (`spec-implementer`), e o closer
segue proibido de tocar `packages/*/src`/`apps/*/src`. A classificação `micro` é
**proposta** pelo drafter e **confirmada** pelo reviewer; na dúvida, cai no
`completo` (default seguro). O `spec-validator` separado é usado **só** no
`completo`.

Em cada seta de pedido do usuário ("cria uma SPEC pra X", "implementa a
SPEC-XXXX", "valida a SPEC-XXXX"), um hook `UserPromptSubmit` injeta um
lembrete automático apontando para o subagent certo — para que a delegação
aconteça de fato, sem depender de eu lembrar sozinho no meio de uma
conversa longa.

---

# Os cinco subagents

Definidos em `.claude/agents/`. Cada um cobre exatamente uma fase e usa o
modelo escolhido pelo tipo de trabalho, não o mais caro por padrão.

| Agente | Modelo | Fase | O que faz | O que NÃO faz |
|---|---|---|---|---|
| [`spec-drafter`](../../.claude/agents/spec-drafter.md) | Opus | Criação/Decisão | Cruza PRD, ADRs e Module Catalog; preenche o `SPEC-TEMPLATE.md`; **decide sozinho** as questões de design deriváveis da documentação e registra cada uma na SPEC em formato de veto (decisão + porquê + alternativa descartada); SPEC sai sem perguntas abertas | Não decide os casos de escalação da Emenda v1.1 (Constituição, módulo novo, ADR novo, pedido sem base no PRD); nunca sai de `Status: Draft`; não implementa |
| [`architecture-reviewer`](../../.claude/agents/architecture-reviewer.md) | Opus | Gate Draft → Ready | Ataca o rascunho contra Constituição, Module Catalog, ADRs e PRD; sua aprovação **autoriza** `Draft → Ready` (Emenda v1.1); veto devolve ao `spec-drafter` 1×, segundo veto escala ao usuário | Não edita nenhum arquivo (a transição de `Status` é aplicada pelo fio principal); não expande escopo |
| [`spec-implementer`](../../.claude/agents/spec-implementer.md) | Sonnet | Implementação | Implementa apenas o que está em "Escopo" de uma SPEC `Ready`/`In Progress`; roda testes/lint/typecheck; reporta os atritos encontrados no relatório final (insumo do Lessons Learned) | Não implementa o que está em "Fora do Escopo"; não marca `Done`; não decide arquitetura; **não sincroniza docs vivas** (`CLAUDE.md` raiz/packages, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md` — isso é o passo de fecho `doc-sync`) |
| [`spec-validator`](../../.claude/agents/spec-validator.md) | Sonnet | Verificação | Roda testes/lint/typecheck; confere cada "Critério de Aceitação" e item da "Definition of Done" item a item | Não edita código; não decide se algo deveria ser diferente; não muda `Status` sozinho |
| [`spec-closer`](../../.claude/agents/spec-closer.md) | Sonnet | Fechamento | Registra as Lições Aprendidas (`LESSONS_LEARNED.md`) e sincroniza as docs vivas (`PLATFORM_STATE.md`, `CLAUDE.md` raiz/packages, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, notas de ADR) seguindo as skills `lessons-learned`/`doc-sync` como formato canônico; lê `git diff`/`git log` **uma vez** e faz o commit + push único de fechamento | Não muda `Status` (o fio principal já aplicou `Review → Done`); não escreve código; não cria ADR/Module Catalog novo (registra o encaminhamento e escala) |

A tabela acima descreve as fases no **Perfil `completo`**. No **Perfil `micro`**
(ver "Ramo micro" acima): o `architecture-reviewer` roda em modo leve; o
`spec-validator` **não é chamado** (sua verificação é fundida no `spec-closer`);
e o `spec-closer` **valida antes de fechar** e é quem aplica `Review → Done`.
As colunas "O que NÃO faz" valem para o perfil completo — as exceções do micro
estão nas definições dos próprios agentes.

O Opus no `spec-drafter` é intencional: síntese de escopo a partir de
documentação exige mais julgamento que os outros dois. O `spec-validator`
começou em Haiku, mas foi promovido a Sonnet antes do primeiro uso real:
rodar comandos é mecânico, porém conferir se cada Critério de Aceitação
está de fato atendido no código e se o diff ficou dentro do "Escopo" exige
compreensão de código × documento — e o validator é o último portão
automatizado antes do gate humano `Review → Done`. Um verificador fraco
depois de um implementador mais forte inverteria a lógica do controle de
qualidade.

O `spec-closer` (Sonnet) foi a última fase a sair do fio principal
(2026-07-20). O fechamento — lições aprendidas + sincronização das docs
vivas — rodava no fio principal via as skills `lessons-learned`/`doc-sync`,
no **pior ponto de custo**: o fim da SPEC, quando o contexto acumulado
(rascunho + parecer do reviewer + relatórios do implementer/validator) já é
o maior da sessão, e cada `Edit` multi-arquivo reprocessava tudo em
`cache_read` caro. Isolar num subagent frio ataca exatamente essa causa
raiz — a mesma lógica que justificou implementer/validator. É Sonnet, não
Haiku, porque escreve prosa (o parágrafo "Estado" do `CLAUDE.md`, o
narrativo do `PLATFORM_STATE.md`), não só marca checklist. Juntar as duas
tarefas num agente só (em vez de dois cold-starts) faz o `git diff`/`git log`
ser lido **uma vez** e reaproveitado nos dois passos. O trade-off: o agente
frio precisa re-ler os docs vivos + a SPEC + o diff, mas esses são leituras
pequenas e baratas perto do contexto de pico que o fio principal reprocessava
a cada edit.

**Histórico do gate (duas reversões deliberadas):** a v1.2 deste documento
descartou a ideia de um "agente arquiteto" que decide sozinho, por violar a
Constituição de então ("a IA é colaboradora, não arquiteta"), e adotou o
gate humano com insumo adversarial: o humano aprovava por veto lendo as
decisões do `architecture-reviewer`. Na prática, porém, o pingue-pongue de
perguntas no fio principal seguiu sendo o maior custo de tokens do projeto
(fase "Criação/Decisão" dominante no `TOKEN_USAGE_LOG.md` mesmo após os
subagents), e o gate humano continuava assentindo. Em 2026-07-19 o usuário
decidiu reverter: a **Emenda v1.1 da Constituição** legitima a autonomia, e
o gate passou a ser **máquina** — a aprovação do `architecture-reviewer`
autoriza `Draft → Ready`. O que se preservou da solução anterior: as
decisões continuam registradas em formato de veto (agora dentro da SPEC),
o usuário mantém override, e as decisões estruturais de verdade
(Constituição, módulo novo, ADR novo) continuam escalando para ele. Duas
instâncias Opus discordando (drafter decide, reviewer ataca) seguem sendo o
mecanismo de qualidade — o que mudou foi quem segura o portão.

**Contexto zerado é o recurso e o risco:** cada subagent começa frio, e a
SPEC vira o único canal entre as fases. Por isso a skill `spec-check` e os
lembretes do hook instruem a incluir no prompt de delegação as decisões da
conversa que não estão no texto da SPEC, e o `spec-implementer` é obrigado
a reportar atritos no relatório final — sem isso, esse conhecimento morre
com o contexto descartado do subagent.

---

# As três skills

Definidas em `.claude/skills/`. Skills são instruções em texto que servem de
**fonte canônica do formato** — a de `spec-check` é seguida no fio principal;
as de `lessons-learned` e `doc-sync` deixaram de rodar no fio principal
(2026-07-20) e passaram a ser **lidas pelo `spec-closer`** como o checklist
que ele executa. Manter o formato numa skill (e não inline no agente) evita
divergência entre os dois: quem edita o formato edita um lugar só. Importante:
o disparo de uma skill é **probabilístico** — o modelo decide invocá-la a
partir da descrição, não é garantido pelo harness. O backstop determinístico
é o hook `PreToolUse` (abaixo), que roda sempre.

- **[`spec-check`](../../.claude/skills/spec-check/SKILL.md)** — antes de
  qualquer edição em `packages/*/src`, `apps/*/src`,
  `tooling/*/src`. Verifica se existe SPEC aprovada cobrindo a mudança (e
  para se não existir); depois de confirmar, instrui a delegar para
  `spec-implementer` (e depois `spec-validator`) em vez de implementar
  direto ali, passando no prompt de delegação as decisões da conversa que
  não estão no texto da SPEC.
- **[`lessons-learned`](../../.claude/skills/lessons-learned/SKILL.md)** —
  formato da entrada de Lições Aprendidas, **executado pelo `spec-closer`** no
  fechamento (não mais no fio principal). Reconstrói o que aconteceu de fato
  (via `git log`/`git diff` e o relatório de atritos do `spec-implementer`) e
  preenche o formato exigido por `docs/implementation/LESSONS_LEARNED.md`.
- **[`doc-sync`](../../.claude/skills/doc-sync/SKILL.md)** — também
  **executado pelo `spec-closer`** no fechamento, complementar à
  `lessons-learned`: enquanto aquela cuida do registro histórico, esta
  sincroniza o **estado vivo** — checklist
  estrutural cobrindo o `CLAUDE.md` raiz (parágrafo "Estado" + seção
  "ainda não criado"), os `CLAUDE.md` dos packages tocados,
  `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` e notas em ADRs previstas pela
  SPEC.
  **A sincronização dessas docs vivas é passo de fecho, rodado no fio
  principal _após_ a validação — nunca escopo do `spec-implementer`.** O
  implementador toca só a documentação **específica da própria SPEC** (o
  arquivo da SPEC, notas de atualização em ADRs que a SPEC prevê); as docs
  vivas listadas acima são deste passo. Se o campo "Definition of
  Done → documentação atualizada" do `SPEC-TEMPLATE.md` for lido como se o
  implementador devesse atualizá-las, é engano: o template foi anotado
  (Lessons Learned da [SPEC-0019](../implementation/specs/SPEC-0019-observation-replan-loop.md))
  justamente para deixar essa fronteira explícita e evitar o trabalho-e-reversão.

---

# Os quatro hooks

Definidos em `.claude/settings.json` (versionado, compartilhado com o
time).

| Evento | O que faz | Bloqueia? |
|---|---|---|
| `PreToolUse` (Write\|Edit) | Antes de editar `packages/*/src`/`apps/*/src`/`tooling/*/src`, verifica se alguma SPEC **ativa** (`Status: Ready` ou `In Progress`) menciona o pacote — SPECs `Done` não contam, senão o gate perde o sentido conforme o corpus de SPECs cresce | Só `ask` (pede confirmação) — nunca `deny` automático |
| `PostToolUse` (Write\|Edit) | Depois de editar um `.ts` nesses caminhos, roda `eslint` no arquivo; erros voltam como feedback bloqueante | Sim, via exit code 2 — mas só depois da edição já ter acontecido |
| `UserPromptSubmit` | Roda `scripts/hooks/spec-prompt-nudge.sh`; se o pedido menciona criar/implementar/validar/concluir uma SPEC (ou lições aprendidas), injeta lembrete para usar o subagent/skill certo | Não — só injeta contexto |
| `Stop` | Depois de cada resposta minha, roda `scripts/claude-usage-report.py` em background (`async: true`) para manter os relatórios de token atualizados | Não — assíncrono, nunca trava a conversa |

**Por que o `PostToolUse` roda só eslint, sem typecheck:** duas razões. A
versão original rodava `tsc -p tsconfig.json --noEmit`, mas o `tsconfig.json`
da raiz só cobre `tests/**` — o typecheck que vale é o por package
(`pnpm -r --if-present typecheck`), então o hook validava a coisa errada.
Além disso, numa mudança multi-arquivo as edições intermediárias falham
typecheck **por definição** (estado transitório), e cada falha injetaria a
saída inteira do tsc como feedback — ruído que atrapalha o subagent e gasta
tokens, contrariando o objetivo da automação. O typecheck completo continua
obrigatório, mas no lugar certo: o `spec-implementer` roda `pnpm typecheck`
ao final da implementação e o `spec-validator` roda de novo na validação.

**Por que nenhum hook bloqueia edição direta com `deny`:** o payload do
hook não permite distinguir com segurança se uma chamada de `Write`/`Edit`
veio do fio principal ou de dentro do próprio `spec-implementer`. Um `deny`
automático correria o risco de travar o subagent que deveria estar fazendo
a edição. Por isso a aplicação da regra é em duas camadas mais suaves
(lembrete no início do turno + instrução na skill), não um bloqueio rígido.

---

# Log de custo de token por SPEC

`scripts/claude-usage-report.py` lê os transcripts locais do Claude Code
(`~/.claude/projects/<projeto>/*.jsonl`, incluindo as pastas
`subagents/agent-*.jsonl` de cada sessão) e gera dois artefatos:

- **`.claude/usage-report.md`** — relatório detalhado, pessoal,
  **gitignored** (nomes de sessão, ranking por consumo). Não é
  documentação do time.
- **[`docs/05-context/TOKEN_USAGE_LOG.md`](../05-context/TOKEN_USAGE_LOG.md)**
  — resumo por SPEC, **versionado**, com:
  - custo total por SPEC (Título e Status lidos direto do arquivo da SPEC);
  - detalhamento por fase (Criação/Decisão × Implementação × Verificação ×
    Apoio/outros agentes) — só se popula quando os subagents acima são
    efetivamente usados via Task; SPECs antigas aparecem 100% em
    Criação/Decisão, o que é o retrato real do que aconteceu, não um erro;
  - custo médio e faixa observada das SPECs `Done`, para estimar se uma
    SPEC nova cabe na sessão atual antes de começar.

Regenerado automaticamente pelo hook `Stop` (ver acima) — normalmente não
precisa rodar manualmente. Para forçar: `python3 scripts/claude-usage-report.py`.

**Limitação conhecida:** a atribuição de sessão → SPEC é heurística (conta
menções a `SPEC-XXXX` no texto, usa a mais citada). Uma sessão que discutiu
duas SPECs joga 100% do custo na dominante. Suficiente para decidir "cabe
ou não cabe numa sessão", não é contabilidade exata.

---

# Registro de impacto (baseline → medição)

Toda mudança nesta automação que promete economia de token registra aqui um
**baseline congelado + hipótese + medição**, para não otimizarmos no escuro.
A tabela do `TOKEN_USAGE_LOG.md` é regenerada e muda sozinha; os números
abaixo são um **snapshot manual** da referência "antes", que não se altera.

## Baseline congelado — pipeline completo, pré-`spec-closer` (2026-07-20)

Últimas SPECs com o pipeline autônomo (drafter/reviewer/implementer/validator
via Task), em **tokens efetivos**. A fase de **Fechamento** ainda não existia:
o custo de lições + doc-sync estava **dentro de "Criação/Decisão (fio
principal)"** e não é isolável — é exatamente por isso que não dava para medir.

| SPEC | Criação/Decisão (fio principal) | Rascunho | Revisão | Implementação | Verificação |
|---|---:|---:|---:|---:|---:|
| SPEC-0019 | 4.688.414 | 1.333.249 | 0 | 3.374.441 | 545.657 |
| SPEC-0020 | 4.030.323 | 1.479.607 | 816.702 | 2.651.780 | 911.089 |
| SPEC-0021 | 7.013.597 | 0 | 1.445.130 | 1.221.015 | 470.358 |

## Entradas

### `spec-closer` — extrair o fechamento do fio principal (2026-07-20)

- **Baseline:** lições + doc-sync rodavam no fio principal, no ponto de
  contexto mais caro da SPEC. Custo embutido em "Criação/Decisão" (acima:
  4–7M efetivos nas 0019–0021), não separável.
- **Hipótese:** um cold-start dedicado (`spec-closer`) faz esses edits
  multi-arquivo num contexto pequeno, eliminando o reprocessamento de
  `cache_read` de pico. Espera-se: "Criação/Decisão" **cai** numa SPEC de
  porte comparável, e o novo custo aparece isolado em "Fechamento" — menor
  que a queda em "Criação/Decisão" (senão a mudança não pagou).
- **Medição:** _PENDENTE — a primeira SPEC fechada pelo `spec-closer`
  preenche a coluna "Fechamento" no `TOKEN_USAGE_LOG.md`. Registrar aqui:
  SPEC nº, Fechamento (X), Criação/Decisão dela (Y), e a SPEC de porte
  parecido no baseline usada como comparação. Veredicto: pagou / não pagou /
  reverter._

### Instrumentação de fases no log de token (2026-07-20)

- **Mudança:** `spec-drafter`→Rascunho, `architecture-reviewer`→Revisão,
  `spec-closer`→Fechamento no `PHASE_BY_AGENT_TYPE` do script.
- **Impacto já medido:** o custo do `architecture-reviewer`, antes oculto em
  "Apoio (outros agentes)", ficou visível retroativamente — **Revisão:
  816.702 (SPEC-0020), 1.445.130 (SPEC-0021)**. É o dado que faltava para
  decidir, mais adiante e com base real, se o reviewer justifica Opus ou se
  Sonnet basta.

---

# Como isso muda o dia a dia

Antes desta automação: eu fazia rascunho, implementação e validação de uma
SPEC inteira no mesmo fio de conversa, sem separação de custo, sem
visibilidade de quanto uma SPEC ia custar antes de começar.

Depois:

1. **Antes de puxar uma SPEC nova**, consultar
   `docs/05-context/TOKEN_USAGE_LOG.md` para comparar com a SPEC concluída
   mais parecida em tamanho e decidir se cabe na sessão atual.
2. **Pedir a SPEC uma única vez** ("faz a SPEC de X") — a cadeia inteira
   roda sozinha: drafter decide, reviewer aprova ou veta, implementer
   implementa, validator valida, e o `spec-closer` fecha (lições + docs
   vivas + commit/push). O fio principal só despacha e aplica transições de
   `Status`.
3. **Ler as decisões depois, exercer override quando discordar** — cada
   SPEC carrega suas decisões em formato de veto; o usuário só é chamado
   nas escalações da Emenda v1.1 (Constituição, módulo novo, ADR novo,
   segundo veto/reprovação).
4. **Ao final de cada resposta**, o log de tokens já está atualizado
   sozinho — não precisa rodar nada manualmente, mesmo se a sessão cair no
   meio da SPEC.

---

# Onde encontrar cada peça

```text
.claude/
  agents/
    spec-drafter.md            (Opus — Criação/Decisão)
    architecture-reviewer.md   (Opus — Revisão de arquitetura, Draft → Ready)
    spec-implementer.md        (Sonnet — Implementação)
    spec-validator.md          (Sonnet — Verificação)
    spec-closer.md             (Sonnet — Fechamento: lições + docs vivas + commit)
  skills/
    spec-check/SKILL.md        (seguida no fio principal)
    lessons-learned/SKILL.md   (formato lido pelo spec-closer)
    doc-sync/SKILL.md          (formato lido pelo spec-closer)
  settings.json            (os 4 hooks)

scripts/
  claude-usage-report.py
  hooks/
    spec-prompt-nudge.sh

docs/05-context/
  TOKEN_USAGE_LOG.md        (versionado, por SPEC)
```

---

# Status desta automação

**Em uso real.** O pipeline já fechou SPECs de ponta a ponta — SPEC-0019,
0020 e 0021 passaram pelo fluxo com os subagents `spec-implementer`/
`spec-validator` efetivamente usados via Task (ver a coluna por fase em
`docs/05-context/TOKEN_USAGE_LOG.md`, que só se popula quando os agentes são
de fato acionados). A Emenda v1.1 da Constituição (gate `Draft → Ready`
autônomo) está operando.

O `spec-closer` (fase de Fechamento) foi extraído do fio principal em
2026-07-20, depois de os dados de token mostrarem que o fechamento
(`lessons-learned` + `doc-sync`) rodava no ponto de contexto mais caro da
sessão. É a mudança mais recente e ainda não passou por uma SPEC de cabo a
rabo — a próxima SPEC a fechar valida (ou ajusta) o cold-start compartilhado
descrito acima.
