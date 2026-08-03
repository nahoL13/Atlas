# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-08-03 (SPEC-0048)

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

- **SPEC-0048** `Done` (2026-08-03) — fecha os dois resíduos da SPEC-0047 no renderer: `#chat-send` passa a somar `askInFlight` ao `disabled` (`refreshChatControlsForMic()`), com guarda equivalente no manipulador de `submit` de `#chat-form` (`disabled` não impede submissão implícita/programática) e o `.finally` do turno de chat deixando de recalcular o estado por conta própria; `#chat-input` fica deliberadamente fora (D3). O comentário de `computeDefaultPiperVoiceURI` volta a descrever o estado real (aponta `renderer.speech-parity.test.ts`), corpo byte-idêntico. Duas direções residuais ficam abertas por decisão: chat → ask e ask × ask (ver "Candidatos abertos"). Zero diff em `packages/*`/`apps/cli`/`core-bridge.ts`/`piper-tts.ts`/`stt-engine.ts`/`speech-output.ts`.
- **SPEC-0047** `Done` (2026-08-03) — generaliza o gate de paridade renderer↔módulo (SPEC-0045) para três módulos-fonte vigiados (`speech-output.ts`, `piper-tts.ts`, `stt-engine.ts`, exports enumerados em runtime), amarrando a 10ª réplica antes sem cobertura (`resolveDefaultPiperVoiceURI` ↔ `computeDefaultPiperVoiceURI`); entrega cobertura comportamental dos cinco painéis do desktop (Persona, permissões, memória, `ask`, serialização de gestos) sobre o harness da SPEC-0045. Zero diff em `apps/desktop/src/`/`packages/*`; ADR-0019/0021/0022 intactos.
- **SPEC-0046** `Done` (2026-08-01) — entrada de voz (STT) por push-to-talk, fechando o item 2.3 do Roadmap: `apps/desktop/src/stt-engine.ts`/`media-permission.ts` (novos), consumindo o [ADR-0022](../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) (novo, Accepted — `whisper.cpp`/`whisper-cli` v1.7.6, PT-BR fixo). Push-to-talk sem processo residente; permissão de microfone fail-closed com watchdog; transcrição só anexa ao campo de entrada, nunca envia automaticamente. Zero diff em `packages/*`/`apps/cli`/`core-bridge.ts`/`speech-output.ts`/`piper-tts.ts`. Wake word fora de escopo. **Nenhum microfone/binário real exercitado no shell de automação.**

Suíte atual: **972 testes / 74 arquivos**. `lint`/`typecheck`/`test`/`format:check` verdes.

---

# Próximo Trabalho

**A próxima SPEC ainda não foi escolhida.** Decidir no brainstorming, guiado pelo [Roadmap](../04-engineering/Roadmap.md).

## Candidatos abertos

- **Wake word / ativação por voz.** Único candidato direto restante da Fase 2 (item 2.3, "candidato, não comprometido" desde o Roadmap). **Exige decisão humana + ADR novo antes de qualquer SPEC** (registrado em [ADR-0022](../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md), "Candidatos futuros"): microfone permanentemente ligado, motor de detecção distinto do de transcrição, decisão de privacidade de natureza própria. **Começar por brainstorming humano, não pelo `spec-drafter`.**
- **Sobre a SPEC-0048** (duas direções residuais deliberadamente fora, ver DoD-d): **(d.1) chat → ask** — serializar `#ask-form` contra um turno de chat em voo (direção inversa; exige decidir se o painel `ask` deve mesmo se bloquear pelo chat, questão de UX própria); **(d.2) ask × ask** — `#ask-form`/`#objective`/`#ask-submit` não têm guarda contra `askInFlight`/`chatTurnInFlight` nem entram em função de refresh alguma, dois cliques seguidos em "Perguntar" sobem dois Cores concorrentes (achado do gate arquitetural, A3). Achados colaterais do mesmo gate, não corrigidos: `.catch` faltando no manipulador de `submit` de `#ask-form` (`renderer.js:146-166`, hoje só `.finally` — falha de `atlas.ask` vira unhandled rejection e nunca chega ao `#ask-result`); rastrear `sendChatTurn` em `inFlightOperations` no `core-bridge` (a serialização da SPEC-0048 é garantia do renderer, não estrutural no main process — mudaria a garantia documentada e afetaria recusas de `selectPermissionRoots`).
- **Sobre a SPEC-0046** (locais à porta injetada): ditado ao vivo (transcrição incremental) e processo de longa duração para STT; catálogo multi-modelo (`base`/`small`/`medium`).
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
- **Smoke visual/sonoro das fatias desktop pendente de confirmação humana** — 13 fatias visuais seguidas (SPEC-0031 a 0046). O shell de automação não tem WindowServer; a SPEC-0040 acrescentou a ausência do binário Piper; a SPEC-0046 acrescenta a ausência de microfone e do binário `whisper-cli`. Não bloqueia fechamento documental, mas **nenhuma fatia visual/sonora foi confirmada de fato em ambiente real**. Lista item a item no CA 25 da SPEC-0040, ampliada pelas SPECs 0041/0043/0046. A SPEC-0045 cobriu `renderer.js` por DOM de teste (jsdom) — prova lógica e fiação, **não** pixel nem som; não fecha esta pendência (APIs de voz seguem dubladas). Pendente também: captura real de microfone, transcrição real em PT-BR, latência do modelo `small`, o diálogo nativo de permissão do macOS (e o tempo de leitura que motivou o rearme do watchdog), a negativa do usuário nesse diálogo, e eco com alto-falante aberto.
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

- **SPECs, planos e lições**: `docs/implementation/` · **ADRs**: `docs/06-adr/` (0001–0022)
- **Regras de estrutura e dependência**: `docs/03-architecture/ProjectStructure.md` (v2.1, regras 1–11)
- **Estado do sprint**: `docs/05-context/CURRENT_SPRINT.md`
- **Custo em tokens por SPEC**: `docs/05-context/TOKEN_USAGE_LOG.md` (regenerar com `python3 scripts/claude-usage-report.py`)
