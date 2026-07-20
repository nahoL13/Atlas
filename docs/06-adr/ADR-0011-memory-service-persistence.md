# ADR-0011 — Memory Service: persistência por porta injetável e memória injetada na geração

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-13

> **Nota de atualização (2026-07-19, [SPEC-0020](../implementation/specs/SPEC-0020-learning-post-turn-extraction.md) / [ADR-0016](ADR-0016-learning-proposed-extraction.md)):** a Memory ganhou um **segundo caminho de gravação** — além do comando explícito do usuário (`atlas remember`), a borda (CLI) grava fatos **propostos pelo Cognitive** ao fim de cada turno (`atlas.memory.remember(texto, 'learned')`), com aviso ao usuário no momento da gravação. A autoridade de gravação **segue exclusiva da Memory** (a borda chama a mesma API pública; o Cognitive apenas devolve candidatos como dado — nenhuma porta de escrita entrou em `CognitiveCoreDeps`). `Fact` ganhou proveniência (`source?: 'user' | 'learned'`) e `remember` um parâmetro opcional de origem (default `'user'`). A alternativa "Aprendizado automático" rejeitada abaixo foi superada nos termos do ADR-0016 — a rejeição valia para a fatia da SPEC-0009, quando o ciclo cognitivo ainda era colapsado. A limitação "sessão aberta não reflete gravações" permanece (o `memoryPrompt` não é recomposto ao vivo).
>
> **Nota de atualização (2026-07-20, [SPEC-0021](../implementation/specs/SPEC-0021-live-memory-prompt-recomposition.md)):** a **forma** da injeção do `memoryPrompt` muda — deixa de ser uma **string estática** composta na criação do Atlas e passa a ser um **provider síncrono** (`() => string | undefined`), amostrado pelo Cognitive **uma vez por turno** (início de cada `ask`/`respond`) em vez de uma vez na criação da plataforma. `@atlas/core` fia `memoryPrompt: () => memory.prompt()`, delegando sempre à mesma API pública e síncrona (`MemoryService.prompt()`, inalterada). **A autoridade não muda**: a Memory continua a única a produzir o texto e a única a gravar; o Cognitive continua sem conhecer o conceito de Memory, apenas recebendo uma função de string em vez de uma string. A limitação "sessão aberta não reflete gravações" registrada na nota acima **fica resolvida**: um fato gravado durante uma sessão de `chat` passa a valer já no turno seguinte da mesma sessão, sem esperar a próxima invocação da CLI.
>
> **Nota de atualização (2026-07-20, [SPEC-0022](../implementation/specs/SPEC-0022-deterministic-fact-deduplication.md)):** o write-through de `remember` deixa de ser **incondicional** e passa a ser **condicional à ausência de duplicata determinística**. Um helper puro interno `normalize(text)` (`trim` → `toLowerCase` → colapso de `\s+`, sem IO, não exposto em `@atlas/contracts`) decide o critério de igualdade textual. Em duplicata (mesma normalização de um fato já carregado), `remember` faz um **no-op idempotente**: não cria `Fact`, não chama `storage.save`, não promove `source` — devolve o `Fact` existente. A **assinatura muda** (não-aditiva): `remember(text, source?)` passa de `Promise<Fact>` para `Promise<{ fact: Fact; created: boolean }>`, sinalizando criado × existente ao chamador (a CLI só anuncia `💡 lembrado:` quando `created` é `true`). A garantia é **determinística só para escritas novas** — o acervo legado (duplicatas já gravadas antes desta SPEC) permanece intacto; não há consolidação nem mutação no `load`. A autoridade exclusiva da Memory sobre o estado persistente (Artigo 11) não muda; a porta `MemoryStorage` e o load-once também não mudam — só a condição de escrita e a forma do retorno.
>
> **Nota de atualização (2026-07-20, [SPEC-0023](../implementation/specs/SPEC-0023-legacy-fact-consolidation-dedupe.md)):** a Memory ganha uma **operação de escrita explícita e opt-in** para consolidar o acervo já persistido — `dedupe(options?: { apply?: boolean })`, membro **aditivo** de `MemoryService` (`DedupeReport`/`DedupeGroup` como novos tipos exportados). Reusa o mesmo `normalize(text)` interno da SPEC-0022 para agrupar `facts`; em cada grupo com duplicata, sobrevive o de menor `createdAt` (comparação lexicográfica de string ISO-8601, coerente porque `createdAt` é sempre gerado via `toISOString()`), com empate desempatado pela ordem de carga. Dry-run é o **default** (`apply` ausente/`false`): só relata, sem mutar `facts` nem chamar `storage.save`. Só com `apply: true` a operação reconstrói `facts` (preservando ordem de carga, sobreviventes intactos) e persiste por **write-through** (`storage.save`, 1x) — o mesmo padrão de porta injetável e load-once já decidido acima. Sem duplicata, é no-op (nem em `apply: true` chama `save`). Não mescla campos, não promove/rebaixa `source`, não reescreve `text`. Fecha, para o acervo legado, a garantia que a SPEC-0022 deu só a escritas novas; a autoridade exclusiva da Memory sobre o estado persistente (Artigo 11) não muda — a CLI só invoca `dedupe` e renderiza o `DedupeReport`, nunca toca `storage` diretamente.

---

# Contexto

Até a [SPEC-0008](../implementation/specs/SPEC-0008-persona-service.md) a plataforma era **efêmera**: o Context Service ([ADR-0009](ADR-0009-context-service-value-store.md)) guarda a conversa apenas durante a sessão, em memória. A Constituição (invariante 6) dá à Memória autoridade exclusiva sobre estado persistente, e o [Module Catalog](../03-architecture/ModuleCatalog.md) cataloga o Memory Service (`packages/memory`) como a única autoridade de conhecimento permanente. A [SPEC-0009](../implementation/specs/SPEC-0009-memory-service.md) introduz a menor fatia disso — fatos/preferências explícitos — e levanta duas perguntas: (a) **como persistir** sem acoplar o módulo ao disco e sem tocar disco nos testes de unidade; (b) **como a memória chega à resposta** sem tornar o Cognitive Core stateful nem acoplá-lo ao conceito de Memory.

---

# Decisão

**Persistência atrás de uma porta injetável.** O `MemoryService` recebe uma porta `MemoryStorage` (`load()`/`save()`) por parâmetro. O default é `createFileMemoryStorage(path)` (arquivo JSON: `{ facts: [...] }`, criado sob demanda; ausência de arquivo → lista vazia; JSON inválido → `MemoryError`, falhando alto para não descartar memória do usuário). Os testes injetam um fake em memória — nenhum IO real. É o mesmo padrão de `fetch` (Model Gateway) e `LineReader` (CLI): o efeito colateral fica atrás de uma porta, e a composição (`@atlas/core`) escolhe o adapter. A porta **não sobe** a `@atlas/contracts` (fica no package dono); só `Fact`/`MemoryService` são contrato público.

**Load-once + write-through.** `createMemoryService` carrega os fatos uma vez na criação (leitura síncrona via `list()`/`prompt()`); `remember`/`forget` mutam o estado em memória e persistem imediatamente (`storage.save`).

**Memória injetada na geração (estende [ADR-0010](ADR-0010-persona-injected-generation.md)).** O `MemoryService.prompt()` produz uma string enquadrando os fatos (ou `undefined` se vazio). O `@atlas/core` injeta esse texto no Cognitive como `memoryPrompt`; o system prompt passa a compor **identidade (Persona) → memória → tarefa (Cognitive)**. O Cognitive **não conhece o conceito de Memory** — recebe apenas uma string, como já ocorre com a Persona. `respond` permanece função pura.

**Leitura no startup.** Os fatos são lidos e injetados na criação da plataforma; a gravação é por comandos one-shot da CLI (`remember`/`forget`) — uma sessão `chat` já aberta não reflete gravações feitas durante ela. Aceito para esta fatia.

---

# Consequências

Positivas:

- Primeiro conhecimento persistente do Atlas, com valor visível ponta a ponta (o Atlas lembra entre sessões).
- Módulo testável sem disco; disco real só no teste do file adapter e nos testes de comando da CLI (ambos em `tmpdir`).
- Cognitive segue desacoplado (recebe string), sem estado; Memória × Contexto seguem distintos.

Custos e riscos:

- Leitura no startup: gravações não afetam sessões de chat já abertas (documentado; troca ao vivo é SPEC futura).
- Fatos entram no system prompt de toda geração — cresce o prompt conforme a memória cresce. Mitigado pelo escopo mínimo (fatos curtos); retenção/seleção/busca são SPECs futuras.

---

# Alternativas Consideradas

**Arquivo JSON direto no serviço (sem porta).** Simples, mas acopla o módulo ao disco e exige IO real (ou mocks de `fs`) nos testes — destoa do padrão do repo. Rejeitada.

**SQLite.** Índice/busca desde já, mas dependência nativa e complexidade cedo demais para uma lista de fatos (YAGNI). Rejeitada.

**Aprendizado automático (o Cognitive grava fatos sozinho).** Acoplaria Memory ao ciclo cognitivo (ainda colapsado) e exigiria decidir o que/quando lembrar. Rejeitada nesta fatia; gravação é explícita.

**Injetar a porta de storage pela CLI.** Faria a CLI depender de `@atlas/memory`. Rejeitada — a CLI isola disco nos testes por `--memory-path` (`tmpdir`), permanecendo acoplada só a `@atlas/contracts` e `@atlas/core`.
