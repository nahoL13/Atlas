# @atlas/cognitive

Núcleo cognitivo do Atlas (Module Catalog: Cognitive Core).

`createCognitiveCore({ gateway, personaPrompt? })` devolve um `CognitiveCore` com uma operação — `ask(objetivo): Promise<string>` — que monta uma conversa mínima (system prompt composto + objetivo do usuário), chama `gateway.generate` uma vez e devolve o texto.

O system prompt é **composto** (ADR-0010): o `personaPrompt`, opcional, injetado por parâmetro pelo chamador (a identidade da Persona ativa, resolvida por `@atlas/core`), é concatenado com `TASK_FRAMING` — o enquadramento de tarefa (correção/clareza) fixo do Cognitive. Sem `personaPrompt`, usa-se só `TASK_FRAMING`. O Cognitive não conhece o conceito de Persona — recebe apenas uma string; identidade é responsabilidade do Persona Service.

Para conversa multi-turno, o `CognitiveCore` oferece `startConversation(): Conversation` (semeia o system prompt composto) e `respond(conversation, input): Promise<{ reply, conversation }>` — uma **função pura** que anexa a fala do usuário, chama `gateway.generate` uma vez e devolve a resposta + o histórico atualizado. O Core não guarda estado: a conversa é um valor que o chamador carrega entre os turnos (ADR-0008).

Recebe o `ModelGateway` por parâmetro (composição, ADR-0004); é testado com um gateway stub, sem rede. É consumido pelo `@atlas/core`, que escolhe o provedor de modelo por configuração.
