# ADR-0010 — Persona injetada na geração; neutro-por-design superado

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-13

---

# Contexto

As SPECs 0005–0007 mantiveram o system prompt do Cognitive Core **neutro por design** — uma postura declaradamente provisória, justificada por o Persona Service ainda não existir. A SPEC-0008 cria o Persona Service (`@atlas/persona`), com Jarvis como primeira Persona oficial. Surge a pergunta: como a identidade da Persona chega à resposta sem (a) uma segunda chamada de modelo, (b) tornar o Cognitive Core stateful, nem (c) acoplar o Cognitive ao conceito de Persona?

---

# Decisão

A Persona molda a **geração**, injetando um enquadramento de identidade no system prompt da única chamada `generate`:

- O Persona Service deriva, dos atributos textuais da Persona (nome, tom, formalidade, idioma, estilo, regras), um `systemPrompt(persona): string` — o enquadramento de **identidade**.
- O Cognitive Core recebe esse texto como `personaPrompt?: string` por parâmetro e o compõe com seu enquadramento de **tarefa** (`TASK_FRAMING`): `system = personaPrompt ? \`${personaPrompt}\n\n${TASK_FRAMING}\` : TASK_FRAMING`. O Cognitive **não conhece o conceito de Persona** — só recebe uma string.
- A composição (`@atlas/core`) resolve a Persona ativa (`config.persona`, default `jarvis`) e injeta seu `systemPrompt`. Isso realiza "Persona é usada pelo Cognitive Core" (Module Catalog) **via composição**, sem inverter dependência.
- O "neutro por design" das SPECs 0005–0007 fica **superado**: o Cognitive mantém o enquadramento de tarefa (correção/clareza); a identidade passa a ser responsabilidade da Persona.
- `respond` permanece **função pura**; o Cognitive segue sem estado.

---

# Consequências

Positivas:

- Uma única chamada de modelo; resposta coerente na voz da Persona.
- Cognitive desacoplado do conceito de Persona (recebe string) — testável isoladamente; a Persona é trocável por config.
- Separação limpa: Cognitive = correção; Persona = identidade. Jarvis é configuração, não Core (Glossary).

Custos e riscos:

- O enquadramento de identidade e o de tarefa convivem no mesmo system message; personas mal-escritas podem conflitar com o enquadramento de tarefa. Mitigado por manter o `TASK_FRAMING` enxuto e neutro de identidade.
- Voz e emoção simulada ficam como slots declarativos inertes (sem canal que os consuma); documentado para não virarem superfície fantasma.

---

# Alternativas Consideradas

**Re-estilização na saída (2ª chamada de modelo).** Custaria o dobro e poderia divergir do conteúdo original. Rejeitada.

**Cognitive importa o Persona Service e resolve a identidade por dentro.** Acoplaria o Cognitive ao conceito de Persona e arriscaria estado. Rejeitada — a injeção por parâmetro (string) mantém o baixo acoplamento.

**Manter o neutro e aplicar persona só no Output Gateway.** Perderia a coerência da geração (o modelo não "assume" a identidade ao raciocinar) e exigiria pós-processamento. Rejeitada.
