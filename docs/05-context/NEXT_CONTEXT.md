# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-07-13

Este documento existe para que qualquer sessão nova (humano ou IA, qualquer modelo) retome o trabalho sem depender de contexto de conversa. Atualize-o ao encerrar sessões de trabalho relevantes.

---

# Estado Imediato

- **SPEC-0005 (cognitive-core): `Review`** (implementada em 2026-07-13; pendente de aprovação do humano → `Done`). Entregue: `packages/cognitive` (`@atlas/cognitive`) + comando `atlas ask`.
- **SPEC-0004 (model-gateway): `Done`**. SPEC-0001, SPEC-0002 e SPEC-0003: `Done`.
- `apps/cli` (`@atlas/cli`) existe: `atlas status` sobe o core pelo terminal, mostra estado + config resolvida (precedência `flags > env > defaults`) e desliga; `atlas ask "<objetivo>"` envia um objetivo ao núcleo cognitivo e imprime a resposta (default provider `local`/Ollama; flags `--provider/--model/--base-url/--api-key`, envs `ATLAS_MODEL*`); `--help`/`--version` também. Execução do fonte via `tsx` (ADR-0005), sem `dist/`. Rodar: `pnpm --filter @atlas/cli exec tsx src/main.ts ask "diga olá" --provider fake` (o `rtk proxy tsx` não acha o binário; use `pnpm exec`).
- `packages/cognitive` (`@atlas/cognitive`) existe: `createCognitiveCore({ gateway })` → `ask(objetivo)` monta `[{system neutro}, {user}]`, chama `gateway.generate` uma vez e devolve o texto. Ciclo cognitivo colapsado (Compreensão+Raciocínio+Resposta); sem estado. Depende só do contrato em `@atlas/contracts`. **Primeiro consumidor do Model Gateway.**
- `packages/model-gateway` (`@atlas/model-gateway`) existe: `createModelGateway(config)` → `generate()` (geração única, sem streaming) com provedor por config — `fake` (testes), `local`/Ollama (grátis), `remote` (pago, OpenAI-compatible). Provedores de rede recebem `fetch` por parâmetro (testados sem rede). Verificação real: `pnpm --filter @atlas/model-gateway exec tsx scripts/smoke.ts --provider fake|local|remote`.
- `@atlas/core` agora compõe `createModelGateway(config.model, { fetch })` + `createCognitiveCore({ gateway })` e expõe `atlas.cognitive`; `createAtlas(options, { fetch })` injeta `fetch` (testes sem rede). `config.model` validado no `loadConfig`.
- Suíte completa verde na última verificação (2026-07-13): `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` (**68 testes, 15 arquivos**).
- Working tree limpa; branch única `main`, **sem remote** (GitHub/CI ainda não decididos).

---

# Próximo Trabalho: SPEC-0006 (a definir)

A fundação do MVP (workspace + core + CLI + acesso a modelos) e a **primeira resposta cognitiva ponta a ponta** (SPEC-0005) estão entregues. A próxima SPEC ainda **não foi escolhida** — decidir no brainstorming. Candidatas plausíveis (nenhuma comprometida; o projeto não tem roadmap):

- **Próximas etapas do ciclo cognitivo**: Planner / Runtime / Memory / Context — evoluir o `ask` para orquestrar Planejamento/Execução/Observação/Aprendizado (hoje colapsados). O contrato `CognitiveCore` pode ganhar operações/retornos mais ricos sem quebrar o atual.
- **Persona Service** (tom/identidade "Jarvis"): o system prompt do Cognitive Core é neutro por design; personalidade é responsabilidade deste serviço, inexistente.
- **Provedor nativo da Anthropic** no Model Gateway (API Messages própria, distinta do `remote` OpenAI-compatible) — mais uma implementação do mesmo contrato.
- **Config por arquivo** (slot `arquivo` do ADR-0006, ainda não implementado) ou **distribuição/empacotamento da CLI** (bin publicável).
- **Event Bus / Plugin Manager**: quando existir o primeiro publisher/extensão real (o Plugin Manager ainda carece de seção no ModuleCatalog — ver Pendências).

**Processo obrigatório** (igual às SPECs 0001–0004):

1. Brainstorming (skill `superpowers:brainstorming`): perguntas uma a uma, com recomendação.
2. Escrever a SPEC usando `implementation/templates/SPEC-TEMPLATE.md` (Status `Draft`).
3. Usuário revisa → plano em `implementation/plans/` (skill `superpowers:writing-plans`, TDD, commits por task).
4. Execução inline (skill `superpowers:executing-plans`) → `Review` → lições em `implementation/LESSONS_LEARNED.md` (obrigatório, é DoD) → usuário aprova → `Done`.

**Padrões estabelecidos (SPEC-0003/0004/0005), reutilizáveis:** gateways/adaptadores como interfaces locais + composição por parâmetro (inclusive `fetch` injetado → testes sem rede); `createAtlas(options, { fetch })` encadeia o `fetch` até o gateway; execução de apps/scripts via `tsx` (via `pnpm exec`, não `rtk proxy`); precedência de config `flags > env > arquivo > defaults` (`arquivo` ainda não implementado — ADR-0006), inclusive para campos aninhados (`config.model`, merge campo-a-campo); consumidores importam `@atlas/contracts` direto (o core não re-exporta tipos); contrato só sobe a `@atlas/contracts` com 2º consumidor (via ADR — o do Model Gateway subiu na SPEC-0005, ADR-0007, com re-export no package de origem); erro de módulo mapeado por `AtlasError.code` (ex.: `ATLAS_MODEL_GATEWAY`) sem acoplar o consumidor ao package que o lança; config aninhada exige tipo de override próprio (`AtlasConfigOverride` com `Partial<...>`) por causa do `exactOptionalPropertyTypes`; slot pago de modelo atendido por provedor `remote` OpenAI-compatible (genérico).

---

# Pendências Conhecidas

- **TypeScript pinado em `^5`**: typescript-eslint 8.63 quebra com TS 7.0.2 (probes falharam em 2026-07-10, 2026-07-11 e 2026-07-12). Encaminhamento: repetir o probe numa SPEC futura (`pnpm add -Dw typescript@^7 && pnpm lint`; se falhar, `pnpm add -Dw typescript@^5`).
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
- SPECs/planos/lições: `implementation/` · ADRs: `docs/06-adr/` (0001 monorepo, 0002 TS/Node, 0003 composition root, 0004 composição manual, 0005 execução de apps via tsx, 0006 precedência de config, 0007 promoção do contrato do Model Gateway).
- CLI: `apps/cli` (`@atlas/cli`) — `main.ts` (casca) → `run()` → gateways locais + comandos `status` e `ask` (`commands/ask.ts`).
- Cognitive Core: `packages/cognitive` (`@atlas/cognitive`) — `createCognitiveCore({ gateway })` → `ask(objetivo)`; system prompt neutro; sem estado.
- Model Gateway: `packages/model-gateway` (`@atlas/model-gateway`) — `createModelGateway` (seletor) → provedores `fake`/`ollama`/`remote`; `scripts/smoke.ts` para verificação. Contrato vive em `@atlas/contracts` (ADR-0007).
- Regras de estrutura e dependência: `docs/03-architecture/ProjectStructure.md` (v2.1, regras 1–11).
- Estado do sprint: `docs/05-context/CURRENT_SPRINT.md`.
