# Log de uso de tokens por SPEC

> **Project Atlas — Log de Custo de Token por SPEC**

Atualizado em: 2026-07-16 (regenerado por `python3 scripts/claude-usage-report.py`)

Este documento existe para responder, antes de começar a implementar uma SPEC, à pergunta: *"cabe numa sessão, ou é melhor esperar a próxima janela?"*. Os totais são derivados automaticamente dos transcripts locais (heurística: sessão é atribuída à SPEC mais citada nela — uma sessão que tocou mais de uma SPEC entra só na dominante). Regenere após encerrar ou retomar trabalho em uma SPEC rodando o script acima; **não edite esta tabela manualmente**.

---

## Por SPEC

| SPEC | Título | Status | Sessões | Última atividade | Tokens totais |
|---|---|---|---:|---|---:|
| SPEC-0002 | Core Bootstrap — contratos públicos e plataforma mínima | Done | 1 | 2026-07-11 | 139.415.926 |
| SPEC-0003 | CLI Foundation — primeira interface executável (`apps/cli`) | Done | 1 | 2026-07-13 | 60.891.692 |
| SPEC-0004 | Model Gateway — acesso padronizado a modelos de IA (`packages/model-gateway`) | Done | 1 | 2026-07-13 | 28.347.247 |
| SPEC-0005 | Cognitive Core mínimo — primeiro orquestrador + comando `atlas ask` (`packages/cognitive`) | Done | 1 | 2026-07-13 | 13.574.092 |
| SPEC-0006 | Chat interativo multi-turno na CLI — `atlas chat` + Cognitive Core consciente de conversa | Done | 1 | 2026-07-13 | 58.133.918 |
| SPEC-0007 | Context Service (detentor do estado temporário de conversa por sessão) | Done | 1 | 2026-07-13 | 92.761.770 |
| SPEC-0008 | Persona Service — identidade "Jarvis" injetada na geração cognitiva | Done | 0 | - | 13.673.359 |
| SPEC-0009 | Memory Service — fatos/preferências persistentes, injetados na geração cognitiva | Done | 1 | 2026-07-14 | 62.819.192 |
| SPEC-0010 | Espinha de execução: Planner produz plano, Runtime executa Tools reais (`clock`/`calc`) | Done | 1 | 2026-07-14 | 77.529.922 |
| SPEC-0011 | Portão de permissão na execução: primeiras Tools com efeito (`read_file`/`list_dir`) atrás do Permission Service | Done | 1 | 2026-07-15 | 57.104.371 |
| SPEC-0012 | Primeira Tool de escrita (`write_file`) sob política de raízes de escrita (`writeRoots`), opt-in explícito, sem fluxo interativo | Done | 3 | 2026-07-17 | 90.332.141 |

## Detalhamento por fase

Fase = qual agente fez o trabalho: **Criação/Decisão** é tudo que roda no fio principal (hoje isso cobre decidir o que vai ser feito, já que ainda não existe um agente dedicado a rascunhar SPEC); **Implementação** e **Verificação** só aparecem quando os subagents `spec-implementer`/`spec-validator` (`.claude/agents/`) são efetivamente usados via Task; **Apoio (outros agentes)** cobre qualquer outro subagent (ex. `Explore`, `code-reviewer`) invocado durante o trabalho na SPEC. SPECs antigas, implementadas antes de esses agentes existirem, aparecem 100% em Criação/Decisão — não é erro, é a fase real que ocorreu.

| SPEC | Criação/Decisão | Implementação | Verificação | Apoio (outros agentes) |
|---|---:|---:|---:|---:|
| SPEC-0002 | 139.415.926 | 0 | 0 | 0 |
| SPEC-0003 | 60.891.692 | 0 | 0 | 0 |
| SPEC-0004 | 28.347.247 | 0 | 0 | 0 |
| SPEC-0005 | 10.275.455 | 0 | 0 | 3.298.637 |
| SPEC-0006 | 58.133.918 | 0 | 0 | 0 |
| SPEC-0007 | 62.269.268 | 0 | 0 | 30.492.502 |
| SPEC-0008 | 0 | 0 | 0 | 13.673.359 |
| SPEC-0009 | 62.819.192 | 0 | 0 | 0 |
| SPEC-0010 | 77.529.922 | 0 | 0 | 0 |
| SPEC-0011 | 32.043.571 | 0 | 0 | 25.060.800 |
| SPEC-0012 | 90.332.141 | 0 | 0 | 0 |

## Como estimar antes de começar uma SPEC nova

- SPECs concluídas (`Done`) até agora: 11. Custo médio: **63.143.966 tokens**. Faixa observada: 13.574.092 – 139.415.926 tokens.

- Compare a SPEC que você está prestes a começar com as mais parecidas em tamanho na tabela acima (número de itens em "Escopo"/"Critérios de Aceitação", quantidade de "Arquivos Esperados"). Uma SPEC do porte de uma linha já concluída tende a custar perto do que ela custou.
- Se o consumo já acumulado na sessão atual (rode o relatório detalhado, `.claude/usage-report.md`) mais a estimativa da próxima SPEC passar perto do seu limite de janela, prefira parar num ponto de commit limpo e retomar na próxima sessão em vez de começar e arriscar cortar a implementação pela metade.
