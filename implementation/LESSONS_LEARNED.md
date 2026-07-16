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

# Registro

## SPEC-0012 — Tool de escrita (`write_file`) + política `writeRoots` (2026-07-16)

**Descobrimos que...**

O portão de permissão da SPEC-0011 provou ser **genérico de verdade**: adicionar a primeira ação de escrita **não tocou o Runtime** — nenhuma linha. O portão já aplicava "veredicto ≠ `allowed` → `ExecutedStep` negado, Tool não roda"; como ele nunca olhou o `access`, uma escrita bloqueada percorreu exatamente o caminho de uma leitura bloqueada. A fatia inteira coube em: rotear por `access` no Permission Service, uma Tool nova, uma porta nova, e config/CLI. O melhor sinal de um bom limite é uma capacidade nova entrando sem mexer no coordenador.

Rotear `read`/`write` para políticas **separadas** (`readRoots`/`writeRoots`) com a contenção lexical **fatorada** (`within(target, roots)`) foi uma mudança de baixo risco: a lógica de fronteira de separador (já testada para leitura) passou a valer para escrita sem duplicação, e os testes de "não confunde `/proj` com `/proj-evil`" viraram só mais um caso, agora também para escrita.

`writeRoots` com **default `[]`** (diferente de `readRoots`, que exige lista não vazia) exigiu uma regra de validação distinta: "lista de caminhos não vazios, **podendo ser vazia**". O vazio não é erro — é a postura segura ("não escreve"). Foi o primeiro campo de config do projeto cuja lista vazia é válida e significativa, e o `status` ganhou um placeholder legível (`writeRoots: (nenhuma)`) em vez de imprimir string vazia.

Tornar `writeRoots` **obrigatório** em `PermissionServiceDeps` repetiu, pela sétima vez, o atrito já catalogado: o único chamador de produção (`@atlas/core`) e todas as construções diretas em teste (`create-atlas.test.ts`) tiveram que ganhar o campo na mesma task — o `vitest` (transpila, não faz typecheck) passa verde enquanto só o `tsc` acusa. Sem novidade; o plano já previa e a execução não teve surpresa.

**A arquitetura ajudou porque...**

Manter a decisão como uma **nota de atualização no ADR-0013** (em vez de um ADR-0014) refletiu a realidade: nada estrutural mudou — a SPEC apenas concretizou o `access: 'write'` que aquele ADR deixou reservado. O padrão de porta injetável (`FsReadPort` → `FsWritePort` separada, por menor privilégio) se repetiu sem fricção; a Tool de escrita nasceu testável sem disco desde o primeiro commit.

**A arquitetura atrapalhou porque...**

Nada estrutural. Único atrito operacional: os comandos `pnpm --filter <pkg> test` escritos no plano não existem (os packages não têm script `test`; a suíte roda pela raiz via `vitest.config.ts`) — corrigido em execução usando `pnpm exec vitest run <path>`. Encaminhamento: planos futuros devem escrever os comandos de teste por caminho a partir da raiz, não por `--filter ... test`.

**Precisamos mudar...**

Nada novo no processo além do reforço já registrado (campo obrigatório + chamadores na mesma task; comandos de teste pela raiz). Próxima fatia natural: o fluxo interativo de **`confirm`** (ainda só reservado) + ações **destrutivas** (`delete_file`, `mkdir`), que farão o `atlas ask` deixar de ser tiro único; e o **endurecimento de symlink** na contenção (vale igual para escrita agora).

---

## SPEC-0011 — Permission Service + Tools de leitura de sistema de arquivos (2026-07-15)

**Descobrimos que...**

Manter um avaliador de Support **puro** (sem IO) coube inteiramente em `node:path`: `createPermissionService({ readRoots })` resolve o `path` da ação para absoluto e testa contenção lexical (prefixo com fronteira de separador) contra as `readRoots` — nenhum `fs`, nenhum `realpath`. Seguir symlink exigiria IO na própria avaliação (ou uma porta de resolução injetável), o que quebraria a invariante "Permission Service sem IO"; foi adiado e documentado como limitação conhecida (ADR-0013). A pureza tornou o serviço trivialmente testável: nenhum fake de disco, só strings de path e arrays de raízes.

Fazer as Tools declararem `requirements(args) → ActionRequest | null` como **dado** — em vez de o Permission Service conhecer nomes de Tool (`read_file`, `list_dir`) — manteve o serviço genérico: ele nunca importa `@atlas/tools` nem sabe que `read_file` existe. `clock`/`calc` seguem sem `requirements`, permanecendo livres sem qualquer mudança nelas. Essa separação de autoridades (Tool descreve o que toca; Permission julga; Runtime aplica) foi o eixo central da SPEC e evitou qualquer acoplamento cruzado entre os três packages.

Mudar a assinatura de `createRuntime` (de `{ registry }` para `{ registry, permissions }`, campo obrigatório) teve que **mover na mesma task/commit** que seu único chamador de produção (`@atlas/core`, que passou a compor `createPermissionService` e injetar no `createRuntime`) — o mesmo padrão de risco já registrado na lição da SPEC-0010 (mudança de tipo de contrato não é aditiva). Como desta vez o plano já sabia disso (Task 6 tratou runtime+core juntos), não houve surpresa no `tsc`.

Tornar `permissions.readRoots` **obrigatório** em `AtlasConfig` repetiu, pela sexta vez nas SPECs deste projeto, a mesma classe de atrito: literais de `AtlasConfig` montados à mão em testes (`apps/cli/tests/status.test.ts`) quebram com TS2741 até ganharem o campo novo — o `vitest` (transpila, não faz typecheck) passa verde enquanto só o `tsc` acusa. O padrão de correção (atualizar os literais na mesma task que torna o campo obrigatório, rodando `pnpm typecheck` a cada task, não só no final) já estava incorporado ao plano e não gerou atrito real na execução — mas o padrão em si segue recorrente o suficiente para valer registrar de novo.

`AccessMode = 'read' | 'write'` incluiu `'write'` **reservado** deliberadamente, mesmo sem nenhuma Tool de escrita existir ainda — isso tornou o veredicto "acesso reservado bloqueado" (`access !== 'read'` → `blocked`) testável hoje, com um `ActionRequest` construído à mão no teste, sem esperar pela fatia de escrita.

**A arquitetura ajudou porque...**

O Module Catalog já cravava os quatro veredictos (`free`/`allowed`/`confirm`/`blocked`) e a proibição de presumir consentimento para ações destrutivas — a decisão de começar por leitura (read-only) saiu quase automática: exercita o portão real (livre × bloqueada por raiz) sem precisar do fluxo interativo de confirmação, que só faz sentido diante de uma ação destrutiva de verdade. O padrão de porta injetável (ADR-0004/0011: `fetch`, `MemoryStorage`) se repetiu sem fricção para o `FsReadPort` — o primeiro IO das Tools nasceu testável sem disco desde o primeiro commit.

**A arquitetura atrapalhou porque...**

Nada estrutural. O único atrito foi o already-conhecido TS2741 em literais de config de teste, já absorvido pelo processo de tasks.

**Precisamos mudar...**

Nada novo no processo além do reforço já registrado (mover mudança de assinatura de factory junto do único chamador; atualizar literais de `AtlasConfig` na mesma task que torna um campo obrigatório). Próximas fatias naturais: Tools de **escrita** + o fluxo interativo de **`confirm`** (hoje só reservado no vocabulário do contrato); **endurecimento de symlink** (`realpath` ou porta de resolução injetável) contra o escape documentado da contenção lexical. Não rodamos um novo probe do TS7 nesta SPEC — a Pendência já registrada em NEXT_CONTEXT pede para parar de re-probar por hábito e vincular a um gatilho externo (release do typescript-eslint com suporte ao TS7); nada mudou nesse encaminhamento.

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

Nada estrutural. O único atrito foi de plano: o PLAN-0010 não previu `packages/cognitive/tests/conversation.test.ts` (6 chamadas a `createCognitiveCore` sem `runtime`), que passavam em runtime (usam só `respond`/`startConversation`) mas quebravam o `pnpm typecheck` ao tornar `runtime` obrigatório. Lição: ao mudar a assinatura de uma factory, `grep` por **todos** os chamadores (inclusive testes de outros aspectos do mesmo módulo) antes de fechar a task, não só os que o plano lista.

**Precisamos mudar...**

Nada no processo além do reforço acima (varrer chamadores ao mudar assinaturas). Próximas fatias naturais: primeira Tool com efeito colateral → Permission Service; Skills; dependência de dados entre passos; Task Manager completo; Observação/replanejamento; Aprendizado automático. O 7º probe do TS 7 falhou igual aos anteriores (`Cannot read properties of undefined (reading 'Cjs')`) — manter o encaminhamento de vincular a um gatilho externo (release do typescript-eslint) em vez de re-probar por hábito.

---

## SPEC-0009 — Memory Service (fatos/preferências explícitos) (2026-07-13)

**Descobrimos que...**

O primeiro efeito de disco da plataforma coube no mesmo molde de injeção já usado para rede e terminal: uma **porta injetável** `MemoryStorage` (`load`/`save`) interna a `@atlas/memory`, com `createFileMemoryStorage(path)` (JSON) como default e um fake em memória nos testes. Os testes de unidade do serviço não tocam disco; o IO real fica isolado no teste do file adapter e nos testes de comando da CLI, ambos em `tmpdir` (`os.tmpdir()` + `mkdtemp`), nunca no `~/.atlas` real. `createMemoryService` é **assíncrono** (carrega os fatos uma vez na criação — load-once), o que encaixou naturalmente no `createAtlas` já assíncrono; `list()`/`prompt()` ficam síncronos e `remember`/`forget` persistem por write-through. A memória chegou à resposta pelo mesmo caminho da Persona (ADR-0011 estende ADR-0010): `memory.prompt()` vira `memoryPrompt?: string` no Cognitive, que compõe identidade → memória → tarefa via `[personaPrompt, memoryPrompt, TASK_FRAMING].filter(Boolean).join('\n\n')` sem conhecer o conceito de Memory. A CLI isolou disco por `--memory-path` (tmpdir) em vez de importar `@atlas/memory`, mantendo a app acoplada só a `@atlas/contracts` + `@atlas/core`; a porta de storage foi injetável só no `createAtlas` (para os testes de core), não na CLI.

**A arquitetura ajudou porque...**

O padrão "efeito colateral atrás de porta injetável + composição escolhe o adapter" (ADR-0004) já estava consolidado (`fetch`, `LineReader`), então persistir sem acoplar o módulo ao disco nem tocar disco nos testes foi mecânico. A separação Memória (persistente) × Contexto (temporário) do Glossary deu limites claros: o Memory Service só guarda/recupera fatos, sem decidir estratégia nem chamar o Gateway. Injetar identidade e memória como strings opcionais manteve o Cognitive sem estado e desacoplado de ambos os conceitos.

**A arquitetura atrapalhou porque...**

Adicionar um campo obrigatório a `AtlasConfig` (`memory.path`) e a `AtlasPlatform` (`memory`) exigiu atualizar **atomicamente** todos os literais/mocks que os constroem — em `apps/cli/tests/status.test.ts` foram dois pontos (o objeto `config` e o objeto `atlas`), e o do `config` não estava previsto no plano, aparecendo só no `typecheck` (TS2741). Config aninhada (`memory?: { path?: string }`) precisa de merge campo-a-campo e cuidado com `exactOptionalPropertyTypes` na composição condicional do `memoryPrompt`.

**Precisamos mudar... (encaminhamento: ADR, documentação ou nova SPEC)**

Leitura de memória no **startup**: gravar um fato não afeta uma sessão `chat` já aberta (documentado no ADR-0011; troca/leitura ao vivo é candidata a SPEC futura). Os fatos entram no system prompt de toda geração — sem retenção/seleção/busca, o prompt cresce com a memória (fatias futuras do Memory Service: episódica, projetos, busca, retenção). Probe do TS 7 (sexto, 2026-07-14): **falhou** de novo — `TypeError: Cannot read properties of undefined (reading 'Cjs')` em `@typescript-eslint/typescript-estree@8.63.0` com `typescript@7.0.2`, idêntico aos cinco anteriores. Revertido para `typescript@^5`. Encaminhamento mantido: parar de re-probar por hábito a cada SPEC; vincular a um release do typescript-eslint que declare suporte ao TS 7.

## SPEC-0008 — Persona Service (Jarvis) (2026-07-13)

**Descobrimos que...**

A identidade pôde ser injetada na **geração** sem acoplar o Cognitive ao conceito de Persona (ADR-0010): `createPersonaService().systemPrompt(persona)` deriva uma string a partir dos atributos textuais da Persona (nome/tom/formalidade/idioma/estilo/regras), e o `@atlas/core` passa essa string como `personaPrompt?: string` para `createCognitiveCore`. O Cognitive só concatena `personaPrompt` (identidade) com `TASK_FRAMING` (tarefa, renomeado de `SYSTEM_PROMPT` para deixar explícito que é enquadramento de tarefa, não mais o único ingrediente do system message) — ele nunca importa `@atlas/persona` nem conhece o tipo `Persona`. Isso manteve a regra "consumidor depende de contrato, não de implementação" mesmo sem contrato novo do lado do Cognitive: a interface pública ganhou só um parâmetro de string opcional.

Validar `config.persona` importando `PERSONA_IDS` de `@atlas/persona` em `packages/core/src/config/load-config.ts` foi seguro porque o **core é composition root** (Regra 11) e pode importar implementações, diferente de `@atlas/cognitive`/`@atlas/contracts`, que não podem. Isso evitou duplicar a lista de ids conhecidos (o registro embutido de Personas continua a única fonte da verdade) sem promover `PersonaService` a um contrato mais amplo do que o necessário.

Adicionar um campo obrigatório a `AtlasConfig`/`AtlasPlatform` (`persona`) voltou a exigir atualização atômica dos literais/mocks manuais em `apps/cli/tests/status.test.ts` no mesmo commit que estendeu o contrato e a composição — a mesma classe de atrito já registrada nas lições da SPEC-0005/0006/0007 (o `vitest` transpila e não pega o campo ausente; só o `tsc` acusa). Reforça, pela quarta vez, a mesma lição: listar os stubs manuais de `AtlasPlatform`/contratos como arquivos a atualizar e rodar `pnpm typecheck` a cada task.

Voz (`voice`) e emoção simulada (`emotion`) entraram no modelo de dados da `Persona` como slots **declarativos e inertes**: fazem parte do tipo e dos dados embutidos (`jarvis`/`neutral`), mas propositalmente **não** entram em `systemPrompt(persona)` — não há canal de áudio/afeto que os consuma hoje. Documentá-los explicitamente (CLAUDE.md do `@atlas/persona`, ADR-0010) evita que alguém os trate como já ativos ou os remova por engano por parecerem mortos.

O probe do TS7 (encaminhamento herdado) falhou pela quinta vez consecutiva em 2026-07-13, com o mesmo `TypeError: Cannot read properties of undefined (reading 'Cjs')` em `@typescript-eslint/typescript-estree@8.63.0` sob `typescript@7.0.2`; revertido para a série 5 com a suíte verde e sem resíduo em `package.json`/`pnpm-lock.yaml`. Cinco probes seguidos com a falha exata confirmam que repetir o probe a cada SPEC deixou de agregar informação nova.

**A arquitetura ajudou porque...**

O módulo já existia no Module Catalog (`Persona Service → packages/persona`, camada Interaction): nenhuma decisão de novo módulo, só a primeira implementação. A composição por parâmetro (ADR-0004) permitiu que o Cognitive ganhasse identidade sem crescer em responsabilidade — ele segue testável isoladamente com um `personaPrompt` literal, sem depender do registro de Personas. Tratar Jarvis como **configuração de dados**, não um novo Core (Glossary), manteve o Persona Service num papel estritamente passivo: não decide estratégia, não cria Plans, não chama o Model Gateway.

**A arquitetura atrapalhou porque...**

Nada estrutural. O único atrito foi de sequenciamento de tasks (stub manual de `AtlasPlatform` em `status.test.ts` precisando acompanhar o contrato estendido), já esperado e corrigido na execução.

**Precisamos mudar...**

TypeScript segue pinado na série 5. Encaminhamento revisado: parar de repetir o probe do TS7 a cada SPEC (cinco tentativas seguidas com o mesmo erro estrutural não geram sinal novo); retomar quando houver um gatilho externo — release do `typescript-eslint` que declare suporte ao compilador nativo do TS7 — em vez de por hábito de SPEC.

Troca de Persona em runtime (ex.: `/persona <nome>` no `atlas chat`) ficou fora do escopo (encaminhamento: SPEC futura; exigiria re-semear a conversa com o novo `personaPrompt`). Voz e emoção simulada permanecem inertes até existir um canal de áudio/afeto que os consuma (encaminhamento: SPEC futura). Personas por arquivo de configuração externo dependem do slot `arquivo` do ADR-0006, ainda não implementado.

---

## SPEC-0007 — Context Service (detentor de sessão) (2026-07-13)

**Descobrimos que...**

O Context Service pôde nascer como **store de valor**, não orquestrador (ADR-0009): `openSession/getConversation/updateConversation/closeSession` guardam uma `Conversation` por sessão num `Map` em memória, sem decidir estratégia nem chamar o Cognitive Core. Isso resolveu a tensão documental entre o Module Catalog ("Context é utilizado pelo Cognitive Core") e o ADR-0008 (`respond` função pura): a leitura do catálogo passou a se referir ao contexto de ambiente futuro (cwd/repo/arquivos), não ao buffer de conversa. A **app** (`atlas chat`) virou a mediadora — lê a conversa do Context, chama `respond` puro, grava o resultado de volta — exatamente como o ADR-0008 previu ("migração é troca de detentor, não de contrato"): o diff não tocou `packages/cognitive/src/cognitive-core.ts` nem `packages/contracts/src/cognitive.ts`.

Um package novo (`@atlas/context`) precisa de `pnpm install` para linkar no workspace **antes** do primeiro teste rodar — sem isso, `vitest`/`tsc` não resolvem `@atlas/context` a partir de `packages/core`/`apps/cli`, e o erro lido de fora (module not found) engana como se fosse import errado em vez de link de workspace pendente.

Adicionar um campo obrigatório em `AtlasPlatform` (`context: ContextService`) precisa ser **atômico** com o fornecimento em `createAtlas`: um `tsc` limpo entre tasks só existe se o contrato, a composição no core **e** qualquer stub manual de `AtlasPlatform` nos testes (ex.: `apps/cli/tests/status.test.ts`) mudarem no mesmo commit — foi assim que a task de composição no core evitou o mesmo atrito já registrado na SPEC-0006 com `startConversation`/`respond` (contrato estendido sem o stub manual acompanhar, pego só pelo `tsc`, não pelo `vitest`). Reforça a lição anterior: listar os stubs manuais de contrato como arquivos a atualizar e rodar `pnpm typecheck` a cada task, não só ao final.

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

O módulo já existia e o contrato `CognitiveCore` já vivia em `@atlas/contracts` (ADR-0007): estender a conversa foi acrescentar operações ao contrato + implementá-las, sem novo módulo nem promoção. A composição manual (ADR-0004) deixou o loop de chat testável com `gateway` (via provider `fake`) e `LineReader` stub, sem rede nem TTY. Mapear o erro de modelo por `AtlasError.code` permitiu tratá-lo **dentro** do loop (chat sobrevive à falha) reusando a mesma mensagem amigável do `ask`, sem a CLI conhecer `@atlas/model-gateway`.

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

## SPEC-0004 — Model Gateway (2026-07-12)

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

## SPEC-0003 — CLI Foundation (2026-07-12)

**Descobrimos que...**

A rota de execução escolhida no design (Node nativo via _type stripping_) não funciona com a convenção de imports `.js` (NodeNext) do repositório: o Node ≥ 24 não remapeia `.js` → `.ts`, e como todo o repo usa `.js`, nem `@atlas/core` carrega. Adotamos `tsx` (`devDependency`) — registrado no ADR-0005. Lição: uma decisão de execução deve ser verificada empiricamente antes de virar recomendação no brainstorming; a recomendação original ("Node nativo estende o padrão sem-`dist` naturalmente") não considerou a interação `.js`/type-stripping.

O pnpm 11 não lê mais o campo `pnpm` do `package.json`; a aprovação de build de dependências (o `esbuild`, motor do `tsx`) vive em `pnpm-workspace.yaml` (`allowBuilds`). Sem isso, `pnpm install` sai com código 1 (`ERR_PNPM_IGNORED_BUILDS`) e trava a verificação de deps dos scripts do pnpm.

O `@atlas/core` não re-exporta os tipos de `@atlas/contracts`; consumidores (a CLI) declaram `@atlas/contracts` como dependência direta (regra `apps/* → packages/*`). O plano assumira "só `@atlas/core`" e foi corrigido na execução.

`AtlasConfig` tem propriedades `readonly` e `Partial<AtlasConfig>` as preserva — o override de config precisa ser construído num objeto local mutável antes de retornar.

O probe do TS7 (encaminhamento da SPEC-0002) falhou de novo: em 2026-07-12 o typescript-eslint 8.63 continua quebrando com o TS 7.0.2; revertido para a série 5 com a suíte verde. Durante o revert, o executor de comandos ficou temporariamente indisponível e foi destravado com o prefixo `!` (usuário rodou a suíte).

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

O probe do TS7 (encaminhamento da SPEC-0001) falhou novamente: em 2026-07-11 o typescript-eslint 8.63 ainda quebra com o compilador nativo; revertido para a série 5 com a suíte verde.

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

Planos devem verificar versões reais na máquina em vez de assumi-las (encaminhamento: PLAN-0001 corrigido nesta entrega; prática incorporada aos próximos planos).
