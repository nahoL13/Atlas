# ADR-0012 — Espinha de execução: plano estruturado Planner-driven, Runtime e Tools

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-14

---

# Contexto

Até a [SPEC-0009](../implementation/specs/SPEC-0009-memory-service.md) o Atlas honrava o ciclo cognitivo de forma **colapsada**: Compreensão + Raciocínio + Resposta numa única chamada `generate()`, sem Planejamento nem Execução. O Atlas só sabia falar. O Module Catalog cataloga Planner (`packages/planner`, consolidável em `packages/cognitive`), Runtime (`packages/runtime`) e Tools (`packages/tools`) como componentes distintos, com autoridade separada. A [SPEC-0010](../implementation/specs/SPEC-0010-planner-runtime-tools.md) introduz a menor fatia que faz Planejamento e Execução existirem, com Tools reais — e levanta a pergunta central: **como a decisão de usar uma Tool flui, e o modelo executa a Tool como?**

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
