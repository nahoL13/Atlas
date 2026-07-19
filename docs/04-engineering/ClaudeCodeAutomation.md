# Claude Code Automation

> **Project Atlas — Automação de Workflow no Claude Code**

Version: 1.1

Status: Documento vivo (não segue o processo de SPEC/ADR — é tooling de
workflow do Claude Code, não arquitetura da plataforma Atlas)

---

# Objetivo

Este documento descreve a automação construída dentro do Claude Code para
apoiar o processo oficial de desenvolvimento do Atlas (definido em
[Development Guide](DevelopmentGuide.md)): três subagents (um por fase do
ciclo de uma SPEC), três skills, quatro hooks e um script de análise de
custo de token.

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

```text
"cria uma SPEC pra X"
        ↓
  spec-drafter (Opus)  →  Status: Draft
        ↓
  [aprovação humana: Draft → Ready]
        ↓
"implementa a SPEC-XXXX"
        ↓
  spec-implementer (Sonnet)  →  código + testes
        ↓
"valida a SPEC-XXXX"
        ↓
  spec-validator (Sonnet)  →  veredicto: pronta p/ Done ou não
        ↓
  [aprovação humana: Review → Done]
        ↓
  lessons-learned (skill)  →  entrada em LESSONS_LEARNED.md
        ↓
  doc-sync (skill)  →  CLAUDE.md raiz/packages, NEXT_CONTEXT, CURRENT_SPRINT
```

Em cada seta de pedido do usuário ("cria uma SPEC pra X", "implementa a
SPEC-XXXX", "valida a SPEC-XXXX"), um hook `UserPromptSubmit` injeta um
lembrete automático apontando para o subagent certo — para que a delegação
aconteça de fato, sem depender de eu lembrar sozinho no meio de uma
conversa longa.

---

# Os três subagents

Definidos em `.claude/agents/`. Cada um cobre exatamente uma fase e usa o
modelo escolhido pelo tipo de trabalho, não o mais caro por padrão.

| Agente | Modelo | Fase | O que faz | O que NÃO faz |
|---|---|---|---|---|
| [`spec-drafter`](../../.claude/agents/spec-drafter.md) | Opus | Criação/Decisão | Cruza PRD, ADRs e Module Catalog; preenche o `SPEC-TEMPLATE.md`; todo campo rastreia a uma fonte documentada | Não decide escopo sem base documental; nunca sai de `Status: Draft`; não cria módulo novo por conta própria |
| [`spec-implementer`](../../.claude/agents/spec-implementer.md) | Sonnet | Implementação | Implementa apenas o que está em "Escopo" de uma SPEC `Ready`/`In Progress`; roda testes/lint/typecheck; reporta os atritos encontrados no relatório final (insumo do Lessons Learned) | Não implementa o que está em "Fora do Escopo"; não marca `Done`; não decide arquitetura; **não sincroniza docs vivas** (`CLAUDE.md` raiz/packages, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md` — isso é o passo de fecho `doc-sync`) |
| [`spec-validator`](../../.claude/agents/spec-validator.md) | Sonnet | Verificação | Roda testes/lint/typecheck; confere cada "Critério de Aceitação" e item da "Definition of Done" item a item | Não edita código; não decide se algo deveria ser diferente; não muda `Status` sozinho |

O Opus no `spec-drafter` é intencional: síntese de escopo a partir de
documentação exige mais julgamento que os outros dois. O `spec-validator`
começou em Haiku, mas foi promovido a Sonnet antes do primeiro uso real:
rodar comandos é mecânico, porém conferir se cada Critério de Aceitação
está de fato atendido no código e se o diff ficou dentro do "Escopo" exige
compreensão de código × documento — e o validator é o último portão
automatizado antes do gate humano `Review → Done`. Um verificador fraco
depois de um implementador mais forte inverteria a lógica do controle de
qualidade.

**Contexto zerado é o recurso e o risco:** cada subagent começa frio, e a
SPEC vira o único canal entre as fases. Por isso a skill `spec-check` e os
lembretes do hook instruem a incluir no prompt de delegação as decisões da
conversa que não estão no texto da SPEC, e o `spec-implementer` é obrigado
a reportar atritos no relatório final — sem isso, esse conhecimento morre
com o contexto descartado do subagent.

---

# As três skills

Definidas em `.claude/skills/`. Diferente dos subagents (que fazem o
trabalho), skills são instruções que eu sigo no fio principal. Importante:
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
  ao concluir uma SPEC. Reconstrói o que aconteceu de fato (via
  `git log`/`git diff` e o relatório de atritos do `spec-implementer`) e
  preenche o formato exigido por `docs/implementation/LESSONS_LEARNED.md`.
- **[`doc-sync`](../../.claude/skills/doc-sync/SKILL.md)** — também no
  fechamento de uma SPEC, complementar à `lessons-learned`: enquanto aquela
  cuida do registro histórico, esta sincroniza o **estado vivo** — checklist
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

# Como isso muda o dia a dia

Antes desta automação: eu fazia rascunho, implementação e validação de uma
SPEC inteira no mesmo fio de conversa, sem separação de custo, sem
visibilidade de quanto uma SPEC ia custar antes de começar.

Depois:

1. **Antes de puxar uma SPEC nova**, consultar
   `docs/05-context/TOKEN_USAGE_LOG.md` para comparar com a SPEC concluída
   mais parecida em tamanho e decidir se cabe na sessão atual.
2. **Pedir a criação/implementação/validação nomeando a SPEC** — o hook
   `UserPromptSubmit` já lembra automaticamente de delegar para o subagent
   certo.
3. **Aprovar manualmente as transições de status** (`Draft → Ready`,
   `Review → Done`) — isso não mudou e não deveria mudar: é exatamente o
   gate que a Constituição de Arquitetura reserva para o humano.
4. **Ao final de cada resposta**, o log de tokens já está atualizado
   sozinho — não precisa rodar nada manualmente, mesmo se a sessão cair no
   meio da SPEC.

---

# Onde encontrar cada peça

```text
.claude/
  agents/
    spec-drafter.md       (Opus — Criação/Decisão)
    spec-implementer.md   (Sonnet — Implementação)
    spec-validator.md     (Haiku — Verificação)
  skills/
    spec-check/SKILL.md
    lessons-learned/SKILL.md
    doc-sync/SKILL.md
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

Construída e testada isoladamente (pipe-test de cada hook, execução real
do script contra os transcripts deste projeto). **Ainda não testada em uso
real** — nenhuma SPEC passou pelo fluxo completo `spec-drafter` →
`spec-implementer` → `spec-validator` ainda. A primeira SPEC a passar por
esse fluxo vai validar (ou revelar ajustes necessários em) tudo descrito
aqui.
