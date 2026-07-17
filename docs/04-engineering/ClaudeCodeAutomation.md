# Claude Code Automation

> **Project Atlas — Automação de Workflow no Claude Code**

Version: 1.0

Status: Documento vivo (não segue o processo de SPEC/ADR — é tooling de
workflow do Claude Code, não arquitetura da plataforma Atlas)

---

# Objetivo

Este documento descreve a automação construída dentro do Claude Code para
apoiar o processo oficial de desenvolvimento do Atlas (definido em
[Development Guide](DevelopmentGuide.md)): três subagents (um por fase do
ciclo de uma SPEC), duas skills, quatro hooks e um script de análise de
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
  spec-validator (Haiku)  →  veredicto: pronta p/ Done ou não
        ↓
  [aprovação humana: Review → Done]
        ↓
  lessons-learned (skill)  →  entrada em LESSONS_LEARNED.md
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
| [`spec-implementer`](../../.claude/agents/spec-implementer.md) | Sonnet | Implementação | Implementa apenas o que está em "Escopo" de uma SPEC `Ready`/`In Progress`; roda testes/lint/typecheck | Não implementa o que está em "Fora do Escopo"; não marca `Done`; não decide arquitetura |
| [`spec-validator`](../../.claude/agents/spec-validator.md) | Haiku | Verificação | Roda testes/lint/typecheck; confere cada "Critério de Aceitação" e item da "Definition of Done" item a item | Não edita código; não decide se algo deveria ser diferente; não muda `Status` sozinho |

O Opus no `spec-drafter` é intencional: síntese de escopo a partir de
documentação exige mais julgamento que os outros dois, que são mecânicos
(seguir um Escopo já definido / checar uma lista já definida).

---

# As duas skills

Definidas em `.claude/skills/`. Diferente dos subagents (que fazem o
trabalho), skills são instruções que eu sigo no fio principal.

- **[`spec-check`](../../.claude/skills/spec-check/SKILL.md)** — dispara
  antes de qualquer edição em `packages/*/src`, `apps/*/src`,
  `tooling/*/src`. Verifica se existe SPEC aprovada cobrindo a mudança (e
  para se não existir); depois de confirmar, instrui a delegar para
  `spec-implementer` (e depois `spec-validator`) em vez de implementar
  direto ali.
- **[`lessons-learned`](../../.claude/skills/lessons-learned/SKILL.md)** —
  dispara ao concluir uma SPEC. Reconstrói o que aconteceu de fato (via
  `git log`/`git diff`, não o plano original) e preenche o formato exigido
  por `docs/implementation/LESSONS_LEARNED.md`.

---

# Os quatro hooks

Definidos em `.claude/settings.json` (versionado, compartilhado com o
time).

| Evento | O que faz | Bloqueia? |
|---|---|---|
| `PreToolUse` (Write\|Edit) | Antes de editar `packages/*/src`/`apps/*/src`, verifica se alguma SPEC menciona o pacote | Só `ask` (pede confirmação) — nunca `deny` automático |
| `PostToolUse` (Write\|Edit) | Depois de editar um `.ts` nesses caminhos, roda `eslint` + `tsc --noEmit`; erros voltam como feedback bloqueante | Sim, via exit code 2 — mas só depois da edição já ter acontecido |
| `UserPromptSubmit` | Roda `scripts/hooks/spec-prompt-nudge.sh`; se o pedido menciona criar/implementar/validar uma SPEC, injeta lembrete para usar o subagent certo | Não — só injeta contexto |
| `Stop` | Depois de cada resposta minha, roda `scripts/claude-usage-report.py` em background (`async: true`) para manter os relatórios de token atualizados | Não — assíncrono, nunca trava a conversa |

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
