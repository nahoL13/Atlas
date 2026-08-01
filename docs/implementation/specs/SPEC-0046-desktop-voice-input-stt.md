# SPEC-0046 — Entrada por voz (STT) no chat do desktop, por push-to-talk e motor local

> **Project Atlas — Implementation Specification**

Version: 1.3

---

# Informações Gerais

**ID**

SPEC-0046

---

**Título**

Entrada por voz (STT) no chat do `apps/desktop`: captura por push-to-talk, transcrição por `whisper.cpp` local no main process, texto entregue ao campo de entrada para revisão do usuário

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

`Fase 2 — 2.3 Voz` (l. 155, "Entrada por voz (STT)").

A ativação por voz (wake word, l. 157 do Roadmap, marcada como "candidato, não comprometido") **não** é consumida por esta SPEC — ver *Fora do Escopo* e a decisão D3.

---

# Objetivo

Quando esta SPEC estiver concluída deverá existir, no `apps/desktop`:

1. Um **botão de microfone no chat** que grava a fala do usuário enquanto ele explicitamente comanda a gravação (push-to-talk por alternância: um clique inicia, outro encerra), com estado visual inequívoco de "gravando" e um cancelamento explícito — que continua alcançável também durante a transcrição.
2. Uma **transcrição local por `whisper.cpp`**, sem rede, do áudio capturado, produzida como subprocesso do main process do Electron — no molde já validado pelo Piper ([ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md), SPEC-0040) e fixado para a entrada pelo [ADR-0022](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md).
3. O texto transcrito **inserido no campo de entrada do chat**, nunca enviado automaticamente: o usuário lê, edita se quiser, e envia com o mesmo gesto de sempre.
4. Um comportamento **fail-closed em toda a cadeia**: sem binário, sem modelo, sem permissão de microfone ou sem dispositivo de captura, o botão fica **desabilitado com aviso visível** — nunca ativo-porém-mudo (achado A2 da SPEC-0035), nunca caindo num serviço de reconhecimento em rede.
5. Uma **política de permissão de microfone explícita** no main process: o handler de permissões da `session` do Electron nega tudo por padrão e concede exclusivamente captura de áudio, e só durante uma **janela de captura declarada** pelo renderer por IPC — com ciclo de vida completo e watchdog, de modo que a janela nunca fique presa em aberto.
6. **Cobertura automatizada sem hardware de áudio**: o módulo de transcrição é testado com o executor de subprocesso injetado, e o glue do renderer é testado sobre o harness jsdom da [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) com `getUserMedia`/`AudioContext` dublados e **relógio injetável**.

Nenhum package de `packages/*` é alterado. Nenhum contrato público (`@atlas/contracts`) é tocado. Nenhum módulo novo é criado.

---

# Motivação

**O PRD pede.** *Requisitos Funcionais → Comunicação*: "O sistema deve permitir interação por voz." *Escopo Inicial*: "suporte básico à voz". Até aqui, a plataforma entregou apenas a metade de **saída** dessa exigência (SPECs 0035/0036/0039/0040/0041/0043 — TTS). A metade de **entrada** nunca foi entregue, e é o único candidato direto restante da Fase 2 (`NEXT_CONTEXT.md`, l. 38).

**O Module Catalog já tem dono.** *Input Gateway* — "Receber entradas do usuário e convertê-las para um formato comum consumido pelo Atlas", "Pode receber: texto; **voz**; atalhos…", localização "Aplicação cliente correspondente". Não há vácuo de responsabilidade: a entrada por voz é do Input Gateway, dentro de `apps/desktop`, exatamente como o TTS é do Output Gateway dentro de `apps/desktop`.

**O padrão arquitetural já foi pago.** O ADR-0021 estabeleceu, e a SPEC-0040 implementou, tudo que a entrada por voz precisa reusar: motor local sem rede, subprocesso invocado só pelo main process com `execFile`/`spawn` **injetável** e argv em array, resolução de recursos em três níveis (env → `resourcesPath` → diretório de dev), arquivo temporário efêmero fora da política de `readRoots`/`writeRoots`, e nenhuma dependência de rede em nenhum caminho. Esta SPEC é o espelho de entrada dessa mesma estrutura — e o ADR-0022 confirma, nas suas Consequências, que **nenhum padrão arquitetural novo** é introduzido.

**A única pergunta humana foi respondida.** A escolha do motor era dependência de execução binária nova — a classe de mudança que a Emenda v1.1 reserva à decisão humana. Ela foi escalada na v1.0 desta SPEC (E1) e **resolvida em 2026-08-01** pelo [ADR-0022](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) (`Accepted`): `whisper.cpp`, empacotado no instalador, modelo `small` quantizado, idioma fixado em PT-BR. A SPEC é auto-suficiente, sem pergunta em aberto.

---

# Referências

- [ADR-0022](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) — **decisão fundante desta SPEC**: `whisper.cpp` como motor de STT local, distribuição empacotada, modelo `small`, PT-BR fixado
- [PRD](../../02-product/ProductRequirementsDocument.md) — *Comunicação* ("interação por voz"), *Escopo Inicial* ("suporte básico à voz"), *Restrições* ("não expor detalhes internos"), *Critérios de Qualidade* (simplicidade, transparência, segurança)
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 2, 4, 7, 9, 10, 11, 13, 15 + Emenda v1.1
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — *Input Gateway* (l. 886–917), *Componentes que não devem ser criados sem revisão arquitetural* (l. 1067), *Componentes futuros previstos* → "Voice Service" (l. 1078)
- [Project Structure](../../03-architecture/ProjectStructure.md)
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.3
- [ADR-0019](../../06-adr/ADR-0019-desktop-electron-stack.md) — stack do desktop, `contextIsolation`/`nodeIntegration`, sem bundler
- [ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — motor de voz local como subprocesso do main process (molde estrutural direto desta SPEC)
- [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) — vínculo Persona↔voz (contexto; não alterado aqui)
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) — o Permission Service julga ações sobre o sistema de arquivos; áudio efêmero e permissão de mídia do Chromium estão fora dessa política (ver D9)
- [SPEC-0033](./SPEC-0033-desktop-visual-chat.md) — chat visual multi-turno (superfície onde a entrada por voz aterrissa)
- [SPEC-0035](./SPEC-0035-desktop-voice-output-tts.md) — abertura do item 2.3, escalação E1 (resolvida pelo ADR-0022)
- [SPEC-0040](./SPEC-0040-desktop-piper-neural-tts.md) — `piper-tts.ts`, contrato de subprocesso pinado como dado da SPEC (molde da seção *Contrato* abaixo)
- [SPEC-0041](./SPEC-0041-desktop-piper-only-voice-surface.md) / [SPEC-0043](./SPEC-0043-desktop-voice-residues.md) — política de disponibilidade e superfície de voz
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) — harness jsdom do renderer e gate de paridade

---

# Contrato do binário e da fronteira (dado desta SPEC — não negociável na implementação)

Pinado no mesmo molde em que a SPEC-0040 pinou o Piper v1.2.0, por delegação explícita do ADR-0022 (*Observações → Nota de escopo*). **Este é o único lugar onde este nível de detalhe vive.**

## Motor e recursos

**Motor:** `whisper.cpp`, executável `whisper-cli`, **versão pinada v1.7.6** (em Windows, `whisper-cli.exe`).

**Layout dos recursos em disco**, sob `<sttDir>` resolvido em três níveis — `ATLAS_STT_DIR` → `process.resourcesPath/stt` → `apps/desktop/resources/stt` (dev):

```text
<sttDir>/whisper-cli                      binário (não versionado no git)
<sttDir>/models/ggml-small-q5_1.bin       modelo único (não versionado no git)
```

## Invocação — argv em array, nunca shell

```text
whisper-cli
  --model         <sttDir>/models/ggml-small-q5_1.bin
  --file          <tmpDir>/atlas-stt-<randomId>.wav
  --language      pt
  --no-timestamps
  --no-prints
  --threads       4
```

- `--language pt` é **fixo** (ADR-0022, decisão de produto 3): nunca autodetecção, nunca valor vindo do renderer.
- `--threads 4` é fixo, para que o argv seja determinístico e comparável item a item no teste.
- **Nenhuma flag `--output-*`**: a transcrição é lida de stdout, não de arquivo.

## Contrato da fronteira renderer → main (validado no main, sempre)

O payload de `'atlas:stt:transcribe'` é `{ pcm: ArrayBuffer, sampleRate: number }` — **dois campos, nunca três** — e é **validado no main antes de qualquer efeito colateral**. O main nunca confia no renderer (o teto de gravação do renderer é conforto de UI, não garantia):

| Regra | Valor pinado |
| --- | --- |
| `sampleRate` aceito | exatamente `16000` — qualquer outro valor é recusado, **nunca** reamostrado no main |
| `pcm.byteLength` | > 0, **par** (amostras `Int16` completas) e ≤ **1 000 000 bytes** (≈ 31,25 s a 16 kHz mono 16-bit) |
| duração do áudio | **derivada no main**: `durationMs = (byteLength / 2 / 16000) × 1000`. Nunca recebida do renderer (D18/R4) |

Violação de `sampleRate`, paridade ou `byteLength` zerado ⇒ `{ ok: false, reason: 'invalid-audio' }`. `byteLength` acima do teto ⇒ `{ ok: false, reason: 'audio-too-long' }`. Em ambos, **nenhum arquivo é escrito e nenhum processo é iniciado**.

**Entrada do binário:** WAV RIFF/PCM, **1 canal, 16 kHz, 16 bits assinado little-endian** — único formato aceito. O cabeçalho de 44 bytes é montado no main process; o corpo é o PCM `Int16` validado. O caminho do `.wav` é derivado **só** de `tmpDirProvider()` + `randomId()` no main process, **nunca** de dado vindo do renderer.

**Saída:** transcrição em **stdout**. Normalização: descarta linhas vazias, junta as restantes com um espaço simples, aplica `trim`. Nada de stdout é parseado além disso. O `durationMs` devolvido em `{ ok: true }` é a **duração do áudio derivada** acima, não o tempo de processamento.

## Orçamento de tempo

- **Teto de gravação (renderer): 30 s.** Ao atingi-lo, o renderer encerra a gravação sozinho, avisa o usuário e **segue** para a transcrição — nunca descarta o áudio em silêncio.
- **Timeout de transcrição (main): função da duração derivada** — `timeoutMs = clamp(20_000 + 5 × durationMs, 20_000, 180_000)`. Para a gravação máxima de 30 s: 170 s. O piso cobre o carregamento do modelo `small`; o teto absoluto impede estado preso indefinido.
- **Encerramento do processo** (timeout e cancelamento): `SIGTERM` e, se ainda vivo após **2 s**, `SIGKILL`.
- Como essa janela pode chegar a 170 s, **"Cancelar" permanece alcançável durante a transcrição** (Escopo item 5, CA 28) — não só durante a gravação.

## Desfechos (exaustivos)

| Condição | Resultado |
| --- | --- |
| exit code 0 e transcrição não vazia | `{ ok: true, text, durationMs }` (duração derivada do áudio) |
| exit code 0 e stdout vazio após normalização | `{ ok: false, reason: 'empty-transcript' }` |
| exit code ≠ 0 | `{ ok: false, reason: 'engine-failed' }`, com a cauda de stderr truncada em 500 caracteres |
| falha ao iniciar o processo (`ENOENT` etc.) | `{ ok: false, reason: 'engine-unavailable' }` |
| `sampleRate` ≠ 16000, `byteLength` ímpar ou zero | `{ ok: false, reason: 'invalid-audio' }` |
| `byteLength` > 1 000 000 | `{ ok: false, reason: 'audio-too-long' }` |
| **falha ao escrever o `.wav` temporário** (`writeFile` rejeita: tmpdir sem permissão, disco cheio) | `{ ok: false, reason: 'io-failed', detail }` — nenhum processo é iniciado |
| timeout conforme o orçamento acima | `{ ok: false, reason: 'timeout' }` |
| `cancel()` durante a transcrição | `{ ok: false, reason: 'cancelled' }` |
| submissão com outra transcrição em voo | `{ ok: false, reason: 'busy' }` (recusada, nunca enfileirada) |

Regras de limpeza, pinadas: em **todos** os desfechos que chegaram a escrever o `.wav`, o temporário é removido; nos desfechos de validação e em `io-failed`, nada foi escrito. **A falha de `unlink` na limpeza nunca propaga e nunca altera o resultado já decidido** — é engolida (com `detail` opcional em log de erro, se houver), jamais convertida em rejeição de `transcribe`. Nenhum caminho de `transcribe` lança: toda rejeição de porta injetada vira um desfecho da tabela.

## Janela de captura (permissão de microfone)

Canais IPC pinados: `'atlas:stt:capture:begin'` e `'atlas:stt:capture:end'`. O main mantém um único estado de janela de captura, cujo **ciclo de vida completo** é:

| Evento | Efeito |
| --- | --- |
| `'atlas:stt:capture:begin'` | abre; (re)arma o watchdog. Idempotente: chamar com a janela já aberta só rearma. |
| `'atlas:stt:capture:end'` | fecha; desarma o watchdog. **Idempotente**, nunca lança se já estava fechada. |
| watchdog de **35 s** sem `end` | fecha sozinha |
| `webContents` navega/recarrega (`did-start-navigation`, `did-finish-load`) | fecha |
| janela fechada (`closed`) / app encerrando (`before-quit`) | fecha |

O renderer chama `begin` **antes** de `getUserMedia`, chama `begin` **de novo assim que `getUserMedia` resolve** (rearme — ver abaixo), e chama `end` num `finally` que cobre sucesso, erro, rejeição de permissão, cancelamento e teto de gravação. **Não há período de carência**: fora dessa janela, a permissão de mídia é negada. Uma janela presa em aberto seria concessão permanente de microfone — por isso o watchdog e os gatilhos de ciclo de vida são parte do contrato, não detalhe de implementação.

**Por que o rearme é obrigatório (R1):** como `begin` dispara **antes** de `getUserMedia` (D17, deliberado), a janela de 35 s também cobre o tempo em que o usuário **lê o diálogo nativo de permissão do SO** na primeira concessão. Alguns segundos de leitura consomem o orçamento e o watchdog fecharia no meio de uma gravação legítima — erra para o lado fechado (não é buraco de segurança), mas um re-check do Chromium durante a captura poderia negar o acesso sem mensagem clara. Rearmar quando `getUserMedia` resolve faz o watchdog contar a partir do **início real** da captura, usando a idempotência já pinada acima; o teto de 35 s (30 s de gravação + 5 s de margem) não muda.

> **Se o binário real divergir de qualquer ponto acima, é mudança de decisão arquitetural: pare e devolva ao `spec-drafter`, nunca faça ajuste ad hoc.** (Mesma cláusula em vigor para o Piper, `apps/desktop/CLAUDE.md`.)

---

# Escopo

1. **`apps/desktop/src/stt-engine.ts` (novo)** — módulo puro do main process, sem importar `electron`:
   - `createSttEngine({ spawn, resolveDir, tmpDirProvider, randomId, now, writeFile, stat, unlink })` → `{ transcribe, isAvailable, describe, cancel }`.
   - Valida o payload da fronteira, **deriva a duração do áudio**, monta o cabeçalho WAV, invoca o binário conforme o *Contrato*, normaliza a saída, aplica o orçamento de timeout, e **sempre** remove o temporário que chegou a escrever (sem nunca propagar falha de `unlink`).
   - Resolução de recursos em três níveis, espelhando `piper-tts.ts`.
   - `isAvailable()` = arquivo do binário presente **e** o modelo exato presente (mesma semântica, e mesma limitação conhecida, de `PiperTts.isAvailable()`).
2. **Canais IPC novos** em `src/main.ts` + `src/preload.cjs` (cinco):
   - `'atlas:stt:available'` → `{ available: boolean, engine?: SttEngineInfo, reason?: string }`
   - `'atlas:stt:transcribe'` → recebe `{ pcm, sampleRate }`, devolve `SttResult`
   - `'atlas:stt:cancel'` → cancela a transcrição em voo (idempotente)
   - `'atlas:stt:capture:begin'` / `'atlas:stt:capture:end'` → abrem e fecham a janela de captura (contrato acima)
3. **Política de permissão de microfone** em `src/main.ts`: `session.defaultSession.setPermissionRequestHandler` e `setPermissionCheckHandler` que **negam tudo** por padrão e concedem apenas `'media'` com pedido de áudio, e apenas com a janela de captura aberta. A decisão é isolada num módulo testável `src/media-permission.ts` (novo, sem importar `electron`), que também expõe o **controlador de janela de captura** (`createCaptureWindow`, com `begin`/`end`/`isOpen` e o watchdog). `main.ts` apenas fia os gatilhos de `webContents`/janela/app.
4. **Captura no renderer** (`src/renderer/renderer.js` + `index.html`): botão "🎤 Falar" ao lado do campo de entrada; `begin` → `navigator.mediaDevices.getUserMedia({ audio: true })` → **`begin` outra vez, assim que a promessa resolve** (rearma o watchdog a partir do início real da captura, R1) → `AudioContext({ sampleRate: 16000 })` + `MediaStreamAudioSourceNode` → **`ScriptProcessorNode`** (`bufferSize` 4096, 1 canal de entrada e 1 de saída) acumulando `Float32` → conversão para `Int16`; o nó é conectado a um `GainNode` de ganho 0 ligado ao `destination` (mantém o grafo puxando amostras sem eco audível); teto de 30 s com encerramento automático avisado; encerramento desconecta os nós, chama `stop()` em todas as tracks, fecha o `AudioContext` e chama `end`; envio do buffer por IPC; inserção do texto no `<input>` do chat; botão "Cancelar" durante a gravação.
5. **Estados de UI**: `indisponível` (desabilitado + aviso do motivo), `ocioso`, `gravando` (rótulo/estilo distintos + tempo decorrido), `transcrevendo` (botão de microfone desabilitado, aviso — **mas "Cancelar" segue visível e habilitado**, emitindo `'atlas:stt:cancel'`, cujo desfecho é `cancelled` com o campo de entrada intacto), `erro` (aviso textual por `reason`, entrada intacta). Integração à serialização de gestos já existente: gravar/transcrever bloqueia o envio e é bloqueado por turno de chat/`ask` em voo.
6. **Harness e testes** em `apps/desktop/tests/`:
   - `helpers/renderer-harness.ts` ganha (a) dublês de `navigator.mediaDevices.getUserMedia`, `AudioContext`/`ScriptProcessorNode`/`GainNode`/`MediaStreamAudioSourceNode` e `MediaStreamTrack`, com registro em `RendererCalls`; (b) um **relógio injetável** que substitui `setTimeout`/`clearTimeout`/`setInterval`/`clearInterval`/`Date.now` **na janela jsdom**, antes do `window.eval`, exposto como `fixture.clock.advance(ms)`; (c) as entradas novas do glue de voz no `EPILOGUE` (lista fixa — símbolo novo só é inspecionável se for adicionado ali).
   - `stt-engine.test.ts`, `media-permission.test.ts`, `renderer.voice-input.test.ts` (novos).
7. **Documentação da própria SPEC**: este arquivo e uma *Nota de implementação* no ADR-0022. A sincronização de `apps/desktop/CLAUDE.md`, `NEXT_CONTEXT.md`, `PLATFORM_STATE.md` e `Roadmap.md` é do passo `doc-sync` no fecho, não do implementador.

---

# Fora do Escopo

- **Wake word / escuta contínua / ativação por voz.** Roadmap l. 157 ("candidato, não comprometido") e candidato futuro do ADR-0022, com ADR próprio. Ver D3.
- **Envio automático do texto transcrito** (ADR-0022, alternativa rejeitada; D6).
- **Ditado ao vivo / transcrição incremental (streaming)** e **processo de longa duração** — candidatos futuros do ADR-0022. Ver D7 e D8.
- **Reamostragem de áudio no main** (aceitar `sampleRate` ≠ 16000 e converter) — recusado no contrato da fronteira; ver D18.
- **Catálogo multi-modelo** ou seleção de modelo pela UI — ADR-0022, decisão de produto 2.
- **Download sob demanda** de binário ou modelo — ADR-0022(c) e decisão de produto 1. Nenhuma chamada de rede, em nenhum caminho, sem exceção.
- **Comandos de voz** ("Atlas, apague o arquivo X" executando direto), qualquer atalho entre voz e execução de Tools, e qualquer forma de a voz burlar o `ConfirmPort`.
- **Criar um módulo `Voice Service`** ou qualquer package novo — ADR-0022, alternativa rejeitada. Ver D2.
- **Criar uma Tool de STT** (`transcribe_audio`) executável pelo Planner/Runtime — ADR-0022(b).
- **Entrada por voz na CLI** (`apps/cli`) — a CLI não tem stack de mídia.
- **Persistir áudio, transcrições ou histórico de gravações** — ADR-0022(d), Artigo 11.
- **Seleção de dispositivo de entrada, ganho, cancelamento de ruído, VAD, diarização, pontuação assistida por modelo, tradução.**
- **`AudioWorkletNode`** e qualquer arquivo de script novo carregado em runtime pelo renderer — ver D5.
- **Mock do módulo `electron` no Vitest** e teste de arranque do `main.ts` em runtime — ver D16.
- **Vincular voz de entrada à Persona** (`Persona.voiceURI` é de **saída**, ADR-0020) — nenhum campo novo em `Persona`.
- **Qualquer alteração** em `packages/*`, `@atlas/contracts`, `apps/cli`, `src/core-bridge.ts`, `src/speech-output.ts` e `src/piper-tts.ts`.
- **Empacotamento/distribuição** do binário e do modelo (`extraResources`, `NSMicrophoneUsageDescription`, assinatura/notarização) — Fase 3.
- **Fechar a pendência de smoke visual/sonoro** das 12+ fatias do desktop. Esta SPEC a **amplia** e a registra; não a resolve.
- **Estender o gate de paridade da SPEC-0045** a outros módulos (candidato já nomeado, fatia própria).

---

# Pré-requisitos

- [ADR-0022](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) — `Accepted` (2026-08-01). **Satisfeito**; era o bloqueio da v1.0 desta SPEC.
- [SPEC-0033](./SPEC-0033-desktop-visual-chat.md) — `Done`
- [SPEC-0035](./SPEC-0035-desktop-voice-output-tts.md) — `Done`
- [SPEC-0040](./SPEC-0040-desktop-piper-neural-tts.md) — `Done`
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) — `Done` (harness jsdom; sem ele não há como testar o glue de captura sem hardware)

---

# Critérios de Aceitação

Verificáveis mecanicamente pelo `spec-validator`. São **41**.

**Motor de transcrição (`src/stt-engine.ts`)**

1. `apps/desktop/src/stt-engine.ts` existe, não contém `from 'electron'` nem `require('electron')`, e é importável num teste Vitest sem Electron.
2. O executor de subprocesso é **injetado** no factory; nenhum teste da suíte executa o binário real.
3. O argv produzido é **idêntico**, item a item, ao pinado no *Contrato* (teste compara o array inteiro); nenhuma ocorrência de `exec(` com string concatenada existe no arquivo.
4. `--language` é sempre `pt` e nunca deriva de entrada do renderer — teste com payload tentando injetar idioma ou flags extras.
5. **Validação da fronteira**: `sampleRate` ≠ 16000, `byteLength` zero e `byteLength` ímpar resolvem `invalid-audio`; `byteLength` > 1 000 000 resolve `audio-too-long`. Em todos, um teste prova que **nenhum arquivo foi escrito** e que `spawn` **não foi chamado**. Um teste adicional prova que o payload aceito tem **exatamente dois campos** e que qualquer duração enviada pelo renderer é ignorada.
6. **Duração derivada**: para um `pcm` de tamanho conhecido, `durationMs` devolvido em `{ ok: true }` é `(byteLength / 2 / 16000) × 1000`, e é esse valor que alimenta o orçamento de timeout.
7. **Falha de IO**: `writeFile` rejeitando resolve `{ ok: false, reason: 'io-failed', detail }`, sem iniciar processo e sem lançar; `unlink` rejeitando **não** altera o resultado já decidido, não propaga e não lança — testes nos dois casos, inclusive `unlink` falhando após um `{ ok: true }`.
8. O `.wav` temporário tem nome derivado **só** de `tmpDirProvider()` + `randomId()`, e é removido em todos os desfechos que chegaram a escrevê-lo. Um teste por desfecho.
9. O cabeçalho WAV escrito é RIFF/PCM, 1 canal, 16 kHz, 16 bits — teste verifica os campos byte a byte para um buffer conhecido.
10. Os **dez** desfechos da tabela são cobertos por teste, cada um resolvendo o `reason` exato pinado, sem nunca lançar exceção não tratada.
11. O timeout é calculado por `clamp(20_000 + 5 × durationMs, 20_000, 180_000)` sobre a duração derivada — testes nos três regimes (piso, faixa proporcional, teto) com relógio injetado; e a sequência `SIGTERM` → (2 s) → `SIGKILL` é exercida.
12. Normalização de stdout testada: linhas vazias descartadas, junção por espaço simples, `trim` aplicado.
13. `isAvailable()` devolve `false` (sem lançar) quando o diretório de recursos não existe, quando o binário está ausente e quando o modelo está ausente — um teste por caso.
14. `describe()` devolve motor, versão pinada, modelo e idioma fixado.
15. Verificação estática na suíte: **nem `stt-engine.ts` nem `src/renderer/renderer.js`** referenciam `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `http`, `https` ou `net` (garantia offline do ADR-0022(c), gate mecânico em vez de convenção). Ocorrência pré-existente em `renderer.js` é achado a reportar, não a contornar.
16. O contrato de invocação está reproduzido em comentário no topo de `stt-engine.ts`, com a cláusula de parada e a referência a esta SPEC.

**Permissão de microfone e janela de captura (`src/media-permission.ts`)**

17. O módulo existe, não importa `electron` e expõe: `decideMediaPermission({ permission, requestedMedia, captureInFlight })` → `boolean` e `createCaptureWindow({ setTimer, clearTimer })` → `{ begin, end, isOpen }`.
18. Testes exaustivos de `decideMediaPermission`: permissão ≠ `'media'` ⇒ `false`; `'media'` com vídeo pedido ⇒ `false`; `'media'` com áudio **sem** janela aberta ⇒ `false`; `'media'` com áudio **com** janela aberta ⇒ `true`; entrada malformada/`undefined` ⇒ `false` sem lançar.
19. Testes do ciclo de vida da janela, com relógio injetado, um por linha da tabela do contrato: `begin` abre e arma; `begin` repetido é idempotente e **rearma** (o watchdog volta a contar do zero — teste explícito, é a primitiva de que R1 depende); `end` fecha e desarma; `end` repetido não lança; **watchdog de 35 s fecha sozinho** sem `end`; `end` após o watchdog não lança nem reabre.
20. **Asserção estática de fonte** sobre `src/main.ts` (ver D16, e não mock de `electron`): o arquivo contém `setPermissionRequestHandler` e `setPermissionCheckHandler`, registra os cinco canais `'atlas:stt:*'`, e fia o fechamento da janela de captura nos três gatilhos pinados (`did-start-navigation`/`did-finish-load`, `closed`, `before-quit`). O teste falha se qualquer um faltar.

**Renderer / superfície**

21. `index.html` contém o botão de microfone e o de cancelamento, com `id`s referenciados por `renderer.js`; `renderer.boot.test.ts` (SPEC-0045) continua verde com os `id`s novos.
22. O harness expõe `fixture.clock.advance(ms)` operando sobre os timers **da janela jsdom** (substituídos antes do `window.eval`), e um teste prova que um `setTimeout` agendado pelo `renderer.js` só dispara sob `advance` — nunca por espera real.
23. Os símbolos novos do glue de voz estão declarados no `EPILOGUE` do harness e acessíveis por `fixture.internals`; um teste falha se algum deles vier `undefined`.
24. Ciclo feliz sobre os dublês: iniciar a gravação chama `'atlas:stt:capture:begin'` **antes** de `getUserMedia`, e `getUserMedia` é chamado exatamente uma vez com `{ audio: true }` e **sem** `video`.
25. **Rearme (R1)**: `'atlas:stt:capture:begin'` é chamado **uma segunda vez** assim que a promessa de `getUserMedia` resolve, e um teste com `getUserMedia` resolvendo lentamente (via `clock.advance`) prova que a gravação sobrevive ao orçamento do watchdog. Se `getUserMedia` rejeita, o segundo `begin` **não** acontece.
26. Encerrar chama `stop()` em **todas** as tracks, desconecta os nós, chama `close()` no `AudioContext` e chama `'atlas:stt:capture:end'` — e o mesmo vale, comprovadamente, em **cada** caminho de saída: cancelamento, rejeição de `getUserMedia`, teto de 30 s, falha da transcrição e sucesso (um teste por caminho).
27. Cancelar durante a gravação não emite nada no canal `'atlas:stt:transcribe'`.
28. **Cancelar durante a transcrição (R3)**: no estado `transcrevendo`, o botão "Cancelar" está **visível e habilitado**; acioná-lo emite `'atlas:stt:cancel'`, a UI volta a `ocioso` com aviso, e o conteúdo do campo de entrada permanece intacto.
29. Atingir o teto de 30 s (via `clock.advance`) encerra a gravação, avisa e **segue** para a transcrição; o áudio nunca é descartado em silêncio.
30. Uma transcrição bem-sucedida coloca o texto no `<input>` do chat e **não** dispara o canal de envio de turno.
31. Se o campo já contiver texto, a transcrição é **anexada** ao final, preservando o conteúdo (nunca sobrescreve).
32. `'atlas:stt:available'` respondendo `{ available: false }` deixa o botão **desabilitado com aviso do motivo**; idem quando `getUserMedia` rejeita: aviso textual, botão volta a ocioso, entrada intacta.
33. Cada `reason` da tabela (os dez) produz aviso visível e distinguível, mantendo o conteúdo do campo intacto.
34. Enquanto grava ou transcreve, o botão de envio e o seletor de Persona ficam desabilitados; com turno de chat/`ask` em voo, o botão de microfone fica desabilitado (um teste por direção).
35. Nenhum `Blob`, `MediaStream` ou objeto de áudio cruza o IPC — só `ArrayBuffer` de PCM + `sampleRate`. Teste verifica a forma exata do payload, incluindo a **ausência** de qualquer campo de duração.

**Arquitetura e higiene**

36. `git diff` vazio em `packages/*`, `apps/cli/`, `apps/desktop/src/core-bridge.ts`, `apps/desktop/src/speech-output.ts` e `apps/desktop/src/piper-tts.ts`.
37. Nenhum tipo novo em `@atlas/contracts`; todos os tipos desta fatia são locais a `apps/desktop`.
38. Nenhum arquivo novo é carregado em runtime pelo renderer e a CSP de `index.html` **não** é afrouxada (consequência direta de D5; se a implementação concluir que precisa, é mudança de decisão ⇒ parar e devolver ao `spec-drafter`).
39. O ADR-0022 recebe uma *Nota de implementação* (mesmo padrão da nota do ADR-0021 sobre a SPEC-0040).
40. `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` verdes na raiz; a suíte total cresce; nenhum teste pré-existente é removido ou marcado como `skip`; `renderer.speech-parity.test.ts`, `renderer.boot.test.ts` e `renderer.voice-triggers.test.ts` seguem verdes.
41. Esta SPEC registra numa Observação que **nada** desta fatia foi confirmado com microfone real — ampliando a pendência de smoke da SPEC-0040 (CA 25).

---

# Arquivos Esperados

```text
apps/desktop/src/stt-engine.ts                  (novo)
apps/desktop/src/media-permission.ts            (novo: decisão + janela de captura)
apps/desktop/src/main.ts                        (editado: 5 ipcMain.handle, handlers de permissão, gatilhos de fecho)
apps/desktop/src/preload.cjs                    (editado: 5 métodos em window.atlas.stt)
apps/desktop/src/renderer/index.html            (editado: botões e área de aviso — sem <script> novo, sem CSP nova)
apps/desktop/src/renderer/renderer.js           (editado: glue de captura e estados)

apps/desktop/tests/stt-engine.test.ts           (novo)
apps/desktop/tests/media-permission.test.ts     (novo)
apps/desktop/tests/renderer.voice-input.test.ts (novo)
apps/desktop/tests/helpers/renderer-harness.ts  (editado: dublês de mídia, relógio injetável, EPILOGUE)

docs/06-adr/ADR-0022-whisper-cpp-local-stt-engine.md  (existente; recebe Nota de implementação no fecho)
docs/implementation/specs/SPEC-0046-desktop-voice-input-stt.md (este arquivo)
```

Nenhum arquivo novo em `src/renderer/` além das edições acima — consequência pinada de D5.

---

# Componentes Impactados

- **Input Gateway** (`apps/desktop`) — recebe a responsabilidade de entrada por voz; é o único componente do Module Catalog cuja superfície muda.
- **Output Gateway** (`apps/desktop`) — apenas os avisos de estado; nenhuma alteração no caminho de TTS.

Não impactados, por construção: Core, Cognitive Core, Planner, Runtime, Task Manager, Memory Service, Context Service, Permission Service, Persona Service, Model Gateway, Tool Registry, Skill Registry.

---

# Interfaces Necessárias

Todas **locais a `apps/desktop`** (regra de tipos locais do `apps/desktop/CLAUDE.md`; promoção a `@atlas/contracts` só com 2º consumidor real, precedente ADR-0007).

```ts
// src/stt-engine.ts
type SttEngineInfo = { engineId: 'whisper.cpp'; version: string; modelId: string; language: 'pt' };

type SttFailureReason =
  | 'invalid-audio'
  | 'audio-too-long'
  | 'io-failed'
  | 'empty-transcript'
  | 'engine-failed'
  | 'engine-unavailable'
  | 'timeout'
  | 'cancelled'
  | 'busy';

type SttResult =
  | { ok: true; text: string; durationMs: number } // durationMs = duração do áudio, derivada no main
  | { ok: false; reason: SttFailureReason; detail?: string };

interface SttEngine {
  isAvailable(): boolean;
  describe(): SttEngineInfo | undefined;
  transcribe(input: { pcm: ArrayBuffer; sampleRate: number }): Promise<SttResult>;
  cancel(): void;
}

// src/media-permission.ts
interface MediaPermissionRequest {
  permission: string;
  requestedMedia?: readonly string[];
  captureInFlight: boolean;
}
declare function decideMediaPermission(request: MediaPermissionRequest): boolean;

interface CaptureWindow {
  begin(): void; // idempotente; (re)arma o watchdog de 35 s
  end(): void; // idempotente; desarma
  isOpen(): boolean;
}
declare function createCaptureWindow(deps: {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}): CaptureWindow;
```

Portas injetadas no factory do motor (mesmo molde de `piper-tts.ts`): `spawn`, `resolveDir`, `tmpDirProvider`, `randomId`, `now`, `writeFile`/`stat`/`unlink`.

---

# Fluxo Esperado

```text
usuário clica 🎤 (gesto explícito)
        │
        ▼
IPC 'atlas:stt:capture:begin'  → main abre a janela de captura (watchdog 35 s)
        │
        ▼
renderer: getUserMedia({audio:true})   ← usuário pode estar lendo o diálogo do SO
        │            ├── rejeita → 'capture:end', aviso, volta a ocioso (fail-closed)
        ▼
main: permission handler → decideMediaPermission(captureInFlight = true) → concede só áudio
        │
        ▼
IPC 'atlas:stt:capture:begin' DE NOVO  → rearma o watchdog a partir do início real da captura (R1)
        │
        ▼
renderer: AudioContext(16 kHz) → source → ScriptProcessorNode → gain(0) → destination
          acumula Float32 → Int16                                [teto de 30 s]
        │
        ├── "Cancelar" → desconecta, stop() nas tracks, close(), 'capture:end', nada é enviado
        ├── teto de 30 s → encerra sozinho, avisa, e segue
        ▼
usuário clica 🎤 de novo (encerra) → desconecta, stop(), close(), 'capture:end'
        │
        ▼
IPC 'atlas:stt:transcribe' { pcm: ArrayBuffer, sampleRate: 16000 }   ← dois campos, sem duração
        │
        ▼
main: valida a fronteira ──► inválido → { ok:false, invalid-audio | audio-too-long }
        │                     (nada escrito, nada spawnado)
        ▼
deriva durationMs = byteLength / 2 / 16000 → orçamento de timeout
        │
        ▼
.wav temporário ──► writeFile rejeita → { ok:false, io-failed } (nada spawnado)
        │
        ▼
spawn('whisper-cli', [argv pinado])
        │        │
        │        └── erro/timeout/cancel/vazio → { ok:false, reason }
        │            ("Cancelar" segue alcançável durante toda esta janela — R3)
        ▼            (temporário removido sempre; falha de unlink nunca propaga)
stdout normalizado → { ok: true, text, durationMs }
        │
        ▼
renderer: texto anexado ao <input> do chat — NÃO enviado
        │
        ▼
usuário lê, edita se quiser, e envia pelo fluxo de chat já existente (SPEC-0033)
```

---

# Estratégia de Implementação

1. Reler `src/piper-tts.ts` e seus testes — o motor de STT é o espelho estrutural deles.
2. `src/media-permission.ts` + testes: primeiro `decideMediaPermission` (função pura, exaustiva), depois `createCaptureWindow` com relógio injetado (a tabela de ciclo de vida inteira, com ênfase no rearme — é a primitiva de que R1 depende).
3. `src/stt-engine.ts` em TDD com `spawn` fake, na ordem da tabela: validação de fronteira (antes de qualquer efeito) → duração derivada → `isAvailable`/`describe` → cabeçalho WAV → argv exato → sucesso → `io-failed` → `empty-transcript` → `engine-failed` → `engine-unavailable` → orçamento de timeout nos três regimes → `cancelled` → `busy` → limpeza do temporário (incl. `unlink` falhando sem propagar).
4. Fiação em `main.ts` (5 `ipcMain.handle`, handlers de permissão, três gatilhos de fecho da janela) e `preload.cjs`; asserção estática de fonte como teste.
5. `index.html`: botões e área de aviso — **sem** `<script>` novo, **sem** mexer na CSP.
6. Harness: relógio injetável primeiro (destrava CA 22/25/29), depois os dublês de mídia, depois o `EPILOGUE`.
7. `renderer.voice-input.test.ts` em TDD; então o glue no `renderer.js` — **toda decisão fica no TS do main**, para não criar réplica nova; se alguma for inevitável, comentário explícito apontando a duplicação.
8. Rodar os quatro comandos na raiz; acrescentar a *Nota de implementação* ao ADR-0022; registrar a Observação de smoke não confirmado.

---

# Estratégia de Testes

Todos sem hardware de áudio, sem Electron e sem o binário real.

- **`stt-engine.test.ts`** — validação de fronteira (com prova de "nada escrito, nada spawnado" e de payload de dois campos); duração derivada; `isAvailable`/`describe`; cabeçalho WAV byte a byte; argv idêntico ao pinado; tentativa de injeção de flag/idioma; a tabela inteira de dez desfechos, incluindo `io-failed`; `unlink` falhando sem propagar; orçamento de timeout nos três regimes; `SIGTERM`→`SIGKILL`; normalização de stdout; nome do temporário independente do renderer; asserção estática de ausência de rede.
- **`media-permission.test.ts`** — tabela exaustiva de decisões (incl. malformadas) + tabela de ciclo de vida da janela de captura com relógio injetado, incluindo o watchdog e o **rearme**.
- **`renderer.voice-input.test.ts`** (harness da SPEC-0045) — ordem `begin` antes de `getUserMedia`; **rearme** após a resolução (e sua ausência na rejeição); ciclo feliz; liberação completa de recursos + `end` em **cada** caminho de saída; cancelamento durante a gravação **e durante a transcrição**; teto de 30 s via `clock.advance`; `getUserMedia` rejeitando; motor indisponível; cada `reason`; texto anexado sem sobrescrever; nenhum envio automático; serialização de gestos nos dois sentidos; forma exata do payload IPC.
- **Asserção estática de `main.ts`** (D16) — presença dos handlers, dos cinco canais e dos três gatilhos de fecho.
- **Regressão** — `renderer.boot.test.ts`, `renderer.voice-triggers.test.ts` e `renderer.speech-parity.test.ts` verdes; suíte completa na raiz.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz e de `apps/desktop`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `PLATFORM_STATE.md`, `Roadmap.md`) é do passo `doc-sync` no fecho, não do `spec-implementer`. O implementador toca apenas este arquivo e a *Nota de implementação* no ADR-0022.

---

# Restrições

- **Nada de rede, sem exceção** (ADR-0022(c)), nos dois lados novos do caminho — módulo do main e glue do renderer (CA 15).
- **O Core não sabe que existe voz.** Nada em `packages/*` é alterado; nenhuma Tool, Skill ou campo de Persona é criado (Artigos 2, 4 e 9).
- **Nenhum estado persistente novo** (Artigo 11, ADR-0022(d)): áudio e transcrições são efêmeros; o único artefato em disco é o `.wav` temporário, sempre removido.
- **Fronteira do Electron intacta** (ADR-0019): `contextIsolation: true`, `nodeIntegration: false`, **sem bundler e sem arquivo de script novo no renderer**; o renderer só fala com o main por IPC.
- **O main nunca confia no renderer**: todo payload é validado antes de qualquer efeito colateral; a duração é derivada, não recebida; o teto de gravação do renderer não substitui o teto de bytes do main.
- **`transcribe` nunca lança**: toda rejeição de porta injetada vira um desfecho da tabela; falha de limpeza nunca vira falha de resultado.
- **Nenhuma decisão arquitetural nova durante a implementação.** Se o binário divergir do contrato, se a captura exigir CSP nova ou arquivo novo, ou se a permissão exigir algo além dos dois handlers de `session` mais os cinco canais pinados: **pare e devolva ao `spec-drafter`**.
- **Não reusar as portas de confirmação existentes** (`ConfirmPort`, `GrantConfirmPort`, `PersonaDeleteConfirmPort`) — gravar não é ação destrutiva nem concessão de política do Atlas.
- **Binário e modelo não são versionados no git** (mesma regra do Piper).

---

# Observações

- **Smoke real não confirmado — a pendência cresce.** Nenhum microfone, dispositivo de áudio ou binário de STT existe no shell de automação; sem WindowServer, a janela nem abre. Tudo desta fatia é verificado por dublês. Some-se ao CA 25 da SPEC-0040: *captura de microfone real, transcrição real de fala em PT-BR pelo `whisper-cli` v1.7.6, latência percebida com o modelo `small`, diálogo de permissão de microfone do macOS (incluindo o tempo real de leitura, que motivou o rearme do R1), o comportamento quando o usuário nega a permissão no diálogo do SO, e o eco/realimentação com alto-falante aberto durante a captura.*
- **`ScriptProcessorNode` é depreciado** (D5). Aceito conscientemente: segue implementado no Chromium, não exige arquivo novo nem CSP nova, e o dublê é trivial. Se um dia for removido, a migração para `AudioWorkletNode` é fatia própria — e traz junto a decisão de CSP/arquivo que esta SPEC recusou.
- **Latência.** ADR-0022, *Nota de desempenho*: custo dominado pelo carregamento do modelo e pela inferência sobre o buffer completo; sem processo quente (D8). O orçamento de timeout proporcional (D14) existe para que a fala mais longa permitida não caia em `timeout`; o "Cancelar" durante a transcrição (R3) existe para que essa janela nunca seja uma prisão.
- **`.wav` temporário e o Permission Service.** Mesmo enquadramento da SPEC-0040: artefato efêmero do Gateway, fora da política de `readRoots`/`writeRoots` do ADR-0013.
- **`Info.plist`/`NSMicrophoneUsageDescription`.** Em macOS, um app empacotado precisa declarar o uso do microfone ou a captura falha. Em dev, o binário do Electron traz a própria declaração. Item de empacotamento (Fase 3), registrado para não ser descoberto tarde.
- **Duplicação renderer↔main.** O objetivo é **não criar réplica nova**: toda decisão (disponibilidade, validação, derivação de duração, montagem do WAV, normalização) mora no TS do main; o renderer só captura, envia e pinta estado. O gate da SPEC-0045 hoje **não** cobre réplicas fora de `speech-output.ts`, então uma réplica nova estaria protegida só por convenção — motivo a mais para não criá-la.

---

# Checklist para IA

Antes de implementar:

- ler `ADR-0022`, `ADR-0019`, `ADR-0021`, `apps/desktop/CLAUDE.md`, `src/piper-tts.ts` e `tests/helpers/renderer-harness.ts`;
- ler a seção *Contrato do binário e da fronteira* e tratá-la como dado, não como sugestão;
- identificar o módulo responsável (Input Gateway, em `apps/desktop`);
- validar dependências (SPECs 0033/0035/0040/0045 `Done`; ADR-0022 `Accepted`).

Durante:

- manter responsabilidade única; toda decisão no main, o renderer só captura e pinta;
- injetar todo efeito colateral (subprocesso, FS, tempo, aleatoriedade, timers do renderer);
- fail-closed em cada bifurcação; `capture:end` em `finally`, sempre; `begin` de novo quando `getUserMedia` resolve;
- não expandir escopo: nada de wake word, streaming, catálogo de modelos, envio automático, `AudioWorklet` ou mock de `electron`.

Depois:

- rodar `typecheck`/`lint`/`test`/`format:check` na raiz;
- conferir `git diff` vazio nos caminhos do CA 36;
- validar os 41 critérios de aceitação um a um;
- registrar lições aprendidas.

---

# Resultado Esperado

Com a app aberta, o chat do Atlas passa a aceitar fala além de digitação: o usuário clica no microfone, fala, clica de novo, e a frase aparece escrita no campo de entrada — pronta para ser lida, corrigida e enviada por ele. Tudo acontece na máquina, pelo `whisper.cpp` empacotado com a app, sem uma única chamada de rede, com o mesmo molde de motor-local-como-subprocesso que já entrega a voz de saída. O microfone só é concedido durante a janela que o próprio usuário abriu, essa janela fecha sozinha se algo der errado, e nenhum estado da fatia — nem a gravação, nem a transcrição — pode prender a interface sem uma saída visível. Quando o binário, o modelo, a permissão ou o dispositivo faltam, o botão fica desabilitado explicando o motivo, e nada mais no app muda. Do ponto de vista da arquitetura, o Atlas continua sem saber que existe voz: o texto ditado entra pela mesma porta que o texto digitado, o Cognitive Core segue cego a modalidade de entrada, e o único componente que mudou é o Input Gateway do desktop — que, segundo o Module Catalog, é exatamente quem deveria mudar.

---

# Decisões de design

Em formato de veto (Emenda v1.1 da Constituição). **Nenhuma escalação permanece aberta**: a única desta SPEC (E1, na v1.0) foi resolvida pelo ADR-0022 e está registrada em D0. D16–D19 entraram na v1.2, em resposta ao 1º veto do `architecture-reviewer` (D5, D9 e D14 foram corrigidas na mesma rodada). A v1.3 é um passe **editorial** sobre decisões já aprovadas no 2º passe do gate: incorpora os residuais R1 (rearme do watchdog), R2 (`io-failed` e limpeza que não propaga), R3 ("Cancelar" durante a transcrição) e R4 (duração derivada no main) — sem reabrir nenhuma decisão.

**D0. E1 resolvida — o motor é `whisper.cpp`, por decisão humana registrada no [ADR-0022](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) (`Accepted`, 2026-08-01).**

- **Decisão:** motor `whisper.cpp`; distribuição **empacotada no instalador**, sem download sob demanda em nenhum caminho; modelo default **`small` quantizado**, único; idioma **fixado em PT-BR**.
- **Porquê:** decisão humana de 2026-08-01, conforme a recomendação da v1.0. Reusa o padrão de subprocesso já validado, preserva 100% da garantia offline e entrega a melhor qualidade em PT-BR entre as opções locais.
- **Alternativa descartada:** `vosk`, Whisper em WASM no renderer, `SpeechRecognition` da Web Speech API (recusada de plano — áudio a serviço remoto) e download sob demanda (exigiria exceção à garantia offline, não concedida).

**D1. Perfil: `completo`.**

- **Decisão:** pipeline completo, não o fast-path micro.
- **Porquê:** falha em pelo menos três condições da Emenda v1.2 — toca `apps/desktop`, introduz capacidade de produto nova e implementa um ADR recém-aceito. Confirmado pelo `architecture-reviewer` nos dois passes do gate.
- **Alternativa descartada:** `micro` — dependência binária nova, edição de `main.ts`/`preload.cjs`/renderer e mudança na política de permissões do Electron; nada disso é fast-path.

**D2. Responsabilidade fica no Input Gateway dentro de `apps/desktop` — nenhum `Voice Service` é criado.**

- **Decisão:** todo o código vive em `apps/desktop/src`, sem package novo.
- **Porquê:** o Module Catalog já atribui "voz" como entrada aceita pelo Input Gateway, localizado na aplicação cliente (l. 886–917); "Voice Service" é *componente futuro previsto* (l. 1078), cuja criação exigiria o Architecture Decision Process. ADR-0021 e ADR-0022 rejeitaram o simétrico (`packages/voice`).
- **Alternativa descartada:** criar `packages/voice` agora — com um único consumidor real, é indireção pura (Artigo 4). Promoção terá base factual quando houver 2º consumidor (precedente ADR-0007).

**D3. Wake word fica fora, explicitamente.**

- **Decisão:** apenas push-to-talk; escuta contínua não é implementada nem preparada.
- **Porquê:** Roadmap l. 157 ("candidato, **não comprometido**") e candidato futuro do ADR-0022. Microfone permanentemente ligado é decisão de privacidade de natureza diferente, com motor de detecção próprio.
- **Alternativa descartada:** wake word atrás de interruptor desligado — código de escuta contínua no repo é superfície de risco real ainda que desligada, e tê-lo é decisão humana.

**D4. Push-to-talk por alternância, com cancelamento explícito.**

- **Decisão:** dois cliques delimitam a fala; "Cancelar" descarta — e, desde a v1.3 (R3), continua disponível também durante a transcrição.
- **Porquê:** o gesto mais transparente e previsível (Artigo 7): o usuário sabe quando o microfone está ligado, e há saída sem efeito em qualquer estado longo. `mousedown`/`mouseup` falha feio se a soltura se perder — microfone preso sem o usuário saber.
- **Alternativa descartada:** hold-to-talk puro e VAD — o primeiro pelo risco de microfone preso; o segundo por heurística não determinística num caminho que precisa ser verificável sem hardware.

**D5. Captura no renderer com `ScriptProcessorNode`; transcrição no main; PCM cru cruza o IPC.** *(pinado na v1.2)*

- **Decisão:** `getUserMedia` → `AudioContext({ sampleRate: 16000 })` → `MediaStreamAudioSourceNode` → **`ScriptProcessorNode`** (4096, 1×1) → `GainNode(0)` → `destination`; acumula `Float32`, converte para `Int16`, envia por `ArrayBuffer`. O main monta o WAV e invoca o binário.
- **Porquê:** `AudioWorkletNode` exigiria `audioWorklet.addModule(<url>)`, isto é, **um arquivo de script novo carregado em runtime** sob `file://` com `script-src 'self'` e sem bundler (ADR-0019) — exatamente o cenário que o CA 38 manda parar e devolver ao drafter, e que arrastaria decisão de CSP para dentro de uma fatia de STT. `ScriptProcessorNode` é depreciado, mas segue implementado no Chromium, não exige arquivo nem CSP nova, e o dublê no harness é um objeto com `onaudioprocess`/`connect`/`disconnect`. O `GainNode(0)` mantém o grafo puxando amostras sem eco audível. A stack de mídia só existe no renderer e o binário só pode ser invocado pelo main (ADR-0022(a)); PCM cru é o único formato que cruza essa fronteira sem uma terceira dependência binária (`MediaRecorder` produz WebM/Opus, que o `whisper-cli` não lê).
- **Alternativa descartada:** `AudioWorkletNode` (arquivo novo + CSP, custo arquitetural desproporcional nesta fatia — migração futura registrada nas Observações); `MediaRecorder` + conversão (terceira dependência binária); transcrição no renderer via WASM (rejeitada pelo próprio ADR-0022).

**D6. O texto transcrito vai para o campo de entrada; nunca é enviado automaticamente.**

- **Decisão:** a transcrição anexa texto ao `<input>`; o envio continua sendo gesto humano separado.
- **Porquê:** transcrição é falível e o turno pode acionar Tools. Auto-envio deixaria erro de reconhecimento virar instrução ao Cognitive Core sem revisão — contra os Artigos 7 e 13 e contra a Restrição do PRD. Alternativa explicitamente rejeitada no ADR-0022.
- **Alternativa descartada:** auto-envio ao fim da fala, ou diálogo de confirmação — o primeiro remove a revisão; o segundo troca um gesto barato (Enter) por um modal, sem ganho.

**D7. Buffer completo, não transcrição incremental.**

- **Decisão:** transcreve-se uma vez, ao fim da gravação.
- **Porquê:** versão mais simples que satisfaz "suporte **básico** à voz" e a única testável de ponta a ponta sem hardware; simétrica ao playback por buffer completo do TTS (SPEC-0040).
- **Alternativa descartada:** ditado ao vivo com parciais — exige processo residente, protocolo de parciais e estado de UI muito maior, sem capacidade nova.

**D8. Sem processo de longa duração (diverge deliberadamente do Piper).**

- **Decisão:** um subprocesso por transcrição, encerrado ao fim.
- **Porquê:** a mitigação do ADR-0021 existia porque o TTS é acionado com frequência sobre respostas curtas. A transcrição ocorre uma vez por fala, precedida de segundos de gravação — o overhead relativo é muito menor, e um processo residente segurando o modelo na RAM é custo permanente por benefício ocasional (Artigo 14). O ADR-0022 acolhe a divergência.
- **Alternativa descartada:** espelhar o processo quente do Piper — copiaria a solução sem o problema que a justificava.

**D9. Permissão de microfone decidida no main, fail-closed, restrita a uma janela de captura declarada.** *(ampliada na v1.2)*

- **Decisão:** `setPermissionRequestHandler` + `setPermissionCheckHandler` alimentados por um módulo puro que só concede `'media'` de áudio **enquanto a janela de captura estiver aberta** (D17).
- **Porquê:** por default o Electron pode conceder permissões sem intervenção; deixar isso implícito seria conceder câmera, geolocalização e notificação de graça a uma janela que carrega HTML local. Negar tudo e abrir exceção mínima e temporal é leitura direta do Artigo 4 e do padrão fail-closed de `confirm-port.ts`/`permission-grant-dialog.ts`/`speech-output.ts`. Módulo puro ⇒ exaustivamente testável sem Electron.
- **Relação com o Module Catalog l. 1067** ("componente que conceda permissões fora do Permission Service" exige avaliação formal): **não se aplica**, no mesmo enquadramento já usado para o `.wav` temporário e o ADR-0013. O que este módulo decide é uma **capacidade do Chromium/SO** (acesso ao dispositivo de áudio pela janela), não uma **política do Atlas** sobre ações de negócio — não julga Tools, Tasks, raízes nem risco de dado, e nenhuma decisão sua chega ao Runtime. Além disso, ele só **estreita** o default do Electron. Se um dia a permissão de mídia precisar de política do usuário (por dispositivo, por Persona, durável), isso vira ADR próprio — não esta fatia.
- **Alternativa descartada:** confiar no default do Electron e no diálogo do SO — delega a fronteira de privilégio da aplicação a um default de framework, invisível no código e não testável.

**D10. `isAvailable()` desabilita o botão com aviso; nunca botão ativo-porém-mudo.**

- **Decisão:** canal IPC dedicado informa disponibilidade e motivo; a UI reflete o motivo.
- **Porquê:** replica o achado A2 da SPEC-0035 e a política das SPECs 0041/0043 para o Piper. Controle que aceita clique e não faz nada é o modo de falha mais confuso possível (Artigo 13).
- **Alternativa descartada:** botão sempre ativo com erro só na falha — recusada pelo precedente já registrado no repo.
- **Limitação herdada e assumida:** `isAvailable()` prova presença de **arquivo** (binário + modelo), não que ele execute. Binário inexecutável ⇒ falha no primeiro uso com aviso (`engine-unavailable`). Nenhuma sonda ativa, pelo mesmo motivo da SPEC-0041.

**D11. Prioridade `High`.**

- **Decisão:** `High`, não `Critical` nem `Medium`.
- **Porquê:** o PRD lista interação por voz nos *Requisitos Funcionais* e no *Escopo Inicial*, e este é o último item direto em aberto da Fase 2 — mas nada está quebrado sem ele.
- **Alternativa descartada:** `Critical` (não há regressão nem bloqueio); `Medium` (é requisito explícito do PRD e fecha a fase).

**D12. Contrato do binário e da fronteira pinado como dado desta SPEC, com cláusula de parada.**

- **Decisão:** versão, layout, argv, validação da fronteira, derivação de duração, formato do WAV, leitura de stdout, tabela exaustiva de desfechos (dez), orçamento de timeout, regras de limpeza, encerramento, concorrência e janela de captura ficam na seção *Contrato* e reproduzidos em comentário no topo do módulo; divergência interrompe a implementação.
- **Porquê:** precedente literal da SPEC-0040 (D4/D9/D10/D13) e regra já escrita em `apps/desktop/CLAUDE.md`; o ADR-0022 delega este nível de detalhe à SPEC, para não haver duas fontes a sincronizar (Artigo 1). Uma tabela declarada exaustiva que não cobre falha de IO obrigaria o implementador a inventar mapeamento — proibido pela própria cláusula de parada; daí o `io-failed` da v1.3.
- **Alternativa descartada:** descobrir o argv na hora, ou duplicar o contrato no ADR — a primeira já foi rejeitada pela SPEC-0040; a segunda cria duas fontes de verdade.

**D13. Nenhum áudio ou transcrição é persistido.**

- **Decisão:** nada além do `.wav` temporário (sempre removido) toca o disco; nada vai para memória, log ou telemetria.
- **Porquê:** ADR-0022(d) e Artigo 11 — gravação de voz é o dado mais sensível que a app já manipulou.
- **Alternativa descartada:** guardar as últimas gravações para diagnóstico — armazenamento não catalogado e risco de privacidade sem contrapartida.

**D14. Orçamento de tempo assimétrico: gravação 30 s, timeout proporcional `clamp(20 s + 5 × duração, 20 s, 180 s)`, `SIGTERM`→`SIGKILL` em 2 s.** *(corrigida na v1.2; saída de usuário acrescentada na v1.3)*

- **Decisão:** o teto de gravação (30 s) fica **bem abaixo** do orçamento de transcrição, que **cresce com a duração derivada do áudio** em vez de ser um valor fixo. E, porque essa janela pode chegar a 170 s, o cancelamento permanece alcançável durante ela (R3).
- **Porquê:** a v1.1 tinha teto de gravação e timeout ambos em 60 s e, **sem processo quente** (D8), a fala mais longa permitida teria que carregar o modelo `small` *e* inferir dentro do mesmo orçamento — resultado provável: `timeout` e áudio descartado exatamente na fala mais cara. Corrigido nos dois eixos: piso de 20 s para o carregamento do modelo, fator 5× de folga para CPU modesta, teto absoluto de 180 s para nunca ficar preso. A contrapartida honesta de um timeout maior é dar ao usuário uma saída durante ele — sem isso, a correção do A4 teria trocado um modo de falha por outro (Artigo 13).
- **Alternativa descartada:** timeout fixo (colide com a duração variável); sem teto/sem timeout (estados presos e não verificáveis); teto de gravação de 15 s (cortaria ditados legítimos de instrução de código); descartar o áudio ao atingir o teto (puniria o usuário por falar demais); manter o "Cancelar" só na gravação (deixaria até 170 s de UI presa com um canal de aborto que a interface não alcança).

**D15. Um modelo em caminho fixo, sem descoberta de catálogo.**

- **Decisão:** `<sttDir>/whisper-cli` + `<sttDir>/models/ggml-small-q5_1.bin`; `isAvailable()` verifica exatamente esses dois arquivos; sem varredura nem seleção.
- **Porquê:** consequência direta da decisão de produto 2 do ADR-0022. O `piper-tts.ts` precisa de descoberta porque a **voz** é preferência do usuário e há várias; modelo de reconhecimento é trade-off técnico, e descoberta para um item só é complexidade sem uso (Artigo 14) — além de abrir a porta para expor a escolha na UI, que o ADR-0022 recusou.
- **Alternativa descartada:** replicar a descoberta do Piper por simetria — simetria de código não é razão para carregar mecanismo sem demanda. Se o catálogo multi-modelo vier, a descoberta entra junto, com uso real.

**D16. O arranque de `main.ts` é verificado por asserção estática de fonte, não por mock do módulo `electron`.** *(v1.2 — achado A2)*

- **Decisão:** o CA de registro (CA 20) é um teste que lê `src/main.ts` do disco e afirma a presença dos dois handlers de permissão, dos cinco canais `'atlas:stt:*'` e dos três gatilhos de fecho da janela de captura. Nenhum mock de `electron`, nenhum teste de runtime do main process.
- **Porquê:** `main.ts` importa `electron` e **não tem teste algum** hoje — nem para os 15 `ipcMain.handle` já existentes. Introduzir `vi.mock('electron')` criaria um **precedente novo** no repo, dentro de uma fatia que já carrega dependência binária nova, e arrastaria a manutenção de um dublê de Electron inteiro. `main.ts` é casca fina por regra documentada: não há lógica de domínio ali para exercitar — só fiação, que é o que uma asserção de fonte consegue provar. Gate mecânico honesto, na linha do gate de paridade da SPEC-0045.
- **Alternativa descartada:** mockar `electron` no Vitest (precedente novo, custo de manutenção, benefício marginal sobre casca fina); deixar o CA sem verificação alguma (a v1.1 exigia um teste que ninguém sabia escrever).
- **Limite reconhecido:** asserção de fonte prova que a fiação **está escrita**, não que ela **executa**. Coerente com a pendência de smoke já aberta.

**D17. Janela de captura como canal IPC explícito, com watchdog, rearme e gatilhos de fecho.** *(v1.2 — achado A1; rearme acrescentado na v1.3 — R1)*

- **Decisão:** `captureInFlight` é o estado de um `CaptureWindow` no main, aberto por `'atlas:stt:capture:begin'` (chamado **antes** de `getUserMedia` e **de novo quando ele resolve**) e fechado por `'atlas:stt:capture:end'` (em `finally`, em todos os caminhos), por watchdog de 35 s, por navegação/recarga do `webContents`, pelo fechamento da janela e pelo encerramento da app. `begin`/`end` são idempotentes.
- **Porquê:** na v1.1 nenhum canal ligava esse flag, e o Fluxo mostrava `getUserMedia` **antes** de o main saber da gravação: o flag seria sempre `false`, a permissão sempre negada, o botão nunca gravaria — e o CA de permissão passaria verde mesmo assim, porque testava a função pura isolada. O oposto também é fatal: uma janela presa em aberto transforma o argumento fail-closed do D9 numa concessão permanente de microfone. **O rearme (v1.3)** fecha a aritmética que faltava: como `begin` precede `getUserMedia` por decisão, o orçamento de 35 s incluía o tempo de leitura do diálogo nativo do SO na primeira concessão — o watchdog poderia fechar no meio de uma gravação legítima (erro para o lado fechado, mas com re-check do Chromium negando sem mensagem clara). Rearmar na resolução faz a contagem começar no início real da captura, **sem** ampliar o teto e **sem** primitiva nova: usa a idempotência já pinada.
- **Alternativa descartada:** ampliar o watchdog para absorver a leitura do diálogo (aumentaria a janela de concessão para todo mundo por causa do caso raro — o oposto de mínimo); mover o `begin` para depois de `getUserMedia` (a permissão seria negada, o bug original do A1); inferir a janela a partir do próprio pedido de permissão (circular); carência após o `end`; manter o flag só no renderer (o lado sem privilégio não pode atestar sobre si).

**D18. O main valida a fronteira, deriva a duração e impõe seus próprios tetos; nunca reamostra.** *(v1.2 — achado A3; duração derivada acrescentada na v1.3 — R4)*

- **Decisão:** o payload tem **dois campos** (`pcm`, `sampleRate`). `sampleRate` deve ser exatamente 16000; `pcm.byteLength` deve ser > 0, par e ≤ 1 000 000. A **duração é derivada no main** (`byteLength / 2 / 16000`), nunca recebida. Violações resolvem `invalid-audio` ou `audio-too-long`, **antes** de escrever arquivo ou iniciar processo.
- **Porquê:** a v1.1 declarava a tabela exaustiva mas não tinha entrada para entrada inválida, e o teto vivia **só no renderer** — o main aceitaria buffer e `sampleRate` arbitrários com o cabeçalho WAV pinado em 16 kHz. O renderer é o lado sem privilégio: seus limites são conforto de UI, não garantia. **A derivação (v1.3)** leva o mesmo princípio à sua conclusão: com `sampleRate` obrigatoriamente 16000 e PCM `Int16` validado, `durationMs` é função pura do que já foi validado — recebê-lo do renderer seria carregar um terceiro campo de zero informação nova, com superfície de confiança extra, uma regra de validação a mais e um caminho de `invalid-audio` a testar. Menos campo, menos regra, menos confiança: passa nos quatro testes da Constituição.
- **Alternativa descartada:** manter `durationMs` no payload (superfície de confiança sem informação nova; um valor mentiroso do renderer distorceria o orçamento de timeout); reamostrar no main (traria DSP para um módulo que é só orquestração de subprocesso, e mascararia bug do renderer); confiar no teto do renderer; truncar áudio acima do teto em vez de recusar (transcreveria metade da fala em silêncio).
- **Falha de IO (v1.3 — R2):** `writeFile` rejeitando ganha `reason` próprio, **`io-failed`**, em vez de ser dobrado em `engine-failed`. Motivo: a causa é ambiental do usuário (tmpdir sem permissão, disco cheio), não do motor, e a UI mostra um aviso por `reason` (CA 33) — juntar as duas produziria a mensagem errada exatamente quando o usuário pode agir. Já `unlink` falhando **nunca** vira desfecho: a transcrição já terminou, e transformar falha de limpeza em falha de resultado descartaria um trabalho bem-sucedido por um detalhe de higiene. **Alternativa descartada:** reusar `engine-failed` com `detail` (mensagem errada ao usuário); deixar a rejeição escapar de `transcribe` (violaria o CA 10 e a garantia de que nenhum caminho lança).

**D19. O harness ganha relógio injetável na janela jsdom e as entradas novas no `EPILOGUE`.** *(v1.2 — achado A6)*

- **Decisão:** `loadRenderer` substitui `setTimeout`/`clearTimeout`/`setInterval`/`clearInterval`/`Date.now` **do objeto `window` do jsdom**, antes do `window.eval`, por um relógio controlado exposto em `fixture.clock.advance(ms)`; e o `EPILOGUE` (lista fixa, por design da SPEC-0045/D3) recebe explicitamente os símbolos novos do glue de voz.
- **Porquê:** `renderer.js` roda dentro da janela jsdom e usa **os timers daquela janela**; `vi.useFakeTimers()` patcheia `globalThis`, não o `window` do jsdom — sem isso, os CAs de teto de gravação e de rearme obrigariam a suíte a esperar tempo real, e seriam silenciosamente afrouxados na implementação. Pelo mesmo motivo, o `EPILOGUE` publica símbolos por lista fixa: um símbolo novo do glue simplesmente **não existe** para os testes até ser adicionado ali. Ambos são mudanças em `tests/`, zero diff em `src/` — a disciplina da SPEC-0045 segue intacta, e como `renderer.js` não usa timers hoje, nenhuma suíte existente muda de comportamento.
- **Alternativa descartada:** costurar uma porta de tempo no `renderer.js` para os testes (mudaria `src/` por causa de teste — o que a SPEC-0045/D2 recusou); esperar tempo real (suíte inviável); descobrir símbolos por introspecção do arquivo de produção (rejeitado pela SPEC-0045/D3).
