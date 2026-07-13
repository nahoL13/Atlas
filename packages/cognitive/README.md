# @atlas/cognitive

Núcleo cognitivo do Atlas (Module Catalog: Cognitive Core).

`createCognitiveCore({ gateway })` devolve um `CognitiveCore` com uma operação — `ask(objetivo): Promise<string>` — que monta uma conversa mínima (system prompt neutro + objetivo do usuário), chama `gateway.generate` uma vez e devolve o texto.

Recebe o `ModelGateway` por parâmetro (composição, ADR-0004); é testado com um gateway stub, sem rede. É consumido pelo `@atlas/core`, que escolhe o provedor de modelo por configuração.
