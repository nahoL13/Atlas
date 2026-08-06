# Project Structure

> **Project Atlas — Monorepo Organization**

Version: 2.1
Status: Official

---

## Resumo

O Project Atlas é organizado como um **monorepo modular**.

Aplicações executáveis residem em `apps/`. Componentes reutilizáveis e módulos da plataforma residem em `packages/`. Documentação, especificações de implementação e procedimentos para IA possuem diretórios próprios.

Esta estrutura representa a organização física inicial do MVP. Os componentes permanecem conceitualmente separados, mas não precisam ser serviços independentes ou processos distribuídos.

---

# Objetivo

Este documento define a organização oficial do repositório do Project Atlas.

Seu objetivo é garantir que qualquer pessoa ou inteligência artificial consiga responder com clareza:

> Onde esta implementação deve ficar?

A estrutura do repositório deve refletir a arquitetura do sistema sem transformar cada responsabilidade conceitual em um serviço, processo ou repositório independente.

---

# Escopo

Este documento define:

- estrutura de diretórios do monorepo;
- localização das aplicações;
- localização dos módulos e serviços internos;
- organização dos contratos compartilhados;
- localização de documentação, SPECs e ferramentas;
- convenções para criação de novos packages.

Este documento não define:

- comportamento dos componentes;
- requisitos do produto;
- tecnologias internas de cada módulo;
- interfaces detalhadas;
- decisões arquiteturais;
- roadmap.

---

# Relação com outros documentos

Este documento deve ser interpretado em conjunto com:

- `PROJECT.md`;
- `CLAUDE.md`;
- `docs/03-architecture/SystemArchitecture.md`;
- `docs/03-architecture/ArchitecturePrinciples.md`;
- `docs/03-architecture/ModuleCatalog.md`;
- `docs/04-engineering/DevelopmentGuide.md`;
- ADR sobre adoção do monorepo;
- ADR sobre adoção de TypeScript e Node.js.

Em caso de divergência, decisões registradas em ADRs e documentos arquiteturais normativos devem ser consultadas antes de alterar esta estrutura.

---

# Decisão Estrutural

O Atlas será inicialmente desenvolvido como:

- um único repositório Git;
- um workspace gerenciado por `pnpm`;
- um monólito modular;
- múltiplas aplicações e packages no mesmo repositório;
- componentes internos separados por contratos e responsabilidades;
- uma única pipeline de documentação e implementação.

Monorepo não significa que todo o código pertence ao mesmo módulo.

Monólito modular não significa ausência de limites arquiteturais.

---

# Estrutura Geral

```text
atlas/
├── .agents/
│   ├── skills/
│   └── workflow/
│
├── .claude/
│   └── skills/
│
├── .codex/
│   └── agents/
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
│
├── apps/
│   ├── cli/
│   └── desktop/
│
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── cognitive/
│   ├── planner/
│   ├── runtime/
│   ├── memory/
│   ├── context/
│   ├── activity/
│   ├── permissions/
│   ├── persona/
│   ├── skills/
│   ├── tools/
│   ├── model-gateway/
│   └── shared/
│
├── docs/
│   └── implementation/
│       ├── templates/
│       └── specs/
│
├── tooling/
│
├── examples/
│
├── sandbox/
│
├── scripts/
│
├── CLAUDE.md
├── PROJECT.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

Nem todos os diretórios apresentados precisam existir desde a primeira SPEC.

Diretórios devem ser criados somente quando sua primeira implementação real for iniciada.

---

# Diretórios da Raiz

## `.agents/`, `.claude/` e `.codex/`

Esses três diretórios contêm exclusivamente automação de desenvolvimento; eles
não fazem parte do produto Atlas em execução e não contêm segredos.

- `.agents/` é a fonte canônica, neutra de provedor, do workflow e das skills
  dos agentes de desenvolvimento.
- `.claude/` é o adaptador gerado para Claude Code (agentes, skills e hooks).
- `.codex/` é o adaptador gerado para Codex (agentes, configuração e hooks);
  os relatórios e o cache/lock privados de telemetria são ignorados pelo Git.

As saídas geradas devem ser atualizadas por
`pnpm agent-workflow:generate` e verificadas por
`pnpm agent-workflow:check`; a verificação compara o conjunto exato e rejeita
também adapter extra/obsoleto. Alterações de comportamento começam em
`.agents/`. Ver `docs/04-engineering/ClaudeCodeAutomation.md` para a operação.

### Não devem conter

- código da aplicação;
- lógica do Core;
- prompts de Personas do produto;
- configurações secretas;
- implementações temporárias.

---

## `.github/`

Contém configurações específicas do GitHub.

Exemplos:

- workflows de integração contínua;
- templates de Issues e Pull Requests;
- validações automáticas;
- configurações de segurança;
- automações do repositório.

Regras que puderem ser aplicadas automaticamente devem preferencialmente ser implementadas por CI, lint, testes ou validação de tipos.

---

## `apps/`

Contém aplicações executáveis destinadas ao usuário ou ao desenvolvimento.

Aplicações consomem os recursos fornecidos pelos packages.

Elas não devem reimplementar lógica pertencente ao Core.

```text
apps/
├── cli/
└── desktop/
```

### `apps/cli/`

Primeira interface executável do Atlas.

Responsável por:

- receber comandos por terminal;
- inicializar a plataforma;
- exibir respostas;
- apresentar progresso;
- permitir testes integrados do Core.

A CLI será a primeira interface usada para validar o MVP.

### `apps/desktop/`

Aplicação desktop do Atlas.

Responsável por:

- interface gráfica;
- janela ou menu bar;
- entrada por texto;
- atualizações de progresso;
- notificações;
- integração visual com o sistema operacional;
- futura entrada e saída por voz.

A aplicação desktop não deve conter lógica cognitiva, regras de memória ou coordenação de Skills.

### Aplicações futuras

Novas aplicações podem ser adicionadas, como:

```text
apps/
├── mobile/
├── web/
└── daemon/
```

Elas somente devem ser criadas quando fizerem parte de uma SPEC aprovada.

---

## `packages/`

Contém todos os componentes reutilizáveis da plataforma.

Cada package representa uma responsabilidade técnica ou arquitetural claramente delimitada.

Os packages podem ser publicados ou privados. No MVP, todos podem permanecer privados dentro do workspace.

```text
packages/
├── contracts/
├── core/
├── cognitive/
├── planner/
├── runtime/
├── memory/
├── context/
├── activity/
├── permissions/
├── persona/
├── skills/
├── tools/
├── model-gateway/
└── shared/
```

A lista representa a arquitetura de destino. A criação física de cada package deve ocorrer incrementalmente.

Todos os packages adotam o escopo `@atlas/` (ex.: `@atlas/core`, `@atlas/contracts`).

Um componente conceitual pode residir temporariamente dentro de outro package — mantendo seu contrato e seus limites por convenção e lint — até que sua extração seja justificada por evidência: churn independente, um segundo consumidor ou violação recorrente de limites.

Consolidações aceitáveis durante o MVP:

- Planner dentro de `packages/cognitive/`;
- Context Service dentro de `packages/memory/`;
- Activity Service dentro de `packages/core/`.

`contracts/` e `model-gateway/` não devem ser consolidados: contratos compartilhados e o isolamento de SDKs de provedores de IA devem existir desde o primeiro uso.

---

# Packages Fundamentais

## `packages/contracts/`

Contém contratos compartilhados entre os componentes.

Exemplos:

- tipos públicos;
- interfaces;
- eventos;
- comandos;
- resultados;
- erros estruturados;
- identificadores;
- estruturas como `Plan`, `Task` e `ExecutionResult`.

Esse package deve conter contratos, não implementações.

Um contrato somente deve ser promovido para `contracts/` quando um segundo package precisar dele.

Até lá, o contrato deve permanecer no package responsável.

### Pode conter

```text
src/
├── commands/
├── events/
├── errors/
├── models/
└── interfaces/
```

### Não deve conter

- acesso a banco de dados;
- execução de Tools;
- lógica cognitiva;
- dependência de aplicações;
- implementação concreta de serviços.

---

## `packages/core/`

Contém a infraestrutura operacional principal da plataforma.

Responsável por:

- bootstrap;
- ciclo de vida;
- composição de dependências;
- configuração central;
- inicialização e encerramento;
- coordenação do processo da aplicação.

O Core é o **composition root** da plataforma: o único package autorizado a importar implementações dos demais packages, exclusivamente para compô-las (ver Regra de Dependência 11 e o ADR correspondente).

O Core não deve concentrar lógica pertencente aos demais componentes.

---

## `packages/cognitive/`

Contém o Cognitive Core.

Responsável por:

- compreender objetivos;
- interpretar intenção;
- classificar complexidade;
- escolher estratégias;
- identificar capacidades necessárias;
- solicitar planejamento.

É o componente de decisão estratégica da plataforma.

Não executa Tools diretamente.

---

## `packages/planner/`

Contém o Planner.

Responsável por transformar estratégias em planos executáveis.

Pode produzir:

- Plans;
- Tasks;
- dependências;
- etapas;
- critérios de sucesso;
- pontos de validação.

Não coordena a execução concreta.

---

## `packages/runtime/`

Contém o Runtime e o gerenciamento de Tasks.

Responsável por:

- executar Plans;
- coordenar Tasks;
- controlar estados;
- processar cancelamentos;
- tratar retries;
- coletar resultados;
- emitir progresso.

Não redefine o objetivo estratégico definido pelo Cognitive Core.

---

## `packages/memory/`

Contém o Memory Service.

Responsável por:

- persistência de memória;
- recuperação de conhecimento;
- preferências;
- memória de projetos;
- memória episódica;
- políticas de retenção;
- revisão e exclusão.

É a única autoridade para conhecimento persistente do usuário.

---

## `packages/context/`

Contém o Context Service.

Responsável por produzir o contexto temporário usado durante uma interação ou execução.

Pode incluir:

- sessão atual;
- diretório ativo;
- repositório atual;
- branch;
- arquivos selecionados;
- estado da aplicação;
- informações temporárias do ambiente.

Contexto temporário não deve ser tratado automaticamente como memória permanente.

---

## `packages/activity/`

Contém o Activity Service.

Responsável por:

- logs estruturados;
- timeline;
- eventos de execução;
- auditoria;
- histórico operacional;
- correlação por execução;
- observabilidade.

Não deve armazenar raciocínio privado de modelos.

---

## `packages/permissions/`

Contém as políticas de permissão e avaliação de risco.

Responsável por classificar ações como:

- permitidas;
- permitidas por política;
- dependentes de confirmação;
- bloqueadas.

Toda execução sensível deve passar pelos contratos desse package.

---

## `packages/persona/`

Contém o Persona Service e as estruturas relacionadas às Personas.

Responsável por:

- tom;
- nome;
- estilo;
- idioma;
- formalidade;
- emoção simulada;
- regras de comunicação;
- configuração da Persona ativa.

Jarvis será uma configuração de Persona, não um novo Core.

---

## `packages/skills/`

Contém a infraestrutura de Skills do produto.

Pode incluir:

- contratos de Skill;
- Skill Registry;
- carregamento;
- validação;
- versionamento;
- ciclo de vida de Skills temporárias;
- futura implementação do Skill Builder.

Não deve ser confundido com `.agents/skills/`, fonte canônica das Skills de
desenvolvimento (renderizada também em `.claude/skills/`).

```text
.agents/skills/
```

define procedimentos usados por agentes durante o desenvolvimento.

```text
packages/skills/
```

implementa Skills utilizadas pelo Atlas durante sua própria execução.

---

## `packages/tools/`

Contém a infraestrutura e os adaptadores de Tools utilizados pelo Atlas.

Exemplos futuros:

```text
packages/tools/
├── terminal/
├── filesystem/
├── git/
├── claude-code/
└── browser/
```

Uma Tool deve:

- implementar um contrato padronizado;
- declarar permissões;
- validar entradas;
- produzir resultados estruturados;
- registrar sua atividade.

Uma Tool não deve decidir quando ela própria será usada.

---

## `packages/model-gateway/`

Contém a abstração de acesso a modelos de inteligência artificial.

Responsável por:

- padronizar requisições;
- normalizar respostas;
- selecionar provedores autorizados;
- suportar modelos locais ou externos;
- aplicar timeouts e fallback;
- coletar métricas técnicas.

O restante do Core não deve depender diretamente de SDKs específicos de provedores.

---

## `packages/shared/`

Contém código verdadeiramente genérico e reutilizável que não pertence a um domínio específico.

Exemplos aceitáveis:

- utilitários de tempo;
- IDs;
- resultados genéricos;
- validações primitivas;
- helpers sem conhecimento do domínio.

`shared` não deve se tornar um depósito para código sem localização definida.

Quando um código possuir significado de domínio, deve permanecer no package responsável.

---

# Organização Interna de um Package

A estrutura interna deve permanecer simples e proporcional à necessidade real.

Estrutura inicial recomendada:

```text
packages/runtime/
├── src/
│   ├── index.ts
│   ├── runtime.ts
│   ├── task-manager.ts
│   ├── errors.ts
│   └── types.ts
│
├── tests/
│   ├── runtime.test.ts
│   └── task-manager.test.ts
│
├── CLAUDE.md
├── README.md
├── package.json
└── tsconfig.json
```

Nem todo package precisa possuir todos esses arquivos.

A estrutura deve crescer conforme a complexidade comprovada, e não por antecipação.

---

# Código Próximo ao Domínio

Interfaces, testes e tipos específicos devem permanecer próximos ao componente ao qual pertencem.

Por exemplo:

```text
packages/memory/src/memory-service.ts
packages/memory/src/memory-entry.ts
packages/memory/tests/memory-service.test.ts
```

Eles não devem ser movidos para pastas globais apenas por serem interfaces, modelos ou testes.

Somente contratos realmente compartilhados entre packages devem residir em `packages/contracts/`.

---

# Estratégia de Testes

Os testes unitários devem preferencialmente ficar próximos ao package correspondente.

```text
packages/runtime/tests/
packages/memory/tests/
apps/cli/tests/
```

Testes que atravessam múltiplos componentes podem residir em:

```text
tests/
├── integration/
├── architecture/
└── end-to-end/
```

O diretório global `tests/` deve ser criado somente quando existirem testes que não pertençam naturalmente a um único package.

### Tipos de testes esperados

- testes unitários por package;
- testes de integração entre packages;
- testes arquiteturais;
- testes de contratos;
- testes end-to-end das aplicações.

---

# `docs/`

Contém a documentação normativa do projeto.

Sua organização oficial é definida no `PROJECT.md`.

Este documento não duplica a árvore completa de documentação para evitar divergência entre fontes.

A documentação deve priorizar:

- intenção;
- requisitos;
- decisões;
- invariantes;
- limites;
- aprendizados relevantes.

Inventários que possam ser derivados automaticamente do código não devem ser mantidos manualmente.

---

# `docs/implementation/`

Contém as Implementation Specifications que orientam o desenvolvimento incremental.

```text
docs/implementation/
├── templates/
│   └── SPEC-TEMPLATE.md
│
├── plans/
│   └── PLAN-0001-workspace-bootstrap.md
│
└── specs/
    ├── SPEC-0001-workspace-bootstrap.md
    ├── SPEC-0002-core-bootstrap.md
    └── SPEC-0003-cli-foundation.md
```

Cada SPEC pode possuir um plano de implementação correspondente em `docs/implementation/plans/`, com a mesma numeração.

Uma SPEC descreve uma entrega implementável.

Ela não substitui requisitos, ADRs ou documentação arquitetural.

Implementações concluídas podem permanecer arquivadas para rastreabilidade.

---

# `tooling/`

Contém configurações e packages internos utilizados para manter o monorepo.

Exemplos:

- configurações compartilhadas de TypeScript;
- configuração de lint;
- configuração de testes;
- validação de SPECs;
- testes arquiteturais;
- scripts de geração;
- utilitários de CI.

Esse diretório não representa Tools utilizadas pelo Atlas em runtime.

Para evitar confusão:

```text
tooling/
```

é infraestrutura de desenvolvimento.

```text
packages/tools/
```

é parte funcional da plataforma Atlas.

---

# `scripts/`

Contém scripts pequenos e operacionais do repositório.

Exemplos:

- bootstrap local;
- limpeza;
- validações;
- migrações de documentação;
- execução de tarefas administrativas.

Caso um script cresça e passe a possuir testes, dependências ou domínio próprio, ele deve ser promovido para `tooling/`.

---

# `examples/`

Contém exemplos de uso público ou interno do Core.

Exemplos não são implementações oficiais e não devem ser importados por código de produção.

---

# `sandbox/`

Contém provas de conceito e experimentos descartáveis.

Exemplos:

- testes de provedores de IA;
- experimentos com voz;
- automação do macOS;
- comparação de bibliotecas;
- protótipos de Tauri.

Código do `sandbox/` não pode ser importado por aplicações ou packages de produção.

A promoção de um experimento exige uma SPEC e a reimplementação adequada no componente responsável.

---

# Arquivos da Raiz

## `CLAUDE.md`

Roteador operacional para o Claude Code.

Contém:

- contexto mínimo;
- invariantes essenciais;
- comandos principais;
- regras inegociáveis;
- gatilhos para leitura sob demanda da documentação.

Deve permanecer curto.

---

## `PROJECT.md`

Porta de entrada humana do projeto.

Apresenta o Atlas, a documentação, o processo de engenharia e o estado geral do projeto.

---

## `package.json`

Define comandos globais do monorepo.

Exemplos futuros:

```text
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm dev
```

---

## `pnpm-workspace.yaml`

Declara os projetos participantes do workspace.

Exemplo conceitual:

```yaml
packages:
  - apps/*
  - packages/*
  - tooling/*
  - examples/*
```

---

## `tsconfig.base.json`

Contém a configuração TypeScript compartilhada.

Packages e aplicações podem estendê-la sem duplicar regras comuns.

---

# Regras de Dependência

A estrutura do monorepo deve respeitar as seguintes regras:

1. `apps/*` pode depender de `packages/*`.
2. `packages/*` não pode depender de `apps/*`.
3. Packages devem depender de contratos públicos, não de detalhes internos.
4. Dependências circulares são proibidas.
5. Tools não podem depender do Cognitive Core.
6. Persona não pode executar Tools diretamente.
7. Planner não pode coordenar execução.
8. Runtime não pode redefinir decisões estratégicas.
9. Packages não podem importar código de `sandbox/` ou `examples/`.
10. Dependências entre packages devem ser explicitadas em seus respectivos `package.json`.
11. `packages/core/` é o composition root: é o único package autorizado a depender de implementações dos demais packages, exclusivamente para composição. Aplicações consomem a composição oferecida pelo Core e permanecem finas.

Sempre que possível, essas regras devem ser aplicadas por lint, testes arquiteturais ou validação do workspace.

A aplicação deve ser mecânica:

- a importação entre packages ocorre exclusivamente pelo nome `@atlas/*` declarado no `package.json` — sem path aliases de TypeScript entre packages, para que dependências não declaradas simplesmente não resolvam;
- as regras semânticas (5 a 9, e a exceção da regra 11) devem ser validadas por análise de dependências (ex.: dependency-cruiser) mantida em `tooling/` e executada como teste arquitetural.

---

# Regras para Criação de um Novo Package

Um novo package somente deve ser criado quando:

- representar uma responsabilidade independente;
- possuir um contrato claro;
- precisar ser reutilizado por mais de uma aplicação ou package;
- reduzir acoplamento;
- estiver previsto na arquitetura ou autorizado por ADR;
- fizer parte de uma SPEC aprovada.

Um novo package não deve ser criado apenas para organizar poucos arquivos.

Durante o MVP, simplicidade física deve ser priorizada.

---

# Regras para CLAUDE.md Aninhado

Subdiretórios relevantes podem possuir um `CLAUDE.md` próprio.

Esse arquivo deve conter somente informações locais que não possam ser inferidas facilmente do código.

Exemplos:

- invariantes do package;
- limites de responsabilidade;
- comandos específicos;
- decisões não óbvias;
- documentos obrigatórios antes de modificá-lo.

Não deve conter inventários extensos de arquivos ou APIs.

---

# O Que Evitar

Não criar diretórios genéricos ou ambíguos como:

- `misc`;
- `temp`;
- `old`;
- `new`;
- `backup`;
- `common`;
- `helpers`;
- `utils`, quando o conteúdo possuir domínio próprio;
- `services` na raiz;
- `modules` na raiz;
- `interfaces` na raiz;
- `models` na raiz.

Esses nomes tendem a esconder responsabilidades.

Um arquivo deve permanecer próximo ao domínio que o utiliza.

---

# Crescimento Incremental

A árvore apresentada neste documento representa a direção oficial do monorepo, não uma obrigação de criar todos os diretórios imediatamente.

No início do MVP, a estrutura poderá ser semelhante a:

```text
atlas/
├── .claude/
├── apps/
│   └── cli/
├── packages/
│   ├── contracts/
│   └── core/
├── docs/
│   └── implementation/
├── CLAUDE.md
├── PROJECT.md
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Novos packages serão adicionados conforme as SPECs exigirem.

Não devem ser criados packages vazios apenas para reproduzir antecipadamente toda a arquitetura conceitual.

---

# Evolução Futura

O monorepo poderá acomodar futuramente:

```text
apps/
├── mobile/
├── web/
└── daemon/

packages/
├── voice/
├── vision/
├── scheduler/
├── notifications/
└── device-registry/
```

Esses componentes não fazem parte do MVP e não devem ser criados sem documentação e SPEC correspondentes.

A separação para múltiplos repositórios somente deverá ser considerada quando surgirem necessidades concretas, como:

- ciclos de release independentes;
- equipes separadas;
- permissões diferentes;
- distribuição pública independente;
- problemas reais de escala do repositório.

---

# Critérios de Validação

A estrutura estará sendo respeitada quando:

- cada implementação possuir localização evidente;
- aplicações não concentrarem lógica do Core;
- packages tiverem responsabilidades claras;
- contratos compartilhados estiverem separados das implementações;
- testes estiverem próximos dos componentes;
- dependências circulares forem impedidas;
- nenhuma categoria paralela competir com `packages/`;
- a criação de diretórios ocorrer de forma incremental.

---

# Regra Final

Antes de criar um arquivo ou diretório, deve-se responder:

1. Qual componente é responsável por este código?
2. Ele pertence a uma aplicação ou a um package?
3. O código é específico de um domínio ou realmente compartilhado?
4. A estrutura já possui um local adequado?
5. A criação de um novo package está prevista por uma SPEC?

Se essas perguntas não produzirem uma resposta clara, a implementação deve ser interrompida até que a responsabilidade seja definida.
