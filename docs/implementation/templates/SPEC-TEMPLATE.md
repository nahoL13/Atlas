# Implementation Specification Template

> **Project Atlas — Implementation Specification**

Version: 1.1

---

# Informações Gerais

**ID**

SPEC-XXXX

---

**Título**

Nome curto e objetivo da implementação.

---

**Status**

- Draft
- Ready
- In Progress
- Review
- Done

---

**Prioridade**

- Critical
- High
- Medium
- Low

---

# Objetivo

Descreva claramente o objetivo desta implementação.

Responda:

> O que deverá existir quando esta SPEC estiver concluída?

Evite explicar como implementar.

---

# Motivação

Explique por que esta implementação é necessária.

Ela resolve qual problema?

Qual documento originou esta necessidade?

---

# Referências

Liste toda documentação relacionada.

Exemplo

- PRD
- System Architecture
- Module Catalog
- ADRs
- Cognitive Lifecycle

Toda SPEC deve possuir pelo menos uma referência.

---

# Escopo

Liste exatamente o que faz parte desta implementação.

Exemplo

- criar módulo
- criar interfaces
- criar testes
- criar documentação

Somente itens listados aqui podem ser implementados.

---

# Fora do Escopo

Liste explicitamente tudo que NÃO deve ser implementado.

Esta seção é obrigatória.

Ela existe para evitar expansão de escopo.

Exemplo

- não implementar lógica de negócio
- não integrar com IA
- não implementar persistência
- não criar interface gráfica

---

# Pré-requisitos

Liste as SPECs que devem estar concluídas antes desta.

Exemplo

SPEC-0001

SPEC-0002

---

# Critérios de Aceitação

Cada item deve ser verificável.

Exemplo

- módulo criado
- testes passando
- documentação atualizada
- lint sem erros
- interfaces definidas

Uma SPEC somente pode ser concluída quando TODOS os critérios forem atendidos.

---

# Arquivos Esperados

Liste os arquivos que provavelmente serão criados.

Exemplo

```text
src/runtime/

runtime.ts

runtime.interface.ts

runtime.test.ts

README.md
```

Essa lista representa uma expectativa.

Pode sofrer pequenos ajustes durante a implementação.

---

# Componentes Impactados

Liste os componentes afetados.

Exemplo

Runtime

Planner

Memory Service

---

# Interfaces Necessárias

Liste interfaces que deverão existir.

Caso nenhuma seja necessária, informar explicitamente.

---

# Fluxo Esperado

Descreva resumidamente o comportamento esperado.

Exemplo

```text
Planner

↓

Runtime

↓

Task Manager

↓

Resultado
```

---

# Estratégia de Implementação

Sugira uma ordem recomendada para desenvolvimento.

Exemplo

1. criar estrutura

2. criar interfaces

3. criar testes

4. implementar comportamento

5. validar

---

# Estratégia de Testes

Defina o que deverá ser testado.

Exemplo

- criação do módulo
- inicialização
- erros
- casos inválidos

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `docs/implementation/LESSONS_LEARNED.md`.

---

# Restrições

Liste regras importantes.

Exemplo

Não criar novos módulos.

Não alterar arquitetura.

Não modificar outros componentes sem necessidade.

---

# Observações

Informações adicionais relevantes.

---

# Checklist para IA

Antes de implementar:

- ler documentação referenciada;
- compreender objetivo;
- identificar módulo responsável;
- validar dependências.

Durante implementação:

- manter responsabilidade única;
- evitar duplicação;
- respeitar arquitetura;
- manter simplicidade.

Após implementação:

- executar testes;
- revisar documentação;
- validar critérios de aceitação;
- registrar lições aprendidas;
- registrar conclusão.

---

# Resultado Esperado

Descreva o estado final esperado do projeto após conclusão desta SPEC.

Esta seção deve permitir que qualquer pessoa compreenda o sucesso da implementação sem precisar analisar o código.
