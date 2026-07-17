# SPEC-0014 — Tools e `confirm` no `atlas chat`

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0014

---

**Título**

Tools e fluxo `confirm` no `atlas chat`: cada turno pode planejar e executar Tools, mantendo histórico multi-turno

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

High _(confirmada pelo humano em 2026-07-17, junto com a aprovação `Draft → Ready`)_

---

# Objetivo

Ao concluir esta SPEC, o `atlas chat` deixa de ser conversa pura: **cada turno da conversa pode planejar e executar Tools** — incluindo Tools destrutivas com o fluxo interativo `confirm` — na voz da Persona ativa, mantendo o histórico multi-turno. É a continuação natural da SPEC-0013, que trouxe o `confirm` real mas o restringiu deliberadamente a `atlas ask` (o único comando que, até aqui, passava pelo Planner/Runtime).

Concretamente, quando esta SPEC estiver concluída:

- `CognitiveCore.respond(conversation, input)` passa a orquestrar Planejamento + Execução no mesmo padrão que `ask` já usa (ADR-0012): a 1ª chamada `generate` inclui a instrução do Planner; sem plano → resposta direta em 1 chamada (comportamento atual de `respond` preservado); com plano → `runtime.execute(plan)` seguido de uma 2ª chamada de composição que usa os resultados. `respond` segue **função pura sobre dados** (ADR-0008) e o Core segue **sem estado**.
- O contrato `ConversationTurn` ganha `steps?: readonly ExecutedStep[]`, espelhando `AskResult`. `Conversation` e `Message` não mudam.
- Quando Tools rodam num turno, além da mensagem do assistente é acrescentada à `Conversation` uma mensagem `system` **compacta** pós-turno, resumindo o que foi executado (ex.: `[Tools executadas: read_file(...) → ok; delete_file(...) → negada: cancelada pelo usuário]`). O modelo passa a lembrar, nos turnos seguintes, do que fez; **o usuário não vê essa mensagem**.
- O comando `atlas chat` (`apps/cli`) exibe o traço compacto de `steps` a cada turno, **reusando a renderização já usada pelo `ask`** (incluindo passos negados/bloqueados com o motivo).
- O comando `chat` compõe um `ConfirmPort` apoiado no **próprio `LineReader` da sessão** e o injeta via `CreateAtlasDeps.confirm` (existente desde a SPEC-0013), de modo que a confirmação de uma ação destrutiva apareça **inline na conversa**, sem um segundo `readline` disputando o `stdin`.
- **ADR-0008** ganha uma nota de atualização (cai a premissa "`respond` sem planejamento") e **ADR-0012** ganha uma nota de atualização (a orquestração Planejamento+Execução passa a valer também para `respond`, não só `ask`). Sem ADR novo — mesmo padrão das SPECs 0012/0013.

---

# Motivação

A SPEC-0013 fechou o vocabulário de 4 veredictos do Permission Service tornando o `confirm` real, mas registrou explicitamente uma fronteira: Tools e `confirm` ficavam **restritos a `atlas ask`**, porque `atlas chat` usa `respond()` (ADR-0008), que não passava pelo Planner nem pelo Runtime — não havia onde a pausa aconteceria. Trazer execução de Tools para a conversa multi-turno foi apontado, ali mesmo, como "mudança arquitetural maior, fica para SPEC futura". Esta é essa SPEC.

O PRD sustenta a necessidade: o sistema deve **manter conversas contínuas** (Requisitos Funcionais → Comunicação) e, ao mesmo tempo, **executar tarefas autorizadas pelo usuário** e **automatizar atividades repetitivas** (Requisitos Funcionais → Execução). Hoje esses dois requisitos vivem separados em comandos distintos: `chat` conversa mas não age; `ask` age mas é tiro único por objetivo. Unir os dois no fluxo conversacional é o passo que o PRD já descreve como um único produto ("parceiro de trabalho e produtividade" — Objetivos do Produto), não uma capacidade nova inventada.

A arquitetura já tem todas as peças: `ask` demonstra a orquestração Planner→Runtime→composição (ADR-0012); o Runtime já pausa em `confirm` via `ConfirmPort` (SPEC-0013); `CreateAtlasDeps.confirm` já existe como ponto de injeção; o `LineReader` injetável do `chat` já resolve o loop de terminal testável (SPEC-0006). Esta SPEC compõe o que existe — mantendo `respond` puro e o Core sem estado — em vez de introduzir mecanismo novo.

Documentos originadores: **PRD** (Comunicação: "conversas contínuas"; Execução: "executar tarefas autorizadas", "automatizar atividades repetitivas") + **ADR-0012** (padrão de orquestração Planejamento+Execução) + **ADR-0008** (conversa como dado; `respond` puro) + fronteira explícita da **SPEC-0013** ("Tools/`confirm` em `atlas chat` fica para SPEC futura").

---

# Referências

- [PRD](../../02-product/ProductRequirementsDocument.md) — Comunicação ("manter conversas contínuas"); Execução ("executar tarefas autorizadas", "automatizar atividades repetitivas", "informar o andamento"); Objetivos do Produto
- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Cognitive Core (orquestração); Runtime; Permission Service; Tools como adaptadores; a Persona única percebida pelo usuário
- [ADR-0012](../../06-adr/ADR-0012-planner-runtime-execution.md) — `ask` orquestra Planejamento + Execução; Runtime executa o plano, Cognitive só aguarda (padrão que esta SPEC estende a `respond`)
- [ADR-0008](../../06-adr/ADR-0008-conversation-as-data.md) — conversa como dado; `respond` função pura, Core sem estado (premissa "sem planejamento" atualizada por esta SPEC)
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) — `confirm` real; `ConfirmPort` no Runtime; Permission Service puro/síncrono
- [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md) — Planejamento e Execução com avaliação de risco; transparência
- [SPEC-0013](SPEC-0013-confirm-flow-destructive-tools.md) — `confirm` real + Tools destrutivas, restrito a `atlas ask`; a fronteira que esta SPEC continua
- [SPEC-0010](SPEC-0010-planner-runtime-tools.md) — espinha de execução Planner-driven; `AskResult { text; steps? }`; traço de passos na CLI
- [SPEC-0006](SPEC-0006-atlas-chat.md) — `atlas chat`; `respond` como conversa-como-dado; `LineReader` injetável

---

# Escopo

- **`@atlas/contracts`**: `ConversationTurn` ganha `steps?: readonly ExecutedStep[]` (espelha `AskResult`). `Conversation`/`Message` inalterados. `ExecutedStep` já existe.
- **`@atlas/cognitive`**: `respond(conversation, input)` passa a incluir a instrução do Planner na 1ª chamada `generate` (mesmo `createPlanner()` já consolidado no package e já usado por `ask`); parse do plano; sem plano → resposta direta em 1 chamada (comportamento atual preservado); com plano → `runtime.execute(plan)` + 2ª chamada de composição com os resultados. Ao rodar Tools, além da mensagem do assistente, acrescentar à `Conversation` retornada uma mensagem `system` compacta com o resumo dos passos; `ConversationTurn.steps` preenchido. `respond` segue puro; nenhum estado no Core.
- **`apps/cli` (comando `chat`)**: exibir o traço compacto de `steps` a cada turno reusando a renderização de passos usada pelo `ask` (incluindo negados/bloqueados com motivo). Compor um `ConfirmPort` apoiado no `LineReader` da sessão e injetá-lo via `CreateAtlasDeps.confirm`, para que a confirmação apareça inline na conversa e não haja dois leitores de `stdin`.
- **Testes**: unidade em `@atlas/cognitive` (respond com/sem plano; resumo `system` no histórico; `steps` em `ConversationTurn`) e em `apps/cli` (confirm via `LineReader` fake no `chat`; traço de passos exibido). Runtime/permissions/tools **inalterados** e não retestados aqui.
- **Documentação**: nota de atualização no ADR-0008 e no ADR-0012 (sem ADR novo); `CLAUDE.md` raiz + dos packages tocados (`cognitive`, `cli`, `contracts`); `NEXT_CONTEXT.md`; `CURRENT_SPRINT.md`; lições em `LESSONS_LEARNED.md`.

---

# Fora do Escopo

- **Endurecimento de symlink / `realpath`** na contenção do Permission Service — limitação conhecida do ADR-0013; fatia independente, não entra aqui.
- **`rmdir` / remoção recursiva de diretório** — só as Tools já existentes; nenhuma Tool nova nesta fatia.
- **Múltiplas raízes** de leitura/escrita numa única invocação — segue single-value.
- **Flag de auto-aprovação não interativa** (ex.: `--confirm-destructive` para pular o prompt) — o fluxo continua interativo; automação de aprovação fica para trabalho futuro.
- **Memória viva no chat** (`/lembrar`, `/esquecer` durante uma sessão aberta) — fora, mesmo sendo adjacente ao histórico.
- **Replanejamento / Observação** (o ciclo voltar ao planejamento após executar) e **Aprendizado automático** (o Cognitive gravar fatos sozinho no Memory) — não entram; `respond` continua Planejamento→Execução→resposta em uma passada por turno.
- **Dependência de dados entre passos** (um passo consumir a saída de outro) — passos seguem independentes, como em `ask`.
- **Role `tool` no contrato de mensagens** — o resumo dos passos entra como mensagem `system` compacta; **não** se introduz um novo papel de mensagem nem se altera `Message` além do que já existe.
- **Novo ADR** — apenas notas de atualização no ADR-0008 e no ADR-0012.
- **Alterar Runtime, Permission Service ou Tools** — nenhuma mudança de código nesses packages; esta SPEC compõe o que a SPEC-0013 já entregou.

---

# Pré-requisitos

- [SPEC-0006](SPEC-0006-atlas-chat.md) (`atlas chat` + `respond` conversa-como-dado + `LineReader` injetável) — `Done`
- [SPEC-0010](SPEC-0010-planner-runtime-tools.md) (Planner/Runtime/Tools; `ask` orquestra; `AskResult`/`steps`; traço na CLI) — `Done`
- [SPEC-0013](SPEC-0013-confirm-flow-destructive-tools.md) (`confirm` real; `ConfirmPort`; `CreateAtlasDeps.confirm`) — `Done`

---

# Critérios de Aceitação

- `ConversationTurn` inclui `steps?: readonly ExecutedStep[]`; `Conversation`/`Message` inalterados.
- `respond(conversation, input)` **sem plano** produz exatamente 1 chamada `generate` e retorna `ConversationTurn` com `reply` e sem `steps` (ou `steps` ausente/vazio), preservando o comportamento atual de `chat`.
- `respond(conversation, input)` **com plano** chama `runtime.execute(plan)` e faz uma 2ª chamada `generate` de composição usando os resultados; retorna `ConversationTurn` com `reply` e `steps` refletindo os passos executados (incluindo negados/bloqueados).
- Quando Tools rodam, a `Conversation` retornada contém, além da mensagem do assistente, uma mensagem `system` compacta resumindo os passos executados; quando nenhuma Tool roda, **nenhuma** mensagem `system` de resumo é acrescentada.
- `respond` permanece função pura sobre `(conversation, input)` — nenhum estado retido no Core entre chamadas.
- No `atlas chat`, o traço de `steps` de cada turno é exibido reusando a renderização de passos do `ask` (mesmo formato, incluindo passos negados/bloqueados com motivo).
- Um turno de `chat` cujo plano inclua `delete_file` numa `writeRoot` permitida pausa e pergunta **inline na conversa**, usando o `ConfirmPort` apoiado no `LineReader` da sessão (injetado via `CreateAtlasDeps.confirm`); aprovado executa a Tool, recusado registra o passo como negado — em ambos os casos a conversa continua no próximo turno.
- Nenhum segundo `readline`/leitor de `stdin` é criado pelo `confirm` no `chat`: a confirmação reusa o `LineReader` da sessão.
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes; nenhum teste toca terminal/stdin/disco/rede real (fakes de `LineReader`/gateway/`fs`/`confirm`).
- ADR-0008 e ADR-0012 com nota de atualização; `CLAUDE.md` (raiz + `cognitive`/`cli`/`contracts`), `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` atualizados; lições em `LESSONS_LEARNED.md`.

---

# Arquivos Esperados

```text
packages/contracts/src/
  cognitive.ts            (editado: ConversationTurn + steps?)

packages/cognitive/src/
  cognitive-core.ts       (editado: respond orquestra Planejamento + Execução; resumo system)
  cognitive-core.test.ts  (editado: respond com/sem plano; resumo system; steps no turn)

apps/cli/src/
  commands/chat.ts        (editado: traço de steps; ConfirmPort sobre o LineReader; injeta confirm)
  commands/chat.test.ts   (editado: confirm via LineReader fake; traço exibido)
  (possível) gateway/     (se o ConfirmPort sobre LineReader for fatorado em helper próprio)

docs/06-adr/ADR-0008-conversation-as-data.md          (editado: nota de atualização)
docs/06-adr/ADR-0012-planner-runtime-execution.md     (editado: nota de atualização)
CLAUDE.md (raiz) + CLAUDE.md de cognitive/cli/contracts (editados)
docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md (editados)
docs/implementation/LESSONS_LEARNED.md (editado)
```

Lista é expectativa; pode sofrer pequenos ajustes na implementação (ex.: onde exatamente o `ConfirmPort` sobre `LineReader` é montado dentro de `apps/cli`).

---

# Componentes Impactados

- Contracts (`@atlas/contracts`) — `ConversationTurn.steps?`
- Cognitive Core (`@atlas/cognitive`) — `respond` passa a orquestrar Planejamento + Execução; resumo `system`
- CLI (`@atlas/cli`) — comando `chat`: traço de `steps`, `ConfirmPort` sobre `LineReader`, injeção de `confirm`
- Runtime (`@atlas/runtime`) — **não impactado** (consumidor inalterado; já pausa em `confirm`)
- Permission Service (`@atlas/permissions`) — **não impactado**
- Tools (`@atlas/tools`) — **não impactado**
- Persona/Memory/Context — **não impactados** (a voz da Persona e a composição de prompt já são injetadas na geração; `chat` já usa `atlas.context` como detentor da conversa)

---

# Interfaces Necessárias

- `ConversationTurn` (em `@atlas/contracts`): ganha `steps?: readonly ExecutedStep[]`.
- Nenhuma interface pública nova em `@atlas/contracts` além disso (`ExecutedStep`, `Plan`, `Runtime`, `ConfirmPort` já existem; `ConfirmPort` segue interno a `@atlas/runtime`, e `CreateAtlasDeps.confirm` já existe desde a SPEC-0013).
- Dentro de `apps/cli`, a composição de um `ConfirmPort` apoiado no `LineReader` da sessão pode exigir um pequeno adaptador local — **não** é interface pública nova, não sobe a `@atlas/contracts`.

---

# Fluxo Esperado

```text
atlas chat (loop por turno, conversa segurada por atlas.context):
  usuário digita input
        ↓
  cognitive.respond(conversation, input):
    1ª generate (prompt composto Persona+Memória+Tarefa + instrução do Planner)
        ↓
    planner.parse(saída) → Plan | null
        ├── null  → reply direto; ConversationTurn { reply, conversation } (sem steps)
        └── Plan  → runtime.execute(plan)
                       (passo com confirm → confirm.request via ConfirmPort/LineReader, inline)
                    2ª generate (composição com resultados)
                    Conversation += mensagem assistant + mensagem system compacta (resumo)
                    ConversationTurn { reply, conversation, steps }
        ↓
  atlas chat: imprime reply na voz da Persona + traço compacto de steps
              (reusa a renderização do ask; negados/bloqueados com motivo)
              a mensagem system NÃO é exibida ao usuário
        ↓
  próximo turno: o modelo lê o resumo system e "lembra" do que fez
```

---

# Estratégia de Implementação

1. **Contrato**: `ConversationTurn` ganha `steps?` (`@atlas/contracts`); rodar `git grep '@atlas/contracts'`/consumidores de `ConversationTurn` para confirmar que ninguém quebra.
2. **Cognitive (TDD)**: testes de `respond` sem plano (1 `generate`, sem `steps`, conversa sem `system` extra) e com plano (2ª `generate` de composição, `steps` preenchido, mensagem `system` compacta acrescentada) usando gateway/planner/runtime fakes; então fatorar a orquestração já existente de `ask` para reuso em `respond`, mantendo `respond` puro e o Core sem estado.
3. **CLI (TDD)**: testes do `chat` com `LineReader` fake — traço de `steps` exibido; um turno com `delete_file` que pausa e é respondido pelo `LineReader` (aprovado/recusado) sem segundo leitor de `stdin`; então compor o `ConfirmPort` sobre o `LineReader` da sessão e injetá-lo via `CreateAtlasDeps.confirm`.
4. **Verificação**: `lint`/`format:check`/`typecheck`/`test`.
5. **Documentação**: notas no ADR-0008 e no ADR-0012; `CLAUDE.md` (raiz + `cognitive`/`cli`/`contracts`); `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

- **`@atlas/cognitive`**: `respond` sem plano → exatamente 1 chamada ao gateway fake, `ConversationTurn` sem `steps`, `conversation` sem mensagem `system` de resumo. `respond` com plano → `runtime.execute` (fake) chamado, 2ª chamada de composição ao gateway, `steps` refletindo os passos (inclusive um passo negado/bloqueado), `conversation` com a mensagem `assistant` **e** a mensagem `system` compacta na ordem esperada. Pureza: duas chamadas de `respond` com a mesma entrada não vazam estado.
- **`apps/cli` (`chat`)**: com `LineReader` fake e gateway fake que emite um plano com `delete_file`, o `confirm` é atendido pela mesma fila de linhas do `chat` (aprovado → passo ok; recusado → passo negado) sem instanciar outro `readline`; o traço de `steps` é impresso no formato do `ask`; a mensagem `system` de resumo **não** é impressa ao usuário.
- **Não** retestar Runtime/Permission Service/Tools aqui — inalterados; seus testes da SPEC-0013 permanecem a autoridade.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada (ADR-0008 e ADR-0012 com nota; `CLAUDE.md` raiz + `cognitive`/`cli`/`contracts`; `NEXT_CONTEXT.md`; `CURRENT_SPRINT.md`);
- arquitetura preservada (Regras 4/6/7: Core é o orquestrador; `respond` segue puro e o Core sem estado; a Persona percebida segue única; nenhuma mudança em Runtime/Permissions/Tools);
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- **Não** criar novos packages — só editar os existentes.
- **Não** alterar `@atlas/runtime`, `@atlas/permissions` nem `@atlas/tools` — esta fatia compõe o que a SPEC-0013 já entregou.
- **Não** introduzir role `tool` em `Message` nem alterar `Conversation`/`Message` além do que já existe; o resumo entra como mensagem `system` compacta.
- **Não** implementar replanejamento/observação, dependência de dados entre passos, memória viva no chat, symlink hardening, múltiplas raízes, `rmdir`, nem flag de auto-aprovação.
- `respond` continua **função pura** sobre `(conversation, input)`; o Core segue **sem estado** (ADR-0008).
- **Não** criar um segundo leitor de `stdin` no `chat`: o `ConfirmPort` reusa o `LineReader` da sessão (evita dois `readline` disputando o terminal).
- O usuário deve perceber **uma única Persona** (Regra 7): planejador, Tools e coordenação interna permanecem invisíveis; a mensagem `system` de resumo nunca é exibida.

---

# Observações

- **Por que uma mensagem `system` de resumo, e não só a resposta final**: decisão explícita do humano no brainstorming (2026-07-17). Sem o resumo persistido na `Conversation`, o modelo esqueceria, no turno seguinte, o que executou no turno anterior (o histórico só guardaria a prosa da resposta, não os efeitos). O resumo compacto (ex.: `[Tools executadas: read_file(...) → ok; delete_file(...) → negada: cancelada pelo usuário]`) dá continuidade sem poluir a visão do usuário.
- **Por que reusar o `LineReader` para o `confirm`**: o `chat` já mantém um `LineReader` sobre `stdin` para o loop de conversa. Um `nodeReadlineConfirmPort()` separado abriria um segundo `readline` sobre o mesmo `stdin`, com disputa de input. Apoiar o `ConfirmPort` no `LineReader` da sessão mantém a confirmação inline na conversa e testável com o mesmo fake de linhas já usado nos testes do `chat`.
- **Por que nada muda no Runtime**: a pausa em `confirm` já é interna a `runtime.execute()` (SPEC-0013), que `respond` passará a aguardar exatamente como `ask` já faz — a elegância observada na SPEC-0013 (Cognitive/CLI inalterados para `ask`) se repete aqui do lado de `respond`.
- **Continuidade com o `ask`**: a orquestração Planejamento+Execução já existe e está testada em `ask`; esta SPEC a estende a `respond`, idealmente fatorando o trecho comum para não duplicar a lógica.

---

# Pontos em aberto (exigem decisão humana antes de `Draft → Ready`)

- **Prioridade**: proposta como **High** (continuação direta da SPEC-0013 e cobre requisitos de Execução do PRD que hoje não existem em conversa). _Resolvido: confirmada como High pelo humano em 2026-07-17, junto com a aprovação `Draft → Ready`._

Todos os demais campos rastreiam a fontes existentes: o design aprovado pelo humano no brainstorming de 2026-07-17, o PRD (Comunicação/Execução), o ADR-0012 (padrão de orquestração), o ADR-0008 (conversa como dado) e a fronteira explícita da SPEC-0013. Nenhum outro ponto ficou como decisão em aberto.

---

# Checklist para IA

Antes de implementar:

- ler ADR-0012, ADR-0008, ADR-0013 e a SPEC-0013 (a fronteira que esta continua);
- compreender por que `respond` deve permanecer puro e o Core sem estado;
- confirmar que Runtime/Permissions/Tools **não** mudam;
- validar dependências (SPEC-0006/0010/0013 `Done`).

Durante implementação:

- TDD por unidade, com gateway/planner/runtime/`LineReader` fakes, sem terminal/disco/rede real;
- reusar a orquestração e a renderização de `steps` do `ask` em vez de duplicá-las;
- não vazar escopo (nada de replanejamento, role `tool`, memória viva, symlink, múltiplas raízes, `rmdir`, auto-aprovação);
- manter a Persona única percebida; o resumo `system` nunca visível ao usuário.

Após implementação:

- executar `lint`/`format:check`/`typecheck`/`test`;
- atualizar documentação (ADR-0008/ADR-0012, CLAUDE.md, contexto);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, `atlas chat` é uma conversa que **age**: a cada turno o Atlas pode planejar e executar Tools — incluindo ações destrutivas que ele pausa para confirmar inline, na própria conversa — sem deixar de manter o fio multi-turno na voz da Persona. O usuário conversa naturalmente; quando o Atlas precisa deletar algo, pergunta ali mesmo e só age com um "sim"; nos turnos seguintes, ele lembra do que fez, porque um resumo compacto (invisível para o usuário) ficou no histórico. `respond` continua uma função pura e o Core sem estado, e nenhum módulo de execução mudou — a fatia é composição do que a SPEC-0013 já entregou. `atlas ask` e `atlas chat` passam a ter a mesma capacidade de execução; a diferença entre eles volta a ser só o formato (tiro único por objetivo × conversa contínua), não o que o Atlas consegue fazer.
