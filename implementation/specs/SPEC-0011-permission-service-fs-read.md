# SPEC-0011 — Permission Service + Tools de leitura de sistema de arquivos

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0011

---

**Título**

Portão de permissão na execução: primeiras Tools com efeito (`read_file`/`list_dir`) atrás do Permission Service

---

**Status**

- [x] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [ ] Done

---

**Prioridade**

High

---

# Objetivo

Ao concluir esta SPEC, o Atlas passa a **agir no mundo** pela primeira vez — de forma **segura**: o Runtime executa Tools com **efeito colateral** (leitura de sistema de arquivos) apenas depois de o **Permission Service** avaliar a ação. A execução deixa de ser restrita a Tools puras; a autorização de ações vira um componente real e separado, com autoridade exclusiva sobre "isto pode ser feito?".

Concretamente, quando esta SPEC estiver concluída:

- Existe o package `packages/permissions` (`@atlas/permissions`): `createPermissionService({ readRoots })` → `evaluate(action)` **puro e síncrono** (sem IO), que julga uma `ActionRequest` contra uma política de **raiz permitida** e devolve uma `PermissionDecision`. Dentro de uma raiz → `allowed`; fora → `blocked` (com motivo).
- Existem **duas Tools de leitura** em `packages/tools` — `read_file` (conteúdo de um arquivo) e `list_dir` (entradas de um diretório) — as **primeiras Tools com IO** da plataforma. Cada uma declara, como **dado**, o recurso que tocaria (`requirements(args) → ActionRequest | null`) e lê o disco por uma **porta injetável** (default `node:fs/promises`), testável sem disco real.
- O **Runtime** passa a receber o Permission Service (`createRuntime({ registry, permissions })`) e, por passo: se a Tool declara um requisito, consulta `permissions.evaluate` antes de rodar; ação `blocked` vira um `ExecutedStep` **negado** (falha estruturada, com motivo), **sem lançar** e **sem parar** os demais passos.
- Os contratos `ActionRequest`/`ResourceRef`/`AccessMode`/`PermissionVerdict`/`PermissionDecision`/`PermissionService` vivem em `@atlas/contracts`; `Tool` ganha `requirements?`.
- `@atlas/core` compõe o Permission Service (raiz padrão `cwd`), registra `read_file`+`list_dir` e injeta `permissions` no Runtime. Config nova `permissions.readRoots` (default `[cwd]`, override `--allow-read`/`ATLAS_ALLOW_READ`, precedência `flags > env > defaults`).
- ADR-0013 registra a decisão (Permission Service como portão puro; Tools declaram requisitos como dado; Runtime aplica; contenção lexical; `confirm` reservado).

---

# Motivação

O **Cognitive Lifecycle** e a **espinha de execução** (SPEC-0010) deixaram o Atlas capaz de planejar e executar Tools — mas apenas Tools **puras** (`clock`/`calc`), justamente porque o **Permission Service ainda não existia** (fronteira explícita da SPEC-0010: "Tools que exijam avaliação de risco ficam para depois do Permission Service"). O Atlas sabe fazer aritmética, mas não sabe **ler um arquivo** — não age sobre nenhum recurso externo.

O **Module Catalog** cataloga o **Permission Service** (`packages/permissions`, camada Support) com a responsabilidade de *"avaliar se uma ação pode ser executada de acordo com permissões, políticas e nível de risco"*, distinguindo no mínimo **ações livres / permitidas por política / que exigem confirmação / bloqueadas**, sendo consumido pelo **Runtime** (entre outros) e **não** sendo responsável por executar ações nem por **presumir consentimento para ações destrutivas**. A **Constituição** (Regra 5) define Tools como adaptadores sem lógica de negócio; a autoridade sobre "pode?" é do Permission Service (Regra 4/6 sobre separação de responsabilidades).

Esta SPEC entrega o **menor recorte** que faz o Permission Service existir de verdade, com Tools que produzem um valor que o modelo sozinho não tem (o conteúdo real de um arquivo) — escolhendo deliberadamente **leitura** como primeiro efeito para **não** disparar o problema de "consentimento para ação destrutiva": ações read-only exercitam o portão (livre × bloqueada por política de raiz) sem exigir o fluxo interativo de confirmação, que fica para a fatia de escrita.

Documentos originadores: **Module Catalog** (Permission Service; Runtime consome permissões) + **CognitiveLifecycle** (Execução com avaliação de risco) + fronteira explícita da **SPEC-0010**.

---

# Referências

- Module Catalog (`docs/03-architecture/ModuleCatalog.md`) — Permission Service (responsabilidade, 4 veredictos, "não presumir consentimento para destrutivas"); Runtime consome Permission Service; Tool Registry; Regras de Dependência 5–8
- Cognitive Lifecycle (`docs/03-architecture/CognitiveLifecycle.md`) — Execução com avaliação de risco; transparência
- Project Structure (`docs/03-architecture/ProjectStructure.md`) — `packages/permissions`, `packages/tools`; contratos em `@atlas/contracts`
- ArchitectureConstitution — Regra 5 (Tools são adaptadores sem decisão), autoridade de permissão separada da execução
- ADR-0006 (precedência de config `flags > env > defaults`), ADR-0011 (efeito colateral atrás de porta injetável — padrão reaproveitado para o fs das Tools), ADR-0012 (espinha de execução: falha estruturada por passo, nunca derruba a execução)
- ADR-0013 — Permission Service como portão puro na execução (a ser criado por esta SPEC)
- SPEC-0010 (Planner + Runtime + Tools) — pré-requisito direto

---

# Escopo

- Criar o package `packages/permissions` (`@atlas/permissions`):
  - `createPermissionService({ readRoots }): PermissionService` com `evaluate(action: ActionRequest): PermissionDecision`, **puro e síncrono** (sem IO).
  - Política de **raiz permitida por contenção lexical**: resolve o path da ação para absoluto e verifica se está contido em alguma `readRoot` (com fronteira de separador; `..` normalizado). Dentro → `allowed`; fora → `blocked` com `reason`. Ação com `access` ≠ `read` (reservado) → `blocked` nesta fatia.
- Criar as Tools de leitura em `packages/tools`:
  - `createReadFileTool({ readFile? }): Tool` — `name: 'read_file'`; `requirements({ path })` → `{ resource: { type: 'file', path }, access: 'read' }`; `run({ path })` lê o arquivo pela porta injetável e retorna `ToolResult`. Erro de IO (inexistente, sem permissão de SO etc.) → `ToolResult` de erro.
  - `createListDirTool({ readdir? }): Tool` — `name: 'list_dir'`; `requirements({ path })` → `{ resource: { type: 'directory', path }, access: 'read' }`; `run({ path })` lista as entradas e retorna `ToolResult`. Erro de IO → `ToolResult` de erro.
  - Porta de fs injetável (interface local mínima no package, default `node:fs/promises`), no padrão do `fetch`/`memoryStorage` injetados — testes sem disco real.
- Alterar o **Runtime** (`packages/runtime`):
  - `createRuntime({ registry, permissions }): Runtime`.
  - `execute(plan)`: por passo, obter `tool.requirements?.(args)`; se `null`/ausente → executa (livre); se `ActionRequest` → `permissions.evaluate(req)`; `allowed` → executa; `blocked` (ou `confirm`, tratado como não-executável nesta fatia) → `ExecutedStep` com `ToolResult` de erro (motivo do bloqueio), **sem lançar** e **continuando** nos demais passos.
- Promover contratos a `@atlas/contracts`: `ResourceRef`, `AccessMode`, `ActionRequest`, `PermissionVerdict`, `PermissionDecision`, `PermissionService`; adicionar `requirements?` a `Tool`.
- Compor em `@atlas/core`: criar `createPermissionService({ readRoots: config.permissions.readRoots })`, registrar `read_file`+`list_dir` no registry, injetar `permissions` em `createRuntime`. Adicionar `config.permissions.readRoots` (default `[process.cwd()]`) ao `loadConfig` com override `--allow-read`/`ATLAS_ALLOW_READ`.
- CLI: adicionar a flag `--allow-read <path>` e a env `ATLAS_ALLOW_READ`; `atlas status` exibe os `readRoots` resolvidos. O traço do `atlas ask` já renderiza passos — passo bloqueado aparece com o motivo (sem código novo de renderização além do já existente para erro de passo).
- Testes (unit + integração) e documentação.
- Criar ADR-0013.

---

# Fora do Escopo

Esta seção é obrigatória.

- **Não** implementar Tools de **escrita/deleção** (`write_file`, `delete`, etc.) nem qualquer ação **destrutiva** — só leitura.
- **Não** implementar o veredicto **`confirm`** de fato: o **fluxo interativo de confirmação** (prompt durante a execução, `atlas ask` deixando de ser tiro único) fica para a fatia de escrita. `confirm` entra apenas no **vocabulário** do contrato, reservado; nesta fatia o serviço só produz `allowed`/`blocked`.
- **Não** seguir **symlinks** / usar `realpath`: a contenção é **lexical** (path resolvido + prefixo com fronteira). Endurecimento contra escape por symlink é fatia futura, documentada como limitação conhecida.
- **Não** dar ao Permission Service qualquer **IO** — ele é um avaliador puro de dados; quem toca o disco são as Tools.
- **Não** modelar **identidade de usuário**, **arquivo de políticas** externo, histórico de autorização persistido, nem políticas por-Tool configuráveis — a política desta fatia é só a raiz permitida de leitura.
- **Não** dar **consciência de permissão** ao **Planner** nem ao **Cognitive Core** (avaliação preliminar de risco no Planner fica para depois): a aplicação do portão é **só no Runtime**, no momento da execução. Um passo bloqueado flui como falha estruturada para a 2ª `generate()` de composição, e o modelo explica o bloqueio.
- **Não** implementar **Skills**/**Skill Registry** (`packages/skills`) — só Tools.
- **Não** implementar **dependência de dados entre passos**, **Task Manager completo**, **Observação/replanejamento** nem **Aprendizado automático** (todos já fora de escopo desde a SPEC-0010).
- **Não** modelar um **contexto de ambiente** amplo (repo/branch/árvore de arquivos): apenas o `cwd` entra, como raiz padrão de leitura.
- **Não** adicionar planejamento ao `atlas chat`/`respond`; `respond` permanece função pura e inalterado.
- **Não** expor `atlas.permissions` em `AtlasPlatform` (nada externo o consome; o Runtime o usa internamente, como já ocorre com o próprio runtime) nem criar comando de gerência de permissões.

---

# Pré-requisitos

- SPEC-0010 (Planner + Runtime + Tools) — Done

---

# Critérios de Aceitação

Cada item é verificável.

- Package `@atlas/permissions` criado. `createPermissionService({ readRoots })`:
  - `evaluate({ resource: { type:'file', path: <dentro de uma readRoot> }, access:'read' })` → `{ verdict: 'allowed' }`.
  - path fora de todas as `readRoots` → `{ verdict: 'blocked', reason }`.
  - escape por `..` que sai da raiz (ex.: `<root>/../secret`) → `blocked` (resolvido antes da contenção).
  - path relativo é resolvido para absoluto contra a base configurada de forma determinística nos testes (base injetável ou raízes já absolutas), sem depender do `process.cwd()` real do processo de teste.
  - `access` diferente de `read` → `blocked` (reservado).
  - `evaluate` é síncrono e **não** faz IO (sem `fs`); confirmado por revisão e pela ausência de import de `fs` no package.
- Tools de leitura (`@atlas/tools`):
  - `createReadFileTool({ readFile })`: `requirements({ path })` → `{ resource:{type:'file',path}, access:'read' }`; `run({ path })` retorna `{ ok:true, output }` com o conteúdo do fs injetado; arquivo inexistente / porta que lança → `{ ok:false, error }`; `args` sem `path` string → `{ ok:false, error }`.
  - `createListDirTool({ readdir })`: `requirements({ path })` → `{ resource:{type:'directory',path}, access:'read' }`; `run({ path })` retorna `{ ok:true, output }` com as entradas do fs injetado; erro de porta → `{ ok:false, error }`; `args` inválido → `{ ok:false, error }`.
  - As Tools **não** decidem permissão — só declaram `requirements` e executam; `clock`/`calc` seguem com `requirements` ausente/`null` (livres) e **inalterados**.
- Runtime (`@atlas/runtime`): `createRuntime({ registry, permissions })`:
  - passo cuja Tool não declara requisito (`clock`/`calc`) executa **sem** consultar `permissions` (a execução não chama `evaluate` para esses).
  - passo cuja Tool declara requisito `allowed` executa a Tool normalmente.
  - passo cuja Tool declara requisito `blocked` → `ExecutedStep` com `result.ok === false` (motivo do bloqueio) e a Tool **não** é executada (a porta de fs não é chamada); execução **continua** nos demais passos; `execute` **não** lança.
  - `tools()` inalterado.
- Contratos `ResourceRef`/`AccessMode`/`ActionRequest`/`PermissionVerdict`/`PermissionDecision`/`PermissionService` vivem em `@atlas/contracts`; `Tool.requirements?` adicionado sem quebrar Tools existentes.
- `@atlas/core` compõe o Permission Service (raiz padrão `cwd`), registra `read_file`+`list_dir` e injeta `permissions` no Runtime; `atlas.cognitive.ask` executa uma leitura ponta a ponta com fakes (fs e gateway fakes), e uma leitura fora da raiz produz um passo bloqueado na resposta.
- Config: `config.permissions.readRoots` resolvido com precedência `flags (--allow-read) > env (ATLAS_ALLOW_READ) > default ([cwd])`; valor inválido/vazio tratado no `loadConfig`.
- CLI: `atlas status` exibe os `readRoots` resolvidos; `atlas ask` imprime o traço com o passo bloqueado (motivo) quando a leitura é negada.
- ADR-0013 criado e aceito.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.
- Documentação atualizada; lições registradas em `implementation/LESSONS_LEARNED.md`.

---

# Arquivos Esperados

```text
packages/permissions/
  package.json
  tsconfig.json
  CLAUDE.md
  src/
    index.ts            # createPermissionService
    permission-service.ts # evaluate: contenção lexical de raiz
  tests/
    permission-service.test.ts # allowed/blocked, escape por .., access reservado

packages/tools/src/
  read-file.ts          # createReadFileTool({ readFile? }) + requirements
  list-dir.ts           # createListDirTool({ readdir? }) + requirements
  fs-port.ts            # interface local mínima de fs (default node:fs/promises)
  index.ts              # re-export das novas Tools
packages/tools/tests/
  read-file.test.ts
  list-dir.test.ts

packages/runtime/src/runtime.ts   # execute consulta permissions por passo com requisito
packages/runtime/tests/runtime.test.ts # requisito allowed/blocked; sem requisito não consulta

packages/contracts/src/
  permission.ts         # ResourceRef, AccessMode, ActionRequest,
                        # PermissionVerdict, PermissionDecision, PermissionService
  execution.ts          # Tool ganha requirements?
  index.ts              # re-exports

packages/core/src/index.ts   # cria permission service (readRoots), registra read_file/list_dir, injeta no runtime
packages/core/src/config.ts  # (ou equivalente) permissions.readRoots + precedência
packages/core/tests/

apps/cli/src/main.ts / commands/  # flag --allow-read, env ATLAS_ALLOW_READ; status mostra readRoots
apps/cli/tests/

docs/06-adr/ADR-0013-permission-service-execution-gate.md
```

Lista é expectativa; pode sofrer pequenos ajustes (ex.: a porta de fs pode virar dois parâmetros injetáveis por Tool em vez de um `fs-port.ts` único; `permission.ts` pode ser dividido se ficar mais legível).

---

# Componentes Impactados

- Permission Service (novo) — `packages/permissions` (avaliador puro de raiz permitida)
- Tools — `packages/tools` (novas Tools `read_file`/`list_dir` com IO injetado; `requirements`)
- Runtime — `packages/runtime` (consulta permissões por passo; recebe `permissions`)
- Contracts — `@atlas/contracts` (contratos de permissão + `Tool.requirements?`)
- Core — composição do Permission Service, registro das Tools, injeção no Runtime, config `permissions.readRoots`
- CLI (Output/Config) — flag/env de raiz permitida; `status` exibe raízes

---

# Interfaces Necessárias

Em `@atlas/contracts` (`permission.ts`):

```ts
export type ResourceType = 'file' | 'directory';

export interface ResourceRef {
  readonly type: ResourceType;
  readonly path: string;
}

export type AccessMode = 'read' | 'write';   // 'write' reservado (bloqueado nesta fatia)

export interface ActionRequest {
  readonly resource: ResourceRef;
  readonly access: AccessMode;
}

// Vocabulário dos 4 (Module Catalog). Nesta fatia o serviço só produz allowed/blocked;
// 'free' = ausência de requirement (o Runtime nem consulta); 'confirm' reservado.
export type PermissionVerdict = 'free' | 'allowed' | 'confirm' | 'blocked';

export interface PermissionDecision {
  readonly verdict: PermissionVerdict;
  readonly reason?: string;
}

export interface PermissionService {
  evaluate(action: ActionRequest): PermissionDecision;   // puro, síncrono, sem IO
}
```

Em `@atlas/contracts` (`execution.ts`), `Tool` ganha um membro opcional:

```ts
export interface Tool {
  readonly name: string;
  readonly description: string;
  requirements?(args: Record<string, unknown>): ActionRequest | null;  // null = não toca nada (livre)
  run(args: Record<string, unknown>): Promise<ToolResult>;
}
```

Interno a `@atlas/tools` (porta de fs, não sobe a contracts — sem 2º consumidor):

```ts
export interface FsReadPort {
  readFile(path: string): Promise<string>;
  readdir(path: string): Promise<readonly string[]>;
}
```

`RuntimeDeps` ganha `permissions: PermissionService`.

---

# Fluxo Esperado

```text
atlas ask "resuma o arquivo ./README.md"          (readRoots = [cwd])
  ↓  atlas.cognitive.ask(objetivo)
  ↓  1ª generate() → planner.parse → Plan { steps: [ read_file { path: './README.md' } ] }
  ↓  runtime.execute(plan)
       ↓ passo read_file: tool.requirements(args) → { resource:{type:'file',path:'./README.md'}, access:'read' }
       ↓ permissions.evaluate(req) → resolve path → contido em cwd? → { verdict:'allowed' }
       ↓ tool.run(args) → lê o disco (porta fs) → ToolResult { ok:true, output }
       ↓ ExecutedStep { tool, args, result }
  ↓  2ª generate(): system composto + objetivo + resultados → AskResult { text, steps }

atlas ask "leia /etc/passwd"                        (fora de cwd)
  ↓  ... read_file { path: '/etc/passwd' }
  ↓  permissions.evaluate → { verdict:'blocked', reason }  → tool.run NÃO é chamada
  ↓  ExecutedStep { result: { ok:false, error: <motivo> } }  → composição explica o bloqueio
```

Autoridade (Module Catalog): Permission Service **avalia** (pode?); Runtime **aplica** a decisão e **coordena** a execução; Tools **declaram o que tocam** e **executam**, sem decidir permissão; Cognitive Core **orquestra e responde**, sem conhecer o conceito de permissão.

---

# Estratégia de Implementação

1. Contratos: `permission.ts` em `@atlas/contracts` (`ActionRequest`/`PermissionDecision`/`PermissionService` etc.) + `requirements?` em `Tool`; re-exports.
2. `@atlas/permissions`: `createPermissionService({ readRoots })` com contenção lexical; testes (allowed/blocked, escape por `..`, access reservado, base determinística).
3. `@atlas/tools`: porta de fs injetável + `createReadFileTool`/`createListDirTool` (`requirements` + `run`); testes com fs fake (sucesso, erro de IO, args inválidos).
4. `@atlas/runtime`: `execute` consulta `permissions.evaluate` por passo com requisito; bloqueio → `ExecutedStep` negado sem chamar a Tool; testes (sem requisito não consulta; allowed executa; blocked não executa e continua).
5. Core: compor Permission Service (`readRoots` da config), registrar `read_file`+`list_dir`, injetar `permissions` no Runtime; `config.permissions.readRoots` + precedência; testes de integração (leitura dentro/fora da raiz ponta a ponta com fakes).
6. CLI: flag `--allow-read`, env `ATLAS_ALLOW_READ`, `status` exibe raízes; testes.
7. ADR-0013; documentação; lições; suíte completa.

---

# Estratégia de Testes

- **Permission Service** (puro): path dentro da raiz → `allowed`; fora → `blocked`; `<root>/../fora` resolvido → `blocked`; múltiplas raízes (dentro de qualquer uma → `allowed`); `access` reservado → `blocked`; base de resolução determinística (raízes absolutas ou base injetada), sem depender do `cwd` real; confirmar ausência de import de `fs`.
- **Tools de leitura** (fs fake): `read_file` retorna o conteúdo do fake em sucesso e erro estruturado quando o fake lança / arquivo ausente / `path` inválido; idem `list_dir` para entradas. Confirmar que `requirements` devolve a `ActionRequest` esperada e que `clock`/`calc` seguem sem `requirements`.
- **Runtime** (registry + permissions fakes): Tool sem requisito não chama `evaluate`; requisito `allowed` executa a Tool; requisito `blocked` produz `ExecutedStep` negado, **não** chama `tool.run` (porta fs não é tocada) e a execução continua nos passos seguintes; `execute` nunca lança.
- **Core** (fakes de fs e gateway): objetivo que lê um arquivo dentro da raiz produz `steps` com sucesso; objetivo que lê fora da raiz produz `steps` com o passo bloqueado; `readRoots` default = `cwd`.
- **CLI**: precedência `--allow-read > ATLAS_ALLOW_READ > [cwd]`; `status` imprime as raízes resolvidas; `ask` imprime o passo bloqueado com motivo; provider `fake` mantém a suíte verde.

---

# Definition of Done

- todos os critérios atendidos;
- testes passando (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`);
- documentação atualizada (CLAUDE.md raiz — invariantes/estado; `packages/permissions/CLAUDE.md`; `packages/tools/CLAUDE.md` — novas Tools com IO; `packages/runtime/CLAUDE.md` — portão de permissão; `packages/core/CLAUDE.md` se necessário; NEXT_CONTEXT; CURRENT_SPRINT);
- ADR-0013 aceito;
- arquitetura preservada (Permission Service não executa e não faz IO; Tools declaram o que tocam e não decidem permissão; Runtime aplica a decisão e nunca lança por falha/bloqueio; Cognitive não conhece permissão; `respond` puro; Gateway intacto);
- revisão concluída;
- lições registradas em `implementation/LESSONS_LEARNED.md`.

---

# Restrições

- Não criar módulos além do Permission Service e das Tools catalogadas.
- **Regras de Dependência** (Module Catalog / Project Structure): `@atlas/permissions` e `@atlas/tools` dependem **só** de `@atlas/contracts`; **não** dependem do Cognitive Core nem entre si (Regra 5). Só `@atlas/core` importa implementações (Regra 11).
- O **Permission Service** é **puro e síncrono**, **sem IO** (não importa `fs`): julga dados, não toca o mundo. Quem lê o disco são as Tools, por porta injetável.
- O **Permission Service** **não** presume consentimento para ações destrutivas — por isso esta fatia é **só leitura**; ações não-`read` são `blocked` (reservadas).
- O **Runtime** **nunca lança** por bloqueio ou falha de Tool — bloqueio vira `ExecutedStep` negado estruturado; Tool bloqueada **não** é executada.
- Contenção é **lexical** (sem `realpath`/symlink); documentar a limitação.
- O **Model Gateway** permanece intacto; Planner e Cognitive **não** ganham consciência de permissão nesta fatia.
- `respond`/`chat` não recebem planejamento; `respond` segue função pura.

---

# Observações

- **Permission Service como portão puro (ADR-0013):** separar "julgar" (Permission Service, puro, sobre `ActionRequest`) de "descrever o que se toca" (Tool, via `requirements`) e de "aplicar + executar" (Runtime) mantém as três autoridades limpas e cada peça testável isoladamente — a Tool não decide permissão, o serviço não faz IO, o Runtime não redefine a política.
- **Por que leitura primeiro:** o catálogo proíbe presumir consentimento para ações destrutivas. Começar por `read_file`/`list_dir` (read-only) exercita o portão (livre × bloqueada por raiz) **sem** precisar do fluxo interativo de confirmação, mantendo `atlas ask` como tiro único. Escrita e o veredicto `confirm` de fato entram numa fatia futura.
- **`free` sem cerimônia:** Tools puras (`clock`/`calc`) não declaram `requirements`; o Runtime nem chama `evaluate` para elas. "Livre" é uma propriedade da Tool (não toca nada), enquanto `allowed`/`blocked`/`confirm` são veredictos que o serviço produz para ações reais — cobrindo os 4 do catálogo com o mínimo de maquinaria.
- **Contenção lexical, symlink adiado:** manter o serviço **sem IO** exige contenção lexical (path resolvido + prefixo com fronteira de separador). Isso não segue symlinks — um symlink dentro da raiz apontando para fora poderia escapar. É uma limitação **conhecida e documentada**; endurecer com `realpath` (que introduz IO na avaliação, ou uma porta de resolução injetável) é fatia futura.
- **fs injetável reaproveita o padrão do Memory:** as Tools de leitura são o primeiro IO das Tools; a porta de fs injetável (default `node:fs/promises`) espelha o `MemoryStorage`/`fetch` injetados — testes sem disco real, IO só na borda.
- **Bloqueio flui como falha estruturada:** um passo bloqueado é apenas mais um `ExecutedStep` negado (como Tool inexistente na SPEC-0010) — chega à 2ª `generate()` de composição, e o modelo explica ("não pude ler X: fora do diretório permitido"). Nenhum caminho novo de erro no Runtime.
- **Raiz padrão = cwd:** casa com o comportamento de CLIs (rodar `atlas` num repo permite ler aquele repo), segue a precedência `flags > env > defaults` (ADR-0006) e é a semente natural do futuro "contexto de ambiente".

---

# Checklist para IA

Antes de implementar: ler Module Catalog (Permission Service — 4 veredictos, "não presumir consentimento"; Runtime consome permissões; Regras 5–8), CognitiveLifecycle (Execução/risco), Project Structure (`permissions`/`tools`; contratos), ADR-0006/0011/0012, SPEC-0010.

Durante: Permission Service puro e sem IO; Tools declaram `requirements` e não decidem permissão; fs só por porta injetável; Runtime consulta `evaluate` só quando há requisito, nunca lança, não executa Tool bloqueada; contenção lexical (symlink fora); Gateway/Planner/Cognitive intactos quanto a permissão; `respond` puro; só leitura, nada destrutivo; manter a fatia mínima.

Após: rodar a suíte; revisar documentação; validar critérios; registrar lições; concluir.

---

# Resultado Esperado

O Atlas passa a **agir com segurança**: pela primeira vez executa Tools com efeito colateral — ler um arquivo (`read_file`) e listar um diretório (`list_dir`) — mas **só depois** de o **Permission Service** avaliar a ação contra uma política de raiz permitida. `atlas ask "resuma ./README.md"` passa a ler o arquivo de verdade e responder sobre ele; `atlas ask "leia /etc/passwd"` (fora do diretório de trabalho) mostra um passo **bloqueado** com o motivo, e a resposta explica que a leitura não foi autorizada. O desenho — Permission Service puro julgando `ActionRequest`s, Tools declarando o que tocam como dado e lendo por porta injetável, Runtime aplicando o veredicto sem derrubar a execução, Cognitive orquestrando sem conhecer permissão — deixa a plataforma pronta para as próximas fatias (Tools de escrita e o fluxo de confirmação, mais recursos, endurecimento de symlink, políticas mais ricas), e a decisão fica rastreável no ADR-0013. O caminho de resposta direta e as Tools puras (`clock`/`calc`) seguem idênticos aos de hoje — sem regressão de comportamento nem de custo.
