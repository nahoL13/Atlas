# SPEC-0004 — Model Gateway

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0004

---

**Título**

Model Gateway — acesso padronizado a modelos de IA (`packages/model-gateway`)

---

**Status**

Done

---

**Prioridade**

High

---

# Objetivo

Criar `packages/model-gateway` (`@atlas/model-gateway`): uma interface única e estável para gerar texto a partir de modelos de IA, com o **provedor selecionável por configuração**.

Ao final desta SPEC deve existir uma função `createModelGateway(config)` que devolve um `ModelGateway` com uma única operação — `generate(request): Promise<GenerateResult>` (geração única, sem streaming) — e três provedores intercambiáveis por trás do mesmo contrato:

- `fake` — respostas determinísticas em memória, sem rede (usado nos testes/CI);
- `local` — modelo local via Ollama (grátis);
- `remote` — endpoint remoto compatível com o protocolo OpenAI Chat Completions (`baseUrl` + `apiKey` + `model`), cobrindo provedores pagos genéricos, sem o gateway conhecer o fornecedor.

Trocar de provedor deve ser apenas uma mudança de configuração; nenhum consumidor do gateway toca no provedor. Um **script de smoke** de verificação (`scripts/smoke.ts`, via `tsx`) demonstra a troca `local ↔ remote` ao vivo.

---

# Motivação

A fundação do MVP (workspace + `@atlas/core` + `apps/cli`) está entregue, mas o Atlas ainda não consegue produzir nenhuma resposta cognitiva de fato porque não há acesso a modelos de IA. O Model Gateway é o adaptador que falta e que destrava toda a linha cognitiva futura (Cognitive Core, Planner, Skills), isolando o provedor de modelo do resto da plataforma.

O módulo já está previsto no Module Catalog (`Model Gateway → packages/model-gateway`, camada Extension) — portanto não há criação de módulo novo, apenas a primeira implementação de um módulo já aprovado. O desenho materializa o Princípio 13 (independência tecnológica / provedor substituível): modelos são provedores substituíveis e não fazem parte da identidade do Atlas.

Origem: `docs/05-context/NEXT_CONTEXT.md` (SPEC-0004 a definir; Model Gateway listado como candidata) e `docs/03-architecture/ModuleCatalog.md`.

---

# Referências

- `docs/03-architecture/ModuleCatalog.md` — Model Gateway (responsabilidade, quem usa, o que não é responsável)
- `docs/03-architecture/ProjectStructure.md` (v2.1) — `packages/*`, regras de dependência, localização de testes
- `docs/03-architecture/ArchitecturePrinciples.md` — Princípio 5 (adaptadores sem lógica de negócio), Princípio 13 (independência tecnológica)
- `docs/02-product/ProductRequirementsDocument.md` — compreender linguagem natural; acesso a modelos via Model Gateway (Rastreabilidade)
- `docs/06-adr/ADR-0002-typescript-node.md` — stack; padrão sem `dist/`
- `docs/06-adr/ADR-0004-manual-composition.md` — composição manual por parâmetro (dependências injetadas)
- `docs/06-adr/ADR-0005-app-typescript-execution.md` — execução de TS via `tsx`
- `docs/00-project/ArchitectureConstitution.md`
- `implementation/specs/SPEC-0002-core-bootstrap.md` (Done) — padrão de package, erros estruturados (`AtlasError`)
- `implementation/specs/SPEC-0003-cli-foundation.md` (Done) — gateways como interfaces locais; composição por parâmetro
- `implementation/LESSONS_LEARNED.md`

---

# Escopo

- criar `packages/model-gateway` (`@atlas/model-gateway`): `package.json`, `tsconfig.json`, `CLAUDE.md`, `README.md`, espelhando o padrão de `@atlas/core`;
- `src/model-gateway.ts`: tipos públicos (`Role`, `Message`, `GenerateRequest`, `GenerateResult`, `ModelGateway`, `ModelGatewayConfig`, `ProviderName`) e a fábrica `createModelGateway(config)` que seleciona o provedor por `config.provider`;
- `src/errors.ts`: `ModelGatewayError extends AtlasError` (importado de `@atlas/contracts`) para falhas de configuração e de provedor;
- `src/providers/fake.ts`: `createFakeProvider(config?)` — respostas determinísticas em memória, sem rede;
- `src/providers/ollama.ts`: `createOllamaProvider(config, deps?)` — provedor `local` via HTTP do Ollama; recebe `fetch` por parâmetro (default: `fetch` global), `baseUrl` default `http://localhost:11434`;
- `src/providers/remote.ts`: `createRemoteProvider(config, deps?)` — provedor `remote` compatível com OpenAI Chat Completions; recebe `fetch` por parâmetro; exige `baseUrl` e `apiKey`;
- `src/index.ts`: superfície pública do package (`createModelGateway`, tipos, `ModelGatewayError`);
- `scripts/smoke.ts`: script de verificação de dev (executado via `tsx`) — parseia `--provider fake|local|remote` (e `--model`) com `node:util`, compõe a config a partir de flags + `env` (`ATLAS_MODEL_*`), chama `generate` com um prompt de exemplo e imprime a resposta;
- testes unitários em `packages/model-gateway/tests/`, todos contra o provedor `fake` ou com `fetch` injetado (sem rede);
- declarar a dependência `@atlas/contracts: workspace:*` (para `AtlasError`) e `tsx` como `devDependency` (para o smoke script);
- atualizar `CLAUDE.md` (raiz): registrar o package no estado do projeto e remover `packages/model-gateway` da seção "Referenciado na documentação, mas ainda não criado";
- atualizar `docs/05-context/NEXT_CONTEXT.md` e `docs/05-context/CURRENT_SPRINT.md` ao concluir.

---

# Fora do Escopo

- **streaming** de tokens e **tool-use** (o modelo pedir chamadas de ferramenta) — contrato de geração única apenas;
- **políticas de seleção, fallback entre provedores e métricas de uso** (o Module Catalog permite, mas ficam para SPEC futura) — v1 usa um único provedor configurado;
- **provedor nativo da Anthropic** (API Messages própria): o slot pago é atendido pelo provedor `remote` genérico (OpenAI-compatible); um provedor nativo pode ser adicionado depois sem mudar a interface;
- qualquer **consumo do gateway pela CLI, pelo Core ou por outro package** — não há consumidor nesta SPEC além do smoke script de verificação;
- **promover os tipos para `@atlas/contracts`** — só quando um segundo package precisar deles, via ADR (regra do Project Structure);
- **alterar `@atlas/contracts`, `@atlas/core` ou `apps/cli`** — se a implementação sugerir necessidade de mudança neles, **parar e registrar** (Constituição);
- **persistência, memória, contexto de conversa** — o gateway é sem estado; guardar histórico é responsabilidade de outros módulos;
- adicionar SDKs de provedor como dependência de runtime — a integração HTTP usa o `fetch` global do Node.

---

# Pré-requisitos

SPEC-0001 (Done) e SPEC-0002 (Done) — workspace e `@atlas/contracts` (com `AtlasError`) existentes.

ADRs 0001, 0002, 0003, 0004 e 0005 aceitos.

---

# Critérios de Aceitação

- `pnpm install` conclui sem erros;
- `pnpm lint` passa sem erros;
- `pnpm typecheck` passa, cobrindo o novo `packages/model-gateway`;
- `pnpm test` executa os testes do novo package junto dos demais, todos verdes, **sem acesso à rede**;
- teste comprova: `createModelGateway({ provider: 'fake' }).generate(req)` devolve um `GenerateResult` determinístico;
- teste comprova: seleção de provedor por `config.provider` (`fake` / `local` / `remote`);
- teste comprova: provedor desconhecido ⇒ `ModelGatewayError`;
- teste comprova: `remote` sem `baseUrl` ou sem `apiKey` ⇒ `ModelGatewayError`; `local`/`remote` sem `model` ⇒ `ModelGatewayError`;
- teste comprova: o provedor `local` (Ollama) monta a requisição HTTP correta e mapeia a resposta em `GenerateResult`, usando um `fetch` **injetado** (stub), sem rede;
- teste comprova: o provedor `remote` (OpenAI-compatible) monta a requisição correta (headers de auth, corpo com `messages`/`model`) e mapeia a resposta, usando `fetch` injetado;
- teste comprova: erro HTTP do provedor (status ≥ 400 ou falha de `fetch`) é convertido em `ModelGatewayError` com mensagem clara;
- `tsx packages/model-gateway/scripts/smoke.ts --provider fake` imprime uma resposta e encerra com código `0` (verificável sem rede/credenciais);
- estrutura corresponde à seção "Arquivos Esperados";
- `CLAUDE.md` atualizado (package registrado; removido da seção de itens ainda não criados).

---

# Arquivos Esperados

```text
packages/
└── model-gateway/
    ├── src/
    │   ├── index.ts
    │   ├── model-gateway.ts
    │   ├── errors.ts
    │   └── providers/
    │       ├── fake.ts
    │       ├── ollama.ts
    │       └── remote.ts
    ├── scripts/
    │   └── smoke.ts
    ├── tests/
    │   ├── model-gateway.test.ts
    │   ├── fake.test.ts
    │   ├── ollama.test.ts
    │   └── remote.test.ts
    ├── CLAUDE.md
    ├── README.md
    ├── package.json
    └── tsconfig.json
```

Modificados: `CLAUDE.md` (raiz), `docs/05-context/NEXT_CONTEXT.md`, `docs/05-context/CURRENT_SPRINT.md`.

Essa lista representa uma expectativa e pode sofrer pequenos ajustes durante a implementação.

---

# Componentes Impactados

- **Model Gateway** (Module Catalog, camada Extension) — primeira implementação.

Consome, sem alterar: `@atlas/contracts` (`AtlasError`). Não toca em `@atlas/core` nem `apps/cli`.

---

# Interfaces Necessárias

Locais em `packages/model-gateway` (não em `@atlas/contracts` — ainda não há segundo consumidor):

```text
Role = 'system' | 'user' | 'assistant'

Message {
  role: Role
  content: string
}

GenerateRequest {
  messages: Message[]
  model?: string          // provedores local/remote exigem model (config ou request)
  temperature?: number
  maxTokens?: number
}

GenerateResult {
  text: string            // mínimo; pode crescer (usage, model) em SPEC futura
}

ModelGateway {
  generate(request: GenerateRequest): Promise<GenerateResult>
}

ProviderName = 'fake' | 'local' | 'remote'

ModelGatewayConfig {
  provider: ProviderName
  model?: string          // default do provedor
  baseUrl?: string        // local: default http://localhost:11434 ; remote: obrigatório
  apiKey?: string         // remote: obrigatório
  // fake: respostas canned opcionais
}

createModelGateway(config: ModelGatewayConfig): ModelGateway
```

Dependência injetável dos provedores de rede (composição, ADR-0004):

```text
HttpDeps { fetch: typeof fetch }   // default: fetch global; testes injetam stub
```

Erro:

```text
ModelGatewayError extends AtlasError   // config inválida, credencial/baseUrl ausente, falha HTTP do provedor
```

Nenhuma interface nova em `@atlas/contracts`.

---

# Fluxo Esperado

```text
createModelGateway(config)
   └─ seleciona por config.provider:
        fake   → createFakeProvider(config)
        local  → createOllamaProvider(config, { fetch })
        remote → createRemoteProvider(config, { fetch })
      provider desconhecido → ModelGatewayError

gateway.generate(request):
   local/remote:
     valida config (model, baseUrl/apiKey) → ModelGatewayError se faltar
     monta corpo HTTP (messages + model + params)
     fetch(url, ...) → status ≥ 400 ou throw → ModelGatewayError
     mapeia resposta do provedor → GenerateResult { text }
   fake:
     retorna resposta determinística derivada de request (sem rede)
```

Verificação manual (smoke, fora dos testes):

```text
tsx scripts/smoke.ts --provider fake                 → resposta canned
tsx scripts/smoke.ts --provider local  --model ...   → Ollama em localhost (grátis)
tsx scripts/smoke.ts --provider remote --model ...   → endpoint OpenAI-compatible (pago)
  (config remoto/ollama lida de env: ATLAS_MODEL_BASE_URL, ATLAS_MODEL_API_KEY)
```

Precedência de config no smoke (coerente com ADR-0006, escopo do script): `flags > env > defaults`.

---

# Estratégia de Implementação

1. criar o esqueleto de `packages/model-gateway` (`package.json`, `tsconfig.json` espelhando `@atlas/core`; dep `@atlas/contracts`; `tsx` como devDep);
2. definir tipos públicos e `ModelGatewayError` (TDD dos casos de erro de config);
3. provedor `fake` (TDD: resposta determinística; usado como base dos testes do seletor);
4. `createModelGateway` — seletor de provedor (TDD: seleção correta; provedor desconhecido ⇒ erro);
5. provedor `local` (Ollama) com `fetch` injetado (TDD: monta requisição, mapeia resposta, erro HTTP ⇒ `ModelGatewayError`);
6. provedor `remote` (OpenAI-compatible) com `fetch` injetado (TDD: auth/corpo/mapeamento; validação de `baseUrl`/`apiKey`);
7. `scripts/smoke.ts` (parse com `node:util`; compõe config de flags + env; valida `--provider fake` sem rede);
8. `src/index.ts`, `README.md`, `CLAUDE.md` do package; atualizar `CLAUDE.md` raiz e contexto;
9. validar todos os critérios de aceitação; registrar lições aprendidas.

---

# Estratégia de Testes

- testes unitários em `packages/model-gateway/tests/`, sem rede e sem mocks de framework — dependências (`fetch`) injetadas por parâmetro (ADR-0004);
- **fake**: `generate` devolve `GenerateResult` determinístico a partir do `request`;
- **model-gateway (seletor)**: seleciona o provedor por `config.provider`; provedor desconhecido ⇒ `ModelGatewayError`; validações de config ausente (`model`, `baseUrl`, `apiKey`);
- **ollama**: com `fetch` stub, verifica URL/método/corpo enviados e o mapeamento da resposta em `GenerateResult`; status ≥ 400 e `fetch` que rejeita ⇒ `ModelGatewayError`;
- **remote**: com `fetch` stub, verifica header de autorização, corpo (`model`, `messages`, params) e mapeamento; ausência de `apiKey`/`baseUrl` ⇒ `ModelGatewayError`;
- verificação de provedores reais (Ollama/remoto) fica no **smoke script**, executada manualmente — fora da suíte automatizada.

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

Não criar módulos, serviços ou packages além de `packages/model-gateway` (módulo já previsto no Module Catalog).

O Model Gateway é um **adaptador**: não contém lógica de negócio, não escolhe objetivo/estratégia, não guarda memória, não executa Tools, não decide permissões (Module Catalog + Princípio 5). É **sem estado**.

Sem dependências de runtime externas: integração HTTP via `fetch` global do Node; parsing do smoke via `node:util`. A única dependência de runtime é o package de workspace `@atlas/contracts` (`workspace:*`). `tsx` é `devDependency` (dev tooling).

Não alterar `@atlas/contracts`, `@atlas/core` nem `apps/cli`. Se a implementação sugerir necessidade de mudança neles, **parar e registrar** antes de prosseguir (Constituição).

Tipos do Model Gateway ficam locais no package; promoção para `@atlas/contracts` só quando existir um segundo consumidor, via ADR.

Imports entre packages exclusivamente via nome `@atlas/*` declarado no `package.json`; sem path aliases. Sem `dist/`: execução direta do fonte `.ts` via `tsx` (smoke).

---

# Observações

O provedor `remote` fala o protocolo **OpenAI Chat Completions** (`POST {baseUrl}/chat/completions`, header `Authorization: Bearer <apiKey>`, corpo com `model` e `messages`), que é o de-facto padrão de mercado — cobre OpenAI, OpenRouter, Groq, DeepSeek, Together e outros, além de endpoints locais compatíveis. Assim o slot pago fica genérico e substituível, sem o gateway conhecer o fornecedor. Um provedor nativo (ex.: Anthropic Messages) pode ser adicionado no futuro como mais uma implementação do mesmo `ModelGateway`, sem quebrar consumidores.

O provedor `local` usa a API nativa do Ollama (`POST {baseUrl}/api/chat`), que dispensa `apiKey`.

Encaminhamento herdado (SPEC-0001/0002/0003): durante a execução, repetir o probe do TypeScript 7 (`pnpm add -Dw typescript@^7 && pnpm lint`; se falhar, reverter para `typescript@^5`). O typescript-eslint quebrou com o TS 7 em 2026-07-10, 07-11 e 07-12.

Lembrete operacional: o `esbuild` (motor do `tsx`) precisa estar aprovado em `pnpm-workspace.yaml` (`allowBuilds`) — já resolvido na SPEC-0003; confirmar que o novo package não reintroduz `ERR_PNPM_IGNORED_BUILDS`.

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

O Atlas passa a ter acesso padronizado a modelos de IA através de `@atlas/model-gateway`: uma interface única `generate` cujo provedor é escolhido por configuração, com três implementações intercambiáveis (`fake` para testes, `local`/Ollama grátis e `remote` pago genérico via protocolo OpenAI-compatible). Trocar entre um modelo local gratuito e um provedor pago é apenas uma mudança de configuração — nenhum consumidor conhece o fornecedor, materializando o Princípio 13.

A suíte de testes cobre a seleção de provedor, as validações de configuração e o mapeamento de requisição/resposta dos provedores de rede sem tocar a rede (via `fetch` injetado), e um script de smoke permite verificar os provedores reais e demonstrar a troca ao vivo. Nenhuma dependência de runtime foi adicionada além do package de contratos do workspace. O gateway fica pronto para ser consumido por um orquestrador (Cognitive Core) em SPEC futura.
