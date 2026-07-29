# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este repositório

Project Atlas: plataforma de IA pessoal organizada como **monólito modular**, orientada por um ciclo cognitivo (compreensão → raciocínio → planejamento → execução → observação → aprendizado → resposta). A primeira Persona oficial será **Jarvis**. Este repositório é o workspace raiz; a plataforma principal viverá em `atlas-core`.

**Estado em julho/2026 (resumo — detalhe completo em `docs/05-context/PLATFORM_STATE.md`):**

- **Ciclo cognitivo completo nas 7 etapas** (compreensão → raciocínio → planejamento → execução → observação → aprendizado → resposta), SPECs 0002–0020 `Done`.
- **Packages**: `@atlas/contracts` (contratos públicos), `@atlas/core` (`createAtlas()`, único orquestrador), `@atlas/model-gateway` (provedores `fake`/`local`-Ollama/`remote`), `@atlas/cognitive` (Planner + Observer + Learner puros; `ask`/`respond` orquestram planejamento + execução com teto de 1 replanejamento; desde a SPEC-0026/ADR-0018, o Planner também **seleciona automaticamente** no máximo uma Skill por turno e o Cognitive Core injeta suas `instructions` na composição, invisível ao usuário), `@atlas/runtime` (executa planos, aplica veredictos, fluxo `confirm`), `@atlas/tools` (`clock`/`calc`/`read_file`/`list_dir`/`write_file`/`delete_file`/`mkdir`/`append_file`, portas de IO com fecho atômico TOCTOU; desde a SPEC-0028, também `git_status`/`git_diff`/`git_log` somente-leitura, primeiras Tools da especialidade de desenvolvimento de software, com o toplevel real do repositório contido às `readRoots`), `@atlas/permissions` (contenção lexical sobre `realpath`, `evaluate` puro/síncrono + `isContained`), `@atlas/context` (conversa por sessão), `@atlas/persona` (`jarvis`/`neutral`), `@atlas/memory` (fatos persistentes, JSON, proveniência `user`/`learned`; desde a SPEC-0029, classificado por categoria — `fact`/`episode`/`project`, `subject` obrigatório em `project`, invariante garantida no módulo — fechando o último gate da Fase 1), `@atlas/skills` (Skill Registry em memória + Skill Builder de 8 passos, ADR-0017; **consumido automaticamente pelo Planner desde a SPEC-0026/ADR-0018** — gate 1.4 do Roadmap fechado por inteiro).
- **CLI** (`apps/cli`, via `tsx`, sem `dist/`): `atlas status` / `ask` / `chat` (multi-turno com Tools e `confirm`) / `remember "<texto>" [--category fact|episode|project] [--subject <projeto>]` / `forget` / `memory list [--category <c>]` / `memory dedupe [--apply]` (consolidação determinística do acervo legado, dry-run por default) / `memory search "<consulta>"` (busca determinística por overlap de tokens) / `skills list` / `skills build "<capacidade>"`; config por `flags > env > defaults`; múltiplas raízes `--allow-read`/`--allow-write` (repetíveis; env com `path.delimiter`); `writeRoots` default vazio (opt-in).
- **Desktop** (`apps/desktop`, `@atlas/desktop`; SPEC-0031/0032/0033/0034/0035/0036/0037/0038, [ADR-0019](docs/06-adr/ADR-0019-desktop-electron-stack.md), Electron): primeira interface gráfica do Atlas — abre a **Fase 2** do Roadmap. Round-trip `status` (SPEC-0031) e round-trip `ask` de tiro único (SPEC-0032, stateless: sobe e desliga o Core por chamada), com `ConfirmPort` de diálogo nativo (`dialog.showMessageBox`, fail-closed) para Tools destrutivas e traço visual de `steps` (`formatSteps`); desde a SPEC-0033, também um **chat visual multi-turno** com o Core mantido **vivo entre turnos** no main process (`openChatSession`/`sendChatTurn`/`closeChatSession`, equivalente GUI do `atlas chat`), sessão viva pelo Context Service (`atlas.context`), reusando os mesmos adapters de diálogo/traço; desde a SPEC-0034, também um painel de **gerência visual de memória** — listar e esquecer fatos (`resolveMemorySnapshot`/`forgetFact`, stateless, equivalente GUI de `atlas memory list`/`atlas forget`), primeira das três linhas do item 2.4; desde a SPEC-0035, também **saída de voz (TTS)** — botão "🔊 Ouvir" por resposta do chat, via `window.speechSynthesis`/`SpeechSynthesisUtterance` (Web Speech API embutida no Chromium, sem dependência de runtime nova), num módulo puro `src/speech-output.ts` (`createSpeechOutput`), primeira fatia do item 2.3; desde a SPEC-0036, essa saída fica restrita a **vozes locais do SO** (`SpeechSynthesisVoice.localService === true`, explicitamente vinculada ao enunciado), fail-closed — sem voz local, não fala, nunca cai numa voz de rede como alternativa (garantia condicional a o SO/navegador reportarem `localService` corretamente); desde a SPEC-0037, também **seleção e troca de Persona em runtime** — um seletor lista as Personas (`jarvis`/`neutral`), marca a ativa e troca sem reiniciar a app, via `listPersonas`/`selectPersona`/`selectedPersonaId` (`core-bridge.ts`; catálogo lido por re-export em `@atlas/core`, `createPersonaService`/`PERSONA_IDS`, preservando o composition root do ADR-0003), segunda das três linhas do item 2.4; trocar de Persona encerra as sessões de chat vivas e um turno em voo bloqueia a troca; a seleção não é durável (volta à Persona da config ao reabrir a app); desde a SPEC-0038, também um painel de **configuração de permissões** (`readRoots`/`writeRoots`) em runtime — via `selectPermissionRoots`/`selectedPermissionRoots` (`core-bridge.ts`), ampliar `writeRoots` exige consentimento explícito num diálogo de **concessão de política** dedicado (`permission-grant-dialog.ts`, distinto do `ConfirmPort` de ação pontual), aplicação é tudo-ou-nada e recusada com qualquer operação em voo (rastreio generalizado a toda função que sobe um Core capaz de executar Tools), encerra as sessões de chat vivas ao aplicar, e não é durável (volta às raízes de `flags > env > defaults` ao reabrir a app) — **terceira e última linha do item 2.4, que fecha por inteiro**. Entrada por voz (STT)/wake word (2.3-restante) e criar Persona pela GUI ficam para fatias futuras, ambas com escalação obrigatória (ADR novo). `pnpm --filter @atlas/desktop start` abre a janela. O Core vive só no main process (`src/core-bridge.ts` testável sem Electron + `src/main.ts` casca fina); o renderer fala com o main só por IPC (`contextIsolation: true`, `nodeIntegration: false`). Sem `dist/`: main process via `NODE_OPTIONS=--import=tsx electron ./src/main.ts` (extensão do ADR-0005 ao Electron).
- **Infra**: repo privado `nahoL13/Atlas` (single-branch `main`), CI em `.github/workflows/ci.yml` (lint/typecheck/test/format:check).
- Antes de mexer em qualquer módulo: `docs/03-architecture/ModuleCatalog.md`; APIs e limitações exatas: `PLATFORM_STATE.md` e os ADRs.

**Nova sessão ou retomada de trabalho: leia `docs/05-context/NEXT_CONTEXT.md` antes de qualquer coisa.**

## Comandos

- `pnpm install` — instala o workspace (Node ≥ 24, pnpm ≥ 11 via corepack)
- `pnpm lint` — ESLint (flat config, typescript-eslint)
- `pnpm format` / `pnpm format:check` — Prettier (arquivos `.md` são ignorados por design)
- `pnpm typecheck` — TypeScript sem emissão
- `pnpm test` — Vitest
- `pnpm build` — build recursivo (no-op até existirem packages)

Nota: `typescript` está pinado na série 5 até o typescript-eslint suportar o TS 7 (ver LESSONS_LEARNED).

## Invariantes (não negociáveis)

Destilados de `docs/00-project/ArchitectureConstitution.md` (15 artigos) — em conflito, a Constituição prevalece:

1. **A documentação é a fonte oficial da verdade.** Nenhuma decisão arquitetural existe apenas no código; mudanças estruturais são documentadas antes ou junto da implementação.
2. **Nenhuma implementação sem SPEC aprovada.** Nunca implemente a partir de pedido informal; uma SPEC por vez. Desde a Emenda v1.1 da Constituição (2026-07-20), a aprovação `Draft → Ready` é o gate do `architecture-reviewer` — não exige veto humano.
3. **A IA é colaboradora, não arquiteta.** Não crie módulos/Skills/Personas sem documentação correspondente, não mova responsabilidades. Respeite o Module Catalog. Emenda à Constituição, módulo novo e ADR novo continuam decisões humanas (escalação obrigatória da Emenda v1.1).
4. **O Core é o único orquestrador.** Módulos têm responsabilidade única e se comunicam apenas por contratos públicos, nunca por detalhes internos de outro módulo.
5. **Ferramentas são adaptadores**: interagem com recursos externos e não contêm lógica de negócio nem tomada de decisão.
6. **Memória tem autoridade exclusiva sobre estado persistente.** Contexto (estado da execução) e memória (conhecimento persistente) são conceitos distintos e separados.
7. **O usuário percebe uma única Persona.** Skills, planejadores e coordenação interna são invisíveis para ele.
8. **Em caso de dúvida ou inconsistência entre documentos, pare e registre** — nunca assuma comportamento não documentado.

Teste para qualquer decisão: *"isto torna o Atlas mais simples, mais modular, mais transparente e mais sustentável?"* Se não, reconsidere antes de incorporar.

## Fluxo de desenvolvimento

Ideia → existe no PRD? → existe módulo responsável? → SPEC → implementação → testes → atualização da documentação → review → merge. Nenhuma etapa é pulada.

- Processo completo, características de uma boa SPEC e diretrizes para IA: `docs/04-engineering/DevelopmentGuide.md`
- **O pipeline de SPEC é autônomo de ponta a ponta** (Emenda v1.1): "faz a SPEC de X" dispara `spec-drafter` (decide sozinho, decisões em formato de veto na SPEC) → `architecture-reviewer` (gate: aprovação autoriza `Draft → Ready`; 2º veto escala ao usuário) → `spec-implementer` → `spec-validator` (2ª reprovação escala) → `spec-closer` (`lessons-learned` + `doc-sync` + commit/push, num cold-start só). O fio principal é só despachante: repassa relatórios sem re-narrar e aplica as transições de `Status`. Ver `docs/04-engineering/ClaudeCodeAutomation.md`. Ao receber "faz/cria/continua a SPEC de X", delegue **imediatamente** ao `spec-drafter`, sem devolver perguntas de design ao usuário no fio principal: as decisões de design deriváveis da documentação são do `spec-drafter` (que decide e registra em formato de veto). Fazer design Q&A inline é o mesmo erro que implementar inline — o ping-pong de perguntas é o anti-padrão caro que esta automação existe para matar; se perceber que começou, pare e delegue. Do mesmo modo, antes de editar qualquer arquivo em `packages/*/src` ou `apps/*/src` por causa de uma SPEC, pare: esse edit pertence ao `spec-implementer` (não os skills genéricos `superpowers:*`). Implementar (ou desenhar) inline e redelegar paga o contexto duas vezes.
- **Ramo micro (Emenda v1.2):** SPECs pequenas (contidas a um package + opcionalmente a CLI que o expõe, aditivas, sem tocar `@atlas/contracts`, sem módulo/Tool/Skill/Persona novo, sem ADR/emenda) seguem um fast-path. O `spec-drafter` classifica o `Perfil` (`micro`/`completo`) e o `architecture-reviewer` confirma no gate (modo leve). No `micro`, o `spec-validator` separado é dispensado — o `spec-closer` valida (testes/lint + Critérios de Aceitação) e fecha num cold-start só. Na dúvida, `completo` (default seguro). Salvaguardas preservadas: gate do reviewer e autor≠verificador. Detalhe em `docs/04-engineering/ClaudeCodeAutomation.md` ("Ramo micro").
- Estrutura obrigatória de toda SPEC: `docs/implementation/templates/SPEC-TEMPLATE.md`; SPECs vivem em `docs/implementation/specs/`
- Ao concluir uma SPEC: registre as lições aprendidas em `docs/implementation/LESSONS_LEARNED.md` — é parte da Definition of Done
- Antes de começar uma SPEC nova: consulte `docs/05-context/TOKEN_USAGE_LOG.md` para estimar o custo em tokens pela SPEC concluída mais parecida em tamanho, e decidir se cabe na sessão atual ou se é melhor esperar a próxima janela (regenere com `python3 scripts/claude-usage-report.py`)
- Conflito entre documentos: prevalece a ordem de prioridade definida em `docs/04-engineering/DevelopmentGuide.md` (PROJECT.md → Vision → Constitution → ... → SPEC).

## Mapa da documentação (leia sob demanda)

| Se a tarefa envolve... | Leia |
|---|---|
| Propósito, missão, o que o Atlas NÃO é | `docs/01-vision/Vision.md` |
| Regras permanentes; conflito entre solução técnica e arquitetura | `docs/00-project/ArchitectureConstitution.md` |
| Criar/remover módulos, Skills ou Personas; mudanças estruturais | `docs/00-project/ArchitectureDecisionProcess.md` |
| Significado preciso de termos (Persona, Skill, Tool, Planner, SPEC...) | `docs/00-project/Glossary.md` |
| Requisitos funcionais/não funcionais, escopo do MVP, fora de escopo | `docs/02-product/ProductRequirementsDocument.md` |
| As 7 etapas do ciclo cognitivo que a arquitetura implementa | `docs/03-architecture/CognitiveLifecycle.md` |
| O porquê do desenho; critérios para novos componentes | `docs/03-architecture/ArchitecturePrinciples.md` |
| Camadas (Platform, Intelligence, Execution, Support) e fluxo principal | `docs/03-architecture/SystemArchitecture.md` |
| Responsabilidades e limites de cada módulo — **obrigatório antes de mexer em qualquer módulo** | `docs/03-architecture/ModuleCatalog.md` |
| Onde cada tipo de arquivo deve ficar (apps/, packages/, tooling/...) | `docs/03-architecture/ProjectStructure.md` |
| Context Service (`packages/context`): detentor do estado temporário de conversa por sessão; quem medeia (app vs. Cognitive) | `docs/06-adr/ADR-0009-context-service-value-store.md` |
| Persona Service (`packages/persona`): identidade injetada na geração; por que o Cognitive não conhece o conceito de Persona | `docs/06-adr/ADR-0010-persona-injected-generation.md` |
| Memory Service (`packages/memory`): conhecimento persistente atrás de porta de storage injetável; memória injetada na geração; Memória × Contexto | `docs/06-adr/ADR-0011-memory-service-persistence.md` |
| Espinha de execução (`packages/planner` consolidado em `packages/cognitive`, `packages/runtime`, `packages/tools`): plano estruturado Planner-driven, Runtime executa Tools, Gateway intacto, passos independentes | `docs/06-adr/ADR-0012-planner-runtime-execution.md` |
| Permission Service (`packages/permissions`): portão puro/síncrono na execução; Tools declaram `requirements` como dado; Runtime aplica o veredicto; contenção lexical (symlink adiado); `confirm` reservado | `docs/06-adr/ADR-0013-permission-service-execution-gate.md` |
| Workspace multi-projeto (atlas-core, atlas-desktop...) e dependências entre projetos | `docs/03-architecture/WorkspaceStrategy.md` |
| Processo oficial de desenvolvimento e SPECs | `docs/04-engineering/DevelopmentGuide.md` |
| Escrever uma nova SPEC | `docs/implementation/templates/SPEC-TEMPLATE.md` |
| Concluir uma SPEC; consultar aprendizados de SPECs anteriores | `docs/implementation/LESSONS_LEARNED.md` |
| Subagents (`spec-drafter`/`spec-implementer`/`spec-validator`), skills, hooks e log de custo de token por SPEC no Claude Code | `docs/04-engineering/ClaudeCodeAutomation.md` |
| Macro-fases de longo prazo (Núcleo completo → Interface `apps/desktop` → Expansão), sem datas; qual fase uma ideia nova pertence | `docs/04-engineering/Roadmap.md` |
| Entry point para humanos; ordem de leitura em camadas | `PROJECT.md` |

Os termos do projeto têm significado técnico preciso — na dúvida sobre um termo, consulte o Glossary antes de inferir.

## Referenciado na documentação, mas ainda não criado

Para evitar buscas inúteis — os itens abaixo são citados pela documentação, porém **ainda não existem**:

- demais packages do catálogo conforme SPECs futuras

Quando um desses artefatos for criado, atualize esta seção (e remova-a quando esvaziar).
