# Module Catalog

> **Project Atlas — Official Module Catalog**

Version: 1.1
Status: Draft Normativo

---

## Objetivo

Este documento apresenta o catálogo oficial dos principais componentes arquiteturais do Project Atlas.

Seu propósito é permitir que desenvolvedores e inteligências artificiais identifiquem rapidamente:

- qual componente é responsável por determinada função;
- quais componentes podem depender dele;
- quais dependências ele pode utilizar;
- quais responsabilidades não pertencem ao seu escopo;
- em qual projeto do workspace sua implementação deve residir.

Este documento funciona como um índice arquitetural.

Ele não substitui as especificações individuais dos módulos.

---

## Escopo

Este documento define:

- componentes principais da plataforma;
- responsabilidades resumidas;
- relações de dependência;
- limites de responsabilidade;
- localização de destino no monorepo.

Este documento não define:

- interfaces detalhadas;
- estruturas de dados;
- tecnologias;
- linguagens;
- protocolos;
- classes;
- métodos;
- implementação interna.

Esses assuntos deverão ser tratados nas especificações individuais dos módulos e nas decisões técnicas do projeto.

---

## Relação com outros documentos

Este catálogo deve ser interpretado em conjunto com:

- `PROJECT.md`;
- `Vision.md`;
- `Architecture Constitution.md`;
- `Architecture Decision Process.md`;
- `Glossary.md`;
- `PRD.md`;
- `Cognitive Lifecycle.md`;
- `Architecture Principles.md`;
- `System Architecture.md`;
- `Project Structure.md`;
- `Workspace Strategy.md`.

Em caso de conflito, os documentos normativos de nível superior possuem prioridade.

A localização física dos componentes no monorepo é governada pelo `docs/03-architecture/ProjectStructure.md`.

A coluna "Localização" deste catálogo indica o package de **destino** de cada componente; consolidações temporárias durante o MVP são definidas pelo Project Structure.

---

# Regras de Uso

Antes de criar um novo componente, deve-se consultar este catálogo.

Uma nova responsabilidade deve ser atribuída a um componente existente sempre que:

- estiver dentro de seu domínio;
- não violar seus limites;
- não criar acoplamento inadequado;
- não causar sobreposição de responsabilidades.

Um novo componente somente poderá ser criado quando representar um conceito arquitetural independente e quando sua necessidade estiver documentada por uma decisão arquitetural.

---

# Visão Geral

Os componentes do Atlas estão organizados nas seguintes categorias:

1. **Platform Components**
   Mantêm a plataforma operacional.

2. **Intelligence Components**
   Compreendem, decidem e planejam.

3. **Execution Components**
   Transformam planos em ações.

4. **Support Components**
   Fornecem memória, contexto e observabilidade.

5. **Interaction Components**
   Gerenciam a comunicação entre usuário e plataforma.

6. **Extension Components**
   Permitem adicionar Skills, Tools, Personas e integrações.

---

# Catálogo Resumido

| Componente            | Categoria    | Responsabilidade principal                    | Localização (destino)      |
| --------------------- | ------------ | --------------------------------------------- | -------------------------- |
| Core                  | Platform     | Inicializar e manter a plataforma operacional | `packages/core`            |
| Configuration Service | Platform     | Fornecer configurações validadas              | `packages/core`            |
| Lifecycle Manager     | Platform     | Controlar inicialização e encerramento        | `packages/core`            |
| Event Bus             | Platform     | Transportar eventos internos                  | `packages/core`            |
| Plugin Manager        | Extension    | Carregar extensões autorizadas                | `packages/core`            |
| Cognitive Core        | Intelligence | Compreender objetivos e decidir estratégias   | `packages/cognitive`       |
| Planner               | Intelligence | Transformar estratégias em planos             | `packages/planner` ¹       |
| Runtime               | Execution    | Coordenar a execução dos planos               | `packages/runtime`         |
| Task Manager          | Execution    | Gerenciar o ciclo de vida das Tasks           | `packages/runtime`         |
| Skill Registry        | Extension    | Gerenciar o catálogo de Skills                | `packages/skills`          |
| Skill Builder         | Extension    | Criar e validar novas Skills                  | `packages/skills`          |
| Tool Registry         | Extension    | Gerenciar ferramentas disponíveis             | `packages/tools`           |
| Memory Service        | Support      | Gerenciar todo conhecimento persistente       | `packages/memory`          |
| Context Service       | Support      | Representar o estado atual e temporário       | `packages/context` ¹       |
| Activity Service      | Support      | Registrar eventos, logs e timeline            | `packages/activity` ¹      |
| Persona Service       | Interaction  | Aplicar identidade e estilo de comunicação    | `packages/persona`         |
| Input Gateway         | Interaction  | Normalizar entradas do usuário                | `apps/*`                   |
| Output Gateway        | Interaction  | Entregar respostas e atualizações             | `apps/*`                   |
| Permission Service    | Support      | Avaliar autorização e risco das ações         | `packages/permissions`     |
| Model Gateway         | Extension    | Padronizar acesso a modelos de IA             | `packages/model-gateway`   |

¹ Consolidado durante o MVP conforme o Project Structure: Planner em `packages/cognitive`, Context Service em `packages/memory`, Activity Service em `packages/core`.

---

# Platform Components

## Core

### Responsabilidade

Inicializar a plataforma e manter seus componentes fundamentais disponíveis.

O Core representa a base operacional do Atlas.

### Pode utilizar

- Configuration Service;
- Lifecycle Manager;
- Event Bus;
- Plugin Manager;
- mecanismos de injeção e resolução de dependências.

### É utilizado por

- aplicações clientes;
- serviços internos;
- processo de inicialização da plataforma.

### Não é responsável por

- compreender solicitações;
- planejar;
- tomar decisões estratégicas;
- executar Skills;
- acessar Tools;
- formatar respostas;
- armazenar memória diretamente.

### Localização

`packages/core`

---

## Configuration Service

### Responsabilidade

Carregar, validar e disponibilizar configurações da plataforma.

Deve oferecer uma representação consistente das configurações utilizadas pelos demais componentes.

### Pode utilizar

- fontes de configuração autorizadas;
- validação de esquemas;
- configuração de ambiente.

### É utilizado por

- Core;
- Lifecycle Manager;
- serviços internos;
- Runtime;
- aplicações clientes.

### Não é responsável por

- definir regras de negócio;
- decidir qual configuração é estrategicamente melhor;
- armazenar memória do usuário;
- alterar configurações silenciosamente.

### Localização

`packages/core`

---

## Lifecycle Manager

### Responsabilidade

Controlar o ciclo de vida operacional da plataforma.

Inclui:

- inicialização;
- verificação de dependências;
- ativação de componentes;
- desligamento seguro;
- encerramento de tarefas quando apropriado.

### Pode utilizar

- Core;
- Configuration Service;
- Event Bus;
- registros de componentes.

### É utilizado por

- aplicações executáveis;
- Core;
- processos em background.

### Não é responsável por

- ciclo cognitivo;
- planejamento;
- execução funcional das Tasks;
- recuperação de memória.

### Localização

`packages/core`

---

## Event Bus

### Responsabilidade

Transportar eventos internos entre componentes sem exigir acoplamento direto entre suas implementações.

### Pode utilizar

- contratos de eventos;
- mecanismos de publicação e assinatura;
- Activity Service para observabilidade.

### É utilizado por

- componentes que publicam eventos;
- componentes que reagem a eventos;
- serviços de monitoramento.

### Não é responsável por

- decidir o significado dos eventos;
- coordenar a execução completa;
- armazenar conhecimento permanente;
- substituir chamadas síncronas obrigatórias.

### Localização

`packages/core`

---

# Intelligence Components

## Cognitive Core

### Responsabilidade

Compreender o objetivo do usuário e determinar a estratégia de alto nível mais adequada.

É o único componente autorizado a tomar decisões estratégicas sobre como uma solicitação deve ser abordada.

### Pode utilizar

- Context Service;
- Memory Service;
- Permission Service;
- Model Gateway;
- catálogo de capacidades;
- Planner;
- Activity Service.

### É utilizado por

- fluxo principal do Atlas;
- aplicações que submetem objetivos;
- mecanismos de replanejamento.

### Produz

- intenção estruturada;
- classificação de complexidade;
- estratégia;
- capacidades necessárias;
- avaliação preliminar de risco;
- solicitação de planejamento.

### Não é responsável por

- executar comandos;
- modificar arquivos;
- chamar Tools diretamente;
- persistir memória diretamente;
- formatar a personalidade da resposta;
- gerenciar filas e Tasks.

### Localização

`packages/cognitive`

---

## Planner

### Responsabilidade

Transformar uma estratégia em um plano executável.

### Pode utilizar

- estratégia produzida pelo Cognitive Core;
- contexto autorizado;
- catálogo de Skills;
- catálogo de Tools;
- critérios de sucesso;
- restrições de segurança.

### É utilizado por

- Cognitive Core;
- Runtime;
- processos de replanejamento.

### Produz

- Plan;
- conjunto de Tasks;
- dependências;
- ordem de execução;
- critérios de conclusão;
- pontos de validação.

### Não é responsável por

- executar Tasks;
- escolher a personalidade;
- armazenar memória;
- alterar o objetivo original;
- acionar ferramentas diretamente.

### Localização

`packages/planner`

---

# Execution Components

## Runtime

### Responsabilidade

Coordenar a execução de um Plan aprovado ou autorizado.

O Runtime transforma Tasks em ações concretas por meio de Skills e Tools.

### Pode utilizar

- Task Manager;
- Skill Registry;
- Tool Registry;
- Permission Service;
- Activity Service;
- Context Service;
- mecanismos de cancelamento e recuperação.

### É utilizado por

- Planner;
- Cognitive Core;
- aplicações que acompanham execuções.

### Produz

- estados de execução;
- resultados;
- falhas estruturadas;
- progresso;
- solicitações de replanejamento;
- artefatos produzidos.

### Não é responsável por

- compreender a solicitação original;
- criar estratégias;
- redefinir objetivos;
- tomar decisões estratégicas;
- alterar Personas;
- persistir conhecimento sem passar pelo Memory Service.

### Localização

`packages/runtime`

---

## Task Manager

### Responsabilidade

Gerenciar o ciclo de vida de cada Task.

### Pode utilizar

- filas;
- estados de execução;
- dependências entre Tasks;
- mecanismos de timeout;
- mecanismos de retry;
- Activity Service.

### É utilizado por

- Runtime;
- interfaces de acompanhamento;
- mecanismos de recuperação.

### Estados mínimos esperados

- pending;
- ready;
- running;
- blocked;
- awaiting-approval;
- completed;
- failed;
- cancelled.

### Não é responsável por

- criar estratégias;
- escolher Skills por conta própria;
- redefinir o Plan;
- interpretar linguagem natural.

### Localização

`packages/runtime`

---

# Extension Components

## Skill Registry

### Responsabilidade

Manter o catálogo oficial de Skills disponíveis.

### Pode utilizar

- metadados das Skills;
- contratos de capacidades;
- regras de versão;
- mecanismos de descoberta;
- Permission Service.

### É utilizado por

- Planner;
- Runtime;
- Skill Builder;
- ferramentas administrativas.

### Deve permitir

- registrar;
- localizar;
- carregar;
- desativar;
- versionar;
- remover Skills;
- diferenciar Skills permanentes e temporárias.

### Não é responsável por

- decidir quando uma Skill deve ser usada;
- executar o plano completo;
- criar Skills;
- conversar com o usuário;
- armazenar memória da tarefa.

### Localização

`packages/skills`

---

## Skill Builder

### Responsabilidade

Criar, validar e preparar novas Skills.

Pode produzir Skills temporárias ou candidatas a Skills permanentes.

### Pode utilizar

- requisitos da tarefa;
- catálogo de Tools;
- modelos de Skill;
- políticas de segurança;
- ambiente de validação;
- Skill Registry;
- Model Gateway.

### É utilizado por

- Cognitive Core;
- Runtime;
- fluxo administrativo de criação de Skills.

### Processo mínimo esperado

1. compreender a capacidade necessária;
2. definir escopo;
3. selecionar Tools mínimas;
4. definir permissões;
5. gerar instruções especializadas;
6. validar contratos;
7. executar teste controlado;
8. registrar ou descartar.

### Não é responsável por

- alterar a arquitetura;
- criar módulos centrais;
- conceder permissões ilimitadas;
- promover automaticamente uma Skill temporária para permanente;
- persistir Skills sem validação.

### Localização

`packages/skills`

---

## Tool Registry

### Responsabilidade

Manter o catálogo de Tools disponíveis e fornecer acesso padronizado a elas.

### Pode utilizar

- contratos de Tool;
- metadados;
- políticas de permissão;
- mecanismos de descoberta;
- adaptadores externos.

### É utilizado por

- Runtime;
- Skills;
- Skill Builder;
- ferramentas administrativas.

### Deve permitir

- registrar;
- localizar;
- validar;
- ativar;
- desativar;
- versionar Tools.

### Não é responsável por

- executar estratégias;
- decidir qual Tool usar;
- interpretar objetivos;
- conter lógica de negócio;
- conceder permissões.

### Localização

`packages/tools`

---

## Model Gateway

### Responsabilidade

Fornecer uma interface padronizada para utilização de modelos de inteligência artificial.

Modelos são provedores substituíveis e não fazem parte da identidade do Atlas.

### Pode utilizar

- provedores locais;
- provedores externos autorizados;
- políticas de seleção;
- configuração;
- métricas de uso;
- mecanismos de fallback.

### É utilizado por

- Cognitive Core;
- Planner;
- Skill Builder;
- Skills autorizadas;
- Persona Service quando necessário.

### Não é responsável por

- definir a estratégia;
- escolher sozinho o objetivo;
- armazenar memória;
- representar uma Persona;
- executar Tools;
- decidir permissões.

### Localização

`packages/model-gateway`

---

# Support Components

## Memory Service

### Responsabilidade

Gerenciar todo conhecimento persistente da plataforma.

É a única autoridade para armazenamento e recuperação de memória permanente.

### Pode utilizar

- mecanismos de persistência;
- indexação;
- busca;
- políticas de retenção;
- classificação de memória;
- mecanismos de revisão e exclusão.

### É utilizado por

- Cognitive Core;
- Context Service;
- Persona Service;
- processos de aprendizado;
- interfaces de gerenciamento de memória.

### Deve gerenciar

- preferências;
- fatos persistentes;
- memória de projetos;
- memória episódica;
- histórico relevante;
- relações entre informações.

### Não é responsável por

- decidir estratégias;
- armazenar todo Log indefinidamente;
- controlar o fluxo cognitivo;
- alterar informações sem rastreabilidade;
- considerar toda conversa como memória permanente.

### Localização

`packages/memory`

---

## Context Service

### Responsabilidade

Construir e fornecer uma representação atualizada do estado temporário da sessão e do ambiente.

### Pode utilizar

- sessão atual;
- estado da aplicação;
- projeto ativo;
- arquivos selecionados;
- ambiente operacional;
- informações temporárias autorizadas;
- Memory Service quando necessário.

### É utilizado por

- Cognitive Core;
- Planner;
- Runtime;
- Persona Service;
- aplicações clientes.

### Não é responsável por

- armazenar conhecimento permanente;
- decidir estratégias;
- executar ações;
- manter histórico completo;
- substituir o Memory Service.

### Localização

`packages/context`

---

## Activity Service

### Responsabilidade

Registrar, organizar e disponibilizar a atividade observável do Atlas.

### Pode utilizar

- eventos;
- logs estruturados;
- estados de Tasks;
- metadados de execução;
- trilhas de auditoria.

### É utilizado por

- todos os componentes que produzem eventos relevantes;
- interfaces de timeline;
- ferramentas de diagnóstico;
- auditorias.

### Deve oferecer

- visão executiva;
- visão técnica;
- filtros;
- correlação por execução;
- reconstrução linear da atividade;
- registro de erros;
- identificação de Skills e Tools utilizadas.

### Não é responsável por

- controlar a execução;
- decidir o que deve ser feito;
- armazenar raciocínio privado de modelos;
- substituir o Memory Service;
- alterar resultados.

### Localização

`packages/activity`

---

## Permission Service

### Responsabilidade

Avaliar se uma ação pode ser executada de acordo com permissões, políticas e nível de risco.

### Pode utilizar

- identidade do usuário;
- políticas configuradas;
- classificação de risco;
- escopo da Task;
- Tool solicitada;
- histórico de autorização aplicável.

### É utilizado por

- Cognitive Core;
- Planner;
- Runtime;
- Tool Registry;
- Skill Builder.

### Deve distinguir, no mínimo

- ações livres;
- ações permitidas por política;
- ações que exigem confirmação;
- ações bloqueadas.

### Não é responsável por

- executar ações;
- escolher estratégias;
- modificar políticas silenciosamente;
- presumir consentimento para ações destrutivas.

### Localização

`packages/permissions`

---

# Interaction Components

## Persona Service

### Responsabilidade

Aplicar a identidade selecionada à interação com o usuário.

### Pode utilizar

- configuração da Persona;
- contexto comunicacional;
- preferências do usuário;
- estado emocional simulado;
- Model Gateway;
- recursos de voz quando disponíveis.

### É utilizado por

- Input Gateway;
- Output Gateway;
- Cognitive Core;
- aplicações clientes.

### Deve controlar

- nome;
- tom;
- formalidade;
- idioma;
- estilo;
- voz;
- emoção simulada;
- comportamento comunicacional.

### Não é responsável por

- decidir estratégias técnicas;
- criar Plans;
- executar Tasks;
- selecionar Tools;
- alterar a arquitetura;
- modificar capacidades disponíveis.

### Localização

`packages/persona`

---

## Input Gateway

### Responsabilidade

Receber entradas do usuário e convertê-las para um formato comum consumido pelo Atlas.

### Pode receber

- texto;
- voz;
- atalhos;
- comandos da interface;
- eventos originados por aplicações autorizadas.

### É utilizado por

- aplicações desktop;
- futuras aplicações móveis;
- CLI;
- integrações autorizadas.

### Não é responsável por

- interpretar estrategicamente a intenção;
- planejar;
- executar;
- persistir memória diretamente;
- representar toda a Persona.

### Localização

Aplicação cliente correspondente, como `atlas-desktop`.

---

## Output Gateway

### Responsabilidade

Entregar ao usuário respostas, atualizações de progresso, solicitações de confirmação e resultados.

### Pode apresentar

- texto;
- voz;
- notificações;
- progresso;
- artefatos;
- erros;
- confirmações;
- timeline resumida.

### É utilizado por

- Persona Service;
- Runtime;
- Activity Service;
- aplicações clientes.

### Não é responsável por

- criar o conteúdo estratégico da resposta;
- executar Tasks;
- decidir prioridades;
- armazenar memória.

### Localização

Aplicação cliente correspondente, como `atlas-desktop`.

---

# Relações Principais

## Fluxo cognitivo principal

```text
Input Gateway
      │
      ▼
Persona Service
      │
      ▼
Cognitive Core
      │
      ▼
Planner
      │
      ▼
Runtime
      │
      ▼
Task Manager
      │
      ├── Skill Registry
      │
      └── Tool Registry
      │
      ▼
Resultado
      │
      ▼
Persona Service
      │
      ▼
Output Gateway
```

---

## Serviços de suporte

```text
Cognitive Core ─┬─ Memory Service
                ├─ Context Service
                ├─ Permission Service
                └─ Activity Service

Planner ────────┬─ Context Service
                ├─ Permission Service
                ├─ Skill Registry
                └─ Tool Registry

Runtime ────────┬─ Permission Service
                ├─ Activity Service
                ├─ Skill Registry
                ├─ Tool Registry
                └─ Task Manager
```

---

# Matriz de Autoridade

| Decisão ou ação             | Autoridade exclusiva     |
| --------------------------- | ------------------------ |
| Estratégia de alto nível    | Cognitive Core           |
| Criação de Plan             | Planner                  |
| Coordenação de execução     | Runtime                  |
| Estado das Tasks            | Task Manager             |
| Persistência de memória     | Memory Service           |
| Estado temporário           | Context Service          |
| Registro de atividade       | Activity Service         |
| Identidade comunicacional   | Persona Service          |
| Avaliação de permissão      | Permission Service       |
| Catálogo de Skills          | Skill Registry           |
| Criação de Skills           | Skill Builder            |
| Catálogo de Tools           | Tool Registry            |
| Acesso a modelos            | Model Gateway            |
| Inicialização da plataforma | Core e Lifecycle Manager |

Nenhum componente deve assumir autoridade atribuída exclusivamente a outro.

---

# Regras de Dependência

As dependências devem seguir estas regras:

1. Aplicações podem depender dos packages da plataforma (`packages/*`).
2. Os packages da plataforma não podem depender de aplicações.
3. Tools não podem depender do Cognitive Core.
4. Skills não podem conversar diretamente com o usuário.
5. Persona Service não pode executar Tools.
6. Planner não pode executar Tasks.
7. Runtime não pode redefinir objetivos estratégicos.
8. Serviços de suporte não podem controlar o fluxo cognitivo.
9. Componentes devem depender de contratos, não de implementações concretas.
10. Dependências circulares são proibidas.

---

# Componentes que não devem ser criados sem revisão arquitetural

Os seguintes tipos de componentes exigem avaliação formal:

- novo componente de tomada de decisão;
- novo armazenamento de memória;
- novo orquestrador;
- segundo Runtime;
- componente que permita acesso direto de Skills ao usuário;
- componente que conceda permissões fora do Permission Service;
- serviço que duplique responsabilidades existentes;
- acesso alternativo a modelos que ignore o Model Gateway;
- sistema paralelo de Logs.

---

# Componentes futuros previstos

Os componentes abaixo são considerados possibilidades futuras, não partes obrigatórias da arquitetura atual:

- Voice Service;
- Vision Service;
- Browser Automation Adapter;
- Desktop Control Adapter;
- Mobile Sync Service;
- Scheduler;
- Notification Service;
- Device Registry;
- Remote Execution Service;
- Home Automation Gateway.

A inclusão de qualquer um desses componentes deverá seguir o Architecture Decision Process.

---

# Critério de Conclusão

Este catálogo será considerado válido enquanto:

- representar todos os componentes arquiteturais oficiais;
- não possuir sobreposição significativa de responsabilidades;
- refletir a System Architecture;
- permitir identificar a autoridade de cada componente;
- oferecer uma referência clara para as especificações dos módulos.

Sempre que um componente for criado, removido ou tiver sua responsabilidade alterada, este documento deverá ser atualizado.

---

# Regra Final

Antes de implementar uma funcionalidade, deve-se responder:

1. Qual requisito do produto ela atende?
2. Qual componente deste catálogo é responsável por ela?
3. Quais contratos serão utilizados?
4. Quais componentes podem ser afetados?
5. A mudança respeita os limites de autoridade?

Se a funcionalidade não possuir um responsável claro neste catálogo, sua implementação não deverá começar antes de uma revisão arquitetural.
