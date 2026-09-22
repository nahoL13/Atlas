# SPEC-0064 — Teto de tempo nas operações de processo do `ProcessPort`

> **Project Atlas — Implementation Specification**

Template: 1.2

---

# Informações Gerais

**ID**

SPEC-0064

---

**Título**

Orçamento de tempo (watchdog) para cada operação de processo/stream do adaptador real `nodeProcessPort()` — `spawn` do Ollama, as três invocações Docker do container de busca e o stream NDJSON de `pullOllamaModel` —, de forma que nenhuma chamada da `ProcessPort` possa ficar pendurada indefinidamente, nem deixar para trás um *handle* que segure o processo; mais a ampliação de **um** texto de aviso da CLI, que passaria a afirmar uma causa que deixou de ser a única.

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

Justificativa em **D2**.

---

**Perfil**

- [x] micro
- [ ] completo

Justificativa em **D1**.

---

**Item do Roadmap**

**Exceção consciente registrada**, na mesma classe das SPECs [0060](SPEC-0060-ollama-auto-start.md), [0061](SPEC-0061-search-container-auto-start.md), [0062](SPEC-0062-desktop-dependency-autostart-default.md) e [0063](SPEC-0063-desktop-model-provisioning.md): nenhum item de `docs/04-engineering/Roadmap.md` cobre "auto-gerência de processo externo", e esta fatia é **hardening** de uma capacidade já entregue — o achado não-bloqueante do `architecture-reviewer` aberto na SPEC-0061, reiterado como residual 2 da SPEC-0062 e como residuais 12/13 da SPEC-0063.

Esta SPEC **não fecha** nenhum item do Roadmap. Não consome, não reabre e não toca o item 1.4 (execução de comandos sob o Permission Service, `ADR primeiro`), nem o [ADR-0026](../../06-adr/ADR-0026-network-access-gate.md), nem o [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md).

---

# Objetivo

Quando esta SPEC estiver concluída:

1. **Nenhuma** chamada a um método de `ProcessPort` implementado por `nodeProcessPort()` pode deixar de assentar por causa de um filho que nunca emite evento, de um daemon Docker que não responde ou de um stream HTTP que para de emitir bytes sem fechar. Toda operação tem um **teto de tempo pinado como dado desta SPEC**, e ao estourá-lo devolve um desfecho **já existente** do contrato — nunca lança, nunca fica pendente.
2. Fechar a janela do desktop (`before-quit` → `releaseExternalDependencies` → `release()`) deixa de poder travar por causa de um `docker stop`/`docker inspect` pendurado.
3. Abrir a janela com um daemon Docker inerte deixa de poder segurar o bootstrap de dependências indefinidamente — o que, desde a SPEC-0063, também destrava o gatilho proativo da tela de instalação de modelo (residual 12 daquela SPEC).
4. Um download de modelo cujo stream **estagna** (nenhum byte novo por um período longo) termina sozinho como falha, sem depender de o usuário lembrar de clicar em "Cancelar download" (residual 13 da SPEC-0063). **Continua não existindo timeout total do download** — um `pull` de vários GB legítimo, que progride, nunca é interrompido por tempo.
5. `packages/core/src/dependencies/dependency-manager.ts`, `apps/desktop`, `@atlas/contracts` e todos os demais packages saem com **diff vazio**. `apps/cli` sai com **uma única string de aviso ampliada** (item 4, **D17**) — nenhuma lógica, nenhum branch, nenhuma flag nova —, porque o desfecho que passa a ter uma causa a mais é hoje pintado lá com um texto que mentiria sobre a causa. Nenhum desfecho de `DependencyOutcome`/`ModelPullOutcome` é criado, removido ou renomeado.
6. Nenhuma operação que estoura deixa para trás um *handle* capaz de segurar o event loop do processo pai: o filho é morto **e** desacoplado (`unref`), e o stream de `stdout` do probe é encerrado (**D18**). Um teto que faz a promessa assentar sem soltar o processo não resolveria o sintoma "a janela não fecha".

---

# Motivação

O `architecture-reviewer` registrou, como achado **não-bloqueante**, ainda na SPEC-0061, que as operações de processo de `nodeProcessPort()` não têm nenhum orçamento de tempo. A SPEC-0062 o carregou adiante sem fechar (residual 2: *"Nenhum teto de tempo nos `spawn`/`docker start`"*), e a SPEC-0063 o estendeu ao download de modelo e escreveu, textualmente, que a solução deve vir de uma vez para os dois eixos:

- residual 12: *"um bootstrap que nunca assenta deixa o gatilho proativo em espera indefinida … `docker start`/`spawn` seguem sem teto de tempo … Fechar isso é dar teto de tempo às operações de processo do ADR-0027 — fatia própria"*;
- residual 13: *"um stream que para de emitir bytes sem fechar deixa `'running'` para sempre … Mesmo eixo do residual 12 … se um teto vier, que venha para os dois de uma vez."*

O risco deixou de ser hipotético quando a SPEC-0062/ADR-0028 inverteu o repouso do auto-start no desktop: **toda** abertura da janela agora percorre o caminho de bootstrap de dependências, e um daemon Docker meio-morto (Docker Desktop subindo, socket sem resposta) é um estado comum em máquina real. Hoje, nesse estado:

- `docker inspect`/`docker start` podem nunca emitir `close`, e a promessa correspondente nunca assenta;
- `release()` drena o trabalho em voo **antes** de emitir os `stop*` (SPEC-0062/D21) — com uma tentativa pendurada, o `before-quit` nunca conclui;
- o `ensure` do bootstrap nunca assenta, e o probe de três estados da SPEC-0063 fica eternamente em `'pending'`.

O adaptador **já** tem orçamento nos dois pontos em que alguém se lembrou de colocá-lo: `HEALTH_CHECK_TIMEOUT_MS = 2000` (`inspectOllama`) e `STOP_GRACE_PERIOD_MS = 2000` (`stopOllama`). Esta SPEC não inventa um mecanismo: **generaliza o que já existe** às operações que ficaram de fora, com a mesma natureza — constantes pinadas como dado, dentro do adaptador, sem configuração nova.

Rastreabilidade ao PRD (`docs/02-product/ProductRequirementsDocument.md`):

- **Requisitos Não Funcionais** — *"O sistema deverá priorizar segurança"* e *"O sistema deverá ser preparado para crescimento incremental"*: uma operação sem teto de tempo é um modo de falha silencioso que cresce junto com cada dependência nova.
- **Critérios de Qualidade** — *"consistência de comportamento"* e *"transparência"* (Artigo 7): uma janela que não fecha e uma tela que não abre não têm explicação visível para o usuário; um desfecho de falha, sim.
- **Restrições** — *"O Atlas não deverá expor detalhes internos de sua arquitetura ao usuário durante o uso normal"*: o resgate atual ("clique em Cancelar") transfere ao usuário a percepção de um detalhe interno de stream.

---

# Referências

- [ADR-0027 — Auto-gerência de processos externos](../../06-adr/ADR-0027-external-process-lifecycle-management.md) (`Accepted`) — **fonte primária**; cláusulas (b) (operações nomeadas e fixas), (c) (porta injetável, adaptador faz IO), (e) (desligamento simétrico), (f) (falha degrada, nunca bloqueia), (h) (escopo Docker). Nenhuma é alterada; a (f) é o que esta SPEC torna **exequível no eixo temporal**, e Observações delega explicitamente o *contrato técnico exato* às SPECs.
- [SPEC-0060](SPEC-0060-ollama-auto-start.md) (`Done`) — item 2.5: *"Contrato de invocação pinado como dado da SPEC"*; `HEALTH_CHECK_TIMEOUT_MS`/`STOP_GRACE_PERIOD_MS`; costura de teste `fetch`/`spawn` (CA 14); `'timeout'` como decisão temporal do **manager** (polling de prontidão).
- [SPEC-0061](SPEC-0061-search-container-auto-start.md) (`Done`) — as três operações Docker, `SearchContainerState` (D9), posse registrada no sucesso do `start`; origem do achado não-bloqueante.
- [SPEC-0062](SPEC-0062-desktop-dependency-autostart-default.md) (`Done`) — `release()` drena o trabalho em voo antes de ler a posse (D21); residual 2 (teto de tempo).
- [SPEC-0063](SPEC-0063-desktop-model-provisioning.md) (`Done`) — `pullOllamaModel`/`cancelOllamaModelPull`, stream NDJSON, Restrição 12 (*"Não introduzir timeout total no download"*), residuais 12 e 13.
- [ADR-0028](../../06-adr/ADR-0028-desktop-dependency-autostart-default.md) (`Accepted`) — por que o caminho de bootstrap passou a ser percorrido em **toda** abertura do desktop.
- [ADR-0029](../../06-adr/ADR-0029-desktop-model-provisioning-assistant.md) (`Accepted`) — (b)/(d): a porta do download e a inspeção; **não reaberto**.
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — **Lifecycle Manager** (`packages/core`): "controlar inicialização e encerramento", "verificação de dependências", "desligamento seguro".
- [PRD](../../02-product/ProductRequirementsDocument.md) — Requisitos Não Funcionais, Critérios de Qualidade, Restrições.
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigo 5 (o adaptador executa, não decide política), Artigo 7 (transparência), Artigo 11 (nada persistido).
- Precedente de implementação de watchdog sobre subprocesso no repositório: `apps/desktop/src/piper-tts.ts` (`UTTERANCE_TIMEOUT_MS`, `setTimeout`/`clearTimeout`, testes com `vi.useFakeTimers()`).

---

# Escopo

## 1. Constantes de orçamento (dado normativo desta SPEC)

Todas vivem em `packages/core/src/dependencies/node-process-port.ts`, ao lado das duas que já existem, como `const` de módulo — **não** configuráveis por `AtlasConfig`, flag ou env (**D4**):

| Constante                     | Valor      | Operação coberta                                     | Estado         |
| ----------------------------- | ---------- | ---------------------------------------------------- | -------------- |
| `HEALTH_CHECK_TIMEOUT_MS`     | `2000`     | `inspectOllama` (via `AbortSignal.timeout`)          | **já existe**  |
| `STOP_GRACE_PERIOD_MS`        | `2000`     | `stopOllama` (SIGTERM → SIGKILL)                      | **já existe**  |
| `SPAWN_HANDSHAKE_TIMEOUT_MS`  | `5_000`    | `startOllama` (espera por `'spawn'`/`'error'`)        | **novo**       |
| `DOCKER_PROBE_TIMEOUT_MS`     | `5_000`    | `inspectSearchContainer`                              | **novo**       |
| `DOCKER_COMMAND_TIMEOUT_MS`   | `30_000`   | `startSearchContainer`, `stopSearchContainer`         | **novo**       |
| `MODEL_PULL_STALL_TIMEOUT_MS` | `120_000`  | `pullOllamaModel` — **inatividade**, nunca total      | **novo**       |

Justificativa dos valores em **D5**; por que um único orçamento cobre `start` e `stop` do Docker, em **D6**.

## 2. `packages/core/src/dependencies/node-process-port.ts` (mod) — único arquivo de produção tocado

2.1. **Helper privado único de watchdog**, no topo do módulo (fora da fábrica, puro exceto pelo timer), reusado pelas quatro operações baseadas em `ChildProcess`:

- arma um `setTimeout` com o orçamento recebido;
- ao expirar, executa nesta ordem, **cada passo dentro do seu próprio `try/catch`** (todos best-effort, nenhum propaga, nenhum altera o desfecho já marcado):
  1. `proc.kill()` — tenta encerrar o filho (**D7**);
  2. `proc.unref()` — **desacopla o handle do filho do event loop do processo pai** (**D18**). Hoje `unref()` só roda no handler de `'spawn'` de `startOllama` (`node-process-port.ts:186`), ou seja, **nunca** no caminho de estouro: um `ChildProcess` vivo segura o event loop, então, se o `kill()` não surtir efeito (SIGTERM ignorado, cliente `docker` travado), a promessa assentaria e ainda assim a CLI não terminaria / o `before-quit` do desktop não concluiria — o teto resolveria a espera e não o sintoma;
  3. quando a operação abriu um stream (`stdio: ['ignore', 'pipe', 'ignore']`, hoje só `inspectSearchContainer`): remover o listener `'data'` de `proc.stdout` e destruí-lo (`removeAllListeners('data')` + `destroy()`) — um `Readable` com listener `'data'` ativo é o **segundo** segurador do event loop, pelo mesmo motivo do passo 2 (**D18**);
  4. resolve a promessa com o valor de estouro que a operação passou;
- **cancela o timer em todo caminho de saída**, inclusive o caminho feliz;
- garante **assentamento único**: um evento `'error'`/`'close'`/`'spawn'`/`'data'` que chegue **depois** do estouro é ignorado (e vice-versa). Nenhum `resolve` duplo, nenhum desfecho sobrescrito;
- no **caminho feliz** nada disso roda: nenhum `kill()`, nenhum `unref()` novo e nenhum `destroy()` — `startOllama` continua chamando `unref()` exatamente uma vez, no handler de `'spawn'` que já existe, e as três operações Docker continuam sem chamar `unref()` (o comportamento de hoje sai byte a byte igual quando o evento chega no prazo).

2.2. `startOllama` — orçamento `SPAWN_HANDSHAKE_TIMEOUT_MS` sobre a espera por `'spawn'`/`'error'`. Ao estourar:

- `proc.kill()` + `proc.unref()` best-effort (o handshake não ocorreu; não há daemon a preservar — **D7**/**D18**);
- o campo privado `child` **não** é atribuído (posse do adaptador permanece vazia) — é justamente por isso que o `unref()` do item 2.1 é indispensável aqui: como o handle não é retido em lugar nenhum, ninguém mais poderá desacoplá-lo depois;
- devolve `{ started: false, reason: 'spawn-failed' }` — variante **já existente**.

2.3. `inspectSearchContainer` — orçamento `DOCKER_PROBE_TIMEOUT_MS`. Ao estourar: `kill()` + `unref()` + encerramento do stream de `stdout` (os três passos best-effort do item 2.1, é a única operação com `stdio` em `'pipe'`) e devolve `'unavailable'` — **nunca** `'unknown'` (**D8**). O texto que a CLI pinta para esse desfecho é ampliado no item 4 (**D17**).

2.4. `startSearchContainer` — orçamento `DOCKER_COMMAND_TIMEOUT_MS`. Ao estourar: `kill()` + `unref()` best-effort (mata o **cliente** `docker start`, nunca o container — o Atlas não ganha nenhuma operação Docker nova, ADR-0027(h) intacta) e devolve `{ started: false, reason: 'docker-unavailable' }` (**D8**), cujo texto na CLI é ampliado no item 4 (**D17**).

2.5. `stopSearchContainer` — orçamento `DOCKER_COMMAND_TIMEOUT_MS`. Ao estourar: `kill()` + `unref()` best-effort e **resolve** (a operação já devolve `void` e "ignora qualquer desfecho"). É o item que destrava o `before-quit` — e o `unref()` é o que garante que destravar o `before-quit` também solte o processo.

2.6. `stopOllama` e `inspectOllama` saem **byte a byte como estão** — já são limitadas (`STOP_GRACE_PERIOD_MS` e `AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS)`, este último abrangendo também a leitura do corpo). Nenhuma linha nova, nenhuma constante alterada.

2.7. `pullOllamaModel` — **watchdog de estagnação**, não de duração:

- um `AbortController` interno ao adaptador; o `signal` recebido em `ModelPullRequest` é **encaminhado** para ele (`addEventListener('abort', …, { once: true })`, removido no `finally`), e o que vai ao `fetch` é o `signal` **interno** (**D9**);
- **regra normativa do signal já abortado (obrigatória, não derivável do listener)**: no instante da subscrição, o adaptador lê `request.signal.aborted` de forma **síncrona** e, se já for `true`, aborta o controller interno **imediatamente**, antes de qualquer chamada a `doFetch` (**D19**). Sem essa leitura, um `signal` recebido já abortado nunca dispararia o evento `'abort'` (o evento já ocorreu antes do `addEventListener`), o controller interno nunca abortaria, e a requisição **sairia de fato** — hoje o mesmo caso rejeita o `fetch` de imediato e devolve `'cancelled'` sem tocar a rede. A ordem é, portanto: (i) checar `aborted` síncrono; (ii) registrar o listener para os aborts futuros; (iii) armar o timer; (iv) chamar `doFetch` com o signal interno — que, no caso já abortado, rejeita na hora e cai na regra 1 da classificação abaixo (`'cancelled'`), exatamente como hoje;
- o timer é armado **antes** do `doFetch` e **rearmado** (*kick*) em dois pontos, e só neles: (i) quando a resposta chega com `response.ok === true`; (ii) a cada `reader.read()` que devolve bytes (`done === false`), **antes** do parse das linhas — a medida é de **bytes recebidos**, não de linhas válidas nem de progresso numérico (**D10**);
- ao expirar: marca `timedOut = true` e chama `abort()` no controller interno; a rejeição resultante cai no `catch` que já existe;
- **classificação no `catch`, ordem normativa e exaustiva**:
  1. `request.signal.aborted === true` ⇒ `{ status: 'cancelled', model }` — o cancelamento humano tem precedência absoluta e sai exatamente como hoje (SPEC-0063);
  2. `timedOut === true` **antes** de a resposta ter chegado ⇒ `{ status: 'failed', model, reason: 'unreachable' }`;
  3. `timedOut === true` **depois** de a resposta ter chegado ⇒ `{ status: 'failed', model, reason: 'stream-failed' }`;
  4. qualquer outro caso ⇒ `{ status: 'failed', model, reason: 'unreachable' }` (inalterado);
- o timer é cancelado no `finally`, em todos os desfechos, inclusive `'installed'`;
- **nenhuma variante nova** em `ModelPullFailureReason` (**D11**); **nenhum** timeout total (Restrição 12 da SPEC-0063 preservada — **D12**).

## 3. `packages/core/src/dependencies/process-port.ts` (mod) — só comentários de documentação

3.1. O comentário da variante `'unavailable'` de `SearchContainerState` passa a ler, textualmente, que ela cobre também *"o daemon não respondeu dentro do orçamento da porta"* — a semântica descrita passa de "binário não pôde ser executado" para "Docker inutilizável nesta tentativa".

3.2. O comentário de bloco das operações de container, hoje `"'timeout' não é desfecho da porta, é decisão temporal do manager"`, ganha a distinção explícita entre os **dois** eixos temporais, que continuam separados: a porta tem **orçamento de IO por chamada** (esta SPEC) e o manager tem **orçamento de prontidão** que produz o desfecho `'timeout'` (`polling`, SPECs 0060/0061). A frase original continua verdadeira e **não** é removida (**D13**).

3.3. Nenhuma assinatura, nenhum tipo, nenhuma variante de união é alterada neste arquivo.

## 4. `apps/cli/src/run.ts` (mod) — **uma única string**, nenhuma lógica (**D17**)

4.1. O aviso de `'failed'`/`'docker-unavailable'` de `formatSearchContainerWarning` (hoje `apps/cli/src/run.ts:189-193`) afirma, textualmente, `binário "docker" não encontrado ou não executável`. Com o item 2.3/2.4, esse mesmo desfecho passa a ter **uma segunda causa** — o daemon não respondeu dentro do orçamento —, e o texto de hoje **mentiria** sobre a causa nesse cenário, induzindo o usuário à ação errada (procurar o binário em vez de checar o daemon). Isso é exatamente o que **D8** recusou fazer com `'unknown'`: não mentir sobre a causa (Artigo 7).

4.2. O texto é **ampliado** para cobrir as duas causas sem criar variante, branch ou desfecho novo. Texto pinado como dado desta SPEC:

```text
Não foi possível iniciar o container de busca "<nome>": o Docker não respondeu — binário
"docker" não encontrado, não executável, ou daemon sem resposta dentro do tempo limite.
Seguindo sem auto-start.
```

4.3. Nada mais muda em `apps/cli`: nenhuma flag, nenhuma env, nenhuma linha de `atlas status`, nenhum outro dos textos pinados pelas SPECs 0060/0061 (inclusive o `'binary-missing'` do Ollama, que continua tendo causa única). `apps/desktop` **não** é tocado — `renderer.js:2795` já diz genericamente `'Docker indisponível'`, que continua verdadeiro nas duas causas.

## 5. Testes — `packages/core/tests/node-process-port.test.ts` (mod) e `apps/cli/tests/auto-start-ollama.test.ts` (mod)

Com `vi.useFakeTimers()` (precedente: `apps/desktop/tests/piper-tts.test.ts`, `packages/tools/tests/http-port.test.ts`), sobre os fakes de `spawn`/`fetch` **já existentes** no arquivo — nenhum processo real, nenhum Docker, nenhuma rede (**D14**):

5.1. Um caso por operação nova-com-orçamento, provando o desfecho de estouro exato do item 2 (quatro casos: `startOllama`, `inspectSearchContainer`, `startSearchContainer`, `stopSearchContainer`).

5.2. Um caso por operação provando que o filho recebe `kill()` **uma vez** no estouro, e **nenhuma** vez no caminho feliz.

5.3. Assentamento único: emitir `'close'`/`'spawn'`/`'error'` **depois** do estouro não altera o desfecho já devolvido e não lança.

5.4. Caminho feliz inalterado: o evento chega **antes** do orçamento ⇒ mesmos desfechos que hoje, e `vi.getTimerCount() === 0` depois de assentar (prova mecânica de que nenhum timer sobrevive à operação).

5.5. `pullOllamaModel`: (a) estagnação antes da resposta ⇒ `'unreachable'`; (b) estagnação no meio do stream ⇒ `'stream-failed'`; (c) chunks espaçados por **menos** que o orçamento, somando **mais** que ele no total, com linha `status: 'success'` ao final ⇒ `'installed'` (prova de que o orçamento é de inatividade, não total); (d) `cancelOllamaModelPull` durante a janela de estagnação ⇒ `'cancelled'` (precedência da regra 1).

5.6. `stopOllama` e `inspectOllama`: os casos existentes seguem passando sem edição (prova de diff de comportamento vazio nessas duas).

5.7. **Higiene de handle (item 2.1/D18)**: o fake de `ChildProcess` do arquivo passa a registrar `unref()` e, no caso do probe, `stdout.removeAllListeners('data')`/`stdout.destroy()`. Casos: no estouro das quatro operações, `unref()` é chamado **uma** vez; no estouro de `inspectSearchContainer`, o stream é encerrado e um `'data'` tardio não altera o desfecho nem lança; no caminho feliz, `unref()` continua sendo chamado **só** por `startOllama` (uma vez, no handler de `'spawn'`) e o stream do probe **não** é destruído.

5.8. **Signal já abortado (item 2.7/D19)**: `pullOllamaModel` chamada com um `request.signal` **já** abortado ⇒ `{ status: 'cancelled', model }`, o `signal` recebido pelo fake de `fetch` chega com `aborted === true`, nenhum `reader.read()` acontece e `vi.getTimerCount() === 0` ao final. É o caso que falha silenciosamente se o encaminhamento for só por `addEventListener`.

5.9. **Texto da CLI (item 4)**: `apps/cli/tests/auto-start-ollama.test.ts` ganha um caso para o desfecho `'failed'`/`'docker-unavailable'` — único branch de `formatSearchContainerWarning` hoje **sem** teste —, pinando o texto do item 4.2 em stderr. Os casos existentes (`'started'`, `'container-unknown'`, `'disabled'`, `'already-running'`, e os quatro do Ollama) seguem **sem edição**.

---

# Fora do Escopo

- **Não** alterar `packages/core/src/dependencies/dependency-manager.ts` — diff **vazio** nesse arquivo. Nenhuma mudança em `ensure`/`release`/`ensureSearchContainer`/`pullOllamaModel`/`cancelOllamaModelPull`, na memoização, na regra de posse (`ownsOllama`/`ownedContainers`) ou na drenagem do `release()`.
- **Não** dar teto de **parede** aos laços de polling de prontidão do manager (`OLLAMA_POLL_ATTEMPTS`/`CONTAINER_POLL_ATTEMPTS`), nem abortá-los cedo diante de `'unavailable'`. O limite continua sendo por número de tentativas (**D15**, residual nomeado).
- **Não** tornar nenhum orçamento configurável por `AtlasConfig`, flag de CLI, env, `deps` ou parâmetro (**D4**).
- **Não** adicionar costura de teste nova em `NodeProcessPortDeps` (nenhum `setTimer`/`now`/`clock`) — o arquivo sai com os mesmos dois campos, `fetch` e `spawn` (**D14**).
- **Não** introduzir timeout **total** no download de modelo (Restrição 12 da SPEC-0063 permanece em vigor).
- **Não** criar, renomear ou remover variante de `DependencyOutcome`, `ModelPullOutcome`, `ModelPullFailureReason`, `SearchContainerState`, `OllamaStartOutcome` ou `OllamaInspection`.
- **Não** acrescentar operação nova à `ProcessPort` (ADR-0027(b)) nem operação Docker nova (`run`/`create`/`pull`/`rm`/`kill`/`compose` seguem proibidos por ADR-0027(h)).
- **Não** supervisionar dependências depois da tentativa: sem health-check periódico, sem restart automático, sem retry, sem captura de logs.
- **Não** tocar `apps/desktop`, `@atlas/contracts`, `@atlas/permissions`, `@atlas/runtime`, `@atlas/tools`, `@atlas/model-gateway` nem qualquer outro package — diff **vazio** em todos.
- Em `apps/cli`, **só** a string do item 4.2 (e o caso de teste do item 5.9). Nenhuma flag, env, validação, código de saída, `HELP_TEXT`, linha de `atlas status` ou branch novo — diff **vazio** em todo o resto de `apps/cli`.
- **Não** alterar nenhum outro texto pinado: os demais avisos de auto-start (Ollama e container), `atlas status`, painel `Sistema` e tela de catálogo de modelos saem como estão; nenhuma superfície de GUI/CLI **nova** (**D16**, **D17**).
- **Não** persistir nada (Artigo 11): timers e flags são estado em memória da chamada, morrem com ela.
- **Não** mexer no `setTimeout` de `STOP_GRACE_PERIOD_MS` (`stopOllama`), que já é um teto — inclusive não "otimizá-lo" para resolver cedo ao ver `'exit'`.

---

# Pré-requisitos

Status conferido em `docs/implementation/specs/` e em `docs/05-context/NEXT_CONTEXT.md` (2026-09-20):

- [SPEC-0060](SPEC-0060-ollama-auto-start.md) — `Done`
- [SPEC-0061](SPEC-0061-search-container-auto-start.md) — `Done`
- [SPEC-0062](SPEC-0062-desktop-dependency-autostart-default.md) — `Done`
- [SPEC-0063](SPEC-0063-desktop-model-provisioning.md) — `Done`

Nenhuma SPEC em aberto é pré-requisito. Nenhum ADR em `Proposed` é consumido.

---

# Critérios de Aceitação

Cada item é verificável mecanicamente (teste, `grep` ou `git diff`).

> **Nota ao `spec-validator`/`spec-closer`** (higiene apontada pelo `architecture-reviewer`): os CAs **2**, **5** e **26** são os únicos que exigem leitura, não só execução de comando — 2 e 5 são um `git diff`/`grep` cujo resultado precisa ser **interpretado** (o que conta como "literal de tempo" e como "mudança de código" está definido no próprio item), e 26 é uma conferência aritmética da seção Observações contra a tabela do item 1. Todos os demais são teste ou comando com saída binária.

**Constantes e superfície**

1. `packages/core/src/dependencies/node-process-port.ts` declara exatamente as quatro constantes novas do item 1, com **exatamente** os valores da tabela; as duas pré-existentes continuam com `2000`.
2. `grep` prova que nenhum literal numérico de tempo novo aparece fora dessas constantes no arquivo — "literal de tempo" = número usado como argumento de `setTimeout`/`AbortSignal.timeout` ou comparado a um orçamento.
3. `NodeProcessPortDeps` continua com exatamente dois campos: `fetch?` e `spawn?`.
4. `packages/core/src/dependencies/process-port.ts`: `git diff` mostra **somente** linhas de comentário alteradas (nenhuma linha de `type`/`interface`/`export`).
5. `git diff --stat` mostra, em `packages/core/src`, **um único** arquivo com mudança de código: `dependencies/node-process-port.ts`.
6. `git diff --exit-code` é limpo em `packages/core/src/dependencies/dependency-manager.ts`, `packages/core/src/index.ts`, `packages/contracts`, `apps/desktop` e em todos os demais `packages/*`. Em `apps/cli/src`, o único arquivo alterado é `run.ts` (CA 32).

**`startOllama`**

7. Filho que nunca emite `'spawn'` nem `'error'`: após avançar `SPAWN_HANDSHAKE_TIMEOUT_MS`, a promessa resolve `{ started: false, reason: 'spawn-failed' }`.
8. No estouro de (7), `kill()` é chamado **uma** vez no filho.
9. Após (7), emitir `'spawn'` tardio não altera o valor já devolvido, não atribui posse interna (um `stopOllama()` subsequente não chama `kill()` de novo) e não lança.
10. Caminho feliz (`'spawn'` antes do orçamento): desfecho `{ started: true }`, `kill()` nunca chamado, `vi.getTimerCount() === 0` após assentar.

**Container de busca**

11. `inspectSearchContainer` sem `'close'`/`'error'`: após `DOCKER_PROBE_TIMEOUT_MS`, resolve `'unavailable'` (nunca `'unknown'`, `'running'` ou `'stopped'`) e `kill()` é chamado uma vez.
12. `startSearchContainer` sem `'close'`/`'error'`: após `DOCKER_COMMAND_TIMEOUT_MS`, resolve `{ started: false, reason: 'docker-unavailable' }` e `kill()` é chamado uma vez.
13. `stopSearchContainer` sem `'close'`/`'error'`: após `DOCKER_COMMAND_TIMEOUT_MS`, a promessa **resolve** (`undefined`), sem lançar, e `kill()` é chamado uma vez.
14. Nos três casos acima, um evento tardio posterior ao estouro não lança nem produz segundo assentamento.
15. Caminhos felizes dos três: desfechos idênticos aos de hoje e `vi.getTimerCount() === 0` após assentar.

**`pullOllamaModel`**

16. Nenhuma resposta do `fetch` dentro de `MODEL_PULL_STALL_TIMEOUT_MS` ⇒ `{ status: 'failed', reason: 'unreachable' }`.
17. Resposta recebida e stream sem bytes novos por `MODEL_PULL_STALL_TIMEOUT_MS` ⇒ `{ status: 'failed', reason: 'stream-failed' }`.
18. Stream com chunks a cada `MODEL_PULL_STALL_TIMEOUT_MS - 1` ms, somando ≥ 3 × o orçamento, terminando em `{"status":"success"}` ⇒ `{ status: 'installed' }` (**prova de que não há timeout total**).
19. `cancelOllamaModelPull()` (`request.signal` abortado) durante a janela de estagnação ⇒ `{ status: 'cancelled' }`, nunca `'stream-failed'`/`'unreachable'` (precedência da regra 1 do item 2.7).
20. Os casos pré-existentes de `pullOllamaModel` (rejected/stream-failed/installed/cancelled/progresso) seguem passando **sem edição do próprio `expect`**.
21. Depois de qualquer desfecho de `pullOllamaModel`, `vi.getTimerCount() === 0`.

**Regressão e verificação global**

22. Todos os testes pré-existentes de `packages/core/tests/` passam sem alteração de expectativa — em particular `dependency-manager.test.ts` e `model-pull.test.ts` (nenhum desfecho pinado pelas SPECs 0060–0063 muda).
23. `pnpm --filter @atlas/core test` e `pnpm --filter @atlas/core typecheck` verdes.
24. Na raiz: `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` verdes.
25. Nenhum teste desta SPEC spawna processo real, invoca `docker`, `ollama` ou faz requisição de rede (`grep` por `nodeSpawn`/`globalThis.fetch` sem stub nos testes novos).
26. A SPEC registra, em Observações, os limites de parede resultantes por caminho (`ensureOllama`, caminho do container, `release()`) — dado conferível contra as constantes.

**Higiene de handle do filho (item 2.1, D18)**

27. No estouro de **cada uma** das quatro operações sobre `ChildProcess` (`startOllama`, `inspectSearchContainer`, `startSearchContainer`, `stopSearchContainer`), o filho recebe `unref()` exatamente **uma** vez, além do `kill()` dos CAs 8/11/12/13.
28. No estouro de `inspectSearchContainer`, `proc.stdout` tem o listener `'data'` removido **e** é destruído (`removeAllListeners('data')` + `destroy()`, ambos registrados pelo fake); um evento `'data'` emitido **depois** do estouro não altera o desfecho `'unavailable'` já devolvido e não lança.
29. Caminho feliz das quatro operações: `unref()` é chamado **só** por `startOllama` (uma vez, no handler de `'spawn'` que já existe hoje) e **zero** vez pelas três operações Docker; `proc.stdout` do probe **não** é destruído; os desfechos são idênticos aos de hoje.
30. Um `unref()` que lança (fake configurado para tal) **não** impede o assentamento nem propaga — o desfecho de estouro sai igual (prova do `try/catch` por passo do item 2.1).

**Precedência do cancelamento humano (item 2.7, D19)**

31. `pullOllamaModel` chamada com um `request.signal` **já abortado** no instante da chamada ⇒ `{ status: 'cancelled', model }`; o `signal` que chega ao fake de `fetch` tem `aborted === true`; nenhum `reader.read()` é executado; `vi.getTimerCount() === 0` ao final. (Teste vermelho se o encaminhamento for só `addEventListener`.)

**Texto da CLI (item 4, D17)**

32. `git diff` em `apps/cli` mostra **um único** arquivo de produção alterado, `src/run.ts`, e nele **somente** as linhas do literal de aviso do item 4.2 — nenhuma linha de `if`/`return` nova, nenhum símbolo novo, nenhuma mudança em `HELP_TEXT` ou em `formatOllamaWarning`.
33. `apps/cli/tests/auto-start-ollama.test.ts` pina em stderr o texto do item 4.2 para `'failed'`/`'docker-unavailable'`, e os demais casos de aviso (Ollama e container) passam **sem edição do próprio `expect`**.

---

# Arquivos Esperados

```text
packages/core/src/dependencies/
  node-process-port.ts        (mod — único arquivo de produção com mudança de código)
  process-port.ts             (mod — somente comentários)

apps/cli/src/
  run.ts                      (mod — SOMENTE o literal de aviso do item 4.2, D17)

packages/core/tests/
  node-process-port.test.ts   (mod — casos novos de orçamento e de higiene de handle)

apps/cli/tests/
  auto-start-ollama.test.ts   (mod — um caso novo: o aviso de 'docker-unavailable', item 5.9)

docs/implementation/specs/
  SPEC-0064-process-operation-time-budgets.md   (este arquivo)
```

Nenhum arquivo novo é criado.

---

# Componentes Impactados

- **Lifecycle Manager** (`packages/core`) — adaptador real da `ProcessPort`. Único componente com mudança de comportamento.
- **Output Gateway** (`apps/cli`) — **apenas o texto** de um aviso já existente, ampliado para não mentir sobre a causa (item 4/**D17**). Nenhuma responsabilidade nova, nenhuma lógica: a semântica de quem decide o quê fica idêntica.

Não impactados (diff vazio, verificável): Permission Service, Runtime, Task Manager, Tool Registry, Model Gateway, Cognitive Core, Planner, Memory Service, Context Service, Persona Service, Skill Registry/Builder, `apps/desktop`, `@atlas/contracts`.

---

# Interfaces Necessárias

**Nenhuma interface nova, e nenhuma interface existente alterada.** `ProcessPort`, `NodeProcessPortDeps`, `SearchContainerState`, `OllamaStartOutcome`, `OllamaInspection`, `ModelPullRequest`, `ModelPullOutcome`, `ModelPullProgress`, `DependencyManager`, `DependencyOutcome` e `DependencyReport` saem com a **mesma forma**. A única estrutura nova é um helper **privado** (não exportado) de watchdog dentro de `node-process-port.ts`.

---

# Fluxo Esperado

```text
DependencyManager (inalterado)
        ↓ chama uma operação nomeada
nodeProcessPort().<operação>
        ↓ arma orçamento (setTimeout)
  ┌─────────────┴─────────────┐
evento chega                 orçamento estoura
dentro do prazo              (filho mudo / daemon inerte / stream estagnado)
  ↓                            ↓
clearTimeout                 kill() + unref() (+ stdout.destroy() no probe),
  ↓                          todos best-effort  →  desfecho de falha JÁ EXISTENTE
desfecho de hoje             (assentamento único: evento tardio é ignorado)
  └─────────────┬─────────────┘
                ↓
   promessa SEMPRE assenta; nunca lança
                ↓
DependencyManager classifica como sempre
('failed'/'timeout'/posse) — nenhuma regra nova
```

---

# Estratégia de Implementação

1. Ler ADR-0027 (a)–(h), a Restrição 12 e os residuais 12/13 da SPEC-0063, e o arquivo `node-process-port.ts` inteiro.
2. Escrever, em RED, os casos 7–15 e 27–30 (operações sobre `ChildProcess`, incluindo a higiene de handle) com `vi.useFakeTimers()` e os fakes já existentes no arquivo de teste — o fake de `ChildProcess` ganha registro de `unref()` e de `stdout.removeAllListeners`/`stdout.destroy()`.
3. Introduzir o helper privado de watchdog (item 2.1, com os quatro passos best-effort) e aplicá-lo a `startOllama` → `inspectSearchContainer` → `startSearchContainer` → `stopSearchContainer`, uma operação por vez, rodando `pnpm --filter @atlas/core test` entre cada uma.
4. Escrever, em RED, os casos 16–21 e 31 (estagnação do stream e signal já abortado), inclusive o caso 18 (que só passa se o orçamento for de inatividade) e o 31 (que só passa com a checagem síncrona de `aborted`).
5. Implementar o encaminhamento de `signal` (checagem síncrona **antes** do listener, item 2.7/**D19**) + *kick* do timer em `pullOllamaModel`, com a classificação na ordem normativa.
6. Atualizar os comentários de `process-port.ts` (item 3).
7. Ampliar o literal de aviso de `apps/cli/src/run.ts` (item 4.2) e escrever o caso 33 em `apps/cli/tests/auto-start-ollama.test.ts`; rodar `pnpm --filter @atlas/cli test`.
8. Conferir os CAs estruturais (5, 6, 25, 32) com `git diff`/`grep`, e rodar os quatro comandos completos na raiz (CA 24).

---

# Estratégia de Testes

- **Unidade, no adaptador**, com `vi.useFakeTimers()` e fakes de `spawn`/`fetch`/`ReadableStream` — nenhum processo, container ou socket real (mesma disciplina das SPECs 0060/0061/0063).
- **Fronteira exata do orçamento**: para cada operação, um caso que avança `orçamento - 1` ms (nada acontece) e outro que avança o orçamento inteiro (estoura). O caso 18 exercita a fronteira repetidamente.
- **Assentamento único**: eventos tardios após o estouro, provados sem `expect.assertions` frágil — o desfecho já devolvido é comparado por valor.
- **Higiene de timer**: `vi.getTimerCount() === 0` após cada desfecho (CAs 10, 15, 21) — impede que a correção deixe timers pendentes capazes de segurar o processo da CLI.
- **Higiene de handle** (o **outro** segurador do event loop, ao lado do timer): `unref()` no estouro das quatro operações e encerramento do stream de `stdout` no probe (CAs 27–30) — sem isso, o teto faria a promessa assentar com o processo ainda preso ao filho, que é o sintoma que esta SPEC existe para remover.
- **Precedência do cancelamento**: o caso do `signal` **já abortado** (CA 31) é escrito deliberadamente como teste de regressão do encaminhamento manual (**D19**) — é a única forma de provar mecanicamente uma quebra que não produz erro, só uma requisição que não deveria ter saído.
- **Regressão de desfecho pinado**: `dependency-manager.test.ts` e `model-pull.test.ts` rodam sem edição (CA 22) — é o teste de que o manager não mudou; em `apps/cli`, os avisos pinados pelas SPECs 0060/0061 rodam sem edição exceto o branch do item 4.2 (CA 33).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os 33 critérios de aceitação forem atendidos;
- testes passando (`pnpm test` na raiz, além do filtro por package);
- documentação atualizada;
- arquitetura preservada (ADR-0027 (a)–(h) intactas; nenhuma cláusula reaberta; nenhum ADR novo);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz, `packages/core/CLAUDE.md`, `docs/05-context/NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) e a nota de atualização no ADR-0027 **não** são escopo do `spec-implementer` — são o passo `doc-sync` do fecho. O implementador toca apenas esta SPEC e o código/testes listados.

---

# Restrições

1. Não criar módulo, Tool, Skill, Persona, porta ou operação nova (ADR-0027(b)).
2. Não alterar `createAtlas`/`createLifecycle` nem seus hooks (ADR-0027(d)).
3. Não alterar nenhum desfecho pinado pelas SPECs 0060–0063: o conjunto de variantes é o mesmo, muda apenas **uma causa a mais** de se chegar a variantes de falha já existentes.
4. Não tornar o adaptador tomador de decisão de política: ele continua executando IO e reportando; quem interpreta desfecho e decide posse é o manager (Artigo 5).
5. Não introduzir timeout total no download; o orçamento é de **inatividade** e o cancelamento humano continua tendo precedência.
6. Nenhum teste pode depender de Docker, Ollama, rede ou de relógio real.
7. Não usar API de runtime cuja disponibilidade dependa da versão exata de `@types/node` — em particular, **não** usar `AbortSignal.any` (**D9**).
8. Nada persistido (Artigo 11).
9. Nenhum passo de limpeza no estouro (`kill`/`unref`/`destroy`) pode propagar erro ou alterar o desfecho já marcado: cada um no seu `try/catch`, sempre (**D18**).
10. Em `apps/cli`, nada além do literal do item 4.2 — a SPEC continua **sem** superfície de usuário nova (**D16**/**D17**).

---

# Observações

**Limites de parede resultantes** (dado do CA 26, produto das constantes — nenhum é novo comportamento, são os tetos que passam a existir):

- `inspectOllama` ≤ 2 s · `startOllama` ≤ 5 s · `stopOllama` ≤ 2 s;
- polling de prontidão do Ollama ≤ 40 × (250 ms + 2 s) = 90 s ⇒ **`ensureOllama` ≤ ~97 s** (antes: limitado só porque `inspectOllama` já tinha orçamento, com `startOllama` em aberto);
- `inspectSearchContainer` ≤ 5 s · `startSearchContainer` ≤ 30 s · polling do container ≤ 20 × (250 ms + 5 s) = 105 s ⇒ **caminho do container ≤ ~140 s** (antes: **sem limite**);
- **`ensure()` ≤ ~237 s** no pior caso absoluto (as duas dependências ligadas, ambas patológicas);
- **`release()`** ≤ drenagem do acima + 2 s (`stopOllama`) + 30 s por container possuído (antes: **sem limite**).

**Residuais nomeados, registrados e não fechados:**

1. **O limite de `ensure()` é um produto, não um orçamento de parede** (**D15**): ~4 min no pior caso patológico é finito, mas alto. Um teto de parede único para o `ensure` (ou abortar o polling ao primeiro `'unavailable'`) é fatia futura, no manager — deliberadamente fora daqui para manter o diff do manager vazio e não alterar desfecho pinado.
2. **Uma operação de `start` que estoura pode, ainda assim, ter ligado a dependência — nas duas dependências, não só no Docker.** (a) `docker start`: o daemon faz o trabalho e matar o cliente não o desfaz. (b) `startOllama`: o `spawn` é `detached: true`, então o handshake pode estourar com um `ollama serve` já no ar — o `kill()` do item 2.1 é best-effort e, num SO lento, pode chegar antes de o processo existir de fato ou falhar em derrubá-lo. Nos dois casos a sessão **não** registra posse (a porta reportou falha), então a dependência fica de pé após o `before-quit`. É a leitura fiel da regra de posse das SPECs 0060/0061 (posse só no sucesso) levada ao caso novo: preferimos deixar um processo vivo a desligar algo que talvez não seja nosso. O usuário derruba manualmente, como faria com qualquer processo/container que ele mesmo subiu.
3. **O orçamento de 120 s de estagnação é um palpite informado**, não uma medida: nenhum dado real de latência de `POST /api/pull` em rede ruim foi coletado. Se algum dia um download legítimo for morto por ele, o ajuste é de uma constante.
4. **Nada supervisiona a dependência depois do `ensure`** (residual herdado das SPECs 0060/0061/0062): sem health-check periódico, sem restart. Esta SPEC limita o **tempo de uma tentativa**, não o ciclo de vida posterior.
5. **`main.ts` continua chamando `releaseExternalDependencies()` com `void`** (residual 9 da SPEC-0062/residual 9 da SPEC-0063): o desligamento segue "correto, não garantido" — esta SPEC torna o `release()` **limitado**, o que é condição necessária mas não suficiente para ele terminar antes de o Electron encerrar o processo.
6. **`stopOllama` continua esperando os 2 s de graça mesmo quando o processo já saiu** — teto existente, ineficiência conhecida, deliberadamente não tocada (Fora do Escopo) para manter o diff mínimo.
7. **O texto pinado `"sem resposta em <baseUrl> após 10s"` do aviso de `'timeout'` do Ollama (`apps/cli/src/run.ts:167-170`) já é impreciso hoje** — o polling de prontidão do manager chega a ~90 s, não 10 s. É imprecisão **pré-existente** (SPEC-0060/D13), não regressão desta fatia; esta SPEC é só a primeira a tornar o número verificável, ao escrever os limites de parede na seção acima. Fica registrado e **não** corrigido aqui: o texto está pinado por teste (`auto-start-ollama.test.ts`, caso `"failed"/"timeout" cita o baseUrl e "10s"`), e mexer nele arrastaria a edição de um caso existente — exatamente o que o CA 33 promete não fazer. Fatia própria, trivial, quando alguém for reabrir os textos de auto-start.
8. **`kill()` no estouro pode matar um cliente `docker` que estava só lento**, não travado — e, nesse caso, o Atlas reporta `'unavailable'` para um Docker que responderia em, digamos, 31 s. É o custo inerente de qualquer teto (**D5** escolheu os valores com ~2× de folga sobre o pior caso legítimo); a mitigação disponível ao usuário é tentar de novo, que é a mesma ação de qualquer outra falha (**D16**).

---

# Decisões de design

Cada decisão em formato de veto: **Decisão** · **Porquê** · **Alternativa descartada**.

**D1 — Perfil `micro`.**
Porquê: satisfaz todas as condições da Emenda v1.2 — fica contida em `packages/core/src` (um arquivo de código + um de comentários + um de teste) **mais a superfície de CLI que a expõe** (`apps/cli/src/run.ts`, um literal de texto; **D17**), que é exatamente o recorte que a Emenda admite dentro do perfil micro; é aditiva e deriva inteiramente do ADR-0027(c)/(f) e do precedente pinado pela SPEC-0060/item 2.5, não toca `@atlas/contracts`, não cria módulo/Tool/Skill/Persona, não move responsabilidade, não exige ADR novo nem emenda, e cabe numa sessão. Nenhum dos quatro casos de escalação obrigatória é tocado. **Confirmado na 1ª revisão do `architecture-reviewer`**, que manteve o perfil ao vetar (as três correções exigidas são texto normativo, nenhuma exige ADR).
Alternativa descartada: `completo` por precaução — perdeu porque a única ambiguidade candidata (alargar a **semântica documental** de `'unavailable'` e dar uma segunda origem ao abort do download) está inteiramente dentro do package, sem mudança de tipo e sem consumidor externo, e porque o único arquivo fora de `packages/core` é o `run.ts` que a própria Emenda nomeia; se o `architecture-reviewer` julgar o contrário, a reclassificação custa zero (a SPEC cai no ramo completo sem prejuízo).

**D2 — Prioridade `High`.**
Porquê: desde a SPEC-0062/ADR-0028 o bootstrap de dependências roda em **toda** abertura do desktop, então o caminho sem teto deixou de ser um caso de borda e passou a ser o caminho padrão de todo usuário; os sintomas são "a janela não fecha" e "a tela de instalação de modelo nunca abre" (residual 12 da SPEC-0063), que o usuário não tem como diagnosticar (Artigo 7).
Alternativa descartada: `Medium` ("achado não-bloqueante, ninguém reportou") — perdeu pela assimetria de custo: o conserto é confinado e barato, enquanto o modo de falha é silencioso, não diagnosticável e já foi adiado por três fatias seguidas.

**D3 — O watchdog vive no **adaptador** (`nodeProcessPort`), não no `DependencyManager`.**
Porquê: só quem criou o filho pode matá-lo. Um `Promise.race` no manager faria a chamada "desistir" mas deixaria a promessa da porta pendente **para sempre** e o `docker inspect` pendurado vivo — trocaria um vazamento por outro. Além disso, o adaptador já é o dono dos orçamentos de IO por chamada (`HEALTH_CHECK_TIMEOUT_MS`, `STOP_GRACE_PERIOD_MS`, SPEC-0060/item 2.5), então esta SPEC **generaliza um padrão existente** em vez de criar um segundo dono do tempo. O manager segue decidindo política (posse, classificação, prontidão) — Artigo 5 preservado.
Alternativa descartada: `Promise.race(chamada, sleep(orçamento))` dentro do manager, reusando a costura `sleep` já injetada — perdeu por (i) não limpar o processo, (ii) exigir diff no manager e no fake `sleep` de todos os testes existentes (que resolve imediatamente, o que faria toda operação "estourar" na hora), e (iii) espalhar a responsabilidade temporal por dois módulos.

**D4 — Orçamentos são constantes pinadas no código, não configuração.**
Porquê: é exatamente o que a SPEC-0060 já fez com os dois orçamentos existentes ("contrato de invocação pinado como dado da SPEC"); tornar configurável criaria campo novo em `AtlasConfig` (logo, `@atlas/contracts`), flag, env e validação — saindo do perfil micro para resolver um problema que ninguém tem. Simplicidade e menor superfície (teste da Constituição).
Alternativa descartada: `AtlasConfig.dependencies.timeouts` / env `ATLAS_DEPENDENCY_TIMEOUT_MS` — perdeu por peso desproporcional; se um usuário real precisar ajustar, vira fatia própria com ADR-0006 aplicável.

**D5 — Valores: 5 s (handshake de `spawn`), 5 s (`docker inspect`), 30 s (`docker start`/`stop`), 120 s (estagnação do download).**
Porquê: cada um é ~2× o pior caso legítimo observável. O handshake de `spawn` é evento local do SO (milissegundos); `docker inspect` é round-trip no socket local; `docker start`/`stop` são estado do daemon, e o próprio `docker stop` tem 10 s de graça default antes do SIGKILL, então 30 s cobre o pior caso legítimo com folga de 3×; 120 s sem **um byte** num stream de `pull` significa conexão morta, não lentidão (o Ollama emite linhas de progresso continuamente enquanto baixa).
Alternativa descartada: um único orçamento global (p. ex. 30 s para tudo) — perdeu porque faria o probe do bootstrap custar 30 s num daemon inerte (e 20 × 30 s no polling), degradando a abertura da janela justamente no cenário que esta SPEC existe para proteger.

**D6 — `startSearchContainer` e `stopSearchContainer` compartilham o mesmo orçamento; `inspectSearchContainer` tem o seu.**
Porquê: a divisão que importa é **leitura barata** (probe, que roda em laço e gateia decisões) × **mutação de estado do daemon** (start/stop, que legitimamente demoram e rodam uma vez). Duas constantes descrevem essa diferença; quatro só descreveriam a lista de métodos.
Alternativa descartada: uma constante por método — perdeu por não acrescentar informação e multiplicar o que precisa ser justificado e mantido.

**D7 — No estouro, o filho recebe `kill()` best-effort, sempre dentro de `try/catch`.**
Porquê: desistir sem matar deixaria um `docker inspect`/`ollama serve` zumbi que ninguém mais referencia — o oposto do objetivo. `kill()` pode lançar/retornar `false` (processo inexistente, sem pid), e a operação prometeu **nunca lançar**; daí o `try/catch`. No caso do `startOllama`, o handshake não ocorreu, então não há daemon útil a preservar e a posse não é registrada — coerente com a regra "posse só no sucesso do `spawn`" (SPEC-0060/D23), que não é alterada.
Alternativa descartada: resolver sem matar, deixando o filho por conta do SO — perdeu porque o processo do Atlas pode viver horas (desktop) e acumularia clientes Docker pendurados a cada tentativa.

**D8 — Estouro das operações Docker mapeia para a **indisponibilidade** do Docker (`'unavailable'` / `'docker-unavailable'`), nunca para `'unknown'`/`'container-unknown'` nem `'start-failed'`.**
Porquê: `'unknown'` significa "o daemon respondeu e não conhece esse container" e `'start-failed'` significa "o daemon respondeu e recusou" — um estouro **não** é resposta do daemon. Afirmar "container inexistente" para um daemon mudo seria mentir ao usuário sobre a causa (Artigo 7) e induziria a ação errada (renomear o container em vez de checar o Docker). "Docker inutilizável nesta tentativa" é a leitura verdadeira e já tem variante.
Alternativa descartada: criar variantes `'timeout'` em `SearchContainerState`/`SearchContainerStartOutcome` — perdeu por contrariar a frase pinada da porta ("`'timeout'` não é desfecho da porta, é decisão temporal do manager"), exigir diff no manager (mapeamento novo) e mudar desfechos pinados pelas SPECs 0060/0061, tudo por granularidade que nenhuma superfície consome hoje.

**D9 — O download usa um `AbortController` interno com **encaminhamento manual** do `signal` recebido; nada de `AbortSignal.any`.**
Porquê: o adaptador não pode abortar o `signal` do manager (não é dono dele), então precisa de um controller próprio; o encaminhamento por `addEventListener('abort', …, { once: true })` com remoção no `finally` é explícito, não depende da versão de `@types/node` declarar `AbortSignal.any`, e dá o gancho natural de limpeza. A precedência do cancelamento humano é preservada lendo `request.signal.aborted` **antes** de `timedOut` na classificação.
Alternativa descartada: `AbortSignal.any([request.signal, watchdog.signal])` — mais curto, mas perdeu pelo risco de tipagem/ambiente (o repositório roda `typecheck` com `@types/node` pinado e já pratica "não usar API cuja disponibilidade não seja certa") e por esconder o ponto de limpeza.

**D10 — O relógio de estagnação é rearmado por **bytes recebidos**, não por linha NDJSON válida nem por progresso numérico.**
Porquê: bytes chegando é a evidência mínima e mais robusta de que a conexão está viva; exigir linha válida mataria um download durante um chunk grande ainda não terminado em `\n`, e exigir `completed`/`total` mataria downloads em fases que o Ollama reporta só com `status` textual — que, por D10 da SPEC-0063, o adaptador nem repassa.
Alternativa descartada: rearmar em `onProgress` — perdeu por acoplar o watchdog ao formato do provedor, exatamente o acoplamento que a SPEC-0063 isolou.

**D11 — O estouro do download reusa `'unreachable'` (antes da resposta) e `'stream-failed'` (depois), sem variante nova.**
Porquê: as duas descrevem com fidelidade o que aconteceu ("a requisição não completou" / "stream interrompido") e mantêm o diff confinado ao adaptador — uma variante `'timeout'` nova em `ModelPullFailureReason` obrigaria a tocar o manager e o mapa de mensagens em português do `apps/desktop`, saindo do perfil micro para ganhar uma distinção que a mensagem ao usuário não muda de forma útil.
Alternativa descartada: `ModelPullFailureReason: 'timeout'` — registrada como melhoria possível se algum dia a distinção virar acionável (p. ex. sugerir "tente de novo" só nesse caso).

**D12 — Estagnação, nunca duração total.**
Porquê: a Restrição 12 da SPEC-0063 proíbe timeout total pelo motivo certo (um `pull` de vários GB não tem orçamento fixo), e o residual 13 da mesma SPEC nomeia justamente a detecção de estagnação como a fatia seguinte. Esta SPEC executa o que aquele residual pediu, sem contrariar a restrição: um download que progride jamais é interrompido, e o CA 18 é o teste mecânico disso.
Alternativa descartada: teto total generoso (p. ex. 2 h) — perdeu por ser arbitrário, por depender da banda do usuário e por poder matar um download legítimo quase concluído.

**D13 — A frase pinada "`'timeout'` não é desfecho da porta" **permanece**, ganhando só a distinção dos dois eixos temporais.**
Porquê: ela continua literalmente verdadeira — a porta segue sem emitir `'timeout'`; o que ganha orçamento é o **IO por chamada**, enquanto `'timeout'` continua sendo a decisão do manager sobre **prontidão**. Remover ou reescrever a frase sugeriria uma mudança de contrato que não existe, e o Artigo 8 manda registrar em vez de deixar ambíguo.
Alternativa descartada: apagar a frase — perdeu por perder a distinção que ela protege (e que esta SPEC depende de manter para não mexer no manager).

**D14 — Testes com `vi.useFakeTimers()` sobre as costuras existentes; nenhuma costura de tempo nova em `NodeProcessPortDeps`.**
Porquê: o repositório já testa watchdog de subprocesso exatamente assim (`apps/desktop/tests/piper-tts.test.ts`, com `UTTERANCE_TIMEOUT_MS`) e já usa `vi.useFakeTimers()` em `packages/tools/tests/http-port.test.ts`. Injetar um `setTimer?` ampliaria a superfície pública de `nodeProcessPort` para algo que o ferramental de teste já resolve.
Alternativa descartada: `deps.setTimer?: (cb, ms) => () => void` no molde de `fetch`/`spawn` — perdeu pelo teste da Constituição (mais simples sem): a costura existe para substituir **IO**, não relógio, e o relógio já é substituível globalmente pelo Vitest.

**D15 — O laço de polling do manager fica como está; o limite resultante é o produto (tentativas × orçamento), registrado como residual.**
Porquê: mexer no polling exigiria diff no manager, um relógio injetável novo (o `sleep` fake dos testes resolve na hora) e a revisão de desfechos pinados pelas SPECs 0060/0061 — custo desproporcional para esta fatia, cujo objetivo é eliminar o **infinito**, não otimizar o finito.
Alternativa descartada: teto de parede único para `ensure()` — melhor desenho a prazo, nomeado no residual 1; perdeu aqui por escopo (violaria "não expandir já que estamos mexendo") e por arrastar a SPEC para o perfil completo.

**D16 — Nenhuma superfície de usuário muda (sem linha nova em `atlas status`, no painel `Sistema` ou na tela de catálogo).**
Porquê: o estouro já chega às superfícies existentes **como falha**, pelos mesmos desfechos que elas já pintam — nenhuma informação nova precisa de lugar novo. A transparência exigida pelo Artigo 7 é atendida por a falha ser reportada em vez de a operação sumir pendurada.
Alternativa descartada: distinguir visualmente "falhou por tempo" das demais falhas — perdeu por exigir variante nova (D8/D11), diff em `apps/desktop` e perfil completo, sem mudar a ação disponível ao usuário (tentar de novo).

---

As três decisões abaixo nascem do veto da **1ª revisão do `architecture-reviewer`** (achados 1–3, todos bloqueantes, nenhum exigindo ADR). **D16 continua íntegra**: nenhuma delas cria superfície de usuário nova — D17 reescreve um texto que já existe.

**D17 — O estouro das operações Docker exige **ampliar o texto** do aviso de `'docker-unavailable'` em `apps/cli/src/run.ts`, e não registrar um residual de "a mensagem mente".**
Porquê: o achado 1 é real — o desfecho `'docker-unavailable'` passa a ter duas causas (binário ausente **e** daemon mudo além do orçamento), e o texto de hoje afirma só a primeira. **D8** rejeitou `'unknown'` com o argumento "não minta sobre a causa (Artigo 7)"; aceitar que a CLI minta pela mesma causa seria contradizer a própria decisão que sustenta o desenho. A correção é um literal — sem branch, sem variante, sem flag — em `apps/cli/src/run.ts`, arquivo que a Emenda v1.2 admite explicitamente dentro do perfil micro (**D1**). `apps/desktop` já está correto (`renderer.js:2795` diz genericamente "Docker indisponível"), o que confirma que a correção é local e mínima. De quebra, o CA 33 cobre o **único** branch de `formatSearchContainerWarning` hoje sem teste.
Alternativa descartada: (b) registrar residual explícito "o texto fica impreciso no estouro" — a saída que o reviewer também admitia. Perdeu por assimetria de custo: manter a imprecisão custa a confiança do usuário num diagnóstico (ele vai procurar um binário que existe, em vez de olhar o daemon) e custa por tempo indefinido; corrigir custa uma string e um teste, dentro do mesmo perfil. Também perdeu por coerência: a SPEC inteira se justifica por "falha reportada é melhor que espera silenciosa" — falha **mal** reportada é a mesma doença em grau menor.
Consequência se estiver errada: se a ampliação do texto tiver sido desnecessária (p. ex. alguém julgar o texto novo prolixo demais para o terminal), o custo é uma linha de texto revisada numa fatia futura — o desfecho, o tipo e a lógica ficam idênticos, então nada depende dessa escolha.

**D18 — No estouro, o watchdog não só mata: **desacopla** (`unref`) o filho e **encerra** o stream de `stdout` do probe, cada passo best-effort.**
Porquê: o achado 2 é real e é o que separa "a promessa assenta" de "o processo termina". Um `ChildProcess` retido segura o event loop do pai; hoje `unref()` só roda no handler de `'spawn'` de `startOllama` (`node-process-port.ts:186`), que por definição **não** ocorre no caminho de estouro — e o item 2.2 ainda registra que o handle não é retido em `child`, então ninguém poderia desacoplá-lo depois. Somado a isso, `inspectSearchContainer` abre `stdio: ['ignore', 'pipe', 'ignore']` e mantém um listener `'data'` (`node-process-port.ts:226`): um `Readable` fluindo é o segundo segurador. Se o `kill()` não surtir efeito (SIGTERM ignorado, cliente `docker` travado num socket), o desfecho sai correto e a CLI **ainda assim** não termina / o `before-quit` do desktop **ainda assim** não conclui — ou seja, sem este item a SPEC entregaria o teto e não o objetivo (Objetivo 2). A própria Estratégia de Testes já tratava o timer pendente como "capaz de segurar o processo da CLI"; o handle do filho é o mesmo risco, e passa a ter CA (27–30).
Alternativa descartada: confiar só no `kill()` e registrar residual — perdeu porque `kill()` é, por construção desta SPEC, **best-effort** (**D7**), então o caso em que ele falha não é exótico: é exatamente o cenário patológico que motivou a fatia (daemon inerte, cliente preso). Descartada também a alternativa de reter o handle num campo para desacoplar depois: criaria posse onde a SPEC-0060/D23 diz que não há, e o manager decidiria sobre um processo que a porta reportou como falho.
Consequência se estiver errada: `unref()`/`destroy()` são idempotentes e envoltos em `try/catch`; no pior caso são chamadas inócuas sobre um handle já morto. O risco real seria chamá-los no **caminho feliz** (o `startOllama` bem-sucedido precisa do `unref()` no lugar certo, e o probe precisa do `stdout` vivo para ler a saída) — daí o CA 29 existir para pinar que o caminho feliz sai byte a byte como hoje.

**D19 — O encaminhamento do `signal` checa `request.signal.aborted` de forma **síncrona** antes de registrar o listener.**
Porquê: o achado 3 é real e é uma quebra **silenciosa**. `addEventListener('abort', …)` só captura aborts **futuros**; um `signal` recebido já abortado nunca dispara o evento, o controller interno permanece limpo e a requisição **sai de fato** — hoje, passando o `signal` recebido direto ao `fetch`, o mesmo caso rejeita imediatamente e a regra 1 devolve `'cancelled'` sem tocar a rede. Sem a checagem síncrona, a SPEC introduziria uma regressão justamente no invariante que ela declara absoluto ("o cancelamento humano tem precedência absoluta") e faria isso sem erro visível: um `POST /api/pull` disparado depois do cancelamento. A correção é uma linha, e o CA 31 é o teste que fica vermelho sem ela.
Alternativa descartada: `AbortSignal.any([...])`, que trata o caso já abortado nativamente — segue descartada pelos motivos de **D9** (dependência da versão de `@types/node`, ponto de limpeza escondido), e agora também porque a checagem síncrona resolve o mesmo problema com uma linha auditável. Descartada também a variante "checar `aborted` só no `catch`": o objetivo é **não emitir** a requisição, não classificá-la bem depois de emitida.
Consequência se estiver errada: se a checagem for redundante em algum runtime (um `fetch` que, recebendo o signal interno ainda não abortado, rejeitasse assim mesmo), o custo é uma comparação booleana a mais por download. O custo de omiti-la é uma requisição de rede que o usuário já cancelou.

---

# Checklist para IA

Antes de implementar:

- ler o ADR-0027 (a)–(h) inteiro, a Restrição 12 e os residuais 12/13 da SPEC-0063, e os itens 2.5 da SPEC-0060 e 3.2 da SPEC-0061;
- ler `packages/core/src/dependencies/node-process-port.ts` e `process-port.ts` por inteiro, e `formatSearchContainerWarning` em `apps/cli/src/run.ts`;
- confirmar que nenhuma decisão desta SPEC exige ADR novo, módulo novo ou emenda;
- identificar o módulo responsável: Lifecycle Manager (`packages/core`); a borda tocada é o Output Gateway da CLI, só no texto.

Durante a implementação:

- um orçamento por operação, todos vindos das constantes do item 1 — nenhum literal solto;
- todo caminho de saída cancela o timer, inclusive o feliz;
- assentamento único, sempre;
- `kill()`, `unref()` e `stdout.destroy()` sempre em `try/catch` **separados**; nenhuma operação passa a lançar (**D18**);
- nada de `unref()`/`destroy()` no caminho feliz (CA 29);
- em `pullOllamaModel`, checar `request.signal.aborted` **antes** de registrar o listener e **antes** do `doFetch` (**D19**);
- em `apps/cli/src/run.ts`, só o literal do item 4.2 — nenhuma linha de lógica;
- nenhuma linha em `dependency-manager.ts`.

Após a implementação:

- rodar `pnpm --filter @atlas/core test`/`typecheck`, `pnpm --filter @atlas/cli test` e depois os quatro comandos completos na raiz;
- conferir os CAs estruturais (5, 6, 25, 32) com `git diff`/`grep`;
- validar os 33 critérios de aceitação;
- registrar lições aprendidas.

---

# Resultado Esperado

Depois desta SPEC, nenhuma operação de processo do Atlas pode "sumir": todo `spawn` de `ollama serve`, toda invocação de `docker inspect`/`start`/`stop` e todo stream de download de modelo têm um teto de tempo pinado, e ao estourá-lo terminam como **falha reportada** — o app abre, a janela fecha, o painel mostra o desfecho e o usuário pode tentar de novo. A mudança é invisível quando tudo funciona: os desfechos, as regras de posse e o `DependencyManager` saem exatamente como entraram, e o único texto que muda é o aviso de Docker indisponível da CLI, ampliado para não afirmar uma causa que deixou de ser a única (**D17**). Quando o teto dispara, o processo não fica preso ao filho que acabou de desistir (**D18**) e um download já cancelado nunca chega a sair pela rede (**D19**). Apenas o modo de falha "espera infinita" deixa de existir, fechando o achado não-bloqueante que o `architecture-reviewer` vinha carregando desde a SPEC-0061.
