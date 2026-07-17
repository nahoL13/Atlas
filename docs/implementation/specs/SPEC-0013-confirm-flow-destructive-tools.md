# SPEC-0013 — Fluxo `confirm` + primeiras Tools destrutivas

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-0013

---

**Título**

Fluxo interativo `confirm` no Runtime + Tools `delete_file`/`mkdir`/`append_file`, restrito a `atlas ask`

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

High

---

# Objetivo

Ao concluir esta SPEC, o veredicto `confirm` — reservado desde o ADR-0013 e nunca produzido até a SPEC-0012 — passa a ser **real**: o Runtime pausa a execução de um plano para pedir confirmação explícita ao usuário antes de rodar uma ação irreversível, e só então prossegue. `atlas ask` deixa de ser sempre tiro único quando o plano envolve uma ação destrutiva.

Concretamente, quando esta SPEC estiver concluída:

- Existem três Tools novas em `packages/tools`: `delete_file` (`{ path }`, remove um arquivo), `mkdir` (`{ path }`, cria diretório recursivamente, idempotente) e `append_file` (`{ path, content }`, acrescenta conteúdo, criando o arquivo se ausente). Todas seguem o padrão já estabelecido: `requirements(args) → ActionRequest` como dado, IO por porta injetável, `args` inválido/erro de IO → `ToolResult` de erro, nunca lançam.
- `AccessMode` ganha `'delete'`. `delete_file` declara `access: 'delete'`; `mkdir`/`append_file` declaram `access: 'write'` (não são irreversíveis — não apagam dado existente).
- `@atlas/permissions` passa a produzir o veredicto `confirm` de verdade: `access: 'delete'` dentro de `writeRoots` → `confirm` (não `allowed` direto); fora/vazio → `blocked`, igual às demais rotas. `read`/`write` inalterados.
- O **Runtime** ganha uma dependência nova, `confirm: ConfirmPort` (`request(action: ActionRequest): Promise<boolean>`), injetada ao lado de `permissions`. Ao encontrar veredicto `confirm`, `execute()` aguarda `confirm.request(requirement)` antes de decidir: aprovado → roda a Tool normalmente; recusado → `ExecutedStep` negado (motivo distinto de "bloqueado"), a Tool não roda. Nunca lança; segue para os passos seguintes.
- Existe uma implementação real de `ConfirmPort` (`nodeReadlineConfirmPort()`, sobre `node:readline` + stdin/stdout) em `@atlas/runtime`, no mesmo padrão de `nodeFsReadPort()`: real por default, fake nos testes. Se `stdin` não for TTY ou fechar (EOF) antes de uma resposta, o port **recusa automaticamente** — nunca trava esperando input que não vai chegar.
- `@atlas/core` compõe o `ConfirmPort` default no `Runtime` e aceita `CreateAtlasDeps.confirm?` para testes; registra as três Tools novas no catálogo.
- **Nada muda em `@atlas/cognitive` nem em `apps/cli/src/commands/ask.ts`**: a pausa acontece dentro de `runtime.execute()`, que `cognitive.ask()` já aguarda. O comportamento fica transparente ao restante da orquestração Planner→Runtime→resposta (ADR-0012).
- Escopo **restrito a `atlas ask`**: `atlas chat` usa `CognitiveCore.respond()` (ADR-0008), que não passa pelo Planner nem pelo Runtime — não há Tools nem `confirm` em `chat` nesta fatia.
- O **ADR-0013** ganha uma nota de atualização registrando que `confirm` deixou de ser reservado.

---

# Motivação

A SPEC-0012 entregou a primeira Tool de escrita (`write_file`) sob uma fronteira **explícita mas não interativa**: `writeRoots` como opt-in, sem pedir confirmação por ação. Essa escolha foi deliberada — a SPEC-0012 registrou explicitamente que o fluxo `confirm` ficava para a SPEC seguinte. Esta é essa SPEC.

O vocabulário de 4 veredictos do Permission Service (`free`/`allowed`/`confirm`/`blocked`, Module Catalog) já reserva `confirm` desde o ADR-0013 para exatamente este caso: uma ação que a política *permite* (está dentro da raiz concedida) mas que o Runtime não deve executar sem que o usuário veja e aprove **naquele momento**, porque é irreversível. `delete_file` é a primeira ação da plataforma que perde dado de forma permanente — nem `write_file` (sobrescrita sob opt-in) nem `mkdir`/`append_file` (não destroem nada existente) se qualificam da mesma forma.

O recorte é deliberadamente mínimo: **uma** Tool exige `confirm` (`delete_file`); as outras duas (`mkdir`, `append_file`) entram na mesma fatia por serem pequenas, reusarem a máquina de escrita existente e resolverem, de quebra, a limitação conhecida do `write_file` (não criar diretório-pai). O fluxo interativo fica restrito a `atlas ask`, porque é o único comando que hoje orquestra Planejamento+Execução — `atlas chat` não tem onde a pausa aconteceria. Symlink hardening, múltiplas raízes e contexto de ambiente são fatias independentes, adiadas para SPECs futuras (0014+).

Documentos originadores: **Module Catalog** (Permission Service; os 4 veredictos; "não presumir consentimento para ações destrutivas") + **ADR-0013** (`confirm` reservado ao fluxo interativo futuro) + fronteira explícita da **SPEC-0012** ("fluxo interativo `confirm` fica para a SPEC-0013").

---

# Referências

- [Module Catalog](../../03-architecture/ModuleCatalog.md) — Permission Service (os 4 veredictos; "não presumir consentimento para destrutivas"); Tools são adaptadores; Runtime consome Permission Service
- [ADR-0013](../../06-adr/ADR-0013-permission-service-execution-gate.md) — Permission Service como portão puro na execução; `confirm` reservado ao fluxo interativo futuro
- [ADR-0012](../../06-adr/ADR-0012-planner-runtime-execution.md) — `ask` orquestra Planejamento + Execução; Runtime executa o plano, Cognitive só aguarda
- [ADR-0008](../../06-adr/ADR-0008-conversation-as-data.md) — `atlas chat`/`respond` sem planejamento, por que Tools não entram nesta fatia de `chat`
- [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md) — Execução com avaliação de risco; transparência
- SPEC-0012 (`implementation/specs/SPEC-0012-write-file-tool.md`) — `write_file`, `writeRoots`, padrão de porta injetável e fronteira que esta SPEC continua

---

# Escopo

- **`@atlas/contracts`**: `AccessMode` ganha `'delete'` (comentário atualizado); `PermissionVerdict` inalterado (`confirm` já existe, só passa a ser produzido).
- **`@atlas/permissions`**: `evaluate` ganha a rota `access: 'delete'` contra `writeRoots` — dentro → `confirm`; fora/vazio → `blocked`, reusando a mesma `within()`. `read`/`write` inalterados.
- **`@atlas/tools`**: criar `delete_file` (`createDeleteFileTool({ fs? })`, `access: 'delete'`), `mkdir` (`createMkdirTool({ fs? })`, `access: 'write'`, recursivo/idempotente) e `append_file` (`createAppendFileTool({ fs? })`, `access: 'write'`, cria se ausente). `FsWritePort` ganha os métodos necessários (`deleteFile`/`mkdir`/`appendFile`), com implementação default sobre `node:fs/promises`.
- **`@atlas/runtime`**: `RuntimeDeps` ganha `confirm: ConfirmPort`; `execute()` consulta `confirm.request(requirement)` quando o veredicto é `confirm`, antes de rodar a Tool; criar a interface `ConfirmPort` (interna ao package) e `nodeReadlineConfirmPort()` (default real, recusa em EOF/não-TTY).
- **`@atlas/core`**: compor `nodeReadlineConfirmPort()` por default no `Runtime`; `CreateAtlasDeps` ganha `confirm?: ConfirmPort`; registrar as três Tools novas no catálogo.
- **Testes**: unidades por porta/port injetável (`permissions`, `tools`, `runtime` com `ConfirmPort` fake aprovando/recusando, `core`), sem terminal/disco/rede real.
- **Documentação**: nota de atualização no ADR-0013; atualizar `CLAUDE.md` raiz e dos packages tocados (`permissions`, `tools`, `runtime`, `core`), `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`; registrar lições em `LESSONS_LEARNED.md`.

---

# Fora do Escopo

- **Tools/`confirm` em `atlas chat`** — `respond()` não passa pelo Planner/Runtime (ADR-0008); trazer execução de Tools para `chat` é mudança arquitetural maior, fica para SPEC futura, fora desta.
- **Symlink hardening / `realpath`** na contenção do Permission Service — limitação conhecida do ADR-0013, vale igual aqui; candidata a SPEC-0014.
- **Múltiplas raízes** de leitura/escrita numa única invocação — segue single-value; candidata a SPEC-0015.
- **Contexto de ambiente** (cwd/repo/branch) para o Cognitive/Planner — candidata a SPEC-0016.
- **Confirmação para `mkdir`/`append_file`** — ambas seguem `access: 'write'` (`allowed`/`blocked` direto), sem pedir confirmação.
- **`rmdir`** ou remoção recursiva de diretório — só `delete_file` (arquivo único) entra nesta fatia.
- **Novo ADR** — apenas nota de atualização no ADR-0013 (a decisão estrutural já existe; esta fatia a concretiza).
- **Flag de auto-aprovação não interativa** (ex.: `--confirm-destructive` para pular o prompt) — o objetivo desta fatia é o fluxo interativo de verdade; automação de aprovação fica para trabalho futuro, se necessário.
- **Alterar `@atlas/cognitive`** — nenhuma mudança de código; a pausa é interna ao `runtime.execute()` que já é aguardado.

---

# Pré-requisitos

- [SPEC-0011](SPEC-0011-permission-service-fs-read.md) (Permission Service + Tools de leitura de FS) — `Done`
- [SPEC-0012](SPEC-0012-write-file-tool.md) (Tool de escrita `write_file` + `writeRoots`) — `Done`

---

# Critérios de Aceitação

- `delete_file`, `mkdir`, `append_file` existem em `packages/tools`, cada uma com `requirements(args) → ActionRequest` correto e `run(args)` que nunca lança (`args` inválido/erro de IO → `ToolResult` de erro).
- `mkdir` cria diretórios intermediários ausentes (`{ recursive: true }`) e não erra se o diretório já existir.
- `append_file` cria o arquivo do zero se ele não existir, e acrescenta (sem sobrescrever) se existir.
- `AccessMode` inclui `'delete'`.
- `@atlas/permissions`: `access: 'delete'` dentro de `writeRoots` → veredicto `confirm`; fora/vazio → `blocked`. `access: 'write'` (`mkdir`/`append_file`) segue `allowed`/`blocked` como hoje. `read` inalterado.
- `Runtime` aceita `confirm: ConfirmPort` injetado; veredicto `confirm` → aguarda `confirm.request(requirement)`; aprovado executa a Tool normalmente (sucesso/erro normal); recusado vira `ExecutedStep` negado, com motivo que **não** é igual ao de `blocked`, sem rodar a Tool; nunca lança; execução continua nos passos seguintes.
- `nodeReadlineConfirmPort()` existe em `@atlas/runtime`, real sobre `node:readline`+stdin/stdout; recusa automaticamente (não trava) quando `stdin` não é TTY ou fecha (EOF) antes de responder.
- `@atlas/core` compõe o `ConfirmPort` default no `Runtime`, aceita `CreateAtlasDeps.confirm?` e registra as três Tools novas no catálogo.
- Fim a fim: um plano de `atlas ask` com `delete_file` numa `writeRoot` permitida pausa a execução, pergunta no terminal, e conclui a resposta final tanto se aprovado (arquivo removido) quanto se recusado (passo negado, execução segue).
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes; nenhum teste toca terminal/stdin/disco real (fakes de `ConfirmPort`/`FsWritePort`).
- ADR-0013 com nota de atualização; `CLAUDE.md` (raiz + `permissions`/`tools`/`runtime`/`core`), `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md` atualizados; lições em `LESSONS_LEARNED.md`.

---

# Arquivos Esperados

```text
packages/contracts/src/
  permission.ts          (editado: AccessMode + 'delete')

packages/permissions/src/
  permission-service.ts  (editado: rota access: 'delete' → confirm/blocked)
  permission-service.test.ts (editado: casos de delete)

packages/tools/src/
  fs-port.ts              (editado: + deleteFile/mkdir/appendFile em FsWritePort)
  delete-file.ts           (novo: createDeleteFileTool)
  delete-file.test.ts      (novo)
  mkdir.ts                 (novo: createMkdirTool)
  mkdir.test.ts             (novo)
  append-file.ts            (novo: createAppendFileTool)
  append-file.test.ts       (novo)
  index.ts                  (editado: exports novos)

packages/runtime/src/
  confirm-port.ts          (novo: ConfirmPort, nodeReadlineConfirmPort)
  confirm-port.test.ts      (novo)
  runtime.ts                (editado: RuntimeDeps.confirm + espera em execute())
  runtime.test.ts            (editado: casos de confirm aprovado/recusado)
  index.ts                   (editado: exports novos)

packages/core/src/
  index.ts                   (editado: compõe confirm default, CreateAtlasDeps.confirm?, registra 3 Tools)
  *.test.ts                  (editado: casos com ConfirmPort fake)

docs/06-adr/ADR-0013-permission-service-execution-gate.md (editado: nota de atualização)
CLAUDE.md (raiz) + CLAUDE.md de permissions/tools/runtime/core (editados)
docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md (editados)
docs/implementation/LESSONS_LEARNED.md (editado)
```

---

# Componentes Impactados

- Contracts (`@atlas/contracts`) — `AccessMode`
- Permission Service (`@atlas/permissions`) — rota `delete`
- Tools (`@atlas/tools`) — `delete_file`/`mkdir`/`append_file`, `FsWritePort` estendida
- Runtime (`@atlas/runtime`) — `ConfirmPort`, pausa em `execute()`
- Core (`@atlas/core`) — composição do `ConfirmPort` default, registro das Tools
- Cognitive Core (`@atlas/cognitive`) — **não impactado** (consumidor inalterado)
- CLI (`@atlas/cli`) — **não impactado** (`ask.ts` inalterado; comportamento novo é transparente)

---

# Interfaces Necessárias

- `ConfirmPort` (interno a `@atlas/runtime`, sem 2º consumidor real → não sobe a `@atlas/contracts`, mesmo critério do `FsReadPort`): `request(action: ActionRequest): Promise<boolean>`.
- `RuntimeDeps` (em `@atlas/runtime`): ganha `confirm: ConfirmPort`.
- `FsWritePort` (em `@atlas/tools`): ganha `deleteFile(path: string): Promise<void>`, `mkdir(path: string): Promise<void>`, `appendFile(path: string, content: string): Promise<void>`.
- `CreateAtlasDeps` (em `@atlas/core`): ganha `confirm?: ConfirmPort`.
- `AccessMode` (em `@atlas/contracts`): ganha `'delete'`.
- Nenhuma outra interface pública nova em `@atlas/contracts` (`PermissionVerdict`/`ActionRequest`/`PermissionDecision` já existem).

---

# Fluxo Esperado

```text
Planner produz passo { tool: "delete_file", args: { path } }
        ↓
Runtime.execute:
  tool.requirements(args) → { resource:{type:"file",path}, access:"delete" }
        ↓
  permissions.evaluate(req):
    access "delete" → contenção lexical contra writeRoots
      dentro  → confirm
      fora/[] → blocked → ExecutedStep negado, execução continua
        ↓ (verdict === "confirm")
  confirm.request(req)  — pausa, pergunta no terminal
      aprovado → delete_file.run → FsWritePort.deleteFile → ToolResult ok
      recusado → ExecutedStep negado ("ação cancelada pelo usuário"), Tool não roda
        ↓
CLI (atlas ask): traço de passos existente, sem mudança de código
  🔧 delete_file → removido: <path>                    (aprovado)
  🔧 delete_file → erro: ação cancelada pelo usuário    (recusado)
```

---

# Estratégia de Implementação

1. **Contratos**: `AccessMode` ganha `'delete'`.
2. **Permissions (TDD)**: testes de `access: 'delete'` (dentro → `confirm`; fora/vazio → `blocked`) → implementar a rota, reusando `within()`.
3. **Tools (TDD)**: estender `FsWritePort` (`deleteFile`/`mkdir`/`appendFile`, default sobre `node:fs/promises`); testes e implementação de `delete_file`, `mkdir` (recursivo/idempotente), `append_file` (cria se ausente).
4. **Runtime (TDD)**: `ConfirmPort` + `nodeReadlineConfirmPort()` (com teste de EOF/não-TTY → recusa); estender `RuntimeDeps`/`execute()` para consultar `confirm.request` no veredicto `confirm`; testes com `ConfirmPort` fake (aprovado/recusado) confirmando que a Tool roda ou não, e que a execução nunca lança.
5. **Core (TDD)**: compor `nodeReadlineConfirmPort()` default; `CreateAtlasDeps.confirm?`; registrar as três Tools novas; testes com `ConfirmPort` fake fim a fim (`ask` com plano de `delete_file`).
6. **Verificação**: `lint`/`format:check`/`typecheck`/`test`.
7. **Documentação**: nota no ADR-0013; `CLAUDE.md` (raiz + packages tocados); `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

- **`@atlas/permissions`**: `delete` dentro de `writeRoots` → `confirm`; fora → `blocked`; `writeRoots: []` → `blocked`; `write`/`read` inalterados e não afetados pela rota nova.
- **`@atlas/tools`**: `delete_file` chama `FsWritePort.deleteFile` com o `path` certo; `requirements` retorna `access: 'delete'`; `path` vazio → erro sem chamar a porta; porta que lança → `ToolResult` de erro. `mkdir` chama `FsWritePort.mkdir` recursivo; diretório já existente não erra. `append_file` chama `FsWritePort.appendFile`; cria se ausente (verificado via porta fake). Todas: nunca lançam.
- **`@atlas/runtime`**: veredicto `confirm` + `ConfirmPort` fake aprovando → Tool roda, `ExecutedStep` reflete o resultado normal; veredicto `confirm` + fake recusando → `ExecutedStep` negado, Tool (porta fake) **nunca chamada**, execução continua nos passos seguintes; veredicto `allowed`/`blocked` seguem sem consultar `confirm` (só `confirm` consulta o port). `nodeReadlineConfirmPort`: teste de EOF/stdin não-TTY resolve `false` sem travar (com timeout de segurança no teste).
- **`@atlas/core`**: `ConfirmPort` fake injetado via `CreateAtlasDeps.confirm`; um `ask` fim a fim cujo plano inclua `delete_file` aprova/recusa deterministicamente sem terminal real; as três Tools aparecem em `runtime.tools()`/no registry.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando (`pnpm test`), `lint`/`format:check`/`typecheck` verdes;
- documentação atualizada (ADR-0013 com nota; `CLAUDE.md` raiz + packages tocados; `NEXT_CONTEXT.md`; `CURRENT_SPRINT.md`);
- arquitetura preservada (Regras 4/5/6; Tools sem decisão de permissão; Permission Service segue puro/síncrono; `@atlas/cognitive`/CLI inalterados);
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- **Não** criar novos packages — só editar os existentes.
- **Não** alterar `@atlas/cognitive` nem `apps/cli/src/commands/ask.ts` — o comportamento novo é transparente ao Cognitive/CLI.
- **Não** trazer Tools/`confirm` para `atlas chat` nesta fatia.
- **Não** implementar symlink hardening, múltiplas raízes, nem contexto de ambiente aqui.
- Tools continuam **sem** decidir permissão nem quando são usadas (Regra 5): `requirements` só descreve o recurso.
- `ConfirmPort` fica interno a `@atlas/runtime` (sem 2º consumidor real → não sobe a `@atlas/contracts`).
- Permission Service continua **puro e síncrono, sem IO** — quem faz IO (o prompt real) é o `ConfirmPort`, consultado pelo Runtime, nunca pelo `evaluate`.
- O port real **nunca trava indefinidamente**: EOF/não-TTY em `stdin` resolve como recusado.

---

# Observações

- **Por que só `delete_file` pede confirmação**: é a única ação desta fatia que destrói dado existente de forma irreversível. `mkdir` só cria; `append_file` só acrescenta — nenhuma das duas apaga o que já existia, então seguem o padrão `write` já validado na SPEC-0012.
- **Por que o Runtime, e não o Permission Service, faz IO de terminal**: o Permission Service continua puro por design (ADR-0013) — ele só *julga*. Quem *aplica* o veredicto, incluindo pausar para perguntar, é o Runtime, exatamente como já aplica `blocked`/`allowed`.
- **Por que nada muda em `@atlas/cognitive`**: `ask()` já faz `await runtime.execute(plan)` — a pausa interna ao `execute()` é invisível para quem chama. Este é o mesmo tipo de elegância que a SPEC-0012 observou no Runtime ficar inalterado para escrita.
- `mkdir` recursivo resolve, como efeito colateral útil, a limitação documentada do `write_file` (SPEC-0012) de não criar diretório-pai — quem precisar pode chamar `mkdir` antes.

---

# Checklist para IA

Antes de implementar:

- ler ADR-0013, ADR-0012, ADR-0008 e o Module Catalog (Permission Service / Tools);
- compreender por que `chat` fica fora (não passa pelo Runtime);
- confirmar que `@atlas/cognitive` e a CLI não precisam mudar;
- validar dependências (SPEC-0011/0012 `Done`).

Durante implementação:

- TDD por unidade, porta/port injetável, sem terminal/disco/rede real;
- manter Tools sem decisão de permissão; Permission Service puro/síncrono;
- não vazar escopo (nada de `chat`, symlink, múltiplas raízes, contexto de ambiente, `rmdir`);
- garantir que o port real nunca trava (EOF/não-TTY → recusa).

Após implementação:

- executar `lint`/`format:check`/`typecheck`/`test`;
- atualizar documentação (ADR-0013, CLAUDE.md, contexto);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, o Atlas sabe pedir permissão em tempo real antes de destruir algo. `atlas ask` com um plano que inclua `delete_file` numa raiz de escrita concedida pausa, mostra a ação pendente e espera uma resposta explícita — só então age. Recusar não derruba a execução: o passo fica registrado como negado e o Atlas segue, exatamente como já fazia com ações bloqueadas por política. `mkdir` e `append_file` ampliam o vocabulário de escrita sem exigir esse cuidado extra, porque não apagam nada. O vocabulário de 4 veredictos do Permission Service, desenhado desde o ADR-0013, está agora inteiramente em uso. `atlas chat` permanece como está — a próxima fronteira (Tools em conversa multi-turno) fica para depois.
