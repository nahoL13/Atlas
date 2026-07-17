# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este repositório

Project Atlas: plataforma de IA pessoal organizada como **monólito modular**, orientada por um ciclo cognitivo (compreensão → raciocínio → planejamento → execução → observação → aprendizado → resposta). A primeira Persona oficial será **Jarvis**. Este repositório é o workspace raiz; a plataforma principal viverá em `atlas-core`.

**Estado em julho/2026: interface executável (SPEC-0003) + acesso a modelos de IA (SPEC-0004) + primeira resposta cognitiva ponta a ponta (SPEC-0005) + conversa interativa multi-turno (SPEC-0006) + Context Service (SPEC-0007) + Persona Service (SPEC-0008) + Memory Service (SPEC-0009) + espinha de execução Planner/Runtime/Tools (SPEC-0010) + Permission Service e primeiras Tools de leitura de sistema de arquivos (SPEC-0011) + primeira Tool de escrita (`write_file`) sob política `writeRoots` opt-in (SPEC-0012).** Além de `@atlas/contracts` e `@atlas/core` (`createAtlas()` sobe até `ready`, expõe config validada/congelada, compõe o Model Gateway + Tool Registry + Permission Service + Runtime + Cognitive Core + Context Service + Persona Service + Memory Service e desliga com segurança), existe `apps/cli` (`@atlas/cli`): `atlas status` sobe a plataforma pelo terminal, mostra estado e config resolvida (precedência `flags > env > defaults`, incluindo `readRoots`) e desliga com segurança; `atlas ask "<objetivo>"` envia um objetivo ao núcleo cognitivo e imprime a resposta (default provider `local`/Ollama; `remote`/`fake` por config); `atlas chat` abre uma conversa interativa multi-turno (mesmos provedores; histórico lembrado durante a sessão via `@atlas/context`, ADR-0008/0009); `atlas --help`/`--version` também existem. Execução do fonte via `tsx` (ADR-0005), sem `dist/`. Existe também `@atlas/model-gateway`: `createModelGateway(config)` expõe `generate()` (geração única) com provedor selecionável por config — `fake` (testes), `local`/Ollama (grátis) e `remote` (pago, OpenAI-compatible); provedores de rede recebem `fetch` por parâmetro (testados sem rede) e há um smoke script para verificação real. Seu primeiro consumidor é `@atlas/cognitive`: `createCognitiveCore({ gateway, runtime, personaPrompt?, memoryPrompt? })` → `ask(objetivo)` **orquestra** Planejamento + Execução (ADR-0012, deixou de ser tiro único): 1ª chamada `generate` (system prompt composto — `personaPrompt` (identidade) + `memoryPrompt` (fatos) + `TASK_FRAMING`, na ordem identidade → memória → tarefa, ADR-0010/0011 — mais a instrução do Planner com o catálogo de Tools) → o **Planner** puro (consolidado no package: `createPlanner()` com `instruction`/`parse`, sem gateway) parseia a saída num `Plan` ou `null`; sem plano, responde direto em 1 chamada; com plano, `runtime.execute` roda as Tools e uma 2ª chamada compõe a resposta final. `ask` retorna `AskResult { text; steps? }`. `startConversation()`/`respond(conversation, input)` sustentam conversa multi-turno como dado, sem planejamento, mantendo o Core sem estado (ADR-0008). Existe `@atlas/tools` (`createToolRegistry` + Tools puras `clock`/`calc`, sem `requirements`, `calc` sem `eval`; as primeiras Tools com **IO de leitura** — `read_file`/`list_dir` — que declaram `requirements(args) → ActionRequest` (`access: 'read'`) e leem o disco por uma porta injetável `FsReadPort`, default `nodeFsReadPort()`; e a primeira Tool de **escrita** — `write_file` (`{ path, content }`, cria/sobrescreve) — que declara `requirements` com `access: 'write'` e escreve pela porta injetável separada `FsWritePort`, default `nodeFsWritePort()`) e `@atlas/runtime` (`createRuntime({ registry, permissions })` → `execute(plan)` sequencial com falhas estruturadas que nunca derrubam a execução + `tools()`; por passo com `requirements`, consulta `permissions.evaluate` antes de rodar a Tool — veredicto diferente de `allowed` vira `ExecutedStep` negado e a Tool não roda); o modelo produz o plano em JSON (Planner-driven) e o Runtime o executa deterministicamente, com o Model Gateway **intacto**. `atlas ask` mostra um traço compacto das Tools executadas (incluindo passos bloqueados, com o motivo). O contrato do Model Gateway e o `CognitiveCore` vivem em `@atlas/contracts` (ADR-0007). Existe também `@atlas/context` (`createContextService()` → store de sessão em memória que guarda a `Conversation` por sessão; o `atlas chat` usa-o como detentor, ADR-0008/0009; `respond` segue puro). Existe também `@atlas/persona` (`createPersonaService()` → registro de Personas `jarvis`/`neutral`; a identidade da Persona ativa é injetada na geração do Cognitive, ADR-0010; `atlas ask`/`atlas chat` respondem na voz da Persona; `atlas status` a exibe, `atlas chat` a saúda; seleção por `--persona`/`ATLAS_PERSONA`, default `jarvis`). Existe também `@atlas/memory` (`createMemoryService({ storage })` → autoridade de conhecimento persistente; fatos/preferências explícitos guardados atrás de uma porta de storage injetável, adapter JSON default; `memory.prompt()` é injetado na geração do Cognitive, ADR-0011; `atlas remember "<fato>"`/`atlas forget <id>`/`atlas memory list` gerenciam; caminho por `--memory-path`/`ATLAS_MEMORY_PATH`, default `~/.atlas/memory.json`; Memória persistente × Contexto temporário seguem distintos). Existe também `@atlas/permissions` (`createPermissionService({ readRoots, writeRoots })` → `evaluate(action)` **puro e síncrono, sem IO**; roteia por `access` — `read` contra `readRoots`, `write` contra `writeRoots` — julgando por **contenção lexical** (dentro da raiz → `allowed`, fora/vazio → `blocked` com motivo); grants de leitura e escrita **independentes**; symlink/`realpath` não seguidos, limitação conhecida; `confirm` ainda reservado; ADR-0013). `config.permissions.readRoots` (default `[cwd]`, override `--allow-read`/`ATLAS_ALLOW_READ`) e `config.permissions.writeRoots` (default `[]` — não escreve sem opt-in explícito, override `--allow-write`/`ATLAS_ALLOW_WRITE`), precedência `flags > env > defaults`, definem as políticas de leitura e escrita.

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
2. **Nenhuma implementação sem SPEC aprovada.** Nunca implemente a partir de pedido informal; uma SPEC por vez.
3. **A IA é colaboradora, não arquiteta.** Não altere arquitetura, não crie módulos/Skills/Personas sem documentação correspondente, não mova responsabilidades. Respeite o Module Catalog.
4. **O Core é o único orquestrador.** Módulos têm responsabilidade única e se comunicam apenas por contratos públicos, nunca por detalhes internos de outro módulo.
5. **Ferramentas são adaptadores**: interagem com recursos externos e não contêm lógica de negócio nem tomada de decisão.
6. **Memória tem autoridade exclusiva sobre estado persistente.** Contexto (estado da execução) e memória (conhecimento persistente) são conceitos distintos e separados.
7. **O usuário percebe uma única Persona.** Skills, planejadores e coordenação interna são invisíveis para ele.
8. **Em caso de dúvida ou inconsistência entre documentos, pare e registre** — nunca assuma comportamento não documentado.

Teste para qualquer decisão: *"isto torna o Atlas mais simples, mais modular, mais transparente e mais sustentável?"* Se não, reconsidere antes de incorporar.

## Fluxo de desenvolvimento

Ideia → existe no PRD? → existe módulo responsável? → SPEC → implementação → testes → atualização da documentação → review → merge. Nenhuma etapa é pulada.

- Processo completo, características de uma boa SPEC e diretrizes para IA: `docs/04-engineering/DevelopmentGuide.md`
- **Implementação e verificação de uma SPEC `Ready`/`In Progress` são delegadas aos subagents `spec-implementer`/`spec-validator`** (não execução inline no fio principal, e não os skills genéricos `superpowers:executing-plans`/`superpowers:subagent-driven-development`) — ver `docs/04-engineering/ClaudeCodeAutomation.md` antes de implementar ou validar qualquer SPEC.
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
| Entry point para humanos; ordem de leitura em camadas | `PROJECT.md` |

Os termos do projeto têm significado técnico preciso — na dúvida sobre um termo, consulte o Glossary antes de inferir.

## Referenciado na documentação, mas ainda não criado

Para evitar buscas inúteis — os itens abaixo são citados pela documentação, porém **ainda não existem**:

- Roadmap
- demais packages do catálogo conforme SPECs futuras

Quando um desses artefatos for criado, atualize esta seção (e remova-a quando esvaziar).
