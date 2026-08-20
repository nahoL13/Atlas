# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-08-20 (SPEC-0055)

Este documento responde a uma pergunta só: **o que fazer agora**. Ele é lido no arranque de toda sessão e de todo subagent, então é mantido curto por design — teto de ~8 KB.

**Não** registre aqui o histórico de SPECs fechadas. Esse é o papel de:

- `docs/05-context/PLATFORM_STATE.md` — estado detalhado da plataforma, APIs e limitações
- `docs/implementation/specs/` — a SPEC de cada fatia, íntegra
- `docs/05-context/NEXT_CONTEXT-ARCHIVE.md` — o histórico narrativo acumulado até a SPEC-0041
- `git log` — o que mudou e quando

---

# Estado Imediato

**Fase 2 (`apps/desktop`) em andamento; Fase 1 fechada por inteiro, mas com candidatos ainda sendo entregues em paralelo** (item 1.4, ver SPEC-0055 abaixo). Itens 2.1, 2.2 (1ª linha), 2.3 e 2.4 fechados; wake word (2.3, "candidato, não comprometido") segue em aberto. *Observabilidade do Ambiente* — exceção consciente sem item prévio de Roadmap — foi entregue por inteiro pela SPEC-0054.

Últimas três fatias (detalhe completo em `PLATFORM_STATE.md` e na SPEC de cada uma):

- **SPEC-0055** `Done` (2026-08-20) — primeira Tool de rede do Atlas, `http_get` (`@atlas/tools`), sob o Network Access Gate: `ResourceType: 'network'` + `ResourceRef` como união discriminada em `@atlas/contracts`, política `netRoots` (allowlist de hostname, fail-closed) no Permission Service. Consome [ADR-0026](../06-adr/ADR-0026-network-access-gate.md) (novo, `Accepted`, aberto por escalação do `spec-drafter`). `--allow-net`/`ATLAS_ALLOW_NET` na CLI; `apps/desktop` sem política de rede nesta fatia (D17). **Não** fecha o item 1.4. Residuais abertos e não fechados (reabririam o ADR): URL como canal de exfiltração (portão julga só o host) e injeção indireta de prompt pelo corpo remoto. Detalhe: `packages/tools/CLAUDE.md`/`packages/permissions/CLAUDE.md`.
- **SPEC-0054** `Done` (2026-08-19) — painel `Sistema` no drawer (sétimo/último item): CPU/memória/GPU/rede do host (`system-metrics.ts`, fail-closed por métrica), tokens da sessão (`token-usage.ts`) e relógio, atualizados a cada 2 s por um único timer só com o painel visível. `TokenUsage` novo em `@atlas/contracts` (`GenerateResult`/`AskResult`/`ConversationTurn.usage?`, aditivo), preenchido pelo `@atlas/model-gateway` e somado por turno no `@atlas/cognitive`. Consome [ADR-0024](../06-adr/ADR-0024-desktop-host-resource-metrics.md)/[ADR-0025](../06-adr/ADR-0025-desktop-token-usage-accounting.md) (novos, `Accepted`). Detalhe: `apps/desktop/CLAUDE.md` ("Observabilidade do ambiente").
- **SPEC-0053** `Done` (2026-08-17) — desktop v3.0: a v2.0 reprovou no smoke humano apesar de gates técnicos verdes; redirecionamento visual completo — núcleo holográfico em **Canvas 2D** (400 pontos determinísticos), navegação por **drawer overlay** (seis painéis, Sessão absorve a timeline), progressive disclosure, paleta roxo-realeza sem emoji. 15/15 `OK` no smoke humano — 1ª confirmação real em ~20 fatias visuais. Zero IPC/contrato/dependência nova. Detalhe: `apps/desktop/CLAUDE.md` ("Layout visual v3.0").

Suíte atual: **1546 testes / 88 arquivos**. `lint`/`typecheck`/`test`/`format:check` verdes.

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
- **Fase 1, itens `candidato`** (todos os gates já fecharam) — memória (retenção/curadoria, relações, `/lembrar`/`/esquecer` ao vivo), execução/permissão (`rmdir`, `confirm` não interativo, Task Manager completo), contexto de ambiente para o Cognitive/Planner, Tools de desenvolvimento além de git somente-leitura, provedor nativo Anthropic, config por arquivo — lista completa em [Roadmap.md](../04-engineering/Roadmap.md) (1.1–1.4). Item 1.4 **Acesso à internet** ganhou a 1ª fatia pela SPEC-0055 (`http_get`/ADR-0026); seguem candidatas execução de comandos, leitura de estrutura de projeto e os residuais do próprio ADR-0026 (redirect por hop, wildcard de subdomínio, IP resolvido, painel de rede na GUI, mitigação de exfiltração via URL) — reabrem o ADR se implementados sem novo desenho.
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
