# Implementation Specification

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0056

---

**Título**

Tool de leitura de estrutura de projeto (`project_info`) em `@atlas/tools`, com a raiz descoberta pelo `rev-parse` já contido da SPEC-0028 e manifests reconhecidos por tabela fixa

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

Justificativa registrada nas "Decisões de design" (D10).

---

**Perfil**

- [ ] micro
- [x] completo

Justificativa registrada nas "Decisões de design" (D1).

---

**Item do Roadmap**

`Fase 1 — 1.4 Capacidades de Plataforma — Tools de desenvolvimento de software` (`candidato · SPEC direta`, `docs/04-engineering/Roadmap.md` l. 100), fatia **"leitura de estrutura de projeto (detectar linguagem, manifests, scripts)"** — nomeada explicitamente no item como a segunda das três fatias, ao lado da observação do `architecture-reviewer` de que "a descoberta de toplevel via `rev-parse` da SPEC-0028 é um candidato natural de reuso aqui". A primeira fatia (Tools de git somente-leitura) foi entregue pela [SPEC-0028](SPEC-0028-git-read-only-tools.md).

Esta SPEC **não fecha** o item 1.4 nem nenhum gate (o único gate de 1.4 — Skills — foi fechado pela SPEC-0025). Segue candidata a terceira fatia nomeada no mesmo item: **execução de comandos sob o Permission Service** (novo tipo de `access`, `ADR primeiro`). Também segue intocado o item vizinho `candidato · ADR primeiro` — "Contexto de ambiente que o Cognitive/Planner podem ler" (l. 101).

---

# Objetivo

Ao concluir esta SPEC, o Atlas passa a **reconhecer um projeto de software** — e não só arquivos soltos e o estado do git. Uma Tool nova fica disponível no Tool Registry e passa a ser selecionável pelo Planner quando o objetivo exigir saber "que projeto é este":

- `project_info` — descobre a **raiz do projeto**, lista os **manifests reconhecidos** presentes nessa raiz (com o ecossistema de cada um) e os **scripts declarados** no `package.json`, quando houver.

A Tool é um **adaptador puro** (Regra 5): declara, como dado, o recurso que toca (`requirements(args) → ActionRequest` com `access: 'read'` sobre o diretório-alvo), lê o disco pela porta injetável `FsReadPort` já existente e descobre a raiz pela porta injetável `GitReadPort` já existente. Não infere, não decide, não classifica além de uma **tabela fixa** de nome-de-arquivo → ecossistema: quem interpreta "qual é a linguagem principal deste projeto" continua sendo o modelo, na composição da resposta, exatamente como já ocorre com o texto cru do git (SPEC-0028/D6).

O ponto central desta fatia é a **descoberta da raiz**. Hoje, perguntar "que projeto é este?" rodando de dentro de `packages/tools` faria o Atlas listar aquele subdiretório e não achar nem `pnpm-workspace.yaml` nem os scripts da raiz. A Tool reusa o `rev-parse --show-toplevel` que a SPEC-0028 já implementou **com o veredicto de contenção aplicado sobre o toplevel** (`verify`, ADR-0014) — expondo-o como um método novo da `GitReadPort` interna, sem duplicar uma linha da descoberta nem afrouxar a barreira.

Essa ascensão acontece **apenas quando `path` é omitido** (alvo derivado do `cwd()`): um `path` explícito é honrado como declarado, sem subir para o repositório (D11) — é assim que `project_info({ path: 'packages/tools' })` descreve o subpacote, e não o monorepo inteiro. No caminho ascendente, quando não há repositório aplicável (não é repo, git ausente, toplevel fora das `readRoots`), a raiz **degrada para o diretório-alvo**. Em todos os casos a saída diz **qual** raiz foi usada e por quê, com um `origem da raiz` de conjunto **fechado** — cinco strings fixas, sem interpolar caminho descoberto nem stderr de subprocesso (D12).

Quando esta SPEC estiver concluída:

- `packages/tools` ganha `project_info`, a tabela pura de manifests reconhecidos e o método `toplevel(cwd)` na `GitReadPort` interna.
- `@atlas/core` registra a Tool, fiando as portas `fsRead`/`git` **que já existem** — nenhuma porta nova, nenhuma config nova, nenhuma flag nova.
- `atlas ask "que projeto é este?"` dentro de uma raiz permitida produz um plano que seleciona `project_info`, e a resposta descreve o projeto (raiz, manifests, ecossistemas, scripts) informando de qual diretório aquilo foi lido.

---

# Motivação

O **PRD** (seção **Desenvolvimento de Software**) abre com o requisito mais básico dessa especialidade: *"O sistema deve compreender projetos de software."* Também exige *"auxiliar na implementação de funcionalidades"*, *"revisar código"* e *"colaborar durante todo o ciclo de desenvolvimento"*. A **Vision** declara o desenvolvimento de software como a especialidade do Jarvis.

Hoje o Atlas tem `read_file`/`list_dir` (arquivos genéricos) e `git_status`/`git_diff`/`git_log` (estado do repositório). Falta o degrau entre os dois: **o que é este projeto**. Sem ele, para responder "como rodo os testes aqui?" o modelo precisa adivinhar — chamar `list_dir`, torcer para reconhecer `package.json`, chamar `read_file`, e ainda assim errar a raiz quando o Atlas roda de dentro de um subdiretório. É exatamente a lacuna que o **Roadmap** (1.4, l. 100) nomeia como fatia candidata: "leitura de estrutura de projeto (detectar linguagem, manifests, scripts)", classificada `SPEC direta` e prescrita para seguir "o padrão incremental das SPECs 0011–0013 (Tools + porta injetável)".

O mesmo item registra a observação do `architecture-reviewer` de que a descoberta de toplevel da SPEC-0028 é candidata natural de reuso aqui — e é: ela é a **única** peça do repositório que sabe achar a raiz de um projeto **e** já aplica o veredicto de contenção sobre ela. Reusá-la resolve o problema difícil desta fatia (achar a raiz sem escapar das raízes permitidas) sem inventar mecanismo novo, sem contrato novo e sem ADR.

A **proatividade** (Vision: "auxiliar no desenvolvimento de software de forma proativa") **não** está aqui — depende de Observação/Aprendizado (1.2) e provavelmente de Skills. Esta SPEC entrega só a capacidade.

Documentos originadores: **PRD** (Desenvolvimento de Software) + **Vision** + **Roadmap** 1.4 (l. 100) + **ADR-0013** (portão puro; requisitos como dado; IO por porta injetável) + **ADR-0014** (a porta coleta o fato de uso e aplica o veredicto no instante do uso) + **SPEC-0028** (precedente direto: descoberta de toplevel contida).

---

# Referências

- [PRD — seção Desenvolvimento de Software](../../02-product/ProductRequirementsDocument.md) ("o sistema deve compreender projetos de software")
- [Vision](../../01-vision/Vision.md) — especialidade do Jarvis (desenvolvimento de software)
- [Module Catalog — Tool Registry; Regra 5 (Tools são adaptadores, sem lógica de negócio nem decisão)](../../03-architecture/ModuleCatalog.md)
- [Architecture Constitution](../../00-project/ArchitectureConstitution.md) — Artigos 1 e 7 (nada relevante fica só no código; transparência do que foi feito), Emenda v1.1 (decisões deriváveis da documentação são do `spec-drafter`, atacadas no gate)
- [ADR-0013 — Permission Service: portão puro na execução](../../06-adr/ADR-0013-permission-service-execution-gate.md) (Tools declaram `requirements` como dado; IO por porta injetável; *"o valor do portão está exatamente em julgar o recurso concreto"*)
- [ADR-0014 — Fecho atômico de TOCTOU](../../06-adr/ADR-0014-toctou-atomic-enforcement.md) — origem do predicado estreito `verify(realpath, access)`; critério de **residual documentado** para operações sem fd a ancorar (`list_dir`)
- [ADR-0012 — Planner/Runtime/Tools](../../06-adr/ADR-0012-planner-runtime-execution.md) (falha estruturada por passo, nunca derruba a execução)
- [ADR-0009 — Context Service como store de valor](../../06-adr/ADR-0009-context-service-value-store.md) (fronteira: **contexto de ambiente** lido pelo Cognitive/Planner segue fora de escopo; esta SPEC não o cruza)
- [SPEC-0028](SPEC-0028-git-read-only-tools.md) — **precedente direto**: descoberta de toplevel + `verify` sobre o toplevel real; residuais de TOCTOU de diretório
- [SPEC-0011](SPEC-0011-permission-service-fs-read.md), [SPEC-0017](SPEC-0017-toctou-atomic-enforcement.md), [SPEC-0024](SPEC-0024-fs-port-fail-closed-verify.md) — `FsReadPort`, fecho atômico, `verify` fail-closed por default
- [SPEC-0055](SPEC-0055-http-get-network-access.md) — padrão mais recente de Tool nova (helper único de derivação de alvo compartilhado por `requirements` e `run`; saída bounded com marcador)
- [Roadmap — Fase 1, 1.4 Capacidades de Plataforma](../../04-engineering/Roadmap.md) (l. 100)

---

# Escopo

- **`@atlas/tools` — método novo na porta de git já existente** (`src/git-port.ts`):
  - `GitReadPort.toplevel(cwd: string): Promise<string>` — expõe, como método público da porta interna, a função `resolveRepository` que **já existe** dentro de `git-port.ts`: descobre o toplevel (`git --no-optional-locks -C <alvo> rev-parse --show-toplevel`), resolve o `realpath` e aplica `verify(toplevel, 'read')`. Devolve o toplevel verificado; **lança** quando não é repositório, quando o `realpath` falha ou quando `verify` recusa. **Nenhuma lógica nova**: é o mesmo caminho, agora nomeado.
  - `GitRootError extends Error` (novo, interno a `git-port.ts`, não exportado pelo `index.ts`): as três rejeições de `resolveRepository` passam a lançar essa classe, com **as mesmas mensagens de hoje, caractere a caractere**, mais um campo `readonly reason: 'no-repository' | 'resolve-failed' | 'denied'`. É o que permite ao consumidor classificar a falha **sem casar substring de mensagem** — pré-condição de D12.
  - `nodeGitReadPort` passa a expor `toplevel`; `status`/`diff`/`log` seguem **byte a byte** com o comportamento atual (mesmas mensagens, mesma ordem de chamadas — só a classe do erro lançado muda, e `Error` segue sendo supertipo).
- **`@atlas/tools` — helper de alvo renomeado** (`src/git-target.ts` → `src/target-dir.ts`; `resolveGitTarget` → `resolveTargetDirectory`): a resolução `args.path` (string não vazia) ou `cwd()` injetável deixa de ser "de git" porque passa a ter um segundo consumidor não-git. Renomeação **mecânica**, sem mudança de comportamento nem de assinatura; os três imports em `git-status.ts`/`git-diff.ts`/`git-log.ts` acompanham.
- **`@atlas/tools` — tabela pura de manifests** (`src/project-manifests.ts`, novo):
  - `PROJECT_MANIFESTS: readonly { file: string; ecosystem: string }[]` — tabela **fixa e ordenada**, casada por **nome exato de arquivo**, sem glob e sem recursão. Conteúdo exato (D5):

    | `file`                | `ecosystem`      |
    | --------------------- | ---------------- |
    | `package.json`        | `Node.js`        |
    | `pnpm-workspace.yaml` | `Node.js`        |
    | `tsconfig.json`       | `TypeScript`     |
    | `deno.json`           | `Deno`           |
    | `deno.jsonc`          | `Deno`           |
    | `pyproject.toml`      | `Python`         |
    | `requirements.txt`    | `Python`         |
    | `setup.py`            | `Python`         |
    | `Cargo.toml`          | `Rust`           |
    | `go.mod`              | `Go`             |
    | `pom.xml`             | `Java/JVM`       |
    | `build.gradle`        | `Java/JVM`       |
    | `build.gradle.kts`    | `Java/JVM`       |
    | `Gemfile`             | `Ruby`           |
    | `composer.json`       | `PHP`            |
    | `CMakeLists.txt`      | `C/C++`          |

  - `selectManifests(entries: readonly string[]): readonly ProjectManifest[]` — função **pura**: interseção da listagem do diretório com a tabela, devolvida **na ordem da tabela** (não na ordem do `readdir`), com casamento **sensível a maiúsculas/minúsculas**.
  - `listEcosystems(manifests): readonly string[]` — função **pura**: ecossistemas distintos, na ordem da tabela.
  - `extractPackageScripts(text: string): { ok: true; scripts: readonly string[]; truncated: boolean; total: number } | { ok: false; error: string }` — função **pura**: `JSON.parse` do `package.json`, chaves de `scripts` quando for objeto; JSON inválido, ausência da chave ou tipo inesperado devolvem `ok:false` com motivo (nunca lançam). `scripts` contém **no máximo `PROJECT_SCRIPT_LIMIT = 50` nomes reais** e **nunca** um marcador; a truncagem é sinalizada **fora** da lista, por `truncated`/`total` — molde do `GitOutput.truncated` que já existe no package (`git-port.ts`), pelo qual nenhum consumidor confunde marcador com dado (A3).
- **`@atlas/tools` — Tool nova** (`src/project-info.ts`, novo):
  - `createProjectInfoTool({ fs?, git?, cwd? }): Tool` — `name: 'project_info'`.
  - `requirements({ path? })` → `{ resource: { type: 'directory', path: <alvo> }, access: 'read' }`, com o alvo derivado pelo **mesmo** `resolveTargetDirectory` usado em `run` (alvo inválido → `path: ''`, e o portão bloqueia; `requirements` nunca devolve `null`).
  - `run({ path? })` executa, nesta ordem:
    1. resolve o alvo (`args.path` não-vazio, ou `cwd()`); alvo inválido → `ToolResult` de erro **sem** tocar porta alguma;
    2. **só quando `path` foi omitido** (alvo veio do `cwd()`): tenta `git.toplevel(alvo)`; sucesso → raiz = toplevel verificado, origem `repositório git`; **qualquer** falha → raiz = alvo, origem `diretório alvo (<motivo normalizado>)` (D3/D12). Com `path` explícito, `git` **não é chamado** e a raiz é o próprio alvo, origem `diretório informado` (D11);
    3. `fs.readdir(raiz)` → `selectManifests` → `listEcosystems`; falha de IO → `ToolResult` de erro;
    4. quando `package.json` está entre os manifests: `fs.readFile(join(raiz, 'package.json'))` → `extractPackageScripts`; **qualquer** falha (IO ou parse) vira uma **linha de aviso** na saída, não um erro do passo (D6);
    5. devolve `{ ok: true, output }` com um relatório de texto determinístico.
  - `origem da raiz` é um **conjunto fechado de cinco strings literais**, sem nenhuma interpolação (D12):

    | origem                                                    | quando                                              |
    | --------------------------------------------------------- | --------------------------------------------------- |
    | `repositório git`                                          | `path` omitido, toplevel descoberto e verificado    |
    | `diretório informado`                                      | `path` explícito (sem ascensão, `git` não chamado)  |
    | `diretório alvo (sem repositório git)`                      | `reason: 'no-repository'`                           |
    | `diretório alvo (repositório fora do diretório permitido)`  | `reason: 'denied'`                                  |
    | `diretório alvo (falha ao resolver o repositório)`          | `reason: 'resolve-failed'` **e** qualquer erro não classificado (fallback exaustivo) |

  - Formato do relatório (linhas fixas, verificáveis por substring):

    ```text
    raiz: /proj
    origem da raiz: repositório git
    manifests:
    - package.json (Node.js)
    - tsconfig.json (TypeScript)
    ecossistemas: Node.js, TypeScript
    scripts (package.json):
    - build
    - test
    ```

    Sem manifests reconhecidos → `manifests: (nenhum manifest reconhecido na raiz)` e nenhuma linha de `ecossistemas`. Sem `package.json` → nenhuma seção de scripts. Com `package.json` sem `scripts` utilizáveis → `scripts (package.json): (não foi possível ler os scripts: <motivo>)`. Com mais de 50 scripts, os 50 nomes saem como itens `- <nome>` e a truncagem sai numa **linha própria** logo após a lista, fora dela: `(lista truncada: 50 de <total> scripts)` (A3).
  - Descrição clara (o Planner seleciona por descrição), explicitando: somente-leitura; olha **só a raiz** (sem recursão); **omitir `path` para descrever o projeto do diretório corrente — só então a raiz sobe para o repositório git; informar `path` para descrever exatamente aquele diretório** (D11).
  - A Tool **nunca lança**: toda falha vira `ToolResult` estruturado.
- **`@atlas/core`** — registrar `createProjectInfoTool({ fs: fsRead, git })` no Tool Registry, reusando as portas `fsRead`/`git` **já compostas** em `createAtlas` (que já recebem `verify: permissions.isContained`). Nenhuma porta nova, nenhuma config nova, nenhum dep novo em `CreateAtlasDeps`.
- **Testes** (unit + integração) e documentação específica da SPEC (as docs vivas ficam com o passo `doc-sync` de fecho).

---

# Fora do Escopo

Esta seção é obrigatória.

- **Não** criar porta nova. `FsReadPort` (leitura/listagem) e `GitReadPort` (descoberta de raiz) já existem e bastam; a única mudança de superfície é o método `toplevel` na `GitReadPort` interna.
- **Não** alterar `@atlas/contracts`: `Tool`/`ActionRequest`/`ResourceRef`/`AccessMode` bastam. Reusar `access: 'read'` e `ResourceType: 'directory'`; **não** criar `'project'`/`'repository'` como tipo de recurso, nem `access` novo.
- **Não** alterar `@atlas/permissions` nem `@atlas/runtime` (diffs vazios): `evaluate` e `isContained` são reusados sem uma linha de mudança.
- **Não** alterar o comportamento de `git_status`/`git_diff`/`git_log`, nem de `nodeGitReadPort.status/diff/log` — a mudança na porta é **aditiva** (um método novo) mais a renomeação mecânica do helper de alvo.
- **Não** varrer o projeto recursivamente, nem por glob, nem por profundidade configurável: **só a raiz**, só nomes exatos da tabela. Um subprojeto de monorepo exige uma chamada nova com `path` explícito — que é honrado sem ascensão justamente para que essa chamada funcione dentro de um repositório git (D11).
- **Não** ler o **conteúdo** de nenhum manifest além do `package.json` (e desse, só a lista de chaves de `scripts`). Nada de TOML/YAML/XML: parsers desses formatos seriam **dependência nova** (Requisito Não Funcional "minimizar dependências desnecessárias").
- **Não** extrair de `package.json` nada além dos nomes dos scripts (sem `name`/`version`/`dependencies`/`engines`) — cada campo extra é decisão de produto, não desta fatia.
- **Não** declarar "a linguagem principal do projeto é X": a Tool reporta manifests e ecossistemas observados; a inferência é do modelo (Regra 5; mesma postura de SPEC-0028/D6).
- **Não** detectar framework, gerenciador de pacotes efetivo, versão de runtime, lockfile, ferramenta de CI ou layout de diretórios.
- **Não** implementar **execução de comandos** (rodar `pnpm test` porque o script existe): é a terceira fatia do item 1.4, `ADR primeiro` (novo tipo de `access`, exigirá `confirm`).
- **Não** modelar **contexto de ambiente** lido pelo Cognitive/Planner (cwd/repo/branch/projeto ativo) — adiado desde o ADR-0009, `ADR primeiro` (Roadmap l. 101). Esta Tool é executada pelo **Runtime quando o plano a escolhe**. **Se a implementação perceber necessidade de o Cognitive/Planner "saber" em que projeto está sem um passo de plano, pare e escale — é sinal de ADR.**
- **Não** fechar os residuais de TOCTOU herdados (`readdir`/diretório-alvo): documentados abaixo, no mesmo critério do ADR-0014 e da SPEC-0028.
- **Não** adicionar comando de CLI (`atlas project …`), painel de desktop, config nova, flag nova ou variável de ambiente nova.
- **Não** implementar Skills, comportamento proativo, memória de projeto automática (a categoria `project` do `@atlas/memory` existe desde a SPEC-0029 e **não** é alimentada por esta Tool), nem dependência de dados entre passos.

---

# Residuais conhecidos (documentados, não fechados)

Registrados por exigência dos Artigos 1 e 7, no mesmo critério de residual documentado do ADR-0014 e da SPEC-0028:

1. **`readdir` sem fecho atômico.** A listagem da raiz usa `FsReadPort.readdir`, que — desde a SPEC-0017 — **não** passa pelo fecho atômico nem pelo `verify` no instante do uso (residual explícito do ADR-0014 para `list_dir`). A contenção da listagem vem do pré-check `evaluate` sobre o alvo declarado e, no caminho ascendente, do `verify` aplicado ao toplevel **dentro** da porta de git. A leitura do `package.json` (`readFile`), essa sim, tem o fecho atômico completo (O_NOFOLLOW + identidade do fd + `verify`).
2. **TOCTOU do diretório-alvo / troca de ancestral.** Idêntico ao residual 1 e 2 da SPEC-0028: entre resolver a raiz e listá-la, o diretório pode em tese ser trocado por um symlink apontando para fora da raiz permitida. Não há fd de diretório a ancorar.
3. **A raiz efetiva pode ser um ancestral do recurso declarado — só no caminho ascendente.** Com `path` explícito (D11) não há assimetria: o recurso declarado em `requirements` é exatamente o lido. Com `path` omitido, `requirements` declara o `cwd()` (o que o pré-check julga) e a leitura pode ocorrer no **toplevel** descoberto, acima dele; quem fecha essa distância é o `verify` aplicado ao toplevel dentro da porta (mesmo desenho da SPEC-0028/D2), e a saída informa qual raiz foi usada. A assimetria "recurso declarado ≠ recurso lido" permanece nesse caminho, coberta pela segunda barreira, não eliminada.
4. **A degradação não diz *qual* repositório foi recusado.** Contrapartida deliberada de D12: o motivo é uma das cinco strings fechadas, sem o toplevel descoberto e sem stderr do git — o que **elimina**, nesta Tool, o vazamento do residual 5 da SPEC-0028, mas custa detalhe ao usuário (ele sabe que existe um repositório fora da raiz permitida, não onde). O `rev-parse` continua rodando (e lendo configuração de git) acima da raiz permitida antes do veredicto, exatamente como na SPEC-0028; e `git_status`/`git_diff`/`git_log` seguem expondo o toplevel recusado nas mensagens deles, inalteradas.
5. **Sem teto de tamanho na leitura do `package.json`.** `FsReadPort.readFile` não tem limite de bytes (residual pré-existente de `read_file`, não introduzido aqui). O teto desta SPEC é sobre a **saída**: no máximo 50 nomes de script, com marcador.
6. **Conteúdo de terceiro no prompt.** Nomes de script vindos de um `package.json` são strings arbitrárias que entram na composição — mesma superfície que `read_file` já abre para qualquer arquivo do projeto. Não é superfície nova (diferente do corpo remoto do `http_get`, SPEC-0055), mas fica registrado.
7. **Tabela fixa, cobertura parcial.** Ecossistemas fora da tabela (Swift, Elixir, .NET/`*.csproj`, Dart/Flutter, Nix…) não são reconhecidos — o relatório dirá "nenhum manifest reconhecido" num projeto real desses. Ampliar a tabela é fatia aditiva futura (uma linha por ecossistema), deliberadamente fora daqui.
8. **Windows.** Consistente com o ADR-0014, a SPEC-0028 e a matriz de CI só-Linux (SPEC-0016), o comportamento em Windows fica fora de escopo.
9. **Um `path` supérfluo do Planner desliga a ascensão.** Consequência aceita de D11: se o modelo emitir `project_info { path: '.' }` (ou o caminho do subdiretório corrente) quando queria o projeto inteiro, a Tool descreve aquele diretório, não o repositório. Mitigação, não fecho: a descrição da Tool diz explicitamente quando omitir `path`, e a saída sempre carrega `origem da raiz: diretório informado`, o que dá ao modelo o sinal para repetir a chamada sem `path`. Nenhum mecanismo automático de segunda tentativa entra aqui.

---

# Pré-requisitos

- [SPEC-0010](SPEC-0010-planner-runtime-tools.md) (Planner + Runtime + Tools + Tool Registry) — **Done**.
- [SPEC-0011](SPEC-0011-permission-service-fs-read.md) (Permission Service + `FsReadPort` + portão de leitura) — **Done**.
- [SPEC-0017](SPEC-0017-toctou-atomic-enforcement.md) (fecho atômico; origem do `verify` estreito e de `permissions.isContained`) — **Done**.
- [SPEC-0024](SPEC-0024-fs-port-fail-closed-verify.md) (`verify` fail-closed por default) — **Done**.
- [SPEC-0028](SPEC-0028-git-read-only-tools.md) (`GitReadPort`, descoberta de toplevel contida, helper de alvo) — **Done** (verificado no arquivo da SPEC: `- [x] Done`).

---

# Critérios de Aceitação

Cada item é verificável mecanicamente.

**Porta de git — método `toplevel` aditivo**

- `nodeGitReadPort({ verify, exec, realpath }).toplevel(alvo)` devolve o toplevel **verificado**, e o `exec` fake é chamado **exatamente uma vez**, com argv `['--no-optional-locks', 'rev-parse', '--show-toplevel']` e `cwd` = alvo.
- `verify` que devolve `false` → `toplevel` **rejeita** com mensagem contendo `fora do diretório permitido: <toplevel>` e `reason === 'denied'`.
- `toplevel` **sem** `verify` injetado (porta crua) → rejeita (fail-closed, herança da SPEC-0024).
- Alvo que não é repositório (fake do `rev-parse` falha) → rejeita com a mensagem de "não foi possível localizar um repositório git" e `reason === 'no-repository'`; `realpath` falhando → `reason === 'resolve-failed'`.
- Os três erros são instâncias de `GitRootError` (`instanceof Error` também verdadeiro) e as **mensagens** dos três são idênticas às atuais (asserção de igualdade exata contra as strings de hoje, não `toContain`).
- Regressão: os testes existentes de `status`/`diff`/`log` seguem verdes **sem alteração de expectativa** (só os fakes de `GitReadPort` ganham o método novo).

**Helper de alvo renomeado**

- `packages/tools/src/git-target.ts` **não existe** mais; `packages/tools/src/target-dir.ts` exporta `resolveTargetDirectory` com a mesma assinatura e o mesmo comportamento (`path` ausente → `cwd()`; `path` não-string ou vazio → `ok:false`).
- `git-status.ts`/`git-diff.ts`/`git-log.ts` importam de `./target-dir.js`; nenhuma outra mudança nesses três arquivos (diff mecânico).

**Tabela e funções puras**

- `PROJECT_MANIFESTS` contém **exatamente** as 16 linhas da tabela do Escopo, nessa ordem (asserção sobre a lista de `file`).
- `selectManifests(['tsconfig.json', 'README.md', 'package.json'])` → `[package.json, tsconfig.json]` — **ordem da tabela**, não do argumento; entradas não reconhecidas ignoradas.
- Casamento é sensível a caixa: `selectManifests(['Package.json'])` → `[]`.
- `listEcosystems` deduplica preservando a ordem da tabela: manifests `[package.json, pnpm-workspace.yaml, tsconfig.json]` → `['Node.js', 'TypeScript']`.
- `extractPackageScripts('{"scripts":{"build":"x","test":"y"}}')` → `{ ok:true, scripts:['build','test'], truncated:false, total:2 }`.
- `extractPackageScripts` com JSON inválido, sem chave `scripts`, ou com `scripts` não-objeto (`"scripts": []`, `"scripts": null`, `"scripts": "x"`) → `{ ok:false, error }`, **sem lançar**.
- `extractPackageScripts` com 60 scripts → `scripts.length === 50`, `truncated:true`, `total:60`, e **todo** item de `scripts` é um nome real do JSON de entrada (asserção explícita de que nenhum item é marcador de truncagem); com exatamente 50 → `scripts.length === 50`, `truncated:false`, `total:50`; com 49 → `truncated:false`.
- Renderização: com 60 scripts, `output` contém exatamente 50 linhas iniciadas por `- ` na seção de scripts, seguidas da linha `(lista truncada: 50 de 60 scripts)`; com 50 ou menos, `output` **não** contém `lista truncada`.

**Tool `project_info`**

- `requirements({ path: '/dir' })` → `{ resource: { type: 'directory', path: '/dir' }, access: 'read' }`; `requirements({})` → resource com o diretório do `cwd` fake injetado; `requirements({ path: 42 })` → `{ resource: { type: 'directory', path: '' }, access: 'read' }` (nunca `null`).
- `run({ path: 42 })` / `run({ path: '  ' })` → `{ ok:false, error }` **sem** chamar `fs` nem `git` (spies com zero chamadas).
- Caminho feliz com git, **`path` omitido**: `run({})` com `cwd` fake `/proj/packages/tools`, `git.toplevel` fake devolvendo `/proj`, `fs.readdir('/proj')` devolvendo `['package.json','tsconfig.json','src']` e `fs.readFile('/proj/package.json')` devolvendo scripts → `output` contém `raiz: /proj`, `origem da raiz: repositório git`, `- package.json (Node.js)`, `- tsconfig.json (TypeScript)`, `ecossistemas: Node.js, TypeScript` e os nomes de script; `git.toplevel` foi chamado **uma vez com `/proj/packages/tools`**; `fs.readdir` foi chamado com `/proj` (não com o `cwd`).
- **`path` explícito dentro de um repositório git (D11)**: `run({ path: '/proj/packages/tools' })` com o **mesmo** `git.toplevel` fake que resolveria `/proj` → `git.toplevel` tem **zero chamadas** (spy), `fs.readdir` foi chamado com `/proj/packages/tools`, e `output` contém `raiz: /proj/packages/tools` e `origem da raiz: diretório informado`; `output` **não** contém `repositório git`.
- Degradação (**só com `path` omitido**): `cwd` fake `/proj/packages/tools`, `git.toplevel` **rejeita** com `GitRootError` de `reason: 'denied'` → `ok: true`, `output` contém `raiz: /proj/packages/tools` e `origem da raiz: diretório alvo (repositório fora do diretório permitido)`; `fs.readdir` foi chamado com **`/proj/packages/tools`** e **nunca** com `/proj`.
- Degradação por `reason: 'no-repository'` → `origem da raiz: diretório alvo (sem repositório git)`; por `reason: 'resolve-failed'` → `origem da raiz: diretório alvo (falha ao resolver o repositório)`; em ambos, raiz = alvo e `ok: true`.
- **Saída determinística (D12)**: `git.toplevel` rejeitando com um erro **comum** (`new Error('boom: /segredo/fora/da/raiz')`, sem `reason`) → `origem da raiz: diretório alvo (falha ao resolver o repositório)`, e `output` **não** contém `boom` nem `/segredo/fora/da/raiz`. A linha `origem da raiz:` produzida pela Tool pertence, em todos os testes, ao conjunto fechado de cinco strings (asserção contra a lista literal).
- Raiz sem manifests reconhecidos → `ok: true`, `output` contém `manifests: (nenhum manifest reconhecido na raiz)` e **não** contém a palavra `ecossistemas:`; `fs.readFile` **não** é chamado.
- Sem `package.json` entre os manifests (ex.: só `Cargo.toml`) → `fs.readFile` **não** é chamado; nenhuma seção de scripts na saída.
- `fs.readFile` do `package.json` falhando, ou conteúdo inválido → `ok: true` (o passo **não** falha), com `scripts (package.json): (não foi possível ler os scripts: <motivo>)` na saída.
- `fs.readdir` falhando → `{ ok:false, error }` com mensagem contendo a raiz; a Tool **nunca lança** em nenhum dos casos acima (asserção `resolves`, não `rejects`).
- A Tool não decide permissão: só declara `requirements` e executa. `clock`/`calc` seguem sem `requirements`; as demais Tools seguem inalteradas.

**Integração e invariantes**

- `@atlas/core`: `project_info` está registrada no Tool Registry produzido por `createAtlas`, composta com as **mesmas** instâncias `fsRead`/`git` já usadas pelas outras Tools (verificável por injeção de fakes em `CreateAtlasDeps.fsRead`/`git`).
- Teste de integração: com `git` real (`nodeGitReadPort({ verify })`) cujo toplevel está **fora** das `readRoots`, `project_info` sobre um alvo **dentro** das raízes degrada para o alvo e nunca lista o toplevel proibido.
- `atlas.cognitive.ask` executa, com fakes de gateway/fs/git, um objetivo que seleciona `project_info` e produz `steps` com sucesso.
- Nenhuma mudança em `@atlas/contracts`, `packages/permissions`, `packages/runtime`, `apps/cli` nem `apps/desktop` (diffs vazios).
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` verdes na raiz.
- Lições registradas em `docs/implementation/LESSONS_LEARNED.md`; docs vivas sincronizadas no `doc-sync` de fecho, **incluindo os residuais conhecidos** em `packages/tools/CLAUDE.md`.

---

# Arquivos Esperados

```text
packages/tools/src/
  project-manifests.ts   # PROJECT_MANIFESTS, selectManifests, listEcosystems,
                         # extractPackageScripts, PROJECT_SCRIPT_LIMIT (puros)
  project-info.ts        # createProjectInfoTool({ fs?, git?, cwd? })
  target-dir.ts          # renomeado de git-target.ts (resolveTargetDirectory)
  git-port.ts            # + toplevel(cwd) na GitReadPort e em nodeGitReadPort
  git-status.ts          # só o import do helper renomeado
  git-diff.ts            # idem
  git-log.ts             # idem
  index.ts               # re-export de createProjectInfoTool + ProjectInfoDeps

packages/tools/tests/
  project-manifests.test.ts   # tabela, seleção, ordem, dedup, scripts, truncagem
  project-info.test.ts        # requirements, caminho feliz, degradação, erros
  git-port.test.ts            # + testes de toplevel (verify, fail-closed, não-repo)
  git-status.test.ts          # fakes de GitReadPort ganham toplevel
  git-diff.test.ts            # idem
  git-log.test.ts             # idem

packages/core/src/index.ts    # registra project_info com fsRead/git já compostos
packages/core/tests/create-atlas.test.ts   # registro + integração + degradação

packages/tools/CLAUDE.md      # doc viva do package + residuais (passo doc-sync de fecho)
```

Lista é expectativa; pequenos ajustes são aceitáveis (ex.: as funções puras nascerem num único módulo em vez de dois).

---

# Componentes Impactados

- **Tools** (`@atlas/tools`) — uma Tool nova (`project_info`), um módulo puro novo (tabela de manifests), um método aditivo na `GitReadPort` interna, renomeação mecânica do helper de alvo.
- **Core** (`@atlas/core`) — registro da Tool nova, reusando as portas já compostas; sem config nova, sem dep novo.
- **Tool Registry / Planner / Runtime** — consomem a Tool nova pelo caminho existente; **sem** mudança de código.
- **Permission Service** — reusado como está (`evaluate` no pré-check; `isContained` como `verify` na porta de git e na de FS); **sem** mudança.

---

# Interfaces Necessárias

Interno a `@atlas/tools` (nada sobe a `@atlas/contracts`):

```ts
// git-port.ts — aditivo
export interface GitReadPort {
  toplevel(cwd: string): Promise<string>; // NOVO: raiz verificada; lança se não houver
  status(cwd: string): Promise<GitOutput>;
  diff(cwd: string, opts?: { readonly staged?: boolean }): Promise<GitOutput>;
  log(cwd: string, opts?: { readonly maxCount?: number }): Promise<GitOutput>;
}

// project-manifests.ts — puro, sem IO
export interface ProjectManifest {
  readonly file: string;
  readonly ecosystem: string;
}
export const PROJECT_MANIFESTS: readonly ProjectManifest[];
export const PROJECT_SCRIPT_LIMIT = 50;
export function selectManifests(entries: readonly string[]): readonly ProjectManifest[];
export function listEcosystems(manifests: readonly ProjectManifest[]): readonly string[];
export function extractPackageScripts(
  text: string,
): { readonly ok: true; readonly scripts: readonly string[] } | { readonly ok: false; readonly error: string };

// project-info.ts
export interface ProjectInfoDeps {
  fs?: FsReadPort;
  git?: GitReadPort;
  cwd?: () => string;
}
export function createProjectInfoTool(deps?: ProjectInfoDeps): Tool;

// target-dir.ts — renomeado, assinatura idêntica
export function resolveTargetDirectory(
  args: Record<string, unknown>,
  cwd: () => string,
): GitTargetOk | GitTargetError; // tipos mantidos, podendo ser renomeados para TargetOk/TargetError
```

Nenhuma interface de `@atlas/contracts` é adicionada ou alterada: a Tool produz `ActionRequest` reusando `AccessMode: 'read'` e `ResourceRef { type: 'directory', path }` já existentes.

---

# Fluxo Esperado

```text
atlas ask "que projeto é este e como rodo os testes?"     (readRoots = [/proj])
                                                           rodando em /proj/packages/tools
  ↓ 1ª generate() → planner.parse → Plan { steps: [ project_info {} ] }
  ↓ runtime.execute(plan)
      ↓ requirements({}) → { resource:{type:'directory', path:'/proj/packages/tools'}, access:'read' }
      ↓ permissions.evaluate(req) → pré-check (1ª barreira) → { verdict:'allowed' }
      ↓ tool.run({})
           ↓ git.toplevel('/proj/packages/tools')
                ↓ rev-parse --show-toplevel → /proj → realpath → verify('/proj','read') (2ª barreira) → true
           ↓ raiz = /proj  (origem: repositório git)
           ↓ fs.readdir('/proj') → ['package.json','pnpm-workspace.yaml','tsconfig.json','docs',...]
           ↓ selectManifests → [package.json (Node.js), pnpm-workspace.yaml (Node.js), tsconfig.json (TypeScript)]
           ↓ fs.readFile('/proj/package.json')  (fecho atômico: O_NOFOLLOW + fd + verify)
           ↓ extractPackageScripts → ['lint','format','typecheck','test','build']
      ↓ ToolResult { ok:true, output: "raiz: /proj\norigem da raiz: repositório git\nmanifests:..." }
  ↓ 2ª generate() → resposta em linguagem natural, dizendo de qual raiz leu

mesmo comando, com readRoots = [/proj/packages/tools]
  ↓ tool.run({}) → git.toplevel → verify('/proj','read') → FALSE → rejeita
  ↓ degradação: raiz = /proj/packages/tools, origem = diretório alvo (repositório fora do diretório permitido)
  ↓ fs.readdir('/proj/packages/tools')  →  nunca toca /proj
  ↓ ToolResult { ok:true, output: "... (manifests do subdiretório) ..." }
```

Autoridade: Permission Service **decide** (política de raiz, em `evaluate` e `isContained`); a porta de git **coleta o fato de uso** (toplevel real) e **aplica** o veredicto (ADR-0014); a porta de FS aplica o veredicto no instante do uso em `readFile`; Runtime **coordena**; a Tool **declara** o que toca e executa, sem decidir permissão; Cognitive **orquestra e responde**, sem conhecer "projeto" fora de um passo do plano.

---

# Estratégia de Implementação

1. `git-port.ts`: expor `toplevel(cwd)` no tipo `GitReadPort` e em `nodeGitReadPort` (delegando a `resolveRepository`, sem duplicar nada); ajustar `withRepository` para reusar o mesmo caminho.
2. Testes de `toplevel` na `git-port.test.ts` (verify true/false, fail-closed sem verify, não-repositório, argv/`cwd` do `rev-parse`); atualizar os fakes de `GitReadPort` nos testes das três Tools de git.
3. Renomear `git-target.ts` → `target-dir.ts` e `resolveGitTarget` → `resolveTargetDirectory`; atualizar os três imports. Suíte verde antes de seguir.
4. `project-manifests.ts`: tabela + `selectManifests`/`listEcosystems`/`extractPackageScripts`/`PROJECT_SCRIPT_LIMIT`, todos puros; testes exaustivos das funções puras (sem IO).
5. `project-info.ts`: composição do fluxo (alvo → `toplevel` com degradação → `readdir` → seleção → scripts opcionais → relatório); erros sempre estruturados; nunca lançar.
6. Testes da Tool com `FsReadPort`/`GitReadPort` fakes e spies de chamada (garantindo o alvo efetivo do `readdir` em cada caminho).
7. `@atlas/core`: registrar a Tool com `fs: fsRead`/`git`; integração (registro, caminho feliz, degradação com toplevel fora das raízes).
8. Documentação viva + residuais no fecho; lições; suíte completa na raiz.

---

# Estratégia de Testes

- **Porta de git**: `toplevel` com `exec`/`realpath` fakes — argv exato, `cwd` do `rev-parse`, `verify` aprovando/recusando, fail-closed sem `verify`, não-repositório; regressão de `status`/`diff`/`log` intacta.
- **Funções puras**: tabela exata e ordenada; seleção por interseção com ordem da tabela e sensível a caixa; dedup de ecossistemas; extração de scripts (feliz, JSON inválido, chave ausente, tipo inesperado, truncagem em 50).
- **Tool** (`FsReadPort`/`GitReadPort` fakes com spies): `requirements` (alvo declarado, `cwd` fake, alvo inválido → `path: ''`, nunca `null`); alvo inválido não toca porta alguma; caminho com git (raiz ascendida, `readdir` na raiz); **degradação** por recusa de `verify` e por ausência de repositório (raiz = alvo, motivo visível, `readdir` no alvo e nunca no toplevel); sem manifests; sem `package.json` (não lê arquivo); falha de leitura/parse do `package.json` vira aviso e não falha o passo; `readdir` falhando vira erro estruturado; a Tool nunca lança.
- **Core** (fakes de gateway/fs/git): Tool registrada; composta com as mesmas portas; `ask` que seleciona `project_info` produz `steps` com sucesso; toplevel fora das `readRoots` degrada em vez de vazar; demais Tools seguem verdes.

---

# Definition of Done

- todos os critérios de aceitação atendidos;
- testes passando (`pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` na raiz);
- documentação viva atualizada no `doc-sync` de fecho (`packages/tools/CLAUDE.md` — Tool nova, método novo da porta, **residuais conhecidos**; `packages/core/CLAUDE.md`; `CLAUDE.md` raiz; `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; nota no Roadmap 1.4 registrando a segunda fatia entregue e a terceira ainda candidata). O `spec-implementer` toca só a documentação específica da SPEC;
- arquitetura preservada (Tool é adaptador sem lógica de negócio nem decisão de permissão; a decisão de contenção continua só no Permission Service; contracts/permissions/runtime/apps intactos; nenhum `access` novo; nenhuma execução de comando; nenhuma dependência nova; Cognitive não conhece "projeto" fora de um passo do plano);
- residuais conhecidos escritos na SPEC e na doc viva do package;
- revisão concluída;
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- Não criar módulos novos: a Tool vive em `@atlas/tools`, no Tool Registry existente.
- **Regras de Dependência**: `@atlas/tools` depende **só** de `@atlas/contracts` (Regra 5 — não depende do Cognitive Core nem de `@atlas/permissions`). `GitReadPort`/`FsReadPort`/`Verify`/tabela de manifests são internos ao package.
- **Nenhuma dependência de runtime nova** (sem parser de TOML/YAML/XML, sem biblioteca de detecção de linguagem, sem glob).
- A porta **não conhece raízes nem o Permission Service** — só o predicado `verify` injetado (invariante do ADR-0014). A decisão de contenção não migra para a porta nem para a Tool.
- A raiz ascendida só é usada **depois** de `verify` aprová-la; qualquer falha degrada para o alvo declarado, nunca para um ancestral não verificado.
- Somente-leitura: `rev-parse --show-toplevel` (já com `--no-optional-locks`), `readdir`, `readFile`. Nenhuma escrita, nenhum subcomando de git novo, nenhum comando arbitrário.
- A Tool **nunca lança**: toda falha vira `ToolResult` de erro estruturado; falha de scripts é aviso, não erro do passo.
- Não alterar `@atlas/contracts`, `@atlas/permissions`, `@atlas/runtime`, `apps/cli` nem `apps/desktop`.
- Não modelar contexto de ambiente lido pelo Planner/Cognitive (ADR-0009); não cruzar para a fatia de execução de comandos (`ADR primeiro`); não resolver cobertura de ecossistema por varredura recursiva ou heurística.

---

# Observações

- **Por que a raiz é o coração desta fatia:** um relatório de estrutura calculado no diretório errado é pior que nenhum — leva o modelo a concluir "este projeto não tem testes" quando o `package.json` está um nível acima. A SPEC-0028 já pagou o preço de resolver isso com segurança (descoberta + `verify`); esta SPEC colhe o resultado em vez de reinventá-lo, exatamente como o `architecture-reviewer` sugeriu no Roadmap.
- **Por que isto não abre ADR:** nenhum mecanismo novo. Tool + porta injetável (ADR-0013), veredicto aplicado no instante do uso (ADR-0014), falha estruturada por passo (ADR-0012), `access: 'read'` sobre `ResourceType: 'directory'` já existente. O único item de superfície nova é um método numa interface **interna** ao package.
- **Duas barreiras, como sempre:** `evaluate` (pré-check sobre o alvo declarado, no Runtime) + `verify` (sobre o toplevel real, na porta de git; sobre o `realpath` do `package.json`, na porta de FS).
- **Degradar em vez de falhar** é a escolha que mantém a Tool útil fora de repositórios git (projeto recém-criado, diretório exportado, monorepo com permissão só do subpacote) — e mantém honesto o que foi lido, porque a origem da raiz aparece sempre na saída.

---

# Checklist para IA

Antes de implementar: ler **SPEC-0028** inteira (descoberta de toplevel, residuais, D2/D9/D10/D11), ADR-0014 (predicado `verify`; residual documentado), ADR-0013 (portão puro; julgar o recurso concreto), ADR-0012 (falha estruturada), ADR-0009 (contexto de ambiente fora), Module Catalog (Regra 5), `packages/tools/CLAUDE.md` (estado atual do módulo).

Durante: expor `toplevel` sem duplicar `resolveRepository`; renomear o helper de alvo antes de escrever a Tool nova; manter as funções de manifest **puras e testadas sem IO**; degradar (não falhar) quando não houver repositório aplicável, sempre dizendo por quê; ler **só a raiz**, só nomes exatos da tabela; nunca lançar; nenhuma dependência nova; sem tocar contracts/permissions/runtime/apps.

Após: rodar a suíte completa na raiz; validar cada critério; escrever os residuais na doc viva do package; registrar lições; concluir.

---

# Resultado Esperado

O Atlas passa a **reconhecer um projeto**, não só arquivos: perguntado "que projeto é este?" ou "como rodo os testes aqui?", o Planner seleciona `project_info`, o Runtime a executa atrás das duas barreiras de contenção de sempre, e a resposta descreve a raiz efetiva, os manifests reconhecidos, os ecossistemas observados e os scripts declarados — dizendo de onde leu. Rodando de dentro de um subdiretório de um repositório permitido, a raiz encontrada é a do repositório (reuso direto do `rev-parse` já contido da SPEC-0028); quando o repositório escapa das raízes permitidas ou nem existe, a Tool degrada para o diretório-alvo e informa o motivo, sem nunca listar um diretório não autorizado. Nenhum contrato público muda, nenhum ADR é aberto, nenhuma dependência é adicionada, nenhum tipo de acesso novo é introduzido e nada é escrito. Os residuais (listagem sem fecho atômico, TOCTOU de diretório, cobertura parcial da tabela, Windows) ficam **escritos** — e o item 1.4 do Roadmap fica com uma única fatia candidata restante: execução de comandos sob o Permission Service, que segue `ADR primeiro`.

---

# Decisões de design

> Formato de veto (decisão + porquê + alternativa descartada). Atacadas pelo `architecture-reviewer` no gate `Draft → Ready`.

## D1 — Perfil: `completo`

- **Decisão**: classificar a SPEC como `completo`.
- **Porquê**: falha em pelo menos duas condições de `micro` — (a) **cria uma Tool**, que a definição exclui explicitamente; (b) toca `packages/tools/src` **e** `packages/core/src`. Carrega ainda decisões de design não triviais (degradação de raiz, tabela de reconhecimento). Na dúvida, `completo` (Emenda v1.2), e é a mesma classificação que a SPEC-0028 recebeu e teve confirmada no gate.
- **Alternativa descartada**: `micro` — criar Tool e tocar `@atlas/core` estão fora da fronteira do fast-path, mesmo sendo a fatia aditiva e derivada de ADRs existentes.

## D2 — Uma Tool (`project_info`), não três

- **Decisão**: entregar **uma** Tool que responde raiz + manifests + ecossistemas + scripts num único relatório de texto, em vez de `detect_language`/`find_manifests`/`list_scripts` separadas.
- **Porquê**: as três leriam **o mesmo diretório** para responder facetas da mesma pergunta, triplicando passos de plano, chamadas de porta e superfície de descrição para o Planner escolher errado. O teste da Constituição (mais simples, mais modular, mais transparente) aponta para a Tool única: uma responsabilidade — "descrever a estrutura do projeto na raiz" — e um recurso declarado.
- **Alternativa descartada**: três Tools de granularidade fina — modularidade aparente (três arquivos) com acoplamento real (mesmo diretório, mesma raiz descoberta, mesma tabela) e custo triplo em tokens e em passos. Também descartada: uma Tool com um parâmetro `aspect: 'language' | 'manifests' | 'scripts'` — modo escondido em argumento, pior para o Planner e pior de testar que três funções puras.

## D3 — Raiz por `git.toplevel`, com **degradação** para o alvo declarado

- **Decisão**: a raiz é o toplevel do repositório quando `git.toplevel(alvo)` resolve (o que só acontece **depois** de `verify` aprovar o toplevel); qualquer falha — não é repositório, git ausente, `realpath` falhou, `verify` recusou — degrada para o **alvo declarado**, e a saída registra `origem da raiz` com o motivo.
- **Porquê**: rodando de dentro de `packages/tools`, a resposta útil descreve o projeto, não o subdiretório — e a única peça do repositório que sabe achar essa raiz **já aplicando o veredicto de contenção** é a descoberta da SPEC-0028 (reuso explicitamente sugerido pelo `architecture-reviewer` no Roadmap l. 100). Degradar em vez de falhar mantém a Tool útil onde não há git e, sobretudo, **onde o usuário permitiu só o subdiretório**: nesse caso a resposta correta é descrever o que ele autorizou, não recusar o turno inteiro (mesmo espírito de falha estruturada do ADR-0012).
- **Alternativa descartada**: falhar o passo quando o toplevel é recusado — transformaria uma permissão deliberadamente estreita (`--allow-read` só do subpacote) em incapacidade total, sem ganho de segurança: a leitura degradada acontece dentro do que o `evaluate` já aprovou. Também descartada: **não** usar git e ancorar sempre no alvo — entregaria a fatia com o defeito que ela existe para corrigir. Também descartada: subir pelos diretórios pais procurando manifests por conta própria — seria uma **segunda** descoberta de raiz no repositório, sem barreira de contenção associada, exatamente o escape que a SPEC-0028 fechou.

## D4 — Reuso por método aditivo (`GitReadPort.toplevel`), não por porta nova

- **Decisão**: expor `toplevel(cwd): Promise<string>` na `GitReadPort` interna, delegando à `resolveRepository` que já existe em `git-port.ts` (descoberta → `realpath` → `verify`), sem duplicar nenhuma linha nem criar `ProjectRootPort`.
- **Porquê**: a descoberta de raiz **é** IO de git; colocá-la em outra porta duplicaria o argv, o `--no-optional-locks`, o tratamento de erro e — pior — a aplicação do `verify`, criando dois lugares onde a barreira poderia divergir. Mantém uma única implementação da contenção de toplevel, e a interface segue interna ao package (não sobe a `@atlas/contracts`, sem 2º consumidor real).
- **Alternativa descartada**: `ProjectRootPort` própria — duplicação da parte mais sensível do código, com dois pontos de manutenção da mesma garantia. Também descartada: a Tool receber `ExecGit` e montar o `rev-parse` sozinha — colocaria construção de argv de subprocesso dentro de uma Tool, contra a Regra 5 e contra D3 da SPEC-0028.

## D5 — Reconhecimento por **tabela fixa** de nomes exatos, sem heurística e sem recursão

- **Decisão**: manifests reconhecidos por uma tabela fixa e ordenada de 16 nomes de arquivo (Escopo), casada por nome **exato**, sensível a caixa, **só na raiz**, sem glob e sem varredura recursiva. A saída lista manifests e ecossistemas observados; **não** declara linguagem principal.
- **Porquê**: uma tabela é lookup determinístico e mecanicamente testável — não é lógica de negócio nem tomada de decisão (Regra 5) —, enquanto "detectar a linguagem" por contagem de extensões seria heurística, ou seja, uma **decisão** dentro de um adaptador, e não reproduzível. Limitar à raiz mantém o IO em uma chamada de `readdir` e o custo previsível; a inferência final ("é um monorepo TypeScript") fica com o modelo, exatamente como o texto cru do git na SPEC-0028/D6.
- **Alternativa descartada**: varredura recursiva com glob e contagem de extensões — IO ilimitado em repositório grande (`node_modules`, `.git`), saída não determinística e heurística embutida na Tool. Também descartada: casamento case-insensitive — `Package.json` e `package.json` são arquivos distintos em Linux, e casar por aproximação relataria um manifest que ferramenta nenhuma leria. Também descartada: incluir `Makefile`/`Dockerfile` — o critério da tabela é "manifest de ecossistema de linguagem/pacote"; um critério só, defensável, ampliável por linhas novas depois.

## D6 — Scripts: só `package.json`, e falha de scripts é **aviso**, não erro do passo

- **Decisão**: extrair scripts apenas do `package.json` (chaves de `scripts`, via `JSON.parse` embutido), no máximo `PROJECT_SCRIPT_LIMIT = 50` nomes com marcador de truncagem; qualquer falha de leitura ou de parse vira **linha de aviso** na saída, com `ok: true`.
- **Porquê**: `package.json` é o único manifest da tabela em que "scripts declarados" tem forma canônica **e** formato já parseável sem dependência nova — `pyproject.toml`/`Cargo.toml`/`build.gradle` exigiriam parsers de TOML/Groovy, contra o Requisito Não Funcional "minimizar dependências desnecessárias" e contra a Constituição (mais simples, mais sustentável). Degradar em aviso preserva o resto do relatório (raiz, manifests, ecossistemas), que continua correto mesmo com um `package.json` malformado — perder tudo por causa de uma vírgula seria falha desproporcional (ADR-0012).
- **Alternativa descartada**: adicionar parser de TOML/YAML para cobrir Python/Rust/JVM — dependência nova numa fatia que o Roadmap classifica como incremental; cobertura ampliável depois, sem contrato novo. Também descartada: devolver o **texto cru** do `package.json` (mais "adaptador puro") — despeja dependências e configuração inteiras na composição, custo de token alto para responder "quais scripts existem". Também descartada: falhar o passo em `package.json` inválido — troca um relatório útil por nada.

## D7 — `access: 'read'` sobre o **diretório-alvo** declarado, sem contrato novo

- **Decisão**: `requirements` declara `{ resource: { type: 'directory', path: <alvo> }, access: 'read' }`, com o alvo derivado pelo **mesmo** helper usado em `run`; `requirements` nunca devolve `null` (alvo inválido → `path: ''`, que o portão bloqueia).
- **Porquê**: é literalmente o que a Tool toca primeiro, é o que o pré-check do Runtime sabe julgar sem IO, e é o mesmo desenho já aceito em `git_status` (SPEC-0028/D2) e em `http_get` (SPEC-0055/D4: um único helper alimentando `requirements` e `run`, para que o recurso julgado seja o recurso requisitado). A assimetria residual — a leitura pode ocorrer no toplevel, acima do alvo — é fechada pela segunda barreira (`verify` dentro da porta) e registrada nos Residuais.
- **Alternativa descartada**: declarar a raiz efetiva em `requirements` — impossível sem IO assíncrono num método síncrono, e faria a Tool decidir permissão sobre um recurso que ela ainda não descobriu. Também descartada: `ResourceType` novo (`'project'`) — tocaria `@atlas/contracts` sem ganho de julgamento (a política continua sendo contenção de diretório).

## D8 — Renomear o helper de alvo (`resolveGitTarget` → `resolveTargetDirectory`)

- **Decisão**: renomear `git-target.ts` → `target-dir.ts` e a função para `resolveTargetDirectory`, atualizando os três imports das Tools de git; comportamento e assinatura idênticos.
- **Porquê**: com um segundo consumidor que **não** é de git, o nome atual passaria a mentir sobre a fronteira do helper — e a Constituição (Artigo 1, documentação/código como fonte honesta da verdade) prefere um rename mecânico de três linhas a um nome que induz o próximo leitor a achar que a Tool de projeto é uma Tool de git. Diff mecânico, sem risco: o helper não é exportado pelo `index.ts` e nenhum teste o importa diretamente.
- **Alternativa descartada**: importar `resolveGitTarget` de `git-target.js` dentro de `project-info.ts` — funciona e evita diff, ao custo de um nome enganoso permanente. Também descartada: duplicar o helper na Tool nova — duas implementações da mesma regra de argumento, divergindo no primeiro ajuste.

## D9 — Saída de texto determinística com a **origem da raiz** explícita

- **Decisão**: a saída é texto com linhas fixas (`raiz:`, `origem da raiz:`, `manifests:`, `ecossistemas:`, `scripts (package.json):`), em ordem fixa, incluindo sempre a origem da raiz e, na degradação, o motivo.
- **Porquê**: o dado que o usuário **não** forneceu e não pode inferir é justamente qual diretório o sistema decidiu inspecionar (mesmo argumento de SPEC-0028/D11, Artigo 7). Linhas fixas tornam os critérios de aceitação verificáveis por substring e evitam que o modelo confunda um relatório degradado com um completo.
- **Alternativa descartada**: devolver JSON estruturado — nenhum consumidor programático existe (quem consome é o modelo), e um esquema publicado viraria contrato de fato sem passar por `@atlas/contracts`. Também descartada: omitir a origem quando a raiz é a do git — a informação só valeria no caso de erro, e o usuário perderia a distinção "li o projeto inteiro" × "li só este subdiretório".

## D10 — Prioridade: `Medium`

- **Decisão**: prioridade `Medium`.
- **Porquê**: é `candidato` (não `gate`) no Roadmap 1.4 — todos os gates da Fase 1 já estão fechados —, mas entrega o requisito mais literal do PRD para a especialidade declarada ("compreender projetos de software") e destrava o uso diário da plataforma como parceira de desenvolvimento. Mesma classificação da SPEC-0028, com a qual forma uma sequência coerente.
- **Alternativa descartada**: `High` — nenhum gate depende desta fatia; reservar `High` para o que bloqueia fase mantém a sinalização honesta. Também descartada: `Low` — subestimaria uma capacidade que quase todo objetivo de desenvolvimento passa a usar como primeiro passo.

## D11 — `path` explícito é honrado como declarado, sem ascensão ao toplevel

- **Decisão**: a ascensão ao repositório (`git.toplevel`) só ocorre quando `path` é **omitido** (alvo derivado do `cwd()`). Com `path` explícito, `git` não é chamado — a raiz é exatamente o alvo declarado, origem `diretório informado`.
- **Porquê**: um `path` explícito é a única forma desta Tool descrever um subprojeto de monorepo (Fora do Escopo); se a ascensão ignorasse `path` e subisse sempre ao toplevel, `project_info({ path: 'packages/tools' })` descreveria o monorepo inteiro, nunca o subpacote — a capacidade prometida no Fora do Escopo simplesmente não existiria, e a SPEC estaria mentindo sobre ela (Artigo 1). A descrição da Tool passa a orientar o Planner explicitamente: omitir `path` para descrever o projeto do diretório corrente (a raiz sobe ao repositório git); informar `path` para descrever exatamente aquele diretório.
- **Alternativa descartada**: ascender sempre ao toplevel, ignorando `path` — mais uniforme na superfície, mas torna impossível inspecionar um subpacote dentro de um repositório git, o caso mais comum de monorepo (inclusive este). Consequência aceita: um `path` supérfluo do Planner desliga a ascensão sem segunda tentativa automática (Residual 9) — mitigada pela descrição da Tool e por `origem da raiz: diretório informado` sempre visível na saída, dando ao modelo o sinal para repetir a chamada sem `path`.

## D12 — Motivo de degradação como conjunto fechado de strings, nunca stderr do git

- **Decisão**: o motivo da degradação é um de **cinco strings literais fixas** (`repositório git`; `diretório informado`; `diretório alvo (sem repositório git)`; `diretório alvo (repositório fora do diretório permitido)`; `diretório alvo (falha ao resolver o repositório)`), escolhido por `GitRootError.reason` (`'no-repository' | 'resolve-failed' | 'denied'`) — nunca pela mensagem crua do erro.
- **Porquê**: D9 promete saída determinística, mas a mensagem de `resolveRepository` (`git-port.ts`) embute stderr do `git`, dependente de versão/locale — não determinístico em produção, contradizendo a própria decisão que a origina. Classificar por `reason` em vez de casar substring de mensagem mantém a saída testável por igualdade exata e evita alargar o Residual 4 (hoje "vaza um caminho descoberto") para "vaza saída arbitrária de subprocesso". `GitRootError` (novo, interno a `git-port.ts`) é o mecanismo que permite essa classificação sem casar texto.
- **Alternativa descartada**: propagar `error.message` original — mais detalhado, mas não determinístico e um vetor a mais de vazamento de path (o mesmo risco do Residual 5 da SPEC-0028, que esta fatia elimina deliberadamente ao custo de menos detalhe para o usuário, registrado no Residual 4). Também descartada: truncar `error.message` em vez de classificar por `reason` — ainda dependente de locale/versão do git, só com o sintoma escondido em vez de removido.
