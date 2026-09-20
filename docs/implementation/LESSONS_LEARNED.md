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

**Escopo deste arquivo:** o Registro abaixo mantém as **últimas 5 SPECs fechadas**. As entradas mais antigas estão em `LESSONS_LEARNED-ARCHIVE.md`, preservadas sem edição (regra 2 intacta — nada é reescrito, só realocado).

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
- **Pedido de usuário que nega frontalmente uma cláusula de ADR existente exige supersessão parcial documentada, nunca uma política solta** — SPEC-0062 (pedido "Atlas sempre sobe o Ollama sozinho, é um app pra todos" contradizia a cláusula (g) do ADR-0027, opt-in explícito, e essa mesma alternativa já tinha sido rejeitada pelo próprio usuário no brainstorming daquele ADR). O `spec-drafter` escalou sem redigir nada, o usuário abriu o ADR-0028 antes de qualquer SPEC (caso 3 da Emenda v1.1), e a supersessão foi restrita por escopo (só `apps/desktop`, só Ollama) — o container de busca manteve a cláusula (g) intacta, ganhando só uma 2ª porta de entrada. Primeiro exemplo ponta a ponta do Registro de "pedido de usuário → escalação → ADR de supersessão parcial → SPEC", distinto do padrão já catalogado "escalação → ADR → SPEC" da SPEC-0055 (lá a lacuna era arquitetural — host sem "raiz" —, aqui é uma contradição direta com uma decisão humana já tomada).

# Registro

## [SPEC-0063](specs/SPEC-0063-desktop-model-provisioning.md) — Instalação assistida de modelo Ollama no desktop, implementando o ADR-0029 (2026-09-20)

**Descobrimos que...**

O 1º veto do `architecture-reviewer` (B1–B5) pegou uma corrida de arranque real, não hipotética: a leitura de "quais modelos estão instalados" quase sempre corria **antes** de `ensureExternalDependencies()` assentar, e o fail-closed corretamente não abria a tela — tornando o gatilho proativo **inerte no único cenário que a SPEC existe para resolver** (Ollama desligado, nenhum modelo, auto-start ligado por repouso desde a SPEC-0062). A correção trocou um probe binário por um probe de três estados (`pending`/`unknown`/`known`) mais um *deferred* do próprio bootstrap, sem timer nem canal de push novo — resolvendo por **espera sobre trabalho já em curso**, não por polling adicional. Os outros quatro achados (B2–B5) formam uma família só: duas fontes decidindo o mesmo estado de interface divergem sob concorrência (`'busy'` sobrescrevendo o progresso de um download real; tick periódico e flag de gesto disputando `disabled`/`hidden`) — a mesma classe "duas fontes da mesma regra divergem" já catalogada em Padrões Recorrentes, aqui aplicada a **estado de UI sob tick concorrente**, não a validação/config. O `spec-validator` pegou, na 1ª rodada, um CA sem teste dedicado (`'busy'` pintando corretamente em produção, mas sem prova) — instância direta do padrão "garantia em prosa tende a estar incompleta".

**A arquitetura ajudou porque...**

A porta com operações nomeadas e fixas (ADR-0027(b), provada pelas SPECs 0060/0061/0062) absorveu `pullOllamaModel`/`cancelOllamaModelPull` como mais duas operações sem exigir generalização nem um `run(command, args)` genérico — a mesma disciplina "promover só com necessidade real" que já rejeitou parametrizar `ProcessPort` por `DependencyId` na SPEC-0061. O campo opcional `models?`, estrutural só nas variantes `'already-running'`/`'started'` (garantido por `@ts-expect-error`, não por disciplina de escrita), estendeu `DependencyOutcome` sem tocar `DependencyReport` nem o texto já pinado de `#system-dependencies` — união discriminada por desfecho segue absorvendo extensão sem regressão, quarta vez que esse molde se prova (SPECs 0060/0061/0062/0063). O molde "fonte única de estado de controles" (`refreshAskControls()`/`refreshChatControlsForMic()`) generalizou de novo para `refreshModelControls()` sem desenho novo — só precisou da disciplina de nomeá-la explicitamente como a única escritora de `disabled`/`hidden`.

**A arquitetura atrapalhou porque...**

Nada de estrutural — os quatro comandos da raiz (105 arquivos/2158 testes) e os 58 Critérios de Aceitação passaram sem achado bloqueante na 2ª rodada do `architecture-reviewer` nem na 2ª do `spec-validator`. O único custo real foi a extensão da fiação de arranque: inverter a ordem de `ensureExternalDependencies()`/`createWindow()` dentro de `app.whenReady()` (item 6.1) tocou um caminho que nenhuma das SPECs 0059–0062 havia precisado reordenar, e exigiu prova explícita de que a inversão não atrasa a abertura da janela (CA 55).

**Precisamos mudar...**

Nada de obrigatório para esta fatia. (1) "Modelo instalado ≠ modelo configurado em `AtlasConfig.model.model`" fica registrado como candidato forte de SPEC futura — instalar algo diferente do default não atualiza a config, então a conversa pode continuar falhando por modelo ausente; exigiria ADR (configuração em runtime) — encaminhamento: candidato nomeado em `NEXT_CONTEXT.md`. (2) O download de modelo soma-se, sem teto de tempo, aos `spawn`/`docker start` já registrados como achado aberto desde a SPEC-0061 — mesma classe, ainda sem fatia própria — encaminhamento: nenhum novo, candidato já nomeado estendido. (3) O guarda de nome de modelo no Core é sintático, não estrutural (`a/../../x` passa no regex) — não é vulnerabilidade hoje (o nome só chega ao campo `name` de um corpo JSON, nunca a um caminho/argv, CA 54), mas fica registrado para um chamador público futuro de `pullOllamaModel` — encaminhamento: nenhum, residual nomeado na própria SPEC (Observações, item 15). (4) `apps/desktop/CLAUDE.md` segue acima do teto de ~15 KB nomeado desde 2026-07-30 e já registrado como candidato de poda pela SPEC-0062 — esta fatia seguiu o mesmo precedente (acrescentou seção nova em vez de podar, reestruturação é esforço próprio fora do escopo de um fechamento) — encaminhamento: nenhum novo, candidato já registrado, ainda sem dono. (5) O `CLAUDE.md` raiz tinha o bullet **Desktop** desatualizado — o cabeçalho já listava as SPECs 0061/0062, mas a prosa parava na SPEC-0060, um gap de duas fatias que nenhum `spec-closer` anterior fechou; corrigido nesta sessão junto com a adição da SPEC-0063 — encaminhamento: nenhum, achado corrigido no próprio fechamento.

## [SPEC-0062](specs/SPEC-0062-desktop-dependency-autostart-default.md) — Auto-start sempre-ativo do Ollama no desktop + campo de container de busca pela GUI, implementando o ADR-0028 (2026-09-19)

**Descobrimos que...**

A origem desta SPEC é o primeiro exemplo ponta a ponta do Registro de "pedido de usuário que nega uma cláusula de ADR existente" (agora catalogado em "Padrões Recorrentes"): o `spec-drafter`, na 1ª tentativa, escalou sem redigir nada porque "sempre automático, sem flag" contradizia frontalmente a cláusula (g) do ADR-0027 (opt-in explícito, fail-closed) — e essa mesma alternativa já tinha sido explicitamente rejeitada pelo próprio usuário no brainstorming do ADR-0027 original, o que tornou a escalação ainda mais nítida (não era uma lacuna nova, era uma reversão de decisão já tomada). O `architecture-reviewer` precisou de duas rodadas no gate Draft → Ready: o 1º veto pegou um contrato do ADR-0028(ii) implementado por **mecanismo** em vez de **efeito** (o rascunho inicial fazia o campo novo popular `AtlasConfig.dependencies.autoStartSearchContainer`, que seria inerte — `ensure` já assentou em `app.whenReady()`, memoizado por instância desde a SPEC-0060/D18), um container que ficaria órfão se a janela fechasse com um gesto de GUI ainda em polling (a mesma classe de risco que a SPEC-0060/D23 já tinha resolvido para o `spawn` do Ollama, aqui reencontrada num eixo novo — desligamento concorrente com trabalho em voo), e um Critério de Aceitação contraditório com o próprio texto da SPEC. A implementação em si sofreu três interrupções de infraestrutura (rate limit da API, dois stalls de 600s) — uma instância travada do Electron rodando há quase 6 dias no host foi identificada como possível causa de contenção de recursos, um lembrete de que nem toda instabilidade de sessão é do pipeline de SPEC.

**A arquitetura ajudou porque...**

O molde "porta injetável com operações nomeadas e fixas, extensão aditiva sobre 2º consumidor real" (ADR-0027(b)/(c), já provado pelas SPECs 0060/0061) absorveu um 3º método (`ensureSearchContainer(container: string)`) sem exigir uma porta nova nem uma interface parametrizada — o mesmo caminho privado (`inspect`→`start`→polling) que o `ensure` de bootstrap já usava foi reutilizado por delegação direta, então "nenhuma lógica duplicada" (CA 6) não exigiu desenho novo, só uma renomeação mecânica do helper privado. A generalização de posse de campo único para `Set<string>` (D11) e de `release()` para drenar trabalho em voo antes de ler a posse (D21) estenderam, sem quebrar, a garantia "posse registrada no sucesso do `start`, nunca na prontidão" que a SPEC-0060/D23 já tinha estabelecido — a mesma disciplina aplicada a um eixo novo (múltiplas posses concorrentes, não só uma). O precedente da Emenda v1.1 (caso 3, escalação de ADR) absorveu a origem incomum desta SPEC sem processo novo: abrir o ADR-0028 antes de qualquer rascunho técnico foi mecânico, não uma exceção.

**A arquitetura atrapalhou porque...**

Nada de estrutural no desenho — os quatro comandos da raiz (102 arquivos/2039 testes) e os 47 Critérios de Aceitação passaram sem achado do `spec-validator`, incluindo os três pontos que causaram veto na revisão Draft → Ready (mecanismo vs. efeito do ADR-0028(ii), drenagem em `release()`, `searchContainers` como lista). O único custo real foi de infraestrutura de sessão, não de arquitetura: três interrupções (rate limit + dois stalls de 600s) alongaram o fechamento desta fatia além do padrão das SPECs irmãs (0059/0060/0061), sem nenhuma delas ter produzido achado técnico.

**Precisamos mudar...**

Nada de obrigatório para esta fatia. (1) O padrão "pedido de usuário nega cláusula de ADR existente" fica catalogado em "Padrões Recorrentes" — encaminhamento: nenhum novo, já registrado nesta entrada. (2) Nenhum dos `spawn`/`docker start` ganhou teto de tempo nesta SPEC (achado não-bloqueante já registrado desde a SPEC-0061, segue sem SPEC própria) — encaminhamento: candidato nomeado em `NEXT_CONTEXT.md`, sem mudança aqui. (3) O item 1.4 do Roadmap segue não fechado (resta a execução de comandos sob o Permission Service, `ADR primeiro`) — encaminhamento: candidato nomeado desde a SPEC-0028, sem SPEC própria hoje. (4) `apps/desktop/CLAUDE.md` já estava, antes desta SPEC, bem acima do teto de ~15 KB nomeado pela disciplina de contexto de 2026-07-30 (medido em ~70 KB) — esta SPEC seguiu o precedente e acrescentou conteúdo em vez de podar, porque uma reestruturação do arquivo é um esforço próprio, fora do escopo de um fechamento — encaminhamento: candidato de poda/reestruturação, registrado aqui pela primeira vez com medição concreta; sem SPEC própria hoje, mas o fio principal deveria priorizá-lo antes que o arquivo continue dominando o custo de contexto de todo agente que tocar `apps/desktop`.

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

---

**Entradas anteriores (SPEC-0057 e mais antigas):** `LESSONS_LEARNED-ARCHIVE.md`.
