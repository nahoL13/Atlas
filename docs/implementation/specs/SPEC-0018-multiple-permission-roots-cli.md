# SPEC-0018 — Múltiplas raízes de leitura/escrita na configuração (CLI + config)

> **Project Atlas — Implementation Specification**

Version: 1.0

---

# Informações Gerais

**ID**

SPEC-0018

---

**Título**

Múltiplas raízes de leitura/escrita na borda de entrada da CLI: `--allow-read`/`--allow-write` tornam-se flags repetíveis (`multiple: true` do `parseArgs`) e `ATLAS_ALLOW_READ`/`ATLAS_ALLOW_WRITE` passam a aceitar lista separada por `path.delimiter`, produzindo `readRoots`/`writeRoots` com múltiplas raízes — sem tocar `@atlas/permissions`, `@atlas/contracts`, `@atlas/runtime`, `@atlas/tools` nem `@atlas/cognitive`.

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade** _(confirmada Medium pelo humano na aprovação `Draft → Ready`, 2026-07-18)_

- [ ] Critical
- [ ] High
- [x] Medium
- [ ] Low

Proposta **Medium** com base no Roadmap: é o **único gate pequeno restante** do item 1.1 (o outro gate, TOCTOU, já fechou na SPEC-0017), então fecha um critério de conclusão da Fase 1 — mas é uma mudança barata, de borda de entrada, sem risco arquitetural (a autoridade de permissão já opera sobre listas). Não é `High` como as SPECs de _hardening_ de symlink/TOCTOU (0015/0017), porque não corrige um furo de segurança: apenas expõe uma capacidade que o núcleo já tem. **O usuário confirma a prioridade final.**

---

**Item do Roadmap**

`Fase 1 — 1.1 Hardening de Execução/Permissão` (`docs/04-engineering/Roadmap.md`), item marcado **`gate · SPEC direta`**: _"Múltiplas raízes de leitura/escrita por invocação (hoje `readRoots`/`writeRoots` são avaliadas como conjunto único)."_ Esta SPEC fecha esse gate. Com ele e o TOCTOU (SPEC-0017) entregues, o critério de conclusão da Fase 1 _"As limitações de segurança marcadas como gate em 1.1 estão fechadas (TOCTOU e múltiplas raízes)"_ (Roadmap, linha 120) passa a estar satisfeito. O texto do item no Roadmap deve ser marcado como entregue no fechamento (doc-sync).

Nota de precisão terminológica: o Roadmap fala em _"por invocação"_. O achado central desta SPEC (ver Motivação) é que **múltiplas raízes por invocação individual de Tool já funcionam** — o Permission Service já avalia arrays. O que falta é a **borda de entrada da CLI** permitir configurar mais de uma raiz por invocação do processo. É essa lacuna, e só ela, que esta SPEC fecha.

---

# Objetivo

Ao concluir esta SPEC, o usuário consegue configurar **mais de uma** raiz de leitura e **mais de uma** raiz de escrita numa única invocação do `atlas`, tanto por flag quanto por variável de ambiente:

- **Flag repetível**: `atlas ask "..." --allow-read ~/docs --allow-read ~/projetos` resulta em `readRoots: ['~/docs', '~/projetos']`. O mesmo para `--allow-write`.
- **Env por delimitador de caminho**: `ATLAS_ALLOW_READ=~/docs:~/projetos` (POSIX; `;` em Windows) resulta em `readRoots: ['~/docs', '~/projetos']`. O mesmo para `ATLAS_ALLOW_WRITE`.

A precedência `flags > env > defaults` (ADR-0006) permanece inalterada: quando a flag está presente, a lista da flag **substitui por inteiro** a lista da env (sem merge/união). Segmentos vazios ou só-espaço são filtrados; se a fonte colapsa para uma lista vazia, ela é tratada como "não fornecida" e cai no default do core.

`atlas status` já exibe múltiplas raízes corretamente (`readRoots.join(', ')`, `writeRoots` vazio tratado) e **não precisa de mudança**.

Nada além da borda de entrada da CLI muda. `@atlas/permissions`, `@atlas/contracts`, `@atlas/runtime`, `@atlas/tools` e `@atlas/cognitive` recebem **zero linha**.

---

# Motivação

O item 1.1 do Roadmap lista "múltiplas raízes de leitura/escrita" como um gate da Fase 1. A investigação do código (feita no brainstorming com o humano) revelou que **o núcleo já suporta múltiplas raízes**:

- `packages/permissions/src/permission-service.ts` implementa `within(target, roots)` como `roots.some(...)`, e `evaluate`/`isContained` roteiam sobre `readRoots`/`writeRoots: readonly string[]`.
- `packages/core/src/config/load-config.ts` valida `readRoots`/`writeRoots` como **listas** (rejeita `readRoots` vazio; rejeita caminhos em branco em ambas).
- `@atlas/contracts`, `@atlas/runtime`, `@atlas/tools` já operam sobre arrays de raízes.
- `apps/cli/src/commands/status.ts` já faz `readRoots.join(', ')` e já trata `writeRoots` vazio.

O **único** ponto que trava tudo em "uma raiz só" é a **borda de entrada da CLI**: `apps/cli/src/gateway/input-gateway.ts` lê `--allow-read <p>` / `ATLAS_ALLOW_READ` como **string única** (variáveis locais `readRoot`/`writeRoot` singulares, linhas ~77-100) e embrulha o valor num array de um elemento (`[readRoot]`, `[writeRoot]`). As flags são declaradas como `{ type: 'string' }` (linhas ~149-150), sem `multiple`.

Portanto o gate se fecha **inteiramente** ajustando o Input Gateway (e o texto de `--help`). É o que torna esta SPEC barata e de baixo risco: nenhuma regra de decisão de permissão muda; apenas se remove o afunilamento na coleta da configuração.

A base documental do controle de raízes é o **PRD** (segurança como requisito não funcional — _"O sistema deverá priorizar segurança"_; restrição _"O Atlas não deverá executar ações destrutivas sem autorização adequada"_) e o **Module Catalog** (Permission Service: _"avaliar se uma ação pode ser executada de acordo com permissões, políticas e nível de risco"_). Configurar mais de um diretório sandbox permitido é uma capacidade natural desse modelo, atribuída ao gate 1.1 do Roadmap.

---

# Referências

- [Roadmap](../../04-engineering/Roadmap.md) (`docs/04-engineering/Roadmap.md`) — Fase 1, item 1.1, gate _"Múltiplas raízes de leitura/escrita por invocação"_; critério de conclusão da Fase 1 (linha 120)
- [ADR-0006](../../06-adr/ADR-0006-config-source-precedence.md) (`docs/06-adr/ADR-0006-config-source-precedence.md`) — precedência `flags > env > arquivo > defaults`; resolução de entrada no Input Gateway; validação exclusiva no core (valores crus repassados). Esta SPEC preserva integralmente a ordem de precedência decidida ali.
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) (`docs/06-adr/ADR-0013-permission-service-execution-gate.md`) — Permission Service como portão puro/síncrono; contenção sobre raízes. **Não muda**; referenciado para confirmar que o julgamento sobre listas já é o modelo vigente.
- [Module Catalog](../../03-architecture/ModuleCatalog.md) (`docs/03-architecture/ModuleCatalog.md`) — Permission Service (responsabilidade de avaliar autorização/risco); a mudança é na **CLI** (`@atlas/cli`, camada de aplicação), não no módulo de permissões.
- [PRD](../../02-product/ProductRequirementsDocument.md) (`docs/02-product/ProductRequirementsDocument.md`) — segurança como NFR e restrição (base do modelo de raízes permitidas).
- [Glossary](../../00-project/Glossary.md) (`docs/00-project/Glossary.md`) — termos "Tool", "Permission", "Input Gateway".
- [SPEC-0015](SPEC-0015-permission-symlink-hardening.md) / [SPEC-0017](SPEC-0017-toctou-atomic-enforcement.md) — endurecimentos anteriores do gate 1.1 (symlink estático; TOCTOU). Esta SPEC fecha o gate restante.
- `apps/cli/CLAUDE.md` — Input Gateway como semente local; precedência `flags > env`; parsing via `node:util`.

---

# Escopo

Estritamente a **borda de entrada da CLI** (`@atlas/cli`) e sua documentação de `--help`. Nenhum outro package.

- **`apps/cli/src/gateway/input-gateway.ts`** — parsing:
  - Declarar `'allow-read'` e `'allow-write'` com `multiple: true` no `parseArgs` (`parseArgvOrThrow`, linhas ~149-150). Com isso, `values['allow-read']` / `values['allow-write']` passam de `string | undefined` a `string[] | undefined` (um array com uma entrada por ocorrência da flag).
  - Ajustar os tipos locais em `CliValues` (linhas ~33-34): `'allow-read'?: string` / `'allow-write'?: string` passam a `string[]`.
  - Em `resolveConfigOverride` (lógica de `readRoot`/`writeRoot`, linhas ~77-100), substituir as strings singulares por listas:
    - **Env**: quando `ATLAS_ALLOW_READ`/`ATLAS_ALLOW_WRITE` estão definidas, fazer `split(path.delimiter)` (`node:path`), aplicar `trim()` em cada segmento e **filtrar** os vazios.
    - **Flag**: quando `values['allow-read']`/`values['allow-write']` estão presentes (array), aplicar `trim()` e **filtrar** vazios.
    - **Substituição, não merge**: se a flag está presente (após filtragem, com ao menos uma entrada), sua lista é a lista final e a env é ignorada — reproduzindo a semântica atual `flags > env`.
    - **Colapso para vazio**: se, após filtrar, a lista de uma fonte fica vazia (ex.: `ATLAS_ALLOW_READ=""` ou `=":"`), tratar como **não fornecida** — não setar `readRoots`/`writeRoots` no override, deixando o core aplicar o default. Nunca empurrar `[]` para `readRoots` (estouraria a validação de "lista não vazia"), nem `[]` de lixo para `writeRoots`.
    - Só montar `override.permissions` quando ao menos uma das listas (read/write) tiver conteúdo após a filtragem — preservando o comportamento atual de não incluir `permissions` no override quando nada foi fornecido.
- **`apps/cli/src/run.ts`** — texto de `--help` (`HELP_TEXT`, linhas ~43-44): as descrições de `--allow-read`/`--allow-write` passam a indicar que a flag é **repetível** (uma raiz por ocorrência) e que a env aceita lista separada pelo delimitador de caminho do SO.
- **`apps/cli/tests/input-gateway.test.ts`** — atualizar os testes existentes de raiz única (linhas ~92-133) para a nova forma e **adicionar** os casos novos (ver Estratégia de Testes). Os testes atuais que esperam `readRoots: ['/env/dir']` a partir de uma env com uma só raiz continuam válidos como caso de "uma raiz" e permanecem verdes.
- **Documentação**: atualizar `apps/cli/CLAUDE.md` (nota sobre flag repetível / env por delimitador), `CLAUDE.md` raiz (estado/invariantes, sucintamente), `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`; marcar o item 1.1 "múltiplas raízes" como entregue no `Roadmap.md`; registrar lições em `docs/implementation/LESSONS_LEARNED.md`.

---

# Fora do Escopo

Esta seção é obrigatória e delimita o que fica de fora — especialmente o adjacente tentador.

- **Múltiplas raízes por invocação individual de Tool** — **já suportado** (o Permission Service avalia arrays via `within`). Não é o objeto desta SPEC e nada muda ali.
- **`@atlas/permissions`, `@atlas/contracts`, `@atlas/runtime`, `@atlas/tools`, `@atlas/cognitive`** — **zero linha**. A decisão de contenção, os contratos, o Runtime e as Tools já operam sobre listas; nada a alterar.
- **`packages/core/src/config/load-config.ts`** — **não alterar**. A validação existente (rejeita `readRoots` vazio; rejeita caminhos em branco) permanece como **rede de segurança**; o Gateway não deve empurrar lixo até ela, mas a validação não muda.
- **`apps/cli/src/commands/status.ts`** — **sem alteração necessária**, já suporta múltiplas raízes (`join(', ')` + tratamento de `writeRoots` vazio). Registrado aqui explicitamente como "já suportado".
- **Remoção seletiva de uma raiz por flag** (ex.: um `--deny-read`) — fora.
- **Globs / wildcards em raízes** (ex.: `~/proj/*`) — fora; as raízes seguem caminhos literais.
- **Config por arquivo** (o slot `arquivo` do ADR-0006, reservado e ainda não implementado) — fora; esta SPEC mexe só em `flags` e `env`.
- **Expansão de `~` / variáveis** no Gateway — fora; o comportamento atual de repasse de caminhos crus ao core é preservado (o core valida; a resolução de `~` não é introduzida aqui).
- **Deduplicação de raízes repetidas** (ex.: mesma raiz passada duas vezes) — fora; não é necessário para o objetivo e `within` já é idempotente sobre duplicatas.
- **Windows** além do que `path.delimiter` já entrega automaticamente (`;`) — nenhum tratamento especial adicional; consistente com a matriz de CI só-Linux (SPEC-0016).

---

# Pré-requisitos

- [SPEC-0003](SPEC-0003-cli-foundation.md) (Input Gateway; precedência `flags > env`; parsing via `node:util`) — **Done** (confirmado; a plataforma descreve `atlas status` e a precedência como já operantes).
- [SPEC-0011](SPEC-0011-permission-service-fs-read.md) (`readRoots` / Permission Service) — **Done** (confirmado).
- [SPEC-0012](SPEC-0012-write-file-tool.md) (`writeRoots`) — **Done** (confirmado).

Nenhum outro pré-requisito: o núcleo já opera sobre listas desde essas SPECs.

---

# Critérios de Aceitação

Cada item é verificável mecanicamente (o `spec-validator` os checa).

- **Flag repetida (read)**: `normalize(['status', '--allow-read', 'a', '--allow-read', 'b'], {})` produz `configOverride.permissions.readRoots` igual a `['a', 'b']` (ordem preservada).
- **Flag repetida (write)**: idem para `--allow-write` → `writeRoots: ['a', 'b']`.
- **Env por `path.delimiter` (read)**: com `ATLAS_ALLOW_READ` = `` `a${path.delimiter}b` ``, `readRoots` = `['a', 'b']`.
- **Env por `path.delimiter` (write)**: idem para `ATLAS_ALLOW_WRITE` → `writeRoots: ['a', 'b']`.
- **Substituição, não merge**: com `--allow-read x` presente E `ATLAS_ALLOW_READ=y:z` na env, `readRoots` = `['x']` (a flag vence; a env é ignorada por inteiro). Idem para write.
- **Segmentos vazios/espaços filtrados**: `ATLAS_ALLOW_READ` = `` `a${path.delimiter}` `` → `['a']`; `ATLAS_ALLOW_READ` = `` ` a ${path.delimiter} b ` `` → `['a', 'b']` (trim aplicado). Mesma filtragem para a flag repetível e para write.
- **Colapso para vazio cai no default**: `ATLAS_ALLOW_READ=''` e `ATLAS_ALLOW_READ` = `path.delimiter` (só o delimitador) **não** setam `readRoots` — `configOverride.permissions` não é montado por essa fonte (o core aplica o default). Idem para write.
- **Retrocompatibilidade de raiz única**: uma única `--allow-read /flag/dir` (ou `ATLAS_ALLOW_READ=/env/dir`) continua produzindo `readRoots: ['/flag/dir']` (`['/env/dir']`) — os testes existentes de raiz única permanecem verdes.
- **`--help` atualizado**: o `HELP_TEXT` descreve `--allow-read`/`--allow-write` como repetíveis e menciona a env por delimitador de caminho.
- **Ponta a ponta via `loadConfig`**: um override com múltiplas raízes (ex.: `{ permissions: { readRoots: ['/a', '/b'], writeRoots: ['/c', '/d'] } }`) passa pela validação do core sem `issues` e chega intacto à config resolvida.
- **Nada fora da CLI mudou**: sem diff em `packages/permissions`, `packages/contracts`, `packages/runtime`, `packages/tools`, `packages/cognitive`, `packages/core` — verificável no diff.
- **Tipos**: `values['allow-read']`/`values['allow-write']` são `string[] | undefined` (efeito de `multiple: true`); `CliValues` reflete isso; `pnpm typecheck` verde.
- **Suíte cresce**: a contagem total de testes sobe de 267 para aproximadamente 277 (número exato não é trava — ~10 casos novos entre read/write/borda/e2e).
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.

---

# Arquivos Esperados

```text
apps/cli/src/gateway/
  input-gateway.ts     (editado: multiple:true nas flags allow-read/allow-write;
                        CliValues['allow-read'|'allow-write'] → string[]; split de env
                        por path.delimiter; trim + filtragem de vazios; colapso-para-vazio
                        cai no default; substituição flag>env sobre listas)

apps/cli/src/
  run.ts               (editado: HELP_TEXT — descrições de --allow-read/--allow-write
                        como flags repetíveis + env por delimitador)

apps/cli/tests/
  input-gateway.test.ts  (editado: casos de raiz única migrados; casos novos de
                          flag repetida, env por delimitador, substituição, borda de
                          filtragem, colapso-para-vazio, para read e write)
  run.test.ts (ou similar)  (verificar: se algum snapshot/asserção do HELP_TEXT precisa
                          atualização)

docs/04-engineering/Roadmap.md        (editado: item 1.1 "múltiplas raízes" → entregue)
CLAUDE.md (raiz)                        (editado: estado/invariantes, sucinto)
apps/cli/CLAUDE.md                      (editado: nota sobre flag repetível / env por delimitador)
docs/05-context/NEXT_CONTEXT.md         (editado)
docs/05-context/CURRENT_SPRINT.md       (editado)
docs/implementation/LESSONS_LEARNED.md  (editado)
```

Lista é expectativa; o implementador confirma se o teste de `run` (HELP_TEXT) precisa ajuste e o layout exato dos casos novos.

---

# Componentes Impactados

- **CLI (`@atlas/cli`)** — Input Gateway (parsing de `--allow-read`/`--allow-write` e `ATLAS_ALLOW_READ`/`ATLAS_ALLOW_WRITE`); `HELP_TEXT`.
- **Permission Service (`@atlas/permissions`)** — **inalterado** (já avalia listas via `within`).
- **Core (`@atlas/core`)** — **inalterado** (validação já cobre listas; é a rede de segurança).
- **Contracts / Runtime / Tools / Cognitive / Memory / Persona / Context / Model Gateway** — **inalterados**.
- **`atlas status`** — **inalterado** (já exibe múltiplas raízes).

---

# Interfaces Necessárias

Nenhuma interface pública nova. As mudanças são:

- Tipo local `CliValues` em `input-gateway.ts`: `'allow-read'?: string` / `'allow-write'?: string` → `string[]`. Interno ao package; não sobe a `@atlas/contracts`.
- `ParsedInput` / `AtlasConfigOverride` **não** mudam de forma — `override.permissions.readRoots`/`writeRoots` já são `readonly string[]`.

---

# Fluxo Esperado

```text
argv + env
   ↓
parseArgs (allow-read/allow-write com multiple:true)
   → values['allow-read']: string[] | undefined
   ↓
resolveConfigOverride:
   env  ATLAS_ALLOW_READ  → split(path.delimiter) → trim → filtra vazios → lista_env
   flag values['allow-read'] → trim → filtra vazios → lista_flag
   escolha: lista_flag (se não vazia) senão lista_env (se não vazia) senão (nada)
   ↓
   se alguma lista tem conteúdo → override.permissions = { readRoots?, writeRoots? }
   se ambas colapsam a vazio    → override sem permissions (core aplica default)
   ↓
createAtlas({ config: override }) → loadConfig valida (rede de segurança) → config resolvida
   ↓
atlas status → readRoots.join(', ')   (já suportado, sem mudança)
```

---

# Estratégia de Implementação

Sugestão de ordem (TDD):

1. **Testes primeiro**: escrever/atualizar os casos em `input-gateway.test.ts` (flag repetida, env por delimitador, substituição flag>env, filtragem de vazios, colapso-para-vazio, raiz única retrocompatível) para read e write.
2. **Parsing**: em `parseArgvOrThrow`, adicionar `multiple: true` a `allow-read`/`allow-write`; ajustar `CliValues`.
3. **Resolução**: reescrever o bloco `readRoot`/`writeRoot` de `resolveConfigOverride` para operar sobre listas — helper interno que recebe (valor da env, valor da flag) e devolve a lista final ou `undefined` (aplicando split/trim/filtro e a regra de substituição/colapso). Montar `override.permissions` só quando houver conteúdo.
4. **Help**: atualizar `HELP_TEXT` em `run.ts`; ajustar teste do help se necessário.
5. **E2E leve**: um teste que passa um override multi-raiz por `loadConfig` e confirma que passa a validação intacto.
6. **Verificação**: `lint`/`format:check`/`typecheck`/`test`.
7. **Documentação**: `apps/cli/CLAUDE.md`, `CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md` (item 1.1), `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

Casos mínimos (todos em `apps/cli/tests/input-gateway.test.ts`, sem IO real):

- Flag repetida: `--allow-read a --allow-read b` → `readRoots: ['a', 'b']`.
- Env com `path.delimiter`: `ATLAS_ALLOW_READ` = `` `a${path.delimiter}b` `` → `['a', 'b']`.
- Flag presente + env presente → flag vence, env ignorada (substituição, não merge).
- Segmentos vazios/espaços filtrados: `` `a${path.delimiter}` `` → `['a']`; `` ` a ${path.delimiter} b ` `` → `['a', 'b']`.
- Env que colapsa para vazio (`''`, só o delimitador) → não seta `permissions.readRoots`; cai no default.
- Mesma bateria para `--allow-write` / `ATLAS_ALLOW_WRITE`.
- Retrocompatibilidade: raiz única por flag e por env continua `['x']` / `['y']`.
- Ponta a ponta via `loadConfig`: override com múltiplas raízes de read e write passa a validação (sem `issues`) e chega intacto.
- (Verificar) asserção de `HELP_TEXT` que mencione as flags, se existir.

Meta aproximada: suíte de 267 → ~277 testes (não travar no número exato).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada: `apps/cli/CLAUDE.md`, `CLAUDE.md` raiz, `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`, item 1.1 do `Roadmap.md` marcado como entregue;
- arquitetura preservada: mudança contida em `@atlas/cli`; Permission Service segue a única autoridade de contenção (inalterado); precedência `flags > env > defaults` do ADR-0006 intacta; validação exclusiva no core intacta;
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- **Não** tocar `packages/permissions`, `packages/contracts`, `packages/runtime`, `packages/tools`, `packages/cognitive`.
- **Não** alterar `packages/core/src/config/load-config.ts` — a validação é rede de segurança e permanece; o Gateway apenas evita empurrar lixo até ela.
- **Não** alterar `apps/cli/src/commands/status.ts` — já suporta múltiplas raízes.
- **Não** introduzir merge/união entre flag e env: a precedência é **substituição** por fonte de maior precedência (ADR-0006).
- **Não** empurrar lista vazia para `readRoots` (estouraria a validação); colapso-para-vazio = "não fornecida" → default.
- **Não** introduzir globs, wildcards, expansão de `~`, config por arquivo, nem deduplicação.
- Parsing continua via `node:util` (`parseArgs`) — sem parser próprio; `path.delimiter` de `node:path` para o split da env.

---

# Observações

- **Por que é barato**: o achado central é que o núcleo (Permission Service, core, contracts, runtime, tools, status) **já opera sobre listas**. O afunilamento estava só na coleta de configuração da CLI. Fechar o gate é remover esse afunilamento — não redesenhar nada.
- **Idiomático**: `multiple: true` é o mecanismo nativo do `parseArgs` para flags repetíveis, e `path.delimiter` é a mesma convenção do `$PATH` que o usuário já conhece — sem inventar sintaxe.
- **Fronteira de `writeRoots`**: diferente de `readRoots` (default `[cwd]`, não pode ser vazio), `writeRoots` tem default `[]` (não escreve sem opt-in). O colapso-para-vazio de uma env/flag de write deve, portanto, cair no default `[]` do core — ou seja, "não fornecida" é o comportamento correto, sem opt-in acidental.

---

# Checklist para IA

Antes de implementar:

- ler o ADR-0006 (precedência; validação no core), o item 1.1 do Roadmap, e `apps/cli/src/gateway/input-gateway.ts` inteiro (o bloco `readRoot`/`writeRoot`, linhas ~77-100, e as declarações de flags, linhas ~149-150);
- confirmar que os pré-requisitos (SPEC-0003/0011/0012) estão `Done`;
- compreender o objetivo: expor múltiplas raízes na borda da CLI, sem tocar o núcleo.

Durante a implementação:

- TDD; mudanças contidas em `@atlas/cli`;
- substituição (não merge) entre flag e env; colapso-para-vazio cai no default;
- não vazar escopo (nada de permissions/contracts/runtime/tools/core/cognitive, globs, `~`, arquivo).

Após a implementação:

- rodar `lint`/`format:check`/`typecheck`/`test`;
- atualizar documentação (CLI + raiz + contexto + Roadmap);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, o usuário configura múltiplas raízes de leitura e de escrita numa única invocação do `atlas` — repetindo `--allow-read`/`--allow-write` ou listando caminhos separados por `path.delimiter` em `ATLAS_ALLOW_READ`/`ATLAS_ALLOW_WRITE` — e essas listas chegam intactas ao Permission Service, que já as avalia. A precedência `flags > env > defaults` permanece (a fonte de maior precedência substitui a de menor, sem merge); segmentos vazios são filtrados e uma fonte que colapsa a vazio cai no default do core. `atlas status` exibe as múltiplas raízes sem mudança. Nenhum package além de `@atlas/cli` foi tocado. Com este gate e o TOCTOU (SPEC-0017) entregues, o critério de conclusão da Fase 1 sobre limitações de segurança do item 1.1 fica satisfeito.

---

# Pontos em aberto (a resolver na aprovação `Draft → Ready`)

- **Prioridade** — proposta **Medium** (gate pequeno restante do item 1.1, fecha critério da Fase 1, mas mudança de borda barata e sem risco de segurança, diferente de 0015/0017 que eram `High`). **Requer confirmação humana** antes de `Draft` virar `Ready`.

Todos os demais campos rastreiam fontes existentes: o **desenho** (flag repetível via `multiple: true`; env por `path.delimiter`; precedência por substituição; filtragem e colapso-para-vazio) vem inteiro do brainstorming já fechado com o humano no fio principal; o **escopo/fora-de-escopo** rastreia o achado de código (só a CLL afunila) e o ADR-0006 (precedência, validação no core); a **motivação** vem do Roadmap (gate 1.1) e do PRD/Module Catalog (segurança / Permission Service); os **símbolos e linhas** (`input-gateway.ts` ~33-34/~77-100/~149-150, `run.ts` HELP_TEXT ~43-44, `status.ts`, `load-config.ts`, `within`/`evaluate`/`isContained`) foram lidos do código atual; os **pré-requisitos** foram confirmados `Done`.
