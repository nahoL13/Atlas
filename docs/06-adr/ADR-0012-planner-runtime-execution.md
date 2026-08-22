# ADR-0012 — Espinha de execução: plano estruturado Planner-driven, Runtime e Tools

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-14

---

# Contexto

Até a [SPEC-0009](../implementation/specs/SPEC-0009-memory-service.md) o Atlas honrava o ciclo cognitivo de forma **colapsada**: Compreensão + Raciocínio + Resposta numa única chamada `generate()`, sem Planejamento nem Execução. O Atlas só sabia falar. O [Module Catalog](../03-architecture/ModuleCatalog.md) cataloga Planner (`packages/planner`, consolidável em `packages/cognitive`), Runtime (`packages/runtime`) e Tools (`packages/tools`) como componentes distintos, com autoridade separada. A [SPEC-0010](../implementation/specs/SPEC-0010-planner-runtime-tools.md) introduz a menor fatia que faz Planejamento e Execução existirem, com Tools reais — e levanta a pergunta central: **como a decisão de usar uma Tool flui, e o modelo executa a Tool como?**

---

# Decisão

**Plano estruturado Planner-driven; Model Gateway intacto.** O modelo produz um **plano em texto estruturado** (JSON) por meio do `generate()` atual; o Runtime o executa deterministicamente. Não se adota tool/function-calling nativo — que mudaria o Model Gateway, borraria a fronteira Planner/Runtime e dependeria de suporte do provedor local. O fluxo respeita a Matriz de Autoridade: Cognitive Core **decide e orquestra** → Planner **transforma** a saída num Plan → Runtime **executa** → Cognitive **compõe** a resposta.

**Papéis.** O **Planner** (consolidado em `@atlas/cognitive`) é **puro**, sem gateway: fornece a instrução de planejamento (lista as Tools + schema JSON) e **parseia** a saída do modelo num `Plan` (ou `null` = resposta direta). O **Cognitive Core** faz as chamadas ao modelo e orquestra: 1ª chamada (prompt composto + instrução) → parse → se houver plano, `runtime.execute` + 2ª chamada de composição com os resultados. O **Runtime** (`@atlas/runtime`) coordena a execução sequencial sobre um **Tool Registry** e expõe `tools()`; nunca lança por falha de Tool (falhas são `ToolResult`/`ExecutedStep` estruturados). As **Tools** (`@atlas/tools`) são adaptadores puros (`clock`, `calc`), sem decidir quando são usadas.

**Colapso honesto da classificação.** A decisão "responder direto × precisar de Tool" está **colapsada** na 1ª chamada `generate()` (como Compreensão+Raciocínio+Resposta já estavam colapsados). Quando o objetivo não precisa de Tool, o parse retorna `null` e o Atlas responde em **1** chamada, com o mesmo prompt composto (persona + memória + tarefa) de antes — sem regressão de comportamento nem custo.

**Transparência via `AskResult`.** `CognitiveCore.ask` passa a retornar `AskResult { text; steps? }`; o CLI mostra um traço compacto da execução — tangível e verificável sem depender do Activity Service (inexistente).

**Passos independentes.** Nesta fatia os passos de um plano não têm dependência de dados entre si: o Runtime executa todos e a composição recebe os resultados juntos. Grafo de dependências / threading de dados é fatia futura.

---

# Consequências

Positivas:

- Planejamento e Execução deixam de ser colapsados; o Atlas passa a **fazer** (hora e aritmética reais).
- Model Gateway estável; fronteiras de autoridade limpas; Planner puro e testável sem gateway.
- Tools/Runtime dependem só de contratos; segunda Tool é só `registry.register(x)` — a máquina já é multi-tool.

Custos e riscos:

- Confiabilidade do plano depende do modelo emitir JSON parseável (mitigado: parse falha → resposta direta; risco documentado; modelos locais variam).
- Roteamento answer-vs-plan colapsado numa chamada mistura "responder em texto" e "emitir JSON" — aceitável nesta fatia; descolapsar é trabalho futuro.
- Tools puras por ora (sem Permission Service): Tools com efeito colateral aguardam o serviço de permissão.

---

# Alternativas Consideradas

**Tool/function-calling nativo no Model Gateway.** Padrão de mercado e mais poderoso, mas muda o Gateway, borra Planner/Runtime e depende de suporte do provedor local. Rejeitada nesta fatia.

**Planner que chama o modelo.** Faria o Planner consumir o gateway e produzir o plano sozinho. Rejeitada: manter o Planner **puro** (schema + parse) e deixar a chamada no Cognitive Core preserva a autoridade estratégica e a testabilidade sem gateway.

**Manter `ask(): Promise<string>` e esconder a execução.** Mais fino, mas a execução ficaria invisível/inverificável no terminal. Rejeitada em favor de `AskResult` (transparência é valor do ciclo cognitivo).

**Task Manager completo (fila/retry/timeout/cancelamento).** Cedo demais para execução sequencial de Tools puras (YAGNI). Adiada para quando surgir execução assíncrona/Skills.

---

# Atualização ([SPEC-0014](../implementation/specs/SPEC-0014-tools-confirm-in-chat.md))

A orquestração Planejamento + Execução registrada nesta decisão, até aqui exclusiva de `ask`, passa a valer também para `respond`:

- **`respond(conversation, input)` orquestra no mesmo padrão de `ask`.** 1ª `generate` (com a instrução do Planner) → `planner.parse` → sem plano, resposta direta em 1 chamada (comportamento anterior preservado); com plano, `runtime.execute(plan)` + 2ª `generate` de composição. A instrução do Planner entra como uma mensagem `system` adicional, posicionada **antes** do turno do usuário (não depois) — a última mensagem enviada ao modelo segue sendo o input do usuário, preservando a ordem que `ask` já usa.
- **`ConversationTurn` ganha `steps?: readonly ExecutedStep[]`**, espelhando `AskResult { text; steps? }` — o mesmo traço de transparência (incluindo passos negados/bloqueados) chega ao `chat`, reusando a renderização já usada por `ask`.
- **O `confirm` interativo (ADR-0013) passa a alcançar `chat`.** O Runtime já pausava em `confirm` via `ConfirmPort`; `respond` agora aguarda `runtime.execute` exatamente como `ask` já fazia — nenhuma mudança em `@atlas/runtime`. O `atlas chat` compõe um `ConfirmPort` sobre o mesmo `LineReader` da sessão (não um segundo `readline`), tornando a confirmação inline na conversa.
- **Nada muda no Planner, no Runtime, no Permission Service nem nas Tools.** A fatia é inteiramente composição do que já existia — a mesma elegância observada na atualização da SPEC-0013 (Cognitive/CLI inalterados para `ask`) se repete aqui do lado de `respond`.

---

# Atualização ([SPEC-0019](../implementation/specs/SPEC-0019-observation-replan-loop.md) / [ADR-0015](ADR-0015-observation-replan-loop.md))

A decisão de **"passos independentes / execução em passe único"** registrada acima ("grafo de dependências / threading de dados é fatia futura") foi **parcialmente revisitada** pela Etapa 5 (Observação), decidida no [ADR-0015](ADR-0015-observation-replan-loop.md):

- O `runPlanCycle` deixa de ser passe único e vira um **laço com teto fixo (1 replanejamento)**: plano → `runtime.execute` → **`observe`** (função pura/determinística nova em `@atlas/cognitive`) → se houver falha de Tool e restar orçamento, uma chamada de replanejamento (com resumo compacto das falhas) produz novo plano e reexecuta.
- **Os passos seguem independentes dentro de cada passe** — o ADR-0015 fecha a lacuna de *reavaliação/replanejamento* do ciclo, não a de *dependência de dados entre passos* (esta continua fatia futura, agora explicitamente listada como candidata).
- A única mudança de contrato é o campo opcional `ExecutedStep.denialKind?: 'blocked' | 'declined'`, que o Runtime rotula nos dois branches de negação — o modelo de resultado da execução deste ADR (`ok`/`error`) ganhou o discriminador que a Observação precisava para distinguir falha de Tool de negação de política/consentimento sem parsear strings.

---

# Atualização ([SPEC-0058](../implementation/specs/SPEC-0058-untrusted-tool-output-framing.md))

A composição dos resultados de execução (`formatResults`/`summarizeFailures`, movidas de `cognitive-core.ts` para `packages/cognitive/src/tool-output.ts`, novo módulo puro) e a chamada de replanejamento passam a delimitar cada `ExecutedStep` num bloco `<tool_output id="N">`, truncado por um teto determinístico e com o delimitador neutralizado contra forja, precedido de uma mensagem `system` fixa (`UNTRUSTED_TOOL_OUTPUT_FRAMING`) que instrui o modelo a tratar aquele conteúdo como dado — não como ordem —, inserida só quando há texto de Tool na chamada. Nenhum contrato deste ADR muda: `ExecutedStep`/`Plan`/o modelo `ok`/`error` de resultado seguem intactos, `Message`/`role` de `@atlas/contracts` não ganham campo novo, e o traço que o usuário vê (`AskResult.steps`/`ConversationTurn.steps`) continua carregando o `ExecutedStep` cru, sem truncagem nem neutralização — a mudança é só no texto que o **modelo** recebe, nunca no que a execução produz ou no que a interface mostra. Mitigação de injeção indireta de prompt (residual do ADR-0026/SPEC-0055); mais detalhe na atualização correspondente do ADR-0026.
