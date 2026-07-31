# SPEC-0043 — Desktop: resíduos de voz da SPEC-0041 — uma `voiceURI` salva que a app não pode oferecer agora deixa de ser apagada em silêncio, e o caminho `'os'` do renderer passa a honrar a voz da Persona (ADR-0020(b))

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0043

---

**Título**

Desktop: fechar os dois resíduos de voz registrados nas Observações da SPEC-0041 — (1) uma `Persona.voiceURI` persistida que o modo corrente **não pode oferecer por razão ambiental** (Piper indisponível, modelo removido, voz do SO desinstalada) passa a ser **preservada e visível** no formulário, em vez de apagada em silêncio no próximo submit; (2) o glue de TTS do renderer (`createSpeechOutputGlue`) passa a receber `preferredVoiceURI`, encerrando a deriva em que o caminho `'os'` ignorava a camada de preferência que `speech-output.ts` implementa desde a SPEC-0039/ADR-0020(b)

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

`Fase 2 — 2.3 Voz` (linha "Saída por voz (TTS)").

Continuação direta da linha aberta pelas SPECs [0035](SPEC-0035-desktop-voice-output-tts.md) / [0036](SPEC-0036-desktop-tts-local-voice-only.md) / [0039](SPEC-0039-desktop-persona-authoring.md) / [0040](SPEC-0040-desktop-piper-neural-tts.md) / [0041](SPEC-0041-desktop-piper-only-voice-surface.md). Não é item novo do Roadmap: a linha 2.3/TTS permanece aberta (a entrada por voz segue fora desta fatia, com escalação obrigatória própria).

---

# Objetivo

Ao final desta SPEC, o `@atlas/desktop` fecha os **dois resíduos não-bloqueantes** registrados nas Observações da SPEC-0041 e listados em `NEXT_CONTEXT.md`:

1. **Nenhuma `Persona.voiceURI` persistida é apagada em silêncio.** Hoje, no modo degradado (Piper indisponível), o `<select>` do formulário de Persona não oferece nenhuma voz Piper; abrir uma Persona com `voiceURI = piper:<id>` cai em "Nenhuma (voz padrão)" (D12 da SPEC-0041) e **qualquer submit posterior — mesmo para corrigir só o nome — apaga do disco a voz que o usuário havia escolhido**, sem aviso e sem gesto dele nesse sentido. Depois desta SPEC, uma `voiceURI` que o modo corrente não pode oferecer **por razão ambiental** (Piper indisponível, modelo Piper removido, voz do SO desinstalada) aparece no `<select>` como uma opção **retida**, já selecionada e rotulada como salva-porém-indisponível, com aviso visível ao lado: salvar preserva o valor; trocá-lo exige escolher outra opção explicitamente.
   A **política Piper-only da SPEC-0041 fica intacta**: uma `voiceURI` de voz do SO em modo Piper-only continua sendo **descartada por decisão de produto** (D6/D12 da SPEC-0041, com o aviso que já existe) — esta SPEC distingue "descartada por política, anunciada e desejada" de "não ofertável por ambiente, hoje silenciosa".

2. **O caminho `'os'` do renderer volta a honrar a voz da Persona.** `speech-output.ts` implementa desde a SPEC-0039 uma camada de preferência (`createSpeechOutput({ synth, preferredVoiceURI })`, ADR-0020(b), declarada **autoritativa** pela D16 da SPEC-0040), mas o renderer instancia `createSpeechOutputGlue({ synth })` **sem** `preferredVoiceURI` — então, no app real, a voz do SO escolhida numa Persona nunca foi usada: sempre soou a 1ª voz local. Depois desta SPEC o glue recebe o provider e replica as duas camadas do módulo, alimentado pelo **mesmo** ponto de política de superfície já existente (`piperOnlyPreference`), sem nenhuma condição nova.

Nenhum ADR é criado ou alterado em sua Decisão. O item (1) é aplicação direta dos Artigos 7 (transparência é obrigatória) e 8 (nenhuma ação destrutiva sem autorização explícita); o item (2) **restaura** o comportamento que o ADR-0020(b) e a D16 da SPEC-0040 já prescrevem e que o código do renderer não cumpria — é correção de deriva, não decisão nova.

---

# Motivação

O PRD estabelece "O sistema deve permitir interação por voz" (Comunicação, l. 57) e suporte básico à voz no Escopo Inicial do MVP (l. 217). Os dois resíduos contrariam esse conjunto:

- **Perda silenciosa de dado do usuário.** A `Persona.voiceURI` é dado dele, persistido em disco pelo Persona Service (ADR-0020). Hoje, editar uma Persona numa máquina sem Piper apaga a voz salva sem que ele peça, veja ou possa desfazer. É exatamente o que o Artigo 8 ("nenhuma ação destrutiva sem autorização explícita") e o Artigo 7 ("transparência é obrigatória") proíbem. A SPEC-0041 já aplicou esse mesmo padrão ao caso simétrico — voz do SO em modo Piper-only —, mas ali a substituição é **anunciada** (D6) e **desejada** (pedido explícito do usuário); aqui ela é acidental.
- **Um contrato documentado que o app não cumpre.** A camada de preferência de voz do SO foi especificada (SPEC-0039), testada no módulo puro, reafirmada como autoritativa (D16 da SPEC-0040) e citada em três documentos — e mesmo assim nunca chegou ao app, porque o renderer nunca passou o provider. Enquanto isso, `apps/desktop/CLAUDE.md` descreve o comportamento como se ele existisse. Documentação e código divergentes são precisamente o que o Artigo 1 e o invariante 8 do `CLAUDE.md` mandam parar e corrigir.

Ambos foram registrados como resíduos conscientes nas Observações da SPEC-0041 ("candidata a fatia futura") e escolhidos pelo usuário como a próxima fatia.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Comunicação (l. 57: interação por voz); Escopo do MVP (l. 217: suporte básico à voz)
- [ADR-0020 — Persona persistível com voz vinculada ao TTS](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) — `Persona.voiceURI?` e a hierarquia de fallback (b), que o item (2) restaura no renderer
- [ADR-0021 — Piper como motor de TTS local](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — Decisão (c) (fallback fail-closed, nunca removido) e (d) (`piper:<id>`); nota de atualização da SPEC-0041
- [ADR-0019 — Stack do desktop (Electron)](../../06-adr/ADR-0019-desktop-electron-stack.md) — renderer sem bundler, `contextIsolation: true`
- [SPEC-0041](SPEC-0041-desktop-piper-only-voice-surface.md) — **base direta**: D3 (`isPiperOnlyMode`, ponto único de decisão), D6 (aviso de voz legada), D8 (`<select>` por modo), D12 (queda em "Nenhuma"); **Observações**, onde os dois resíduos desta SPEC estão registrados
- [SPEC-0040](SPEC-0040-desktop-piper-neural-tts.md) — D8 (cadeia de fallback), D9 (default Piper), D16 (`createSpeechOutput` autoritativo no caminho `'os'`), D17 (dois gatilhos de reavaliação)
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) — formulário de Persona, `<select>` de voz, `preferredVoiceURI` amostrado a cada `speak`
- [SPEC-0035](SPEC-0035-desktop-voice-output-tts.md) / [SPEC-0036](SPEC-0036-desktop-tts-local-voice-only.md) — TTS do SO fail-closed; **achado A2** ("nunca ativo-porém-mudo")
- [SPEC-0042](SPEC-0042-test-split-scoped-verification.md) — verificação escopada (`pnpm --filter @atlas/desktop test`/`typecheck`)
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Persona Service ("Aplicar identidade e estilo de comunicação", controla voz); Output Gateway (`apps/*`)
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 1 (documentação é a verdade), 4 (responsabilidade única), 7 (transparência obrigatória), 8 (nenhuma ação destrutiva sem autorização explícita)
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.3
- [`apps/desktop/CLAUDE.md`](../../../apps/desktop/CLAUDE.md) — fronteira main/renderer, duplicação deliberada, quirk do `voiceschanged`

---

# Escopo

1. **`apps/desktop/src/speech-output.ts` (estender, sem alterar nada existente):** uma função pura nova e exportada, `resolvePersistedVoiceSelection`, que classifica em **quatro desfechos exaustivos** o destino de uma `voiceURI` persistida diante das opções que o modo corrente oferece —
   - `{ kind: 'none' }` — não há `voiceURI` persistida (ausente ou string vazia);
   - `{ kind: 'available'; voiceURI }` — a `voiceURI` está entre as oferecidas: comportamento atual, seleção normal;
   - `{ kind: 'dropped'; voiceURI }` — a `voiceURI` **deixou de ser honrada pela política Piper-only** (`piperOnlyPreference(...) === undefined`): é o caso D6/D12 da SPEC-0041, preservado **sem uma vírgula de mudança** — cai em "Nenhuma (voz padrão)", aviso de voz legada, e o submit substitui;
   - `{ kind: 'retained'; voiceURI }` — a `voiceURI` **continua honrada pela política**, mas não é ofertável **por razão ambiental** (Piper indisponível, modelo Piper ausente do catálogo, voz do SO desinstalada): passa a ser **retida**.
   `resolveVoiceBackend`, `createSpeechOutput`, `isPiperOnlyMode`, `piperOnlyPreference`, `isPiperVoiceURI`, `piperModelIdOf` e `PIPER_VOICE_PREFIX` ficam **inalterados** (nenhuma assinatura, nenhum comportamento). A classificação nova é composta **sobre** `piperOnlyPreference`, não uma condição paralela (D3 da SPEC-0041 preservada: um único ponto de política).
2. **`apps/desktop/src/renderer/renderer.js` — resíduo (1), opção retida:**
   - estado de módulo novo `retainedVoiceURI` (inicial `undefined`), definido por `openPersonaForm` a partir de `resolvePersistedVoiceSelection` (réplica pura, com comentário apontando o teste de referência — **7ª ocorrência** do padrão de duplicação deliberada) e **limpo** ao fechar/cancelar/submeter com sucesso o formulário e ao abrir o formulário de Persona nova;
   - `populatePersonaVoiceSelect()` acrescenta, quando `retainedVoiceURI` está definido e não coincide com nenhuma opção já listada, **uma** `<option>` extra ao final, com `value = retainedVoiceURI` e rótulo explícito de voz salva-porém-indisponível agora. Como `populatePersonaVoiceSelect` é reexecutada nos dois gatilhos de D17 (`voiceschanged` e resposta do IPC de TTS), a opção retida sobrevive a essas reexecuções com o formulário aberto;
   - `openPersonaForm` passa a decidir a seleção pelo desfecho: `available` ⇒ seleciona a `voiceURI` (como hoje); `retained` ⇒ seleciona a opção retida; `dropped` e `none` ⇒ "Nenhuma (voz padrão)" (D12 da SPEC-0041, intacto);
   - o aviso `#persona-voice-legacy` (elemento já existente, reusado — **sem diff em `index.html`**) passa a ter dois textos mutuamente exclusivos: o **atual**, byte a byte, no desfecho `dropped`; e um **novo**, no desfecho `retained`, declarando que a voz salva não está disponível neste momento, que salvar o formulário a **preserva** e que trocá-la exige escolher outra opção na lista. Vazio em `available`/`none`.
3. **`apps/desktop/src/renderer/renderer.js` — resíduo (1), botão "Testar voz":** o estado do botão passa a ser calculado por uma função nova `refreshTestVoiceButton()`, chamada ao final de `populatePersonaVoiceSelect()`, no fim de `openPersonaForm()` e num listener `change` novo do `<select>`. Regra única: **habilitado sse o valor selecionado é uma voz efetivamente reproduzível agora** — isto é, uma das opções oferecidas pelo modo corrente (Piper oferecidas ou locais do SO), nunca a opção retida e nunca "Nenhuma (voz padrão)". `title` explica o motivo quando desabilitado. Isso preserva o achado A2 (nunca ativo-porém-mudo) para a opção retida e, pela mesma expressão, para "Nenhuma" (hoje habilitado e silencioso).
4. **`apps/desktop/src/renderer/renderer.js` — resíduo (2), glue de TTS:** `createSpeechOutputGlue` passa a aceitar `{ synth, preferredVoiceURI }` — espelho exato da assinatura de `createSpeechOutput` — e replica as **duas** camadas de `selectVoiceURI` do módulo: entre as vozes `localService === true`, prefere a de `voiceURI` igual ao devolvido pelo provider (amostrado **a cada `speak`**, nunca fixado), e cai na 1ª voz local quando a preferência está ausente, lança, ou aponta para voz inexistente/não-local. O provider injetado é `() => piperOnlyPreference({ preferredVoiceURI: activePersonaVoiceURI, piperAvailable, piperVoiceURIs })` — o **mesmo** ponto de política de superfície já usado por `currentVoiceBackend`, sem nenhuma condição nova (um `piper:<id>` nunca casa com voz do SO e portanto degrada naturalmente para a 1ª voz local).
5. **Testes:** extensão de `apps/desktop/tests/speech-output.test.ts` cobrindo os quatro desfechos de `resolvePersistedVoiceSelection` caso a caso, mais os testes de não-regressão de `createSpeechOutput` com preferência (que já existem desde a SPEC-0039 e passam a ser o teste de referência citado pelo glue). Sem Electron, sem navegador, sem Piper real. Nenhum teste existente alterado, removido ou enfraquecido.
6. **Documentação da própria SPEC:** nota de atualização de uma frase na seção "Observações" do [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) (seção já criada pela SPEC-0041) registrando que a hierarquia (b) passou a valer **também no renderer** para o caminho de voz do SO — a deriva declarada na SPEC-0041 está fechada. Nenhuma linha de Decisão de nenhum ADR é editada; o ADR-0021 **não** é tocado (nada nesta SPEC altera a política Piper-only nem o fallback (c)).

---

# Fora do Escopo

- **Reverter, afrouxar ou reinterpretar a política Piper-only da SPEC-0041** — o desfecho `dropped` (voz do SO em modo Piper-only) fica byte a byte como está: não é retido, não vira opção "legado" no `<select>` (alternativa explicitamente descartada em D6 da SPEC-0041) e continua sendo substituído no submit, com o aviso atual.
- **Remover, desviar ou enfraquecer qualquer degrau do fallback interno** (`'os'` na cadeia, `audio === undefined ⇒ speechOutput.speak(text)`, filtro `localService === true`) — ADR-0021(c) segue em vigor; mexer nele é ADR novo, portanto escalação (Emenda v1.1).
- **Alterar `resolveVoiceBackend`, `createSpeechOutput`, `isPiperOnlyMode`, `piperOnlyPreference` ou `piper-tts.ts`** (assinatura ou comportamento) — a não-regressão das SPECs 0036/0039/0040/0041 é preservada por construção.
- **Migrar, reescrever ou limpar em disco qualquer `Persona.voiceURI`** — nada é gravado sem submit explícito do usuário (Artigo 8). Esta SPEC **reduz** escrita implícita; não introduz nenhuma.
- **Verificação ativa de que o binário do Piper executa** (sonda, health-check, síntese de teste) — residual declarado da SPEC-0041, mantido por decisão explícita do usuário.
- **Qualquer alteração em `packages/*`, `@atlas/contracts`, `apps/cli`, `apps/desktop/src/core-bridge.ts`, `main.ts` ou `preload.cjs`** — nenhum canal IPC novo, nenhuma superfície de Core nova, nenhum campo novo em `Persona`.
- **Alterar `apps/desktop/src/renderer/index.html`** — o `<span id="persona-voice-legacy">` já existe e é reusado para os dois avisos; CSP e rótulos ficam como estão.
- **Persistir a preferência de voz do SO por outro caminho** (config, arquivo, estado durável novo) — a fonte continua sendo `Persona.voiceURI` (ADR-0020).
- **Filtro por idioma, `<optgroup>`, ordenação nova ou qualquer redesenho do `<select>`** além da opção retida.
- **Cobrir o `renderer.js` por teste automatizado** (jsdom, harness de DOM, bundler para permitir `import`) — mudaria a stack do renderer (ADR-0019) e é fatia própria; o resíduo de cobertura segue o mesmo tratamento das SPECs 0035–0041 (inspeção de diff + verificação humana).
- **Entrada por voz (STT) / wake word, fala automática, prosódia, streaming incremental de playback, equivalente de CLI para voz** — fora de escopo desde as SPECs 0035/0040.
- **Fechar a verificação humana pendente do critério 25 da SPEC-0040** — esta SPEC acrescenta cenários à mesma pendência, não a resolve.

---

# Pré-requisitos

- [SPEC-0035](SPEC-0035-desktop-voice-output-tts.md) — `Done`
- [SPEC-0036](SPEC-0036-desktop-tts-local-voice-only.md) — `Done`
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) — `Done`
- [SPEC-0040](SPEC-0040-desktop-piper-neural-tts.md) — `Done`
- [SPEC-0041](SPEC-0041-desktop-piper-only-voice-surface.md) — `Done`
- [SPEC-0042](SPEC-0042-test-split-scoped-verification.md) — `Done` (habilita `pnpm --filter @atlas/desktop test`/`typecheck`)
- [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) — `Accepted`
- [ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — `Accepted`

---

# Critérios de Aceitação

Verificáveis **mecanicamente** (suíte automatizada ou inspeção do diff). `piperAvailable` é sempre um **booleano injetado** nos testes — nenhum critério afirma detectar causa física de indisponibilidade. A verificação humana em ambiente gráfico segue como pendência herdada (critério 25 da SPEC-0040), não como critério desta SPEC.

Helper puro (`speech-output.ts`, coberto em `tests/speech-output.test.ts`):

1. `resolvePersistedVoiceSelection` devolve `{ kind: 'none' }` quando `persistedVoiceURI` é `undefined` ou string vazia — nos dois modos.
2. Devolve `{ kind: 'available', voiceURI }` quando a `voiceURI` persistida está em `offeredVoiceURIs` — tanto para uma voz Piper em modo Piper-only quanto para uma voz do SO em modo degradado.
3. Devolve `{ kind: 'dropped', voiceURI }` **exatamente** quando `piperOnlyPreference({ preferredVoiceURI: persistedVoiceURI, piperAvailable, piperVoiceURIs })` é `undefined` e a `voiceURI` não está entre as oferecidas — isto é, voz do SO em modo Piper-only (caso D6/D12 da SPEC-0041).
4. Devolve `{ kind: 'retained', voiceURI }` nos três cenários ambientais: (a) `voiceURI = piper:<id>` em modo degradado (`piperAvailable === false` ou catálogo vazio); (b) `voiceURI = piper:<id>` em modo Piper-only com esse `<id>` **ausente** do catálogo; (c) `voiceURI` de voz do SO em modo degradado com essa voz **ausente** de `offeredVoiceURIs` (desinstalada).
5. `resolvePersistedVoiceSelection` **nunca inventa** uma `voiceURI`: todo desfecho diferente de `none` carrega exatamente a string recebida.
6. Os quatro desfechos são **mutuamente exclusivos e exaustivos**: para qualquer combinação de entradas, exatamente um `kind` é devolvido (teste tabular sobre a matriz de casos).
7. `resolveVoiceBackend`, `createSpeechOutput`, `isPiperOnlyMode`, `piperOnlyPreference`, `isPiperVoiceURI`, `piperModelIdOf` e `PIPER_VOICE_PREFIX` continuam com a **mesma** assinatura e o **mesmo** comportamento: os testes das SPECs 0035/0036/0039/0040/0041 passam sem uma linha alterada (`speech-output.ts` e `speech-output.test.ts` comparáveis por diff: só adições).

Superfície do renderer (verificável por inspeção mecânica do diff):

8. `openPersonaForm` deriva a seleção do `<select>` e o texto do aviso **de um único `resolvePersistedVoiceSelection`** (réplica local), com comentário apontando `tests/speech-output.test.ts` — nenhuma condição de voz duplicada em paralelo, 7ª ocorrência do padrão de duplicação deliberada.
9. No desfecho `retained`, `populatePersonaVoiceSelect()` acrescenta **exatamente uma** `<option>` extra com `value === retainedVoiceURI`, ela fica selecionada (`personaVoiceSelect.value === retainedVoiceURI`, `selectedIndex !== -1`) e seu rótulo declara que a voz está salva e indisponível agora.
10. A opção retida **sobrevive** às reexecuções de `populatePersonaVoiceSelect()` disparadas pelos dois gatilhos de D17 (`voiceschanged` e resposta do IPC de TTS) enquanto o formulário estiver aberto, e **não é duplicada** se a `voiceURI` voltar a ser oferecida (nesse caso a opção normal prevalece e nenhuma extra é acrescentada).
11. `retainedVoiceURI` é limpo ao cancelar, ao submeter com sucesso e ao abrir o formulário de Persona nova — nunca vaza de uma Persona para outra.
12. No desfecho `retained`, submeter o formulário sem tocar no `<select>` envia `voiceURI` **igual à persistida** (`readPersonaFormInput` inalterado: ele lê o valor do `<select>`), e escolher outra opção ou "Nenhuma (voz padrão)" troca/limpa o valor — a mudança só ocorre por gesto explícito.
13. O desfecho `dropped` mantém o comportamento da SPEC-0041 **sem nenhuma alteração de diff no efeito**: `<select>` em "Nenhuma (voz padrão)", aviso de voz legada com o **mesmo texto atual**, submit substituindo o valor persistido.
14. O aviso `#persona-voice-legacy` tem exatamente três estados: texto atual (`dropped`), texto novo (`retained`), vazio (`available`/`none`) — nunca os dois textos ao mesmo tempo, e `index.html` não é alterado.
15. `refreshTestVoiceButton()` habilita "Testar voz" **sse** o valor selecionado é uma das vozes oferecidas pelo modo corrente; fica desabilitado com `title` explicativo sobre a opção retida e sobre "Nenhuma (voz padrão)". É chamada em `populatePersonaVoiceSelect()`, ao fim de `openPersonaForm()` e no `change` do `<select>`. O critério 9 da SPEC-0041 (estado derivado das opções efetivamente oferecidas, nunca de `piperVoices.length`) continua satisfeito — esta é uma **refinação** dele, não uma reversão.
16. `createSpeechOutputGlue` aceita `{ synth, preferredVoiceURI }`, replica as duas camadas de `selectVoiceURI` (preferência entre vozes `localService === true` ⇒ 1ª voz local), **amostra o provider a cada `speak`** e trata provider ausente/lançando como preferência ausente — sem propagar erro em nenhum caminho.
17. O provider injetado é o resultado de `piperOnlyPreference({ preferredVoiceURI: activePersonaVoiceURI, piperAvailable, piperVoiceURIs })` — o mesmo ponto de política de `currentVoiceBackend`, sem nenhuma condição de voz nova no arquivo.
18. Consequências fixadas por inspeção: (a) em modo degradado, uma Persona com voz do SO persistida e instalada passa a falar por **ela**, não pela 1ª voz local; (b) em modo Piper-only, o fallback interno (`audio === undefined ⇒ speechOutput.speak(text)`) continua caindo na **1ª voz local**, porque a preferência entregue ao glue é `piper:<id>` ou `undefined` e nunca casa com voz do SO — ADR-0021(c) intacto; (c) nenhuma voz de rede em nenhum caminho (filtro `localService === true` preservado nas duas camadas).
19. `speakText`, `playPiperAudio`, `refreshSpeakButton`, `currentVoiceBackend`, `loadPiperVoices`, `readPersonaFormInput` e o handler de submit **não têm mudança de comportamento**; o handler de "Testar voz" só ganha a mudança de estado do botão descrita em 15 (o corpo do handler segue sem fallback, herdado da SPEC-0040).

Contenção e sanidade:

20. O diff não toca nenhum arquivo em `packages/*`, `apps/cli/*`, `apps/desktop/src/core-bridge.ts`, `apps/desktop/src/piper-tts.ts`, `apps/desktop/src/main.ts`, `apps/desktop/src/preload.cjs` nem `apps/desktop/src/renderer/index.html`. Nenhum canal IPC é adicionado, removido ou alterado.
21. A nota de uma frase existe na seção "Observações" do ADR-0020, registrando o fechamento da deriva do glue, sem editar nenhuma linha da Decisão; a nota afirma explicitamente que a hierarquia (b) volta a valer no renderer **no caminho degradado (Piper indisponível)**, e que **em modo Piper-only a precedência de (b) segue superseded pela SPEC-0041/ADR-0021(c)** — sem contradizer a nota vizinha (ADR-0020 l. 74 / ADR-0021 l. 91); o ADR-0021 não é alterado.
22. `pnpm lint`, `pnpm typecheck`, `pnpm format:check` e `pnpm test` passam na raiz; a suíte cresce e nenhum teste existente é removido ou enfraquecido.

---

# Arquivos Esperados

```text
apps/desktop/src/speech-output.ts            (estendido: resolvePersistedVoiceSelection + tipo do desfecho)
apps/desktop/src/renderer/renderer.js        (retainedVoiceURI + opção retida em populatePersonaVoiceSelect
                                              + openPersonaForm por desfecho + aviso duplo
                                              + refreshTestVoiceButton + glue com preferredVoiceURI)
apps/desktop/tests/speech-output.test.ts     (estendido)
docs/implementation/specs/SPEC-0043-desktop-voice-residues.md
docs/06-adr/ADR-0020-persona-persistence-voice-binding.md   (nota de uma frase em Observações, sem alterar a Decisão)
```

---

# Componentes Impactados

- Output Gateway (`apps/desktop`) — superfície de escolha de voz e glue de saída de voz
- Persona Service (`@atlas/persona`) — **só como consumidor**: o package **não** é alterado; muda apenas o que a GUI envia em `updatePersona` (e ela passa a enviar menos destruição, não mais)
- Nenhum outro: Core, Cognitive, Runtime, Tools, Permission Service, Memory, Context e `@atlas/contracts` ficam intactos

---

# Interfaces Necessárias

Uma função pura nova e um tipo de desfecho, **locais** a `apps/desktop` (mesma regra das demais superfícies GUI: promoção a `@atlas/contracts` só com 2º consumidor real, via ADR). Nenhum canal IPC novo.

```text
type PersistedVoiceSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'available'; readonly voiceURI: string }
  | { readonly kind: 'retained'; readonly voiceURI: string }
  | { readonly kind: 'dropped'; readonly voiceURI: string }

resolvePersistedVoiceSelection(input: {
  persistedVoiceURI: string | undefined;
  offeredVoiceURIs: readonly string[];
  piperAvailable: boolean;
  piperVoiceURIs: readonly string[];
}): PersistedVoiceSelection
```

Assinatura estendida do glue do renderer (JS, espelho de `createSpeechOutput`):

```text
createSpeechOutputGlue({ synth, preferredVoiceURI })  // preferredVoiceURI: () => string | undefined
```

---

# Fluxo Esperado

```text
abrir formulário de Persona
        ↓
resolvePersistedVoiceSelection({ persistedVoiceURI, offeredVoiceURIs, piperAvailable, piperVoiceURIs })
        ↓
  none        available          retained                         dropped
   ↓             ↓                  ↓                                ↓
"Nenhuma"   seleciona a voz   <option> retida + selecionada     "Nenhuma" (D12 da SPEC-0041)
aviso vazio  aviso vazio      aviso: "salva, indisponível        aviso de voz legada (texto atual)
                               agora; salvar preserva"
   ↓             ↓                  ↓                                ↓
        submit → readPersonaFormInput() lê o <select> (INALTERADO)
                  retained ⇒ preserva · dropped ⇒ substitui · só gesto explícito muda

"Testar voz" habilitado ⇔ selecionado ∈ vozes oferecidas agora (nunca retida, nunca "Nenhuma")

fala (INALTERADA no roteamento):
speakText → currentVoiceBackend() → piper | os | none
                                      ↓      ↓
                        IPC/Piper/WAV        speechOutput.speak(text)
                        undefined ⇒ ─────────────────┘  (fallback ADR-0021(c))
                                              ↓
                    glue: preferredVoiceURI() = piperOnlyPreference(...)
                          preferência local existente ⇒ usa-a  (NOVO: ADR-0020(b) restaurado)
                          senão                        ⇒ 1ª voz local  (comportamento atual)
```

---

# Estratégia de Implementação

1. `speech-output.ts`: acrescentar `PersistedVoiceSelection` e `resolvePersistedVoiceSelection`, composta sobre `piperOnlyPreference` (nada mais é tocado no arquivo).
2. `tests/speech-output.test.ts`: cobrir os critérios 1-6 e confirmar o critério 7 rodando a suíte existente sem alteração.
3. `renderer.js` — resíduo (2), o menor e mais isolado: estender `createSpeechOutputGlue` para `{ synth, preferredVoiceURI }`, replicando `selectVoiceURI`; injetar o provider baseado em `piperOnlyPreference` na construção de `speechOutput`.
4. `renderer.js` — resíduo (1): replicar `resolvePersistedVoiceSelection` com comentário de duplicação deliberada; introduzir `retainedVoiceURI` e sua limpeza; acrescentar a opção retida em `populatePersonaVoiceSelect`; reescrever a seleção e o aviso em `openPersonaForm` pelo desfecho.
5. `renderer.js`: extrair `refreshTestVoiceButton()` e ligá-la aos três pontos (fim de `populatePersonaVoiceSelect`, fim de `openPersonaForm`, `change` do `<select>`).
6. Verificação escopada durante o trabalho (`pnpm --filter @atlas/desktop test` / `typecheck`), depois os quatro comandos completos na raiz.
7. Conferir por diff que `core-bridge.ts`, `piper-tts.ts`, `main.ts`, `preload.cjs`, `index.html` e `packages/*` não foram tocados.
8. Nota de uma frase nas Observações do ADR-0020.

---

# Estratégia de Testes

Vitest, sem Electron, sem navegador, sem Piper real; `piperAvailable` sempre injetado.

- `resolvePersistedVoiceSelection`: um teste nomeado por desfecho e por cenário do critério 4 (três variantes de `retained`), mais o teste tabular de exaustividade/exclusividade (critério 6) e o de "nunca inventa `voiceURI`" (critério 5).
- Fronteira `dropped` × `retained`: caso explícito "voz do SO + modo Piper-only ⇒ `dropped`" ao lado de "voz Piper + modo degradado ⇒ `retained`", para fixar que a distinção é política × ambiente, não origem da voz.
- Não-regressão: a suíte existente de `speech-output` (SPECs 0035/0036/0039/0040/0041, incluindo o teste de concordância de D16 e os de `createSpeechOutput` com `preferredVoiceURI`) roda sem uma linha alterada.

Não testados automaticamente (residual consciente, mesma classe das SPECs 0035-0041): a réplica dos helpers no `renderer.js`, o conteúdo e a seleção do `<select>`, a opção retida sobrevivendo aos gatilhos, o estado do "Testar voz", o texto dos avisos, o playback real e a voz efetivamente ouvida — verificados por inspeção do diff (critérios 8-19) e pela verificação humana em ambiente gráfico.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação (1 a 22) forem atendidos;
- testes estiverem passando (`pnpm lint`/`typecheck`/`format:check`/`test` na raiz);
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz, `apps/desktop/CLAUDE.md`, `docs/05-context/NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é o passo de fecho `doc-sync`, não do `spec-implementer`. O implementador toca apenas a documentação específica desta SPEC (este arquivo e a nota no ADR-0020).

---

# Restrições

- **A política Piper-only da SPEC-0041 não é revertida nem afrouxada** — o desfecho `dropped` é preservado integralmente, incluindo o texto do aviso atual.
- **A Web Speech API não é removida, desabilitada nem contornada em nenhum degrau interno** — ADR-0021(c) segue em vigor.
- **`resolveVoiceBackend`, `createSpeechOutput`, `isPiperOnlyMode`, `piperOnlyPreference` e `piper-tts.ts` não podem ser alterados** (nem assinatura, nem comportamento).
- **Nenhuma ação destrutiva sem autorização explícita** (Artigo 8): esta SPEC só **reduz** escrita não solicitada; nada é gravado por abrir, reabrir ou repopular o formulário.
- **Nenhuma voz de rede em nenhum caminho** — o filtro `localService === true` permanece nas duas camadas do glue.
- **"Nunca ativo-porém-mudo" (achado A2 da SPEC-0035)** — nenhum controle de voz fica habilitado sobre uma seleção que não pode soar; o residual declarado da SPEC-0041 (binário presente porém inexecutável) permanece conhecido e não é objeto desta fatia.
- **Transparência (Artigo 7)** — nenhuma preservação nem nenhuma substituição de valor persistido ocorre sem aviso visível ao lado do campo.
- **Nenhum canal IPC novo, nenhum estado durável novo, nenhum campo novo em `Persona`.**
- **Duplicação renderer↔módulo só com comentário explícito** apontando o teste de referência — nunca tentar `import` de TS no renderer (ADR-0019).

---

# Observações

- **A distinção que sustenta a SPEC inteira é "política × ambiente".** Uma `voiceURI` deixa de ser ofertável por dois motivos muito diferentes: porque o produto **decidiu** não honrá-la mais (voz do SO em modo Piper-only — pedido explícito do usuário na SPEC-0041, anunciado por aviso) ou porque **a máquina, hoje, não a tem** (Piper não instalado, modelo removido, voz do SO desinstalada). O primeiro caso é uma substituição desejada; o segundo é perda de dado por acidente de ambiente, e é o que esta SPEC corrige. `resolvePersistedVoiceSelection` codifica essa distinção como uma composição sobre `piperOnlyPreference`, não como uma condição nova — se a política mudar um dia, a classificação acompanha sozinha.
- **O resíduo (2) é correção de deriva, não decisão nova.** ADR-0020(b), SPEC-0039 e a D16 da SPEC-0040 já dizem que `createSpeechOutput`/`preferredVoiceURI` é o resolvedor autoritativo da voz do SO. O renderer simplesmente nunca passou o provider. Fechar isso muda comportamento observável (em modo degradado a voz do SO escolhida passa a soar), e o `architecture-reviewer` deve olhá-lo como tal — mas a direção da mudança é **em direção** à documentação vigente, não para longe dela.
- **Efeito colateral aceito no "Testar voz" com "Nenhuma (voz padrão)" selecionado.** Hoje o botão fica habilitado e o handler retorna em silêncio. A regra única do critério 15 passa a desabilitá-lo com explicação. É mudança de comportamento não pedida diretamente pelo usuário, mas cai da **mesma expressão** que resolve o caso da opção retida (dividir as duas exigiria uma condição a mais para preservar um estado que já viola o achado A2). Registrado aqui por honestidade, e reversível numa linha.
- **Cobertura do renderer segue sendo o ponto fraco conhecido.** `renderer.js` não tem teste automatizado (sem bundler, ADR-0019), então a réplica dos helpers é verificada por inspeção de diff. Esta é a **7ª** ocorrência do padrão; o risco de deriva acumulado é real — e esta própria SPEC existe porque uma deriva dessas passou despercebida por seis fatias. Cobrir o renderer é candidato de fatia própria, com decisão de stack (portanto ADR), fora daqui.
- **Verificação humana herdada e ampliada.** O critério 25 da SPEC-0040 segue pendente e não é resolvido aqui. Acrescentam-se à mesma pendência: numa máquina sem Piper, editar uma Persona com `voiceURI = piper:<id>` e confirmar que a opção retida aparece selecionada, com aviso, e que salvar **preserva** o valor no arquivo de Personas; numa máquina com Piper, confirmar que o aviso e a substituição do caso `dropped` continuam exatamente como na SPEC-0041; e, em modo degradado, confirmar que a voz do SO escolhida numa Persona é a que efetivamente soa no "🔊 Ouvir".
- **Artigos 2 e 9 preservados**: o usuário continua percebendo uma única Persona com uma voz — o `<select>` fala de vozes, nunca de motores internos além do rótulo de origem já existente.

---

# Checklist para IA

Antes de implementar:

- ler a SPEC-0041 inteira (D3, D6, D8, D12 e as Observações onde os dois resíduos estão registrados) e a D16 da SPEC-0040;
- ler `apps/desktop/CLAUDE.md` (fronteira main/renderer, duplicação deliberada, quirk do `voiceschanged`);
- ler `apps/desktop/src/speech-output.ts` inteiro e as regiões de voz e de Persona de `renderer.js` (`createSpeechOutputGlue`, `piperOnlyPreference`, `offeredPiperVoices`, `currentVoiceBackend`, `loadPiperVoices`, `populatePersonaVoiceSelect`, `openPersonaForm`, `readPersonaFormInput`) antes de escrever qualquer linha.

Durante implementação:

- **não** editar `resolveVoiceBackend`, `createSpeechOutput`, `isPiperOnlyMode`, `piperOnlyPreference`, `speakText`, `playPiperAudio`, `refreshSpeakButton`, `readPersonaFormInput`, `piper-tts.ts`, `main.ts`, `preload.cjs` nem `index.html`;
- compor a classificação **sobre** `piperOnlyPreference`, nunca reescrever a condição de política em paralelo;
- manter o texto do aviso do caso `dropped` idêntico ao atual;
- replicar no renderer só o que ele não pode importar, sempre com comentário apontando o teste de referência;
- se a implementação parecer exigir mudar o que a política Piper-only honra, ou mexer em algum degrau do fallback interno, **parar** — isso é mudança de ADR, portanto escalação, não conserto de código.

Após implementação:

- executar `pnpm --filter @atlas/desktop test`/`typecheck` e depois `lint`/`typecheck`/`test`/`format:check` na raiz;
- validar os Critérios de Aceitação 1 a 22, um a um;
- registrar as lições aprendidas e a pendência de verificação humana (herdada do critério 25 da SPEC-0040, ampliada por esta fatia).

---

# Resultado Esperado

Depois desta SPEC, o Atlas para de destruir em silêncio uma escolha de voz do usuário. Numa máquina sem Piper, abrir uma Persona que tem voz Piper salva mostra essa voz no formulário, marcada como salva-porém-indisponível, com um aviso ao lado explicando que ela será preservada — e editar o nome da Persona não apaga mais a voz. Numa máquina com Piper, nada muda em relação à SPEC-0041: a voz do SO legada continua sendo substituída, com o mesmo aviso, porque ali a substituição é a política que o usuário pediu. E, no modo degradado, a voz do SO escolhida numa Persona finalmente é a voz que se ouve — o que a documentação já prometia desde a SPEC-0039 e o renderer nunca cumpriu. Nenhum contrato público muda, nenhum canal IPC novo aparece, e a rede de segurança do ADR-0021(c) continua exatamente onde estava.

---

# Decisões de design

Registradas em formato de veto (Emenda v1.1). Cada uma rastreia ao pedido do usuário, ao PRD, ao ADR-0020, ao ADR-0021, à SPEC-0041 ou à Constituição; o `architecture-reviewer` é quem as ataca no gate `Draft → Ready`.

**D1 — Perfil `completo`.**
Porquê: a fatia vive em `apps/desktop`, que é um **app** e não `packages/X/src` (+ opcionalmente `apps/cli/src`) — condição literal do ramo micro, que ela falha de saída; e não é puramente aditiva: muda o que a GUI grava no arquivo de Personas (deixa de apagar) e muda qual voz do SO soa no modo degradado, comportamento visível que precisa do gate cheio. Mesma classificação e mesmo motivo da D1 das SPECs 0040 e 0041; na dúvida, `completo` é o default seguro.
Alternativa descartada: `micro`, alegando "é conserto de resíduo, dois arquivos, sem contrato novo, sem ADR" — perdeu porque tamanho de diff não é critério do ramo micro, `apps/desktop` não é o package do enunciado, e porque esta SPEC precisa reconciliar-se explicitamente com uma decisão de produto recentíssima (a política Piper-only da SPEC-0041), exatamente o julgamento que o gate completo existe para revisar.

**D2 — A `voiceURI` não ofertável é preservada por uma `<option>` retida no próprio `<select>`, não por estado paralelo "lembrado" no submit.**
Porquê: o problema real não é só a escrita destrutiva, é a **ambiguidade**: hoje a queda em "Nenhuma (voz padrão)" (D12 da SPEC-0041) é indistinguível de o usuário ter escolhido "Nenhuma", então nenhuma heurística no submit consegue separar "preservar" de "o usuário quis limpar". Colocar o valor retido dentro do `<select>`, selecionado e rotulado, faz o controle **dizer a verdade**: o que está selecionado é o que será salvo, sempre (Artigo 7), e `readPersonaFormInput` fica intocado — a preservação cai de graça da mecânica que já existe.
Alternativa descartada: guardar a `voiceURI` original em variável e reinjetá-la no submit quando o `<select>` estiver em "Nenhuma" — perdeu por tornar impossível **limpar** a voz de uma Persona nesse estado (escolher "Nenhuma" não teria efeito), e por criar divergência entre o que o formulário mostra e o que ele grava, que é o defeito que esta SPEC existe para eliminar. Também descartado bloquear o submit enquanto houver voz não ofertável ("resolva a voz antes de salvar") — perdeu por impedir uma edição de nome legítima por causa de uma condição de ambiente que não é culpa do usuário.

**D3 — A distinção entre preservar e substituir é "política × ambiente", codificada como composição sobre `piperOnlyPreference` — não como "voz Piper × voz do SO".**
Porquê: precisa haver uma regra, e ela precisa ser a mesma regra que já governa a fala, sob pena de existirem duas políticas divergentes. `piperOnlyPreference` já responde exatamente "esta preferência ainda é honrada?"; quando ela devolve `undefined`, a app **deliberadamente** parou de honrar aquele valor (caso D6 da SPEC-0041, anunciado e desejado) e substituir no submit é coerente; quando devolve o valor, a app ainda o honraria e só não pode oferecê-lo agora — apagar seria acidente. Bônus: se a política mudar, a classificação acompanha sem edição.
Alternativa descartada: regra por origem ("`piper:<id>` sempre preservado, voz do SO nunca") — perdeu porque erra nos dois extremos: preservaria um `piper:<id>` que a política já descartou num cenário futuro, e apagaria silenciosamente uma voz do SO **desinstalada** no modo degradado, que é perda de dado idêntica à que a SPEC corrige. Também descartado preservar **tudo**, inclusive o caso `dropped` — perdeu por contrariar frontalmente a D6 da SPEC-0041 (o usuário pediu que a voz do SO deixasse de ser escolhível e aceitou explicitamente a substituição no save); reverter isso sem pedido seria decisão de produto que não é minha.

**D4 — A classificação vira uma função pura nova em `speech-output.ts` (`resolvePersistedVoiceSelection`), com quatro desfechos nomeados, em vez de `if`s no renderer.**
Porquê: é o único jeito de a regra ficar **testada** — o `renderer.js` não tem cobertura automatizada (sem bundler, ADR-0019), e a fatia inteira depende de acertar a fronteira `dropped`/`retained`. Quatro desfechos nomeados e exaustivos também fazem o renderer virar um `switch` legível, em vez de três condições booleanas encadeadas com nomes negativos.
Alternativa descartada: dois booleanos (`shouldRetainVoice` / `isDroppedByPolicy`) — perdeu por admitir combinações impossíveis (ambos `true`) e por exigir que o chamador reconstruísse a exaustividade a cada uso. Também descartado deixar a regra só no renderer, já que "só a GUI precisa dela" — perdeu por deixar sem teste justamente a lógica cuja falha causa perda de dado.

**D5 — O aviso reusa o `<span id="persona-voice-legacy">` existente, com dois textos mutuamente exclusivos; `index.html` fica sem diff.**
Porquê: os dois avisos ocupam a mesma posição, respondem à mesma pergunta do usuário ("por que essa voz não está aí?") e nunca podem coexistir (os desfechos são exclusivos por D4). Um segundo `<span>` seria um elemento a mais para manter sincronizado, com risco de os dois aparecerem juntos.
Alternativa descartada: um `<span>` novo dedicado ao aviso de preservação — perdeu por duplicar superfície sem ganho e por abrir a possibilidade de estado incoerente; o nome do id ficar historicamente ligado a "legacy" é custo aceito (o comentário no código explica os dois usos).

**D6 — O provider de preferência injetado no glue é o **mesmo** `piperOnlyPreference(...)` que `currentVoiceBackend` já usa, sem filtro adicional para `piper:<id>`.**
Porquê: um `piper:<id>` nunca casa com o `voiceURI` de uma voz do SO, então a camada de preferência do glue o ignora e cai na 1ª voz local — exatamente o comportamento desejado no fallback do ADR-0021(c). Acrescentar um filtro explícito seria uma condição a mais no arquivo mais frágil do app para produzir o mesmo resultado, e criaria um segundo lugar onde a política de superfície vive.
Alternativa descartada: passar `activePersonaVoiceURI` cru ao glue — perdeu porque, em modo Piper-only, uma voz do SO persistida voltaria a ser honrada no caminho de fallback, reabrindo pela porta dos fundos justamente a precedência que a SPEC-0041 reverteu. Também descartado fazer `speakText` passar a `voiceURI` já resolvida por `resolveVoiceBackend` ao glue — perdeu por contrariar a D16 da SPEC-0040 (`createSpeechOutput` é o resolvedor autoritativo da voz do SO) e por afastar ainda mais o glue do módulo puro, que é a deriva que esta SPEC veio fechar.

**D7 — "Testar voz" passa a derivar do **valor selecionado**, não só do conjunto de opções oferecidas.**
Porquê: com a opção retida existindo, o critério antigo (há alguma voz oferecida?) deixaria o botão habilitado sobre uma seleção que comprovadamente não soa — o estado "ativo-porém-mudo" que o achado A2 da SPEC-0035 proíbe e que a SPEC-0041 reafirmou nas Restrições. Derivar da seleção é estritamente mais preciso e cabe numa expressão só.
Alternativa descartada: manter a regra atual e apenas ignorar o clique quando a opção retida estiver selecionada — perdeu por ser exatamente o anti-padrão proibido (botão habilitado, clique silencioso). Também descartado desabilitar a própria `<option>` retida — perdeu porque uma `<option disabled>` não pode ser a selecionada, o que destruiria a preservação de D2.

**D8 — Nenhum ADR novo, nenhuma nota no ADR-0021, e apenas uma frase no ADR-0020.**
Porquê: o item (2) **restaura** o ADR-0020(b) onde o código o descumpria — o ADR-0020 merece registro de que sua hierarquia agora vale também no renderer, porque a SPEC-0041 havia declarado ali a deriva. O item (1) é aplicação direta dos Artigos 7 e 8 a um caso que nenhum ADR decidiu, e não altera nada do que o ADR-0021 decidiu (a política Piper-only e o fallback (c) saem intactos), então tocar o ADR-0021 só criaria ruído em documento `Accepted`.
Alternativa descartada: abrir um ADR sobre "ciclo de vida de preferências persistidas que o ambiente não pode honrar" — perdeu porque não há decisão arquitetural inédita aqui (nenhum módulo novo, nenhuma responsabilidade movida, nenhuma dependência nova) e porque a Emenda v1.1 reserva ADR novo para escalação humana: inventar um seria parar o pipeline sem necessidade.

**D9 — Prioridade `Medium`.**
Porquê: há perda real de dado do usuário, o que puxa para cima, mas o cenário exige uma máquina em modo degradado **e** uma edição de Persona com voz Piper salva; nada está bloqueado, nenhum requisito do PRD está inutilizável e a capacidade de voz segue funcionando. Mesma faixa das SPECs 0036/0037/0038/0039/0041, que também refinaram capacidade existente.
Alternativa descartada: `High`, pelo argumento "perda silenciosa de dado é sempre alta" — perdeu por comparação com o que o projeto de fato tratou como `High` (SPEC-0040, que destravava a usabilidade real do requisito de voz): aqui o dado perdido é uma preferência reconstituível em dois cliques, num caminho estreito. Também descartado `Low` — perdeu porque violação silenciosa dos Artigos 7 e 8 não é cosmética.

**D10 — As duas correções vão na mesma SPEC.**
Porquê: são os dois resíduos que o usuário escolheu como uma fatia só, tocam os mesmos dois arquivos, compartilham o mesmo ponto de política (`piperOnlyPreference`) e a mesma superfície de teste (`tests/speech-output.test.ts`); separá-las pagaria duas vezes o custo de gate, implementação e fecho por um diff que cabe numa sessão.
Alternativa descartada: duas SPECs (uma por resíduo) — perdeu por custo de processo desproporcional e por criar uma janela em que o glue já honra a preferência mas o formulário ainda apaga a `voiceURI` que ele passou a honrar, estado incoerente que ninguém pediu.
