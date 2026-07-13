# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-07-12

Este documento existe para que qualquer sessão nova (humano ou IA, qualquer modelo) retome o trabalho sem depender de contexto de conversa. Atualize-o ao encerrar sessões de trabalho relevantes.

---

# Estado Imediato

- **SPEC-0003 (cli-foundation) está em `Review`**, aguardando o humano aprovar. Ao aprovar: editar o Status para `Done` em `implementation/specs/SPEC-0003-cli-foundation.md`, atualizar `CURRENT_SPRINT.md` e commitar.
- SPEC-0001 e SPEC-0002: `Done`.
- `apps/cli` (`@atlas/cli`) existe: `atlas status` sobe o core pelo terminal, mostra estado + config resolvida (precedência `flags > env > defaults`) e desliga; `--help`/`--version` também. Execução do fonte via `tsx` (ADR-0005), sem `dist/`. Rodar: `tsx apps/cli/src/main.ts status` ou `pnpm -F @atlas/cli run atlas status`.
- Suíte completa verde na última verificação (2026-07-12): `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` (**37 testes, 9 arquivos**).
- Working tree limpa; branch única `main`, **sem remote** (GitHub/CI ainda não decididos).

---

# Próximo Trabalho: SPEC-0004 (a definir)

A fundação do MVP (workspace + core + primeira interface) está entregue. A próxima SPEC ainda **não foi escolhida** — decidir no brainstorming. Candidatas plausíveis (nenhuma comprometida; o projeto não tem roadmap):

- **Model Gateway** (`packages/model-gateway`): padronizar acesso a modelos de IA — habilita a primeira resposta cognitiva de fato (ex.: Claude via API Anthropic), isolando o provedor (Princípio 13).
- **Expandir a CLI** para entrada de linguagem natural / comando de conversa (encaixa nas sementes de Input/Output Gateway já criadas).
- **Event Bus / Plugin Manager**: quando existir o primeiro publisher/extensão real (o Plugin Manager ainda carece de seção no ModuleCatalog — ver Pendências).

**Processo obrigatório** (igual às SPECs 0001/0002/0003):

1. Brainstorming (skill `superpowers:brainstorming`): perguntas uma a uma, com recomendação.
2. Escrever a SPEC usando `implementation/templates/SPEC-TEMPLATE.md` (Status `Draft`).
3. Usuário revisa → plano em `implementation/plans/` (skill `superpowers:writing-plans`, TDD, commits por task).
4. Execução inline (skill `superpowers:executing-plans`) → `Review` → lições em `implementation/LESSONS_LEARNED.md` (obrigatório, é DoD) → usuário aprova → `Done`.

**Padrões estabelecidos na SPEC-0003, reutilizáveis:** gateways como interfaces locais + composição por parâmetro; execução de apps via `tsx`; precedência de config `flags > env > arquivo > defaults` (`arquivo` ainda não implementado — ADR-0006); apps consomem `@atlas/contracts` direto (o core não re-exporta tipos).

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
- SPECs/planos/lições: `implementation/` · ADRs: `docs/06-adr/` (0001 monorepo, 0002 TS/Node, 0003 composition root, 0004 composição manual, 0005 execução de apps via tsx, 0006 precedência de config).
- CLI: `apps/cli` (`@atlas/cli`) — `main.ts` (casca) → `run()` → gateways locais + comando `status`.
- Regras de estrutura e dependência: `docs/03-architecture/ProjectStructure.md` (v2.1, regras 1–11).
- Estado do sprint: `docs/05-context/CURRENT_SPRINT.md`.
