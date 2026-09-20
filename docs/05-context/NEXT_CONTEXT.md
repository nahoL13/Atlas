# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-09-20 (SPEC-0063)

Este documento responde a uma pergunta só: **o que fazer agora**. Ele é lido no arranque de toda sessão e de todo subagent, então é mantido curto por design — teto de ~8 KB.

**Não** registre aqui o histórico de SPECs fechadas. Esse é o papel de:

- `docs/05-context/PLATFORM_STATE.md` — estado detalhado da plataforma, APIs e limitações
- `docs/implementation/specs/` — a SPEC de cada fatia, íntegra
- `docs/05-context/NEXT_CONTEXT-ARCHIVE.md` — o histórico narrativo acumulado até a SPEC-0041
- `git log` — o que mudou e quando

---

# Estado Imediato

**Fase 2 (`apps/desktop`) em andamento; Fase 1 fechada por inteiro, mas com candidatos ainda sendo entregues em paralelo** (item 1.4, resta só execução de comandos sob o Permission Service, `ADR primeiro`). Itens 2.1, 2.2 (1ª linha), 2.3 e 2.4 fechados; wake word (2.3, "candidato, não comprometido") segue em aberto. *Observabilidade do Ambiente* — exceção consciente sem item de Roadmap — foi entregue por inteiro pela SPEC-0054. O [ADR-0027](../06-adr/ADR-0027-external-process-lifecycle-management.md) (auto-gerência de processo externo) segue **inteiramente consumido** (SPECs 0059/0060/0061); o [ADR-0028](../06-adr/ADR-0028-desktop-dependency-autostart-default.md) (supersessão parcial do ADR-0027(g), só `apps/desktop`/só Ollama) foi implementado por inteiro pela SPEC-0062. O [ADR-0029](../06-adr/ADR-0029-desktop-model-provisioning-assistant.md) (instalação assistida de modelo Ollama, segunda metade do mesmo pedido de usuário) foi implementado por inteiro pela SPEC-0063.

Últimas três fatias (detalhe completo em `PLATFORM_STATE.md` e na SPEC de cada uma):

- **SPEC-0063** `Done` (2026-09-20) — implementa o ADR-0029: detecção de "nenhum modelo de IA instalado" na abertura do desktop e instalação assistida por um catálogo curado e fixo de cinco modelos (`apps/desktop/src/model-catalog.ts`, `llama3.2` recomendado). `ProcessPort.isOllamaRunning` substituída por `inspectOllama` (mesma requisição, corpo lido); `DependencyManager` ganha `pullOllamaModel`/`cancelOllamaModelPull` (`POST /api/pull`, stream NDJSON, nenhum texto do provedor cruza a porta). Progresso por polling no mesmo tick do painel `Sistema`; probe de três estados (`pending`/`unknown`/`known`) corrige uma corrida de arranque real pega pelo `architecture-reviewer` (sem ela o gatilho proativo nunca abria a tela no cenário-alvo). Manifesto de IDs 103→109. Não fecha o item 1.4. Residual: modelo instalado pode divergir do configurado em `AtlasConfig.model.model`. Detalhe: `packages/core/CLAUDE.md`, `apps/desktop/CLAUDE.md`.
- **SPEC-0062** `Done` (2026-09-19) — implementa o ADR-0028: no desktop, o auto-start do Ollama vira **repouso** (`DESKTOP_AUTO_START_OLLAMA_DEFAULT = true`; `ATLAS_AUTO_START_OLLAMA=false` desliga explicitamente; `@atlas/core`/`apps/cli` seguem `false`). Container de busca segue fail-closed (ADR-0027(g) intacta), com uma 2ª porta de entrada: campo no painel de rede/busca aciona `DependencyManager.ensureSearchContainer` (método aditivo, posse vira `Set<string>`, `release()` drena trabalho em voo antes de desligar). Painel `Sistema` audita a tentativa (`#system-dependencies`). Manifesto de IDs 99→103. Não fecha o item 1.4. Origem incomum: pedido original ("sempre automático, sem flag") contradizia o ADR-0027(g), motivando o ADR-0028 antes da SPEC. Detalhe: `packages/core/CLAUDE.md`, `apps/desktop/CLAUDE.md`.
- **SPEC-0061** `Done` (2026-09-13) — 3ª e última SPEC do ADR-0027: auto-start do container Docker do provedor de busca. Extensão aditiva de `ProcessPort`/`createDependencyManager` (`@atlas/core`): `inspectSearchContainer`/`startSearchContainer`/`stopSearchContainer`; `AtlasConfig.dependencies.autoStartSearchContainer: string` (nominal, `''` = desligado); CLI/env no desktop (GUI só depois, SPEC-0062). `DependencyReport.outcomes` sempre dois elementos. Ligar o container **não** concede `netRoots`. Detalhe: `packages/core/CLAUDE.md`.

Suíte atual: **2158 testes / 105 arquivos**. `lint`/`typecheck`/`test`/`format:check` verdes.

---

# Próximo Trabalho

**A próxima SPEC ainda não foi escolhida.** Decidir no brainstorming, guiado pelo [Roadmap](../04-engineering/Roadmap.md).

## Candidatos abertos

- **Execução de comandos sob o Permission Service** (`ADR primeiro`, novo `access`) — único item restante da Fase 1/1.4; todas as demais fatias do item (git, estrutura de projeto, internet, as três SPECs do ADR-0027) estão `Done`. **Exige ADR novo, brainstorming primeiro.**
- **Watchdog de teto de tempo para os `spawn` de Docker/Ollama e para o stream de `pullOllamaModel`** (`@atlas/core`) — achado não-bloqueante do `architecture-reviewer` desde a SPEC-0061, estendido pela SPEC-0063 (download de modelo é a mesma classe de operação de processo sem orçamento), fora do escopo de ambas as fatias.
- **Seleção de modelo em runtime** (`apps/desktop`) — residual da SPEC-0063: instalar um modelo diferente do default (`AtlasConfig.model.model`) não atualiza a config, então a conversa pode continuar falhando por modelo ausente. **Exige ADR** (configuração em runtime).
- **Canal de push (`webContents.send`)** avisando o renderer quando o trabalho abandonado assenta — sem ele, painéis reabilitam cedo demais (SPEC-0051) e a quarentena desliga o modo hands-free a cada tentativa (SPEC-0052).
- **Barge-in** — interromper a fala do assistente falando por cima; nomeado pelo ADR-0023, exige microfone aberto durante o TTS + cancelamento de eco.
- **Fallback de limiar de energia** para o VAD (D8 da SPEC-0052) — só cogitável se o Silero se mostrar insuficiente em uso real.
- **Wake word / ativação por voz.** Único candidato direto restante da Fase 2 (2.3, reserva do ADR-0022/0023). **Exige decisão humana + ADR novo, brainstorming primeiro.**
- **Cancelamento cooperativo real no Runtime/Task Manager** (`AbortSignal`/fila/retry/timeout) — dono já atribuído pelo Module Catalog; a SPEC-0051 entregou só desistência. **Exige ADR + decisão humana.**
- **Diálogos nativos modais com `BrowserWindow` pai** — fecharia o "diálogo fantasma" da SPEC-0051 e a corrida A7 da SPEC-0038.
- Candidatos menores (detalhe em `apps/desktop/CLAUDE.md`, "Candidatos futuros já nomeados"): mensagem de recusa distinguindo operação abandonada de ativa · liberar a quarentena de sessão sem reabrir a app · ajuste da janela de silêncio (3 s) do modo hands-free pelo usuário · pinar `micBusy()` fora de `#ask-submit` por teste · uniformizar `selectPersona` para `hasInFlightOperation()` · ditado ao vivo/processo de longa duração para STT · catálogo multi-modelo STT.
- **Fase 1, itens `candidato`** (todos os gates já fecharam) — memória (retenção/curadoria, relações, `/lembrar`/`/esquecer` ao vivo), execução/permissão (`rmdir`, `confirm` não interativo, Task Manager completo), contexto de ambiente para o Cognitive/Planner, provedor nativo Anthropic, config por arquivo — lista completa em [Roadmap.md](../04-engineering/Roadmap.md) (1.1–1.4). Item 1.4 **Acesso à internet** soma ainda residuais do ADR-0026 (redirect por hop, wildcard de subdomínio, IP resolvido, exfiltração via URL/consulta — injeção indireta **mitigada**, não fechada, pela SPEC-0058).
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

- **SPECs, planos e lições**: `docs/implementation/` · **ADRs**: `docs/06-adr/` (0001–0027)
- **Regras de estrutura e dependência**: `docs/03-architecture/ProjectStructure.md` (v2.1, regras 1–11)
- **Estado do sprint**: `docs/05-context/CURRENT_SPRINT.md`
- **Custo em tokens por SPEC**: `docs/05-context/TOKEN_USAGE_LOG.md` (regenerar com `python3 scripts/claude-usage-report.py`)
