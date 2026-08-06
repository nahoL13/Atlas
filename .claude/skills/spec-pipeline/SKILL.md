---
name: spec-pipeline
description: Use when a user asks to create, continue, review, implement, validate, or close an Atlas SPEC; orchestrates the complete and micro profiles end to end through the five specialized agents.
---

# Pipeline autônomo de SPEC

## Preflight

Antes de despachar qualquer fase, leia `docs/05-context/NEXT_CONTEXT.md`,
`docs/05-context/TOKEN_USAGE_LOG.md` e
`docs/04-engineering/ClaudeCodeAutomation.md`. Identifique a SPEC existente
ou o pedido que exige uma SPEC, localize seu arquivo em
`docs/implementation/specs/` quando já houver um, e confirme o Status e o
Perfil. Para uma SPEC nova, o `spec-drafter` propõe o Perfil; na dúvida, use
`completo`.

## Registro de handoff

Todo despacho para um agente especializado carrega e atualiza este registro
exato. O próximo agente recebe o registro inteiro, inclusive relatórios e
decisões que ainda não chegaram à SPEC:

```yaml
spec_path: docs/implementation/specs/SPEC-XXXX-*.md
profile: completo | micro
attempt: 1
previous_report: <relatório compacto da fase anterior ou null>
unrecorded_decisions: <decisões da conversa ainda ausentes da SPEC ou null>
```

## Perfil completo

Execute uma fase por vez, na ordem abaixo. O fio principal aplica apenas as
transições de Status marcadas como sua responsabilidade.

| Ordem | Agente | Entrada e ação | Saída / transição |
| --- | --- | --- | --- |
| 1 | `spec-drafter` | Pedido ou SPEC incompleta; redige a SPEC e decide o que for derivável da documentação em formato de veto. | `Status: Draft`; atualize o handoff. |
| 2 | `architecture-reviewer` | Ataca a SPEC Draft contra Constituição, ADRs, Module Catalog e PRD. | Aprovação autoriza o despachante a aplicar **Draft → Ready**. |
| 3 | `spec-implementer` | Recebe a SPEC Ready e o handoff. | O despachante aplica **Ready → In Progress** antes/durante a implementação e, quando o relatório chegar, **In Progress → Review**. |
| 4 | `spec-validator` | Confere a SPEC Review, os critérios e os quatro comandos completos. | Com veredicto “pronta”, o despachante aplica **Review → Done**. |
| 5 | `spec-closer` | Recebe a SPEC Done, Perfil completo e o relatório do validator. | Fecha em cold-start (lições, docs vivas, commit e push) e devolve relatório compacto. |

## Perfil micro

O **Perfil micro** conserva o gate do reviewer e a independência entre quem
implementa e quem valida. Ele dispensa apenas o `spec-validator` separado:

| Ordem | Agente | Entrada e ação | Saída / transição |
| --- | --- | --- | --- |
| 1 | `spec-drafter` | Propõe Perfil micro e redige a SPEC em formato de veto. | `Status: Draft`; atualize o handoff. |
| 2 | `architecture-reviewer` | Confirma a elegibilidade em modo leve e os invariantes; rebaixa para completo se qualquer condição falhar. | Aprovação autoriza o despachante a aplicar **Draft → Ready**. |
| 3 | `spec-implementer` | Recebe a SPEC Ready e o handoff. | O despachante aplica **Ready → In Progress** e, ao receber o relatório, **In Progress → Review**. |
| 4 | `spec-closer` | Recebe a SPEC Review; valida primeiro (quatro comandos completos, critérios, DoD e escopo). | Se verde, o closer aplica **Review → Done**, sincroniza docs, commita e envia o relatório compacto. |

## Retornos e limites de tentativa

- No primeiro veto do `architecture-reviewer`, devolva a SPEC ao
  `spec-drafter` com `attempt: 2`, o parecer em `previous_report` e as
  decisões pendentes em `unrecorded_decisions`; rode o reviewer novamente.
  No **segundo veto**, pare e escale ao usuário.
- No Perfil completo, a primeira reprovação do `spec-validator` retorna ao
  `spec-implementer` uma vez, preservando o relatório no handoff. A **segunda
  reprovação** para o pipeline e escala ao usuário.
- No Perfil micro, a primeira reprovação de validação do `spec-closer` retorna
  ao `spec-implementer` uma vez. A **segunda reprovação** para o pipeline e
  escala ao usuário. O closer não fecha nem commita uma SPEC reprovada.

## Escalações humanas imediatas

Pare e chame o usuário, sem criar solução arquitetural própria, quando houver:

- emenda à Constituição;
- módulo novo ou responsabilidade movida;
- ADR novo;
- pedido sem base no PRD;
- segundo veto do reviewer;
- segunda reprovação do validator ou da validação micro;
- override explícito do usuário.

## Disciplina de despacho

Nunca execute fases dependentes em paralelo: o agente seguinte só começa após
o relatório compacto da fase anterior atualizar o handoff. O fio principal não
absorve desenho, implementação, validação, fechamento ou decisão de
arquitetura inline. Se o agente obrigatório não estiver disponível, pare e
reporte a indisponibilidade; não substitua a fase silenciosamente.

Ao concluir com sucesso, retorne ao usuário somente o relatório compacto do
`spec-closer`, sem re-narrar as fases nem o código.
