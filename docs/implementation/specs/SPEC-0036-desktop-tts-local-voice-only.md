# Implementation Specification

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0036

---

**Título**

Desktop: TTS 100% offline garantido — restringir a saída de voz a vozes locais do SO (`localService === true`)

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

`Fase 2 — 2.3 Voz` (`docs/04-engineering/Roadmap.md`, l. 151-157), linha "Saída por voz (TTS)" (l. 156) — **endurecimento** da fatia entregue pela SPEC-0035. Não abre item novo do Roadmap; refina a garantia offline da fatia de TTS já existente. Não toca "Entrada por voz (STT)" (l. 155) nem "Ativação por voz (wake word)" (l. 157).

---

# Objetivo

Ao concluir esta SPEC, a saída de voz (TTS) do `apps/desktop`/`@atlas/desktop` — o botão "🔊 Ouvir" por resposta do chat, entregue pela SPEC-0035 — deverá **usar exclusivamente vozes locais do sistema operacional** (`SpeechSynthesisVoice.localService === true`), com uma voz local **explicitamente vinculada** a cada enunciado, nunca deixando o Chromium/SO escolher uma voz padrão que possa rotear pela rede. O módulo puro `src/speech-output.ts` passa a:

- filtrar as vozes candidatas para apenas as marcadas como locais pelo padrão da Web Speech API;
- selecionar deterministicamente uma voz local e carimbá-la no `UtteranceSpec`, para o renderer vinculá-la ao `SpeechSynthesisUtterance` real;
- considerar a voz **indisponível** (`isAvailable() === false`, botão desabilitado com aviso) quando não houver **nenhuma** voz local — fail-closed em direção à garantia offline, jamais falando por uma voz de rede como fallback.

A garantia deixa de ser apenas "o módulo não faz chamadas de rede" (fronteira do módulo, SPEC-0035) e passa a ser "nenhum enunciado é falado por uma voz não-local" — fechando o vazamento residual que a própria SPEC-0035 registrou honestamente (vozes com `localService === false` sintetizadas por servidor, fora do controle da fatia anterior).

O diff permanece **confinado a `apps/desktop`** (módulo puro `src/speech-output.ts` + seu teste + o glue do renderer `src/renderer/renderer.js`), **sem nova dependência de runtime, sem chamada de rede, sem tocar `@atlas/contracts`, o Core, o main process, `preload.cjs`, `core-bridge.ts` ou canais IPC**.

---

# Motivação

A SPEC-0035 entregou a saída de voz reutilizando a Web Speech API embutida no Chromium (ADR-0019), e registrou honestamente, em duas notas do `architecture-reviewer` (Observações A1 e a delimitação da garantia offline), que **usar `window.speechSynthesis` não garante que toda a pilha de voz do SO seja offline**: vozes de plataforma com `SpeechSynthesisVoice.localService === false` podem ser processadas via rede pela decisão do SO/navegador (ex.: vozes "Google" do Chromium sintetizadas em servidor). O comentário de cabeçalho de `src/speech-output.ts` admite: *"Vozes de plataforma backed por rede, se existirem, estão fora do controle deste módulo."* Além disso, o adapter atual do renderer chama `new SpeechSynthesisUtterance(text)` **sem definir `utterance.voice`**, deixando o Chromium escolher a voz padrão — que pode ser justamente uma voz de rede.

O usuário decidiu explicitamente que a TTS deve ser **100% offline garantido**, com prioridade de **zero dependência de rede acima da qualidade da voz e do peso do bundle**. O padrão da Web Speech API já expõe a distinção necessária: `SpeechSynthesisVoice.localService` é o sinal-padrão que marca uma voz como sintetizada no dispositivo local (`true`) versus por serviço remoto (`false`). Restringir a fatia a `localService === true` e vincular a voz escolhida explicitamente ao enunciado é a forma **mais simples, mais transparente e mais sustentável** (teste da Constituição) de cumprir a exigência do usuário, sem introduzir motor de voz novo (dependência de runtime permanente = ADR novo, território de escalação — ver Decisões de design).

Esta necessidade rastreia ao PRD ("interação por voz", l. 57; "suporte básico à voz", l. 217) e ao Requisito Não Funcional "priorizar segurança" / "minimizar dependências" (l. 173, 183); a garantia offline dura é a expressão de segurança que o usuário exigiu para esta capacidade.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — "interação por voz" (l. 57), "suporte básico à voz" (l. 217), "priorizar segurança" (l. 173), "minimizar dependências desnecessárias" (l. 183).
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.3 Voz (l. 151-157).
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Output Gateway (l. 921-954, "voz" em "pode apresentar"); "Voice Service" como componente futuro previsto (l. 1078).
- [ADR-0019 — Stack Electron para `apps/desktop`](../../06-adr/ADR-0019-desktop-electron-stack.md) — runtime Chromium adotado; Web Speech API já embarcada; renderer em JS plano sem bundler.
- [SPEC-0035](SPEC-0035-desktop-voice-output-tts.md) — fatia de TTS que esta SPEC endurece; a delimitação da garantia offline registrada em suas Observações (A1) é o residual que esta SPEC fecha.
- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) / [SPEC-0033](SPEC-0033-desktop-visual-chat.md) — adapters de GUI e chat visual (superfície onde a fala é acionada).
- [ArchitectureConstitution.md](../../00-project/ArchitectureConstitution.md) — Artigo 13 (nenhuma dependência permanente de framework; tensão já contida a `apps/desktop` pelo ADR-0019); Artigo 2 (usuário percebe uma única Persona).

---

# Escopo

- Editar `apps/desktop/src/speech-output.ts` (módulo puro/injetável, sem import de `electron` nem de globais de navegador — fronteira preservada):
  - Introduzir um tipo estrutural local `VoiceInfo { readonly voiceURI: string; readonly name: string; readonly localService: boolean }` — a projeção mínima de `SpeechSynthesisVoice` de que o módulo precisa para filtrar (satisfeita estruturalmente, nenhum tipo de navegador importado).
  - Alargar `SpeechSynthesisPort.getVoices()` para devolver `readonly VoiceInfo[]` (era `readonly unknown[]`).
  - Estender `UtteranceSpec` para `{ readonly text: string; readonly voiceURI: string }` — o `voiceURI` da voz local escolhida, que o renderer usa para vincular a voz real ao `SpeechSynthesisUtterance`.
  - `createSpeechOutput({ synth })`:
    - Uma função pura interna de seleção que, a partir de `synth.getVoices()`, filtra para apenas `voice.localService === true` e escolhe **deterministicamente** a primeira voz local (ordem de `getVoices()`), devolvendo seu `voiceURI` ou `undefined` se não houver nenhuma voz local.
    - `isAvailable()` devolve `true` **se, e somente se, existir pelo menos uma voz local** (`localService === true`); lista vazia, lista só com vozes de rede, ou `getVoices` lançando ⇒ `false` (fail-safe/fail-closed).
    - `speak(text)`: normaliza (`trim`/colapso de `\s+`); se vazio ⇒ no-op; se **não houver voz local** ⇒ no-op (nunca cai em voz de rede); caso contrário `synth.cancel()` e então `synth.speak({ text: normalizado, voiceURI: <voz local escolhida> })`. Nunca lança (fail-safe).
    - `cancel()` inalterado (delega a `synth.cancel()`, tolerante).
    - **Offline por construção reforçado:** nenhum enunciado é produzido sem um `voiceURI` de voz local vinculado; o módulo continua sem qualquer chamada de rede.
  - Atualizar o comentário de cabeçalho para refletir a garantia endurecida (só vozes `localService === true`), substituindo a ressalva antiga sobre vozes de rede fora de controle.
- Editar `apps/desktop/tests/speech-output.test.ts` para cobrir a garantia nova (ver Estratégia de Testes) — mantendo os casos existentes que continuam válidos, ajustando os fakes de `getVoices` para devolver `VoiceInfo` (com `localService`) e asseverando o `voiceURI` no `UtteranceSpec`.
- Editar `apps/desktop/src/renderer/renderer.js`:
  - No adapter `synth`, `getVoices()` mapeia cada `SpeechSynthesisVoice` real para `{ voiceURI, name, localService }` (projeção plana; guarda de ausência de `window.speechSynthesis` preservada, degradando para `[]`, nunca lança).
  - No `speak(spec)` do adapter, localizar a voz real cujo `voiceURI === spec.voiceURI` **e** `localService === true`; se encontrada, criar o `SpeechSynthesisUtterance(spec.text)`, definir `utterance.voice = <voz local>` e falar; se **não** encontrada (voz sumiu entre a seleção e a fala) ⇒ **não falar** (fail-closed em direção à garantia offline, jamais fallback para voz padrão/de rede).
  - Espelhar no `createSpeechOutputGlue` a mesma lógica de filtro/seleção/no-op-sem-voz-local do módulo puro (a duplicação deliberada renderer↔módulo já documentada na SPEC-0035), com comentário apontando o teste de referência.
  - Manter o tratamento do quirk `voiceschanged` (reavaliação de `isAvailable` e reabilitação dos botões pendentes) já existente.
- Atualizar a documentação específica desta SPEC (este arquivo) e a nota de escopo em `apps/desktop/CLAUDE.md` referente à fatia 2.3 (via `doc-sync` no fecho).

---

# Fora do Escopo

- **Embarcar um motor de TTS dedicado** (Piper, Coqui, biblioteca nativa, voz custom) — introduziria dependência de runtime permanente = ADR novo (espelho do ADR-0019) e possivelmente um módulo Voice Service; ver a Decisão de design 2 e a Escalação E1. Esta fatia usa exclusivamente a Web Speech API embutida do Chromium, restringida a vozes locais.
- **Seleção de voz pelo usuário, preferência de voz/idioma/velocidade persistida, controles de pausa/retomar/velocidade** — a escolha da voz local é automática e determinística (primeira local); configuração de voz pertence a fatias de gerência (item 2.4), não a esta.
- **Fala automática (auto-speak)** — a ação permanece manual e explícita (botão "Ouvir"), como na SPEC-0035.
- **Entrada por voz (STT), wake word** — permanecem fora, condicionados a decisão humana (Escalação E1 da SPEC-0035).
- **Falar a resposta do `ask` de tiro único (SPEC-0032), `status`, traço de `steps`, `learned`** — a fatia cobre só a resposta (`reply`) do chat multi-turno, como a SPEC-0035.
- **Criar módulo Voice Service (`packages/*`)** ou qualquer package novo.
- **Qualquer alteração** em `@atlas/contracts`, `@atlas/core`, `apps/desktop/src/main.ts`, `src/preload.cjs`, `src/core-bridge.ts`, canais IPC, ou qualquer package do Core.
- **Empacotamento/distribuição, E2E de Electron em CI, bundler/framework de UI.**

---

# Pré-requisitos

- [SPEC-0035](SPEC-0035-desktop-voice-output-tts.md) — `Done` (fatia de TTS que esta SPEC endurece; confirmada `Done` no `NEXT_CONTEXT.md` e no cabeçalho do repositório — commit `5e25f00`).
- [SPEC-0033](SPEC-0033-desktop-visual-chat.md) — `Done` (chat visual multi-turno; superfície onde a fala é acionada).

---

# Critérios de Aceitação

- `apps/desktop/src/speech-output.ts` continua **sem importar `electron` nem globais de navegador** (verificável: ausência de `import ... 'electron'` e de referência a `window`/`SpeechSynthesisUtterance` no arquivo) e continua **sem nenhuma chamada de rede** (sem `fetch`/`XMLHttpRequest`/import de rede — verificável por inspeção e pelo teste com `synth` fake sem stub de rede).
- `UtteranceSpec` passa a expor `{ text, voiceURI }`; `SpeechSynthesisPort.getVoices()` devolve `readonly VoiceInfo[]` com `VoiceInfo { voiceURI, name, localService }`.
- **Seleção só-local verificável:** `createSpeechOutput({ synth }).speak(text)`, com texto não-vazio e `getVoices()` contendo ao menos uma voz com `localService === true`, chama `synth.cancel()` e em seguida `synth.speak({ text: normalizado, voiceURI })`, onde `voiceURI` é o de uma voz **local** (verificável por spy asseverando ordem e o `voiceURI` escolhido).
- **Nenhuma fala por voz de rede verificável:** quando `getVoices()` devolve **apenas** vozes com `localService === false` (ou lista vazia), `speak(text)` é **no-op** — `synth.speak` não é chamado (verificável por spy). Nunca há fallback para voz não-local.
- **Disponibilidade só-local verificável:** `isAvailable()` devolve `true` quando há ≥1 voz `localService === true`; `false` quando a lista é vazia, contém **só** vozes `localService === false`, ou `getVoices` lança (verificável por spy).
- `speak('')` e `speak('   ')` continuam no-op; `speak`/`cancel` não propagam quando o `synth` lança (fail-safe preservado, verificável).
- `cancel()` delega a `synth.cancel()`.
- O renderer: no adapter, `speak(spec)` vincula `utterance.voice` à voz real local cujo `voiceURI` casa com `spec.voiceURI` e **não fala** se essa voz não for encontrada (fail-closed); `getVoices()` projeta as vozes reais para `{ voiceURI, name, localService }`. Com `window.speechSynthesis` ausente ou sem vozes locais, a janela **não quebra nem lança exceção não tratada** e o botão "Ouvir" aparece desabilitado com aviso.
- O `createSpeechOutputGlue` do renderer espelha a lógica de filtro/seleção/no-op-sem-voz-local do módulo puro (verificável por leitura; comentário apontando o teste de referência).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` verdes; a suíte cresce/atualiza com os casos de garantia só-local.
- Diff de produção **confinado a `apps/desktop`** e, dentro dele, a `src/speech-output.ts`, `src/renderer/renderer.js` (e o teste `tests/speech-output.test.ts`); **zero** alteração em `@atlas/contracts`/`@atlas/core`/demais packages, em `main.ts`/`preload.cjs`/`core-bridge.ts` e nos canais IPC.
- Lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.
- **Smoke manual visual** (abrir a janela, conversar, clicar "Ouvir" e confirmar que fala por voz local; verificar a degradação — botão desabilitado com aviso — num ambiente só com vozes de rede/sem voz): documentado como pendente de confirmação humana em sessão gráfica real, no mesmo tratamento honesto das SPECs 0031-0035 — não bloqueia o fechamento documental.

---

# Arquivos Esperados

```text
apps/desktop/src/speech-output.ts          (editado)
apps/desktop/tests/speech-output.test.ts   (editado)
apps/desktop/src/renderer/renderer.js      (editado)
apps/desktop/CLAUDE.md                      (nota de escopo 2.3 — via doc-sync)
```

Lista de expectativa; pequenos ajustes admissíveis na implementação.

---

# Componentes Impactados

- Output Gateway (responsabilidade, dentro de `apps/desktop` — ModuleCatalog l. 921-954).

Nenhum package do Core é impactado.

---

# Interfaces Necessárias

- `VoiceInfo` (novo, local a `apps/desktop`): `{ readonly voiceURI: string; readonly name: string; readonly localService: boolean }`.
- `SpeechSynthesisPort` (alterada, local): `speak(spec: UtteranceSpec): void`; `cancel(): void`; `getVoices(): readonly VoiceInfo[]`.
- `UtteranceSpec` (alterada, local): `{ readonly text: string; readonly voiceURI: string }`.
- `SpeechOutput` (inalterada, local): `speak(text: string): void`; `cancel(): void`; `isAvailable(): boolean`.

Todos **locais** a `apps/desktop` — nada é promovido a `@atlas/contracts` (promoção só com 2º consumidor real, via ADR).

---

# Fluxo Esperado

```text
Chat (SPEC-0033): resposta do assistente pintada no transcript
        │
        ▼
isAvailable()? (existe ≥1 voz localService===true?)
        │ não ──▶ botão "Ouvir" desabilitado + aviso "voz indisponível"
        │ sim
        ▼
Usuário clica "🔊 Ouvir"
        │
        ▼
createSpeechOutput (puro): normaliza → seleciona 1ª voz local → cancela → synth.speak({ text, voiceURI })
        │  (sem voz local ⇒ no-op, jamais voz de rede)
        ▼
adapter synth (renderer): acha a voz real (voiceURI + localService===true) → utterance.voice = voz local → speak
        │  (voz não encontrada ⇒ não fala, fail-closed)
        ▼
Chromium sintetiza pela voz LOCAL do SO (offline garantido, sem rede)
```

---

# Estratégia de Implementação

1. `src/speech-output.ts`: adicionar `VoiceInfo`, alargar `getVoices`/`UtteranceSpec`, extrair a seleção pura de voz local, aplicar em `speak`/`isAvailable`, atualizar cabeçalho.
2. Atualizar `tests/speech-output.test.ts` com fakes de `VoiceInfo` (mistos local/rede) cobrindo os Critérios de Aceitação novos e os preservados.
3. `renderer.js`: projeção `VoiceInfo` no adapter `getVoices`, vinculação de `utterance.voice` à voz local no `speak`, no-op se não encontrada, espelhar filtro/seleção no `createSpeechOutputGlue`.
4. Rodar `pnpm lint`/`typecheck`/`test`/`format:check`; registrar lições.

---

# Estratégia de Testes

- Vitest, sem Electron/DOM (mesma base de `speech-output.test.ts` da SPEC-0035).
- Fake `SpeechSynthesisPort` cujo `getVoices` devolve `VoiceInfo[]` com `localService` variando, **sem qualquer stub de rede**.
- Casos:
  - fala de texto não-vazio com ≥1 voz local: ordem `cancel`→`speak`, `UtteranceSpec` normalizado **e** com `voiceURI` de voz local;
  - seleção determinística: com várias vozes locais, escolhe a primeira na ordem de `getVoices()`; com locais e de rede misturadas, escolhe uma **local**, nunca uma de rede;
  - `speak` é no-op quando só há vozes `localService === false` (spy: `synth.speak` não chamado);
  - `speak('')`/`speak('   ')` no-op;
  - `isAvailable()` `true` com ≥1 local; `false` com lista vazia, só-rede, ou `getVoices` lançando;
  - resiliência: `synth` que lança em `speak`/`cancel`/`getVoices` não propaga;
  - `cancel()` explícito delega a `synth.cancel()`.
- O renderer (glue de navegador) não é unit-testado — validado no smoke manual, como nas SPECs 0031-0035.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios forem atendidos;
- testes estiverem passando;
- documentação atualizada (via `doc-sync` no fecho);
- arquitetura preservada (fronteira Core/renderer intacta; nenhuma dependência de runtime nova; nenhuma chamada de rede);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` da raiz e de `apps/desktop`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é passo de fecho `doc-sync`, não do `spec-implementer`.

---

# Restrições

- Não criar módulo/package novo; não criar Voice Service; não embarcar motor de TTS dedicado.
- Não adicionar dependência de runtime nova ao workspace nem a `apps/desktop` (usar exclusivamente a Web Speech API embutida no Chromium, restringida a vozes locais).
- Não fazer nenhuma chamada de rede — a síntese usa exclusivamente vozes `localService === true` do SO.
- Não tocar `@atlas/contracts`, o main process, `preload.cjs`, `core-bridge.ts` nem canais IPC.
- Não introduzir bundler/build/`dist`.
- Manter a fronteira Artigo 4/ADR-0019: nenhum import de `packages/*` no renderer; nenhum import de navegador no módulo puro.
- Artigo 2 (Persona única): a voz é apresentação da mesma Persona — nenhum vazamento de arquitetura interna.

---

# Observações

- **Por que `localService` é o sinal correto:** `SpeechSynthesisVoice.localService` é a propriedade-padrão da Web Speech API que indica se a voz é sintetizada por serviço local (`true`) ou remoto (`false`). Filtrar por ela é a forma canônica, sem heurística frágil, de excluir vozes que roteiam pela rede. A garantia depende de o SO/navegador reportar a flag corretamente; onde a plataforma marca vozes de rede como locais por engano, a garantia herda esse limite — não há sinal mais forte disponível sem embarcar motor próprio (fora de escopo, Escalação E1).
- **Endurecimento, não recuo de garantia:** a SPEC-0035 já garantia que o *módulo* não faz rede; esta SPEC estende a garantia à *voz efetivamente usada*, vinculando-a explicitamente e recusando fallback para voz padrão/de rede. É a resposta direta à decisão do usuário ("zero dependência de rede acima da qualidade da voz").
- **Custo aceito:** em sistemas cujas melhores vozes são de rede, restar apenas vozes locais pode reduzir a qualidade percebida, e em sistemas sem nenhuma voz local a saída de voz fica indisponível (botão desabilitado com aviso). O usuário priorizou explicitamente "zero rede" acima de qualidade/disponibilidade — coerente com "suporte **básico** à voz" (PRD).
- **Duplicação renderer↔módulo:** mantém-se o padrão da SPEC-0035 (glue JS puro replicando o módulo TS testado, com comentário e teste de referência), já que `renderer.js` é `<script>` clássico sem bundler (ADR-0019).

---

# Checklist para IA

Antes de implementar: reler SPEC-0035, `speech-output.ts`/`renderer.js` atuais e a semântica de `SpeechSynthesisVoice.localService`; confirmar a fronteira renderer × módulo puro.

Durante: responsabilidade única (filtro/seleção de voz local no módulo puro; vinculação real da voz no renderer); sem dependência nova; sem rede; sem tocar contratos/main/IPC.

Após: testes, lint, typecheck, format; validar critérios; registrar lições.

---

# Resultado Esperado

O usuário abre o app desktop, conversa no chat e clica "🔊 Ouvir" numa resposta: o Atlas fala usando **uma voz local do sistema operacional**, com a voz explicitamente vinculada ao enunciado — **nunca** uma voz que rote pela internet. Onde o sistema não tiver nenhuma voz local, o botão aparece desabilitado com aviso, e o app **jamais** fala por uma voz de rede como alternativa. A garantia "100% offline" que o usuário exigiu passa a valer para a voz efetivamente usada, não só para a fronteira do módulo — sem nenhuma dependência nova instalada e sem qualquer alteração no Core ou nos contratos. A decisão de filtro/seleção de voz local é testada em unidade; a vinculação com a voz real do Chromium é a única parte não coberta por teste, validada no smoke manual.

---

# Decisões de design

Registradas em formato de veto (Emenda v1.1 da Constituição).

**1. Estratégia = restringir a `localService === true` + vincular a voz explicitamente, dentro da Web Speech API já adotada; NÃO embarcar motor de TTS novo.**
- **Decisão:** filtrar `getVoices()` para apenas vozes locais (`localService === true`), selecionar deterministicamente a primeira e carimbá-la no `UtteranceSpec` para o renderer vincular ao `SpeechSynthesisUtterance`; sem voz local ⇒ no-op/indisponível.
- **Porquê:** cumpre a exigência do usuário ("zero dependência de rede") pela via **mais simples, mais transparente e mais sustentável** (teste da Constituição), usando o sinal-padrão da API que o ADR-0019 já licencia, sem nova dependência de runtime, sem tocar `@atlas/contracts`/Core, mantendo o diff em `apps/desktop`.
- **Alternativa descartada:** embarcar um motor neural offline (Piper/Coqui/nativo) — recusada porque adiciona dependência de runtime permanente (= ADR novo, espelho do ADR-0019) e possivelmente um módulo Voice Service (componente futuro previsto, ModuleCatalog l. 1078/1089, sujeito ao Architecture Decision Process): território de escalação humana (ver E1), e desnecessário — o filtro por `localService` já entrega "zero rede" com o runtime existente. O usuário aceitou o custo de qualidade/disponibilidade dessa via.

**2. Fail-closed em direção ao offline: sem voz local ⇒ não falar; voz escolhida não encontrada no renderer ⇒ não falar.**
- **Decisão:** nunca cair em voz padrão/de rede como fallback; a ausência de voz local desabilita a saída (botão desabilitado com aviso) em vez de degradar para uma voz possivelmente remota.
- **Porquê:** a prioridade declarada do usuário é "zero rede acima de qualidade"; fail-closed é a única postura coerente com uma **garantia dura**, e espelha o fail-closed já adotado no `confirm-port` (SPEC-0032) e no `verify` de FS (SPEC-0024).
- **Alternativa descartada:** fallback para a voz padrão quando não houver voz local — recusada porque reintroduziria exatamente o vazamento de rede que a SPEC existe para eliminar.

**3. Seleção de voz automática e determinística (primeira voz local), sem UI de escolha nem preferência persistida.**
- **Decisão:** escolher a primeira voz local na ordem de `getVoices()`, sem expor seleção ao usuário nesta fatia.
- **Porquê:** mantém a fatia mínima e transparente; seleção/preferência de voz pertence a fatias de gerência (item 2.4), não ao endurecimento da garantia offline. Determinismo torna o comportamento testável.
- **Alternativa descartada:** deixar o usuário escolher a voz agora — recusada por expandir escopo para configuração/persistência (item 2.4), fora desta fatia.

**4. Perfil: `completo` (não `micro`).**
- **Decisão:** classificar como `completo`.
- **Porquê:** a fronteira `micro` do template (v1.2) restringe a localização a `packages/X/src` + opcionalmente `apps/cli/src`; esta SPEC vive em `apps/desktop`, fora dessa cláusula — logo não qualifica como `micro`. Na dúvida, `completo` é o caminho seguro; o predecessor direto (SPEC-0035) também foi `completo`. O gate do `architecture-reviewer` confirma.
- **Alternativa descartada:** `micro` — recusada por `apps/desktop` não estar coberto pela cláusula de localização do perfil `micro`, apesar de a mudança ser aditiva e sem ADR/contrato novo.

## Escalações (decisão humana)

Nenhuma escalação obrigatória para esta fatia: ela é aditiva, derivável do ADR-0019 (Web Speech API já embarcada) e do padrão da API (`localService`), **sem ADR novo, sem módulo novo e sem dependência de runtime nova**.

- **E1 — Motor de TTS dedicado offline (Piper/Coqui/nativo) e/ou módulo Voice Service. `Não acionado nesta fatia`.** Caso, no futuro, a qualidade/disponibilidade das vozes locais do SO se mostre insuficiente e se decida embarcar um motor de voz próprio, isso será uma decisão de stack estrutural e permanente (espelho do ADR-0019) e possivelmente a criação do "Voice Service" (componente futuro previsto, ModuleCatalog l. 1078), sujeitos ao Architecture Decision Process — a começar por brainstorming humano + ADR, não pelo `spec-drafter`. Esta SPEC deliberadamente não segue esse caminho porque o filtro por `localService` já cumpre a exigência de "zero rede" com o runtime existente.
