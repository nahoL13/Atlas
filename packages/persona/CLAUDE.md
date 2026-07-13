# @atlas/persona

Persona Service (Interaction) — aplica a identidade selecionada à interação (ADR-0010).

- `createPersonaService(): PersonaService` → `get/has/list` sobre um registro embutido de Personas; `systemPrompt(persona)` deriva o enquadramento de identidade dos atributos textuais.
- Personas embutidas: `jarvis` (default) e `neutral`. `PERSONA_IDS` lista os ids conhecidos (fonte da validação de config no core).
- Persona é **configuração de dados** (Glossary: "Jarvis será uma configuração de Persona, não um novo Core"). Não decide estratégia, não cria Plans, não executa Tasks (Module Catalog).
- A identidade é **injetada na geração** do Cognitive Core (ADR-0010): o core passa `persona.systemPrompt(...)` como `personaPrompt`. O Cognitive não conhece o conceito de Persona.
- Voz e emoção são slots **declarativos e inertes** (sem canal de áudio/afeto; não entram no `systemPrompt`).
- Depende só de `@atlas/contracts`. Erro de persona desconhecida: `PersonaError` (`AtlasError` code `ATLAS_PERSONA`).
