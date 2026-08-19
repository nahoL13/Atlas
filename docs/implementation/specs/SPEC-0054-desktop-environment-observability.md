# SPEC-0054 — Painel `Sistema` no desktop: recursos do host, consumo de tokens e relógio

> **Project Atlas — Implementation Specification**

Version: 1.0

> **Origem.** Uma primeira tentativa de desenhar esta SPEC escalou por três
> motivos (ausência de requisito no PRD; ausência de dono de módulo para
> telemetria de host; necessidade de decisão arquitetural sobre dependência
> nova e sobre quem contabiliza tokens). Os três foram resolvidos fora desta
> SPEC, em 2026-08-18: emenda do PRD (*Observabilidade do Ambiente*),
> [ADR-0024](../../06-adr/ADR-0024-desktop-host-resource-metrics.md) e
> [ADR-0025](../../06-adr/ADR-0025-desktop-token-usage-accounting.md), ambos
> `Accepted`. Esta SPEC **consome** essas decisões e não as reabre; o que
> decide é o contrato técnico que os dois ADRs explicitamente delegaram a ela.

---

# Informações Gerais

**ID**

SPEC-0054

---

**Título**

Painel `Sistema` no desktop: métricas de recurso do host, consumo de tokens da
sessão e relógio com data e dia da semana

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

---

**Item do Roadmap**

`Fase 2 — 2.1 Fundação da Interface`, registrado aqui como **exceção
consciente**: o Roadmap ainda não tem item para *Observabilidade do Ambiente*,
requisito acrescentado ao PRD em 2026-08-18, depois da última revisão do
Roadmap. A fatia é uma superfície nova do Output Gateway do `apps/desktop`
(item 2.1), sem reabrir 2.2/2.3/2.4. A criação do item correspondente no
Roadmap é tarefa do passo `doc-sync` no fechamento, não do implementador.

---

# Objetivo

Quando esta SPEC estiver concluída, o `apps/desktop` deverá ter um sétimo
painel no drawer, chamado `Sistema`, que mostra, enquanto estiver aberto:

1. **Consumo de recursos do host** — uso de CPU, uso de memória RAM, uso de
   GPU e taxa de tráfego de rede da máquina local, lidos em tempo real e
   atualizados periodicamente, com cada métrica degradando **individualmente**
   para um texto explícito de indisponibilidade quando a plataforma não a
   expuser.
2. **Consumo de tokens da sessão corrente** — total acumulado de tokens de
   entrada, de saída e geral, gastos pelas interações desde a abertura da
   sessão de chat corrente, com texto explícito quando o provedor de modelo
   não reportar consumo.
3. **Data, dia da semana e horário correntes**, atualizados a cada segundo.

Para que (2) exista, `GenerateResult` passará a carregar `usage?` (ADR-0025),
cada provider do Model Gateway passará a preenchê-lo a partir do que a própria
resposta já traz, e o Cognitive Core passará a devolver o consumo somado do
turno em `AskResult`/`ConversationTurn`, como dado — quem acumula por sessão é
o `apps/desktop`.

Nenhum comportamento já entregue (chat, `ask`, Persona, Memória, Permissões,
STT, TTS, hands-free, cancelamento, serialização de gestos, layout v3.0) muda.

---

# Motivação

O PRD, na subseção **Observabilidade do Ambiente** de *Requisitos Funcionais*
(2026-08-18), passou a exigir que o usuário possa visualizar o consumo de
recursos do ambiente local, o consumo de tokens do uso corrente e a data/dia da
semana/horário. Hoje nenhuma das três informações existe em nenhuma interface:
o desktop não lê métricas do host, o `GenerateResult` não carrega consumo de
tokens (`{ text }` apenas) e não há relógio.

O mesmo PRD registra explicitamente que essas são métricas de recurso e de
contexto temporal, **não** detalhes internos da arquitetura — logo, não
conflitam com a Restrição de não expor a arquitetura interna durante o uso
normal (argumento fechado no ADR-0025(d), não reaberto aqui).

O ADR-0024 decidiu a biblioteca (`systeminformation`), o lugar do módulo
(`apps/desktop`, main process), o modo de leitura (polling sob demanda) e a
disciplina de falha (fail-closed por métrica). O ADR-0025 decidiu o campo
aditivo em `@atlas/contracts`, o preenchimento por provider e o dono da
acumulação (`apps/desktop`, em memória, reset por sessão). Ambos delegaram
**explicitamente** a esta SPEC o contrato técnico exato: canais IPC, intervalo
de polling, formato dos valores, textos de indisponibilidade e ponto de soma.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — *Requisitos
  Funcionais → Observabilidade do Ambiente*; *Restrições*.
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) —
  Artigos 1, 2, 4, 5, 6, 7, 11, 14, 15; Emendas v1.1 e v1.2.
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Input/Output
  Gateway em `apps/*`; Model Gateway (métricas de uso); Context Service e
  Memory Service (fronteiras que esta fatia **não** cruza).
- [ADR-0024](../../06-adr/ADR-0024-desktop-host-resource-metrics.md) —
  `systeminformation`, módulo local ao desktop, polling sob demanda,
  fail-closed por métrica, rede como taxa de tráfego, sem histórico.
- [ADR-0025](../../06-adr/ADR-0025-desktop-token-usage-accounting.md) —
  `GenerateResult.usage?`, preenchimento por provider, acumulação local ao
  desktop, granularidade de total por sessão, sem custo monetário.
- [ADR-0019](../../06-adr/ADR-0019-desktop-electron-stack.md) — Electron, Core
  só no main process, IPC como fronteira exclusiva, renderer sem bundler.
- [ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) e
  [ADR-0022](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) — molde de
  módulo de main process com porta injetável e garantia offline.
- [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) e
  [ADR-0009](../../06-adr/ADR-0009-context-service-value-store.md) — por que
  esta telemetria **não** é Memória nem Contexto.
- [SPEC-0053](SPEC-0053-desktop-visual-layout.md) — layout v3.0: núcleo
  holográfico, drawer overlay, progressive disclosure, paleta roxo-realeza,
  ausência de emoji, manifesto de IDs.
- [SPEC-0045](SPEC-0045-renderer-automated-coverage.md) e
  [SPEC-0047](SPEC-0047-renderer-parity-gate-and-panel-coverage.md) — harness
  jsdom e gate de paridade renderer↔módulo.
- [SPEC-0046](SPEC-0046-desktop-voice-input-stt.md) e
  [SPEC-0052](SPEC-0052-desktop-hands-free-voice-conversation.md) — molde de
  módulo novo do main process + canal IPC + fiação em `main.ts`.
- [SPEC-0051](SPEC-0051-desktop-cancel-in-flight-operation.md) — registro único
  de operações em voo e descarte de resultado abandonado.
- `apps/desktop/CLAUDE.md`; `packages/model-gateway/CLAUDE.md`;
  `packages/cognitive/CLAUDE.md`; `packages/contracts/CLAUDE.md`.

---

# Escopo

## 1. Contrato de consumo de tokens em `@atlas/contracts`

- `packages/contracts/src/model.ts` ganha a interface nomeada:

  ```ts
  export interface TokenUsage {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly totalTokens?: number;
  }
  ```

  e `GenerateResult` ganha `readonly usage?: TokenUsage;` — forma
  estruturalmente idêntica à fixada no ADR-0025(a).
- `packages/contracts/src/cognitive.ts`: `AskResult` e `ConversationTurn`
  ganham, cada um, `readonly usage?: TokenUsage;` — mudança **aditiva e
  opcional**, no mesmo molde espelhado de `steps?` (SPEC-0014) e `learned?`
  (SPEC-0020). Nenhuma assinatura existente muda; nenhum consumidor atual é
  obrigado a lidar com o campo.
- Nenhum outro contrato é tocado. `TokenUsage` não ganha campos de custo,
  provedor, modelo ou data.

## 2. Preenchimento de `usage` nos três providers do Model Gateway

Regra comum aos três: só entram números **finitos e maiores ou iguais a
zero**, arredondados com `Math.round`; se nenhum dos três campos resultar
válido, o resultado sai **sem** a propriedade `usage` (nunca `usage: {}`).
Nenhuma chamada de rede nova é feita em nenhum provider.

- `providers/remote.ts` (OpenAI-compatible): mapeia `usage.prompt_tokens` →
  `promptTokens`, `usage.completion_tokens` → `completionTokens`,
  `usage.total_tokens` → `totalTokens`. Campo ausente ou inválido é omitido
  individualmente; `totalTokens` **não** é derivado aqui (o provedor é a
  autoridade do próprio total).
- `providers/ollama.ts` (`/api/chat`): mapeia `prompt_eval_count` →
  `promptTokens` e `eval_count` → `completionTokens`; `totalTokens` é a **soma
  dos dois campos válidos** (tratando o ausente como zero) e só existe se ao
  menos um dos dois for válido.
- `providers/fake.ts`: sintetiza deterministicamente, sem aleatoriedade —
  `promptTokens` = soma de `countWords(content)` de **todas** as mensagens do
  `GenerateRequest`; `completionTokens` = `countWords` do texto devolvido;
  `totalTokens` = soma dos dois. `countWords(s)` é
  `s.trim() === '' ? 0 : s.trim().split(/\s+/).length`.
- O texto devolvido por cada provider e todo o tratamento de erro existente
  permanecem byte a byte iguais.

## 3. Soma do consumo por turno no Cognitive Core

- `packages/cognitive/src/cognitive-core.ts` passa a acumular o `usage` de
  **todas** as chamadas `gateway.generate` do turno: planejamento, cada
  replanejamento, composição e a extração de aprendizado (`extractLearned`).
- A soma é feita por um helper puro top-level, interno ao package (não sobe a
  `@atlas/contracts`): cada um dos três campos é somado **independentemente**
  entre as chamadas, e permanece definido no resultado **se e somente se** ao
  menos uma chamada o reportou como número finito ≥ 0. Nenhuma derivação de
  `totalTokens` a partir dos outros dois acontece nesta camada.
- `extractLearned` continua nunca quebrando o turno: falha do gateway ou parse
  inválido contribui com **zero** chamadas contabilizadas, sem propagar erro.
- `PlanCycleResult` ganha um campo interno `usage?: TokenUsage`; `ask` e
  `respond` incluem `usage` no retorno **apenas quando definido** (spread
  condicional, como já é feito com `learned`, por causa de
  `exactOptionalPropertyTypes`).
- Nada mais muda no ciclo: número de chamadas, prompts, ordem, teto de
  replanejamento, `steps`, `learned` e a `Conversation` retornada saem
  idênticos.

## 4. Módulo novo `apps/desktop/src/system-metrics.ts` (main process)

Espelho estrutural de `stt-engine.ts`/`vad-resources.ts`: **não importa
`electron`**, **não importa `systeminformation`** — recebe a biblioteca por
porta injetável, e o único ponto do repositório que importa
`systeminformation` é `apps/desktop/src/main.ts`.

```ts
export interface SystemInformationPort {
  currentLoad(): Promise<unknown>;
  mem(): Promise<unknown>;
  graphics(): Promise<unknown>;
  networkStats(): Promise<unknown>;
}

export type MetricUnavailableReason = 'unsupported' | 'read-failed' | 'timeout';

export type MetricSample<T> =
  | { readonly available: true; readonly value: T }
  | { readonly available: false; readonly reason: MetricUnavailableReason };

export interface CpuMetric { readonly loadPercent: number }
export interface MemoryMetric {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly usedPercent: number;
}
export interface GpuMetric { readonly loadPercent: number }
export interface NetworkMetric {
  readonly rxBytesPerSecond: number;
  readonly txBytesPerSecond: number;
}

export interface SystemMetricsSnapshot {
  readonly cpu: MetricSample<CpuMetric>;
  readonly memory: MetricSample<MemoryMetric>;
  readonly gpu: MetricSample<GpuMetric>;
  readonly network: MetricSample<NetworkMetric>;
}

export function createSystemMetrics(deps: {
  readonly si: SystemInformationPort;
  readonly timeoutMs?: number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}): { read(): Promise<SystemMetricsSnapshot> };
```

Regras vinculantes:

- `read()` dispara as quatro leituras **em paralelo** e **nunca lança**: cada
  métrica é resolvida isoladamente.
- Orçamento de tempo por leitura: `timeoutMs`, default **2500 ms**. Estouro ⇒
  `{ available: false, reason: 'timeout' }`. Rejeição da promessa ou valor de
  retorno de forma inesperada ⇒ `'read-failed'`.
- Dado presente mas sem o campo numérico esperado (ou não finito, ou negativo)
  ⇒ `'unsupported'` — é a plataforma que não expôs o valor, não uma falha.
- Normalização determinística:
  - CPU: `currentLoad.currentLoad` ⇒ `loadPercent`, limitado a `[0, 100]` e
    arredondado a uma casa decimal (`Math.round(v * 10) / 10`).
  - Memória: `mem.total` e `mem.available`; `usedBytes = total - available`
    (limitado a `[0, total]`, `Math.round`); `usedPercent = used / total * 100`
    limitado a `[0, 100]` e arredondado a uma casa. `total <= 0` ⇒
    `'unsupported'`.
  - GPU: primeiro item de `graphics.controllers` cujo `utilizationGpu` seja
    finito; mesma normalização de porcentagem da CPU. Nenhum ⇒ `'unsupported'`.
    O modelo/nome da GPU **não** é lido nem exibido.
  - Rede: primeira entrada de `networkStats()` cujos `rx_sec` e `tx_sec` sejam
    finitos e ≥ 0, arredondados com `Math.round`. Nenhuma ⇒ `'unsupported'`.
- Sem estado entre leituras, sem cache, sem timer, sem processo residente,
  sem histórico, sem persistência, sem chamada de rede.

## 5. Módulo novo `apps/desktop/src/token-usage.ts` (main process)

```ts
export interface TokenUsageSnapshot {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly reportedTurns: number;
  readonly unreportedTurns: number;
}

export interface TokenUsageAccumulator {
  add(usage: TokenUsage | undefined): void;
  snapshot(): TokenUsageSnapshot;
  reset(): void;
}

export function createTokenUsageAccumulator(): TokenUsageAccumulator;
```

Regras vinculantes:

- `add(undefined)` ⇒ `unreportedTurns += 1`, contadores inalterados.
- `add(usage)` considera apenas campos **finitos e ≥ 0**, arredondados com
  `Math.round`. Se nenhum dos três for válido, o turno conta como
  `unreportedTurns += 1`.
- Havendo ao menos um campo válido: `reportedTurns += 1`; `promptTokens` e
  `completionTokens` somam os respectivos campos válidos; `totalTokens` soma
  `usage.totalTokens` quando válido e, **quando ausente**, soma
  `(promptTokens ?? 0) + (completionTokens ?? 0)` daquele turno. Esta derivação
  existe só aqui — a camada do Cognitive nunca deriva total.
- `reset()` zera os cinco contadores. Módulo puro: sem IO, sem `Date`, sem
  persistência, sem `electron`.

## 6. Integração no `core-bridge.ts`

- Uma **única** instância de módulo (`const tokenUsage =
  createTokenUsageAccumulator()`), no mesmo molde do estado de módulo já
  existente (seleção de Persona/permissões, registro de operações).
- Pontos de soma, exatos:
  - `resolveAskSnapshot`: imediatamente após `const result = await
    atlas.cognitive.ask(objective);`, **antes** da checagem
    `if (record.abandoned)` — `tokenUsage.add(result.usage)`.
  - `sendChatTurn`: imediatamente após `const turn = await
    atlas.cognitive.respond(...)`, **antes** da checagem
    `if (record.abandoned)` — `tokenUsage.add(turn.usage)`.
  - Consumo de operação **abandonada** (SPEC-0051) **é contabilizado**: o gasto
    ocorreu de fato; só os efeitos de domínio (`remember`,
    `updateConversation`) continuam descartados.
  - Turno/`ask` que **lança** não contabiliza nada (não há resultado).
- `openChatSession`, em caso de sucesso e imediatamente após
  `chatSessions.set(session, { atlas })`, chama `tokenUsage.reset()`.
- `__resetBridgeStateForTests()` passa a chamar `tokenUsage.reset()`.
- Função exportada nova: `readTokenUsage(): TokenUsageSnapshot` — síncrona,
  sem subir Core, sem tocar o registro de operações.
- Nada mais no `core-bridge` muda: guardas, ordem, mensagens pinadas,
  `withSelections`, `AskSnapshot`/`TurnSnapshot` (que **não** ganham `usage`),
  predicados de operação em voo e portas fail-closed saem intactos.

## 7. Fiação no `main.ts` e no `preload.cjs`

- `main.ts` (casca fina, sem lógica de domínio) importa `systeminformation`,
  compõe `createSystemMetrics({ si: { currentLoad, mem, graphics, networkStats } })`
  e registra **dois** canais novos:
  - `ipcMain.handle('atlas:metrics:read', () => systemMetrics.read())`
  - `ipcMain.handle('atlas:tokens:read', () => readTokenUsage())`
- `preload.cjs` expõe, no mesmo formato dos demais grupos:
  - `metrics: { read: () => ipcRenderer.invoke('atlas:metrics:read') }`
  - `tokens: { read: () => ipcRenderer.invoke('atlas:tokens:read') }`
- `apps/desktop/package.json` ganha `systeminformation` em `dependencies`.
  Nenhuma outra dependência é adicionada em nenhum package.
- Nenhum canal existente muda de nome, assinatura ou payload.

## 8. Painel `Sistema` no drawer v3.0

- **Sétimo** item de `#drawer-navigation`, rótulo textual `Sistema`, **último**
  da ordem: `Persona`, `Personas`, `Memória`, `Permissões`, `Objetivo`,
  `Sessão`, `Sistema`. Recebe `data-drawer-nav` e
  `aria-controls="panel-system"`, como os seis existentes.
- Toda a invariante do drawer da SPEC-0053 é preservada: zero-ou-um painel
  visível, foco contido, `Escape`/backdrop/`Fechar`, `aria-expanded`
  sincronizado, escolha efêmera, nenhuma persistência.
- IDs estáticos novos (**nove**), todos dentro de `#panel-system`:

  ```text
  panel-system
  system-clock-date
  system-clock-time
  system-cpu
  system-memory
  system-gpu
  system-network
  system-tokens
  system-status
  ```

  O manifesto estático do HTML passa de 77 para **86 IDs** (47 do `HEAD` + 30
  da v3.0 + 9 desta SPEC). Nenhum ID é removido ou renomeado; os prefixos
  dinâmicos autorizados continuam sendo apenas `memory-detail-` e
  `session-event-`.
- Conteúdo do painel é **todo primário**, sem container de disclosure novo: são
  oito linhas curtas de texto, que cabem no drawer sem sobrepor nem cortar.
  As proibições da SPEC-0053 valem integralmente: sem `position:
  absolute|fixed`, sem truncamento sem ação de revelar, texto longo quebra
  linha, paleta roxo-realeza, **sem emoji** em nenhum rótulo ou valor.
- Ordem visual dentro do painel: relógio (data e hora) → tokens → CPU →
  Memória → GPU → Rede → `#system-status`.

## 9. Ciclo de atualização no renderer

- **Um único `setInterval` de 1000 ms**, criado quando o painel `Sistema`
  passa a estar visível e cancelado quando ele deixa de estar (troca de painel,
  fechamento do drawer, `Escape`, backdrop, `Fechar`) e no teardown da página.
  Fora disso, **nenhum timer desta fatia existe**.
- Ao abrir o painel: uma leitura IPC imediata e uma atualização imediata do
  relógio, antes do primeiro tick.
- Cada tick atualiza o relógio (`Date` local, sem IPC).
- A cada **dois** ticks (⇒ **2000 ms**) o renderer chama
  `window.atlas.metrics.read()` e `window.atlas.tokens.read()`.
- **Sem reentrância**: enquanto uma leitura estiver em voo, o tick seguinte que
  dispararia leitura é pulado (o relógio continua atualizando).
- Uma resposta que chega depois de o painel ter sido fechado é **descartada**
  (não escreve no DOM).
- Rejeição de qualquer um dos dois `invoke` mantém o painel vivo: as quatro
  células de host mostram `Indisponível: falha de leitura`, a linha de tokens
  mostra o mesmo texto, e `#system-status` mostra
  `Falha ao ler as métricas do sistema.`. **Nunca** alimenta `#global-alert`
  nem `#presence-core[data-state="error"]` — erro de painel fica no painel
  (Escopo 10 da SPEC-0053).
- A leitura de métricas **não** entra na serialização de gestos: não marca
  operação em voo, não é bloqueada por turno de chat/`ask` em voo, não
  desabilita nenhum controle e não é bloqueada por `micBusy()`.

## 10. Formatação exata exibida (pinada, sem `Intl`)

Toda formatação vive no renderer, é determinística e independente de locale do
SO (nenhuma chamada a `Intl`/`toLocaleString`).

- Separador decimal `,`; separador de milhar `.`; uma casa decimal em
  porcentagens e em unidades ≥ `kB`.
- `formatBytes` / `formatBytesPerSecond`: base **1000**, unidades `B`, `kB`,
  `MB`, `GB`, `TB`; zero casas decimais em `B`, uma casa nas demais.
- Textos de indisponibilidade, por `reason`:
  - `unsupported` → `Indisponível nesta plataforma`
  - `read-failed` → `Indisponível: falha de leitura`
  - `timeout` → `Indisponível: leitura expirou`
- Linhas:
  - `#system-clock-date`: `<dia da semana>, DD/MM/AAAA` — dias em
    `['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
    'quinta-feira', 'sexta-feira', 'sábado']`, componentes com zero à
    esquerda.
  - `#system-clock-time`: `HH:MM:SS`, 24 h, zero à esquerda.
  - `#system-cpu`: `CPU: 42,7 %` ou `CPU: <indisponibilidade>`
  - `#system-memory`: `Memória: 9,4 GB de 16,0 GB (58,7 %)` ou
    `Memória: <indisponibilidade>`
  - `#system-gpu`: `GPU: 12,0 %` ou `GPU: <indisponibilidade>`
  - `#system-network`: `Rede: recebendo 1,2 MB/s · enviando 340,0 kB/s` ou
    `Rede: <indisponibilidade>`
  - `#system-tokens`, quatro desfechos exaustivos sobre `TokenUsageSnapshot`:
    - `reportedTurns === 0 && unreportedTurns === 0` →
      `Tokens desta sessão: 0`
    - `reportedTurns === 0 && unreportedTurns > 0` →
      `Tokens desta sessão: indisponível (o provedor não reporta consumo)`
    - `reportedTurns > 0 && unreportedTurns === 0` →
      `Tokens desta sessão: 1.234 (entrada 800 · saída 434)`
    - `reportedTurns > 0 && unreportedTurns > 0` → o anterior seguido de
      ` · 2 turno(s) sem relato`
  - `#system-status`: `Atualizado às HH:MM:SS` após leitura bem-sucedida;
    `Falha ao ler as métricas do sistema.` após rejeição; `Lendo…` antes da
    primeira leitura assentar.

## 11. Gate de paridade e testes

- **Zero réplica nova** de módulo TS no renderer: a formatação da seção 10 é
  lógica exclusiva do renderer, sem gêmeo em TypeScript. Ela cai no limite (i)
  já documentado do gate (lógica sem contraparte TS) e é coberta por testes
  comportamentais sobre o harness jsdom.
- `apps/desktop/tests/renderer.speech-parity.test.ts` passa a vigiar **seis**
  módulos-fonte — soma `system-metrics.ts` e `token-usage.ts` à lista atual
  (`speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`, `hands-free.ts`), com
  todos os exports de valor dos dois novos classificados em `NOT_MIRRORED`,
  com `moduleSource` e justificativa. Funciona como tripwire: uma réplica
  futura desses módulos no renderer passa a falhar o gate em vez de derivar em
  silêncio.
- `apps/desktop/tests/renderer.layout.test.ts` é atualizado para o manifesto de
  **86** IDs estáticos e para **sete** controles `data-drawer-nav` na ordem
  fixada, mantendo todas as demais asserções da SPEC-0053 intactas.
- Arquivos de teste novos: `apps/desktop/tests/system-metrics.test.ts`,
  `apps/desktop/tests/token-usage.test.ts`,
  `apps/desktop/tests/core-bridge.token-usage.test.ts`,
  `apps/desktop/tests/renderer.system-panel.test.ts`.
- Testes novos/estendidos em `packages/model-gateway/tests` e
  `packages/cognitive/tests`.

---

# Fora do Escopo

- **Histórico, gráfico, sparkline, média móvel ou persistência** de qualquer
  métrica ou do consumo de tokens (ADR-0024, decisão de produto 2; ADR-0025(c)).
- **Custo monetário estimado** dos tokens (ADR-0025, decisão de produto 2).
- **Quebra por turno, por chamada `generate`, por provider ou por modelo** do
  consumo de tokens; a exibição é o total acumulado da sessão (ADR-0025,
  decisão de produto 1).
- **Força de sinal / SSID / RSSI de Wi-Fi**; rede é taxa de tráfego
  (ADR-0024, decisão de produto 1).
- Modelo/nome/temperatura/VRAM da GPU, temperatura de CPU, bateria, disco,
  processos, uptime ou qualquer métrica além das quatro nomeadas.
- Exibir provider, modelo, endpoint ou qualquer detalhe de arquitetura interna
  ao lado dos tokens (Restrição do PRD).
- **Push do main para o renderer** (`webContents.send`) — a leitura é polling
  sob demanda (ADR-0024(c)); o canal de push segue candidato não construído.
- Processo residente, cache com TTL ou coletor contínuo de métricas no main.
- Alterar `AskSnapshot`/`TurnSnapshot`, mensagens pinadas, guardas de
  serialização, registro de operações em voo, portas fail-closed, `ConfirmPort`
  ou qualquer semântica de cancelamento.
- Alterar `apps/cli` (nenhum comando novo, nenhuma exibição de tokens no
  terminal), `@atlas/core`, `@atlas/runtime`, `@atlas/tools`,
  `@atlas/memory`, `@atlas/context`, `@atlas/permissions`, `@atlas/persona`,
  `@atlas/skills`.
- Acumular tokens no Context Service ou persistir no Memory Service
  (alternativas já rejeitadas pelo ADR-0025); criar `packages/telemetry` ou
  Activity Service.
- Reintroduzir sidebar, trilho, timeline permanente, relógio em barra fixa ou
  qualquer mobília permanente vetada pela SPEC-0053; alterar o núcleo
  holográfico, seus sete estados, o loop de `requestAnimationFrame`, a paleta
  ou a CSP.
- Emoji em qualquer rótulo, valor ou controle novo.
- Novo módulo no Module Catalog, nova Tool, nova Skill, nova Persona, novo
  campo em `Persona`, ADR novo ou emenda à Constituição.
- Dependência nova além de `systeminformation`; qualquer download em runtime;
  qualquer chamada de rede nova.
- Corrigir débitos adjacentes já nomeados (quebrar `renderer.js`/`core-bridge.ts`,
  push de assentamento, `__resetBridgeStateForTests` fechar sessões, `micBusy()`
  fora de `#ask-submit`).

---

# Pré-requisitos

Todos conferidos como `Done` nos respectivos arquivos:

- [SPEC-0031](SPEC-0031-desktop-foundation.md),
  [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md),
  [SPEC-0033](SPEC-0033-desktop-visual-chat.md) — fundação, `ask`, chat vivo.
- [SPEC-0045](SPEC-0045-renderer-automated-coverage.md),
  [SPEC-0047](SPEC-0047-renderer-parity-gate-and-panel-coverage.md) — harness
  jsdom e gate de paridade.
- [SPEC-0046](SPEC-0046-desktop-voice-input-stt.md),
  [SPEC-0052](SPEC-0052-desktop-hands-free-voice-conversation.md) — molde de
  módulo do main process + canal IPC + fiação em `main.ts`.
- [SPEC-0050](SPEC-0050-core-bridge-structural-gesture-serialization.md),
  [SPEC-0051](SPEC-0051-desktop-cancel-in-flight-operation.md) — registro único
  de operações em voo e descarte de resultado abandonado.
- [SPEC-0053](SPEC-0053-desktop-visual-layout.md) — layout v3.0, drawer,
  manifesto de IDs, paleta e progressive disclosure.

---

# Critérios de Aceitação

## Contratos e Model Gateway

1. `packages/contracts/src/model.ts` exporta `TokenUsage` com exatamente os
   três campos opcionais, e `GenerateResult.usage?: TokenUsage`;
   `AskResult.usage?` e `ConversationTurn.usage?` existem com o mesmo tipo.
   Nenhum campo obrigatório novo é introduzido em nenhum contrato, e
   `pnpm typecheck` na raiz passa sem alteração em nenhum fake existente.
2. `remote` mapeia os três campos da resposta OpenAI-compatível; campo ausente,
   `null`, string, `NaN`, `Infinity` ou negativo é omitido individualmente;
   resposta sem `usage` algum produz resultado **sem** a propriedade `usage`.
   `totalTokens` nunca é derivado nesse provider.
3. `ollama` mapeia `prompt_eval_count`/`eval_count` e deriva `totalTokens` como
   soma; com apenas um dos dois presente, o total é igual a ele; com nenhum,
   não há `usage`.
4. `fake` produz `usage` determinístico pela regra de `countWords` (testes
   cobrem string vazia, só espaços, múltiplos espaços/quebras e várias
   mensagens); duas chamadas idênticas produzem o mesmo `usage`.
5. Nenhum provider faz chamada de rede adicional; os testes existentes de
   `packages/model-gateway` continuam verdes sem alteração de expectativa de
   texto.

## Cognitive Core

6. Um turno com plano (planejamento + composição + extração) devolve `usage`
   igual à soma campo a campo das `generate` daquele turno; um turno sem plano
   (1 `generate` + extração) devolve a soma das duas.
7. Um turno com replanejamento soma também a `generate` de replanejamento.
8. Se nenhuma chamada reportar `usage`, `AskResult`/`ConversationTurn` saem
   **sem** a propriedade (não `usage: {}` nem zeros).
9. Se apenas parte das chamadas reportar, só os campos reportados aparecem, com
   os demais ausentes — nenhuma derivação de `totalTokens` nesta camada.
10. Falha do gateway na chamada de extração continua não quebrando o turno e
    contribui com zero para a soma; `steps`, `learned`, prompts, ordem das
    mensagens e a `Conversation` retornada permanecem idênticos aos atuais
    (suítes existentes de `@atlas/cognitive` verdes sem mudança de expectativa).

## `system-metrics.ts`

11. `read()` nunca lança e sempre devolve as quatro chaves. Testes cobrem, por
    métrica: valor válido, campo ausente, valor não finito, valor negativo,
    promessa rejeitada e timeout — mapeando exatamente para
    `unsupported`/`read-failed`/`timeout`.
12. Uma métrica indisponível **não** contamina as outras três: um caso com GPU
    e rede indisponíveis e CPU/RAM válidas devolve os dois valores válidos.
13. Normalização é exata: porcentagens limitadas a `[0, 100]` com uma casa
    decimal; `usedBytes = total - available` limitado a `[0, total]`;
    `total <= 0` ⇒ `unsupported`; GPU escolhe o **primeiro** controller com
    `utilizationGpu` finito; rede escolhe a **primeira** entrada com `rx_sec` e
    `tx_sec` finitos e ≥ 0.
14. As quatro leituras são disparadas em paralelo (a porta dublada registra as
    quatro chamadas antes de qualquer uma resolver) e o módulo não cria timer
    residente nem guarda estado entre chamadas.
15. Teste estático prova que `system-metrics.ts` não importa `electron` nem
    `systeminformation`, e que `systeminformation` aparece **apenas** em
    `apps/desktop/src/main.ts` e em `apps/desktop/package.json` dentro do
    repositório.

## `token-usage.ts` e `core-bridge.ts`

16. `add(undefined)`, `add({})` e `add` com os três campos inválidos incrementam
    `unreportedTurns` e não alteram os totais; `snapshot()` inicial é
    `{0,0,0,0,0}`; `reset()` volta a esse estado.
17. `totalTokens` é derivado como `prompt + completion` **apenas** quando
    `usage.totalTokens` está ausente/inválido; quando presente, é usado como
    veio (testes cobrem provedor que reporta total diferente da soma).
18. `resolveAskSnapshot` e `sendChatTurn` somam o `usage` do resultado; um
    segundo turno acumula sobre o primeiro; `readTokenUsage()` reflete o
    acumulado sem subir Core.
19. Operação **cancelada/abandonada** (SPEC-0051) que assenta com resultado
    contabiliza o consumo, e ainda assim não chama `remember` nem
    `updateConversation`; operação que **lança** não contabiliza nada.
20. `openChatSession` bem-sucedida zera o acumulado; uma abertura que falha não
    zera; `__resetBridgeStateForTests()` zera.
21. `AskSnapshot`/`TurnSnapshot` continuam com exatamente os campos atuais; as
    suítes existentes de `core-bridge.*` permanecem verdes sem alteração de
    expectativa.

## IPC, painel e renderer

22. `preload.cjs` expõe `window.atlas.metrics.read` e `window.atlas.tokens.read`
    ligados a `'atlas:metrics:read'` e `'atlas:tokens:read'`; `main.ts` registra
    exatamente esses dois canais novos e nenhum canal existente muda.
23. O HTML estático contém exatamente os **86** IDs do manifesto (77 anteriores
    + os 9 novos), `#drawer-navigation > [data-drawer-nav]` produz **sete**
    controles na ordem fixada, e `#panel-system` obedece à invariante
    zero-ou-um painel, ao foco contido e ao ARIA do drawer.
24. Abrir o painel `Sistema` faz **uma** leitura imediata de cada canal e cria
    **um** `setInterval` de 1000 ms; fechar o painel, trocar de painel, fechar o
    drawer por botão/`Escape`/backdrop e o teardown da página cancelam o timer.
    Nenhum timer desta fatia existe com o painel fechado.
25. Com o painel aberto, avançar o relógio injetável do harness em 1000 ms
    atualiza só o relógio; em 2000 ms dispara exatamente uma leitura de cada
    canal. Com uma leitura ainda em voo, o tick de leitura seguinte é pulado
    (nenhuma chamada concorrente ao mesmo canal).
26. Resposta que chega após o fechamento do painel não escreve no DOM.
27. Rejeição de `metrics.read`/`tokens.read` mostra os textos pinados de falha
    nas células e em `#system-status`, mantém o painel utilizável, e **não**
    escreve em `#global-alert` nem muda `#presence-core[data-state]`.
28. As seis linhas de valor seguem a formatação pinada da seção 10, provada por
    tabela de casos: 0 %, 100 %, arredondamento de meia casa, bytes em `B`/`kB`/
    `MB`/`GB`, milhar com `.`, decimal com `,`, os três textos de
    indisponibilidade e os quatro desfechos de `#system-tokens`.
29. O relógio cobre zero à esquerda em hora/minuto/segundo e dia/mês, os sete
    nomes de dia da semana e a virada de segundo/dia sob relógio injetável.
30. Nenhum rótulo, valor ou controle novo contém emoji; os tokens de cor usados
    pelo painel pertencem à paleta roxo-realeza existente; nenhum CSS inline,
    recurso remoto, `<style>` ou mudança de CSP é introduzido.
31. Abrir o painel não desabilita nenhum controle, não marca operação em voo e
    funciona com turno de chat/`ask` em voo; e um turno de chat/`ask` não é
    bloqueado pelo painel aberto.

## Gate, verificação e smoke

32. `renderer.speech-parity.test.ts` vigia seis módulos-fonte, com todos os
    exports de valor de `system-metrics.ts`/`token-usage.ts` classificados em
    `NOT_MIRRORED` com justificativa; o gate falha se um export novo desses
    módulos ficar sem classificação (provado por caso negativo).
33. `pnpm --filter @atlas/desktop test`, `pnpm --filter @atlas/model-gateway test`
    e `pnpm --filter @atlas/cognitive test` passam; na raiz, `pnpm typecheck`,
    `pnpm lint`, `pnpm test` e `pnpm format:check` passam sem teste pulado.
34. Smoke visual humano em janela real, com os itens abaixo, todos `OK`:
    abrir o drawer e o painel `Sistema`; ver CPU e Memória com valores
    plausíveis que **variam** entre atualizações; ver GPU e Rede com valor real
    **ou** texto de indisponibilidade explícito (ambos aceitáveis); ver a data,
    o dia da semana correto e o horário avançando a cada segundo; fazer um turno
    de chat e ver o total de tokens crescer (ou o texto de indisponibilidade, se
    o provedor não reportar); fechar e reabrir o painel sem erro; conferir que
    nenhuma linha é cortada ou sobreposta em **800 × 600 CSS px**; conferir
    ausência de emoji. `Não executado`/`Não verificado`/qualquer `FALHOU`
    bloqueia `Review → Done`.

---

# Arquivos Esperados

```text
packages/contracts/src/model.ts
packages/contracts/src/cognitive.ts
packages/model-gateway/src/providers/fake.ts
packages/model-gateway/src/providers/ollama.ts
packages/model-gateway/src/providers/remote.ts
packages/model-gateway/tests/*.test.ts
packages/cognitive/src/cognitive-core.ts
packages/cognitive/tests/*.test.ts

apps/desktop/package.json
apps/desktop/src/system-metrics.ts            (novo)
apps/desktop/src/token-usage.ts               (novo)
apps/desktop/src/core-bridge.ts
apps/desktop/src/main.ts
apps/desktop/src/preload.cjs
apps/desktop/src/renderer/index.html
apps/desktop/src/renderer/styles.css
apps/desktop/src/renderer/renderer.js

apps/desktop/tests/system-metrics.test.ts     (novo)
apps/desktop/tests/token-usage.test.ts        (novo)
apps/desktop/tests/core-bridge.token-usage.test.ts (novo)
apps/desktop/tests/renderer.system-panel.test.ts   (novo)
apps/desktop/tests/renderer.layout.test.ts
apps/desktop/tests/renderer.speech-parity.test.ts
apps/desktop/tests/helpers/renderer-harness.ts

docs/implementation/specs/SPEC-0054-desktop-environment-observability.md
```

Ajustes menores em `pnpm-lock.yaml` decorrentes da dependência nova são
esperados. Nenhum outro arquivo de produção é autorizado.

---

# Componentes Impactados

- **Contracts** (`@atlas/contracts`): `TokenUsage`, `GenerateResult.usage?`,
  `AskResult.usage?`, `ConversationTurn.usage?` — aditivos e opcionais.
- **Model Gateway** (`@atlas/model-gateway`): três providers passam a reportar
  o consumo que a resposta já traz. Continua sem estado e sem lógica de negócio.
- **Cognitive Core** (`@atlas/cognitive`): soma o consumo das `generate` do
  turno e o devolve **como dado**, no mesmo molde de `learned` — não persiste,
  não exibe, não decide nada com ele.
- **Output Gateway** (`apps/desktop`): módulos novos de leitura de métricas e
  de acumulação de tokens no main process, dois canais IPC, painel `Sistema` e
  ciclo de atualização no renderer.

Context Service, Memory Service, Runtime, Tools, Permission Service, Persona
Service e `apps/cli` **não** têm responsabilidade alterada e não são tocados.

---

# Interfaces Necessárias

Em `@atlas/contracts` (públicas, aditivas): `TokenUsage`; `GenerateResult.usage?`;
`AskResult.usage?`; `ConversationTurn.usage?`.

Locais a `apps/desktop` (não sobem a `@atlas/contracts`, regra de tipos locais
do app — promoção só com 2º consumidor real, via ADR, precedente ADR-0007):
`SystemInformationPort`, `MetricUnavailableReason`, `MetricSample<T>`,
`CpuMetric`, `MemoryMetric`, `GpuMetric`, `NetworkMetric`,
`SystemMetricsSnapshot`, `TokenUsageSnapshot`, `TokenUsageAccumulator`, e as
funções `createSystemMetrics`, `createTokenUsageAccumulator`, `readTokenUsage`.

Interno a `@atlas/cognitive`: o helper puro de soma e o campo `usage?` de
`PlanCycleResult`.

Canais IPC novos: `'atlas:metrics:read'`, `'atlas:tokens:read'`.

Nenhuma porta injetável nova em `createAtlas`; nenhum contrato de Tool, Skill
ou Persona novo.

---

# Fluxo Esperado

```text
provider.generate ──► GenerateResult { text, usage? }
        │
        ▼
Cognitive Core (soma das generate do turno)
        │
        ▼
AskResult / ConversationTurn { …, usage? }
        │
        ▼
core-bridge  ──► tokenUsage.add(usage)      [reset em openChatSession]
                        │
                        ▼
              'atlas:tokens:read' ──► TokenUsageSnapshot
                                              │
systeminformation ──► system-metrics.read()   │
        │                                     │
        ▼                                     │
 'atlas:metrics:read' ──► SystemMetricsSnapshot
                                              │
                                              ▼
                            renderer: painel Sistema
                            (tick 1 s: relógio; 2 s: leituras)
```

---

# Estratégia de Implementação

1. `@atlas/contracts`: acrescentar `TokenUsage` e os três campos opcionais;
   rodar `pnpm typecheck` na raiz para confirmar que nenhum fake quebra.
2. Providers do Model Gateway, um por vez, com os testes de mapeamento
   (incluindo os casos inválidos) escritos antes.
3. `@atlas/cognitive`: helper puro de soma + acumulação nas quatro origens de
   `generate`; provar por teste que os prompts e a contagem de chamadas não
   mudaram antes de olhar para `usage`.
4. `apps/desktop/src/token-usage.ts` isolado, com sua tabela de casos.
5. `apps/desktop/src/system-metrics.ts` isolado, com a porta dublada e a tabela
   de desfechos por métrica; incluir o teste estático de import.
6. `core-bridge.ts`: instância única, três pontos de soma/reset e
   `readTokenUsage`; provar que as suítes existentes seguem verdes.
7. `main.ts` + `preload.cjs` + `package.json`: fiação e dependência.
8. HTML: sétimo item de navegação, `#panel-system` e os nove IDs; atualizar
   primeiro o manifesto em `renderer.layout.test.ts` (teste antes do markup).
9. Renderer: ciclo de atualização (timer único, guarda de reentrância,
   descarte pós-fechamento) e formatação pinada, com
   `renderer.system-panel.test.ts` escrito contra a tabela da seção 10.
10. Estender a lista vigiada do gate de paridade para seis módulos.
11. Suítes escopadas, depois os quatro comandos completos na raiz.
12. Entregar a janela real ao smoke humano do CA 34.

---

# Estratégia de Testes

- **Contratos:** cobertos indiretamente por `typecheck` e pelos testes dos
  consumidores; nenhum teste de tipo dedicado.
- **Providers:** tabela por provider com resposta completa, parcial, ausente,
  inválida (`null`/string/`NaN`/negativo) e determinismo do `fake`.
- **Cognitive:** turno sem plano, com plano, com replanejamento, com falha de
  extração; soma campo a campo; ausência total ⇒ campo ausente; regressão de
  prompts/ordem/contagem de chamadas.
- **`system-metrics`:** seis desfechos por métrica, independência entre
  métricas, normalização/arredondamento nas bordas, paralelismo, ausência de
  timer residente, teste estático de imports.
- **`token-usage`:** estado inicial, `add` válido/parcial/inválido/`undefined`,
  derivação do total, acumulação múltipla, `reset`.
- **`core-bridge`:** pontos de soma em `ask`/turno, acumulação entre turnos,
  reset em `openChatSession`, caso abandonado (soma sim, efeitos não), caso que
  lança (nada), `readTokenUsage` sem subir Core, regressão das suítes atuais.
- **Renderer (harness jsdom, relógio injetável):** estrutura/manifesto/ordem da
  navegação, ciclo de timer (criação, cancelamento nos cinco gatilhos, cadência
  1 s × 2 s, guarda de reentrância, descarte pós-fechamento), formatação
  completa da seção 10, caminhos de rejeição, ausência de emoji, não
  interferência com a serialização de gestos.
- **Gate:** seis módulos vigiados; caso negativo de export não classificado.
- **Humano:** CA 34, em janela real, incluindo 800 × 600 CSS px.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os 34 Critérios de Aceitação estiverem atendidos;
- os testes escopados e os quatro comandos completos da raiz estiverem verdes,
  sem teste pulado;
- o smoke visual humano do CA 34 estiver integralmente `OK` e registrado na
  seção Observações;
- nenhum arquivo fora da lista de *Arquivos Esperados* tiver sido alterado;
- Constituição, Module Catalog e ADRs 0019–0025 permanecerem preservados —
  nenhum módulo, Tool, Skill, Persona, porta de `createAtlas` ou dependência
  além de `systeminformation`;
- a revisão estiver concluída;
- as lições aprendidas estiverem registradas em
  `docs/implementation/LESSONS_LEARNED.md`;
- o passo `doc-sync` sincronizar as docs vivas aplicáveis (`CLAUDE.md` raiz,
  `apps/desktop/CLAUDE.md`, `packages/contracts/CLAUDE.md`,
  `packages/model-gateway/CLAUDE.md`, `packages/cognitive/CLAUDE.md`,
  `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`) e criar no `Roadmap.md` o item de
  *Observabilidade do Ambiente* registrado como exceção consciente acima.

---

# Restrições

1. Só os arquivos de *Arquivos Esperados* podem mudar.
2. `systeminformation` é importada **exclusivamente** em
   `apps/desktop/src/main.ts`; `system-metrics.ts` a recebe por porta e não
   importa `electron`.
3. Nenhuma chamada de rede nova em nenhum caminho; a garantia offline dos
   ADR-0021(c)/ADR-0022(c) permanece intacta.
4. Toda mudança de contrato é **aditiva e opcional**; nenhum membro obrigatório
   novo em interface pública.
5. Consumo de tokens é estado **efêmero de UI**: em memória, no
   `apps/desktop`, resetado por sessão, nunca em Context nem em Memory, nunca
   gravado em disco.
6. Métricas de host não são cacheadas, não são persistidas e não têm histórico.
7. O painel nunca exibe provider, modelo, endpoint ou qualquer detalhe interno
   de arquitetura.
8. Erros deste painel ficam no painel: nunca `#global-alert`, nunca
   `data-state="error"`.
9. Um único timer, criado só com o painel visível e cancelado ao fechá-lo;
   nenhuma leitura concorrente no mesmo canal.
10. Todo o layout v3.0 (SPEC-0053) é preservado: manifesto de IDs só cresce
    pelos nove nomeados, paleta roxo-realeza, sem emoji, sem mobília
    permanente, CSP byte-idêntica.
11. Smoke humano é gate bloqueante, não dívida transferível ao fechamento.

---

# Observações

- **Por que não há ADR novo:** as duas decisões estruturais desta fatia
  (dependência/telemetria de host e contabilidade de tokens) já foram tomadas
  pelos ADR-0024 e ADR-0025, ambos `Accepted`, que delegaram explicitamente o
  contrato técnico à SPEC. O único ponto que poderia parecer novo — expor
  `usage` também em `AskResult`/`ConversationTurn` — é a via que o próprio
  ADR-0025(c) antecipou ("quando o Cognitive Core as expuser") e aplica um
  padrão já estabelecido duas vezes (`steps?`, `learned?`), sem criar módulo,
  responsabilidade ou porta.
- **Cobertura desigual esperada:** GPU e rede podem reportar "indisponível" com
  frequência dependendo de plataforma e drivers (ADR-0024(d)); o `fake` nunca
  reflete consumo real (ADR-0025). Nenhum dos dois é defeito desta SPEC.
- **Limite honesto do total de tokens:** o número exibido é o que os provedores
  reportam; um provedor que não reporta produz `indisponível`, e um provedor
  que reporta parcialmente produz o sufixo `· n turno(s) sem relato` em vez de
  um total silenciosamente subestimado.
- **Resíduo consciente:** o consumo zera ao abrir nova sessão e ao reiniciar a
  app (ADR-0025(c)); histórico entre sessões seria decisão de produto nova, com
  ADR próprio.
- **Registro do smoke visual humano (CA 34):** executado pelo usuário em janela
  real (`pnpm --filter @atlas/desktop start`) em 2026-08-19. Todos os itens
  `OK`: (1) drawer e painel `Sistema` abrem; (2) CPU e Memória com valores
  plausíveis que variam entre atualizações; (3) GPU e Rede com valor real ou
  texto de indisponibilidade explícito; (4) data, dia da semana e horário
  avançando a cada segundo; (5) total de tokens cresce num turno de chat; (6)
  fechar e reabrir o painel sem erro; (7) nenhuma linha cortada ou sobreposta
  em 800 × 600 CSS px; (8) ausência de emoji. Gate do CA 34 satisfeito.

---

# Checklist para IA

Antes de implementar:

- ler PRD (*Observabilidade do Ambiente*), ADR-0024, ADR-0025, ADR-0019 e a
  SPEC-0053;
- reler `apps/desktop/CLAUDE.md` (fronteira main/renderer, gate de paridade,
  serialização de gestos) e `packages/cognitive/CLAUDE.md`;
- confirmar que nenhum ponto da implementação exige módulo, Tool, ADR ou
  dependência além dos autorizados aqui — se exigir, **parar e devolver**.

Durante a implementação:

- manter responsabilidade única por módulo; nada de lógica de domínio em
  `main.ts`;
- escrever os testes de tabela antes das funções de normalização/formatação;
- não expandir escopo para métricas, painéis ou débitos adjacentes.

Após a implementação:

- rodar as suítes escopadas e os quatro comandos completos da raiz;
- validar os 34 Critérios de Aceitação um a um;
- executar e registrar o smoke humano;
- registrar as lições aprendidas.

---

# Resultado Esperado

O usuário abre o Atlas, clica em `Menu` e escolhe `Sistema`. Vê, numa lista
compacta em roxo-realeza e sem emoji: a data com o dia da semana e o horário
avançando a cada segundo; quantos tokens a sessão já consumiu (entrada, saída
e total, ou um aviso explícito de que o provedor não reporta); e o uso corrente
de CPU, memória, GPU e rede da própria máquina, atualizado a cada dois
segundos. O que a plataforma não souber informar aparece como texto explícito
de indisponibilidade, nunca como valor inventado e nunca travando o resto do
painel. Ao fechar o painel, toda leitura periódica cessa.

Por baixo, o consumo de tokens passa a existir como dado de primeira classe no
caminho `provider → Cognitive Core → borda`, aditivamente, sem que nenhum
módulo além do `apps/desktop` passe a acumulá-lo ou exibi-lo; e a leitura de
recursos do host vive num módulo local do main process, atrás de uma porta
injetável, sem processo residente, sem persistência e sem uma única chamada de
rede nova.

---

# Decisões de design

Registradas em formato de veto (Emenda v1.1, Artigo 15). Nenhuma delas reabre o
que o PRD, o ADR-0024 ou o ADR-0025 já fixaram.

**D1 — Perfil `completo`.**
*Porquê:* a fatia toca `@atlas/contracts`, dois packages além do app, cria dois
módulos novos e adiciona uma dependência de runtime — falha em pelo menos
quatro das condições de `micro`.
*Alternativa descartada:* `micro`, sob o argumento de que os ADRs já decidiram
tudo — perde porque o critério de `micro` é estrutural (um package, sem
contratos, sem dependência), não "sem decisão nova".

**D2 — O conteúdo vira um sétimo painel do drawer (`Sistema`), não uma barra
permanente.**
*Porquê:* a SPEC-0053 removeu deliberadamente toda mobília permanente e o
ADR-0024(c) condiciona o polling a "enquanto o painel de métricas estiver
visível" — um painel sob demanda é a única forma de honrar as duas coisas.
*Alternativa descartada:* faixa fixa no topo ou rodapé com métricas e relógio —
reintroduz exatamente a geometria reprovada no smoke humano da v2.0 e obrigaria
polling perpétuo.

**D3 — O relógio mora dentro do mesmo painel `Sistema`, não em chrome
permanente.**
*Porquê:* o PRD pede que o usuário **possa visualizar** data/dia/horário, o que
uma superfície sob demanda satisfaz; manter uma única casa evita duplicar a
informação e evita um timer vivo pela app inteira.
*Alternativa descartada:* relógio permanente ao lado de `#menu-toggle` — mais
conveniente, mas viola D2 e obriga um `setInterval` perpétuo por uma informação
que o SO já mostra na barra do sistema.

**D4 — Dois canais IPC (`'atlas:metrics:read'` e `'atlas:tokens:read'`), um por
módulo.**
*Porquê:* Artigo 4 — cada canal expõe exatamente um dono (`system-metrics.ts` e
o acumulador do `core-bridge`), e o ADR-0024 já nomeou o prefixo
`'atlas:metrics:*'` só para host.
*Alternativa descartada:* canal único devolvendo `{ host, tokens }` — economiza
um round-trip local desprezível ao custo de acoplar dois módulos independentes
num payload comum.

**D5 — Um único `setInterval(1000)` enquanto o painel está visível; leituras
IPC a cada dois ticks (2000 ms), sem reentrância.**
*Porquê:* o relógio exige cadência de 1 s e o ADR-0024(c) pede "poucos
segundos" para as métricas; um timer só, com contador, atende as duas sem
multiplicar loops (mesma disciplina de loop único da SPEC-0053) e é
determinístico sob o relógio injetável do harness.
*Alternativa descartada:* dois `setInterval` independentes (1 s e 2 s) — mais
óbvio de ler, mas duplica ciclos de vida a cancelar e já custou bug em fatias
anteriores; e polling de 1 s para `systeminformation` seria mais agressivo do
que o ADR autoriza.

**D6 — `TokenUsage` como interface nomeada em `@atlas/contracts`.**
*Porquê:* o ADR-0025(a) fixa a **forma** do dado; nomeá-la permite reusar o
mesmo tipo em `GenerateResult`, `AskResult` e `ConversationTurn` sem triplicar
um literal anônimo.
*Alternativa descartada:* repetir o tipo inline nos três lugares, como no
snippet do ADR — divergiria à primeira evolução do campo.

**D7 — `usage?` também em `AskResult`/`ConversationTurn`, somado no
`runPlanCycle` do `@atlas/cognitive`.**
*Porquê:* é a única via existente para o consumo chegar ao `core-bridge` — o
app não tem acesso ao `ModelGateway` (não há `deps.gateway` em `createAtlas`, e
compor um serviço da plataforma no app é proibido sem ADR) — e o ADR-0025(c) a
antecipou ("quando o Cognitive Core as expuser"). Aplica o padrão já usado por
`steps?` (SPEC-0014) e `learned?` (SPEC-0020): o Cognitive carrega o dado, a
borda decide o que fazer com ele.
*Alternativa descartada:* porta nova `CreateAtlasDeps.onUsage?` decorando o
gateway dentro de `createAtlas` — inventa um mecanismo de observador sem
precedente no projeto e coloca uma responsabilidade de telemetria no
composition root, contra o Artigo 4.

**D8 — Um acumulador único de módulo no `core-bridge`, não um por `SessionId`.**
*Porquê:* o painel mostra um número só; o `ask` é stateless e não tem sessão à
qual pertencer; e o ADR-0025(c) manda resetar na abertura de sessão nova, o que
um contador único satisfaz literalmente.
*Alternativa descartada:* `Map<SessionId, TokenUsageSnapshot>` — deixaria o
consumo do `ask` sem casa e obrigaria o renderer a passar handle numa leitura
que hoje não precisa de nenhum.

**D9 — Consumo de operação cancelada/abandonada é contabilizado.**
*Porquê:* o gasto de tokens já aconteceu; omiti-lo faria o painel mentir sobre
o recurso consumido, e o descarte da SPEC-0051 é de **efeitos de domínio**
(`remember`/`updateConversation`), não de telemetria.
*Alternativa descartada:* seguir o descarte ao pé da letra e ignorar o `usage`
de trabalho abandonado — mais simples de justificar, mas subnotifica consumo
real justamente no caso em que o usuário mais quer saber o custo.

**D10 — Fail-closed com desfechos fechados: três razões nomeadas por métrica de
host e quatro desfechos exaustivos para tokens.**
*Porquê:* o ADR-0024(d) exige indisponibilidade explícita por métrica; razões
nomeadas (`unsupported`/`read-failed`/`timeout`) e desfechos exaustivos são
mecanicamente testáveis, ao contrário de uma string genérica.
*Alternativa descartada:* um booleano `available` sem razão — indistinguível
entre "esta plataforma não expõe" e "a leitura falhou agora", e o usuário
tomaria a primeira por defeito do app.

**D11 — `systeminformation` entra por porta injetável (`SystemInformationPort`),
importada só em `main.ts`.**
*Porquê:* molde já estabelecido por `piper-tts.ts`/`stt-engine.ts`/`vad-resources.ts`
(`spawn`/`fs` injetados) — mantém `system-metrics.ts` testável sem a
biblioteca real e sem hardware, e concentra a superfície de terceiros num
arquivo.
*Alternativa descartada:* importar a biblioteca direto no módulo — testes
passariam a depender do host real e a suíte deixaria de ser determinística em
CI.

**D12 — Zero réplica nova no renderer; a formatação vive só no renderer, e o
gate de paridade passa a vigiar seis módulos apenas como tripwire.**
*Porquê:* criar um gêmeo TS de funções que só o renderer usa inventaria uma
fonte de verdade artificial; registrar os dois módulos novos na lista vigiada
custa poucas entradas `NOT_MIRRORED` e faz uma réplica futura falhar o gate em
vez de derivar em silêncio (a deriva já aconteceu duas vezes no projeto).
*Alternativa descartada:* mover `formatBytes`/`formatPercent` para
`system-metrics.ts` e replicá-los — daria cobertura de paridade "de graça", mas
ao custo de um export que o main process nunca chama.

**D13 — Orçamento de 2500 ms por leitura de métrica, com `timeout` como razão
própria.**
*Porquê:* menor que a cadência de 2000 ms mais uma folga, garante que uma
leitura travada nunca acumule chamadas nem congele o painel; a razão própria
distingue lentidão de ausência de suporte.
*Alternativa descartada:* sem timeout, confiando na biblioteca — uma leitura
pendurada deixaria a guarda de reentrância bloqueando toda atualização
indefinidamente.

**D14 — Rede exibe a primeira interface reportada; GPU exibe o primeiro
controller com utilização; nenhuma soma nem escolha heurística.**
*Porquê:* `networkStats()` sem argumento já devolve a interface default e
`graphics().controllers` já vem ordenado pelo SO; escolher determinística e
declaradamente é testável e explicável.
*Alternativa descartada:* somar todas as interfaces/GPUs — número maior e menos
compreensível, e agregaria interfaces virtuais (`lo`, VPN, contêiner) que
inflam a taxa sem significar tráfego real.

**D15 — Prioridade `Medium`.**
*Porquê:* é requisito funcional novo do PRD e pedido direto do usuário, mas não
desbloqueia nenhuma outra fatia nem corrige defeito, risco de segurança ou
regressão — mesmo patamar das fatias de gerência visual (SPEC-0034/0037/0038) e
da própria SPEC-0053.
*Alternativa descartada:* `High` — reservada no projeto a fatias que destravam
gates de Roadmap ou fecham risco; esta não faz nem uma coisa nem outra.

**D16 — O painel não entra na serialização de gestos.**
*Porquê:* nenhuma das duas leituras sobe Core, executa Tool ou é julgada pelo
portão de raízes — exatamente o critério pelo qual `resolveStatusSnapshot`/
`resolveMemorySnapshot`/`forgetFact` já ficam deliberadamente fora do registro
de operações em voo; rastreá-las produziria recusa espúria.
*Alternativa descartada:* bloquear a atualização enquanto houver turno em voo —
apagaria o painel justamente durante o intervalo em que o usuário mais quer ver
CPU e tokens subindo.

**D17 — `AskSnapshot`/`TurnSnapshot` não ganham `usage`.**
*Porquê:* o renderer lê o acumulado pelo canal próprio; carregar o consumo de
volta em cada snapshot criaria uma segunda fonte de verdade para o mesmo número
e tentaria a UI a exibir consumo por turno, granularidade recusada pelo
ADR-0025.
*Alternativa descartada:* propagar `usage` nos snapshots e acumular no renderer
— tornaria o total dependente de o renderer nunca perder uma resposta
(inclusive as descartadas por cancelamento), o oposto de fail-closed.

**D18 — Item de Roadmap registrado como exceção consciente, com a atualização
do arquivo delegada ao `doc-sync`.**
*Porquê:* o requisito entrou no PRD depois da última revisão do Roadmap; o
template autoriza explicitamente a exceção registrada, e editar o Roadmap agora
seria alterar documentação viva fora do papel do redator da SPEC.
*Alternativa descartada:* forçar a fatia dentro de 2.4 (*Persistência e
Gerência Local*, já fechado por inteiro) — reabriria um item concluído para
abrigar algo que não é gerência de estado local.
