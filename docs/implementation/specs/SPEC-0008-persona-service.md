# SPEC-0008 — Persona Service (Jarvis)

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0008

---

**Título**

Persona Service — identidade "Jarvis" injetada na geração cognitiva

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

Medium

---

# Objetivo

Ao concluir esta SPEC deverá existir o package `packages/persona` (`@atlas/persona`): um **registro de Personas como configuração de dados**, com **Jarvis** como a primeira Persona oficial e default. A Persona ativa fornece um **enquadramento de identidade** (nome, tom, formalidade, idioma, estilo, regras de comunicação) que é **injetado na geração** do Cognitive Core, de modo que as respostas de `atlas ask`/`atlas chat` passam a soar como a Persona ativa — sem uma segunda chamada de modelo.

Concretamente, quando esta SPEC estiver concluída:

- `createPersonaService(): PersonaService` existe, com um registro embutido contendo `jarvis` (default) e `neutral`.
- O contrato `Persona`/`PersonaService` vive em `@atlas/contracts`; `AtlasConfig` ganha `persona`; `AtlasPlatform` expõe `persona` (a Persona ativa).
- O Cognitive Core compõe o enquadramento de identidade da Persona com seu enquadramento de tarefa (`personaPrompt` injetado por parâmetro); `respond` permanece **função pura**.
- `@atlas/core` resolve a Persona ativa (`config.persona`, default `jarvis`), injeta seu `systemPrompt` no Cognitive e expõe `atlas.persona`.
- A CLI seleciona a Persona por `--persona`/`ATLAS_PERSONA` (precedência `flags > env > defaults`); `atlas status` mostra a Persona ativa; `atlas chat` a saúda ao abrir.
- [ADR-0010](../../06-adr/ADR-0010-persona-injected-generation.md) registra a superação da postura "system prompt neutro por design".

---

# Motivação

A [Vision](../../01-vision/Vision.md) estabelece que "a primeira Persona oficial será Jarvis", e o [Glossary](../../00-project/Glossary.md) define que "Jarvis será uma **configuração** de Persona, não um novo Core". As SPECs 0005–0007 mantiveram deliberadamente o system prompt do Cognitive Core **neutro** — uma postura explicitamente provisória, justificada por o Persona Service ainda não existir ("personalidade é deste serviço, inexistente"). O [Module Catalog](../../03-architecture/ModuleCatalog.md) atribui ao Persona Service (`packages/persona`) a responsabilidade de "aplicar a identidade selecionada à interação com o usuário", controlando nome, tom, formalidade, idioma, estilo e comportamento comunicacional, e o lista como usado pelo Cognitive Core.

Esta SPEC cria esse serviço e dá ao Atlas sua identidade, realizando a Vision e encerrando a provisoriedade do "neutro por design". É o primeiro passo tangível de produto após a fundação (workspace, core, CLI, modelos, ciclo cognitivo colapsado, conversa multi-turno e detentor de sessão).

Documentos originadores: **Vision** (Jarvis como primeira Persona) + **Module Catalog / Glossary / [Project Structure](../../03-architecture/ProjectStructure.md)** (Persona Service, `packages/persona`).

---

# Referências

- Vision (`docs/01-vision/Vision.md`) — Jarvis como primeira Persona
- Glossary (`docs/00-project/Glossary.md`) — Persona, Jarvis ("configuração de Persona, não um novo Core")
- Module Catalog — Persona Service (`docs/03-architecture/ModuleCatalog.md`)
- Project Structure — `packages/persona/` (`docs/03-architecture/ProjectStructure.md`)
- [ADR-0006](../../06-adr/ADR-0006-config-source-precedence.md) (precedência de config), [ADR-0003](../../06-adr/ADR-0003-core-composition-root.md) (composition root), [ADR-0004](../../06-adr/ADR-0004-manual-composition.md) (composição manual por factory)
- ADR-0010 — Persona injetada na geração; neutro-por-design superado (a ser criado por esta SPEC)
- [SPEC-0005](SPEC-0005-cognitive-core.md) (Cognitive Core), [SPEC-0006](SPEC-0006-atlas-chat.md) (atlas chat), [SPEC-0007](SPEC-0007-context-service.md) (Context Service)

---

# Escopo

- Criar o package `packages/persona` (`@atlas/persona`) com `createPersonaService(): PersonaService` e um registro embutido de Personas.
- Personas embutidas: `jarvis` (default) e `neutral`.
- Definir o contrato `Persona` e `PersonaService` em `@atlas/contracts`.
- Adicionar `persona: string` a `AtlasConfig` (default `jarvis`) e `persona?: string` a `AtlasConfigOverride`; validar em `loadConfig` contra os nomes conhecidos.
- Adicionar `persona: Persona` (a Persona ativa) a `AtlasPlatform`.
- Alterar o Cognitive Core: `createCognitiveCore({ gateway, personaPrompt? })` compõe identidade + tarefa; `startConversation()`/`ask` usam o composto; `respond` permanece puro.
- Compor em `@atlas/core`: resolver a Persona ativa, injetar `systemPrompt` no Cognitive, expor `atlas.persona`.
- CLI: flag `--persona`, env `ATLAS_PERSONA`; `atlas status` exibe a Persona ativa; `atlas chat` imprime uma saudação de uma linha da Persona ao abrir.
- Erro de Persona desconhecida: `AtlasError` com `code: 'ATLAS_PERSONA'` (via subclasse `PersonaError`).
- Testes (unit + integração) e documentação.
- Criar ADR-0010.

---

# Fora do Escopo

Esta seção é obrigatória.

- **Não** implementar troca de Persona em runtime (ex.: `/persona <nome>` no chat) — seleção é só no startup; troca em runtime (que exige re-semear a conversa) fica para SPEC futura.
- **Não** implementar renderização de **voz** nem motor de **emoção simulada** — são slots **declarativos** no modelo de dados, sem efeito de runtime (não há canal de áudio/afeto; entram quando houver interface que os consuma).
- **Não** fazer o Persona Service chamar o Model Gateway (no design injetado, quem gera é o Cognitive Core; a permissão do catálogo é satisfeita indiretamente).
- **Não** implementar re-estilização de saída (segunda chamada de modelo) — a Persona molda a **geração**, não pós-processa.
- **Não** implementar Personas definidas por arquivo de configuração externo (depende do slot `arquivo` do ADR-0006, não implementado) — nesta SPEC as Personas são embutidas no package.
- **Não** implementar preferências de usuário persistidas, memória de Persona, ou seleção automática de Persona.
- **Não** alterar o contrato `respond` (segue função pura) nem introduzir estado no Cognitive Core.
- **Não** implementar Input/Output Gateway como consumidores da Persona além da exibição/saudação já descrita.

---

# Pré-requisitos

- [SPEC-0004](SPEC-0004-model-gateway.md) (model-gateway) — Done
- SPEC-0005 (cognitive-core) — Done
- SPEC-0006 (atlas chat) — Done
- SPEC-0007 (context-service) — Done

---

# Critérios de Aceitação

Cada item é verificável.

- Package `@atlas/persona` criado; `createPersonaService()` retorna um `PersonaService`.
- Registro embutido contém `jarvis` e `neutral`; `list()` os inclui; `has('jarvis')`/`has('neutral')` verdadeiros; `get('jarvis')` retorna a Persona Jarvis.
- `get(<nome desconhecido>)` lança `AtlasError` com `code: 'ATLAS_PERSONA'`.
- `systemPrompt(persona)` deriva o enquadramento de identidade a partir dos atributos textuais (nome/tom/formalidade/idioma/estilo/regras); voz e emoção **não** aparecem no prompt.
- `Persona` inclui os slots `voice` e `emotion` (declarativos).
- `AtlasConfig.persona` existe (default `jarvis`); `loadConfig` valida contra os nomes conhecidos e lança `InvalidConfigError` para nome inválido.
- O Cognitive Core compõe identidade + tarefa: com `personaPrompt` presente, o system message começa pelo enquadramento de identidade e inclui o de tarefa; sem `personaPrompt`, usa só o de tarefa. `respond` permanece função pura (diff não introduz estado).
- `createAtlas` resolve a Persona ativa, injeta seu `systemPrompt` no Cognitive e expõe `atlas.persona` (a Persona ativa).
- CLI: `--persona <id>` e `ATLAS_PERSONA` selecionam a Persona (flag > env > default); `atlas status` mostra a Persona ativa; `atlas chat` imprime a saudação da Persona ao abrir.
- ADR-0010 criado e aceito.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.
- Documentação atualizada; lições registradas em `implementation/LESSONS_LEARNED.md`.

---

# Arquivos Esperados

```text
packages/persona/
  package.json
  tsconfig.json
  CLAUDE.md
  src/
    index.ts               # createPersonaService(), PERSONA_IDS
    persona-service.ts     # registro + systemPrompt()
    personas.ts            # dados de jarvis e neutral
    errors.ts              # PersonaError (ATLAS_PERSONA)
  tests/
    persona-service.test.ts

packages/contracts/src/
  persona.ts               # Persona, PersonaService
  config.ts                # AtlasConfig/Override ganham persona
  platform.ts              # AtlasPlatform ganha persona
  index.ts                 # re-exports

packages/cognitive/src/cognitive-core.ts   # personaPrompt injetado; TASK_FRAMING
packages/cognitive/tests/                   # compõe identidade + tarefa

packages/core/src/config/defaults.ts        # persona: 'jarvis'
packages/core/src/config/load-config.ts     # valida persona
packages/core/src/index.ts                  # resolve/injeta/expõe persona
packages/core/tests/

apps/cli/src/gateway/input-gateway.ts       # --persona, ATLAS_PERSONA
apps/cli/src/commands/status.ts             # exibe persona ativa
apps/cli/src/commands/chat.ts               # saudação da persona
apps/cli/src/run.ts                         # HELP_TEXT (--persona)
apps/cli/tests/

docs/06-adr/ADR-0010-persona-injected-generation.md
```

Lista é expectativa; pode sofrer pequenos ajustes.

---

# Componentes Impactados

- Persona Service (novo) — `packages/persona`
- Contracts — `@atlas/contracts` (novo contrato + `AtlasConfig` + `AtlasPlatform`)
- Cognitive Core — passa a compor identidade + tarefa (personaPrompt injetado)
- Core — composição, resolução da Persona ativa, validação de config
- Input Gateway / CLI — seleção (`--persona`/env), exibição (status), saudação (chat)

---

# Interfaces Necessárias

Em `@atlas/contracts`:

```ts
export interface Persona {
  readonly id: string;                       // "jarvis"
  readonly name: string;                     // "Jarvis"
  readonly tone: string;
  readonly formality: string;
  readonly language: string;                 // ex.: "espelhe o idioma do usuário"
  readonly style: string;
  readonly communicationRules: readonly string[];
  readonly voice: string;                    // slot declarativo (inerte hoje)
  readonly emotion: string;                  // estado emocional simulado default (inerte hoje)
}

export interface PersonaService {
  get(id: string): Persona;                  // lança PersonaError (ATLAS_PERSONA) se desconhecida
  has(id: string): boolean;
  list(): readonly string[];
  systemPrompt(persona: Persona): string;    // enquadramento de identidade p/ injeção
}
```

`AtlasConfig` ganha `readonly persona: string`; `AtlasConfigOverride` ganha `persona?: string`; `AtlasPlatform` ganha `readonly persona: Persona`. `CognitiveCoreDeps` ganha `personaPrompt?: string`.

---

# Fluxo Esperado

```text
config.persona ("jarvis")
  ↓
createPersonaService().get("jarvis") → Persona
  ↓  systemPrompt(persona) → enquadramento de identidade
createCognitiveCore({ gateway, personaPrompt })
  ↓
system message = `${personaPrompt}\n\n${TASK_FRAMING}`   (semeado em startConversation/ask)
  ↓
gateway.generate(...)  → resposta na voz da Persona (1 chamada)

atlas.persona → CLI: status exibe; chat saúda
```

---

# Estratégia de Implementação

1. Contrato: `persona.ts` em `@atlas/contracts` + campos em `config.ts`/`platform.ts` + re-exports.
2. `@atlas/persona`: dados (`jarvis`, `neutral`), `PersonaError`, `createPersonaService` + `systemPrompt`, testes.
3. Cognitive Core: `personaPrompt` injetado, `TASK_FRAMING`, composição; atualizar testes.
4. Core: `defaults` (persona), `loadConfig` (validação), `createAtlas` (resolver/injetar/expor); testes.
5. CLI: `--persona`/`ATLAS_PERSONA`, `HELP_TEXT`, status (exibe), chat (saúda); testes.
6. ADR-0010; documentação; lições; suíte completa.

---

# Estratégia de Testes

- Persona registry: `get/has/list`, `jarvis`/`neutral` presentes, erro `ATLAS_PERSONA` para desconhecida; `systemPrompt` inclui atributos textuais e **não** inclui voz/emoção.
- Cognitive: com `personaPrompt`, o system message começa pela identidade e contém o enquadramento de tarefa; sem `personaPrompt`, só a tarefa (via gateway stub que captura as mensagens).
- Config: `persona` default `jarvis`; flag > env > default; nome inválido → `InvalidConfigError`.
- Core: `atlas.persona` é a Persona ativa; a Persona escolhida afeta o system message semeado.
- CLI: `--persona`/env selecionam; `status` exibe a Persona; `chat` saúda; provider `fake` mantém a suíte verde.

---

# Definition of Done

- todos os critérios atendidos;
- testes passando (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`);
- documentação atualizada (CLAUDE.md raiz + `packages/persona/CLAUDE.md` + atualizar `packages/cognitive/CLAUDE.md` — deixa de ser "neutro por design" + [NEXT_CONTEXT](../../05-context/NEXT_CONTEXT.md) + [CURRENT_SPRINT](../../05-context/CURRENT_SPRINT.md));
- ADR-0010 aceito;
- arquitetura preservada (Persona não decide estratégia/Plans/Tasks; `respond` puro; Jarvis é configuração, não Core);
- revisão concluída;
- lições registradas em `implementation/LESSONS_LEARNED.md`.

---

# Restrições

- Não criar módulos além do Persona Service catalogado.
- A Persona **não** decide estratégias técnicas, não cria Plans, não executa Tasks (Module Catalog).
- Jarvis é uma **configuração** de Persona, não um novo Core (Glossary).
- `@atlas/persona` depende só de `@atlas/contracts`; só `@atlas/core` importa implementações.
- Não introduzir dependência de runtime em `@atlas/contracts`.
- Precedência de config `flags > env > arquivo > defaults` (ADR-0006; `arquivo` reservado).

---

# Observações

- **Superação registrada (ADR-0010):** o "system prompt neutro por design" das SPECs 0005–0007 era provisório (o Persona Service não existia). Com a Persona, o Cognitive Core compõe identidade (da Persona) + tarefa (sua, de correção/clareza). O Cognitive segue sem conhecer o **conceito** de Persona: recebe apenas uma string `personaPrompt` por parâmetro (baixo acoplamento); a Persona é resolvida e injetada pela composição (`@atlas/core`). Isso satisfaz "Persona é usada pelo Cognitive Core" (Module Catalog) via composição.
- **Voz e emoção simulada** são slots **declarativos** no modelo de dados, sem efeito de runtime nesta SPEC (documentado para não virar superfície fantasma). Entram numa SPEC futura quando existir um canal que os consuma.
- **Persona única percebida** (invariante): há sempre uma Persona ativa (default Jarvis); a seleção é transparente ao usuário.
- O `neutral` preserva o comportamento pré-Persona (identidade mínima) e demonstra o registro com >1 Persona.

---

# Checklist para IA

Antes de implementar: ler Vision (Jarvis), Glossary (Persona/Jarvis), Module Catalog (Persona Service), ADR-0006 (config), SPEC-0005/0006/0007.

Durante: manter a Persona como configuração de dados; não vazar decisão de estratégia para a Persona; manter `respond` puro; manter o Cognitive desacoplado do conceito de Persona (recebe string); manter simplicidade.

Após: rodar a suíte; revisar documentação; validar critérios; registrar lições; concluir.

---

# Resultado Esperado

O Atlas passa a ter identidade: por padrão, o usuário conversa com **Jarvis**. `atlas ask`/`atlas chat` respondem na voz da Persona ativa (uma única chamada de modelo, identidade injetada na geração), `atlas status` mostra qual Persona está ativa e `atlas chat` a saúda ao abrir. A Persona é escolhível por `--persona`/`ATLAS_PERSONA` (default `jarvis`; `neutral` disponível), e o desenho — registro de Personas como dados, identidade injetada, Cognitive desacoplado do conceito de Persona — deixa o caminho pronto para novas Personas (config) e, no futuro, voz/emoção e troca em runtime. A superação do "neutro por design" fica rastreável no ADR-0010, e o Cognitive Core segue sem estado, com `respond` função pura.
