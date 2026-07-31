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

**Escopo deste arquivo:** o Registro abaixo mantém as **últimas 5 SPECs**. As entradas da SPEC-0039 e anteriores estão em `LESSONS_LEARNED-ARCHIVE.md`, preservadas sem edição (regra 2 intacta — nada é reescrito, só realocado).

O corte existe porque este arquivo chegou a 157 KB (~39k tokens) e era relido no arranque de quase todo subagent, dominando o custo em tokens do pipeline. Ao fechar uma SPEC: adicione a entrada nova no topo do Registro e mova a mais antiga das 6 para o arquivo.

---

# Padrões Recorrentes

Lições que se repetiram em três ou mais SPECs. Este índice existe para sobreviver ao corte acima — consulte o arquivo para o caso concreto de cada uma.

- **Correção de bloqueante introduz bloqueante novo no mesmo caminho de código** — SPEC-0034, 0038, 0039. Ao corrigir um veto do gate, re-examine o caminho inteiro, não só a linha apontada.
- **Garantia em prosa absoluta tende a estar incompleta** — SPEC-0038 (A1/A2 → A6/A7). "Toda função que X" quase sempre esquece um caso; enumere ou restrinja a formulação.
- **Duplicação deliberada renderer↔módulo** — SPEC-0035, 0036, 0039, 0040, 0041, 0043 (7 ocorrências). `renderer.js` é `<script>` clássico sem bundler (ADR-0019) e não pode importar o módulo TS em runtime; a réplica em JS puro é consciente e leva comentário apontando o teste de referência. A SPEC-0043 é a 2ª vez que essa duplicação **deriva por acidente** (não só risco teórico): o glue do renderer ficou sem `preferredVoiceURI` desde a SPEC-0035 sem que nenhuma das cinco fatias seguintes notasse.
- **Campo obrigatório novo em `Deps` exige grep pelo nome da função construtora** (`createRuntime(`, `createPermissionService(`) em **todo o repo** — repetido 8× até a SPEC-0013.
- **Membro obrigatório novo numa interface de contrato não é pego por esse grep** — busque pelo **nome do tipo** (`git grep 'PermissionService'`), que acha fakes e implementações diretas nos testes (quebrou o typecheck na SPEC-0017).
- **`vitest run` não faz typecheck** (esbuild só remove tipos) — um passo TDD "RED" que depende de erro de *tipo* só falha de verdade em `pnpm --filter <pkg> typecheck`.
- **Smoke visual das fatias desktop nunca confirmado** — SPEC-0031 a 0043, 12 seguidas. O shell de automação não tem WindowServer. Não bloqueia fechamento documental, mas não conte como verificado.
- **Contrato só sobe a `@atlas/contracts` com 2º consumidor real**, via ADR (ADR-0007). Tipos de uma app só (`StatusSnapshot`, `TurnSnapshot`, `FactSnapshot`) ficam locais.


# Registro

## [SPEC-0044](specs/SPEC-0044-cli-persona-crud.md) — CLI: `atlas persona list|show|create|edit|delete`, equivalente de terminal do CRUD de Personas custom da SPEC-0039 (2026-07-31)

**Descobrimos que...**

O 1º veto do `architecture-reviewer` não foi por redesenho — foi por três lacunas de **registro** na própria SPEC, todas na fronteira entre "decisão razoável" e "decisão com custo não declarado", corrigidas na 2ª rodada sem mudar a forma da solução: (1) a D10 (injetar `personaStorage` em todo `createAtlas`) tinha uma contrapartida que o rascunho não nomeava — `createAtlas` nunca tocava `personas.json` antes desta SPEC, e a injeção faz **todo** comando lê-lo no arranque, com o fail-high da SPEC-0039/A6 passando a derrubar `ask`/`chat`/`status` também, não só `atlas persona`; (2) a D8 (`--voice-uri` opaco) justificava a opacidade só com "preserva a interoperabilidade" — verdadeiro para **preservar** uma voz vinda da janela, mas enganoso para **autorar** uma voz pela CLI sob a política Piper-only (SPEC-0041), onde só `piper:<id>` de fato soa; (3) §3 descrevia um contrato inexistente (`list()` devolvendo objetos `Persona`, campo `Persona.builtin`), o que teria levado o implementer a tocar `@atlas/contracts` — proibido pela própria SPEC. O bloco de veto é o que um humano lê para exercer override; decisão sem custo declarado é, na prática, um veto.

**A arquitetura ajudou porque...**

O molde D12 da SPEC-0039 (composição delimitada de `createPersonaService({ storage })` dentro do app, exceção nomeada ao ADR-0003) generalizou sem ajuste nenhum para um 2º consumidor real — o próprio gatilho que o ADR-0007 exige para promover algo a contrato público, e aqui a resposta correta foi a oposta: manter tudo local a `apps/cli`, porque nada precisou subir. O desvio pré-Core dos subcomandos de `persona` (D5) reusou, sem reabrir investigação, a mesma correção já provada pela SPEC-0039/D17 para o deadlock circular B1 — a mesma classe de problema (achar o arquivo não pode depender de a Persona ativa ser válida) apareceu num consumidor novo e a solução já documentada bastou.

**A arquitetura atrapalhou porque...**

Nada de estrutural; o atrito ficou em precisão de registro na própria SPEC — um custo real (D10) e uma justificativa parcial (D8) sobreviveram ao rascunho até o gate, o mesmo tipo de imprecisão textual já visto no 2º veto da SPEC-0041 (B1), mas aqui pego e corrigido na 1ª rodada, sem precisar escalar ao usuário.

**Precisamos mudar...**

O `spec-validator` sinalizou que `packages/persona/tests/persona-storage.test.ts:84` usa `chmod 0o500` para simular `EACCES` na escrita atômica — o que só funciona em processo **não-root**; verdadeiro hoje no runner `ubuntu-latest` do GitHub Actions (usuário `runner`), então não é flake em CI, mas é um pressuposto de ambiente não documentado. Encaminhamento: registrado aqui como nota; se a suíte algum dia rodar localmente como root (container root, sandbox elevado) ou migrar de runner, esse caso precisa de um teste alternativo de falha injetada (fake de `fs`/`rename`, não permissão real do SO).

## [SPEC-0043](specs/SPEC-0043-desktop-voice-residues.md) — Desktop: fecha os dois resíduos de voz da SPEC-0041 — `voiceURI` retida em vez de apagada em silêncio, e o caminho `'os'` do glue volta a honrar a preferência da Persona (2026-07-31)

**Descobrimos que...**

Uma citação de artigo errada na própria SPEC ("nada de escrita persistente implícita", atribuída ao Artigo 11 — que na verdade é a autoridade exclusiva da Memória sobre estado persistente) sobreviveu ao rascunho e ao 1º veto do gate, e mesmo depois de o gate corrigir 4 ocorrências para os Artigos 7 e 8 (transparência; nenhuma ação destrutiva sem autorização explícita), 2 ocorrências residuais (Fora do Escopo, D9) só foram pegas pelo `spec-validator` — um erro de registro simples propagou por três revisões diferentes antes de ser fechado por completo no fechamento. Descobrimos também, ao investigar o resíduo (2) (o glue `createSpeechOutputGlue({ synth })` nunca recebeu `preferredVoiceURI`), que a deriva declarada como candidata a fatia futura na Observação da SPEC-0041 já vinha sendo carregada, sem correção, desde a SPEC-0035 — cinco fatias de voz seguidas (0036/0039/0040/0041) reafirmaram o contrato de preferência no módulo puro sem que nenhuma delas notasse que o renderer nunca o consumia de fato.

**A arquitetura ajudou porque...**

A distinção "política × ambiente", codificada como uma função pura composta **sobre** `piperOnlyPreference` (D3) em vez de uma condição paralela, deixou os quatro desfechos (`none`/`available`/`retained`/`dropped`) exaustivos e testáveis sem duplicar a regra que já decide o que soa — se a política Piper-only mudar um dia, a classificação acompanha sozinha. Colocar a preservação **dentro** do próprio `<select>`, como uma `<option>` retida e selecionada (D2), eliminou por construção a ambiguidade que motivou a SPEC inteira: hoje o que está selecionado é sempre o que será salvo, e `readPersonaFormInput` ficou intocado — a garantia de transparência (Artigo 7) caiu de graça da mecânica que já existia, sem precisar de estado paralelo "lembrado" no submit. O provider do glue reusando o **mesmo** `piperOnlyPreference(...)` que `currentVoiceBackend` já usa (D6) fechou o resíduo (2) sem introduzir uma segunda cópia da política de superfície — um `piper:<id>` nunca casa com voz do SO por construção (filtro `localService === true`), então o fallback do ADR-0021(c) degrada corretamente sem condição nova.

**A arquitetura atrapalhou porque...**

`renderer.js` segue sem cobertura automatizada (sem bundler, ADR-0019), e esta é a **7ª** réplica renderer↔módulo do projeto — e a **2ª** vez que essa duplicação derivou por acidente, não só por risco teórico (a 1ª foi o próprio resíduo 2 desta SPEC). O padrão já falhou uma vez de verdade: um contrato documentado desde a SPEC-0039, reafirmado como autoritativo pela D16 da SPEC-0040, ficou sem efeito no app real por seis fatias sem que nenhum gate mecânico pudesse detectar — só inspeção manual de diff. A correção de citação de artigo (Artigo 11 → 7/8) também mostrou que erros de registro em prosa sobrevivem a múltiplas rodadas de revisão quando ninguém grepa pelo número do artigo especificamente.

**Precisamos mudar...**

O risco estrutural da 7ª réplica (e da 2ª deriva por acidente) foi registrado pelo `architecture-reviewer` como candidato a decisão de arquitetura — cobrir `renderer.js` por teste automatizado exigiria mudar a stack do renderer (ADR-0019), portanto ADR novo e escalação humana (Emenda v1.1); não é decisão desta sessão. Encaminhamento: candidato registrado em `docs/05-context/NEXT_CONTEXT.md`, para que a próxima SPEC de voz ou de Persona avalie se já é hora de pagar essa dívida antes de abrir uma 8ª réplica.

## [SPEC-0042](specs/SPEC-0042-test-split-scoped-verification.md) — Quebra do `core-bridge.test.ts` por assunto e verificação escopada por package, com flake pré-existente corrigido (2026-07-30)

**Descobrimos que...**

O caso `"updatePersona sobre a Persona ativa recusa com operação em voo…"` (bloco de autoria de Persona) abria sessão via `openChatSession` e nunca a fechava, vazando um `SessionId` no `Map` de sessões vivas do `core-bridge`. O `afterEach` do bloco chamava `__resetBridgeStateForTests()` — mas esse reset cobre seleção de Persona e de permissões, **não** o `Map` de sessões. Sob ordem natural de execução, nenhum caso posterior observava o resíduo; sob `--sequence.shuffle` (CA 8, obrigatório desde o desenho original da SPEC), um caso posterior herdava a sessão vazada e `closedSessions` chegava com 2 ids em vez de 1. Provamos a **pré-existência** rodando o arquivo monolítico original (`git show 0b32ccf:apps/desktop/tests/core-bridge.test.ts`) sob o mesmo shuffle: falha idêntica, mesmo teste. A quebra em sete arquivos não introduziu o defeito — só o tornou observável. Oito SPECs visuais anteriores (0031–0041) não viram.

**A arquitetura ajudou porque...**

A fronteira já desenhada nos oito blocos `describe` de topo (espelhando as famílias que `apps/desktop/CLAUDE.md` documenta em `core-bridge.ts`) tornou a movimentação mecânica e auditável por diff vazio contra o baseline, sem exigir reescrita — condição necessária para a garantia central "cobertura preservada integralmente". O próprio CA 8 (isolamento sob shuffle, decidido por D4 já no desenho original) provou seu valor na prática ao expor o flake antes que ele fosse mascarado silenciosamente em outra sessão. Leituras vinculantes do `architecture-reviewer`, emitidas junto da aprovação da emenda v1.2 em vez de virarem um 3º bounce, resolveram quatro ambiguidades de uma vez: CA 24 pinado no sha `0b32ccf` (em vez de um `HEAD` que se autodestruiria no commit de fechamento), CA 23 reescrito para ser exequível (faltava o import de `closeChatSession`; `session` era `const` dentro do `try`, fora de escopo no `finally`), fecho em `finally` exigindo `.catch` (para não esconder a asserção que de fato falha) e sementes de shuffle registradas para reprodutibilidade.

**A arquitetura atrapalhou porque...**

O gate errou uma premissa e registrou o próprio erro no parecer da 3ª rodada: o `architecture-reviewer` havia circunscrito o risco de flake aos "quatro blocos sem `reset` próprio"; o vazamento apareceu no bloco de autoria de Persona, que **tem** `reset`. Ter um `reset` não basta se ele não cobre todo o estado de módulo — limite de uma análise estática num gate que não executa a suíte.

**Precisamos mudar...**

`__resetBridgeStateForTests()` não fecha sessões vivas — lacuna nomeada por D15 como candidato a fatia futura que toca `src/` (fora desta SPEC, que proibiu explicitamente esse caminho por D14). Encaminhamento: registrada em `apps/desktop/CLAUDE.md` ("Candidatos futuros já nomeados" + qualificação da linha sobre o próprio `__resetBridgeStateForTests()`), para que o próximo teste que abrir uma sessão encontre o aviso sem precisar redescobrir o flake.

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


---

**Entradas anteriores (SPEC-0039 e mais antigas):** `LESSONS_LEARNED-ARCHIVE.md`.
