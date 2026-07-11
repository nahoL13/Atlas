# ADR-0002 — TypeScript sobre Node.js como stack principal

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-10

---

# Contexto

A documentação arquitetural é deliberadamente agnóstica de tecnologia (Princípio 13 — Independência tecnológica).

A criação física do workspace, porém, exige uma escolha concreta de linguagem, runtime e tooling.

Critérios considerados:

- maturidade do ecossistema de IA (SDKs de provedores, MCP, integrações);
- uma única linguagem para plataforma, CLI, desktop e tooling;
- suporte maduro a monorepo;
- sistema de tipos capaz de expressar contratos entre packages;
- produtividade no desenvolvimento assistido por IA.

---

# Decisão

- Linguagem: TypeScript em modo `strict`.
- Runtime: Node.js LTS (versão fixada em `.nvmrc` e `engines`).
- Gerenciador e workspace: pnpm.
- Testes: Vitest.
- Lint e formatação: ESLint (typescript-eslint) e Prettier.

---

# Consequências

Positivas:

- acesso ao ecossistema de IA mais ativo (SDK oficial da Anthropic; MCP é TypeScript-first);
- contratos entre packages expressos como tipos e verificados em build;
- uma linguagem única de ponta a ponta reduz atrito cognitivo e de tooling.

Custos e riscos:

- a aplicação desktop dependerá de Electron ou Tauri (decisão em ADR próprio quando a SPEC correspondente chegar);
- cargas computacionalmente intensivas podem exigir componentes nativos no futuro.

O Princípio 13 permanece preservado no nível da arquitetura:

- o acesso a provedores de IA fica isolado em `packages/model-gateway`;
- contratos e limites entre componentes não dependem de frameworks;
- a substituição de tecnologias permanece possível por extensão.

---

# Alternativas Consideradas

**C#/.NET.** Forte em modularidade e injeção de dependências, porém ecossistema de IA e MCP menos maduro e caminho desktop multiplataforma menos consolidado para este produto.

**Python.** Ecossistema de IA fortíssimo, porém distribuição desktop frágil, empacotamento doloroso e tipagem menos adequada para contratos de plataforma de longa vida.
