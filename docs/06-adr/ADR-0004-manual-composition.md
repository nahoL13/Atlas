# ADR-0004 — Composição manual por factory functions

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-10

---

# Contexto

O [ADR-0003](ADR-0003-core-composition-root.md) define `packages/core` como composition root da plataforma, mas não define o **mecanismo** de composição e injeção de dependências.

Essa escolha é herdada por todos os packages futuros e afeta testes, legibilidade e acoplamento a frameworks.

Critérios considerados:

- Princípio 13 — nenhuma dependência permanente de framework;
- simplicidade acima de conveniência (Princípio 14);
- segurança de tipos verificada em compilação;
- legibilidade do grafo de dependências.

---

# Decisão

A composição da plataforma é **manual, por factory functions**:

- cada serviço é criado por uma função que recebe suas dependências explicitamente por parâmetro;
- o `createAtlas()` monta o grafo completo de forma explícita e legível;
- não há container de DI, decorators, tokens ou `reflect-metadata`;
- testes instanciam serviços passando dependências (ou dublês) diretamente.

---

# Consequências

Positivas:

- erro de wiring é erro de compilação, não de runtime;
- o grafo de dependências inteiro é visível no composition root;
- zero dependências adicionadas ao workspace;
- testes não precisam de infraestrutura de container.

Custos e riscos:

- o wiring cresce linearmente com o número de serviços;
- composição condicional complexa pode tornar o composition root verboso.

**Cláusula de revisão:** este ADR deve ser reavaliado (por um novo ADR) se o composition root ultrapassar aproximadamente dez serviços ou se surgir composição condicional que comprometa sua legibilidade.

---

# Alternativas Consideradas

**Container de DI (inversify, tsyringe ou similar).** Rejeitada: acopla todos os packages a um framework (contra o Princípio 13), esconde o grafo atrás de resolução automática, move erros de wiring para runtime e exige decorators com `reflect-metadata`.
