# @atlas/model-gateway

Adaptador de acesso a modelos de IA (Extension). Sem estado, sem lógica de negócio (Princípio 5/13).

- Interface única `ModelGateway.generate` (geração única; sem streaming/tools).
- Provedor por config: `fake` | `local` (Ollama) | `remote` (OpenAI-compatible).
- Provedores de rede recebem `fetch` por parâmetro (ADR-0004) → testes sem rede; rede real só no smoke.
- Zero deps de runtime além de `@atlas/contracts` (`AtlasError`). `fetch` global; `tsx` é dev tooling.
- Tipos ficam locais; promover a `@atlas/contracts` só com um 2º consumidor, via ADR.
- Não decide objetivo/estratégia, não guarda memória, não executa Tools, não decide permissões.
- Verificação manual dos provedores reais: `scripts/smoke.ts` (ver README).
- `GenerateResult.usage?: TokenUsage` (SPEC-0054/ADR-0025): os três providers preenchem `usage` a partir do que a própria resposta **já traz** — nenhuma chamada de rede adicional. Regra comum: só entram campos finitos e ≥ 0 (`Math.round`); campo inválido/ausente é omitido individualmente; sem nenhum campo válido, o resultado sai **sem** a propriedade `usage` (nunca `usage: {}`). `remote` (OpenAI-compatible) mapeia `prompt_tokens`/`completion_tokens`/`total_tokens` 1:1, **sem** derivar `totalTokens` (o provedor é a autoridade do próprio total). `local`/Ollama (`/api/chat`) mapeia `prompt_eval_count`/`eval_count` e **deriva** `totalTokens` como a soma dos dois campos válidos. `fake` sintetiza deterministicamente por `countWords` (soma de palavras das mensagens de entrada / do texto de saída) — sem aleatoriedade, duas chamadas idênticas produzem o mesmo `usage`; nunca reflete consumo real.
