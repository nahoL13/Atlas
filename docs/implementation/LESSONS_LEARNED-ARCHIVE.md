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

# Registro — Arquivo (SPEC-0037 e anteriores)

## [SPEC-0037](specs/SPEC-0037-desktop-runtime-persona-switch.md) — Desktop: seleção e troca de Persona em runtime pela interface gráfica (2026-07-28)

**Descobrimos que...**

A distinção entre "mapa lógico de uso" (Module Catalog: "Persona Service é utilizado por aplicações clientes") e "regra física de dependência" (ADR-0003 + Regra de Dependência 11 do ProjectStructure) é real e não intercambiável — a 1ª versão desta SPEC citava só o mapa lógico e propunha `apps/desktop` importar `createPersonaService` direto de `@atlas/persona`, instanciando um 2º `PersonaService` fora do composition root. O `architecture-reviewer` vetou isso no gate citando a regra física, não a lógica. A correção (D4) foi um re-export de catálogo em `@atlas/core`, no molde já existente de `loadConfig`/`defaultConfig` — aditivo, sem wiring, diff de `packages/core` em 8 linhas. Descobrimos também, só lendo o código (não a SPEC), que a serialização de turno da SPEC-0033 vivia inteiramente no renderer: um canal IPC novo (`atlas:persona:select`) furava essa garantia sem tocar o bridge, e um turno em voo interrompido pela troca de Persona perderia os `learned` daquele turno (a gravação vem depois do `updateConversation`, que lançaria `ContextError: Sessão desconhecida`) — corrigido com bloqueio em duas camadas (D9): renderer desabilita o seletor, bridge recusa `selectPersona` enquanto houver sessão ocupada.

**A arquitetura ajudou porque...**

O molde de re-export de catálogo (`loadConfig`/`defaultConfig`, já consumido por `apps/cli/tests`) generalizou de imediato para `createPersonaService`/`PERSONA_IDS` sem exigir nenhuma mudança em `@atlas/contracts` nem em `createAtlas`/`AtlasPlatform` — a 6ª fatia visual seguida (SPECs 0031-0037) a confirmar que a fronteira Core/renderer absorve capacidade de produto nova sem tocar packages do Core. O estado de módulo do `core-bridge` (molde do `Map` de sessões da SPEC-0033) deu um ponto único e testável (Vitest sem Electron) para a garantia central "nenhuma sessão viva sobrevive com Persona superada".

**A arquitetura atrapalhou porque...**

O critério de teste originalmente escrito na SPEC ("gateway `fake` instrumentado" para segurar um turno em voo) era inexequível como redigido: `CreateAtlasDeps` não tem slot de `gateway` e o provider `fake` não tem ponto de suspensão. O caminho real precisou usar `configOverride: { model: { provider: 'local' } }` + `globalThis.fetch` controlado por um deferred, e o implementer teve que ler `packages/cognitive/src/cognitive-core.ts` para acertar quantas chamadas de `generate` ocorrem por turno (planejamento + extração de aprendizado condicional). O estado de módulo do `core-bridge` (seleção corrente + sessões ocupadas) também cobrou o custo já previsto na própria SPEC: um teste do describe de Persona deixou uma sessão de chat aberta e contaminou o `closedSessions` do teste seguinte, corrigido fechando em `finally`.

**Precisamos mudar...**

Nada de estrutural nesta SPEC — os dois achados (regra física vs. mapa lógico; critério de teste sem superfície de injeção real) já foram absorvidos na própria implementação, sem abrir ADR novo. Encaminhamento registrado para a **próxima** fatia nomeada pelo usuário nesta sessão (criar Persona pela interface, com personalidade e voz): ela colide com o Artigo 11 (estado persistente novo) e provavelmente com o ADR-0010 (vincular voz a Persona) — cai na escalação obrigatória da Emenda v1.1 e deve começar por brainstorming humano, não pelo `spec-drafter` direto (encaminhamento: registrado em `docs/05-context/NEXT_CONTEXT.md` como próximo trabalho nomeado, decisão de início cabe ao usuário).

## [SPEC-0036](specs/SPEC-0036-desktop-tts-local-voice-only.md) — Desktop: TTS 100% offline garantido — restringir a vozes locais (2026-07-24)

**Descobrimos que...**

`SpeechSynthesisVoice.localService` já é o sinal-padrão da Web Speech API para distinguir voz sintetizada no dispositivo (`true`) de voz processada por serviço remoto (`false`) — endurecer a garantia de "zero rede" da SPEC-0035 não exigiu heurística nova nem dependência nova, só filtrar por esse campo já exposto pelo Chromium e vincular explicitamente a voz escolhida (`utterance.voice`) em vez de deixar o navegador escolher a voz padrão. A mudança tocou as três mesmas camadas da SPEC-0035 (módulo puro, teste, glue do renderer) e nada além delas — a fronteira Core/renderer definida desde a SPEC-0031 absorveu mais uma vez uma exigência de segurança sem tocar `@atlas/contracts`/`@atlas/core`.

**A arquitetura ajudou porque...**

O molde de porta estrutural local (`SpeechSynthesisPort`/`UtteranceSpec`, sem tipo de navegador importado) já isolava exatamente o ponto de extensão certo: alargar `getVoices()` para devolver `VoiceInfo[]` e `UtteranceSpec` para carregar `voiceURI` bastou para levar a decisão de seleção de voz para dentro do módulo puro/testável, mantendo o renderer como glue fino que só resolve o `voiceURI` escolhido para uma voz real. O padrão fail-closed já usado no `confirm-port` (SPEC-0032) e no `verify` de FS (SPEC-0024) se replicou aqui sem fricção: "sem voz local ⇒ não fala" é a mesma postura, só aplicada a um novo tipo de recurso.

**A arquitetura atrapalhou porque...**

Confirma-se, pela 2ª vez seguida (já registrado na entrada da SPEC-0035), o atrito estrutural da duplicação deliberada `speech-output.ts` ↔ `renderer.js`: como `renderer.js` é `<script>` clássico sem bundler (ADR-0019) e não pode `import` o módulo TS em runtime, a lógica de seleção de voz local (`selectLocalVoiceURI`) precisou ser escrita duas vezes, com o mesmo risco de deriva já sinalizado — desta vez o próprio endurecimento é a prova de que a duplicação pode ficar defasada silenciosamente se uma fatia futura mudar `speech-output.ts` sem lembrar do espelho em `renderer.js` (o comentário-referência ajuda, mas não é verificado por teste).

**Precisamos mudar...**

Nada de estrutural nesta SPEC — a recorrência da duplicação renderer↔módulo já está registrada e encaminhada (nenhum ADR novo justificado só por isso, dado que introduzir bundler para `apps/desktop` seria decisão de stack fora do escopo desta fatia). Encaminhamento: se uma 3ª fatia de voz repetir esse atrito (ex.: STT), reavaliar nesse momento se o custo acumulado de duplicação já justifica um ADR de bundler/build para `apps/desktop` — não antes disso.

## [SPEC-0035](specs/SPEC-0035-desktop-voice-output-tts.md) — Desktop: saída de voz (TTS) — falar a resposta do chat (2026-07-24)

**Descobrimos que...**

`renderer.js` — `<script>` clássico carregado por `window.loadFile` sem `type="module"` e sem bundler (ADR-0019) — não consegue literalmente `import` um módulo TypeScript do app em tempo de execução, diferente de `confirm-port.ts`/`steps-view.ts` (que só o main process consome, via o hook `tsx`). `src/speech-output.ts` (o módulo puro/testado) e o glue do renderer, portanto, não podem compartilhar o mesmo código-fonte nesta fatia: o mesmo algoritmo (`createSpeechOutput` — normaliza, no-op em vazio, cancela-antes-de-falar, fail-safe, `isAvailable` via `getVoices().length > 0`) precisou ser **replicado deliberadamente** em JS puro dentro de `renderer.js`, com um comentário apontando a duplicação e o teste de referência (`tests/speech-output.test.ts`). Confirmamos também, pela 5ª vez seguida nas fatias do desktop (0031-0035), que a fronteira Core/renderer absorveu uma capacidade de produto inteiramente nova (voz) sem tocar `@atlas/contracts`/`@atlas/core`/qualquer package do Core — a Web Speech API embutida do Chromium (E2, decisão humana) bastou.

**A arquitetura ajudou porque...**

o molde de módulo puro + porta estrutural local (`SpeechSynthesisPort`/`UtteranceSpec`, no formato de `ConfirmPort`) generalizou de novo sem ajuste: a lógica de decisão (o quê/quando falar, disponibilidade de voz) ficou 100% testável no Vitest sem DOM, isolando a única parte não testável (a chamada real a `window.speechSynthesis`/`SpeechSynthesisUtterance`) no glue do renderer — o mesmo padrão que já isola `dialog.showMessageBox` em `main.ts`.

**A arquitetura atrapalhou porque...**

o smoke manual visual segue não-executável no shell de automação sem WindowServer/saída de áudio — 5ª fatia visual seguida (0031-0035) com essa mesma pendência honesta, plenamente recorrente. Além disso, esta é a primeira fatia em que a ausência de bundler no renderer (decisão do ADR-0019, correta para o escopo do desktop) virou um atrito concreto e não só uma restrição teórica: duas cópias do mesmo algoritmo, uma testada e uma não, com risco real de deriva silenciosa se um dos dois lados mudar sem o outro.

**Precisamos mudar...**

registrar o padrão "glue do renderer não pode importar módulos TS do app — replicação espelhada intencional, com risco de deriva" como conhecimento explícito, não tácito (encaminhamento: nota adicionada em `apps/desktop/CLAUDE.md`, seção desta SPEC, e nos Critérios/Arquivos Esperados da própria SPEC-0035, corrigindo o texto que sugeria "renderer instancia `createSpeechOutput`" como se fosse um import direto executável). Se uma fatia futura decidir introduzir um bundler para o renderer (fora de escopo de toda SPEC do desktop até aqui), esta duplicação deixaria de ser necessária — mas essa é uma decisão de stack que exige ADR (Artigo 13), não uma mudança implícita.

## [SPEC-0034](specs/SPEC-0034-desktop-visual-memory-management.md) — Desktop: gerência visual de memória — listar e esquecer fatos (2026-07-23)

**Descobrimos que...**

a memória, ao contrário do chat (SPEC-0033), é conhecimento **durável em disco** (ADR-0011) — por isso `resolveMemorySnapshot`/`forgetFact` puderam voltar ao molde **stateless** de `resolveStatusSnapshot`/`resolveAskSnapshot` (sobem e desligam o Core por chamada) em vez de reusar o padrão de Core-vivo-entre-turnos que a SPEC-0033 introduziu: as duas fatias visuais consecutivas do desktop usaram dois moldes de ciclo de vida diferentes, e cada um foi a escolha certa para a natureza do dado que consome (estado em memória × estado em disco), não uma inconsistência. Confirmamos de novo, pela 4ª vez seguida nas fatias do desktop (0031/0032/0033/0034), que a superfície pronta do Core (`createAtlas`, `atlas.memory.list`/`forget`) bastou por inteiro — zero mudança em `@atlas/contracts`/`@atlas/core`/`@atlas/memory`/qualquer outro package do Core.

**A arquitetura ajudou porque...**

o par casca-fina (`main.ts`) × camada testável (`core-bridge.ts`), consolidado desde a SPEC-0031, absorveu sem fricção um terceiro round-trip stateless em cima de um contrato de módulo diferente (`MemoryService` em vez de `Cognitive Core`) — a mesma forma (`createAtlas` → operação → `finally` shutdown) generalizou para uma superfície de domínio nova sem precisar de ajuste estrutural; `FactSnapshot` seguiu exatamente o precedente de `StatusSnapshot`/`AskSnapshot`/`TurnSnapshot` (tipo local, defaults resolvidos antes do IPC), reduzindo a decisão de design a "aplicar o molde já validado".

**A arquitetura atrapalhou porque...**

o smoke manual visual segue não-executável no shell de automação sem WindowServer — 4ª fatia visual seguida (0031/0032/0033/0034) com essa mesma pendência honesta; o atrito está plenamente recorrente e documentado, não mais uma descoberta.

**Precisamos mudar...**

nada de estrutural quanto ao smoke manual — encaminhamento já registrado desde a SPEC-0031 (harness de Electron dedicado, se algum dia uma fatia decidir cobrir a UI por teste automatizado, fora do escopo de todas as SPECs do desktop até aqui). Quanto ao achado não-bloqueante do `architecture-reviewer` nesta SPEC (a Decisão 5 — esquecer sem confirmação — deveria ter ancorado também no Artigo 8, além do ADR-0013; e a numeração de Artigos citada nas SPECs desktop está com nits herdados — Core-orquestrador é Artigo 3 não 4, Persona-única é Artigo 2 não 7): nenhuma mudança de código necessária, mas encaminhamento — higienizar a numeração de Artigos nas próximas SPECs do desktop que citarem a Constituição, e revisar a fundamentação da Decisão 5 na SPEC-0034 se ela for referenciada como precedente por uma fatia futura.

## [SPEC-0033](specs/SPEC-0033-desktop-visual-chat.md) — Desktop: chat visual multi-turno com sessão viva do Core (2026-07-23)

**Descobrimos que...**

o texto da própria SPEC continha uma ambiguidade entre o Escopo ("`closeChatSession` idempotente/tolerante a handle já encerrado") e um Critério de Aceitação que exige rejeição estruturada para uma `SessionId` que nunca foi aberta — foram resolvidos tratando "nunca aberta" e "já encerrada" identicamente (ambas rejeitam com erro estruturado, nunca `TypeError`), lendo "tolerante" como "não crasha o processo", não como "engole o erro em silêncio". Descobrimos também que o `core-bridge.ts` não expõe (por design) a listagem das sessões vivas registradas internamente — o `main.ts` precisou de um `Set<SessionId>` próprio (`openChatSessionIds`) para viabilizar o teardown no shutdown da app, um ajuste pequeno não listado explicitamente no fluxo da SPEC mas coerente com "garantir shutdown do Core". Por fim, confirmamos que a superfície pronta do Core (`createAtlas` com `CreateAtlasDeps.confirm`, `atlas.cognitive.respond`/`startConversation`, `atlas.context.openSession`/`getConversation`/`updateConversation`/`closeSession`) bastou por inteiro para o "grande salto" de manter o Core vivo entre turnos — zero mudança em `@atlas/contracts`/`@atlas/core`/`@atlas/runtime`/`@atlas/cognitive`/`@atlas/context`/`@atlas/permissions`, a 3ª vez consecutiva (após SPECs 0031/0032) que a fronteira de contratos públicos do Core já era genérica o bastante para uma capacidade nova na janela.

**A arquitetura ajudou porque...**

o molde casca-fina (`main.ts`) × camada testável (`core-bridge.ts`) das SPECs 0031/0032 absorveu sem fricção o padrão de ciclo de vida novo (sessão viva registrada por `SessionId`, mediação `sendChatTurn` no formato que o ADR-0009 já previa para a aplicação); os adapters de GUI da SPEC-0032 (`createDialogConfirmPort`, `formatSteps`) foram reusados **sem nenhuma alteração** (diff vazio nos dois arquivos), confirmando que a divisão adapter × consumo já estava correta desde a fatia anterior.

**A arquitetura atrapalhou porque...**

o smoke manual visual (janela real + dois turnos encadeados com contexto + diálogo nativo de `delete_file`) segue não-executável no shell de automação sem WindowServer — 3ª SPEC visual seguida (0031/0032/0033) com essa mesma pendência honesta, agora claramente recorrente em toda fatia da Fase 2, não mais um atrito isolado.

**Precisamos mudar...**

nada de estrutural agora quanto ao smoke manual — o atrito é o mesmo já documentado desde a SPEC-0031 e volta a se confirmar recorrente; encaminhamento: nenhum ADR/SPEC novo necessário, mas se uma fatia futura decidir cobrir `delete_file`/diálogo real por teste automatizado, precisará de um harness de Electron dedicado (fora do escopo desta e das SPECs 0031/0032). Quanto à ambiguidade textual do Escopo × Critérios de Aceitação: nenhuma mudança de documentação necessária agora — a leitura unificada ("nunca aberta" = "já encerrada", ambas rejeição estruturada) já está registrada nesta entrada como precedente para SPECs futuras de ciclo de vida com handle.

## [SPEC-0032](specs/SPEC-0032-desktop-confirm-steps-adapters.md) — Desktop: adapters de confirmação e traço de execução (2026-07-22)

**Descobrimos que...**

`dialog.showMessageBox` do Electron só revela seu atrito de tipos no `main.ts` real, não nos testes unitários do adapter isolado: `MessageBoxOptions` exige `type` como union literal (`'warning' | ...`, não `string` genérico) e `buttons: string[]` mutável (não `readonly string[]`), então o `DialogOptions` local do `confirm-port.ts` precisou espelhar exatamente essas restrições para satisfazer o typecheck de `main.ts` — um erro que só aparece ao compilar a casca de produção, não no `showMessageBox` fake dos testes. Descobrimos também que a superfície pronta do Core (`createAtlas` com `CreateAtlasDeps.confirm`, `atlas.cognitive.ask`, `AskResult`/`ExecutedStep` já em `@atlas/contracts`) bastou por inteiro para o segundo adapter de GUI — zero mudança em `@atlas/contracts`/`@atlas/core`/`@atlas/runtime`/`@atlas/permissions`/`@atlas/cognitive`, confirmando de novo (após a SPEC-0031) que a fronteira de contratos públicos já era genérica o bastante para uma segunda interface com etapa cognitiva.

**A arquitetura ajudou porque...**

o molde casca-fina (`main.ts`) × camada testável (`core-bridge.ts`/`confirm-port.ts`/`steps-view.ts`) da SPEC-0031 se repetiu sem fricção para os dois adapters novos: toda a lógica de valor (`createDialogConfirmPort`, `formatSteps`, `resolveAskSnapshot`) ficou isolada do runtime gráfico e testável no Vitest com um `showMessageBox` fake, sem harness de Electron — preservando autor≠verificador mesmo para uma capacidade (confirmação de destrutiva via diálogo nativo) que só existia até aqui atrás de um terminal.

**A arquitetura atrapalhou porque...**

o smoke visual (janela real + diálogo de confirmação de `delete_file`) segue não-executável no shell de automação sem WindowServer — mesmo atrito já registrado pela SPEC-0031, agora confirmado como recorrente em toda fatia visual da Fase 2 (2.1-restante); a suíte automatizada de `resolveAskSnapshot` roda só sobre o gateway `fake` determinístico, sem exercitar um round-trip real com `delete_file`/`ConfirmPort` — esse caminho fica inteiramente a cargo do smoke manual, sem cobertura automatizada nesta fatia.

**Precisamos mudar...**

nada de estrutural agora — o atrito do smoke manual é o mesmo já documentado e esperado desde a SPEC-0031 (`apps/desktop/CLAUDE.md`), e volta a se confirmar recorrente. Encaminhamento: nenhum ADR/SPEC novo necessário; a próxima fatia da Fase 2 (2.2, chat visual multi-turno) deve repetir o mesmo aviso de confirmação humana pendente no seu Definition of Done, e — se decidir exercitar o caminho `delete_file`/diálogo real por teste automatizado — precisará de um harness de Electron dedicado (Fora do Escopo desta e da SPEC-0031).

## [SPEC-0031](specs/SPEC-0031-desktop-foundation.md) — Desktop Foundation (2026-07-22)

**Descobrimos que...**

o padrão sem-`dist` do [ADR-0005](../06-adr/ADR-0005-app-typescript-execution.md) (execução via `tsx`) não atravessa a fronteira do Electron sem ajuste: `electron --import tsx ./src/main.ts` (flag com espaço) falha silenciosamente — o parser de argv do Electron trata `tsx` como *app path*, não como valor de `--import`, e nada carrega; corrigir para `--import=tsx` (com `=`) resolve o parsing, mas o hook de remapeamento `.js`→`.ts` do `tsx` em imports relativos ainda não se propaga ao carregamento do processo principal do Electron, e a app quebra com `ERR_MODULE_NOT_FOUND` ao resolver `./model-gateway.js` dentro de `@atlas/model-gateway`. A correção que preserva o princípio sem-`dist` foi mover o hook de flag do binário para variável de ambiente: `NODE_OPTIONS=--import=tsx electron ./src/main.ts`, validado ponta a ponta (main process carrega `@atlas/core` e toda a árvore transitiva sem erro de módulo). Descobrimos também que `preload.js` colide com `"type": "module"` no `package.json` do app: o preload do Electron usa `require('electron')` (CommonJS), e um `.js` puro seria interpretado como ESM pela resolução de módulos do Node mais próxima — renomear para `preload.cjs` resolve sem exigir um `package.json` aninhado.

**A arquitetura ajudou porque...**

o padrão casca-fina (`main.ts`) × camada testável (`core-bridge.ts`) da SPEC-0003 se transplantou para um segundo app quase sem fricção — toda a lógica de valor (`resolveStatusSnapshot`) ficou isolada do runtime gráfico e testável no Vitest sem Electron, preservando autor≠verificador mesmo sem harness E2E. A fronteira de contratos públicos (`createAtlas`/`@atlas/contracts`) também se provou genérica o bastante para um segundo consumidor sem qualquer mudança em `@atlas/core`/`@atlas/contracts` — zero diff nesses packages, confirmando que a Constituição (Artigo 4) já bastava para acomodar uma segunda interface.

**A arquitetura atrapalhou porque...**

o smoke visual de um app Electron não é executável no shell de automação usado nesta sessão (sem WindowServer/display anexado) — `app.whenReady()` nunca resolve nesse ambiente, exigindo confirmação humana em sessão gráfica real antes de fechar a SPEC. Não é uma falha do design do Atlas, mas um atrito real de processo que vai se repetir nas próximas fatias desktop (2.2-2.4): toda mudança visual dessa camada carrega uma etapa que só um humano pode validar.

**Precisamos mudar...**

nada de estrutural agora — o atrito do smoke manual é inerente a GUI e já está documentado como padrão esperado (`apps/desktop/CLAUDE.md`, Observações da SPEC). Encaminhamento: nenhum ADR/SPEC novo necessário; as próximas SPECs da Fase 2 (2.1-restante/2.2) devem repetir explicitamente o mesmo aviso de confirmação humana pendente no seu próprio Definition of Done, em vez de assumir que o ambiente de automação consegue validar visualmente.

## [SPEC-0030](specs/SPEC-0030-query-aware-memory-recall.md) — Injeção de memória guiada pela consulta do turno (2026-07-22)

**Descobrimos que...**

fechar a fatia futura nomeada textualmente pela SPEC-0027 (consumo de `search` pelo Cognitive a partir da consulta do turno) coube, de novo, num parâmetro **opcional** em `MemoryService.prompt` — o mesmo molde aditivo que já vinha protegendo os fakes de `MemoryService` desde a SPEC-0026 se repetiu aqui pela **3ª vez** (após SPECs 0026 e 0029), e desta vez também no tipo interno `CognitiveCoreDeps.memoryPrompt`: `() => string` é atribuível a `(query, limit) => string` em TypeScript, então nenhum fake zero-arg em `@atlas/cognitive` precisou de reescrita. O `architecture-reviewer` aprovou a SPEC **sem veto** — 1ª aprovação direta desde a SPEC-0027 numa fatia que toca `@atlas/memory`/`@atlas/cognitive`/`@atlas/core`/`@atlas/contracts` simultaneamente — mas registrou 5 achados não-bloqueantes que a implementação incorporou: o orçamento (`limit`) restringe **número de fatos**, não bytes, então "fecha o custo do ADR-0011" era overclaim (a nota de atualização foi corrigida para "contém parcialmente"); o no-op de `remember` (SPEC-0022) só reconhece duplicata **textual exata normalizada**, então uma reproposição parafraseada pelo learner é gravada como `Fact` novo; e — consequência composta dos dois pontos anteriores — com acervo maior que o orçamento e consulta sem match, o completamento por ordem de carga ascendente favorece sistematicamente os fatos **mais antigos**, deixando o fato recém-aprendido invisível ao `memoryValue` até casar lexicalmente com alguma consulta futura, o que aumenta a chance de o learner re-propor exatamente esse fato.

**A arquitetura ajudou porque...**

o precedente "porta interna ganha argumentos, não vira uma segunda porta" (D3, molde do próprio `memoryPrompt`/SPEC-0021 e do `skillCatalog?`/SPEC-0026) evitou a pergunta "qual provider vence" que uma porta nova (`memoryRecall?`) coexistindo com `memoryPrompt` teria introduzido. A autoridade exclusiva da Memory sobre recuperação (Artigo 11) manteve a seleção e a composição por seções (`fact → project → episode`, SPEC-0029) inteiramente dentro de `@atlas/memory` — o Cognitive e o Core nunca precisaram conhecer `Fact[]`, só reusar `search` (SPEC-0027) por trás de um helper puro top-level (`selectFacts`). O teto fixo embutido (`MEMORY_RECALL_LIMIT = 20`) seguiu o molde já estabelecido por `REPLAN_BUDGET`/teto de 3 do learner — nenhuma decisão de design nova sobre "onde vive uma constante de composição de prompt".

**A arquitetura atrapalhou porque...**

nada estrutural. O único atrito real foi de teste: o primeiro caso de "ordem de carga" escrito pelo implementer partiu de uma expectativa errada — assumiu que o fato mais relevante apareceria **por último** na saída — quando a implementação correta preserva a ordem de carga do array inteiro, não a ordem de inserção no `Set` de seleção; só foi detectado rodando o teste e inspecionando a saída real. Um segundo ponto pequeno, de estilo: `prompt` precisou de auto-referência a `service.search`, forçando o objeto literal do `MemoryService` a virar `const service: MemoryService = {...}; return service;` em vez do retorno direto do literal usado até aqui — desvio pequeno e local, não repetido em nenhum outro lugar do arquivo.

**Precisamos mudar...**

nada por encaminhamento estrutural novo — os 5 achados do `architecture-reviewer` já foram corrigidos na própria implementação/documentação desta SPEC (nota do ADR-0011 diz "parcialmente", nota do ADR-0016 nomeia a lacuna de paráfrase e a interação com a ordem de carga). Um encaminhamento de processo, não bloqueante, registrado aqui por já ser a 2ª vez que aparece nesta mesma família de SPECs: o **contra-padrão útil** "parâmetro opcional em método de interface é aditivo de verdade em TS por atribuibilidade de aridade" merece uma nota permanente (não só em Lessons Learned) para quem for desenhar a próxima mudança em `MemoryService`/`CognitiveCoreDeps` — encaminhamento: se o padrão se confirmar numa 4ª SPEC, considerar registrá-lo como observação estável no `DevelopmentGuide.md`, não antes (ainda é conhecimento tácito replicável por leitura deste arquivo). O teto por **tamanho de texto** (bytes) que o ADR-0011 nomeou como custo não fechado por esta fatia segue candidato aberto de 1.3, sem encaminhamento novo além do já registrado no próprio Roadmap.

## [SPEC-0029](specs/SPEC-0029-episodic-project-memory.md) — Categorias de conhecimento no Memory Service: memória episódica e memória de projetos (2026-07-22)

**Descobrimos que...**

o gate remanescente da Fase 1 (1.3, l. 90) — "mais de uma categoria de conhecimento" — coube inteiro num único tipo `Fact` com dois campos opcionais (`category?`, `subject?`) e um terceiro parâmetro opcional em `remember`, sem tocar `search`/`forget`/a porta `MemoryStorage`. O `architecture-reviewer` vetou a 1ª versão da SPEC (1 rodada, sem escalação) com três achados: **F1** — a invariante "memória de projeto exige projeto" estava desenhada para viver só na CLI, deixando a autoridade do estado persistente (Artigo 11) fora do módulo que a Constituição atribui a ela; corrigida movendo a validação (`MemoryError`, antes de qualquer mutação/`storage.save`) para dentro do `@atlas/memory`, com a CLI só antecipando a mensagem amigável. **F2** — a fail-closed ficou incompleta: um `subject` que colapsasse para vazio (`''`/`'   '`/`'\t\n'`) após `normalize` teria colapsado, na chave de duplicata, para a mesma chave de "projeto sem nome" que a invariante deveria proibir — corrigido tratando qualquer `subject` em branco como ausente e inválido, não como "sem projeto". **F3** — o formato/ordem da seção `project` em `prompt()` estava descrito vagamente na 1ª versão, no caminho mais sensível do sistema (o texto entra no system prompt de toda geração); corrigido fixando literalmente o formato (`[projeto <subject>]`, ordem por primeira ocorrência na carga) para o `spec-validator`/`spec-closer` não precisarem inventar a expectativa.

**A arquitetura ajudou porque...**

o padrão "membro novo 100% opcional/aditivo em `MemoryService`" (confirmado desde a SPEC-0026) evitou de novo a cascata de quebra de `typecheck` dos fakes tipados diretamente (`apps/cli/tests/status.test.ts` compilou sem alteração) — 2ª ocorrência desse contra-exemplo depois da SPEC-0026, contra as 6+ ocorrências do padrão oposto (membro obrigatório novo quebra o typecheck) registradas nas SPECs 0017–0027. O helper `normalize` interno (SPEC-0022) absorveu a extensão da chave de duplicata (categoria+subject+texto) sem duplicação, e o precedente de "nota de atualização no ADR-0011 em vez de ADR novo" (SPECs 0021/0022/0023/0027) se aplicou de novo sem atrito — nenhuma fronteira estrutural nova foi revisitada, só uma capacidade já documentada no Module Catalog ("Deve gerenciar: memória de projetos; memória episódica") passou a existir na implementação.

**A arquitetura atrapalhou porque...**

nada estrutural; o atrito real foi um erro mecânico do `spec-implementer`: ao escrever o separador da chave de duplicata via `Edit` inline, um byte de controle **NUL literal** foi gravado por engano no arquivo-fonte, só detectado porque `grep` passou a reportar "binary file matches" em vez de dar match normal em texto. Regra derivada: nunca inserir caracteres de controle literais via `Edit`/`Write` — sempre a forma escapada da linguagem-alvo (aqui, `''`). Um segundo ponto, de ferramenta e não de arquitetura: o wrapper `rtk`/hook de `grep` devolveu saídas inconsistentes ("N matches in 0 files", "Binary file matches") para buscas simples em arquivo texto, exigindo cair para `\grep` bruto.

**Precisamos mudar...**

nada por encaminhamento estrutural novo — a invariante já vive na autoridade certa (F1) e a fail-closed já cobre o branco (F2). Um encaminhamento de processo, não bloqueante: registrar a regra "nunca escrever caracteres de controle literais via `Edit`/`Write`" como um item de atenção mecânica para o `spec-implementer` — não exige ADR nem SPEC nova, é observação para a próxima revisão de conteúdo do fluxo de implementação, já coberta por esta própria entrada de Lições Aprendidas (encaminhamento: nenhuma ação adicional além deste registro; se o atrito se repetir, considerar nota no `DevelopmentGuide.md`). A assimetria de renderização entre `memory search` e `memory list` e o filtro por categoria em `search`, observados pelo `architecture-reviewer`, seguem fora de escopo por decisão consciente do próprio reviewer, sem encaminhamento pendente.

## [SPEC-0028](specs/SPEC-0028-git-read-only-tools.md) — Tools de git somente-leitura (`git_status`/`git_diff`/`git_log`) em `@atlas/tools` (2026-07-22)

**Descobrimos que...**

a premissa inicial da SPEC ("os requisitos de `git_status`/`git_diff`/`git_log` são idênticos aos de `list_dir`") era **falsa** e só se revelou no gate do `architecture-reviewer` (1º veto, sem escalação): `list_dir` nunca lê acima do path declarado, mas `git status`/`diff`/`log` **sobem pelos diretórios pais** até encontrar o toplevel do repositório — com `readRoots = [/proj/packages/tools]`, o gate aprovaria esse diretório enquanto o git relataria (e, no `diff`, imprimiria o conteúdo de) todo `/proj`. É exatamente o defeito que o ADR-0013 nomeou ("o valor do portão está em julgar o recurso concreto"), reintroduzido por outro caminho: o recurso declarado não seria o recurso lido. A correção (descobrir o toplevel real via `rev-parse` → `realpath` → aplicar `verify` sobre ele, só então rodar o subcomando) reusou inteiramente o predicado `Verify` e o critério de residual documentado do ADR-0014/SPEC-0024, sem abrir ADR novo. Um segundo achado do gate, menor mas real: `git status` pode atualizar `.git/index` (refresh do stat cache) e tomar lock — escrita real sob veredicto `read` num repositório com `writeRoots` vazio por default; resolvido com `--no-optional-locks` obrigatório em todo argv, asseverado por spy, em vez do caminho mais caro de promover `git_status` para `access: 'write'`.

**A arquitetura ajudou porque...**

o padrão "Tool declara `requirements` como dado + porta injetável aplica o veredicto no instante do uso" (ADR-0013/ADR-0014) absorveu uma porta inteiramente nova — que descobre um recurso em vez de recebê-lo pronto — sem precisar de nenhuma peça arquitetural nova: o `Verify` de `fs-port.ts` foi reusado tal e qual, e `@atlas/core` já sabia fiar `permissions.isContained.bind(permissions)` para uma porta com essa forma. O precedente de `list_dir` ficando fora do fecho atômico do ADR-0014 ("sem fd a ancorar, residual documentado") deu o molde exato para tratar o TOCTOU do diretório-alvo aqui: mesma linguagem, mesmo critério de quando documentar em vez de fechar. `Fora do Escopo` explícito no Roadmap (l. 100) — "execução de comandos arbitrários é fatia separada, `ADR primeiro`" — deu um limite nítido para a allowlist de opções (`staged`/`maxCount`), evitando que o teto de saída fosse "resolvido" abrindo refs/ranges arbitrários.

**A arquitetura atrapalhou porque...**

nada estrutural novo; o único atrito de implementação foi a **recorrência** já registrada na lição da SPEC-0020: `exactOptionalPropertyTypes` quebrou os fakes de teste de `git-diff`/`git-log` ao propagar `opts?` possivelmente `undefined` para um campo opcional de array literal, corrigido com `opts ?? {}` no fake. O padrão recorrente de "membro novo em contrato quebra o `typecheck` dos fakes tipados diretamente" (confirmado 6ª+ vez nas SPECs 0017–0027) **não** se repetiu aqui — a Tool nova é aditiva via Tool Registry, `@atlas/contracts` ficou com diff vazio.

**Precisamos mudar...**

nada por encaminhamento estrutural novo. Um encaminhamento pontual, não bloqueante, já registrado nesta entrega: a próxima fatia de "leitura de estrutura de projeto" (mesmo item 1.4 do Roadmap) deveria reusar a descoberta de toplevel via `rev-parse --show-toplevel` desta SPEC em vez de reimplementá-la — observação do `architecture-reviewer`, encaminhamento: considerar na SPEC que fizer essa fatia (documentação, sem ADR necessário). Um segundo ponto de processo, registrado para calibrar decisões futuras de "cabe na sessão": esta SPEC teve custo alto de contexto (drafter 2 rodadas, reviewer 2 rodadas, implementer interrompido por limite mensal de gasto no meio da implementação e retomado por `SendMessage` com contexto intacto) — encaminhamento: nenhuma mudança de processo pedida, só registrar que retomar o mesmo agente por `SendMessage` preservou o trabalho já em disco sem custo de re-explicação, e que o `TOKEN_USAGE_LOG.md` deve refletir esse custo real (o `spec-closer` não edita essa tabela manualmente — é regenerada por `scripts/claude-usage-report.py`).

## [SPEC-0027](specs/SPEC-0027-memory-fact-retrieval.md) — Busca/recuperação determinística de fatos no Memory Service (2026-07-21)

**Descobrimos que...**

adicionar `search` a `MemoryService` confirmou pela **6ª+ vez** (após SPECs 0017/0019/0022/0023/0025/0026) o padrão recorrente já documentado: um membro novo **obrigatório** numa interface de contrato já pública quebra o `typecheck` só dos fakes **tipados diretamente** contra o tipo (aqui, de novo, só `apps/cli/tests/status.test.ts`) — os fakes com `as unknown as AtlasPlatform`/`stubAtlas` seguem escapando do `typecheck` e só quebrariam em `pnpm test` se de fato chamassem `search`. A implementação em si não teve nenhuma decisão de design em aberto: o algoritmo (overlap de tokens sobre `normalize`, desempate por índice, `limit` opcional) já veio inteiramente fechado nas Decisões de design da SPEC, e a reuso de `normalize` (SPEC-0022) evitou qualquer duplicação de "o que conta como mesmo texto" entre `remember`/`dedupe`/`search`. O `architecture-reviewer` aprovou sem veto, mas notou um desalinhamento cosmético entre o "Resultado Esperado" da SPEC (o exemplo `atlas memory search "aniversário"`) e o que `normalize` de fato entrega — sem acento, sem substring, só espaço+caixa — um texto que "vende" mais matching do que o algoritmo cumpre.

**A arquitetura ajudou porque...**

o precedente de `dedupe` (SPEC-0023) — método aditivo em `MemoryService`, reusando `normalize` interno, mesmo critério de desempate por ordem de carga — deu um molde exato a seguir, sem inventar uma segunda convenção de ranking/desempate no mesmo módulo. `search` ficou puro/síncrono/sem IO por construção (varre só o array `facts` já carregado, nunca toca `MemoryStorage`), preservando a autoridade exclusiva da Memory sobre o estado persistente (Artigo 11) sem esforço extra; a CLI seguiu só invocando/renderizando, sem acessar `normalize`/`storage` (Artigo 5). Retorno homogêneo com `list()` (`Fact[]`, sem expor scores) manteve a CLI reaproveitando o mesmo formato de renderização.

**A arquitetura atrapalhou porque...**

nada estrutural; o único atrito foi o já conhecido (fakes tipados diretamente quebrando `typecheck` em membro novo de contrato) — não é atrito da arquitetura de produção, é o custo já registrado de estender uma interface pública com múltiplos fakes na base de testes.

**Precisamos mudar...**

nada por encaminhamento estrutural novo — o padrão de fakes quebrando `typecheck` já está documentado e não pede correção de processo (grep pelo **nome do tipo**, não pela construtora, segue a mitigação correta). Vale só um encaminhamento pontual, não bloqueante: o texto do "Resultado Esperado" da SPEC-0027 (e de qualquer exemplo futuro que documente `search`/`atlas memory search`) deveria evitar sugerir matching semântico ou por substring que o `normalize` (espaço+caixa, sem acento/stemming) não entrega — encaminhamento: ajustar o texto na próxima revisão de conteúdo do arquivo da SPEC-0027 ou da futura SPEC que fizer o Cognitive Core consumir `search` (documentação, não código; sem ADR necessário).

## [SPEC-0026](specs/SPEC-0026-planner-skill-consumption.md) — Consumo de Skills no laço cognitivo: seleção pelo Planner (2026-07-21)

**Descobrimos que...**

o consumo automático de Skills coube inteiro dentro do molde já validado de Persona/Memory (ADR-0010/0011) sem reabrir nenhuma fronteira nova, mas exigiu três ajustes finos que a SPEC não detalhava em código: (1) o `Plan.skillId` selecionado precisa ser **rastreado por passe** — `runPlanCycle` guarda `activeSkillId` e o reatribui a cada replanejamento (`activeSkillId = replanPlan.skillId`), porque o `Plan` inicial e o `Plan` de replan são objetos distintos e só o **último** plano em vigor deve decidir a Skill aplicada na composição; (2) em `respond`, a injeção das `instructions` da Skill exigiu reaplicar `withFreshSystemHead` (helper da SPEC-0021) **só na mensagem enviada à chamada de composição** — a `Conversation` retornada ao chamador nunca leva a Skill, preservando a invisibilidade (Artigo 9) sem reabrir o desenho de `respond` puro; (3) o teste de fiação ponta a ponta em `@atlas/core` (Critério de Aceitação: "a Skill semeada aparece no catálogo oferecido ao Planner") não pôde usar o provider `fake` do Model Gateway — ele só ecoa a última mensagem enviada e não expõe o `systemPrompt` de planejamento para inspeção —, então o teste precisou compor `provider: 'remote'` com um `fetch` fake que captura o corpo da requisição, replicando o padrão já usado alhures no repo para inspecionar mensagens enviadas ao gateway. Nenhum desses três ajustes quebrou fake nenhum: como `Plan.skillId?`, `CognitiveCoreDeps.skillCatalog?` e `Planner.instruction(tools, skills?)` são **todos opcionais/aditivos**, esta é a primeira SPEC desde a SPEC-0019 que toca um contrato consumido amplamente (`Plan`, `CognitiveCoreDeps`) sem disparar o padrão recorrente "membro novo quebra o `typecheck` dos fakes tipados diretamente" (confirmado em SPECs 0017/0019/0022/0023/0025) — confirma, ao contrário, que optatividade total é a mitigação real desse padrão, não apenas um paliativo.

**A arquitetura ajudou porque...**

o ADR-0018 já havia fixado a forma exata (seleção no Planner, aplicação na composição, `skillId` viaja só no `Plan`) e a fronteira de menor privilégio (`SkillCatalogPort` — projeção `list`/`get`, não o `SkillRegistry` inteiro) antes da implementação começar — a SPEC-0026 não teve nenhuma decisão de design em aberto, só execução. O padrão de tipo **interno** ao package que recebe o dado por injeção (`SkillCatalogPort` não sobe a `@atlas/contracts`, mesmo critério do `memoryPrompt` provider da SPEC-0021) manteve o Planner e o Cognitive Core sem importar `@atlas/skills`, verificável por grep — a Regra 5 (componentes desacoplados) e a proibição "Runtime não escolhe Skills" (Module Catalog l. 470) saíram intactas sem esforço extra. `runPlanCycle`, compartilhado por `ask`/`respond` desde a SPEC-0014, de novo fez a fatia valer para os dois comandos a partir de um único ponto de resolução do `skillId`.

**A arquitetura atrapalhou porque...**

nada estrutural; o único atrito real foi a limitação do provider `fake` do Model Gateway para inspecionar o `systemPrompt` de planejamento em teste de fiação de `@atlas/core` — não é uma limitação da arquitetura de produção, é uma lacuna do fake de teste (não expõe as mensagens recebidas), contornável com `remote`+`fetch` fake, mas que exige conhecer esse contorno de antemão.

**Precisamos mudar...**

nada por encaminhamento estrutural novo — o padrão recorrente de fakes quebrando o `typecheck` ao adicionar campo obrigatório/membro obrigatório a contrato já está registrado nas lições anteriores (SPECs 0017/0019/0022/0023/0025) como conhecimento acumulado, sem precisar de nova entrada; esta SPEC apenas reforça, pelo lado oposto, que campos **opcionais/aditivos** de fato evitam a cascata (comportamento já documentado, sem mudança de processo necessária). Vale registrar, para quem revisar o processo de fechamento: o `SPEC-TEMPLATE.md` (Definition of Done) e o `ClaudeCodeAutomation.md` (passo de fecho do `spec-closer`) já convergem — a SPEC-0026 explicitamente delegou lições/docs vivas ao passo `doc-sync`/`spec-closer`, sem repetir a contradição registrada na lição da SPEC-0019 (l. 19) — não é mais candidato a encaminhamento, apenas confirmação de que a correção daquela SPEC segurou.

## [SPEC-0025](specs/SPEC-0025-skills-registry-builder.md) — Skills: Skill Registry passivo + Skill Builder (2026-07-21)

**Descobrimos que...**

o padrão recorrente de "membro novo em `AtlasPlatform` quebra só os fakes tipados diretamente" se confirmou de novo, agora pela 4ª+ vez: adicionar `skills`/`skillBuilder` a `AtlasPlatform` (`packages/contracts/src/platform.ts`) quebrou o `typecheck` só de `apps/cli/tests/status.test.ts` (o único fake que implementa `AtlasPlatform` estruturalmente, sem cast); os fakes com `as unknown as AtlasPlatform`/`stubAtlas` usados em `ask.test.ts`/`chat.test.ts`/`memory.test.ts` seguiram escapando do `typecheck` e só teriam sido pegos por `pnpm test` se algum deles invocasse `skills`/`skillBuilder` diretamente — o que não ocorreu nesta fatia, então nem chegaram a quebrar. Também confirmamos que o fluxo ADR-primeiro (Emenda v1.1) funcionou como desenhado: o `architecture-reviewer` deu 1 veto no ADR-0017 (Builder subespecificado — risco real de Skills fabricadas sem Tools mesmo com o Glossary exigindo "conhecimento + regras + Tools"; "contrato bem-formado" vago o bastante para permitir uma implementação spec-compliant porém degenerada; colisão de `id` no upsert do Registry sem trava contra rebaixar uma `permanent`) e a correção coube numa única rodada, sem escalar ao humano.

**A arquitetura ajudou porque...**

o Skill Registry copiou o molde já validado do Tool Registry (`createToolRegistry`, SPEC-0010) sem precisar reabrir nenhuma decisão de forma, e o Skill Builder isolou o único julgamento semântico (a chamada a `gateway.generate`) no mesmo padrão do `learner` (ADR-0016) — parse tolerante a falha, nunca lança, campos determinísticos (`id`/`version`/`scope`) atribuídos fora do que o modelo produz. `@atlas/skills` depender só de `@atlas/contracts`, com `@atlas/core` como único importador de implementação (Regra 11), manteve o "diff de produção vazio" em Planner/Cognitive/Runtime/Observer inteiramente verificável por grep + suíte, exatamente como o Critério de Aceitação previa.

**A arquitetura atrapalhou porque...**

nada a registrar — a primeira fatia deliberadamente **passiva** (capacidade sem consumidor no laço cognitivo) não expôs nenhuma fricção estrutural nova; a única fricção foi o atrito de tipo já conhecido e documentado acima.

**Precisamos mudar...**

nada por encaminhamento novo nesta entrada — o próprio ADR-0017 já nomeia a fronteira da fatia futura (consumo de Skills pelo Planner/usuário) como candidato de Roadmap, não como pendência aberta por esta SPEC. A persistência de Skills em disco (Artigo 11 — autoridade exclusiva da Memória sobre estado persistente não se aplica aqui, mas a ausência de storage é decisão consciente do ADR-0017) permanece nomeada como fatia futura no próprio ADR, sem novo encaminhamento necessário.

## [SPEC-0024](specs/SPEC-0024-fs-port-fail-closed-verify.md) — Endurecer o `verify` das portas de FS para fail-closed por default (2026-07-20)

**Descobrimos que...**

um residual de segurança-por-default nomeado explicitamente numa lição anterior (a desta própria `LESSONS_LEARNED.md`, entrada da SPEC-0017, l. ~198/210) pode ser fechado sem reabrir o desenho que o originou: a inversão do default de `verify` (`() => true` → `() => false`) em `nodeFsReadPort`/`nodeFsWritePort` entregou o ganho de segurança inteiro (porta crua sem autoridade injetada passa a recusar) com um diff de duas linhas de valor + JSDoc, porque o comportamento de produção nunca dependia do default — `createAtlas` sempre fiava `verify` real desde a SPEC-0017. O `architecture-reviewer` confirmou o Perfil `micro` no gate, e o ramo micro (Emenda v1.2) coube exatamente como desenhado: sem `spec-validator` separado, o `spec-closer` validou (lint/typecheck/test/format:check + Critérios de Aceitação) e fechou no mesmo cold-start.

**A arquitetura ajudou porque...**

a separação de autoridade do ADR-0013/0014 (porta aplica um predicado injetado; a autoridade real de contenção mora só em `@atlas/permissions`, fiada por `@atlas/core`) tornou a mudança de postura do *default* uma decisão isolada e local — não exigiu tocar `@atlas/core`, `@atlas/contracts` nem `@atlas/permissions`, e não teve efeito observável em produção, só em consumidores crus/futuros da porta. É o mesmo raciocínio que já havia adiado a decisão "obrigatório vs. fail-closed" na SPEC-0017: manter `verify` opcional (em vez de forçar assinatura obrigatória nos seis Tool factories) preservou a Regra 5 (Tools não conhecem `@atlas/permissions`) e manteve o raio de mudança mínimo mesmo ao endurecer a postura.

**A arquitetura atrapalhou porque...**

nada a registrar — nenhum atrito real na sessão; a implementação seguiu TDD (RED: reescrever o caso "permissivo" esperando recusa → GREEN: inverter o default) exatamente como a Estratégia de Implementação previa, e a suíte de regressão com `verify` injetado permaneceu verde sem alteração de expectativa.

**Precisamos mudar...**

nada a registrar — os residuais conscientes do ADR-0014 (delete/mkdir/list_dir sem fecho atômico, troca de ancestral, Windows) seguem documentados como abertos e esta SPEC não teve a pretensão de fechá-los; nenhum encaminhamento novo surgiu.

## [SPEC-0023](specs/SPEC-0023-legacy-fact-consolidation-dedupe.md) — Consolidação determinística do acervo legado de fatos (`atlas memory dedupe`) (2026-07-20)

**Descobrimos que...**

o achado F1 do gate corrigiu, para esta SPEC, qual artigo realmente exige subir `dedupe` ao contrato `MemoryService`: **não** é a regra do "2º consumidor"/"promoção de tipo local" do ADR-0007 — `MemoryService` **já era** contrato público consumido por CLI e core antes desta SPEC, então adicionar um método a ele não é promoção de nada. O fundamento correto é o Artigo 11 (autoridade exclusiva da Memory sobre o estado persistente) + Artigo 5 (Tools/CLI não reimplementam lógica de outro módulo): sem o método no contrato, a CLI teria de acessar `normalize`/`storage` internos de `@atlas/memory` para consolidar, o que vazaria autoridade de escrita para a borda. É uma distinção que provavelmente se repete: "isto precisa subir ao contrato?" tem dois motivos possíveis e diferentes — 2º consumidor (ADR-0007) e autoridade exclusiva de módulo (Artigo 11/5) — e só um deles se aplica quando o contrato já é público.

Confirmamos também, numa 3ª+ ocorrência, o padrão recorrente já registrado nas lições da SPEC-0017/SPEC-0022: adicionar um membro a uma **interface de contrato** (aqui, `MemoryService.dedupe`) quebra o `typecheck` só dos fakes tipados diretamente contra essa interface — nesta SPEC, apenas o fake de `apps/cli/tests/status.test.ts`. Os fakes com `as unknown as AtlasPlatform`/`stubAtlas` em `apps/cli/tests/ask.test.ts`/`chat.test.ts` seguiram escapando do `typecheck` por completo (o cast anula a checagem estrutural) — só `pnpm test` os exporia se de fato chamassem `dedupe`, o que não chamam. O padrão já é conhecido o bastante para ser tratado como regra, não como achado novo a cada SPEC.

Por fim, o formato real do storage em disco (`{ facts: [...] }`, um objeto com a chave `facts`, não um array bruto) não estava descrito em nenhum lugar da própria SPEC — teve de ser inferido lendo `packages/memory/src/memory-service.ts`/o adapter de storage para poder escrever o teste E2E da CLI em `tmpdir` corretamente.

**A arquitetura ajudou porque...**

a consolidação reusou por inteiro o `normalize(text)` puro interno já existente desde a SPEC-0022 (mesmo helper, zero duplicação), e o `dedupe` novo viveu inteiramente dentro de `@atlas/memory`, com a CLI só invocando e renderizando — nenhum outro módulo (`@atlas/cognitive`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context`) precisou de qualquer mudança de produção. O invariante `createdAt` sempre gerado via `toISOString()` (confirmado no código, achado F3 do `architecture-reviewer`) fez a comparação lexicográfica de string equivaler exatamente à ordem cronológica, sem exigir parsing de data.

**A arquitetura atrapalhou porque...**

nada estrutural; o único atrito real foi de documentação da própria SPEC, não de arquitetura — o formato de storage em disco (`{ facts: [...] }`) precisou ser inferido do código-fonte para o teste E2E, porque nenhuma SPEC anterior (SPEC-0009, SPEC-0020, SPEC-0022) documentou o formato do arquivo JSON persistido, só a API do `MemoryService`.

**Precisamos mudar...**

nada que exija ADR, documentação nova ou SPEC dedicada agora: o achado F1 (distinção 2º-consumidor × autoridade-exclusiva como dois motivos diferentes de subir algo ao contrato) e a 3ª+ ocorrência do padrão de fakes com cast escapando do `typecheck` já estão registrados aqui e nas lições anteriores — ficam como conhecimento acumulado, sem novo encaminhamento de documentação estrutural. Se a distinção do gate (2º consumidor vs. autoridade exclusiva) voltar a gerar confusão numa 3ª SPEC, aí sim vale um encaminhamento para o `DevelopmentGuide.md` ou o ADR-0007.

## [SPEC-0022](specs/SPEC-0022-deterministic-fact-deduplication.md) — Deduplicação determinística dos fatos aprendidos no Memory Service (2026-07-20)

**Descobrimos que...**

a mudança de assinatura de `MemoryService.remember` (`Promise<Fact>` → `Promise<{ fact, created }>`) confirma, numa variante nova, o corolário já conhecido sobre grep de contrato: o `architecture-reviewer` (achado F1) e o próprio implementador constataram que **nem todo fake quebrado aparece no mesmo canal de verificação**. Os fakes de `MemoryService` em `apps/cli/tests/*` que usam cast (`as unknown as AtlasPlatform`/`stubAtlas`) **anulam** a checagem de tipo do retorno — só `pnpm test` os expõe (a asserção de `created`/`renderLearned` falha em runtime), não `pnpm typecheck`; só `remember.ts` (consumidor direto, sem cast) quebrava o typecheck de fato. Na prática isso reapareceu como lacuna real: o fake de `MemoryService` em `apps/cli/tests/status.test.ts` **não estava no grep original** (`MemoryService`/`.remember(`) citado pela própria SPEC como suficiente — foi só o typecheck direto (sem cast) que o expôs durante a implementação. Depois, o `spec-validator` ainda pegou uma 2ª lacuna: o ramo `created: false`/"Já conhecido" de `atlas remember` (E2E) não tinha nenhum teste cobrindo-o — só o `created: true` original.

**A arquitetura ajudou porque...**

o desenho de `normalize`/no-op ficou inteiramente contido em `@atlas/memory` (helper puro interno, sem IO, sem subir a `@atlas/contracts` — mesmo critério já usado para `Planner`/`Observer`/`Learner`/`compose` nas SPECs anteriores). A mudança de contrato, embora não-aditiva, tocou só os 3 call sites já mapeados pela própria SPEC e nenhum outro módulo (`@atlas/cognitive`, `@atlas/runtime`, `@atlas/permissions`, `@atlas/tools`, `@atlas/model-gateway`, `@atlas/persona`, `@atlas/context` seguiram com diff vazio) — a autoridade exclusiva da Memory sobre o estado persistente (Artigo 11) absorveu a mudança sem revisitar fronteira nenhuma; só ganhou nota de atualização no ADR-0011.

**A arquitetura atrapalhou porque...**

nada estrutural; o atrito foi de **processo de verificação**, não de arquitetura: mudança de assinatura de retorno em membro de interface de contrato, testada por fakes com cast que **mascaram erro de tipo**, é uma combinação que já se provou capaz de esconder um fake não migrado do próprio `typecheck` (2ª ocorrência do padrão F1/status.test.ts — recorrência, não redescoberta) — e, separadamente, cobertura E2E de um ramo `else`/negativo que a Estratégia de Testes da SPEC não obrigou explicitamente até o `spec-validator` reprovar.

**Precisamos mudar...**

quando uma SPEC futura mudar a assinatura de retorno de um membro de interface de `@atlas/contracts` consumido por fakes com cast (`as unknown as`/`stubAtlas`), o Checklist para IA deve instruir explicitamente a rodar `pnpm test` (não só `pnpm typecheck`) como o verificador real de migração de fakes, e a listar cada arquivo de teste que usa esse padrão de cast como candidato a checar manualmente — o grep textual por tipo/método sozinho não é suficiente quando há cast no meio (encaminhamento: atualizar `docs/implementation/templates/SPEC-TEMPLATE.md`, seção "Estratégia de Implementação"/"Checklist para IA", com essa instrução, na próxima SPEC que tocar um contrato consumido por fakes com cast — sem SPEC dedicada só para isso).

## [SPEC-0021](specs/SPEC-0021-live-memory-prompt-recomposition.md) — Recomposição ao vivo do `memoryPrompt` no Cognitive Core (2026-07-20)

**Descobrimos que...**

a fatia que a SPEC-0020 deixou como residual documentado (recompor o `memoryPrompt` ao vivo) fechou de uma vez as duas limitações que aquela SPEC aceitou como custo — o fato aprendido/gravado passa a valer já no próximo turno da mesma sessão, **e** o `learner` passa a ver os fatos já preservados e a ser instruído a não os re-propor (supressão da duplicação intra-sessão **por instrução ao modelo, sem garantia determinística**, honestamente descrita como tal, não como eliminação). A troca `memoryPrompt: string` → `memoryPrompt: () => string | undefined` (provider síncrono amostrado 1x por turno) confirmou pela terceira vez o corolário das SPECs 0019/0020: por ser um tipo **interno** a `@atlas/cognitive` (não sobe a `@atlas/contracts`, mesmo critério de `Planner`/`Observer`/`Learner`), a mudança ficou **contida** — nenhuma cascata de fakes fora do próprio package, `apps/cli` e `packages/contracts` com diff **vazio**. O `exactOptionalPropertyTypes` reapareceu como no de sempre, mas desta vez a favor: como o provider passa a ser **sempre definido** em `@atlas/core` (`() => memory.prompt()`), o spread condicional que existia (`...(memoryPrompt !== undefined ? { memoryPrompt } : {})`) foi **removido** por atribuição direta — o mesmo mecanismo que na SPEC-0020 forçou o spread aqui o dispensou. O `spec-implementer` não tropeçou em nada previsto pela SPEC (o Fluxo Esperado já desenhava `compose`, a amostragem única e a substituição da cabeça); o único ajuste de forma foi `withFreshSystemHead` ficar como função top-level pura (não closure), por não depender de `personaPrompt`/`memoryPrompt`.

**A arquitetura ajudou porque...**

o `runPlanCycle` compartilhado (SPEC-0014) de novo fez a fatia valer para `ask` **e** `respond` a partir de um único ponto de amostragem por turno. A fronteira do [ADR-0011](../06-adr/ADR-0011-memory-service-persistence.md) (Memory = autoridade exclusiva; injeção do `memoryPrompt` na geração) absorveu a mudança sem revisitar autoridade: trocou-se apenas a **forma** da injeção (string estática → provedor de string), e o Cognitive continua sem conhecer o conceito de Memory — recebe uma função `() => string | undefined`, não a Memory. A pureza do `respond` ([ADR-0008](../06-adr/ADR-0008-conversation-as-data.md)) sobreviveu à reescrita da mensagem `system`-cabeça porque a operação é determinística sobre a entrada (substituir a cabeça, ou inserir uma no topo quando não houver) — a `Conversation` retornada carrega o prompt fresco nos dois lados (enviado + devolvido), sem "prompt morto". Nenhum ADR novo foi necessário: a decisão estrutural já estava no ADR-0011, e a fatia entrou como **nota de atualização** em três ADRs (0008/0011/0016) — registro proporcional ao tamanho real da mudança.

**A arquitetura atrapalhou porque...**

nada a registrar. A mudança coube inteira no desenho existente; os únicos atritos (contenção do tipo interno, `exactOptionalPropertyTypes`) já eram conhecidos e desta vez jogaram a favor.

**Precisamos mudar...**

nada estrutural. A supressão da duplicação intra-sessão continua **por instrução ao modelo, sem garantia determinística** (o próprio ADR-0016 reconhece que modelos locais fracos podem não obedecer). A garantia real — **deduplicação determinística** (comparar/normalizar/consolidar fatos no storage) — segue como fatia futura já documentada no Fora de Escopo desta SPEC e no ADR-0016 (encaminhamento: nova SPEC futura, quando priorizada; mitigada até lá pela proveniência `Fact.source: 'learned'` e pelo `atlas forget`). Nenhum encaminhamento novo aberto por esta fatia.

## [SPEC-0020](specs/SPEC-0020-learning-post-turn-extraction.md) — Aprendizado: extração pós-turno proposta pelo Cognitive, gravada pela borda (2026-07-19)

**Descobrimos que...**

a revisão adversarial do `architecture-reviewer` pegou, ainda no Draft, um risco que o próprio [ADR-0016](../06-adr/ADR-0016-learning-proposed-extraction.md) **subdimensionou**: o ADR caracterizava a duplicação como "o mesmo fato aprendido duas vezes **em sessões diferentes**", mas a interação entre duas decisões da própria fatia (o `memoryPrompt` não é recomposto ao vivo **e** os fatos aprendidos não entram na `Conversation` retornada) torna a duplicação **intra-sessão** o caso pior: dentro de uma única sessão de `chat`, o modelo não recebe nenhum sinal de que já aprendeu um fato e pode re-propô-lo **a cada turno** — e o teto de 3 é por turno, não cumulativo. A correção foi só documental (custo aceito explícito na SPEC), mas confirma o valor do reviewer como etapa: um ADR recém-escrito e aprovado ainda pode errar a **magnitude** de um risco que declarou. O reviewer também exigiu ancorar o framing do `learner` no **Artigo 13** (extrair só fatos afirmados/fortemente implicados, nunca inferidos — com critério de aceitação testando o **conteúdo** do prompt, não só "string não-vazia") e sinalizar antecipadamente a mudança de assinatura do `runPlanCycle` — as três correções entraram no Draft antes do veto humano, e o implementador não tropeçou em nenhuma delas.

No fechamento, o `spec-validator` pegou uma omissão real do `spec-implementer`: a **nota de atualização no [ADR-0011](../06-adr/ADR-0011-memory-service-persistence.md)**, que a SPEC atribuía explicitamente ao implementador (é documentação da própria SPEC, não doc viva do doc-sync — fronteira corrigida no template pela lição da SPEC-0019), não foi escrita; o código estava 100%. Foi corrigida no fio principal antes do fecho. Primeira ocorrência — observar recorrência.

O corolário da SPEC-0019 confirmou-se pela segunda vez: **campos de contrato opcionais/aditivos** (`learned?`, `Fact.source?`, parâmetro opcional em `remember`) não dispararam nenhuma cascata de chamadores/fakes — `pnpm typecheck` verde sem tocar um fake. O atrito de tipo que apareceu foi outro, menor: com `exactOptionalPropertyTypes: true`, um campo opcional **não pode receber `undefined` explícito** — o retorno precisou de spread condicional (`...(learned.length ? { learned } : {})`) em vez de atribuição direta da variável.

**A arquitetura ajudou porque...**

o `learner` coube **inteiro** no molde já estabelecido duas vezes (Planner no [ADR-0012](../06-adr/ADR-0012-planner-runtime-execution.md), Observer no [ADR-0015](../06-adr/ADR-0015-observation-replan-loop.md)): função pura em `@atlas/cognitive`, `instruction()`/`parse()`, testável sem gateway, tipo interno que não sobe a `@atlas/contracts` — terceira etapa do ciclo cognitivo implementada com o mesmo padrão, custo de desenho quase zero. O `runPlanCycle` compartilhado (SPEC-0014) de novo fez a fatia valer para `ask` **e** `respond` com uma única mudança. E a fronteira do [ADR-0009](../06-adr/ADR-0009-context-service-value-store.md)/[ADR-0011](../06-adr/ADR-0011-memory-service-persistence.md) (borda medeia, serviço detém autoridade) resolveu de graça o dilema central da Etapa 6: o Cognitive **propõe** como dado (`learned?`), a borda grava pela mesma API pública que `atlas remember` já usa — pureza do `respond` (ADR-0008), autoridade exclusiva da Memory e transparência ao usuário saíram do mesmo desenho, sem porta nova.

**A arquitetura atrapalhou porque...**

o `runPlanCycle`, desenhado para "planejar → executar → compor", **não carregava o conteúdo cru do turno** (só `firstMessages` e `buildComposeMessages`) e tinha retorno antecipado no caminho "sem plano" — a extração pós-resposta exigiu reestruturá-lo (novo parâmetro/callback `buildLearnMessages`, fim do early return, `learned` em `PlanCycleResult`). Atrito pequeno e interno (sem contrato), antecipado pelo reviewer — mas é o segundo sinal (após o `denialKind` da SPEC-0019) de que cada etapa nova do ciclo pede do helper compartilhado um dado que ele ainda não transporta.

**Precisamos mudar...**

1. **Marcar a Etapa 6 (Aprendizado) como entregue** no [Roadmap](../04-engineering/Roadmap.md) — com ela, o item 1.2 (Fechar o Ciclo Cognitivo) fecha **por inteiro** e o Cognitive Lifecycle está implementado nas sete etapas — e atualizar `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`/CLAUDE.mds. Encaminhamento: `doc-sync` desta SPEC.
2. **Registrar a ligação apontada pelo reviewer** nas candidatas do `NEXT_CONTEXT.md`: a fatia futura de **recomposição ao vivo do `memoryPrompt`** resolve simultaneamente a limitação documentada (fato aprendido só entra no prompt na próxima invocação) e a duplicação intra-sessão — candidata natural do item 1.3 (memória). Encaminhamento: `doc-sync` desta SPEC.
3. Nenhuma mudança estrutural pendente além dos residuais já documentados no ADR-0016/SPEC (dedup/consolidação semântica, retenção/curadoria, gatilho heurístico para economizar a chamada, teto configurável, `/lembrar`/`/esquecer` no chat) — candidatos sem dono novo, não reabrem gate.

---

## [SPEC-0019](specs/SPEC-0019-observation-replan-loop.md) — Observação: laço plano→executa→observa→replaneja (2026-07-19)

**Descobrimos que...**

a premissa central do [ADR-0015](../06-adr/ADR-0015-observation-replan-loop.md) — "`@atlas/contracts` e Runtime **intactos**" — **não sobreviveu ao contato com o código**, e foi o `spec-drafter` (não o brainstorming) quem a derrubou ao ler o contrato de execução para redigir a SPEC. O desenho assumira que o observador distinguiria "falha de Tool" de "terminal" (bloqueio/recusa) sem tocar contrato; mas `ExecutedStep`/`ToolResult` (`packages/contracts/src/execution.ts`) só carregam `{ ok, output?, error? }` — **nenhum discriminador estruturado**: todos os casos negados são `ok: false`, diferenciados só pela **string livre** de `error` que o Runtime escreve. O ADR-0012 modelou o resultado da execução como sucesso/erro binário e jogou fora a **causa** da negação — que o Runtime conhece (são branches distintos), mas dissolve num texto. Recuperar essa distinção parseando a redação das mensagens acoplaria `@atlas/cognitive` a um detalhe interno do `@atlas/runtime`, ferindo o Artigo 4. A solução foi corrigir o ADR-0015 e adicionar o campo **opcional** `ExecutedStep.denialKind?: 'blocked' | 'declined'`, rotulado pelo Runtime nos dois branches de negação que ele já produzia.

Isto é a **terceira recorrência seguida** (0017, 0018, agora 0019) da mesma lição: **a afirmação de fronteira de um ADR/Roadmap é hipótese, não fato — só resolve ao ler o código-alvo.** A novidade desta vez é _quando_ o erro foi pego: o brainstorming e a escrita do ADR **afirmaram** "contrato intacto" sem verificar que o contrato de fato carregava a informação que o desenho precisava; quem verificou foi o code-read do drafting. Um ADR que assevera "o contrato X não muda" precisa **conferir, no momento de escrevê-lo, que X já carrega o dado que a decisão consome** — senão a asserção é um palpite que o implementador (ou o drafter) terá de desmentir.

O atrito recorrente "membro novo em interface de contrato exige tocar todos os implementadores/fakes" (que **mordeu** na SPEC-0017 com `isContained` obrigatório quebrando fakes de `PermissionService`) **não mordeu aqui** — precisamente porque `denialKind` é **opcional/aditivo**: os construtores existentes de `ExecutedStep` (em `runtime.ts`, testes, `cognitive-core.ts`) seguiram válidos e o `pnpm typecheck` passou verde. O implementador ainda rodou `git grep 'ExecutedStep'` como prescrito (higiene correta), mas não achou quebra. Confirma o corolário: **campo de contrato opcional/aditivo evita a cascata de chamadores; o atrito é específico de membro _obrigatório_ novo.**

**A arquitetura ajudou porque...**

o observador coube como uma **função pura** no exato molde do Planner (precedente do [ADR-0012](../06-adr/ADR-0012-planner-runtime-execution.md)): sem gateway, testável isolado, consolidado em `@atlas/cognitive` sem package novo — e o [Module Catalog](../03-architecture/ModuleCatalog.md) já enquadrava o replanejamento como orquestração do Cognitive Core (Artigo 4), então não houve fronteira nova a inventar. O `runPlanCycle` já ser **compartilhado** por `ask` e `respond` desde a [SPEC-0014](specs/SPEC-0014-tools-confirm-in-chat.md) fez o laço cobrir os dois caminhos **de graça** (uma única mudança, dois comandos). Os `steps` já existirem em `AskResult`/`ConversationTurn` e o CLI já reusar `renderSteps` significou **zero linha** em `apps/cli` para mostrar o retry. E o Artigo 4 não foi ornamento: ele **decidiu** o desenho — foi o critério explícito que rejeitou o parse-de-string e escolheu o campo de contrato.

**A arquitetura atrapalhou porque...**

o contrato de execução do ADR-0012 **sub-modelou o resultado**: ao reduzir todo passo negado a `ok: false` + string, descartou a taxonomia de causa (bloqueio × recusa × falha-de-Tool × ferramenta-desconhecida) que o Runtime tinha na mão. A Observação foi a primeira etapa a **precisar** dessa distinção, e pagou o preço de reintroduzi-la como `denialKind`. Não é um defeito grave — o campo aditivo resolveu barato —, mas é o sinal de que "resultado da execução" merecia desde o início ser um dado mais rico que um booleano, e a próxima etapa que dependa de causa (ex.: Aprendizado, ou observador semântico) provavelmente pedirá mais taxonomia.

**Precisamos mudar...**

1. **Contradição real entre o template de SPEC e o fluxo de automação sobre quem atualiza docs vivas.** O `spec-implementer` sobre-executou (atualizou `CLAUDE.md`/`NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`/`Roadmap.md`), percebeu e reverteu a zero-diff — porque a seção "Escopo/Definition of Done" da própria SPEC (herdada do [SPEC-TEMPLATE.md](templates/SPEC-TEMPLATE.md)) lista essas atualizações como escopo do implementador, enquanto [ClaudeCodeAutomation.md](../04-engineering/ClaudeCodeAutomation.md) as trata como o passo de fecho `doc-sync`, separado e posterior. Encaminhamento: **atualizar `docs/implementation/templates/SPEC-TEMPLATE.md`** (e, se preciso, uma nota em `docs/04-engineering/ClaudeCodeAutomation.md`) para deixar explícito que a sincronização de docs vivas é passo de fecho (`doc-sync`), **não** escopo do implementador — evitando o trabalho-e-reversão em toda SPEC futura.
2. **Marcar a Etapa 5 (Observação) como entregue** no [Roadmap](../04-engineering/Roadmap.md) (item 1.2) e no `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`, deixando claro que a Etapa 6 (Aprendizado) segue o único gate aberto do 1.2. Encaminhamento: `doc-sync` desta SPEC.
3. Nenhuma mudança estrutural pendente além do já registrado no ADR-0015 — os residuais conscientes (observador semântico guiado por modelo, teto de replan configurável, replan em bloqueio de permissão, dependência de dados entre passos, Task Manager) seguem como candidatos sem dono novo, já anotados na seção "Fora do Escopo" da SPEC e nas candidatas do `NEXT_CONTEXT.md`. Não reabrem gate.

---

## [SPEC-0018](specs/SPEC-0018-multiple-permission-roots-cli.md) — Múltiplas raízes de leitura/escrita na CLI (2026-07-18)

**Descobrimos que...**

o gate do Roadmap ("Múltiplas raízes de leitura/escrita por invocação", item 1.1, texto _"hoje `readRoots`/`writeRoots` são avaliadas como conjunto único"_) estava **factualmente errado sobre o próprio código**: a investigação no brainstorming mostrou que o núcleo já suportava múltiplas raízes desde que foram escritas — `within(target, roots)` em `packages/permissions` sempre foi `roots.some(...)`, `load-config.ts` sempre validou **listas**, e `evaluate`/`isContained`/contracts/runtime/tools/`status.ts` já operavam sobre arrays. O único afunilamento vivia na **borda de entrada da CLI** (`input-gateway.ts` lia `--allow-read`/`ATLAS_ALLOW_READ` como string única e embrulhava em `[valor]`). A capacidade já existia latente; faltava só expô-la. Resultado: a fatia fechou o gate tocando **três arquivos** (`input-gateway.ts`, `run.ts`, teste), **zero linha** em qualquer package — a SPEC mais barata desde a fundação.

Isto é a **recorrência, em sentido inverso, da lição da [SPEC-0017](specs/SPEC-0017-toctou-atomic-enforcement.md)**: lá a marcação `SPEC direta` do Roadmap virou `ADR primeiro` ao contato com o desenho (o item era maior do que parecia); aqui a marcação `gate · SPEC direta` continuou `SPEC direta` mas o item revelou-se **muito menor** do que o texto do Roadmap sugeria. Confirma que as descrições e marcações do Roadmap são hipóteses a validar no brainstorming/leitura de código, não fatos — e que ler o código-alvo **antes** de dimensionar a SPEC muda materialmente o escopo (evitou desenhar mudança em `@atlas/permissions` que teria sido inteiramente supérflua).

O atrito recorrente "membro/campo obrigatório novo exige tocar chamadores" **não apareceu** — porque não houve membro novo em nenhuma interface nem `Deps`. A mudança de tipo (`CliValues['allow-read']` de `string` para `string[] | undefined` via `multiple: true`) ficou contida no próprio `input-gateway.ts`, e o `pnpm typecheck` (não o `vitest run`, como já sabido) confirmou que nada mais consumia esse tipo.

**A arquitetura ajudou porque...**

a separação de camadas do [ADR-0006](../06-adr/ADR-0006-config-source-precedence.md) (Input Gateway **coleta** valores crus → core **valida** → Permission Service **julga**) confinou a mudança inteiramente na coleta. Como a validação e o julgamento já falavam "lista", expor múltiplas raízes foi só remover o embrulho-de-um-elemento na borda. O modelo de precedência `flags > env > defaults` absorveu "lista substitui lista" sem reabrir nada — a substituição por-fonte já era a semântica; só passou de string para array. A biblioteca padrão cobriu o resto: `parseArgs` com `multiple: true` produziu o array direto, e `path.delimiter` deu o split de env portátil sem inventar formato. E `status.ts`, que já fazia `readRoots.join(', ')`, exibiu múltiplas raízes sem uma linha de mudança — sinal de que a abstração de lista já estava certa ponta a ponta.

**A arquitetura atrapalhou porque...**

nada a registrar — o desenho não ofereceu nenhuma resistência; ao contrário, a fatia foi um teste de que os limites escolhidos nas SPECs 0011–0017 já estavam no lugar certo (a capacidade "cair" pronta ao expor a borda é a evidência).

**Precisamos mudar...**

o texto do item 1.1 no [Roadmap](../04-engineering/Roadmap.md) (_"hoje `readRoots`/`writeRoots` são avaliadas como conjunto único"_) está impreciso e deve ser corrigido/marcado como entregue, deixando explícito que o núcleo já operava sobre listas e que o gate era de **borda de entrada** — encaminhamento: `doc-sync` desta SPEC atualiza o Roadmap (item 1.1 + nota no critério de conclusão da Fase 1, linha 120: ambos os gates de segurança do 1.1 — TOCTOU e múltiplas raízes — agora fechados) e o `NEXT_CONTEXT.md`. Nenhuma mudança estrutural pendente (sem ADR): a fatia não revisitou nenhuma fronteira. Os itens deliberadamente fora de escopo (remoção seletiva de raiz por flag, globs/wildcards, expansão de `~`, config por arquivo do slot `arquivo` do ADR-0006) seguem como candidatos sem dono novo — encaminhamento: já anotados na seção Fora de Escopo da própria SPEC e nas candidatas do `NEXT_CONTEXT.md`, não reabrem gate.

---

## [SPEC-0017](specs/SPEC-0017-toctou-atomic-enforcement.md) — Fecho atômico de TOCTOU (2026-07-18)

**Descobrimos que...**

O item saiu do brainstorming com a marcação do Roadmap **contradita pelo próprio desenho**: 1.1 TOCTOU estava como `gate · SPEC direta`, mas fechar a janela de forma **atômica** (o check e o uso compartilharem o mesmo file handle) move parte da fronteira de segurança do pré-check puro para o instante do uso — o que revisita a decisão estrutural do [ADR-0013](../06-adr/ADR-0013-permission-service-execution-gate.md). Logo virou `ADR primeiro`, com o [ADR-0014](../06-adr/ADR-0014-toctou-atomic-enforcement.md) escrito **antes** da SPEC. As marcações `SPEC direta`/`ADR primeiro` do Roadmap são, portanto, provisórias: só sobrevivem ao contato com o desenho da solução, e é no brainstorming que se confirma qual das duas o item realmente é.

O atrito recorrente de "membro obrigatório novo exige tocar todos os chamadores" (visto em 0011→0016, sempre resolvido com `grep` pelo nome da **função construtora** — `createRuntime(`, `createPermissionService(`) **apareceu numa variante que o grep-por-construtor não pega**: adicionar `isContained` à **interface** `PermissionService` quebrou o `typecheck` em `packages/runtime/tests/runtime.test.ts`, onde dois fakes locais implementam o tipo diretamente (não via factory). A busca certa aqui era `git grep 'PermissionService'` (o **nome do tipo**), não o nome do construtor — porque o consumidor é um implementador-de-tipo, não um call-site de fábrica. E, como já registrado antes, o `vitest run` não pega isso: só `pnpm typecheck` revelou a quebra (esbuild remove tipos).

A decisão de dar ao `verify` das portas default um **default permissivo (`() => true`)** — para não tocar os call-sites zero-arg de `mkdir.ts`/`delete-file.ts`/`list-dir.ts` (que a SPEC exige não mudar) — cria um residual real e sutil: um consumidor que chame `nodeFsReadPort()`/`nodeFsWritePort()` **fora** de `createAtlas`, sem injetar `verify`, herda `O_NOFOLLOW` + ancoragem de identidade mas **não** o veredicto de contenção. Só `@atlas/core` (`createAtlas`) fia o predicado real, então em produção o fecho está ativo; mas a segurança-por-default não é "fail-closed" para consumidores futuros da porta crua.

**A arquitetura ajudou porque...**

O padrão de **porta injetável** provou-se genérico pela enésima vez: o fecho atômico coube numa nova porta interna `FsPrimitivesPort` (`open`/`realpath`/`stat`, default sobre `node:fs/promises`, fake nos testes) — mesmo critério de placement de `FsReadPort`/`FsWritePort`/`PathResolverPort` (sem 2º consumidor real → não sobe a `@atlas/contracts`) — e permitiu simular symlink-no-último-hop (`open` lança `ELOOP`) e troca de identidade (`fstat`×`stat` divergentes) **sem corrida real no disco**. Como na SPEC-0015, não foi preciso tornar `evaluate` assíncrono nem tocar uma linha do Runtime: a atomicidade morou onde o handle existe (a porta), e a autoridade de contenção ficou inteira no Permission Service via um predicado estreito injetado (`verify(realpath, access)`), preservando a Regra 5 (`@atlas/tools` não importa `@atlas/permissions`). A separação "Tool descreve / Permission Service julga / Runtime aplica" do ADR-0013 absorveu a segunda barreira sem reabrir o contrato além do único método novo.

**A arquitetura atrapalhou porque...**

nada a registrar — o desenho comportou a mudança sem forçar concessão estrutural. Os atritos foram de tipagem (fake implementando a interface) e de segurança-por-default (o `verify` permissivo), não de limite de módulo.

**Precisamos mudar...**

O guia de "campo/membro obrigatório novo → `grep` por construtor em todo o repo", hoje afirmado no `NEXT_CONTEXT.md` (Padrões estabelecidos), precisa cobrir também o caso **membro novo numa interface de contrato**: a busca deve ser pelo **nome do tipo** (`git grep '<Interface>'`), para achar fakes/implementações diretas em testes, não só os call-sites de fábrica — encaminhamento: `doc-sync` desta SPEC amplia essa nota no `NEXT_CONTEXT.md`. O residual do `verify` permissivo (porta crua fora do `createAtlas` sem contenção) fica documentado no código (`NodeFsPortDeps.verify`) e no `packages/core/CLAUDE.md`, e é candidato a endurecimento futuro (tornar `verify` obrigatório, ou o default fail-closed) — encaminhamento: item candidato registrado no `NEXT_CONTEXT.md` (Fase 1.1 hardening), não bloqueia esta fatia. Os residuais de escopo do próprio ADR-0014 (`delete_file`/`mkdir`/`list_dir` sem fecho atômico; troca de diretório **ancestral**, que Node sem `openat` não fecha; Windows sem `O_NOFOLLOW`) seguem abertos com dono claro — encaminhamento: já documentados no ADR-0014 e nos `CLAUDE.md`, candidatos a fatias futuras da Fase 1.1, não reabrem o critério de gate desta.

---

## [SPEC-0016](specs/SPEC-0016-remote-and-ci.md) — Remote (GitHub) + CI (2026-07-18)

**Descobrimos que...**

O critério "CI verde" tem uma forma de verificação **diferente de toda SPEC anterior**: não se confirma rodando comandos localmente, só **observando um run real** no GitHub Actions. A própria SPEC previu isso e escreveu os Critérios de Aceitação em cima de `gh run view ... conclusion: success` — e foi providencial, porque o **primeiro run real falhou** por um motivo que a verificação local jamais pegaria: `actions/setup-node` com `cache: pnpm` precisa do binário `pnpm` já no PATH no momento em que roda, mas o workflow tinha `corepack enable` **depois** do `setup-node` → `Unable to locate executable file: pnpm`. O loop observar → corrigir → observar viveu no **fio principal**, não no `spec-implementer`: o subagent fez o trabalho local e o commit, mas não tem como enxergar/iterar sobre um run remoto — a natureza "só verificável no remoto" desta SPEC empurrou o fechamento para o fio principal por desenho, não por acaso.

A correção trocou "pnpm via corepack" (a convenção de dev local, repetida em `CLAUDE.md`, no `NEXT_CONTEXT.md` e na própria SPEC) por `pnpm/action-setup@v4` pinado em `11.11.0` **antes** do `setup-node` — o padrão documentado do próprio `setup-node` para cache de pnpm. Ou seja: a convenção de ambiente local **não se traduz automaticamente para o CI**; o runner limpo expôs uma suposição implícita ("pnpm está disponível") que a máquina do autor sempre teve satisfeita.

A lição da [SPEC-0015](specs/SPEC-0015-permission-symlink-hardening.md) previu explicitamente que a fragilidade cross-OS dos testes com paths literais do sistema (`/etc/...`, symlink para `/private/etc` no macOS) precisaria de encaminhamento "quando o projeto decidir sua matriz de CI". Esta SPEC decidiu a matriz — e escolheu **OS único** (`ubuntu-latest`), deliberadamente fora de escopo qualquer matriz. Logo, a previsão fica **adiada, não resolvida**: no Linux o `/etc` não é symlink, então a fragilidade permanece dormente, sem run que a exercite. Continua sendo um item para uma futura SPEC que introduza matriz de OS, não algo que esta fatia fechou.

O padrão de **checkpoint para ação outward** funcionou como desenhado: o `spec-implementer` parou antes de `gh repo create ... --push`, devolveu o comando exato, e o push (publicar todo o histórico local num serviço externo) só aconteceu com o "go" humano explícito. Nenhum arquivo de produto foi tocado — `git diff --stat` em `packages/`/`apps/` ficou vazio, confirmando que infraestrutura de desenvolvimento vive inteiramente em `.github/`/`.prettierignore`, fora dos módulos, como o `ProjectStructure.md` já previa.

**A arquitetura ajudou porque...**

O tema não pertencia a nenhum módulo do produto, e isso não gerou atrito: `.github/` e `.prettierignore` são exatamente os lugares que o `ProjectStructure.md` reserva, então "onde isto mora?" teve resposta imediata sem reabrir o Module Catalog. O checkpoint de ação outward (herdado do padrão de confirmação de operações irreversíveis) isolou o único passo perigoso — publicar o repositório — num gate humano nítido, sem contaminar o resto do trabalho local, que fluiu sem confirmações.

**A arquitetura atrapalhou porque...**

nada a registrar — não há arquitetura de plataforma envolvida (é tooling de desenvolvimento, não um módulo do Atlas). Os atritos foram de CI (ordem de passos, convenção local × runner limpo), não de desenho do sistema.

**Precisamos mudar...**

A convenção "pnpm via corepack", afirmada em `CLAUDE.md`/`NEXT_CONTEXT.md`/SPEC, agora convive com "CI usa `pnpm/action-setup@v4`" — a documentação viva precisa refletir que o CI **não** usa corepack, para não induzir a próxima pessoa a "consertar" o workflow de volta para corepack e reintroduzir o run vermelho. Encaminhamento: `doc-sync` desta SPEC atualiza `CLAUDE.md` raiz, `NEXT_CONTEXT.md` e `CURRENT_SPRINT.md` registrando remote+CI ativos e a escolha `pnpm/action-setup` no CI. Considerar (sem compromisso, como candidato de fatia futura) adicionar o campo `packageManager: "pnpm@11.11.0"` ao `package.json` raiz, que alinharia corepack (local) e `pnpm/action-setup` (CI) numa única fonte de versão — encaminhamento: item candidato em `NEXT_CONTEXT.md` (Fase 1.4/1.5 do Roadmap), não bloqueia esta SPEC. A fragilidade cross-OS dos testes com paths literais segue aberta e agora com dono claro: só é acionável por uma futura SPEC que introduza **matriz de OS** no CI (esta entregou OS único por escopo) — encaminhamento: permanece registrada aqui e no `NEXT_CONTEXT.md` como fora do escopo desta fatia.

---

## [SPEC-0015](specs/SPEC-0015-permission-symlink-hardening.md) — Endurecimento de symlink no Permission Service (2026-07-17)

**Descobrimos que...**

A limitação de symlink registrada como "conhecida e documentada" desde o [ADR-0013](../06-adr/ADR-0013-permission-service-execution-gate.md) (SPEC-0011) levou quatro SPECs (0011 → 0012 → 0013 → 0015) para ser efetivamente fechada — o mesmo padrão de "reservado no vocabulário, produzido só depois" já visto com `access: 'write'` e o veredicto `confirm`. A resolução em si (`realpath`) coube inteiramente numa **porta injetável síncrona** nova (`PathResolverPort`/`nodePathResolverPort()`), sem precisar tornar `evaluate` assíncrono nem tocar o Runtime — validando, na prática, a alternativa que o próprio ADR-0013 já havia cogitado ("endurecer exigiria IO na avaliação, **ou uma porta de resolução injetável**") e descartado por falta de justificativa até agora.

O algoritmo de "ancestral existente mais profundo" (necessário porque `realpathSync` lança para caminhos que ainda não existem — o caso comum de `write_file`/`mkdir`/`append_file` criando algo novo) serviu **duas vezes** com a mesma implementação: para o alvo da ação em cada `evaluate()` e para as próprias `readRoots`/`writeRoots` na criação do serviço. Não foi preciso nenhuma lógica especial para "raiz ainda não existe no disco" — o mesmo caminho de código resolveu os dois casos.

O `spec-implementer` identificou, ao revisar a suíte de testes existente contra o `realpathSync` real, uma fragilidade sutil não coberta por nenhum teste novo: em macOS, `/etc` é ele mesmo um symlink para `/private/etc`, o que altera o valor resolvido para os paths literais usados nos testes de regressão (`/etc/passwd`, `/etc/hosts`). Não causou falha porque esses testes afirmam `blocked`/`allowed` de um jeito que independe do valor exato resolvido — mas é o tipo de suposição implícita sobre o SO que só vai doer quando o projeto decidir sua matriz de CI (ainda em aberto, ver `NEXT_CONTEXT.md` → "Pendências Conhecidas").

O `spec-validator` precisou de um passo extra de verificação que não tinha aparecido em SPECs anteriores: confirmar, via `git log`, que a falha de `pnpm format:check` em `docs/.obsidian/*.json` era **pré-existente** (commit `3ef2b31`, anterior a esta sessão) e não uma regressão introduzida pela SPEC-0015. Sem esse `git log`, a falha teria parecido uma regressão de verificação à primeira vista.

**A arquitetura ajudou porque...**

`evaluate()` continuou puro do ponto de vista de decisão — o único toque de disco (`realpathSync`) ficou isolado na porta, na borda, exatamente como `FsReadPort`/`FsWritePort`/`ConfirmPort` já haviam estabelecido como padrão de placement (interno ao package, sem 2º consumidor real, sem subir a `@atlas/contracts`). `@atlas/runtime`, `@atlas/tools`, `@atlas/cognitive`, `apps/cli` e `@atlas/contracts` não mudaram uma linha — o portão absorveu o endurecimento inteiro sem que nenhum consumidor precisasse saber que a contenção agora é sobre `realpath`, não sobre string lexical crua. A função `within()` fatorada desde a SPEC-0012 foi reusada sem alteração, agora aplicada sobre valores resolvidos.

**A arquitetura atrapalhou porque...**

nada a registrar — nenhum atrito estrutural; os pontos acima são de teste/verificação (fragilidade cross-OS, confirmação de pré-existência de falha), não de desenho do sistema.

**Precisamos mudar...**

Nenhum encaminhamento novo agora: TOCTOU (symlink trocado entre `evaluate` e o uso pela Tool) segue como limitação remanescente conhecida, já documentada em `packages/permissions/CLAUDE.md` e na própria SPEC-0015 como fora de escopo — não é regressão, é fronteira deliberada da fatia. A fragilidade cross-OS dos testes que usam paths literais do sistema (`/etc/...`) só precisa de encaminhamento concreto quando o projeto decidir sua matriz de CI (item já listado em `NEXT_CONTEXT.md` → "Pendências Conhecidas" → "Remote/GitHub + CI"); registrar aqui evita que a fragilidade seja redescoberta do zero quando essa SPEC futura acontecer.

---

## [SPEC-0014](specs/SPEC-0014-tools-confirm-in-chat.md) — Tools e `confirm` no `atlas chat` (2026-07-17)

**Descobrimos que...**

A **posição** da instrução do Planner na lista de mensagens importa de um jeito que a SPEC não previu: acrescentá-la como mensagem `system` **depois** do turno do usuário quebrou os testes existentes do provedor `fake`, que ecoa a **última** mensagem (`[fake] <conteúdo>`) — a "última mensagem" virou a instrução do Planner em vez do input do usuário. A correção foi inserir a instrução **antes** da mensagem final do usuário, espelhando exatamente a ordenação que o `ask` já usava. O sintoma só apareceu rodando os testes de integração existentes (`run.test.ts`), não os novos — mais um caso em que a suíte antiga é o detector de regressão de contrato implícito.

O atrito "erro que só aparece no `tsc`, não no `vitest run`" (registrado nas SPECs 0012 e 0013) recorreu em forma nova: literais de `Message[]` dentro de expressões condicionais/callbacks tiveram `role` **alargado para `string`** pela inferência, falhando apenas no typecheck — exigiu anotações explícitas de tipo em dois pontos de `cognitive-core.ts`.

Não havia padrão estabelecido para testar um plano Planner-driven **de ponta a ponta pela CLI** (os testes de CLI existentes sempre stubavam `atlas.cognitive` ou nunca exercitavam um plano JSON). O teste de integração novo usou o comportamento de eco do provedor `fake` para "contrabandear" um plano JSON literal como input do usuário — funcional, mas é técnica não usual que merece padronização se SPECs futuras precisarem de cobertura semelhante.

Mover a criação do `LineReader` para **antes** do `createAtlas` (necessário para injetar o `ConfirmPort` sobre ele) introduziu um risco sutil de vazamento de recurso que não existia na estrutura original: se `createAtlas` lançasse, o reader não seria fechado. Resolvido com `try/finally` externo fechando o reader incondicionalmente — lembrete de que reordenar aquisição de recursos muda quem é responsável pela liberação.

Esta foi a segunda SPEC pelo fluxo completo `spec-drafter` → `spec-implementer` → `spec-validator`. O gate do validator funcionou de novo: pegou como bloqueadores exatamente a entrada ausente neste arquivo e o `CLAUDE.md` de `contracts` não atualizado, antes da aprovação humana.

**A arquitetura ajudou porque...**

A fatia inteira coube em **compor o que já existia**: o Planner consolidado, o Runtime com `ConfirmPort` (SPEC-0013), o ponto de injeção `CreateAtlasDeps.confirm` e o `LineReader` injetável (SPEC-0006) — Runtime, Permissions e Tools **não mudaram uma linha**. `respond` ganhou orquestração pelo mesmo helper interno que `ask` usa (`runPlanCycle`), deduplicando em vez de duplicar. O `ConfirmPort` sobre o `LineReader` da sessão coube como adaptador local em `apps/cli` (satisfação estrutural do tipo), sem dependência nova de package.

**A arquitetura atrapalhou porque...**

nada a registrar — os atritos acima são de processo/tooling (ordenação de mensagens do provedor `fake`, inferência do TS, técnica de teste), não de desenho do sistema.

**Precisamos mudar...**

Padronizar a técnica de teste de plano ponta a ponta pela CLI (eco do `fake` como veículo do plano JSON) se ela se repetir — por ora fica registrada aqui como precedente, sem encaminhamento estrutural (não é decisão de arquitetura). A recorrência do "erro só no typecheck" já tem regra em `NEXT_CONTEXT.md` (SPEC-0013); a variação nova (widening de literais) não muda a regra, reforça-a — sem encaminhamento novo.

---

## [SPEC-0013](specs/SPEC-0013-confirm-flow-destructive-tools.md) — Fluxo `confirm` + Tools destrutivas (2026-07-17)

**Descobrimos que...**

O vocabulário de 4 veredictos do Permission Service, desenhado desde o [ADR-0013](../06-adr/ADR-0013-permission-service-execution-gate.md), levou 3 SPECs (0011 → 0012 → 0013) para entrar inteiramente em uso: `free`/`allowed`/`blocked` já existiam; só agora `confirm` foi produzido de verdade. `ConfirmPort` seguiu o mesmo critério de placement de `FsReadPort`/`FsWritePort` (port interno ao package, sem 2º consumidor real, implementação real por default) mas com uma variação: em vez de um "fake port" inteiro substituindo a implementação real nos testes, o teste do próprio port real (`nodeReadlineConfirmPort`) injeta `input`/`output` (streams fake) para simular TTY/EOF sem tocar `process.stdin` de verdade — porque aqui o "real" é exatamente o que precisa ser testado, ao contrário de `nodeFsReadPort`/`nodeFsWritePort`, cujo real nunca é exercitado diretamente em nenhum teste do projeto.

O atrito de "campo obrigatório novo em `Deps` exige atualizar todos os chamadores na mesma task" (catalogado desde a SPEC-0011, repetido "pela sétima vez" na entrada da SPEC-0012) recorreu **pela oitava vez** com `RuntimeDeps.confirm` — e desta vez o próprio plano (escrito nesta sessão, via `superpowers:writing-plans`) deixou passar uma chamada real: `packages/core/tests/create-atlas.test.ts` tinha **dois** testes chamando `createRuntime({ registry, permissions })` diretamente (um no cenário de `write_file`, outro no de `read_file`), mas o plano só previu atualizar o primeiro. O segundo só quebrou no `tsc`, não no `vitest run` (que transpila via esbuild e não faz checagem de tipo) — o mesmo padrão de "passa verde no teste, falha só no typecheck" já registrado na entrada da SPEC-0012, agora causando um gap real no próprio plano, não apenas uma observação sem consequência.

Esta foi a primeira SPEC a passar pelo fluxo `spec-implementer` → `spec-validator` descrito em `docs/04-engineering/ClaudeCodeAutomation.md` (documento que, até aqui, se descrevia como "ainda não testado em uso real"). Funcionou como desenhado: o `spec-implementer` implementou as 5 tasks do plano com um commit por task, corretamente se absteve de escrever a entrada de Lessons Learned e de marcar `Done` (fora do seu escopo, por definição do próprio agente), e o `spec-validator` pegou exatamente essa ausência como bloqueador de Definition of Done antes da aprovação humana — o gate funcionou como pretendido.

Também descobrimos, antes de chegar ao `spec-implementer`, uma lacuna de processo separada: `CLAUDE.md` e `docs/05-context/NEXT_CONTEXT.md` ainda descreviam o fluxo pré-automação ("execução inline" via `superpowers:executing-plans`) como "processo obrigatório", em conflito direto com `ClaudeCodeAutomation.md` — o que levou a implementação desta SPEC a quase começar pelo fio principal em vez de delegada ao `spec-implementer`. Documentação desatualizada, não ausente: os dois documentos existiam, mas não tinham sido atualizados quando a automação foi introduzida.

**A arquitetura ajudou porque...**

O Runtime absorveu `confirm` sem que `@atlas/cognitive` ou a CLI precisassem mudar uma linha — `ask()` já fazia `await runtime.execute(plan)`, então a pausa interna ficou invisível para quem chama. É a mesma elegância que a SPEC-0012 observou para escrita: um limite bem desenhado absorve capacidade nova sem tocar o coordenador. A rota `delete` no Permission Service reusou a mesma `within()` fatorada desde a SPEC-0012 — nenhuma duplicação de lógica de contenção lexical.

**A arquitetura atrapalhou porque...**

Nada estrutural. O único atrito real foi o já descrito acima (campo obrigatório em `Deps` + `vitest` não pegando erro de tipo) — atrito de processo/tooling, não de desenho do sistema.

**Precisamos mudar...**

Reforçamos em `docs/05-context/NEXT_CONTEXT.md` ("Padrões estabelecidos") duas regras concretas para quebrar a recorrência: (1) ao tornar um campo de `Deps` obrigatório, rodar `grep` pela função construtora em **todo o repo**, não só nos arquivos que o plano lista; (2) um passo de TDD "RED" que depende de erro de *tipo* (não de lógica) deve ser verificado via `pnpm --filter <pkg> typecheck`, nunca assumido a partir de `vitest run` sozinho. Sem ADR novo — não é decisão estrutural, é disciplina de execução (encaminhamento: os dois pontos acima já aplicados em `NEXT_CONTEXT.md`, commit desta mesma sessão). A lacuna de `CLAUDE.md`/`NEXT_CONTEXT.md` desatualizados quanto à automação já foi corrigida separadamente (commit `69bd4d5`, antes da implementação desta SPEC começar) — sem encaminhamento pendente.

---

## [SPEC-0012](specs/SPEC-0012-write-file-tool.md) — Tool de escrita (`write_file`) + política `writeRoots` (2026-07-16)

**Descobrimos que...**

O portão de permissão da [SPEC-0011](specs/SPEC-0011-permission-service-fs-read.md) provou ser **genérico de verdade**: adicionar a primeira ação de escrita **não tocou o Runtime** — nenhuma linha. O portão já aplicava "veredicto ≠ `allowed` → `ExecutedStep` negado, Tool não roda"; como ele nunca olhou o `access`, uma escrita bloqueada percorreu exatamente o caminho de uma leitura bloqueada. A fatia inteira coube em: rotear por `access` no Permission Service, uma Tool nova, uma porta nova, e config/CLI. O melhor sinal de um bom limite é uma capacidade nova entrando sem mexer no coordenador.

Rotear `read`/`write` para políticas **separadas** (`readRoots`/`writeRoots`) com a contenção lexical **fatorada** (`within(target, roots)`) foi uma mudança de baixo risco: a lógica de fronteira de separador (já testada para leitura) passou a valer para escrita sem duplicação, e os testes de "não confunde `/proj` com `/proj-evil`" viraram só mais um caso, agora também para escrita.

`writeRoots` com **default `[]`** (diferente de `readRoots`, que exige lista não vazia) exigiu uma regra de validação distinta: "lista de caminhos não vazios, **podendo ser vazia**". O vazio não é erro — é a postura segura ("não escreve"). Foi o primeiro campo de config do projeto cuja lista vazia é válida e significativa, e o `status` ganhou um placeholder legível (`writeRoots: (nenhuma)`) em vez de imprimir string vazia.

Tornar `writeRoots` **obrigatório** em `PermissionServiceDeps` repetiu, pela sétima vez, o atrito já catalogado: o único chamador de produção (`@atlas/core`) e todas as construções diretas em teste (`create-atlas.test.ts`) tiveram que ganhar o campo na mesma task — o `vitest` (transpila, não faz typecheck) passa verde enquanto só o `tsc` acusa. Sem novidade; o plano já previa e a execução não teve surpresa.

**A arquitetura ajudou porque...**

Manter a decisão como uma **nota de atualização no [ADR-0013](../06-adr/ADR-0013-permission-service-execution-gate.md)** (em vez de um ADR-0014) refletiu a realidade: nada estrutural mudou — a SPEC apenas concretizou o `access: 'write'` que aquele ADR deixou reservado. O padrão de porta injetável (`FsReadPort` → `FsWritePort` separada, por menor privilégio) se repetiu sem fricção; a Tool de escrita nasceu testável sem disco desde o primeiro commit.

**A arquitetura atrapalhou porque...**

Nada estrutural. Único atrito operacional: os comandos `pnpm --filter <pkg> test` escritos no plano não existem (os packages não têm script `test`; a suíte roda pela raiz via `vitest.config.ts`) — corrigido em execução usando `pnpm exec vitest run <path>`. Encaminhamento: planos futuros devem escrever os comandos de teste por caminho a partir da raiz, não por `--filter ... test`.

**Precisamos mudar...**

Nada novo no processo além do reforço já registrado (campo obrigatório + chamadores na mesma task; comandos de teste pela raiz). Próxima fatia natural: o fluxo interativo de **`confirm`** (ainda só reservado) + ações **destrutivas** (`delete_file`, `mkdir`), que farão o `atlas ask` deixar de ser tiro único; e o **endurecimento de symlink** na contenção (vale igual para escrita agora).

---

## SPEC-0011 — Permission Service + Tools de leitura de sistema de arquivos (2026-07-15)

**Descobrimos que...**

Manter um avaliador de Support **puro** (sem IO) coube inteiramente em `node:path`: `createPermissionService({ readRoots })` resolve o `path` da ação para absoluto e testa contenção lexical (prefixo com fronteira de separador) contra as `readRoots` — nenhum `fs`, nenhum `realpath`. Seguir symlink exigiria IO na própria avaliação (ou uma porta de resolução injetável), o que quebraria a invariante "Permission Service sem IO"; foi adiado e documentado como limitação conhecida (ADR-0013). A pureza tornou o serviço trivialmente testável: nenhum fake de disco, só strings de path e arrays de raízes.

Fazer as Tools declararem `requirements(args) → ActionRequest | null` como **dado** — em vez de o Permission Service conhecer nomes de Tool (`read_file`, `list_dir`) — manteve o serviço genérico: ele nunca importa `@atlas/tools` nem sabe que `read_file` existe. `clock`/`calc` seguem sem `requirements`, permanecendo livres sem qualquer mudança nelas. Essa separação de autoridades (Tool descreve o que toca; Permission julga; Runtime aplica) foi o eixo central da SPEC e evitou qualquer acoplamento cruzado entre os três packages.

Mudar a assinatura de `createRuntime` (de `{ registry }` para `{ registry, permissions }`, campo obrigatório) teve que **mover na mesma task/commit** que seu único chamador de produção (`@atlas/core`, que passou a compor `createPermissionService` e injetar no `createRuntime`) — o mesmo padrão de risco já registrado na lição da [SPEC-0010](specs/SPEC-0010-planner-runtime-tools.md) (mudança de tipo de contrato não é aditiva). Como desta vez o plano já sabia disso (Task 6 tratou runtime+core juntos), não houve surpresa no `tsc`.

Tornar `permissions.readRoots` **obrigatório** em `AtlasConfig` repetiu, pela sexta vez nas SPECs deste projeto, a mesma classe de atrito: literais de `AtlasConfig` montados à mão em testes (`apps/cli/tests/status.test.ts`) quebram com TS2741 até ganharem o campo novo — o `vitest` (transpila, não faz typecheck) passa verde enquanto só o `tsc` acusa. O padrão de correção (atualizar os literais na mesma task que torna o campo obrigatório, rodando `pnpm typecheck` a cada task, não só no final) já estava incorporado ao plano e não gerou atrito real na execução — mas o padrão em si segue recorrente o suficiente para valer registrar de novo.

`AccessMode = 'read' | 'write'` incluiu `'write'` **reservado** deliberadamente, mesmo sem nenhuma Tool de escrita existir ainda — isso tornou o veredicto "acesso reservado bloqueado" (`access !== 'read'` → `blocked`) testável hoje, com um `ActionRequest` construído à mão no teste, sem esperar pela fatia de escrita.

**A arquitetura ajudou porque...**

O [Module Catalog](../03-architecture/ModuleCatalog.md) já cravava os quatro veredictos (`free`/`allowed`/`confirm`/`blocked`) e a proibição de presumir consentimento para ações destrutivas — a decisão de começar por leitura (read-only) saiu quase automática: exercita o portão real (livre × bloqueada por raiz) sem precisar do fluxo interativo de confirmação, que só faz sentido diante de uma ação destrutiva de verdade. O padrão de porta injetável ([ADR-0004](../06-adr/ADR-0004-manual-composition.md)/0011: `fetch`, `MemoryStorage`) se repetiu sem fricção para o `FsReadPort` — o primeiro IO das Tools nasceu testável sem disco desde o primeiro commit.

**A arquitetura atrapalhou porque...**

Nada estrutural. O único atrito foi o already-conhecido TS2741 em literais de config de teste, já absorvido pelo processo de tasks.

**Precisamos mudar...**

Nada novo no processo além do reforço já registrado (mover mudança de assinatura de factory junto do único chamador; atualizar literais de `AtlasConfig` na mesma task que torna um campo obrigatório). Próximas fatias naturais: Tools de **escrita** + o fluxo interativo de **`confirm`** (hoje só reservado no vocabulário do contrato); **endurecimento de symlink** (`realpath` ou porta de resolução injetável) contra o escape documentado da contenção lexical. Não rodamos um novo probe do TS7 nesta SPEC — a Pendência já registrada em [NEXT_CONTEXT](../05-context/NEXT_CONTEXT.md) pede para parar de re-probar por hábito e vincular a um gatilho externo (release do typescript-eslint com suporte ao TS7); nada mudou nesse encaminhamento.

---

## SPEC-0010 — Planner + Runtime + Tools (execução ponta a ponta) (2026-07-14)

**Descobrimos que...**

A espinha de execução coube numa fatia fina porque o modelo produz o plano em **JSON** via o `generate()` atual e o Runtime o executa (Planner-driven) — o Model Gateway ficou **intacto**. Evitar tool-calling nativo manteve as fronteiras de autoridade limpas (Cognitive decide/orquestra → Planner transforma → Runtime executa) e não amarrou a plataforma ao suporte de tool-calling do provedor local.

Separar "chamar o modelo" (Cognitive) de "definir schema + parsear" (Planner) deixou o **Planner puro, sem gateway** — totalmente testável sem stub de modelo. Fazer `instruction([])` retornar string vazia preservou o caminho de **1 chamada** para objetivos que não precisam de Tool (sem regressão de comportamento nem custo) e manteve os testes de system prompt existentes válidos sem alteração.

A máquina já é **multi-tool de graça**: Tool Registry (`Map`) + plano-como-lista + Runtime-como-loop. Entregar **duas** Tools puras (`clock`/`calc`) exercitou a seleção do Planner de verdade, sem tocar em permissões/filesystem (o Permission Service não existe). Manter os passos **independentes** (sem dependência de dados) e o Runtime sem fila/retry/timeout evitou um Task Manager completo prematuro (YAGNI); o Runtime **nunca lança** por falha de Tool (falhas estruturadas), então nem `code` de erro próprio foi preciso nesta fatia.

Mudar o **tipo de um contrato** (`ask: Promise<string>` → `Promise<AskResult>`) não é aditivo/inerte como acrescentar um campo: acopla `contracts` + `cognitive` + `core` + `cli` num typecheck atômico, então tudo precisou landar na mesma task (Task 4), ao contrário das adições de contrato das Tasks 1–2 que fecharam verdes isoladas.

O `calc` foi implementado com **descida recursiva própria** (tokenizer + parser para `+ - * /`, parênteses, unário, decimais), sem `eval`/`Function` — seguro contra execução arbitrária a partir de saída do modelo, e limpo sob `noUncheckedIndexedAccess` (asserções `!` onde o índice é comprovadamente válido).

**A arquitetura ajudou porque...**

A Matriz de Autoridade do Module Catalog deu o desenho pronto: cada papel (Cognitive orquestra/responde, Planner transforma, Runtime executa, Tools adaptam) virou uma unidade pequena, injetada por parâmetro e testável isoladamente. O padrão de injeção (o `runtime` chega ao Cognitive via `@atlas/core`, único a importar implementações) manteve o Cognitive dependente só de contratos — nunca de `@atlas/runtime`/`@atlas/tools`.

Expor o catálogo de Tools por `runtime.tools()` (fonte única, dona do registry) deixou o Planner montar a instrução sem o Cognitive tocar `@atlas/tools`, e impediu o Cognitive de chamar `tool.run` direto (só via `runtime.execute`), honrando "o Cognitive não executa Tools".

**A arquitetura atrapalhou porque...**

Nada estrutural. O único atrito foi de plano: o [PLAN-0010](plans/PLAN-0010-planner-runtime-tools.md) não previu `packages/cognitive/tests/conversation.test.ts` (6 chamadas a `createCognitiveCore` sem `runtime`), que passavam em runtime (usam só `respond`/`startConversation`) mas quebravam o `pnpm typecheck` ao tornar `runtime` obrigatório. Lição: ao mudar a assinatura de uma factory, `grep` por **todos** os chamadores (inclusive testes de outros aspectos do mesmo módulo) antes de fechar a task, não só os que o plano lista.

**Precisamos mudar...**

Nada no processo além do reforço acima (varrer chamadores ao mudar assinaturas). Próximas fatias naturais: primeira Tool com efeito colateral → Permission Service; Skills; dependência de dados entre passos; Task Manager completo; Observação/replanejamento; Aprendizado automático. O 7º probe do TS 7 falhou igual aos anteriores (`Cannot read properties of undefined (reading 'Cjs')`) — manter o encaminhamento de vincular a um gatilho externo (release do typescript-eslint) em vez de re-probar por hábito.

---

## [SPEC-0009](specs/SPEC-0009-memory-service.md) — Memory Service (fatos/preferências explícitos) (2026-07-13)

**Descobrimos que...**

O primeiro efeito de disco da plataforma coube no mesmo molde de injeção já usado para rede e terminal: uma **porta injetável** `MemoryStorage` (`load`/`save`) interna a `@atlas/memory`, com `createFileMemoryStorage(path)` (JSON) como default e um fake em memória nos testes. Os testes de unidade do serviço não tocam disco; o IO real fica isolado no teste do file adapter e nos testes de comando da CLI, ambos em `tmpdir` (`os.tmpdir()` + `mkdtemp`), nunca no `~/.atlas` real. `createMemoryService` é **assíncrono** (carrega os fatos uma vez na criação — load-once), o que encaixou naturalmente no `createAtlas` já assíncrono; `list()`/`prompt()` ficam síncronos e `remember`/`forget` persistem por write-through. A memória chegou à resposta pelo mesmo caminho da Persona ([ADR-0011](../06-adr/ADR-0011-memory-service-persistence.md) estende [ADR-0010](../06-adr/ADR-0010-persona-injected-generation.md)): `memory.prompt()` vira `memoryPrompt?: string` no Cognitive, que compõe identidade → memória → tarefa via `[personaPrompt, memoryPrompt, TASK_FRAMING].filter(Boolean).join('\n\n')` sem conhecer o conceito de Memory. A CLI isolou disco por `--memory-path` (tmpdir) em vez de importar `@atlas/memory`, mantendo a app acoplada só a `@atlas/contracts` + `@atlas/core`; a porta de storage foi injetável só no `createAtlas` (para os testes de core), não na CLI.

**A arquitetura ajudou porque...**

O padrão "efeito colateral atrás de porta injetável + composição escolhe o adapter" (ADR-0004) já estava consolidado (`fetch`, `LineReader`), então persistir sem acoplar o módulo ao disco nem tocar disco nos testes foi mecânico. A separação Memória (persistente) × Contexto (temporário) do [Glossary](../00-project/Glossary.md) deu limites claros: o Memory Service só guarda/recupera fatos, sem decidir estratégia nem chamar o Gateway. Injetar identidade e memória como strings opcionais manteve o Cognitive sem estado e desacoplado de ambos os conceitos.

**A arquitetura atrapalhou porque...**

Adicionar um campo obrigatório a `AtlasConfig` (`memory.path`) e a `AtlasPlatform` (`memory`) exigiu atualizar **atomicamente** todos os literais/mocks que os constroem — em `apps/cli/tests/status.test.ts` foram dois pontos (o objeto `config` e o objeto `atlas`), e o do `config` não estava previsto no plano, aparecendo só no `typecheck` (TS2741). Config aninhada (`memory?: { path?: string }`) precisa de merge campo-a-campo e cuidado com `exactOptionalPropertyTypes` na composição condicional do `memoryPrompt`.

**Precisamos mudar... (encaminhamento: ADR, documentação ou nova SPEC)**

Leitura de memória no **startup**: gravar um fato não afeta uma sessão `chat` já aberta (documentado no ADR-0011; troca/leitura ao vivo é candidata a SPEC futura). Os fatos entram no system prompt de toda geração — sem retenção/seleção/busca, o prompt cresce com a memória (fatias futuras do Memory Service: episódica, projetos, busca, retenção). Probe do TS 7 (sexto, 2026-07-14): **falhou** de novo — `TypeError: Cannot read properties of undefined (reading 'Cjs')` em `@typescript-eslint/typescript-estree@8.63.0` com `typescript@7.0.2`, idêntico aos cinco anteriores. Revertido para `typescript@^5`. Encaminhamento mantido: parar de re-probar por hábito a cada SPEC; vincular a um release do typescript-eslint que declare suporte ao TS 7.

## [SPEC-0008](specs/SPEC-0008-persona-service.md) — Persona Service (Jarvis) (2026-07-13)

**Descobrimos que...**

A identidade pôde ser injetada na **geração** sem acoplar o Cognitive ao conceito de Persona (ADR-0010): `createPersonaService().systemPrompt(persona)` deriva uma string a partir dos atributos textuais da Persona (nome/tom/formalidade/idioma/estilo/regras), e o `@atlas/core` passa essa string como `personaPrompt?: string` para `createCognitiveCore`. O Cognitive só concatena `personaPrompt` (identidade) com `TASK_FRAMING` (tarefa, renomeado de `SYSTEM_PROMPT` para deixar explícito que é enquadramento de tarefa, não mais o único ingrediente do system message) — ele nunca importa `@atlas/persona` nem conhece o tipo `Persona`. Isso manteve a regra "consumidor depende de contrato, não de implementação" mesmo sem contrato novo do lado do Cognitive: a interface pública ganhou só um parâmetro de string opcional.

Validar `config.persona` importando `PERSONA_IDS` de `@atlas/persona` em `packages/core/src/config/load-config.ts` foi seguro porque o **core é composition root** (Regra 11) e pode importar implementações, diferente de `@atlas/cognitive`/`@atlas/contracts`, que não podem. Isso evitou duplicar a lista de ids conhecidos (o registro embutido de Personas continua a única fonte da verdade) sem promover `PersonaService` a um contrato mais amplo do que o necessário.

Adicionar um campo obrigatório a `AtlasConfig`/`AtlasPlatform` (`persona`) voltou a exigir atualização atômica dos literais/mocks manuais em `apps/cli/tests/status.test.ts` no mesmo commit que estendeu o contrato e a composição — a mesma classe de atrito já registrada nas lições da [SPEC-0005](specs/SPEC-0005-cognitive-core.md)/0006/0007 (o `vitest` transpila e não pega o campo ausente; só o `tsc` acusa). Reforça, pela quarta vez, a mesma lição: listar os stubs manuais de `AtlasPlatform`/contratos como arquivos a atualizar e rodar `pnpm typecheck` a cada task.

Voz (`voice`) e emoção simulada (`emotion`) entraram no modelo de dados da `Persona` como slots **declarativos e inertes**: fazem parte do tipo e dos dados embutidos (`jarvis`/`neutral`), mas propositalmente **não** entram em `systemPrompt(persona)` — não há canal de áudio/afeto que os consuma hoje. Documentá-los explicitamente (CLAUDE.md do `@atlas/persona`, ADR-0010) evita que alguém os trate como já ativos ou os remova por engano por parecerem mortos.

O probe do TS7 (encaminhamento herdado) falhou pela quinta vez consecutiva em 2026-07-13, com o mesmo `TypeError: Cannot read properties of undefined (reading 'Cjs')` em `@typescript-eslint/typescript-estree@8.63.0` sob `typescript@7.0.2`; revertido para a série 5 com a suíte verde e sem resíduo em `package.json`/`pnpm-lock.yaml`. Cinco probes seguidos com a falha exata confirmam que repetir o probe a cada SPEC deixou de agregar informação nova.

**A arquitetura ajudou porque...**

O módulo já existia no Module Catalog (`Persona Service → packages/persona`, camada Interaction): nenhuma decisão de novo módulo, só a primeira implementação. A composição por parâmetro (ADR-0004) permitiu que o Cognitive ganhasse identidade sem crescer em responsabilidade — ele segue testável isoladamente com um `personaPrompt` literal, sem depender do registro de Personas. Tratar Jarvis como **configuração de dados**, não um novo Core (Glossary), manteve o Persona Service num papel estritamente passivo: não decide estratégia, não cria Plans, não chama o Model Gateway.

**A arquitetura atrapalhou porque...**

Nada estrutural. O único atrito foi de sequenciamento de tasks (stub manual de `AtlasPlatform` em `status.test.ts` precisando acompanhar o contrato estendido), já esperado e corrigido na execução.

**Precisamos mudar...**

TypeScript segue pinado na série 5. Encaminhamento revisado: parar de repetir o probe do TS7 a cada SPEC (cinco tentativas seguidas com o mesmo erro estrutural não geram sinal novo); retomar quando houver um gatilho externo — release do `typescript-eslint` que declare suporte ao compilador nativo do TS7 — em vez de por hábito de SPEC.

Troca de Persona em runtime (ex.: `/persona <nome>` no `atlas chat`) ficou fora do escopo (encaminhamento: SPEC futura; exigiria re-semear a conversa com o novo `personaPrompt`). Voz e emoção simulada permanecem inertes até existir um canal de áudio/afeto que os consuma (encaminhamento: SPEC futura). Personas por arquivo de configuração externo dependem do slot `arquivo` do [ADR-0006](../06-adr/ADR-0006-config-source-precedence.md), ainda não implementado.

---

## [SPEC-0007](specs/SPEC-0007-context-service.md) — Context Service (detentor de sessão) (2026-07-13)

**Descobrimos que...**

O Context Service pôde nascer como **store de valor**, não orquestrador ([ADR-0009](../06-adr/ADR-0009-context-service-value-store.md)): `openSession/getConversation/updateConversation/closeSession` guardam uma `Conversation` por sessão num `Map` em memória, sem decidir estratégia nem chamar o Cognitive Core. Isso resolveu a tensão documental entre o Module Catalog ("Context é utilizado pelo Cognitive Core") e o [ADR-0008](../06-adr/ADR-0008-conversation-as-data.md) (`respond` função pura): a leitura do catálogo passou a se referir ao contexto de ambiente futuro (cwd/repo/arquivos), não ao buffer de conversa. A **app** (`atlas chat`) virou a mediadora — lê a conversa do Context, chama `respond` puro, grava o resultado de volta — exatamente como o ADR-0008 previu ("migração é troca de detentor, não de contrato"): o diff não tocou `packages/cognitive/src/cognitive-core.ts` nem `packages/contracts/src/cognitive.ts`.

Um package novo (`@atlas/context`) precisa de `pnpm install` para linkar no workspace **antes** do primeiro teste rodar — sem isso, `vitest`/`tsc` não resolvem `@atlas/context` a partir de `packages/core`/`apps/cli`, e o erro lido de fora (module not found) engana como se fosse import errado em vez de link de workspace pendente.

Adicionar um campo obrigatório em `AtlasPlatform` (`context: ContextService`) precisa ser **atômico** com o fornecimento em `createAtlas`: um `tsc` limpo entre tasks só existe se o contrato, a composição no core **e** qualquer stub manual de `AtlasPlatform` nos testes (ex.: `apps/cli/tests/status.test.ts`) mudarem no mesmo commit — foi assim que a task de composição no core evitou o mesmo atrito já registrado na [SPEC-0006](specs/SPEC-0006-atlas-chat.md) com `startConversation`/`respond` (contrato estendido sem o stub manual acompanhar, pego só pelo `tsc`, não pelo `vitest`). Reforça a lição anterior: listar os stubs manuais de contrato como arquivos a atualizar e rodar `pnpm typecheck` a cada task, não só ao final.

O probe do TS7 (encaminhamento herdado) falhou novamente em 2026-07-13, com o mesmo `TypeError: Cannot read properties of undefined (reading 'Cjs')` em `@typescript-eslint/typescript-estree@8.63.0` sob `typescript@7.0.2`; revertido para a série 5 com a suíte verde e sem resíduo em `package.json`/`pnpm-lock.yaml`. Quarto probe consecutivo com a mesma falha exata — sinal de que a incompatibilidade é estrutural (o typescript-estree ainda não suporta o compilador nativo do TS7), não intermitente.

**A arquitetura ajudou porque...**

O módulo já existia no Module Catalog (`Context Service → packages/context`, camada Support): nenhuma decisão de novo módulo, só a primeira implementação. O contrato `ContextService`/`SessionId` foi direto para `@atlas/contracts` (dois consumidores desde o início: core compõe, CLI consome) sem exigir ADR de promoção. Manter o Cognitive Core sem dependência do Context (Regra do Module Catalog: só o Core decide estratégia) permitiu migrar o detentor da conversa sem tocar em `respond`/`startConversation` — a suíte de `packages/cognitive` não mudou uma linha.

**A arquitetura atrapalhou porque...**

Nada estrutural. O único cuidado foi de sequenciamento de tasks (link do package novo via `pnpm install`; manter o campo obrigatório em `AtlasPlatform` atômico com sua composição e os stubs de teste), aplicado corretamente na execução.

**Precisamos mudar...**

TypeScript segue pinado na série 5 (encaminhamento: repetir o probe do TS7 numa SPEC futura; considerar parar de repetir a cada SPEC e vincular a um gatilho externo — release do typescript-eslint que declare suporte ao TS7 — já que quatro probes seguidos deram o mesmo erro estrutural).

O contexto de ambiente (cwd/repo/branch/arquivos) que o Cognitive/Planner poderão consumir no futuro ficou fora do escopo (encaminhamento: SPEC futura, quando houver um consumidor real — ADR-0009 já resolve o "quem medeia" antecipadamente). Persistência de sessão entre processos continua do Memory Service, inexistente.

---

## SPEC-0006 — atlas chat (conversa multi-turno) (2026-07-13)

**Descobrimos que...**

Tratar a conversa como **dado** (ADR-0008) — um valor `Conversation` que flui pelo sistema, com `respond` como função pura que recebe e devolve o histórico — manteve o Cognitive Core sem estado e testável sem mock. O multi-turno saiu de `respond` puro + o loop da CLI segurando o valor, **sem** criar Context Service. A migração futura do detentor (borda → Context Service) é troca de quem guarda, não de contrato.

Estender a interface `CognitiveCore` quebrou o typecheck de um consumidor que a suíte não pega: `apps/cli/tests/status.test.ts` monta um `AtlasPlatform`/`cognitive` à mão, e o `vitest` (transpila, não typecheck) passava verde enquanto o `tsc` acusava `startConversation`/`respond` ausentes. O plano não previu esse ajuste (mesma classe de correção da SPEC-0005). Lição a incorporar aos planos: **ao estender um contrato, listar os stubs manuais de `AtlasPlatform`/contratos nos testes como arquivos a atualizar**, e rodar `pnpm typecheck` (não só `pnpm test`) no gate da task.

A verificação manual (Step do plano) pegou um bug real que os testes unitários não pegariam: a 1ª implementação do `LineReader` usava `readline.question` por vez e, com **input via pipe** (não-TTY), perdia linhas — os eventos `line` da rajada disparavam antes do próximo `question` registrar o listener, e o `close` encerrava. A correção foi uma **fila de linhas com waiters** (buffer de `line` + fila de `next()` pendentes), robusta em TTY e pipe. Reforça: exercitar o caminho real (não só o stub) antes de concluir — o stub roteirizado (`scriptedReader`) nunca reproduziria a rajada.

Com o provider `fake` (que ecoa a última mensagem), a acumulação de contexto **não** é observável pela saída do chat — por isso a asserção de multi-turno vive no teste unitário do cognitive (gateway stub captura as mensagens), e o teste no nível de `run` cobre ordem/exit. Distribuir a asserção pela camada certa evitou um teste frágil.

`deps.createLineReader` **lazy** (fábrica, não instância) foi essencial: criar o `readline` real ansiosamente seguraria o `stdin` e impediria `status`/`ask` de encerrar. O leitor real só nasce quando o comando é `chat`; testes injetam um roteiro.

O probe do TS7 (encaminhamento herdado) falhou de novo em 2026-07-13 (mesmo `TypeError` do `typescript-estree` com `typescript@7.0.2`); revertido para a série 5 com a suíte verde e sem resíduo no `package.json`/lockfile.

**A arquitetura ajudou porque...**

O módulo já existia e o contrato `CognitiveCore` já vivia em `@atlas/contracts` ([ADR-0007](../06-adr/ADR-0007-model-gateway-contract-promotion.md)): estender a conversa foi acrescentar operações ao contrato + implementá-las, sem novo módulo nem promoção. A composição manual (ADR-0004) deixou o loop de chat testável com `gateway` (via provider `fake`) e `LineReader` stub, sem rede nem TTY. Mapear o erro de modelo por `AtlasError.code` permitiu tratá-lo **dentro** do loop (chat sobrevive à falha) reusando a mesma mensagem amigável do `ask`, sem a CLI conhecer `@atlas/model-gateway`.

**A arquitetura atrapalhou porque...**

Nada estrutural. Os atritos foram: (a) o gap do plano no stub manual de teste (tooling/processo, não arquitetura), corrigido na execução; (b) o bug de I/O do `readline` com pipe (detalhe de plataforma), corrigido com a fila de linhas.

**Precisamos mudar...**

TypeScript segue pinado na série 5 (encaminhamento: repetir o probe do TS7 em SPEC futura).

O Context Service é o dono natural do estado de conversa hoje segurado pela CLI (encaminhamento: SPEC futura; ADR-0008 já registra a transição sem quebra de contrato). Auto-gerência do processo do Ollama e `ModelGateway.health()` ficaram fora de escopo (encaminhamento: SPECs futuras). Enviar o histórico inteiro a cada turno é aceitável no MVP; compactação/limite de contexto virá com necessidade (encaminhamento: futura, provável junto do Context Service).

---

## SPEC-0005 — Cognitive Core (mínimo) (2026-07-13)

**Descobrimos que...**

A promoção de um contrato para `@atlas/contracts` foi disparada exatamente pelo 2º consumidor (a regra de placement): o `@atlas/cognitive` precisou do `ModelGateway`, então os tipos do gateway (`Role`, `Message`, `GenerateRequest`, `GenerateResult`, `ModelGateway`, `ModelGatewayConfig`, `ProviderName`) subiram a contracts (ADR-0007). Re-exportá-los de `@atlas/model-gateway` (via `export type { ... } from '@atlas/contracts'`) manteve `HttpDeps`/`createModelGateway`/provedores/testes intactos — churn quase nulo e a regra "consumidor depende de contrato, não de implementação" preservada.

Config aninhada (`config.model: ModelGatewayConfig`) exige merge campo-a-campo e um tipo de override próprio: com `exactOptionalPropertyTypes`, `Partial<AtlasConfig>` não serve mais como override (o `model` interno tem campos obrigatórios), então nasceu `AtlasConfigOverride` com `model?: Partial<ModelGatewayConfig>`; o merge faz `{ ...defaults.model, ...override.model }` e monta os overrides condicionalmente (nunca `campo: undefined`), tanto no `loadConfig` quanto no Input Gateway da CLI.

A CLI mapeia o erro de modelo por `AtlasError.code === 'ATLAS_MODEL_GATEWAY'` (não por `instanceof ModelGatewayError`), o que permite mensagem amigável + exit `1` **sem** `apps/cli` importar `@atlas/model-gateway` — o desacoplamento apps→gateway fica intacto (a CLI só conhece `@atlas/core` e `@atlas/contracts`).

O ciclo cognitivo foi honrado de forma colapsada (uma única chamada `generate` com `[{system}, {user}]`), sem saídas estruturadas especulativas (intenção/estratégia/risco) — YAGNI: nenhum consumidor as usa ainda. O teste do orquestrador usa um `gateway` stub e o caminho de erro da CLI usa `fetch` injetado que rejeita (provider `local`) → suíte inteira sem rede.

Verificação manual (`ask ... --provider fake`) precisa de `pnpm --filter @atlas/cli exec tsx src/main.ts ...`: o `rtk proxy tsx ...` falha com `tsx: No such file or directory` porque o `tsx` não está no PATH direto do proxy; pelo `pnpm exec` resolve-se o binário do workspace.

**A arquitetura ajudou porque...**

O módulo já existia no Module Catalog (`Cognitive Core → packages/cognitive`, camada Intelligence): nenhuma decisão de novo módulo, só a primeira implementação. A composição manual (ADR-0004) tornou tudo testável sem mock — `createAtlas(options, { fetch })` injeta o `fetch` até o gateway, e o `provider: 'fake'` dá uma resposta ponta a ponta sem rede nem credenciais.

O Core como único orquestrador/composition root (Regra 11) absorveu todo o wiring (gateway + cognitive) sem vazar implementações para `@atlas/cognitive` (que depende só do contrato) nem para a CLI. Trocar o modelo por trás do `ask` é só configuração — o Cognitive Core não conhece o provedor.

**A arquitetura atrapalhou porque...**

Nada estrutural — a ordem das tasks (refatoração de tipos → package sem consumidor → tornar `config.model`/`cognitive` obrigatórios ajustando o único teste que os constrói à mão → ligar a CLI) manteve a suíte verde a cada passo. O único atrito foi de tooling (invocação do `tsx` via proxy), não dos limites arquiteturais.

**Precisamos mudar...**

TypeScript segue pinado na série 5 (encaminhamento: repetir o probe do TS7 em SPEC futura; despinar quando o typescript-eslint suportar o compilador nativo).

Próximas etapas do ciclo cognitivo (Planejamento, Execução, Observação, Aprendizado) dependem de Planner/Runtime/Memory/Context, inexistentes (encaminhamento: SPECs futuras); o `CognitiveCore` poderá ganhar operações/retornos mais ricos sem quebrar o contrato atual. Persona/tom ("Jarvis") fica com o Persona Service inexistente (encaminhamento: SPEC futura) — o system prompt desta SPEC é neutro.

---

## [SPEC-0004](specs/SPEC-0004-model-gateway.md) — Model Gateway (2026-07-12)

**Descobrimos que...**

`exactOptionalPropertyTypes: true` impede atribuir `undefined` explicitamente a propriedade opcional: montar `ModelGatewayConfig` no smoke exigiu construção condicional (`if (x !== undefined) config.x = x`) em vez de `{ x: valorTalvezUndefined }`. Padrão a repetir sempre que compor objetos com campos opcionais a partir de fontes `T | undefined` (flags/env).

Injetar `fetch` por parâmetro (`HttpDeps`) permitiu testar os provedores de rede (Ollama/remote) sem tocar a rede, com stubs escritos à mão que capturam URL/headers/body — sem framework de mock, coerente com ADR-0004. A rede real fica só no smoke script.

O ESLint do repo (`@typescript-eslint/no-unused-vars`) **não** ignora o prefixo `_`: um `_config` não usado no provedor `fake` quebrou o lint. O padrão do projeto é zero parâmetros não usados — o `fake` virou `createFakeProvider()` sem parâmetro (e o seletor chama sem argumento). Atenção: `pnpm typecheck`/`pnpm test` passam com var não usada; só `pnpm lint` a pega — rodar os três antes de concluir.

`pnpm --filter <pkg> run <script> -- <flags>` vaza o `--` para o `process.argv` do script, e o `parseArgs` (sem `allowPositionals`) rejeita. A invocação correta para repassar flags é `pnpm --filter <pkg> exec tsx scripts/smoke.ts <flags>` (documentado no README do package).

O probe do TS7 (encaminhamento herdado) falhou de novo em 2026-07-12: com `typescript@7.0.2`, o `@typescript-eslint/typescript-estree@8.63.0` lança `TypeError: Cannot read properties of undefined (reading 'Cjs')` e o ESLint sai com código 2. Revertido para a série 5 com a suíte verde.

**A arquitetura ajudou porque...**

O módulo já existia no Module Catalog (`Model Gateway → packages/model-gateway`): não houve decisão de novo módulo, só a primeira implementação. A regra de placement de contratos (tipos ficam locais até um 2º consumidor) manteve a SPEC isolada — sem tocar `@atlas/contracts`, `@atlas/core` nem `apps/cli`.

Tratar o gateway como adaptador sem estado (Princípio 5) manteve a superfície mínima: uma operação `generate`, três provedores atrás do mesmo contrato, troca por config. Estender para um provedor nativo (ex.: Anthropic Messages) no futuro não quebra consumidores.

**A arquitetura atrapalhou porque...**

Nada estrutural — o único atrito foi de tooling (lint com `_`, `--` do pnpm run, probe do TS7), não dos limites arquiteturais.

**Precisamos mudar...**

TypeScript segue pinado na série 5 (encaminhamento: repetir o probe do TS7 em SPEC futura; despinar quando o typescript-eslint suportar o compilador nativo).

Provedor nativo da Anthropic (API Messages própria) e streaming/tool-use ficaram fora de escopo (encaminhamento: SPECs futuras conforme o Cognitive Core precisar). O slot pago hoje é atendido pelo provedor `remote` OpenAI-compatible.

---

## [SPEC-0003](specs/SPEC-0003-cli-foundation.md) — CLI Foundation (2026-07-12)

**Descobrimos que...**

A rota de execução escolhida no design (Node nativo via _type stripping_) não funciona com a convenção de imports `.js` (NodeNext) do repositório: o Node ≥ 24 não remapeia `.js` → `.ts`, e como todo o repo usa `.js`, nem `@atlas/core` carrega. Adotamos `tsx` (`devDependency`) — registrado no [ADR-0005](../06-adr/ADR-0005-app-typescript-execution.md). Lição: uma decisão de execução deve ser verificada empiricamente antes de virar recomendação no brainstorming; a recomendação original ("Node nativo estende o padrão sem-`dist` naturalmente") não considerou a interação `.js`/type-stripping.

O pnpm 11 não lê mais o campo `pnpm` do `package.json`; a aprovação de build de dependências (o `esbuild`, motor do `tsx`) vive em `pnpm-workspace.yaml` (`allowBuilds`). Sem isso, `pnpm install` sai com código 1 (`ERR_PNPM_IGNORED_BUILDS`) e trava a verificação de deps dos scripts do pnpm.

O `@atlas/core` não re-exporta os tipos de `@atlas/contracts`; consumidores (a CLI) declaram `@atlas/contracts` como dependência direta (regra `apps/* → packages/*`). O plano assumira "só `@atlas/core`" e foi corrigido na execução.

`AtlasConfig` tem propriedades `readonly` e `Partial<AtlasConfig>` as preserva — o override de config precisa ser construído num objeto local mutável antes de retornar.

O probe do TS7 (encaminhamento da [SPEC-0002](specs/SPEC-0002-core-bootstrap.md)) falhou de novo: em 2026-07-12 o typescript-eslint 8.63 continua quebrando com o TS 7.0.2; revertido para a série 5 com a suíte verde. Durante o revert, o executor de comandos ficou temporariamente indisponível e foi destravado com o prefixo `!` (usuário rodou a suíte).

**A arquitetura ajudou porque...**

Gateways como interfaces + composição por parâmetro (ADR-0004) tornaram `run()` testável com o core real e um Output Gateway capturador — sem mocks; a integração apps→core é barata porque `createAtlas` é in-memory.

A validação centralizada no core (`loadConfig`) permitiu ao Input Gateway repassar valores crus e ainda exercitar o caminho de `InvalidConfigError` de ponta a ponta, com código de saída coerente.

Manter as interfaces de Gateway locais em `apps/cli` (não em `@atlas/contracts`) evitou tocar core/contracts e respeitou a regra de placement de contratos (sem 2º consumidor ainda).

**A arquitetura atrapalhou porque...**

Nada estrutural — todo o atrito foi de tooling (execução de TS, pnpm 11, esbuild), não dos limites arquiteturais.

**Precisamos mudar...**

TypeScript segue pinado na série 5 (encaminhamento: repetir o probe do TS7 em SPEC futura; despinar e remover a nota do CLAUDE.md quando o typescript-eslint suportar o compilador nativo).

Distribuição/empacotamento da CLI (bin publicável fora do workspace) continua em aberto (encaminhamento: SPEC futura de distribuição; o shebang `npx tsx` atende só o uso em dev).

---

## SPEC-0002 — Core Bootstrap (2026-07-11)

**Descobrimos que...**

O padrão exports → `./src/index.ts` (sem `dist/`) funcionou sem atrito: Vitest e `tsc` resolvem os packages do workspace direto do fonte, e o dev loop é instantâneo.

O probe do TS7 (encaminhamento da [SPEC-0001](specs/SPEC-0001-workspace-bootstrap.md)) falhou novamente: em 2026-07-11 o typescript-eslint 8.63 ainda quebra com o compilador nativo; revertido para a série 5 com a suíte verde.

Erros fatais do ESLint chegam mascarados pelo proxy de output (RTK); o log completo fica em `~/Library/Application Support/rtk/tee/`.

Uma indisponibilidade temporária do executor de comandos engoliu a corrida vermelha do TDD nos contracts; compensada verificando a contagem de arquivos de teste antes do verde. Os ciclos red→green das demais tasks foram integrais.

**A arquitetura ajudou porque...**

Contratos definidos primeiro tornaram o core trivial de tipar e testar — nenhum teste precisou de mock (ADR-0004: dependências explícitas por parâmetro).

Os hooks do lifecycle (costura para a futura ativação de componentes) tornaram o estado `failed` alcançável e testável sem inventar componentes especulativos.

**A arquitetura atrapalhou porque...**

Nada a registrar — os limites (contracts sem dependências; core como composition root) couberam naturalmente no escopo.

**Precisamos mudar...**

TypeScript segue pinado na série 5 (encaminhamento: repetir o probe do TS7 na SPEC-0003; ao passar, despinar e remover a nota do CLAUDE.md).

---

## SPEC-0001 — Workspace Bootstrap (2026-07-10)

**Descobrimos que...**

A máquina não tinha pnpm; o corepack ativou a última estável (11.11.0), um major acima do que o plano assumia (10.x).

O pnpm exige a flag `-w` para adicionar dependências na raiz do workspace (guard `ERR_PNPM_ADDING_TO_ROOT`).

"Instalar a última estável" trouxe o TypeScript 7.0.2 (compilador nativo), que o typescript-eslint 8.63 ainda não suporta (TypeError em `typescript-estree`); o `pnpm typecheck` puro funcionava com o TS 7 — a quebra era só no lint. Pinamos `typescript@^5` (5.9.3) e tudo ficou verde.

`pnpm format` sem proteção reformataria toda a documentação manuscrita; `**/*.md` no `.prettierignore` resolveu sem custo.

**A arquitetura ajudou porque...**

O plano previa explicitamente o risco de incompatibilidade do TS 7 e o fallback (`typescript@^5`), então o problema foi resolvido em um passo, sem parar a execução.

Critérios de aceitação executáveis (cinco comandos na raiz) tornaram a Definition of Done objetiva e verificável.

**A arquitetura atrapalhou porque...**

Nada a registrar — nenhum componente arquitetural em uso ainda nesta SPEC.

**Precisamos mudar...**

Voltar o TypeScript para a série 7 quando o typescript-eslint suportar o compilador nativo (encaminhamento: verificação registrada como observação da SPEC-0002; remover a nota de pin do CLAUDE.md quando resolvido).

Planos devem verificar versões reais na máquina em vez de assumi-las (encaminhamento: [PLAN-0001](plans/PLAN-0001-workspace-bootstrap.md) corrigido nesta entrega; prática incorporada aos próximos planos).
