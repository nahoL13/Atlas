# ADR-0013 — Permission Service: portão puro na execução

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-15

---

# Contexto

Até a SPEC-0010 o Atlas executava apenas Tools **puras** (`clock`/`calc`) — sem rede, disco ou qualquer efeito colateral — precisamente porque o **Permission Service ainda não existia** (fronteira explícita da SPEC-0010: "Tools que exijam avaliação de risco ficam para depois do Permission Service"). O Module Catalog cataloga o Permission Service (`packages/permissions`, camada Support) com a responsabilidade de *"avaliar se uma ação pode ser executada de acordo com permissões, políticas e nível de risco"*, distinguindo no mínimo quatro veredictos — **livre / permitida por política / que exige confirmação / bloqueada** — e deixa explícito que ele **não** executa ações nem **presume consentimento para ações destrutivas**. A SPEC-0011 entrega o primeiro efeito colateral real da plataforma: leitura de sistema de arquivos (`read_file`/`list_dir`), escolhida deliberadamente por ser **read-only** — exercita o portão (livre × bloqueada por política de raiz) sem precisar do fluxo interativo de confirmação, que fica para quando existir uma Tool de escrita.

A pergunta central: **onde mora a autoridade de "isto pode ser feito?", e como ela se conecta às Tools e ao Runtime sem acoplar as três peças?**

---

# Decisão

**Permission Service puro e síncrono, sem IO.** `createPermissionService({ readRoots })` expõe `evaluate(action: ActionRequest): PermissionDecision` — nenhuma chamada a `fs`, rede ou qualquer efeito. Ele julga dados: resolve o `path` do recurso para absoluto e verifica **contenção lexical** contra as `readRoots` configuradas (prefixo com fronteira de separador, sem seguir symlink/`realpath`). Dentro de uma raiz → `allowed`; fora → `blocked` com `reason`. `AccessMode` inclui `'write'` **reservado**: qualquer ação com `access !== 'read'` é `blocked` nesta fatia, o que torna o veredicto de acesso reservado diretamente testável sem precisar de uma Tool de escrita real.

**Tools declaram o que tocam, como dado.** `Tool` ganha um membro opcional `requirements(args) → ActionRequest | null`. As Tools de leitura (`read_file`/`list_dir`) o implementam, descrevendo o recurso e o modo de acesso pretendido; `clock`/`calc` continuam **sem** `requirements` — permanecem livres e inalteradas. A Tool nunca chama `permissions.evaluate` nem decide se pode agir: ela só descreve. O acesso ao disco em si passa por uma **porta injetável** (`FsReadPort`, default `nodeFsReadPort()` sobre `node:fs/promises`; fake nos testes) — o mesmo padrão já usado para `fetch` (Model Gateway) e `MemoryStorage` (ADR-0011).

**O Runtime aplica o veredicto.** `createRuntime({ registry, permissions })` consulta `tool.requirements?.(args)` por passo: ausência de requisito (`null`/`undefined`) → executa sem consultar `permissions` (`free`, propriedade da Tool, não do serviço); com requisito, chama `permissions.evaluate` — `allowed` executa normalmente; qualquer outro veredicto (`blocked`, e `confirm` tratado como não-executável nesta fatia) vira um `ExecutedStep` **negado** (`ToolResult` de erro com o motivo), a Tool **não é chamada** (a porta de fs não é tocada), e a execução **nunca lança** e **continua** nos demais passos — o mesmo padrão de falha estruturada já estabelecido no ADR-0012 para Tool inexistente.

**`free` é ausência, não um veredicto do serviço.** O vocabulário completo dos quatro veredictos do Module Catalog (`free | allowed | confirm | blocked`) vive em `PermissionVerdict`, mas nesta fatia o serviço só produz `allowed`/`blocked`; `free` é modelado como a Tool simplesmente não declarar requisito, e `confirm` é reservado — presente no tipo para não quebrar o contrato quando o fluxo interativo de escrita chegar, mas nenhum caminho de código o produz ainda.

---

# Consequências

Positivas:

- Primeiro efeito colateral real da plataforma (`atlas ask "resuma ./README.md"` lê o arquivo de verdade), com o portão de segurança que o Module Catalog exige desde o início.
- Três autoridades limpas e testáveis isoladamente: Tool **descreve** (dado, sem decisão), Permission Service **julga** (puro, sem IO), Runtime **aplica e executa** (nunca lança). Nenhuma delas precisa conhecer a implementação das outras.
- Planner, Cognitive Core e Model Gateway seguem **intactos** — o portão vive inteiramente no Runtime, no momento da execução; um passo bloqueado chega à 2ª chamada de composição como mais uma falha estruturada, e o modelo explica o bloqueio na resposta.
- `AccessMode` com `'write'` reservado torna o veredicto "acesso reservado bloqueado" testável hoje, sem esperar por uma Tool de escrita.

Custos e riscos:

- Contenção **lexical**, sem `realpath`/symlink: um link simbólico dentro de uma `readRoot` apontando para fora poderia escapar da política. Limitação **conhecida e documentada**; endurecer exigiria IO na avaliação (ou uma porta de resolução injetável) — fatia futura.
- `confirm` só existe no vocabulário do tipo; o fluxo interativo de confirmação (obrigatório antes de qualquer ação destrutiva, por regra do Module Catalog) ainda não existe — bloqueia Tools de escrita até ser implementado.
- Política única e global (raiz(es) permitida(s) de leitura); sem identidade de usuário, arquivo de políticas externo ou políticas por-Tool — suficiente para esta fatia, insuficiente para cenários multiusuário ou de risco diferenciado por operação.

---

# Alternativas Consideradas

**Tabela de política por-Tool dentro do próprio Permission Service (ex.: o serviço sabe que `read_file` lê arquivos).** Acoplaria o Permission Service ao catálogo de Tools — cada Tool nova exigiria alterar o serviço. Rejeitada: manter o serviço genérico (julga `ActionRequest`, nunca conhece nomes de Tool) e a Tool descrevendo o que toca via `requirements` mantém as duas autoridades desacopladas.

**Capacidade estática sem path (ex.: a Tool só declara `'lê arquivos'`, sem o recurso concreto).** Mais simples, mas perde justamente a política de raiz permitida — não dá para distinguir "ler dentro do repo" de "ler `/etc/passwd`" sem o path na avaliação. Rejeitada: o valor do portão está exatamente em julgar o recurso concreto.

**Implementar o fluxo interativo de `confirm` já nesta fatia.** Maior a fatia (exigiria `atlas ask` deixar de ser tiro único, com um passo intermediário de prompt) e não há ainda nenhuma Tool destrutiva que o justifique. Rejeitada nesta fatia; `confirm` entra apenas no vocabulário do contrato, reservado para quando existir uma Tool de escrita.

**Seguir symlinks/`realpath` desde já.** Endureceria contra o escape documentado, mas introduziria IO na avaliação — quebraria a invariante "Permission Service sem IO" desta decisão, ou exigiria uma porta de resolução injetável adicional. Rejeitada por ora; registrada como limitação conhecida e candidata a fatia futura.
