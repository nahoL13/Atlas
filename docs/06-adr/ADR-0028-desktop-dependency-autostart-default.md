# ADR-0028 — Auto-start sempre-ativo de dependências externas no desktop

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-09-13

---

# Contexto

O usuário rodou `pnpm --filter @atlas/desktop start` e tomou
`ModelGatewayError: Falha ao conectar ao Ollama` (`ECONNREFUSED`) porque o
Ollama não estava rodando localmente. Foi explicado que já existe um opt-in
explícito para isso — `ATLAS_AUTO_START_OLLAMA`/`--auto-start-ollama`
([SPEC-0060](../implementation/specs/SPEC-0060-ollama-auto-start.md),
consumindo o [ADR-0027](ADR-0027-external-process-lifecycle-management.md))
— e o usuário reagiu: o Atlas desktop é pensado como **"um app para
todos"**, para quem sabe subir infraestrutura e para quem não sabe; nesse
segundo caso, a automação precisa ser sempre automática, sem exigir que o
usuário conheça uma flag/env.

O `spec-drafter`, ao tentar desenhar a SPEC diretamente a partir desse
pedido, escalou sem redigir nada: "sempre automático, sem flag" nega
frontalmente a cláusula **(g)** do ADR-0027 — *"opt-in explícito e dedicado,
fail-closed por padrão"* — e a alternativa equivalente ("auto-start
implícito a partir de config já existente, sem flag dedicada") já havia
sido **considerada e explicitamente rejeitada pelo próprio usuário** durante
o brainstorming do ADR-0027, registrada nas suas "Alternativas Consideradas"
e replicada em `SPEC-0060/D6`. Inverter o default de `false` para `true` não
é preencher um contrato técnico que aquele ADR delegou às SPECs — é negar a
postura fail-closed da própria cláusula. Isso caracteriza emenda/supersessão
de ADR, decisão humana pela Emenda v1.1 da Constituição, não derivável da
documentação existente.

O usuário aprovou abrir este ADR antes de qualquer SPEC e decidiu, em
brainstorming nesta sessão:

- o escopo fica restrito a `apps/desktop` — `apps/cli` mantém a cláusula (g)
  do ADR-0027 integralmente em vigor (opt-in explícito, default `false`),
  porque quem roda a CLI já é um usuário técnico e scripts/CI não devem
  ganhar um processo subindo sem aviso;
- para o **Ollama**, o novo default no desktop é `true`, mantendo uma
  variável de ambiente explícita como via de desligamento — inverte a
  polaridade do default, não remove o controle;
- para o **container Docker do provedor de busca**
  ([SPEC-0061](../implementation/specs/SPEC-0061-search-container-auto-start.md)),
  não existe um valor universal para "ligar por padrão": `autoStartSearchContainer`
  é um campo **nominal** (nome do container), não booleano — "se" e "qual"
  já são a mesma pergunta desde a SPEC-0061 (g). Não há como a plataforma
  adivinhar o nome de um container provisionado manualmente pelo usuário.
  A paridade de "sem precisar mexer em env var" para este caso vem por outra
  via: o painel de rede/busca do desktop
  ([SPEC-0059](../implementation/specs/SPEC-0059-desktop-network-search-gui.md))
  ganha um campo para o nome do container, e preenchê-lo ali já é o opt-in
  explícito — mesma fusão "se/qual" da SPEC-0061, só que a entrada passa a
  aceitar GUI além de env.

---

# Decisão

**(i) Supersede parcial da cláusula (g) do ADR-0027 — restrito a
`apps/desktop` e restrito ao Ollama.** O default de
`AtlasConfig.dependencies.autoStartOllama`, quando resolvido no bootstrap do
desktop, passa a ser `true`. `ATLAS_AUTO_START_OLLAMA` continua existindo e
aceita `'false'` como via explícita de desligamento — o usuário avançado não
perde controle, só a polaridade do repouso muda. `apps/cli` não é tocada por
esta cláusula: lá, (g) permanece integralmente em vigor, default `false`,
opt-in por `--auto-start-ollama`/`ATLAS_AUTO_START_OLLAMA`.

**(ii) A cláusula (g) do ADR-0027 permanece intacta para o container de
busca — o que muda é a superfície de entrada, não o default.**
`autoStartSearchContainer` continua fail-closed (`''` = desligado); nenhum
nome é adivinhado ou assumido. O painel de rede/busca do desktop (SPEC-0059,
`selectNetworkAccess`/`network-grant-dialog.ts`) ganha um campo aditivo para
o nome do container, que ao ser preenchido popula o mesmo
`autoStartSearchContainer` que hoje só a env aceita. Preencher o campo já é
o opt-in explícito — nenhuma cláusula é negada, só ganha uma segunda porta
de entrada equivalente à primeira.

**(iii) A cláusula (f) do ADR-0027 (falha degrada, nunca bloqueia o boot)
permanece intocada nos dois casos.** Um novo default `true` não muda o modo
de falha: se o Ollama não conseguir subir, o desktop abre normalmente e o
erro só aparece quando o chat de fato precisar do modelo — exatamente como
hoje. Este ADR muda apenas *quem* tenta subir a dependência por padrão,
nunca o que acontece quando a tentativa falha.

**(iv) A mudança de default deve ficar auditável, não silenciosa.** A
tentativa automática de subir o Ollama no desktop continua sujeita ao mesmo
contrato de log/aviso que a SPEC-0060 já estabeleceu (aviso em falha,
silêncio em sucesso/already-running); o contrato técnico exato de onde essa
visibilidade aparece (log, painel de Sistema da SPEC-0054, ou equivalente)
fica delegado à SPEC que implementa.

---

# Consequências

Positivas:

- Resolve o atrito concreto que motivou o pedido sem inventar categoria de
  política nova — apenas inverte a polaridade de um default já existente,
  na borda que o próprio ADR-0027 já priorizava ("prioridade declarada para
  o desktop").
- `apps/cli` sai sem nenhuma linha de comportamento alterada — scripts/CI
  que chamam `atlas ask` não ganham um processo subindo sem aviso.
- O container de busca ganha paridade de UX sem exigir um default
  impossível de definir: a fricção é removida expondo a mesma informação
  (o nome do container) numa superfície que já existe (painel da
  SPEC-0059), não inventando um comportamento sem identidade.
- `createDependencyManager`/`ProcessPort` (`@atlas/core`, SPEC-0060/0061)
  seguem sendo o único dono — nenhum módulo novo, nenhuma cláusula (a)–(f)
  e (h) do ADR-0027 é reaberta.

Custos e riscos:

- **Reverte parcialmente uma decisão de produto que o próprio usuário havia
  tomado no ADR-0027** (opt-in explícito por padrão, em todas as bordas).
  Fica documentado deliberadamente aqui para não parecer uma inconsistência
  não examinada: o que mudou foi o contexto (o caso concreto de fricção no
  desktop), não um esquecimento da decisão anterior.
- Um usuário que abre o desktop pela primeira vez, sem saber o que é
  Ollama, passa a ver um processo subindo em segundo plano sem ter pedido
  explicitamente — mitigado por (iv), mas é uma mudança real de expectativa:
  "abrir o app" passa a ter efeito colateral no host por padrão.
- O campo novo no painel de rede/busca (nome do container) aumenta
  levemente a superfície daquele painel — ainda reusa o mutex de política e
  o padrão de estado de sessão não-durável que ele já segue (SPEC-0059).

---

# Alternativas Consideradas

**Auto-start incondicional no desktop, sem nenhuma variável de escape.**
Rejeitada pelo usuário nesta sessão: remover de vez o controle manual
contradiz o Artigo 7 (transparência) sem necessidade real — manter uma env
explícita de desligamento custa nada e preserva o último grau de controle
para quem quiser.

**Aplicar o mesmo `default: true` também em `apps/cli`.** Rejeitada: o
usuário distinguiu explicitamente público técnico (CLI) de público final
(desktop, "app para todos"). Scripts e pipelines de CI que invocam
`atlas ask` não deveriam ganhar um processo de longa duração subindo sem
aviso só por terem sido executados.

**Adivinhar/convencionar um nome fixo para o container de busca (ex.:
`atlas-searxng`) para poder aplicar `default: true` igual ao Ollama.**
Rejeitada preliminarmente: obrigaria o usuário a nomear o container de um
jeito específico durante um provisionamento que o Atlas nunca controla, e
fragilizaria a cláusula (h) do ADR-0027 (o Atlas só inicia um container já
existente, nunca cria um) ao acoplar comportamento a uma convenção de nome
não garantida.

**Deixar o container de busca de fora desta fatia, só env var como hoje.**
Foi a alternativa mais simples cogitada — foi preterida porque o usuário
preferiu resolver a paridade de UX agora, evitando reabrir o assunto depois
de uma nova SPEC já ter fechado a superfície de rede/busca do desktop
(SPEC-0059).

---

# Observações

- Este ADR resolve só a arquitetura da mudança de default/superfície de
  entrada — o dono continua sendo `createDependencyManager`/`ProcessPort`
  (`@atlas/core`, SPEC-0060/0061). Nenhuma cláusula (a)–(f) e (h) do
  ADR-0027 é tocada; só (g) recebe supersessão **parcial e restrita** (só
  `apps/desktop`, só Ollama). O contrato técnico exato — onde o default
  `true` é de fato aplicado (`resolveDependencyConfig`, um parâmetro novo,
  ou `apps/desktop/src/main.ts` fixando o valor antes de chamar `ensure()`)
  — fica delegado à SPEC que implementa, mesmo padrão de delegação que os
  ADRs anteriores já usaram para contrato técnico.
- O campo novo do nome do container no painel de rede/busca (SPEC-0059) é
  aditivo àquele painel — rótulo exato, validação, e se compartilha o mesmo
  diálogo de consentimento (`network-grant-dialog.ts`) ou não ficam para a
  SPEC que implementa.
- Não fecha nenhum item do Roadmap. Não reabre o item 1.4 (execução de
  comandos sob o Permission Service) nem o [ADR-0026](ADR-0026-network-access-gate.md).
- SPEC candidata (nome de trabalho): auto-start sempre-ativo do Ollama no
  desktop + campo de nome do container no painel de rede/busca.

---

# Atualização ([SPEC-0062](../implementation/specs/SPEC-0062-desktop-dependency-autostart-default.md))

A SPEC-0062 implementou este ADR **sem alterar nenhuma cláusula (i)–(iv)**.
Contrato técnico exato que o ADR delegou:

- **(i) — onde o default `true` é aplicado**: numa constante exportada,
  `DESKTOP_AUTO_START_OLLAMA_DEFAULT`, em
  `apps/desktop/src/core-bridge.ts` — **nunca** em `@atlas/core`.
  `defaultConfig()`/`resolveDependencyConfig` (compartilhados com
  `apps/cli`) seguem dizendo `autoStartOllama: false`; o desktop resolve o
  valor de borda **antes** de chamar `resolveDependencyConfig`, no mesmo
  papel que uma flag de CLI ou uma env já ocupam na precedência `flags >
  env > defaults` — não é um segundo lugar onde "o default da plataforma"
  vive. Valor **inválido** de `ATLAS_AUTO_START_OLLAMA` continua ⇒
  desligado + o mesmo `console.warn` pinado (`INVALID_AUTO_START_OLLAMA_ENV_WARNING`,
  byte a byte); só o caso *ausente* mudou de polaridade.
- **(ii) — o campo novo do painel de rede/busca é um gesto próprio, não uma
  extensão de `selectNetworkAccess`.** `DependencyManager.ensureSearchContainer`
  (extensão aditiva do contrato técnico do ADR-0027, ver a nota de
  Atualização lá) é chamado por uma função nova de `core-bridge.ts`
  (`ensureSearchContainer`), exposta por um canal IPC próprio
  (`'atlas:dependencies:search-container'`) e por um botão próprio
  (`#search-container-apply`, dentro de `#search-detail`) — **não** reusa
  `network-grant-dialog.ts` nem qualquer diálogo de consentimento: digitar
  o nome e clicar **é** o opt-in explícito que a cláusula já previa.
  **Divergência de mecanismo, registrada por escrito para que ninguém leia
  (ii) e conclua que o código a implementa ao pé da letra**: a letra da
  cláusula descreve o campo como algo que "ao ser preenchido popula o
  mesmo `autoStartSearchContainer` que hoje só a env aceita" — mas popular
  a config **no momento do gesto seria inerte**, porque `ensure` é
  memoizado por instância (SPEC-0060/D18) e já assentou em
  `app.whenReady()`, então nenhum container subiria. A equivalência que
  (ii) de fato exige é cumprida em **efeito** (postura fail-closed
  preservada, nenhum nome adivinhado, preencher o campo é o opt-in
  explícito), não em **mecanismo**.
- **(iii)** confirmada sem mudança: falha continua degradando, nunca
  bloqueando o boot — nem o auto-start do Ollama nem o gesto de GUI do
  container lançam.
- **(iv) — a visibilidade escolhida** é o painel `Sistema` (SPEC-0054),
  que ganha a seção `#system-dependencies` com uma linha por dependência
  desta sessão, somada aos logs de `console.info`/`console.warn` já
  existentes (que não mudam) — o log do main process é provadamente
  inalcançável num app empacotado, então a transparência efetiva exigida
  pelo Artigo 7 precisa de uma superfície dentro da própria janela.
- `apps/cli` sai com diff vazio, exceto pelo fake tipado de
  `DependencyManager` em `apps/cli/tests/auto-start-ollama.test.ts`
  (`ensureSearchContainer` aditivo, exigido só pelo typecheck do package —
  nenhuma linha de comportamento muda).
