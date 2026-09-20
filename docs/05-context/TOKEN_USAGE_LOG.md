# Log de uso de tokens por SPEC

> **Project Atlas — Log de Custo de Token por SPEC**

Atualizado em: 2026-09-20 (regenerado por `python3 scripts/agent-usage-report.py --executor all`)

As métricas são separadas por executor. Tokens efetivos Claude usam os pesos históricos; Codex fica `N/D` até existir uma métrica comparável documentada. Snapshots de Codex são cumulativos e só o último total de cada transcript é lido.

---

## Por SPEC

| SPEC | Executor | Título | Status | Sessões | Última atividade | Tokens brutos | Tokens efetivos | Telemetria |
|---|---|---|---|---:|---|---:|---:|---|
| SPEC-0002 | Claude | Core Bootstrap — contratos públicos e plataforma mínima | Done | 1 | 2026-07-11 | 139.415.926 | 35.026.030 | complete |
| SPEC-0003 | Claude | CLI Foundation — primeira interface executável (`apps/cli`) | Done | 1 | 2026-07-13 | 62.444.090 | 10.687.238 | complete |
| SPEC-0004 | Claude | Model Gateway — acesso padronizado a modelos de IA (`packages/model-gateway`) | Done | 1 | 2026-07-13 | 28.347.247 | 5.018.577 | complete |
| SPEC-0005 | Claude | Cognitive Core mínimo — primeiro orquestrador + comando `atlas ask` (`packages/cognitive`) | Done | 1 | 2026-07-13 | 13.574.092 | 3.780.718 | complete |
| SPEC-0006 | Claude | Chat interativo multi-turno na CLI — `atlas chat` + Cognitive Core consciente de conversa | Done | 1 | 2026-07-13 | 58.133.918 | 9.449.082 | complete |
| SPEC-0007 | Claude | Context Service (detentor do estado temporário de conversa por sessão) | Done | 1 | 2026-07-13 | 92.761.770 | 17.839.764 | complete |
| SPEC-0008 | Claude | Persona Service — identidade "Jarvis" injetada na geração cognitiva | Done | 0 | - | 13.673.359 | 3.308.128 | complete |
| SPEC-0009 | Claude | Memory Service — fatos/preferências persistentes, injetados na geração cognitiva | Done | 1 | 2026-07-14 | 62.819.192 | 9.409.092 | complete |
| SPEC-0010 | Claude | Espinha de execução: Planner produz plano, Runtime executa Tools reais (`clock`/`calc`) | Done | 1 | 2026-07-14 | 77.529.922 | 11.043.734 | complete |
| SPEC-0011 | Claude | Portão de permissão na execução: primeiras Tools com efeito (`read_file`/`list_dir`) atrás do Permission Service | Done | 1 | 2026-07-15 | 57.104.371 | 11.883.351 | complete |
| SPEC-0012 | Claude | Primeira Tool de escrita (`write_file`) sob política de raízes de escrita (`writeRoots`), opt-in explícito, sem fluxo interativo | Done | 3 | 2026-07-17 | 86.543.558 | 14.292.483 | complete |
| SPEC-0013 | Claude | Fluxo interativo `confirm` no Runtime + Tools `delete_file`/`mkdir`/`append_file`, restrito a `atlas ask` | Done | 5 | 2026-07-17 | 130.491.365 | 19.526.872 | complete |
| SPEC-0014 | Claude | Tools e fluxo `confirm` no `atlas chat`: cada turno pode planejar e executar Tools, mantendo histórico multi-turno | Done | 1 | 2026-07-17 | 27.624.465 | 4.644.100 | complete |
| SPEC-0015 | Claude | Contenção resolvida por `realpath` no Permission Service: fecha o escape por symlink dentro de uma raiz permitida (limitação conhecida do ADR-0013), mantendo `evaluate` puro e síncrono | Done | 3 | 2026-07-18 | 23.230.164 | 5.508.846 | complete |
| SPEC-0016 | Claude | Remote (GitHub) + CI básico — primeira infraestrutura de desenvolvimento: publica o repositório (hoje só local) num remote privado no GitHub e valida `lint`/`typecheck`/`test`/`format:check` a cada push/PR. | Done | 2 | 2026-07-18 | 27.723.632 | 5.753.140 | complete |
| SPEC-0017 | Claude | Fecho atômico da janela TOCTOU em `read_file`/`write_file`/`append_file`: as portas de IO abrem o fd com `O_NOFOLLOW`, ancoram na identidade do fd (`fstat` × `stat` do `realpath`) e aplicam sobre o handle real um veredicto de contenção do Permission Service (método novo, puro/síncrono), mantendo `evaluate` intacto como pré-check e o Runtime inalterado | Done | 2 | 2026-07-18 | 33.702.626 | 7.001.321 | complete |
| SPEC-0018 | Claude | Múltiplas raízes de leitura/escrita na borda de entrada da CLI: `--allow-read`/`--allow-write` tornam-se flags repetíveis (`multiple: true` do `parseArgs`) e `ATLAS_ALLOW_READ`/`ATLAS_ALLOW_WRITE` passam a aceitar lista separada por `path.delimiter`, produzindo `readRoots`/`writeRoots` com múltiplas raízes — sem tocar `@atlas/permissions`, `@atlas/contracts`, `@atlas/runtime`, `@atlas/tools` nem `@atlas/cognitive`. | Done | 1 | 2026-07-19 | 20.319.306 | 4.355.841 | complete |
| SPEC-0019 | Claude | Observação como função pura determinística em `@atlas/cognitive` (`observe(executionResult) → Observation`) e o `runPlanCycle` como laço limitado (teto fixo de 1 replanejamento). A distinção terminal × falha de Tool é carregada por um discriminador estruturado no contrato: `ExecutedStep` ganha `denialKind?: 'blocked' | 'declined'` (única mudança em `@atlas/contracts`), rotulado pelo Runtime nos dois branches de negação que ele já produz. Falha de Tool (todo `ok:false` sem `denialKind`) dispara replan com resumo compacto das falhas; bloqueio de permissão e recusa no `confirm` são terminais; `steps` acumulam os passos de todos os passes; vale para `ask` e `respond`; Planner, Permission Service, Tools e Model Gateway intactos | Done | 1 | 2026-07-19 | 56.803.499 | 9.616.817 | complete |
| SPEC-0020 | Claude | Aprendizado (Etapa 6 do Cognitive Lifecycle) como extração pós-turno: após a resposta final do turno ser composta (com ou sem plano), o ciclo compartilhado `runPlanCycle` de `@atlas/cognitive` faz **uma chamada `generate` dedicada** de extração; um `learner` **puro** (molde do Planner/Observer: `instruction()` + `parse(saída) → readonly string[]`, teto fixo embutido de 3 candidatos, tipo interno) decide o que preservar; o Cognitive **propõe** os candidatos como dado (`AskResult`/`ConversationTurn` ganham `learned?: readonly string[]`, aditivo) e **a borda grava**: `atlas ask` e `atlas chat` iteram os candidatos, gravam via `atlas.memory.remember(texto, 'learned')` e imprimem um traço compacto. Proveniência: `Fact` ganha `source?: 'user' | 'learned'` e `MemoryService.remember` ganha parâmetro opcional de origem (default `'user'`); `atlas memory list` exibe a origem. Cognitive segue puro/sem estado; Memory mantém autoridade exclusiva de gravação; Planner, Observer, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway` intactos | Done | 4 | 2026-07-20 | 49.335.555 | 10.145.804 | complete |
| SPEC-0021 | Claude | Recompor o `memoryPrompt` a cada turno em vez de congelá-lo na criação do Cognitive Core. `CognitiveCoreDeps.memoryPrompt` deixa de ser `string?` e passa a ser um **provider síncrono** injetado — `memoryPrompt?: () => string | undefined` — avaliado **uma vez por turno** no início de cada `ask` e de cada `respond` (amostragem única: todas as `generate` do mesmo turno — planejamento, replanejamento, composição, extração — veem o mesmo prompt). Em `respond`, a primeira mensagem `system` da `Conversation` é **substituída** pelo `systemPrompt` fresco, tanto nas mensagens enviadas ao modelo quanto na `Conversation` retornada (fonte única, sem prompt morto). A chamada de extração do learner (SPEC-0020) passa a **incluir os fatos já conhecidos** (o mesmo valor amostrado do turno) com instrução de **não re-propor** o que já está presente — suprimindo (por instrução ao modelo, sem garantia determinística) a duplicação intra-sessão apontada no fecho da SPEC-0020. `@atlas/core` fia `memoryPrompt: () => memory.prompt()`. **Zero mudança em `@atlas/contracts`** (o `CognitiveCoreDeps` é interno a `@atlas/cognitive`), **zero mudança em `apps/cli`**. Planner, Observer, Runtime, Permission Service, Tools, Model Gateway, Persona, Context intactos | Done | 5 | 2026-07-20 | 52.263.074 | 12.149.240 | complete |
| SPEC-0022 | Claude | Tornar a Memória **incapaz de persistir dois fatos textualmente equivalentes**, de forma **determinística**, na autoridade exclusiva do estado persistente (Artigo 11). `MemoryService.remember` passa a normalizar o texto (`trim` → `toLowerCase` → colapso de espaços internos) e, em caso de duplicata de um fato já existente, **não cria fato novo, não chama `storage.save`**, devolvendo o `Fact` já existente — no-op idempotente, sem promover `source`. Vale para todo chamador (`'user'` e `'learned'`). A assinatura de `remember` muda (não-aditiva) para sinalizar **criado × existente**. Só protege escritas novas — o acervo legado permanece intacto (sem consolidação no load). Fecha a garantia real que a SPEC-0021 deixou aberta (lá a supressão de duplicatas era por instrução ao modelo, sem garantia determinística). | Done | 4 | 2026-07-20 | 26.255.769 | 6.682.987 | complete |
| SPEC-0023 | Claude | Dar à Memória uma operação **explícita e determinística** para **consolidar o acervo já persistido**: o comando `atlas memory dedupe` (novo subcomando de `memory`) reúne os fatos legados que colidem sob a mesma normalização (`trim` → `toLowerCase` → colapso de `\s+`, o mesmo critério da SPEC-0022) e, sob confirmação explícita (`--apply`), remove as duplicatas mantendo **um único sobrevivente por grupo** (o mais antigo por `createdAt`, com `id`/`text`/`source` preservados). Por default é **dry-run** (só relata o que seria consolidado, sem tocar o storage). A consolidação é a **autoridade da Memory** (Artigo 11): um método aditivo `MemoryService.dedupe(options?)` — a CLI só invoca e renderiza, não reimplementa normalização nem toca o storage. Fecha o residual explícito que a SPEC-0022 deixou aberto (lá a garantia determinística cobria só **escritas novas**; o acervo legado permanecia intacto). Não muda `remember`/`forget`/`list`/`prompt`, não normaliza texto armazenado, não mescla campos e não promove `source`. | Done | 3 | 2026-07-20 | 44.937.868 | 9.217.513 | complete |
| SPEC-0024 | Claude | Inverter o default do predicado de contenção `verify` das portas de FS (`nodeFsReadPort`/`nodeFsWritePort` em `@atlas/tools`) de permissivo (`() => true`) para **fail-closed** (`() => false`), de modo que uma porta construída sem injetar `verify` **recuse** (em vez de permitir) `read_file`/`write_file`/`append_file` no instante do uso — fechando o residual de segurança-por-default deixado consciente pela SPEC-0017/ADR-0014, sem mudar assinatura pública, sem tocar `@atlas/contracts`, `@atlas/core` ou o Runtime | Done | 2 | 2026-07-20 | 15.085.871 | 4.820.501 | complete |
| SPEC-0025 | Claude | Skills — Skill Registry (catálogo passivo em memória) + Skill Builder (processo de 8 passos), sem consumo no laço cognitivo | Done | 2 | 2026-07-21 | 35.303.718 | 7.464.093 | complete |
| SPEC-0026 | Claude | Consumo de Skills no laço cognitivo — seleção automática pelo Planner | Done | 2 | 2026-07-21 | 30.841.635 | 6.647.715 | complete |
| SPEC-0027 | Claude | Busca/recuperação determinística de fatos no Memory Service (`MemoryService.search` + `atlas memory search`) | Done | 2 | 2026-07-21 | 16.871.226 | 4.315.035 | complete |
| SPEC-0028 | Claude | Tools de git somente-leitura (`git_status` / `git_diff` / `git_log`) em `@atlas/tools`, com o toplevel real do repositório contido às `readRoots` pelo `verify` injetado (ADR-0013 + ADR-0014) | Done | 6 | 2026-08-20 | 32.957.810 | 9.023.992 | complete |
| SPEC-0029 | Claude | Categorias de conhecimento no Memory Service: memória episódica e memória de projetos | Done | 2 | 2026-07-22 | 30.361.670 | 6.453.279 | complete |
| SPEC-0030 | Claude | Injeção de memória guiada pela consulta do turno (`MemoryService.prompt({ query, limit })` consumido pelo Cognitive Core) | Done | 2 | 2026-07-22 | 27.430.080 | 5.519.152 | complete |
| SPEC-0031 | Claude | Desktop Foundation — primeira janela do app desktop (`apps/desktop`), um round-trip com o Core | Done | 1 | 2026-07-22 | 32.647.284 | 5.815.214 | complete |
| SPEC-0032 | Claude | Desktop: `ConfirmPort` via diálogo nativo + superfície visual dos `steps`, exercitados por um `ask` de tiro único | Draft | 1 | 2026-07-23 | 22.130.273 | 5.545.354 | complete |
| SPEC-0033 | Claude | Desktop: chat visual multi-turno na janela — `respond`/`Conversation` viva entre turnos sobre a sessão do Context Service, com o Core mantido vivo no main process | Draft | 1 | 2026-07-23 | 20.241.408 | 6.710.000 | complete |
| SPEC-0034 | Claude | Desktop: gerência visual de memória na janela — listar os fatos memorizados e esquecer um fato pela interface gráfica, equivalente GUI de `atlas memory list` e `atlas forget` | Done | 1 | 2026-07-23 | 12.161.400 | 2.904.770 | complete |
| SPEC-0035 | Claude | Desktop: saída de voz (TTS) — falar a resposta do chat pela Web Speech API do Chromium | Done | 1 | 2026-07-25 | 14.888.461 | 3.645.651 | complete |
| SPEC-0036 | Claude | Desktop: TTS 100% offline garantido — restringir a saída de voz a vozes locais do SO (`localService === true`) | Done | 2 | 2026-07-25 | 10.310.405 | 2.795.790 | complete |
| SPEC-0037 | Claude | Desktop: seleção e troca de Persona em runtime pela interface gráfica — escolher entre as Personas disponíveis (`jarvis`/`neutral`) sem reiniciar a app nem passar flag/env | Done | 2 | 2026-07-28 | 36.474.501 | 7.783.071 | complete |
| SPEC-0038 | Claude | Desktop: configuração de permissões de sistema de arquivos (`readRoots`/`writeRoots`) pela interface gráfica — ver as raízes configuradas e alterá-las em runtime, sem flag/env, com concessão de escrita sob consentimento explícito de política | Done | 3 | 2026-08-22 | 47.924.624 | 10.521.295 | complete |
| SPEC-0039 | Claude | Desktop: CRUD de Personas custom pela interface gráfica — formulário completo (paridade com os 8 campos de `Persona`), persistência em arquivo JSON atrás de porta injetável no Persona Service, e vínculo real entre a voz escolhida e o TTS | Done | 3 | 2026-07-31 | 103.026.115 | 18.313.551 | complete |
| SPEC-0040 | Claude | Desktop: integrar o Piper (TTS neural 100% local) como primeira camada de saída de voz — subprocesso de longa duração no main process, catálogo de vozes PT-BR empacotadas, playback por `<audio>` no renderer, e a Web Speech API das SPECs 0035/0036 preservada como fallback fail-closed | Done | 2 | 2026-07-30 | 83.185.162 | 16.378.662 | complete |
| SPEC-0041 | Claude | Desktop: quando o Piper estiver **disponível** (arquivo do binário presente em disco + ao menos um modelo instalado, conforme `PiperTts.isAvailable()`), a **superfície de escolha e de uso** de voz passa a ser exclusivamente Piper — as vozes nativas do SO deixam de aparecer no `<select>` do formulário de Persona e uma preferência de voz do SO já persistida deixa de ser honrada —, sem remover a Web Speech API, que segue como **rede de segurança interna invisível** (ADR-0021(c)) | Done | 2 | 2026-08-01 | 39.788.354 | 8.590.692 | complete |
| SPEC-0042 | Claude | Quebra do `core-bridge.test.ts` por assunto e verificação escopada por package (`--filter`) | Done | 1 | 2026-07-31 | 74.762.459 | 14.915.256 | complete |
| SPEC-0043 | Claude | Desktop: fechar os dois resíduos de voz registrados nas Observações da SPEC-0041 — (1) uma `Persona.voiceURI` persistida que o modo corrente **não pode oferecer por razão ambiental** (Piper indisponível, modelo removido, voz do SO desinstalada) passa a ser **preservada e visível** no formulário, em vez de apagada em silêncio no próximo submit; (2) o glue de TTS do renderer (`createSpeechOutputGlue`) passa a receber `preferredVoiceURI`, encerrando a deriva em que o caminho `'os'` ignorava a camada de preferência que `speech-output.ts` implementa desde a SPEC-0039/ADR-0020(b) | Done | 2 | 2026-07-31 | 31.088.699 | 5.512.543 | complete |
| SPEC-0044 | Claude | CLI de Persona — equivalente de terminal do CRUD de Personas custom entregue pela SPEC-0039 no desktop: `atlas persona list | show | create | edit | delete`, sobre o mesmo arquivo `personas.json`, com consentimento explícito na remoção | Done | 2 | 2026-07-31 | 35.155.485 | 6.189.830 | complete |
| SPEC-0045 | Claude | Cobertura automatizada de `apps/desktop/src/renderer/renderer.js` e gate mecânico contra a deriva das réplicas renderer↔`speech-output.ts` | Done | 2 | 2026-08-01 | 37.499.121 | 7.238.269 | complete |
| SPEC-0046 | Claude | Entrada por voz (STT) no chat do `apps/desktop`: captura por push-to-talk, transcrição por `whisper.cpp` local no main process, texto entregue ao campo de entrada para revisão do usuário | Done | 4 | 2026-08-05 | 93.676.496 | 16.689.997 | complete |
| SPEC-0047 | Claude | Extensão do gate mecânico de paridade renderer↔módulo aos exports de `apps/desktop/src/piper-tts.ts` (e `stt-engine.ts`) e cobertura comportamental dos painéis sobre o harness jsdom da SPEC-0045 | Done | 2 | 2026-08-03 | 50.894.804 | 8.941.222 | complete |
| SPEC-0048 | Claude | Fechamento dos dois resíduos da SPEC-0047 no renderer do desktop: `#chat-send` passa a considerar `askInFlight` na serialização de gestos (com guarda no manipulador de envio), e o comentário sobre `computeDefaultPiperVoiceURI` volta a descrever o estado real de cobertura | Done | 2 | 2026-08-03 | 24.788.975 | 4.859.006 | complete |
| SPEC-0049 | Claude | Fechamento das duas direções residuais de serialização de gestos registradas pela SPEC-0048 (DoD-d): o painel `ask` do desktop passa a recusar um 2º `ask` concorrente e um `ask` disparado durante um turno de chat em voo, e a falha de `atlas.ask` deixa de virar unhandled rejection para aparecer no `#ask-result` | Done | 2 | 2026-08-06 | 20.345.139 | 3.913.578 | complete |
| SPEC-0050 | Claude | Fechamento do resíduo D7 da SPEC-0049: o rastreio de operação em voo do `core-bridge` (`busySessions`/`inFlightOperations`) passa a ser guarda de entrada também de `resolveAskSnapshot` e `sendChatTurn` — somando-se aos consumidores que já existem (`updatePersona`, `selectPermissionRoots`) —, tornando o invariante "um round-trip contra o Core por vez" estrutural no main process, e não mais garantia exclusiva do renderer | Done | 2 | 2026-08-04 | 31.029.100 | 8.304.209 | complete |
| SPEC-0051 | Claude | Cancelamento (desistência) de uma operação em voo no `apps/desktop`: um botão "Cancelar" por painel (`ask` e chat) faz a promessa do gesto assentar imediatamente com mensagem pinada, libera a interface e o main process para um gesto novo, e **contém** os efeitos do trabalho abandonado (nenhum `learned` persistido, nenhuma conversa atualizada, `ConfirmPort` fail-closed **pegajoso por sessão**, conversa afetada em quarentena), sem introduzir cancelamento real dentro do Core. | Done | 2 | 2026-08-05 | 99.432.888 | 13.842.602 | complete |
| SPEC-0052 | Claude | Modo hands-free no `apps/desktop`: microfone aberto entre turnos sob toggle explícito, fim de fala detectado por VAD Silero em WASM no renderer, auto-envio da transcrição ao chat e resposta falada — com o microfone fechado durante o processamento e durante a fala | Draft | 7 | 2026-09-13 | 87.098.925 | 13.212.332 | complete |
| SPEC-0053 | Claude | Desktop v3.0: núcleo holográfico volumétrico (Canvas 2D, 400 pontos determinísticos, sete perfis de estado ligados a sinais reais de voz) substitui a esfera CSS-only; navegação passa a drawer overlay sob demanda com Sessão absorvendo a timeline integralmente; substitui integralmente as direções v1.x/v2.0 reprovadas em smoke humano | Done | 21 | 2026-08-18 | 222.553.211 | 35.802.728 | complete |
| SPEC-0053 | Codex | Núcleo holográfico volumétrico, navegação por drawer e sessão sob demanda no | Done | 6 | 2026-08-07 | 79.822.388 | N/D | complete |
| SPEC-0054 | Claude | (SPEC não encontrada em docs/implementation/specs/) | ? | 13 | 2026-08-19 | 187.714.357 | 27.616.545 | complete |
| SPEC-0055 | Claude | Primeiro acesso à internet **sob o portão de permissão**: Tool `http_get` somente-leitura em `@atlas/tools` sobre a porta injetável `HttpPort`, com o host julgado pelo portão de rede do Permission Service (`ResourceType: 'network'` + política `netRoots`, ADR-0026) e configurável pela CLI (`--allow-net` / `ATLAS_ALLOW_NET`) | Draft | 13 | 2026-08-23 | 131.742.508 | 22.794.122 | complete |
| SPEC-0056 | Claude | Tool de leitura de estrutura de projeto (`project_info`) em `@atlas/tools`, com a raiz descoberta pelo `rev-parse` já contido da SPEC-0028 e manifests reconhecidos por tabela fixa | Done | 8 | 2026-08-21 | 60.164.781 | 10.237.100 | complete |
| SPEC-0057 | Claude | Busca na internet por texto livre: Tool `web_search` em `@atlas/tools` sobre a porta injetável `SearchPort`, com adaptador default apoiado no `HttpPort` já endurecido da SPEC-0055, provedor **sem credencial** provisionado pelo usuário (endpoint compatível com a API JSON do SearXNG, configurado por `--search-url` / `ATLAS_SEARCH_URL`) e host julgado pelo mesmo portão de rede `netRoots` (ADR-0026) | Draft | 11 | 2026-08-22 | 89.131.798 | 15.364.879 | complete |
| SPEC-0058 | Claude | Endurecimento da composição de saídas de Tools no prompt (`@atlas/cognitive`): delimitação estruturada por bloco `<tool_output>`, instrução fixa de conteúdo não confiável e teto de tamanho por passo — mitigação genérica de injeção indireta de prompt, aplicável a **toda** Tool | Draft | 8 | 2026-08-22 | 46.684.753 | 8.853.771 | complete |
| SPEC-0059 | Claude | Desktop: painel de rede e busca — autorizar hosts (`netRoots`) e configurar/desativar o provedor de busca (`tools.searchUrl`) em runtime pela interface gráfica, com consentimento explícito por host, no molde de consentimento de política já estabelecido pela SPEC-0038 | Draft | 9 | 2026-09-13 | 172.290.188 | 25.213.041 | complete |
| SPEC-0060 | Claude | Auto-start do Ollama sob opt-in explícito: `createDependencyManager` + `ProcessPort` em `@atlas/core`, disparado uma vez por processo em `apps/cli` e uma vez por sessão de app em `apps/desktop`, degradando sem nunca bloquear o boot. | Draft | 9 | 2026-09-13 | 102.595.413 | 14.827.826 | complete |
| SPEC-0061 | Claude | Auto-start do container Docker do provedor de busca sob opt-in explícito e nominal: `ProcessPort`/`createDependencyManager` (`@atlas/core`) estendidos de forma aditiva com três operações Docker nomeadas — só `start` de um container **já existente**, nunca `run`/`create`/`pull` —, disparados uma vez por processo em `apps/cli` e uma vez por sessão de app em `apps/desktop`. | Draft | 5 | 2026-09-13 | 43.402.496 | 7.957.334 | complete |
| SPEC-0062 | Claude | Auto-start do Ollama ligado **por padrão** no `apps/desktop` (env explícita como via de desligamento) e campo de nome do container Docker do provedor de busca no painel de rede/busca, com a tentativa automática auditável no painel `Sistema`. | Draft | 12 | 2026-09-19 | 160.440.469 | 24.832.683 | complete |
| SPEC-0063 | Claude | Detecção de "nenhum modelo de IA instalado" na abertura do `apps/desktop` e instalação assistida, a partir de um catálogo curado e fixo, com tamanho visível antes do download, progresso por polling e cancelamento. | Draft | 9 | 2026-09-20 | 308.549.310 | 42.766.525 | complete |

## Detalhamento por fase

Valores em tokens efetivos. Codex não é somado nem comparado a Claude enquanto não existir métrica equivalente.

| SPEC | Executor | Criação/Decisão | Rascunho | Revisão | Implementação | Verificação | Fechamento | Apoio (outros agentes) |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| SPEC-0002 | Claude | 35.026.030 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0003 | Claude | 10.113.708 | 573.530 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0004 | Claude | 5.018.577 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0005 | Claude | 3.154.069 | 0 | 0 | 0 | 0 | 0 | 626.649 |
| SPEC-0006 | Claude | 9.449.082 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0007 | Claude | 10.825.334 | 0 | 0 | 0 | 0 | 0 | 7.014.430 |
| SPEC-0008 | Claude | 0 | 0 | 0 | 0 | 0 | 0 | 3.308.128 |
| SPEC-0009 | Claude | 9.409.092 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0010 | Claude | 11.043.734 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0011 | Claude | 6.287.651 | 0 | 0 | 0 | 0 | 0 | 5.595.700 |
| SPEC-0012 | Claude | 14.292.483 | 0 | 0 | 0 | 0 | 0 | 0 |
| SPEC-0013 | Claude | 15.651.542 | 0 | 0 | 3.026.716 | 694.252 | 0 | 154.362 |
| SPEC-0014 | Claude | 1.375.432 | 317.355 | 0 | 2.502.843 | 448.470 | 0 | 0 |
| SPEC-0015 | Claude | 3.163.147 | 472.621 | 0 | 1.041.596 | 831.482 | 0 | 0 |
| SPEC-0016 | Claude | 4.093.830 | 951.301 | 0 | 221.879 | 281.154 | 0 | 204.976 |
| SPEC-0017 | Claude | 3.710.414 | 548.097 | 0 | 2.195.810 | 547.000 | 0 | 0 |
| SPEC-0018 | Claude | 3.006.307 | 490.569 | 0 | 558.060 | 300.905 | 0 | 0 |
| SPEC-0019 | Claude | 4.688.414 | 1.008.305 | 0 | 3.374.441 | 545.657 | 0 | 0 |
| SPEC-0020 | Claude | 4.432.984 | 1.333.249 | 816.702 | 2.651.780 | 911.089 | 0 | 0 |
| SPEC-0021 | Claude | 7.533.130 | 1.479.607 | 1.445.130 | 1.221.015 | 470.358 | 0 | 0 |
| SPEC-0022 | Claude | 2.576.468 | 643.430 | 648.237 | 971.524 | 763.306 | 1.080.022 | 0 |
| SPEC-0023 | Claude | 4.562.208 | 769.726 | 509.544 | 953.157 | 641.550 | 1.781.328 | 0 |
| SPEC-0024 | Claude | 868.100 | 2.372.851 | 456.425 | 260.446 | 0 | 862.679 | 0 |
| SPEC-0025 | Claude | 1.871.761 | 1.539.256 | 494.058 | 1.925.131 | 514.147 | 1.119.740 | 0 |
| SPEC-0026 | Claude | 2.398.768 | 720.490 | 406.234 | 1.341.392 | 488.732 | 1.292.099 | 0 |
| SPEC-0027 | Claude | 850.496 | 1.173.015 | 253.612 | 917.616 | 398.798 | 721.498 | 0 |
| SPEC-0028 | Claude | 2.326.233 | 2.126.194 | 988.117 | 1.798.251 | 527.382 | 1.257.815 | 0 |
| SPEC-0029 | Claude | 1.050.754 | 839.896 | 540.730 | 2.221.757 | 586.135 | 1.214.007 | 0 |
| SPEC-0030 | Claude | 989.067 | 673.326 | 367.030 | 1.541.200 | 431.151 | 1.517.378 | 0 |
| SPEC-0031 | Claude | 1.310.887 | 0 | 587.597 | 2.476.361 | 438.578 | 1.001.791 | 0 |
| SPEC-0032 | Claude | 955.939 | 1.915.544 | 742.647 | 904.190 | 300.577 | 726.457 | 0 |
| SPEC-0033 | Claude | 995.927 | 3.329.535 | 645.460 | 813.919 | 291.228 | 633.931 | 0 |
| SPEC-0034 | Claude | 641.877 | 0 | 464.152 | 557.521 | 268.552 | 972.668 | 0 |
| SPEC-0035 | Claude | 985.655 | 541.218 | 313.758 | 569.278 | 269.068 | 966.674 | 0 |
| SPEC-0036 | Claude | 1.091.068 | 0 | 381.649 | 292.041 | 203.397 | 827.635 | 0 |
| SPEC-0037 | Claude | 1.188.580 | 771.603 | 1.107.507 | 1.862.949 | 686.605 | 1.021.702 | 1.144.125 |
| SPEC-0038 | Claude | 1.630.767 | 3.306.720 | 1.111.420 | 2.587.677 | 621.628 | 1.263.083 | 0 |
| SPEC-0039 | Claude | 3.868.750 | 3.211.298 | 2.152.287 | 6.393.418 | 1.069.167 | 1.618.631 | 0 |
| SPEC-0040 | Claude | 5.280.183 | 3.855.904 | 936.652 | 4.445.652 | 779.727 | 1.080.544 | 0 |
| SPEC-0041 | Claude | 1.724.007 | 1.541.900 | 1.728.261 | 1.585.278 | 545.015 | 1.466.231 | 0 |
| SPEC-0042 | Claude | 4.946.729 | 2.259.129 | 1.611.242 | 3.956.511 | 747.497 | 1.394.148 | 0 |
| SPEC-0043 | Claude | 730.595 | 0 | 662.341 | 1.736.316 | 624.460 | 1.758.831 | 0 |
| SPEC-0044 | Claude | 1.016.115 | 0 | 861.759 | 2.375.298 | 627.284 | 1.309.374 | 0 |
| SPEC-0045 | Claude | 690.243 | 1.700.671 | 396.721 | 2.104.535 | 772.901 | 1.573.198 | 0 |
| SPEC-0046 | Claude | 4.568.505 | 1.343.028 | 913.037 | 7.537.297 | 892.737 | 1.435.393 | 0 |
| SPEC-0047 | Claude | 1.097.228 | 657.378 | 1.016.949 | 3.615.034 | 860.872 | 1.693.761 | 0 |
| SPEC-0048 | Claude | 555.980 | 729.619 | 577.471 | 768.961 | 557.359 | 1.669.616 | 0 |
| SPEC-0049 | Claude | 677.295 | 0 | 439.408 | 1.052.170 | 415.004 | 1.329.701 | 0 |
| SPEC-0050 | Claude | 826.040 | 3.578.699 | 867.789 | 864.266 | 695.112 | 1.472.303 | 0 |
| SPEC-0051 | Claude | 1.107.198 | 23.450 | 935.085 | 8.915.134 | 1.178.794 | 1.682.941 | 0 |
| SPEC-0052 | Claude | 8.783.958 | 0 | 794.333 | 0 | 994.857 | 2.431.406 | 207.778 |
| SPEC-0053 | Claude | 7.965.554 | 1.996.006 | 1.000.863 | 18.752.363 | 3.097.778 | 2.990.164 | 0 |
| SPEC-0053 | Codex | N/D | N/D | N/D | N/D | N/D | — | — |
| SPEC-0054 | Claude | 3.784.527 | 2.394.055 | 1.135.657 | 13.556.745 | 2.987.996 | 3.757.565 | 0 |
| SPEC-0055 | Claude | 2.730.954 | 5.567.101 | 2.349.982 | 7.224.968 | 1.334.549 | 3.586.568 | 0 |
| SPEC-0056 | Claude | 2.233.378 | 414.488 | 1.426.208 | 2.825.319 | 547.533 | 2.790.174 | 0 |
| SPEC-0057 | Claude | 2.667.798 | 2.934.196 | 1.648.322 | 4.278.416 | 677.738 | 2.994.400 | 164.009 |
| SPEC-0058 | Claude | 350.742 | 838.425 | 2.330.681 | 2.569.249 | 559.106 | 2.205.568 | 0 |
| SPEC-0059 | Claude | 5.121.641 | 3.109.569 | 2.107.309 | 11.698.065 | 898.971 | 2.277.486 | 0 |
| SPEC-0060 | Claude | 1.075.749 | 1.875.355 | 2.706.818 | 9.103.530 | 66.374 | 0 | 0 |
| SPEC-0061 | Claude | 728.579 | 1.856.617 | 0 | 1.843.822 | 1.155.908 | 3.081.205 | 0 |
| SPEC-0062 | Claude | 5.827.354 | 2.639.871 | 1.524.014 | 10.068.741 | 1.214.887 | 3.557.816 | 0 |
| SPEC-0063 | Claude | 2.944.281 | 2.096.974 | 2.372.091 | 32.936.486 | 2.378.928 | 37.765 | 0 |

## Eficiência de processo (overhead ÷ implementação)

Calculada separadamente por executor, apenas quando tokens efetivos comparáveis existem.

| SPEC | Executor | Implementação | Overhead (resto) | Overhead ÷ Impl |
|---|---|---:|---:|---:|
| SPEC-0013 | Claude | 3.026.716 | 16.500.156 | 5.5× |
| SPEC-0014 | Claude | 2.502.843 | 2.141.257 | 0.9× |
| SPEC-0015 | Claude | 1.041.596 | 4.467.250 | 4.3× |
| SPEC-0016 | Claude | 221.879 | 5.531.261 | 24.9× |
| SPEC-0017 | Claude | 2.195.810 | 4.805.511 | 2.2× |
| SPEC-0018 | Claude | 558.060 | 3.797.781 | 6.8× |
| SPEC-0019 | Claude | 3.374.441 | 6.242.376 | 1.8× |
| SPEC-0020 | Claude | 2.651.780 | 7.494.024 | 2.8× |
| SPEC-0021 | Claude | 1.221.015 | 10.928.225 | 9.0× |
| SPEC-0022 | Claude | 971.524 | 5.711.463 | 5.9× |
| SPEC-0023 | Claude | 953.157 | 8.264.356 | 8.7× |
| SPEC-0024 | Claude | 260.446 | 4.560.055 | 17.5× |
| SPEC-0025 | Claude | 1.925.131 | 5.538.962 | 2.9× |
| SPEC-0026 | Claude | 1.341.392 | 5.306.323 | 4.0× |
| SPEC-0027 | Claude | 917.616 | 3.397.419 | 3.7× |
| SPEC-0028 | Claude | 1.798.251 | 7.225.741 | 4.0× |
| SPEC-0029 | Claude | 2.221.757 | 4.231.522 | 1.9× |
| SPEC-0030 | Claude | 1.541.200 | 3.977.952 | 2.6× |
| SPEC-0031 | Claude | 2.476.361 | 3.338.853 | 1.3× |
| SPEC-0032 | Claude | 904.190 | 4.641.164 | 5.1× |
| SPEC-0033 | Claude | 813.919 | 5.896.081 | 7.2× |
| SPEC-0034 | Claude | 557.521 | 2.347.249 | 4.2× |
| SPEC-0035 | Claude | 569.278 | 3.076.373 | 5.4× |
| SPEC-0036 | Claude | 292.041 | 2.503.749 | 8.6× |
| SPEC-0037 | Claude | 1.862.949 | 5.920.122 | 3.2× |
| SPEC-0038 | Claude | 2.587.677 | 7.933.618 | 3.1× |
| SPEC-0039 | Claude | 6.393.418 | 11.920.133 | 1.9× |
| SPEC-0040 | Claude | 4.445.652 | 11.933.010 | 2.7× |
| SPEC-0041 | Claude | 1.585.278 | 7.005.414 | 4.4× |
| SPEC-0042 | Claude | 3.956.511 | 10.958.745 | 2.8× |
| SPEC-0043 | Claude | 1.736.316 | 3.776.227 | 2.2× |
| SPEC-0044 | Claude | 2.375.298 | 3.814.532 | 1.6× |
| SPEC-0045 | Claude | 2.104.535 | 5.133.734 | 2.4× |
| SPEC-0046 | Claude | 7.537.297 | 9.152.700 | 1.2× |
| SPEC-0047 | Claude | 3.615.034 | 5.326.188 | 1.5× |
| SPEC-0048 | Claude | 768.961 | 4.090.045 | 5.3× |
| SPEC-0049 | Claude | 1.052.170 | 2.861.408 | 2.7× |
| SPEC-0050 | Claude | 864.266 | 7.439.943 | 8.6× |
| SPEC-0051 | Claude | 8.915.134 | 4.927.468 | 0.6× |
| SPEC-0053 | Claude | 18.752.363 | 17.050.365 | 0.9× |
| SPEC-0054 | Claude | 13.556.745 | 14.059.800 | 1.0× |
| SPEC-0055 | Claude | 7.224.968 | 15.569.154 | 2.2× |
| SPEC-0056 | Claude | 2.825.319 | 7.411.781 | 2.6× |
| SPEC-0057 | Claude | 4.278.416 | 11.086.463 | 2.6× |
| SPEC-0058 | Claude | 2.569.249 | 6.284.522 | 2.4× |
| SPEC-0059 | Claude | 11.698.065 | 13.514.976 | 1.2× |
| SPEC-0060 | Claude | 9.103.530 | 5.724.296 | 0.6× |
| SPEC-0061 | Claude | 1.843.822 | 6.822.309 | 3.7× |
| SPEC-0062 | Claude | 10.068.741 | 14.763.942 | 1.5× |
| SPEC-0063 | Claude | 32.936.486 | 9.830.039 | 0.3× |

## Como estimar antes de começar uma SPEC nova

- Claude: SPECs concluídas: 50. Custo médio: **9.675.589 tokens efetivos**. Faixa: 2.795.790 – 35.802.728.
