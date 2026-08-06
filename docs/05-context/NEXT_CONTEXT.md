# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-08-06 (SPEC-0052)

Este documento responde a uma pergunta só: **o que fazer agora**. Ele é lido no arranque de toda sessão e de todo subagent, então é mantido curto por design — teto de ~8 KB.

**Não** registre aqui o histórico de SPECs fechadas. Esse é o papel de:

- `docs/05-context/PLATFORM_STATE.md` — estado detalhado da plataforma, APIs e limitações
- `docs/implementation/specs/` — a SPEC de cada fatia, íntegra
- `docs/05-context/NEXT_CONTEXT-ARCHIVE.md` — o histórico narrativo acumulado até a SPEC-0041
- `git log` — o que mudou e quando

---

# Estado Imediato

**Fase 2 (`apps/desktop`) em andamento.** Fase 1 fechada por inteiro (todos os gates). Itens 2.1, 2.2 (1ª linha), 2.3 e 2.4 fechados; wake word (dentro do 2.3, mas explicitamente "candidato, não comprometido") segue em aberto.

Últimas três fatias (detalhe completo em `PLATFORM_STATE.md` e na SPEC de cada uma):

- **SPEC-0052** `Done` (2026-08-06) — modo hands-free (conversa por voz contínua): toggle único abre o microfone entre turnos; fim de fala por Silero VAD (WASM no renderer, **primeira inferência do projeto fora do main**); transcrição vai **direto ao Core, sem revisão**; resposta falada; microfone comprovadamente fechado ao processar/falar. Consome o [ADR-0023](../06-adr/ADR-0023-hands-free-voice-conversation.md) (novo, `Accepted`, supersede parcial do ADR-0022 — só auto-envio, só no modo; `ConfirmPort` intocado). Sem barge-in. Detalhe: `apps/desktop/CLAUDE.md` ("Voz — modo hands-free"). Zero diff em `packages/*`/`apps/cli`.
- **SPEC-0051** `Done` (2026-08-05) — gesto de escape: botão "Cancelar" por painel → `cancelInFlightOperation()` abandona a operação em voo e rejeita a promessa na hora. `busySessions`/`inFlightOperations` viram um registro `Set<OperationRecord>` com quatro predicados nomeados. `ConfirmPort` do chat contido por sessão (pegajoso), do `ask` por operação; quarentena de sessão. **Desistência, não cancelamento real** — Core sem `AbortSignal`. Zero diff em `packages/*`/`apps/cli`.
- **SPEC-0050** `Done` (2026-08-04) — `resolveAskSnapshot`/`sendChatTurn` no `core-bridge` passam a **ler** `hasInFlightOperation()` como guarda de entrada, tornando "um round-trip por vez" estrutural no main process. Zero diff em `packages/*`/`apps/cli`/renderer.

Suíte atual: **1303 testes / 79 arquivos**. `lint`/`typecheck`/`test`/`format:check` verdes.

---

# Próximo Trabalho

**A próxima SPEC ainda não foi escolhida.** Decidir no brainstorming, guiado pelo [Roadmap](../04-engineering/Roadmap.md).

## Candidatos abertos

- **Canal de push (`webContents.send`) avisando o renderer quando o trabalho abandonado assenta** — hoje todos os canais são `invoke`/`handle`; sem ele, painéis voltam a parecer habilitados cedo demais (SPEC-0051/D12) **e** a quarentena de sessão desliga o modo hands-free a cada tentativa (SPEC-0052) — mais atraente agora que duas fatias o pedem.
- **Barge-in** — interromper a fala do assistente falando por cima; candidato nomeado pelo ADR-0023, exige microfone aberto durante o TTS + cancelamento de eco.
- **Fallback de limiar de energia** para o VAD, atrás da porta `VoiceActivityDetector` (D8 da SPEC-0052) — só cogitável se o Silero se mostrar insuficiente em uso real.
- **Wake word / ativação por voz.** Único candidato direto restante da Fase 2 (item 2.3, reserva reafirmada pelo ADR-0022/0023). **Exige decisão humana + ADR novo. Começar por brainstorming humano, não pelo `spec-drafter`.**
- **Cancelamento cooperativo real no Runtime/Task Manager** (`AbortSignal`/fila/retry/timeout) — dono já atribuído pelo Module Catalog; a SPEC-0051 entregou só desistência. Atravessa `@atlas/contracts` e ≥ 3 módulos ⇒ **exige ADR + decisão humana**.
- **Diálogos nativos modais com `BrowserWindow` pai** — fecharia o "diálogo fantasma" da SPEC-0051 e a corrida A7 da SPEC-0038.
- Candidatos menores (detalhe em `apps/desktop/CLAUDE.md`, "Candidatos futuros já nomeados"): mensagem de recusa distinguindo operação abandonada de ativa · liberar a quarentena de sessão sem reabrir a app · ajuste da janela de silêncio (3 s) do modo hands-free pelo usuário · pinar `micBusy()` fora de `#ask-submit` por teste · uniformizar `selectPersona` para `hasInFlightOperation()` · ditado ao vivo/processo de longa duração para STT · catálogo multi-modelo STT.
- **Fase 1, itens `candidato`** (não são gates, todos os gates fecharam):
  - **Memória** — retenção/curadoria de fatos aprendidos, relações entre informações, teto por bytes (resíduo da SPEC-0030), `/lembrar` e `/esquecer` ao vivo numa sessão de chat.
  - **Execução/permissão** — troca de ancestral em `delete_file`/`mkdir` (resíduo consciente do ADR-0014); `list_dir` sem fecho atômico (`readdir` não expõe `O_NOFOLLOW`); Windows (`O_NOFOLLOW` é POSIX); `rmdir`/remoção recursiva; flag de auto-aprovação não interativa para `confirm`; dependência de dados entre passos; Task Manager completo (fila/retry/timeout/cancelamento).
  - **Contexto de ambiente** (cwd/repo/branch/arquivos) legível pelo Cognitive/Planner — ADR-0009 deixou fora da SPEC-0007.
  - **Tools de desenvolvimento** além das de git somente-leitura (SPEC-0028).
  - **Provedor nativo da Anthropic** no Model Gateway; **config por arquivo** (slot `arquivo` do [ADR-0006](../06-adr/ADR-0006-config-source-precedence.md)).
- **Residuais de Observação/Aprendizado**: observador semântico guiado por modelo; teto de replan configurável; gatilho heurístico para a extração.
- **Auto-gerência do Ollama** (subir/parar processo) e **health-check de startup** (`ModelGateway.health()`).
- **Fase 3**: distribuição/empacotamento da CLI; Event Bus / Plugin Manager.

## Processo

O fluxo obrigatório e o pipeline autônomo de subagents estão no `CLAUDE.md` da raiz e em `docs/04-engineering/ClaudeCodeAutomation.md` — **leia o segundo antes de implementar ou validar qualquer SPEC**. Não duplicar aqui.

Ponto que o hook não cobre: `scripts/hooks/spec-prompt-nudge.sh` só dispara com casamento literal de regex, então prompts indiretos ("continue", "1", respostas a perguntas) **não** disparam o lembrete de delegar. Confirme o processo proativamente.

---

# Pendências Conhecidas

- **TypeScript pinado em `^5`**: typescript-eslint 8.63 quebra com TS 7.0.2 (`TypeError: Cannot read properties of undefined (reading 'Cjs')` em `typescript-estree`; 7 probes falharam entre 2026-07-10 e 2026-07-14). **Encaminhamento: parar de re-probar por hábito** — vincular a um release do typescript-eslint que declare suporte a TS7.
- **Smoke visual/sonoro das fatias desktop pendente de confirmação humana** — 19 fatias visuais seguidas (SPEC-0031 a 0052), sem WindowServer/microfone/binários Piper-whisper-Silero no shell de automação. Não bloqueia fechamento documental, mas **nada foi confirmado em ambiente real**. Lista item a item no CA 25 da SPEC-0040, ampliada pelas SPECs 0041/0043/0046/0052. A SPEC-0052 acrescenta o item mais difícil de dublar: o laço hands-free ponta a ponta (VAD real, latência, eco, acerto dos 3 s de silêncio). Detalhe completo: `apps/desktop/CLAUDE.md`, "Pendência estrutural".
- **Distribuição/empacotamento da CLI**: o `bin` usa shebang `#!/usr/bin/env -S npx tsx`, que atende só dev. Mapeado na Fase 3.
- **Plugin Manager sem seção de detalhe no ModuleCatalog** — corrigir antes da SPEC que o implementar.
- **Vizinhas da SPEC-0016 ainda abertas**: proteção de branch/ruleset, matriz multi-OS de Node, campo `packageManager` no `package.json` raiz.

---

# Avisos Operacionais (deste ambiente)

- `pnpm add` na raiz do workspace exige a flag `-w`.
- **pnpm 11 não lê mais o campo `pnpm` do `package.json`**: aprovar build de dependências (ex.: `esbuild`, motor do `tsx`) vive em `pnpm-workspace.yaml` (`allowBuilds: { esbuild: true }`). Sem isso, `pnpm install` sai com código 1 (`ERR_PNPM_IGNORED_BUILDS`).
- **Node nativo não roda o fonte**: a convenção de imports `.js` (NodeNext) não é remapeada pelo type stripping do Node — apps rodam via `tsx` (ADR-0005). Nunca `node` direto no TS.
- O proxy de output (RTK) mascara saída/erros; para ver o completo, `rtk proxy <cmd>`; log em `~/Library/Application Support/rtk/tee/`.
- O executor de comandos do harness pode ficar indisponível; o usuário pode rodar comandos com o prefixo `!` para destravar verificações.
- Prettier ignora `**/*.md` por design (protege a documentação manuscrita); commits terminam com o trailer `Co-Authored-By` do modelo em uso.
- **`vitest run` não faz typecheck** (esbuild só remove tipos). Um passo de TDD "RED" que depende de erro de *tipo* só falha de verdade em `pnpm --filter <pkg> typecheck`.

---

# Mapa Rápido

O mapa de módulos, invariantes e gatilhos de leitura vive no **`CLAUDE.md` da raiz** — comece por lá. APIs exatas e limitações por módulo: **`PLATFORM_STATE.md`**. Não duplicar nenhum dos dois aqui.

Atalhos que não estão nesses dois:

- **SPECs, planos e lições**: `docs/implementation/` · **ADRs**: `docs/06-adr/` (0001–0023)
- **Regras de estrutura e dependência**: `docs/03-architecture/ProjectStructure.md` (v2.1, regras 1–11)
- **Estado do sprint**: `docs/05-context/CURRENT_SPRINT.md`
- **Custo em tokens por SPEC**: `docs/05-context/TOKEN_USAGE_LOG.md` (regenerar com `python3 scripts/claude-usage-report.py`)
