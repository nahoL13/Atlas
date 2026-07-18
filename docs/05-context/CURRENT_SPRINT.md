# CURRENT_SPRINT

> **Project Atlas — Estado do Trabalho Atual**

Atualizado em: 2026-07-18 (SPEC-0017)

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

Detalhes de retomada: `docs/05-context/NEXT_CONTEXT.md`.
