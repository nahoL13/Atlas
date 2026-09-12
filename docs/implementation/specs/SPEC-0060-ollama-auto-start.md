# SPEC-0060 — Auto-start do Ollama (CLI + desktop)

> **Project Atlas — Implementation Specification**

Template: 1.2

---

# Informações Gerais

**ID**

SPEC-0060

---

**Título**

Auto-start do Ollama sob opt-in explícito: `createDependencyManager` + `ProcessPort` em `@atlas/core`, disparado uma vez por processo em `apps/cli` e uma vez por sessão de app em `apps/desktop`, degradando sem nunca bloquear o boot.

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

Justificativa completa na Decisão **D1** ("Decisões de design").

---

**Item do Roadmap**

**Exceção consciente registrada.** Nenhum item de `docs/04-engineering/Roadmap.md` cobre hoje "auto-gerência de processo externo" — a capacidade nasceu do pedido do usuário de 2026-08-22 e foi desenhada pelo [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md) (`Accepted`), que nomeia esta SPEC explicitamente como sua **2ª SPEC de consumo** ("Auto-start do Ollama, CLI e desktop").

Item mais próximo por afinidade: **Fase 1 — 1.4 Capacidades de Plataforma** (a dependência gerenciada é a do provedor `local` do Model Gateway). Esta SPEC **não fecha** o item 1.4 nem qualquer outro item de Roadmap. O `doc-sync` de fecho deve acrescentar ao item 1.4 a linha correspondente ao ADR-0027 e às suas três SPECs candidatas — a criação do item é passo de fecho, não deste rascunho (que não edita outros arquivos).

---

# Objetivo

Quando esta SPEC estiver concluída, o Atlas deve ser capaz de **garantir que o Ollama esteja de pé** antes de o usuário precisar dele, sem que ninguém rode `ollama serve` à mão — desde que o usuário tenha ligado essa automação **explicitamente**.

Concretamente, devem existir:

1. Em `@atlas/core`, uma unidade **nova e independente do `Lifecycle` de `createAtlas`** — `createDependencyManager({ process?, sleep? })` → `{ ensure(config), release() }` — exportada ao lado de `createLifecycle`, com a porta injetável `ProcessPort` (três operações **nomeadas e fixas** sobre a dependência `ollama`, nunca execução de comando arbitrário) e um adaptador real default `nodeProcessPort()`.
2. Em `@atlas/contracts`, o namespace de config `dependencies: { autoStartOllama: boolean }` (default `false`, fail-closed), no molde exato de `tools: { searchUrl }` da SPEC-0057.
3. Em `apps/cli`, a flag `--auto-start-ollama` e a variável `ATLAS_AUTO_START_OLLAMA`, o disparo **único por processo** em `run.ts`, a linha de aviso em `stderr` quando (e só quando) há algo a dizer, e uma linha nova em `atlas status`.
4. Em `apps/desktop`, o disparo **único por sessão de app** (`app.whenReady()`) e o desligamento do que a própria sessão subiu (`before-quit`), com a lógica em `core-bridge.ts` (testável sem Electron) e `main.ts` como casca fina.

Em qualquer caminho de falha, o CLI e a janela **abrem do mesmo jeito**; a capacidade dependente degrada exatamente como degradava antes desta SPEC existir.

---

# Motivação

O usuário pediu, em 2026-08-22, para não precisar mais subir manualmente o Ollama antes de cada sessão com o Atlas. O provedor `local` do `@atlas/model-gateway` (`packages/model-gateway/src/providers/ollama.ts`) fala com `${baseUrl}/api/chat` e falha com `ModelGatewayError('Falha ao conectar ao Ollama.')` quando o daemon não está de pé — hoje o `apps/cli` já responde a isso com a dica *"verifique se o Ollama está rodando (ollama serve)"* (`run.ts`), o que documenta o atrito, não o resolve.

O `spec-drafter` escalou o desenho na ocasião; o usuário aprovou abrir o [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md), hoje `Accepted`, que decidiu **toda a arquitetura**: dono (`createDependencyManager`, não o `Lifecycle` de `createAtlas`), granularidade (uma vez por app, nunca por `createAtlas()`), simetria (só o desktop desliga o que subiu), modo de falha (degrada, nunca bloqueia) e a exclusão explícita do Permission Service. O ADR delegou à SPEC apenas o **contrato técnico** (nomes de flag/env, schema em `AtlasConfig`, forma exata do `ProcessPort` e seu fake, mensagens de erro, formato da linha em `atlas status`) — que é exatamente o que este documento decide.

Rastreabilidade ao PRD (`docs/02-product/ProductRequirementsDocument.md`):

- **Execução** — *"O sistema deve automatizar atividades repetitivas."* Subir o Ollama antes de cada sessão é a atividade repetitiva mais literal da rotina atual do usuário.
- **Critérios de Qualidade** — *"simplicidade para o usuário"* e *"transparência"* (a automação é opt-in, visível em `atlas status` e avisa quando falha).
- **Escopo Inicial** — *"execução de tarefas locais"*; **Restrições** — *"O Atlas não deverá depender permanentemente de um único modelo de inteligência artificial"* (o provedor local é justamente o que sustenta a alternativa ao provedor pago).

---

# Referências

- [ADR-0027 — Auto-gerência de processos externos](../../06-adr/ADR-0027-external-process-lifecycle-management.md) (`Accepted`) — **fonte primária desta SPEC**; cláusulas (a)–(h).
- [ADR-0006 — Precedência de fontes de configuração](../../06-adr/ADR-0006-config-source-precedence.md) — `flags > env > arquivo > defaults`; validação no core, borda repassa cru.
- [ADR-0004 — Composição manual](../../06-adr/ADR-0004-manual-composition.md) — dependências explícitas por parâmetro, sem container de DI.
- [ADR-0003 — Composition root em `@atlas/core`](../../06-adr/ADR-0003-core-composition-root.md) — quem pode importar implementação de quem.
- [ADR-0013 — Permission Service como portão de execução](../../06-adr/ADR-0013-permission-service-execution-gate.md) — **não reaberto**; ver ADR-0027(a).
- [ADR-0026 — Network Access Gate](../../06-adr/ADR-0026-network-access-gate.md) — **não reaberto**; o health-check do Ollama não é uma Tool e não passa por `netRoots` (ver D10).
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — **Lifecycle Manager** (`packages/core`): "verificação de dependências", "ativação de componentes", "desligamento seguro".
- [PRD](../../02-product/ProductRequirementsDocument.md) — Execução (automatizar atividades repetitivas), Critérios de Qualidade.
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigo 7 (transparência), Artigo 8 (autorização), Artigo 11 (autoridade da Memory sobre estado persistente — nada desta SPEC persiste).
- [SPEC-0057](SPEC-0057-web-search-tool.md) (`Done`) — molde do namespace de módulo em `AtlasConfig` (`tools.searchUrl`), do registro condicional e da linha em `atlas status`.
- [SPEC-0055](SPEC-0055-http-get-network-access.md) (`Done`) — molde de flag/env dedicada e opt-in fail-closed na CLI.
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) (`Done`) — molde de `resolveDataDir` (resolvedor parcial de config, puro, sem tocar `persona`), reusado por D8.
- [SPEC-0046](SPEC-0046-desktop-voice-input-stt.md) (`Done`) — molde de porta de subprocesso injetável no main process (`spawn` por argv array, nunca `shell: true`; `SIGTERM` → 2 s → `SIGKILL`).
- [SPEC-0040](SPEC-0040-desktop-piper-neural-tts.md) (`Done`) — molde de contrato de invocação de binário externo **pinado como dado da SPEC**.

---

# Escopo

## 1. `@atlas/contracts` — namespace de config `dependencies`

1.1. `AtlasConfig` ganha `readonly dependencies: { readonly autoStartOllama: boolean }` — **obrigatório** na config resolvida (paridade com `permissions`/`tools`), ainda que nenhum consumidor dentro de `@atlas/core` o leia nesta fatia (primeiro namespace da plataforma nessa condição). Justificativa completa em **D24**.

1.2. `AtlasConfigOverride` ganha `dependencies?: { readonly autoStartOllama?: boolean }`.

1.3. Teste de tipo negativo (`@ts-expect-error`) em `packages/contracts/tests/config.test.ts`, molde exato do que as SPECs 0055/0057 fizeram para `netRoots`/`tools`.

## 2. `@atlas/core` — Dependency Manager, `ProcessPort` e resolvedor de config

2.1. `packages/core/src/config/defaults.ts`: `dependencies: { autoStartOllama: false }` (fail-closed).

2.2. `packages/core/src/config/load-config.ts`: merge (`override.dependencies?.autoStartOllama ?? defaults...`) e validação (`typeof === 'boolean'`, com issue nomeada).

2.3. `packages/core/src/config/dependency-config.ts` (**novo**) — molde exato de `data-dir.ts`/`resolveDataDir` (SPEC-0039/D17):
   - `DependencyConfig { readonly autoStartOllama: boolean; readonly ollamaBaseUrl: string }`;
   - `resolveDependencyConfig(override?: AtlasConfigOverride): DependencyConfig` — **puro, sem IO**, mesma precedência de `loadConfig`, **sem nunca validar `persona`** (não aciona `PERSONA_IDS`);
   - `parseBooleanSetting(raw: string | undefined): { kind: 'unset' } | { kind: 'value'; value: boolean } | { kind: 'invalid'; received: string }` — coerção pura de string de ambiente para booleano, **origem única** consumida pelas duas bordas (D6);
   - os helpers de merge/validação são compartilhados com `loadConfig` (nunca duas implementações da mesma precedência).

2.4. `packages/core/src/dependencies/process-port.ts` (**novo**) — a porta injetável do ADR-0027(c), **não genérica**:

```ts
export type OllamaStartOutcome =
  | { readonly started: true }
  | { readonly started: false; readonly reason: 'binary-missing' | 'spawn-failed' };

export interface ProcessPort {
  isOllamaRunning(baseUrl: string): Promise<boolean>;
  startOllama(): Promise<OllamaStartOutcome>;
  stopOllama(): Promise<void>;
}
```

2.5. `packages/core/src/dependencies/node-process-port.ts` (**novo**) — `nodeProcessPort(deps?: { fetch?: typeof fetch })`, adaptador real, com o **contrato de invocação pinado como dado desta SPEC** (D11/D12):
   - health-check: `GET <baseUrl>/api/tags`, `AbortSignal.timeout(2000)`; qualquer resposta HTTP com `response.ok === true` ⇒ `true`; qualquer outro status, erro de rede, timeout ou exceção ⇒ `false` (**nunca lança**);
   - start: `spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' })` + `child.unref()` — argv **array**, nunca `shell: true`, nunca caminho absoluto adivinhado, nenhum download/instalação; `ENOENT` ⇒ `{ started: false, reason: 'binary-missing' }`; qualquer outra falha de spawn ⇒ `'spawn-failed'`;
   - stop: `child.kill('SIGTERM')` sobre o filho que **este adaptador** iniciou; se ainda vivo após 2 s, `child.kill('SIGKILL')`; sem filho registrado, no-op; **nunca lança**.

2.6. `packages/core/src/dependencies/dependency-manager.ts` (**novo**):

```ts
export type OllamaFailureReason = 'binary-missing' | 'spawn-failed' | 'timeout';

export type DependencyOutcome =
  | { readonly dependency: 'ollama'; readonly status: 'disabled' }
  | { readonly dependency: 'ollama'; readonly status: 'already-running' }
  | { readonly dependency: 'ollama'; readonly status: 'started' }
  | { readonly dependency: 'ollama'; readonly status: 'failed'; readonly reason: OllamaFailureReason };

export interface DependencyReport {
  readonly outcomes: readonly DependencyOutcome[];
}

export interface DependencyManager {
  ensure(config: DependencyConfig): Promise<DependencyReport>;
  release(): Promise<void>;
}

export function createDependencyManager(deps?: {
  process?: ProcessPort;
  sleep?: (ms: number) => Promise<void>;
}): DependencyManager;
```

   Comportamento normativo de `ensure(config)`:
   - `autoStartOllama === false` ⇒ devolve `{ outcomes: [{ dependency: 'ollama', status: 'disabled' }] }` **sem tocar a porta** (nenhum health-check, nenhum spawn);
   - ligado e `isOllamaRunning(config.ollamaBaseUrl) === true` ⇒ `'already-running'`, **sem spawn**;
   - ligado e não rodando ⇒ `startOllama()`; `started: false` ⇒ `'failed'` com a `reason` da porta, **sem** registro de posse (nada foi iniciado);
   - `started: true` ⇒ **registro de posse imediato**, no mesmo `await`, **antes** de qualquer espera (D23) — o desfecho do polling não influencia a posse;
   - em seguida, **prontidão por polling**, com a ordem pinada (D12/A7): repetir **até 40 vezes** o par ordenado `await sleep(250)` → `await isOllamaRunning(config.ollamaBaseUrl)`; o **`sleep` vem sempre primeiro** (o daemon acabou de ser spawnado e nunca responde no instante zero), e a 40ª iteração completa o orçamento de 10 s. `true` em qualquer iteração ⇒ `'started'` (encerra o laço imediatamente, sem `sleep` sobrando); 40 iterações sem `true` ⇒ `'failed'` com `reason: 'timeout'` — **com a posse mantida** (foi esta instância que spawnou o processo, ainda que ele não tenha ficado pronto a tempo);
   - **nunca lança**: qualquer rejeição vinda da porta injetada é capturada e vira `'failed'` com `reason: 'spawn-failed'`; se a rejeição ocorrer **depois** de um `startOllama()` que já devolveu `started: true`, a posse registrada é **preservada** (o processo pode estar vivo e precisa continuar derrubável);
   - **idempotente por instância**: a 1ª chamada é memoizada (a própria promessa); chamadas seguintes devolvem o mesmo `DependencyReport` sem novo health-check nem novo spawn.

   **Fonte única da verdade sobre posse (D23):** um único campo booleano privado do **manager** (`started === true` devolvido por `startOllama()` ⇒ posse desta instância). O adaptador guarda apenas o *handle* do filho para conseguir sinalizá-lo e **nunca decide** se deve parar: `stopOllama()` sem filho registrado é no-op silencioso. Não existe segunda estrutura de posse (nem no adaptador, nem nos apps, nem em disco).

   Comportamento normativo de `release()`:
   - chama `stopOllama()` **exatamente quando** esta instância registrou posse — isto é, quando o `startOllama()` desta instância devolveu `started: true`, **inclusive** quando o desfecho final foi `'failed'`/`reason: 'timeout'` (ADR-0027(e): "derrubar o que o próprio Atlas subiu" é sobre o *spawn*, não sobre o daemon ter ficado pronto);
   - sem posse (`'disabled'`, `'already-running'`, `'failed'` com `reason` `'binary-missing'`/`'spawn-failed'`) ⇒ no-op, **sem tocar a porta**;
   - limpa a posse e a memoização; **nunca lança**; chamadas repetidas não repetem `stopOllama()`.

2.7. `packages/core/src/index.ts`: exporta `createDependencyManager`, `nodeProcessPort`, `resolveDependencyConfig`, `parseBooleanSetting` e os tipos (`DependencyManager`, `DependencyConfig`, `DependencyReport`, `DependencyOutcome`, `OllamaFailureReason`, `ProcessPort`, `OllamaStartOutcome`) — ao lado de `createLifecycle`/`resolveDataDir`. **`createAtlas` sai sem uma linha alterada** (ADR-0027(d)).

## 3. `@atlas/model-gateway` — origem única do endereço default do Ollama

3.1. `DEFAULT_BASE_URL` (hoje constante privada de `providers/ollama.ts`) é **exportada** como `OLLAMA_DEFAULT_BASE_URL` e re-exportada por `packages/model-gateway/src/index.ts`; `createOllamaProvider` passa a consumir a mesma constante exportada. **Zero mudança de comportamento, zero mudança em `@atlas/contracts`** (D9).

3.2. `resolveDependencyConfig` deriva `ollamaBaseUrl` **condicionado ao provider efetivo** (D22), porque `model.baseUrl` é um campo **compartilhado** pelos providers `local` e `remote` (`packages/model-gateway/src/providers/{ollama,remote}.ts`):

```text
providerEfetivo = override.model?.provider ?? defaultConfig().model.provider   // hoje 'local'
ollamaBaseUrl   = providerEfetivo === 'local'
                    ? (override.model?.baseUrl ?? OLLAMA_DEFAULT_BASE_URL)
                    : OLLAMA_DEFAULT_BASE_URL
```

   A comparação é por **igualdade exata** com `'local'`: qualquer outro valor — `'remote'`, `'fake'`, ou uma string inválida que só `loadConfig` rejeitaria — cai em `OLLAMA_DEFAULT_BASE_URL`. `resolveDependencyConfig` continua **puro e sem validação** (não valida `provider`, como já não valida `persona`): um provider desconhecido não lança aqui, apenas não é `'local'`.

## 4. `apps/cli`

4.1. `src/gateway/input-gateway.ts`: flag booleana `--auto-start-ollama` (não repetível) e variável `ATLAS_AUTO_START_OLLAMA`, precedência `flag > env` (a flag presente ⇒ `true`); a env é coerida por `parseBooleanSetting` (`@atlas/core`); `kind: 'invalid'` ⇒ `CliUsageError` nomeando os valores aceitos; `kind: 'unset'` (ausente, vazia ou só espaços) ⇒ `override.dependencies` **não é setado** (cai no default `false` do core).

4.2. `src/run.ts`: **um único** ponto de disparo por processo — depois dos desvios de `help`/`version`/`persona` e **imediatamente antes** de `createAtlas` (D7): `const dependencies = createDependencyManager(); const report = await dependencies.ensure(resolveDependencyConfig(parsed.configOverride));`. A CLI **nunca** chama `release()` (ADR-0027(e)).

4.3. `src/gateway/output-gateway.ts` não muda; o aviso vai por `output.error` (**stderr**), com os textos pinados de D13, e **só** nos desfechos `'started'` e `'failed'`. `'disabled'` e `'already-running'` são silenciosos.

4.4. `src/commands/status.ts`: `runStatus(atlas, output, report)` ganha a linha `ollama auto-start: …`, com os **quatro** textos pinados de D14. O terceiro parâmetro é **obrigatório**, não opcional (A4): `run.ts` sempre executa `ensure` antes de `createAtlas` (D7), então `atlas status` sempre tem um `DependencyReport` em mãos e o estado "ligado, mas não verificado" é inalcançável em produção. Um parâmetro opcional exigiria um quinto texto que nenhum caminho real produz.

4.5. `HELP_TEXT` documenta a flag e a env, incluindo a nota de que o Atlas **nunca instala nem baixa** o Ollama.

## 5. `apps/desktop`

5.1. `src/core-bridge.ts` ganha duas funções exportadas e **uma única** instância de módulo do `DependencyManager` (molde do acumulador de tokens da SPEC-0054):
   - `ensureExternalDependencies(): Promise<DependencyReport>` — resolve a config por `resolveDependencyConfig({ dependencies: { autoStartOllama: <env coerida> } })`, com a env lida de `process.env['ATLAS_AUTO_START_OLLAMA']` pela **mesma** `parseBooleanSetting`. Esta é a **primeira leitura de `process.env` em `core-bridge.ts`** (hoje o módulo só recebe `configOverride` por IPC); o precedente de ler env no main process já existe em `main.ts` (`ATLAS_PIPER_DIR`/`ATLAS_STT_DIR`, SPECs 0040/0046), e a leitura fica no `core-bridge` — e não no `main.ts` — porque é lá que ela é testável sem Electron (D25). Para manter a função pura o suficiente para teste, o `env` é um parâmetro injetável com default `process.env` (`ensureExternalDependencies(env = process.env)`);
   - `kind: 'invalid'` ⇒ tratado como **desligado** (fail-closed) mais **uma linha de `console.warn` pinada** — `Atlas: valor inválido em ATLAS_AUTO_START_OLLAMA; auto-start do Ollama desligado.` —, nunca uma exceção. Divergência deliberada e justificada em relação ao `CliUsageError` da CLI (D6): ver **D25**;
   - `releaseExternalDependencies(): Promise<void>` — delega a `release()`; nunca lança.
   - Ambas são **deliberadamente não rastreadas** pelo registro de operação em voo da SPEC-0051 (não sobem Core, não executam Tools) — nenhuma guarda de gesto muda.

5.2. `src/main.ts` (casca fina): `void ensureExternalDependencies()` dentro do callback de `app.whenReady()` e `void releaseExternalDependencies()` no handler `before-quit`, ao lado do teardown já existente (`closeAllChatSessions`/`piperTts.shutdown`). **Nenhum canal IPC novo, nenhum diff no renderer.**

5.3. Superfície de transparência no desktop nesta fatia: **linha de log no main process** (`'started'` ⇒ `console.info`; `'failed'` ⇒ `console.warn` com a `reason`), conforme ADR-0027(f) ("linha de `atlas status`/log"). GUI fica fora (D15, residual nomeado).

## 6. Testes

Conforme "Estratégia de Testes".

## 7. Documentação da própria SPEC

Nota de atualização no ADR-0027 registrando que a 2ª SPEC nomeada foi implementada por esta, com o contrato técnico que o ADR delegou (nomes de flag/env, schema, forma da porta, mensagens) — sem alterar nenhuma cláusula (a)–(h).

---

# Fora do Escopo

- **Não** implementar o auto-start do container Docker do SearXNG — é a **3ª SPEC** nomeada pelo ADR-0027, fatia própria. Nenhuma operação de Docker, nenhum `containerName`, nenhuma menção a container no `ProcessPort` desta fatia (D3).
- **Não** tocar `@atlas/permissions`, `evaluate`, `ResourceType`/`ResourceRef`, `isContained`, `netRoots` nem o Runtime — ADR-0027(a); nenhuma cláusula do ADR-0013/ADR-0026 é reaberta.
- **Não** criar Tool alguma, nem expor esta capacidade ao Planner/modelo. O auto-start nunca é escolhido por `args`.
- **Não** implementar execução de comando arbitrário nem uma porta genérica (`run(command, args)`) — ADR-0027(b); o item de Roadmap 1.4 "execução de comandos sob o Permission Service" continua intocado, sem ser consumido nem reaberto.
- **Não** pendurar nada nos hooks `onStart`/`onShutdown` do `createLifecycle` existente, e **não** alterar `createAtlas` — ADR-0027(d).
- **Não** instalar, baixar (`ollama pull`), atualizar ou configurar o Ollama; **não** verificar se o modelo de `config.model.model` existe. O host precisa ter o binário — custo assumido pelo ADR-0027 ("Dependência operacional nova mesmo em modo degradado").
- **Não** supervisionar o processo depois do `ensure` (sem health-check periódico, sem restart automático, sem watchdog, sem streaming/captura dos logs do Ollama).
- **Não** fazer a CLI chamar `release()` em nenhum caminho — ADR-0027(e); a assimetria CLI × desktop é deliberada.
- **Não** persistir nada (Artigo 11): a posse é estado de módulo em memória, morre com o processo; nenhum arquivo, nenhum PID em disco.
- **Não** adicionar superfície de GUI (painel, canal IPC, `#global-alert`, painel `Sistema`, diálogo nativo) para o auto-start — D15, residual nomeado, molde do que a SPEC-0055/D17 fez e a SPEC-0059 depois fechou.
- **Não** implementar o slot `arquivo` da precedência do ADR-0006 (segue não implementado, como em toda a plataforma).
- **Não** tocar `@atlas/cognitive`, `@atlas/tools`, `@atlas/runtime`, `@atlas/skills`, `@atlas/memory`, `@atlas/context`, `@atlas/persona`, `apps/desktop/src/renderer/*`, `piper-tts.ts`, `stt-engine.ts`, `hands-free.ts` — diff esperado **vazio** nesses alvos.
- **Não** emendar a Constituição, criar módulo novo, mover responsabilidade entre módulos nem abrir ADR novo.

---

# Pré-requisitos

- [SPEC-0002](SPEC-0002-core-bootstrap.md) — **Done** (contratos públicos, `AtlasConfig`, `createLifecycle`).
- [SPEC-0003](SPEC-0003-cli-foundation.md) — **Done** (Input/Output Gateway da CLI, precedência `flags > env`).
- [SPEC-0004](SPEC-0004-model-gateway.md) — **Done** (provider `local`/Ollama, `DEFAULT_BASE_URL`, `model.baseUrl`).
- [SPEC-0031](SPEC-0031-desktop-foundation.md) — **Done** (`apps/desktop`, `core-bridge.ts` testável sem Electron, `main.ts` casca fina).
- [SPEC-0057](SPEC-0057-web-search-tool.md) — **Done** (molde do namespace de módulo em `AtlasConfig` + linha em `atlas status`).
- [ADR-0027](../../06-adr/ADR-0027-external-process-lifecycle-management.md) — **Accepted** (não é SPEC, mas é o pré-requisito real desta fatia).

---

# Critérios de Aceitação

Cada item é verificável mecanicamente (teste automatizado, `typecheck`, `lint` ou `grep` no diff).

**Contratos e config**

1. `AtlasConfig.dependencies.autoStartOllama` existe e é obrigatório; `AtlasConfigOverride.dependencies?.autoStartOllama?` é opcional; o teste de tipo negativo com `@ts-expect-error` está em `packages/contracts/tests/config.test.ts` e o package passa em `pnpm --filter @atlas/contracts typecheck`.
2. `loadConfig({})` devolve `dependencies.autoStartOllama === false`; `loadConfig({ dependencies: { autoStartOllama: true } })` devolve `true`; um valor não booleano produz `InvalidConfigError` com issue que cita `dependencies.autoStartOllama`.
3. `resolveDependencyConfig({})` devolve `{ autoStartOllama: false, ollamaBaseUrl: OLLAMA_DEFAULT_BASE_URL }`; `resolveDependencyConfig({ persona: 'inexistente' })` **não lança** (não valida `persona`).
3a. A derivação de `ollamaBaseUrl` é condicionada ao provider efetivo (D22), pinada por tabela de teste: `{ model: { baseUrl: 'http://x:1' } }` (provider omitido ⇒ default `'local'`) ⇒ `'http://x:1'`; `{ model: { provider: 'local', baseUrl: 'http://x:1' } }` ⇒ `'http://x:1'`; `{ model: { provider: 'remote', baseUrl: 'https://api.terceiro.com', apiKey: 'k' } }` ⇒ `OLLAMA_DEFAULT_BASE_URL`; `{ model: { provider: 'fake', baseUrl: 'http://x:1' } }` ⇒ `OLLAMA_DEFAULT_BASE_URL`; `{ model: { provider: 'inexistente' as never, baseUrl: 'http://x:1' } }` ⇒ `OLLAMA_DEFAULT_BASE_URL` e **não lança**.
3b. Teste de não-regressão do vazamento nomeado pelo veto: com `{ dependencies: { autoStartOllama: true }, model: { provider: 'remote', baseUrl: 'https://api.terceiro.com', apiKey: 'k' } }`, o `ProcessPort` fake registra `isOllamaRunning` **apenas** com `OLLAMA_DEFAULT_BASE_URL` — nenhuma chamada carrega o host de terceiro.
4. `parseBooleanSetting` é exaustiva e pinada: `'1'`/`'true'`/`'yes'`/`'on'` (qualquer caixa, com espaços em volta) ⇒ `{ kind: 'value', value: true }`; `'0'`/`'false'`/`'no'`/`'off'` ⇒ `value: false`; `undefined`/`''`/`'   '` ⇒ `{ kind: 'unset' }`; qualquer outra string ⇒ `{ kind: 'invalid', received: <cru> }`.

**Dependency Manager**

5. Com `autoStartOllama: false`, `ensure` devolve o único desfecho `'disabled'` e o `ProcessPort` fake registra **zero** chamadas (nenhum `isOllamaRunning`, nenhum `startOllama`).
6. Com a dependência já de pé, `ensure` devolve `'already-running'` e o fake registra **zero** `startOllama`.
7. Com a dependência fora do ar e `startOllama` bem-sucedido, `ensure` devolve `'started'` **depois** de um `isOllamaRunning` verdadeiro no polling; com o polling nunca ficando verdadeiro, devolve `'failed'` com `reason: 'timeout'` após exatamente **40** chamadas de `isOllamaRunning` no laço e **40** chamadas de `sleep(250)` (contadas no fake). A ordem é pinada (item 2.6/A7): `sleep` **antes** de cada tentativa. Verificação mecânica da ordem: com um fake que registra as chamadas numa lista única, a sequência **posterior ao `startOllama`** no caminho de timeout começa por `sleep` e alterna `sleep`/`isOllamaRunning` até 80 registros; no caminho de sucesso na 1ª tentativa, a sequência é exatamente `['sleep', 'isOllamaRunning']` após o `startOllama` (nenhum `sleep` sobrando depois do `true`).
8. `startOllama` devolvendo `{ started: false, reason: 'binary-missing' | 'spawn-failed' }` produz `'failed'` com a mesma `reason`, **sem** polling.
9. Uma porta que **rejeita** em qualquer método não faz `ensure` lançar: o resultado é `'failed'` com `reason: 'spawn-failed'`.
10. `ensure` chamado duas vezes na mesma instância devolve `DependencyReport` equivalente e **não** repete health-check nem spawn (contagens do fake inalteradas na 2ª chamada).
11. `release()` chama `stopOllama` **exatamente uma vez** quando (e só quando) o `startOllama()` daquela instância devolveu `started: true` — o que cobre **dois** desfechos: `'started'` **e** `'failed'` com `reason: 'timeout'` (A2/D23). Nos desfechos `'disabled'`, `'already-running'` e `'failed'` com `reason` `'binary-missing'`/`'spawn-failed'`, o fake registra **zero** `stopOllama`. `release()` sem `ensure` prévio é no-op e não lança; `release()` duas vezes seguidas chama `stopOllama` no máximo uma vez.
11a. Teste explícito do cenário do veto: `startOllama` bem-sucedido + polling que nunca fica verdadeiro ⇒ `ensure` devolve `'failed'`/`'timeout'` **e** o `release()` seguinte chama `stopOllama` uma vez (o processo spawnado não fica órfão).
11b. Não existe segunda estrutura de posse: um `grep` no diff não encontra rastreio de "iniciado por esta sessão" fora do campo privado do `dependency-manager.ts` — em particular, `node-process-port.ts` guarda só o *handle* do filho e `stopOllama()` sem filho registrado é no-op, e `apps/cli`/`apps/desktop` não mantêm flag própria de posse.
12. `createAtlas` sai com **diff vazio** em `packages/core/src/index.ts` na parte de composição (verificável por revisão do diff): nenhum `createDependencyManager` é chamado dentro de `createAtlas`, e um `grep` por `createDependencyManager` em `packages/core/src/index.ts` casa **apenas** na linha de `export`.

**Adaptador real**

13. `nodeProcessPort` não é exercitado contra binário/daemon real em CI; seus testes cobrem só a fronteira injetável (`fetch` fake): `isOllamaRunning` devolve `true` para `ok: true`, `false` para `ok: false`, `false` para `fetch` que rejeita, e **nunca lança**.
14. `grep -R "shell: true" packages/core/src` não casa; o `spawn` do adaptador usa argv em array e `detached: true` + `unref()` (verificável por leitura e por teste com `spawn` injetável, se a implementação optar por injetá-lo).

**CLI**

15. `--auto-start-ollama` produz `configOverride.dependencies.autoStartOllama === true`; `ATLAS_AUTO_START_OLLAMA=1` também; `ATLAS_AUTO_START_OLLAMA=off` produz `false`; ausência das duas fontes produz `configOverride.dependencies === undefined`; `ATLAS_AUTO_START_OLLAMA=talvez` produz `CliUsageError` cuja mensagem lista os valores aceitos.
16. `run()` chama `ensure` **exatamente uma vez** por invocação, para `status`/`ask`/`chat`/`remember`/`forget`/`memory`/`skills`, e **zero vez** para `help`, `version` e qualquer subcomando de `persona` (verificado com um `DependencyManager` fake injetado por `CliDeps`).
17. `run()` **nunca** chama `release()` em nenhum comando.
18. Um `ensure` que devolve `'failed'` **não** altera o código de saída do comando e **não** impede o comando de rodar (o teste executa `atlas status` com desfecho `'failed'` e espera código `0` e a saída normal de status).
19. Os avisos de `'started'`/`'failed'` saem em **stderr** com os textos pinados de D13; `'disabled'`/`'already-running'` não escrevem nada (nem em stdout, nem em stderr).
20. `atlas status` imprime uma linha `ollama auto-start: …` com exatamente um dos **quatro** textos pinados de D14 (conjunto fechado e exaustivo — não existe quinto texto), na posição definida em D14; `runStatus` recebe o `DependencyReport` como parâmetro **obrigatório** (`typecheck` falha se `run.ts` o omitir).
21. `HELP_TEXT` cita `--auto-start-ollama` e `ATLAS_AUTO_START_OLLAMA`.

**Desktop**

22. `ensureExternalDependencies(env)` com `ATLAS_AUTO_START_OLLAMA` ausente devolve `'disabled'` sem tocar a porta; com `'1'`, exercita o caminho de auto-start; com valor inválido (`'talvez'`), devolve `'disabled'` (fail-closed), **não** lança e emite **exatamente uma** linha de `console.warn` com o texto pinado do item 5.1 (verificado por espião sobre `console.warn`) — enquanto a CLI, com o mesmo valor, lança `CliUsageError` (CA 15). A divergência é intencional e está registrada em **D25**.
23. `releaseExternalDependencies()` sem `ensure` prévio é no-op e não lança; após um `ensure` com `'started'`, delega o `stopOllama` uma vez.
24. Uma segunda chamada de `ensureExternalDependencies()` na mesma sessão de app não repete health-check/spawn (instância única de módulo).
25. `apps/desktop/src/main.ts` chama `ensureExternalDependencies` **só** dentro do callback de `app.whenReady()` e `releaseExternalDependencies` **só** no handler `before-quit` (verificável por `grep` no arquivo: duas ocorrências de chamada, nas posições descritas).
26. Diff **vazio** em `apps/desktop/src/renderer/*`, em todos os módulos vigiados pelo gate de paridade renderer↔módulo, e nenhum canal `'atlas:*'` novo — `apps/desktop/tests/renderer.speech-parity.test.ts` continua verde sem registro novo.

**Higiene global**

27. `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` verdes **na raiz** (os quatro comandos completos, obrigatórios antes de fechar).
28. Diff vazio em `packages/permissions`, `packages/runtime`, `packages/tools`, `packages/cognitive`, `packages/skills`, `packages/memory`, `packages/context`, `packages/persona` — e, em `packages/model-gateway`, o diff se limita à exportação da constante do item 3.1 (nenhuma mudança de comportamento; a suíte do package passa sem teste alterado, salvo o teste novo que prova a igualdade da constante exportada com o default em uso).
29. Nenhum arquivo novo é escrito em disco por nenhum caminho desta SPEC (nenhuma persistência): verificável por revisão — nenhum `writeFile`/`mkdir` é introduzido.

---

# Arquivos Esperados

```text
docs/implementation/specs/SPEC-0060-ollama-auto-start.md   (este arquivo)
docs/06-adr/ADR-0027-external-process-lifecycle-management.md   (nota de atualização, sem alterar cláusulas)

packages/contracts/src/config.ts                 (mod)
packages/contracts/tests/config.test.ts          (mod)

packages/core/src/config/defaults.ts             (mod)
packages/core/src/config/load-config.ts          (mod)
packages/core/src/config/dependency-config.ts    (novo)
packages/core/src/dependencies/process-port.ts   (novo)
packages/core/src/dependencies/node-process-port.ts (novo)
packages/core/src/dependencies/dependency-manager.ts (novo)
packages/core/src/index.ts                       (mod — só exports)
packages/core/tests/dependency-manager.test.ts   (novo)
packages/core/tests/dependency-config.test.ts    (novo)
packages/core/tests/node-process-port.test.ts    (novo)
packages/core/tests/config.test.ts               (mod)
packages/core/CLAUDE.md                          (mod — no doc-sync de fecho)

packages/model-gateway/src/providers/ollama.ts   (mod — exporta a constante)
packages/model-gateway/src/index.ts              (mod — re-export)
packages/model-gateway/tests/ollama.test.ts      (mod)

apps/cli/src/gateway/input-gateway.ts            (mod)
apps/cli/src/run.ts                              (mod)
apps/cli/src/commands/status.ts                  (mod)
apps/cli/tests/input-gateway.test.ts             (mod)
apps/cli/tests/status.test.ts                    (mod)
apps/cli/tests/auto-start-ollama.test.ts         (novo)

apps/desktop/src/core-bridge.ts                  (mod)
apps/desktop/src/main.ts                         (mod)
apps/desktop/tests/core-bridge.dependencies.test.ts (novo)
```

---

# Componentes Impactados

- **Lifecycle Manager** (`packages/core`) — dono da capacidade (Module Catalog: "verificação de dependências", "ativação de componentes", "desligamento seguro"). Ganha uma unidade nova, **independente** do `Lifecycle` de `createAtlas`.
- **Configuration Service** (`packages/core`) — namespace `dependencies` na config resolvida e o resolvedor parcial `resolveDependencyConfig`.
- **`@atlas/contracts`** — formato do dado de config (mudança aditiva em `AtlasConfigOverride`, obrigatória em `AtlasConfig`).
- **Model Gateway** (`packages/model-gateway`) — apenas exporta a constante de endereço default que já possuía; nenhuma mudança de comportamento, nenhuma autoridade nova (ADR-0027, alternativa "descentralizar" rejeitada).
- **Input/Output Gateway** (`apps/cli`) — flag/env, disparo único, aviso em stderr, linha de `atlas status`.
- **`apps/desktop`** — `core-bridge.ts` (lógica) e `main.ts` (casca fina de ciclo de vida da app).

Explicitamente **não impactados**: Permission Service, Runtime, Task Manager, Tool Registry, Cognitive Core, Planner, Skill Registry, Memory Service, Context Service, Persona Service, renderer do desktop.

---

# Interfaces Necessárias

1. `ProcessPort` (`@atlas/core`) — três operações nomeadas e fixas (item 2.4). **Nunca** um método genérico de execução de comando.
2. `OllamaStartOutcome` — união discriminada por `started`.
3. `DependencyManager` — `ensure(config)` / `release()` (ADR-0027(d)).
4. `DependencyConfig` — `{ autoStartOllama, ollamaBaseUrl }`, produzido só por `resolveDependencyConfig`.
5. `DependencyReport` / `DependencyOutcome` / `OllamaFailureReason` — desfechos **exaustivos**, nunca string crua de erro (molde de `reason` em `stt-engine.ts`/`GitRootError`).
6. `parseBooleanSetting` — coerção pura de env, origem única das duas bordas.
7. `AtlasConfig.dependencies` / `AtlasConfigOverride.dependencies?` (`@atlas/contracts`).

Nenhum tipo desta SPEC sobe a `@atlas/contracts` além do item 7: `ProcessPort`, `DependencyManager` e os desfechos vivem em `@atlas/core`, no molde exato de `Lifecycle`/`LifecycleHooks` (que também nunca subiram).

---

# Fluxo Esperado

**CLI (uma vez por processo, nunca desliga):**

```text
argv/env → InputGateway.normalize
        ↓ (help/version/persona desviam ANTES, sem tocar dependências)
resolveDependencyConfig(configOverride)
        ↓
createDependencyManager().ensure(config)
        ├─ desligado ................................ 'disabled'   (silencioso)
        ├─ isOllamaRunning === true ................. 'already-running' (silencioso)
        ├─ startOllama OK → posse registrada JÁ
        │     └─ polling (sleep 250ms → poll) × até 40
        │           ├─ pronto ............................ 'started'    (aviso em stderr)
        │           └─ 40 tentativas sem resposta ........ 'failed'/'timeout' (aviso em stderr, POSSE MANTIDA)
        └─ binário ausente / spawn falho ................. 'failed'     (aviso em stderr, sem posse)
        ↓
createAtlas(...) → comando (status imprime a linha de auto-start)
        ↓
atlas.shutdown()      ← release() NUNCA é chamado (ADR-0027(e))
```

**Desktop (uma vez por sessão de app, desliga só o que subiu):**

```text
app.whenReady() → ensureExternalDependencies() → (mesma máquina de desfechos) → log
        ↓
… sessão da app: createAtlas/atlas.shutdown por round-trip, INALTERADOS …
        ↓
before-quit → releaseExternalDependencies() → stopOllama() só se esta sessão SPAWNOU
                                              (inclusive no desfecho 'failed'/'timeout')
```

---

# Estratégia de Implementação

1. `@atlas/contracts`: `dependencies` em `AtlasConfig`/`AtlasConfigOverride` + teste de tipo negativo. Rodar `pnpm --filter @atlas/contracts typecheck` e esperar a quebra conhecida de fakes tipados diretamente (padrão recorrente desde a SPEC-0017 — hoje `apps/cli/tests/status.test.ts`).
2. `@atlas/core` config: `defaults`, merge/validação em `loadConfig`, `dependency-config.ts` (`resolveDependencyConfig` + `parseBooleanSetting`) com os helpers compartilhados, no molde de `data-dir.ts`.
3. `@atlas/model-gateway`: exportar `OLLAMA_DEFAULT_BASE_URL` e consumi-la no próprio provider.
4. `@atlas/core` dependências: `process-port.ts` (só tipos) → `dependency-manager.ts` (lógica pura sobre a porta, com `sleep` injetável) → testes com `ProcessPort` fake **antes** do adaptador real.
5. `node-process-port.ts`: adaptador real com o contrato pinado; testes só da fronteira injetável.
6. `packages/core/src/index.ts`: exports (e **nada** dentro de `createAtlas`).
7. `apps/cli`: flag/env → `run.ts` (ponto único de disparo, `DependencyManager` injetável por `CliDeps` para teste) → aviso em stderr → linha de `atlas status` → `HELP_TEXT`.
8. `apps/desktop`: `core-bridge.ts` (instância única + duas funções) → testes → `main.ts` (duas linhas).
9. Nota de atualização no ADR-0027.
10. Verificação final: os quatro comandos completos na raiz.

---

# Estratégia de Testes

**Sempre com fakes.** Nenhum teste desta plataforma pode spawnar processo real, tocar o binário `ollama` ou abrir socket — mesma disciplina que `HttpPort`/`SearchPort`/`SpawnPiper`/`SpawnStt` já seguem (ADR-0027(c)).

- **`@atlas/core` / dependency-manager** (unitário, `ProcessPort` fake registrando chamadas numa **lista ordenada** + `sleep` fake): os desfechos e as garantias de CA 5–11b (opt-in desligado não toca a porta; já rodando não spawna; polling com contagem **e ordem** exatas; três `reason` de falha; porta que rejeita não propaga; idempotência; posse registrada no `spawn` e `release` derrubando também após `'timeout'`; ausência de posse duplicada).
- **`@atlas/core` / dependency-config** (unitário, puro): precedência, default, tabela de `ollamaBaseUrl` por provider efetivo (CA 3a, incluindo provider inválido), ausência de validação de `persona`/`provider`, tabela exaustiva de `parseBooleanSetting`.
- **`@atlas/core` / load-config**: merge e issue de validação do campo booleano.
- **`@atlas/core` / node-process-port**: só a fronteira injetável (`fetch` fake) — `isOllamaRunning` nos quatro casos, nunca lançando.
- **`@atlas/contracts`**: teste de tipo negativo (`@ts-expect-error`).
- **`@atlas/model-gateway`**: a constante exportada é a mesma que o provider usa quando `baseUrl` é omitida.
- **`apps/cli`**: parsing de flag/env (incluindo `CliUsageError`), contagem de `ensure` por comando (1 para comandos de Core, 0 para `help`/`version`/`persona`), `release` nunca chamado, código de saída inalterado em falha, textos exatos em stderr, linha de `atlas status` nos quatro desfechos.
- **`apps/desktop`**: `core-bridge.dependencies.test.ts` — env ausente/válida/inválida (com o `console.warn` pinado espionado), `env` injetado como parâmetro (nunca mutando `process.env` global entre testes), instância única, `release` sem posse, delegação com posse; e o gate de paridade existente permanecendo verde sem entrada nova.

**Explicitamente ambiental, não coberto por CI** (registrado, não escondido):

- que o binário `ollama` realmente exista, execute e responda em `/api/tags` no host;
- que `detached: true` + `unref()` de fato deixem o daemon vivo após a saída do processo da CLI, em cada SO;
- que `SIGTERM`/`SIGKILL` derrubem o daemon no desktop antes de o Electron encerrar (o handler `before-quit` não aguarda — ver D17);
- a latência real de carregamento do modelo, e portanto se o orçamento de 10 s do polling é generoso ou apertado no host do usuário.

Mesma postura das SPECs 0040/0046/0052 quanto aos binários externos: a cobertura prova lógica e fiação, não o ambiente.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` estiverem verdes na raiz;
- a nota de atualização no ADR-0027 estiver registrada (sem alterar cláusulas);
- a arquitetura estiver preservada (nenhum módulo novo, nenhuma responsabilidade movida, `createAtlas` intacto);
- a revisão estiver concluída;
- as lições aprendidas estiverem registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação:** a sincronização das docs vivas (`CLAUDE.md` raiz e de `packages/core`/`packages/model-gateway`/`apps/cli`/`apps/desktop`, `PLATFORM_STATE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md` — inclusive a criação do item de Roadmap discutida no campo "Item do Roadmap") **não é escopo do `spec-implementer`**: é o passo `doc-sync` do fecho. O implementador toca só a documentação específica desta SPEC (este arquivo e a nota no ADR-0027).

---

# Restrições

1. Não criar módulos novos; a capacidade pertence ao Lifecycle Manager, dentro de `packages/core` (ADR-0027, alternativa "módulo novo" rejeitada).
2. Não alterar `createAtlas` nem os hooks do `createLifecycle` existente.
3. Não introduzir execução de comando arbitrário, `shell: true`, interpolação de string em argv, nem caminho de binário vindo de entrada não confiável.
4. Nenhuma decisão do modelo/Planner pode alcançar esta capacidade — a única fonte é a config fornecida pelo humano.
5. `ensure`/`release` **nunca lançam** de um jeito que impeça o app/CLI de abrir ou fechar (ADR-0027(f)).
6. Fail-closed por padrão: sem opt-in explícito, o comportamento é byte a byte o de hoje (nenhum health-check, nenhum processo).
7. Nenhum estado persistente novo (Artigo 11).
8. Toda mensagem visível ao usuário é pinada nesta SPEC (D13/D14) — nada de string improvisada na implementação, nada de interpolar stderr do processo externo na saída.
9. Desfechos são unições discriminadas com `reason` de conjunto fechado — nunca `Error.message` cru atravessando a fronteira.
10. Diff confinado aos alvos listados em "Arquivos Esperados".

---

# Observações

- **Residual de segurança herdado, registrado (não fechado):** esta é a primeira vez que o Atlas invoca um processo do sistema operacional **fora** do sandbox de Tools (ADR-0027, "Custos e riscos"). Mesmo restrita a `ollama serve`, é superfície de auditoria nova; a mitigação desta fatia é escopo (uma dependência, três operações fixas, opt-in explícito, argv em array) e visibilidade (`atlas status` + aviso em stderr + log no main process), não eliminação.
- **Residual: o desktop não avisa o usuário na janela** (só no log do main process) — D15. Molde do que a SPEC-0055/D17 fez com a política de rede, depois fechada pela SPEC-0059.
- **Residual nomeado: no desktop, o opt-in é alcançável na prática só em lançamento por terminal/dev.** A única fonte de opt-in da janela é `ATLAS_AUTO_START_OLLAMA` (não há flag nem GUI, D15/D25), e um app **empacotado** aberto por Finder/Dock/atalho tipicamente **não herda** o ambiente do shell — quem abrir a janela assim não conseguirá ligar a automação nem ver o `console.warn`/`console.info` do main process (que também exige terminal ou DevTools). Consequência assumida: esta fatia do desktop é efetivamente para lançamento via terminal (`pnpm --filter @atlas/desktop start`) até existir superfície de GUI própria. Fechável por uma fatia futura de painel (molde exato do que a SPEC-0059 fez com a rede depois da SPEC-0055/D17); nenhuma linha dela é implementada aqui.
- **Custo assumido: até 10 s de bloqueio em comandos que nunca tocam o Model Gateway.** Como o disparo é único e antecede o despacho (ADR-0027(d) + D7), com o opt-in ligado e o Ollama fora do ar, comandos que não usam modelo algum — `atlas memory list`, `atlas forget`, `atlas remember`, `atlas skills list`, `atlas status` — pagam o health-check (até 2 s) e, se houver spawn, o orçamento de prontidão (até 10 s) antes de imprimir qualquer coisa. É consequência direta do ADR-0027(d) ("uma vez no bootstrap do processo, antes de despachar para qualquer comando"), não um efeito colateral desta SPEC: filtrar por comando reintroduziria, em outra forma, a implicitude que o ADR-0027(g) recusa. Só `help`/`version`/`persona` escapam, por desviarem antes (D7). O usuário desliga o custo desligando o opt-in. **Levar às docs vivas no `doc-sync`** (`apps/cli/CLAUDE.md` e `PLATFORM_STATE.md`), porque é a surpresa mais provável do dia a dia.
- **Residual: `before-quit` não aguarda o `release`** — o handler existente já usa `void` para `closeAllChatSessions`/`piperTts.shutdown`; se o Electron encerrar antes da escalada `SIGTERM`→`SIGKILL`, um Ollama iniciado pela sessão pode sobreviver ao fechamento da app (D17).
- **Residual: sem supervisão pós-`ensure`** — se o Ollama cair no meio da sessão, nada o levanta de novo; a experiência degrada exatamente como hoje.
- **Assimetria deliberada CLI × desktop** (ADR-0027(e)): fechar `atlas ask` deixa o Ollama de pé; fechar a janela derruba o que a janela subiu. Precisa aparecer nas docs vivas no `doc-sync`, porque é a fonte mais provável de surpresa para quem alterna entre as duas interfaces.
- **3ª SPEC do ADR-0027 (container SearXNG) fica desbloqueada por esta**, que estabelece a unidade, a porta e o formato de desfecho que ela vai estender aditivamente (`ensureSearchContainerRunning(containerName)` como operação nomeada nova na mesma porta, `DependencyOutcome` ganhando a variante `dependency: 'searxng'`). Nenhuma linha dessa fatia é implementada aqui.

---

# Checklist para IA

Antes de implementar:

- ler o ADR-0027 por inteiro (cláusulas (a)–(h)) e o Module Catalog (Lifecycle Manager);
- confirmar que `createAtlas` **não** deve chamar nada desta SPEC;
- validar que os pré-requisitos estão `Done`.

Durante implementação:

- manter responsabilidade única (a porta faz IO, o manager decide, os apps só disparam);
- fakes primeiro, adaptador real depois;
- nenhuma string de usuário fora das pinadas em D13/D14.

Após implementação:

- rodar os quatro comandos completos na raiz;
- conferir os diffs vazios exigidos pelos CA 26/28;
- registrar lições aprendidas e a nota no ADR-0027.

---

# Resultado Esperado

Depois desta SPEC, um usuário que rode `atlas ask "..." --auto-start-ollama` (ou exporte `ATLAS_AUTO_START_OLLAMA=1`, ou abra a janela do desktop com essa variável no ambiente) não precisa mais ter rodado `ollama serve` antes: o Atlas verifica se o daemon está acessível no `baseUrl` efetivo e, se não estiver, o sobe uma única vez por processo (CLI) ou por sessão de app (desktop), esperando até 10 s para ele responder.

Se o binário não existir, o spawn falhar ou o daemon não subir a tempo, **nada trava**: o comando roda, a janela abre, e o usuário vê uma linha honesta dizendo o que falhou — a experiência degrada exatamente para a de hoje. Sem a flag/env, o comportamento é indistinguível do anterior a esta SPEC: nenhum health-check, nenhum processo, nenhum byte de diferença.

Fechando a janela do desktop, o Ollama que **aquela sessão** subiu é derrubado — inclusive quando ele demorou demais para responder e o desfecho registrado foi `'failed'`/`'timeout'`: a posse é do *spawn*, não da prontidão, então um daemon lento **nunca** fica órfão (A2/D23). Um Ollama que já estava de pé, ou que foi subido por um comando da CLI, permanece — assimetria deliberada e documentada. O único caminho em que o processo sobrevive ao fechamento é ambiental e já registrado nas Observações: o Electron encerrar antes da escalada `SIGTERM`→`SIGKILL`, porque `before-quit` não aguarda (D17).

---

# Decisões de design

Formato de veto: **Decisão** · **Porquê** (rastreado à fonte) · **Alternativa descartada**.

**D1 — Perfil `completo`.**
· *Decisão*: esta SPEC é `completo`, não `micro`.
· *Porquê*: falha em três das seis condições de `micro` — toca `@atlas/contracts` (`AtlasConfig.dependencies`), extravasa "um package + a CLI que o expõe" (`packages/core` + `packages/model-gateway` + `apps/cli` + `apps/desktop`) e introduz uma unidade e uma porta novas em `@atlas/core`. Comparáveis fechadas que tocaram core/boot com esse alcance (TOKEN_USAGE_LOG) ficam na faixa de 20–35 M de tokens brutos (SPEC-0018 20,3 M; SPEC-0024 15,1 M; SPEC-0044 35,2 M), consistente com o ramo completo.
· *Alternativa descartada*: `micro`, apostando que "é só uma flag" — descartada porque o diff em `apps/desktop` e em `@atlas/contracts` cai fora da fronteira de `micro` por definição, e o caminho seguro do template é `completo`.

**D2 — Nome `createDependencyManager` mantido.**
· *Decisão*: o nome de trabalho do ADR-0027(d) vira o nome final.
· *Porquê*: casa com a responsabilidade que o Module Catalog já atribui ao Lifecycle Manager ("verificação de dependências") e não sugere capacidade genérica.
· *Alternativa descartada*: `createProcessManager` — sugere "gerenciar processos" em geral, exatamente a leitura que o ADR-0027(b) proíbe, e envelheceria mal quando a fatia do SearXNG somar uma dependência que não é um processo local, e sim um container.

**D3 — Só o Ollama nesta fatia; nenhuma pegada de Docker no código.**
· *Decisão*: `ProcessPort` nasce com três métodos de `ollama`; `DependencyOutcome` nasce com `dependency: 'ollama'` como único valor.
· *Porquê*: o ADR-0027 nomeia a fatia do container como SPEC **separada** (3ª); antecipar o parâmetro `containerName` produziria contrato morto que ninguém exercita.
· *Alternativa descartada*: já desenhar a porta genérica sobre `DependencyId = 'ollama' | 'searxng'` — descartada porque generalizar sem o segundo caso real é adivinhação (regra "promover só com 2º consumidor", ADR-0007); a união discriminada aceita a variante nova de forma aditiva quando ela existir.

**D4 — Porta com operações nomeadas por dependência, nunca `run(command, args)`.**
· *Decisão*: `isOllamaRunning(baseUrl)` / `startOllama()` / `stopOllama()`.
· *Porquê*: literalmente o ADR-0027(b) — a superfície precisa ser estruturalmente incapaz de virar execução arbitrária, para não colidir com o item 1.4 do Roadmap ("execução de comandos sob o Permission Service"), que é uma Tool exposta ao Planner sob `confirm`.
· *Alternativa descartada*: uma porta `exec(command, args)` reusável — descartada por criar, sem ADR, exatamente a capacidade que o ADR-0027 recusa e que o Permission Service teria de julgar.

**D5 — `ensureOllamaRunning()` do ADR vive como passo interno, não como método público do manager.**
· *Decisão*: a superfície pública do manager é `ensure(config)`/`release()` (ADR-0027(d)); a operação nomeada do ADR-0027(b) é realizada por dentro, sobre a porta.
· *Porquê*: as duas cláusulas do ADR são compatíveis assim, e uma única porta de entrada evita dois caminhos para o mesmo efeito (que a fatia do SearXNG duplicaria de novo).
· *Alternativa descartada*: expor também `ensureOllamaRunning()` no manager — descartada por duplicar a entrada e obrigar a decidir, em cada chamada, quem registra posse.

**D6 — Opt-in: flag `--auto-start-ollama`, env `ATLAS_AUTO_START_OLLAMA`, config `dependencies.autoStartOllama` (default `false`).**
· *Decisão*: nome dedicado à ação específica, booleano, fail-closed, com coerção de env pinada (`1/true/yes/on` × `0/false/no/off`, case-insensitive; valor fora do conjunto ⇒ `CliUsageError`).
· *Porquê*: ADR-0027(g) exige opt-in explícito e dedicado, no mesmo padrão de `writeRoots`/`netRoots`/`tools.searchUrl`; o Module Catalog proíbe o Configuration Service "alterar configurações silenciosamente", então um valor de env incompreensível precisa falhar em voz alta na borda, não virar `false` calado.
· *Alternativa descartada*: derivar o auto-start de `model.provider === 'local'` — rejeitada explicitamente pelo usuário no brainstorming do ADR-0027 ("configurar uma capacidade não deveria implicitamente conceder outra").
· *Nota (2ª rodada)*: o `CliUsageError` desta decisão vale **só para a CLI**; o desktop trata o mesmo valor inválido como desligado + aviso em log, por impossibilidade estrutural de falhar alto sem violar o ADR-0027(f) — divergência decidida e justificada em **D25**. A coerção em si (`parseBooleanSetting`) continua sendo origem única para as duas bordas.

**D7 — Ponto de disparo na CLI: em `run.ts`, após os desvios de `help`/`version`/`persona`, imediatamente antes de `createAtlas`.**
· *Decisão*: um único `ensure` por processo, nesse ponto exato.
· *Porquê*: o ADR-0027(d) pede "uma vez no bootstrap do processo, antes de despachar para qualquer comando"; os três desvios provam, por construção, que nunca alcançarão o Model Gateway (`persona` nem sobe o Core, por decisão da SPEC-0044/D5), e subir um daemon para `atlas --help` seria o oposto do pedido. Continua havendo exatamente um `createAtlas` por processo, então "antes de `createAtlas`" e "uma vez por processo" coincidem.
· *Alternativa descartada*: disparar no topo absoluto de `run()`, antes do parsing — descartada porque a config de opt-in ainda não existe ali e `atlas --help` passaria a mexer no host.

**D8 — `resolveDependencyConfig`, resolvedor parcial de config, em vez de `loadConfig`.**
· *Decisão*: função pura nova em `packages/core/src/config/`, sobre os mesmos helpers de precedência que `loadConfig` usa.
· *Porquê*: molde já validado pelo `resolveDataDir` (SPEC-0039/D17) — o desktop precisa do opt-in **sem** subir o Core e **sem** validar `persona` (que reabriria o deadlock B1: um `ATLAS_PERSONA` órfão derrubaria o auto-start); compartilhar os helpers garante uma única resposta para "qual é a config efetiva".
· *Alternativa descartada*: cada app resolver a precedência por conta própria — descartada por criar duas (CLI e desktop) implementações divergentes da mesma regra, e por contrariar o ADR-0006 (a regra vive no core).

**D9 — `OLLAMA_DEFAULT_BASE_URL` exportada por `@atlas/model-gateway` e consumida pelo core.**
· *Decisão*: promover a constante privada do provider a export do package (sem mudança de comportamento) e consumi-la em `resolveDependencyConfig`.
· *Porquê*: o ADR-0027(c) manda reusar `model.baseUrl` "sem endereço duplicado"; sem a constante exportada, o core teria de reescrever `http://localhost:11434`, criando duas respostas para "onde o Ollama vive" que podem divergir numa mudança futura do provider. O ADR previa diff vazio em `@atlas/model-gateway` "a não ser pela leitura de `model.baseUrl`"; esta é a menor extensão possível dessa exceção — um `export`, zero comportamento, zero contrato em `@atlas/contracts`.
· *Alternativa descartada*: duplicar a constante em `@atlas/core` — descartada por criar deriva silenciosa; e "exigir `model.baseUrl` explícito" — descartada porque a config default não o define, o que deixaria o caso de uso principal sem efeito.
· *Emenda (2ª rodada, veto A1)*: a decisão de **exportar e consumir a constante** sai intacta; o que muda é **quando** `model.baseUrl` entra na derivação — agora só com provider efetivo `'local'` (ver **D22**). A regra desta decisão passa a ser lida como "`ollamaBaseUrl` nunca é inventado em `@atlas/core`: ou vem do `model.baseUrl` de um provider `local`, ou vem da constante do próprio Model Gateway".

**D10 — O health-check HTTP não passa por `netRoots`/`evaluate`.**
· *Decisão*: `isOllamaRunning` faz `fetch` direto, sem Permission Service.
· *Porquê*: ADR-0027(a) — não há Tool, não há `args`, não há pedido do modelo a julgar; é a mesma categoria do egress que o `@atlas/model-gateway` já faz desde a SPEC-0004, assimetria já documentada na atualização da SPEC-0055 no ADR-0026. Julgar aqui exigiria `ResourceType: 'process'`/host novo, que o ADR-0027 rejeitou.
· *Alternativa descartada*: exigir o host do Ollama em `netRoots` — descartada por reabrir o ADR-0026 e por obrigar o usuário a autorizar como "rede" um endereço que o Model Gateway já usa sem autorização, criando uma assimetria pior que a existente.

**D11 — Endpoint de health-check pinado: `GET <baseUrl>/api/tags`, timeout 2 s, só `response.ok` conta.**
· *Decisão*: contrato de verificação pinado como dado desta SPEC.
· *Porquê*: `/api/tags` prova a **API** que o provider vai usar, não apenas que alguém escuta na porta; `ok` estrito evita tratar um 404 de outro serviço no mesmo endereço como "Ollama de pé"; molde de "contrato do binário pinado como dado" da SPEC-0040.
· *Alternativa descartada*: `GET <baseUrl>/` aceitando qualquer status — descartada por confundir qualquer HTTP listener com o daemon; e um `POST /api/chat` de sonda — descartada por custar carregamento de modelo só para checar disponibilidade.

**D12 — Start pinado: `spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' })` + `unref()`; prontidão por polling de 40 × 250 ms.**
· *Decisão*: contrato de invocação e orçamento de 10 s pinados; timeout é desfecho, não exceção.
· *Porquê*: `detached`+`unref` é o que permite a CLI sair sem derrubar o daemon (ADR-0027(e) — o próximo comando não pode pagar o custo de subir de novo); argv em array, nunca `shell`, é o padrão já pinado por `git-port.ts`/`piper-tts.ts`/`stt-engine.ts`; o polling no **manager** (com `sleep` injetável) torna o orçamento testável em CI, o que ele não seria se vivesse dentro do adaptador.
· *Alternativa descartada*: resolver a prontidão dentro de `startOllama` — descartada por empurrar a única regra temporal da fatia para a camada não testável em CI; e `spawn` sem `detached` — descartada porque o daemon morreria junto com o `atlas ask`, matando o ganho.
· *Precisão (2ª rodada, veto A7 — não altera a decisão)*: a ordem do laço fica pinada como `sleep(250)` **antes** de cada `isOllamaRunning`, 40 iterações no total (item 2.6). Escolhida porque um daemon recém-spawnado nunca responde no instante zero (a tentativa "iteração 0" seria sempre desperdiçada) e porque é a única ordenação em que "40 tentativas" e "40 `sleep`" coincidem sem um `sleep` final descartado — o que torna a contagem do CA 7 fechada em vez de aproximada. Ordenação alternativa (poll primeiro, `sleep` depois) descartada por deixar um `sleep` órfão no caminho de sucesso, tornando as duas contagens divergentes.

**D13 — Avisos da CLI: stderr, textos pinados, silêncio nos desfechos sem novidade.**
· *Decisão*:
  - `'started'` ⇒ `Ollama iniciado automaticamente pelo Atlas.`
  - `'failed'`/`binary-missing` ⇒ `Não foi possível iniciar o Ollama automaticamente: binário "ollama" não encontrado no PATH. Seguindo sem auto-start.`
  - `'failed'`/`spawn-failed` ⇒ `Não foi possível iniciar o Ollama automaticamente: falha ao iniciar o processo. Seguindo sem auto-start.`
  - `'failed'`/`timeout` ⇒ `Não foi possível iniciar o Ollama automaticamente: sem resposta em <baseUrl> após 10s. Seguindo sem auto-start.`
  - `'disabled'` e `'already-running'` ⇒ **nada**.
· *Porquê*: Artigo 7 (transparência) exige avisar a falha; stdout é o canal da resposta e precisa continuar scriptável; silêncio no caso normal evita ruído em toda invocação. Nenhuma mensagem interpola stderr do processo externo (Restrição 8).
· *Alternativa descartada*: escrever sempre uma linha de status (inclusive `already-running`) — descartada por poluir cada `atlas ask` com informação que o usuário não pediu; e falhar o comando em `'failed'` — proibido pelo ADR-0027(f).

**D14 — Linha de `atlas status`: `ollama auto-start: …`, logo abaixo de `search:`.**
· *Decisão*: **quatro** textos exaustivos, e só quatro — `desligado` · `ligado (já em execução)` · `ligado (iniciado pelo Atlas)` · `ligado (falhou: <reason>)`. A linha é função **total** do `DependencyReport`, que `runStatus` recebe como parâmetro **obrigatório** (item 4.4).
· *Porquê*: o ADR-0027 nomeia `atlas status` como a superfície de auditoria desta capacidade; a posição final segue o padrão de acréscimo das SPECs 0055/0057 (campo novo entra no fim da lista, sem reordenar as linhas existentes). Os quatro desfechos de `DependencyOutcome` mapeiam 1:1 nos quatro textos — nenhum estado real fica sem texto e nenhum texto fica sem estado real.
· *Alternativa descartada*: derivar a linha só de `config.dependencies.autoStartOllama` — descartada por não distinguir "ligado e funcionou" de "ligado e falhou", que é justamente o que o usuário precisa ver.
· *Emenda (2ª rodada, veto A4)*: o 5º texto do rascunho anterior (`ligado (não verificado)`, para quando o relatório não fosse passado) foi **removido**, junto com a optatividade do parâmetro. Ele era inalcançável em produção — `run.ts` sempre roda `ensure` antes de `createAtlas` (D7) —, e um texto que nenhum caminho real produz é código morto que passa a exigir um teste sintético para ficar coberto. Alternativa descartada: manter o 5º texto e afrouxar o CA 20 para "um dos cinco" — descartada porque preservaria um estado fantasma na superfície de auditoria, exatamente o oposto do que o Artigo 7 pede dela.
· *Consequência*: `runStatus` deixa de ser chamável sem relatório — o `typecheck` passa a impedir que um caminho futuro de `atlas status` pule o `ensure` sem que alguém decida isso explicitamente.

**D15 — O desktop não ganha superfície de GUI nesta fatia; só log no main process.**
· *Decisão*: sem painel, sem canal IPC, sem `#global-alert`, sem diálogo — o desfecho aparece em `console.info`/`console.warn` do main.
· *Porquê*: o ADR-0027(f) aceita "linha de `atlas status`/log"; conter o diff a `main.ts`+`core-bridge.ts` preserva o gate de paridade renderer↔módulo intocado e evita repetir, numa fatia de infraestrutura, o custo de uma fatia de UI. Precedente direto: a SPEC-0055/D17 deixou o desktop sem UI de rede, e a SPEC-0059 fechou depois.
· *Alternativa descartada*: mostrar no painel `Sistema` — descartada por exigir canal IPC novo, formatação e testes de renderer, dobrando a fatia por um sinal que aparece uma vez por sessão.

**D16 — Auto-start não lê `model.provider`.**
· *Decisão*: a flag ligada sobe o Ollama mesmo com `provider: 'remote'`/`'fake'`.
· *Porquê*: ADR-0027(g) exige que a decisão seja **só** do opt-in explícito; acoplar ao provider reintroduziria a implicitude pela porta dos fundos e produziria um no-op invisível ("liguei a flag e nada acontece") que o usuário teria de depurar.
· *Alternativa descartada*: agir só quando `provider === 'local'` — descartada pelo motivo acima; quem liga a flag está pedindo o daemon de pé, e trocar de provider por um comando não deveria revogar esse pedido em silêncio.
· *Nota (2ª rodada)*: **não reaberta** por D22. A distinção que sustenta as duas decisões juntas: o provider **não** decide *se* o auto-start age (D16, intacta) — decide apenas *qual endereço* é o do Ollama, porque `model.baseUrl` pertence ao provider configurado e não à dependência (D22).

**D17 — Desligamento no desktop: só `before-quit`, sem `await`, só o que a sessão subiu.**
· *Decisão*: `void releaseExternalDependencies()` em `before-quit` (não em `window-all-closed`), com a escalada `SIGTERM` → 2 s → `SIGKILL` dentro do adaptador; posse rastreada em memória.
· *Porquê*: ADR-0027(e) manda derrubar só o que o próprio Atlas subiu; `before-quit` é o único evento de "fechar" real (em macOS, `window-all-closed` não encerra a app), e o handler existente já é `void` para os demais teardowns. O risco de o Electron sair antes da escalada fica registrado como residual, não escondido.
· *Alternativa descartada*: tornar `before-quit` assíncrono com `event.preventDefault()` + `app.quit()` posterior — descartada por atrasar o fechamento da janela por até 2 s e por mexer no ciclo de vida da app inteiro para um caso de borda; e derrubar em `window-all-closed` — descartada por matar o daemon quando o usuário só fechou a janela no macOS.

**D18 — Idempotência por memoização da 1ª chamada de `ensure`.**
· *Decisão*: a 1ª promessa é guardada; chamadas seguintes devolvem o mesmo relatório sem novo IO. `release()` limpa a memoização e a posse.
· *Porquê*: o ADR-0027(d) chama `ensure()` de "idempotente"; memoizar torna isso verdade também para chamadas concorrentes (dois gestos de boot no desktop nunca produzem dois `ollama serve`).
· *Alternativa descartada*: reexecutar o health-check a cada `ensure` — descartada por transformar uma garantia de idempotência em corrida, sem benefício (não há supervisão nesta fatia, por escopo).

**D19 — Desfechos como união discriminada com `reason` de conjunto fechado.**
· *Decisão*: `DependencyOutcome`/`OllamaFailureReason`; nenhuma `Error.message` crua atravessa a fronteira.
· *Porquê*: mesmo padrão já pinado por `stt-engine.ts` (dez desfechos com `reason`), pelo `GitRootError` da SPEC-0056 e pelo `denialKind` do ADR-0015 — mensagens de usuário passam a ser função de um valor fechado, não de string de terceiro (o que também evita interpolar saída do processo externo no prompt/terminal).
· *Alternativa descartada*: propagar a exceção do `spawn` para a borda formatar — descartada por vazar texto de terceiro para a interface e por tornar as mensagens não testáveis por igualdade.

**D20 — Prioridade `Medium`.**
· *Decisão*: `Medium`.
· *Porquê*: o pedido é de conveniência operacional real (PRD/Execução: "automatizar atividades repetitivas"; Critérios de Qualidade: "simplicidade"), mas não fecha item `gate` do Roadmap, não desbloqueia capacidade nova nem corrige risco de segurança — abaixo das fatias de hardening, acima de cosmética.
· *Alternativa descartada*: `High` — descartada porque nenhuma outra fatia está bloqueada por esta (a 3ª SPEC do ADR-0027 é desbloqueada, não bloqueada, e não é `gate`).

**D21 — Instância única de `DependencyManager` por app, criada no ponto de entrada do app, nunca dentro de `@atlas/core`.**
· *Decisão*: `apps/cli` cria a sua em `run.ts`; `apps/desktop` mantém uma de módulo em `core-bridge.ts`; `@atlas/core` só exporta a fábrica.
· *Porquê*: ADR-0027(d) — o dono do ciclo é o app, no seu ponto real de entrada/saída; a posse (item (e)) só faz sentido amarrada à vida daquele processo. Manter a instância no `core-bridge` (e não em `main.ts`) preserva a regra da app de que lógica testável não importa `electron`.
· *Alternativa descartada*: singleton dentro de `@atlas/core` — descartada por criar estado global de módulo numa biblioteca compartilhada, invisível para quem compõe e impossível de resetar entre testes.

---

## Decisões da 2ª rodada (correções do 1º veto do `architecture-reviewer`)

**D22 — `ollamaBaseUrl` só herda `model.baseUrl` quando o provider efetivo é `local`; caso contrário, `OLLAMA_DEFAULT_BASE_URL` (veto A1).**
· *Decisão*: `resolveDependencyConfig` calcula `providerEfetivo = override.model?.provider ?? defaultConfig().model.provider` e usa `override.model?.baseUrl` **apenas** quando `providerEfetivo === 'local'` (igualdade exata); `'remote'`, `'fake'` e qualquer string inválida caem sempre na constante do Model Gateway (item 3.2, CA 3a/3b).
· *Porquê*: `model.baseUrl` é campo **compartilhado** entre os providers `local` e `remote` (`packages/model-gateway/src/providers/{ollama,remote}.ts`) — não é o "endereço do Ollama", é "o endereço do provider configurado". Derivar sem olhar o provider fazia `--provider remote --base-url https://api.<terceiro>.com --auto-start-ollama` sondar `GET https://api.<terceiro>.com/api/tags` sem credencial e martelar **até 41 requisições** (1 health-check + 40 do polling) contra um host de terceiro que nunca vai rodar Ollama: tráfego não solicitado a terceiro, disparado por uma flag que o usuário acha que é local. O ADR-0027(c) manda reusar `model.baseUrl` "sem endereço duplicado" — e reusar corretamente é reusar **o do provider a que ele pertence**.
· *Alternativa descartada*: manter a derivação incondicional e cobrir o caso com documentação/aviso — descartada porque o dano (egress para terceiro) já aconteceu quando o aviso é lido, e porque nenhuma leitura razoável de "reusar `model.baseUrl`" inclui apontar a sonda do Ollama para a API de outro fornecedor. Também descartada a alternativa "exigir `--base-url` dedicado para o auto-start (`--ollama-url`)" — acrescentaria uma 2ª resposta para "onde o Ollama vive", exatamente a deriva que D9 evita, para um caso que a condição por provider já resolve sem contrato novo.
· *Consequência*: **D16 sai intacta** — o auto-start continua **não** consultando o provider para decidir *se* age (a flag ligada sempre age, mesmo com `provider: 'remote'`); a leitura do provider decide só *qual endereço* sondar. O efeito prático com `provider: 'remote'` + flag ligada passa a ser: subir/verificar o Ollama em `localhost:11434`, que é o que "quero o daemon de pé" significa. Custo: `resolveDependencyConfig` passa a ler dois campos de `model` em vez de um, e o teste de derivação vira tabela por provider.

**D23 — Posse é registrada no sucesso do `spawn`, nunca na prontidão; o manager é a fonte única da verdade (veto A2).**
· *Decisão*: `startOllama()` devolvendo `started: true` registra posse **imediatamente**, antes do polling; `'failed'`/`reason: 'timeout'` mantém a posse e é derrubável por `release()`. A posse vive num único campo privado do `dependency-manager.ts`; o adaptador guarda só o *handle* do filho e `stopOllama()` sem filho é no-op — nunca uma segunda estrutura de posse (itens 2.6, CA 11/11a/11b).
· *Porquê*: o desenho anterior produzia exatamente o cenário que a própria SPEC promete impedir — um `ollama serve` **spawnado por esta sessão** que demora mais de 10 s para carregar um modelo grande sobrevivia ao `before-quit` como processo **órfão**, e a sessão seguinte o via como `'already-running'`, sem posse, sem nunca poder derrubá-lo (órfão permanente, acumulando a cada sessão lenta). "Derrubar o que o próprio Atlas subiu" (ADR-0027(e)) é um fato sobre **quem chamou o `spawn`**, não sobre o daemon ter respondido a tempo: prontidão é qualidade do desfecho, posse é qualidade da autoria.
· *Alternativa descartada*: manter posse condicionada à prontidão e mitigar com um `stopOllama()` de "limpeza" no próprio caminho de timeout — descartada porque matar um daemon que está apenas **lento carregando o modelo**, no meio de um `ensure`, é pior que esperá-lo: destrói justamente o trabalho que o usuário quer, e o `atlas ask` seguinte pagaria o carregamento de novo. Também descartada "rastrear posse no adaptador (que já tem o *handle*)" — duplicaria a autoridade entre manager e porta, e o `release()` teria de perguntar à porta se ela acha que deve parar, invertendo a divisão "a porta faz IO, o manager decide" (Restrição da própria SPEC / Artigo 5).
· *Consequência*: `release()` passa a ter **dois** desfechos de entrada (`'started'` e `'failed'`/`'timeout'`), o que o CA 11 agora pina explicitamente. Um daemon que ficou pronto no segundo 11 é derrubado ao fechar a janela, ainda que a sessão o tenha reportado como falha — coerente com a promessa do "Resultado Esperado", e visível ao usuário porque o desfecho `'failed'` foi avisado (D13/D15).

**D24 — `dependencies` entra também na config resolvida (`AtlasConfig`), com validação em `loadConfig`, apesar de nenhum consumidor interno lê-lo nesta fatia (veto A6).**
· *Decisão*: opção (ii) do achado — manter `AtlasConfig.dependencies.autoStartOllama` obrigatório, com default em `defaults.ts` e validação em `loadConfig`, além do `AtlasConfigOverride.dependencies?` e do `resolveDependencyConfig` (itens 1.1/2.1/2.2).
· *Porquê*: sem o campo na config resolvida, `createAtlas({ config: { dependencies: … } })` aceitaria uma chave declarada no tipo de override e a **descartaria em silêncio** — e o Module Catalog proíbe expressamente o Configuration Service alterar/ignorar configuração silenciosamente (mesmo fundamento que D6 usa para rejeitar env inválida em voz alta). Além disso, o ADR-0006 coloca a **validação no core**: um `autoStartOllama: 'sim'` vindo por API programática só tem onde ser rejeitado se `loadConfig` conhecer o campo. E `defaults.ts` permanece a **origem única** do valor default, consumida tanto por `loadConfig` quanto por `resolveDependencyConfig` — com a opção (i), o default passaria a existir só dentro de `dependency-config.ts`, e a 3ª SPEC do ADR-0027 (`autoStartSearxng`) teria de escolher de novo, sem precedente.
· *Alternativa descartada*: opção (i) — campo só em `AtlasConfigOverride` + resolvedor próprio, evitando a quebra conhecida de fakes tipados. Descartada porque compra uma economia de teste com uma assimetria de contrato (a única chave de override sem contraparte resolvida) e com um descarte silencioso de config; a quebra de fakes tipados diretamente é um padrão **já precificado** e recorrente desde a SPEC-0017 (0022/0023/0025/0039/0055/0057), previsto no passo 1 da "Estratégia de Implementação", não um risco novo.
· *Consequência*: `dependencies` é o primeiro namespace de `AtlasConfig` sem consumidor dentro de `createAtlas` — condição **temporária e nomeada**, não um convite: o CA 12 continua exigindo que `createAtlas` não consuma nada desta SPEC, e a leitura efetiva é dos apps, via `resolveDependencyConfig`. Custo imediato: `apps/cli/tests/status.test.ts` (fake tipado diretamente) quebra no `typecheck` e precisa ganhar o campo.

**D25 — Env inválida: `CliUsageError` na CLI, desligado + `console.warn` pinado no desktop — divergência deliberada; e o desktop segue sem GUI, com residual nomeado (veto A3).**
· *Decisão*: as duas bordas compartilham a **mesma** coerção (`parseBooleanSetting`, origem única) e divergem só no **tratamento** do `kind: 'invalid'` — a CLI lança `CliUsageError` (D6), o desktop trata como desligado e emite uma linha pinada de `console.warn` (item 5.1, CA 22). A leitura de `process.env` fica em `core-bridge.ts`, com `env` injetável por parâmetro; nenhuma superfície de GUI é criada (D15 mantida) e o limite prático disso vira residual nomeado nas Observações.
· *Porquê*: a divergência é ditada por qual comportamento cada borda **pode** ter. Na CLI, o valor errado está na linha de comando ou no shell que o usuário acabou de exportar, há um humano lendo `stderr` e um código de saída que ele pode conferir: falhar alto é barato e imediatamente corrigível (Artigo 7). No desktop, o equivalente "alto" seria um diálogo/painel — que D15 exclui desta fatia — e lançar durante `app.whenReady()` arriscaria a janela **não abrir**, o que o ADR-0027(f) proíbe categoricamente ("degrada, nunca bloqueia o boot"). Entre "não abrir a janela por causa de uma variável de conveniência" e "abrir desligado avisando no log", só a segunda é compatível com o ADR. O tratamento tampouco é silencioso: é fail-closed **mais** aviso, mesmo nível de transparência que o ADR-0027(f) aceita para o desktop nesta fatia.
· *Alternativa descartada*: unificar as duas bordas em "sempre lançar" — descartada por colidir com o ADR-0027(f) no desktop (janela que não abre). Unificar em "sempre desligar em silêncio" — descartada por apagar da CLI a única chance de o usuário descobrir o erro de digitação, contrariando D6 e o Module Catalog. E "dar ao desktop uma superfície visual (diálogo/`#global-alert`) para o valor inválido" — descartada por reabrir D15 e trazer de volta o custo de fatia de UI, por um caso de borda que o log já cobre.
· *Consequência*: registrada nas Observações como residual — a única fonte de opt-in do desktop é uma variável de ambiente, e um app **empacotado** aberto por Finder/Dock normalmente **não herda** o ambiente do shell; nem o opt-in nem o `console.info`/`console.warn` do main process são alcançáveis nesse modo. Portanto esta fatia do desktop vale, na prática, para lançamento por terminal/dev (`pnpm --filter @atlas/desktop start`), até uma fatia futura de GUI fechar o resíduo — precedente exato: SPEC-0055/D17 deixou a rede sem UI e a SPEC-0059 fechou depois. A capacidade **completa** (incluindo desligar o que subiu ao fechar a janela) continua entregue e testada; o que fica limitado é a alcançabilidade do gesto pelo usuário final.
