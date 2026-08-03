# SPEC-0047 — Gate de paridade generalizado a `piper-tts.ts` e cobertura comportamental dos painéis no harness

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0047

---

**Título**

Extensão do gate mecânico de paridade renderer↔módulo aos exports de `apps/desktop/src/piper-tts.ts` (e `stt-engine.ts`) e cobertura comportamental dos painéis sobre o harness jsdom da SPEC-0045

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

`Fase 1 — 1.5 Infraestrutura de Desenvolvimento (transversal)`.

**Exceção consciente registrada**, com o precedente literal da [SPEC-0042](./SPEC-0042-test-split-scoped-verification.md) e da [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md): o item 1.5 lista hoje só remote e CI, ambos entregues, mas esta SPEC é da mesma natureza transversal — infraestrutura que protege o desenvolvimento, não capacidade nova da plataforma. Ela **não** consome nenhum item da Fase 2: nada de voz, Persona, memória ou permissões avança para o usuário. O Roadmap não precisa de item novo.

---

# Objetivo

Quando esta SPEC estiver concluída deverá existir:

1. Um **gate mecânico de paridade que não é mais específico de um módulo**: além de `apps/desktop/src/speech-output.ts`, os **exports de valor** de `apps/desktop/src/piper-tts.ts` e de `apps/desktop/src/stt-engine.ts` passam a ser enumerados em runtime e obrigatoriamente classificados — replicados no renderer (com par registrado e ao menos um caso executado) ou explicitamente não replicados, com justificativa em texto.
2. A **décima réplica hoje sem cobertura** amarrada por esse gate: `resolveDefaultPiperVoiceURI` (`piper-tts.ts`) ↔ `computeDefaultPiperVoiceURI` (`renderer.js`), comparada caso a caso pela mesma disciplina de tabela única da SPEC-0045 — hoje a própria `renderer.js` documenta essa função como "resíduo sem cobertura automatizada".
3. Uma **cobertura comportamental dos painéis** do renderer sobre o harness `apps/desktop/tests/helpers/renderer-harness.ts`, cobrindo os cinco alvos nomeados em SPEC-0045/D7: CRUD de Persona pelo formulário, painel de permissões, painel de memória, `ask` de tiro único e a serialização de gestos — com foco no invariante que o projeto já quebrou na prática: **em recusa, o estado visível volta do estado real e nada é perdido em silêncio**.

Sem mudança persistida em `apps/desktop/src/` nem em `packages/*`. Sem bundler. Sem ADR novo. Sem mudar o que a CI verifica.

---

# Motivação

Duas dívidas registradas, ambas herdadas da SPEC-0045 e nomeadas em `docs/05-context/NEXT_CONTEXT.md` ("Próximo Trabalho", candidatos abertos) e em `apps/desktop/CLAUDE.md` ("Candidatos futuros já nomeados"):

**(a) O gate de paridade é específico de `speech-output.ts`.** É o achado 3 do `architecture-reviewer` no gate da SPEC-0045, e a própria SPEC-0045 o registra nas Observações ("Limite conhecido do gate"): uma réplica vinda de **outro** módulo segue protegida só por convenção documentada. Isso não é hipotético — a réplica existe hoje: `computeDefaultPiperVoiceURI` no renderer duplica `resolveDefaultPiperVoiceURI` de `piper-tts.ts`, com o comentário no fonte admitindo "resíduo sem cobertura automatizada". É exatamente o modo de falha que a SPEC-0043 pagou: uma cópia derivou por acidente e sobreviveu a seis fatias, porque o único mecanismo de detecção era inspeção humana de diff. O gate existe; falta generalizá-lo do módulo para a **classe de módulos** de que o renderer replica lógica.

**(b) Os painéis não têm cobertura comportamental.** SPEC-0045/D7 fechou deliberadamente o escopo em paridade + arranque + gatilhos de voz, deixando os painéis fora e registrando a fatia futura — "agora barata", porque o harness já existe. Os painéis concentram invariantes de UX que o projeto declarou explicitamente (`apps/desktop/CLAUDE.md`, "Serialização de gestos"): um gesto por vez; em recusa, transcript e conversa intactos e listas recarregadas do estado real, "o usuário nunca vê um seletor divergente do Core". Hoje esses invariantes são garantidos por leitura de código do lado do renderer — a garantia testável existe só no `core-bridge`.

Rastreabilidade documental:

- **PRD**, *Critérios de Qualidade* — "consistência de comportamento" e "facilidade de manutenção"; *Requisitos Não Funcionais* — "preparado para crescimento incremental"; *Critérios de Aceitação do Produto* — "evoluir sem comprometer sua arquitetura". Os painéis cobertos servem requisitos já no PRD: *Personalização* ("o usuário deve poder selecionar sua Persona preferida"), *Memória* ("o usuário deve poder consultar, atualizar e remover informações armazenadas"), *Execução* ("executar tarefas autorizadas"), *Transparência*.
- **Constituição**, Artigo 1 (nada de comportamento não documentado assumido) e o teste padrão: réplicas sem gate e invariantes de UX sem teste são o oposto de sustentável.
- **SPEC-0045**, Observações ("Limite conhecido do gate") e D7 ("Candidato futuro nomeado") — as duas frentes desta SPEC são literalmente o que aquela SPEC registrou como não entregue.

O que esta SPEC **não** faz: não elimina a duplicação renderer↔módulo (ADR-0019 intacto), não fecha a pendência de smoke visual e não detecta lógica nova escrita direto no renderer sem contraparte em TS (ver Fora do Escopo e Observações).

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Requisitos Funcionais (Personalização, Memória, Execução, Transparência), Requisitos Não Funcionais, Critérios de Qualidade
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 1, 13, 14; Emendas v1.1 e v1.2
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — nenhum módulo muda de responsabilidade
- [Development Guide](../../04-engineering/DevelopmentGuide.md)
- [ClaudeCodeAutomation](../../04-engineering/ClaudeCodeAutomation.md) — "Verificação escopada" (SPEC-0042) e "Ramo micro"
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 1, item 1.5
- [ADR-0019 — stack Electron para `apps/desktop`](../../06-adr/ADR-0019-desktop-electron-stack.md) — renderer sem bundler, `<script>` clássico; **preservado sem uma vírgula de mudança**
- [ADR-0020 — persistência de Persona e vínculo de voz](../../06-adr/ADR-0020-persona-persistence-voice-binding.md)
- [ADR-0021 — Piper como motor de voz local](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — **intacto**; esta SPEC só observa `piper-tts.ts`, não o altera
- [ADR-0022 — whisper.cpp como motor de STT local](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) — **intacto**; idem para `stt-engine.ts`
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) (`Done`) — harness, registro de paridade, gate; D7 e "Limite conhecido do gate" são a origem desta SPEC
- [SPEC-0046](./SPEC-0046-desktop-voice-input-stt.md) (`Done`) — última fatia a tocar `renderer.js` e o harness (relógio injetável, dublês de mídia)
- [SPEC-0042](./SPEC-0042-test-split-scoped-verification.md) (`Done`) — convenção `tests/helpers/` e a condição de validade D12 (config raiz só com `include`)
- [SPEC-0038](./SPEC-0038-desktop-permission-roots-gui.md) / [SPEC-0039](./SPEC-0039-desktop-persona-authoring.md) / [SPEC-0034](./SPEC-0034-desktop-visual-memory-management.md) / [SPEC-0032](./SPEC-0032-desktop-confirm-steps-adapters.md) — as fatias que criaram os painéis cobertos aqui
- `apps/desktop/CLAUDE.md` — seções "Renderer: duplicação deliberada", "Serialização de gestos", "Painéis"

---

# Escopo

## Frente 1 — gate de paridade generalizado a `piper-tts.ts` e `stt-engine.ts`

Em `apps/desktop/tests/renderer.speech-parity.test.ts` (arquivo existente, estendido — mesmo registro, mesma disciplina):

- Substituir a enumeração de exports de um módulo único por uma **lista de módulos-fonte vigiados**, hoje exatamente três: `speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`. Para cada módulo, o teste enumera em runtime os **exports de valor** (funções e constantes; tipos não existem em runtime) e falha se algum não estiver **nem** no registro de pares **nem** na lista `NOT_MIRRORED`, cada entrada desta com justificativa em texto não vazia.
- `NOT_MIRRORED` passa a carregar o módulo de origem por entrada (o mesmo nome poderia existir em dois módulos). Entradas esperadas hoje: `piperModelIdOf` (`speech-output.ts`, já existente), `createPiperTts` (`piper-tts.ts`, main process), `createSttEngine` (`stt-engine.ts`, main process).
- Acrescentar ao registro o par **`resolveDefaultPiperVoiceURI` (`piper-tts.ts`) ↔ `computeDefaultPiperVoiceURI` (`renderer.js`)**, `kind: 'direct'`, com tabela de casos própria. O registro passa a ter **10** entradas.
- Tabela de casos do par novo, aplicada às **duas** implementações sobre a **mesma** entrada, com asserção `resultado_renderer === resultado_módulo` (nenhum literal esperado escrito por lado): catálogo vazio; catálogo só com `pt_BR-faber-medium`; catálogo com `pt_BR-faber-medium` **não** em primeiro lugar por ordem de `id`; catálogo sem `faber`, fora de ordem de `id` (prova a ordenação determinística); catálogo com um item só, sem `faber`; catálogo com `id`s que diferem só por sufixo (`…-low` × `…-medium`).
- Estender o **epílogo de teste** do harness (`apps/desktop/tests/helpers/renderer-harness.ts`) para publicar `computeDefaultPiperVoiceURI` — lista fixa escrita no helper, como as demais; **nenhum `export`, marcador ou comentário entra em `src/`**.
- Manter as regras já existentes do gate: toda entrada do registro aponta para um símbolo que o harness conseguiu extrair, e toda entrada tem ao menos um caso executado.

## Frente 2 — painéis: CRUD de Persona pelo formulário

Novo arquivo `apps/desktop/tests/renderer.persona-crud.test.ts`:

- **Criar**: abrir o formulário por `#persona-new`, preencher os campos, submeter `#persona-form` ⇒ exatamente uma chamada a `atlas.persona.create` com o input montado a partir dos campos (incluindo `communicationRules` quebrada por linha, com linhas vazias descartadas, e `voiceURI` **ausente** quando o `<select>` está na opção vazia); formulário some (`hidden === true`); as superfícies de Persona recarregam (`#persona-select` e `#persona-list` repintados a partir do estado real).
- **Editar**: clicar em "Editar" de uma Persona custom em `#persona-list` chama `atlas.persona.describe` e preenche os campos; submeter chama `atlas.persona.update` com o `id` correto (e **não** `create`).
- **Update da Persona ativa** (`closedSessions` não vazio no retorno): `#chat-transcript` é limpo, recebe o aviso de nova conversa e uma nova sessão é aberta (`atlas.chat.open` chamado de novo).
- **Apagar**: clicar em "Apagar" chama `atlas.persona.delete` com o `id`; recusa (promessa rejeitada) escreve o aviso em `#persona-form-error` e **recarrega as listas** — a Persona recusada continua listada.
- **Recusa no submit**: `create`/`update` rejeitando escreve `⚠️ …` em `#persona-form-error`, **não** limpa `#chat-transcript`, **não** abre sessão nova, e recarrega as superfícies.
- **Persona embutida**: item de Persona `builtin` em `#persona-list` não oferece botões "Editar"/"Apagar".

## Frente 3 — painéis: permissões

Novo arquivo `apps/desktop/tests/renderer.permissions-panel.test.ts`:

- **Rascunho local**: "Adicionar" raiz de leitura/escrita com valor não vazio acrescenta um item à lista correspondente e limpa o input; com valor vazio ou só espaços, não acrescenta nada; "Remover" tira o item pelo índice certo (com duas raízes de mesmo prefixo, remove a clicada). Nenhum desses gestos chama `atlas.permissions.select`.
- **Aplicar (sucesso)**: `#permissions-apply` chama `atlas.permissions.select` **uma vez**, com o rascunho corrente completo (`readRoots`/`writeRoots`, substituição — nunca merge); `#chat-transcript` é limpo, recebe o aviso de permissões alteradas, uma nova sessão é aberta e o status é recarregado.
- **Aplicar (recusa)**: promessa rejeitada ⇒ aviso em `#permissions-error`, `#chat-transcript` **intacto**, nenhuma sessão nova aberta, e as listas voltam a refletir o status real (o rascunho recusado **não** permanece na tela).

## Frente 4 — painéis: memória e `ask`

Novo arquivo `apps/desktop/tests/renderer.memory-ask.test.ts`:

- **Memória**: cada fato pintado em `#memory-list` traz `id`, texto, data, origem e categoria (e o sufixo de projeto quando há `subject`); "Esquecer" chama `atlas.memory.forget` com o `id` do fato, desabilita o próprio botão e recarrega a lista; `forget` que rejeita **ainda assim** recarrega a lista (o `finally` do renderer) e não deixa exceção não tratada; `#memory-refresh` recarrega a lista a partir do dublê.
- **`ask`**: submeter `#ask-form` com objetivo não vazio chama `atlas.ask` uma vez e pinta em `#ask-result` o traço de `steps` (`🔧 <tool> → <outcome>`, com o marcador `[blocked]`/`[declined]` quando `denialKind` está presente), a resposta e as linhas `💡 lembrado:`; objetivo vazio ou só espaços **não** chama `atlas.ask`.

## Frente 5 — serialização de gestos

Novo arquivo `apps/desktop/tests/renderer.gesture-serialization.test.ts`.

**Lista de controles serializados** — a mesma nos dois primeiros bullets, e a que o CA 19 cobra:

```text
#chat-input · #chat-send · #persona-select · #persona-new ·
botões de #persona-list · #persona-form-save · #persona-form-cancel ·
#read-root-add · #write-root-add · #permissions-apply
```

- **Turno de chat em voo** (dublê de `chat.send` com resolução controlada pelo teste): **todos** os controles da lista acima ficam desabilitados; ao assentar o turno, todos voltam a habilitado.
- **`ask` em voo**: exatamente a **mesma lista**, mesma verificação — desabilitados durante o round-trip de `atlas.ask`, reabilitados ao assentar.
- **Falha do turno**: `chat.send` rejeitando escreve o aviso no transcript e **reabilita** todos os controles da lista (nenhum gesto fica travado por erro).
- **Guardas de entrada**: submeter `#chat-form` com texto vazio, ou sem sessão aberta (`chat.open` rejeitando no carregamento), não chama `atlas.chat.send`.

Se, ao implementar, algum controle da lista se revelar **não** coberto pela serialização real do renderer, isso é **achado**: registrar no relatório final e corrigir a lista nesta SPEC — nunca "consertar" o renderer (ver Restrições).

---

# Fora do Escopo

- **Qualquer alteração persistida em `apps/desktop/src/` ou `packages/*/src`** — inclusive comentários, marcadores de duplicação e `export` acrescentado "só para o teste". O diff atribuível a esta SPEC é **vazio** nesses caminhos (CA 1). A única exceção sancionada são as mutações **temporárias e revertidas** das provas negativas (CA 8/9), que jamais sobrevivem ao commit.
- **Eliminar a duplicação renderer↔módulo** (bundler, `type="module"`, mover a lógica replicada para arquivo compartilhado) — mudaria a stack fixada pelo ADR-0019 ⇒ ADR novo ⇒ escalação humana.
- **Detectar lógica nova escrita direto no renderer sem contraparte em TS** (a outra metade do achado 3 do reviewer): não há fonte mecânica contra a qual comparar. Segue por convenção documentada, com o limite registrado nas Observações.
- **Vigiar módulos além dos três nomeados** (`confirm-port.ts`, `steps-view.ts`, `permission-grant-dialog.ts`, `persona-delete-dialog.ts`, `media-permission.ts`, `core-bridge.ts`): são consumidos **só** pelo main process, o renderer não replica nada deles. Acrescentá-los produziria uma lista `NOT_MIRRORED` inteira sem valor de gate.
- **Cobrir `floatChunksToInt16`/`describeSttFailure`** por paridade: são lógica **exclusiva** do renderer, sem contraparte em `stt-engine.ts`, já cobertas diretamente por `renderer.voice-input.test.ts` (SPEC-0046). Não entram no registro de pares.
- **Reescrever, renomear ou reorganizar os testes existentes de renderer** (`renderer.boot.test.ts`, `renderer.voice-triggers.test.ts`, `renderer.voice-input.test.ts`) e **qualquer teste dos demais arquivos da suíte**. `renderer.speech-parity.test.ts` e `renderer-harness.ts` são estendidos — os casos e pares existentes seguem intactos.
- **Quebrar `renderer.js` ou `core-bridge.ts` em arquivos menores** (SPEC-0042/D8) — mudança estrutural de produção, SPEC própria.
- **Cobrir o `<select>` de voz do formulário de Persona** (política Piper-only, `<option>` retida): já é da SPEC-0045 (Frente 5) e da SPEC-0043 — esta SPEC não reabre esse terreno.
- **Teste do `preload.cjs`, do `main.ts` e de qualquer áudio realmente reproduzido** — exigem Electron/hardware reais.
- **Alterar `vitest.config.ts` da raiz** (qualquer chave além de `include`), `package.json` da raiz, os scripts da raiz ou `.github/workflows/ci.yml`.
- **Dependência nova**, em qualquer package ou na raiz — `jsdom` já está em `apps/desktop` desde a SPEC-0045.
- Cobertura de código medida (`coverage`) e meta numérica de cobertura.
- Confirmação de smoke visual/sonoro em ambiente gráfico — pendência conhecida, ortogonal (ver Observações).

---

# Pré-requisitos

- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece o harness, o registro de paridade e o gate que esta SPEC generaliza.
- [SPEC-0046](./SPEC-0046-desktop-voice-input-stt.md) — `Done` (verificado no arquivo: `- [x] Done`). É a última fatia a tocar `renderer.js` e o harness (relógio injetável e dublês de mídia); a cobertura parte do estado final dela, **incluindo** a correção pós-fecho commitada em `c1b9ba3`.

Nenhum outro pré-requisito: esta SPEC não depende de comportamento novo de nenhum package.

---

# Critérios de Aceitação

> **Convenção de medição (vale para os CA 1, 22 e 23):** todo critério de diff e de contagem é medido **contra o commit-base registrado no passo 1 da Estratégia de Implementação** (`git rev-parse HEAD` antes de qualquer edição) e diz respeito **apenas ao diff atribuível a esta SPEC** — nunca ao estado absoluto do repositório. Alteração alheia presente na árvore no início não é objeto desta SPEC nem a invalida: deve ser reportada, não incorporada nem revertida.

1. O diff atribuível a esta SPEC (contra o commit-base do passo 1) não contém **nenhum** arquivo sob `apps/desktop/src/` ou `packages/*/src/` — verificável por `git diff --name-only <commit-base>..HEAD`.
2. A lista de módulos-fonte vigiados pelo gate contém exatamente `speech-output.ts`, `piper-tts.ts` e `stt-engine.ts`, e o teste enumera os exports de valor **em runtime** (via `import * as`), não por lista escrita à mão.
3. Para cada um dos três módulos, todo export de valor está classificado: no registro de pares (`kind: 'direct'`) ou em `NOT_MIRRORED` com `moduleSource` e justificativa não vazia.
4. `NOT_MIRRORED` contém, no mínimo, `piperModelIdOf` (`speech-output`), `createPiperTts` (`piper-tts`) e `createSttEngine` (`stt-engine`), cada um com justificativa em texto.
5. O registro de pares contém **exatamente 10** entradas: as 9 da SPEC-0045 mais `resolveDefaultPiperVoiceURI ↔ computeDefaultPiperVoiceURI`.
6. A tabela do par novo cobre, nomeadamente, os seis casos listados na Frente 1, e cada caso é executado nas **duas** implementações sobre a **mesma** entrada, com asserção de igualdade entre os dois resultados — nenhum literal de resultado esperado é escrito para o lado do renderer.
7. O epílogo do harness publica `computeDefaultPiperVoiceURI`, e `apps/desktop/src/renderer/renderer.js` é byte-idêntico ao do commit-base.
8. **Prova negativa do par novo (obrigatória):** uma mutação **temporária** de `computeDefaultPiperVoiceURI` no renderer (por exemplo, remover a preferência por `pt_BR-faber-medium`) faz a suíte de paridade **falhar**; a mutação é **revertida** antes de qualquer commit e o relatório final registra qual foi e qual teste falhou. Esta é a **exceção sancionada** à regra de somente-leitura de `src/` (ver Restrições): a proibição alcança o **diff final/persistido**, não o estado transitório da árvore de trabalho durante a prova.
9. **Prova negativa do gate generalizado (obrigatória):** um export de valor **temporário** acrescentado a `piper-tts.ts` (e, em segunda execução, a `stt-engine.ts`) faz o guarda **falhar**; ambas as mutações são revertidas antes de qualquer commit e registradas no relatório final. Mesma exceção sancionada do CA 8.
10. Existem os quatro arquivos novos `apps/desktop/tests/renderer.persona-crud.test.ts`, `renderer.permissions-panel.test.ts`, `renderer.memory-ask.test.ts` e `renderer.gesture-serialization.test.ts`.
11. Todos os itens verificáveis das Frentes 2, 3, 4 e 5 têm ao menos um caso de teste correspondente; nenhum item das Frentes 2–5 fica sem cobertura.
12. Submeter o formulário de Persona sem `id` chama `atlas.persona.create` exatamente uma vez e `atlas.persona.update` **nenhuma**; com `id` preenchido, o inverso.
13. Recusa de `create`/`update`/`delete` de Persona: `#persona-form-error` contém `⚠️`, `#chat-transcript` permanece com o conteúdo anterior, `atlas.chat.open` **não** é chamado de novo, e `atlas.persona.list` é chamado de novo (recarga do estado real).
14. Update com `closedSessions` não vazio: `#chat-transcript` não contém o texto do turno anterior, contém o aviso de nova conversa, e `atlas.chat.open` foi chamado uma segunda vez.
15. Aplicar permissões com sucesso resulta em exatamente uma chamada a `atlas.permissions.select` com o rascunho corrente completo; em recusa, `#permissions-error` contém `⚠️`, `#chat-transcript` fica intacto e as listas voltam a refletir o `getStatus` do dublê.
16. "Adicionar" com string vazia ou só espaços não altera as listas nem chama `atlas.permissions.select`.
17. "Esquecer" chama `atlas.memory.forget` com o `id` do fato clicado (não do primeiro da lista) e provoca nova chamada a `atlas.memory.list`, inclusive quando `forget` rejeita.
18. `#ask-result` contém, para um snapshot com `steps` (um deles com `denialKind`), `learned` e texto: a linha `🔧 … → …` com o marcador entre colchetes, o texto da resposta e a linha `💡 lembrado: …`; `ask` com objetivo vazio não chama `atlas.ask`.
19. Com um turno de chat em voo, **todos os controles da lista nomeada no cabeçalho da Frente 5** têm `disabled === true`; após o turno assentar (sucesso **ou** falha), todos têm `disabled === false`. O mesmo vale, sobre a **mesma lista**, para um `ask` em voo.
20. Nenhum teste desta SPEC executa processo externo, abre socket, faz chamada de rede ou depende de Piper/whisper/Electron instalados.
21. Cada arquivo novo passa quando executado **sozinho**, e a suíte de `apps/desktop` passa sob `--sequence.shuffle` em **três sementes distintas** (uma janela jsdom por caso, fechada em `afterEach`).
22. **Delta medido contra a linha de base observada no passo 1** (esperada: **939 testes / 70 arquivos**, commit `c1b9ba3`): `pnpm test` na raiz passa e reporta **exatamente +4 arquivos** de teste e **+20 ou mais** testes em relação a essa base; **nenhum** arquivo de teste pré-existente é removido; os únicos pré-existentes modificados são `apps/desktop/tests/renderer.speech-parity.test.ts` e `apps/desktop/tests/helpers/renderer-harness.ts`. Se a base observada divergir de 939/70, prevalece a base observada e a divergência é reportada.
23. `vitest.config.ts` da raiz, `package.json` da raiz, `apps/desktop/package.json` e `pnpm-lock.yaml` não aparecem no diff atribuível a esta SPEC (nenhuma dependência nova).
24. `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm format:check` passam na raiz.

---

# Arquivos Esperados

```text
apps/desktop/tests/renderer.speech-parity.test.ts          (modificado — Frente 1)
apps/desktop/tests/helpers/renderer-harness.ts             (modificado — epílogo + dublês, se necessário)
apps/desktop/tests/renderer.persona-crud.test.ts           (novo — Frente 2)
apps/desktop/tests/renderer.permissions-panel.test.ts      (novo — Frente 3)
apps/desktop/tests/renderer.memory-ask.test.ts             (novo — Frente 4)
apps/desktop/tests/renderer.gesture-serialization.test.ts  (novo — Frente 5)
docs/implementation/specs/SPEC-0047-renderer-parity-gate-and-panel-coverage.md
```

**Nenhum outro arquivo no diff atribuível a esta SPEC** (medido contra o commit-base do passo 1). Em particular: nada em `apps/desktop/src/`, nada em `packages/`, nada em `.github/`, nada na raiz (nem lockfile). Arquivo alheio já modificado na árvore no início do trabalho não pertence a esta SPEC: reportar, não incorporar nem reverter.

---

# Componentes Impactados

- `@atlas/desktop` — **somente a suíte de testes**.

Nenhum módulo do Module Catalog muda de responsabilidade. Nenhum módulo novo. Nenhum contrato público tocado. Nenhum comportamento do Atlas muda para o usuário.

---

# Interfaces Necessárias

Nenhuma interface pública nova; `@atlas/contracts` não é tocado.

Formas **internas de teste** (indicativas — podem variar desde que preservem as regras acima):

```ts
// apps/desktop/tests/renderer.speech-parity.test.ts
type WatchedModule = 'speech-output' | 'piper-tts' | 'stt-engine';

interface ReplicaEntry {
  readonly moduleSymbol: string;
  readonly moduleSource: WatchedModule;
  readonly rendererSymbol: string;
  readonly kind: 'direct' | 'transitive';
  readonly casesKey: string;
}

interface NotMirroredEntry {
  readonly moduleSource: WatchedModule;
  readonly symbol: string;
  readonly reason: string;
}

/** Namespaces importados em runtime, um por módulo vigiado — a fonte da enumeração. */
const WATCHED_MODULES: Readonly<Record<WatchedModule, Record<string, unknown>>>;
```

O harness mantém a interface `RendererFixture`/`loadRenderer` da SPEC-0045; mudam apenas a lista fixa de símbolos do epílogo (mais `computeDefaultPiperVoiceURI`) e, se algum caso das Frentes 2–5 exigir, opções de dublê adicionais (por exemplo, controlar a resolução de `chat.send`/`ask` a partir do teste). Nenhuma opção existente é removida ou tem semântica alterada.

---

# Fluxo Esperado

```text
speech-output.ts ─┐
piper-tts.ts      ├─► import * as (runtime) ─► enumeração de exports de valor
stt-engine.ts     ┘                                   │
                                                      ▼
                               registro de pares  ×  NOT_MIRRORED
                                       │                   │
              não classificado ────────┴───────────────────┴────► FALHA
                                       │
                                       ▼
                          tabela única por par ─► módulo × renderer (igualdade)

renderer-harness (jsdom) ─► fixture ─┬─► Persona: create/update/delete + recusa
                                     ├─► Permissões: rascunho / aplicar / recusa
                                     ├─► Memória: forget + refresh · ask: traço
                                     └─► Serialização: em voo ⇒ tudo desabilitado
```

---

# Estratégia de Implementação

1. **Registrar o commit-base** (`git rev-parse HEAD`) e a **linha de base real** da suíte (`pnpm test` na raiz — esperado 939 testes / 70 arquivos, commit `c1b9ba3`), anotando ambos no relatório final: toda medição de diff e de contagem desta SPEC é relativa a esses dois valores. Conferir também se a árvore está limpa; se não estiver, reportar o que já estava modificado (não incorporar, não reverter).
2. Reler `renderer.speech-parity.test.ts`, o harness e as seções do renderer cobertas.
3. Frente 1, em duas etapas: (a) generalizar a enumeração para os três módulos e classificar tudo em `NOT_MIRRORED`, sem par novo — a suíte deve continuar verde; (b) acrescentar o par `resolveDefaultPiperVoiceURI ↔ computeDefaultPiperVoiceURI` com a tabela de casos e o símbolo no epílogo.
4. Provas negativas dos CA 8 e 9: mutar temporariamente, ver falhar, **reverter**, e confirmar por `git status` que a árvore voltou ao estado sem mutação antes de seguir.
5. Frente 2 (Persona), começando pelos caminhos de sucesso e fechando nos de recusa — os de recusa são o alvo real.
6. Frente 3 (permissões), mesma ordem.
7. Frente 4 (memória e `ask`) — os mais baratos; servem de aquecimento se a Frente 2 revelar atrito no harness.
8. Frente 5 (serialização), que exige controlar a resolução de `chat.send`/`ask` a partir do teste: se o harness não permitir hoje, estender as **opções** do harness (nunca `src/`).
9. Isolamento: cada arquivo sozinho + `--sequence.shuffle` em três sementes.
10. Fechar com `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` na raiz e conferir o diff final contra o commit-base (CA 1, 22, 23).

---

# Estratégia de Testes

Esta SPEC **é** estratégia de teste; o que se verifica é a própria suíte:

- **Paridade por construção** (herdada da SPEC-0045/D4): a expectativa de cada caso é o resultado da implementação TypeScript já testada, nunca um literal reescrito para o renderer.
- **Prova negativa obrigatória** (CA 8/9): gate que nunca foi visto falhando não é gate. A mutação é transitória por definição, e a reversão é verificada antes de qualquer commit.
- **Painéis testados pelo comportamento observável** (chamadas de IPC registradas + DOM resultante), nunca por introspecção de variáveis internas do renderer — exceto os símbolos que o epílogo já publica para a paridade.
- **Caminho de recusa em pé de igualdade com o de sucesso**: para Persona e permissões, cada gesto tem caso de sucesso **e** de rejeição; o invariante "listas recarregadas do estado real, transcript intacto" é o que a suíte existe para travar.
- **Isolamento**: uma janela jsdom por caso, fechada no `afterEach`; estabilidade sob `--sequence.shuffle` é critério (CA 21).
- **Não-regressão de produção**: garantida estruturalmente pelo diff vazio em `src/` (CA 1), não por asserção.
- **Determinismo**: sem rede, sem processo externo, sem dependência de binários instalados (CA 20).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- testes estiverem passando (delta do CA 22 sobre a base observada no passo 1: +4 arquivos, ≥ +20 testes; suíte de desktop estável sob três sementes embaralhadas);
- as provas negativas dos CA 8 e 9 estiverem registradas no relatório final do `spec-implementer`, com confirmação explícita de que **todas as mutações foram revertidas**;
- documentação atualizada;
- arquitetura preservada (diff atribuível a esta SPEC vazio em `src/` e em `packages/*`; ADR-0019/0021/0022 intactos);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` da raiz, `apps/desktop/CLAUDE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `PLATFORM_STATE.md`) é do passo `doc-sync` no fecho, **não** do `spec-implementer`. O implementador toca apenas o arquivo desta SPEC. O fecho deve obrigatoriamente:

- **(a)** atualizar, em `apps/desktop/CLAUDE.md`, a frase do "Limite conhecido do gate" — o eixo "réplica vinda de outro módulo **vigiado**" passa a ser coberto, restando "lógica nova escrita direto no renderer sem contraparte em TS" e "réplica de módulo fora da lista vigiada";
- **(b)** retirar de `apps/desktop/CLAUDE.md` e de `NEXT_CONTEXT.md` os dois candidatos que esta SPEC consome (gate sobre `piper-tts.ts` e cobertura comportamental dos painéis);
- **(c)** **não** editar `apps/desktop/src/renderer/renderer.js`: o comentário "resíduo sem cobertura automatizada" sobre `computeDefaultPiperVoiceURI` fica factualmente desatualizado **por decisão** (D5); registrar a divergência como resíduo documental nas lições, para a próxima fatia que legitimamente toque aquele arquivo;
- **(d)** registrar nas lições que o número de arquivos de teste dependentes do harness (que lê **um** `renderer.js` do disco) sobe de 4 para 8, encarecendo a fatia futura de quebrar `renderer.js` em arquivos menores (SPEC-0042/D8).

---

# Restrições

- **Zero diff persistido em código de produção.** Se cobrir algo exigir editar `apps/desktop/src/` de forma **permanente** — inclusive só um comentário —, **pare e reporte**: é a fronteira que separa higiene de teste de mudança de stack do renderer (ADR novo, escalação humana).
- **Exceção única e sancionada**: as mutações **temporárias** das provas negativas (CA 8/9) em `renderer.js`, `piper-tts.ts` e `stt-engine.ts`. Existem para ver o gate ficar vermelho, devem ser revertidas imediatamente, verificadas por `git status` limpo antes de qualquer commit, e registradas no relatório final. Nenhuma outra edição de `src/` é permitida — temporária ou não.
- **Não introduzir bundler, `type="module"` no renderer, nem qualquer etapa de build** — ADR-0019 permanece literal.
- **Nenhuma dependência nova**, em nenhum package nem na raiz; `pnpm-lock.yaml` fora do diff.
- **Não alterar `vitest.config.ts` da raiz** nem criar config por package (SPEC-0042/D12).
- **Não alterar nem remover teste existente** além das duas extensões previstas (`renderer.speech-parity.test.ts`, `renderer-harness.ts`), e mesmo nessas: nenhum caso ou par existente é removido ou enfraquecido. Se um teste pré-existente começar a falhar, é achado — pare e reporte, não "ajuste".
- **Não expandir a cobertura de painéis** além dos itens enumerados nas Frentes 2–5, ainda que o harness torne tentador.
- Não criar módulos, Tools, Skills ou Personas; não tocar `@atlas/contracts`; não alterar a CI.

---

# Observações

- **Por que isto continua sem exigir ADR**: vale integralmente o argumento da SPEC-0045/D1 — o renderer segue `<script>` clássico sem bundler, carregado como texto do disco; o que muda é só a suíte de testes. `piper-tts.ts` e `stt-engine.ts` são apenas **lidos** (via `import * as`), nunca alterados de forma persistida: ADR-0021 e ADR-0022 saem desta SPEC como entraram.
- **Limites remanescentes do gate, agora dois e explícitos**: (i) lógica nova escrita direto no renderer **sem contraparte em TS** continua fora — não há fonte contra a qual comparar; (ii) **réplica de um módulo fora da lista vigiada** silencia o gate. O eixo (ii) é o custo consciente de D2: a lista é a fonte, ampliá-la é uma linha por módulo novo que o renderer passe a replicar, e a mitigação enquanto isso é apenas convenção documentada — exatamente como antes desta SPEC, só que restrita a um conjunto muito menor de módulos plausíveis. Fica registrado, não assumido em silêncio.
- **Custo colateral registrado**: o harness lê **um** `renderer.js` do disco. Antes desta SPEC, 4 arquivos de teste dependiam dessa premissa (`renderer.boot`, `renderer.speech-parity`, `renderer.voice-triggers`, `renderer.voice-input`); depois, 8. Isso **encarece** a fatia futura de quebrar `renderer.js` em arquivos menores (SPEC-0042/D8), que passará a reapontar o harness com o dobro de consumidores atrás. É custo aceito conscientemente — a alternativa (adiar a cobertura até a refatoração) deixaria os painéis sem gate por tempo indeterminado —, mas deve ir para as lições no fecho (DoD, item d).
- **Resíduo documental conhecido**: o comentário de `renderer.js` sobre `computeDefaultPiperVoiceURI` ("resíduo sem cobertura automatizada") fica factualmente desatualizado ao fim desta SPEC, porque o CA 1 proíbe editar `src/`. É dívida deliberada (D5), de custo zero em comportamento; corrigir na próxima fatia que legitimamente toque aquele arquivo.
- **Ortogonal e não resolvida**: a pendência de **smoke visual/sonoro nunca confirmado** (SPEC-0031 a 0046). Um DOM de teste prova lógica e fiação; não prova pixel nem som. Esta SPEC não deve ser lida como fechamento daquela pendência.
- **Ponto de atrito antecipado**: a Frente 5 precisa de um turno de chat (e de um `ask`) que **não** resolvam até o teste mandar. Se o harness atual não expuser isso, a extensão é nas **opções** do harness (uma promessa controlada pelo teste no dublê), jamais no renderer.
- Se `jsdom` não implementar algo que um painel exercite (por exemplo, comportamento de `<form>` ou de `focus()`), a acomodação é do **dublê no harness**, nunca do renderer — regra herdada da SPEC-0045/D11.

---

# Checklist para IA

Antes de implementar:

- ler esta SPEC, a SPEC-0045 (Frentes 2/3 e D4/D6), `apps/desktop/CLAUDE.md` (seções "Renderer: duplicação deliberada", "Serialização de gestos", "Painéis"), `tests/renderer.speech-parity.test.ts`, `tests/helpers/renderer-harness.ts`;
- registrar commit-base e linha de base da suíte (passo 1 da Estratégia — esperado 939 testes / 70 arquivos);
- confirmar, no fonte, os exports de valor atuais dos três módulos vigiados (o registro reflete o estado real, não esta SPEC).

Durante implementação:

- `src/` é **somente leitura**, com a **única** exceção das mutações temporárias das provas negativas (CA 8/9), revertidas na hora e jamais commitadas;
- expectativa de paridade nunca escrita à mão para o lado do renderer;
- uma janela jsdom por caso, fechada no `afterEach`;
- verificação escopada (`pnpm --filter @atlas/desktop test`) durante a iteração.

Após implementação:

- executar as provas negativas (CA 8/9), reverter, confirmar árvore limpa e registrar no relatório final;
- rodar cada arquivo novo isoladamente e a suíte de desktop sob três sementes embaralhadas;
- rodar os quatro comandos completos na raiz;
- conferir o diff final contra o commit-base (CA 1, 22, 23);
- validar os Critérios de Aceitação um a um.

---

# Resultado Esperado

O gate de paridade deixa de ser um dispositivo específico de `speech-output.ts` e passa a ser uma regra sobre a **classe** de módulos de que o renderer replica lógica: nenhum export de valor novo em `speech-output.ts`, `piper-tts.ts` ou `stt-engine.ts` entra sem que alguém declare, no registro, se é replicado ou não. A décima réplica — a única hoje admitidamente sem cobertura, no comentário do próprio fonte — passa a ser comparada caso a caso a cada `pnpm test`. E os cinco painéis do desktop ganham cobertura comportamental sobre o harness já existente, com o caminho de **recusa** verificado em pé de igualdade com o de sucesso: em nenhum deles o usuário fica com uma lista divergente do Core, um transcript apagado por engano ou um controle travado depois de um erro. Nada muda para o usuário, nada muda no produto: a stack do renderer decidida no ADR-0019 sai desta SPEC exatamente como entrou, e o custo total é código de teste — nenhuma dependência nova, nenhum arquivo de produção alterado no diff final.

---

# Decisões de design

**D1 — Generalizar o gate a uma lista de módulos-fonte vigiados, em vez de acrescentar um caso especial para `piper-tts.ts`**

- **Decisão**: substituir a enumeração de um módulo por uma lista explícita de módulos vigiados (`speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`), com `moduleSource` também nas entradas de `NOT_MIRRORED`.
- **Porquê**: o achado 3 do reviewer não é sobre o Piper, é sobre o gate ser específico demais; o registro já tinha o campo `moduleSource` (por causa de `PIPER_VOICE_PREFIX`), então generalizar custa uma lista e fecha a classe inteira do problema. Teste da Constituição: mais modular (a regra deixa de citar um módulo) e mais sustentável (o próximo módulo replicado é uma linha).
- **Alternativa descartada**: enumerar só os exports de `piper-tts.ts`, à letra do pedido. Perdeu porque deixaria `stt-engine.ts` — módulo já existente, do qual o renderer é vizinho direto — fora do gate, reproduzindo em três meses exatamente o achado que estamos fechando agora, ao custo de uma linha economizada hoje.

**D2 — Vigiar três módulos, e não todos os `src/*.ts` do desktop**

- **Decisão**: a lista vigiada contém só os módulos dos quais o renderer replica ou poderia plausivelmente replicar lógica; `confirm-port.ts`, `steps-view.ts`, os diálogos, `media-permission.ts` e `core-bridge.ts` ficam fora.
- **Porquê**: esses módulos são consumidos **só** pelo main process (fronteira dura documentada em `apps/desktop/CLAUDE.md`); incluí-los produziria uma `NOT_MIRRORED` de dezenas de entradas com justificativa idêntica — ruído que enfraquece o gate, porque classificar deixaria de ser um ato de pensamento e viraria burocracia copiada. O eixo residual (réplica vinda de módulo fora da lista) fica registrado nas Observações, não assumido em silêncio.
- **Alternativa descartada**: vigiar automaticamente todo módulo de `src/`. Perdeu por transformar cada export novo do main process num atrito de teste sem valor, e por criar incentivo a classificar no automático — o modo de falha clássico de gates barulhentos.

**D3 — Entregar os cinco painéis nesta fatia, com casos enumerados na SPEC**

- **Decisão**: cobrir Persona, permissões, memória, `ask` e serialização de gestos numa fatia só, com a lista de casos fixada nas Frentes 2–5 e o resto explicitamente fora.
- **Porquê**: o recorte era meu; o critério aplicado foi "o que ainda não tem gate mecânico algum e já produziu bug real". Persona e permissões carregam o invariante de recusa (o mesmo de que a SPEC-0043 nasceu); memória e `ask` são baratíssimos (≈4 casos) e deixá-los para depois pagaria o custo fixo de outra SPEC por um ganho de escopo irrelevante; serialização é o invariante que amarra os quatro. O harness já existe — a SPEC-0045/D7 previu exatamente que esta fatia seria barata.
- **Alternativa descartada**: cobrir só Persona + permissões agora e deixar memória, `ask` e serialização para uma SPEC-0048. Perdeu porque o custo dominante aqui é reler o renderer e montar fixtures, que seria pago duas vezes; e porque deixar a serialização de fora esvaziaria as duas frentes entregues (o estado "em voo" atravessa os dois painéis).

**D4 — Cobertura por comportamento observável (IPC registrado + DOM), não por introspecção de estado interno**

- **Decisão**: os testes de painel asseveram sobre chamadas registradas nos dublês e sobre o DOM resultante; o epílogo do harness continua publicando **só** os símbolos da paridade, sem ganhar variáveis de estado do renderer (`chatTurnInFlight`, `pendingReadRoots`, `chatSession`…).
- **Porquê**: o que precisa ficar travado é o contrato com o usuário e com o main process, não a forma interna do renderer — que a fatia futura de quebrar `renderer.js` em arquivos menores (SPEC-0042/D8) vai reorganizar. Testar estado interno tornaria essa refatoração cara sem proteger nada a mais.
- **Alternativa descartada**: publicar as variáveis de serialização no epílogo e assertar sobre elas. Perdeu por congelar detalhe interno como se fosse contrato, e por ser mais frágil: `disabled` nos elementos é o que o usuário de fato encontra.

**D5 — Nenhuma edição persistida no comentário desatualizado de `renderer.js`**

- **Decisão**: aceitar que o comentário "resíduo sem cobertura automatizada" sobre `computeDefaultPiperVoiceURI` fique factualmente desatualizado, registrando o resíduo nas Observações e nas lições (DoD, item c).
- **Porquê**: o CA 1 (diff de produção vazio) é o que sustenta a inexistência de ADR nesta linha de SPECs desde a 0045; abrir exceção "só para um comentário" borra exatamente a fronteira que torna esta família de SPECs barata de revisar. Um comentário desatualizado é dano documental mínimo e reversível.
- **Alternativa descartada**: corrigir o comentário junto. Perdeu porque custaria a propriedade mais valiosa da SPEC (diff de produção verificável mecanicamente) por um ganho cosmético.

**D6 — Estender `renderer.speech-parity.test.ts` em vez de criar um arquivo de paridade novo**

- **Decisão**: o gate generalizado e o par novo entram no arquivo existente, que mantém o nome.
- **Porquê**: o valor do registro está em ser **um** lugar só — foi assim que a SPEC-0045 o desenhou (D6) e é o que faz quem escreve a próxima fatia de voz encontrá-lo. Dois arquivos de paridade recriariam a dispersão que o registro existe para evitar. O nome `speech-parity` segue descrevendo o assunto (toda réplica vigiada hoje é de voz, entrada ou saída).
- **Alternativa descartada**: criar `renderer.piper-parity.test.ts` separado e/ou renomear o arquivo para `renderer.module-parity.test.ts`. Perdeu: o arquivo separado fragmenta o registro; o rename produz churn de histórico e quebra as referências já escritas em `apps/desktop/CLAUDE.md` e nas SPECs 0045/0046, sem ganho funcional.

**D7 — Perfil `completo`**

- **Decisão**: classificar como `completo`.
- **Porquê**: a regra do `micro` é conjuntiva e falha na primeira condição — o alvo não é "um package `packages/X/src` + opcionalmente `apps/cli/src`", é `apps/desktop`. Soma-se que a SPEC **modifica** artefatos existentes (não é puramente aditiva) e carrega um juízo de fronteira de ADR (D1/observação sobre ADR-0021/0022) que o modo leve do gate não perseguiria. O template manda usar `completo` na dúvida, e os dois precedentes diretos de higiene de teste (SPEC-0042 e SPEC-0045) foram `completo`.
- **Alternativa descartada**: `micro`, argumentando que o diff se limita a `apps/desktop/tests` e não toca `@atlas/contracts` nem cria módulo. Perdeu porque a fronteira textual do `micro` fala em package, não em app, e porque dispensar o `spec-validator` numa SPEC cujo produto **é** verificação seria o pior lugar possível para economizar um passo.

**D8 — Prioridade `Medium`**

- **Decisão**: `Medium`, não `High` nem `Low`.
- **Porquê**: a SPEC-0045 foi `High` porque o risco já havia se materializado duas vezes e crescia a cada fatia de voz. Aqui o grosso daquele risco já está coberto: sobra um eixo estreito (réplica de outro módulo — exatamente uma função hoje) mais cobertura de painéis que nunca produziu defeito registrado. Nada está quebrado, nada está bloqueado, e a Fase 2 não depende disto — mas é dívida nomeada em dois documentos vivos, o que tira de `Low`.
- **Alternativa descartada**: `High`, por continuidade com a SPEC-0045. Perdeu porque herdar prioridade de uma SPEC anterior é justamente o modo de a escala perder significado; o risco residual aqui é menor por construção — a SPEC-0045 removeu a maior parte dele.

**D9 — Item do Roadmap 1.5, como exceção consciente registrada**

- **Decisão**: ancorar em `Fase 1 — 1.5 Infraestrutura de Desenvolvimento (transversal)`, declarando a exceção, em vez de criar item novo ou consumir item da Fase 2.
- **Porquê**: é o precedente literal das SPECs 0042 e 0045, mesma natureza (infraestrutura que protege o desenvolvimento). Reivindicar item de Fase 2 seria falso — nada avança para o usuário.
- **Alternativa descartada**: criar um item de Roadmap "cobertura de teste do desktop". Perdeu por inflar o Roadmap com higiene de desenvolvimento, que ele explicitamente não cataloga.

**D10 — Critérios de diff e de contagem ancorados a um commit-base e a uma base observada, não ao estado absoluto do repositório**

- **Decisão**: introduzir a "Convenção de medição" no topo dos Critérios de Aceitação — CA 1, 22 e 23 medem o **diff atribuível a esta SPEC** contra o commit-base registrado no passo 1, e o CA 22 exprime **delta** (+4 arquivos, ≥ +20 testes) sobre a base observada, com 939/70 (`c1b9ba3`) como valor esperado e a base observada prevalecendo em caso de divergência.
- **Porquê**: critério redigido como estado absoluto do repositório é reprovável por causa alheia — uma alteração de terceiro na árvore, ou um teste vindo de outra fatia, faria o `spec-validator` reprovar uma SPEC correta e travar o pipeline. Ancorar ao commit-base mede exatamente o que esta SPEC controla, e é a mesma disciplina do invariante real ("nenhum arquivo pré-existente removido").
- **Alternativa descartada**: manter números absolutos (`74 arquivos`, `≥ 958 testes`) e `git diff --name-only` sobre o repositório inteiro. Perdeu porque acopla a validação a um estado do mundo que a SPEC não controla — precisamente o defeito apontado no gate, e que já se materializou entre o rascunho e a revisão (938 → 939).

**D11 — Mutação temporária de `src/` declarada como exceção sancionada, com a proibição alcançando o diff persistido**

- **Decisão**: reconciliar CA 8/9 com as Restrições e o Checklist declarando, nos três lugares, que a **única** edição admitida em `src/` é a mutação transitória das provas negativas, revertida na hora, verificada por `git status` e registrada no relatório — e que "zero diff em produção" se refere ao **diff final/persistido**.
- **Porquê**: como estava, a SPEC exigia (CA 8/9) e proibia (Restrições/Checklist) a mesma ação, o que na prática empurraria o implementador a pular a prova negativa ou a parar e escalar por contradição do texto — em ambos os casos perdendo justamente a demonstração de que o gate fecha. Nomear a exceção mantém o invariante que importa (nada de produção sobrevive ao commit) sem tornar o texto autocontraditório.
- **Alternativa descartada**: remover as provas negativas para preservar a regra absoluta. Perdeu porque um gate nunca visto vermelho é exatamente a "convenção documentada" que já falhou duas vezes neste projeto; a prova negativa é o núcleo do valor desta SPEC, não um extra.
