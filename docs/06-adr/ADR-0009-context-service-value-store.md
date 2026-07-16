# ADR-0009 — Context Service como store de valor; a app medeia

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-13

---

# Contexto

O [ADR-0008](ADR-0008-conversation-as-data.md) tratou a conversa como **dado** e deixou o valor `Conversation` interinamente na CLI, prevendo que "quando o Context Service existir, ele passa a ser o detentor". A [SPEC-0007](../implementation/specs/SPEC-0007-context-service.md) cria esse Context Service. Surge uma tensão documental: o [Module Catalog](../03-architecture/ModuleCatalog.md) diz que o Context Service "é utilizado por" o Cognitive Core (sugerindo que o Cognitive lê o Context), enquanto o ADR-0008 mantém `respond` como **função pura**. Se o Cognitive puxasse o histórico do Context por dentro, `respond` deixaria de ser puro — contradição.

---

# Decisão

Nesta fase, o Context Service é um **store de valor**, não um orquestrador:

- Expõe `openSession(conversation) → SessionId`, `getConversation`, `updateConversation`, `closeSession`; guarda uma `Conversation` por sessão em memória.
- **Não** decide estratégia, **não** chama o Cognitive Core, **não** conhece o system prompt (a conversa inicial é semeada por `cognitive.startConversation()`).
- A **aplicação** (hoje `atlas chat`) é a mediadora: lê a conversa do Context, chama o `respond` puro e grava o resultado de volta. A titularidade migra da variável de loop da CLI para o Context; o contrato `respond` fica inalterado (troca de detentor, como o ADR-0008 previu).
- A frase do Module Catalog "Context é utilizado pelo Cognitive Core" refere-se ao **contexto de ambiente** futuro (diretório ativo, repositório, arquivos), que o Cognitive/Planner poderão ler — coisa distinta do buffer de conversa. Essa leitura fica fora do escopo da SPEC-0007.

---

# Consequências

Positivas:

- `respond` continua função pura; o Cognitive Core segue sem estado e sem dependência do Context.
- Limites do Module Catalog preservados: o Context não orquestra; a autoridade de estratégia continua no Cognitive.
- O detentor previsto no ADR-0008 passa a existir sem mudança de contrato.

Custos e riscos:

- A mediação vive na app até que exista uma camada de orquestração dedicada (Planner/Runtime). Aceito como interino e coerente com o MVP.
- Quando o contexto de ambiente for modelado, será preciso decidir como o Cognitive o consome sem reintroduzir estado em `respond` — decisão adiada para a SPEC que o exigir.

---

# Alternativas Consideradas

**Context media o `respond` (`context.respond(sessionId, input)`).** Poria orquestração no Context e inverteria a dependência Cognitive→Context, violando o Module Catalog ("Context não decide estratégias"). Rejeitada.

**Cognitive lê o histórico do Context por dentro.** Tornaria `respond` stateful, contradizendo o ADR-0008. Rejeitada.
