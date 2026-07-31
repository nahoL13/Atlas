# SPEC-0044 — CLI: criar/editar/apagar/listar Personas custom (`atlas persona`)

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0044

---

**Título**

CLI de Persona — equivalente de terminal do CRUD de Personas custom entregue pela SPEC-0039 no desktop: `atlas persona list|show|create|edit|delete`, sobre o mesmo arquivo `personas.json`, com consentimento explícito na remoção

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

`Fase 2 — 2.4 Persistência e Gerência Local` (linha de Persona, **extensão** autorizada pelo [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md)), na vertente **paridade de interface**.

**Exceção consciente registrada**: o Roadmap não tem item de CLI na Fase 2 — a Fase 2 é sobre `apps/desktop`, e o item 2.4 já está marcado como entregue/estendido (l. 159-164). Esta SPEC é o **espelho inverso** do Critério de Conclusão da Fase 2 ("o app cobre os mesmos casos de uso do CLI hoje suportados", l. 168): a SPEC-0039 abriu uma capacidade que existe **só** na GUI, e o Princípio Orientador do Roadmap (l. 29) autoriza explicitamente "ajustes pontuais na CLI" fora dos itens numerados, por ela seguir sendo o consumidor de validação do Core. A base no PRD é a mesma da SPEC-0039 (Personalização, l. 129-135). O registro no Roadmap (marcar a paridade de CLI na linha de extensão do 2.4) é passo de fecho (`doc-sync`), não do implementador.

---

# Objetivo

Ao final desta SPEC, o usuário consegue **criar, ver, editar e apagar Personas custom pelo terminal**, sem abrir a janela do desktop, e **usá-las** nos comandos que já existem:

- família de subcomandos nova: `atlas persona list`, `atlas persona show <id>`, `atlas persona create "<nome>" [flags]`, `atlas persona edit <id> [flags]`, `atlas persona delete <id> [--yes]`;
- as Personas criadas pela CLI e as criadas pela GUI são **as mesmas**: o arquivo é o único `<dataDir>/personas.json`, derivado pela função canônica `personaStoragePath(resolveDataDir(...))` de `@atlas/core` (SPEC-0039/§3), nunca por um `join` reinventado;
- `apps/cli` passa a injetar `personaStorage` em `createAtlas`, de modo que `--persona <id-custom>` / `ATLAS_PERSONA=<id-custom>` resolvem em `atlas status`/`ask`/`chat` como qualquer Persona embutida — hoje falham com `InvalidConfigError`;
- apagar uma Persona custom exige **consentimento explícito** (prompt interativo, ou `--yes` para uso não interativo), fail-closed: EOF, resposta diferente de "s"/"sim" ou ausência de leitor não apagam nada;
- `jarvis`/`neutral` continuam embutidas, imutáveis e somente-leitura também pela CLI;
- o adapter de arquivo de `@atlas/persona` passa a gravar de forma **atômica** (escrita em arquivo temporário no mesmo diretório + `rename`), fechando o modo de falha que a SPEC-0039 aceitou apenas enquanto **não** houvesse consumidor de CLI.

Nenhum contrato público muda; nenhuma decisão arquitetural nova é tomada.

---

# Motivação

O PRD estabelece, em Personalização (l. 129-135): "O sistema deve permitir diferentes Personas" e "O usuário deve poder selecionar sua Persona preferida". A SPEC-0039 realizou isso — mas **só na GUI**. Hoje o repositório tem uma assimetria concreta: quem usa o Atlas pelo terminal (o público-alvo declarado do PRD, l. 29-33: desenvolvedores e usuários avançados) não pode definir a identidade com que o Atlas fala, e pior — não consegue nem **usar** uma Persona criada na janela, porque `createAtlas` sem `personaStorage` valida `--persona` contra `PERSONA_IDS` (só embutidas) e rejeita o id custom com `InvalidConfigError`. A capacidade existe, o dado está em disco, e a CLI não o enxerga.

Essa fatia foi antecipada nominalmente três vezes, sempre com a mesma conclusão — é composição, não redesenho:

- [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md): "`apps/cli` não ganha comando novo **nesta fatia** (equivalente de CLI fica candidato futuro independente)";
- SPEC-0039, Fora do Escopo: "`apps/cli` **não** injeta `personaStorage` nesta fatia … o caminho canônico `personaStoragePath` fica pronto em `@atlas/core` justamente para que essa fatia futura não invente outro caminho";
- SPEC-0039, Observações: "a **fatia de CLI**, quando existir, será uma linha de composição — não um redesenho".

O segundo problema resolvido aqui é a contrapartida dessa mesma antecipação. `packages/persona/CLAUDE.md` registra que a escrita concorrente é lost-update e que a mitigação vigente é "a ausência de consumidor de CLI e a serialização do renderer" — e que isso "vira **requisito explícito** quando um desses deixar de valer". Esta SPEC é exatamente o momento em que deixa de valer: responder a isso não é expansão de escopo, é cumprir uma condição já escrita.

---

# Referências

- `docs/02-product/ProductRequirementsDocument.md` — Personalização (l. 129-135), Público-Alvo (l. 29-33), Restrições ("não executar ações destrutivas sem autorização adequada", l. 193), Critérios de Qualidade ("consistência de comportamento", l. 205)
- [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) (Accepted) — **fonte estrutural**: `PersonaStorage` injetável, embutidas imutáveis, `Persona.voiceURI?`; antecipa esta fatia nominalmente
- [ADR-0021](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) (Accepted) — Piper como motor local de voz; `voiceURI` aceita também `piper:<id>` (base da D8)
- [ADR-0010](../../06-adr/ADR-0010-persona-injected-generation.md) — Persona injetada na geração; `systemPrompt` inalterado por esta SPEC
- [ADR-0011](../../06-adr/ADR-0011-memory-service-persistence.md) — molde de porta de storage injetável (load-once + write-through)
- [ADR-0003](../../06-adr/ADR-0003-core-composition-root.md) — `apps/*` importam implementação **só** de `@atlas/core`
- [ADR-0006](../../06-adr/ADR-0006-config-source-precedence.md) — `flags > env > arquivo > defaults`; slot `arquivo` segue não implementado (razão de `atlas persona use` ficar fora — D2)
- [ADR-0005](../../06-adr/ADR-0005-app-typescript-execution.md) — CLI roda o fonte via `tsx`, sem `dist/`
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) (Done) — CRUD de Persona na GUI; **D12** (fronteira alargada do re-export: compor `createPersonaService({ storage })` no app é permitido), **D17** (`resolveDataDir`, correção do deadlock B1), `personaStoragePath`, guarda de Persona ativa, consentimento de remoção
- [SPEC-0037](SPEC-0037-desktop-runtime-persona-switch.md) (Done) — **D4**: re-export de catálogo em `@atlas/core`; esta SPEC é o **2º consumidor real** dele
- [SPEC-0041](SPEC-0041-desktop-piper-only-voice-surface.md) / [SPEC-0043](SPEC-0043-desktop-voice-residues.md) (Done) — política Piper-only da superfície de voz e tratamento de `voiceURI` persistida não-ofertável (contexto obrigatório da D8)
- [SPEC-0003](SPEC-0003-cli-foundation.md) (Done) — `run()` testável, Input/Output Gateway, `CliUsageError`
- [SPEC-0014](SPEC-0014-tools-confirm-in-chat.md) (Done) — `LineReader` + `createLineReaderConfirmPort`: molde de consentimento no terminal, fail-closed em EOF
- [SPEC-0023](SPEC-0023-legacy-fact-consolidation-dedupe.md) / [SPEC-0025](SPEC-0025-skills-registry-builder.md) (Done) — molde de família de subcomandos na CLI (`memory list|dedupe`, `skills list|build`): parsing no `input-gateway`, despacho no `run.ts`, render em `commands/*`
- `docs/03-architecture/ModuleCatalog.md` — Persona Service (l. 838-883, "deve controlar … voz"); Input/Output Gateway (l. 886-954, localização em `apps/*`)
- `docs/00-project/ArchitectureConstitution.md` — Artigo 3 (IA não move responsabilidade), Artigo 8 (transparência/consentimento), Artigo 11 (Memória e conhecimento persistente), Artigo 15 / Emenda v1.1
- `packages/core/CLAUDE.md` (l. 14-19) — fronteira vigente do re-export e contrato de `resolveDataDir`/`personaStoragePath`
- `packages/persona/CLAUDE.md` — invariantes do CRUD e a limitação de lost-update que esta SPEC é obrigada a reabrir
- `apps/desktop/src/core-bridge.ts` (l. 76, 193-198) — precedente literal de como listar Personas e derivar "embutida" sobre o contrato real (§3)

---

# Escopo

## 1. `apps/cli` — composição do Persona Service e do storage

- novo módulo `src/gateway/persona-composition.ts`, com duas funções puras de composição:
  - `createCliPersonaStorage(configOverride: AtlasConfigOverride): PersonaStorage` — `createFilePersonaStorage(personaStoragePath(resolveDataDir(configOverride)))`, tudo importado de `@atlas/core` (re-exports da SPEC-0037/D4 + SPEC-0039). **Nunca** chama `loadConfig`: achar o arquivo é independente de a Persona ativa ser válida (D17 da SPEC-0039, correção do deadlock B1);
  - `createCliPersonaService(configOverride: AtlasConfigOverride): PersonaService` — `createPersonaService({ storage: createCliPersonaStorage(configOverride) })`, exceção delimitada já autorizada por `packages/core/CLAUDE.md` (l. 15-17, SPEC-0039/D12);
- `src/run.ts` passa a injetar `personaStorage: createCliPersonaStorage(parsed.configOverride)` em `createAtlas`, ao lado do `confirm`/`fetch` já injetados — de modo que **todos** os comandos existentes (`status`/`ask`/`chat`/`remember`/`forget`/`memory`/`skills`) resolvam Personas custom em `--persona`/`ATLAS_PERSONA`. **Custo aceito e coberto por critério** (D10): o arranque de todo comando passa a **ler** `personas.json`, então um arquivo corrompido — fail-high por desenho — deixa de afetar só `atlas persona` e passa a derrubar `status`/`ask`/`chat` também; a mensagem precisa citar o caminho e a saída de emergência precisa estar documentada;
- os subcomandos de `persona` **não sobem o Core** (`createAtlas` não é chamado): `run.ts` desvia para `runPersona*` **antes** da criação do Atlas, usando só `createCliPersonaService(...)` — ver D5.

## 2. `apps/cli` — parsing (`src/gateway/input-gateway.ts`)

- `ParsedInput.command` ganha `'persona'`; campos novos, todos opcionais: `personaSubcommand?: 'list' | 'show' | 'create' | 'edit' | 'delete'`, `personaId?: string`, `personaName?: string`, `personaFields?: PersonaFieldPatch`, `personaAssumeYes?: boolean`;
- `parseArgs` ganha as opções: `--name` (string), `--tone`, `--formality`, `--language`, `--style`, `--voice`, `--emotion`, `--voice-uri` (strings), `--rule` (string, `multiple: true`) e `--yes` (boolean);
- regras de uso, todas `CliUsageError` (exit 2, molde dos demais comandos):
  - subcomando ausente ⇒ `list` (molde de `memory`/`skills`); subcomando desconhecido ⇒ erro citando `list|show|create|edit|delete`;
  - `show`/`edit`/`delete` sem `<id>` (ou `id` em branco) ⇒ erro;
  - `create` sem o positional `"<nome>"` (ou em branco) ⇒ erro; `create` com `--name` ⇒ erro ("o nome de `persona create` é o positional");
  - `edit` sem nenhuma flag de campo ⇒ erro ("nada a alterar: informe ao menos um campo");
  - flags de campo (`--name`/`--tone`/…/`--rule`) usadas com `list`/`show`/`delete` ⇒ erro; `--yes` usado com subcomando diferente de `delete` ⇒ erro;
- `PersonaFieldPatch` é um objeto **parcial** e literal do que o usuário informou (sem defaults, sem preenchimento): cada chave só existe se a flag correspondente apareceu. `--rule` repetível vira `readonly string[]` com segmentos vazios/só-espaço filtrados (`filterNonEmpty`, já existente) — `--rule ""` isolado significa **lista vazia** (limpar as regras), não "não informado";
- a borda **não** valida semântica de Persona (id embutido, id inexistente, nome que colapsa em slug vazio): isso é invariante do módulo (`@atlas/persona`), como em `--category` da SPEC-0029 — a CLI só antecipa erro de **uso**.

## 3. `apps/cli` — comandos (`src/commands/persona.ts`)

Todas as funções recebem o `PersonaService` **injetado** (testáveis com fake, sem disco) e o `OutputGateway`; nenhuma delas compõe storage por conta própria.

**Mecanismo de listagem e da marca "embutida" — sobre o contrato real, sem inventar campo.** `PersonaService.list()` devolve `readonly string[]` (**ids**, não objetos — `packages/persona/src/persona-service.ts` l. 115-117) e `Persona` **não tem** campo `builtin` (`packages/contracts/src/persona.ts` l. 1-21). Logo: iterar `list()`, resolver cada item por `get(id)`, e derivar a marca por `PERSONA_IDS.includes(id)` (re-exportado por `@atlas/core`). É o mecanismo já usado por `listPersonas`/`describePersona` em `apps/desktop/src/core-bridge.ts` (l. 193-198 e 76) — precedente literal, **nenhuma** mudança em `@atlas/contracts` (proibida por esta SPEC). A ordem exibida é a do próprio `list()` (embutidas primeiro, custom em ordem de carga — garantia do módulo desde a SPEC-0039).

- `runPersonaList(personaService, output)` — uma linha por Persona: `<id>  <nome>  [embutida|custom]`, com `<nome>` vindo de `get(id).name` e a marca derivada de `PERSONA_IDS`; nunca falha por lista vazia de custom;
- `runPersonaShow(personaService, id, output)` — imprime os 8 campos de `get(id)` + o `id` + a marca embutida/custom (derivada, nunca lida de `Persona`) + `voiceURI` quando presente; `communicationRules` uma por linha;
- `runPersonaCreate(personaService, name, patch, output)` — monta o `PersonaInput` completo: `name` do positional, cada campo textual ausente vira `''` (paridade com a `neutral` embutida), `communicationRules` ausente vira `[]`, `voiceURI` **omitido** quando ausente (compatível com `exactOptionalPropertyTypes`); imprime `Persona criada [<id>]: <nome>` (o `id` derivado por slug é do módulo — a CLI só exibe);
- `runPersonaEdit(personaService, id, patch, output)` — **patch sobre a Persona atual**: lê `personaService.get(id)`, sobrepõe apenas os campos informados e chama `update(id, input)`; campos não informados são preservados **incluindo `voiceURI`** (`--voice-uri ""` é a forma de limpá-lo); imprime `Persona atualizada [<id>]: <nome>`;
- `runPersonaDelete(personaService, id, output, deps)` — ordem obrigatória: (1) resolve a Persona (`get`, que já rejeita id inexistente) e recusa id embutido **antes** de perguntar qualquer coisa; (2) se `assumeYes !== true`, pede consentimento pelo `LineReader` injetado, com aviso adicional quando o id coincide com `configOverride.persona` (comparação **crua**, sem `loadConfig` — D6); (3) só então `delete(id)`. Sem leitor e sem `--yes` ⇒ recusa (fail-closed). Recusa/EOF ⇒ `Remoção cancelada; nada foi apagado.` e código de saída **1** (D7);
- render exclusivamente pelo `OutputGateway` (nenhum `console.*`); nenhuma lógica de validação/slug/persistência vive aqui.

## 4. `apps/cli` — despacho e ajuda (`src/run.ts`)

- despacho do bloco `persona` **antes** de `createAtlas`; o `LineReader` (hoje criado só para `chat`) passa a ser criado também para `persona delete` sem `--yes`, pela mesma via (`deps.createLineReader ?? createReadlineLineReader`) e fechado no mesmo `finally`;
- tratamento de erro: `PersonaError` (`AtlasError` com code `ATLAS_PERSONA`) vira mensagem amigável em `stderr` e código **1** — nunca stack trace crua. Isso vale **também** quando o erro nasce dentro de `createAtlas` (arquivo de Personas corrompido lido no arranque de qualquer comando, D10): a mensagem cita o caminho do arquivo e a saída de emergência (corrigir/remover o arquivo, ou apontar outro `--data-dir`). `CliUsageError` segue em 2; `InvalidConfigError` segue em 1 com a lista de `issues`;
- `HELP_TEXT` ganha as cinco linhas de `persona …` e as flags novas; a linha do `--persona` deixa de dizer `(jarvis|neutral)` e passa a `(jarvis|neutral|<id custom>)`; a linha de `--voice-uri` declara as formas aceitas (`piper:<id>` ou o `voiceURI` de uma voz do SO) e que a CLI **não** valida nem reproduz voz (D8).

## 5. `@atlas/persona` — escrita atômica no adapter de arquivo

- `createFilePersonaStorage(path).save` passa a gravar em arquivo temporário **no mesmo diretório** do alvo (mesmo sistema de arquivos, para o `rename` ser atômico) e substituir o alvo por `renameSync`; falha em qualquer etapa lança `PersonaError` citando o caminho, sem deixar o alvo parcialmente escrito. O temporário é removido em caso de falha (best-effort, nunca mascarando o erro original);
- `load` **inalterado** (fail-high já correto);
- nenhuma mudança de assinatura, de contrato ou de semântica visível: a diferença observável é só a ausência de arquivo truncado sob falha/concorrência.

## 6. Documentação da própria SPEC

- atualizar `apps/cli/CLAUDE.md`: família `persona`; composição do storage via `@atlas/core` (exceção D12 reusada); semântica de patch do `edit`; significado de `--rule ""`/`--voice-uri ""`; **formas aceitas de `voiceURI`** (`piper:<id>` | `voiceURI` do SO) com a política vigente das SPECs 0041/0043 (D8); consentimento fail-closed; e o **raio de alcance da D10** — todo comando passa a ler `personas.json` no arranque, um arquivo corrompido derruba qualquer comando, e a saída de emergência é corrigir/remover o arquivo citado na mensagem ou apontar outro `--data-dir`;
- atualizar `packages/persona/CLAUDE.md` (escrita atômica; reescrita do parágrafo de lost-update, que hoje afirma que a mitigação é "a ausência de consumidor de CLI").

---

# Fora do Escopo

- **`atlas persona use <id>`** — seleção durável de Persona. Fica fora por falta de mecanismo: a seleção durável exigiria persistir preferência de config, e o slot `arquivo` do ADR-0006 **não existe** (mesma razão da D3 da SPEC-0037, que deixou a seleção do desktop não durável). A escolha de Persona na CLI continua sendo `--persona <id>` / `ATLAS_PERSONA` — que esta SPEC faz funcionar com ids custom. Ver Decisão D2;
- **marcar a Persona ativa em `atlas persona list`** — exigiria `loadConfig` (reintroduzindo o deadlock B1) ou um `resolvePersona` novo em `@atlas/core` (generalização explicitamente rejeitada pela D17 da SPEC-0039). A Persona efetiva já é visível em `atlas status`. Ver Decisão D6;
- **guarda "não apague a Persona ativa"** equivalente à do desktop — substituída por um **aviso** no prompt de consentimento; ver Decisão D6;
- **listar/escolher/validar/reproduzir vozes na CLI** — `--voice-uri` é string opaca: a CLI não tem Web Speech API (é do renderer do Chromium) nem catálogo Piper (main process do Electron, SPEC-0040/0041), e criar um canal de vozes na CLI seria superfície de voz nova sem ADR. Ver Decisão D8;
- **higiene geral de flags irrelevantes no `input-gateway`** (hoje `atlas ask "x" --tone y` é silenciosamente aceito, comportamento pré-existente para todas as flags) — candidata a fatia própria, explicitamente **não** incorporada aqui; esta SPEC só valida a coerência das flags **dentro** da família `persona`;
- **qualquer mudança em `@atlas/contracts`** — `Persona`, `PersonaInput` e `PersonaService` já têm tudo que esta SPEC consome;
- **qualquer mudança em `@atlas/core`** — `createPersonaService`, `createFilePersonaStorage`, `resolveDataDir`, `personaStoragePath`, `PERSONA_IDS` e `CreateAtlasDeps.personaStorage?` já existem e são suficientes; diff **vazio** em `packages/core`;
- **qualquer mudança em `apps/desktop`** — diff **vazio** (a escrita atômica do §5 o beneficia sem exigir alteração);
- **tornar `jarvis`/`neutral` editáveis/apagáveis**, migrá-las para o storage, ou exportar/importar Personas — rejeitado no ADR-0020 / fora da SPEC-0039;
- **controle de concorrência completo** (lock de arquivo, detecção de escrita externa por `mtime`, read-modify-write antes de cada `save`) — esta SPEC entrega apenas a **atomicidade da substituição**; o lost-update entre uma GUI aberta há muito tempo e uma CLI que grava depois permanece, agora documentado como limitação **ativa** (não mais "mitigada pela ausência de CLI"). Ver Decisão D9 e Observações;
- **reparo/backup/UI de recuperação do `personas.json` corrompido** — a remediação continua sendo a mensagem citando o caminho (limitação A6 da SPEC-0039), agora com raio de alcance maior (D10) e documentada como tal;
- **saída `--json`/máquina** para os subcomandos de `persona`, paginação, filtros, busca — nenhum comando da CLI tem isso hoje;
- **edição interativa** (formulário no terminal, `$EDITOR`), preview do `systemPrompt`, teste de voz;
- **validação semântica** dos textos da Persona (tamanho, idioma, moderação);
- **`emotion`/`voice` deixarem de ser slots inertes** e qualquer alteração em `systemPrompt` (ADR-0010 intacto);
- **entrada por voz (STT)/wake word** — escalação própria, ADR novo;
- alterações em `@atlas/cognitive`, `@atlas/runtime`, `@atlas/tools`, `@atlas/memory`, `@atlas/context`, `@atlas/permissions`, `@atlas/skills`, `@atlas/model-gateway` — **diff vazio** em todos.

---

# Pré-requisitos

- [SPEC-0003](SPEC-0003-cli-foundation.md) (Done) — fundação da CLI (`run()`, gateways, `CliUsageError`).
- [SPEC-0008](SPEC-0008-persona-service.md) (Done) — Persona Service.
- [SPEC-0014](SPEC-0014-tools-confirm-in-chat.md) (Done) — `LineReader` + porta de confirmação no terminal.
- [SPEC-0037](SPEC-0037-desktop-runtime-persona-switch.md) (Done) — re-export de catálogo em `@atlas/core` (D4).
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) (Done) — `PersonaStorage`/CRUD, `resolveDataDir`, `personaStoragePath`, fronteira D12.
- [SPEC-0041](SPEC-0041-desktop-piper-only-voice-surface.md) (Done) e [SPEC-0043](SPEC-0043-desktop-voice-residues.md) (Done) — política vigente de `voiceURI`, que a D8 é obrigada a refletir na ajuda.
- [ADR-0020](../../06-adr/ADR-0020-persona-persistence-voice-binding.md) (Accepted).

(Status conferido em `docs/implementation/specs/` nesta data: todas `Done`; ADR-0020 `Accepted`.)

---

# Critérios de Aceitação

Qualidade geral:

- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm format:check` passam na raiz;
- estrutura corresponde à seção "Arquivos Esperados";
- `git diff` **vazio** em `packages/contracts`, `packages/core`, `packages/cognitive`, `packages/runtime`, `packages/tools`, `packages/memory`, `packages/context`, `packages/permissions`, `packages/skills`, `packages/model-gateway` e `apps/desktop` (inclusive testes);
- verificação de fronteira (ADR-0003): nenhum arquivo de `apps/cli/src` importa de `@atlas/persona` ou de qualquer package que não seja `@atlas/core`/`@atlas/contracts` — conferível por `grep`; `apps/cli/package.json` **não** ganha dependência nova;
- `grep -rn "personas.json" apps/` não casa em nenhum arquivo de `apps/cli/src` (o caminho vem só de `personaStoragePath`).

Parsing (`input-gateway`):

- teste comprova: `atlas persona` e `atlas persona list` produzem `{ command: 'persona', personaSubcommand: 'list' }`;
- teste comprova: subcomando desconhecido (`atlas persona wat`) lança `CliUsageError` citando `list|show|create|edit|delete`;
- teste comprova: `show`/`edit`/`delete` sem id, e `create` sem nome (ausente ou `"   "`), lançam `CliUsageError`;
- teste comprova: `persona create "X" --name Y` lança `CliUsageError`; `persona edit x` sem nenhuma flag de campo lança `CliUsageError`; `persona list --tone x` e `persona show x --yes` lançam `CliUsageError`;
- teste comprova: `persona create "Meu Bot" --tone t --rule "a" --rule "b" --voice-uri u` produz `personaFields` com **exatamente** as chaves informadas (`tone`, `communicationRules: ['a','b']`, `voiceURI: 'u'`) e **nenhuma** outra (sem defaults na borda);
- teste comprova: `--rule ""` (só vazio/espaços) produz `communicationRules: []` — chave presente, lista vazia; ausência total de `--rule` **não** cria a chave;
- teste comprova: `persona delete x --yes` produz `personaAssumeYes: true`; sem a flag, `false`/ausente;
- teste comprova (não-regressão): todos os comandos já existentes seguem parseando idênticos (casos atuais do `input-gateway.test.ts` passam sem alteração).

Comandos (`commands/persona.ts`, com `PersonaService` fake em memória):

- teste comprova: `runPersonaList` imprime uma linha por Persona, marcando `jarvis`/`neutral` como embutidas e as custom como custom — e a marca é derivada de `PERSONA_IDS` sobre os **ids** de `list()` (o fake devolve `readonly string[]` em `list()` e objetos `Persona` **sem** campo `builtin` em `get()`; um `Persona` com um `builtin` espúrio no fake não altera a saída);
- teste comprova: `runPersonaShow` imprime os 8 campos, uma regra por linha, e omite a linha de `voiceURI` quando ausente;
- teste comprova: `runPersonaCreate('Meu Assistente', { tone: 't' })` chama `create` com **todos** os campos textuais (os não informados como `''`), `communicationRules: []`, **sem** a propriedade `voiceURI`, e imprime o id derivado devolvido pelo serviço;
- teste comprova: `runPersonaEdit` preserva os campos não informados — incluindo `voiceURI` — e sobrepõe só os informados (asserção sobre o `PersonaInput` recebido por `update`);
- teste comprova: `runPersonaEdit(id, { voiceURI: '' })` chama `update` **sem** a propriedade `voiceURI` (limpeza), e `runPersonaEdit(id, { communicationRules: [] })` grava lista vazia;
- teste comprova: `runPersonaEdit`/`runPersonaDelete` sobre `'jarvis'` não chegam a mutar nada (o `PersonaError` do módulo é propagado; `update`/`delete` do fake: zero chamadas para `delete`, e a recusa de embutida ocorre antes do prompt);
- teste comprova (fail-closed do consentimento): `runPersonaDelete` **sem** leitor e **sem** `--yes` não chama `delete` e reporta recusa; com leitor devolvendo `null` (EOF), idem; com `'n'`/`''`/`'nao'`, idem; com `'s'`/`'sim'` (qualquer caixa), `delete` é chamado exatamente uma vez;
- teste comprova: com `--yes`, o leitor **não** é consultado (spy: zero chamadas) e a Persona é apagada;
- teste comprova: a ordem é validação → prompt → efeito (para id inexistente e para id embutido, o leitor recebe zero chamadas);
- teste comprova: quando `configOverride.persona === id`, o texto do prompt inclui o aviso de que aquela é a Persona apontada pela config corrente.

Fim a fim (`run.ts`, com `dataDir` temporário real, passado por `--data-dir <tmp>` ou `ATLAS_DATA_DIR` — nunca por `deps`):

- teste comprova (round-trip CLI → disco → Core): `run(['persona','create','Terminal Bot','--tone','seco','--data-dir',tmp], …)` cria `<tmp>/personas.json`; em seguida `run(['persona','list','--data-dir',tmp], …)` mostra a Persona; e `run(['status','--persona','terminal-bot','--data-dir',tmp], …)` sai com código **0** e imprime a Persona custom — enquanto o **mesmo** `status` com `--data-dir <tmp2>` sai com código 1 (`InvalidConfigError` citando o id);
- teste comprova (interoperabilidade GUI↔CLI): um `personas.json` escrito diretamente por `createFilePersonaStorage(personaStoragePath(<tmp>))` (o caminho que `apps/desktop` usa) é lido por `atlas persona list --data-dir <tmp>` sem nenhuma tradução — mesmo arquivo, mesma forma;
- teste comprova: nenhum comando **de leitura** cria arquivo — após `run(['status','--data-dir',tmp], …)` e `run(['persona','list','--data-dir',tmp], …)` num `dataDir` temporário virgem, `personas.json` **não** existe;
- **custo da D10, arquivo corrompido derruba tudo** — teste comprova: com `<tmp>/personas.json` contendo JSON inválido, **os três** caminhos saem com código **1** e mensagem amigável (sem stack trace crua) **citando o caminho do arquivo**: `atlas persona list --data-dir <tmp>` (caminho sem Core), `atlas status --data-dir <tmp>` e `atlas ask "oi" --data-dir <tmp>` (caminho **através de `createAtlas`**, que é o novo raio de alcance); em nenhum dos casos o arquivo é sobrescrito ou "consertado" (conteúdo em disco inalterado byte a byte);
- teste comprova: a mensagem desses casos menciona a saída de emergência (corrigir/remover o arquivo, ou usar outro `--data-dir`), e o **mesmo** comando com `--data-dir <tmp2>` (íntegro) volta a sair com código 0 — a saída de emergência funciona de fato;
- teste comprova (D5, sem deadlock): com `ATLAS_PERSONA` apontando para um id **inexistente**, `atlas persona list`/`create`/`delete` continuam funcionando (o Core não é subido), enquanto `atlas status` no mesmo ambiente sai com 1 — as duas preocupações são independentes;
- teste comprova: `atlas persona delete <id>` recusado (leitor devolve `'n'`) sai com código **1** e a Persona continua listada; aceito, sai com **0** e some da listagem e do arquivo;
- teste comprova: `atlas persona wat` sai com código **2** e imprime a ajuda (molde dos demais erros de uso);
- teste comprova: `HELP_TEXT` contém as cinco linhas de `persona`, a linha de `--persona` já não afirma `(jarvis|neutral)`, e a linha de `--voice-uri` cita **as duas formas aceitas** (`piper:<id>` e o `voiceURI` de uma voz do SO) e que a CLI não valida nem reproduz voz.

Escrita atômica (`@atlas/persona`):

- teste comprova: após `save`, o arquivo alvo contém o JSON completo e **nenhum** arquivo temporário residual permanece no diretório;
- teste comprova: uma falha injetada na etapa de escrita/`rename` (fake de `fs` ou diretório sem permissão) lança `PersonaError` citando o caminho e **deixa o arquivo anterior íntegro** (conteúdo prévio inalterado, nunca truncado);
- teste comprova (não-regressão): todos os casos atuais de `persona-storage.test.ts` seguem passando sem alteração de expectativa (round-trip, ausência ⇒ `[]`, JSON inválido ⇒ `PersonaError`).

Documentação:

- `apps/cli/CLAUDE.md` descreve a família `persona`, a composição via `@atlas/core`, a semântica de patch do `edit`, o significado de `--voice-uri ""`/`--rule ""`, o consentimento fail-closed, **as formas aceitas de `voiceURI` com a política das SPECs 0041/0043**, e **o raio de alcance da D10** (todo comando lê `personas.json`; arquivo corrompido derruba qualquer comando; saída de emergência por `--data-dir`/conserto do arquivo);
- `packages/persona/CLAUDE.md` descreve a escrita atômica e **substitui** a afirmação de que a mitigação do lost-update é "a ausência de consumidor de CLI".

---

# Arquivos Esperados

```text
apps/
└── cli/
    ├── src/
    │   ├── commands/persona.ts               # NOVO: list/show/create/edit/delete (render + orquestração fina)
    │   ├── gateway/persona-composition.ts    # NOVO: createCliPersonaStorage / createCliPersonaService
    │   ├── gateway/input-gateway.ts          # + comando 'persona', subcomandos, flags de campo, --yes
    │   ├── run.ts                            # + despacho pré-Core, personaStorage no createAtlas,
    │   │                                     #   LineReader para delete, PersonaError→exit 1, HELP_TEXT
    │   └── ...                               # demais arquivos inalterados
    ├── tests/
    │   ├── persona.test.ts                   # NOVO: comandos com PersonaService fake
    │   ├── persona-composition.test.ts       # NOVO: caminho derivado, sem loadConfig
    │   ├── input-gateway.test.ts             # + casos de parsing de persona
    │   └── run.test.ts                       # + fim a fim com dataDir temporário (inclui arquivo corrompido)
    └── CLAUDE.md                             # + família persona, raio da D10, formas de voiceURI

packages/
└── persona/
    ├── src/storage/persona-storage.ts        # save atômico (temp + rename)
    ├── tests/persona-storage.test.ts         # + atomicidade e falha sem corromper
    └── CLAUDE.md                             # + escrita atômica; lost-update reescrito
```

Lista de expectativa; pequenos ajustes são aceitáveis.

---

# Componentes Impactados

- **Input Gateway / Output Gateway (semente CLI)** (`apps/cli`) — nova família de subcomandos, parsing e render; consentimento no terminal; arranque de todo comando passa a depender do arquivo de Personas (D10);
- **Persona Service** (`packages/persona`) — apenas o adapter de arquivo (atomicidade); nenhuma mudança de responsabilidade, contrato ou invariante;
- consome **sem alterar**: Core / Configuration Service (`createAtlas`, `resolveDataDir`, `personaStoragePath`, re-exports), Cognitive Core, Memory, Context, Permissions, Runtime, Tools, Skills, Model Gateway;
- **`apps/desktop`** — não alterado, mas passa a compartilhar o arquivo com um segundo escritor (ver Observações).

---

# Interfaces Necessárias

Nenhuma interface **pública** nova (`@atlas/contracts` intocado). Locais a `apps/cli`:

```text
PersonaFieldPatch {            // parcial: chave existe só se a flag apareceu
  readonly name?: string
  readonly tone?: string
  readonly formality?: string
  readonly language?: string
  readonly style?: string
  readonly voice?: string
  readonly emotion?: string
  readonly voiceURI?: string           // '' significa "limpar"
  readonly communicationRules?: readonly string[]
}

ParsedInput {
  command: … | 'persona'
  personaSubcommand?: 'list' | 'show' | 'create' | 'edit' | 'delete'
  personaId?: string
  personaName?: string
  personaFields?: PersonaFieldPatch
  personaAssumeYes?: boolean
}

createCliPersonaStorage(configOverride: AtlasConfigOverride): PersonaStorage
createCliPersonaService(configOverride: AtlasConfigOverride): PersonaService

runPersonaList(personaService, output): void
runPersonaShow(personaService, id, output): void
runPersonaCreate(personaService, name, patch, output): void
runPersonaEdit(personaService, id, patch, output): void
runPersonaDelete(personaService, id, output, deps: {
  assumeYes: boolean
  lineReader?: LineReader
  activePersonaId?: string          // valor CRU de configOverride.persona, só para o aviso
}): Promise<boolean>                 // false = não apagou (recusa/EOF/sem leitor)
```

Contrato **já existente** que estas funções consomem (nada muda nele — ver §3):

```text
PersonaService.list(): readonly string[]        // IDS, não objetos
PersonaService.get(id: string): Persona         // Persona NÃO tem campo `builtin`
PERSONA_IDS: readonly string[]                  // re-export de @atlas/core; origem da marca "embutida"
```

Consumido de `@atlas/core` (já existente, nada novo): `createAtlas`, `CreateAtlasDeps.personaStorage?`, `createPersonaService`, `createFilePersonaStorage`, `resolveDataDir`, `personaStoragePath`, `PERSONA_IDS`, tipo `PersonaStorage`.

---

# Fluxo Esperado

```text
[criar]
atlas persona create "Terminal Bot" --tone seco --rule "seja breve"
  → input-gateway: { command:'persona', personaSubcommand:'create',
                     personaName:'Terminal Bot', personaFields:{tone,communicationRules} }
  → run.ts: desvio ANTES de createAtlas
      → createCliPersonaService(configOverride)
          = createPersonaService({ storage: createFilePersonaStorage(
                personaStoragePath(resolveDataDir(configOverride)) ) })
            (só dataDir; nunca loadConfig — D5/D17)
      → runPersonaCreate → PersonaInput completo → service.create
          → módulo: valida, deriva slug, save atômico (write-through)
      → "Persona criada [terminal-bot]: Terminal Bot"

[listar]
atlas persona list
  → service.list()  → ['jarvis','neutral','terminal-bot']     (IDS)
      → get(id).name + PERSONA_IDS.includes(id) → [embutida|custom]

[usar]
atlas ask "..." --persona terminal-bot
  → run.ts: createAtlas({config}, { personaStorage: createCliPersonaStorage(cfg), … })
      → storage.load() no arranque  → arquivo corrompido = PersonaError (exit 1, D10)
      → personaService.list() alimenta a validação de `persona` no loadConfig
      → personaService.get('terminal-bot') → systemPrompt → personaPrompt (ADR-0010 intacto)

[editar]
atlas persona edit terminal-bot --style "telegráfico"
  → get(id) → patch por cima → update(id, input)     (campos ausentes preservados,
                                                      inclusive voiceURI; id preservado)

[apagar]
atlas persona delete terminal-bot
  → get(id): inexistente → PersonaError (exit 1)
  → embutida?            → PersonaError (exit 1), sem perguntar
  → --yes?               não → prompt "[s/N]" (+ aviso se == configOverride.persona)
        EOF/n/sem leitor → "Remoção cancelada; nada foi apagado." (exit 1)
        s|sim            → delete(id) → save atômico → exit 0
```

Regras (para remover ambiguidade):

- as Personas embutidas vêm **sempre** do registro em código; a CLI nunca as edita, apaga ou grava no arquivo;
- "embutida" é **derivada** de `PERSONA_IDS`, nunca lida de um campo de `Persona` (que não existe);
- o caminho do arquivo é derivado **uma única vez**, por `personaStoragePath(resolveDataDir(...))`; nenhum `join(..., 'personas.json')` em `apps/cli`;
- resolver **onde** está o arquivo nunca depende de **qual** Persona está ativa (D17 da SPEC-0039);
- a CLI não reimplementa slug, validação de campos, colisão de id nem persistência — tudo é autoridade de `@atlas/persona` (a borda só antecipa erro de **uso**);
- nada destrutivo acontece sem consentimento explícito, e a ausência de consentimento nunca é inferida do ambiente (sem leitor ⇒ recusa);
- arquivo de Personas inválido **falha alto em qualquer comando** e nunca é reescrito;
- a Persona chega ao modelo só pelo caminho do ADR-0010.

---

# Estratégia de Implementação

1. `packages/persona`: `save` atômico (temp + `renameSync`) com teste antes — inclusive o de falha que preserva o arquivo anterior; rodar `pnpm --filter @atlas/persona test`/`typecheck` (verificação escopada, SPEC-0042);
2. `apps/cli/src/gateway/persona-composition.ts`: as duas funções de composição + teste provando que o caminho derivado é `<dataDir>/personas.json` e que nenhum `loadConfig` é acionado (override com `persona` inexistente **não** faz a composição lançar);
3. `apps/cli/src/gateway/input-gateway.ts`: comando/subcomandos/flags e todas as `CliUsageError`; testes primeiro (TDD), incluindo os de não-regressão dos comandos atuais;
4. `apps/cli/src/commands/persona.ts`: as cinco funções com `PersonaService` fake — **conferindo antes as assinaturas reais** de `list()`/`get()` em `packages/persona/src/persona-service.ts` e o precedente de `core-bridge.ts` (l. 76, 193-198); testes antes, com atenção ao `exactOptionalPropertyTypes` no `voiceURI`;
5. `apps/cli/src/run.ts`: desvio pré-Core, `personaStorage` no `createAtlas`, `LineReader` para `persona delete`, mapeamento de `PersonaError` → exit 1 **inclusive quando vem de `createAtlas`**, `HELP_TEXT` (incluindo as formas de `--voice-uri`);
6. testes fim a fim em `run.test.ts` com `dataDir` temporário via `--data-dir` (round-trip, interoperabilidade com o caminho do desktop, **arquivo corrompido nos três caminhos**, ausência de escrita em leitura, ids inexistentes em `ATLAS_PERSONA`);
7. `pnpm lint`/`typecheck`/`test`/`format:check` na raiz + `grep` de fronteira (imports e `personas.json`) + confirmação de diff vazio nos packages/app listados;
8. atualizar `apps/cli/CLAUDE.md` e `packages/persona/CLAUDE.md`; validar todos os Critérios de Aceitação.

---

# Estratégia de Testes

- **`@atlas/persona`**: `tmpdir` real para atomicidade (nenhum resíduo temporário; alvo íntegro sob falha injetada) e os casos atuais como não-regressão;
- **`apps/cli` — parsing**: tabela de casos válidos e inválidos no `input-gateway.test.ts`, com asserção sobre as **chaves presentes** em `personaFields` (a ausência de defaults na borda é parte do contrato interno);
- **`apps/cli` — comandos**: `PersonaService` **fake em memória** (sem disco), fiel ao contrato real (`list()` devolvendo ids, `get()` devolvendo `Persona` sem `builtin`), e `OutputGateway` fake; `LineReader` fake cobrindo `s`/`sim`/`S`/`n`/vazio/`null`(EOF)/ausência do leitor; spies para provar ordem (validação antes do prompt) e ausência de efeito nas recusas;
- **`apps/cli` — fim a fim**: `run()` com `dataDir` temporário isolado por caso (sempre via `--data-dir`/`ATLAS_DATA_DIR`), provedor de modelo `fake`, sem terminal real (leitor injetado por `deps.createLineReader`); asserções sobre **código de saída**, sobre o texto em `stderr` (caminho do arquivo + saída de emergência) e sobre o conteúdo real do arquivo em disco;
- **fronteira**: teste/`grep` garantindo que `apps/cli/src` não importa `@atlas/persona` direto e não deriva `personas.json`;
- nenhum teste depende de Electron, de rede ou de voz.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `PLATFORM_STATE.md`, `CURRENT_SPRINT.md`, `Roadmap.md` — inclusive o registro da paridade de CLI na linha de extensão do item 2.4) é passo de fecho (`doc-sync`), não do implementador; o implementador toca só a doc específica da própria SPEC (o arquivo da SPEC e os `CLAUDE.md` de `apps/cli` e `packages/persona`).

---

# Restrições

- **Não criar módulo, package, Tool, Skill ou Persona embutida nova.** "Criar Persona" aqui é **dado do usuário**, não componente arquitetural (Artigo 3, mesma leitura da SPEC-0039).
- **ADR-0020 + SPEC-0039 são o teto**: qualquer necessidade além (embutidas editáveis, Personas na Memory, campo novo em `AtlasConfig`, seleção durável, canal de vozes na CLI) é motivo para **parar e registrar**, não para decidir na implementação.
- **ADR-0003 preservado**: `apps/cli` importa implementação **só** de `@atlas/core`. A composição de `createPersonaService({ storage })` no app é a exceção delimitada da D12 da SPEC-0039 — **nada além dela** (nenhum outro serviço da plataforma composto no app).
- **Contrato existente é o teto do §3**: `list()` devolve ids e `Persona` não tem `builtin` — a marca é derivada de `PERSONA_IDS`. Qualquer vontade de "melhorar" isso mexendo em `@atlas/contracts` é sinal de parar e registrar, não de editar o contrato.
- **Um único derivador do caminho** (`personaStoragePath`) e **uma única precedência de `dataDir`** (`resolveDataDir`): nenhum `join`/`??` reinventado em `apps/cli`.
- **Achar o arquivo nunca depende da validade da Persona ativa** (D17/B1): nenhum caminho de composição de storage passa por `loadConfig`.
- **Fail-closed no consentimento**: sem leitor, sem `--yes`, com EOF ou com resposta ambígua, nada é apagado.
- **Fail-high no storage**: arquivo inválido nunca é descartado, "consertado" nem sobrescrito — em nenhum comando, inclusive nos que agora o leem só de passagem (D10).
- **Embutidas imutáveis**, sempre resolvidas do código.
- **Higiene de flags fora da família `persona` não se toca** nesta fatia (fatia própria).
- Sem `dist/`, sem dependência de runtime nova em nenhum package ou app; parsing por `node:util`.
- `PersonaFieldPatch` e as funções `runPersona*` ficam **locais** a `apps/cli` — promoção a `@atlas/contracts` só com 2º consumidor real, via ADR.

---

# Observações

**Por que isto não é escalação.** As quatro portas da Emenda v1.1 estão fechadas: (1) nenhuma emenda à Constituição; (2) nenhum módulo novo e nenhuma responsabilidade movida — o Persona Service segue dono do CRUD, a CLI segue Input/Output Gateway; (3) nenhum ADR novo — o ADR-0020 decidiu a estrutura e **nomeou** esta fatia como composição futura, a fronteira do re-export já foi alargada e documentada pela D12 da SPEC-0039 (`packages/core/CLAUDE.md` l. 15-17), `CreateAtlasDeps.personaStorage?` já existe (`packages/core/src/index.ts` l. 48) e a escrita atômica já estava prevista como condição em `packages/persona/CLAUDE.md`; (4) base direta no PRD (Personalização). O que esta SPEC decide sozinha é forma de linha de comando e política de consentimento — decisões de design, registradas abaixo em formato de veto.

**O raio de alcance da D10, dito por extenso.** Antes desta SPEC, `personas.json` só era lido por quem pedia Persona (a janela). Depois dela, **todo** comando da CLI o lê no arranque, porque o storage é injetado em `createAtlas`. Como o adapter é fail-high por desenho (SPEC-0039/A6 — nunca descartar Personas do usuário em silêncio), um arquivo corrompido passa a bloquear `ask`/`chat`/`status`, não só `atlas persona`. É uma troca deliberada — sem ela, criar Persona pela CLI seria inútil (D10) —, e a mitigação é inteiramente informacional: mensagem citando o caminho, saída de emergência por `--data-dir` (ou conserto/remoção do arquivo), tudo coberto por Critério de Aceitação e registrado em `apps/cli/CLAUDE.md`. Reparo automático/backup continua fora (mesma limitação A6 da SPEC-0039, agora com raio maior).

**Um segundo escritor no `personas.json` — o que muda de fato.** Até aqui o arquivo tinha um único escritor (o main process do Electron, serializado pelo renderer). A partir desta SPEC há dois processos independentes. A atomicidade do §5 elimina o pior desfecho (arquivo truncado por interrupção no meio da escrita, que é fail-high e derrubaria **as duas** interfaces — e, depois da D10, todos os comandos da CLI). O que **permanece** é o lost-update lógico: uma janela do desktop aberta há uma hora tem um snapshot em memória (load-once) e, ao criar uma Persona, grava o snapshot inteiro — apagando o que a CLI escreveu nesse intervalo. Não é corrigível só na CLI (exigiria `apps/desktop` recarregar antes de gravar, e/ou detecção de conflito por `mtime`), então fica registrado como limitação **ativa**, com mitigação prática: não editar Personas nas duas interfaces com a janela aberta. Um `read-modify-write`/detecção de conflito no `PersonaService` é candidato futuro nomeado; quando chegar, vale para os dois consumidores de uma vez.

**Simetria deliberadamente imperfeita com a GUI.** Três diferenças conscientes: (a) não há `use` (D2); (b) não há guarda de "Persona ativa", só aviso (D6); (c) a voz é uma string opaca, sem catálogo, sem validação e sem reprodução (D8). Todas derivam de o terminal não ter o que a janela tem (estado vivo de seleção, catálogo de vozes, motor de áudio) — não de simplificação por conveniência. A consistência que o PRD exige (l. 205) é de **comportamento**: as mesmas regras de imutabilidade, as mesmas validações do módulo, o mesmo arquivo, o mesmo consentimento antes de destruir.

**`atlas forget` não pede confirmação, `atlas persona delete` pede.** A distinção é a mesma que a SPEC-0039 registrou (D14): um fato de memória é uma linha reproduzível e frequentemente re-aprendida; uma Persona é um conjunto de 8 campos escritos à mão, sem export/import e sem undo. Não há incoerência a corrigir em `forget` nesta fatia.

**Higiene de flags irrelevantes — registrada, não incorporada.** Hoje `atlas ask "x" --tone y` é silenciosamente aceito; isso é pré-existente (vale para todas as flags do `input-gateway`) e cresce um pouco com as nove flags novas. Esta SPEC valida coerência de flags **apenas dentro** da família `persona`. Uma varredura geral do `input-gateway` é fatia própria — deliberadamente **não** um "já que estamos aqui".

**Verificação escopada.** Durante o desenvolvimento vale `pnpm --filter @atlas/cli test`/`typecheck` e `pnpm --filter @atlas/persona test` (SPEC-0042); o fechamento continua exigindo os quatro comandos completos na raiz.

**Sem smoke gráfico.** Ao contrário das 13 fatias anteriores, esta é inteiramente verificável por teste automatizado — não há dependência de WindowServer, de voz nem de Piper.

---

# Checklist para IA

Antes de implementar:

- ler ADR-0020, ADR-0021, SPEC-0039 (em especial D12 e D17, e a seção de Observações sobre lost-update), SPEC-0037/D4, SPECs 0041/0043 (política de voz), ADR-0003, ADR-0006 e `packages/core/CLAUDE.md` (l. 14-19);
- conferir a superfície já existente em `@atlas/core` **antes** de escrever qualquer coisa: nada precisa ser adicionado lá;
- conferir as assinaturas reais de `PersonaService.list()`/`get()` e do tipo `Persona` **antes** de escrever a listagem (§3) — e o precedente de `apps/desktop/src/core-bridge.ts`;
- compreender que a autoridade de validação/slug/persistência é do `@atlas/persona`, não da CLI.

Durante a implementação:

- manter responsabilidade única (borda antecipa erro de uso; módulo garante invariante);
- não duplicar a derivação do caminho nem a precedência de `dataDir`;
- respeitar `exactOptionalPropertyTypes` no `voiceURI` (spread condicional, nunca `voiceURI: undefined`);
- manter simplicidade: nenhum framework de CLI, nenhum `--json`, nenhum modo interativo além do prompt de consentimento.

Após a implementação:

- executar `lint`/`typecheck`/`test`/`format:check` na raiz;
- confirmar os diffs vazios e as verificações por `grep`;
- validar cada Critério de Aceitação um a um;
- registrar lições aprendidas.

---

# Decisões de design

**D1 — Perfil `completo`, não `micro`.**
Decisão: classificar como `completo`.
Porquê: a fatia toca **dois** alvos (`apps/cli/src` + `packages/persona/src`) e, sobretudo, **não é aditiva** — a D10 muda o comportamento de arranque de todos os comandos já entregues (validação de `persona` e leitura de um arquivo novo), o que sozinho já exclui `micro`; soma-se a isso o reuso de uma exceção arquitetural delimitada (D12 da SPEC-0039) num segundo consumidor, que merece o gate dedicado.
Alternativa descartada: `micro` (fast-path, `spec-closer` valida e fecha) — atraente pela contenção a um package + CLI, mas falha o critério de aditividade e dispensaria revisão justamente onde há mudança de comportamento em superfície entregue.

**D2 — Sem `atlas persona use <id>`.**
Decisão: a família tem `list|show|create|edit|delete`; a escolha de Persona continua por `--persona`/`ATLAS_PERSONA`.
Porquê: `use` só faz sentido como **preferência durável**, e o slot `arquivo` do ADR-0006 não existe — persistir seleção de config seria estado durável novo fora do desenho vigente, o mesmo motivo pelo qual a D3 da SPEC-0037 deixou a seleção do desktop não durável. Nesta fatia, o valor real que faltava (`--persona <custom>` funcionar) é entregue pela injeção do `personaStorage`.
Alternativa descartada: gravar a Persona ativa num arquivo de preferência do `dataDir` — criaria um segundo mecanismo de config concorrente ao ADR-0006, decisão arquitetural que exigiria ADR (escalação), por um ganho de ergonomia que uma variável de ambiente já cobre.

**D3 — `edit` é patch; `create` preenche o resto com string vazia.**
Decisão: `edit <id>` sobrepõe só os campos informados (lendo a Persona atual e preservando o resto, inclusive `voiceURI`); `create` exige só o nome e materializa os demais campos textuais como `''` e `communicationRules` como `[]`.
Porquê: `PersonaService.update(id, input)` recebe um `PersonaInput` **completo** — sem o patch, editar um campo pela CLI apagaria os outros sete (perda de dado silenciosa, inaceitável pelo Artigo 8). O default vazio no `create` tem precedente literal na Persona `neutral` embutida (`voice: ''`, `emotion: ''`, `communicationRules: []`) e é aceito pelo módulo desde a SPEC-0039.
Alternativa descartada: exigir os 8 campos em toda invocação de `create`/`edit` — fiel ao contrato, mas transformaria uma edição de uma palavra numa linha de comando de 8 flags; e alternativa descartada (2): promover um `PersonaPatch` a `@atlas/contracts` — mudança de contrato público sem segundo consumidor, proibida pelas regras vigentes.

**D4 — `--rule` repetível e `--voice-uri ""` como forma de limpar.**
Decisão: `--rule` é flag repetível que **substitui** a lista inteira; `--rule ""` (colapsando para vazio) significa lista vazia; `--voice-uri ""` remove a propriedade `voiceURI`.
Porquê: reusa exatamente o padrão de flag repetível já validado em `--allow-read`/`--allow-write` (SPEC-0018, inclusive o helper `filterNonEmpty`), e evita duas flags novas (`--clear-rules`/`--clear-voice-uri`) para operações raras. Substituição (nunca merge) é a mesma semântica já adotada para as raízes de permissão.
Alternativa descartada: flags `--add-rule`/`--remove-rule` com merge — superfície maior, semântica ambígua com `edit` parcial, sem pedido do usuário.

**D5 — Os subcomandos de `persona` não sobem o Core.**
Decisão: `run.ts` desvia para os comandos de Persona **antes** de `createAtlas`, compondo só o `PersonaService` (molde stateless da SPEC-0034/0039).
Porquê: subir o Core exigiria `loadConfig`, que valida `persona`; um `ATLAS_PERSONA` apontando para Persona apagada tornaria impossível **listar ou recriar** Personas pela própria CLI — o deadlock circular que a SPEC-0039 corrigiu como bloqueante B1 (D17). Além disso, gerenciar Personas não precisa de gateway de modelo, Runtime, Tools nem Memory. Não há dois storages vivos: este caminho e o da D10 derivam o mesmo arquivo pela mesma função (`personaStoragePath(resolveDataDir(...))`) e nunca coexistem numa mesma invocação.
Alternativa descartada: manter o fluxo único de `run.ts` (sempre `createAtlas`) e ler o serviço de `atlas` — mais uniforme, mas reintroduz o deadlock e exigiria expor `personaService` em `AtlasPlatform`, que a SPEC-0039 condicionou a ADR (escalação).

**D6 — Sem guarda de "Persona ativa" na remoção: aviso, e `list` não marca a ativa.**
Decisão: `delete` avisa no prompt quando o id coincide com o valor **cru** de `configOverride.persona`, mas não recusa; `persona list` não marca Persona ativa.
Porquê: saber a Persona **efetiva** exigiria `loadConfig` (deadlock B1, D5) ou um `resolvePersona` novo em `@atlas/core` — generalização de resolvedores por campo explicitamente rejeitada pela D17 da SPEC-0039 por falta de segundo consumidor. E o risco que justificava a guarda no desktop não existe aqui: lá o processo é longo e ficaria inutilizável até reiniciar; aqui cada comando é um processo novo, e um `--persona` órfão produz um `InvalidConfigError` já tratado com mensagem amigável, corrigível trocando a flag/env. `atlas status` já mostra a Persona efetiva.
Alternativa descartada: replicar a guarda do desktop — exigiria a maquinaria rejeitada pela D17 ou reabrir o B1, para proteger de uma falha recuperável e autoexplicativa.

**D7 — Consentimento por prompt `[s/N]`, `--yes` para não interativo, recusa sai com código 1.**
Decisão: `delete` pergunta pelo `LineReader` (mesmo molde do `ConfirmPort` do `chat`, SPEC-0014), `--yes` pula a pergunta, e sem leitor/EOF/resposta negativa nada é apagado, com saída **1**.
Porquê: o PRD proíbe ação destrutiva sem autorização adequada (l. 193) e a SPEC-0039 já decidiu que Persona custom é irreversível o bastante para exigir consentimento explícito (D14) — a CLI aplica a mesma regra com o mecanismo que ela já tem, sem inventar porta nova. Código 1 na recusa evita que um script leia "sucesso" de uma remoção que não aconteceu.
Alternativa descartada (1): exigir `--yes` sempre, sem prompt — mais simples e determinístico, mas silencioso e hostil ao uso interativo, que é o uso principal da CLI; alternativa descartada (2): apagar sem confirmação, por paridade com `atlas forget` — o próprio precedente foi analisado e rejeitado na SPEC-0039; alternativa descartada (3): sair com 0 na recusa — trataria "não fiz" como sucesso.

**D8 — `--voice-uri` é string opaca; a ajuda diz o que é um valor útil e onde ele soa.**
Decisão: a CLI aceita, guarda e exibe `voiceURI` sem validar, sem listar vozes e sem reproduzir áudio — mas `HELP_TEXT` e `apps/cli/CLAUDE.md` declaram as **formas aceitas** (`piper:<id>` ou o `voiceURI` de uma voz do SO) e a política vigente das SPECs 0041/0043.
Porquê: o catálogo de vozes vive onde há motor — Web Speech API do renderer (SPECs 0035/0036) e Piper no main process do Electron (SPECs 0040/0041); num processo de terminal não há nem catálogo nem áudio, e criar um canal de vozes na CLI seria superfície de voz nova, fora do ADR-0021. Mas opacidade sem orientação seria enganosa: são **dois casos distintos**. (a) **Preservar** — o `edit` da CLI não pode apagar uma voz escolhida na janela (D3), e aqui a opacidade é puro benefício. (b) **Autorar** pela CLI — um `--voice-uri "Alex"` (voz de SO) digitado no terminal **nunca soa na CLI** (que não fala) e, na janela sob a política Piper-only da SPEC-0041, **não é honrado**: aparece como `<option>` retida e rotulada (SPEC-0043). Ou seja: só `piper:<id>` produz voz audível no estado atual, e a ajuda precisa dizer isso em vez de deixar o usuário descobrir pelo silêncio.
Alternativa descartada (1): recusar `voiceURI` na CLI (campo exclusivo da GUI) — faria qualquer `edit` pela CLI apagar a voz da Persona ou exigir um caso especial confuso, degradando dado criado na janela; alternativa descartada (2): validar o valor contra um catálogo — exigiria um canal de vozes na CLI (superfície nova, sem ADR) e amarraria a CLI ao motor de voz do desktop.

**D9 — Escrita atômica agora; concorrência completa não.**
Decisão: `createFilePersonaStorage.save` passa a escrever em temporário no mesmo diretório e substituir por `rename`; lock/detecção de conflito ficam fora, com a limitação documentada como ativa.
Porquê: `packages/persona/CLAUDE.md` registra que a mitigação vigente do lost-update é "a ausência de consumidor de CLI" e que o controle de concorrência "vira requisito explícito" quando isso deixar de valer — esta SPEC é esse momento, então responder não é expansão de escopo. A atomicidade elimina o único desfecho **irrecuperável** (arquivo truncado, fail-high nas duas interfaces e, com a D10, em todo comando da CLI) por poucas linhas contidas ao adapter; o resto exigiria mudar `apps/desktop` e a semântica load-once do serviço, o que estouraria o escopo desta fatia.
Alternativa descartada (1): não mexer em `@atlas/persona` — deixaria a documentação contradizendo o código no exato ponto que ela previu; alternativa descartada (2): lock de arquivo/`read-modify-write` no `PersonaService` — muda semântica compartilhada com o desktop e pede fatia própria (candidato futuro nomeado nas Observações).

**D10 — `personaStorage` injetado em `createAtlas` para todos os comandos, não só para os de Persona — assumindo o custo do fail-high global.**
Decisão: `run.ts` injeta o storage em toda criação do Atlas.
Porquê: sem isso, criar Persona pela CLI seria inútil — `--persona <id-custom>` continuaria rejeitado em `ask`/`chat`/`status`, e o desktop enxergaria Personas que a CLI não usa. O ADR-0020 condicionou a não-injeção a "**nesta fatia**" (SPEC-0039), justamente prevendo esta.
**Custo assumido** (registrado aqui porque é o que um override humano precisa ver): hoje `createAtlas` sem `personaStorage` **nunca toca** `personas.json`; a partir desta SPEC, **todo** comando da CLI o lê no arranque, e como o adapter é fail-high por desenho (`persona-storage.ts` l. 45-56, invariante da SPEC-0039/A6 — nunca descartar Personas do usuário em silêncio), um arquivo corrompido ou ilegível passa a derrubar `atlas ask`/`chat`/`status`, não só `atlas persona`. Nenhum reparo automático é oferecido; a contrapartida exigida por esta SPEC é informacional e verificada: mensagem amigável com o **caminho do arquivo** e a **saída de emergência** (corrigir/remover o arquivo ou apontar outro `--data-dir`), coberta por Critério de Aceitação nos três caminhos (`persona list`, `status`, `ask`) e registrada em `apps/cli/CLAUDE.md`.
Alternativa descartada (1): injetar só nos comandos de Persona — a CLI passaria a **criar** Personas que ela própria não consegue usar, incoerência pior do que a que a SPEC vem corrigir; alternativa descartada (2): tornar a leitura tolerante (arquivo inválido ⇒ lista vazia) para conter o raio da falha — inverteria a invariante fail-high da SPEC-0039/ADR-0020 (descartar silenciosamente Personas do usuário), o que exigiria ADR e é pior que a falha barulhenta.

**D11 — Prioridade `Medium`.**
Decisão: `Medium`.
Porquê: fecha uma assimetria real entre interfaces e um item nomeado três vezes na documentação, mas não destrava gate de Roadmap nem corrige defeito em produção — mesmo enquadramento dado à SPEC-0039, de que esta é a paridade.
Alternativa descartada: `High` — reservada a gates de fase e correções de bloqueante (o padrão do repositório), o que não é o caso.

---

# Resultado Esperado

Ao final desta SPEC, Persona deixa de ser uma capacidade exclusiva da janela: quem usa o Atlas pelo terminal cria, inspeciona, edita e apaga Personas com a mesma segurança e as mesmas invariantes da GUI, sobre **o mesmo arquivo** — uma Persona criada no terminal aparece na janela e vice-versa, sem tradução nem migração. `--persona <id-custom>` passa a funcionar em todos os comandos existentes; em troca, todos eles passam a depender de um `personas.json` íntegro, com falha barulhenta, caminho citado e saída de emergência documentada. Apagar exige consentimento explícito e falha fechado, as Personas de fábrica continuam intocáveis, e a marca "embutida" é derivada de `PERSONA_IDS` sobre o contrato que já existe — nenhum campo novo, nenhum contrato público alterado, nenhum módulo novo, `@atlas/core` intacto. O único ajuste fora de `apps/cli` é a substituição atômica do arquivo de Personas: a resposta mínima e honesta à condição que a própria SPEC-0039 deixou escrita para o dia em que a CLI passasse a escrever nele.
