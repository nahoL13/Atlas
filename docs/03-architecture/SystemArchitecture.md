# System Architecture

> **Project Atlas — System Architecture**

Version: 1.0

---

# Objetivo

Este documento define a arquitetura conceitual do Project Atlas.

Seu propósito é descrever como a plataforma é organizada, quais são seus componentes principais, como eles colaboram entre si e quais responsabilidades pertencem a cada camada do sistema.

Este documento descreve a arquitetura do Atlas em alto nível e serve como referência para toda implementação futura.

---

# Escopo

Este documento define:

- a organização arquitetural da plataforma;
- as camadas do sistema;
- os principais componentes;
- as responsabilidades de cada componente;
- as relações entre os componentes.

Este documento não define:

- tecnologias;
- linguagens de programação;
- frameworks;
- estrutura de diretórios;
- detalhes de implementação.

---

# Relação com outros documentos

Esta arquitetura é construída sobre os seguintes documentos:

- [Vision](../01-vision/Vision.md)
- [Architecture Constitution](../00-project/ArchitectureConstitution.md)
- [Architecture Decision Process](../00-project/ArchitectureDecisionProcess.md)
- [Glossary](../00-project/Glossary.md)
- Product Requirements
- [Cognitive Lifecycle](CognitiveLifecycle.md)
- [Architecture Principles](ArchitecturePrinciples.md)

Este documento deve ser interpretado como a materialização arquitetural desses princípios.

---

# Visão Geral

O Atlas é uma plataforma modular orientada por um ciclo cognitivo.

Em vez de organizar sua arquitetura em torno de modelos de IA ou ferramentas específicas, o sistema é organizado em torno das responsabilidades necessárias para compreender, planejar, executar e aprender.

Cada camada possui uma função claramente definida.

Nenhuma camada deve assumir responsabilidades pertencentes a outra.

---

# Arquitetura em Camadas

A arquitetura é composta por quatro camadas principais.

```
Usuário

↓

Persona Layer

↓

Intelligence Layer

↓

Execution Layer

↓

External Systems

──────────────

Support Layer

──────────────

Platform Layer
```

As camadas superiores representam o fluxo cognitivo.

As camadas inferiores fornecem infraestrutura e serviços para suportar esse fluxo.

---

# Platform Layer

A Platform Layer representa a base da plataforma.

Sua responsabilidade é manter o Atlas operacional.

Ela inclui funções relacionadas ao ciclo de vida da aplicação, gerenciamento de configuração, carregamento de módulos, gerenciamento de dependências e inicialização do sistema.

Esta camada nunca participa do processo cognitivo.

Ela apenas mantém a plataforma funcionando.

---

## Componentes

- Core
- Configuration
- Lifecycle Manager
- Event Bus
- Plugin Manager

---

## Não é responsável por

- compreender solicitações;
- tomar decisões;
- executar tarefas;
- armazenar memória.

---

# Intelligence Layer

A Intelligence Layer representa o cérebro do Atlas.

É responsável por compreender objetivos, interpretar contexto, raciocinar sobre problemas e construir estratégias.

Esta camada decide **o que deve ser feito**, mas não executa diretamente nenhuma ação.

---

## Componentes

### Persona Service

Responsável pela experiência apresentada ao usuário.

Define:

- personalidade;
- estilo de comunicação;
- voz;
- idioma;
- comportamento.

Não toma decisões técnicas.

---

### Cognitive Core

Responsável pela compreensão do objetivo.

Coordena o raciocínio de alto nível.

Decide estratégias.

Seleciona capacidades necessárias.

Solicita planejamento quando apropriado.

É o único componente autorizado a tomar decisões estratégicas.

---

### Planner

Transforma estratégias em planos executáveis.

Organiza etapas.

Define prioridades.

Identifica dependências.

Não executa tarefas.

---

## Não é responsável por

- executar ferramentas;
- modificar arquivos;
- armazenar memória;
- registrar logs.

---

# Execution Layer

A Execution Layer transforma planos em ações concretas.

É responsável pela execução coordenada das tarefas definidas pela camada de inteligência.

Não toma decisões estratégicas.

---

## Runtime

Coordena toda execução.

Gerencia:

- tarefas;
- filas;
- estados;
- progresso;
- cancelamentos;
- recuperação de falhas.

---

## Skill Registry

Mantém o catálogo de Skills disponíveis.

Permite localizar, carregar, registrar e remover Skills.

As Skills representam especializações reutilizáveis da plataforma.

---

## Tool Registry

Mantém o catálogo de ferramentas disponíveis.

Fornece acesso padronizado aos recursos externos.

As ferramentas não possuem inteligência própria.

---

## Task Manager

Gerencia o ciclo de vida das tarefas.

Controla execução, progresso, dependências e conclusão.

---

## Não é responsável por

- interpretar objetivos;
- decidir estratégias;
- alterar personalidade;
- armazenar conhecimento permanente.

---

# Support Layer

A Support Layer fornece serviços compartilhados para toda a plataforma.

Esses serviços não participam diretamente da tomada de decisão, mas oferecem contexto e persistência.

---

## Memory Service

Responsável por todo conhecimento persistente.

Gerencia:

- memória de longo prazo;
- preferências;
- histórico relevante;
- conhecimento do usuário;
- memória dos projetos.

Nenhum outro componente pode armazenar conhecimento permanente.

---

## Context Service

Responsável por representar o estado atual do ambiente.

Exemplos:

- projeto aberto;
- arquivos ativos;
- terminal atual;
- sistema operacional;
- horário;
- sessão atual.

Contexto é temporário.

---

## Activity Service

Responsável pela observabilidade.

Registra:

- eventos;
- logs;
- histórico;
- timeline;
- auditoria.

Toda atividade relevante deve passar por este serviço.

---

## Não é responsável por

- tomar decisões;
- executar tarefas;
- controlar Personas.

---

# Fluxo Principal

Toda solicitação percorre o seguinte caminho:

```
Usuário

↓

Persona Service

↓

Cognitive Core

↓

Planner

↓

Runtime

↓

Skills

↓

Tools

↓

Resultado

↓

Persona Service

↓

Usuário
```

Durante toda a execução, os serviços de suporte permanecem disponíveis.

```
Memory Service

↑↓

Context Service

↑↓

Activity Service
```

Esses serviços acompanham toda a execução sem controlar seu fluxo.

---

# Comunicação entre Componentes

Os componentes devem comunicar-se exclusivamente através de interfaces públicas.

Nenhum módulo deve acessar diretamente detalhes internos de outro componente.

Toda comunicação deve respeitar os contratos definidos pela arquitetura.

---

# Responsabilidades

Cada componente possui uma responsabilidade claramente definida.

Nenhum componente deve assumir responsabilidades pertencentes a outro.

Quando uma responsabilidade crescer além do escopo original de um componente, sua extração para um novo módulo deverá ser considerada.

---

# Limites Arquiteturais

A arquitetura estabelece os seguintes limites:

- apenas o Cognitive Core toma decisões estratégicas;
- apenas o Planner cria planos;
- apenas o Runtime coordena execuções;
- apenas o Memory Service armazena conhecimento permanente;
- apenas o Persona Service representa a identidade do sistema;
- apenas o Activity Service registra a atividade da plataforma.

Esses limites devem ser preservados durante toda a evolução do Atlas.

---

# Extensibilidade

A arquitetura foi projetada para evoluir por extensão.

Novas Personas, Skills, Tools e integrações deverão ser adicionadas sem modificar significativamente a estrutura principal da plataforma.

A evolução do sistema deve preservar os contratos existentes entre as camadas.

---

# Objetivo Final

A arquitetura do Project Atlas existe para transformar um objetivo fornecido pelo usuário em uma solução executável de forma organizada, transparente e sustentável.

Cada componente da plataforma possui responsabilidades bem definidas e colabora para implementar o ciclo cognitivo descrito pela documentação do projeto.

A arquitetura deve permanecer simples para compreender, modular para evoluir e estável para sustentar o crescimento da plataforma ao longo dos anos.
