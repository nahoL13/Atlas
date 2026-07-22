# Implementation Specification

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0030

---

**Título**

Injeção de memória guiada pela consulta do turno (`MemoryService.prompt({ query, limit })` consumido pelo Cognitive Core)

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
- [ ] High
- [x] Medium
- [ ] Low

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 1 — 1.3 Memory Service — Próximas Fatias — Busca/indexação sobre os fatos armazenados` (`candidato · SPEC direta`, `docs/04-engineering/Roadmap.md` l. 91), com adjacência ao residual de **1.2** ("recomposição ao vivo do `memoryPrompt`", l. 82) cuja forma esta SPEC evolui.

É a **fatia futura nomeada textualmente** pela SPEC-0027 ("Fora do Escopo": *"Rewire do Cognitive Core para consumir `search` com a consulta do turno é fatia futura"*) e repetida no `NEXT_CONTEXT.md` (entrada da SPEC-0027: *"consumir `search` pelo Cognitive a partir da consulta do turno segue fatia futura explícita"*). **Candidato aberto, não gate** — todos os itens `gate` da Fase 1 estão entregues desde a SPEC-0029 (Roadmap l. 129).

---

# Objetivo

Ao final desta SPEC, a fatia de memória injetada no system prompt de cada turno deixa de ser o **dump completo** do acervo e passa a ser uma **seleção guiada pela consulta do turno**, com um **orçamento fixo de fatos**, produzida pela própria Memory Service (autoridade exclusiva sobre recuperação de conhecimento persistente).

Concretamente, quando esta SPEC estiver concluída:

- `MemoryService.prompt` aceita um parâmetro **opcional e aditivo**: `prompt(options?: { readonly query?: string; readonly limit?: number }): string | undefined`. Sem argumento, o retorno é **byte a byte idêntico** ao de hoje (não-regressão total).
- Com `limit` presente e acervo **maior** que o `limit`, a Memory seleciona quais fatos entram no texto: os mais relevantes à `query` primeiro (reusando internamente o `search` da SPEC-0027 — mesmo `normalize`, mesmo overlap de tokens, mesmo desempate por ordem de carga), completando o orçamento com os fatos restantes em ordem de carga até `limit`. A seleção é **determinística** e nunca devolve menos que `min(total, limit)` fatos.
- A composição por seções da SPEC-0029 (`fact → project → episode`, seções vazias omitidas, seção `fact` byte a byte estável) é **preservada** — aplicada sobre o subconjunto selecionado, na ordem de carga original.
- `CognitiveCoreDeps.memoryPrompt` passa de `() => string | undefined` para **`(query: string, limit: number) => string | undefined`** — mesma porta, agora consciente da consulta; segue **interna** a `@atlas/cognitive` (não sobe a `@atlas/contracts`) e **amostrada exatamente 1x por turno** (invariante da SPEC-0021 preservada).
- A "consulta do turno" é o **input do turno**: `objective` em `ask`, `input` em `respond`. `startConversation()` amostra com consulta vazia (dump, comportamento de hoje).
- `@atlas/core` fia `memoryPrompt: (query, limit) => memory.prompt({ query, limit })` — uma linha, sem política nova no composition root.
- `apps/cli` **não muda**.

---

# Motivação

O [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) registrou, como custo explícito da injeção de memória na geração, que *"fatos entram no system prompt de toda geração — cresce o prompt conforme a memória cresce. Mitigado pelo escopo mínimo; retenção/seleção/busca são SPECs futuras"*. A [SPEC-0027](SPEC-0027-memory-fact-retrieval.md) entregou a **primitiva** de recuperação relevante (`search`) e deixou o consumo pelo Cognitive como fatia futura explícita, justamente para validar a primitiva antes de consumi-la. A [SPEC-0029](SPEC-0029-episodic-project-memory.md) ampliou o acervo para três categorias (`fact`/`project`/`episode`) — o dump completo passou a crescer em mais de uma direção, tornando a seleção mais relevante do que era.

O [PRD](../../02-product/ProductRequirementsDocument.md) sustenta a fatia por dois lados: a seção **Memória** (*"O sistema deve lembrar informações relevantes entre sessões"* — **relevantes**, não todas) e os **Requisitos Não Funcionais** (*"O sistema deverá ser preparado para crescimento incremental"*), com a restrição de que *"O Atlas não deverá comprometer a consistência da memória para otimizar desempenho"* — atendida aqui pelo piso de orçamento (a memória injetada nunca encolhe abaixo de `min(total, limit)` fatos) e pela seleção determinística.

O [Module Catalog](../../03-architecture/ModuleCatalog.md) atribui a **busca** e a **recuperação** ao Memory Service e diz que ele é *"a única autoridade para armazenamento e recuperação de memória permanente"* — por isso a seleção e a composição do texto continuam **dentro** de `@atlas/memory`, e o Cognitive segue recebendo apenas uma string atrás de uma função, sem conhecer o conceito de Memory (ADR-0010/ADR-0011).

Documentos originadores: SPEC-0027 (fatia futura nomeada) + ADR-0011 (custo documentado) + Roadmap 1.3 (l. 91) + PRD (Memória / crescimento incremental) + Module Catalog (Memory Service).

---

# Referências

- [SPEC-0027](SPEC-0027-memory-fact-retrieval.md) — `MemoryService.search(query, options?)`: ranking por overlap de tokens sobre `normalize`, desempate por ordem de carga, `limit` opcional; a Decisão de design 8 que nomeia esta fatia como futura
- [SPEC-0029](SPEC-0029-episodic-project-memory.md) — categorias `fact`/`project`/`episode`; composição de `prompt()` por seções (`fact → project → episode`), seção `fact` byte a byte estável
- [SPEC-0021](SPEC-0021-live-memory-prompt-recomposition.md) — `CognitiveCoreDeps.memoryPrompt` como provider síncrono interno, **amostrado 1x por turno**; `compose(memoryValue)`; `withFreshSystemHead`; `learner.instruction(knownFacts?)`
- [SPEC-0026](SPEC-0026-planner-skill-consumption.md) — precedente de porta **interna** a `@atlas/cognitive` (`skillCatalog?`) que não sobe a `@atlas/contracts`; ordem `Persona → Memory → Skill → Task` no `compose`
- [SPEC-0022](SPEC-0022-deterministic-fact-deduplication.md) — `normalize` interno e no-op idempotente de `remember` em duplicata (limita o custo de o learner re-propor um fato não recuperado)
- [ADR-0011 — Memory Service](../../06-adr/ADR-0011-memory-service-persistence.md) — memória injetada na geração; autoridade exclusiva; custo do dump documentado — **ganha nota de atualização**
- [ADR-0016 — Aprendizado](../../06-adr/ADR-0016-learning-proposed-extraction.md) — extração proposta; o learner que passou a ver os fatos conhecidos (SPEC-0021) passa a ver o **subconjunto recuperado** — **ganha nota de atualização**
- [ADR-0010 — Persona injetada na geração](../../06-adr/ADR-0010-persona-injected-generation.md) — composição identidade → memória → tarefa; o Cognitive recebe strings, não serviços
- [ADR-0008 — Conversa como dado](../../06-adr/ADR-0008-conversation-as-data.md) — `respond` puro; a mensagem `system`-cabeça reescrita por turno
- [Module Catalog — Memory Service / Cognitive Core](../../03-architecture/ModuleCatalog.md)
- [PRD — Memória; Requisitos Não Funcionais; Restrições](../../02-product/ProductRequirementsDocument.md)
- [Roadmap — Fase 1, 1.3](../../04-engineering/Roadmap.md)
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigo 3 (Core único orquestrador), Artigo 5 (módulos falam por contratos públicos), Artigo 11 (autoridade exclusiva da memória), Artigo 15 (não criar módulos nem mover responsabilidades)

---

# Escopo

- **`@atlas/contracts` (`packages/contracts/src/memory.ts`)**: `prompt` passa a aceitar um parâmetro **opcional**: `prompt(options?: { readonly query?: string; readonly limit?: number }): string | undefined`. Mudança **aditiva** — todo chamador `prompt()` existente segue válido; `Fact`/`MemoryCategory`/`remember`/`forget`/`list`/`dedupe`/`search` **inalterados**.
- **`@atlas/memory` (`packages/memory/src/memory-service.ts`)**: `prompt(options?)` passa a **selecionar** os fatos antes de compor:
  - `options` ausente, ou `limit` ausente, ou `facts.length <= limit` → seleção = **todos** os fatos, na ordem de carga (saída idêntica à de hoje).
  - caso contrário → seleção = os fatos de `search(query, { limit })` (reuso da implementação já existente, **sem** segunda definição de relevância), completada com os fatos restantes em **ordem de carga** até atingir exatamente `limit` itens; sem duplicatas; a seleção final é **reordenada pela ordem de carga** antes da composição.
  - `query` ausente/vazia/sem tokens após `normalize` → `search` devolve `[]` e a seleção cai inteiramente no completamento por ordem de carga (os `limit` primeiros fatos carregados).
  - a composição (`composePrompt`) é a **mesma** da SPEC-0029, aplicada ao subconjunto: seções `fact → project → episode`, vazias omitidas, formato literal preservado.
- **`@atlas/cognitive` (`packages/cognitive/src/cognitive-core.ts`)**:
  - `CognitiveCoreDeps.memoryPrompt?: (query: string, limit: number) => string | undefined` (tipo **interno**; **não** sobe a `@atlas/contracts`).
  - constante embutida `MEMORY_RECALL_LIMIT = 20` (mesmo molde de `REPLAN_BUDGET`/teto de 3 do learner: constante, não configurável nesta fatia).
  - `ask`: amostragem única `memoryPrompt?.(objective, MEMORY_RECALL_LIMIT)` no início do turno; o valor amostrado alimenta `compose(...)` e `learner.instruction(...)` como hoje.
  - `respond`: amostragem única `memoryPrompt?.(input, MEMORY_RECALL_LIMIT)` no início do turno; `withFreshSystemHead` inalterado.
  - `startConversation`: `memoryPrompt?.('', MEMORY_RECALL_LIMIT)` (consulta vazia → dump dos `limit` primeiros; cabeça transitória, reescrita a cada `respond`).
- **`@atlas/core` (`packages/core/src/index.ts`)**: fiar `memoryPrompt: (query, limit) => memory.prompt({ query, limit })`.
- **Testes**: `@atlas/memory` (seleção/orçamento/determinismo/não-regressão de `prompt()`), `@atlas/cognitive` (consulta correta por comando, amostragem única, provider recebe `objective`/`input`/`''`), `@atlas/core` (fiação).
- **Documentação específica da SPEC**: notas de atualização no **ADR-0011** (a injeção passa de dump a seleção com orçamento, produzida pela Memory) e no **ADR-0016** (o learner passa a ver o subconjunto recuperado, não o acervo inteiro). **Sem ADR novo.**

---

# Fora do Escopo

- **Não** criar ADR novo, módulo novo, Tool, Skill ou Persona; **não** mover responsabilidade entre módulos.
- **Não** alterar `apps/cli` (nenhum comando, nenhuma flag, nenhum `HELP_TEXT`): `git diff` de `apps/cli/src` deve ser **vazio**.
- **Não** tornar o orçamento configurável por flag/env/config (o teto é constante embutida, como `REPLAN_BUDGET` e o teto de 3 do learner).
- **Não** alterar a assinatura, o ranking ou o comportamento de `MemoryService.search` (é reusado como está), nem `remember`/`forget`/`list`/`dedupe`/`Fact`/`MemoryCategory`.
- **Não** introduzir matching semântico, embeddings, TF-IDF, índice invertido, cache ou normalização além da já existente (espaço + caixa) — a relevância continua sendo exatamente a da SPEC-0027.
- **Não** ponderar relevância por categoria, recência (`createdAt`), `source` ou `subject`, nem reservar cotas por seção — a ordem de carga é o único desempate (mesmo critério de `search`/`dedupe`).
- **Não** tornar o provider assíncrono nem re-amostrá-lo por `generate` — a amostragem segue **síncrona e única por turno** (SPEC-0021).
- **Não** usar o histórico da conversa (turnos anteriores, resumos de Tools) como parte da consulta em `respond` — a consulta é o input do turno corrente.
- **Não** transformar `personaPrompt`/`TASK_FRAMING`/`skillCatalog` em algo consciente da consulta; **não** mexer em Planner, Observer, Runtime, Permission Service, Tools, Model Gateway, Persona, Context, Skills.
- **Não** implementar retenção/classificação/expiração de fatos, relações entre informações, `/lembrar`/`/esquecer` em `chat` (demais candidatos de 1.3).
- **Não** expor scores nem o subconjunto selecionado em `AskResult`/`ConversationTurn` (a seleção é invisível ao usuário — Artigos 2/7).
- **Não** deduplicar/consolidar acervo aqui (SPECs 0022/0023 já cobrem).

---

# Pré-requisitos

- [SPEC-0009](SPEC-0009-memory-service.md) — `Done` (Memory Service, `prompt()`).
- [SPEC-0021](SPEC-0021-live-memory-prompt-recomposition.md) — `Done` (provider `memoryPrompt`, amostragem 1x/turno, `learner.instruction(knownFacts?)`).
- [SPEC-0022](SPEC-0022-deterministic-fact-deduplication.md) — `Done` (`normalize`; no-op idempotente de `remember`, que limita o custo aceito em D9).
- [SPEC-0027](SPEC-0027-memory-fact-retrieval.md) — `Done` (`search`, reusado por esta SPEC).
- [SPEC-0029](SPEC-0029-episodic-project-memory.md) — `Done` (composição de `prompt()` por seções, preservada).

Status verificado no arquivo de cada SPEC (checkbox `Done`) e no `docs/05-context/NEXT_CONTEXT.md`.

---

# Critérios de Aceitação

- `MemoryService.prompt` em `@atlas/contracts` tem assinatura `prompt(options?: { readonly query?: string; readonly limit?: number }): string | undefined`; `Fact`, `MemoryCategory`, `remember`, `forget`, `list`, `dedupe` e `search` estão inalterados (diff limitado à linha de `prompt`).
- **Não-regressão total**: `prompt()` sem argumento devolve string **byte a byte idêntica** à de antes desta SPEC, para acervos com as três categorias (teste comparando contra literal fixado, no molde do critério da SPEC-0029).
- `prompt({ query })` **sem** `limit` devolve o mesmo que `prompt()` (a consulta sozinha não seleciona nada — sem orçamento não há corte).
- `prompt({ query, limit })` com `facts.length <= limit` devolve o mesmo que `prompt()`.
- `prompt({ query, limit })` com `facts.length > limit` compõe o texto a partir de **exatamente `limit`** fatos; os fatos com overlap de tokens com `query` (critério de `search`) estão **todos** entre os selecionados quando são ≤ `limit`, e o restante do orçamento é preenchido pelos fatos remanescentes em ordem de carga ascendente.
- `prompt({ query, limit })` com `query` vazia/só espaços/sem token em comum com nenhum fato **não devolve `undefined` nem texto vazio** por causa disso: devolve os `limit` primeiros fatos em ordem de carga (piso de orçamento — a memória injetada nunca some por falta de match).
- A seleção é **determinística**: duas chamadas com o mesmo acervo e a mesma `query`/`limit` devolvem exatamente a mesma string; o subconjunto selecionado é composto na **ordem de carga**, não na ordem de relevância.
- A composição por seções da SPEC-0029 é preservada no subconjunto: seções na ordem `fact → project → episode`, seções sem fato selecionado **omitidas**, seção `fact` no formato literal de hoje, seção `project` agrupada por `subject` (`[projeto <subject>]`).
- `prompt` continua **síncrono, puro e sem IO** (não chama `storage.load`/`storage.save`) e **não muta** `facts` (`list()` idêntico antes e depois).
- A relevância usada por `prompt` é a **do `search`** — o módulo não ganha uma segunda função de ranking (verificável: nenhuma nova ordenação por score no arquivo; nenhuma segunda definição de relevância além da de `search`).
- `CognitiveCoreDeps.memoryPrompt` declara `(query: string, limit: number) => string | undefined`; o tipo **não** aparece em `@atlas/contracts` (diff de `packages/contracts` limitado à linha de `prompt`).
- **Amostragem única por turno preservada**: um provider fake que conta chamadas é invocado **exatamente 1 vez** por `ask` e **exatamente 1 vez** por `respond`, mesmo com plano + replanejamento + composição + extração no mesmo turno.
- **Consulta correta por comando**: o provider recebe `objective` em `ask`, `input` em `respond` e `''` em `startConversation`; recebe `MEMORY_RECALL_LIMIT` como segundo argumento nos três casos.
- O valor amostrado é o mesmo usado em **todas** as `generate` do turno (planejamento, replanejamento, composição, extração) — inclusive em `learner.instruction(...)`.
- **Contagens de `generate` inalteradas**: sem plano → 2; com plano/sucesso → 3; com plano/1 replan → 4 (a seleção não adiciona chamadas ao gateway).
- `@atlas/core` passa `memoryPrompt: (query, limit) => memory.prompt({ query, limit })` a `createCognitiveCore`; teste com storage fake mostra que um fato relevante à consulta aparece no system prompt do turno.
- **Diff de produção vazio** em `apps/cli/src`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`, `@atlas/skills`; `planner.ts`, `observer.ts` e `learner.ts` inalterados.
- Testes existentes de `@atlas/cognitive` que injetam providers zero-arg (`() => 'texto'`) seguem verdes sem reescrita obrigatória (uma função de aridade menor é atribuível ao novo tipo) — qualquer migração feita é opcional e explicitada.
- Notas de atualização adicionadas ao **ADR-0011** e ao **ADR-0016**; **nenhum ADR novo** criado.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` verdes.

---

# Arquivos Esperados

```text
packages/contracts/src/memory.ts              (editar: prompt(options?))
packages/memory/src/memory-service.ts          (editar: seleção com orçamento antes de composePrompt, reusando search)
packages/memory/tests/memory-service.test.ts   (editar: casos de seleção/orçamento/não-regressão)
packages/cognitive/src/cognitive-core.ts       (editar: tipo do provider, MEMORY_RECALL_LIMIT, consulta por comando)
packages/cognitive/tests/cognitive-core.test.ts (editar: consulta correta, amostragem única, contagens preservadas)
packages/core/src/index.ts                     (editar: fiação do provider)
packages/core/tests/…                          (editar: fiação query/limit ponta a ponta com storage fake)
docs/06-adr/ADR-0011-memory-service-persistence.md   (editar: nota de atualização)
docs/06-adr/ADR-0016-learning-proposed-extraction.md (editar: nota de atualização)
```

Ajustes menores possíveis: fakes de `MemoryService` tipados diretamente (ex.: `apps/cli/tests/status.test.ts`) — como a mudança de `prompt` é um parâmetro **opcional**, a expectativa é **não** disparar o padrão recorrente de quebra de `typecheck`; confirmar por `pnpm typecheck`, não assumir.

---

# Componentes Impactados

- Memory Service (`@atlas/memory`) — passa a selecionar quais fatos entram no texto injetado (grosso da mudança de comportamento).
- Contratos (`@atlas/contracts`) — parâmetro opcional em `prompt`.
- Cognitive Core (`@atlas/cognitive`) — provider consciente da consulta; constante de orçamento; consulta por comando.
- Core (`@atlas/core`) — uma linha de fiação.

Intactos (diff de produção esperado vazio): `apps/cli`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`, `@atlas/skills`; Planner, Observer e learner dentro de `@atlas/cognitive`.

---

# Interfaces Necessárias

- `MemoryService.prompt(options?: { readonly query?: string; readonly limit?: number }): string | undefined` (`@atlas/contracts`, parâmetro aditivo/opcional).
- `CognitiveCoreDeps.memoryPrompt?: (query: string, limit: number) => string | undefined` (`@atlas/cognitive`, **interno** — não sobe a `@atlas/contracts`, mesmo critério de `skillCatalog?`/SPEC-0026 e do próprio `memoryPrompt`/SPEC-0021).
- Constante interna `MEMORY_RECALL_LIMIT` em `@atlas/cognitive`.
- Helper interno de seleção em `packages/memory/src/memory-service.ts` (nome a critério do implementer; puro, síncrono, reusando `search`). **Não** sobe a `@atlas/contracts`.

Nenhuma outra interface nova ou alterada.

---

# Fluxo Esperado

```text
ask(objective) / respond(conversation, input) / startConversation()
        ↓  (1 amostra por turno)
memoryPrompt?.(query, MEMORY_RECALL_LIMIT)
   query = objective (ask) | input (respond) | '' (startConversation)
        ↓  @atlas/core: (query, limit) => memory.prompt({ query, limit })
@atlas/memory — prompt({ query, limit }):
   limit ausente ou facts.length <= limit → seleção = todos os fatos
   senão:
      relevantes = search(query, { limit })            [ranking da SPEC-0027]
      seleção    = relevantes ∪ restantes(ordem de carga) até exatamente `limit`
      seleção    = reordenada pela ordem de carga
   composePrompt(seleção)                              [seções fact → project → episode, SPEC-0029]
        ↓
string | undefined  →  compose(personaPrompt, memoryValue, skillInstructions?, TASK_FRAMING)
        ↓
mesmo valor em TODAS as generate do turno (planejamento, replan, composição, extração)
```

---

# Estratégia de Implementação

1. **Contrato**: adicionar o parâmetro opcional a `prompt` em `packages/contracts/src/memory.ts`; rodar `git grep 'MemoryService'` e `git grep '\.prompt('` (nome do tipo, não só construtoras) e confirmar por `pnpm typecheck` — `vitest run` não pega isso.
2. **Memory (TDD)**: primeiro os testes de não-regressão (`prompt()` byte a byte; `prompt({ query })` sem `limit`; acervo ≤ `limit`), depois o helper de seleção (relevantes por `search` + completamento por ordem de carga + reordenação por ordem de carga + corte em `limit`), aplicando `composePrompt` ao subconjunto.
3. **Cognitive**: trocar o tipo do provider; adicionar `MEMORY_RECALL_LIMIT`; passar `objective`/`input`/`''` nos três pontos de amostragem. Testes: consulta correta por comando, amostragem única (provider que conta chamadas), contagens de `generate` preservadas, valor único compartilhado por todas as `generate` (inclusive a de extração).
4. **Core**: fiar `(query, limit) => memory.prompt({ query, limit })`; teste com storage fake (fato relevante entra no prompt do turno).
5. **Notas de atualização** no ADR-0011 e no ADR-0016.
6. **Verificação**: `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`.

---

# Estratégia de Testes

Fakes injetados (storage fake em memória; gateway fake que conta chamadas e roteiriza saídas; runtime fake; provider fake que conta invocações e registra os argumentos recebidos). Sem rede/disco reais.

- **(memory) não-regressão**: `prompt()` idêntico ao literal fixado, com fatos das três categorias; `prompt({ query })` sem `limit` ≡ `prompt()`; `prompt({ query, limit })` com acervo ≤ `limit` ≡ `prompt()`.
- **(memory) seleção com orçamento**: acervo > `limit` e `query` que casa com fatos "do fundo" da lista → esses fatos aparecem no texto; total de fatos compostos = `limit`.
- **(memory) piso de orçamento**: `query` vazia / só espaços / sem overlap → texto com os `limit` primeiros fatos em ordem de carga (não `undefined`, não vazio).
- **(memory) ordem**: o subconjunto é composto em ordem de carga (não em ordem de relevância) — teste com relevante que é o último carregado.
- **(memory) seções preservadas**: subconjunto que só contém fatos `fact` omite as seções `project`/`episode`; subconjunto com `project` mantém o agrupamento `[projeto <subject>]`.
- **(memory) determinismo e pureza**: duas chamadas idênticas → mesma string; `list()` inalterado antes/depois; storage fake que lança em `load`/`save` após a criação não é acionado.
- **(cognitive) consulta correta**: provider fake registra os argumentos — `objective` em `ask`, `input` em `respond`, `''` em `startConversation`; segundo argumento = `MEMORY_RECALL_LIMIT` nos três.
- **(cognitive) amostragem única por turno**: exatamente 1 invocação por `ask` e por `respond`, mesmo com plano + replan + composição + extração.
- **(cognitive) valor compartilhado**: o mesmo valor amostrado aparece no system prompt de planejamento, no de composição e nas mensagens de extração (`learner.instruction`).
- **(cognitive) contagens de `generate`**: 2 / 3 / 4 preservadas.
- **(cognitive) provider ausente**: sem `memoryPrompt`, o comportamento é idêntico ao de hoje (nenhuma fatia de memória no prompt, nada lança).
- **(core) fiação**: com storage fake contendo mais fatos que o orçamento, um fato relevante à consulta do turno aparece no system prompt enviado ao gateway fake.
- **(migração)** testes existentes com provider zero-arg seguem verdes.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- testes passando (`pnpm test`), `lint`/`typecheck`/`format:check` verdes;
- documentação específica da SPEC atualizada (o arquivo da SPEC + notas de atualização no ADR-0011 e no ADR-0016);
- arquitetura preservada: a Memory mantém autoridade exclusiva sobre a recuperação e a representação do conhecimento persistente (Artigo 11) — a seleção e a composição do texto vivem **dentro** de `@atlas/memory`; o Cognitive continua recebendo apenas uma string atrás de uma função (ADR-0010/ADR-0011) e continua sem estado (`respond` puro, ADR-0008); nenhum módulo criado, nenhuma responsabilidade movida (Artigo 15);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` raiz e dos packages tocados, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é o passo de fecho `doc-sync`, não escopo do `spec-implementer`.

---

# Restrições

- Não criar ADR novo, módulo, Tool, Skill ou Persona; não mover responsabilidade entre módulos.
- Não duplicar a lógica de relevância: `prompt` reusa `search`; não duplicar a composição por seções: reusa `composePrompt`.
- Não compor texto de memória fora de `@atlas/memory` (o Cognitive e o Core nunca montam seções nem filtram `Fact`).
- Não tornar `prompt`/o provider assíncrono; não fazer IO em `prompt`.
- Não re-amostrar o provider dentro do turno; não chamá-lo mais de uma vez por `ask`/`respond`.
- Não usar histórico da conversa como consulta; não ponderar por recência/categoria/origem.
- Não alterar `apps/cli`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`, `@atlas/skills`, `planner.ts`, `observer.ts`, `learner.ts`.
- Não tornar o orçamento configurável nesta fatia.

---

# Observações

- **Padrão recorrente (a verificar, não assumir)**: mudanças em `MemoryService` já quebraram o `typecheck` de fakes tipados diretamente em 6+ SPECs; aqui o parâmetro é **opcional**, o que — como nas SPECs 0026/0029 — deve evitar a cascata. Confirmar por `pnpm typecheck` e por `git grep 'MemoryService'` antes de assumir inocuidade.
- **Assinatura do provider e compatibilidade**: em TypeScript, `() => string` é atribuível a `(query: string, limit: number) => string`; por isso os fakes zero-arg existentes em `@atlas/cognitive` continuam válidos sem reescrita. Isso é uma propriedade desejada (migração mínima), não um descuido.
- **Por que o orçamento é o gatilho, e não a consulta**: enquanto o acervo couber no orçamento, o comportamento é exatamente o de hoje. Isso torna a fatia **inobservável** no acervo atual (pequeno) e faz efeito só quando o problema que ela resolve (prompt crescendo) de fato existe — o corte mais conservador possível.
- **Custo aceito**: com acervo maior que o orçamento, o learner (SPEC-0021) passa a ver apenas o subconjunto recuperado e pode re-propor um fato conhecido que não foi recuperado naquele turno. O efeito é limitado pelo no-op idempotente de `remember` (SPEC-0022) **apenas para reproposição textual exata normalizada** (`trim`/`toLowerCase`/colapso de espaços) — uma reproposição **parafraseada** (mesmo sentido, texto diferente) não é reconhecida como duplicata e **é gravada** como um novo `Fact`; consolidação semântica de paráfrases segue fatia futura de 1.3. Registrado como custo, não como regressão.
- **Consequência do piso de orçamento (D5) combinada com a ordem de carga**: como o completamento é sempre por ordem de carga ascendente e `remember` sempre `push` no fim, com acervo > `limit` e consulta sem overlap os fatos que entram no piso são sempre os **mais antigos** — um fato recém-aprendido fica invisível ao `memoryValue` amostrado até casar lexicalmente com alguma consulta futura. Isso interage diretamente com o ponto anterior: é justamente o fato mais recente que o learner tende a re-propor, aumentando a chance da reproposição (parafraseada ou não) descrita acima.

---

# Checklist para IA

Antes de implementar:

- ler SPEC-0027 (ranking de `search`), SPEC-0029 (composição por seções e o critério byte a byte), SPEC-0021 (amostragem 1x/turno, `withFreshSystemHead`, `learner.instruction`), ADR-0010/ADR-0011 (o Cognitive recebe strings; autoridade da Memory);
- compreender que a seleção e a composição ficam **dentro** de `@atlas/memory`;
- confirmar `Done` dos pré-requisitos.

Durante:

- reusar `search` e `composePrompt`, não duplicar;
- manter `prompt` puro/síncrono/sem IO e sem mutar `facts`;
- manter uma amostra por turno e a consulta correta por comando;
- não vazar escopo (nada de CLI, config, recência, semântica, retenção).

Após:

- rodar `lint`/`format:check`/`typecheck`/`test`;
- validar os Critérios de Aceitação;
- adicionar as notas nos ADR-0011/ADR-0016;
- registrar lições aprendidas.

---

# Resultado Esperado

A memória injetada em cada turno passa a ser **relevante e limitada**, em vez de o acervo inteiro: a Memory Service — única autoridade sobre recuperação de conhecimento persistente — recebe a consulta do turno e um orçamento de fatos, seleciona deterministicamente quais entram (relevantes primeiro, resto por ordem de carga, sempre `min(total, limit)`) e compõe o texto com as mesmas seções `fact → project → episode` da SPEC-0029. O Cognitive Core continua recebendo apenas uma string atrás de um provider síncrono, amostrado exatamente uma vez por turno, agora consciente do que o usuário pediu; o `@atlas/core` ganha uma linha de fiação; `@atlas/contracts` muda em uma linha (parâmetro opcional) e `apps/cli` não muda. Enquanto o acervo couber no orçamento, o comportamento é byte a byte o de hoje — a mudança só se manifesta quando a memória cresce. O orçamento limita o **número de fatos** selecionados, não o tamanho em bytes do texto composto (20 fatos longos podem gerar um prompt maior que 60 curtos); por isso esta fatia **contém parcialmente**, sem fechar, o custo que o ADR-0011 documentou — um teto por tamanho de texto segue fatia futura. A fatia futura nomeada pela SPEC-0027 (consumo de `search` pelo Cognitive a partir da consulta do turno) deixa de estar aberta; retenção/classificação, relações entre informações, consolidação semântica de paráfrases e `/lembrar` ao vivo seguem candidatos de 1.3.

---

# Decisões de design

Registradas em formato de veto (decisão + porquê + alternativa descartada), conforme Emenda v1.1 da Constituição.

### D1. Perfil da SPEC: `completo`

- **Decisão**: classificar como `completo`.
- **Porquê**: a fatia toca **três** packages de produção (`@atlas/memory`, `@atlas/cognitive`, `@atlas/core`) e altera `@atlas/contracts` — duas condições que excluem o perfil `micro` por definição (Emenda v1.2 / template).
- **Alternativa descartada**: `micro` — falharia em "contida a um package" e em "não toca `@atlas/contracts`"; na dúvida, o default seguro é `completo`.

### D2. A seleção vive dentro de `@atlas/memory`, via parâmetro opcional em `prompt`

- **Decisão**: `MemoryService.prompt(options?: { query?; limit? })`; a Memory seleciona os fatos e compõe o texto.
- **Porquê**: o Module Catalog dá à Memory autoridade exclusiva sobre **recuperação** de conhecimento persistente (Artigo 11), e a composição por seções da SPEC-0029 (formato literal, seção `fact` byte a byte) é interna ao módulo. Qualquer outro arranjo obrigaria o Core ou o Cognitive a montar seções a partir de `Fact[]`, duplicando a representação e ferindo o Artigo 5.
- **Alternativa descartada**: o Cognitive/Core chamar `search()` e formatar o texto — vazaria a representação da memória para fora do seu dono e criaria uma segunda definição de "como a memória aparece no prompt".

### D3. Mesma porta `memoryPrompt`, agora com argumentos — não uma porta nova

- **Decisão**: `CognitiveCoreDeps.memoryPrompt` passa de `() => string | undefined` para `(query: string, limit: number) => string | undefined`, permanecendo tipo **interno** a `@atlas/cognitive`.
- **Porquê**: é a **mesma preocupação** (a fatia de memória do system prompt) ganhando um argumento; uma segunda porta (`memoryRecall?`) coexistindo com `memoryPrompt` criaria duas rotas para o mesmo slot e a pergunta "qual vence quando ambas existem?" — menos simples e menos transparente. Manter interno segue o precedente do próprio `memoryPrompt` (SPEC-0021) e do `skillCatalog` (SPEC-0026): menor privilégio, sem 2º consumidor.
- **Alternativa descartada**: porta nova `memoryRecall?: (query) => string | undefined` ao lado da atual — o molde do `skillCatalog` vale para uma preocupação **distinta** (catálogo de Skills), não para a mesma; aqui duplicaria o slot.

### D4. Consulta do turno = input do turno (`objective` / `input`), nunca o histórico

- **Decisão**: `ask` usa `objective`; `respond` usa **apenas** `input` do turno corrente; `startConversation` usa `''`.
- **Porquê**: é o único texto que representa, sem ambiguidade, o que o usuário quer **agora**; usar o histórico exigiria escolher um N arbitrário de turnos e faria a seleção derivar para tópicos velhos, além de tornar o resultado dependente do tamanho da conversa (menos determinístico de raciocinar). `startConversation` não tem consulta: consulta vazia cai no caminho de dump, e a cabeça que ele cria é reescrita por `withFreshSystemHead` no primeiro `respond`.
- **Alternativa descartada**: concatenar as últimas N mensagens do usuário (ou a conversa inteira) — N arbitrário, ruído de ranking, e acoplaria a seleção à forma da `Conversation` (ADR-0008).

### D5. Piso de orçamento: a memória injetada nunca encolhe abaixo de `min(total, limit)`

- **Decisão**: quando `search` devolve menos que `limit` resultados (inclusive zero), o orçamento é completado com os fatos restantes em ordem de carga; o texto sempre contém exatamente `min(total, limit)` fatos.
- **Porquê**: sem o piso, uma consulta sem overlap (ex.: "que horas são?") apagaria a memória inteira do prompt — degradação abrupta e visível para o usuário, e um risco direto contra a Restrição do PRD de não comprometer a consistência da memória por otimização. Com o piso, a seleção só decide **quais** fatos, nunca **se** há fatos.
- **Alternativa descartada**: (a) omitir a seção de memória quando não há match — cliff de comportamento e perda da identidade acumulada; (b) cair no dump completo quando não há match — devolveria exatamente o pior caso que a fatia existe para evitar, de forma imprevisível.
- **Consequência registrada (achado do gate, não-bloqueante)**: o completamento por ordem de carga **ascendente** combinado com `remember` fazendo `push` no fim significa que, com acervo > `limit` e consulta sem overlap, os fatos que preenchem o piso são sempre os **mais antigos** — um fato recém-aprendido fica invisível ao `memoryValue` amostrado até casar lexicalmente com alguma consulta futura. Isso interage com D9: é justamente o fato mais recente que o learner tende a re-propor, e a proteção do no-op de `remember` (SPEC-0022) só cobre reproposição **textual exata**, não paráfrase. Ver Observações.

### D6. O gatilho da seleção é o orçamento, não a presença de consulta

- **Decisão**: sem `limit`, ou com acervo ≤ `limit`, `prompt` devolve o dump de hoje, mesmo com `query` presente.
- **Porquê**: torna a mudança **inobservável** enquanto o problema não existe (acervo pequeno), preservando byte a byte o comportamento e os testes atuais — o corte mais conservador possível, coerente com o teste da Constituição (mais simples, mais sustentável).
- **Alternativa descartada**: filtrar por relevância sempre que houver `query` — mudaria o comportamento em todo acervo, inclusive nos pequenos, onde não há ganho algum e há risco de perda de contexto.

### D7. Orçamento como constante embutida em `@atlas/cognitive` (`MEMORY_RECALL_LIMIT = 20`)

- **Decisão**: o teto é uma constante do package que compõe o prompt, passada ao provider; `@atlas/core` apenas repassa.
- **Porquê**: o orçamento é política de **composição do prompt**, responsabilidade do Cognitive Core, e o repo já tem esse molde (`REPLAN_BUDGET`, teto de 3 do learner — constantes embutidas, não configuráveis). Deixar o Core repassando mantém o composition root sem política (ADR-0003/ADR-0004). O valor 20 é uma estimativa de bom senso (folgado para nenhum acervo pequeno mudar de comportamento, apertado para limitar o prompt quando a memória crescer) — não uma afirmação verificável sobre o tamanho real do acervo de qualquer usuário: o arquivo de memória é local e não observável a partir do repo. Ajustar o valor, se necessário, é mudança de uma constante, não uma decisão arquitetural nova.
- **Alternativa descartada**: (a) constante em `@atlas/core` — colocaria política de prompt no composition root; (b) flag/env configurável — YAGNI, e nenhum dos tetos análogos do repo é configurável nesta fase.

### D8. Composição por seções da SPEC-0029 preservada; subconjunto composto em ordem de carga

- **Decisão**: as seções `fact → project → episode` (formato literal, vazias omitidas, agrupamento por `subject`) são aplicadas ao subconjunto selecionado, na ordem de carga original — a relevância decide **quem entra**, nunca **a ordem** nem **o formato**.
- **Porquê**: a SPEC-0029 fixou esse formato literalmente por ser caminho sensível (entra no system prompt de toda geração) e o `architecture-reviewer` o tratou como achado bloqueante; reordenar por score quebraria a estabilidade byte a byte e misturaria dois critérios no mesmo texto.
- **Alternativa descartada**: lista plana ordenada por relevância — perderia a estrutura por categoria entregue pelo gate 1.3 e tornaria a saída dependente do ranking em todos os casos.

### D9. O learner vê o subconjunto recuperado; a amostragem segue única por turno

- **Decisão**: `learner.instruction(memoryValue)` recebe o **mesmo** valor amostrado do turno (o subconjunto), sem segunda amostragem com o acervo completo.
- **Porquê**: preserva a invariante central da SPEC-0021 (uma amostra por turno, mesmo prompt em todas as `generate`) e mantém o turno determinístico. O custo — o learner poder re-propor um fato conhecido não recuperado — é **parcialmente** limitado pelo no-op idempotente de `remember` (SPEC-0022): a proteção vale só para reproposição **textual exata normalizada** (`trim`/`toLowerCase`/colapso de espaços); uma reproposição parafraseada não é reconhecida como duplicata e é gravada como um novo `Fact`. Consolidação semântica de paráfrases segue fatia futura de 1.3.
- **Alternativa descartada**: amostrar duas vezes por turno (dump para o learner, subconjunto para a geração) — quebraria a invariante de amostragem única, dobraria a leitura da memória por turno e reintroduziria no prompt de extração exatamente o dump que a fatia existe para evitar.

### D10. Nenhum ADR novo — notas de atualização no ADR-0011 e no ADR-0016

- **Decisão**: registrar a mudança como nota de atualização no ADR-0011 (a injeção passa de dump a seleção com orçamento, produzida pela Memory) e no ADR-0016 (o learner passa a ver o subconjunto), sem ADR novo.
- **Porquê**: a decisão estrutural — memória **injetada** na geração, produzida pela Memory, recebida pelo Cognitive como string — já é o ADR-0011, que inclusive nomeia "retenção/seleção/busca" como SPECs futuras dentro do próprio desenho. Esta fatia muda o **conteúdo** da injeção, não a fronteira de autoridade. É o mesmo enquadramento aceito nas SPECs 0021/0022/0023/0027/0029.
- **Alternativa descartada**: ADR novo ("seleção de memória por relevância") — seria escalação obrigatória e não se sustenta: nenhuma fronteira entre módulos é revisitada, nenhuma decisão anterior é revertida.

### D11. Prioridade `Medium`

- **Decisão**: prioridade `Medium`.
- **Porquê**: fecha a fatia futura explicitamente nomeada pela SPEC-0027 e o custo documentado do ADR-0011, mas é `candidato` do Roadmap 1.3 (nenhum gate depende dela) e o efeito prático só aparece quando o acervo cresce além do orçamento. Mais que resíduo cosmético; menos que bloqueio.
- **Alternativa descartada**: `High` — superestimaria uma fatia sem gate e sem impacto observável no acervo atual; `Low` — subestimaria, já que endereça um custo arquitetural registrado em ADR.
