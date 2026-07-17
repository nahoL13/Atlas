# SPEC-0015 — Endurecimento de symlink no Permission Service

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0015

---

**Título**

Contenção resolvida por `realpath` no Permission Service: fecha o escape por symlink dentro de uma raiz permitida (limitação conhecida do ADR-0013), mantendo `evaluate` puro e síncrono

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

# Objetivo

Ao concluir esta SPEC, o **Permission Service** (`@atlas/permissions`) deixa de julgar contenção por **strings de path meramente resolvidas por `path.resolve`** e passa a julgá-la sobre **caminhos reais (`realpath`)** — fechando a limitação **conhecida e documentada** desde o [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md): um symlink localizado **dentro** de uma `readRoot`/`writeRoot` legítima, mas apontando para **fora** do diretório permitido, hoje **escaparia** da política.

Concretamente, quando esta SPEC estiver concluída:

- Existe uma **porta injetável síncrona** de resolução de caminho (`PathResolverPort`, com um método `realpathSync(path): string`), **interna** a `@atlas/permissions`, com implementação real default sobre `node:fs` `realpathSync` (síncrona, **não** `fs/promises`) e um fake nos testes — mesmo critério de placement de `FsReadPort`/`FsWritePort`/`ConfirmPort` (sem 2º consumidor real → **não** sobe a `@atlas/contracts`).
- `createPermissionService` passa a receber a porta opcional (`createPermissionService({ readRoots, writeRoots, pathResolver? })`, default `nodePathResolverPort()`), e **resolve as `readRoots`/`writeRoots` via a porta uma única vez, na criação** do serviço (no lugar do `resolve()` de hoje).
- `evaluate(action)` **continua síncrono** — **não** vira `Promise`. A assinatura pública de `PermissionService.evaluate` em `@atlas/contracts` **não muda**; o Runtime segue chamando `permissions.evaluate(requirement)` **sem `await`**, exatamente como hoje.
- Dentro de `evaluate`, o `path` alvo é resolvido pelo **algoritmo do ancestral existente mais profundo**: como `realpathSync` lança para caminhos inexistentes (caso comum de `write_file`/`mkdir`/`append_file` criando algo **novo** dentro de uma raiz válida), o serviço sobe pelos diretórios pais até o primeiro segmento que exista no disco, resolve o `realpath` desse ancestral e **recompõe** por cima dele os segmentos que ainda não existiam. Só então aplica a contenção lexical (`within`) já existente.
- **Fail closed**: qualquer erro de resolução que **não** seja "não existe" (`ENOENT`) — ex.: permissão negada pelo SO (`EACCES`) — produz `{ verdict: 'blocked', reason: <motivo genérico> }`; a exceção **nunca** propaga. Vale para a resolução do alvo dentro de `evaluate` e para a resolução das raízes na criação do serviço (comportamento na criação detalhado em "Observações").
- O **[ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md)** ganhará uma **nota de atualização** registrando que a limitação de symlink deixou de ser conhecida-e-aceita e passou a estar fechada por resolução `realpath` com porta injetável, sem quebrar "puro e síncrono". **Não** há ADR novo — a decisão estrutural (portão puro/síncrono na execução; porta injetável para efeito de borda) já é a do ADR-0013; esta fatia a endurece. (A nota no ADR é escrita no fechamento, pelo `spec-implementer`/doc-sync — não por esta SPEC.)

---

# Motivação

O **[Module Catalog](../../03-architecture/ModuleCatalog.md)** define o Permission Service com a responsabilidade de *"avaliar se uma ação pode ser executada de acordo com permissões, políticas e nível de risco"* e o **PRD** eleva **segurança** a requisito não funcional (*"o sistema deverá priorizar segurança"*), a critério de qualidade e a restrição explícita (*"o Atlas não deverá executar ações destrutivas sem autorização adequada"*). A contenção **lexical** entregue pela SPEC-0011 e reusada por SPEC-0012/0013 satisfaz isso para caminhos comuns, mas o **ADR-0013** registrou desde o início um furo concreto na garantia de segurança:

> *"Contenção **lexical**, sem `realpath`/symlink: um link simbólico dentro de uma `readRoot` apontando para fora poderia escapar da política. Limitação **conhecida e documentada**; endurecer exigiria IO na avaliação (ou uma porta de resolução injetável) — fatia futura."*

Essa "fatia futura" é exatamente esta SPEC. O escape vale igual para **leitura**, **escrita** e **deleção** (delete é a única ação irreversível — o risco de um `delete_file` escapar da raiz por um symlink é o mais grave). O `NEXT_CONTEXT.md` (seção "Próximo Trabalho") lista essa candidata: *"endurecimento de symlink (realpath ou porta de resolução injetável — limitação conhecida documentada no ADR-0013, vale igual para delete)"*.

O desenho já foi validado com o humano em brainstorming e é deliberadamente **conservador**: introduzir o `realpath` como **porta injetável síncrona** interna, resolvida **na borda**, sem mudar a assinatura de `evaluate`, sem tocar o Runtime, e preservando o comportamento de "criar algo novo dentro de uma raiz válida é permitido" (via algoritmo do ancestral existente mais profundo). O recorte fecha o furo de segurança **sem** alargar escopo: nenhuma Tool muda, nenhuma flag de CLI nova, nenhuma mudança visível ao usuário além do endurecimento em si.

Documentos originadores: **ADR-0013** (limitação conhecida de symlink, seções "Custos e riscos" e "Alternativas Consideradas") + **PRD** (segurança como NFR/critério/restrição) + **Module Catalog** (Permission Service; "não presumir consentimento para destrutivas") + **NEXT_CONTEXT** (candidata "endurecimento de symlink").

---

# Referências

- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) (`docs/06-adr/ADR-0013-permission-service-execution-gate.md`) — Permission Service como portão puro/síncrono; contenção lexical; **limitação de symlink/`realpath` conhecida e documentada** ("Custos e riscos", "Alternativas Consideradas") — origem direta desta SPEC
- [Module Catalog](../../03-architecture/ModuleCatalog.md) (`docs/03-architecture/ModuleCatalog.md`) — Permission Service (responsabilidade, 4 veredictos, "não é responsável por presumir consentimento para destrutivas", localização `packages/permissions`)
- [PRD](../../02-product/ProductRequirementsDocument.md) (`docs/02-product/ProductRequirementsDocument.md`) — NFR "priorizar segurança"; critério de qualidade "segurança"; restrição "não executar ações destrutivas sem autorização adequada"
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) (`docs/00-project/ArchitectureConstitution.md`) — Regra 5 (autoridade de permissão separada da execução), separação de responsabilidades; "em caso de dúvida, pare e registre"
- SPEC-0011 (`implementation/specs/SPEC-0011-permission-service-fs-read.md`) — Permission Service, contenção lexical, `readRoots`, padrão de porta injetável a espelhar; symlink registrado como limitação
- SPEC-0012 (`implementation/specs/SPEC-0012-write-file-tool.md`) — `within()` fatorada, `writeRoots`; symlink registrado como limitação (vale igual para escrita)
- SPEC-0013 (`implementation/specs/SPEC-0013-confirm-flow-destructive-tools.md`) — `delete_file`/`mkdir`/`append_file`; symlink registrado como limitação (vale igual para delete)
- [NEXT_CONTEXT](../../05-context/NEXT_CONTEXT.md) (`docs/05-context/NEXT_CONTEXT.md`) — "Próximo Trabalho": endurecimento de symlink como candidata

---

# Escopo

Somente `packages/permissions` muda em código de produção.

- **`@atlas/permissions`** — porta:
  - Criar `PathResolverPort` (interface local mínima do package): `realpathSync(path: string): string`. Nome segue o padrão `FsReadPort`/`FsWritePort` (sufixo `Port`); método com sufixo `Sync` para deixar explícito que é síncrono.
  - Criar a implementação real default `nodePathResolverPort()` sobre `node:fs` `realpathSync` (**não** `fs/promises` — precisa ser síncrona).
- **`@atlas/permissions`** — composição:
  - `createPermissionService` passa a aceitar `pathResolver?: PathResolverPort` em `PermissionServiceDeps` (default `nodePathResolverPort()`).
  - Na criação, as `readRoots`/`writeRoots` são resolvidas **via a porta** (algoritmo do ancestral existente mais profundo, para o caso de uma raiz configurada que ainda não exista ou contenha um symlink), no lugar do `resolve()` atual, **uma única vez** — não a cada `evaluate`.
- **`@atlas/permissions`** — `evaluate`:
  - Mantém a assinatura síncrona `evaluate(action: ActionRequest): PermissionDecision`.
  - Resolve o `path` alvo pela porta usando o **algoritmo do ancestral existente mais profundo** (subir pelos pais até um segmento existente, resolver seu `realpath`, recompor os segmentos inexistentes por cima) — a lógica de "subir até existir" vive no `permission-service.ts`, **não** na porta (a porta só expõe `realpathSync` cru).
  - Aplica a contenção lexical `within()` já existente sobre o alvo resolvido e as raízes resolvidas.
  - **Fail closed**: erro de resolução ≠ `ENOENT` → `{ verdict: 'blocked', reason: <genérico> }`; `evaluate` **nunca** lança.
- **Testes** (`@atlas/permissions`): casos de symlink escapando/contido, path inexistente com ancestral dentro da raiz, raiz contendo symlink, erro inesperado → blocked, tudo com `PathResolverPort` fake, sem disco real. (Um teste de fumaça opcional com `realpathSync` real, se agregar valor sem tornar a suíte dependente de layout de disco — a critério do implementador.)
- **Documentação**: nota de atualização no ADR-0013 (fechamento); atualizar `packages/permissions/CLAUDE.md`, `CLAUDE.md` raiz (invariantes/estado), `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`; registrar lições em `LESSONS_LEARNED.md`.

---

# Fora do Escopo

Esta seção é obrigatória.

- **Alterar `@atlas/contracts`** — `PermissionService`/`PermissionDecision`/`ActionRequest`/`AccessMode`/`PermissionVerdict` **não** mudam. A porta é interna, sem promoção de contrato (mesma regra de `FsReadPort`/`FsWritePort`/`ConfirmPort`: só sobe a `@atlas/contracts` com 2º consumidor real via ADR — não há aqui).
- **Tornar `evaluate` assíncrono** — permanece síncrono; **não** vira `Promise`. Foi decisão explícita do humano para não quebrar a garantia "puro e síncrono" do ADR-0013 nem mexer no Runtime.
- **Alterar `@atlas/runtime`** — nenhuma mudança de código; segue chamando `permissions.evaluate(requirement)` sem `await`.
- **Alterar `@atlas/tools`** — nenhuma Tool muda; `requirements`/`FsReadPort`/`FsWritePort` intactos.
- **Alterar `@atlas/cognitive`, `apps/cli`** — nenhuma flag de CLI nova, nenhuma env nova, nenhuma mudança de comportamento visível ao usuário **exceto o endurecimento em si** (um symlink que escapava agora é bloqueado).
- **Múltiplas raízes** por invocação — segue single-value (fora de escopo desde a SPEC-0012/0013).
- **`rmdir`**, **flag de auto-aprovação de `confirm`**, novas Tools destrutivas.
- **Qualquer coisa em** Memory / Persona / Context / Model Gateway.
- **Seguir/normalizar symlink na própria porta** com lógica de negócio — a porta só expõe `realpathSync` cru; o algoritmo de fallback (ancestral existente) vive no `permission-service.ts`.
- **Cache/memoização** da resolução do alvo entre chamadas de `evaluate`, TOCTOU (time-of-check/time-of-use) e outras condições de corrida entre avaliação e uso pela Tool — fora de escopo (a resolução das raízes é feita uma vez na criação por decisão de design; a do alvo, por chamada).
- **Identidade de usuário, arquivo de políticas externo, histórico de autorização** — seguem fora (SPEC-0011).

---

# Pré-requisitos

- [SPEC-0011](SPEC-0011-permission-service-fs-read.md) (Permission Service + Tools de leitura) — **Done** (confirmado)
- [SPEC-0012](SPEC-0012-write-file-tool.md) (`write_file` + `writeRoots`) — **Done** (confirmado)
- [SPEC-0013](SPEC-0013-confirm-flow-destructive-tools.md) (`confirm` + `delete_file`/`mkdir`/`append_file`) — **Done** (confirmado)

---

# Critérios de Aceitação

Cada item é verificável mecanicamente pelo `spec-validator`.

- **Porta criada**: `PathResolverPort` (`realpathSync(path: string): string`) existe em `@atlas/permissions`, com `nodePathResolverPort()` default sobre `node:fs` `realpathSync` (síncrono; sem import de `fs/promises` nesse caminho). A porta **não** é exportada por `@atlas/contracts`.
- **Assinatura preservada**: `PermissionService.evaluate` continua `(action: ActionRequest) => PermissionDecision` (síncrono, retorno **não**-`Promise`); `@atlas/contracts` inalterado (nenhum diff em `permission.ts`/`config.ts` por causa desta SPEC).
- **Runtime inalterado**: nenhuma mudança de código em `packages/runtime`; a chamada `permissions.evaluate(requirement)` segue sem `await`.
- **Symlink que escapa → bloqueado**: dado um alvo cujo `realpath` (resolvido pelo fake) cai **fora** de todas as raízes — ainda que o path lexical estivesse dentro de uma raiz — `evaluate` retorna `{ verdict: 'blocked', reason }` para `read`/`write`/`delete`. (Ex.: `<root>/link` cujo `realpathSync` → `/fora/segredo`.)
- **Symlink contido → autorizado como antes**: alvo cujo `realpath` cai **dentro** da raiz correspondente retorna `allowed` (`read`/`write`) ou `confirm` (`delete`), como hoje.
- **Path novo (inexistente) com ancestral dentro da raiz → preservado**: alvo que ainda **não existe** no disco (o fake de `realpathSync` lança `ENOENT` para o alvo e para pais intermediários inexistentes, mas resolve um ancestral que existe e está dentro da raiz) → `allowed` (`write`) / `confirm` (`delete`) — o comportamento de "criar algo novo dentro de uma raiz válida" **não regride**. Verificável para `write_file`/`mkdir`/`append_file` (`write`) e para um `delete` de caminho ainda inexistente.
- **Path novo cujo ancestral existente resolve para fora da raiz → bloqueado**: se o ancestral existente mais profundo é um symlink que aponta para fora, o alvo recomposto cai fora → `blocked`.
- **Raiz configurada contendo symlink → resolvida corretamente**: uma `readRoot`/`writeRoot` que é (ou contém) um symlink é resolvida via a porta **na criação**; um alvo cujo `realpath` cai dentro do **destino real** da raiz é `allowed`/`confirm`, e a comparação não usa a raiz não-resolvida (não reabre a brecha de comparar alvo resolvido contra raiz não resolvida).
- **Raiz configurada inexistente (mas plausível) → resolvida pelo ancestral existente**: uma raiz ainda não criada no disco não faz o serviço lançar na criação; resolve pelo ancestral existente mais profundo (mesmo algoritmo do alvo).
- **Fail closed no alvo**: se `realpathSync` do alvo (ou de um ancestral) lança erro ≠ `ENOENT` (ex.: `EACCES`), `evaluate` retorna `{ verdict: 'blocked', reason }` e **não** lança.
- **Fail closed na criação**: se a resolução de uma raiz lança erro ≠ `ENOENT`, o serviço **não** lança na criação; essa raiz é tratada como fail-closed (nada é considerado contido nela), sem invalidar as demais raízes que resolveram com sucesso (ver "Observações"). `createPermissionService` **nunca** lança.
- **Resolução das raízes é feita uma vez**: a porta é chamada para as raízes na criação, **não** a cada `evaluate` (verificável contando chamadas ao fake).
- **Independência read/write preservada**: rota por `access` inalterada — `read` contra `readRoots` resolvidas, `write`/`delete` contra `writeRoots` resolvidas; grants independentes.
- **`access` não suportado → `blocked`** (comportamento atual inalterado).
- **Documentação**: ADR-0013 com nota de atualização; `packages/permissions/CLAUDE.md`, `CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` atualizados; lições em `LESSONS_LEARNED.md`.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.

---

# Arquivos Esperados

```text
packages/permissions/src/
  path-resolver-port.ts        (novo: PathResolverPort + nodePathResolverPort)
  permission-service.ts        (editado: pathResolver em deps; resolução de raízes na
                                criação; algoritmo do ancestral existente no evaluate;
                                fail-closed; within() reusada sobre valores resolvidos)
  index.ts                     (editado: export do tipo da porta se necessário — interno)
packages/permissions/tests/    (ou src/*.test.ts, conforme o layout atual do package)
  permission-service.test.ts   (editado: symlink escapa/contido, path novo/ancestral,
                                raiz com symlink, fail-closed alvo e criação, contagem de
                                chamadas à porta)

docs/06-adr/ADR-0013-permission-service-execution-gate.md   (editado: nota de atualização — no fechamento)
CLAUDE.md (raiz)                                             (editado: invariantes/estado)
packages/permissions/CLAUDE.md                              (editado)
docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md  (editados)
docs/implementation/LESSONS_LEARNED.md                      (editado)
```

Lista é expectativa; o nome exato do arquivo/porta e o layout de testes podem sofrer pequenos ajustes conforme o padrão atual do package (confirmar se testes vivem em `tests/` ou `src/*.test.ts`).

---

# Componentes Impactados

- Permission Service (`@atlas/permissions`) — nova porta `PathResolverPort`; resolução `realpath` das raízes e do alvo; fail-closed
- Runtime (`@atlas/runtime`) — **consumidor inalterado** (assinatura de `evaluate` preservada; sem `await`)
- Contracts (`@atlas/contracts`) — **inalterado** (a porta é interna; contratos de permissão não mudam)
- Tools / Cognitive / CLI — **inalterados**

---

# Interfaces Necessárias

- `PathResolverPort` (interno a `@atlas/permissions`): `realpathSync(path: string): string`. Sem 2º consumidor real → **não** sobe a `@atlas/contracts` (mesma regra de `FsReadPort`/`FsWritePort`/`ConfirmPort`).
- `PermissionServiceDeps` (em `@atlas/permissions`): ganha `readonly pathResolver?: PathResolverPort` (default `nodePathResolverPort()`).
- **Nenhuma** interface nova ou alterada em `@atlas/contracts`.

---

# Fluxo Esperado

```text
Criação:
  createPermissionService({ readRoots, writeRoots, pathResolver? })
    ↓ resolve cada readRoot/writeRoot via ancestral-existente-mais-profundo (porta)
      erro ≠ ENOENT numa raiz → raiz fail-closed (nada contido nela); demais seguem
    → readRootsResolvidas / writeRootsResolvidas (uma vez)

evaluate(action)  (síncrono):
  target = resolveAlvo(action.resource.path)          // ancestral existente + recomposição
      realpathSync lança ENOENT   → sobe ao pai, tenta de novo
      realpathSync lança ≠ ENOENT → return { blocked, reason }   (fail closed)
    ↓
  access 'read'   → within(target, readRootsResolvidas)  ? allowed  : blocked
  access 'write'  → within(target, writeRootsResolvidas) ? allowed  : blocked
  access 'delete' → within(target, writeRootsResolvidas) ? confirm  : blocked
  outro           → blocked

Efeito visível (Runtime/CLI, sem código novo):
  symlink dentro da raiz apontando pra fora → agora ExecutedStep bloqueado (antes escapava)
```

---

# Estratégia de Implementação

Sugestão de ordem (TDD, sem disco real, tudo com `PathResolverPort` fake):

1. **Porta**: criar `PathResolverPort` + `nodePathResolverPort()` (`node:fs` `realpathSync`).
2. **Algoritmo do ancestral existente**: função interna pura em `permission-service.ts` que, dado um path e a porta, retorna o caminho resolvido (sobe ao pai em `ENOENT`, recompõe os segmentos inexistentes) — testar isoladamente via fake (path existente; path inexistente com ancestral existente; raiz do fs alcançada).
3. **Resolução das raízes na criação**: aplicar o mesmo algoritmo às `readRoots`/`writeRoots` uma vez; fail-closed por raiz na criação.
4. **`evaluate`**: trocar `resolve(action.resource.path)` pela resolução via ancestral; envolver em try/catch com fail-closed (≠ ENOENT → blocked); reusar `within()` sobre valores resolvidos.
5. **Testes de aceitação** (todos os casos dos Critérios), incluindo contagem de chamadas à porta para provar resolução única das raízes.
6. **Verificação**: `lint`/`format:check`/`typecheck`/`test`.
7. **Documentação**: nota no ADR-0013; `CLAUDE.md` (raiz + permissions); `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

- **Algoritmo do ancestral existente** (fake determinístico): alvo existente → `realpath` direto; alvo inexistente com pai existente → `realpath(pai) + segmento`; vários níveis inexistentes → sobe até o primeiro existente; alcançar a raiz do fs sem nunca existir (borda) → comportamento definido e testado (provavelmente resolve na raiz do fs).
- **`evaluate` — symlink**: alvo cujo `realpath` cai fora da raiz → `blocked` (`read`/`write`/`delete`); dentro → `allowed`/`confirm`.
- **`evaluate` — path novo**: alvo inexistente com ancestral dentro da raiz → `allowed`/`confirm` (não regride escrita/criação/append); ancestral (symlink) resolvendo pra fora → `blocked`.
- **Raízes**: raiz que é/contém symlink resolvida corretamente na criação; raiz inexistente resolvida por ancestral; alvo comparado contra raiz **resolvida**, nunca a bruta.
- **Fail closed**: fake que lança `EACCES` no alvo → `evaluate` retorna `blocked`, não lança; fake que lança `EACCES` numa raiz na criação → serviço não lança, raiz fail-closed, demais raízes intactas.
- **Resolução única**: fake conta chamadas — raízes resolvidas 1×/criação, não por `evaluate`.
- **Independência read/write** e **`access` não suportado** → seguem verdes (regressão).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada (ADR-0013 com nota; `CLAUDE.md` raiz + `packages/permissions/CLAUDE.md`; `NEXT_CONTEXT.md`; `CURRENT_SPRINT.md`);
- arquitetura preservada (Permission Service segue puro do ponto de vista de decisão; IO isolado na porta injetável, na borda; `evaluate` síncrono; contratos inalterados; Runtime/Tools/Cognitive/CLI inalterados);
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- **Não** alterar `@atlas/contracts` — a porta é interna, sem promoção de contrato.
- **Não** tornar `evaluate` assíncrono; **não** tocar o Runtime.
- **Não** alterar Tools, Cognitive, CLI (sem flags/envs novas; sem mudança visível além do endurecimento).
- A porta expõe **só** `realpathSync` cru; o algoritmo de "subir até existir" vive no `permission-service.ts`.
- Fail-closed em todo erro ≠ `ENOENT`; `evaluate` e `createPermissionService` **nunca** lançam.
- Raízes resolvidas **uma vez na criação**, não por chamada.
- Contenção segue **lexical** (`within()`), agora sobre valores **resolvidos por `realpath`** — não reintroduzir comparação de alvo resolvido contra raiz não resolvida.
- Manter a fatia mínima: só fecha o furo de symlink; nada de TOCTOU, cache, políticas novas.

---

# Observações

- **Por que `evaluate` continua síncrono**: a garantia "puro e síncrono, sem IO na decisão" do ADR-0013 é sustentada movendo o IO para uma **porta injetável síncrona** (`realpathSync`, não `fs/promises`). A decisão continua determinística sobre dados; a porta faz o único toque de disco, na borda. Manter síncrono evita transformar `evaluate` em `Promise` e, com isso, ter de introduzir `await` no Runtime — decisão explícita do humano.
- **Comportamento na criação com raiz que falha (confirmado pelo humano):** se a resolução de **uma** raiz lança erro ≠ `ENOENT`, o serviço **não** lança e trata **apenas aquela** raiz como fail-closed (nada é considerado contido nela), preservando as demais raízes que resolveram. Bloquear **todas** as raízes por causa de uma que falhou seria mais restritivo do que o necessário e derrubaria capacidades legítimas não relacionadas ao erro; falhar a criação inteira violaria a invariante "Permission Service/Runtime nunca lançam". `ENOENT` numa raiz **não** é erro (resolve-se pelo ancestral existente).
- **Escape por symlink valia para `read`/`write`/`delete`** igualmente; delete é o mais grave (irreversível). Esta fatia fecha os três de uma vez, porque a resolução acontece antes da rota por `access`.
- **TOCTOU fora de escopo**: a resolução do alvo em `evaluate` e o uso pela Tool acontecem em momentos distintos; um symlink trocado entre a avaliação e a execução não é tratado aqui (seria uma fatia de endurecimento posterior). Documentar como limitação remanescente.
- **Nota do ADR-0013 é escrita no fechamento** (pelo `spec-implementer`/doc-sync), não por esta SPEC — a SPEC apenas prevê a nota.

---

# Checklist para IA

Antes de implementar:

- ler o ADR-0013 (seções "Custos e riscos" e "Alternativas Consideradas" — symlink/`realpath`), SPEC-0011/0012/0013 e o Module Catalog (Permission Service);
- compreender o objetivo (fechar o escape por symlink mantendo `evaluate` síncrono e contratos intactos);
- confirmar que Runtime/contracts/Tools/CLI **não** mudam;
- confirmar que os pré-requisitos (SPEC-0011/0012/0013) estão `Done`.

Durante a implementação:

- TDD com `PathResolverPort` fake, sem disco real;
- porta só expõe `realpathSync` cru; algoritmo de ancestral no `permission-service.ts`;
- resolver raízes uma vez na criação; fail-closed por raiz; nunca lançar;
- reusar `within()` sobre valores resolvidos; rota por `access` inalterada;
- não vazar escopo (nada de assíncrono, contratos, Runtime, novas Tools/flags).

Após a implementação:

- rodar `lint`/`format:check`/`typecheck`/`test`;
- atualizar documentação (ADR-0013 com nota, `CLAUDE.md`, contexto);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Decisões confirmadas pelo humano (pós-Draft)

- **Prioridade: High** — furo de segurança em ação destrutiva (`delete_file` é a mais grave, sendo irreversível), mesmo sendo endurecimento de limitação já conhecida e não regressão ativa.
- **Fail-closed por raiz na criação**: confirmado como proposto — a raiz que falha em resolver (erro ≠ `ENOENT`) fica fail-closed (nada contido nela); as demais raízes seguem funcionando; `createPermissionService` nunca lança.

Os demais campos rastreiam fontes existentes: o **desenho** (porta síncrona injetável, `evaluate` síncrono, algoritmo do ancestral existente, resolução das raízes na criação, fail-closed) veio do **briefing de design já validado com o humano**; o **escopo/fora de escopo** e a **motivação** vieram do **ADR-0013** (limitação de symlink), do **PRD** (segurança) e do **Module Catalog** (Permission Service); os **pré-requisitos** foram confirmados `Done`.
