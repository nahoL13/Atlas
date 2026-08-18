# Lessons Learned

> **Project Atlas — Registro de Lições Aprendidas**

Version: 1.0

---

# Objetivo

Este documento acumula o conhecimento adquirido ao final de cada SPEC.

Seu propósito é impedir que descobertas, acertos e atritos se percam com o tempo.

O que parece óbvio ao concluir uma SPEC não estará na memória de ninguém — humano ou IA — meses depois.

---

# Regras de Uso

1. Registrar as lições é obrigatório ao concluir uma SPEC e faz parte da Definition of Done.
2. Novas entradas são adicionadas no topo do Registro; entradas antigas nunca são reescritas.
3. Lições são fatos observados durante a implementação, não opiniões.
4. Todo item listado em "Precisamos mudar" deve gerar um encaminhamento: um ADR em `docs/06-adr/`, uma atualização de documentação ou uma nova SPEC. Nenhuma mudança necessária deve morrer neste arquivo.

Uma lição não é uma decisão.

Quando uma lição exigir mudança estrutural, a decisão correspondente deverá ser registrada como ADR.

---

# Formato da Entrada

Toda entrada segue o modelo abaixo.

```text
## SPEC-XXXX — Título (AAAA-MM-DD)

Descobrimos que...

A arquitetura ajudou porque...

A arquitetura atrapalhou porque...

Precisamos mudar... (encaminhamento: ADR, documentação ou nova SPEC)
```

Quando uma seção não tiver conteúdo, registre "nada a registrar".

A ausência de atrito também é informação.

---

**Escopo deste arquivo:** o Registro abaixo mantém as **últimas 5 SPECs**. As entradas da SPEC-0048 e anteriores estão em `LESSONS_LEARNED-ARCHIVE.md`, preservadas sem edição (regra 2 intacta — nada é reescrito, só realocado).

O corte existe porque este arquivo chegou a 157 KB (~39k tokens) e era relido no arranque de quase todo subagent, dominando o custo em tokens do pipeline. Ao fechar uma SPEC: adicione a entrada nova no topo do Registro e mova a mais antiga das 6 para o arquivo.

---

# Padrões Recorrentes

Lições que se repetiram em três ou mais SPECs. Este índice existe para sobreviver ao corte acima — consulte o arquivo para o caso concreto de cada uma.

- **Correção de bloqueante introduz bloqueante novo no mesmo caminho de código** — SPEC-0034, 0038, 0039, 0048 (`#chat-send` corrigido em `refreshChatControlsForMic()` reabriria pelo `.finally` do turno de chat, que tinha origem de cálculo própria). Ao corrigir um veto do gate, re-examine o caminho inteiro, não só a linha apontada.
- **Garantia em prosa absoluta tende a estar incompleta** — SPEC-0038 (A1/A2 → A6/A7), SPEC-0047 (CA de verificação incompleto), SPEC-0049 (justificativa de decisão incompleta), SPEC-0050 (contagem de consumidores incompleta — "um único consumidor" quando já eram dois). "Toda função que X"/"N consumidores" quase sempre esquece um caso; enumere nominalmente ou restrinja a formulação em vez de contar.
- **Duplicação deliberada renderer↔módulo** — SPEC-0035, 0036, 0039, 0040, 0041, 0043 (8 réplicas + a constante `PIPER_VOICE_PREFIX`). `renderer.js` é `<script>` clássico sem bundler (ADR-0019) e não pode importar o módulo TS em runtime; a réplica em JS puro é consciente e leva comentário apontando o teste de referência. A SPEC-0043 é a 2ª vez que essa duplicação **deriva por acidente** (não só risco teórico): o glue do renderer ficou sem `preferredVoiceURI` desde a SPEC-0035 sem que nenhuma das cinco fatias seguintes notasse. Desde a **SPEC-0045**, a deriva entre as duas cópias é coberta por um gate mecânico (`renderer.speech-parity.test.ts`, sobre `jsdom` num harness que carrega `renderer.js` do disco) — cobre só réplicas de `speech-output.ts`; réplica de outro módulo segue por convenção.
- **Campo obrigatório novo em `Deps` exige grep pelo nome da função construtora** (`createRuntime(`, `createPermissionService(`) em **todo o repo** — repetido 8× até a SPEC-0013.
- **Membro obrigatório novo numa interface de contrato não é pego por esse grep** — busque pelo **nome do tipo** (`git grep 'PermissionService'`), que acha fakes e implementações diretas nos testes (quebrou o typecheck na SPEC-0017).
- **`vitest run` não faz typecheck** (esbuild só remove tipos) — um passo TDD "RED" que depende de erro de *tipo* só falha de verdade em `pnpm --filter <pkg> typecheck`.
- **Smoke visual/sonoro das fatias desktop** — SPEC-0031 a 0046, 15 seguidas sem confirmação (o shell de automação não tem WindowServer, microfone nem os binários Piper/`whisper-cli`). Deixou de ser risco hipotético na **SPEC-0053**: o smoke humano rodou de fato pela primeira vez e **reprovou** a v2.0 (1.322 testes/80 arquivos, quatro gates técnicos verdes) por hierarquia/sobreposição/falta de volume — prova concreta de que gates técnicos verdes não bastam para aceite perceptivo. A v3.0 corrigiu e fechou os 15 itens `OK`. Fatia futura que tocar o núcleo/layout reabre a pendência.
- **Contrato só sobe a `@atlas/contracts` com 2º consumidor real**, via ADR (ADR-0007). Tipos de uma app só (`StatusSnapshot`, `TurnSnapshot`, `FactSnapshot`) ficam locais.


# Registro

## [SPEC-0053](specs/SPEC-0053-desktop-visual-layout.md) — Núcleo holográfico volumétrico e navegação por drawer no desktop, v3.0 (2026-08-17)

**Descobrimos que...**

A v2.0 desta mesma SPEC tinha passado **por inteiro** nos quatro gates técnicos da raiz e em 27 Critérios de Aceitação (1.322 testes/80 arquivos) e ainda assim foi reprovada no smoke visual humano — sidebar/trilho e timeline permanentes competiam com a presença, o painel Memória sobrepunha/cortava conteúdo, e a esfera CSS-only não comunicava volume. Pela primeira vez em ~20 fatias visuais consecutivas do desktop (SPEC-0031 a 0052), o smoke humano **de fato rodou e reprovou** uma implementação inteira — até aqui o próprio Registro só citava a pendência como risco hipotético ("nunca confirmado", não "já reprovou"). A v3.0 corrigiu com esfera de partículas em Canvas 2D (projeção 3D determinística, depth-sort, SHA-256 pinado da nuvem de 400 pontos) e navegação por drawer overlay, repetiu o smoke e todos os 15 itens vieram `OK`. Descobrimos também que nem o texto da v3.0 escapou da disciplina do gate: o `architecture-reviewer` vetou a 1ª passada por cinco ambiguidades de aceite (contagem de navegação sem excluir `Fechar`/controles internos; início de `speaking` preso a evento real de playback; manifesto exato dos 77 IDs HEAD/v3/v2; digest estável da nuvem de pontos; disclosures completos de Persona/Personas/Objetivo) — a mesma classe "garantia em prosa absoluta tende a estar incompleta" que os Padrões Recorrentes já catalogam, agora pega **antes** da implementação começar, não depois.

**A arquitetura ajudou porque...**

Canvas 2D nativo (sem WebGL/lib nova) bastou para produzir volume real via projeção 3D determinística; pinar o SHA-256 da nuvem de 400 pontos + quatro sentinelas tornou a geometria inteiramente verificável em `jsdom`, sem GPU nem display real. O mapa fechado de sete perfis de estado reaproveitou sinais já emitidos pelas SPECs 0040/0052 (`playbackPending`/`playbackActive`, estados do hands-free) sem nenhuma fonte de verdade nova. O harness de dublês de Canvas/rAF/`matchMedia`/`devicePixelRatio`/ponteiro das SPECs 0045/0047 absorveu a bateria inteira de testes novos (`renderer.layout.test.ts`, 1.130 linhas) sem infraestrutura de teste nova.

**A arquitetura atrapalhou porque...**

Nada de estrutural — o atrito foi de processo, não de desenho: gates técnicos verdes (typecheck/lint/test/format:check) não provam hierarquia visual, volume ou corte, só o smoke humano prova isso, e desta vez ele de fato reprovou uma versão inteira depois dela já estar tecnicamente pronta para `Done`. O custo é visível no próprio `TOKEN_USAGE_LOG.md`: SPEC-0053 tem a maior contagem de sessões do log até aqui (20).

**Precisamos mudar...**

(1) A linha "Smoke visual/sonoro das fatias desktop nunca confirmado" nos Padrões Recorrentes deixa de ser hipotética — já reprovou uma implementação inteira (v2.0) apesar dos quatro gates técnicos verdes; a v3.0 finalmente fechou o smoke com todos os 15 itens `OK` — encaminhamento: já atualizado nesta mesma SPEC em `apps/desktop/CLAUDE.md`/`NEXT_CONTEXT.md` (a pendência estrutural muda de "nunca confirmado" para "confirmado na v3.0 da SPEC-0053"; fatias futuras reabrem a pendência só se tocarem o núcleo/layout de novo). (2) Nenhum ADR novo — Canvas 2D e drawer permanecem dentro do Output Gateway, ADR-0019 intacto (nota da própria SPEC, D3/D8).

## [SPEC-0052](specs/SPEC-0052-desktop-hands-free-voice-conversation.md) — Modo hands-free: conversa por voz contínua no desktop (2026-08-06)

**Descobrimos que...**

Reverter uma cláusula de um ADR aceito não é um ajuste de detalhe, mesmo quando a decisão de produto já está tomada pelo usuário: o ADR-0022, em *Alternativas Consideradas*, tinha rejeitado auto-envio "como parte desta decisão, e não apenas como detalhe de UI" — a distinção que autorizou revertê-la (**auto-envio ≠ execução não autorizada**, o Artigo 8 fala em ação *destrutiva*, e o `ConfirmPort` nunca foi tocado) só ficou defensável porque o gate exigiu que ela fosse citada por nome (o ADR-0023 original não linkava o Artigo 8 explicitamente — corrigido só na *Nota de implementação*, achado A7 do 1º gate). Descobrimos também, do jeito mais caro, que uma máquina de estados desenhada para "nunca ficar presa" pode ficar presa mesmo assim se a premissa sobre o caminho de erro do vizinho for falsa: a v1.0 afirmava que a recusa do `#chat-form` viraria `turnFailed`, mas o manipulador tem **três `return` silenciosos antes de qualquer promessa** — sem o estado `sending` com gancho de início confirmado no mesmo tick (D23), o modo travaria em `thinking` para sempre, com o microfone fechado e o indicador mentindo (A1 do 1º gate, o mais grave dos quatro bloqueantes). E, pela segunda vez nesta SPEC (depois do CA 32/pre-roll), uma correção de bloqueante do gate expôs um bug real: o teste RED da 1ª rodada do validador confirmou que sem a correção o frame de `speechStart` era contado duas vezes no payload transcrito.

**A arquitetura ajudou porque...**

O ADR-0023 delegou o contrato técnico exato à SPEC ("mesmo enquadramento que os ADRs 0021 e 0022 adotaram") e a SPEC, por sua vez, usou cláusula de parada seletiva (D17): só o que é decisão (modelo, versão, propriedades de carregamento, tabela de estados) fica pinado; o layout do dist do ORT, não — a v1.0 tinha pinado nomes de arquivo do dist como decisão, e o gate mostrou que o pareamento escolhido era inclusive suspeito (`.jsep.wasm` é da variante errada), então a correção (D5/D6) generalizou a cláusula de parada para "propriedades, nunca detalhe alheio" em vez de tentar acertar o nome certo. O molde de porta injetável com ponto de criação único (`spawn` do Piper/whisper) generalizou para `VoiceActivityDetector` (D21) sem desenho novo — só a disciplina extra de verificar estaticamente que `ort.`/`InferenceSession.create` só aparecem dentro da fábrica, e um teste que roda sem `window.ort` provando que a porta é real, não decorativa. As cinco camadas do caminho de envio (SPECs 0048-0051: guardas, `.catch` com aviso pinado, `.finally` de origem única, guarda estrutural do bridge, aviso de cancelamento) absorveram o auto-envio de graça: bastou disparar o mesmo `submit` de `#chat-form` (D11) em vez de abrir um segundo caminho.

**A arquitetura atrapalhou porque...**

O gate vetou uma vez com 7 achados (4 bloqueantes) — além do A1 (`sending`/D23) e do A3 (nomes de dist pinados como decisão, D5/D6), o A2 mostrou que dois CAs da v1.0 estavam em contradição direta entre si (observar o fim da fala do SO exigiria tocar a réplica registrada **ou** `speech-output.ts`, os dois lados protegidos pelo próprio checklist da SPEC) — resolvido anexando o observador dentro de `synth` (D20), o ponto de criação do utterance que nunca foi réplica de nada. O validador reprovou **duas vezes**: a 1ª por cinco CAs declarados atendidos sem prova em teste (R1-R5); a 2ª porque o CA 39 pedia "um teste por estado" sobre os 9 estados, mas só 6 são um gesto real de "desligar" — `off`/`unavailable`/`sending` não têm gap observável para o freio agir (R6). A 2ª reprovação escalou ao usuário, que decidiu emendar o texto do CA em vez de escrever três testes de fachada — a mesma disciplina que os Padrões Recorrentes já registram para "garantia em prosa absoluta", agora do lado do *Critério de Aceitação*, não da doc viva: um CA que conta ("um teste por N") pode exigir prova de algo que não existe.

**Precisamos mudar...**

(1) Justificativa de exclusão de cobertura precisa viver na SPEC (Resíduos/Decisões de design), nunca só em comentário de teste — a lição central da R6, generalizando o padrão já visto na SPEC-0049 (justificativa de decisão incompleta): registrado aqui como precedente citável para o próximo CA que "conte" artefatos ou estados. (2) **Canal de push (`webContents.send`)** avisando o renderer quando o trabalho abandonado assenta — hoje só `invoke`/`handle`; sem ele a quarentena de sessão (SPEC-0051) desliga o modo hands-free a cada tentativa de turno, apontado pelo reviewer nos dois passes do gate desta SPEC — encaminhamento: candidato elevado em `NEXT_CONTEXT.md`/`apps/desktop/CLAUDE.md`, mais atraente agora que duas fatias o pedem. (3) **Barge-in** — interromper a fala do assistente falando por cima — candidato nomeado pelo próprio ADR-0023, não descartado, custo próprio (microfone aberto durante o TTS + cancelamento de eco) — encaminhamento: registrado em `NEXT_CONTEXT.md`/`apps/desktop/CLAUDE.md`. (4) **Fallback de energia** atrás da porta `VoiceActivityDetector` (D8) — só cogitável se o Silero se mostrar de fato insuficiente em uso real, condição hoje hipotética — encaminhamento: candidato registrado, sem SPEC própria. (5) A pendência de smoke visual/sonoro (20 fatias seguidas sem confirmação humana) ganha o item mais difícil de dublar até aqui — um laço de conversa em tempo real (microfone real, binário do VAD, latência, eco) — encaminhamento: nenhuma ação possível no ambiente atual; registrado em `NEXT_CONTEXT.md`/`apps/desktop/CLAUDE.md`, sem mudança de processo.

## [SPEC-0051](specs/SPEC-0051-desktop-cancel-in-flight-operation.md) — Gesto de escape: cancelar um `ask`/turno de chat em voo no desktop (2026-08-05)

**Descobrimos que...**

O enquadramento factual da própria SPEC estava incompleto na v1.0, achado A4 do gate: cancelamento no Core **não** é "sem previsão arquitetural" — o Module Catalog já atribui ao Runtime "mecanismos de cancelamento e recuperação" e lista `cancelled` entre os estados mínimos do Task Manager. A conclusão (ADR + decisão humana para cancelamento cooperativo real) não mudou, mas o candidato nasce agora com dono nomeado, em vez de órfão. Descobrimos também, de novo, que o **alcance real de uma porta injetada** não é dedutível do ponto onde ela é usada, só do ponto onde é injetada (achado A1): a v1.0 propunha contenção do `ConfirmPort` **por turno**, mas no chat a porta é injetada uma única vez em `openChatSession` e vive pela sessão inteira — um envelope por turno teria atribuído um `confirm` do trabalho abandonado a um turno novo, podendo aprovar ação destrutiva em nome de um turno já largado (D8 reescrita). E o critério original (A2) autorizava dois `respond` concorrentes no mesmo Core/`SessionId`, reentrância que nenhum documento sustenta — fechado pela quarentena de sessão (D15 nova, invariante 8 restaurado).

**A arquitetura ajudou porque...**

O registro único `Set<OperationRecord>` (substituindo `busySessions`/`inFlightOperations`) foi o que tornou possível separar segurança × conversação × sessão em três predicados nomeados sem enfraquecer o ADR-0013/SPEC-0038 — um contador não expressa "esta operação foi abandonada", um registro com identidade sim. O molde de rejeição imediata + `.catch`/`.finally` já existente nos dois painéis (SPECs 0048/0049) absorveu o cancelamento como caminho de erro já coberto, sem criar um segundo caminho de "sucesso que não é sucesso". A vinculação tardia do `ConfirmPort` à sessão via caixa mutável preenchida após `openSession` (refinamento R1) fechou a fresta óbvia sem gambiarra: antes de a sessão existir não pode haver turno abandonado dela.

**A arquitetura atrapalhou porque...**

Um atrito técnico real, não de registro: `HttpDeps = { fetch: globalThis.fetch }` é capturado como **default de parâmetro** na criação do Core, não relido a cada chamada — trocar `globalThis.fetch` depois de `openChatSession` não afeta a mesma sessão. Quebrou 3 tentativas de teste antes da solução (um mock estático único indexado por `callCount`, cobrindo toda a vida da sessão). É um caso concreto e reutilizável do padrão "teste de sessão viva com múltiplos turnos precisa de dublê estático, não de substituição em voo".

**Precisamos mudar...**

(1) Registrar o padrão de teste do `HttpDeps`/`globalThis.fetch` capturado por valor na criação do Core, para a próxima SPEC que testar múltiplos turnos na mesma sessão viva não redescobrir do zero — encaminhamento: registrado nesta entrada; sem ADR, é lição de teste. (2) **Cancelamento cooperativo real no Core** (`AbortSignal`/Task Manager) segue como candidato nomeado — atravessa `@atlas/contracts` e ≥ 3 módulos, exige ADR novo + decisão humana; dono previsto Runtime/Task Manager — encaminhamento: candidato registrado em `NEXT_CONTEXT.md`, aguardando brainstorming humano. (3) **Diálogos nativos modais com `BrowserWindow` pai** (D16) — fecharia o "diálogo fantasma" (um `dialog.showMessageBox` já aberto permanece na tela após o cancelamento, clique sem efeito) e, de carona, a origem da corrida A7 da SPEC-0038 — encaminhamento: candidato nomeado pelo gate, registrado em `NEXT_CONTEXT.md`/`apps/desktop/CLAUDE.md` para fatia própria. (4) **Liberar a quarentena de sessão** se o trabalho abandonado nunca assentar (candidato (iv) do DoD-(c)) — hoje aquela conversa morre até a app reabrir — encaminhamento: candidato registrado, sem SPEC própria ainda. (5) Desvio de processo declarado: o arquivo novo de testes de cancelamento foi escrito depois das Frentes 1–4 (RED não estritamente anterior à implementação); o validador julgou que as falhas iniciais eram de desenho do próprio teste, não da implementação, e que isso não compromete a DoD — encaminhamento: nenhum, registrado como nota de processo, não recorrência ainda (uma ocorrência só).

## [SPEC-0050](specs/SPEC-0050-core-bridge-structural-gesture-serialization.md) — Rastreio de operação em voo vira guarda estrutural de `resolveAskSnapshot`/`sendChatTurn` no main process (2026-08-04)

**Descobrimos que...**

A v1.0 desta própria SPEC repetiu, num nível mais perigoso, um padrão já catalogado: afirmou que `hasInFlightOperation()` tinha um único consumidor (`selectPermissionRoots`), quando `updatePersona` já a consultava desde a SPEC-0039 — a própria seção "Rastreio de operação em voo" de `apps/desktop/CLAUDE.md` sustentava o engano, ao descrever só quem **marca** o contador, nunca quem o **lê**. O gate arquitetural (1º veto) pegou antes da implementação, mas o CA 3 na forma antiga ("exatamente três consumidores") teria induzido um implementador literal a **apagar** a guarda de `updatePersona` só para fazer o número fechar — um critério que **conta** artefatos pode virar armadilha, o oposto de um critério que os **enumera** nominalmente.

**A arquitetura ajudou porque...**

`hasInFlightOperation()` já existia, já era mantida por `resolveAskSnapshot`/`sendChatTurn`/`openChatSession` e já era consultada por duas outras funções — acrescentar consumidores foi reusar uma condição pronta, sem contador novo, sem contrato novo, sem tocar `packages/*` ou o renderer. O padrão "erro de estrutura antes de erro de estado" (`selectPersona`/`updatePersona`) generalizou sem desenho novo para `sendChatTurn` (valida `mustGetChatSession` antes da guarda nova). A divisão da suíte de `core-bridge` por assunto (SPEC-0042) permitiu estender exatamente os três arquivos certos, sem criar arquivo novo.

**A arquitetura atrapalhou porque...**

Nada de estrutural. O atrito, de novo, foi de precisão de registro: a doc viva descrevia só metade da garantia (quem marca) e essa lacuna documental produziu uma premissa de fato errada no próprio rascunho — a mesma classe "garantia em prosa incompleta" já catalogada nos Padrões Recorrentes, agora na variante "contagem de consumidores", não só "formulação absoluta".

**Precisamos mudar...**

(1) Um Critério de Aceitação que conta artefatos ("exatamente N consumidores") deve preferir enumeração nominal sempre que a lista puder crescer por SPECs futuras — encaminhamento: já aplicado nesta SPEC (D11, DoD-a); registrado aqui como padrão para o `spec-drafter` citar em CAs análogos. (2) `selectPersona` segue com condição **parcial** (`busySessions` inline, sem `inFlightOperations`) — um `ask` em voo não bloqueia a troca de Persona, embora bloqueie a edição da Persona ativa (D12); registrado, não corrigido — encaminhamento: candidato nomeado em `apps/desktop/CLAUDE.md`/`NEXT_CONTEXT.md` para uma fatia futura decidir se uniformiza. (3) `openChatSession` marca mas não recusa (D5): um `ask` disparado durante a abertura automática de sessão é recusado sem causa aparente ao usuário, e o renderer não tem hoje como preveni-lo — encaminhamento: nenhuma ação agora (mudaria o comportamento de um caminho automático que ninguém pediu), registrado como custo visível conhecido em `apps/desktop/CLAUDE.md`. (4) Cancelamento de uma operação em voo (A3 da SPEC-0049) fica **mais importante** depois desta SPEC — agora uma operação travada bloqueia também o main process, não só a UI — encaminhamento: candidato já nomeado, elevado em `apps/desktop/CLAUDE.md`/`NEXT_CONTEXT.md`.

## [SPEC-0049](specs/SPEC-0049-desktop-ask-form-serialization-and-error-surfacing.md) — `#ask-form` na serialização de gestos (ask × ask e chat → ask) e erro de `ask` visível na tela (2026-08-03)

**Descobrimos que...**

A justificativa original de D4 desta própria SPEC ("o botão já está cinza, então o caminho normal do usuário não chega aqui; a guarda serve só para submissão implícita/programática") era **falsa**, achado do gate arquitetural (A1) dentro da mesma SPEC, antes de chegar ao `spec-validator`: como D3 mantém `#objective` habilitado (mesma decisão da SPEC-0048 para `#chat-input`) e um `<form>` com `<input type="text">` submete por Enter, o caminho implícito **é** o caminho normal aqui — diferente de `#chat-form`, onde `#chat-input` é desabilitado durante o turno (`renderer.js:1275`), tornando o Enter de fato inalcançável. A decisão (recusa silenciosa) seguiu válida pela razão certa (preservar o `#ask-result` em curso); só a premissa morreu. Descobrimos também, na verificação, um precedente novo: um teste pré-existente ("não-regressão do `.finally` do turno de chat") ficou estruturalmente irreprodutível com os dois guardas em pé (`#chat-form` da SPEC-0048 e `#ask-form` desta) — `askInFlight` nunca chega a `true` na ordem que o caso original descrevia — e foi **reescrito**, não removido, com comentário explícito no arquivo.

**A arquitetura ajudou porque...**

O molde inteiro (origem única de cálculo em `refreshAskControls()`, chamada por `refreshPermissionsPanelState()`; guarda no manipulador logo após `preventDefault()`) já vinha pronto da SPEC-0048/D1-D2 — generalizar para o painel que tinha ficado de fora foi aplicação literal, sem desenho novo. O harness `jsdom` da SPEC-0045/0047, com promessas controláveis de `ask`/`chatSend`, tornou os quatro casos novos (ask × ask, chat → ask, `.catch`, não-regressão de `#objective`) triviais de escrever RED antes da correção.

**A arquitetura atrapalhou porque...**

Nada de estrutural. O atrito ficou em precisão de registro — a mesma classe já catalogada em "Garantia em prosa absoluta tende a estar incompleta" (Padrões Recorrentes), agora na variante "justificativa de uma decisão, não só a garantia", pega pelo gate dentro da própria SPEC antes de chegar ao fechamento.

**Precisamos mudar...**

(1) A premissa original de D4 ("botão cinza ⇒ caminho normal não chega aqui") não pode ser propagada às docs vivas — já corrigida nesta própria SPEC/nesta entrada e em `apps/desktop/CLAUDE.md`, sem necessidade de ADR. (2) Resíduos deixados abertos por decisão, todos já registrados em `apps/desktop/CLAUDE.md`/`NEXT_CONTEXT.md`: **(a)** `micBusy()` fora da condição de `#ask-submit` (D5) segue sem prova mecânica — encaminhamento: candidato para a próxima SPEC que tocar a serialização de voz do painel `ask`; **(b)** o `.catch` também captura exceções lançadas dentro do próprio `.then` (pintura do traço de `steps`), efeito colateral benigno e não coberto por CA — encaminhamento: nenhum, registrado como observação; **(c)** "Esquecer" (memória) e `chat.open()` seguem sem `.catch` (D6) — encaminhamento: candidato registrado, escopo aberto por natureza, sem SPEC própria ainda; **(d)** `sendChatTurn`/`resolveAskSnapshot` seguem fora de `inFlightOperations` no `core-bridge` (D7) — a serialização continua garantia do renderer, não estrutural no main process — encaminhamento: candidato a SPEC própria, registrado em `apps/desktop/CLAUDE.md`. (3) Achado do gate (A3), não pedido: sem cancelamento de um `ask`/turno de chat em voo, um turno que não assenta (Core travado) deixa a app sem gesto de escape até ser reaberta — encaminhamento: candidato novo, registrado em `apps/desktop/CLAUDE.md`/`NEXT_CONTEXT.md` para avaliação de UX própria numa fatia futura.

---

**Entradas anteriores (SPEC-0048 e mais antigas):** `LESSONS_LEARNED-ARCHIVE.md`.
