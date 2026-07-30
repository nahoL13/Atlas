# SPEC-0041 — Desktop: superfície de voz Piper-only (vozes do SO deixam de ser escolhíveis) quando o Piper está disponível, com o fallback interno do ADR-0021(c) intacto

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0041

---

**Título**

Desktop: quando o Piper estiver **disponível** (arquivo do binário presente em disco + ao menos um modelo instalado, conforme `PiperTts.isAvailable()`), a **superfície de escolha e de uso** de voz passa a ser exclusivamente Piper — as vozes nativas do SO deixam de aparecer no `<select>` do formulário de Persona e uma preferência de voz do SO já persistida deixa de ser honrada —, sem remover a Web Speech API, que segue como **rede de segurança interna invisível** (ADR-0021(c))

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

Continuação direta da linha aberta pelas SPECs [0035](SPEC-0035-desktop-voice-output-tts.md) / [0036](SPEC-0036-desktop-tts-local-voice-only.md) / [0039](SPEC-0039-desktop-persona-authoring.md) / [0040](SPEC-0040-desktop-piper-neural-tts.md). Não é item novo do Roadmap: a linha 2.3/TTS permanece aberta (o critério de conclusão da Fase 2 pede "voz funcional nos dois sentidos", e a entrada por voz segue fora desta fatia).

---

# Objetivo

Ao final desta SPEC, numa máquina onde o Piper está **disponível** — o **arquivo** do binário presente em disco **e** catálogo de modelos não vazio, exatamente o que `PiperTts.isAvailable()` verifica (`fs.exists(binary)` + catálogo não vazio; a checagem **não** executa, não sonda e não valida o binário), não apenas modelos em disco —, o `@atlas/desktop` só **oferece** e só **usa** vozes Piper:

- o `<select>` de voz do formulário de Persona (SPEC-0039/0040) lista **apenas** vozes Piper e a opção "Nenhuma (voz padrão)" — nenhuma voz nativa do SO aparece como escolha do usuário;
- uma `Persona.voiceURI` já persistida apontando para uma voz do SO **deixa de ser honrada** enquanto o Piper estiver disponível: a fala usa o modelo Piper default (mesma resolução da SPEC-0040/D9), e o formulário **avisa explicitamente** que aquela Persona tem uma voz do SO salva e que salvar a substituirá;
- o botão "🔊 Ouvir" do chat e o botão "Testar voz" do formulário **não ganham código próprio novo**: herdam a política pelo roteamento já centralizado (`currentVoiceBackend`/`speakText`) e pelo conteúdo do `<select>`;
- a Web Speech API das SPECs 0035/0036 **continua inteira e não é removida**: onde `isAvailable()` é falso (sem modelos, ou com modelos em disco mas sem o arquivo do binário), a app volta ao **modo degradado** — o `<select>` lista novamente as vozes locais do SO, a fala sai por elas, e nenhuma voz Piper é oferecida (nunca um controle habilitado que não pode soar). No caminho Piper, qualquer falha real de síntese continua caindo na voz local do SO — rede de segurança **invisível**, nunca uma opção visível.

O limite dessa checagem é conhecido e está declarado nas Observações: um binário **presente mas inexecutável** (arquitetura errada, sem permissão de execução, dylib faltando, spawn falhando, timeout) satisfaz `isAvailable()` e leva a app ao modo Piper-only. Esta SPEC **não** afirma detectar esse caso — decisão explícita do usuário de não adicionar verificação ativa/sonda (D3, D11).

O modo degradado **não é** uma reprodução literal do comportamento pré-SPEC-0040 em todos os detalhes: ele é o comportamento **realmente existente hoje** no renderer para o caminho `'os'` (1ª voz local determinística), que já divergia da camada de preferência de `speech-output.ts` antes desta SPEC — deriva pré-existente registrada como achado nas Observações, não corrigida aqui.

A garantia de resiliência do [ADR-0021(c)](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) e a cadeia de fallback da SPEC-0040/D8 permanecem **literalmente intactas** como mecanismo; só a **superfície de escolha e a precedência da preferência** mudam.

---

# Motivação

O PRD estabelece, em Requisitos Funcionais / Comunicação (l. 57), **"O sistema deve permitir interação por voz"**, e em Escopo do MVP (l. 217), "suporte básico à voz". A SPEC-0040 trocou o motor de voz por um motor neural local (Piper) exatamente porque a qualidade percebida das vozes do SO — motivo registrado no ADR-0021 — desestimulava o uso da voz, esvaziando na prática esse requisito.

Com o Piper validado localmente pelo usuário e comparado às vozes nativas do macOS, o pedido explícito é **"desativar as vozes nativas do Mac e usar apenas a do Piper"**. Hoje, duas superfícies contrariam isso mesmo com o Piper instalado:

1. o `<select>` de voz do formulário de Persona lista **as duas origens** (SPEC-0040, item 5 do Escopo), então uma voz robótica do SO continua sendo uma escolha oferecida;
2. a cadeia de fallback da SPEC-0040/D8 dá precedência máxima à `Persona.voiceURI` persistida, **inclusive quando ela é uma voz do SO** — uma Persona criada na SPEC-0039 (antes de o Piper existir) segue falando com voz do SO indefinidamente.

Esta SPEC atende o pedido como **política de superfície**, não como remoção de resiliência. A distinção é deliberada e está registrada em D2/D5: remover a Web Speech API seria descartar uma decisão `Accepted` (ADR-0021(c)) e exigiria ADR novo — escalação obrigatória pela Emenda v1.1, não uma decisão desta SPEC.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Comunicação (l. 57: interação por voz); Escopo do MVP (l. 217: suporte básico à voz)
- [ADR-0021 — Piper como motor de TTS local](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — Decisão (c) (fallback fail-closed, nunca removido; "Piper vira a **primeira** camada de preferência") e (d) (`piper:<id>`); Decisões de produto 2 e 3
- [ADR-0020 — Persona persistível com voz vinculada ao TTS](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) — `Persona.voiceURI?` e a hierarquia de fallback de voz (b)
- [ADR-0019 — Stack do desktop (Electron)](../../06-adr/ADR-0019-desktop-electron-stack.md) — renderer sem bundler, `contextIsolation: true`
- [SPEC-0040](SPEC-0040-desktop-piper-neural-tts.md) — **base direta**: D7 (`piper:<id>` + helpers puros), D8 (cadeia de fallback), D9 (modelo default), D16 (`createSpeechOutput` autoritativo no caminho `'os'`), D17 (dois gatilhos de reavaliação)
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) — formulário de Persona e `<select>` de voz; `preferredVoiceURI` amostrado a cada `speak`
- [SPEC-0035](SPEC-0035-desktop-voice-output-tts.md) / [SPEC-0036](SPEC-0036-desktop-tts-local-voice-only.md) — TTS do SO, fail-closed, duplicação deliberada renderer↔main; **achado A2 da SPEC-0035** ("nunca ativo-porém-mudo")
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Persona Service ("deve controlar ... voz"); Output Gateway ("pode apresentar ... voz")
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 2 e 9 (uma única Persona, especialização invisível), 4 (responsabilidade única), 7 (transparência obrigatória), 8 (segurança/desfecho seguro prevalece), 11 (autoridade da memória sobre estado persistente)
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.3
- [`apps/desktop/CLAUDE.md`](../../../apps/desktop/CLAUDE.md) — fronteira main/renderer, padrão de duplicação deliberada, ausência de WindowServer no ambiente de automação

---

# Escopo

1. **`apps/desktop/src/speech-output.ts` (estender, sem alterar nada existente):** dois helpers puros novos e exportados, que fixam a política em código testável —
   - `isPiperOnlyMode({ piperAvailable, piperVoiceURIs }): boolean` — `true` **sse** `piperAvailable === true` **e** houver ao menos uma voz Piper no catálogo (a **única** condição que governa toda a política desta SPEC, D3);
   - `piperOnlyPreference({ preferredVoiceURI, piperAvailable, piperVoiceURIs }): string | undefined` — em modo Piper-only, devolve `preferredVoiceURI` apenas quando ela é um `piper:<id>` (`isPiperVoiceURI`), e `undefined` caso contrário; **fora** do modo Piper-only, devolve `preferredVoiceURI` **inalterada** (comportamento pré-SPEC-0041 preservado no caminho degradado);
   - `resolveVoiceBackend`, `createSpeechOutput`, `isPiperVoiceURI`, `piperModelIdOf` e `PIPER_VOICE_PREFIX` ficam **inalterados** (nenhuma assinatura, nenhum comportamento) — a política nova é uma camada **antes** de `resolveVoiceBackend`, não uma edição dela (D4).
2. **`apps/desktop/src/main.ts` + `apps/desktop/src/preload.cjs` (uma linha cada, D11):** um canal IPC novo `'atlas:tts:available'` → `piperTts.isAvailable()`, exposto como `window.atlas.tts.available()`. `piper-tts.ts` **não é alterado** — `isAvailable()` já existe lá (verifica a **existência do arquivo** do binário **e** catálogo não vazio; não executa nem sonda o binário) e nunca havia sido exposto ao renderer.
3. **`apps/desktop/src/renderer/renderer.js`:**
   - `loadPiperVoices()` passa a buscar, junto do catálogo (`window.atlas.tts.voices()`), a disponibilidade (`window.atlas.tts.available()`), guardando-a em `piperAvailable` (valor inicial `false` — antes da resposta do IPC, a app está em modo degradado, o lado seguro). Rejeição/ausência do canal ⇒ `false`. Os **dois** gatilhos de reavaliação de D17 seguem intactos;
   - uma única expressão derivada (`offeredPiperVoices` = catálogo Piper quando `isPiperOnlyMode(...)`, `[]` caso contrário) alimenta **tanto** `currentVoiceBackend` **quanto** `populatePersonaVoiceSelect` — um único ponto de decisão, nenhum estado híbrido (D3);
   - `currentVoiceBackend()` passa a alimentar `resolveVoiceBackend` com `piperOnlyPreference({ preferredVoiceURI: activePersonaVoiceURI, piperAvailable, piperVoiceURIs })` em vez de `activePersonaVoiceURI` cru, e com `offeredPiperVoices` no lugar do catálogo cru — réplica pura dos helpers novos, com comentário apontando o teste de referência (mesma duplicação deliberada já documentada nas SPECs 0035/0036/0039/0040, **6ª ocorrência**);
   - `populatePersonaVoiceSelect()` passa a listar: em modo Piper-only, **só** "Nenhuma (voz padrão)" + as vozes Piper; em modo degradado, "Nenhuma (voz padrão)" + as vozes locais do SO e **nenhuma** voz Piper (modelos em disco sem o arquivo do binário não são oferecidos — nunca um controle habilitado que não pode soar, achado A2 da SPEC-0035). O estado do botão "Testar voz" passa a ser derivado das opções **efetivamente oferecidas**, não de `piperVoices.length`. Os rótulos `(Piper)`/`(SO)` e a preservação da opção selecionada (D17 da SPEC-0040) ficam como estão;
   - **`<select>` sem opção correspondente (D12):** `openPersonaForm` passa a aplicar a `voiceURI` persistida **somente** se existir uma `<option>` com esse valor; caso contrário cai explicitamente na opção vazia "Nenhuma (voz padrão)" — nunca `selectedIndex === -1` (nenhuma opção destacada);
   - **aviso de voz legada (D6):** ao abrir o formulário para editar uma Persona cuja `voiceURI` persistida **não** é `piper:<id>` e o modo é Piper-only, o formulário escreve um aviso visível (`#persona-voice-legacy`) declarando que aquela Persona tem uma voz do sistema salva, que a app já está falando pela voz Piper default, e que salvar o formulário substituirá o valor persistido. O aviso é limpo em qualquer outro caso;
   - nenhuma alteração no `speakText`, no `playPiperAudio`, no handler de "Testar voz", no `refreshSpeakButton`, nos dois gatilhos de D17 ou no fallback `audio === undefined ⇒ speechOutput.speak(text)` — todos herdam a política pelos pontos acima (D7).
4. **`apps/desktop/src/renderer/index.html`:** rótulo do campo `#persona-voice-uri` deixa de ser "Voz do sistema:" e passa a "Voz:" (o campo já não é mais "do sistema"), e um `<span id="persona-voice-legacy"></span>` novo abaixo dele para o aviso de D6. Nenhuma outra mudança (CSP inalterada).
5. **Testes:** extensão de `apps/desktop/tests/speech-output.test.ts` cobrindo os dois helpers novos e a composição `piperOnlyPreference` → `resolveVoiceBackend` caso a caso — incluindo explicitamente a combinação "catálogo de modelos não vazio, `piperAvailable === false`" (booleano injetado no fake) —, sem Electron e sem navegador. Nenhum teste existente alterado ou enfraquecido.
6. **Documentação da própria SPEC:** nota de atualização no ADR-0021 (seção Observações) registrando (i) que a **superfície de escolha** passou a ser Piper-only por decisão de produto desta SPEC, (ii) que a Decisão (c) — fallback fail-closed, nunca removido — **permanece inalterada e em vigor**, agora como rede de segurança invisível, e (iii) que a **precedência** do [ADR-0020(b)](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) ("voz da Persona presente e existente ⇒ usa-a") fica **superseded na presença de Piper disponível**, ancorado no próprio ADR-0021(c) ("Piper vira a **primeira** camada de preferência ... ganha o Piper como camada anterior a ambas"). Mais uma nota-ponteiro de uma frase na seção Observações do **ADR-0020**, remetendo a ADR-0021(c)/esta SPEC, para que quem leia o ADR-0020 isolado não encontre código divergente do texto. O ADR-0020 hoje **não tem** seção "Observações" (termina em "Alternativas Consideradas"): criar essa seção é aceitável e faz parte desta SPEC. Nenhuma linha da Decisão de nenhum dos dois ADRs é editada.

---

# Fora do Escopo

- **Remover a Web Speech API, o `speech-output.ts` do SO ou qualquer degrau da cadeia D8** — isso descartaria o ADR-0021(c) (`Accepted`) e exige **ADR novo + escalação humana** (Emenda v1.1). Análise explícita em D2/D5.
- **Verificação ativa de que o binário do Piper realmente executa** (spawn de sonda, health-check, síntese de teste, checagem de permissão/arquitetura) — **decisão explícita do usuário**: o limite de `isAvailable()` é declarado e documentado (Observações), não corrigido aqui. Uma sonda teria efeito colateral real (spawn, arquivo temporário, latência), o que D11 já havia descartado.
- **Alterar `resolveVoiceBackend` ou `createSpeechOutput`** (assinatura ou comportamento) — a não-regressão da SPEC-0036/0039/0040 é preservada por construção (D4).
- **Corrigir a deriva pré-existente do glue do renderer** (`createSpeechOutputGlue({ synth })` não recebe `preferredVoiceURI`, portanto o caminho `'os'` do renderer ignora a camada de preferência que `speech-output.ts` implementa) — deriva anterior a esta SPEC, registrada como achado nas Observações e candidata a fatia futura.
- **Alterar `apps/desktop/src/piper-tts.ts`** — `isAvailable()` já existe e é reusado **como está**; nenhuma lógica de disponibilidade nova, nenhum cache, nenhum health-check próprio.
- **Migrar em disco as `Persona.voiceURI` de SO já persistidas** (rescrever o arquivo de Personas em background) — nada é gravado sem gesto explícito do usuário (D6, Artigo 11).
- **Qualquer alteração em `packages/*`, `@atlas/contracts`, `apps/cli` ou `apps/desktop/src/core-bridge.ts`** — nenhuma superfície de Core nova. Em `main.ts`/`preload.cjs`, **só** a exposição do canal `'atlas:tts:available'` (D11); nenhum outro canal é adicionado, removido ou alterado.
- **Um toggle/configuração de usuário ("preferir só Piper" ligável/desligável)**, em flag, env ou arquivo — política fixa, sem estado persistente novo (D10).
- **Filtro por idioma, ordenação nova, agrupamento (`<optgroup>`) ou qualquer redesenho do `<select>`** além do que a política exige.
- **Provisionamento/instalação dos assets do Piper, empacotamento e o script de download** — seguem fora de escopo desde a SPEC-0040 (D10 lá).
- **Entrada por voz (STT) / wake word**, fala automática, prosódia/velocidade/pitch, streaming incremental de playback, modelos multi-locutor e equivalente de CLI para voz — todos já fora de escopo desde as SPECs 0035/0040.
- **Fechar a verificação humana pendente do critério 25 da SPEC-0040** — esta SPEC não a resolve nem a substitui; apenas acrescenta cenários à mesma pendência (ver Observações).

---

# Pré-requisitos

- [SPEC-0035](SPEC-0035-desktop-voice-output-tts.md) — `Done`
- [SPEC-0036](SPEC-0036-desktop-tts-local-voice-only.md) — `Done`
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) — `Done`
- [SPEC-0040](SPEC-0040-desktop-piper-neural-tts.md) — `Done`
- [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) — `Accepted`
- [ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — `Accepted`

---

# Critérios de Aceitação

Todos os critérios são verificáveis **mecanicamente** (suíte automatizada ou inspeção do diff). Onde `piperAvailable` aparece, ele é um **booleano injetado** nos testes (em produção vem só de `fs.exists(binary)` + catálogo não vazio): os critérios cobrem as combinações de entrada, **não** a detecção de nenhuma causa física de indisponibilidade. A verificação humana em ambiente gráfico real segue registrada como pendência herdada (critério 25 da SPEC-0040), não como critério desta SPEC.

Helpers puros (`speech-output.ts`, cobertos em `tests/speech-output.test.ts`):

1. `isPiperOnlyMode` devolve `true` **somente** com `piperAvailable === true` **e** catálogo não vazio; devolve `false` nas outras três combinações — em especial **`piperAvailable === false` com catálogo não vazio** (modelos em disco enquanto `isAvailable()` responde `false`, isto é, arquivo do binário ausente).
2. Em modo Piper-only, `piperOnlyPreference` devolve a `preferredVoiceURI` quando ela começa com `piper:` e `undefined` quando ela é qualquer outro valor (voz do SO) — inclusive quando é uma string vazia ou `undefined`.
3. **Fora** do modo Piper-only (catálogo vazio **ou** `piperAvailable === false`), `piperOnlyPreference` devolve a `preferredVoiceURI` **exatamente como recebida**, inclusive quando é uma voz do SO.
4. `piperOnlyPreference` **nunca** inventa uma `voiceURI`: só devolve o valor recebido ou `undefined`.
5. Composição, caso a caso: `resolveVoiceBackend(piperOnlyPreference(...))` devolve — (a) `piper` com a voz preferida, quando a preferência é um `piper:<id>` do catálogo e `piperAvailable === true`; (b) `piper` com o default Piper, quando a preferência é uma voz do SO e `piperAvailable === true` (é a mudança central desta SPEC); (c) `os` com a voz preferida do SO, quando o catálogo Piper está vazio e essa voz local existe; (d) `os` com a 1ª voz local, quando não há modo Piper-only nem preferência válida; (e) `none`, quando não há voz alguma; (f) **`os`, com catálogo Piper não vazio e `piperAvailable === false`** (booleano injetado no fake) e havendo voz local — a preferência é devolvida inalterada e o catálogo oferecido é vazio (combinação do achado A1).
6. `resolveVoiceBackend`, `createSpeechOutput`, `isPiperVoiceURI`, `piperModelIdOf` e `PIPER_VOICE_PREFIX` continuam com a **mesma** assinatura e o **mesmo** comportamento: os testes das SPECs 0035/0036/0039/0040 passam **sem uma linha alterada** (arquivo comparável por diff: só adições).

Superfície do renderer (verificável por inspeção mecânica do diff):

7. `currentVoiceBackend()` alimenta `resolveVoiceBackend` com o resultado de `piperOnlyPreference` (réplica local) e com o catálogo derivado (`offeredPiperVoices`), nunca mais com `activePersonaVoiceURI` cru nem com `piperVoices` cru; o comentário de duplicação deliberada aponta o teste de referência (`tests/speech-output.test.ts`) — 6ª ocorrência do padrão já documentado.
8. `populatePersonaVoiceSelect()` não acrescenta **nenhuma** `<option>` de voz do SO em modo Piper-only, e não acrescenta **nenhuma** `<option>` de voz Piper em modo degradado (inclusive com modelos em disco e `piperAvailable === false`); a opção "Nenhuma (voz padrão)" existe nos dois modos, e a preservação da opção selecionada (D17 da SPEC-0040) e a reavaliação nos **dois** gatilhos (`voiceschanged` e resposta do IPC de TTS) permanecem intactas.
9. O estado do botão "Testar voz" é derivado das opções de voz **efetivamente oferecidas** (não de `piperVoices.length`): com modelos Piper em disco e `piperAvailable === false`, o botão fica habilitado apenas se houver voz local do SO oferecida — nunca habilitado sobre um catálogo Piper que `isAvailable()` já declarou indisponível. O teste explícito continua sem fallback de voz (comportamento herdado da SPEC-0040, preservado).
10. `speakText`, `playPiperAudio`, `refreshSpeakButton` e o fallback `audio === undefined ⇒ speechOutput.speak(text)` **não são alterados** — nenhuma linha de diff neles (o botão "🔊 Ouvir" herda a política inteira por 7 e 8).
11. `piperAvailable` começa `false`, é preenchido pela resposta de `window.atlas.tts.available()` dentro de `loadPiperVoices` (mesmo `finally` que já reavalia botões e `<select>`), e volta a `false` em qualquer rejeição/ausência do canal — degradação para o lado seguro, nunca modo Piper-only presumido.
12. Editar uma Persona com `voiceURI` de SO persistida, em modo Piper-only, escreve o aviso em `#persona-voice-legacy` declarando as três coisas de D6 (existe uma voz do SO salva; a fala usa a voz Piper default; salvar substitui o valor); em qualquer outro caso (`voiceURI` Piper, ausente, ou modo degradado) o aviso fica vazio. Nada é gravado no disco pelo simples ato de abrir o formulário.
13. Abrir o formulário de uma Persona cuja `voiceURI` persistida **não** corresponde a nenhuma `<option>` do `<select>` (caso central: voz do SO em modo Piper-only) deixa o `<select>` na opção vazia "Nenhuma (voz padrão)" — `personaVoiceSelect.value === ''` e `selectedIndex !== -1`; nunca um `<select>` sem nenhuma opção destacada.
14. `index.html` rotula o campo como "Voz:" e declara `#persona-voice-legacy`; a CSP permanece **byte a byte** a da SPEC-0040 (`default-src 'self'; script-src 'self'; media-src 'self' blob:`).

Contenção e sanidade:

15. O diff não toca nenhum arquivo em `packages/*`, `apps/cli/*`, `apps/desktop/src/core-bridge.ts` nem `apps/desktop/src/piper-tts.ts`; em `main.ts`/`preload.cjs`, a única mudança é a exposição do canal `'atlas:tts:available'` (nenhum outro canal adicionado, removido ou alterado).
16. As notas documentais existem e não editam nenhuma linha da Decisão: no ADR-0021 (seção Observações), declarando os três pontos do item 6 do Escopo — inclusive, textualmente, que a **precedência** do ADR-0020(b) fica **superseded na presença de Piper disponível**, ancorada no ADR-0021(c); e no ADR-0020, a nota-ponteiro de uma frase remetendo a ADR-0021(c)/SPEC-0041, numa seção "Observações" criada para isso se ela ainda não existir.
17. `pnpm lint`, `pnpm typecheck`, `pnpm format:check` e `pnpm test` passam; a suíte cresce e nenhum teste existente é removido ou enfraquecido.

---

# Arquivos Esperados

```text
apps/desktop/src/speech-output.ts            (estendido: isPiperOnlyMode + piperOnlyPreference)
apps/desktop/src/main.ts                     (1 canal IPC: 'atlas:tts:available')
apps/desktop/src/preload.cjs                 (1 linha: window.atlas.tts.available)
apps/desktop/src/renderer/renderer.js        (piperAvailable + offeredPiperVoices + currentVoiceBackend + populatePersonaVoiceSelect + openPersonaForm + aviso de voz legada)
apps/desktop/src/renderer/index.html         (rótulo "Voz:" + span do aviso)
apps/desktop/tests/speech-output.test.ts     (estendido)
docs/implementation/specs/SPEC-0041-desktop-piper-only-voice-surface.md
docs/06-adr/ADR-0021-piper-tts-local-voice-engine.md   (nota de atualização, sem alterar a Decisão)
docs/06-adr/ADR-0020-persona-persistence-voice-binding.md   (nota-ponteiro em Observações — seção criada se ausente, sem alterar a Decisão)
```

---

# Componentes Impactados

- Output Gateway (`apps/desktop`) — superfície de apresentação/escolha de voz
- Persona Service (`@atlas/persona`) — **só como consumidor**: `Persona.voiceURI?` continua aceitando qualquer string não-vazia; o package **não** é alterado e nada é migrado no storage
- Nenhum outro: Core, Cognitive, Runtime, Tools, Permission Service, Memory, Context e `@atlas/contracts` ficam intactos

---

# Interfaces Necessárias

Um canal IPC novo (`'atlas:tts:available'` → `boolean`, expondo `PiperTts.isAvailable()` já existente) e duas funções puras novas, **locais** a `apps/desktop` (mesma regra das demais superfícies GUI: promoção a `@atlas/contracts` só com 2º consumidor real, via ADR):

```text
isPiperOnlyMode(input: {
  piperAvailable: boolean;
  piperVoiceURIs: readonly string[];
}): boolean

piperOnlyPreference(input: {
  preferredVoiceURI: string | undefined;
  piperAvailable: boolean;
  piperVoiceURIs: readonly string[];
}): string | undefined
```

---

# Fluxo Esperado

```text
load da janela → loadPiperVoices(): window.atlas.tts.voices() + window.atlas.tts.available()
        ↓                              (piperAvailable inicial = false — lado seguro)
isPiperOnlyMode({ piperAvailable, piperVoiceURIs })
        ↓                                             ↓
true (isAvailable() === true)              false (sem modelos OU arquivo do binário ausente)
offeredPiperVoices = catálogo Piper        offeredPiperVoices = []
preferência não-Piper ⇒ undefined          preferência devolvida inalterada
        ↓                                             ↓
        └──────────────► resolveVoiceBackend (INALTERADO, cadeia D8) ◄──────────┘
                                    ↓
              piper (preferida ou default)  │  os (1ª voz local do renderer)  │  none
                                    ↓
                       igual à SPEC-0040 daqui para baixo
                (IPC → PiperTts → WAV → <audio>; undefined ⇒ speechOutput.speak — rede de segurança)

<select> de voz do formulário de Persona:
  modo Piper-only  ⇒ "Nenhuma (voz padrão)" + vozes Piper
  modo degradado   ⇒ "Nenhuma (voz padrão)" + vozes locais do SO (nenhuma voz Piper)
  "Testar voz" habilitado sse houver ao menos uma opção de voz oferecida no modo corrente
  editar Persona com voiceURI sem <option> correspondente ⇒ cai em "Nenhuma", aviso visível, nada gravado
```

---

# Estratégia de Implementação

1. `speech-output.ts`: acrescentar `isPiperOnlyMode` e `piperOnlyPreference` (nada mais é tocado no arquivo), com os testes dos critérios 1-5 e o de não-regressão do critério 6.
2. `main.ts` + `preload.cjs`: expor `piperTts.isAvailable()` no canal `'atlas:tts:available'` / `window.atlas.tts.available()` (uma linha cada, ao lado dos três canais de TTS existentes).
3. `renderer.js`: replicar os dois helpers com comentário de duplicação deliberada; introduzir `piperAvailable` (preenchido em `loadPiperVoices`) e a derivada `offeredPiperVoices`; ligá-los em `currentVoiceBackend` e em `populatePersonaVoiceSelect`.
4. `renderer.js`: derivar o estado de "Testar voz" das opções oferecidas; ajustar `openPersonaForm` para cair em "Nenhuma (voz padrão)" quando não houver `<option>` correspondente.
5. `index.html` + `openPersonaForm`: rótulo, `#persona-voice-legacy` e a escrita/limpeza do aviso de D6.
6. Rodar `lint`/`typecheck`/`format:check`/`test`; conferir por diff que `speakText`/`playPiperAudio`/`refreshSpeakButton`/`core-bridge`/`piper-tts`/`packages` não foram tocados e que só um canal IPC foi acrescentado.
7. Notas documentais: ADR-0021 (Observações, três pontos) e ADR-0020 (Observações, nota-ponteiro — criar a seção se ela não existir).

---

# Estratégia de Testes

Vitest, sem Electron, sem navegador, sem Piper real. Em todos os casos `piperAvailable` é um **booleano injetado**: os testes fixam o comportamento por combinação de entrada e **não** demonstram nenhuma capacidade de detectar por que o Piper estaria indisponível.

- `isPiperOnlyMode`: as quatro combinações de `piperAvailable` × catálogo (vazio/não vazio), com nome explícito para "catálogo não vazio + `piperAvailable === false` ⇒ `false`".
- `piperOnlyPreference`: preferência Piper, preferência do SO, preferência ausente/vazia — nos dois modos, e com `piperAvailable === false` sobre catálogo não vazio.
- Composição com `resolveVoiceBackend`: os seis casos do critério 5, cada um nomeado, incluindo "Persona com voz do SO persistida + `piperAvailable === true` ⇒ `piper` (default)" e "catálogo não vazio + `piperAvailable === false` ⇒ `os`".
- Não-regressão: a suíte existente de `speech-output` (SPECs 0035/0036/0039/0040, incluindo o teste de concordância de D16) roda sem uma linha alterada.

Não testados automaticamente (residual consciente, mesma classe já registrada nas SPECs 0035/0036/0039/0040): a réplica dos helpers no `renderer.js`, o conteúdo do `<select>` por modo, o estado do `<select>` ao abrir o formulário, o aviso de voz legada, o playback real e **qualquer cenário de binário presente mas inexecutável** — verificados por inspeção do diff (critérios 7-14) e pela verificação humana em ambiente gráfico.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação (1 a 17) forem atendidos;
- testes estiverem passando (`pnpm lint`/`typecheck`/`format:check`/`test`);
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz, `apps/desktop/CLAUDE.md`, `docs/05-context/NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é o passo de fecho `doc-sync`, não do `spec-implementer`. O implementador toca apenas a documentação específica desta SPEC (este arquivo e as duas notas nos ADRs).

---

# Restrições

- **A Web Speech API não é removida, desabilitada nem contornada em nenhum degrau interno** — ADR-0021(c) segue em vigor; o que muda é a superfície de escolha e a precedência da preferência.
- **`resolveVoiceBackend` e `createSpeechOutput` não podem ser alterados** (nem assinatura, nem comportamento); `piper-tts.ts` também não.
- **Nenhuma alteração em `packages/*`, `@atlas/contracts`, `apps/cli`, `core-bridge.ts`; um único canal IPC novo** (`'atlas:tts:available'`), nenhum outro.
- **Nenhum estado persistente novo e nenhuma escrita implícita no storage de Personas** (Artigo 11): nada é gravado sem submit explícito do usuário.
- **Nada de fala automática** — o gatilho continua sendo um clique explícito.
- **Nenhuma voz de rede em nenhum caminho** — o filtro `localService === true` da SPEC-0036 permanece intocado no caminho `'os'`.
- **Nenhuma sonda, spawn de teste ou health-check** para inferir se o binário executa — decisão explícita do usuário; o limite fica declarado, não compensado por mecanismo novo.
- **"Nunca ativo-porém-mudo" (achado A2 da SPEC-0035), até onde `isAvailable()` alcança:** nenhum controle de voz fica habilitado sobre um conjunto de vozes que `isAvailable()` já declarou indisponível. Esta SPEC **não** afirma eliminar o estado "ativo-porém-mudo" em todos os casos: com o arquivo do binário presente mas inexecutável (arquitetura errada, sem permissão de execução, dylib faltando, spawn falhando, timeout), `isAvailable()` responde `true`, a app entra em modo Piper-only, o `<select>` só oferece vozes Piper e "Testar voz" fica habilitado e mudo — residual conhecido e aceito, registrado nas Observações. ("Testar voz" não fazer fallback é comportamento **herdado** da SPEC-0040, preservado por D5, não introduzido aqui.)
- **Transparência (Artigo 7):** nenhuma substituição de escolha do usuário sem aviso visível — o aviso de D6 é obrigatório, não opcional.

---

# Observações

- **Limite conhecido de `isAvailable()` (declarado, não corrigido).** `isAvailable()` (`apps/desktop/src/piper-tts.ts`) é `fs.exists(paths.binary) && discoverVoices(...).length > 0`: verifica que o **arquivo** do binário existe e que há ao menos um par `.onnx`/`.onnx.json` — **não** que o binário execute. Arquitetura errada, bit de execução ausente, dylib faltando, spawn falhando ou timeout produzem `isAvailable() === true`. Nessa máquina, a app entra em modo Piper-only e o "Testar voz" fica habilitado e mudo. Adicionar verificação ativa foi **descartado por decisão explícita do usuário** (e já havia sido descartado em D11 pelo efeito colateral: spawn, arquivo temporário, latência). Onde a SPEC diz "disponível", leia sempre "`isAvailable()` respondeu `true`".
- **Efeito colateral desta SPEC no cenário acima (registro explícito, no mesmo padrão de honestidade da deriva do glue).** **Hoje**, com o binário presente mas inexecutável, o usuário ainda tem uma saída: o `<select>` lista as vozes do SO, ele escolhe uma manualmente e o "Testar voz" soa. **Depois** desta SPEC, em modo Piper-only não há nenhuma opção de voz do SO no `<select>`, então nessa máquina específica o "Testar voz" passa a ser **incondicionalmente mudo** — perda de capacidade real, restrita a esse cenário raro. O botão "🔊 Ouvir" do chat **não** é afetado: ele mantém o fallback interno (`audio === undefined ⇒ speechOutput.speak(text)`, D5/ADR-0021(c)) e continua falando pela voz local do SO. A escolha de aceitar esse residual em vez de sondar o binário é a decisão do usuário registrada acima.
- **Achado registrado — deriva pré-existente do glue do renderer (não corrigida aqui).** `speech-output.ts` implementa uma camada de preferência no caminho `'os'` (`createSpeechOutput({ synth, preferredVoiceURI })`, ADR-0020(b)/SPEC-0039), mas o renderer instancia `createSpeechOutputGlue({ synth })` **sem** `preferredVoiceURI`, usando apenas `selectLocalVoiceURI` (1ª voz local). Ou seja: no app real, a `Persona.voiceURI` de SO persistida **já não era** honrada pelo caminho `'os'` do renderer antes desta SPEC. É consequência da duplicação deliberada renderer↔main documentada desde as SPECs 0035/0036/0039/0040 — **anterior a esta fatia e não causada por ela**. Esta SPEC portanto **não afirma** paridade de preferência no modo degradado: o degradado equivale ao comportamento realmente vigente hoje (1ª voz local determinística), não ao contrato do módulo puro. Corrigir o glue é candidato a fatia futura, fora do escopo aqui.
- **A degradação é inerte quanto ao Piper.** Onde `isAvailable()` responde `false`, esta SPEC não altera qual voz do SO soa: o `<select>` volta a listar as vozes locais do SO e a fala é a das SPECs 0035/0036 tal como implementadas no renderer. Uma única condição (`isPiperOnlyMode`, agora também função da resposta de `isAvailable()`) governa as duas superfícies, para não existirem dois estados parcialmente Piper-only.
- **Disponibilidade é amostrada, não monitorada.** `isAvailable()` é consultada nos mesmos momentos em que o catálogo é carregado; o binário ficar indisponível **depois** disso continua coberto pelo fallback interno (`audio === undefined ⇒ speechOutput.speak`) no botão "🔊 Ouvir" — e, no "Testar voz", pelo silêncio deliberado já herdado da SPEC-0040. Um monitoramento contínuo (polling/watch) seria superfície nova sem pedido, deliberadamente fora desta fatia.
- **Verificação humana herdada.** O critério 25 da SPEC-0040 (voz real soando, latência, catálogo chegando após o load, processo único, ausência de `.wav` residual, fallback ao remover o binário) segue **pendente** e não é resolvido aqui. Para esta fatia, acrescentam-se à mesma pendência: o `<select>` sem nenhuma voz do SO na máquina com `isAvailable() === true`; o `<select>` sem nenhuma voz Piper na máquina com modelos mas sem o arquivo do binário, com "Testar voz" coerente; o aviso de voz legada ao editar uma Persona antiga; uma Persona com voz do SO passando a soar em Piper; e — cenário novo desta SPEC — **binário presente porém inexecutável** (por exemplo, removendo o bit de execução do arquivo), confirmando o residual descrito acima: modo Piper-only, "Testar voz" habilitado e mudo, e "🔊 Ouvir" ainda falando pela voz local do SO via fallback interno.
- **Rótulos de origem preservados.** `(Piper)`/`(SO)` continuam nos rótulos das opções, mesmo que cada modo só exiba uma origem — diff menor e transparência mantida.
- **Artigos 2 e 9 preservados**: o usuário continua percebendo uma única Persona com uma voz, não um motor; a escolha de motor segue invisível durante a conversa.

---

# Checklist para IA

Antes de implementar:

- ler a SPEC-0040 inteira (D7, D8, D9, D16, D17) e o ADR-0021 (Decisão (c) — **não** removível);
- ler `apps/desktop/CLAUDE.md` (fronteira main/renderer, duplicação deliberada);
- ler `apps/desktop/src/speech-output.ts`, `isAvailable()` em `apps/desktop/src/piper-tts.ts` e as regiões de voz de `renderer.js` (`loadPiperVoices`, `currentVoiceBackend`, `populatePersonaVoiceSelect`, `openPersonaForm`) antes de escrever qualquer linha.

Durante implementação:

- **não** editar `resolveVoiceBackend`, `createSpeechOutput`, `speakText`, `playPiperAudio`, `refreshSpeakButton` nem `piper-tts.ts`;
- **não** acrescentar sonda/health-check/spawn de teste de disponibilidade — o limite de `isAvailable()` é aceito e documentado (Observações), não corrigido nesta fatia;
- manter a política numa única condição (`isPiperOnlyMode`) e num único catálogo derivado (`offeredPiperVoices`), nunca duplicada como checagens independentes;
- replicar no renderer só o que ele não pode importar, sempre com comentário apontando o teste de referência;
- não escrever, em código ou comentário, que a checagem de disponibilidade detecta binário "quebrado"/"funcional" — ela detecta **presença** do arquivo + catálogo não vazio;
- se a implementação parecer exigir remover ou desviar algum degrau do fallback interno, **parar** — isso é mudança do ADR-0021(c), portanto escalação, não conserto de código.

Após implementação:

- executar testes, lint, typecheck, format:check;
- validar os Critérios de Aceitação 1 a 17, um a um;
- registrar as lições aprendidas e a pendência de verificação humana (herdada do critério 25 da SPEC-0040, ampliada por esta fatia — inclusive o cenário de binário inexecutável).

---

# Resultado Esperado

Na máquina do usuário (com o Piper instalado e efetivamente funcionando), o Atlas só oferece e só usa vozes neurais do Piper: o formulário de Persona não mostra mais nenhuma voz nativa do macOS, "🔊 Ouvir" e "Testar voz" falam sempre em Piper, e até uma Persona criada antes do Piper — com voz do SO salva — passa a soar neural, com um aviso visível explicando que aquele valor salvo será substituído se ela for salva novamente. Numa máquina onde `isAvailable()` responde `false` (sem modelos, ou sem o arquivo do binário), o app volta a oferecer e usar as vozes locais do SO, sem exibir nenhum controle de voz habilitado sobre um catálogo já declarado indisponível — e uma falha real de síntese do Piper continua caindo na voz local do SO em vez de deixar o Atlas mudo. No caso raro de o arquivo do binário existir mas não executar, a app entra em modo Piper-only e o "Testar voz" fica mudo (residual conhecido, registrado nas Observações e na verificação humana); o "🔊 Ouvir" segue falando pelo fallback interno.

---

# Decisões de design

Registradas em formato de veto (Emenda v1.1). Cada uma rastreia ao pedido do usuário, ao PRD, ao ADR-0021, ao ADR-0020, à SPEC-0040 ou à Constituição; o `architecture-reviewer` é quem as ataca no gate `Draft → Ready`.

**D1 — Perfil `completo`.**
Porquê: a fatia vive em `apps/desktop` (não em `packages/X/src` + a CLI que o expõe, condição literal do ramo micro) e **não é puramente aditiva** — altera a precedência efetiva de uma preferência já persistida do usuário e a superfície de escolha, mudança de comportamento visível que precisa do gate cheio; a mesma classificação e o mesmo motivo da D1 da SPEC-0040, e o default seguro manda `completo` na dúvida.
Alternativa descartada: `micro`, alegando "só mexe em dois arquivos de um app, sem contrato novo" — perdeu porque o tamanho do diff não é critério do ramo micro, e porque esta SPEC precisa reconciliar-se explicitamente com duas decisões `Accepted` (ADR-0021(c) e a precedência do ADR-0020(b)), exatamente o tipo de julgamento que o gate completo existe para revisar.

**D2 — O pedido é atendido revertendo a precedência da preferência persistida (D8 da SPEC-0040), como política de superfície — não removendo a Web Speech API.**
Porquê: é preciso dizer sem rodeio o que esta SPEC faz. O resultado observável é **Piper à frente de qualquer preferência de voz do SO**, isto é, a reversão da precedência de escolha explícita do usuário que a **D8 da SPEC-0040** havia decidido — reversão pedida **explicitamente pelo próprio usuário** desta vez ("desativar as vozes nativas do Mac e usar apenas a do Piper"), e coerente com o ADR-0021(c), que já coloca o Piper como "primeira camada de preferência". A diferença em relação à alternativa que a SPEC-0040 rejeitou não é o efeito, é o **Artigo 7**: aqui a substituição da escolha do usuário é **anunciada por aviso visível** (D6) em vez de silenciosa, e é reversível pelo próprio formulário. O que **não** muda é o mecanismo de resiliência: remover o fallback não acrescenta nada ao pedido e destruiria a decisão `Accepted` do ADR-0021(c).
Alternativas descartadas: (i) **remover de fato o fallback interno** (deletar o caminho `'os'`, apagar o glue de Web Speech) — perdeu por duas razões independentes: contraria uma Decisão `Accepted` e a alternativa "Substituir Web Speech API por completo (sem fallback)" **explicitamente rejeitada** no ADR-0021; e seria decisão arquitetural inédita, portanto **escalação obrigatória** (Emenda v1.1), não decisão do `spec-drafter`. Não há base documental para descartar a garantia de resiliência, e por isso ela é preservada por padrão. (ii) **A opção mais simples possível: apenas esconder as vozes do SO do `<select>`, mantendo intacta a precedência persistida do ADR-0020(b)** — perdeu porque deixaria exatamente o pior caso do pedido de pé: a Persona criada na SPEC-0039, com voz de SO já salva, continuaria falando robótica indefinidamente, sem nenhuma superfície que explicasse o porquê (o usuário não veria mais aquela voz na lista, mas continuaria ouvindo-a) — mais confuso que a política inteira, e sem atender o pedido.

**D3 — Uma única condição governa a política inteira: `PiperTts.isAvailable()` por IPC (arquivo do binário presente + ao menos uma voz) — não a mera existência de modelos em disco.**
Porquê: `window.atlas.tts.voices()` lista pares `.onnx`/`.onnx.json` em disco e **não olha o binário de forma alguma**; condicionar a política só a essa lista produziria o estado "modelos presentes, binário ausente do disco" em que o `<select>` esconderia as vozes do SO **e** o "Testar voz" ficaria habilitado sobre um catálogo que não pode soar — silêncio permanente sem aviso, o mesmo defeito que o achado A2 da SPEC-0035 já proibiu. `PiperTts.isAvailable()` já existe, já verifica presença do arquivo do binário **e** catálogo não vazio, e já é testada: expor essa verdade ao renderer **elimina o caso de binário ausente**, que é o caso comum (Piper nunca instalado, ou removido). O que essa checagem **não** cobre é binário presente porém inexecutável: nesse cenário `isAvailable()` responde `true` e o estado "ativo-porém-mudo" **permanece possível** — residual declarado nas Restrições e nas Observações, aceito por decisão explícita do usuário em vez de sondado. Um único ponto de decisão (`isPiperOnlyMode`) e um único catálogo derivado (`offeredPiperVoices`) mantêm o sistema em um de dois estados inteiros e explicáveis.
Alternativa descartada: manter a condição só pela lista de vozes e cobrir a degradação com um aviso visível novo + critério de aceitação próprio — perdeu porque aceitaria o caso comum (binário ausente) como estado normal-mas-avisado: mais UI, mais texto, mais caminho a testar, e ainda assim um controle habilitado que não soa. Também descartado condicionar cada superfície ao seu próprio critério (esconder as vozes do SO sempre, mas só ignorar a preferência quando o default Piper resolver) — perdeu por multiplicar estados possíveis e por deixar a máquina sem Piper com um `<select>` de uma única opção inútil. E descartada a verificação ativa (spawn de sonda/health-check) que fecharia também o caso do binário inexecutável — perdeu pelo efeito colateral já pesado em D11 (spawn, arquivo temporário, latência) e por **decisão explícita do usuário** de declarar o limite em vez de redesenhar o mecanismo.

**D4 — A política entra como camada **antes** de `resolveVoiceBackend` (helpers puros novos), não como edição da cadeia D8 — assumindo que o efeito é o da alternativa que a D8 havia rejeitado.**
Porquê: a escolha aqui é de **mecanismo**, não de efeito. O efeito é declaradamente "Piper à frente da preferência de SO" (ver D2); manter `resolveVoiceBackend` intacta é o que preserva o critério de não-regressão (critério 6), mantém válido o teste de concordância de D16, deixa o modo degradado expressável sem um segundo parâmetro na função, e concentra a mudança numa função de três linhas fácil de reverter se o usuário mudar de ideia.
Alternativa descartada: reescrever `resolveVoiceBackend` para colocar Piper à frente de qualquer preferência **dentro** da própria cadeia — perdeu não por discordar do efeito (que é o mesmo, e é o desejado), mas porque invalidaria testes existentes, embutiria política de produto no mecanismo de roteamento e exigiria um parâmetro extra só para reproduzir o modo degradado.

**D5 — O fallback interno permanece literalmente intocado: `'os'` na cadeia, `audio === undefined ⇒ speechOutput.speak(text)`, filtro `localService === true`.**
Porquê: é a garantia da Decisão (c) do ADR-0021 e do Artigo 8 (o desfecho seguro prevalece) — sem Piper disponível, ficar mudo é pior que falar com a voz do SO, e o usuário nunca pediu para relaxar isso; a rede de segurança fica **invisível** (só ativa quando o Piper falha), que é exatamente o que a interpretação de D2 exige. É também o que preserva o "🔊 Ouvir" falando no cenário residual de binário inexecutável.
Alternativa descartada: manter o fallback só para o botão "🔊 Ouvir" e removê-lo do "Testar voz" (ou vice-versa) — perdeu por criar dois comportamentos de resiliência diferentes na mesma app; nota-se que o "Testar voz" **já** não faz fallback por decisão da SPEC-0040 (testar uma voz específica com outra mascararia o teste), e essa assimetria deliberada é preservada como está, não estendida — a cobertura do caso "arquivo do binário ausente" vem de D3, não de mexer nela.

**D6 — `Persona.voiceURI` de SO já persistida não é migrada em disco; é sinalizada por aviso visível no formulário e substituída só se o usuário salvar.**
Porquê: Artigo 7 (transparência obrigatória) e Artigo 11 (nada de escrita persistente implícita) — a app deixa de honrar aquele valor, então o usuário precisa **saber** disso e ver por que a voz mudou; e a `Persona` é dado dele, não do app, então quem reescreve é o gesto de salvar. É também o que torna a reversão de precedência de D2 compatível com o Artigo 7.
Alternativa descartada: reescrever automaticamente todas as Personas com voz de SO para `voiceURI` ausente (limpeza silenciosa) na primeira abertura da app — perdeu por gravar em disco sem gesto do usuário, destruir informação recuperável (a voz que ele havia escolhido) e ser irreversível caso ele volte a uma máquina sem Piper. Também descartado manter a voz de SO legada como opção "legado" no `<select>` — perdeu por contrariar o pedido explícito (voz do SO deixa de ser escolhível).

**D7 — "🔊 Ouvir" e "Testar voz" não recebem código novo: herdam a política pelo roteamento central e pelo conteúdo do `<select>`.**
Porquê: a SPEC-0040 já centralizou toda decisão de origem em `currentVoiceBackend`/`speakText` e toda oferta de voz em `populatePersonaVoiceSelect` — tocar os botões seria duplicar a política em pontos que já a consomem, e o critério 10 fixa por diff que eles ficam intocados. O estado do "Testar voz" muda de fórmula (opções oferecidas em vez de `piperVoices.length`), mas dentro de `populatePersonaVoiceSelect`, onde ele já é calculado hoje — nenhum handler novo.
Alternativa descartada: filtrar Piper direto no handler de cada botão — perdeu por espalhar a mesma regra em três lugares no arquivo mais frágil do app (renderer sem bundler, sem cobertura automatizada), multiplicando o risco de deriva já documentado nas SPECs 0035/0036/0039/0040.

**D8 — No modo degradado, o `<select>` volta a listar as vozes locais do SO e **não** lista nenhuma voz Piper.**
Porquê: coerência com D3/D5 — se a app vai **falar** pela voz do SO nessa máquina, esconder essas vozes da escolha só removeria controle do usuário sem remover a voz robótica; e oferecer vozes Piper quando `isAvailable()` já respondeu `false` recriaria o estado ativo-porém-mudo que D3 existe para eliminar no caso comum. Preserva integralmente a capacidade entregue pela SPEC-0039 onde o Piper não está disponível.
Alternativa descartada: no degradado, listar as duas origens (como hoje na SPEC-0040) — perdeu porque um `piper:<id>` escolhido nesse estado é uma escolha que não soa no "Testar voz" e que, gravada na Persona, ficaria latente e inexplicável. Também descartado `<select>` com apenas "Nenhuma (voz padrão)" sempre — perdeu por deixar um controle vazio e inútil na máquina sem Piper.

**D9 — Prioridade `Medium`.**
Porquê: é ajuste de superfície sobre uma capacidade que já funciona (nada está quebrado, nenhum requisito do PRD está bloqueado) e atende uma preferência explícita do usuário sobre a fatia recém-entregue — mesma faixa das SPECs 0036/0037/0038/0039, que também refinaram capacidade existente.
Alternativa descartada: `High` (paridade com a SPEC-0040) — perdeu porque a SPEC-0040 destravava a usabilidade real do requisito de voz; aqui o requisito já está usável, e o ganho é de preferência/consistência.

**D10 — Política fixa, sem toggle de configuração e sem estado persistente novo.**
Porquê: teste da Constituição (mais simples, mais sustentável) — um toggle exigiria um slot novo de configuração (ADR-0006) ou persistência própria, mais superfície de UI e mais estados a testar, para um pedido que é "só Piper"; a única variabilidade que o sistema precisa (a resposta de `isAvailable()`) é derivada do ambiente por D3, sem configuração alguma.
Alternativa descartada: checkbox "mostrar também as vozes do sistema" no painel de Persona — perdeu por reintroduzir exatamente a escolha que o usuário pediu para remover, com custo de configuração e de estado (durável ou não, ambas as opções ruins nesta fatia).

**D11 — Um canal IPC novo (`'atlas:tts:available'`), abrindo uma exceção mínima à contenção "nada em `main.ts`/`preload.cjs`".**
Porquê: D3 exige a resposta de `isAvailable()`, e ela só existe no main process (`PiperTts.isAvailable()`, que já a computa e já está testada) — o renderer não pode nem deve inspecionar o disco (`contextIsolation: true`, ADR-0019). A exceção é do menor tamanho possível: duas linhas, um método existente exposto sem lógica nova, `piper-tts.ts` intocado, no molde exato dos três canais `'atlas:tts:*'` já existentes.
Alternativa descartada: inferir disponibilidade no renderer a partir de um `speak` de sonda (sintetizar um texto vazio/curto e observar `undefined`) — perdeu por produzir efeito colateral real (spawn de processo, arquivo temporário, latência) só para responder uma pergunta que o main já responde de graça, e por ser um mecanismo implícito e frágil no arquivo menos coberto por testes. O preço dessa escolha é conhecido e aceito: nenhum caminho desta SPEC detecta binário presente porém inexecutável (ver D3 e Observações).

**D12 — Ao abrir o formulário, uma `voiceURI` persistida sem `<option>` correspondente cai explicitamente em "Nenhuma (voz padrão)".**
Porquê: o código atual faz `personaVoiceSelect.value = detail.voiceURI || ''`, e um valor ausente da lista deixa `selectedIndex === -1` — um `<select>` sem nenhuma opção destacada, estado ambíguo que o usuário não consegue interpretar nem corrigir sem adivinhar (Artigo 7). Cair na opção vazia já prevista é determinístico, visível e coerente com o aviso de D6, que explica ao lado por que aquela voz não está mais ali. Nada é gravado por isso — só o submit grava.
Alternativa descartada: deixar o `<select>` sem seleção e confiar no aviso de D6 para explicar — perdeu por manter um controle em estado indefinido (e por depender do aviso, que só existe no modo Piper-only: qualquer outra `voiceURI` órfã, por exemplo uma voz do SO desinstalada no modo degradado, ficaria sem seleção e sem explicação).
