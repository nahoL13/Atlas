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
- **Duas fontes independentes da mesma regra de validação/precedência divergem** — SPEC-0055/D4 (`http_get`), SPEC-0057/D21 (`SearchPort`, `endpointUrl` como fonte única), SPEC-0061/D6 (`loadConfig` × `resolveDependencyConfig` sem `trim` no mesmo processo, produzindo "container liga, comando morre com `InvalidConfigError`"). A SPEC-0059 (`composeOverride`) é o contra-exemplo que evita a 3ª/4ª instância ao fazer dry-run e aplicação real chamarem literalmente a mesma função. Ao introduzir uma regra de normalização/validação em mais de um ponto, unifique-a numa função só ou prove que os pontos nunca divergem.

# Registro

## [SPEC-0061](specs/SPEC-0061-search-container-auto-start.md) — Auto-start do container Docker do provedor de busca: extensão aditiva de `ProcessPort`/`createDependencyManager` (CLI + desktop) (2026-09-13)

**Descobrimos que...**

D6 revelou uma variante nova do padrão "duas fontes da mesma regra divergem" (agora catalogado em "Padrões Recorrentes"): diferente das instâncias anteriores (SPEC-0055/D4, SPEC-0057/D21), aqui as duas fontes — `loadConfig` (lança `InvalidConfigError`) e `resolveDependencyConfig` (puro, nunca lança) — convivem no **mesmo processo**, e a divergência (`'  searxng  '` sem `trim` em `loadConfig`) produziria o pior desfecho possível: o container liga (resolvedor aceita) e o comando morre em seguida (`loadConfig` recusa) — efeito colateral sem comando. D9 achou, só no desenho e sem precisar de veto do `architecture-reviewer` desta vez, que `docker inspect` sem `--type container` resolve por herança automática de tipo e poderia confundir o container com uma imagem homônima — outra instância de "garantia em prosa tende a estar incompleta", aqui aplicada a um comando externo em vez de a uma contagem de consumidores. Diferente da SPEC-0060 (1º veto do `architecture-reviewer`, achados A1-A7), esta SPEC não registra rodada de correção de veto bloqueante — só um achado não-bloqueante (spawns de Docker/Ollama sem teto de tempo, fora do escopo dos CA) — sinal de que D6/D9/D11 já anteciparam, no próprio rascunho, a classe de risco que o gate da fatia irmã havia pego.

**A arquitetura ajudou porque...**

O molde "porta injetável com operações nomeadas e fixas, desfecho em união discriminada" (ADR-0027(b)/(c), provado pela SPEC-0060) absorveu a 2ª dependência sem generalizar `ProcessPort` para uma interface parametrizada por `DependencyId` — D2 recusa essa generalização explicitamente por falta de forma comum real entre health-check HTTP+spawn (Ollama) e `docker inspect`/`start`/`stop` (container), uma aplicação nova de "promover só com 2º consumidor real" (ADR-0007): aqui os dois consumidores reais existem, mas não compartilham forma, então a generalização é recusada mesmo assim. `runEnsure` reestruturado para compor um `DependencyOutcome` por dependência (em vez de *early return* de um `DependencyReport` inteiro por ramo) preservou byte a byte o comportamento observável do Ollama (Restrição 11) — os testes existentes do caminho Ollama passaram sem alteração de valores esperados, confirmando que encapsular o desfecho numa união discriminada desde a SPEC-0060 deixou a porta aberta para uma extensão estrutural sem regressão.

**A arquitetura atrapalhou porque...**

Nada de estrutural — os quatro comandos da raiz (1959/1959 testes) e os 39 Critérios de Aceitação passaram sem achado do `spec-validator`; diff confinado aos Arquivos Esperados. O único custo, nomeado e aceito pela própria SPEC: com os dois opt-ins ligados e ambas as dependências fora do ar, o pior caso de bloqueio antes do despacho do comando sobe de ~12s (SPEC-0060) para ~17s — consequência direta do tratamento sequencial (D4), escolhido deliberadamente sobre `Promise.all` para preservar a ordem determinística de chamadas que os testes pinam.

**Precisamos mudar...**

Nada de obrigatório para esta fatia. (1) Esta é a 3ª e última SPEC candidata do [ADR-0027](../06-adr/ADR-0027-external-process-lifecycle-management.md) — o ADR fica inteiramente consumido, nenhuma cláusula (a)–(h) sem implementação — encaminhamento: nenhum, resíduo fechado. (2) Nenhum dos três `spawn` de Docker/Ollama tem teto de tempo (achado não-bloqueante do `architecture-reviewer`, fora do escopo dos CA desta SPEC) — encaminhamento: candidato futuro registrado em `NEXT_CONTEXT.md`, sem SPEC própria. (3) Acesso ao socket do Docker equivale a privilégio elevado no host (Observações da própria SPEC) — mitigado por escopo (três operações fixas) e visibilidade (`atlas status`/stderr/log), não eliminado; mesma classe do resíduo de egress fora de `netRoots` já catalogado desde a SPEC-0055 — encaminhamento: nenhum novo, resíduo de segurança aceito e documentado. (4) O item 1.4 do Roadmap segue não fechado (resta a execução de comandos sob o Permission Service, `ADR primeiro`) — encaminhamento: candidato nomeado desde a SPEC-0028, sem SPEC própria hoje.

## [SPEC-0060](specs/SPEC-0060-ollama-auto-start.md) — Auto-start do Ollama sob opt-in explícito: `createDependencyManager`/`ProcessPort` em `@atlas/core`, CLI + desktop (2026-09-12)

**Descobrimos que...**

O 1º veto do `architecture-reviewer` (achados A1-A7, corrigidos como D22-D25) pegou uma classe de risco que o rascunho original não via porque olhava só "reusar `model.baseUrl`" em isolado: `model.baseUrl` é um campo **compartilhado** pelos providers `local` e `remote`, então derivar `ollamaBaseUrl` dele sem checar o provider efetivo faria `--provider remote --base-url https://api.<terceiro>.com --auto-start-ollama` martelar até 41 requisições HTTP sem credencial contra um host de terceiro que nunca vai rodar Ollama — o mesmo tipo de vazamento por reuso "óbvio demais" de campo compartilhado que o Registro já vê em outras formas (SPEC-0057/D21: duas deps independentes que só coincidiam por convenção). O achado mais consequente (A2/D23) foi estrutural, não de segurança: o desenho inicial condicionava o registro de posse do processo à **prontidão** (health-check verdadeiro), não ao **sucesso do spawn** — um `ollama serve` lento a carregar um modelo grande (>10s) sobreviveria ao `before-quit` como órfão permanente, porque a sessão seguinte o veria como `'already-running'` sem nunca ter registrado que foi ela quem o subiu. A correção (posse no `spawn`, nunca na prontidão) é o tipo de decisão que só aparece quando alguém pergunta "e se o daemon for só lento, não se ele nunca sobe" — a mesma disciplina de "enumerar nominalmente, não generalizar em prosa" que os Padrões Recorrentes já catalogam, aqui aplicada a um eixo temporal (lento × nunca), não de contagem.

**A arquitetura ajudou porque...**

O molde "porta injetável com três operações nomeadas e fixas, nunca `run(command, args)` genérico" (ADR-0027(b), já decidido fora da SPEC) preveniu por construção a tentação de generalizar cedo demais: `ProcessPort` nasceu só com `ollama`, e a 3ª SPEC candidata do próprio ADR-0027 (container SearXNG) vai estender por união discriminada aditiva, não por parâmetro `containerName` morto hoje — mesma disciplina "promover só com 2º consumidor real" (ADR-0007) aplicada a uma porta em vez de um tipo. `resolveDependencyConfig` (molde de `resolveDataDir`, SPEC-0039/D17) absorveu o resolvedor parcial sem desenho novo, e o precedente "campo obrigatório novo em `AtlasConfig` quebra fakes tipados diretamente" (catalogado desde a SPEC-0017, 6ª+ ocorrência) foi precificado corretamente desde o rascunho — `apps/cli/tests/status.test.ts` quebrou exatamente como previsto no passo 1 da Estratégia de Implementação, sem surpresa. O padrão de desfecho como união discriminada com `reason` de conjunto fechado (`stt-engine.ts`, `GitRootError` da SPEC-0056) generalizou de novo para `DependencyOutcome`/`OllamaFailureReason` sem inventar uma 4ª variante de "erro estruturado".

**A arquitetura atrapalhou porque...**

Nada de estrutural — os quatro comandos da raiz (101 arquivos/1865 testes, +93 sobre a baseline de 1772 da SPEC-0059) e os 29 Critérios de Aceitação passaram sem achado bloqueante na 2ª rodada do `spec-validator`. O único custo real, nomeado e aceito pela própria SPEC (não um atrito de arquitetura): o ADR-0027(d) exige o disparo **antes de despachar para qualquer comando**, então comandos que nunca tocam o Model Gateway (`memory list`, `forget`, `skills list`, `status`) pagam até 10 s de bloqueio quando o opt-in está ligado e o Ollama está fora do ar — o preço de "uma única decisão, no bootstrap, sem implicitude por comando" (ADR-0027(g)) é justamente não poder filtrar por comando sem reabrir essa implicitude.

**Precisamos mudar...**

Nada de obrigatório para esta fatia. (1) O desktop segue efetivamente restrito a lançamento por terminal/dev nesta fatia — a única fonte de opt-in é `ATLAS_AUTO_START_OLLAMA`, e um app empacotado aberto por Finder/Dock tipicamente não herda o ambiente do shell (D15/D25) — mesmo precedente da SPEC-0055/D17, fechado depois pela SPEC-0059 — encaminhamento: candidato de painel de rede/dependências nomeado em `NEXT_CONTEXT.md`/`apps/desktop/CLAUDE.md`, sem SPEC própria hoje. (2) Achado N1 da 2ª revisão: com provider `'local'` + `--base-url` apontando para um Ollama remoto legítimo fora do ar, o Atlas ainda sobe um `ollama serve` local inútil (10 s de penalidade) — caso não coberto por D22 (que resolve exfiltração, não este desperdício de latência) — encaminhamento: registrado como candidato futuro, sem ADR necessário a priori, sem SPEC própria hoje. (3) Terceira instância do resíduo de egress não julgado por `evaluate`/`netRoots` da plataforma (Model Gateway desde a SPEC-0004, `http_get`/`web_search` desde a SPEC-0055/0057, agora o health-check do Ollama, D10/ADR-0027(a)) — fica registrada como fato estrutural recorrente, não um bug novo — encaminhamento: já nomeado desde a SPEC-0055 como candidato de consolidação futura, sem SPEC própria. (4) A 3ª SPEC candidata do ADR-0027 (auto-start do container SearXNG) fica desbloqueada — a unidade, a porta e o formato de desfecho que ela vai estender já existem — encaminhamento: candidato nomeado em `NEXT_CONTEXT.md`, sem SPEC própria ainda.

## [SPEC-0059](specs/SPEC-0059-desktop-network-search-gui.md) — Desktop: painel de rede e busca (`netRoots`/`tools.searchUrl`) pela interface gráfica (2026-08-22)

**Descobrimos que...**

Dois gestos de aplicação de política independentes no mesmo `core-bridge` (`selectPermissionRoots` da SPEC-0038, `selectNetworkAccess` novo) criam uma classe de risco que nenhum dos dois sozinho tinha: dois diálogos nativos de consentimento empilhados, cada um descrevendo uma concessão diferente, é exatamente a condição em que um "OK" pode ser dado para a concessão errada (Artigo 8) — e `hasInFlightOperation()` (registro único da SPEC-0051) não enxerga nenhum dos dois, porque só conta `'ask'`/`'chat-turn'`/`'open-session'`. A correção (D16, mutex de módulo compartilhado, liberado em `finally`) é pequena, mas o gate cobrou prova das **três** combinações (rede×rede, FS×FS, rede×FS cruzada) — a mesma disciplina que os Padrões Recorrentes já catalogam ("N consumidores"/"toda função que X" tende a estar incompleta), agora sobre reentrância concorrente em vez de contagem de chamadores. Descobrimos também, do lado do rascunho de UI, que "recarregar do status em qualquer rejeição" (o molde da SPEC-0038) deixa de ser a escolha certa quando a lista típica tem várias entradas digitadas à mão: D17 preserva o rascunho de rede em qualquer rejeição e move o "em vigor" para uma linha própria — uma assimetria deliberada com o bloco de FS, registrada e não retroaplicada (mudar o bloco de FS é candidato futuro fora desta fatia). O gate confirmou como achado crítico (A1) que `loadStatus()` precisa nunca resetar o rascunho de rede — só `#network-inforce` — separação que a implementação já tinha, mas que exigiu verificação explícita linha a linha contra o código, não só contra os testes.

**A arquitetura ajudou porque...**

O molde de consentimento de política da SPEC-0038 (tudo-ou-nada, rechecagem A7, encerramento de sessões vivas, seleção não durável) absorveu o eixo de rede inteiro sem desenho novo — só a guarda de mutex nova (D16), que não alterou nenhum desfecho já coberto por teste em `selectPermissionRoots`. A origem única de composição de `AtlasConfigOverride` (`composeOverride`, D5/D9) evitou a 3ª instância do padrão "segunda fonte da mesma regra de precedência" que este Registro já cataloga (SPEC-0055/D4, SPEC-0057/D21): o dry-run de validação e a aplicação real usam literalmente a mesma função, então uma divergência silenciosa entre o que se valida e o que se aplica é estruturalmente impossível, não só testada. `ResourceRef`/`netRoots` (ADR-0026, SPEC-0055) e `tools.searchUrl` (SPEC-0057) chegaram prontos o bastante para esta fatia não tocar `packages/*` em nenhuma linha — a promessa de escopo das duas SPECs anteriores ("painel de rede/busca na GUI é fatia própria") se provou exata.

**A arquitetura atrapalhou porque...**

Nada de estrutural — os quatro comandos da raiz (1772 testes/96 arquivos) e os Critérios de Aceitação passaram sem achado bloqueante do `spec-validator`, incluindo a fiação crítica A1 e as três baterias de mutex D16; diff confinado a `apps/desktop/**` + a nota de atualização no ADR-0026 + a própria SPEC, exatamente como previsto. O único custo visível foi de escala: a SPEC soma 18 decisões de design (D1–D18), a maior contagem deste Registro até aqui para uma fatia de UI — reflexo direto de reabrir conscientemente duas decisões de escopo (SPEC-0055/D17, SPEC-0057/D15) sobre uma superfície com quatro portas fail-closed concorrentes.

**Precisamos mudar...**

Nada de obrigatório para esta fatia. (1) Smoke manual em janela real segue **não executado** neste ambiente (sem WindowServer) — mesma pendência estrutural já registrada em `apps/desktop/CLAUDE.md` para outras fatias visuais/de voz do desktop — encaminhamento: nenhuma ação possível agora; confirmação humana futura, registrado em `NEXT_CONTEXT.md`. (2) O residual "diálogo fantasma" (nenhum dos quatro diálogos nativos tem `BrowserWindow` pai) fica **ampliado**, não agravado por mau desenho: com o mutex de D16, um diálogo perdido atrás da janela agora trava as duas aplicações de política, não mais só uma — candidato já nomeado (diálogos modais com `BrowserWindow` pai), sem SPEC própria. (3) O texto do diálogo de consentimento de rede (D18) enumera nominalmente `http_get`/`web_search`; quando uma 3ª Tool de rede for criada, esse texto fica desatualizado sem gate mecânico que force a atualização (diferente do gate de paridade renderer↔módulo) — encaminhamento: candidato registrado na própria SPEC (Observações), revisar o texto manualmente na SPEC que criar a 3ª Tool de rede. (4) Esta SPEC é a primeira das três nomeadas pelo [ADR-0027](../06-adr/ADR-0027-external-process-lifecycle-management.md) (novo, Accepted nesta mesma sessão) — auto-start do Ollama e do container SearXNG seguem candidatos, o segundo só com efeito prático no desktop agora que esta fatia entregou o painel de rede — encaminhamento: candidatos nomeados em `NEXT_CONTEXT.md`, sem SPEC própria ainda.

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

---

**Entradas anteriores (SPEC-0056 e mais antigas):** `LESSONS_LEARNED-ARCHIVE.md`.
