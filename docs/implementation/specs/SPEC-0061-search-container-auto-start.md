# SPEC-0061 — Auto-start do container de busca (CLI + desktop)

> **Project Atlas — Implementation Specification**

Template: 1.2

---

# Informações Gerais

**ID**

SPEC-0061

---

**Título**

Auto-start do container Docker do provedor de busca sob opt-in explícito e nominal: `ProcessPort`/`createDependencyManager` (`@atlas/core`) estendidos de forma aditiva com três operações Docker nomeadas — só `start` de um container **já existente**, nunca `run`/`create`/`pull` —, disparados uma vez por processo em `apps/cli` e uma vez por sessão de app em `apps/desktop`.

---

**Status**

- [x] Draft
- [x] Ready
- [x] In Progress
- [x] Review
- [x] Done

---

**Prioridade**

- [ ] Critical
- [ ] High
- [x] Medium
- [ ] Low

Justificativa em **D17**.

---

**Perfil**

- [ ] micro
- [x] completo

Justificativa completa em **D1**.

---

**Item do Roadmap**

**Exceção consciente registrada**, exatamente como na [SPEC-0060](SPEC-0060-ollama-auto-start.md). Nenhum item de `docs/04-engineering/Roadmap.md` cobre "auto-gerência de processo externo"; a capacidade nasceu do pedido do usuário de 2026-08-22 e foi desenhada pelo [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md) (`Accepted`), que nomeia esta SPEC explicitamente como sua **3ª SPEC candidata** ("Auto-start do container SearXNG, CLI e desktop").

Item mais próximo por afinidade: **Fase 1 — 1.4 Capacidades de Plataforma** (a dependência gerenciada é a do provedor de busca da Tool `web_search`, SPEC-0057). Esta SPEC **não fecha** o item 1.4 nem qualquer outro item do Roadmap — resta a execução de comandos sob o Permission Service (`ADR primeiro`).

---

# Objetivo

Quando esta SPEC estiver concluída, o Atlas deve ser capaz de **garantir que o container Docker do provedor de busca esteja ligado** antes de o usuário precisar dele, sem que ninguém rode `docker start <container>` à mão — desde que o usuário tenha ligado essa automação **explicitamente** e **nomeado** o container.

Concretamente, devem existir:

1. Em `@atlas/core`, a extensão **aditiva** do `ProcessPort` da SPEC-0060 com **três operações Docker nomeadas e fixas** (`inspectSearchContainer`/`startSearchContainer`/`stopSearchContainer`), e a extensão **aditiva** de `createDependencyManager` para cuidar das **duas** dependências no mesmo `ensure(config)`/`release()`, sem alterar o comportamento já entregue para o Ollama.
2. Em `@atlas/contracts`, o campo `dependencies.autoStartSearchContainer: string` (default `''` = desligado, fail-closed) ao lado do `autoStartOllama` já existente.
3. Em `apps/cli`, a flag `--auto-start-search-container <nome>` e a variável `ATLAS_AUTO_START_SEARCH_CONTAINER`, avisos pinados em `stderr` e uma linha nova em `atlas status`.
4. Em `apps/desktop`, a leitura da mesma variável no `ensureExternalDependencies` já existente (`core-bridge.ts`), com log pinado no main process e desligamento, em `before-quit`, só do container que **aquela sessão** ligou.

Em qualquer caminho de falha, o CLI e a janela **abrem do mesmo jeito**; a Tool `web_search` degrada exatamente como degradava antes desta SPEC existir.

---

# Motivação

O usuário pediu, em 2026-08-22, para não precisar mais subir manualmente o Ollama **e um container Docker do SearXNG** antes de cada sessão com o Atlas. A Tool `web_search` ([SPEC-0057](SPEC-0057-web-search-tool.md)) fala com o endpoint de `tools.searchUrl` pelo `searxngSearchPort`; com o container desligado, o passo falha exatamente como falha hoje — o atrito é operacional e repetitivo.

O [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md) (`Accepted`) decidiu **toda a arquitetura** desta capacidade — dono (`createDependencyManager`, nunca o `Lifecycle` de `createAtlas`), granularidade (uma vez por app), simetria (só o desktop desliga o que subiu), modo de falha (degrada, nunca bloqueia o boot), exclusão explícita do Permission Service e, na cláusula (h), o limite do Docker (só `start` de container já existente). A [SPEC-0060](SPEC-0060-ollama-auto-start.md) (`Done`) entregou a **2ª** SPEC candidata e, com ela, a unidade, a porta e o formato de desfecho que esta fatia estende de forma aditiva. Resta a **3ª** — esta.

No desktop, esta automação só ganha efeito prático porque a [SPEC-0059](SPEC-0059-desktop-network-search-gui.md) (`Done`) entregou o painel de rede/busca: o host do container continua precisando de autorização explícita em `netRoots` para a `web_search` de fato usá-lo. Isso é comportamento **já existente** e **não muda** aqui (D8).

Rastreabilidade ao PRD (`docs/02-product/ProductRequirementsDocument.md`):

- **Assistência** — *"O sistema deve realizar pesquisas."* A dependência gerenciada aqui é exatamente a que sustenta esse requisito no modo local.
- **Execução** — *"O sistema deve automatizar atividades repetitivas."*
- **Critérios de Qualidade** — *"simplicidade para o usuário"* e *"transparência"* (opt-in, visível em `atlas status`, avisa quando falha).
- **Requisitos Não Funcionais** — *"O sistema deverá favorecer reutilização de componentes"* (a unidade, a porta e o formato de desfecho da SPEC-0060 são estendidos, não duplicados).

---

# Referências

- [ADR-0027 — Auto-gerência de processos externos](../../06-adr/ADR-0027-external-process-lifecycle-management.md) (`Accepted`) — **fonte primária**; cláusulas (a)–(h), com destaque para (b) superfície não-genérica, (c) `ProcessPort`/`docker inspect`, (e) simetria de desligamento e (h) só `start` de container existente.
- [SPEC-0060](SPEC-0060-ollama-auto-start.md) (`Done`) — **molde de forma direto**: `createDependencyManager`/`ProcessPort`/`DependencyOutcome`/`resolveDependencyConfig`/`parseBooleanSetting`, textos pinados, linha de `atlas status`, disparo único por app.
- [SPEC-0057](SPEC-0057-web-search-tool.md) (`Done`) — `web_search`, `tools.searchUrl`, provedor SearXNG provisionado **pelo usuário** (D6/D8 preservadas).
- [SPEC-0059](SPEC-0059-desktop-network-search-gui.md) (`Done`) — painel de rede/busca do desktop; é o que dá efeito prático a esta fatia na GUI.
- [ADR-0026 — Network Access Gate](../../06-adr/ADR-0026-network-access-gate.md) — **não reaberto**: nenhuma autorização de `netRoots` é concedida por esta SPEC (D8).
- [ADR-0013 — Permission Service como portão de execução](../../06-adr/ADR-0013-permission-service-execution-gate.md) — **não reaberto** (ADR-0027(a)).
- [ADR-0006 — Precedência de fontes de configuração](../../06-adr/ADR-0006-config-source-precedence.md) — `flags > env > defaults`; validação no core, borda repassa cru.
- [ADR-0004 — Composição manual](../../06-adr/ADR-0004-manual-composition.md) / [ADR-0003 — Composition root](../../06-adr/ADR-0003-core-composition-root.md).
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — **Lifecycle Manager** (`packages/core`): "verificação de dependências", "ativação de componentes", "desligamento seguro"; Configuration Service não pode "alterar configurações silenciosamente".
- [PRD](../../02-product/ProductRequirementsDocument.md) — Assistência (pesquisas), Execução (automatizar repetição), Critérios de Qualidade.
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigo 5 (Tools/adaptadores sem decisão), Artigo 7 (transparência), Artigo 11 (nada persistido).
- [SPEC-0040](SPEC-0040-desktop-piper-neural-tts.md) / [SPEC-0046](SPEC-0046-desktop-voice-input-stt.md) (`Done`) — molde de "contrato de invocação de binário externo pinado como dado da SPEC" e de `spawn` por argv array, nunca `shell: true`.
- [SPEC-0056](SPEC-0056-project-structure-tool.md) (`Done`) — molde de classificação de desfecho por `reason` de conjunto fechado, nunca stderr cru de processo externo.

---

# Escopo

## 1. `@atlas/contracts` — campo de opt-in nominal

1.1. `AtlasConfig.dependencies` ganha `readonly autoStartSearchContainer: string` — **obrigatório** na config resolvida (paridade com `autoStartOllama`, SPEC-0060/D24), default `''` (desligado, fail-closed).

1.2. `AtlasConfigOverride.dependencies` ganha `autoStartSearchContainer?: string`.

1.3. Teste de tipo negativo (`@ts-expect-error`) em `packages/contracts/tests/config.test.ts`, molde exato do que a SPEC-0060 fez para `dependencies.autoStartOllama`.

## 2. `@atlas/core` — config

2.1. `packages/core/src/config/defaults.ts`: `dependencies.autoStartSearchContainer: ''`.

2.2. `packages/core/src/config/load-config.ts`: merge (`override.dependencies?.autoStartSearchContainer ?? defaults...`) e **validação sob a regra única de normalização do item 2.3** — o valor é `trim`ado **antes** de qualquer julgamento; `''` após o `trim` ⇒ desligado, config resolvida guarda `''`, **sem lançar**; caso contrário o valor trimado precisa satisfazer `isValidContainerName`, e a config resolvida guarda o valor **trimado** (nunca o cru). Valor trimado que não satisfaça o predicado (ou valor não-string) ⇒ `InvalidConfigError` com issue citando `dependencies.autoStartSearchContainer`.

2.3. `packages/core/src/config/dependency-config.ts` (mod):
   - **Regra única de normalização (D6)**: em **todo** consumidor — `loadConfig` (item 2.2), `resolveDependencyConfig`, `parseContainerNameSetting` e, por consequência, as duas bordas — o nome é `trim`ado **antes** de `isValidContainerName`, e o valor efetivo que segue para a config resolvida, para o argv e para as mensagens é sempre o **trimado**. Não existe ponto que valide sem `trim`: `'  searxng  '` é aceito e vale `'searxng'` em toda parte, e `'   '` é sempre "desligado", nunca erro;
   - `isValidContainerName(value: string): boolean` — predicado **puro**, origem única da regra de **formato**: `/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/` (charset de nome de container do próprio Docker). Recebe sempre um valor já trimado. Consumido por `loadConfig` (para rejeitar em voz alta), pelas duas bordas (para reportar valor inválido) e pelo resolvedor (para descartar fail-closed);
   - `parseContainerNameSetting(raw: string | undefined): { kind: 'unset' } | { kind: 'value'; value: string } | { kind: 'invalid'; received: string }` — coerção **pura** de string de ambiente/flag, irmã de `parseBooleanSetting`, **origem única** consumida pelas duas bordas (D5). `undefined`/`''`/só-espaços ⇒ `'unset'`; valor que passa em `isValidContainerName` após `trim` ⇒ `'value'`; qualquer outro ⇒ `'invalid'` com o **valor cru**;
   - `DependencyConfig` ganha `readonly autoStartSearchContainer: string` (mesmo nome do campo de config — nenhuma tradução de nome entre camadas);
   - `resolveDependencyConfig` passa a resolvê-lo pela mesma precedência, **normalizando fail-closed**: valor ausente ou que não satisfaça `isValidContainerName` (após `trim`) resolve para `''` (desligado). Continua **puro, sem IO e sem lançar** (D6).

## 3. `@atlas/core` — `ProcessPort` estendido (aditivo)

3.1. `packages/core/src/dependencies/process-port.ts` (mod) — três operações **nomeadas e fixas** somadas às três já existentes (ADR-0027(b)/(c)/(h)); nenhum método genérico de execução de comando:

```ts
export type SearchContainerState =
  | 'running'      // `docker inspect` saiu 0 e o container está em execução
  | 'stopped'      // `docker inspect` saiu 0 e o container existe, parado
  | 'unavailable'  // o binário `docker` não pôde ser executado (ENOENT/falha de spawn)
  | 'unknown';     // `docker` executou e saiu != 0 — container inexistente OU daemon inacessível

export type SearchContainerStartOutcome =
  | { readonly started: true }
  | {
      readonly started: false;
      readonly reason: 'docker-unavailable' | 'container-unknown' | 'start-failed';
    };

export interface ProcessPort {
  // … SPEC-0060, inalteradas:
  isOllamaRunning(baseUrl: string): Promise<boolean>;
  startOllama(): Promise<OllamaStartOutcome>;
  stopOllama(): Promise<void>;
  // SPEC-0061 (aditivas):
  inspectSearchContainer(containerName: string): Promise<SearchContainerState>;
  startSearchContainer(containerName: string): Promise<SearchContainerStartOutcome>;
  stopSearchContainer(containerName: string): Promise<void>;
}
```

   As três novas **nunca lançam**. `'timeout'` **não** é um desfecho da porta — é decisão temporal do manager (item 4.2, molde da SPEC-0060/D12).

3.2. `packages/core/src/dependencies/node-process-port.ts` (mod) — adaptador real, com o **contrato de invocação pinado como dado desta SPEC** (D9/D10):
   - `NodeProcessPortDeps` ganha `spawn?: typeof spawn` (aditivo, default o real) — costura de teste sancionada pela SPEC-0060/CA 14 (que já previa "teste com `spawn` injetável, se a implementação optar por injetá-lo"). Os caminhos do Ollama passam a usar a mesma costura, **sem mudança de comportamento**;
   - `inspectSearchContainer`: `spawn('docker', ['inspect', '--type', 'container', '--format', '{{.State.Running}}', containerName], { stdio: ['ignore', 'pipe', 'ignore'] })` — `--type container` é **obrigatório**: sem ele, `docker inspect` resolve o nome por tipo automático (container → imagem → volume → rede) e poderia reportar um objeto que **não é** o container pretendido (D9). Classificação **exaustiva e sem parse de stderr**: erro de spawn `ENOENT` ou qualquer outra falha de spawn ⇒ `'unavailable'`; saída `0` com stdout `trim()` igual a `'true'` ⇒ `'running'`; saída `0` com stdout `trim()` igual a `'false'` ⇒ `'stopped'`; saída `0` com qualquer outro stdout ⇒ `'unknown'`; saída diferente de `0` ⇒ `'unknown'`;
   - `startSearchContainer`: `spawn('docker', ['start', containerName], { stdio: 'ignore' })`. `ENOENT`/falha de spawn ⇒ `{ started: false, reason: 'docker-unavailable' }`; saída `0` ⇒ `{ started: true }`; saída diferente de `0` ⇒ `{ started: false, reason: 'start-failed' }`. **Nunca** `docker run`, `create`, `pull`, `exec`, `rm` ou `compose` (ADR-0027(h));
   - `startSearchContainer` **não** classifica `'container-unknown'` por conta própria (o exit code de `docker start` não distingue "não existe" de "falhou ao ligar" sem parse de stderr); essa `reason` é produzida pelo manager a partir do `inspect` (item 4.2). O membro existe no tipo para que uma implementação futura possa classificá-lo sem mudança de contrato;
   - `stopSearchContainer`: `spawn('docker', ['stop', containerName], { stdio: 'ignore' })`; qualquer desfecho (inclusive falha) é ignorado — **nunca lança**. **Nunca** `docker rm`/`kill -9`/remoção de volume;
   - nenhum `shell: true`, nenhuma interpolação de string em argv, nenhum caminho absoluto adivinhado para o binário.

## 4. `@atlas/core` — Dependency Manager estendido (aditivo)

4.1. `packages/core/src/dependencies/dependency-manager.ts` (mod):

```ts
export type SearchContainerFailureReason =
  | 'docker-unavailable'
  | 'container-unknown'
  | 'start-failed'
  | 'timeout';

export type DependencyOutcome =
  // … as quatro variantes `dependency: 'ollama'` da SPEC-0060, inalteradas …
  | { readonly dependency: 'search-container'; readonly status: 'disabled' }
  | {
      readonly dependency: 'search-container';
      readonly status: 'already-running';
      readonly container: string;
    }
  | {
      readonly dependency: 'search-container';
      readonly status: 'started';
      readonly container: string;
    }
  | {
      readonly dependency: 'search-container';
      readonly status: 'failed';
      readonly reason: SearchContainerFailureReason;
      readonly container: string;
    };
```

   `DependencyReport`, `DependencyManager`, `createDependencyManager` mantêm **exatamente** a assinatura da SPEC-0060.

4.2. Comportamento normativo de `ensure(config)`, somado ao já existente:
   - **Reestruturação obrigatória e consciente de `runEnsure`** (não é opcional): hoje cada ramo do Ollama faz *early return* de um `DependencyReport` inteiro (`return failed('spawn-failed')`, `return { outcomes: [{ … 'already-running' }] }`). Para o relatório carregar sempre dois desfechos, o ramo do Ollama passa a **produzir um `DependencyOutcome`** (helper interno próprio, ex.: `ensureOllama(config): Promise<DependencyOutcome>`), e `runEnsure` compõe os dois na ordem pinada. O helper privado `failed(reason)` deixa de devolver `DependencyReport` e passa a devolver o `DependencyOutcome` de `'ollama'`. **Os valores de desfecho e a sequência de chamadas à porta no caminho do Ollama não mudam** (Restrição 11 — garantia sobre comportamento, não sobre estrutura);
   - `report.outcomes` passa a ter **sempre exatamente dois** elementos, em **ordem pinada**: o desfecho de `'ollama'` primeiro, o de `'search-container'` depois (D4);
   - as duas dependências são tratadas **sequencialmente e de forma independente**: nenhum desfecho do Ollama altera o caminho do container, e vice-versa (D4);
   - `config.autoStartSearchContainer === ''` ⇒ `{ dependency: 'search-container', status: 'disabled' }` **sem tocar a porta** (nenhum `docker inspect`, nenhum spawn);
   - nome presente ⇒ `inspectSearchContainer(nome)`:
     - `'running'` ⇒ `'already-running'`, **sem start**;
     - `'unavailable'` ⇒ `'failed'` com `reason: 'docker-unavailable'`, **sem start**;
     - `'unknown'` ⇒ `'failed'` com `reason: 'container-unknown'`, **sem start** — o Atlas **nunca** cria o container (ADR-0027(h));
     - `'stopped'` ⇒ `startSearchContainer(nome)`;
   - `started: false` ⇒ `'failed'` com a `reason` da porta, **sem** registro de posse;
   - `started: true` ⇒ **registro de posse imediato** (o nome do container guardado num único campo privado do manager), **antes** de qualquer espera — molde exato da SPEC-0060/D23: posse é qualidade da **autoria do start**, não da prontidão;
   - em seguida, **confirmação por polling**, ordem pinada: repetir **até 20 vezes** o par ordenado `await sleep(250)` → `await inspectSearchContainer(nome)`; `'running'` em qualquer iteração ⇒ `'started'` (encerra o laço imediatamente); 20 iterações sem `'running'` ⇒ `'failed'` com `reason: 'timeout'`, **com a posse mantida** (D11);
   - **nunca lança**: qualquer rejeição vinda da porta é capturada e vira `'failed'` com `reason: 'start-failed'`; se ocorrer **depois** de um `startSearchContainer` que devolveu `started: true`, a posse é **preservada**;
   - a memoização da 1ª chamada (SPEC-0060/D18) passa a cobrir as duas dependências juntas — segue **uma** promessa por instância.

4.3. Comportamento normativo de `release()`, somado ao já existente:
   - chama `stopSearchContainer(nome)` **exatamente quando** esta instância registrou posse do container — incluindo o desfecho `'failed'`/`reason: 'timeout'` (SPEC-0060/D23);
   - sem posse (`'disabled'`, `'already-running'`, demais `'failed'`) ⇒ no-op, **sem tocar a porta**;
   - as duas dependências são liberadas **na mesma ordem de `ensure`** (Ollama primeiro), cada uma com captura própria: a falha de uma nunca impede a outra;
   - limpa posse e memoização; **nunca lança**; chamadas repetidas não repetem os `stop*`.

4.4. `packages/core/src/index.ts`: exporta os tipos novos (`SearchContainerState`, `SearchContainerStartOutcome`, `SearchContainerFailureReason`) e `isValidContainerName`/`parseContainerNameSetting`, ao lado dos já exportados. **`createAtlas` sai sem uma linha alterada** (ADR-0027(d)).

## 5. `apps/cli`

5.1. `src/gateway/input-gateway.ts`: flag `--auto-start-search-container <nome>` (tipo `string`, **não repetível** — é um alvo, não uma lista) e variável `ATLAS_AUTO_START_SEARCH_CONTAINER`, precedência `flag > env`, ambas coeridas pela **mesma** `parseContainerNameSetting`; `kind: 'invalid'` ⇒ `CliUsageError` citando a regra de formato; `kind: 'unset'` ⇒ o campo **não** é setado em `override.dependencies` (cai no default `''` do core). O objeto `override.dependencies` passa a poder carregar um, outro ou os dois campos.

5.2. `src/run.ts`: **nenhum ponto de disparo novo** — o `ensure` único da SPEC-0060/D7 já cobre as duas dependências. O laço de avisos passa a **narrowing por `outcome.dependency`** antes de formatar (correção obrigatória: sem isso, um desfecho `'started'` do container imprimiria o texto do Ollama). A CLI continua **nunca** chamando `release()` (ADR-0027(e)).

5.3. Avisos em `stderr` (`output.error`) com os textos pinados de **D12**, só nos desfechos `'started'`/`'failed'` do container; `'disabled'`/`'already-running'` seguem silenciosos.

5.4. `src/commands/status.ts`: `runStatus` ganha a linha `search container auto-start: …` logo **abaixo** da linha `ollama auto-start:`, com os **quatro** textos pinados de **D13**. A seleção do desfecho passa a ser por busca do `dependency` no relatório (não mais `outcomes[0]`), mantendo a função **total**.

5.5. `HELP_TEXT` documenta a flag e a env, com a nota de que o Atlas **nunca cria, baixa ou remove** containers — só liga um container já existente — e de que o host do endpoint de busca continua precisando de `--allow-net`.

## 6. `apps/desktop`

6.1. `src/core-bridge.ts`: `ensureExternalDependencies(env = process.env)` passa a ler também `env['ATLAS_AUTO_START_SEARCH_CONTAINER']` pela **mesma** `parseContainerNameSetting` e a repassá-lo em `resolveDependencyConfig({ dependencies: { autoStartOllama, autoStartSearchContainer } })`. `kind: 'invalid'` ⇒ tratado como **desligado** (fail-closed) mais **uma linha de `console.warn` pinada** (constante exportada `INVALID_SEARCH_CONTAINER_ENV_WARNING`), **nunca** uma exceção — mesma divergência deliberada da CLI já decidida na SPEC-0060/D25. `releaseExternalDependencies()` não muda de assinatura nem de contrato (já delega a `release()`).

6.2. `src/main.ts` (casca fina): o laço de log de `app.whenReady()` passa a **narrowing por `outcome.dependency`** e ganha os textos pinados de **D14** para o container; `before-quit` não muda (o `void releaseExternalDependencies()` já existente passa a derrubar também o container que a sessão ligou). **Nenhum canal IPC novo, nenhum diff no renderer.**

6.3. Superfície de transparência do desktop nesta fatia: **linha de log no main process** apenas (ADR-0027(f)); GUI fica fora (D15, residual nomeado, mesmo precedente da SPEC-0060/D15).

## 7. Testes

Conforme "Estratégia de Testes".

## 8. Documentação da própria SPEC

Nota de atualização no ADR-0027 registrando que a **3ª** SPEC candidata foi implementada por esta, com o contrato técnico delegado (nome do campo de config, flag/env, forma exata das três operações Docker, classificação de `docker inspect`, mensagens, linha de `atlas status`) — **sem alterar nenhuma cláusula (a)–(h)**.

   A nota registra também, de forma explícita, a **rastreabilidade de cada uma das três operações Docker à cláusula que a autoriza**, porque a leitura literal de (h) só nomeia `start`: `docker inspect` deriva de **(c)** (health-check pela porta injetável) mais **(h)** (escopo restrito ao container nomeado); `docker start` deriva de **(h)**; `docker stop` deriva de **(e)** (desligamento simétrico do que o Atlas subiu), **não** de (h). Nenhuma operação destrutiva (`rm`/`kill`/`compose down`) é autorizada por (e) — desligar não é destruir — nem por (h). Isto é **registro de rastreabilidade**, não emenda: nenhuma cláusula existente muda de texto ou de alcance.

---

# Fora do Escopo

- **Não** executar `docker run`, `create`, `pull`, `build`, `exec`, `rm`, `kill`, `compose` ou qualquer operação que não seja `inspect`/`start`/`stop` do container nomeado. Rastreabilidade por operação (D10, registrada na nota do ADR-0027): `inspect` ← (c)+(h), `start` ← (h), `stop` ← **(e)** (desligamento simétrico), e nada mais — nenhuma operação destrutiva cabe em (e) nem em (h). O usuário continua provisionando a instância do SearXNG (SPEC-0057/D6/D8 intactas).
- **Não** criar uma porta genérica (`run(command, args)`), `shell: true`, ou qualquer caminho de execução de comando arbitrário — ADR-0027(b); o item 1.4 do Roadmap ("execução de comandos sob o Permission Service") não é consumido nem reaberto.
- **Não** tocar `@atlas/permissions`, `evaluate`, `ResourceType`/`ResourceRef`, `isContained`, `netRoots` nem o Runtime — ADR-0027(a); nenhuma cláusula do ADR-0013/ADR-0026 é reaberta.
- **Não** autorizar, ampliar ou sugerir automaticamente `netRoots` para o host do container; ligar o container **não** concede acesso de rede à Tool (D8). O usuário continua autorizando por `--allow-net`/painel da SPEC-0059.
- **Não** derivar o opt-in de `tools.searchUrl` estar configurado, nem condicioná-lo a ele — ADR-0027(g) (D7).
- **Não** verificar a saúde **HTTP** do serviço dentro do container (nenhuma requisição ao endpoint de busca, nenhum uso de `HttpPort`/`SearchPort` nesta fatia) — a prontidão observada é o estado do container (D11).
- **Não** criar Tool alguma, nem expor esta capacidade ao Planner/modelo; o auto-start nunca é escolhido por `args`.
- **Não** alterar `createAtlas`, `createLifecycle` nem seus hooks — ADR-0027(d).
- **Não** mudar o **comportamento** já entregue para o Ollama (endpoint de health-check, orçamento de 40 × 250 ms, desfechos, textos, posse, assimetria CLI × desktop) — Restrição 11. Isto é uma garantia sobre **comportamento observável**, não sobre tamanho de diff: a **estrutura** de `runEnsure` é necessariamente reestruturada (item 4.2), porque hoje ela usa *early return* devolvendo um `DependencyReport` inteiro por ramo (`return failed('spawn-failed')`, `return { outcomes: [{ … 'already-running' }] }`, `packages/core/src/dependencies/dependency-manager.ts`), e o relatório desta SPEC precisa carregar **sempre dois** desfechos (CA 7). O ramo do Ollama passa a produzir um `DependencyOutcome` (não um `DependencyReport`), que o `runEnsure` compõe com o do container. Fora dessa reestruturação, o diff no caminho do Ollama se limita à costura de `spawn` injetável (item 3.2) e ao narrowing por `dependency` nas bordas. Os **valores** de desfecho do Ollama seguem idênticos em todos os caminhos (CA 7 e CA 14a).
- **Não** supervisionar as dependências depois do `ensure` (sem health-check periódico, sem restart, sem watchdog, sem captura de logs do container).
- **Não** fazer a CLI chamar `release()` em nenhum caminho — ADR-0027(e); a assimetria é deliberada.
- **Não** persistir nada (Artigo 11): posse é estado de módulo em memória, morre com o processo.
- **Não** adicionar superfície de GUI (painel, canal IPC, `#global-alert`, painel `Sistema`, diálogo) para o auto-start — D15, residual nomeado.
- **Não** suportar outro runtime de container (Podman, nerdctl, `colima` como binário próprio) nem host Docker remoto (`DOCKER_HOST` é honrado implicitamente pelo próprio binário `docker`, sem tratamento nosso) — D16.
- **Não** implementar o slot `arquivo` da precedência do ADR-0006.
- **Não** tocar `@atlas/cognitive`, `@atlas/tools`, `@atlas/runtime`, `@atlas/skills`, `@atlas/memory`, `@atlas/context`, `@atlas/persona`, `@atlas/model-gateway`, `apps/desktop/src/renderer/*`, `piper-tts.ts`, `stt-engine.ts`, `hands-free.ts` — diff esperado **vazio** nesses alvos.
- **Não** emendar a Constituição, criar módulo novo, mover responsabilidade entre módulos nem abrir ADR novo.

---

# Pré-requisitos

- [SPEC-0060](SPEC-0060-ollama-auto-start.md) — **Done** (`createDependencyManager`/`ProcessPort`/`DependencyOutcome`/`resolveDependencyConfig`/`parseBooleanSetting`, disparo único por app nas duas bordas). **Pré-requisito real e estrutural** desta fatia.
- [SPEC-0057](SPEC-0057-web-search-tool.md) — **Done** (`web_search`, `tools.searchUrl`, provedor SearXNG provisionado pelo usuário).
- [SPEC-0059](SPEC-0059-desktop-network-search-gui.md) — **Done** (painel de rede/busca; é o que dá efeito prático no desktop).
- [SPEC-0003](SPEC-0003-cli-foundation.md) — **Done** (Input/Output Gateway, precedência `flags > env`).
- [SPEC-0031](SPEC-0031-desktop-foundation.md) — **Done** (`core-bridge.ts` testável sem Electron, `main.ts` casca fina).
- [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md) — **Accepted** (não é SPEC, mas é a fonte da fatia).

---

# Critérios de Aceitação

Cada item é verificável mecanicamente (teste automatizado, `typecheck`, `lint` ou `grep` no diff).

**Contratos e config**

1. `AtlasConfig.dependencies.autoStartSearchContainer` existe e é obrigatório; `AtlasConfigOverride.dependencies?.autoStartSearchContainer?` é opcional; o teste de tipo negativo com `@ts-expect-error` está em `packages/contracts/tests/config.test.ts` e o package passa em `pnpm --filter @atlas/contracts typecheck`.
2. `loadConfig({})` devolve `dependencies.autoStartSearchContainer === ''`; `loadConfig({ dependencies: { autoStartSearchContainer: 'searxng' } })` devolve `'searxng'`; um valor não-string e um valor que viole `isValidContainerName` (ex.: `'a b'`, `'-x'`, `'nome;rm -rf'`, string de 200 caracteres) produzem `InvalidConfigError` com issue citando `dependencies.autoStartSearchContainer`.
2a. **Regra única de `trim` (D6), provada nos dois pontos do mesmo processo:** `loadConfig({ dependencies: { autoStartSearchContainer: '  searxng  ' } })` **não lança** e devolve exatamente `'searxng'` (valor trimado, nunca o cru); `loadConfig({ dependencies: { autoStartSearchContainer: '   ' } })` **não lança** e devolve `''` (desligado). Os mesmos dois valores passados a `resolveDependencyConfig` devolvem, respectivamente, `'searxng'` e `''` — nenhum valor é aceito por um ponto e rejeitado pelo outro.
3. `isValidContainerName` é pinado por tabela exaustiva: aceita `'searxng'`, `'searxng_1'`, `'my.search-01'`, `'A1'`; recusa `''`, `'   '`, `'-abc'`, `'.abc'`, `'a b'`, `'a/b'`, `'a;b'`, `'a\nb'`, e qualquer string com mais de 128 caracteres.
4. `parseContainerNameSetting` é pinada: `undefined`/`''`/`'   '` ⇒ `{ kind: 'unset' }`; `'  searxng  '` ⇒ `{ kind: 'value', value: 'searxng' }` (com `trim`); `'a b'` ⇒ `{ kind: 'invalid', received: 'a b' }` (valor **cru**, sem `trim`).
5. `resolveDependencyConfig({})` devolve `autoStartSearchContainer === ''`; `resolveDependencyConfig({ dependencies: { autoStartSearchContainer: 'searxng' } })` devolve `'searxng'`; `resolveDependencyConfig({ dependencies: { autoStartSearchContainer: 'a b' } })` devolve `''` e **não lança** (normalização fail-closed, D6); `resolveDependencyConfig({ persona: 'inexistente' })` continua não lançando.
6. Os campos do Ollama continuam resolvendo exatamente como na SPEC-0060 (tabela de `ollamaBaseUrl` por provider efetivo intacta, CA 3a/3b daquela SPEC seguem verdes sem alteração).

**Dependency Manager**

7. `ensure` devolve **sempre exatamente dois** outcomes, na ordem `['ollama', 'search-container']`, em todas as combinações de opt-in (ligado/desligado × ligado/desligado). Consequência assumida e esperada: os testes de `dependency-manager` da SPEC-0060 que hoje afirmam um relatório de **um** elemento são atualizados para procurar o desfecho por `dependency` — o **valor** do desfecho do Ollama em cada cenário permanece idêntico (Restrição 11); nenhuma expectativa sobre `status`/`reason` do Ollama muda.
8. Com `autoStartSearchContainer === ''`, o desfecho é `'disabled'` e o `ProcessPort` fake registra **zero** chamadas às três operações Docker.
9. `inspectSearchContainer` devolvendo `'running'` ⇒ `'already-running'` com `container` igual ao nome configurado, e **zero** `startSearchContainer`.
10. `'unavailable'` ⇒ `'failed'`/`reason: 'docker-unavailable'`, **sem** `startSearchContainer`; `'unknown'` ⇒ `'failed'`/`reason: 'container-unknown'`, **sem** `startSearchContainer` (prova mecânica de que o Atlas nunca tenta criar container: o fake registra zero chamadas de start nesse caminho).
11. `'stopped'` + `startSearchContainer` bem-sucedido + `inspectSearchContainer` devolvendo `'running'` no polling ⇒ `'started'`. A ordem é pinada: numa lista única de chamadas registradas pelo fake, a sequência posterior ao `startSearchContainer` começa por `sleep` e alterna `sleep`/`inspectSearchContainer`; no sucesso de 1ª tentativa a sequência é exatamente `['sleep', 'inspectSearchContainer']` (nenhum `sleep` sobrando).
12. `'stopped'` + start bem-sucedido + polling que nunca devolve `'running'` ⇒ `'failed'`/`reason: 'timeout'` após exatamente **20** `sleep(250)` e **20** `inspectSearchContainer` no laço.
13. `startSearchContainer` devolvendo `{ started: false, reason }` produz `'failed'` com a mesma `reason`, **sem** polling.
14. Uma porta que **rejeita** em qualquer das três operações Docker não faz `ensure` lançar: o resultado é `'failed'` com `reason: 'start-failed'`, e o desfecho do **Ollama** no mesmo relatório permanece correto (independência entre as duas dependências).
14a. **Independência na direção inversa (simétrica ao CA 14):** com o opt-in do container ligado e `inspectSearchContainer` devolvendo `'stopped'` + start bem-sucedido, um Ollama que **falha** em cada um dos quatro caminhos de falha — `'binary-missing'`, `'spawn-failed'`, `'timeout'` e porta que **rejeita** em `isOllamaRunning`/`startOllama` — ainda produz `outcomes` com **exatamente dois** elementos, na ordem pinada, com `outcomes[0]` sendo o desfecho de `'ollama'` esperado (mesmos valores da SPEC-0060) e `outcomes[1]` sendo `{ dependency: 'search-container', status: 'started', container: <nome> }`; o `ProcessPort` fake registra de fato as chamadas Docker (`inspectSearchContainer`/`startSearchContainer`) nesses quatro cenários — a falha do Ollama nunca curto-circuita o caminho do container.
15. `release()` chama `stopSearchContainer(nome)` **exatamente uma vez** quando (e só quando) o `startSearchContainer` daquela instância devolveu `started: true` — o que cobre os desfechos `'started'` **e** `'failed'`/`'timeout'`. Nos demais desfechos, o fake registra **zero** `stopSearchContainer`. `release()` sem `ensure` prévio é no-op; `release()` duas vezes chama `stopSearchContainer` no máximo uma vez.
16. `release()` com posse das **duas** dependências chama `stopOllama` e `stopSearchContainer` uma vez cada; um `stopOllama` que **rejeita** não impede o `stopSearchContainer` (e vice-versa), e `release()` não lança.
17. `ensure` chamado duas vezes na mesma instância não repete `inspect`/`start` (memoização da SPEC-0060/D18 preservada para as duas dependências).
18. Não existe segunda estrutura de posse: um `grep` no diff mostra o nome do container possuído vivendo **apenas** num campo privado de `dependency-manager.ts` — `node-process-port.ts`, `apps/cli` e `apps/desktop` não mantêm rastreio próprio.
19. `createAtlas` continua sem chamar nada desta SPEC: `grep` por `createDependencyManager` em `packages/core/src/index.ts` casa **apenas** na linha de `export`.

**Adaptador real**

20. As três operações Docker são testadas **só** pela fronteira injetável (`spawn` fake), nunca contra Docker real: `inspectSearchContainer` cobre os cinco desfechos do item 3.2 (ENOENT ⇒ `'unavailable'`; exit 0 + `'true'` ⇒ `'running'`; exit 0 + `'false'` ⇒ `'stopped'`; exit 0 + lixo ⇒ `'unknown'`; exit != 0 ⇒ `'unknown'`) e **nunca lança**; `startSearchContainer` cobre exit 0 / exit != 0 / ENOENT; `stopSearchContainer` nunca lança mesmo com exit != 0 ou ENOENT.
21. `grep -R "shell: true" packages/core/src` não casa; os argv de `docker` são arrays literais com o nome do container como **elemento próprio**, nunca concatenado em string, e pinados por igualdade no teste (o fake de `spawn` recebe exatamente `['inspect','--type','container','--format','{{.State.Running}}', nome]`, `['start', nome]`, `['stop', nome]` — a presença de `'--type','container'` no argv do `inspect` é parte da asserção, D9).
22. `grep -RE "docker['\"]?\s*,\s*\[\s*['\"](run|create|pull|build|exec|rm|kill|compose)" packages/core/src` não casa — prova mecânica do ADR-0027(h).
23. Os testes já existentes de `nodeProcessPort` (SPEC-0060) continuam verdes sem alteração de expectativa; a introdução de `spawn?` é aditiva.

**CLI**

24. `--auto-start-search-container searxng` produz `configOverride.dependencies.autoStartSearchContainer === 'searxng'`; `ATLAS_AUTO_START_SEARCH_CONTAINER=searxng` também; a flag vence a env; ausência das duas fontes **não** cria a chave (e, sem `--auto-start-ollama`, `configOverride.dependencies` segue `undefined`); `ATLAS_AUTO_START_SEARCH_CONTAINER='a b'` produz `CliUsageError` cuja mensagem cita a regra de formato.
25. As duas fontes juntas (`--auto-start-ollama --auto-start-search-container searxng`) produzem `configOverride.dependencies` com os **dois** campos.
26. `run()` continua chamando `ensure` **exatamente uma vez** por invocação e **zero** vez para `help`/`version`/`persona`; **nunca** chama `release()`.
27. Um desfecho `'failed'` do container **não** altera o código de saída do comando nem impede o comando de rodar (teste com `atlas status` e desfecho `'failed'` esperando código `0`).
28. Os avisos do container saem em **stderr** com os textos pinados de **D12**; `'disabled'`/`'already-running'` não escrevem nada. Um desfecho `'started'` do container **não** imprime o texto do Ollama (prova do narrowing por `dependency`) e vice-versa.
29. `atlas status` imprime a linha `search container auto-start: …` com exatamente um dos **quatro** textos pinados de **D13**, logo abaixo da linha `ollama auto-start:`; a linha do Ollama continua correta mesmo com o relatório carregando dois outcomes (prova de que `outcomes[0]` deixou de ser assumido).
30. `HELP_TEXT` cita `--auto-start-search-container` e `ATLAS_AUTO_START_SEARCH_CONTAINER`, com a nota de que o Atlas nunca cria/baixa/remove containers.

**Desktop**

31. `ensureExternalDependencies(env)` com `ATLAS_AUTO_START_SEARCH_CONTAINER` ausente devolve `'disabled'` para o container sem tocar a porta; com `'searxng'`, exercita o caminho de auto-start; com valor inválido (`'a b'`), devolve `'disabled'` (fail-closed), **não** lança e emite **exatamente uma** linha de `console.warn` com o texto pinado (espião sobre `console.warn`).
32. As duas variáveis são independentes: `ATLAS_AUTO_START_OLLAMA` inválida e `ATLAS_AUTO_START_SEARCH_CONTAINER` válida produzem Ollama `'disabled'` + um `console.warn` do Ollama **e** o caminho de container exercitado (e vice-versa).
33. Após um `ensure` com `'started'` do container, `releaseExternalDependencies()` delega o `stopSearchContainer` uma vez; sem posse, é no-op e não lança.
34. `apps/desktop/src/main.ts` loga os desfechos do container com os textos pinados de **D14**, com narrowing por `dependency`; `before-quit` continua com uma única chamada de `releaseExternalDependencies`.
35. Diff **vazio** em `apps/desktop/src/renderer/*`, em todos os módulos vigiados pelo gate de paridade renderer↔módulo, e nenhum canal `'atlas:*'` novo — `apps/desktop/tests/renderer.speech-parity.test.ts` continua verde sem registro novo.

**Higiene global**

36. `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` verdes **na raiz** (os quatro comandos completos, obrigatórios antes de fechar).
37. Diff **vazio** em `packages/permissions`, `packages/runtime`, `packages/tools`, `packages/cognitive`, `packages/skills`, `packages/memory`, `packages/context`, `packages/persona`, `packages/model-gateway`.
38. Nenhum arquivo novo é escrito em disco por nenhum caminho desta SPEC (nenhum `writeFile`/`mkdir` introduzido).
39. Nenhum teste desta SPEC invoca o binário `docker`, abre socket de Docker ou spawna processo real (verificável por revisão: todas as bordas usam `spawn` fake ou `ProcessPort` fake).

---

# Arquivos Esperados

```text
docs/implementation/specs/SPEC-0061-search-container-auto-start.md   (este arquivo)
docs/06-adr/ADR-0027-external-process-lifecycle-management.md        (nota de atualização, sem alterar cláusulas)

packages/contracts/src/config.ts                     (mod)
packages/contracts/tests/config.test.ts              (mod)

packages/core/src/config/defaults.ts                 (mod)
packages/core/src/config/load-config.ts              (mod)
packages/core/src/config/dependency-config.ts        (mod)
packages/core/src/dependencies/process-port.ts       (mod)
packages/core/src/dependencies/node-process-port.ts  (mod)
packages/core/src/dependencies/dependency-manager.ts (mod)
packages/core/src/index.ts                           (mod — só exports)
packages/core/tests/dependency-manager.test.ts       (mod)
packages/core/tests/dependency-config.test.ts        (mod)
packages/core/tests/node-process-port.test.ts        (mod)
packages/core/tests/config.test.ts                   (mod)
packages/core/CLAUDE.md                              (mod — no doc-sync de fecho)

apps/cli/src/gateway/input-gateway.ts                (mod)
apps/cli/src/run.ts                                  (mod)
apps/cli/src/commands/status.ts                      (mod)
apps/cli/tests/input-gateway.test.ts                 (mod)
apps/cli/tests/status.test.ts                        (mod)
apps/cli/tests/auto-start-ollama.test.ts             (mod — passa a cobrir as duas dependências)

apps/desktop/src/core-bridge.ts                      (mod)
apps/desktop/src/main.ts                             (mod)
apps/desktop/tests/core-bridge.dependencies.test.ts  (mod)
```

Nenhum arquivo **novo** de código é esperado — a fatia é inteiramente aditiva sobre os módulos criados pela SPEC-0060 (D2).

---

# Componentes Impactados

- **Lifecycle Manager** (`packages/core`) — dono da capacidade (Module Catalog: "verificação de dependências", "ativação de componentes", "desligamento seguro"). Ganha três operações nomeadas e uma segunda dependência no mesmo manager.
- **Configuration Service** (`packages/core`) — campo `dependencies.autoStartSearchContainer`, sua validação de formato e o resolvedor parcial.
- **`@atlas/contracts`** — formato do dado de config (obrigatório em `AtlasConfig`, opcional em `AtlasConfigOverride`).
- **Input/Output Gateway** (`apps/cli`) — flag/env, avisos em stderr, linha de `atlas status`.
- **`apps/desktop`** — `core-bridge.ts` (leitura da env e repasse) e `main.ts` (log).

Explicitamente **não impactados**: Permission Service, Runtime, Task Manager, Tool Registry, Cognitive Core, Planner, Skill Registry, Memory Service, Context Service, Persona Service, Model Gateway, renderer do desktop.

---

# Interfaces Necessárias

1. `ProcessPort` (`@atlas/core`) — estendida com `inspectSearchContainer`/`startSearchContainer`/`stopSearchContainer`, **nomeadas e fixas** (ADR-0027(b)). Nunca um método genérico de execução.
2. `SearchContainerState` — união de quatro estados, exaustiva, derivada só de código de saída e stdout do `docker inspect` (nunca de parse de stderr).
3. `SearchContainerStartOutcome` — união discriminada por `started`.
4. `SearchContainerFailureReason` — conjunto fechado de quatro razões; `'timeout'` é produzida **só** pelo manager.
5. `DependencyOutcome` — estendida com quatro variantes `dependency: 'search-container'`; as três variantes com container carregam `container: string` (D3).
6. `isValidContainerName` / `parseContainerNameSetting` — predicado e coerção puros, origem única do formato para `loadConfig` e para as duas bordas.
7. `DependencyConfig.autoStartSearchContainer` — produzido só por `resolveDependencyConfig`.
8. `AtlasConfig.dependencies.autoStartSearchContainer` / `AtlasConfigOverride.dependencies?.autoStartSearchContainer?` (`@atlas/contracts`).

`DependencyManager`, `DependencyReport` e `createDependencyManager` **não** mudam de assinatura. Nenhum tipo novo sobe a `@atlas/contracts` além do item 8.

---

# Fluxo Esperado

**CLI (uma vez por processo, nunca desliga):**

```text
argv/env → InputGateway.normalize  (--auto-start-search-container / ATLAS_AUTO_START_SEARCH_CONTAINER)
        ↓ (help/version/persona desviam ANTES, sem tocar dependências)
resolveDependencyConfig(configOverride)
        ↓
createDependencyManager().ensure(config)   → outcomes[0] = ollama (SPEC-0060, inalterado)
        ↓                                    outcomes[1] = search-container:
        ├─ nome vazio ................................ 'disabled'         (silencioso)
        ├─ inspect 'running' ......................... 'already-running'  (silencioso)
        ├─ inspect 'unavailable' ..................... 'failed'/docker-unavailable   (stderr)
        ├─ inspect 'unknown' ......................... 'failed'/container-unknown    (stderr, NUNCA cria)
        └─ inspect 'stopped' → docker start
              ├─ start != 0 ......................... 'failed'/start-failed          (stderr)
              └─ start OK → posse registrada JÁ
                    └─ polling (sleep 250ms → inspect) × até 20
                          ├─ 'running' ............... 'started'                     (stderr)
                          └─ 20 sem 'running' ........ 'failed'/timeout (POSSE MANTIDA, stderr)
        ↓
createAtlas(...) → comando (status imprime as DUAS linhas de auto-start)
        ↓
atlas.shutdown()      ← release() NUNCA é chamado (ADR-0027(e))
```

**Desktop (uma vez por sessão de app, desliga só o que ligou):**

```text
app.whenReady() → ensureExternalDependencies(env) → (mesma máquina de desfechos) → log por dependência
        ↓
… sessão da app: createAtlas/atlas.shutdown por round-trip, INALTERADOS …
        ↓
before-quit → releaseExternalDependencies() → stopOllama() e/ou docker stop <nome>,
                                              só do que ESTA sessão iniciou
                                              (inclusive no desfecho 'failed'/'timeout')
```

---

# Estratégia de Implementação

1. `@atlas/contracts`: campo em `AtlasConfig`/`AtlasConfigOverride` + teste de tipo negativo. Rodar `pnpm --filter @atlas/contracts typecheck` e esperar a quebra conhecida de fakes tipados diretamente (padrão recorrente desde a SPEC-0017).
2. `@atlas/core` config: `defaults`, `isValidContainerName`/`parseContainerNameSetting` em `dependency-config.ts`, merge/validação em `loadConfig`, `DependencyConfig` estendido — com os helpers compartilhados (nunca duas implementações da mesma precedência/formato).
3. `process-port.ts`: só tipos (três operações novas + duas uniões).
4. `dependency-manager.ts`: **primeiro** a reestruturação de `runEnsure`/`failed` para produzir `DependencyOutcome` em vez de `DependencyReport` (item 4.2), com a suíte da SPEC-0060 adaptada à busca por `dependency` e **sem mudar um valor esperado** — commit mental separado, antes de somar o container; depois a lógica do container, pura sobre a porta, com o `sleep` injetável já existente; testes com `ProcessPort` fake **antes** do adaptador real; garantir independência entre as duas dependências nas **duas** direções (CA 14/14a) e ordem pinada do relatório.
5. `node-process-port.ts`: `spawn?` injetável + as três operações Docker com o contrato pinado; testes só da fronteira injetável.
6. `packages/core/src/index.ts`: exports (e **nada** dentro de `createAtlas`).
7. `apps/cli`: flag/env → narrowing por `dependency` no laço de avisos de `run.ts` → textos de stderr → segunda linha de `atlas status` → `HELP_TEXT`.
8. `apps/desktop`: leitura da env em `core-bridge.ts` → testes → narrowing e textos no log de `main.ts`.
9. Nota de atualização no ADR-0027.
10. Verificação final: os quatro comandos completos na raiz.

---

# Estratégia de Testes

**Sempre com fakes.** Nenhum teste desta plataforma pode invocar `docker`, abrir socket do Docker ou spawnar processo real — mesma disciplina de `HttpPort`/`SearchPort`/`SpawnPiper`/`SpawnStt`/`ProcessPort` (ADR-0027(c)).

- **`@atlas/core` / dependency-manager** (unitário, `ProcessPort` fake registrando chamadas numa **lista ordenada** + `sleep` fake): CA 7–19 — relatório com dois outcomes em ordem pinada; independência entre dependências **nas duas direções** (CA 14 e CA 14a: nem falha do Docker corrompe o desfecho do Ollama, nem os quatro caminhos de falha do Ollama impedem o caminho do container); opt-in desligado não toca a porta; `'unknown'`/`'unavailable'` nunca chamam start; polling com contagem **e** ordem exatas; quatro `reason`; porta que rejeita não propaga; posse registrada no start e `release` derrubando também após `'timeout'`; idempotência; ausência de posse duplicada.
- **`@atlas/core` / dependency-config** (unitário, puro): CA 3–6 — tabelas de `isValidContainerName` e `parseContainerNameSetting`, regra única de `trim`, normalização fail-closed do resolvedor, não-regressão da resolução do Ollama.
- **`@atlas/core` / load-config**: merge, issue de validação do campo e paridade de `trim` com o resolvedor (CA 2 e CA 2a).
- **`@atlas/core` / node-process-port** (unitário, `spawn` fake): CA 20–23 — classificação exaustiva do `docker inspect`, argv literais, nunca lançar, não-regressão dos testes do Ollama.
- **`@atlas/contracts`**: teste de tipo negativo (`@ts-expect-error`).
- **`apps/cli`**: parsing de flag/env (incluindo `CliUsageError` e a combinação das duas flags), narrowing dos avisos por `dependency`, textos exatos em stderr, as duas linhas de `atlas status` nos quatro desfechos cada, código de saída inalterado em falha, `ensure` uma vez / `release` nunca.
- **`apps/desktop`**: `core-bridge.dependencies.test.ts` — env ausente/válida/inválida para a variável nova (com o `console.warn` pinado espionado), independência entre as duas variáveis, `env` injetado por parâmetro (nunca mutando `process.env` global), `release` sem posse e com posse; gate de paridade renderer↔módulo permanecendo verde sem entrada nova.

**Explicitamente ambiental, não coberto por CI** (registrado, não escondido):

- que o binário `docker` exista, o daemon esteja acessível e o container nomeado exista no host;
- que `docker start` de fato deixe o serviço do SearXNG respondendo HTTP (a prontidão observada é o **estado do container**, não a saúde do serviço — D11);
- que o `docker stop` complete antes de o Electron encerrar (`before-quit` não aguarda — residual herdado da SPEC-0060/D17);
- o comportamento sob `DOCKER_HOST` remoto, Docker Desktop hibernado ou runtimes alternativos (D16).

Mesma postura das SPECs 0040/0046/0052/0060 quanto a binários externos: a cobertura prova lógica e fiação, não o ambiente.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` estiverem verdes na raiz;
- a nota de atualização no ADR-0027 estiver registrada (sem alterar cláusulas (a)–(h));
- a arquitetura estiver preservada (nenhum módulo novo, nenhuma responsabilidade movida, `createAtlas` intacto);
- a revisão estiver concluída;
- as lições aprendidas estiverem registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação:** a sincronização das docs vivas (`CLAUDE.md` raiz e de `packages/core`/`apps/cli`/`apps/desktop`, `PLATFORM_STATE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) **não é escopo do `spec-implementer`** — é o passo `doc-sync` do fecho. O implementador toca só a documentação específica desta SPEC (este arquivo e a nota no ADR-0027).

---

# Restrições

1. Não criar módulos novos; a capacidade pertence ao Lifecycle Manager, dentro de `packages/core`.
2. Não alterar `createAtlas` nem os hooks do `createLifecycle` existente.
3. Não introduzir execução de comando arbitrário, `shell: true`, interpolação de string em argv, nem caminho de binário vindo de entrada não confiável.
4. Só `inspect`/`start`/`stop` do container nomeado — nunca `run`/`create`/`pull`/`build`/`exec`/`rm`/`kill`/`compose` (ADR-0027(h)).
5. Nenhuma decisão do modelo/Planner pode alcançar esta capacidade — a única fonte é a config fornecida pelo humano.
6. `ensure`/`release` **nunca lançam** de um jeito que impeça o app/CLI de abrir ou fechar (ADR-0027(f)).
7. Fail-closed por padrão: sem opt-in nominal, o comportamento é byte a byte o de hoje (nenhum `docker inspect`, nenhum processo).
8. Nenhum estado persistente novo (Artigo 11).
9. Toda mensagem visível ao usuário é pinada nesta SPEC (D12/D13/D14) — nada improvisado, e **nunca** interpolar stdout/stderr do `docker` na saída; o único dado interpolado é o nome do container, já normalizado (`trim`) e validado por `isValidContainerName` (D6).
10. Desfechos são uniões discriminadas com `reason` de conjunto fechado — nunca `Error.message` cru atravessando a fronteira.
11. Nenhuma alteração de **comportamento observável** no caminho do Ollama entregue pela SPEC-0060 (mesmos desfechos, mesmos textos, mesma sequência de chamadas à porta, mesma posse). A **estrutura** interna de `runEnsure` é reestruturada por necessidade (item 4.2) — a restrição é sobre comportamento, não sobre tamanho de diff.
12. Diff confinado aos alvos listados em "Arquivos Esperados".

---

# Observações

- **Residual de segurança herdado, registrado (não fechado):** o acesso ao socket do Docker é equivalente a **privilégio elevado no host** (ADR-0027, "Custos e riscos"). A mitigação desta fatia é escopo (três operações fixas, só sobre o container nomeado na config, nunca criação) e visibilidade (`atlas status` + aviso em stderr + log no main process), não eliminação: quem tiver esse acesso liberado ao processo do Atlas poderia, em tese, ligar qualquer container já existente na máquina — o limite efetivo é a config fornecida pelo humano.
- **Residual: ligar o container não dá acesso de rede à Tool.** O host do endpoint continua precisando de `netRoots` (ADR-0026), por `--allow-net` ou pelo painel da SPEC-0059. É deliberado (D8): configurar uma capacidade não concede outra. Consequência prática: com o auto-start ligado e `netRoots` vazio, o container sobe e a `web_search` continua sendo negada — o que **precisa** aparecer nas docs vivas no `doc-sync`, porque é a surpresa mais provável.
- **Residual: a prontidão observada é o estado do container, não a saúde do serviço** (D11). Um container que sobe mas cujo SearXNG demora (ou falha) a responder é reportado como `'started'`; a `web_search` degradará como hoje.
- **Residual: o desktop não avisa o usuário na janela** (só no log do main process) — D15, e o opt-in é alcançável na prática só em lançamento por terminal/dev, exatamente como registrado na SPEC-0060 (app empacotado aberto por Finder/Dock tipicamente não herda o ambiente do shell). Fechável por uma fatia futura de painel, molde da SPEC-0055/D17 → SPEC-0059.
- **Residual: `before-quit` não aguarda o `release`** (herdado da SPEC-0060/D17) — se o Electron encerrar antes de o `docker stop` completar, um container iniciado pela sessão pode sobreviver ao fechamento.
- **Residual: sem supervisão pós-`ensure`** — se o container cair no meio da sessão, nada o levanta de novo.
- **Custo assumido, ampliado:** com os **dois** opt-ins ligados e as duas dependências fora do ar, o pior caso de bloqueio antes do despacho do comando passa de ~12 s (SPEC-0060) para ~17 s (10 s do Ollama + 5 s do container + health-checks). É consequência direta do ADR-0027(d) (disparo único no bootstrap, antes de despachar) e do tratamento **sequencial** (D4); só `help`/`version`/`persona` escapam. O usuário desliga o custo desligando o opt-in. **Levar às docs vivas no `doc-sync`.**
- **Assimetria deliberada CLI × desktop** (ADR-0027(e)): fechar `atlas ask` deixa o container ligado; fechar a janela derruba o que a janela ligou.
- **Esta é a última das três SPECs candidatas nomeadas pelo ADR-0027.** Depois dela, o ADR fica inteiramente consumido; nenhuma cláusula restante fica sem implementação. Não fecha item do Roadmap.

---

# Checklist para IA

Antes de implementar:

- ler o ADR-0027 por inteiro (cláusulas (a)–(h), com atenção especial a (b), (h) e (e)) e a SPEC-0060 (a forma que esta estende);
- confirmar que `createAtlas` **não** deve chamar nada desta SPEC;
- validar que os pré-requisitos estão `Done`.

Durante implementação:

- manter responsabilidade única (a porta faz IO, o manager decide, os apps só disparam e formatam);
- fakes primeiro, adaptador real depois;
- nenhuma string de usuário fora das pinadas em D12/D13/D14;
- nenhum subcomando de `docker` além de `inspect`/`start`/`stop`.

Após implementação:

- rodar os quatro comandos completos na raiz;
- conferir os diffs vazios exigidos pelos CA 35/37 e os `grep` dos CA 21/22;
- registrar lições aprendidas e a nota no ADR-0027.

---

# Resultado Esperado

Depois desta SPEC, um usuário que rode `atlas ask "..." --auto-start-search-container searxng` (ou exporte `ATLAS_AUTO_START_SEARCH_CONTAINER=searxng`, ou abra a janela do desktop com essa variável no ambiente) não precisa mais ter rodado `docker start searxng` antes: o Atlas consulta o estado do container e, se ele existir e estiver parado, o liga uma única vez por processo (CLI) ou por sessão de app (desktop), confirmando por até 5 s que ele ficou em execução.

Se o Docker não estiver disponível, o container não for reconhecido, o `start` for recusado ou o container não ficar em execução a tempo, **nada trava**: o comando roda, a janela abre, e o usuário vê uma linha honesta dizendo o que falhou — a experiência degrada exatamente para a de hoje. O Atlas **nunca** cria, baixa ou remove um container: um nome desconhecido é uma falha reportada, não um convite a provisionar.

Sem o opt-in nominal, o comportamento é indistinguível do anterior a esta SPEC: nenhum `docker inspect`, nenhum processo, nenhum byte de diferença. Fechando a janela do desktop, o container que **aquela sessão** ligou é desligado — inclusive quando o desfecho registrado foi `'failed'`/`'timeout'`, porque a posse é da autoria do `start`, não da prontidão. Um container que já estava ligado, ou que foi ligado por um comando da CLI, permanece.

E o portão de rede continua exatamente onde estava: o container ligado só é útil à Tool `web_search` depois que o usuário autorizar o host em `netRoots` — ligar um processo nunca concede uma permissão.

---

# Decisões de design

Formato de veto: **Decisão** · **Porquê** (rastreado à fonte) · **Alternativa descartada**.

**D1 — Perfil `completo`.**
· *Decisão*: esta SPEC é `completo`, não `micro`.
· *Porquê*: falha em duas das seis condições de `micro` — toca `@atlas/contracts` (`AtlasConfig.dependencies.autoStartSearchContainer`) e extravasa "um package + a CLI que o expõe" (`packages/core` + `apps/cli` + `apps/desktop`). O template manda usar `completo` na dúvida, e a SPEC irmã (SPEC-0060), de alcance quase idêntico, foi `completo`.
· *Alternativa descartada*: `micro`, argumentando que é só extensão aditiva de uma unidade existente — descartada porque o diff em `@atlas/contracts` e em `apps/desktop` cai fora da fronteira de `micro` **por definição**, independentemente do tamanho.

**D2 — Extensão aditiva da unidade da SPEC-0060, sem arquivo novo e sem generalizar a porta.**
· *Decisão*: `ProcessPort` ganha três métodos nomeados para Docker; `DependencyOutcome` ganha quatro variantes; `createDependencyManager`/`DependencyManager`/`DependencyReport` mantêm a assinatura. Nenhum módulo/arquivo novo.
· *Porquê*: é literalmente o que a SPEC-0060 (Observações) previu como forma desta fatia e o que o ADR-0027(b)/(c) desenha — operações **nomeadas e fixas** numa porta injetável, dono único no Lifecycle Manager. A união discriminada absorve a segunda dependência sem tocar a primeira.
· *Alternativa descartada*: refatorar para uma porta genérica parametrizada por `DependencyId` (`ensure(id)`, `start(id)`) agora que há dois casos — descartada porque as operações de Ollama (health-check HTTP, `spawn` detached, sinais) e de Docker (`docker inspect`/`start`/`stop`) **não têm forma comum real**; a generalização produziria um contrato que mente sobre a simetria e aproximaria a porta do `run(command, args)` que o ADR-0027(b) proíbe. Reavaliar só com um terceiro caso concreto (regra "promover com 2º consumidor real", ADR-0007 — aqui os dois consumidores não compartilham forma).

**D3 — Os desfechos do container carregam `container: string`; os do Ollama continuam sem payload.**
· *Decisão*: as variantes `already-running`/`started`/`failed` de `'search-container'` incluem o nome; `'disabled'` não (não há alvo).
· *Porquê*: o Ollama tem identidade implícita e única por processo; o container é identificado por um nome **escolhido pelo usuário**, e um aviso/linha de status sem o nome seria ambíguo (Artigo 7 — transparência). Com o nome no desfecho, o relatório é autodescritivo e as duas bordas (stderr da CLI, `atlas status`, log do desktop) formatam a partir de **uma** fonte, sem reler a config.
· *Alternativa descartada*: passar `DependencyConfig` junto do relatório às funções de formatação (como `run.ts` já faz com `ollamaBaseUrl`) — descartada porque `runStatus` receberia um segundo parâmetro só para isso, e a dupla fonte (relatório + config) permitiria divergir (relatório de um `ensure` antigo com nome de config novo). Também descartada "sem nome nenhum nas mensagens" — barata, mas deixa o usuário com múltiplos containers sem saber qual falhou.

**D4 — Relatório sempre com dois outcomes, em ordem pinada, tratados sequencialmente.**
· *Decisão*: `outcomes` tem sempre exatamente dois elementos, `'ollama'` primeiro; as dependências são processadas em sequência e são independentes.
· *Porquê*: um relatório **total** torna a linha de `atlas status` uma função total (mesma razão que eliminou o 5º texto na SPEC-0060/D14) e evita que uma borda precise decidir o que exibir na ausência de um desfecho. A sequencialidade mantém determinística a lista ordenada de chamadas que os testes pinam (CA 11/12) — garantia que a SPEC-0060 já cobrava do laço de polling.
· *Alternativa descartada*: `Promise.all` das duas dependências — reduziria o pior caso de 15 s para 10 s, mas tornaria não determinística a ordem das chamadas registradas pelos fakes (justamente a prova mecânica do orçamento) e acoplaria os tempos dos dois caminhos de falha. Também descartada "só incluir no relatório as dependências ligadas" — reintroduziria o estado "sem desfecho" que a D14 da SPEC-0060 removeu de propósito.

**D5 — Opt-in nominal num único campo: `dependencies.autoStartSearchContainer: string` (default `''` = desligado).**
· *Decisão*: um campo só, string; `''` desliga, nome válido liga e identifica o alvo. Flag `--auto-start-search-container <nome>`, env `ATLAS_AUTO_START_SEARCH_CONTAINER`, precedência `flag > env`.
· *Porquê*: ADR-0027(g) exige opt-in **explícito e dedicado** — o campo existe só para esta automação e não tem outro significado (ao contrário de `tools.searchUrl`, cuja derivação o ADR rejeita). Diferente do Ollama, o container **não tem identidade default** (não existe nome canônico), então o opt-in precisa carregar o alvo de qualquer forma; fundir "se" e "qual" num campo elimina, por construção, o estado inválido `ligado sem nome`, que exigiria uma 5ª `reason` e um texto de status que nenhum caminho saudável produz — exatamente o código morto que a SPEC-0060/D14 removeu.
· *Alternativa descartada*: espelhar o Ollama com dois campos (`autoStartSearchContainer: boolean` + `searchContainerName: string`) — simétrico na aparência, mas cria o par inválido `true` + `''` e obriga a inventar desfecho/mensagem para ele. Também descartada "nome fixo `searxng` embutido" — adivinharia o ambiente do usuário e violaria o espírito de (g) (o Atlas decidindo por conta própria em qual container mexer). Também descartada "derivar do host de `tools.searchUrl`" — o host não é o nome do container, e a derivação implícita é explicitamente rejeitada pelo ADR-0027.

**D6 — Uma única regra de normalização (`trim` → `isValidContainerName`) para todos os consumidores; `loadConfig`/bordas rejeitam em voz alta, `resolveDependencyConfig` normaliza fail-closed sem lançar.**
· *Decisão*: a regra é **uma só, aplicada em todo ponto**: `trim` primeiro; `''` após o `trim` ⇒ desligado (nunca erro); qualquer outro valor precisa satisfazer `isValidContainerName` (`/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/`, charset do próprio Docker), e o valor **efetivo em toda parte** (config resolvida, `DependencyConfig`, argv, mensagens) é o **trimado**. Sobre essa regra única, cada superfície reage conforme seu contrato: `loadConfig` lança `InvalidConfigError`; a CLI lança `CliUsageError`; o desktop desliga + `console.warn` (D25 da SPEC-0060); `resolveDependencyConfig` descarta para `''`.
· *Porquê*: o ADR-0006 põe a validação no core, e o Module Catalog proíbe o Configuration Service alterar/ignorar configuração **silenciosamente** — daí as três superfícies que falam alto. Mas `resolveDependencyConfig` é, por contrato da SPEC-0060, um resolvedor **puro que nunca lança** e não valida; deixá-lo repassar cru permitiria que um valor não validado (via API programática de um app futuro) chegasse ao argv e às mensagens interpoladas. Descartar fail-closed é a única saída compatível com as duas regras, e não é silenciosa na prática: todo caminho real passa antes por uma das três superfícies que avisam. O `trim` precisa valer **também** em `loadConfig` porque os dois pontos convivem no **mesmo processo**: com `resolveDependencyConfig` trimando e `loadConfig` não, `{ autoStartSearchContainer: '  searxng  ' }` ligaria o container (resolvedor aceita) e mataria o comando logo em seguida com `InvalidConfigError` (`loadConfig` recusa) — efeito colateral sem comando, o pior desfecho possível.
· *Alternativa descartada*: validar **sem** `trim` em `loadConfig` (a versão anterior desta SPEC), tratando espaço nas bordas como erro de digitação a ser gritado — descartada pela divergência acima entre os dois pontos do mesmo processo; e, se fosse unificada pelo outro lado (nenhum `trim` em lugar nenhum), `'  searxng  '` viraria nome de container inválido no argv, trocando uma mensagem clara por uma falha de Docker. Também descartada repassar o valor cru do resolvedor, confiando no argv em array — o nome é **interpolado em mensagens** (D12/D13/D14), e uma string com quebra de linha poderia forjar linhas de saída. Também descartada "fazer `resolveDependencyConfig` lançar" — quebraria o contrato "puro, nunca lança" de que o desktop depende para não arriscar a janela (ADR-0027(f)).

**D7 — O auto-start do container não consulta `tools.searchUrl`.**
· *Decisão*: com o nome configurado, o container é ligado mesmo sem endpoint de busca configurado (e vice-versa).
· *Porquê*: ADR-0027(g) — a decisão é **só** do opt-in explícito. Acoplar reintroduziria a implicitude pela porta dos fundos e produziria um no-op invisível ("configurei o container e nada acontece") que o usuário teria de depurar. É o espelho exato da SPEC-0060/D16 (o auto-start do Ollama não lê `model.provider` para decidir **se** age).
· *Alternativa descartada*: só ligar o container quando `tools.searchUrl !== ''` — parece "esperto", mas é a mesma derivação implícita que o usuário rejeitou no brainstorming do ADR-0027, e tornaria a ordem de configuração relevante sem que nada avise.

**D8 — Ligar o container **não** concede `netRoots`; nenhuma linha de `@atlas/permissions` é tocada.**
· *Decisão*: nenhuma autorização de rede é criada, ampliada ou sugerida automaticamente por esta SPEC.
· *Porquê*: ADR-0027(a) (o Permission Service não é tocado) e ADR-0026 (allowlist de host, fail-closed, consentimento explícito por host novo — SPEC-0059). Conceder rede como efeito colateral de "ligar um processo" seria conceder política a partir de bootstrap de infraestrutura, exatamente o cruzamento de autoridades que o ADR-0013 existe para impedir.
· *Alternativa descartada*: autorizar automaticamente o host do container em `netRoots` quando o auto-start estiver ligado ("já que o usuário quer usar a busca") — descartada por reabrir o ADR-0026 e por transformar um campo de conveniência operacional num concessor de permissão de rede, a pior confusão possível entre as duas políticas. Fica registrado como residual: o usuário precisa fazer os dois gestos.

**D9 — Health-check do container pinado: `docker inspect --type container --format '{{.State.Running}}' <nome>`, classificado só por exit code + stdout.**
· *Decisão*: quatro estados (`running`/`stopped`/`unavailable`/`unknown`), derivados de `ENOENT`/falha de spawn, exit `0` com `'true'`/`'false'`/outro, e exit `!= 0`. **Nunca** parse de stderr. O argv inclui `--type container`.
· *Porquê*: ADR-0027(c) nomeia `docker inspect` como o health-check; `--format` devolve um token estável e legível por máquina, sem depender de JSON completo nem de locale. `--type container` fecha na origem a ambiguidade do `inspect` sem tipo, que resolve o nome por **tipo automático** (container → imagem → volume → rede) e poderia devolver exit `0` para uma **imagem** homônima, com stdout que cairia em `'unknown'` por acidente em vez de por decisão; restringir o objeto inspecionado é a "operação mais restrita possível" que o ADR-0027(h) pede. O texto de stderr do Docker ("No such object", "Cannot connect to the Docker daemon") é instável e localizável — classificar por ele seria frágil e traria texto de terceiro para dentro do domínio, contra a Restrição 9 e o padrão da SPEC-0056 (`GitRootError` classificado por `reason`, nunca por mensagem crua).
· *Alternativa descartada*: `docker inspect` **sem** `--type` — descartada pela resolução por tipo automático acima; o desfecho certo pelo motivo errado é dívida de auditoria. Também descartada `docker ps --filter name=<nome>` — casa por substring/prefixo e poderia reportar o estado de **outro** container; além disso não distingue "não existe" de "existe parado". Também descartada `docker inspect` com JSON completo + parse — mais superfície, mesma informação.
· *Consequência assumida*: "container inexistente" e "daemon inacessível" colapsam em `'unknown'` → `reason: 'container-unknown'`. A mensagem pinada (D12) nomeia **as duas** possibilidades, em vez de afirmar a errada. Refinar exigiria parse de stderr — recusado acima.

**D10 — Start/stop pinados: `docker start <nome>` e `docker stop <nome>`, argv em array, nunca `shell`.**
· *Decisão*: contrato de invocação pinado como dado desta SPEC (molde da SPEC-0040); `stopSearchContainer` ignora qualquer desfecho e nunca lança.
· *Porquê*: ADR-0027(h) restringe o Docker à operação mais estreita possível e nomeia explicitamente só o `start` — `docker start` é exatamente "ligar o que o usuário já criou". **`docker stop` não deriva de (h), e sim da cláusula (e)** (simetria: o Atlas desliga o que o Atlas subiu); a nota de atualização do ADR-0027 (item 8 do Escopo) registra essa rastreabilidade por escrito, para que uma auditoria futura não precise inferi-la. `docker stop` já implementa por si a escalada `SIGTERM` → timeout → `SIGKILL` do próprio Docker, então não replicamos a escalada manual que o adaptador do Ollama precisa fazer sobre o `ChildProcess`.
· *Alternativa descartada*: `docker start --attach` ou aguardar logs — prenderia o processo do Atlas à vida do container, o oposto do desejado. Também descartada `docker restart` (derrubaria um container saudável) e `docker rm -f`/`docker kill` no `stop`: são **destrutivos** e não cabem nem em (e) (desligar ≠ destruir) nem em (h) (que nomeia só `start`) — a leitura correta é que o conjunto autorizado é `inspect`/`start` por (h)+(c) e `stop` por (e), e **nada mais**.

**D11 — Prontidão do container: polling de 20 × 250 ms (5 s) sobre `inspect`, não sobre o HTTP do serviço.**
· *Decisão*: orçamento de 5 s, mesma ordem pinada do laço da SPEC-0060 (`sleep` antes de cada tentativa); prontidão = `State.Running === true`.
· *Porquê*: `docker start` já retorna depois de o container ter sido iniciado, então o laço cobre apenas o assentamento do estado e protege contra o caso real de container que sobe e sai imediatamente (má configuração) — ser reportado como `'started'` nesse caso seria mentira. O orçamento de 10 s do Ollama foi dimensionado para **carregamento de modelo**, que não tem análogo aqui. Testar a saúde HTTP do SearXNG exigiria `HttpPort`/`tools.searchUrl` dentro do Dependency Manager, acoplando bootstrap de infraestrutura à config de Tools e criando um segundo egress fora de `netRoots` — custo desproporcional.
· *Orçamento mantido, com o custo real medido*: o teto de 20 iterações só é **de fato pago no caminho de falha** — o laço encerra na primeira leitura `'running'`, e `docker start` normalmente já retorna com o container iniciado, então o caso saudável custa uma iteração (CA 11 pina isso: `['sleep','inspectSearchContainer']`, sem `sleep` sobrando). Um teto menor (ex.: 4 × 250 ms) atenderia o mesmo critério a 1/5 do pior caso, mas transformaria um container lento a assentar num `'failed'`/`'timeout'` — e, pela D11, `'timeout'` **mantém a posse**, isto é, o desktop derrubaria no `before-quit` um container que só demorou. Mantido em 5 s: é o lado errado de errar mais barato.
· *Alternativa descartada*: não fazer polling (confiar no exit 0 do `docker start`) — descartada pelo caso do container que morre em seguida. Também descartada reusar 40 × 250 ms — orçamento emprestado de um problema diferente, que só aumentaria o pior caso de bloqueio do comando. Também descartada sondar o endpoint de busca — ver acima; fica registrado como residual ("prontidão é do container, não do serviço").

**D12 — Avisos da CLI: stderr, textos pinados, silêncio nos desfechos sem novidade.**
· *Decisão*:
  - `'started'` ⇒ `Container de busca "<nome>" iniciado automaticamente pelo Atlas.`
  - `'failed'`/`docker-unavailable` ⇒ `Não foi possível iniciar o container de busca "<nome>": binário "docker" não encontrado ou não executável. Seguindo sem auto-start.`
  - `'failed'`/`container-unknown` ⇒ `Não foi possível iniciar o container de busca "<nome>": o Docker não reconheceu esse container (inexistente ou daemon inacessível). O Atlas nunca cria containers. Seguindo sem auto-start.`
  - `'failed'`/`start-failed` ⇒ `Não foi possível iniciar o container de busca "<nome>": o Docker recusou o start. Seguindo sem auto-start.`
  - `'failed'`/`timeout` ⇒ `Não foi possível iniciar o container de busca "<nome>": não ficou em execução após 5s. Seguindo sem auto-start.`
  - `'disabled'` e `'already-running'` ⇒ **nada**.
· *Porquê*: Artigo 7 exige avisar a falha; stdout é o canal da resposta e precisa continuar scriptável; silêncio no caso normal evita ruído em toda invocação (mesma política da SPEC-0060/D13). A mensagem de `container-unknown` declara explicitamente o limite do ADR-0027(h), que é a dúvida imediata de quem lê "não reconheceu".
· *Alternativa descartada*: interpolar o stderr do `docker` na mensagem — proibido pela Restrição 9 (texto de terceiro na interface, mensagens não testáveis por igualdade). Também descartada falhar o comando em `'failed'` — proibido pelo ADR-0027(f).

**D13 — Linha de `atlas status`: `search container auto-start: …`, logo abaixo da linha do Ollama.**
· *Decisão*: **quatro** textos exaustivos — `desligado` · `"<nome>" (já em execução)` · `"<nome>" (iniciado pelo Atlas)` · `"<nome>" (falhou: <reason>)`. A linha é função **total** do `DependencyReport`; a seleção do desfecho passa a ser por `dependency`, nunca por índice.
· *Porquê*: o ADR-0027 nomeia `atlas status` como a superfície de auditoria desta capacidade; o padrão de acréscimo das SPECs 0055/0057/0060 põe campo novo no fim da lista, sem reordenar. Os quatro desfechos mapeiam 1:1 nos quatro textos — nenhum estado sem texto, nenhum texto sem estado (lição da SPEC-0060/D14). O nome aparece porque a identidade do alvo é escolhida pelo usuário (D3).
· *Alternativa descartada*: uma linha única combinando as duas dependências (`auto-start: ollama=…, busca=…`) — descartada por quebrar o formato `chave: valor` de uma linha por assunto que o `status` mantém desde a SPEC-0003 e por dificultar o teste por igualdade de linha. Também descartada derivar a linha só da config — não distinguiria "ligado e funcionou" de "ligado e falhou".

**D14 — Desktop: só log no main process, com narrowing por dependência.**
· *Decisão*: `'started'` ⇒ `console.info('Atlas: container de busca "<nome>" iniciado automaticamente pelo Atlas.')`; `'failed'` ⇒ `console.warn('Atlas: não foi possível iniciar o container de busca "<nome>" (<reason>).')`; `'disabled'`/`'already-running'` ⇒ nada. Env inválida ⇒ desligado + `console.warn` pinado.
· *Porquê*: ADR-0027(f) aceita "linha de `atlas status`/log"; a SPEC-0060/D25 já decidiu a divergência CLI (falha alto) × desktop (degrada e avisa) por impossibilidade estrutural de falhar alto em `app.whenReady()` sem arriscar a janela não abrir. Reaproveitar a decisão evita reabri-la.
· *Alternativa descartada*: lançar no desktop para valor inválido — proibido pelo ADR-0027(f). Também descartada mostrar no painel `Sistema` — ver D15.

**D15 — Sem superfície de GUI nesta fatia.**
· *Decisão*: nenhum painel, canal IPC, `#global-alert` ou diálogo para o auto-start do container.
· *Porquê*: conter o diff a `core-bridge.ts` + `main.ts` preserva o gate de paridade renderer↔módulo intocado e evita repetir, numa fatia de infraestrutura, o custo de uma fatia de UI. Precedente direto e já validado: SPEC-0055/D17 deixou o desktop sem UI de rede e a SPEC-0059 fechou depois; SPEC-0060/D15 fez o mesmo para o Ollama e o residual segue nomeado.
· *Alternativa descartada*: aproveitar o painel de rede/busca da SPEC-0059 (que já trata `searchUrl`) para incluir o nome do container — tentador pela proximidade temática, mas exigiria canal IPC novo, mutex de política, testes de renderer e uma decisão sobre durabilidade da seleção; dobra a fatia por um sinal que aparece uma vez por sessão. Fica como candidato nomeado, junto com o resíduo equivalente da SPEC-0060.

**D16 — Só o binário `docker`; nenhum suporte explícito a runtimes alternativos ou host remoto.**
· *Decisão*: o adaptador invoca `docker` pelo PATH; Podman/nerdctl/binário configurável ficam fora, e `DOCKER_HOST` é honrado implicitamente pelo próprio binário, sem tratamento nosso.
· *Porquê*: o ADR-0027 fala de "container Docker" e do socket do Docker; tornar o binário configurável abriria um caminho de execução com nome de programa vindo de config — exatamente o tipo de superfície que a Restrição 3 e o ADR-0027(b) recusam. Quem usa Podman normalmente tem um alias/`podman-docker` no PATH, e passa a funcionar sem nós decidirmos nada.
· *Alternativa descartada*: `dependencies.containerRuntime: 'docker' | 'podman'` — generalização sem segundo consumidor real (ADR-0007) e com custo de superfície; reavaliável numa fatia futura, com pedido concreto. Também descartada aceitar caminho absoluto de binário por config — transformaria a config num vetor de execução arbitrária.

**D17 — Prioridade `Medium`.**
· *Decisão*: `Medium`.
· *Porquê*: mesma classe da SPEC-0060/D20 — conveniência operacional real (PRD/Assistência: "realizar pesquisas"; Execução: "automatizar atividades repetitivas"), sem fechar item `gate` do Roadmap, sem desbloquear capacidade nova e sem corrigir risco de segurança.
· *Alternativa descartada*: `Low` — descartada porque é a **última** SPEC candidata do ADR-0027 e fechá-la encerra o ADR por inteiro, o que tem valor de higiene documental acima de um item puramente cosmético. `High` — descartada porque nenhuma outra fatia está bloqueada por esta.
