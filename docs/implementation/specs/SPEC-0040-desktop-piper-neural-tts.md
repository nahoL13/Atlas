# SPEC-0040 — Desktop: Piper como motor de TTS neural local, com processo de longa duração e fallback fail-closed para a Web Speech API

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0040

---

**Título**

Desktop: integrar o Piper (TTS neural 100% local) como primeira camada de saída de voz — subprocesso de longa duração no main process, catálogo de vozes PT-BR empacotadas, playback por `<audio>` no renderer, e a Web Speech API das SPECs 0035/0036 preservada como fallback fail-closed

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

`Fase 2 — 2.3 Voz` (linha "Saída por voz (TTS)").

Continuação direta da linha já aberta pelas SPECs [0035](SPEC-0035-desktop-voice-output-tts.md) (saída de voz) e [0036](SPEC-0036-desktop-tts-local-voice-only.md) (endurecimento para voz 100% local), agora com o motor de voz decidido pelo [ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) (Status: Accepted, 2026-07-29). Não é item novo do Roadmap: a linha 2.3/TTS permanece aberta (o critério de conclusão da Fase 2 pede "voz funcional nos dois sentidos", e a entrada por voz segue fora desta fatia).

---

# Objetivo

Ao final desta SPEC, a saída de voz do `@atlas/desktop` fala por um motor de TTS **neural** local (Piper), não mais pelas vozes robóticas do sistema operacional, sem abrir mão de nenhuma garantia já conquistada:

- um módulo novo e testável sem Electron, `apps/desktop/src/piper-tts.ts`, mantém **um processo Piper de longa duração** no main process (modelo carregado uma vez, reusado entre frases) e devolve bytes WAV por utterance;
- o catálogo de vozes Piper instaladas é descoberto em disco e exposto ao renderer por IPC, ao lado das vozes locais do SO — o `<select>` de voz do formulário de Persona (SPEC-0039) passa a listar as duas origens;
- `Persona.voiceURI?` (ADR-0020) aceita tanto o `voiceURI` de uma voz do SO (formato atual, sem migração) quanto um identificador de modelo Piper prefixado (`piper:pt_BR-faber-medium`);
- Personas sem voz escolhida — inclusive as embutidas `jarvis`/`neutral` — passam a falar por um modelo Piper default;
- a Web Speech API das SPECs 0035/0036 continua inteira, como **fallback fail-closed**: sem binário/modelo Piper disponível (ou com a síntese falhando), a app cai na seleção determinística de voz local do SO — nunca fica muda por causa da dependência nova, nunca fala por uma voz de rede;
- o botão "🔊 Ouvir" do chat e o botão "Testar voz" do formulário de Persona continuam sendo os únicos gatilhos de fala (nenhuma fala automática).

---

# Motivação

O PRD estabelece, em Requisitos Funcionais / Comunicação (l. 57): **"O sistema deve permitir interação por voz"**, e em Escopo do MVP (l. 217): "suporte básico à voz". A SPEC-0035 entregou esse suporte pelo caminho de menor raio (Web Speech API embutida no Chromium) e a SPEC-0036 o endureceu para vozes locais. O problema que ficou é de **qualidade percebida**: as vozes do SO — incluindo as variantes "Enhanced"/"Premium" do macOS — soam robóticas o bastante para desestimular o uso da voz, esvaziando na prática o requisito do PRD.

O [ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) (Accepted) resolveu a parte estrutural: Piper como subprocesso local invocado só pelo main process, confinado a `apps/desktop` (nenhum módulo novo no Module Catalog, nenhuma Tool nova), com a Web Speech API preservada como fallback e `Persona.voiceURI?` reinterpretado em vez de duplicado. As três decisões de produto (distribuição empacotada, catálogo completo de vozes PT-BR, embutidas também em Piper) e a mitigação obrigatória de latência (processo de longa duração) também já estão fechadas lá. Esta SPEC é o consumo dessas decisões.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Comunicação (l. 57: interação por voz); Escopo do MVP (l. 217: suporte básico à voz)
- [ADR-0021 — Piper como motor de TTS local](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — **fonte de verdade estrutural desta SPEC**
- [ADR-0020 — Persona persistível com voz vinculada ao TTS](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) — `Persona.voiceURI?` e a hierarquia de fallback de voz
- [ADR-0019 — Stack do desktop (Electron)](../../06-adr/ADR-0019-desktop-electron-stack.md) — sem bundler no renderer, `contextIsolation: true`
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) / [ADR-0014](../../06-adr/ADR-0014-toctou-atomic-enforcement.md) — fronteira do Permission Service (o que ele julga e o que não julga)
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Persona Service (l. 860-868: "deve controlar ... voz"); Output Gateway (l. 921-933: "pode apresentar ... voz")
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 2 (o usuário interage com apenas uma Persona) e 9 (especialização invisível), 4 (responsabilidade única), 7 (transparência obrigatória), 8 (segurança prevalece sobre autonomia), 11 (autoridade da memória sobre estado persistente)
- [SPEC-0035](SPEC-0035-desktop-voice-output-tts.md) / [SPEC-0036](SPEC-0036-desktop-tts-local-voice-only.md) — TTS atual, fail-closed e duplicação deliberada renderer↔main
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) — formulário de Persona e `<select>` de voz a estender
- [SPEC-0033](SPEC-0033-desktop-visual-chat.md) — molde de recurso vivo no main process (`openChatSession`/`closeChatSession` + teardown)
- [SPEC-0028](SPEC-0028-git-read-only-tools.md) — molde de subprocesso local injetável (`packages/tools/src/git-port.ts`)
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.3
- **Fontes externas do contrato técnico pinado** (ver D4 e D13): `rhasspy/piper` **v1.2.0** — `README.md` (seção *Usage*, lista de opções de linha de comando e modo `--json-input`) e `src/cpp/main.cpp` (framing por linha de stdin, campos aceitos na linha JSON, eco do caminho de saída em stdout); `rhasspy/piper-voices` — arquivos `<id>.onnx.json` publicados por voz (esquema real de configuração, `piper_version` 0.2.0/1.0.0). **Nenhuma dessas fontes foi executada no ambiente de redação desta SPEC** (sem binário e sem ambiente gráfico) — daí a regra de divergência explícita em D4.

---

# Escopo

1. **`apps/desktop/src/piper-tts.ts` (novo, puro/injetável, sem import de `electron` nem de globais de navegador):**
   - `PIPER_VOICE_PREFIX = 'piper:'`, `PiperVoice { id; voiceURI; name; language; sampleRate }`;
   - `PiperPaths { binary; modelsDir }` e as portas injetáveis mínimas: `PiperFsPort` (listar diretório, ler arquivo de texto, ler arquivo binário, remover arquivo, existir), `SpawnPiper` (subprocesso), `TmpDirProvider`, `RandomId` (gerador de identificador opaco para o arquivo temporário);
   - descoberta de modelos em `modelsDir` (`<id>.onnx` + `<id>.onnx.json` como par obrigatório), lendo os campos do JSON **nos caminhos de chave reais do Piper** (ver D13, a leitura autoritativa é a desta SPEC, não a de um campo `name`/`sampleRate` de topo, que não existe):
     - `sampleRate` ← `audio.sample_rate` (numérico); ausente ou não-numérico ⇒ derivado de `audio.quality` (`x_low`/`low` ⇒ `16000`; qualquer outro valor ou ausência ⇒ `22050`), **nunca** motivo de omissão do modelo;
     - `language` ← `language.code` (string, ex. `"pt_BR"`); ausente ⇒ `espeak.voice` (ex. `"pt-br"`); ausente também ⇒ o prefixo do `id` até o primeiro `-`;
     - `name` (rótulo de exibição) ← **derivado**, nunca lido de uma chave `name`: havendo `dataset` (string, ex. `"faber"`), `"<dataset> (<language>, <audio.quality>)"` com as partes disponíveis; sem `dataset`, o próprio `id`;
     - omissão do modelo **somente** em dois casos: par incompleto (`.onnx` sem `.onnx.json` irmão, ou o inverso) ou JSON que não parseia / não é objeto. Nenhum outro campo ausente omite modelo, e nada lança;
   - `createPiperTts(deps): PiperTts` com `listVoices(): Promise<readonly PiperVoice[]>`, `isAvailable(): Promise<boolean>`, `synthesize(text, voiceURI): Promise<PiperAudio | undefined>` (`PiperAudio { wav: Uint8Array; sampleRate }`), `cancel(): void` e `shutdown(): Promise<void>`;
   - **processo de longa duração**: no máximo um processo Piper vivo, iniciado sob demanda para o modelo pedido e **reusado** nas utterances seguintes do mesmo modelo (nenhum recarregamento de modelo por frase); trocar de modelo encerra o processo anterior e sobe o novo;
   - **contrato de invocação exatamente como pinado em D4** (argv, linha JSON de stdin, sinal de conclusão, timeout);
   - serialização: no máximo uma utterance em voo; uma nova submissão cancela a pendente;
   - fail-safe/fail-closed: binário ausente, modelo ausente, processo morrendo, timeout ou qualquer erro de IO ⇒ `synthesize` resolve `undefined` (nunca lança, nunca deixa processo/arquivo temporário órfão).
2. **`apps/desktop/src/speech-output.ts` (estender, sem quebrar a API atual):** helpers puros novos e exportados — `isPiperVoiceURI(voiceURI)`, `piperModelIdOf(voiceURI)` e `resolveVoiceBackend({ preferredVoiceURI, piperVoiceURIs, localVoiceURIs, defaultPiperVoiceURI })`, que decide **a origem** da fala (`{ backend: 'piper', voiceURI } | { backend: 'os', voiceURI } | { backend: 'none' }`) segundo a cadeia de fallback da Decisão D8. `createSpeechOutput` permanece **inalterado** em comportamento e continua sendo o **resolvedor autoritativo de qual voz do SO usar** no caminho `'os'` (D16).
3. **`apps/desktop/src/main.ts`:** constrói a instância única de `PiperTts` (injetando `spawn`/`fs`/`tmpdir`/gerador de id aleatório reais e `PiperPaths` resolvidos, ver D10), registra os canais IPC novos `'atlas:tts:voices'` / `'atlas:tts:speak'` / `'atlas:tts:cancel'` e encerra o processo Piper no teardown (`window-all-closed`/`before-quit`, ao lado do encerramento das sessões de chat da SPEC-0033).
4. **`apps/desktop/src/preload.cjs`:** expõe `window.atlas.tts.{voices,speak,cancel}`.
5. **`apps/desktop/src/renderer/renderer.js`:** roteamento de fala pelo `resolveVoiceBackend` replicado (duplicação deliberada já documentada nas SPECs 0035/0036/0039) — Piper primeiro (via IPC, playback por `Blob`/`<audio>` com `URL.createObjectURL`, buffer completo), caindo no `speechOutput` do SO quando o roteamento devolver `'os'` **ou** quando o IPC de Piper devolver ausência de áudio; o `<select>` de voz do formulário de Persona (SPEC-0039) passa a listar vozes Piper **e** vozes locais do SO, com a origem visível no rótulo; "Testar voz" e "🔊 Ouvir" passam pelo mesmo roteamento; botão desabilitado só quando o roteamento devolver `'none'`. **Reavaliação de disponibilidade em dois gatilhos** (D17): o catálogo Piper chega por IPC assíncrono, independente do evento `voiceschanged` do Chromium — `refreshSpeakButton` (sobre `pendingSpeakButtons`) e `populatePersonaVoiceSelect` são reexecutados **tanto** quando a resposta de `'atlas:tts:voices'` resolve **quanto** no `voiceschanged` já existente, e `populatePersonaVoiceSelect` preserva a opção selecionada inclusive quando ela é um `piper:<id>` que só apareceu na repopulação.
6. **`apps/desktop/src/renderer/index.html`:** CSP ampliada minimamente com `media-src 'self' blob:` (nada mais).
7. **`apps/desktop/resources/piper/README.md` (novo) + entrada em `.gitignore`:** contrato de layout dos recursos — **versão pinada do Piper (v1.2.0)**, nome do binário e arquivos acompanhantes por plataforma, pares `<id>.onnx`/`<id>.onnx.json`, **os caminhos de chave exatos lidos do `.onnx.json`** (`audio.sample_rate`, `audio.quality`, `language.code`, `espeak.voice`, `dataset`) com um exemplo real abreviado, o contrato de invocação de D4, a lista dos modelos PT-BR do catálogo, e as três formas de resolução do diretório (D10). Binário e modelos **não** são versionados no repositório.
8. **Testes:** `apps/desktop/tests/piper-tts.test.ts` (novo) e extensão de `apps/desktop/tests/speech-output.test.ts`, ambos sem Piper real, sem Electron e sem disco real (portas fakes). Os fakes de configuração **usam o esquema real** do `.onnx.json` (nunca um esquema inventado que só existe no teste).
9. **Documentação da própria SPEC:** nota de atualização no ADR-0021 registrando o que foi efetivamente decidido aqui (contrato de invocação pinado, framing da utterance, playback, resolução de recursos).

---

# Fora do Escopo

- **Entrada por voz (STT) e wake word** — seguem escalação obrigatória própria (SPEC-0035, Escalação E1); nada aqui as antecipa.
- **Instalador / pipeline de empacotamento** (`electron-builder`/Forge, `extraResources` concreto, assinatura e notarização por plataforma) — não existe pipeline de distribuição do desktop no repositório hoje; esta SPEC entrega o **contrato de resolução** dos recursos, não o instalador (D10).
- **Script de download/provisionamento dos assets** (binário + modelos) e qualquer download em runtime — o app nunca busca rede (D10).
- **Versionar o binário Piper ou arquivos `.onnx` no git.**
- **Qualquer alteração em `@atlas/contracts`, `@atlas/core`, `@atlas/persona` ou qualquer package** — `jarvis`/`neutral` seguem embutidas e imutáveis; o default de voz Piper é resolvido no app (D9).
- **Alteração em `core-bridge.ts`** — Piper não toca o Core (D2).
- **Tool nova (`speak_text`) ou qualquer envolvimento do Planner/Runtime/Permission Service com voz** — rejeitado no ADR-0021.
- **Streaming incremental de playback** (tocar antes de a síntese terminar) — buffer completo nesta fatia (D5).
- **Suporte a modelos multi-locutor** (`speaker_id`/`speaker` na linha JSON do Piper, `num_speakers > 1`) — o catálogo PT-BR desta fatia é mono-locutor; o campo simplesmente não é enviado.
- **Controle de prosódia** (`--length_scale`/`--noise_scale`/`--noise_w`/`--sentence_silence`), velocidade, pitch, volume, pausar/retomar e **fala automática** de respostas do chat (sem clique).
- **Persistir a voz escolhida fora de `Persona.voiceURI`** (nenhum estado persistente novo).
- **Equivalente de CLI** (`atlas` falando) e vozes não-PT-BR/voice cloning — candidatos futuros já nomeados no ADR-0021.
- **Windows/Linux validados na prática** — o contrato de layout prevê nome de binário por plataforma, mas a validação manual desta fatia é no ambiente do usuário (macOS); CI não executa Piper.

---

# Pré-requisitos

- [SPEC-0035](SPEC-0035-desktop-voice-output-tts.md) — `Done`
- [SPEC-0036](SPEC-0036-desktop-tts-local-voice-only.md) — `Done`
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) — `Done`
- [ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — `Accepted`

---

# Critérios de Aceitação

Todos os critérios de 1 a 24 são verificáveis **mecanicamente** (suíte automatizada ou inspeção do diff) e são o que fecha esta SPEC. O critério 25 é **verificação humana pós-merge**, explicitamente fora do que o `spec-validator`/`spec-closer` pode fechar (ver a nota ao final da seção).

Descoberta de vozes (`piper-tts.ts`, com `PiperFsPort` fake alimentado com configurações no **esquema real** do Piper):

1. `listVoices()` devolve um `PiperVoice` por par completo `<id>.onnx` + `<id>.onnx.json` presente em `modelsDir`, com `voiceURI === 'piper:' + id`, `sampleRate` lido de `audio.sample_rate`, `language` lido de `language.code` e `name` derivado de `dataset`/`audio.quality`/`language.code` — nenhum campo é lido de uma chave `name` ou `sampleRate` de nível raiz.
2. Um `.onnx.json` **sem** `audio.sample_rate` produz `sampleRate === 16000` quando `audio.quality` é `low`/`x_low` e `22050` nos demais casos (incluindo `audio` ausente) — e o modelo **continua na lista**. Um `.onnx.json` sem `language` cai em `espeak.voice` e, na falta dele, no prefixo do `id`; sem `dataset`, `name === id`. Nenhum desses casos omite o modelo nem lança.
3. O modelo é **omitido** da lista, sem lançar e sem afetar os demais, exatamente nestes casos e em nenhum outro: `.onnx` sem `.onnx.json` irmão; `.onnx.json` sem `.onnx` irmão; JSON malformado; JSON cujo topo não é objeto.
4. `modelsDir` inexistente/ilegível ⇒ `listVoices()` devolve `[]` e `isAvailable()` devolve `false`, sem lançar.
5. Binário ausente (`PiperFsPort` não o encontra) ⇒ `isAvailable()` devolve `false` mesmo havendo modelos.

Processo de longa duração e contrato de invocação (`SpawnPiper` fake):

6. Duas chamadas consecutivas de `synthesize` para o **mesmo** `voiceURI` produzem **exatamente uma** invocação de `SpawnPiper` (modelo carregado uma vez).
7. `synthesize` para um `voiceURI` diferente do modelo vivo encerra o processo anterior (`kill` observável no fake) e sobe **um** processo novo.
8. O argv observado no `SpawnPiper` é **exatamente** o de D4, na ordem de D4 (`--model <modelsDir>/<id>.onnx`, `--config <modelsDir>/<id>.onnx.json`, `--json-input`), é um **array** (nunca string de shell), nenhuma opção de shell é usada, e o **texto do usuário não aparece em nenhum elemento do argv**.
9. A linha escrita no stdin por utterance é **uma única linha** de JSON com exatamente os campos `text` e `output_file` (nenhum `speaker`/`speaker_id`), o `text` tem todo espaço em branco colapsado em espaços simples (nenhuma quebra de linha literal, que quebraria o framing por linha do Piper), e o JSON é serializado com escape (um texto de usuário contendo `"`/`\`/`\n` não corrompe a linha).
10. O `output_file` de cada utterance é **gerado no main process** a partir de `TmpDirProvider()` + um identificador opaco de `RandomId` (padrão `atlas-tts-<id>.wav`), e **nunca** deriva de nenhuma entrada vinda do renderer: com `text` e `voiceURI` hostis (`../`, caminho absoluto, separadores de diretório, aspas, `%00`), o caminho temporário observado continua dentro do `tmpdir` injetado e casa com o padrão gerado; dois `synthesize` consecutivos usam caminhos temporários distintos.
11. Em sucesso, `synthesize` resolve `{ wav, sampleRate }` com os bytes lidos do arquivo temporário da utterance, e o arquivo temporário é **removido** ao final (inclusive em caminho de erro).
12. A conclusão da utterance é reconhecida pela **primeira linha de stdout** recebida após a submissão, sem parsear seu conteúdo (D4); se, nesse momento, o arquivo temporário não existir ou estiver vazio, `synthesize` resolve `undefined`. Linhas em stderr nunca são tratadas como conclusão nem como erro fatal.
13. Sem linha de conclusão dentro do timeout de utterance de D4, `synthesize` resolve `undefined` (nunca pendura a promessa), o arquivo temporário é removido e o processo vivo é **encerrado e reciclado** (a chamada seguinte sobe um processo novo).
14. Processo morrendo/erro de `spawn`/`voiceURI` desconhecido/texto vazio ou só espaços ⇒ `synthesize` resolve `undefined`, sem lançar; uma chamada posterior volta a funcionar.
15. Uma segunda `synthesize` submetida com a primeira em voo cancela a primeira (que resolve `undefined`) e resolve normalmente a segunda; nunca há duas utterances em voo no mesmo processo.
16. `cancel()` durante uma utterance em voo faz a promessa resolver `undefined` sem lançar; `shutdown()` encerra o processo vivo, é idempotente e não lança quando não há processo.

Roteamento de voz (`speech-output.ts`, funções puras):

17. `isPiperVoiceURI`/`piperModelIdOf` reconhecem e desmontam `piper:<id>`, e tratam qualquer outro valor como voz do SO.
18. `resolveVoiceBackend` implementa exatamente a cadeia da D8, coberta caso a caso: preferida Piper existente ⇒ `piper`; preferida do SO existente ⇒ `os`; preferida ausente/inexistente com default Piper disponível ⇒ `piper` (default); sem Piper nenhum ⇒ `os` (1ª voz local); sem voz alguma ⇒ `none`.
19. `resolveVoiceBackend` **nunca** devolve uma `voiceURI` ausente das listas recebidas (nenhuma voz de rede, nenhum palpite).
20. **Concordância das duas resoluções no caminho `'os'` (D16):** para os três casos relevantes (preferência apontando para voz local existente; preferência ausente; preferência apontando para voz inexistente ou não-local), a `voiceURI` devolvida por `resolveVoiceBackend` no ramo `'os'` é **igual** à `voiceURI` que `createSpeechOutput` carimba no `UtteranceSpec` entregue ao `synth` fake com o mesmo conjunto de vozes e a mesma preferência. O teste declara no comentário que `createSpeechOutput` é a fonte de verdade e que `resolveVoiceBackend` só escolhe a origem.
21. Os testes já existentes de `createSpeechOutput` (SPECs 0035/0036/0039) continuam passando **sem uma linha alterada** (arquivo comparável por diff: só adições de casos novos), e três casos nomeados de `resolveVoiceBackend` — `catálogo Piper vazio + preferência de SO existente`, `catálogo Piper vazio + preferência ausente`, `catálogo Piper vazio + nenhuma voz` — devolvem, respectivamente, `os` com a voz preferida, `os` com a 1ª voz local e `none`, isto é, o **mesmo** desfecho do comportamento pré-SPEC-0040.

Integração (verificável por inspeção mecânica do diff):

22. `main.ts` registra `'atlas:tts:voices'`, `'atlas:tts:speak'` e `'atlas:tts:cancel'`, cria **uma** instância de `PiperTts` e chama `shutdown()` no teardown da app; `preload.cjs` expõe `window.atlas.tts.{voices,speak,cancel}`; `renderer.js` não importa `piper-tts.ts` nem qualquer `packages/*`; `piper-tts.ts` não importa `electron`.
23. `renderer.js` reavalia a disponibilidade de fala em **dois** gatilhos (D17): (a) ao resolver a resposta de `'atlas:tts:voices'`, reexecutando `refreshSpeakButton` sobre `pendingSpeakButtons` **e** `populatePersonaVoiceSelect`; (b) no listener de `voiceschanged` já existente (preservado, não substituído) — nenhuma checagem de disponibilidade é de tiro único no load. `populatePersonaVoiceSelect` lista as duas origens com rótulo de origem e preserva o valor selecionado quando a opção existir na lista nova, **inclusive** quando essa opção é um `piper:<id>` que só passou a existir depois da resposta do IPC (nunca cai silenciosamente na primeira opção).
24. `index.html` declara `media-src 'self' blob:` na CSP, e `script-src`/`default-src` permanecem `'self'`; nenhum arquivo em `packages/*`, `apps/cli/*` nem `apps/desktop/src/core-bridge.ts` é alterado; `apps/desktop/resources/piper/README.md` existe documentando a versão pinada do Piper, os caminhos de chave exatos do `.onnx.json`, o contrato de invocação de D4 e as três formas de resolução do diretório; `.gitignore` exclui `*.onnx`, `*.onnx.json` e o binário desse diretório; `pnpm lint`, `pnpm typecheck`, `pnpm format:check` e `pnpm test` passam, a suíte cresce e nenhum teste existente é removido ou enfraquecido.

**Verificação humana pendente (pós-merge, não fecha nem bloqueia esta SPEC):**

25. O ambiente de automação deste repositório **não tem acesso ao WindowServer** (`app.whenReady()` nunca resolve nesse sandbox — ver `apps/desktop/CLAUDE.md`) e não tem o binário Piper; este é o único critério que toca o motor real ponta a ponta, e por isso é uma **verificação manual pendente, a ser feita por quem tiver acesso a um ambiente gráfico real com os assets instalados**, antes de considerar a fatia 100% validada em produção. O que medir/observar, item a item:
    - "🔊 Ouvir" numa resposta do chat fala com **voz Piper** (perceptivelmente neural, não a voz do SO);
    - **latência**: tempo entre o clique e o início do áudio, medido na **primeira** fala (processo frio, carregamento do modelo) e nas **subsequentes** (processo quente) — confrontar o quente com a estimativa de ~100–300 ms de overhead da nota de desempenho do ADR-0021; registrar os números observados;
    - o `<select>` do formulário de Persona lista vozes Piper **e** do SO, com origem distinguível, e o catálogo aparece mesmo quando chega depois do carregamento da janela (D17);
    - uma Persona custom com voz Piper (`piper:<id>`) fala com ela, e a opção segue selecionada ao reabrir o formulário;
    - **um único processo Piper** vivo durante uma sessão com várias falas (verificável por monitor de processos), encerrado ao fechar a app (nenhum processo órfão);
    - nenhum arquivo `atlas-tts-*.wav` sobra no `tmpdir` após as falas;
    - removido/renomeado o binário, a app volta a falar pela **voz do SO** sem erro visível (fallback), e removido também o assets inteiro, o comportamento é o das SPECs 0035/0036;
    - conferência do contrato de D4 contra o binário real — qualquer divergência aciona a regra de retorno ao `spec-drafter` descrita em D4, **não** um ajuste improvisado de código.

---

# Arquivos Esperados

```text
apps/desktop/src/piper-tts.ts                (novo)
apps/desktop/src/speech-output.ts            (estendido)
apps/desktop/src/main.ts                     (IPC + ciclo de vida do engine)
apps/desktop/src/preload.cjs                 (window.atlas.tts)
apps/desktop/src/renderer/renderer.js        (roteamento + playback + <select> de vozes + reavaliação em 2 gatilhos)
apps/desktop/src/renderer/index.html         (CSP: media-src blob:)
apps/desktop/resources/piper/README.md       (novo: contrato de layout dos assets + esquema do .onnx.json + contrato de invocação)
.gitignore                                   (exclusão dos assets do Piper)
apps/desktop/tests/piper-tts.test.ts         (novo)
apps/desktop/tests/speech-output.test.ts     (estendido)
docs/implementation/specs/SPEC-0040-desktop-piper-neural-tts.md
docs/06-adr/ADR-0021-piper-tts-local-voice-engine.md  (nota de atualização, sem alterar a Decisão)
```

---

# Componentes Impactados

- Output Gateway (`apps/desktop`) — apresentação de voz
- Persona Service (`@atlas/persona`) — **só como consumidor**: `Persona.voiceURI?` já existente é reinterpretado, o package **não** é alterado (`persona-service.ts` já aceita qualquer string não-vazia em `voiceURI`, então `piper:<id>` passa sem alteração)
- Nenhum outro: Core, Cognitive, Runtime, Tools, Permission Service, Memory, Context e `@atlas/contracts` ficam intactos

---

# Interfaces Necessárias

Todas **locais** a `apps/desktop` (mesma regra de `StatusSnapshot`/`TurnSnapshot`/`PersonaDetail`: promoção a `@atlas/contracts` só com um 2º consumidor real, via ADR):

```text
PIPER_VOICE_PREFIX = 'piper:'

PiperVoice   { id; voiceURI; name; language; sampleRate }
PiperAudio   { wav: Uint8Array; sampleRate }
PiperPaths   { binary; modelsDir }

PiperFsPort  { listDir(dir); readText(path); readBytes(path); remove(path); exists(path) }
SpawnPiper   (command, args: readonly string[]) => PiperProcess
PiperProcess { writeLine(line); onStdoutLine(cb); onExit(cb); kill() }
TmpDirProvider () => string
RandomId       () => string   // identificador opaco do arquivo temporário (main process)

PiperTts     { listVoices(); isAvailable(); synthesize(text, voiceURI); cancel(); shutdown() }

// speech-output.ts (puro, já existente, estendido — createSpeechOutput inalterado)
isPiperVoiceURI(voiceURI): boolean
piperModelIdOf(voiceURI): string | undefined
resolveVoiceBackend(input): { backend: 'piper' | 'os'; voiceURI } | { backend: 'none' }
```

Canais IPC novos: `'atlas:tts:voices'` (→ `readonly PiperVoice[]`), `'atlas:tts:speak'` (`{ text, voiceURI }` → `PiperAudio | undefined`), `'atlas:tts:cancel'` (→ `void`).

---

# Fluxo Esperado

```text
usuário clica "🔊 Ouvir" (renderer)
        ↓
resolveVoiceBackend(voz da Persona ativa, vozes Piper via IPC, vozes locais do SO, default Piper)
        ↓                                   ↓                          ↓
   backend 'piper'                     backend 'os'              backend 'none'
        ↓                                   ↓                          ↓
window.atlas.tts.speak(text, voiceURI)  speechOutput.speak(text)   botão desabilitado
        ↓ (IPC → main)                  (Web Speech, SPEC-0036;     ("voz indisponível")
PiperTts.synthesize                      quem escolhe a voz do SO
        ↓                                é o preferredVoiceURI de
processo Piper vivo (modelo já carregado) createSpeechOutput — D16)
  stdin: {"text":"...","output_file":"<tmpdir>/atlas-tts-<rand>.wav"}
  stdout: 1 linha após escrever o WAV (eco do caminho) ⇒ conclusão
        ↓
lê os bytes WAV do arquivo temporário e o remove
        ↓ (IPC → renderer)
Blob → URL.createObjectURL → <audio>.play() → revokeObjectURL no fim
        ↓
undefined (indisponível/erro/timeout) ⇒ speechOutput.speak(text)  [fallback fail-closed]
```

---

# Estratégia de Implementação

1. `piper-tts.ts`: tipos, portas e **descoberta de modelos** com o esquema real do `.onnx.json` (sem subprocesso), com testes.
2. `piper-tts.ts`: ciclo de vida do processo vivo + contrato de invocação de D4 (`SpawnPiper` fake), com testes de reuso/troca de modelo/argv/linha de stdin/nome do temporário/timeout/cancelamento/serialização.
3. `speech-output.ts`: helpers puros de prefixo + `resolveVoiceBackend`, com testes exaustivos da cadeia D8 e o teste de concordância do caminho `'os'` (D16). Nenhuma mudança em `createSpeechOutput`.
4. `main.ts` + `preload.cjs`: instância única, resolução de `PiperPaths` (D10), canais IPC, teardown.
5. `renderer.js` + `index.html`: roteamento replicado (com o comentário de duplicação deliberada apontando o teste de referência), playback por `<audio>`, `<select>` com as duas origens, reavaliação nos dois gatilhos (D17), CSP.
6. `resources/piper/README.md` (com o esquema de chaves e o contrato de invocação) + `.gitignore`.
7. Rodar `lint`/`typecheck`/`format:check`/`test`; registrar o critério 25 como verificação manual pendente nas lições aprendidas.

---

# Estratégia de Testes

Vitest, sem Electron, sem Piper real, sem disco real (todas as portas fakes):

- **Descoberta**: pares completos e incompletos, JSON malformado, JSON não-objeto, `audio.sample_rate` ausente com e sem `audio.quality`, `language` ausente com e sem `espeak.voice`, `dataset` ausente, diretório ausente, binário ausente. Todos os fixtures usam o esquema real do Piper.
- **Contrato de invocação**: argv exato de D4 (array, sem shell, sem o texto do usuário); linha única de stdin com só `text`/`output_file`; escape de `"`/`\`/quebras de linha; caminho temporário gerado no main process e imune a `text`/`voiceURI` hostis.
- **Processo vivo**: uma única invocação de `SpawnPiper` para duas utterances do mesmo modelo; troca de modelo mata e recria.
- **Framing**: conclusão pela 1ª linha de stdout; arquivo ausente/vazio na conclusão; stderr ignorado; timeout com reciclagem do processo; morte do processo no meio; recuperação na chamada seguinte; remoção do arquivo temporário em todos os caminhos (sucesso, erro, timeout, cancelamento).
- **Serialização/cancelamento**: segunda utterance cancela a primeira; `cancel()`/`shutdown()` idempotentes e não-lançantes.
- **Roteamento**: cada ramo da cadeia D8, os dois casos degenerados, os três casos nomeados de catálogo Piper vazio (critério 21) e a concordância com `createSpeechOutput` no caminho `'os'` (critério 20).
- **Não-regressão**: a suíte existente de `speech-output` roda sem uma linha alterada.

Não são testadas automaticamente (registrado como residual): a duplicação do roteamento no `renderer.js` e a reavaliação nos dois gatilhos (mesmo atrito conhecido das SPECs 0035/0036/0039, verificados por inspeção do diff nos critérios 22-23), o playback real por `<audio>` e a execução do binário Piper real — este último coberto pela verificação humana pendente do critério 25.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- os Critérios de Aceitação **1 a 24** forem atendidos (o critério 25 é verificação humana pós-merge: não é fechável pelo `spec-validator`/`spec-closer` e não bloqueia o fecho — precisa ficar **registrado** como pendência explícita nas lições aprendidas e em `NEXT_CONTEXT.md`, no mesmo molde do smoke visual pendente da SPEC-0031);
- testes estiverem passando (`pnpm lint`/`typecheck`/`format:check`/`test`);
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz, `apps/desktop/CLAUDE.md`, `docs/05-context/NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é o passo de fecho `doc-sync`, não do `spec-implementer`. O implementador toca apenas a documentação específica desta SPEC (este arquivo, a nota de atualização no ADR-0021 e o `resources/piper/README.md`, que é artefato de escopo).

---

# Restrições

- **Nenhum módulo novo, nenhuma Tool nova, nenhuma alteração em `packages/*` nem em `@atlas/contracts`.**
- **Piper só no main process.** O renderer nunca conhece caminho de binário, caminho de modelo nem `child_process`; `piper-tts.ts` nunca importa `electron`.
- **Subprocesso sempre por argv array**, nunca `shell: true`, nunca string concatenada; texto do usuário só por stdin (molde `git-port.ts`); nome do arquivo temporário sempre gerado no main process.
- **Contrato de invocação do binário é dado da SPEC, não do código**: divergência do binário real ⇒ retorno ao `spec-drafter` (D4), nunca ajuste ad hoc.
- **Nenhuma chamada de rede** em runtime, em nenhum caminho — nem para baixar modelo, nem para sintetizar.
- **Fail-closed preservado**: nenhuma alteração pode fazer a app falar por uma voz marcada como remota; ausência de Piper degrada para o comportamento das SPECs 0035/0036.
- **Nenhum estado persistente novo** (Artigo 11): a voz vive em `Persona.voiceURI`, já persistida pelo `PersonaStorage` da SPEC-0039; arquivos temporários de áudio são apagados após o uso.
- **Nada de fala automática** — o gatilho continua sendo um clique explícito do usuário.
- Não versionar binários nem modelos no repositório.

---

# Observações

- **Latência esperada.** Com o processo quente, o ADR-0021 estima ~100–300 ms de overhead por resposta frente à Web Speech API. A estimativa deve ser **verificada**, não assumida, na verificação humana do critério 25; se o overhead observado for materialmente pior, isso é achado para as lições aprendidas (e eventual fatia futura de streaming incremental), não motivo para reabrir o ADR.
- **A garantia offline fica mais forte.** Com Piper, a garantia da SPEC-0036 deixa de depender de o SO reportar `localService` corretamente — no caminho Piper, a síntese é um subprocesso local sem rede. A ressalva herdada continua valendo apenas no **caminho de fallback** (vozes do SO).
- **Contrato técnico pinado, não executado.** O esquema do `.onnx.json` (D13) e o contrato de invocação (D4) foram derivados da documentação e do código da versão pinada do Piper, sem execução do binário no ambiente de redação. É por isso que existe a regra de divergência de D4 e que o critério 25 inclui a conferência explícita do contrato — o risco de "suíte verde com catálogo sempre vazio na máquina real" é conhecido e endereçado por construção (nenhum campo opcional omite modelo, ver critério 2).
- **Residuais conscientes**: instalador/`extraResources` real (Fase 3), provisionamento dos assets, streaming incremental de playback, modelos multi-locutor, binários de Windows/Linux não validados, e a duplicação do roteamento no renderer sem cobertura automatizada (4ª ocorrência do mesmo atrito — deve ser reafirmada nas lições aprendidas).
- **Artigos 2 e 9 preservados**: o usuário percebe uma voz (uma Persona), não um motor, e a especialização interna segue invisível. O rótulo de origem no `<select>` de vozes existe por **transparência** (Artigo 7), para o usuário distinguir vozes neurais das vozes do SO ao **escolher** — não é exposição de mecanismo interno durante a conversa.

---

# Checklist para IA

Antes de implementar:

- ler o ADR-0021 (fonte de verdade estrutural), o ADR-0020 e as SPECs 0035/0036/0039;
- ler `apps/desktop/CLAUDE.md` (padrão de duplicação renderer↔main, fronteira main/renderer, ausência de WindowServer no ambiente de automação);
- ler `packages/tools/src/git-port.ts` (molde de subprocesso injetável);
- ler D4 e D13 desta SPEC **antes** de escrever qualquer parser ou argv — os caminhos de chave e as flags são dados desta SPEC;
- confirmar que nenhuma decisão desta SPEC exige tocar `packages/*`.

Durante implementação:

- manter `piper-tts.ts` puro e injetável (testável sem Electron e sem Piper real);
- não expandir a superfície IPC além dos três canais previstos;
- replicar no renderer só o que ele não pode importar, sempre com comentário apontando o teste de referência;
- **se o binário real divergir de D4/D13, parar e devolver ao `spec-drafter`** — não improvisar flag, campo ou heurística de conclusão.

Após implementação:

- executar testes, lint, typecheck, format:check;
- validar os Critérios de Aceitação 1 a 24, um a um;
- registrar as lições aprendidas e a **pendência** do critério 25 (verificação humana em ambiente gráfico real).

---

# Resultado Esperado

O Atlas passa a falar com voz neural local. Ao clicar "🔊 Ouvir" numa resposta do chat, a janela pede ao main process a síntese por um processo Piper que já tem o modelo carregado, recebe os bytes WAV e toca o áudio — sem rede, sem recarregar o modelo por frase, sem que o Cognitive Core saiba que voz existe. O formulário de Persona oferece o catálogo de vozes PT-BR do Piper ao lado das vozes do SO, e a voz escolhida acompanha a Persona já persistida desde a SPEC-0039. Numa máquina sem os recursos do Piper instalados, absolutamente nada regride: a app fala pela voz local do SO exatamente como falava antes, e nunca por uma voz de rede.

---

# Decisões de design

Registradas em formato de veto (Emenda v1.1). Cada uma rastreia ao ADR-0021, ao ADR-0020, ao PRD, ao Module Catalog ou à Constituição; o `architecture-reviewer` é quem as ataca no gate `Draft → Ready`.

**D1 — Perfil `completo`.**
Porquê: a fatia vive em `apps/desktop` (não em `packages/X` + CLI), cria canais IPC novos, introduz uma dependência de execução externa e um diretório de recursos, e altera a superfície do renderer — falha em várias condições do ramo micro (ADR-0021 é precisamente o gate que essa mudança exigiu).
Alternativa descartada: `micro`, alegando que "só toca um app" — perdeu porque o ramo micro exige contenção a um package, aditividade sem dependência nova e nenhuma decisão estrutural; aqui há dependência binária nova, três canais IPC e mudança de CSP.

**D2 — O engine vive em `piper-tts.ts` e é fiado por `main.ts`; `core-bridge.ts` não é tocado.**
Porquê: Piper não fala com o Core em nenhum ponto, e o contrato do `core-bridge` é justamente a ponte com o Core (SPECs 0031–0039) — colocar o engine lá acoplaria coisas sem relação, contra o Artigo 4.
Alternativa descartada: funções `listPiperVoices`/`synthesizeSpeech` no `core-bridge` (simetria com Persona/permissões) — perdeu porque a simetria seria aparente: nenhuma dessas funções sobe `createAtlas` nem participa dos rastreios de operação em voo da SPEC-0038.

**D3 — Um único processo Piper vivo por vez, iniciado sob demanda e reusado; trocar de modelo recicla o processo.**
Porquê: cumpre literalmente a mitigação obrigatória do ADR-0021 (nota de desempenho) com a menor quantidade de estado possível — molde do recurso vivo no main process já validado na SPEC-0033.
Alternativa descartada: pool de um processo por modelo instalado — perdeu por manter N processos e N modelos residentes na RAM para um usuário que fala com uma voz por vez; e um subprocesso por utterance está proibido pelo ADR.

**D4 — Contrato de invocação pinado: Piper `v1.2.0` (`rhasspy/piper`, binário C++ standalone), modo `--json-input`, uma linha JSON por utterance com `output_file` próprio, conclusão pela 1ª linha de stdout, timeout de 15 s com reciclagem do processo.**

O contrato **exato**, dado desta SPEC e não do código:

- **Versão pinada**: `rhasspy/piper` **v1.2.0** — última release com binário nativo autocontido (`piper_macos_aarch64.tar.gz` / `piper_macos_x64.tar.gz` / `piper_linux_x86_64.tar.gz` / `piper_windows_amd64.zip`), que traz o executável (`piper`/`piper.exe`) acompanhado das bibliotecas compartilhadas (`libpiper_phonemize`, `onnxruntime`) e do diretório `espeak-ng-data/` no **mesmo** diretório — layout que o `resources/piper/README.md` deve documentar (o binário precisa dos vizinhos para funcionar; mover só o executável não funciona).
- **argv, nesta ordem, sempre array**:
  `['--model', '<modelsDir>/<id>.onnx', '--config', '<modelsDir>/<id>.onnx.json', '--json-input']`.
  Sem `--output_file`/`--output_dir` na argv (o caminho de saída vai **por utterance** na linha JSON, para o app controlar o nome); sem `--quiet` (o log de stderr é drenado e ignorado, e não se assume nada sobre `--quiet` interferir no eco de stdout usado como sinal de conclusão); sem flags de prosódia (fora de escopo).
- **Uma linha por utterance no stdin**, JSON compacto terminado em `\n`:
  `{"text":"<texto normalizado>","output_file":"<caminho absoluto no tmpdir>"}`.
  `text` e `output_file` são os únicos campos enviados (o modo `--json-input` da v1.2.0 também aceita `speaker_id`/`speaker`, não usados aqui). O texto tem todo espaço em branco colapsado em espaços simples antes da serialização: o Piper lê **uma utterance por linha** de stdin, então uma quebra de linha literal quebraria o framing — a serialização JSON escapa `\n`/`"`/`\`, e a normalização é a segunda camada de garantia.
- **Sinal de conclusão**: a v1.2.0 escreve o WAV em `output_file` e **ecoa o caminho do arquivo escrito numa linha de stdout**, uma linha por utterance. A implementação trata **a primeira linha de stdout recebida após a submissão** como conclusão daquela utterance, **sem parsear o conteúdo** (robusto a mudança de formato do eco), e só então lê os bytes; arquivo ausente ou vazio nesse momento ⇒ `undefined`. stderr nunca é sinal de conclusão nem de erro fatal.
- **Timeout de 15 s por utterance**, contado da escrita da linha: margem ampla frente ao RTF 0.1–0.3x da nota do ADR-0021 para respostas curtas de chat, com o modelo já carregado. Expirado ⇒ `undefined`, remoção do temporário e **encerramento do processo** (um processo que perdeu o sincronismo de framing não é reusado).
- **Regra de divergência (vinculante)**: se, ao implementar, o binário real divergir de **qualquer** ponto acima — nome/forma de flag, suporte a `output_file` por linha no modo `--json-input`, ausência de eco em stdout por utterance, ou versão empacotada diferente da v1.2.0 — isso **não** é conserto de código do `spec-implementer`. É mudança de D4, portanto decisão arquitetural: parar, registrar o comportamento observado e **devolver ao `spec-drafter`**.

Porquê: o framing precisa ser **explícito, observável e testável com um `SpawnPiper` fake**, e o timeout transforma qualquer divergência de comportamento do binário em degradação para o fallback já existente, nunca em travamento (Artigo 7: falha visível e explicável; Artigo 8: o desfecho seguro prevalece). Pinar flags/campos/sinal como dado da SPEC — e não deixá-los para "descobrir na implementação" — é o que impede que a divergência seja mascarada por uma heurística inventada no código, o modo de falha silenciosa mais provável desta fatia.
Alternativas descartadas: `--output-raw` com detecção de fim por janela de silêncio no stdout — perdeu por framing frágil (uma pausa de processamento maior que a janela truncaria o áudio, bug silencioso de qualidade, exatamente o que esta SPEC existe para resolver). `--output_dir` com nome gerado pelo Piper — perdeu por entregar ao binário o controle do nome do arquivo (o app teria de adivinhar/varrer o diretório, e a superfície de nome deixaria de ser fechada por construção, contra D12). Piper 1.x em Python (`piper1-gpl`, `python3 -m piper`) — perdeu por exigir um runtime Python instalado ao lado do Electron, dependência de execução muito maior do que a decidida no ADR-0021 (um binário empacotado).

**D5 — Playback com buffer completo: bytes WAV cruzam o IPC e o renderer toca via `Blob`/`URL.createObjectURL` num `<audio>`.**
Porquê: o ADR-0021 declara buffer completo aceitável para respostas curtas de chat, e `<audio>` é a superfície nativa do Chromium — nenhuma dependência nova no renderer; o `objectURL` é revogado ao fim, sem acúmulo. O `sampleRate` devolvido é informativo: os bytes WAV carregam o próprio header, e é o header que o `<audio>` obedece — por isso um `sampleRate` derivado por default (D13) nunca distorce o áudio.
Alternativa descartada: streaming incremental (Web Audio + chunks por IPC) — perdeu por custo de complexidade desproporcional ao ganho percebido nesta fatia; fica como candidato futuro nomeado.

**D6 — CSP ampliada apenas com `media-src 'self' blob:`.**
Porquê: a CSP atual (`default-src 'self'`) bloquearia o `blob:` do áudio; ampliar só a diretiva de mídia mantém `script-src` intacto, o menor relaxamento que faz a D5 funcionar (ADR-0019, postura de segurança do renderer).
Alternativa descartada: servir o áudio por um protocolo customizado registrado no main (`atlas-audio://`) para não tocar a CSP — perdeu por adicionar um handler de protocolo e uma superfície nova de segurança para evitar uma diretiva de uma linha.

**D7 — Identidade de voz Piper como `piper:<modelId>`, com helpers puros de prefixo e um `resolveVoiceBackend` puro em `speech-output.ts`, replicado no renderer.**
Porquê: é literalmente o formato decidido no ADR-0021(d) — desambigua as duas origens sem inspecionar o disco e sem campo novo em `Persona` (o `persona-service.ts` já aceita qualquer string não-vazia em `voiceURI`, então `packages/persona` não muda); manter a decisão de roteamento numa função pura a torna testável, apesar de o consumo real ser no renderer sem bundler (ADR-0019).
Alternativa descartada: campo novo `Persona.piperVoice?` — perdeu por duplicar o conceito de voz na Persona, explicitamente rejeitado no ADR-0021(d), e exigiria mexer em `packages/persona`.

**D8 — Cadeia de fallback: voz preferida da Persona (Piper ou SO, se existir) → modelo Piper default → 1ª voz local do SO → mudo.**
Porquê: a escolha explícita do usuário sempre vence (ADR-0020(b) e as Personas custom já persistidas com voz de SO seguem funcionando sem migração); o default Piper aplica a decisão de produto (3) do ADR-0021 às Personas sem voz — inclusive `jarvis`/`neutral`; e o fim da cadeia é o comportamento exato das SPECs 0035/0036, mantendo o fail-closed.
Alternativa descartada: Piper sempre à frente, ignorando uma preferência de voz do SO — perdeu por sobrescrever silenciosamente uma escolha que o usuário fez na GUI da SPEC-0039 (contra o Artigo 7: o sistema não decide por baixo do usuário sem explicar).

**D9 — Modelo Piper default resolvido no app (`pt_BR-faber-medium` se instalado, senão o primeiro modelo por ordem de `id`), sem alterar `packages/persona`.**
Porquê: cumpre a decisão de produto (3) do ADR-0021 sem escrever voz de app dentro de Personas embutidas, que são imutáveis e agnósticas de plataforma (Module Catalog l. 860-868 e SPEC-0039); a lista ordenada por `id` torna o default determinístico mesmo sem `faber`.
Alternativa descartada: carimbar `voiceURI: 'piper:pt_BR-faber-medium'` em `jarvis`/`neutral` — perdeu por acoplar o Persona Service a um motor de TTS de um app específico e por quebrar quem não tem esse modelo instalado.

**D10 — Resolução dos recursos em três níveis: `ATLAS_PIPER_DIR` → `process.resourcesPath/piper` quando empacotado → `apps/desktop/resources/piper` em desenvolvimento; assets fora do git; nenhum download, nem em runtime nem por script desta SPEC.**
Porquê: honra a decisão de produto (1) do ADR-0021 (recursos locais, zero rede) pelo **contrato de layout**, que é a parte que existe hoje — o repositório não tem pipeline de empacotamento do desktop (empacotamento é Fase 3 do Roadmap), e a precedência env → empacotado → dev é a mesma lógica `flags > env > defaults` do ADR-0006 aplicada a caminho de recurso.
Alternativa descartada: `scripts/fetch-piper.mjs` baixando binário e modelos com manifesto de checksums — perdeu por acrescentar um passo de build dependente de rede e um manifesto a manter, dentro de uma SPEC que já introduz a dependência; pertence à SPEC de empacotamento. Também descartado versionar os assets no git (dezenas de MB de binário no histórico).

**D11 — Áudio da utterance em arquivo temporário do SO (`tmpdir` injetável), removido sempre; fora da política de `readRoots`/`writeRoots`.**
Porquê: o Permission Service julga ações de Tools sobre dados do usuário (ADR-0013) — artefato interno e efêmero do Output Gateway não é ação de negócio, e submetê-lo ao portão exigiria que a app pedisse permissão de escrita para falar, degradando a UX sem ganho de segurança.
Alternativa descartada: manter o áudio só em memória (`--output-raw`) para não escrever nada — perdeu junto com a D4 (framing frágil); descartado também escrever dentro de uma `writeRoot` do usuário (poluiria o espaço dele e exigiria consentimento).

**D12 — Segurança do subprocesso fechada por construção: `spawn` com argv array, nunca shell; texto do usuário só por stdin; caminho de modelo só da descoberta em disco; e o `output_file` temporário sempre gerado no main process.**
Porquê: é o padrão de subprocesso que o ADR-0021(a) manda reusar (molde `git-port.ts`), e fecha as **três** superfícies de entrada do renderer de uma vez: o `voiceURI` recebido é **resolvido** contra o catálogo descoberto (nunca usado como caminho), o `text` só existe dentro de um valor JSON no stdin, e o nome do arquivo de saída é `<tmpdir>/atlas-tts-<id aleatório>.wav` — derivado de `TmpDirProvider`/`RandomId` injetados, **nunca** de nenhum campo vindo do IPC. Assim nenhuma entrada do renderer pode escolher onde o processo escreve.
Alternativa descartada: aceitar caminho de modelo ou nome de arquivo de saída pelo IPC (flexibilidade para testes manuais) — perdeu por permitir que o renderer aponte o processo para um arquivo arbitrário, atravessando a fronteira de confiança do ADR-0019. Também descartado derivar o nome do temporário do texto ou do `voiceURI` (sanitização é lista negra; geração é lista branca).

**D13 — Descoberta de modelos pelo esquema real do `.onnx.json`, sem filtro de idioma embutido e sem omitir modelo por campo opcional ausente.**

Caminhos de chave autoritativos (esquema publicado em `rhasspy/piper-voices`, `piper_version` 0.2.0/1.0.0 — o topo do JSON **não** tem `name` nem `sampleRate`):

```json
{
  "audio": { "sample_rate": 22050, "quality": "medium" },
  "espeak": { "voice": "pt-br" },
  "inference": { "noise_scale": 0.667, "length_scale": 1.0, "noise_w": 0.8 },
  "phoneme_type": "espeak",
  "phoneme_id_map": { "…": [0] },
  "num_symbols": 256,
  "num_speakers": 1,
  "speaker_id_map": {},
  "language": {
    "code": "pt_BR", "family": "pt", "region": "BR",
    "name_native": "Português", "name_english": "Portuguese",
    "country_english": "Brazil"
  },
  "dataset": "faber",
  "piper_version": "1.0.0"
}
```

- `sampleRate` ← `audio.sample_rate`; ausente/não-numérico ⇒ derivado de `audio.quality` (`x_low`/`low` ⇒ `16000`, resto/ausente ⇒ `22050`);
- `language` ← `language.code` → `espeak.voice` → prefixo do `id` até o primeiro `-`;
- `name` ← derivado de `dataset` + `audio.quality` + `language`; sem `dataset`, o próprio `id` (que já é legível: `pt_BR-faber-medium`);
- omissão do modelo **só** por par incompleto ou JSON inválido/não-objeto. Qualquer par `<id>.onnx`/`<id>.onnx.json` presente entra no catálogo.

Porquê: a decisão de produto (2) do ADR-0021 pede o catálogo completo das vozes empacotadas, e os "candidatos futuros" do ADR preveem ampliá-lo sem mudança estrutural — um filtro `pt_BR` codificado obrigaria a mexer no código para cada voz nova. E a regra de omissão mínima existe para eliminar por construção o modo de falha mais perigoso desta fatia: exigir um campo que o esquema real não garante faria o catálogo ficar **sempre vazio** numa máquina real, com a suíte 100% verde contra fakes e a app degradando silenciosamente para o fallback — falha invisível, contra o Artigo 7.
Alternativa descartada: allowlist fixa de ids PT-BR — perdeu por criar um segundo lugar de verdade (código + disco) sobre quais vozes existem. Também descartado exigir `audio.sample_rate` (ou qualquer campo além do par de arquivos) para aceitar o modelo — perdeu exatamente pelo modo de falha acima: o `sampleRate` é informativo (o header do WAV é que manda no playback, D5), então derivá-lo por default é estritamente melhor que descartar a voz.

**D14 — Prioridade `High`.**
Porquê: o ADR-0021 está `Accepted` e a fatia destrava um requisito funcional do PRD (interação por voz) que hoje existe mas é pouco usável por qualidade de voz; ainda assim não é `Critical` — nada está quebrado, e há fallback íntegro.
Alternativa descartada: `Medium` (paridade com as SPECs 0035/0036/0039) — perdeu porque aquelas fatias criaram capacidade nova sem dor relatada, enquanto esta corrige uma insatisfação concreta já registrada no ADR.

**D15 — Nenhuma fala automática, nenhuma opção de velocidade/pitch, nenhum equivalente de CLI nesta fatia.**
Porquê: mantém a fatia do tamanho de uma sessão e preserva a fronteira das SPECs 0035/0036 (a fala é sempre um clique explícito) — o objetivo aqui é **trocar o motor**, não expandir o comportamento de voz.
Alternativa descartada: já entregar leitura automática das respostas do chat — perdeu por misturar mudança de motor com mudança de comportamento percebido, dificultando isolar regressões na verificação manual.

**D16 — No caminho `'os'`, `createSpeechOutput`/`preferredVoiceURI` é o resolvedor autoritativo de qual voz do SO usar; `resolveVoiceBackend` decide apenas a origem (`piper`/`os`/`none`).**
Porquê: `createSpeechOutput` já resolve a voz do SO a cada `speak` (amostrando `preferredVoiceURI`, filtrando `localService === true`, caindo na 1ª voz local) e é o mecanismo **existente e testado** das SPECs 0036/0039 — reaproveitá-lo intacto mantém a garantia fail-closed sem uma segunda implementação da mesma regra. A `voiceURI` que `resolveVoiceBackend` devolve no ramo `'os'` é informativa (rótulo/diagnóstico) e **não** é repassada ao `synth`; o critério 20 fixa em teste a concordância entre as duas resoluções, que hoje só coincidem por construção e sem nenhuma prova.
Alternativa descartada: passar a `voiceURI` de `resolveVoiceBackend` adiante (ex. `speechOutput.speak(text, voiceURI)`), tornando-o autoritativo — perdeu por exigir alterar a assinatura de `createSpeechOutput` (quebrando o critério de não-regressão da SPEC-0036/0039 e a 4ª réplica no renderer) para mover uma regra que já está no lugar certo; duas resoluções concorrentes sem teste de concordância é justamente o risco que esta decisão fecha.

**D17 — Disponibilidade de fala e catálogo de vozes são reavaliados em dois gatilhos independentes: a resposta do IPC de vozes Piper e o evento `voiceschanged` do Chromium.**
Porquê: o achado A2 da SPEC-0035 (honrado no `refreshSpeakButton` atual) resolveu o falso-negativo do `getVoices()` vazio no load; o catálogo Piper introduz uma **segunda** fonte assíncrona, com timing próprio e independente do `voiceschanged` — numa máquina com Piper instalado e **sem** voz local do SO, uma checagem de tiro único no load deixaria o botão travado em "voz indisponível" mesmo havendo voz neural disponível, regredindo exatamente a correção A2. Preservar a opção `piper:<id>` selecionada na repopulação do `<select>` é a mesma exigência aplicada à escolha do usuário (Artigo 7: nunca trocar silenciosamente a seleção dele).
Alternativa descartada: buscar o catálogo Piper de forma síncrona antes de pintar a interface — perdeu porque não existe IPC síncrono aceitável nessa fronteira (bloquear o renderer no `invoke` é pior que reavaliar) e porque não eliminaria o segundo gatilho de qualquer forma (o `voiceschanged` continua necessário para as vozes do SO).
