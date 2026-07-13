# SPEC-0007 — Context Service (detentor de sessão)

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0007

---

**Título**

Context Service (detentor do estado temporário de conversa por sessão)

---

**Status**

- [x] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [ ] Done

---

**Prioridade**

Medium

---

# Objetivo

Ao concluir esta SPEC deverá existir o package `packages/context` (`@atlas/context`) com uma implementação **mínima** do Context Service catalogado, cuja única responsabilidade nesta SPEC é **guardar o estado temporário de conversa por sessão**. Ele passa a ser o **detentor** que o ADR-0008 previu: o comando `atlas chat` deixa de segurar a `Conversation` numa variável do loop `readline` e passa a lê-la/gravá-la no Context Service.

Concretamente, quando esta SPEC estiver concluída:

- `createContextService(): ContextService` existe e mantém, em memória, uma `Conversation` por sessão.
- O contrato `ContextService` (+ `SessionId`) vive em `@atlas/contracts`; `AtlasPlatform` expõe `context`.
- `@atlas/core` compõe o Context Service e o expõe em `atlas.context`.
- `apps/cli` `runChat` usa `atlas.context` como detentor da conversa; `CognitiveCore.respond` permanece **função pura e inalterada**.
- ADR-0009 registra a resolução da tensão documental "quem medeia" (Catalog vs. ADR-0008).

---

# Motivação

O ADR-0008 ("Conversa como dado") decidiu que o histórico de conversa multi-turno é um **valor** (`Conversation`) carregado pelo chamador, mantendo o Cognitive Core sem estado (`respond` é função pura). Como o Context Service ainda não existia, esse valor ficou **interinamente** segurado pela CLI, numa variável do loop de `atlas chat` — dívida explicitamente documentada no próprio ADR-0008:

> "quando o Context Service existir, ele passa a ser o detentor do estado temporário de conversa, sem alterar o contrato `respond` (que continua puro). [...] Migração futura para o Context Service é uma troca de **detentor**, não uma mudança de contrato."

Esta SPEC paga essa dívida: cria o dono catalogado do "estado atual e temporário" (Module Catalog) e migra a titularidade da conversa para ele, sem tocar no contrato do Cognitive Core. É o próximo passo arquitetural natural do ciclo cognitivo, avançando a plataforma na direção do desenho documentado sem expandir escopo.

Documento originador: **ADR-0008** (dívida de detentor) + **Module Catalog** (Context Service: "representar o estado atual e temporário").

---

# Referências

- ADR-0008 — Conversa como dado: multi-turno sem estado no Cognitive Core (`docs/06-adr/ADR-0008-conversation-as-data.md`)
- ADR-0009 — Context Service como store de valor; a app medeia (a ser criado por esta SPEC)
- Module Catalog — Context Service (`docs/03-architecture/ModuleCatalog.md`)
- Project Structure — `packages/context/` e regra de consolidação aceitável (`docs/03-architecture/ProjectStructure.md`)
- ADR-0003 (composition root) e ADR-0004 (composição manual por factory)
- SPEC-0006 — atlas chat (consumidor a ser migrado)
- Cognitive Lifecycle — etapa de Contexto (`docs/03-architecture/CognitiveLifecycle.md`)

---

# Escopo

- Criar o package `packages/context` (`@atlas/context`) com `createContextService(): ContextService`.
- Implementar o store de sessão em memória: `openSession`, `getConversation`, `updateConversation`, `closeSession`.
- Definir o contrato `ContextService` e o tipo `SessionId` em `@atlas/contracts`; adicionar `context` a `AtlasPlatform`.
- Compor o Context Service em `@atlas/core` (`createAtlas`) e expô-lo em `atlas.context`.
- Migrar `apps/cli` `runChat` para usar `atlas.context` como detentor (remover o `let conversation` do loop; fechar a sessão no encerramento).
- Erro de sessão inexistente mapeado por `AtlasError` com `code: 'ATLAS_CONTEXT'`.
- Testes: unit do store, integração em `@atlas/core` (`atlas.context` funciona), CLI `chat` verde.
- Criar ADR-0009 (resolução da tensão de mediação).
- Documentação: `packages/context/CLAUDE.md`, CLAUDE.md raiz, NEXT_CONTEXT, CURRENT_SPRINT, LESSONS_LEARNED; atualizar referência no ADR-0008.

---

# Fora do Escopo

Esta seção é obrigatória.

- **Não** modelar campos de ambiente do Context (diretório ativo, repositório, branch, arquivos selecionados, estado da aplicação) — só entram quando houver consumidor real (Planner/Runtime).
- **Não** implementar persistência entre sessões (é do Memory Service, inexistente); sessões vivem só em memória e somem ao `closeSession`/fim do processo.
- **Não** alterar `CognitiveCore.respond`/`startConversation`/`ask` — o contrato do Cognitive Core permanece intocado; `respond` continua função pura.
- **Não** fazer o Cognitive Core (nem Planner/Runtime) depender do Context Service — nesta SPEC a **app** medeia.
- **Não** criar `packages/memory` nem stubar o Memory Service.
- **Não** implementar Event Bus, health-check, auto-gerência do Ollama, Persona ou config por arquivo.
- **Não** persistir/serializar `SessionId` para fora do processo.

---

# Pré-requisitos

- SPEC-0002 (core) — Done
- SPEC-0003 (cli) — Done
- SPEC-0005 (cognitive-core) — Done
- SPEC-0006 (atlas chat) — Done

---

# Critérios de Aceitação

Cada item é verificável.

- Package `@atlas/context` criado; `createContextService()` retorna um `ContextService`.
- `openSession(conversation)` retorna um `SessionId` opaco e único; `getConversation` devolve exatamente o valor guardado; `updateConversation` substitui; `closeSession` remove.
- `getConversation`/`updateConversation`/`closeSession` em `SessionId` inexistente lançam `AtlasError` com `code: 'ATLAS_CONTEXT'`.
- Sessões são isoladas entre si (uma não enxerga o valor da outra).
- Contrato `ContextService` + `SessionId` em `@atlas/contracts`; `AtlasPlatform.context` definido.
- `atlas.context` disponível e funcional a partir de `createAtlas`.
- `atlas chat` funciona multi-turno usando `atlas.context`; a variável de loop `let conversation` foi removida; a sessão é fechada ao sair.
- `CognitiveCore.respond` inalterado (diff não toca `packages/cognitive/src/cognitive-core.ts` nem `packages/contracts/src/cognitive.ts`).
- ADR-0009 criado e aceito.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.
- Documentação atualizada; lições registradas em `implementation/LESSONS_LEARNED.md`.

---

# Arquivos Esperados

```text
packages/context/
  package.json
  tsconfig.json
  CLAUDE.md
  src/
    index.ts               # createContextService()
    context-service.ts     # store de sessão em memória
  tests/
    context-service.test.ts

packages/contracts/src/
  context.ts               # ContextService, SessionId
  index.ts                 # re-export
  platform.ts              # AtlasPlatform ganha `context`

packages/core/src/index.ts # compõe createContextService(); expõe atlas.context
packages/core/tests/       # atlas.context funcional

apps/cli/src/commands/chat.ts   # usa atlas.context como detentor
apps/cli/tests/                 # chat continua verde

docs/06-adr/ADR-0009-context-service-value-store.md
```

Lista é expectativa; pode sofrer pequenos ajustes.

---

# Componentes Impactados

- Context Service (novo) — `packages/context`
- Contracts — `@atlas/contracts` (novo contrato + `AtlasPlatform`)
- Core — composição
- Input Gateway / CLI — `atlas chat`
- Cognitive Core — **não impactado** (validação de que segue puro)

---

# Interfaces Necessárias

Em `@atlas/contracts`:

```ts
export type SessionId = string; // opaco; gerado internamente (crypto.randomUUID)

export interface ContextService {
  openSession(conversation: Conversation): SessionId;
  getConversation(id: SessionId): Conversation;
  updateConversation(id: SessionId, conversation: Conversation): void;
  closeSession(id: SessionId): void;
}
```

`AtlasPlatform` ganha `readonly context: ContextService`.

O contrato entra direto em `@atlas/contracts` porque dois consumidores precisam desde o início (`@atlas/core` compõe; `AtlasPlatform`/CLI consomem) — mesma justificativa dos contratos já presentes. Não é promoção de contrato existente, logo não exige ADR de promoção.

---

# Fluxo Esperado

```text
atlas chat
  ↓
atlas.context.openSession( atlas.cognitive.startConversation() )  → SessionId
  ↓  (a cada turno)
conv  = atlas.context.getConversation(id)
turn  = await atlas.cognitive.respond(conv, input)   # função PURA
output.write(turn.reply)
atlas.context.updateConversation(id, turn.conversation)
  ↓  (ao sair: /sair, /exit, EOF)
atlas.context.closeSession(id)
```

Titularidade: antes = variável do loop na CLI; depois = Context Service. Contrato `respond` inalterado.

---

# Estratégia de Implementação

1. Contrato: `context.ts` em `@atlas/contracts` (+ re-export + `AtlasPlatform.context`).
2. Testes do store (TDD) em `packages/context`.
3. Implementar `createContextService` (Map em memória, `AtlasError`/`ATLAS_CONTEXT`).
4. Compor em `@atlas/core`; teste de integração `atlas.context`.
5. Migrar `runChat`; ajustar/validar testes da CLI.
6. ADR-0009.
7. Documentação + lições; rodar a suíte completa.

---

# Estratégia de Testes

- Store: open→get (round-trip), update (substituição), isolamento entre sessões, close (remove), erros em id inexistente (`ATLAS_CONTEXT`), unicidade de `SessionId`.
- Core: `createAtlas` expõe `context`; open/get/update ponta a ponta com atlas real.
- CLI: `atlas chat` multi-turno com provider `fake` continua verde (histórico lembrado entre turnos via Context); sessão fechada ao encerrar.

---

# Definition of Done

- todos os critérios atendidos;
- testes passando (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`);
- documentação atualizada (CLAUDE.md raiz + `packages/context/CLAUDE.md` + NEXT_CONTEXT + CURRENT_SPRINT);
- ADR-0009 aceito; referência no ADR-0008 atualizada;
- arquitetura preservada (Cognitive Core intocado; limites do Module Catalog respeitados);
- revisão concluída;
- lições registradas em `implementation/LESSONS_LEARNED.md`.

---

# Restrições

- Não criar módulos além do Context Service catalogado.
- Não alterar arquitetura nem mover responsabilidades; o Context é **store de valor**, não orquestrador (não decide estratégia, não chama o Cognitive Core).
- Não modificar `packages/cognitive` nem o contrato do Cognitive Core.
- Não introduzir dependência de runtime em `@atlas/contracts`.
- `@atlas/context` depende só de `@atlas/contracts` (Regra de Dependência).

---

# Observações

- **Tensão documental registrada (invariante "pare e registre"):** o Module Catalog diz que o Context Service "é utilizado por" o Cognitive Core; o ADR-0008 mantém `respond` puro. Se o Cognitive puxasse o histórico do Context, `respond` deixaria de ser puro. Resolução (ADR-0009): nesta fase o Context é um **detentor de valor** e a **app medeia**; o "Cognitive usa Context" do catálogo refere-se ao **contexto de ambiente** futuro (cwd/repo/arquivos), não ao buffer de conversa.
- **Localização:** `packages/context` autônomo (destino do catálogo), não dentro de `packages/memory`. A consolidação em memory é *aceitável* mas opcional no ProjectStructure; criar Memory só como hospedeiro arriscaria mal-modelá-lo. Consolidação futura fica em aberto se surgir evidência (churn compartilhado, segundo consumidor).
- **Semeadura da conversa inicial** continua no Cognitive Core (`startConversation()`); o Context não conhece system prompt — guarda apenas o valor opaco.

---

# Checklist para IA

Antes de implementar: ler ADR-0008, Module Catalog (Context), ProjectStructure (`packages/context/`), SPEC-0006.

Durante: manter responsabilidade única (store de valor); não vazar orquestração para o Context; preservar `respond` puro; manter simplicidade.

Após: rodar a suíte; revisar documentação; validar critérios; registrar lições; concluir.

---

# Resultado Esperado

O Atlas passa a ter o dono catalogado do estado temporário: `@atlas/context` guarda a conversa por sessão em memória, exposto como `atlas.context`. O `atlas chat` conversa multi-turno exatamente como antes — do ponto de vista do usuário nada muda — mas a titularidade do histórico migrou da variável de loop da CLI para o Context Service, pagando a dívida do ADR-0008 sem alterar o contrato do Cognitive Core (`respond` segue função pura). A resolução arquitetural de "quem medeia" fica rastreável no ADR-0009. A fundação está pronta para que, numa SPEC futura, o Context ganhe contexto de ambiente e o Cognitive/Planner passem a consumi-lo.
