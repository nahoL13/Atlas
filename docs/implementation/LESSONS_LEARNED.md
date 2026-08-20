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

**Escopo deste arquivo:** o Registro abaixo mantém as **últimas 5 SPECs**. As entradas da SPEC-0049 e anteriores estão em `LESSONS_LEARNED-ARCHIVE.md`, preservadas sem edição (regra 2 intacta — nada é reescrito, só realocado).

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

## [SPEC-0055](specs/SPEC-0055-http-get-network-access.md) — Primeiro acesso à internet sob o portão de permissão: Tool `http_get` e o Network Access Gate (ADR-0026) (2026-08-20)

**Descobrimos que...**

Esta é a primeira SPEC do projeto cuja origem é uma escalação de ADR nomeada dentro do próprio fluxo de rascunho: o `spec-drafter`, ao tentar desenhar a Tool, parou porque um host/URL não tem "raiz" a conter — política nova, classe de ameaça sem análogo decidido (SSRF, redirect para host não autorizado, exfiltração) — e o usuário aprovou abrir o ADR-0026 antes de qualquer SPEC (caso 3 da Emenda v1.1). O padrão "escalação → ADR → SPEC" já existia em prosa na Constituição, mas esta é a primeira vez que o Registro tem um exemplo concreto ponta a ponta para citar. Descobrimos também, do lado do gate, que "primeiro acesso à internet" era uma afirmação incorreta por omissão: `@atlas/model-gateway` já faz egress via `fetch` desde a SPEC-0004, sem portão — o 1º veto do `architecture-reviewer` (6 achados) pegou essa imprecisão junto com dois residuais não registrados (exfiltração via query string; injeção indireta pelo corpo remoto) e um comportamento não pinado como dado (`redirect: 'manual'` depende de o undici do Node **divergir deliberadamente** da spec WHATWG, algo que nenhum teste detectaria numa regressão de runtime sem uma guarda de código dedicada, D18). O `spec-validator` reprovou uma vez, na mesma linha (D18): a correção da 1ª rodada alinhou o texto da decisão, mas não a tabela de dado pinado duas linhas abaixo — a mesma classe "correção incompleta no mesmo trecho" que os Padrões Recorrentes já catalogam, agora dentro de uma única SPEC, entre uma decisão e sua tabela de apoio.

**A arquitetura ajudou porque...**

O portão puro/síncrono do ADR-0013 absorveu um `ResourceType` inteiramente novo (`'network'`) sem tocar o Runtime — a mesma garantia que o ADR-0013 já entregava para FS ("`evaluate` roteia por `access`/`resource.type`, o Runtime aplica sem conhecer nenhum dos dois") generalizou de graça para um eixo de política com semântica de comparação totalmente diferente (igualdade exata de hostname, não contenção lexical). O molde de porta injetável interna a `@atlas/tools`, sem 2º consumidor real (SPECs 0011/0012/0013/0015/0028), absorveu `HttpPort` sem desenho novo — inclusive a disciplina de D5 de recusar o `HttpDeps` do Model Gateway como "2º consumidor", porque é um contrato incompatível (POST, headers de auth) sob o mesmo nome de conceito. O helper único de derivação de alvo (`resolveHttpTarget`, D4) fechou por construção o problema que a SPEC-0028 precisou resolver com uma 2ª barreira (`verify` injetado no toplevel do git): aqui não existe distância entre o recurso julgado e o recurso requisitado, porque os dois vêm do mesmo `new URL(args.url).href` — o ADR-0026(b) proibiu expressamente estender `isContained`/TOCTOU a rede, e o desenho não precisou disso.

**A arquitetura atrapalhou porque...**

Nada de estrutural. O único atrito de arquitetura foi de honestidade documental, não de desenho: a versão inicial da SPEC descrevia a fatia como "primeiro acesso à internet" sem qualificar "sob o portão", e ambos os achados de residual (exfiltração via URL, injeção indireta) precisaram ser adicionados explicitamente depois do 1º veto, em vez de terem sido escritos no primeiro rascunho — o mesmo tipo de imprecisão que "Padrões Recorrentes" já cataloga como "garantia em prosa absoluta tende a estar incompleta", agora do lado da **motivação** de uma SPEC, não de um Critério de Aceitação.

**Precisamos mudar...**

(1) A URL como canal de saída de dados que o portão não julga (só o host, nunca o path/query) fica registrada como residual 10, deliberadamente não fechada — fechá-la (restrição de query string, `AccessMode` de saída, ou confirmação por requisição) reabriria o ADR-0026 — encaminhamento: candidato de ADR próprio, registrado na SPEC-0055 e neste Registro; nenhuma ação até um caso real de uso mostrar necessidade. (2) Injeção indireta de prompt pelo corpo remoto (residual 11) — primeira vez que texto de terceiro não confiável entra no prompt de planejamento/composição; mitigação por desenho de prompt (marcar/delimitar conteúdo remoto como não confiável) é candidata de fatia futura, sem marcação nesta — encaminhamento: candidato registrado em `NEXT_CONTEXT.md`, sem ADR necessário a priori (é ajuste de prompt, não de portão). (3) A assimetria `@atlas/model-gateway` × `@atlas/tools` (residual 12) — o Model Gateway segue fazendo egress sem `evaluate`/`netRoots` — fica registrada como fato estrutural permanente, não um bug: levá-lo para dentro do portão é decisão própria (endpoint configurado pelo usuário, não recurso escolhido pelo modelo) — encaminhamento: nenhum, candidato nomeado sem SPEC própria. (4) `apps/desktop` sem painel de rede nesta fatia (D17, residual 8) — repetir todo o desenho de consentimento da SPEC-0038 para o eixo de rede é fatia própria — encaminhamento: candidato registrado em `NEXT_CONTEXT.md`/`apps/desktop/CLAUDE.md`.

## [SPEC-0054](specs/SPEC-0054-desktop-environment-observability.md) — Painel `Sistema` no desktop: recursos do host, consumo de tokens e relógio (2026-08-19)

**Descobrimos que...**

O contrato "resultado do trabalho abandonado é descartado por inteiro" (SPEC-0051) precisava de uma exceção deliberada e nomeada (D9): o consumo de tokens de uma operação cancelada **é** contabilizado — o gasto já ocorreu de fato — enquanto os efeitos de domínio (`remember`/`updateConversation`) continuam descartados. A garantia viva em `apps/desktop/CLAUDE.md` já era precisa o bastante para acomodar isso sem reescrita (ela nomeia os dois efeitos descartados, nunca fala em "resultado inteiro"); só o comentário inline do próprio código ("descartado por inteiro") ficou por trás da nuance nova — não bloqueia nada, mas é o tipo de imprecisão que os Padrões Recorrentes já catalogam do lado da prosa absoluta. Descobrimos também, pela primeira vez desde a SPEC-0053, que acrescentar um painel novo ao drawer v3.0 sem tocar o núcleo/layout **não reabre a pendência de smoke visual**: os 8 itens do CA 34 vieram `OK` numa única passada, sem nenhuma rodada reprovada — diferente do padrão de várias fatias anteriores do desktop.

**A arquitetura ajudou porque...**

O padrão `steps?`/`learned?` (SPECs 0014/0020) generalizou de novo, sem desenho novo: `usage?` em `AskResult`/`ConversationTurn`, somado por um helper puro top-level em `@atlas/cognitive` e devolvido por spread condicional — a 3ª vez que o mesmo molde absorve um campo aditivo de saída do Cognitive. O ADR-0025(c) já tinha antecipado exatamente essa via ("quando o Cognitive Core as expuser"), então a Decisão de design D7 não teve alternativa real a pesar. O molde de porta injetável com import único em `main.ts` (Piper/`whisper.cpp`/VAD) generalizou de novo para `systeminformation` (`system-metrics.ts`) sem desenho novo. As três decisões estruturais de fundo (dependência nova, contabilidade de tokens, contrato técnico exato) já tinham sido resolvidas fora da SPEC pelos ADR-0024/ADR-0025 antes dela começar — a origem registrada da própria SPEC (três escaladas resolvidas em 2026-08-18) preveniu o padrão mais caro já catalogado no projeto: decisão estrutural descoberta em plena implementação.

**A arquitetura atrapalhou porque...**

Nada de estrutural. O único atrito visível foi de precisão de comentário (acima), não de desenho — a fatia inteira (dois módulos novos, dois canais IPC, um painel, três packages tocados aditivamente) fechou sem achado bloqueante do `spec-validator` além do próprio CA 34 (smoke humano), que é estrutural ao ambiente de automação, não a esta SPEC.

**Precisamos mudar...**

Nada de obrigatório — registrado como observação, sem encaminhamento próprio: o comentário inline de `core-bridge.ts` sobre o descarte de operação abandonada ("descartado por inteiro") pode ganhar a mesma precisão que a doc viva já tem na próxima SPEC que tocar aquele trecho, nomeando os dois efeitos descartados em vez da formulação absoluta; não justifica SPEC própria.

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

---

**Entradas anteriores (SPEC-0050 e mais antigas):** `LESSONS_LEARNED-ARCHIVE.md`.
