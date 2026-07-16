# ADR-0001 — Monorepo como organização física do workspace

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-10

---

# Contexto

O [Workspace Strategy](../03-architecture/WorkspaceStrategy.md) define a organização lógica do Atlas em múltiplos projetos (atlas-core, atlas-desktop, atlas-docs, entre outros), mas deixa a organização física em aberto.

Para iniciar o MVP era necessário decidir entre repositório único, múltiplos repositórios ou um modelo híbrido.

Critérios considerados:

- a documentação é a fonte oficial da verdade e deve evoluir junto do código que governa;
- o desenvolvimento é realizado por um desenvolvedor com assistência intensiva de IA;
- não existe código; os contratos entre projetos ainda vão se formar;
- o custo de coordenação entre repositórios não traria benefício nesta fase.

---

# Decisão

O Atlas será desenvolvido em um único repositório Git, organizado como monorepo gerenciado por pnpm workspaces, conforme `docs/03-architecture/ProjectStructure.md`.

Aplicações residem em `apps/`, componentes da plataforma em `packages/`, infraestrutura de desenvolvimento em `tooling/`.

---

# Consequências

Positivas:

- documentação, contratos e implementação evoluem em commits atômicos;
- refatorações entre packages permanecem baratas enquanto a arquitetura amadurece;
- a IA de desenvolvimento enxerga o workspace inteiro em um único contexto;
- um único pipeline de qualidade (lint, testes, validação arquitetural).

Custos e riscos:

- os limites entre packages precisam ser aplicados por lint e testes arquiteturais, não por fronteiras de repositório;
- uma separação futura, se necessária, exigirá migração planejada.

A separação em múltiplos repositórios somente será considerada diante das necessidades concretas listadas na seção "Evolução Futura" do [Project Structure](../03-architecture/ProjectStructure.md): ciclos de release independentes, equipes separadas, permissões distintas, distribuição pública independente ou problemas reais de escala.

---

# Alternativas Consideradas

**Multi-repo.** Rejeitada nesta fase: custo imediato de coordenação, contratos versionados desde o primeiro dia e documentação distante do código, sem benefício com um único desenvolvedor e zero código.

**Híbrido (plataforma junto da documentação, aplicações em repositórios próprios).** Rejeitada: cria assimetria permanente na organização sem eliminar os custos do multi-repo.
