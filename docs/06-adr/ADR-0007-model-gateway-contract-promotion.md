# ADR-0007 — Promoção do contrato do Model Gateway para `@atlas/contracts`

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-12

---

# Contexto

A [SPEC-0004](../implementation/specs/SPEC-0004-model-gateway.md) criou `@atlas/model-gateway` e, seguindo a regra do Project Structure ("um contrato só sobe a `@atlas/contracts` quando um segundo package precisar dele, via ADR"), manteve os tipos do gateway (`Role`, `Message`, `GenerateRequest`, `GenerateResult`, `ModelGateway`, `ModelGatewayConfig`, `ProviderName`) **locais** ao package — não havia segundo consumidor.

A [SPEC-0005](../implementation/specs/SPEC-0005-cognitive-core.md) introduz `@atlas/cognitive`, cujo `createCognitiveCore` recebe um `ModelGateway` **por parâmetro** (composição, [ADR-0004](ADR-0004-manual-composition.md)). Isso cria o segundo consumidor do tipo `ModelGateway`: o Model Gateway o **implementa**; o Cognitive Core o **consome**; e o `@atlas/core` (composition root) instancia o gateway a partir da config e o injeta no Cognitive Core.

A Regra de Dependência 9 do Module Catalog exige que componentes dependam de **contratos**, não de implementações concretas. Sem promoção, `@atlas/cognitive` teria de importar o tipo do package de implementação `@atlas/model-gateway`, acoplando-se a ele.

---

# Decisão

Promover o contrato do Model Gateway para `@atlas/contracts`:

- Movem-se para `@atlas/contracts` os tipos: `Role`, `Message`, `GenerateRequest`, `GenerateResult`, `ModelGateway`, `ModelGatewayConfig`, `ProviderName`.
- `@atlas/model-gateway` passa a **importar e implementar** esse contrato (deixa de defini-lo); `HttpDeps`, os provedores (`fake`/`ollama`/`remote`) e a fábrica `createModelGateway` permanecem locais ao package (detalhe de implementação).
- `@atlas/cognitive` depende **apenas** do contrato em `@atlas/contracts` — nunca do package `@atlas/model-gateway`.
- `AtlasConfig` (em `@atlas/contracts`) passa a conter `model: ModelGatewayConfig`.

Promove-se também, pelo mesmo motivo, o contrato do primeiro consumidor:

- `CognitiveCore` (interface `{ ask(objective: string): Promise<string> }`) entra em `@atlas/contracts`, pois `AtlasPlatform` (já um contrato) passa a expor `cognitive: CognitiveCore` e o `apps/cli` (consumidor) precisa do tipo. `@atlas/cognitive` implementa esse contrato; a lógica (`createCognitiveCore`, system prompt) fica no package.

`@atlas/contracts` mantém sua regra de **zero dependências**: só recebem tipos/interfaces, sem runtime novo.

---

# Consequências

Positivas:

- `@atlas/cognitive` depende de contrato, não de implementação (Regra 9); sem acoplamento ao package do gateway.
- Trocar a implementação do Model Gateway não afeta consumidores — apenas o contrato importa.
- `AtlasConfig.model` dá um lar tipado à seleção de provedor, validada no core.

Custos e riscos:

- `@atlas/model-gateway` sofre uma refatoração mecânica (deixa de definir os tipos, passa a importá-los); os testes existentes do package continuam válidos, apenas ajustando imports.
- O contrato do gateway torna-se superfície pública estável — mudanças futuras nele exigem verificar todos os consumidores (`git grep '@atlas/contracts'`).

---

# Alternativas Consideradas

**Manter os tipos em `@atlas/model-gateway` e o Cognitive Core importar de lá.** Acoplaria um componente de decisão (Intelligence) a um package de adaptador (Extension), contrariando a Regra 9 (depender de contratos) e a regra de promoção do Project Structure. Rejeitada.

**O Cognitive Core define seu próprio "port" (interface mínima) e o core adapta o Model Gateway a ele.** Introduz uma segunda interface para o mesmo conceito e diverge do contrato já bem desenhado na SPEC-0004; abstração além da necessidade (YAGNI). Rejeitada.
