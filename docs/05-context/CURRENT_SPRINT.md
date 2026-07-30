# CURRENT_SPRINT

> **Project Atlas — Estado do Trabalho Atual**

Atualizado em: 2026-07-30 (SPEC-0041)

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
| [SPEC-0034](../implementation/specs/SPEC-0034-desktop-visual-memory-management.md) | Desktop: gerência visual de memória — listar e esquecer fatos (`resolveMemorySnapshot`/`forgetFact`, stateless, `MemoryService.list`/`forget`), equivalente GUI de `atlas memory list`/`atlas forget`; primeira linha do item 2.4, troca de Persona em runtime e permissões por GUI seguem futuras | Done |
| [SPEC-0035](../implementation/specs/SPEC-0035-desktop-voice-output-tts.md) | Desktop: saída de voz (TTS) — botão "🔊 Ouvir" por resposta do chat (`speech-output.ts`/`createSpeechOutput`, via `window.speechSynthesis`), primeira fatia do item 2.3; STT/wake word adiados a ADR novo (Escalação E1) | Done |
| [SPEC-0036](../implementation/specs/SPEC-0036-desktop-tts-local-voice-only.md) | Desktop: TTS 100% offline garantido — restringir a saída de voz a vozes locais do SO (`localService === true`, `voiceURI` vinculado ao enunciado, fail-closed sem voz local); endurece a fatia da SPEC-0035, mesmo item 2.3 | Done |
| [SPEC-0037](../implementation/specs/SPEC-0037-desktop-runtime-persona-switch.md) | Desktop: seleção e troca de Persona em runtime pela interface gráfica (`listPersonas`/`selectPersona`, re-export de catálogo em `@atlas/core`, ADR-0003 preservado); segunda das três linhas do item 2.4, troca encerra sessões de chat vivas | Done |
| [SPEC-0038](../implementation/specs/SPEC-0038-desktop-permission-roots-gui.md) | Desktop: configuração de permissões (`readRoots`/`writeRoots`) pela interface gráfica (`selectPermissionRoots`/`GrantConfirmPort` de concessão, fail-closed, rastreio generalizado de operação em voo); terceira e última linha do item 2.4 — **fecha o item por inteiro** | Done |
| [SPEC-0039](../implementation/specs/SPEC-0039-desktop-persona-authoring.md) | Desktop: CRUD de Personas custom pela interface gráfica (formulário com os 8 campos de `Persona`, `PersonaStorage` injetável no molde do ADR-0011, `Persona.voiceURI?` vinculado ao TTS com fallback fail-closed); consome o ADR-0020 (novo, Accepted); estende a linha de Persona do item 2.4 (já fechado por inteiro) | Done |
| [SPEC-0040](../implementation/specs/SPEC-0040-desktop-piper-neural-tts.md) | Desktop: Piper como motor de TTS neural local (`piper-tts.ts`, processo de longa duração, contrato de invocação pinado v1.2.0), `resolveVoiceBackend` com fallback fail-closed para a Web Speech API das SPECs 0035/0036; consome o ADR-0021 (novo, Accepted); continua o item 2.3 Voz (critério 25 pendente de verificação humana) | Done |
| [SPEC-0041](../implementation/specs/SPEC-0041-desktop-piper-only-voice-surface.md) | Desktop: superfície de voz Piper-only — `<select>` de Persona lista só vozes Piper e a preferência de SO persistida deixa de ser honrada quando `PiperTts.isAvailable()` (via IPC novo) responde `true`; reverte a precedência da SPEC-0040/D8 como política de superfície, fallback fail-closed do ADR-0021(c) intacto; continua o item 2.3 Voz (critério 25 da SPEC-0040 ganha mais cenários) | Done |

Detalhes de retomada: `docs/05-context/NEXT_CONTEXT.md`.
