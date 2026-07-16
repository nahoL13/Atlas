# SPEC-0012 — Tool de escrita (`write_file`) atrás do portão de permissão

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0012

---

**Título**

Primeira Tool de escrita (`write_file`) sob política de raízes de escrita (`writeRoots`), opt-in explícito, sem fluxo interativo

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [x] Review
- [ ] Done

---

**Prioridade**

High

---

# Objetivo

Ao concluir esta SPEC, o Atlas passa a **escrever no mundo** pela primeira vez — de forma **segura e explícita**. Até aqui o Atlas só lê o sistema de arquivos (SPEC-0011); esta fatia adiciona a capacidade de **criar ou sobrescrever um arquivo de texto**, sujeita ao mesmo portão de permissão do Runtime, mas contra uma política de escrita **separada** da de leitura e com **default vazio** (nada é escrevível a menos que o usuário conceda uma raiz explicitamente).

Concretamente, quando esta SPEC estiver concluída:

- Existe uma nova Tool `write_file` em `packages/tools` — a **primeira Tool com efeito de escrita** da plataforma. Recebe `{ path, content }`, declara como **dado** o recurso que tocaria (`requirements(args) → ActionRequest` com `access: 'write'`) e escreve o disco por uma **porta injetável** separada (`FsWritePort`, default `node:fs/promises`), testável sem disco real.
- O **Permission Service** (`@atlas/permissions`) passa a **julgar ações de escrita**: `access: 'write'` é avaliado por **contenção lexical** contra uma política de **raízes de escrita** (`writeRoots`), reusando a mesma checagem de contenção da leitura. Dentro de uma raiz de escrita → `allowed`; fora (ou `writeRoots` vazio) → `blocked` com motivo. `read` segue julgado por `readRoots`, **independente** de `writeRoots`.
- Existe a config `permissions.writeRoots` (**default `[]`** — não escreve em lugar nenhum), com override `--allow-write`/`ATLAS_ALLOW_WRITE` (precedência `flags > env > defaults`), **separada** de `readRoots`.
- O **Runtime** **não muda**: o portão já trata "veredicto ≠ `allowed` → passo negado, Tool não roda, nunca lança". Uma escrita bloqueada percorre exatamente o mesmo caminho de uma leitura bloqueada.
- `@atlas/core` compõe o Permission Service com `writeRoots`, registra a `write_file` e aceita injeção de `fsWrite` fake nos testes. A CLI ganha `--allow-write`/`ATLAS_ALLOW_WRITE` e `atlas status` exibe `writeRoots`.
- O **ADR-0013** ganha uma **nota de atualização** registrando que `access: 'write'` passou de reservado a produzido, com política `writeRoots` separada e default vazio. **Não** há ADR novo — a decisão estrutural (portão puro; Tools declaram requisitos como dado; Runtime aplica) já é a do ADR-0013; esta fatia a concretiza.

---

# Motivação

A SPEC-0011 entregou o **Permission Service** e as **primeiras Tools com IO**, mas deliberadamente **só de leitura** — escolhendo read-only para exercitar o portão (livre × bloqueada por política) **sem** disparar o problema de "consentimento para ação destrutiva", que exigiria o fluxo interativo de confirmação. O vocabulário do contrato já reservou `access: 'write'` (hoje sempre `blocked`) e o veredicto `confirm` (hoje nunca produzido) exatamente para esta continuação.

Esta SPEC entrega a **próxima fatia mínima**: a capacidade de **escrever**, mantendo a segurança por uma fronteira **explícita** em vez do fluxo interativo `confirm` (que fica para a SPEC seguinte). A escolha de **default vazio + opt-in explícito** (`--allow-write`) materializa o princípio do **Module Catalog** de que o Permission Service *"não presume consentimento para ações destrutivas"*: enquanto o `confirm` interativo não existe como segunda barreira, o consentimento é um ato deliberado do usuário — conceder uma raiz de escrita —, não um default silencioso. Escrever é mais perigoso que ler, então a política de escrita é **separada** da de leitura (ter leitura não concede escrita).

O recorte é deliberadamente pequeno: **uma** Tool nova (`write_file`, criar/sobrescrever), reusando **toda** a máquina existente (Runtime em lote, portão do Runtime, traço de passos da CLI, padrão de portas injetáveis). Deleção, `mkdir`, `append`, múltiplas raízes e o fluxo `confirm` ficam explicitamente fora.

Documentos originadores: **Module Catalog** (Permission Service; "não presumir consentimento para destrutivas"; Runtime consome permissões) + **CognitiveLifecycle** (Execução com avaliação de risco) + fronteira explícita da **SPEC-0011** (escrita/`confirm`/symlink fora de escopo) + **ADR-0013** (`write`/`confirm` reservados).

---

# Referências

- Module Catalog (`docs/03-architecture/ModuleCatalog.md`) — Permission Service (responsabilidade, 4 veredictos, "não presumir consentimento para destrutivas"); Tools são adaptadores; Runtime consome Permission Service
- ADR-0013 (`docs/06-adr/ADR-0013-permission-service-execution-gate.md`) — Permission Service como portão puro na execução; Tools declaram `requirements` como dado; Runtime aplica; `write`/`confirm` reservados
- Cognitive Lifecycle (`docs/03-architecture/CognitiveLifecycle.md`) — Execução com avaliação de risco; transparência
- Project Structure (`docs/03-architecture/ProjectStructure.md`) — `packages/permissions`, `packages/tools`; contratos em `@atlas/contracts`
- Architecture Constitution (`docs/00-project/ArchitectureConstitution.md`) — Regra 5 (Tools são adaptadores), Regra 6 (Permission/Memory têm autoridade), separação de responsabilidades
- SPEC-0011 (`implementation/specs/SPEC-0011-permission-service-fs-read.md`) — Permission Service, `read_file`/`list_dir`, `FsReadPort`, `readRoots`, padrão a espelhar

---

# Escopo

- **`@atlas/tools`**: criar a Tool `write_file` (`createWriteFileTool({ fs?: FsWritePort })`), simétrica ao `read_file` — `requirements(args) → ActionRequest` com `access: 'write'`; `run({ path, content })` escreve por `FsWritePort`; erro de IO / args inválidos → `ToolResult` de erro, nunca lança.
- **`@atlas/tools`**: criar a porta `FsWritePort` (`writeFile(path, content): Promise<void>`) com `nodeFsWritePort()` default (sobre `node:fs/promises`, utf8) — **porta separada** da `FsReadPort` (menor privilégio por porta).
- **`@atlas/permissions`**: `evaluate` passa a rotear por `access` — `read` → `readRoots` (inalterado), `write` → `writeRoots` (mesma contenção lexical). Fatorar a checagem de contenção numa função interna reusada pelos dois modos. `writeRoots` entra em `PermissionServiceDeps`.
- **`@atlas/contracts`**: atualizar o comentário de `AccessMode` (`'write'` deixa de ser "reservado"); adicionar `writeRoots` a `AtlasConfig.permissions` e `AtlasConfigOverride.permissions`. `PermissionVerdict` inalterado (`'confirm'` segue reservado).
- **`@atlas/core`**: `defaults` ganha `writeRoots: []`; `loadConfig` faz merge campo-a-campo de `writeRoots` e valida (array de strings não vazias, **pode ser vazio**); `index.ts` passa `writeRoots` ao Permission Service e registra `write_file`; `CreateAtlasDeps` ganha `fsWrite?: FsWritePort` (default `nodeFsWritePort()`).
- **`@atlas/cli`**: `--allow-write <path>`/`ATLAS_ALLOW_WRITE` (precedência `flag > env`), coexistindo com `--allow-read` no mesmo `override.permissions`; `run.ts` registra a flag e a linha de ajuda; `status` exibe `writeRoots` (placeholder quando vazio).
- **Testes**: unidades por porta injetável (permissions, tools, runtime, core, cli), sem disco/rede real.
- **Documentação**: nota de atualização no ADR-0013; atualizar `CLAUDE.md` raiz e dos packages tocados (`permissions`, `tools`, `core`, `cli`), `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`; registrar lições em `LESSONS_LEARNED.md`.

---

# Fora do Escopo

- **Fluxo interativo `confirm`** — o veredicto `confirm` segue reservado, não produzido. (SPEC-0013.)
- **`delete_file` / `rmdir` / `mkdir` / `append_file`** e qualquer ação destrutiva além de criar/sobrescrever um arquivo.
- **Criação de diretório-pai** (`mkdir -p`) dentro do `write_file` — se o diretório-pai não existe, a escrita falha e vira `ToolResult` de erro.
- **Múltiplas raízes** de escrita (ou de leitura) numa única invocação — segue single-value, como o `--allow-read` de hoje.
- **Endurecimento de symlink / `realpath`** na contenção lexical — limitação conhecida do ADR-0013, vale igual para escrita.
- **Consciência de permissão no Planner/Cognitive** — o modelo não sabe o que é escrevível; apenas tenta e o portão nega.
- **Novo ADR** — apenas nota de atualização no ADR-0013.
- **Alterar o Runtime** — não há mudança de código no Runtime; o portão existente já cobre escrita.
- **`atlas ask` interativo / novo código de renderização** — o traço de passos existente já cobre escrita (sucesso e bloqueio).

---

# Pré-requisitos

- SPEC-0010 (Planner + Runtime + Tools) — `Done`
- SPEC-0011 (Permission Service + Tools de leitura de FS) — `Done`

---

# Critérios de Aceitação

- Tool `write_file` criada em `packages/tools`, com `requirements` (`access: 'write'`) e `run({ path, content })` que escreve por `FsWritePort` e nunca lança.
- Porta `FsWritePort` + `nodeFsWritePort()` criadas, separadas da `FsReadPort`.
- `@atlas/permissions` julga `access: 'write'` contra `writeRoots` (dentro → `allowed`; fora ou vazio → `blocked` com motivo); `read` segue por `readRoots`, sem interferência de `writeRoots`.
- Contenção lexical de escrita respeita fronteira de separador (`/proj` não libera `/proj-evil`) — mesma garantia do read.
- Config `permissions.writeRoots` existe (default `[]`); override por `--allow-write`/`ATLAS_ALLOW_WRITE` respeita `flag > env > defaults`; `loadConfig` **aceita** `[]` e **rejeita** caminhos em branco/não-string.
- `@atlas/core` registra `write_file`, compõe o Permission Service com `writeRoots` e aceita `fsWrite` injetável.
- CLI: `--allow-write`/`ATLAS_ALLOW_WRITE` chegam ao `override.permissions.writeRoots`; read+write coexistem sem um apagar o outro; `status` imprime `writeRoots` (placeholder quando vazio); `run.ts` documenta a flag na ajuda.
- Runtime **inalterado** (nenhuma mudança de código); um passo `write_file` bloqueado vira `ExecutedStep` negado sem tocar a porta de escrita, execução continua.
- ADR-0013 com nota de atualização; `CLAUDE.md` (raiz + packages tocados), `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` atualizados; lições em `LESSONS_LEARNED.md`.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.

---

# Arquivos Esperados

```text
packages/tools/src/
  fs-port.ts            (editado: + FsWritePort, nodeFsWritePort)
  write-file.ts         (novo: createWriteFileTool)
  write-file.test.ts    (novo)
  index.ts              (editado: export createWriteFileTool, FsWritePort)

packages/permissions/src/
  permission-service.ts (editado: rota read/write + contenção fatorada + writeRoots)
  permission-service.test.ts (editado: casos de write)

packages/contracts/src/
  permission.ts         (editado: comentário de AccessMode)
  config.ts             (editado: writeRoots em AtlasConfig/Override)

packages/core/src/
  config/defaults.ts    (editado: writeRoots: [])
  config/load-config.ts (editado: merge + validação de writeRoots)
  index.ts              (editado: Permission Service com writeRoots; registra write_file; fsWrite?)
  *.test.ts             (editado: casos de writeRoots/write_file)

apps/cli/src/
  run.ts                (editado: flag --allow-write + ajuda)
  gateway/input-gateway.ts (editado: parse --allow-write/ATLAS_ALLOW_WRITE)
  commands/status.ts    (editado: exibe writeRoots)
  *.test.ts             (editado)

docs/06-adr/ADR-0013-permission-service-execution-gate.md (editado: nota de atualização)
CLAUDE.md (raiz) + CLAUDE.md de permissions/tools/core/cli (editados)
docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md (editados)
implementation/LESSONS_LEARNED.md (editado)
```

---

# Componentes Impactados

- Tools (`@atlas/tools`) — nova Tool `write_file` + `FsWritePort`
- Permission Service (`@atlas/permissions`) — avaliação de `write`
- Contracts (`@atlas/contracts`) — `AccessMode` (comentário), `config` (`writeRoots`)
- Core (`@atlas/core`) — composição, config, injeção de `fsWrite`
- CLI (`@atlas/cli`) — flag/env de escrita, `status`
- Runtime (`@atlas/runtime`) — **consumidor inalterado** (o portão já cobre escrita)

---

# Interfaces Necessárias

- `FsWritePort` (interno a `@atlas/tools`): `writeFile(path: string, content: string): Promise<void>`. Sem 2º consumidor → **não** sobe a `@atlas/contracts` (mesma regra do `FsReadPort`).
- `PermissionServiceDeps` (em `@atlas/permissions`): ganha `readonly writeRoots: readonly string[]`.
- `AtlasConfig.permissions` / `AtlasConfigOverride.permissions` (em `@atlas/contracts`): ganham `writeRoots`.
- `CreateAtlasDeps` (em `@atlas/core`): ganha `fsWrite?: FsWritePort`.
- Nenhuma interface pública nova em `@atlas/contracts` além dos campos de config (`AccessMode`/`ActionRequest`/`PermissionVerdict` já existem).

---

# Fluxo Esperado

```text
Planner produz passo { tool: "write_file", args: { path, content } }
        ↓
Runtime.execute (inalterado):
  tool.requirements(args) → { resource:{type:"file",path}, access:"write" }
        ↓
  permissions.evaluate(req):
    access "write" → contenção lexical contra writeRoots
      dentro  → allowed  → write_file.run → FsWritePort.writeFile → ToolResult ok
      fora/[] → blocked  → ExecutedStep negado (Tool não roda), execução continua
        ↓
CLI (atlas ask): traço de passos existente
  🔧 write_file → escrito: <path>        (sucesso)
  🔧 write_file → erro: fora do diretório permitido para escrita: <path>  (bloqueado)
```

---

# Estratégia de Implementação

1. **Contratos**: comentário de `AccessMode`; `writeRoots` em `AtlasConfig`/`AtlasConfigOverride`.
2. **Permissions (TDD)**: testes de `write` (dentro/fora/vazio, fronteira, independência de `read`) → fatorar contenção + rota por `access` + `writeRoots` em deps.
3. **Tools (TDD)**: `FsWritePort` + `nodeFsWritePort`; testes de `write_file` (escrita, `requirements`, args inválidos, erro de porta) → `createWriteFileTool`.
4. **Core (TDD)**: `writeRoots: []` nos defaults; merge + validação (aceita vazio, rejeita branco) no `loadConfig`; wiring do Permission Service e registro da `write_file`; `fsWrite?` injetável.
5. **CLI (TDD)**: parse `--allow-write`/`ATLAS_ALLOW_WRITE` (coexistindo com read); flag no `run.ts` + ajuda; `status` exibe `writeRoots`.
6. **Verificação**: `lint`/`format:check`/`typecheck`/`test`.
7. **Documentação**: nota no ADR-0013; `CLAUDE.md` (raiz + packages); `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

- **`@atlas/permissions`**: `write` dentro de `writeRoots` → `allowed`; fora → `blocked`; `writeRoots: []` → `blocked`; fronteira de separador (`/proj` vs `/proj-evil`); `read` julgado por `readRoots` e **não** afetado por `writeRoots` (path na raiz de leitura mas fora da de escrita: `read` allowed, `write` blocked).
- **`@atlas/tools` `write_file`**: escreve via `FsWritePort` fake (verifica `path`/`content`); `requirements` retorna `access: 'write'` com o `path`; sobrescrita chama a porta; `path` vazio / `content` não-string → erro sem chamar a porta; porta que lança → `ToolResult` de erro, não lança.
- **`@atlas/runtime`** (sem novo código): passo `write_file` `blocked` → `ExecutedStep` negado, porta de escrita fake **nunca chamada**, execução continua; `write` `allowed` → Tool roda.
- **`@atlas/core`**: `writeRoots` default `[]`; precedência de override; `loadConfig` aceita `[]` e rejeita branco/não-string; `write_file` registrada; `fsWrite` fake para um `ask` que planeje escrita.
- **`@atlas/cli`**: `--allow-write`/`ATLAS_ALLOW_WRITE` → `override.permissions.writeRoots` (`flag > env`); read+write coexistem; `status` imprime `writeRoots` (+ placeholder vazio).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada (ADR-0013 com nota; `CLAUDE.md` raiz + packages; `NEXT_CONTEXT.md`; `CURRENT_SPRINT.md`);
- arquitetura preservada (Regras 4/5/6; Runtime inalterado; Tools sem decisão de permissão; contratos só com o necessário);
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições aprendidas registradas em `implementation/LESSONS_LEARNED.md`.

---

# Restrições

- **Não** criar novos módulos/packages — só editar os existentes.
- **Não** alterar a arquitetura nem o Runtime (o portão já cobre escrita).
- **Não** produzir o veredicto `confirm` nem introduzir fluxo interativo.
- **Não** presumir consentimento: `writeRoots` default `[]`; escrita exige opt-in explícito.
- Tools continuam **sem** decidir permissão nem quando são usadas (Regra 5): `requirements` só descreve o recurso.
- `FsWritePort` fica interno a `@atlas/tools` (sem 2º consumidor → não sobe a `@atlas/contracts`).
- Política de escrita **separada** da de leitura; grants independentes.
- `write_file` faz **uma** operação de fs (`writeFile`), sem `mkdir -p`.

---

# Observações

- **Sobrescrita silenciosa**: sob o modelo opt-in, o consentimento é a raiz de escrita concedida. O endurecimento por confirmação (`confirm`) fica para a SPEC-0013.
- **Runtime inalterado** é intencional e é o ponto elegante da fatia: o portão da SPEC-0011 já é agnóstico ao `access` — só aplica o veredicto.
- A limitação de symlink/`realpath` do ADR-0013 vale igual para escrita; documentada, fora de escopo.
- `writeRoots` aceitar lista **vazia** (diferente de `readRoots`, que exige não vazia) é deliberado: vazio = "não escreve", o default seguro.

---

# Checklist para IA

Antes de implementar:

- ler ADR-0013, SPEC-0011 e o Module Catalog (Permission Service / Tools);
- compreender o objetivo (escrita opt-in, sem `confirm`);
- confirmar que o Runtime não precisa mudar;
- validar dependências (SPEC-0010/0011 `Done`).

Durante implementação:

- TDD por unidade, porta injetável, sem disco/rede real;
- manter Tools sem decisão de permissão; Permission Service puro/síncrono;
- não vazar escopo (nada de deleção/`mkdir`/`confirm`/múltiplas raízes);
- espelhar o padrão de `readRoots`/`read_file` com precisão.

Após implementação:

- executar `lint`/`format:check`/`typecheck`/`test`;
- atualizar documentação (ADR-0013, CLAUDE.md, contexto);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, o Atlas **escreve arquivos** — mas só onde o usuário concedeu explicitamente. Um `atlas ask` (ou plano) que precise gravar um arquivo de texto o faz quando o caminho está dentro de uma raiz passada por `--allow-write`/`ATLAS_ALLOW_WRITE`; fora dela (ou sem nenhuma raiz concedida), a escrita é **negada** de forma estruturada e visível no traço de passos, sem derrubar a execução. A leitura segue governada por sua própria política, independente. O portão de permissão do Runtime, criado na SPEC-0011, prova ser genérico: cobriu a escrita sem uma linha de mudança. A plataforma fica pronta para, na fatia seguinte, introduzir o fluxo interativo `confirm` e ações destrutivas sobre uma base de escrita já sólida.
