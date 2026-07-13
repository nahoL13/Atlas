# @atlas/cognitive

Cognitive Core (Intelligence) — primeiro orquestrador e primeiro consumidor do Model Gateway.

- `createCognitiveCore({ gateway })` → `ask(objetivo)`: uma única chamada `generate()` moldada por um system prompt neutro. Sem estado.
- Conversa multi-turno como **dado** (ADR-0008): `startConversation()` + `respond(conversation, input)` (função pura); o Core segue **sem estado** — o histórico é um valor carregado pelo chamador (hoje a CLI, futuramente o Context Service).
- Ciclo cognitivo honrado de forma **colapsada** (Compreensão + Raciocínio + Resposta); Planejamento/Execução/Observação/Aprendizado ficam para SPECs futuras.
- Depende só do contrato `ModelGateway`/`CognitiveCore` em `@atlas/contracts` (Regra 9), nunca do package `@atlas/model-gateway`.
- System prompt é neutro (orientado à tarefa), **não** uma persona — tom/identidade são do Persona Service (inexistente).
- Não executa comandos/Tools, não persiste memória, não gerencia Tasks, não formata personalidade (Module Catalog).
