# Design — Criar Persona pela GUI (`apps/desktop`)

> Documento de brainstorming, não é SPEC. Serve de insumo para o `spec-drafter` depois do ADR-0020 aprovado.

Data: 2026-07-28

---

## Objetivo

O painel de Persona do desktop ([SPEC-0037](../../implementation/specs/SPEC-0037-desktop-runtime-persona-switch.md)) hoje só lista/troca entre as Personas embutidas (`jarvis`/`neutral`). Este design cobre criar/editar/apagar Personas **custom** pela interface gráfica, persistidas em disco, com formulário completo (paridade com os 8 campos de `Persona`) e um vínculo real entre o campo de voz e o TTS ([SPEC-0035](../../implementation/specs/SPEC-0035-desktop-voice-output-tts.md)/[SPEC-0036](../../implementation/specs/SPEC-0036-desktop-tts-local-voice-only.md)).

Pedido explícito do usuário registrado como próximo trabalho em `NEXT_CONTEXT.md` desde a SPEC-0037. Escalação obrigatória da Emenda v1.1 (ADR novo) — coberta por este brainstorming e pelo `ADR-0020` proposto em paralelo.

---

## Decisões (resumo das perguntas respondidas no brainstorming)

1. **Formulário completo**: todos os 8 campos de `Persona` (nome, tom, formalidade, idioma, estilo, regras de comunicação, voz, emoção) ficam expostos — paridade total com uma Persona embutida.
2. **Voz vira seleção real do SO**: `voice` deixa de ser só texto descritivo. A Persona ganha um `voiceURI?: string` opcional, escolhido de uma lista de vozes locais do SO (mesma fonte que `speech-output.ts` já filtra), e o TTS passa a usar essa voz de fato ao falar respostas dessa Persona.
3. **Personas embutidas continuam imutáveis**: `jarvis`/`neutral` seguem vindas do código, só leitura. A GUI só cria/edita/apaga Personas custom.
4. **Persistência em arquivo JSON próprio e configurável**: mesmo padrão do `MemoryStorage` (ADR-0011) — porta injetável, adapter de arquivo default, caminho configurável.
5. **Só GUI, sem CLI nesta fatia**: equivalente de CLI (`atlas persona create/edit/delete`) fica candidato futuro independente, mesmo tratamento do `list`/`use` deixado em aberto pela SPEC-0037.
6. **CRUD completo**: criar + editar + apagar Personas custom (não só criar).
7. **Fallback de voz fail-closed**: se o `voiceURI` da Persona não existir mais no SO (máquina diferente, voz desinstalada), o TTS cai para a seleção determinística de hoje (1ª voz local) — nunca fica mudo por isso, nunca cai para voz de rede (garantia da SPEC-0036 preservada).
8. **Id por slug automático**: `id` derivado do `name` digitado, com sufixo numérico em colisão — usuário nunca digita `id` à parte.
9. **Criar não seleciona automaticamente**: criar é uma ação de cadastro isolada; trocar de Persona continua sendo o fluxo já entregue (`selectPersona`, SPEC-0037).
10. **Apagar a Persona ativa é recusado**: precisa trocar para outra Persona antes de poder apagar a atual — evita o estado "Persona ativa que não existe mais", sem lógica de fallback de seleção.

---

## 1. Contratos (`@atlas/contracts`)

- `Persona` ganha `voiceURI?: string` — **aditivo**, opcional. Personas embutidas não setam esse campo.
- `PersonaService` ganha três membros novos, síncronos (molde de `get`/`has`/`list`):
  - `create(input: PersonaInput): Persona` — deriva `id` por slug de `name` (sufixo numérico em colisão); rejeita campos obrigatórios ausentes (erro estruturado, `PersonaError`).
  - `update(id: string, input: PersonaInput): Persona` — só para Personas custom; rejeita edição de `id` embutido.
  - `delete(id: string): void` — só para Personas custom; rejeita apagar `id` embutido. A recusa de apagar a **Persona atualmente selecionada** é responsabilidade do chamador (desktop), porque o Persona Service não conhece runtime state — mesma separação de responsabilidade que `selectPersona` (SPEC-0037) já tem hoje.
  - `PersonaInput` (novo tipo, mesmos campos de `Persona` exceto `id`, todos obrigatórios salvo `voiceURI?`).

## 2. `@atlas/persona` — storage injetável

- Porta interna `PersonaStorage { load(): readonly CustomPersonaRecord[]; save(personas: readonly CustomPersonaRecord[]): void }` — **não** sobe a `@atlas/contracts` (mesma regra do `MemoryStorage`, ADR-0011: porta fica no package dono).
- Default `createFilePersonaStorage(path)`: arquivo JSON (`{ personas: [...] }`), criado sob demanda; arquivo ausente → lista vazia; JSON inválido → erro estruturado, falha alta (nunca descarta Personas do usuário silenciosamente — mesma postura da Memória).
- `createPersonaService({ storage? })`: sem `storage`, comportamento idêntico a hoje, byte a byte (só embutidas — não regride nada). Com `storage`, carrega as Personas custom uma vez na criação (load-once); `get`/`has`/`list` passam a enxergar embutidas + custom combinadas; `create`/`update`/`delete` mutam em memória e persistem imediatamente (write-through) — mesmo padrão de `remember`/`forget` da Memória.
- `apps/cli` **não** injeta storage nesta fatia (permanece só com as embutidas, comportamento de hoje preservado); só `@atlas/core`/`apps/desktop` recebem um `personaStoragePath` opcional na composição.

## 3. Desktop (`apps/desktop`) — bridge, TTS, UI

- `core-bridge.ts` ganha `createPersona(input)`/`updatePersona(id, input)`/`deletePersona(id)` — sobem/desligam o Core por chamada (stateless, molde de `resolveMemorySnapshot`/`forgetFact` da SPEC-0034, porque Persona custom é durável em disco, não estado de sessão).
  - `deletePersona` recusa se `id === selectedPersonaId()`.
  - `updatePersona`/`deletePersona` na Persona **atualmente selecionada** seguem a mesma regra de `selectPersona` (SPEC-0037): recusa com turno de chat em voo; encerram sessões de chat vivas ao aplicar (o `personaPrompt` já está congelado dentro do Core de uma sessão viva — mesma razão da Decisão D5 da SPEC-0037).
- `listPersonas()` (já existe) passa a incluir as custom automaticamente, sem mudança de assinatura.
- Voz: o formulário de criar/editar lista as vozes locais disponíveis, reusando a mesma fonte que `speech-output.ts` já expõe (`SpeechSynthesisPort.getVoices()`, filtrado por `localService === true`), exposta por um novo canal IPC só de leitura (`atlas:voices:list`, renderer → main, sem tocar no Core). O usuário escolhe uma da lista (ou "nenhuma", campo opcional); o `voiceURI` escolhido vai para `Persona.voiceURI`.
- `speech-output.ts`: `createSpeechOutput` passa a aceitar o `voiceURI?` da Persona ativa. Ao selecionar a voz: tenta achar esse `voiceURI` nas vozes locais correntes primeiro; não achando (ausente ou voz sumiu), cai para a seleção determinística de hoje (1ª voz local) — nunca fica mudo por causa disso, mantém o fail-closed da SPEC-0036 (nunca voz de rede).
- UI: o painel de Persona (SPEC-0037) ganha "Nova Persona" (formulário completo) e, por Persona custom listada, "Editar"/"Apagar". Personas embutidas mostram só leitura, sem esses botões.

## 4. ADR-0020 (proposto em paralelo a este documento)

Duas decisões estruturais:

- (a) Persona Service ganha persistência via porta injetável, no molde do ADR-0011 — supera a premissa "registro embutido" do ADR-0010 original.
- (b) `Persona.voiceURI` cria o primeiro acoplamento real entre Persona e TTS (SPEC-0035/36), com fallback fail-closed para a voz local determinística de hoje quando ausente/indisponível.

Nota de atualização também no ADR-0010 (composição do system prompt não muda — a Persona continua injetando só texto no Cognitive; a novidade é toda em `apps/desktop`/`@atlas/persona`, fora do Cognitive).

## Fora de escopo (candidatos futuros)

- Equivalente de CLI (`atlas persona create/edit/delete`) — mesmo tratamento do `list`/`use` deixado em aberto na SPEC-0037.
- Exportar/importar Personas custom entre máquinas.
- Migrar `jarvis`/`neutral` para o storage (permanecem embutidas/imutáveis).
- Qualquer voz de rede — TTS continua 100% local (SPEC-0036 intocada).

## Testes

Mesmo padrão do resto do repo: fake `PersonaStorage` em memória para os testes de `@atlas/persona` (sem IO real; só o adapter de arquivo testado em `tmpdir`); `core-bridge.test.ts` cobre create/update/delete stateless + recusa de apagar embutida/ativa + fallback de `voiceURI`. Diff vazio esperado em `@atlas/cognitive`/`@atlas/runtime`/`@atlas/tools`/`apps/cli` — mesmo padrão de todas as SPECs desktop anteriores.
