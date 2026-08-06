# Agent Development Automation

> **Project Atlas — Automação de desenvolvimento por agentes**
>
> Este arquivo mantém o nome histórico `ClaudeCodeAutomation.md` para que
> SPECs e lições anteriores continuem apontando para o mesmo caminho.

Version: 2.0

Status: Documento vivo de tooling; não define arquitetura nem runtime do Atlas.

---

# Objetivo

Este documento explica a operação do processo oficial de SPEC no Claude Code
e no Codex. O processo continua sendo o do [Development Guide](DevelopmentGuide.md):
Ideia → PRD → SPEC → implementação → verificação → documentação → merge.

Os adaptadores reduzem custo de contexto e tornam o fluxo repetível. Eles não
autorizam implementação sem SPEC, não criam decisões arquiteturais e não
substituem as escaladas humanas da Constituição.

---

# Fonte canônica e adaptadores

`.agents/` é a única fonte canônica do workflow:

```text
.agents/
  workflow/
    agents/                 cinco papéis com metadados neutros
    dispatch.md             bloco curto dos documentos-raiz
    model-tiers.toml        mapeamento de modelo por tipo de trabalho
  skills/
    spec-check/
    lessons-learned/
    doc-sync/
    spec-pipeline/

.claude/                    adaptador Claude gerado
  agents/*.md
  skills/*/SKILL.md
  settings.json

.codex/                     adaptador Codex gerado
  agents/*.toml
  config.toml
  hooks.json
```

Não edite um adaptador gerado como fonte. Edite `.agents/`, execute a geração
e revise o diff. `CLAUDE.md`, `AGENTS.md`, `.claude/**` e `.codex/**` também
são saídas verificadas da geração. Os documentos-raiz só despacham para
`spec-pipeline`; não duplicam a máquina de estados.

| Tier neutro | Claude | Codex | Uso |
|---|---|---|---|
| `deep-reasoning` | Opus | `gpt-5.6-sol`, esforço `high` | rascunho e gate adversarial |
| `balanced-execution` | Sonnet | `gpt-5.6-terra`, esforço `high` | implementação, validação e fechamento |

Os papéis são exatamente cinco: `spec-drafter`, `architecture-reviewer`,
`spec-implementer`, `spec-validator` e `spec-closer`. As quatro skills
canônicas são `spec-check`, `lessons-learned`, `doc-sync` e `spec-pipeline`.

---

# Pipeline de SPEC

Use `.agents/skills/spec-pipeline/SKILL.md` para toda solicitação de criar,
continuar, revisar, implementar, validar ou fechar uma SPEC. Ele é o contrato
operacional completo; esta seção é apenas um mapa de leitura.

No **Perfil completo**, o despachante encaminha sem desenhar ou implementar
inline: drafter (`Draft`) → reviewer (autoriza `Draft → Ready`) → implementer
(`Ready → In Progress → Review`) → validator (veredicto pronta permite ao
despachante aplicar `Review → Done`) → closer (lições, docs vivas, commit e
push em cold-start).

No **Perfil micro**, o reviewer confirma a elegibilidade em modo leve e o
validator separado é substituído pelo closer: ele recebe `Review`, executa os
quatro gates completos, confere critérios/DoD/escopo e só então aplica
`Review → Done`, sincroniza documentação e commita. Autor e verificador
continuam separados.

O primeiro veto do reviewer ou a primeira reprovação de validação retorna uma
vez à fase anterior. O segundo veto ou a segunda reprovação escala ao usuário.
Emenda constitucional, módulo novo ou responsabilidade movida, ADR novo,
pedido sem base no PRD e override explícito também escalam imediatamente.

---

# Hooks e confiança

Os hooks são renderizados nas duas árvores de adaptador e usam
`scripts/agent-workflow/hook.py`. Eles verificam SPEC ativa antes de uma
edição de fonte, fazem lint após TypeScript tocado, orientam prompts de SPEC e
atualizam telemetria no encerramento sem bloquear desenvolvimento.

| Evento | Comportamento comum | Diferença semântica |
|---|---|---|
| `PreToolUse` | Localiza a SPEC `Ready`/`In Progress` que cobre cada componente tocado. | Claude responde `ask`; Codex responde `deny` quando não há SPEC ativa. |
| `PostToolUse` | Executa ESLint nos arquivos TypeScript tocados. | Mesmo gate pós-edição. |
| `UserPromptSubmit` | Classifica pedidos de SPEC e aponta para `spec-pipeline`. | Mesmo lembrete. |
| `Stop` | Atualiza telemetria em modo não bloqueante. | Claude usa o reporter Claude; Codex envia o transcript ao hook/reporter Codex. |

A confiança persistida de hooks não é uma interface documentada e
machine-readable. Portanto o doctor sempre a apresenta como checagem manual:
**abra `/hooks` no Codex e revise o hash pendente**. Faça isso em cada cliente
antes do smoke. Não simule essa confirmação no CI ou no doctor.

---

# Telemetria por executor

`scripts/agent-usage-report.py` produz relatórios privados por executor e
atualiza `docs/05-context/TOKEN_USAGE_LOG.md` preservando Claude e Codex em
linhas separadas. Os arquivos privados são gitignored:
`.claude/usage-report.md`, `.codex/usage-report.md` e
`.codex/usage-cache.json`.

Não compare diretamente os dois números. Claude mantém a matemática histórica
de tokens efetivos; Codex reporta tokens brutos de snapshots cumulativos e usa
somente o último snapshot válido de cada sessão. `incomplete` indica
schema/registro insuficiente, não zero tokens. A atribuição de sessão a SPEC é
heurística e serve para capacidade, não contabilidade.

```bash
python3 scripts/agent-usage-report.py --executor all
python3 scripts/agent-usage-report.py --executor codex --transcript <jsonl>
```

---

# Operação e CI

Depois de alterar `.agents/`, rode na raiz:

```bash
pnpm agent-workflow:generate
pnpm agent-workflow:check
pnpm agent-workflow:doctor
```

`generate` reescreve somente saídas geradas. `check` roda testes Python e
acusa deriva byte a byte, sem credenciais de modelo. A CI executa o mesmo
`pnpm agent-workflow:check` após instalar dependências e antes de lint.
`doctor` é estritamente somente leitura: valida conjunto canônico, paridade,
JSON/TOML, referências legadas, fixtures de transcript e clientes no `PATH`;
cliente ausente é aviso, não erro.

Antes de declarar uma SPEC concluída, os quatro gates completos continuam
obrigatórios:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
```

## Smoke local e canary Codex

Depois de confiar os hooks, abra sessões novas de Claude e Codex e peça, sem
editar arquivos nem executar uma SPEC:

```text
Liste os cinco agentes e as quatro skills do pipeline Atlas. Não edite arquivos e não execute uma SPEC.
```

No Codex, confira o mesmo resultado em Desktop, CLI e IDE usando a configuração
compartilhada do projeto. Se cliente, Desktop/IDE ou confiança não estiverem
observáveis neste ambiente, registre o passo como manual; não o marque como
aprovado.

A primeira SPEC real iniciada no Codex após o merge é o canary ponta a ponta.
Sua aceitação exige despacho correto de fases, ownership correto de Status,
fechamento, commit/push e uma linha de telemetria rotulada `Codex`. Não use a
SPEC-0052 como canary desta automação.

---

# Histórico de medição — baseline exclusivo de Claude

Esta seção é um snapshot histórico. Os dados e a matemática abaixo são
**baseline exclusivo de Claude**; não foram reescritos para incluir Codex.

## Baseline congelado — pipeline completo, pré-`spec-closer` (2026-07-20)

Últimas SPECs com o pipeline autônomo (drafter/reviewer/implementer/validator
via Task), em **tokens efetivos**. A fase de **Fechamento** ainda não existia:
o custo de lições + doc-sync estava **dentro de "Criação/Decisão (fio
principal)"** e não é isolável — é exatamente por isso que não dava para medir.

| SPEC | Criação/Decisão (fio principal) | Rascunho | Revisão | Implementação | Verificação |
|---|---:|---:|---:|---:|---:|
| SPEC-0019 | 4.688.414 | 1.333.249 | 0 | 3.374.441 | 545.657 |
| SPEC-0020 | 4.030.323 | 1.479.607 | 816.702 | 2.651.780 | 911.089 |
| SPEC-0021 | 7.013.597 | 0 | 1.445.130 | 1.221.015 | 470.358 |

### `spec-closer` — extrair o fechamento do fio principal (2026-07-20)

- **Baseline:** lições + doc-sync rodavam no fio principal, no ponto de
  contexto mais caro da SPEC. Custo embutido em "Criação/Decisão" (acima:
  4–7M efetivos nas 0019–0021), não separável.
- **Hipótese:** um cold-start dedicado (`spec-closer`) faz esses edits
  multi-arquivo num contexto pequeno, eliminando o reprocessamento de
  `cache_read` de pico. Espera-se: "Criação/Decisão" **cai** numa SPEC de
  porte comparável, e o novo custo aparece isolado em "Fechamento" — menor
  que a queda em "Criação/Decisão" (senão a mudança não pagou).
- **Medição:** _PENDENTE — a primeira SPEC fechada pelo `spec-closer`
  preenche a coluna "Fechamento" no `TOKEN_USAGE_LOG.md`. Registrar aqui:
  SPEC nº, Fechamento (X), Criação/Decisão dela (Y), e a SPEC de porte
  parecido no baseline usada como comparação. Veredicto: pagou / não pagou /
  reverter._

### Instrumentação de fases no log de token (2026-07-20)

- **Mudança:** `spec-drafter`→Rascunho, `architecture-reviewer`→Revisão,
  `spec-closer`→Fechamento no `PHASE_BY_AGENT_TYPE` do script.
- **Impacto já medido:** o custo do `architecture-reviewer`, antes oculto em
  "Apoio (outros agentes)", ficou visível retroativamente — **Revisão:
  816.702 (SPEC-0020), 1.445.130 (SPEC-0021)**. É o dado que faltava para
  decidir, mais adiante e com base real, se o reviewer justifica Opus ou se
  Sonnet basta.

---

# Verificação escopada

Durante a iteração, cada package/app pode rodar os comandos escopados:

- testes: `pnpm --filter <package> test`;
- typecheck: `pnpm --filter <package> typecheck`;
- lint: `pnpm exec eslint <caminho>`;
- formatação: `pnpm exec prettier --check <caminho>`.

A equivalência de testes escopados requer que `vitest.config.ts` da raiz
permaneça somente com `include`; ao adicionar `setupFiles`, ambiente, cobertura
ou pool, revise esta convenção. `tests/smoke.test.ts` da raiz só é alcançado
pela execução completa. Portanto iteração escopada não substitui os quatro
gates completos antes de fechar.
