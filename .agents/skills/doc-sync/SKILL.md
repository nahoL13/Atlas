---
name: doc-sync
description: Use when a SPEC in Project Atlas is being closed (validator verdict "pronta" → Review → Done, or right after the lessons-learned entry) — synchronizes the living-state docs (PLATFORM_STATE.md, root CLAUDE.md summary, package CLAUDE.mds, NEXT_CONTEXT.md, CURRENT_SPRINT.md) with what was actually delivered. Trigger phrases include "sincroniza a documentação", "atualiza o estado", "fecha a SPEC-XXXX".
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

Ao fechar uma SPEC — depois do veredicto "pronta" do `spec-validator` e da
transição `Review → Done` aplicada pelo fio principal (fluxo da Emenda v1.1
da Constituição), tipicamente logo após a entrada de Lições Aprendidas
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

1. **`docs/05-context/PLATFORM_STATE.md`** (desde 2026-07-20 é aqui que
   vive o estado detalhado — não mais no `CLAUDE.md` raiz): acrescente a
   entrega da SPEC ao texto corrido, seguindo o padrão das entregas
   anteriores (o que existe, qual package, qual API, qual config/flag).
   No **`CLAUDE.md` raiz**, toque o resumo "Estado em `<mês/ano>`" **só se**
   a SPEC criou package/app/comando novo ou mudou uma linha do resumo —
   o resumo é um índice de ~15 linhas, não cresce a cada SPEC. Atualize
   também a seção "Referenciado na documentação, mas ainda não criado":
   remova itens que passaram a existir com esta SPEC.

2. **`CLAUDE.md` dos packages tocados**: cada package tem o seu; descreva a
   API nova ou alterada do ponto de vista de quem vai consumi-la.

   **Escreva estado atual, não changelog.** Um `CLAUDE.md` de package é um guia
   de "como isto funciona hoje e que regras valem", organizado **por assunto**.
   Não acrescente uma seção nova por SPEC — integre a mudança na seção do
   assunto que ela toca, e **remova o que ela tornou obsoleto**. Foi a
   acumulação de uma seção por SPEC que fez `apps/desktop/CLAUDE.md` chegar a
   49 KB, maior que o `CLAUDE.md` da raiz. Esses arquivos entram no contexto
   automaticamente quando um agente toca o diretório: mantenha abaixo de ~15 KB.

3. **`docs/05-context/NEXT_CONTEXT.md`** — **teto de ~8 KB, respeite-o.**
   Este arquivo é relido no arranque de toda sessão e de todo subagent; deixá-lo
   crescer é o que dominou o custo em tokens do pipeline até 2026-07-30.
   - "Estado Imediato" mantém **no máximo as 3 últimas SPECs**, em **2–4 linhas
     cada** — o que mudou e o que isso habilita, não a narrativa do gate nem a
     lista de achados. Ao adicionar a nova no topo, **remova a quarta**: o
     detalhe já vive na SPEC e no `PLATFORM_STATE.md`.
   - Atualize "Próximo Trabalho" **removendo** os candidatos que esta SPEC
     entregou, em vez de riscá-los com `~~texto~~`. O acumulado de itens
     riscados é peso morto.
   - Nunca acrescente recapitulação histórica ("a fundação, a SPEC-X, a
     SPEC-Y… estão entregues"). Esse é o papel do `PLATFORM_STATE.md`.
   - Atualize o campo "Atualizado em" no cabeçalho.
   - Se o arquivo passar de ~8 KB depois da sua edição, **pode mais** antes de
     seguir. O histórico congelado está em `NEXT_CONTEXT-ARCHIVE.md`, que
     **não** recebe conteúdo novo.

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

## Commit e push de fechamento (parte do fluxo)

Depois que o doc-sync está completo e a verificação final está limpa,
**commite e faça push** — não deixe como passo separado que exige nova
aprovação humana (o usuário confirmou essa preferência no fechamento da
SPEC-0018). Um único commit cobre a implementação + a SPEC (Status `Done`)
+ a entrada de `LESSONS_LEARNED.md` + toda a sincronização de docs vivas.

```bash
git add <lista-explícita-de-arquivos-da-SPEC>
git diff --cached --name-only
git commit -m "<tipo>(<escopo>): SPEC-XXXX <resumo>

<corpo em PT-BR: o que mudou, escopo, gate do Roadmap fechado, contagem de testes>

Co-Authored-By: <modelo em uso>"
git push
```

- Substitua `<lista-explícita-de-arquivos-da-SPEC>` pelos arquivos da
  implementação, SPEC, lições e documentação desta SPEC; nunca use `git add -A`.
  Confirme que `git diff --cached --name-only` contém somente esse escopo antes
  do commit.
- Mensagem em **PT-BR**, seguindo o padrão dos commits do repo
  (`feat(cli): SPEC-XXXX ...`, `docs(spec): SPEC-XXXX ...`).
- Trailer `Co-Authored-By` obrigatório, com o modelo em uso.
- O repo é **single-branch `main`** com remote privado (`origin`); commite
  em `main` e dê `push` para `origin/main`.
- Push publica todo o histórico num serviço externo — se por algum motivo o
  push falhar ou o remote estiver indisponível, reporte e não trave o
  fechamento (o commit local já preserva o trabalho).

## O que esta skill NÃO cobre

- `LESSONS_LEARNED.md` — é a skill `lessons-learned`.
- Mudar o `Status` da SPEC — o fio principal aplica a transição após o
  veredicto do `spec-validator`, antes de rodar esta skill.
- Criar/alterar ADRs novos ou o `ModuleCatalog.md` — decisão arquitetural,
  segue `docs/00-project/ArchitectureDecisionProcess.md`.
