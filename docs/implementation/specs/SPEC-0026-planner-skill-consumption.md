# Implementation Specification

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0026

---

**Título**

Consumo de Skills no laço cognitivo — seleção automática pelo Planner

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

- [ ] Critical
- [x] High
- [ ] Medium
- [ ] Low

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 1 — 1.4 Skills` (fecho da fatia de consumo: seleção e aplicação automática de Skills no laço cognitivo, que a SPEC-0025 deixou como candidato).

---

# Objetivo

Ao concluir esta SPEC, o laço cognitivo passa a **selecionar e aplicar automaticamente** uma Skill registrada, sem o usuário escolher. Concretamente:

- O **Planner** ganha o catálogo de Skills como entrada: `instruction(tools, skills?)` lista as Skills registradas **por metadados** (`id`/`name`/`description`) junto do catálogo de Tools; a saída estruturada do modelo pode indicar **no máximo uma** Skill selecionada por `id`.
- Quando o modelo produz um `Plan` que seleciona uma Skill, as `instructions` dessa Skill são **injetadas como dado** na `generate()` de composição da resposta (no molde de Persona/Memory — ADR-0010/0011), tornando o conhecimento especializado da Skill parte do turno.
- A seleção é **automática** (PRD, Especialização: "o usuário não deve precisar selecionar manualmente"), **opcional** (turno sem Skill = comportamento de hoje, preservado) e **limitada a uma Skill por turno**.
- A Skill selecionada permanece **invisível ao usuário** (Constituição, Artigo 9 — especialização invisível; Artigo 2 — uma única Persona): sua contribuição é interna à geração, como já são Persona e Memory.

A fatia consome as Skills **registradas no processo** — na prática as `permanent` semeadas (`BUILTIN_SKILLS`). Skills `temporary` construídas pelo Builder **não** são consumíveis entre invocações (não há persistência — limitação consciente herdada do ADR-0017/0018).

---

# Motivação

A SPEC-0025 (ADR-0017) materializou o Skill Registry e o Skill Builder, mas deixou o Registry **passivo**: nada no laço cognitivo consome Skills. O item **1.4 — Skills** do Roadmap ficou parcialmente entregue ("Skills existem como conceito implementado", mas sem consumo).

O **ADR-0018** (`Accepted`, decisão humana desta sessão) resolveu o gate de arquitetura: o consumo é por **seleção do Planner/modelo (forma A)**, automática. Esta SPEC implementa essa decisão dentro da fronteira fixada pelo ADR, fechando o gate 1.4 por inteiro e cumprindo o requisito de Especialização do PRD ("escolher automaticamente a estratégia mais adequada", "não selecionar manualmente").

---

# Referências

- [ADR-0018 — Consumo de Skills no laço cognitivo: seleção pelo Planner](../../06-adr/ADR-0018-planner-skill-consumption.md) (fixa forma e fronteiras desta SPEC)
- [ADR-0017 — Skills: Registry passivo + Builder](../../06-adr/ADR-0017-skills-registry-builder.md) (superado parcialmente pelo ADR-0018)
- [ADR-0010 — Persona injetada na geração](../../06-adr/ADR-0010-persona-injected-generation.md)
- [ADR-0011 — Memory Service](../../06-adr/ADR-0011-memory-service-persistence.md)
- [ADR-0012 — Planner/Runtime/Tools](../../06-adr/ADR-0012-planner-runtime-execution.md)
- [ADR-0015 — Observação e laço de replanejamento](../../06-adr/ADR-0015-observation-replan-loop.md) (molde do `denialKind?` aditivo)
- [PRD — Especialização](../../02-product/ProductRequirementsDocument.md)
- [Module Catalog — Planner (l. 341-381), Runtime (l. 470)](../../03-architecture/ModuleCatalog.md)
- [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md)
- [SPEC-0025 — Skills Registry + Builder](SPEC-0025-skills-registry-builder.md)
- [SPEC-0021 — Recomposição ao vivo do memoryPrompt](SPEC-0021-live-memory-prompt-recomposition.md)
- [SPEC-0019 — Observação e laço de replanejamento](SPEC-0019-observation-replan-loop.md)

---

# Escopo

- **`@atlas/contracts` (`execution.ts`)**: adicionar `Plan.skillId?: string`, campo **opcional/aditivo** (molde do `denialKind?` do ADR-0015) que registra a Skill selecionada num plano. Nenhum outro contrato muda de forma.
- **`@atlas/cognitive` — Planner (`planner.ts`)**: estender `instruction(tools, skills?)` para listar também o catálogo de Skills **ativas** por `id`/`name`/`description`, com framing que instrui o modelo a selecionar **no máximo uma** Skill por `id`; estender `parse` para ler um `skillId` opcional da saída (ao lado de `steps`). O Planner continua **puro** (sem gateway, sem IO); importa **apenas** o tipo `SkillDescriptor` de `@atlas/contracts`, nunca `@atlas/skills`.
- **`@atlas/cognitive` — Cognitive Core (`cognitive-core.ts`)**: adicionar a `CognitiveCoreDeps` uma porta de leitura de Skills, **opcional**, com projeção mínima do `SkillRegistry` (`list()` de descritores + `get(id)` da Skill completa). No `ask` e no `respond`, amostrar o catálogo 1x por turno e passá-lo a `planner.instruction`; após `parse`, se o `Plan` trouxer um `skillId` que **resolva** para uma Skill registrada, injetar as `instructions` dessa Skill na `generate()` de **composição** do turno (no molde Persona/Memory). `respond` continua **função pura**; o Core continua **sem estado**.
- **`@atlas/core` (`index.ts`)**: fiar a porta de leitura de Skills no `createCognitiveCore`, projetando o `SkillRegistry` já composto (`skills`) numa visão somente-leitura (`list`/`get`). Nenhuma nova porta injetável, nenhum novo package.
- **Testes** de Planner (instruction com Skills, parse de `skillId`), Cognitive Core (seleção → injeção de `instructions` na composição; `skillId` inexistente/ausente → turno normal; sem porta de Skills → comportamento de hoje) e Core (fiação da projeção).
- **Documentação específica da SPEC**: nota de atualização no ADR-0017/0018 se prevista; este arquivo de SPEC. Docs vivas ficam para o passo `doc-sync`.

---

# Fora do Escopo

- **Persistência de Skills** (porta de storage à la Memory/ADR-0011). Sem ela, Skills `temporary` construídas por `atlas skills build` **não** são consumíveis entre invocações — limitação consciente herdada do ADR-0017/0018. Não resolver aqui.
- **Múltiplas Skills por turno** — o corte é **uma** Skill por turno. Combinação/composição de Skills fica para fatia futura.
- **Seleção explícita pelo usuário** (forma B: flag/config de Skill ativa). O ADR-0018 preteriu a forma B; a seleção é sempre automática pelo Planner.
- **Tocar o Runtime**. A seleção é planejamento, não execução (Module Catalog l. 470: Runtime não escolhe Skills). O Runtime permanece agnóstico a Skills — não recebe `skills`, não filtra Tools por `toolIds`.
- **Gate/priorização de Tools pelos `toolIds` da Skill**. Nesta fatia os `toolIds` **não** filtram nem forçam a execução — o plano já contém os passos que o modelo escolheu. O efeito observável do consumo é a injeção das `instructions` na composição.
- **Surfacar a Skill selecionada ao usuário** (CLI, `AskResult`, `ConversationTurn`). A Skill é invisível (Artigo 9 — especialização invisível); `skillId` vive apenas no `Plan`, interno ao ciclo.
- **Novas Skills em `BUILTIN_SKILLS`** ou mudança na seed existente. A seed `skill-summarize-text` já traz `instructions` úteis e `toolIds: ['read_file']` resolvíveis — suficiente para o consumo não ser no-op.
- **Novos comandos ou flags na CLI.** `apps/cli` permanece intocado.
- **Promover `temporary`→`permanent`** ou qualquer mudança nas travas do Registry (ADR-0017 intacto).

---

# Pré-requisitos

- [SPEC-0025](SPEC-0025-skills-registry-builder.md) — `Done` (Skill Registry + `BUILTIN_SKILLS`).
- [SPEC-0021](SPEC-0021-live-memory-prompt-recomposition.md) — `Done` (amostragem 1x por turno; molde para amostrar o catálogo de Skills).
- [SPEC-0019](SPEC-0019-observation-replan-loop.md) — `Done` (`runPlanCycle`, molde do contrato aditivo `denialKind?`).
- [SPEC-0010](SPEC-0010-planner-runtime-tools.md) — `Done` (Planner puro, `instruction`/`parse`).

---

# Critérios de Aceitação

- `@atlas/contracts` expõe `Plan.skillId?: string` (opcional); código que constrói `Plan` sem o campo continua compilando.
- `planner.instruction(tools, skills)` inclui na string as Skills **ativas** por `id`/`name`/`description` (sem o corpo de `instructions`) e um framing que pede **no máximo uma** Skill por `id`. Com `skills` vazio/ausente, a string é idêntica ao comportamento anterior (sem seção de Skills).
- `planner.parse` retorna `Plan` com `skillId` preenchido quando a saída do modelo indica uma Skill válida junto de `steps`; retorna `Plan` **sem** `skillId` quando a saída não indica Skill; permanece `null` quando não há `steps`.
- Num turno (`ask` **e** `respond`) em que o modelo seleciona um `skillId` que **resolve** no Registry, a `generate()` de **composição** recebe um `systemPrompt` que **contém as `instructions`** dessa Skill (verificável nas mensagens enviadas ao gateway fake).
- Num turno em que o `skillId` **não resolve** (id inexistente/inativo) ou está **ausente**, o turno completa normalmente **sem** injetar `instructions` de Skill e **sem lançar** (comportamento de hoje preservado).
- Quando `CognitiveCoreDeps` é criado **sem** a porta de Skills, `ask`/`respond` funcionam exatamente como antes (Planner recebe catálogo de Skills vazio; nenhuma injeção).
- `AskResult` e `ConversationTurn` **não** ganham `skillId` nem qualquer campo que exponha a Skill; a saída ao usuário (CLI) é inalterada.
- O Planner **não** importa `@atlas/skills`; o Cognitive Core **não** importa `@atlas/skills`; o Runtime **não** recebe `skills`.
- `@atlas/core` fia a projeção somente-leitura do `SkillRegistry` no `createCognitiveCore`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` sem erros.

---

# Arquivos Esperados

```text
packages/contracts/src/execution.ts        # Plan.skillId?
packages/cognitive/src/planner.ts          # instruction(tools, skills?), parse -> skillId
packages/cognitive/src/planner.test.ts     # instrução com Skills, parse de skillId
packages/cognitive/src/cognitive-core.ts   # porta de leitura de Skills; injeção de instructions na composição
packages/cognitive/src/cognitive-core.test.ts (ou ask/respond tests)
packages/core/src/index.ts                 # fiação da projeção list/get
packages/core/... (teste de fiação, se aplicável)
```

---

# Componentes Impactados

- Planner (`@atlas/cognitive`)
- Cognitive Core (`@atlas/cognitive`)
- Contracts (`@atlas/contracts` — `Plan.skillId?`)
- Core / Composition root (`@atlas/core`)

Não impactados: Runtime, Permission Service, Tools, Model Gateway, Persona, Memory, Context, `apps/cli`, `@atlas/skills` (código de produção).

---

# Interfaces Necessárias

- **`Plan.skillId?: string`** (contrato aditivo).
- **`Planner.instruction(tools, skills?)`** — o segundo parâmetro é uma lista de `SkillDescriptor` (opcional, default catálogo vazio). `parse` passa a devolver `skillId` opcional no `Plan`.
- **Porta de leitura de Skills em `CognitiveCoreDeps`** — projeção somente-leitura do `SkillRegistry`, **tipo interno a `@atlas/cognitive`** (não sobe a `@atlas/contracts`, no molde do `memoryPrompt` provider da SPEC-0021). Forma mínima: `{ list(): readonly SkillDescriptor[]; get(id: string): Skill | undefined }`, **opcional**. Ver Decisão 2.

---

# Fluxo Esperado

```text
ask/respond (Cognitive Core)
  amostra memoryValue (1x/turno)  +  amostra catálogo de Skills (1x/turno)
        ↓
  planner.instruction(runtime.tools(), skillDescriptors)   → framing Tools + Skills
        ↓
  gateway.generate (planejamento)  → planner.parse → Plan { steps, skillId? } | null
        ↓
  sem Plan  → resposta direta (1 chamada), SEM Skill (comportamento de hoje)
  com Plan  → runtime.execute → observe → (replan até teto) 
        ↓
        resolve skillId? no catálogo (get)
          resolve → compõe systemPrompt de composição COM instructions da Skill
          não resolve/ausente → systemPrompt de composição sem Skill
        ↓
        gateway.generate (composição)  → resposta final
        ↓
        extração (Aprendizado, inalterado)
```

---

# Estratégia de Implementação

1. **Contrato**: adicionar `Plan.skillId?: string` em `@atlas/contracts/execution.ts`.
2. **Planner**: estender `instruction` para receber `skills?: readonly SkillDescriptor[]` e emitir a seção de Skills (só ativas; só metadados) com framing de "no máximo uma"; estender `parse` para ler `skillId` opcional. Preservar exatamente o caminho sem Skills (string idêntica quando vazio).
3. **Cognitive Core**: adicionar a porta de leitura opcional em `CognitiveCoreDeps`; amostrar `list()` 1x por turno em `ask`/`respond` e passar a `planner.instruction`; propagar a resolução do `skillId` (via `get`) para dentro do `runPlanCycle`, ajustando o builder de mensagens de composição para incorporar as `instructions` da Skill resolvida no `systemPrompt` (ordem: Persona → Memory → **Skill** → `TASK_FRAMING`, ver Decisão 5).
4. **Core**: fiar a projeção `{ list: () => skills.list(), get: (id) => skills.get(id) }` no `createCognitiveCore`.
5. **Testes**: Planner (instrução/parse), Cognitive Core (seleção resolvida/ não resolvida/ ausente/ sem porta), Core (fiação).
6. Rodar `lint`/`typecheck`/`test`/`format:check`.

---

# Estratégia de Testes

- **Planner**: `instruction` com Skills ativas lista `id`/`name`/`description` e pede uma só Skill; `instruction` com `skills` vazio/ausente = string de antes; Skills inativas não aparecem; `parse` lê `skillId` válido, ignora quando ausente, mantém `null` sem `steps`.
- **Cognitive Core** (gateway fake que devolve JSON com `skillId`): a mensagem `system` da `generate` de composição contém as `instructions` da Skill selecionada; `skillId` inexistente → sem injeção, turno completa; sem `skillId` → sem injeção; sem porta de Skills → Planner recebe catálogo vazio e o comportamento é o de hoje; vale para `ask` **e** `respond`; `respond` continua puro (Conversation retornada não vaza `instructions` como mensagem de conversa nem `skillId`).
- **Core**: `createAtlas` fia a projeção somente-leitura; a Skill semeada (`skill-summarize-text`) aparece no catálogo oferecido ao Planner.
- Garantir que `AskResult`/`ConversationTurn` não expõem Skill.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes passando (`pnpm test`), `lint`/`typecheck`/`format:check` limpos;
- documentação específica da SPEC atualizada (este arquivo; notas em ADRs previstas);
- arquitetura preservada (Planner puro, Cognitive sem estado, Runtime intacto, Skill invisível ao usuário);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

A sincronização das **docs vivas** (`CLAUDE.md` raiz + dos packages tocados, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é o passo de fecho `doc-sync`, fora do escopo do `spec-implementer`.

---

# Restrições

- Não criar novos módulos, Tools, Skills ou Personas; não mover responsabilidades.
- O Planner e o Cognitive Core **nunca** importam `@atlas/skills` — comunicação só por contratos (Artigo 5 — componentes desacoplados).
- Não tocar o Runtime, o Permission Service, as Tools, o Model Gateway nem `apps/cli`.
- `Plan.skillId?` é **aditivo**; nenhum contrato existente muda de forma.
- `respond` continua função pura; o Core continua sem estado.
- Uma Skill por turno; seleção opcional; `skillId` inexistente → ignora sem quebrar o turno.
- A Skill não fala com o usuário; `skillId` não sobe a `AskResult`/`ConversationTurn`.

---

# Observações

- **Dimensionamento**: comparável à SPEC-0019 (mudança em `@atlas/cognitive` + um contrato aditivo em `execution.ts`): ~9,6M tokens efetivos, 1 sessão. Cabe numa janela.
- **Fronteira limpa para persistência**: quando a porta de storage de Skills chegar (fatia futura), este consumo passa a valer também para Skills `temporary` construídas pelo Builder, sem redesenho.
- A seed `skill-summarize-text` (`toolIds: ['read_file']`) casa naturalmente com um plano que lê um arquivo — o cenário canônico para exercitar o consumo ponta a ponta.

---

# Checklist para IA

Antes de implementar:

- ler ADR-0018 (fronteiras), ADR-0017, Module Catalog (Planner/Runtime), `cognitive-core.ts`/`planner.ts` atuais, `skill-registry.ts`;
- compreender que a seleção vive no Planner e a aplicação (injeção de `instructions`) no Cognitive Core;
- confirmar que o Runtime **não** é tocado.

Durante implementação:

- manter Planner puro e Cognitive sem estado;
- não importar `@atlas/skills` fora de `@atlas/core`;
- preservar exatamente o caminho sem Skills.

Após implementação:

- executar testes/lint/typecheck/format;
- validar critérios de aceitação;
- registrar lições aprendidas e conclusão.

---

# Resultado Esperado

Após esta SPEC, o Atlas seleciona e aplica automaticamente uma Skill registrada durante um turno cognitivo, sem o usuário escolher: quando o modelo, ao planejar, indica uma Skill do catálogo, o conhecimento especializado dela (`instructions`) entra na composição da resposta como dado injetado, invisível ao usuário. Turnos sem Skill seguem idênticos ao comportamento anterior. O consumo alcança as Skills `permanent` semeadas; Skills `temporary` construídas pelo Builder ainda dependem de uma fatia futura de persistência. O gate 1.4 (Skills) do Roadmap fecha por inteiro.

---

# Decisões de design

**1. Perfil `completo`.**
- **Decisão**: classificar a SPEC como `completo`.
- **Porquê**: toca `@atlas/contracts` (`Plan.skillId?`) e o coração da arquitetura (Planner + Cognitive Core), decidindo a forma do consumo derivada do ADR-0018 — falha nas condições de `micro` (aditiva a um só package, sem contrato).
- **Alternativa descartada**: `micro` — descartada porque a mudança cruza contrato + dois módulos do laço cognitivo; classificar como micro cairia no ramo errado.

**2. Porta de leitura de Skills opcional (projeção `list`/`get`), não o `SkillRegistry` inteiro.**
- **Decisão**: injetar em `CognitiveCoreDeps` uma porta **opcional** somente-leitura `{ list(): readonly SkillDescriptor[]; get(id): Skill | undefined }`, tipo interno a `@atlas/cognitive`; o Core a projeta a partir do `SkillRegistry`.
- **Porquê**: menor privilégio e mais transparência (Constituição: mais modular) — o Cognitive só lê o catálogo, nunca `register`/`deactivate`/`remove`; opcional preserva os fakes/chamadas existentes (comportamento de hoje quando ausente), no molde do provider `memoryPrompt` da SPEC-0021.
- **Alternativa descartada**: injetar o `SkillRegistry` inteiro — descartada por dar ao Cognitive acesso de escrita que ele nunca deve exercer (viola menor privilégio) e por acoplar o Cognitive à interface de mutação.

**3. `instruction(tools, skills?)` com `skills` opcional; parse com `skillId` opcional.**
- **Decisão**: estender a assinatura existente do Planner com um segundo parâmetro opcional (catálogo de Skills) e adicionar `skillId` opcional ao `Plan` parseado, em vez de criar um método novo.
- **Porquê**: mantém uma única superfície do Planner (mais simples), preserva todos os chamadores atuais (default vazio = string de antes) e segue o molde aditivo do `denialKind?` (ADR-0015).
- **Alternativa descartada**: um `instructionWithSkills` separado — descartada por duplicar framing e bifurcar o Planner sem ganho.

**4. `skillId` viaja no `Plan`; Skill só é consumida quando há `Plan` com `steps`.**
- **Decisão**: a Skill é selecionada como parte de um `Plan` (que exige `steps`); o caminho "sem plano" (resposta direta em 1 chamada) não carrega Skill.
- **Porquê**: o ADR-0018 fixou `Plan.skillId?` como o carregador da seleção; manter `parse` a exigir `steps` (retorna `null` sem passos) preserva a semântica atual e o caminho de 1 chamada, e o consumo (injeção de `instructions` na composição) só existe quando há composição.
- **Alternativa descartada**: permitir `Plan` de `steps` vazio só para carregar uma Skill (Skill sem Tools) — descartada por mudar a semântica de `parse`, ampliar escopo e contrariar o corte do ADR (skillId ancorado no Plan); consumo de Skill sem Tools fica para fatia futura.

**5. `instructions` da Skill injetadas só na composição, entre Memory e `TASK_FRAMING`.**
- **Decisão**: quando o `skillId` resolve, as `instructions` da Skill entram no `systemPrompt` da `generate()` de **composição**, na ordem Persona → Memory → **Skill** → `TASK_FRAMING`.
- **Porquê**: a seleção acontece na `generate` de planejamento, então as `instructions` só podem ser aplicadas depois (composição) — molde de dado injetado da Persona/Memory (ADR-0010/0011); o conhecimento especializado senta junto do contexto (Memory) e `TASK_FRAMING` permanece como a diretiva de fecho, como hoje.
- **Alternativa descartada**: injetar após `TASK_FRAMING` — descartada porque `TASK_FRAMING` é a instrução final do turno e deve permanecer por último; também descartada a injeção na `generate` de planejamento (impossível: a Skill ainda não foi selecionada).

**6. `toolIds` não filtram nem forçam execução; Runtime intacto.**
- **Decisão**: nesta fatia os `toolIds` da Skill **não** gate/prioritizam Tools no Runtime; o efeito observável do consumo é a injeção das `instructions`.
- **Porquê**: o Module Catalog (l. 470) proíbe o Runtime de escolher Skills; a posição default do ADR-0018 é **não** tocar o Runtime — o plano já contém os passos que o modelo escolheu, e a `instructions` já torna o consumo não-no-op (YAGNI para enforcement).
- **Alternativa descartada**: filtrar/priorizar Tools pelos `toolIds` no Runtime — descartada por tocar o Runtime sem demanda e violar "Runtime não escolhe Skills".

**7. `skillId` não sobe a `AskResult`/`ConversationTurn`; Skill invisível ao usuário.**
- **Decisão**: não expor a Skill selecionada na saída ao usuário; `skillId` vive só no `Plan`, interno ao ciclo.
- **Porquê**: Constituição, Artigo 2 (o usuário percebe uma única Persona) + Artigo 9 (especialização invisível) — a Skill é coordenação interna, como Persona e Memory; a CLI renderiza `steps`, então surfacar `skillId` vazaria a Skill.
- **Alternativa descartada**: expor `skillId` em `AskResult`/`ConversationTurn` para observabilidade — descartada por leak ao usuário; testes observam a seleção pelas mensagens enviadas ao gateway fake, sem contrato de saída novo.

**8. Prioridade `High`.**
- **Decisão**: prioridade `High`.
- **Porquê**: fecha o gate 1.4 do Roadmap e cumpre o requisito de Especialização do PRD, mas não desbloqueia outras fatias nem corrige defeito de segurança/correção (não é `Critical`).
- **Alternativa descartada**: `Critical` — descartada porque o Registry passivo já é seguro e nenhuma outra SPEC depende deste consumo; `Medium` — descartada porque fecha um gate de Roadmap explícito.
