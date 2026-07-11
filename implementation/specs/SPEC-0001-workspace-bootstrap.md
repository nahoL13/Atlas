# SPEC-0001 — Workspace Bootstrap

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0001

---

**Título**

Workspace Bootstrap — fundação do monorepo

---

**Status**

Review

---

**Prioridade**

Critical

---

# Objetivo

Estabelecer a fundação física do monorepo do Project Atlas: repositório Git, workspace pnpm, configuração TypeScript compartilhada, qualidade de base (lint, formatação, testes) e um pipeline de verificação executável.

Ao final desta SPEC, o repositório deve estar pronto para receber a SPEC-0002 (core-bootstrap) sem nenhuma decisão de infraestrutura pendente.

---

# Motivação

Nenhum package ou aplicação pode ser implementado sem o chão comum do workspace.

Esta SPEC materializa as decisões registradas nos ADRs 0001 (monorepo), 0002 (TypeScript/Node) e 0003 (composition root) e executa a primeira etapa do "Crescimento Incremental" definido no Project Structure.

Origem: PROJECT.md — "Próximo Objetivo: iniciar a implementação do MVP através das primeiras SPECs".

---

# Referências

- `docs/03-architecture/ProjectStructure.md` (v2.1)
- `docs/06-adr/ADR-0001-monorepo.md`
- `docs/06-adr/ADR-0002-typescript-node.md`
- `docs/06-adr/ADR-0003-core-composition-root.md`
- `docs/04-engineering/DevelopmentGuide.md`
- `docs/00-project/ArchitectureConstitution.md`
- `docs/02-product/ProductRequirementsDocument.md`

---

# Escopo

- inicializar o repositório Git (`git init`) com `.gitignore` adequado a Node/TypeScript/macOS;
- criar `.editorconfig`, `.nvmrc` (Node LTS) e `README.md` mínimo apontando para `PROJECT.md`;
- criar `package.json` raiz privado com scripts agregadores: `lint`, `format`, `typecheck`, `test`, `build`;
- criar `pnpm-workspace.yaml` declarando `apps/*`, `packages/*` e `tooling/*`;
- criar `tsconfig.base.json` em modo `strict`;
- configurar ESLint (typescript-eslint) e Prettier na raiz;
- configurar Vitest e criar `tests/smoke.test.ts` validando o pipeline TypeScript + Vitest;
- atualizar o `CLAUDE.md` (fase do projeto e comandos de desenvolvimento);
- realizar o commit inicial contendo documentação e fundação.

---

# Fora do Escopo

- não criar `apps/`, `packages/` ou `tooling/` (nascem nas SPECs seguintes);
- não criar `.github/` nem integração contínua;
- não criar `.claude/skills/`;
- não implementar nenhum componente do Module Catalog;
- não adicionar dependências além do tooling listado no Escopo;
- não criar `CURRENT_SPRINT`, `NEXT_CONTEXT` ou Roadmap;
- não configurar publicação de packages.

---

# Pré-requisitos

Nenhuma SPEC anterior.

ADRs 0001, 0002 e 0003 aceitos.

---

# Critérios de Aceitação

- `pnpm install` conclui sem erros;
- `pnpm lint` passa sem erros;
- `pnpm typecheck` passa sem erros;
- `pnpm test` executa `tests/smoke.test.ts` com sucesso;
- `pnpm format` não produz alterações em uma árvore recém-formatada;
- a estrutura criada corresponde à seção "Arquivos Esperados";
- repositório Git inicializado com commit inicial;
- `CLAUDE.md` reflete os novos comandos e o estado do projeto.

---

# Arquivos Esperados

```text
Atlas/
├── .git/
├── .gitignore
├── .editorconfig
├── .nvmrc
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── eslint.config.js
├── .prettierrc
├── vitest.config.ts
└── tests/
    └── smoke.test.ts
```

Essa lista representa uma expectativa.

Pode sofrer pequenos ajustes durante a implementação.

---

# Componentes Impactados

Nenhum componente do Module Catalog.

Apenas infraestrutura do repositório.

---

# Interfaces Necessárias

Nenhuma.

---

# Fluxo Esperado

```text
pnpm install

↓

pnpm lint + pnpm typecheck

↓

pnpm test (smoke)

↓

workspace pronto para a SPEC-0002
```

---

# Estratégia de Implementação

1. inicializar Git e criar os arquivos de raiz (`.gitignore`, `.editorconfig`, `.nvmrc`, `README.md`);
2. criar `package.json` raiz e `pnpm-workspace.yaml`;
3. criar `tsconfig.base.json`;
4. configurar ESLint e Prettier;
5. configurar Vitest e escrever o teste smoke;
6. validar todos os comandos;
7. atualizar `CLAUDE.md`;
8. registrar lições aprendidas e realizar o commit inicial.

---

# Estratégia de Testes

- `tests/smoke.test.ts` compila TypeScript e executa uma asserção trivial, provando o pipeline TS + Vitest de ponta a ponta;
- validação manual dos comandos `install`, `lint`, `typecheck`, `test` e `format`;
- não há lógica de produto a testar nesta SPEC.

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

Não criar packages ou aplicações.

Não alterar a arquitetura documentada.

Versões exatas das dependências de tooling serão definidas no plano de implementação, priorizando versões estáveis.

---

# Observações

O glob `tooling/*` no `pnpm-workspace.yaml` é declarado antecipadamente; o pnpm ignora globs sem correspondência.

O diretório global `tests/` é criado nesta SPEC porque o teste smoke pertence ao workspace como um todo, não a um package — conforme a regra do Project Structure para testes globais.

Node.js LTS ativo no momento da escrita: 24.x.

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

Um repositório Git inicializado contendo a documentação completa do projeto e a fundação executável do monorepo: workspace pnpm configurado, TypeScript strict compartilhado, lint, formatação e testes operacionais, verificáveis por quatro comandos na raiz.

Nenhum código de produto existe ainda; o projeto está pronto para a SPEC-0002 (core-bootstrap) criar `packages/contracts` e `packages/core`.
