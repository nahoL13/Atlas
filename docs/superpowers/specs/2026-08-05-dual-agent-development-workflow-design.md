# Design — Workflow de desenvolvimento dual para Claude Code e Codex

> Documento de brainstorming, não é SPEC da plataforma Atlas. Define tooling de
> desenvolvimento e servirá de entrada para o plano de implementação. O workflow
> continua subordinado ao processo oficial descrito no Development Guide.

Data: 2026-08-05

---

## Objetivo

Fazer Claude Code e Codex executarem, em paralelo, o mesmo ciclo autônomo de
desenvolvimento do Atlas:

```text
spec-drafter
  → architecture-reviewer
  → spec-implementer
  → spec-validator ou spec-closer no perfil micro
  → spec-closer
```

A paridade cobre:

- o pipeline completo e o ramo micro;
- gates, transições de Status, retries e escalações;
- os cinco agentes especializados;
- skills, hooks e fechamento com commit/push;
- Codex Desktop, CLI e extensão da IDE;
- medição unificada, com cada registro identificado como `Claude` ou `Codex`.

O Claude Code deve continuar utilizável durante e depois da migração. A
adaptação não altera a arquitetura nem o código de produção do Atlas.

---

## Contexto atual

O workflow em produção está documentado em
[`ClaudeCodeAutomation.md`](../../04-engineering/ClaudeCodeAutomation.md) e
implementado principalmente em `.claude/`, `scripts/hooks/` e
`scripts/claude-usage-report.py`.

Já existe um protótipo Codex não commitado no worktree:

- `AGENTS.md`;
- três skills em `.agents/skills/`;
- quatro agentes em `.codex/agents/`;
- três hooks em `.codex/hooks.json`.

Esse protótipo prova que os formatos básicos são reconhecidos, mas ainda não
entrega paridade:

- falta `spec-drafter` no Codex;
- os hooks foram copiados com o schema Claude e procuram
  `tool_input.file_path`, enquanto `apply_patch` no Codex entrega o patch em
  `tool_input.command`;
- `permissionDecision: "ask"` não é suportado no `PreToolUse` do Codex;
- existem referências quebradas como `.Codex/skills`,
  `scripts/Codex-usage-report.py` e documentos `AGENTS.md` de packages que não
  existem;
- a medição lê apenas transcripts Claude e usa pesos específicos da Anthropic.

O protótipo será aproveitado como insumo, não tratado como fonte canônica. As
mudanças não relacionadas já presentes no worktree — em especial ADR-0023 e
SPEC-0052 — ficam fora deste trabalho.

---

## Decisões aprovadas

1. **Dois executores em paralelo.** Claude Code não será substituído.
2. **Paridade completa.** O pedido “faz a SPEC de X” dispara o pipeline inteiro
   nos dois ambientes.
3. **Três superfícies Codex.** Desktop, CLI e extensão da IDE usam a mesma
   configuração versionada.
4. **Uma fonte canônica neutra.** Claude e Codex são adaptadores do Atlas
   Development Workflow.
5. **Artefatos gerados e commitados.** Nenhum bootstrap é necessário para usar
   um dos clientes; a CI detecta deriva.
6. **Quatro skills de workflow.** `spec-pipeline`, `spec-check`,
   `lessons-learned` e `doc-sync`.
7. **Paridade semântica dos hooks.** Onde as APIs diferem, cada adaptador usa a
   decisão nativa que preserva a regra do projeto.
8. **Log único com executor identificado.** Métricas de Claude e Codex não são
   somadas nem comparadas como se tivessem o mesmo custo.
9. **Sem plugin nesta etapa.** Empacotamento como plugin é candidato futuro,
   caso o workflow passe a ser reutilizado fora do Atlas.

---

## 1. Fonte canônica e adaptadores

### 1.1 Estrutura canônica

O conteúdo mantido por humanos ficará sob `.agents/`:

```text
.agents/
  workflow/
    agents/
      spec-drafter.md
      architecture-reviewer.md
      spec-implementer.md
      spec-validator.md
      spec-closer.md
    model-tiers.toml
  skills/
    spec-pipeline/SKILL.md
    spec-check/SKILL.md
    lessons-learned/SKILL.md
    doc-sync/SKILL.md
```

Cada definição canônica de agente contém:

- nome e descrição;
- tier de capacidade, não nome de fornecedor;
- política de escrita (`read-only` ou `workspace-write`);
- instruções completas do papel;
- contrato de entrada, saída e condições de parada.

`spec-pipeline/SKILL.md` é a máquina de estados canônica. As definições dos
agentes descrevem apenas suas fases; não reimplementam a orquestração.

### 1.2 Artefatos gerados

Um gerador determinístico produzirá e manterá versionados:

```text
.claude/agents/*.md
.claude/skills/*/SKILL.md
.claude/settings.json
.codex/agents/*.toml
.codex/hooks.json
.codex/config.toml
```

As skills em `.agents/skills/` são a fonte canônica e, simultaneamente, o
formato nativo consumido pelo Codex. O gerador apenas copia/adapta essas skills
para `.claude/skills/`; nunca reescreve a fonte.

Os blocos de despacho do `CLAUDE.md` e do `AGENTS.md` da raiz também serão
gerados a partir da mesma fonte. O gerador tocará apenas regiões delimitadas
por marcadores, preservando o restante do contexto do projeto.

Os `CLAUDE.md` dos packages permanecem onde estão. `.codex/config.toml`
configurará `CLAUDE.md` como fallback de instruções em diretórios que não têm
`AGENTS.md`, evitando uma segunda cópia de todos os documentos locais nesta
etapa.

### 1.3 Sincronização

O workflow terá dois comandos distintos:

- geração: atualiza os adaptadores a partir da fonte canônica;
- verificação: gera em memória/temporário e falha se o resultado divergir do
  que está commitado.

A verificação entra na CI. Alterar diretamente um artefato gerado deixa um erro
objetivo apontando qual fonte canônica deve ser editada.

---

## 2. Orquestração

O fio principal é um despachante magro. Ele carrega `spec-pipeline`, chama um
agente por fase, repassa somente o contrato de handoff e aplica as transições de
Status que pertencem ao despachante.

Cada handoff contém:

- ID e caminho da SPEC;
- perfil proposto/confirmado;
- número da tentativa naquela fase;
- relatório da fase anterior;
- decisões relevantes da conversa ainda não registradas na SPEC.

Nenhuma fase dependente roda em paralelo. Se um agente obrigatório não estiver
disponível, o workflow para com diagnóstico; o fio principal não absorve a fase
silenciosamente.

### 2.1 Perfil completo

```text
pedido
  → spec-drafter escreve Draft
  → architecture-reviewer aprova e confirma perfil completo
  → fio principal aplica Draft → Ready
  → fio principal aplica Ready → In Progress
  → spec-implementer implementa e reporta
  → fio principal aplica In Progress → Review
  → spec-validator valida
  → fio principal aplica Review → Done
  → spec-closer registra lições, sincroniza docs e faz commit/push
```

Primeiro veto retorna ao drafter uma vez; segundo veto escala ao usuário.
Primeira reprovação retorna ao implementer uma vez; segunda reprovação escala.

### 2.2 Perfil micro

```text
pedido
  → spec-drafter escreve Draft e propõe micro
  → architecture-reviewer confirma elegibilidade
  → fio principal aplica Draft → Ready
  → fio principal aplica Ready → In Progress
  → spec-implementer implementa e reporta
  → fio principal aplica In Progress → Review
  → spec-closer valida
  → spec-closer aplica Review → Done
  → spec-closer registra lições, sincroniza docs e faz commit/push
```

O `spec-validator` separado não é chamado no perfil micro. As duas salvaguardas
permanecem: reviewer no gate Draft → Ready e autor diferente do verificador.

### 2.3 Escalações

O workflow para imediatamente e chama o usuário quando houver:

- emenda à Constituição;
- módulo novo ou responsabilidade movida;
- ADR novo;
- pedido sem base no PRD;
- segundo veto do reviewer;
- segunda reprovação de validação.

O usuário mantém override em qualquer momento.

---

## 3. Política de modelos

A fonte canônica usa tiers de capacidade:

| Tier | Papéis | Claude | Codex |
|---|---|---|---|
| `deep-reasoning` | drafter, reviewer | Opus | GPT-5.6 Sol |
| `balanced-execution` | implementer, validator, closer | Sonnet | GPT-5.6 Terra |

O adaptador Codex configura esforço alto inicialmente para os cinco papéis. O
mapeamento fica separado das instruções, de modo que trocar um modelo não
altere o contrato do agente nem a fonte do pipeline.

O diagnóstico do workflow verifica se os perfis foram descobertos. Falta de
modelo/perfil obrigatório é erro explícito, nunca fallback silencioso para o
fio principal.

---

## 4. Hooks

A lógica deixa os JSONs inline e passa para módulos/scripts testáveis em
`scripts/agent-workflow/`. Adaptadores pequenos traduzem o payload de cada
cliente para decisões comuns.

### 4.1 `UserPromptSubmit`

Reconhece intenções de criar, revisar, implementar, validar e fechar SPECs, ou
registrar lições aprendidas. Sua única responsabilidade é acrescentar contexto
mandando carregar `spec-pipeline`; não repete a sequência inteira em uma string
de shell.

### 4.2 `PreToolUse`

Para edições em `packages/*/src`, `apps/*/src` e `tooling/*/src`:

1. resolve o toplevel real do Git a partir do `cwd` recebido;
2. extrai todos os arquivos tocados;
3. identifica o package/app/tooling correspondente;
4. procura uma SPEC ativa (`Ready` ou `In Progress`) que cubra a mudança;
5. aplica a decisão nativa do cliente.

No Claude, o adaptador preserva `Write/Edit` e a decisão `ask`. No Codex, o
adaptador interpreta `apply_patch` em `tool_input.command`, incluindo
`Add File`, `Update File`, `Delete File` e movimentos. Como o Codex não suporta
`permissionDecision: "ask"` em `PreToolUse`, ausência de SPEC retorna `deny`
com mensagem acionável.

Essa é paridade semântica, não identidade de UI: em ambos os clientes, o
desenvolvimento sem SPEC ativa não prossegue inadvertidamente.

### 4.3 `PostToolUse`

Extrai os arquivos TypeScript efetivamente alterados e executa ESLint somente
neles. Falha de lint vira feedback bloqueante para o agente. A edição já
realizada não é revertida.

### 4.4 `Stop`

Dispara a coleta de tokens:

- Claude conserva a coleta assíncrona;
- Codex usa coleta incremental, síncrona e curta, pois hooks assíncronos não
  são suportados;
- a saída do hook Codex é sempre JSON válido para o evento `Stop`;
- falha de telemetria é registrada, mas nunca bloqueia desenvolvimento.

### 4.5 Política de falhas

- gate de SPEC: fail-closed;
- lint: feedback bloqueante;
- nudge: fail-open com diagnóstico;
- telemetria: fail-open, preservando o último relatório válido;
- commit/push e outras ações externas: permissões nativas de cada cliente.

Hooks locais do Codex exigem a revisão de confiança oferecida pelo cliente na
primeira utilização ou quando o hash da definição mudar. O diagnóstico deve
informar claramente quando essa aprovação ainda está pendente.

---

## 5. Medição unificada

`scripts/claude-usage-report.py` evolui para
`scripts/agent-usage-report.py`, com leitores independentes e uma representação
normalizada.

Cada registro normalizado contém:

- executor (`Claude` ou `Codex`);
- sessão, SPEC, fase e papel;
- modelo;
- tokens de entrada, cache e saída expostos pelo cliente;
- data e versão do leitor.

O resumo versionado continua em
[`TOKEN_USAGE_LOG.md`](../../05-context/TOKEN_USAGE_LOG.md), agora com a coluna
`Executor`. Se uma SPEC usar os dois ambientes, cada executor terá seu próprio
registro e detalhamento por fase.

Não haverá soma ou ranking universal entre Claude e Codex. Tokenizadores,
políticas de cache, limites de assinatura e pesos de preço são diferentes. A
pergunta “cabe numa janela?” usa somente amostras do mesmo executor.

Todo o histórico atual recebe `Executor: Claude` sem recalcular os valores. Os
pesos Anthropic já usados para “tokens efetivos” permanecem válidos somente nas
linhas Claude. Métricas Codex serão rotuladas conforme os campos realmente
disponíveis; ausência de informação vira `N/D`, nunca zero inventado.

O leitor Codex usa o `transcript_path` fornecido pelos hooks. Como o formato de
transcript não é uma interface estável, cada schema aceito terá fixture e
versão explícita. Schema desconhecido produz `telemetria incompleta`, preserva
o relatório anterior e orienta atualizar o leitor.

Relatórios detalhados pessoais continuam separados e ignorados pelo Git; apenas
o resumo por SPEC é compartilhado.

---

## 6. Verificação e diagnóstico

### 6.1 Testes determinísticos

A suíte cobre:

- os mesmos cinco agentes nos dois adaptadores;
- as mesmas quatro skills e contratos de saída;
- JSON/TOML válidos;
- ausência de referências quebradas;
- fluxo completo e micro, incluindo limites de retry;
- payloads de hooks Claude e Codex;
- patches Codex de um e vários arquivos;
- gates com SPEC ausente, `Draft`, ativa e `Done`;
- lint somente dos arquivos tocados;
- fixtures de transcript Claude e Codex;
- geração determinística e detecção de deriva.

Os testes e a CI não chamam modelos nem dependem de autenticação Claude/OpenAI.

### 6.2 Diagnóstico local

Um comando de diagnóstico somente-leitura informa:

- agentes e skills esperados versus encontrados;
- validade dos adaptadores;
- confiança pendente dos hooks Codex, quando observável;
- disponibilidade dos modelos configurados, quando observável;
- compatibilidade do leitor com os transcripts locais;
- divergência entre fonte canônica e arquivos gerados.

O diagnóstico não instala plugins, não muda configurações pessoais e não aprova
hooks em nome do usuário.

### 6.3 Canário operacional

Depois de todos os testes determinísticos verdes, a primeira SPEC real pedida
no Codex será o canário. O aceite operacional exige:

- cinco fases corretamente despachadas no perfil completo, ou o ramo micro
  correto quando aplicável;
- transições de Status feitas pelo dono certo;
- nenhum trabalho absorvido inline pelo fio principal;
- fechamento e commit/push concluídos;
- linha Codex presente no log com fases atribuídas.

Uma falha no canário não afeta o caminho Claude, que permanece disponível.

---

## 7. Migração e rollback

Ordem de implementação:

1. criar fixtures que congelem o comportamento Claude atual;
2. introduzir fonte canônica e geradores;
3. regenerar Claude e comprovar equivalência;
4. corrigir/completar o adaptador Codex e adicionar `spec-drafter`;
5. substituir hooks inline por adaptadores sobre lógica comum;
6. unificar o relatório e migrar o log com identificação de executor;
7. adicionar verificação à CI e documentar o comando de diagnóstico;
8. executar o canário operacional no primeiro trabalho real via Codex.

Os artefatos gerados ficam commitados. Portanto, qualquer estado aprovado pode
ser restaurado por Git e usado sem regeneração. A ativação do Codex não é
pré-condição para o Claude continuar funcionando.

Durante a implementação, staging e commits devem incluir somente os arquivos do
workflow. ADR-0023, SPEC-0052 e quaisquer mudanças pré-existentes do usuário
permanecem intocados.

---

## Fora de escopo

- alterar `packages/*/src`, `apps/*/src` ou comportamento do produto Atlas;
- empacotar/publicar um plugin;
- substituir Claude Code por Codex;
- unificar contas, limites ou cobrança de fornecedores;
- autoaprovar hooks, permissões, commit ou push;
- tornar formatos privados de transcript uma API estável;
- executar agentes/modelos dentro da CI.

---

## Critérios de aceite do design

O trabalho estará concluído quando:

1. Claude e Codex descobrirem os mesmos cinco papéis e quatro skills.
2. “Faz a SPEC de X” executar o mesmo state machine nos dois clientes.
3. Os ramos completo e micro preservarem gates, retries e escalações atuais.
4. O Codex bloquear edição de fonte sem SPEC ativa usando seu schema real de
   `apply_patch`.
5. O lint pós-edição funcionar com os payloads reais dos dois clientes.
6. A CI detectar qualquer deriva entre fonte canônica e adaptadores.
7. O log identificar executor e nunca somar métricas incomparáveis.
8. O pipeline Claude não regredir.
9. Desktop, CLI e IDE do Codex consumirem a mesma configuração versionada.
10. Nenhum arquivo de produção ou mudança pré-existente fora do workflow for
    alterado.

---

## Referências

- [`DevelopmentGuide.md`](../../04-engineering/DevelopmentGuide.md)
- [`ClaudeCodeAutomation.md`](../../04-engineering/ClaudeCodeAutomation.md)
- [`ArchitectureConstitution.md`](../../00-project/ArchitectureConstitution.md)
- [Codex — subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex — hooks](https://learn.chatgpt.com/docs/hooks)
- [Skills](https://learn.chatgpt.com/docs/build-skills)
