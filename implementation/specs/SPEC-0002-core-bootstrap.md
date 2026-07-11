# SPEC-0002 — Core Bootstrap

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0002

---

**Título**

Core Bootstrap — contratos públicos e plataforma mínima

---

**Status**

Review

---

**Prioridade**

Critical

---

# Objetivo

Criar os dois primeiros packages da plataforma:

- `@atlas/contracts` — contratos públicos compartilhados (plataforma, configuração, erros estruturados);
- `@atlas/core` — Configuration Service, Lifecycle Manager e o composition root `createAtlas()`.

Ao final desta SPEC, `createAtlas()` deve subir a plataforma até `ready`, reportar estado e configuração, e desligar com segurança até `stopped` — a superfície exata que a SPEC-0003 (cli-foundation) consumirá.

---

# Motivação

Nenhum componente das camadas Intelligence, Execution ou Support pode existir sem a base operacional da Platform Layer.

Esta SPEC realiza as primeiras implementações do Module Catalog (Core, Configuration Service, Lifecycle Manager) e materializa o ADR-0003 (composition root) e o ADR-0004 (composição manual).

Origem: fluxo de SPECs definido no Project Structure (`SPEC-0002-core-bootstrap`).

---

# Referências

- `docs/03-architecture/ProjectStructure.md` (v2.1)
- `docs/03-architecture/ModuleCatalog.md` (Core, Configuration Service, Lifecycle Manager)
- `docs/03-architecture/SystemArchitecture.md` (Platform Layer)
- `docs/06-adr/ADR-0003-core-composition-root.md`
- `docs/06-adr/ADR-0004-manual-composition.md`
- `docs/04-engineering/DevelopmentGuide.md`
- `docs/00-project/ArchitectureConstitution.md`
- `implementation/specs/SPEC-0001-workspace-bootstrap.md` (Done)

---

# Escopo

- criar `packages/contracts` (`@atlas/contracts`): `src/platform.ts`, `src/config.ts`, `src/errors.ts`, `src/index.ts`, testes das classes de erro, `package.json`, `tsconfig.json`, `CLAUDE.md`, `README.md`;
- criar `packages/core` (`@atlas/core`): `src/config/` (defaults + `loadConfig` com merge, validação por guards e `Object.freeze`), `src/lifecycle/` (máquina de estados com transições guardadas), `src/index.ts` (`createAtlas()`), testes, `package.json`, `tsconfig.json`, `CLAUDE.md`, `README.md`;
- declarar a dependência `@atlas/contracts: workspace:*` no core;
- exports dos packages apontando para `./src/index.ts` (sem `dist/`);
- ajustar a raiz: `typecheck` agrega packages (`tsc -p tsconfig.json && pnpm -r --if-present typecheck`) e o Vitest inclui `packages/*/tests/**/*.test.ts`;
- registrar o ADR-0004 (composição manual);
- atualizar o `CLAUDE.md` (estado do projeto).

---

# Fora do Escopo

- Event Bus e Plugin Manager (ficam para quando existir o primeiro publisher/extensão real);
- Activity, Memory, Context e Persona Services;
- fontes externas de configuração (arquivo, variáveis de ambiente);
- `apps/cli` (SPEC-0003);
- build de distribuição (`dist/`) e publicação de packages;
- qualquer componente das camadas Intelligence e Execution.

---

# Pré-requisitos

SPEC-0001 (Done).

ADRs 0001, 0002, 0003 e 0004 aceitos.

---

# Critérios de Aceitação

- `pnpm install` conclui sem erros;
- `pnpm lint` passa sem erros;
- `pnpm typecheck` passa, cobrindo raiz e os dois packages;
- `pnpm test` executa os testes da raiz e dos dois packages, todos verdes;
- teste comprova: `createAtlas()` chega a `ready` com config mesclada e congelada, e `shutdown()` leva a `stopped`;
- teste comprova: config inválida lança `InvalidConfigError` listando **todas** as issues;
- teste comprova: transição de estado inválida lança `LifecycleError`; `shutdown()` é idempotente a partir de `stopped`;
- estrutura corresponde à seção "Arquivos Esperados";
- ADR-0004 registrado e `CLAUDE.md` atualizado.

---

# Arquivos Esperados

```text
packages/
├── contracts/
│   ├── src/
│   │   ├── index.ts
│   │   ├── platform.ts
│   │   ├── config.ts
│   │   └── errors.ts
│   ├── tests/
│   │   └── errors.test.ts
│   ├── CLAUDE.md
│   ├── README.md
│   ├── package.json
│   └── tsconfig.json
└── core/
    ├── src/
    │   ├── index.ts
    │   ├── config/
    │   │   ├── defaults.ts
    │   │   └── load-config.ts
    │   └── lifecycle/
    │       └── lifecycle.ts
    ├── tests/
    │   ├── load-config.test.ts
    │   ├── lifecycle.test.ts
    │   └── create-atlas.test.ts
    ├── CLAUDE.md
    ├── README.md
    ├── package.json
    └── tsconfig.json
```

Modificados: `vitest.config.ts`, `package.json` (raiz), `CLAUDE.md`.

Novo: `docs/06-adr/ADR-0004-manual-composition.md`.

Essa lista representa uma expectativa e pode sofrer pequenos ajustes durante a implementação.

---

# Componentes Impactados

Primeiras implementações do Module Catalog:

- Core (composition root);
- Configuration Service;
- Lifecycle Manager.

---

# Interfaces Necessárias

Em `@atlas/contracts`:

```text
LifecycleState = 'created' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed'

AtlasPlatform { state: LifecycleState; config: AtlasConfig; shutdown(): Promise<void> }

LogLevel = 'silent' | 'error' | 'info' | 'debug'

AtlasConfig { logLevel: LogLevel; dataDir: string }

AtlasError (code) · InvalidConfigError (issues) · LifecycleError (from, to)
```

Em `@atlas/core`:

```text
CreateAtlasOptions { config?: Partial<AtlasConfig> }

createAtlas(options?: CreateAtlasOptions): Promise<AtlasPlatform>
```

---

# Fluxo Esperado

```text
createAtlas(options)

↓

loadConfig: defaults + override → valida → congela

↓

createLifecycle → start: created → starting → ready

↓

AtlasPlatform { state, config, shutdown }

↓

shutdown: ready → stopping → stopped
```

---

# Estratégia de Implementação

1. criar `@atlas/contracts` (erros com testes primeiro; tipos puros na sequência);
2. criar `@atlas/core` com o Configuration Service (TDD: defaults, merge, validação, freeze);
3. implementar o Lifecycle Manager (TDD: transições válidas, inválidas, idempotência, falha);
4. implementar `createAtlas()` (TDD: sobe até ready, desliga até stopped);
5. ajustar `typecheck` raiz e globs do Vitest;
6. registrar ADR-0004 e atualizar documentação;
7. validar todos os critérios de aceitação.

---

# Estratégia de Testes

- testes unitários próximos a cada package (`packages/*/tests/`), conforme o Project Structure;
- config: defaults puros, merge parcial, cada regra de validação falhando com a issue correspondente, acúmulo de múltiplas issues, congelamento;
- lifecycle: caminho feliz completo, cada transição inválida, `shutdown` idempotente, falha no start levando a `failed`;
- `createAtlas`: integração leve dos dois serviços via composition root;
- erros: construção, `instanceof` e `code` de cada classe;
- sem mocks: componentes puros e determinísticos recebem dependências por parâmetro (ADR-0004).

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

Não criar Event Bus, Plugin Manager ou qualquer serviço fora do escopo.

Não adicionar dependências de runtime — os dois packages usam apenas Node e TypeScript já presentes; `@atlas/contracts` não depende de nada.

Imports entre packages exclusivamente via nome `@atlas/*` declarado no `package.json`; sem path aliases (Regra de Dependência mecânica da v2.1).

Sem `dist/`: exports apontam para `./src/index.ts`.

---

# Observações

Build de distribuição é decisão futura — será tratada quando alguma aplicação precisar de artefato compilado (provavelmente junto do empacotamento da CLI).

Encaminhamento herdado das lições da SPEC-0001: durante a execução, verificar se o typescript-eslint já suporta o TypeScript 7; em caso positivo, despinar o `typescript@^5` e remover a nota do CLAUDE.md.

O Plugin Manager permanece sem seção de detalhe no ModuleCatalog (lacuna registrada; deverá ser corrigida antes da SPEC que o implementar).

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

Os dois primeiros packages reais do monorepo, com a plataforma mínima operável por código: `createAtlas()` sobe até `ready`, expõe estado e configuração validada, e desliga com segurança.

Os contratos públicos estão estabelecidos em `@atlas/contracts`, o padrão de composição manual está exercitado no composition root, e a SPEC-0003 (cli-foundation) pode consumir essa superfície sem nenhuma decisão de plataforma pendente.
