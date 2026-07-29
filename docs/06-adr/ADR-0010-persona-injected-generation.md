# ADR-0010 — Persona injetada na geração; neutro-por-design superado

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-13

---

# Contexto

As SPECs 0005–0007 mantiveram o system prompt do Cognitive Core **neutro por design** — uma postura declaradamente provisória, justificada por o Persona Service ainda não existir. A [SPEC-0008](../implementation/specs/SPEC-0008-persona-service.md) cria o Persona Service (`@atlas/persona`), com Jarvis como primeira Persona oficial. Surge a pergunta: como a identidade da Persona chega à resposta sem (a) uma segunda chamada de modelo, (b) tornar o Cognitive Core stateful, nem (c) acoplar o Cognitive ao conceito de Persona?

---

# Decisão

A Persona molda a **geração**, injetando um enquadramento de identidade no system prompt da única chamada `generate`:

- O Persona Service deriva, dos atributos textuais da Persona (nome, tom, formalidade, idioma, estilo, regras), um `systemPrompt(persona): string` — o enquadramento de **identidade**.
- O Cognitive Core recebe esse texto como `personaPrompt?: string` por parâmetro e o compõe com seu enquadramento de **tarefa** (`TASK_FRAMING`): `system = personaPrompt ? \`${personaPrompt}\n\n${TASK_FRAMING}\` : TASK_FRAMING`. O Cognitive **não conhece o conceito de Persona** — só recebe uma string.
- A composição (`@atlas/core`) resolve a Persona ativa (`config.persona`, default `jarvis`) e injeta seu `systemPrompt`. Isso realiza "Persona é usada pelo Cognitive Core" ([Module Catalog](../03-architecture/ModuleCatalog.md)) **via composição**, sem inverter dependência.
- O "neutro por design" das SPECs 0005–0007 fica **superado**: o Cognitive mantém o enquadramento de tarefa (correção/clareza); a identidade passa a ser responsabilidade da Persona.
- `respond` permanece **função pura**; o Cognitive segue sem estado.

---

# Consequências

Positivas:

- Uma única chamada de modelo; resposta coerente na voz da Persona.
- Cognitive desacoplado do conceito de Persona (recebe string) — testável isoladamente; a Persona é trocável por config.
- Separação limpa: Cognitive = correção; Persona = identidade. Jarvis é configuração, não Core ([Glossary](../00-project/Glossary.md)).

Custos e riscos:

- O enquadramento de identidade e o de tarefa convivem no mesmo system message; personas mal-escritas podem conflitar com o enquadramento de tarefa. Mitigado por manter o `TASK_FRAMING` enxuto e neutro de identidade.
- Voz e emoção simulada ficam como slots declarativos inertes (sem canal que os consuma); documentado para não virarem superfície fantasma.

---

# Alternativas Consideradas

**Re-estilização na saída (2ª chamada de modelo).** Custaria o dobro e poderia divergir do conteúdo original. Rejeitada.

**Cognitive importa o Persona Service e resolve a identidade por dentro.** Acoplaria o Cognitive ao conceito de Persona e arriscaria estado. Rejeitada — a injeção por parâmetro (string) mantém o baixo acoplamento.

**Manter o neutro e aplicar persona só no Output Gateway.** Perderia a coerência da geração (o modelo não "assume" a identidade ao raciocinar) e exigiria pós-processamento. Rejeitada.

---

# Nota de atualização (ADR-0020 / SPEC-0039)

O [ADR-0020](ADR-0020-persona-persistence-voice-binding.md) (Accepted) supera **parcialmente** a premissa "registro embutido" deste ADR: desde a SPEC-0039, o Persona Service passa a persistir Personas custom criadas pelo usuário, atrás de uma porta de storage injetável (molde do Memory Service, ADR-0011) — o que aqui era implicitamente "sempre um registro fixo em código" deixa de valer para as Personas custom (as embutidas `jarvis`/`neutral` continuam vindo só do registro em código, imutáveis).

**O que muda:** a origem do dado (`Persona`) deixa de ser só leitura de um registro fixo — passa a incluir, opcionalmente, leitura/escrita atrás de uma porta de persistência.

**O que não muda, e é o ponto central deste ADR:** a composição do system prompt continua exatamente a mesma — uma única chamada de modelo, `personaPrompt = personaService.systemPrompt(persona)` injetado no Cognitive Core como string opaca. O Cognitive não passa a conhecer storage, persistência ou o conceito de Persona custom — recebe a mesma string que recebia antes, agora possivelmente composta a partir de uma Persona que veio do disco em vez do código-fonte. `voice`/`emotion` seguem fora do `systemPrompt` (slots declarativos); o ADR-0020 acrescenta `voiceURI?`, que também não entra no prompt — é consumido só pelo TTS de `apps/desktop`, fora do caminho de geração que este ADR descreve.
