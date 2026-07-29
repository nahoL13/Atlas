# SPEC-0039 — Desktop: criar/editar/apagar Personas custom pela GUI, com voz real vinculada

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0039

---

**Título**

Desktop: CRUD de Personas custom pela interface gráfica — formulário completo (paridade com os 8 campos de `Persona`), persistência em arquivo JSON atrás de porta injetável no Persona Service, e vínculo real entre a voz escolhida e o TTS

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

`Fase 2 — 2.4 Persistência e Gerência Local` (linha de Persona), com tangência ao `Fase 2 — 2.3 Voz` (saída por voz).

**Exceção consciente registrada**: o item 2.4 já está marcado "entregue por inteiro" no `Roadmap.md` (l. 159-163) pela trinca SPEC-0034/0037/0038, e a linha de Persona daquele item pedia literalmente "seleção/troca de Persona em runtime" — que a SPEC-0037 entregou. Esta SPEC **estende** aquela linha com a fatia que a SPEC-0037 nomeou explicitamente como "fatia seguinte, precedida de brainstorming humano e ADR" (Fora do Escopo / Observações da SPEC-0037), agora autorizada pelo [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) (Status: Accepted). A base no PRD é direta (Personalização, l. 129-135). A atualização do texto do Roadmap (reabrir 2.4 com a linha nova marcada como entregue, ou registrá-la como extensão) é passo de fecho (`doc-sync`), não do implementador.

---

# Objetivo

Ao final desta SPEC, o painel de Persona da janela do `@atlas/desktop` deixa de ser apenas um seletor entre as duas Personas embutidas e passa a permitir **criar, editar e apagar Personas custom**, persistidas em disco e disponíveis em qualquer reabertura da app:

- um formulário com **todos os 8 campos** de `Persona` (nome, tom, formalidade, idioma, estilo, regras de comunicação, voz, emoção), mais a escolha de uma **voz real do sistema operacional** entre as vozes locais disponíveis;
- Personas custom aparecem no mesmo seletor da SPEC-0037, podem ser escolhidas como Persona ativa e, uma vez ativas, **falam com a voz escolhida** quando o usuário usa o botão "🔊 Ouvir" do chat;
- `jarvis`/`neutral` continuam embutidas, imutáveis e somente-leitura na interface;
- o Persona Service (`@atlas/persona`) passa a ter uma **porta de storage injetável** (molde do Memory Service, ADR-0011) com adapter de arquivo JSON default, e ganha `create`/`update`/`delete` em `PersonaService`;
- `Persona` ganha `voiceURI?: string`, e o TTS (`apps/desktop/src/speech-output.ts`) passa a preferir essa voz, caindo — **fail-closed** — na seleção determinística de hoje (1ª voz local) quando ela estiver ausente ou não existir mais na máquina, nunca numa voz de rede.

---

# Motivação

O PRD estabelece, em Personalização (l. 129-135): **"O sistema deve permitir diferentes Personas"**, "O sistema deve preservar capacidades independentemente da Persona utilizada" e "O usuário deve poder selecionar sua Persona preferida". Hoje "diferentes Personas" significa exatamente duas, embutidas em código (`packages/persona/src/personas.ts`): o usuário pode **escolher**, mas não pode **definir** a identidade com que o Atlas fala com ele. A SPEC-0037 entregou a escolha e registrou, nas Observações, o levantamento completo do que faltava para a criação — e por que aquilo era escalação obrigatória (Emenda v1.1): estado persistente novo, responsabilidade do Persona Service no Module Catalog e revisita ao ADR-0010.

Essa escalação foi cumprida: o brainstorming humano aconteceu (`docs/superpowers/specs/2026-07-28-desktop-persona-creation-design.md`) e produziu o **ADR-0020 (Accepted)**, que decide as duas mudanças estruturais — (a) porta de storage injetável no Persona Service, no molde exato do ADR-0011; (b) `Persona.voiceURI?` vinculando a Persona a uma voz real do SO, com fallback fail-closed para a seleção determinística das SPECs 0035/0036. Esta SPEC é a **transcrição executável** dessas decisões: não inventa arquitetura nova, realiza a já registrada.

O segundo problema resolvido aqui é a inércia do campo `voice`. Desde o ADR-0010, `voice`/`emotion` são "slots declarativos e inertes"; a saída de voz das SPECs 0035/0036 escolhe deterministicamente a primeira voz local do SO, sem olhar a Persona ativa. O resultado é uma Persona que "tem voz" no papel e nenhuma identidade sonora de fato. O ADR-0020(b) fecha essa lacuna pelo menor caminho possível — um campo opcional no contrato e uma camada de preferência **antes** do fallback já existente —, preservando literalmente a garantia da SPEC-0036 (nunca falar por voz marcada como remota).

---

# Referências

- [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) (Accepted) — **fonte estrutural desta SPEC**: (a) `PersonaStorage` injetável no Persona Service, não promovida a `@atlas/contracts`; default `createFilePersonaStorage(path)`; sem storage, comportamento idêntico ao de hoje; embutidas imutáveis; (b) `Persona.voiceURI?`, elegibilidade restrita a vozes `localService === true`, fallback fail-closed
- `docs/superpowers/specs/2026-07-28-desktop-persona-creation-design.md` — design detalhado aprovado no brainstorming (10 decisões + desenho por camada)
- [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) — molde reusado: persistência atrás de porta injetável, load-once + write-through, porta interna ao package dono
- [ADR-0010](../../06-adr/ADR-0010-persona-injected-generation.md) — Persona injetada na geração; **parcialmente superado** pelo ADR-0020 quanto à premissa "registro embutido"; a composição do system prompt **não muda**
- [ADR-0003](../../06-adr/ADR-0003-core-composition-root.md) — `packages/core` é o composition root; `apps/*` importam implementação só de `@atlas/core`
- [ADR-0006](../../06-adr/ADR-0006-config-source-precedence.md) — `flags > env > arquivo > defaults` (slot `arquivo` segue não implementado); precedência que `resolveDataDir` preserva integralmente (D17)
- [ADR-0019](../../06-adr/ADR-0019-desktop-electron-stack.md) — Electron; Core só no main process; renderer isolado; sem bundler
- `docs/02-product/ProductRequirementsDocument.md` — Personalização (l. 129-135); Consistência entre Personas (l. 179)
- `docs/03-architecture/ModuleCatalog.md` — Persona Service (l. 838-883): "Pode utilizar: configuração da Persona … recursos de voz quando disponíveis"; "Deve controlar: nome, tom, formalidade, idioma, estilo, **voz**, emoção simulada, comportamento comunicacional"
- `docs/00-project/ArchitectureConstitution.md` — Artigo 2 (uma única Persona percebida), Artigo 3 (Core é o único orquestrador), Artigo 8 (transparência: nenhuma ação relevante sem o usuário perceber), Artigo 11 (Memória tem autoridade exclusiva sobre estado persistente **de conhecimento**), Artigo 15 / Emenda v1.1
- [SPEC-0008](SPEC-0008-persona-service.md) (Done) — Persona Service atual (`get`/`has`/`list`/`systemPrompt`)
- [SPEC-0037](SPEC-0037-desktop-runtime-persona-switch.md) (Done) — painel de Persona estendido aqui: `listPersonas`/`selectPersona`/`selectedPersonaId`, re-export de catálogo em `@atlas/core` (D4), estado de módulo do bridge (D3), encerramento de sessões vivas na troca (D5), recusa com turno em voo (D9)
- [SPEC-0034](SPEC-0034-desktop-visual-memory-management.md) (Done) — molde de operação **stateless** sobre estado durável (`resolveMemorySnapshot`/`forgetFact`)
- [SPEC-0035](SPEC-0035-desktop-voice-output-tts.md) / [SPEC-0036](SPEC-0036-desktop-tts-local-voice-only.md) (Done) — TTS: `createSpeechOutput`, `VoiceInfo.localService`, fail-closed, `refreshSpeakButton`/`voiceschanged`, duplicação deliberada do algoritmo puro no glue do renderer
- [SPEC-0038](SPEC-0038-desktop-permission-roots-gui.md) (Done) — rastreio generalizado de operação em voo (`inFlightOperations`/`busySessions`), `withSelections`, `__resetBridgeStateForTests`, **porta de confirmação dedicada** (`permission-grant-dialog.ts`, `GrantConfirmPort` injetável com default fail-closed)
- [SPEC-0021](SPEC-0021-live-memory-prompt-recomposition.md) (Done) — `personaPrompt` é **estático** dentro de um Core já criado (razão pela qual editar a Persona ativa encerra as sessões vivas)

---

# Escopo

## 1. `@atlas/contracts` (`src/persona.ts`)

- `Persona` ganha `readonly voiceURI?: string` — **aditivo/opcional**; Personas embutidas não o setam;
- novo tipo `PersonaInput` — todos os campos de `Persona` **exceto `id`**, obrigatórios, salvo `voiceURI?`;
- `PersonaService` ganha três membros **síncronos** (molde de `get`/`has`/`list`):
  - `create(input: PersonaInput): Persona`
  - `update(id: string, input: PersonaInput): Persona`
  - `delete(id: string): void`
- nenhum outro contrato muda; `PersonaStorage` **não** sobe a este package (regra do `MemoryStorage`, ADR-0011).

## 2. `@atlas/persona` — storage injetável + CRUD

- nova porta interna `src/storage/persona-storage.ts`: `PersonaStorage { load(): readonly Persona[]; save(personas: readonly Persona[]): void }` e `createFilePersonaStorage(path): PersonaStorage` — arquivo JSON `{ "personas": [...] }`, criado sob demanda (diretório incluído); arquivo ausente ⇒ `[]`; JSON inválido/forma inesperada ⇒ `PersonaError` **citando o caminho do arquivo** na mensagem (falha alta, **nunca** descarta Personas do usuário — ver Observações, correção A6);
- `createPersonaService(deps: { storage?: PersonaStorage } = {})`:
  - **sem** `storage`: comportamento idêntico ao atual (só embutidas); `create`/`update`/`delete` lançam `PersonaError` ("serviço de Persona sem storage: criação/edição indisponível");
  - **com** `storage`: carrega as custom **uma vez** na criação (load-once); `get`/`has`/`list` enxergam embutidas **+** custom (embutidas primeiro, custom em ordem de carga); `create`/`update`/`delete` mutam em memória e chamam `storage.save` imediatamente (write-through);
- regras impostas **dentro do módulo** (Artigo 3: a borda antecipa, o módulo garante):
  - `create` deriva o `id` por **slug** de `input.name` (minúsculas, não-alfanuméricos → `-`, colapso/aparo de `-`), com sufixo numérico em colisão (`-2`, `-3`, …) contra embutidas **e** custom; slug vazio ⇒ `PersonaError`;
  - `name` obrigatório e não vazio após `trim`; os demais campos textuais obrigatórios como propriedades (podem ser string vazia, paridade com a `neutral` embutida); `communicationRules` obrigatório (pode ser vazio); `voiceURI` opcional, string não vazia quando presente;
  - `update`/`delete` sobre `id` **embutido** ⇒ `PersonaError`; sobre `id` inexistente ⇒ `PersonaError`;
  - `update` **preserva o `id`** (renomear não muda o `id`, para não invalidar seleção/edições posteriores);
- `systemPrompt` **inalterado** (voz e emoção seguem fora do prompt — ADR-0010);
- exports novos do package: `createFilePersonaStorage`, tipo `PersonaStorage`.

## 3. `@atlas/core` — composição opt-in, validação de id, resolução de `dataDir` e caminho canônico

- `CreateAtlasDeps` ganha `personaStorage?: PersonaStorage` (molde exato de `memoryStorage?`); `createAtlas` compõe `createPersonaService(deps.personaStorage !== undefined ? { storage: deps.personaStorage } : {})` **antes** do `loadConfig`;
- `loadConfig(override, options?: { readonly personaIds?: readonly string[] })` — parâmetro **aditivo/opcional**; ausente ⇒ valida contra `PERSONA_IDS` exatamente como hoje. `createAtlas` passa `{ personaIds: personaService.list() }`, de modo que uma Persona custom só é aceita como `config.persona` quando o storage foi injetado;
- **`resolveDataDir(override: AtlasConfigOverride = {}): string`** — módulo novo `packages/core/src/config/data-dir.ts`. Resolve **somente** o `dataDir`, pela precedência de sempre (`flags > env > defaults`, hoje materializada como `override.dataDir ?? defaultConfig().dataDir`), e valida que é string não vazia, lançando `InvalidConfigError` com a **mesma** mensagem de hoje. **Não lê nem valida o campo `persona`** e portanto **nunca** aciona `PERSONA_IDS` (correção B1). A precedência vive **uma única vez** nesse módulo: `loadConfig` passa a consumi-la internamente (helpers `mergeDataDir`/`isValidDataDir` + a constante da mensagem, internos a `packages/core/src`, **não** exportados do package), preservando byte a byte o acúmulo de `issues` que ele faz hoje (nada de falhar no primeiro problema);
- **`personaStoragePath(dataDir: string): string`** — função **pura**, sem IO, que devolve `join(dataDir, 'personas.json')`. É o **único** lugar do repositório onde esse caminho é derivado (correção A4.3): `apps/desktop` a consome, e uma futura fatia de CLI consome a mesma função — nunca um `join` reinventado, sob pena de as Personas ficarem invisíveis entre as duas interfaces. Recebe o `dataDir` **já resolvido pelo chamador** (`resolveDataDir(...)` no app; `config.dataDir` de dentro do Core), para nunca divergir do config efetivo daquela chamada (correção A1) **e nunca depender da validade da Persona ativa** (correção B1);
- `packages/core/src/index.ts` estende o **re-export de catálogo** da SPEC-0037 (D4) com `createFilePersonaStorage`, o tipo `PersonaStorage`, `resolveDataDir` e `personaStoragePath`;
- nenhuma outra mudança em `createAtlas`/`defaultConfig`/`AtlasPlatform`; `AtlasConfig` **não** ganha campo.

## 4. `apps/desktop` — bridge

**Config efetivo, sempre (correção A1) — por uma via que não valida `persona` (correção B1).** O caminho do arquivo de Personas é derivado **do config efetivo daquela chamada**, nunca de um `loadConfig()` sem override — e nunca por uma via que precise saber se a Persona ativa existe:

- helper interno único `personaStorageFor(configOverride: AtlasConfigOverride = {}): PersonaStorage` — `createFilePersonaStorage(personaStoragePath(resolveDataDir(withSelections(configOverride))))`, usando `resolveDataDir` e `personaStoragePath` re-exportados por `@atlas/core` (§3) e o mesmo `withSelections` da SPEC-0038 (para qualquer seleção em vigor entrar na resolução, hoje e no futuro). **Não** chama `loadConfig`: achar o arquivo de storage é independente de a Persona ativa ser válida (ver Decisão D17);
- helper interno `defaultPersonaService(configOverride = {})`: `createPersonaService({ storage: personaStorageFor(configOverride) })` — default de `deps.personaService` de **todas** as funções de Persona (inclusive `listPersonas`/`selectPersona`, que hoje usam `createPersonaService()`);
- as **quatro** funções de CRUD (`describePersona`/`createPersona`/`updatePersona`/`deletePersona`) e as duas já existentes (`listPersonas`/`selectPersona`) recebem `deps.configOverride?: AtlasConfigOverride` — ponto de injeção **equivalente** ao das cinco funções que sobem o Core (`core-bridge.ts:290, 344, 416, 496, 522`), para que um teste (ou um chamador futuro) com `dataDir` temporário isolado veja o **mesmo** arquivo em toda a superfície;
- as cinco funções que sobem o Core passam a injetar `personaStorage: personaStorageFor(configOverride)` em `createAtlas` (ao lado do `confirm` já injetado por `main.ts`) — derivado do **mesmo** `configOverride` que já alimenta `withSelections`, de modo que Core e CRUD nunca apontem para arquivos diferentes;

**Superfície nova** (todas com `deps.personaService?` e `deps.configOverride?` injetáveis, no molde da SPEC-0037):

- `PersonaOption` ganha `readonly builtin: boolean` (aditivo);
- `describePersona(id, deps?): PersonaDetail` — síncrono, para preencher o formulário de edição;
- `createPersona(input, deps?): Promise<PersonaDetail>` — **não** seleciona a Persona criada, **não** encerra sessão alguma;
- `updatePersona(id, input, deps?): Promise<PersonaMutation>` — recusa `id` embutido; se `id` for a Persona **efetivamente ativa** (ver abaixo), recusa havendo operação em voo e, ao aplicar, encerra todas as sessões de chat vivas (devolvidas em `closedSessions`); se não for a ativa, aplica sem encerrar nada (`closedSessions: []`);
- `deletePersona(id, deps?): Promise<void>` — recusa `id` embutido, recusa a Persona **efetivamente ativa**, e exige **consentimento explícito** (abaixo);

**Persona efetiva, não só a selecionada (correção A5), resolvida com o catálogo em mãos (correção B1).** As guardas de `updatePersona`/`deletePersona` comparam com

```text
activePersonaId(configOverride, personaService) =
  selectedPersonaId()
  ?? loadConfig(withSelections(configOverride), { personaIds: personaService.list() }).persona
```

— não com `selectedPersonaId()` isolado. Hoje o segundo termo é sempre `'jarvis'` por acidente (o `main.ts` não passa `configOverride` e o `defaultConfig` não lê env), mas basta honrar `ATLAS_PERSONA` no desktop ou persistir a seleção entre reinícios (fatia futura já nomeada) para o usuário apagar a Persona ativa e deixar todo `createAtlas` subsequente falhando com `InvalidConfigError` — app inutilizável até reiniciar. A guarda pela Persona **efetiva** fecha esse buraco antes que ele exista.

O `personaService` passado é o **mesmo** que a função já usa (injetado ou `defaultPersonaService(configOverride)`), e o `personaIds` vem do catálogo dele — de modo que uma Persona custom em `config.persona` seja **resolvida**, não rejeitada, exatamente como no `createAtlas` (§3). Só um id que não existe **nem** como embutida **nem** no storage daquele `dataDir` continua produzindo `InvalidConfigError`, que é o comportamento correto (config apontando para Persona inexistente).

**Confirmação da remoção (correção A3, Artigo 8).** Apagar uma Persona custom é destrutivo e irreversível (8 campos escritos à mão, sem export/import, sem undo) e **não** tem comando de CLI equivalente do qual herdar paridade — o precedente do `forgetFact` (SPEC-0034) não se aplica:

- novo módulo `src/persona-delete-dialog.ts`, no molde exato de `permission-grant-dialog.ts` (SPEC-0038): `PersonaDeleteRequest { id; name }`, `PersonaDeleteConfirmPort { request(req): Promise<boolean> }` e `createPersonaDeleteDialog({ showMessageBox })` — **diálogo nativo** (`dialog.showMessageBox`), texto declarando que a Persona e seus 8 atributos serão apagados do disco e que a ação **não pode ser desfeita**; fail-closed idêntico ao das outras portas (só o botão de confirmação resolve `true`; qualquer outro caminho, rejeição ou retorno inesperado resolve `false`, nunca lança); não importa `electron`;
- `deletePersona(id, deps?: { confirmDelete?: PersonaDeleteConfirmPort; … })` — **default fail-closed**: sem a porta injetada, nenhuma Persona é apagada (molde literal do `fallbackGrantConfirm`, `core-bridge.ts:184-187`). `main.ts` injeta a implementação de diálogo, construída uma vez ao lado de `confirm`/`confirmGrant`;
- ordem: validações (embutida / inexistente / ativa) **antes** do diálogo — o usuário nunca é perguntado sobre algo que seria recusado de qualquer forma;

**Demais regras**: toda recusa rejeita com `Error` estruturado **antes** de qualquer efeito colateral (fail-closed, molde D6/D9 da SPEC-0037); `__resetBridgeStateForTests` segue cobrindo o estado de módulo; `StatusSnapshot.persona` ganha `readonly voiceURI?: string` (a voz da Persona ativa, para o renderer alimentar o TTS).

## 5. `apps/desktop` — TTS

- `speech-output.ts`: `createSpeechOutput({ synth, preferredVoiceURI? })`, com `preferredVoiceURI?: () => string | undefined` — **provider amostrado a cada `speak`** (molde do `memoryPrompt` da SPEC-0021), para que trocar/editar a Persona mude a voz sem recriar o objeto. Seleção: entre as vozes com `localService === true`, usa a de `voiceURI` igual ao preferido; não havendo (ausente, indisponível, provider lançando), cai na **primeira voz local** (comportamento atual, byte a byte); não havendo voz local alguma, `speak` segue no-op e `isAvailable()` segue `false` — nunca voz de rede;
- `renderer/renderer.js`: espelha a mesma seleção no `createSpeechOutputGlue` (duplicação deliberada já documentada nas SPECs 0035/0036, com comentário apontando o teste de referência), alimenta o provider com a `voiceURI` da Persona ativa lida do `getStatus()` (recarregado a cada troca/edição de Persona).

## 6. `apps/desktop` — main/preload/renderer

- `main.ts`: quatro `ipcMain.handle` novos — `'atlas:persona:describe'`, `'atlas:persona:create'`, `'atlas:persona:update'`, `'atlas:persona:delete'` — ao lado de `'atlas:persona:list'`/`'atlas:persona:select'`; o handler de `delete` passa `{ confirmDelete }` (diálogo nativo construído uma vez, ao lado de `confirm`/`confirmGrant`); o handler de `update` remove de `openChatSessionIds` as sessões devolvidas em `closedSessions` (mesmo tratamento dos handlers de Persona/permissões). Nenhuma lógica de domínio;
- `preload.cjs`: `window.atlas.persona.{describe,create,update,delete}` ao lado de `{list,select}`;
- `renderer/index.html` + `renderer.js`: o painel de Persona ganha um botão "Nova Persona" que abre um formulário com os 8 campos (`communicationRules` como textarea, uma regra por linha) mais um `<select>` de voz e um botão "Testar voz"; cada Persona custom listada ganha "Editar"/"Apagar"; Personas embutidas aparecem somente-leitura, sem esses botões. O painel inteiro entra na mesma serialização de turno já existente (desabilitado enquanto houver turno de chat/`ask` em voo). Sucesso de `update` na Persona ativa: limpa o transcript, avisa ("Persona atualizada — nova conversa iniciada"), reabre a sessão e recarrega o status. Recusa (inclusive consentimento negado no diálogo de remoção): aviso de erro, transcript e conversa intactos, listas recarregadas do estado real. JavaScript plano, sem bundler nem framework;
- **`<select>` de vozes repopulado em `voiceschanged` (correção A2).** O `<select>` é populado com as vozes **locais** (`localService === true`) do próprio `synth` do renderer (opção "Nenhuma (voz padrão)" incluída) **e reavaliado no evento `voiceschanged`**, não só uma vez no carregamento — no Chromium, `getVoices()` costuma devolver `[]` até esse evento assíncrono disparar, e a SPEC-0035 já resolveu exatamente esse quirk para o botão "Ouvir" (`refreshSpeakButton`/`pendingSpeakButtons`). A repopulação reusa esse mesmo listener: preserva a opção atualmente selecionada quando ela ainda existir na lista nova, e o botão "Testar voz" fica desabilitado com aviso ("voz indisponível neste sistema") enquanto não houver nenhuma voz local, nunca ativo-porém-mudo.

## 7. Testes e documentação da própria SPEC

- testes novos/estendidos em `packages/persona/tests/`, `packages/core/tests/`, `apps/desktop/tests/` (ver Estratégia de Testes);
- atualizar `packages/persona/CLAUDE.md`, `packages/contracts/CLAUDE.md` e `apps/desktop/CLAUDE.md`;
- **atualizar o parágrafo de fronteira do re-export de catálogo em `packages/core/CLAUDE.md`** (l. 14, SPEC-0037/D4) — hoje ele limita o re-export a "leitura de catálogo/config **inerte**" e proíbe, sem ADR, o app "instanciar um serviço da plataforma para injetá-lo em outro componente, ou montar/substituir wiring que hoje vive em `createAtlas`". Esta SPEC alarga essa fronteira de forma delimitada, com respaldo do ADR-0020 (ver Decisão D12): o parágrafo passa a registrar a exceção, seu escopo exato (Persona Service sobre a porta de storage do ADR-0020) e o que continua proibido. Registrar também, no mesmo `CLAUDE.md`, `resolveDataDir` como a via oficial de resolver **só** o `dataDir` (D17);
- acrescentar ao [ADR-0010](../../06-adr/ADR-0010-persona-injected-generation.md) a nota de atualização prevista pelo ADR-0020 (premissa "registro embutido" parcialmente superada; composição do system prompt inalterada).

---

# Fora do Escopo

- **equivalente de CLI** (`atlas persona create/edit/delete/list/use`) — candidato futuro independente, mesmo tratamento do `list`/`use` deixado aberto pela SPEC-0037; `apps/cli` **não** injeta `personaStorage` nesta fatia e seu diff é **vazio** (o caminho canônico `personaStoragePath` fica pronto em `@atlas/core` justamente para que essa fatia futura não invente outro caminho);
- **migrar `jarvis`/`neutral` para o storage** ou torná-las editáveis/apagáveis pela GUI — explicitamente rejeitado no ADR-0020;
- **exportar/importar Personas custom** entre máquinas; sincronização; backup; desfazer (`undo`) uma remoção — a proteção nesta fatia é o consentimento prévio (D14), não a reversibilidade;
- **controle de concorrência no arquivo de Personas** (lock, escrita atômica com `rename`, detecção de escrita externa) — ver Observações, limitação conhecida A7;
- **qualquer voz de rede** — a garantia da SPEC-0036 permanece intacta; a lista de vozes elegíveis continua restrita a `localService === true`;
- **fala automática** de respostas, escolha de taxa/tom/volume por Persona, preview de voz fora do formulário (o botão "Testar voz" do formulário é a única prova sonora) — resto do item 2.3;
- **entrada por voz (STT)/wake word** — escalação obrigatória própria (ADR novo), registrada desde a SPEC-0035;
- **persistir a Persona ativa entre reinícios** (preferência durável) — segue fora, pelas mesmas razões da D3 da SPEC-0037 (Artigo 11 / slot `arquivo` do ADR-0006 inexistente). Esta SPEC persiste a **definição** das Personas, não a **seleção** — mas já deixa a guarda de remoção correta para quando essa fatia existir (correção A5 / D15);
- **honrar `ATLAS_PERSONA`/flags de Persona no `apps/desktop`** — fatia própria; aqui só a guarda passa a ser correta caso isso mude;
- **campo novo em `AtlasConfig`** para o caminho do arquivo de Personas (e, portanto, flag/env correspondentes) — o caminho é derivado de `dataDir` por `personaStoragePath`; ver Decisão D4;
- **generalizar a resolução por campo** (`resolveLogLevel`/`resolvePersona`/`resolvePermissions`… como família) — esta SPEC extrai **apenas** `resolveDataDir`, pelo consumidor real que existe; ver Decisão D17;
- **expor `personaService` em `AtlasPlatform`** ou promover `PersonaOption`/`PersonaDetail`/`PersonaMutation`/`PersonaDeleteConfirmPort`/canais IPC a `@atlas/contracts` — só com 2º consumidor real, via ADR (mesma regra das SPECs 0031-0038);
- **`emotion` deixar de ser slot inerte** (nenhum canal de afeto novo) e **`voice`** (texto descritivo) deixar de existir — `voice` permanece como descrição textual, ao lado do `voiceURI` técnico;
- **`personaPrompt` recomposto ao vivo** dentro de um Core já criado — editar a Persona ativa encerra as sessões vivas, como na SPEC-0037 (D5);
- **cancelar turno em voo** — esta SPEC apenas **recusa** enquanto o turno corre;
- **validação semântica dos textos da Persona** (tamanho máximo, idioma, moderação de conteúdo) e qualquer tentativa de impedir que o usuário escreva uma Persona "ruim";
- estilização/UX elaborada (CSS, avatar, preview do system prompt), bundler/framework de UI, empacotamento (Fase 3), E2E headless de Electron em CI — a janela segue validada por smoke manual;
- alterações em `@atlas/cognitive`, `@atlas/runtime`, `@atlas/tools`, `@atlas/memory`, `@atlas/context`, `@atlas/permissions`, `@atlas/skills` e `apps/cli` — **diff vazio** em todos.

---

# Pré-requisitos

- [SPEC-0008](SPEC-0008-persona-service.md) (Done) — Persona Service.
- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação do `apps/desktop`.
- [SPEC-0033](SPEC-0033-desktop-visual-chat.md) (Done) — chat vivo e ciclo de sessões.
- [SPEC-0034](SPEC-0034-desktop-visual-memory-management.md) (Done) — molde stateless sobre estado durável.
- [SPEC-0035](SPEC-0035-desktop-voice-output-tts.md) (Done) e [SPEC-0036](SPEC-0036-desktop-tts-local-voice-only.md) (Done) — TTS, a garantia de voz local e o tratamento de `voiceschanged`.
- [SPEC-0037](SPEC-0037-desktop-runtime-persona-switch.md) (Done) — painel de Persona, re-export de catálogo, estado de módulo.
- [SPEC-0038](SPEC-0038-desktop-permission-roots-gui.md) (Done) — rastreio de operação em voo, `withSelections` e a porta de confirmação dedicada com default fail-closed.
- [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) (Accepted) — decisões estruturais que esta SPEC realiza.

---

# Critérios de Aceitação

Qualidade geral:

- `pnpm lint`, `pnpm typecheck` e `pnpm test` passam, cobrindo `@atlas/contracts`, `@atlas/persona`, `@atlas/core` e `apps/desktop`;
- estrutura corresponde à seção "Arquivos Esperados";
- `git diff` é **vazio** em `packages/cognitive`, `packages/runtime`, `packages/tools`, `packages/memory`, `packages/context`, `packages/permissions`, `packages/skills` e `apps/cli` (inclusive testes).

Não-regressão (ADR-0020: "sem storage, idêntico a hoje"):

- teste comprova: `createPersonaService()` **sem** `storage` devolve `list()` exatamente `['jarvis', 'neutral']`, `get`/`has`/`systemPrompt` inalterados, e `create`/`update`/`delete` lançam `PersonaError`;
- teste comprova: `loadConfig(override)` **sem** o 2º parâmetro rejeita `persona: 'qualquer-custom'` com a mesma mensagem de hoje (validação contra `PERSONA_IDS`);
- teste comprova: `createAtlas()` sem `deps.personaStorage` **não** lê nem cria nenhum arquivo de Personas (storage fake/spy: zero chamadas; nenhum arquivo novo no `dataDir` temporário).

Storage e CRUD (`@atlas/persona`):

- teste comprova (fake em memória): `create` deriva `id` por slug (`'Meu Assistente'` ⇒ `'meu-assistente'`), persiste via `storage.save` **na mesma chamada** e o resultado aparece em `list()`/`get()`/`has()`;
- teste comprova: colisão de slug com uma custom existente **e** com uma embutida gera `-2`, `-3`, … (ex.: dois `create` com `name: 'Jarvis'` ⇒ `'jarvis-2'` e `'jarvis-3'`);
- teste comprova: `create` com `name` vazio/só espaços, ou cujo slug colapse para vazio (ex.: `'###'`), lança `PersonaError` e **não** chama `storage.save`;
- teste comprova: `update('minha-persona', input)` preserva o `id`, persiste e reflete em `get`; `update`/`delete` sobre `'jarvis'`/`'neutral'` lançam `PersonaError` sem chamar `storage.save`; sobre id inexistente, idem;
- teste comprova: `delete` remove da lista e persiste; um serviço novo sobre o mesmo storage não vê mais a Persona apagada;
- teste comprova: `voiceURI` sobrevive ao round-trip `create` → `save` → `load` → `get`; Persona criada sem `voiceURI` não passa a ter a propriedade definida (compatível com `exactOptionalPropertyTypes`);
- teste comprova (`createFilePersonaStorage`, em `tmpdir` real): arquivo ausente ⇒ `load()` devolve `[]`; após `save`, o arquivo existe e um `load` novo devolve o mesmo conteúdo; JSON inválido ⇒ `PersonaError` no `load` **cuja mensagem contém o caminho do arquivo** (correção A6), **não** lista vazia, **não** sobrescrita do arquivo;
- teste comprova: `systemPrompt` de uma Persona custom é composto pelo mesmo formato das embutidas e **não** menciona `voice`/`voiceURI`/`emotion`.

Composição e resolução de config (`@atlas/core`):

- teste comprova: `createAtlas({ config: { persona: '<id custom>' } }, { personaStorage: fake })` sobe com `atlas.persona.id === '<id custom>'` e `atlas.config.persona === '<id custom>'`;
- teste comprova: o mesmo `createAtlas` **sem** `personaStorage` rejeita com `InvalidConfigError` citando o id;
- teste comprova: `loadConfig({ persona: 'x' }, { personaIds: ['jarvis', 'neutral', 'x'] })` aceita, e `loadConfig({ persona: 'y' }, { personaIds: [...] })` sem `y` rejeita;
- teste comprova: `resolveDataDir({ dataDir: <tmp> })` devolve `<tmp>`; `resolveDataDir()` devolve o `dataDir` de `defaultConfig()`; `resolveDataDir({ dataDir: '' })` e `{ dataDir: '   ' }` lançam `InvalidConfigError` com a **mesma** mensagem que o `loadConfig` produz hoje para esse caso; a função é pura (nenhuma leitura/escrita de disco);
- **correção B1** — teste comprova: `resolveDataDir({ dataDir: <tmp>, persona: '<id custom desconhecido>' })` devolve `<tmp>` **sem lançar** (não valida `persona`, não aciona `PERSONA_IDS`), enquanto `loadConfig` sobre o **mesmo** override segue rejeitando com `InvalidConfigError` — as duas preocupações são independentes e ambas continuam corretas;
- teste comprova (precedência única, sem divergência): para ≥2 overrides (com e sem `dataDir`), `resolveDataDir(override) === loadConfig(override).dataDir`;
- teste comprova (não-regressão do acúmulo de `issues`): `loadConfig({ dataDir: '', persona: 'inexistente', logLevel: 'nope' })` rejeita com um `InvalidConfigError` contendo **os três** problemas, como hoje (a extração de `resolveDataDir` não transformou a validação em fail-fast);
- teste comprova: `personaStoragePath(dataDir)` é puro (nenhum arquivo criado, nenhuma leitura de disco) e devolve `join(dataDir, 'personas.json')` para dois `dataDir` distintos;
- teste comprova: `createFilePersonaStorage`, `resolveDataDir`, `personaStoragePath` e o tipo `PersonaStorage` são importáveis de `@atlas/core`.

Bridge (`apps/desktop`):

- teste comprova: `listPersonas({ personaService: fake })` devolve `{ id, name, builtin }` por Persona, com `builtin: true` só para `jarvis`/`neutral`, planos e serializáveis (`JSON.stringify` round-trip sem perda), **sem** chamar `createAtlas` (spy: zero chamadas);
- teste comprova: `createPersona(input, { personaService: fake })` devolve o `PersonaDetail` criado, **não** altera `selectedPersonaId()` e **não** encerra nenhuma sessão de chat viva;
- teste comprova: `describePersona(id)` devolve os 8 campos + `id` + `voiceURI?` + `builtin`;
- **correção A1** — teste comprova: com `deps.configOverride = { dataDir: <tmp1> }`, `createPersona` grava em `<tmp1>/personas.json` e **nada** é criado no `dataDir` default; um `describePersona`/`listPersonas` com o **mesmo** `configOverride` enxerga a Persona, e com `{ dataDir: <tmp2> }` **não** enxerga (dois `dataDir` temporários isolados na mesma execução de teste);
- **correções A1 + B1** — teste comprova: `resolveStatusSnapshot({ dataDir: <tmp1>, persona: '<id custom>' })` resolve a Persona criada em `<tmp1>` (o `personaStorage` injetado no `createAtlas` deriva do **mesmo** config efetivo da chamada, por `resolveDataDir`, **sem** passar pela validação de `persona`), e o mesmo snapshot com `{ dataDir: <tmp2> }` rejeita com `InvalidConfigError` citando o id — ou seja: a Persona custom no override **não** impede a resolução do storage, e continua impedindo o Core de subir quando ela realmente não existe naquele `dataDir`;
- teste comprova: `updatePersona` sobre a Persona **ativa** devolve as sessões vivas em `closedSessions` (um `sendChatTurn` posterior naquela sessão rejeita) e, com turno em voo (gateway `fake` com resolução controlada pelo teste), **rejeita** sem alterar nada e sem encerrar sessão; `updatePersona` sobre Persona **não** ativa devolve `closedSessions: []` e não perturba as sessões vivas;
- teste comprova: `updatePersona`/`deletePersona` sobre `'jarvis'` rejeitam com `Error` estruturado; `deletePersona(selectedPersonaId())` rejeita citando a necessidade de trocar de Persona antes; após `selectPersona` para outra, o mesmo `deletePersona` é aceito (com consentimento concedido);
- **correções A5 + B1** — teste comprova, com duas Personas custom criadas em `<tmp1>` e **sem** nenhuma seleção em memória (`__resetBridgeStateForTests`, `selectedPersonaId() === undefined`): `deletePersona('<custom A>', { configOverride: { dataDir: <tmp1>, persona: '<custom A>' }, confirmDelete: <porta que concede> })` **rejeita pela guarda de Persona ativa** — a asserção é sobre a mensagem estruturada da guarda (que cita a troca de Persona), o teste comprova explicitamente que o erro **não** é um `InvalidConfigError`, que `personaService.delete`/`storage.save` tiveram **zero** chamadas e que a porta `confirmDelete` **não** foi consultada; **controle positivo no mesmo estado** (mesma ausência de seleção, mesmo `configOverride` com `persona: '<custom A>'`): `deletePersona('<custom B>', …)` é **aceito** e apaga — provando que a resolução de config/storage funciona com Persona custom no config e que a rejeição anterior veio da guarda, não de um erro incidental; o par equivalente vale para `updatePersona`, que edita a Persona **efetiva** sem seleção em memória e encerra as sessões vivas;
- **correção A3** — teste comprova: `deletePersona(id)` **sem** `deps.confirmDelete` rejeita e **não** chama `storage.save`/`personaService.delete` (default fail-closed); com uma porta fake que resolve `false`, idem, e a Persona continua em `listPersonas`; com uma porta que resolve `true`, a Persona é apagada; a porta é consultada **depois** das validações (fake spy: zero chamadas quando o alvo é `'jarvis'`, inexistente ou a Persona efetivamente ativa);
- **correções A1 + B1 (round-trip completo)** — teste comprova: uma Persona criada pelo bridge com `configOverride: { dataDir: <tmp1> }` é **visível** para o Core subido em seguida — `selectPersona('<id custom>')` seguido de `resolveStatusSnapshot({ dataDir: <tmp1> })` devolve `persona.id === '<id custom>'` e `persona.voiceURI` igual ao gravado (GUI → disco → Core), usando o **mesmo** `dataDir` temporário isolado em todas as chamadas; e, **com a seleção custom viva em memória** (o cenário central desta SPEC), as seis funções de Persona (`listPersonas`/`describePersona`/`createPersona`/`updatePersona`/`deletePersona`/`selectPersona`) e as cinco que sobem o Core continuam operando — nenhuma delas lança `InvalidConfigError` ao resolver o storage (regressão direta do deadlock B1);
- teste comprova (`persona-delete-dialog.ts`, sem Electron): só o índice do botão de confirmação resolve `true`; cancelar, `cancelId`, retorno inesperado ou rejeição do `showMessageBox` resolvem `false` e **nunca** lançam (molde do `createGrantConfirmDialog`);
- verificação de fronteira (ADR-0003): nenhum arquivo de `apps/desktop/src` nem de `apps/cli/src` importa de `@atlas/persona` (ou de qualquer package que não seja `@atlas/core`/`@atlas/contracts`) — conferível por `grep`; `apps/desktop/package.json` **não** ganha dependência nova; nenhum arquivo fora de `packages/core/src` deriva o caminho `personas.json` por conta própria (`grep -r "personas.json"` só casa em `packages/core/src`, testes e documentação).

TTS:

- teste comprova: com `preferredVoiceURI` apontando para uma voz **local** existente, `speak` emite `UtteranceSpec.voiceURI` igual a ela (mesmo não sendo a primeira da lista);
- teste comprova: com `preferredVoiceURI` ausente, `undefined`, apontando para voz inexistente, ou apontando para voz com `localService === false`, `speak` cai na **primeira voz local** (fallback determinístico, idêntico ao comportamento da SPEC-0036);
- teste comprova: sem nenhuma voz local, `speak` é no-op e `isAvailable()` é `false`, **mesmo** com `preferredVoiceURI` definido (fail-closed preservado — nunca voz de rede);
- teste comprova: `preferredVoiceURI` que lança é tratado como ausente (fail-safe, nunca propaga ao chat);
- teste comprova: o provider é amostrado **a cada** `speak` (dois `speak` com valores diferentes usam vozes diferentes, sem recriar o objeto).

Smoke manual (registrado nas Observações, em sessão gráfica real — `pnpm --filter @atlas/desktop start`):

1. "Nova Persona" cria uma Persona com os 8 campos preenchidos e uma voz local escolhida; ela aparece no seletor sem reiniciar a app;
2. **correção A2** — abrir o formulário logo no início da sessão (antes de qualquer fala): o `<select>` de vozes **fica populado** assim que as vozes do SO chegam (evento `voiceschanged`), sem precisar fechar/reabrir o formulário nem recarregar a janela; o botão "Testar voz" acompanha (desabilitado com aviso enquanto não houver voz local, habilitado depois);
3. selecionar a Persona custom e conversar: o botão "🔊 Ouvir" fala com a **voz escolhida** (audivelmente distinta da voz default, quando o SO tiver ≥2 vozes locais);
4. **correção B1** — ainda com a Persona custom **ativa**, abrir e usar o painel de Persona (listar, "Editar", "Nova Persona") e enviar mais um turno de chat: nada falha nem aparece erro de config — a app segue plenamente utilizável com Persona custom selecionada;
5. "Editar" a Persona ativa avisa "nova conversa iniciada" e a conversa seguinte usa os atributos editados; "Apagar" a Persona ativa é **recusado** com aviso, e passa a funcionar depois de trocar para outra;
6. **correção A3** — "Apagar" numa Persona não ativa abre o **diálogo nativo de confirmação**: cancelar não apaga nada (a Persona continua na lista); confirmar apaga;
7. `jarvis`/`neutral` aparecem sem botões de editar/apagar;
8. fechar e reabrir a app: as Personas custom **continuam lá** (persistência real), e a Persona ativa volta à da config (a seleção segue não durável).

---

# Arquivos Esperados

```text
packages/
├── contracts/
│   ├── src/persona.ts                        # + voiceURI?, PersonaInput, create/update/delete
│   └── CLAUDE.md                             # + nota da mudança de contrato
├── persona/
│   ├── src/
│   │   ├── persona-service.ts                # + storage opcional, create/update/delete, slug
│   │   ├── storage/persona-storage.ts        # NOVO: porta + createFilePersonaStorage
│   │   ├── personas.ts                       # inalterado (embutidas imutáveis)
│   │   ├── errors.ts                         # inalterado (PersonaError reusado)
│   │   └── index.ts                          # + exports do storage
│   ├── tests/
│   │   ├── persona-service.test.ts           # + CRUD, slug, imutabilidade das embutidas
│   │   └── persona-storage.test.ts           # NOVO: adapter de arquivo em tmpdir
│   └── CLAUDE.md                             # + storage, CRUD, invariantes
└── core/
    ├── src/
    │   ├── index.ts                          # + personaStorage?, wiring, personaStoragePath,
    │   │                                     #   resolveDataDir, re-exports
    │   └── config/
    │       ├── data-dir.ts                   # NOVO (D17): resolveDataDir + precedência
    │       │                                 #   compartilhada de dataDir (sem tocar persona)
    │       └── load-config.ts                # + options.personaIds (aditivo); consome a
    │                                         #   precedência de data-dir.ts
    ├── tests/                                # + casos de config/composição/dataDir/caminho
    └── CLAUDE.md                             # + wiring opt-in, resolveDataDir e a fronteira
                                              #   do re-export atualizada (D12)

apps/
└── desktop/
    ├── src/
    │   ├── core-bridge.ts                    # + describe/create/update/deletePersona,
    │   │                                     #   PersonaDetail/PersonaMutation, builtin,
    │   │                                     #   personaStorageFor(configOverride),
    │   │                                     #   activePersonaId, confirmDelete fail-closed,
    │   │                                     #   StatusSnapshot.persona.voiceURI?
    │   ├── persona-delete-dialog.ts          # NOVO: PersonaDeleteConfirmPort + diálogo nativo
    │   ├── speech-output.ts                  # + preferredVoiceURI (provider) e fallback
    │   ├── main.ts                           # + 4 ipcMain.handle de Persona + confirmDelete
    │   ├── preload.cjs                       # + window.atlas.persona.{describe,create,update,delete}
    │   └── renderer/
    │       ├── index.html                    # + formulário de Persona + lista com Editar/Apagar
    │       └── renderer.js                   # + formulário, select de vozes locais repopulado
    │                                         #   em voiceschanged, testar voz, provider de
    │                                         #   voiceURI para o glue de TTS
    ├── tests/
    │   ├── core-bridge.test.ts               # + CRUD, recusas, configOverride, round-trip
    │   ├── persona-delete-dialog.test.ts     # NOVO: fail-closed do diálogo
    │   └── speech-output.test.ts             # + preferência/fallback de voz
    └── CLAUDE.md                             # + superfície de autoria de Persona e voz

docs/06-adr/ADR-0010-persona-injected-generation.md   # + nota de atualização (ADR-0020)
```

Lista de expectativa; pequenos ajustes são aceitáveis.

---

# Componentes Impactados

- **Persona Service** (`packages/persona`) — ganha persistência e CRUD (ADR-0020(a)); continua sem decidir estratégia, criar Plans ou executar Tasks;
- **Core / Configuration Service** (`packages/core`) — wiring opt-in do storage, validação de id parametrizável, resolução isolada de `dataDir` e caminho canônico do arquivo de Personas;
- **Input/Output Gateway (semente desktop)** (`apps/desktop`) — formulário, listagem editável, consentimento de remoção e vínculo de voz;
- consome **sem alterar**: Cognitive Core (recebe só `personaPrompt`, como sempre), Context Service (via `closeChatSession`), Lifecycle Manager, Memory Service, Permission Service.

---

# Interfaces Necessárias

Em `@atlas/contracts` (`src/persona.ts`):

```text
Persona { …campos atuais…, readonly voiceURI?: string }

PersonaInput {
  readonly name; tone; formality; language; style; voice; emotion: string
  readonly communicationRules: readonly string[]
  readonly voiceURI?: string
}

PersonaService {
  …get/has/list/systemPrompt (inalterados)…
  create(input: PersonaInput): Persona
  update(id: string, input: PersonaInput): Persona
  delete(id: string): void
}
```

Em `@atlas/persona` (porta interna, **não** sobe ao contrato):

```text
PersonaStorage {
  load(): readonly Persona[]
  save(personas: readonly Persona[]): void
}

createFilePersonaStorage(path: string): PersonaStorage
createPersonaService(deps?: { storage?: PersonaStorage }): PersonaService
```

Em `@atlas/core`:

```text
CreateAtlasDeps { …, personaStorage?: PersonaStorage }
loadConfig(override?, options?: { readonly personaIds?: readonly string[] }): AtlasConfig
resolveDataDir(override?: AtlasConfigOverride): string  // só dataDir; NUNCA valida persona
personaStoragePath(dataDir: string): string             // puro; único derivador do caminho
export { createPersonaService, createFilePersonaStorage,
         resolveDataDir, personaStoragePath, PERSONA_IDS }
export type { PersonaStorage }
```

Locais a `apps/desktop` (não em `@atlas/contracts`):

```text
PersonaOption   { id; name; builtin }                    // + builtin (aditivo)
PersonaDetail   { id; name; tone; formality; language; style;
                  communicationRules: readonly string[]; voice; emotion;
                  voiceURI?; builtin }
PersonaMutation { persona: PersonaDetail; closedSessions: readonly SessionId[] }

PersonaDeleteRequest    { id; name }
PersonaDeleteConfirmPort { request(req: PersonaDeleteRequest): Promise<boolean> }
createPersonaDeleteDialog({ showMessageBox }): PersonaDeleteConfirmPort

type PersonaDeps = { personaService?: PersonaService; configOverride?: AtlasConfigOverride }

describePersona(id, deps?: PersonaDeps): PersonaDetail
createPersona(input, deps?: PersonaDeps): Promise<PersonaDetail>
updatePersona(id, input, deps?: PersonaDeps): Promise<PersonaMutation>
deletePersona(id, deps?: PersonaDeps & { confirmDelete?: PersonaDeleteConfirmPort }): Promise<void>
listPersonas(deps?: PersonaDeps): readonly PersonaOption[]
selectPersona(id, deps?: PersonaDeps): Promise<PersonaSelection>
StatusSnapshot.persona: { id; name; voiceURI? }

createSpeechOutput({ synth, preferredVoiceURI?: () => string | undefined }): SpeechOutput

// helpers internos (não exportados do módulo além do necessário aos testes)
personaStorageFor(configOverride?): PersonaStorage
defaultPersonaService(configOverride?): PersonaService
activePersonaId(configOverride, personaService): string
```

Canais IPC novos:

```text
main:     'atlas:persona:describe' | 'atlas:persona:create'
          'atlas:persona:update'   | 'atlas:persona:delete'
preload:  window.atlas.persona.{describe,create,update,delete}
```

**Nenhum canal IPC de vozes**: a lista de vozes vive no renderer (Web Speech API do Chromium) — ver Decisão D7.

---

# Fluxo Esperado

```text
[criar]
renderer (formulário: 8 campos + voz local escolhida)
  → window.atlas.persona.create(input)
      → [main] createPersona(input)
          → storage = createFilePersonaStorage(
                        personaStoragePath(resolveDataDir(withSelections(cfg))))
            (só dataDir; nenhuma validação de persona — D17)
          → PersonaService(storage).create(input)
              → valida input → deriva slug → grava (write-through)
      → devolve PersonaDetail  (nenhuma sessão encerrada, seleção intacta)
  → renderer recarrega o seletor (list) e a lista de Personas custom

[usar]
renderer → persona.select('<id custom>')     (fluxo da SPEC-0037, inalterado)
  → toda função que sobe o Core injeta personaStorage derivado do MESMO configOverride
      → createAtlas → personaService.list() alimenta a validação do loadConfig
      → personaService.get(id) → systemPrompt → personaPrompt (ADR-0010, intacto)
  → renderer recarrega getStatus() → persona.voiceURI ativo

[ouvir]
renderer: botão "🔊 Ouvir"
  → speechOutput.speak(reply)   (provider preferredVoiceURI → voiceURI ativo)
      → voz local com esse voiceURI?      sim → fala com ela
      → não/ausente/indisponível          → 1ª voz local (SPEC-0036)
      → nenhuma voz local                 → no-op (nunca voz de rede)

[editar / apagar]
ativa = selectedPersonaId()
        ?? loadConfig(withSelections(cfg), { personaIds: personaService.list() }).persona
updatePersona(id)  → embutida?           sim → recusa
                   → id é a ativa?       sim → recusa se operação em voo;
                                               senão aplica + encerra sessões vivas
                   → id não é a ativa    → aplica, closedSessions: []
deletePersona(id)  → embutida?           sim → recusa
                   → inexistente?        sim → recusa
                   → id === a ativa?     sim → recusa ("troque de Persona antes")
                   → confirmDelete.request({id,name})?
                        ausente/false    → recusa, nada apagado (fail-closed)
                        true             → apaga (write-through)
```

Regras (para remover ambiguidade):

- Personas embutidas vêm **sempre** do registro em código, nunca do storage; um registro custom com id embutido no arquivo (arquivo editado à mão) é ignorado na resolução — a embutida vence, e nenhuma escrita silenciosa "corrige" o arquivo;
- o caminho do arquivo de Personas é derivado **uma única vez**, por `personaStoragePath(resolveDataDir(...))`, sempre a partir do config **efetivo** da chamada e **nunca** por uma via que valide a Persona ativa (D17);
- resolver **onde** está o arquivo e resolver **qual** Persona está ativa são preocupações independentes: a primeira só depende de `dataDir`; a segunda consulta o catálogo (embutidas + custom daquele storage);
- a Persona chega ao modelo **só** pelo caminho do ADR-0010; nem o app nem o storage compõem prompt de identidade;
- o Core vive só no main process; o renderer recebe apenas objetos planos;
- `apps/desktop` importa implementação **só** de `@atlas/core` — inclusive `createFilePersonaStorage` e `resolveDataDir`;
- o arquivo de Personas é **política/configuração de identidade**, não conhecimento aprendido: fica fora da Memory (Artigo 11 preservado — ver Observações);
- toda recusa é anunciada na janela; nenhuma edição/remoção silenciosa, e nenhuma remoção sem consentimento explícito.

---

# Estratégia de Implementação

1. `@atlas/contracts`: `voiceURI?`, `PersonaInput`, os três membros de `PersonaService`; rodar `pnpm typecheck` e listar os implementadores/fakes quebrados (padrão recorrente registrado no `LESSONS_LEARNED`);
2. `@atlas/persona`: porta `PersonaStorage` + `createFilePersonaStorage` (erro citando o caminho); `createPersonaService({ storage? })` com load-once/write-through, slug, validações e imutabilidade das embutidas; testes com fake em memória (TDD) e o adapter de arquivo em `tmpdir`;
3. `@atlas/core`, em duas etapas: **(a)** extrair `config/data-dir.ts` com a precedência de `dataDir` e `resolveDataDir`, fazer `loadConfig` consumir essa precedência e provar por teste que nada mudou (mensagens e acúmulo de `issues` idênticos); **(b)** `loadConfig(override, options?)` (aditivo) + `CreateAtlasDeps.personaStorage?` + `personaStoragePath(dataDir)` + wiring + re-exports; testes de não-regressão primeiro;
4. `apps/desktop/src/core-bridge.ts`: `personaStorageFor(configOverride)` (via `resolveDataDir`, **sem** `loadConfig`), `defaultPersonaService(configOverride)`, `activePersonaId(configOverride, personaService)` (via `loadConfig` **com** `personaIds` do catálogo), `deps.configOverride?` nas seis funções de Persona, injeção de `personaStorage` nas cinco funções que sobem o Core, `describePersona`/`createPersona`/`updatePersona`/`deletePersona`, `builtin` em `PersonaOption`, `voiceURI` em `StatusSnapshot`; testes cobrindo recusas, isolamento por `dataDir`, o cenário de Persona custom **selecionada** (regressão B1) e o round-trip GUI → disco → Core;
5. `apps/desktop/src/persona-delete-dialog.ts`: porta + diálogo nativo fail-closed; teste antes;
6. `apps/desktop/src/speech-output.ts`: `preferredVoiceURI` provider + fallback; testes antes;
7. `main.ts`/`preload.cjs`: quatro canais novos, casca fina, `confirmDelete` construído uma vez, sincronizando `openChatSessionIds`;
8. `renderer/index.html` + `renderer.js`: formulário, lista editável, `<select>` de vozes locais **repopulado em `voiceschanged`** (reusando o listener da SPEC-0035), "Testar voz", espelhamento da seleção de voz no glue (com o comentário de duplicação deliberada);
9. `pnpm lint`/`typecheck`/`test` + verificação de fronteira por `grep` (imports e `personas.json`) + confirmação de diff vazio nos packages listados;
10. smoke manual (os 8 itens do critério) e registro do resultado;
11. atualizar os `CLAUDE.md` tocados — **inclusive o parágrafo de fronteira em `packages/core/CLAUDE.md`** — e a nota de atualização do ADR-0010; validar todos os critérios.

---

# Estratégia de Testes

- **`@atlas/persona`**: fake `PersonaStorage` em memória para todo o CRUD (sem IO); o adapter de arquivo testado à parte em `tmpdir` real (criação sob demanda, ausência ⇒ `[]`, JSON inválido ⇒ `PersonaError` com o caminho e sem sobrescrever, round-trip com `voiceURI`); casos de imutabilidade das embutidas; slug e colisões; serviço sem storage (não-regressão byte a byte);
- **`@atlas/core`**: `loadConfig` com/sem `personaIds` (não-regressão da mensagem de erro e do acúmulo de `issues`); `resolveDataDir` (precedência, validação, pureza, **indiferença ao campo `persona`**, igualdade com `loadConfig(override).dataDir`); `createAtlas` com `personaStorage` fake resolvendo Persona custom; `createAtlas` sem storage não tocando disco (spy); `personaStoragePath` puro sobre dois `dataDir`;
- **`apps/desktop`**: Vitest **sem** Electron, **dois** `dataDir` temporários isolados (para provar o isolamento por `configOverride`) e gateway `fake` (padrão das suítes 0031-0038); CRUD com `personaService` fake injetado **e** um caminho de teste com o storage de arquivo real (round-trip GUI → arquivo → `createAtlas`); **cenário de Persona custom selecionada** exercitando todas as funções de Persona (regressão B1); recusas (embutida, inexistente, Persona efetiva com e sem seleção em memória — com asserção sobre o **tipo/mensagem** do erro, para não confundir guarda com `InvalidConfigError` —, operação em voo com resolução controlada pelo teste, consentimento ausente/negado); `__resetBridgeStateForTests` entre casos, para o estado de módulo não vazar;
- **`persona-delete-dialog.ts`**: fake de `showMessageBox` cobrindo confirmar/cancelar/`cancelId`/retorno inesperado/rejeição — nunca lança, default `false`;
- **TTS**: `SpeechSynthesisPort` fake com combinações de vozes (`localService` verdadeiro/falso, preferida presente/ausente, lista vazia), provider ausente/lançando/variando entre chamadas;
- `main.ts`/`preload.cjs`/`renderer.js` **não** são unit-testados (camada Electron/DOM) — validação por smoke manual, incluindo a repopulação em `voiceschanged` e a prova sonora.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md` — inclusive o registro da extensão do item 2.4) é passo de fecho (`doc-sync`), não do implementador; o implementador toca a doc específica da própria SPEC (o arquivo da SPEC, os `CLAUDE.md` dos packages/app tocados — incluindo o parágrafo de fronteira de `packages/core/CLAUDE.md` — e a nota de atualização do ADR-0010).

---

# Restrições

- **Não criar módulo, package, Tool ou Skill novo.** O código novo vive em `packages/persona`, `packages/contracts`, `packages/core` (wiring mínimo) e `apps/desktop`. "Criar Persona" aqui é **dado do usuário**, não criação de componente arquitetural (Artigo 3): o Atlas continua com um único Persona Service, um único Core.
- **ADR-0020 é o teto**: qualquer necessidade além do que ele decide (ex.: tornar as embutidas editáveis, mover Personas para a Memory, campo novo em `AtlasConfig`, canal de voz próprio) é motivo para **parar e registrar**, não para decidir na implementação.
- **ADR-0003 preservado**: `apps/*` importam implementação só de `@atlas/core`; `core-bridge.ts` continua sem importar `electron` nem `@atlas/persona`. A composição do `PersonaService` no app é a exceção delimitada da D12 — nada além dela.
- **Personas embutidas imutáveis**, sempre resolvidas do código.
- **Um único derivador do caminho** (`personaStoragePath` em `@atlas/core`): nenhum `join(..., 'personas.json')` em `apps/*`.
- **Uma única precedência de `dataDir`** (`packages/core/src/config/data-dir.ts`): nem `loadConfig` nem o app reimplementam `override.dataDir ?? default`; e **achar o arquivo de storage nunca pode depender da validade da Persona ativa** (D17) — nenhum caminho de resolução de storage passa por validação de `persona`.
- **Fail-high no storage**: nunca descartar/sobrescrever silenciosamente o arquivo do usuário diante de conteúdo inválido.
- **Fail-closed em três frentes**: no TTS (a preferência de voz é mais uma camada **antes** do fallback da SPEC-0036, nunca uma exceção a ele; jamais falar por voz com `localService !== true`); no consentimento de remoção (sem porta injetada, nada é apagado); nas guardas de Persona efetiva (na dúvida, recusa).
- Sem `dist/`, sem bundler, sem framework de UI; renderer/preload em JS plano.
- `PersonaDetail`/`PersonaMutation`/`PersonaDeleteConfirmPort`/canais IPC ficam **locais** a `apps/desktop`.
- Nenhuma dependência de runtime nova em nenhum package ou app.

---

# Observações

**Por que o storage é opt-in e não default no `createAtlas`.** O ADR-0020 é explícito: "sem `storage` injetado, comportamento **idêntico ao de hoje**, byte a byte … inclusive `apps/cli`, que não recebe o storage nesta fatia". Um adapter de arquivo default dentro de `createAtlas` violaria isso (a CLI passaria a enxergar Personas custom e a tocar um arquivo novo sem ter pedido). A consequência prática é que a **fatia de CLI**, quando existir, será uma linha de composição — não um redesenho —, e ela já encontra o caminho canônico pronto em `personaStoragePath`.

**Por que a validação de `persona` no `loadConfig` precisa mudar.** `loadConfig` valida hoje contra `PERSONA_IDS` (`packages/core/src/config/load-config.ts:43`), que só conhece as embutidas. Sem o parâmetro `personaIds`, selecionar uma Persona custom falharia com `InvalidConfigError` **antes** de o Persona Service ser consultado — o vínculo entre criar e usar ficaria quebrado. O parâmetro é opcional e o caminho sem ele é byte a byte o atual.

**Por que achar o arquivo não pode passar pelo `loadConfig` (correção B1).** A versão anterior desta SPEC derivava o caminho do storage por `loadConfig(withSelections(cfg))`. Como `loadConfig` valida `persona` contra `PERSONA_IDS` (l. 43-47) e o `withSelections` injeta a Persona selecionada no override, bastava o usuário selecionar uma Persona custom — o cenário central desta SPEC — para **toda** função de Persona (e todas as cinco que sobem o Core, que recebem o storage injetado) lançar `InvalidConfigError` antes de qualquer trabalho útil: deadlock circular (para saber onde estão as Personas era preciso já saber que a Persona ativa é válida). A D17 desfaz o ciclo separando as duas resoluções: `resolveDataDir` (só `dataDir`, sem tocar em `persona`) para achar o arquivo; `loadConfig` **com** `personaIds` vindos do catálogo já carregado para resolver a Persona efetiva. Ambas continuam com uma única fonte de precedência.

**Duplicação renderer↔módulo (3ª ocorrência).** O glue de TTS do renderer replica manualmente o algoritmo de `speech-output.ts` porque não há bundler (ADR-0019) — atrito já registrado nas SPECs 0035/0036 e no `LESSONS_LEARNED`. Esta SPEC amplia esse algoritmo (preferência + fallback), então o espelhamento precisa de atenção explícita e do comentário de referência ao teste. Se este atrito reaparecer numa quarta fatia, vale a pena uma SPEC dedicada a eliminá-lo (candidato futuro, não escopo aqui).

**Smoke manual.** Como em todas as fatias visuais da Fase 2, o shell de automação não tem WindowServer: a confirmação visual (e agora **sonora**) deve ser feita por quem tiver sessão gráfica real antes de fechar a SPEC. O item de voz audivelmente distinta exige um SO com ≥2 vozes locais instaladas; havendo só uma, registrar isso e verificar apenas que o `voiceURI` carimbado é o escolhido.

**Estado persistente novo e o Artigo 11 — distinção a preservar (observação A8).** A Memória mantém autoridade exclusiva sobre **conhecimento** persistente. O arquivo de Personas é configuração de identidade criada explicitamente pelo usuário — não fato aprendido, não conteúdo de conversa, não candidato a recall no prompt. Essa leitura ("o Artigo 11 cobre conhecimento, não configuração de identidade") existe hoje **apenas** no contexto desta SPEC e do ADR-0020; ela é a premissa que autoriza um segundo arquivo durável fora do Memory Service e **precisa sobreviver ao fecho**: o `doc-sync` deve levá-la para as docs vivas (mínimo: `packages/persona/CLAUDE.md` e a entrada de `LESSONS_LEARNED`), sob pena de a próxima SPEC que precise persistir algo não-conhecimento reabrir a discussão do zero ou, pior, empurrar o dado para a Memória.

**Limitação conhecida: mensagem de erro do arquivo corrompido (A6).** O `PersonaError` de JSON inválido cita o caminho do arquivo (agora exigido no escopo e nos critérios). Isso é a única remediação oferecida ao usuário nesta fatia: não há reparo automático, backup do arquivo defeituoso, nem UI de recuperação — a app simplesmente não lista Personas custom e informa onde está o arquivo a ser corrigido à mão. Reparar/versionar o arquivo é candidato futuro.

**Limitação conhecida: escrita concorrente é lost-update (A7).** O storage é load-once + write-through, sem lock nem escrita atômica: dois `PersonaService` vivos sobre o mesmo arquivo (ex.: duas janelas, ou uma futura CLI rodando junto da GUI) podem se sobrescrever — o último `save` vence e as Personas criadas pelo outro processo desaparecem. Nesta fatia, a mitigação é a **serialização do renderer** (uma janela, painel desabilitado durante operações) e a ausência deliberada de consumidor de CLI. É exatamente o mesmo precedente já aceito pela Memória (ADR-0011), e não é reaberto aqui; quando a fatia de CLI existir — ou quando múltiplas janelas forem suportadas —, controle de concorrência vira requisito explícito.

**Limitação conhecida: `activePersonaId` valida o config inteiro para resolver só o campo `persona` (N4, achado não-bloqueante do gate).** `activePersonaId` chama `loadConfig(withSelections(configOverride), { personaIds })` quando não há seleção em memória — e `loadConfig` valida **todos** os campos do config (`logLevel`, `dataDir`, `permissions`, `model`...), não só `persona`. Um campo não relacionado inválido no `configOverride` (ex.: `logLevel` malformado) pode fazer `updatePersona`/`deletePersona` sobre uma Persona **não ativa** rejeitar com `InvalidConfigError`, mesmo a operação não tendo nada a ver com o campo inválido. Não é corrigido nesta fatia (o teto é o ADR-0020; extrair um resolvedor isolado só para `persona`, no molde de `resolveDataDir`, é exatamente o que a Decisão D17 rejeitou generalizar — "Alternativa descartada (4)" — por falta de um segundo consumidor real). Registrado como comportamento conhecido, não como defeito a corrigir.

**Fronteira que permanece humana.** Continuam fora, exigindo ADR próprio: entrada por voz (STT)/wake word; tornar as embutidas editáveis; mover Personas para a Memory; e qualquer forma de "Persona que altera capacidades" (Skills/Tools por Persona) — o PRD é explícito em preservar capacidades independentemente da Persona (l. 133).

---

# Checklist para IA

Antes de implementar:

- ler ADR-0020 (fonte estrutural), ADR-0011 (molde de storage), ADR-0010 (injeção na geração), ADR-0003, SPECs 0034/0035/0036/0037/0038 e o design aprovado em `docs/superpowers/specs/2026-07-28-desktop-persona-creation-design.md`;
- confirmar o estado atual de `packages/persona/src`, `packages/contracts/src/persona.ts`, `packages/core/src/index.ts`, `packages/core/src/config/load-config.ts`, `apps/desktop/src/core-bridge.ts`, `permission-grant-dialog.ts` e `speech-output.ts`;
- mapear todos os implementadores/fakes de `PersonaService` antes de mexer no contrato (`git grep 'PersonaService'`), inclusive os que usam `as unknown as` e só quebram em `pnpm test`.

Durante implementação:

- invariantes dentro do módulo dono (slug, obrigatoriedade, imutabilidade das embutidas) — a borda só antecipa recusas;
- **nunca** derivar o caminho do arquivo fora de `personaStoragePath`, e **nunca** resolver esse caminho por uma via que valide `persona`: no app, `resolveDataDir(withSelections(configOverride))`, jamais `loadConfig`;
- **nunca** chamar `loadConfig()` sem o `configOverride` efetivo da chamada; quando o `loadConfig` for necessário com Persona custom possível (`activePersonaId`, `createAtlas`), passar sempre `{ personaIds: personaService.list() }`;
- guardas de Persona pela **efetiva** (`selectedPersonaId() ?? config.persona`), não pela seleção em memória;
- consentimento antes de apagar, validações antes do consentimento;
- write-through e fail-high no storage; nenhuma escrita "corretiva" silenciosa;
- app fino; Core só no main process; nenhum import de `@atlas/persona` em `apps/*`;
- `<select>` de vozes reavaliado em `voiceschanged`, reusando o listener já existente;
- fallback de voz sempre **antes** do fail-closed da SPEC-0036, nunca no lugar dele;
- simplicidade: sem bundler, sem framework, formulário diagnóstico/mínimo.

Após implementação:

- rodar testes, lint, typecheck, os `grep` de fronteira e a checagem de diff vazio;
- smoke manual (8 itens, incluindo a repopulação de vozes, o uso da app com Persona custom ativa e a prova sonora);
- validar critérios de aceitação;
- registrar lições aprendidas e conclusão.

---

# Decisões de design

> Decisões tomadas pelo `spec-drafter` (Emenda v1.1), em formato de veto. As decisões **estruturais** (porta de storage; `voiceURI` com fallback) já foram tomadas pelo ADR-0020 e não são redecididas aqui. **D12-D16 são a resposta ao 1º veto do `architecture-reviewer`** (bloqueantes A1-A5); **D17 é a resposta ao 2º veto** (bloqueante B1 — deadlock circular introduzido pela própria correção A1), com a via de correção decidida pelo usuário na escalação. Quem ataca o que segue é o `architecture-reviewer` no gate `Draft → Ready`.

**D1. Perfil `completo`.**

- **Decisão**: classificar como `completo`.
- **Porquê**: falha **quatro** condições do ramo micro simultaneamente — toca `@atlas/contracts` (campo em `Persona` + membros em `PersonaService`), abrange quatro packages/apps (`contracts`, `persona`, `core`, `apps/desktop`), cria uma porta de persistência nova e deriva de um ADR **novo** (ADR-0020). Nenhuma dúvida de fronteira. Confirmado pelo reviewer no 1º gate.
- **Alternativa descartada**: `micro` — seria rebaixada no gate sem ganho algum.

**D2. Prioridade `Medium`.**

- **Decisão**: `Medium`.
- **Porquê**: cumpre um requisito explícito do PRD (Personalização, l. 129-135) e um pedido direto do usuário, mas não corrige defeito, não é segurança e não bloqueia nenhuma fase — a plataforma funciona hoje com as duas Personas embutidas. Mesmo peso das irmãs 0034/0037/0038.
- **Alternativa descartada**: `High` — reservada a fatia que abre fase (0031); `Critical` — reservada a correção/segurança bloqueante.

**D3. O storage é injetado em `createAtlas` por `deps.personaStorage?`, sem default de arquivo no Core.**

- **Decisão**: `CreateAtlasDeps.personaStorage?: PersonaStorage` (molde exato de `memoryStorage?`), sem default; `apps/desktop` injeta `createFilePersonaStorage(path)` (re-exportado por `@atlas/core`) em todas as funções que sobem o Core, exatamente como já injeta o `confirm` de diálogo desde a SPEC-0032; `apps/cli` não injeta nada.
- **Porquê**: é a única forma de honrar literalmente o ADR-0020 ("sem storage, idêntico a hoje, byte a byte, inclusive `apps/cli`") mantendo a composição no composition root. Reusa uma porta de injeção que já existe e é exercitada por testes, sem inventar mecanismo novo.
- **Alternativa descartada**: `createAtlas` compor `createFilePersonaStorage(join(config.dataDir, 'personas.json'))` por default — mais conveniente, porém mudaria o comportamento da CLI sem pedido (passaria a ler/criar arquivo novo e a enxergar Personas custom), contrariando o ADR-0020 nesta fatia.

**D4. O caminho do arquivo é derivado de `dataDir` (`<dataDir>/personas.json`), sem campo novo em `AtlasConfig`.**

- **Decisão**: o caminho é `join(dataDir, 'personas.json')`; `AtlasConfig`/`AtlasConfigOverride` ficam intocados. (A **forma** dessa derivação foi corrigida pela D13, e a **via** de resolução do `dataDir`, pela D17.)
- **Porquê**: mantém a fatia dentro do que o ADR-0020 decide (ele fala em "default `createFilePersonaStorage(path)`", não em nova chave de configuração). Um campo em `AtlasConfig` arrastaria precedência (`flags > env`), flags de CLI, validação e documentação de config — superfície nova para um valor que ninguém pediu para customizar. Convive com o `memory.path` (mesma pasta `~/.atlas`), e promover o caminho a config depois é aditivo.
- **Alternativa descartada**: `AtlasConfig.personas.path` com flag/env — mais configurável, porém amplia contrato e precedência sem demanda; se algum dia houver demanda real (perfis múltiplos), entra como fatia própria, aditiva.

**D5. `loadConfig` ganha `options.personaIds?` em vez de o Core validar a Persona em outro lugar.**

- **Decisão**: `loadConfig(override, options?: { readonly personaIds?: readonly string[] })`; `createAtlas` compõe o `PersonaService` primeiro e passa `personaService.list()`; sem o parâmetro, valida contra `PERSONA_IDS` como hoje.
- **Porquê**: a validação de config continua num lugar só (Configuration Service), e o conjunto de ids válidos passa a vir de quem tem autoridade sobre ele (o Persona Service) — em vez de o Core duplicar conhecimento sobre Personas. Aditivo, com não-regressão testável.
- **Alternativa descartada (1)**: `loadConfig` importar o storage e resolver as custom sozinho — colocaria IO e conhecimento de Persona dentro do Configuration Service, contra a responsabilidade única.
- **Alternativa descartada (2)**: remover a validação de `persona` do `loadConfig` e deixar o erro para `personaService.get` — perderia a mensagem de config estruturada (`InvalidConfigError`) que a CLI e os testes já dependem.

**D6. O CRUD do bridge é stateless **sem** subir o Core.**

- **Decisão**: `createPersona`/`updatePersona`/`deletePersona`/`describePersona` operam sobre um `PersonaService` construído na hora sobre o file storage (load-once por chamada, write-through) — sem `createAtlas`, sem lifecycle. `listPersonas`/`selectPersona` passam a usar o mesmo default.
- **Porquê**: preserva o **espírito** do molde citado no design aprovado (SPEC-0034: nada de estado mantido entre chamadas, porque o dado é durável em disco) pelo caminho mais simples. Honrar "sobe o Core por chamada" ao pé da letra exigiria expor `personaService` em `AtlasPlatform` — mudança de contrato que nem o ADR-0020 nem o design mencionam, que quebra os fakes tipados de `AtlasPlatform` (padrão recorrente das SPECs 0017/0022/0023/0025) e que faria a app ligar gateway, Tools, permissões e lifecycle inteiros só para editar um JSON. Mais simples, mais modular, mais rápido, igualmente testável. Confirmada pelo reviewer no 1º gate.
- **Alternativa descartada**: expor `AtlasPlatform.personas: PersonaService` e bootar o Core por operação — mais fiel à letra do design, porém mais caro em contrato, em fakes e em tempo de execução, sem ganho observável para o usuário.

**D7. As vozes do formulário vêm do próprio renderer — nenhum canal IPC de vozes.**

- **Decisão**: o `<select>` de voz é populado pelo adapter `synth` que já existe no renderer (`window.speechSynthesis`, filtrado por `localService === true`); nenhum canal `atlas:voices:list` é criado.
- **Porquê**: a Web Speech API **só existe no renderer** (Chromium) — o main process do Electron não tem `speechSynthesis`, então o canal "renderer → main" proposto no design (`§3`) não teria de onde ler as vozes. Correção factual, não mudança de intenção: a fonte continua sendo exatamente a mesma que `speech-output.ts` filtra hoje, e a fronteira do ADR-0019 (Core só no main) fica intacta — vozes não são domínio do Core.
- **Alternativa descartada**: canal IPC de vozes com o main lendo do SO por outro meio (ex.: binário de TTS do sistema) — introduziria uma dependência de plataforma nova e uma segunda fonte de verdade sobre vozes, contra a garantia unificada da SPEC-0036.

**D8. A preferência de voz entra como **provider** (`preferredVoiceURI: () => string | undefined`), não como valor fixo.**

- **Decisão**: `createSpeechOutput({ synth, preferredVoiceURI? })`, amostrado a cada `speak`.
- **Porquê**: a Persona ativa muda em runtime (SPEC-0037) e pode ser editada nesta SPEC; um valor fixo no construtor obrigaria o renderer a recriar o glue a cada troca — mais estado e mais chance de o botão "Ouvir" falar com a voz da Persona anterior. Molde já validado no repo (`memoryPrompt` como provider, SPEC-0021).
- **Alternativa descartada**: `speak(text, voiceURI?)` — empurra a decisão de voz para cada chamador (o renderer teria de lembrar de passar sempre), aumentando a chance de divergência entre botões.

**D9. `delete` da Persona ativa é recusado; `update` da Persona ativa encerra as sessões vivas.**

- **Decisão**: `deletePersona` sobre a Persona ativa rejeita, pedindo a troca antes; `updatePersona` na Persona ativa recusa com operação em voo e, ao aplicar, encerra as sessões de chat vivas (mesma mecânica de `selectPersona`). (O **critério** de "ativa" foi corrigido pela D15, e a **forma de resolvê-lo**, pela D17.)
- **Porquê**: é a decisão 10 do design aprovado, e o motivo técnico é o mesmo da D5 da SPEC-0037 — o `personaPrompt` é estático dentro de um Core vivo (SPEC-0021), então uma sessão sobrevivente falaria com identidade superada (Artigo 2); e apagar a Persona ativa deixaria a app apontando para um id inexistente, exigindo lógica de fallback de seleção que ninguém pediu.
- **Alternativa descartada**: apagar a ativa e voltar automaticamente para `jarvis` — silencioso, e inventa política de fallback não documentada.

**D10. `update` preserva o `id` mesmo quando o nome muda.**

- **Decisão**: renomear uma Persona custom não re-deriva o slug; o `id` é atribuído uma vez, no `create`.
- **Porquê**: o `id` é a chave usada pela seleção ativa e pelo arquivo; re-derivá-lo transformaria uma edição de texto numa operação de renomeação de chave (seleção órfã, colisões novas, migração). Mais transparente e mais sustentável.
- **Alternativa descartada**: re-derivar o slug a cada `update` — "id sempre coerente com o nome" é cosmético e custa integridade referencial.

**D11. Validação: só `name` precisa ser não vazio.**

- **Decisão**: `PersonaInput` exige todos os campos como propriedades, mas apenas `name` precisa ser não vazio após `trim`; os demais textos podem ser vazios e `communicationRules` pode ser lista vazia.
- **Porquê**: é exatamente o que a Persona embutida `neutral` já é (`voice: ''`, `emotion: ''`, `communicationRules: []`) — exigir mais do usuário do que o próprio repo exige de si seria incoerente, e `systemPrompt` já omite seções vazias. `name` é o único campo do qual o `id` e a exibição dependem.
- **Alternativa descartada**: exigir todos os campos não vazios — mais "completo" no papel, porém força o usuário a inventar texto para campos que a plataforma trata como opcionais na prática.

**D12. O re-export de catálogo de `@atlas/core` é alargado, de forma delimitada, para composição do Persona Service no app — e o parágrafo de fronteira de `packages/core/CLAUDE.md` é atualizado junto** (correção A4).

- **Decisão**: assumir explicitamente que esta SPEC ultrapassa a fronteira que a SPEC-0037/D4 fixou em `packages/core/CLAUDE.md` (l. 14) — "leitura de catálogo/config **inerte**", proibindo o app "instanciar um serviço da plataforma para injetá-lo em outro componente, ou montar/substituir wiring que hoje vive em `createAtlas`". O app passa a (a) instanciar um `PersonaService` sobre `createFilePersonaStorage`, (b) injetar esse storage em `createAtlas`, (c) duplicar wiring que o `createAtlas` também faz. A fronteira nova, a ser escrita no `CLAUDE.md`: **permitido** compor, a partir de re-exports de `@atlas/core`, exatamente o `PersonaService` sobre a porta de storage que o ADR-0020 criou, e injetar essa porta em `createAtlas` pelo `deps` público — porque o próprio ADR-0020 desenhou essa porta para ser injetada por quem compõe, e deliberadamente não a deu como default. **Continua proibido, sem ADR**: compor qualquer outro serviço da plataforma no app, substituir wiring interno de `createAtlas`, ou compor um segundo Core.
- **Porquê**: a alternativa "não alargar" exigiria mover a composição para dentro de `createAtlas` — o que o ADR-0020 proíbe nesta fatia (a CLI passaria a ler/criar o arquivo) — ou expor `personaService` em `AtlasPlatform`, rejeitado pela D6. O ADR-0020 (decisão humana, `Accepted`) autoriza a porta e o padrão de injeção; o que faltava não era respaldo, era **registro**: uma fronteira documentada que muda em silêncio deixa de ser fronteira. Registrar aqui e atualizar o `CLAUDE.md` mantém a regra verificável para a próxima SPEC.
- **Alternativa descartada (1)**: manter o texto atual do `CLAUDE.md` e simplesmente fazer a composição — a fronteira viraria letra morta, e a próxima SPEC herdaria "o app pode compor serviços" sem limite escrito.
- **Alternativa descartada (2)**: escalar pedindo ADR novo — o ADR-0020 já é a decisão humana sobre exatamente este ponto (porta injetável, sem default); um ADR só para dizer quem chama o construtor seria burocracia sobre decisão já tomada.

**D13. O caminho do arquivo é derivado por uma função pura `personaStoragePath` em `@atlas/core`, sempre a partir do config efetivo da chamada** (correções A1 + A4.3).

- **Decisão**: `@atlas/core` exporta `personaStoragePath(dataDir: string): string` (pura, sem IO); `apps/desktop` a usa dentro de um helper único `personaStorageFor(configOverride)`; as quatro funções de CRUD ganham `deps.configOverride?`, ponto de injeção equivalente ao das cinco funções que sobem o Core; nenhum `join(..., 'personas.json')` existe fora de `packages/core/src`. (A **via** pela qual o app obtém o `dataDir` efetivo — `resolveDataDir`, e não `loadConfig` — foi corrigida pela D17; a assinatura da função passou de `(config: AtlasConfig)` para `(dataDir: string)` pela mesma razão.)
- **Porquê**: o rascunho anterior usava `loadConfig()` **sem** override, então o storage apontava sempre para o `dataDir` default enquanto o Core daquela chamada podia estar num `dataDir` completamente outro — o critério de round-trip com `dataDir` temporário isolado era literalmente inalcançável, e em produção qualquer futuro override de `dataDir` partiria as Personas do resto do estado. Derivar do config efetivo elimina a divergência por construção; centralizar a derivação em `@atlas/core` garante que a fatia de CLI futura encontre o **mesmo** arquivo (Personas invisíveis entre interfaces seria o pior modo de falha possível — silencioso e confuso).
- **Alternativa descartada (1)**: manter a derivação no app, só corrigindo o override — resolveria o A1, não o A4.3: a CLI futura reinventaria o `join`, com risco alto de divergir (`persona.json`/`personas/` etc.).
- **Alternativa descartada (2)**: `personaStoragePath()` resolver o config internamente (chamando `loadConfig` por dentro) — voltaria a esconder qual config está sendo usado e tornaria a função impura/testável só com IO; receber o valor já resolvido deixa a dependência explícita (ADR-0004).

**D14. Apagar uma Persona exige consentimento explícito por diálogo nativo, com porta injetável e default fail-closed** (correção A3, Artigo 8).

- **Decisão**: `deletePersona` só apaga após `PersonaDeleteConfirmPort.request({ id, name })` resolver `true`; a porta é injetável (`deps.confirmDelete?`) com **default fail-closed** (ausente ⇒ nada é apagado); a implementação de produção é um diálogo nativo (`dialog.showMessageBox`) num módulo próprio `src/persona-delete-dialog.ts`, no molde literal de `permission-grant-dialog.ts` (SPEC-0038), construído uma vez em `main.ts`; as validações (embutida/inexistente/ativa) correm **antes** do diálogo.
- **Porquê**: a ação é destrutiva, irreversível e cara de refazer (8 campos escritos à mão, sem export/import, sem undo) — o Artigo 8 pede que o usuário perceba e consinta. O precedente do `forgetFact` (SPEC-0034, sem confirmação) não se aplica: lá a justificativa **era** a paridade com `atlas forget`, um comando de CLI equivalente que esta SPEC não tem (a CLI de Persona está explicitamente Fora do Escopo). Escolher o diálogo **nativo** em vez de dois passos no renderer mantém a decisão de consentimento no mesmo lugar onde o app já a coloca (`confirm` de Tool destrutiva, `confirmGrant` de política), reusa um fail-closed já testado e mantém o renderer burro; e a porta injetável deixa a garantia coberta por teste no Vitest, coisa que um `confirm()` de DOM não seria.
- **Alternativa descartada (1)**: confirmação em dois passos no renderer ("Apagar" → "Confirmar?" inline) — mais leve visualmente, porém a garantia viveria em `renderer.js`, camada explicitamente não unit-testada nesta app; a proteção contra remoção acidental dependeria só de smoke manual.
- **Alternativa descartada (2)**: nenhuma confirmação, por paridade com `forgetFact` — a paridade não existe (sem CLI equivalente) e o dano é maior: um fato esquecido é reaprendível numa frase, uma Persona apagada é retrabalho manual completo.

**D15. As guardas de `update`/`delete` comparam com a Persona *efetiva*, não com a seleção em memória** (correção A5).

- **Decisão**: `activePersonaId(configOverride, personaService) = selectedPersonaId() ?? loadConfig(withSelections(configOverride), { personaIds: personaService.list() }).persona`, usado por `updatePersona` (para decidir se encerra sessões) e por `deletePersona` (para recusar). (O `personaIds` no segundo termo é a correção da D17: sem ele, um `config.persona` custom faria a guarda lançar `InvalidConfigError` em vez de resolver.)
- **Porquê**: `selectedPersonaId()` é `undefined` até o usuário trocar de Persona pela GUI; nesse estado, o Core sobe com `config.persona`. Comparar só com a seleção fecha o buraco **por acidente** hoje (o `main.ts` não passa `configOverride` e o `defaultConfig` não lê env), mas duas fatias já nomeadas — persistir a Persona ativa entre reinícios e honrar `ATLAS_PERSONA` no desktop — reabrem-no: o usuário apagaria a Persona ativa e todo `createAtlas` seguinte falharia com `InvalidConfigError`, app inutilizável até reiniciar. Uma guarda que depende de outra fatia *não* acontecer não é guarda; corrigir agora custa uma linha e um teste.
- **Alternativa descartada (1)**: manter `selectedPersonaId()` e adiar — deixa uma bomba-relógio armada numa fatia futura, que provavelmente não lembrará de desarmá-la.
- **Alternativa descartada (2)**: tolerar a remoção e fazer o Core cair em `jarvis` quando o id sumir — é exatamente a política de fallback silenciosa rejeitada pela D9 (e exigiria mudar o `loadConfig`, que hoje falha alto por bom motivo).

**D16. A6/A7/A8 entram como limitação/observação registrada, sem redesenho** (não bloqueantes do gate).

- **Decisão**: (A6) o `PersonaError` de arquivo corrompido passa a citar o caminho — mudança de uma linha, com critério de aceitação; (A7) a escrita concorrente permanece lost-update, registrada como limitação conhecida com sua mitigação atual (serialização do renderer, ausência de consumidor de CLI) e o gatilho para virar requisito (CLI ou múltiplas janelas); (A8) a leitura "Artigo 11 cobre conhecimento, não configuração de identidade" fica registrada nas Observações com instrução explícita para o `doc-sync` levá-la às docs vivas.
- **Porquê**: A6 é barato e melhora diretamente a única remediação oferecida ao usuário (corrigir o arquivo à mão), então entra. A7 é o **mesmo** precedente já aceito pelo Memory Service (ADR-0011): resolvê-lo aqui significaria inventar política de concorrência para um package e não para o outro — incoerente e fora do teto do ADR-0020. A8 é uma premissa arquitetural que hoje só existe em documento de fatia; sem registro, a próxima SPEC que precise persistir algo não-conhecimento reabre a discussão ou empurra o dado para a Memória.
- **Alternativa descartada**: resolver o A7 nesta SPEC (lock ou escrita atômica por `rename`) — aumentaria o escopo, criaria assimetria com a Memória e endereçaria um cenário que a fatia atual (uma janela, sem CLI) não produz.

**D17. `dataDir` ganha um resolvedor próprio em `@atlas/core` (`resolveDataDir`), extraído de dentro do `loadConfig`; achar o arquivo de Personas nunca passa pela validação de `persona`** (correção B1, via decidida pelo usuário na escalação do 2º veto).

- **Decisão**: extrair `packages/core/src/config/data-dir.ts` com a precedência de `dataDir` (`flags > env > defaults`, hoje `override.dataDir ?? defaultConfig().dataDir`) e exportar `resolveDataDir(override?: AtlasConfigOverride): string` — que valida apenas "string não vazia" e lança `InvalidConfigError` com a mensagem de hoje, **sem tocar no campo `persona`** e sem acionar `PERSONA_IDS`. O `loadConfig` passa a **consumir a mesma precedência** desse módulo (helpers internos, não exportados do package), preservando byte a byte suas mensagens e o acúmulo de `issues`. No bridge, `personaStorageFor(configOverride)` = `createFilePersonaStorage(personaStoragePath(resolveDataDir(withSelections(configOverride))))` — nenhum `loadConfig` no caminho. Onde o `loadConfig` continua necessário com Persona possivelmente custom (`activePersonaId`, além do `createAtlas` da D5), ele é chamado **com** `{ personaIds: personaService.list() }`, de modo que a Persona custom seja resolvida em vez de rejeitada.
- **Porquê**: a correção A1 (D13) trocou `loadConfig()` por `loadConfig(withSelections(cfg))` para acertar o `dataDir` efetivo e, com isso, criou um **ciclo**: `withSelections` injeta a Persona selecionada, `loadConfig` valida `persona` contra `PERSONA_IDS` (l. 43-47), e assim, a partir do primeiro `selectPersona('<id custom>')`, todas as seis funções de Persona e as cinco que sobem o Core passariam a lançar `InvalidConfigError` antes de qualquer trabalho útil — a app ficaria inutilizável exatamente no cenário central desta SPEC. As duas perguntas são independentes por natureza ("onde está o arquivo?" depende só de `dataDir`; "a Persona ativa existe?" depende do catálogo, que só é conhecível **depois** de abrir o arquivo), e o ciclo desaparece ao separá-las. Extrair para dentro de `packages/core` — em vez de o app resolver `dataDir` por conta própria — mantém **uma única** implementação da precedência (`loadConfig` e `resolveDataDir` leem do mesmo módulo, com teste de igualdade entre os dois), respeitando o ADR-0006 e o mesmo princípio de "um único derivador" que a D13 aplicou ao caminho.
- **Alternativa descartada (1)**: uma função só no app (ou um `dataDirFor(override)` no bridge) que reimplementa `override.dataDir ?? default` — resolveria o deadlock com diff menor, mas criaria **duas** lógicas de precedência de `dataDir` no repositório, prontas para divergir assim que o slot `arquivo` do ADR-0006 ou uma env de `dataDir` existir; e violaria o ADR-0003 (resolução de config é do Configuration Service, não do app).
- **Alternativa descartada (2)**: `loadConfig` deixar de validar `persona` (ou passar a ignorar ids desconhecidos) — mataria o deadlock, mas jogaria fora a validação de config estruturada que a CLI e os testes dependem, contra a D5 e a alternativa já descartada nela.
- **Alternativa descartada (3)**: `personaStorageFor` chamar `loadConfig(withSelections(cfg), { personaIds: <catálogo> })` — circular por construção: para montar `personaIds` é preciso já ter o storage aberto, que é justamente o que se quer descobrir; e um catálogo "chutado" (só embutidas) reintroduziria a falha para Personas custom.
- **Alternativa descartada (4)**: generalizar a extração para todos os campos (`resolveLogLevel`, `resolvePersona`, `resolvePermissions`…) — simetria bonita, porém escopo inflado sem consumidor real: só `dataDir` tem um chamador que precisa resolvê-lo isoladamente. Os demais entram se e quando alguém precisar (aditivo).

---

# Resultado Esperado

O Atlas passa a permitir que o usuário **defina** a identidade com que a plataforma fala com ele, e não apenas escolha entre duas identidades de fábrica. Pela janela do `@atlas/desktop`, ele cria uma Persona preenchendo os oito atributos que o Module Catalog atribui ao Persona Service, escolhe uma voz real entre as vozes locais do sistema (lista que se completa sozinha quando o SO reporta as vozes), edita e apaga suas Personas — a remoção sempre precedida de consentimento explícito num diálogo nativo — tudo persistido num arquivo JSON próprio, sob a autoridade do Persona Service, que ganhou uma porta de storage injetável no molde já validado do Memory Service (ADR-0011/ADR-0020) e cujo caminho é derivado num único lugar do repositório, a partir do config efetivo de cada chamada e por uma via que **não** depende de a Persona ativa ser conhecida — de modo que a app siga plenamente utilizável justamente quando uma Persona custom está selecionada. `jarvis` e `neutral` continuam embutidas e imutáveis, garantindo um fallback conhecido mesmo que o arquivo do usuário se perca, e nenhuma Persona efetivamente ativa pode ser apagada debaixo do próprio Core. A Persona custom selecionada é injetada na geração pelo caminho de sempre (ADR-0010, intacto) e, ao ouvir uma resposta, o usuário escuta a **voz que escolheu** — com degradação previsível para a voz local determinística das SPECs 0035/0036 quando aquela voz não existir na máquina, e jamais para uma voz de rede. Nada disso vaza para os demais módulos: `@atlas/cognitive` continua recebendo só uma string, `apps/cli` fica com diff vazio e comportamento byte a byte igual ao de hoje, e `apps/desktop` segue importando implementação apenas do composition root — dentro de uma fronteira de composição agora **escrita**, não presumida. É a fatia que a SPEC-0037 nomeou como "a próxima, precedida de brainstorming humano e ADR" — agora fechada, deixando explicitamente para o futuro a entrada por voz, a CLI equivalente e qualquer forma de Persona que altere capacidades.
