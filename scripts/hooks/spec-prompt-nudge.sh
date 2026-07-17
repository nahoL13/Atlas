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
  emit "Lembrete automático (hook UserPromptSubmit): esta SPEC deve ser rascunhada delegando para o subagent spec-drafter via Agent tool (subagent_type: spec-drafter), não diretamente no fio principal. Inclua no prompt de delegação as decisões relevantes já tomadas nesta conversa. O spec-drafter sempre entrega Status Draft para aprovação humana."
  exit 0
fi

if has 'spec'; then
  if has 'implementa'; then
    emit "Lembrete automático (hook UserPromptSubmit): esta SPEC deve ser implementada delegando para o subagent spec-implementer via Agent tool (subagent_type: spec-implementer), não diretamente no fio principal. Inclua no prompt de delegação decisões relevantes desta conversa que não estejam no texto da SPEC. Isso isola o contexto de exploração e mantém docs/05-context/TOKEN_USAGE_LOG.md preciso por fase."
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
