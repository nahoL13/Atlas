# SPEC-0006 — `atlas chat` (conversa interativa multi-turno)

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0006

---

**Título**

Chat interativo multi-turno na CLI — `atlas chat` + Cognitive Core consciente de conversa

---

**Status**

Done

---

**Prioridade**

Medium

---

# Objetivo

Dar ao Atlas uma **conversa interativa** no terminal: um comando `atlas chat` que abre um loop "digita → responde → repete", **lembrando o histórico enquanto a sessão está aberta** (e esquecendo ao fechar), usando por padrão o modelo local (Ollama).

Ao final desta SPEC deve existir:

- no `CognitiveCore`, além do `ask(objetivo)` atual (inalterado), duas operações que tratam a conversa como **dado** ([ADR-0008](../../06-adr/ADR-0008-conversation-as-data.md)): `startConversation(): Conversation` e `respond(conversation, input): Promise<{ reply, conversation }>` — ambas sem estado;
- um comando novo na CLI — `atlas chat` — que sobe a plataforma, mantém um `Conversation` ao longo do loop, imprime cada resposta e desliga com segurança ao sair;
- tratamento amigável de erro de modelo **dentro** do loop (o chat sobrevive a uma falha e permite tentar de novo).

Trocar o modelo por trás do chat (local grátis ↔ pago) deve continuar sendo apenas configuração, como no `ask`.

---

# Motivação

Depois da [SPEC-0005](SPEC-0005-cognitive-core.md), o Atlas responde, mas só em tiro único (`atlas ask "<objetivo>"`): cada pergunta é independente e o usuário reescreve o contexto toda vez. Para um assistente pessoal, conversar — com o histórico da sessão preservado — é a interação natural. `atlas chat` entrega essa experiência com custo baixo, reaproveitando o Model Gateway e o Cognitive Core já existentes.

O desenho evita as duas armadilhas de escopo: **não** torna o Cognitive Core stateful e **não** cria prematuramente o Context Service. A conversa é um valor imutável que flui pelo sistema (ADR-0008); o Cognitive Core continua uma função pura sobre esse valor; o detentor do valor entre as voltas é o loop da CLI, de forma interina até o Context Service existir.

Origem: pedido do usuário por um fluxo conversável no terminal (2026-07-13), mapeado contra o Module Catalog (Cognitive Core, Context Service) e o Cognitive Lifecycle.

---

# Referências

- `docs/06-adr/ADR-0008-conversation-as-data.md` — conversa como dado; Core stateless; detentor interino na CLI
- `docs/06-adr/ADR-0007-model-gateway-contract-promotion.md` — contratos `ModelGateway`/`CognitiveCore` em `@atlas/contracts`
- `docs/06-adr/ADR-0004-manual-composition.md` — composição por parâmetro; testes sem mock
- `docs/06-adr/ADR-0005-app-typescript-execution.md` — execução de apps via `tsx`
- `docs/03-architecture/ModuleCatalog.md` — Cognitive Core (autoridade de estratégia); Context Service ("estado atual e temporário"); Regras de Dependência 9 e 11
- `docs/03-architecture/CognitiveLifecycle.md` — Compreensão, Raciocínio, Resposta (colapsados)
- `implementation/specs/SPEC-0005-cognitive-core.md` (Review/Done) — `CognitiveCore`, `ask`, mapeamento de `ModelGatewayError`
- `implementation/specs/SPEC-0003-cli-foundation.md` (Done) — Input/Output Gateway, `run()`, precedência de config
- `implementation/LESSONS_LEARNED.md`

---

# Escopo

**Contrato (`@atlas/contracts`):**

- criar o tipo `Conversation` (`{ readonly messages: readonly Message[] }`);
- estender a interface `CognitiveCore` com `startConversation(): Conversation` e `respond(conversation: Conversation, input: string): Promise<ConversationTurn>`, onde `ConversationTurn = { readonly reply: string; readonly conversation: Conversation }`;
- `ask(objective)` permanece inalterado.

**Cognitive Core (`@atlas/cognitive`):**

- implementar `startConversation` (semeia `[{ system: SYSTEM_PROMPT }]`) e `respond` (função pura: anexa `{ user: input }`, chama `gateway.generate({ messages })` uma vez, devolve `reply` = `result.text` e a `conversation` com `{ assistant: reply }` anexado);
- reaproveitar o `SYSTEM_PROMPT` neutro existente; nenhuma mudança em `ask`;
- testes unitários com `gateway` stub (sem rede): multi-turno acumula histórico; `respond` é pura (não muta a conversa de entrada); erro do gateway propaga.

**CLI (`apps/cli`):**

- Input Gateway: reconhecer o comando `chat` (sem positional obrigatório), reaproveitando a resolução de overrides de modelo (flags `--provider`/`--model`/`--base-url`/`--api-key`; envs `ATLAS_MODEL*`) já existente;
- `src/commands/chat.ts`: `runChat(atlas, io)` — mantém `let conv = atlas.cognitive.startConversation()`; num loop de leitura de linhas, chama `atlas.cognitive.respond(conv, linha)`, imprime `reply`, atualiza `conv`; sai em `/sair`, `/exit`, EOF (Ctrl-D) ou interrupção (Ctrl-C); captura `ModelGatewayError` (via `AtlasError.code === 'ATLAS_MODEL_GATEWAY'`) imprimindo a mensagem amigável e **mantendo o loop vivo** (sem anexar o turno falho ao histórico);
- abstrair a fonte de linhas para permitir teste sem TTY (um "line reader" injetável, análogo ao Output Gateway) — a casca `main.ts` liga ao `readline` real do processo;
- `run.ts`: despachar `chat`; atualizar o `HELP_TEXT` com o comando `chat`.

**Documentação:**

- `packages/cognitive/README.md` e `CLAUDE.md`: registrar as operações de conversa;
- `apps/cli` (CLAUDE.md se necessário), `CLAUDE.md` (raiz), `docs/05-context/NEXT_CONTEXT.md` e `CURRENT_SPRINT.md` ao concluir.

---

# Fora do Escopo

- **Auto-gerenciar o processo do Ollama** (subir `ollama serve` se estiver fora, parar ao sair) — gerência de processo externo, com casos de borda (só parar o que nós subimos) e sem dono arquitetural claro; fica para SPEC futura;
- **Pré-checagem/health-check de startup** do Ollama — o chat reaproveita o mapeamento de `ModelGatewayError` já existente na primeira mensagem; adicionar `ModelGateway.health()` fica para SPEC futura;
- **Memória entre sessões** (lembrar conversas após fechar) — responsabilidade do Memory Service, inexistente;
- **Context Service** de verdade — o detentor do valor da conversa é a CLI, interino (ADR-0008);
- **streaming** de tokens — o gateway é de geração única; a resposta é impressa em bloco;
- **Persona/tom "Jarvis"** — o system prompt segue neutro (Persona Service inexistente);
- **múltiplas chamadas ao modelo por turno**, resumo/compactação de histórico, limite de contexto/tokens — v1 envia o histórico inteiro a cada turno;
- **comandos de barra** além de `/sair` e `/exit` (ex.: `/reset`, `/model`) — fora da v1;
- alterar o comportamento do `ask` ou dos provedores do Model Gateway.

---

# Pré-requisitos

[SPEC-0001](SPEC-0001-workspace-bootstrap.md) a [SPEC-0004](SPEC-0004-model-gateway.md) (Done); SPEC-0005 (Review/Done).

ADRs 0001–0007 aceitos; ADR-0008 aceito (esta SPEC).

Ollama instalado e um modelo baixado (ex.: `ollama pull llama3.2`) apenas para a **verificação manual** do caminho `local`; a suíte automatizada não exige Ollama.

---

# Critérios de Aceitação

- `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check` passam;
- `pnpm test` executa todos os testes (incluindo os novos) verdes, **sem acesso à rede**;
- teste comprova: `startConversation()` devolve uma conversa com uma única mensagem `system` (o `SYSTEM_PROMPT`);
- teste comprova: `respond(conversation, input)` monta `[...conversation.messages, { user: input }]`, chama `gateway.generate` uma vez, e devolve `reply === result.text` e uma `conversation` com o `user` e o `assistant` anexados (nessa ordem);
- teste comprova: `respond` **não muta** a conversa de entrada (função pura) e o multi-turno acumula (2 chamadas → histórico com system + 2 pares user/assistant);
- teste comprova: erro do gateway (`ModelGatewayError`) propaga a partir de `respond` sem ser mascarado;
- teste comprova (CLI, input gateway): `chat` é reconhecido e resolve overrides de modelo na precedência `flags > env > defaults`;
- teste comprova (CLI, run): `atlas chat` com provider `fake`, alimentado por uma sequência de linhas terminando em `/sair`, imprime as respostas na ordem, mantém o contexto entre as linhas e retorna `0`;
- teste comprova (CLI, run): uma linha cujo turno lança `ModelGatewayError` (via `fetch` injetado que rejeita, provider `local`) imprime a mensagem amigável no stderr, **não encerra** o loop, e o comando retorna `0` ao sair normalmente;
- `tsx apps/cli/src/main.ts chat` (provider `fake`) sustenta uma conversa e encerra com `0` (verificável sem rede);
- `CLAUDE.md` (raiz) e `NEXT_CONTEXT.md`/`CURRENT_SPRINT.md` atualizados.

---

# Arquivos Esperados

```text
apps/cli/src/
├── commands/
│   └── chat.ts              (novo)
└── gateway/
    └── line-reader.ts       (novo: fonte de linhas injetável + impl. readline)

packages/cognitive/tests/
└── conversation.test.ts     (novo)
```

Modificados:

```text
packages/contracts/src/cognitive.ts      (Conversation, ConversationTurn, CognitiveCore += startConversation/respond)
packages/contracts/src/index.ts          (exports)
packages/cognitive/src/cognitive-core.ts (implementa startConversation/respond)
packages/cognitive/src/index.ts          (se necessário: export de tipos)
apps/cli/src/gateway/input-gateway.ts    (comando chat)
apps/cli/src/run.ts                       (despacho chat + help)
apps/cli/src/main.ts                      (liga o line-reader real)
apps/cli/tests/input-gateway.test.ts      (casos de chat)
apps/cli/tests/run.test.ts                (casos de chat)
packages/cognitive/README.md, packages/cognitive/CLAUDE.md
CLAUDE.md, docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md
```

A divisão exata (ex.: `Conversation` em arquivo próprio de contracts) pode sofrer pequenos ajustes durante a implementação.

---

# Componentes Impactados

- **Cognitive Core** — ganha operações de conversa (mantendo-se stateless).
- **`@atlas/contracts`** — novo tipo `Conversation`/`ConversationTurn`; `CognitiveCore` estendido.
- **Input/Output Gateway** da CLI — novo comando `chat`; nova semente de "line reader".
- **Core** — nenhuma mudança (já compõe e expõe `cognitive`).

---

# Interfaces Necessárias

Em `@atlas/contracts`:

```text
interface Conversation { readonly messages: readonly Message[] }
interface ConversationTurn { readonly reply: string; readonly conversation: Conversation }

interface CognitiveCore {
  ask(objective: string): Promise<string>                 // inalterado
  startConversation(): Conversation                        // novo
  respond(conversation: Conversation, input: string): Promise<ConversationTurn>  // novo
}
```

Em `apps/cli` (semente local, não em contracts — sem 2º consumidor):

```text
interface LineReader {
  next(prompt: string): Promise<string | null>   // null = EOF/fim
  close(): void
}
```

---

# Fluxo Esperado

```text
atlas chat   (provedor default: local/Ollama)

main.ts
  → run(argv, env, gateways, version, deps?)
    → input.normalize → { command: 'chat', configOverride }
    → createAtlas({ config: configOverride }, { fetch })
    → runChat(atlas, { output, lineReader })
        conv = cognitive.startConversation()
        loop:
          linha = await lineReader.next('> ')
          se linha é null | '/sair' | '/exit' → sair do loop
          try:
            { reply, conversation } = await cognitive.respond(conv, linha)
            output.write(reply)
            conv = conversation
          catch ModelGatewayError:
            output.error(mensagem amigável)   // loop continua; conv inalterada
    → atlas.shutdown() → exit 0
```

Precedência de config dos campos de `model` ([ADR-0006](../../06-adr/ADR-0006-config-source-precedence.md)): `flags > env > defaults`.

---

# Estratégia de Implementação

1. **Contrato:** adicionar `Conversation`/`ConversationTurn` e estender `CognitiveCore` em `@atlas/contracts`;
2. **Cognitive Core (TDD):** `startConversation` + `respond` como funções puras; testes de multi-turno, pureza e propagação de erro com gateway stub;
3. **CLI — line reader:** semente `LineReader` injetável + implementação sobre `node:readline`;
4. **CLI — comando (TDD):** `chat` no Input Gateway; `runChat`; despacho e `HELP_TEXT` em `run.ts`; testes com `fake` e sequência de linhas, incluindo o caminho de erro com `fetch` injetado;
5. **Verificação manual:** `tsx apps/cli/src/main.ts chat` contra `fake` e, opcionalmente, contra Ollama local;
6. **Docs + lições.**

---

# Estratégia de Testes

- sem rede e sem mocks de framework: `gateway` stub e, quando preciso, `fetch` injetado que rejeita ([ADR-0004](../../06-adr/ADR-0004-manual-composition.md)); o `LineReader` é stubado por um array de linhas roteirizado;
- **cognitive:** `startConversation` semeia o system prompt; `respond` monta o histórico correto, é pura, acumula no multi-turno e propaga `ModelGatewayError`;
- **cli (input gateway):** parse de `chat` + precedência de model;
- **cli (run):** conversa `fake` com roteiro de linhas termina em `/sair` com saída na ordem e contexto preservado (exit 0); turno com `ModelGatewayError` imprime mensagem amigável, não encerra o loop, exit 0 ao sair;
- verificação dos provedores reais permanece **manual**, fora da suíte.

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `implementation/LESSONS_LEARNED.md`.

---

# Restrições

Não criar módulos ou packages novos: a mudança vive em `@atlas/contracts`, `@atlas/cognitive` e `apps/cli`. Não implementar o Context Service nem o Memory Service.

O Cognitive Core permanece **sem estado** (ADR-0008): `respond` é função pura sobre o valor `Conversation`; o detentor do valor é a CLI, interino. A CLI **não** implementa lógica de conversa (montagem de mensagens/system prompt) — isso é do Cognitive Core (autoridade de estratégia).

O system prompt segue **neutro**; nenhuma persona. Sem streaming; sem gerência de processo do Ollama; sem persistência.

Imports entre packages só via `@atlas/*`; sem path aliases; sem `dist/` (execução via `tsx`). `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` valem como nas SPECs anteriores.

Se a implementação sugerir mudança arquitetural não prevista aqui, **parar e registrar** antes de prosseguir (Constituição).

---

# Observações

O ciclo cognitivo segue honrado de forma **colapsada** (uma chamada `generate` por turno). O multi-turno não muda isso: cada `respond` é uma única geração sobre o histórico acumulado.

Enviar o histórico inteiro a cada turno é aceitável para o MVP; compactação/limite de contexto fica para quando houver necessidade (encaminhamento: SPEC futura, possivelmente junto do Context Service).

Encaminhamento herdado (SPEC-0001…0005): repetir o probe do TypeScript 7 durante a execução (`pnpm add -Dw typescript@^7 && pnpm lint`; se falhar, reverter para `typescript@^5`).

---

# Checklist para IA

Antes de implementar:

- ler documentação referenciada (em especial ADR-0008 e SPEC-0005);
- compreender objetivo;
- identificar módulo responsável;
- validar dependências.

Durante implementação:

- manter responsabilidade única;
- evitar duplicação;
- respeitar arquitetura;
- manter simplicidade.

Após implementação:

- executar testes;
- revisar documentação;
- validar critérios de aceitação;
- registrar lições aprendidas;
- registrar conclusão.

---

# Resultado Esperado

O Atlas passa a **conversar** no terminal: `atlas chat` abre um diálogo que lembra o contexto da sessão, usando por padrão um modelo local gratuito (Ollama) e permitindo trocar para um provedor pago apenas por configuração. O Cognitive Core ganha operações de conversa permanecendo **sem estado** — a conversa é um valor que flui pelo sistema (ADR-0008), pronto para migrar ao Context Service no futuro sem quebra de contrato. Falhas de modelo durante a conversa são exibidas de forma amigável sem derrubar o chat. A suíte cobre a montagem do histórico, a pureza de `respond` e o loop da CLI sem tocar a rede.
