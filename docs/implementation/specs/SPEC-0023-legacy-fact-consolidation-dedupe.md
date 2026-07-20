# SPEC-0023 — Consolidação determinística do acervo legado de fatos (`atlas memory dedupe`)

> **Project Atlas — Implementation Specification**

Version: 1.0

---

# Informações Gerais

**ID**

SPEC-0023

---

**Título**

Dar à Memória uma operação **explícita e determinística** para **consolidar o acervo já persistido**: o comando `atlas memory dedupe` (novo subcomando de `memory`) reúne os fatos legados que colidem sob a mesma normalização (`trim` → `toLowerCase` → colapso de `\s+`, o mesmo critério da SPEC-0022) e, sob confirmação explícita (`--apply`), remove as duplicatas mantendo **um único sobrevivente por grupo** (o mais antigo por `createdAt`, com `id`/`text`/`source` preservados). Por default é **dry-run** (só relata o que seria consolidado, sem tocar o storage). A consolidação é a **autoridade da Memory** (Artigo 11): um método aditivo `MemoryService.dedupe(options?)` — a CLI só invoca e renderiza, não reimplementa normalização nem toca o storage. Fecha o residual explícito que a SPEC-0022 deixou aberto (lá a garantia determinística cobria só **escritas novas**; o acervo legado permanecia intacto). Não muda `remember`/`forget`/`list`/`prompt`, não normaliza texto armazenado, não mescla campos e não promove `source`.

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
- [ ] Medium
- [x] Low (proposta)

**Low (proposta — o humano confirma na aprovação `Draft → Ready`)**: é uma utilidade de **limpeza sob demanda** do acervo legado, opt-in e explícita (`--apply`). A garantia de correção que importa — não persistir novas duplicatas — **já foi entregue** pela SPEC-0022; as duplicatas legadas são resíduo estático que não cresce e não afeta a correção do sistema (só o ruído no `prompt()`/`list`). Não é endurecimento de segurança nem bloqueia outra fatia. Fica abaixo da faixa Medium da SPEC-0022 (que era garantia de autoridade). Ver "Decisões de design" (D8).

---

**Item do Roadmap**

`Fase 1 — 1.3 (Memory Service — Próximas Fatias) — Deduplicação determinística dos fatos aprendidos` (`docs/04-engineering/Roadmap.md`, l. 93).

**Rastreabilidade**: o item 1.3/l. 93 do Roadmap, após a SPEC-0022, ficou marcado como **parcialmente entregue** e nomeia **textualmente** o residual que esta SPEC endereça: "Permanece candidato: a **consolidação do acervo legado no storage** (comando `atlas memory dedupe`, mutação/merge de duplicatas já gravadas antes desta SPEC) — nada disso foi implementado." Esta SPEC é exatamente essa fatia. Ela **não** cria módulo novo nem move responsabilidade entre módulos, e não edita o Roadmap por conta própria (o `spec-drafter` não edita o Roadmap; o passo `doc-sync` marca o candidato como entregue após `Done`).

---

# Objetivo

Ao concluir esta SPEC, a Memória do Atlas oferece uma operação **explícita, determinística e revisável** para **consolidar duplicatas já persistidas** no acervo — as que entraram antes da SPEC-0022, ou que só diferem por normalização — sem que nenhuma consolidação aconteça silenciosamente ou sem confirmação do usuário.

Concretamente, quando esta SPEC estiver concluída:

- **Consolidação como autoridade da Memory.** `@atlas/memory` ganha um método aditivo `dedupe(options?: { apply?: boolean }): Promise<DedupeReport>` no contrato `MemoryService`. Ele **reusa o `normalize(text)` interno da SPEC-0022** (`trim` → `toLowerCase` → colapso de `\s+`, puro, sem IO, não exposto em `@atlas/contracts`) para agrupar os fatos carregados por chave de normalização. A CLI **não** reimplementa normalização nem toca o storage — só invoca `dedupe` e renderiza o relatório (ver D6).
- **Dry-run por default; mutação só com `--apply`.** `dedupe()` / `dedupe({ apply: false })` **computa e relata** os grupos com duplicata **sem** mutar `facts` nem chamar `storage.save`. `dedupe({ apply: true })` remove as duplicatas em memória e **persiste** por write-through (`storage.save`). A CLI expõe isso como `atlas memory dedupe` (dry-run) e `atlas memory dedupe --apply` (aplica) — ver D1, D2.
- **Sobrevivente determinístico por grupo.** Em cada grupo de fatos com a mesma normalização, **sobrevive o mais antigo por `createdAt`** (comparação lexicográfica das strings ISO-8601 = ordem cronológica); empate de `createdAt` desempata pela **ordem de carga** (índice em `facts`). O sobrevivente é preservado **intacto** — `id`, `text` (casing original), `createdAt` e `source` não mudam. As demais entradas do grupo são removidas (ver D3).
- **Sem merge, sem promoção de `source`, sem reescrita de texto.** A consolidação **não** mescla campos, **não** promove/rebaixa `source` (um `user` e um `learned` que colidem: sobrevive o mais antigo, com o `source` que ele já tinha), e **não** reescreve o `text` armazenado para a forma normalizada. É remoção pura das duplicatas, preservando o sobrevivente (ver D3, D4).
- **No-op em acervo sem duplicatas.** Se nenhum grupo tem duas entradas equivalentes, `dedupe` devolve um relatório de grupos vazio e **não** chama `storage.save` (nem em `--apply`); a CLI informa "nenhuma duplicata encontrada" (ver D5).
- **Relatório revisável.** `DedupeReport` (`{ applied: boolean; groups: readonly DedupeGroup[] }`, com `DedupeGroup = { survivor: Fact; duplicates: readonly Fact[] }`) descreve exatamente quais fatos foram/seriam removidos e quais sobreviveram, para o usuário revisar antes de aplicar (Artigo: "controlado e revisável", PRD Aprendizado l. 163).
- **`remember`/`forget`/`list`/`prompt` intactos.** Só a nova operação `dedupe` entra; os quatro membros existentes de `MemoryService` (incluindo o retorno `{ fact, created }` da SPEC-0022) não mudam.

`@atlas/cognitive`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context` permanecem intactos (diff de código de produção vazio, exceto onde a adição do método ao contrato atinja **fakes de `MemoryService`** em testes).

---

# Motivação

A [SPEC-0022](SPEC-0022-deterministic-fact-deduplication.md) tornou a Memória **incapaz de persistir novas duplicatas** — mas registrou explicitamente (D4, Fora do Escopo, e o achado F2 do `architecture-reviewer`) que a garantia cobre **só escritas novas**: o acervo já gravado antes dela permanece intacto, "sem consolidação, mutação nem re-gravação no `load`", e a **consolidação do acervo legado** foi deixada como fatia futura, nomeada `atlas memory dedupe`. O Roadmap 1.3/l. 93 carrega esse residual textualmente após a SPEC-0022.

Sem essa fatia, um usuário que já tinha duplicatas gravadas (por exemplo, "meu nome é X" e "Meu nome é  X" registradas antes da SPEC-0022, ou via desobediência do modelo antes dela) fica com ruído permanente no `prompt()` (que entra no system prompt de toda geração — ADR-0011) e na lista que consulta (`atlas memory list`). O [PRD](../../02-product/ProductRequirementsDocument.md) sustenta a necessidade: **Memória** — "O usuário deve poder consultar, atualizar e **remover** informações armazenadas" (l. 125) é justamente uma operação de remoção controlada de informação redundante; **Aprendizado** — "de maneira controlada e revisável" (l. 163) é o que o **dry-run por default + `--apply` explícito** garantem (nada é mutado sem revisão e confirmação).

A consolidação pertence à **Memory**, "única autoridade para armazenamento e recuperação de memória permanente" ([Module Catalog](../../03-architecture/ModuleCatalog.md), que lista "mecanismos de revisão e exclusão" entre o que a Memory pode utilizar). A CLI não pode reimplementá-la: o `normalize` é interno a `@atlas/memory` e a `apps/cli` só depende de `@atlas/contracts`/`@atlas/core` — logo a operação é adicionada ao contrato `MemoryService` como método aditivo. (Correção do gate — F1: `MemoryService` **já é** contrato público consumido por CLI e core; adicionar um método a ele **não** é "promoção de tipo local" no sentido do ADR-0007/Project Structure. O que exige pôr a operação no contrato — e não na borda — é o Artigo 11 + Artigo 5: sem acesso ao `normalize` interno nem ao `storage`, a CLI reimplementaria o critério de duplicata, arriscando drift, e a lógica de consolidação/escrita migraria para a borda, violando a autoridade exclusiva da Memory.) O [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) já definiu a persistência por porta injetável e o write-through; esta fatia adiciona **uma operação de escrita** dentro desse mesmo desenho (mesma porta `MemoryStorage`, mesmo `storage.save`, load-once) — daí o ADR-0011 ganhar **nota de atualização**, sem ADR novo (ver D7). A [Constituição](../../00-project/ArchitectureConstitution.md) é respeitada: Memory mantém autoridade exclusiva (Artigo 11), a consolidação por normalização determinística é a estratégia **mais simples** (reusa o critério da SPEC-0022), e nenhum módulo é criado ou tem responsabilidade movida (Artigo 15).

Documentos originadores: **SPEC-0022** (a garantia determinística para escritas novas; o residual do acervo legado que esta fatia fecha) + **ADR-0011** (persistência por porta injetável, write-through; ganha nota de atualização) + **PRD** (Memória l. 125, Aprendizado l. 163) + **Module Catalog** (Memory autoridade exclusiva; "revisão e exclusão") + **Roadmap** (candidato nomeado em 1.3/l. 93).

---

# Referências

- [SPEC-0022](SPEC-0022-deterministic-fact-deduplication.md) (`docs/implementation/specs/SPEC-0022-deterministic-fact-deduplication.md`) — **origem da necessidade**: a dedup determinística em escritas novas; o `normalize(text)` interno que esta SPEC reusa; o residual explícito do acervo legado (`atlas memory dedupe`) que esta fatia entrega
- [SPEC-0009](SPEC-0009-memory-service.md) (`docs/implementation/specs/SPEC-0009-memory-service.md`) — o Memory Service: `remember`/`forget`/`list`/`prompt`, storage JSON por porta injetável, load-once + write-through — o desenho que esta SPEC estende com uma operação de escrita
- [SPEC-0020](SPEC-0020-learning-post-turn-extraction.md) (`docs/implementation/specs/SPEC-0020-learning-post-turn-extraction.md`) — proveniência `Fact.source?: 'user' | 'learned'`, cujo tratamento na consolidação esta SPEC decide (não promover em colisão)
- [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) (`docs/06-adr/ADR-0011-memory-service-persistence.md`) — Memory autoridade exclusiva do estado persistente; persistência por porta injetável; write-through; **ganha nota de atualização** (uma operação de consolidação explícita entra no desenho, sob confirmação; contrato ganha `dedupe`)
- [Module Catalog](../../03-architecture/ModuleCatalog.md) (`docs/03-architecture/ModuleCatalog.md`) — Memory como única autoridade de conhecimento persistente; "mecanismos de revisão e exclusão"
- [Roadmap](../../04-engineering/Roadmap.md) (`docs/04-engineering/Roadmap.md`) — item 1.3, l. 93 (residual "consolidação do acervo legado no storage / `atlas memory dedupe`"): a proveniência literal
- [PRD](../../02-product/ProductRequirementsDocument.md) (`docs/02-product/ProductRequirementsDocument.md`) — Memória (l. 117–125, "consultar, atualizar e remover"), Aprendizado (l. 159–163, "controlado e revisável")
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) (`docs/00-project/ArchitectureConstitution.md`) — Artigo 11 (autoridade exclusiva sobre estado persistente), Artigo 15 (a IA não cria componentes nem move responsabilidades)

---

# Escopo

Muda código de produção em `packages/memory` (o grosso), `packages/contracts` (método aditivo `dedupe` + tipos de relatório) e `apps/cli` (novo subcomando `memory dedupe` + flag `--apply`). Estritamente as decisões fechadas abaixo — nem mais, nem menos.

- **`@atlas/memory` — método `dedupe`**:
  - Implementar `dedupe(options?: { apply?: boolean }): Promise<DedupeReport>` em `packages/memory/src/memory-service.ts`, **reusando** o `normalize(text)` interno existente (SPEC-0022) — sem duplicar a função.
  - Agrupar `facts` por `normalize(fact.text)`. Um grupo com **≥ 2** fatos é um grupo de duplicatas. Em cada grupo, o **sobrevivente** é o de menor `createdAt` (comparação de string ISO); empate desempata pelo **menor índice em `facts`** (ordem de carga). Os demais são as `duplicates`.
  - Se `apply` for `true` e houver ≥ 1 grupo com duplicata: reconstruir `facts` **preservando a ordem de carga**, mantendo cada sobrevivente e todo fato sem duplicata, e removendo as `duplicates`; chamar `storage.save(facts)` **uma vez**; `applied: true`.
  - Se `apply` for `false`/ausente, **ou** se não houver nenhum grupo com duplicata: **não** mutar `facts`, **não** chamar `storage.save`; `applied: false`.
  - `DedupeReport.groups` contém **apenas** os grupos que têm ≥ 1 duplicata (grupos de 1 fato não entram no relatório). Cada `DedupeGroup` = `{ survivor: Fact; duplicates: readonly Fact[] }`.
  - Não reescrever `text`, não mesclar campos, não alterar `source` de sobrevivente nem de nenhum fato preservado.
- **`@atlas/contracts` — método aditivo + tipos**:
  - Em `packages/contracts/src/memory.ts`, adicionar a `MemoryService` o membro `dedupe(options?: { readonly apply?: boolean }): Promise<DedupeReport>` e exportar os tipos `DedupeReport` (`{ readonly applied: boolean; readonly groups: readonly DedupeGroup[] }`) e `DedupeGroup` (`{ readonly survivor: Fact; readonly duplicates: readonly Fact[] }`). `Fact`/`remember`/`forget`/`list`/`prompt` **inalterados**. (Mudança **aditiva** ao contrato — mas todo **implementador/fake** de `MemoryService` precisa passar a implementar `dedupe`.)
- **`apps/cli` — subcomando `memory dedupe` + `--apply`**:
  - `apps/cli/src/gateway/input-gateway.ts`: estender o parsing do comando `memory` para aceitar o subcomando `dedupe` além de `list` (subcomando desconhecido segue erro de uso, agora listando `list`/`dedupe`); adicionar a flag booleana `--apply` (via `parseArgs`), carregada no `ParsedInput` (por exemplo `memorySubcommand?: 'list' | 'dedupe'` e `apply?: boolean` — forma exata a critério do implementer).
  - Novo handler `apps/cli/src/commands/memory.ts` (ou arquivo irmão): `runMemoryDedupe(atlas, apply, output)` chama `atlas.memory.dedupe({ apply })` e renderiza: sem grupos → "Nenhuma duplicata encontrada."; com grupos e `!applied` (dry-run) → lista cada sobrevivente e as duplicatas que **seriam** removidas + dica de rodar com `--apply`; com grupos e `applied` → confirma o que **foi** removido. Texto exato das mensagens a critério do implementer, mantendo o tom das mensagens atuais da CLI.
  - `apps/cli/src/run.ts`: despachar `memory dedupe` para `runMemoryDedupe`; `memory list` segue em `runMemoryList`. Atualizar o `HELP_TEXT` com a linha `memory dedupe [--apply]`.
- **Testes**: `packages/memory/tests/*` (agrupamento por normalização; sobrevivente = mais antigo; empate por ordem de carga; dry-run não chama `save`; `--apply` chama `save` 1x e remove as duplicatas; no-op sem duplicatas não chama `save`; `source` de sobrevivente preservado; `text` não reescrito; `list()` reflete a consolidação após `--apply`); `apps/cli/tests/*` (dry-run vs. `--apply`; no-op; parsing do subcomando e da flag; **fakes de `MemoryService` passam a implementar `dedupe`**). **Grep obrigatório** por `MemoryService` e por `.dedupe(` no repo inteiro para mapear todo fake/implementador que a adição do método atinja (lição recorrente: membro de interface de contrato exige grep pelo nome do tipo; fakes com cast `as unknown as` escapam do `typecheck` e só quebram em `pnpm test`).
- **Documentação**: atualizar `packages/memory/CLAUDE.md`, `packages/contracts/CLAUDE.md`, `apps/cli/CLAUDE.md`, `CLAUDE.md` raiz (estado/comandos da CLI); **nota de atualização no [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md)** — **não** criar ADR novo; `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`; marcar o residual "consolidação do acervo legado / `atlas memory dedupe`" (Roadmap 1.3/l. 93) como entregue por esta SPEC; registrar lições em `docs/implementation/LESSONS_LEARNED.md`.

_A divisão de quem toca qual documentação segue a "Definition of Done" — o `spec-implementer` toca só o arquivo da SPEC e a nota de atualização no ADR-0011; as docs vivas são o passo de fecho `doc-sync`._

---

# Fora do Escopo

Esta seção é obrigatória e reflete o que fica deliberadamente de fora — residuais conscientes.

- **Consolidação automática no `load` ou em qualquer caminho não-explícito.** A consolidação acontece **só** quando o usuário roda `atlas memory dedupe --apply`. O `load`, o `remember`, o `forget` e o startup **não** consolidam nada. **Não** implementar.
- **Aplicar por default (sem `--apply`).** O default é dry-run. **Não** inverter — mutar estado persistente do usuário exige confirmação explícita.
- **Normalização além de espaço + caixa.** Reusa exatamente o `normalize` da SPEC-0022 (`trim` → `toLowerCase` → colapso de `\s+`). Pontuação, acentos, sinônimos e equivalência semântica ficam de fora. **Não** ampliar.
- **Comparação semântica / por-modelo de duplicata.** Seria não-determinística. **Não** implementar.
- **Merge/fusão de campos entre duplicatas.** Nada de concatenar textos, unir metadados ou combinar `source`. A operação é **remoção** das duplicatas, preservando o sobrevivente intacto. **Não** implementar.
- **Promoção/rebaixamento de `source` na consolidação** (`learned`→`user` ou vice-versa quando fatos de origens diferentes colidem). O sobrevivente mantém o `source` que já tinha. **Não** implementar.
- **Reescrita do `text` armazenado para a forma normalizada.** O sobrevivente mantém seu `text` original (casing/espacamento). A normalização serve só para **detectar** duplicata, não para **reescrever**. **Não** implementar.
- **Confirmação interativa (`ConfirmPort`/`readline`) para o dedupe.** A confirmação é o próprio flag `--apply` (padrão de utilitário de linha de comando). **Não** reusar o fluxo `confirm` do Runtime aqui — ele é para Tools destrutivas na execução, não para comandos de memória da CLI.
- **Backup/undo/journaling da consolidação.** Sem snapshot de rollback. O dry-run é a rede de segurança (o usuário revisa antes de aplicar). **Não** implementar.
- **Mudança em `remember`/`forget`/`list`/`prompt`** ou em `Fact`. A SPEC só **adiciona** `dedupe`. `Fact` não ganha campo. **Não** tocar.
- **Retenção / curadoria / classificação / busca / relações / memória episódica ou de projetos** (demais candidatos de 1.3). **Não** implementar.
- **Qualquer mudança em** `@atlas/cognitive`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context` — além do que a adição do método ao contrato force em **fakes de teste**. **Não** tocar o código de produção desses packages.

---

# Pré-requisitos

- [SPEC-0009](SPEC-0009-memory-service.md) (Memory Service; `remember`/`forget`/`list`/`prompt`; storage JSON por porta injetável; load-once + write-through) — **Done** (confirmar status real antes de `Ready`)
- [SPEC-0020](SPEC-0020-learning-post-turn-extraction.md) (proveniência `Fact.source?`, cujo tratamento na consolidação esta SPEC decide) — **Done** (confirmar)
- [SPEC-0022](SPEC-0022-deterministic-fact-deduplication.md) (o `normalize(text)` interno e o critério de duplicata que esta SPEC reusa; a garantia para escritas novas que esta completa no acervo legado) — **Done** (confirmar)

> O `spec-drafter` **não** confirmou os status acima consultando cada arquivo; a confirmação mecânica do `Status: Done` de cada pré-requisito é parte da transição `Draft → Ready`. (Nota: a leitura do repo indica SPEC-0022 já `Done` em 2026-07-20, mas a confirmação formal fica no gate.)

---

# Critérios de Aceitação

Cada item é verificável mecanicamente pelo `spec-validator`.

- **`normalize` é reusado, não duplicado**: `dedupe` usa a mesma função `normalize` interna de `@atlas/memory` (SPEC-0022); não há segunda cópia da normalização; a função **não** aparece em `@atlas/contracts` (verificável no diff de `packages/contracts`).
- **Agrupamento por normalização**: um acervo carregado com `[{text:'Meu Nome é Lohan'}, {text:'prefiro TS'}, {text:'  meu   nome é lohan '}]` produz, em `dedupe()` (dry-run), **um** `DedupeGroup` cujo `survivor` + `duplicates` cobrem as duas entradas equivalentes; o fato distinto **não** entra em nenhum grupo.
- **Sobrevivente = mais antigo por `createdAt`**: dado um grupo com `createdAt` `'2026-01-01...'` e `'2026-05-01...'`, o `survivor` é o de `'2026-01-01...'` (seu `id` preservado); o outro entra em `duplicates`.
- **Empate por ordem de carga**: dois fatos equivalentes com `createdAt` idêntico → sobrevive o de **menor índice** em `facts` (verificável por teste com storage fake de ordem controlada).
- **Dry-run não persiste**: `dedupe()` / `dedupe({ apply: false })` com duplicatas presentes → `storage.save` **não** invocado (contagem no storage fake); `list().length` inalterado; `applied === false`; `groups` não-vazio.
- **`--apply` persiste e remove**: `dedupe({ apply: true })` com duplicatas → `storage.save` invocado **1x**; `list()` passa a conter só os sobreviventes + fatos sem duplicata (ordem de carga preservada); `applied === true`.
- **No-op sem duplicatas**: acervo sem nenhuma colisão de normalização → `groups` vazio; `storage.save` **não** invocado nem com `apply: true`; `applied === false`; `list()` inalterado.
- **`source` preservado, sem promoção**: um `{text:'x', source:'user', createdAt: mais antigo}` e um `{text:'X', source:'learned'}` → após `--apply`, sobrevive o `user` (mais antigo) com `source: 'user'` inalterado; nenhum fato tem `source` alterado.
- **`text` não reescrito**: o `text` do sobrevivente após `--apply` é **exatamente** o original (casing/espacamento), não a forma normalizada.
- **`remember`/`forget`/`list`/`prompt` intactos**: nenhuma mudança de comportamento nesses quatro (assertivas existentes seguem verdes); o retorno `{ fact, created }` de `remember` (SPEC-0022) inalterado.
- **Contrato ganha `dedupe` aditivo**: `packages/contracts/src/memory.ts` declara `dedupe(options?): Promise<DedupeReport>` e exporta `DedupeReport`/`DedupeGroup`; `Fact`/`remember`/`forget`/`list`/`prompt` inalterados.
- **CLI dry-run vs. apply**: `atlas memory dedupe` (sem `--apply`) com duplicatas imprime o que **seria** consolidado e **não** altera `atlas memory list`; `atlas memory dedupe --apply` consolida e a lista subsequente mostra uma única ocorrência por fato (verificável por teste E2E da CLI com storage em `tmpdir`).
- **CLI no-op**: `atlas memory dedupe` num acervo sem duplicatas imprime "nenhuma duplicata encontrada" (ou equivalente) e não altera a lista.
- **Subcomando desconhecido**: `atlas memory <algo>` que não seja `list`/`dedupe` erra com mensagem de uso listando ambos; `HELP_TEXT` inclui `memory dedupe [--apply]`.
- **Todos os fakes de `MemoryService` migrados**: `git grep 'MemoryService'` e `git grep '\.dedupe('` no repo não deixam nenhum fake sem `dedupe`; `pnpm test` **e** `pnpm typecheck` verdes em todo o workspace (fakes com cast `as unknown as` só quebram em `pnpm test`, não no `typecheck`).
- **Componentes intactos**: nenhum diff de código de produção em `packages/cognitive`, `packages/runtime`, `packages/permissions`, `packages/tools`, `packages/model-gateway`, `packages/persona`, `packages/context`.
- **Documentação**: `packages/memory/CLAUDE.md` + `packages/contracts/CLAUDE.md` + `apps/cli/CLAUDE.md` + `CLAUDE.md` raiz atualizados; **nota de atualização no ADR-0011**; `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` atualizados; o residual de consolidação de legado em 1.3/l. 93 do `Roadmap.md` marcado como **entregue** por esta SPEC; lições em `LESSONS_LEARNED.md`.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.

---

# Arquivos Esperados

```text
packages/memory/src/
  memory-service.ts      (editado: dedupe(options?) reusando normalize; agrupa por normalização,
                          sobrevivente = mais antigo por createdAt / ordem de carga; write-through só em apply)

packages/memory/tests/
  memory-service.test.ts (editado: agrupamento; sobrevivente; empate por ordem; dry-run não salva;
                          apply salva 1x e remove; no-op sem duplicatas; source/text preservados)

packages/contracts/src/
  memory.ts              (editado: + dedupe(options?): Promise<DedupeReport>; + DedupeReport, DedupeGroup)

apps/cli/src/
  gateway/input-gateway.ts  (editado: subcomando memory dedupe + flag --apply no ParsedInput)
  commands/memory.ts        (editado: + runMemoryDedupe(atlas, apply, output) renderizando o relatório)
  run.ts                    (editado: despacho de memory dedupe; HELP_TEXT com "memory dedupe [--apply]")

apps/cli/tests/
  *.test.ts              (editado/novo: dry-run vs apply; no-op; parsing do subcomando/flag; fakes com dedupe)

CLAUDE.md (raiz)                                          (editado: comandos da CLI / estado)
packages/memory/CLAUDE.md, packages/contracts/CLAUDE.md, apps/cli/CLAUDE.md  (editados)
docs/06-adr/ADR-0011-memory-service-persistence.md       (editado: nota de atualização)
docs/04-engineering/Roadmap.md                           (editado: residual de 1.3/l.93 marcado entregue)
docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md  (editados)
docs/implementation/LESSONS_LEARNED.md                   (editado)
```

Lista é expectativa; o grep por `MemoryService`/`.dedupe(` no repo inteiro pode revelar fakes adicionais a migrar.

---

# Componentes Impactados

- Memory Service (`@atlas/memory`) — novo método `dedupe`; agrupamento por `normalize` (reusado); write-through condicional a `apply`. **Grosso** da mudança.
- Contracts (`@atlas/contracts`) — método aditivo `dedupe` em `MemoryService` + tipos `DedupeReport`/`DedupeGroup`. `Fact` e os demais membros inalterados.
- CLI (`apps/cli`) — novo subcomando `memory dedupe`, flag `--apply`, handler `runMemoryDedupe`, `HELP_TEXT`.
- Cognitive, Runtime, Permission Service, Tools, Model Gateway, Persona, Context, Core — **inalterados** (só fakes de teste que a adição do método force).

---

# Interfaces Necessárias

- **`MemoryService.dedupe(options?: { readonly apply?: boolean }): Promise<DedupeReport>`** (`@atlas/contracts`, **aditivo**): consolida duplicatas do acervo; dry-run por default.
- **`DedupeReport`** (`@atlas/contracts`): `{ readonly applied: boolean; readonly groups: readonly DedupeGroup[] }`.
- **`DedupeGroup`** (`@atlas/contracts`): `{ readonly survivor: Fact; readonly duplicates: readonly Fact[] }`.
- `normalize(text: string): string` (`@atlas/memory`, **interno**, já existente da SPEC-0022) — **reusado**, não recriado; não sobe a `@atlas/contracts`.
- `Fact`, `MemoryService.remember`/`forget`/`list`/`prompt` — **inalterados**.

---

# Fluxo Esperado

```text
dedupe({ apply }):
  grupos = agrupar(facts, por normalize(f.text))
  duplicados = grupos com tamanho >= 2
  para cada grupo duplicado:
    survivor = min(grupo, por createdAt; empate → menor índice em facts)
    duplicates = grupo \ { survivor }
  há duplicados?
    não  → { applied: false, groups: [] }        [sem save]
    sim & !apply → { applied: false, groups }     [dry-run: sem save, sem mutar facts]
    sim & apply  → facts := facts sem os duplicates (ordem de carga preservada)
                   storage.save(facts)
                   { applied: true, groups }

CLI (atlas memory dedupe [--apply]):
  report = memory.dedupe({ apply })
  report.groups vazio        → "Nenhuma duplicata encontrada."
  !applied (dry-run)         → lista sobreviventes + duplicatas que SERIAM removidas + dica --apply
  applied                    → confirma o que FOI removido

load / remember / forget / prompt / list: inalterados — nenhuma consolidação implícita.
```

---

# Estratégia de Implementação

Sugestão de ordem (TDD, com storage fake em memória que conta chamadas de `save`; **sem IO real**):

1. **Contrato**: adicionar `dedupe(options?): Promise<DedupeReport>` a `MemoryService` e exportar `DedupeReport`/`DedupeGroup` em `packages/contracts/src/memory.ts`. Rodar `git grep 'MemoryService'` e `git grep '\.dedupe('` no repo **antes** de assumir inocuidade — mapear todos os implementadores/fakes. `pnpm typecheck` fica RED até os fakes implementarem `dedupe` (esperado; fakes com cast só quebram em `pnpm test`).
2. **`dedupe` no serviço**: agrupar por `normalize` (reusar); escolher sobrevivente (mais antigo por `createdAt`, empate por índice); montar `DedupeReport`; em `apply`, reconstruir `facts` preservando ordem + `storage.save`. Testes: agrupamento; sobrevivente; empate; dry-run não salva; apply salva 1x e remove; no-op; source/text preservados.
3. **CLI**: estender o parsing de `memory` (subcomando `dedupe` + flag `--apply`); `runMemoryDedupe` renderizando dry-run × apply × no-op; despacho em `run.ts`; `HELP_TEXT`. Migrar fakes de `apps/cli/tests/*` (e de outros consumidores) para implementar `dedupe`.
4. **Verificação**: `lint`/`format:check`/`typecheck`/`test` (por caminho a partir da raiz).
5. **Documentação**: `CLAUDE.md` (raiz + memory + contracts + cli); nota no ADR-0011; `Roadmap.md` (residual de 1.3); `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

Todos com fakes (storage fake em memória que **conta chamadas de `save`** e permite carregar um acervo inicial controlado; sem IO real).

- **(memory) agrupamento**: acervo com 2 equivalentes + 1 distinto → `groups.length === 1`; o grupo cobre as 2 equivalentes; o distinto fora.
- **(memory) sobrevivente por `createdAt`**: grupo com datas distintas → survivor = mais antigo, `id` preservado.
- **(memory) empate por ordem de carga**: datas idênticas → survivor = menor índice.
- **(memory) dry-run não salva**: `dedupe()` / `dedupe({apply:false})` → `save` 0x; `list()` inalterado; `applied === false`.
- **(memory) apply salva e remove**: `dedupe({apply:true})` → `save` 1x; `list()` só sobreviventes + distintos; `applied === true`.
- **(memory) no-op**: acervo sem duplicatas → `groups` vazio; `save` 0x mesmo com `apply:true`.
- **(memory) source/text preservados**: colisão `user` (mais antigo) × `learned` → sobrevive `user` com `source`/`text` intactos; nenhum `source` alterado.
- **(memory) idempotência**: rodar `dedupe({apply:true})` duas vezes → a segunda é no-op (`groups` vazio, `save` não chamado).
- **(cli) dry-run**: `atlas memory dedupe` com duplicatas imprime o preview e não muda `memory list`.
- **(cli) apply**: `atlas memory dedupe --apply` consolida; `memory list` seguinte mostra uma ocorrência por fato.
- **(cli) no-op**: acervo limpo → mensagem "nenhuma duplicata encontrada".
- **(cli) parsing**: subcomando `dedupe` reconhecido; `--apply` reconhecido; subcomando inválido erra listando `list`/`dedupe`.
- **(migração) fakes**: todo fake de `MemoryService` implementa `dedupe` e segue verde.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada: `packages/memory/CLAUDE.md` + `packages/contracts/CLAUDE.md` + `apps/cli/CLAUDE.md` + `CLAUDE.md` raiz; **nota de atualização no ADR-0011**; `docs/04-engineering/Roadmap.md` (residual de consolidação de legado em 1.3/l. 93 marcado entregue); `docs/05-context/NEXT_CONTEXT.md`; `docs/05-context/CURRENT_SPRINT.md`;
- arquitetura preservada: Memory **mantém autoridade exclusiva** do estado persistente (Artigo 11) e ganha uma operação de consolidação **explícita e revisável**; nenhum módulo novo nem responsabilidade movida (Artigo 15); Cognitive/Runtime/Permissões/Tools/Gateway/Persona/Context intactos;
- residuais documentados como tais (consolidação automática/implícita, aplicar por default, normalização além de espaço+caixa, comparação semântica, merge de campos, promoção de `source`, reescrita de texto, backup/undo, demais fatias de 1.3) — e a operação descrita honestamente como **explícita, opt-in (`--apply`) e determinística**;
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz + dos packages tocados, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) **não é escopo do `spec-implementer`** — é o passo de fecho `doc-sync` no fio principal, após a validação. O implementador toca só a documentação específica da própria SPEC (o arquivo da SPEC e a nota de atualização no ADR-0011 que a SPEC prevê).

---

# Restrições

- **Não** criar package/módulo novo nem mover responsabilidade entre módulos (Artigo 15). A consolidação vive na Memory, autoridade exclusiva do estado persistente.
- **Não** criar ADR novo; a única mexida em ADR é a **nota de atualização** no ADR-0011.
- **Não** recriar/duplicar a normalização — reusar o `normalize` interno da SPEC-0022; **não** ampliá-la (sem acento/pontuação/semântica).
- **Não** consolidar em nenhum caminho implícito (`load`/`remember`/`forget`/startup); só em `atlas memory dedupe --apply`.
- **Não** aplicar por default; dry-run é o default.
- **Não** mesclar campos, **não** promover `source`, **não** reescrever `text` do sobrevivente.
- **Não** adicionar campo a `Fact`; `DedupeReport`/`DedupeGroup` são tipos de retorno, não estado persistente.
- **Não** reusar o fluxo interativo `confirm`/`ConfirmPort` do Runtime para o dedupe (a confirmação é o flag `--apply`).
- **Não** tornar `normalize` público em `@atlas/contracts` (interno ao package).
- **Não** alterar `remember`/`forget`/`list`/`prompt`.
- **Não** alterar código de produção de `@atlas/cognitive`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context` — só fakes de teste que a adição do método force.
- Testes **sem** IO real (storage fake em memória; E2E da CLI em `tmpdir`, como os testes de comando existentes). Rodar por caminho a partir da raiz.

---

# Observações

- **Por que dry-run por default (e não aplicar direto)**: consolidar muta estado persistente do usuário de forma irreversível (remove entradas). O default seguro é **mostrar** o que seria removido; `--apply` é o consentimento explícito. Isso concretiza o "controlado e revisável" do PRD (Aprendizado, l. 163) sem precisar de um `ConfirmPort` interativo. Ver D2.
- **Por que o sobrevivente é o mais antigo**: preservar a entrada de `createdAt` mais antigo mantém o `id` que existe há mais tempo (menor chance de referências externas quebrarem) e é um critério **determinístico e estável**, coerente com o espírito da SPEC-0022 (o primeiro fato prevalece). Ver D3.
- **Por que `source` não é promovido em colisão**: a SPEC-0022 (D2/D3) decidiu não promover `source` e não ramificar por origem — manter a consistência aqui evita reintroduzir uma decisão de produto (qual proveniência "vence") que ambas as SPECs preferiram não tomar. O critério é puramente temporal. Ver D4.
- **Por que o método sobe ao contrato**: a `apps/cli` só enxerga `@atlas/contracts`/`@atlas/core` e **não** tem acesso ao `normalize` interno nem ao `storage`. Para a CLI invocar a consolidação sem reimplementar normalização nem violar a autoridade da Memory (Artigo 11 + Artigo 5), a operação precisa ser um membro público de `MemoryService`. (Correção do gate — F1: `MemoryService` já é contrato público; adicionar um método **não** é "promoção de tipo" no sentido do ADR-0007 — o fundamento é o Artigo 11/5, não a regra do 2º consumidor.) Ver D6.
- **Relação com a SPEC-0022**: a SPEC-0022 impede **novas** duplicatas (garantia automática, no caminho de escrita); esta SPEC limpa as **antigas** (operação explícita, sob demanda). Juntas cobrem futuro (automático) e passado (opt-in). Após um `--apply`, `remember` já garante que não voltam a entrar.

---

# Checklist para IA

Antes de implementar:

- ler a **SPEC-0022** (o `normalize` interno e o critério de duplicata a reusar; o residual do acervo legado que esta fecha), a **SPEC-0009** (o desenho do Memory Service: storage/load-once/write-through), o **ADR-0011** (autoridade exclusiva; write-through; ganha nota), o Artigo 11 e o Roadmap 1.3/l. 93;
- compreender o objetivo (consolidação explícita, dry-run por default, sobrevivente determinístico = mais antigo, sem merge/promoção/reescrita, no-op sem duplicatas);
- confirmar mecanicamente que os pré-requisitos (SPEC-0009/0020/0022) estão `Done`;
- `git grep 'MemoryService'` **e** `git grep '\.dedupe('` no repo antes de editar — mapear todos os implementadores/fakes.

Durante a implementação:

- TDD com storage fake que conta `save` (sem IO); reusar `normalize`, não recriar;
- dry-run **não** persiste; `--apply` persiste 1x; no-op sem duplicatas **não** persiste;
- sobrevivente preservado intacto (id/text/createdAt/source); demais removidos; ordem de carga preservada;
- `Fact` intacto; `normalize` interno; `remember`/`forget`/`list`/`prompt` intactos;
- não vazar escopo (nada de consolidação implícita, aplicar por default, merge, promoção de source, reescrita de texto, backup/undo, outras fatias de 1.3).

Após a implementação:

- rodar `lint`/`format:check`/`typecheck`/`test` (por caminho a partir da raiz);
- atualizar documentação (`CLAUDE.md` raiz + memory + contracts + cli; nota no ADR-0011; `Roadmap.md` residual de 1.3; contexto);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, a Memória do Atlas oferece `atlas memory dedupe` — uma operação **explícita, determinística e revisável** para consolidar o acervo legado de fatos. Por default é **dry-run**: mostra quais duplicatas (colisões sob a mesma normalização `trim`/`toLowerCase`/colapso de `\s+`, reusando o critério da SPEC-0022) seriam removidas e qual fato sobreviveria — sempre o mais antigo por `createdAt` (empate pela ordem de carga), preservado intacto (`id`/`text`/`source`). Com `--apply`, remove as duplicatas e persiste por write-through (`storage.save`), sem mesclar campos, promover `source` nem reescrever texto; em acervo sem duplicatas é no-op (sem save). A consolidação é a autoridade da Memory: `MemoryService` ganha o método aditivo `dedupe(options?): Promise<DedupeReport>` (a CLI só invoca e renderiza), e o ADR-0011 ganha nota de atualização — sem ADR novo. Fecha o residual que a SPEC-0022 deixou nomeado (Roadmap 1.3/l. 93): a garantia para escritas novas de lá agora tem par para o passado. `remember`/`forget`/`list`/`prompt` e `Fact` permanecem intactos; a Memory mantém autoridade exclusiva do estado persistente (Artigo 11); nenhum módulo novo nem responsabilidade movida; o grosso da mudança vive em `@atlas/memory`, com um método aditivo em `@atlas/contracts` e um novo subcomando em `apps/cli`.

---

# Decisões de design (formato de veto)

Decisões tomadas pelo `spec-drafter` (Emenda v1.1, Artigo 15), rastreadas às fontes e registradas para o `architecture-reviewer` atacar.

**D1 — Superfície = subcomando `atlas memory dedupe` (não comando top-level).**
- **Decisão**: expor a operação como subcomando do comando `memory` existente (irmão de `memory list`), não como comando top-level `atlas dedupe`.
- **Porquê**: a CLI já agrupa operações de acervo sob `memory` (`memory list`), com parsing de subcomando pronto em `input-gateway.ts`; reusar esse guarda-chuva é **mais simples e mais consistente** (teste da Constituição) que abrir um comando de topo. O próprio Roadmap 1.3/l. 93 nomeia o candidato como `atlas memory dedupe`.
- **Alternativa descartada**: comando top-level `atlas dedupe` — perdeu por criar uma superfície solta, desalinhada do agrupamento `memory` já existente.

**D2 — Dry-run por default; mutação só com `--apply`.**
- **Decisão**: `atlas memory dedupe` (e `dedupe({apply:false})`) apenas relata; `atlas memory dedupe --apply` (e `dedupe({apply:true})`) muta e persiste.
- **Porquê**: consolidar remove entradas de forma irreversível; o default seguro é **revisar antes** — concretiza o "controlado e revisável" do PRD (Aprendizado, l. 163) e o espírito da SPEC-0022 D4 (não mutar memória do usuário sem pedido explícito). O flag é o consentimento.
- **Alternativa descartada**: aplicar direto (mutar no primeiro uso) — perdeu por remover estado persistente sem revisão; confirmação interativa via `ConfirmPort` — perdeu por acoplar um utilitário de CLI ao fluxo `confirm` do Runtime, que é para Tools destrutivas na execução, não para comandos de memória.

**D3 — Sobrevivente por grupo = o mais antigo por `createdAt` (empate por ordem de carga), preservado intacto.**
- **Decisão**: em cada grupo de duplicatas, sobrevive o de menor `createdAt` (comparação de string ISO); empate desempata pelo menor índice em `facts`. O sobrevivente mantém `id`/`text`/`createdAt`/`source`; os demais são removidos, sem reescrever texto nem mesclar campos.
- **Porquê**: preservar o `id` mais antigo é estável e determinístico (menor risco de quebrar referências), coerente com "o primeiro fato prevalece" da SPEC-0022; manter o `text` original evita reescrever a memória do usuário para uma forma normalizada que ele não digitou.
- **Alternativa descartada**: manter o mais recente — perdeu por descartar o `id` histórico sem ganho; normalizar o `text` do sobrevivente — perdeu por mutar conteúdo do usuário além do necessário (a normalização detecta, não reescreve).

**D4 — `source` não é promovido nem mesclado em colisão de origens.**
- **Decisão**: quando um fato `user` e um `learned` colidem, o sobrevivente (o mais antigo) mantém o `source` que já tinha; nenhum `source` é promovido, rebaixado ou mesclado.
- **Porquê**: consistência com a SPEC-0022 (D2/D3), que decidiu não promover `source` e não ramificar por origem — evita reintroduzir a decisão de produto "qual proveniência vence", que ambas as SPECs preferiram não tomar; o critério é puramente temporal e determinístico.
- **Alternativa descartada**: preferir `user` sobre `learned` (ou promover a `user` em colisão) — perdeu por abrir uma decisão de produto sobre autoridade de proveniência, fora do escopo mínimo e inconsistente com a SPEC-0022.

**D5 — No-op em acervo sem duplicatas (sem `save`).**
- **Decisão**: se nenhum grupo tem ≥ 2 fatos equivalentes, `dedupe` devolve `groups` vazio e `applied: false` e **não** chama `storage.save`, mesmo com `apply: true`.
- **Porquê**: gravar sem mudança é IO inútil e ruído; espelha o no-op idempotente de `remember` na SPEC-0022 (não tocar o storage quando não há o que fazer). Torna `dedupe` idempotente (rodar duas vezes = a segunda é no-op).
- **Alternativa descartada**: sempre reescrever o arquivo em `--apply` — perdeu por gravação desnecessária e por mascarar "nada mudou" numa escrita.

**D6 — Método aditivo `dedupe` em `MemoryService` (+ `DedupeReport`/`DedupeGroup`); lógica na Memory.**
- **Decisão**: adicionar `dedupe(options?): Promise<DedupeReport>` ao contrato `MemoryService` e os tipos de relatório a `@atlas/contracts`; a lógica (normalização + escolha + `storage.save`) vive em `@atlas/memory`. A CLI só invoca e renderiza.
- **Porquê**: a `apps/cli` só enxerga `@atlas/contracts`/`@atlas/core` e não acessa o `normalize` interno nem o `storage`; para invocar a consolidação sem reimplementar normalização nem violar a autoridade exclusiva da Memory (Artigo 11 + Artigo 5), a operação precisa ser membro público do contrato. (F1: `MemoryService` já é público — o fundamento é o Artigo 11/5, não a regra do 2º consumidor/promoção de tipo do ADR-0007.)
- **Alternativa descartada**: expor `normalize` a `@atlas/contracts` e a CLI reconstruir/salvar a lista — perdeu por vazar lógica de consolidação e autoridade de escrita para a borda (viola Artigo 11 e o Module Catalog); método local ao package sem contrato — perdeu porque a CLI não o alcançaria.

**D7 — ADR-0011 ganha nota de atualização; sem ADR novo.**
- **Decisão**: registrar a operação de consolidação (nova operação de escrita explícita, sob confirmação, dentro da persistência por porta injetável) como **nota de atualização no ADR-0011** — não é decisão arquitetural inédita.
- **Porquê**: a decisão estrutural (Memory autoridade exclusiva, persistência por porta injetável, write-through) já vive no ADR-0011; `dedupe` é mais uma operação de escrita dentro desse mesmo desenho (mesma porta, mesmo `storage.save`, load-once) — não cria fronteira nova, não é escalação por ADR novo (Emenda v1.1).
- **Alternativa descartada**: ADR novo dedicado à consolidação — perdeu porque não há decisão arquitetural inédita; seria cerimônia sem fronteira nova.

**D8 — Prioridade Low.**
- **Decisão**: propor `Low` (o humano confirma na aprovação `Draft → Ready`).
- **Porquê**: é limpeza opt-in de resíduo estático; a garantia de correção que importa (não persistir novas duplicatas) já foi entregue pela SPEC-0022. As duplicatas legadas não crescem nem afetam a correção do sistema — só o ruído no `prompt()`/`list`. Não há urgência nem bloqueio de outra fatia.
- **Alternativa descartada**: `Medium` (faixa da SPEC-0022) — perdeu porque a SPEC-0022 era garantia de autoridade sobre escritas; esta é utilidade de limpeza sob demanda, estritamente menos urgente.

---

# Histórico de Revisão

- **Rev. 1 (Draft inicial)** — `spec-drafter`. Decisões de design D1–D8 fechadas no formato de veto (subcomando `atlas memory dedupe`; dry-run por default com `--apply` para mutar; sobrevivente = mais antigo por `createdAt`/ordem de carga preservado intacto; `source` sem promoção/merge; no-op sem duplicatas; método aditivo `dedupe` em `MemoryService` com a lógica na Memory; nota de atualização no ADR-0011 sem ADR novo; prioridade Low proposta). Aguarda o gate do `architecture-reviewer` para `Draft → Ready`.
- **Rev. 2 (Draft → Ready)** — `architecture-reviewer` **APROVOU** (autorizada para Ready, nenhum gatilho de escalação da Emenda v1.1 disparou; Artigo 11 preservado, critérios verificáveis). Achados não-bloqueantes: **F1** (fundamento de D6 corrigido nesta revisão — subir `dedupe` ao contrato é justificado pelo Artigo 11/5, **não** pela regra do 2º consumidor/promoção de tipo do ADR-0007, já que `MemoryService` é contrato público); **F2** (`--apply` é irreversível e não força dry-run prévio — aceito como residual documentado, `--apply` **é** o consentimento explícito do Artigo 8; sem undo/backup fica fora de escopo); **F3** (nota ao implementer: confirmar que os `createdAt` do storage são ISO UTC uniformes, para a ordenação lexicográfica de D3 equivaler à cronológica); **F4** (justificativa de "referências externas" em D3 é decorativa — o argumento de determinismo/estabilidade sustenta D3 sozinho). Transição `Draft → Ready` aplicada pelo fio principal. Próxima etapa: `spec-implementer`.
