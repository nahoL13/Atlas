# SPEC-0024 — Endurecer o `verify` das portas de FS para fail-closed por default

> **Project Atlas — Implementation Specification**

Version: 1.0

---

# Informações Gerais

**ID**

SPEC-0024

---

**Título**

Inverter o default do predicado de contenção `verify` das portas de FS (`nodeFsReadPort`/`nodeFsWritePort` em `@atlas/tools`) de permissivo (`() => true`) para **fail-closed** (`() => false`), de modo que uma porta construída sem injetar `verify` **recuse** (em vez de permitir) `read_file`/`write_file`/`append_file` no instante do uso — fechando o residual de segurança-por-default deixado consciente pela SPEC-0017/ADR-0014, sem mudar assinatura pública, sem tocar `@atlas/contracts`, `@atlas/core` ou o Runtime

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
- [x] High
- [ ] Medium
- [ ] Low

---

**Perfil**

- [x] micro
- [ ] completo

Contida a um único package (`packages/tools/src`) + seus testes; aditiva/defensiva; deriva inteiramente do ADR-0014 (já `Accepted`), do PRD (segurança) e da lição da SPEC-0017; **não** toca `@atlas/contracts`; **não** cria módulo/Tool/Skill/Persona nem move responsabilidade; **não** exige ADR novo nem emenda; cabe numa sessão. Justificativa completa nas "Decisões de design".

---

**Item do Roadmap**

`Fase 1 — 1.1 Hardening de Execução/Permissão` (`docs/04-engineering/Roadmap.md`). Fecha um **residual de segurança-por-default** explicitamente nomeado no `NEXT_CONTEXT.md` (l. 52, "endurecer o `verify` permissivo das portas de FS … candidato: tornar `verify` obrigatório ou o default fail-closed") e na lição da SPEC-0017 (`LESSONS_LEARNED.md`, l. 198/210). Não é um gate novo do 1.1 (os dois gates de segurança do 1.1 — TOCTOU e múltiplas raízes — já estão fechados pelas SPECs 0017/0018); é o endurecimento consciente do resíduo que a decisão de implementação da SPEC-0017 (default permissivo por compatibilidade de assinatura) deixou registrado. O texto do item 1.1 no Roadmap ganha uma nota deste fechamento no `doc-sync` de fecho.

---

# Objetivo

Ao concluir esta SPEC, o predicado de contenção `verify` das portas de FS default de `@atlas/tools` é **fail-closed por default**: quando `nodeFsReadPort()` / `nodeFsWritePort()` são construídas **sem** injetar `verify`, as operações que abrem-e-operam sobre um fd — `FsReadPort.readFile`, `FsWritePort.writeFile`, `FsWritePort.appendFile` — **recusam** o uso (o fecho atômico da SPEC-0017 nega a contenção no instante do uso), em vez de permitir silenciosamente como hoje.

Concretamente:

- O default de `verify` em `NodeFsPortDeps` passa de `() => true` (permissivo) para `() => false` (fail-closed). Nenhuma assinatura pública muda: `verify` continua `Verify = (realpath: string, access: AccessMode) => boolean` **opcional** em `NodeFsPortDeps`; apenas o **valor default** é invertido.
- A autoridade real de contenção **continua vindo de `@atlas/core`** exatamente como na SPEC-0017: `createAtlas` injeta `verify = permissions.isContained.bind(permissions)` em `nodeFsReadPort({ verify })` / `nodeFsWritePort({ verify })`. Como o `verify` é sempre injetado nesse caminho, **o comportamento em produção não muda** — a inversão do default só afeta portas cruas construídas **fora** de `createAtlas` (testes e consumidores futuros).
- Uma porta crua (sem `verify`) deixa de herdar apenas `O_NOFOLLOW` + ancoragem de identidade do fd **sem** o veredicto de contenção; agora, na ausência de uma autoridade de contenção fiada, ela **recusa** — a postura segura (fail-closed) que o resto do módulo de permissões já adota (SPEC-0015: fail-closed em erro de resolução).

---

# Motivação

A SPEC-0017/ADR-0014 fechou a janela TOCTOU do componente final para `read_file`/`write_file`/`append_file`, injetando um predicado estreito `verify(realpath, access) → boolean` nas portas de FS. Por **decisão de implementação registrada** (SPEC-0017), o default de `verify` ficou **permissivo** (`() => true`), para preservar a compatibilidade de assinatura das seis chamadas zero-arg que já existiam (`read-file.ts`/`write-file.ts`/`append-file.ts`/`mkdir.ts`/`delete-file.ts`/`list-dir.ts`) — nenhum desses seis arquivos precisou mudar.

A lição da SPEC-0017 (`LESSONS_LEARNED.md`, l. 198) registrou esse custo explicitamente como **residual real e sutil**: um consumidor que chame `nodeFsReadPort()`/`nodeFsWritePort()` **fora** de `createAtlas`, sem injetar `verify`, herda `O_NOFOLLOW` + ancoragem de identidade **mas não** o veredicto de contenção — a "segurança-por-default" **não é fail-closed**. Em produção o fecho está ativo (só `@atlas/core` fia o predicado real), mas o default de uma porta crua permite, em vez de negar. A l. 210 encaminha o endurecimento ("tornar `verify` obrigatório, ou o default fail-closed") como candidato de Fase 1.1, e o `NEXT_CONTEXT.md` (l. 52) o mantém nomeado.

O **PRD** eleva **segurança** a requisito não funcional (*"O sistema deverá priorizar segurança."*, l. 173), a critério de qualidade (l. 206) e a restrição explícita (*"O Atlas não deverá executar ações destrutivas sem autorização adequada."*, l. 193). Um default permissivo num predicado **de segurança** é um antipadrão fail-open: se um caminho futuro de construção de porta esquecer de fiar o `verify`, ele vaza autoridade de contenção silenciosamente. Inverter o default para fail-closed alinha o comportamento à postura já adotada em `@atlas/permissions` desde a SPEC-0015 (fail-closed em erro de resolução) e ao teste da Constituição (*mais transparente, mais sustentável*): um consumidor mal-fiado passa a **falhar de forma visível** (recusa), não a permitir por omissão.

Documentos originadores: **lição da SPEC-0017** (`LESSONS_LEARNED.md`, residual do `verify` permissivo) + **ADR-0014** (o fecho atômico e o predicado injetado que esta SPEC endurece) + **PRD** (segurança como NFR/critério/restrição) + **NEXT_CONTEXT.md** (candidato de 1.1). **Nenhum ADR novo**: a fronteira estrutural (Permission Service = única autoridade de contenção; porta aplica um predicado injetado; `evaluate`/Runtime intactos) do ADR-0013/0014 permanece **inalterada** — esta SPEC só troca o **valor default** do predicado quando ninguém o fia.

---

# Referências

- [LESSONS_LEARNED.md — lição da SPEC-0017](../LESSONS_LEARNED.md) (`docs/implementation/LESSONS_LEARNED.md`, l. 198/210) — **origem direta**: o residual do `verify` permissivo (porta crua fora do `createAtlas` sem contenção) e o encaminhamento "tornar `verify` obrigatório ou o default fail-closed"
- [ADR-0014](../../06-adr/ADR-0014-toctou-atomic-enforcement.md) (`docs/06-adr/ADR-0014-toctou-atomic-enforcement.md`) — o fecho atômico (`O_NOFOLLOW` + ancoragem de identidade + predicado injetado `verify`) que esta SPEC endurece; a autoridade de contenção única no Permission Service via predicado estreito
- [SPEC-0017](SPEC-0017-toctou-atomic-enforcement.md) (`docs/implementation/specs/SPEC-0017-toctou-atomic-enforcement.md`) — introduziu `Verify`/`NodeFsPortDeps` e a decisão de implementação do default permissivo que esta SPEC inverte
- [SPEC-0015](SPEC-0015-permission-symlink-hardening.md) (`docs/implementation/specs/SPEC-0015-permission-symlink-hardening.md`) — precedente de postura **fail-closed** no módulo de permissões (erro de resolução ≠ `ENOENT` → não contido)
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) (`docs/06-adr/ADR-0013-permission-service-execution-gate.md`) — as três autoridades (Tool descreve / Permission Service julga / Runtime aplica); Regra 5 (Tools/portas não conhecem `@atlas/permissions`)
- [PRD](../../02-product/ProductRequirementsDocument.md) (`docs/02-product/ProductRequirementsDocument.md`) — segurança como NFR (l. 173), critério de qualidade (l. 206), restrição de ações destrutivas (l. 193)
- [Module Catalog](../../03-architecture/ModuleCatalog.md) (`docs/03-architecture/ModuleCatalog.md`) — Tools como adaptadores sem decisão; Permission Service como autoridade de contenção
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Regra 5 (Tools são adaptadores; autoridade de permissão separada da execução); teste "mais simples/modular/transparente/sustentável"

---

# Escopo

Muda código de produção **apenas** em `packages/tools/src/fs-port.ts` (uma inversão de valor default + o JSDoc que o descreve) e os testes de `packages/tools`. Nem mais, nem menos.

- **`@atlas/tools` (`fs-port.ts`)** — inverter o default de `verify`:
  - Em `nodeFsReadPort` e `nodeFsWritePort`, trocar `const verify = deps.verify ?? (() => true);` por `const verify = deps.verify ?? (() => false);` (fail-closed).
  - Atualizar o **JSDoc** de `NodeFsPortDeps.verify` (hoje descreve "Default permissivo (`() => true`) preserva o comportamento anterior à SPEC-0017") para descrever o novo default **fail-closed** e por quê: na ausência de uma autoridade de contenção injetada, a porta recusa; a autoridade real vem sempre de `@atlas/core` (`permissions.isContained`).
  - **Nada mais** em `fs-port.ts` muda: `Verify`, `NodeFsPortDeps`, `FsReadPort`, `FsWritePort`, `FsPrimitivesPort`, `withVerifiedHandle`, `flagsFor`, `nodeFsPrimitivesPort`, `sameIdentity` — todos **intactos**. `readdir`/`deleteFile`/`mkdir` **não** passam pelo fecho atômico, logo o valor de `verify` **não os afeta** (permanecem inalterados em qualquer default).
- **Testes (`packages/tools/tests/fs-port.test.ts`)**:
  - **Reescrever** o caso hoje intitulado *"sem verify injetado (default), comporta-se de forma permissiva (compatibilidade)"* (l. 120–128) — que assevera o comportamento antigo (`resolves.toBe('x')`) — para asseverar o **novo invariante**: sem `verify` injetado, a porta é **fail-closed** (`readFile`/`writeFile`/`appendFile` **recusam** com `ToolResult`/erro de "fora do diretório permitido no instante do uso", a leitura/escrita **não** ocorre). Cobrir tanto `nodeFsReadPort` quanto `nodeFsWritePort`.
  - Adicionar/ajustar casos que provem que, **com `verify` injetado** (o caminho de produção), o comportamento é idêntico ao de hoje (regressão verde) — os casos existentes que passam `{ verify, primitives }` já cobrem isso e **não devem regredir**.
  - Confirmar por teste que `readdir` (`FsReadPort.readdir`), `deleteFile`/`mkdir` (`FsWritePort`) **não** são afetados pela mudança de default (não passam pelo fecho atômico) — o caso "readdir não muda" (l. 130–147) já cobre `readdir`; garantir que segue verde.
- **Documentação específica da SPEC**: nenhuma no escopo do implementador além da própria SPEC e do JSDoc em `fs-port.ts`. As docs vivas (`packages/tools/CLAUDE.md` — o parágrafo que hoje diz "`verify` default permissivo", `packages/core/CLAUDE.md`, `docs/05-context/NEXT_CONTEXT.md` l. 52, `docs/04-engineering/Roadmap.md` item 1.1, `LESSONS_LEARNED.md`) são atualizadas no passo de fecho **doc-sync**, não pelo `spec-implementer`.

---

# Fora do Escopo

- **Tornar `verify` obrigatório** (mudança de assinatura em `NodeFsPortDeps` / cascata nos seis Tool factories / `@atlas/core` / testes) — **rejeitado** nas Decisões de design em favor do default fail-closed (mesmo ganho de segurança, raio de mudança muito menor). Não remover a opcionalidade de `verify`.
- **`@atlas/core`** — **nenhuma** mudança. `createAtlas` já fia `verify = permissions.isContained.bind(permissions)`; a inversão do default não altera a fiação nem exige reordenar a composição. Não tocar `packages/core/src`.
- **`@atlas/contracts`** — **nenhuma** mudança. `isContained`, `evaluate`, `PermissionDecision`, `ActionRequest`, `AccessMode`, `Verify` (interno a `@atlas/tools`) — todos intactos.
- **`@atlas/permissions`** — **nenhuma** mudança. `isContained`/`evaluate`/`within` intactos.
- **`@atlas/runtime`, `@atlas/cognitive`, `apps/cli`, Memory/Persona/Context/Model Gateway** — **nenhuma** mudança.
- **Estender o fecho atômico a `delete_file`/`mkdir`/`list_dir`** (residual de troca de **ancestral**; `readdir` sem `O_NOFOLLOW`) — fora, seguem residuais documentados do ADR-0014.
- **Troca de diretório *ancestral*, `openat`/addon nativo, Windows (`O_NOFOLLOW` é POSIX)** — fora, residuais documentados do ADR-0014.
- **Tornar `evaluate` assíncrono; utilitário "safe-open" compartilhado; portas conhecerem as raízes ou receberem o Permission Service inteiro** — fora (todos rejeitados no ADR-0014, seguem rejeitados).
- **Novas Tools, flags/envs de CLI, mudança de comportamento visível ao usuário** — nenhuma; a mudança é invisível em produção (o `verify` real é sempre injetado por `createAtlas`).
- **Mexer nos seis call-sites zero-arg** (`read-file.ts`/`write-file.ts`/`append-file.ts`/`mkdir.ts`/`delete-file.ts`/`list-dir.ts`) — **não é necessário nem desejado**: eles continuam usando o fallback zero-arg; em produção nunca executam (o `fs` é sempre injetado por `createAtlas`). Não editar esses arquivos.

---

# Pré-requisitos

- [SPEC-0017](SPEC-0017-toctou-atomic-enforcement.md) (fecho atômico de TOCTOU; introduziu `Verify`/`NodeFsPortDeps` e o default permissivo) — **Done** (confirmado no `NEXT_CONTEXT.md` l. 19 e no cabeçalho da SPEC-0017).
- [SPEC-0015](SPEC-0015-permission-symlink-hardening.md) (contenção por `realpath`; postura fail-closed) — **Done** (confirmado).
- [SPEC-0011](SPEC-0011-permission-service-fs-read.md) / [SPEC-0012](SPEC-0012-write-file-tool.md) / [SPEC-0013](SPEC-0013-confirm-flow-destructive-tools.md) (Permission Service + Tools de FS + `FsReadPort`/`FsWritePort`) — **Done** (confirmado).

---

# Critérios de Aceitação

Cada item é verificável mecanicamente pelo validador/`spec-closer`.

- **Default invertido para fail-closed**: em `fs-port.ts`, `nodeFsReadPort` e `nodeFsWritePort` usam `deps.verify ?? (() => false)` (não mais `() => true`). Verificável por leitura direta do arquivo.
- **Porta crua de leitura recusa**: `nodeFsReadPort({ primitives })` construída **sem** `verify` (identidade consistente, `open` bem-sucedido) faz `readFile` **recusar** o uso (rejeita/`ToolResult` de erro com a mensagem de "fora do diretório permitido no instante do uso"); a leitura pelo fd **não** ocorre.
- **Porta crua de escrita recusa**: `nodeFsWritePort({ primitives })` sem `verify` faz `writeFile` **e** `appendFile` **recusarem** o uso (mesma causa); a escrita pelo fd **não** ocorre.
- **`verify` injetado preserva o comportamento de produção**: com `verify` fake retornando `true` e identidade consistente, `readFile`/`writeFile`/`appendFile` operam pelo fd e retornam sucesso (regressão verde — os casos existentes de `fs-port.test.ts` que passam `{ verify, primitives }` continuam passando sem alteração de expectativa).
- **`readdir`/`deleteFile`/`mkdir` inalterados**: essas operações **não** passam pelo fecho atômico; a mudança de default de `verify` **não** as afeta (o caso "readdir não muda" segue verde; `deleteFile`/`mkdir` continuam operando independentemente de `verify`).
- **Assinatura pública inalterada**: `Verify`, `NodeFsPortDeps` (`verify?`/`primitives?` seguem **opcionais**), `FsReadPort`, `FsWritePort`, `FsPrimitivesPort` — nenhuma mudança de tipo/assinatura. `@atlas/tools` continua acoplada só a `@atlas/contracts` (Regra 5 — sem import de `@atlas/permissions`).
- **JSDoc atualizado**: o comentário de `NodeFsPortDeps.verify` descreve o default **fail-closed** e a razão (autoridade de contenção vem de `@atlas/core`), sem descrever mais o default como permissivo/compatibilidade.
- **Nenhum diff fora de `@atlas/tools`**: `git diff` em `packages/core`, `packages/permissions`, `packages/contracts`, `packages/runtime`, `packages/cognitive`, `apps/cli` **vazio** (produção). A única mudança de produção é `packages/tools/src/fs-port.ts`.
- **Teste antigo de "default permissivo" removido/reescrito**: não resta nenhum teste asseverando que a porta crua **permite** (`resolves.toBe(...)` sem `verify`); em seu lugar, um teste assevera a recusa fail-closed.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` **verdes**.

---

# Arquivos Esperados

```text
packages/tools/src/
  fs-port.ts               (editado: default de verify () => true → () => false em
                            nodeFsReadPort e nodeFsWritePort; JSDoc de NodeFsPortDeps.verify)

packages/tools/tests/
  fs-port.test.ts          (editado: reescrever o caso "default permissivo" para asseverar
                            fail-closed em read/write/append; casos com verify injetado e
                            readdir/deleteFile/mkdir seguem verdes)

docs/implementation/specs/
  SPEC-0024-fs-port-fail-closed-verify.md   (esta SPEC)
```

Docs vivas atualizadas no **doc-sync** de fecho (fora do `spec-implementer`): `packages/tools/CLAUDE.md`, `packages/core/CLAUDE.md`, `docs/05-context/NEXT_CONTEXT.md` (l. 52), `docs/04-engineering/Roadmap.md` (nota no item 1.1), `docs/implementation/LESSONS_LEARNED.md`.

---

# Componentes Impactados

- Tools (`@atlas/tools`) — `nodeFsReadPort`/`nodeFsWritePort`: default de `verify` invertido para fail-closed (`fs-port.ts`); demais símbolos intactos.
- Permission Service (`@atlas/permissions`) — **inalterado**.
- Core (`@atlas/core`) — **inalterado** (já injeta `verify` real; produção não muda).
- Contracts (`@atlas/contracts`) — **inalterado**.
- Runtime / Cognitive / CLI / Memory / Persona / Context / Model Gateway — **inalterados**.

---

# Interfaces Necessárias

- **Nenhuma interface nova ou alterada.** `Verify = (realpath: string, access: AccessMode) => boolean` e `NodeFsPortDeps { verify?: Verify; primitives?: FsPrimitivesPort }` permanecem **exatamente** como estão (ambos os campos opcionais). Apenas o **valor default** de `verify` quando ausente muda de `() => true` para `() => false`.

---

# Fluxo Esperado

```text
Porta construída COM verify (produção, via createAtlas — inalterado):
  nodeFsReadPort({ verify: permissions.isContained })
    → readFile → open(O_NOFOLLOW) → identidade → verify(realpath, 'read')
        → true  → opera pelo fd
        → false → recusa (fora da raiz no uso)

Porta construída SEM verify (crua, fora de createAtlas — MUDANÇA):
  nodeFsReadPort({ primitives })            // ou nodeFsReadPort()
    → readFile → open(O_NOFOLLOW) → identidade → verify default = () => false
        → recusa SEMPRE (fail-closed)        // antes: () => true → permitia

  readdir / deleteFile / mkdir              // não passam pelo fecho atômico
    → inalterados (verify não é consultado)
```

---

# Estratégia de Implementação

Mudança mínima, dirigida a teste:

1. **RED**: reescrever o caso "sem verify injetado (default), comporta-se de forma permissiva" em `fs-port.test.ts` para esperar **recusa** (fail-closed) em `readFile`/`writeFile`/`appendFile` sem `verify`. Rodar → falha (o código ainda usa `() => true`).
2. **GREEN**: trocar `deps.verify ?? (() => true)` por `deps.verify ?? (() => false)` em `nodeFsReadPort` e `nodeFsWritePort`.
3. Atualizar o JSDoc de `NodeFsPortDeps.verify` (default fail-closed + razão).
4. Rodar a suíte de `@atlas/tools`; confirmar que os casos com `verify` injetado e o caso `readdir` seguem verdes.
5. **Verificação**: `pnpm lint`/`format:check`/`typecheck`/`test`.

---

# Estratégia de Testes

- **Fail-closed por default (leitura)**: `nodeFsReadPort({ primitives })` sem `verify`, identidade consistente, `open` OK → `readFile` recusa; a operação de leitura pelo fd não ocorre.
- **Fail-closed por default (escrita/append)**: `nodeFsWritePort({ primitives })` sem `verify` → `writeFile` e `appendFile` recusam; a escrita pelo fd não ocorre.
- **Regressão com `verify` injetado**: casos existentes com `{ verify: alwaysTrue(), primitives }` (opera) e `{ verify: alwaysFalse(), primitives }` (recusa) seguem verdes sem alteração de expectativa — provam que a autoridade injetada continua governando.
- **`readdir`/`deleteFile`/`mkdir` inalterados**: seguem sem passar pelo fecho atômico; caso `readdir` (ENOENT de IO comum) verde; `deleteFile`/`mkdir` operam independentemente de `verify`.
- **Sem disco real**: toda a suíte usa `FsPrimitivesPort` fake e `verify` fake, como na SPEC-0017.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada — o JSDoc em `fs-port.ts` (escopo do implementador) e, no **doc-sync** de fecho, `packages/tools/CLAUDE.md`, `packages/core/CLAUDE.md`, `docs/05-context/NEXT_CONTEXT.md` (l. 52 → residual **entregue**), `docs/04-engineering/Roadmap.md` (nota no item 1.1), `docs/implementation/LESSONS_LEARNED.md`;
- arquitetura preservada: Permission Service segue a única autoridade de contenção; `@atlas/tools` acoplada só a `@atlas/contracts` (Regra 5); `evaluate`/Runtime/contratos inalterados; o único diff de produção é o default de `verify` em `fs-port.ts`;
- residuais do ADR-0014 (delete/mkdir/list_dir, troca de ancestral, Windows) permanecem documentados como abertos — esta SPEC **não** os fecha e **não** dá a impressão de fechá-los;
- revisão concluída (gate do `architecture-reviewer`; no ramo micro, validação e fecho pelo `spec-closer`);
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- **Não** mudar a assinatura de `NodeFsPortDeps`/`Verify` — `verify` continua **opcional**; só o valor default muda.
- **Não** tocar `@atlas/core`, `@atlas/contracts`, `@atlas/permissions`, `@atlas/runtime`, `apps/cli` nem qualquer outro package.
- **Não** editar os seis call-sites zero-arg (`read-file.ts`/`write-file.ts`/`append-file.ts`/`mkdir.ts`/`delete-file.ts`/`list-dir.ts`).
- **Não** ampliar o fecho atômico para `delete_file`/`mkdir`/`list_dir`, ancestral, Windows.
- **Não** deixar nenhum teste asseverando o comportamento permissivo antigo (porta crua que permite).
- `@atlas/tools` **não** importa `@atlas/permissions` (Regra 5) — a porta recebe só o predicado.

---

# Observações

- **Por que isto é seguro em produção**: `createAtlas` sempre injeta `verify = permissions.isContained.bind(permissions)` nas portas default (SPEC-0017); como o `verify` está sempre presente no caminho de produção, o default nunca é consultado ali — a inversão só muda o comportamento de portas **cruas** (testes e consumidores futuros diretos), que passam de fail-open a fail-closed. É endurecimento defensivo puro, sem regressão de capacidade.
- **Alinhamento com a postura do módulo**: `@atlas/permissions` já é fail-closed em erro de resolução desde a SPEC-0015 (erro ≠ `ENOENT` → não contido). Esta SPEC estende a mesma postura ao default do predicado da porta: na ausência de autoridade fiada, **recusar**.
- **`readdir`/`deleteFile`/`mkdir`** não consultam `verify` (não passam por `withVerifiedHandle`); a mudança de default é, para eles, um no-op — consistente com o escopo do ADR-0014 (só `read`/`write`/`append` têm fecho atômico).

---

# Checklist para IA

Antes de implementar:

- ler a lição da SPEC-0017 (`LESSONS_LEARNED.md`, residual do `verify` permissivo), o ADR-0014 (o fecho atômico e o predicado injetado), e `packages/tools/src/fs-port.ts` (o ponto exato: `deps.verify ?? (() => true)`);
- confirmar que os pré-requisitos (SPEC-0011/0012/0013/0015/0017) estão `Done`.

Durante a implementação:

- mudança mínima: inverter o default em dois pontos (`nodeFsReadPort`, `nodeFsWritePort`) + JSDoc; nada mais em produção;
- TDD com fakes (`FsPrimitivesPort` + `verify`), sem disco real;
- não vazar escopo (nada de core/contracts/permissions/CLI, nada de delete/mkdir/list_dir/ancestral/Windows).

Após a implementação:

- rodar `lint`/`format:check`/`typecheck`/`test`;
- validar os Critérios de Aceitação;
- registrar lições; mover Status conforme o ramo micro (gate do reviewer → `spec-closer`).

---

# Resultado Esperado

Após esta SPEC, o predicado de contenção `verify` das portas de FS de `@atlas/tools` é **fail-closed por default**: uma porta construída sem uma autoridade de contenção injetada **recusa** `read_file`/`write_file`/`append_file` no instante do uso, em vez de permitir silenciosamente. O comportamento em produção é **idêntico** ao de hoje (o `verify` real continua fiado por `createAtlas`); o que muda é a postura de segurança-por-default para consumidores crus e futuros da porta, fechando o residual consciente da SPEC-0017. A assinatura pública não muda, `@atlas/tools` segue acoplada só a `@atlas/contracts`, e a autoridade de contenção continua única no Permission Service. Os residuais do ADR-0014 (delete/mkdir/list_dir, troca de ancestral, Windows) seguem documentados como limitações remanescentes conscientes, não fechados.

---

# Decisões de design

Registradas em formato de veto (Emenda v1.1 da Constituição, Artigo 15). O `architecture-reviewer` as ataca no gate `Draft → Ready`.

1. **Default fail-closed (`() => false`), não `verify` obrigatório.**
   - **Decisão**: inverter o **valor default** de `verify` de `() => true` para `() => false`, mantendo `verify` **opcional** em `NodeFsPortDeps`.
   - **Porquê**: entrega o mesmo fail-closed pedido pela lição da SPEC-0017 com raio de mudança mínimo (duas linhas + JSDoc, sem cascata de assinatura), preserva as assinaturas públicas e a Regra 5, e alinha-se à postura fail-closed já adotada em `@atlas/permissions` (SPEC-0015) — mais simples, mais transparente, mais sustentável (teste da Constituição).
   - **Alternativa descartada**: tornar `verify` **obrigatório** — cascatearia nos seis Tool factories (que não têm um `verify` a passar sem empurrar o conceito de permissão para dentro das Tools, ferindo a Regra 5) + `@atlas/core` + muitos testes, com raio de mudança muito maior e **nenhum** ganho de segurança sobre o default fail-closed (uma porta sem `verify` recusa de qualquer modo).

2. **Escopo contido a `@atlas/tools`; `@atlas/core` intacto.**
   - **Decisão**: não tocar `@atlas/core` — a única mudança de produção é `packages/tools/src/fs-port.ts`.
   - **Porquê**: `createAtlas` já injeta `verify = permissions.isContained.bind(permissions)` desde a SPEC-0017; a inversão do default não altera essa fiação nem a ordem de composição, então mexer no core seria mudança sem efeito e ampliaria o escopo (Artigo 5, menos é mais).
   - **Alternativa descartada**: reforçar/reordenar a fiação no core "por garantia" — desnecessário (já correto) e expandiria o diff sem motivo, contrariando a fronteira de "Fora do Escopo".

3. **Reescrever o teste do default permissivo, não apenas removê-lo.**
   - **Decisão**: converter o caso `fs-port.test.ts` que hoje assevera a porta crua **permitindo** (`resolves.toBe('x')`) num caso que assevera a **recusa** fail-closed em `read`/`write`/`append`.
   - **Porquê**: o novo invariante de segurança-por-default precisa de cobertura mecânica positiva; deixar o teste antigo cairia, e removê-lo sem substituto deixaria o comportamento fail-closed sem asserção (regressão silenciosa futura).
   - **Alternativa descartada**: apenas deletar o teste antigo — perderia a garantia do invariante recém-criado.

4. **Prioridade: High.**
   - **Decisão**: classificar como `High`.
   - **Porquê**: é endurecimento de segurança ancorado no PRD (l. 173/193/206) e na mesma família das SPECs 0015/0017 (ambas `High`); um default fail-open num predicado de segurança é um antipadrão que convém fechar cedo, antes que um caminho futuro de construção de porta o herde.
   - **Alternativa descartada**: `Medium` — subvalorizaria um endurecimento de segurança; embora a exposição **em produção** seja nula hoje (o `verify` real é sempre injetado), a natureza de segurança-por-default e o baixíssimo custo da fatia pesam por `High`, não por adiar.

5. **Perfil: micro.**
   - **Decisão**: classificar o Perfil como `micro` (ramo fast-path da Emenda v1.2).
   - **Porquê**: contida a `packages/tools/src` + seus testes; aditiva/defensiva; deriva inteiramente do ADR-0014 (já `Accepted`), do PRD e da lição da SPEC-0017; **não** toca `@atlas/contracts`; **não** cria módulo/Tool/Skill/Persona nem move responsabilidade; **não** exige ADR novo nem emenda; cabe numa sessão — satisfaz TODAS as condições de `micro`.
   - **Alternativa descartada**: `completo` (o default seguro na dúvida) — mas nenhuma condição de escalação é tocada e a fatia é uma inversão de um único valor default; classificar como `completo` mandaria-a ao pipeline pesado sem necessidade. O `architecture-reviewer` confirma a classificação no gate (modo leve); um `micro` indevido cairia no pipeline completo sem prejuízo.
