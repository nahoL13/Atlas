# SPEC-0025 — Skills: Skill Registry passivo + Skill Builder

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0025

---

**Título**

Skills — Skill Registry (catálogo passivo em memória) + Skill Builder (processo de 8 passos), sem consumo no laço cognitivo

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

Medium

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 1 — 1.4 Capacidades de Plataforma — Skills e Skill Registry (packages/skills)` (`docs/04-engineering/Roadmap.md`, l. 99, `gate · ADR primeiro`). Fecha o critério de conclusão da Fase 1 "Skills existem como conceito implementado, não só documentado" (l. 125).

---

# Objetivo

Ao concluir esta SPEC deverá existir o package `packages/skills` (`@atlas/skills`) com os **dois** componentes de Extensão que o Module Catalog reserva:

- o **Skill Registry** — catálogo **passivo em memória** de Skills (`register`/`get`/`deactivate`/`remove`/`list`, distinguindo permanentes de temporárias), no molde do Tool Registry;
- o **Skill Builder** — construtor que percorre o processo mínimo de 8 passos do Module Catalog, usa o Model Gateway para gerar o **rascunho estruturado** da Skill (nome, descrição, instruções especializadas e as Tools de que ela depende), **valida estaticamente** o resultado (contrato bem-formado + Tools declaradas resolvíveis no Tool Registry) e, em sucesso, o completa de forma determinística e o registra como `temporary`.

O contrato `Skill`/`SkillRegistry`/`SkillBuilder` vive em `@atlas/contracts`; `AtlasPlatform` expõe `skills` e `skillBuilder`; a CLI ganha `atlas skills list` e `atlas skills build "<capacidade>"`. **Nada no laço cognitivo (Planner/Cognitive/Runtime) consome Skills nesta fatia** — o Registry é passivo por decisão humana registrada no [ADR-0017](../../06-adr/ADR-0017-skills-registry-builder.md).

---

# Motivação

O [Module Catalog](../../03-architecture/ModuleCatalog.md) cataloga `packages/skills` (Skill Registry + Skill Builder) desde sempre, mas o conceito só existe **documentado** — nenhuma linha de código o materializa. O [Roadmap](../../04-engineering/Roadmap.md) marca o item **1.4** como `gate · ADR primeiro` e define o fecho da Fase 1 (l. 125): "Skills existem como conceito **implementado**, não só documentado". A base no PRD é a seção **Especialização** (`ProductRequirementsDocument.md`, l. 139-145: usar especializações para resolver diferentes tipos de problemas; o usuário não seleciona manualmente; o sistema escolhe a estratégia adequada) mais os NFR "extensível" e "favorecer reutilização".

As decisões arquiteturais inéditas — o que uma Skill é em código, a forma do Registry e do Builder, e quão "viva" é esta primeira fatia — foram tomadas pelo humano (escalação da Emenda v1.1) e registradas no **ADR-0017**: fatia = Registry **+** Builder; Registry **passivo** (em memória, sem seleção pelo usuário, sem integração com o laço cognitivo). Esta SPEC implementa essa decisão.

Documentos originadores: **Module Catalog** (Skill Registry / Skill Builder, `packages/skills`) + **Glossary** (Skill = conhecimento + regras + Tools; nunca fala com o usuário; permanente × temporária) + **PRD** (Especialização) + **ADR-0017**.

---

# Referências

- [ADR-0017](../../06-adr/ADR-0017-skills-registry-builder.md) — Skills: Registry passivo + Builder (decisão que esta SPEC consome)
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Skill Registry (l. 482-523) e Skill Builder (l. 527-572)
- [Glossary](../../00-project/Glossary.md) — Skill, Skill Registry, Skill Builder (conhecimento + regras + Tools; permanente × temporária; nunca fala com o usuário)
- [PRD](../../02-product/ProductRequirementsDocument.md) — Especialização (l. 139-145); NFR extensível/reutilização (l. 171-175)
- [ADR-0012](../../06-adr/ADR-0012-planner-runtime-execution.md) — precedente de contrato público (`Tool`/`Plan`); Tools referenciadas por nome como dado
- [ADR-0016](../../06-adr/ADR-0016-learning-proposed-extraction.md) — precedente do julgamento semântico isolado numa chamada de Gateway (learner puro; saída JSON parseada; falha → resultado vazio, nunca quebra)
- [ADR-0003](../../06-adr/ADR-0003-core-composition-root.md) / [ADR-0004](../../06-adr/ADR-0004-manual-composition.md) — composição manual no Core
- [SPEC-0010](SPEC-0010-planner-runtime-tools.md) — Tool Registry (`createToolRegistry`), molde do Skill Registry
- [SPEC-0009](SPEC-0009-memory-service.md) — precedente de introdução de package + contrato + CLI

---

# Escopo

- Criar o package `packages/skills` (`@atlas/skills`).
- `createSkillRegistry({ skills? }): SkillRegistry` — catálogo **em memória**: `register(skill)`, `get(id)`, `deactivate(id)`, `remove(id)`, `list()`. Distingue `permanent`/`temporary` (campo `scope`) e ativo/inativo. Sem IO, sem persistência. `register` **rejeita** substituir uma Skill `permanent` já registrada (ver Interfaces e Critérios).
- `createSkillBuilder({ gateway, registry, tools }): SkillBuilder` — `build(request): Promise<SkillBuildResult>` percorrendo os 8 passos do Module Catalog. A **única** chamada `gateway.generate` (passo 5) produz um **rascunho estruturado em JSON** com os campos **derivados do modelo** — `name`, `description`, `instructions`, `toolIds` (as Tools mínimas da Skill). O Builder **parseia** essa saída (JSON malformado/incompleto → `issues`, sem lançar, no molde do learner do ADR-0016), **valida estaticamente** (contrato bem-formado + todo `toolId` resolve em `tools`) e, em sucesso, **completa de forma determinística** os campos que **não** vêm do modelo — `id` (gerado em namespace reservado a temporárias), `version` (ex.: `'1.0.0'`) e `scope: 'temporary'` — e registra a Skill. Em falha, devolve as pendências sem registrar. **Nunca** promove `temporary`→`permanent`.
- Definir os contratos `Skill`, `SkillScope`, `SkillDescriptor`, `SkillDraft`, `SkillRegistry`, `SkillBuilder`, `SkillBuildRequest`, `SkillBuildResult` em `@atlas/contracts`.
- Ao menos **uma Skill permanente embutida** (seed, dado inerte) em `@atlas/skills`, usada para semear o Registry no Core; seus ids ficam num namespace disjunto do namespace de temporárias do Builder.
- Adicionar `skills: SkillRegistry` e `skillBuilder: SkillBuilder` a `AtlasPlatform`.
- Compor em `@atlas/core`: criar o Skill Registry (semeado com as Skills embutidas), criar o Skill Builder fiado com `gateway` + `registry` + o Tool Registry já composto; expor `atlas.skills` e `atlas.skillBuilder`.
- CLI: `atlas skills list` (lista `id`, nome, `scope`, ativo/inativo, versão) e `atlas skills build "<capacidade>"` (dispara o Builder e imprime a Skill produzida + resultado da validação, ou as pendências); `HELP_TEXT` atualizado.
- Erro de Skill: `AtlasError` com `code: 'ATLAS_SKILL'` (via subclasse `SkillError`).
- Testes (unit + integração de CLI) e documentação (incl. `packages/skills/CLAUDE.md`).
- ADR-0017 já criado por esta frente; passa de `Proposed` para `Accepted` no fecho (aprovação do gate).

---

# Fora do Escopo

Esta seção é obrigatória.

- **Não** integrar Skills ao laço cognitivo — **nada** as seleciona nem executa: Planner, Cognitive Core, Runtime e Observer **não** mudam uma linha. Registry **passivo** (decisão humana, ADR-0017).
- **Não** permitir que o **usuário selecione** uma Skill à la Persona (sem flag `--skill`, sem config de Skill ativa).
- **Não** persistir Skills em disco — o Registry vive no processo. Uma Skill construída por `atlas skills build` **não** sobrevive à invocação (limitação consciente, documentada). Sem porta de storage, sem arquivo JSON.
- **Não** promover Skills `temporary`→`permanent` (automática ou por comando) — proibição do Module Catalog; promoção é ato administrativo humano, fatia futura.
- **Não** executar a Skill de verdade no "teste controlado" (passo 7) — a validação é **estática** (contrato + Tools resolvíveis). Um harness de execução real depende do consumo (Planner/Runtime), fora desta fatia.
- **Não** deixar o **modelo** definir `id`, `version` ou `scope` — esses três são determinísticos do Builder; só `name`/`description`/`instructions`/`toolIds` vêm da geração (evita `scope: 'permanent'` autoatribuído e ids não controlados).
- **Não** dar à Skill qualquer canal com o usuário (Module Catalog, regra 4) — sem campo/método de fala.
- **Não** implementar histórico de múltiplas versões por Skill, ativação/reativação sofisticada, descoberta por capacidade/consulta semântica, nem catálogo remoto — `version` é um campo simples; multi-versão é fatia futura.
- **Não** criar Tools novas nem tocar `@atlas/tools`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/memory`, `@atlas/context`, `@atlas/persona` (a Skill referencia `toolIds` como **dado**, não os executa).
- **Não** conceder ou avaliar permissões dentro do Skill Builder além de declarar `toolIds` como dado — o Permission Service segue como único portão (o "definir permissões" do passo 4 é declaração de dado, não concessão).
- **Não** alterar contratos existentes de forma não-aditiva.

---

# Pré-requisitos

- [SPEC-0004](SPEC-0004-model-gateway.md) (Model Gateway) — `Done` (o Builder consome `gateway.generate`)
- [SPEC-0010](SPEC-0010-planner-runtime-tools.md) (Planner + Runtime + Tools / Tool Registry) — `Done` (o Builder valida `toolIds` contra o Tool Registry; o Registry espelha `createToolRegistry`)
- [SPEC-0002](SPEC-0002-core-bootstrap.md) (Core / composition root) — `Done`
- [SPEC-0003](SPEC-0003-cli-foundation.md) (CLI foundation) — `Done`
- [ADR-0017](../../06-adr/ADR-0017-skills-registry-builder.md) aceito no gate (`Proposed`→`Accepted`)

---

# Critérios de Aceitação

Cada item é verificável.

- Package `@atlas/skills` criado; `createSkillRegistry({ skills? })` retorna um `SkillRegistry` (síncrono, sem IO).
- `createSkillRegistry` carrega as Skills embutidas passadas na criação; `list()` as retorna como `SkillDescriptor[]`.
- `register(skill)` insere uma Skill nova por `id` ou atualiza uma existente **de mesmo `scope`**; `get(id)` retorna a `Skill` completa ou `undefined`; `deactivate(id)` marca inativa e retorna `true`/`false` (existia/não); `remove(id)` remove e retorna `true`/`false`.
- **Colisão de `id` protegida:** `register` **rejeita** (lança `SkillError`/`ATLAS_SKILL`, sem mutar o catálogo) qualquer tentativa de substituir uma Skill `permanent` já registrada por outra de `id` igual — em particular, uma `temporary` **nunca** sobrescreve uma `permanent`. Os ids gerados pelo Builder ficam num **namespace reservado a temporárias** (ex.: prefixo `tmp-`), disjunto dos ids das Skills embutidas permanentes, de modo que a colisão não ocorre no caminho normal; o guard de `register` é a rede de segurança.
- `list()` distingue `scope` (`permanent`/`temporary`) e estado ativo/inativo por Skill.
- `createSkillBuilder({ gateway, registry, tools })` retorna um `SkillBuilder`; `build({ capability })` chama `gateway.generate` **exatamente uma vez** e parseia a saída como um `SkillDraft` **estruturado** com **os campos `name`, `description`, `instructions` e `toolIds` derivados do modelo**; `id`, `version` e `scope: 'temporary'` são atribuídos **deterministicamente pelo Builder** (não vêm do modelo).
- **"Contrato bem-formado" definido mecanicamente:** o `SkillDraft` é válido quando — todos os campos esperados estão presentes; `name` e `instructions` são strings **não vazias** (após `trim`); `description` é string; `toolIds` é um **array de strings** (pode ser vazio somente se a capacidade genuinamente não exigir Tools — ver nota); e, na Skill final, `id`/`name`/`instructions` não vazios e `scope` ∈ `{ 'permanent', 'temporary' }`. Qualquer violação → `issues`.
- **`toolIds` resolvíveis:** **todo** `toolId` do rascunho existe em `tools` (o Tool Registry injetado). Ao menos um `toolId` inexistente → `issues`, sem registrar.
- Em sucesso, `build` completa `id`/`version`/`scope: 'temporary'`, registra a Skill no `registry` e retorna `{ ok: true, skill }`; a Skill passa a aparecer em `registry.list()` (no mesmo processo).
- Em falha (JSON não parseável, `SkillDraft` malformado por qualquer critério acima, ou `toolId` inexistente), `build` retorna `{ ok: false, issues }`, **não** registra nada e **nunca** lança.
- `build` **nunca** produz nem registra uma Skill `permanent` (o Builder não promove).
- Contratos `Skill`/`SkillScope`/`SkillDescriptor`/`SkillDraft`/`SkillRegistry`/`SkillBuilder`/`SkillBuildRequest`/`SkillBuildResult` vivem em `@atlas/contracts`; nenhum contrato existente muda de forma (mudanças só aditivas).
- `AtlasPlatform` expõe `skills: SkillRegistry` e `skillBuilder: SkillBuilder`.
- `createAtlas` cria o Skill Registry semeado com ≥ 1 Skill permanente embutida, cria o Skill Builder fiado com `gateway`+`registry`+Tool Registry, e expõe `atlas.skills`/`atlas.skillBuilder`.
- CLI: `atlas skills list` mostra o catálogo (≥ a Skill semeada) com `id`, nome, `scope`, ativo/inativo, versão; `atlas skills build "<capacidade>"` dispara o Builder e imprime a Skill produzida (ou as pendências); `HELP_TEXT` atualizado.
- Erro de Skill → `AtlasError` com `code: 'ATLAS_SKILL'`.
- Planner, Cognitive Core, Runtime, Observer e demais packages permanecem com **diff de produção vazio** (Skills não são consumidas no laço cognitivo).
- ADR-0017 `Accepted`.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.
- Documentação atualizada; lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

Nota sobre `toolIds` vazio: o Glossary define Skill como reunião de conhecimento, regras **e Tools**; o Builder deve instruir o modelo a selecionar as Tools mínimas necessárias e, no caso normal, `toolIds` é não vazio. Um `toolIds` vazio é aceito apenas quando a capacidade genuinamente não requer nenhuma Tool (Skill puramente de conhecimento/regras) — não é o caminho esperado, e a instrução de geração deixa isso explícito para o modelo, evitando a variante degenerada de Skills sistematicamente sem Tools.

---

# Arquivos Esperados

```text
packages/skills/
  package.json
  tsconfig.json
  CLAUDE.md
  src/
    index.ts                 # createSkillRegistry, createSkillBuilder, builtin skills
    skill-registry.ts        # catálogo em memória; guard de colisão permanent
    skill-builder.ts         # 8 passos; 1 gateway.generate → SkillDraft; validação estática
    builtin-skills.ts        # seed(s) permanentes (dado inerte), ids fora do namespace tmp-
    errors.ts                # SkillError (ATLAS_SKILL)
  tests/
    skill-registry.test.ts
    skill-builder.test.ts    # gateway fake + tool registry fake

packages/contracts/src/
  skill.ts                   # Skill, SkillScope, SkillDescriptor, SkillDraft, SkillRegistry,
                             # SkillBuilder, SkillBuildRequest, SkillBuildResult
  platform.ts                # AtlasPlatform ganha skills, skillBuilder
  index.ts                   # re-exports

packages/core/src/index.ts   # cria/semeia registry + builder; expõe atlas.skills/skillBuilder
packages/core/tests/

apps/cli/src/commands/skills.ts   # atlas skills list | build
apps/cli/src/run.ts               # roteamento + HELP_TEXT
apps/cli/src/gateway/input-gateway.ts   # parsing do subcomando skills (se necessário)
apps/cli/tests/

docs/06-adr/ADR-0017-skills-registry-builder.md   # já criado; Proposed → Accepted
```

Lista é expectativa; pode sofrer pequenos ajustes (ex.: `builtin-skills.ts` pode ficar inline em `index.ts` se ficar mais simples).

---

# Componentes Impactados

- Skill Registry (novo) — `packages/skills`
- Skill Builder (novo) — `packages/skills`
- Contracts — `@atlas/contracts` (contratos novos + `AtlasPlatform`)
- Core — composição (cria/semeia Registry, fia Builder, expõe na plataforma)
- CLI — comando `atlas skills list`/`build`

**Não impactados (diff de produção vazio):** Planner, Cognitive Core, Observer, learner, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/memory`, `@atlas/context`, `@atlas/persona`, `@atlas/model-gateway`.

---

# Interfaces Necessárias

Em `@atlas/contracts`:

```ts
export type SkillScope = 'permanent' | 'temporary';

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly instructions: string;        // conhecimento + regras especializados
  readonly toolIds: readonly string[];  // Tools de que depende, por id, como dado
  readonly scope: SkillScope;
  readonly version: string;             // simples (ex.: "1.0.0")
}

// Campos que a geração (gateway.generate) produz. id/version/scope NÃO vêm do
// modelo — são atribuídos deterministicamente pelo Builder ao completar a Skill.
export interface SkillDraft {
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  readonly toolIds: readonly string[];
}

export interface SkillDescriptor {      // visão leve p/ listagem (espelha ToolDescriptor)
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly scope: SkillScope;
  readonly version: string;
  readonly active: boolean;
}

export interface SkillRegistry {
  // register insere/atualiza por id; REJEITA (SkillError) substituir uma Skill
  // permanent já registrada — uma temporary nunca sobrescreve uma permanent.
  register(skill: Skill): void;
  get(id: string): Skill | undefined;   // localizar + carregar unificados (em memória)
  deactivate(id: string): boolean;
  remove(id: string): boolean;
  list(): readonly SkillDescriptor[];
}

export interface SkillBuildRequest {
  readonly capability: string;          // descrição em linguagem natural da capacidade
}

export interface SkillBuildResult {
  readonly ok: boolean;
  readonly skill?: Skill;               // presente quando ok
  readonly issues?: readonly string[];  // pendências de validação quando !ok
}

export interface SkillBuilder {
  build(request: SkillBuildRequest): Promise<SkillBuildResult>;
}
```

`AtlasPlatform` ganha `readonly skills: SkillRegistry` e `readonly skillBuilder: SkillBuilder`. Dependências dos factories (`createSkillRegistry({ skills? })`, `createSkillBuilder({ gateway, registry, tools })`) são tipos de construção, não sobem ao contrato público além do necessário.

---

# Fluxo Esperado

```text
Catálogo (startup):
  createSkillRegistry({ skills: BUILTIN_SKILLS })  → SkillRegistry (semeado; ids permanentes)
  atlas.skills.list()  → [Skill permanente embutida, ...]

Construção (one-shot):
  atlas skills build "resumir arquivos de texto"
    ↓  createSkillBuilder({ gateway, registry, tools }).build({ capability })
    ↓  passos 1-4: framing da capacidade, Tools mínimas, permissões declaradas (dado)
    ↓  passo 5: gateway.generate(...)  → JSON → parse → SkillDraft
    ↓            (name, description, instructions, toolIds ← modelo)
    ↓  passos 6-7 (validação estática):
    ↓     - SkillDraft bem-formado? (campos presentes; name/instructions não vazios;
    ↓       toolIds array de strings)
    ↓     - todo toolId resolve em `tools`?
    ↓  passo 8:
    ↓     ok  → completa id (namespace tmp-) + version + scope:'temporary'
    ↓           → registry.register(skill)  → { ok: true, skill }
    ↓     !ok → { ok: false, issues }   (não registra, não lança)
    ↓  CLI imprime a Skill produzida (ou as pendências)

Laço cognitivo: INALTERADO — nada seleciona nem executa Skills nesta fatia.
```

---

# Estratégia de Implementação

1. Contrato: `skill.ts` em `@atlas/contracts` (incl. `SkillDraft`) + `AtlasPlatform` (`skills`/`skillBuilder`) + re-exports.
2. `@atlas/skills`: `SkillError`, `createSkillRegistry` (catálogo em memória + guard de colisão `permanent` + testes), `builtin-skills` (seed permanente, ids fora de `tmp-`).
3. `@atlas/skills`: `createSkillBuilder` (8 passos; instrução de geração que fixa o schema JSON do `SkillDraft` e pede as Tools mínimas; `gateway.generate` 1x; parse tolerante a falha; validação estática contra o Tool Registry; completa `id`/`version`/`scope:'temporary'`; registra em sucesso) + testes com gateway fake e tool registry fake.
4. Core: criar/semear o Registry, fiar o Builder com gateway+registry+Tool Registry, expor na plataforma; testes.
5. CLI: comando `skills list`/`build`, roteamento, `HELP_TEXT`; testes de CLI (incl. o ramo de validação falha).
6. Passar ADR-0017 a `Accepted`; documentação (`packages/skills/CLAUDE.md`, docs vivas no fecho); lições; suíte completa.

---

# Estratégia de Testes

- **Skill Registry (unit):** `createSkillRegistry` carrega o seed; `register` insere/atualiza por `id` no mesmo `scope`; `register` **lança `SkillError`** ao tentar substituir uma Skill `permanent` (e o catálogo não muta); `get` retorna a Skill ou `undefined`; `deactivate` marca inativa e devolve `true`/`false`; `remove` remove e devolve `true`/`false`; `list` reflete `scope` e estado ativo/inativo.
- **Skill Builder (unit, gateway fake + tool registry fake):**
  - sucesso — o fake devolve um JSON de `SkillDraft` com `toolIds` que existem em `tools`; `build` chama `gateway.generate` **uma vez**, valida, completa `id` (`tmp-…`)/`version`/`scope:'temporary'`, registra e devolve `{ ok: true, skill }`; asseverar `scope === 'temporary'` e `id` no namespace reservado;
  - falha por `toolId` inexistente → `{ ok: false, issues }` sem registrar;
  - falha por JSON não parseável → `{ ok: false, issues }` sem lançar;
  - falha por `SkillDraft` malformado (ex.: `name` vazio, `toolIds` não-array) → `{ ok: false, issues }`;
  - garantir que o resultado **nunca** é `permanent` mesmo que o modelo tente injetar `scope`/`id` no JSON (esses campos do modelo são ignorados).
- **Core (integração):** `atlas.skills` presente e semeado; `atlas.skillBuilder` presente; uma `build` de sucesso passa a aparecer em `atlas.skills.list()` **no mesmo processo**.
- **CLI:** `atlas skills list` mostra o seed; `atlas skills build "<cap>"` imprime a Skill produzida (provider `fake`) e o caso de validação falha imprime as pendências; `HELP_TEXT` cobre os dois subcomandos.
- **Regressão de fronteira:** asseverar (por ausência de diff / testes existentes verdes) que Planner/Cognitive/Runtime não foram tocados.

---

# Definition of Done

- todos os critérios atendidos;
- testes passando (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`);
- documentação atualizada (no fecho `doc-sync`: `CLAUDE.md` raiz + `packages/skills/CLAUDE.md` + `packages/core/CLAUDE.md` se necessário + `docs/05-context/NEXT_CONTEXT.md` + `docs/05-context/CURRENT_SPRINT.md` + `Roadmap.md` marcando o gate 1.4);
- ADR-0017 `Accepted`;
- arquitetura preservada (Registry não decide uso nem cria Skills; Builder não promove nem persiste sem validação; Skill não fala com o usuário; laço cognitivo intacto);
- revisão concluída;
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação:** a sincronização das docs vivas é o passo de fecho `doc-sync`, **não** escopo do `spec-implementer` (ver template e `ClaudeCodeAutomation.md`). O implementador só toca a SPEC, o `packages/skills/CLAUDE.md` novo e a transição de status do ADR-0017.

---

# Restrições

- Não criar módulos além do `packages/skills` catalogado; não criar Tools novas.
- `@atlas/skills` depende só de `@atlas/contracts`; só `@atlas/core` importa suas implementações (Regra 11 / ADR-0004).
- O Skill Registry **não** decide quando uma Skill é usada, **não** cria Skills, **não** conversa com o usuário, **não** guarda memória de tarefa (Module Catalog).
- O Skill Builder **não** promove `temporary`→`permanent`, **não** persiste sem validação, **não** concede permissões, **não** deixa o modelo definir `id`/`version`/`scope` (Module Catalog + ADR-0017).
- Uma Skill **não** tem canal com o usuário (Module Catalog, regra 4).
- Sem IO/persistência nesta fatia — o Registry é em memória (ADR-0017); o Builder usa o Gateway já composto.
- Contratos só mudam de forma **aditiva**; o laço cognitivo permanece intacto.

---

# Observações

- **Contrato da geração (achado do gate — 1º veto):** a única `gateway.generate` do Builder produz um `SkillDraft` **estruturado** (`name`/`description`/`instructions`/`toolIds`), parseado de JSON no molde do learner (ADR-0016); `id`/`version`/`scope:'temporary'` são determinísticos do Builder. Isso fecha a ambiguidade que permitiria uma implementação spec-compliant porém errada (modelo devolvendo só `instructions`, `toolIds` sempre vazio, validação de Tool vácua, Skills sem Tools) — o que contradiz o Glossary (Skill reúne conhecimento, regras **e** Tools).
- **Colisão de `id` (achado do gate — 1º veto):** `register` faz upsert, mas **rejeita** substituir uma Skill `permanent`; e o Builder gera ids num namespace reservado a temporárias (`tmp-…`), disjunto dos ids permanentes semeados. As duas travas juntas impedem que uma `temporary` mute/rebaixe uma `permanent` — caminho lateral adjacente à proibição dura do Module Catalog (l. 567).
- **Tensão consciente (ADR-0017):** Registry passivo + Builder implica que o Builder fabrica Skills que **ninguém ainda seleciona/executa** no laço cognitivo — o consumo (seleção pelo usuário ou pelo Planner) é fatia futura explícita. Além disso, como o Registry é **em memória**, uma Skill construída por `atlas skills build` **existe só no processo que a construiu**; `atlas skills list` num processo novo mostra apenas as Skills embutidas. Ambos são custos aceitos e documentados, não bugs.
- **Molde reutilizado:** o Skill Registry espelha `createToolRegistry` (SPEC-0010); o Builder isola o julgamento semântico numa única `gateway.generate`, como o learner (ADR-0016). Contrato público segue o precedente de `Tool`/`Plan` (ADR-0012).
- **Seed embutido:** ao menos uma Skill permanente semeia o Registry para o catálogo não nascer vazio e o gate ser verificável; é **dado inerte** (referencia `toolIds` como dado, não é executada).
- **Atrito de tipo previsível (padrão recorrente do repo):** adicionar `skills`/`skillBuilder` a `AtlasPlatform` quebra o typecheck/os testes de fakes de `AtlasPlatform` na CLI e no Core. Grep sugerido: `git grep 'AtlasPlatform'` + os stubs (`stubAtlas`/`as unknown as AtlasPlatform`) — alguns só o `pnpm test` pega, não o `typecheck` (ver lições das SPECs 0022/0023).

---

# Checklist para IA

Antes de implementar: ler ADR-0017, Module Catalog (Skill Registry l. 482-523 / Skill Builder l. 527-572), Glossary (Skill/permanente×temporária/nunca fala com o usuário), SPEC-0010 (Tool Registry como molde), ADR-0012 (contrato público) e ADR-0016 (chamada de Gateway isolada, saída JSON parseada, falha → vazio).

Durante: manter o Registry passivo e em memória com o guard de colisão `permanent`; o Builder gerando um `SkillDraft` estruturado, validando estaticamente e nunca promovendo/atribuindo `id`/`version`/`scope` a partir do modelo; a Skill sem canal com o usuário; o laço cognitivo intacto; contratos aditivos; simplicidade.

Após: rodar a suíte; revisar documentação; validar critérios; registrar lições; concluir.

---

# Resultado Esperado

O Atlas passa a ter o conceito de **Skill** existindo na implementação, não só na documentação. Um **Skill Registry** em memória guarda o catálogo (semeado com ao menos uma Skill permanente), distingue permanentes de temporárias e protege as permanentes contra sobrescrita; um **Skill Builder** fabrica novas Skills percorrendo o processo de 8 passos do Module Catalog — gerando, numa única chamada ao Model Gateway, um rascunho estruturado (nome, descrição, instruções especializadas e as Tools mínimas), validando estaticamente o contrato e que as Tools declaradas existem, e completando de forma determinística `id`/`version`/`scope: 'temporary'` antes de registrar, sem jamais promover a Skill a permanente nem persistir sem validação. A plataforma expõe `atlas.skills` e `atlas.skillBuilder`, e a CLI os torna observáveis por `atlas skills list` e `atlas skills build "<capacidade>"`. **Nada seleciona ou executa Skills no laço cognitivo** — o consumo é fatia futura deliberada (ADR-0017). Com isso, o gate 1.4 do Roadmap ("Skills existem como conceito implementado, não só documentado") fecha, e a fronteira fica limpa para a fatia de consumo (seleção pelo usuário ou pelo Planner) construir sobre um catálogo e um construtor já prontos, com contrato público estável.
