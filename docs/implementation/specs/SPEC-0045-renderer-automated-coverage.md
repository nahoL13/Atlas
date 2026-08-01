# SPEC-0045 — Cobertura automatizada de `renderer.js` e gate mecânico da duplicação renderer↔módulo

> **Project Atlas — Implementation Specification**

Version: 1.0

---

# Informações Gerais

**ID**

SPEC-0045

---

**Título**

Cobertura automatizada de `apps/desktop/src/renderer/renderer.js` e gate mecânico contra a deriva das réplicas renderer↔`speech-output.ts`

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

`Fase 1 — 1.5 Infraestrutura de Desenvolvimento (transversal)`.

**Exceção consciente registrada**, com o precedente literal da [SPEC-0042](./SPEC-0042-test-split-scoped-verification.md) (Item do Roadmap, l. 56–58): o item 1.5 lista hoje só remote e CI, ambos entregues, mas esta SPEC é da mesma natureza transversal — infraestrutura que protege o desenvolvimento, não capacidade nova da plataforma. Ela **não** consome nenhum item da Fase 2 (não entrega nada de voz, Persona, memória ou permissões que o usuário perceba) e o Roadmap não precisa de item novo.

---

# Objetivo

Quando esta SPEC estiver concluída deverá existir:

1. Um **harness de teste que carrega `apps/desktop/src/renderer/renderer.js` tal como ele é hoje** — `<script>` clássico, sem bundler, sem `export` — dentro de um DOM real de teste (jsdom) montado a partir do `index.html` real, com a superfície `window.atlas` (IPC) e as APIs de navegador de voz substituídas por dublês controlados pelo teste.
2. Uma **suíte de paridade** que executa as **oito réplicas** de lógica hoje duplicadas entre `renderer.js` e `src/speech-output.ts` (mais a constante `PIPER_VOICE_PREFIX`) contra a **mesma tabela de casos**, comparando os dois resultados entre si — de modo que qualquer deriva de comportamento entre as duas cópias falhe a suíte.
3. Um **gate mecânico contra a próxima réplica**: um registro de pares (símbolo do módulo ↔ símbolo do renderer) verificado em tempo de execução, que falha quando `speech-output.ts` ganha um símbolo público não classificado como replicado ou explicitamente não-replicado.
4. Uma **cobertura de arranque** do renderer: o arquivo carrega sem exceção, todos os `id` que ele referencia existem no `index.html`, os painéis são pintados a partir dos dublês e a fiação de um gesto (envio de chat) chega ao canal IPC correspondente.
5. Uma **cobertura dos dois gatilhos de reavaliação de voz** (`voiceschanged` e a resposta assíncrona do IPC de TTS) e da política Piper-only na superfície do `<select>`.

Sem mudar uma linha de `apps/desktop/src/`. Sem bundler. Sem mudar o que a CI verifica.

---

# Motivação

O `architecture-reviewer` registrou, no gate `Draft → Ready` da [SPEC-0043](./SPEC-0043-desktop-voice-residues.md), um **risco estrutural** que a própria SPEC-0043 confirma nas Observações (l. 323): `renderer.js` não tem teste automatizado, então cada réplica de lógica pura entre ele e `speech-output.ts` é verificada **por inspeção humana de diff**. Já são **sete réplicas** (SPECs 0035/0036/0039/0040/0041/0043) — e a SPEC-0043 existe porque **uma dessas duplicações derivou por acidente**: o glue do renderer ficou sem `preferredVoiceURI` desde a SPEC-0035 e a deriva sobreviveu a **seis fatias** sem que nenhum gate mecânico a detectasse. Foi a **segunda** ocorrência desse modo de falha.

O custo é composto: cada fatia de voz nova acrescenta uma réplica, o número de pontos de deriva cresce monotonicamente, e o único mecanismo de detecção — um humano comparando duas implementações escritas em linguagens diferentes, em arquivos diferentes, num diff — já falhou duas vezes. Inspeção de diff não é gate; é esperança.

Rastreabilidade documental:

- **PRD**, *Critérios de Qualidade* — "consistência de comportamento" e "facilidade de manutenção"; *Critérios de Aceitação do Produto* — "evoluir sem comprometer sua arquitetura"; *Requisitos Não Funcionais* — "preparado para crescimento incremental".
- **Constituição**, Artigo 1 (nada de comportamento não documentado assumido) e o teste padrão ("mais simples, mais modular, mais transparente, mais sustentável?"): duas cópias da mesma política de voz, sem nenhuma verificação que as amarre, é o oposto de sustentável.
- **`apps/desktop/CLAUDE.md`**, seção "Renderer: duplicação deliberada (padrão obrigatório)": "Risco de deriva conhecido, **não coberto por teste automatizado**" — a frase que esta SPEC existe para tornar falsa.

O que esta SPEC **não** faz: não elimina a duplicação (isso exigiria mudar a stack do renderer — bundler ou módulos ES —, decisão de ADR e escalação humana). Ela aceita a duplicação que o ADR-0019 impõe e acrescenta o gate que faltava para que a duplicação seja **segura**.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Requisitos Não Funcionais, Critérios de Qualidade, Critérios de Aceitação do Produto
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 1, 13, 14; Emendas v1.1 e v1.2
- [Development Guide](../../04-engineering/DevelopmentGuide.md)
- [ClaudeCodeAutomation](../../04-engineering/ClaudeCodeAutomation.md) — subseção "Verificação escopada" (SPEC-0042)
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 1, item 1.5
- [ADR-0005 — execução de TypeScript sem `dist/`](../../06-adr/ADR-0005-app-typescript-execution.md)
- [ADR-0019 — stack Electron para `apps/desktop`](../../06-adr/ADR-0019-desktop-electron-stack.md) — renderer sem bundler, `<script>` clássico; **preservado sem uma vírgula de mudança por esta SPEC**
- [ADR-0020 — persistência de Persona e vínculo de voz](../../06-adr/ADR-0020-persona-persistence-voice-binding.md)
- [ADR-0021 — Piper como motor de voz local](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — item (c): a Web Speech API nunca é removida
- [SPEC-0042](./SPEC-0042-test-split-scoped-verification.md) (`Done`) — convenção `tests/helpers/`, verificação escopada e a **condição de validade D12** (config raiz só com `include`)
- [SPEC-0043](./SPEC-0043-desktop-voice-residues.md) (`Done`) — origem do risco; última fatia a tocar renderer e `speech-output.ts`
- [SPEC-0035](./SPEC-0035-desktop-voice-output-tts.md) / [SPEC-0036](./SPEC-0036-desktop-tts-local-voice-only.md) / [SPEC-0039](./SPEC-0039-desktop-persona-authoring.md) / [SPEC-0040](./SPEC-0040-desktop-piper-neural-tts.md) / [SPEC-0041](./SPEC-0041-desktop-piper-only-voice-surface.md) — as fatias que criaram as sete réplicas
- `apps/desktop/CLAUDE.md` — seção "Renderer: duplicação deliberada"

---

# Escopo

## Frente 1 — harness de carregamento do renderer

- Criar `apps/desktop/tests/helpers/renderer-harness.ts` (módulo auxiliar, **não** suíte: sem `describe(`/`it(`), no molde de `tests/helpers/core-bridge-harness.ts` (SPEC-0042/D3), expondo uma função de carregamento que:
  1. lê `apps/desktop/src/renderer/index.html` do disco e monta um DOM com **jsdom instanciado programaticamente** (`new JSDOM(html, { runScripts: 'outside-only' })`) — os `<script>` do HTML **não** são executados pelo jsdom;
  2. instala em `window` os dublês antes de qualquer execução: `window.atlas` (superfície IPC completa: `getStatus`, `ask`, `chat.open`/`send`, `memory.list`/`forget`, `persona.list`/`select`/`describe`/`create`/`update`/`delete`, `permissions.select`, `tts.voices`/`available`/`speak`), `window.speechSynthesis`, `SpeechSynthesisUtterance` e `Audio` — todos gravando as chamadas recebidas para asserção;
  3. lê `apps/desktop/src/renderer/renderer.js` do disco e o avalia **sem modificação**, no escopo global daquela janela, concatenando ao final um **epílogo de teste** que publica os símbolos internos escolhidos num objeto de saída (o arquivo em `src/` não ganha nenhum `export`, marcador ou comentário);
  4. devolve `{ window, document, internals, calls }` e um utilitário de drenagem de microtarefas (`flush()`), para que o teste espere as promessas disparadas no carregamento (status, Personas, memória, catálogo Piper, abertura de sessão de chat).
- Valores de entrada dos dublês (snapshot de status, lista de Personas, fatos, vozes do SO, catálogo Piper, disponibilidade do Piper) são **parâmetros** do carregamento, com defaults explícitos — nenhum teste depende do default de outro.
- Acrescentar `jsdom` e `@types/jsdom` como `devDependencies` **de `apps/desktop`** (nunca da raiz, nunca `dependencies`).

## Frente 2 — paridade renderer↔`speech-output.ts`

- Criar `apps/desktop/tests/renderer.speech-parity.test.ts`, com um **registro único** de pares símbolo-do-módulo ↔ símbolo-do-renderer, cobrindo:

  | `src/speech-output.ts` | `renderer.js` | forma da comparação |
  |---|---|---|
  | `createSpeechOutput` | `createSpeechOutputGlue` | comportamental: mesma sequência de chamadas ao `synth` dublê + mesmo `isAvailable()` |
  | (privado) `selectVoiceURI` | `selectVoiceURI` | transitiva, via `createSpeechOutput` (ver Fora do Escopo) |
  | (privado) `selectLocalVoiceURI` | `selectLocalVoiceURI` | transitiva, via `isAvailable()` |
  | `isPiperVoiceURI` | `isPiperVoiceURI` | valor de retorno |
  | `resolveVoiceBackend` | `resolveVoiceBackend` | valor de retorno (deep equal) |
  | `isPiperOnlyMode` | `isPiperOnlyMode` | valor de retorno |
  | `piperOnlyPreference` | `piperOnlyPreference` | valor de retorno |
  | `resolvePersistedVoiceSelection` | `resolvePersistedVoiceSelection` | valor de retorno (deep equal) |
  | `PIPER_VOICE_PREFIX` (de `piper-tts.ts`, reexportado no uso) | `PIPER_VOICE_PREFIX` | igualdade de constante |

- Para cada par, uma **tabela de casos única**, declarada uma vez e aplicada às duas implementações; a asserção é sempre **resultado-do-módulo === resultado-do-renderer** (`toEqual`). Nenhum valor esperado é escrito duas vezes; nenhum caso existe só para um dos lados.
- As tabelas devem cobrir, no mínimo, os cenários que as SPECs 0036/0040/0041/0043 fixam: sem voz alguma; só voz de rede; voz local única; preferência ausente/lançando/apontando para voz inexistente; preferência Piper e preferência de SO, em modo Piper-only e em modo degradado; os quatro desfechos de `resolvePersistedVoiceSelection` (`none`/`available`/`retained`/`dropped`), incluindo a fronteira `dropped` × `retained`.

## Frente 3 — gate mecânico da próxima réplica

- No mesmo arquivo da Frente 2, um bloco de guarda que, em tempo de execução:
  1. enumera os **exports de valor** de `src/speech-output.ts` (funções e constantes; tipos não existem em runtime) e falha se algum não estiver **nem** no registro de pares **nem** numa lista explícita `NOT_MIRRORED`, cada entrada desta última com uma justificativa em texto (hoje: `piperModelIdOf`, usado só no main process);
  2. falha se alguma entrada do registro apontar para um símbolo do renderer que o harness não conseguiu extrair (renome/remoção silenciosa da réplica);
  3. falha se alguma entrada do registro não tiver ao menos um caso na tabela correspondente.

## Frente 4 — arranque e fiação

- Criar `apps/desktop/tests/renderer.boot.test.ts`, cobrindo:
  - o carregamento completo não lança e não registra erro na janela;
  - **todo `id` literal referenciado** por `document.getElementById('…')` no fonte do renderer existe no `index.html` real (extração mecânica por expressão regular sobre o fonte lido pelo harness);
  - os painéis pintam a partir dos dublês: `#status` reflete os campos do snapshot, `#persona-select` tem uma `<option>` por Persona e marca a ativa, `#persona-list`, `#memory-list`, `#read-roots-list` e `#write-roots-list` têm um item por elemento do dublê;
  - **fiação**: submeter `#chat-form` com texto não vazio chama `atlas.chat.send` com o handle da sessão aberta no carregamento e pinta a resposta no transcript.

## Frente 5 — gatilhos de voz e política Piper-only na superfície

- Criar `apps/desktop/tests/renderer.voice-triggers.test.ts`, cobrindo:
  - sem voz nenhuma (nem Piper, nem local do SO), o botão "🔊 Ouvir" de uma resposta fica **desabilitado com `title` de indisponibilidade** — nunca ativo-porém-mudo (achado A2 da SPEC-0035);
  - a resposta assíncrona do IPC de TTS (`tts.voices`/`tts.available`) reavalia os botões pendentes e o `<select>` — sem depender de `voiceschanged`;
  - o evento `voiceschanged` reavalia os mesmos dois alvos — sem depender do IPC;
  - em modo Piper-only (`available === true` e catálogo não vazio) o `<select>` de voz do formulário lista **só** vozes Piper; em modo degradado, **só** vozes locais do SO — nunca as duas origens ao mesmo tempo.

---

# Fora do Escopo

- **Qualquer alteração em `apps/desktop/src/` ou `packages/*/src`** — inclusive comentários, inclusive marcadores de duplicação, inclusive `export` acrescentado "só para o teste". O diff de produção é **vazio** (CA 1).
- **Eliminar a duplicação renderer↔módulo** (bundler, `type="module"`, empacotamento do renderer, mover a lógica replicada para um arquivo compartilhado): muda a stack do renderer fixada pelo ADR-0019 ⇒ ADR novo ⇒ escalação humana. Esta SPEC **aceita** a duplicação e a torna verificável.
- **Quebrar `renderer.js` em arquivos menores** (god file de 1.112 linhas, candidato nomeado desde a SPEC-0042/D8) e **quebrar `core-bridge.ts`** — mudança estrutural de produção, SPEC própria.
- **Exportar os helpers privados de `speech-output.ts`** (`selectVoiceURI`, `selectLocalVoiceURI`, `hasLocalVoice`) para testá-los diretamente: eles são cobertos transitivamente pelo par `createSpeechOutput` ↔ `createSpeechOutputGlue` (decisão D5).
- **Cobertura comportamental ampla dos painéis** — CRUD de Persona pelo formulário, aplicação de permissões, esquecer fato, `ask` de tiro único, serialização de gestos, limpeza de transcript ao trocar Persona. O harness passa a viabilizá-la; entregá-la é fatia futura nomeada nas Observações. Desta SPEC sai **um** caso de fiação (Frente 4), não uma suíte de painéis.
- **Teste do `preload.cjs` e do `main.ts`** (exigem Electron real) e **qualquer verificação de áudio realmente reproduzido** — o dublê registra a chamada; nada soa.
- **Alterar `vitest.config.ts` da raiz** (`environment`, `setupFiles`, `coverage`, `pool` ou qualquer chave além de `include`): quebraria em silêncio a equivalência da verificação escopada registrada em SPEC-0042/D12.
- **Alterar `.github/workflows/ci.yml`**, os scripts da raiz e o `package.json` da raiz (nenhuma dependência nova na raiz).
- **Modificar, renomear ou remover qualquer teste existente** dos 64 arquivos atuais.
- Cobertura de código medida (`coverage`) e meta numérica de cobertura — não é objeto desta SPEC.
- Confirmação de smoke visual em ambiente gráfico — pendência conhecida, ortogonal (ver Observações).

---

# Pré-requisitos

- [SPEC-0042](./SPEC-0042-test-split-scoped-verification.md) — `Done` (verificado: `- [x] Done`). Fixa a convenção `tests/helpers/` para módulo auxiliar não-suíte e a condição de validade D12 que esta SPEC precisa respeitar.
- [SPEC-0043](./SPEC-0043-desktop-voice-residues.md) — `Done` (verificado: `- [x] Done`). É a última fatia que tocou `renderer.js` e `speech-output.ts`; a paridade tem de partir do estado final delas (sétima réplica incluída).

Nenhum outro pré-requisito: esta SPEC não depende de comportamento novo de nenhum package.

---

# Critérios de Aceitação

1. Nenhum arquivo sob `apps/desktop/src/` ou `packages/*/src/` aparece no diff desta SPEC (`git diff --name-only` não lista nenhum).
2. Existe `apps/desktop/tests/helpers/renderer-harness.ts`, e ele **não** contém `describe(` nem `it(`.
3. O harness lê `src/renderer/index.html` e `src/renderer/renderer.js` **do disco**, em tempo de execução — nenhuma cópia do HTML ou do JS é embutida no teste (verificável: os dois caminhos aparecem literalmente no helper e nenhum trecho de `renderer.js` é transcrito nos arquivos de teste).
4. `apps/desktop/package.json` lista `jsdom` e `@types/jsdom` em `devDependencies`; `package.json` da raiz é byte-idêntico ao anterior.
5. `vitest.config.ts` da raiz é byte-idêntico ao anterior; nenhum arquivo `vitest.config.*` novo é criado; nenhum arquivo de teste desta SPEC usa o docblock `@vitest-environment`.
6. Existem os três arquivos de teste `apps/desktop/tests/renderer.speech-parity.test.ts`, `renderer.boot.test.ts` e `renderer.voice-triggers.test.ts`.
7. `pnpm --filter @atlas/desktop test` passa; `pnpm test` na raiz passa e reporta **67 arquivos** de teste (64 + 3).
8. O total de testes na raiz é **≥ 808** (a linha de base atual) e **nenhum** dos 64 arquivos de teste pré-existentes aparece modificado ou removido no diff.
9. Cada um dos três arquivos novos passa quando executado **sozinho**, e a suíte de `apps/desktop` passa sob `--sequence.shuffle` em **três sementes distintas** (mesmo critério da SPEC-0042/CA 25 — o harness cria uma janela por caso e não pode vazar estado entre casos).
10. O registro de paridade contém **exatamente** as nove entradas da tabela da Frente 2, e para cada uma existe ao menos um caso executado.
11. Para cada entrada de valor de retorno, a asserção compara o resultado das **duas** implementações entre si sobre a **mesma** entrada; nenhum literal de resultado esperado é escrito separadamente para o renderer (verificável por inspeção: o teste não contém um valor esperado por lado).
12. As tabelas cobrem, nomeadamente, os cenários mínimos listados na Frente 2, incluindo os quatro desfechos de `resolvePersistedVoiceSelection` e a fronteira `dropped` × `retained`.
13. **Prova negativa da paridade (obrigatória):** durante a implementação, uma mutação temporária de uma réplica do renderer (por exemplo, remover o filtro `localService === true` de `selectVoiceURI`) faz a suíte de paridade **falhar**; a mutação é revertida e o relatório final registra qual foi e qual teste falhou. Sem essa prova, a suíte não está demonstrada como gate.
14. O guarda da Frente 3 falha quando `speech-output.ts` ganha um export de valor não classificado — demonstrado do mesmo modo (export temporário ⇒ falha ⇒ revertido ⇒ registrado no relatório).
15. `NOT_MIRRORED` contém `piperModelIdOf` com justificativa em texto, e nenhuma entrada sem justificativa.
16. O teste de `id`s (Frente 4) extrai os identificadores do **fonte lido em runtime**, não de uma lista escrita à mão, e passa contra o `index.html` atual.
17. Submeter `#chat-form` com texto não vazio resulta em exatamente uma chamada a `atlas.chat.send` com o handle devolvido por `atlas.chat.open` no carregamento, e o texto da resposta do dublê aparece em `#chat-transcript`.
18. Sem voz nenhuma, o botão "🔊 Ouvir" criado para uma resposta tem `disabled === true` e `title` não vazio.
19. O botão "🔊 Ouvir" passa de desabilitado a habilitado **por cada um dos dois gatilhos, isoladamente**: (a) só a resposta do IPC de TTS (sem `voiceschanged`); (b) só `voiceschanged` (sem catálogo Piper).
20. Em modo Piper-only, os `value` das `<option>` de `#persona-voice-uri` (fora a opção vazia "Nenhuma (voz padrão)") são **todos** `piper:*`; em modo degradado, **nenhum** é `piper:*`.
21. Nenhum teste desta SPEC executa processo externo, abre socket, faz chamada de rede ou depende do binário do Piper/Electron instalado.
22. `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm format:check` passam na raiz.
23. `pnpm install --frozen-lockfile` continua funcionando (lockfile atualizado e versionado junto).

---

# Arquivos Esperados

```text
apps/desktop/tests/helpers/renderer-harness.ts        (novo)
apps/desktop/tests/renderer.speech-parity.test.ts     (novo — Frentes 2 e 3)
apps/desktop/tests/renderer.boot.test.ts              (novo — Frente 4)
apps/desktop/tests/renderer.voice-triggers.test.ts    (novo — Frente 5)
apps/desktop/package.json                             (devDependencies: jsdom, @types/jsdom)
pnpm-lock.yaml                                        (atualizado pelo install)
docs/implementation/specs/SPEC-0045-renderer-automated-coverage.md
```

Nenhum outro arquivo. Em particular: nada em `apps/desktop/src/`, nada em `packages/`, nada em `.github/`, nada na raiz além do lockfile.

---

# Componentes Impactados

- `@atlas/desktop` — **somente a suíte de testes** e o campo `devDependencies` do `package.json`.

Nenhum módulo do Module Catalog muda de responsabilidade. Nenhum módulo novo. Nenhum contrato público tocado. Nenhum comportamento do Atlas muda para o usuário.

---

# Interfaces Necessárias

Nenhuma interface pública nova; `@atlas/contracts` não é tocado.

Uma única interface **interna de teste**, no helper (forma indicativa — pode variar desde que o helper não contenha suítes e que cada caso monte a sua própria janela):

```ts
// apps/desktop/tests/helpers/renderer-harness.ts
export interface RendererFixture {
  readonly window: DOMWindow;
  readonly document: Document;
  /** Símbolos internos publicados pelo epílogo de teste (nunca por `src/`). */
  readonly internals: Record<string, unknown>;
  /** Chamadas registradas pelos dublês de IPC e de voz. */
  readonly calls: RendererCalls;
  /** Drena microtarefas até as promessas do carregamento assentarem. */
  flush(): Promise<void>;
  /** Fecha a janela jsdom (chamado em `afterEach`). */
  close(): void;
}

export function loadRenderer(options?: RendererFixtureOptions): Promise<RendererFixture>;
```

`RendererFixtureOptions` parametriza snapshot de status, Personas, fatos, vozes do SO, catálogo Piper, disponibilidade do Piper e o comportamento (resolver/rejeitar) de cada canal dublê.

---

# Fluxo Esperado

```text
index.html (disco)  ─┐
                     ├─► jsdom (runScripts: 'outside-only')
dublês window.atlas ─┘        │
+ speechSynthesis /           │  eval( renderer.js  +  epílogo de teste )
  SpeechSynthesisUtterance /  ▼
  Audio                  RendererFixture { window, document, internals, calls }
                               │
        ┌──────────────────────┼───────────────────────┬─────────────────────┐
        ▼                      ▼                       ▼                     ▼
  paridade                 guarda de                arranque             gatilhos de voz
  (tabela única            registro                 + ids + fiação       (IPC × voiceschanged,
   aplicada aos            (export novo             (painéis pintados)    Piper-only × degradado)
   dois lados)             não classificado
                            ⇒ falha)
```

---

# Estratégia de Implementação

1. Adicionar `jsdom` + `@types/jsdom` a `apps/desktop` (`pnpm --filter @atlas/desktop add -D …`) e confirmar `pnpm --filter @atlas/desktop typecheck`.
2. Escrever o harness até que um teste trivial ("carrega sem lançar") passe. **Este é o passo de risco**: se o carregamento exigir qualquer edição em `renderer.js`, **pare e reporte** (ver Restrições) — não edite.
3. Frente 4 (arranque, ids, painéis, fiação) — é o que valida o harness antes de construir o resto em cima dele.
4. Frente 2 (paridade), tabela por tabela, começando pelas funções puras de retorno simples e terminando na comparação comportamental `createSpeechOutput` ↔ `createSpeechOutputGlue`.
5. Frente 3 (guarda de registro).
6. Frente 5 (gatilhos de voz).
7. Provas negativas dos CA 13 e 14: mutar, ver falhar, reverter, registrar no relatório final.
8. Isolamento: cada arquivo sozinho + `--sequence.shuffle` em três sementes.
9. Fechar com `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` na raiz.

---

# Estratégia de Testes

Esta SPEC **é** a estratégia de testes de uma fatia anterior; o que se verifica aqui é a própria suíte:

- **Paridade por construção**: a expectativa de cada caso é o resultado da implementação TypeScript já testada, não um literal reescrito — logo a suíte não pode "concordar por engano" com uma réplica errada.
- **Prova negativa** (CA 13/14): uma suíte de paridade que nunca foi vista falhando não é gate. Mutação temporária, falha observada, reversão, registro.
- **Isolamento**: uma janela jsdom por caso, fechada em `afterEach`; a estabilidade sob `--sequence.shuffle` é critério (CA 9), pela mesma razão que na SPEC-0042 — estado global de renderer é exatamente o tipo de vazamento que ordem natural esconde.
- **Não-regressão de produção**: garantida estruturalmente pelo diff vazio em `src/` (CA 1), não por asserção.
- **Determinismo**: sem rede, sem processo externo, sem dependência do Piper/Electron instalados (CA 21).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- testes estiverem passando (raiz: 67 arquivos, ≥ 808 testes; suíte de desktop estável sob três sementes embaralhadas);
- as provas negativas dos CA 13 e 14 estiverem registradas no relatório final do `spec-implementer`;
- documentação atualizada;
- arquitetura preservada (zero diff em `src/`; ADR-0019 intacto);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` da raiz, `apps/desktop/CLAUDE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `PLATFORM_STATE.md`) é do passo `doc-sync` no fecho, **não** do `spec-implementer`. O implementador toca apenas o arquivo desta SPEC. O fecho deve obrigatoriamente corrigir, em `apps/desktop/CLAUDE.md`, a frase "Risco de deriva conhecido, não coberto por teste automatizado" e o candidato futuro "cobrir `renderer.js` por teste automatizado", que esta SPEC torna obsoletos, e retirar o candidato correspondente de `NEXT_CONTEXT.md`.

---

# Restrições

- **Zero diff em código de produção.** Se cobrir algo exigir editar `apps/desktop/src/` — inclusive só um comentário ou um `export` —, **pare e reporte**: isso é a fronteira que separa esta SPEC (higiene de teste, sem ADR) de uma mudança de stack do renderer (ADR novo, escalação humana).
- **Não introduzir bundler, `type="module"` no renderer, nem qualquer etapa de build** — ADR-0019 permanece literal.
- **Nenhuma dependência nova fora de `apps/desktop`**, e nenhuma em `dependencies`.
- **Não alterar `vitest.config.ts` da raiz** nem criar config por package (SPEC-0042/D12 e Fora do Escopo da SPEC-0042).
- **Não alterar nem remover teste existente.** Se um teste pré-existente começar a falhar, é achado — pare e reporte, não "ajuste".
- **Não expandir para cobertura comportamental dos painéis** além do único caso de fiação previsto na Frente 4, ainda que o harness torne tentador.
- Não criar módulos, Tools, Skills ou Personas; não tocar `@atlas/contracts`; não alterar a CI.

---

# Observações

- **Por que isto não exige ADR novo** (avaliação explícita, para o gate atacar): o registro em `NEXT_CONTEXT.md` e em `apps/desktop/CLAUDE.md` diz que cobrir o renderer "exige mudar a stack do renderer, portanto ADR novo". Essa avaliação pressupunha a rota de **modularizar/empacotar** o renderer para poder importá-lo. Esta SPEC não segue essa rota: o renderer continua sendo um `<script>` clássico, sem bundler, sem `export`, carregado por `loadFile` — literalmente o que o ADR-0019 decidiu — e o teste o carrega **como texto**, do disco, num DOM de teste. O que muda é a **stack de teste** (jsdom ao lado do Vitest), que é dev tooling, na mesma classe do `tsx` (ADR-0005) e do próprio Vitest (adotado sem ADR na SPEC-0001). A tensão com o Artigo 13 registrada no ADR-0019 é sobre *runtime de produto*; `jsdom` nunca entra no produto. Ver D1.
- **Limite conhecido do gate.** A guarda da Frente 3 fecha o caso "`speech-output.ts` ganhou um símbolo público e alguém o replicou (ou não) no renderer". Ela **não** detecta uma réplica de lógica vinda de outro módulo (por exemplo `piper-tts.ts`) nem lógica nova escrita direto no renderer sem contraparte em TS. Fica registrado, não assumido em silêncio: ao criar uma réplica de qualquer outro módulo, acrescente o par ao registro — o registro é a fonte, e ele é lido por quem escrever a próxima fatia de voz.
- **Candidato futuro nomeado**: cobertura comportamental dos painéis (CRUD de Persona pelo formulário, aplicação de permissões com concessão, esquecer fato, `ask`, serialização de gestos) sobre este mesmo harness — fatia própria, agora barata. Também segue nomeado, e **intocado por esta SPEC**, o candidato de quebrar `renderer.js` (1.112 linhas) e `core-bridge.ts` em arquivos menores (SPEC-0042/D8).
- **Ortogonal e não resolvida**: a pendência de **smoke visual nunca confirmado** (13 fatias, SPEC-0031 a 0043). Um DOM de teste prova lógica e fiação; não prova pixel nem som. Esta SPEC não deve ser lida como fechamento daquela pendência.
- Se a versão instalada do Vitest/jsdom exigir alguma acomodação (por exemplo, `URL.createObjectURL` ausente no jsdom para o caminho de playback do Piper), a acomodação é **do dublê no harness**, nunca do renderer.

---

# Checklist para IA

Antes de implementar:

- ler esta SPEC, `apps/desktop/CLAUDE.md` (seções "Renderer: duplicação deliberada" e "Voz (TTS)"), `src/speech-output.ts` e `src/renderer/renderer.js`;
- conferir a linha de base real: `pnpm test` na raiz (esperado 808 testes / 64 arquivos antes desta SPEC);
- confirmar que as nove entradas do registro correspondem ao estado atual dos dois arquivos.

Durante implementação:

- o renderer é **somente leitura**: nenhuma edição em `src/`, em nenhuma circunstância;
- expectativa de paridade nunca escrita à mão para o lado do renderer;
- uma janela jsdom por caso, fechada no `afterEach`;
- verificação escopada (`pnpm --filter @atlas/desktop test`) durante a iteração.

Após implementação:

- executar as duas provas negativas (CA 13/14) e registrá-las no relatório final;
- rodar cada arquivo novo isoladamente e a suíte de desktop sob três sementes embaralhadas;
- rodar os quatro comandos completos na raiz;
- validar os Critérios de Aceitação um a um.

---

# Resultado Esperado

`renderer.js` deixa de ser o único arquivo de produção do projeto sem nenhuma verificação automatizada. As oito réplicas de lógica de voz entre o renderer e `speech-output.ts` passam a ser comparadas entre si, caso a caso, a cada `pnpm test` — a deriva que passou seis fatias despercebida e obrigou a SPEC-0043 falharia imediatamente hoje. A próxima função pública de `speech-output.ts` não pode entrar sem que alguém declare, no registro, se ela é replicada ou não. O arranque do renderer, a existência de cada `id` que ele usa no `index.html` e os dois gatilhos assíncronos de voz ficam cobertos. Nada muda para o usuário, nada muda no produto: a stack do renderer decidida no ADR-0019 sai desta SPEC exatamente como entrou, e o custo total é uma `devDependency` de teste em `apps/desktop`.

---

# Decisões de design

**D1 — Cobrir o renderer sem tocar a stack do renderer; nenhum ADR novo**

- **Decisão**: carregar `renderer.js` **como está** (texto lido do disco, avaliado num DOM de teste), em vez de torná-lo importável. Nenhum ADR novo, nenhuma emenda; ADR-0019 preservado literalmente. Se a implementação provar que o carregamento exige editar `src/`, isso vira escalação (Restrições, passo 2 da Estratégia).
- **Porquê**: a avaliação anterior ("exige ADR") pressupunha modularizar/empacotar o renderer — aí sim, mudança da stack decidida no ADR-0019. A rota escolhida não muda nada do produto: sem bundler, sem `export`, sem `type="module"`, diff de produção vazio. O que entra é ferramenta de teste, mesma classe do Vitest (SPEC-0001, sem ADR) e do `tsx` (ADR-0005). Aplicando o teste da Constituição: é a rota mais simples (uma devDependency), mais transparente (a duplicação continua explícita) e mais sustentável (o gate passa a existir) das disponíveis.
- **Alternativa descartada**: escalar ao humano pedindo ADR de stack de renderer (bundler ou ESM no renderer, para eliminar a duplicação na raiz). Perdeu porque resolve um problema maior do que o registrado, ao custo de reabrir uma decisão `Accepted`, e porque deixa o risco **ativo** enquanto a discussão não acontece — a duplicação continuaria sem gate durante todas as fatias intermediárias. Se o humano quiser matar a duplicação de vez, esta SPEC não atrapalha: ela cobre o comportamento que a refatoração futura teria de preservar.

**D2 — jsdom instanciado programaticamente, como `devDependency` de `apps/desktop`, sem `environment` do Vitest**

- **Decisão**: `import { JSDOM } from 'jsdom'` dentro do harness, testes rodando no ambiente `node` default; `jsdom` + `@types/jsdom` em `apps/desktop`, nada na raiz, nenhum docblock `@vitest-environment`, nenhuma chave nova em `vitest.config.ts`.
- **Porquê**: a SPEC-0042/D12 declarou que a equivalência entre execução escopada e execução da CI vale **enquanto a config raiz contiver apenas `include`** — acrescentar `environment` a quebraria em silêncio, exatamente o modo de falha que D12 existe para prevenir. Instanciar jsdom no código do harness também deixa o ciclo de vida da janela explícito (uma por caso, fechada no `afterEach`), o que o CA 9 exige. E a dependência fica onde o app que a usa está, pela mesma analogia de lugar que o ADR-0019 aplicou ao `electron`.
- **Alternativa descartada**: `environment: 'jsdom'` na config raiz (ou por docblock). Perdeu: a config raiz quebra D12; o docblock evita isso mas delega o ciclo de vida da janela ao runner (uma janela por arquivo, estado global compartilhado entre casos) e depende de resolução do pacote de ambiente a partir da raiz, onde nada mais precisa dele.

**D3 — Símbolos internos extraídos por epílogo concatenado na avaliação, não por export no renderer**

- **Decisão**: o harness avalia `renderer.js` + um epílogo de teste que publica os símbolos escolhidos; `src/renderer/renderer.js` não ganha `export`, `module.exports`, `window.__internals` nem comentário-marcador.
- **Porquê**: é o que mantém o CA 1 (diff de produção vazio), que por sua vez é o que torna esta SPEC barata de revisar e mantém D1 de pé — assim que o teste exigisse mudança no arquivo de produção, a fronteira "higiene de teste × mudança de stack" ficaria borrada. Um epílogo concatenado é ainda o modo mais honesto: o arquivo testado é byte a byte o que a app carrega.
- **Alternativa descartada**: publicar os internos a partir do próprio renderer (`window.__rendererInternals = {…}` guardado por alguma flag). Perdeu por acoplar código de produção ao arranjo de teste e por criar superfície nova numa janela com `contextIsolation` — pequena, mas gratuita.

**D4 — Paridade por tabela de casos única aplicada aos dois lados**

- **Decisão**: cada caso é um dado só, executado nas duas implementações, com asserção `resultado_módulo === resultado_renderer`; nenhum literal esperado escrito por lado.
- **Porquê**: o defeito histórico é **divergência**, não incorreção — a réplica do renderer estava internamente coerente e passaria em qualquer teste escrito olhando só para ela. Só comparar uma contra a outra detecta esse modo de falha; expectativas duplicadas reintroduziriam, dentro do teste, exatamente a duplicação que o teste existe para vigiar.
- **Alternativa descartada**: escrever para o renderer uma suíte espelho da `speech-output.test.ts` (mesmos casos, expectativas literais copiadas). Perdeu porque uma cópia da suíte é a **oitava** réplica, com o mesmo risco de deriva — e a deriva do teste é pior que a do código, porque cria falsa confiança.

**D5 — Helpers privados de `speech-output.ts` cobertos transitivamente, sem exports novos**

- **Decisão**: `selectVoiceURI`/`selectLocalVoiceURI`/`hasLocalVoice` continuam privados; a paridade os cobre pelo par `createSpeechOutput` ↔ `createSpeechOutputGlue` (sequência de chamadas ao `synth` dublê + `isAvailable()`).
- **Porquê**: alargar a superfície pública de um módulo por conveniência de teste é débito de arquitetura permanente para um ganho temporário — e violaria o CA 1. O comportamento observável do glue já discrimina toda a diferença que importa (qual voz é escolhida, se cancela antes de falar, se fica mudo).
- **Alternativa descartada**: exportar os três helpers e compará-los diretamente. Perdeu por tocar `src/` (mata D1/CA 1) e por congelar como contrato público o que hoje é detalhe interno.

**D6 — Gate da próxima réplica por registro em runtime, não por comentário-marcador no renderer**

- **Decisão**: um registro de pares no arquivo de teste, mais uma lista `NOT_MIRRORED` justificada, verificados contra os exports reais de `speech-output.ts` e contra os símbolos extraídos do renderer.
- **Porquê**: o registro é executável — falha sozinho, na CI, sem depender de ninguém lembrar. E fica num lugar só, lido por quem escrever a próxima fatia de voz. É a diferença exata entre "convenção documentada" (que já falhou duas vezes) e gate.
- **Alternativa descartada**: convenção de comentário `// @mirrors speech-output.ts:<símbolo>` em cada réplica do renderer, com um teste que casa marcadores. Perdeu por três razões: exige diff em `src/` (mata o CA 1), exige um parser de comentários próprio, e um marcador ausente não falha nada — o mesmo buraco da convenção atual.

**D7 — Escopo fechado em paridade + arranque + gatilhos de voz; painéis ficam fora**

- **Decisão**: entregar o harness, a paridade, a guarda, o arranque (com um caso de fiação) e os gatilhos de voz; cobertura comportamental de CRUD de Persona, permissões, memória e `ask` fica registrada como fatia futura.
- **Porquê**: o risco registrado pelo `architecture-reviewer` é **deriva de duplicação**, e é isso que as Frentes 2 e 3 fecham por inteiro. As Frentes 4 e 5 existem por serem o mínimo que valida o harness e por cobrirem o outro modo de deriva silenciosa já observado no projeto (renderer↔`index.html` e os dois gatilhos assíncronos de voz). Ir além transformaria uma fatia de uma sessão numa reescrita de suíte, contra o critério "cabe numa sessão" do processo.
- **Alternativa descartada**: cobrir todos os painéis agora, aproveitando o harness recém-construído. Perdeu por custo e por risco de a SPEC não caber na janela de sessão — e porque, uma vez que o harness exista, a fatia seguinte é barata; adiar não paga juros aqui.

**D8 — Perfil `completo`**

- **Decisão**: classificar como `completo`.
- **Porquê**: a regra do `micro` é conjuntiva e falha em duas condições: o alvo não é "um package `packages/X/src` + opcionalmente a CLI" (é `apps/desktop`), e a SPEC introduz **dependência nova** e uma avaliação explícita de fronteira de ADR — precisamente o que o gate precisa atacar em modo completo. O template manda usar `completo` na dúvida, e o precedente direto (SPEC-0042, também higiene de teste) foi `completo`.
- **Alternativa descartada**: `micro`, argumentando que o diff se limita a `apps/desktop/tests` + um `package.json`. Perdeu porque o ponto sensível desta SPEC (D1, o juízo de que não há ADR novo) é exatamente o tipo de coisa que o modo leve do gate não vai perseguir.

**D9 — Prioridade `High`**

- **Decisão**: `High`, não `Critical` nem `Medium`.
- **Porquê**: é risco estrutural registrado por um gate, com **duas** materializações reais (a segunda custou a SPEC-0043 inteira), e cresce a cada fatia de voz nova — o que tira de `Medium`. Mas nada está quebrado hoje e nenhuma capacidade do produto está bloqueada — o que tira de `Critical`.
- **Alternativa descartada**: `Critical`, pelo histórico de reincidência. Perdeu porque `Critical` deve ficar reservado a defeito ativo ou bloqueio de fatia; aqui o dano é probabilístico e futuro.

**D10 — Item do Roadmap 1.5, como exceção consciente registrada**

- **Decisão**: ancorar em `Fase 1 — 1.5 Infraestrutura de Desenvolvimento (transversal)`, declarando a exceção, em vez de criar item novo no Roadmap ou consumir um item de Fase 2.
- **Porquê**: é o precedente literal da SPEC-0042, mesma natureza (infraestrutura que protege o desenvolvimento). Reivindicar item de Fase 2 seria falso — nada de voz, Persona ou interface avança para o usuário; criar item novo inflaria o Roadmap com higiene de desenvolvimento, que ele explicitamente não cataloga.
- **Alternativa descartada**: registrar como continuação do item 2.3 (voz), já que as réplicas são todas de voz. Perdeu porque a SPEC não entrega nem um grama de capacidade de voz — classificá-la ali distorceria a leitura de progresso da Fase 2.

**D11 — APIs de navegador ausentes no jsdom são dubladas pelo harness, e o playback nunca é exercitado de verdade**

- **Decisão**: `speechSynthesis`, `SpeechSynthesisUtterance`, `Audio` (e o que mais faltar, como `URL.createObjectURL`) são dublês instalados na janela pelo harness, que apenas registram as chamadas; nenhum teste assere sobre áudio reproduzido.
- **Porquê**: são exatamente as fronteiras que o projeto já isola por porta em `speech-output.ts` — dublá-las mantém o teste determinístico, offline e independente de Piper/Electron instalados (CA 21), e preserva honestamente o limite: som real continua sendo matéria do smoke visual humano, que esta SPEC não fecha.
- **Alternativa descartada**: usar as implementações reais do jsdom onde existirem. Perdeu por indeterminismo (o jsdom não implementa síntese de voz nem playback; erros de "not implemented" viram ruído) e por criar dependência do teste em detalhes de versão da biblioteca.
