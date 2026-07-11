# Workspace Strategy

> **Project Atlas — Workspace Organization Strategy**

Version: 1.1

---

# Objetivo

Este documento define a estratégia oficial de organização do Project Atlas em um **workspace** composto por múltiplos projetos independentes.

O objetivo é permitir que a plataforma evolua de forma modular, desacoplada e escalável, evitando que todas as responsabilidades sejam concentradas em um único repositório.

---

# Motivação

O Atlas não é apenas uma aplicação.

O Atlas é uma plataforma composta por diversos componentes que evoluirão em ritmos diferentes.

Por exemplo:

- o núcleo cognitivo poderá evoluir independentemente da interface desktop;
- aplicações móveis poderão ser desenvolvidas sem alterar o Core;
- ferramentas internas poderão ser criadas sem misturar seu código à plataforma principal;
- protótipos poderão existir sem comprometer a estabilidade do projeto.

Organizar o Atlas como um workspace reduz acoplamento entre projetos e facilita manutenção de longo prazo.

---

# Filosofia

Cada projeto possui uma responsabilidade claramente definida.

Nenhum projeto deve assumir responsabilidades pertencentes a outro.

Sempre que possível, dependências devem apontar para o Core da plataforma, nunca para aplicações específicas.

---

# Estrutura Geral

```text
atlas-workspace/

├── atlas-core/
│
├── atlas-desktop/
│
├── atlas-mobile/
│
├── atlas-docs/
│
├── atlas-tools/
│
├── atlas-examples/
│
└── atlas-sandbox/
```

Essa estrutura representa a organização lógica da plataforma.

A organização física adotada para o MVP é o monorepo definido em `docs/03-architecture/ProjectStructure.md` (ver ADR-0001), com o seguinte mapeamento:

- `atlas-core` → `packages/*`;
- `atlas-desktop` → `apps/desktop/`;
- demais aplicações futuras → `apps/*`;
- `atlas-docs` → `docs/` e `PROJECT.md`;
- `atlas-tools` → `tooling/`;
- `atlas-examples` → `examples/`;
- `atlas-sandbox` → `sandbox/`.

A organização física poderá evoluir conforme necessidades futuras, desde que preserve os princípios definidos neste documento.

---

# Projetos do Workspace

## atlas-core

Representa a plataforma principal.

Contém:

- arquitetura;
- ciclo cognitivo;
- módulos centrais;
- serviços;
- contratos;
- runtime;
- componentes fundamentais.

Nenhuma interface de usuário deve conter lógica pertencente ao Core.

---

## atlas-desktop

Aplicação desktop oficial do Atlas.

Responsável pela experiência do usuário em computadores.

Sua função é consumir os recursos oferecidos pelo Core.

---

## atlas-mobile

Aplicação móvel.

Será responsável por adaptar a experiência do Atlas para dispositivos móveis.

Seu desenvolvimento poderá ocorrer independentemente do desktop.

---

## atlas-docs

Repositório oficial da documentação.

Toda documentação arquitetural, funcional e técnica será mantida de forma independente da implementação.

A documentação continua sendo a fonte oficial da verdade do projeto.

---

## atlas-tools

Ferramentas utilizadas durante o desenvolvimento.

Exemplos:

- geração de documentação;
- validações;
- automações;
- utilitários;
- scripts internos.

Essas ferramentas não fazem parte da plataforma em produção.

---

## atlas-examples

Projetos de exemplo.

Seu objetivo é demonstrar como utilizar o Core e servir como referência para novos desenvolvedores.

Nenhum exemplo deve ser utilizado como implementação oficial.

---

## atlas-sandbox

Área destinada a experimentação.

Novas ideias, provas de conceito e integrações experimentais deverão ser desenvolvidas aqui antes de serem incorporadas oficialmente à plataforma.

Código experimental não deve ser promovido diretamente para produção.

---

# Dependências entre Projetos

A arquitetura deverá seguir o princípio da dependência unidirecional.

```text
atlas-desktop
        │
        ▼

atlas-core

        ▲

atlas-mobile
```

Ferramentas, exemplos e experimentos também dependem do Core.

O Core nunca deve depender das aplicações.

---

# Benefícios

A adoção de um workspace proporciona:

- separação clara de responsabilidades;
- maior facilidade de manutenção;
- evolução independente dos projetos;
- redução de acoplamento;
- melhor organização da documentação;
- maior facilidade para contribuição;
- melhor suporte ao desenvolvimento assistido por IA.

---

# Diretrizes

Todo novo projeto criado dentro do workspace deverá responder às seguintes perguntas:

- Qual responsabilidade exclusiva ele possui?
- Ele pode evoluir independentemente?
- Ele reutiliza o Core em vez de duplicar lógica?
- Sua existência reduz a complexidade da plataforma?

Caso essas perguntas não possam ser respondidas positivamente, o novo projeto deverá ser reavaliado.

---

# Evolução

O workspace foi concebido para crescer ao longo da evolução do Atlas.

Novos projetos poderão ser adicionados conforme surgirem novas necessidades, desde que respeitem os princípios de modularidade, desacoplamento e responsabilidade única definidos pela arquitetura.

---

# Decisão Arquitetural

A partir desta versão da documentação, o Project Atlas adota oficialmente a estratégia de **Workspace Modular**.

Toda nova aplicação, ferramenta ou componente deverá ser avaliado considerando essa organização antes de ser incorporado ao ecossistema.

Essa decisão busca garantir que o Atlas permaneça organizado, sustentável e preparado para evoluir durante muitos anos.
