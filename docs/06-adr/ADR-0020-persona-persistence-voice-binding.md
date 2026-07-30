# ADR-0020 — Persona persistível com storage injetável e voz vinculada ao TTS

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-28

---

# Contexto

Desde o [ADR-0010](ADR-0010-persona-injected-generation.md), Persona é **configuração de dados embutida**: um registro fixo (`jarvis`/`neutral`) em `packages/persona/src/personas.ts`, sem porta de storage, sem escrita, imutável em runtime. A [SPEC-0037](../implementation/specs/SPEC-0037-desktop-runtime-persona-switch.md) entregou seleção/troca de Persona pela GUI, mas só entre as embutidas — e registrou explicitamente, em `NEXT_CONTEXT.md`, o pedido do usuário de uma fatia seguinte: **criar Persona pela interface** (personalidade e voz).

Essa fatia exige duas mudanças estruturais que a Emenda v1.1 da Constituição classifica como escalação obrigatória (possível mudança de responsabilidade no Module Catalog + estado persistente novo):

1. O Persona Service precisa passar a **persistir** Personas criadas pelo usuário — hoje ele não tem nenhuma porta de storage, diferente do Memory Service, que desde o [ADR-0011](ADR-0011-memory-service-persistence.md) já resolveu exatamente esse problema (persistência atrás de porta injetável, load-once + write-through).
2. O campo `Persona.voice` hoje é **texto descritivo inerte** — não alimenta nenhum canal real. O TTS (SPEC-0035/[ADR](../implementation/specs/SPEC-0035-desktop-voice-output-tts.md), endurecido pela [SPEC-0036](../implementation/specs/SPEC-0036-desktop-tts-local-voice-only.md)) escolhe deterministicamente a 1ª voz local do SO, sem nenhuma leitura da Persona ativa. O usuário pediu que a Persona custom possa **escolher uma voz real** do sistema, criando o primeiro acoplamento de fato entre Persona e TTS.

O Module Catalog já lista, na seção do Persona Service, que ele **deve controlar** "voz" e **pode utilizar** "recursos de voz quando disponíveis" — a decisão abaixo realiza isso, sem mover responsabilidade para um módulo novo.

---

# Decisão

**(a) Persona Service ganha uma porta de storage injetável, no molde exato do Memory Service.**

- Nova porta interna `PersonaStorage { load(): readonly CustomPersonaRecord[]; save(personas): void }`, **não** promovida a `@atlas/contracts` (mesma regra do `MemoryStorage`: porta fica no package dono, só o tipo público `Persona`/`PersonaService` sobe ao contrato).
- Default `createFilePersonaStorage(path)` sobre arquivo JSON, criado sob demanda; ausência de arquivo → lista vazia; JSON inválido → erro estruturado, falha alta (nunca descarta Personas do usuário).
- `createPersonaService({ storage? })`: sem `storage` injetado, comportamento **idêntico ao de hoje**, byte a byte (só as Personas embutidas — não regride nenhum consumidor existente, inclusive `apps/cli`, que não recebe o storage nesta fatia). Com `storage`, `get`/`has`/`list` passam a enxergar embutidas + custom combinadas; `create`/`update`/`delete` (membros novos de `PersonaService`) mutam em memória e persistem imediatamente (write-through).
- **Personas embutidas (`jarvis`/`neutral`) continuam imutáveis** — vêm sempre do registro em código, nunca do storage; `create`/`update`/`delete` rejeitam operar sobre um `id` embutido.
- Isso realiza, sem módulo novo, o que o Module Catalog já previa ("configuração da Persona" como algo que o serviço deve controlar) — supera a premissa "registro embutido" do ADR-0010, que fica **parcialmente superado**: a Persona deixa de ser só leitura de um registro fixo, mas a injeção na geração (`systemPrompt` composto no Cognitive) não muda em nada.

**(b) `Persona` ganha `voiceURI?: string`, opcional, vinculando a Persona a uma voz real do SO — com fallback fail-closed.**

- Campo aditivo em `@atlas/contracts`. Personas embutidas não setam `voiceURI` (permanecem sem voz vinculada).
- O TTS (`apps/desktop/src/speech-output.ts`) passa a receber o `voiceURI?` da Persona ativa: se presente e a voz ainda existir entre as vozes locais correntes, usa-a; se ausente ou a voz não existir mais (troca de máquina, voz desinstalada), **cai para a seleção determinística já existente** (1ª voz local, SPEC-0036) — nunca fica mudo por causa disso, e **nunca** cai para uma voz de rede (a garantia fail-closed da SPEC-0036 permanece intacta, só ganha mais uma camada de fallback antes dela).
- A lista de vozes elegíveis para escolha continua **só** as marcadas `localService === true` — a Persona nunca pode apontar para uma voz de rede.

**Ambas as mudanças ficam confinadas a `@atlas/persona` (contrato + package) e `apps/desktop` (consumo).** `@atlas/cognitive` continua recebendo só uma string (`personaPrompt`) — não conhece storage nem voz. `apps/cli` não ganha comando novo nesta fatia (equivalente de CLI fica candidato futuro independente, mesmo tratamento já registrado para `list`/`use` na SPEC-0037).

---

# Consequências

Positivas:

- Reusa um padrão já validado três vezes no repo (Memory Service, Skills Registry, agora Persona) — porta injetável + load-once + write-through — em vez de inventar um mecanismo novo.
- Personas custom ganham identidade sonora real sem introduzir nenhuma dependência de rede nem enfraquecer a garantia da SPEC-0036.
- Personas embutidas seguem imutáveis e testáveis como hoje — nenhum consumidor existente (`apps/cli`, testes atuais de `@atlas/persona`) regride.

Custos e riscos:

- `PersonaService` deixa de ser um serviço puramente de leitura — ganha superfície de escrita e, por extensão, um novo modo de falha (storage indisponível/corrompido). Mitigado pela mesma postura fail-high da Memória (nunca descarta silenciosamente).
- O acoplamento Persona↔TTS, mesmo com fallback, introduz um caminho onde a experiência de voz de uma sessão depende de dados que podem não existir na máquina atual (voz específica ausente) — mitigado pelo fallback determinístico, nunca por silêncio inesperado sem explicação.
- Superfície de UI cresce (formulário completo, CRUD) — aceito porque o usuário pediu paridade total com os campos existentes de Persona, não um subconjunto reduzido.

---

# Alternativas Consideradas

**Migrar `jarvis`/`neutral` para o storage também (Personas totalmente editáveis).** Rejeitada nesta fatia: aumenta o raio de mudança sem necessidade — o usuário quer criar Personas novas, não editar as de fábrica; manter as embutidas imutáveis preserva um fallback conhecido e testável mesmo se o storage do usuário for perdido/corrompido.

**Novo módulo dedicado a Personas custom (`packages/persona-store` ou similar), em vez de estender `@atlas/persona`.** Rejeitada: o Module Catalog já atribui ao Persona Service o controle da configuração de Persona e da voz — criar um módulo novo duplicaria responsabilidade já catalogada, contra o Artigo 4 (Core como único orquestrador de módulos de responsabilidade única).

**Vincular Persona a voz sem fallback (fica muda se a voz específica sumir).** Rejeitada no brainstorming: o usuário preferiu explicitamente degradar para a seleção determinística de hoje a perder áudio de forma pouco óbvia ao trocar de máquina/SO.

**Expor `id` editável no formulário de criação, em vez de slug automático.** Rejeitada: adiciona um campo técnico à GUI sem necessidade — o `id` é um detalhe de implementação para o usuário final, que só precisa nomear a Persona.

---

# Observações

- **Nota-ponteiro (2026-07-29, SPEC-0041 — não altera a Decisão).** A hierarquia de fallback de voz descrita na Decisão (b) — `voiceURI` presente e existente ⇒ usa-a; ausente/inexistente ⇒ cai na seleção determinística — fica **superseded na presença de Piper disponível**, por decisão de produto da [SPEC-0041](../implementation/specs/SPEC-0041-desktop-piper-only-voice-surface.md), ancorada no [ADR-0021(c)](ADR-0021-piper-tts-local-voice-engine.md) ("Piper vira a primeira camada de preferência"). Quem ler esta Decisão isolada deve consultar o ADR-0021 (seção Observações) e a SPEC-0041 para o comportamento vigente — nenhuma linha da Decisão acima foi editada.
