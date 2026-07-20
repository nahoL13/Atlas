# Roadmap

> **Project Atlas — Roadmap**

Version: 1.1

Status: Official

---

# Objetivo

Este documento define as macro-fases de evolução do Project Atlas.

Seu propósito é responder a uma pergunta que nenhum outro documento responde: **em que ordem construímos o que falta?**

Este Roadmap não substitui o processo de SPEC (`docs/04-engineering/DevelopmentGuide.md`). Cada item aqui listado só vira trabalho real quando virar uma SPEC aprovada. O Roadmap existe para dar direção de longo prazo; a SPEC continua sendo a única unidade de implementação.

Este documento **não contém datas**. Datas pressupõem previsibilidade que um projeto sem equipe fixa e sem prazo comercial não tem. As fases são ordenadas por dependência lógica e prioridade, não por tempo.

---

# Princípio Orientador

**Núcleo completo antes de interface adicional.**

O `WorkspaceStrategy.md` já estabelece que "o núcleo cognitivo poderá evoluir independentemente da interface desktop", e o `ProjectStructure.md` já trata a CLI (`apps/cli`) como "a primeira interface usada para validar o MVP" — deixando `apps/desktop` para quando houver SPEC aprovada.

Este Roadmap formaliza essa ordem: primeiro o Core (`packages/*`) percorre o Cognitive Lifecycle por inteiro e amadurece suas capacidades de execução; só depois investimos pesado numa segunda interface de usuário. Isso não impede ajustes pontuais na CLI durante a Fase 1 — ela continua sendo o consumidor de validação do Core.

---

# Fase 0 — Fundação (concluída)

Já entregue, SPECs 0001–0015. Resumo (detalhe completo em `docs/05-context/NEXT_CONTEXT.md`):

- Workspace, bootstrap do Core e primeira interface executável (`apps/cli`).
- Acesso a modelos de IA (`@atlas/model-gateway`, providers `fake`/`local`/`remote`).
- Primeira resposta cognitiva ponta a ponta e conversa multi-turno (`@atlas/cognitive`, `atlas ask`/`atlas chat`).
- Context, Persona e Memory Services (`@atlas/context`, `@atlas/persona`, `@atlas/memory`).
- Espinha de execução: Planner produz plano estruturado, Runtime executa Tools reais (`@atlas/runtime`, `@atlas/tools`).
- Permission Service como portão de execução, com leitura, escrita, `confirm` real para ações destrutivas e endurecimento de symlink (`@atlas/permissions`).

Esta fase estabeleceu o padrão arquitetural que todo o resto do Roadmap reutiliza: gateways/portas injetáveis, contratos em `@atlas/contracts`, composição manual no `@atlas/core`, e o ciclo SPEC → `spec-implementer` → `spec-validator`.

---

# Fase 1 — Núcleo Completo (Core 100%)

**Objetivo:** o Core percorre as sete etapas do Cognitive Lifecycle (`docs/03-architecture/CognitiveLifecycle.md`) de ponta a ponta, com capacidades de execução maduras o suficiente para sustentar qualquer interface futura sem precisar reabrir contratos centrais.

Cada item desta fase carrega duas marcações:

- **`gate`** ou **`candidato`** — se o item bloqueia a conclusão da fase, ou se pode escorregar para uma fase seguinte sem reabrir o critério de conclusão.
- **`SPEC direta`** ou **`ADR primeiro`** — a rota de processo que o item exige: continuação incremental já coberta pela documentação existente (vai direto para SPEC), ou mudança estrutural que pede brainstorming e possivelmente ADR próprio antes da SPEC (módulo novo, revisão de decisão anterior).

## Ordem sugerida dentro da Fase 1

1. **1.1 (hardening)** e **1.5 (remote + CI)** primeiro — itens pequenos, baratos, e o CI passa a proteger todo o trabalho seguinte.
2. **1.2 (fechar o ciclo cognitivo)** é o coração da fase — os dois únicos itens que faltam para o Lifecycle completo.
3. **1.3 (memória)** e **1.4 (plataforma)** intercalam conforme dependência — ex.: Aprendizado (1.2) provavelmente puxa memória episódica (1.3).

A priorização fina — qual SPEC vem agora — continua sendo decidida sessão a sessão no `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md`; esta ordem é orientação de sequenciamento, não trilho obrigatório.

## 1.1 Hardening de Execução/Permissão

Continuação direta das SPECs 0010–0015 — itens menores, mais próximos de "pronto":

- `gate · ADR primeiro` — TOCTOU no Permission Service (symlink trocado entre `evaluate` e o uso real pela Tool) — reclassificado de `SPEC direta` para `ADR primeiro` ao desenhar a solução: o fecho atômico revisita a fronteira estrutural do ADR-0013 (decisão pura antes da execução × enforcement no instante do uso). Decisão registrada no [ADR-0014](../06-adr/ADR-0014-toctou-atomic-enforcement.md); implementado pela [SPEC-0017](../implementation/specs/SPEC-0017-toctou-atomic-enforcement.md) (`read_file`/`write_file`/`append_file`; `delete_file`/`mkdir`/`list_dir` e troca de ancestral seguem residuais documentados, candidatos futuros).
- ✅ `gate · SPEC direta` — Múltiplas raízes de leitura/escrita — **entregue pela [SPEC-0018](../implementation/specs/SPEC-0018-multiple-permission-roots-cli.md)**. Nota de precisão: o núcleo (`@atlas/permissions`, `load-config`, contracts/runtime/tools) já avaliava listas desde as SPECs 0011–0012 (`within` = `roots.some(...)`); o gate era só a **borda de entrada da CLI** aceitar mais de uma raiz. Agora `--allow-read`/`--allow-write` são flags repetíveis e `ATLAS_ALLOW_READ`/`ATLAS_ALLOW_WRITE` aceitam lista por `path.delimiter`.
- `candidato · SPEC direta` — `rmdir` / remoção recursiva de diretório (hoje `delete_file` só remove arquivo único).
- `candidato · SPEC direta` — Flag de auto-aprovação não interativa de `confirm` (ex.: `--confirm-destructive`), para uso em automação/scripts.
- `candidato · ADR primeiro` — Dependência de dados entre passos do plano (revisita a decisão de passos independentes do ADR-0012).
- `candidato · ADR primeiro` — Task Manager completo: fila, retry, timeout, cancelamento de execução (módulo novo do catálogo, sem implementação).

## 1.2 Fechar o Ciclo Cognitivo — Observação e Aprendizado

As duas etapas do Cognitive Lifecycle que ainda não têm módulo correspondente:

- ✅ `gate · ADR primeiro` — **Observação** — **entregue pela [SPEC-0019](../implementation/specs/SPEC-0019-observation-replan-loop.md)** (consome o [ADR-0015](../06-adr/ADR-0015-observation-replan-loop.md)). O `runPlanCycle` do Cognitive Core deixou de ser passe único e virou laço com teto fixo (1 replanejamento): a função pura `observe(executionResult)` decide `replan` (só falha de Tool) × `complete` (bloqueio de permissão e recusa no `confirm` são terminais), lendo o campo novo `ExecutedStep.denialKind`. Observador **semântico** guiado por modelo, teto configurável e replan em bloqueio ficam como residuais documentados, candidatos futuros.
- ✅ `gate · ADR primeiro` — **Aprendizado** — **entregue pela [SPEC-0020](../implementation/specs/SPEC-0020-learning-post-turn-extraction.md)** (consome o [ADR-0016](../06-adr/ADR-0016-learning-proposed-extraction.md)). O Cognitive decide — via +1 chamada `generate` de extração após a resposta final de cada turno — quais fatos valem preservar (`learner` puro, framing restrito a fatos afirmados pelo usuário, Artigo 13) e os **propõe** como dado (`learned?`); a borda grava via `memory.remember(texto, 'learned')` e avisa; proveniência `Fact.source?: 'user' | 'learned'`. A **recomposição ao vivo do `memoryPrompt`** foi **entregue pela [SPEC-0021](../implementation/specs/SPEC-0021-live-memory-prompt-recomposition.md)** (nota de atualização nos ADR-0008/0011/0016, sem ADR novo): o `memoryPrompt` virou provider síncrono amostrado 1x/turno, `respond` reescreve/insere a mensagem `system`-cabeça, e o learner passa a ver os fatos conhecidos — fechando o laço de aprendizado dentro da própria sessão e mitigando a duplicação intra-sessão (por instrução ao modelo, sem garantia determinística). Dedup/consolidação **determinística**, retenção/curadoria e gatilho heurístico ficam como residuais documentados, candidatos futuros.

**Com as SPECs 0019 e 0020, o item 1.2 está fechado por inteiro — o Cognitive Lifecycle está implementado nas sete etapas.**

Estas são mudanças arquiteturais novas (exigem brainstorming + possivelmente ADR próprio), não continuação incremental de uma SPEC existente.

## 1.3 Memory Service — Próximas Fatias

- `gate · SPEC direta` — Memória episódica e memória de projetos (hoje só fatos/preferências explícitos) — é o item que cumpre o critério "mais de uma categoria de conhecimento".
- `candidato · SPEC direta` — Busca/indexação sobre os fatos armazenados.
- `candidato · SPEC direta` — Retenção e classificação (nem todo fato tem o mesmo peso/prazo de validade).
- `candidato · SPEC direta` — Relações entre informações.
- ✅ `candidato · SPEC direta` — Deduplicação **determinística** dos fatos aprendidos — **entregue por inteiro**. A [SPEC-0022](../implementation/specs/SPEC-0022-deterministic-fact-deduplication.md) (2026-07-20) cobriu **escritas novas**: `MemoryService.remember` normaliza (`trim`/`toLowerCase`/colapso de `\s+`) e faz no-op idempotente em duplicata, para todo chamador. A [SPEC-0023](../implementation/specs/SPEC-0023-legacy-fact-consolidation-dedupe.md) (2026-07-20) fechou o residual explícito: `MemoryService.dedupe(options?: { apply?: boolean })` (método aditivo, mesmo `normalize` reusado) consolida o **acervo legado** — dry-run por default, `atlas memory dedupe --apply` remove duplicatas mantendo o sobrevivente mais antigo por `createdAt`, sem merge/promoção de `source`/reescrita de texto.
- `candidato · SPEC direta` — Leitura/gravação ao vivo de memória numa sessão `chat` aberta (`/lembrar`, `/esquecer` como comandos de conversa, não só CLI).

## 1.4 Capacidades de Plataforma

- `gate · ADR primeiro` — **Skills e Skill Registry** (`packages/skills`) — hoje o catálogo de módulos já reserva o conceito, mas não existe implementação; criação de módulo novo pede documentação estrutural antes.
- `candidato · SPEC direta` — **Tools de desenvolvimento de software** — a especialidade do Jarvis declarada na Vision ("auxiliar no desenvolvimento de software de forma proativa") ainda não tem nenhum item concreto; as Tools atuais são genéricas de filesystem. Primeiras fatias candidatas: Tools de git somente-leitura (`git_status`, `git_diff`, `git_log`), execução de comandos sob o Permission Service (novo tipo de `access`, exigirá `confirm`), e leitura de estrutura de projeto (detectar linguagem, manifests, scripts). Seguem o padrão incremental das SPECs 0011–0013 (Tools + porta injetável); a **proatividade** em si depende de Observação/Aprendizado (1.2) e provavelmente de Skills — aqui entra só a capacidade, não o comportamento proativo.
- `candidato · ADR primeiro` — **Contexto de ambiente** que o Cognitive/Planner podem ler (cwd, repositório, branch, arquivos abertos) — deixado fora de escopo desde o ADR-0009; incluí-lo revisita aquela decisão.
- `candidato · SPEC direta` — **Provedor nativo da Anthropic** no Model Gateway (hoje o slot pago é atendido por um provedor `remote` genérico OpenAI-compatible).
- `candidato · SPEC direta` — **Config por arquivo** — o slot `arquivo` da precedência `flags > env > arquivo > defaults` (ADR-0006) ainda não foi implementado.
- `candidato · ADR primeiro` — **Event Bus / Plugin Manager** — mencionados no Module Catalog, sem SPEC ainda; módulos novos.

### Aguardando terceiros (não acionável por SPEC)

- Resolução da pendência de **TypeScript pinado em `^5`** — bloqueio externo, aguarda release do typescript-eslint compatível com TS 7.

## 1.5 Infraestrutura de Desenvolvimento (transversal)

Antecipado da antiga lista de expansão: agrega valor já na Fase 1 (CI validando cada SPEC) e um remote é também backup do repositório, que hoje só existe localmente.

- `candidato · SPEC direta` — Remote (GitHub) para o repositório.
- `candidato · SPEC direta` — CI básico rodando `lint`/`typecheck`/`test` a cada push.

O empacotamento/distribuição da CLI permanece na Fase 3 — aqui entra só o que protege o desenvolvimento do Core.

## Critério de Conclusão da Fase 1

A Fase 1 é considerada completa quando todos os itens marcados **`gate`** estiverem entregues:

- ✅ O Cognitive Lifecycle está implementado nas sete etapas (Compreensão → Raciocínio → Planejamento → Execução → Observação → Aprendizado → Resposta) — a Observação foi fechada pela [SPEC-0019](../implementation/specs/SPEC-0019-observation-replan-loop.md) e o Aprendizado pela [SPEC-0020](../implementation/specs/SPEC-0020-learning-post-turn-extraction.md); o item 1.2 está completo.
- ✅ As limitações de segurança marcadas como gate em 1.1 estão fechadas (TOCTOU — [SPEC-0017](../implementation/specs/SPEC-0017-toctou-atomic-enforcement.md) — e múltiplas raízes — [SPEC-0018](../implementation/specs/SPEC-0018-multiple-permission-roots-cli.md)). Limitações novas descobertas depois entram como itens novos com sua própria marcação — este critério cobre a lista atual, não é aberto.
- Skills existem como conceito implementado, não só documentado (gate de 1.4).
- A Memory Service cobre mais de uma categoria de conhecimento, não só fatos explícitos (gate de 1.3).
- Os contratos centrais (`@atlas/contracts`) estão estáveis o suficiente para que uma segunda interface (Fase 2) possa consumi-los sem esperar mudanças estruturais frequentes.

Os itens marcados **`candidato`** não bloqueiam a conclusão — podem ser entregues durante a fase ou migrar para uma fase seguinte sem reabrir este critério.

Esse critério não é automático — a decisão de "Fase 1 está madura o bastante, podemos começar a Fase 2" é do usuário, não do Roadmap.

---

# Fase 2 — Interface Completa (`apps/desktop`)

**Objetivo:** entregar a primeira experiência de usuário além do terminal — prevista desde o `WorkspaceStrategy.md` e o `ProjectStructure.md`, e parcialmente escopada no PRD ("interação por texto; suporte básico à voz").

## 2.1 Fundação da Interface

- Decisão de stack para `apps/desktop` (em aberto — candidata a ADR próprio quando esta fase começar).
- Bootstrap de `apps/desktop` consumindo o Core pelos mesmos contratos já usados pelo `apps/cli` (`atlas.cognitive.ask`/`respond`, `AskResult`/`ConversationTurn`, `steps`).
- Adapters equivalentes aos da CLI, mas para GUI: um `ConfirmPort` que abre um diálogo em vez de pausar o terminal; uma superfície de renderização para os `steps` de execução em vez de texto puro (`renderSteps`).

## 2.2 Experiência Conversacional

- Chat visual multi-turno, equivalente ao `atlas chat`, com histórico persistido pela mesma sessão do Context Service.
- Exibição visual do traço de execução (Tools rodadas, bloqueadas, negadas) — sem expor a arquitetura interna ao usuário (Artigo 7 da Constituição: uma única Persona percebida).
- Confirmação de ações destrutivas via diálogo nativo, não prompt de terminal.

## 2.3 Voz

Já reservado no PRD ("suporte básico à voz") e no `ProjectStructure.md` ("futura entrada e saída por voz" em `apps/desktop`):

- Entrada por voz (STT).
- Saída por voz (TTS).
- Ativação por voz (wake word) — candidato, não comprometido.

## 2.4 Persistência e Gerência Local

- Gerência visual de memória (listar, esquecer fatos pela interface, não só CLI).
- Seleção/troca de Persona em runtime (hoje só por flag/env na inicialização).
- Configuração de permissões (`readRoots`/`writeRoots`) por interface gráfica, não só flags.

## Critério de Conclusão da Fase 2

- O app cobre os mesmos casos de uso do CLI hoje suportados (`ask`, `chat`, Tools, `confirm`, memória) sem regressão de capacidade.
- Voz funcional nos dois sentidos (entrada e saída).
- A experiência permanece de uma única Persona (nenhum vazamento de Planner/Runtime/Permission Service visível ao usuário).

---

# Fase 3 — Expansão da Plataforma (visão de longo prazo, sem compromisso de escopo)

Itens de horizonte mais distante, citados no `WorkspaceStrategy.md`/Module Catalog, sem escopo comprometido:

- `apps/mobile` — adaptação da experiência para dispositivos móveis, desenvolvimento independente do desktop.
- Distribuição/empacotamento da CLI (hoje o `bin` roda via `tsx` em modo dev; falta um binário publicável fora do workspace). O pré-requisito de remote + CI foi antecipado para a Fase 1.5.
- Plugin Manager amadurecido como ecossistema de terceiros (não só mecanismo interno).
- Provedores adicionais de modelo além de Anthropic/OpenAI-compatible.

---

# Como Este Roadmap Deve Ser Usado

- Antes de escolher a próxima SPEC, confira se ela pertence a uma fase e a um item específico deste documento — se não pertencer, é um sinal para atualizar o Roadmap antes de prosseguir (ou decidir conscientemente que é uma exceção).
- Toda SPEC nova declara, no campo **Item do Roadmap** do template, qual item deste documento ela consome. O Roadmap permanece estável durante a fase; a rastreabilidade do que já foi consumido nasce do lado das SPECs, que são atualizadas por natureza.
- A marcação `ADR primeiro` de um item indica que ele exige brainstorming e possivelmente ADR próprio antes de virar SPEC — não pule direto para o `spec-drafter` nesses casos.
- Atualize este documento ao concluir uma fase inteira, ou quando a priorização entre itens mudar significativamente — não a cada SPEC individual (isso é papel do `NEXT_CONTEXT.md`).
- A transição Fase 1 → Fase 2 exige decisão explícita do usuário; o Roadmap não a aciona sozinho.
- Este documento **não** é uma promessa de entrega. É uma ferramenta de sequenciamento, subordinada à Vision, à Constituição e ao PRD — em caso de conflito, eles prevalecem (ordem de prioridade completa em `docs/04-engineering/DevelopmentGuide.md`).

---

# Relação com Outros Documentos

- **NEXT_CONTEXT.md** (`docs/05-context/`): estado imediato, sessão a sessão — o "onde paramos".
- **Roadmap.md** (este documento): direção de longo prazo, fase a fase — o "para onde vamos".
- **CURRENT_SPRINT.md** (`docs/05-context/`): o que está sendo trabalhado agora.

Os três respondem perguntas diferentes e nenhum substitui o outro.
