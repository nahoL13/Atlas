# PROJECT

> **Project Atlas — Project Entry Point**

Version: 2.1

Status: Official

---

# Bem-vindo ao Project Atlas

O **Project Atlas** é uma plataforma de inteligência artificial pessoal projetada para atuar como um assistente colaborativo, extensível e orientado por um ciclo cognitivo.

Mais do que um chatbot, o Atlas é uma plataforma de engenharia construída para compreender objetivos, planejar soluções, executar tarefas e evoluir continuamente de forma modular.

A primeira Persona oficial da plataforma será **Jarvis**, um assistente focado em produtividade, desenvolvimento de software e automação do ambiente de trabalho do usuário.

Este documento representa a porta de entrada oficial do projeto.

Todo desenvolvedor ou inteligência artificial deve iniciar por aqui.

---

# Objetivo deste Documento

O PROJECT.md possui quatro responsabilidades principais:

- apresentar o Project Atlas;
- explicar como a documentação está organizada;
- definir como o projeto deve ser desenvolvido;
- orientar humanos e inteligências artificiais sobre como contribuir.

Este documento não descreve arquitetura detalhada nem implementação.

Ele serve como mapa para todo o restante da documentação.

---

# Estado Atual do Projeto

## Fase

Architecture & Engineering Foundation

---

## Status

🟢 Documentação Estrutural em Consolidação

---

## Próximo Objetivo

Iniciar a implementação do MVP através das primeiras Implementation Specifications (SPECs).

---

## Estratégia de Desenvolvimento

Incremental

Monólito Modular

Documentação orientada por IA

---

# Como Ler a Documentação

Toda documentação do Atlas foi organizada em camadas.

Cada documento responde apenas uma pergunta específica.

A ordem abaixo deve ser respeitada sempre que possível.

---

## Camada 1 — Identidade

Define por que o projeto existe.

1. Vision

---

## Camada 2 — Governança

Define as regras do projeto.

2. Architecture Constitution

3. Architecture Decision Process

4. Glossary

---

## Camada 3 — Produto

Define o comportamento esperado do Atlas.

5. Product Requirements (PRD)

---

## Camada 4 — Comportamento

Define como o Atlas pensa.

6. Cognitive Lifecycle

7. Architecture Principles

---

## Camada 5 — Arquitetura

Define como a plataforma é organizada.

8. System Architecture

9. Module Catalog

10. Workspace Strategy

11. Project Structure

---

## Camada 6 — Engenharia

Define como o projeto é desenvolvido.

12. Development Guide

13. ADRs (Architecture Decision Records)

14. Roadmap

---

## Camada 7 — Implementação

Define o trabalho em andamento.

15. Implementation Specifications (SPECs)

16. CURRENT_SPRINT

17. NEXT_CONTEXT

---

# Estrutura do Workspace

O Atlas é organizado como um workspace composto por múltiplos projetos independentes.

Cada projeto possui responsabilidade própria.

```text
atlas-workspace/

atlas-core/

atlas-desktop/

atlas-mobile/

atlas-docs/

atlas-tools/

atlas-examples/

atlas-sandbox/
```

O `atlas-core` representa a plataforma principal.

Os demais projetos consomem suas capacidades.

---

# Filosofia do Projeto

O Atlas segue alguns princípios fundamentais.

- arquitetura antes de implementação;
- documentação antes de código;
- responsabilidades bem definidas;
- evolução incremental;
- baixo acoplamento;
- alta observabilidade;
- simplicidade sempre que possível.

Esses princípios devem orientar todas as decisões técnicas.

---

# Como Desenvolver no Atlas

Nenhuma funcionalidade deve ser implementada diretamente.

Toda implementação segue o fluxo oficial:

```text
Ideia

↓

Documentação

↓

SPEC

↓

Plano

↓

Implementação

↓

Testes

↓

Review

↓

Merge
```

Cada etapa possui documentação própria.

---

# Como Trabalhar com SPECs

Toda implementação do Atlas deve partir de uma **Implementation Specification (SPEC)**.

Uma SPEC define:

- objetivo;
- escopo;
- critérios de aceitação;
- dependências;
- restrições;
- Definition of Done.

Nenhuma implementação deve ocorrer fora do escopo de uma SPEC aprovada.

---

# Instruções para Desenvolvedores

Antes de iniciar qualquer implementação:

1. Leia este documento.
2. Consulte o CURRENT_SPRINT.
3. Leia o NEXT_CONTEXT.
4. Abra a SPEC correspondente.
5. Gere um plano de implementação.
6. Revise os documentos referenciados pela SPEC.
7. Inicie a implementação.

Ao concluir:

- execute os testes;
- atualize a documentação;
- valide os critérios de aceitação;
- registre as lições aprendidas;
- registre a conclusão.

---

# Instruções para Inteligências Artificiais

Toda IA utilizada neste projeto deverá seguir as seguintes regras:

1. Considere a documentação como fonte oficial da verdade.
2. Nunca implemente diretamente a partir de uma solicitação informal.
3. Sempre implemente apenas uma SPEC por vez.
4. Nunca altere a arquitetura por iniciativa própria.
5. Nunca crie novos módulos sem documentação correspondente.
6. Respeite o Module Catalog.
7. Respeite os limites arquiteturais definidos na documentação.
8. Em caso de dúvida, interrompa a implementação e registre a inconsistência.

A IA deve atuar como membro da equipe de engenharia, e não como autora da arquitetura.

---

# Estrutura da Documentação

```text
docs/

00-project/          governança: Constituição, Processo de Decisão, Glossário

01-vision/           identidade e visão

02-product/          requisitos do produto (PRD)

03-architecture/     arquitetura e comportamento

04-engineering/      processo de desenvolvimento

05-context/          estado atual do trabalho (CURRENT_SPRINT, NEXT_CONTEXT)

06-adr/              Architecture Decision Records
```

Cada diretório possui responsabilidade única.

As SPECs, o template e o registro de lições aprendidas vivem em `docs/implementation/`, conforme definido no Project Structure.

---

# Convenções

O projeto adota as seguintes convenções:

- responsabilidade única por componente;
- contratos antes de implementação;
- documentação próxima da arquitetura;
- baixo acoplamento;
- modularidade;
- evolução incremental.

---

# Definição de Pronto

Uma funcionalidade somente é considerada concluída quando:

- atende aos critérios da SPEC;
- respeita a arquitetura;
- possui testes;
- possui documentação atualizada;
- foi revisada.

Código funcionando não significa trabalho concluído.

---

# Onde Estamos

A evolução do Atlas segue as seguintes fases:

- ✅ Visão
- ✅ Governança
- ✅ Produto
- ✅ Arquitetura
- ✅ Engenharia
- 🚧 Implementação do MVP
- ⏳ Evolução incremental
- ⏳ Expansão da plataforma

Este documento deverá ser atualizado sempre que o projeto avançar para uma nova fase.

---

# Missão do Projeto

O objetivo do Project Atlas não é apenas construir um assistente de inteligência artificial.

O objetivo é construir uma plataforma sustentável, modular e preparada para evoluir durante muitos anos.

Toda decisão tomada neste projeto deve contribuir para esse objetivo.

---

# Regra Final

Antes de escrever qualquer linha de código, responda às seguintes perguntas:

1. Existe um requisito para esta funcionalidade?
2. Existe documentação que a descreve?
3. Existe uma SPEC aprovada?
4. O componente responsável está claramente definido?
5. A implementação respeita a arquitetura?

Se qualquer resposta for negativa, a implementação não deve começar.

A documentação do Project Atlas existe para garantir que cada nova linha de código fortaleça a plataforma em vez de aumentar sua complexidade.
