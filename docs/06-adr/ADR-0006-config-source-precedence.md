# ADR-0006 — Precedência de fontes de configuração

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-11

---

# Contexto

A configuração do Atlas pode vir de múltiplas fontes: valores padrão, arquivo de configuração, variáveis de ambiente e flags de linha de comando. A [SPEC-0002](../implementation/specs/SPEC-0002-core-bootstrap.md) estabeleceu os `defaults` no core e a validação em `loadConfig`, mas adiou deliberadamente a decisão de precedência entre fontes para a [SPEC-0003](../implementation/specs/SPEC-0003-cli-foundation.md), quando a primeira interface (CLI) passaria a lê-las.

---

# Decisão

A ordem de precedência (da maior para a menor) é:

```text
flags  >  env  >  arquivo  >  defaults
```

- `defaults` residem no core (`loadConfig`).
- `flags` e `env` são resolvidos no Input Gateway da aplicação (`apps/*`) e passados como um único `override` (`Partial<AtlasConfig>`) a `createAtlas({ config })`.
- `arquivo` fica reservado: será implementado em SPEC futura, encaixando-se entre `env` e `defaults` sem alterar a ordem.
- A validação permanece exclusivamente no core: as aplicações repassam valores crus; `loadConfig` é a única fonte de verdade da validação.

Nesta SPEC (0003), `flags` e `env` são implementados; `arquivo` não.

---

# Consequências

Positivas:

- precedência previsível e testável (flag sobrepõe env sobrepõe default);
- a resolução de entrada vive nas aplicações (Input Gateway), sem acoplar o core a `argv`/`env` — Princípio 13 e testabilidade;
- o slot de `arquivo` é conhecido de antemão, evitando retrabalho de ordem.

Custos e riscos:

- os nomes das variáveis de ambiente (`ATLAS_LOG_LEVEL`, `ATLAS_DATA_DIR`) tornam-se uma interface pública informal da CLI, a ser documentada.

---

# Alternativas Consideradas

**Somente `flags > defaults`.** Subentrega o item explicitamente atribuído à SPEC-0003 e não exercita a estratificação real de precedência.

**Resolver todas as fontes no core.** Acoplaria o core a `process`/`argv`/`env`, violando o limite de que o core não lê entrada — responsabilidade do Input Gateway.
