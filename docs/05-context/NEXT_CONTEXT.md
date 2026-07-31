# NEXT_CONTEXT

> **Project Atlas — Contexto de Retomada para a Próxima Sessão**

Atualizado em: 2026-07-31 (SPEC-0043)

Este documento responde a uma pergunta só: **o que fazer agora**. Ele é lido no arranque de toda sessão e de todo subagent, então é mantido curto por design — teto de ~8 KB.

**Não** registre aqui o histórico de SPECs fechadas. Esse é o papel de:

- `docs/05-context/PLATFORM_STATE.md` — estado detalhado da plataforma, APIs e limitações
- `docs/implementation/specs/` — a SPEC de cada fatia, íntegra
- `docs/05-context/NEXT_CONTEXT-ARCHIVE.md` — o histórico narrativo acumulado até a SPEC-0041
- `git log` — o que mudou e quando

---

# Estado Imediato

**Fase 2 (`apps/desktop`) em andamento.** Fase 1 fechada por inteiro (todos os gates). Itens 2.1, 2.2 (1ª linha) e 2.4 fechados; item 2.3 (voz) parcialmente entregue.

Últimas três fatias (detalhe completo em `PLATFORM_STATE.md` e na SPEC de cada uma):

- **SPEC-0043** `Done` (2026-07-31) — fecha os dois resíduos de voz da SPEC-0041: `voiceURI` persistida não-ofertável por razão ambiental vira `<option>` retida e visível em vez de apagada em silêncio (`resolvePersistedVoiceSelection`, 4 desfechos); `createSpeechOutputGlue` do renderer passa a receber `preferredVoiceURI`, restaurando ADR-0020(b) no caminho `'os'`. Política Piper-only intacta. Diff confinado a `apps/desktop` + nota no ADR-0020.
- **SPEC-0042** `Done` (2026-07-30) — `apps/desktop/tests/core-bridge.test.ts` (1.432 linhas) quebrado em 7 arquivos por assunto + helper; `"test": "vitest run"` em 13 `package.json`, viabilizando `pnpm --filter <package> test`/`typecheck` (subseção "Verificação escopada" em [ClaudeCodeAutomation.md](../04-engineering/ClaudeCodeAutomation.md)). Corrigiu, por exceção nomeada, um flake pré-existente de vazamento de sessão só exposto sob `--sequence.shuffle`; `__resetBridgeStateForTests()` não fecha sessões vivas (candidato futuro, D15). Zero diff em `src/`; CI inalterada.
- **SPEC-0041** `Done` (2026-07-30) — superfície de voz Piper-only: com `PiperTts.isAvailable()` verdadeiro, o `<select>` de Persona lista só vozes Piper e uma `voiceURI` de SO persistida deixa de ser honrada. Web Speech API **não** removida — segue como fallback interno invisível (ADR-0021(c) intacto). Diff confinado a `apps/desktop`.

Suíte atual: **757 testes / 62 arquivos**. `lint`/`typecheck`/`test`/`format:check` verdes.

---

# Próximo Trabalho

**A próxima SPEC ainda não foi escolhida.** Decidir no brainstorming, guiado pelo [Roadmap](../04-engineering/Roadmap.md).

## Candidatos abertos

- **Fase 2, item 2.3-restante — entrada por voz (STT) e wake word.** Único candidato direto restante da Fase 2. **Exige decisão humana + ADR novo antes de qualquer SPEC** (Escalação E1 da SPEC-0035): escolha de motor de reconhecimento, permissão de microfone, possivelmente um módulo Voice Service. **Começar por brainstorming humano, não pelo `spec-drafter`.**
- **CLI de Persona** (`atlas persona create/edit/delete/list/use`) — equivalente na CLI do CRUD entregue pela SPEC-0039, explicitamente fora do escopo dela. 2º consumidor do re-export de catálogo (ver D4 da SPEC-0037).
- **Cobrir `renderer.js` por teste automatizado** — risco estrutural registrado pelo `architecture-reviewer` no gate da SPEC-0043: 7ª réplica renderer↔módulo do projeto, e a 2ª vez que essa duplicação derivou por acidente (o resíduo (2) da SPEC-0043 ficou sem efeito por 6 fatias sem que nenhum gate mecânico detectasse). Exige decisão de stack (ADR-0019) → ADR novo → escalação humana antes de qualquer SPEC.
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
- **Smoke visual das fatias desktop pendente de confirmação humana** — 12 fatias seguidas (SPEC-0031 a 0043). O shell de automação não tem WindowServer; a SPEC-0040 acrescentou a ausência do binário Piper. Não bloqueia fechamento documental, mas **nenhuma fatia visual foi confirmada de fato em ambiente gráfico real**. Lista item a item no Critério de Aceitação 25 da SPEC-0040, ampliada pelas SPECs 0041/0043.
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

- **SPECs, planos e lições**: `docs/implementation/` · **ADRs**: `docs/06-adr/` (0001–0021)
- **Regras de estrutura e dependência**: `docs/03-architecture/ProjectStructure.md` (v2.1, regras 1–11)
- **Estado do sprint**: `docs/05-context/CURRENT_SPRINT.md`
- **Custo em tokens por SPEC**: `docs/05-context/TOKEN_USAGE_LOG.md` (regenerar com `python3 scripts/claude-usage-report.py`)
