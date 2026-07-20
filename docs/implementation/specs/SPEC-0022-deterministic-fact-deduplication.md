# SPEC-0022 — Deduplicação determinística dos fatos aprendidos no Memory Service

> **Project Atlas — Implementation Specification**

Version: 1.0

---

# Informações Gerais

**ID**

SPEC-0022

---

**Título**

Tornar a Memória **incapaz de persistir dois fatos textualmente equivalentes**, de forma **determinística**, na autoridade exclusiva do estado persistente (Artigo 11). `MemoryService.remember` passa a normalizar o texto (`trim` → `toLowerCase` → colapso de espaços internos) e, em caso de duplicata de um fato já existente, **não cria fato novo, não chama `storage.save`**, devolvendo o `Fact` já existente — no-op idempotente, sem promover `source`. Vale para todo chamador (`'user'` e `'learned'`). A assinatura de `remember` muda (não-aditiva) para sinalizar **criado × existente**. Só protege escritas novas — o acervo legado permanece intacto (sem consolidação no load). Fecha a garantia real que a SPEC-0021 deixou aberta (lá a supressão de duplicatas era por instrução ao modelo, sem garantia determinística).

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

**Medium (proposta — o humano confirma na aprovação `Draft → Ready`)**: fecha uma garantia de produto já documentada como residual conhecido (Roadmap 1.3, l. 93) e endereça a duplicação que a SPEC-0021 só mitigou por instrução ao modelo (sem garantia determinística). Não é endurecimento de segurança urgente. O raio de mudança é contido a `@atlas/memory` (o grosso) mais uma mudança de contrato não-aditiva que atinge 3 call sites da CLI e fakes de teste. Espelha a faixa das SPECs 0020/0021 (mesmo item 1.2/1.3 do Roadmap). Ver "Decisões de design" (D7).

---

**Item do Roadmap**

`Fase 1 — 1.3 (Memory Service — Próximas Fatias) — Deduplicação determinística dos fatos aprendidos` (`docs/04-engineering/Roadmap.md`, l. 93).

**Rastreabilidade**: o Roadmap **nomeia textualmente** esta fatia em 1.3/l. 93: "Deduplicação **determinística** dos fatos aprendidos (a SPEC-0021 suprimiu a duplicação intra-sessão só por instrução ao modelo; a garantia real — comparar/normalizar/consolidar no storage — segue aqui)." É a proveniência primária e literal. O fecho de 1.2/l. 81 e a SPEC-0021 também citam "dedup/consolidação determinística" como residual documentado, candidato futuro — esta SPEC é essa fatia. Ela **não** cria módulo novo nem move responsabilidade entre módulos, e não altera o Roadmap por conta própria (o `spec-drafter` não edita o Roadmap; o doc-sync marca o candidato como entregue após `Done`).

---

# Objetivo

Ao concluir esta SPEC, a Memória do Atlas é **determinística e incapaz de persistir duas vezes o mesmo fato**: dado um texto textualmente equivalente a um fato já preservado (após normalização), `remember` **não** grava um segundo `Fact`.

Concretamente, quando esta SPEC estiver concluída:

- **Critério de duplicata determinístico.** Um helper puro interno `normalize(text)` aplica, nesta ordem, `trim` → `toLowerCase` → colapso de espaços internos (`\s+` → `" "`). Dois fatos são duplicata **se e somente se** forem iguais após essa normalização. A normalização é **pura e síncrona, sem IO** (ver D1).
- **No-op idempotente em duplicata.** `remember(text, source?)` calcula `normalize(text)` e procura um fato existente (em `facts`, o acervo carregado) cuja normalização coincida. Se encontrar: **não** cria `Fact`, **não** chama `storage.save`, **não** promove `source` (`learned`→`user`) e **não** rejeita com erro — devolve o `Fact` já existente, sinalizando que **não** foi criado. Se não encontrar: comportamento atual (cria `Fact`, `push`, `storage.save`), sinalizando que **foi** criado (ver D2).
- **Vale para todo chamador.** A supressão de duplicata independe da origem: tanto `source: 'user'` (`atlas remember`) quanto `source: 'learned'` (borda do Aprendizado, SPEC-0020) passam pelo mesmo caminho. A autoridade não persiste duplicata, venha de onde vier (ver D3).
- **Só protege escritas novas.** Duplicatas que já estejam no arquivo de memória (gravadas antes desta SPEC) **permanecem intactas** — não há consolidação, mutação nem re-gravação do estado persistente no `load`. Nenhum comando de limpeza (`atlas memory dedupe`) é criado (ver D4).
- **`remember` sinaliza criado × existente.** A assinatura muda (mudança **não-aditiva** no retorno): `MemoryService.remember(text, source?)` deixa de devolver `Promise<Fact>` e passa a devolver **`Promise<{ fact: Fact; created: boolean }>`** — `fact` é o `Fact` criado (novo) ou o já existente (duplicata); `created` é `true` sse um `Fact` novo foi persistido, `false` se foi no-op de duplicata (ver D5).
- **CLI reflete o sinal.** Os 3 call sites ajustam-se ao novo retorno:
  - `apps/cli/src/commands/ask.ts` e `chat.ts` iteram os `learned`, chamam `remember(fato, 'learned')` e só imprimem o traço `💡 lembrado: <fato>` (`renderLearned`) quando `created` for `true` — um fato já conhecido não gera ruído de "lembrado" a cada turno.
  - `apps/cli/src/commands/remember.ts` informa o resultado: gravado quando `created`, "já conhecido" quando não.
- **`prompt()` / `forget()` / `list()` intactos.** Só o caminho de escrita de `remember` muda; a leitura/produção do texto de memória e a remoção não mudam.

`@atlas/cognitive`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`, `createPlanner()`, `observe()` e o learner permanecem intactos (diff de código vazio, exceto onde a mudança de assinatura do contrato atinja fakes de `MemoryService` em testes).

---

# Motivação

A [SPEC-0021](SPEC-0021-live-memory-prompt-recomposition.md) fez o learner **ver os fatos já conhecidos** e o instruiu a não re-propor — mas registrou honestamente que a supressão da duplicação intra-sessão é **por instrução ao modelo, sem garantia determinística** (o [ADR-0016](../../06-adr/ADR-0016-learning-proposed-extraction.md) reconhece que modelos locais fracos podem não obedecer sempre). A garantia real — comparar/normalizar no estado persistente — foi explicitamente deixada como fatia futura, **nomeada** no Roadmap 1.3/l. 93.

Sem essa garantia, um fato estável ("meu nome é X") pode acabar gravado em duplicata quando o modelo desobedece à instrução, poluindo o `prompt()` (que cresce a cada geração) e a lista que o usuário consulta. O [PRD](../../02-product/ProductRequirementsDocument.md) sustenta a necessidade: a seção **Memória** — "O sistema deve armazenar preferências do usuário" e "O usuário deve poder consultar, atualizar e remover informações armazenadas" (l. 121, 125) — pressupõe uma memória limpa e não redundante; a seção **Aprendizado** — "Esse aprendizado deve ocorrer de maneira controlada e revisável" (l. 163) — é comprometida por um acervo que se duplica silenciosamente. Uma dedup **determinística** é o mecanismo controlado que falta.

O [Module Catalog](../../03-architecture/ModuleCatalog.md) mantém a Memory como **autoridade exclusiva** do estado persistente; é exatamente onde a garantia de "não persistir duplicata" pertence — não no Cognitive (que apenas propõe candidatos como dado) nem na borda. O [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) definiu o write-through **incondicional** de `remember`; esta fatia o torna **condicional à ausência de duplicata**, dentro do mesmo desenho (porta injetável, load-once), e muda a **forma do retorno** de `remember` para sinalizar criado × existente — daí o ADR-0011 ganhar **nota de atualização** (ver D6). A [Constituição](../../00-project/ArchitectureConstitution.md) é respeitada: Memory mantém autoridade exclusiva do estado persistente (Artigo 11), a normalização é a estratégia **mais simples** que dá a garantia (o "teste de simplicidade"), e nenhum módulo é criado ou tem responsabilidade movida (Artigo 15).

Documentos originadores: **SPEC-0021 / ADR-0016** (a duplicação suprimida só por instrução — a garantia real que falta) + **ADR-0011** (write-through de `remember`, cuja condicionalidade e retorno mudam; ganha nota de atualização) + **PRD** (Memória/Aprendizado) + **Module Catalog** (Memory autoridade exclusiva) + **Roadmap** (candidato nomeado em 1.3/l. 93).

---

# Referências

- [SPEC-0021](SPEC-0021-live-memory-prompt-recomposition.md) (`docs/implementation/specs/SPEC-0021-live-memory-prompt-recomposition.md`) — **origem da necessidade**: a supressão da duplicação intra-sessão por instrução ao modelo (sem garantia determinística); esta SPEC entrega a garantia real que aquela deixou aberta
- [SPEC-0020](SPEC-0020-learning-post-turn-extraction.md) (`docs/implementation/specs/SPEC-0020-learning-post-turn-extraction.md`) — extração pós-turno; a borda grava `learned` via `memory.remember(.., 'learned')`; o `renderLearned` cujo disparo passa a depender de `created`
- [SPEC-0009](SPEC-0009-memory-service.md) (`docs/implementation/specs/SPEC-0009-memory-service.md`) — o Memory Service, `remember`/`forget`/`list`/`prompt`, storage JSON por porta injetável, load-once + write-through: o desenho que esta SPEC evolui
- [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) (`docs/06-adr/ADR-0011-memory-service-persistence.md`) — Memory autoridade exclusiva do estado persistente; write-through de `remember`; **ganha nota de atualização** (a gravação passa a recusar duplicatas determinísticas; o retorno de `remember` muda para sinalizar criado × existente)
- [ADR-0016](../../06-adr/ADR-0016-learning-proposed-extraction.md) (`docs/06-adr/ADR-0016-learning-proposed-extraction.md`) — Aprendizado como extração proposta; reconhece que a supressão da re-proposta depende do modelo (não determinística) — o gap que esta fatia fecha no lado da autoridade persistente
- [Module Catalog](../../03-architecture/ModuleCatalog.md) (`docs/03-architecture/ModuleCatalog.md`) — Memory como única autoridade de conhecimento persistente
- [Roadmap](../../04-engineering/Roadmap.md) (`docs/04-engineering/Roadmap.md`) — item 1.3, l. 93 ("Deduplicação determinística dos fatos aprendidos"): a proveniência literal
- [PRD](../../02-product/ProductRequirementsDocument.md) (`docs/02-product/ProductRequirementsDocument.md`) — Memória (l. 117–125), Aprendizado (l. 159–163)
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) (`docs/00-project/ArchitectureConstitution.md`) — Artigo 11 (a memória tem autoridade exclusiva sobre o estado persistente), Artigo 15 (a IA não cria componentes nem move responsabilidades)

---

# Escopo

Muda código de produção em `packages/memory` (o grosso), `packages/contracts` (a assinatura de `remember`) e `apps/cli` (3 call sites). Estritamente as decisões fechadas no brainstorming — nem mais, nem menos.

- **`@atlas/memory` — normalização + no-op idempotente**:
  - Introduzir um helper **puro interno** `normalize(text: string): string` em `packages/memory/src/memory-service.ts` (ou arquivo irmão do package), aplicando `trim` → `toLowerCase` → colapso de espaços internos (`text.replace(/\s+/g, ' ')`). **Não** sobe a `@atlas/contracts` (sem 2º consumidor; regra do Project Structure). **Sem IO.**
  - Em `remember`, antes de criar o `Fact`: calcular `normalize(text)` e procurar em `facts` um fato existente com `normalize(existente.text) === normalize(text)`. Se encontrar → **no-op**: devolver `{ fact: existente, created: false }` sem `push` e sem `storage.save`, sem alterar `source`. Se não encontrar → caminho atual (cria `Fact`, `push`, `storage.save`) e devolver `{ fact: novo, created: true }`.
  - O `load` **não muda**: os fatos legados são carregados como estão, sem consolidação/mutação.
- **`@atlas/contracts` — assinatura de `remember`**:
  - Em `packages/contracts/src/memory.ts`, trocar `remember(text: string, source?: 'user' | 'learned'): Promise<Fact>` por **`remember(text: string, source?: 'user' | 'learned'): Promise<{ fact: Fact; created: boolean }>`**. `Fact` (`{ id, text, createdAt, source? }`) **inalterado**. `forget`/`list`/`prompt` **inalterados**.
- **`apps/cli` — 3 call sites ao novo retorno**:
  - `ask.ts` e `chat.ts`: `const { fact, created } = await atlas.memory.remember(fato, 'learned')`; só chamar `renderLearned(...)` quando `created` for `true`.
  - `remember.ts`: `const { fact, created } = await atlas.memory.remember(text)`; escrever a mensagem de gravação quando `created`, e uma mensagem de "já conhecido" quando não (ver D5 para o texto exato como decisão do implementer, mantendo o tom das mensagens atuais).
- **Testes**: `packages/memory/tests/*` (dedup determinística; no-op não chama `save`; não promove source; caso-insensível/espaços; legado intacto; `created` correto); e **todo fake de `MemoryService`** que a mudança de assinatura atinja — `apps/cli/tests/ask.test.ts`, `apps/cli/tests/chat.test.ts` (fakes que hoje devolvem `Fact` direto) e os testes de `@atlas/core` que consomem `remember`. **O grep correto é por `MemoryService` e por `.remember(` no repo inteiro** — membro de interface de contrato exige grep pelo nome do tipo, não só pelas construtoras (lição recorrente do projeto).
- **Documentação**: atualizar `packages/memory/CLAUDE.md`, `packages/contracts/CLAUDE.md`, `apps/cli/CLAUDE.md`, `CLAUDE.md` raiz (invariantes/estado); **nota de atualização no [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md)** (gravação passa a recusar duplicatas determinísticas; retorno de `remember` muda) — **não** criar ADR novo; `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`; marcar o candidato "Deduplicação determinística dos fatos aprendidos" (Roadmap 1.3/l. 93) como entregue por esta SPEC; registrar lições em `docs/implementation/LESSONS_LEARNED.md`.

_A divisão de quem toca qual documentação segue a "Definition of Done" — o `spec-implementer` toca só o arquivo da SPEC e a nota de atualização no ADR-0011; as docs vivas são o passo de fecho `doc-sync`._

---

# Fora do Escopo

Esta seção é obrigatória e reflete o que fica deliberadamente de fora — residuais conscientes.

- **Consolidação de duplicatas legadas / mutação no `load`.** Duplicatas já gravadas no arquivo de memória **permanecem** — nada é mesclado, mutado ou re-gravado ao carregar. Esta fatia só protege escritas novas. **Não** implementar.
- **Normalização além de espaço + caixa.** Pontuação, acentos, sinônimos e qualquer forma de equivalência semântica ficam de fora. A normalização é exatamente `trim` → `toLowerCase` → colapso de `\s+`. **Não** ampliar.
- **Comparação semântica / por-modelo de duplicata.** Seria não-determinística — o contraste explícito com a SPEC-0021, que já faz supressão por instrução ao modelo. **Não** implementar (esta fatia é justamente a alternativa determinística).
- **Comando `atlas memory dedupe`** (limpeza/consolidação sob demanda do acervo existente). Fatia futura. **Não** criar.
- **Promoção de `source` em match** (`learned`→`user` quando o usuário re-afirma um fato aprendido, ou vice-versa). Em duplicata, `source` do fato existente **não muda**. **Não** implementar.
- **Retenção / curadoria / classificação / busca / relações / memória episódica ou de projetos** (demais candidatos de 1.3). **Não** implementar.
- **Qualquer mudança em** `@atlas/cognitive` (learner, `runPlanCycle`, `observe`, `createPlanner`), `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context` — além do que a mudança de assinatura do contrato force em **fakes de teste**. **Não** tocar o código de produção desses packages.
- **Mudança em `Fact`.** `Fact` (`{ id, text, createdAt, source? }`) **não** muda — `created` é do retorno de `remember`, não uma propriedade persistente do fato. **Não** adicionar campo a `Fact`.

---

# Pré-requisitos

- [SPEC-0009](SPEC-0009-memory-service.md) (Memory Service; `remember`/`forget`/`list`/`prompt`; storage JSON por porta injetável; load-once + write-through) — **Done** (confirmar status real antes de `Ready`)
- [SPEC-0020](SPEC-0020-learning-post-turn-extraction.md) (extração pós-turno; a borda grava `learned` via `remember(.., 'learned')`; `renderLearned`) — **Done** (confirmar)
- [SPEC-0021](SPEC-0021-live-memory-prompt-recomposition.md) (supressão da duplicação intra-sessão por instrução ao modelo — a garantia que esta SPEC completa) — **Done** (confirmar)

> O `spec-drafter` **não** confirmou os status acima consultando cada arquivo; a confirmação mecânica do `Status: Done` de cada pré-requisito é parte da transição `Draft → Ready`.

---

# Critérios de Aceitação

Cada item é verificável mecanicamente pelo `spec-validator`.

- **Normalização determinística existe e é pura**: há um `normalize(text)` interno a `@atlas/memory` que aplica `trim` → `toLowerCase` → colapso de `\s+` para `" "`, sem IO. O tipo/função **não** aparece em `@atlas/contracts` (verificável no diff de `packages/contracts`).
- **Dedup por igualdade após normalização**: `remember('Meu Nome é Lohan')` seguido de `remember('  meu   nome é lohan  ')` resulta em **um** fato em `list()`; a 2ª chamada devolve `created: false` e o `fact` do 1º (mesmo `id`).
- **No-op não persiste**: na 2ª chamada (duplicata), `storage.save` **não** é invocado (verificável por contagem no storage fake); `list().length` não aumenta.
- **No-op não promove source**: `remember('x', 'learned')` e depois `remember('x', 'user')` mantêm o `source` do fato existente (`'learned'`); a 2ª chamada é no-op (`created: false`), não altera `source`.
- **No-op não rejeita**: a 2ª chamada (duplicata) **resolve** (não lança); devolve `{ fact, created: false }`.
- **Vale para todo chamador**: a dedup ocorre independentemente do `source` — `user` re-afirmando um fato `learned` (ou o inverso) é no-op.
- **Fato distinto ainda grava**: `remember('meu nome é Lohan')` e `remember('prefiro TypeScript')` resultam em **dois** fatos, ambos com `created: true`.
- **Acervo legado intacto**: um storage carregado com duas entradas textualmente equivalentes já presentes preserva **ambas** após o `load` (nenhuma consolidação); nenhum `storage.save` é disparado pelo `load`.
- **Assinatura muda no contrato**: `packages/contracts/src/memory.ts` declara `remember(...): Promise<{ fact: Fact; created: boolean }>`; não existe mais `Promise<Fact>` em `remember`. `Fact`/`forget`/`list`/`prompt` inalterados.
- **CLI só anuncia quando cria**: em `ask.ts`/`chat.ts`, `renderLearned` é chamado **somente** quando `created` for `true` (verificável por teste da CLI: um `learned` duplicado de um fato já conhecido **não** imprime `💡 lembrado:`).
- **`atlas remember` informa "já conhecido"**: `remember.ts` escreve a mensagem de gravação quando `created`, e uma mensagem distinta de "já conhecido" quando `created` for `false` (verificável por conteúdo da saída).
- **`prompt`/`forget`/`list` intactos**: nenhuma mudança de comportamento nesses três (assertivas existentes seguem verdes).
- **Todos os fakes de `MemoryService` migrados**: `git grep 'MemoryService'` e `git grep '\.remember('` no repo não deixam nenhum fake devolvendo `Fact` direto onde o novo retorno é esperado. Nota (achado F1 do architecture-reviewer): os fakes da CLI usam cast `as unknown as AtlasPlatform`/`stubAtlas`, que **anula a checagem de tipo** do retorno de `remember` — quem força a migração desses fakes é **`pnpm test`** (sem `created`, `renderLearned` nunca dispara e a asserção falha), não o `typecheck`; só `remember.ts` quebra typecheck de fato. Verificação: `pnpm test` **e** `pnpm typecheck` verdes em todo o workspace.
- **Componentes intactos**: nenhum diff de código de produção em `packages/cognitive`, `packages/runtime`, `packages/permissions`, `packages/tools`, `packages/model-gateway`, `packages/persona`, `packages/context`; `createPlanner()`/`observe()`/learner preservados.
- **Documentação**: `packages/memory/CLAUDE.md` + `packages/contracts/CLAUDE.md` + `apps/cli/CLAUDE.md` + `CLAUDE.md` raiz atualizados; **nota de atualização no ADR-0011**; `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` atualizados; o candidato de dedup determinística em 1.3/l. 93 do `Roadmap.md` marcado como **parcialmente entregue** por esta SPEC (achado F2 do architecture-reviewer: entrega comparar/normalizar em escritas novas; a **consolidação do acervo legado no storage** permanece candidato futuro — `atlas memory dedupe`); lições em `LESSONS_LEARNED.md`.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.

---

# Arquivos Esperados

```text
packages/memory/src/
  memory-service.ts      (editado: normalize(text) puro interno; remember faz no-op idempotente
                          em duplicata — sem push/save, sem promover source; retorna { fact, created })

packages/memory/tests/
  memory-service.test.ts (editado: dedup por normalização; no-op não chama save; não promove source;
                          caso-insensível/espaços; legado intacto; created correto; testes existentes
                          de remember migram para o novo retorno { fact, created })

packages/contracts/src/
  memory.ts              (editado: remember(...) → Promise<{ fact: Fact; created: boolean }>)

apps/cli/src/commands/
  ask.ts                 (editado: destrutura { created }; renderLearned só quando created)
  chat.ts                (editado: idem, por turno)
  remember.ts            (editado: mensagem "gravado" vs. "já conhecido" conforme created)

apps/cli/tests/
  ask.test.ts            (editado: fake de memory.remember devolve { fact, created }; caso duplicado não imprime)
  chat.test.ts           (editado: idem)

packages/core/tests/
  create-atlas.test.ts   (editado se as asserções sobre remember dependerem do retorno)

CLAUDE.md (raiz)                                          (editado: invariantes/estado)
packages/memory/CLAUDE.md, packages/contracts/CLAUDE.md, apps/cli/CLAUDE.md  (editados)
docs/06-adr/ADR-0011-memory-service-persistence.md       (editado: nota de atualização)
docs/04-engineering/Roadmap.md                           (editado: candidato de 1.3/l.93 marcado entregue)
docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md  (editados)
docs/implementation/LESSONS_LEARNED.md                   (editado)
```

Lista é expectativa; o grep por `MemoryService`/`.remember(` no repo inteiro pode revelar fakes adicionais a migrar.

---

# Componentes Impactados

- Memory Service (`@atlas/memory`) — `normalize` puro interno; `remember` vira no-op idempotente em duplicata; retorno `{ fact, created }`. **Grosso** da mudança.
- Contracts (`@atlas/contracts`) — assinatura de `MemoryService.remember` (mudança não-aditiva no retorno). `Fact` inalterado.
- CLI (`apps/cli`) — 3 call sites (`ask`/`chat`/`remember`) ajustados ao novo retorno; `renderLearned` condicionado a `created`.
- Core (`@atlas/core`) — **sem mudança de produção**; testes que consomem `remember` podem migrar ao novo retorno.
- Cognitive, Runtime, Permission Service, Tools, Model Gateway, Persona, Context — **inalterados** (só fakes de teste, se atingidos pela assinatura).

---

# Interfaces Necessárias

- **`MemoryService.remember(text, source?): Promise<{ fact: Fact; created: boolean }>`** (`@atlas/contracts`): substitui `Promise<Fact>`; sinaliza criado × existente.
- **`normalize(text: string): string`** (`@atlas/memory`, **interno**): helper puro de normalização determinística; **não** sobe a `@atlas/contracts`.
- `Fact`, `MemoryService.forget`/`list`/`prompt` — **inalterados**.
- **Nenhuma** outra interface nova ou alterada.

---

# Fluxo Esperado

```text
remember(text, source?):
  key = normalize(text)                          [trim → toLowerCase → \s+ → " "; puro, sem IO]
  existente = facts.find(f => normalize(f.text) === key)
  há existente?  → { fact: existente, created: false }   [no-op: sem push, sem save, sem promover source]
  não há?        → cria Fact; push; storage.save; { fact: novo, created: true }

CLI (ask/chat, por turno):
  para cada fato em learned:
    { created } = remember(fato, 'learned')
    created?  → renderLearned(fato)              [💡 lembrado: <fato>]
    !created  → silêncio (já conhecido)

CLI (atlas remember <text>):
  { fact, created } = remember(text)
  created?  → "Lembrado [id]: text"
  !created  → "Já conhecido [id]: text"          [texto exato: decisão do implementer, D5]

load: acervo carregado como está — duplicatas legadas preservadas, sem consolidação.
```

---

# Estratégia de Implementação

Sugestão de ordem (TDD, com fakes — storage fake em memória que conta chamadas de `save`; **sem IO real**):

1. **Contrato**: mudar `remember` para `Promise<{ fact: Fact; created: boolean }>` em `packages/contracts/src/memory.ts`. Rodar `git grep 'MemoryService'` e `git grep '\.remember('` no repo **antes** de assumir inocuidade — mapear todos os consumidores e fakes. `pnpm typecheck` fica RED até os call sites/fakes migrarem (esperado).
2. **`normalize`**: helper puro interno + testes diretos (caixa, espaços de borda, espaços internos colapsados).
3. **`remember` no-op**: buscar duplicata por normalização; no-op sem `push`/`save`/promover source; retornar `{ fact, created }`. Testes: dedup; save não chamado; source não promovido; fato distinto ainda grava; legado intacto.
4. **Call sites da CLI**: `ask.ts`/`chat.ts` (renderLearned só quando `created`); `remember.ts` (mensagem gravado × já conhecido). Migrar fakes de `apps/cli/tests/*` e de `@atlas/core`.
5. **Verificação**: `lint`/`format:check`/`typecheck`/`test` (por caminho a partir da raiz).
6. **Documentação**: `CLAUDE.md` (raiz + memory + contracts + cli); nota no ADR-0011; `Roadmap.md` (candidato de 1.3); `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

Todos com fakes (storage fake em memória que **conta chamadas de `save`**; sem IO real).

- **(unit) `normalize`**: `'  Meu   Nome  '` → `'meu nome'`; idempotência; só espaço + caixa (acento/pontuação **não** normalizados — assertar que `'sao'` ≠ `'são'`).
- **(memory) dedup determinística**: `remember` de dois textos equivalentes após normalização → `list().length === 1`; 2ª devolve `{ created: false, fact }` com o `id` do 1º.
- **(memory) no-op não persiste**: `save` invocado **1x** (só na 1ª); não na duplicata.
- **(memory) não promove source**: `remember('x','learned')` + `remember('x','user')` → fato mantém `source: 'learned'`, 2ª é no-op.
- **(memory) não rejeita**: duplicata resolve, não lança.
- **(memory) fato distinto grava**: dois textos não-equivalentes → `list().length === 2`, ambos `created: true`.
- **(memory) legado intacto**: storage carregado com duas entradas equivalentes → ambas preservadas após `load`; `save` **não** chamado no `load`.
- **(cli) ask/chat**: `learned` com fato novo → imprime `💡 lembrado:`; `learned` que retorna `created: false` → **não** imprime.
- **(cli) remember**: `created` → mensagem de gravação; `!created` → mensagem "já conhecido".
- **(migração) fakes**: os fakes de `MemoryService` em `apps/cli/tests/*` e `@atlas/core` devolvem `{ fact, created }` e seguem verdes.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada: `packages/memory/CLAUDE.md` + `packages/contracts/CLAUDE.md` + `apps/cli/CLAUDE.md` + `CLAUDE.md` raiz; **nota de atualização no ADR-0011**; `docs/04-engineering/Roadmap.md` (candidato de dedup determinística em 1.3/l. 93 marcado entregue); `docs/05-context/NEXT_CONTEXT.md`; `docs/05-context/CURRENT_SPRINT.md`;
- arquitetura preservada: Memory **mantém autoridade exclusiva** do estado persistente (Artigo 11) e agora é **incapaz de persistir duplicata determinística**; nenhum módulo novo nem responsabilidade movida (Artigo 15); Cognitive/Runtime/Permissões/Tools/Gateway/Persona/Context intactos;
- residuais documentados como tais (consolidação de legado / mutação no load, normalização além de espaço+caixa, comparação semântica, `atlas memory dedupe`, promoção de `source` em match, demais fatias de 1.3) — e a garantia descrita honestamente como **determinística para escritas novas**, **não** retroativa ao acervo legado;
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz + dos packages tocados, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) **não é escopo do `spec-implementer`** — é o passo de fecho `doc-sync` no fio principal, após a validação. O implementador toca só a documentação específica da própria SPEC (o arquivo da SPEC e a nota de atualização no ADR-0011 que a SPEC prevê).

---

# Restrições

- **Não** criar package/módulo novo nem mover responsabilidade entre módulos (Artigo 15). A dedup vive na Memory, autoridade exclusiva do estado persistente.
- **Não** criar ADR novo; a única mexida em ADR é a **nota de atualização** no ADR-0011.
- **Não** normalizar além de `trim` + `toLowerCase` + colapso de `\s+` (sem acento/pontuação/semântica).
- **Não** consolidar/mutar/re-gravar o acervo legado no `load`; a garantia é só para escritas novas.
- **Não** promover `source` em match; a duplicata é no-op puro.
- **Não** rejeitar duplicata com erro; re-proposta do mesmo fato é esperada, não é condição de erro.
- **Não** adicionar campo a `Fact` (`created` é do retorno de `remember`).
- **Não** tornar `normalize` público em `@atlas/contracts` (interno ao package; sem 2º consumidor).
- **Não** alterar `prompt()`/`forget()`/`list()`.
- **Não** alterar código de produção de `@atlas/cognitive`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context` — só fakes de teste que a assinatura force.
- Testes **sem** IO real (storage fake em memória). Rodar por caminho a partir da raiz.

---

# Observações

- **Por que a assinatura muda (e não um `Fact` com flag)**: o consumidor precisa saber se um fato **novo** foi gravado (para anunciar `💡 lembrado:` só nesse caso). Sinalizar isso dentro de `Fact` sujaria o modelo persistente com um campo transitório de resultado de operação. `{ fact, created }` separa o dado persistido (fact) do resultado da operação (created), e é a forma **mais transparente** (o "teste de simplicidade"). Ver D5.
- **Por que a mudança é não-aditiva** (diferente da proveniência aditiva da SPEC-0020): o **tipo de retorno** muda de `Fact` para um objeto envelope — todo call site que consome o retorno precisa destruturar. Por isso o grep tem de ser por `MemoryService`/`.remember(` no repo inteiro, não só pelas construtoras: membro de interface de contrato exige rastrear pelo nome do tipo (lição recorrente do projeto).
- **Por que legado intacto**: consolidar o acervo no `load` seria mutar estado persistente do usuário sem pedido explícito — risco de descartar/mesclar algo que o usuário quisesse manter distinto. A garantia determinística cobre o que a Memory grava **daqui pra frente**; limpar o passado é uma fatia separada e explícita (`atlas memory dedupe`, futura). Ver D4.
- **Relação com a SPEC-0021**: a SPEC-0021 dá ao learner **visibilidade** dos fatos e o instrui a não re-propor (mitigação por instrução, não-determinística); esta SPEC fecha o buraco no lado da **autoridade**: mesmo que o modelo desobedeça e re-proponha, a Memory não grava a duplicata. As duas se complementam — uma reduz a re-proposta, a outra garante a não-persistência.
- **Normalização só espaço + caixa**: é o suficiente para pegar o caso dominante ("Meu nome é X" vs. "meu nome é  x") sem entrar no terreno ambíguo de acentos/pontuação (onde "não" e "nao" podem ou não ser o mesmo fato) — que exigiria decisão de produto própria. Mantém a fatia mínima e determinística. Ver D1.

---

# Checklist para IA

Antes de implementar:

- ler a **SPEC-0021 / ADR-0016** (a supressão por instrução, não-determinística — o gap que esta fecha), a **SPEC-0009** (o desenho do Memory Service: `remember`/storage/load-once), o **ADR-0011** (autoridade exclusiva; write-through; ganha nota), o Artigo 11 e o Roadmap 1.3/l. 93;
- compreender o objetivo (normalização determinística; no-op idempotente em duplicata; vale para todo chamador; legado intacto; retorno `{ fact, created }`);
- confirmar mecanicamente que os pré-requisitos (SPEC-0009/0020/0021) estão `Done`;
- `git grep 'MemoryService'` **e** `git grep '\.remember('` no repo antes de editar — mapear todos os call sites e fakes.

Durante a implementação:

- TDD com storage fake que conta `save` (sem IO); `normalize` puro;
- no-op **não** persiste, **não** promove source, **não** rejeita;
- legado **não** é consolidado no `load`;
- `Fact` intacto; `normalize` interno (não sobe a contrato); `prompt`/`forget`/`list` intactos;
- não vazar escopo (nada de consolidação de legado, `dedupe`, normalização semântica, promoção de source, outras fatias de 1.3).

Após a implementação:

- rodar `lint`/`format:check`/`typecheck`/`test` (por caminho a partir da raiz);
- atualizar documentação (`CLAUDE.md` raiz + memory + contracts + cli; nota no ADR-0011; `Roadmap.md` candidato de 1.3; contexto);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, a Memória do Atlas é **determinística e incapaz de persistir dois fatos textualmente equivalentes**: `remember` normaliza o texto (`trim` → `toLowerCase` → colapso de espaços) e, ao reconhecer um fato já preservado, faz um **no-op idempotente** — não grava, não toca o storage, não promove `source`, devolve o fato existente sinalizando `created: false`. Isso vale para todo chamador (`atlas remember` e o Aprendizado da borda), fechando a garantia real que a SPEC-0021 deixou aberta (lá a supressão era por instrução ao modelo, sem garantia). A assinatura de `MemoryService.remember` muda para `Promise<{ fact, created }>`, e os 3 call sites da CLI passam a anunciar `💡 lembrado:` só quando um fato novo é criado, com `atlas remember` informando quando o fato já era conhecido. O acervo legado permanece intacto (sem consolidação no load); consolidação de duplicatas antigas, `atlas memory dedupe`, normalização além de espaço+caixa, promoção de `source` em match e as demais fatias do item 1.3 seguem como candidatos futuros. A Memory mantém autoridade exclusiva do estado persistente (Artigo 11); nenhum módulo novo nem responsabilidade movida; o grosso da mudança vive em `@atlas/memory`, com uma mudança de contrato não-aditiva em `@atlas/contracts` e ajuste dos call sites em `apps/cli`.

---

# Decisões de design (formato de veto)

Decisões tomadas pelo `spec-drafter` (Emenda v1.1, Artigo 15). As de estratégia técnica foram fechadas no brainstorming com o humano; as de forma/prioridade são decisão do drafter, registradas aqui para o `architecture-reviewer` atacar.

**D1 — Critério de duplicata = normalização determinística (`trim` → `toLowerCase` → colapso de `\s+`).**
- **Decisão**: dois fatos são duplicata se e somente se forem iguais após `text.trim().toLowerCase().replace(/\s+/g, ' ')`. Helper puro interno `normalize`, sem IO. Pontuação, acentos e semântica ficam fora.
- **Porquê**: é a estratégia **determinística mais simples** que pega o caso dominante (variação de caixa/espaço do mesmo fato), coerente com o "teste de simplicidade" da Constituição e com a autoridade determinística do Artigo 11 — contraste explícito com a supressão não-determinística por modelo da SPEC-0021.
- **Alternativa descartada**: comparação semântica / por-modelo — perdeu por ser não-determinística (é justamente o que esta fatia substitui); normalização de acentos/pontuação — perdeu por abrir decisão de produto ambígua ("não" vs "nao"), fora da fatia mínima.

**D2 — Comportamento em duplicata = no-op idempotente (sem save, devolve o existente, sem promover source, sem erro).**
- **Decisão**: em match, `remember` não cria `Fact`, não chama `storage.save`, não altera `source`, não lança — devolve o `Fact` existente.
- **Porquê**: re-propor o mesmo fato é esperado (o learner re-sugere a cada turno), logo não é condição de erro; não tocar o storage mantém o write minimalista e idempotente; não promover `source` preserva a proveniência original (SPEC-0020).
- **Alternativa descartada**: rejeitar com `MemoryError` — perdeu porque transformaria um caso normal em falha, quebrando a borda do Aprendizado que grava em laço.

**D3 — Dedup vale para todo chamador (`user` e `learned`).**
- **Decisão**: a supressão independe da origem; ambos passam pelo mesmo caminho de `remember`.
- **Porquê**: a autoridade exclusiva do estado persistente (Artigo 11) não deve persistir duplicata venha de onde vier; um único caminho é mais simples e mais transparente que ramificar por `source`.
- **Alternativa descartada**: deduplicar só `learned` (deixar o usuário duplicar via `atlas remember`) — perdeu por criar duas semânticas de escrita e poluir mesmo assim o acervo consultável.

**D4 — Só protege escritas novas; acervo legado intacto (sem consolidação no load).**
- **Decisão**: o `load` carrega os fatos como estão; duplicatas legadas permanecem; nenhum comando de limpeza é criado.
- **Porquê**: consolidar no load mutaria estado persistente do usuário sem pedido explícito — risco de descartar algo que ele quisesse manter; a garantia determinística cobre o futuro, a limpeza do passado é fatia própria e explícita.
- **Alternativa descartada**: consolidar duplicatas no load — perdeu por mutar silenciosamente memória do usuário, violando o espírito "controlado e revisável" do PRD (Aprendizado).

**D5 — Retorno de `remember` = `Promise<{ fact: Fact; created: boolean }>` (forma escolhida pelo drafter).**
- **Decisão**: envelope `{ fact, created }` — `fact` é o criado ou o existente; `created` distingue os dois. `Fact` não ganha campo. Mensagem de `atlas remember` em no-op: informar "já conhecido" (texto exato a critério do implementer, mantendo o tom atual).
- **Porquê**: o consumidor precisa saber se anuncia `💡 lembrado:`; separar o dado persistido (fact) do resultado da operação (created) é mais transparente e mantém `Fact` limpo de estado transitório — o brainstorming delegou a forma exata ao drafter/implementer.
- **Alternativa descartada**: `Fact & { created }` (flag dentro do fato) — perdeu por sujar o modelo persistente com um campo de resultado de operação; devolver só `Fact` e reconsultar `list()` para inferir criação — perdeu por ser frágil e não-atômico.

**D6 — ADR-0011 ganha nota de atualização; sem ADR novo.**
- **Decisão**: registrar a mudança (write-through passa a recusar duplicatas determinísticas; retorno de `remember` muda) como **nota de atualização no ADR-0011** — não é decisão arquitetural inédita.
- **Porquê**: a decisão estrutural (Memory autoridade exclusiva, persistência por porta injetável, write-through) já vive no ADR-0011; esta fatia só torna o write **condicional** e ajusta a forma do retorno, dentro do desenho existente — não cria fronteira nova (não é escalação por ADR novo, Emenda v1.1).
- **Alternativa descartada**: ADR novo dedicado à dedup — perdeu porque não há decisão arquitetural inédita; seria cerimônia sem fronteira nova a documentar.

**D7 — Prioridade Medium.**
- **Decisão**: propor `Medium` (o humano confirma na aprovação `Draft → Ready`).
- **Porquê**: fecha uma garantia de produto já documentada como candidato (Roadmap 1.3/l. 93) e completa o que a SPEC-0021 deixou aberto, na mesma faixa das SPECs 0020/0021; não é endurecimento de segurança urgente nem bloqueia outra fatia.
- **Alternativa descartada**: `High` — perdeu porque não há urgência (a duplicação é ruído mitigado, não falha de segurança); `Low` — perdeu porque é uma garantia de correção da autoridade persistente, com base literal no Roadmap, acima de trabalho puramente oportunista.

---

# Histórico de Revisão

- **Rev. 1 (Draft inicial)** — `spec-drafter`. Decisões de design D1–D7 fechadas no formato de veto (normalização determinística `trim`/`toLowerCase`/colapso de `\s+`; no-op idempotente em duplicata sem save/promoção de source/erro; vale para todo chamador; acervo legado intacto sem consolidação no load; retorno `{ fact, created }`; nota de atualização no ADR-0011 sem ADR novo; prioridade Medium proposta). Aguarda o gate do `architecture-reviewer` para `Draft → Ready`.
- **Rev. 2 (Implementação)** — `spec-implementer`. `normalize(text)` puro interno a `packages/memory/src/memory-service.ts`; `remember` faz no-op idempotente em duplicata (sem `push`/`save`/promoção de `source`), retornando `{ fact, created }`; `load` inalterado (legado intacto). Contrato: `packages/contracts/src/memory.ts` migrado. CLI: `ask.ts`/`chat.ts` só chamam `renderLearned` quando `created`; `remember.ts` distingue "Lembrado" × "Já conhecido". Fakes migrados em `apps/cli/tests/{ask,chat,status}.test.ts` (o de `status.test.ts` não estava mapeado no grep original — só o typecheck direto, sem `as unknown as`, o expôs). Nota de atualização adicionada ao ADR-0011. `pnpm lint && format:check && typecheck && test` verdes (358 testes, de 350 antes: 8 novos — 6 de dedup em `memory-service.test.ts`, 1 em `ask.test.ts`, 1 em `chat.test.ts`). Status → `Review`.
- **Rev. 3 (correção pós-`spec-validator`)** — `spec-implementer`. O `spec-validator` reprovou por lacuna de cobertura: o ramo `created: false`/"Já conhecido" de `apps/cli/src/commands/remember.ts` (`atlas remember`) não era exercitado por nenhum teste E2E — só o `created: true` (`run.test.ts`, teste original). Adicionado `apps/cli/tests/run.test.ts` — 'remember de um fato duplicado (SPEC-0022) informa "Já conhecido" e não grava de novo': grava um fato, repete com variação de caixa/espaço, assere a mensagem "Já conhecido" na saída e que `atlas memory list` continua com uma única ocorrência. `pnpm lint && format:check && typecheck && test` verdes (359 testes). Status mantido em `Review`.
