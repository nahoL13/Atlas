# @atlas/model-gateway

Adaptador de acesso a modelos de IA (Extension). Sem estado, sem lógica de negócio (Princípio 5/13).

- Interface única `ModelGateway.generate` (geração única; sem streaming/tools).
- Provedor por config: `fake` | `local` (Ollama) | `remote` (OpenAI-compatible).
- Provedores de rede recebem `fetch` por parâmetro (ADR-0004) → testes sem rede; rede real só no smoke.
- Zero deps de runtime além de `@atlas/contracts` (`AtlasError`). `fetch` global; `tsx` é dev tooling.
- Tipos ficam locais; promover a `@atlas/contracts` só com um 2º consumidor, via ADR.
- Não decide objetivo/estratégia, não guarda memória, não executa Tools, não decide permissões.
- Verificação manual dos provedores reais: `scripts/smoke.ts` (ver README).
