# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-07-13

Este documento existe para que qualquer sessão nova (humano ou IA, qualquer modelo) retome o trabalho sem depender de contexto de conversa. Atualize-o ao encerrar sessões de trabalho relevantes.

---

# Estado Imediato

- **SPEC-0008 (Persona Service): `Done`** (aprovada pelo humano em 2026-07-13). Entregue: package `packages/persona` (`@atlas/persona`) com `createPersonaService()` (registro embutido `jarvis`/default + `neutral`, `get/has/list`, `systemPrompt(persona)`, `PERSONA_IDS`); contrato `Persona`/`PersonaService` em `@atlas/contracts`; `CognitiveCoreDeps` ganha `personaPrompt?: string` — o Cognitive compõe `personaPrompt` (identidade) + `TASK_FRAMING` (tarefa, renomeado de `SYSTEM_PROMPT`) no system message, sem conhecer o conceito de Persona; `@atlas/core` resolve a Persona ativa (`config.persona`, default `jarvis`, validado contra `PERSONA_IDS`) e expõe `atlas.persona`; CLI seleciona por `--persona`/`ATLAS_PERSONA`, `atlas status` exibe a Persona ativa, `atlas chat` a saúda ao abrir. ADR-0010 registra a decisão e a superação do "neutro por design" das SPECs 0005–0007 — o Cognitive **deixou de ter** system prompt neutro: agora compõe identidade (Persona) + tarefa (Cognitive) numa única chamada `generate`. `respond` segue função pura; Core sem estado.
- **SPEC-0007 (Context Service): `Done`** (aprovada pelo humano em 2026-07-13). Entregue: package `packages/context` (`@atlas/context`) com `createContextService()` (store de sessão em memória: `openSession/getConversation/updateConversation/closeSession`); contrato `ContextService`/`SessionId` em `@atlas/contracts`; `@atlas/core` compõe e expõe `atlas.context`; `atlas chat` migrado para usar `atlas.context` como detentor da conversa (removida a variável `let conversation` do loop; sessão fechada ao sair); `CognitiveCore.respond` permanece função pura e inalterado; ADR-0009 registra a resolução ("Context é store de valor; a app medeia").
- **SPEC-0006 (atlas chat): `Done`** (aprovada pelo humano em 2026-07-13). Entregue: comando `atlas chat` (conversa interativa multi-turno) + `CognitiveCore.startConversation`/`respond` (conversa-como-dado, ADR-0008).
- **SPEC-0005 (cognitive-core): `Done`** (aprovada pelo humano em 2026-07-13). Entregue: `packages/cognitive` (`@atlas/cognitive`) + comando `atlas ask`.
- **SPEC-0004 (model-gateway): `Done`**. SPEC-0001, SPEC-0002 e SPEC-0003: `Done`.
- `apps/cli` (`@atlas/cli`) existe: `atlas status` sobe o core pelo terminal, mostra estado + config resolvida (precedência `flags > env > defaults`) e desliga; `atlas ask "<objetivo>"` envia um objetivo ao núcleo cognitivo e imprime a resposta (default provider `local`/Ollama; flags `--provider/--model/--base-url/--api-key`, envs `ATLAS_MODEL*`); `atlas chat` abre uma conversa interativa multi-turno (mesmas flags/env; loop `readline` via `LineReader` injetável; sai em `/sair`/`/exit`/EOF/Ctrl-C; erro de modelo tratado dentro do loop sem derrubá-lo; conversa segurada por `atlas.context`, ADR-0008/0009); `--help`/`--version` também. Execução do fonte via `tsx` (ADR-0005), sem `dist/`. Rodar: `pnpm --filter @atlas/cli exec tsx src/main.ts ask "diga olá" --provider fake` ou `printf 'oi\n/sair\n' | pnpm --filter @atlas/cli exec tsx src/main.ts chat --provider fake` (o `rtk proxy tsx` não acha o binário; use `pnpm exec`).
- `packages/context` (`@atlas/context`) existe: `createContextService()` → `openSession/getConversation/updateConversation/closeSession`; guarda uma `Conversation` por sessão num `Map` em memória; erro de sessão inexistente é `ContextError` (`AtlasError` code `ATLAS_CONTEXT`). **Store de valor, não orquestrador** (ADR-0009): não decide estratégia, não chama o Cognitive Core. Depende só de `@atlas/contracts`.
- `packages/cognitive` (`@atlas/cognitive`) existe: `createCognitiveCore({ gateway, personaPrompt? })` → `ask(objetivo)` (tiro único) + `startConversation()`/`respond(conversation, input)` (conversa multi-turno como **dado**, função pura; Core sem estado — ADR-0008). System prompt **composto** (ADR-0010): `personaPrompt` (identidade, opcional) + `TASK_FRAMING` (tarefa) — deixou de ser "neutro por design". Depende só do contrato em `@atlas/contracts`. **Primeiro consumidor do Model Gateway.**
- `packages/persona` (`@atlas/persona`) existe: `createPersonaService()` → `get/has/list` sobre um registro embutido (`jarvis` default + `neutral`) e `systemPrompt(persona)` (deriva o enquadramento de identidade dos atributos textuais; voz/emoção não entram). `PERSONA_IDS` é a fonte da validação de `config.persona` no core. Erro de persona desconhecida é `PersonaError` (`AtlasError` code `ATLAS_PERSONA`). Depende só de `@atlas/contracts`; identidade é **injetada na geração** do Cognitive (ADR-0010).
- `packages/model-gateway` (`@atlas/model-gateway`) existe: `createModelGateway(config)` → `generate()` (geração única, sem streaming) com provedor por config — `fake` (testes), `local`/Ollama (grátis), `remote` (pago, OpenAI-compatible). Provedores de rede recebem `fetch` por parâmetro (testados sem rede). Verificação real: `pnpm --filter @atlas/model-gateway exec tsx scripts/smoke.ts --provider fake|local|remote`.
- `@atlas/core` compõe `createModelGateway(config.model, { fetch })` + `createCognitiveCore({ gateway, personaPrompt })` + `createContextService()` + `createPersonaService()` e expõe `atlas.cognitive`/`atlas.context`/`atlas.persona`; `createAtlas(options, { fetch })` injeta `fetch` (testes sem rede). `config.model` e `config.persona` (contra `PERSONA_IDS`) validados no `loadConfig`.
- Suíte completa verde na última verificação (2026-07-13): `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` (**99 testes, 18 arquivos**).
- Working tree limpa; branch única `main`, **sem remote** (GitHub/CI ainda não decididos).

---

# Próximo Trabalho: SPEC-0009 (a definir)

A fundação do MVP (workspace + core + CLI + acesso a modelos), a **primeira resposta cognitiva ponta a ponta** (SPEC-0005), a **conversa interativa multi-turno** (SPEC-0006, `atlas chat`), o **Context Service** (SPEC-0007, detentor da conversa por sessão) e o **Persona Service** (SPEC-0008, identidade Jarvis injetada na geração) estão entregues. A próxima SPEC ainda **não foi escolhida** — decidir no brainstorming. Candidatas plausíveis (nenhuma comprometida — o projeto não tem roadmap):

- **Próximas etapas do ciclo cognitivo**: Planner / Runtime / Memory — evoluir o `ask`/`respond` para orquestrar Planejamento/Execução/Observação/Aprendizado (hoje colapsados). Inclui modelar o **contexto de ambiente** (cwd/repo/branch/arquivos) que o Cognitive/Planner poderão ler no futuro (ADR-0009 deixou essa leitura fora do escopo da SPEC-0007).
- **Auto-gerência do Ollama** (subir/parar o processo) e **health-check de startup** (`ModelGateway.health()`) — mapeados como fora de escopo da SPEC-0006.
- **Provedor nativo da Anthropic** no Model Gateway; **config por arquivo** (slot `arquivo` do ADR-0006); **distribuição/empacotamento da CLI**; **Event Bus / Plugin Manager**; **troca de persona em runtime** (ex.: `/persona <nome>` no chat) — extensão explícita deixada fora de escopo pela SPEC-0008.

**Processo obrigatório** (igual às SPECs 0001–0008):

1. Brainstorming (skill `superpowers:brainstorming`): perguntas uma a uma, com recomendação.
2. Escrever a SPEC usando `implementation/templates/SPEC-TEMPLATE.md` (Status `Draft`).
3. Usuário revisa → plano em `implementation/plans/` (skill `superpowers:writing-plans`, TDD, commits por task).
4. Execução inline (skill `superpowers:executing-plans`) → `Review` → lições em `implementation/LESSONS_LEARNED.md` (obrigatório, é DoD) → usuário aprova → `Done`.

**Padrões estabelecidos (SPEC-0003/0004/0005/0006/0007/0008), reutilizáveis:** gateways/adaptadores como interfaces locais + composição por parâmetro (inclusive `fetch` injetado → testes sem rede); `createAtlas(options, { fetch })` encadeia o `fetch` até o gateway; execução de apps/scripts via `tsx` (via `pnpm exec`, não `rtk proxy`); precedência de config `flags > env > arquivo > defaults` (`arquivo` ainda não implementado — ADR-0006), inclusive para campos aninhados (`config.model`, merge campo-a-campo); consumidores importam `@atlas/contracts` direto (o core não re-exporta tipos); contrato só sobe a `@atlas/contracts` com 2º consumidor (via ADR — o do Model Gateway subiu na SPEC-0005, ADR-0007, com re-export no package de origem); erro de módulo mapeado por `AtlasError.code` (ex.: `ATLAS_MODEL_GATEWAY`, `ATLAS_CONTEXT`) sem acoplar o consumidor ao package que o lança — inclusive **dentro** de um loop de chat, para não derrubar a sessão; config aninhada exige tipo de override próprio (`AtlasConfigOverride` com `Partial<...>`) por causa do `exactOptionalPropertyTypes`; slot pago de modelo atendido por provedor `remote` OpenAI-compatible (genérico); **estado temporário como dado** (ADR-0008): o valor flui pelo sistema e o Core segue stateless (função pura), com a borda segurando o valor; **`LineReader` injetável** (fila de linhas com waiters) para testar loops de terminal sem TTY, criado lazy via `deps.createLineReader` só quando o comando precisa (evita segurar `stdin` em `status`/`ask`); **store de valor vs. orquestrador** (ADR-0009): um módulo pode guardar estado sem decidir estratégia — a mediação (ler, chamar o núcleo puro, gravar de volta) fica na app, não no store.

---

# Pendências Conhecidas

- **TypeScript pinado em `^5`**: typescript-eslint 8.63 quebra com TS 7.0.2 (probes falharam em 2026-07-10, 2026-07-11, 2026-07-12, 2026-07-13 (SPEC-0007) **e 2026-07-13 (SPEC-0008, quinto probe)**, sempre o mesmo `TypeError: Cannot read properties of undefined (reading 'Cjs')` em `typescript-estree`). Encaminhamento: parar de repetir a cada SPEC — vincular a um gatilho externo (release do typescript-eslint que declare suporte ao TS7) em vez de re-probar por hábito.
- **Distribuição/empacotamento da CLI** (bin publicável fora do workspace): em aberto. Hoje o `bin` usa shebang `#!/usr/bin/env -S npx tsx`, que atende só o uso em dev. Candidata a SPEC futura de distribuição.
- Roadmap ainda não existe (citado no PROJECT.md).
- Plugin Manager sem seção de detalhe no ModuleCatalog (corrigir antes da SPEC que o implementar).
- Remote/GitHub + CI: decisão em aberto, candidata a SPEC própria (`.github/` está previsto no ProjectStructure).

---

# Avisos Operacionais (deste ambiente)

- `pnpm add` na raiz do workspace exige a flag `-w`.
- **pnpm 11 não lê mais o campo `pnpm` do `package.json`**: aprovar build de dependências (ex.: `esbuild`, motor do `tsx`) vive em `pnpm-workspace.yaml` (`allowBuilds: { esbuild: true }`). Sem isso, `pnpm install` sai com código 1 (`ERR_PNPM_IGNORED_BUILDS`) e trava scripts do pnpm.
- **Node nativo não roda o fonte**: a convenção de imports `.js` (NodeNext) do repo não é remapeada pelo _type stripping_ do Node; por isso apps rodam via `tsx` (ADR-0005). Ao rodar TS diretamente, use `tsx`, não `node`.
- O proxy de output (RTK) mascara saída/erros; para ver o completo, `rtk proxy <cmd>`; log em `~/Library/Application Support/rtk/tee/`.
- O executor de comandos do harness pode ficar indisponível temporariamente; o usuário pode rodar comandos com o prefixo `!` para destravar verificações.
- Prettier ignora `**/*.md` por design (protege a documentação manuscrita); commits terminam com o trailer `Co-Authored-By` do modelo em uso.

---

# Mapa Rápido

- Roteador: `CLAUDE.md` (raiz) — invariantes, comandos, gatilhos de leitura.
- SPECs/planos/lições: `implementation/` · ADRs: `docs/06-adr/` (0001 monorepo, 0002 TS/Node, 0003 composition root, 0004 composição manual, 0005 execução de apps via tsx, 0006 precedência de config, 0007 promoção do contrato do Model Gateway, 0008 conversa como dado, 0009 Context Service como store de valor, 0010 Persona injetada na geração).
- CLI: `apps/cli` (`@atlas/cli`) — `main.ts` (casca) → `run()` → gateways locais + comandos `status`, `ask` (`commands/ask.ts`) e `chat` (`commands/chat.ts` + `gateway/line-reader.ts`).
- Cognitive Core: `packages/cognitive` (`@atlas/cognitive`) — `createCognitiveCore({ gateway, personaPrompt? })` → `ask(objetivo)` + `startConversation()`/`respond(conversation, input)`; system prompt composto (`personaPrompt` + `TASK_FRAMING`, ADR-0010, deixou de ser neutro); sem estado (conversa é dado — ADR-0008).
- Model Gateway: `packages/model-gateway` (`@atlas/model-gateway`) — `createModelGateway` (seletor) → provedores `fake`/`ollama`/`remote`; `scripts/smoke.ts` para verificação. Contrato vive em `@atlas/contracts` (ADR-0007).
- Context Service: `packages/context` (`@atlas/context`) — `createContextService()` → `openSession/getConversation/updateConversation/closeSession`; store de sessão em memória, não orquestrador (ADR-0009); detentor da `Conversation` que o `atlas chat` usa via `atlas.context`.
- Persona Service: `packages/persona` (`@atlas/persona`) — `createPersonaService()` → `get/has/list` + `systemPrompt(persona)`; registro embutido `jarvis`/`neutral`; identidade injetada na geração do Cognitive, não decide estratégia (ADR-0010).
- Regras de estrutura e dependência: `docs/03-architecture/ProjectStructure.md` (v2.1, regras 1–11).
- Estado do sprint: `docs/05-context/CURRENT_SPRINT.md`.
