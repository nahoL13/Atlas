# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-10-10 (SPEC-0065)

Este arquivo responde apenas ao que fazer agora. Estado detalhado vive em `PLATFORM_STATE.md`; histórico nas SPECs, no log e nos arquivos `*-ARCHIVE.md`.

## Estado imediato

Fase 1 está fechada; na Fase 2, os itens 2.1–2.4 estão entregues. A SPEC-0065 `Done` tornou os quatro diálogos nativos de consentimento modais apenas com janela elegível e hands-free desligado; no hands-free, o fallback sem pai preserva o freio. O handshake renderer→main bloqueia os quatro gestos até ACK e compensa uma ativação obsoleta. Não fecha item de Roadmap.

- **SPEC-0064** `Done` (2026-09-21) — watchdog por operação de `ProcessPort`; teto por chamada, não de parede para `ensure()`.
- **SPEC-0063** `Done` (2026-09-20) — catálogo curado e instalação assistida de modelo Ollama; modelo instalado ainda pode divergir da configuração.
- **SPEC-0062** `Done` (2026-09-19) — auto-start de Ollama por padrão no desktop e início explícito de container de busca.

Suíte validada no fechamento da SPEC-0065: 2.193 testes / 106 arquivos; `lint`, `typecheck` e `format:check` verdes. Smoke visual Electron da SPEC-0065 é pendência humana, não aprovação automática.

## Próximo trabalho

A próxima SPEC ainda não foi escolhida. Fazer brainstorming e seguir o Roadmap.

- Execução de comandos sob Permission Service (único item restante da Fase 1/1.4; ADR primeiro).
- Teto de parede de `ensure()`; seleção de modelo em runtime; canal de push para trabalho abandonado.
- Barge-in, fallback de energia VAD e wake word (decisão humana + ADR).
- Cancelamento cooperativo no Runtime/Task Manager (ADR).

## Pendências conhecidas

- Smoke real de áudio/hands-free e de modalidade dos diálogos Electron: requer hardware/WindowServer; não declarar aprovado sem execução humana.
- TypeScript segue em `^5` até suporte declarado pelo typescript-eslint ao TS 7.
- Distribuição da CLI, Plugin Manager sem detalhe no Module Catalog e vizinhas da SPEC-0016 (ruleset, matriz Node multi-OS, `packageManager`) continuam abertas.

## Avisos operacionais

- `pnpm add` na raiz exige `-w`; builds permitidos ficam em `pnpm-workspace.yaml`.
- Rode fonte TypeScript por `tsx`, nunca `node` direto.
- Prettier ignora Markdown por design. Fechamentos usam os quatro gates na raiz e commit com trailer `Co-Authored-By`.

## Atalhos

- Processo: `CLAUDE.md` e `docs/04-engineering/ClaudeCodeAutomation.md`.
- Estado/API: `PLATFORM_STATE.md`; módulos: `ModuleCatalog.md`; SPECs/lições: `docs/implementation/`.
- ADRs: `docs/06-adr/`; sprint: `CURRENT_SPRINT.md`; custos: `TOKEN_USAGE_LOG.md`.
