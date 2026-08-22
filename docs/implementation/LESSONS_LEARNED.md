# Lessons Learned

> **Project Atlas — Registro de Lições Aprendidas**

Version: 1.0

---

# Objetivo

Este documento acumula o conhecimento adquirido ao final de cada SPEC.

Seu propósito é impedir que descobertas, acertos e atritos se percam com o tempo.

O que parece óbvio ao concluir uma SPEC não estará na memória de ninguém — humano ou IA — meses depois.

---

# Regras de Uso

1. Registrar as lições é obrigatório ao concluir uma SPEC e faz parte da Definition of Done.
2. Novas entradas são adicionadas no topo do Registro; entradas antigas nunca são reescritas.
3. Lições são fatos observados durante a implementação, não opiniões.
4. Todo item listado em "Precisamos mudar" deve gerar um encaminhamento: um ADR em `docs/06-adr/`, uma atualização de documentação ou uma nova SPEC. Nenhuma mudança necessária deve morrer neste arquivo.

Uma lição não é uma decisão.

Quando uma lição exigir mudança estrutural, a decisão correspondente deverá ser registrada como ADR.

---

# Formato da Entrada

Toda entrada segue o modelo abaixo.

```text
## SPEC-XXXX — Título (AAAA-MM-DD)

Descobrimos que...

A arquitetura ajudou porque...

A arquitetura atrapalhou porque...

Precisamos mudar... (encaminhamento: ADR, documentação ou nova SPEC)
```

Quando uma seção não tiver conteúdo, registre "nada a registrar".

A ausência de atrito também é informação.

---

**Escopo deste arquivo:** o Registro abaixo mantém as **últimas 5 SPECs**. As entradas da SPEC-0052 e anteriores estão em `LESSONS_LEARNED-ARCHIVE.md`, preservadas sem edição (regra 2 intacta — nada é reescrito, só realocado).

O corte existe porque este arquivo chegou a 157 KB (~39k tokens) e era relido no arranque de quase todo subagent, dominando o custo em tokens do pipeline. Ao fechar uma SPEC: adicione a entrada nova no topo do Registro e mova a mais antiga das 6 para o arquivo.

---

# Padrões Recorrentes

Lições que se repetiram em três ou mais SPECs. Este índice existe para sobreviver ao corte acima — consulte o arquivo para o caso concreto de cada uma.

- **Correção de bloqueante introduz bloqueante novo no mesmo caminho de código** — SPEC-0034, 0038, 0039, 0048 (`#chat-send` corrigido em `refreshChatControlsForMic()` reabriria pelo `.finally` do turno de chat, que tinha origem de cálculo própria). Ao corrigir um veto do gate, re-examine o caminho inteiro, não só a linha apontada.
- **Garantia em prosa absoluta tende a estar incompleta** — SPEC-0038 (A1/A2 → A6/A7), SPEC-0047 (CA de verificação incompleto), SPEC-0049 (justificativa de decisão incompleta), SPEC-0050 (contagem de consumidores incompleta — "um único consumidor" quando já eram dois), SPEC-0056 (o próprio `spec-implementer` pediu ao `spec-closer` para não escrever "duas barreiras, como sempre" nem "o portão bloqueia" na doc viva — a generalização seria falsa em caminhos que a própria SPEC introduziu). "Toda função que X"/"N consumidores" quase sempre esquece um caso; enumere nominalmente ou restrinja a formulação em vez de contar — e, como a SPEC-0056 mostra, o próprio autor da mudança pode antecipar o risco antes do fechamento, sem esperar o gate pegá-lo.
- **Duplicação deliberada renderer↔módulo** — SPEC-0035, 0036, 0039, 0040, 0041, 0043 (8 réplicas + a constante `PIPER_VOICE_PREFIX`). `renderer.js` é `<script>` clássico sem bundler (ADR-0019) e não pode importar o módulo TS em runtime; a réplica em JS puro é consciente e leva comentário apontando o teste de referência. A SPEC-0043 é a 2ª vez que essa duplicação **deriva por acidente** (não só risco teórico): o glue do renderer ficou sem `preferredVoiceURI` desde a SPEC-0035 sem que nenhuma das cinco fatias seguintes notasse. Desde a **SPEC-0045**, a deriva entre as duas cópias é coberta por um gate mecânico (`renderer.speech-parity.test.ts`, sobre `jsdom` num harness que carrega `renderer.js` do disco) — cobre só réplicas de `speech-output.ts`; réplica de outro módulo segue por convenção.
- **Campo obrigatório novo em `Deps` exige grep pelo nome da função construtora** (`createRuntime(`, `createPermissionService(`) em **todo o repo** — repetido 8× até a SPEC-0013.
- **Membro obrigatório novo numa interface de contrato não é pego por esse grep** — busque pelo **nome do tipo** (`git grep 'PermissionService'`), que acha fakes e implementações diretas nos testes (quebrou o typecheck na SPEC-0017).
- **`vitest run` não faz typecheck** (esbuild só remove tipos) — um passo TDD "RED" que depende de erro de *tipo* só falha de verdade em `pnpm --filter <pkg> typecheck`.
- **Smoke visual/sonoro das fatias desktop** — SPEC-0031 a 0046, 15 seguidas sem confirmação (o shell de automação não tem WindowServer, microfone nem os binários Piper/`whisper-cli`). Deixou de ser risco hipotético na **SPEC-0053**: o smoke humano rodou de fato pela primeira vez e **reprovou** a v2.0 (1.322 testes/80 arquivos, quatro gates técnicos verdes) por hierarquia/sobreposição/falta de volume — prova concreta de que gates técnicos verdes não bastam para aceite perceptivo. A v3.0 corrigiu e fechou os 15 itens `OK`. Fatia futura que tocar o núcleo/layout reabre a pendência.
- **Contrato só sobe a `@atlas/contracts` com 2º consumidor real**, via ADR (ADR-0007). Tipos de uma app só (`StatusSnapshot`, `TurnSnapshot`, `FactSnapshot`) ficam locais.


# Registro

## [SPEC-0057](specs/SPEC-0057-web-search-tool.md) — Busca na internet por texto livre: Tool `web_search` sobre `SearchPort`, provedor SearXNG sem credencial (2026-08-22)

**Descobrimos que...**

O 1º veto do `architecture-reviewer` (registrado na própria SPEC como D21/D22/D23/D24, "correção do veto V1–V4 da 1ª revisão") pegou uma classe de risco nova para o projeto: com `createWebSearchTool({ search, endpointUrl })`, o host declarado em `requirements` e o host efetivamente requisitado vinham de **duas deps independentes** que só coincidiam por convenção de wiring do composition root — o mesmo `deps.search` injetável que os próprios Critérios de Aceitação exigem tornava possível declarar um host e requisitar outro, sem nada detectar (`requirements` viraria uma asserção sobre estado privado de outro objeto, inédito no repositório). A correção — mover `endpointUrl` para dentro do contrato da `SearchPort` — não bastou sozinha: a SPEC também precisou de um Critério de Aceitação com **caso negativo** (um `SearchPort` fake que declara `endpointUrl` e requisita outro host, provando que o teste de identidade de fato falha nesse caso), porque uma garantia estrutural sem teste que a exercite não é verificável mecanicamente. O mesmo padrão de "correção incompleta" quase se repetiu em D24: a 1ª versão fazia `@atlas/core` repetir `nodeHttpPort({ bodyLimitBytes: SEARCH_BODY_LIMIT_BYTES })` no composition root, criando uma 2ª fonte de verdade para o mesmo número — o próprio D5 desta SPEC ("um lugar só decide timeout/teto/redirect") já continha o argumento que derrubava a própria D24 anterior.

**A arquitetura ajudou porque...**

O molde "porta interna sem 2º consumidor real, IO isolado atrás de função pura" (SPECs 0011/0028/0055/0056) absorveu `SearchPort`/`parseSearchPayload` sem desenho novo — a validação/normalização/dedup/truncagem inteira do payload do SearXNG foi escrita e testada sem tocar rede. O adaptador default falar pelo `HttpPort` já endurecido da SPEC-0055 (D5) significou que "nenhuma credencial pode vazar" seguiu sendo uma propriedade estrutural herdada, não uma promessa nova a reprovar — só o teto de corpo precisou de um parâmetro aditivo (`bodyLimitBytes?`, default inalterado). `AtlasConfig.tools` obrigatório na config resolvida quebrou o `typecheck` dos fakes tipados diretamente (`apps/cli/tests/status.test.ts`) — a 5ª+ ocorrência do mesmo padrão já catalogado em "Padrões Recorrentes", corrigida no mesmo passo previsto pela própria SPEC (item 6 da Estratégia de Implementação).

**A arquitetura atrapalhou porque...**

Nada de estrutural — os quatro comandos da raiz (93 arquivos/1728 testes) e os Critérios de Aceitação passaram sem achado do `spec-validator`; o diff ficou confinado a `packages/tools`, `packages/contracts`, `packages/core`, `apps/cli`, exatamente como a SPEC previu (diff vazio confirmado em `@atlas/runtime`/`@atlas/permissions`/`@atlas/cognitive`/`@atlas/skills`/`@atlas/memory`/`@atlas/context`/`@atlas/persona`/`@atlas/model-gateway`/`apps/desktop`).

**Precisamos mudar...**

Nada de obrigatório para esta fatia. (1) A consulta como canal de saída de dados que o portão não julga (2ª instância do residual 10 da SPEC-0055) e a injeção indireta de prompt amplificada por até 10 resultados de terceiros por busca (residual 11, mitigada de forma genérica pela SPEC-0058 mas não fechada) seguem registradas, sem ação — encaminhamento: já candidatas de ADR próprio desde a SPEC-0055, sem SPEC própria hoje. (2) `apps/desktop` segue sem busca (D15) — mesma decisão de escopo que a SPEC-0055/D17 já tomou para `netRoots` — encaminhamento: candidato nomeado em `NEXT_CONTEXT.md`/`apps/desktop/CLAUDE.md` para uma fatia futura de painel de rede na GUI. (3) O item 1.4 do Roadmap segue **não fechado**: resta só a execução de comandos sob o Permission Service (`ADR primeiro`) — sem mudança aqui, mesmo candidato nomeado desde a SPEC-0028.

## [SPEC-0058](specs/SPEC-0058-untrusted-tool-output-framing.md) — Endurecimento da composição de saídas de Tools no prompt (`@atlas/cognitive`): bloco `<tool_output>`, instrução fixa e teto de tamanho (2026-08-21)

**Descobrimos que...**

O gap não nasceu com esta SPEC: estava em produção desde a SPEC-0055 (`http_get`, `Done` 2026-08-20), e só foi nomeado quando o `architecture-reviewer`, ao aprovar a SPEC-0057 (`web_search`, `Ready`, pausada), marcou a ausência de fronteira de conteúdo não confiável como "a decisão mais cara" daquela fatia — o usuário então pediu explicitamente que esta SPEC fechasse antes de retomar a 0057. Descobrimos também, ao registrar o residual 10 por inteiro (o memo `summarizeSteps` persistido na `Conversation`), que ele é o caminho de maior consequência escondida: `withFreshSystemHead` (SPEC-0021) só substitui a **primeira** mensagem `system` da conversa, então o memo do turno N reentra em **todo** turno seguinte, inclusive na 1ª `generate` (planejamento) do turno N+1 — a mesma classe de risco que D10 usa para justificar cobrir o replanejamento ("proteger a porta e esquecer a janela"), só que aqui a SPEC decidiu deliberadamente não fechar (custo de inflar o histórico permanentemente, ou de o `respond` farejar a `Conversation` atrás de um prefixo de string). E o `spec-validator` confirmou, sem reprovar, duas divergências de precisão entre o texto ilustrativo da SPEC e a implementação (o exemplo "Passo sem saída" mostra bloco vazio sem linha em branco, mas o único caminho de código real produz uma linha em branco; o CA de D11 foi testado com uma fence atravessando a fronteira do corte, não com o texto literal do exemplo, porque o exemplo não discrimina as duas ordens possíveis) — nenhuma delas é arquitetural, mas ambas são exemplos ilustrativos de uma SPEC divergindo do próprio teste que a implementa, não um Critério de Aceitação incompleto.

**A arquitetura ajudou porque...**

O molde consolidado do package (`planner.ts`/`observer.ts`/`learner.ts`: puro, isolado, sem gateway, testável por import direto) absorveu `tool-output.ts` sem desenho novo, mantendo `index.ts` intocado — a superfície pública de `@atlas/cognitive` não cresceu. O precedente "mudança de composição de prompt sem ADR novo" (SPEC-0014, SPEC-0021, SPEC-0026) generalizou de novo (D3): o que mudou é conteúdo de string e número de mensagens `system`, ambos já livres por desenho desde que `Message`/`role` de `@atlas/contracts` saem intactos — nenhum provider do `@atlas/model-gateway` precisou de uma linha.

**A arquitetura atrapalhou porque...**

Nada de estrutural — os quatro comandos da raiz (1636 testes/91 arquivos) e os Critérios de Aceitação passaram sem achado bloqueante do `spec-validator`; o diff ficou contido a `packages/cognitive/{src/tool-output.ts, src/cognitive-core.ts, tests/tool-output.test.ts, tests/cognitive-core.test.ts, tests/conversation.test.ts}`, exatamente como a SPEC previu.

**Precisamos mudar...**

Nada de obrigatório para esta fatia. (1) O residual 10 (memo `summarizeSteps` sem bloco/instrução, persistente entre turnos) segue registrado como caminho não coberto — fechá-lo por inteiro exigiria um canal estrutural de mensagem (`role: 'tool'` em `@atlas/contracts`), decisão arquitetural nova — encaminhamento: candidato de ADR próprio, sem SPEC própria hoje, registrado na SPEC-0058 (residual 10) e em `NEXT_CONTEXT.md`. (2) A metade "exfiltração via URL" do residual do ADR-0026 (SPEC-0055) segue intocada — encaminhamento: já registrado desde a SPEC-0055, sem mudança nesta fatia. (3) A SPEC-0057 (`web_search`, `Ready`) fica desbloqueada para retomada — não é mudança arquitetural, é nota de processo para a próxima sessão decidir.

## [SPEC-0056](specs/SPEC-0056-project-structure-tool.md) — Tool de leitura de estrutura de projeto (`project_info`) em `@atlas/tools`, reusando a descoberta de toplevel da SPEC-0028 (2026-08-20)

**Descobrimos que...**

Reusar a descoberta de raiz da SPEC-0028 por método aditivo (`GitReadPort.toplevel(cwd)`, delegando à `resolveRepository` já existente) funcionou exatamente como o `architecture-reviewer` previu no próprio texto do Roadmap — zero linha de lógica duplicada, só a interface exposta. Descobrimos também que a disciplina de saída determinística que a SPEC-0055/D18 aplicou ao comportamento não-spec de um subprocesso/runtime (`redirect: 'manual'` do undici) se repete aqui num eixo diferente: `resolveRepository` embutia stderr do `git` na mensagem de erro (dependente de versão/locale, não determinístico), e `GitRootError`/`reason` (D12) resolve o mesmo problema — classificar por um campo estruturado em vez de casar/propagar texto de subprocesso — pela segunda vez em duas SPECs consecutivas. E a decisão de design mais consequente da SPEC (D11 — ascensão ao repositório só com `path` omitido) não veio do código, veio de uma pergunta de completude sobre o "Fora do Escopo": sem D11, a própria capacidade prometida ali ("descrever um subprojeto de monorepo") seria impossível de exercitar.

**A arquitetura ajudou porque...**

O molde "porta interna sem 2º consumidor real, método aditivo em vez de porta nova" (D4) generalizou de novo sem desenho — a mesma disciplina já vista em `FsReadPort`/`GitReadPort`/`HttpPort` nas SPECs 0011/0028/0055. O helper único de derivação de alvo (`resolveTargetDirectory`, ex-`resolveGitTarget`) ganhou um 2º consumidor não-git com uma renomeação mecânica de três linhas, em vez de bifurcar em duas implementações da mesma regra de argumento — o mesmo padrão que a SPEC-0055/D4 já tinha justificado para `http_get`. Falha estruturada por passo (ADR-0012) absorveu de graça a degradação de raiz (D3): nenhum caminho de erro do `git.toplevel` precisou de tratamento especial além do `try/catch` que a Tool já teria.

**A arquitetura atrapalhou porque...**

Nada de estrutural — os quatro comandos da raiz e os Critérios de Aceitação passaram sem achado do `spec-validator`. O único atrito foi de precisão de linguagem para a doc viva, e desta vez pego pelo próprio `spec-implementer` antes do fechamento, não pelo gate: duas generalizações que a implementação anterior (SPEC-0028) tornava tentador repetir de cabeça — "duas barreiras, como sempre" (falso quando `path` é explícito: só uma, `evaluate`) e "o portão bloqueia" para `path` inválido (falso: nem `requirements` nem `run` chegam a consultar porta alguma nesse caminho) — mesma classe já catalogada em "Padrões Recorrentes" como garantia em prosa incompleta, agora numa variante nova: o próprio autor da mudança sinalizou o risco ao `spec-closer`, em vez de o gate precisar pegá-lo.

**Precisamos mudar...**

Nada de obrigatório — os nove residuais desta fatia (listagem sem fecho atômico, TOCTOU de diretório-alvo, raiz ancestral só no caminho ascendente, degradação que não revela qual repositório foi recusado, sem teto de tamanho em `readFile`, conteúdo de terceiro no prompt, tabela de manifests parcial, Windows fora de escopo, `path` supérfluo desliga a ascensão) já estão escritos na SPEC e em `packages/tools/CLAUDE.md`, sem exigir ADR ou SPEC própria — são a mesma classe de residual documentado, não fechado, que o ADR-0014/SPEC-0028 já estabeleceram como aceitável. A terceira fatia nomeada do item 1.4 (execução de comandos sob o Permission Service) segue candidata, com dono e classificação (`ADR primeiro`) já registrados desde a SPEC-0028 — sem mudança aqui.

## [SPEC-0055](specs/SPEC-0055-http-get-network-access.md) — Primeiro acesso à internet sob o portão de permissão: Tool `http_get` e o Network Access Gate (ADR-0026) (2026-08-20)

**Descobrimos que...**

Esta é a primeira SPEC do projeto cuja origem é uma escalação de ADR nomeada dentro do próprio fluxo de rascunho: o `spec-drafter`, ao tentar desenhar a Tool, parou porque um host/URL não tem "raiz" a conter — política nova, classe de ameaça sem análogo decidido (SSRF, redirect para host não autorizado, exfiltração) — e o usuário aprovou abrir o ADR-0026 antes de qualquer SPEC (caso 3 da Emenda v1.1). O padrão "escalação → ADR → SPEC" já existia em prosa na Constituição, mas esta é a primeira vez que o Registro tem um exemplo concreto ponta a ponta para citar. Descobrimos também, do lado do gate, que "primeiro acesso à internet" era uma afirmação incorreta por omissão: `@atlas/model-gateway` já faz egress via `fetch` desde a SPEC-0004, sem portão — o 1º veto do `architecture-reviewer` (6 achados) pegou essa imprecisão junto com dois residuais não registrados (exfiltração via query string; injeção indireta pelo corpo remoto) e um comportamento não pinado como dado (`redirect: 'manual'` depende de o undici do Node **divergir deliberadamente** da spec WHATWG, algo que nenhum teste detectaria numa regressão de runtime sem uma guarda de código dedicada, D18). O `spec-validator` reprovou uma vez, na mesma linha (D18): a correção da 1ª rodada alinhou o texto da decisão, mas não a tabela de dado pinado duas linhas abaixo — a mesma classe "correção incompleta no mesmo trecho" que os Padrões Recorrentes já catalogam, agora dentro de uma única SPEC, entre uma decisão e sua tabela de apoio.

**A arquitetura ajudou porque...**

O portão puro/síncrono do ADR-0013 absorveu um `ResourceType` inteiramente novo (`'network'`) sem tocar o Runtime — a mesma garantia que o ADR-0013 já entregava para FS ("`evaluate` roteia por `access`/`resource.type`, o Runtime aplica sem conhecer nenhum dos dois") generalizou de graça para um eixo de política com semântica de comparação totalmente diferente (igualdade exata de hostname, não contenção lexical). O molde de porta injetável interna a `@atlas/tools`, sem 2º consumidor real (SPECs 0011/0012/0013/0015/0028), absorveu `HttpPort` sem desenho novo — inclusive a disciplina de D5 de recusar o `HttpDeps` do Model Gateway como "2º consumidor", porque é um contrato incompatível (POST, headers de auth) sob o mesmo nome de conceito. O helper único de derivação de alvo (`resolveHttpTarget`, D4) fechou por construção o problema que a SPEC-0028 precisou resolver com uma 2ª barreira (`verify` injetado no toplevel do git): aqui não existe distância entre o recurso julgado e o recurso requisitado, porque os dois vêm do mesmo `new URL(args.url).href` — o ADR-0026(b) proibiu expressamente estender `isContained`/TOCTOU a rede, e o desenho não precisou disso.

**A arquitetura atrapalhou porque...**

Nada de estrutural. O único atrito de arquitetura foi de honestidade documental, não de desenho: a versão inicial da SPEC descrevia a fatia como "primeiro acesso à internet" sem qualificar "sob o portão", e ambos os achados de residual (exfiltração via URL, injeção indireta) precisaram ser adicionados explicitamente depois do 1º veto, em vez de terem sido escritos no primeiro rascunho — o mesmo tipo de imprecisão que "Padrões Recorrentes" já cataloga como "garantia em prosa absoluta tende a estar incompleta", agora do lado da **motivação** de uma SPEC, não de um Critério de Aceitação.

**Precisamos mudar...**

(1) A URL como canal de saída de dados que o portão não julga (só o host, nunca o path/query) fica registrada como residual 10, deliberadamente não fechada — fechá-la (restrição de query string, `AccessMode` de saída, ou confirmação por requisição) reabriria o ADR-0026 — encaminhamento: candidato de ADR próprio, registrado na SPEC-0055 e neste Registro; nenhuma ação até um caso real de uso mostrar necessidade. (2) Injeção indireta de prompt pelo corpo remoto (residual 11) — primeira vez que texto de terceiro não confiável entra no prompt de planejamento/composição; mitigação por desenho de prompt (marcar/delimitar conteúdo remoto como não confiável) é candidata de fatia futura, sem marcação nesta — encaminhamento: candidato registrado em `NEXT_CONTEXT.md`, sem ADR necessário a priori (é ajuste de prompt, não de portão). (3) A assimetria `@atlas/model-gateway` × `@atlas/tools` (residual 12) — o Model Gateway segue fazendo egress sem `evaluate`/`netRoots` — fica registrada como fato estrutural permanente, não um bug: levá-lo para dentro do portão é decisão própria (endpoint configurado pelo usuário, não recurso escolhido pelo modelo) — encaminhamento: nenhum, candidato nomeado sem SPEC própria. (4) `apps/desktop` sem painel de rede nesta fatia (D17, residual 8) — repetir todo o desenho de consentimento da SPEC-0038 para o eixo de rede é fatia própria — encaminhamento: candidato registrado em `NEXT_CONTEXT.md`/`apps/desktop/CLAUDE.md`.

## [SPEC-0054](specs/SPEC-0054-desktop-environment-observability.md) — Painel `Sistema` no desktop: recursos do host, consumo de tokens e relógio (2026-08-19)

**Descobrimos que...**

O contrato "resultado do trabalho abandonado é descartado por inteiro" (SPEC-0051) precisava de uma exceção deliberada e nomeada (D9): o consumo de tokens de uma operação cancelada **é** contabilizado — o gasto já ocorreu de fato — enquanto os efeitos de domínio (`remember`/`updateConversation`) continuam descartados. A garantia viva em `apps/desktop/CLAUDE.md` já era precisa o bastante para acomodar isso sem reescrita (ela nomeia os dois efeitos descartados, nunca fala em "resultado inteiro"); só o comentário inline do próprio código ("descartado por inteiro") ficou por trás da nuance nova — não bloqueia nada, mas é o tipo de imprecisão que os Padrões Recorrentes já catalogam do lado da prosa absoluta. Descobrimos também, pela primeira vez desde a SPEC-0053, que acrescentar um painel novo ao drawer v3.0 sem tocar o núcleo/layout **não reabre a pendência de smoke visual**: os 8 itens do CA 34 vieram `OK` numa única passada, sem nenhuma rodada reprovada — diferente do padrão de várias fatias anteriores do desktop.

**A arquitetura ajudou porque...**

O padrão `steps?`/`learned?` (SPECs 0014/0020) generalizou de novo, sem desenho novo: `usage?` em `AskResult`/`ConversationTurn`, somado por um helper puro top-level em `@atlas/cognitive` e devolvido por spread condicional — a 3ª vez que o mesmo molde absorve um campo aditivo de saída do Cognitive. O ADR-0025(c) já tinha antecipado exatamente essa via ("quando o Cognitive Core as expuser"), então a Decisão de design D7 não teve alternativa real a pesar. O molde de porta injetável com import único em `main.ts` (Piper/`whisper.cpp`/VAD) generalizou de novo para `systeminformation` (`system-metrics.ts`) sem desenho novo. As três decisões estruturais de fundo (dependência nova, contabilidade de tokens, contrato técnico exato) já tinham sido resolvidas fora da SPEC pelos ADR-0024/ADR-0025 antes dela começar — a origem registrada da própria SPEC (três escaladas resolvidas em 2026-08-18) preveniu o padrão mais caro já catalogado no projeto: decisão estrutural descoberta em plena implementação.

**A arquitetura atrapalhou porque...**

Nada de estrutural. O único atrito visível foi de precisão de comentário (acima), não de desenho — a fatia inteira (dois módulos novos, dois canais IPC, um painel, três packages tocados aditivamente) fechou sem achado bloqueante do `spec-validator` além do próprio CA 34 (smoke humano), que é estrutural ao ambiente de automação, não a esta SPEC.

**Precisamos mudar...**

Nada de obrigatório — registrado como observação, sem encaminhamento próprio: o comentário inline de `core-bridge.ts` sobre o descarte de operação abandonada ("descartado por inteiro") pode ganhar a mesma precisão que a doc viva já tem na próxima SPEC que tocar aquele trecho, nomeando os dois efeitos descartados em vez da formulação absoluta; não justifica SPEC própria.

---

**Entradas anteriores (SPEC-0053 e mais antigas):** `LESSONS_LEARNED-ARCHIVE.md`.
