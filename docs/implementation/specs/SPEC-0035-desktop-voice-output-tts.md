# Implementation Specification

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0035

---

**Título**

Desktop: saída de voz (TTS) — falar a resposta do chat pela Web Speech API do Chromium

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

`Fase 2 — 2.3 Voz` (`docs/04-engineering/Roadmap.md`, l. 151-157) — **primeira fatia**, especificamente a linha "Saída por voz (TTS)" (l. 156). **Não** cobre "Entrada por voz (STT)" (l. 155) nem "Ativação por voz (wake word)" (l. 157) — ver Fora do Escopo e a escalação registrada nas Decisões de design.

---

# Objetivo

Ao concluir esta SPEC, o app `apps/desktop`/`@atlas/desktop` deverá conseguir **falar em voz alta a resposta textual do assistente** no chat visual multi-turno (item 2.2, entregue pela SPEC-0033), acionado por uma ação explícita do usuário (um botão "Ouvir" por resposta), usando a **API de síntese de fala embutida no Chromium** (`window.speechSynthesis` / `SpeechSynthesisUtterance`, a Web Speech API que o runtime do Electron já provê por força do ADR-0019) — **sem adicionar nenhuma dependência de runtime nova, sem nenhuma chamada de rede (funciona offline, com as vozes locais do SO), sem tocar `@atlas/contracts`, sem tocar o main process/IPC/`core-bridge`, com o diff confinado a `apps/desktop`** (e, dentro dele, ao renderer mais um módulo puro testável).

A lógica de decisão da fala (o que falar, quando não falar, cancelar a fala anterior antes de iniciar a próxima, e se há voz local disponível) vive num módulo puro injetável e testável no Vitest (`src/speech-output.ts`), no mesmo molde de `src/confirm-port.ts`/`src/steps-view.ts`; a ligação com o objeto `speechSynthesis`/o construtor `SpeechSynthesisUtterance` do navegador (glue não testável fora de sessão gráfica) fica isolada em `src/renderer/renderer.js`, exatamente como `dialog.showMessageBox` fica isolado em `src/main.ts`.

---

# Motivação

O PRD lista **"O sistema deve permitir interação por voz"** entre os Requisitos Funcionais de Comunicação (l. 57) e **"suporte básico à voz"** no Escopo Inicial (l. 217). O Roadmap reserva o item **2.3 Voz** (STT/TTS/wake word) para a Fase 2, agora em andamento, e o `ProjectStructure.md` já reserva a "futura entrada e saída por voz" para `apps/desktop`. O ModuleCatalog lista **"voz"** explicitamente entre o que o **Output Gateway** "pode apresentar" (l. 930) — e o Output Gateway vive na aplicação cliente (`apps/*`, l. 952-954).

Com a fundação do desktop pronta (SPEC-0031/0032) e o chat visual multi-turno entregue (SPEC-0033), existe agora uma superfície conversacional real onde a saída de voz agrega valor imediato: ouvir a resposta em vez de só lê-la. Esta SPEC entrega a **fatia mínima e vertical** dessa capacidade — a saída (TTS) da resposta do chat — deliberadamente contida ao que o ADR-0019 já licencia (o runtime Chromium), operando **offline** com as vozes locais do SO, deixando as decisões de stack que exigem julgamento humano (motor de STT, wake word) fora desta fatia e escaladas explicitamente.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — "interação por voz" (l. 57), "suporte básico à voz" (l. 217).
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.3 Voz (l. 151-157).
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Output Gateway (l. 921-954, "voz" em "pode apresentar"); "Voice Service" como componente futuro previsto (l. 1078).
- [ADR-0019 — Stack Electron para `apps/desktop`](../../06-adr/ADR-0019-desktop-electron-stack.md) — runtime Chromium adotado; renderer em JS plano sem bundler; fronteira Core no main process.
- [SPEC-0031](SPEC-0031-desktop-foundation.md) / [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) / [SPEC-0033](SPEC-0033-desktop-visual-chat.md) / [SPEC-0034](SPEC-0034-desktop-visual-memory-management.md) — fundação, adapters de GUI, chat visual multi-turno, gerência visual de memória.
- [ArchitectureConstitution.md](../../00-project/ArchitectureConstitution.md) — Artigo 13 (nenhuma dependência permanente de framework; tensão já tratada e contida a `apps/desktop` pelo ADR-0019); Artigo 2 (usuário percebe uma única Persona).

---

# Escopo

- Criar `apps/desktop/src/speech-output.ts`: um módulo puro/injetável, sem import de `electron` nem de globais de navegador, no molde de `src/confirm-port.ts`.
  - Uma porta estrutural local `SpeechSynthesisPort` (`speak(spec: UtteranceSpec): void`; `cancel(): void`; `getVoices(): readonly unknown[]`) — a superfície mínima de `window.speechSynthesis` de que esta fatia precisa (incluindo consultar as vozes locais disponíveis), satisfeita estruturalmente (nenhum tipo de navegador importado).
  - Um tipo plano local `UtteranceSpec { readonly text: string }` — o dado que o renderer converte num `SpeechSynthesisUtterance` real.
  - `createSpeechOutput({ synth }: { synth: SpeechSynthesisPort }): SpeechOutput`, onde `SpeechOutput` expõe `speak(text: string): void`, `cancel(): void` e `isAvailable(): boolean`.
    - `isAvailable()` devolve `true` se, e somente se, `synth.getVoices()` retornar uma lista **não-vazia** de vozes locais — a checagem que decide se a UI habilita a fala (fallback gracioso para a lacuna conhecida do Electron dependente de plataforma). Se `getVoices` lançar, devolve `false` (fail-safe).
    - `speak(text)` normaliza o texto (colapso de espaços em branco/`trim`); se o resultado for vazio, **no-op** (não chama `synth.speak`); caso contrário **cancela** qualquer fala em curso (`synth.cancel()`) e então chama `synth.speak({ text })`. Nunca lança (fail-safe: qualquer erro do `synth` é capturado, nunca propaga para o fluxo do chat).
    - `cancel()` delega a `synth.cancel()` (idempotente/tolerante).
    - **Offline por construção:** toda a operação usa apenas o motor de voz local do SO exposto por `window.speechSynthesis`; o módulo **não faz nenhuma chamada de rede** e funciona sem internet.
- Criar `apps/desktop/tests/speech-output.test.ts` cobrindo: fala de texto não-vazio (chama `cancel` antes de `speak`, com o `UtteranceSpec` normalizado); no-op em texto vazio/só espaços (nenhuma chamada a `synth.speak`); resiliência a `synth` que lança em `speak`/`cancel`/`getVoices` (não propaga); `cancel()` explícito; `isAvailable()` `true` com vozes e `false` com lista vazia; ausência de qualquer import/uso de rede no módulo.
- Editar `apps/desktop/src/renderer/renderer.js`:
  - construir o adapter `synth` sobre a Web Speech API do Chromium (`{ speak: (spec) => window.speechSynthesis.speak(new SpeechSynthesisUtterance(spec.text)), cancel: () => window.speechSynthesis.cancel(), getVoices: () => window.speechSynthesis.getVoices() }`), com guarda para o caso de `window.speechSynthesis` ausente (o adapter degrada com `getVoices` devolvendo `[]`, nunca lança);
  - instanciar `createSpeechOutput({ synth })` e, ao anexar cada **resposta** do assistente ao transcript do chat (`appendTurn`, hoje a linha `snapshot.reply`), acrescentar um botão "🔊 Ouvir" que chama `speechOutput.speak(snapshot.reply)`. Quando `speechOutput.isAvailable()` for `false` (nenhuma voz local disponível — `window.speechSynthesis` ausente ou lista de vozes vazia), o botão é **desabilitado** com um aviso curto (ex.: `title`/rótulo "voz indisponível neste sistema"), **nunca ativo-porém-mudo, nunca uma exceção não tratada, nunca travando a janela**.
- Editar `apps/desktop/src/renderer/index.html` **apenas se necessário** (estilo/estrutura mínima do botão) — preferir criar o botão via JS, como já é feito com o botão "Esquecer" da memória.
- Atualizar a documentação específica desta SPEC (este arquivo) e a nota de escopo em `apps/desktop/CLAUDE.md` referente à fatia 2.3 (via `doc-sync` no fecho).

---

# Fora do Escopo

- **Entrada por voz (STT)** — captura de microfone, `SpeechRecognition`, transcrição de fala em texto. Depende de escolha de motor (ADR novo) e de permissão de microfone; ver escalação E1 nas Decisões de design.
- **Ativação por voz (wake word)** — escuta contínua; Roadmap l. 157 marca como "candidato, não comprometido".
- **Motor de TTS dedicado/plugável** (biblioteca nativa, serviço de nuvem, voz custom) — introduziria dependência de runtime permanente = ADR novo (espelho do ADR-0019); esta fatia usa **apenas** a API embutida do Chromium com as vozes locais do SO.
- **Criar um módulo Voice Service** (`packages/*`) ou qualquer package novo — "Voice Service" é componente futuro previsto do ModuleCatalog (l. 1078) e exige o Architecture Decision Process; esta fatia é responsabilidade do Output Gateway **dentro de `apps/desktop`**.
- **Falar a resposta do `ask` de tiro único** (SPEC-0032) e falar o `status`/traço de `steps`/`learned` — a fatia mínima cobre só a resposta (`reply`) do chat multi-turno; reuso trivial em fatias futuras.
- **Fala automática** (auto-speak de toda resposta), preferência persistida de voz/idioma/velocidade, seleção de voz, controles de pausa/retomar/velocidade. A ação é manual e explícita nesta fatia.
- **Qualquer alteração** em `@atlas/contracts`, `@atlas/core`, `apps/desktop/src/main.ts`, `src/preload.cjs`, `src/core-bridge.ts`, canais IPC, ou qualquer package do Core.
- **Empacotamento/distribuição**, E2E de Electron em CI, bundler/framework de UI.

---

# Pré-requisitos

- [SPEC-0031](SPEC-0031-desktop-foundation.md) — `Done` (fundação do desktop, ADR-0019).
- [SPEC-0033](SPEC-0033-desktop-visual-chat.md) — `Done` (chat visual multi-turno; é a superfície onde a fala é acionada).

Ambas confirmadas `Done` no `NEXT_CONTEXT.md` (Estado Imediato, 2026-07-23).

---

# Critérios de Aceitação

- `apps/desktop/src/speech-output.ts` existe, exporta `createSpeechOutput`, `SpeechOutput`, `SpeechSynthesisPort` e `UtteranceSpec`, e **não importa `electron` nem globais de navegador** (verificável: ausência de `import ... 'electron'` e de referência a `window`/`SpeechSynthesisUtterance` no arquivo).
- `createSpeechOutput({ synth }).speak(text)` com texto não-vazio chama `synth.cancel()` e em seguida `synth.speak({ text })` com o texto normalizado (verificável por fake/spy no teste, asseverando ordem e argumento).
- `speak('')` e `speak('   ')` são **no-op**: `synth.speak` não é chamado (verificável por spy).
- **Comportamento offline verificável:** o módulo `speech-output.ts` **não contém nenhuma chamada de rede** (sem `fetch`/`XMLHttpRequest`/`import` de rede) — toda síntese passa pelo `synth` injetado (vozes locais do SO). Verificável por inspeção do arquivo e pelo teste, que exercita `speak`/`isAvailable` com um `synth` fake **sem qualquer stub de rede**.
- **Fallback gracioso verificável:** `createSpeechOutput({ synth }).isAvailable()` devolve `true` quando `synth.getVoices()` retorna lista não-vazia e `false` quando retorna `[]` **ou** quando `getVoices` lança (verificável por spy); `speak(text)` com um `synth` cujo `speak`/`cancel`/`getVoices` lança **não propaga** o erro (verificável: a chamada retorna sem `throw`).
- `cancel()` delega a `synth.cancel()`.
- O renderer instancia `createSpeechOutput` sobre `window.speechSynthesis`, adiciona um botão "Ouvir" por resposta do chat e o **desabilita com aviso** quando `isAvailable()` é `false`; com `window.speechSynthesis` ausente ou sem vozes, a janela **não quebra nem lança exceção não tratada** (degradação graciosa).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` verdes; a suíte cresce com o novo arquivo de teste.
- Diff de produção **confinado a `apps/desktop`** e, dentro dele, a `src/speech-output.ts` (novo), `src/renderer/renderer.js` e, se preciso, `src/renderer/index.html`; **zero** alteração em `@atlas/contracts`/`@atlas/core`/demais packages, em `main.ts`/`preload.cjs`/`core-bridge.ts` e nos canais IPC.
- Lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.
- **Smoke manual visual** (abrir a janela, enviar um turno de chat, clicar "Ouvir" e ouvir a resposta falada; verificar a degradação — botão desabilitado com aviso — num ambiente sem voz): documentado como pendente de confirmação humana em sessão gráfica real, no mesmo tratamento honesto das SPECs 0031-0034 (o shell de automação não tem WindowServer/saída de áudio) — não bloqueia o fechamento documental.

---

# Arquivos Esperados

```text
apps/desktop/src/speech-output.ts          (novo)
apps/desktop/tests/speech-output.test.ts   (novo)
apps/desktop/src/renderer/renderer.js      (editado)
apps/desktop/src/renderer/index.html       (não editado nesta implementação)
eslint.config.js                            (editado — global SpeechSynthesisUtterance)
apps/desktop/CLAUDE.md                      (nota de escopo 2.3 — via doc-sync)
```

Lista de expectativa; pequenos ajustes admissíveis na implementação.

**Nota de fechamento (corrigindo um desvio de redação desta seção):** "o renderer instancia `createSpeechOutput`" não deve ser lido como um `import` direto e executável do módulo TypeScript — `renderer.js` é `<script>` clássico sem bundler (ADR-0019) e não pode importar `src/speech-output.ts` em runtime. Na implementação real, o renderer **replica** o mesmo algoritmo em JS puro (`createSpeechOutputGlue`, espelhando `createSpeechOutput`), com comentário explícito apontando a duplicação e o teste de referência. Ver `docs/implementation/LESSONS_LEARNED.md` (entrada desta SPEC) e `apps/desktop/CLAUDE.md`.

---

# Componentes Impactados

- Output Gateway (responsabilidade, dentro de `apps/desktop` — ModuleCatalog l. 921-954).

Nenhum package do Core é impactado.

---

# Interfaces Necessárias

- `SpeechSynthesisPort` (local a `apps/desktop`): `speak(spec: UtteranceSpec): void`; `cancel(): void`; `getVoices(): readonly unknown[]`.
- `UtteranceSpec` (local): `{ readonly text: string }`.
- `SpeechOutput` (local, retorno de `createSpeechOutput`): `speak(text: string): void`; `cancel(): void`; `isAvailable(): boolean`.

Todos **locais** a `apps/desktop` (mesma regra de `StatusSnapshot`/`AskSnapshot`/`ConfirmPort`/`StepLine`): nada é promovido a `@atlas/contracts` — promoção só com um 2º consumidor real, via ADR.

---

# Fluxo Esperado

```text
Chat (SPEC-0033): resposta do assistente pintada no transcript
        │
        ▼
isAvailable()? ── não (sem voz local) ──▶ botão "Ouvir" desabilitado + aviso
        │ sim
        ▼
Usuário clica "🔊 Ouvir" na resposta
        │
        ▼
renderer.js  → speechOutput.speak(reply)
        │
        ▼
createSpeechOutput (puro): normaliza → cancela fala anterior → synth.speak({ text })
        │
        ▼
adapter synth (renderer) → window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
        │
        ▼
Chromium sintetiza a voz pelo motor local do SO (offline, sem rede)
```

---

# Estratégia de Implementação

1. Criar `src/speech-output.ts` (porta + tipos + `createSpeechOutput` puro: normalização, `isAvailable` via `getVoices`, fail-safe, cancel-before-speak, offline por construção).
2. Escrever `tests/speech-output.test.ts` com fake `synth` (spy) cobrindo os casos dos Critérios de Aceitação (inclusive `isAvailable` verdadeiro/falso e resiliência a exceção).
3. Ligar no `renderer.js`: adapter `synth` sobre `window.speechSynthesis`/`SpeechSynthesisUtterance` (com guarda de ausência), instanciar `createSpeechOutput`, adicionar o botão "Ouvir" em `appendTurn` e desabilitá-lo com aviso quando `isAvailable()` for `false`.
4. Ajuste mínimo de `index.html` só se necessário.
5. Rodar `pnpm lint`/`typecheck`/`test`/`format:check`; registrar lições.

---

# Estratégia de Testes

- Vitest, sem Electron/DOM (mesma base de `confirm-port.test.ts`/`steps-view.test.ts`).
- Fake `SpeechSynthesisPort` com spies em `speak`/`cancel`/`getVoices`, **sem qualquer stub de rede** (reforça o comportamento offline).
- Casos: fala de texto não-vazio (ordem cancel→speak, `UtteranceSpec` normalizado); no-op em vazio/espaços; `isAvailable()` `true` (vozes) e `false` (lista vazia / `getVoices` lança); resiliência a `synth` que lança em `speak`/`cancel`/`getVoices`; `cancel()` explícito.
- O renderer (glue de navegador) não é unit-testado — validado no smoke manual, como os demais renderers das SPECs 0031-0034.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios forem atendidos;
- testes estiverem passando;
- documentação atualizada (via `doc-sync` no fecho);
- arquitetura preservada (fronteira Core/renderer intacta; nenhuma dependência de runtime nova);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` da raiz e de `apps/desktop`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é passo de fecho `doc-sync`, não do `spec-implementer`.

---

# Restrições

- Não criar módulo/package novo; não criar Voice Service.
- Não adicionar dependência de runtime nova ao workspace nem a `apps/desktop` (usar exclusivamente a Web Speech API embutida no Chromium).
- Não fazer nenhuma chamada de rede — a síntese usa exclusivamente as vozes locais do SO (offline).
- Não tocar `@atlas/contracts`, o main process, `preload.cjs`, `core-bridge.ts` nem canais IPC.
- Não introduzir bundler/build/`dist`.
- Manter a fronteira Artigo 4/ADR-0019: nenhum import de `packages/*` no renderer; nenhum import de navegador no módulo puro.
- Artigo 2 (Persona única): a voz é apresentação da mesma Persona — nenhum vazamento de arquitetura interna.

---

# Observações

- **Por que a Web Speech API embutida não exige ADR novo (E2 resolvido pelo usuário):** o ADR-0019 já adotou o runtime Chromium para `apps/desktop`; `window.speechSynthesis`/`SpeechSynthesisUtterance` fazem parte desse runtime já embarcado e usam as vozes locais do SO — usá-los **não adiciona nenhuma dependência de runtime permanente** (o ponto que o Artigo 13 protege e que o ADR-0019 tratou) e **não faz nenhuma chamada de rede** (funciona offline). É o análogo, para voz, do renderer já usar JS de navegador puro sem bundler. Diferente disso, escolher um **motor de fala dedicado** (nativo/nuvem/plugável) seria adicionar uma dependência permanente = ADR novo, espelho do ADR-0019 — por isso fica fora do escopo. **O usuário decidiu explicitamente que esta fatia dispensa ADR próprio** (ver E2, resolvido).
- `speechSynthesis` usa vozes instaladas no SO; disponibilidade e qualidade variam por plataforma, e o Electron pode reportar lista de vozes vazia em alguns ambientes — daí o fallback gracioso (`isAvailable()` + botão desabilitado com aviso), coerente com "suporte **básico** à voz" (PRD).
- **Delimitação da garantia offline (achado não-bloqueante do `architecture-reviewer`, honrado na implementação):** a garantia verificável desta SPEC é que **o módulo puro `speech-output.ts` não faz nenhuma chamada de rede** (sem `fetch`/`XMLHttpRequest`/import de rede) e que a síntese passa pelas vozes locais do SO expostas por `window.speechSynthesis`. Isto **não** é uma afirmação de que toda a pilha de síntese de voz do sistema operacional é necessariamente offline — algumas vozes de plataforma (`SpeechSynthesisVoice.localService === false`) podem ser processadas via rede por decisão do SO/navegador, fora do controle deste módulo. Não superdimensionar a garantia ao documentar/testar: ela é da fronteira do módulo, não da pilha de voz inteira.
- **Quirk assíncrono do `voiceschanged` (achado não-bloqueante do `architecture-reviewer`, honrado na implementação):** no Chromium, `getVoices()` costuma devolver `[]` na primeira chamada, até o evento `voiceschanged` disparar de forma assíncrona. `isAvailable()` do módulo puro é corretamente point-in-time; é o **glue do renderer** (`renderer.js`) que reavalia a disponibilidade quando `voiceschanged` dispara (reabilitando os botões "Ouvir" pendentes), evitando o falso-negativo de desabilitar a voz num sistema que na verdade tem voz disponível.

---

# Checklist para IA

Antes de implementar: ler ADR-0019, SPEC-0033 e o `renderer.js`/`confirm-port.ts` atuais; confirmar a fronteira renderer × módulo puro.

Durante: responsabilidade única (decisão de fala/disponibilidade no módulo puro; glue de navegador no renderer); sem dependência nova; sem rede; sem tocar contratos/main/IPC.

Após: testes, lint, typecheck, format; validar critérios; registrar lições.

---

# Resultado Esperado

O usuário abre o app desktop, conversa no chat visual e, em cada resposta do assistente, encontra um botão "🔊 Ouvir" que lê a resposta em voz alta usando a voz local do sistema operacional — **sem internet, sem nenhuma dependência nova instalada e sem qualquer alteração no Core ou nos contratos**. Onde não houver voz disponível, o botão aparece desabilitado com um aviso, e a janela nunca trava nem lança exceção. A decisão de quando/o que falar e se há voz disponível é testada em unidade; a ligação com a API de voz do Chromium é a única parte não coberta por teste, validada no smoke manual. A saída de voz (TTS) do item 2.3 do Roadmap ganha sua primeira fatia; entrada por voz (STT) e wake word permanecem fatias futuras, condicionadas a decisão humana (ADR/módulo) registrada abaixo.

---

# Decisões de design

Registradas em formato de veto (Emenda v1.1 da Constituição). As decisões numeradas são do `spec-drafter` deriváveis da documentação; a seção **Escalações** ao final distingue o que foi resolvido pelo usuário (E2) do que segue adiado a decisão humana (E1).

**1. Perfil: `completo` (não `micro`).**
- **Porquê:** embora a fatia seja aditiva, confinada a `apps/desktop`, sem tocar `@atlas/contracts` e sem package novo, ela introduz uma **capacidade de produto nova** (voz); na dúvida, `completo` é o caminho seguro (template v1.2), e o gate do `architecture-reviewer` confirma a classificação.
- **Alternativa descartada:** `micro` — recusada porque a novidade da capacidade e a introdução de uma nova superfície de UI/porta justificam o escrutínio completo do gate, não o fast-path.

**2. Primeira fatia = Saída (TTS), não Entrada (STT).**
- **Porquê:** a fatia mínima vertical mais barata e de menor risco. A TTS via `window.speechSynthesis` é um recurso **puro do renderer**, offline, sem dependência nova, sem captura de microfone e sem escolha de motor; a STT (`SpeechRecognition` no Electron) depende de backend externo/nuvem e de permissão de microfone — superfície maior que força de imediato a escolha de stack (ADR). Roadmap l. 155-156 lista as duas direções; PRD pede "suporte **básico** à voz".
- **Alternativa descartada:** STT-primeiro — recusada como fatia mínima porque obrigaria já a decisão de motor (ADR) e permissões de microfone, contrariando "fatia mínima e vertical, diff confinado a `apps/desktop`".

**3. Motor = Web Speech API embutida do Chromium (`window.speechSynthesis`), vozes locais do SO, offline; nenhum módulo Voice Service novo.**
- **Porquê:** usa o runtime que o ADR-0019 já adotou, **sem adicionar dependência de runtime permanente** (Artigo 13, já tratado e contido a `apps/desktop`) e **sem rede** (funciona offline), mantendo o diff fora de `@atlas/contracts` e do Core. "Voz" já é responsabilidade do **Output Gateway** dentro de `apps/*` (ModuleCatalog l. 930, 952-954); ler uma resposta em voz alta no renderer não exige um módulo transversal. **O usuário confirmou que isto dispensa ADR próprio** (E2, resolvido).
- **Alternativa descartada:** embarcar um motor de TTS dedicado (nativo/nuvem/plugável) e/ou criar um package Voice Service — recusada para a fatia mínima porque introduz dependência de runtime permanente (= ADR novo, espelho do ADR-0019) e um componente que o ModuleCatalog trata como futuro previsto sujeito ao Architecture Decision Process (l. 1078, 1089) — território de escalação, não desta fatia.

**4. Acionamento = botão "Ouvir" manual por resposta, sem fala automática nem preferência persistida.**
- **Porquê:** ação explícita e transparente do usuário (Artigo 2/Constituição: previsibilidade), sem áudio surpresa e sem estado de configuração — coerente com o padrão opt-in do desktop (ex.: `writeRoots` default vazio). Mantém a fatia mínima.
- **Alternativa descartada:** auto-speak de toda resposta e/ou preferência global de voz — recusada como intrusiva e por puxar configuração/seleção de voz, que pertence a fatias de gerência (item 2.4) e não a esta.

**5. Comportamento offline explícito + fallback gracioso quando não houver voz disponível.**
- **Porquê:** a preocupação do usuário nesta conversa foi explicitamente que a voz funcione **offline** — garantido por construção (só o motor local do SO via `window.speechSynthesis`, zero chamadas de rede). E porque o Electron pode reportar lista de vozes vazia dependendo da plataforma (lacuna conhecida), a UI degrada com `isAvailable()` (checando `synth.getVoices()` não-vazio) desabilitando o botão com aviso — **nunca ativo-porém-mudo, nunca exceção não tratada, nunca travando a janela**. Requisito combinado com o usuário; coerente com "suporte **básico** à voz" (PRD) e com o fail-safe já adotado no `confirm-port` (SPEC-0032).
- **Alternativa descartada:** assumir voz sempre presente (botão sempre ativo) — recusada porque, em ambientes sem voz local, produziria um botão silencioso ou uma exceção do `speechSynthesis`, quebrando a transparência e possivelmente a janela.

## Escalações (decisão humana)

- **E1 — Motor de STT (entrada por voz) e wake word exigem ADR novo e possivelmente um módulo Voice Service. `Adiado`.** Escolher um motor de reconhecimento de fala (offline/nuvem/nativo) é uma decisão de stack estrutural e permanente, espelho exato do ADR-0019 (Electron), e o "Voice Service" é componente futuro previsto do ModuleCatalog (l. 1078) sujeito ao Architecture Decision Process. **Fica fora desta fatia**; qualquer fatia futura de STT/wake word deve começar por brainstorming humano + ADR, não pelo `spec-drafter`.
- **E2 — A fatia de TTS via API embutida do Chromium NÃO exige ADR novo. `Resolvido` (decisão humana, esta sessão).** O usuário decidiu que usar `window.speechSynthesis` com vozes locais do SO é derivável do ADR-0019, funciona offline e não adiciona dependência de runtime — portanto **dispensa ADR próprio**. Decisão registrada aqui e refletida nas Decisões de design 3 e 5; a SPEC segue para o gate do `architecture-reviewer` sem pré-requisito de ADR.
