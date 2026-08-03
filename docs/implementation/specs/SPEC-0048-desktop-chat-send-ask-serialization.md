# SPEC-0048 — `#chat-send` na serialização de `ask` e comentário desatualizado de `computeDefaultPiperVoiceURI`

> **Project Atlas — Implementation Specification**

Version: 1.0

---

# Informações Gerais

**ID**

SPEC-0048

---

**Título**

Fechamento dos dois resíduos da SPEC-0047 no renderer do desktop: `#chat-send` passa a considerar `askInFlight` na serialização de gestos (com guarda no manipulador de envio), e o comentário sobre `computeDefaultPiperVoiceURI` volta a descrever o estado real de cobertura

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

A Frente 1 é correção de defeito no chat visual multi-turno entregue por esse item (SPEC-0033), no invariante "um gesto por vez" que o próprio `apps/desktop/CLAUDE.md` declara ("Serialização de gestos"). A Frente 2 é higiene documental **carona** (um comentário no mesmo arquivo, custo zero em comportamento): não consome item de Roadmap próprio — **exceção consciente registrada**, na mesma linha das SPECs 0042/0045/0047, que ancoraram higiene de desenvolvimento sem inflar o Roadmap. O Roadmap não precisa de item novo.

---

# Objetivo

Quando esta SPEC estiver concluída deverá existir:

1. **`#chat-send` desabilitado enquanto houver um `ask` em voo**, pela mesma condição já usada pelo painel de permissões e pelo painel de Persona (`chatTurnInFlight || askInFlight`), e um **envio de chat efetivamente recusado** enquanto um `ask` estiver em voo — não apenas um botão cinza. Hoje um turno de chat pode ser disparado com um `ask` em voo, subindo dois Cores capazes de executar Tools em paralelo a partir de dois gestos simultâneos do mesmo usuário.
2. **O comentário de `computeDefaultPiperVoiceURI` em `renderer.js` factualmente correto**: a função deixou de ser "resíduo sem cobertura automatizada" na SPEC-0047 (é a 10ª entrada do registro de paridade, com tabela de seis casos), e o comentário passa a apontar o teste de referência, como fazem as demais réplicas do arquivo.
3. **A suíte de serialização de gestos refletindo a implementação corrigida**: `apps/desktop/tests/renderer.gesture-serialization.test.ts` deixa de documentar o achado como gap aceito e passa a **travá-lo**, com `#chat-send` na lista serializada também para `ask` em voo, mais um caso novo que prova que `atlas.chat.send` não é chamado durante um `ask`.

Sem contrato novo, sem ADR novo, sem dependência nova, sem tocar `packages/*`, `apps/cli` ou `core-bridge.ts`.

---

# Motivação

Dois resíduos registrados pela SPEC-0047 e nomeados em `docs/05-context/NEXT_CONTEXT.md` ("Candidatos abertos" → "Sobre a SPEC-0047") e em `apps/desktop/CLAUDE.md` ("Candidatos futuros já nomeados"). O usuário escolheu explicitamente os dois como o próximo trabalho.

**(a) Achado da SPEC-0047, deliberadamente não corrigido lá.** A SPEC-0047 fixou como Restrição que um controle não coberto pela serialização real seria **achado a reportar, nunca "consertado" no renderer** — o diff de produção vazio era o que sustentava a inexistência de ADR naquela família de SPECs. O achado foi registrado no cabeçalho de `renderer.gesture-serialization.test.ts` (linhas 19–31) e em `renderer.js:966-975`: `refreshChatControlsForMic()` soma `askInFlight` só à condição de `#persona-select`; `#chat-send` usa apenas `chatTurnInFlight || micBusy()`. Consequência observável: com um `ask` em voo, o usuário envia um turno de chat, e o `core-bridge` **não** o recusa (`inFlightOperations` governa `selectPermissionRoots`, não `sendChatTurn`) — dois gestos concorrentes do mesmo usuário, cada um capaz de executar Tools, exatamente o que o invariante "um turno por vez" existe para impedir. A correção não cabia naquela SPEC por construção; cabe nesta, que existe para isso.

**(b) Resíduo documental deliberado (SPEC-0047/D5).** O comentário sobre `computeDefaultPiperVoiceURI` chama a função de "resíduo sem cobertura automatizada", frase que a própria SPEC-0047 tornou falsa ao amarrar o par `resolveDefaultPiperVoiceURI ↔ computeDefaultPiperVoiceURI` ao gate de paridade. A D5 aceitou a dívida por um único motivo — o critério de diff vazio em `src/` — e mandou corrigir "na próxima fatia que legitimamente toque aquele arquivo". Esta é essa fatia: a Frente 1 já abre `renderer.js`.

Rastreabilidade documental:

- **PRD**, *Critérios de Qualidade* — "consistência de comportamento" e "simplicidade para o usuário"; *Requisitos Funcionais → Execução* — "executar tarefas autorizadas pelo usuário" (um envio disparado enquanto outro round-trip corre não é um gesto que o usuário autorizou como concorrente); *Requisitos Não Funcionais* — "preparado para crescimento incremental".
- **Constituição**, Artigo 1 (a documentação é a fonte da verdade — um comentário factualmente falso no fonte é o caso puro) e o teste padrão: mais simples (uma condição só, num lugar só), mais transparente (o comentário descreve o que é).
- **Module Catalog** — nenhum módulo muda de responsabilidade; `apps/desktop` é aplicação, não módulo do catálogo, e continua consumindo o Core só pelos contratos públicos.
- **SPEC-0047**, Frente 5 ("se algum controle da lista se revelar não coberto… é achado") e D5 (resíduo documental) — as duas frentes desta SPEC são literalmente o que aquela registrou como não entregue.

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Requisitos Funcionais (Execução, Transparência), Critérios de Qualidade
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 1, 4, 7; Emendas v1.1 e v1.2
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — nenhum módulo tocado
- [Development Guide](../../04-engineering/DevelopmentGuide.md)
- [ClaudeCodeAutomation](../../04-engineering/ClaudeCodeAutomation.md) — "Ramo micro" e "Verificação escopada" (SPEC-0042)
- [Roadmap](../../04-engineering/Roadmap.md) — Fase 2, item 2.2
- [ADR-0019 — stack Electron para `apps/desktop`](../../06-adr/ADR-0019-desktop-electron-stack.md) — renderer sem bundler, `<script>` clássico; **intacto**
- [ADR-0021 — Piper como motor de voz local](../../06-adr/ADR-0021-piper-tts-local-voice-engine.md) — **intacto**; só o comentário da réplica muda
- [ADR-0022 — whisper.cpp como motor de STT local](../../06-adr/ADR-0022-whisper-cpp-local-stt-engine.md) — **intacto**; a serialização com o microfone é preservada
- [SPEC-0047](./SPEC-0047-renderer-parity-gate-and-panel-coverage.md) (`Done`) — origem dos dois resíduos (Frente 5 e D5)
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) (`Done`) — harness jsdom sobre o qual a verificação roda
- [SPEC-0046](./SPEC-0046-desktop-voice-input-stt.md) (`Done`) — `micBusy()` entra na mesma condição; a serialização com o microfone não pode regredir
- [SPEC-0038](./SPEC-0038-desktop-permission-roots-gui.md) / [SPEC-0037](./SPEC-0037-desktop-runtime-persona-switch.md) — origem de `askInFlight`/`chatTurnInFlight` e da serialização compartilhada
- `apps/desktop/CLAUDE.md` — seções "Serialização de gestos" e "Renderer: duplicação deliberada"

---

# Escopo

## Frente 1 — `#chat-send` e o envio de chat entram na serialização de `ask`

Em `apps/desktop/src/renderer/renderer.js`, três edições pontuais:

1. Em `refreshChatControlsForMic()` (hoje `renderer.js:966-975`): a condição de `#chat-send` passa a ser `chatTurnInFlight || askInFlight || micBusy()`. A condição de `#persona-select` fica **inalterada** em efeito (já era essa soma). O comentário acima da função é atualizado para descrever as **três** origens de bloqueio, não só a do microfone.
2. No `.finally` do manipulador de `submit` de `#chat-form` (hoje `renderer.js:1283-1290`): a atribuição direta `sendButton.disabled = micBusy()` é removida, para que o estado de `#chat-send` tenha **uma única** origem de cálculo — `refreshPermissionsPanelState()`, chamada logo abaixo na mesma linha de código, já invoca `refreshChatControlsForMic()`. Sem isso, o `finally` reabilitaria o botão ignorando um `ask` em voo, reintroduzindo o defeito por outro caminho.
3. No início do mesmo manipulador de `submit` (hoje `renderer.js:1253-1262`): guarda explícita — com `chatTurnInFlight` ou `askInFlight` verdadeiros, o manipulador retorna sem chamar `window.atlas.chat.send`, junto das guardas já existentes (`chatSession === null`, entrada vazia). É o que torna o invariante verificável (um `submit` despachado programaticamente, ou por submissão implícita do `<form>`, não depende do atributo `disabled` do botão).

Nenhuma outra linha de `renderer.js` muda por conta desta frente.

## Frente 2 — comentário de `computeDefaultPiperVoiceURI`

Em `apps/desktop/src/renderer/renderer.js` (hoje `renderer.js:415-419`): reescrever **apenas** esse bloco de comentário para que:

- preserve a descrição do comportamento (default `pt_BR-faber-medium`, senão o primeiro por ordem de `id`) e a razão da duplicação (só o renderer tem, ao mesmo tempo, o catálogo Piper e a preferência de Persona);
- registre que a réplica é de `resolveDefaultPiperVoiceURI` (`apps/desktop/src/piper-tts.ts`);
- aponte o teste de referência `apps/desktop/tests/renderer.speech-parity.test.ts` (SPEC-0047), no mesmo formato das demais réplicas do arquivo;
- **não** contenha mais a afirmação "resíduo sem cobertura automatizada".

O corpo da função sai **byte-idêntico**.

## Frente 3 — suíte de serialização atualizada

Em `apps/desktop/tests/renderer.gesture-serialization.test.ts` (arquivo existente, estendido):

- Reescrever o bloco de cabeçalho (linhas 19–31) que descreve o ACHADO: passa a registrar que a SPEC-0048 o corrigiu, que `#chat-send` entra na serialização de `ask`, e que `#chat-input` fica **deliberadamente** fora (com o porquê — ver Decisão D3).
- `collectAskSerializedControls` passa a excluir **somente** `chat-input`; `chat-send` volta à lista comum.
- No caso "ask em voo": `#chat-send` é assertado `disabled === true` durante o `ask` e `false` depois; `#chat-input` segue assertado `false` nos dois momentos, com comentário explicando que é decisão, não gap.
- **Caso novo** (guarda de entrada): com um `ask` em voo (promessa controlada pelo teste) e uma sessão de chat aberta, submeter `#chat-form` com texto não vazio **não** chama `atlas.chat.send`; ao assentar o `ask`, o mesmo submit passa a chamar.
- **Caso novo** (não-regressão do `finally`): um turno de chat que assenta **enquanto** um `ask` segue em voo deixa `#chat-send` desabilitado ao fim do turno (prova a edição 2 da Frente 1).

Os demais casos e arquivos de teste seguem intactos.

---

# Fora do Escopo

- **Incluir `#chat-input` na serialização de `ask`** — ver D3. Digitar não dispara gesto algum, e desabilitar o campo no meio da digitação destruiria foco e texto em curso por um round-trip que não é do chat.
- **Serializar o próprio `#ask-form`** contra um turno de chat em voo (a direção inversa do mesmo defeito): não foi o achado registrado, não foi pedido, e sua avaliação exige decidir se o painel `ask` deve mesmo bloquear-se pelo chat — questão de UX própria. Registrar como candidato nas Observações, não implementar aqui.
- **Rastrear o turno de chat no `core-bridge`** (`inFlightOperations` cobrir `sendChatTurn`): mudaria a garantia estrutural documentada em `apps/desktop/CLAUDE.md` ("Rastreio de operação em voo", com a lista de funções deliberadamente não rastreadas) e mexeria no main process — SPEC própria, com efeito sobre recusas de `selectPermissionRoots`.
- **Renomear `refreshChatControlsForMic`** ou reorganizar as funções de serialização — churn sem ganho de comportamento (D4).
- **Corrigir qualquer outro comentário desatualizado** de `renderer.js` ou de outro arquivo: só o bloco nomeado na Frente 2 (D5).
- **Quebrar `renderer.js` em arquivos menores** (SPEC-0042/D8) — mudança estrutural, SPEC própria.
- **Eliminar a duplicação renderer↔módulo** (bundler, `type="module"`) — ADR-0019 ⇒ ADR novo ⇒ escalação humana.
- **Ampliar o gate de paridade** a módulos fora dos três vigiados (eixo residual da SPEC-0047/D2).
- Qualquer alteração em `packages/*`, `apps/cli`, `@atlas/contracts`, `core-bridge.ts`, `main.ts`, `preload.cjs`, `piper-tts.ts`, `stt-engine.ts`, `speech-output.ts`, `index.html` ou CSS.
- Dependência nova, mudança de `vitest.config.ts` da raiz, de `package.json` (raiz ou app), do lockfile ou da CI.
- Confirmação de smoke visual/sonoro em ambiente gráfico — pendência conhecida e ortogonal (Observações).

---

# Pré-requisitos

- [SPEC-0047](./SPEC-0047-renderer-parity-gate-and-panel-coverage.md) — `Done` (verificado no arquivo: `- [x] Done`). Origem dos dois resíduos e do arquivo de teste estendido aqui.
- [SPEC-0045](./SPEC-0045-renderer-automated-coverage.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece o harness jsdom.
- [SPEC-0046](./SPEC-0046-desktop-voice-input-stt.md) — `Done` (verificado no arquivo: `- [x] Done`). Fornece `micBusy()`, cuja contribuição à condição não pode regredir.

Nenhum outro: esta SPEC não depende de comportamento novo de nenhum package.

---

# Critérios de Aceitação

> **Convenção de medição (CA 1, 2 e 12):** todo critério de diff e de contagem é medido contra o **commit-base registrado no passo 1 da Estratégia de Implementação** (`git rev-parse HEAD` antes de qualquer edição) e diz respeito **apenas ao diff atribuível a esta SPEC**. Alteração alheia já presente na árvore deve ser reportada, não incorporada nem revertida.

1. O diff atribuível a esta SPEC contém **exatamente três** arquivos: `apps/desktop/src/renderer/renderer.js`, `apps/desktop/tests/renderer.gesture-serialization.test.ts` e o arquivo desta SPEC — verificável por `git diff --name-only <commit-base>..HEAD`.
2. Nenhum arquivo sob `packages/`, `apps/cli/`, `.github/`, nem `apps/desktop/src/main.ts`/`preload.cjs`/`core-bridge.ts`/`piper-tts.ts`/`stt-engine.ts`/`speech-output.ts`/`renderer/index.html` aparece nesse diff.
3. `refreshChatControlsForMic()` calcula o `disabled` de `#chat-send` incluindo os **três** termos `chatTurnInFlight`, `askInFlight` e `micBusy()`.
4. O `.finally` do manipulador de `submit` de `#chat-form` **não** contém mais atribuição direta a `sendButton.disabled`; o estado do botão ao fim do turno vem de `refreshChatControlsForMic()` (via `refreshPermissionsPanelState()`).
5. O manipulador de `submit` de `#chat-form` retorna sem chamar `window.atlas.chat.send` quando `chatTurnInFlight` ou `askInFlight` é verdadeiro.
6. Teste: com um `ask` em voo, `#chat-send` tem `disabled === true`; ao assentar o `ask`, `disabled === false`.
7. Teste: com um `ask` em voo e sessão de chat aberta, submeter `#chat-form` com texto não vazio produz `calls.chatSend` vazio; após o `ask` assentar, o mesmo submit produz exatamente uma entrada em `calls.chatSend`.
8. Teste: um turno de chat que assenta enquanto um `ask` segue em voo deixa `#chat-send` com `disabled === true`.
9. Não-regressão: `#chat-send` continua desabilitado durante gravação/transcrição de voz (o caso existente de `renderer.voice-input.test.ts` segue verde, sem edição) e durante um turno de chat; `#chat-input` continua desabilitado durante um turno de chat e **habilitado** durante um `ask`, com o comentário no teste registrando que é decisão (D3).
10. O bloco de comentário de `computeDefaultPiperVoiceURI` não contém mais a expressão "resíduo sem cobertura automatizada" e cita `renderer.speech-parity.test.ts`; o corpo da função (da linha `function computeDefaultPiperVoiceURI(voices) {` ao `}` de fecho) é **byte-idêntico** ao do commit-base.
11. O gate de paridade segue verde sem edição: `apps/desktop/tests/renderer.speech-parity.test.ts` não aparece no diff e continua passando (o registro segue com 10 entradas e três módulos vigiados).
12. **Delta de suíte** sobre a base observada no passo 1 (esperada: **969 testes / 74 arquivos**): `pnpm test` na raiz passa, **nenhum arquivo de teste é criado ou removido** (delta de arquivos = 0) e o total de testes sobe em **+2 ou mais**. Se a base observada divergir de 969/74, prevalece a observada e a divergência é reportada.
13. `pnpm --filter @atlas/desktop test` e `pnpm --filter @atlas/desktop typecheck` passam; `renderer.gesture-serialization.test.ts` passa quando executado **sozinho** e a suíte de `apps/desktop` passa sob `--sequence.shuffle` em **duas** sementes distintas.
14. `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm format:check` passam na raiz.
15. Nenhum teste desta SPEC executa processo externo, abre socket, faz chamada de rede ou depende de Piper/whisper/Electron instalados.

---

# Arquivos Esperados

```text
apps/desktop/src/renderer/renderer.js                      (modificado — Frentes 1 e 2)
apps/desktop/tests/renderer.gesture-serialization.test.ts  (modificado — Frente 3)
docs/implementation/specs/SPEC-0048-desktop-chat-send-ask-serialization.md
```

**Nenhum outro arquivo no diff atribuível a esta SPEC.** Arquivo alheio já modificado na árvore no início do trabalho não pertence a esta SPEC: reportar, não incorporar nem reverter.

---

# Componentes Impactados

- `@atlas/desktop` — **somente** `src/renderer/renderer.js` e um arquivo de teste.

Nenhum módulo do Module Catalog é tocado. Nenhum módulo novo. Nenhum contrato público alterado. Nenhuma mudança no main process, no IPC ou na fronteira de segurança do Electron.

---

# Interfaces Necessárias

**Nenhuma.** Não há interface pública nova nem alterada; `@atlas/contracts` não é tocado; nenhum canal IPC novo; nenhuma opção nova no harness de teste (a promessa controlada de `ask` e de `chatSend` já existe em `RendererFixtureOptions` e é usada pelos casos atuais).

---

# Fluxo Esperado

```text
usuário submete #ask-form
        │
        ▼
askInFlight = true ─► refreshPermissionsPanelState()
                              ├─► painel de permissões  (já)
                              ├─► refreshPersonaPanelState()  (já)
                              ├─► refreshMicButtons()  (já)
                              └─► refreshChatControlsForMic()
                                        └─► #chat-send.disabled =
                                            chatTurnInFlight || askInFlight || micBusy()
                                                             ▲ NOVO

usuário submete #chat-form durante o ask
        │
        ▼
guarda: chatTurnInFlight || askInFlight ⇒ return   (NOVO — nada é enviado)

ask assenta ─► askInFlight = false ─► refreshPermissionsPanelState() ─► #chat-send reabilitado
turno de chat assenta ─► finally ─► refreshPermissionsPanelState() ─► condição única
                                     (sem atribuição direta a sendButton.disabled)
```

---

# Estratégia de Implementação

1. **Registrar o commit-base** (`git rev-parse HEAD`) e a **linha de base real** da suíte (`pnpm test` na raiz — esperado 969 testes / 74 arquivos), anotando ambos no relatório final. Conferir se a árvore está limpa; se não, reportar o que já estava modificado.
2. Reler `renderer.js` nas três regiões da Frente 1 (`refreshChatControlsForMic`, manipulador de `submit` de `#chat-form`) e o cabeçalho de `renderer.gesture-serialization.test.ts`.
3. **Primeiro o teste (RED):** ajustar `collectAskSerializedControls` e o caso "ask em voo", e escrever os dois casos novos (CA 7 e 8). Rodar `pnpm --filter @atlas/desktop test` e **ver falhar** pelos motivos esperados — o achado da SPEC-0047 é justamente que a implementação atual não satisfaz esses casos.
4. Aplicar as três edições da Frente 1 em `renderer.js`; rodar de novo até verde.
5. Reescrever o bloco de comentário da Frente 2; confirmar que o corpo da função ficou byte-idêntico (`git diff` do trecho).
6. Rodar `renderer.gesture-serialization.test.ts` sozinho e a suíte de `apps/desktop` sob duas sementes embaralhadas; conferir em especial `renderer.voice-input.test.ts`, `renderer.boot.test.ts` e `renderer.speech-parity.test.ts` (não devem precisar de edição — se algum exigir, é **achado**: pare e reporte).
7. Fechar com `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` na raiz e conferir o diff final contra o commit-base (CA 1, 2, 12).

---

# Estratégia de Testes

- **RED antes de GREEN**: os casos novos precisam falhar contra a implementação atual antes da correção — é a prova de que o defeito descrito existe e de que o teste o cobre (passo 3; registrar no relatório final qual foi a falha observada).
- **Comportamento observável**, nunca introspecção de estado interno do renderer (herdado da SPEC-0047/D4): asserções sobre `disabled` dos elementos e sobre chamadas registradas em `fixture.calls`.
- **Não-regressão por caso existente**, não por asserção nova: os testes de voz (`micBusy()`) e de turno de chat já cobrem os outros dois termos da condição; se algum deles precisar de edição, é achado.
- **Isolamento**: uma janela jsdom por caso, fechada no `afterEach` existente; estabilidade sob `--sequence.shuffle` (CA 13).
- **Determinismo**: sem rede, sem processo externo, sem dependência de binários instalados (CA 15).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- testes estiverem passando (delta do CA 12 sobre a base observada: 0 arquivos, ≥ +2 testes);
- a observação RED do passo 3 estiver registrada no relatório final do `spec-implementer`;
- documentação atualizada;
- arquitetura preservada (ADR-0019/0021/0022 intactos; nenhum diff em `packages/*`, `apps/cli`, main process ou contratos);
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

**Quem faz o quê na documentação**: a sincronização das docs vivas (`CLAUDE.md` da raiz, `apps/desktop/CLAUDE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `PLATFORM_STATE.md`) é do passo de fecho, **não** do `spec-implementer` — que toca apenas `renderer.js`, o teste e o arquivo desta SPEC. No Perfil `micro`, validação e fecho correm no `spec-closer`. O fecho deve obrigatoriamente:

- **(a)** retirar de `apps/desktop/CLAUDE.md` ("Candidatos futuros já nomeados") e de `NEXT_CONTEXT.md` ("Sobre a SPEC-0047") os **dois** itens que esta SPEC consome;
- **(b)** corrigir, em `apps/desktop/CLAUDE.md`, a frase de "Renderer: duplicação deliberada" que declara o comentário desatualizado, e o parágrafo do achado de `#chat-send` (`renderer.js:966-975`) — que passa a descrever a serialização corrigida, incluindo a exclusão deliberada de `#chat-input` (D3);
- **(c)** atualizar, em `apps/desktop/CLAUDE.md` ("Serialização de gestos"), a descrição para incluir `#chat-send` entre os controles bloqueados por `ask` em voo;
- **(d)** registrar nas lições **as duas** direções residuais que esta SPEC deliberadamente deixa abertas (ambas fora do escopo aqui):
  - **(d.1)** **chat → ask**: serializar `#ask-form` contra um turno de chat em voo (direção inversa, ver Observações);
  - **(d.2)** **ask × ask**: o manipulador de `submit` de `#ask-form` (`renderer.js:136-166`) não tem guarda alguma contra `askInFlight`/`chatTurnInFlight`, e `#objective`/`#ask-submit` não entram em nenhuma função de refresh — dois cliques seguidos em "Perguntar" já sobem dois Cores capazes de executar Tools. Mesmo defeito de classe que motivou esta SPEC, hoje sem registro em nenhuma doc viva (achado do gate arquitetural, A3).

---

# Restrições

- **Somente os três arquivos dos "Arquivos Esperados"**. Se fechar qualquer critério exigir tocar `core-bridge.ts`, `main.ts`, `index.html`, outro módulo de `src/` ou qualquer package, **pare e reporte** — é fronteira de outra SPEC.
- **Não alterar o corpo de `computeDefaultPiperVoiceURI`** nem qualquer outra função replicada: a Frente 2 é comentário, e mexer no corpo colocaria o gate de paridade em jogo.
- **Não alterar nem remover teste existente** além do arquivo nomeado na Frente 3, e mesmo nele: nenhum caso existente é removido ou enfraquecido — o caso de "ask em voo" é **reforçado**, não relaxado. Se um teste pré-existente de outro arquivo começar a falhar, é achado: pare e reporte, não "ajuste".
- **Não introduzir bundler, `type="module"` no renderer, nem etapa de build** — ADR-0019 permanece literal.
- **Nenhuma dependência nova**; `pnpm-lock.yaml` fora do diff. Não alterar `vitest.config.ts` da raiz nem criar config por package (SPEC-0042/D12).
- Não criar módulos, Tools, Skills ou Personas; não tocar `@atlas/contracts`; não alterar a CI.
- Não expandir a correção para a direção inversa (`#ask-form` bloqueado por turno de chat), ainda que tentador ao editar as mesmas linhas.

---

# Observações

- **Por que isto não exige ADR**: nenhuma decisão arquitetural nova. A serialização de gestos no renderer é decisão já em vigor desde as SPECs 0037/0038 (`chatTurnInFlight`/`askInFlight`), documentada em `apps/desktop/CLAUDE.md`; esta SPEC apenas aplica a condição existente a um controle que ficou de fora. O comentário é higiene documental. ADR-0019/0021/0022 saem como entraram.
- **Candidato aberto por esta SPEC (direção inversa)**: com a Frente 1, um `ask` bloqueia o chat, mas um turno de chat **não** bloqueia o `ask` — `#ask-form`/`#objective` não entram em nenhuma das funções de refresh. Não é o achado registrado pela SPEC-0047 e não foi pedido, então fica **explicitamente fora** (Fora do Escopo) e vai para as lições como candidato (DoD, item d). Decidir aquilo exige julgar se o painel `ask` deve mesmo se bloquear pelo chat — pergunta de UX própria, não corolário desta.
- **Limite conhecido da garantia**: a serialização continua sendo do **renderer**. O `core-bridge` não recusa um `sendChatTurn` concorrente a um `resolveAskSnapshot` (`inFlightOperations` cobre `selectPermissionRoots`, por desenho documentado). Ou seja, o invariante fica garantido no caminho que o usuário percorre, não estruturalmente no main process. Fica registrado, não assumido em silêncio; fechar esse eixo é a SPEC listada em Fora do Escopo.
- **Por que a guarda no manipulador, além do `disabled`**: um `<form>` submete implicitamente por Enter, e um `submit` pode ser despachado programaticamente — o atributo `disabled` do botão é camada de UX, não garantia. A guarda é o que torna o CA 7 verificável no harness jsdom, que despacha `submit` direto.
- **Ortogonal e não resolvida**: a pendência de smoke visual/sonoro nunca confirmado (SPEC-0031 a 0047). Um DOM de teste prova lógica e fiação; não prova pixel nem som. Esta SPEC não a fecha.
- **Custo colateral**: `renderer.js` ganha três edições num arquivo que 8 arquivos de teste carregam do disco (custo já registrado pela SPEC-0047). O diff é pequeno e não muda a estrutura do arquivo, então não altera o custo da fatia futura de quebrá-lo (SPEC-0042/D8).

---

# Checklist para IA

Antes de implementar:

- ler esta SPEC, a Frente 5 e a D5 da SPEC-0047, e as seções "Serialização de gestos" e "Renderer: duplicação deliberada" de `apps/desktop/CLAUDE.md`;
- registrar commit-base e linha de base da suíte (passo 1 — esperado 969 testes / 74 arquivos);
- confirmar, no fonte, as três regiões de `renderer.js` a editar (as referências de linha desta SPEC podem ter deslocado).

Durante implementação:

- teste primeiro, RED observado e registrado, só então a correção;
- somente os três arquivos previstos; qualquer necessidade fora disso é parada e relato;
- o corpo de `computeDefaultPiperVoiceURI` não muda um byte.

Após implementação:

- rodar o arquivo de teste sozinho e a suíte de `apps/desktop` sob duas sementes embaralhadas;
- rodar os quatro comandos completos na raiz;
- conferir o diff final contra o commit-base (CA 1, 2, 12);
- validar os Critérios de Aceitação um a um.

---

# Resultado Esperado

O usuário do desktop não consegue mais disparar um turno de chat enquanto uma pergunta de tiro único (`ask`) está em voo: o botão de envio fica desabilitado pela mesma condição que já governa os painéis de Persona e de permissões, e o manipulador de envio recusa o gesto mesmo que o `submit` chegue por outro caminho — o invariante "um gesto por vez", que o projeto declara em `apps/desktop/CLAUDE.md`, passa a valer também para o par `ask` × chat. O estado do botão passa a ter uma origem única de cálculo, em vez de duas que podiam discordar. E o comentário que descrevia `computeDefaultPiperVoiceURI` como sem cobertura automatizada volta a dizer a verdade, apontando o teste de paridade que a cobre desde a SPEC-0047. Nada mais muda: nenhuma capacidade nova, nenhum contrato, nenhuma dependência, nenhum arquivo fora de `apps/desktop`, e os ADRs 0019/0021/0022 permanecem literais.

---

# Decisões de design

**D1 — Corrigir a condição num único lugar (`refreshChatControlsForMic`) e remover a atribuição direta no `finally` do turno de chat**

- **Decisão**: somar `askInFlight` à condição de `#chat-send` dentro de `refreshChatControlsForMic()` e apagar `sendButton.disabled = micBusy()` do `.finally` do manipulador de chat, deixando `refreshPermissionsPanelState()` (já chamada duas linhas abaixo) como caminho único.
- **Porquê**: com duas origens de cálculo, corrigir só a função deixaria o defeito vivo pelo `finally` — um turno de chat que assenta durante um `ask` reabilitaria o botão. Uma condição, um lugar: é o teste da Constituição (mais simples, mais sustentável) aplicado literalmente.
- **Alternativa descartada**: acrescentar `|| askInFlight` também na atribuição do `finally`, mantendo as duas origens. Perdeu por duplicar a regra em dois pontos que já divergiram uma vez — exatamente a classe de deriva que a SPEC-0043 pagou caro.

**D2 — Somar uma guarda no manipulador de `submit`, além do atributo `disabled`**

- **Decisão**: `if (chatTurnInFlight || askInFlight) return;` no início do manipulador de `#chat-form`, junto das guardas existentes.
- **Porquê**: `disabled` num botão é camada de UX; o invariante é "não enviar". Submissão implícita de `<form>` e `submit` despachado programaticamente contornam o botão, e é assim que o harness jsdom exercita o formulário — sem a guarda, o CA 7 não seria verificável nem o defeito estaria de fato fechado. O achado registrado em `apps/desktop/CLAUDE.md` fala em "um turno de chat pode ser **enviado** com um `ask` em voo", não em pixel cinza.
- **Alternativa descartada**: confiar só no `disabled`, como faz hoje o caminho de turno de chat. Perdeu porque entrega aparência de garantia sem a garantia, e porque tornaria o critério de aceitação uma asserção sobre estilo em vez de sobre comportamento.

**D3 — `#chat-input` fica deliberadamente fora da serialização de `ask`**

- **Decisão**: durante um `ask` em voo, o campo de texto do chat continua habilitado; só o envio é bloqueado. A exclusão fica registrada como decisão no teste e nas docs vivas, não como gap.
- **Porquê**: digitar não dispara gesto algum contra o Core — o invariante protegido é "um round-trip por vez", não "um teclado por vez". Desabilitar o campo no meio da digitação roubaria foco e travaria o usuário por um round-trip que não é do chat; durante um **turno de chat** o campo é desabilitado por razão diferente (o texto está sendo consumido e é limpo ao assentar). Menos intrusivo e mais simples.
- **Alternativa descartada**: incluir `#chat-input` para que a lista fique idêntica nos dois cenários, "por simetria". Perdeu porque simetria de lista não é valor em si, e o custo é UX real (perda de foco/texto em curso); o pedido do usuário também nomeou apenas `#chat-send`.

**D4 — Não renomear `refreshChatControlsForMic`**

- **Decisão**: manter o nome, atualizando apenas o comentário acima da função para descrever as três origens de bloqueio.
- **Porquê**: o nome já estava impreciso antes desta SPEC (a função sempre tocou `#persona-select` com `askInFlight`); renomear mexeria em 6 pontos de chamada e no histórico de um arquivo que 8 arquivos de teste carregam, sem alterar um bit de comportamento. O comentário carrega o significado — e a Constituição pede documentação correta, não nome perfeito.
- **Alternativa descartada**: renomear para algo como `refreshChatControlsState`. Perdeu por churn desproporcional ao ganho, e por inflar o diff de uma SPEC cuja revisibilidade barata depende de ser pequena. Fica como higiene para a fatia que quebrar `renderer.js` em arquivos menores.

**D5 — Corrigir apenas o comentário nomeado, não varrer o arquivo**

- **Decisão**: a Frente 2 reescreve exatamente um bloco de comentário — o de `computeDefaultPiperVoiceURI` —, sem revisar os demais comentários de `renderer.js`.
- **Porquê**: é o resíduo que a SPEC-0047/D5 registrou e o usuário pediu; uma varredura geral seria escopo aberto, sem critério de conclusão verificável, num arquivo de mais de 1.300 linhas. Escopo fechado é o que mantém o CA 1 (três arquivos, diff pequeno) verificável.
- **Alternativa descartada**: auditar todos os comentários do renderer contra o estado atual do código. Perdeu por ser trabalho sem fim de escopo e sem critério mecânico de aceitação — e por diluir o diff da correção de comportamento, que é o núcleo desta SPEC.

**D6 — Estender `renderer.gesture-serialization.test.ts` em vez de criar arquivo novo**

- **Decisão**: os casos novos entram no arquivo existente, que mantém nome e estrutura; o cabeçalho que documentava o ACHADO é reescrito para registrar a correção.
- **Porquê**: é o lugar único onde a serialização de gestos está descrita e travada (SPEC-0047/Frente 5). Um arquivo novo fragmentaria o registro, e o cabeçalho **precisa** ser corrigido de qualquer forma — deixá-lo descrevendo um gap já fechado repetiria, no teste, exatamente o erro que a Frente 2 corrige no fonte.
- **Alternativa descartada**: criar `renderer.ask-chat-serialization.test.ts`. Perdeu por dispersar o assunto e por deixar o cabeçalho antigo mentindo em outro arquivo.

**D7 — Perfil `micro`**

- **Decisão**: classificar como `micro`.
- **Porquê**: o diff é de três arquivos, contido a **um** workspace package (`apps/desktop`), corretivo e integralmente derivado de decisões já tomadas (serialização das SPECs 0037/0038, gate da SPEC-0047); não toca `@atlas/contracts`, não cria módulo/Tool/Skill/Persona, não move responsabilidade, não pede ADR nem emenda, e cabe folgadamente numa sessão. É o arquétipo do fast-path da Emenda v1.2: fatia pequena cujo custo seria ~85% cerimônia.
- **Alternativa descartada**: `completo`, por continuidade com a SPEC-0047/D7 (que argumentou que `apps/desktop` não é `packages/X/src` e que a SPEC modificava artefatos existentes). Perdeu porque aquele argumento se apoiava sobretudo no tamanho e na natureza daquela SPEC — cinco frentes, gate mecânico generalizado, juízo de fronteira de ADR, produto que **era** verificação. Aqui há duas linhas de condição, uma guarda e um comentário, com a verificação já escrita e o RED observável antes da correção. Duas frições literais ficam declaradas: o texto da Emenda fala em "package" (e `apps/desktop` é um workspace package, não um `packages/X`) e a mudança é corretiva, não aditiva. Se o `architecture-reviewer` julgar que qualquer uma delas pesa, rebaixar para `completo` é o caminho seguro e sem prejuízo — o gate e a independência autor≠verificador seguem intactos nos dois ramos.

**D8 — Prioridade `Medium`**

- **Decisão**: `Medium`, não `High` nem `Low`.
- **Porquê**: é defeito real e observável, num invariante que o projeto declara por escrito, com consequência concreta (dois round-trips concorrentes capazes de executar Tools a partir de dois gestos do mesmo usuário) — o que o tira de `Low`. Mas nada está bloqueado, não há perda de dado, não há risco de segurança (o portão de permissões continua julgando cada Tool) e nenhuma fatia futura depende disto.
- **Alternativa descartada**: `High`, pelo fato de envolver execução concorrente. Perdeu porque a concorrência aqui é entre dois pedidos legítimos do próprio usuário, cada um passando pelo mesmo portão de permissões — é defeito de disciplina de UX, não de segurança.

**D9 — Roadmap: `Fase 2 — 2.2`, com a Frente 2 como carona declarada**

- **Decisão**: ancorar no item 2.2 (Experiência Conversacional), registrando que a Frente 2 (comentário) não consome item de Roadmap.
- **Porquê**: a correção é do chat visual multi-turno entregue por esse item; reivindicar 1.5 (infraestrutura de desenvolvimento) seria falso para uma mudança que altera o que o usuário encontra na tela. A higiene documental viaja junto porque está no mesmo arquivo — separar em outra SPEC pagaria duas cerimônias por um comentário.
- **Alternativa descartada**: duas SPECs, uma por resíduo, ou ancorar tudo em 1.5. Perdeu: duas SPECs multiplicam o custo fixo por um diff de um bloco de comentário; ancorar em 1.5 esconderia que há mudança de comportamento visível.
