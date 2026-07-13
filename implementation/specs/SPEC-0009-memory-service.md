# SPEC-0009 — Memory Service (fatos/preferências explícitos)

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0009

---

**Título**

Memory Service — fatos/preferências persistentes, injetados na geração cognitiva

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

Ao concluir esta SPEC deverá existir o package `packages/memory` (`@atlas/memory`): a **autoridade única sobre conhecimento persistente** da plataforma, começando pela menor fatia de valor — **fatos e preferências gravados explicitamente pelo usuário**, que **persistem entre reinícios do processo** e são **injetados na geração** do Cognitive Core, de modo que `atlas ask`/`atlas chat` passam a levar em conta o que o usuário pediu para lembrar. O usuário gerencia esses fatos por comandos de CLI dedicados.

Concretamente, quando esta SPEC estiver concluída:

- `createMemoryService({ storage }): Promise<MemoryService>` existe, com `remember`/`forget`/`list`/`prompt`.
- O contrato `Fact`/`MemoryService` vive em `@atlas/contracts`; `AtlasConfig` ganha `memory.path`; `AtlasPlatform` expõe `memory`.
- A persistência usa uma **porta de storage injetável** (`MemoryStorage`, interna ao package), com um **adapter de arquivo JSON** como default e um adapter fake nos testes (sem IO real) — é o primeiro módulo da plataforma a tocar disco.
- O Cognitive Core compõe o bloco de memória com identidade (Persona) e tarefa (`memoryPrompt` injetado por parâmetro); `respond` permanece **função pura**.
- `@atlas/core` compõe o Memory Service (com o adapter de arquivo no caminho de config), injeta `memory.prompt()` no Cognitive e expõe `atlas.memory`.
- A CLI ganha `atlas remember "<fato>"`, `atlas forget <id>` e `atlas memory list`; o caminho do arquivo é selecionável por `--memory-path`/`ATLAS_MEMORY_PATH`.
- ADR-0011 registra a decisão (persistência por porta injetável + JSON; primeiro efeito de disco; memória injetada na geração, estendendo o princípio do ADR-0010).

---

# Motivação

A Constituição e o Glossary tratam **memória** (conhecimento persistente) e **contexto** (estado temporário da execução) como conceitos **distintos e separados**; o Artigo de invariante 6 dá à Memória "autoridade exclusiva sobre estado persistente". O Module Catalog cataloga o **Memory Service** (`packages/memory`) como a única autoridade para armazenamento e recuperação de conhecimento permanente (preferências, fatos persistentes, memória de projetos, memória episódica, histórico, relações), usada pelo Cognitive Core.

Até aqui a plataforma é **efêmera**: o Context Service (SPEC-0007) guarda a conversa apenas durante a sessão, em memória, por design (ADR-0009). Nada sobrevive ao encerramento do processo. Esta SPEC introduz o primeiro conhecimento **persistente** do Atlas — a fatia mínima que entrega valor visível ponta a ponta: o usuário grava um fato ("meu nome é X", "prefiro respostas curtas"), e o Atlas passa a levá-lo em conta nas próximas sessões. O amplo escopo do Memory Service (episódica, projetos, busca, classificação, retenção) é deliberadamente decomposto: esta SPEC entrega só fatos/preferências explícitos; o resto vira SPECs futuras.

Documentos originadores: **ArchitectureConstitution** (memória como autoridade sobre estado persistente) + **Glossary** (Memory/Context distintos) + **Module Catalog / Project Structure** (Memory Service, `packages/memory`).

---

# Referências

- ArchitectureConstitution (`docs/00-project/ArchitectureConstitution.md`) — memória tem autoridade exclusiva sobre estado persistente
- Glossary (`docs/00-project/Glossary.md`) — Memory, Context ("Memory armazena contexto"; temporário vs. permanente)
- Module Catalog — Memory Service (`docs/03-architecture/ModuleCatalog.md`)
- Project Structure — `packages/memory/` (`docs/03-architecture/ProjectStructure.md`)
- Cognitive Lifecycle — etapa de Aprendizado (`docs/03-architecture/CognitiveLifecycle.md`)
- ADR-0006 (precedência de config), ADR-0003 (composition root), ADR-0004 (composição manual por factory)
- ADR-0009 (Context como store de valor; leitura de ambiente fora de escopo) — contraste memória × contexto
- ADR-0010 (Persona injetada na geração) — princípio de injeção reaproveitado
- ADR-0011 — Memory Service: persistência por porta injetável + memória injetada na geração (a ser criado por esta SPEC)
- SPEC-0005 (Cognitive Core), SPEC-0007 (Context Service), SPEC-0008 (Persona Service)

---

# Escopo

- Criar o package `packages/memory` (`@atlas/memory`) com `createMemoryService({ storage }): Promise<MemoryService>`.
- `MemoryService`: `remember(text)`, `forget(id)`, `list()`, `prompt()` (bloco de fatos enquadrado para injeção, ou `undefined` se vazio).
- Definir a porta `MemoryStorage` (interna ao package) e dois adapters: `createFileMemoryStorage(path)` (JSON, default) e um fake em memória para testes.
- Definir o contrato `Fact` e `MemoryService` em `@atlas/contracts`.
- Adicionar `memory: { path: string }` a `AtlasConfig` e `memory?: { path?: string }` a `AtlasConfigOverride`; default do caminho via `os.homedir()` (`~/.atlas/memory.json`); validar/mesclar em `loadConfig` (mesmo tratamento aninhado de `config.model`).
- Adicionar `memory: MemoryService` a `AtlasPlatform`.
- Alterar o Cognitive Core: `createCognitiveCore({ gateway, personaPrompt?, memoryPrompt? })` compõe identidade + memória + tarefa; `respond` permanece puro.
- Compor em `@atlas/core`: criar o Memory Service com o adapter de arquivo (caminho de config), injetar `memory.prompt()` no Cognitive, expor `atlas.memory`.
- CLI: comandos `atlas remember "<fato>"`, `atlas forget <id>`, `atlas memory list`; flag `--memory-path`, env `ATLAS_MEMORY_PATH`; `HELP_TEXT` atualizado.
- Erro de memória: `AtlasError` com `code: 'ATLAS_MEMORY'` (via subclasse `MemoryError`).
- Testes (unit + integração) e documentação.
- Criar ADR-0011.

---

# Fora do Escopo

Esta seção é obrigatória.

- **Não** implementar **aprendizado automático** — o Cognitive Core não detecta nem grava fatos sozinho; a gravação é sempre explícita, via comando de CLI. (Aprendizado é etapa futura do ciclo cognitivo, hoje colapsado.)
- **Não** implementar comandos slash de memória no `atlas chat` (`/lembrar`, `/esquecer`) — a gravação é por comandos one-shot; re-injeção ao vivo numa conversa aberta fica para SPEC futura.
- **Não** re-injetar memória numa sessão de chat **já em andamento**: fatos são lidos e injetados no **startup**; gravar um fato só afeta invocações seguintes de `ask`/`chat` (limitação assumida e documentada).
- **Não** implementar memória **episódica**, memória de **projetos**, **histórico** de conversas persistido, nem **relações** entre informações — apenas fatos/preferências como lista.
- **Não** implementar **classificação**, **indexação**, **busca**, **políticas de retenção** ou revisão/versionamento de fatos (o catálogo os permite; ficam para SPECs futuras).
- **Não** usar SQLite nem banco embutido — persistência é arquivo JSON via a porta injetável.
- **Não** tornar o Memory Service consumidor do Model Gateway (não gera nem resume nada) nem fazê-lo decidir estratégias (Module Catalog).
- **Não** integrar o Memory Service ao Context Service nem ao Persona Service ainda (o catálogo os lista como consumidores futuros).
- **Não** implementar criptografia, multiusuário, sincronização ou memória por Persona.
- **Não** alterar o contrato `respond` (segue função pura) nem introduzir estado no Cognitive Core.
- **Não** implementar Personas/memória definidas por arquivo de config externo além do caminho do arquivo de memória.

---

# Pré-requisitos

- SPEC-0004 (model-gateway) — Done
- SPEC-0005 (cognitive-core) — Done
- SPEC-0007 (context-service) — Done
- SPEC-0008 (persona-service) — Done

---

# Critérios de Aceitação

Cada item é verificável.

- Package `@atlas/memory` criado; `createMemoryService({ storage })` retorna (via `await`) um `MemoryService`.
- `createMemoryService` **carrega** os fatos do storage uma vez na criação; `list()` os retorna (leitura síncrona).
- `remember(text)` gera um `Fact` (`id` curto gerado, `text`, `createdAt` ISO), persiste via `storage.save`, e o fato passa a aparecer em `list()`.
- `forget(id)` remove o fato e persiste; retorna `true` se existia, `false` caso contrário.
- `prompt()` retorna um bloco de texto que enquadra os fatos conhecidos quando há ≥ 1 fato; retorna `undefined` quando não há fatos.
- A porta `MemoryStorage` existe; `createFileMemoryStorage(path)` lê/escreve JSON (arquivo ausente → lista vazia; cria o diretório ao salvar; JSON inválido → `MemoryError`); um adapter fake em memória permite testar o serviço **sem IO real**.
- Contrato `Fact`/`MemoryService` vive em `@atlas/contracts`.
- `AtlasConfig.memory.path` existe (default via `os.homedir()` → `~/.atlas/memory.json`); `AtlasConfigOverride.memory?.path?` existe; `loadConfig` mescla campo-a-campo (precedência `flags > env > defaults`).
- O Cognitive Core compõe identidade + memória + tarefa: com `memoryPrompt` presente, o system message inclui o bloco de memória; sem ele, não inclui. Ordem: identidade → memória → tarefa. `respond` permanece função pura (diff não introduz estado).
- `createAtlas` cria o Memory Service com o adapter de arquivo no caminho de config, injeta `memory.prompt()` no Cognitive e expõe `atlas.memory`.
- CLI: `atlas remember "<fato>"` grava e confirma (`Lembrado [id]: <fato>`); `atlas forget <id>` remove (ou avisa que não existe); `atlas memory list` lista `id`, texto e data (ou informa vazio). `--memory-path`/`ATLAS_MEMORY_PATH` selecionam o arquivo.
- Erro de memória → `AtlasError` com `code: 'ATLAS_MEMORY'`.
- ADR-0011 criado e aceito.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.
- Documentação atualizada; lições registradas em `implementation/LESSONS_LEARNED.md`.

---

# Arquivos Esperados

```text
packages/memory/
  package.json
  tsconfig.json
  CLAUDE.md
  src/
    index.ts                 # createMemoryService, createFileMemoryStorage
    memory-service.ts        # registro em memória + write-through + prompt()
    storage/
      file-storage.ts        # createFileMemoryStorage(path) (JSON)
    errors.ts                # MemoryError (ATLAS_MEMORY)
  tests/
    memory-service.test.ts   # fake storage
    file-storage.test.ts     # tmpdir real

packages/contracts/src/
  memory.ts                  # Fact, MemoryService
  config.ts                  # AtlasConfig/Override ganham memory
  platform.ts                # AtlasPlatform ganha memory
  index.ts                   # re-exports

packages/cognitive/src/cognitive-core.ts   # memoryPrompt injetado; composição
packages/cognitive/tests/                   # compõe identidade + memória + tarefa

packages/core/src/config/defaults.ts        # memory.path default (os.homedir())
packages/core/src/config/load-config.ts     # merge aninhado de memory
packages/core/src/index.ts                  # cria/injeta/expõe memory
packages/core/tests/

apps/cli/src/gateway/input-gateway.ts       # --memory-path, ATLAS_MEMORY_PATH
apps/cli/src/commands/remember.ts           # atlas remember
apps/cli/src/commands/forget.ts             # atlas forget
apps/cli/src/commands/memory.ts             # atlas memory list
apps/cli/src/run.ts                         # roteamento + HELP_TEXT
apps/cli/tests/

docs/06-adr/ADR-0011-memory-service-persistence.md
```

Lista é expectativa; pode sofrer pequenos ajustes (ex.: `remember`/`forget`/`memory list` podem consolidar num único `commands/memory.ts` se ficar mais simples).

---

# Componentes Impactados

- Memory Service (novo) — `packages/memory`
- Contracts — `@atlas/contracts` (novo contrato + `AtlasConfig` + `AtlasPlatform`)
- Cognitive Core — passa a compor identidade + memória + tarefa (memoryPrompt injetado)
- Core — composição, criação do Memory Service, validação/merge de config
- Input Gateway / CLI — comandos `remember`/`forget`/`memory list`, seleção do caminho

---

# Interfaces Necessárias

Em `@atlas/contracts`:

```ts
export interface Fact {
  readonly id: string;         // id curto gerado (estável, usado por `forget`)
  readonly text: string;
  readonly createdAt: string;  // ISO 8601
}

export interface MemoryService {
  remember(text: string): Promise<Fact>;
  forget(id: string): Promise<boolean>;
  list(): readonly Fact[];
  prompt(): string | undefined;   // bloco de fatos p/ injeção; undefined se vazio
}
```

Porta interna a `@atlas/memory` (não sobe a contracts, como os provedores do Model Gateway):

```ts
export interface MemoryStorage {
  load(): Promise<Fact[]>;
  save(facts: readonly Fact[]): Promise<void>;
}
```

`AtlasConfig` ganha `readonly memory: { readonly path: string }`; `AtlasConfigOverride` ganha `memory?: { path?: string }`; `AtlasPlatform` ganha `readonly memory: MemoryService`. `CognitiveCoreDeps` ganha `memoryPrompt?: string`.

---

# Fluxo Esperado

```text
Gravação (one-shot):
  atlas remember "meu nome é X"
    ↓  createAtlas → atlas.memory.remember("meu nome é X")
    ↓  storage.save(facts)  → ~/.atlas/memory.json

Leitura/uso (startup de ask/chat):
  config.memory.path
    ↓  createFileMemoryStorage(path).load() → Fact[]
    ↓  createMemoryService({ storage })      → MemoryService (fatos carregados)
    ↓  memory.prompt()                       → bloco de memória (ou undefined)
  createCognitiveCore({ gateway, personaPrompt, memoryPrompt })
    ↓  system = [personaPrompt, memoryPrompt, TASK_FRAMING].filter(Boolean).join("\n\n")
    ↓  gateway.generate(...) → resposta que leva os fatos em conta (1 chamada)

atlas.memory → CLI: memory list exibe; remember/forget mutam
```

---

# Estratégia de Implementação

1. Contrato: `memory.ts` em `@atlas/contracts` + campos em `config.ts`/`platform.ts` + re-exports.
2. `@atlas/memory`: `MemoryError`, porta `MemoryStorage`, `createFileMemoryStorage`, `createMemoryService` (load-once + write-through + `prompt()`), testes (fake + file adapter em tmpdir).
3. Cognitive Core: `memoryPrompt` injetado, composição das partes presentes; atualizar testes.
4. Core: `defaults` (memory.path via `os.homedir()`), `loadConfig` (merge aninhado), `createAtlas` (criar/injetar/expor memory); testes.
5. CLI: `--memory-path`/`ATLAS_MEMORY_PATH`, roteamento e `HELP_TEXT`, comandos `remember`/`forget`/`memory list`; testes.
6. ADR-0011; documentação; lições; suíte completa.

---

# Estratégia de Testes

- Memory Service (fake storage): `createMemoryService` carrega o estado inicial; `remember` gera `Fact` e persiste (write-through verificável no fake); `forget` remove e retorna `true`/`false`; `list` reflete as mutações; `prompt()` enquadra os fatos e retorna `undefined` quando vazio.
- File adapter (`createFileMemoryStorage`): salva e recarrega em `tmpdir` real; arquivo ausente → lista vazia; diretório criado ao salvar; JSON inválido/corrompido → `MemoryError` (`ATLAS_MEMORY`), falhando alto em vez de descartar silenciosamente a memória do usuário.
- Cognitive: com `memoryPrompt`, o system message contém o bloco de memória e o de tarefa; sem `memoryPrompt`, não contém memória; ordem identidade → memória → tarefa (via gateway stub que captura as mensagens).
- Config: `memory.path` default via `os.homedir()`; override por flag/env; merge aninhado campo-a-campo.
- Core: `atlas.memory` presente; fatos gravados afetam o `memoryPrompt` injetado.
- CLI: `remember` grava e confirma; `forget` remove/avisa; `memory list` lista/vazio; `--memory-path`/env selecionam o arquivo; provider `fake` mantém a suíte verde.

---

# Definition of Done

- todos os critérios atendidos;
- testes passando (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`);
- documentação atualizada (CLAUDE.md raiz + `packages/memory/CLAUDE.md` + atualizar `packages/cognitive/CLAUDE.md` — passa a compor memória + `packages/core/CLAUDE.md` se necessário + NEXT_CONTEXT + CURRENT_SPRINT);
- ADR-0011 aceito;
- arquitetura preservada (Memory não decide estratégia, não chama o Gateway, não controla o fluxo cognitivo; `respond` puro; Context×Memory mantidos distintos);
- revisão concluída;
- lições registradas em `implementation/LESSONS_LEARNED.md`.

---

# Restrições

- Não criar módulos além do Memory Service catalogado.
- O Memory Service **não** decide estratégias, não controla o fluxo cognitivo, não chama o Model Gateway, não considera toda conversa como memória permanente (Module Catalog).
- Memória (persistente) e Contexto (temporário) permanecem conceitos distintos (Glossary/Constituição); esta SPEC não mistura os dois módulos.
- `@atlas/memory` depende só de `@atlas/contracts`; só `@atlas/core` importa implementações (Regra 11).
- Não introduzir dependência de runtime em `@atlas/contracts` (a porta `MemoryStorage` e o adapter de arquivo vivem em `@atlas/memory`).
- Precedência de config `flags > env > arquivo > defaults` (ADR-0006; `arquivo` reservado).
- IO de disco fica **atrás da porta injetável**; testes de unidade não tocam disco real (exceto o teste dedicado do file adapter, em `tmpdir`).

---

# Observações

- **Primeiro efeito de disco (ADR-0011):** até aqui a plataforma era efêmera (Context em memória, ADR-0009). O Memory Service é o primeiro a persistir. A decisão espelha os padrões do repo: o efeito colateral (IO) fica atrás de uma **porta injetável** (`MemoryStorage`), como `fetch` no Model Gateway e `LineReader` na CLI — o serviço é testável sem disco, e a composição (`@atlas/core`) escolhe o adapter de arquivo.
- **Memória injetada na geração (estende ADR-0010):** o Memory Service produz uma string (`prompt()`) com o enquadramento dos fatos; o Cognitive recebe apenas essa string por parâmetro e **não conhece o conceito de Memory** (baixo acoplamento), como já ocorre com a Persona. A composição do system prompt passa a juntar identidade + memória + tarefa.
- **Fatia mínima, escopo grande decomposto:** o Module Catalog descreve um Memory Service amplo (episódica, projetos, busca, classificação, retenção, relações). Esta SPEC entrega só **fatos/preferências explícitos**; os demais recortes são SPECs futuras, para manter a unidade de trabalho pequena e verificável.
- **Limitação de startup:** fatos são lidos/injetados na criação da plataforma; uma sessão `atlas chat` já aberta não reflete fatos gravados durante ela. Aceitável porque a gravação é por comandos one-shot, fora do loop de chat.
- **Formato do `id`:** id curto gerado (estável), não índice sequencial — sobrevive a remoções sem realinhar referências que o usuário digita em `forget`.
- **Caminho default:** computado via `os.homedir()` (`~/.atlas/memory.json`), não a string literal `~` (Node não expande `~`). Overridável por `--memory-path`/`ATLAS_MEMORY_PATH`.

---

# Checklist para IA

Antes de implementar: ler ArchitectureConstitution (invariante 6), Glossary (Memory/Context), Module Catalog (Memory Service), ADR-0006 (config), ADR-0009 (Context×Memory), ADR-0010 (injeção), SPEC-0005/0007/0008.

Durante: manter o Memory Service como autoridade de persistência sem decisão de estratégia; IO atrás da porta injetável; manter `respond` puro; manter o Cognitive desacoplado do conceito de Memory (recebe string); não misturar Context e Memory; manter simplicidade.

Após: rodar a suíte; revisar documentação; validar critérios; registrar lições; concluir.

---

# Resultado Esperado

O Atlas passa a ter **memória persistente**: o usuário grava fatos e preferências com `atlas remember "<fato>"`, os revê com `atlas memory list` e os remove com `atlas forget <id>`. Esses fatos sobrevivem ao encerramento do processo (arquivo JSON em `~/.atlas/memory.json`, por padrão) e são **injetados na geração** — a partir daí, `atlas ask`/`atlas chat` respondem levando em conta o que o usuário pediu para lembrar, na voz da Persona ativa, numa única chamada de modelo. O desenho — porta de storage injetável, fatos como dados, memória injetada, Cognitive desacoplado do conceito de Memory — deixa o caminho pronto para as fatias futuras do Memory Service (episódica, projetos, busca, retenção) e para o aprendizado automático quando o ciclo cognitivo deixar de ser colapsado. Memória e Contexto seguem conceitos distintos, `respond` permanece função pura, e a decisão de persistência fica rastreável no ADR-0011.
