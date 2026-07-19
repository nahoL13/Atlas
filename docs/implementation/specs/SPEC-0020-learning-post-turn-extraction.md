# SPEC-0020 — Aprendizado: extração pós-turno proposta pelo Cognitive, gravada pela borda

> **Project Atlas — Implementation Specification**

Version: 1.0

---

# Informações Gerais

**ID**

SPEC-0020

---

**Título**

Aprendizado (Etapa 6 do Cognitive Lifecycle) como extração pós-turno: após a resposta final do turno ser composta (com ou sem plano), o ciclo compartilhado `runPlanCycle` de `@atlas/cognitive` faz **uma chamada `generate` dedicada** de extração; um `learner` **puro** (molde do Planner/Observer: `instruction()` + `parse(saída) → readonly string[]`, teto fixo embutido de 3 candidatos, tipo interno) decide o que preservar; o Cognitive **propõe** os candidatos como dado (`AskResult`/`ConversationTurn` ganham `learned?: readonly string[]`, aditivo) e **a borda grava**: `atlas ask` e `atlas chat` iteram os candidatos, gravam via `atlas.memory.remember(texto, 'learned')` e imprimem um traço compacto. Proveniência: `Fact` ganha `source?: 'user' | 'learned'` e `MemoryService.remember` ganha parâmetro opcional de origem (default `'user'`); `atlas memory list` exibe a origem. Cognitive segue puro/sem estado; Memory mantém autoridade exclusiva de gravação; Planner, Observer, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway` intactos

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

**Medium (proposta — o humano confirma na aprovação `Draft → Ready`)**: fecha a **Etapa 6 (Aprendizado)** do Cognitive Lifecycle — o último gate do item 1.2 do Roadmap, completando o ciclo cognitivo nas sete etapas (valor de produto). Não é um endurecimento de segurança urgente (como a série 1.1); o raio de mudança é contido a `@atlas/cognitive` (o grosso) mais adições aditivas em `@atlas/contracts`, `@atlas/memory` e a mediação/traço na CLI. Espelha a prioridade da SPEC-0019 (Observação, a outra metade de 1.2).

---

**Item do Roadmap**

`Fase 1 — 1.2 (Fechar o Ciclo Cognitivo) — Aprendizado` (`docs/04-engineering/Roadmap.md`), marcado como `gate · ADR primeiro`. O gate foi cumprido: a decisão estrutural (dar ao Cognitive a capacidade de decidir o que preservar sem transferir a autoridade de gravação da Memory nem tornar `respond` impuro) está registrada e **aprovada** no [ADR-0016](../../06-adr/ADR-0016-learning-proposed-extraction.md) (Status `Accepted`). Esta SPEC **consome** esse ADR como fonte de verdade do escopo — não reabre a decisão. É a **última metade** do item 1.2: a Observação (Etapa 5) foi fechada pela [SPEC-0019](SPEC-0019-observation-replan-loop.md)/[ADR-0015](../../06-adr/ADR-0015-observation-replan-loop.md); com o Aprendizado, o item 1.2 fecha por inteiro.

---

# Objetivo

Ao concluir esta SPEC, a **Etapa 6 (Aprendizado)** do [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md) passa a existir na implementação: além de gravar memória por comando explícito do usuário (`atlas remember`), o Atlas passa a **decidir sozinho — via modelo — quais informações de um turno valem ser preservadas** para interações futuras, propondo-as como dado que a borda grava e anuncia.

Concretamente, quando esta SPEC estiver concluída:

- Existe um **`learner` puro** novo em `@atlas/cognitive` (mesmo molde de `createPlanner()`/`observe()`: sem gateway, sem IO, testável isolado) que expõe:
  - `instruction()` — o framing de extração (analisar o turno e devolver, em JSON estruturado, os fatos que valem preservar — ou nenhum) mais o schema JSON esperado. O framing instrui a extrair **apenas fatos que o usuário afirmou ou fortemente implicou**, nunca fatos inferidos/inventados pelo modelo (Artigo 13 da Constituição — assumir fatos inexistentes viola os princípios da plataforma);
  - `parse(saída) → readonly string[]` — 0..N textos de fatos; saída inválida, vazia, ou não-JSON → **lista vazia**; um **teto fixo embutido de candidatos por turno (constante = 3)** aplicado no `parse` como guardrail contra modelo tagarela.
  - O tipo de retorno é `readonly string[]` (textos simples); nenhum tipo novo sobe a `@atlas/contracts`.
- O helper interno `runPlanCycle` (compartilhado por `ask` **e** `respond`) faz, **depois** de compor a resposta final do turno (tanto no caminho "sem plano → resposta direta" quanto no caminho "com plano → composição"), **+1 chamada `generate`** dedicada, com a `instruction()` do learner e o conteúdo do turno (input do usuário + resposta final; em `respond`, com o contexto da conversa). A saída passa por `learner.parse`.
- **Robustez**: qualquer falha da chamada de extração (erro do modelo/gateway) ou de parse (JSON inválido, formato inesperado, vazio) resulta em **nada aprendido** (`learned` ausente ou lista vazia) — o turno **nunca quebra** por causa do Aprendizado.
- `AskResult` e `ConversationTurn` (`@atlas/contracts`) ganham o campo **opcional** `learned?: readonly string[]` (aditivo, espelhando o precedente de `steps?`). O Cognitive **propõe** os candidatos aí; **não grava**.
- A borda grava e anuncia: `atlas ask` **e** `atlas chat` iteram `result.learned` / `turn.learned`, gravam cada candidato via `atlas.memory.remember(texto, 'learned')` e imprimem um **traço compacto** (ex.: `💡 lembrado: <fato>`).
- **Proveniência**: `Fact` (`@atlas/contracts`) ganha o campo **opcional** `source?: 'user' | 'learned'` (aditivo); `MemoryService.remember` ganha um **parâmetro opcional** de origem com default `'user'` (todos os chamadores existentes — `atlas remember` — permanecem válidos e gravam `'user'`). `atlas memory list` exibe a origem de cada fato.
- O Cognitive continua **puro e sem estado** (ADR-0008): propor é devolver dado, não efetuar disco — nenhuma porta de escrita entra em `CognitiveCoreDeps`. A Memory **mantém autoridade exclusiva** sobre estado persistente (ADR-0011): só ela grava, chamada pela borda como `atlas remember` já faz.

**Limitação consciente (documentada, não resolvida aqui)**: `memoryPrompt` é composto na criação do Atlas (ADR-0011); um fato aprendido durante uma sessão de `chat` **só entra no system prompt na próxima invocação da CLI**, não é re-injetado ao vivo na sessão corrente. Recomposição ao vivo é fatia futura.

Planner, Observer, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway` permanecem intactos.

---

# Motivação

O [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md) define sete etapas; com a Observação fechada pela SPEC-0019/ADR-0015, a **Etapa 6 — Aprendizado** ("determinar quais informações devem ser preservadas; nem todo conhecimento produzido deve ser armazenado; decidir cuidadosamente quais informações são relevantes para futuras interações, respeitando as políticas de memória da plataforma") é a **única etapa sem contraparte na implementação**. Fechá-la é o gate restante do item **1.2 (Fechar o Ciclo Cognitivo)** do [Roadmap](../../04-engineering/Roadmap.md).

O [PRD](../../02-product/ProductRequirementsDocument.md) sustenta a necessidade em vários pontos: entre os Objetivos do Produto, "aprender continuamente sobre o contexto do usuário" (l. 46); a seção **Aprendizado** — "O sistema deve adaptar-se às preferências do usuário ao longo do tempo. Esse aprendizado deve ocorrer de maneira controlada e revisável" (l. 159–163); a seção **Memória** — "O sistema deve lembrar informações relevantes entre sessões" e "O usuário deve poder consultar, atualizar e remover informações armazenadas" (l. 123–125); e a seção **Transparência** — "O sistema deve informar ações relevantes durante sua execução" (l. 151). "Controlada e revisável" é exatamente o que a proveniência (`source`), o traço no momento da gravação, e o `atlas forget` já existente entregam.

Hoje a Memory Service ([ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md)) só grava por comando explícito (`atlas remember`); o Cognitive **não conhece** o conceito de Memory — recebe apenas `memoryPrompt?: string` composto pelo `@atlas/core`. A pergunta central que o ADR-0016 respondeu: **como dar ao Cognitive a capacidade de decidir o que preservar — a essência da Etapa 6 — sem transferir para ele a autoridade de gravação da Memory, sem tornar `respond` impuro, e sem que aprendizado ruim aconteça às escondidas do usuário?** A resposta: **o Cognitive propõe, a borda grava, o usuário vê** — decisão de relevância pelo modelo numa chamada dedicada pós-resposta; `learner` puro no molde do Planner/Observer; candidatos devolvidos como dado; gravação e aviso na borda (onde a mediação de Context já vive, ADR-0009); proveniência para auditoria.

O [Module Catalog](../../03-architecture/ModuleCatalog.md) **não reserva um módulo separado** para Aprendizado e já enquadra a Memory como "É utilizada por... processos de aprendizado" e o Cognitive Core como não responsável por "persistir memória diretamente". A [Constituição](../../00-project/ArchitectureConstitution.md) reforça: a Memory tem **autoridade exclusiva** sobre estado persistente (Artigo 6), o Cognitive é o único orquestrador estratégico mas não persiste (Artigo 4), a transparência é invariante — por isso "grava e avisa", nunca gravação silenciosa — e o Atlas **não pode assumir fatos inexistentes** (Artigo 13), o que ancora o framing restritivo do `learner` (extrair só o afirmado/fortemente implicado, nunca inventado).

Documentos originadores: **ADR-0016** (decisão, escopo, casos-limite, residuais — fonte de verdade) + **ADR-0011** (Memory como autoridade exclusiva; `memoryPrompt` injetado; a nota de atualização que esta SPEC prevê) + **ADR-0008** (conversa como dado; Cognitive puro/sem estado) + **ADR-0009** (mediação na app, não no Cognitive) + **PRD** (Aprendizado/Memória/Transparência) + **Module Catalog** (Aprendizado como colaboração, sem módulo novo) + **Cognitive Lifecycle** (Etapa 6) + **Constituição** (Artigo 13 — não assumir fatos inexistentes) + **SPEC-0019** (o `runPlanCycle` e o precedente `steps?` que `learned?` espelha; o molde do `observe` puro que o `learner` segue) + **SPEC-0009** (Memory Service, `Fact`, storage JSON).

---

# Referências

- [ADR-0016](../../06-adr/ADR-0016-learning-proposed-extraction.md) (`docs/06-adr/ADR-0016-learning-proposed-extraction.md`) — **fonte de verdade do escopo**: o Cognitive propõe, a borda grava, o usuário vê; extração numa chamada `generate` dedicada pós-resposta; `learner` puro (`instruction`/`parse → readonly string[]`, teto fixo de candidatos, tipo interno); `learned?` em `AskResult`/`ConversationTurn`; `Fact.source?` + parâmetro de origem em `remember`; grava-e-avisa sem `confirm`; limitação do `memoryPrompt` na sessão corrente; residuais fora de escopo
- [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) (`docs/06-adr/ADR-0011-memory-service-persistence.md`) — Memory como autoridade exclusiva de estado persistente; `memoryPrompt` injetado na geração; Memória × Contexto; **ganha nota de atualização** (segundo caminho de gravação — ainda exclusivo da Memory — alimentado pela borda com candidatos do Cognitive)
- [ADR-0008](../../06-adr/ADR-0008-conversation-as-data.md) (`docs/06-adr/ADR-0008-conversation-as-data.md`) — conversa como dado; `respond` função pura; Cognitive sem estado (por que a gravação não pode entrar no turno)
- [ADR-0009](../../06-adr/ADR-0009-context-service-value-store.md) (`docs/06-adr/ADR-0009-context-service-value-store.md`) — a mediação (store de valor × orquestrador) fica na app; precedente para a borda gravar os candidatos
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) (`docs/06-adr/ADR-0013-permission-service-execution-gate.md`) — `confirm` reservado a ações destrutivas/irreversíveis; gravar memória é reversível (`forget`) → **não** exige `confirm`
- [SPEC-0019](SPEC-0019-observation-replan-loop.md) (`docs/implementation/specs/SPEC-0019-observation-replan-loop.md`) — o `runPlanCycle` (onde entra a chamada de extração), o molde do `observe` puro (que o `learner` segue), o precedente `steps?` (que `learned?` espelha), `renderSteps` no CLI
- [SPEC-0014](SPEC-0014-tools-confirm-in-chat.md) (`docs/implementation/specs/SPEC-0014-tools-confirm-in-chat.md`) — `runPlanCycle` compartilhado por `ask`/`respond`; `steps` em `AskResult`/`ConversationTurn`; mensagem `system` compacta de resumo
- [SPEC-0009](SPEC-0009-memory-service.md) (`docs/implementation/specs/SPEC-0009-memory-service.md`) — Memory Service, `Fact { id, text, createdAt }`, `remember`/`forget`/`list`/`prompt`, storage JSON injetável
- [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md) (`docs/03-architecture/CognitiveLifecycle.md`) — as sete etapas; Etapa 6 (Aprendizado)
- [Module Catalog](../../03-architecture/ModuleCatalog.md) (`docs/03-architecture/ModuleCatalog.md`) — Memory como autoridade exclusiva; "processos de aprendizado" como consumidor da Memory; sem módulo separado para Aprendizado
- [PRD](../../02-product/ProductRequirementsDocument.md) (`docs/02-product/ProductRequirementsDocument.md`) — Aprendizado (l. 159–163), Memória (l. 117–125), Transparência (l. 149–155), Objetivos do Produto (l. 46)
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) (`docs/00-project/ArchitectureConstitution.md`) — Artigo 3 (não criar módulos sem documentação), Artigo 4 (Cognitive único orquestrador; não persiste), Artigo 6 (Memory autoridade exclusiva do estado persistente), Artigo 13 (não assumir fatos inexistentes — ancora o framing restritivo do `learner`)

---

# Escopo

Muda código de produção em `packages/cognitive` (o grosso), mais adições **aditivas** em `packages/contracts` e `packages/memory`, mais a **mediação e o traço** na CLI (`apps/cli`). Estritamente o desenho aprovado no ADR-0016 — nem mais, nem menos.

- **`@atlas/contracts` — campos opcionais/aditivos (nenhum tipo novo)**:
  - `AskResult` e `ConversationTurn` (`packages/contracts/src/cognitive.ts`) ganham o campo **opcional** `learned?: readonly string[]` — aditivo, espelhando `steps?`. Assinatura de `CognitiveCore` (`ask`/`respond`) **inalterada**.
  - `Fact` (`packages/contracts/src/memory.ts`) ganha o campo **opcional** `source?: 'user' | 'learned'` — aditivo.
  - `MemoryService.remember` (`packages/contracts/src/memory.ts`) passa a `remember(text: string, source?: 'user' | 'learned'): Promise<Fact>` — parâmetro **opcional** (chamadores existentes intactos). Nenhuma outra mudança de contrato.
- **`@atlas/cognitive` — `learner` puro**:
  - Criar um `learner` puro (ex.: `packages/cognitive/src/learner.ts`), no molde de `createPlanner()`/`observe()`: `instruction()` (framing de extração + schema JSON) e `parse(saída) → readonly string[]` (0..N textos; inválido/vazio/não-JSON → `[]`; **teto fixo embutido de 3 candidatos** aplicado no `parse`). Sem gateway, sem IO. Testável isolado.
  - O `instruction()` instrui explicitamente a extrair **apenas fatos que o usuário afirmou ou fortemente implicou**, nunca fatos inferidos/inventados pelo modelo (Artigo 13 da Constituição).
  - Nenhum tipo novo sobe a `@atlas/contracts` (o retorno é `readonly string[]`).
- **`@atlas/cognitive` — extração no `runPlanCycle`**:
  - Após a resposta final do turno ser produzida — **tanto** no caminho "sem plano → resposta direta" **quanto** no caminho "com plano → composição" — fazer **+1 chamada `generate`** dedicada, com a `instruction()` do learner mais o conteúdo do turno (input do usuário + resposta final; em `respond`, com o contexto da conversa). A saída passa por `learner.parse`.
  - A chamada de extração acontece **depois** da composição/resposta final (nunca antes; nunca acoplada à chamada de composição — chamada separada).
  - **Reestruturação do helper interno `runPlanCycle`** (ver "Interfaces Necessárias"): hoje o caminho "sem plano" retorna cedo antes de qualquer composição, e o helper só recebe `firstMessages` e `buildComposeMessages` — não recebe o conteúdo cru do turno. Para rodar a extração nos dois caminhos com "input do usuário + resposta final", o helper precisa (a) deixar de retornar antecipadamente no caminho "sem plano" antes da extração, e (b) receber o conteúdo do turno por novo parâmetro/callback, devolvendo `learned` no `PlanCycleResult`. É mudança **interna** (sem contrato público novo).
  - **Robustez**: envolver a chamada de extração e o parse de modo que qualquer erro (modelo/gateway) ou saída inválida resulte em `learned` ausente/vazio — o turno nunca quebra.
  - Propagar os candidatos até `AskResult.learned` (em `ask`) e `ConversationTurn.learned` (em `respond`). O Cognitive **não** grava; **não** altera a `Conversation` persistida por causa do aprendizado (o campo `learned` é dado de saída, não histórico injetado).
- **`@atlas/memory` — proveniência**:
  - `createMemoryService` (`packages/memory/src/memory-service.ts`): `remember(text, source?)` grava o `Fact` com `source` (default `'user'` quando omitido). O `Fact` persistido pelo storage JSON passa a incluir `source`; fatos antigos sem `source` no arquivo permanecem legíveis (campo opcional).
- **`apps/cli` — mediação + traço + origem no `list`**:
  - `atlas ask` (`apps/cli/src/commands/ask.ts`) e `atlas chat` (`apps/cli/src/commands/chat.ts`): após imprimir os `steps`/resposta, iterar os candidatos `learned`, gravar cada um via `atlas.memory.remember(texto, 'learned')` e imprimir um traço compacto (ex.: `💡 lembrado: <fato>`). Pode-se extrair um pequeno helper de renderização (ex.: `renderLearned`) reusado por ambos, análogo a `renderSteps`.
  - `atlas memory list` (`apps/cli/src/commands/memory.ts`): exibir a origem de cada fato (fatos sem `source` tratados como `'user'`).
- **Testes** (`@atlas/cognitive`, `@atlas/memory`, `apps/cli`, com fakes — gateway `fake`/injetado, runtime fake, storage fake em memória; **sem rede/disco reais**): cobrir a seção "Estratégia de Testes".
- **Documentação**: atualizar `packages/cognitive/CLAUDE.md`, `packages/contracts/CLAUDE.md`, `packages/memory/CLAUDE.md`, `apps/cli/CLAUDE.md`, `CLAUDE.md` raiz (invariantes/estado); adicionar **nota de atualização ao [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md)** (segundo caminho de gravação alimentado pela borda — previsto explicitamente pelo ADR-0016; **não** criar ADR novo); `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`; marcar o item 1.2 (Aprendizado) do `Roadmap.md` como concluído/entregue por esta SPEC (fechando o item 1.2 por inteiro); registrar lições em `docs/implementation/LESSONS_LEARNED.md`.

---

# Fora do Escopo

Esta seção é obrigatória e reflete os residuais que o ADR-0016 documentou explicitamente como **não** fechados nesta fatia.

- **Memória episódica** (item 1.3 do Roadmap) e demais categorias de conhecimento. Esta fatia grava fatos aprendidos como `Fact` — a mesma categoria de `atlas remember`, só com `source: 'learned'`. **Não** implementar novas categorias.
- **Deduplicação / consolidação semântica**. O mesmo fato pode ser aprendido repetidamente (inclusive dentro de uma mesma sessão — ver Observações/Riscos); nada dedup aqui. **Não** implementar.
- **Retenção / expiração / políticas configuráveis de memória**. **Não** implementar.
- **Teto de candidatos configurável** (flag/env). O teto é uma **constante embutida** (3). **Não** criar flag/env/precedência.
- **Gatilho heurístico** para economizar a chamada de extração ("só chamar quando..."). A chamada é **sempre** feita ao fim do turno nesta fatia. **Não** implementar.
- **Extração única no fim da sessão** (`chat`). A extração é **por turno**. **Não** implementar.
- **`/lembrar` / `/esquecer` como comandos de conversa** dentro do `chat` (item 1.3). **Não** implementar.
- **Recomposição ao vivo do `memoryPrompt`** na sessão corrente. Fato aprendido só entra no prompt na próxima invocação da CLI — limitação documentada, **não** resolvida aqui.
- **Confirmação interativa por fato (`confirm`)**. Gravar memória é reversível (`forget`) — grava-e-avisa, sem `confirm`. **Não** adicionar `confirm` ao fluxo de aprendizado.
- **Gravação silenciosa**. O aviso (traço) é obrigatório. **Não** gravar sem anunciar.
- **Observador semântico do resultado**, dependência de dados entre passos, Task Manager, ampliar o teto de replan — nada disso é tocado (pertencem a outras fatias / SPEC-0019).
- **Qualquer mudança em** `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`, `createPlanner()`, `observe()`. Em particular: **não** injetar porta de escrita no Cognitive (`CognitiveCoreDeps` inalterado além do necessário para a extração, que não requer nova dep); **não** alterar `@atlas/contracts` além de `learned?`, `Fact.source?` e o parâmetro opcional de `remember`.

---

# Pré-requisitos

- [SPEC-0009](SPEC-0009-memory-service.md) (Memory Service; `Fact`; `remember`/`forget`/`list`/`prompt`; storage JSON injetável) — **Done** (confirmado: `packages/memory` existe e é consumido pela CLI)
- [SPEC-0014](SPEC-0014-tools-confirm-in-chat.md) (`runPlanCycle` compartilhado por `ask`/`respond`; `steps?` em `AskResult`/`ConversationTurn`; mensagem `system` compacta) — **Done** (confirmado)
- [SPEC-0019](SPEC-0019-observation-replan-loop.md) (`runPlanCycle` como laço; `observe` puro — o molde que o `learner` segue; a estrutura atual de `runPlanCycle` onde entra a extração) — **Done** (confirmado: `Roadmap.md` marca a Observação como entregue; `cognitive-core.ts` já contém o laço e `observer.ts`)

---

# Critérios de Aceitação

Cada item é verificável mecanicamente pelo `spec-validator`.

- **`learned?` no contrato**: `packages/contracts/src/cognitive.ts` passa a declarar `learned?: readonly string[]` em `AskResult` **e** em `ConversationTurn`, **opcional**; assinatura de `CognitiveCore` (`ask`/`respond`) inalterada.
- **`Fact.source?` no contrato**: `packages/contracts/src/memory.ts` passa a declarar `source?: 'user' | 'learned'` em `Fact`, **opcional**; e `MemoryService.remember` passa a `remember(text: string, source?: 'user' | 'learned'): Promise<Fact>`. Nenhuma outra mudança de contrato.
- **`learner` puro**: existe um `learner` em `@atlas/cognitive` com `instruction(): string` e `parse(saída: string): readonly string[]`, **sem** chamar gateway/modelo e **sem** IO. Verificável com strings fixas, sem gateway.
- **`instruction()` restringe a fatos afirmados/implicados (Artigo 13)**: o texto retornado por `instruction()` instrui a extrair **apenas** fatos que o usuário afirmou ou fortemente implicou e a **não** inventar/inferir fatos inexistentes. O teste de `instruction()` **assevera essa restrição no conteúdo do prompt** (ex.: presença das noções "não inventar/inferir" e "apenas o que o usuário afirmou"), não apenas "string não-vazia".
- **Regras do `parse`**:
  - JSON válido com N fatos (N ≤ 3) → lista com os N textos;
  - JSON válido com mais de 3 fatos → lista truncada em **3** (teto embutido);
  - JSON válido vazio / sem fatos → `[]`;
  - saída não-JSON / JSON malformado / formato inesperado → `[]`.
- **Nenhum tipo de aprendizado sobe a `@atlas/contracts`**: o retorno do learner é `readonly string[]`; nenhum tipo novo (`LearnResult`/similar) aparece em `@atlas/contracts` (verificável no diff de `packages/contracts`).
- **Extração é +1 chamada, depois da composição**: em `ask` e `respond`, a chamada de extração é uma chamada `generate` **adicional e separada**, feita **após** a resposta final do turno ser produzida. Verificável contando/roteirizando as chamadas do fake de gateway:
  - **sem plano**: resposta direta (1 chamada) **+ 1 extração** = **2** chamadas;
  - **com plano, sucesso**: plano + composição (2 chamadas) **+ 1 extração** = **3** chamadas;
  - **com plano, 1 replan**: plano + replan + composição (3 chamadas) **+ 1 extração** = **4** chamadas.
- **Candidatos propostos como dado**: quando a extração devolve fatos, `ask` retorna `AskResult.learned` com esses textos e `respond` retorna `ConversationTurn.learned` idem. O Cognitive **não** grava (nenhuma porta de escrita em `CognitiveCoreDeps`) e **não** injeta os fatos aprendidos na `Conversation` retornada.
- **Extração não quebra o turno**: se a chamada `generate` de extração **lança** (erro do modelo/gateway), o turno ainda retorna a resposta final normalmente, com `learned` ausente/vazio. Se a extração devolve saída inválida, idem (`learned` = `[]`/ausente). Verificável com fake que lança/roteiriza saída inválida só na chamada de extração.
- **`remember` com/sem `source`**: `remember(text)` grava `Fact` com `source: 'user'` (default); `remember(text, 'learned')` grava `source: 'learned'`; `remember(text, 'user')` grava `'user'`. O `source` é **persistido** pelo storage (verificável inspecionando o que foi passado ao `save` do storage fake / o JSON gravado).
- **Chamadores existentes intactos**: `atlas remember` (e qualquer chamada `remember(text)` de 1 argumento) continua compilando e grava `source: 'user'`.
- **Borda grava e anuncia (`ask`)**: `atlas ask` chama `atlas.memory.remember(<cada candidato>, 'learned')` para cada item de `result.learned` e imprime um traço compacto por fato (ex.: `💡 lembrado: <fato>`). Sem candidatos → nada gravado, nada impresso além do fluxo atual.
- **Borda grava e anuncia (`chat`)**: `atlas chat`, a cada turno, faz o mesmo para `turn.learned`.
- **`memory list` exibe origem**: `atlas memory list` mostra a origem de cada fato (fato sem `source` tratado como `'user'`). Verificável na saída do comando.
- **Compatibilidade do contrato**: adicionar `learned?`, `Fact.source?` e o parâmetro opcional de `remember` **não** quebra o typecheck do repo — todos os construtores/fakes de `AskResult`/`ConversationTurn`/`Fact` e chamadores de `remember` existentes seguem válidos. `pnpm typecheck` verde.
- **Componentes intactos**: nenhum diff de código em `packages/runtime`, `packages/permissions`, `packages/tools`, `packages/model-gateway`, `packages/persona`, `packages/context`; `createPlanner()` e `observe()` inalterados; `CognitiveCoreDeps` não ganha porta de escrita.
- **Documentação**: `CLAUDE.md` raiz + `packages/cognitive/CLAUDE.md` + `packages/contracts/CLAUDE.md` + `packages/memory/CLAUDE.md` + `apps/cli/CLAUDE.md` atualizados; **nota de atualização no ADR-0011**; `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` atualizados; item 1.2 (Aprendizado) do `Roadmap.md` marcado como entregue (item 1.2 fechado por inteiro); lições em `LESSONS_LEARNED.md`.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.

---

# Arquivos Esperados

```text
packages/contracts/src/
  cognitive.ts           (editado: AskResult e ConversationTurn ganham learned?: readonly string[])
  memory.ts              (editado: Fact ganha source?: 'user' | 'learned';
                          remember(text, source?): Promise<Fact>)

packages/cognitive/src/
  learner.ts             (novo: instruction() + parse(saída) → readonly string[]; teto embutido de 3; puro.
                          instruction() ancora o framing no Artigo 13: só fatos afirmados/implicados,
                          nunca inventados)
  cognitive-core.ts      (editado: +1 chamada generate de extração após a resposta final,
                          em ask e respond; parse via learner; learned propagado; robusto a falha.
                          REESTRUTURAÇÃO do helper interno runPlanCycle — ver Interfaces Necessárias:
                          eliminar o retorno antecipado do caminho "sem plano" antes da extração;
                          passar o conteúdo cru do turno ao helper por novo parâmetro/callback;
                          PlanCycleResult passa a carregar learned)
  index.ts               (editado se necessário; nenhum tipo de aprendizado exportado a contracts)

packages/cognitive/tests/
  learner.test.ts        (novo: parse — válido/teto/vazio/JSON malformado/não-JSON;
                          instruction — assevera a restrição do Artigo 13 no texto do prompt)
  cognitive-core.test.ts (editado: extração +1 chamada após composição; learned propagado;
                          falha de extração → sem learned/turno intacto; ask e respond;
                          com e sem plano; atualizar contagens de chamadas dos testes existentes)

packages/memory/src/
  memory-service.ts      (editado: remember(text, source?) grava source; default 'user')

packages/memory/tests/
  memory-service.test.ts (editado: remember com/sem source; persistência de source no storage)

apps/cli/src/commands/
  ask.ts                 (editado: grava learned via memory.remember(.., 'learned') + imprime traço)
  chat.ts                (editado: idem por turno)
  memory.ts              (editado: list exibe origem)

apps/cli/src/gateway/
  steps-trace.ts         (possivelmente editado: helper renderLearned reusado por ask/chat)

apps/cli/tests/          (conforme layout atual)
  (editado: ask/chat gravam e imprimem o traço com fakes; memory list mostra origem)

CLAUDE.md (raiz)                                          (editado: invariantes/estado)
packages/cognitive/CLAUDE.md, packages/contracts/CLAUDE.md,
packages/memory/CLAUDE.md, apps/cli/CLAUDE.md            (editados)
docs/06-adr/ADR-0011-memory-service-persistence.md       (editado: nota de atualização)
docs/04-engineering/Roadmap.md                           (editado: item 1.2 Aprendizado entregue)
docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md  (editados)
docs/implementation/LESSONS_LEARNED.md                   (editado)
```

Lista é expectativa; o nome exato do arquivo/função do learner e a decisão de extrair um helper `renderLearned` vs. renderizar inline em `ask`/`chat` podem sofrer pequenos ajustes conforme o padrão atual dos packages.

---

# Componentes Impactados

- Cognitive Core (`@atlas/cognitive`) — novo `learner` puro; `runPlanCycle` reestruturado para fazer +1 chamada de extração após a resposta final (nos dois caminhos); `learned` propagado. **Grosso** da mudança.
- Contracts (`@atlas/contracts`) — três adições **aditivas/opcionais**: `AskResult.learned?`, `ConversationTurn.learned?`, `Fact.source?` e o parâmetro opcional de `MemoryService.remember`.
- Memory Service (`@atlas/memory`) — `remember(text, source?)` grava a origem; storage persiste `source`.
- CLI (`apps/cli`) — mediação (grava os candidatos) + traço de aprendizado + origem no `memory list`.
- Planner (`createPlanner`), Observer (`observe`), Runtime, Permission Service, Tools, Model Gateway, Persona, Context — **inalterados**.

---

# Interfaces Necessárias

- **`AskResult.learned?: readonly string[]`** e **`ConversationTurn.learned?: readonly string[]`** (`@atlas/contracts`): campos **opcionais** aditivos; espelham `steps?`. O Cognitive propõe os candidatos aqui.
- **`Fact.source?: 'user' | 'learned'`** (`@atlas/contracts`): campo **opcional** aditivo; proveniência.
- **`MemoryService.remember(text: string, source?: 'user' | 'learned'): Promise<Fact>`** (`@atlas/contracts`): parâmetro **opcional** com default `'user'`; chamadores existentes intactos.
- **`learner`** (`@atlas/cognitive`, interno): `instruction(): string` (framing de extração restrito ao Artigo 13 + schema JSON) e `parse(saída: string): readonly string[]` (0..N textos, teto embutido de 3, inválido/vazio → `[]`); puro/síncrono; sem gateway; sem IO. **Nenhum** tipo novo sobe a `@atlas/contracts`.
- **`runPlanCycle` (helper interno de `@atlas/cognitive`) — assinatura interna muda**: hoje é `runPlanCycle(firstMessages, buildComposeMessages)` com retorno antecipado no caminho "sem plano" (antes de qualquer composição) e `PlanCycleResult { firstText, plan, execution?, composedText? }`. Para a extração:
  - o helper deixa de retornar antecipadamente no "sem plano" **antes** de rodar a extração (a extração precisa rodar nos dois caminhos);
  - passa a receber o **conteúdo cru do turno** (input do usuário + acesso à resposta final) por **novo parâmetro/callback** (ex.: um `buildLearnMessages(finalText)` análogo a `buildComposeMessages`, montando a chamada de extração com a `instruction()` do learner + input + resposta final);
  - `PlanCycleResult` passa a carregar **`learned: readonly string[]`**.
  - É mudança **interna** ao package — **sem** contrato público novo (nada sobe a `@atlas/contracts`). Registrada aqui porque o implementer precisa saber de antemão que o retorno antecipado some e a assinatura do helper muda.
- **`CognitiveCore`** (`@atlas/contracts`): `ask`/`startConversation`/`respond` — **assinaturas públicas preservadas** (o campo `learned?` é aditivo no resultado, não muda a assinatura dos métodos).
- **Nenhuma** outra interface nova ou alterada.

---

# Fluxo Esperado

```text
learner (puro, sem gateway/IO):
  instruction()  →  framing de extração (Artigo 13: só afirmado/implicado, nunca inventado) + schema JSON
  parse(saída)   →  JSON válido com fatos → [texto...] (truncado no teto = 3)
                    inválido / vazio / não-JSON        → []

runPlanCycle (ask e respond) — extração após a resposta final:

  ... (fluxo de plano/execução/observação/composição da SPEC-0019 inalterado) ...
     │
     resposta final do turno pronta (texto direto OU composição)
     │  (o caminho "sem plano" NÃO retorna mais aqui — segue para a extração)
     ▼
  generate(instruction do learner + input do usuário + resposta final)   [+1 chamada, DEPOIS da composição]
     │  try:
     │     parse(saída) → candidatos (0..3)
     │  catch (erro de modelo) ou saída inválida:
     │     candidatos = []      [turno NUNCA quebra]
     │
     ▼
  AskResult { text, steps?, learned? }   /   ConversationTurn { reply, conversation, steps?, learned? }
     (Cognitive NÃO grava; NÃO injeta os fatos na Conversation)

Borda (atlas ask / atlas chat):
  para cada fato em learned:
     atlas.memory.remember(fato, 'learned')     [Memory: autoridade exclusiva de gravação]
     imprime  "💡 lembrado: <fato>"             [transparência obrigatória]

Memory.remember(text, source?):
  Fact { id, text, createdAt, source: source ?? 'user' }  →  storage.save (persiste source)

atlas memory list:
  [id] <texto> (createdAt) — origem: user | learned   (sem source → user)
```

---

# Estratégia de Implementação

Sugestão de ordem (TDD, com fakes — gateway `fake`/injetado que conta chamadas e roteiriza saídas por chamada; runtime fake; storage fake em memória; sem rede/disco):

1. **Contrato**: acrescentar `learned?` a `AskResult`/`ConversationTurn` (`cognitive.ts`), `source?` a `Fact` e o parâmetro opcional a `MemoryService.remember` (`memory.ts`). Rodar os greps de higiene **antes de assumir inocuidade** — membro novo em interface de contrato pode quebrar fakes no typecheck (lição SPEC-0017/0019): `git grep 'MemoryService'`, `git grep 'Fact'`, `git grep 'AskResult'`, `git grep 'ConversationTurn'` (buscar pelo **nome do tipo**, não pela construtora). Confirmar com `pnpm --filter @atlas/contracts typecheck` (e do repo) — lembrando que `vitest run` **não** faz typecheck; passos RED que dependem de erro de tipo exigem `pnpm --filter <pkg> typecheck`.
2. **`learner` puro**: criar `instruction()` (com o framing restritivo do Artigo 13) + `parse()` com o teto embutido de 3; testar isolado (válido/teto/vazio/JSON malformado/não-JSON; e o teste de `instruction()` asseverando a restrição do Artigo 13 no texto).
3. **Memory**: `remember(text, source?)` grava `source` (default `'user'`); teste de persistência do campo no storage fake; teste de compatibilidade do chamador de 1 argumento.
4. **Extração no `runPlanCycle`**: reestruturar o helper (remover o retorno antecipado do "sem plano" antes da extração; adicionar o parâmetro/callback do conteúdo do turno; `PlanCycleResult` ganha `learned`); adicionar a +1 chamada `generate` **após** a resposta final (nos dois caminhos), com try/catch que garante `learned` vazio em falha; parse via learner; propagar a `AskResult`/`ConversationTurn`. **Atenção**: os testes existentes de `cognitive-core` que contam chamadas de gateway mudam (+1 por turno) — atualizá-los.
5. **Borda**: `ask` e `chat` gravam os candidatos via `memory.remember(.., 'learned')` e imprimem o traço (helper `renderLearned` reusado, ou inline); `memory list` mostra a origem.
6. **Testes de comportamento**: contagem de chamadas por caso (2/3/4); `learned` propagado; falha de extração → turno intacto; ask e respond; borda gravando e imprimindo com fakes.
7. **Verificação**: `lint`/`format:check`/`typecheck`/`test`. Rodar por caminho a partir da raiz (`pnpm exec vitest run <path>`), não `pnpm --filter <pkg> test`.
8. **Documentação**: `CLAUDE.md` (raiz + cognitive + contracts + memory + cli); nota de atualização no ADR-0011; `Roadmap.md` (item 1.2 Aprendizado entregue — item 1.2 fechado); `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

Todos com fakes (gateway `fake`/injetado que conta chamadas e devolve saídas roteirizadas por chamada; runtime fake que devolve `ExecutionResult` roteirizados; storage fake em memória). **Sem rede/disco reais.** Suíte atual: **300 testes** — a contagem sobe com os novos casos; testes existentes de `cognitive-core` que contam chamadas de gateway **precisam** subir +1 por turno (a chamada de extração).

- **(unit) `learner.parse`**: JSON válido com ≤3 fatos → lista correspondente; JSON válido com >3 fatos → truncado em 3; JSON válido sem fatos/vazio → `[]`; saída não-JSON → `[]`; JSON malformado → `[]`; formato inesperado (ex.: não-array) → `[]`.
- **(unit) `learner.instruction`**: retorna string com o framing/schema **e** que assevera a restrição do Artigo 13 — o texto instrui a extrair apenas fatos afirmados/fortemente implicados pelo usuário e a não inventar/inferir (verificação do conteúdo do prompt, não só "não-vazia"); sem gateway.
- **(cognitive) extração é +1 chamada, após a composição** — para `ask` **e** `respond`:
  - sem plano → **2** chamadas `generate` (resposta direta + extração); `observe` não envolvido;
  - com plano, sucesso → **3** chamadas (plano + composição + extração);
  - com plano, 1 replan → **4** chamadas (plano + replan + composição + extração);
  - verificar que a chamada de extração usa a `instruction()` do learner e o conteúdo do turno (input + resposta final) inspecionando as `messages` passadas ao fake.
- **(cognitive) candidatos propostos como dado**: extração devolve fatos → `AskResult.learned`/`ConversationTurn.learned` os contêm; extração vazia → `learned` ausente/`[]`; a `Conversation` retornada por `respond` **não** ganha os fatos aprendidos como mensagem.
- **(cognitive) robustez**: fake que **lança** só na chamada de extração → o turno retorna a resposta final normalmente com `learned` ausente/vazio; fake que devolve saída inválida na extração → idem.
- **(cognitive) Cognitive não grava**: `CognitiveCoreDeps` não recebe porta de escrita; nenhuma gravação ocorre dentro de `ask`/`respond` (não há mock de Memory no Cognitive).
- **(memory) `remember` com/sem `source`**: `remember(text)` → `Fact.source === 'user'`; `remember(text, 'learned')` → `'learned'`; `remember(text, 'user')` → `'user'`; o `source` chega ao `save` do storage fake (persistência); fato carregado de JSON antigo sem `source` continua válido.
- **(cli) `ask` grava e imprime**: com fake de plataforma cujo `cognitive.ask` devolve `learned`, `runAsk` chama `memory.remember(.., 'learned')` por candidato e imprime o traço; sem `learned` → nada gravado/impresso além do fluxo atual.
- **(cli) `chat` grava e imprime**: idem por turno.
- **(cli) `memory list` mostra origem**: fatos com `source` `'user'`/`'learned'` (e sem `source`) exibidos com a origem correta.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada: `CLAUDE.md` (raiz) + `packages/cognitive/CLAUDE.md` + `packages/contracts/CLAUDE.md` + `packages/memory/CLAUDE.md` + `apps/cli/CLAUDE.md`; **nota de atualização no ADR-0011**; `docs/04-engineering/Roadmap.md` (item 1.2 Aprendizado entregue; item 1.2 fechado por inteiro); `docs/05-context/NEXT_CONTEXT.md`; `docs/05-context/CURRENT_SPRINT.md`;
- arquitetura preservada: Cognitive **propõe** (puro/sem estado, ADR-0008; nenhuma porta de escrita em `CognitiveCoreDeps`); Memory **grava** (autoridade exclusiva, Artigo 6/ADR-0011); a borda **medeia** (ADR-0009); o `learner` é puro e testável sem gateway (espelha o Planner/Observer) e não assume fatos inexistentes (Artigo 13); nenhum módulo novo (Artigo 3); `@atlas/contracts` tocado só nos campos aditivos; Runtime/Permissões/Tools/Gateway/Planner/Observer intactos;
- residuais documentados como tais (memória episódica, dedup, retenção, teto configurável, gatilho heurístico, extração no fim da sessão, `/lembrar` no chat, recomposição ao vivo do `memoryPrompt`) — nada apresentado como fechado além da extração pós-turno por modelo;
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz + dos packages tocados, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) **não é escopo do `spec-implementer`** — é o passo de fecho `doc-sync` no fio principal, após a validação. O implementador toca só a documentação específica da própria SPEC (o arquivo da SPEC e a nota de atualização no ADR-0011 que a SPEC prevê).

---

# Restrições

- **Não** criar package/módulo novo (Artigo 3; o Module Catalog não reserva módulo para Aprendizado). O `learner` é função pura em `@atlas/cognitive`.
- **Framing restritivo do `learner` (Artigo 13)**: o `instruction()` deve instruir o modelo a extrair **apenas** fatos que o usuário **afirmou ou fortemente implicou** — **nunca** fatos inferidos, deduzidos ou inventados pelo modelo. Assumir fatos inexistentes viola os princípios da plataforma (Artigo 13 da Constituição). Essa restrição vive no texto do prompt e é asseverada por teste.
- **Não** injetar porta de escrita no Cognitive — o Cognitive **propõe** candidatos como dado; **quem grava é a borda** via `atlas.memory.remember` (ADR-0008/0011).
- **Não** tornar `respond` impuro — nenhum efeito de disco dentro do turno.
- **Não** alterar `@atlas/contracts` além de `AskResult.learned?`, `ConversationTurn.learned?`, `Fact.source?` e o parâmetro opcional de `remember`. **Não** promover nenhum tipo de aprendizado a contrato (retorno do learner é `readonly string[]`).
- **Não** deixar a falha de extração quebrar o turno — erro de modelo/parse → `learned` vazio, resposta final preservada.
- **Teto de candidatos fixo embutido = 3**; **não** configurável por flag/env.
- **Não** adicionar `confirm` ao fluxo de aprendizado (gravar memória é reversível via `forget`); **não** gravar silenciosamente (traço obrigatório).
- **Não** implementar memória episódica, dedup/consolidação, retenção, gatilho heurístico, extração no fim da sessão, `/lembrar` no chat, nem recomposição ao vivo do `memoryPrompt`.
- **Não** alterar `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`, `createPlanner()`, nem `observe()`.
- **Não** criar nem editar ADR (o ADR-0016 já está `Accepted`); a única mexida em ADR é a **nota de atualização** no ADR-0011 prevista pelo ADR-0016.
- Testes **sem** rede/disco reais (fakes injetados; gateway `fake`; storage fake em memória). Rodar por caminho a partir da raiz (`pnpm exec vitest run <path>`).

---

# Observações

- **Por que sem módulo novo**: o ADR-0016 (como o ADR-0015 fez para a Observação) não cria `packages/learning` — o Module Catalog enquadra o Aprendizado como colaboração (Cognitive decide o quê, Memory grava, borda medeia); criar package seria fronteira nova sem respaldo do catálogo (Artigo 3). O `learner` puro segue o precedente do Planner (ADR-0012) e do Observer (ADR-0015).
- **Por que a borda grava, não o Cognitive**: gravar dentro do turno tornaria `respond` impuro (efeito de disco — quebra ADR-0008) e daria ao Cognitive a autoridade de gravação que o ADR-0011 deliberadamente lhe negou. Propor (devolver dado) + gravar na borda preserva as duas fronteiras e ainda entrega transparência de graça (o aviso sai no mesmo lugar que grava).
- **Por que +1 chamada dedicada (e não carona na composição)**: acoplar resposta + extração num JSON único degrada os dois em modelos locais fracos e complica o parse (texto livre + estrutura no mesmo output). A chamada dedicada é curta e o provedor default é `local`/Ollama (grátis). Um gatilho heurístico para economizar a chamada é otimização futura (ADR-0016).
- **Leitura de "controlada e revisável" (PRD, Aprendizado)**: nesta fatia, **"controlada" = controle post-hoc por transparência** (traço no momento da gravação + proveniência `source` + `atlas forget`), **não** por confirmação prévia. É decisão explícita do ADR-0016, que rejeitou `confirm` no fluxo de aprendizado (gravar memória é reversível — ADR-0013 reserva `confirm` a ações destrutivas/irreversíveis). O controle prévio via `confirm` foi considerado e descartado no ADR; não é lacuna desta SPEC.
- **Impacto nos testes existentes**: a +1 chamada de extração por turno **muda as contagens de chamadas de gateway** dos testes atuais de `cognitive-core` (sem plano 1→2, sucesso 2→3, replan 3→4). Isso é esperado e faz parte do escopo — atualizar esses testes é obrigatório para o `pnpm test` ficar verde.
- **Risco de duplicação — é intra-sessão, não só entre sessões (custo aceito explícito)**: dentro de **uma mesma sessão de `chat`**, como o `memoryPrompt` não é recomposto ao vivo **e** os fatos aprendidos **não** entram na `Conversation` retornada (o campo `learned` é dado de saída, não histórico injetado), o modelo **não recebe nenhum sinal de que já aprendeu um fato** e pode **re-propô-lo a cada turno** — o teto de 3 é **por turno**, não cumulativo pela sessão. Ou seja, um fato estável ("meu nome é X") pode ser gravado repetidamente ao longo de uma conversa. Isso é **custo aceito** nesta fatia (sem dedup, sem consolidação — fora de escopo); é mitigado pela proveniência (`source: 'learned'`) e pelo `atlas forget`, e a **recomposição ao vivo do `memoryPrompt`** (fatia futura) resolve as duas coisas de uma vez: o fato aprendido passaria a constar no prompt do turno seguinte, sinalizando ao modelo que já foi preservado (evitando a re-proposta) e, de quebra, ficando disponível na própria sessão.
- **Proveniência é irrecuperável retroativamente**: sem `source`, depois de gravados, inferência do modelo e afirmação explícita do usuário ficariam indistinguíveis para sempre. O campo opcional custa quase nada e é a única forma de auditar/limpar aprendizado ruim depois (ADR-0016).
- **Limitação do `memoryPrompt`**: o fato aprendido numa sessão de `chat` só entra no system prompt na **próxima invocação** da CLI (o `memoryPrompt` é composto na criação do Atlas, ADR-0011). Documentada, não resolvida aqui.
- **Higiene de contrato**: membro novo em interface de contrato busca-se pelo **nome do tipo**, não pela construtora — `git grep 'MemoryService'`, `git grep 'Fact'`, `git grep 'AskResult'`, `git grep 'ConversationTurn'`. `vitest run` não faz typecheck; passos RED por erro de tipo exigem `pnpm --filter <pkg> typecheck`.

---

# Checklist para IA

Antes de implementar:

- ler o **ADR-0016** (fonte de verdade do escopo) por inteiro; o ADR-0011 (Memory autoridade exclusiva; `memoryPrompt`; a nota de atualização); o ADR-0008 (Cognitive puro/sem estado); o ADR-0009 (mediação na borda); a SPEC-0019 (o `runPlanCycle` onde entra a extração; o molde do `observe` puro; o precedente `steps?`); a SPEC-0009 (Memory, `Fact`, storage); o Artigo 13 da Constituição (não assumir fatos inexistentes);
- compreender o objetivo (Etapa 6 como `learner` puro + extração pós-turno de +1 chamada, Cognitive propõe / Memory grava / borda medeia, proveniência, teto fixo de 3, robusto a falha, framing restrito ao Artigo 13);
- confirmar que os pré-requisitos (SPEC-0009/0014/0019) estão `Done`;
- rodar os greps de higiene de contrato antes de editar os contratos.

Durante a implementação:

- TDD com fakes (gateway `fake` que conta chamadas e roteiriza saídas; runtime fake; storage fake), sem rede/disco;
- `learner` puro, sem gateway/IO; teto embutido de 3; parse robusto (inválido → `[]`); `instruction()` restrito ao Artigo 13;
- reestruturar `runPlanCycle` (sem retorno antecipado no "sem plano" antes da extração; novo parâmetro/callback do conteúdo do turno; `PlanCycleResult` ganha `learned`);
- extração **depois** da composição, em chamada separada, com try/catch que nunca quebra o turno;
- Cognitive não grava (sem porta de escrita); a borda grava via `memory.remember(.., 'learned')` e anuncia;
- não vazar escopo (nada de dedup, episódica, retenção, gatilho heurístico, teto configurável, `/lembrar` no chat, recomposição ao vivo; nenhuma mudança de contrato além dos campos aditivos; nada em Runtime/Permissões/Tools/Gateway/Planner/Observer).

Após a implementação:

- rodar `lint`/`format:check`/`typecheck`/`test` (por caminho a partir da raiz);
- atualizar documentação (`CLAUDE.md` raiz + cognitive + contracts + memory + cli; nota no ADR-0011; `Roadmap.md` item 1.2 Aprendizado; contexto);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, o ciclo cognitivo do Atlas fica completo nas sete etapas: ao fim de cada turno de `ask`/`respond`, o Cognitive Core faz uma chamada dedicada ao modelo para **decidir o que vale preservar** (via `learner` puro, com framing restrito ao Artigo 13 — só o afirmado/implicado, nunca o inventado —, teto de 3 candidatos, robusto a falha) e **propõe** esses fatos como dado (`AskResult.learned`/`ConversationTurn.learned`), sem gravar nada nem deixar de ser puro. A borda (`atlas ask`/`atlas chat`) grava cada candidato via `atlas.memory.remember(texto, 'learned')` — a Memory permanece a autoridade exclusiva de gravação — e anuncia cada fato aprendido no terminal (`💡 lembrado: <fato>`). Cada `Fact` carrega sua proveniência (`source: 'user' | 'learned'`), exibida por `atlas memory list`, e todo aprendizado é reversível por `atlas forget` (o controle "revisável e controlado" do PRD é post-hoc, por transparência). O grosso da mudança vive em `@atlas/cognitive`; `@atlas/contracts` ganha só campos opcionais aditivos; `@atlas/memory` ganha o parâmetro de origem; Runtime, Permission Service, Tools, Model Gateway, Planner e Observer permanecem intactos. A Etapa 6 (Aprendizado) do Cognitive Lifecycle passa a existir e o item 1.2 do Roadmap fecha por inteiro. Ficam documentadas como fatias futuras a recomposição ao vivo do `memoryPrompt` (que também elimina a re-proposta do mesmo fato dentro de uma sessão) e a deduplicação/consolidação.

---

# Pontos em Aberto (a confirmar na aprovação `Draft → Ready`)

1. **Prioridade** — proposta **Medium** (valor de produto: fecha a última etapa do ciclo cognitivo e o item 1.2 do Roadmap; raio contido a `@atlas/cognitive` + adições aditivas em `@atlas/contracts`/`@atlas/memory` + mediação na CLI; sem urgência de segurança; espelha a prioridade da SPEC-0019). O humano confirma ou ajusta.
2. **Forma do traço de aprendizado na borda** — proposto `💡 lembrado: <fato>` (uma linha por fato), reusando o padrão de `renderSteps` (possivelmente via um helper `renderLearned`). Ponto cosmético; segue o exemplo do ADR-0016. O humano pode ajustar o texto/emoji na aprovação.
3. **Exibição da origem em `atlas memory list`** — proposto acrescentar um sufixo por linha (ex.: `origem: user|learned`), tratando fato sem `source` como `'user'`. Formato exato aberto a ajuste do humano; o critério mecânico é apenas que a origem apareça.

_Todos os três pontos são de forma/prioridade, não de arquitetura: as decisões estruturais estão fechadas no ADR-0016 (Cognitive propõe, borda grava, `learner` puro, `learned?`/`Fact.source?` aditivos, teto de 3, grava-e-avisa sem `confirm`, framing restrito ao Artigo 13). Nenhum deles cria módulo novo nem move responsabilidade entre módulos — passam pelo veto humano na transição `Draft → Ready`, não por decisão do `spec-drafter`._
