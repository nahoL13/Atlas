# SPEC-0052 — Conversa por voz contínua (modo hands-free) no desktop

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0052

---

**Título**

Modo hands-free no `apps/desktop`: microfone aberto entre turnos sob toggle explícito, fim de fala detectado por VAD Silero em WASM no renderer, auto-envio da transcrição ao chat e resposta falada — com o microfone fechado durante o processamento e durante a fala

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

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 2 — 2.3 Voz` (l. 151–157), **como extensão de um item hoje marcado "entregue por inteiro"**.

Registro explícito de exceção consciente, conforme o template: o item 2.3 foi fechado pela SPEC-0046 nas duas pontas (saída e entrada), e o Roadmap **não** tem hoje linha para "conversa contínua". A exigência que esta SPEC consome vive no PRD (*Requisitos Funcionais → Comunicação*: "O sistema deve manter conversas contínuas") e foi formalizada pelo [ADR-0023](../../06-adr/ADR-0023-hands-free-voice-conversation.md).

**Escopo obrigatório do `doc-sync` no fecho** (achado A6 do gate; ver D22), não opcional:

1. **acrescentar** ao item 2.3 a linha de conversa contínua apontando para esta SPEC e para o ADR-0023;
2. **qualificar a l. 156**, que hoje afirma sem ressalva que a transcrição é "nunca enviada automaticamente" — passa a valer **fora do modo hands-free**, com a nota de supersede parcial apontando para o ADR-0023;
3. **revisar o cabeçalho do item 2.3** ("entregue por inteiro"), para que ele não contradiga a linha nova.

Sem os três, dois documentos vivos ficariam em contradição direta (Artigo 1, invariante 8).

Esta SPEC **não** consome a linha de wake word (l. 157), que segue candidato não comprometido — ver *Fora do Escopo* e D3.

---

# Objetivo

Quando esta SPEC estiver concluída deverá existir, no `apps/desktop`:

1. Um **modo hands-free** ligado e desligado por um **único toggle explícito**, desligado por default, nunca ligado sozinho, nunca persistido entre execuções da app, com um **indicador visível** do que o modo está fazendo a cada instante — em especial, de quando o microfone está de fato captando.
2. Um **laço de conversa completo** dentro do modo: o usuário fala → o fim da fala é detectado → a transcrição é **enviada automaticamente** ao chat → a resposta é **falada em voz alta** → o microfone reabre para o turno seguinte. Nenhum clique entre turnos.
3. Um **detector de fim de fala (VAD)** real — Silero, em WASM, no renderer —, atrás de **porta injetável de ponto de criação único**, que fecha o turno após **3 segundos contínuos de ausência de voz**, com histerese e mínimo de fala pinados nesta SPEC.
4. **Microfone comprovadamente fechado** (tracks paradas, `AudioContext` fechado, janela de captura encerrada) enquanto o Core processa o turno e enquanto o assistente fala — a mitigação de eco e o que mantém o modo fora da classe de privacidade do wake word.
5. **Nenhum estado sem saída garantida**: todo estado longo (`transcribing`, `thinking`, `speaking`) tem desfecho por evento **ou** por watchdog, e toda pré-condição de envio é verificada antes da transição — o modo nunca fica preso com o indicador mentindo.
6. Um **freio sempre alcançável**: desligar o modo fecha o microfone na hora e nunca depende de haver ou não trabalho em voo; com um turno em voo, o mesmo gesto aciona o cancelamento já entregue pela SPEC-0051.
7. **Modo degradado explícito e reavaliado**: sem motor de transcrição, sem detector de voz ou sem nenhuma saída de voz disponível, o toggle fica **desabilitado com o motivo visível** — e a habilitação é **recalculada nos gatilhos assíncronos** já documentados (`voiceschanged`, chegada do catálogo/disponibilidade por IPC), nunca resolvida point-in-time no load.
8. **Cobertura automatizada sem microfone, sem áudio real e sem o modelo real**: máquina de estados e segmentação de turno são um módulo puro testado por tabela; o laço inteiro é exercitado no harness jsdom com o detector injetado pela porta.

Nenhum package de `packages/*` é alterado. `@atlas/contracts` não é tocado. `src/core-bridge.ts`, `src/speech-output.ts`, `src/piper-tts.ts`, `src/stt-engine.ts` e `src/media-permission.ts` saem com **diff vazio**. Nenhum módulo novo do Module Catalog é criado.

---

# Motivação

**O PRD pede, com estas palavras.** *Requisitos Funcionais → Comunicação*: "O sistema deve manter **conversas contínuas**." As três peças da conversa falada já existem — chat multi-turno com o Core vivo (SPEC-0033), saída neural local (SPECs 0040/0041/0043) e entrada local (SPEC-0046) —, mas **separadas por gestos manuais**: hoje uma conversa falada custa quatro gestos por turno. O que falta não é uma peça, é o **laço** entre elas.

**A decisão humana já foi tomada e está registrada.** O laço colide com uma cláusula de *Alternativas Consideradas* do ADR-0022 (auto-envio recusado "como parte desta decisão") e depende de dois gatilhos que o próprio ADR-0022 reservou a ADR próprio (microfone aberto entre turnos, motor de detecção distinto do de transcrição). Todos foram resolvidos em 2026-08-05 pelo [ADR-0023](../../06-adr/ADR-0023-hands-free-voice-conversation.md) (`Accepted`), que supersede **parcialmente** o ADR-0022 — só na cláusula de auto-envio e só dentro deste modo. Esta SPEC consome esse ADR; não reabre nenhuma de suas decisões.

**O artigo que efetivamente autoriza a reversão é o 8.** O Artigo 8 da Constituição proíbe **ação potencialmente destrutiva sem autorização explícita** — não "envio de texto sem revisão". É por isso que a distinção do ADR-0023(b) (auto-envio ≠ execução não autorizada) se sustenta: o `ConfirmPort` fail-closed sai **intocado** desta fatia, então nenhuma ação destrutiva deixa de ser autorizada explicitamente, e o pior desfecho de uma transcrição errada continua sendo uma *resposta* errada. Registrado aqui porque essa rastreabilidade faltava tanto nesta SPEC quanto no ADR-0023 (achado do gate).

**O Module Catalog já tem dono, e é o mesmo da SPEC-0046.** *Input Gateway* — "Receber entradas do usuário e convertê-las para um formato comum", "Pode receber: texto; **voz**; atalhos", localizado na "aplicação cliente correspondente". O modo hands-free é uma superfície do Input Gateway do desktop, mais o Output Gateway já existente para a fala da resposta. Nenhum vácuo de responsabilidade, nenhum componente novo.

---

# Referências

- [ADR-0023](../../06-adr/ADR-0023-hands-free-voice-conversation.md) — **decisão fundante desta SPEC**: modo como toggle explícito (a), auto-envio sob salvaguarda de três camadas (b), VAD atrás de porta injetável (c), Silero em WASM no renderer como exceção delimitada ao ADR-0022(a) (d), microfone fechado no processamento e na fala (e), garantias offline e de não-persistência integrais (f); decisões de produto 1–4
- [ADR-0022](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) — motor de STT (intacto, exceto a cláusula de auto-envio superseded parcialmente pelo ADR-0023)
- [ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — motor de TTS neural local; (c) Web Speech API como rede de segurança interna
- [ADR-0019](../../06-adr/ADR-0019-desktop-electron-stack.md) — stack do desktop, `contextIsolation`/`nodeIntegration`, sem bundler (não pina CSP alguma)
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) — portão de execução e `confirm`; camada 1 da salvaguarda do ADR-0023(b)
- [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) — vínculo Persona↔voz de saída (consumido sem alteração)
- [ADR-0009](../../06-adr/ADR-0009-context-service-value-store.md) — sessão de conversa mediada pela aplicação
- [PRD](../../02-product/ProductRequirementsDocument.md) — *Comunicação* ("interação por voz", "**conversas contínuas**"), *Escopo Inicial* ("suporte básico à voz"), *Restrições*, *Critérios de Qualidade*
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 1, 2, 4, 7, **8** (autorização explícita para ação destrutiva — a base real da reversão de auto-envio), 9, 11, 13, 14, 15 + Emendas v1.1/v1.2
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — *Input Gateway* / *Output Gateway*; *Componentes futuros previstos* → "Voice Service" (não criado, ver D2)
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.3 (l. 151–157; l. 156 qualificada no fecho, ver D22)
- [SPEC-0033](./SPEC-0033-desktop-visual-chat.md) — chat multi-turno com o Core vivo (superfície onde o laço acontece)
- [SPEC-0040](./SPEC-0040-desktop-piper-neural-tts.md) / [SPEC-0043](./SPEC-0043-desktop-voice-residues.md) — saída de voz e política de disponibilidade
- [SPEC-0046](./SPEC-0046-desktop-voice-input-stt.md) — `stt-engine.ts`, `media-permission.ts`, captura no renderer (peças compostas aqui, não reescritas)
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) / [SPEC-0047](./SPEC-0047-renderer-parity-gate-and-panel-coverage.md) — harness jsdom e gate de paridade renderer↔módulo
- [SPEC-0048](./SPEC-0048-desktop-chat-send-ask-serialization.md) / [SPEC-0049](./SPEC-0049-desktop-ask-form-serialization-and-error-surfacing.md) — guardas do `#chat-form`/`#ask-form` (as três recusas silenciosas que o A1 expôs)
- [SPEC-0050](./SPEC-0050-core-bridge-structural-gesture-serialization.md) / [SPEC-0051](./SPEC-0051-desktop-cancel-in-flight-operation.md) — guardas estruturais de operação em voo, gesto de escape, quarentena de sessão

---

# Contrato do detector, dos recursos e do laço (dado desta SPEC — não negociável na implementação)

Pinado no mesmo molde em que a SPEC-0040 pinou o Piper e a SPEC-0046 pinou o `whisper.cpp`, por delegação explícita do ADR-0023 (*Observações → Nota de escopo*). **Este é o único lugar onde este nível de detalhe vive.**

## Sob cláusula de parada (divergência = decisão arquitetural)

1. **Modelo:** Silero VAD **v5**, arquivo `silero_vad.onnx` do release oficial `v5.1` (`snakers4/silero-vad`, MIT), **empacotado**, nunca baixado em runtime.
2. **Contrato do grafo (v5):**

   | Entrada | Forma / tipo |
   | --- | --- |
   | `input` | `float32` `[1, 512]` — 512 amostras mono a 16 kHz, normalizadas em `[-1, 1]` |
   | `state` | `float32` `[2, 1, 128]` — estado recorrente, zerado ao (re)iniciar a escuta |
   | `sr` | `int64` escalar — sempre `16000` |

   | Saída | Forma / tipo |
   | --- | --- |
   | `output` | `float32` `[1, 1]` — probabilidade de voz na janela |
   | `stateN` | `float32` `[2, 1, 128]` — realimentado como `state` do frame seguinte |

3. **Runtime:** `onnxruntime-web` **v1.20.1**, build **wasm-only**, `numThreads = 1`, `proxy = false` (sem Worker, sem `SharedArrayBuffer`, sem COOP/COEP).
4. **Zero rede** em qualquer caminho, inclusive para runtime e modelo.
5. **Zero carregamento dinâmico de script** no renderer: nenhum `import(`, `new Worker`, `addModule` ou injeção de `<script>` por JS. O runtime entra por **um** `<script>` estático em `index.html`.
6. **Binários entram por `ArrayBuffer` via IPC**: o main lê os artefatos binários do disco e os entrega; o renderer alimenta `ort.env.wasm.wasmBinary` e `InferenceSession.create(<ArrayBuffer>)`. **Nenhum `fetch`/XHR nos dois lados.**
7. **Toda inferência do glue passa por um único ponto de criação** que satisfaz a porta `VoiceActivityDetector` (ADR-0023(c)).

> **Se qualquer um dos sete pontos acima divergir na prática, pare e devolva ao `spec-drafter`, nunca faça ajuste ad hoc.** Em particular: se a distribuição wasm-only da versão pinada **exigir** carregar cola JS/`.mjs` companheira dinamicamente em runtime, isso colide com o ponto 5 e **é divergência arquitetural** — para, não contorna.

## Layout do dist (não é decisão arquitetural — não está sob cláusula de parada)

Os artefatos concretos que a distribuição wasm-only da versão pinada exige vivem num diretório canônico único, **irmão do documento do renderer** (é o único caminho alcançável por URL relativa sob `file://` sem bundler, ADR-0019):

```text
apps/desktop/src/renderer/vendor/vad/   runtime + binário WASM + silero_vad.onnx (conteúdo NÃO versionado no git)
```

**Nomes e quantidade de arquivos são derivados do pacote pinado pelo `spec-implementer`**, não fixados aqui: eles pertencem ao empacotamento do `onnxruntime-web`, não ao desenho do Atlas, e mudam entre builds do mesmo release sem que nada arquitetural mude (achado A3 do gate; ver D6). O que **precisa** valer, e é verificado por CA: exatamente **um** `<script>` estático em `index.html` apontando para dentro desse diretório; todo artefato binário adicional entregue por IPC como `ArrayBuffer`; nenhum carregamento dinâmico.

## Parâmetros do modo (constantes da SPEC, não espalhadas)

| Constante | Valor pinado | Papel |
| --- | --- | --- |
| `FRAME_SAMPLES` | `512` (32 ms a 16 kHz) | janela de análise exigida pelo Silero v5 |
| `SPEECH_ENTER` | `0.5` | probabilidade a partir da qual a janela é voz |
| `SPEECH_EXIT` | `0.35` | histerese: só abaixo disso a janela volta a ser não-voz |
| `MIN_SPEECH_MS` | `320` (10 frames) | fala mínima para que exista turno a fechar |
| `PRE_ROLL_FRAMES` | `10` (320 ms) | frames retidos antes do início da fala, para não cortar a primeira sílaba |
| `SILENCE_CLOSE_MS` | `3000` | ausência contínua de voz que fecha o turno (**decisão de produto 2 do ADR-0023**) |
| `MAX_UTTERANCE_MS` | `30000` | teto de uma fala; ao atingi-lo o turno fecha e **segue** para a transcrição |
| `CAPTURE_REARM_MS` | `15000` | rearme periódico da janela de captura enquanto o modo escuta |
| `VAD_QUEUE_LIMIT` | `32` frames (≈1 s) | teto da fila de inferência **do glue**; estourar é `vadOverrun` |
| `THINKING_WATCHDOG_MS` | `180000` | teto de espera do turno em `thinking` (achado A1) |
| `SPEAKING_WATCHDOG_BASE_MS` / `_PER_CHAR_MS` / `_MAX_MS` | `8000` / `80` / `120000` | watchdog da fala: `clamp(base + perChar × caracteres, base, max)` |

Regras derivadas, pinadas:

- Enquanto **não** há fala, o áudio é descartado continuamente; só o anel de `PRE_ROLL_FRAMES` é retido. **Nenhum buffer cresce sem fala.**
- O payload transcrito de um turno é exatamente: `PRE_ROLL_FRAMES` + frames de fala + frames de silêncio até o fecho (o silêncio final **não** é aparado — `whisper.cpp` lida com ele, e aparar exigiria uma segunda regra a testar).
- `SILENCE_CLOSE_MS` é acumulado **em ms de frames consecutivos** classificados como não-voz (32 ms cada); qualquer frame ≥ `SPEECH_ENTER` **zera** o acumulador.
- Fala mais curta que `MIN_SPEECH_MS` **não** fecha turno: o acumulado é descartado e o modo volta a escutar, sem transcrever e sem avisar como erro.
- A inferência é **sequencial** (um frame por vez, na ordem); frames chegam em blocos de 8 (`ScriptProcessorNode` de 4096 amostras) e entram numa fila **do glue**. Fila acima de `VAD_QUEUE_LIMIT` ⇒ evento `vadOverrun` ⇒ o modo **desliga com aviso**, nunca degrada em silêncio.
- **O teto de fala cabe no teto de bytes do main**: 30 s a 16 kHz `Int16` ≈ 960 000 B, abaixo do `MAX_PCM_BYTES` de 1 000 000 pinado pela SPEC-0046. Com o pre-roll (320 ms ≈ 10 240 B) e o silêncio de fecho (3 s ≈ 96 000 B), o teto de fala efetivo do glue é `MAX_UTTERANCE_MS` medido **sobre a fala**, e o payload total permanece abaixo de 1 000 000 B — verificado por CA.

## Janela de captura: rearme periódico, sem tocar `media-permission.ts`

O watchdog de 35 s da SPEC-0046 continua **exatamente** como está. Como no modo hands-free a escuta pode durar indefinidamente, o renderer chama `'atlas:stt:capture:begin'` a cada `CAPTURE_REARM_MS` enquanto o estado for `listening` ou `capturing` — usando a **idempotência já pinada** (`begin` com a janela aberta só rearma). O rearme para no instante em que o microfone fecha; `'atlas:stt:capture:end'` continua sendo chamado em `finally` de todo caminho de saída. **Zero diff em `src/media-permission.ts`.**

## Máquina de estados do modo (exaustiva)

Estados: `off` · `unavailable` · `arming` · `listening` · `capturing` · `transcribing` · `thinking` · `speaking`.

| Estado | Microfone | Evento | Estado seguinte / efeito |
| --- | --- | --- | --- |
| `off` | fechado | `enable` | `arming` — `captureBegin` → `getUserMedia` → detector pela porta |
| `off`/qualquer | — | `unavailable` | `unavailable` — toggle desabilitado com motivo |
| `arming` | abrindo | `armed` | `listening` — grafo de áudio ligado, detector resetado, rearme periódico armado |
| `arming` | abrindo | `armFailed` | `off` — recursos liberados, `captureEnd`, aviso do motivo |
| `listening` | **aberto** | `speechStart` (≥ `SPEECH_ENTER`) | `capturing` — retém pre-roll + frames seguintes |
| `capturing` | **aberto** | `speechEnd` (`SILENCE_CLOSE_MS` acumulados, com ≥ `MIN_SPEECH_MS` de fala) | `transcribing` — **fecha o microfone antes de qualquer outra coisa** |
| `capturing` | **aberto** | `speechEnd` com fala < `MIN_SPEECH_MS` | `listening` — buffer descartado, sem transcrever, sem aviso de erro |
| `capturing` | **aberto** | `utteranceCap` (`MAX_UTTERANCE_MS`) | `transcribing` — fecha o microfone e **segue** para a transcrição |
| `transcribing` | fechado | `transcriptReady` | **`sending`** — ver *Pré-condições de envio* abaixo |
| `transcribing` | fechado | `transcriptEmpty` | `listening` — reabre o microfone com aviso ("não entendi") |
| `transcribing` | fechado | `transcriptFailed` | `off` — aviso por `reason`, modo desligado |
| `sending` | fechado | `turnStarted` (confirmado pelo gancho) | `thinking` — watchdog de `THINKING_WATCHDOG_MS` armado |
| `sending` | fechado | `turnRefused` (pré-condição falhou ou `submit` não iniciou turno) | `off` — aviso do motivo, nada em voo |
| `thinking` | fechado | `turnDone` | `speaking` — fala a resposta, watchdog de fala armado |
| `thinking` | fechado | `turnFailed` (erro, cancelamento, recusa do bridge, quarentena) | `off` — aviso, modo desligado |
| `thinking` | fechado | `thinkingTimeout` (`THINKING_WATCHDOG_MS`) | `off` — aviso; o turno segue por conta do `.finally` existente, o freio manual continua disponível |
| `speaking` | fechado | `speechDone` | `arming` — reabre o microfone para o turno seguinte |
| qualquer | — | `disable` | `off` — microfone fechado **imediatamente**; se havia turno em voo, `window.atlas.cancel()` |
| qualquer | — | `vadOverrun` | `off` — aviso "o detector de voz não acompanhou o áudio" |
| qualquer | — | evento não previsto para o estado | **estado inalterado, nenhum efeito** (regra de fecho da tabela) |

São **9 estados** (o `sending` entrou na v1.1 por causa do achado A1) e **18 eventos**.

**Invariante estrutural:** em `transcribing`, `sending`, `thinking` e `speaking` o microfone está comprovadamente fechado — tracks paradas, `AudioContext` fechado, `captureEnd` chamado (ADR-0023(e)). A transição para esses estados executa o fechamento **antes** de qualquer outro efeito.

**Invariante de saída (achado A1):** nenhum estado longo depende só de um evento que pode não chegar. `transcribing` termina pela promessa de `'atlas:stt:transcribe'` (que a SPEC-0046 garante nunca lançar e sempre resolver um desfecho); `sending` termina **no mesmo tick** do `submit`; `thinking` termina por `turnDone`/`turnFailed` **ou** por `thinkingTimeout`; `speaking` termina por evento **ou** por watchdog.

## Pré-condições de envio e gancho de início confirmado (achado A1)

O manipulador de `#chat-form` (`renderer.js`) tem hoje **três recusas silenciosas antes de qualquer promessa** — `chatSession === null`, `chatTurnInFlight || askInFlight` (SPEC-0048/D2) e `input === ''` após `trim()`. Nenhuma delas produz `.then`/`.catch`, então um modo que transitasse para `thinking` ao despachar o `submit` ficaria **preso para sempre**, com o microfone fechado e o indicador mentindo. A guarda estrutural do `core-bridge` (SPEC-0050) **não** salva esse caso: a do renderer dispara antes.

Contrato pinado, em duas camadas:

1. **Pré-condições verificadas pelo glue antes de despachar** (espelham as três guardas, com mensagem própria por motivo): há sessão de chat; `!chatTurnInFlight && !askInFlight`; texto não vazio após `trim()`. Qualquer uma falsa ⇒ `turnRefused`, **sem despachar**.
2. **Gancho de início confirmado**: o manipulador de `#chat-form` chama `notifyHandsFreeTurnStarted()` **imediatamente após** `chatTurnInFlight = true` e antes de `window.atlas.chat.send`. Como `dispatchEvent` é **síncrono**, o glue zera uma flag antes de despachar e a lê ao retornar: confirmada ⇒ `turnStarted`; não confirmada ⇒ `turnRefused`. **Nenhuma dependência de tick, timer ou promessa.**

`notifyHandsFreeTurnSettled(snapshot)` / `notifyHandsFreeTurnFailed(error)` continuam no `.then`/`.catch` do mesmo manipulador, e são no-op com o modo desligado.

**Cenários que isto fecha, verificados por CA:** ligar o modo com um `ask` em voo; sessão encerrada por troca de Persona/permissões (`chatSession === null`); e a recusa por quarentena de sessão, que chega pelo `.catch` como `turnFailed`.

> **R5 (achado do gate de validação, resolvido pelo `spec-implementer`).** A terceira pré-condição ("texto não vazio após `trim()`") **nunca é alcançável** por `handsFreeSendTurn` no fluxo real: `handsFreeCloseMicAndTranscribe` só chama `handsFreeSendTurn(text)` quando `text.trim() !== ''` — uma transcrição vazia/só-espaços já foi desviada, ANTES disso, pela transição `transcribing + transcriptEmpty → listening` (pinada na *Máquina de estados do modo* acima), que reabre o microfone em vez de desligar o modo. Isto é o comportamento CORRETO e mais amigável (ruído/silêncio transcrito não deveria derrubar uma conversa inteira), e a transição já está sob cláusula de parada — não pode ser removida para "destravar" a terceira guarda. A guarda permanece no código como espelho estrutural fiel das três recusas do `#chat-form` (defensiva contra uma mudança futura no manipulador que a torne alcançável), mas **não é exercitada por CA algum** hoje — só as duas pré-condições genuinamente alcançáveis (`chatSession === null`, `askInFlight`) são. O cenário "transcrição só com espaços" é coberto pelo teste de `transcriptEmpty` (que já existia), não por um teste de `turnRefused`.

## Interação com o resto do desktop (pinada)

- **Auto-envio reusa o caminho único de envio**: o glue escreve em `#chat-input` e dispara `submit` em `#chat-form`; **nunca** chama `window.atlas.chat.send` diretamente. Todas as guardas das SPECs 0048/0049/0050/0051 continuam valendo sem duplicação — e o gancho de início confirmado é o que torna as recusas dessas guardas **observáveis** pelo modo.
- **`hasInFlightOperation`/`hasActiveOperation`**: nenhuma mudança no `core-bridge`. Enquanto o modo está ligado, `#ask-submit` e `#mic-button` ficam **desabilitados com motivo**; e o próprio toggle fica desabilitado enquanto `chatTurnInFlight || askInFlight`, para que o modo não nasça dentro de um estado que o recusaria. Tudo por `refreshAskControls()`/`refreshMicButtons()`/`refreshHandsFreeToggle()` — origem única, nenhuma atribuição direta em `.finally`.
- **Quarentena de sessão (SPEC-0051)**: recusa de turno numa sessão em quarentena chega como `turnFailed` — o modo desliga; nunca tenta de novo em laço.
- **Cancelamento (SPEC-0051)**: `disable` durante `thinking` chama `window.atlas.cancel()`; o aviso pinado de cancelamento continua sendo escrito pelo `.catch` já existente do `#chat-form`, sem duplicação de texto.
- **Fim da fala do assistente**: `speakText(text, onDone)` — `onDone` chamado **exatamente uma vez**, em `ended`/`error` do `<audio>` (Piper), em `end`/`error` do `SpeechSynthesisUtterance` (SO), imediatamente quando o backend é `none` ou a fala não inicia, e por watchdog `clamp(8_000 + 80 × caracteres, 8_000, 120_000)`.
- **Como o caminho `'os'` obtém `onDone` sem tocar réplica alguma (achado A2)**: o `SpeechSynthesisUtterance` nasce dentro do objeto `synth` (`renderer.js`), que é a **implementação da porta** `SpeechSynthesisPort` — **não** uma réplica registrada no gate de paridade. `synth.speak` passa o utterance recém-criado a um observador de módulo (`handsFreeUtteranceObserver`, no-op com o modo desligado) **antes** de `window.speechSynthesis.speak(utterance)`; o observador anexa `end`/`error`. `createSpeechOutputGlue` e as demais réplicas saem **inalteradas**, e `speech-output.ts` sai com diff vazio. Verificação mecânica: `renderer.js` contém **exatamente uma** ocorrência de `new SpeechSynthesisUtterance(`.
- **Desligar o modo não interrompe a fala em curso** (ADR-0023, decisões de produto 3/4: o toggle age sobre a **escuta**).

---

# Escopo

1. **`apps/desktop/src/hands-free.ts` (novo)** — módulo puro do app, sem importar `electron` e sem globais de navegador:
   - `createTurnSegmenter({ speechEnter, speechExit, minSpeechMs, silenceCloseMs, maxUtteranceMs, frameMs })` → `{ push(probability), reset() }`, com os desfechos da tabela (sem conhecer fila nem buffer de áudio — ver D19);
   - `nextHandsFreeState(state, event)` — transição pura e exaustiva (9 estados × 18 eventos), incluindo a regra de fecho;
   - `handsFreeMicrophoneOpen(state)` — predicado único da invariante do ADR-0023(e);
   - `speakingWatchdogMs(text)` — cálculo puro do watchdog de fala;
   - as constantes pinadas do *Contrato* como exports nomeados;
   - a interface da **porta injetável do detector** (`VoiceActivityDetector`), consumida pelo ponto de criação único do glue.
2. **`apps/desktop/src/vad-resources.ts` (novo)** — módulo do main process, sem importar `electron`: `createVadResources({ resolveDir, readFile, stat })` → `{ isAvailable, describe, load }`. `isAvailable()` = todos os artefatos do layout presentes (mesma semântica e mesma limitação conhecida de `PiperTts.isAvailable()`/`SttEngine.isAvailable()`); `load()` devolve os `ArrayBuffer`; falha de IO vira desfecho, nunca exceção.
3. **Dois canais IPC novos** em `src/main.ts` + `src/preload.cjs`: `'atlas:vad:available'` → `{ available, reason? }`; `'atlas:vad:resources'` → `{ ok: true, ... } | { ok: false, reason }`.
4. **Superfície no renderer** (`src/renderer/index.html`): `#hands-free-toggle`, `#hands-free-indicator`, `#hands-free-status`; **um** `<script>` estático do runtime; CSP com `'wasm-unsafe-eval'` acrescentado a `script-src` — e nada mais afrouxado.
5. **Glue do modo** (`src/renderer/renderer.js`): réplica das funções puras de `hands-free.ts` (com comentário de duplicação obrigatório), **ponto de criação único do detector** satisfazendo `VoiceActivityDetector`, fila de inferência sequencial + anel de pre-roll (propriedades do glue, D19), laço de captura reusando o grafo da SPEC-0046, rearme periódico, pré-condições + gancho de início confirmado, watchdogs de `thinking` e `speaking`, e reabertura do microfone.
6. **Ganchos aditivos no glue existente**: `speakText(text, onDone)`, `playPiperAudio(audio, onDone)`, observador de utterance dentro de `synth.speak`; `notifyHandsFreeTurnStarted()` após `chatTurnInFlight = true` e `notifyHandsFreeTurnSettled/Failed` no `.then`/`.catch` de `#chat-form`; `refreshAskControls()`/`refreshMicButtons()`/`refreshHandsFreeToggle()` considerando o modo e os gatilhos assíncronos de voz.
7. **Testes** em `apps/desktop/tests/`: `hands-free.test.ts`, `vad-resources.test.ts`, `renderer.hands-free.test.ts` (novos); `helpers/renderer-harness.ts` ganha substituição do ponto de criação do detector, eventos de conclusão em `Audio`/`SpeechSynthesisUtterance` e as entradas novas do `EPILOGUE`; `renderer.speech-parity.test.ts` passa a vigiar **quatro** módulos-fonte.
8. **Documentação da própria SPEC**: este arquivo e uma *Nota de implementação* no ADR-0023 — que registra também a rastreabilidade ao **Artigo 8**, ausente do ADR. **Nenhuma Decisão do ADR-0023 é alterada.**

---

# Fora do Escopo

- **Wake word / ativação por voz.** O ADR-0023 explicitamente **não** a autoriza nem a aproxima.
- **Barge-in** e qualquer controle de "parar a fala" — ADR-0023, decisão de produto 4.
- **Cancelamento de eco acústico**, seleção de dispositivo de entrada, ganho, supressão de ruído, diarização.
- **Ajuste da janela de silêncio pelo usuário** — candidato futuro do ADR-0023; os 3 s são dado desta SPEC.
- **Fallback de detecção por limiar de energia** — ver D8.
- **Aparar o silêncio final do payload** antes de transcrever — regra a mais sem ganho demonstrado.
- **Canal de push avisando o renderer quando o trabalho abandonado assenta** — candidato já nomeado (`NEXT_CONTEXT.md`), fatia própria; sem ele, uma sessão em quarentena continua desligando o modo a cada tentativa (registrado nas Observações).
- **Retentativa automática de turno** — responsabilidade do Task Manager pelo Module Catalog, hoje inexistente.
- **Ditado ao vivo / transcrição incremental** e **processo de longa duração para STT** — candidatos do ADR-0022, intocados.
- **Persistir o estado do modo** entre execuções, ou qualquer áudio, transcrição ou probabilidade — ADR-0023(a)/(f), Artigo 11.
- **Qualquer chamada de rede**, em qualquer caminho.
- **Mover a transcrição para o renderer** ou ampliar a exceção do ADR-0023(d) para além do VAD.
- **Alterar `ConfirmPort`, `GrantConfirmPort` ou `PersonaDeleteConfirmPort`** — camada 1 da salvaguarda; qualquer toque invalida o ADR-0023(b).
- **Alterar `packages/*`, `@atlas/contracts`, `apps/cli`, `src/core-bridge.ts`, `src/speech-output.ts`, `src/piper-tts.ts`, `src/stt-engine.ts`, `src/media-permission.ts`.**
- **Alterar qualquer réplica registrada no gate de paridade** (incluindo `createSpeechOutputGlue`) — ver D20.
- **Cancelamento cooperativo real no Runtime/Task Manager** — exige ADR próprio.
- **Modo hands-free no painel `ask`** e **na CLI**.
- **Empacotamento/distribuição** do modelo e do runtime — Fase 3.
- **Fechar a pendência de smoke visual/sonoro.** Esta SPEC a **amplia** e a registra; não a resolve.

---

# Pré-requisitos

- [ADR-0023](../../06-adr/ADR-0023-hands-free-voice-conversation.md) — `Accepted` (2026-08-05). **Satisfeito.**
- [SPEC-0033](./SPEC-0033-desktop-visual-chat.md) — `Done`
- [SPEC-0040](./SPEC-0040-desktop-piper-neural-tts.md) — `Done`
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) — `Done`
- [SPEC-0046](./SPEC-0046-desktop-voice-input-stt.md) — `Done`
- [SPEC-0047](./SPEC-0047-renderer-parity-gate-and-panel-coverage.md) — `Done`
- [SPEC-0048](./SPEC-0048-desktop-chat-send-ask-serialization.md) / [SPEC-0049](./SPEC-0049-desktop-ask-form-serialization-and-error-surfacing.md) — `Done`
- [SPEC-0050](./SPEC-0050-core-bridge-structural-gesture-serialization.md) — `Done`
- [SPEC-0051](./SPEC-0051-desktop-cancel-in-flight-operation.md) — `Done`

---

# Critérios de Aceitação

Verificáveis mecanicamente. São **45**.

**Módulo puro (`src/hands-free.ts`)**

1. O arquivo existe, não contém `from 'electron'`/`require('electron')` nem referência a `window`/`document`, e é importável num teste Vitest sem Electron.
2. As constantes da tabela do *Contrato* são exports nomeados com exatamente os valores pinados — um teste as compara uma a uma.
3. `nextHandsFreeState` é **exaustiva**: um teste percorre o produto cartesiano dos 9 estados × 18 eventos e afirma que nenhuma combinação lança e que toda combinação fora da tabela devolve o estado inalterado.
4. `disable` a partir de **cada um** dos 9 estados devolve `off` — um caso por estado.
5. `handsFreeMicrophoneOpen(state)` é `true` apenas em `listening` e `capturing`; teste sobre os 9 estados.
6. **Toda linha da tabela de estados tem um teste dedicado**, incluindo as quatro linhas novas de `sending`/`thinkingTimeout`.
7. `speakingWatchdogMs(text)` respeita `clamp(8_000 + 80 × caracteres, 8_000, 120_000)` — testes nos três regimes.
8. `createTurnSegmenter`: entrar em fala (≥ 0.5) e cair para 0.4 **não** encerra a fala (histerese `SPEECH_EXIT`); cair abaixo de 0.35 acumula silêncio.
9. Silêncio de exatamente `SILENCE_CLOSE_MS` após fala ≥ `MIN_SPEECH_MS` emite `speechEnd`; um frame de voz no meio **zera** o acumulador (teste com 2900 ms + voz + 2900 ms ⇒ nenhum `speechEnd`).
10. Fala mais curta que `MIN_SPEECH_MS` seguida de silêncio longo emite `speechEnd` marcado como descarte (nenhuma transcrição).
11. `MAX_UTTERANCE_MS` de fala contínua emite `utteranceCap`.
12. **A API do segmentador é exatamente `{ push(probability), reset() }`** e sua configuração **não** inclui `queueLimit`: um teste afirma as chaves do objeto devolvido e a ausência de qualquer desfecho de fila. Pre-roll e fila são do glue (D19), verificados nos CAs 32–34.

**Recursos do VAD (`src/vad-resources.ts`)**

13. O módulo existe, não importa `electron`, e todo IO é injetado.
14. `isAvailable()` devolve `false` **sem lançar** quando o diretório não existe e quando **qualquer** artefato do layout está ausente — um teste por artefato exigido pela distribuição escolhida, cada um com `reason` distinguível.
15. `load()` devolve os `ArrayBuffer` no caminho feliz e `{ ok: false, reason }` quando a leitura rejeita — nunca lança.
16. `describe()` devolve modelo (`silero-vad-v5`) e runtime (`onnxruntime-web@1.20.1`), conforme os pontos 1 e 3 da cláusula de parada.

**Fiação do main (asserção estática de fonte, molde da SPEC-0046/D16)**

17. Um teste lê `src/main.ts` do disco e afirma o registro dos dois canais `'atlas:vad:*'`; falha se qualquer um faltar.
18. Um teste lê `src/preload.cjs` e afirma a exposição de `window.atlas.vad.available` e `window.atlas.vad.resources`.
19. `git diff` vazio em `src/media-permission.ts` e em `src/stt-engine.ts` — a integração com a janela de captura usa **só** a idempotência já pinada.

**Superfície e CSP**

20. `index.html` contém `#hands-free-toggle`, `#hands-free-indicator`, `#hands-free-status` e **exatamente um** `<script src="vendor/vad/…">` estático; `renderer.boot.test.ts` segue verde com os `id`s novos.
21. A CSP de `index.html` é **exatamente** `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; media-src 'self' blob:` — teste compara a string inteira. Qualquer afrouxamento além do `'wasm-unsafe-eval'` reprova.
22. Verificação estática sobre `renderer.js`: nenhum `addModule`, `import(`, `new Worker` ou injeção de `<script>` por JS (ponto 5 da cláusula de parada).

**Porta do detector (achado A4)**

23. **Ponto de criação único**: o glue cria o detector num único lugar, cujo valor satisfaz estruturalmente `VoiceActivityDetector` (`probe`/`reset`); uma verificação estática afirma que `InferenceSession.create`/`ort.` aparecem **apenas** dentro dessa função.
24. **O dublê de teste entra pela porta, não pelo runtime**: `renderer.hands-free.test.ts` substitui a fábrica do detector (exposta pelo `EPILOGUE`) por um detector roteirizado e exercita o laço inteiro **sem** `window.ort` presente — prova de que trocar o detector é local, como exige o ADR-0023(c).
25. O detector é resetado (`reset()`) a cada entrada em `listening` — teste conta as chamadas ao longo de dois turnos.

**Laço no renderer (harness jsdom, sem áudio real)**

26. Com `'atlas:vad:available'` respondendo `{ available: false, reason }`, o toggle fica **desabilitado com o motivo visível**; idem quando `'atlas:stt:available'` é `false` e quando `currentVoiceBackend()` é `none` — um teste por causa, todos exigindo o motivo no DOM.
27. **Reavaliação da habilitação (achado A6)**: partindo de um DOM sem vozes (toggle desabilitado por "sem voz"), disparar `voiceschanged` com uma voz local passa o toggle a **habilitado sem recarregar a página**; o mesmo vale para a chegada do catálogo/disponibilidade Piper por IPC (`loadPiperVoices`) e para a resposta de `'atlas:vad:available'` — três testes, um por gatilho. Nenhuma decisão de habilitação é point-in-time no load (`apps/desktop/CLAUDE.md`, quirk do `voiceschanged`).
28. O modo nasce **desligado** em todo arranque: nenhum `getUserMedia`, nenhum `captureBegin` sem clique no toggle; nada do modo é lido ou escrito em armazenamento.
29. Ligar o toggle chama `'atlas:stt:capture:begin'` **antes** de `getUserMedia`, chama `begin` de novo quando a promessa resolve (rearme da SPEC-0046) e cria o detector pela porta — nenhum `fetch`.
30. Ciclo completo sobre os dublês: frames de voz → 3 s de silêncio (via `clock.advance`) → `'atlas:stt:transcribe'` emitido **uma vez** → texto anexado a `#chat-input` → `submit` de `#chat-form` disparado → `window.atlas.chat.send` chamado **exatamente uma vez** → resposta falada → microfone reaberto (`getUserMedia` chamado uma 2ª vez).
31. **Invariante do microfone (ADR-0023(e))**: em `transcribing`, `sending`, `thinking` e `speaking`, um teste prova que `stop()` foi chamado em **todas** as tracks, `close()` no `AudioContext` e `'atlas:stt:capture:end'` emitido — e que nenhum `getUserMedia` novo ocorre antes de `speechDone`.
32. **Pre-roll e tamanho do payload (achado A5, propriedade do glue)**: após 100 frames de silêncio, 20 frames de fala e o silêncio de fecho, o `pcm.byteLength` enviado é **exatamente** `(PRE_ROLL_FRAMES + 20 + ceil(3000/32)) × 512 × 2` bytes — prova mecânica de que nada anterior ao pre-roll foi retido.
33. O payload de uma fala no teto (`MAX_UTTERANCE_MS`) permanece **abaixo** de 1 000 000 bytes (`MAX_PCM_BYTES` da SPEC-0046) — teste de aritmética sobre o buffer real produzido.
34. **Overrun (achado A5, propriedade do glue)**: com o detector roteirizado a resolver lentamente, a fila passa de `VAD_QUEUE_LIMIT` e o modo desliga com aviso distinguível, microfone fechado.
35. **Rearme periódico**: com o modo em `listening`, `clock.advance(45_000)` produz ao menos três `'atlas:stt:capture:begin'` adicionais; o rearme **cessa** assim que o microfone fecha (nenhum `begin` durante `sending`/`thinking`/`speaking`).
36. **Pré-condições de envio (achado A1)**: um teste por cenário **alcançável** — sessão de chat ausente; `askInFlight` verdadeiro — cada um resolvendo `turnRefused`, **sem** despachar `submit`, sem chamar `chat.send`, com aviso próprio e modo em `off`. (R5, achado do gate de validação: a terceira guarda pinada — "texto não vazio" — nunca é alcançada no fluxo real, porque `transcriptEmpty` já desvia toda transcrição vazia/só-espaços antes de `handsFreeSendTurn` ser chamado; esse cenário é coberto pelo teste de `transcriptEmpty` do CA 40, não aqui. Ver a nota R5 na seção *Pré-condições de envio e gancho de início confirmado*.)
37. **Gancho de início confirmado (achado A1)**: com o `submit` despachado e o manipulador recusando silenciosamente (simulando a guarda da SPEC-0048/D2 que dispara depois da verificação do glue), o modo resolve `turnRefused` **no mesmo tick**, nunca ficando em `sending`/`thinking`; e no caminho feliz `notifyHandsFreeTurnStarted` é observado exatamente uma vez antes de `chat.send`.
38. **Watchdog de `thinking` (achado A1)**: com a promessa do turno pendente indefinidamente, `clock.advance(THINKING_WATCHDOG_MS)` leva o modo a `off` com aviso; um teste prova que o watchdog é desarmado quando `turnDone`/`turnFailed` chega antes.
39. **Freio**: desligar o toggle em **cada** um dos **seis estados alcançáveis por um gesto real de "desligar"** (`arming`, `listening`, `capturing`, `transcribing`, `thinking`, `speaking`) fecha o microfone imediatamente e volta a `off`; em `thinking`, chama também `window.atlas.cancel()` **uma vez**; em nenhum estado o desligamento depende de trabalho em voo (um teste por estado). (R6, achado da 2ª validação: `off`, `unavailable` e `sending` **não** entram nesta contagem — ver a nota R6 na seção *Resíduos resolvidos pelo `spec-implementer`* para a justificativa formal de cada um.)
40. Desfechos de exceção: `transcriptEmpty` reabre o microfone com aviso e **não** dispara `submit`; `transcriptFailed`, `turnFailed` (incluindo recusa por quarentena de sessão) e `vadOverrun` desligam o modo com aviso distinguível e microfone fechado — um teste por desfecho.
41. `speakText(text, onDone)` chama `onDone` **exatamente uma vez** em cada caminho: `ended` do `<audio>` Piper, `error` do `<audio>`, `end` do utterance do SO, `error` do utterance, backend `none`, watchdog (via `clock.advance`), e (R3, achado do 2º passe do `architecture-reviewer`) o caso em que `synth.speak` retorna sem chegar a criar um utterance (voz local sumiu entre a seleção e a fala, ou nenhuma voz é passível de fala) — **sete** testes; o modo nunca fica preso em `speaking`.
42. **Observador de utterance sem tocar réplica (achado A2)**: `renderer.js` contém **exatamente uma** ocorrência de `new SpeechSynthesisUtterance(`, dentro do objeto `synth`; e um teste prova que o caminho `'os'` resolve `onDone` com `createSpeechOutputGlue` inalterada.
43. Nada é persistido: nenhum `localStorage`/`sessionStorage`/`indexedDB` é tocado, e nenhum canal IPC recebe áudio além do `{ pcm, sampleRate }` já pinado pela SPEC-0046 (forma exata verificada).

**Paridade, higiene e regressão**

44. `renderer.speech-parity.test.ts` passa a vigiar **quatro** módulos-fonte (`speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`, `hands-free.ts`), enumerados em runtime via `import * as`; toda função pura e toda constante de `hands-free.ts` replicada no renderer entra no registro com tabela de casos, e um export novo não classificado (nem em `NOT_MIRRORED`, com `moduleSource` e justificativa) **reprova**. Cada réplica carrega comentário explícito apontando origem e teste de referência.
45. `git diff` vazio em `packages/*`, `apps/cli/`, `apps/desktop/src/core-bridge.ts`, `src/speech-output.ts`, `src/piper-tts.ts`, `src/stt-engine.ts`, `src/media-permission.ts`, `src/confirm-port.ts`, `src/permission-grant-dialog.ts`, `src/persona-delete-dialog.ts`; **e nenhuma réplica registrada no gate de paridade é alterada**. `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` verdes na raiz; a suíte total cresce; nenhum teste pré-existente é removido ou marcado como `skip`; as oito suítes de renderer existentes seguem verdes. Verificação estática adicional: `hands-free.ts`, `vad-resources.ts` e `renderer.js` não referenciam `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `http`, `https` nem `net` (extensão do CA 15 da SPEC-0046). O ADR-0023 recebe *Nota de implementação* (incluindo a rastreabilidade ao Artigo 8), e esta SPEC registra em Observação que nada da fatia foi exercitado com microfone, áudio ou modelo reais.

---

# Arquivos Esperados

```text
apps/desktop/src/hands-free.ts                       (novo: segmentador + máquina de estados + porta, puros)
apps/desktop/src/vad-resources.ts                    (novo: leitura dos artefatos do VAD no main)
apps/desktop/src/main.ts                             (editado: 2 ipcMain.handle)
apps/desktop/src/preload.cjs                         (editado: window.atlas.vad.*)
apps/desktop/src/renderer/index.html                 (editado: toggle/indicador, 1 <script> estático, CSP + wasm-unsafe-eval)
apps/desktop/src/renderer/renderer.js                (editado: glue do modo + ganchos aditivos)
apps/desktop/src/renderer/vendor/vad/                (novo diretório; artefatos do dist, NÃO versionados)

apps/desktop/tests/hands-free.test.ts                (novo)
apps/desktop/tests/vad-resources.test.ts             (novo)
apps/desktop/tests/renderer.hands-free.test.ts       (novo)
apps/desktop/tests/helpers/renderer-harness.ts       (editado: fábrica de detector substituível, eventos de conclusão, EPILOGUE)
apps/desktop/tests/renderer.speech-parity.test.ts    (editado: 4º módulo vigiado + entradas do registro)
apps/desktop/.gitignore                              (editado ou criado: vendor/vad/)

docs/06-adr/ADR-0023-hands-free-voice-conversation.md          (recebe Nota de implementação no fecho; nenhuma Decisão alterada)
docs/implementation/specs/SPEC-0052-desktop-hands-free-voice-conversation.md (este arquivo)
```

---

# Componentes Impactados

- **Input Gateway** (`apps/desktop`) — ganha o regime de escuta contínua sob toggle; único componente cuja superfície de entrada muda.
- **Output Gateway** (`apps/desktop`) — passa a ser acionado automaticamente pelo laço e a sinalizar o fim da fala; nenhuma mudança no motor nem na seleção de voz.

Não impactados, por construção: Core, Cognitive Core, Planner, Runtime, Task Manager, Memory Service, Context Service, Permission Service, Persona Service, Model Gateway, Tool Registry, Skill Registry.

---

# Interfaces Necessárias

Todas **locais a `apps/desktop`** (regra de tipos locais do `apps/desktop/CLAUDE.md`; promoção a `@atlas/contracts` só com 2º consumidor real, precedente ADR-0007).

```ts
// src/hands-free.ts
export type HandsFreeState =
  | 'off' | 'unavailable' | 'arming' | 'listening' | 'capturing'
  | 'transcribing' | 'sending' | 'thinking' | 'speaking';

export type HandsFreeEvent =
  | 'enable' | 'disable' | 'unavailable' | 'armed' | 'armFailed'
  | 'speechStart' | 'speechEnd' | 'utteranceCap'
  | 'transcriptReady' | 'transcriptEmpty' | 'transcriptFailed'
  | 'turnStarted' | 'turnRefused' | 'turnDone' | 'turnFailed'
  | 'thinkingTimeout' | 'speechDone' | 'vadOverrun';

export declare function nextHandsFreeState(
  state: HandsFreeState,
  event: HandsFreeEvent,
): HandsFreeState;

export declare function handsFreeMicrophoneOpen(state: HandsFreeState): boolean;
export declare function speakingWatchdogMs(text: string): number;

/**
 * Porta injetável do detector (ADR-0023(c)) — satisfeita estruturalmente pelo
 * ponto de criação único do glue (CA 23/24). Nenhum tipo do runtime de
 * inferência aparece nesta interface: é isso que torna a troca local.
 */
export interface VoiceActivityDetector {
  /** Probabilidade de voz para UM frame de `FRAME_SAMPLES` amostras a 16 kHz. */
  probe(frame: Float32Array): Promise<number>;
  /** Zera o estado recorrente ao (re)iniciar a escuta. */
  reset(): void;
}

export type SegmenterEvent =
  | { kind: 'none' }
  | { kind: 'speechStart' }
  | { kind: 'speechEnd'; speechMs: number; discarded: boolean }
  | { kind: 'utteranceCap' };

/** Consome só probabilidades: não conhece frames, buffer nem fila (D19). */
export declare function createTurnSegmenter(config: {
  speechEnter: number; speechExit: number;
  minSpeechMs: number; silenceCloseMs: number;
  maxUtteranceMs: number; frameMs: number;
}): { push(probability: number): SegmenterEvent; reset(): void };

// src/vad-resources.ts
export interface VadResourcesInfo { modelId: 'silero-vad-v5'; runtime: 'onnxruntime-web@1.20.1' }
export type VadLoad =
  | { ok: true; wasm: ArrayBuffer; model: ArrayBuffer }
  | { ok: false; reason: string };
export interface VadResources {
  isAvailable(): boolean;
  describe(): VadResourcesInfo;
  load(): Promise<VadLoad>;
}
```

---

# Fluxo Esperado

```text
usuário liga o toggle (habilitado só se STT + VAD + alguma voz, reavaliado nos 3 gatilhos)
        │
        ▼
'atlas:stt:capture:begin' → getUserMedia({audio:true}) → begin de novo (rearme)
        │   └── rejeita → off, aviso, captureEnd
        ▼
detector criado pela porta (ponto único) a partir dos ArrayBuffer do main — nenhum fetch
        │
        ▼
[listening]  mic ABERTO — frames de 512 @16 kHz → detector.probe → prob
        │     descarta áudio; retém só o anel de pre-roll; rearme a cada 15 s
        │     fila > 32 frames → vadOverrun → [off] com aviso
        ├── prob ≥ 0.5 → [capturing]
        ▼
[capturing]  3 s contínuos sem voz  (ou 30 s de fala)
        │
        ▼   FECHA O MICROFONE: stop() nas tracks, close(), 'capture:end'
[transcribing]  'atlas:stt:transcribe' { pcm, sampleRate: 16000 }
        ├── vazio → volta a [listening] com aviso
        ├── falha → [off] com aviso
        ▼
[sending]  pré-condições (sessão · !chatTurnInFlight && !askInFlight · texto)
        │   ├── falha → turnRefused → [off] com aviso, NADA despachado
        ▼
texto anexado a #chat-input → submit síncrono de #chat-form
        │   ├── gancho notifyHandsFreeTurnStarted NÃO veio no mesmo tick
        │   │   (recusa silenciosa do manipulador) → turnRefused → [off]
        ▼
[thinking]  chat.send em voo · watchdog de 180 s armado · mic FECHADO
        │   ├── erro/recusa/quarentena/cancelamento → [off] com aviso
        │   ├── watchdog estoura → [off] com aviso (freio manual segue disponível)
        │   └── desligar o toggle aqui → window.atlas.cancel()
        ▼
[speaking]  speakText(resposta, onDone) — Piper (<audio>) ou SO (utterance observado
        │   dentro de `synth.speak`, sem tocar réplica) · watchdog de fala armado
        ▼
volta a [arming] → [listening]   (novo getUserMedia; laço fecha sem nenhum clique)
```

---

# Estratégia de Implementação

1. Reler o ADR-0023 inteiro, `apps/desktop/CLAUDE.md`, o manipulador de `#chat-form` (as três recusas silenciosas) e o glue de voz da SPEC-0046 — o modo **compõe** essas peças, não as reescreve.
2. `src/hands-free.ts` em TDD: constantes → `nextHandsFreeState` (tabela linha a linha, depois produto cartesiano) → `handsFreeMicrophoneOpen` → `speakingWatchdogMs` → `createTurnSegmenter` (histerese, mínimo de fala, teto de fala).
3. `src/vad-resources.ts` em TDD com IO injetado, a partir da lista de artefatos que a distribuição pinada exigir.
4. Fiação em `main.ts`/`preload.cjs` (2 canais) + asserções estáticas de fonte.
5. `index.html`: toggle, indicador, **um** `<script>` estático, CSP com `'wasm-unsafe-eval'` — nada mais. Se a distribuição exigir carregamento dinâmico, **pare** (ponto 5 da cláusula de parada).
6. Harness: fábrica de detector substituível (é o que destrava o CA 24 sem `window.ort`), eventos de conclusão em `Audio`/`SpeechSynthesisUtterance`, depois o `EPILOGUE`.
7. `renderer.hands-free.test.ts` em TDD, começando pelos caminhos de recusa (CAs 36–38) — são os que a v1.0 errou.
8. Glue no `renderer.js`: ponto único do detector → fila + pre-roll → laço → pré-condições/gancho → watchdogs → observador de utterance dentro de `synth.speak`.
9. Estender `renderer.speech-parity.test.ts` ao 4º módulo e registrar réplicas e constantes novas.
10. Rodar os quatro comandos na raiz; conferir os `git diff` vazios do CA 45; acrescentar a *Nota de implementação* ao ADR-0023 (sem alterar Decisões).

---

# Estratégia de Testes

Tudo sem microfone, sem áudio real, sem o modelo Silero e sem Electron.

- **`hands-free.test.ts`** — constantes pinadas; tabela linha a linha; produto cartesiano 9 × 18; `disable` de todos os estados; predicado de microfone aberto; `speakingWatchdogMs`; sequências sintéticas de probabilidade (histerese, zeragem, fala curta, teto); API mínima do segmentador.
- **`vad-resources.test.ts`** — disponibilidade por artefato ausente, `describe`, `load` feliz e falho sem lançar.
- **`renderer.hands-free.test.ts`** (harness da SPEC-0045, com `clock.advance` e detector injetado pela porta) — três causas de indisponibilidade e as três reavaliações; arranque desligado; ciclo completo; invariante de microfone fechado; pre-roll por tamanho exato de payload e teto de bytes; overrun; rearme e sua cessação; **as três pré-condições**, o **gancho de início confirmado** e o **watchdog de `thinking`**; desligamento a partir de cada estado (incl. `cancel()` em `thinking`); cada desfecho de exceção; os seis caminhos de `onDone`; ocorrência única de `new SpeechSynthesisUtterance(`; forma exata do payload IPC; ausência de persistência.
- **Asserções estáticas** — canais em `main.ts`, métodos em `preload.cjs`, CSP exata, `<script>` único, ausência de rede e de carregamento dinâmico, confinamento de `ort.`/`InferenceSession.create` ao ponto único, comentários de duplicação.
- **Regressão** — `renderer.boot.test.ts`, `renderer.voice-input.test.ts`, `renderer.voice-triggers.test.ts`, `renderer.speech-parity.test.ts`, `renderer.persona-crud.test.ts`, `renderer.permissions-panel.test.ts`, `renderer.memory-ask.test.ts`, `renderer.gesture-serialization.test.ts` e a suíte completa da raiz.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz e de `apps/desktop`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `PLATFORM_STATE.md` e as **três** correções obrigatórias no `Roadmap.md` listadas em *Item do Roadmap*) é do passo `doc-sync` no fecho, não do `spec-implementer`. O implementador toca apenas este arquivo e a *Nota de implementação* no ADR-0023.

---

# Restrições

- **A salvaguarda de três camadas do ADR-0023(b) é condição de validade da fatia.** O `ConfirmPort` e as outras duas portas de confirmação saem com diff vazio (é o que satisfaz o **Artigo 8**); o freio nunca depende de trabalho em voo; o modo é sempre opt-in e sempre sinalizado. Se a implementação concluir que precisa tocar alguma das portas, **pare e devolva ao `spec-drafter`**.
- **Nenhum estado longo sem saída garantida** — a invariante de saída do *Contrato* é verificada por CA em `sending`, `thinking` e `speaking`.
- **Microfone fechado em `transcribing`/`sending`/`thinking`/`speaking`** — invariante do ADR-0023(e), expressa por `handsFreeMicrophoneOpen`.
- **Nada de rede, em nenhum caminho** (ADR-0023(f)), inclusive para runtime e modelo.
- **Nenhum estado persistente novo** (Artigo 11): o modo morre com a app.
- **A exceção do ADR-0023(d) é do VAD e só dele**: a transcrição continua integralmente no main process.
- **Sem bundler e sem carregamento dinâmico de script** (ADR-0019): um `<script>` estático local; a única mudança de CSP permitida é `'wasm-unsafe-eval'`.
- **Nenhuma réplica registrada no gate de paridade é alterada**, e nenhuma decisão de voz já pinada (SPECs 0035/0036/0040/0041/0043) é reaberta.
- **O Core não sabe que existe voz**: nenhuma Tool, Skill, Persona ou contrato novo.
- **Runtime e modelo não são versionados no git** (mesma regra do Piper e do whisper).

---

# Observações

- **Smoke real não confirmado — a pendência cresce, e agora inclui o item mais difícil de dublar.** Nenhum microfone, dispositivo de áudio, binário de STT/TTS ou modelo de VAD existe no shell de automação; sem WindowServer, a janela nem abre. Some-se ao CA 25 da SPEC-0040 e ao registro da SPEC-0046: *o laço de conversa em tempo real de ponta a ponta, a qualidade real do Silero em ambiente ruidoso, o acerto dos 3 s em uso, o eco com alto-falante aberto (mitigado por construção, nunca observado), a latência acumulada fala→resposta falada, e o rearme da janela de captura ao longo de vários minutos de escuta.*
- **Quarentena pegajosa mata o modo a cada tentativa.** Enquanto não existir o canal de push que avisa o renderer quando o trabalho abandonado assenta (candidato já nomeado em `NEXT_CONTEXT.md`), uma sessão em quarentena faz o modo desligar a cada tentativa de turno. Registrado como custo consciente desta fatia, não como bug a contornar aqui.
- **Pre-roll e fila são lógica do glue sem contraparte em TS** (D19) — caem no **limite (i)** do gate de paridade (SPEC-0047): não há fonte contra a qual comparar. Mitigado por CAs de comportamento observável (32–34), não por paridade. Resíduo consciente, registrado para não ser descoberto depois.
- **Falso disparo de fim de fala continua possível** (ADR-0023): pausa longa no meio do raciocínio envia frase pela metade. Mitigado pelos 3 s e pelo mínimo de fala, não eliminado.
- **`ScriptProcessorNode` segue depreciado** (SPEC-0046/D5) e agora carrega também o caminho do VAD; a migração para `AudioWorkletNode` continua fatia própria.
- **Primeira inferência no renderer do projeto.** Deve ser lida sempre junto do ADR-0022(a) e do ADR-0023(d), nunca isolada.
- **Sem barge-in**, o usuário espera a resposta terminar de ser falada para poder falar de novo.
- **Empacotamento** (`extraResources`, `NSMicrophoneUsageDescription`) segue item de Fase 3.

---

# Checklist para IA

Antes de implementar:

- ler `ADR-0023` **inteiro**, mais `ADR-0022`, `ADR-0021`, `ADR-0019`, `apps/desktop/CLAUDE.md`, `src/stt-engine.ts`, `src/media-permission.ts`, o manipulador de `#chat-form` e o glue de voz de `renderer.js`;
- ler as seções *Contrato* e *Pré-condições de envio* e tratá-las como dado;
- identificar o módulo responsável (Input Gateway + Output Gateway, em `apps/desktop`);
- validar dependências (SPECs 0033/0040/0045/0046/0047/0048/0049/0050/0051 `Done`; ADR-0023 `Accepted`).

Durante:

- toda lógica pura no TS; o renderer só captura, infere pela porta, pinta e replica com comentário;
- injetar todo efeito colateral (IO, tempo, inferência, mídia);
- fail-closed em cada bifurcação; `capture:end` em `finally`, sempre; microfone fechado antes de qualquer outro efeito ao sair de `capturing`;
- nenhum estado longo sem watchdog; nenhuma transição para `thinking` sem início confirmado;
- não expandir escopo: nada de wake word, barge-in, fallback de energia, retentativa, streaming ou mudança em `core-bridge.ts`.

Depois:

- rodar `typecheck`/`lint`/`test`/`format:check` na raiz;
- conferir os `git diff` vazios do CA 45 e a CSP exata do CA 21;
- validar os 45 critérios de aceitação um a um;
- acrescentar a *Nota de implementação* ao ADR-0023 e registrar lições aprendidas.

---

# Resultado Esperado

Com a app aberta, o usuário liga um botão e passa a **conversar** com o Atlas: fala, para de falar, e três segundos depois a frase já foi transcrita, enviada e respondida em voz alta — sem tocar em nada entre os turnos. Enquanto o assistente pensa e enquanto fala, o microfone está comprovadamente fechado, o que elimina o eco por construção e mantém o modo longe da classe de privacidade do wake word. Nenhum estado do modo pode ficar preso: se a transcrição falhar, se o envio for recusado por uma guarda que já existia, se o turno nunca responder ou se a fala nunca terminar, o modo desliga sozinho dizendo por quê — e o mesmo botão que abriu o microfone o fecha na hora, em qualquer estado, acionando o cancelamento da SPEC-0051 quando há turno em voo. Tudo roda na máquina: o detector de voz é um modelo de 2 MB empacotado, executado em WASM sobre um áudio que nunca sai do renderer e atrás de uma porta que permite trocá-lo num lugar só; a transcrição segue no main process, como sempre; nenhuma chamada de rede acontece em nenhum ponto, e nada — áudio, transcrição ou estado do modo — toca o disco. Quando falta o motor de transcrição, o detector ou qualquer voz de saída, o botão fica desabilitado explicando o motivo, e volta a habilitar sozinho assim que a peça que faltava aparece. O resto da app continua exatamente como estava: o push-to-talk da SPEC-0046 e o "🔊 Ouvir" das SPECs 0035/0040 seguem intactos, e nenhuma réplica do gate de paridade é tocada. Do ponto de vista da arquitetura, o Atlas continua sem saber que existe voz — o texto falado entra pela mesma porta do texto digitado, o `ConfirmPort` continua sendo o único a decidir sobre ação destrutiva (que é o que satisfaz o Artigo 8 e sustenta a reversão do ADR-0023), e os únicos componentes que mudaram são os Gateways do desktop.

---

# Decisões de design

Em formato de veto (Emenda v1.1 da Constituição). **Nenhuma escalação permanece aberta.**

A **v1.1** responde ao 1º veto do `architecture-reviewer`, sem reabrir nenhuma decisão validada: **A1** (D14 reescrita + D23), **A2** (D20), **A3** (D5/D6 reescritas), **A4** (D21), **A5** (D19), **A6** (D9 emendada + D22), **A7** (D24), mais a rastreabilidade ao **Artigo 8** (Motivação, Referências e Nota de implementação do ADR). As Decisões (a)–(f) e as quatro decisões de produto do ADR-0023 **não são reabertas** por nenhuma decisão abaixo.

**D1. Perfil: `completo`.**

- **Decisão:** pipeline completo, não o fast-path micro.
- **Porquê:** falha em pelo menos quatro condições da Emenda v1.2 — vive em `apps/desktop`, cria dois módulos-fonte novos, muda a CSP e a superfície de mídia do renderer, e implementa um ADR recém-aceito que supersede parcialmente outro. Confirmado no gate.
- **Alternativa descartada:** `micro` — sequer se aproxima da fronteira.

**D2. A responsabilidade fica nos Gateways dentro de `apps/desktop`; nenhum `Voice Service` é criado.**

- **Decisão:** todo o código vive em `apps/desktop/src`, sem package novo.
- **Porquê:** mesma base da SPEC-0046/D2 — o Module Catalog atribui "voz" ao Input Gateway, localizado na aplicação cliente; "Voice Service" é *componente futuro previsto*, cuja criação exigiria o Architecture Decision Process. O ADR-0023 confirma que nenhum módulo novo é necessário.
- **Alternativa descartada:** `packages/voice` — com um consumidor só, é indireção pura (Artigo 4).

**D3. Wake word continua fora, e esta fatia não a aproxima.**

- **Decisão:** o microfone só abre por gesto explícito e fecha por gesto explícito ou por fim de turno; nenhum código de ativação por voz é escrito ou preparado.
- **Porquê:** ADR-0023, *Candidatos futuros*, é explícito; a reserva do ADR-0022 e do Roadmap (l. 157) segue de pé.
- **Alternativa descartada:** deixar o gancho pronto atrás de um interruptor — código de escuta permanente no repo é superfície de risco ainda que desligada, e tê-lo é decisão humana.

**D4. Silero VAD v5 sobre `onnxruntime-web` v1.20.1, wasm-only, 1 thread, sem proxy.**

- **Decisão:** modelo, contrato de grafo e runtime pinados com versão exata e cláusula de parada.
- **Porquê:** o ADR-0023 fixou "Silero em WASM no renderer" e delegou versão/origem à SPEC. A v5 é a série corrente e exige frames de 512 amostras (32 ms) — cadência que casa exatamente com o `ScriptProcessorNode` de 4096 já em uso (8 frames por callback). O build wasm-only com 1 thread evita Worker, `SharedArrayBuffer` e COOP/COEP, que sob `file://` seriam uma segunda decisão de segurança dentro de uma fatia que já mexe na CSP.
- **Alternativa descartada:** Silero v4 (frames variáveis — cadência não determinística no teste); `onnxruntime-node` no main (rejeitado pelo ADR-0023(d)); empacotadores prontos como `@ricky0123/vad-web` (arrastam bundler e decisões que não são nossas); versão sem pino (mataria a comparabilidade no teste).

**D5. Runtime e modelo entram no renderer sem `fetch`: `<script>` estático local para o JS, `ArrayBuffer` por IPC para os binários.** *(reescrita na v1.1 — achado A3)*

- **Decisão:** **um** `<script>` estático apontando para `vendor/vad/`; o main lê os artefatos binários e os entrega por `'atlas:vad:resources'`; o renderer usa `ort.env.wasm.wasmBinary` e `InferenceSession.create(<ArrayBuffer>)`. Sob cláusula de parada ficam as **propriedades** (zero rede, zero carregamento dinâmico, binários por `ArrayBuffer`), não os nomes dos arquivos.
- **Porquê:** sob `file://` o Chromium bloqueia `fetch` de arquivo local, e o CA 15 da SPEC-0046 já proíbe `fetch`/XHR no renderer — deixar o ORT buscar o próprio `.wasm` quebraria as duas coisas. Ler no main é o lado que já tem acesso a arquivo por decisão de arquitetura, e mantém o áudio (o dado sensível) inteiramente no renderer, como o ADR-0023(d)(ii) quer. **A v1.0 errou ao pinar nomes de arquivo do dist como se fossem decisão**: o gate mostrou que o pareamento escolhido era inclusive suspeito (`.jsep.wasm` é da variante JSEP, não do bundle wasm-only), e uma cláusula de parada apontada para um detalhe de empacotamento não verificado pararia o pipeline por um não-problema — ou, pior, seria "corrigida" ad hoc, corroendo a autoridade da cláusula onde ela importa.
- **Alternativa descartada:** deixar o ORT resolver `wasmPaths` sozinho (falha sob `file://` e fura o gate offline); embutir o `.wasm` em base64 no JS; servir por `protocol` custom do Electron (superfície nova de origem/segurança para o que dois `ArrayBuffer` resolvem); manter os nomes sob cláusula de parada (o erro da v1.0).

**D6. Um diretório canônico ao lado do renderer, sem override por env; nomes e quantidade de artefatos derivados do pacote pinado.** *(reescrita na v1.1 — achado A3)*

- **Decisão:** `apps/desktop/src/renderer/vendor/vad/`, não versionado; o main o resolve a partir do próprio módulo; `vad-resources.ts` verifica **os artefatos que a distribuição pinada exigir**, e o CA 14 pede um teste por artefato exigido.
- **Porquê:** o `<script>` só pode ser referenciado por URL relativa ao documento (sem bundler, ADR-0019), o que fixa o diretório junto do `index.html`; ter os binários em outro lugar criaria dois layouts para a mesma fatia. Piper e whisper precisam dos três níveis porque seus binários são invocados **pelo main** e podem vir do instalador; aqui o consumidor é o documento. E o conjunto exato de artefatos pertence ao empacotamento do ORT, não ao desenho do Atlas — pinar isso aqui seria congelar um detalhe alheio numa SPEC.
- **Alternativa descartada:** replicar `ATLAS_*_DIR` → `resourcesPath` → dev por simetria (um override que o `<script>` não pode honrar vale para metade dos artefatos — inconsistência pior que a ausência); `apps/desktop/resources/vad/` alcançado por travessia relativa sob `file://` (frágil, dependente de quirk de origem opaca).

**D7. CSP ganha exatamente `'wasm-unsafe-eval'` em `script-src` — e nada mais.**

- **Decisão:** `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; media-src 'self' blob:`, comparada por teste como string inteira.
- **Porquê:** compilar WASM exige esse token; sem ele o ADR-0023(d) é inexequível. Ele autoriza **só** WebAssembly, não `eval` de JS — é o menor afrouxamento que entrega a decisão do ADR, e o ADR-0019 não pina CSP alguma, então isto é derivado do ADR-0023(d), não decisão arquitetural nova (confirmado no gate). Fixar a string inteira converte "não afrouxar mais" de convenção em gate mecânico.
- **Alternativa descartada:** `'unsafe-eval'` (autoriza `eval` de JS, desproporcional); manter a CSP e rodar o VAD no main (exatamente a alternativa que o ADR-0023(d) rejeitou); não declarar CSP (regressão de segurança).

**D8. Sem Silero, o modo fica indisponível com motivo — o fallback de limiar de energia não é implementado nesta fatia.**

- **Decisão:** três causas de indisponibilidade desabilitam o toggle com motivo visível; a porta `VoiceActivityDetector` fica injetável (ponto único, D21) para que um fallback futuro seja local.
- **Porquê:** o ADR-0023 rejeitou o limiar de energia para o uso normal e o manteve apenas como "fallback natural" **caso o VAD se mostre indisponível** — condição hipotética que não ocorreu. Entregá-lo agora seria um segundo detector com tabela de testes própria para um caso não observado (Artigo 14), com o risco pior de o usuário conversar num detector silenciosamente pior. Fail-closed com motivo é o precedente A2 da SPEC-0035.
- **Alternativa descartada:** cair para energia automaticamente (degradação invisível — Artigo 13); remover a porta (tornaria a troca futura não-local, contra o ADR-0023(c)).

**D9. Habilitação exige STT + VAD + **alguma** saída de voz — não especificamente o Piper — e é **reavaliada** nos gatilhos assíncronos.** *(emendada na v1.1 — achado A6)*

- **Decisão:** o toggle habilita quando `stt.available()`, `vad.available()` e `currentVoiceBackend().backend !== 'none'`; a condição é recalculada por `refreshHandsFreeToggle()` nos **três** gatilhos assíncronos — `voiceschanged`, chegada do catálogo/disponibilidade Piper (`loadPiperVoices`) e resposta de `'atlas:vad:available'` —, além do toggle ficar desabilitado enquanto `chatTurnInFlight || askInFlight`.
- **Porquê:** o texto "sem Piper o toggle fica desabilitado" está nas *Consequências* do ADR-0023, não nas Decisões; seu conteúdo operativo é "nunca ativo-porém-mudo". Exigir Piper literalmente amputaria o modo degradado que as SPECs 0041/0043 mantêm de pé (ADR-0021(c)). **A v1.0 parou aí e errou pela metade**: resolver a condição point-in-time no load reintroduziria o falso-negativo que `apps/desktop/CLAUDE.md` proíbe em letra ("nunca resolva disponibilidade de voz point-in-time no load"), fazendo o modo nascer desabilitado por "sem voz" numa máquina que fala perfeitamente — o oposto do que esta própria decisão promete. Os dois gatilhos de voz já existem e já são usados por `refreshSpeakButton`/`populatePersonaVoiceSelect`; reusá-los é barato.
- **Alternativa descartada:** exigir Piper ao pé da letra (indisponibilidade sem causa técnica, contra o ADR-0021(c)); habilitar sem nenhuma voz (ativo-porém-mudo, proibido pela Consequência do ADR); avaliar só no load (falso-negativo conhecido e documentado).

**D10. A máquina de estados é módulo puro, com tabela exaustiva e regra de fecho, replicada no renderer sob o gate de paridade.**

- **Decisão:** 9 estados × 18 eventos em `hands-free.ts`, com "evento não previsto ⇒ estado inalterado" pinado como linha; réplica em `renderer.js` com comentário, e `hands-free.ts` entra na lista vigiada de `renderer.speech-parity.test.ts` (que passa a vigiar quatro módulos).
- **Porquê:** um laço com microfone aberto e envio automático é a fatia com mais estados do app; deixá-lo implícito em flags o tornaria não-verificável exatamente onde importa (o microfone está aberto agora?). O gate da SPEC-0047 já é generalizado a N módulos e enumera exports em runtime — acrescentar o quarto é extensão de mecanismo existente.
- **Alternativa descartada:** flags booleanas no renderer (combinações inválidas representáveis, invariante do ADR-0023(e) indemonstrável); escrever a máquina só em JS (sem fonte TS o gate não tem contra o que comparar — limite (i) da SPEC-0047).

**D11. Auto-envio pelo `submit` de `#chat-form`, nunca por chamada direta a `window.atlas.chat.send`.**

- **Decisão:** o glue escreve em `#chat-input` e dispara `dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))`.
- **Porquê:** o caminho de envio já carrega cinco camadas construídas por quatro SPECs (guardas de 0048/0049, `.catch` com aviso pinado, `.finally` de origem única, guarda estrutural do bridge em 0050, aviso de cancelamento em 0051). Um segundo caminho duplicaria todas elas e seria a próxima deriva por acidente. A guarda programática da SPEC-0048/D2 existe precisamente para este tipo de chamador — e o gancho de D23 é o que torna a recusa dela observável.
- **Alternativa descartada:** chamar `chat.send` direto (duplica guardas e avisos, nasceria fora da serialização); `form.requestSubmit()` (suporte irregular no jsdom).

**D12. A transcrição do modo é anexada ao conteúdo de `#chat-input`, mesma regra da SPEC-0046.**

- **Decisão:** nenhuma regra nova de escrita no campo; um rascunho digitado antes de ligar o modo é preservado e vai junto no primeiro envio.
- **Porquê:** uma regra só para os dois caminhos de voz é mais simples e previsível que duas; o campo fica visível durante todo o modo, então nada é enviado sem estar na tela. Limpar o campo destruiria trabalho do usuário sem consentimento (Artigo 13).
- **Alternativa descartada:** substituir o conteúdo no modo (descarte silencioso); recusar ligar com o campo preenchido (fricção sem risco correspondente).

**D13. Rearme periódico da janela de captura a cada 15 s, sem tocar `media-permission.ts`.**

- **Decisão:** enquanto `listening`/`capturing`, o renderer chama `'atlas:stt:capture:begin'` a cada `CAPTURE_REARM_MS`; cessa no instante em que o microfone fecha.
- **Porquê:** a escuta pode durar muito mais que o watchdog de 35 s, e a idempotência de `begin` já está pinada como contrato — usá-la é composição. Ampliar o watchdog aumentaria a janela de concessão **para todos** os caminhos por causa de um só; e o rearme cessando com o fecho preserva a propriedade que torna o watchdog útil.
- **Alternativa descartada:** aumentar o watchdog (concessão maior para todo mundo, contra D9/D17 da SPEC-0046); desarmá-lo com o modo ligado (concessão permanente); canal de janela "longa" próprio (dois pontos de verdade).

**D14. Desligar o modo é o freio: fecha o microfone imediatamente em qualquer um dos 9 estados e, com turno em voo, chama `window.atlas.cancel()`.** *(alcance ampliado na v1.1 — achado A1)*

- **Decisão:** `disable` é aceito nos 9 estados (incluindo `sending`); o fecho do microfone acontece antes de qualquer outro efeito; em `thinking`, o gesto aciona o cancelamento da SPEC-0051 e o aviso pinado sai pelo `.catch` já existente.
- **Porquê:** é a camada 2 da salvaguarda do ADR-0023(b), que exige um freio que "nunca depende de haver ou não trabalho em voo". Reusar `cancelInFlightOperation` mantém um único mecanismo de desistência, com a quarentena e a contenção do `ConfirmPort` já validadas.
- **Alternativa descartada:** desligar só ao fim do turno (o freio deixaria de ser freio); segundo botão de cancelar dentro do modo (dois gestos para a mesma intenção, contra a decisão de produto 3 do ADR).

**D15. Qualquer rejeição do turno desliga o modo com aviso; o modo nunca tenta de novo em laço.**

- **Decisão:** `turnRefused`, `turnFailed`, `thinkingTimeout` e `transcriptFailed` levam a `off` com aviso distinguível; só `transcriptEmpty` reabre o microfone.
- **Porquê:** a quarentena de sessão da SPEC-0051 é **pegajosa** até o trabalho abandonado assentar — reabrir o microfone produziria um laço de erro caro (cada volta é uma transcrição real) e ruidoso. Parar e devolver o controle ao usuário com um clique é simples e transparente (Artigos 13 e 14). Transcrição vazia é o único caso benigno e não custa turno.
- **Alternativa descartada:** retentar com backoff (retry é do Task Manager pelo Module Catalog, e hoje não existe); manter o modo ligado sem escutar (indicador mentiroso).

**D16. `speakText` ganha `onDone` com seis caminhos e watchdog; desligar o modo não interrompe a fala em curso.**

- **Decisão:** `onDone` chamado exatamente uma vez em `ended`/`error` do `<audio>`, `end`/`error` do utterance, backend `none`, ou watchdog `clamp(8 s + 80 ms × caracteres, 8 s, 120 s)`.
- **Porquê:** o ADR-0023(e) faz a reabertura do microfone depender do fim da fala, então "fim da fala" precisa ser evento com desfecho garantido — sem watchdog, uma falha de áudio prenderia o modo em `speaking`. Não interromper a fala ao desligar respeita as decisões de produto 3 e 4 do ADR.
- **Alternativa descartada:** estimar a duração por heurística sem eventos (frágil e invisível); mudar `speech-output.ts` (violaria o diff vazio); cancelar a fala ao desligar (introduziria de contrabando o controle de interrupção que o ADR adiou).

**D17. Contrato pinado como dado desta SPEC, com cláusula de parada apontada só para o que é decisão.** *(refinada na v1.1 — achado A3)*

- **Decisão:** modelo, contrato de grafo, versão e configuração do runtime, propriedades de carregamento, ponto único de inferência, constantes, tabela de estados, pré-condições e regras de interação ficam sob cláusula de parada; o layout concreto do dist, não.
- **Porquê:** precedente das SPECs 0040 (D4/D9/D10/D13) e 0046 (D12) e delegação explícita do ADR-0023 — uma fonte de verdade só (Artigo 1), sem números escolhidos no meio da implementação virando comportamento não documentado (invariante 8). Mas a cláusula só tem autoridade se **todo** item sob ela for de fato uma decisão: apontá-la para um detalhe de empacotamento a transforma em ruído que a implementação aprende a ignorar.
- **Alternativa descartada:** deixar limiares e histerese a critério da implementação (mudariam o produto em silêncio); duplicar o contrato no ADR-0023 (duas fontes a sincronizar); manter tudo sob a cláusula, inclusive o dist (o erro da v1.0).

**D18. Prioridade `High`.**

- **Decisão:** `High`, não `Critical` nem `Medium`.
- **Porquê:** "conversas contínuas" é requisito explícito do PRD e a fatia consome um ADR aceito no mesmo dia, a pedido direto do usuário — mas nada está quebrado sem ela, e as duas pontas da voz já funcionam separadamente.
- **Alternativa descartada:** `Critical` (não há regressão nem bloqueio); `Medium` (subestimaria requisito nominal do PRD).

**D19. Pre-roll e fila de inferência são propriedades do glue, declaradas como resíduo consciente; o segmentador só vê probabilidades.** *(v1.1 — achado A5)*

- **Decisão:** `createTurnSegmenter` perde `queueLimit` e o desfecho `vadOverrun`; sua API é exatamente `{ push(probability), reset() }`. O anel de pre-roll e a fila vivem no glue; `PRE_ROLL_FRAMES`/`VAD_QUEUE_LIMIT` continuam **constantes exportadas** por `hands-free.ts` (portanto sob o gate de paridade), e o comportamento é coberto por CAs de efeito observável (32–34), não por paridade.
- **Porquê:** a v1.0 pedia, no CA 11, que um módulo que **não vê frames nem fila** provasse uma propriedade de fila — critério impossível de satisfazer honestamente, que na implementação viraria ou um parâmetro decorativo ou um afrouxamento silencioso do teste. O segmentador consumir só probabilidades é também o que mantém a porta do detector trocável (D21): a decisão de "quando a fala acabou" não pode depender de como os frames chegam. O custo é real e fica registrado: pre-roll e fila caem no **limite (i)** do gate de paridade (lógica no renderer sem contraparte TS) — por isso o tamanho exato do payload virou CA mecânico, que é a prova mais forte disponível sem fonte TS.
- **Alternativa descartada:** passar `queueDepth` a cada `push` (acopla o segmentador ao transporte de frames, pelo benefício de um evento); levar o buffer de áudio para dentro do módulo puro (traria `Float32Array` e gestão de memória para um módulo que existe para ser trivialmente testável, e faria o TS conhecer a captura); manter o CA impossível da v1.0.

**D20. O caminho `'os'` obtém `onDone` por um observador dentro de `synth.speak`, não por mudança em réplica alguma.** *(v1.1 — achado A2)*

- **Decisão:** `synth.speak` (implementação da porta `SpeechSynthesisPort`, **não** réplica registrada) passa o `SpeechSynthesisUtterance` recém-criado a um observador de módulo antes de `window.speechSynthesis.speak(...)`; o observador anexa `end`/`error` e é no-op com o modo desligado. `createSpeechOutputGlue` e as demais réplicas saem inalteradas; `speech-output.ts` sai com diff vazio. CA mecânico: exatamente uma ocorrência de `new SpeechSynthesisUtterance(` em `renderer.js`.
- **Porquê:** o gate mostrou que a v1.0 tinha dois CAs em contradição — observar o fim da fala do SO exigiria mexer na réplica de `createSpeechOutput` (reprovado pelo gate de paridade) ou em `speech-output.ts` (proibido pelo diff vazio da própria D16). O ponto de criação do utterance é o `synth`, que existe justamente como adaptador do navegador e nunca foi replicado de nada — anexar ali resolve sem tocar em nenhum dos dois lados protegidos, e a ocorrência única do construtor torna a garantia verificável em vez de convencional.
- **Alternativa descartada:** anexar listeners dentro de `createSpeechOutputGlue` (deriva exatamente onde o gate existe para reprovar); expor eventos em `speech-output.ts` (mudaria um módulo puro do main por necessidade do renderer, quebrando o diff vazio e arrastando as três réplicas); inferir o fim da fala por `speechSynthesis.speaking` em polling (heurística com corrida, para um evento que a API já dá).

**D21. A porta do detector tem ponto de criação único no glue, e é por ele que o teste injeta o dublê.** *(v1.1 — achado A4)*

- **Decisão:** uma fábrica única cria o objeto que satisfaz `VoiceActivityDetector`; `ort.`/`InferenceSession.create` só podem aparecer dentro dela (verificação estática); o harness substitui **a fábrica**, e um teste exercita o laço inteiro **sem** `window.ort` presente.
- **Porquê:** na v1.0 a porta era decorativa — declarada em TS, consumida por ninguém, e o dublê entrava pelo runtime (`window.ort`), ou seja, o ponto de troca real era o ORT, não a porta. Isso não satisfaz o ADR-0023(c), que exige a porta **para que trocar o detector depois seja local**: com o teste entrando pelo runtime, uma troca de detector reescreveria o glue e nenhum teste notaria. Exigir um teste que roda sem `window.ort` é a prova mecânica de que a fronteira é real, no mesmo espírito do `spawn` injetado das SPECs 0040/0046.
- **Alternativa descartada:** manter só a interface declarada (porta decorativa — a v1.0); injetar o detector desde `index.html` (não há como, sem bundler); testar só pelo dublê de `window.ort` (prova o runtime, não a porta).

**D22. A correção do Roadmap é escopo obrigatório do fecho, em três pontos.** *(v1.1 — achado A7)*

- **Decisão:** o `doc-sync` acrescenta a linha de conversa contínua ao item 2.3, **qualifica a l. 156** ("nunca enviada automaticamente" passa a valer fora do modo hands-free, com nota apontando ao ADR-0023) e revisa o cabeçalho "entregue por inteiro".
- **Porquê:** a l. 156 é uma reafirmação da cláusula que o ADR-0023 supersede — o próprio ADR a cita como tal. Acrescentar uma linha sem qualificar a antiga deixaria dois documentos vivos afirmando o contrário um do outro, exatamente o que o Artigo 1 e a invariante 8 proíbem, e o próximo agente a ler o Roadmap concluiria que o modo é ilegal. Precedente: a SPEC-0044 também registrou exceção de Roadmap e a corrigiu no fecho.
- **Alternativa descartada:** só acrescentar a linha nova (contradição viva); emendar o Roadmap agora, antes do gate (documento vivo alterado por SPEC ainda em `Draft`); tratar como detalhe editorial do fecho (foi assim que a contradição quase passou).

**D23. `sending` é estado próprio, com pré-condições verificadas e gancho de início confirmado no mesmo tick; `thinking` ganha watchdog.** *(v1.1 — achado A1)*

- **Decisão:** entre `transcribing` e `thinking` entra `sending`, que (i) verifica as três pré-condições espelhadas das guardas do `#chat-form` antes de despachar e (ii) exige a confirmação síncrona de `notifyHandsFreeTurnStarted()` ao retornar do `dispatchEvent`; ausência ⇒ `turnRefused`. Em `thinking`, um watchdog de `THINKING_WATCHDOG_MS` produz `thinkingTimeout`.
- **Porquê:** a v1.0 afirmava que a recusa do bridge (SPEC-0050) viraria `turnFailed` — **factualmente falso**: o manipulador de `#chat-form` tem três `return` silenciosos **antes de qualquer promessa** (`chatSession === null`, `chatTurnInFlight || askInFlight`, texto vazio), então a guarda do renderer dispara primeiro e nenhum `.then`/`.catch` existe para notificar o modo. Pela regra de fecho da própria tabela, o modo ficaria em `thinking` **para sempre**, com o microfone fechado e o indicador mentindo — violando o argumento da D16 ("desfecho garantido") e o Artigo 13, em cenários banais (ligar o modo com um `ask` em voo, sessão encerrada por troca de Persona, fala só com ruído). A confirmação síncrona é possível porque `dispatchEvent` é síncrono: não há tick, timer nem promessa envolvidos, e por isso não há corrida. O watchdog cobre o caso restante — o turno que começou de verdade e nunca responde.
- **Alternativa descartada:** confiar na guarda do `core-bridge` (nunca alcançada nesses caminhos); verificar só as pré-condições sem o gancho (a guarda do manipulador pode passar a recusar por motivo novo numa SPEC futura, e o modo voltaria a travar em silêncio); verificar só o gancho sem as pré-condições (perderia a mensagem específica por motivo, que é o que o usuário precisa ler); watchdog em `sending` (desnecessário: o desfecho é síncrono); fazer o watchdog de `thinking` chamar `cancel()` sozinho (desistir do trabalho do usuário sem que ele peça — o freio é gesto dele, D14).

---

# Resíduos resolvidos pelo `spec-implementer`

**R1-R4** vêm do 2º passe do `architecture-reviewer` (gate G3, que aprovou a SPEC e deixou quatro resíduos como instruções vinculantes ao `spec-implementer`, a resolver e registrar aqui — não devolvidos ao `spec-drafter`). **R5** vem da 1ª reprovação do `spec-validator` (achado de teste: cinco CAs declarados atendidos sem prova; corrigidos em `renderer.hands-free.test.ts`/`renderer.js` — este é o único dos cinco que expôs uma decisão de design, não só ausência de teste). **R6** vem da 2ª reprovação do `spec-validator`, escalada ao usuário e decidida por ele em 2026-08-06 (emendar o texto do CA 39 em vez de escrever os três testes faltantes — cobertura de "desligar o que já está desligado" seria fachada, não prova). Registro das seis escolhas:

**R1 — a linha duplicada `(capturing, speechEnd)` da tabela de estados.** Resolvido pela **segunda alternativa oferecida**: o glue **nunca despacha** o evento `'speechEnd'` a `nextHandsFreeState` quando o segmentador devolve `{ kind: 'speechEnd', discarded: true }`. `HandsFreeEvent`/`nextHandsFreeState` continuam com exatamente 18 eventos (nenhum evento sintético de descarte foi criado) — `capturing + speechEnd` tem uma única transição possível em `nextHandsFreeState`: `→ transcribing`. O caso de descarte é tratado inteiramente pelo glue: ao ver `discarded === true`, ele chama `segmenter.reset()` (interno ao próprio `push`, na verdade — o segmentador já se reseta antes de devolver o evento) e mantém o estado local em `listening`, sem passar pelo reducer. Isto não viola a cláusula de parada de D17 nem a invariante do ADR-0023(e): tanto `capturing` quanto `listening` são estados de microfone **aberto** (`handsFreeMicrophoneOpen` é `true` nos dois), então a escolha não abre nem fecha o microfone fora do que a tabela já previa — é só uma questão de qual variável de estado registra a mudança. Implementado em `src/hands-free.ts` (comentário no topo do arquivo) e replicado em `renderer.js`/`handsFreeProcessFrame`. CA6 cobre, em `hands-free.test.ts`, toda linha da tabela **representável** por `nextHandsFreeState(state, event)`; o comportamento de descarte (glue-only) é coberto por `renderer.hands-free.test.ts` (o segmentador em si já prova `discarded: true`/`false` nos CAs 9/10).

**R2 — indicador de `arming` e rearme.** `handsFreeIndicatorText('arming')` (`renderer.js`) devolve explicitamente `"⏳ Aguardando permissão do sistema…"` — nunca um texto genérico de "carregando" que pareceria travado durante os segundos (ou minutos, no primeiro uso em macOS) em que o diálogo nativo de `getUserMedia` está aberto. O rearme periódico (`handsFreeStartRearmTimer`) só chama `'atlas:stt:capture:begin'` quando `handsFreeMicrophoneOpen(handsFreeState)` é verdadeiro — ou seja, apenas em `listening`/`capturing`, exatamente como a l. 183 da SPEC exige; `arming` nunca aciona o rearme.

**R3 — `onDone` quando o backend `'os'` não produz utterance nenhum.** `speakText(text, onDone)` (`renderer.js`) usa `handsFreeUtteranceObserver`, setado imediatamente antes de qualquer chamada que possa criar um `SpeechSynthesisUtterance` (via `speechOutput.speak`/`synth.speak`). Se `synth.speak` retornar sem consumir o observador — porque a voz local sumiu entre a seleção e a fala (fail-closed, l. 267-271) **ou** porque `createSpeechOutputGlue.speak` fez no-op antes de chegar a `synth.speak` (texto vazio ou nenhuma voz local) — o chamador (`speakText`) detecta que `handsFreeUtteranceObserver` continua não-nulo logo após a chamada e resolve `finish()` ali mesmo. Sétimo caminho de `onDone`, coberto por `renderer.hands-free.test.ts` ("R3: voz local sumiu entre seleção e fala ⇒ onDone imediato, sem utterance"). CA41 (Critérios de Aceitação) passa a contar sete desfechos, não seis: `ended`/`error` do `<audio>` Piper, `end`/`error` do utterance do SO, backend `none`, watchdog, e este sétimo caminho R3.

**R4 — comentário desatualizado sobre o que é réplica.** O comentário acima de `const synth = {` em `renderer.js` foi reescrito para separar explicitamente `synth` (**implementação da porta** `SpeechSynthesisPort`, adaptador de navegador, nunca registrado no gate de paridade) das funções puras declaradas depois dele (`createSpeechOutputGlue`/`selectVoiceURI`/`selectLocalVoiceURI`, essas sim réplicas vigiadas por `renderer.speech-parity.test.ts`). O observador de utterance de D20/R3 (`handsFreeUtteranceObserver`) vive dentro de `synth.speak`, então precisava dessa distinção clara para que a próxima fatia não releia o comentário antigo e conclua, por engano, que `synth` é uma réplica registrada.

**R5 — a terceira pré-condição de envio ("texto não vazio") é código morto no fluxo real, e o CA 36 a descrevia como se fosse alcançável.** Ver a nota R5 na seção *Pré-condições de envio e gancho de início confirmado* (acima) para a análise completa. Resumo da decisão: mantida a guarda em `handsFreeSendTurn` (espelho estrutural fiel das três recusas do `#chat-form`, defensiva contra uma guarda futura que a torne alcançável de fato) — **não removida**, porque a transição `transcribing + transcriptEmpty → listening` que a torna inalcançável hoje está sob cláusula de parada (D17) e não pode ser reescrita só para "destravar" um teste. O CA 36 foi corrigido para exigir só as duas pré-condições genuinamente alcançáveis (`chatSession === null`, `askInFlight`); o cenário de transcrição vazia/só-espaços segue coberto, mas pelo teste de `transcriptEmpty` (CA 40), não por um teste de `turnRefused`. Além disto, o gate expôs e esta fatia corrigiu um bug real de duplicação de frame no anel de pre-roll (CA 32 — ver comentário em `handsFreeProcessFrame`, `renderer.js`): o segmentador agora é consultado ANTES de qualquer mutação do anel/acumulador, senão o frame que dispara `speechStart` seria contado duas vezes no payload transcrito.

**R6 — o texto do CA 39 exigia "um teste por estado" sobre os 9 estados, mas só 6 são um gesto real de "desligar".** Decisão humana de 2026-08-06 (escalada pela 2ª reprovação do `spec-validator`): emendar o texto do CA 39 para restringir a exigência aos seis estados **alcançáveis** por um clique real de desligar — `arming`, `listening`, `capturing`, `transcribing`, `thinking`, `speaking` —, todos já cobertos em `renderer.hands-free.test.ts` (bloco "freio: desligar fecha o microfone em qualquer estado"). Os três excluídos, e por quê:

- **`off`** — clicar o toggle neste estado **não é um gesto de desligar**: é o gesto de **ligar** (`nextHandsFreeState('off', 'enable') → 'arming'`, testado em CA29). Não existe "desligar o que já está desligado" para provar aqui; testar isso seria fachada, não cobertura real do freio.
- **`unavailable`** — o toggle está **desabilitado** neste estado por design (CA 26/28: `disabled = true`, motivo visível), e o próprio handler de clique trata isso como no-op explícito (`if (handsFreeState === 'unavailable') { return; }`). Não há efeito de freio a observar — o "desligamento" nem chega a ser tentado, porque não há nada ligado.
- **`sending`** — a própria SPEC pina que este estado "termina **no mesmo tick** do `submit`" (seção *Máquina de estados do modo*, invariante de saída): não existe gap assíncrono em que o glue esteja "em repouso" em `sending` para o harness clicar durante. A única prova possível desse estado é a do reducer puro — `nextHandsFreeState('sending', 'disable') → 'off'` —, já coberta exaustivamente pelo **CA 4** (`hands-free.test.ts`, "disable a partir de cada estado devolve off"), que testa os 9 estados sem exceção.

Nenhum destes três é uma lacuna de comportamento: é a mesma classe de achado do R5 (o texto do CA descrevia mais do que o desenho real permite provar), não um bug. `renderer.hands-free.test.ts:494-506` mantém o comentário explicando a exclusão, mas agora aponta para esta nota como a decisão registrada — nunca a única fonte da justificativa (mesmo cuidado do R4).
