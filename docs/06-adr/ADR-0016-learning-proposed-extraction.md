# ADR-0016 — Aprendizado: extração pós-turno proposta pelo Cognitive, gravada pela borda

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-19

---

# Contexto

O [Cognitive Lifecycle](../03-architecture/CognitiveLifecycle.md) define sete etapas. Com a Observação fechada pelo [ADR-0015](ADR-0015-observation-replan-loop.md)/[SPEC-0019](../implementation/specs/SPEC-0019-observation-replan-loop.md), a única etapa sem contraparte na implementação é a **Etapa 6 — Aprendizado**: "determinar quais informações devem ser preservadas; nem todo conhecimento produzido deve ser armazenado; o sistema deverá decidir cuidadosamente quais informações são relevantes para futuras interações, respeitando as políticas de memória da plataforma". Este é o gate restante do item **1.2 (Fechar o Ciclo Cognitivo)** do [Roadmap](../04-engineering/Roadmap.md), marcado como `gate · ADR primeiro`.

Hoje a Memory Service ([ADR-0011](ADR-0011-memory-service-persistence.md)) só grava por comando explícito do usuário (`atlas remember`). O Cognitive **não conhece** o conceito de Memory: recebe apenas `memoryPrompt?: string` na criação, composto pelo `@atlas/core` a partir de `memory.prompt()` — decisão deliberada do ADR-0011 para manter a autoridade sobre estado persistente exclusiva da Memory (Artigo da Constituição) e o Cognitive sem estado ([ADR-0008](ADR-0008-conversation-as-data.md)).

A pergunta central: **como dar ao Cognitive a capacidade de decidir o que preservar — a essência da Etapa 6 — sem transferir para ele a autoridade de gravação da Memory, sem tornar `respond` impuro, e sem que aprendizado ruim aconteça às escondidas do usuário?**

---

# Decisão

**O Cognitive propõe; a borda grava; o usuário vê.** Nenhum package novo, nenhum módulo novo.

**A decisão de relevância é do modelo, numa chamada dedicada pós-resposta.** Após a resposta final do turno ser composta (com ou sem plano, em `ask` **e** `respond` — o ciclo compartilhado desde a SPEC-0014), o Cognitive faz **uma chamada `generate` adicional** com uma instrução de extração: analisar o turno (input do usuário + resposta; em `respond`, com o contexto da conversa) e devolver, em JSON estruturado, os fatos que valem preservar para interações futuras — ou nenhum. Decidir relevância é julgamento **semântico**, não estrutural; uma heurística determinística aqui seria apenas um atalho do `atlas remember`, não Aprendizado.

**A extração segue o molde do Planner/Observer: uma função pura em `@atlas/cognitive`.** Um `learner` interno (mesmo padrão de `createPlanner()`/`observe()`: sem gateway, sem IO, testável isolado) expõe `instruction()` (framing de extração + schema JSON) e `parse(saída) → readonly string[]` — 0..N textos de fatos. Saída inválida, vazia ou não-JSON → lista vazia; **o turno nunca quebra por causa do Aprendizado** (falha de extração = nada aprendido). Um **teto fixo de candidatos por turno** (constante embutida, ex.: 3) é aplicado no `parse` como guardrail contra modelo tagarela.

**O Cognitive devolve os candidatos como dado; quem grava é a borda.** `AskResult` e `ConversationTurn` ganham o campo opcional `learned?: readonly string[]` (aditivo, espelha o precedente de `steps?`). A CLI (`atlas ask` e `atlas chat`), que já medeia o Context ([ADR-0009](ADR-0009-context-service-value-store.md): store de valor × orquestrador — a mediação fica na app), itera os candidatos, grava cada um via `atlas.memory.remember(...)` e **imprime um traço compacto** (ex.: `💡 lembrado: <fato>`). Assim:

- O Cognitive continua **puro e sem estado** — propor é devolver dado, não efetuar disco (ADR-0008 preservado; nenhuma porta de escrita entra em `CognitiveCoreDeps`).
- A Memory **mantém autoridade exclusiva** sobre estado persistente — só ela grava, chamada pela borda como `atlas remember` já faz.
- A transparência é estrutural: o aviso ao usuário sai de graça no mesmo lugar que grava. `atlas forget <id>` já existe como desfazer. Gravar memória não é destrutivo — não exige `confirm`; exige visibilidade.

**Fatos aprendidos carregam proveniência.** `Fact` ganha o campo opcional/aditivo `source?: 'user' | 'learned'` e `MemoryService.remember` ganha um parâmetro opcional de origem (default `'user'`, preservando `atlas remember` e todos os chamadores existentes). `atlas memory list` exibe a origem. Sem proveniência, seria impossível auditar ou limpar aprendizado ruim depois — inferência do modelo e afirmação explícita do usuário ficariam indistinguíveis para sempre (a informação não é recuperável retroativamente).

**Limitação consciente: o fato aprendido só entra no prompt na próxima invocação.** `memoryPrompt` é composto na criação do Atlas (ADR-0011); um fato gravado durante a sessão não é re-injetado no system prompt da mesma sessão de `chat`. Recomposição ao vivo do `memoryPrompt` é fatia futura documentada, não parte desta decisão.

**Intactos:** Planner, Observer, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`. As mudanças de contrato são todas **aditivas/opcionais** (`learned?`, `Fact.source?`, parâmetro opcional em `remember`). O ADR-0011 ganha nota de atualização (a Memory passa a ter um segundo caminho de gravação — ainda exclusivo dela — alimentado pela borda com candidatos do Cognitive).

---

# Consequências

Positivas:

- **A Etapa 6 (Aprendizado) do Cognitive Lifecycle passa a existir na implementação** — o ciclo cognitivo fica completo nas sete etapas; o gate restante do item 1.2 do Roadmap fecha.
- **Padrão do projeto preservado.** O `learner` é puro e testável sem gateway, como Planner e Observer; a fronteira de autoridade sobrevive (Cognitive decide o quê, Memory grava, borda medeia — ADR-0009/0011).
- **Raio de mudança pequeno.** O grosso é `@atlas/cognitive` (learner + 1 chamada no ciclo); fora dele, campos opcionais em `@atlas/contracts`, o parâmetro de origem em `@atlas/memory`, e a mediação/traço na CLI.
- **Transparente e reversível.** Todo fato aprendido é anunciado no momento da gravação, marcado com proveniência, e removível por `atlas forget`.
- **Robusto por construção.** Falha de extração nunca quebra o turno; teto de candidatos limita ruído.

Custos e riscos:

- **+1 chamada de modelo por turno**, mesmo quando não há nada a aprender. Aceito nesta fatia: o provedor default é `local`/Ollama (grátis) e a chamada é curta. Um gatilho heurístico ("só chamar quando...") é otimização futura se o custo doer.
- **Qualidade da extração depende do modelo.** Modelos locais fracos podem propor fatos irrelevantes ou nenhum. Mitigado pelo teto, pela proveniência e pelo `forget`; políticas de retenção/curadoria são fatias futuras (1.3).
- **Fato aprendido não entra no prompt da sessão corrente** (limitação documentada acima).
- **Sem dedup**: o mesmo fato pode ser aprendido duas vezes em sessões diferentes. Consolidação/dedup semântico fica para as fatias de memória (1.3).

---

# Alternativas Consideradas

**Heurística determinística (sem chamada de modelo).** Regras puras detectariam padrões ("lembre que...", preferências explícitas). Rejeitada: decidir relevância é semântico; a heurística viraria um atalho do `atlas remember` — a Etapa 6 continuaria não existindo de fato. (Um gatilho heurístico *combinado* com o modelo foi considerado e adiado por YAGNI — duas camadas de decisão na primeira fatia.)

**Porta de escrita injetada no Cognitive (`learn(text)` em `CognitiveCoreDeps`).** A gravação aconteceria dentro do turno. Rejeitada: `respond` deixaria de ser função pura (efeito de disco no meio — quebra o ADR-0008), o Cognitive passaria a exercer a autoridade de gravação que o ADR-0011 deliberadamente lhe negou, e o `memoryPrompt` da sessão ficaria obsoleto do mesmo jeito — o custo de pureza não compra nada.

**Core orquestra pós-turno (`createAtlas` embrulha `ask`/`respond` e grava antes de devolver).** Esconderia a mediação da borda. Rejeitada: o Core é raiz de composição ([ADR-0003](ADR-0003-core-composition-root.md)/[ADR-0004](ADR-0004-manual-composition.md)) — compõe, não contém lógica de fluxo de negócio; a mediação na app é o padrão já estabelecido pelo ADR-0009 para o Context.

**Confirmação interativa por fato (`confirm`).** Máximo controle do usuário. Rejeitada: transforma cada turno em interrogatório e descaracteriza a autonomia que define a Etapa 6; `confirm` é reservado a ações destrutivas/irreversíveis ([ADR-0013](ADR-0013-permission-service-execution-gate.md)) — gravar memória é reversível (`forget`). Transparência (traço + proveniência) é o mecanismo de controle adequado.

**Gravação silenciosa.** Menos ruído no terminal. Rejeitada: fere a transparência (Constituição) e torna aprendizado ruim indetectável até o usuário listar a memória por acaso.

**Pegar carona na chamada de composição (resposta + fatos num JSON único).** Economizaria 1 chamada. Rejeitada: acopla a qualidade da resposta à extração, complica o parse (texto livre + estrutura no mesmo output) e degrada os dois em modelos locais fracos.

**Extração única no fim da sessão (`chat`).** Menos chamadas. Rejeitada: não cobre `ask`, perde o aprendizado se a sessão cair, e o aviso chega tarde demais para o usuário corrigir.

**Sem proveniência (`Fact` intacto).** Fatia menor. Rejeitada: depois de gravados, inferência do modelo e afirmação do usuário seriam indistinguíveis para sempre; o campo opcional custa quase nada e é a única forma de auditoria.

---

# Atualização ([SPEC-0021](../implementation/specs/SPEC-0021-live-memory-prompt-recomposition.md))

A [SPEC-0021](../implementation/specs/SPEC-0021-live-memory-prompt-recomposition.md) endereça as duas limitações conscientes registradas acima:

- **"Fato aprendido não entra no prompt da sessão corrente" (Consequências) fica resolvida.** `memoryPrompt` deixa de ser composto uma vez na criação e passa a ser um provider síncrono (`() => string | undefined`) amostrado pelo Cognitive uma vez por turno; um fato gravado (por `atlas remember` ou pelo próprio Aprendizado) entra no `systemPrompt` já no turno seguinte da mesma sessão de `chat` (nota de atualização correspondente no [ADR-0011](ADR-0011-memory-service-persistence.md)).
- **"Sem dedup" (duplicação intra-sessão) é mitigada — não eliminada.** A chamada `generate` de extração pós-turno passa a incluir os fatos já conhecidos (o mesmo `memoryValue` amostrado do turno) com instrução explícita de não re-propor o que já está presente. É supressão **por instrução ao modelo**, sem garantia determinística: modelos locais fracos podem não obedecer sempre. Deduplicação/consolidação determinística (comparar/normalizar/mesclar strings no storage) **continua fora de escopo**, como fatia futura das próximas fatias de memória (1.3).
- **Intactos:** o mecanismo de proposta/gravação/proveniência descrito nesta ADR não muda — o Cognitive continua propondo candidatos como dado, a Memory continua a única autoridade de gravação, e o teto de 3 candidatos por turno permanece o mesmo.
