# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-08-22 (SPEC-0059)

Este documento responde a uma pergunta só: **o que fazer agora**. Ele é lido no arranque de toda sessão e de todo subagent, então é mantido curto por design — teto de ~8 KB.

**Não** registre aqui o histórico de SPECs fechadas. Esse é o papel de:

- `docs/05-context/PLATFORM_STATE.md` — estado detalhado da plataforma, APIs e limitações
- `docs/implementation/specs/` — a SPEC de cada fatia, íntegra
- `docs/05-context/NEXT_CONTEXT-ARCHIVE.md` — o histórico narrativo acumulado até a SPEC-0041
- `git log` — o que mudou e quando

---

# Estado Imediato

**Fase 2 (`apps/desktop`) em andamento; Fase 1 fechada por inteiro, mas com candidatos ainda sendo entregues em paralelo** (item 1.4, ver SPEC-0059 abaixo). Itens 2.1, 2.2 (1ª linha), 2.3 e 2.4 fechados (2.4 estendido sem reabrir pela SPEC-0059); wake word (2.3, "candidato, não comprometido") segue em aberto. *Observabilidade do Ambiente* — exceção consciente sem item prévio de Roadmap — foi entregue por inteiro pela SPEC-0054.

Últimas três fatias (detalhe completo em `PLATFORM_STATE.md` e na SPEC de cada uma):

- **SPEC-0059** `Done` (2026-08-22) — painel de rede/busca do desktop: `apps/desktop` ganha, dentro do painel de Permissões existente (sem 8º item no drawer), a configuração em runtime de `netRoots`/`tools.searchUrl` — `selectNetworkAccess`/`selectedNetworkAccess` (`core-bridge.ts`), quarta porta fail-closed (`network-grant-dialog.ts`, consentimento por host **novo**, nunca por Tool), canal IPC `'atlas:network:select'`, mutex de política compartilhado com `selectPermissionRoots` (nunca dois diálogos empilhados), rascunho preservado em rejeição (assimetria deliberada com o bloco de FS). Consome só o [ADR-0026](../06-adr/ADR-0026-network-access-gate.md), sem reabrir nenhuma cláusula; fecha o residual nomeado das SPECs 0055/0057; diff vazio em `packages/*`/`apps/cli`. **Não** fecha o item 1.4 — resta execução de comandos (`ADR primeiro`). Smoke manual em janela real pendente de confirmação humana (sem WindowServer neste ambiente). Detalhe: `apps/desktop/CLAUDE.md`.
- **SPEC-0057** `Done` (2026-08-22) — terceira fatia do item 1.4 (Acesso à internet): Tool `web_search` (`@atlas/tools`) sobre a porta injetável `SearchPort` (`endpointUrl` publicado pela própria porta, D21), adaptador default `searxngSearchPort` sobre o `HttpPort` da SPEC-0055. Provedor sem credencial (SearXNG), `--search-url`/`ATLAS_SEARCH_URL` (`AtlasConfig.tools.searchUrl`); sem endpoint, a Tool não é registrada. Host julgado pelo mesmo `netRoots` do ADR-0026; diff vazio em `@atlas/permissions`/`@atlas/runtime`/`@atlas/cognitive`/demais módulos. **Não** fecha o item 1.4 — resta execução de comandos (`ADR primeiro`). Residuais: consulta como canal de exfiltração, injeção indireta amplificada (mitigada pela SPEC-0058). Detalhe: `packages/tools/CLAUDE.md`.
- **SPEC-0058** `Done` (2026-08-21) — endurecimento da composição de saídas de Tools no prompt do `@atlas/cognitive`: bloco delimitado `<tool_output id="N">`, instrução fixa de conteúdo não confiável (`UNTRUSTED_TOOL_OUTPUT_FRAMING`) e teto de tamanho por passo (`packages/cognitive/src/tool-output.ts`, novo, molde `planner.ts`/`observer.ts`/`learner.ts`, `index.ts` intocado) — mitigação genérica de injeção indireta de prompt, aplicável às 13 Tools existentes e a qualquer Tool futura, sem tocar `@atlas/tools`. Sem ADR novo (D3). Mitiga, **não fecha**, o residual do ADR-0026/SPEC-0055 (continua aberto); o memo de continuidade `summarizeSteps`, persistido entre turnos, recebe só teto+neutralização, sem bloco/instrução (residual 10). Não fecha item do Roadmap. Detalhe: `packages/cognitive/CLAUDE.md`.

Suíte atual: **1772 testes / 96 arquivos**. `lint`/`typecheck`/`test`/`format:check` verdes.

---

# Próximo Trabalho

**A próxima SPEC ainda não foi escolhida.** Decidir no brainstorming, guiado pelo [Roadmap](../04-engineering/Roadmap.md).

## Candidatos abertos

- **Canal de push (`webContents.send`)** avisando o renderer quando o trabalho abandonado assenta — sem ele, painéis reabilitam cedo demais (SPEC-0051) e a quarentena desliga o modo hands-free a cada tentativa (SPEC-0052).
- **Barge-in** — interromper a fala do assistente falando por cima; nomeado pelo ADR-0023, exige microfone aberto durante o TTS + cancelamento de eco.
- **Fallback de limiar de energia** para o VAD (D8 da SPEC-0052) — só cogitável se o Silero se mostrar insuficiente em uso real.
- **Wake word / ativação por voz.** Único candidato direto restante da Fase 2 (2.3, reserva do ADR-0022/0023). **Exige decisão humana + ADR novo, brainstorming primeiro.**
- **Cancelamento cooperativo real no Runtime/Task Manager** (`AbortSignal`/fila/retry/timeout) — dono já atribuído pelo Module Catalog; a SPEC-0051 entregou só desistência. **Exige ADR + decisão humana.**
- **Diálogos nativos modais com `BrowserWindow` pai** — fecharia o "diálogo fantasma" da SPEC-0051 e a corrida A7 da SPEC-0038.
- Candidatos menores (detalhe em `apps/desktop/CLAUDE.md`, "Candidatos futuros já nomeados"): mensagem de recusa distinguindo operação abandonada de ativa · liberar a quarentena de sessão sem reabrir a app · ajuste da janela de silêncio (3 s) do modo hands-free pelo usuário · pinar `micBusy()` fora de `#ask-submit` por teste · uniformizar `selectPersona` para `hasInFlightOperation()` · ditado ao vivo/processo de longa duração para STT · catálogo multi-modelo STT.
- **Auto-start do Ollama** (CLI + desktop) — 2ª SPEC nomeada pelo [ADR-0027](../06-adr/ADR-0027-external-process-lifecycle-management.md) (novo, Accepted); `createDependencyManager` novo em `@atlas/core`, `ProcessPort` injetável, opt-in explícito por flag/env dedicada; falha degrada, nunca bloqueia o boot.
- **Auto-start do container SearXNG** (CLI + desktop) — 3ª SPEC nomeada pelo ADR-0027; no desktop, só tem efeito prático agora que a SPEC-0059 entregou o painel de rede/busca (host do container ainda precisa ser autorizado em `netRoots` pelo usuário).
- **Fase 1, itens `candidato`** (todos os gates já fecharam) — memória (retenção/curadoria, relações, `/lembrar`/`/esquecer` ao vivo), execução/permissão (`rmdir`, `confirm` não interativo, Task Manager completo), contexto de ambiente para o Cognitive/Planner, provedor nativo Anthropic, config por arquivo — lista completa em [Roadmap.md](../04-engineering/Roadmap.md) (1.1–1.4). Item 1.4 **Tools de desenvolvimento de software**: git somente-leitura (SPEC-0028) e estrutura de projeto (SPEC-0056) entregues; resta só **execução de comandos sob o Permission Service** (`ADR primeiro`, novo `access`) — mesma fatia pendente do item 1.4 **Acesso à internet** (SPEC-0055/0057/0059/ADR-0026, `http_get`+`web_search`+painel na GUI entregues), que soma ainda os residuais do próprio ADR (redirect por hop, wildcard de subdomínio, IP resolvido, exfiltração via URL/consulta — a injeção indireta de prompt foi **mitigada**, não fechada, pela SPEC-0058).
- **Residuais de Observação/Aprendizado**: observador semântico guiado por modelo; teto de replan configurável; gatilho heurístico para a extração.
- **Fase 3**: distribuição/empacotamento da CLI; Event Bus / Plugin Manager.

## Processo

O fluxo obrigatório e o pipeline autônomo de subagents estão no `CLAUDE.md` da raiz e em `docs/04-engineering/ClaudeCodeAutomation.md` — **leia o segundo antes de implementar ou validar qualquer SPEC**. Não duplicar aqui.

Ponto que o hook não cobre: `scripts/hooks/spec-prompt-nudge.sh` só dispara com casamento literal de regex, então prompts indiretos ("continue", "1", respostas a perguntas) **não** disparam o lembrete de delegar. Confirme o processo proativamente.

---

# Pendências Conhecidas

- **TypeScript pinado em `^5`**: typescript-eslint 8.63 quebra com TS 7.0.2 (7 probes falharam entre 2026-07-10 e 2026-07-14). **Encaminhamento: parar de re-probar por hábito** — vincular a um release do typescript-eslint que declare suporte a TS7.
- **Smoke de voz/áudio real das fatias desktop pendente de confirmação humana** — a SPEC-0053 fechou **layout/renderização** (15/15 `OK`). Segue pendente só o eixo de **áudio real** (sem WindowServer/microfone/binários Piper/`whisper-cli`/Silero no shell de automação). Detalhe: `apps/desktop/CLAUDE.md`, "Pendência estrutural".
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

- **SPECs, planos e lições**: `docs/implementation/` · **ADRs**: `docs/06-adr/` (0001–0026)
- **Regras de estrutura e dependência**: `docs/03-architecture/ProjectStructure.md` (v2.1, regras 1–11)
- **Estado do sprint**: `docs/05-context/CURRENT_SPRINT.md`
- **Custo em tokens por SPEC**: `docs/05-context/TOKEN_USAGE_LOG.md` (regenerar com `python3 scripts/claude-usage-report.py`)
