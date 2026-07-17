---
name: doc-sync
description: Use when a SPEC in Project Atlas is being closed (human approved Review → Done, or right after the lessons-learned entry) — synchronizes the living-state docs (root CLAUDE.md, package CLAUDE.mds, NEXT_CONTEXT.md, CURRENT_SPRINT.md) with what was actually delivered. Trigger phrases include "sincroniza a documentação", "atualiza o estado", "fecha a SPEC-XXXX".
---

# doc-sync

Toda SPEC concluída exige atualizar os documentos de **estado vivo** do
projeto — é parte do Escopo de cada SPEC (seção "Documentação") e da
Definition of Done. Esquecer um deles quebra a invariante #1 da Constituição
("a documentação é a fonte oficial da verdade") e degrada o `NEXT_CONTEXT.md`
como ponto de retomada. Esta skill é o checklist estrutural dessa
sincronização: cada item abaixo é um slot obrigatório — marque um a um, na
ordem.

## Quando usar

Ao fechar uma SPEC — depois que o humano aprovou `Review → Done` (ou junto
desse fechamento), tipicamente logo após a entrada de Lições Aprendidas
(skill `lessons-learned`). As duas skills são complementares e ambas rodam
no fechamento: `lessons-learned` cuida do registro histórico,
`doc-sync` cuida do estado vivo.

## Antes de tocar qualquer documento

Reconstrua o que foi **de fato** entregue, não o que a SPEC prometia:

- `git log` / `git diff` da implementação — quais packages foram tocados,
  quais APIs novas/mudadas existem.
- A seção "Escopo → Documentação" da própria SPEC lista os documentos
  prometidos; nenhum é opcional.
- O relatório final do `spec-implementer` lista os atritos e desvios — se a
  lista de arquivos real divergiu da esperada, o estado vivo descreve a real.

## Checklist obrigatório (um commit pode cobrir tudo)

1. **`CLAUDE.md` raiz — parágrafo "Estado em `<mês/ano>`"**: acrescente a
   entrega da SPEC ao resumo corrido, seguindo o padrão das entregas
   anteriores (o que existe, qual package, qual API, qual config/flag).
   Atualize também a seção "Referenciado na documentação, mas ainda não
   criado": remova itens que passaram a existir com esta SPEC.

2. **`CLAUDE.md` dos packages tocados**: cada package tem o seu; descreva a
   API nova ou alterada do ponto de vista de quem vai consumi-la.

3. **`docs/05-context/NEXT_CONTEXT.md`**: nova entrada no **topo** de
   "Estado Imediato", no padrão das existentes — Status com data de
   aprovação humana, o que foi entregue (packages, APIs, configs, CLI),
   o que ficou documentado como fora de escopo. Atualize o campo
   "Atualizado em" no cabeçalho.

4. **`docs/05-context/CURRENT_SPRINT.md`**: linha da SPEC na tabela com o
   Status novo (adicione a linha se a SPEC ainda não está lá). Atualize
   "Atualizado em".

5. **ADRs afetados**: se a SPEC previa nota de atualização em um ADR
   existente (ex.: SPEC-0012 → nota no ADR-0013), confirme que a nota
   existe e linka a SPEC.

## Verificação final

Procure menções desatualizadas antes de considerar a sincronização feita:

```bash
grep -rn "SPEC-XXXX" CLAUDE.md docs/05-context/ packages/*/CLAUDE.md
```

Cada ocorrência deve refletir o status/estado novo. Datas sempre em
`AAAA-MM-DD`, com a data de hoje.

## O que esta skill NÃO cobre

- `LESSONS_LEARNED.md` — é a skill `lessons-learned`.
- Mudar o `Status` da SPEC — decisão humana, nunca automática.
- Criar/alterar ADRs novos ou o `ModuleCatalog.md` — decisão arquitetural,
  segue `docs/00-project/ArchitectureDecisionProcess.md`.
