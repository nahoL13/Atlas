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

if echo "$prompt" | grep -qiE '(cria|criar|rascunha|rascunhar).*spec|nova spec'; then
  emit "Lembrete automático (hook UserPromptSubmit): esta SPEC deve ser rascunhada delegando para o subagent spec-drafter via Agent tool (subagent_type: spec-drafter), não diretamente no fio principal. O spec-drafter sempre entrega Status Draft para aprovação humana."
  exit 0
fi

if echo "$prompt" | grep -qiE 'spec-[0-9]{4}'; then
  if echo "$prompt" | grep -qiE 'implementa|implementar'; then
    emit "Lembrete automático (hook UserPromptSubmit): esta SPEC deve ser implementada delegando para o subagent spec-implementer via Agent tool (subagent_type: spec-implementer), não diretamente no fio principal. Isso isola o contexto de exploração e mantém docs/05-context/TOKEN_USAGE_LOG.md preciso por fase."
    exit 0
  fi
  if echo "$prompt" | grep -qiE 'valida|verifica'; then
    emit "Lembrete automático (hook UserPromptSubmit): esta SPEC deve ser validada delegando para o subagent spec-validator via Agent tool (subagent_type: spec-validator), não diretamente no fio principal."
    exit 0
  fi
fi

exit 0
