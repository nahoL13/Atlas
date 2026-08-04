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

**Escopo deste arquivo:** o Registro abaixo mantém as **últimas 5 SPECs**. As entradas da SPEC-0044 e anteriores estão em `LESSONS_LEARNED-ARCHIVE.md`, preservadas sem edição (regra 2 intacta — nada é reescrito, só realocado).

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
- **Smoke visual/sonoro das fatias desktop nunca confirmado** — SPEC-0031 a 0046, 13 seguidas. O shell de automação não tem WindowServer, microfone nem os binários Piper/`whisper-cli`. Não bloqueia fechamento documental, mas não conte como verificado.
- **Contrato só sobe a `@atlas/contracts` com 2º consumidor real**, via ADR (ADR-0007). Tipos de uma app só (`StatusSnapshot`, `TurnSnapshot`, `FactSnapshot`) ficam locais.


# Registro

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

## [SPEC-0048](specs/SPEC-0048-desktop-chat-send-ask-serialization.md) — `#chat-send` na serialização de `ask` e comentário desatualizado de `computeDefaultPiperVoiceURI` (2026-08-03)

**Descobrimos que...**

O achado da SPEC-0047 ("`#chat-send` não soma `askInFlight` ao `disabled`") tinha uma segunda camada não nomeada até esta SPEC abrir o código: mesmo corrigindo a condição em `refreshChatControlsForMic()`, o `.finally` do manipulador de `submit` de `#chat-form` tinha **uma segunda origem de cálculo** (`sendButton.disabled = micBusy()`, sem `askInFlight`) que reabriria o botão ao assentar um turno de chat durante um `ask` em voo — reintroduzindo o mesmo defeito por outro caminho, se corrigido só na função. E `disabled` sozinho nunca teria sido suficiente para o CA de guarda de entrada: o harness `jsdom` despacha `submit` diretamente, contornando o atributo do botão, então a garantia real exigiu uma guarda explícita no manipulador — o texto do achado da SPEC-0047 já falava em "**enviado**", não em pixel cinza, mas só ficou óbvio ao tentar escrever o teste RED. O gate arquitetural também achou, de graça na mesma revisão, a direção simétrica não pedida: `#ask-form` não tem guarda nenhuma contra um 2º `ask` ou contra um turno de chat em voo (A3) — mesma classe de defeito, ainda aberta por decisão de escopo, não por desconhecimento.

**A arquitetura ajudou porque...**

A condição já vivia num lugar só nomeado (`refreshChatControlsForMic()`, já compartilhado com `#persona-select` desde as SPECs 0037/0038), então somar `askInFlight` foi uma linha; o padrão "condição em um lugar só, chamada por `refreshPermissionsPanelState()`" (D1) generalizou sem desenho novo. O harness `jsdom` da SPEC-0045/0047, com promessas controláveis de `ask`/`chatSend`, tornou os dois casos novos (CA 7/8) e o de reforço do gate (`ask` rejeitando) triviais de escrever e de observar em RED antes da correção — sem ele, provar a guarda de entrada exigiria mockar `dispatchEvent` manualmente.

**A arquitetura atrapalhou porque...**

Nada de estrutural. O atrito ficou em ler completo antes de escrever: quem só olhasse a linha da condição em `refreshChatControlsForMic()` teria corrigido metade do defeito e deixado o `.finally` reabrir o botão por baixo — a mesma classe "corrigir bloqueante introduz bloqueante novo no mesmo caminho" já catalogada nos Padrões Recorrentes (SPEC-0034/0038/0039), agora no par ask/chat em vez de permissões/Persona.

**Precisamos mudar...**

(1) As duas direções residuais registradas pelo DoD desta SPEC ficam deliberadamente fora: **(d.1) chat → ask** — serializar `#ask-form` contra um turno de chat em voo (direção inversa; decidir se o painel `ask` deve mesmo se bloquear pelo chat é questão de UX própria, não corolário desta correção) — encaminhamento: candidato registrado em `docs/05-context/NEXT_CONTEXT.md`/`apps/desktop/CLAUDE.md`, para uma fatia futura avaliar. **(d.2) ask × ask** — `renderer.js:136-166` (manipulador de `submit` de `#ask-form`) não tem guarda contra `askInFlight`/`chatTurnInFlight`, e `#objective`/`#ask-submit` não entram em nenhuma função de refresh: dois cliques seguidos em "Perguntar" sobem dois Cores concorrentes capazes de executar Tools, achado do gate arquitetural (A3), sem registro em nenhuma doc viva até esta SPEC — encaminhamento: candidato registrado em `docs/05-context/NEXT_CONTEXT.md`/`apps/desktop/CLAUDE.md` para a próxima SPEC de serialização de gestos do painel `ask`. (2) Achado colateral do mesmo gate, não corrigido aqui: o manipulador de `submit` de `#ask-form` (`renderer.js:146-166`) só tem `.finally`, sem `.catch` — uma rejeição de `atlas.ask` vira unhandled rejection e o erro nunca chega ao `#ask-result` — encaminhamento: candidato registrado em `apps/desktop/CLAUDE.md`, para a mesma fatia futura do item (d.2) avaliar junto. (3) Limite estrutural reafirmado, não fechado: a serialização segue sendo garantia do **renderer**; o `core-bridge` não rastreia `sendChatTurn` em `inFlightOperations` (só `selectPermissionRoots`) — encaminhamento: fora de escopo por decisão explícita da SPEC (mudaria a garantia documentada em "Rastreio de operação em voo" e afetaria recusas de `selectPermissionRoots`); registrado como candidato em `apps/desktop/CLAUDE.md` para SPEC própria, caso o produto exija a garantia estrutural no main process.

## [SPEC-0047](specs/SPEC-0047-renderer-parity-gate-and-panel-coverage.md) — Gate de paridade generalizado a `piper-tts.ts`/`stt-engine.ts` e cobertura comportamental dos painéis no harness (2026-08-03)

**Descobrimos que...**

A 1ª passada do `architecture-reviewer` vetou a SPEC só por defeitos mecânicos no **texto normativo**, não de desenho: Critérios de Aceitação escritos como estado absoluto do repositório (`git diff --name-only` sobre o repositório inteiro) reprovariam a SPEC por diff alheio — havia resíduo não commitado da própria correção pós-fecho da SPEC-0046 (`c1b9ba3`) na árvore no momento em que o rascunho foi escrito; a contagem absoluta de testes citada no rascunho ficou obsoleta entre o rascunho e a revisão (938 → 939, por causa de outra sessão); e dois CAs (8/9, as provas negativas) exigiam mutar `src/` para ver o gate ficar vermelho, exatamente o que as Restrições e o Checklist da mesma SPEC proibiam — um texto autocontraditório que teria empurrado o `spec-implementer` a pular a prova ou parar por contradição. Descobrimos também, na execução: a 1ª invocação do `spec-implementer` foi interrompida a meio da tarefa, deixando a maior parte do código já na árvore (não commitado); a 2ª invocação encontrou o trabalho pronto e fez majoritariamente verificação — por isso o `spec-validator` foi instruído a **reproduzir** as três provas negativas ele mesmo, em vez de aceitar o relato, e reproduziu, com as mensagens de falha esperadas batendo.

**A arquitetura ajudou porque...**

O campo `moduleSource` que o registro de paridade já carregava desde a SPEC-0045 (por causa de `PIPER_VOICE_PREFIX`) generalizou para uma lista de três módulos-fonte vigiados sem mudança de forma — só uma lista maior e mais entradas em `NOT_MIRRORED`; o harness `jsdom` da SPEC-0045 absorveu os cinco painéis sem precisar de opção nova além de controlar a resolução de `chat.send`/`ask` a partir do teste (Frente 5). O invariante "em recusa, o estado visível volta do estado real e nada é perdido em silêncio" — já provado em produção pelo `core-bridge` desde as SPECs 0034/0037/0038 — bastou como roteiro para os casos de recusa dos painéis, sem precisar de desenho novo.

**A arquitetura atrapalhou porque...**

Nada de estrutural. O atrito ficou inteiro em precisão de registro dos Critérios de Aceitação, como descrito acima — a mesma classe de defeito ("garantia em prosa incompleta/absoluta") já catalogada nos Padrões Recorrentes, agora manifestada em critério de **verificação**, não de comportamento do produto.

**Precisamos mudar...**

(1) CA de diff e de contagem de testes devem ser ancorados a um commit-base e a delta sobre uma base observada, nunca ao estado absoluto do repositório — encaminhamento: já aplicado nesta própria SPEC (D10, "Convenção de medição") e deve ser o padrão para toda SPEC futura de higiene de teste/verificação; se o padrão se repetir, revisar o `SPEC-TEMPLATE.md`. (2) Toda SPEC com prova negativa obrigatória precisa declarar a mutação temporária de `src/` como exceção sancionada nos três lugares onde a regra de somente-leitura aparece (CA, Restrições, Checklist) — encaminhamento: já aplicado nesta SPEC (D11); registrado aqui para a próxima SPEC de gate mecânico citar o precedente em vez de redescobrir a contradição. (3) Implementação de origem não confirmada (sessão anterior interrompida, trabalho já na árvore sem relato confiável) exige verificação independente reforçada pelo validador — não revisão de relatório — encaminhamento: nenhuma mudança de processo além do já aplicado nesta sessão; registrado como precedente. (4) Resíduo documental deliberado: o comentário em `apps/desktop/src/renderer/renderer.js:415-419` ("resíduo sem cobertura automatizada" sobre `computeDefaultPiperVoiceURI`) ficou factualmente desatualizado por decisão (D5, CA de diff vazio em `src/` prevalece) — encaminhamento: corrigir na próxima fatia que legitimamente toque `renderer.js`. (5) O harness lê **um** `renderer.js` do disco; esta SPEC elevou de 4 para 8 os arquivos de teste dependentes dessa premissa, encarecendo a fatia futura de quebrar `renderer.js` em arquivos menores (SPEC-0042/D8) — encaminhamento: já registrado em `apps/desktop/CLAUDE.md`/`NEXT_CONTEXT.md`, para a SPEC que atacar o D8 orçar esse custo. (6) Achado real, não corrigido por decisão de escopo: `#chat-send` calcula `disabled` sem somar `askInFlight` (`renderer.js:966-975`), então um turno de chat pode ser enviado com um `ask` ainda em voo — encaminhamento: candidato registrado em `apps/desktop/CLAUDE.md`/`NEXT_CONTEXT.md` para uma fatia futura que toque `src/`. (7) O eixo residual de D2 permanece: o gate vigia só três módulos nomeados; réplica de lógica de um módulo fora dessa lista segue protegida só por convenção — encaminhamento: nenhuma ação agora, registrado como limite conhecido nas Observações da própria SPEC e em `apps/desktop/CLAUDE.md`.

## [SPEC-0046](specs/SPEC-0046-desktop-voice-input-stt.md) — Desktop: entrada de voz (STT) no chat, push-to-talk sobre `whisper.cpp` local (2026-08-01)

**Descobrimos que...**

O 1º veto do `architecture-reviewer` (6 bloqueantes) não foi sobre desenho, e sim sobre um defeito que teria deixado a fatia inteira **inoperante com os Critérios de Aceitação passando verde**: `captureInFlight` era uma entrada obrigatória da política de permissão de microfone sem nenhum produtor declarado na v1.1 — a política negaria a concessão sempre, porque nada jamais marcava a janela de captura como aberta. Um CA que só verifica o **consumidor** de um dado (a política nega corretamente quando `captureInFlight` é falso) sem verificar se existe um **produtor** real para esse dado passa mecanicamente mesmo com a feature inteira quebrada — a mesma classe de risco do "garantia em prosa incompleta" já visto nas SPECs 0034/0038/0039, mas na variante mais severa possível (não um resíduo, a fatia toda). Descobrimos também dois números pinados que colidiam na v1.1: teto de gravação de 60s e timeout de transcrição fixo em 60s, sem processo quente — nos piores casos o timeout expiraria antes mesmo de a gravação (que ainda precisa ser transcrita inteira) terminar de ser processada; resolvido com um orçamento assimétrico (`clamp(20s + 5×duração, 20s, 180s)`, gravação reduzida a 30s) que dá margem proporcional ao tamanho real do áudio. E, pela 2ª vez nesta SPEC (não só uma), uma tabela declarada "exaustiva" não era: a v1.1 não cobria fronteira de áudio inválida, a v1.2 não cobria falha de IO — ambas pegas em rodadas sucessivas do gate, não na primeira.

**A arquitetura ajudou porque...**

O molde estrutural inteiro (subprocesso local via porta injetável, argv em array, resolução de recursos em 3 níveis, artefato temporário sempre removido, fallback fail-closed) já vinha pago e validado pelo ADR-0021/SPEC-0040 do lado da saída — o ADR-0022 é a aplicação simétrica ao sentido oposto do fluxo, e nenhum padrão novo precisou ser inventado, só o contrato do binário e do modelo. O harness `jsdom` da SPEC-0045 (relógio injetável, dublês de mídia) foi o que tornou possível testar a captura por `ScriptProcessorNode`/`getUserMedia`/permissão de microfone inteiramente sem hardware — sem ele, esta SPEC não teria como provar o glue do renderer. A decisão consciente de **não** introduzir processo de longa duração (divergência deliberada do Piper, D8/nota de desempenho do ADR-0022) evitou reabrir a complexidade de reciclagem de `piper-tts.ts` num caso onde o custo relativo do recarregamento é muito menor.

**A arquitetura atrapalhou porque...**

Nada de estrutural — o padrão inteiro já estava validado pelo ADR-0021. O atrito ficou em precisão de registro: uma divergência textual dentro da própria SPEC (`Int16Array` em "Interfaces Necessárias" × `ArrayBuffer` em D12) sobreviveu ao rascunho e ao gate, só corrigida pelo `spec-closer` no fechamento; e uma lacuna de convenção — `eslint.config.js` (editado para os 4 globals novos do renderer) não constava dos "Arquivos Esperados", o mesmo omitido em SPECs de voz anteriores, sem que ninguém tivesse notado até agora. Atrito de ambiente: `pnpm exec eslint` via RTK devolveu saída truncada — foi preciso `./node_modules/.bin/eslint` direto para ver as mensagens reais, o mesmo tipo de limitação de proxy já registrado para `grep`.

**Precisamos mudar...**

(1) CA que verifica só o consumidor de um dado obrigatório sem confirmar a existência de um produtor é o tipo de lacuna mais perigoso que o gate já pegou neste projeto — encaminhamento: nenhuma mudança estrutural pedida pelo `architecture-reviewer` além da correção já aplicada; registrar aqui como alerta explícito para o próprio `architecture-reviewer` em revisões futuras que envolvam estado booleano de "janela aberta"/"operação em voo". (2) `eslint.config.js` deveria constar como convenção explícita em "Arquivos Esperados" sempre que uma SPEC adicionar globals novos ao renderer — encaminhamento: nenhum ADR necessário; registrado aqui para a próxima SPEC de voz/renderer citar `eslint.config.js` explicitamente no Escopo. (3) A fatia inteira segue sem confirmação em ambiente real (microfone, binário `whisper-cli`, diálogo nativo de permissão do macOS, negativa do usuário, eco com alto-falante aberto) — encaminhamento: já registrado em `docs/05-context/NEXT_CONTEXT.md` e `apps/desktop/CLAUDE.md`, ampliando a pendência de smoke visual desde a SPEC-0031 com o eixo de áudio de entrada. (4) *(atualizado após o fechamento — 1ª execução real da app)* O CA 20 desta SPEC ("asserção estática de fonte" sobre `main.ts`, provando que `setPermissionRequestHandler`/`setPermissionCheckHandler` estão *escritas* no arquivo) tinha um ponto cego exato — **posicionamento no ciclo de vida do Electron** — e foi exatamente esse ponto cego que quebrou a app na 1ª abertura real: as duas chamadas de `session.defaultSession.*` estavam no topo do módulo, avaliadas na importação, quando `session.defaultSession` só pode ser acessado depois de `app.whenReady()` (`TypeError: Session can only be received when app is ready`). O teste provava que o texto existia, não que ele executava no momento certo — passou verde com a app inteira inoperante. Corrigido movendo as duas chamadas para dentro de uma função nova (`registerMediaPermissionHandlers`), invocada de dentro do callback de `app.whenReady()` antes de `createWindow()`; o CA 20 foi reforçado (sem introduzir `vi.mock('electron')`, D16 intacto) para provar também o posicionamento: `session.defaultSession` só aparece dentro do corpo dessa função (nunca solto em nível de módulo, onde uma referência executaria na importação — declarações de função não rodam o corpo ao serem definidas), e a função só é chamada uma vez, dentro do bloco de `whenReady`. Confirmado por regressão: revertendo a correção, o teste reforçado fica vermelho; com a correção, verde. Encaminhamento: esta é matéria-prima direta para a pendência de smoke nunca confirmado (achado 3 acima, acumulada desde a SPEC-0031) — asserção estática de fonte é um substituto aceitável de teste de arranque só até o ponto em que ela consegue provar posicionamento no ciclo de vida, não só presença textual; toda SPEC futura que registrar handlers/portas do Electron condicionados a `app.whenReady()` deveria, por convenção, provar a mesma coisa (corpo isolado numa função nomeada + prova de que a única chamada mora dentro do callback de `whenReady`), não só a presença do texto.

---

**Entradas anteriores (SPEC-0045 e mais antigas):** `LESSONS_LEARNED-ARCHIVE.md`.
