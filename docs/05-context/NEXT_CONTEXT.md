# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-07-11

Este documento existe para que qualquer sessão nova (humano ou IA, qualquer modelo) retome o trabalho sem depender de contexto de conversa. Atualize-o ao encerrar sessões de trabalho relevantes.

---

# Estado Imediato

- **SPEC-0002 (core-bootstrap): `Done`** (aprovada pelo humano em 2026-07-11). Próximo: iniciar SPEC-0003 (cli-foundation) pelo brainstorming.
- SPEC-0001 (workspace-bootstrap): `Done`.
- Suíte completa verde na última verificação (2026-07-11, antes de aprovar a SPEC-0002): `pnpm install && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` (19 testes, 5 arquivos).
- Working tree limpa; branch única `main`, **sem remote** (GitHub/CI ainda não decididos).

---

# Próximo Trabalho: SPEC-0003 (cli-foundation)

Primeira interface executável (`apps/cli`), consumindo a superfície pronta do core:

```ts
import { createAtlas } from '@atlas/core';
const atlas = await createAtlas({ config: { logLevel: 'debug' } });
atlas.state; // 'ready'
await atlas.shutdown();
```

**Processo obrigatório** (igual às SPECs 0001/0002):

1. Brainstorming (skill `superpowers:brainstorming`): perguntas uma a uma, com recomendação.
2. Escrever a SPEC em `implementation/specs/SPEC-0003-cli-foundation.md` usando `implementation/templates/SPEC-TEMPLATE.md` (Status `Draft`).
3. Usuário revisa → `Ready` → plano em `implementation/plans/PLAN-0003-cli-foundation.md` (skill `superpowers:writing-plans`, TDD, commits por task).
4. Execução inline (skill `superpowers:executing-plans`) → `Review` → lições em `implementation/LESSONS_LEARNED.md` (obrigatório, é DoD) → usuário aprova → `Done`.

**Decisões que o brainstorm da SPEC-0003 precisa cobrir** (prováveis ADRs):

- como executar TypeScript na CLI (tsx, `node --experimental-strip-types`, ou build — relacionado à decisão adiada de `dist/`);
- framework de CLI vs zero-dependência (coerente com Princípio 13 e minimalismo atual);
- comandos mínimos do MVP (ex.: `atlas status`) e formato de saída;
- precedência de fontes de config (arquivo/env/flags) — **adiada da SPEC-0002 deliberadamente para cá**;
- onde entra o Input/Output Gateway do ModuleCatalog (localização: `apps/*`).

---

# Pendências Conhecidas (fora da SPEC-0003)

- **TypeScript pinado em `^5`**: typescript-eslint 8.63 quebra com TS 7.0.2 (probes falharam em 2026-07-10 e 2026-07-11). Encaminhamento: repetir o probe na SPEC-0003 (`pnpm add -Dw typescript@^7 && pnpm lint`; se falhar, `pnpm add -Dw typescript@^5`).
- Roadmap ainda não existe (citado no PROJECT.md).
- Plugin Manager sem seção de detalhe no ModuleCatalog (corrigir antes da SPEC que o implementar).
- Remote/GitHub + CI: decisão em aberto, candidata a SPEC própria (`.github/` está previsto no ProjectStructure).

---

# Avisos Operacionais (deste ambiente)

- `pnpm add` na raiz do workspace exige a flag `-w`.
- O proxy de output (RTK) mascara erros fatais do ESLint; o log completo fica em `~/Library/Application Support/rtk/tee/`.
- O executor de comandos do harness pode ficar indisponível temporariamente; o usuário pode rodar comandos com o prefixo `!` para destravar verificações.
- Prettier ignora `**/*.md` por design (protege a documentação manuscrita); commits terminam com o trailer `Co-Authored-By` do modelo em uso.

---

# Mapa Rápido

- Roteador: `CLAUDE.md` (raiz) — invariantes, comandos, gatilhos de leitura.
- SPECs/planos/lições: `implementation/` · ADRs: `docs/06-adr/` (0001 monorepo, 0002 TS/Node, 0003 composition root, 0004 composição manual).
- Regras de estrutura e dependência: `docs/03-architecture/ProjectStructure.md` (v2.1, regras 1–11).
- Estado do sprint: `docs/05-context/CURRENT_SPRINT.md`.
