# Development Guide

> **Project Atlas — Engineering Workflow**

Version: 1.1

Status: Official Development Guide

---

# Objetivo

Este documento define o processo oficial de desenvolvimento do Project Atlas.

Seu propósito é garantir que todas as implementações — realizadas por humanos ou por inteligência artificial — sejam consistentes, previsíveis e alinhadas com a arquitetura da plataforma.

O foco deste documento não é explicar como o Atlas funciona.

O foco é explicar **como o Atlas deve ser desenvolvido**.

---

# Filosofia

O Atlas é desenvolvido de forma incremental.

Nenhuma funcionalidade é implementada diretamente a partir de uma ideia.

Toda implementação nasce de um requisito, passa por planejamento e resulta em uma unidade de trabalho claramente definida.

A arquitetura sempre possui prioridade sobre a implementação.

Velocidade nunca deve comprometer qualidade, modularidade ou clareza.

---

# Fonte Oficial da Verdade

Toda implementação deve seguir a seguinte ordem de prioridade:

1. PROJECT.md
2. [Vision](../01-vision/Vision.md)
3. [Architecture Constitution](../00-project/ArchitectureConstitution.md)
4. [Architecture Decision Process](../00-project/ArchitectureDecisionProcess.md)
5. [Glossary](../00-project/Glossary.md)
6. Product Requirements
7. [Cognitive Lifecycle](../03-architecture/CognitiveLifecycle.md)
8. [Architecture Principles](../03-architecture/ArchitecturePrinciples.md)
9. [System Architecture](../03-architecture/SystemArchitecture.md)
10. [Module Catalog](../03-architecture/ModuleCatalog.md)
11. ADRs
12. SPEC (Implementation Specification)

Caso exista conflito entre dois documentos, deve prevalecer o documento de maior prioridade.

Nenhuma implementação deve ser baseada apenas em interpretação pessoal.

---

# Fluxo Oficial de Desenvolvimento

Toda funcionalidade deverá seguir exatamente o fluxo abaixo.

```text
Ideia

↓

Existe no PRD?

↓

Não

↓

Atualizar PRD

↓

Sim

↓

Existe módulo responsável?

↓

Não

↓

Revisar arquitetura

↓

Sim

↓

Criar SPEC

↓

Implementar

↓

Testar

↓

Atualizar documentação

↓

Code Review

↓

Merge
```

Nenhuma etapa deve ser ignorada.

---

# O que é uma SPEC

Uma **SPEC** (Implementation Specification) representa a menor unidade de trabalho implementável do projeto.

Todo desenvolvimento do Atlas deve ocorrer através de SPECs.

O objetivo é evitar implementações grandes, difíceis de revisar e com escopo indefinido.

Cada SPEC deve possuir apenas um objetivo principal.

---

# Características de uma boa SPEC

Uma SPEC deve:

- possuir escopo pequeno;
- resolver um único problema;
- possuir critérios claros de conclusão;
- ser implementável de forma independente;
- permitir revisão simples;
- produzir valor para o projeto.

Uma SPEC não deve depender de interpretações implícitas.

---

# Estrutura Oficial de uma SPEC

A estrutura oficial de uma SPEC é definida pelo **Implementation Specification Template**, localizado em `docs/implementation/templates/SPEC-TEMPLATE.md`.

Toda SPEC deve seguir integralmente esse template.

Este guia não duplica a estrutura do template para evitar divergência entre fontes.

---

# Diretrizes para Inteligência Artificial

Toda IA utilizada no desenvolvimento deverá seguir obrigatoriamente as regras abaixo.

## Antes de implementar

A IA deve:

- ler os documentos referenciados pela SPEC;
- compreender o objetivo da tarefa;
- identificar o módulo responsável;
- verificar se já existe implementação semelhante.

---

## Durante a implementação

A IA deve:

- respeitar responsabilidades dos módulos;
- reutilizar componentes existentes;
- evitar duplicação de código;
- evitar criar novos componentes sem necessidade;
- manter a implementação simples.

---

## É proibido

A IA não deve:

- alterar arquitetura por iniciativa própria;
- criar novos módulos sem documentação;
- modificar responsabilidades arquiteturais;
- mover arquivos arbitrariamente;
- ignorar critérios de aceitação;
- implementar funcionalidades fora do escopo.

---

## Em caso de dúvida

A IA deve parar a implementação e registrar a dúvida.

Nunca deve assumir comportamento não documentado.

---

# Revisão

Após concluir uma SPEC deve ser realizada uma revisão.

A revisão deve responder:

- o objetivo foi atendido?
- os critérios de aceitação foram cumpridos?
- a arquitetura continua consistente?
- houve aumento desnecessário de complexidade?
- a documentação continua correta?

Caso alguma resposta seja negativa, a SPEC deve retornar para ajustes.

---

# Lições Aprendidas

Ao concluir uma SPEC, suas lições aprendidas devem ser registradas em `docs/implementation/LESSONS_LEARNED.md`.

O registro responde:

- o que descobrimos?
- a arquitetura ajudou ou atrapalhou?
- o que precisamos mudar?

Esse registro é obrigatório e faz parte da Definition of Done de toda SPEC.

Todo item de mudança identificado deve gerar um ADR, uma atualização de documentação ou uma nova SPEC.

---

# Organização

Cada SPEC deverá possuir um arquivo próprio em `docs/implementation/specs/`.

Exemplo:

```text
docs/implementation/specs/

SPEC-0001-workspace-bootstrap.md

SPEC-0002-core-bootstrap.md

SPEC-0003-cli-foundation.md
```

Cada arquivo representa uma entrega independente.

---

# Tamanho Máximo

Uma SPEC deve ser pequena o suficiente para:

- ser compreendida rapidamente;
- ser implementada em poucas horas ou poucos dias;
- possuir revisão objetiva.

Caso uma SPEC se torne muito grande, ela deverá ser dividida.

---

# Evolução

Novas funcionalidades nunca devem ser adicionadas diretamente.

Todo novo desenvolvimento deve começar pela criação de uma nova SPEC.

---

# Objetivo Final

O processo de desenvolvimento do Project Atlas busca transformar uma arquitetura complexa em pequenas entregas previsíveis.

Cada SPEC representa um passo concreto em direção ao objetivo final da plataforma.

Essa metodologia reduz retrabalho, facilita revisões, melhora a colaboração entre humanos e inteligências artificiais e garante que o Atlas evolua de forma organizada, sustentável e consistente.
