# CURRENT_SPRINT

> **Project Atlas — Estado do Trabalho Atual**

Atualizado em: 2026-07-23 (SPEC-0033)

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
| [SPEC-0023](../implementation/specs/SPEC-0023-legacy-fact-consolidation-dedupe.md) | Consolidação determinística do acervo legado de fatos (`atlas memory dedupe`; `MemoryService.dedupe(options?)` aditivo, dry-run por default; fecha o candidato de 1.3/l. 93 do Roadmap) | Done |
| [SPEC-0024](../implementation/specs/SPEC-0024-fs-port-fail-closed-verify.md) | Endurecer o `verify` das portas de FS para fail-closed por default (`packages/tools/src/fs-port.ts`; ramo micro da Emenda v1.2; fecha o residual da lição da SPEC-0017) | Done |
| [SPEC-0025](../implementation/specs/SPEC-0025-skills-registry-builder.md) | Skills: Skill Registry passivo + Skill Builder (`packages/skills`; ADR-0017; `atlas skills list`/`build`; sem consumo no laço cognitivo; fecha o gate 1.4) | Done |
| [SPEC-0026](../implementation/specs/SPEC-0026-planner-skill-consumption.md) | Consumo de Skills no laço cognitivo — seleção automática pelo Planner (`Plan.skillId?`; `planner.instruction(tools, skills?)`; `CognitiveCoreDeps.skillCatalog?`; ADR-0018; gate 1.4 fecha por inteiro) | Done |
| [SPEC-0027](../implementation/specs/SPEC-0027-memory-fact-retrieval.md) | Busca/recuperação determinística de fatos no Memory Service (`MemoryService.search(query, options?)`; `atlas memory search "<consulta>"`; nota no ADR-0011; candidato de 1.3, não fecha o gate) | Done |
| [SPEC-0028](../implementation/specs/SPEC-0028-git-read-only-tools.md) | Tools de git somente-leitura (`git_status`/`git_diff`/`git_log` em `@atlas/tools`; toplevel real contido às `readRoots` pelo `verify` injetado, ADR-0013/ADR-0014; candidato de 1.4, parcialmente entregue — não fecha o item) | Done |
| [SPEC-0029](../implementation/specs/SPEC-0029-episodic-project-memory.md) | Categorias de conhecimento no Memory Service — memória episódica e memória de projetos (`MemoryCategory`; `Fact.category?`/`subject?`; invariante `project ⇔ subject` garantida no módulo; `atlas remember --category/--subject`, `atlas memory list --category`; nota no ADR-0011; **fecha por inteiro o gate 1.3 — último gate aberto da Fase 1**) | Done |
| [SPEC-0030](../implementation/specs/SPEC-0030-query-aware-memory-recall.md) | Injeção de memória guiada pela consulta do turno (`MemoryService.prompt({ query?, limit? })` consumido pelo Cognitive Core, `MEMORY_RECALL_LIMIT = 20`; fecha a fatia futura nomeada pela SPEC-0027; candidato de 1.3, não gate — todos os gates da Fase 1 já fechados) | Done |
| [SPEC-0031](../implementation/specs/SPEC-0031-desktop-foundation.md) | Desktop Foundation — primeira janela do app desktop `apps/desktop`/`@atlas/desktop` sobre Electron (ADR-0019; round-trip mínimo `status`; Core só no main process, IPC via `contextBridge`; `NODE_OPTIONS=--import=tsx` estende o ADR-0005 ao Electron; abre a Fase 2, item 2.1, primeira fatia) | Done |
| [SPEC-0032](../implementation/specs/SPEC-0032-desktop-confirm-steps-adapters.md) | Desktop: adapters de confirmação e traço de execução — `ConfirmPort` de diálogo nativo (`confirm-port.ts`) + traço visual de `steps` (`steps-view.ts`) + consumo `ask` de tiro único (`resolveAskSnapshot`), fechando a fatia 2.1-restante do Roadmap; `respond`/multi-turno seguem para o item 2.2 | Done |
| [SPEC-0033](../implementation/specs/SPEC-0033-desktop-visual-chat.md) | Desktop: chat visual multi-turno — Core mantido vivo entre turnos no main process (`openChatSession`/`sendChatTurn`/`closeChatSession`), sessão viva pelo Context Service, reusando adapters da SPEC-0032; equivalente GUI do `atlas chat`; primeira linha do item 2.2, voz (2.3) e gerência visual (2.4) seguem futuras | Done |

Detalhes de retomada: `docs/05-context/NEXT_CONTEXT.md`.
