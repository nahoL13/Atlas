# ADR-0023 — Conversa por voz contínua (hands-free) no desktop: auto-envio sob salvaguarda e VAD como detector de fim de fala

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-08-05

---

# Contexto

O PRD exige interação por voz (*Requisitos Funcionais → Comunicação*), lista "suporte básico à voz" no *Escopo Inicial* e — o ponto que este ADR ataca — fala explicitamente em **"conversas contínuas"**. Até aqui as duas pontas da voz existem, mas **separadas por gestos manuais**:

- **Saída** por Piper ([ADR-0021](ADR-0021-piper-tts-local-voice-engine.md), SPECs 0040/0041/0043), acionada por um botão "🔊 Ouvir" por resposta.
- **Entrada** por `whisper.cpp` ([ADR-0022](ADR-0022-whisper-cpp-local-stt-engine.md), SPEC-0046), acionada por push-to-talk, com a transcrição sempre aterrissando no campo de entrada para revisão.
- **Chat multi-turno** com o Core vivo entre turnos (SPEC-0033).

As três peças existem e funcionam; o que não existe é o **laço** entre elas. Hoje uma conversa falada custa quatro gestos por turno: apertar para falar, revisar o texto, enviar, clicar para ouvir. Isso não é conversa — é um formulário operado por voz.

O usuário pediu explicitamente o laço contínuo ("falo, ele transcreve e envia sozinho, responde e já fala a resposta em voz alta, sem clicar em nada entre os turnos") e recusou explicitamente o meio-termo de push-to-talk com envio direto.

**Este ADR existe porque esse pedido colide de frente com uma cláusula de Decisão de um ADR aceito.** O ADR-0022, em *Alternativas Consideradas*, rejeitou o auto-envio **"como parte desta decisão, e não apenas como detalhe de UI"**, apoiado nos Artigos 7 e 13 e na Restrição do PRD de não executar sem autorização adequada. Reafirmado no [Roadmap](../04-engineering/Roadmap.md) (l. 156) e no CA 30 da SPEC-0046. Reverter uma cláusula assim não é escolha de `spec-drafter` nem de SPEC: é a classe de mudança que a Emenda v1.1 da Constituição reserva à decisão humana.

Somam-se dois gatilhos independentes, ambos reservados a ADR próprio pelo ADR-0022 (*Candidatos futuros*) e pelo Roadmap (l. 157): **microfone aberto entre turnos** e **motor de detecção distinto do de transcrição**.

Este ADR **supersede parcialmente o ADR-0022** — apenas na cláusula de auto-envio de *Alternativas Consideradas*, e apenas dentro do modo hands-free aqui definido. Todo o resto do ADR-0022 (motor, distribuição empacotada, PT-BR fixo, offline sem exceção, nada persistido) sai **intacto**, e continua valendo integralmente.

---

# Decisão

**(a) O modo hands-free é um estado explícito, desligado por default, com entrada e saída por um único gesto do usuário.** Um botão alterna o modo: ao ligar, o microfone abre e permanece aberto até o usuário desligá-lo — não há push-to-talk dentro do modo. Enquanto o modo está desligado, nada muda: o push-to-talk da SPEC-0046 e o botão "🔊 Ouvir" das SPECs 0035/0040 seguem exatamente como estão. O modo nunca liga sozinho, não é persistido entre execuções da app, e um indicador visível sinaliza sempre que o microfone estiver de fato captando.

**(b) Dentro do modo, o auto-envio é permitido — e essa é a reversão deliberada do ADR-0022.** Detectado o fim da fala, a transcrição segue direto ao Core, sem revisão prévia e sem confirmação. A salvaguarda que substitui a revisão humana tem três camadas, e o ADR só se sustenta com as três:

1. **O `ConfirmPort` permanece intocado.** Toda Tool destrutiva segue atrás do diálogo nativo fail-closed (ADR-0013, SPEC-0032). O pior desfecho de uma transcrição errada é uma *resposta* errada, nunca um efeito colateral não autorizado — que é precisamente o dano que os Artigos 7 e 13 protegem. O ADR-0022 tratou auto-envio e execução não autorizada como a mesma coisa; **não são**, e essa é a distinção que autoriza a reversão.
2. **O gesto de desligar o modo é o freio, e é sempre alcançável.** Ele fecha o microfone imediatamente, e nunca depende de haver ou não trabalho em voo.
3. **O modo é opt-in explícito e visivelmente sinalizado** (Decisão (a)) — o usuário sabe, a cada momento, que está num regime de envio automático.

**(c) O fim de fala é detectado por um VAD (*Voice Activity Detection*), não por limiar de energia.** O detector classifica janelas curtas de áudio como voz humana ou não-voz; o turno fecha após **3 segundos contínuos de ausência de voz**. A alternativa de limiar de energia foi avaliada e rejeitada (ver *Alternativas Consideradas*): ela falha exatamente no cenário que motiva o modo. O detector fica atrás de **porta injetável**, mesmo molde do executor de subprocesso do ADR-0021(a)/0022(a), de modo que trocá-lo depois seja local.

**(d) O VAD roda em WASM no renderer — exceção explícita e delimitada ao ADR-0022(a).** O ADR-0022(a) confinou a inferência ao main process; esta decisão abre uma exceção **só para o VAD**, justificada por três razões cumulativas: (i) o VAD não transcreve nem interpreta conteúdo — responde a uma pergunta binária, "há voz nesta janela?", e portanto não é a classe de processamento que motivou o confinamento; (ii) o áudio já está no renderer (`ScriptProcessorNode`, SPEC-0046) e **não sai dele** para ser analisado, o que é mais protetor de privacidade que enviá-lo ao main; (iii) a alternativa fiel exigiria binding nativo (`onnxruntime-node`) — a terceira superfície de build por plataforma, e do tipo que o próprio ADR-0022 rejeitou no `vosk` por não ser "binário + argv" — mais um fluxo contínuo de frames renderer→main que hoje não existe (todos os canais IPC são `invoke`/`handle` pontuais). **A transcrição segue integralmente no main process; nada em ADR-0022(a) muda para o `whisper.cpp`.**

**(e) O microfone fecha durante o processamento e durante a fala do assistente.** Mesmo com o modo ligado, a captura é suspensa enquanto o Core processa o turno e enquanto o TTS está falando, e só é retomada quando a resposta termina. Isto não é detalhe de implementação: é o que mantém o modo **fora da classe de privacidade do wake word** (microfone permanentemente ligado), e é também a mitigação de eco escolhida — com o microfone fechado durante a fala, o assistente não pode se transcrever.

**(f) As garantias do ADR-0022 (c) e (d) valem integralmente e sem exceção.** Nenhuma chamada de rede em nenhum caminho — o modelo de VAD é empacotado, nunca baixado. Nenhum áudio ou transcrição persistido, em nenhum buffer de diagnóstico, log ou telemetria. O buffer de detecção vive em memória e morre com o turno.

---

# Decisões de produto (resolvidas em 2026-08-05)

1. **Modelo de VAD: Silero, empacotado.** ~1–2 MB, ordens de grandeza menor que o `small` quantizado do `whisper.cpp` — o custo marginal de instalador é desprezível perto do que os ADRs 0021/0022 já pagaram. Empacotado nos recursos, como o Piper e o whisper; **download sob demanda recusado**, pelo mesmo motivo da Decisão de produto (1) do ADR-0022: exigiria abrir exceção à garantia offline, e essa exceção não foi concedida.
2. **Janela de silêncio: 3 segundos.** Valor pedido explicitamente pelo usuário. Curto o bastante para a conversa não arrastar, longo o bastante para pensar no meio de uma frase. Fixado como dado da SPEC, não como constante espalhada.
3. **O botão de mudo é o próprio toggle do modo, e ele muta a entrada.** Avaliadas as três leituras possíveis (mutar o microfone, mutar a saída de voz, ou dois controles separados) e escolhida a primeira: o usuário descreveu o gesto como "clico e abre, clico e muta", ou seja, um controle só, sobre a escuta. Interromper a fala do assistente é **função distinta** e não entra nesta fatia — hoje o TTS já é por resposta e o modo fecha o microfone enquanto ele fala (Decisão (e)), então não há disputa entre os dois.
4. **Sem barge-in (interromper o assistente falando).** Consequência direta de (e): com o microfone fechado durante o TTS, não há como interromper por voz. É a troca aceita para eliminar o eco e conter o escopo de privacidade. Candidato futuro, com custo próprio (exigiria microfone aberto durante a fala e cancelamento de áudio).

---

# Consequências

Positivas:

- Fecha a exigência de **"conversas contínuas"** do PRD, que as SPECs 0033/0040/0046 deixaram a um laço de distância.
- Nenhum módulo novo, nenhuma Tool nova, nenhum campo novo em `Persona`, nenhuma alteração em `packages/*` nem em `@atlas/contracts`. A fatia é composição de peças já pagas, confinada a `apps/desktop`.
- O modo degradado é natural: sem `whisper.cpp` ou sem Piper disponível, o toggle fica **desabilitado com o motivo visível** (achado A2 da SPEC-0035), nunca ativo-porém-mudo.
- A distinção que este ADR formaliza — **auto-envio ≠ execução não autorizada** — é reutilizável, e é a peça que faltava para o Roadmap tratar voz como modalidade de primeira classe em vez de acessório.

Custos e riscos:

- **Reverte parcialmente um ADR aceito há 4 dias.** Registrado sem eufemismo: o ADR-0022 errou ao tratar auto-envio e execução não autorizada como o mesmo risco. O erro era conservador, e a correção só é segura porque o `ConfirmPort` já existia e foi validado.
- **Terceiro artefato de modelo empacotado** (Piper + whisper + Silero), e o **primeiro** a rodar inferência no renderer — exceção que precisa ser lida junto do ADR-0022(a), nunca isolada, sob risco de virar precedente para mover a transcrição para lá.
- **Falso disparo de fim de fala** continua possível: pausa longa no meio do raciocínio envia frase pela metade. Mitigado pelos 3s e pelo fato de o Core responder em conversa (o usuário emenda no turno seguinte), não eliminado.
- **Nada disso foi exercitado com microfone real.** A pendência de smoke aberta desde a SPEC-0040 e ampliada pela SPEC-0046 cresce de novo, e agora inclui o item mais difícil de dublar: um laço de conversa em tempo real.
- **Sem barge-in**, o usuário espera a resposta terminar de ser falada para poder falar de novo — perceptível em respostas longas.

---

# Alternativas Consideradas

**Manter o ADR-0022 e entregar push-to-talk com envio direto.** Rejeitada pelo usuário explicitamente, duas vezes nesta decisão. Tecnicamente seria mais barata (nenhum VAD, nenhum microfone aberto entre turnos), mas ainda assim tocaria a cláusula de auto-envio — ou seja, pagaria parte do custo político sem entregar a conversa. Meio-termo que não é meio de nada.

**Janela de veto com contador visível antes de enviar.** A transcrição apareceria e um contador de ~2s correria antes do envio, abortável por qualquer gesto. Rejeitada: daria ao ADR um argumento mais confortável ("revisão humana com ônus invertido, não abolida"), mas acrescenta latência fixa a **todo** turno para proteger contra um dano que a camada 1 da Decisão (b) já contém, e reintroduz na tela exatamente o passo que o modo existe para eliminar. Registrada porque é a alternativa que um revisor conservador proporá, e a resposta é a distinção auto-envio ≠ execução não autorizada.

**Hands-free apenas em modo leitura (`writeRoots` vazio enquanto o modo está ligado).** Rejeitada: seria a opção mais segura, e amputaria capacidade exatamente no modo de uso mais natural — pedir por voz que algo seja escrito é o caso de uso óbvio. Além disso, degrada a Persona única (Artigo 7): o assistente passaria a poder menos dependendo de *como* o usuário fala com ele, o que é vazar modalidade de entrada para dentro da capacidade — o mesmo erro que o ADR-0022(b) evitou ao recusar a Tool de transcrição.

**Detecção de fim de fala por limiar de energia no renderer.** Rejeitada, apesar de custar zero dependências e ser trivial de testar com buffers sintéticos. Um limiar mede volume, não conteúdo: ruído constante (ar-condicionado, ventilador, música, teclado) mantém a energia acima do limiar e **o turno nunca fecha**, caindo sempre no teto de duração; e fala baixa é lida como silêncio, cortando frases ao meio. Falha precisamente no cenário que torna a conversa contínua desejável — usar o assistente enquanto se faz outra coisa, num ambiente vivo. Trocar o modo funcionar por economizar ~2 MB não passa no teste da Constituição. **Permanece como fallback natural** caso o VAD se mostre indisponível, atrás da mesma porta injetável da Decisão (c).

**`onnxruntime-node` no main process, fiel ao ADR-0022(a).** Rejeitada pelas três razões cumulativas da Decisão (d). Registrada aqui porque é a alternativa arquiteturalmente mais "correta" na leitura literal do ADR-0022, e a decisão de não seguí-la é consciente e delimitada — se algum dia o VAD passar a fazer mais que classificação binária, esta escolha deve ser reaberta.

**Microfone aberto o modo inteiro, inclusive durante a fala do assistente (com barge-in).** Rejeitada nesta fatia: é a versão mais natural de usar, e é também a que empurra o modo para a classe de privacidade do wake word, exige cancelamento de eco (o assistente se transcreveria) e amplia a superfície de smoke não verificado. Adiada como candidato futuro, não descartada.

---

# Candidatos futuros (fora desta fatia)

- **Barge-in** — interromper a fala do assistente falando por cima. Exige microfone aberto durante o TTS e cancelamento de eco.
- **Wake word / ativação por voz.** Este ADR **não** a autoriza nem a aproxima: o microfone aqui só abre por gesto explícito e fecha por gesto explícito. A reserva do ADR-0022 e do Roadmap (l. 157) segue de pé, com ADR próprio.
- **Ditado ao vivo (transcrição incremental)** e **processo de longa duração para STT** — já listados pelo ADR-0022, e agora mais atraentes: com VAD no renderer, o gatilho de segmentação incremental passa a existir de graça.
- **Ajuste da janela de silêncio pelo usuário**, se os 3s fixos se mostrarem errados em uso real. Extensão da Decisão de produto (2), sem mudança estrutural.

---

# Observações

- **Nota de escopo.** O **contrato técnico exato** — versão e origem do modelo Silero, formato e cadência das janelas de análise, limiar e histerese do classificador, layout dos recursos em disco, máquina de estados do modo, interação com `cancelInFlightOperation`/`hasInFlightOperation` (SPECs 0050/0051) e com a quarentena de sessão, e a tabela de desfechos — é dado inteiramente pela SPEC que consumir este ADR, **não** duplicado aqui. Mesmo enquadramento que os ADRs 0021 e 0022 adotaram em relação às SPECs 0040 e 0046.
- **Relação com o ADR-0022:** supersede parcial, restrito à cláusula de auto-envio de *Alternativas Consideradas* e ao escopo do modo hands-free. As Decisões (a), (b), (c) e (d) do ADR-0022 e suas três Decisões de produto permanecem em vigor sem alteração. A cláusula revertida deve ser lida com a nota de reversão apontando para cá.
- Decisões humanas desta sessão (2026-08-05): laço contínuo em vez de push-to-talk com envio direto; microfone aberto só no modo ligado, com pausas; VAD real já nesta fatia em vez de adiado; Silero em WASM no renderer em vez de ONNX nativo no main; envio direto em vez de contador de veto; botão de mudo como toggle único sobre a escuta.

---

## Nota de implementação (SPEC-0052, 2026-08-06)

Este ADR foi consumido integralmente pela [SPEC-0052](../implementation/specs/SPEC-0052-desktop-hands-free-voice-conversation.md), que entregou o modo hands-free descrito nas Decisões (a)-(f) acima. **Nenhuma Decisão deste ADR foi alterada** — este registro é só rastreabilidade e um ponto de referência para quem chegar aqui depois.

**Rastreabilidade ao Artigo 8, ausente da redação original deste ADR.** O artigo que efetivamente autoriza a reversão da cláusula de auto-envio do ADR-0022 é o **Artigo 8** da Constituição — "nenhuma ação potencialmente destrutiva sem autorização explícita" —, não uma leitura ampla de "envio de texto sem revisão". É por isso que a distinção da Decisão (b) (auto-envio ≠ execução não autorizada) se sustenta: o `ConfirmPort` (ADR-0013) segue intocado por esta fatia, então nenhuma ação destrutiva deixa de ser autorizada explicitamente — o pior desfecho de uma transcrição errada continua sendo uma *resposta* errada, nunca um efeito colateral não autorizado. Este parágrafo preenche a lacuna apontada pelo gate da SPEC-0052: a rastreabilidade ao Artigo 8 estava implícita na Decisão (b), mas nunca citada por nome.

**O que a SPEC entregou, resumido:** máquina de estados de 9 estados × 18 eventos (`apps/desktop/src/hands-free.ts`), detector Silero VAD v5 sobre `onnxruntime-web` v1.20.1 wasm-only atrás de porta injetável com ponto de criação único no glue (`VoiceActivityDetector`), microfone comprovadamente fechado em `transcribing`/`sending`/`thinking`/`speaking`, freio (desligar o toggle) alcançável em qualquer um dos 9 estados, auto-envio pelo mesmo `submit` de `#chat-form` que os demais gestos já usam (sem caminho de envio duplicado), e modo degradado explícito reavaliado nos gatilhos assíncronos de disponibilidade (STT/VAD/voz de saída). Nenhum microfone, áudio ou modelo real foi exercitado (pendência de smoke que já vinha desde a SPEC-0040, registrada na SPEC-0052).
