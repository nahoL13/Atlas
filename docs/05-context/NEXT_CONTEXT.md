# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-08-21 (SPEC-0058)

Este documento responde a uma pergunta só: **o que fazer agora**. Ele é lido no arranque de toda sessão e de todo subagent, então é mantido curto por design — teto de ~8 KB.

**Não** registre aqui o histórico de SPECs fechadas. Esse é o papel de:

- `docs/05-context/PLATFORM_STATE.md` — estado detalhado da plataforma, APIs e limitações
- `docs/implementation/specs/` — a SPEC de cada fatia, íntegra
- `docs/05-context/NEXT_CONTEXT-ARCHIVE.md` — o histórico narrativo acumulado até a SPEC-0041
- `git log` — o que mudou e quando

---

# Estado Imediato

**Fase 2 (`apps/desktop`) em andamento; Fase 1 fechada por inteiro, mas com candidatos ainda sendo entregues em paralelo** (item 1.4, ver SPEC-0056 abaixo). Itens 2.1, 2.2 (1ª linha), 2.3 e 2.4 fechados; wake word (2.3, "candidato, não comprometido") segue em aberto. *Observabilidade do Ambiente* — exceção consciente sem item prévio de Roadmap — foi entregue por inteiro pela SPEC-0054.

Últimas três fatias (detalhe completo em `PLATFORM_STATE.md` e na SPEC de cada uma):

- **SPEC-0058** `Done` (2026-08-21) — endurecimento da composição de saídas de Tools no prompt do `@atlas/cognitive`: bloco delimitado `<tool_output id="N">`, instrução fixa de conteúdo não confiável (`UNTRUSTED_TOOL_OUTPUT_FRAMING`) e teto de tamanho por passo (`packages/cognitive/src/tool-output.ts`, novo, molde `planner.ts`/`observer.ts`/`learner.ts`, `index.ts` intocado) — mitigação genérica de injeção indireta de prompt, aplicável às 13 Tools existentes e a qualquer Tool futura, sem tocar `@atlas/tools`. Sem ADR novo (D3). Mitiga, **não fecha**, o residual do ADR-0026/SPEC-0055 (continua aberto); o memo de continuidade `summarizeSteps`, persistido entre turnos, recebe só teto+neutralização, sem bloco/instrução (residual 10). Não fecha item do Roadmap; desbloqueia a SPEC-0057 (ver "Próximo Trabalho"). Detalhe: `packages/cognitive/CLAUDE.md`.
- **SPEC-0056** `Done` (2026-08-20) — segunda fatia do item 1.4 (leitura de estrutura de projeto), continuação da SPEC-0028: Tool `project_info` (`@atlas/tools`) descreve a raiz de um projeto (manifests reconhecidos, tabela fixa de 16, e scripts do `package.json`), reusando a descoberta de toplevel da SPEC-0028 via `GitReadPort.toplevel(cwd)` (método aditivo, `GitRootError` classifica a rejeição por `reason`). Ascensão ao repositório git só com `path` omitido; `path` explícito descreve o alvo sem ascender (subpacote de monorepo, uma única barreira). Sem repositório aplicável, degrada para o diretório-alvo com `origem da raiz` visível. Zero diff fora de `@atlas/tools`/`@atlas/core`. **Não** fecha o item 1.4 — resta só execução de comandos (`ADR primeiro`). Detalhe: `packages/tools/CLAUDE.md`.
- **SPEC-0055** `Done` (2026-08-20) — primeira Tool de rede do Atlas, `http_get` (`@atlas/tools`), sob o Network Access Gate: `ResourceType: 'network'` + `ResourceRef` como união discriminada em `@atlas/contracts`, política `netRoots` (allowlist de hostname, fail-closed) no Permission Service. Consome [ADR-0026](../06-adr/ADR-0026-network-access-gate.md) (novo, `Accepted`, aberto por escalação do `spec-drafter`). `--allow-net`/`ATLAS_ALLOW_NET` na CLI; `apps/desktop` sem política de rede nesta fatia (D17). **Não** fecha o item 1.4. Residuais abertos e não fechados (reabririam o ADR): URL como canal de exfiltração (portão julga só o host) e injeção indireta de prompt pelo corpo remoto (mitigada, não fechada, pela SPEC-0058). Detalhe: `packages/tools/CLAUDE.md`/`packages/permissions/CLAUDE.md`.

Suíte atual: **1636 testes / 91 arquivos**. `lint`/`typecheck`/`test`/`format:check` verdes.

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
- **SPEC-0057** (`web_search`, `Ready`, pausada) — desbloqueada pela SPEC-0058 (mitigação de injeção indireta de prompt no `@atlas/cognitive`). Candidata natural da próxima sessão, mas a retomada é decisão do usuário, não pré-decidida aqui.
- **Fase 1, itens `candidato`** (todos os gates já fecharam) — memória (retenção/curadoria, relações, `/lembrar`/`/esquecer` ao vivo), execução/permissão (`rmdir`, `confirm` não interativo, Task Manager completo), contexto de ambiente para o Cognitive/Planner, provedor nativo Anthropic, config por arquivo — lista completa em [Roadmap.md](../04-engineering/Roadmap.md) (1.1–1.4). Item 1.4 **Tools de desenvolvimento de software**: git somente-leitura (SPEC-0028) e estrutura de projeto (SPEC-0056) entregues; resta só **execução de comandos sob o Permission Service** (`ADR primeiro`, novo `access`) — mesma fatia pendente do item 1.4 **Acesso à internet** (SPEC-0055/ADR-0026), que soma ainda os residuais do próprio ADR (redirect por hop, wildcard de subdomínio, IP resolvido, painel de rede na GUI, exfiltração via URL — a injeção indireta de prompt foi **mitigada**, não fechada, pela SPEC-0058).
- **Residuais de Observação/Aprendizado**: observador semântico guiado por modelo; teto de replan configurável; gatilho heurístico para a extração.
- **Auto-gerência do Ollama** (subir/parar processo) e **health-check de startup** (`ModelGateway.health()`).
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
