# SPEC-0003 — CLI Foundation

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0003

---

**Título**

CLI Foundation — primeira interface executável (`apps/cli`)

---

**Status**

Draft

---

**Prioridade**

High

---

# Objetivo

Criar `apps/cli` (`@atlas/cli`), a primeira interface executável do Atlas, consumindo a superfície pronta do core (`createAtlas`).

Ao final desta SPEC, o comando `atlas status` deve resolver a configuração a partir de flags e variáveis de ambiente, subir a plataforma via `createAtlas()`, exibir estado e configuração resolvida e desligar com segurança — provando o core de ponta a ponta pelo terminal. Os comandos `atlas --help` e `atlas --version` também existem.

---

# Motivação

O core existe e é operável por código (SPEC-0002), mas ainda não há nenhuma forma de um humano exercitá-lo. A CLI é a primeira interface prevista no Project Structure (`apps/cli/`) e a escolhida para validar o MVP.

Esta SPEC materializa as primeiras sementes do Input Gateway e do Output Gateway (Module Catalog, camada Interaction, localização `apps/*`) e resolve a decisão de **precedência de fontes de configuração**, deliberadamente adiada da SPEC-0002 para cá.

Origem: fluxo de SPECs definido no Project Structure (`SPEC-0003-cli-foundation`) e `docs/05-context/NEXT_CONTEXT.md`.

---

# Referências

- `docs/03-architecture/ProjectStructure.md` (v2.1) — `apps/cli/`, regras de dependência
- `docs/03-architecture/ModuleCatalog.md` — Input Gateway, Output Gateway
- `docs/03-architecture/ArchitecturePrinciples.md` — Princípio 13 (independência tecnológica), 14 (modularidade acima da conveniência)
- `docs/06-adr/ADR-0002-typescript-node.md` — stack; padrão sem `dist/`
- `docs/06-adr/ADR-0004-manual-composition.md` — composição manual por parâmetro
- `docs/00-project/ArchitectureConstitution.md`
- `implementation/specs/SPEC-0002-core-bootstrap.md` (Done)
- `implementation/LESSONS_LEARNED.md` (padrão sem `dist/`; precedência de config adiada)

---

# Escopo

- criar `apps/cli` (`@atlas/cli`): `package.json` (com `bin`), `tsconfig.json`, `CLAUDE.md`, `README.md`;
- `src/main.ts`: casca de processo — shebang, monta os gateways reais, chama `run()` e faz `process.exit(code)`;
- `src/run.ts`: `run(argv, env, gateways): Promise<number>` — orquestração testável, sem `process.exit`;
- `src/gateway/input-gateway.ts`: interface `InputGateway` + `CliInputGateway` (normaliza `argv` + `env` em `ParsedInput`), usando `parseArgs` do `node:util`;
- `src/gateway/output-gateway.ts`: interface `OutputGateway` + `ConsoleOutputGateway` (`write`/`error` sobre streams injetáveis);
- `src/commands/status.ts`: `runStatus(atlas, output)` — formata e entrega estado + config resolvida;
- comandos: `status`, `--help`/`-h`, `--version`/`-v`;
- fontes de config implementadas: **flags** (`--log-level`, `--data-dir`) e **env** (`ATLAS_LOG_LEVEL`, `ATLAS_DATA_DIR`), com precedência `flags > env`; resultado passado como `override` a `createAtlas({ config })`;
- declarar a dependência `@atlas/core: workspace:*`;
- exports/execução sem `dist/`: `bin` aponta para `./src/main.ts`, executado pelo Node via *type stripping* nativo;
- ajustar o Vitest para incluir `apps/*/tests/**/*.test.ts`;
- registrar ADR-0005 (execução de TS em apps via *type stripping*) e ADR-0006 (precedência de fontes de configuração);
- atualizar `CLAUDE.md` (estado do projeto; remover `apps/cli` da seção de itens ainda não criados).

---

# Fora do Escopo

- carregamento de configuração a partir de **arquivo** (o slot `arquivo` fica reservado no contrato de precedência para SPEC futura);
- qualquer comando cognitivo (compreender, planejar, executar) ou interação com IA;
- modo interativo / REPL;
- promover as interfaces de Gateway para `@atlas/contracts` (só quando um segundo app as compartilhar, via ADR);
- empacotamento e distribuição da CLI (binário, publicação, `dist/`);
- alterações em `@atlas/contracts` e `@atlas/core` — a superfície pronta basta; qualquer necessidade de mudança nesses packages é motivo para **parar e registrar**;
- adicionar dependências de runtime (framework de CLI) — parsing via `node:util`.

---

# Pré-requisitos

SPEC-0002 (Done).

ADRs 0001, 0002, 0003 e 0004 aceitos.

---

# Critérios de Aceitação

- `pnpm install` conclui sem erros;
- `pnpm lint` passa sem erros;
- `pnpm typecheck` passa, cobrindo raiz, os dois packages e o novo `apps/cli`;
- `pnpm test` executa os testes da raiz, dos packages e de `apps/cli`, todos verdes;
- `node apps/cli/src/main.ts status` imprime `state: ready` e a config resolvida, e encerra com código `0`;
- teste comprova: precedência realizada — flag sobrepõe env sobrepõe default (ex.: `ATLAS_LOG_LEVEL=error` + `--log-level debug` ⇒ `logLevel: debug`);
- teste comprova: `--log-level` inválido resulta em `InvalidConfigError` renderizada em stderr e código de saída `1`;
- teste comprova: comando ou flag desconhecidos resultam em mensagem de uso em stderr e código de saída `2`;
- teste comprova: `--version` e `--help` escrevem em stdout e encerram com código `0`;
- estrutura corresponde à seção "Arquivos Esperados";
- ADR-0005 e ADR-0006 registrados; `CLAUDE.md` atualizado.

---

# Arquivos Esperados

```text
apps/
└── cli/
    ├── src/
    │   ├── main.ts
    │   ├── run.ts
    │   ├── gateway/
    │   │   ├── input-gateway.ts
    │   │   └── output-gateway.ts
    │   └── commands/
    │       └── status.ts
    ├── tests/
    │   ├── input-gateway.test.ts
    │   ├── output-gateway.test.ts
    │   ├── status.test.ts
    │   └── run.test.ts
    ├── CLAUDE.md
    ├── README.md
    ├── package.json
    └── tsconfig.json
```

Modificados: `vitest.config.ts`, `CLAUDE.md`.

Novos: `docs/06-adr/ADR-0005-app-typescript-execution.md`, `docs/06-adr/ADR-0006-config-source-precedence.md`.

Essa lista representa uma expectativa e pode sofrer pequenos ajustes durante a implementação.

---

# Componentes Impactados

Primeiras sementes do Module Catalog (camada Interaction):

- Input Gateway (normalização de entrada: `argv` + `env`);
- Output Gateway (entrega de saída: stdout/stderr).

Consome, sem alterar: Core (`createAtlas`), Configuration Service (`loadConfig`), Lifecycle Manager.

---

# Interfaces Necessárias

Locais em `apps/cli` (não em `@atlas/contracts` — não há segundo consumidor ainda):

```text
ParsedInput {
  command: 'status' | 'help' | 'version'
  configOverride: Partial<AtlasConfig>   // flags sobre env
}

InputGateway {
  normalize(argv: string[], env: NodeJS.ProcessEnv): ParsedInput
}

OutputGateway {
  write(text: string): void    // stdout
  error(text: string): void    // stderr
}
```

Erro local de uso:

```text
CliUsageError (message) — comando/flag desconhecidos; capturado por run()
```

Entry testável:

```text
run(argv: string[], env: NodeJS.ProcessEnv, gateways: { input: InputGateway; output: OutputGateway }): Promise<number>
```

Nenhuma interface nova em `@atlas/contracts`.

---

# Fluxo Esperado

```text
main.ts (shebang) → monta gateways reais → run(argv, env, gateways) → process.exit(code)

run:
  input.normalize(argv, env) → ParsedInput
       │
       ├─ help    → output.write(HELP)     → 0
       ├─ version → output.write(VERSION)  → 0
       └─ status  → createAtlas({ config: parsed.configOverride })
                    → runStatus(atlas, output)
                    → atlas.shutdown()
                    → 0

  catch InvalidConfigError → output.error(msg + issues) → 1
  catch CliUsageError      → output.error(usage)        → 2
```

Regras de normalização (para remover ambiguidade):

- sem nenhum argumento ⇒ `command: 'help'` (ajuda em stdout, código `0`);
- `--help`/`-h` e `--version`/`-v` têm prioridade sobre qualquer positional (ex.: `status --help` mostra ajuda); entre os dois, `--help` vence;
- positional desconhecido (≠ `status`) ou flag desconhecida ⇒ `CliUsageError`.

Precedência de configuração (contrato):

```text
flags  >  env  >  arquivo  >  defaults
  └ implementados nesta SPEC ┘   └ futuro ┘   (defaults no core)
```

---

# Estratégia de Implementação

1. criar o esqueleto de `apps/cli` (`package.json` com `bin`, `tsconfig.json`, dep `@atlas/core`);
2. ajustar os globs do Vitest para incluir `apps/*/tests/`;
3. Output Gateway (TDD: `write`→stdout, `error`→stderr com writers injetados);
4. Input Gateway (TDD: comando por argv; `flags > env`; `-h`/`-v`; desconhecidos ⇒ `CliUsageError`);
5. comando `status` (TDD: renderiza estado + config; propaga `InvalidConfigError`);
6. `run()` integrando Input Gateway + core real + Output Gateway (TDD: `status` ⇒ 0; config inválida ⇒ 1; uso inválido ⇒ 2; `--version`/`--help` ⇒ 0);
7. `main.ts` como casca fina; validar execução real via `node apps/cli/src/main.ts status`;
8. registrar ADR-0005 e ADR-0006 e atualizar documentação;
9. validar todos os critérios de aceitação.

---

# Estratégia de Testes

- testes unitários próximos ao app (`apps/cli/tests/`), conforme o Project Structure;
- **output-gateway**: `write` escreve em stdout e `error` em stderr (writers falsos capturam a saída);
- **input-gateway**: seleção de comando por `argv`; sem argumentos ⇒ `help`; `--help`/`--version` têm prioridade sobre o positional; flag sobrepõe env sobrepõe ausência; aliases `-h`/`--help` e `-v`/`--version`; comando e flag desconhecidos lançam `CliUsageError`;
- **status**: renderiza `state` + `logLevel` + `dataDir`; propaga `InvalidConfigError` sem capturar;
- **run** (integração `apps → core`): `status` imprime `ready` + config e retorna `0`; `--log-level` inválido retorna `1` e escreve em stderr; comando inválido retorna `2`; `--version` e `--help` retornam `0` e escrevem em stdout;
- sem mocks: os gateways recebem writers/dependências por parâmetro e o core real é usado na integração (`createAtlas` é in-memory e determinístico) — ADR-0004.

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

Não criar novos módulos, serviços ou packages além de `apps/cli`.

Não adicionar dependências de runtime: parsing via `node:util` (`parseArgs`); a única dependência de `apps/cli` é `@atlas/core` (`workspace:*`).

Não alterar `@atlas/contracts` nem `@atlas/core`. Se a implementação sugerir que uma mudança neles é necessária, **parar e registrar** antes de prosseguir (Constituição).

A validação de configuração permanece no core (`loadConfig`): o Input Gateway repassa valores crus e o core é a única fonte de verdade da validação.

Interfaces de Gateway ficam locais em `apps/cli`; promoção para `@atlas/contracts` só quando existir um segundo consumidor, via ADR.

Sem `dist/`: execução direta do fonte via *type stripping* nativo do Node (`bin` → `./src/main.ts`).

Imports entre packages exclusivamente via nome `@atlas/*` declarado no `package.json`; sem path aliases.

---

# Observações

**Verificação técnica durante a implementação (não assumir):** confirmar que o Node deste ambiente (≥ 24) executa um `bin` apontando para `.ts` com *type stripping* atravessando os imports dos packages (`@atlas/core` resolve para `./src/index.ts`, também `.ts`). Caminho de teste: `node apps/cli/src/main.ts status`. Se falhar, o fallback é adicionar `tsx` como `devDependency` — mas isso muda uma decisão do design (Node nativo) e o ADR-0005; nesse caso, **parar e consultar** antes de mudar de rota.

A versão exibida por `--version` é lida do `package.json` do próprio app (via `node:fs` + `import.meta.url`), evitando duplicação e a configuração de import de JSON.

Encaminhamento herdado (SPEC-0001/0002): durante a execução, repetir o probe do TypeScript 7 (`pnpm add -Dw typescript@^7 && pnpm lint`; se falhar, reverter para `typescript@^5`). O typescript-eslint 8.63 quebrou com o TS 7 em 2026-07-10 e 2026-07-11.

O slot `arquivo` no contrato de precedência (`ADR-0006`) fica definido porém não implementado; a SPEC que o implementar o encaixa entre `env` e `defaults` sem quebrar a ordem.

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

O Atlas passa a ter uma interface executável real: `atlas status` sobe a plataforma, mostra estado e configuração resolvida a partir de flags e ambiente, e desliga com segurança, com códigos de saída coerentes para sucesso, erro de configuração e erro de uso.

As sementes de Input Gateway e Output Gateway estão estabelecidas localmente em `apps/cli`, a precedência de fontes de configuração está decidida e documentada (`flags > env > arquivo > defaults`, com `flags` e `env` implementados), e o padrão sem-`dist` está estendido a aplicações executáveis via *type stripping* nativo do Node — sem nenhuma dependência de runtime adicionada.
