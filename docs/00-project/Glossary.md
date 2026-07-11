# Glossary

> **Project Atlas — Official Terminology**

Version: 1.1

---

# Objetivo

Este documento define o significado oficial dos termos utilizados no Project Atlas.

Seu objetivo é garantir que toda a documentação, implementação e desenvolvimento assistido por inteligência artificial utilizem a mesma linguagem.

Os termos definidos neste documento possuem prioridade sobre interpretações externas.

---

# Atlas

**Atlas** é a plataforma completa.

Representa todo o sistema responsável por coordenar inteligência artificial, ferramentas, memória, planejamento e automação.

Atlas não é uma Persona.

Atlas não é um modelo de IA.

Atlas é a plataforma.

---

# Core

O **Core** é o núcleo da plataforma.

É responsável por coordenar todos os componentes internos.

Nenhum outro módulo possui autoridade para controlar o fluxo geral do sistema.

---

# Persona

Uma **Persona** representa a identidade utilizada durante a interação com o usuário.

A Persona define aspectos como:

- nome;
- estilo de comunicação;
- personalidade;
- tom de voz;
- comportamento;
- idioma.

Uma Persona não define capacidades técnicas.

---

# Jarvis

Jarvis é a primeira Persona oficial do Atlas.

Seu foco principal é produtividade, desenvolvimento de software e colaboração técnica.

Jarvis representa apenas uma Persona e não a plataforma inteira.

---

# Skill

Uma **Skill** representa uma capacidade especializada.

Ela reúne conhecimento, regras e ferramentas necessárias para executar um determinado tipo de trabalho.

Uma Skill nunca conversa diretamente com o usuário.

---

# Skill Permanente

Uma Skill Permanente permanece disponível para reutilização em diferentes tarefas.

Exemplos:

- revisão de código;
- desenvolvimento frontend;
- pesquisa técnica;
- documentação.

---

# Skill Temporária

Uma Skill Temporária é criada para resolver uma necessidade específica.

Ela existe apenas durante a execução da tarefa e pode ser descartada posteriormente.

---

# Skill Builder

O **Skill Builder** é o componente responsável por criar novas Skills.

Ele pode gerar Skills temporárias durante uma execução ou auxiliar na criação de Skills permanentes quando uma nova especialização se tornar necessária.

---

# Tool

Uma **Tool** representa uma interface para interação com recursos externos.

Exemplos:

- terminal;
- sistema de arquivos;
- Git;
- Claude Code;
- navegador;
- editor de código.

Ferramentas executam ações.

Ferramentas não tomam decisões.

---

# Planner

O **Planner** transforma um objetivo em um plano de execução.

Seu trabalho consiste em decompor problemas complexos em etapas menores e organizadas.

O Planner não executa tarefas.

---

# Plan

Um **Plan** é a estratégia criada pelo Planner.

Ele descreve quais etapas deverão ser realizadas para atingir um objetivo.

---

# Task

Uma **Task** representa uma unidade individual de trabalho.

Uma Task possui:

- objetivo;
- estado;
- responsável pela execução;
- resultado esperado.

---

# Workflow

Um **Workflow** é um conjunto organizado de Tasks.

Representa toda a sequência necessária para concluir uma atividade.

---

# Orchestrator

O **Orchestrator** coordena a execução dos componentes internos.

Seu trabalho consiste em selecionar Skills, organizar a execução das Tasks e consolidar os resultados.

O usuário nunca interage diretamente com o Orchestrator.

---

# Memory

Memory representa todo o sistema responsável pelo armazenamento e recuperação de contexto.

Inclui informações temporárias e permanentes.

Nenhum outro componente possui autoridade para armazenar informações persistentes.

---

# Context

Context representa todas as informações disponíveis para execução de uma tarefa específica.

Pode incluir:

- histórico recente;
- arquivos;
- preferências;
- memória;
- objetivos;
- estado atual.

---

# Session

Uma Session representa uma interação contínua entre usuário e Atlas.

Seu contexto existe apenas durante a sessão.

---

# Log

Um Log representa um registro estruturado de eventos ocorridos durante uma execução.

Logs podem ser utilizados para:

- auditoria;
- depuração;
- histórico;
- transparência.

---

# Event

Um Event representa qualquer ocorrência relevante dentro do sistema.

Eventos podem originar Logs.

---

# Capability

Capability representa uma capacidade oferecida pela plataforma.

Uma Capability pode ser implementada por uma ou mais Skills.

---

# Module

Um Module representa uma unidade arquitetural independente.

Cada módulo possui responsabilidade própria e interfaces bem definidas.

---

# Interface

Uma Interface representa um contrato público de comunicação entre módulos.

Interfaces descrevem o que um componente oferece, nunca sua implementação.

---

# Architecture

Architecture representa a organização estrutural da plataforma.

Define responsabilidades, limites e comunicação entre componentes.

---

# Documentation

Documentation representa a fonte oficial da verdade do projeto.

Toda implementação deve estar alinhada com a documentação vigente.

---

# SPEC

Uma **SPEC** (Implementation Specification) é o documento que define a menor unidade de trabalho implementável do projeto.

Ela descreve objetivo, escopo, critérios de aceitação e Definition of Done antes de qualquer implementação.

Nenhuma implementação ocorre sem uma SPEC aprovada.

Sua estrutura oficial é definida pelo Implementation Specification Template.

---

# AI Assistant

Um AI Assistant é qualquer modelo de inteligência artificial utilizado durante o desenvolvimento ou execução do Atlas.

Modelos de IA são componentes substituíveis.

Eles não fazem parte da identidade arquitetural da plataforma.

---

# Usuário

Usuário é a pessoa que interage com uma Persona do Atlas.

O usuário nunca interage diretamente com Skills, Tools ou componentes internos.

---

# Definições Fundamentais

Para evitar ambiguidades, o projeto adota as seguintes definições:

- Atlas é a plataforma.
- Jarvis é uma Persona.
- Persona é identidade.
- Skill é especialização.
- Tool é execução.
- Planner cria planos.
- Orchestrator coordena.
- Memory armazena contexto.
- Logs registram eventos.
- Modules organizam responsabilidades.
- Documentation define a verdade oficial.
- SPEC define a unidade de trabalho implementável.

Essas definições devem ser utilizadas em toda a documentação e implementação do Project Atlas.
