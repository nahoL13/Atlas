# SPEC-0049 — `#ask-form` na serialização de gestos (ask × ask e chat → ask) e erro de `ask` visível na tela

> **Project Atlas — Implementation Specification**

Version: 1.0

---

# Informações Gerais

**ID**

SPEC-0049

---

**Título**

Fechamento das duas direções residuais de serialização de gestos registradas pela SPEC-0048 (DoD-d): o painel `ask` do desktop passa a recusar um 2º `ask` concorrente e um `ask` disparado durante um turno de chat em voo, e a falha de `atlas.ask` deixa de virar unhandled rejection para aparecer no `#ask-result`

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

`Fase 2 — 2.2 Experiência Conversacional`.

As três frentes são correção de defeito no painel de `ask` e no chat visual entregues por esse item (SPEC-0032/0033), no invariante "um gesto por vez" que `apps/desktop/CLAUDE.md` declara ("Serialização de gestos") e que a SPEC-0048 fechou só na direção `ask` → chat. Nenhum item de Roadmap novo é necessário; nenhuma capacidade nova é entregue.

---

# Objetivo

Quando esta SPEC estiver concluída deverá existir:

1. **`#ask-form` recusando um 2º `ask` concorrente** (direção **ask × ask**, DoD-d.2 da SPEC-0048): dois cliques seguidos em "Perguntar" não sobem mais dois Cores capazes de executar Tools. A recusa é garantida por guarda no manipulador de `submit`, não só por botão cinza.
2. **`#ask-form` recusando um `ask` durante um turno de chat em voo** (direção **chat → ask**, DoD-d.1 da SPEC-0048), pela mesma condição já em vigor nos painéis de Persona, de permissões e — desde a SPEC-0048 — em `#chat-send`: `chatTurnInFlight || askInFlight`.
3. **O botão de submissão do painel `ask` refletindo esse estado** — hoje ele nem sequer tem `id` e não entra em nenhuma função de refresh. Ganha `id="ask-submit"` e passa a ser recalculado pela mesma origem única que já governa os demais controles (`refreshPermissionsPanelState()`).
4. **A falha de `atlas.ask` visível ao usuário**: o manipulador de `submit` de `#ask-form` ganha `.catch`, escrevendo o aviso de erro no `#ask-result`, como já faz o manipulador de chat no transcript. Hoje uma rejeição vira unhandled rejection e o painel fica congelado em "Perguntando…".
5. **A suíte refletindo os três comportamentos**, no harness jsdom existente, e o helper de supressão de rejeição não tratada de `renderer.gesture-serialization.test.ts` removido — ele existe exatamente porque falta o `.catch` que esta SPEC acrescenta.

Sem contrato novo, sem ADR novo, sem canal IPC novo, sem dependência nova, sem tocar `packages/*`, `apps/cli`, `core-bridge.ts` ou o main process.

---

# Motivação

Três resíduos nomeados explicitamente pela SPEC-0048 (`Done`) na sua Definition of Done, item (d), e replicados em `docs/05-context/NEXT_CONTEXT.md` ("Candidatos abertos" → "Sobre a SPEC-0048") e em `apps/desktop/CLAUDE.md` ("Candidatos futuros já nomeados"). O usuário escolheu os três como o próximo trabalho.

**(a) ask × ask (DoD-d.2, achado A3 do gate arquitetural da SPEC-0048).** O manipulador de `submit` de `#ask-form` (`renderer.js:136-167`) não tem guarda alguma: só valida objetivo vazio. `#objective` e o botão de submissão não entram em `refreshPermissionsPanelState()`, `refreshChatControlsForMic()` nem em qualquer outra função de refresh. Consequência observável: dois cliques seguidos em "Perguntar" disparam dois `window.atlas.ask`, e o `core-bridge` **não** recusa o segundo — `inFlightOperations` governa `selectPermissionRoots`, não `resolveAskSnapshot` contra si mesmo. São dois Cores concorrentes, cada um capaz de executar Tools, a partir de dois gestos do mesmo usuário: exatamente a classe de defeito que motivou a SPEC-0048, no painel que ficou de fora dela. Pior: `askInFlight` é uma variável booleana, então o `.finally` do **primeiro** `ask` a assentar já zera o estado dos dois — o painel volta a parecer ocioso com um round-trip ainda em voo.

**(b) chat → ask (DoD-d.1).** A SPEC-0048 fechou `ask` → chat e deixou registrado, nas Observações, que a direção inversa exige julgar se o painel `ask` deve mesmo se bloquear por um turno de chat — "questão de UX própria". Esta SPEC decide (D2): deve, porque o invariante protegido é "um round-trip contra o Core por vez", e um turno de chat mantém um Core vivo executando Tools enquanto um `ask` sobe outro. Sem isso, a serialização fica assimétrica sem razão que a sustente, e a assimetria é o tipo de estado que volta a derivar.

**(c) `.catch` faltando (achado colateral do mesmo gate).** `renderer.js:146-167` encadeia `.then(...).finally(...)` sem `.catch`. Uma falha de `atlas.ask` (Core que não sobe, modelo indisponível, raiz de permissão inválida) nunca chega ao `#ask-result`: o usuário vê "Perguntando…" e depois nada. É o oposto do que o PRD pede em *Transparência* ("o sistema deve informar ações relevantes durante sua execução") e o que dois arquivos de teste hoje contornam com um supressor de `unhandledRejection` — dívida documentada em comentário nos próprios testes.

Rastreabilidade documental:

- **PRD**, *Requisitos Funcionais → Execução* ("executar tarefas autorizadas pelo usuário" — dois round-trips concorrentes não são um gesto que o usuário autorizou como concorrente) e *→ Transparência* ("informar ações relevantes durante sua execução"); *Critérios de Qualidade* — "consistência de comportamento", "simplicidade para o usuário", "transparência".
- **Constituição**, Artigo 1 (documentação/comentário como verdade — o comentário do teste sobre a ausência de `.catch` deixa de valer junto com a correção) e o teste padrão: mais simples (uma condição só, reusada), mais transparente (o erro aparece), mais sustentável (assimetria eliminada).
- **Module Catalog** — nenhum módulo muda de responsabilidade; `apps/desktop` é aplicação (Input/Output Gateway), não módulo do catálogo, e segue consumindo o Core só por contratos públicos.
- **SPEC-0048**, DoD itens d.1 e d.2 e Observações ("Candidato aberto por esta SPEC") — as três frentes são literalmente o que aquela SPEC registrou como não entregue.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Requisitos Funcionais (Execução, Transparência), Critérios de Qualidade
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 1, 4, 7; Emendas v1.1 e v1.2
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Input Gateway / Output Gateway (aplicação cliente); nenhum módulo tocado
- [Development Guide](../../04-engineering/DevelopmentGuide.md)
- [ClaudeCodeAutomation](../../04-engineering/ClaudeCodeAutomation.md) — "Ramo micro" e "Verificação escopada" (SPEC-0042)
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.2
- [ADR-0019 — stack Electron para `apps/desktop`](../../06-adr/ADR-0019-desktop-electron-stack.md) — renderer sem bundler, `<script>` clássico; **intacto**
- [ADR-0021 — Piper como motor de voz local](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — **intacto**
- [ADR-0022 — whisper.cpp como motor de STT local](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) — **intacto**; a serialização com o microfone não regride
- [SPEC-0048](./SPEC-0048-desktop-chat-send-ask-serialization.md) (`Done`) — origem das três frentes (DoD d.1/d.2 e achado colateral); D1/D2/D3 são o padrão seguido aqui
- [SPEC-0047](./SPEC-0047-renderer-parity-gate-and-panel-coverage.md) (`Done`) — gate mecânico de paridade renderer↔módulo, a preservar; `renderer.memory-ask.test.ts` e `renderer.gesture-serialization.test.ts` vêm dela
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) (`Done`) — harness jsdom sobre o qual a verificação roda
- [SPEC-0038](./SPEC-0038-desktop-permission-roots-gui.md) / [SPEC-0037](./SPEC-0037-desktop-runtime-persona-switch.md) — origem de `askInFlight`/`chatTurnInFlight`
- [SPEC-0032](./SPEC-0032-desktop-confirm-steps-adapters.md) (`Done`) — origem do painel `ask` de tiro único
- `apps/desktop/CLAUDE.md` — seções "Serialização de gestos" e "Rastreio de operação em voo"

---

# Escopo

## Frente 1 — `id` no botão de submissão do painel `ask`

Em `apps/desktop/src/renderer/index.html`, uma edição pontual: o `<button type="submit">Perguntar</button>` de `#ask-form` (hoje `index.html:46`) ganha `id="ask-submit"`. Nenhuma outra linha do HTML muda; nenhum atributo, texto, estrutura, CSP ou ordem de elementos é alterado.

## Frente 2 — `#ask-form` entra na serialização de gestos

Em `apps/desktop/src/renderer/renderer.js`, três edições pontuais:

1. **Função de refresh nova**, `refreshAskControls()`, declarada como `function` (hoisting — não precisa do padrão de placeholder usado por `refreshPersonaPanelState`), com a mesma forma de `refreshChatControlsForMic()`: calcula `const disabled = chatTurnInFlight || askInFlight;` e aplica ao elemento `#ask-submit`, com guarda de nulidade no `getElementById` (mesmo estilo já usado para `#chat-send`). **Não** toca `#objective` (D3).
2. **Chamada a partir da origem única**: `refreshPermissionsPanelState()` (hoje `renderer.js:32-56`) passa a invocar `refreshAskControls()`, junto de `refreshPersonaPanelState()`/`refreshMicButtons()`/`refreshChatControlsForMic()`. Nenhuma outra função ganha chamada; nenhum `.finally` atribui `disabled` diretamente ao botão (D1 da SPEC-0048 aplicada desde o início).
3. **Guarda no manipulador de `submit` de `#ask-form`** (hoje `renderer.js:136-167`): logo após `event.preventDefault()`, `if (chatTurnInFlight || askInFlight) { return; }` — antes de qualquer leitura de `#objective`, de qualquer escrita em `#ask-result` e de qualquer chamada a `window.atlas.ask`. A recusa é silenciosa (D4): não escreve aviso, não limpa o campo, não altera o `#ask-result` do round-trip em curso.

## Frente 3 — erro de `ask` visível no `#ask-result`

No mesmo manipulador, acrescentar `.catch((error) => { … })` **entre** o `.then` existente e o `.finally` existente, escrevendo no `#ask-result` o aviso no mesmo formato já usado pelo renderer para erro (`⚠️ ${error.message ?? error}` — padrão dos manipuladores de chat e de Persona). O `.then` e o `.finally` saem inalterados em comportamento.

## Frente 4 — cobertura e higiene da suíte

1. Em `apps/desktop/tests/renderer.gesture-serialization.test.ts` (existente, estendido):
   - **remover** o helper `withSuppressedUnhandledRejection` e seu bloco de comentário (linhas 55-68), e a sua única chamada (caso "ask rejeitando reabilita `#chat-send`", que passa a rodar sem supressão): a rejeição deixa de escapar porque o `.catch` da Frente 3 a trata. Se ainda escapar, é achado — pare e reporte;
   - **atualizar o cabeçalho** do arquivo para registrar que a SPEC-0049 fechou as duas direções residuais e que `#objective` fica **deliberadamente** fora (D3), no mesmo formato do registro da SPEC-0048;
   - `STATIC_SERIALIZED_IDS` ganha `ask-submit`; `collectAskSerializedControls` continua excluindo **somente** `chat-input`;
   - **caso novo (ask × ask)**: com um `ask` em voo (promessa controlada pelo teste), submeter `#ask-form` de novo com objetivo não vazio **não** produz uma 2ª chamada de `atlas.ask`; ao assentar o 1º, o mesmo submit passa a chamar (total 2);
   - **caso novo (chat → ask)**: com um turno de chat em voo, `#ask-submit` tem `disabled === true` e submeter `#ask-form` **não** chama `atlas.ask`; ao assentar o turno, `disabled === false` e o submit chama;
   - **caso novo (D3, não-regressão de UX)**: `#objective` tem `disabled === false` durante um turno de chat **e** durante um `ask` em voo, com comentário registrando que é decisão, não gap.
2. Em `apps/desktop/tests/renderer.memory-ask.test.ts` (existente, estendido), no `describe('round-trip ask')`: **caso novo** — `atlas.ask` rejeitando escreve `⚠️` mais a mensagem do erro no `#ask-result`, sem lançar e sem deixar o painel congelado em "Perguntando…". O helper `withSuppressedUnhandledRejection` deste arquivo **permanece**: ele cobre o manipulador de "Esquecer" (memória), que segue sem `.catch` e está fora do escopo desta SPEC.

Nenhum outro arquivo de teste é editado.

---

# Fora do Escopo

- **Desabilitar `#objective`** durante um turno de chat ou um `ask` em voo — D3. Digitar não dispara gesto contra o Core; desabilitar roubaria foco e texto em curso, exatamente o argumento da SPEC-0048/D3 para `#chat-input`.
- **Somar `micBusy()` à condição de `#ask-submit`** — D5. A captura de voz alimenta `#chat-input`, não `#objective`; bloquear o `ask` por ela ampliaria o invariante sem pedido nem razão.
- **Acrescentar `.catch` a qualquer outro manipulador** de `renderer.js` (notadamente "Esquecer" do painel de memória, `chat.open()` do arranque, e os demais round-trips): mesma classe de defeito, escopo aberto sem critério mecânico de conclusão — D6. Só o `#ask-form` foi pedido e é o que esta SPEC toca.
- **Rastrear `resolveAskSnapshot` contra si mesmo, ou `sendChatTurn`, em `inFlightOperations` no `core-bridge.ts`**: mudaria a garantia estrutural documentada em `apps/desktop/CLAUDE.md` ("Rastreio de operação em voo", com a lista de funções deliberadamente não rastreadas) e afetaria recusas de `selectPermissionRoots`. SPEC própria — D7 confirma o fora de escopo proposto pelo pedido.
- **Trocar `askInFlight` de booleano para contador** ou introduzir qualquer forma de fila/enfileiramento de gestos: com a guarda da Frente 2 não existe mais um 2º `ask` concorrente para contar.
- **Cancelar um `ask` em voo** (botão de cancelar/abortar) — capacidade nova, não pedida, exigiria caminho de cancelamento no main process.
- **Renomear `refreshChatControlsForMic`** ou reorganizar as funções de refresh (SPEC-0048/D4 segue valendo — churn sem ganho).
- **Quebrar `renderer.js` em arquivos menores** (SPEC-0042/D8) e **eliminar a duplicação renderer↔módulo** (ADR-0019 ⇒ ADR novo ⇒ escalação humana).
- **Ampliar o gate de paridade** a módulos fora dos três vigiados (eixo residual da SPEC-0047/D2).
- Qualquer alteração em `packages/*`, `apps/cli`, `@atlas/contracts`, `core-bridge.ts`, `main.ts`, `preload.cjs`, `piper-tts.ts`, `stt-engine.ts`, `speech-output.ts`, `media-permission.ts`, CSS ou canais IPC.
- Dependência nova, mudança de `vitest.config.ts` da raiz, de `package.json` (raiz ou app), do lockfile ou da CI.
- Confirmação de smoke visual/sonoro em ambiente gráfico — pendência conhecida e ortogonal (Observações).

---

# Pré-requisitos

- [SPEC-0048](./SPEC-0048-desktop-chat-send-ask-serialization.md) — `Done` (verificado no arquivo: `- [x] Done`). Origem das três frentes; fornece o padrão (guarda no manipulador + origem única de cálculo) e o arquivo de teste estendido aqui.
- [SPEC-0047](./SPEC-0047-renderer-parity-gate-and-panel-coverage.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece `renderer.gesture-serialization.test.ts` e `renderer.memory-ask.test.ts`, e o gate de paridade que deve seguir verde.
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece o harness jsdom.
- [SPEC-0046](./SPEC-0046-desktop-voice-input-stt.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece `micBusy()`, cuja contribuição às condições existentes não pode regredir.

Nenhum outro: esta SPEC não depende de comportamento novo de nenhum package.

---

# Critérios de Aceitação

> **Convenção de medição (CA 1, 2 e 15):** todo critério de diff e de contagem é medido contra o **commit-base registrado no passo 1 da Estratégia de Implementação** (`git rev-parse HEAD` antes de qualquer edição) e diz respeito **apenas ao diff atribuível a esta SPEC**. Alteração alheia já presente na árvore deve ser reportada, não incorporada nem revertida.

1. O diff atribuível a esta SPEC contém **exatamente cinco** arquivos: `apps/desktop/src/renderer/index.html`, `apps/desktop/src/renderer/renderer.js`, `apps/desktop/tests/renderer.gesture-serialization.test.ts`, `apps/desktop/tests/renderer.memory-ask.test.ts` e o arquivo desta SPEC — verificável por `git diff --name-only <commit-base>..HEAD`.
2. Nenhum arquivo sob `packages/`, `apps/cli/`, `.github/`, nem `apps/desktop/src/main.ts`/`preload.cjs`/`core-bridge.ts`/`piper-tts.ts`/`stt-engine.ts`/`speech-output.ts`/`media-permission.ts` aparece nesse diff.
3. `index.html` tem exatamente um elemento com `id="ask-submit"`, dentro de `#ask-form`, e o diff do HTML é a adição desse atributo e nada mais.
4. Existe em `renderer.js` uma função `refreshAskControls()` que calcula o `disabled` de `#ask-submit` a partir de **exatamente** os termos `chatTurnInFlight` e `askInFlight`, e ela é chamada por `refreshPermissionsPanelState()`.
5. Nenhum `.finally`, `.then` ou manipulador de `renderer.js` atribui `disabled` diretamente a `#ask-submit`: o estado do botão tem origem única em `refreshAskControls()`.
6. O manipulador de `submit` de `#ask-form` retorna sem chamar `window.atlas.ask` e **sem** escrever em `#ask-result` quando `chatTurnInFlight` ou `askInFlight` é verdadeiro.
7. O manipulador de `submit` de `#ask-form` encadeia `.catch` antes do `.finally`, e o `.catch` escreve no `#ask-result`.
8. Teste: com um `ask` em voo, submeter `#ask-form` de novo com objetivo não vazio deixa a contagem de chamadas de `atlas.ask` em **1**; após o 1º assentar, o mesmo submit leva a contagem a **2**.
9. Teste: com um `ask` em voo, `#ask-submit` tem `disabled === true`; ao assentar, `false`.
10. Teste: com um turno de chat em voo, `#ask-submit` tem `disabled === true` e submeter `#ask-form` deixa a contagem de chamadas de `atlas.ask` em **0**; ao assentar o turno, `disabled === false` e o mesmo submit leva a contagem a **1**.
11. Teste: `atlas.ask` rejeitando deixa `#ask-result` contendo `⚠️` e a mensagem do erro (nunca o texto "Perguntando…" residual), sem que o submit lance.
12. Teste (D3): `#objective` tem `disabled === false` durante um turno de chat e durante um `ask` em voo.
13. `withSuppressedUnhandledRejection` **não existe mais** em `renderer.gesture-serialization.test.ts` (nem o comentário que afirma a ausência de `.catch` em `#ask-form`), e o caso "ask rejeitando reabilita `#chat-send`" passa sem supressão, sem emitir aviso de rejeição não tratada. O helper homônimo de `renderer.memory-ask.test.ts` **permanece**, com seu comentário sobre o manipulador de "Esquecer" inalterado.
14. Não-regressão: os casos existentes de `renderer.gesture-serialization.test.ts`, `renderer.memory-ask.test.ts`, `renderer.voice-input.test.ts`, `renderer.boot.test.ts`, `renderer.persona-crud.test.ts` e `renderer.permissions-panel.test.ts` seguem verdes; `#chat-send` continua desabilitado durante turno de chat, `ask` em voo e gravação/transcrição; `#chat-input` continua habilitado durante um `ask`.
15. **Delta de suíte** sobre a base observada no passo 1 (esperada: **972 testes / 74 arquivos**): `pnpm test` na raiz passa, **nenhum arquivo de teste é criado ou removido** (delta de arquivos = 0) e o total de testes sobe em **+4 ou mais**. Se a base observada divergir de 972/74, prevalece a observada e a divergência é reportada.
16. O gate de paridade segue verde sem edição: `apps/desktop/tests/renderer.speech-parity.test.ts` não aparece no diff e continua passando (registro com 10 entradas, três módulos vigiados).
17. `pnpm --filter @atlas/desktop test` e `pnpm --filter @atlas/desktop typecheck` passam; os dois arquivos de teste tocados passam quando executados **sozinhos**, e a suíte de `apps/desktop` passa sob `--sequence.shuffle` em **duas** sementes distintas.
18. `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm format:check` passam na raiz.
19. Nenhum teste desta SPEC executa processo externo, abre socket, faz chamada de rede ou depende de Piper/whisper/Electron instalados.

---

# Arquivos Esperados

```text
apps/desktop/src/renderer/index.html                       (modificado — Frente 1)
apps/desktop/src/renderer/renderer.js                      (modificado — Frentes 2 e 3)
apps/desktop/tests/renderer.gesture-serialization.test.ts  (modificado — Frente 4.1)
apps/desktop/tests/renderer.memory-ask.test.ts             (modificado — Frente 4.2)
docs/implementation/specs/SPEC-0049-desktop-ask-form-serialization-and-error-surfacing.md
```

**Nenhum outro arquivo no diff atribuível a esta SPEC.** Arquivo alheio já modificado na árvore no início do trabalho não pertence a esta SPEC: reportar, não incorporar nem reverter.

---

# Componentes Impactados

- `@atlas/desktop` — **somente** `src/renderer/index.html`, `src/renderer/renderer.js` e dois arquivos de teste.

Nenhum módulo do Module Catalog é tocado. Nenhum módulo novo. Nenhum contrato público alterado. Nenhuma mudança no main process, no IPC, no `core-bridge.ts` ou na fronteira de segurança do Electron.

---

# Interfaces Necessárias

**Nenhuma.** Não há interface pública nova nem alterada; `@atlas/contracts` não é tocado; nenhum canal IPC novo; nenhuma opção nova no harness de teste (as promessas controladas de `ask` e de `chatSend` já existem em `RendererFixtureOptions` e são usadas pelos casos atuais). O `id="ask-submit"` é um identificador de DOM local ao app, não um contrato.

---

# Fluxo Esperado

```text
usuário submete #chat-form
        │
        ▼
chatTurnInFlight = true ─► refreshPermissionsPanelState()
                                   ├─► painel de permissões / Persona / mic  (já)
                                   ├─► refreshChatControlsForMic()           (já)
                                   └─► refreshAskControls()                  (NOVO)
                                             └─► #ask-submit.disabled =
                                                 chatTurnInFlight || askInFlight

usuário submete #ask-form (2º clique, ou durante um turno de chat)
        │
        ▼
guarda: chatTurnInFlight || askInFlight ⇒ return   (NOVO — nada é enviado,
                                                    #ask-result intacto)

atlas.ask rejeita
        │
        ▼
.catch ─► #ask-result = "⚠️ <mensagem>"            (NOVO)
        │
        ▼
.finally ─► askInFlight = false ─► refreshPermissionsPanelState()
                                     └─► #ask-submit reabilitado
```

---

# Estratégia de Implementação

1. **Registrar o commit-base** (`git rev-parse HEAD`) e a **linha de base real** da suíte (`pnpm test` na raiz — esperado 972 testes / 74 arquivos), anotando ambos no relatório final. Conferir se a árvore está limpa; se não, reportar o que já estava modificado.
2. Reler, no fonte, as regiões a editar (as referências de linha desta SPEC podem ter deslocado): `#ask-form` em `index.html`, `refreshPermissionsPanelState` e o manipulador de `submit` de `#ask-form` em `renderer.js`, e o cabeçalho/helpers dos dois arquivos de teste.
3. **Primeiro o teste (RED):** escrever os quatro casos novos (CA 8/9, 10, 11, 12) e ajustar `STATIC_SERIALIZED_IDS`. Rodar `pnpm --filter @atlas/desktop test` e **ver falhar** pelos motivos esperados (inclusive por `#ask-submit` inexistente) — registrar a falha observada no relatório final.
4. Aplicar a Frente 1 (`id` no HTML) e a Frente 2 (`refreshAskControls` + chamada + guarda) em `renderer.js`; rodar de novo.
5. Aplicar a Frente 3 (`.catch`); só então remover o helper `withSuppressedUnhandledRejection` de `renderer.gesture-serialization.test.ts` e sua chamada, e reescrever o cabeçalho do arquivo. Rodar e confirmar que nenhum aviso de rejeição não tratada aparece.
6. Rodar cada arquivo de teste tocado **sozinho** e a suíte de `apps/desktop` sob duas sementes embaralhadas; conferir em especial `renderer.voice-input.test.ts`, `renderer.boot.test.ts` e `renderer.speech-parity.test.ts` (não devem precisar de edição — se algum exigir, é **achado**: pare e reporte).
7. Fechar com `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` na raiz e conferir o diff final contra o commit-base (CA 1, 2, 15).

---

# Estratégia de Testes

- **RED antes de GREEN**: os casos novos precisam falhar contra a implementação atual antes da correção — é a prova de que os defeitos descritos existem (passo 3; registrar a falha observada no relatório final).
- **Comportamento observável**, nunca introspecção de estado interno do renderer (herdado da SPEC-0047/D4): asserções sobre `disabled` dos elementos, sobre `textContent` do `#ask-result` e sobre chamadas registradas/contadas nos dublês.
- **Recusa em pé de igualdade com sucesso**: todo caso de guarda prova as duas metades — recusa enquanto em voo, e aceitação depois de assentar (CA 8 e 10).
- **Não-regressão por caso existente**, não por asserção nova: os casos de voz e de turno de chat já cobrem os demais termos das condições; se algum deles precisar de edição, é achado.
- **Isolamento**: uma janela jsdom por caso, fechada no `afterEach` existente; estabilidade sob `--sequence.shuffle` (CA 17).
- **Determinismo**: sem rede, sem processo externo, sem dependência de binários instalados (CA 19).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- testes estiverem passando (delta do CA 15 sobre a base observada: 0 arquivos, ≥ +4 testes);
- a observação RED do passo 3 estiver registrada no relatório final do `spec-implementer`;
- documentação atualizada;
- arquitetura preservada (ADR-0019/0021/0022 intactos; nenhum diff em `packages/*`, `apps/cli`, main process ou contratos);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` da raiz, `apps/desktop/CLAUDE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `PLATFORM_STATE.md`) é do passo de fecho, **não** do `spec-implementer` — que toca apenas os quatro arquivos de código/teste e o arquivo desta SPEC. O fecho deve obrigatoriamente:

- **(a)** retirar de `apps/desktop/CLAUDE.md` ("Candidatos futuros já nomeados") e de `NEXT_CONTEXT.md` ("Candidatos abertos" → "Sobre a SPEC-0048") os **três** itens que esta SPEC consome (serializar `#ask-form` contra turno de chat; guardar `#ask-form` contra 2º `ask`; `.catch` no `#ask-form`), preservando o quarto (rastrear `sendChatTurn` em `inFlightOperations`), que segue aberto;
- **(b)** atualizar, em `apps/desktop/CLAUDE.md` ("Serialização de gestos"), a descrição: as duas direções passam a estar fechadas no renderer, `#ask-submit` entra na condição `chatTurnInFlight || askInFlight`, `#objective` fica deliberadamente fora (D3), e a frase que hoje declara as duas direções como "fora, candidatos registrados" é substituída;
- **(c)** registrar em `apps/desktop/CLAUDE.md` que o painel `ask` agora pinta erro no `#ask-result`, e que o manipulador de "Esquecer" (memória) **segue** sem `.catch` — resíduo remanescente da mesma classe (D6), para que a supressão de rejeição não tratada de `renderer.memory-ask.test.ts` continue tendo justificativa registrada;
- **(d)** registrar nas lições os resíduos que esta SPEC deliberadamente deixa abertos: **(d.1)** `.catch` ausente nos demais manipuladores do renderer (memória/"Esquecer", `chat.open()` do arranque) — D6; **(d.2)** a serialização segue sendo **do renderer**, não estrutural no main process (`inFlightOperations` não cobre `sendChatTurn` nem `resolveAskSnapshot` contra si mesmo) — D7.

---

# Restrições

- **Somente os cinco arquivos dos "Arquivos Esperados"**. Se fechar qualquer critério exigir tocar `core-bridge.ts`, `main.ts`, `preload.cjs`, outro módulo de `src/` ou qualquer package, **pare e reporte** — é fronteira de outra SPEC.
- **Não alterar nenhuma função replicada do renderer** (as 9 réplicas + `PIPER_VOICE_PREFIX`): o gate de paridade não pode ser posto em jogo por esta SPEC.
- **Não alterar nem remover caso de teste existente** além do previsto na Frente 4: nenhum caso é removido ou enfraquecido — a única remoção autorizada é o helper `withSuppressedUnhandledRejection` de `renderer.gesture-serialization.test.ts` (que deixa de ter razão de existir) e o comentário associado. Se um teste pré-existente de outro arquivo começar a falhar, é achado: pare e reporte, não "ajuste".
- **Não tocar o helper homônimo de `renderer.memory-ask.test.ts`**, que cobre o manipulador de "Esquecer".
- **Não introduzir bundler, `type="module"` no renderer, nem etapa de build** — ADR-0019 permanece literal.
- **Nenhuma dependência nova**; `pnpm-lock.yaml` fora do diff. Não alterar `vitest.config.ts` da raiz nem criar config por package (SPEC-0042/D12).
- Não criar módulos, Tools, Skills ou Personas; não tocar `@atlas/contracts`; não alterar a CI.
- Não expandir para cancelamento de `ask`, fila de gestos ou contador de `askInFlight`.

---

# Observações

- **Por que isto não exige ADR**: nenhuma decisão arquitetural nova. A serialização de gestos no renderer está em vigor desde as SPECs 0037/0038 e foi estendida pela SPEC-0048; esta SPEC aplica a mesma condição existente ao último painel que ficou de fora e acrescenta um `.catch` num manipulador. ADR-0019/0021/0022 saem como entraram; o Module Catalog não muda.
- **Limite conhecido da garantia** (herdado da SPEC-0048): a serialização continua sendo **do renderer**. O `core-bridge` não recusa um `resolveAskSnapshot` concorrente a outro nem a um `sendChatTurn` — `inFlightOperations` cobre `selectPermissionRoots`, por desenho documentado. O invariante fica garantido no caminho que o usuário percorre, não estruturalmente no main process. Registrado, não assumido em silêncio (D7).
- **Por que a guarda no manipulador, além do `disabled`**: um `<form>` submete implicitamente por Enter e um `submit` pode ser despachado programaticamente — `disabled` é camada de UX, não garantia. É também o que torna o CA 8/10 verificável no harness jsdom, que despacha `submit` direto (mesmo raciocínio da SPEC-0048/D2).
- **Efeito colateral benigno do `.catch`**: com o erro pintado no `#ask-result`, o painel deixa de exibir "Perguntando…" indefinidamente após uma falha — comportamento hoje observável e nunca coberto por teste.
- **Ortogonal e não resolvida**: a pendência de smoke visual/sonoro nunca confirmado (SPEC-0031 a 0048). Um DOM de teste prova lógica e fiação; não prova pixel nem som. Esta SPEC não a fecha.
- **Custo colateral**: `renderer.js` e `index.html` são carregados do disco por 8 arquivos de teste (custo já registrado pela SPEC-0047). O diff é pequeno e não muda a estrutura dos arquivos, então não altera o custo da fatia futura de quebrá-los (SPEC-0042/D8).

---

# Checklist para IA

Antes de implementar:

- ler esta SPEC, a DoD (item d) e as Observações da SPEC-0048, e a seção "Serialização de gestos" de `apps/desktop/CLAUDE.md`;
- registrar commit-base e linha de base da suíte (passo 1 — esperado 972 testes / 74 arquivos);
- confirmar, no fonte, as regiões a editar (as referências de linha desta SPEC podem ter deslocado).

Durante implementação:

- teste primeiro, RED observado e registrado, só então a correção;
- somente os cinco arquivos previstos; qualquer necessidade fora disso é parada e relato;
- nenhuma função replicada do renderer é tocada;
- o helper de supressão só sai **depois** que o `.catch` estiver em pé.

Após implementação:

- rodar cada arquivo de teste tocado sozinho e a suíte de `apps/desktop` sob duas sementes embaralhadas;
- rodar os quatro comandos completos na raiz;
- conferir o diff final contra o commit-base (CA 1, 2, 15);
- validar os Critérios de Aceitação um a um.

---

# Resultado Esperado

O painel `ask` do desktop deixa de ser o único que ignora o invariante "um gesto por vez": dois cliques seguidos em "Perguntar" não sobem mais dois Cores concorrentes, e um `ask` disparado durante um turno de chat é recusado pela mesma condição (`chatTurnInFlight || askInFlight`) que já governa `#chat-send`, o seletor de Persona e os painéis de permissões/Personas. O botão de submissão do painel ganha identidade própria (`#ask-submit`) e passa a ter uma origem única de cálculo do seu estado, como os demais controles. O campo de objetivo continua editável a qualquer momento — digitar nunca foi um gesto contra o Core. E uma falha de `atlas.ask`, que hoje some como unhandled rejection deixando "Perguntando…" na tela, passa a aparecer ao usuário como aviso no `#ask-result`. As duas direções residuais e o achado colateral registrados pela SPEC-0048 ficam fechados; o único resíduo daquela lista que permanece — rastrear `sendChatTurn` no `core-bridge` — segue explicitamente aberto e documentado. Nada mais muda: nenhuma capacidade nova, nenhum contrato, nenhuma dependência, nenhum arquivo fora de `apps/desktop`, e os ADRs 0019/0021/0022 permanecem literais.

---

# Decisões de design

**D1 — Fechar as três frentes numa SPEC só**

- **Decisão**: `ask × ask`, `chat → ask` e o `.catch` viajam juntos.
- **Porquê**: as três tocam o **mesmo manipulador** de `#ask-form` (`renderer.js:136-167`); separá-las pagaria três cerimônias de pipeline para editar as mesmas 30 linhas, e a remoção do supressor de `unhandledRejection` no teste de serialização só é possível com o `.catch` no lugar — as frentes são interdependentes na verificação. É o mesmo julgamento que a SPEC-0048/D9 fez ao levar a higiene documental de carona.
- **Alternativa descartada**: três SPECs (ou duas: serialização e erro). Perdeu por multiplicar o custo fixo sobre um diff pequeno e por deixar o teste de serialização com um helper que descreve um defeito já corrigido — exatamente o tipo de comentário falso que a SPEC-0048/Frente 2 existiu para apagar.

**D2 — `#ask-form` deve, sim, bloquear-se por um turno de chat em voo (direção chat → ask)**

- **Decisão**: a condição de `#ask-submit` e a guarda do manipulador incluem `chatTurnInFlight`, não só `askInFlight`. A SPEC-0048 deixou essa pergunta de UX explicitamente em aberto; a resposta é sim.
- **Porquê**: o invariante que o projeto declara é "um round-trip contra o Core por vez", e um turno de chat mantém um Core **vivo** executando Tools enquanto um `ask` sobe outro Core, stateless, também capaz de executar Tools — o mesmo risco concreto que motivou a SPEC-0048 na direção inversa. Todos os demais controles do renderer (`#chat-send`, `#persona-select`, painéis de permissões/Personas) já usam exatamente `chatTurnInFlight || askInFlight`: manter só o painel `ask` de fora seria assimetria sem razão que a sustente, e assimetria não justificada é o que volta a derivar (a SPEC-0043 pagou caro por uma).
- **Alternativa descartada**: bloquear `ask` apenas contra outro `ask` (fechar d.2 e deixar d.1 aberta), argumentando que uma pergunta de tiro único é "leve" e que o usuário pode querer perguntar algo enquanto o chat responde. Perdeu porque `ask` não é leve — sobe um Core inteiro, planeja e executa Tools —, e porque o custo da recusa é baixo e reversível (o usuário espera o turno assentar), enquanto o custo da concorrência é execução simultânea de Tools por dois caminhos que não se conhecem.

**D3 — `#objective` fica deliberadamente fora da serialização**

- **Decisão**: durante um turno de chat ou um `ask` em voo, o campo de objetivo continua habilitado; só o botão de submissão é bloqueado, e a guarda recusa o envio. A exclusão fica registrada como decisão no teste e nas docs vivas, não como gap.
- **Porquê**: aplicação literal da SPEC-0048/D3 (que decidiu o mesmo para `#chat-input`): digitar não dispara gesto algum contra o Core, o invariante protegido é "um round-trip por vez", não "um teclado por vez", e desabilitar o campo roubaria foco e texto em curso.
- **Alternativa descartada**: desabilitar `#objective` também, por simetria com o comportamento do `#chat-input` **durante um turno de chat** (onde ele é desabilitado). Perdeu porque aquela desabilitação tem razão própria e distinta (o texto está sendo consumido e é limpo ao assentar), que não se aplica ao objetivo de um `ask` de outro painel.

**D4 — Recusa silenciosa, sem aviso no `#ask-result`**

- **Decisão**: com a guarda ativa, o manipulador retorna sem escrever nada — não avisa "aguarde", não limpa o campo, não sobrescreve o resultado do round-trip em curso.
- **Porquê**: preservar o `#ask-result` em curso vale mais que sinalizar um gesto que o `disabled` do botão adjacente já desencoraja — escrever ali durante um `ask` em voo apagaria o "Perguntando…" (ou pior, um resultado ainda sendo lido). **Correção vinculante do gate arquitetural (A1)**: a justificativa original desta decisão ("o botão já está cinza, então o caminho normal do usuário não chega aqui; a guarda existe só para submissão implícita/programática") é **falsa** e não deve ser propagada às docs vivas. Como D3 mantém `#objective` habilitado e um `<form>` com `<input type="text">` submete por Enter, o caminho implícito **é** o caminho normal aqui — a analogia com SPEC-0048/D2 não se sustenta, porque lá `#chat-input` é desabilitado durante o turno (`renderer.js:1275`), tornando o Enter inalcançável. A decisão segue válida pela razão acima; a premissa antiga, não. Mesmo padrão silencioso das guardas existentes do `#chat-form` (sessão nula, texto vazio, SPEC-0048/D2).
- **Alternativa descartada**: pintar um aviso do tipo "⚠️ aguarde o round-trip em andamento". Perdeu por destruir informação visível na tela para comunicar redundância, e por criar um estado de texto que nenhum caminho limpa de forma óbvia.

**D5 — `micBusy()` NÃO entra na condição de `#ask-submit`**

- **Decisão**: `#ask-submit` é governado só por `chatTurnInFlight || askInFlight`; gravação/transcrição de voz não o bloqueiam.
- **Porquê**: a captura por voz (SPEC-0046) alimenta `#chat-input` — é um gesto do painel de chat, e é por isso que `#chat-send` a inclui (enviar antes de a transcrição pousar descartaria o ditado do usuário). O `ask` não recebe ditado nenhum, e a transcrição roda local, sem tocar o Core: bloqueá-lo por `micBusy()` ampliaria o invariante sem risco correspondente. A direção que importa já existe e não regride: um `ask` em voo continua desabilitando o botão de microfone (`refreshMicButtons`).
- **Alternativa descartada**: usar `chatTurnInFlight || askInFlight || micBusy()`, "a mesma condição de `#chat-send`", por uniformidade. Perdeu porque uniformidade de expressão não é valor quando as razões diferem — e travaria o painel `ask` por uma atividade que não disputa nada com ele.

**D6 — Só o `#ask-form` ganha `.catch`; os demais manipuladores ficam como estão**

- **Decisão**: a Frente 3 acrescenta exatamente um `.catch`, no manipulador nomeado pelo pedido; "Esquecer" (memória), `chat.open()` do arranque e os demais round-trips seguem sem, e o supressor de `unhandledRejection` de `renderer.memory-ask.test.ts` permanece com sua justificativa.
- **Porquê**: é o resíduo que a SPEC-0048 registrou e que o usuário pediu; varrer o arquivo atrás de todos os `.then` sem `.catch` seria escopo aberto, sem critério mecânico de conclusão, num arquivo de mais de 1.300 linhas — e diluiria o diff da correção de comportamento que é o núcleo desta SPEC. Escopo fechado é o que mantém o CA 1 verificável. O resíduo vai para as lições (DoD-d.1), como esta SPEC herdou da anterior.
- **Alternativa descartada**: auditar e corrigir todos os manipuladores de promessa do renderer. Perdeu por escopo sem fim de fronteira e por arrastar mudança de comportamento para painéis que ninguém pediu para mexer (cada `.catch` novo decide **onde** pintar o erro — decisão de UX por painel, não corolário).

**D7 — `inFlightOperations` no `core-bridge` fica fora (confirmação do fora de escopo proposto)**

- **Decisão**: manter fora, como o pedido propôs; não rastrear `sendChatTurn` nem `resolveAskSnapshot` contra si mesmo no main process.
- **Porquê**: `apps/desktop/CLAUDE.md` documenta a garantia de `inFlightOperations` numa formulação exata ("toda função que sobe um Core capaz de executar Tools **fora do `Map` de sessões vivas**") e enumera as funções deliberadamente não rastreadas; ampliá-la muda a garantia publicada e altera as recusas de `selectPermissionRoots` — efeito colateral sobre um caminho de **segurança** (concessão de política de escrita), que não pode viajar de carona numa correção de UX do renderer. Além disso, o diff sairia de `renderer/` para o main process, quebrando a revisibilidade barata desta fatia.
- **Alternativa descartada**: fechar tudo de uma vez, tornando a serialização estrutural no main process em vez de garantia do renderer. Perdeu por acoplar duas decisões de risco muito diferente na mesma SPEC; fica registrada como o único resíduo remanescente da lista da SPEC-0048 (DoD-d.2 desta), candidata a SPEC própria.

**D8 — Dar `id="ask-submit"` ao botão, em vez de selecioná-lo por seletor estrutural**

- **Decisão**: acrescentar `id="ask-submit"` no `index.html` e usar `getElementById`, como todos os demais controles serializados.
- **Porquê**: o pedido do usuário já nomeia `#ask-submit` — mas o elemento **não existe hoje** (o botão de `#ask-form` é o único controle do painel sem `id`, achado desta fatia). Todo o restante do renderer resolve controles por `id`, e os testes de serialização montam a lista a partir de uma tabela de `id`s; introduzir uma exceção baseada em `#ask-form button[type="submit"]` criaria um segundo padrão de seleção, frágil a qualquer botão futuro no formulário.
- **Alternativa descartada**: `querySelector('#ask-form button[type="submit"]')`, evitando tocar o HTML. Perdeu por ser mais frágil, menos legível e por criar exceção ao padrão vigente — o custo evitado (um atributo num arquivo já estável) é menor que o custo criado.

**D9 — Perfil `completo`**

- **Decisão**: classificar como `completo`.
- **Porquê**: a mudança é **corretiva**, não aditiva (a Emenda v1.2 exige aditiva para `micro`), toca a superfície de UI em `index.html` além de `renderer.js`, e vive em `apps/desktop` — não em `packages/X/src` + `apps/cli/src`, que é a letra da regra. Some-se que a D2 resolve uma pergunta de UX que a SPEC anterior **deliberadamente devolveu** por não ser corolário, o que é exatamente o tipo de juízo que merece o gate cheio. Precedente direto: a SPEC-0048, de forma e tamanho quase idênticos, foi proposta como `micro` pelo `spec-drafter` e saiu do gate como `completo`.
- **Alternativa descartada**: `micro`, pelo tamanho do diff (cinco arquivos, um workspace package, sem ADR, cabe numa sessão). Perdeu pelo precedente explícito da SPEC-0048 e pela regra do default seguro ("na dúvida, `completo`"): um `micro` indevido cai no pipeline completo sem prejuízo, enquanto um `completo` desnecessário custa apenas cerimônia — e aqui há decisão de UX nova sendo tomada, não só aplicação de regra existente.

**D10 — Prioridade `Medium`**

- **Decisão**: `Medium`, não `High` nem `Low`.
- **Porquê**: são defeitos reais e triviais de reproduzir (dois cliques), num invariante que o projeto declara por escrito, com consequência concreta (dois Cores concorrentes executando Tools) e uma falha que o usuário **não consegue diagnosticar** (painel congelado em "Perguntando…") — o que os tira de `Low`. Mas nada está bloqueado, não há perda de dado, não há risco de segurança (o portão de permissões continua julgando cada Tool, e cada `ask` é um pedido legítimo do próprio usuário) e nenhuma fatia futura depende disto.
- **Alternativa descartada**: `High`, por envolver execução concorrente e erro silenciado. Perdeu pelo mesmo argumento da SPEC-0048/D8: concorrência entre dois pedidos legítimos do mesmo usuário, ambos passando pelo mesmo portão de permissões, é defeito de disciplina de UX, não de segurança.
