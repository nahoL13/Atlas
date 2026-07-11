# Lessons Learned

> **Project Atlas — Registro de Lições Aprendidas**

Version: 1.0

---

# Objetivo

Este documento acumula o conhecimento adquirido ao final de cada SPEC.

Seu propósito é impedir que descobertas, acertos e atritos se percam com o tempo.

O que parece óbvio ao concluir uma SPEC não estará na memória de ninguém — humano ou IA — meses depois.

---

# Regras de Uso

1. Registrar as lições é obrigatório ao concluir uma SPEC e faz parte da Definition of Done.
2. Novas entradas são adicionadas no topo do Registro; entradas antigas nunca são reescritas.
3. Lições são fatos observados durante a implementação, não opiniões.
4. Todo item listado em "Precisamos mudar" deve gerar um encaminhamento: um ADR em `docs/06-adr/`, uma atualização de documentação ou uma nova SPEC. Nenhuma mudança necessária deve morrer neste arquivo.

Uma lição não é uma decisão.

Quando uma lição exigir mudança estrutural, a decisão correspondente deverá ser registrada como ADR.

---

# Formato da Entrada

Toda entrada segue o modelo abaixo.

```text
## SPEC-XXXX — Título (AAAA-MM-DD)

Descobrimos que...

A arquitetura ajudou porque...

A arquitetura atrapalhou porque...

Precisamos mudar... (encaminhamento: ADR, documentação ou nova SPEC)
```

Quando uma seção não tiver conteúdo, registre "nada a registrar".

A ausência de atrito também é informação.

---

# Registro

## SPEC-0001 — Workspace Bootstrap (2026-07-10)

**Descobrimos que...**

A máquina não tinha pnpm; o corepack ativou a última estável (11.11.0), um major acima do que o plano assumia (10.x).

O pnpm exige a flag `-w` para adicionar dependências na raiz do workspace (guard `ERR_PNPM_ADDING_TO_ROOT`).

"Instalar a última estável" trouxe o TypeScript 7.0.2 (compilador nativo), que o typescript-eslint 8.63 ainda não suporta (TypeError em `typescript-estree`); o `pnpm typecheck` puro funcionava com o TS 7 — a quebra era só no lint. Pinamos `typescript@^5` (5.9.3) e tudo ficou verde.

`pnpm format` sem proteção reformataria toda a documentação manuscrita; `**/*.md` no `.prettierignore` resolveu sem custo.

**A arquitetura ajudou porque...**

O plano previa explicitamente o risco de incompatibilidade do TS 7 e o fallback (`typescript@^5`), então o problema foi resolvido em um passo, sem parar a execução.

Critérios de aceitação executáveis (cinco comandos na raiz) tornaram a Definition of Done objetiva e verificável.

**A arquitetura atrapalhou porque...**

Nada a registrar — nenhum componente arquitetural em uso ainda nesta SPEC.

**Precisamos mudar...**

Voltar o TypeScript para a série 7 quando o typescript-eslint suportar o compilador nativo (encaminhamento: verificação registrada como observação da SPEC-0002; remover a nota de pin do CLAUDE.md quando resolvido).

Planos devem verificar versões reais na máquina em vez de assumi-las (encaminhamento: PLAN-0001 corrigido nesta entrega; prática incorporada aos próximos planos).
