# ADR-0017 — Skills: Skill Registry passivo + Skill Builder, sem consumo no laço cognitivo

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-20

> **Nota de atualização (2026-07-21, ADR-0018):** a decisão "Registry passivo — nada no laço cognitivo consome Skills" era explicitamente a **primeira** fatia, com o consumo adiado. O [ADR-0018](ADR-0018-planner-skill-consumption.md) (`Accepted`) **ativa o consumo** pela forma A (seleção pelo Planner/modelo). Este ADR permanece `Accepted` quanto ao Skill Registry e ao Skill Builder — as proibições estruturais aqui fixadas (Builder nunca promove `temporary`→`permanent`, Skill não fala com o usuário, `permanent` protegida contra sobrescrita, Builder não persiste sem validação) seguem intactas. A **persistência** do acervo de Skills continua fora de escopo até uma fatia futura casada com o consumo de Skills `temporary`.

---

# Contexto

O [Module Catalog](../03-architecture/ModuleCatalog.md) reserva desde sempre o package `packages/skills` para dois componentes de Extensão — o **Skill Registry** (catálogo oficial de Skills: registrar, localizar, carregar, desativar, versionar, remover; diferenciar permanentes de temporárias; usado por Planner e Runtime; **não** decide quando usar, **não** cria Skills, **não** conversa com o usuário) e o **Skill Builder** (cria/valida/prepara novas Skills num processo mínimo de 8 passos; usa o Model Gateway; **não** promove temporária→permanente automaticamente, **não** persiste sem validação). O [Glossary](../00-project/Glossary.md) define Skill como capacidade especializada que reúne **conhecimento + regras + Tools** para um tipo de trabalho, com a restrição estrutural de que **uma Skill nunca fala com o usuário** (Module Catalog, "Restrições da arquitetura", regra 4).

Até hoje o conceito só existe **documentado**: nenhuma linha de código o materializa. O [Roadmap](../04-engineering/Roadmap.md) marca o item **1.4 — Skills e Skill Registry** como `gate · ADR primeiro` (l. 99) e define o critério de fecho da Fase 1 (l. 125): "Skills existem como conceito **implementado**, não só documentado". A base no PRD é a seção **Especialização** ("utilizar especializações para resolver diferentes tipos de problemas"; "o usuário não deve precisar selecionar manualmente"; "escolher automaticamente a estratégia mais adequada") somada aos NFR "extensível" e "favorecer reutilização de componentes".

Criar `packages/skills` é módulo novo e decisão arquitetural inédita — por isso este ADR precede a SPEC. **As decisões de fundo foram tomadas pelo humano** (escalação da Emenda v1.1, resolvida): (1) a primeira fatia inclui **Skill Registry + Skill Builder** (ambos, não só o Registry); (2) o Registry é **passivo** — catálogo em memória com Skills embutidas, **sem seleção pelo usuário e sem integração com Planner/Cognitive/Runtime** nesta fatia. Este ADR captura essas decisões e o que a documentação já fixa, e delimita a fronteira para as fatias futuras.

A pergunta central: **como fazer o conceito de Skill existir na implementação — com um catálogo que o guarda e um construtor que as fabrica — sem que nada ainda as selecione ou execute no laço cognitivo, preservando as fronteiras de responsabilidade do Module Catalog?**

---

# Decisão

**Materializar `packages/skills` (`@atlas/skills`) com os dois componentes catalogados — Skill Registry e Skill Builder — como um catálogo passivo em memória. Nada no laço cognitivo consome Skills nesta fatia.**

**Uma Skill é dado: conhecimento + regras + referências a Tools.** O contrato `Skill` vive em `@atlas/contracts` (público, porque o Registry é módulo consumido por Planner/Runtime — mesmo critério de `Tool`/`Plan` no [ADR-0012](ADR-0012-planner-runtime-execution.md), ainda que a integração seja fatia futura). Uma `Skill` carrega `id`, `name`, `description`, `instructions` (o conhecimento/regras especializados, como fragmento de instrução), `toolIds` (as Tools de que a Skill depende, **por identificador, como dado** — não executadas aqui, espelhando como o `Plan` referencia Tools por nome no ADR-0012), `scope: 'permanent' | 'temporary'` (a distinção que o Module Catalog exige) e `version`. Uma Skill **não tem canal com o usuário** — não há campo nem método de fala (Module Catalog, regra 4).

**O Skill Registry é um catálogo em memória, no molde do Tool Registry.** `createSkillRegistry({ skills? })` (mesmo padrão de `createToolRegistry`, [SPEC-0010](../implementation/specs/SPEC-0010-planner-runtime-tools.md)) recebe as Skills embutidas na criação e expõe `register`, `get`, `deactivate`, `remove`, `list`. **Localizar e carregar são unificados em `get(id)`** — num catálogo em memória não há carga preguiçosa a distinguir; separar as duas operações seria redundância sem ganho (teste da Constituição: mais simples). A distinção "localizar × carregar" (metadados versus corpo carregado de uma fonte persistente) só passa a ter sentido quando Skills forem persistidas — fatia futura. `register` faz upsert por `id`, mas **rejeita** (`SkillError`) substituir uma Skill `permanent` já registrada — uma `temporary` **nunca** sobrescreve uma `permanent`, fechando o caminho lateral que rebaixaria uma permanente (adjacente à proibição dura "Builder nunca promove `temporary`→`permanent`"). **Não há persistência em disco**: o Registry vive no processo, coerente com a decisão humana de Registry passivo.

**O Skill Builder implementa o processo de 8 passos e usa o Model Gateway — com um contrato de saída fixo.** `createSkillBuilder({ gateway, registry, tools })` expõe `build(request)`; percorre os 8 passos do Module Catalog (compreender a capacidade → definir escopo → selecionar Tools mínimas → definir permissões → gerar o rascunho especializado → validar contratos → executar teste controlado → registrar ou descartar). A **única** chamada a `gateway.generate` (passo 5) produz um **rascunho estruturado em JSON** — um `SkillDraft` com os campos **derivados do modelo**: `name`, `description`, `instructions` (o conhecimento/regras) **e `toolIds`** (as Tools mínimas que a Skill reúne). Fixar que `toolIds` vem do modelo é deliberado: sem isso, uma implementação poderia devolver só `instructions`, deixar `toolIds` sempre vazio e produzir Skills **sem Tools** — o que contradiz o Glossary (Skill reúne conhecimento, regras **e** Tools). O Builder **parseia** essa saída (JSON malformado/incompleto → pendências, sem lançar, no molde do learner do [ADR-0016](ADR-0016-learning-proposed-extraction.md)) e faz **validação estática** (passos 6–7): o `SkillDraft` está bem-formado (campos presentes; `name`/`instructions` não vazios; `toolIds` array de strings) **e** todo `toolId` **resolve** no Tool Registry recebido. Os campos `id`, `version` e `scope: 'temporary'` **não vêm do modelo** — são atribuídos **deterministicamente pelo Builder** ao completar a Skill (o `id` num namespace reservado a temporárias, disjunto dos ids das permanentes semeadas). Em sucesso, o Builder registra a Skill resultante como **`temporary`** e a devolve; em falha, devolve as pendências e **não registra** (Module Catalog: "não persistir sem validação"). O Builder **nunca** promove `temporary`→`permanent` nem aceita `scope`/`id` vindos do modelo (proibição explícita do Module Catalog) — promoção é ato administrativo humano, fatia futura.

**"Executar teste controlado" (passo 7) é validação estática, não execução cognitiva.** Rodar a Skill de verdade exigiria seleção pelo Planner e execução pelo Runtime — exatamente o que a decisão humana deixou **fora** desta fatia (Registry passivo). O teste controlado aqui verifica que a Skill é internamente consistente e que suas Tools existem; um harness de execução real é fatia futura, junto do consumo.

**A plataforma expõe os dois componentes; uma CLI administrativa mínima os torna observáveis.** `AtlasPlatform` ganha `skills: SkillRegistry` e `skillBuilder: SkillBuilder`; `@atlas/core` cria o Registry (semeado com ao menos uma Skill permanente embutida, como **dado inerte**), e o Builder fiado com `gateway` + `registry` + o Tool Registry já composto na [SPEC-0010](../implementation/specs/SPEC-0010-planner-runtime-tools.md). A CLI ganha `atlas skills list` (mostra o catálogo) e `atlas skills build "<capacidade>"` (dispara o Builder e imprime a Skill produzida + o resultado da validação). "Ferramentas administrativas" são consumidor previsto do Registry e do Builder no Module Catalog; sem superfície observável, o critério do gate ("implementado, não só documentado") seria inverificável.

**Tensão consciente registrada (a documentar na SPEC, não bloqueio):** Registry passivo **+** Builder significa que o Builder fabrica/valida Skills que **ninguém ainda seleciona ou executa** no laço cognitivo. O consumo — seleção pelo usuário (à la Persona) ou pelo Planner/modelo — é **fatia futura explícita**. Além disso, como o Registry é **em memória**, uma Skill construída por `atlas skills build` **existe apenas no processo que a construiu**: `atlas skills list` num processo novo mostra só as Skills embutidas. Persistência entre invocações é fatia futura, casada com o consumo.

**Intactos:** Planner, Observer, learner, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/memory`, `@atlas/context`, `@atlas/persona`, `@atlas/model-gateway`. As mudanças de contrato são **aditivas** (`Skill`/`SkillScope`/`SkillDescriptor`/`SkillDraft`/`SkillRegistry`/`SkillBuilder` novos; `AtlasPlatform` ganha `skills`/`skillBuilder`). Nenhum contrato existente muda de forma. O Cognitive Core **não conhece** o conceito de Skill nesta fatia.

---

# Consequências

Positivas:

- **O conceito de Skill passa a existir na implementação** — o Registry o guarda, o Builder o fabrica, a CLI o mostra. O gate 1.4 do Roadmap (l. 125) fecha pelo critério "implementado, não só documentado".
- **Padrão do projeto preservado.** O Registry espelha o Tool Registry; o Builder isola o julgamento semântico numa chamada de Gateway com saída JSON parseada, como o learner; o contrato público segue o precedente de `Tool`/`Plan`.
- **Fronteiras do Module Catalog respeitadas.** Registry não decide uso nem cria Skills; Builder não promove nem persiste sem validação; Skill não fala com o usuário; permanentes protegidas contra sobrescrita. Nada disso é violado porque nada consome Skills ainda.
- **Skills nascem completas por construção.** O contrato fixo da geração (`toolIds` vem do modelo, validado contra o Tool Registry) impede a variante degenerada de Skills sistematicamente sem Tools.
- **Raio de mudança contido e aditivo.** Novo package + contratos aditivos + composição no Core + CLI administrativa. Zero diff no laço cognitivo.
- **Fronteira limpa para o consumo futuro.** Quando a seleção (usuário ou Planner) chegar, ela encontra um catálogo e um construtor já prontos, com contrato público estável.

Custos e riscos:

- **Capacidade sem consumidor.** Skills fabricadas/catalogadas não são executadas por ninguém nesta fatia (tensão consciente acima). Aceito: a decisão humana priorizou materializar o conceito antes do consumo; o valor é a fundação e o fecho do gate.
- **Builder em memória, escopo de processo.** Uma Skill construída não sobrevive à invocação. Aceito enquanto o Registry é passivo; persistência entra com o consumo.
- **Qualidade do rascunho depende do modelo.** O passo de geração usa o Gateway; modelos locais fracos podem produzir instruções pobres ou `toolIds` inexistentes. Mitigado pela validação estática (contrato + Tools resolvíveis) e pelo escopo `temporary` por default — rascunho inválido vira pendência, não Skill.
- **Seed embutido é dado inerte.** A Skill permanente semeada existe para o catálogo não nascer vazio; ela não é selecionada nem executada. Risco de parecer "morta" — mitigado documentando-a como semente do conceito, não como capacidade ativa.

---

# Alternativas Consideradas

**Só o Skill Registry nesta fatia (Builder adiado).** Era a recomendação inicial do `spec-drafter` por YAGNI — o gate fecha só com o Registry. **Preterida por decisão humana explícita:** o usuário optou por incluir o Builder já nesta fatia. Registrada aqui como a alternativa que perdeu, não como omissão.

**Registry ativo — Skill selecionável pelo usuário (à la Persona) ou pelo Planner/modelo.** Daria consumo imediato. Preterida por decisão humana (Registry passivo) e pelo teste da Constituição: a seleção puxa CLI+config (à la Persona) ou o laço cognitivo (Planner/Runtime) para dentro da primeira fatia, aumentando acoplamento e escopo. O consumo é fatia futura deliberada.

**Geração devolvendo só `instructions` (Builder monta `toolIds` por conta própria ou deixa vazio).** Fatia de saída menor. Preterida: `toolIds` sempre vazio produz Skills sem Tools, contra o Glossary, e torna vácua a validação de Tools resolvíveis. O contrato da geração inclui `toolIds` derivado do modelo e validado contra o Tool Registry.

**Modelo definindo `id`/`version`/`scope` no JSON.** Menos código determinístico no Builder. Preterida: abre porta para `scope: 'permanent'` autoatribuído (viola a proibição de promoção) e ids não controlados (colisão com permanentes). Esses três campos são determinísticos do Builder; campos correspondentes vindos do modelo são ignorados.

**`Skill` como tipo interno a `@atlas/skills` (fora de `@atlas/contracts`).** Fatia menor de contrato. Preterida: o Registry é módulo público consumido por Planner/Runtime (Module Catalog); o contrato precisa ser público mesmo antes da integração, como `Tool`/`Plan` já são (ADR-0012). Esconder o tipo forçaria uma promoção de contrato desconfortável na fatia de consumo.

**Persistir Skills em disco (porta de storage, como a Memory no ADR-0011).** Sobreviveria entre invocações. Preterida por YAGNI e coerência com o Registry passivo: sem consumidor, persistir Skills é infraestrutura sem uso; a porta de storage entra junto do consumo, quando houver o que persistir e quem ler.

**`find` e `load` como métodos separados no Registry (espelhando a letra do Module Catalog).** Preterida: num catálogo em memória não há carga preguiçosa; dois métodos idênticos violam a simplicidade (Constituição). Unificados em `get`; a distinção volta quando Skills forem carregadas de uma fonte persistente.

**`register` como upsert silencioso (sem guard de `permanent`).** Menos código. Preterida: um `id` temporário colidindo com o de uma Skill permanente sobrescreveria/rebaixaria a permanente — caminho lateral adjacente à proibição dura do Module Catalog. `register` rejeita a substituição de permanentes, e o Builder usa namespace de id disjunto.

**Teste controlado como execução real da Skill (passo 7 executando a Skill).** Validaria a Skill de ponta a ponta. Preterida: exige Planner+Runtime selecionando e rodando Skills — o consumo que esta fatia deixa fora. O teste controlado fica estático (contrato + Tools resolvíveis) até o consumo existir.

**Sem CLI — biblioteca pura.** Menos superfície. Preterida: o critério do gate é "implementado, **não só documentado**"; sem uma superfície observável (`skills list`/`skills build`), o conceito ficaria invisível e o fecho do gate, inverificável. O Module Catalog já prevê "ferramentas administrativas" como consumidor.

**Builder promovendo Skills a permanentes ao validar.** Reduziria um passo manual. Preterida: o Module Catalog proíbe explicitamente a promoção automática temporária→permanente; promoção é decisão administrativa (humana), fatia futura.
