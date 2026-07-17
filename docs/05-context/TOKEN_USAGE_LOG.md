# Log de uso de tokens por SPEC

> **Project Atlas — Log de Custo de Token por SPEC**

Atualizado em: 2026-07-17 (regenerado por `python3 scripts/claude-usage-report.py`)

Este documento existe para responder, antes de começar a implementar uma SPEC, à pergunta: *"cabe numa sessão, ou é melhor esperar a próxima janela?"*. Os totais são derivados automaticamente dos transcripts locais (heurística: sessão é atribuída à SPEC mais citada nela — uma sessão que tocou mais de uma SPEC entra só na dominante). Regenere após encerrar ou retomar trabalho em uma SPEC rodando o script acima; **não edite esta tabela manualmente**.

**Tokens brutos** somam input + output + cache com o mesmo peso; **tokens efetivos** ponderam cada tipo pelo preço relativo ao token de input (cache read ~10%, cache write ~125%, output ~500%) — é o número que reflete custo/limite real e o usado para estimar. Sessões agênticas longas são dominadas por cache read barato, por isso o bruto pode ser ~10× o efetivo.

---

## Por SPEC

| SPEC | Título | Status | Sessões | Última atividade | Tokens brutos | Tokens efetivos |
|---|---|---|---:|---|---:|---:|
| SPEC-0002 | Core Bootstrap — contratos públicos e plataforma mínima | Done | 1 | 2026-07-11 | 139.415.926 | 35.026.030 |
| SPEC-0003 | CLI Foundation — primeira interface executável (`apps/cli`) | Done | 1 | 2026-07-13 | 60.891.692 | 10.113.708 |
| SPEC-0004 | Model Gateway — acesso padronizado a modelos de IA (`packages/model-gateway`) | Done | 1 | 2026-07-13 | 28.347.247 | 5.018.577 |
| SPEC-0005 | Cognitive Core mínimo — primeiro orquestrador + comando `atlas ask` (`packages/cognitive`) | Done | 1 | 2026-07-13 | 13.574.092 | 3.780.718 |
| SPEC-0006 | Chat interativo multi-turno na CLI — `atlas chat` + Cognitive Core consciente de conversa | Done | 1 | 2026-07-13 | 58.133.918 | 9.449.082 |
| SPEC-0007 | Context Service (detentor do estado temporário de conversa por sessão) | Done | 1 | 2026-07-13 | 92.761.770 | 17.839.764 |
| SPEC-0008 | Persona Service — identidade "Jarvis" injetada na geração cognitiva | Done | 0 | - | 13.673.359 | 3.308.128 |
| SPEC-0009 | Memory Service — fatos/preferências persistentes, injetados na geração cognitiva | Done | 1 | 2026-07-14 | 62.819.192 | 9.409.092 |
| SPEC-0010 | Espinha de execução: Planner produz plano, Runtime executa Tools reais (`clock`/`calc`) | Done | 1 | 2026-07-14 | 77.529.922 | 11.043.734 |
| SPEC-0011 | Portão de permissão na execução: primeiras Tools com efeito (`read_file`/`list_dir`) atrás do Permission Service | Done | 1 | 2026-07-15 | 57.104.371 | 11.883.351 |
| SPEC-0012 | Primeira Tool de escrita (`write_file`) sob política de raízes de escrita (`writeRoots`), opt-in explícito, sem fluxo interativo | Done | 3 | 2026-07-17 | 86.543.558 | 14.292.483 |
| SPEC-0013 | Fluxo interativo `confirm` no Runtime + Tools `delete_file`/`mkdir`/`append_file`, restrito a `atlas ask` | Done | 5 | 2026-07-17 | 130.491.365 | 19.526.872 |

## Detalhamento por fase

Fase = qual agente fez o trabalho: **Criação/Decisão** é tudo que roda no fio principal (hoje isso cobre decidir o que vai ser feito, já que ainda não existe um agente dedicado a rascunhar SPEC); **Implementação** e **Verificação** só aparecem quando os subagents `spec-implementer`/`spec-validator` (`.claude/agents/`) são efetivamente usados via Task; **Apoio (outros agentes)** cobre qualquer outro subagent (ex. `Explore`, `code-reviewer`) invocado durante o trabalho na SPEC. SPECs antigas, implementadas antes de esses agentes existirem, aparecem 100% em Criação/Decisão — não é erro, é a fase real que ocorreu. Valores em **tokens efetivos**.

| SPEC | Criação/Decisão | Implementação | Verificação | Apoio (outros agentes) |
|---|---:|---:|---:|---:|
| SPEC-0002 | 35.026.030 | 0 | 0 | 0 |
| SPEC-0003 | 10.113.708 | 0 | 0 | 0 |
| SPEC-0004 | 5.018.577 | 0 | 0 | 0 |
| SPEC-0005 | 3.154.069 | 0 | 0 | 626.649 |
| SPEC-0006 | 9.449.082 | 0 | 0 | 0 |
| SPEC-0007 | 10.825.334 | 0 | 0 | 7.014.430 |
| SPEC-0008 | 0 | 0 | 0 | 3.308.128 |
| SPEC-0009 | 9.409.092 | 0 | 0 | 0 |
| SPEC-0010 | 11.043.734 | 0 | 0 | 0 |
| SPEC-0011 | 6.287.651 | 0 | 0 | 5.595.700 |
| SPEC-0012 | 14.292.483 | 0 | 0 | 0 |
| SPEC-0013 | 15.651.542 | 3.026.716 | 694.252 | 154.362 |

## Como estimar antes de começar uma SPEC nova

- SPECs concluídas (`Done`) até agora: 12. Custo médio: **12.557.628 tokens efetivos**. Faixa observada: 3.308.128 – 35.026.030 tokens efetivos.

- Compare a SPEC que você está prestes a começar com as mais parecidas em tamanho na tabela acima (número de itens em "Escopo"/"Critérios de Aceitação", quantidade de "Arquivos Esperados"). Uma SPEC do porte de uma linha já concluída tende a custar perto do que ela custou.
- Se o consumo já acumulado na sessão atual (rode o relatório detalhado, `.claude/usage-report.md`) mais a estimativa da próxima SPEC passar perto do seu limite de janela, prefira parar num ponto de commit limpo e retomar na próxima sessão em vez de começar e arriscar cortar a implementação pela metade.
