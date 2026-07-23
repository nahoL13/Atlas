# SPEC-0034 — Desktop: gerência visual de memória (listar e esquecer fatos)

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0034

---

**Título**

Desktop: gerência visual de memória na janela — listar os fatos memorizados e esquecer um fato pela interface gráfica, equivalente GUI de `atlas memory list` e `atlas forget`

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

- [ ] Critical
- [ ] High
- [x] Medium
- [ ] Low

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 2 — 2.4 Persistência e Gerência Local` (`docs/04-engineering/Roadmap.md`, l. 159-163): "Gerência visual de memória (listar, esquecer fatos pela interface, não só CLI)." Esta SPEC entrega **listar + esquecer**; a seleção/troca de Persona em runtime e a configuração de permissões por GUI — os outros dois itens de 2.4 — ficam de fora, cada um sua própria fatia futura.

---

# Objetivo

Dar à janela do `apps/desktop` (`@atlas/desktop`) uma **gerência visual de memória**: o usuário vê a lista dos fatos persistidos pelo Memory Service (`id`, texto, data, origem, categoria, projeto quando houver) e pode **esquecer** um fato específico pela interface gráfica — o equivalente GUI de `atlas memory list` e `atlas forget <id>` da CLI.

Ao final: a partir da janela real, o usuário abre o painel de memória, vê os fatos memorizados; clica em "esquecer" num fato e ele some da lista (removido do acervo persistente pelo Memory Service); a lista reflete o estado do store durável, e a operação nunca lê nem escreve o arquivo de memória diretamente — passa sempre pelo `MemoryService` (Artigo 11).

---

# Motivação

O PRD estabelece, em Memória (l. 125): **"O usuário deve poder consultar, atualizar e remover informações armazenadas."** Hoje essa capacidade existe só no terminal (`atlas memory list`, `atlas forget`, SPECs 0009/0020/0029); a janela do `apps/desktop` cobre `status` (SPEC-0031), `ask` stateless (SPEC-0032) e o chat multi-turno (SPEC-0033), mas não expõe nenhuma visão nem controle sobre o conhecimento persistente. O Roadmap 2.4 (l. 161) nomeia exatamente esta lacuna: "Gerência visual de memória (listar, esquecer fatos pela interface, não só CLI)."

Esta é a primeira fatia do item 2.4. O Memory Service já expõe tudo o que a fatia precisa pelo contrato público `MemoryService` (`list(options?)`, `forget(id)`, ADR-0011) — o mesmo que a CLI consome (`apps/cli/src/commands/memory.ts`, `apps/cli/src/commands/forget.ts`). Não há decisão arquitetural nova: é a mesma casca de interação das SPECs 0031/0032/0033, agora consumindo `list`/`forget` em vez de `status`/`ask`/`respond`. Fica dentro da fronteira que o Roadmap 2.4 desenha, sem entrar em troca de Persona nem em configuração de permissões (as outras duas linhas de 2.4).

---

# Referências

- `docs/04-engineering/Roadmap.md` — Fase 2, item 2.4 (l. 159-163: gerência visual de memória, Persona, permissões); esta SPEC consome só a primeira linha
- `docs/02-product/ProductRequirementsDocument.md` — Memória: "O usuário deve poder consultar, atualizar e remover informações armazenadas" (l. 125); Transparência (l. 149-155)
- `docs/00-project/ArchitectureConstitution.md` — Artigo 4 (Core é o único orquestrador; renderer nunca toca `packages/*`), Artigo 6 (Contexto × Memória), Artigo 11 (Memória tem autoridade exclusiva sobre estado persistente), Artigo 7 (uma única Persona percebida)
- `docs/03-architecture/ModuleCatalog.md` — Memory Service (autoridade exclusiva sobre conhecimento persistente; "interfaces de gerenciamento de memória" entre seus consumidores); Input/Output Gateway (`apps/*`)
- `docs/06-adr/ADR-0011-memory-service-persistence.md` — Memory Service atrás de porta de storage injetável; Memória × Contexto
- `docs/06-adr/ADR-0019-desktop-electron-stack.md` — stack Electron; Core só no main process; renderer isolado; sem `dist/`
- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação: `core-bridge` testável sem Electron, `main.ts` casca fina, IPC via `contextBridge`, `preload.cjs`; padrão do round-trip stateless (`resolveStatusSnapshot`)
- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) (Done) — `resolveAskSnapshot` stateless (sobe/desliga o Core por chamada), `StatusSnapshot`/`AskSnapshot` locais ao app
- [SPEC-0033](SPEC-0033-desktop-visual-chat.md) (Done) — chat vivo multi-turno; renderer que só pinta dados planos serializáveis por IPC
- [SPEC-0009](SPEC-0009-memory-service.md) (Done) / [SPEC-0029](SPEC-0029-episodic-project-memory.md) (Done) — Memory Service: `Fact` (`id`/`text`/`createdAt`/`source?`/`category?`/`subject?`), `list`/`forget`, categorias
- `apps/cli/src/commands/memory.ts` (`runMemoryList`) e `apps/cli/src/commands/forget.ts` (`runForget`) — adapters de referência: como a borda invoca `list`/`forget` e renderiza

---

# Escopo

- estender `apps/desktop/src/core-bridge.ts` (testável, **sem** Electron) com dois helpers **stateless** de round-trip com o Core (mesmo padrão de `resolveStatusSnapshot`/`resolveAskSnapshot` — sobem e desligam o Core por chamada, `finally`), consumindo o contrato público `MemoryService`:
  - `resolveMemorySnapshot(deps?): Promise<readonly FactSnapshot[]>` — sobe a plataforma via `createAtlas({ config })`, chama `atlas.memory.list()`, mapeia cada `Fact` num `FactSnapshot` plano serializável por IPC (resolvendo os defaults como a CLI faz: `source ?? 'user'`, `category ?? 'fact'`), desliga (`finally`) e devolve a lista. `deps` = `{ configOverride?: AtlasConfigOverride }`;
  - `forgetFact(id: string, deps?): Promise<boolean>` — sobe a plataforma, chama `atlas.memory.forget(id)`, desliga (`finally`) e devolve se algo foi removido (`true`/`false`, paridade com `runForget`); `deps` = `{ configOverride?: AtlasConfigOverride }`;
- estender `apps/desktop/src/main.ts` (casca Electron): registrar dois canais IPC — `ipcMain.handle('atlas:memory:list', () => resolveMemorySnapshot())` e `ipcMain.handle('atlas:memory:forget', (_e, id) => forgetFact(id))`. Nenhuma lógica de domínio no `main.ts`;
- estender `apps/desktop/src/preload.cjs`: expor `window.atlas.memory` com `list()` e `forget(id)` → `ipcRenderer.invoke` dos dois canais, ao lado de `getStatus`/`ask`/`chat` existentes;
- estender `apps/desktop/src/renderer/index.html` + `renderer.js`: um painel de memória mínimo — uma seção que lista os fatos (uma linha por fato: `id`, texto, data, origem, categoria e projeto quando houver) com um botão "esquecer" por linha; clicar em "esquecer" chama `forget(id)` e recarrega a lista; um botão/ação de "atualizar" para recarregar. JavaScript plano, sem bundler nem framework;
- testes: estender `apps/desktop/tests/core-bridge.test.ts` com `resolveMemorySnapshot`/`forgetFact` sobre o Core real (gateway `fake` determinístico, `dataDir` temporário isolado), cobrindo o round-trip `remember` → `list` → `forget` → `list`;
- atualizar `apps/desktop/CLAUDE.md` (registrar os helpers de memória, os canais IPC novos, a fronteira com o restante de 2.4).

---

# Fora do Escopo

Cada item abaixo pertence às outras linhas de 2.4, a outras fatias ou a decisões maiores próprias:

- **editar/atualizar** um fato pela GUI (o "atualizar" do PRD l. 125) — o usuário escopou esta fatia a **listar + esquecer**; edição de fato é fatia futura própria (e nem a CLI a expõe hoje);
- **adicionar** fatos pela GUI (equivalente a `atlas remember`) — fora do pedido desta fatia; candidato futuro;
- **filtrar** a lista por categoria/projeto ou **buscar** (equivalentes a `atlas memory list --category` / `atlas memory search`) na UI — a lista desta fatia mostra todos os fatos; controles de filtro/busca são refinamento futuro;
- **deduplicação/consolidação** pela GUI (equivalente a `atlas memory dedupe`) — fora de escopo;
- seleção/troca de **Persona** em runtime e configuração de **permissões** (`readRoots`/`writeRoots`) por GUI — as outras duas linhas do item 2.4, cada uma sua própria SPEC;
- **diálogo nativo de confirmação** ao esquecer um fato — `atlas forget` da CLI não confirma; o gate `confirm` do Permission Service (ADR-0013) é sobre execução de Tools num plano, não sobre gerência direta de memória. Ver "Decisões de design";
- **sincronização reativa** entre o painel de memória e uma sessão de chat viva (SPEC-0033) rodando em paralelo — o painel lê/escreve o store durável e reflete o estado via recarga manual; uma notificação automática de mudança entre dois Cores vivos sobre o mesmo store é refinamento futuro. Ver "Decisões de design";
- promover `FactSnapshot` ou os canais IPC a `@atlas/contracts` — só com um 2º consumidor real, via ADR (mesma regra que manteve `StatusSnapshot`/`AskSnapshot`/`TurnSnapshot` locais nas SPECs 0031/0032/0033);
- qualquer alteração em `@atlas/contracts`, `@atlas/core`, `@atlas/memory` ou qualquer outro package do Core — a superfície pronta (`createAtlas`, `atlas.memory.list`/`forget`, `Fact`) basta; necessidade de mudança nesses packages é motivo para **parar e registrar** (Constituição);
- estilização/UX elaborada (CSS, tabelas ricas, paginação, ordenação) — o painel desta fatia é diagnóstico/mínimo, como as janelas das SPECs 0031/0032/0033;
- bundler/framework de UI; empacotamento/distribuição (Fase 3); E2E/harness headless de Electron em CI — a janela segue validada por smoke manual;
- comandos de conversa `/lembrar`/`/esquecer` ao vivo no chat (candidato de 1.3, próprio).

---

# Pré-requisitos

- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação do `apps/desktop`: `core-bridge`, `main.ts`, `preload.cjs`, renderer, IPC; padrão do round-trip stateless.
- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) (Done) — `resolveAskSnapshot` stateless e snapshots planos locais ao app (padrão espelhado aqui).
- [SPEC-0009](SPEC-0009-memory-service.md) (Done) — Memory Service (`atlas.memory.list`/`forget`).
- [SPEC-0029](SPEC-0029-episodic-project-memory.md) (Done) — `Fact.category?`/`subject?` (campos exibidos no painel).

---

# Critérios de Aceitação

- `pnpm lint` passa sem erros, cobrindo os arquivos novos/alterados de `apps/desktop` (inclusive `renderer.js`/`preload.cjs` no contexto browser/CommonJS);
- `pnpm typecheck` passa, cobrindo `apps/desktop`;
- `pnpm test` executa e passa, incluindo os testes novos/estendidos de `apps/desktop/tests/`;
- teste comprova: sobre o Core real (in-memory, gateway `fake`, `dataDir` temporário), após `atlas.memory.remember` de N fatos, `resolveMemorySnapshot()` devolve N `FactSnapshot` planos `{ id, text, createdAt, source, category, subject? }`, cada um serializável por IPC (`JSON.stringify` round-trips sem perda), com `source`/`category` resolvidos aos defaults (`'user'`/`'fact'`) quando ausentes no `Fact`;
- teste comprova: `resolveMemorySnapshot` chama `createAtlas` **exatamente uma vez** e `atlas.shutdown()` **exatamente uma vez** (round-trip stateless — sobe e desliga, como `resolveStatusSnapshot`);
- teste comprova: `forgetFact(id)` de um `id` existente devolve `true` e o fato some de um `resolveMemorySnapshot()` subsequente; `forgetFact(id)` de um `id` inexistente devolve `false` sem lançar; cada chamada sobe e desliga o Core uma vez;
- teste comprova: com o acervo vazio, `resolveMemorySnapshot()` devolve `[]` (nunca `undefined`);
- smoke manual (registrado nas Observações): em sessão gráfica real (`pnpm --filter @atlas/desktop start`), abrir o painel de memória, ver os fatos memorizados (semear antes via `atlas remember` na CLI, mesmo `dataDir`); clicar em "esquecer" num fato e observar que ele some da lista após a recarga; nenhum prompt de terminal envolvido;
- estrutura corresponde à seção "Arquivos Esperados";
- nenhuma alteração em `@atlas/contracts`, `@atlas/core`, `@atlas/memory` nem qualquer outro package do Core.

---

# Arquivos Esperados

```text
apps/
└── desktop/
    ├── src/
    │   ├── core-bridge.ts        # + resolveMemorySnapshot/forgetFact + FactSnapshot
    │   ├── main.ts               # + ipcMain.handle dos 2 canais de memória
    │   ├── preload.cjs           # + window.atlas.memory.list()/forget(id)
    │   ├── confirm-port.ts        # inalterado
    │   ├── steps-view.ts          # inalterado
    │   └── renderer/
    │       ├── index.html        # + painel de memória (lista + botões esquecer/atualizar)
    │       └── renderer.js       # + carrega a lista, pinta os fatos, esquece e recarrega
    ├── tests/
    │   └── core-bridge.test.ts   # + casos de resolveMemorySnapshot/forgetFact
    └── CLAUDE.md                 # + helpers de memória, canais IPC novos, fronteira com 2.4
```

Nenhum arquivo novo em `packages/*`, `docs/06-adr/` ou `@atlas/contracts`. Essa lista é expectativa e pode sofrer pequenos ajustes.

---

# Componentes Impactados

Camada Interaction do Module Catalog, no app `apps/desktop`:

- Input Gateway / Output Gateway (semente desktop, SPEC-0031/0032/0033) — entrada ganha o gesto de "esquecer um fato"; saída ganha um painel que lista os fatos memorizados.

Consome, **sem alterar**: Core (`createAtlas`), Memory Service (`atlas.memory.list`/`forget`), Lifecycle Manager (`shutdown`).

---

# Interfaces Necessárias

Locais em `apps/desktop` (não em `@atlas/contracts` — não há segundo consumidor):

```text
FactSnapshot {
  id: string
  text: string
  createdAt: string
  source: string        // resolvido: fact.source ?? 'user'
  category: string      // resolvido: fact.category ?? 'fact'
  subject?: string
}

resolveMemorySnapshot(deps?: {
  configOverride?: AtlasConfigOverride
}): Promise<readonly FactSnapshot[]>

forgetFact(id: string, deps?: {
  configOverride?: AtlasConfigOverride
}): Promise<boolean>
```

`Fact`/`AtlasConfigOverride` vêm de `@atlas/contracts` (já existentes). `FactSnapshot` é local ao app (mesma regra de `StatusSnapshot`/`AskSnapshot`/`TurnSnapshot`). Nenhuma interface nova em `@atlas/contracts`.

Canais IPC novos (nomes estáveis, ao lado de `'atlas:status'`/`'atlas:ask'`/`'atlas:chat:*'`):

```text
main:     ipcMain.handle('atlas:memory:list',   ()          => resolveMemorySnapshot())
          ipcMain.handle('atlas:memory:forget', (_e, id)    => forgetFact(id))
preload:  window.atlas.memory.list()            → ipcRenderer.invoke('atlas:memory:list')
          window.atlas.memory.forget(id)        → ipcRenderer.invoke('atlas:memory:forget', id)
renderer: const facts   = await window.atlas.memory.list()
          const removed = await window.atlas.memory.forget(id)
```

---

# Fluxo Esperado

```text
renderer (na janela): ao abrir o painel / ao atualizar → window.atlas.memory.list()
  → [main] ipcMain.handle('atlas:memory:list')
      → resolveMemorySnapshot()
          → createAtlas({ config })            (sobe)
          → atlas.memory.list() → map(Fact → FactSnapshot)
          → atlas.shutdown()                   (finally — desliga)
  → pinta a lista de fatos (id/texto/data/origem/categoria/projeto)

usuário clica "esquecer" num fato → window.atlas.memory.forget(id)
  → [main] ipcMain.handle('atlas:memory:forget')
      → forgetFact(id)
          → createAtlas({ config }) → atlas.memory.forget(id) → atlas.shutdown()  (finally)
  → recarrega a lista (window.atlas.memory.list())
```

Regras (para remover ambiguidade):

- o Core vive **exclusivamente no main process**; o renderer nunca importa `packages/*` nem tipos de contrato — recebe só `FactSnapshot[]` plano e `boolean` (Artigo 4 / segurança Electron);
- a leitura e a remoção passam **sempre pelo `MemoryService`** (`list`/`forget`), nunca por acesso direto ao arquivo JSON de memória — o Memory Service é a autoridade exclusiva sobre o estado persistente (Artigo 11);
- cada operação é um round-trip **stateless** (sobe/desliga o Core), como `resolveStatusSnapshot`/`resolveAskSnapshot` — memória é durável em disco (ADR-0011), então um Core recém-subido lê/escreve o mesmo acervo, sem depender de uma sessão viva;
- esquecer um fato não abre diálogo de confirmação — paridade com `atlas forget` (ver Decisões de design); a UI expõe a ação de forma explícita (botão rotulado por fato).

---

# Estratégia de Implementação

1. estender `core-bridge.ts`: `FactSnapshot` + `resolveMemorySnapshot`/`forgetFact`, espelhando a forma de `resolveStatusSnapshot` (sobe → opera → `finally` desliga); mapear `Fact → FactSnapshot` resolvendo defaults como `runMemoryList`; TDD sobre o Core real (gateway `fake`, `dataDir` temporário);
2. testes de `core-bridge.test.ts`: `remember` de fatos → `resolveMemorySnapshot` devolve-os planos e serializáveis; `createAtlas`/`shutdown` uma vez por chamada (spy); `forgetFact` de id existente `true` e some da lista; id inexistente `false` sem lançar; acervo vazio ⇒ `[]`;
3. `main.ts`: registrar os dois `ipcMain.handle` de memória; casca fina;
4. `preload.cjs`: expor `window.atlas.memory.{list,forget}`; `renderer/index.html` + `renderer.js`: painel que lista os fatos e um botão "esquecer" por linha + ação de recarregar; recarrega após esquecer;
5. ajustar ESLint se acusar (globals já cobertos pelas SPECs 0031/0032/0033); validar `pnpm lint`/`typecheck`/`test`;
6. smoke manual em sessão gráfica real (semear fatos via CLI no mesmo `dataDir`; ver a lista; esquecer um; ver sumir) e registrar o resultado;
7. atualizar `apps/desktop/CLAUDE.md`; validar todos os critérios de aceitação.

---

# Estratégia de Testes

- testes unitários em `apps/desktop/tests/core-bridge.test.ts` sob o Vitest já configurado, **sem Electron** — a fronteira testável é o par `resolveMemorySnapshot`/`forgetFact` do `core-bridge`, exatamente como as SPECs 0031/0032/0033 testaram `resolveStatusSnapshot`/`resolveAskSnapshot`/o ciclo de chat sem tocar o runtime gráfico;
- **resolveMemorySnapshot**: sobre o Core real com `dataDir` temporário, após `remember` de fatos, devolve `FactSnapshot[]` plano e serializável, com defaults resolvidos; acervo vazio ⇒ `[]`; `createAtlas`/`shutdown` uma vez (spy);
- **forgetFact**: id existente ⇒ `true` e o fato some de um `list` subsequente; id inexistente ⇒ `false` sem lançar; `createAtlas`/`shutdown` uma vez;
- sem mocks do Core — `createAtlas` real (ADR-0004); memória real com `dataDir` isolado por teste (limpeza no teardown, padrão das suítes de memória);
- `main.ts`/`preload.cjs`/`renderer.js` (camada Electron/DOM) **não** são unit-testados nesta fatia — validação por smoke manual (harness headless de Electron é Fora do Escopo).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é passo de fecho (`doc-sync`), não do implementador; o implementador toca a doc específica da própria SPEC (o arquivo da SPEC, o `CLAUDE.md` de `apps/desktop`).

---

# Restrições

- Não criar novos packages, módulos, Tools, Skills nem Personas; o único código novo vive em `apps/desktop`. O app segue fino: nenhuma lógica de memória, normalização ou storage (ProjectStructure) — só invoca `list`/`forget` e renderiza.
- Consumir o Core **só** pelos contratos públicos (`createAtlas`, `atlas.memory.list`/`forget`, `Fact`) — nunca internals de package (Artigo 4); nunca ler/escrever o arquivo de memória direto (Artigo 11).
- O Core vive só no main process; o renderer não importa `packages/*` nem tipos de contrato. `contextIsolation: true`, `nodeIntegration: false`.
- `core-bridge.ts` **não** importa `electron` (a dependência de Electron — `ipcMain`/`app` — fica confinada a `main.ts`); é o que o mantém testável no Vitest.
- Não alterar `@atlas/contracts`/`@atlas/core`/`@atlas/memory` nem qualquer package do Core. Se a implementação sugerir que uma mudança neles é necessária, **parar e registrar** (Constituição).
- Sem `dist/`, sem bundler, sem framework de UI: main process em `.ts` via `tsx` (ADR-0005/0019); renderer/preload em JS plano.
- `FactSnapshot` e os canais IPC ficam **locais** a `apps/desktop`; promoção a `@atlas/contracts` só com 2º consumidor real, via ADR.

---

# Observações

**Round-trip stateless, memória durável.** Diferente do chat (SPEC-0033, que mantém o Core vivo entre turnos porque o Context Service é em memória), a memória é durável em disco (ADR-0011). Por isso o painel usa round-trips **stateless** (sobe/desliga o Core por operação, como `status`/`ask`): um Core recém-subido lê/escreve o mesmo acervo. É o modelo mais simples e consistente com as SPECs 0031/0032. Ver "Decisões de design".

**Coexistência com uma sessão de chat viva.** Se houver um chat aberto (SPEC-0033) enquanto o painel esquece um fato, dois Cores tocam o mesmo store durável — o Core do chat pode manter um cache em memória que não reflita a remoção até a próxima recarga. Este atrito já existe hoje (chat vivo + `ask`/`status` stateless coexistem) e é aceitável nesta fatia; sincronização reativa entre painéis é refinamento futuro (Fora do Escopo).

**Smoke manual.** Como nas SPECs 0031/0032/0033, o shell de automação sem WindowServer não executa `app.whenReady()`; a confirmação visual (painel com fatos semeados via CLI no mesmo `dataDir`, esquecer um e vê-lo sumir) deve ser feita por quem tiver sessão gráfica real, antes de fechar a SPEC. A cadeia testável (`core-bridge`) roda em CI sob Vitest sem Electron. Atrito recorrente de toda fatia visual da Fase 2.

**Sem confirmação nativa ao esquecer.** `atlas forget` da CLI remove sem confirmar; esta fatia mantém a paridade (a ação é explícita — botão rotulado por fato). Adicionar um diálogo de confirmação é refinamento de UX, não requisito do 2.4. Ver "Decisões de design".

---

# Checklist para IA

Antes de implementar:

- ler documentação referenciada (Roadmap 2.4, ADR-0011/0019, SPEC-0031/0032/0033, `runMemoryList`/`runForget` da CLI);
- compreender objetivo (listar + esquecer fatos pela GUI, round-trip stateless pelo Memory Service);
- confirmar que nenhum contrato/package do Core precisa mudar.

Durante implementação:

- manter o app fino; Core só no main process; renderer isolado;
- `core-bridge.ts` livre de import de Electron; passar sempre pelo `MemoryService` (nunca ler o arquivo direto);
- manter simplicidade (sem bundler, sem framework); painel diagnóstico/mínimo.

Após implementação:

- executar testes;
- smoke manual do app real (semear via CLI, listar, esquecer, ver sumir);
- validar critérios de aceitação;
- registrar lições aprendidas;
- registrar conclusão.

---

# Decisões de design

> Decisões tomadas pelo `spec-drafter` (Emenda v1.1), em formato de veto. Quem as ataca é o `architecture-reviewer` no gate `Draft → Ready`.

**1. Perfil `completo`.**

- **Decisão**: classificar a SPEC como `completo`.
- **Porquê**: a fatia mexe em `apps/desktop/src` — fora da superfície de containment do perfil `micro` (`packages/X/src` + opcionalmente `apps/cli/src`), que não inclui `apps/desktop`. Além disso envolve integração gráfica (renderer/IPC/Electron) validada só por smoke manual, não por teste automatizado. Paridade direta com as três SPECs irmãs do desktop (0031/0032/0033), todas `completo` pela mesma razão de containment. Na dúvida, `completo` (default seguro).
- **Alternativa descartada**: `micro` — embora a SPEC seja aditiva, não toque `@atlas/contracts`, não crie módulo/Tool/Skill/Persona e não exija ADR, ela falha a condição de containment (mexe em `apps/desktop/src`, não em `packages/X/src`/`apps/cli/src`); classificar `micro` só a faria cair no pipeline completo no gate, sem ganho.

**2. Round-trip stateless (sobe/desliga o Core por operação), como `status`/`ask` — não reusar um Core vivo.**

- **Decisão**: `resolveMemorySnapshot`/`forgetFact` sobem o Core via `createAtlas` e o desligam (`finally`) a cada chamada, espelhando `resolveStatusSnapshot`/`resolveAskSnapshot`.
- **Porquê**: memória é conhecimento **persistente em disco** (ADR-0011/Artigo 6), então um Core recém-subido lê/escreve o mesmo acervo durável — não há necessidade de segurar estado vivo (diferente do chat, cujo Context Service é em memória e por isso exige Core vivo entre turnos). É o modelo mais simples e já validado pelas SPECs 0031/0032. Mais simples e sustentável.
- **Alternativa descartada**: reusar o Core de uma sessão de chat viva (SPEC-0033) para as operações de memória — acoplaria o painel a um chat aberto (o painel deve funcionar sem chat), inverteria a independência das duas superfícies e não traria ganho, já que a memória é durável e legível por qualquer Core.

**3. Passar sempre pelo `MemoryService` (`list`/`forget`), nunca ler o arquivo de memória direto.**

- **Decisão**: a leitura e a remoção usam `atlas.memory.list()`/`atlas.memory.forget(id)`; o `core-bridge` nunca abre o JSON de memória.
- **Porquê**: o Memory Service é a autoridade exclusiva sobre o estado persistente (Artigo 11, Module Catalog); a app é uma casca de interação que consome o contrato público, não um segundo caminho de acesso ao store. Mais modular e fiel à arquitetura.
- **Alternativa descartada**: ler/escrever o arquivo JSON diretamente do `apps/desktop` para "economizar" o boot do Core — violaria o Artigo 11 e duplicaria a lógica de storage; rejeitada.

**4. `FactSnapshot` plano com defaults resolvidos, espelhando o render da CLI; `Fact` cru não cruza o IPC.**

- **Decisão**: `resolveMemorySnapshot` devolve `{ id, text, createdAt, source, category, subject? }` com `source ?? 'user'` e `category ?? 'fact'` já resolvidos (como `runMemoryList`); o renderer só pinta.
- **Porquê**: mantém tipos de contrato fora do renderer (Artigo 4 + isolamento Electron), espelha o `AskSnapshot`/`TurnSnapshot` já validados e deixa o renderer burro (nada de lógica de default no browser). Consistente com as fatias anteriores. Mais modular e testável.
- **Alternativa descartada**: enviar o `Fact` cru por IPC — vazaria a forma do contrato para o renderer e forçaria a resolução de defaults no browser; rejeitada por consistência com 0032/0033.

**5. Esquecer sem diálogo de confirmação — paridade com `atlas forget`.**

- **Decisão**: clicar "esquecer" remove o fato sem abrir diálogo nativo de confirmação.
- **Porquê**: `atlas forget` da CLI remove sem confirmar; o gate `confirm` do Permission Service (ADR-0013) é sobre execução de Tools num plano, não sobre gerência direta de memória — não se aplica aqui. A ação já é explícita (botão rotulado por fato). Paridade honesta com a CLI; mais simples.
- **Alternativa descartada**: exigir diálogo de confirmação nativo ao esquecer — divergiria da CLI sem requisito do 2.4/PRD e adicionaria complexidade de UX fora do escopo; refinamento futuro, se desejado.

**6. Listar todos os fatos, sem filtro/busca na UI nesta fatia.**

- **Decisão**: `resolveMemorySnapshot()` chama `atlas.memory.list()` sem filtro; a UI mostra todos os fatos.
- **Porquê**: o Roadmap 2.4 pede "listar, esquecer fatos" — a lista completa cumpre o pedido; filtro por categoria (`list --category`) e busca (`memory search`) são capacidades adjacentes que expandiriam o escopo sem pedido. Mais simples; não expande "já que estamos aqui".
- **Alternativa descartada**: já embutir filtro por categoria/busca na UI — expansão de escopo além do que o usuário e o Roadmap pediram para esta fatia; candidato futuro.

**7. `FactSnapshot`/canais IPC permanecem locais a `apps/desktop`.**

- **Decisão**: não promover nada a `@atlas/contracts`; declarar tipos e canais localmente.
- **Porquê**: não há 2º consumidor real desses tipos/canais — a regra do repo (2º consumidor via ADR) manteve `StatusSnapshot`/`AskSnapshot`/`TurnSnapshot`/`'atlas:*'` locais nas SPECs 0031/0032/0033; o mesmo se aplica. Evita acoplamento prematuro. Mais simples.
- **Alternativa descartada**: subir `FactSnapshot` ou os canais a `@atlas/contracts` — exigiria ADR e um 2º consumidor inexistente; promoção especulativa contra a regra de contratos do repo.

**8. Prioridade `Medium`.**

- **Decisão**: prioridade `Medium`.
- **Porquê**: avança a Fase 2 (primeira linha do item 2.4), mas a capacidade de listar/esquecer já existe sem regressão via CLI (`atlas memory list`/`atlas forget`), e a fundação de interface já foi aberta pelas SPECs 0031/0032/0033 — não há bloqueio de fase inteira nem correção/segurança em jogo.
- **Alternativa descartada**: `High` — reservada à fatia que abriu a fase (SPEC-0031); aqui o avanço é incremental. `Critical` — reservada a correção/segurança bloqueante, que não é o caso.

---

# Resultado Esperado

A janela do `@atlas/desktop` passa a oferecer uma **gerência visual de memória**: um painel lista os fatos persistidos pelo Memory Service (`id`, texto, data, origem, categoria e projeto quando houver) e um botão por fato permite esquecê-lo — o equivalente GUI de `atlas memory list` e `atlas forget`. As operações são round-trips **stateless** com o Core (sobem e desligam a plataforma por chamada, como `status`/`ask`), passando sempre pelo contrato público `MemoryService` (`list`/`forget`), nunca por acesso direto ao store (Artigo 11). A lógica de valor (`resolveMemorySnapshot`/`forgetFact`) vive fora do runtime gráfico, testada no Vitest sem Electron sobre a memória real com `dataDir` isolado; o renderer só pinta `FactSnapshot[]` plano, sem conhecer `packages/*` nem tipos de contrato; `@atlas/contracts` e todos os packages do Core ficam intocados. É a primeira das três linhas do item 2.4, deixando troca de Persona e configuração de permissões por GUI para as fatias seguintes.
