# ADR-0008 — Conversa como dado: multi-turno sem estado no Cognitive Core

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-13

---

# Contexto

A SPEC-0005 entregou o Cognitive Core **sem estado**: `ask(objective)` monta `[system, user]` do zero a cada chamada e não guarda histórico. Isso atende o `atlas ask` de tiro único, mas não um chat multi-turno, em que cada resposta depende das mensagens anteriores da sessão.

A SPEC-0006 introduz `atlas chat` — um loop de conversa que **lembra o histórico enquanto a sessão está aberta** (e esquece ao fechar; persistência entre sessões é do Memory Service, inexistente).

O Module Catalog atribui "representar o estado atual e temporário" ao **Context Service** (`packages/context`, consolidado em `packages/memory`), que **ainda não existe**. Um buffer de conversa de sessão é exatamente esse "estado temporário". Surge então a pergunta: onde vive esse histórico sem (a) violar a responsabilidade catalogada do Context Service, nem (b) tornar o Cognitive Core stateful, nem (c) forçar a criação prematura de um módulo cujo escopo real é mais amplo do que "guardar mensagens de chat"?

---

# Decisão

Tratar a conversa como **dado (valor)**, não como estado de um serviço:

- Define-se, em `@atlas/contracts`, o tipo `Conversation` (`{ readonly messages: readonly Message[] }`) — uma estrutura de dados imutável, como `GenerateRequest` já é.
- O `CognitiveCore` ganha duas operações que **não guardam nada**:
  - `startConversation(): Conversation` — devolve uma conversa inicial semeada com o system prompt neutro;
  - `respond(conversation, input): Promise<{ reply: string; conversation: Conversation }>` — **função pura**: anexa a fala do usuário, chama `gateway.generate` uma vez e devolve a resposta + a conversa atualizada (com a resposta anexada).
- O `ask(objective)` da SPEC-0005 permanece **inalterado**.
- O Cognitive Core permanece **sem estado**: recebe e devolve o histórico; não o armazena.
- O **detentor** do valor `Conversation` entre as voltas é o **chamador**. No `atlas chat`, é a variável do loop `readline`. Isso é **interino e explícito**: quando o Context Service existir, ele passa a ser o detentor do estado temporário de conversa, sem alterar o contrato `respond` (que continua puro).

  > **Realizado na SPEC-0007 / ADR-0009:** o detentor passou a ser o `@atlas/context` (`atlas.context`); `respond` permaneceu puro.

---

# Consequências

Positivas:

- O Cognitive Core continua sem estado (coerente com a SPEC-0005 e com o Princípio de simplicidade) — testável como função pura, sem mocks.
- Nenhum módulo novo é criado; nenhuma responsabilidade catalogada é movida para o package errado. O Context Service não é stubado prematuramente (evita mal-modelá-lo, já que seu papel real — contexto autorizado, observabilidade — é mais amplo).
- A orquestração da conversa (montar mensagens, chamar o gateway) fica no Cognitive Core, o único autorizado a decidir estratégia; a CLI só carrega o valor adiante.
- Migração futura para o Context Service é uma troca de **detentor**, não uma mudança de contrato.

Custos e riscos:

- O valor da conversa mora na borda (a CLI) até o Context Service existir; isto é aceito como interino e documentado aqui. A CLI **não** implementa lógica de conversa — apenas segura e repassa o valor opaco.
- O contrato do `CognitiveCore` cresce (duas operações novas), tornando-se superfície pública estável — mudanças exigem verificar consumidores (`git grep '@atlas/contracts'`).

---

# Alternativas Consideradas

**Sessão com estado a partir do Core (`startConversation()` devolvendo um objeto com `.send()` que acumula por dentro).** Colocaria o *armazenamento* de estado temporário dentro do Cognitive Core — responsabilidade catalogada do Context Service — e contradiria o "sem estado" da SPEC-0005. Rejeitada.

**Context Service mínimo agora.** Seria a colocação mais "correta", mas amplia o escopo do MVP e arrisca mal-modelar um módulo cujo papel real é maior que um buffer de chat. Adiada para quando houver necessidade que justifique o módulo inteiro. Rejeitada por ora.

**Manter o Core stateless e a CLI acumular `Message[]` crus, chamando o gateway direto.** Vazaria a orquestração da conversa (montar mensagens, aplicar o system prompt) para a camada de aplicação, violando a autoridade do Cognitive Core (Regra do Module Catalog: só ele decide estratégia) e o desacoplamento apps→gateway. Rejeitada.
