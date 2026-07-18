# SPEC-0016 — Remote (GitHub) + CI

> **Project Atlas — Implementation Specification**

Version: 1.2

---

# Informações Gerais

**ID**

SPEC-0016

---

**Título**

Remote (GitHub) + CI básico — primeira infraestrutura de desenvolvimento: publica o repositório (hoje só local) num remote privado no GitHub e valida `lint`/`typecheck`/`test`/`format:check` a cada push/PR.

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

> Confirmada pelo usuário como `Medium`. Rastreia à ordem sugerida da Fase 1 do Roadmap ("1.1 e 1.5 primeiro — itens pequenos, baratos, e o CI passa a proteger todo o trabalho seguinte"), mas ambos os itens de 1.5 estão marcados como `candidato` (não bloqueiam a conclusão da fase), o que justifica `Medium` em vez de `High`.

---

**Item do Roadmap**

`Fase 1 — 1.5 Infraestrutura de Desenvolvimento (remote + CI)`.

Ambos os itens de 1.5 (`Remote (GitHub) para o repositório` e `CI básico rodando lint/typecheck/test a cada push`) estão marcados `candidato · SPEC direta` no Roadmap. Esta SPEC consome **os dois juntos** deliberadamente, por serem acoplados: um workflow de CI não roda sem um remote para hospedá-lo. O empacotamento/distribuição da CLI permanece na Fase 3 (fora desta SPEC).

---

# Objetivo

Ao concluir esta SPEC, o repositório do Project Atlas — que hoje existe **apenas localmente**, em branch única `main`, **sem remote** — passa a:

- Estar hospedado num repositório **privado** no GitHub chamado `Atlas`, na conta `nahoL13` (a mesma em que o `gh` já está autenticado), com `origin` apontando para ele e a branch `main` publicada.
- Ter **integração contínua** definida em `.github/workflows/ci.yml`, disparada a cada `push` (todas as branches) e a cada `pull_request`, que instala o workspace e roda `lint`, `typecheck`, `test` e `format:check` num runner limpo (`ubuntu-latest`, Node 24, pnpm 11 via corepack).
- Ter o `pnpm format:check` **verde**, após adicionar `docs/.obsidian/` ao `.prettierignore` — hoje esse comando falha por causa dos arquivos JSON do vault do Obsidian (pendência pré-existente, não introduzida por esta SPEC), o que deixaria o CI vermelho já no primeiro run.

O sucesso final se confirma **observando um run real** do workflow no GitHub Actions concluído com sucesso sobre o commit publicado em `main` — não basta rodar os comandos localmente.

---

# Motivação

Esta é a **primeira infraestrutura de desenvolvimento** do projeto. Dois problemas concretos justificam-na, ambos rastreáveis à documentação existente:

- **O repositório só existe localmente.** O `NEXT_CONTEXT.md` registra: *"Working tree limpa; branch única `main`, **sem remote** (GitHub/CI ainda não decididos)."* Um remote é também o único **backup** do trabalho acumulado nas SPECs 0001–0015 — hoje inexistente. O Roadmap (Fase 1.5) formaliza: *"um remote é também backup do repositório, que hoje só existe localmente."*
- **Nada valida as SPECs automaticamente.** Todo o controle de qualidade (`lint`/`typecheck`/`test`/`format:check`) depende hoje de execução manual e disciplinada na máquina do autor. O Roadmap coloca 1.5 cedo na Fase 1 justamente porque *"o CI passa a proteger todo o trabalho seguinte"*, e o `ProjectStructure.md` já prevê o diretório `.github/` para *"workflows de integração contínua"* e afirma que *"regras que puderem ser aplicadas automaticamente devem preferencialmente ser implementadas por CI, lint, testes ou validação de tipos."*

Documentos originadores: **Roadmap** (Fase 1.5, item explícito) + **ProjectStructure** (`.github/` previsto, preferência por CI) + **NEXT_CONTEXT** (remote/CI como pendência conhecida e "sem remote" no estado imediato) + **PRD** (NFR "priorizar segurança", "facilidade de manutenção" — o CI protege a manutenibilidade da arquitetura modular). O tema não pertence a nenhum **módulo do produto** (não há package/app envolvido): é infraestrutura de desenvolvimento, que por desenho vive em `.github/`, fora de `packages/`/`apps/` — consistente com o `ProjectStructure.md`.

---

# Referências

- [Roadmap](../../04-engineering/Roadmap.md) (`docs/04-engineering/Roadmap.md`) — Fase 1.5 "Infraestrutura de Desenvolvimento (transversal)"; ordem sugerida ("1.1 e 1.5 primeiro"); empacotamento da CLI permanece na Fase 3 — origem direta desta SPEC
- [Project Structure](../../03-architecture/ProjectStructure.md) (`docs/03-architecture/ProjectStructure.md`) — diretório `.github/` (workflows de CI); preferência por aplicar regras via CI/lint/testes/typecheck
- [PRD](../../02-product/ProductRequirementsDocument.md) (`docs/02-product/ProductRequirementsDocument.md`) — NFR "priorizar segurança", critério de qualidade "facilidade de manutenção"
- [NEXT_CONTEXT](../../05-context/NEXT_CONTEXT.md) (`docs/05-context/NEXT_CONTEXT.md`) — "sem remote"; "Remote/GitHub + CI: decisão em aberto, candidata a SPEC própria"; "Avisos Operacionais" (flag `-w`, `allowBuilds` do esbuild, apps via `tsx`, Prettier ignora `**/*.md`)
- [ADR-0005](../../06-adr/ADR-0005-app-typescript-execution.md) (`docs/06-adr/ADR-0005-app-typescript-execution.md`) — execução do fonte via `tsx` (o esbuild, motor do `tsx`, é o `allowBuild` que o `pnpm install` do CI depende)
- `CLAUDE.md` (raiz) — comandos do projeto (`pnpm install`/`lint`/`format:check`/`typecheck`/`test`) e requisitos de ambiente (Node ≥ 24, pnpm ≥ 11 via corepack)

---

# Escopo

Exatamente três entregas coesas — nada além do que o Roadmap 1.5 e o briefing já validado definem:

1. **Remote no GitHub** (ação outward, com checkpoint de confirmação humana — ver "Restrições" e "Observações"):
   - Criar um repositório **privado** chamado `Atlas` na conta `nahoL13` (o `gh` já está autenticado nessa conta, protocolo HTTPS).
   - Configurar `origin` apontando para esse repositório e **publicar a branch `main`** (todo o histórico local 0001–0015).
   - Comando provável: `gh repo create Atlas --private --source=. --remote=origin --push`.

2. **Workflow de CI** em `.github/workflows/ci.yml`:
   - Gatilhos: `push` (todas as branches) + `pull_request`.
   - Runner `ubuntu-latest`; Node **24** (o `engines` do repo exige `node >=24`); pnpm **11** via corepack.
   - Passos, nesta ordem: checkout → setup-node (com cache de pnpm) → `corepack enable` → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm format:check`.

3. **Fix de formatação** (pré-requisito do `format:check` verde):
   - Adicionar `docs/.obsidian/` ao `.prettierignore`. Estado atual verificado: `.prettierignore` contém `pnpm-lock.yaml`, `node_modules/`, `dist/`, `coverage/`, `**/*.md` — **não** ignora `docs/.obsidian/`. `package.json` roda `prettier --check .` em `format:check`. O vault do Obsidian em `docs/.obsidian/` traz arquivos JSON não formatados por Prettier (os `.md` já são ignorados por `**/*.md`, mas os JSON do vault não), fazendo `format:check` falhar hoje. Essa pendência é **pré-existente** (o vault foi adicionado num commit anterior — `3ef2b31 feat: add obsidian vault`), não é introduzida por esta SPEC.

4. **Documentação**: atualizar `CLAUDE.md` raiz (estado: remote existe, CI ativo), `NEXT_CONTEXT.md` e `CURRENT_SPRINT.md` (remover "sem remote" / a pendência de remote+CI), e registrar lições em `LESSONS_LEARNED.md`.

---

# Fora do Escopo

Esta seção é obrigatória. Nada abaixo deve ser implementado nesta SPEC:

- **Proteção de branch / ruleset** exigindo CI verde antes de mergear em `main` — decisão deliberadamente **adiada** (o remote passa a existir, mas sem regra de proteção nesta fatia).
- **`pnpm build` no CI** — hoje é um no-op recursivo (`pnpm -r build`, sem packages que emitam), agrega pouco; fica de fora.
- **Matriz multi-versão de Node** — só a **24**; nada de testar 22/26 em paralelo.
- **Distribuição/empacotamento da CLI** (binário publicável fora do workspace) — permanece na **Fase 3** do Roadmap (o pré-requisito de remote+CI foi antecipado, mas o empacotamento não).
- **Badges de status** no README, **deploy**, **releases automáticas**, **Dependabot** / atualização automática de dependências, publicação de packages.
- **Templates de Issue/PR** (`.github/ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE`) — previstos no `ProjectStructure.md`, mas fora desta fatia.
- **Segredos/variáveis de repositório**, ambientes protegidos, caches além do de pnpm.
- **Qualquer mudança em `packages/*`/`apps/*`** de código de produto — esta SPEC não toca módulo algum do Atlas; só `.github/`, `.prettierignore` e docs vivas.
- **Reformatar/tocar o conteúdo do vault do Obsidian** — a correção é **ignorá-lo** no Prettier, não reformatá-lo.
- **Mudar `pnpm-workspace.yaml`** — o `allowBuilds: { esbuild: true }` já está presente e é apenas verificado como risco, não alterado (ver "Observações").

---

# Pré-requisitos

Nenhuma SPEC anterior precisa estar `Done` para esta — é infraestrutura transversal, sem dependência de código de produto. As SPECs 0001–0015 estão `Done` (confirmado no `NEXT_CONTEXT.md`), e o CI validará exatamente o estado atual do repositório.

Pré-condições de **ambiente** (já verificadas, usadas como dado — não são trabalho desta SPEC):

- `git remote -v` vazio (sem remote hoje); não existe diretório `.github/`.
- `gh auth status`: logado como `nahoL13`, protocolo HTTPS, token válido.
- Node v24.10.0; pnpm 11.11.0; `package.json` `engines.node >=24`.
- `pnpm-workspace.yaml` já contém `allowBuilds: { esbuild: true }`.
- `pnpm install && pnpm lint && pnpm typecheck && pnpm test` verdes localmente na última verificação (248 testes / 36 arquivos, SPEC-0015); `pnpm format:check` **falha** hoje pelos arquivos de `docs/.obsidian/` — é o que a entrega 3 corrige.

---

# Critérios de Aceitação

Cada item é verificável mecanicamente pelo `spec-validator`. **Atenção**: diferente de uma SPEC de código puro, "CI verde" **só se confirma observando um run real no GitHub Actions** após o push — rodar os comandos localmente **não** é suficiente.

- **Repositório remoto existe e é privado**: existe um repositório `nahoL13/Atlas` no GitHub marcado como **private** (verificável por `gh repo view nahoL13/Atlas --json name,visibility,isPrivate` ou `gh repo view nahoL13/Atlas`).
- **`origin` configurado**: `git remote -v` mostra `origin` apontando para `nahoL13/Atlas` (HTTPS).
- **`main` publicada**: a branch `main` existe no remote e reflete o histórico local (verificável por `git ls-remote --heads origin main` / `git status` mostrando `main` rastreando `origin/main`).
- **Workflow existe com os gatilhos corretos**: `.github/workflows/ci.yml` existe e declara `on: push` (todas as branches) **e** `on: pull_request`.
- **Workflow tem os passos corretos**: o job roda em `ubuntu-latest`, usa Node **24** e pnpm **11** via corepack, e executa, nesta ordem, `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm format:check` (com cache de pnpm no setup-node).
- **Fix do Prettier aplicado**: `.prettierignore` contém `docs/.obsidian/`, e `pnpm format:check` passa **localmente** (sai com código 0).
- **CI verde num run real**: existe pelo menos um run do workflow **concluído com sucesso** sobre o commit de `main` publicado — verificável por `gh run list --branch main` mostrando o workflow com `conclusion: success`, e `gh run view <id>` confirmando que todos os passos (lint/typecheck/test/format:check) passaram no runner. Este critério exige a observação do run real, não a execução local dos comandos.
- **Documentação atualizada**: `CLAUDE.md` raiz (estado: remote + CI ativos), `NEXT_CONTEXT.md` e `CURRENT_SPRINT.md` (pendência de remote/CI resolvida; "sem remote" removido) atualizados; lições em `LESSONS_LEARNED.md`.

---

# Arquivos Esperados

```text
.github/workflows/ci.yml     (novo: workflow de CI — gatilhos push/PR, Node 24, pnpm 11)
.prettierignore              (editado: adiciona a linha docs/.obsidian/)

CLAUDE.md (raiz)                                             (editado: estado — remote + CI)
docs/05-context/NEXT_CONTEXT.md                             (editado: remove "sem remote"/pendência)
docs/05-context/CURRENT_SPRINT.md                           (editado)
docs/implementation/LESSONS_LEARNED.md                     (editado)
```

Nenhum arquivo em `packages/*`/`apps/*` é criado ou alterado. A criação do repositório remoto e o push **não** produzem arquivos versionados (exceto a configuração de `origin` em `.git/config`, que não é conteúdo de commit).

Lista é expectativa; ajustes pequenos de nome/local do workflow podem ocorrer, mas o caminho `.github/workflows/ci.yml` é o previsto pelo `ProjectStructure.md`.

---

# Componentes Impactados

- **Infraestrutura de desenvolvimento** (`.github/`, `.prettierignore`) — nova, primeira do projeto
- **Repositório Git** — ganha `origin` no GitHub e `main` publicada
- **Nenhum módulo do produto** (`packages/*`/`apps/*`) — inalterados; esta SPEC não toca código do Atlas
- **Documentação viva** — `CLAUDE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `LESSONS_LEARNED.md`

---

# Interfaces Necessárias

Nenhuma interface de código (TypeScript) é necessária — esta SPEC não altera contratos nem packages. A única "interface" nova é a configuração declarativa do workflow de CI (YAML) e o `origin` do Git.

---

# Fluxo Esperado

```text
Preparação (local):
  adicionar docs/.obsidian/ ao .prettierignore
  criar .github/workflows/ci.yml
  verificar: pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check  → todos verdes
  commit dessas mudanças em main

Publicação (ação outward — EXIGE checkpoint de confirmação humana):
  gh repo create Atlas --private --source=. --remote=origin --push
    ↓ cria nahoL13/Atlas (privado), configura origin, publica main (todo o histórico)

Validação (observação, não execução local):
  push dispara o workflow no GitHub Actions
    ↓ ubuntu-latest, Node 24, pnpm 11 via corepack
    ↓ pnpm install --frozen-lockfile → lint → typecheck → test → format:check
  gh run list --branch main / gh run view <id>  → conclusion: success
```

---

# Estratégia de Implementação

Ordem recomendada — o fix e o workflow **antes** de publicar, para que o primeiro run já nasça verde:

1. **Fix do Prettier primeiro**: adicionar `docs/.obsidian/` ao `.prettierignore`; rodar `pnpm format:check` localmente e confirmar código 0.
2. **Escrever `.github/workflows/ci.yml`**: gatilhos `push`/`pull_request`; job `ubuntu-latest`; `setup-node` com Node 24 e cache de pnpm; `corepack enable`; `pnpm install --frozen-lockfile`; então `lint` → `typecheck` → `test` → `format:check`.
3. **Verificação local completa**: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` — todos verdes, reproduzindo o que o CI fará.
4. **Commit** das duas mudanças (`.prettierignore` + workflow) em `main`.
5. **CHECKPOINT DE CONFIRMAÇÃO HUMANA** antes de qualquer ação outward: apresentar ao usuário o comando `gh repo create ...` e **aguardar aprovação explícita** — este passo publica todo o histórico local num remote e **não** deve ser executado silenciosamente pelo subagent (ver "Restrições").
6. **Após aprovação**: criar o remote e publicar `main` (`gh repo create Atlas --private --source=. --remote=origin --push`).
7. **Observar o run real**: `gh run list --branch main` / `gh run view <id>` até `conclusion: success`. Se vermelho, corrigir (provável causa: `allowBuilds`/`frozen-lockfile` — ver "Observações") e repetir a observação.
8. **Documentação**: `CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `LESSONS_LEARNED.md`.

---

# Estratégia de Testes

Não há testes unitários (nenhum código de produto muda). A "verificação" desta SPEC é operacional:

- **Local**: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` — todos com código 0, reproduzindo o CI antes do push.
- **`format:check` isolado**: confirmar que **antes** do fix ele falha nos arquivos de `docs/.obsidian/` e **depois** do fix passa (prova de que o fix era necessário e é suficiente).
- **Remoto (observação obrigatória)**: um run real do workflow no GitHub Actions concluído com sucesso sobre o commit de `main` — `gh run list`/`gh run view` mostrando todos os passos verdes. Este é o único critério que **não** pode ser satisfeito localmente.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos, **incluindo a observação de um run real de CI verde no GitHub Actions** sobre `main` (não apenas execução local);
- `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` verdes localmente (com o fix do `.prettierignore` aplicado);
- o repositório `nahoL13/Atlas` existe como **privado**, `origin` configurado, `main` publicada;
- documentação atualizada (`CLAUDE.md` raiz; `NEXT_CONTEXT.md`; `CURRENT_SPRINT.md`);
- arquitetura preservada (nenhum módulo do produto alterado; apenas infraestrutura de desenvolvimento em `.github/` e `.prettierignore`, consistente com o `ProjectStructure.md`);
- revisão concluída (Status `Review` → aprovação humana → `Done`);
- lições registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

- **Ação outward exige confirmação humana explícita no momento da execução.** Criar o repositório remoto e publicar `main` (`gh repo create ... --push`) publica **todo o histórico local** num serviço externo. O `spec-implementer` **não** deve executar esse passo silenciosamente: ele deve parar num checkpoint, apresentar o comando exato ao usuário e aguardar aprovação explícita antes de rodá-lo. Preparar o fix, o workflow e o commit local pode ocorrer sem esse checkpoint; **criar/pushar o remote, não.**
- **Repositório privado**, nome `Atlas`, conta `nahoL13` — não usar nome/visibilidade/conta diferentes.
- **Não** criar proteção de branch, ruleset, badges, deploy, releases, Dependabot, templates de Issue/PR.
- **Não** alterar código em `packages/*`/`apps/*`; **não** reformatar o vault do Obsidian (apenas ignorá-lo).
- **Não** alterar `pnpm-workspace.yaml` (o `allowBuilds` já está lá — só verificar como risco).
- **Não** adicionar matriz de Node nem `pnpm build` ao CI.
- Manter a fatia mínima: remote + CI básico + fix do `format:check`, nada além.

---

# Observações

- **Risco conhecido — `allowBuilds` do esbuild (verificar, não trabalhar):** o `pnpm install` do CI depende de `allowBuilds: { esbuild: true }` no `pnpm-workspace.yaml` (esbuild é o motor do `tsx`, ADR-0005). Sem isso, `pnpm install` sai com código 1 (`ERR_PNPM_IGNORED_BUILDS`) — descrito nos "Avisos Operacionais" do `NEXT_CONTEXT.md`. **Já está configurado** no repo (verificado); a SPEC o menciona como ponto de verificação para não ser surpreendido no primeiro run, **não** como novo trabalho.
- **`--frozen-lockfile` no CI**: garante que o `pnpm-lock.yaml` versionado está coerente com os manifestos; se o CI falhar aqui, é sinal de lockfile desatualizado a ser commitado (não de configuração do workflow).
- **Contagem de arquivos do vault**: o `NEXT_CONTEXT.md` menciona "4 arquivos" de `docs/.obsidian/`, mas o diretório contém atualmente 5 arquivos JSON (`app.json`, `appearance.json`, `core-plugins.json`, `graph.json`, `workspace.json`). Isso **não** afeta o fix — ignorar `docs/.obsidian/` cobre todos, independentemente da contagem exata. O implementador deve confiar no diretório, não no número.
- **Prettier já ignora `**/*.md`** por design (protege a documentação manuscrita) — por isso só os JSON do vault quebram o `format:check`, não os `.md`.
- **Por que push antes de proteção de branch**: publicar o remote sem ruleset é intencional nesta fatia — a proteção de branch foi adiada. Não é esquecimento; é escopo.
- **A nota deste ambiente sobre `pnpm --filter <pkg> test`** (os packages não têm script `test` próprio; testes rodam por caminho a partir da raiz) não afeta o CI, que roda `pnpm test` na raiz (`vitest run`) — o comando de topo é o correto para o workflow.

---

# Checklist para IA

Antes de implementar:

- ler o Roadmap (Fase 1.5), o `ProjectStructure.md` (`.github/`) e os "Avisos Operacionais" do `NEXT_CONTEXT.md`;
- compreender o objetivo (remote privado + CI básico + fix do `format:check`);
- confirmar o estado do ambiente (sem remote, `gh` logado como `nahoL13`, `allowBuilds` já presente, `.prettierignore` sem `docs/.obsidian/`);
- internalizar que a criação/push do remote é **ação outward que exige checkpoint de confirmação humana**.

Durante a implementação:

- fazer o fix do `.prettierignore` e o workflow **antes** de publicar, para o primeiro run nascer verde;
- verificar tudo localmente (`install --frozen-lockfile`/`lint`/`typecheck`/`test`/`format:check`) antes do push;
- **parar e pedir aprovação humana** antes de `gh repo create ... --push`;
- não vazar escopo (nada de proteção de branch, build, matriz de Node, badges, templates).

Após a implementação:

- **observar um run real do CI verde** no GitHub Actions sobre `main` (`gh run list`/`gh run view`) — não confiar só na verificação local;
- atualizar documentação (`CLAUDE.md`, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`);
- validar critérios de aceitação;
- registrar lições aprendidas;
- mover Status para `Review`.

---

# Resultado Esperado

Após esta SPEC, o Project Atlas deixa de existir apenas na máquina do autor: passa a ter um **backup remoto privado** (`nahoL13/Atlas`) com `main` publicada, e uma **rede de segurança de CI** que valida `lint`/`typecheck`/`test`/`format:check` a cada push e PR, num runner limpo com Node 24 e pnpm 11. O `format:check` — hoje vermelho pelos arquivos do vault do Obsidian — fica verde após ignorar `docs/.obsidian/`. Nenhum módulo do produto muda; é puramente a **primeira infraestrutura de desenvolvimento** do projeto, protegendo todo o trabalho seguinte da Fase 1. A proteção de branch, o empacotamento da CLI e demais automações permanecem conscientemente fora, mapeados para fatias/fases futuras.

---

# Pontos em aberto — exigem decisão humana antes de `Draft → Ready`

Todos os campos principais desta SPEC rastreiam a fontes existentes (Roadmap 1.5, ProjectStructure, NEXT_CONTEXT, PRD, ambiente já verificado) ou ao briefing já fechado com o usuário. Restam apenas confirmações formais:

1. **Prioridade** — proposta como **Medium** (itens `candidato` no Roadmap, não bloqueiam a Fase 1), com `High` como alternativa defensável pela ordem sugerida ("1.1 e 1.5 primeiro"). O usuário confirma qual.
2. **Checkpoint da ação outward** — a SPEC exige aprovação humana explícita no momento de criar/pushar o remote. O usuário deve confirmar que **ele** dará esse "go" durante a execução (o subagent não publica sozinho). Isso não é decisão de escopo — é reconhecimento do momento de consentimento.

Nenhum outro ponto ficou dependente de decisão: nome (`Atlas`), visibilidade (privado), conta (`nahoL13`), gatilhos, passos e o fix do `.prettierignore` foram todos fixados no briefing e/ou verificados no ambiente.
