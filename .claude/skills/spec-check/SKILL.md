---
name: spec-check
description: Use before editing any source file under packages/*/src, apps/*/src, or tooling/*/src in Project Atlas — verifies an approved SPEC covers the change before implementation starts. Also use when asked "posso implementar X?" or "existe SPEC para isso?".
---

# spec-check

Project Atlas proíbe implementação sem SPEC aprovada (Constituição de Arquitetura,
invariante #2: "Nenhuma implementação sem SPEC aprovada"). Esta skill aplica essa
regra antes de qualquer edição de código-fonte.

## Quando usar

Antes de criar ou editar arquivos em:

- `packages/*/src/**`
- `apps/*/src/**`
- `tooling/*/src/**`

Não se aplica a: edição de documentação (`docs/**`), configuração de tooling
(`eslint.config.js`, `tsconfig*.json`, `.claude/**`), ou leitura/exploração de código.

## Passos

1. **Identifique o módulo/package alvo** da mudança pedida pelo usuário (ex.:
   `packages/permissions`, `apps/cli`).

2. **Procure a SPEC correspondente** em `docs/implementation/specs/`:
   ```bash
   ls docs/implementation/specs/
   grep -ril "<nome do módulo ou funcionalidade>" docs/implementation/specs/
   ```
   Cheque também `docs/03-architecture/ModuleCatalog.md` para confirmar qual
   módulo é responsável pela responsabilidade em questão — a mudança pode
   pertencer a um módulo diferente do que parece à primeira vista.

3. **Leia o campo Status** da SPEC encontrada (seção "Status" no topo do
   documento, segue `docs/implementation/templates/SPEC-TEMPLATE.md`):
   - `Ready` ou `In Progress` → pode prosseguir. Releia também "Escopo" e
     "Fora do Escopo" da SPEC: implemente **somente** o que está listado em
     Escopo.
   - `Draft` → a SPEC ainda não foi aprovada. Pare e informe o usuário; não
     implemente a partir de um Draft sem confirmação explícita.
   - `Review` ou `Done` → a SPEC já foi fechada. Uma mudança nova aqui
     provavelmente precisa de uma SPEC própria — pare e pergunte.

4. **Se nenhuma SPEC cobre a mudança pedida**: pare antes de escrever
   qualquer código. Diga ao usuário explicitamente que não há SPEC
   aprovada para o que foi pedido e ofereça duas saídas:
   - criar uma nova SPEC primeiro (use `docs/implementation/templates/SPEC-TEMPLATE.md`
     como estrutura, seguindo `docs/04-engineering/DevelopmentGuide.md`), ou
   - se o usuário confirmar explicitamente que quer pular o processo desta
     vez, registre isso como exceção pontual — não como novo padrão.

   Não decida sozinho por interpretar o pedido como "pequeno demais para
   precisar de SPEC". A Constituição não abre essa exceção.

5. **Verifique pré-requisitos**: a seção "Pré-requisitos" da SPEC lista
   SPECs anteriores que precisam estar concluídas. Confirme rapidamente
   (grep pelo status delas) antes de prosseguir.

6. **Delegue, não implemente aqui.** Depois de confirmar SPEC + status +
   escopo, não escreva o código diretamente no fio principal: invoque o
   Agent tool com `subagent_type: spec-implementer` (definido em
   `.claude/agents/spec-implementer.md`) e passe o ID da SPEC. Isso isola a
   exploração/erros de lint no contexto do subagent (economiza tokens do
   fio principal) e mantém `docs/05-context/TOKEN_USAGE_LOG.md` preciso por
   fase. Só implemente diretamente aqui se o usuário pedir explicitamente
   para não delegar.

   **Importante — o subagent começa com contexto zerado:** a SPEC é o único
   canal entre as fases. Se nesta conversa foram tomadas decisões relevantes
   que não estão no texto da SPEC (um detalhe acertado com o usuário, uma
   restrição descoberta durante a discussão), inclua-as explicitamente no
   prompt de delegação — o spec-implementer não tem como conhecê-las de
   outra forma.

7. **Depois que a implementação terminar**, antes de considerar a SPEC
   pronta para `Done`, invoque o Agent tool com `subagent_type:
   spec-validator` (`.claude/agents/spec-validator.md`) para conferir
   testes/lint/typecheck e os Critérios de Aceitação — pelo mesmo motivo:
   isolar contexto e manter o log por fase preciso.

## Notas

- Esta skill é um gate de processo, não um substituto para ler a SPEC
  inteira — depois de identificá-la, leia-a de fato antes de implementar
  (Checklist para IA da própria SPEC pede isso).
- Ao concluir a implementação, lembre o fluxo completo: testes → atualização
  de documentação → review → lições aprendidas (`lessons-learned` skill) →
  merge. Nenhuma etapa é pulada.
