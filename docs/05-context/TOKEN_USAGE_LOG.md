# Log de uso de tokens por SPEC

> **Project Atlas — Log de Custo de Token por SPEC**

Atualizado em: 2026-07-31 (regenerado por `python3 scripts/claude-usage-report.py`)

Este documento existe para responder, antes de começar a implementar uma SPEC, à pergunta: *"cabe numa sessão, ou é melhor esperar a próxima janela?"*. Os totais são derivados automaticamente dos transcripts locais (heurística: sessão é atribuída à SPEC mais citada nela — uma sessão que tocou mais de uma SPEC entra só na dominante). Regenere após encerrar ou retomar trabalho em uma SPEC rodando o script acima; **não edite esta tabela manualmente**.

**Tokens brutos** somam input + output + cache com o mesmo peso; **tokens efetivos** ponderam cada tipo pelo preço relativo ao token de input (cache read ~10%, cache write ~125%, output ~500%) — é o número que reflete custo/limite real e o usado para estimar. Sessões agênticas longas são dominadas por cache read barato, por isso o bruto pode ser ~10× o efetivo.

---

## Por SPEC

| SPEC | Título | Status | Sessões | Última atividade | Tokens brutos | Tokens efetivos |
|---|---|---|---:|---|---:|---:|
| SPEC-0002 | Core Bootstrap — contratos públicos e plataforma mínima | Done | 1 | 2026-07-11 | 139.415.926 | 35.026.030 |
| SPEC-0003 | CLI Foundation — primeira interface executável (`apps/cli`) | Done | 1 | 2026-07-13 | 62.444.090 | 10.687.238 |
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
| SPEC-0014 | Tools e fluxo `confirm` no `atlas chat`: cada turno pode planejar e executar Tools, mantendo histórico multi-turno | Done | 1 | 2026-07-17 | 27.624.465 | 4.644.100 |
| SPEC-0015 | Contenção resolvida por `realpath` no Permission Service: fecha o escape por symlink dentro de uma raiz permitida (limitação conhecida do ADR-0013), mantendo `evaluate` puro e síncrono | Done | 3 | 2026-07-18 | 23.230.164 | 5.508.846 |
| SPEC-0016 | Remote (GitHub) + CI básico — primeira infraestrutura de desenvolvimento: publica o repositório (hoje só local) num remote privado no GitHub e valida `lint`/`typecheck`/`test`/`format:check` a cada push/PR. | Done | 2 | 2026-07-18 | 27.723.632 | 5.753.140 |
| SPEC-0017 | Fecho atômico da janela TOCTOU em `read_file`/`write_file`/`append_file`: as portas de IO abrem o fd com `O_NOFOLLOW`, ancoram na identidade do fd (`fstat` × `stat` do `realpath`) e aplicam sobre o handle real um veredicto de contenção do Permission Service (método novo, puro/síncrono), mantendo `evaluate` intacto como pré-check e o Runtime inalterado | Done | 2 | 2026-07-18 | 33.702.626 | 7.001.321 |
| SPEC-0018 | Múltiplas raízes de leitura/escrita na borda de entrada da CLI: `--allow-read`/`--allow-write` tornam-se flags repetíveis (`multiple: true` do `parseArgs`) e `ATLAS_ALLOW_READ`/`ATLAS_ALLOW_WRITE` passam a aceitar lista separada por `path.delimiter`, produzindo `readRoots`/`writeRoots` com múltiplas raízes — sem tocar `@atlas/permissions`, `@atlas/contracts`, `@atlas/runtime`, `@atlas/tools` nem `@atlas/cognitive`. | Done | 1 | 2026-07-19 | 20.319.306 | 4.355.841 |
| SPEC-0019 | Observação como função pura determinística em `@atlas/cognitive` (`observe(executionResult) → Observation`) e o `runPlanCycle` como laço limitado (teto fixo de 1 replanejamento). A distinção terminal × falha de Tool é carregada por um discriminador estruturado no contrato: `ExecutedStep` ganha `denialKind?: 'blocked' | 'declined'` (única mudança em `@atlas/contracts`), rotulado pelo Runtime nos dois branches de negação que ele já produz. Falha de Tool (todo `ok:false` sem `denialKind`) dispara replan com resumo compacto das falhas; bloqueio de permissão e recusa no `confirm` são terminais; `steps` acumulam os passos de todos os passes; vale para `ask` e `respond`; Planner, Permission Service, Tools e Model Gateway intactos | Done | 1 | 2026-07-19 | 56.803.499 | 9.616.817 |
| SPEC-0020 | Aprendizado (Etapa 6 do Cognitive Lifecycle) como extração pós-turno: após a resposta final do turno ser composta (com ou sem plano), o ciclo compartilhado `runPlanCycle` de `@atlas/cognitive` faz **uma chamada `generate` dedicada** de extração; um `learner` **puro** (molde do Planner/Observer: `instruction()` + `parse(saída) → readonly string[]`, teto fixo embutido de 3 candidatos, tipo interno) decide o que preservar; o Cognitive **propõe** os candidatos como dado (`AskResult`/`ConversationTurn` ganham `learned?: readonly string[]`, aditivo) e **a borda grava**: `atlas ask` e `atlas chat` iteram os candidatos, gravam via `atlas.memory.remember(texto, 'learned')` e imprimem um traço compacto. Proveniência: `Fact` ganha `source?: 'user' | 'learned'` e `MemoryService.remember` ganha parâmetro opcional de origem (default `'user'`); `atlas memory list` exibe a origem. Cognitive segue puro/sem estado; Memory mantém autoridade exclusiva de gravação; Planner, Observer, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway` intactos | Done | 4 | 2026-07-20 | 49.335.555 | 10.145.804 |
| SPEC-0021 | Recompor o `memoryPrompt` a cada turno em vez de congelá-lo na criação do Cognitive Core. `CognitiveCoreDeps.memoryPrompt` deixa de ser `string?` e passa a ser um **provider síncrono** injetado — `memoryPrompt?: () => string | undefined` — avaliado **uma vez por turno** no início de cada `ask` e de cada `respond` (amostragem única: todas as `generate` do mesmo turno — planejamento, replanejamento, composição, extração — veem o mesmo prompt). Em `respond`, a primeira mensagem `system` da `Conversation` é **substituída** pelo `systemPrompt` fresco, tanto nas mensagens enviadas ao modelo quanto na `Conversation` retornada (fonte única, sem prompt morto). A chamada de extração do learner (SPEC-0020) passa a **incluir os fatos já conhecidos** (o mesmo valor amostrado do turno) com instrução de **não re-propor** o que já está presente — suprimindo (por instrução ao modelo, sem garantia determinística) a duplicação intra-sessão apontada no fecho da SPEC-0020. `@atlas/core` fia `memoryPrompt: () => memory.prompt()`. **Zero mudança em `@atlas/contracts`** (o `CognitiveCoreDeps` é interno a `@atlas/cognitive`), **zero mudança em `apps/cli`**. Planner, Observer, Runtime, Permission Service, Tools, Model Gateway, Persona, Context intactos | Done | 5 | 2026-07-20 | 52.263.074 | 12.149.240 |
| SPEC-0022 | Tornar a Memória **incapaz de persistir dois fatos textualmente equivalentes**, de forma **determinística**, na autoridade exclusiva do estado persistente (Artigo 11). `MemoryService.remember` passa a normalizar o texto (`trim` → `toLowerCase` → colapso de espaços internos) e, em caso de duplicata de um fato já existente, **não cria fato novo, não chama `storage.save`**, devolvendo o `Fact` já existente — no-op idempotente, sem promover `source`. Vale para todo chamador (`'user'` e `'learned'`). A assinatura de `remember` muda (não-aditiva) para sinalizar **criado × existente**. Só protege escritas novas — o acervo legado permanece intacto (sem consolidação no load). Fecha a garantia real que a SPEC-0021 deixou aberta (lá a supressão de duplicatas era por instrução ao modelo, sem garantia determinística). | Done | 4 | 2026-07-20 | 26.255.769 | 6.682.987 |
| SPEC-0023 | Dar à Memória uma operação **explícita e determinística** para **consolidar o acervo já persistido**: o comando `atlas memory dedupe` (novo subcomando de `memory`) reúne os fatos legados que colidem sob a mesma normalização (`trim` → `toLowerCase` → colapso de `\s+`, o mesmo critério da SPEC-0022) e, sob confirmação explícita (`--apply`), remove as duplicatas mantendo **um único sobrevivente por grupo** (o mais antigo por `createdAt`, com `id`/`text`/`source` preservados). Por default é **dry-run** (só relata o que seria consolidado, sem tocar o storage). A consolidação é a **autoridade da Memory** (Artigo 11): um método aditivo `MemoryService.dedupe(options?)` — a CLI só invoca e renderiza, não reimplementa normalização nem toca o storage. Fecha o residual explícito que a SPEC-0022 deixou aberto (lá a garantia determinística cobria só **escritas novas**; o acervo legado permanecia intacto). Não muda `remember`/`forget`/`list`/`prompt`, não normaliza texto armazenado, não mescla campos e não promove `source`. | Done | 3 | 2026-07-20 | 44.937.868 | 9.217.513 |
| SPEC-0024 | Inverter o default do predicado de contenção `verify` das portas de FS (`nodeFsReadPort`/`nodeFsWritePort` em `@atlas/tools`) de permissivo (`() => true`) para **fail-closed** (`() => false`), de modo que uma porta construída sem injetar `verify` **recuse** (em vez de permitir) `read_file`/`write_file`/`append_file` no instante do uso — fechando o residual de segurança-por-default deixado consciente pela SPEC-0017/ADR-0014, sem mudar assinatura pública, sem tocar `@atlas/contracts`, `@atlas/core` ou o Runtime | Done | 2 | 2026-07-20 | 15.085.871 | 4.820.501 |
| SPEC-0025 | Skills — Skill Registry (catálogo passivo em memória) + Skill Builder (processo de 8 passos), sem consumo no laço cognitivo | Done | 2 | 2026-07-21 | 35.303.718 | 7.464.093 |
| SPEC-0026 | Consumo de Skills no laço cognitivo — seleção automática pelo Planner | Done | 2 | 2026-07-21 | 30.841.635 | 6.647.715 |
| SPEC-0027 | Busca/recuperação determinística de fatos no Memory Service (`MemoryService.search` + `atlas memory search`) | Done | 2 | 2026-07-21 | 16.871.226 | 4.315.035 |
| SPEC-0028 | Tools de git somente-leitura (`git_status` / `git_diff` / `git_log`) em `@atlas/tools`, com o toplevel real do repositório contido às `readRoots` pelo `verify` injetado (ADR-0013 + ADR-0014) | Done | 3 | 2026-07-22 | 27.513.938 | 6.897.798 |
| SPEC-0029 | Categorias de conhecimento no Memory Service: memória episódica e memória de projetos | Done | 2 | 2026-07-22 | 30.361.670 | 6.453.279 |
| SPEC-0030 | Injeção de memória guiada pela consulta do turno (`MemoryService.prompt({ query, limit })` consumido pelo Cognitive Core) | Done | 2 | 2026-07-22 | 27.430.080 | 5.519.152 |
| SPEC-0031 | Desktop Foundation — primeira janela do app desktop (`apps/desktop`), um round-trip com o Core | Done | 1 | 2026-07-22 | 32.647.284 | 5.815.214 |
| SPEC-0032 | Desktop: `ConfirmPort` via diálogo nativo + superfície visual dos `steps`, exercitados por um `ask` de tiro único | Draft | 1 | 2026-07-23 | 22.130.273 | 5.545.354 |
| SPEC-0033 | Desktop: chat visual multi-turno na janela — `respond`/`Conversation` viva entre turnos sobre a sessão do Context Service, com o Core mantido vivo no main process | Draft | 1 | 2026-07-23 | 20.241.408 | 6.710.000 |
| SPEC-0034 | Desktop: gerência visual de memória na janela — listar os fatos memorizados e esquecer um fato pela interface gráfica, equivalente GUI de `atlas memory list` e `atlas forget` | Done | 1 | 2026-07-23 | 12.161.400 | 2.904.770 |
| SPEC-0035 | Desktop: saída de voz (TTS) — falar a resposta do chat pela Web Speech API do Chromium | Done | 1 | 2026-07-25 | 14.888.461 | 3.645.651 |
| SPEC-0036 | Desktop: TTS 100% offline garantido — restringir a saída de voz a vozes locais do SO (`localService === true`) | Done | 2 | 2026-07-25 | 10.310.405 | 2.795.790 |
| SPEC-0037 | Desktop: seleção e troca de Persona em runtime pela interface gráfica — escolher entre as Personas disponíveis (`jarvis`/`neutral`) sem reiniciar a app nem passar flag/env | Done | 2 | 2026-07-28 | 36.474.501 | 7.783.071 |
| SPEC-0038 | Desktop: configuração de permissões de sistema de arquivos (`readRoots`/`writeRoots`) pela interface gráfica — ver as raízes configuradas e alterá-las em runtime, sem flag/env, com concessão de escrita sob consentimento explícito de política | Done | 2 | 2026-07-29 | 43.084.519 | 9.242.741 |
| SPEC-0039 | Desktop: CRUD de Personas custom pela interface gráfica — formulário completo (paridade com os 8 campos de `Persona`), persistência em arquivo JSON atrás de porta injetável no Persona Service, e vínculo real entre a voz escolhida e o TTS | Done | 2 | 2026-07-29 | 98.554.284 | 16.458.402 |
| SPEC-0040 | Desktop: integrar o Piper (TTS neural 100% local) como primeira camada de saída de voz — subprocesso de longa duração no main process, catálogo de vozes PT-BR empacotadas, playback por `<audio>` no renderer, e a Web Speech API das SPECs 0035/0036 preservada como fallback fail-closed | Done | 2 | 2026-07-30 | 77.978.447 | 13.734.691 |
| SPEC-0041 | Desktop: quando o Piper estiver **disponível** (arquivo do binário presente em disco + ao menos um modelo instalado, conforme `PiperTts.isAvailable()`), a **superfície de escolha e de uso** de voz passa a ser exclusivamente Piper — as vozes nativas do SO deixam de aparecer no `<select>` do formulário de Persona e uma preferência de voz do SO já persistida deixa de ser honrada —, sem remover a Web Speech API, que segue como **rede de segurança interna invisível** (ADR-0021(c)) | Done | 1 | 2026-07-30 | 29.614.330 | 6.507.281 |
| SPEC-0042 | Quebra do `core-bridge.test.ts` por assunto e verificação escopada por package (`--filter`) | Done | 1 | 2026-07-31 | 69.187.588 | 13.678.801 |

## Detalhamento por fase

Fase = qual agente fez o trabalho. **Criação/Decisão** é o que roda no **fio principal** — hoje despacho/orquestração e o que não foi delegado (o rascunho migrou para o subagent `spec-drafter`). As fases nomeadas só aparecem quando o subagent correspondente é usado via Task: **Rascunho** (`spec-drafter`), **Revisão** (`architecture-reviewer`), **Implementação** (`spec-implementer`), **Verificação** (`spec-validator`) e **Fechamento** (`spec-closer`: lições + docs vivas + commit). **Apoio (outros agentes)** cobre qualquer outro subagent (ex. `Explore`, `code-reviewer`). SPECs antigas, anteriores a esses agentes, aparecem 100% em Criação/Decisão — não é erro, é a fase real que ocorreu. Valores em **tokens efetivos**.

| SPEC | Criação/Decisão | Rascunho | Revisão | Implementação | Verificação | Fechamento | Apoio (outros agentes) |
|---|---:|---:|---:|---:|---:|---:|---:|
| SPEC-0002 | 35.026.030 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0003 | 10.113.708 | 573.530 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0004 | 5.018.577 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0005 | 3.154.069 | 0 | 0 | 0 | 0 | 0 | 626.649 |
| SPEC-0006 | 9.449.082 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0007 | 10.825.334 | 0 | 0 | 0 | 0 | 0 | 7.014.430 |
| SPEC-0008 | 0 | 0 | 0 | 0 | 0 | 0 | 3.308.128 |
| SPEC-0009 | 9.409.092 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0010 | 11.043.734 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0011 | 6.287.651 | 0 | 0 | 0 | 0 | 0 | 5.595.700 |
| SPEC-0012 | 14.292.483 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0013 | 15.651.542 | 0 | 0 | 3.026.716 | 694.252 | 0 | 154.362 |
| SPEC-0014 | 1.375.432 | 317.355 | 0 | 2.502.843 | 448.470 | 0 | 0 |
| SPEC-0015 | 3.163.147 | 472.621 | 0 | 1.041.596 | 831.482 | 0 | 0 |
| SPEC-0016 | 4.093.830 | 951.301 | 0 | 221.879 | 281.154 | 0 | 204.976 |
| SPEC-0017 | 3.710.414 | 548.097 | 0 | 2.195.810 | 547.000 | 0 | 0 |
| SPEC-0018 | 3.006.307 | 490.569 | 0 | 558.060 | 300.905 | 0 | 0 |
| SPEC-0019 | 4.688.414 | 1.008.305 | 0 | 3.374.441 | 545.657 | 0 | 0 |
| SPEC-0020 | 4.432.984 | 1.333.249 | 816.702 | 2.651.780 | 911.089 | 0 | 0 |
| SPEC-0021 | 7.533.130 | 1.479.607 | 1.445.130 | 1.221.015 | 470.358 | 0 | 0 |
| SPEC-0022 | 2.576.468 | 643.430 | 648.237 | 971.524 | 763.306 | 1.080.022 | 0 |
| SPEC-0023 | 4.562.208 | 769.726 | 509.544 | 953.157 | 641.550 | 1.781.328 | 0 |
| SPEC-0024 | 868.100 | 2.372.851 | 456.425 | 260.446 | 0 | 862.679 | 0 |
| SPEC-0025 | 1.871.761 | 1.539.256 | 494.058 | 1.925.131 | 514.147 | 1.119.740 | 0 |
| SPEC-0026 | 2.398.768 | 720.490 | 406.234 | 1.341.392 | 488.732 | 1.292.099 | 0 |
| SPEC-0027 | 850.496 | 1.173.015 | 253.612 | 917.616 | 398.798 | 721.498 | 0 |
| SPEC-0028 | 2.326.233 | 0 | 988.117 | 1.798.251 | 527.382 | 1.257.815 | 0 |
| SPEC-0029 | 1.050.754 | 839.896 | 540.730 | 2.221.757 | 586.135 | 1.214.007 | 0 |
| SPEC-0030 | 989.067 | 673.326 | 367.030 | 1.541.200 | 431.151 | 1.517.378 | 0 |
| SPEC-0031 | 1.310.887 | 0 | 587.597 | 2.476.361 | 438.578 | 1.001.791 | 0 |
| SPEC-0032 | 955.939 | 1.915.544 | 742.647 | 904.190 | 300.577 | 726.457 | 0 |
| SPEC-0033 | 995.927 | 3.329.535 | 645.460 | 813.919 | 291.228 | 633.931 | 0 |
| SPEC-0034 | 641.877 | 0 | 464.152 | 557.521 | 268.552 | 972.668 | 0 |
| SPEC-0035 | 985.655 | 541.218 | 313.758 | 569.278 | 269.068 | 966.674 | 0 |
| SPEC-0036 | 1.091.068 | 0 | 381.649 | 292.041 | 203.397 | 827.635 | 0 |
| SPEC-0037 | 1.188.580 | 771.603 | 1.107.507 | 1.862.949 | 686.605 | 1.021.702 | 1.144.125 |
| SPEC-0038 | 1.630.767 | 2.028.166 | 1.111.420 | 2.587.677 | 621.628 | 1.263.083 | 0 |
| SPEC-0039 | 3.526.489 | 1.698.410 | 2.152.287 | 6.393.418 | 1.069.167 | 1.618.631 | 0 |
| SPEC-0040 | 5.280.183 | 1.211.933 | 936.652 | 4.445.652 | 779.727 | 1.080.544 | 0 |
| SPEC-0041 | 302.523 | 879.973 | 1.728.261 | 1.585.278 | 545.015 | 1.466.231 | 0 |
| SPEC-0042 | 4.825.460 | 1.337.544 | 1.611.242 | 3.956.511 | 747.497 | 1.200.547 | 0 |

## Eficiência de processo (overhead ÷ implementação)

Razão entre o custo de **processo** (todas as fases exceto Implementação — fio principal, rascunho, revisão, verificação, fechamento e apoio) e o custo da **Implementação** (`spec-implementer`). Normaliza o tamanho da SPEC: mede quantos tokens de cerimônia cada token de código carregou — **menor é melhor**. Só aparecem SPECs cuja implementação rodou como fase distinta (via `spec-implementer`); SPECs antigas, feitas 100% no fio principal, não têm denominador e são omitidas.

| SPEC | Implementação | Overhead (resto) | Overhead ÷ Impl |
|---|---:|---:|---:|
| SPEC-0013 | 3.026.716 | 16.500.156 | 5.5× |
| SPEC-0014 | 2.502.843 | 2.141.257 | 0.9× |
| SPEC-0015 | 1.041.596 | 4.467.250 | 4.3× |
| SPEC-0016 | 221.879 | 5.531.261 | 24.9× |
| SPEC-0017 | 2.195.810 | 4.805.511 | 2.2× |
| SPEC-0018 | 558.060 | 3.797.781 | 6.8× |
| SPEC-0019 | 3.374.441 | 6.242.376 | 1.8× |
| SPEC-0020 | 2.651.780 | 7.494.024 | 2.8× |
| SPEC-0021 | 1.221.015 | 10.928.225 | 9.0× |
| SPEC-0022 | 971.524 | 5.711.463 | 5.9× |
| SPEC-0023 | 953.157 | 8.264.356 | 8.7× |
| SPEC-0024 | 260.446 | 4.560.055 | 17.5× |
| SPEC-0025 | 1.925.131 | 5.538.962 | 2.9× |
| SPEC-0026 | 1.341.392 | 5.306.323 | 4.0× |
| SPEC-0027 | 917.616 | 3.397.419 | 3.7× |
| SPEC-0028 | 1.798.251 | 5.099.547 | 2.8× |
| SPEC-0029 | 2.221.757 | 4.231.522 | 1.9× |
| SPEC-0030 | 1.541.200 | 3.977.952 | 2.6× |
| SPEC-0031 | 2.476.361 | 3.338.853 | 1.3× |
| SPEC-0032 | 904.190 | 4.641.164 | 5.1× |
| SPEC-0033 | 813.919 | 5.896.081 | 7.2× |
| SPEC-0034 | 557.521 | 2.347.249 | 4.2× |
| SPEC-0035 | 569.278 | 3.076.373 | 5.4× |
| SPEC-0036 | 292.041 | 2.503.749 | 8.6× |
| SPEC-0037 | 1.862.949 | 5.920.122 | 3.2× |
| SPEC-0038 | 2.587.677 | 6.655.064 | 2.6× |
| SPEC-0039 | 6.393.418 | 10.064.984 | 1.6× |
| SPEC-0040 | 4.445.652 | 9.289.039 | 2.1× |
| SPEC-0041 | 1.585.278 | 4.922.003 | 3.1× |
| SPEC-0042 | 3.956.511 | 9.722.290 | 2.5× |

## Como estimar antes de começar uma SPEC nova

- SPECs concluídas (`Done`) até agora: 39. Custo médio: **9.000.632 tokens efetivos**. Faixa observada: 2.795.790 – 35.026.030 tokens efetivos.

- Compare a SPEC que você está prestes a começar com as mais parecidas em tamanho na tabela acima (número de itens em "Escopo"/"Critérios de Aceitação", quantidade de "Arquivos Esperados"). Uma SPEC do porte de uma linha já concluída tende a custar perto do que ela custou.
- Se o consumo já acumulado na sessão atual (rode o relatório detalhado, `.claude/usage-report.md`) mais a estimativa da próxima SPEC passar perto do seu limite de janela, prefira parar num ponto de commit limpo e retomar na próxima sessão em vez de começar e arriscar cortar a implementação pela metade.
