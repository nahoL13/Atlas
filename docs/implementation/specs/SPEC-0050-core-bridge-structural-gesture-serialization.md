# SPEC-0050 — Serialização de gestos estrutural no main process: `resolveAskSnapshot` e `sendChatTurn` passam a **ler** o rastreio de operação em voo

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0050

---

**Título**

Fechamento do resíduo D7 da SPEC-0049: o rastreio de operação em voo do `core-bridge` (`busySessions`/`inFlightOperations`) passa a ser guarda de entrada também de `resolveAskSnapshot` e `sendChatTurn` — somando-se aos consumidores que já existem (`updatePersona`, `selectPermissionRoots`) —, tornando o invariante "um round-trip contra o Core por vez" estrutural no main process, e não mais garantia exclusiva do renderer

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

- [ ] Critical
- [ ] High
- [x] Medium
- [ ] Low

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 2 — 2.2 Experiência Conversacional`.

É o fecho estrutural do mesmo invariante ("um gesto por vez") que as SPECs 0048/0049 fecharam no renderer, sobre o chat visual (SPEC-0033) e o painel `ask` (SPEC-0032) entregues por esse item. Nenhum item de Roadmap novo é necessário; nenhuma capacidade nova é entregue ao usuário.

---

> **Revisão v1.1 (1º veto do `architecture-reviewer`, incorporado):** a v1.0 afirmava que `hasInFlightOperation()` tinha **um único** consumidor (`selectPermissionRoots`). É falso: `updatePersona` já o consome (`core-bridge.ts:273`, guarda da SPEC-0039, com teste em `core-bridge.persona-authoring.test.ts:210`). São **dois consumidores / três chamadas** hoje, e serão **quatro consumidores / cinco chamadas** depois desta SPEC. Corrigidos: Objetivo (item 3), Motivação, Fluxo Esperado, CA 3, CA 13, DoD (a), D1 e Resultado Esperado; acrescentadas D11 (enumeração publicada) e D12 (assimetria pré-existente de `selectPersona`, apenas registrada — sem mudança de código).

---

# Objetivo

Quando esta SPEC estiver concluída deverá existir:

1. **`resolveAskSnapshot` recusando estruturalmente** um `ask` disparado enquanto houver qualquer operação em voo rastreada pelo `core-bridge` (turno de chat em `busySessions`, outro `ask`, ou a janela de abertura de `openChatSession`) — rejeição com `Error` estruturado e mensagem pinada, **sem** subir um Core, sem tocar `inFlightOperations` e sem efeito colateral algum.
2. **`sendChatTurn` recusando estruturalmente** um turno disparado nas mesmas condições — rejeição com `Error` estruturado e mensagem pinada, **sem** chamar `atlas.cognitive.respond`, sem marcar `busySessions` e **sem** derrubar a sessão viva (que segue utilizável no turno seguinte).
3. **Uma única origem de decisão** para as guardas do main process: `hasInFlightOperation()` — hoje consultada por `updatePersona` (1 chamada) e `selectPermissionRoots` (2 chamadas) — passa a ser a mesma condição consultada pelas duas funções acima, totalizando **quatro consumidores / cinco chamadas**. Nenhuma condição paralela, nenhum contador novo, nenhuma guarda existente alterada ou removida.
4. **A garantia documentada em "Rastreio de operação em voo" reescrita e completa**: hoje ela descreve apenas quem **marca** e omite quem **lê** — inclusive o consumidor que já existe (`updatePersona`). Passa a enumerar os quatro consumidores, a registrar que `selectPersona` usa uma condição **parcial** (`busySessions` inline, sem `inFlightOperations` — logo um `ask` em voo não bloqueia a troca de Persona, embora bloqueie a edição da Persona ativa), e a manter explícita a lista de funções deliberadamente **não** rastreadas e **não** guardadas (`resolveStatusSnapshot`, `resolveMemorySnapshot`, `forgetFact`, e — decisão desta SPEC — `openChatSession`).
5. **A suíte cobrindo as duas recusas e as duas aceitações correspondentes**, mais a não-regressão das recusas de `selectPermissionRoots` e da guarda de `updatePersona`, nos arquivos de teste de `core-bridge` já existentes por assunto.

Sem contrato novo, sem ADR novo, sem canal IPC novo, sem dependência nova, sem tocar `packages/*`, `apps/cli`, `@atlas/contracts`, o renderer, o `preload.cjs` ou o `main.ts`.

---

# Motivação

**Resíduo D7, registrado duas vezes e nomeado como candidato a SPEC própria.** A SPEC-0048 (Fora do Escopo) e a SPEC-0049 (D7, Fora do Escopo, Observações e DoD-d.2) deixaram registrado, nas duas, o mesmo limite: a serialização de gestos entregue por elas é **garantia do renderer**. O usuário escolheu explicitamente este resíduo como o próximo trabalho, e ele está listado em `docs/05-context/NEXT_CONTEXT.md` ("Próximo Trabalho" → "Sobre a SPEC-0049") e em `apps/desktop/CLAUDE.md` ("Candidatos futuros já nomeados").

**O que o código realmente faz hoje** (verificado no fonte, e mais preciso do que a formulação abreviada do resíduo):

- `resolveAskSnapshot` **já incrementa** `inFlightOperations` (`core-bridge.ts:557`), `openChatSession` também (`:631`), e `sendChatTurn` **já marca** `busySessions` (`:658`).
- `hasInFlightOperation()` (`:138-140`) **já tem dois consumidores**: `updatePersona` (`:273`, guarda da SPEC-0039 — "Não é possível editar a Persona ativa: há uma operação em andamento.") e `selectPermissionRoots` (`:425` e `:451`, passos 3 e 5 da SPEC-0038). Dois consumidores, três chamadas.
- O que **não** existe é a leitura pelas próprias funções que marcam: nem `resolveAskSnapshot` nem `sendChatTurn` consultam a condição. Do ponto de vista delas, o rastreio é *write-only* — pagam o custo de marcar para que **outras** funções recusem, e nunca se recusam entre si. Nada no main process impede dois `resolveAskSnapshot` concorrentes, nem um `sendChatTurn` concorrente a um `ask`; a única barreira é o `disabled`/guarda do renderer (SPECs 0048/0049).
- Há ainda uma **assimetria pré-existente**: `selectPersona` (`:215`) recusa por `busySessions.size > 0` **inline**, sem `hasInFlightOperation()`. Consequência observável: um `ask` em voo **não** bloqueia a troca de Persona, embora bloqueie a edição da Persona ativa (`updatePersona`). Esta SPEC **não** altera esse comportamento (fora do resíduo D7 e fora do pedido), mas o registra — porque publicar uma formulação nova da garantia sem mencioná-lo trocaria uma imprecisão por outra (Artigo 1).

**Por que isso importa.** Um `ask` e um turno de chat sobem, cada um, um Core capaz de **executar Tools** — inclusive as destrutivas atrás do `ConfirmPort`. A defesa contra a concorrência mora hoje na camada de UI, que por definição é a menos confiável do sistema: qualquer caminho que não passe pelo `<form>` (um `submit` programático, um canal IPC exercitado direto, uma futura barra de comandos, o equivalente CLI, um teste de integração) contorna a garantia inteira. O projeto já decidiu, na SPEC-0048/D2 e na SPEC-0049/D4, que "`disabled` é camada de UX, não garantia" — esta SPEC aplica exatamente esse mesmo raciocínio uma camada abaixo, onde o estado que decide já existe, já é mantido e **já é consultado por duas outras funções**.

**Efeito sobre `selectPermissionRoots` e `updatePersona` (o motivo de ser SPEC própria).** As SPECs 0048/0049 mantiveram isto fora porque `hasInFlightOperation()` governa um caminho de **segurança**: a concessão de política de escrita. Esta SPEC não altera esse caminho — não muda o contador, não muda o que o incrementa, não muda a ordem das seis etapas de `selectPermissionRoots`, não muda a rechecagem da correção A7, e não toca a guarda de `updatePersona`. O que muda é o **número de consumidores** da mesma condição. A não-regressão dos dois caminhos é critério de aceitação explícito (CA 11/12/13), e é por isso que a mudança é revisada isoladamente, e não de carona numa correção de UX.

Rastreabilidade documental:

- **PRD**, *Requisitos Funcionais → Execução* (l. 105-107, "o sistema deve executar tarefas autorizadas pelo usuário" — dois round-trips concorrentes não são um gesto que o usuário autorizou como concorrente) e *→ Transparência* (l. 149, a recusa é explícita e legível, nunca silenciosa no main process); *Critérios de Qualidade* (l. 204, "consistência de comportamento").
- **Constituição**, Artigo 1 (a garantia publicada em `apps/desktop/CLAUDE.md` passa a descrever o que o código sustenta — hoje ela **omite** os consumidores existentes, e o texto atual já viola o artigo por isso), Artigo 4 (o `core-bridge` é a camada da aplicação que medeia o Core; a guarda vive onde o estado vive) e o teste padrão: mais simples (uma condição, um lugar, quatro consumidores), mais transparente (a recusa é observável e testável sem DOM), mais sustentável (a garantia deixa de depender da camada mais volátil).
- **Module Catalog** — nenhum módulo muda de responsabilidade; `apps/desktop` é aplicação (Input/Output Gateway), não módulo do catálogo, e segue consumindo o Core só por contratos públicos.
- **SPEC-0049/D7** e **SPEC-0048/Fora do Escopo** — esta SPEC é literalmente o item que ambas registraram como não entregue.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Requisitos Funcionais (Execução, Transparência), Critérios de Qualidade
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 1, 4, 7, 11; Emendas v1.1 e v1.2
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Input Gateway / Output Gateway (aplicação cliente); nenhum módulo tocado
- [Development Guide](../../04-engineering/DevelopmentGuide.md)
- [ClaudeCodeAutomation](../../04-engineering/ClaudeCodeAutomation.md) — "Ramo micro" e "Verificação escopada" (SPEC-0042)
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.2
- [ADR-0019 — stack Electron para `apps/desktop`](../../06-adr/ADR-0019-desktop-electron-stack.md) — **intacto**; o renderer não é tocado
- [ADR-0013 — Permission Service como portão de execução](../../06-adr/ADR-0013-permission-service-execution-gate.md) — **intacto**; nenhuma decisão de permissão muda
- [ADR-0009 — Context Service](../../06-adr/ADR-0009-context-service-value-store.md) — a mediação de `sendChatTurn` (ler/gravar conversa) sai inalterada
- [SPEC-0049](./SPEC-0049-desktop-ask-form-serialization-and-error-surfacing.md) (`Done`) — origem direta (D7); o `.catch` que ela acrescentou ao `#ask-form` é o que torna a recusa desta SPEC visível ao usuário
- [SPEC-0048](./SPEC-0048-desktop-chat-send-ask-serialization.md) (`Done`) — 1º registro do mesmo resíduo; D2 ("`disabled` é UX, não garantia") é o princípio aplicado aqui
- [SPEC-0039](./SPEC-0039-desktop-persona-authoring.md) (`Done`) — **origem da guarda de `updatePersona`** sobre `hasInFlightOperation()` (`core-bridge.ts:273`), consumidor pré-existente fora de `selectPermissionRoots`; não pode regredir
- [SPEC-0038](./SPEC-0038-desktop-permission-roots-gui.md) (`Done`) — origem de `inFlightOperations`/`hasInFlightOperation`/`__resetBridgeStateForTests` (D10, correções A6/A7)
- [SPEC-0037](./SPEC-0037-desktop-runtime-persona-switch.md) (`Done`) — origem de `busySessions` (D9) e da recusa de `selectPersona` com turno em voo (condição **parcial**, ver D12), cujo padrão de mensagem é seguido aqui
- [SPEC-0042](./SPEC-0042-test-split-scoped-verification.md) (`Done`) — a suíte de `core-bridge` dividida em sete arquivos por assunto + `helpers/core-bridge-harness.ts`
- `apps/desktop/CLAUDE.md` — seções "Rastreio de operação em voo" e "Serialização de gestos"

---

# Escopo

## Frente 1 — guarda de entrada em `resolveAskSnapshot`

Em `apps/desktop/src/core-bridge.ts`, dentro de `resolveAskSnapshot` (hoje `:552-583`): **antes** de `inFlightOperations += 1` e antes de qualquer `await`, uma guarda

```
if (hasInFlightOperation()) { throw new Error(<mensagem pinada>); }
```

A recusa acontece antes do incremento — logo, uma recusa **não** altera o contador (não há `finally` a compensar) e não deixa resíduo de estado. Nenhuma outra linha da função muda: a marcação, o `createAtlas`, a gravação de `learned`, o `atlas.shutdown()` e o `finally` de decremento saem exatamente como estão.

Mensagem pinada (texto exato, em PT-BR, no molde das recusas já existentes de `selectPersona`/`updatePersona`):

```
Não é possível iniciar uma pergunta: há uma operação em andamento.
```

## Frente 2 — guarda de entrada em `sendChatTurn`

Em `apps/desktop/src/core-bridge.ts`, dentro de `sendChatTurn` (hoje `:653-677`): a guarda entra **depois** de `mustGetChatSession(session)` (validação estrutural do handle primeiro, fail-closed — mesmo padrão de `selectPersona`/`updatePersona`, que validam o alvo antes de checar ocupação) e **antes** de `busySessions.add(session)`:

```
if (hasInFlightOperation()) { throw new Error(<mensagem pinada>); }
```

A recusa não marca `busySessions`, não entra no `try`/`finally`, não toca o Core e **não** remove a sessão de `chatSessions` — a sessão segue viva e utilizável (paridade com a resiliência já declarada: "turno que falha não derruba a sessão").

Mensagem pinada:

```
Não é possível enviar o turno: há uma operação em andamento.
```

## Frente 3 — comentários de bloco atualizados no fonte

Três blocos de comentário de `core-bridge.ts` passam a descrever o estado real (Artigo 1):

1. o bloco de `inFlightOperations` (hoje `:125-136`), que hoje afirma que "`selectPermissionRoots` recusa a aplicação enquanto este contador ou `busySessions` forem não-vazios/positivos" — afirmação **incompleta já hoje**, porque omite `updatePersona`. Passa a enumerar os **quatro** consumidores de `hasInFlightOperation()` (`updatePersona`, `selectPermissionRoots` ×2, `resolveAskSnapshot`, `sendChatTurn`) e a registrar que `selectPersona` usa condição **parcial** (`busySessions` inline), citando esta SPEC;
2. o bloco de `resolveAskSnapshot` (hoje `:536-551`), que hoje descreve a marcação como existindo só em favor de `selectPermissionRoots`;
3. o bloco/comentário interno de `sendChatTurn` (hoje `:645-657`), idem para `busySessions`/`selectPersona`.

Nenhum outro comentário do arquivo é revisado (D6 da SPEC-0048 aplicada: escopo de comentário fechado aos blocos nomeados). Em particular, os comentários de `updatePersona` e de `selectPersona` **não** são editados — o registro daquelas guardas é doc viva (DoD a), não fonte.

## Frente 4 — cobertura

1. Em `apps/desktop/tests/core-bridge.status-ask.test.ts` (existente, estendido), no `describe('resolveAskSnapshot')`:
   - **caso novo (ask × ask)**: com um `ask` em voo (segurado por dublê de `fetch` com provedor `local`, padrão já usado em `core-bridge.permissions.test.ts`), um segundo `resolveAskSnapshot` **rejeita** com a mensagem pinada; o 1º conclui íntegro (texto e `learned` esperados); depois de assentar, um `resolveAskSnapshot` novo é **aceito** e devolve snapshot normal;
   - **caso novo (chat → ask)**: com um turno de chat em voo, `resolveAskSnapshot` rejeita com a mensagem pinada e **nenhum Core é criado** (espião sobre `createAtlas`, molde do caso "chama atlas.shutdown()" já presente no arquivo); ao assentar o turno, é aceito.
2. Em `apps/desktop/tests/core-bridge.chat-session.test.ts` (existente, estendido):
   - **caso novo (ask → chat)**: com um `ask` em voo, `sendChatTurn` rejeita com a mensagem pinada, `atlas.cognitive.respond` não é chamado e a **conversa da sessão fica inalterada**; ao assentar o `ask`, o mesmo `sendChatTurn` é aceito e devolve `reply` normal — a sessão nunca foi derrubada;
   - **caso novo (turno × turno)**: com um turno em voo na mesma sessão, um segundo `sendChatTurn` rejeita com a mensagem pinada e o 1º conclui íntegro;
   - **caso novo (ordem das guardas)**: `sendChatTurn` sobre um handle desconhecido, **durante** um `ask` em voo, rejeita com o erro de *sessão desconhecida* (não com o de operação em voo) — pina a decisão D4.
3. Em `apps/desktop/tests/core-bridge.permissions.test.ts` (existente, estendido): **caso novo de não-regressão** — o caso já existente que dispara um `ask` **durante** o diálogo de `confirmGrant` (`:287-352`) continua valendo (aquele `ask` sobe com o `Map` de sessões ocioso e `inFlightOperations` em zero, logo não é recusado pela guarda nova); acrescentar asserção explícita de que esse `ask` **resolve** (não rejeita), para que a interação entre a guarda nova e a rechecagem A7 fique travada por teste, e não por leitura.

`apps/desktop/tests/core-bridge.persona-authoring.test.ts` (que cobre a guarda de `updatePersona`, `:210`) **não é editado** — roda como não-regressão (CA 12).

Nenhum outro arquivo de teste é editado. Nenhum arquivo de teste é criado.

---

# Fora do Escopo

- **Alterar, mover ou remover a guarda de `updatePersona`** (`core-bridge.ts:273`, SPEC-0039) sob qualquer pretexto, inclusive "reduzir o número de consumidores": é proteção existente, com teste existente, e sua preservação é CA explícito (CA 3/12).
- **Uniformizar `selectPersona`** para usar `hasInFlightOperation()` no lugar de `busySessions.size > 0` — D12. Está **fora do resíduo D7** e fora do pedido; mudaria o comportamento de um caminho de configuração (um `ask` em voo passaria a bloquear a troca de Persona) sem que ninguém tenha pedido, e merece a sua própria aferição de UX. Vira **candidato nomeado** em doc viva e nas lições.
- **Guardar `openChatSession`** contra operação em voo — D5. Ela segue **marcando** (correção A6 da SPEC-0038, intacta), mas não recusa: o renderer a chama no arranque e logo após toda troca de Persona/permissões, e transformá-la em ponto de recusa criaria falha de abertura de sessão em caminhos automáticos que o usuário não disparou.
- **Guardar `resolveStatusSnapshot`, `resolveMemorySnapshot` e `forgetFact`** — não executam Tools, não são julgadas pelo portão de raízes e não são rastreadas por desenho documentado (SPEC-0038/D10); guardá-las produziria recusa espúria em leituras inofensivas.
- **Cancelar um `ask`/turno de chat em voo** (botão de escape, `AbortSignal`, timeout) — capacidade nova, candidato já nomeado pelo gate da SPEC-0049 (A3) e mantido aberto. Esta SPEC **aumenta** a importância dele (com a guarda, uma operação travada bloqueia também o main process, não só a UI), e por isso o registra nas lições, mas não o implementa: exigiria caminho de cancelamento no Core ou no `createAtlas`.
- **Fila/enfileiramento de gestos** ou retry automático da operação recusada — a recusa é imediata e o usuário reemite o gesto; enfileirar mudaria a semântica de "um por vez" para "serialize por mim", decisão de produto não pedida.
- **Trocar `Error` por classe de erro dedicada e exportada** (ex.: `InFlightOperationError`) ou por código estruturado que cruze o IPC — D3. `apps/desktop` usa `Error` com mensagem estruturada em todas as recusas do bridge; introduzir um tipo novo seria superfície nova sem 2º consumidor.
- **Tratamento novo no renderer** para a recusa: `renderer.js`, `index.html`, `preload.cjs` e `main.ts` ficam **fora do diff**. O caminho de erro do `ask` já pinta `⚠️ <mensagem>` (SPEC-0049) e o do chat já escreve o erro no transcript; a mensagem pinada foi escrita para ser legível nesses dois lugares sem tradução.
- **Mudar `selectPermissionRoots`**: nem a ordem das seis etapas, nem a rechecagem A7, nem a semântica das recusas, nem o `confirmGrant`.
- **Rastrear `selectPersona`/`selectPermissionRoots`/funções de Persona** em `inFlightOperations` (a direção inversa: operações de configuração bloqueando `ask`/chat) — não foi pedido, e a proteção que importa (config não se aplica sobre operação em voo) já existe.
- **`__resetBridgeStateForTests()` fechar sessões vivas** (SPEC-0042/D15, candidato registrado) — toca o mesmo arquivo, mas é higiene de teste independente.
- **Quebrar `core-bridge.ts` em arquivos menores** (SPEC-0042/D8) — mudança estrutural, SPEC própria.
- Qualquer alteração em `packages/*`, `apps/cli`, `@atlas/contracts`, `apps/desktop/src/renderer/*`, `main.ts`, `preload.cjs`, `piper-tts.ts`, `stt-engine.ts`, `speech-output.ts`, `media-permission.ts`, portas de diálogo, CSS ou canais IPC.
- Dependência nova, mudança de `vitest.config.ts` da raiz, de `package.json` (raiz ou app), do lockfile ou da CI.
- Confirmação de smoke visual/sonoro em ambiente gráfico — pendência conhecida e ortogonal (Observações).

---

# Pré-requisitos

- [SPEC-0049](./SPEC-0049-desktop-ask-form-serialization-and-error-surfacing.md) — `Done` (verificado no arquivo: `- [x] Done`). Origem do resíduo D7 e do `.catch` do `#ask-form`, que torna a recusa nova visível ao usuário sem tocar o renderer.
- [SPEC-0048](./SPEC-0048-desktop-chat-send-ask-serialization.md) — `Done` (verificado no arquivo: `- [x] Done`). 1º registro do resíduo; guarda equivalente no `#chat-form`, que mantém o caminho normal do usuário longe da recusa nova.
- [SPEC-0039](./SPEC-0039-desktop-persona-authoring.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece a guarda de `updatePersona` sobre `hasInFlightOperation()` e o teste que a trava.
- [SPEC-0038](./SPEC-0038-desktop-permission-roots-gui.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece `inFlightOperations`, `hasInFlightOperation()`, `__resetBridgeStateForTests()` e os casos de recusa de `selectPermissionRoots` que não podem regredir.
- [SPEC-0037](./SPEC-0037-desktop-runtime-persona-switch.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece `busySessions` e o padrão de mensagem de recusa.
- [SPEC-0042](./SPEC-0042-test-split-scoped-verification.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece a divisão por assunto da suíte de `core-bridge` e o `helpers/core-bridge-harness.ts` usados aqui.

Nenhum outro: esta SPEC não depende de comportamento novo de nenhum package.

---

# Critérios de Aceitação

> **Convenção de medição (CA 1, 2 e 15):** todo critério de diff e de contagem é medido contra o **commit-base registrado no passo 1 da Estratégia de Implementação** (`git rev-parse HEAD` antes de qualquer edição) e diz respeito **apenas ao diff atribuível a esta SPEC**. Alteração alheia já presente na árvore deve ser reportada, não incorporada nem revertida.

1. O diff atribuível a esta SPEC contém **exatamente cinco** arquivos: `apps/desktop/src/core-bridge.ts`, `apps/desktop/tests/core-bridge.status-ask.test.ts`, `apps/desktop/tests/core-bridge.chat-session.test.ts`, `apps/desktop/tests/core-bridge.permissions.test.ts` e o arquivo desta SPEC — verificável por `git diff --name-only <commit-base>..HEAD`.
2. Nenhum arquivo sob `packages/`, `apps/cli/`, `.github/`, nem `apps/desktop/src/main.ts`/`preload.cjs`/`renderer/*`/`piper-tts.ts`/`stt-engine.ts`/`speech-output.ts`/`media-permission.ts`/portas de diálogo aparece nesse diff. `apps/desktop/tests/core-bridge.persona-authoring.test.ts` também **não** aparece.
3. Ao final, `hasInFlightOperation()` tem **exatamente quatro consumidores / cinco chamadas** em `core-bridge.ts`: `updatePersona` (1 chamada, **preservada byte-a-byte**), `selectPermissionRoots` (2 chamadas, passos 3 e 5, **preservadas byte-a-byte**), `resolveAskSnapshot` (1, nova) e `sendChatTurn` (1, nova). Nenhuma condição equivalente é reescrita inline em nenhum dos quatro; nenhum contador ou flag novo é introduzido; **nenhuma chamada existente é removida, movida ou reordenada** — reduzir consumidores nunca é caminho para fechar este critério.
4. `resolveAskSnapshot` lança quando `hasInFlightOperation()` é verdadeiro, **antes** de `inFlightOperations += 1` e antes de qualquer `await`; a mensagem é exatamente `Não é possível iniciar uma pergunta: há uma operação em andamento.`
5. `sendChatTurn` lança quando `hasInFlightOperation()` é verdadeiro, **depois** de `mustGetChatSession(session)` e **antes** de `busySessions.add(session)`; a mensagem é exatamente `Não é possível enviar o turno: há uma operação em andamento.`
6. Teste: com um `ask` em voo, um segundo `resolveAskSnapshot` rejeita com a mensagem do CA 4; o 1º conclui íntegro; após ele assentar, um `resolveAskSnapshot` novo resolve normalmente.
7. Teste: com um turno de chat em voo, `resolveAskSnapshot` rejeita e **`createAtlas` não é chamado** por essa tentativa (espião); após o turno assentar, resolve normalmente.
8. Teste: com um `ask` em voo, `sendChatTurn` rejeita com a mensagem do CA 5, `atlas.cognitive.respond` não é chamado, a sessão **permanece viva** e o turno seguinte (após o `ask` assentar) resolve normalmente com a conversa íntegra.
9. Teste: com um turno em voo na mesma sessão, um segundo `sendChatTurn` rejeita com a mensagem do CA 5 e o 1º conclui íntegro.
10. Teste (ordem das guardas, D4): `sendChatTurn` sobre handle desconhecido durante um `ask` em voo rejeita com a mensagem de **sessão desconhecida ou já encerrada**, não com a de operação em voo.
11. **Não-regressão de `selectPermissionRoots`**: todos os casos existentes de `core-bridge.permissions.test.ts` seguem verdes **sem alteração de comportamento asserido** — turno de chat em voo bloqueia a aplicação, `ask` em voo bloqueia a aplicação, escrita recusada é fail-closed, sessões vivas são encerradas na aplicação bem-sucedida, e a rechecagem A7 (`:287-352`, operação iniciada durante o `confirmGrant`) segue abortando a aplicação. O `ask` disparado dentro do `confirmGrant` naquele caso **resolve** (não é recusado pela guarda nova), agora com asserção explícita.
12. **Não-regressão de `updatePersona`**: `apps/desktop/tests/core-bridge.persona-authoring.test.ts` segue verde **sem edição** (em especial o caso de `:210`, que prova a recusa de editar a Persona ativa com operação em voo), e a guarda de `core-bridge.ts:273` sai inalterada no diff.
13. **Não-regressão de estado**: uma recusa (das duas frentes) deixa `inFlightOperations` e `busySessions` **exatamente** como estavam — verificável de forma observável por uma chamada de `selectPermissionRoots` bem-sucedida logo após uma recusa, **sem nenhuma operação real em voo e sem ampliar `writeRoots`** (a chamada de aferição usa apenas raízes de leitura e/ou remoção de raízes, para não passar pelo caminho de consentimento `confirmGrant`).
14. `__resetBridgeStateForTests()` sai inalterado, e todo caso que abre sessão a fecha explicitamente em `finally` (`closeChatSessionIfOpen`), preservando a disciplina que a SPEC-0042 estabeleceu.
15. **Delta de suíte** sobre a base observada no passo 1 (esperada: **978 testes / 74 arquivos**): `pnpm test` na raiz passa, **nenhum arquivo de teste é criado ou removido** (delta de arquivos = 0) e o total de testes sobe em **+5 ou mais**. Se a base observada divergir de 978/74, prevalece a observada e a divergência é reportada.
16. O gate de paridade renderer↔módulo segue verde **sem edição**: `apps/desktop/tests/renderer.speech-parity.test.ts` não aparece no diff e continua passando (registro com 10 entradas, três módulos vigiados — `core-bridge.ts` não é módulo vigiado e continua não sendo).
17. Todos os testes de renderer (`renderer.*.test.ts`) seguem verdes **sem edição** — a serialização do renderer não regride e não passa a depender da guarda nova.
18. `pnpm --filter @atlas/desktop test` e `pnpm --filter @atlas/desktop typecheck` passam; os três arquivos de teste tocados passam quando executados **sozinhos**, e a suíte de `apps/desktop` passa sob `--sequence.shuffle` em **duas** sementes distintas (CA herdado da SPEC-0042: o estado de módulo do bridge é exatamente o risco desta fatia).
19. `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm format:check` passam na raiz.
20. Nenhum teste desta SPEC executa processo externo, abre socket, faz chamada de rede real (o dublê de `fetch` é local e restaurado em `finally`) ou depende de Piper/whisper/Electron instalados.

---

# Arquivos Esperados

```text
apps/desktop/src/core-bridge.ts                         (modificado — Frentes 1, 2 e 3)
apps/desktop/tests/core-bridge.status-ask.test.ts       (modificado — Frente 4.1)
apps/desktop/tests/core-bridge.chat-session.test.ts     (modificado — Frente 4.2)
apps/desktop/tests/core-bridge.permissions.test.ts      (modificado — Frente 4.3)
docs/implementation/specs/SPEC-0050-core-bridge-structural-gesture-serialization.md
```

**Nenhum outro arquivo no diff atribuível a esta SPEC.** Arquivo alheio já modificado na árvore no início do trabalho não pertence a esta SPEC: reportar, não incorporar nem reverter.

---

# Componentes Impactados

- `@atlas/desktop` — **somente** `src/core-bridge.ts` e três arquivos de teste.

Nenhum módulo do Module Catalog é tocado. Nenhum módulo novo. Nenhum contrato público alterado. Nenhuma mudança no renderer, no IPC, no `main.ts` ou na fronteira de segurança do Electron. Nenhuma mudança no Permission Service nem em qualquer decisão do ADR-0013. Nenhuma mudança nas funções de Persona.

---

# Interfaces Necessárias

**Nenhuma.** Nenhuma assinatura pública de `core-bridge.ts` muda: `resolveAskSnapshot` e `sendChatTurn` mantêm parâmetros e tipos de retorno (`AskSnapshot`/`TurnSnapshot`), e a recusa se expressa como **rejeição da promessa** — não como campo novo no snapshot (que seria mudança de tipo local visível ao renderer). `@atlas/contracts` não é tocado; nenhum canal IPC novo; nenhuma classe de erro exportada (D3).

---

# Fluxo Esperado

```text
                    hasInFlightOperation()  =  busySessions.size > 0
                                              || inFlightOperations > 0
                              │
      ┌───────────────┬───────┴────────┬──────────────────┐
      ▼               ▼                ▼                  ▼
updatePersona   selectPermissionRoots   resolveAskSnapshot   sendChatTurn
 (JÁ — :273,     (JÁ — passos 3 e 5,        (NOVO)             (NOVO)
  SPEC-0039)      2 chamadas)
                                  ⇒ 4 consumidores / 5 chamadas

selectPersona (:215) usa condição PARCIAL: busySessions.size > 0, inline
  ⇒ um `ask` em voo NÃO bloqueia a troca de Persona (assimetria pré-existente,
    apenas registrada por esta SPEC — D12, sem mudança de código)

resolveAskSnapshot(objective)
  ├─ hasInFlightOperation()? ─► throw Error("…iniciar uma pergunta…")   (NOVO)
  │                              (sem createAtlas, sem tocar o contador)
  └─ inFlightOperations += 1 ─► createAtlas ─► ask ─► shutdown ─► finally: -= 1

sendChatTurn(session, input)
  ├─ mustGetChatSession(session)  ─► handle inválido ⇒ Error de sessão   (1º)
  ├─ hasInFlightOperation()? ─► throw Error("…enviar o turno…")          (NOVO, 2º)
  │                              (sem respond, sem marcar, sessão viva)
  └─ busySessions.add ─► respond ─► updateConversation ─► finally: delete

openChatSession  ─► segue marcando, NÃO recusa (D5)
resolveStatusSnapshot / resolveMemorySnapshot / forgetFact
                 ─► seguem sem marcar e sem recusar (SPEC-0038/D10)
```

---

# Estratégia de Implementação

1. **Registrar o commit-base** (`git rev-parse HEAD`) e a **linha de base real** da suíte (`pnpm test` na raiz — esperado 978 testes / 74 arquivos), anotando ambos no relatório final. Conferir se a árvore está limpa; se não, reportar o que já estava modificado.
2. Reler, no fonte, as regiões a editar e as a **preservar**: `inFlightOperations`/`hasInFlightOperation`, `resolveAskSnapshot`, `sendChatTurn`, a guarda de `updatePersona` (`:273`), a condição parcial de `selectPersona` (`:215`) e o caso de rechecagem A7 em `core-bridge.permissions.test.ts` (`:287-352`). Confirmar por busca que os consumidores atuais de `hasInFlightOperation()` são **três chamadas em duas funções** — se divergir, é achado: pare e reporte.
3. **Primeiro o teste (RED):** escrever os cinco casos novos (CA 6, 7, 8, 9, 10) reusando o padrão de operação em voo já presente em `core-bridge.permissions.test.ts` (dublê de `fetch` com provedor `local` e portão de liberação; `finally` restaurando `globalThis.fetch`). Rodar `pnpm --filter @atlas/desktop test` e **ver falhar** pelos motivos esperados — hoje a 2ª chamada simplesmente **sucede**. Registrar a falha observada no relatório final.
4. Aplicar a Frente 1 e a Frente 2 em `core-bridge.ts`; rodar de novo até verde.
5. Rodar `core-bridge.permissions.test.ts` e `core-bridge.persona-authoring.test.ts` **inteiros** e conferir caso a caso (CA 11 e 12): se **qualquer** caso deles passar a falhar, é **achado** — pare e reporte, não "ajuste" o teste e **nunca** relaxe ou remova uma guarda existente para fazer um critério fechar. Só então acrescentar a asserção nova do CA 11 (o `ask` dentro do `confirmGrant` resolve).
6. Aplicar a Frente 3 (comentários) e conferir que nenhum corpo de função foi tocado além das duas guardas novas.
7. Rodar cada arquivo de teste tocado **sozinho**, a suíte de `apps/desktop` sob duas sementes embaralhadas, e confirmar que nenhum `renderer.*.test.ts` nem `core-bridge.persona-authoring.test.ts` precisou de edição (CA 12/17 — se algum exigir, é achado: pare e reporte).
8. Fechar com `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` na raiz e conferir o diff final contra o commit-base (CA 1, 2, 15).

---

# Estratégia de Testes

- **RED antes de GREEN**: os casos novos precisam falhar contra a implementação atual — hoje a operação concorrente é simplesmente aceita, e é isso que prova o defeito (passo 3; registrar a falha observada).
- **Comportamento observável**, nunca introspecção do estado de módulo: nada de exportar `inFlightOperations` nem de espiar variáveis internas. As asserções são sobre **rejeição vs. resolução**, mensagem do erro, chamadas registradas em dublês (`createAtlas`, `fetch`, `respond`) e efeito posterior observável (a sessão segue utilizável; `selectPermissionRoots` volta a ser aceito).
- **Recusa em pé de igualdade com sucesso**: todo caso de guarda prova as duas metades — recusa enquanto em voo, aceitação depois de assentar (CA 6, 7, 8, 9). Uma guarda que recusa sempre passaria num teste que só verifica a recusa.
- **Não-regressão dos consumidores pré-existentes**: `core-bridge.permissions.test.ts` roda inteiro e sem enfraquecimento (única edição autorizada: **adicionar** uma asserção, CA 11); `core-bridge.persona-authoring.test.ts` roda inteiro **sem nenhuma edição** (CA 12).
- **Isolamento e ordem**: `__resetBridgeStateForTests()` entre casos (já em vigor) e fecho explícito de toda sessão aberta em `finally` — o risco real desta fatia é vazamento de estado de módulo, e ele só aparece sob `--sequence.shuffle` (CA 18, achado histórico da SPEC-0042).
- **Determinismo**: sem rede real, sem processo externo, sem dependência de binários instalados; todo dublê de `fetch` restaurado em `finally` (CA 20).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- testes estiverem passando (delta do CA 15 sobre a base observada: 0 arquivos, ≥ +5 testes);
- a observação RED do passo 3 estiver registrada no relatório final do `spec-implementer`;
- documentação atualizada;
- arquitetura preservada (ADR-0019/0013/0009 intactos; nenhum diff em `packages/*`, `apps/cli`, renderer, `main.ts` ou contratos);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` da raiz, `apps/desktop/CLAUDE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `PLATFORM_STATE.md`) é do passo de fecho, **não** do `spec-implementer` — que toca apenas os quatro arquivos de código/teste e o arquivo desta SPEC. O fecho deve obrigatoriamente:

- **(a)** reescrever, em `apps/desktop/CLAUDE.md` ("Rastreio de operação em voo"), a garantia publicada, **enumerando nominalmente os quatro consumidores** de `hasInFlightOperation()` — `updatePersona` (SPEC-0039), `selectPermissionRoots` (2 chamadas, passos 3 e 5), `resolveAskSnapshot` e `sendChatTurn` (novos) —, registrando que **`selectPersona` usa condição parcial** (`busySessions` inline, sem `inFlightOperations`: um `ask` em voo não bloqueia a troca de Persona, embora bloqueie a edição da Persona ativa), que `openChatSession` **marca mas não recusa** (D5), e que `resolveStatusSnapshot`/`resolveMemorySnapshot`/`forgetFact` seguem sem marcar e sem recusar. **O texto atual da seção viola o Artigo 1 ao descrever só quem marca e omitir `updatePersona`** — a frase "A garantia é essa formulação exata" precisa passar a ser verdadeira, e publicar "três consumidores" repetiria o defeito que esta SPEC existe para corrigir;
- **(b)** atualizar, em `apps/desktop/CLAUDE.md` ("Serialização de gestos"), a frase que hoje declara o limite estrutural ("a garantia testável está no `core-bridge` … que **não** cobre `sendChatTurn` nem `resolveAskSnapshot` contra si mesmo (só `selectPermissionRoots`) — limite estrutural conhecido, não fechado por esta linha (D7…)"), que passa a estar **fechada**: a serialização é agora dupla (renderer para UX, main process para garantia);
- **(c)** retirar de `apps/desktop/CLAUDE.md` ("Candidatos futuros já nomeados") e de `NEXT_CONTEXT.md` ("Próximo Trabalho" → "Sobre a SPEC-0049") o item consumido por esta SPEC (rastrear `sendChatTurn`/`resolveAskSnapshot` em `inFlightOperations`), **preservando** os dois outros candidatos ali nomeados (cancelamento de `ask`/turno em voo; pinar `micBusy()` fora de `#ask-submit` por teste) e **acrescentando** um candidato novo: uniformizar `selectPersona` sobre `hasInFlightOperation()` (D12);
- **(d)** registrar nas lições: **(d.1)** que o resíduo aberto desde a SPEC-0048 fechou, e que o rastreio deixou de ser *write-only* do ponto de vista de `ask`/chat; **(d.2)** que **cancelamento de operação em voo** (A3 da SPEC-0049) fica **mais importante** depois desta SPEC — uma operação travada agora bloqueia também o main process, e o único escape segue sendo reabrir a app; **(d.3)** que `openChatSession` marca mas não recusa (D5), assimetria deliberada cujo **custo visível ao usuário** é concreto: um `ask` disparado durante a abertura automática de sessão (arranque, ou reabertura após troca de Persona/permissões) é recusado **sem causa aparente**, e o renderer **não tem como preveni-lo** — `askInFlight`/`chatTurnInFlight` não cobrem a janela de abertura; **(d.4)** que uma premissa de fato errada ("um único consumidor") passou pelo rascunho porque a doc viva a corroborava — a seção "Rastreio de operação em voo" descrevia só quem marca — e só caiu no gate: ler o fonte inteiro, e não a doc, é o que sustenta uma premissa, e um critério de aceitação que **conta** artefatos pode virar armadilha (um implementador literal poderia apagar uma guarda existente para "fechar" o número); **(d.5)** que `selectPersona` segue com condição parcial, assimetria pré-existente agora registrada e nomeada como candidato (D12).

---

# Restrições

- **Somente os cinco arquivos dos "Arquivos Esperados"**. Se fechar qualquer critério exigir tocar o renderer, `main.ts`, `preload.cjs`, outro módulo de `src/` ou qualquer package, **pare e reporte** — é fronteira de outra SPEC.
- **Não remover, mover, enfraquecer nem "unificar" nenhuma guarda existente** — em especial a de `updatePersona` (`:273`) e as duas de `selectPermissionRoots` (`:425`/`:451`). Se algum critério parecer exigir isso, o critério está errado: **pare e reporte**. Reduzir consumidores nunca é caminho para fechar o CA 3.
- **Não alterar `selectPersona`** (a condição parcial de `:215` fica como está — D12).
- **Não alterar `selectPermissionRoots`** em nenhuma linha: nem a ordem das etapas, nem a rechecagem A7, nem as mensagens, nem `confirmGrant`.
- **Não alterar `hasInFlightOperation()`**, `inFlightOperations`, `busySessions`, `withSelections` nem `__resetBridgeStateForTests()` — a condição existente é reusada, não reescrita.
- **Não exportar estado interno** do bridge para viabilizar teste (contador, flag, getter de diagnóstico): o teste é por comportamento observável (D3/Estratégia de Testes).
- **Não alterar nem enfraquecer caso de teste existente**: a única edição autorizada em `core-bridge.permissions.test.ts` é a **adição** da asserção do CA 11; `core-bridge.persona-authoring.test.ts` não é editado. Se um teste pré-existente começar a falhar, é achado: pare e reporte, não "ajuste".
- **Nenhuma dependência nova**; `pnpm-lock.yaml` fora do diff. Não alterar `vitest.config.ts` da raiz nem criar config por package (SPEC-0042/D12).
- Não criar módulos, Tools, Skills ou Personas; não tocar `@atlas/contracts`; não alterar a CI.
- Não expandir para cancelamento, fila de gestos, timeout de operação ou classe de erro dedicada.

---

# Observações

- **Por que isto não exige ADR**: nenhuma decisão arquitetural inédita. O invariante ("um round-trip contra o Core por vez") já está decidido e em vigor desde as SPECs 0037/0038, e o **mecanismo** (`hasInFlightOperation()` sobre `busySessions`/`inFlightOperations`) já existe, já é mantido por estas mesmas funções e **já é consultado por outras duas** (`updatePersona`, `selectPermissionRoots`). Esta SPEC acrescenta consumidores a uma condição existente dentro de **uma aplicação** (`apps/desktop`), não de um módulo do Module Catalog; não cria porta, contrato, canal nem estado. A formulação publicada da garantia muda numa **doc viva** (`apps/desktop/CLAUDE.md`), não num ADR — e a própria SPEC-0049/D7 classificou o item como "candidato a SPEC própria", não a ADR.
- **A garantia vira dupla, não migra.** As guardas do renderer (SPECs 0048/0049) **permanecem** e continuam sendo o caminho normal: elas evitam que o usuário sequer chegue à recusa, e evitam uma mensagem de erro onde hoje há um botão cinza. A guarda do main process é a rede de segurança para todo caminho que não passa pelo `<form>`. Remover a camada de UI seria trocar prevenção por erro — o oposto de "simplicidade para o usuário" (PRD, Critérios de Qualidade).
- **A premissa errada da v1.0, e o que ela ensina.** O rascunho original afirmou que `hasInFlightOperation()` tinha um consumidor só. A afirmação era coerente com a doc viva (que descreve apenas quem **marca**) e com a formulação abreviada do resíduo D7, mas não com o fonte: `updatePersona` já guardava desde a SPEC-0039. O gate pegou. O efeito prático mais perigoso era o CA 3 na forma antiga ("exatamente três consumidores"), insatisfazível e capaz de induzir um implementador literal a **apagar** a guarda de `updatePersona` para fazer o número fechar — regredindo proteção e quebrando teste existente. Daí o CA 3 reescrito em quatro/cinco com preservação byte-a-byte, a Restrição explícita contra reduzir consumidores, e a lição d.4.
- **Janela residual conhecida (não fechada, por desenho)**: `openChatSession` marca mas não recusa (D5); logo, um `ask` disparado exatamente durante a abertura automática da sessão de chat (arranque, ou reabertura após troca de Persona/permissões) **é recusado** com a mensagem pinada, **sem causa aparente para o usuário** — o renderer não tem como preveni-la, porque `chatTurnInFlight`/`askInFlight` não cobrem a abertura. A janela é curta, a mensagem é clara e o gesto é retomável imediatamente. Registrado, não assumido em silêncio (DoD-d.3).
- **Assimetria pré-existente de `selectPersona`**: com condição parcial (`busySessions`), trocar de Persona durante um `ask` em voo é **permitido**, enquanto editar a Persona ativa é recusado. Não é defeito introduzido aqui, e uniformizar está fora do resíduo D7 (D12) — mas deixar de registrar seria trocar uma formulação inexata por outra, que é exatamente o que esta SPEC existe para não fazer.
- **Interação com cancelamento**: sem caminho de cancelamento (A3 da SPEC-0049, aberto), uma operação que nunca assenta agora trava também as guardas do main process. Isso já era verdade para `selectPermissionRoots` e `updatePersona` — esta SPEC estende a mesma exposição a `ask`/chat. É por isso que a DoD-d.2 manda elevar aquele candidato nas lições.
- **Por que a guarda de `sendChatTurn` usa a condição global** e não "esta sessão está ocupada": ver D2. A app abre uma sessão por vez; a condição global é a mesma que o renderer usa e a mesma que `updatePersona`/`selectPermissionRoots` já aplicam — uma condição, quatro consumidores.
- **Ortogonal e não resolvida**: a pendência de smoke visual/sonoro nunca confirmado (SPEC-0031 a 0049). Esta SPEC não toca o renderer e não a fecha.
- **Custo colateral**: `core-bridge.ts` já é apontado como candidato a quebra em arquivos menores (SPEC-0042/D8). O diff aqui é de duas guardas e três comentários, não muda a estrutura do arquivo e não encarece aquela fatia futura.

---

# Checklist para IA

Antes de implementar:

- ler esta SPEC, a D7 e as Observações da SPEC-0049, o Fora do Escopo da SPEC-0048, e as seções "Rastreio de operação em voo" e "Serialização de gestos" de `apps/desktop/CLAUDE.md` — lembrando que **essa seção da doc viva está incompleta** (omite `updatePersona`) e que o fonte é a autoridade;
- **buscar no fonte todos os usos de `hasInFlightOperation()` e de `busySessions`** antes de tocar qualquer coisa, e confirmar o inventário desta SPEC (3 chamadas em 2 funções, mais a condição parcial de `selectPersona`);
- ler `selectPermissionRoots` inteiro, a guarda de `updatePersona` e os casos de operação em voo de `core-bridge.permissions.test.ts`/`core-bridge.persona-authoring.test.ts` — são os caminhos que não podem regredir;
- registrar commit-base e linha de base da suíte (passo 1 — esperado 978 testes / 74 arquivos);
- confirmar, no fonte, as regiões a editar (as referências de linha desta SPEC podem ter deslocado).

Durante implementação:

- teste primeiro, RED observado e registrado, só então as guardas;
- somente os cinco arquivos previstos; qualquer necessidade fora disso é parada e relato;
- a condição é reusada (`hasInFlightOperation()`), nunca reescrita inline;
- **nenhuma guarda existente é removida, movida ou enfraquecida** — se um critério parecer exigir isso, pare e reporte;
- nenhuma recusa altera `inFlightOperations`/`busySessions`;
- nenhum estado interno do bridge é exportado para viabilizar teste.

Após implementação:

- rodar cada arquivo de teste tocado sozinho e a suíte de `apps/desktop` sob duas sementes embaralhadas;
- confirmar que nenhum `renderer.*.test.ts` nem `core-bridge.persona-authoring.test.ts` precisou de edição;
- rodar os quatro comandos completos na raiz;
- conferir o diff final contra o commit-base (CA 1, 2, 15);
- validar os Critérios de Aceitação um a um.

---

# Resultado Esperado

O invariante "um round-trip contra o Core por vez", que o Atlas declara por escrito desde a SPEC-0037 e que as SPECs 0048/0049 fecharam na interface, passa a valer **no main process**, onde o estado que o decide já morava e já era consultado por duas outras funções. O rastreio de operação em voo do `core-bridge` deixa de ser mantido apenas em favor de terceiros: um `ask` disparado durante outro `ask`, durante um turno de chat ou durante a abertura de uma sessão é recusado antes de subir qualquer Core; um turno de chat disparado durante um `ask` é recusado antes de tocar o Core, e a sessão viva sai intacta. Uma condição, **quatro consumidores** (`updatePersona`, `selectPermissionRoots` ×2, `resolveAskSnapshot`, `sendChatTurn`), nenhum contador novo, nenhum contrato novo, nenhuma classe de erro nova, nenhuma guarda existente tocada. As guardas do renderer permanecem como estão — o usuário continua encontrando botões desabilitados, não mensagens de erro, no caminho normal. A concessão de política de escrita e a edição de Persona ativa, os dois consumidores que já existiam, saem byte-a-byte inalterados, com não-regressão travada por teste. E a garantia publicada em `apps/desktop/CLAUDE.md` passa a descrever o que o código sustenta — inclusive a assimetria de `selectPersona`, que hoje não está registrada em lugar nenhum. O último resíduo da lista aberta pela SPEC-0048 fecha; o cancelamento de operação em voo e a uniformização de `selectPersona`, que esta mudança torna mais relevantes, ficam registrados e explicitamente não implementados.

---

# Decisões de design

**D1 — A guarda lê `hasInFlightOperation()`; nenhuma condição nova, nenhum contador novo, nenhum consumidor removido**

- **Decisão**: as duas guardas novas chamam a função existente, tal como `updatePersona` e `selectPermissionRoots` já fazem, em vez de compor uma condição própria (ex.: só `inFlightOperations > 0` para o chat, só `busySessions.size > 0` para o `ask`). Ao final são **quatro consumidores / cinco chamadas**, e nenhuma das três chamadas pré-existentes é tocada.
- **Porquê**: o teste da Constituição aplicado literalmente — uma condição, um lugar, quatro consumidores. É também o que a SPEC-0048/D1 decidiu no renderer ao eliminar a segunda origem de cálculo do `disabled`: duas origens da mesma regra já divergiram no projeto (SPEC-0043 pagou caro por isso). E `hasInFlightOperation()` é exatamente a semântica desejada: "existe operação capaz de executar Tools em voo?".
- **Alternativa descartada**: condições assimétricas por função (ask bloqueia só por chat, chat só por ask), argumentando precisão. Perdeu por multiplicar regras num arquivo que já tem estado de módulo suficiente para errar, e por produzir uma matriz de casos que ninguém consegue verificar de cabeça — sem nenhum ganho de comportamento, já que a app só tem uma sessão e um painel `ask`.

**D2 — Condição global também em `sendChatTurn`, não "esta sessão está ocupada"**

- **Decisão**: `sendChatTurn` recusa se **qualquer** operação estiver em voo, inclusive um turno de **outra** sessão, e não apenas se a própria sessão já estiver em `busySessions`.
- **Porquê**: é a mesma condição que o renderer aplica (`chatTurnInFlight` é global, não por sessão) e a mesma que `updatePersona`/`selectPermissionRoots` já aplicam — coerência com a garantia publicada. Na prática o desktop mantém uma sessão por vez, então a diferença é hipotética hoje; escolher a condição mais restritiva é o default seguro e mantém D1 verdadeira.
- **Alternativa descartada**: `busySessions.has(session) || inFlightOperations > 0`, permitindo turnos concorrentes em sessões distintas. Perdeu porque autorizar concorrência entre sessões é **decisão de produto** sobre multi-sessão que ninguém tomou — e tomá-la de esguelha, numa guarda, seria decidir por omissão. Se algum dia a app abrir várias sessões, relaxar a condição é uma linha e uma SPEC com o pedido real na mão.

**D3 — `Error` com mensagem pinada, sem classe de erro nova nem código estruturado**

- **Decisão**: as duas recusas lançam `Error` com texto exato em PT-BR, no molde de `selectPersona` ("Não é possível trocar de Persona: há um turno de chat em andamento.") e de `updatePersona` ("Não é possível editar a Persona ativa: há uma operação em andamento."). Nada é exportado; nada cruza o IPC além da mensagem.
- **Porquê**: é o padrão vigente de **todas** as recusas do `core-bridge`, e o renderer já sabe pintar `error.message` nos dois destinos (`⚠️` no `#ask-result` desde a SPEC-0049; erro no transcript no chat). Uma classe exportada seria superfície pública nova sem 2º consumidor — exatamente o critério que `apps/desktop/CLAUDE.md` fixa para promoção de tipos ("promoção só com um 2º consumidor real").
- **Alternativa descartada**: `InFlightOperationError` exportada, ou um campo `refused: true` no snapshot. A classe perdeu por superfície sem consumidor; o campo perdeu por pior: mudaria `AskSnapshot`/`TurnSnapshot`, tipos que cruzam o IPC, forçando edição do renderer e ampliando o diff para além da fronteira que torna esta fatia revisável.

**D4 — Em `sendChatTurn`, o handle é validado antes da ocupação**

- **Decisão**: `mustGetChatSession(session)` primeiro; guarda de operação em voo depois. Um handle desconhecido durante um `ask` em voo produz o erro de sessão desconhecida, não o de operação em voo (pinado por teste, CA 10).
- **Porquê**: erro de **estrutura** antes de erro de **estado** — é o que `selectPersona`/`updatePersona` já fazem (validam o alvo antes de checar ocupação) e é o que produz a mensagem mais útil: um handle inválido é bug de chamador e continua sendo bug quando nada estiver em voo, enquanto "operação em andamento" é transitório e sugere "tente de novo". Inverter faria a mensagem oscilar com o tempo, escondendo o defeito real.
- **Alternativa descartada**: checar a ocupação primeiro, "para recusar o mais barato possível". Perdeu porque o custo de `mustGetChatSession` é uma consulta a `Map` e porque a economia mascararia um erro de programação atrás de uma mensagem transitória.

**D5 — `openChatSession` marca, mas não recusa**

- **Decisão**: `openChatSession` fica **fora** das guardas; segue incrementando `inFlightOperations` (correção A6 da SPEC-0038, intacta) e continua abrindo sessão mesmo com operação em voo. O custo — um `ask` recusado sem causa aparente durante a abertura automática — é registrado explicitamente em doc viva e nas lições (DoD-d.3).
- **Porquê**: ela não é um gesto direto do usuário — o renderer a chama no arranque e automaticamente após cada troca de Persona/permissões que encerra sessões. Transformá-la em ponto de recusa criaria falha de abertura em caminhos automáticos, num momento em que a UI não tem como avisar nem tentar de novo, e a app ficaria sem chat até o usuário adivinhar que precisa recarregar. Além disso, o pedido do usuário e o resíduo D7 nomeiam **`sendChatTurn`/`resolveAskSnapshot`**, não `openChatSession`.
- **Alternativa descartada**: guardá-la também, "por uniformidade das três funções que marcam". Perdeu por confundir *marcar* (informação para quem decide) com *recusar* (decisão), e por trocar uma janela residual pequena e retomável por uma falha de arranque. A assimetria e seu custo visível ficam registrados, não silenciosos.

**D6 — `resolveStatusSnapshot`, `resolveMemorySnapshot` e `forgetFact` continuam fora**

- **Decisão**: nenhuma das três marca nem recusa, exatamente como hoje.
- **Porquê**: a SPEC-0038/D10 já decidiu isso com a razão certa e ela não mudou — não executam Tools, não são julgadas pelo portão de raízes, e recusá-las produziria erro espúrio em leituras inofensivas (listar memória enquanto o chat responde é operação legítima e desejável). Reabrir a decisão sem fato novo seria contrariar a doc oficial.
- **Alternativa descartada**: guardar todas as funções que sobem o Core, "porque subir o Core custa". Perdeu porque o invariante protegido é sobre **execução concorrente de Tools**, não sobre custo de inicialização, e porque quebraria o painel de memória do desktop durante qualquer turno.

**D7 — Recusa por rejeição, e nenhuma mudança no renderer**

- **Decisão**: a recusa se manifesta como promessa rejeitada, e `renderer.js`/`index.html`/`preload.cjs`/`main.ts` ficam fora do diff.
- **Porquê**: os dois destinos já sabem exibir a mensagem — o `#ask-result` desde a SPEC-0049 (`.catch` com `⚠️ <mensagem>`) e o transcript do chat desde a SPEC-0033. As guardas do renderer tornam a recusa inalcançável no caminho normal, então nenhuma UX nova precisa ser desenhada; e manter o diff dentro de `core-bridge.ts` + testes é o que permite ao gate julgar a mudança de garantia isoladamente, sem misturá-la com pixel.
- **Alternativa descartada**: aproveitar para exibir um aviso dedicado ("aguarde a operação em andamento") em cada painel. Perdeu porque é UX nova não pedida, contradiz a recusa silenciosa decidida na SPEC-0049/D4 para o mesmo painel, e arrastaria o renderer para dentro de uma fatia cujo valor é justamente ser estrutural.

**D8 — Estender os três arquivos de teste por assunto, sem criar arquivo novo**

- **Decisão**: os casos entram em `core-bridge.status-ask.test.ts` (guarda do `ask`), `core-bridge.chat-session.test.ts` (guarda do turno e ordem das guardas) e `core-bridge.permissions.test.ts` (não-regressão + asserção nova). `core-bridge.persona-authoring.test.ts` roda sem edição. Nenhum arquivo criado (delta de arquivos = 0, CA 15).
- **Porquê**: a divisão por assunto é a decisão da SPEC-0042; um `core-bridge.serialization.test.ts` novo cortaria transversalmente os assuntos e deixaria cada arquivo descrevendo um comportamento que não é mais o real do seu sujeito. Cada guarda é comportamento **da função** que a hospeda.
- **Alternativa descartada**: um arquivo dedicado à serialização estrutural, espelhando `renderer.gesture-serialization.test.ts`. Perdeu por dispersar o assunto (o arquivo do renderer existe porque lá a serialização é de fato transversal a cinco painéis do mesmo DOM; aqui são funções independentes) e por criar arquivo cujo delta o CA 15 teria de acomodar sem ganho.

**D9 — Perfil `completo`**

- **Decisão**: classificar como `completo`.
- **Porquê**: a mudança é **corretiva/comportamental**, não aditiva (a Emenda v1.2 exige aditiva para `micro`); vive em `apps/desktop`, não em `packages/X/src` + `apps/cli/src`, que é a letra da regra; e — o ponto decisivo — **altera uma garantia publicada em doc viva** e toca a condição que governa `selectPermissionRoots` e `updatePersona`, um caminho de **segurança** (concessão de política de escrita) e um de configuração. Foi exatamente por esse risco que as SPECs 0048 e 0049 mantiveram este item fora do escopo delas. Precedente direto: as duas, de tamanho semelhante, saíram do gate como `completo`. O 1º veto desta SPEC (premissa de fato errada sobre os consumidores) confirma o valor do gate cheio aqui.
- **Alternativa descartada**: `micro`, pelo tamanho do diff (cinco arquivos, um workspace package, duas guardas de uma linha, sem ADR, cabe numa sessão). Perdeu pela regra do default seguro e por proximidade com caminho de segurança: um `micro` indevido cairia no pipeline completo sem prejuízo, mas dispensar o `spec-validator` separado numa fatia que mexe na condição de recusa da concessão de escrita seria trocar salvaguarda por cerimônia economizada.

**D10 — Prioridade `Medium`**

- **Decisão**: `Medium`, não `High` nem `Low`.
- **Porquê**: fecha um resíduo registrado duas vezes e elimina a dependência da camada mais volátil (UI) para um invariante que envolve execução de Tools — o que o tira de `Low`. Mas o defeito **não é alcançável hoje pelo caminho normal do usuário**: as guardas do renderer (SPECs 0048/0049) já cobrem os gestos reais, então nada está quebrado na prática, não há perda de dado, não há vulnerabilidade (cada Tool segue julgada pelo portão de permissões e cada gesto é do próprio usuário) e nenhuma fatia futura depende disto.
- **Alternativa descartada**: `High`, por tocar a vizinhança de um caminho de segurança. Perdeu porque a SPEC **não altera** aquele caminho — ela o preserva com não-regressão travada por teste —, e porque a exposição real hoje é zero pelo caminho da UI. Mesmo raciocínio das SPECs 0048/D8 e 0049/D10.

**D11 — A doc viva passa a enumerar nominalmente os quatro consumidores, e não a contá-los** *(decisão adicionada pelo gate)*

- **Decisão**: a DoD (a) obriga o fecho a **listar nominalmente** os quatro consumidores de `hasInFlightOperation()` (`updatePersona`, `selectPermissionRoots` ×2, `resolveAskSnapshot`, `sendChatTurn`) na seção "Rastreio de operação em voo", e a registrar ali que `selectPersona` usa condição **parcial** (`busySessions`).
- **Porquê**: Artigo 1 — publicar "três consumidores" repetiria exatamente o defeito que esta SPEC existe para corrigir, e o texto atual da seção já viola o artigo ao descrever só quem **marca**, omitindo `updatePersona`. Foi essa omissão que sustentou a premissa errada da v1.0 desta SPEC: a doc corroborou o engano. Enumeração nominal é verificável por busca no fonte; um número não é, e envelhece em silêncio.
- **Alternativa descartada**: só corrigir o número, sem enumerar — perdeu porque um número volta a envelhecer na próxima guarda que alguém acrescentar. Descartada também a alternativa de uniformizar `selectPersona` nesta fatia para que a lista ficasse "limpa": está fora do resíduo D7 e do pedido (vira candidato nomeado, D12).

**D12 — `selectPersona` fica como está (condição parcial), registrada e nomeada como candidato** *(decisão adicionada pelo gate)*

- **Decisão**: não alterar `selectPersona` (`:215`, `busySessions.size > 0` inline). A assimetria — um `ask` em voo **não** bloqueia a troca de Persona, embora bloqueie a edição da Persona ativa — é registrada em doc viva (DoD a), nas lições (DoD-d.5) e como candidato a fatia futura (DoD c).
- **Porquê**: está fora do resíduo D7 e fora do pedido do usuário; uniformizar mudaria o comportamento de um caminho de configuração que ninguém reportou, e trocar de Persona durante um `ask` tem consequência distinta de enviar um turno (o `ask` em voo roda sob o Core que já subiu, e a seleção nova só afeta os próximos). Merece a sua própria aferição, não carona.
- **Alternativa descartada**: somar `inFlightOperations` à guarda de `selectPersona` "já que estamos aqui e é uma linha". Perdeu pelo mesmo argumento que manteve esta SPEC fora das 0048/0049: mudança de comportamento não pedida, em caminho vizinho, diluída num diff cujo valor é ser estrutural e revisável isoladamente. Deixá-la **não registrada**, porém, também foi descartado — seria trocar uma formulação inexata por outra.
