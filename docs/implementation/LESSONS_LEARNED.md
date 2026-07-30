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

**Escopo deste arquivo:** o Registro abaixo mantém as **últimas 5 SPECs**. As entradas da SPEC-0036 e anteriores estão em `LESSONS_LEARNED-ARCHIVE.md`, preservadas sem edição (regra 2 intacta — nada é reescrito, só realocado).

O corte existe porque este arquivo chegou a 157 KB (~39k tokens) e era relido no arranque de quase todo subagent, dominando o custo em tokens do pipeline. Ao fechar uma SPEC: adicione a entrada nova no topo do Registro e mova a mais antiga das 6 para o arquivo.

---

# Padrões Recorrentes

Lições que se repetiram em três ou mais SPECs. Este índice existe para sobreviver ao corte acima — consulte o arquivo para o caso concreto de cada uma.

- **Correção de bloqueante introduz bloqueante novo no mesmo caminho de código** — SPEC-0034, 0038, 0039. Ao corrigir um veto do gate, re-examine o caminho inteiro, não só a linha apontada.
- **Garantia em prosa absoluta tende a estar incompleta** — SPEC-0038 (A1/A2 → A6/A7). "Toda função que X" quase sempre esquece um caso; enumere ou restrinja a formulação.
- **Duplicação deliberada renderer↔módulo** — SPEC-0035, 0036, 0039, 0040, 0041 (6 ocorrências). `renderer.js` é `<script>` clássico sem bundler (ADR-0019) e não pode importar o módulo TS em runtime; a réplica em JS puro é consciente e leva comentário apontando o teste de referência.
- **Campo obrigatório novo em `Deps` exige grep pelo nome da função construtora** (`createRuntime(`, `createPermissionService(`) em **todo o repo** — repetido 8× até a SPEC-0013.
- **Membro obrigatório novo numa interface de contrato não é pego por esse grep** — busque pelo **nome do tipo** (`git grep 'PermissionService'`), que acha fakes e implementações diretas nos testes (quebrou o typecheck na SPEC-0017).
- **`vitest run` não faz typecheck** (esbuild só remove tipos) — um passo TDD "RED" que depende de erro de *tipo* só falha de verdade em `pnpm --filter <pkg> typecheck`.
- **Smoke visual das fatias desktop nunca confirmado** — SPEC-0031 a 0041, 11 seguidas. O shell de automação não tem WindowServer. Não bloqueia fechamento documental, mas não conte como verificado.
- **Contrato só sobe a `@atlas/contracts` com 2º consumidor real**, via ADR (ADR-0007). Tipos de uma app só (`StatusSnapshot`, `TurnSnapshot`, `FactSnapshot`) ficam locais.


# Registro

## [SPEC-0041](specs/SPEC-0041-desktop-piper-only-voice-surface.md) — Desktop: superfície de voz Piper-only, revertendo a precedência da SPEC-0040/D8 sem tocar o fallback fail-closed (2026-07-29)

**Descobrimos que...**

Reverter deliberadamente uma decisão `Accepted` anterior (a precedência do ADR-0020(b)/D8 da SPEC-0040) é um processo bem mais caro em gate do que uma fatia aditiva comum: esta SPEC levou 3 rodadas do `architecture-reviewer`, com 2 vetos consecutivos. O 1º veto (A1-A5) pegou exatamente o mesmo defeito já registrado como achado A2 na SPEC-0035 ("nunca ativo-porém-mudo") ressurgindo por um caminho novo — condicionar o modo Piper-only só à lista de modelos em disco criaria um "Testar voz" habilitado-porém-mudo em máquinas com modelos mas sem o binário; a correção (condicionar a `PiperTts.isAvailable()` real via IPC) generalizou a lição sem redesenho. O 2º veto (B1) foi de outra natureza — não um defeito de comportamento, mas uma **afirmação textual imprecisa** na própria SPEC (dizer que `isAvailable()` detecta binário "quebrado" quando na verdade só verifica presença do arquivo + catálogo não vazio); esse veto escalou ao usuário (2ª reprovação, Emenda v1.1), que decidiu explicitamente aceitar o residual conhecido (binário presente-mas-inexecutável deixa "Testar voz" mudo) em vez de pedir uma sonda ativa — a primeira vez neste projeto em que uma escalação de 2º veto se resolveu por honestidade textual (declarar o limite) em vez de por mudança de código.

**A arquitetura ajudou porque...**

A separação D4 (política nova como camada **antes** de `resolveVoiceBackend`, não como edição da cadeia D8) permitiu reverter um efeito observável de peso — Piper à frente de qualquer preferência de SO persistida — sem invalidar nenhum teste existente da SPEC-0035/0036/0039/0040 nem tocar o mecanismo de resiliência do ADR-0021(c); o diff de `speech-output.ts` é só adição (`isPiperOnlyMode`/`piperOnlyPreference`), confirmando por diff o próprio Critério de Aceitação 6. A disciplina de "declare o limite, não finja cobri-lo" (D3/D11, honestidade sobre o que `isAvailable()` prova) transformou o 2º veto de um bloqueio recorrente em uma correção textual de uma sessão — a mesma arquitetura que gerou o achado (checagem de presença, não de execução) já vinha com o vocabulário certo para descrevê-lo sem ambiguidade.

**A arquitetura atrapalhou porque...**

Nada de estrutural atrapalhou. O atrito ficou em precisão de linguagem na própria SPEC (B1) — descrever com exatidão o que uma checagem de disponibilidade prova é mais difícil do que parece quando o efeito prático (evitar o estado "ativo-porém-mudo") é real na maioria dos casos, mas não em todos.

**Precisamos mudar...**

Dois achados não-bloqueantes ficaram registrados nas Observações da própria SPEC-0041 como candidatos a fatia futura, não resolvidos aqui: (1) apagamento silencioso de uma `voiceURI` Piper persistida no modo degradado (assimetria com o aviso D6, que só cobre voz de SO legada) — encaminhamento: nova SPEC futura de aviso simétrico "Piper órfão", quando a linha de voz for revisitada; (2) a deriva pré-existente do `createSpeechOutputGlue({ synth })` no renderer sem `preferredVoiceURI` (desde a SPEC-0035, reafirmada nas SPECs 0036/0039/0040/0041) segue sem correção — encaminhamento: já registrado como candidato a fatia futura desde a SPEC-0035; nenhuma SPEC de voz nova deveria fechar sem reavaliar se é hora de pagar essa dívida.

## [SPEC-0040](specs/SPEC-0040-desktop-piper-neural-tts.md) — Desktop: Piper como motor de TTS neural local, com processo de longa duração e fallback fail-closed para a Web Speech API (2026-07-29)

**Descobrimos que...**

Pinar o contrato técnico de um binário externo **como dado da SPEC** (D4/D13, derivado de documentação/código lidos sem executar o binário) funciona bem quando a suíte de testes é honesta sobre o que ela realmente prova: nenhum dos 47 casos novos de `piper-tts.test.ts` toca o Piper real, então o gate mecânico (lint/typecheck/test) fecha a SPEC inteira sem nunca confirmar se o contrato pinado (argv, framing por linha, sinal de conclusão) bate com o binário v1.2.0 de verdade — daí o Critério de Aceitação 25 existir como categoria própria, fora do que o `spec-validator`/`spec-closer` pode fechar. Também descobrimos, de novo (5ª ocorrência desde a SPEC-0035), que a duplicação deliberada do roteamento de voz entre `speech-output.ts` (módulo puro, testável) e `renderer.js` (`<script>` clássico sem bundler, ADR-0019) segue sendo o único jeito de reusar essa lógica sem introduzir build no renderer — o padrão está estável, mas o risco de deriva entre as duas cópias cresce a cada fatia que mexe em roteamento de voz.

**A arquitetura ajudou porque...**

O molde de subprocesso injetável de `packages/tools/src/git-port.ts` (SPEC-0028) generalizou quase sem ajuste para um caso bem mais exigente — processo de **longa duração** com reciclagem condicional (troca de modelo, timeout, cancelamento), em vez de um subprocesso descartável por chamada. A separação D16 (`resolveVoiceBackend` decide só a origem; `createSpeechOutput` continua o único resolvedor autoritativo de voz do SO) evitou introduzir uma segunda implementação concorrente da mesma regra de seleção de voz local — e o critério 20 (teste de concordância entre as duas resoluções) fechou por construção o risco de as duas divergirem silenciosamente no futuro, em vez de confiar em "elas deveriam bater" em prosa. A regra de omissão mínima de D13 (nenhum campo opcional ausente descarta um modelo) evitou por desenho o modo de falha mais perigoso da fatia: catálogo sempre vazio numa máquina real com suíte 100% verde contra fakes.

**A arquitetura atrapalhou porque...**

Nada de estrutural atrapalhou; o atrito ficou inteiro em mecânica de TypeScript/teste, não em desenho: `noUncheckedIndexedAccess` exigiu tratamento explícito de `array[i]` como `T | undefined` em `piper-tts.ts` e nos testes (recorrência do mesmo tipo de atrito mecânico já visto em SPECs anteriores com esse flag), e a porta `PiperFsPort` fake sendo assíncrona por design (Promises reais, para espelhar IO real) exigiu um helper `flushMicrotasks()` para os testes observarem o ponto exato em que `synthesize` chega ao `spawn`/`writeLine` síncronos — nenhuma das duas interfaces da SPEC previa esse detalhe de engenharia de teste.

**Precisamos mudar...**

Dois pontos de resolução de implementação não estavam especificados literalmente nas "Interfaces Necessárias" da SPEC-0040 — a resolução do `defaultPiperVoiceURI` (D9: `pt_BR-faber-medium` se instalado, senão o primeiro por ordem de `id`) e o layout do diretório interno de modelos (`voices/` dentro do diretório Piper) — e precisaram de decisão do `spec-implementer` documentada em código/README em vez de na SPEC. Isoladamente não vale um ADR nem uma SPEC nova; encaminhamento: se um padrão semelhante ("resolução de default não especificada literalmente na SPEC, decidida ad hoc na implementação") se repetir numa próxima SPEC de motor/subprocesso, revisar o template de SPEC (`docs/implementation/templates/SPEC-TEMPLATE.md`) para exigir uma subseção explícita de "defaults e layout interno" nas Interfaces Necessárias.

## [SPEC-0039](specs/SPEC-0039-desktop-persona-authoring.md) — Desktop: CRUD de Personas custom pela interface gráfica, com voz real vinculada (2026-07-29)

**Descobrimos que...**

Corrigir um bloqueante do gate **dentro do mesmo caminho de código** que ele mesmo tocou pode introduzir um bloqueante novo, exatamente o padrão já registrado nas lições das SPECs 0034 e 0038 ("garantia em prosa absoluta tende a estar incompleta"). Aqui a variante foi mais séria: a correção do 1º veto (A1 — derivar o caminho do arquivo de Personas do `configOverride` efetivo, via `loadConfig(withSelections(cfg))`) criou um **deadlock circular** (B1) — `loadConfig` valida `persona` contra `PERSONA_IDS`, e `withSelections` injeta a Persona selecionada no override; assim que o usuário selecionasse **qualquer** Persona custom (o cenário central desta própria SPEC), toda função de Persona do bridge passaria a lançar `InvalidConfigError` antes de qualquer trabalho útil — a app ficaria inutilizável logo depois de a feature ser usada pela primeira vez. Foi o **2º veto consecutivo** do `architecture-reviewer` nesta SPEC (a Emenda v1.1 prevê escalação ao usuário na 2ª reprovação), e a via de correção (extrair `resolveDataDir` sem validar `persona`, D17) foi decidida pelo usuário, não pelo `spec-drafter` sozinho — a primeira vez que esse ramo específico da Emenda v1.1 (escalação por 2º veto, com decisão de arquitetura do usuário no meio do processo de SPEC) foi exercitado neste projeto.

**A arquitetura ajudou porque...**

O molde do Memory Service (ADR-0011) generalizou de novo, quase sem ajuste, para o Persona Service: porta `PersonaStorage` interna ao package (não sobe a `@atlas/contracts`), `createFilePersonaStorage` como adapter default **não injetado** por padrão em `createAtlas`, e a mesma garantia "sem storage, comportamento idêntico a hoje, byte a byte" — provada por teste e confirmada pelo diff vazio de `apps/cli`. A separação `resolveDataDir`/`personaStoragePath` (D17) também deixou um precedente reutilizável: "achar onde um dado mora" e "validar se esse dado é o efetivamente ativo" são preocupações independentes por natureza, e um resolvedor puro que só cobre a primeira evita qualquer futura porta de storage repetir o mesmo ciclo. A guarda por Persona **efetiva** (`selectedPersonaId() ?? config.persona`, não só a seleção em memória) fechou um buraco que só existia "por acidente" hoje — evidência de que testar contra o comportamento futuro nomeado (persistir seleção, honrar `ATLAS_PERSONA`) já registrado nas Observações da SPEC-0037 valeu a pena.

**A arquitetura atrapalhou porque...**

O acoplamento entre "resolver `dataDir`" e "validar `persona`" dentro de um único `loadConfig` não era visível até uma SPEC precisar resolver o primeiro **sem** o segundo — `loadConfig` sempre fez as duas coisas juntas porque nunca havia um consumidor que precisasse só de uma. A correção exigiu extrair uma nova função pura e testar a **equivalência** entre as duas precedências (`resolveDataDir(override) === loadConfig(override).dataDir`) para provar que a extração não introduziu uma segunda fonte de verdade — custo de teste que não existiria se as duas responsabilidades já tivessem nascido separadas.

**Precisamos mudar...**

Nada de estrutural além do que esta própria SPEC já decidiu (D17) e do que este fechamento já propaga: a leitura "o Artigo 11 cobre conhecimento persistente, não configuração de identidade criada explicitamente pelo usuário" (Observação A8 da SPEC) precisa sobreviver além do texto da SPEC — encaminhamento: registrada nesta sessão de fechamento em `docs/05-context/PLATFORM_STATE.md` e em `packages/persona/CLAUDE.md`, para que a próxima SPEC que precise persistir algo não-conhecimento a encontre sem reabrir a discussão. Um segundo encaminhamento, não desta SPEC: se uma 3ª ocorrência do padrão "correção de bloqueante introduz bloqueante novo no mesmo caminho de código" aparecer num gate futuro, vale considerar registrar esse padrão explicitamente no processo do `architecture-reviewer` (`docs/04-engineering/ClaudeCodeAutomation.md`) como um item de checklist — ainda não justificado com só 3 ocorrências (0034, 0038, 0039), mas já é uma recorrência a observar.

## [SPEC-0038](specs/SPEC-0038-desktop-permission-roots-gui.md) — Desktop: configuração de permissões (`readRoots`/`writeRoots`) pela interface gráfica (2026-07-28)

**Descobrimos que...**

O mesmo tipo de bloqueante apareceu **duas vezes seguidas no mesmo gate**, em rodadas diferentes: uma garantia escrita em prosa absoluta ("nenhum Core segue rodando sob política superada", "todas as funções que sobem o Core") tende a ser falsa porque a enumeração no código estava incompleta, não porque a intenção estivesse errada. No 1º veto, `resolveAskSnapshot` subia um Core próprio que não entrava em nenhum rastreio de operação em voo (A1) — um `ask` em voo sobreviveria a uma revogação de `writeRoot` aplicada no meio da execução. Corrigido pela D10, a aprovação condicional da 2ª rodada revelou o **mesmo padrão numa segunda função**: `openChatSession` também sobe um Core (e `await createAtlas(...)` antes de registrar em `chatSessions`), escapando do rastreio por uma janela ainda maior que a de A1 (A6). A lição operacional: numa fatia de segurança, a verificação certa é varrer o arquivo inteiro atrás de **todos** os pontos que sobem um Core capaz de executar Tools — não confiar na lista que a própria SPEC enumera, porque é exatamente aí que a lista costuma estar incompleta. A formulação final adotada no `apps/desktop/CLAUDE.md` já reflete essa cautela: não "toda função que sobe o Core", mas "toda função que sobe um Core **capaz de executar Tools**" (`resolveStatusSnapshot`/`resolveMemorySnapshot`/`forgetFact` ficam deliberadamente de fora, e isso está documentado como decisão, não omissão). O par A7/A2 mostrou uma variante do mesmo problema num eixo diferente: a checagem de "operação em voo" ficava **antes** do diálogo de consentimento (que não é modal à janela e pode esperar o usuário indefinidamente), abrindo uma corrida em que uma operação nova começava durante a espera do diálogo — corrigido rechecando a condição **imediatamente antes de aplicar** (A7), o mesmo tipo de "verificar de novo no momento exato de agir, não só no início" que o A10/D10 já tinha estabelecido para o `ask`.

**A arquitetura ajudou porque...**

O estado de módulo do `core-bridge` (molde herdado da SPEC-0037, `busySessions`/seleção corrente) generalizou de imediato para um segundo rastreio (`inFlightOperations`) e para uma segunda seleção (`PermissionRoots`), via o helper `withSelections` — a mesma fronteira Core/renderer que absorveu Persona em runtime absorveu permissões sem tocar `@atlas/contracts`/`@atlas/core`/`@atlas/permissions`, a 8ª fatia visual seguida (SPECs 0031-0038) a confirmar isso. Separar o `GrantConfirmPort` de política do `ConfirmPort` de ação pontual do Runtime (D11) — em vez de reusar o adapter existente — evidenciou, ao ser cobrado pelo A2, que o **texto** de um adapter de consentimento é parte da garantia de segurança tanto quanto o código: um `ConfirmPort` correto estruturalmente mas com mensagem fixa de "ação irreversível" teria produzido consentimento sob descrição errada (concessão de política sobre uma subárvore, válida pela sessão inteira, descrita como uma escrita pontual). Ter esse adapter como arquivo novo e isolado tornou esse achado corrigível sem tocar `confirm-port.ts` — que permaneceu com diff vazio, como o Escopo exigia.

**A arquitetura atrapalhou porque...**

O teste de efeito ponta a ponta no portão (o único jeito de provar que a fatia altera de fato o veredicto do Permission Service, não só o texto do painel) exigiu, mais uma vez, contornar a limitação já registrada na Lição da SPEC-0037: o provedor `fake` nunca produz um `Plan` (nunca devolve JSON), então não serve para testar execução real de Tools — foi necessário o provedor `local` com `fetch` mockado para 3 chamadas (plano, composição, extração de aprendizado), no mesmo formato de plano já mapeado (`{"steps":[{"tool":...,"args":...}]}`). Esta é a **2ª ocorrência** desse atrito exato (1ª: SPEC-0037) — vale registrar como recorrência, não redescoberta. O teste do A7 também cobrou um custo maior que o padrão de "turno em voo" já usado (SPEC-0037): precisou coordenar **dois** pontos de suspensão simultâneos (o `ask` interno disparado pelo `confirmGrant` fake e o próprio diálogo de concessão), usando `setTimeout(0)` para garantir a ordem de incremento do contador de operações em voo antes de resolver o diálogo — mais frágil por construção que suspender um único ponto.

**Precisamos mudar...**

Nada de estrutural nesta SPEC — os achados do gate (A1/A2/A6/A7) já foram corrigidos na própria implementação e confirmados pelo `spec-validator`, sem abrir ADR novo. Um encaminhamento explícito, porém, ficou registrado pelo `architecture-reviewer` como candidato de fatia futura (não desta SPEC): passar a `BrowserWindow` como pai em `dialog.showMessageBox` tornaria o diálogo de concessão modal à janela e eliminaria a **origem** da corrida de A7 (hoje mitigada por rechecagem, não pela raiz) — encaminhamento: registrado em `docs/05-context/NEXT_CONTEXT.md` como candidato futuro, sem SPEC própria aberta ainda. Recorrência a observar: se uma 3ª SPEC do desktop precisar do mesmo contorno do provedor `fake`/`local` para testar efeito real de Tools, vale considerar um helper de teste compartilhado em `apps/desktop/tests/` — ainda não justificado com só 2 ocorrências.

## [SPEC-0037](specs/SPEC-0037-desktop-runtime-persona-switch.md) — Desktop: seleção e troca de Persona em runtime pela interface gráfica (2026-07-28)

**Descobrimos que...**

A distinção entre "mapa lógico de uso" (Module Catalog: "Persona Service é utilizado por aplicações clientes") e "regra física de dependência" (ADR-0003 + Regra de Dependência 11 do ProjectStructure) é real e não intercambiável — a 1ª versão desta SPEC citava só o mapa lógico e propunha `apps/desktop` importar `createPersonaService` direto de `@atlas/persona`, instanciando um 2º `PersonaService` fora do composition root. O `architecture-reviewer` vetou isso no gate citando a regra física, não a lógica. A correção (D4) foi um re-export de catálogo em `@atlas/core`, no molde já existente de `loadConfig`/`defaultConfig` — aditivo, sem wiring, diff de `packages/core` em 8 linhas. Descobrimos também, só lendo o código (não a SPEC), que a serialização de turno da SPEC-0033 vivia inteiramente no renderer: um canal IPC novo (`atlas:persona:select`) furava essa garantia sem tocar o bridge, e um turno em voo interrompido pela troca de Persona perderia os `learned` daquele turno (a gravação vem depois do `updateConversation`, que lançaria `ContextError: Sessão desconhecida`) — corrigido com bloqueio em duas camadas (D9): renderer desabilita o seletor, bridge recusa `selectPersona` enquanto houver sessão ocupada.

**A arquitetura ajudou porque...**

O molde de re-export de catálogo (`loadConfig`/`defaultConfig`, já consumido por `apps/cli/tests`) generalizou de imediato para `createPersonaService`/`PERSONA_IDS` sem exigir nenhuma mudança em `@atlas/contracts` nem em `createAtlas`/`AtlasPlatform` — a 6ª fatia visual seguida (SPECs 0031-0037) a confirmar que a fronteira Core/renderer absorve capacidade de produto nova sem tocar packages do Core. O estado de módulo do `core-bridge` (molde do `Map` de sessões da SPEC-0033) deu um ponto único e testável (Vitest sem Electron) para a garantia central "nenhuma sessão viva sobrevive com Persona superada".

**A arquitetura atrapalhou porque...**

O critério de teste originalmente escrito na SPEC ("gateway `fake` instrumentado" para segurar um turno em voo) era inexequível como redigido: `CreateAtlasDeps` não tem slot de `gateway` e o provider `fake` não tem ponto de suspensão. O caminho real precisou usar `configOverride: { model: { provider: 'local' } }` + `globalThis.fetch` controlado por um deferred, e o implementer teve que ler `packages/cognitive/src/cognitive-core.ts` para acertar quantas chamadas de `generate` ocorrem por turno (planejamento + extração de aprendizado condicional). O estado de módulo do `core-bridge` (seleção corrente + sessões ocupadas) também cobrou o custo já previsto na própria SPEC: um teste do describe de Persona deixou uma sessão de chat aberta e contaminou o `closedSessions` do teste seguinte, corrigido fechando em `finally`.

**Precisamos mudar...**

Nada de estrutural nesta SPEC — os dois achados (regra física vs. mapa lógico; critério de teste sem superfície de injeção real) já foram absorvidos na própria implementação, sem abrir ADR novo. Encaminhamento registrado para a **próxima** fatia nomeada pelo usuário nesta sessão (criar Persona pela interface, com personalidade e voz): ela colide com o Artigo 11 (estado persistente novo) e provavelmente com o ADR-0010 (vincular voz a Persona) — cai na escalação obrigatória da Emenda v1.1 e deve começar por brainstorming humano, não pelo `spec-drafter` direto (encaminhamento: registrado em `docs/05-context/NEXT_CONTEXT.md` como próximo trabalho nomeado, decisão de início cabe ao usuário).


---

**Entradas anteriores (SPEC-0036 e mais antigas):** `LESSONS_LEARNED-ARCHIVE.md`.
