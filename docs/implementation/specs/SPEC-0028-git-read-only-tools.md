# Implementation Specification

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0028

---

**Título**

Tools de git somente-leitura (`git_status` / `git_diff` / `git_log`) em `@atlas/tools`, com o toplevel real do repositório contido às `readRoots` pelo `verify` injetado (ADR-0013 + ADR-0014)

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

Justificativa registrada nas "Decisões de design" (D7).

---

**Perfil**

- [ ] micro
- [x] completo

Justificativa registrada nas "Decisões de design" (D1). Confirmado pelo `architecture-reviewer` no 1º gate.

---

**Item do Roadmap**

`Fase 1 — 1.4 Capacidades de Plataforma — Tools de desenvolvimento de software` (`candidato · SPEC direta`, `docs/04-engineering/Roadmap.md` l. 100). Entrega a **primeira fatia concreta** nomeada nesse item — "Tools de git somente-leitura (`git_status`, `git_diff`, `git_log`)". **Não** fecha nenhum gate (o único gate de 1.4 — Skills — já foi fechado pela SPEC-0025); é um candidato independente. Explicitamente **fora** desta fatia: "execução de comandos sob o Permission Service (novo tipo de `access`, exigirá `confirm`)" e "leitura de estrutura de projeto", nomeadas no mesmo item como fatias **separadas**; e "Contexto de ambiente que o Cognitive/Planner podem ler" (l. 101, `ADR primeiro`), que esta SPEC **não** cruza.

---

# Objetivo

Ao concluir esta SPEC, o Atlas passa a ter as **primeiras Tools da sua especialidade declarada** (desenvolvimento de software; Vision) — hoje só existem Tools genéricas de filesystem. Três Tools de git **somente-leitura** ficam disponíveis no Tool Registry e passam a ser selecionáveis pelo Planner quando o objetivo exigir inspecionar o estado de um repositório:

- `git_status` — estado da árvore de trabalho (arquivos modificados/staged/não rastreados).
- `git_diff` — diferenças da árvore de trabalho (opcionalmente as já em stage).
- `git_log` — histórico recente de commits (com teto de quantidade).

Cada Tool é um **adaptador puro** (Regra 5): declara, como **dado**, o recurso que toca (`requirements(args) → ActionRequest` com `access: 'read'` sobre o diretório-alvo) e invoca o binário `git` por uma **porta injetável** (`GitReadPort`), sem lógica de negócio, sem decidir permissão e sem executar comandos arbitrários.

O ponto central desta fatia — e o que a distingue de "mais uma Tool de leitura" — é que **o recurso declarado tem de ser o recurso realmente lido**. `git status`/`diff`/`log` **descobrem o repositório subindo pelos diretórios pais**: apontar o git para um subdiretório faria o comando relatar (e, no `diff`, imprimir o **conteúdo** de) toda a árvore acima dele, inclusive do que `read_file` seria `blocked` de ler. Por isso a porta, antes de rodar qualquer subcomando, **descobre o toplevel real do repositório e aplica sobre ele o veredicto de contenção** pelo predicado estreito `verify(realpath, access)` já estabelecido pelo ADR-0014 e fiado por `@atlas/core` a partir de `permissions.isContained`. Toplevel fora das `readRoots` → recusa estruturada, e o subcomando **não roda**.

Quando esta SPEC estiver concluída:

- `packages/tools` ganha `git_status`, `git_diff`, `git_log` e a porta `GitReadPort` interna (adaptador default `nodeGitReadPort({ verify?, exec? })` sobre `node:child_process`), no molde de `FsReadPort`/`nodeFsReadPort`.
- `@atlas/core` registra as três Tools e fia `nodeGitReadPort({ verify: permissions.isContained.bind(permissions) })` — reusando **exatamente** a fiação que já existe para as portas de FS, sem config nova.
- `atlas ask "o que mudou no meu repositório?"` produz um plano que seleciona as Tools de git, a leitura é contida ao repositório permitido, e a resposta explica o estado — informando **qual** diretório foi inspecionado. Um repositório cujo toplevel esteja fora das `readRoots` aparece como passo negado, com o motivo.

---

# Motivação

O **PRD** (seção **Desenvolvimento de Software**) exige que o sistema *"compreenda projetos de software"*, *"revise código"*, *"auxilie na identificação de erros"* e *"colabore durante todo o ciclo de desenvolvimento"*. A **Vision** declara o desenvolvimento de software como a especialidade do Jarvis. Hoje, porém, as únicas Tools com efeito são genéricas de filesystem: o Atlas consegue ler um arquivo, mas **não sabe qual é o estado do repositório** — o que mudou, o que está em stage, o histórico recente — que é o vocabulário básico de qualquer colaboração em desenvolvimento de software.

O **Roadmap** (1.4, l. 100) nomeia essa lacuna e aponta como primeira fatia candidata exatamente as "Tools de git somente-leitura (`git_status`, `git_diff`, `git_log`)", classificando-a como `SPEC direta` e prescrevendo que sigam "o padrão incremental das SPECs 0011–0013 (Tools + porta injetável)". A proatividade em si **não** está aqui — depende de Observação/Aprendizado (1.2) e provavelmente de Skills; esta SPEC entrega **só a capacidade**.

Escolheu-se o recorte **somente-leitura** para exercitar a capacidade sem disparar duas fatias separadas e mais caras: (a) mutação do repositório (`commit`/`checkout`/`push`), que seria ação destrutiva e exigiria `confirm`; e (b) execução de comandos arbitrários como capacidade, que o Roadmap reserva como "novo tipo de `access`" numa fatia futura com ADR. Comandos de git que apenas **relatam** estado cabem no regime `read`/`allowed`/`blocked` do ADR-0013 — **desde que** a contenção seja aplicada sobre o repositório efetivamente lido (D2) e **desde que** não escrevam no repositório sob veredicto de leitura (D9).

Documentos originadores: **PRD** (Desenvolvimento de Software) + **Vision** + **Roadmap** 1.4 (l. 100) + **ADR-0013** (portão puro; requisitos como dado; IO por porta injetável) + **ADR-0014** (a porta coleta fatos de uso e aplica o veredicto no instante do uso).

---

# Referências

- [PRD — seção Desenvolvimento de Software](../../02-product/ProductRequirementsDocument.md)
- [Vision](../../01-vision/Vision.md) — especialidade do Jarvis (desenvolvimento de software)
- [Module Catalog — Tool Registry; Runtime consome Permission Service; Regra 5 (Tools são adaptadores)](../../03-architecture/ModuleCatalog.md)
- [ADR-0013 — Permission Service: portão puro na execução](../../06-adr/ADR-0013-permission-service-execution-gate.md) (Tools declaram `requirements` como dado; IO por porta injetável; Runtime aplica o veredicto; `read` contido às `readRoots`; *"o valor do portão está exatamente em julgar o recurso concreto"*)
- [ADR-0014 — Fecho atômico de TOCTOU: enforcement no instante do uso](../../06-adr/ADR-0014-toctou-atomic-enforcement.md) — **origem do predicado estreito `verify(realpath, access)`** que esta SPEC reusa, e do critério de **residual documentado** para operações sem fd a ancorar (`list_dir`, `delete_file`/`mkdir`)
- [SPEC-0024](SPEC-0024-fs-port-fail-closed-verify.md) — `verify` **fail-closed por default** (`() => false`); postura que esta porta herda
- [ADR-0012 — Planner/Runtime/Tools](../../06-adr/ADR-0012-planner-runtime-execution.md) (falha estruturada por passo, nunca derruba a execução)
- [ADR-0009 — Context Service como store de valor](../../06-adr/ADR-0009-context-service-value-store.md) (fronteira: **contexto de ambiente** — cwd/repo/branch lidos pelo Cognitive/Planner — fora de escopo; esta SPEC não o cruza)
- [Roadmap — Fase 1, 1.4 Capacidades de Plataforma](../../04-engineering/Roadmap.md) (l. 100)
- SPECs anteriores do módulo (padrão a reusar): [SPEC-0011](SPEC-0011-permission-service-fs-read.md), [SPEC-0012](SPEC-0012-write-file-tool.md), [SPEC-0013](SPEC-0013-confirm-flow-destructive-tools.md), [SPEC-0017](SPEC-0017-toctou-atomic-enforcement.md)

---

# Escopo

- **`@atlas/tools`** — criar a porta e as três Tools:
  - `GitReadPort` (interface local ao package, no molde do `FsReadPort` — **não** sobe a `@atlas/contracts`, sem 2º consumidor real): três métodos narrow, um por subcomando:
    - `status(cwd: string): Promise<GitOutput>`
    - `diff(cwd: string, opts?: { staged?: boolean }): Promise<GitOutput>`
    - `log(cwd: string, opts?: { maxCount?: number }): Promise<GitOutput>`
    - `GitOutput = { readonly repository: string; readonly text: string; readonly truncated: boolean }` — `repository` é o **toplevel real resolvido** (transparência, D11); `truncated` sinaliza corte por teto de saída (D10).
  - `nodeGitReadPort({ verify?, exec? }): GitReadPort` — adaptador default sobre `node:child_process` `execFile` (**argv como array, nunca `shell: true`**). Para **cada** invocação, executa nesta ordem:
    1. **Descobre o toplevel real**: `git --no-optional-locks -C <alvo> rev-parse --show-toplevel`; falha (não é repositório, git ausente) → erro estruturado, sem rodar o subcomando.
    2. **Resolve o `realpath`** do toplevel obtido (canônico, como o `verify` do ADR-0014 espera).
    3. **Aplica o veredicto**: `verify(<toplevel realpath>, 'read')`. `false` → recusa com mensagem distinta (`fora do diretório permitido: <toplevel>`), e o subcomando **não roda**. `verify` é **fail-closed por default** (`() => false`), herdando a postura da SPEC-0024.
    4. Só então executa o subcomando **fixo**, com `cwd` = toplevel verificado.
  - Todo argv começa com `--no-optional-locks` (opção *top-level* do git), para que o comando **não escreva** no repositório sob veredicto de leitura (D9). Argumentos derivados de forma **allowlistada** das opções bounded; entrada do usuário nunca vira comando.
  - Política de saída (D10): `execFile` com `maxBuffer` **explícito** (10 MiB) — estouro vira erro estruturado, nunca falha opaca; a saída capturada é truncada num teto de **64 KiB**, com marcador visível e `truncated: true`.
  - `createGitStatusTool({ git?, cwd? }): Tool` — `name: 'git_status'`; `requirements({ path? })` → `{ resource: { type: 'directory', path: <alvo> }, access: 'read' }`; `run({ path? })` chama `git.status(alvo)`.
  - `createGitDiffTool({ git?, cwd? }): Tool` — `name: 'git_diff'`; `requirements` como acima; `run({ path?, staged? })` chama `git.diff(alvo, { staged })`.
  - `createGitLogTool({ git?, cwd? }): Tool` — `name: 'git_log'`; `requirements` como acima; `run({ path?, maxCount? })` chama `git.log(alvo, { maxCount })`.
  - **Diretório-alvo**: `args.path` (string não vazia) quando presente; na ausência, `cwd()` — provedor injetável nas deps (default `process.cwd`), para determinismo nos testes (molde do `now` do `clock`). O mesmo alvo é usado em `requirements` e em `run`.
  - **Saída de sucesso inclui o repositório inspecionado** (D11): o `output` do `ToolResult` traz o `repository` resolvido antes do texto do git.
  - Erro de IO (git ausente, alvo não é repositório, toplevel fora da raiz, exit ≠ 0, `maxBuffer` estourado, `path` inválido) → `ToolResult` de erro estruturado (`{ ok: false, error }`), **nunca lança**.
  - Descrições claras em cada Tool (o Planner seleciona por descrição), explicitando que são **somente-leitura**.
- **`@atlas/core`** — instanciar `nodeGitReadPort({ verify: permissions.isContained.bind(permissions) })` (mesma fiação já usada para `nodeFsReadPort`/`nodeFsWritePort`) e registrar as três Tools no Tool Registry. Nenhuma config nova.
- **Testes** (unit + integração) e documentação específica da SPEC (as docs vivas ficam com o passo `doc-sync` de fecho).

---

# Fora do Escopo

Esta seção é obrigatória.

- **Não** implementar nenhuma Tool de git que **mute** o repositório (`git_commit`/`git_checkout`/`git_push`/`git_add`/`git_reset`/`git_stash`/…). Mutação é ação destrutiva/`confirm`, fatia futura.
- **Não** introduzir **novo tipo de `access`** nem capacidade de **execução de comandos arbitrários**: o Roadmap (l. 100) reserva isso como fatia **separada** e `ADR primeiro`. O adaptador só executa subcomandos de git **fixos e hardcoded**, nunca um comando fornecido pelo modelo/usuário.
- **Não** alterar `@atlas/contracts`: `Tool`/`ActionRequest`/`ResourceRef`/`AccessMode` já bastam. Reusar `AccessMode: 'read'` e `ResourceType: 'directory'`; **não** criar `'repository'` como tipo de recurso nem `access` novo (D2).
- **Não** alterar o **Permission Service** (`@atlas/permissions`) nem o **Runtime** (`@atlas/runtime`): `evaluate` e `isContained` já existem e são reusados sem uma linha de mudança.
- **Não** fechar a janela **TOCTOU** do diretório-alvo: não há fd a ancorar num subprocesso. Residual **documentado** (ver "Residuais conhecidos" e D8), no mesmo critério com que o ADR-0014 deixou `list_dir` fora do fecho atômico.
- **Não** modelar o **contexto de ambiente** lido pelo Cognitive/Planner (cwd/repo/branch/arquivos abertos) — adiado desde o ADR-0009, `ADR primeiro` (Roadmap l. 101). Estas Tools são executadas pelo **Runtime quando o plano as escolhe**. **Se a implementação perceber necessidade de o Cognitive/Planner "saber" que está num repositório sem um passo de plano, pare e escale — é sinal de ADR.**
- **Não** implementar **leitura de estrutura de projeto** (detectar linguagem, manifests, scripts) — fatia candidata **separada** no mesmo item do Roadmap.
- **Não** parsear a saída do git em objetos tipados: as Tools devolvem o **texto** do git, e o modelo interpreta — como já ocorre com `read_file` (D6).
- **Não** oferecer opções ilimitadas de git (formato/ref/range arbitrários, `git diff <a>..<b>`, `git log <ref>`): apenas as opções bounded (`staged`, `maxCount`). Esta allowlist é o que mantém a fatia fora do território `ADR primeiro` de "execução de comandos" — **o teto de saída (D10) não pode ser resolvido abrindo refs/ranges**.
- **Não** adicionar comando de CLI novo (`atlas git …`) nem config nova.
- **Não** implementar Skills, comportamento **proativo**, Observação/Aprendizado novos, nem dependência de dados entre passos.

---

# Residuais conhecidos (documentados, não fechados)

Registrados aqui por exigência dos Artigos 1 e 7 (nada relevante fica só no código) e no mesmo critério de residual documentado do ADR-0014:

1. **Sem fecho atômico / TOCTOU do diretório-alvo.** O ADR-0014 fecha a janela ancorando a identidade de um **fd** (`open` + `O_NOFOLLOW` + `fstat`×`stat`). Aqui **não existe fd a ancorar**: quem lê é um **subprocesso** (`git`) e o alvo é um **diretório**. Entre o `verify` do toplevel e o `execFile` do subcomando, o diretório-alvo pode em tese ser trocado por um symlink apontando para fora da raiz. É o mesmo tipo de residual com que o ADR-0014 deixou **`list_dir`** fora do fecho atômico ("`opendir`, sem flags de `O_NOFOLLOW` na API de alto nível — fica fora, com residual documentado"). Fechá-lo exigiria `openat` por componente (addon nativo) e/ou ancoragem de fd em subprocesso — fora de escopo, candidato futuro.
2. **Troca de ancestral.** Idêntico ao residual já registrado no ADR-0014 para `delete_file`/`mkdir`: um diretório ancestral trocado na janela entre resolver o realpath e usar o alvo continua risco teórico.
3. **Windows.** Consistente com o ADR-0014 e a matriz de CI só-Linux (SPEC-0016), o comportamento em Windows fica fora de escopo.
4. **Estado do git fora da árvore de trabalho.** `--no-optional-locks` evita as escritas *opcionais* (refresh do stat cache do índice). A configuração global do usuário (`~/.gitconfig`) segue sendo lida pelo git, como em qualquer invocação — não é coberta pelo portão de `readRoots`.
5. **A recusa revela a existência e a localização de um repositório fora da raiz permitida.** A mensagem de recusa (`fora do diretório permitido: <toplevel>`) contém um caminho **descoberto** pelo `rev-parse --show-toplevel` — diferente das negações do `evaluate`, que só ecoam um path que o próprio chamador já forneceu. Um alvo dentro da raiz cujo repositório sobe até um toplevel fora dela expõe ao modelo (e, por extensão, ao usuário) que aquele diretório-pai existe e onde fica — um vazamento pequeno (um caminho, sem conteúdo), com contrapartida real de transparência (Artigo 7: dizer por que algo foi negado). Fato adjacente registrado pela mesma razão: o `rev-parse` **lê configuração de git acima da raiz permitida** (segue os mesmos ponteiros que qualquer `git` leria a partir do alvo) **antes** de o veredicto de contenção ser aplicado — a descoberta do toplevel é, por natureza, uma operação que acontece antes da barreira que a julga.

---

# Pré-requisitos

- [SPEC-0010](SPEC-0010-planner-runtime-tools.md) (Planner + Runtime + Tools + Tool Registry) — **Done**.
- [SPEC-0011](SPEC-0011-permission-service-fs-read.md) (Permission Service + Tools de leitura + portão) — **Done** (Fase 0 concluída, Roadmap l. 42).
- [SPEC-0017](SPEC-0017-toctou-atomic-enforcement.md) (fecho atômico; **origem do `verify` estreito e de `permissions.isContained`**) — **Done**.
- [SPEC-0024](SPEC-0024-fs-port-fail-closed-verify.md) (`verify` fail-closed por default) — **Done** (Roadmap l. 71).

---

# Critérios de Aceitação

Cada item é verificável mecanicamente.

**Contenção do repositório realmente lido (achado A)**

- `nodeGitReadPort({ verify, exec })` com `exec` fake: para cada um dos três métodos, a **primeira** invocação do fake é a descoberta de toplevel (`rev-parse --show-toplevel`), e o subcomando só é invocado **depois** de `verify` devolver `true`.
- `verify` que devolve `false` para o toplevel → o método erra com mensagem distinta contendo o toplevel, e o `exec` fake **não** é chamado para o subcomando (spy: exatamente 1 chamada, a de `rev-parse`).
- Caso-teste explícito do escape denunciado: alvo `/proj/packages/tools` cujo toplevel descoberto é `/proj`, com `verify` que só aprova `/proj/packages/tools` → **recusa** (o subcomando não roda). Sem a correção este caso passaria e vazaria `/proj`.
- `verify` **ausente** (porta crua) → fail-closed: recusa mesmo com toplevel válido (herança da SPEC-0024).
- O subcomando é executado com `cwd` = **toplevel verificado** (verificável no argumento passado ao `exec` fake).
- Alvo que não é repositório (fake do `rev-parse` falha) → `ToolResult` de erro; subcomando não roda.

**Não-escrita sob veredicto `read` (achado C)**

- Em **todas** as invocações de `exec` (inclusive a de `rev-parse`), o argv contém `--no-optional-locks` **antes** do subcomando — asserção sobre o argv capturado pelo fake, nos três métodos.
- Nenhum argv contém subcomando fora da allowlist `rev-parse` | `status` | `diff` | `log` (asserção mecânica sobre o argv).
- Nenhuma invocação usa `shell: true` (asserção sobre as opções passadas ao `exec` fake; e revisão do adaptador).

**Teto de saída (achado E)**

- `exec` fake que devolve saída acima de 64 KiB → `GitOutput.truncated === true`, `text` com comprimento ≤ 64 KiB + marcador de truncagem visível no texto; o `ToolResult` segue `ok: true`.
- Saída abaixo do teto → `truncated === false` e texto íntegro.
- As opções de `execFile` incluem `maxBuffer` explícito de 10 MiB (asserção sobre as opções capturadas pelo fake); `exec` fake que sinaliza estouro de `maxBuffer` → `ToolResult` de erro **estruturado** com mensagem própria (não opaca).

**Transparência do alvo (achado F)**

- Em cada Tool, no caminho de **sucesso** (inclusive com `args.path` ausente), o `output` do `ToolResult` contém o `repository` resolvido (o toplevel), além do texto do git — asserção de substring.

**Tools**

- `createGitStatusTool({ git, cwd })`: `requirements({ path: '<dir>' })` → `{ resource: { type: 'directory', path: '<dir>' }, access: 'read' }`; `requirements({})` → resource com o diretório do `cwd` fake injetado; `run({ path })` com git fake devolvendo `GitOutput` → `{ ok: true, output }`; git fake que lança → `{ ok: false, error }`; `path` presente porém não-string/vazio → `{ ok: false, error }` **sem** chamar o git fake.
- `createGitDiffTool`: `run({ staged: true })` invoca `git.diff(alvo, { staged: true })`; `run({})` invoca `git.diff(alvo, { staged: false })` (spy); erro do fake → `ToolResult` de erro.
- `createGitLogTool`: `run({ maxCount: 5 })` invoca `git.log(alvo, { maxCount: 5 })`; `run({})` invoca `git.log(alvo, { maxCount: 20 })` — o default é **20**; `maxCount` inválido (não inteiro positivo: `0`, `-3`, `'abc'`, `2.5`) **cai no default 20** e o fake **é** chamado com `{ maxCount: 20 }` (D5; sem disjunção); erro do fake → `ToolResult` de erro.
- Nenhuma das três Tools decide permissão: só declaram `requirements` e executam. `clock`/`calc` seguem sem `requirements`; as Tools de FS seguem inalteradas.

**Integração e invariantes**

- `@atlas/core`: as três Tools estão registradas no Tool Registry produzido por `createAtlas`, e `nodeGitReadPort` recebe `verify` derivado de `permissions.isContained` — verificável por teste de integração: repositório cujo toplevel está fora das `readRoots` produz passo negado e o git **não** roda.
- `atlas.cognitive.ask` executa, com git fake + gateway fake, um objetivo que seleciona `git_status` dentro da raiz e produz `steps` com sucesso.
- Nenhuma mudança em `@atlas/contracts` (diff vazio em `packages/contracts`), em `packages/permissions` nem em `packages/runtime` (diffs vazios).
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes.
- Lições registradas em `docs/implementation/LESSONS_LEARNED.md`; docs vivas sincronizadas no `doc-sync` de fecho, **incluindo os residuais conhecidos** em `packages/tools/CLAUDE.md`.

---

# Arquivos Esperados

```text
packages/tools/src/
  git-port.ts        # GitReadPort, GitOutput, ExecGit, nodeGitReadPort({ verify?, exec? })
  git-status.ts      # createGitStatusTool({ git?, cwd? })
  git-diff.ts        # createGitDiffTool({ git?, cwd? })
  git-log.ts         # createGitLogTool({ git?, cwd? })
  index.ts           # re-export das três Tools + GitReadPort/GitOutput/nodeGitReadPort
packages/tools/tests/
  git-port.test.ts   # ordem verify→subcomando; recusa; argv fixo; --no-optional-locks; truncagem; maxBuffer
  git-status.test.ts
  git-diff.test.ts
  git-log.test.ts

packages/core/src/index.ts   # nodeGitReadPort({ verify: permissions.isContained... }); registra as 3 Tools
packages/core/tests/         # integração: sucesso dentro da raiz; toplevel fora da raiz → passo negado

packages/tools/CLAUDE.md      # doc viva do package + residuais (passo doc-sync de fecho)
```

Lista é expectativa; pequenos ajustes são aceitáveis (ex.: um helper interno compartilhado de resolução de alvo entre as três Tools).

---

# Componentes Impactados

- **Tools** (`@atlas/tools`) — três Tools novas + `GitReadPort` interna (IO por `node:child_process`, com aplicação de veredicto sobre o toplevel).
- **Core** (`@atlas/core`) — registro das Tools e fiação do `verify` a partir de `permissions.isContained` (reusa a fiação já existente para as portas de FS); sem config nova.
- **Tool Registry / Planner / Runtime** — consomem as novas Tools pelo caminho existente; **sem** mudança de código.
- **Permission Service** — reusado como está (`evaluate` no pré-check do Runtime; `isContained` no instante do uso); **sem** mudança.

---

# Interfaces Necessárias

Interno a `@atlas/tools` (não sobe a `@atlas/contracts` — sem 2º consumidor real, mesmo critério de `FsReadPort`/`Verify`):

```ts
export interface GitOutput {
  /** Toplevel real (realpath) do repositório efetivamente inspecionado. */
  readonly repository: string;
  readonly text: string;
  readonly truncated: boolean;
}

export interface GitReadPort {
  status(cwd: string): Promise<GitOutput>;
  diff(cwd: string, opts?: { readonly staged?: boolean }): Promise<GitOutput>;
  log(cwd: string, opts?: { readonly maxCount?: number }): Promise<GitOutput>;
}

/** Execução de processo, injetável nos testes (sem git real). */
export type ExecGit = (
  args: readonly string[],
  options: { readonly cwd: string; readonly maxBuffer: number },
) => Promise<string>;

export interface NodeGitPortDeps {
  /** Veredicto de contenção sobre o toplevel real. Default fail-closed (SPEC-0024). */
  verify?: Verify; // (realpath: string, access: AccessMode) => boolean — já existe em fs-port.ts
  exec?: ExecGit;
}
```

`Verify` é **reusado** de `fs-port.ts` (não redefinir).

Deps das Tools:

```ts
export interface GitStatusDeps { git?: GitReadPort; cwd?: () => string; }
export interface GitDiffDeps   { git?: GitReadPort; cwd?: () => string; }
export interface GitLogDeps    { git?: GitReadPort; cwd?: () => string; }
```

Nenhuma interface de `@atlas/contracts` é adicionada ou alterada: as Tools produzem `ActionRequest` reusando `AccessMode: 'read'` e `ResourceRef { type: 'directory', path }` já existentes.

---

# Fluxo Esperado

```text
atlas ask "o que mudou no meu repositório?"        (readRoots = [/proj])
  ↓  1ª generate() → planner.parse → Plan { steps: [ git_status {} ] }
  ↓  runtime.execute(plan)
       ↓ requirements({}) → { resource:{type:'directory', path:<cwd>}, access:'read' }
       ↓ permissions.evaluate(req) → pré-check (1ª barreira) → { verdict:'allowed' }
       ↓ tool.run({}) → git.status(<cwd>)
            ↓ porta: git --no-optional-locks -C <cwd> rev-parse --show-toplevel → /proj
            ↓ porta: realpath(/proj) → verify('/proj','read')  (2ª barreira)  → true
            ↓ porta: git --no-optional-locks status  (cwd=/proj, maxBuffer 10MiB) → texto (≤64KiB)
       ↓ ToolResult { ok:true, output: "repositório: /proj\n<status>" }

atlas ask "o que mudou aqui?"   rodando em /proj/packages/tools
                                 (readRoots = [/proj/packages/tools])
  ↓  ... git_status { }
  ↓  permissions.evaluate → allowed (o diretório declarado ESTÁ contido)
  ↓  tool.run → porta descobre toplevel = /proj  →  verify('/proj','read') → FALSE
  ↓  subcomando NÃO roda → ToolResult { ok:false, error:'fora do diretório permitido: /proj' }
       (sem a 2ª barreira, o git relataria — e no diff imprimiria conteúdo de — todo /proj)
```

Autoridade: Permission Service **decide** (política de raiz, em `evaluate` e `isContained`); a porta **coleta o fato de uso** (toplevel real) e **aplica** o veredicto (ADR-0014); Runtime **coordena**; Tools **declaram** o que tocam e executam, sem decidir permissão; Cognitive **orquestra e responde**, sem conhecer permissão nem "repositório" fora de um passo do plano.

---

# Estratégia de Implementação

1. `git-port.ts`: `GitOutput`/`GitReadPort`/`ExecGit`; `nodeGitReadPort({ verify = () => false, exec })` com a sequência descoberta-de-toplevel → realpath → `verify` → subcomando; argv fixo com `--no-optional-locks`; `maxBuffer` explícito; truncagem com marcador.
2. Testes da porta com `exec` fake (spy de argv/opções): ordem das barreiras, recusa sem rodar subcomando, caso do subdiretório escapando para o toplevel, fail-closed sem `verify`, `--no-optional-locks` presente, truncagem, estouro de `maxBuffer`.
3. `git-status.ts`/`git-diff.ts`/`git-log.ts`: resolução de alvo (`args.path` ou `cwd()`), `requirements`, `run` com `ToolResult` incluindo `repository`; erros sempre estruturados; default/validação de `maxCount`.
4. Testes das Tools com `GitReadPort` fake.
5. `@atlas/core`: instanciar `nodeGitReadPort({ verify: permissions.isContained.bind(permissions) })` e registrar as três Tools; integração (sucesso dentro da raiz; toplevel fora → passo negado sem rodar git).
6. Documentação viva + residuais no fecho; lições; suíte completa.

---

# Estratégia de Testes

- **Porta** (`exec` fake com spy): sequência e curto-circuito das barreiras; argv exatamente allowlistado e com `--no-optional-locks`; `cwd` = toplevel verificado; sem `shell: true`; fail-closed sem `verify`; caso do subdiretório cujo toplevel está fora da raiz; truncagem em 64 KiB com marcador; `maxBuffer` explícito e estouro → erro estruturado; não-repositório → erro.
- **Tools** (`GitReadPort` fake): `requirements` correta (`access:'read'`, `type:'directory'`, alvo `args.path` ou `cwd()` fake); sucesso propaga texto **e** `repository`; erro do fake → `ToolResult` de erro, nunca lança; `path` inválido não chama a porta; `git_diff` repassa `staged`; `git_log` aplica default 20 e absorve `maxCount` inválido no default.
- **Core** (git fake + gateway fake): objetivo que seleciona `git_status` dentro da raiz → `steps` com sucesso; toplevel fora das `readRoots` → passo negado e git não roda; Tools de FS e puras seguem verdes.

---

# Definition of Done

- todos os critérios de aceitação atendidos;
- testes passando (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`);
- documentação viva atualizada no `doc-sync` de fecho (`packages/tools/CLAUDE.md` — Tools novas **e residuais conhecidos**; `CLAUDE.md` raiz; `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; nota no Roadmap 1.4). O `spec-implementer` toca só a documentação específica da SPEC;
- arquitetura preservada (Tools são adaptadores sem lógica de negócio nem decisão de permissão; a **decisão** de contenção continua só no Permission Service, a porta apenas aplica o veredicto — ADR-0014; contracts/permissions/runtime intactos; nenhum novo `access`; nenhuma execução de comando arbitrário; nenhuma escrita sob veredicto `read`; Cognitive não conhece "repositório" fora de um passo do plano);
- residuais conhecidos escritos na SPEC e na doc viva do package;
- revisão concluída;
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- Não criar módulos novos: as três Tools vivem em `@atlas/tools`, no Tool Registry existente.
- **Regras de Dependência**: `@atlas/tools` depende **só** de `@atlas/contracts` (Regra 5 — não depende do Cognitive Core nem de `@atlas/permissions`). `GitReadPort`/`GitOutput`/`ExecGit` são internos; `Verify` é reusado de `fs-port.ts`, não redefinido.
- A porta **não conhece raízes nem o Permission Service** — só o predicado `verify` injetado (invariante do ADR-0014). A **decisão** de contenção não migra para a porta nem para a Tool.
- O subcomando **nunca** roda antes de `verify` aprovar o toplevel real.
- Somente-leitura: só `rev-parse --show-toplevel`, `status`, `diff`, `log`, sempre com `--no-optional-locks`; nunca subcomando que muta o repo; nunca comando arbitrário.
- `execFile` com argv como array, **nunca** `shell: true`, nunca string de comando concatenada com entrada variável; `maxBuffer` sempre explícito.
- Não alterar `@atlas/contracts`, `@atlas/permissions` nem `@atlas/runtime`.
- As Tools **nunca lançam**: toda falha vira `ToolResult` de erro estruturado.
- Não modelar contexto de ambiente lido pelo Planner/Cognitive (ADR-0009); não cruzar para a fatia de "execução de comandos" (novo `access`, ADR futuro); não resolver o teto de saída abrindo refs/ranges arbitrários.

---

# Observações

- **Por que a 2ª barreira é indispensável:** o ADR-0013 rejeitou explicitamente a "capacidade estática sem path" porque *"o valor do portão está exatamente em julgar o recurso concreto"*. Um git ancorado só pelo `cwd` do processo filho recriaria esse defeito por outro caminho: o recurso **declarado** (subdiretório) não seria o recurso **lido** (toda a árvore acima dele). Verificar o toplevel real fecha essa distância.
- **Por que isso não abre ADR:** o mecanismo — a porta coleta um fato de uso e aplica um predicado estreito injetado, mantendo a decisão no Permission Service — é **exatamente** o que o ADR-0014 decidiu e o que `@atlas/core` já fia para as portas de FS. Aplicar decisão existente a uma porta nova não é decisão arquitetural nova.
- **Duas barreiras, como no FS:** `evaluate` (pré-check sobre o alvo declarado, no Runtime) + `verify` (sobre o toplevel real, na porta). Defesa em profundidade do ADR-0014; um bug numa não abre a outra.
- **`--no-optional-locks`:** `git status` pode atualizar o stat cache do índice e tomar lock — escrita real num repo onde `writeRoots` é vazio por default. A flag torna o comando honestamente somente-leitura, sustentando a premissa de D2.

---

# Checklist para IA

Antes de implementar: ler **ADR-0014** (predicado `verify` estreito; porta aplica veredicto sobre fato de uso; critério de residual documentado), ADR-0013 (portão puro; julgar o recurso concreto), SPEC-0017/SPEC-0024 (`verify` e fail-closed já implementados em `fs-port.ts` — **reusar o tipo `Verify`**), ADR-0012 (falha estruturada), ADR-0009 (contexto de ambiente fora), Module Catalog (Regra 5), SPEC-0011 (padrão a espelhar).

Durante: descobrir o toplevel e aplicar `verify` **antes** de qualquer subcomando; `--no-optional-locks` sempre; argv allowlistado, sem shell; `maxBuffer` explícito e truncagem sinalizada; incluir o repositório resolvido na saída; nunca lançar; sem tocar contracts/permissions/runtime; sem novo `access`; sem contexto de ambiente para o Planner; manter a fatia mínima.

Após: rodar a suíte; validar critérios; escrever os residuais na doc viva; registrar lições; concluir.

---

# Resultado Esperado

O Atlas ganha as **primeiras Tools da sua especialidade** — desenvolvimento de software — sem sair do envelope arquitetural já aceito: três adaptadores de git somente-leitura que o Planner seleciona quando o objetivo exige inspecionar um repositório, executados pelo Runtime atrás de **duas** barreiras de contenção (pré-check do `evaluate` sobre o alvo declarado; `verify` sobre o **toplevel real** do repositório, na porta, no molde do ADR-0014). `atlas ask "o que mudou aqui?"` num repositório contido na raiz permitida relata o estado real do git e diz **qual** repositório inspecionou; um repositório cujo toplevel escapa da raiz é negado com o motivo, e o git não chega a rodar. Nenhum contrato público muda, nenhum ADR é aberto, nenhum novo tipo de acesso ou execução de comando arbitrário é introduzido, e nada é escrito no repositório sob veredicto de leitura. Os residuais (TOCTOU do diretório-alvo, troca de ancestral, Windows) ficam **escritos**, no mesmo critério com que o ADR-0014 tratou `list_dir` — a plataforma segue pronta para as fatias seguintes de 1.4, com a decisão inteiramente rastreável nesta SPEC.

---

# Decisões de design

> Formato de veto (decisão + porquê + alternativa descartada). Atacadas pelo `architecture-reviewer` no gate `Draft → Ready`.
>
> **Estado após o 1º gate:** D1, D3, D4, D6, D7 aprovadas sem alteração. D2 **reescrita** (achados A e C). D5 **precisada** (achado D). D8/D9/D10/D11 **novas**, respondendo aos achados A/B, C, E e F.

## D1 — Perfil: `completo` *(aprovada no 1º gate)*

- **Decisão**: classificar a SPEC como `completo`.
- **Porquê**: falha em pelo menos três condições de `micro` — (a) **cria Tools** (três), que a definição exclui explicitamente; (b) toca `packages/tools/src` **e** `packages/core/src`; (c) carrega decisão de design não trivial. Na dúvida, `completo` (Emenda v1.2).
- **Alternativa descartada**: `micro` — criar Tool e tocar `@atlas/core` violam a fronteira do fast-path.

## D2 — `access: 'read'` no alvo declarado **+ contenção do toplevel real na porta** *(reescrita após o achado A)*

- **Decisão**: as Tools declaram `requirements` com `access: 'read'` sobre o diretório-alvo (pré-check do Runtime, 1ª barreira) **e** a porta descobre o **toplevel real do repositório** e aplica sobre ele `verify(realpath, 'read')` antes de rodar qualquer subcomando (2ª barreira). Toplevel fora das `readRoots` → recusa, subcomando não roda. Nenhum `access` novo, nenhum contrato alterado.
- **Porquê**: `status`/`diff`/`log` **não** são equivalentes a `list_dir` sem essa segunda barreira — `list_dir` nunca lê acima do path declarado, enquanto o git **sobe** pelos pais e passaria a relatar (e, no `diff`, imprimir conteúdo de) toda a árvore acima do alvo, inclusive do que `read_file` seria `blocked` de ler. Verificar o toplevel restaura a premissa do ADR-0013 de que *"o valor do portão está exatamente em julgar o recurso concreto"*, mantendo o regime `read`/`allowed`/`blocked` sem abrir contrato nem ADR.
- **Alternativa descartada**: declarar `access:'read'` no alvo e **parar aí**, confiando só no `cwd` do processo filho (redação original desta SPEC) — reprovada no gate: o recurso declarado não seria o recurso lido, um escape real. Também descartada: ancorar por `--git-dir`/`--work-tree` + `GIT_CEILING_DIRECTORIES`, exigindo que o alvo **seja** a raiz do repo — funciona, mas quebra o uso natural de rodar o Atlas de dentro de um subdiretório do próprio repositório permitido, e resolve por restrição o que o `verify` resolve por verificação, com precedente já aceito (ADR-0014). Também descartada: `AccessMode` novo (`'exec'`/`'git-read'`) ou `ResourceType: 'repository'` — tocaria `@atlas/contracts` e/ou revisitaria o ADR-0013.

## D3 — Invocar o binário `git` por porta injetável, subcomandos fixos *(aprovada no 1º gate)*

- **Decisão**: IO por `GitReadPort` interna, adaptador default sobre `execFile` (argv array, sem shell), com subcomandos **hardcoded**.
- **Porquê**: espelha "IO por porta injetável" do ADR-0013 — testável sem git real, adaptador sem lógica de negócio (Regra 5) — e mantém a fatia fora da capacidade de execução de comandos arbitrários, porque o modelo nunca escolhe o comando.
- **Alternativa descartada**: parsear `.git` diretamente (embute lógica pesada/frágil numa Tool, viola Regra 5); ou uma Tool genérica `run_command` (é exatamente a fatia `ADR primeiro` que o Roadmap reserva).

## D4 — Alvo: `args.path` ou `cwd` injetável *(aprovada no 1º gate; ADR-0009 não é cruzado)*

- **Decisão**: alvo é `args.path` (string não vazia) ou `cwd()` injetável (default `process.cwd`); mesmo alvo em `requirements` e `run`.
- **Porquê**: espelha as Tools de FS e a semente "raiz padrão = cwd" da SPEC-0011, mantém a seleção Planner-driven e dá determinismo nos testes. É o Runtime executando um passo do plano — não o Planner lendo ambiente —, logo não cruza o contexto de ambiente adiado no ADR-0009.
- **Alternativa descartada**: alvo sempre o `cwd` do processo (implícito, menos transparente, aproxima-se de "ler ambiente"); ou `path` obrigatório (atrita com "o repositório atual" e força o modelo a adivinhar).

## D5 — Opções bounded, com default fixo e absorção de valor inválido *(precisada após o achado D)*

- **Decisão**: `git_diff` aceita `staged?: boolean` (→ `--cached`); `git_log` aceita `maxCount?: number` (→ `--max-count=N`) com **default 20**; `maxCount` inválido (não inteiro positivo) **cai no default 20** — não produz erro. Nenhuma outra opção.
- **Porquê**: cobre os usos reais mantendo o adaptador allowlistado; absorver o valor inválido no default evita quebrar um objetivo inteiro por um argumento malformado do modelo (mesmo espírito de falha estruturada do ADR-0012), e fixar o número torna o critério mecanicamente verificável.
- **Alternativa descartada**: erro em `maxCount` inválido — transformaria um detalhe cosmético em falha de passo. Também descartada: expor formato/ref/range arbitrários — ampliaria a superfície para perto de execução de comando arbitrário.

## D6 — Saída em texto cru do git, sem parsing estruturado *(aprovada no 1º gate)*

- **Decisão**: as Tools devolvem o **texto** do git; o modelo interpreta na composição.
- **Porquê**: idêntico a `read_file`; sem lógica de negócio de parsing na Tool (Regra 5); o texto do git é estável e legível.
- **Alternativa descartada**: parsear em objetos tipados — embute lógica de negócio e antecipa estrutura que nenhum consumidor exige.

## D7 — Prioridade: `Medium` *(aprovada no 1º gate)*

- **Decisão**: prioridade `Medium`.
- **Porquê**: é `candidato` (não `gate`) no Roadmap 1.4 — entrega valor real e rastreável ao PRD/Vision, mas não bloqueia a conclusão da Fase 1. Acima de `Low` porque destrava a narrativa de "desenvolvimento de software", hoje sem nenhuma Tool concreta.
- **Alternativa descartada**: `High` — nenhum gate depende desta fatia; reservar `High` para o que bloqueia a fase mantém a sinalização honesta.

## D8 — Sem fecho atômico; residual de TOCTOU do diretório-alvo **documentado** *(nova, achados A e B)*

- **Decisão**: não implementar fecho atômico para as Tools de git; registrar explicitamente (seção "Residuais conhecidos" e doc viva do package) que o diretório-alvo pode em tese ser trocado entre o `verify` do toplevel e o `execFile`, além do residual de troca de ancestral e do não-suporte a Windows.
- **Porquê**: o fecho do ADR-0014 depende de ancorar a identidade de um **fd** (`open` + `O_NOFOLLOW` + `fstat`×`stat`); aqui quem lê é um **subprocesso** e o alvo é um **diretório** — não há fd a ancorar. É o mesmo critério com que o próprio ADR-0014 deixou **`list_dir`** fora do fecho, "com residual documentado". Deixar isso **escrito** (Artigos 1 e 7) é o que separa uma limitação consciente de uma omissão.
- **Alternativa descartada**: silenciar o tema (redação original, que não citava ADR-0014 nem SPEC-0024) — reprovada no gate: introduzir porta nova que toca o filesystem sem dizer o que fica aberto viola a documentação como fonte da verdade. Também descartada: fechar o TOCTOU nesta fatia — exigiria `openat` por componente / ancoragem de fd em subprocesso (addon nativo), maior que a fatia.

## D9 — `--no-optional-locks` obrigatório: nada é escrito sob veredicto `read` *(nova, achado C)*

- **Decisão**: todo argv de git começa com `--no-optional-locks`, inclusive na descoberta de toplevel; critério de aceitação assere a flag no argv capturado nos três métodos.
- **Porquê**: `git status` (e em menor grau `diff`) pode atualizar `.git/index` (refresh do stat cache) e tomar lock — escrita real num repositório onde `writeRoots` é vazio por default. Sem a flag, uma ação declarada `access:'read'` produziria escrita, e o gate **mentiria sobre o que a ação faz** (Artigo 8; ADR-0013 "não presumir consentimento"). A flag é o que sustenta a premissa de D2 de que estes subcomandos "só relatam".
- **Alternativa descartada**: declarar `access: 'write'` para `git_status` — exigiria `writeRoots` (opt-in de escrita) para uma operação que o usuário percebe como leitura, degradando usabilidade e honestidade do modelo de permissão. Também descartada: aceitar a escrita como efeito colateral tolerável — é exatamente a divergência entre veredicto e ação que o portão existe para impedir.

## D10 — Saída bounded: `maxBuffer` explícito + truncagem sinalizada *(nova, achado E)*

- **Decisão**: `execFile` com `maxBuffer` **explícito** de 10 MiB (estouro → `ToolResult` de erro estruturado, nunca falha opaca) e truncagem da saída capturada em **64 KiB**, com marcador visível no texto e `truncated: true` no `GitOutput`. Vale para os três subcomandos, `git_diff` inclusive.
- **Porquê**: D5 boundava `git_log` "para evitar saída gigante" mas deixava `git_diff` — o pior caso — sem teto, e o `maxBuffer` default de 1 MiB do `execFile` produziria erro opaco em repositório grande. Uma saída de diff sem teto vai inteira para a 2ª chamada de composição (custo de token e possível estouro de contexto). Teto uniforme + sinalização mantém a resposta honesta ("houve mais, foi cortado") sem ampliar a superfície de opções.
- **Alternativa descartada**: resolver o volume expondo refs/ranges arbitrários (`git diff <a>..<b>`, `git log <ref>`) — **explicitamente reprovada**: a allowlist de opções é o que mantém esta fatia fora do território `ADR primeiro` de "execução de comandos" (Roadmap l. 100). Também descartada: truncar silenciosamente, sem marcador — o modelo trataria um diff cortado como completo (viola transparência).

## D11 — A saída de sucesso informa o repositório inspecionado *(nova, achado F)*

- **Decisão**: `GitOutput.repository` carrega o toplevel real, e o `output` do `ToolResult` o inclui antes do texto do git, também (e sobretudo) quando `args.path` foi omitido.
- **Porquê**: sem isso, o caminho de sucesso nunca diz **qual** diretório foi inspecionado — o alvo resolvido só apareceria no motivo de um bloqueio. O Artigo 7 pede que o sistema explique o resultado, e o alvo é justamente o dado que o usuário não forneceu e não pode inferir.
- **Alternativa descartada**: deixar o alvo implícito na resposta — opacidade num caso em que o alvo foi escolhido pelo sistema, não pelo usuário. Também descartada: expor o alvo por um campo novo em `ToolResult` — tocaria `@atlas/contracts` sem necessidade; o texto do `output` basta.
