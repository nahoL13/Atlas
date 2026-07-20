#!/usr/bin/env bash
# Hook UserPromptSubmit: lembra de delegar trabalho de SPEC para o subagent
# certo (spec-drafter / spec-implementer / spec-validator) em vez de fazer
# direto no fio principal. Ver .claude/agents/ e docs/05-context/TOKEN_USAGE_LOG.md
# (o log por fase só funciona se os agentes forem de fato usados).
set -euo pipefail

prompt=$(jq -r '.prompt // empty')

emit() {
  jq -n --arg ctx "$1" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$ctx}}'
}

has() {
  echo "$prompt" | grep -qiE "$1"
}

if has '(cria|criar|rascunha|rascunhar|faz|fazer|faça|monta|montar|continua|continuar|continue).*spec|nova spec'; then
  emit "Lembrete automático (hook UserPromptSubmit): esta SPEC dispara o pipeline autônomo (Emenda v1.1 da Constituição). Delegue IMEDIATAMENTE ao subagent spec-drafter via Agent tool (subagent_type: spec-drafter), SEM devolver perguntas de design ao usuário no fio principal: as decisões de design deriváveis da documentação pertencem ao spec-drafter, que decide sozinho e registra cada uma na SPEC em formato de veto (fazer esse design Q&A no fio principal é o anti-padrão caro que esta automação existe para matar — as escalações da Emenda v1.1 são responsabilidade do próprio drafter). Ele entrega Status Draft sem perguntas abertas E classifica o Perfil (micro/completo); em seguida delegue ao architecture-reviewer (gate: aprovação autoriza Draft → Ready, aplicada pelo fio principal; também CONFIRMA o Perfil; 2º veto escala ao usuário) e siga a cadeia: spec-implementer → spec-validator → (fio principal aplica Review → Done) → spec-closer (lições aprendidas + docs vivas + commit/push, num cold-start só), sem consultar o usuário fora das escalações. RAMO MICRO (Emenda v1.2): se o architecture-reviewer confirmar Perfil micro, PULE o spec-validator separado — o spec-closer valida (testes/lint + Critérios de Aceitação) e fecha num cold-start só, e é ele quem aplica Review → Done. Inclua no prompt de delegação as decisões relevantes já tomadas nesta conversa. Repasse relatórios sem re-narrar."
  exit 0
fi

if has 'spec'; then
  if has 'implementa'; then
    emit "Lembrete automático (hook UserPromptSubmit): esta SPEC deve ser implementada delegando para o subagent spec-implementer via Agent tool (subagent_type: spec-implementer), não diretamente no fio principal. Inclua no prompt de delegação decisões relevantes desta conversa que não estejam no texto da SPEC. Isso isola o contexto de exploração e mantém docs/05-context/TOKEN_USAGE_LOG.md preciso por fase."
    exit 0
  fi
  if has 'revisa|revisar|review.*arquitet|arquitet.*review'; then
    emit "Lembrete automático (hook UserPromptSubmit): a revisão de arquitetura de uma SPEC Draft deve ser delegada ao subagent architecture-reviewer via Agent tool (subagent_type: architecture-reviewer), não feita no fio principal. Ele devolve um parecer com as decisões em formato de veto; sua aprovação autoriza Draft → Ready (Emenda v1.1 — o fio principal aplica a transição); veto devolve ao spec-drafter 1x e o 2º veto escala ao usuário."
    exit 0
  fi
  if has 'valida|verifica'; then
    emit "Lembrete automático (hook UserPromptSubmit): esta SPEC deve ser validada delegando para o subagent spec-validator via Agent tool (subagent_type: spec-validator), não diretamente no fio principal."
    exit 0
  fi
  if has 'conclui|fecha|finaliza|encerra'; then
    emit "Lembrete automático (hook UserPromptSubmit): ao fechar uma SPEC já validada (veredicto 'pronta' do spec-validator e transição Review → Done aplicada pelo fio principal), delegue ao subagent spec-closer via Agent tool (subagent_type: spec-closer) — ele registra as lições aprendidas (LESSONS_LEARNED.md), sincroniza as docs vivas (CLAUDE.md raiz/packages, PLATFORM_STATE.md, NEXT_CONTEXT.md, CURRENT_SPRINT.md) e faz o commit + push único, num cold-start só. No prompt de delegação, cole o relatório final do spec-validator (ele já resume o que foi entregue/verificado — o closer usa como base e re-lê o mínimo) e as decisões desta conversa que não estejam no texto da SPEC. Não faça esse fechamento no fio principal — é onde o contexto de pico custa mais caro."
    exit 0
  fi
fi

if has 'aprendidas|lessons'; then
  emit "Lembrete automático (hook UserPromptSubmit): as lições aprendidas fazem parte do fechamento da SPEC — delegue ao subagent spec-closer via Agent tool (subagent_type: spec-closer), que registra em docs/implementation/LESSONS_LEARNED.md e ainda sincroniza as docs vivas e faz o commit, num cold-start só. A skill lessons-learned segue sendo a fonte do formato que ele lê."
  exit 0
fi

exit 0
