# Implementation Specification

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0029

---

**Título**

Categorias de conhecimento no Memory Service: memória episódica e memória de projetos

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

(Perfil confirmado pelo `architecture-reviewer` no gate.)

---

**Item do Roadmap**

`Fase 1 — 1.3 Memory Service — Próximas Fatias — Memória episódica e memória de projetos (hoje só fatos/preferências explícitos)` (`gate · SPEC direta`, `docs/04-engineering/Roadmap.md` l. 90).

É o **último gate aberto da Fase 1**: o Critério de Conclusão da Fase 1 (l. 126) exige "A Memory Service cobre mais de uma categoria de conhecimento, não só fatos explícitos". Os demais gates (1.1, 1.2, 1.4) já estão fechados.

---

# Objetivo

Ao final desta SPEC, o Memory Service (`@atlas/memory`) deixa de tratar todo conhecimento persistente como uma lista homogênea de fatos/preferências e passa a **classificar cada registro em uma categoria de conhecimento**, cobrindo três das categorias que o Module Catalog atribui ao módulo: **fatos/preferências** (a atual), **memória episódica** (algo que aconteceu, registrado no momento em que aconteceu) e **memória de projetos** (conhecimento vinculado a um projeto nomeado).

Concretamente, quando esta SPEC estiver concluída:

- `Fact` carrega uma categoria opcional (`category?`) e, para a categoria de projeto, o projeto ao qual pertence (`subject?`) — ambos **aditivos**; registros legados sem os campos continuam válidos e são lidos como fatos.
- `remember` aceita a categoria (e o projeto) no ato da gravação, sem quebrar nenhum chamador atual, e **recusa** combinações inválidas (memória de projeto sem projeto; projeto em categoria que não é de projeto) — a garantia vive no módulo, não na borda.
- A recuperação distingue categorias: `list` pode filtrar por categoria e `prompt()` compõe o texto injetado na geração **agrupado por categoria**, com enquadramento próprio para cada uma — é o que faz a categoria existir no comportamento, não só como rótulo.
- A deduplicação determinística (SPECs 0022/0023) passa a considerar categoria e projeto, de modo que o mesmo texto em categorias diferentes não colapse.
- O usuário alcança tudo isso pela CLI: `atlas remember "<texto>" --category <c> [--subject <projeto>]` e `atlas memory list [--category <c>]`.

---

# Motivação

O PRD (seção **Memória**) exige que o sistema "armazene preferências do usuário" e "lembre informações relevantes entre sessões", e que o usuário possa "consultar, atualizar e remover informações armazenadas". O Module Catalog (Memory Service, "Deve gerenciar") atribui a este módulo, explicitamente, seis categorias: *preferências; fatos persistentes; **memória de projetos**; **memória episódica**; histórico relevante; relações entre informações*. Hoje o módulo cobre **apenas a primeira dupla** — `Fact = { id, text, createdAt, source? }`, uma lista plana (SPEC-0009, limitação registrada no `CLAUDE.md` do package: "Sem episódica/projetos/classificação/retenção/relações — SPECs futuras").

Essa homogeneidade tem consequência prática já visível: `prompt()` despeja **todos** os registros sob uma única moldura ("O usuário pediu para você lembrar os seguintes fatos e preferências:"), então um episódio ("ontem quebrei o build ao renomear `Fact`") e uma preferência ("prefiro respostas curtas") chegam ao modelo indistinguíveis — a Persona não tem como tratá-los de modo diferente, e o aprendizado (SPEC-0020) só sabe produzir "fatos".

O Roadmap marca este item como o **gate remanescente da Fase 1** (l. 90) e o Critério de Conclusão da fase (l. 126) o formula como "mais de uma categoria de conhecimento, não só fatos explícitos". Rota de processo declarada no Roadmap: `SPEC direta` — não exige ADR novo.

Documento originador: PRD (Memória) + Module Catalog (Memory Service, "Deve gerenciar") + Roadmap 1.3 (l. 90, gate) + ADR-0011.

---

# Referências

- [PRD — seção Memória](../../02-product/ProductRequirementsDocument.md)
- [Module Catalog — Memory Service](../../03-architecture/ModuleCatalog.md) ("Deve gerenciar": preferências, fatos persistentes, memória de projetos, memória episódica)
- [ADR-0011 — Memory Service: persistência por porta injetável e memória injetada na geração](../../06-adr/ADR-0011-memory-service-persistence.md)
- [ADR-0009 — Context Service como value store](../../06-adr/ADR-0009-context-service-value-store.md) (fronteira Memória × Contexto; contexto de ambiente fora de escopo)
- [ADR-0016 — Aprendizado: extração proposta pelo Cognitive](../../06-adr/ADR-0016-learning-proposed-extraction.md) (proveniência `source`)
- [Glossary](../../00-project/Glossary.md) (Memória × Contexto)
- [Roadmap — Fase 1, 1.3 e Critério de Conclusão da Fase 1](../../04-engineering/Roadmap.md)
- SPECs anteriores do módulo: [SPEC-0009](SPEC-0009-memory-service.md), [SPEC-0020](SPEC-0020-learning-post-turn-extraction.md), [SPEC-0021](SPEC-0021-live-memory-prompt-recomposition.md), [SPEC-0022](SPEC-0022-deterministic-fact-deduplication.md), [SPEC-0023](SPEC-0023-legacy-fact-consolidation-dedupe.md), [SPEC-0027](SPEC-0027-memory-fact-retrieval.md)

---

# Escopo

## `@atlas/contracts` (`packages/contracts/src/memory.ts`)

- Novo tipo exportado `MemoryCategory = 'fact' | 'episode' | 'project'`.
- `Fact` ganha dois campos **opcionais**: `readonly category?: MemoryCategory` e `readonly subject?: string` (`Fact` existente inalterado nos demais campos; ausência de `category` ≡ `'fact'`).
- `MemoryService.remember` ganha um **terceiro parâmetro opcional**: `remember(text: string, source?: 'user' | 'learned', options?: { readonly category?: MemoryCategory; readonly subject?: string }): Promise<{ fact: Fact; created: boolean }>` — retorno e os dois primeiros parâmetros inalterados.
- `MemoryService.list` ganha um **parâmetro opcional**: `list(options?: { readonly category?: MemoryCategory }): readonly Fact[]` — sem argumento, comportamento idêntico ao atual (todos os registros, ordem de carga).
- `forget`/`prompt`/`dedupe`/`search`: assinaturas inalteradas.

## `@atlas/memory` (`packages/memory/src/memory-service.ts`)

- **Invariante do modelo persistido (autoridade do módulo, Artigo 11)** — `remember` **rejeita**, lançando `MemoryError` (classe já existente em `packages/memory/src/errors.ts`), antes de qualquer mutação ou `storage.save`:
  - `category: 'project'` sem `subject`, ou com `subject` que colapsa para vazio após `normalize` (`''`, `'   '`, `'\t\n'`);
  - `subject` informado (não-vazio após `normalize`) com `category` diferente de `'project'` (inclusive `category` ausente).
  - A validação ocorre no módulo mesmo quando o chamador é a CLI — a borda apenas antecipa o erro com mensagem amigável (`CliUsageError`).
- `remember`: grava `category`/`subject` quando informados; default de categoria `'fact'` (gravado explicitamente no `Fact` novo).
- **Chave de duplicata** (reusando o mesmo `normalize` interno da SPEC-0022, sem duplicá-lo): passa de `normalize(text)` para a tupla `categoria + subject + texto` normalizados (detalhe nas Decisões de design). Aplicada tanto em `remember` quanto em `dedupe`.
- `list(options?)`: filtro por categoria, tratando `category` ausente como `'fact'`.
- `prompt()`: composição **agrupada por categoria**, ordem fixa `fact` → `project` → `episode`, cada grupo com sua moldura textual própria e formato literal fixado nas Decisões de design (D8); grupos vazios omitidos; a moldura e o formato do grupo `fact` permanecem **literalmente** os atuais (nenhuma regressão quando só há fatos).
- `dedupe`: agrupa pela nova chave; sobrevivente/desempate/`apply` inalterados; sobrevivente segue preservado intacto (sem merge, sem promover `source`/`category`).
- `search`: inalterado em assinatura e comportamento (varre todas as categorias).

## `apps/cli`

- `src/gateway/input-gateway.ts`: novas flags `--category <fact|episode|project>` e `--subject <projeto>`; validação de uso (valores aceitos, combinações válidas, `subject` em branco — ver Critérios de Aceitação); `ParsedInput` ganha `factCategory?`/`factSubject?` e `listCategory?`.
- `src/commands/remember.ts`: repassar categoria/projeto a `atlas.memory.remember`.
- `src/commands/memory.ts`: `runMemoryList` aceita filtro de categoria e passa a exibir a categoria (e o projeto, quando houver) de cada registro.
- `src/run.ts`: despacho dos novos campos + `HELP_TEXT` documentando as flags.

## Documentação da própria SPEC

- Nota de atualização em `ADR-0011` registrando a categorização (mesmo padrão das notas das SPECs 0021/0022/0023/0027 — **sem ADR novo**).

## Testes

- Unitários em `@atlas/memory` e de borda na CLI (ver Estratégia de Testes).

---

# Fora do Escopo

- **Não** criar módulo, package, Tool, Skill ou Persona nova; **não** mover responsabilidade entre módulos.
- **Não** implementar as demais categorias do Module Catalog nesta fatia: "histórico relevante" e "relações entre informações" (esta última é candidato próprio do Roadmap 1.3, l. 93).
- **Não** implementar retenção, expiração, classificação automática ou peso/prazo de validade por categoria (candidato próprio, Roadmap 1.3 l. 92).
- **Não** fazer o Cognitive/Learner (SPEC-0020) classificar categorias: os fatos propostos pelo aprendizado continuam gravados como `'fact'`, com `source: 'learned'`. Extrair episódios automaticamente é fatia futura.
- **Não** alterar o caminho de injeção na geração além do **conteúdo** de `prompt()`: o provider `memoryPrompt` (SPEC-0021) segue zero-arg, amostrado 1x/turno; nenhuma mudança em `@atlas/cognitive`, `@atlas/core` ou nos contratos do ciclo cognitivo.
- **Não** filtrar `prompt()` por relevância/categoria por turno nem consumir `search` na geração (fatia futura explícita, Decisão 8 da SPEC-0027).
- **Não** adicionar filtro por categoria a `search` nem alterar a renderização de `atlas memory search` (a assimetria com `memory list` é observação consciente do `architecture-reviewer`, deixada fora desta fatia).
- **Não** capturar contexto de ambiente automaticamente (cwd, repositório, branch, arquivos abertos) para inferir o projeto — isso é o candidato `ADR primeiro` de 1.4 (l. 101) e está fora de escopo desde o ADR-0009. O projeto é **informado pelo usuário** (`--subject`).
- **Não** transformar memória episódica em histórico de conversa: episódios são registros explícitos e curtos; a conversa por sessão continua sendo do Context Service (Artigo 11 / ADR-0009 / Glossary).
- **Não** adicionar campo de data do acontecimento (`occurredAt`) distinto de `createdAt`, nem linha do tempo/ordenação cronológica por categoria.
- **Não** alterar o formato do arquivo de storage além do que os campos opcionais novos implicam (segue `{ facts: [...] }`, mesma porta `MemoryStorage`, load-once + write-through); **não** migrar, reescrever nem mutar registros legados no `load`; **não** validar retroativamente o acervo carregado (a invariante nova rege escritas novas, como a garantia da SPEC-0022 regeu).
- **Não** alterar `search`, `forget`, `dedupe --apply` (semântica), `Fact.id`/`createdAt`/`source`, nem tornar qualquer leitura assíncrona.
- **Não** criar subcomandos de CLI novos além das flags descritas (nada de `atlas episode`/`atlas project`).
- **Não** implementar `/lembrar`/`/esquecer` ao vivo em sessão `chat` aberta (candidato próprio, Roadmap 1.3 l. 95).

---

# Pré-requisitos

- [SPEC-0009](SPEC-0009-memory-service.md) — `Done` (Memory Service, `Fact`, `remember`/`forget`/`list`/`prompt`).
- [SPEC-0020](SPEC-0020-learning-post-turn-extraction.md) — `Done` (proveniência `source`, gravação pela borda).
- [SPEC-0022](SPEC-0022-deterministic-fact-deduplication.md) — `Done` (helper `normalize` interno + dedup em escrita, chave que esta SPEC estende).
- [SPEC-0023](SPEC-0023-legacy-fact-consolidation-dedupe.md) — `Done` (`dedupe` + guarda-chuva `atlas memory <sub>`).
- [SPEC-0027](SPEC-0027-memory-fact-retrieval.md) — `Done` (`search`; precisa continuar verde após a mudança de `Fact`).

Status verificado em `docs/05-context/NEXT_CONTEXT.md` e no histórico de commits (SPECs 0002–0028 concluídas; a última fechada foi a SPEC-0028).

---

# Critérios de Aceitação

## Contratos

- `MemoryCategory = 'fact' | 'episode' | 'project'` exportado por `@atlas/contracts`.
- `Fact` possui `category?: MemoryCategory` e `subject?: string`, **ambos opcionais** — um objeto `Fact` construído sem eles continua compilando (verificável por `pnpm typecheck`).
- `remember(text)`, `remember(text, 'learned')` e `list()` continuam válidos sem alteração de chamada em todo o repositório (parâmetros novos opcionais).

## Gravação

- `remember(texto, source, { category: 'episode' })` cria um `Fact` com `category === 'episode'`.
- `remember(texto, source, { category: 'project', subject: 'atlas' })` cria um `Fact` com `category === 'project'` e `subject === 'atlas'`.
- `remember(texto)` sem `options` cria um `Fact` com `category === 'fact'` e sem `subject`.
- Gravar o **mesmo texto** em categorias diferentes cria **dois** registros distintos (`created: true` nas duas chamadas).
- Gravar o mesmo texto na mesma categoria (e, para `'project'`, no mesmo `subject`, comparado por `normalize`) é **no-op idempotente**: `created: false`, nenhum `Fact` novo, nenhum `storage.save`, `category`/`subject`/`source` do existente não são promovidos nem alterados.
- Gravar o mesmo texto na categoria `'project'` com `subject` diferente cria **dois** registros.
- Um registro legado sem `category` é tratado como `'fact'` para efeito de duplicata: `remember(mesmoTexto)` sobre ele segue no-op (`created: false`), preservando o comportamento da SPEC-0022.

## Invariante do modelo persistido (garantida pelo módulo, não pela borda)

- `remember(texto, source, { category: 'project' })` **sem** `subject` rejeita com `MemoryError`.
- `remember(texto, source, { category: 'project', subject: '' })` e `{ ..., subject: '   ' }` (qualquer valor que colapse para vazio após `normalize`) rejeitam com `MemoryError`.
- `remember(texto, source, { subject: 'atlas' })` sem `category`, e `{ category: 'fact' | 'episode', subject: 'atlas' }`, rejeitam com `MemoryError`.
- Em qualquer rejeição acima: nenhum `Fact` é criado, `storage.save` **não** é chamado e `list()` fica inalterado (verificável com storage fake que registra chamadas).
- As rejeições valem para **qualquer chamador** da API pública (o teste chama `memory.remember` direto, sem passar pela CLI).
- O acervo já persistido **não** é revalidado no `load` (registros legados carregam normalmente; a invariante rege escritas novas).

## Leitura

- `list()` sem argumento devolve **todos** os registros na ordem de carga — resultado idêntico ao comportamento anterior a esta SPEC.
- `list({ category: 'episode' })` devolve apenas os registros dessa categoria, preservando a ordem de carga.
- `list({ category: 'fact' })` inclui registros legados sem `category`.
- `prompt()` com apenas registros de categoria `fact` (ou legados sem `category`) produz **exatamente a mesma string** de antes desta SPEC (teste de não-regressão com string literal).
- `prompt()` com registros de mais de uma categoria produz as seções na ordem fixa `fact` → `project` → `episode`, separadas por uma linha em branco (`\n\n`), com as molduras e o formato literais fixados na Decisão 8; seções de categorias sem registros são omitidas.
- Na seção `project`, os registros são **agrupados por `subject`**, com um subcabeçalho por projeto no formato `[projeto <subject>]` (o `subject` exibido é o texto original gravado, não o normalizado); a ordem entre projetos é a da **primeira ocorrência** de cada `subject` na ordem de carga, e dentro de cada projeto vale a ordem de carga. Dois registros do mesmo `subject` aparecem sob um único subcabeçalho.
- `prompt()` sem nenhum registro segue devolvendo `undefined`.
- `search(query)` continua varrendo todas as categorias e mantém ranking/desempate/`limit` da SPEC-0027 (testes existentes verdes sem alteração de expectativa).

## Deduplicação do acervo

- `dedupe()` (dry-run) **não** agrupa registros de categorias diferentes (ou de `subject` diferentes) com o mesmo texto.
- `dedupe()` sobre um acervo só de fatos produz o mesmo relatório de antes desta SPEC (não-regressão).
- `dedupe({ apply: true })` mantém sobrevivente por menor `createdAt`, desempate por ordem de carga, sem merge de campos e sem alterar `category`/`subject`/`source` do sobrevivente.

## CLI

- `atlas remember "<texto>" --category episode` grava um episódio; a saída de sucesso segue o formato atual (`💡 lembrado:` só quando `created` é `true`).
- `atlas remember "<texto>" --category project --subject atlas` grava memória de projeto.
- `atlas remember "<texto>" --category project` **sem** `--subject` é `CliUsageError`, com mensagem indicando que a categoria `project` exige `--subject`.
- `atlas remember "<texto>" --category project --subject ""` e `--subject "   "` são `CliUsageError` (projeto em branco não é repassado ao módulo).
- `--subject` combinado com categoria diferente de `project` (ou sem `--category`) é `CliUsageError`.
- `--category <valor-desconhecido>` é `CliUsageError`, listando os valores aceitos (`fact|episode|project`).
- `atlas memory list` lista todos os registros exibindo a categoria de cada um (e o projeto, quando houver).
- `atlas memory list --category project` lista apenas memória de projeto; sem resultados, imprime a mensagem de acervo vazio já usada por `memory list`.
- `HELP_TEXT` documenta `--category` e `--subject` e o filtro de `memory list`.
- `atlas memory <sub-desconhecido>` continua erro de uso listando `list|dedupe|search`.

## Processo

- Nota de atualização adicionada ao `ADR-0011` (sem ADR novo, sem emenda à Constituição, sem módulo novo).
- Todos os fakes/implementações de `MemoryService` tipados diretamente continuam compilando (grep pelo **nome do tipo** `MemoryService`, não só pelas construtoras).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` verdes; nenhum teste existente removido ou enfraquecido.

---

# Arquivos Esperados

```text
packages/contracts/src/memory.ts               (editar: + MemoryCategory, + Fact.category/subject, + params opcionais)
packages/memory/src/memory-service.ts          (editar: invariante + chave de duplicata, remember, list, prompt, dedupe)
packages/memory/tests/memory-service.test.ts   (editar: casos das categorias + rejeições)
apps/cli/src/gateway/input-gateway.ts          (editar: flags --category/--subject + validação)
apps/cli/src/commands/remember.ts              (editar: repassar categoria/projeto)
apps/cli/src/commands/memory.ts                (editar: filtro + exibição de categoria)
apps/cli/src/run.ts                            (editar: despacho + HELP_TEXT)
apps/cli/tests/…                               (editar: casos de borda das flags)
docs/06-adr/ADR-0011-memory-service-persistence.md (editar: nota de atualização)
```

Ajustes menores podem surgir (ex.: fakes de `MemoryService` em `apps/cli/tests/` — aqui os parâmetros novos são **opcionais**, então a cascata da SPEC-0023/0025 não deve se repetir; confirmar por `pnpm typecheck`). `packages/memory/src/errors.ts` já exporta `MemoryError` — não criar classe de erro nova.

---

# Componentes Impactados

- Memory Service (`@atlas/memory`)
- Contratos (`@atlas/contracts`)
- CLI (`apps/cli`) — Input Gateway, comandos `remember` e `memory list`

Intactos (diff de produção esperado vazio): `@atlas/cognitive`, `@atlas/core`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`, `@atlas/skills`.

---

# Interfaces Necessárias

- `MemoryCategory = 'fact' | 'episode' | 'project'` (`@atlas/contracts`).
- `Fact` estendido: `readonly category?: MemoryCategory`, `readonly subject?: string`.
- `MemoryService.remember(text: string, source?: 'user' | 'learned', options?: { readonly category?: MemoryCategory; readonly subject?: string }): Promise<{ fact: Fact; created: boolean }>`.
- `MemoryService.list(options?: { readonly category?: MemoryCategory }): readonly Fact[]`.

Nenhuma porta nova. Nenhum tipo de erro novo (`MemoryError` já existe). Os helpers de validação da invariante, de chave de duplicata e de composição de `prompt()` são internos a `packages/memory/src/memory-service.ts` e **não** sobem a `@atlas/contracts` (mesmo critério de `normalize`).

---

# Fluxo Esperado

```text
atlas remember "quebrei o build ao renomear Fact" --category episode
        ↓
input-gateway (valida --category/--subject → CliUsageError amigável) → run.ts → runRemember
        ↓
atlas.memory.remember(texto, 'user', { category: 'episode' })
   invariante do modelo (autoridade da Memory):
     project sem subject (ou subject em branco) → MemoryError
     subject com categoria ≠ project            → MemoryError
   chave = normalize(categoria) + sep + normalize(subject ?? '') + sep + normalize(texto)
   duplicata? → no-op idempotente | novo Fact + storage.save
        ↓
"💡 lembrado: …"

--- leitura ---

geração de um turno
        ↓
memoryPrompt() → memory.prompt()
        ↓
agrupa registros por categoria (fact → project → episode), seções unidas por linha em branco
   seção fact:    moldura atual, inalterada
   seção project: subcabeçalho [projeto <subject>] por projeto, ordem de 1ª ocorrência
   seção episode: moldura própria
        ↓
system prompt: identidade (Persona) → memória (por categoria) → tarefa
```

---

# Estratégia de Implementação

1. `@atlas/contracts`: `MemoryCategory`, campos opcionais de `Fact`, parâmetros opcionais de `remember`/`list`. Rodar `git grep 'MemoryService'` e `git grep '\.remember('`/`'\.list()'` para mapear consumidores; confirmar por `pnpm typecheck` que nada quebrou (os acréscimos são opcionais).
2. `@atlas/memory`: helper interno de validação da invariante (`project` ⇔ `subject` não-vazio após `normalize`), lançando `MemoryError` **antes** de qualquer mutação; testes primeiro.
3. `@atlas/memory`: extrair a chave de duplicata para um helper interno (`dedupeKey({ text, category, subject })`) reusando `normalize`; aplicar em `remember` e `dedupe`.
4. `@atlas/memory`: `remember` grava `category`/`subject`; `list(options?)` filtra; `prompt()` agrupa por categoria (helper interno de composição, formato literal da D8).
5. Testes unitários do módulo, incluindo os de **não-regressão** com string literal de `prompt()` e do relatório de `dedupe` só com fatos.
6. CLI: flags + validação no `input-gateway` (inclusive `subject` em branco), repasse em `remember.ts`, filtro/exibição em `memory.ts`, despacho e `HELP_TEXT` em `run.ts`; testes de borda.
7. Nota de atualização no `ADR-0011`.
8. Verificação: `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`.

---

# Estratégia de Testes

- **Gravação por categoria**: `episode` e `project` (com `subject`) persistem os campos; `remember(texto)` sem opções resulta em `category: 'fact'` sem `subject`.
- **Invariante no módulo**: `project` sem `subject`; `project` com `subject` `''`/`'   '`; `subject` com `category: 'fact'`/`'episode'`/ausente — todos rejeitam com `MemoryError`, sem `storage.save` e sem alterar `list()`. Chamada direta à API pública, sem CLI.
- **Duplicata cruzada**: mesmo texto em `fact` × `episode` → dois registros; mesmo texto/categoria/`subject` → `created: false`, `storage.save` não chamado; mesmo texto em `project` com `subject` distintos → dois registros; `subject` diferindo só em caixa/espaço → duplicata.
- **Legado**: acervo carregado com registros sem `category` → tratados como `'fact'` em `list({ category: 'fact' })`, em `remember` (no-op) e em `dedupe`; acervo legado carrega sem revalidação.
- **`list`**: sem argumento devolve tudo na ordem de carga; com filtro devolve só a categoria pedida; filtro sem correspondência devolve `[]`.
- **`prompt()`**: não-regressão com string literal quando só há fatos; string literal completa com as três categorias (ordem das seções, separador, subcabeçalhos de projeto); dois registros do mesmo `subject` sob um subcabeçalho só; ordem entre `subject`s por primeira ocorrência; omissão de seções vazias; `undefined` com acervo vazio.
- **`dedupe`**: dry-run não agrupa categorias diferentes; relatório inalterado num acervo só de fatos; `apply: true` preserva sobrevivente intacto (inclusive `category`/`subject`).
- **`search`**: suíte existente da SPEC-0027 permanece verde sem alteração de expectativa; um caso adicional confirma que a busca atravessa categorias.
- **Sem IO**: `list`/`prompt`/`search` seguem sem tocar `storage` (fake que lança em `load`/`save` após a criação).
- **CLI**: `--category episode`; `--category project --subject atlas`; `--category project` sem `--subject` → `CliUsageError`; `--subject ""`/`--subject "   "` → `CliUsageError`; `--subject` sem `--category project` → `CliUsageError`; `--category bogus` → `CliUsageError` com valores aceitos; `memory list --category project` renderiza só a categoria; `memory list` exibe categoria/projeto; `HELP_TEXT` cobre as flags.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- testes passando (`pnpm test`), `lint`/`typecheck`/`format:check` verdes;
- documentação específica da SPEC atualizada (o arquivo da SPEC + a nota de atualização do ADR-0011);
- arquitetura preservada (Memory mantém autoridade exclusiva sobre o estado persistente e sobre as invariantes do modelo — Artigo 11; a CLI só valida entrada, invoca e renderiza, sem tocar `storage`/`normalize`; Memória × Contexto seguem distintos);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` raiz e dos packages tocados, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md` — incluindo a marcação do gate de 1.3 e do Critério de Conclusão da Fase 1) é o passo de fecho `doc-sync`, não escopo do `spec-implementer`.

---

# Restrições

- Não criar módulos, packages, Tools, Skills ou Personas; não mover responsabilidade entre módulos.
- Toda mudança de contrato deve ser **aditiva/opcional** — nenhum chamador atual de `remember`/`list` pode precisar mudar.
- A invariante de categoria/projeto é do módulo; a CLI pode antecipá-la com mensagem amigável, mas **não** pode ser a única guarda.
- Não migrar nem mutar o acervo existente no `load`; registros legados permanecem exatamente como estão no disco até serem reescritos por uma operação já existente (`remember` novo, `forget`, `dedupe --apply`).
- Não duplicar `normalize`; a chave de duplicata e a validação de `subject` devem reusá-lo.
- Não subir helpers internos (validação, chave de duplicata, composição de `prompt()`) a `@atlas/contracts`; não criar classe de erro nova.
- Não tornar nenhuma leitura assíncrona; não tocar a porta `MemoryStorage`.
- Não alterar `@atlas/cognitive`/`@atlas/core`: o contrato do `memoryPrompt` permanece `() => string | undefined`.
- Não inferir categoria nem projeto automaticamente (nem pelo modelo, nem pelo ambiente).

---

# Observações

- **Padrão recorrente (6+ ocorrências)**: membro **obrigatório** novo numa interface de contrato quebra o `typecheck` dos fakes tipados diretamente (`apps/cli/tests/status.test.ts`), enquanto fakes com `as unknown as` só quebram em `pnpm test`. Esta SPEC é desenhada para **não** disparar a cascata (tudo opcional — mesmo efeito observado na SPEC-0026 com `Plan.skillId?`), mas o grep pelo nome do tipo (`MemoryService`, `Fact`) segue obrigatório antes de dar por encerrado.
- O ponto de atenção real desta SPEC é a **não-regressão de `prompt()`**: como o texto vai para o system prompt de toda geração, a seção de fatos deve permanecer byte a byte igual quando não há outras categorias — daí o critério com string literal.
- Fronteira Memória × Contexto: memória episódica **não** é o histórico de conversa por sessão (`@atlas/context`, ADR-0009). Um episódio só existe se alguém pedir explicitamente para lembrá-lo.
- **Histórico de revisão**: 1º veto do `architecture-reviewer` (Perfil `completo` confirmado; D1/D3/D5/D7/D10/D12/D13 e o princípio da D8 aprovados). Corrigidos os três achados bloqueantes: **F1** — invariante movida para dentro do `@atlas/memory` (D11 reescrita); **F2** — `subject` em branco coberto como erro (D15 nova); **F3** — formato e ordem determinística da seção `project` de `prompt()` fixados literalmente (D8 reescrita). A assimetria de renderização entre `memory search` e `memory list` e o filtro por categoria em `search` ficaram explicitamente fora de escopo, por observação do próprio reviewer.

---

# Checklist para IA

Antes de implementar:

- ler ADR-0011, Module Catalog (Memory Service — "Deve gerenciar"), PRD (Memória), Glossary (Memória × Contexto);
- compreender que a fatia é **classificação** de conhecimento persistente, não captura automática nem novo caminho de injeção;
- compreender que a invariante "memória de projeto exige projeto" é do módulo, não da CLI;
- confirmar que todos os pré-requisitos estão `Done`.

Durante:

- manter tudo aditivo/opcional;
- reusar `normalize` e `MemoryError`, não duplicar;
- responsabilidade única (Memory classifica, valida e recupera; CLI antecipa o erro, invoca e renderiza);
- manter simplicidade (uma lista, um arquivo, um conjunto de operações).

Após:

- rodar `lint`/`typecheck`/`test`/`format:check`;
- validar cada Critério de Aceitação;
- registrar lições aprendidas.

---

# Resultado Esperado

O Atlas passa a distinguir **o que o usuário é/prefere** (fatos e preferências), **o que aconteceu** (episódios) e **o que vale sobre cada projeto** (memória de projetos), com uma única autoridade persistente, um único arquivo de storage e as invariantes desse modelo garantidas dentro do próprio Memory Service — de modo que uma segunda interface (Fase 2, `apps/desktop`) consuma o contrato sem reimplementar validação nem gravar registros ambíguos. O usuário grava cada tipo pela CLI (`atlas remember "..." --category episode`, `--category project --subject atlas`) e consulta por categoria (`atlas memory list --category project`); a memória chega à geração agrupada e enquadrada por categoria, de modo que a Persona possa tratá-las diferentemente sem que nada disso vaze como arquitetura para o usuário.

Com isso, o Memory Service cobre **mais de uma categoria de conhecimento**, fechando o último gate aberto da Fase 1 do Roadmap (item 1.3, l. 90; critério de conclusão da fase, l. 126). Nenhum outro módulo muda, nenhum contrato existente quebra, e as garantias determinísticas de deduplicação e busca (SPECs 0022/0023/0027) continuam valendo, agora conscientes da categoria.

---

# Decisões de design

Registradas em formato de veto (decisão + porquê + alternativa descartada), conforme Emenda v1.1 da Constituição.

### 1. Sem ADR novo — nota de atualização no ADR-0011

- **Decisão**: consumir o ADR-0011 por **nota de atualização**, como fizeram as SPECs 0021/0022/0023/0027, sem abrir ADR novo e sem escalar.
- **Porquê**: nenhuma fronteira estrutural é revisitada — a porta `MemoryStorage`, o load-once + write-through, a autoridade exclusiva da Memory (Artigo 11) e a injeção de memória na geração permanecem exatamente como o ADR-0011 decidiu; as categorias já são responsabilidade **documentada** do módulo no Module Catalog ("Deve gerenciar: … memória de projetos; memória episódica"), e o Roadmap marca o item como `SPEC direta` (l. 90).
- **Alternativa descartada**: abrir um ADR de "modelo de categorias de memória" — seria escalação humana obrigatória (Emenda v1.1) para uma decisão que a documentação oficial já determina; criaria um ADR sem decisão inédita a registrar.

### 2. Perfil da SPEC: `completo`

- **Decisão**: classificar como `completo`.
- **Porquê**: a SPEC toca `@atlas/contracts` (`MemoryCategory`, campos de `Fact`, parâmetros de `remember`/`list`), o que já exclui `micro` por definição (Emenda v1.2 / template); além disso, é o gate de fase — merece o pipeline completo com validador separado.
- **Alternativa descartada**: `micro` — falha na condição "não toca `@atlas/contracts`"; na dúvida, o default seguro é `completo`.

### 3. Um único tipo de registro com discriminador, não tipos/coleções separadas

- **Decisão**: manter **um** tipo (`Fact`), **uma** lista, **um** arquivo e **um** conjunto de operações, acrescentando `category?: MemoryCategory` (e `subject?` para projetos).
- **Porquê**: é a forma mais simples e sustentável de cumprir "mais de uma categoria" (teste da Constituição) — `forget`, `dedupe`, `search` e a porta de storage continuam valendo para todas as categorias sem triplicar API nem lógica; nenhum consumidor existente precisa mudar. O Module Catalog pede categorias de conhecimento, não coleções separadas.
- **Alternativa descartada**: tipos e coleções próprias (`Episode`, `ProjectNote`, com `rememberEpisode`/`listEpisodes`/…) — triplicaria a superfície pública, exigiria repetir dedupe/busca por coleção e mudaria o formato do storage, sem ganho perceptível para registros que são todos "texto curto com data".

### 4. Três categorias nesta fatia: `fact`, `episode`, `project`

- **Decisão**: `MemoryCategory = 'fact' | 'episode' | 'project'` — as duas categorias nomeadas pelo gate mais a atual.
- **Porquê**: são exatamente as categorias que o item 1.3 (l. 90) nomeia como gate; "histórico relevante" e "relações entre informações" têm candidato próprio no mesmo item (l. 93) e ampliariam o escopo sem fechar nada a mais.
- **Alternativa descartada**: modelar já as seis categorias do Module Catalog — expandiria a SPEC ("já que estamos mexendo aqui") e, no caso de "relações", exigiria um modelo de grafo que é decisão arquitetural própria.

### 5. Categoria opcional com default `'fact'`, em vez de campo obrigatório

- **Decisão**: `category?` opcional; ausência ≡ `'fact'` em toda a lógica (duplicata, filtro, `prompt`).
- **Porquê**: preserva o acervo legado no disco sem migração e mantém a mudança de contrato aditiva — o único padrão que, comprovadamente (SPEC-0026), não dispara a cascata de quebra de fakes tipados. Escritas novas gravam a categoria explicitamente, então o acervo converge naturalmente.
- **Alternativa descartada**: `category` obrigatório com migração no `load` — mutaria memória do usuário na leitura (o ADR-0011 já rejeitou descartar/alterar memória silenciosamente) e quebraria todo implementador de `MemoryService`.

### 6. Terceiro parâmetro opcional em `remember`, em vez de método novo ou objeto de opções

- **Decisão**: `remember(text, source?, options?: { category?, subject? })`.
- **Porquê**: mantém `remember` como **o** caminho de gravação (autoridade única, Artigo 11) e é 100% compatível com os chamadores atuais (`remember(text)`, `remember(text, 'learned')` na borda de aprendizado). Uma opção por categoria é dado, não comportamento novo.
- **Alternativas descartadas**: (a) trocar a assinatura para `remember(text, options)` — mudança não-aditiva, quebraria a borda de aprendizado e todos os fakes, custo alto por estética; (b) métodos dedicados `rememberEpisode`/`rememberProject` — multiplicaria a superfície pública para variar um único campo.

### 7. Chave de duplicata passa a incluir categoria e projeto

- **Decisão**: a chave determinística de duplicata (usada por `remember` e por `dedupe`) passa de `normalize(text)` para a tupla `normalize(category ?? 'fact')` + `normalize(subject ?? '')` + `normalize(text)`, com separador que não pode aparecer no texto.
- **Porquê**: sem isso, registrar "renomeei `Fact`" como episódio silenciaria a gravação porque já existe um fato com o mesmo texto — as categorias seriam parcialmente inúteis. Incluir `subject` mantém coerente a memória de dois projetos com a mesma prática ("usa pnpm"). Tratar ausência como `'fact'` preserva byte a byte a garantia da SPEC-0022 sobre o acervo legado.
- **Alternativa descartada**: manter a chave só por texto — colapsaria registros legitimamente distintos e tornaria `dedupe --apply` destrutivo entre categorias (perda de memória do usuário, o risco que o ADR-0011 manda evitar acima de tudo).

### 8. `prompt()` agrupado por categoria, com formato e ordem literais fixos

- **Decisão**: `prompt()` compõe seções por categoria em ordem fixa (`fact` → `project` → `episode`), omitindo as vazias, unidas por **uma linha em branco** (`\n\n`). Formato literal de cada seção:
  - `fact` — exatamente o atual: `O usuário pediu para você lembrar os seguintes fatos e preferências:` seguido de uma linha `- <texto>` por registro;
  - `project` — cabeçalho `Sobre os projetos do usuário:`, seguido, **para cada projeto**, de um subcabeçalho `[projeto <subject>]` (o `subject` original gravado, não o normalizado) e das linhas `- <texto>` daquele projeto;
  - `episode` — cabeçalho `Episódios que o usuário pediu para você lembrar:` seguido de uma linha `- <texto>` por registro.

  Ordem entre projetos: **primeira ocorrência** de cada `subject` na ordem de carga; dentro de cada projeto e de cada seção, ordem de carga.
- **Porquê**: agrupar por categoria é o que dá **efeito observável** às categorias (o modelo distingue preferência de episódio), cumprindo o espírito do gate; agrupar a seção de projeto **por projeto** (em vez de prefixar cada linha) evita repetir o nome do projeto a cada registro e torna a fronteira entre projetos explícita para o modelo. Fixar formato e ordem literalmente é obrigatório porque o texto entra no system prompt de toda geração e o provider é amostrado 1x/turno (SPEC-0021): determinismo é requisito, e sem literal o `spec-validator` teria de inventar a expectativa. A ordem por primeira ocorrência reusa o critério já adotado no módulo (`dedupe`/`search` desempatam por ordem de carga), sem introduzir critério novo.
- **Alternativas descartadas**: (a) manter `prompt()` como lista plana, expondo a categoria só na CLI — entregaria taxonomia sem consequência, rótulo cosmético que não sustentaria o critério de conclusão da Fase 1; (b) uma linha por registro com prefixo (`- [atlas] usa pnpm`) — mais ruidoso e repetitivo no prompt, sem fronteira clara entre projetos; (c) ordenar projetos alfabeticamente — também determinístico, mas introduz um critério de ordenação novo e desalinhado do resto do módulo.

### 9. `list` ganha filtro opcional; `search` fica intacto

- **Decisão**: `list(options?: { category? })`; `search` continua varrendo todas as categorias, sem filtro.
- **Porquê**: o PRD exige que o usuário possa **consultar** o que está armazenado, e filtrar a listagem é a forma direta e barata disso. `search` já é a primitiva de relevância e não fica pior por atravessar categorias; acrescentar filtro lá seria escopo extra sem demanda — e o próprio `architecture-reviewer` marcou esse ponto como fora de escopo.
- **Alternativa descartada**: adicionar `category` também a `search` — mais superfície pública sem caso de uso declarado nesta fatia; fatia futura trivial se surgir necessidade.

### 10. O projeto é informado pelo usuário (`--subject`), nunca inferido do ambiente

- **Decisão**: memória de projeto exige `--subject <nome>` explícito; nada de detectar cwd/repositório/branch.
- **Porquê**: inferir o projeto do ambiente é exatamente o item "Contexto de ambiente" do Roadmap 1.4 (l. 101), marcado `ADR primeiro` e fora de escopo desde o ADR-0009 — fazê-lo aqui seria decisão arquitetural inédita (escalação). Exigir o nome mantém a memória rastreável e previsível.
- **Alternativa descartada**: usar o toplevel do repositório (descoberta já disponível desde a SPEC-0028) como `subject` default — atravessaria a fronteira Memória × Contexto e criaria dependência da Memory em detecção de ambiente, violando a responsabilidade única do módulo.

### 11. A invariante "memória de projeto exige projeto" vive no `@atlas/memory`; a CLI só antecipa a mensagem

- **Decisão**: `remember` rejeita com `MemoryError` (i) `category: 'project'` sem `subject` válido e (ii) `subject` válido com categoria diferente de `'project'`, antes de qualquer mutação ou `storage.save`. A CLI valida antes e devolve `CliUsageError` amigável — a **mensagem** é da borda, a **garantia** é do módulo.
- **Porquê**: é propriedade do modelo persistido, e o Artigo 11 / Module Catalog dão à Memory a autoridade única sobre o conhecimento permanente — deixar a regra só na CLI faria qualquer outro chamador da API pública gravar registros ambíguos. Concretamente, o Critério de Conclusão da Fase 1 exige contratos estáveis para uma segunda interface (`apps/desktop`, Fase 2), que teria de reimplementar a validação. Falhar alto e cedo é a mesma disciplina fail-closed da SPEC-0024, e `MemoryError` já existe (nenhuma classe de erro nova).
- **Alternativas descartadas**: (a) validar apenas na CLI (redação anterior desta SPEC, vetada no achado F1 do `architecture-reviewer`) — deixaria uma invariante do estado persistente fora da autoridade do módulo; (b) aceitar `project` sem `subject` como "projeto atual/indefinido" — estado ambíguo no acervo e inferência de ambiente pela porta dos fundos.

### 12. Sem `occurredAt` separado de `createdAt`

- **Decisão**: episódios usam `createdAt` como sua única marca temporal.
- **Porquê**: um episódio é registrado quando é lembrado; um segundo campo de data exigiria parsing de data em linguagem natural (modelo ou biblioteca) e uma política de ordenação cronológica — complexidade sem demanda no gate (YAGNI).
- **Alternativa descartada**: `occurredAt?` opcional já agora — campo que nasceria sem produtor (nem CLI nem Learner o preencheriam), o tipo de peso morto que o teste da Constituição manda evitar.

### 13. O Learner (SPEC-0020) continua produzindo só `fact`

- **Decisão**: os fatos propostos pelo Cognitive ao fim do turno seguem gravados como `category: 'fact'`, `source: 'learned'`; nenhuma mudança em `@atlas/cognitive`.
- **Porquê**: classificar automaticamente a categoria exigiria mudar o prompt de extração e o contrato `learned?` (hoje `readonly string[]`), ampliando a SPEC para dentro do ciclo cognitivo e arriscando regressão no caminho de aprendizado recém-fechado (ADR-0016). A categorização automática é fatia futura natural, depois que as categorias existirem e forem exercitadas manualmente.
- **Alternativa descartada**: já fazer o Learner propor episódios — dobraria o escopo, tocaria dois módulos e uma decisão de framing de prompt (Artigo 13), reabrindo terreno do ADR-0016 sem necessidade para fechar o gate.

### 14. Prioridade `High`

- **Decisão**: prioridade `High`.
- **Porquê**: é o **último gate aberto da Fase 1** do Roadmap (l. 90 e l. 126); sua conclusão destrava a decisão do usuário sobre iniciar a Fase 2. Não é `Critical` porque não há falha, risco de segurança nem bloqueio de uso corrente.
- **Alternativa descartada**: `Medium` — subestimaria; as demais fatias de 1.3 entregues como `Medium` eram `candidato`, e esta é `gate`.

### 15. `subject` em branco é inválido, não é "sem projeto"

- **Decisão**: um `subject` que colapse para vazio após `normalize` (`''`, `'   '`, `'\t\n'`) é tratado como **ausente e inválido** para `category: 'project'` — `MemoryError` no módulo, `CliUsageError` na CLI. Não existe registro de projeto com projeto em branco.
- **Porquê**: sem essa regra, a chave de duplicata da D7 (`normalize(subject ?? '')`) colapsaria `--subject "   "` na mesma chave de um projeto sem nome, criando exatamente o "registro de projeto sem projeto" que a D11 recusa — e, pior, agruparia no `dedupe` registros distintos sob uma chave vazia. Fail-closed completo exige cobrir o branco, não só o ausente (achado F2 do `architecture-reviewer`).
- **Alternativa descartada**: aceitar o branco e persistir a string como veio — deixaria a fail-closed pela metade e criaria um "projeto anônimo" indistinguível de erro do usuário; normalizar silenciosamente para ausente seria alterar entrada do usuário sem avisar, o que o módulo não faz em nenhum outro ponto.
