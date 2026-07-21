# ADR-0018 — Consumo de Skills no laço cognitivo: seleção pelo Planner

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-21

Estende / supera parcialmente: [ADR-0017](ADR-0017-skills-registry-builder.md)

---

> **Nota de atualização (2026-07-21, SPEC-0026, `Done`):** a decisão registrada aqui saiu de decisão para **implementada**. `Plan.skillId?: string` (`@atlas/contracts`, aditivo), `planner.instruction(tools, skills?)`/`parse` (catálogo + seleção), `CognitiveCoreDeps.skillCatalog?` (projeção somente-leitura, tipo interno a `@atlas/cognitive`) e a fiação em `@atlas/core` (`skillCatalog: { list, get }`) entregam exatamente a forma A fixada por este ADR — Runtime intacto, Skill invisível ao usuário, contratos aditivos. Detalhe completo: [SPEC-0026](../implementation/specs/SPEC-0026-planner-skill-consumption.md).

---

# Contexto

A [SPEC-0025](../implementation/specs/SPEC-0025-skills-registry-builder.md) (`Done`), consumindo o [ADR-0017](ADR-0017-skills-registry-builder.md), materializou `packages/skills` (`@atlas/skills`) com o **Skill Registry** (catálogo em memória: `register`/`get`/`deactivate`/`remove`/`list`, guard de `permanent`) e o **Skill Builder** (8 passos, uma `gateway.generate`, validação estática). Por decisão humana registrada no ADR-0017, essa primeira fatia deixou o Registry **passivo**: **nada no laço cognitivo consome Skills** — Planner, Cognitive Core, Runtime e Observer ficaram com diff de produção vazio, e "o Cognitive Core **não conhece** o conceito de Skill". O próprio ADR-0017 registrou o consumo — "seleção pelo usuário (à la Persona) ou pelo Planner/modelo" — como **fatia futura explícita** (Consequências, "Capacidade sem consumidor"; Alternativas, "Registry ativo").

O [Roadmap](../04-engineering/Roadmap.md) marca o item **1.4 — Skills** como `gate · ADR primeiro`. A SPEC-0025 fechou o critério "Skills existem como conceito **implementado**, não só documentado", mas o item ficou **parcialmente entregue**: o consumo segue candidato. Reabrir o consumo revisita a fronteira que o ADR-0017 fixou por decisão humana — por isso **este ADR precede a SPEC**.

A base no PRD é a seção **Especialização**: "utilizar especializações para resolver diferentes tipos de problemas", "o usuário **não** deve precisar selecionar manualmente", "escolher **automaticamente** a estratégia mais adequada". O [Module Catalog](../03-architecture/ModuleCatalog.md) já autoriza o **Planner** a usar o "catálogo de Skills" (l. 351) entre suas entradas, e proíbe o **Runtime** de "escolher Skills por conta própria" (l. 470) — a seleção pertence à camada de planejamento, não à de execução.

**A decisão de forma foi tomada pelo humano (escalação deste gate, resolvida): o consumo é por seleção pelo Planner/modelo (forma A), não seleção explícita pelo usuário (forma B).** Este ADR captura essa decisão, delimita o raio da primeira fatia de consumo e registra o que fica para fatias futuras.

A pergunta central: **como o laço cognitivo passa a selecionar e aplicar uma Skill registrada — automaticamente, sem o usuário escolher — preservando as fronteiras do Module Catalog (Planner seleciona, Runtime não; Skill não fala com o usuário; Memory detém persistência) e mantendo `respond` puro e o Core sem estado?**

---

# Decisão

**O laço cognitivo passa a consumir Skills por seleção do Planner/modelo. O Planner ganha o catálogo de Skills como entrada; quando uma Skill é selecionada, suas `instructions` e `toolIds` alimentam o plano e a composição da resposta. A seleção é automática — o usuário nunca escolhe uma Skill (PRD: "não deve precisar selecionar manualmente").**

**A seleção vive no Planner, não no Runtime nem no Cognitive Core.** O Module Catalog já lista "catálogo de Skills" entre as entradas do Planner (l. 351) e proíbe o Runtime de escolher Skills (l. 470). O `createPlanner()` — hoje puro, `instruction(tools)` + `parse(saída) → Plan | null` — passa a receber também o catálogo de Skills disponível: `instruction(tools, skills)` lista as Skills registradas (por `id`/`name`/`description`, **metadados**, não o corpo de `instructions`) junto do catálogo de Tools, e a saída estruturada do modelo pode indicar **no máximo uma** Skill selecionada por seu `id`. O Planner continua **puro** (sem gateway, sem IO); recebe o catálogo por injeção, importando só o tipo `Skill`/`SkillDescriptor` de `@atlas/contracts` (nunca `@atlas/skills`), exatamente como já importa `Runtime` sem depender do package.

**A Skill selecionada é aplicada como dado, no molde da Persona/Memory injetadas na geração (ADR-0010/0011).** Quando o plano indica uma Skill, o Cognitive Core injeta as `instructions` dela na `generate()` de composição da resposta (a fatia especializada de conhecimento/regras entra no system prompt do turno, junto de Persona + Memory + `TASK_FRAMING`), e os `toolIds` da Skill informam quais Tools o plano prioriza. A Skill **não fala com o usuário** (Module Catalog, regra 4) — sua contribuição é interna à geração, invisível como Persona e Memory já são. O usuário percebe **uma única Persona** (Constituição, Artigo 2) e a especialização permanece **invisível** (Artigo 9); a Skill é coordenação interna.

**A primeira fatia consome apenas Skills registradas no processo — na prática, as `permanent` semeadas (`BUILTIN_SKILLS`).** O Registry é **em memória** (ADR-0017): as Skills `permanent` semeadas são recriadas a cada processo e **sobrevivem** entre invocações; uma Skill `temporary` construída por `atlas skills build` **não** sobrevive. Consumir as Skills registradas cobre integralmente as `permanent` semeadas sem exigir persistência. **A persistência do acervo de Skills (porta de storage, à la Memory no ADR-0011) fica fora desta fatia** — sem ela, Skills construídas pelo Builder ainda não são consumíveis numa invocação posterior. É a mesma fronteira que o ADR-0017 adiou; entra numa fatia futura, casada com o consumo de Skills temporárias.

**Contratos aditivos.** `Plan`/`PlanStep` podem ganhar um campo opcional que registra a Skill selecionada (ex.: `skillId?`), aditivo, no molde do `denialKind?` do [ADR-0015](ADR-0015-observation-replan-loop.md). `Skill`/`SkillDescriptor`/`SkillRegistry` já são públicos (ADR-0017); nenhum contrato existente muda de forma. `respond` continua **função pura**, o Core continua **sem estado** (ADR-0008).

**O Runtime permanece agnóstico a Skills.** A seleção é resolvida no planejamento; o Runtime executa os passos do `Plan` (Tools por nome) exatamente como hoje. Se a fatia concluir que o Runtime precisa conhecer a Skill selecionada para expor seus `toolIds`, isso é decisão da SPEC dentro desta fronteira — mas a posição default deste ADR é **não** tocar o Runtime (a contribuição da Skill é de planejamento + composição), preservando "Runtime não escolhe Skills" e o mínimo raio.

**Supera parcialmente o ADR-0017.** A decisão "Registry passivo, nada consome Skills" do ADR-0017 era explicitamente rotulada como primeira fatia, com o consumo adiado. Este ADR ativa o consumo pela forma A; o ADR-0017 permanece `Accepted` quanto ao Registry/Builder e ganha nota de atualização apontando para cá. As proibições estruturais do ADR-0017 seguem intactas: Builder não promove `temporary`→`permanent`, Skill não fala com o usuário, `permanent` protegida contra sobrescrita.

---

# Consequências

Positivas:

- **O gate 1.4 do Roadmap fecha por inteiro.** Skills deixam de ser catálogo inerte: o laço cognitivo as seleciona e aplica automaticamente, cumprindo o PRD ("escolher automaticamente", "não selecionar manualmente").
- **Fronteiras do Module Catalog respeitadas.** Seleção no Planner (autorizado a ler o catálogo de Skills), execução no Runtime (que continua sem escolher Skills), Skill sem canal com o usuário, Persona única percebida.
- **Padrão do projeto preservado.** A Skill entra na geração como dado injetado, no molde de Persona (ADR-0010) e Memory (ADR-0011); o Planner segue puro e recebe o catálogo por injeção, como já recebe o `Runtime`; contratos aditivos, como `denialKind?` (ADR-0015).
- **Raio contido.** Toca Planner (entrada + seleção) e Cognitive Core (injeção da Skill na composição); Runtime intacto por default; persistência fora. Zero mudança nas proibições do ADR-0017.
- **Fronteira limpa para a fatia de persistência.** Quando a porta de storage de Skills chegar, o consumo já existe e passa a valer também para Skills `temporary` construídas pelo Builder, sem redesenho.

Custos e riscos:

- **Skills `temporary` construídas ainda não são consumíveis entre invocações.** Sem persistência, `atlas skills build` produz uma Skill que some ao fim do processo; o consumo desta fatia alcança só as `permanent` semeadas. Aceito: mesma fronteira adiada pelo ADR-0017; o valor imediato é fechar o laço de seleção automática sobre o acervo permanente.
- **Qualidade da seleção depende do modelo.** O Planner delega ao modelo a escolha da Skill; modelo fraco pode selecionar uma Skill irrelevante ou nenhuma. Mitigado: seleção é opcional (plano sem Skill = comportamento de hoje, preservado) e limitada a **uma** Skill por turno; a Skill selecionada é validada contra o Registry antes de aplicar (id inexistente → ignora, sem quebrar o turno).
- **Seed `permanent` deixa de ser dado inerte.** A Skill semeada, "morta" no ADR-0017, passa a ser selecionável — exige que `BUILTIN_SKILLS` traga ao menos uma Skill com `instructions`/`toolIds` úteis e Tools resolvíveis, sob risco de o consumo parecer no-op.
- **Uma etapa de acoplamento nova.** O Planner passa a conhecer o tipo `Skill`. Contido a `@atlas/contracts` (já público) e à injeção do catálogo; o Planner não importa `@atlas/skills`, preservando o Artigo 5 (componentes desacoplados, comunicação só por contratos).

---

# Alternativas Consideradas

**Forma B — seleção explícita pelo usuário (à la Persona: CLI/config escolhe a Skill ativa).** Menor acoplamento cognitivo — a Skill entraria como a Persona entra, sem o Planner decidir. **Preterida por decisão humana e pelo PRD:** a seção Especialização é explícita em que "o usuário não deve precisar selecionar manualmente" e o sistema deve "escolher automaticamente a estratégia mais adequada"; seleção manual contraria o requisito. Além disso puxaria persistência do Registry para dentro da primeira fatia (a Skill ativa escolhida por config precisaria existir de forma estável).

**Forma C — fatiar: 1ª SPEC entrega só o gancho (Planner enxerga o catálogo), aplicação de `instructions`/`toolIds` depois.** Menor raio por SPEC. Preterida: enxergar sem aplicar repete o padrão "capacidade sem consumidor" que o ADR-0017 já pagou uma vez; o gancho isolado não fecha o gate 1.4 nem entrega valor observável. Uma fatia que seleciona **e** aplica sobre as Skills `permanent` já é mínima e completa.

**Seleção no Runtime (Runtime escolhe a Skill ao executar o plano).** Aproximaria seleção e execução. Preterida: o Module Catalog proíbe o Runtime de "escolher Skills por conta própria" (l. 470) e coloca o "catálogo de Skills" nas entradas do **Planner** (l. 351). Seleção é planejamento, não execução.

**Persistir Skills nesta fatia (porta de storage, à la Memory/ADR-0011), para consumir também Skills `temporary` construídas.** Tornaria o Builder imediatamente útil ponta a ponta. Preterida por YAGNI e mínimo raio: o consumo sobre as Skills `permanent` semeadas já fecha o gate sem infraestrutura de persistência; a porta de storage entra quando o alvo for consumir o acervo construído, numa fatia dedicada. Mantém a coerência com o adiamento do próprio ADR-0017.

**A Skill selecionada injetada como mensagem na `Conversation` (à la resumo de Tools da SPEC-0014).** Deixaria rastro persistente da Skill entre turnos. Preterida: a Skill é fatia de conhecimento do turno, não evento de conversa; injetá-la na geração (como Persona/Memory) mantém `respond` puro e o Core sem estado, sem inflar a `Conversation` com conteúdo interno.

**Múltiplas Skills por turno (o plano combina várias Skills).** Mais poder de composição. Preterida nesta fatia: combinar `instructions`/`toolIds` de várias Skills abre conflito de regras e explosão de escopo sem demanda; **uma** Skill por turno é o corte mínimo. Composição de múltiplas Skills fica para fatia futura, se um requisito a exigir.
