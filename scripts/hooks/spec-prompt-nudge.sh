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

if has '(cria|criar|rascunha|rascunhar).*spec|nova spec'; then
  emit "Lembrete automático (hook UserPromptSubmit): esta SPEC dispara o pipeline autônomo (Emenda v1.1 da Constituição). Delegue ao subagent spec-drafter via Agent tool (subagent_type: spec-drafter) — ele decide sozinho e entrega Status Draft sem perguntas abertas; em seguida delegue ao architecture-reviewer (gate: aprovação autoriza Draft → Ready, aplicada pelo fio principal; 2º veto escala ao usuário) e siga a cadeia: spec-implementer → spec-validator → lessons-learned + doc-sync + commit, sem consultar o usuário fora das escalações. Inclua no prompt de delegação as decisões relevantes já tomadas nesta conversa. Repasse relatórios sem re-narrar."
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
    emit "Lembrete automático (hook UserPromptSubmit): ao concluir uma SPEC, use a skill lessons-learned (registro em docs/implementation/LESSONS_LEARNED.md) e depois a skill doc-sync (sincronizar CLAUDE.md raiz e dos packages, NEXT_CONTEXT.md e CURRENT_SPRINT.md) antes de marcar Done — ambas fazem parte da Definition of Done."
    exit 0
  fi
fi

if has 'aprendidas|lessons'; then
  emit "Lembrete automático (hook UserPromptSubmit): use a skill lessons-learned para registrar lições aprendidas no formato exigido por docs/implementation/LESSONS_LEARNED.md."
  exit 0
fi

exit 0
