# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este repositório

Project Atlas: plataforma de IA pessoal organizada como **monólito modular**, orientada por um ciclo cognitivo (compreensão → raciocínio → planejamento → execução → observação → aprendizado → resposta). A primeira Persona oficial será **Jarvis**. Este repositório é o workspace raiz; a plataforma principal viverá em `atlas-core`.

**Estado em julho/2026: plataforma mínima operável (SPEC-0002).** `@atlas/contracts` e `@atlas/core` existem: `createAtlas()` sobe até `ready`, expõe config validada/congelada e desliga com segurança. Próximo: `apps/cli` na SPEC-0003 (cli-foundation).

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
- Estrutura obrigatória de toda SPEC: `implementation/templates/SPEC-TEMPLATE.md`; SPECs vivem em `implementation/specs/`
- Ao concluir uma SPEC: registre as lições aprendidas em `implementation/LESSONS_LEARNED.md` — é parte da Definition of Done
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
| Workspace multi-projeto (atlas-core, atlas-desktop...) e dependências entre projetos | `docs/03-architecture/WorkspaceStrategy.md` |
| Processo oficial de desenvolvimento e SPECs | `docs/04-engineering/DevelopmentGuide.md` |
| Escrever uma nova SPEC | `implementation/templates/SPEC-TEMPLATE.md` |
| Concluir uma SPEC; consultar aprendizados de SPECs anteriores | `implementation/LESSONS_LEARNED.md` |
| Entry point para humanos; ordem de leitura em camadas | `PROJECT.md` |

Os termos do projeto têm significado técnico preciso — na dúvida sobre um termo, consulte o Glossary antes de inferir.

## Referenciado na documentação, mas ainda não criado

Para evitar buscas inúteis — os itens abaixo são citados pela documentação, porém **ainda não existem**:

- Roadmap
- `apps/cli` → nasce na SPEC-0003 (cli-foundation); demais packages do catálogo conforme SPECs futuras

Quando um desses artefatos for criado, atualize esta seção (e remova-a quando esvaziar).
