# SPEC-0017 — Fecho atômico de TOCTOU: enforcement de contenção no instante do uso

> **Project Atlas — Implementation Specification**

Version: 1.0

---

# Informações Gerais

**ID**

SPEC-0017

---

**Título**

Fecho atômico da janela TOCTOU em `read_file`/`write_file`/`append_file`: as portas de IO abrem o fd com `O_NOFOLLOW`, ancoram na identidade do fd (`fstat` × `stat` do `realpath`) e aplicam sobre o handle real um veredicto de contenção do Permission Service (método novo, puro/síncrono), mantendo `evaluate` intacto como pré-check e o Runtime inalterado

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade** _(High — confirmada pelo humano em 2026-07-18 na aprovação `Draft → Ready`)_

- [ ] Critical
- [x] High
- [ ] Medium
- [ ] Low

---

**Item do Roadmap**

`Fase 1 — 1.1 Hardening de Execução/Permissão — TOCTOU` (`docs/04-engineering/Roadmap.md`). O item estava marcado ali como `gate · SPEC direta`; ao desenhar a solução ficou claro que o fecho **atômico** revisita a fronteira estrutural do ADR-0013 (decisão pura antes da execução × enforcement no instante do uso), então foi **reclassificado para `ADR primeiro`** e a decisão foi registrada no [ADR-0014](../../06-adr/ADR-0014-toctou-atomic-enforcement.md). Esta SPEC consome esse ADR (a fonte de verdade do escopo). O texto do item no Roadmap precisa ser ajustado para `ADR primeiro` no fechamento (doc-sync).

---

# Objetivo

Ao concluir esta SPEC, a janela **TOCTOU** (*Time-of-Check to Time-of-Use*) do **componente final** de caminho está **fechada de forma atômica** para as operações de FS que abrem-e-operam sobre um file descriptor: `read_file`, `write_file` e `append_file`. Hoje o Permission Service resolve o caminho e julga a contenção em `evaluate` (check), e a Tool abre o arquivo depois (use), em **momentos distintos** e sobre uma **string** — entre um e outro, um symlink pode ser trocado para redirecionar o recurso para fora da raiz permitida (limitação remanescente registrada na atualização da SPEC-0015 no ADR-0013 e no ADR-0014).

Concretamente, quando esta SPEC estiver concluída:

- As operações `FsReadPort.readFile`, `FsWritePort.writeFile` e `FsWritePort.appendFile` passam a executar, **dentro de uma única invocação**, na sequência descrita no ADR-0014:
  1. `open(path, flags | O_NOFOLLOW)` (via `fs.constants.O_NOFOLLOW`) — o **componente final não pode ser um symlink** no instante do uso; se for, o `open` falha (`ELOOP`/`ENOTDIR`) → recusa.
  2. **Ancoragem na identidade do fd:** resolve `realpath(path)` e compara `fstat(fd)` (`dev`+`ino`) com `stat(realpath)`; divergência = o alvo foi trocado entre abrir e verificar (**TOCTOU detectado**) → fecha o fd, recusa.
  3. **Julgamento de contenção** do `realpath` de uso por um **verificador estreito injetado** (`verify(realpath, access) → boolean`), fiado por `@atlas/core` a partir de um **método novo, puro/síncrono, do Permission Service**; fora da raiz → fecha o fd, recusa.
  4. Só então **opera sobre o fd** (lê/escreve pelo handle já verificado) e fecha.
- O **Permission Service** (`@atlas/permissions`) continua a **única autoridade de contenção** e ganha um **método novo, puro/síncrono**, que julga um caminho **já canônico** (o `realpath` que a porta obteve e ancorou no fd) — **não** re-resolve caminho (a porta já ancorou), **reusa a função interna `within(target, roots)`** já existente, sobre as raízes **já resolvidas na criação** (`readRoots`/`writeRoots` resolvidas por `realpath` desde a SPEC-0015). `evaluate(action)` fica **intacto e síncrono** como pré-check (`blocked`/`confirm`), defesa em profundidade.
- O **verificador injetado é uma função estreita** (`verify(realpath, access) → boolean`), **não** o serviço inteiro. `@atlas/tools` continua acoplada **só** a `@atlas/contracts` (Regra 5) — não conhece `@atlas/permissions`, nem raízes, nem o serviço concreto; só um predicado. `@atlas/core` fia o método novo do Permission Service nesse predicado ao compor as portas default.
- Falha (symlink no último hop, identidade divergente / TOCTOU detectado, ou fora da raiz no instante do uso) vira um `ToolResult` de erro com **mensagem distinta**, **nunca lança** — registrado como `ExecutedStep` negado pelo Runtime, o mesmo padrão de falha estruturada do ADR-0012/0013.
- O **Runtime não muda** — segue chamando `permissions.evaluate(requirement)` no pré-check (sem `await`) e aguardando `tool.run`. `evaluate` **não** vira `Promise`.

---

# Motivação

O **[Module Catalog](../../03-architecture/ModuleCatalog.md)** define o Permission Service com a responsabilidade de *"avaliar se uma ação pode ser executada de acordo com permissões, políticas e nível de risco"*, e o **PRD** eleva **segurança** a requisito não funcional (*"O sistema deverá priorizar segurança."*, linha 173), a critério de qualidade (linha 206) e a restrição explícita (*"O Atlas não deverá executar ações destrutivas sem autorização adequada."*, linha 193). A SPEC-0015 fechou o escape por symlink **estático** (um link dentro de uma raiz apontando para fora dela, resolvido por `realpath`), mas registrou explicitamente que **TOCTOU** seguia aberto: a resolução em `evaluate` e o uso pela Tool acontecem em momentos distintos, sobre uma string de caminho, não sobre um handle — um symlink trocado **entre** o check e o `open()` da Tool redireciona o recurso operado para fora da raiz aprovada. A gravidade é maior na escrita (clobber de um arquivo fora do sandbox) mas vale também para a leitura (vazamento).

O **[ADR-0014](../../06-adr/ADR-0014-toctou-atomic-enforcement.md)** decidiu, com o humano no brainstorming, **como** fechar essa janela sem duplicar a autoridade de contenção nem tornar `evaluate` assíncrono: **o check e o uso passam a compartilhar o mesmo file handle**. Como Node não expõe `openat` por componente, o fecho mais forte e portável é abrir com `O_NOFOLLOW` + ancorar na identidade do fd, e aplicar o veredicto de contenção **sobre o recurso realmente aberto**, no ponto onde o handle existe (a porta), preservando a fonte única de decisão no Permission Service (via um predicado injetado estreito). Esta SPEC implementa exatamente esse desenho — nada além dele.

Documentos originadores: **ADR-0014** (decisão, escopo, residuais — fonte de verdade) + **ADR-0013** (as três autoridades: Tool descreve / Permission Service julga / Runtime aplica; TOCTOU como limitação remanescente registrada na atualização da SPEC-0015) + **PRD** (segurança como NFR/critério/restrição) + **Module Catalog** (Permission Service; "não presumir consentimento para destrutivas").

---

# Referências

- [ADR-0014](../../06-adr/ADR-0014-toctou-atomic-enforcement.md) (`docs/06-adr/ADR-0014-toctou-atomic-enforcement.md`) — **fonte de verdade do escopo**: fecho atômico de TOCTOU (`O_NOFOLLOW` + ancoragem de identidade do fd + veredicto sobre o handle), verificador estreito injetado, `evaluate`/Runtime intactos, escopo `read`/`write`/`append` e residuais documentados
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) (`docs/06-adr/ADR-0013-permission-service-execution-gate.md`) — as três autoridades (Tool descreve / Permission Service julga / Runtime aplica); atualização da SPEC-0015 que registra TOCTOU como limitação remanescente
- [SPEC-0015](SPEC-0015-permission-symlink-hardening.md) (`docs/implementation/specs/SPEC-0015-permission-symlink-hardening.md`) — molde de estrutura: porta injetável nova, fakes nos testes, fail-closed, `evaluate` síncrono; `realpath` das raízes/alvo (`PathResolverPort`, `within()`, algoritmo do ancestral existente)
- [Module Catalog](../../03-architecture/ModuleCatalog.md) (`docs/03-architecture/ModuleCatalog.md`) — Permission Service (responsabilidade, 4 veredictos, "não presumir consentimento para destrutivas"); Tools como adaptadores sem decisão
- [PRD](../../02-product/ProductRequirementsDocument.md) (`docs/02-product/ProductRequirementsDocument.md`) — NFR "priorizar segurança" (l. 173); critério de qualidade "segurança" (l. 206); restrição "não executar ações destrutivas sem autorização adequada" (l. 193)
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) (`docs/00-project/ArchitectureConstitution.md`) — Regra 5 (Tools são adaptadores sem lógica de decisão; autoridade de permissão separada da execução)
- SPEC-0011/0012/0013 — Permission Service, `read_file`/`write_file`/`append_file`, `FsReadPort`/`FsWritePort`, contenção lexical (`within()`)

---

# Escopo

Mudam código de produção em `packages/tools`, `packages/permissions`, `packages/core` e (uma adição) `@atlas/contracts`. Estritamente o desenho aprovado no ADR-0014 — nem mais, nem menos.

- **`@atlas/permissions`** — método novo no Permission Service:
  - Adicionar ao `PermissionService` um **método puro/síncrono** que julga um **caminho já canônico** (um `realpath` que a porta obteve e ancorou no fd) e um `access`, retornando um `boolean` de contenção. **Reusa a função interna `within(target, roots)`** já existente, sobre as raízes **já resolvidas na criação** (rota por `access`: `read` contra `readRoots` resolvidas, `write`/`append` contra `writeRoots` resolvidas). **Não** re-resolve o caminho (a porta já ancorou); **não** faz IO; permanece síncrono.
  - `evaluate(action)` fica **intacto** (assinatura, retorno síncrono, comportamento `blocked`/`confirm`/`allowed` inalterados).
- **`@atlas/contracts`** — adição do método novo:
  - Acrescentar ao contrato `PermissionService` (em `packages/contracts`) a assinatura do método novo de verificação de caminho canônico. É a **única** mudança de contrato desta SPEC (o ADR-0014 a prevê explicitamente). `evaluate`, `PermissionDecision`, `ActionRequest`, `AccessMode`, `PermissionVerdict` **não** mudam.
- **`@atlas/tools`** — verificador estreito + fecho atômico nas portas:
  - Definir um **tipo de verificador estreito** — uma função `verify(realpath: string, access: AccessMode) => boolean` (referenciando `AccessMode` de `@atlas/contracts`, que `@atlas/tools` já importa). **Interno** ao package (sem 2º consumidor real → não sobe a `@atlas/contracts`, mesmo critério de `FsReadPort`/`FsWritePort`).
  - `FsReadPort.readFile`, `FsWritePort.writeFile` e `FsWritePort.appendFile` passam a executar internamente a sequência `open(O_NOFOLLOW)` → `realpath` + `fstat(fd)` × `stat(realpath)` (identidade `dev`+`ino`) → `verify(realpath, access)` → operar sobre o fd → fechar. O verificador é **injetado** nas portas default (`nodeFsReadPort`/`nodeFsWritePort` passam a recebê-lo); as portas **não** conhecem raízes nem o Permission Service — só o predicado.
  - Falha em qualquer etapa (symlink no último hop, identidade divergente, contenção falha, erro de IO) **nunca lança** para fora da porta; a Tool a converte em `ToolResult` de erro com **mensagem distinta** por causa (TOCTOU detectado × fora da raiz no uso × IO), preservando o padrão atual de `read_file`/`write_file`/`append_file` (o `try/catch` que devolve `{ ok: false, error }`). As demais operações da `FsWritePort` (`deleteFile`, `mkdir`) e da `FsReadPort` (`readdir`) **não** mudam (fora de escopo — ver "Fora do Escopo").
- **`@atlas/core`** — fiação:
  - Ao compor as portas default (`nodeFsReadPort()`/`nodeFsWritePort()` em `createAtlas`, hoje nas linhas ~50–51 de `packages/core/src/index.ts`), fiar o **método novo** do `permissions` como o `verify` injetado nessas portas. O Permission Service já é criado antes das portas serem registradas nas Tools (linhas 53–65), então a ordem de composição comporta essa fiação; o implementador confirma o arranjo exato (ex.: criar `permissions` antes de `fsRead`/`fsWrite`).
- **`@atlas/runtime`** — **nenhuma** mudança de código (segue chamando `permissions.evaluate` no pré-check, sem `await`; aguarda `tool.run`).
- **Testes** (`@atlas/tools` e `@atlas/permissions`), no padrão da SPEC-0015 (fakes injetados, **sem corrida real no disco**):
  - Fake de fs/porta que **muda a identidade entre `open` e `stat`** (simula a troca do alvo) → prova que a divergência `fstat` × `stat` vira recusa (TOCTOU detectado).
  - Fake que simula symlink no último hop (`open` falha com `ELOOP`/`ENOTDIR`) → prova que `O_NOFOLLOW` rejeita.
  - Verificador (`verify`) fake retornando `true`/`false` → prova: alvo contido → opera; fora da raiz no uso → recusa.
  - No `@atlas/permissions`: teste do método novo isolado (caminho canônico dentro/fora das raízes resolvidas, rota por `access`), e regressão de que `evaluate` segue idêntico.
- **Documentação**: atualizar `packages/tools/CLAUDE.md`, `packages/permissions/CLAUDE.md`, `packages/core/CLAUDE.md`, `CLAUDE.md` raiz (invariantes/estado), `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`; ajustar o texto do item 1.1 no `Roadmap.md` para `ADR primeiro`; registrar lições em `docs/implementation/LESSONS_LEARNED.md`. (O ADR-0014 já está `Accepted` — esta SPEC **não** cria nem altera ADR.)

---

# Fora do Escopo

Esta seção é obrigatória e reflete os residuais que o ADR-0014 documentou explicitamente como não fechados nesta fatia.

- **`delete_file` (`FsWritePort.deleteFile`, `unlink`) e `mkdir` (`FsWritePort.mkdir`)** — **sem** fecho atômico. `unlink`/criação **não seguem** o symlink do componente final por semântica POSIX; o residual delas é a troca de **ancestral**, documentado, **não** fechado aqui. Não alterar essas operações.
- **`list_dir` (`FsReadPort.readdir`, `opendir`)** — fora. A API de alto nível não expõe `O_NOFOLLOW`; residual documentado. Não alterar `readdir`.
- **Troca de diretório *ancestral*** na janela entre resolver o `realpath` e abrir o fd — Node não expõe `openat` por componente; continua um risco teórico **remanescente documentado**, não fechado. Fechá-lo exigiria walk por componente com `openat` (addon nativo) — fora de escopo.
- **Windows** — `O_NOFOLLOW` não existe na plataforma; o comportamento em Windows fica fora de escopo, consistente com a matriz de CI só-Linux adotada na SPEC-0016. Não implementar caminho alternativo Windows.
- **Tornar `evaluate` assíncrono** — permanece síncrono; **não** vira `Promise`. O Runtime **não** muda.
- **Utilitário "safe-open" compartilhado** que centralize open+contenção e devolva um handle verificado (rejeitado no ADR-0014 por migrar contenção para fora do Permission Service e ter raio de mudança maior).
- **Portas conhecerem as raízes** ou receberem o Permission Service inteiro — a porta recebe **só** o predicado `verify` (rejeitado no ADR-0014: duplicaria a autoridade de decisão).
- **TOCTOU via addon nativo / `openat` por componente** — fora (residual de ancestral).
- **Múltiplas raízes por invocação**, novas Tools, novas flags/envs de CLI, mudança de comportamento visível ao usuário (além do endurecimento em si), cache/memoização.
- **Qualquer coisa em** Memory / Persona / Context / Model Gateway / Cognitive / CLI.

---

# Pré-requisitos

- [SPEC-0011](SPEC-0011-permission-service-fs-read.md) (Permission Service + `read_file`/`list_dir`) — **Done** (confirmado)
- [SPEC-0012](SPEC-0012-write-file-tool.md) (`write_file` + `writeRoots`) — **Done** (confirmado)
- [SPEC-0013](SPEC-0013-confirm-flow-destructive-tools.md) (`confirm` + `delete_file`/`mkdir`/`append_file`) — **Done** (confirmado)
- [SPEC-0015](SPEC-0015-permission-symlink-hardening.md) (contenção por `realpath`; raízes resolvidas na criação; `within()`) — **Done** (confirmado; esta SPEC reusa `within()` e as raízes já resolvidas)

---

# Critérios de Aceitação

Cada item é verificável mecanicamente pelo `spec-validator`.

- **`O_NOFOLLOW` no componente final**: dado um alvo cujo último componente é um symlink (o fake de `open` falha com `ELOOP`/`ENOTDIR`), `read_file`/`write_file`/`append_file` retornam `ToolResult` de erro (`ok: false`) e **não** lançam.
- **Ancoragem de identidade → TOCTOU detectado**: dado um fake que devolve identidade divergente entre `fstat(fd)` e `stat(realpath)` (`dev`+`ino` diferentes, simulando troca do alvo entre abrir e verificar), a operação **recusa** com `ToolResult` de erro de **mensagem distinta** (TOCTOU) e o fd é fechado; a leitura/escrita **não** ocorre.
- **Alvo contido no instante do uso → opera**: com `verify` fake retornando `true` e identidade consistente, `read_file` lê pelo fd, `write_file`/`append_file` escrevem pelo fd e retornam `ok: true`.
- **Fora da raiz no instante do uso → recusa**: com `verify` fake retornando `false` (o `realpath` de uso caiu fora das raízes), a operação retorna `ToolResult` de erro com mensagem distinta de "fora da raiz no uso" e a leitura/escrita **não** ocorre.
- **Método novo do Permission Service — puro/síncrono**: o método novo julga um caminho **já canônico** + `access` retornando `boolean`; reusa `within(target, roots)` sobre as raízes já resolvidas; **não** faz IO; **não** re-resolve caminho; rota por `access` (`read` → `readRoots`, `write`/`append` → `writeRoots`). Verificável com raízes fixas e caminhos dentro/fora.
- **`evaluate` inalterado**: `PermissionService.evaluate` continua `(action: ActionRequest) => PermissionDecision` (síncrono, retorno não-`Promise`), com o mesmo comportamento `allowed`/`blocked`/`confirm` de hoje (regressão verde).
- **Contrato — só o método novo**: `@atlas/contracts` ganha **apenas** a assinatura do método novo em `PermissionService`; nenhum outro diff em `permission.ts`/`config.ts`. `AccessMode`/`ActionRequest`/`PermissionDecision`/`PermissionVerdict` inalterados.
- **Verificador estreito, não o serviço**: `@atlas/tools` recebe uma função `verify(realpath, access) => boolean` e **não** importa `@atlas/permissions` (Regra 5 preservada — verificável no grafo de dependências do package). As portas não conhecem raízes.
- **Runtime inalterado**: nenhuma mudança de código em `packages/runtime`; `permissions.evaluate(requirement)` segue sem `await`.
- **Fiação em `@atlas/core`**: `createAtlas` fia o método novo de `permissions` como `verify` nas portas default (`nodeFsReadPort`/`nodeFsWritePort`); as Tools de FS registradas passam a operar com o fecho atômico ativo.
- **Falha estruturada, nunca exceção**: todas as recusas (symlink no último hop, TOCTOU, fora da raiz, IO) viram `ToolResult` de erro; nenhuma porta/Tool lança para fora; o Runtime registra `ExecutedStep` negado e continua nos demais passos (regressão do padrão ADR-0012/0013 verde).
- **Escopo restrito às três operações**: `deleteFile`/`mkdir`/`readdir` **não** foram alteradas (sem fecho atômico); `delete_file`/`mkdir`/`list_dir` seguem o comportamento anterior.
- **Testes sem disco real**: toda a suíte usa fakes injetados (fs/porta e `verify`); nenhuma corrida real de symlink no filesystem.
- **Documentação**: `CLAUDE.md` raiz + `packages/tools/CLAUDE.md` + `packages/permissions/CLAUDE.md` + `packages/core/CLAUDE.md` atualizados; `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` atualizados; item 1.1 do `Roadmap.md` marcado `ADR primeiro`; lições em `LESSONS_LEARNED.md`.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.

---

# Arquivos Esperados

```text
packages/contracts/src/
  permission.ts            (editado: assinatura do método novo em PermissionService)

packages/permissions/src/
  permission-service.ts    (editado: método novo puro/síncrono sobre within() e raízes
                            resolvidas; evaluate intacto)

packages/tools/src/
  fs-port.ts               (editado: tipo verify estreito; readFile/writeFile/appendFile
                            passam por open(O_NOFOLLOW)+identidade+verify+fd; nodeFsReadPort/
                            nodeFsWritePort recebem verify injetado)
  read-file.ts             (editado se necessário: mensagens distintas de erro)
  write-file.ts            (editado se necessário: mensagens distintas de erro)
  append-file.ts           (editado se necessário: mensagens distintas de erro)

packages/core/src/
  index.ts                 (editado: fia o método novo de permissions como verify nas
                            portas default)

packages/tools/tests/ (ou src/*.test.ts, conforme layout atual)
  fs-port / read-file / write-file / append-file  (editados: O_NOFOLLOW, identidade
                            divergente, contido, fora-da-raiz — com fakes)
packages/permissions/tests/ (ou src/*.test.ts)
  permission-service.test.ts  (editado: método novo isolado; evaluate regressão)

docs/04-engineering/Roadmap.md                          (editado: item 1.1 → ADR primeiro)
CLAUDE.md (raiz)                                          (editado: invariantes/estado)
packages/tools/CLAUDE.md, packages/permissions/CLAUDE.md, packages/core/CLAUDE.md  (editados)
docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md  (editados)
docs/implementation/LESSONS_LEARNED.md                   (editado)
```

Lista é expectativa; o nome exato do método novo, do tipo `verify` e o layout de testes podem sofrer pequenos ajustes conforme o padrão atual dos packages (confirmar se os testes vivem em `tests/` ou `src/*.test.ts`).

---

# Componentes Impactados

- Tools (`@atlas/tools`) — `FsReadPort.readFile`, `FsWritePort.writeFile`/`appendFile` ganham o fecho atômico (`open` `O_NOFOLLOW` + identidade do fd + `verify` + fd); verificador estreito injetado
- Permission Service (`@atlas/permissions`) — método novo puro/síncrono de contenção sobre caminho canônico; `evaluate` intacto
- Contracts (`@atlas/contracts`) — **única** adição: assinatura do método novo em `PermissionService`
- Core (`@atlas/core`) — fia o método novo como `verify` nas portas default
- Runtime (`@atlas/runtime`) — **inalterado** (`evaluate` no pré-check, sem `await`)
- Cognitive / CLI / Memory / Persona / Context / Model Gateway — **inalterados**

---

# Interfaces Necessárias

- **Método novo em `PermissionService`** (`@atlas/contracts`): predicado puro/síncrono que julga um caminho **já canônico** + `access` → `boolean` de contenção. Nome exato a definir na implementação (sugestão a confirmar: algo como `isContained(canonicalPath: string, access: AccessMode): boolean`); a **assinatura semântica** é o que importa — puro, síncrono, sem re-resolver caminho, sem IO.
- **Tipo verificador estreito** (interno a `@atlas/tools`): `verify(realpath: string, access: AccessMode) => boolean`. Sem 2º consumidor real → **não** sobe a `@atlas/contracts` (mesmo critério de `FsReadPort`/`FsWritePort`).
- **`FsReadPort`/`FsWritePort`** (internos a `@atlas/tools`): assinaturas públicas de `readFile`/`writeFile`/`appendFile` preservadas (`Promise<string>`/`Promise<void>`); o fecho atômico é interno à implementação; `nodeFsReadPort`/`nodeFsWritePort` passam a receber o `verify` injetado.
- **Nenhuma** outra interface nova ou alterada em `@atlas/contracts`.

---

# Fluxo Esperado

```text
Pré-check (Runtime, inalterado):
  tool.requirements(args) → ActionRequest
    ↓
  permissions.evaluate(req)   (síncrono)  → blocked → ExecutedStep negado (não abre fd)
                                          → confirm → ConfirmPort (delete; inalterado)
                                          → allowed → segue para tool.run

Uso (dentro da porta, NOVO — read_file / write_file / append_file):
  open(path, flags | O_NOFOLLOW)
      falha (ELOOP/ENOTDIR: symlink no último hop) → recusa (ToolResult erro)
    ↓
  realpath(path);  fstat(fd) × stat(realpath)  (dev+ino)
      divergem (TOCTOU detectado)                → fecha fd, recusa (mensagem distinta)
    ↓
  verify(realpath, access)   (método novo do Permission Service, via core)
      false (fora da raiz no uso)                → fecha fd, recusa (mensagem distinta)
    ↓
  opera sobre o fd (lê/escreve) → fecha fd → ToolResult ok
```

---

# Estratégia de Implementação

Sugestão de ordem (TDD, sem disco real, tudo com fakes injetados):

1. **Contrato + método novo**: acrescentar a assinatura ao `PermissionService` em `@atlas/contracts`; implementar o método novo em `permission-service.ts` reusando `within()` sobre as raízes já resolvidas; testar isolado (dentro/fora, rota por `access`) e provar que `evaluate` não regride.
2. **Tipo `verify` + fecho na porta**: definir o verificador estreito interno em `@atlas/tools`; reescrever `readFile`/`writeFile`/`appendFile` da(s) porta(s) para a sequência `open(O_NOFOLLOW)` → identidade → `verify` → fd → close, atrás de um fs injetável (fake) para os testes.
3. **Mensagens distintas**: garantir que cada causa (symlink último hop, TOCTOU, fora da raiz, IO) produz `ToolResult` de erro com mensagem própria, nunca lança.
4. **Fiação em `@atlas/core`**: injetar o método novo de `permissions` como `verify` nas portas default; ajustar a ordem de composição se necessário.
5. **Testes de aceitação** (todos os casos dos Critérios), com fakes de fs (identidade divergente, `open` falhando) e `verify` fake.
6. **Verificação**: `lint`/`format:check`/`typecheck`/`test`.
7. **Documentação**: `CLAUDE.md` (raiz + tools + permissions + core); `Roadmap.md` (item 1.1 → ADR primeiro); `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

- **`O_NOFOLLOW`**: fake de `open` que lança `ELOOP`/`ENOTDIR` para símbolo no último hop → `ToolResult` erro, sem lançar.
- **Identidade divergente (TOCTOU)**: fake que devolve `dev`/`ino` diferentes entre `fstat(fd)` e `stat(realpath)` → recusa com mensagem distinta; leitura/escrita não ocorre; fd fechado.
- **Contido**: `verify` → `true` + identidade consistente → opera pelo fd, `ok: true`.
- **Fora da raiz no uso**: `verify` → `false` → recusa com mensagem distinta; leitura/escrita não ocorre.
- **Método novo do Permission Service** (isolado): caminho canônico dentro/fora das raízes resolvidas, por `access` (`read`/`write`/`append`); pureza/sincronia (sem IO).
- **Regressão**: `evaluate` idêntico (`allowed`/`blocked`/`confirm`); Runtime intacto; `deleteFile`/`mkdir`/`readdir` inalteradas.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada: `CLAUDE.md` (raiz) + `packages/tools/CLAUDE.md` + `packages/permissions/CLAUDE.md` + `packages/core/CLAUDE.md`; `docs/04-engineering/Roadmap.md` (item 1.1 → `ADR primeiro`); `docs/05-context/NEXT_CONTEXT.md`; `docs/05-context/CURRENT_SPRINT.md`;
- arquitetura preservada: Permission Service segue a **única autoridade de contenção** (o método novo é puro/síncrono e reusa `within()`; a porta só aplica o predicado, não decide raiz); `@atlas/tools` acoplada só a `@atlas/contracts` (Regra 5, via `verify` estreito); `evaluate` síncrono e Runtime inalterados; contrato tocado **só** no método novo;
- residuais documentados como tais (delete/mkdir/list_dir, troca de ancestral, Windows) — nada apresentado como fechado além do componente final de `read`/`write`/`append`;
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- **Não** tornar `evaluate` assíncrono; **não** tocar o Runtime.
- **Não** passar o Permission Service inteiro (nem raízes) para `@atlas/tools` — só o predicado `verify` estreito (Regra 5).
- **Não** duplicar a autoridade de contenção: a política de raiz vive inteira no Permission Service; a porta **coleta os fatos** (o `realpath` do fd) e **aplica** o veredicto, não o decide.
- **Não** ampliar o escopo para `delete_file`/`mkdir`/`list_dir`, ancestral, Windows, safe-open compartilhado, `openat`/addon nativo.
- **Não** alterar `@atlas/contracts` além da assinatura do método novo em `PermissionService`.
- Falha (symlink último hop / TOCTOU / fora da raiz / IO) **nunca** lança: sempre `ToolResult` de erro, com mensagem distinta por causa.
- Testes **sem** corrida real no disco (fakes injetados).

---

# Observações

- **Por que a porta passa a aplicar um veredicto**: é uma ampliação deliberada do papel da porta (enforcement no ponto onde o handle existe), registrada no ADR-0014. A **decisão** de contenção permanece fora da porta — no método novo do Permission Service, injetado como predicado. Duas barreiras (pré-check `evaluate` + fecho no fd) = defesa em profundidade: um bug numa não abre a outra.
- **Por que `O_NOFOLLOW` + identidade juntos**: só `O_NOFOLLOW` impede symlink no último hop, mas não detecta troca do próprio arquivo por outro (não-symlink) na janela; a comparação `fstat(fd)` × `stat(realpath)` (dev+ino) fecha esse resíduo (ADR-0014, "Alternativas Consideradas"). Ambos são necessários.
- **Residual de ancestral / Windows**: documentados no ADR-0014 como limitações remanescentes conscientes; esta SPEC não os fecha e não deve dar a impressão de fechá-los. `delete_file`/`mkdir`/`list_dir` seguem candidatos futuros, não gates novos.
- **ADR já existe**: diferentemente da SPEC-0015 (que previu uma nota de atualização no ADR-0013 escrita no fechamento), esta SPEC consome um ADR **já `Accepted`** (ADR-0014). Esta SPEC **não** cria nem edita ADR.

---

# Checklist para IA

Antes de implementar:

- ler o **ADR-0014** (fonte de verdade do escopo), o ADR-0013 (três autoridades; TOCTOU como limitação), a SPEC-0015 (molde: porta injetável, fakes, fail-closed, `within()`) e o Module Catalog (Permission Service; Tools como adaptadores);
- compreender o objetivo (fechar o TOCTOU do componente final em `read`/`write`/`append` mantendo `evaluate` síncrono, Runtime intacto, contrato tocado só no método novo, e a autoridade de contenção única no Permission Service);
- confirmar que os pré-requisitos (SPEC-0011/0012/0013/0015) estão `Done`.

Durante a implementação:

- TDD com fakes (fs/porta com identidade divergente e `open` falhando; `verify` fake), sem disco real;
- porta recebe só o predicado `verify`; a política de raiz vive no Permission Service (reusa `within()`);
- não vazar escopo (nada de delete/mkdir/list_dir, ancestral, Windows, assíncrono, safe-open, `openat`);
- toda falha vira `ToolResult` de erro com mensagem distinta, nunca lança.

Após a implementação:

- rodar `lint`/`format:check`/`typecheck`/`test`;
- atualizar documentação (`CLAUDE.md` raiz + tools + permissions + core; `Roadmap.md` item 1.1; contexto);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, a plataforma fecha atomicamente a janela TOCTOU do componente final para as três operações que abrem-e-operam sobre um fd (`read_file`, `write_file`, `append_file`): o recurso operado é comprovadamente o recurso verificado (mesma identidade `dev`+`ino` do fd e contido na raiz no instante do uso), ou a operação é recusada como `ExecutedStep` negado com motivo distinto. Um symlink trocado entre o pré-check e o `open()` deixa de redirecionar leitura/escrita para fora da raiz permitida. O Permission Service continua a única autoridade de contenção (ganhou um predicado puro/síncrono, `evaluate` intacto); `@atlas/tools` segue acoplada só a `@atlas/contracts` (recebe um `verify` estreito); o Runtime não mudou; o contrato foi tocado só no método novo. Residuais (troca de ancestral, `delete_file`/`mkdir`/`list_dir`, Windows) ficam documentados como limitações remanescentes conscientes, não fechados.

---

# Pontos em aberto (resolvidos na aprovação `Draft → Ready`)

- **Prioridade** — **High**, confirmada pelo humano em 2026-07-18 (endurecimento de segurança / gate 1.1, alinhado à prioridade `High` da SPEC-0015, que fechou o furo de symlink estático correlato). Sem pontos em aberto remanescentes.

Todos os demais campos rastreiam fontes existentes: o **desenho** (fecho atômico `O_NOFOLLOW` + identidade do fd + predicado injetado; `evaluate`/Runtime intactos; escopo `read`/`write`/`append`; residuais) vem inteiro do **ADR-0014** (`Accepted`, validado com o humano no brainstorming); o **escopo/fora de escopo** e a **motivação** vêm do ADR-0014, do ADR-0013, do PRD (segurança) e do Module Catalog; os **símbolos** (`FsReadPort.readFile`, `FsWritePort.writeFile`/`appendFile`, `within()`, `PermissionService.evaluate`, `nodeFsReadPort`/`nodeFsWritePort`, fiação em `packages/core/src/index.ts`) foram lidos do código atual; os **pré-requisitos** foram confirmados `Done`.
