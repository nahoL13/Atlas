---
description: Roda os quatro gates obrigatórios do Atlas (lint, typecheck, test, format:check) e reporta o resultado.
---

Rode, na raiz do repositório, nesta ordem, parando no primeiro que falhar:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm format:check`

Reporte um resumo curto (passou/falhou por gate). Se algum falhar, mostre
o trecho relevante do erro e pare — não tente corrigir automaticamente
sem que o usuário peça.
