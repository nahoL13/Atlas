# @atlas/cognitive

Cognitive Core (Intelligence) — primeiro orquestrador e primeiro consumidor do Model Gateway.

- `createCognitiveCore({ gateway, personaPrompt? })` → `ask(objetivo)`: uma única chamada `generate()` moldada pelo system prompt composto. Sem estado.
- Conversa multi-turno como **dado** (ADR-0008): `startConversation()` + `respond(conversation, input)` (função pura); o Core segue **sem estado** — o histórico é um valor carregado pelo chamador (hoje a CLI, futuramente o Context Service).
- Ciclo cognitivo honrado de forma **colapsada** (Compreensão + Raciocínio + Resposta); Planejamento/Execução/Observação/Aprendizado ficam para SPECs futuras.
- Depende só do contrato `ModelGateway`/`CognitiveCore` em `@atlas/contracts` (Regra 9), nunca do package `@atlas/model-gateway`.
- System prompt é **composto** (ADR-0010 + ADR-0011): `personaPrompt` (identidade) + `memoryPrompt` (fatos memorizados) + `TASK_FRAMING` (enquadramento de tarefa, correção/clareza), na ordem identidade → memória → tarefa — `system = [personaPrompt, memoryPrompt, TASK_FRAMING].filter(Boolean).join('\n\n')`. Ambos `personaPrompt` e `memoryPrompt` são opcionais, injetados por parâmetro. A identidade é do Persona Service e a memória é do Memory Service; o Cognitive **não conhece os conceitos de Persona nem de Memory**, só recebe strings.
- Não executa comandos/Tools, não persiste memória, não gerencia Tasks, não formata personalidade (Module Catalog).
