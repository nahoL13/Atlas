# Roadmap

> **Project Atlas — Roadmap**

Version: 1.0

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

## 1.1 Hardening de Execução/Permissão

Continuação direta das SPECs 0010–0015 — itens menores, mais próximos de "pronto":

- TOCTOU no Permission Service (symlink trocado entre `evaluate` e o uso real pela Tool).
- Múltiplas raízes de leitura/escrita por invocação (hoje `readRoots`/`writeRoots` são avaliadas como conjunto único).
- `rmdir` / remoção recursiva de diretório (hoje `delete_file` só remove arquivo único).
- Flag de auto-aprovação não interativa de `confirm` (ex.: `--confirm-destructive`), para uso em automação/scripts.
- Dependência de dados entre passos do plano (hoje os passos do Runtime são independentes).
- Task Manager completo: fila, retry, timeout, cancelamento de execução.

## 1.2 Fechar o Ciclo Cognitivo — Observação e Aprendizado

As duas etapas do Cognitive Lifecycle que ainda não têm módulo correspondente:

- **Observação**: avaliar o resultado da execução (sucesso, falha, inconsistência) e decidir se o ciclo volta ao planejamento — hoje o Runtime executa o plano uma única vez, sem reavaliação.
- **Aprendizado**: o Cognitive decide sozinho quais informações preservar na Memory — hoje a Memory só grava por comando explícito do usuário (`atlas remember`).

Estas são mudanças arquiteturais novas (exigem brainstorming + possivelmente ADR próprio), não continuação incremental de uma SPEC existente.

## 1.3 Memory Service — Próximas Fatias

- Memória episódica e memória de projetos (hoje só fatos/preferências explícitos).
- Busca/indexação sobre os fatos armazenados.
- Retenção e classificação (nem todo fato tem o mesmo peso/prazo de validade).
- Relações entre informações.
- Leitura/gravação ao vivo de memória numa sessão `chat` aberta (`/lembrar`, `/esquecer` como comandos de conversa, não só CLI).

## 1.4 Capacidades de Plataforma

- **Skills e Skill Registry** (`packages/skills`) — hoje o catálogo de módulos já reserva o conceito, mas não existe implementação.
- **Contexto de ambiente** que o Cognitive/Planner podem ler (cwd, repositório, branch, arquivos abertos) — deixado fora de escopo desde o ADR-0009.
- **Provedor nativo da Anthropic** no Model Gateway (hoje o slot pago é atendido por um provedor `remote` genérico OpenAI-compatible).
- **Config por arquivo** — o slot `arquivo` da precedência `flags > env > arquivo > defaults` (ADR-0006) ainda não foi implementado.
- **Event Bus / Plugin Manager** — mencionados no Module Catalog, sem SPEC ainda.
- Resolução da pendência de **TypeScript pinado em `^5`** (bloqueio externo — aguarda release do typescript-eslint compatível com TS 7, não é trabalho de SPEC).

## Critério de Conclusão da Fase 1

A Fase 1 é considerada completa quando:

- O Cognitive Lifecycle está implementado nas sete etapas (Compreensão → Raciocínio → Planejamento → Execução → **Observação** → **Aprendizado** → Resposta) — hoje faltam as duas em negrito.
- Nenhuma limitação de segurança conhecida permanece em aberto no Permission Service (TOCTOU fechado, múltiplas raízes suportadas).
- Skills existem como conceito implementado, não só documentado.
- A Memory Service cobre mais de uma categoria de conhecimento (não só fatos explícitos).
- Os contratos centrais (`@atlas/contracts`) estão estáveis o suficiente para que uma segunda interface (Fase 2) possa consumi-los sem esperar mudanças estruturais frequentes.

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
- Distribuição/empacotamento da CLI (hoje o `bin` roda via `tsx` em modo dev; falta um binário publicável fora do workspace).
- Decisão de Remote/GitHub + CI (pré-requisito prático para qualquer distribuição de app fora do ambiente de desenvolvimento local).
- Plugin Manager amadurecido como ecossistema de terceiros (não só mecanismo interno).
- Provedores adicionais de modelo além de Anthropic/OpenAI-compatible.

---

# Como Este Roadmap Deve Ser Usado

- Antes de escolher a próxima SPEC, confira se ela pertence a uma fase e a um item específico deste documento — se não pertencer, é um sinal para atualizar o Roadmap antes de prosseguir (ou decidir conscientemente que é uma exceção).
- Atualize este documento ao concluir uma fase inteira, ou quando a priorização entre itens mudar significativamente — não a cada SPEC individual (isso é papel do `NEXT_CONTEXT.md`).
- A transição Fase 1 → Fase 2 exige decisão explícita do usuário; o Roadmap não a aciona sozinho.
- Este documento **não** é uma promessa de entrega. É uma ferramenta de sequenciamento, subordinada à Vision, à Constituição e ao PRD — em caso de conflito, eles prevalecem (ordem de prioridade completa em `docs/04-engineering/DevelopmentGuide.md`).

---

# Relação com Outros Documentos

- **NEXT_CONTEXT.md** (`docs/05-context/`): estado imediato, sessão a sessão — o "onde paramos".
- **Roadmap.md** (este documento): direção de longo prazo, fase a fase — o "para onde vamos".
- **CURRENT_SPRINT.md** (`docs/05-context/`): o que está sendo trabalhado agora.

Os três respondem perguntas diferentes e nenhum substitui o outro.
