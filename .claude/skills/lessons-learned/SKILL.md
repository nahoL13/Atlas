---
name: lessons-learned
description: Use when a SPEC in Project Atlas is being closed/concluded (Definition of Done reached) — drafts a Lessons Learned entry in docs/implementation/LESSONS_LEARNED.md following the project's mandatory format. Trigger phrases include "concluir a SPEC", "fechar a SPEC-XXXX", "registrar lições aprendidas".
---

# lessons-learned

Registrar lições aprendidas é obrigatório ao concluir uma SPEC — é parte
explícita da Definition of Done (CLAUDE.md e do próprio
`docs/implementation/templates/SPEC-TEMPLATE.md`). Esta skill produz a
entrada no formato exigido por `docs/implementation/LESSONS_LEARNED.md`,
a partir do trabalho real realizado na sessão.

## Quando usar

Ao final de uma SPEC — depois que testes passam, critérios de aceitação
estão atendidos e a documentação da própria SPEC foi atualizada, mas antes
de marcar a SPEC como `Done`.

## Passos

1. **Leia as regras de uso** em `docs/implementation/LESSONS_LEARNED.md`
   (seção "Regras de Uso") antes de escrever — elas mudam o que conta como
   lição:
   - Lições são **fatos observados**, não opiniões.
   - Novas entradas vão **no topo do Registro**; nunca reescreva entradas
     antigas.
   - **Rotação obrigatória (2026-07-30):** o Registro vivo mantém as
     **últimas 5 SPECs**. Depois de escrever a entrada nova no topo, **mova a
     6ª (a mais antiga do vivo) para o fim da seção "Registro — Arquivo" em
     `docs/implementation/LESSONS_LEARNED-ARCHIVE.md`**, recortada e colada sem
     nenhuma edição (a regra "nunca reescreva entradas antigas" continua
     intacta — o texto é realocado, não alterado). O arquivo vivo é relido no
     arranque de quase todo subagent; sem a rotação ele volta a dominar o custo
     em tokens do pipeline.
   - Se a lição que você registrou repete um padrão já visto em 3+ SPECs,
     acrescente ou atualize a linha correspondente na seção **"Padrões
     Recorrentes"** do topo do arquivo vivo — é ela que sobrevive à rotação.
   - Todo item em "Precisamos mudar" precisa de um encaminhamento concreto:
     um ADR novo/atualizado em `docs/06-adr/`, uma atualização de
     documentação, ou uma nova SPEC. Nada pode ficar solto.

2. **Reconstrua o que aconteceu de fato** na implementação (não o que o
   plano previa):
   - `git log` / `git diff` da SPEC para ver o que realmente mudou.
   - Onde a arquitetura existente absorveu a mudança sem atrito (ex.: um
     limite que provou ser genérico o bastante).
   - Onde houve atrito real: comandos que não existiam, campos obrigatórios
     que exigiram tocar múltiplos chamadores, suposições do plano que não
     bateram com a execução.
   - Compare com entradas anteriores no arquivo — atritos repetidos (ex.:
     "campo obrigatório novo exige atualizar todos os chamadores na mesma
     task") devem ser citados como recorrência, não redescobertos do zero.

3. **Preencha o template exato** (não desvie da estrutura):
   ```text
   ## SPEC-XXXX — Título (AAAA-MM-DD)

   **Descobrimos que...**

   **A arquitetura ajudou porque...**

   **A arquitetura atrapalhou porque...**

   **Precisamos mudar...**
   ```
   - Use a data de hoje no formato `AAAA-MM-DD`.
   - Se uma seção não tiver conteúdo real, escreva literalmente
     "nada a registrar" — não invente conteúdo para preencher espaço. A
     ausência de atrito também é informação.
   - Em "Precisamos mudar", todo item real precisa apontar para onde a
     mudança será encaminhada (ex.: "encaminhamento: atualizar ADR-0013" ou
     "encaminhamento: nova SPEC para X").
   - Linke a própria SPEC e ADRs relevantes usando o mesmo estilo de link
     relativo já usado no arquivo (ex.: `[SPEC-0012](specs/SPEC-0012-...md)`).

4. **Insira a entrada no topo do Registro** (logo após o cabeçalho
   "# Registro", antes da entrada mais recente existente) — nunca no fim do
   arquivo e nunca substituindo uma entrada existente.

5. **Se "Precisamos mudar" gerou encaminhamentos**, não pare na entrada do
   Lessons Learned: crie de fato o ADR, a atualização de documentação, ou a
   nova SPEC apontada — ou confirme com o usuário quem fará isso e quando.
   Um encaminhamento sem dono é o mesmo que não ter sido registrado.

6. Mostre a entrada para revisão antes de considerar a SPEC `Done`.
