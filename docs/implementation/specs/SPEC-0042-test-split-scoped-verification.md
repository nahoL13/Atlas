# SPEC-0042 — Quebra do `core-bridge.test.ts` e verificação escopada por package

> **Project Atlas — Implementation Specification**

Version: 1.2

> **Histórico de emendas**
>
> - **v1.1** — correções do 1º veto do `architecture-reviewer` (CA 14 aritmético + órfão nomeado; contradição CA 2 × CA 4 resolvida por D13; oito blocos `describe`, não sete; condição de validade de D5 registrada por D12; CA 17 tornado literal).
> - **v1.2** — emenda em `Ready`, após bounce do `spec-implementer`: flake **pré-existente** de vazamento de sessão, descoberto pelo CA 8. Abre exceção nomeada e estreita no Fora do Escopo (D14) e nomeia o candidato futuro sobre `__resetBridgeStateForTests()` (D15). A Frente 1 já executada **não** é refeita.

---

# Informações Gerais

**ID**

SPEC-0042

---

**Título**

Quebra do `core-bridge.test.ts` por assunto e verificação escopada por package (`--filter`)

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

O item 1.5 lista hoje só remote e CI, ambos entregues. Esta SPEC é uma **exceção consciente registrada**: pertence à mesma natureza transversal do item (infraestrutura que protege o desenvolvimento, não funcionalidade de produto) e não consome nenhum item de Fase 2. O Roadmap não precisa de item novo — é higiene de desenvolvimento, não capacidade da plataforma.

---

# Objetivo

Quando esta SPEC estiver concluída deverá existir:

1. A suíte de `apps/desktop/tests/core-bridge.test.ts` (1.432 linhas, arquivo único) **dividida em sete arquivos por assunto**, com a cobertura preservada **integralmente** — mesmo número de casos, mesmas asserções, mesmo comportamento de produção — e **estável sob ordem embaralhada**.
2. Um **caminho de verificação escopado por package**: `pnpm --filter <package> test` executa apenas a suíte daquele package, e a convenção equivalente para `typecheck`, `lint` e `format:check` está documentada onde os subagents a leem (`.claude/agents/*.md` e `docs/04-engineering/ClaudeCodeAutomation.md`), **com a condição de validade da equivalência registrada**.

Nenhuma mudança de comportamento de produção. Nenhuma mudança no que a CI verifica.

---

# Motivação

Esta SPEC nasce de uma medição empírica dos transcripts locais de 192 execuções de subagent (`~/.claude/projects/-Users-lohanberg-Documents-Repos-Atlas/*/subagents/*.jsonl`), feita antes desta SPEC. Os números abaixo são **medidos**, não estimados.

O custo em tokens do pipeline de SPECs não está no arranque dos subagents (mediana de 16,7k tokens, ~0,5% do total). Está no crescimento do contexto ao longo de execuções longas: o contexto vai de ~17k para ~110k e cada requisição relê tudo como cache read. Custo efetivo (peso do `TOKEN_USAGE_LOG`: cache read 0,10 / cache write 1,25):

| agente | n | reqs médias | efetivo/run | efetivo total |
|---|---|---|---|---|
| spec-implementer | 43 | 84 | 1.033k | 44,4M |
| spec-closer | 26 | 85 | 1.172k | 30,5M |
| spec-drafter | 34 | 30 | 675k | 22,9M |
| spec-validator | 45 | 36 | 441k | 19,9M |
| architecture-reviewer | 43 | 19 | 395k | 17,0M |

As duas causas medidas do custo do `spec-implementer` — o maior consumidor absoluto — são exatamente o escopo desta SPEC:

**Causa 1 — releitura de arquivos grandes.** Chamadas `Read` agregadas em todas as runs de `spec-implementer`:

- `apps/desktop/tests/core-bridge.test.ts` — 15 leituras, 58.556 bytes / 1.432 linhas (~219k tokens acumulados só nessas leituras);
- `apps/desktop/src/renderer/renderer.js` — 27 leituras, 36.240 bytes / 952 linhas (~245k tokens);
- `apps/desktop/src/core-bridge.ts` — 26 leituras, 28.271 bytes / 753 linhas (~184k tokens).

**Causa 2 — verificação rodada na raiz do workspace, sem escopo.** Chamadas `Bash` em runs de `spec-implementer`: `pnpm exec vitest` 76x, `pnpm lint` 49x, `pnpm typecheck` 40x, `pnpm test` 30x, `pnpm format:check` 30x. Cada execução recursiva produz a saída de todos os packages, que entra no contexto e vira releitura em cache a cada requisição seguinte.

Rastreabilidade documental: PRD, **Requisitos Não Funcionais** ("arquitetura modular", "preparado para crescimento incremental") e **Critérios de Qualidade** ("facilidade de manutenção"). Constituição, Artigo 1 e o teste padrão ("mais simples, mais modular, mais transparente, mais sustentável?"): um arquivo de teste de 1.432 linhas cobrindo oito blocos de assunto distintos é o oposto de modular, e verificar o workspace inteiro para mexer num package é o oposto de sustentável.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Requisitos Não Funcionais, Critérios de Qualidade
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigo 1, Artigo 14, Emenda v1.1, Emenda v1.2
- [Development Guide](../../04-engineering/DevelopmentGuide.md)
- [ClaudeCodeAutomation](../../04-engineering/ClaudeCodeAutomation.md) — onde vive a instrução de verificação dos subagents
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 1, item 1.5
- [ADR-0001 — monorepo](../../06-adr/ADR-0001-monorepo.md)
- [ADR-0003 — core composition root](../../06-adr/ADR-0003-core-composition-root.md) (o teste de fronteira preservado no novo arquivo `core-bridge.boundary.test.ts`)
- [ADR-0005 — execução de TypeScript sem `dist/`](../../06-adr/ADR-0005-app-typescript-execution.md)
- [ADR-0009 — Context Service](../../06-adr/ADR-0009-context-service-value-store.md) — sessão viva; o `Map` de sessões do `core-bridge` é o estado vazado no achado da v1.2
- [ADR-0019 — desktop/Electron](../../06-adr/ADR-0019-desktop-electron-stack.md)
- [SPEC-0041](./SPEC-0041-desktop-piper-only-voice-surface.md) (`Done`) — última fatia que tocou a suíte de desktop
- `apps/desktop/CLAUDE.md` — mapa atual do `core-bridge.ts`

---

# Escopo

## Frente 1 — quebra de `apps/desktop/tests/core-bridge.test.ts`

- Dividir o arquivo em **sete** arquivos de teste por assunto, derivados dos **oito** blocos `describe` de topo hoje existentes (os dois primeiros são fundidos num único arquivo — decisão D2):

  | arquivo novo | bloco(s) `describe` de origem (linhas atuais) |
  |---|---|
  | `core-bridge.status-ask.test.ts` | `resolveStatusSnapshot` (31–78) + `resolveAskSnapshot` (80–149) |
  | `core-bridge.chat-session.test.ts` | chat vivo (151–257) |
  | `core-bridge.memory.test.ts` | `resolveMemorySnapshot`/`forgetFact` (259–355) |
  | `core-bridge.persona-selection.test.ts` | seleção/troca de Persona (357–540) |
  | `core-bridge.permissions.test.ts` | configuração de permissões (542–944) |
  | `core-bridge.persona-authoring.test.ts` | autoria de Persona (946–1367) |
  | `core-bridge.boundary.test.ts` | verificação de fronteira ADR-0003 (1369–1423) |

  Os oito blocos começam nas linhas **31, 80, 151, 259, 357, 542, 946 e 1369** — verificado. Oito blocos → sete arquivos.

- Extrair o preâmbulo compartilhado (o `tmpDir` de `beforeEach`/`afterEach` e o helper `baseOverride`) para um módulo auxiliar **não-teste** `apps/desktop/tests/helpers/core-bridge-harness.ts`, consumido pelos arquivos que precisam dele.
- Apagar `apps/desktop/tests/core-bridge.test.ts`.
- Preservar, sem reescrever, o corpo de cada `it(...)`: título, sequência de chamadas e asserções. A movimentação é **mecânica**; ajustes permitidos limitam-se a imports e ao acesso ao `tmpDir`/`baseOverride` via helper.
- **(v1.2 — exceção nomeada, D14)** Acrescentar o **fecho de sessão faltante** ao caso `"updatePersona sobre a Persona ativa recusa com operação em voo…"` (hoje em `core-bridge.persona-authoring.test.ts`, originalmente no bloco da linha 946), que abre uma sessão via `openChatSession` e nunca a fecha. A correção é **mínima e estritamente delimitada**: envolver o corpo em `try/finally` (ou equivalente) que chame `closeChatSession` sobre a sessão aberta, em todos os caminhos de saída. **Proibido dentro desta exceção**: alterar o título, alterar ou acrescentar asserção, alterar a sequência de chamadas sob teste, ou aplicar o mesmo tratamento a qualquer outro caso.

## Frente 2 — verificação escopada por package

- Adicionar `"test": "vitest run"` ao `scripts` do `package.json` dos **13** workspaces que possuem `tests/`: `packages/{contracts,core,model-gateway,context,memory,tools,runtime,permissions,cognitive,skills,persona}` e `apps/{cli,desktop}`.
- Documentar a convenção de verificação escopada em `docs/04-engineering/ClaudeCodeAutomation.md` (subseção nova, "Verificação escopada"), fixando os quatro comandos:
  - testes: `pnpm --filter <package> test`
  - typecheck: `pnpm --filter <package> typecheck`
  - lint: `pnpm exec eslint <caminho>`
  - formatação: `pnpm exec prettier --check <caminho>`
- Na mesma subseção, incluir um parágrafo declarando a **condição de validade** da equivalência entre a execução escopada e a execução da CI (decisão D12): a execução escopada roda **sem config** (default do Vitest) e só é equivalente à execução da raiz **enquanto `vitest.config.ts` da raiz contiver apenas `include`**. Se a config raiz ganhar `setupFiles`, `environment`, `coverage`, `pool` ou qualquer outra chave, a equivalência quebra em silêncio e a convenção escopada precisa ser revista antes do próximo uso.
- Declarar explicitamente, na mesma subseção, o arquivo **fora de qualquer package**: `tests/smoke.test.ts` (raiz do workspace) só é coberto pela execução da raiz — nenhuma execução escopada o alcança.
- Atualizar a instrução de verificação nos arquivos de subagent que rodam comandos — `.claude/agents/spec-implementer.md`, `.claude/agents/spec-validator.md`, `.claude/agents/spec-closer.md` — para: **escopado durante a iteração; uma passada completa na raiz antes de declarar concluído** (o `spec-validator` e o `spec-closer` mantêm obrigatoriamente `pnpm typecheck` + `pnpm lint` + `pnpm test` + `pnpm format:check` na raiz ao menos uma vez). Isso **aperta** o portão: hoje nenhum dos dois roda `pnpm format:check`, que a CI roda.
- Corrigir, em `.claude/agents/spec-implementer.md`, a afirmação "os packages não têm script `test` próprio", que esta SPEC invalida.

---

# Fora do Escopo

- **Qualquer mudança em `apps/desktop/src/*` ou em `packages/*/src`.** Zero diff de código de produção. **Isto inclui, explicitamente, fazer `__resetBridgeStateForTests()` fechar sessões abertas** — rota (b) do bounce, recusada por D14 e registrada como candidato futuro por D15.
- **Enfraquecer o CA 8 removendo `--sequence.shuffle`** — rota (c) do bounce, recusada por D14.
- **Quebra de `apps/desktop/src/renderer/renderer.js`** (952 linhas, 27 leituras na medição) — god file reconhecido, mas fora do pedido; permanece candidato futuro nomeado nas Observações.
- **Quebra de `apps/desktop/src/core-bridge.ts`** (753 linhas, 26 leituras) — mesma razão; mover funções entre arquivos de produção é mudança estrutural, não higiene de teste.
- Alterar `.github/workflows/ci.yml` — a CI continua rodando `lint`/`typecheck`/`test`/`format:check` na raiz, cobrindo tudo.
- Alterar os scripts da raiz (`build`/`lint`/`format`/`format:check`/`typecheck`/`test`) e o `vitest.config.ts` da raiz.
- Mover, renomear ou escopar `tests/smoke.test.ts` (raiz) — ele fica onde está, coberto só pela execução da raiz.
- Criar `vitest.config.ts` por package.
- Adicionar scripts `lint`/`format:check` por package (decisão D6).
- Adicionar, remover ou reescrever casos de teste; aumentar cobertura; **corrigir teste existente que passe hoje — com uma única exceção nomeada, a da Frente 1 (D14): o fecho de sessão faltante no caso `"updatePersona sobre a Persona ativa recusa com operação em voo…"`, limitado a acrescentar o fecho.** Nenhuma outra correção de teste é autorizada por esta SPEC, ainda que pareça análoga; se aparecer um segundo vazamento (ou outra causa de flake sob `shuffle`), **pare e reporte**.
- **Refazer a Frente 1 já executada.** O helper e os sete arquivos já na árvore de trabalho são o ponto de partida; a v1.2 acrescenta uma correção pontual, não reabre a quebra.
- Alterar `.claude/agents/spec-drafter.md` e `.claude/agents/architecture-reviewer.md` — não rodam comandos de verificação.
- Qualquer alteração de permissões, ferramentas ou modelo declarados nos arquivos de subagent — só o texto da instrução de verificação muda.

---

# Pré-requisitos

- [SPEC-0041](./SPEC-0041-desktop-piper-only-voice-surface.md) — `Done` (verificado: `- [x] Done` no arquivo). É a última SPEC que tocou a suíte de `apps/desktop/tests`; a quebra precisa partir do arquivo já em seu estado final.

Nenhum outro pré-requisito: esta SPEC não depende de comportamento novo de nenhum package.

---

# Critérios de Aceitação

1. `apps/desktop/tests/core-bridge.test.ts` **não existe mais**.
2. Existem, em `apps/desktop/tests/`, os sete arquivos listados no Escopo — admitida a subdivisão prevista na Observação sobre o teto de linhas (D13) — **e nenhum outro arquivo `core-bridge*.test.ts` além desses**.
3. Existe `apps/desktop/tests/helpers/core-bridge-harness.ts`, e ele **não** contém nenhuma chamada `describe(` nem `it(` (é módulo auxiliar, não suíte).
4. Nenhum arquivo `core-bridge*.test.ts` resultante excede **500 linhas**.
5. `pnpm test` na raiz reporta **745 testes passando** — o mesmo total de antes da SPEC. A correção da exceção D14 é **fecho de recurso, não caso novo**: 745 permanece válido depois dela.
6. `pnpm test` na raiz reporta **62 arquivos de teste** (56 antes − 1 removido + 7 criados).
7. A união dos títulos de teste (`describe` + `it`) dos arquivos novos é **idêntica**, como conjunto, à do arquivo removido — verificável comparando a lista de nomes do reporter `verbose` antes e depois. A exceção D14 **não** altera nenhum título, logo este critério vale sem ajuste.
8. **Isolamento entre arquivos:** cada um dos sete arquivos passa quando executado **sozinho** (`pnpm --filter @atlas/desktop test <arquivo>`), e a suíte de desktop passa também com execução em paralelo (default do Vitest, sem `--no-file-parallelism`) e com `--sequence.shuffle`. **Não enfraquecer**: `--sequence.shuffle` é obrigatório e foi o mecanismo que expôs o defeito da v1.2.
9. Nenhum arquivo sob `apps/desktop/src/` ou `packages/*/src/` aparece no diff desta SPEC — inclusive após a exceção D14, que é diff de teste.
10. `.github/workflows/ci.yml` não aparece no diff desta SPEC.
11. Os 13 `package.json` listados no Escopo possuem `"test": "vitest run"` em `scripts`.
12. `pnpm --filter @atlas/desktop test` executa **apenas** os arquivos sob `apps/desktop/tests/` e passa.
13. `pnpm --filter @atlas/tools test` executa **apenas** os arquivos sob `packages/tools/tests/` e passa (segunda amostra, para provar que a convenção não é específica do desktop).
14. A soma dos totais de teste das 13 execuções escopadas é **744**. A diferença para os 745 da raiz (CA 5) é **exatamente um** arquivo, nomeado: **`tests/smoke.test.ts`** (raiz do workspace, `describe('workspace bootstrap')`, 1 teste), que não pertence a nenhum package e por construção não é alcançado por nenhuma execução escopada. Qualquer outro déficit é bug. A exceção D14 não altera este número.
15. O `scripts` do `package.json` da raiz é byte-idêntico ao anterior; `vitest.config.ts` da raiz é byte-idêntico ao anterior.
16. `docs/04-engineering/ClaudeCodeAutomation.md` contém a subseção "Verificação escopada" com os quatro comandos do Escopo.
17. Após o diff, `.claude/agents/spec-validator.md` e `.claude/agents/spec-closer.md` contêm, **cada um**, as quatro strings literais `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` (verificável por `grep`), e `.claude/agents/spec-implementer.md` instrui verificação escopada durante a iteração.
18. O diff em `.claude/agents/*.md` toca **apenas** texto de instrução de verificação — nenhuma linha do front-matter (`name`/`description`/`tools`/`model`) alterada.
19. `pnpm lint`, `pnpm typecheck` e `pnpm format:check` passam sem erro na raiz.
20. A subseção "Verificação escopada" de `docs/04-engineering/ClaudeCodeAutomation.md` contém um parágrafo que declara explicitamente: (a) que a execução escopada roda sem config, no default do Vitest; (b) que a equivalência com a execução da raiz vale **enquanto `vitest.config.ts` da raiz contiver apenas `include`**; (c) que acrescentar `setupFiles`/`environment`/`coverage`/`pool` (ou qualquer outra chave) à config raiz quebra essa equivalência em silêncio e obriga a revisar a convenção.
21. A mesma subseção nomeia `tests/smoke.test.ts` como o arquivo fora de qualquer package, coberto só pela execução da raiz.
22. `.claude/agents/spec-implementer.md` não contém mais a afirmação de que os packages não têm script `test` próprio.
23. **(v1.2)** O caso `"updatePersona sobre a Persona ativa recusa com operação em voo…"` fecha a sessão que abre, em **todos** os caminhos de saída (`finally` ou equivalente). O diff desse caso contém **exclusivamente** o fecho acrescentado: apenas linhas de estrutura `try`/`finally` e a chamada de fecho — nenhum título, asserção ou chamada sob teste alterada.
24. **(v1.2)** Nenhum outro caso de teste é modificado pela exceção D14: comparado bloco a bloco com o arquivo monolítico original (`git show HEAD:apps/desktop/tests/core-bridge.test.ts`), o conteúdo dos sete arquivos difere apenas por imports, uso do helper e o fecho do CA 23.
25. **(v1.2)** A suíte de desktop passa sob `--sequence.shuffle` em **três execuções consecutivas com sementes distintas** — um flake intermitente não se declara resolvido com uma única execução verde.

---

# Arquivos Esperados

```text
apps/desktop/tests/helpers/core-bridge-harness.ts   (novo — já na árvore de trabalho)
apps/desktop/tests/core-bridge.status-ask.test.ts   (novo — já na árvore de trabalho)
apps/desktop/tests/core-bridge.chat-session.test.ts (novo — já na árvore de trabalho)
apps/desktop/tests/core-bridge.memory.test.ts       (novo — já na árvore de trabalho)
apps/desktop/tests/core-bridge.persona-selection.test.ts (novo — já na árvore de trabalho)
apps/desktop/tests/core-bridge.persona-authoring.test.ts (novo — recebe o fecho do CA 23)
apps/desktop/tests/core-bridge.permissions.test.ts  (novo — já na árvore de trabalho)
apps/desktop/tests/core-bridge.boundary.test.ts     (novo — já na árvore de trabalho)
apps/desktop/tests/core-bridge.test.ts              (REMOVIDO)

packages/contracts/package.json      (script test)
packages/core/package.json           (script test)
packages/model-gateway/package.json  (script test)
packages/context/package.json        (script test)
packages/memory/package.json         (script test)
packages/tools/package.json          (script test)
packages/runtime/package.json        (script test)
packages/permissions/package.json    (script test)
packages/cognitive/package.json      (script test)
packages/skills/package.json         (script test)
packages/persona/package.json        (script test)
apps/cli/package.json                (script test)
apps/desktop/package.json            (script test)

docs/04-engineering/ClaudeCodeAutomation.md  (subseção "Verificação escopada")
.claude/agents/spec-implementer.md           (instrução de verificação)
.claude/agents/spec-validator.md             (instrução de verificação)
.claude/agents/spec-closer.md                (instrução de verificação)
docs/implementation/specs/SPEC-0042-test-split-scoped-verification.md
```

---

# Componentes Impactados

- `@atlas/desktop` — **somente a suíte de testes**; nenhum arquivo de `src/`.
- Todos os 13 workspaces com testes — somente o campo `scripts` do `package.json`.
- Processo de desenvolvimento (`docs/04-engineering/ClaudeCodeAutomation.md`, `.claude/agents/*`).

Nenhum módulo do Module Catalog muda de responsabilidade. Nenhum módulo novo.

---

# Interfaces Necessárias

Nenhuma interface pública nova. `@atlas/contracts` não é tocado.

Uma única interface **interna de teste**, no helper:

```ts
// apps/desktop/tests/helpers/core-bridge-harness.ts
export function useTmpDir(): {
  path(): string;
  baseOverride(overrides?: AtlasConfigOverride): AtlasConfigOverride;
};
export const repoRoot: string;
```

`useTmpDir()` registra `beforeEach`/`afterEach` (cria e remove o diretório temporário) e devolve os acessores. `repoRoot` é consumido só por `core-bridge.boundary.test.ts`. A forma exata pode variar desde que o helper não contenha suítes (CA 3) e que o `tmpDir` continue **por caso de teste**, nunca compartilhado entre casos.

---

# Fluxo Esperado

```text
Antes:
  core-bridge.test.ts (1.432 linhas, 8 blocos describe, 7 assuntos)
      ↓ Read do subagent = ~14,6k tokens por leitura, 15 leituras medidas

Depois:
  helpers/core-bridge-harness.ts
      ↓
  status-ask · chat-session · memory · persona-selection ·
  persona-authoring · permissions · boundary
      ↓ Read do assunto relevante ≈ 1/7 do custo

Verificação:
  iteração  → pnpm --filter <pkg> test | typecheck
              pnpm exec eslint <caminho> | prettier --check <caminho>
  conclusão → pnpm typecheck && pnpm lint && pnpm test && pnpm format:check (raiz)
  CI        → inalterada (sempre a raiz, sempre tudo)
```

---

# Estratégia de Implementação

> **Ponto de retomada (v1.2):** os passos 1–5 **já foram executados** e o resultado está na árvore de trabalho (helper + sete arquivos, monólito removido, paridade de títulos confirmada por `diff` vazio contra o baseline, maior arquivo com 432 linhas). Retome no passo 6. **Não refaça a quebra.** A Frente 2 não foi iniciada.

1. ~~Registrar a linha de base~~ — **feito**: 745 testes / 56 arquivos, batendo com a SPEC; lista de títulos salva fora do repositório.
2. ~~Criar `tests/helpers/core-bridge-harness.ts`~~ — **feito**.
3. ~~Mover os blocos `describe`, um arquivo por vez~~ — **feito**.
4. ~~Remover `core-bridge.test.ts`~~ — **feito**.
5. ~~Conferir paridade de títulos e totais~~ — **feito**.
6. **(v1.2)** Aplicar o fecho de sessão da exceção D14 ao caso nomeado (CA 23), sem tocar em mais nada (CA 24).
7. Rodar cada arquivo isoladamente e a suíte de desktop sob `--sequence.shuffle` em três sementes distintas (CA 8, CA 25).
8. Frente 2: adicionar o script `test` aos 13 `package.json`; validar `pnpm --filter @atlas/desktop test` e `pnpm --filter @atlas/tools test`; somar os 13 totais e conferir contra 744 + `tests/smoke.test.ts` (CA 14).
9. Atualizar `ClaudeCodeAutomation.md` (comandos + parágrafo de condição de validade + nota sobre `tests/smoke.test.ts`) e os três arquivos de subagent.
10. Fechar com `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` na raiz.

---

# Estratégia de Testes

Esta SPEC **não cria testes novos** — ela reorganiza os existentes. A verificação é sobre a própria reorganização:

- **Paridade de cobertura**: total de testes e conjunto de títulos idênticos antes/depois (CA 5, 7).
- **Isolamento**: cada arquivo passa sozinho; a suíte passa embaralhada, em três sementes, e em paralelo (CA 8, CA 25). Este é o risco real da quebra — `core-bridge.ts` mantém estado de módulo (seleção de Persona, seleção de permissões, `busySessions`, `inFlightOperations` e o `Map` de sessões vivas) e expõe `__resetBridgeStateForTests()`. **O achado da v1.2 corrigiu a premissa do gate**: não bastava vigiar os quatro blocos sem `reset` próprio — o bloco de autoria de Persona **tem** `reset` e ainda assim vaza, porque o `reset` não fecha sessões abertas.
- **Escopo do `--filter`**: cada execução escopada roda só os arquivos do próprio package (CA 12, 13) e a soma fecha em 744 + o órfão nomeado (CA 14).
- **Não-regressão de produção**: garantida estruturalmente pelo diff vazio em `src/` (CA 9), preservado mesmo com a exceção D14.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- testes estiverem passando (745 na raiz; 744 na soma escopada, com `tests/smoke.test.ts` como único fora);
- a suíte de desktop passar sob `--sequence.shuffle` em três sementes distintas;
- documentação atualizada;
- arquitetura preservada (zero diff em `src/`);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md` — **incluindo obrigatoriamente o achado do flake pré-existente** (ver Observações).

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` raiz + `apps/desktop/CLAUDE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é do passo `doc-sync` no fecho, **não** do `spec-implementer`. O implementador toca apenas a documentação prevista nesta SPEC: `docs/04-engineering/ClaudeCodeAutomation.md`, os três `.claude/agents/*.md` e o arquivo desta SPEC.

---

# Restrições

- **Nada de mudança de comportamento de produção.** Nenhum arquivo em `packages/*/src` ou `apps/*/src`.
- **Cobertura preservada integralmente.** Se a contagem de testes mudar, é bug — não "ajuste".
- Não criar módulos, Tools, Skills ou Personas. Não tocar `@atlas/contracts`.
- Não reduzir o que a CI verifica; o `--filter` é para o trabalho local/subagent.
- Não introduzir dependência nova (nem `devDependency`).
- Não renomear nenhum teste "de passagem", mesmo que o nome pareça melhorável.
- Movimentação mecânica: se um bloco só passar depois de reescrito, **pare e reporte** — é sinal de acoplamento oculto entre blocos, não licença para reescrever. (Isto **não** vale para o passo 0: os oito blocos de topo já foram verificados contra a tabela do Escopo.)
- **(v1.2)** A exceção D14 é **estreita e única**: um caso, uma natureza de correção. Se surgir um segundo vazamento de sessão — ou qualquer outra causa de flake sob `shuffle` —, **pare e reporte**; não estenda a exceção por analogia.

---

# Observações

- O ganho esperado é indireto e não medido por teste automatizado: menos tokens por `Read` de subagent e menos saída de verificação no contexto. Não há CA sobre economia de token — só sobre a estrutura que a viabiliza.
- **Candidatos futuros nomeados** (fora desta SPEC): quebra de `apps/desktop/src/renderer/renderer.js` (952 linhas) e de `apps/desktop/src/core-bridge.ts` (753 linhas); ambos apareceram na medição com 27 e 26 leituras respectivamente e são os próximos alvos naturais — mas mexem em código de produção e merecem SPEC própria. **(v1.2)** Soma-se a eles: **`__resetBridgeStateForTests()` não fecha sessões abertas** (D15).
- **Teto de linhas (gatilho de D13):** o arquivo de permissões (402 linhas de origem) e o de autoria de Persona (421) são os maiores. Se algum exceder 500 linhas, divida-o por sub-`describe`, mantendo o prefixo `core-bridge.` e o sufixo `.test.ts`; esse oitavo arquivo é admitido pelo CA 2. Não ocorreu: o maior ficou em 432 linhas.

## Achado da v1.2 — flake **pré-existente** de vazamento de sessão (fato da SPEC)

Registrado aqui porque é **matéria obrigatória das Lições Aprendidas**, não nota de rodapé:

- **O que**: o caso `"updatePersona sobre a Persona ativa recusa com operação em voo…"` abre uma sessão com `openChatSession` e termina em `releaseFirstCall(); await turnPromise;` — **sem fechá-la**. O `SessionId` vaza no `Map` de sessões vivas, que é estado de módulo do `core-bridge`.
- **Por que escapou**: o `afterEach` do bloco chama `__resetBridgeStateForTests()`, que reseta seleção de Persona e de permissões, mas **não fecha sessões abertas**. Na ordem natural de execução, nenhum caso posterior observava o resíduo.
- **Como falha**: sob `--sequence.shuffle`, um caso posterior herda a sessão vazada; `updatePersona` fecha por design todas as sessões vivas da Persona ativa, `closedSessions` chega com 2 ids em vez de 1, e `expect(mutation.closedSessions).toEqual([session])` falha.
- **Pré-existência provada**: a mesma falha foi reproduzida rodando o **arquivo monolítico original** (`git show HEAD:apps/desktop/tests/core-bridge.test.ts`, copiado à parte) sob `--sequence.shuffle` — falha idêntica, mesmo teste, mesmo padrão de erro. **A quebra não introduziu o defeito; apenas o tornou observável.**
- **Lição**: a premissa do gate (risco confinado aos "quatro blocos sem `reset` próprio") estava errada por um motivo instrutivo — **ter um `reset` não basta se o `reset` não cobre todo o estado de módulo**. É exatamente o tipo de defeito que só aparece quando se para de depender de ordem de execução, e é o argumento mais forte a favor de manter `--sequence.shuffle` no CA 8.

---

# Checklist para IA

Antes de implementar:

- ler `apps/desktop/CLAUDE.md` (mapa do `core-bridge.ts`) e esta SPEC;
- **(v1.2)** inspecionar o estado da árvore de trabalho **antes de agir**: a Frente 1 já está feita; retomar do passo 6 da Estratégia;
- linha de base já registrada e confirmada: **745 testes / 56 arquivos**;
- confirmar que os **oito** blocos `describe` de topo (linhas 31, 80, 151, 259, 357, 542, 946, 1369) são os da tabela do Escopo, que os funde em sete arquivos.

Durante implementação:

- mover, nunca reescrever;
- um arquivo por vez, rodando a suíte escopada a cada passo;
- preservar o padrão de import dinâmico e o `__resetBridgeStateForTests()` de cada caso;
- **(v1.2)** aplicar a exceção D14 **uma vez só**, no caso nomeado, e nada além.

Após implementação:

- comparar títulos e totais com a linha de base;
- rodar cada arquivo isoladamente e a suíte embaralhada em três sementes;
- validar os Critérios de Aceitação um a um;
- registrar lições aprendidas, incluindo o achado da v1.2.

---

# Resultado Esperado

A suíte do `core-bridge` deixa de ser um arquivo de 1.432 linhas e passa a ser sete arquivos por assunto, cada um legível (e carregável no contexto) isoladamente, com a mesma cobertura — 745 testes, agora em 62 arquivos — e **estável sob ordem embaralhada**, com um flake pré-existente de vazamento de sessão corrigido no teste que o causava. Trabalhar num package deixa de exigir rodar o workspace inteiro: `pnpm --filter <package> test` existe, está documentado onde os subagents leem, com a condição de validade da equivalência registrada, e a CI continua verificando tudo na raiz. Nenhum comportamento do Atlas muda para o usuário.

---

# Decisões de design

**D1 — Sete arquivos, derivados dos oito blocos `describe` de topo, com prefixo `core-bridge.`**

- **Decisão**: dividir exatamente pelos oito `describe` de topo já existentes (fundindo `resolveStatusSnapshot` + `resolveAskSnapshot` num só arquivo, por serem as duas funções stateless de turno), nomeando `core-bridge.<assunto>.test.ts`.
- **Porquê**: a fronteira já está desenhada no arquivo — os `describe` de topo espelham as famílias que `apps/desktop/CLAUDE.md` documenta em `core-bridge.ts`. Usar a fronteira existente torna a movimentação mecânica e auditável (CA 7), que é o único jeito de garantir cobertura preservada. O prefixo comum mantém os arquivos adjacentes na listagem do diretório.
- **Alternativa descartada**: dividir por tamanho alvo (~200 linhas por arquivo, ignorando assunto). Perdeu porque cortaria blocos ao meio, exigiria decidir setup por corte e destruiria a rastreabilidade título-a-título.

**D2 — `status` e `ask` no mesmo arquivo**

- **Decisão**: `resolveStatusSnapshot` e `resolveAskSnapshot` compartilham `core-bridge.status-ask.test.ts`.
- **Porquê**: somam 118 linhas; um arquivo de 47 linhas para `status` sozinho troca um god file por fragmentação, o que falha o teste da Constituição ("mais simples?").
- **Alternativa descartada**: um arquivo por bloco (oito arquivos). Perdeu por fragmentação sem ganho: o custo de `Read` de um arquivo de 47 linhas já é desprezível.

**D3 — Helper compartilhado em `tests/helpers/`, não duplicação do preâmbulo**

- **Decisão**: extrair `repoRoot`/`tmpDir`/`baseOverride` para `apps/desktop/tests/helpers/core-bridge-harness.ts`.
- **Porquê**: duplicar 20 linhas de setup em sete arquivos cria sete pontos de deriva num setup que já é sutil (o `tmpDir` precisa continuar **por caso**). O helper fica fora do padrão `*.test.ts` do `include`, então não vira suíte fantasma.
- **Alternativa descartada**: repetir o preâmbulo em cada arquivo (zero indireção). Perdeu porque o projeto já paga o preço de duplicação deliberada no renderer (6 ocorrências, ADR-0019) e lá ela é **inevitável**; aqui não é — duplicar por gosto seria débito gratuito.

**D4 — Isolamento entre arquivos vira Critério de Aceitação próprio (CA 8)**

- **Decisão**: exigir que cada arquivo passe sozinho, em paralelo e com `--sequence.shuffle`.
- **Porquê**: `core-bridge.ts` mantém estado de módulo (`selectedPersona`, seleção de permissões, `busySessions`, `inFlightOperations`, `Map` de sessões) — este é o risco real da quebra, e "a suíte inteira passou" não o detecta. **A v1.2 confirmou o valor deste CA na prática**: ele expôs um flake pré-existente que a ordem natural escondia.
- **Alternativa descartada**: confiar no isolamento por arquivo do Vitest sem CA explícito. Perdeu porque o isolamento é configurável e uma regressão futura de config transformaria um sucesso silencioso em falha intermitente — exatamente o tipo de bug que o Artigo 1 manda documentar em vez de assumir.

**D5 — `--filter` viabilizado por `"test": "vitest run"` em cada package**

- **Decisão**: adicionar o script `test` aos 13 `package.json` com testes, sem `vitest.config.ts` por package.
- **Porquê**: hoje nenhum package tem script `test` (só a raiz), então `pnpm --filter <pkg> test` simplesmente não existe — o pedido literal do usuário exige criá-lo. Rodando no diretório do package, o Vitest não encontra config e usa o `include` default, que casa exatamente com `tests/**/*.test.ts` daquele package; 13 configs novas seriam 13 arquivos para replicar um default.
- **Custo registrado (ver D12)**: a execução escopada roda sem config; a equivalência com a CI é condicional ao estado atual da config raiz.
- **Alternativa descartada**: manter só a raiz e instruir `pnpm exec vitest run <caminho>` (o que os subagents já fazem hoje). Perdeu porque não é o que o usuário pediu e mantém a saída da execução amarrada à config raiz; o `--filter` também dá, de graça, o mesmo verbo para `typecheck`.

**D6 — `lint` e `format:check` escopados por caminho, não por script de package**

- **Decisão**: `pnpm exec eslint <caminho>` e `pnpm exec prettier --check <caminho>`; nenhum script `lint`/`format:check` por package.
- **Porquê**: a flat config do ESLint e as regras de ignore do Prettier vivem na raiz e são únicas; scripts por package só funcionariam com resolução de config para cima (frágil) ou duplicando config (débito). Ambas as ferramentas já aceitam caminho como argumento — o escopo sai sem infraestrutura nova.
- **Alternativa descartada**: `"lint": "eslint ."` por package. Perdeu por acoplar a 13 packages um detalhe de resolução de config do ESLint, contrariando "minimizar dependências desnecessárias" (PRD, NFR).

**D7 — CI intocada; verificação completa na raiz preservada como obrigação do validador/fechador**

- **Decisão**: `.github/workflows/ci.yml` e os scripts da raiz ficam byte-idênticos; o escopo é para a iteração, e `spec-validator`/`spec-closer` continuam obrigados a uma passada completa na raiz — agora verificável por `grep` (CA 17).
- **Porquê**: o objetivo é reduzir contexto, não reduzir garantia. A salvaguarda autor≠verificador da Emenda v1.1 perde sentido se o verificador passar a olhar menos do que o autor mexeu — e como o `spec-implementer` reescreve, no mesmo run, as instruções de quem vai verificar esta própria SPEC, a obrigação precisa ser literal, não prosa interpretável.
- **Alternativa descartada**: escopar também a CI por package tocado (matriz por path). Perdeu por trocar uma economia local de tokens por risco de regressão cruzada entre packages, o pior negócio possível.

**D8 — `renderer.js` e `core-bridge.ts` ficam fora**

- **Decisão**: nenhum arquivo de produção é dividido nesta SPEC; ambos ficam registrados como candidatos futuros.
- **Porquê**: o pedido do usuário nomeia o arquivo de teste; dividir código de produção muda a fronteira de módulos do app e teria de ser julgado como mudança estrutural, não higiene. Misturar as duas coisas contamina a garantia "diff vazio em `src/`" (CA 9), que é o que torna esta SPEC barata de revisar.
- **Alternativa descartada**: incluir o `renderer.js` (27 leituras medidas, maior custo agregado de todos). Perdeu porque exigiria decidir o mecanismo de divisão de um `<script>` clássico sem bundler (ADR-0019) — decisão arquitetural, portanto ADR, portanto escalação.

**D9 — `.claude/agents/*.md` estão no escopo, limitados ao texto de verificação**

- **Decisão**: editar os três arquivos de subagent que rodam comandos, tocando apenas a instrução de verificação (CA 18 trava o front-matter).
- **Porquê**: a instrução de verificação vive lá; mudar só a documentação em `docs/` não mudaria o comportamento medido, e o ganho da Frente 2 não se realizaria. O `ClaudeCodeAutomation.md` continua sendo a fonte normativa; os arquivos de agente a espelham.
- **Alternativa descartada**: documentar só em `docs/04-engineering/ClaudeCodeAutomation.md`. Perdeu porque os subagents recebem seu prompt do arquivo de agente, não do doc — a mudança seria decorativa.

**D10 — Perfil `completo`**

- **Decisão**: classificar como `completo`.
- **Porquê**: o diff atravessa 13 `package.json` (todos os packages e apps), `docs/` e `.claude/` — muito além do "um package + a CLI que o expõe" que a Emenda v1.2 exige do `micro`. Ainda que seja aditiva e sem ADR, a regra é conjuntiva e falha na primeira condição.
- **Alternativa descartada**: `micro`, argumentando que a Frente 1 se restringe a `apps/desktop/tests`. Perdeu porque o perfil vale para a SPEC inteira, e na dúvida o template manda usar `completo`.

**D11 — Prioridade `High`**

- **Decisão**: `High`, não `Critical` nem `Medium`.
- **Porquê**: o custo é medido e recorrente (o `spec-implementer` sozinho acumula 44,4M tokens efetivos) e afeta toda SPEC futura, o que tira de `Medium`; mas nada está quebrado nem bloqueado hoje, o que tira de `Critical`.
- **Alternativa descartada**: `Medium`, tratando como faxina opcional. Perdeu porque o custo cresce a cada SPEC nova sobre o mesmo arquivo — adiar é pagar juros.

**D12 — A condição de validade de D5 vira documentação normativa, não config duplicada**

- **Decisão**: registrar em `ClaudeCodeAutomation.md` (e travar por CA 20) que a execução escopada roda no default do Vitest e só equivale à execução da raiz **enquanto `vitest.config.ts` da raiz contiver apenas `include`**; qualquer chave nova (`setupFiles`, `environment`, `coverage`, `pool`…) quebra a equivalência em silêncio e obriga a revisar a convenção.
- **Porquê**: hoje os dois caminhos são de fato equivalentes, mas a equivalência é acidental, não garantida. Deixá-la implícita criaria a pior falha possível — o subagent verificando algo diferente do que a CI verifica, sem sinal —, o que morde a garantia de D7 e o Artigo 14. Escrever a condição é o custo mínimo que preserva o benefício de D5.
- **Alternativa descartada**: criar `vitest.config.ts` por package importando a config raiz, tornando a equivalência estrutural em vez de documental. Perdeu por 13 arquivos novos de infraestrutura para proteger contra um evento que ainda não ocorreu; se a config raiz um dia crescer, essa é a correção óbvia — e a nota documental é exatamente o gatilho que vai acioná-la.

**D13 — CA 2 admite a subdivisão; o teto de 500 linhas permanece normativo**

- **Decisão**: resolver a contradição a favor do teto: o CA 2 admite explicitamente o oitavo arquivo previsto nas Observações ("os sete listados, admitida a subdivisão prevista, e nenhum outro `core-bridge*.test.ts`"), e o CA 4 (500 linhas) segue obrigatório, aplicado a todo arquivo `core-bridge*.test.ts` resultante.
- **Porquê**: o teto de linhas é o objetivo desta SPEC (arquivo grande é o custo medido); a contagem exata de arquivos é só o meio. Entre relaxar o fim e relaxar o meio, relaxa-se o meio. Com o CA 2 reescrito, os dois critérios são simultaneamente verificáveis em qualquer cenário, e a decisão não sobra para o implementador.
- **Alternativa descartada**: tornar o teto de 500 linhas uma observação não-normativa e manter "exatamente sete arquivos". Perdeu porque um CA sem força não é CA — o `spec-validator` não teria como reprovar um arquivo de 700 linhas, que é precisamente o defeito que a SPEC existe para corrigir.

**D14 — (v1.2) O vazamento de sessão é corrigido no teste, por exceção nomeada e estreita — rota (a)**

- **Decisão**: acrescentar o fecho de sessão faltante ao caso `"updatePersona sobre a Persona ativa recusa com operação em voo…"`, abrindo para isso uma exceção **única e nomeada** à proibição de "corrigir teste existente que passe hoje". O CA 8 permanece intacto, com `--sequence.shuffle` obrigatório.
- **Porquê**: o defeito é **do teste** — ele adquire um recurso (sessão viva) e não o libera. Corrigi-lo onde ele está é a mudança mínima, mantém o diff de produção vazio (CA 9), preserva a garantia central "nenhuma mudança de comportamento de produção" e não gasta a única prova de que a quebra não introduziu flake. Delimitar a exceção por nome (um caso, uma natureza de correção, CA 23/24) impede que ela vire licença geral de reescrita — o risco que a proibição original existia para conter.
- **Alternativas descartadas**: **(b)** fazer `__resetBridgeStateForTests()` fechar sessões abertas — perdeu por inverter a responsabilidade (mudar produção para acomodar defeito de teste) e quebrar o CA 9, que é o que torna esta SPEC barata de revisar; a ideia não é ruim em si e sobrevive como D15. **(c)** remover `--sequence.shuffle` do CA 8 — perdeu por ser a pior das três: esvaziaria o único critério que prova a não-introdução de flake, deixando um defeito conhecido não registrado **e** não corrigido.

**D15 — (v1.2) A lacuna de `__resetBridgeStateForTests()` vira candidato futuro nomeado, não aceitação silenciosa**

- **Decisão**: registrar explicitamente, nas Observações e no Fora do Escopo, que `__resetBridgeStateForTests()` reseta seleção de Persona e de permissões mas **não** fecha sessões vivas — lacuna real, endereçável numa fatia própria que toque `src/`, fora desta SPEC.
- **Porquê**: a rota (a) corrige o sintoma neste caso; a lacuna do `reset` continua sendo armadilha para todo teste futuro que abra sessão. Nomeá-la é o que o Artigo 1 exige (nada de comportamento não documentado assumido) e o que evita que o próximo autor redescubra o mesmo flake do zero. Não é matéria de ADR — é hardening de um helper de teste exposto por `src/`.
- **Alternativa descartada**: aceitar em silêncio, já que o sintoma foi corrigido. Perdeu porque transformaria uma lacuna conhecida em conhecimento tácito, exatamente o modo de falha que o Artigo 1 proíbe.
