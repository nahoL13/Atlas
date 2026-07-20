# SPEC-0021 — Recomposição ao vivo do `memoryPrompt` no Cognitive Core

> **Project Atlas — Implementation Specification**

Version: 1.0

---

# Informações Gerais

**ID**

SPEC-0021

---

**Título**

Recompor o `memoryPrompt` a cada turno em vez de congelá-lo na criação do Cognitive Core. `CognitiveCoreDeps.memoryPrompt` deixa de ser `string?` e passa a ser um **provider síncrono** injetado — `memoryPrompt?: () => string | undefined` — avaliado **uma vez por turno** no início de cada `ask` e de cada `respond` (amostragem única: todas as `generate` do mesmo turno — planejamento, replanejamento, composição, extração — veem o mesmo prompt). Em `respond`, a primeira mensagem `system` da `Conversation` é **substituída** pelo `systemPrompt` fresco, tanto nas mensagens enviadas ao modelo quanto na `Conversation` retornada (fonte única, sem prompt morto). A chamada de extração do learner (SPEC-0020) passa a **incluir os fatos já conhecidos** (o mesmo valor amostrado do turno) com instrução de **não re-propor** o que já está presente — suprimindo (por instrução ao modelo, sem garantia determinística) a duplicação intra-sessão apontada no fecho da SPEC-0020. `@atlas/core` fia `memoryPrompt: () => memory.prompt()`. **Zero mudança em `@atlas/contracts`** (o `CognitiveCoreDeps` é interno a `@atlas/cognitive`), **zero mudança em `apps/cli`**. Planner, Observer, Runtime, Permission Service, Tools, Model Gateway, Persona, Context intactos

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
- [x] Medium (proposta)
- [ ] Low

**Medium (proposta — o humano confirma na aprovação `Draft → Ready`)**: resolve uma limitação de produto já documentada como custo aceito (SPEC-0020/ADR-0016) e mitiga a duplicação intra-sessão apontada pelo architecture-reviewer, fechando o laço de aprendizado dentro da própria sessão de `chat`. Não é endurecimento de segurança urgente. O raio de mudança é contido a `@atlas/cognitive` (o grosso) mais uma fiação de uma linha em `@atlas/core`; nenhuma mudança de contrato e nenhuma mudança na CLI. Espelha a prioridade das SPECs 0019/0020 (mesma faixa do item 1.2/1.3).

---

**Item do Roadmap**

`Fase 1 — 1.2 (Fechar o Ciclo Cognitivo) — residual do Aprendizado` (origem literal), com enquadramento secundário em `1.3 (Memory Service — Próximas Fatias)` por adjacência (`docs/04-engineering/Roadmap.md`).

**Rastreabilidade**: o Roadmap **nomeia textualmente** esta fatia no fecho da seção **1.2** (l. 81), ao listar os residuais do Aprendizado entregue pela SPEC-0020: "Dedup/consolidação, retenção/curadoria, gatilho heurístico e **recomposição ao vivo do `memoryPrompt`** ficam como residuais documentados, candidatos futuros (o último resolve também a duplicação intra-sessão, custo aceito da SPEC)." A origem literal desta SPEC é, portanto, esse **residual documentado da SPEC-0020** (item 1.2 do Roadmap; também descrito na [SPEC-0020](SPEC-0020-learning-post-turn-extraction.md) e no [ADR-0016](../../06-adr/ADR-0016-learning-proposed-extraction.md) como fatia futura). Secundariamente, a fatia é **adjacente** ao item 1.3 (Memory Service — próximas fatias), por evoluir a forma como a memória é consumida pela geração — mas 1.2/l. 81 é a proveniência primária. Ela **não** cria módulo novo nem move responsabilidade entre módulos, e não altera o Roadmap por conta própria (o `spec-drafter` não edita o Roadmap; o doc-sync marca o residual como entregue após `Done`).

---

# Objetivo

Ao concluir esta SPEC, o `memoryPrompt` injetado na geração do Cognitive Core deixa de ser **congelado na criação** do Atlas e passa a ser **recomposto a cada turno**, de modo que um fato gravado (por `atlas remember` ou pelo Aprendizado da SPEC-0020) fique disponível no system prompt **já na próxima invocação do Cognitive dentro da mesma sessão** — e não só na próxima invocação da CLI.

Concretamente, quando esta SPEC estiver concluída:

- `CognitiveCoreDeps.memoryPrompt` muda de `string?` para **`memoryPrompt?: () => string | undefined`** — um **provider síncrono** (sem `Promise`, sem IO obrigatório da perspectiva do Cognitive: ele apenas chama o provider e recebe uma string ou `undefined`). O Cognitive **continua sem conhecer o conceito de Memory** — recebe um provedor de string, não a Memory. `CognitiveCoreDeps` é **interno** a `@atlas/cognitive` (não vive em `@atlas/contracts`), então **nenhum contrato público muda**.
- O `systemPrompt` é **recomposto uma vez por turno**, no início de cada `ask` e de cada `respond`, chamando o provider **exatamente uma vez** e compondo `[personaPrompt, memoryPromptAmostrado, TASK_FRAMING]` na mesma ordem e com o mesmo `filter(Boolean).join('\n\n')` de hoje. Todas as chamadas `generate` do **mesmo turno** (planejamento, replanejamento, composição, extração) veem **o mesmo** system prompt — determinístico por turno (uma amostra por turno, não uma amostra por `generate`).
- O `personaPrompt` **continua estático** (composto uma vez na criação): a Persona não muda em runtime. Só a fatia de memória passa a ser recomposta.
- **`ask`**: recompõe o `systemPrompt` no início do método e o usa para o planejamento e a composição, como já faz — só que a partir do valor amostrado no turno, não de um `systemPrompt` fechado no closure da criação.
- **`respond`**: a cada turno, o conteúdo da **primeira mensagem `system`** da `Conversation` é **substituído** pelo `systemPrompt` fresco — tanto nas mensagens efetivamente enviadas ao modelo **quanto** na `Conversation` retornada (fonte única: a conversa devolvida nunca carrega um prompt de memória desatualizado). Se a `Conversation` recebida **não tiver** nenhuma mensagem `system` (ex.: uma conversa montada externamente, sem passar por `startConversation()`), **insere-se uma mensagem `system` no topo** com o `systemPrompt` fresco (mantém a garantia de memória fresca sem varrer o restante da conversa). `startConversation()` continua criando a mensagem-cabeça com o prompt do momento. `respond` **continua função pura** (mesmas entradas → mesmas saídas, dado o mesmo provider determinístico) e o Core **continua sem estado**.
- **Extração (learner) vê o que já sabe**: a chamada `generate` de extração pós-turno (SPEC-0020) passa a **incluir os fatos já conhecidos** — o **mesmo valor de `memoryPrompt` amostrado no turno** — no material enviado ao learner, com instrução explícita de **não re-propor** fatos já presentes. É isso que **suprime — por instrução ao modelo, sem garantia determinística** — a **duplicação intra-sessão** (o learner tende a deixar de re-sugerir "meu nome é X" a cada turno porque agora enxerga que o fato já foi preservado; a supressão depende de o modelo obedecer à instrução, e o ADR-0016 reconhece que modelos locais fracos podem não obedecer sempre). **Deduplicação determinística** (comparar strings, normalizar, consolidar) continua **fora de escopo** — a supressão aqui é por instrução ao modelo, no mesmo espírito do framing do Artigo 13 já em uso.
- **`@atlas/core`** fia `memoryPrompt: () => memory.prompt()` (provider que delega à Memory, autoridade exclusiva do estado persistente). O spread condicional atual (`...(memoryPrompt !== undefined ? { memoryPrompt } : {})`) é ajustado — o provider é sempre definido; atenção ao `exactOptionalPropertyTypes`.
- **`apps/cli`**: **zero mudança**. O laço fecha sozinho: a borda grava no turno N (via `memory.remember(.., 'learned')`, SPEC-0020), o provider devolve o fato atualizado no turno N+1.

Planner (`createPlanner`), Observer (`observe`), learner (`instruction`/`parse`), Runtime, Permission Service, Tools, Model Gateway, Persona e Context permanecem intactos.

---

# Motivação

A [SPEC-0020](SPEC-0020-learning-post-turn-extraction.md) fechou a Etapa 6 (Aprendizado) do [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md), mas registrou explicitamente **duas limitações conscientes** deixadas para uma fatia futura:

1. **`memoryPrompt` não é recomposto ao vivo**: como o `systemPrompt` é composto **uma vez na criação** do Atlas (`createCognitiveCore` compõe `[personaPrompt, memoryPrompt, TASK_FRAMING]` no corpo da factory, e `startConversation()` congela isso na primeira mensagem `system`), um fato aprendido/gravado durante uma sessão de `chat` **só entra no prompt na próxima invocação da CLI**.
2. **Duplicação intra-sessão**: como o modelo não recebe sinal de que já aprendeu um fato (o `memoryPrompt` não é atualizado **e** os fatos aprendidos não entram na `Conversation`), o learner pode **re-propor o mesmo fato a cada turno** — o teto de 3 é por turno, não cumulativo. Um fato estável ("meu nome é X") pode ser gravado repetidamente na mesma conversa.

O ADR-0016 já antecipou que **a recomposição ao vivo mitiga as duas coisas de uma vez**: o fato aprendido passaria a constar no prompt do turno seguinte, ficando disponível na própria sessão **e** sinalizando ao modelo que já foi preservado (reduzindo a re-proposta — sem garantia determinística, pois a supressão depende de o modelo obedecer à instrução). O architecture-reviewer, no gate da SPEC-0020, reforçou a duplicação intra-sessão como o custo mais visível a endereçar.

O [PRD](../../02-product/ProductRequirementsDocument.md) sustenta a necessidade: a seção **Memória** — "O sistema deve lembrar informações relevantes entre sessões" e, implicitamente, dentro da sessão corrente — e a seção **Aprendizado** — "O sistema deve adaptar-se às preferências do usuário ao longo do tempo. Esse aprendizado deve ocorrer de maneira controlada e revisável" (l. 159–163): um aprendizado que só surte efeito na próxima invocação da CLI, e que se duplica na sessão, entrega uma adaptação truncada e ruidosa. Fechar o laço dentro da sessão é o passo que falta para o Aprendizado (Etapa 6) ser útil em tempo real.

O [Module Catalog](../../03-architecture/ModuleCatalog.md) mantém a Memory como autoridade exclusiva do estado persistente e o Cognitive como orquestrador que **recebe** a memória composta, sem conhecê-la como conceito. O [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) definiu o `memoryPrompt` como **injetado** na geração; esta fatia apenas troca a **forma** da injeção (string estática → provedor de string), preservando quem tem autoridade: a Memory segue sendo a única a produzir o texto (`memory.prompt()`), e o Cognitive segue recebendo só uma string, agora atrás de uma função. A [Constituição](../../00-project/ArchitectureConstitution.md) é respeitada: Memory mantém autoridade exclusiva do estado persistente (Artigo 11), o Cognitive segue o único orquestrador sem persistir (Artigo 3), a mudança é a mais simples que resolve o problema (o "teste de simplicidade" da Constituição), e nenhum módulo é criado ou tem responsabilidade movida (Artigo 15).

Documentos originadores: **SPEC-0020 / ADR-0016** (as duas limitações que esta fatia endereça — fonte da necessidade) + **ADR-0011** (a injeção do `memoryPrompt`, cuja forma muda; ganha nota de atualização) + **ADR-0010** (composição do system prompt: persona → memória → tarefa; a ordem preservada) + **ADR-0008** (conversa como dado; `respond` puro; Core sem estado — a fronteira que a substituição/inserção da mensagem-cabeça respeita; **ganha nota de atualização**, no mesmo espírito da SPEC-0014, porque `respond` passa a reescrever/inserir a mensagem `system`-cabeça da `Conversation` a cada turno — mudança no tratamento do valor `Conversation`) + **PRD** (Memória/Aprendizado) + **Module Catalog** (Memory autoridade exclusiva; Cognitive não conhece Memory) + **Cognitive Lifecycle** (Etapa 6) + **Roadmap** (residual nomeado no fecho de 1.2, l. 81).

---

# Referências

- [SPEC-0020](SPEC-0020-learning-post-turn-extraction.md) (`docs/implementation/specs/SPEC-0020-learning-post-turn-extraction.md`) — **origem da necessidade**: a extração pós-turno do learner; as duas limitações conscientes (memoryPrompt não recomposto ao vivo; duplicação intra-sessão) que esta SPEC endereça; a estrutura do `runPlanCycle` e do `buildLearnMessages` onde entram os fatos conhecidos
- [ADR-0016](../../06-adr/ADR-0016-learning-proposed-extraction.md) (`docs/06-adr/ADR-0016-learning-proposed-extraction.md`) — Aprendizado como extração proposta; documenta a recomposição ao vivo como fatia futura que mitiga as duas limitações de uma vez; reconhece que a supressão da re-proposta depende do modelo (não determinística); **ganha nota de atualização** (limitação endereçada)
- [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) (`docs/06-adr/ADR-0011-memory-service-persistence.md`) — Memory autoridade exclusiva do estado persistente; `memoryPrompt` injetado na geração; Memória × Contexto; **ganha nota de atualização** (a injeção passa de string estática a provedor de string, avaliado por turno; a autoridade não muda)
- [ADR-0010](../../06-adr/ADR-0010-persona-injected-generation.md) (`docs/06-adr/ADR-0010-persona-injected-generation.md`) — composição do system prompt (identidade → memória → tarefa); por que o Cognitive não conhece o conceito de Persona/Memory (recebe strings); o `personaPrompt` que **continua estático**
- [ADR-0008](../../06-adr/ADR-0008-conversation-as-data.md) (`docs/06-adr/ADR-0008-conversation-as-data.md`) — conversa como dado; `respond` função pura; Core sem estado — a fronteira que a substituição/inserção da mensagem-cabeça da `Conversation` respeita; **ganha nota de atualização** (o `respond` passa a reescrever/inserir a mensagem `system`-cabeça da `Conversation` a cada turno — mudança no tratamento do valor `Conversation`, no mesmo espírito da nota que a SPEC-0014 já deixou neste ADR)
- [SPEC-0014](SPEC-0014-tools-confirm-in-chat.md) (`docs/implementation/specs/SPEC-0014-tools-confirm-in-chat.md`) — `runPlanCycle` compartilhado por `ask`/`respond`; a mensagem `system`-cabeça da `Conversation`; a nota equivalente que já deixou no ADR-0008 sobre tratamento da `Conversation`
- [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md) (`docs/03-architecture/CognitiveLifecycle.md`) — Etapa 6 (Aprendizado); o laço que a recomposição ao vivo fecha dentro da sessão
- [Module Catalog](../../03-architecture/ModuleCatalog.md) (`docs/03-architecture/ModuleCatalog.md`) — Memory autoridade exclusiva; Cognitive não conhece Memory
- [Roadmap](../../04-engineering/Roadmap.md) (`docs/04-engineering/Roadmap.md`) — fecho de 1.2 (l. 81): "recomposição ao vivo do `memoryPrompt`" nomeada como residual do Aprendizado; item 1.3 (Memory Service — próximas fatias) como enquadramento secundário
- [PRD](../../02-product/ProductRequirementsDocument.md) (`docs/02-product/ProductRequirementsDocument.md`) — Memória (l. 117–125), Aprendizado (l. 159–163)
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) (`docs/00-project/ArchitectureConstitution.md`) — Artigo 3 (o Core é o único orquestrador — o Cognitive orquestra, não persiste), Artigo 11 (a memória tem autoridade exclusiva sobre o estado persistente), Artigo 13 (o sistema reconhece seus limites: não assumir fatos inexistentes — ancora a instrução de "não re-propor"), Artigo 15 (a IA não cria novos componentes nem move responsabilidades — não criar módulos)

---

# Escopo

Muda código de produção em `packages/cognitive` (o grosso) mais uma fiação de uma linha em `packages/core`. Estritamente as decisões fechadas no brainstorming — nem mais, nem menos.

- **`@atlas/cognitive` — `memoryPrompt` vira provider**:
  - Em `CognitiveCoreDeps` (`packages/cognitive/src/cognitive-core.ts`), trocar `memoryPrompt?: string` por **`memoryPrompt?: () => string | undefined`**. Tipo **interno** ao package — **não** sobe a `@atlas/contracts`.
  - Introduzir um helper interno que compõe o `systemPrompt` a partir de um valor de memória **amostrado**: `composeSystemPrompt(memoryValue)` (ou equivalente), reusando a mesma ordem e o mesmo `filter/join` de hoje (`[personaPrompt, memoryValue, TASK_FRAMING]`). O `personaPrompt` e o `TASK_FRAMING` continuam estáticos.
- **`@atlas/cognitive` — amostragem única por turno**:
  - Em `ask`: no início do método, chamar o provider **uma vez** (`const memoryValue = memoryPrompt?.()`), compor o `systemPrompt` do turno e usá-lo em todas as chamadas do turno (planejamento, composição). O `runPlanCycle` e os builders (`buildComposeMessages`, `buildLearnMessages`) passam a usar o `systemPrompt` amostrado, não um `systemPrompt` de closure de criação.
  - Em `respond`: no início do método, chamar o provider **uma vez**, compor o `systemPrompt` do turno e **substituir** o conteúdo da primeira mensagem `system` da `Conversation` recebida por esse prompt fresco — tanto nas mensagens montadas para enviar ao modelo **quanto** na `Conversation` retornada. **Se a `Conversation` não tiver nenhuma mensagem `system`, inserir uma mensagem `system` no topo** com o `systemPrompt` (sem varrer/rescrever o restante). A amostra é única por turno (uma chamada ao provider por `respond`), compartilhada por planejamento, replanejamento, composição e extração.
  - Garantir que o provider é chamado **exatamente uma vez por `ask`/`respond`**, mesmo com plano + replan + composição + extração no mesmo turno.
- **`@atlas/cognitive` — learner vê os fatos conhecidos**:
  - A construção das mensagens de extração (`buildLearnMessages`, hoje `learner.instruction()` como `system` + o conteúdo do turno) passa a **incluir os fatos já conhecidos** — o `memoryValue` amostrado do turno — no material enviado, com uma instrução explícita de **não re-propor** fatos já presentes. A decisão de onde encaixar isso (dentro do `instruction()` do learner com um parâmetro de "fatos conhecidos", ou como mensagem adicional montada no `buildLearnMessages`) fica a critério do implementer, desde que: (a) o learner **continue puro/sem gateway/sem IO**; (b) a restrição do Artigo 13 (só o afirmado/implicado, nunca o inventado) **permaneça**; (c) a instrução de não re-propor seja **asseverável por teste de conteúdo do prompt**.
  - **Não** implementar deduplicação determinística (comparar/normalizar/consolidar strings). A supressão é por instrução ao modelo, sem garantia determinística.
- **`@atlas/core` — fiação do provider**:
  - Em `packages/core/src/index.ts`, fiar `memoryPrompt: () => memory.prompt()` na criação do `createCognitiveCore`, substituindo o `memoryPrompt = memory.prompt()` estático e o spread condicional atual. Atenção ao `exactOptionalPropertyTypes` (o provider é sempre definido; passar sem spread condicional).
- **Testes** (`@atlas/cognitive` e `@atlas/core`, com fakes — gateway `fake`/injetado que conta chamadas e roteiriza saídas, runtime fake, provider fake; **sem rede/disco reais**): cobrir a seção "Estratégia de Testes". Testes existentes do cognitive que injetam `memoryPrompt: string` **migram** para `() => string` (mudança contida no package).
- **Documentação**: atualizar `packages/cognitive/CLAUDE.md`, `packages/core/CLAUDE.md`, `CLAUDE.md` raiz (invariantes/estado); **notas de atualização no [ADR-0008](../../06-adr/ADR-0008-conversation-as-data.md)** (o `respond` reescreve/insere a mensagem `system`-cabeça da `Conversation` a cada turno — tratamento do valor `Conversation`, no mesmo espírito da nota da SPEC-0014), no **[ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md)** (injeção passa de string estática a provedor, avaliado por turno) e no **[ADR-0016](../../06-adr/ADR-0016-learning-proposed-extraction.md)** (limitação "memoryPrompt não recomposto ao vivo" endereçada; duplicação intra-sessão suprimida — por instrução, sem garantia determinística — via visibilidade dos fatos na extração) — **não** criar ADR novo; `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`; marcar o residual "recomposição ao vivo do `memoryPrompt`" no fecho de 1.2 do `Roadmap.md` (l. 81) como entregue por esta SPEC; registrar lições em `docs/implementation/LESSONS_LEARNED.md`.

---

# Fora do Escopo

Esta seção é obrigatória e reflete o que fica deliberadamente de fora.

- **Deduplicação / consolidação determinística de fatos** (comparar strings, normalizar, mesclar duplicatas no storage). A duplicação intra-sessão é atacada aqui **por visibilidade + instrução ao modelo** (o learner vê os fatos e é instruído a não re-propor), **não** por dedup programático — e, portanto, **sem garantia determinística**. Dedup determinístico segue fatia futura. **Não** implementar.
- **Memória episódica / de projetos** (o gate 1.3 propriamente dito — "mais de uma categoria de conhecimento"). Esta fatia não cria categorias novas de conhecimento. **Não** implementar.
- **Busca/indexação, retenção/classificação, relações entre informações** (demais candidatos de 1.3). **Não** implementar.
- **Gatilho heurístico para a chamada de extração** ("só chamar quando..."). A extração continua **sempre** ao fim do turno (SPEC-0020). **Não** implementar.
- **Teto de candidatos configurável** (flag/env). O teto segue a constante embutida de 3 do learner (SPEC-0020). **Não** tocar.
- **Recomposição do `personaPrompt`**: a Persona **não** muda em runtime — o `personaPrompt` continua estático (composto uma vez na criação). Só a fatia de memória é recomposta. **Não** transformar o `personaPrompt` em provider.
- **`/lembrar` / `/esquecer` como comandos de conversa no `chat`** (candidato distinto de 1.3, Roadmap l. 93). **Não** implementar.
- **Provider assíncrono / recomposição por-`generate`** (uma amostra por chamada ao modelo). A amostragem é **síncrona e única por turno** — todas as `generate` do turno veem o mesmo prompt. **Não** tornar o provider `async`; **não** re-amostrar dentro do turno.
- **Recompor a mensagem-cabeça a partir de qualquer `system` message** — a substituição em `respond` é da **primeira** mensagem `system` da `Conversation` (a cabeça criada por `startConversation`), ou a inserção de uma no topo quando não houver nenhuma. **Não** varrer/rescrever outras mensagens `system` (ex.: os resumos compactos de Tools da SPEC-0014 permanecem intactos).
- **Qualquer mudança em `@atlas/contracts`**. `CognitiveCoreDeps` é interno a `@atlas/cognitive`; a mudança de `memoryPrompt` **não** toca contrato público. `AskResult`/`ConversationTurn`/`CognitiveCore`/`MemoryService` inalterados. **Não** promover nada a contrato.
- **Qualquer mudança em `apps/cli`**. A borda **não** muda: já grava os `learned` (SPEC-0020) e o provider fecha o laço sozinho. **Não** editar comandos da CLI.
- **Qualquer mudança em** `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`, `@atlas/memory` (a interface `MemoryService.prompt()` já existe e é síncrona — **não** alterá-la), `createPlanner()`, `observe()`. **Não** tocar.

---

# Pré-requisitos

- [SPEC-0009](SPEC-0009-memory-service.md) (Memory Service; `memory.prompt(): string | undefined` síncrono; storage JSON) — **Done** (confirmar status real antes de `Ready`)
- [SPEC-0014](SPEC-0014-tools-confirm-in-chat.md) (`runPlanCycle` compartilhado por `ask`/`respond`; a mensagem `system`-cabeça da `Conversation`) — **Done** (confirmar)
- [SPEC-0020](SPEC-0020-learning-post-turn-extraction.md) (extração pós-turno do learner; `buildLearnMessages`; as duas limitações que esta SPEC endereça) — **Done** (confirmar; o brainstorming desta SPEC pressupõe o learner e o `runPlanCycle` no estado da SPEC-0020)

> O `spec-drafter` **não** confirmou os status acima consultando cada arquivo; a confirmação mecânica do `Status: Done` de cada pré-requisito é parte da transição `Draft → Ready`.

---

# Critérios de Aceitação

Cada item é verificável mecanicamente pelo `spec-validator`.

- **`memoryPrompt` é provider**: `CognitiveCoreDeps` (`packages/cognitive/src/cognitive-core.ts`) declara `memoryPrompt?: () => string | undefined`; não existe mais `memoryPrompt?: string`. O tipo **não** aparece em `@atlas/contracts` (verificável no diff de `packages/contracts`, que deve ser **vazio**).
- **Zero mudança em `@atlas/contracts`**: `git diff` de `packages/contracts` **vazio**. `AskResult`/`ConversationTurn`/`CognitiveCore`/`MemoryService`/`Fact` inalterados.
- **Zero mudança em `apps/cli`**: `git diff` de `apps/cli/src` **vazio** (a borda não muda).
- **Amostragem única por turno**: um provider fake que **conta chamadas** é invocado **exatamente 1 vez** por `ask` e **exatamente 1 vez** por `respond`, mesmo quando o turno faz plano + replan + composição + extração (várias `generate`).
- **Recomposição por turno em `ask`**: com um provider fake cujo valor **muda entre chamadas**, o system prompt usado no `ask` seguinte reflete o **novo** valor (verificável inspecionando as `messages` passadas ao fake de gateway na chamada de planejamento).
- **Recomposição por turno em `respond`**: com um provider cujo valor muda entre turnos, a primeira mensagem `system` das `messages` **enviadas ao modelo** no turno seguinte reflete o novo valor; e a primeira mensagem `system` da **`Conversation` retornada** também reflete o novo valor (fonte única — sem prompt de memória morto na conversa devolvida).
- **Fallback sem cabeça `system`**: dada uma `Conversation` **sem** nenhuma mensagem `system`, `respond` **insere uma mensagem `system` no topo** (índice 0) das `messages` enviadas ao modelo e da `Conversation` retornada, com o `systemPrompt` amostrado do turno; o restante das mensagens permanece inalterado e na ordem.
- **`startConversation` usa o prompt do momento**: a `Conversation` criada por `startConversation()` tem a mensagem-cabeça composta com o valor do provider no instante da criação.
- **`respond` continua puro**: mesmas entradas (mesma `Conversation`, mesmo input, mesmo provider determinístico, mesmos fakes) → mesma saída; nenhum estado mutável no Core.
- **`personaPrompt` estático**: o `personaPrompt` é composto uma vez (não vira provider); o provider fake de memória não afeta a fatia de identidade do prompt.
- **Learner vê os fatos conhecidos**: as `messages` da chamada `generate` de **extração** contêm os fatos já conhecidos (o valor amostrado do turno) **e** a instrução de **não re-propor** fatos já presentes (verificável por conteúdo do prompt, mesmo critério de asserção de conteúdo da SPEC-0020/Artigo 13).
- **Instrução de não re-propor não afrouxa o Artigo 13**: o texto de extração **mantém** a restrição de extrair só o afirmado/fortemente implicado, nunca o inventado (a asserção da SPEC-0020 continua verde).
- **Extração ainda não quebra o turno**: falha do gateway ou saída inválida na chamada de extração → `learned` ausente/vazio, turno intacto (regressão da robustez da SPEC-0020 preservada).
- **Contagens de `generate` preservadas**: os cenários da SPEC-0020 seguem valendo (sem plano → 2 chamadas; com plano/sucesso → 3; com plano/1 replan → 4). A recomposição do prompt **não** adiciona chamadas ao gateway (o provider de memória é síncrono, não uma `generate`).
- **`@atlas/core` fia o provider**: `packages/core/src/index.ts` passa `memoryPrompt: () => memory.prompt()` a `createCognitiveCore`; um fato gravado via `memory.remember` aparece no system prompt de uma invocação **subsequente** do Cognitive na mesma instância (verificável com storage fake). `pnpm --filter @atlas/core typecheck` verde (atenção ao `exactOptionalPropertyTypes`).
- **Testes existentes migrados**: os testes de `cognitive` que injetavam `memoryPrompt: string` passam a injetar `() => string` e seguem verdes; a mudança fica **contida** em `packages/cognitive` (sem cascata em `@atlas/contracts`).
- **Componentes intactos**: nenhum diff de código em `packages/runtime`, `packages/permissions`, `packages/tools`, `packages/model-gateway`, `packages/persona`, `packages/context`, `packages/memory`; `createPlanner()`/`observe()`/learner (a não ser o ajuste de "fatos conhecidos" acordado, sem quebrar pureza) preservados; `apps/cli` intacto.
- **Documentação**: `CLAUDE.md` raiz + `packages/cognitive/CLAUDE.md` + `packages/core/CLAUDE.md` atualizados; **notas de atualização no ADR-0008, no ADR-0011 e no ADR-0016**; `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` atualizados; o residual "recomposição ao vivo do `memoryPrompt`" no fecho de 1.2 do `Roadmap.md` (l. 81) marcado como entregue por esta SPEC; lições em `LESSONS_LEARNED.md`.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.

---

# Arquivos Esperados

```text
packages/cognitive/src/
  cognitive-core.ts      (editado: CognitiveCoreDeps.memoryPrompt vira () => string | undefined;
                          systemPrompt recomposto por turno em ask e respond — amostragem única;
                          respond substitui a mensagem system-cabeça (enviada + Conversation retornada),
                          inserindo uma no topo quando não houver;
                          buildLearnMessages inclui os fatos conhecidos + instrução de não re-propor)
  learner.ts             (possivelmente editado: instruction() aceita/considera fatos conhecidos,
                          mantendo pureza e a restrição do Artigo 13 — decisão do implementer se aqui
                          ou no buildLearnMessages de cognitive-core.ts)

packages/cognitive/tests/
  cognitive-core.test.ts (editado: migrar memoryPrompt:string → ()=>string; amostragem única por turno;
                          recomposição por turno em ask e respond; substituição da cabeça na Conversation;
                          fallback sem cabeça system; respond puro; contagens de generate preservadas)
  learner.test.ts        (editado se a mudança dos "fatos conhecidos"/não-re-propor tocar o learner)

packages/core/src/
  index.ts               (editado: memoryPrompt: () => memory.prompt(); remover spread condicional
                          estático; atenção ao exactOptionalPropertyTypes)

packages/core/tests/     (conforme layout atual)
  (editado: fato gravado via memory.remember aparece em invocação subsequente do cognitive)

CLAUDE.md (raiz)                                          (editado: invariantes/estado)
packages/cognitive/CLAUDE.md, packages/core/CLAUDE.md    (editados)
docs/06-adr/ADR-0008-conversation-as-data.md             (editado: nota de atualização — respond reescreve/insere a system-cabeça da Conversation por turno)
docs/06-adr/ADR-0011-memory-service-persistence.md       (editado: nota de atualização)
docs/06-adr/ADR-0016-learning-proposed-extraction.md     (editado: nota de atualização)
docs/04-engineering/Roadmap.md                           (editado: residual de 1.2 marcado entregue)
docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md  (editados)
docs/implementation/LESSONS_LEARNED.md                   (editado)
```

Lista é expectativa; a decisão de encaixar os "fatos conhecidos" no `learner.instruction()` (com parâmetro) vs. no `buildLearnMessages` de `cognitive-core.ts` pode ajustar quais arquivos de `packages/cognitive` mudam.

---

# Componentes Impactados

- Cognitive Core (`@atlas/cognitive`) — `memoryPrompt` vira provider; `systemPrompt` recomposto por turno (amostragem única) em `ask` e `respond`; `respond` substitui a mensagem `system`-cabeça (enviada + retornada), inserindo uma no topo quando não houver; extração passa a incluir os fatos conhecidos com instrução de não re-propor. **Grosso** da mudança.
- Core (`@atlas/core`) — fia `memoryPrompt: () => memory.prompt()`; ajusta o spread condicional (`exactOptionalPropertyTypes`). Uma linha de fiação.
- Contracts (`@atlas/contracts`) — **inalterado** (a mudança é interna a `@atlas/cognitive`).
- CLI (`apps/cli`) — **inalterado** (a borda já grava; o laço fecha sozinho).
- Memory Service (`@atlas/memory`) — **inalterado** (`prompt()` síncrono já existe e é consumido pelo provider).
- Planner, Observer, Runtime, Permission Service, Tools, Model Gateway, Persona, Context — **inalterados**.

---

# Interfaces Necessárias

- **`CognitiveCoreDeps.memoryPrompt?: () => string | undefined`** (`@atlas/cognitive`, **interno**): provider síncrono de memória; substitui `memoryPrompt?: string`. **Não** sobe a `@atlas/contracts` (sem 2º consumidor; mesmo critério de `Observation`/`Planner`).
- **`MemoryService.prompt(): string | undefined`** (`@atlas/contracts`): **inalterado** — já síncrono; é o que o provider de `@atlas/core` delega.
- **`CognitiveCore`** (`@atlas/contracts`): `ask`/`startConversation`/`respond` — **assinaturas públicas preservadas**. A recomposição é interna.
- Helper interno de composição do `systemPrompt` a partir de um valor de memória amostrado (nome a critério do implementer; puro, sem gateway/IO).
- **Nenhuma** outra interface nova ou alterada em `@atlas/contracts`.

---

# Fluxo Esperado

```text
Provider (fiado por @atlas/core):  memoryPrompt = () => memory.prompt()   [síncrono; Memory = autoridade]

ask(objective):
  memoryValue = memoryPrompt?.()                 [1 amostra por turno]
  systemPrompt = compose(personaPrompt, memoryValue, TASK_FRAMING)   [ordem/filter/join de hoje]
  runPlanCycle(...) usando systemPrompt           [planejamento, composição, extração — MESMO prompt]
     └─ extração: messages incluem os fatos conhecidos (memoryValue) + "não re-proponha o já presente"

respond(conversation, input):
  memoryValue = memoryPrompt?.()                 [1 amostra por turno]
  systemPrompt = compose(personaPrompt, memoryValue, TASK_FRAMING)
  → há 1ª mensagem system?  substitui seu conteúdo por systemPrompt      [enviada ao modelo]
     não há?                insere uma mensagem system no topo           [sem varrer o resto]
  runPlanCycle(...) usando essas messages
  → Conversation retornada: 1ª mensagem system também = systemPrompt fresco  [fonte única, sem prompt morto]
  → respond continua função pura; Core sem estado

Laço fechado dentro da sessão (sem mudança na CLI):
  turno N: borda grava fato via memory.remember(.., 'learned')  →  memory.prompt() atualiza
  turno N+1: memoryPrompt?.() devolve o fato novo  →  entra no systemPrompt do turno
             + o learner o vê e tende a NÃO o re-propor  →  duplicação intra-sessão suprimida
               (por instrução ao modelo, sem garantia determinística)
```

---

# Estratégia de Implementação

Sugestão de ordem (TDD, com fakes — gateway `fake`/injetado que conta chamadas e roteiriza saídas; runtime fake; provider fake que muda de valor entre chamadas e conta invocações; storage fake em memória; sem rede/disco):

1. **Tipo do provider**: trocar `memoryPrompt?: string` por `memoryPrompt?: () => string | undefined` em `CognitiveCoreDeps`; extrair o helper de composição (`compose(memoryValue)`). Rodar `git grep 'memoryPrompt'` no repo antes de assumir inocuidade (mapear consumidores: `packages/core/src/index.ts`, testes de `cognitive`). `vitest run` não faz typecheck — passos RED por erro de tipo exigem `pnpm --filter <pkg> typecheck`.
2. **`ask`**: amostrar o provider 1x no início; compor o `systemPrompt` do turno; usá-lo no `runPlanCycle`/builders. Teste: provider fake conta 1 chamada por `ask`; valor novo aparece no planejamento seguinte.
3. **`respond`**: amostrar 1x; substituir a 1ª mensagem `system` da `Conversation` nas mensagens enviadas **e** na retornada; inserir uma no topo quando não houver nenhuma. Teste: recomposição por turno (enviada + retornada); fallback sem cabeça `system`; `respond` puro; provider chamado 1x.
4. **Extração vê os fatos conhecidos**: incluir `memoryValue` no material da chamada de extração + instrução de não re-propor (no `buildLearnMessages` ou no `learner.instruction(fatos)`), mantendo pureza e Artigo 13. Teste: conteúdo do prompt de extração contém os fatos e a instrução; a asserção do Artigo 13 da SPEC-0020 segue verde.
5. **`@atlas/core`**: fiar `memoryPrompt: () => memory.prompt()`; remover o spread condicional estático; conferir `exactOptionalPropertyTypes`. Teste: fato gravado via `memory.remember` aparece em invocação subsequente do cognitive.
6. **Migrar testes existentes**: `memoryPrompt: '...'` → `() => '...'` nos testes de `cognitive`; confirmar contagens de `generate` da SPEC-0020 inalteradas.
7. **Verificação**: `lint`/`format:check`/`typecheck`/`test` (por caminho a partir da raiz).
8. **Documentação**: `CLAUDE.md` (raiz + cognitive + core); notas nos ADR-0008, ADR-0011 e ADR-0016; `Roadmap.md` (residual de 1.2); `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

Todos com fakes (gateway `fake`/injetado que conta chamadas e roteiriza saídas por chamada; runtime fake; provider de memória fake que **muda de valor entre chamadas** e **conta invocações**; storage fake em memória). **Sem rede/disco reais.** Cobrir `ask` **e** `respond`.

- **(unit) amostragem única por turno**: provider fake que conta chamadas → invocado **1x** por `ask` e **1x** por `respond`, mesmo com plano + replan + composição + extração no turno.
- **(cognitive) recomposição por turno em `ask`**: provider cujo valor muda entre chamadas → o system prompt de planejamento do `ask` seguinte reflete o novo valor (inspeção das `messages` do fake de gateway).
- **(cognitive) recomposição por turno em `respond`**: valor muda entre turnos → a 1ª mensagem `system` **enviada** e a 1ª mensagem `system` da **`Conversation` retornada** refletem o novo valor.
- **(cognitive) fallback sem cabeça `system`**: `Conversation` sem mensagem `system` → `respond` insere uma no topo (índice 0) das mensagens enviadas e da `Conversation` retornada, com o prompt amostrado; o restante permanece na ordem.
- **(cognitive) `startConversation`**: a mensagem-cabeça criada usa o valor do provider no instante da criação.
- **(cognitive) `respond` puro**: mesmas entradas → mesma saída; sem estado mutável.
- **(cognitive) `personaPrompt` estático**: mudar o provider de memória não afeta a fatia de identidade do prompt.
- **(cognitive) extração vê os fatos conhecidos**: as `messages` da chamada de extração contêm os fatos amostrados + a instrução de não re-propor; a restrição do Artigo 13 (só afirmado/implicado) continua asseverada no conteúdo.
- **(cognitive) contagens de `generate` da SPEC-0020 preservadas**: sem plano → 2; com plano/sucesso → 3; com plano/1 replan → 4 (a recomposição não adiciona chamadas ao gateway).
- **(cognitive) robustez da extração**: falha/saída inválida na extração → `learned` ausente/vazio, turno intacto.
- **(core) fiação do provider**: fato gravado via `memory.remember` aparece no system prompt de invocação subsequente do cognitive (storage fake); `exactOptionalPropertyTypes` satisfeito.
- **(migração) testes existentes**: os que injetavam `memoryPrompt: string` migram para `() => string` e seguem verdes.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada: `CLAUDE.md` (raiz) + `packages/cognitive/CLAUDE.md` + `packages/core/CLAUDE.md`; **notas de atualização no ADR-0008, no ADR-0011 e no ADR-0016**; `docs/04-engineering/Roadmap.md` (residual "recomposição ao vivo do `memoryPrompt`" no fecho de 1.2 marcado entregue); `docs/05-context/NEXT_CONTEXT.md`; `docs/05-context/CURRENT_SPRINT.md`;
- arquitetura preservada: Memory **mantém autoridade exclusiva** do estado persistente (Artigo 11; o provider só delega a `memory.prompt()`); o Cognitive **continua sem conhecer o conceito de Memory** (recebe um provedor de string) e **sem estado** (`respond` puro, ADR-0008); `personaPrompt` estático (Persona não muda em runtime, ADR-0010); nenhum módulo novo nem responsabilidade movida (Artigo 15); `@atlas/contracts` **intacto**; `apps/cli` **intacto**; Planner/Observer/Runtime/Permissões/Tools/Gateway/Persona/Context intactos;
- residuais documentados como tais (dedup determinístico, memória episódica/de projetos, busca/indexação, retenção, relações, `/lembrar` no chat, gatilho heurístico, teto configurável, recomposição do `personaPrompt`, provider assíncrono/por-`generate`) — e a supressão da duplicação intra-sessão descrita honestamente como **por instrução ao modelo, sem garantia determinística**, não como eliminação;
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz + dos packages tocados, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) **não é escopo do `spec-implementer`** — é o passo de fecho `doc-sync` no fio principal, após a validação. O implementador toca só a documentação específica da própria SPEC (o arquivo da SPEC e as notas de atualização nos ADR-0008/ADR-0011/ADR-0016 que a SPEC prevê).

---

# Restrições

- **Não** criar package/módulo novo nem mover responsabilidade entre módulos (Artigo 15). A recomposição é interna ao `@atlas/cognitive`; a Memory segue a autoridade exclusiva de gravação/produção do texto de memória.
- **Não** alterar `@atlas/contracts`: `CognitiveCoreDeps` é interno a `@atlas/cognitive`; `MemoryService.prompt()` já é síncrono. O diff de `packages/contracts` deve ser **vazio**.
- **Não** alterar `apps/cli`: a borda já grava os `learned`; o laço fecha sozinho.
- **Não** tornar o provider `async` nem re-amostrar por-`generate`: amostragem **síncrona e única por turno**.
- **Não** transformar o `personaPrompt` em provider: a Persona não muda em runtime.
- **Não** implementar deduplicação determinística: a duplicação intra-sessão é suprimida por visibilidade + instrução ao modelo (sem garantia determinística), mantendo o Artigo 13.
- **Não** afrouxar o framing do Artigo 13 do learner ao adicionar os "fatos conhecidos".
- **Não** varrer/rescrever mensagens `system` da `Conversation` além da **primeira** (a cabeça) — ou a inserção de uma no topo quando não houver nenhuma; os resumos compactos de Tools (SPEC-0014) permanecem intactos.
- **Não** alterar `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`, `@atlas/memory`, `createPlanner()`, `observe()`.
- **Não** criar ADR novo; as únicas mexidas em ADR são as **notas de atualização** no ADR-0008, no ADR-0011 e no ADR-0016.
- Testes **sem** rede/disco reais (fakes injetados; gateway `fake`; storage fake). Rodar por caminho a partir da raiz.

---

# Observações

- **Por que provider, não recomposição por-`generate`**: a amostragem única por turno é determinística e barata (uma chamada síncrona a `memory.prompt()`), e mantém o comportamento previsível — todas as `generate` do turno partem do mesmo prompt. Re-amostrar por chamada complicaria o raciocínio sem ganho (a memória não muda no meio de um turno; quem grava é a borda, ao fim do turno).
- **Por que `respond` substitui a cabeça (fonte única)**: se a `Conversation` retornada mantivesse o prompt antigo enquanto as mensagens enviadas usassem o novo, a conversa carregaria um "prompt morto" — divergência entre o que o modelo viu e o que a conversa registra. Substituir a cabeça nos dois lugares (ou inserir uma quando não houver) mantém a `Conversation` como fonte única e `respond` puro (a operação é determinística sobre a entrada).
- **Por que a supressão da duplicação não é garantia**: o mecanismo é dar ao learner visibilidade dos fatos já preservados + instruí-lo a não re-propor. É supressão **por instrução ao modelo**, e o próprio ADR-0016 reconhece que modelos locais fracos podem não obedecer sempre. Não há critério mecânico que prove "zero duplicatas"; o que se verifica mecanicamente é que os fatos e a instrução **estão presentes** no prompt de extração. Deduplicação determinística (garantia real) segue Fora do Escopo, como fatia futura — e continua mitigada pela proveniência (`source: 'learned'`) e pelo `atlas forget`.
- **Por que o learner ver os fatos ajuda**: a SPEC-0020 aceitou a duplicação intra-sessão porque o modelo não recebia sinal de que já aprendera um fato. Com o `memoryValue` do turno visível na extração e a instrução de não re-propor, o modelo tende a suprimir o que já está preservado — sem dedup programático, no mesmo espírito do framing restritivo do Artigo 13.
- **Autoridade da Memory intacta**: o Cognitive **não** ganha acesso à Memory — recebe uma função `() => string | undefined`. Quem produz o texto é `memory.prompt()`; quem grava continua sendo a Memory, chamada pela borda. A forma da injeção muda; a fronteira de autoridade não (ADR-0011, Artigo 11).
- **Sem novo ADR**: a decisão estrutural (injeção do `memoryPrompt`) já está no ADR-0011; esta fatia só troca string estática por provedor de string, dentro do desenho existente. Registra-se como **nota de atualização** no ADR-0011 (forma da injeção), no ADR-0016 (limitação endereçada) e no ADR-0008 (o `respond` reescreve/insere a mensagem `system`-cabeça da `Conversation` a cada turno — tratamento do valor `Conversation`, no mesmo espírito da nota da SPEC-0014) — não é decisão arquitetural nova que exija ADR próprio.
- **`exactOptionalPropertyTypes`**: como o provider passa a ser sempre definido em `@atlas/core` (`() => memory.prompt()`), o spread condicional atual (`...(memoryPrompt !== undefined ? { memoryPrompt } : {})`) deixa de ser necessário — mas o campo continua opcional no tipo (testes podem omiti-lo). Conferir que a passagem incondicional não conflita com `exactOptionalPropertyTypes`.

---

# Checklist para IA

Antes de implementar:

- ler a **SPEC-0020** e o **ADR-0016** (as duas limitações que esta fatia endereça; o `runPlanCycle`/`buildLearnMessages`/learner onde a mudança entra; o reconhecimento de que a supressão depende do modelo), o **ADR-0011** (injeção do `memoryPrompt`; autoridade da Memory), o **ADR-0010** (composição persona → memória → tarefa; `personaPrompt` estático), o **ADR-0008** (Cognitive puro/sem estado; conversa como dado — a fronteira que a substituição/inserção da cabeça respeita), o Artigo 13 (framing do learner), o fecho de 1.2 do Roadmap (l. 81, residual nomeado);
- compreender o objetivo (provider síncrono amostrado 1x por turno; recomposição do `systemPrompt` em `ask`/`respond`; substituição/inserção da cabeça em `respond`; extração vê os fatos conhecidos; `@atlas/core` fia; contratos e CLI intactos);
- confirmar mecanicamente que os pré-requisitos (SPEC-0009/0014/0020) estão `Done`;
- `git grep 'memoryPrompt'` no repo antes de editar — mapear consumidores (`@atlas/core`, testes de `cognitive`).

Durante a implementação:

- TDD com fakes (gateway `fake` que conta chamadas; runtime fake; provider fake que muda de valor e conta invocações; storage fake), sem rede/disco;
- provider **síncrono**, amostrado **1x por turno**; `personaPrompt` estático; `respond` puro; Core sem estado;
- extração inclui os fatos conhecidos + instrução de não re-propor, **sem** afrouxar o Artigo 13 e **sem** dedup determinístico;
- `respond` insere uma cabeça `system` no topo quando a `Conversation` não tiver nenhuma;
- `@atlas/contracts` e `apps/cli` **intactos**; não vazar escopo (nada de dedup, episódica, busca, retenção, `/lembrar`, provider async, recompor persona).

Após a implementação:

- rodar `lint`/`format:check`/`typecheck`/`test` (por caminho a partir da raiz);
- atualizar documentação (`CLAUDE.md` raiz + cognitive + core; notas nos ADR-0008/ADR-0011/ADR-0016; `Roadmap.md` residual de 1.2; contexto);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, um fato gravado durante uma sessão de `chat` — seja por `atlas remember`, seja pelo Aprendizado automático (SPEC-0020) — passa a valer **já no próximo turno da mesma sessão**, não só na próxima invocação da CLI: o Cognitive Core recompõe o `memoryPrompt` uma vez por turno, a partir de um **provider síncrono** que delega à Memory (`() => memory.prompt()`), amostrado uma única vez e compartilhado por todas as `generate` do turno. Em `respond`, a mensagem `system`-cabeça da conversa é substituída pelo prompt fresco (ou inserida no topo quando não houver nenhuma) tanto no que é enviado ao modelo quanto na `Conversation` retornada, sem prompt morto e sem quebrar a pureza de `respond`. A chamada de extração do learner passa a enxergar os fatos já conhecidos e é instruída a não re-propô-los, o que **suprime — por instrução ao modelo, sem garantia determinística** — a **duplicação intra-sessão** que a SPEC-0020 aceitou como custo (a garantia real, via deduplicação determinística, segue fatia futura). O grosso da mudança vive em `@atlas/cognitive`; `@atlas/core` ganha uma linha de fiação; `@atlas/contracts` e `apps/cli` ficam **intactos**; a Memory mantém autoridade exclusiva e o Cognitive segue sem conhecê-la como conceito. A limitação documentada da SPEC-0020/ADR-0016 (memoryPrompt não recomposto ao vivo) fica resolvida; deduplicação determinística e as demais categorias de conhecimento do item 1.3 seguem como fatias futuras.

---

# Pontos em Aberto (a confirmar na aprovação `Draft → Ready`)

1. **Prioridade** — proposta **Medium** (resolve limitação de produto documentada + mitiga a duplicação intra-sessão apontada pelo architecture-reviewer; raio contido a `@atlas/cognitive` + fiação de uma linha em `@atlas/core`; sem contrato/CLI; sem urgência de segurança). O humano confirma ou ajusta.
2. **Enquadramento no Roadmap** — a proveniência **primária** é o residual "recomposição ao vivo do `memoryPrompt`" **nomeado textualmente** no fecho da seção 1.2 do Roadmap (l. 81), como resíduo do Aprendizado da SPEC-0020; o enquadramento em 1.3 (Memory Service — próximas fatias) é **secundário, por adjacência**. Proposta: registrar a entrega marcando esse residual em 1.2/l. 81 (o doc-sync o faz após `Done`). O humano confirma esse enquadramento ou pede formatação diferente. O `spec-drafter` **não** alterou o Roadmap.
3. **Onde encaixar os "fatos conhecidos" na extração** — proposto deixar a critério do implementer (dentro de `learner.instruction(fatosConhecidos)` com parâmetro, ou como mensagem adicional no `buildLearnMessages`), desde que o learner continue puro, o Artigo 13 seja preservado e a instrução de não re-propor seja asseverável por teste de conteúdo. Ponto de forma, não de arquitetura; o humano pode fixar a preferência.

_Os três pontos são de prioridade/forma/rastreabilidade, não de arquitetura: as decisões estruturais (provider síncrono; amostragem única por turno; substituição/inserção da cabeça em `respond`; extração vê os fatos conhecidos; `@atlas/core` fia; zero mudança em contratos e na CLI; sem novo ADR, só notas nos ADR-0008/ADR-0011/ADR-0016) estão fechadas no brainstorming com o humano. Nenhum deles cria módulo novo nem move responsabilidade entre módulos — passam pelo veto humano na transição `Draft → Ready`, não por decisão do `spec-drafter`._

---

# Histórico de Revisão

- **Rev. 1 (Draft inicial)** — `spec-drafter`. Decisões de design D1–D6 fechadas no formato de veto (provider síncrono amostrado 1x por turno; recomposição do `systemPrompt` em `ask`/`respond`; substituição/inserção da mensagem `system`-cabeça em `respond`; extração vê os fatos conhecidos com instrução de não re-propor; `@atlas/core` fia o provider; zero mudança em `@atlas/contracts`/`apps/cli` e sem novo ADR — só notas de atualização).
- **Rev. 2 (correções pós-1º veto do `architecture-reviewer`)** — o reviewer **avaliou as decisões D1–D6 e aprovou todas no mérito** (arquitetura sólida), condicionando a passagem `Draft → Ready` a duas correções de **fidelidade documental**, aplicadas nesta revisão: (1) citações constitucionais corrigidas para os números reais dos Artigos da Constituição — Artigo 11 (memória com autoridade exclusiva), Artigo 3 (o Core é o único orquestrador), Artigo 15 (a IA não cria componentes nem move responsabilidades); Artigo 13 (reconhecer limites) mantido; (2) **ADR-0008** incluído no escopo de notas de atualização (o `respond` passa a reescrever/inserir a mensagem `system`-cabeça da `Conversation` a cada turno — domínio do ADR-0008 "conversa como dado", no mesmo espírito da nota da SPEC-0014), refletido em Escopo, Referências, Arquivos Esperados, Critérios de Aceitação, Definition of Done e Restrições. **Status permanece `Draft`** — a transição para `Ready` é feita pelo fio principal após a re-aprovação.
- **Rev. 3 (re-aprovação do `architecture-reviewer` → `Draft → Ready`)** — o reviewer re-revisou a Rev. 2 e **confirmou mecanicamente** que as duas correções de fidelidade documental foram aplicadas de forma consistente em toda a SPEC (números de Artigo 3/11/13/15 casados contra a `ArchitectureConstitution.md`; ADR-0008 presente e coerente em Escopo, Referências, Arquivos Esperados, Critérios de Aceitação, Definition of Done e Restrições), **sem regressão** introduzida pela Rev. 2. As decisões D1–D6 seguem aprovadas no mérito. Pré-requisitos SPEC-0009/0014/0020 confirmados `Done` pelo fio principal. **Status movido para `Ready`** — autorizado pelo gate do `architecture-reviewer` (Emenda v1.1, sem veto humano).
