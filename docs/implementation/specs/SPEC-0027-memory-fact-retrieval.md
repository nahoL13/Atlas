# Implementation Specification

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0027

---

**Título**

Busca/recuperação determinística de fatos no Memory Service (`MemoryService.search` + `atlas memory search`)

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

`Fase 1 — 1.3 Memory Service — Próximas Fatias — Busca/indexação sobre os fatos armazenados` (`candidato · SPEC direta`, `docs/04-engineering/Roadmap.md` l. 91). **Não** fecha o gate de 1.3 (que é "mais de uma categoria de conhecimento" — memória episódica/de projetos, l. 90); entrega a fatia de busca/recuperação, um candidato independente.

---

# Objetivo

Ao final desta SPEC deve existir, no Memory Service (`@atlas/memory`), uma operação de **recuperação relevante** de fatos: dada uma consulta textual, o serviço devolve os fatos armazenados mais relevantes a ela, ordenados por relevância, por um algoritmo **determinístico** (sem modelo, sem IO). Essa capacidade deve estar exposta ao usuário pela CLI como `atlas memory search "<consulta>"`, permitindo consultar o acervo de memória sem despejar todos os fatos.

Concretamente:

- `MemoryService` ganha um método novo `search(query, options?)` — puro, síncrono, sobre os fatos já carregados em memória (mesmo molde de `list`/`prompt`) — que devolve `readonly Fact[]` ordenado por relevância decrescente.
- A CLI ganha o subcomando `atlas memory search "<consulta>"` (irmão de `memory list` / `memory dedupe`), que só invoca e renderiza.

---

# Motivação

O PRD (seção **Memória**) exige: *"O usuário deve poder consultar, atualizar e remover informações armazenadas"* e *"O sistema deve lembrar informações relevantes entre sessões"*. Hoje o usuário consegue **atualizar** (`remember`), **remover** (`forget`) e **listar** (`memory list`) fatos, mas não consegue **consultar por relevância** — só ver a lista inteira. O Module Catalog (Memory Service) dá a este módulo autoridade explícita sobre **busca**, **indexação** e **recuperação** de memória permanente ("É a única autoridade para armazenamento e recuperação de memória permanente"; "Pode utilizar: indexação; busca").

Além disso, o único caminho de leitura de memória para a geração hoje é `prompt()`, que **despeja todos os fatos** no system prompt (ADR-0011, custo documentado: "Fatos entram no system prompt de toda geração — cresce o prompt conforme a memória cresce. Mitigado pelo escopo mínimo; retenção/seleção/busca são SPECs futuras"). Esta SPEC entrega a primitiva de recuperação relevante que essa nota antecipa como fatia futura, sem ainda rewire do caminho de injeção (ver Fora do Escopo e Decisões de design).

Documento originador: PRD (Memória) + Module Catalog (Memory Service) + Roadmap 1.3 (l. 91) + ADR-0011 (nota de custo).

---

# Referências

- [PRD — seção Memória](../../02-product/ProductRequirementsDocument.md)
- [Module Catalog — Memory Service](../../03-architecture/ModuleCatalog.md)
- [ADR-0011 — Memory Service: persistência por porta injetável e memória injetada na geração](../../06-adr/ADR-0011-memory-service-persistence.md)
- [Roadmap — Fase 1, 1.3 Memory Service — Próximas Fatias](../../04-engineering/Roadmap.md)
- [Glossary](../../00-project/Glossary.md) (Memória × Contexto)
- SPECs anteriores do módulo: [SPEC-0009](SPEC-0009-memory-service.md) (serviço + `remember`/`forget`/`list`/`prompt`), [SPEC-0022](SPEC-0022-deterministic-fact-deduplication.md) (`normalize` interno + dedup em escrita), [SPEC-0023](SPEC-0023-legacy-fact-consolidation-dedupe.md) (`dedupe`, método aditivo + subcomando CLI)

---

# Escopo

- `@atlas/contracts`: adicionar o método `search(query: string, options?: { readonly limit?: number }): readonly Fact[]` à interface `MemoryService` (aditivo — não altera assinatura de `remember`/`forget`/`list`/`prompt`/`dedupe`; `Fact` inalterado).
- `@atlas/memory` (`packages/memory/src/memory-service.ts`): implementar `search` — puro, síncrono, sobre o array `facts` já carregado. **Reusar** o helper `normalize(text)` interno já existente (SPEC-0022; não duplicar) para tokenizar consulta e fato. Algoritmo de ranking determinístico definido nas Decisões de design (overlap de tokens; ordenação estável).
- `apps/cli`: subcomando `atlas memory search "<consulta>"`.
  - `src/gateway/input-gateway.ts`: reconhecer o subcomando `search` de `memory` e capturar a `<consulta>` como argumento posicional (subcomando desconhecido segue erro de uso, agora listando `list`/`dedupe`/`search`).
  - `src/commands/memory.ts`: novo `runMemorySearch(atlas, query, output)` — invoca `atlas.memory.search(query)` e renderiza os fatos recuperados (formato análogo ao de `runMemoryList`); nenhum fato recuperado → mensagem "Nenhum fato relevante encontrado.".
  - `src/run.ts`: despachar `memory search` para `runMemorySearch`; atualizar `HELP_TEXT` com a linha `memory search "<consulta>"`.
- Testes unitários de `search` em `@atlas/memory` e testes de borda do subcomando na CLI (ver Estratégia de Testes).
- Nota de atualização em `ADR-0011` registrando o método de recuperação aditivo (mesmo padrão das notas das SPECs 0022/0023 — **sem ADR novo**).

---

# Fora do Escopo

- **Não** alterar `prompt()` nem o caminho de injeção de memória na geração (`memoryPrompt` provider da SPEC-0021 segue zero-arg, amostrado 1x/turno; o system prompt continua recebendo `prompt()` — dump de todos os fatos). Rewire do Cognitive Core para consumir `search` com a consulta do turno é fatia futura (ver Decisões de design).
- **Não** tornar `search` assíncrono nem tocar a porta `MemoryStorage` (a recuperação opera só sobre os `facts` já carregados; nenhum IO, nenhum `load`/`save`).
- **Não** introduzir indexação persistente, índice invertido, cache ou estrutura de dados nova além da varredura linear de `facts` (YAGNI — acervo é de fatos curtos explícitos).
- **Não** fazer matching semântico, por embeddings, por modelo, nem normalização além de espaço + caixa (sem acento, sem pontuação, sem stemming, sem sinônimos) — coerente com o `normalize` da SPEC-0022.
- **Não** expor scores de relevância no contrato nem na CLI (o ranking é detalhe interno; retorno é `Fact[]` ordenado).
- **Não** implementar `/lembrar`/`/esquecer`/busca ao vivo dentro de uma sessão `chat` aberta.
- **Não** implementar memória episódica, memória de projetos, retenção/classificação/curadoria, ou relações entre informações (demais fatias de 1.3; o gate de 1.3 não é fechado por esta SPEC).
- **Não** paginar, destacar trechos (highlight) nem ordenar por `createdAt`/recência como critério primário (relevância é o critério; ver desempate nas Decisões de design).

---

# Pré-requisitos

- [SPEC-0009](SPEC-0009-memory-service.md) — `Done` (Memory Service + `list`/`prompt`).
- [SPEC-0022](SPEC-0022-deterministic-fact-deduplication.md) — `Done` (helper `normalize` interno reusado).
- [SPEC-0023](SPEC-0023-legacy-fact-consolidation-dedupe.md) — `Done` (padrão de método aditivo em `MemoryService` + subcomando CLI `memory <sub>` que esta SPEC estende).

(Status verificado no `NEXT_CONTEXT.md`: as três estão `Done`.)

---

# Critérios de Aceitação

- `MemoryService.search(query, options?)` existe em `@atlas/contracts` como membro da interface, assinatura `search(query: string, options?: { readonly limit?: number }): readonly Fact[]`.
- `search` é síncrono e não realiza IO (não chama `storage.load`/`storage.save`; verificável por teste com storage fake que falha se `save`/`load` forem chamados após a criação).
- Uma consulta cujos tokens (após `normalize`) aparecem em fatos armazenados devolve **apenas** os fatos com ao menos um token em comum (fatos sem overlap são excluídos), ordenados por número decrescente de tokens de consulta distintos presentes.
- Empate de relevância é desempatado pela **ordem de carga** (índice ascendente em `facts`) — ordenação determinística e estável (teste cobre dois fatos de mesmo score).
- `options.limit` presente limita o resultado aos `N` primeiros já ordenados; ausente devolve todos os fatos com overlap > 0.
- Consulta vazia ou que colapsa para nenhum token após `normalize` devolve `[]`.
- `search` **não muta** `facts` (chamadas repetidas com o mesmo acervo devolvem o mesmo resultado; `list()` inalterado antes/depois).
- `atlas memory search "<consulta>"` imprime os fatos recuperados (id + texto, formato análogo a `memory list`); sem resultado imprime "Nenhum fato relevante encontrado.".
- `atlas memory <sub-desconhecido>` continua erro de uso, listando `list`/`dedupe`/`search`; `HELP_TEXT` inclui `memory search "<consulta>"`.
- `remember`/`forget`/`list`/`prompt`/`dedupe`/`Fact` inalterados em comportamento e assinatura.
- Nota de atualização adicionada ao `ADR-0011` (sem ADR novo).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` verdes; todos os fakes/implementações de `MemoryService` tipados diretamente passam a implementar `search` (typecheck verde).

---

# Arquivos Esperados

```text
packages/contracts/src/memory.ts        (editar: + método search na interface MemoryService)
packages/memory/src/memory-service.ts    (editar: + implementação de search, reusando normalize)
packages/memory/tests/memory-service.test.ts  (editar: + casos de search)
apps/cli/src/gateway/input-gateway.ts    (editar: reconhecer subcomando search + consulta)
apps/cli/src/commands/memory.ts          (editar: + runMemorySearch)
apps/cli/src/run.ts                       (editar: despacho + HELP_TEXT)
apps/cli/tests/…                          (editar: casos de borda do subcomando search)
docs/06-adr/ADR-0011-memory-service-persistence.md  (editar: nota de atualização)
```

Ajustes menores podem surgir (ex.: fake de `MemoryService` em `apps/cli/tests/status.test.ts` ganha `search` para satisfazer o typecheck — padrão recorrente de método novo em interface de contrato).

---

# Componentes Impactados

- Memory Service (`@atlas/memory`)
- Contratos (`@atlas/contracts`)
- CLI (`apps/cli`)

Intactos (diff de produção esperado vazio): `@atlas/cognitive`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`, `@atlas/skills`, `@atlas/core`.

---

# Interfaces Necessárias

- `MemoryService.search(query: string, options?: { readonly limit?: number }): readonly Fact[]` (em `@atlas/contracts`, aditivo).

Nenhuma porta nova; nenhuma interface nova além do método acima. O helper de ranking é função interna a `packages/memory/src/memory-service.ts`, **não** sobe a `@atlas/contracts` (mesmo critério de `normalize`).

---

# Fluxo Esperado

```text
atlas memory search "<consulta>"
        ↓
input-gateway (subcomando search + consulta)
        ↓
run.ts → runMemorySearch(atlas, query, output)
        ↓
atlas.memory.search(query)          (puro, síncrono, sobre facts em memória)
   normalize(query) → tokens
   para cada fact: score = |tokens(query) ∩ tokens(fact)|
   filtra score > 0 → ordena por score desc, desempate por ordem de carga
   aplica limit (se houver)
        ↓
readonly Fact[]  →  render (id + texto) ou "Nenhum fato relevante encontrado."
```

---

# Estratégia de Implementação

1. `@atlas/contracts`: adicionar `search` à interface `MemoryService` (`memory.ts`); rodar `git grep 'MemoryService'` (nome do tipo, não só construtoras) para achar todos os fakes/implementações diretas — atualizá-los. `vitest run` não pega isso; confirmar por `pnpm typecheck`.
2. `@atlas/memory`: implementar `search` reusando `normalize`; helper de tokenização/score interno.
3. Testes unitários de `search` (ranking, desempate, limit, consulta vazia, sem overlap, não-mutação, sem IO).
4. CLI: `input-gateway` (subcomando + consulta), `runMemorySearch`, despacho e `HELP_TEXT` em `run.ts`; testes de borda.
5. Nota de atualização no ADR-0011.
6. Verificação: `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`.

---

# Estratégia de Testes

- **Ranking**: consulta com tokens presentes em vários fatos → ordem por score decrescente; fato com mais tokens de overlap vem antes.
- **Filtragem**: fatos sem token em comum são excluídos do resultado.
- **Desempate**: dois fatos de mesmo score → ordem de carga (índice) preservada, estável e determinística.
- **`limit`**: com `limit: N`, no máximo N resultados; sem `limit`, todos com overlap > 0.
- **Consulta vazia / só espaços / tokens que não casam** → `[]`.
- **Sem IO**: storage fake cujo `save`/`load` lançam se chamados após a criação — `search` não os aciona.
- **Não-mutação**: `list()` idêntico antes e depois de `search`; duas chamadas de `search` iguais devolvem o mesmo resultado.
- **CLI**: `atlas memory search "<consulta>"` renderiza os fatos (fake de `MemoryService`); sem resultado imprime a mensagem específica; subcomando desconhecido segue erro de uso listando `list`/`dedupe`/`search`; `HELP_TEXT` cobre `memory search`.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- testes passando (`pnpm test`), `lint`/`typecheck`/`format:check` verdes;
- documentação específica da SPEC atualizada (o arquivo da SPEC + a nota de atualização do ADR-0011);
- arquitetura preservada (Memory mantém autoridade exclusiva sobre o estado persistente — Artigo 11; a CLI só invoca e renderiza, não toca `storage`/`normalize`);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` raiz e dos packages tocados, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é o passo de fecho `doc-sync`, não escopo do `spec-implementer`.

---

# Restrições

- Não criar módulos, Tools, Skills ou Personas novos.
- Não tornar `search`/`evaluate`/qualquer leitura assíncrona; não tocar a porta `MemoryStorage`.
- Não alterar `prompt()` nem o caminho de injeção na geração.
- Não subir o helper de ranking a `@atlas/contracts`.
- Não expor scores; retorno é `Fact[]` ordenado.
- Manter `remember`/`forget`/`list`/`prompt`/`dedupe`/`Fact` intactos.

---

# Observações

- **Padrão recorrente**: adicionar um método a uma interface de contrato já pública (`MemoryService`) quebra o `typecheck` só dos fakes tipados **diretamente** (esperado: `apps/cli/tests/status.test.ts`); fakes com `as unknown as` escapam do `typecheck` e só quebram em `pnpm test` (SPECs 0017/0019/0022/0023/0025). Grep pelo **nome do tipo** (`MemoryService`), não só pelas construtoras.
- O fundamento de acrescentar o método (não é "promoção de tipo" do ADR-0007) é o mesmo da SPEC-0023: Artigo 11 (autoridade exclusiva da Memory sobre recuperação de conhecimento persistente) + Artigo 5 (a CLI não acessa `normalize`/`storage` internos).

---

# Checklist para IA

Antes de implementar:

- ler ADR-0011, Module Catalog (Memory Service), PRD (Memória);
- compreender que a fatia é recuperação **determinística** sobre `facts` já carregados, sem tocar geração/prompt;
- confirmar dependências (`search` reusa `normalize` da SPEC-0022).

Durante:

- responsabilidade única (Memory recupera; CLI só invoca/renderiza);
- reusar `normalize`, não duplicar;
- manter simplicidade (varredura linear; sem índice).

Após:

- rodar testes + typecheck + lint + format;
- validar critérios;
- registrar lições.

---

# Resultado Esperado

O usuário passa a consultar sua memória por relevância: `atlas memory search "aniversário"` devolve os fatos armazenados que mencionam esse termo, ordenados por relevância, em vez de a lista inteira. O Memory Service ganha a primitiva de recuperação (`search`) — determinística, pura, síncrona, sem IO — que o Module Catalog atribui a ele e que o ADR-0011 antecipava como fatia futura. O caminho de injeção na geração (`prompt()`) permanece inalterado; o consumo de `search` pelo Cognitive Core fica como fatia futura explícita. Nenhum outro módulo muda.

---

# Decisões de design

Registradas em formato de veto (decisão + porquê + alternativa descartada), conforme Emenda v1.1 da Constituição.

### 1. Perfil da SPEC: `completo`

- **Decisão**: classificar como `completo`.
- **Porquê**: a SPEC toca `@atlas/contracts` (novo método em `MemoryService`), o que já exclui o perfil `micro` por definição (Emenda v1.2 / template). Na dúvida, o default seguro é `completo`.
- **Alternativa descartada**: `micro` — falha na condição "não toca `@atlas/contracts`"; a mudança de contrato precisa da confirmação de contrato do reviewer no pipeline completo.

### 2. Novo método `search`, não uma variante de `list`/`prompt`

- **Decisão**: expor a recuperação como método próprio `search(query, options?)` na interface `MemoryService`, aditivo, ao lado de `list`/`prompt`/`dedupe`.
- **Porquê**: o Module Catalog dá a este módulo autoridade sobre "busca"/"recuperação" como responsabilidade distinta de listar; um método dedicado é mais transparente e não sobrecarrega a semântica de `list` (que devolve tudo). Segue o precedente de `dedupe` (SPEC-0023: método aditivo em `MemoryService`).
- **Alternativa descartada**: parametrizar `list(query?)` — sobrecarregaria a semântica de "listar tudo" e mudaria seu contrato; misturar dois conceitos num método é menos modular.

### 3. Ranking determinístico por overlap de tokens, reusando `normalize`

- **Decisão**: `score(fact) = |tokens(query) ∩ tokens(fact)|`, onde `tokens(x) = normalize(x).split(' ')` distintos, reusando o `normalize` interno da SPEC-0022 (trim/lowercase/colapso de espaço); ordenar por `score` desc; excluir `score = 0`.
- **Porquê**: é a forma **mais simples e determinística** de relevância, sem modelo, sem IO, coerente com o critério de igualdade textual já adotado no módulo (Constituição: mais simples, mais transparente, mais sustentável). Reusar `normalize` evita duplicar a definição de "mesmo texto".
- **Alternativa descartada**: matching semântico/embeddings/TF-IDF — exigiria modelo ou índice, acoplamento e complexidade cedo demais para um acervo de fatos curtos (YAGNI); frequência/TF-IDF sobre corpus tão pequeno não agrega e é menos previsível.

### 4. Desempate por ordem de carga (índice), não por `createdAt`

- **Decisão**: empate de `score` é resolvido pelo **índice ascendente** em `facts` (ordem de carga), produzindo ordenação estável.
- **Porquê**: determinismo total e estabilidade sem introduzir um segundo critério de negócio; é o mesmo desempate já usado no `dedupe` (SPEC-0023, "menor índice em `facts`"), mantendo o módulo coerente.
- **Alternativa descartada**: desempatar por `createdAt` (recência) — introduziria "recência" como critério implícito de relevância, uma decisão de retenção/curadoria que é fatia futura explícita de 1.3; fora do escopo desta primitiva.

### 5. `options.limit` opcional; sem `limit` devolve todos os fatos com overlap

- **Decisão**: `options?: { readonly limit?: number }`; ausente → todos os fatos com `score > 0`; presente → os `N` primeiros já ordenados.
- **Porquê**: evita um número mágico de teto arbitrário sobre um acervo pequeno, mas dá ao chamador controle explícito quando quiser (ex.: futuro consumo pelo Cognitive com teto). Mais sustentável que fixar um default oculto.
- **Alternativa descartada**: default fixo (ex.: 5) — arbitrário e opaco sobre um corpus de fatos curtos; esconderia resultados sem o usuário pedir.

### 6. Retorno `readonly Fact[]`, sem expor scores

- **Decisão**: `search` devolve `readonly Fact[]` ordenado, sem o score de cada item.
- **Porquê**: o score é detalhe do algoritmo; expô-lo acoplaria consumidores (CLI, futuro Cognitive) à mecânica de ranking, dificultando trocá-la depois. Retorno homogêneo com `list` facilita reuso de renderização.
- **Alternativa descartada**: `readonly { fact: Fact; score: number }[]` — vaza internos do ranking e amarra o contrato à implementação atual.

### 7. Expor na CLI como `atlas memory search "<consulta>"`

- **Decisão**: adicionar o subcomando `memory search`, irmão de `memory list`/`memory dedupe`.
- **Porquê**: o PRD (Memória) exige que o usuário possa **consultar** informações armazenadas; a CLI é a única interface hoje e o guarda-chuva `memory <sub>` já existe (SPEC-0023). Dá transparência (Artigo 7 do teste da Constituição) sem custo arquitetural.
- **Alternativa descartada**: entregar só o método de contrato sem CLI — deixaria a capacidade inacessível ao usuário nesta fatia, sem cumprir o requisito do PRD de "consultar".

### 8. **Não** rewire do `prompt()`/injeção na geração nesta fatia

- **Decisão**: manter `prompt()` e o provider `memoryPrompt` (SPEC-0021) exatamente como estão; o Cognitive Core continua recebendo o dump de todos os fatos e **não** consome `search` nesta SPEC.
- **Porquê**: tornar a injeção consciente da consulta exigiria threading do input do turno até o `memoryPrompt` (hoje zero-arg) e mudar a composição de `@atlas/cognitive` — uma mudança arquitetural distinta, maior e com suas próprias perguntas (qual é a "consulta"? o input cru? degradação com acervo pequeno? teto?). Fatiar a primitiva de recuperação separadamente é mais modular e mantém cada corte pequeno e verificável — o mesmo padrão de fatiamento fino que o módulo seguiu em 0021/0022/0023. A primitiva precisa existir e ser validada antes de ser consumida.
- **Alternativa descartada**: já fazer o Cognitive selecionar fatos por relevância a cada turno — dobraria o escopo, mudaria o laço cognitivo e a assinatura de `memoryPrompt`, e arriscaria regressão no caminho de geração para um ganho que só importa quando o acervo é grande; contraria a disciplina de escopo (só o que o PRD/pedido exige).

### 9. Prioridade `Medium`

- **Decisão**: prioridade `Medium`.
- **Porquê**: cumpre um requisito do PRD (consultar memória) e é o candidato de busca do Roadmap 1.3, entregando valor ao usuário; mas **não** fecha o gate de 1.3 (memória episódica/de projetos, l. 90) nem desbloqueia outra fatia — não é `High`/`Critical`; é mais que um resíduo cosmético — não é `Low`.
- **Alternativa descartada**: `High` — superestimaria; a fatia é um candidato independente, não o gate da fase.
