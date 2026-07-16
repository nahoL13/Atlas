# SPEC-0005 — Cognitive Core (mínimo)

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0005

---

**Título**

Cognitive Core mínimo — primeiro orquestrador + comando `atlas ask` (`packages/cognitive`)

---

**Status**

Done

---

**Prioridade**

High

---

# Objetivo

Criar `packages/cognitive` (`@atlas/cognitive`): o primeiro orquestrador do Atlas e o **primeiro consumidor** do Model Gateway, entregando a primeira resposta cognitiva ponta a ponta.

Ao final desta SPEC deve existir:

- uma função `createCognitiveCore({ gateway })` que devolve um `CognitiveCore` com uma única operação — `ask(objetivo: string): Promise<string>` — que percorre um ciclo cognitivo **mínimo** (compreensão + raciocínio + resposta colapsados numa única chamada `generate()`, moldada por um system prompt neutro) e devolve o texto da resposta;
- o `@atlas/core` compondo o Model Gateway (provedor vindo da configuração) e o Cognitive Core, expondo `cognitive` na plataforma;
- um comando novo na CLI — `atlas ask "<objetivo>"` — que sobe a plataforma, chama `atlas.cognitive.ask(...)`, imprime a resposta e desliga com segurança.

Trocar o modelo por trás do `ask` (local grátis ↔ pago) deve ser apenas configuração; o Cognitive Core não conhece o provedor. O caminho padrão usa o provedor **`local`** (Ollama); `remote` (pago) fica plenamente configurável; `fake` é reservado a testes.

---

# Motivação

O Model Gateway ([SPEC-0004](SPEC-0004-model-gateway.md)) existe mas está **sem consumidor** — o Atlas ainda não produz nenhuma resposta de fato. O Cognitive Core é o componente que falta para fechar o ciclo: é o único autorizado a decidir estratégia ([Module Catalog](../../03-architecture/ModuleCatalog.md), Matriz de Autoridade) e o primeiro consumidor previsto do Model Gateway. Implementá-lo, ainda que mínimo, destrava a **primeira resposta ponta a ponta** e dá à CLI o comando `atlas ask`, tornando a plataforma efetivamente utilizável.

O módulo já está previsto no Module Catalog (`Cognitive Core → packages/cognitive`, camada Intelligence) — não há criação de módulo novo, apenas a primeira implementação de um módulo já aprovado. O desenho respeita o [Cognitive Lifecycle](../../03-architecture/CognitiveLifecycle.md): as etapas 1–2 e 7 (Compreensão, Raciocínio, Resposta) são honradas de forma colapsada; as demais (Planejamento, Execução, Observação, Aprendizado) dependem de módulos que ainda não existem e ficam explicitamente fora de escopo.

Origem: `docs/05-context/NEXT_CONTEXT.md` (SPEC-0005 candidata "Cognitive Core (primeiro orquestrador)") e `docs/03-architecture/ModuleCatalog.md`.

---

# Referências

- `docs/03-architecture/ModuleCatalog.md` — Cognitive Core (responsabilidade, o que produz, o que **não** é responsável); Matriz de Autoridade; Regras de Dependência 9 e 11
- `docs/03-architecture/CognitiveLifecycle.md` — etapas 1 (Compreensão), 2 (Raciocínio) e 7 (Resposta)
- `docs/03-architecture/ProjectStructure.md` (v2.1) — `packages/*`, regras de dependência, localização de testes
- `docs/03-architecture/ArchitecturePrinciples.md` — Princípio 4 (Core orquestrador), Princípio 13 (independência tecnológica)
- `docs/02-product/ProductRequirementsDocument.md` — compreender linguagem natural e responder
- `docs/06-adr/ADR-0004-manual-composition.md` — composição manual por parâmetro
- `docs/06-adr/ADR-0005-app-typescript-execution.md` — execução de TS via `tsx`
- `docs/06-adr/ADR-0006-config-source-precedence.md` — precedência `flags > env > arquivo > defaults`
- `docs/06-adr/ADR-0007-model-gateway-contract-promotion.md` — promoção do contrato do Model Gateway (e do `CognitiveCore`) para `@atlas/contracts`
- `docs/00-project/ArchitectureConstitution.md`
- `implementation/specs/SPEC-0003-cli-foundation.md` (Done) — comando de CLI, Input/Output Gateway, precedência de config
- `implementation/specs/SPEC-0004-model-gateway.md` (Done) — contrato do gateway, `fetch` injetado, provedores
- `implementation/LESSONS_LEARNED.md`

---

# Escopo

**Novo package `@atlas/cognitive`:**

- criar `packages/cognitive` (`package.json`, `tsconfig.json`, `CLAUDE.md`, `README.md`), espelhando o padrão de `@atlas/model-gateway`;
- `src/cognitive-core.ts`: `createCognitiveCore(deps: { gateway: ModelGateway }): CognitiveCore`, a constante de system prompt neutro e a lógica de `ask` (monta `[{system}, {user}]`, chama `gateway.generate`, devolve `result.text`);
- `src/index.ts`: superfície pública (`createCognitiveCore`);
- dependência `@atlas/contracts: workspace:*` (contrato `ModelGateway`/`CognitiveCore`); **nenhuma** dependência de runtime além dessa;
- testes unitários em `packages/cognitive/tests/`, todos com um `gateway` **stub** (sem rede).

**Promoção de contrato ([ADR-0007](../../06-adr/ADR-0007-model-gateway-contract-promotion.md)) em `@atlas/contracts`:**

- mover para `@atlas/contracts` os tipos do gateway hoje locais: `Role`, `Message`, `GenerateRequest`, `GenerateResult`, `ModelGateway`, `ModelGatewayConfig`, `ProviderName`;
- adicionar o contrato `CognitiveCore` (`{ ask(objective: string): Promise<string> }`);
- `AtlasConfig` passa a incluir `model: ModelGatewayConfig`;
- `AtlasPlatform` passa a incluir `cognitive: CognitiveCore`;
- atualizar exports de `@atlas/contracts` (`index.ts`).

**Ajuste em `@atlas/model-gateway`:**

- passar a **importar** os tipos promovidos de `@atlas/contracts` em vez de defini-los localmente; `HttpDeps`, provedores e `createModelGateway` permanecem no package; ajustar imports internos e testes conforme necessário (sem mudança de comportamento).

**Composição em `@atlas/core`:**

- `createAtlas` passa a instanciar `createModelGateway(config.model, { fetch })` e `createCognitiveCore({ gateway })`, expondo `cognitive` na plataforma;
- `createAtlas` aceita um `deps` opcional `{ fetch?: typeof fetch }` (default: `fetch` global) para injeção em testes, coerente com o padrão do gateway ([ADR-0004](../../06-adr/ADR-0004-manual-composition.md));
- `loadConfig`/`defaults` passam a resolver e validar `config.model` (merge aninhado do sub-objeto `model`);
- declarar dependências `@atlas/model-gateway: workspace:*` e `@atlas/cognitive: workspace:*` no `@atlas/core`.

**Integração na CLI `apps/cli`:**

- Input Gateway: reconhecer o comando `ask` com um positional obrigatório (o objetivo) e resolver overrides de modelo (flags `--provider`, `--model`, `--base-url`, `--api-key`; env `ATLAS_MODEL_PROVIDER`, `ATLAS_MODEL`, `ATLAS_MODEL_BASE_URL`, `ATLAS_MODEL_API_KEY`) na precedência `flags > env > defaults`;
- `src/commands/ask.ts`: `runAsk(atlas, objetivo, output)` — chama `atlas.cognitive.ask` e escreve a resposta no Output Gateway;
- `run.ts`: despachar o comando `ask`; capturar `ModelGatewayError` e imprimir uma mensagem amigável (sem stack trace), com exit code `1`; atualizar o `HELP_TEXT` com o comando `ask` e as novas flags;
- `run()`/`main.ts`: encadear o `deps { fetch }` opcional até `createAtlas` (default global; testes injetam stub).

**Documentação:**

- `CLAUDE.md` (raiz): registrar `@atlas/cognitive` no estado do projeto; remover `packages/cognitive` da seção "Referenciado na documentação, mas ainda não criado";
- atualizar `docs/05-context/NEXT_CONTEXT.md` e `docs/05-context/CURRENT_SPRINT.md` ao concluir.

---

# Fora do Escopo

- **Planejamento, Execução, Observação e Aprendizado** (etapas 3–6 do Cognitive Lifecycle) — dependem de Planner, Runtime, Memory e Context, que não existem;
- **saídas estruturadas** do Cognitive Core (intenção estruturada, classificação de complexidade, estratégia, capacidades necessárias, avaliação de risco, solicitação de planejamento) — nenhum consumidor as usa ainda; construí-las agora é especular;
- **etapas nomeadas separadas em código** (funções-etapa vazias) — o ciclo é honrado de forma colapsada; a separação virá quando houver consumidores;
- **múltiplas chamadas ao modelo** por `ask` (ex.: classificar intenção antes de responder) — v1 faz uma única chamada `generate`;
- **histórico / conversa multi-turno / memória / contexto** — o Cognitive Core desta SPEC é sem estado; cada `ask` é independente;
- **Persona / tom / identidade "Jarvis"** — o system prompt é neutro e orientado à tarefa; personalidade é responsabilidade do Persona Service (inexistente), em SPEC futura;
- **streaming** de tokens — o contrato do gateway é de geração única;
- **Permission Service, Skills, Tools, Event Bus** — fora deste ciclo;
- **novo provedor de modelo** (ex.: Anthropic nativo) — o slot pago segue atendido pelo `remote` OpenAI-compatible;
- alterar o **comportamento** dos provedores do Model Gateway — o ajuste no package é só de imports (tipos promovidos).

---

# Pré-requisitos

[SPEC-0001](SPEC-0001-workspace-bootstrap.md), [SPEC-0002](SPEC-0002-core-bootstrap.md), [SPEC-0003](SPEC-0003-cli-foundation.md) e SPEC-0004 (todas Done).

ADRs 0001–0006 aceitos; ADR-0007 aceito (esta SPEC).

Ollama instalado e um modelo baixado (ex.: `ollama pull llama3.2`) apenas para a **verificação manual** do caminho `local`; a suíte automatizada não exige Ollama.

---

# Critérios de Aceitação

- `pnpm install` conclui sem erros;
- `pnpm lint` passa sem erros;
- `pnpm typecheck` passa, cobrindo `@atlas/cognitive` e as mudanças em contracts/core/cli;
- `pnpm format:check` passa;
- `pnpm test` executa todos os testes (incluindo os novos) verdes, **sem acesso à rede**;
- teste comprova: `createCognitiveCore({ gateway }).ask(objetivo)` monta uma requisição com uma mensagem `system` (prompt neutro) seguida do `objetivo` como mensagem `user`, e devolve o `text` retornado pelo `gateway`;
- teste comprova: erro do gateway (`ModelGatewayError`) propaga a partir de `ask` sem ser mascarado;
- teste comprova: `createAtlas` com `config.model.provider = 'fake'` expõe `atlas.cognitive` e `ask` responde (sem rede);
- teste comprova: `loadConfig` aplica os defaults de `model` (`provider: 'local'`, `model: 'llama3.2'`) e valida — `provider` inválido, `remote` sem `apiKey`, e provedor não-`fake` sem `model` ⇒ `InvalidConfigError`;
- teste comprova: precedência `flags > env > defaults` para os campos de `model` na resolução do Input Gateway;
- teste comprova: no caminho `ask` da CLI, um gateway que lança `ModelGatewayError` (via `fetch` injetado que rejeita, provedor `local`) resulta em mensagem amigável no stderr e exit code `1` — sem stack trace;
- teste comprova: no caminho `ask` da CLI com provedor `fake`, a resposta é escrita no stdout e o exit code é `0`;
- `tsx apps/cli/src/main.ts ask "diga olá" --provider fake` imprime a resposta e encerra com código `0` (verificável sem rede/credenciais);
- estrutura corresponde à seção "Arquivos Esperados";
- `CLAUDE.md` (raiz) atualizado (package registrado; removido da seção de itens ainda não criados).

---

# Arquivos Esperados

```text
packages/
└── cognitive/
    ├── src/
    │   ├── index.ts
    │   └── cognitive-core.ts
    ├── tests/
    │   └── cognitive-core.test.ts
    ├── CLAUDE.md
    ├── README.md
    ├── package.json
    └── tsconfig.json

apps/cli/src/
    └── commands/
        └── ask.ts            (novo)
```

Modificados:

```text
packages/contracts/src/config.ts        (AtlasConfig += model)
packages/contracts/src/platform.ts      (AtlasPlatform += cognitive)
packages/contracts/src/model.ts         (novo: tipos do gateway promovidos)
packages/contracts/src/cognitive.ts     (novo: contrato CognitiveCore)
packages/contracts/src/index.ts         (exports)
packages/model-gateway/src/*            (importar tipos de @atlas/contracts)
packages/core/src/index.ts              (compõe gateway + cognitive; deps { fetch })
packages/core/src/config/defaults.ts    (defaults de model)
packages/core/src/config/load-config.ts (merge + validação de model)
apps/cli/src/gateway/input-gateway.ts   (comando ask + flags/env de model)
apps/cli/src/run.ts                      (despacho ask + mapeamento de erro + help)
apps/cli/src/main.ts                     (encadeia deps fetch, se necessário)
CLAUDE.md, docs/05-context/NEXT_CONTEXT.md, docs/05-context/CURRENT_SPRINT.md
```

A divisão exata de arquivos em `@atlas/contracts` (um ou mais arquivos novos) pode sofrer pequenos ajustes durante a implementação.

---

# Componentes Impactados

- **Cognitive Core** (Module Catalog, camada Intelligence) — primeira implementação.
- **Core** (composition root) — passa a compor gateway + cognitive e a expor `cognitive`.
- **Model Gateway** — ajuste de imports (tipos promovidos), sem mudança de comportamento.
- **Input/Output Gateway** da CLI — novo comando `ask` e novas fontes de config.
- **`@atlas/contracts`** — recebe os contratos promovidos (ADR-0007).

---

# Interfaces Necessárias

Em `@atlas/contracts` (promovidos — ADR-0007):

```text
// Contrato do Model Gateway (movido de @atlas/model-gateway, sem alteração)
Role, Message, GenerateRequest, GenerateResult, ModelGateway,
ModelGatewayConfig, ProviderName

// Novo contrato do Cognitive Core
CognitiveCore {
  ask(objective: string): Promise<string>
}

// AtlasConfig ganha:
model: ModelGatewayConfig      // provider default 'local', model default 'llama3.2'

// AtlasPlatform ganha:
cognitive: CognitiveCore
```

Em `@atlas/cognitive` (implementação):

```text
createCognitiveCore(deps: { gateway: ModelGateway }): CognitiveCore
SYSTEM_PROMPT: string          // neutro, orientado à tarefa, em português; não é persona
```

Em `@atlas/core` (composição):

```text
createAtlas(
  options?: { config?: Partial<AtlasConfig> },
  deps?: { fetch?: typeof fetch }
): Promise<AtlasPlatform>
```

Nenhuma interface pública nova além das listadas.

---

# Fluxo Esperado

```text
atlas ask "resuma X"  (provedor default: local/Ollama)

main.ts
  → run(argv, env, gateways, version, deps?)
    → input.normalize → { command: 'ask', objective, configOverride }
    → createAtlas({ config: configOverride }, { fetch })
        loadConfig → valida config.model
        createModelGateway(config.model, { fetch })   // seleciona provedor
        createCognitiveCore({ gateway })
    → runAsk(atlas, objective, output)
        atlas.cognitive.ask(objective)
          gateway.generate({ messages: [ {system: SYSTEM_PROMPT}, {user: objective} ] })
        output.write(resposta)
    → atlas.shutdown() → exit 0

Erro do modelo (ex.: Ollama fora do ar):
  gateway lança ModelGatewayError
    → run() captura → mensagem amigável no stderr → exit 1
```

Precedência de config dos campos de `model` ([ADR-0006](../../06-adr/ADR-0006-config-source-precedence.md)): `flags > env > defaults`.

---

# Estratégia de Implementação

1. **Promoção de contrato (ADR-0007):** mover os tipos do gateway para `@atlas/contracts`; adicionar `CognitiveCore`; estender `AtlasConfig`/`AtlasPlatform`; ajustar `@atlas/model-gateway` para importar de contracts (rodar os testes do gateway para garantir zero regressão);
2. **`@atlas/cognitive`:** esqueleto do package; `createCognitiveCore` + system prompt (TDD: monta system+user; retorna texto; propaga erro do gateway);
3. **`@atlas/core`:** defaults e validação de `config.model` (TDD); compor gateway + cognitive em `createAtlas`; `deps { fetch }` opcional (TDD com provider `fake` e com `fetch` injetado que rejeita);
4. **CLI:** Input Gateway reconhece `ask` + flags/env de model com precedência (TDD); `runAsk`; despacho e mapeamento de `ModelGatewayError` em `run.ts` (TDD); `HELP_TEXT`;
5. **Verificação real (manual):** `tsx apps/cli/src/main.ts ask "..." --provider local --model llama3.2` contra Ollama;
6. **Docs:** `README`/`CLAUDE.md` do package, `CLAUDE.md` raiz, contexto; validar critérios; registrar lições.

---

# Estratégia de Testes

- testes sem rede e sem mocks de framework — o `gateway` é um **stub** (objeto que implementa `ModelGateway`) e, quando preciso exercitar o caminho de rede, injeta-se um `fetch` que rejeita (ADR-0004);
- **cognitive-core:** `ask` monta `[{system}, {user}]` e retorna `result.text`; `ModelGatewayError` do gateway propaga;
- **core:** defaults e validação de `config.model` (provider inválido, `remote` sem `apiKey`, não-`fake` sem `model`); `createAtlas` com `provider: 'fake'` expõe `cognitive` funcional; com `fetch` injetado que rejeita e `provider: 'local'`, `ask` lança `ModelGatewayError`;
- **cli (input gateway):** parse do comando `ask` + objetivo; precedência `flags > env > defaults` dos campos de model; ausência do objetivo ⇒ `CliUsageError`;
- **cli (run):** caminho `ask` com `fake` escreve no stdout e retorna `0`; `ModelGatewayError` ⇒ mensagem amigável no stderr e exit `1`;
- verificação dos provedores reais (Ollama/remoto) permanece **manual**, fora da suíte.

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

Não criar módulos, serviços ou packages além de `packages/cognitive` (módulo já previsto no Module Catalog).

O Cognitive Core **não** executa comandos, não modifica arquivos, não chama Tools, não persiste memória, não formata a personalidade da resposta e não gerencia Tasks (Module Catalog). É **sem estado** nesta SPEC.

O Core permanece o único package autorizado a importar implementações de outros packages, exclusivamente para composição (Regra 11). `@atlas/cognitive` depende do **contrato** `ModelGateway` em `@atlas/contracts`, nunca do package `@atlas/model-gateway` (Regra 9).

O system prompt é **neutro** (orientado à tarefa), não uma persona — tom/identidade são do Persona Service (inexistente).

Sem dependências de runtime externas: `@atlas/cognitive` depende apenas de `@atlas/contracts`; integração HTTP segue via `fetch` global do Node no gateway. `tsx` é dev tooling.

Imports entre packages exclusivamente via nome `@atlas/*`; sem path aliases. Sem `dist/`: execução direta do fonte `.ts` via `tsx`.

Se a implementação sugerir necessidade de mudança arquitetural não prevista aqui, **parar e registrar** antes de prosseguir (Constituição).

---

# Observações

O ciclo cognitivo é honrado de forma **colapsada**: uma única chamada `generate` cobre Compreensão + Raciocínio + Resposta. Isso é deliberado e documentado — quando Planner/Runtime/Memory/Context existirem, o `ask` evoluirá para orquestrar as demais etapas, sem quebrar o contrato `CognitiveCore` (que poderá ganhar operações/retornos mais ricos em SPEC futura).

Default de modelo `llama3.2`: escolhido por ser um modelo pequeno e comum no Ollama. O usuário pode sobrepor via `--model`/`ATLAS_MODEL`. Se o modelo não estiver baixado, o Ollama responde com erro HTTP, convertido em `ModelGatewayError` e exibido de forma amigável.

Encaminhamento herdado (SPEC-0001…0004): durante a execução, repetir o probe do TypeScript 7 (`pnpm add -Dw typescript@^7 && pnpm lint`; se falhar, reverter para `typescript@^5`). O typescript-eslint quebrou com o TS 7 em 2026-07-10, 07-11 e 07-12.

Lembrete operacional: confirmar que o novo package não reintroduz `ERR_PNPM_IGNORED_BUILDS` (aprovação de build do `esbuild`/`tsx` vive em `pnpm-workspace.yaml`).

---

# Checklist para IA

Antes de implementar:

- ler documentação referenciada;
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

O Atlas passa a produzir sua **primeira resposta cognitiva ponta a ponta**. Existe `@atlas/cognitive`: o primeiro orquestrador, primeiro consumidor do Model Gateway, com uma operação `ask(objetivo)` que percorre um ciclo cognitivo mínimo e devolve texto. O `@atlas/core` compõe gateway + cognitive e expõe `atlas.cognitive`; a CLI ganha `atlas ask "<objetivo>"`, usando por padrão um modelo local gratuito (Ollama) e permitindo trocar para um provedor pago apenas por configuração.

Falhas de modelo (ex.: Ollama fora do ar) são exibidas de forma clara e amigável, sem stack trace. A suíte de testes cobre a construção da requisição, a seleção/validação de provedor e o mapeamento de erro na CLI sem tocar a rede. O contrato do Model Gateway e o novo `CognitiveCore` vivem em `@atlas/contracts` (ADR-0007), com `@atlas/cognitive` dependendo de contrato, não de implementação. A base fica pronta para as próximas etapas do ciclo cognitivo (Planner, Runtime, Memory) em SPECs futuras.
