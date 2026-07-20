# Architecture Constitution

> **Project Atlas — Constitutional Principles**

Version: 1.1

---

# Introdução

Este documento define os princípios arquiteturais fundamentais do Project Atlas.

Sua finalidade é estabelecer regras permanentes que orientam todas as decisões de arquitetura, implementação e evolução do projeto.

Esses princípios possuem prioridade sobre decisões de implementação. Sempre que uma solução técnica entrar em conflito com esta Constituição, a implementação deverá ser revisada ou a arquitetura deverá passar por um processo explícito de atualização da documentação.

A Constituição existe para garantir consistência, modularidade e longevidade ao projeto.

---

# Artigo 1 — A documentação é a fonte oficial da verdade

Toda implementação deve estar alinhada com a documentação oficial do projeto.

Nenhuma decisão arquitetural deve existir apenas no código.

Mudanças estruturais deverão ser documentadas antes ou juntamente com sua implementação.

---

# Artigo 2 — O usuário interage com apenas uma Persona

Independentemente da complexidade interna do sistema, o usuário deve perceber apenas uma única entidade durante toda a interação.

A existência de Skills, ferramentas, planejadores ou qualquer outro componente interno nunca deve alterar a identidade percebida pelo usuário.

---

# Artigo 3 — O Core é o único orquestrador

Toda execução do sistema deve ser coordenada pelo Core.

Nenhum componente pode assumir responsabilidades de orquestração por conta própria.

Toda coordenação entre módulos deve passar pelo Core.

---

# Artigo 4 — Cada módulo possui uma única responsabilidade

Cada módulo deve possuir um propósito claramente definido.

Responsabilidades não devem ser compartilhadas entre módulos sem necessidade.

Quando uma funcionalidade crescer além do escopo original de um módulo, ela deverá ser extraída para um novo componente.

---

# Artigo 5 — Componentes permanecem desacoplados

Nenhum módulo deve depender diretamente da implementação interna de outro módulo.

Toda comunicação deve ocorrer através de interfaces públicas e contratos bem definidos.

O desacoplamento é um requisito arquitetural permanente.

---

# Artigo 6 — Planejamento precede execução

Sempre que uma tarefa possuir impacto significativo ou elevada complexidade, o sistema deverá produzir um plano antes de iniciar sua execução.

O planejamento deve permitir que o usuário compreenda a estratégia adotada e acompanhe seu progresso.

---

# Artigo 7 — Transparência é obrigatória

Toda ação relevante deverá ser registrada.

O sistema deve ser capaz de explicar:

- o objetivo recebido;
- as decisões tomadas;
- as ferramentas utilizadas;
- o resultado produzido.

A transparência é parte essencial da experiência do usuário.

---

# Artigo 8 — Segurança possui prioridade sobre autonomia

Nenhuma ação potencialmente destrutiva deverá ser executada sem autorização explícita do usuário ou sem uma política previamente configurada.

Sempre que houver dúvida, o sistema deverá solicitar confirmação.

---

# Artigo 9 — Especialização deve permanecer invisível

O sistema poderá utilizar diversas Skills especializadas durante uma execução.

Entretanto, essa coordenação deverá permanecer invisível para o usuário.

O usuário conversa apenas com sua Persona.

As Skills representam um detalhe interno da arquitetura.

---

# Artigo 10 — Ferramentas não contêm lógica de negócio

Ferramentas existem apenas para interagir com recursos externos.

Toda lógica de decisão pertence ao Core e aos componentes responsáveis pelo planejamento e execução.

Ferramentas não devem tomar decisões arquiteturais.

---

# Artigo 11 — A memória possui autoridade exclusiva sobre o contexto

Nenhum módulo poderá armazenar contexto permanente de forma independente.

Toda informação persistente deverá ser gerenciada pelo sistema de memória.

Isso garante consistência, rastreabilidade e facilidade de manutenção.

---

# Artigo 12 — Toda capacidade deve ser extensível

Novas Personas, Skills, Ferramentas ou módulos deverão ser adicionados sem exigir modificações significativas na arquitetura existente.

A evolução do sistema deve ocorrer por extensão e não por acoplamento.

---

# Artigo 13 — O sistema deve reconhecer seus limites

Quando não possuir confiança suficiente para responder, modificar código ou executar determinada ação, o Atlas deverá comunicar essa limitação ao usuário.

Inventar respostas, assumir fatos inexistentes ou ocultar incertezas viola os princípios fundamentais da plataforma.

---

# Artigo 14 — A arquitetura deve favorecer longevidade

Toda decisão arquitetural deve considerar a evolução do projeto ao longo dos anos.

Soluções temporárias que aumentem significativamente a complexidade futura deverão ser evitadas.

O objetivo é construir uma plataforma sustentável e de fácil manutenção.

---

# Artigo 15 — A IA é uma colaboradora, não a arquiteta

Modelos de inteligência artificial utilizados durante o desenvolvimento devem respeitar integralmente esta Constituição.

Nenhuma IA deve criar novos componentes, alterar responsabilidades ou modificar a arquitetura sem respaldo na documentação oficial.

Mudanças estruturais exigem atualização da documentação correspondente.

## Emenda v1.1 (2026-07-19) — aprovação delegada de SPECs

Uma SPEC pode transitar de `Draft` para `Ready` **sem veto humano** quando aprovada pelo gate adversarial automatizado (`architecture-reviewer`), e o pipeline pode seguir até implementação, validação e fechamento sem consulta ao usuário. Todas as decisões de design tomadas nesse fluxo devem ficar registradas na própria SPEC em formato de veto (decisão + porquê + alternativa descartada), preservando o Artigo 7 (transparência) e o direito de override do usuário a qualquer momento.

Permanecem exigindo decisão humana explícita — o pipeline **para e escala**:

1. emendar esta Constituição;
2. criar módulo novo fora do Module Catalog ou mover responsabilidade entre módulos;
3. criar um novo ADR (decisão arquitetural inédita);
4. segundo veto consecutivo do `architecture-reviewer` sobre a mesma SPEC.

---

# Processo de Evolução

Esta Constituição não é imutável.

Novos princípios poderão ser adicionados sempre que necessário.

Entretanto, qualquer alteração deverá ser cuidadosamente avaliada, documentada e aprovada antes de impactar a arquitetura da plataforma.

O objetivo da Constituição é preservar a identidade técnica do Project Atlas ao longo de toda a sua evolução.

---

# Princípio Fundamental

Toda decisão tomada durante o desenvolvimento deve responder positivamente à seguinte pergunta:

> **"Esta implementação torna o Project Atlas mais simples, mais modular, mais transparente e mais sustentável?"**

Caso a resposta seja negativa, a solução deverá ser reconsiderada antes de ser incorporada ao projeto.
