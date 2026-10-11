# SPEC-0065 — Modalidade condicional para diálogos nativos com `BrowserWindow` pai

> **Project Atlas — Implementation Specification**

Template: 1.2

---

# Informações Gerais

**ID**

SPEC-0065

---

**Título**

Parentar os quatro diálogos nativos de consentimento do `apps/desktop` somente quando a janela principal estiver focada e o modo hands-free estiver desligado, tornando-os modais no caminho seguro sem tornar inalcançável o freio exigido pelo ADR-0023.

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

Justificativa em **D2**.

---

**Perfil**

- [ ] micro
- [x] completo

Justificativa em **D1**.

---

**Item do Roadmap**

**Exceção consciente registrada.** Esta fatia é *hardening* das superfícies de confirmação entregues pelas SPECs [0032](SPEC-0032-desktop-confirm-steps-adapters.md), [0038](SPEC-0038-desktop-permission-roots-gui.md), [0039](SPEC-0039-desktop-persona-authoring.md) e [0059](SPEC-0059-desktop-network-search-gui.md). Os itens 2.2 e 2.4 do [Roadmap](../../04-engineering/Roadmap.md) já estão fechados; esta SPEC não fecha item novo.

Não consome nem reabre os itens ou ADRs de execução de comandos, acesso à internet ou autogerência de dependências.

---

> **Revisão v1.2 (2º veto do `architecture-reviewer`, incorporado por override explícito do usuário):**
>
> - **A1** — retirada a exceção que tornava o freio hands-free temporariamente inalcançável. A modalidade agora é condicional: enquanto o modo está ativo, todos os diálogos continuam sem pai. A sincronização conservadora renderer → main e sua ordem estão decididas em **D14**.
> - **A3** — removida a contradição “janela utilizável, porém não vista”. Uma janela só é elegível quando também está focada; em segundo plano, oculta, em outro *Space* ou minimizada, o diálogo sai sem pai. A decisão existe em **D15**.
> - **A4** — **D13**, Fora do Escopo, Observações e Resultado Esperado não dependem de o SO empilhar ou serializar diálogos. Apresentações concorrentes permanecem um residual de UX; cada porta conserva seu próprio fail-closed.
> - **Rastreabilidade** — **D14** e **D15** passam a existir de fato no bloco de decisões; Objetivo, Escopo, Critérios de Aceitação, DoD, Observações e Resultado Esperado descrevem a mesma política condicional.
>
> O [ADR-0023](../../06-adr/ADR-0023-hands-free-voice-conversation.md) permanece integralmente preservado. Nenhum ADR é criado ou alterado.

> **Revisão v1.3 (veto da tentativa 3, incorporado):**
>
> - a flag de handshake deixa de bloquear somente um segundo clique e passa a integrar as origens de serialização e as guardas de entrada de `ask`, chat e microfone manual;
> - o ACK `true` não autoriza a transição sozinho: todas as condições de habilitação são reavaliadas depois do `await`;
> - se o ACK chegar depois de qualquer invalidação, o renderer publica `setActive(false)` explicitamente, não entra em `arming` e não abre captura;
> - o harness ganha cenários com ACK deliberadamente pendente, gesto concorrente e perda assíncrona de disponibilidade antes do ACK.

---

# Objetivo

Quando esta SPEC estiver concluída:

1. As quatro portas fail-closed usam um único adaptador de apresentação que decide, a cada chamada, entre `dialog.showMessageBox(parent, options)` e `dialog.showMessageBox(options)`.
2. O diálogo é parentado somente quando **as duas** condições forem verdadeiras: o modo hands-free está desligado e existe uma `BrowserWindow` não destruída, visível, não minimizada e focada.
3. Enquanto o modo hands-free estiver ativo, o diálogo permanece independente. O toggle de desligar continua alcançável em todos os nove estados e fecha o microfone imediatamente, preservando literalmente o [ADR-0023(b)(2)](../../06-adr/ADR-0023-hands-free-voice-conversation.md).
4. Fora do modo hands-free, e com a janela focada, a modalidade impede novos gestos na janela enquanto o consentimento espera. Nesse ramo, remove a origem humana do “diálogo fantasma” da SPEC-0051/D16 e da corrida A7 da SPEC-0038.
5. Com a janela sem foco, invisível, minimizada, destruída ou ausente, o diálogo usa o comportamento atual sem pai. A SPEC não prende uma pergunta a uma janela que não está diante do usuário.
6. Nenhuma guarda existente é removida: mutex de política, rechecagem A7, predicados de operação em voo, envelope do `ConfirmPort` e fail-closed das quatro portas permanecem intactos.
7. O limite fica explícito: enquanto hands-free estiver ativo, o fantasma continua possível por gesto de freio ou watchdog; e diálogos concorrentes não ganham serialização própria nesta fatia.
8. O intervalo assíncrono de `setActive(true)` é uma fronteira fechada: enquanto o ACK está pendente, novo gesto no toggle, `ask`, envio de chat e microfone manual não podem começar; depois do ACK, estado, operações em voo, microfone e disponibilidade são revalidados. ACK `true` para uma ativação já inválida é compensado por `setActive(false)` antes de a tentativa ser liberada; se continuar válida, `enable` leva o estado sincronamente a `arming` ainda sob a flag.

---

# Motivação

Hoje as quatro construções de porta em `apps/desktop/src/main.ts` injetam a forma sem pai de `dialog.showMessageBox`. A janela principal continua operável enquanto uma pergunta de consentimento espera, produzindo dois resíduos já documentados:

- **diálogo fantasma** (SPEC-0051/D16): o usuário abandona a operação, mas o diálogo já aberto permanece visível e sua resposta perde efeito;
- **corrida A7** (SPEC-0038): um gesto novo pode surgir enquanto a concessão espera, exigindo rechecagem antes de aplicar.

Parentar incondicionalmente resolveria esses resíduos no caminho normal, mas violaria o [ADR-0023(b)(2)](../../06-adr/ADR-0023-hands-free-voice-conversation.md): o toggle que desliga o modo é o freio e deve permanecer sempre alcançável. Também prenderia o diálogo a uma janela apenas “visível” para a API, porém fora da vista do usuário. A política condicional é a menor mudança que entrega modalidade quando ela é segura e preserva os dois limites oficiais.

Rastreabilidade ao [PRD](../../02-product/ProductRequirementsDocument.md):

- **Comunicação** — interação por voz e conversas contínuas exigem preservar o freio do modo hands-free;
- **Restrições** — ações destrutivas continuam exigindo autorização adequada;
- **Critérios de Qualidade** — consistência, transparência, segurança e simplicidade para o usuário;
- **Module Catalog → Output Gateway** — apresentar solicitações de confirmação pertence à aplicação cliente.

---

# Referências

- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) (`Done`) — primeira porta de diálogo nativo.
- [SPEC-0038](SPEC-0038-desktop-permission-roots-gui.md) (`Done`) — corrida A7, rechecagem e concessão de escrita.
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md) (`Done`) — exclusão de Persona.
- [SPEC-0046](SPEC-0046-desktop-voice-input-stt.md) (`Done`) — precedente de módulo puro + fiação fina em `main.ts`.
- [SPEC-0051](SPEC-0051-desktop-cancel-in-flight-operation.md) (`Done`) — gesto de escape, envelope do `ConfirmPort` e D16.
- [SPEC-0052](SPEC-0052-desktop-hands-free-voice-conversation.md) (`Done`) — nove estados, freio e watchdogs do renderer.
- [SPEC-0059](SPEC-0059-desktop-network-search-gui.md) (`Done`) — quarta porta e mutex compartilhado.
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) (`Accepted`) — `ConfirmPort` e fail-closed.
- [ADR-0019](../../06-adr/ADR-0019-desktop-electron-stack.md) (`Accepted`) — isolamento do renderer e Electron apenas no main/preload.
- [ADR-0023](../../06-adr/ADR-0023-hands-free-voice-conversation.md) (`Accepted`) — freio sempre alcançável e estado hands-free não persistido.
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Input/Output Gateways na aplicação cliente.
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 7, 8, 11, 13 e 15.
- [PRD](../../02-product/ProductRequirementsDocument.md) — Comunicação, Restrições e Critérios de Qualidade.
- `apps/desktop/CLAUDE.md` — portas fail-closed, gesto de escape e modo hands-free.

---

# Escopo

1. **Criar `apps/desktop/src/dialog-parent.ts`**, puro e sem `electron`, com:
   - `ParentWindowLike`, incluindo `isDestroyed()`, `isVisible()`, `isMinimized()` e `isFocused()`;
   - `selectDialogParent(windows)`, que escolhe a primeira janela elegível ou `undefined` sem lançar;
   - `createParentedShowMessageBox(deps)`, que consulta `isParentingAllowed()` e resolve o pai a cada chamada; qualquer impossibilidade de decidir cai no diálogo sem pai.
2. **Alterar `apps/desktop/src/main.ts`** para:
   - manter o estado efêmero `handsFreeModeActive`, desligado por default;
   - registrar exatamente um handler `'atlas:hands-free:set-active'`, que só aceita boolean e devolve o estado efetivo;
   - limpar esse estado no início de navegação/recarga e no fechamento da janela;
   - construir um único `ShowMessageBox` condicional e injetá-lo nas quatro portas.
3. **Alterar `apps/desktop/src/preload.cjs`** para expor apenas `window.atlas.handsFree.setActive(active)` sobre o canal novo.
4. **Alterar `apps/desktop/src/renderer/renderer.js`** para:
   - serializar o handshake com uma flag local `handsFreeActivationInFlight`, marcada antes do primeiro `await` e observada pelas origens de estado e pelas guardas de entrada de `#hands-free-toggle`, `#chat-form`, `#ask-form` e `#mic-button`;
   - enquanto a flag estiver ativa, desabilitar toggle, envio de chat, `ask` e microfone manual, e fazer seus handlers recusarem submissão/clique programático sem iniciar trabalho;
   - confirmar `setActive(true)` no main **antes** de transicionar `off → arming` ou abrir captura;
   - após ACK `true`, revalidar em uma função única: `handsFreeState === 'off'`, `!chatTurnInFlight`, `!askInFlight`, `!micBusy()` e `computeHandsFreeUnavailableReason() === ''`;
   - se essa revalidação passar, despachar `enable` sem novo `await`, confirmar a transição síncrona `off → arming` e somente então liberar a flag/repintar controles e seguir a captura;
   - se essa revalidação falhar, publicar e aguardar o assentamento de `setActive(false)` (sucesso ou falha capturada), permanecer no estado corrente (`off` ou `unavailable`), não abrir captura e só então liberar a flag/repintar controles;
   - permanecer `off` e não abrir captura quando a sincronização rejeitar ou não devolver `true`;
   - publicar `false` em uma origem única sempre que uma transição sair de um estado ativo para `off`/`unavailable`; falha nessa publicação conserva o main em `true`, portanto conserva o fallback sem pai.
5. **Criar `apps/desktop/tests/dialog-parent.test.ts`** com testes do módulo puro e asserções estáticas posicionais sobre `main.ts`/`preload.cjs`.
6. **Alterar `apps/desktop/tests/renderer.hands-free.test.ts` e `apps/desktop/tests/helpers/renderer-harness.ts`** para cobrir a ordem e os desfechos do canal novo.
7. Atualizar apenas esta SPEC durante implementação/revisão; docs vivas pertencem ao fechamento.

---

# Fora do Escopo

- Alterar as quatro portas, seus textos, tipos, botões ou política fail-closed.
- Alterar `apps/desktop/src/core-bridge.ts`, `packages/*`, `apps/cli/*` ou `@atlas/contracts`.
- Remover ou relaxar mutex de política, rechecagem A7, predicados de operação em voo ou contenção pegajosa do `ConfirmPort`.
- Alterar `apps/desktop/src/hands-free.ts`, sua máquina de 9 estados × 18 eventos, VAD, STT, TTS, watchdogs ou a semântica do freio.
- Desabilitar o toggle ou parentar um diálogo enquanto hands-free estiver ativo.
- Tornar o diálogo fantasma impossível em todos os caminhos: no ramo hands-free sem pai, o freio e os watchdogs ainda podem abandonar trabalho com diálogo aberto (**D10/D14**).
- Restaurar, mostrar ou focar a janela para forçar modalidade.
- Garantir, simular, ordenar, enfileirar ou serializar diálogos concorrentes. Nenhuma afirmação desta SPEC depende de comportamento do SO nesse cenário (**D13**).
- Fechar diálogo nativo programaticamente, substituir `dialog.showMessageBox` por HTML ou criar uma janela auxiliar.
- Criar canal de push, cancelamento cooperativo no Runtime ou mutex global de diálogo.
- Parentar diálogos do próprio sistema operacional, como permissão de microfone.
- Criar ADR, emendar a Constituição, persistir o estado hands-free ou criar dependência.

---

# Pré-requisitos

Status verificado nos respectivos arquivos (`- [x] Done`):

- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md)
- [SPEC-0038](SPEC-0038-desktop-permission-roots-gui.md)
- [SPEC-0039](SPEC-0039-desktop-persona-authoring.md)
- [SPEC-0046](SPEC-0046-desktop-voice-input-stt.md)
- [SPEC-0051](SPEC-0051-desktop-cancel-in-flight-operation.md)
- [SPEC-0052](SPEC-0052-desktop-hands-free-voice-conversation.md)
- [SPEC-0059](SPEC-0059-desktop-network-search-gui.md)

---

# Critérios de Aceitação

## Módulo puro `dialog-parent.ts`

1. O arquivo não importa `electron` nem referencia globais de navegador; a suíte o importa sem Electron.
2. `selectDialogParent([] | null | undefined)` devolve `undefined`.
3. A primeira janela elegível satisfaz simultaneamente `isDestroyed() === false`, `isVisible() === true`, `isMinimized() === false` e `isFocused() === true`; destruída, invisível, minimizada ou sem foco é ignorada.
4. Elemento nulo ou qualquer predicado que lance torna apenas aquela candidata inelegível; a busca continua e nunca lança.
5. `isParentingAllowed() === false` chama `showWithoutParent` e **não chama** `listWindows` nem `showWithParent`.
6. `isParentingAllowed()` ou `listWindows()` lançando também cai em `showWithoutParent`.
7. A permissão e a lista são resolvidas a cada chamada: o mesmo adaptador cobre, em sequência, proibido → permitido sem janela elegível → permitido com janela focada.
8. No ramo parentado, pai e `DialogOptions` chegam inalterados a `showWithParent`; no fallback, as opções chegam inalteradas a `showWithoutParent`.
9. Rejeições de `showWithParent` e `showWithoutParent` são propagadas, sem política fail-closed duplicada no módulo.
10. O retorno é atribuível ao `ShowMessageBox` de `confirm-port.ts`, sem `as`/`any` no teste.

## Fiação main/preload

11. `main.ts` contém exatamente uma construção de `createParentedShowMessageBox`; uma extração posicional desse bloco prova `isParentingAllowed: () => !handsFreeModeActive`, `BrowserWindow.getAllWindows()` e exatamente as duas formas de `dialog.showMessageBox`.
12. As quatro construções de porta recebem o mesmo identificador `ShowMessageBox`; fora do bloco extraído não existe chamada direta a `dialog.showMessageBox(`.
13. `main.ts` registra exatamente um handler `'atlas:hands-free:set-active'`: valor boolean atualiza o estado; valor não boolean preserva o estado anterior; o retorno é o estado efetivo.
14. O estado começa em `false` e volta a `false` em `did-start-navigation`/recarga e `closed`; asserção estática extrai os callbacks antes de verificar.
15. `preload.cjs` expõe exatamente `handsFree.setActive(active) → ipcRenderer.invoke('atlas:hands-free:set-active', active)`; nenhum outro canal é criado, removido ou renomeado.
16. Não há `BrowserWindow.getFocusedWindow`, `.restore()`, `.show()` nem `app.focus(` adicionados; a elegibilidade por foco é exercitada pelo módulo puro via `isFocused()`.

## Sincronização hands-free no renderer

17. `handsFreeActivationInFlight` é marcado antes de invocar `setActive(true)` e, enquanto a promessa fica deliberadamente pendente no harness, toggle, `#chat-send`, `#ask-submit` e `#mic-button` ficam desabilitados.
18. Com o ACK `true` pendente, segundo clique no toggle, submissão real/programática de `#chat-form` e `#ask-form` e clique real/programático em `#mic-button` não iniciam outro handshake, `chat.send`, `ask`, `stt.captureBegin` nem `getUserMedia`; o teste tenta os quatro gestos e prova contadores inalterados.
19. ACK `true` é observado antes da primeira captura, mas não basta sozinho: uma função única revalida `handsFreeState === 'off'`, ausência de `chatTurnInFlight`/`askInFlight`, `!micBusy()` e disponibilidade corrente de STT + VAD + saída de voz. Com resultado válido, ainda sob `handsFreeActivationInFlight` e sem novo `await`, o glue despacha `enable`, prova `off → arming` e só então libera a flag e segue uma única captura.
20. Cenário de invalidação assíncrona obrigatório: manter `setActive(true)` pendente, remover a saída de voz e disparar `voiceschanged` (o estado vira `unavailable`), então resolver o ACK com `true` ⇒ chamadas registradas exatamente `[true, false]`, com a promessa do `false` assentada (cumprida ou rejeitada de modo capturado) antes de liberar a flag; nenhum `captureBegin`/`getUserMedia`, estado final `unavailable` e motivo visível.
21. Cenário concorrente obrigatório: com ACK pendente, tentar ao menos um gesto de cada classe bloqueada (toggle, chat, `ask`, microfone manual), confirmar ausência de efeito e, depois de ACK `true` sem outra invalidação, confirmar uma única transição `off → arming` ainda sob a flag, sua liberação posterior e uma única sequência de captura.
22. Rejeição ou retorno diferente de `true` mantém o estado `off`, não chama compensação `false`, captura ou `getUserMedia`, libera a flag e escreve falha no `#hands-free-status`.
23. Toda transição de estado **já ativo** para `off` ou `unavailable` chama `setActive(false)` por uma única origem no glue; testes cobrem ao menos desligamento manual durante `thinking` e falha automática de armamento. Esse caminho é distinto da compensação pré-`enable` do CA 20.
24. Falha ao publicar `false` — na compensação ou depois de modo ativo — é capturada sem unhandled rejection, não ativa/reabre o modo e não impede o freio local; o main permanece conservador (`true`), portanto diálogos subsequentes continuam sem pai até nova sincronização ou recarga.
25. `helpers/renderer-harness.ts` permite devolver uma promessa controlada para `handsFree.setActive`, registra os booleanos em ordem e expõe os contadores necessários; nenhum teste usa Electron real.
26. `hands-free.ts`, a tabela de 9 estados × 18 eventos e o gate de paridade permanecem com diff vazio.

## Preservação e gates

27. Diff vazio nas quatro portas, `core-bridge.ts`, `media-permission.ts`, `packages/**`, `apps/cli/**`, `@atlas/contracts`, `index.html`, CSS, `renderer.speech-parity.test.ts`, `vitest.config.ts` e CI.
28. Nenhum ID de DOM, texto de consentimento ou dependência é criado; `apps/desktop/package.json` e `pnpm-lock.yaml` ficam inalterados.
29. Os testes existentes das quatro portas continuam verdes sem edição.
30. `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm format:check` ficam verdes na raiz.

---

# Arquivos Esperados

```text
apps/desktop/src/dialog-parent.ts                         (novo)
apps/desktop/src/main.ts                                  (alterado)
apps/desktop/src/preload.cjs                              (alterado)
apps/desktop/src/renderer/renderer.js                     (alterado)
apps/desktop/tests/dialog-parent.test.ts                  (novo)
apps/desktop/tests/renderer.hands-free.test.ts            (alterado)
apps/desktop/tests/helpers/renderer-harness.ts             (alterado)
docs/implementation/specs/SPEC-0065-desktop-modal-native-dialogs.md
```

Qualquer necessidade de tocar código fora desta lista é fronteira de outra SPEC: pare e reporte.

---

# Componentes Impactados

- **Output Gateway** (`apps/desktop`) — escolha modal × independente para solicitações de confirmação.
- **Input Gateway** (`apps/desktop`) — publicação do estado efêmero do toggle hands-free pelo preload/IPC.
- **Runtime / Permission Service / Core / Contracts / CLI** — não impactados.

Nenhuma responsabilidade muda de módulo no Module Catalog.

---

# Interfaces Necessárias

Em `apps/desktop/src/dialog-parent.ts`:

```ts
import type { DialogOptions, ShowMessageBox, ShowMessageBoxResult } from './confirm-port.js';

export interface ParentWindowLike {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  isFocused(): boolean;
}

export interface ParentedDialogDeps<W extends ParentWindowLike> {
  isParentingAllowed: () => boolean;
  listWindows: () => readonly (W | null | undefined)[];
  showWithParent: (parent: W, options: DialogOptions) => Promise<ShowMessageBoxResult>;
  showWithoutParent: (options: DialogOptions) => Promise<ShowMessageBoxResult>;
}

export function selectDialogParent<W extends ParentWindowLike>(
  windows: readonly (W | null | undefined)[] | null | undefined,
): W | undefined;

export function createParentedShowMessageBox<W extends ParentWindowLike>(
  deps: ParentedDialogDeps<W>,
): ShowMessageBox;
```

Superfície local do preload, sem promoção a `@atlas/contracts`:

```ts
window.atlas.handsFree.setActive(active: boolean): Promise<boolean>
```

---

# Fluxo Esperado

```text
toggle LIGAR
  └─ activationInFlight = true; bloquear toggle/chat/ask/mic
       └─ await handsFree.setActive(true)
            ├─ erro/não-true → liberar flag; permanece off; sem captura
            └─ true → revalidar estado + operações + mic + disponibilidade
                 ├─ válido   → enable síncrono; off → arming; liberar flag → captura
                 └─ inválido → await assentamento de setActive(false); liberar flag; sem enable/captura

qualquer porta de consentimento
  └─ createParentedShowMessageBox
       ├─ handsFreeModeActive = true
       │    └─ showMessageBox(options)                [freio alcançável]
       └─ handsFreeModeActive = false
            ├─ janela focada/visível/não minimizada
            │    └─ showMessageBox(parent, options)   [modal]
            └─ sem janela elegível
                 └─ showMessageBox(options)           [fallback atual]

estado hands-free ativo → off/unavailable
  └─ freio local imediato → setActive(false)
       └─ falha mantém o main conservador: sem parentamento
```

---

# Estratégia de Implementação

1. Escrever RED dos CAs 1–10 em `dialog-parent.test.ts`.
2. Implementar o módulo puro com fallback conservador e resolução por chamada.
3. Acrescentar as asserções posicionais de `main.ts`/`preload.cjs` (CAs 11–16).
4. Fiar o estado efêmero e o adaptador único em `main.ts`; expor o canal no preload.
5. Estender o harness com promessa controlada de `setActive` e escrever RED dos CAs 17–25, incluindo ACK pendente + quatro gestos concorrentes e disponibilidade perdida antes do ACK.
6. Implementar no glue a flag, as quatro guardas, a revalidação pós-ACK e a compensação `false`, sem alterar `hands-free.ts`.
7. Rodar testes escopados e, ao final, os quatro gates da raiz.

---

# Estratégia de Testes

- **Unidade pura:** matriz de elegibilidade da janela, exceções, política negada, resolução tardia e propagação de rejeição.
- **Fiação estática posicional:** extrair os blocos relevantes de `main.ts`/`preload.cjs`; não contar ocorrências globais ambíguas e não mockar Electron.
- **Renderer no harness jsdom:** promessa de ACK controlada; bloqueio de toggle/chat/`ask`/mic enquanto pendente; revalidação após ACK; compensação `[true, false]` em perda de disponibilidade; falha fechada na ativação; publicação de `false` em desligamentos manuais e automáticos.
- **Regressão:** suítes das quatro portas e suíte hands-free completa.
- **Smoke humano pendente:** confirmar em janela real (a) hands-free desligado + janela focada ⇒ modal; (b) hands-free ativo ⇒ diálogo independente e toggle clicável; (c) janela minimizada/oculta/segundo plano/outro *Space* ⇒ diálogo independente; (d) apresentações concorrentes, apenas para registrar UX observada, sem transformar comportamento do SO em premissa.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os Critérios de Aceitação forem atendidos;
- `typecheck`/`lint`/`test`/`format:check` estiverem verdes na raiz;
- ADR-0013, ADR-0019 e ADR-0023 permanecerem intactos;
- a revisão estiver concluída;
- lições e docs vivas forem atualizadas pelo `spec-closer`.

No fechamento:

- **(a)** `apps/desktop/CLAUDE.md` deve registrar a política exata: parentamento somente com hands-free desligado e janela focada/elegível; fallback sem pai nos demais casos;
- **(b)** “Gesto de escape” deve distinguir o ramo modal do ramo hands-free, onde o freio continua alcançável e o fantasma permanece possível;
- **(c)** o candidato genérico “diálogos modais com pai” deve ser removido e o residual condicional (hands-free/canal de push/cancelamento cooperativo) preservado sem prometer modalidade universal;
- **(d)** `LESSONS_LEARNED.md` deve registrar: modalidade não substitui guardas; o freio do ADR-0023 vence modalidade; foco é requisito de elegibilidade; nenhuma decisão depende de serialização do SO; um ACK assíncrono não autoriza uma transição futura sem revalidar as pré-condições; ACK `true` invalidado exige compensação `false`;
- **(e)** o smoke humano acima deve entrar na pendência estrutural sem ser marcado como executado se não houver janela real.

---

# Restrições

- O implementador toca somente os arquivos de “Arquivos Esperados”.
- O estado sincronizado é efêmero, inicia em `false`, nunca vai para Memory/config/disco e nunca atravessa `@atlas/contracts`.
- Ativação hands-free falha fechada: sem confirmação `true` do main, o modo não entra em `arming`.
- O handshake `off → arming` é não reentrante; a flag local nasce antes do primeiro `await`, integra tanto o estado visual quanto as guardas de entrada de toggle/chat/`ask`/mic e nunca bloqueia o freio depois de `enable`.
- ACK `true` não é autorização durável: antes de `enable`, revalidar estado `off`, ausência de operação, microfone manual ocioso e as três disponibilidades da SPEC-0052/D9; qualquer falha exige `setActive(false)` explícito e nenhuma captura. Se passar, despachar `enable` sem novo `await` e liberar a flag somente depois de `off → arming`.
- Desativação favorece o freio local: fecha microfone e muda o estado mesmo se a publicação `false` falhar; o main conservador apenas mantém diálogos sem pai.
- O adaptador consulta política e janela em toda chamada; nada é memoizado.
- Não capturar rejeição das apresentações; o fail-closed continua pertencendo às quatro portas.
- Não forçar foco/visibilidade, não recusar consentimento automaticamente e não serializar diálogos.
- Não alterar a máquina de estados hands-free, as quatro portas ou qualquer guarda do bridge.
- Nenhuma dependência, ADR, persistência, Tool, Skill, Persona ou módulo arquitetural novo.

---

# Observações

- **Modalidade é condicional, não universal.** Ela mitiga o fantasma e A7 apenas com hands-free desligado e janela focada. Esse limite é parte do contrato, não falha escondida.
- **Freio preservado (D14).** No modo hands-free, o diálogo independente pode virar fantasma após o usuário desligar o modo ou após um watchdog; esse custo é preferível a bloquear o único freio aceito pelo ADR-0023.
- **Janela não vista (D15).** `isVisible()` sozinho não basta. A exigência adicional de `isFocused()` faz segundo plano/ocultação/outro *Space* cair no comportamento sem pai. Se o usuário mudar de foco depois que o modal abriu, o diálogo acompanha a janela; a SPEC não promete trazê-la à frente.
- **Concorrência (D13).** Dois diálogos ainda podem ser pedidos. A SPEC não afirma como o SO os apresenta nem usa isso como garantia. Cada promessa e cada porta continuam independentes e fail-closed; a UX real entra apenas no smoke.
- **Sincronização conservadora.** `true` precisa de confirmação antes de ativar; `false` pode falhar sem bloquear o freio, deixando como degradação apenas diálogos sem pai até recarga/nova sincronização.
- **Janela assíncrona fechada.** Enquanto o ACK de `true` espera, novo toggle e os três gestos que poderiam invalidar a ativação (`ask`, chat, mic manual) são bloqueados nas origens de estado e nos handlers. Disponibilidade não é bloqueável; por isso é reavaliada após o ACK. Um `true` obsoleto é sempre seguido de compensação `false`, sem passar por `arming`; um `true` ainda válido leva a `arming` sincronamente antes de liberar a flag.
- **Custo colateral nomeado.** Diferente da versão anterior, esta revisão toca preload, glue e harness para preservar uma cláusula arquitetural aceita. Não há mudança no Core nem na máquina de estados.

---

# Decisões de design

Formato de veto: **Decisão** · **Porquê** · **Alternativa descartada**.

## D1 — Perfil `completo`

- **Decisão:** usar o pipeline completo.
- **Porquê:** a fatia vive em `apps/desktop`, altera apresentação e um canal IPC local; não satisfaz a fronteira de package exigida pelo perfil micro.
- **Alternativa descartada:** `micro` por não tocar contracts; perde porque a primeira condição constitucional já falha.

## D2 — Prioridade `Medium`

- **Decisão:** prioridade média.
- **Porquê:** as portas já são fail-closed e as guardas estruturais cobrem segurança; o defeito restante é de consistência/transparência e UX.
- **Alternativa descartada:** `High`; perde porque não existe autorização indevida nem regressão de capacidade atual.

## D3 — Política em módulo puro local

- **Decisão:** concentrar seleção/fallback em `dialog-parent.ts`; `main.ts` apenas injeta Electron e estado.
- **Porquê:** a regra tem matriz própria e `main.ts` não é carregável pela suíte.
- **Alternativa descartada:** duplicar a decisão nas quatro portas ou deixá-la inline; multiplica deriva ou reduz a verificação a texto estático.

## D4 — Resolução por chamada

- **Decisão:** consultar `isParentingAllowed()` e janelas em cada apresentação.
- **Porquê:** hands-free, foco e ciclo de vida da janela mudam em runtime; resolver no topo de `main.ts` congelaria um estado inválido.
- **Alternativa descartada:** memoizar pai/política; pode reter janela destruída ou modalidade proibida.

## D5 — Primeira janela elegível, com foco

- **Decisão:** escolher a primeira de `BrowserWindow.getAllWindows()` que passe nos quatro predicados, incluindo `isFocused()`.
- **Porquê:** o app é de janela única e a interface estrutural permite teste puro do caso “visível, mas não vista”.
- **Alternativa descartada:** `getFocusedWindow()` direto; acopla a seleção ao Electron e elimina a matriz defensiva testável.

## D6 — Fallback sem pai

- **Decisão:** política negada, erro ou ausência de janela elegível apresenta sem pai.
- **Porquê:** mantém o consentimento alcançável sem roubar foco nem inventar recusa silenciosa.
- **Alternativa descartada:** recusar automaticamente ou restaurar/focar a janela; ambos mudam comportamento de produto não pedido.

## D7 — Um adaptador para quatro portas

- **Decisão:** compartilhar um único `ShowMessageBox` condicional.
- **Porquê:** apresentação é idêntica; textos e decisões fail-closed permanecem específicos de cada porta.
- **Alternativa descartada:** quatro adaptadores; permite divergência da política hands-free/foco.

## D8 — Rejeição propagada

- **Decisão:** o módulo de parentamento não converte rejeições em resposta.
- **Porquê:** fail-closed já possui uma única autoridade nas portas.
- **Alternativa descartada:** fabricar `cancelId`; duplicaria política e fingiria uma resposta humana.

## D9 — Guardas de software preservadas

- **Decisão:** mutex, A7, predicados e envelope do `ConfirmPort` não mudam.
- **Porquê:** modalidade é propriedade de UI/OS e não protege invocações programáticas do IPC.
- **Alternativa descartada:** simplificar o bridge por haver modal; troca garantia verificável por efeito de plataforma.

## D10 — Mitigação declarada, não fechamento

- **Decisão:** declarar o fantasma mitigado só no ramo modal.
- **Porquê:** o ramo hands-free deliberadamente sem pai e seus watchdogs continuam capazes de abandonar trabalho com diálogo aberto.
- **Alternativa descartada:** declarar fechamento total; contradiz o fluxo e o ADR-0023.

## D11 — Verificação em três camadas

- **Decisão:** unidade pura + asserção estática posicional + comportamento no harness jsdom.
- **Porquê:** cada camada prova respectivamente política, fiação Electron e ordem da sincronização no renderer.
- **Alternativa descartada:** mockar Electron e carregar `main.ts`; cria um runtime fictício sem provar janela real.

## D12 — Gate de paridade inalterado

- **Decisão:** não registrar `dialog-parent.ts` nem o glue IPC no gate renderer↔módulo.
- **Porquê:** não há réplica JS de uma função TS; o glue é exclusivo do renderer e o módulo exclusivo do main.
- **Alternativa descartada:** entrada `NOT_MIRRORED`; inflaria um gate que só vigia risco real de réplica.

## D13 — Sem serialização própria e sem premissa sobre o SO

- **Decisão:** não criar mutex/fila global de diálogos e não afirmar que o SO os empilha ou serializa.
- **Porquê:** cada porta mantém promessa e fail-closed próprios; concorrência restante é residual de UX, não autorização cruzada demonstrada.
- **Alternativa descartada:** mutex global; adiciona estado e risco de travamento sem requisito de segurança que o justifique nesta fatia.

## D14 — Hands-free sempre vence modalidade

- **Decisão:** tratar `off → arming` como transação assíncrona de duas fases: (1) antes do primeiro `await`, marcar `handsFreeActivationInFlight` e bloquear toggle/chat/`ask`/mic nas origens de estado e nos handlers; (2) depois de ACK `true`, revalidar estado, operações, microfone e disponibilidades. Se estiver válida, despachar `enable` sem novo `await`, confirmar `off → arming` e só então liberar a flag. Se estiver inválida, aguardar o assentamento de `setActive(false)`, não entrar em `arming` e só depois liberar a tentativa. Uma vez ativo, parentamento segue proibido e a saída continua publicando `false` sem fazer o freio depender do IPC.
- **Porquê:** o ADR-0023(b)(2) exige o freio sempre alcançável, enquanto a SPEC-0052/D9 exige que o modo só nasça com STT, VAD, voz e sem operação conflitante. O `await` separa checagem e uso; bloquear gestos fecha as invalidações humanas e revalidar fecha as assíncronas. Compensar um ACK obsoleto impede que o main permaneça em `true` para um modo que nunca foi ativado.
- **Alternativa descartada:** bloquear apenas um segundo clique; perde porque chat, `ask`, mic e disponibilidade ainda mudariam durante o ACK. Também descartado confiar nas checagens anteriores ao `await` ou seguir para `arming` após qualquer ACK `true`; ambas mantêm a corrida. Modalizar e obrigar resposta antes do freio continua rejeitado por contradizer o ADR.

## D15 — Foco é requisito de alcançabilidade

- **Decisão:** janela visível, porém sem foco, não é pai elegível.
- **Porquê:** `isVisible()`/`isMinimized()` não distinguem com segurança segundo plano, ocultação e outro *Space*; o fallback independente evita prender a pergunta a uma janela não presente.
- **Alternativa descartada:** parentar toda janela tecnicamente visível e relegar o caso ao smoke; cria o caminho degradado apontado pelo veto em vez de preveni-lo.

---

# Checklist para IA

Antes de implementar:

- ler esta SPEC, ADR-0023(b), SPEC-0051/D16, SPEC-0052 e as seções relevantes de `apps/desktop/CLAUDE.md`;
- confirmar as quatro construções de porta e o ciclo de vida atual de `createWindow()`;
- confirmar `BrowserWindow.isFocused()` nos tipos da versão de Electron instalada.

Durante:

- TDD para módulo puro e sincronização do renderer;
- nunca alterar `hands-free.ts` ou as portas;
- manter o fallback conservador em qualquer erro de política/seleção.

Após:

- validar os 30 Critérios de Aceitação;
- revisar o diff contra a lista fechada de arquivos;
- rodar os quatro gates da raiz.

---

# Resultado Esperado

Com hands-free desligado e a janela principal focada, os quatro diálogos de consentimento aparecem parentados e bloqueiam novos gestos naquela janela até a resposta. As guardas de software continuam intactas por trás dessa camada.

Com hands-free ativo, o main usa a forma sem pai: o diálogo não bloqueia o toggle, e o usuário pode desligar o modo imediatamente em qualquer estado, como exige o ADR-0023. Se a sincronização de desativação falhar, o único efeito é conservar esse fallback sem pai; o freio local nunca espera o IPC.

Durante a ativação, o ACK de `setActive(true)` não abre uma lacuna: toggle, chat, `ask` e microfone manual ficam serializados; disponibilidade é reavaliada quando o ACK chega. Se qualquer condição deixou de valer, o renderer publica `false`, não entra em `arming` e não abre o microfone. Se todas continuam válidas, `enable` realiza `off → arming` sincronamente ainda sob a flag; somente depois os gestos voltam a ser liberados.

Com a janela sem foco, minimizada, invisível, destruída ou ausente, o diálogo também aparece sem pai. Assim, a SPEC não cria o caminho “janela utilizável, porém não vista” e não depende de restaurar ou roubar foco.

O fantasma fica mitigado no ramo modal, não eliminado no ramo hands-free. Diálogos concorrentes continuam sem fila própria e sem qualquer garantia presumida do SO. Essa fronteira, os testes e o smoke pendente ficam documentados sem alterar ADR, Core, Runtime ou contratos públicos.
