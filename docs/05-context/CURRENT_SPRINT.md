# CURRENT_SPRINT

> **Project Atlas — Estado do Trabalho Atual**

Atualizado em: 2026-07-20 (SPEC-0022)

---

# Sprint: Fundação do MVP

Objetivo: plataforma mínima operável + primeira interface executável (CLI) + acesso a modelos de IA.

| SPEC | Título | Status |
| --- | --- | --- |
| [SPEC-0001](../implementation/specs/SPEC-0001-workspace-bootstrap.md) | Workspace Bootstrap | Done |
| [SPEC-0002](../implementation/specs/SPEC-0002-core-bootstrap.md) | Core Bootstrap | Done |
| [SPEC-0003](../implementation/specs/SPEC-0003-cli-foundation.md) | CLI Foundation | Done |
| [SPEC-0004](../implementation/specs/SPEC-0004-model-gateway.md) | Model Gateway | Done |
| [SPEC-0005](../implementation/specs/SPEC-0005-cognitive-core.md) | Cognitive Core (mínimo) | Done |
| [SPEC-0006](../implementation/specs/SPEC-0006-atlas-chat.md) | atlas chat (conversa multi-turno) | Done |
| [SPEC-0007](../implementation/specs/SPEC-0007-context-service.md) | Context Service (detentor de sessão) | Done |
| [SPEC-0008](../implementation/specs/SPEC-0008-persona-service.md) | Persona Service (Jarvis) | Done |
| [SPEC-0009](../implementation/specs/SPEC-0009-memory-service.md) | Memory Service (fatos explícitos) | Done |
| [SPEC-0010](../implementation/specs/SPEC-0010-planner-runtime-tools.md) | Planner + Runtime + Tools (execução ponta a ponta) | Done |
| [SPEC-0011](../implementation/specs/SPEC-0011-permission-service-fs-read.md) | Permission Service + Tools de leitura de sistema de arquivos | Done |
| [SPEC-0012](../implementation/specs/SPEC-0012-write-file-tool.md) | Tool de escrita (`write_file`) + política `writeRoots` | Done |
| [SPEC-0013](../implementation/specs/SPEC-0013-confirm-flow-destructive-tools.md) | Fluxo `confirm` + Tools destrutivas (`delete_file`/`mkdir`/`append_file`) | Done |
| [SPEC-0014](../implementation/specs/SPEC-0014-tools-confirm-in-chat.md) | Tools e `confirm` no `atlas chat` (`respond` orquestra Planejamento + Execução) | Done |
| [SPEC-0015](../implementation/specs/SPEC-0015-permission-symlink-hardening.md) | Endurecimento de symlink no Permission Service (`realpath`, `evaluate` síncrono) | Done |
| [SPEC-0016](../implementation/specs/SPEC-0016-remote-and-ci.md) | Remote (GitHub) + CI (`nahoL13/Atlas` privado, `.github/workflows/ci.yml`) | Done |
| [SPEC-0017](../implementation/specs/SPEC-0017-toctou-atomic-enforcement.md) | Fecho atômico de TOCTOU (`read_file`/`write_file`/`append_file`, `O_NOFOLLOW` + identidade do fd + `PermissionService.isContained`) | Done |
| [SPEC-0018](../implementation/specs/SPEC-0018-multiple-permission-roots-cli.md) | Múltiplas raízes de leitura/escrita na CLI (`--allow-read`/`--allow-write` repetíveis, env por `path.delimiter`) | Done |
| [SPEC-0019](../implementation/specs/SPEC-0019-observation-replan-loop.md) | Observação: laço plano→executa→observa→replaneja (`runPlanCycle` limitado a 1 replan, `observe` puro, `ExecutedStep.denialKind`) | Done |
| [SPEC-0020](../implementation/specs/SPEC-0020-learning-post-turn-extraction.md) | Aprendizado: extração pós-turno proposta pelo Cognitive, gravada pela borda (`learner` puro, `learned?`, `Fact.source?` — ciclo cognitivo completo nas 7 etapas) | Done |
| [SPEC-0021](../implementation/specs/SPEC-0021-live-memory-prompt-recomposition.md) | Recomposição ao vivo do `memoryPrompt` no Cognitive Core (`memoryPrompt` vira provider síncrono amostrado 1x/turno; `respond` reescreve/insere a cabeça `system`; learner vê os fatos conhecidos) | Done |
| [SPEC-0022](../implementation/specs/SPEC-0022-deterministic-fact-deduplication.md) | Deduplicação determinística dos fatos aprendidos no Memory Service (`normalize` puro interno; `remember` no-op idempotente em duplicata; retorno `{ fact, created }`; parcial em 1.3 — legado não consolidado) | Done |

Detalhes de retomada: `docs/05-context/NEXT_CONTEXT.md`.
