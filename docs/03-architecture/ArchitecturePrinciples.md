# Architecture Principles

> **Project Atlas — Architectural Principles**

Version: 1.0

---

# Objetivo

Este documento define os princípios que orientam todas as decisões arquiteturais do Project Atlas.

Seu propósito é explicar **por que** a arquitetura foi projetada da maneira atual e quais critérios devem ser preservados durante sua evolução.

Este documento não descreve módulos específicos nem tecnologias de implementação. Esses assuntos pertencem a outros documentos.

---

# Escopo

Este documento define:

- princípios arquiteturais;
- responsabilidades gerais;
- critérios de separação de componentes;
- diretrizes para evolução da arquitetura.

Este documento não define:

- requisitos do produto;
- estrutura de diretórios;
- detalhes de implementação;
- linguagens ou frameworks;
- tecnologias específicas.

---

# Relação com outros documentos

Este documento complementa:

- Vision
- Architecture Constitution
- Architecture Decision Process
- Product Requirements
- Cognitive Lifecycle

A Architecture deverá ser uma consequência direta destes princípios.

---

# Princípio 1 — Arquitetura orientada pelo ciclo cognitivo

O Atlas é organizado em torno do **Cognitive Lifecycle**.

Os módulos existem para implementar esse ciclo.

O ciclo não deve ser adaptado às limitações da implementação; a implementação deve ser adaptada ao ciclo.

---

# Princípio 2 — Responsabilidade única

Cada módulo deve possuir uma única responsabilidade claramente definida.

Sempre que um componente acumular responsabilidades distintas, sua divisão deverá ser considerada.

Responsabilidades compartilhadas reduzem clareza e aumentam acoplamento.

---

# Princípio 3 — Separação entre identidade e inteligência

A identidade apresentada ao usuário é independente da inteligência utilizada.

Personas representam a forma de interação.

Modelos de IA representam mecanismos de processamento.

Esses conceitos devem permanecer desacoplados.

---

# Princípio 4 — Separação entre decisão e execução

Decidir e executar são responsabilidades distintas.

Componentes responsáveis por raciocínio não devem executar ações diretamente.

Componentes responsáveis por execução não devem tomar decisões estratégicas.

Essa separação melhora previsibilidade, testes e manutenção.

---

# Princípio 5 — Ferramentas são adaptadores

Ferramentas existem exclusivamente para interagir com recursos externos.

Elas não contêm lógica de negócio, planejamento ou tomada de decisão.

Toda inteligência pertence às camadas superiores da plataforma.

---

# Princípio 6 — Contexto não é memória

Contexto representa o estado atual da execução.

Memória representa conhecimento persistente.

Esses conceitos possuem ciclos de vida diferentes e, portanto, devem permanecer separados.

---

# Princípio 7 — Especialização invisível

O usuário nunca deve perceber diretamente a existência de Skills, mecanismos internos ou componentes especializados.

A especialização é uma característica interna da plataforma.

A experiência externa deve permanecer simples e consistente.

---

# Princípio 8 — Evolução por extensão

Novas funcionalidades devem ser adicionadas preferencialmente por extensão da arquitetura existente.

Alterações estruturais devem ser evitadas sempre que uma solução modular for possível.

---

# Princípio 9 — Baixo acoplamento

Os módulos devem depender apenas de contratos públicos.

Nenhum componente deve acessar detalhes internos da implementação de outro módulo.

A comunicação deve ocorrer por interfaces claramente definidas.

---

# Princípio 10 — Alta observabilidade

Toda execução relevante deve ser observável.

O sistema deve permitir reconstruir o fluxo completo de uma tarefa por meio de logs, eventos e registros estruturados.

A observabilidade é considerada um requisito arquitetural.

---

# Princípio 11 — Planejamento proporcional

Nem toda solicitação exige planejamento elaborado.

O nível de planejamento deve ser proporcional à complexidade da tarefa.

Solicitações simples devem possuir baixa latência.

Solicitações complexas devem privilegiar qualidade e organização.

---

# Princípio 12 — Falhas são parte do fluxo

A arquitetura deve considerar falhas como eventos normais.

Componentes devem ser capazes de:

- interromper execuções;
- solicitar novas informações;
- replanejar;
- repetir etapas;
- recuperar estados sempre que apropriado.

---

# Princípio 13 — Independência tecnológica

A arquitetura não deve depender permanentemente de:

- um modelo de IA;
- um banco de dados;
- um sistema operacional;
- um framework específico.

Tecnologias são substituíveis.

A arquitetura deve permanecer estável mesmo diante de mudanças tecnológicas.

---

# Princípio 14 — Modularidade acima da conveniência

Adicionar código rapidamente nunca deve justificar aumento desnecessário de acoplamento.

Quando houver conflito entre rapidez de implementação e qualidade arquitetural, a modularidade deve prevalecer.

---

# Princípio 15 — A documentação precede a implementação

Mudanças arquiteturais devem ser registradas antes ou simultaneamente à implementação.

Nenhuma decisão estrutural relevante deve existir apenas no código.

---

# Critérios para Novos Componentes

Um novo componente só deve ser criado quando:

- representar um conceito arquitetural independente;
- possuir responsabilidade claramente delimitada;
- reduzir a complexidade do sistema;
- favorecer reutilização;
- justificar sua existência a longo prazo.

Caso contrário, a funcionalidade deve permanecer na arquitetura existente.

---

# Critérios para Revisão da Arquitetura

A arquitetura deve ser revisada quando ocorrer pelo menos uma das situações abaixo:

- sobreposição de responsabilidades;
- aumento excessivo de acoplamento;
- dificuldade recorrente de manutenção;
- necessidade frequente de contornar limitações arquiteturais;
- surgimento de novos domínios funcionais.

---

# Objetivo Final

A arquitetura do Project Atlas deve permanecer compreensível, modular, previsível e preparada para evoluir durante muitos anos.

Toda decisão arquitetural deve contribuir para reduzir complexidade, aumentar reutilização e preservar a identidade da plataforma.

A arquitetura não é um fim em si mesma; ela existe para tornar a evolução do Atlas sustentável.
